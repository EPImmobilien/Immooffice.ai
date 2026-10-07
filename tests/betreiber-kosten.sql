-- Betreiber, Schritt 4 (fork_72): Deckungsbeitrag = Erloes - KI - Gebuehr
-- (geschaetzt) - Pauschale; Ist-Kosten je Credit; Warnliste; Fixkosten nur
-- fuer owner/admin.
\set ON_ERROR_STOP on
set client_min_messages to warning;
create temp table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temp table wer (was text, wert uuid);

do $$
declare m uuid; v_admin uuid := gen_random_uuid(); v_support uuid := gen_random_uuid(); vg uuid := gen_random_uuid();
begin
  insert into public.plattform_tarife (schluessel, name, preis_monat_cent, preis_jahr_cent, ist_zusatznutzer)
    values ('ko_tarif', 'KO-Tarif', 3000, 30000, false) on conflict (schluessel) do update set preis_monat_cent = 3000;
  update public.plattform_werte set wert = '150'::jsonb where schluessel = 'infrastruktur_pauschale_cent';
  update public.plattform_werte set wert = '0'::jsonb where schluessel = 'stripe_gebuehr_prozent';
  update public.plattform_werte set wert = '0'::jsonb where schluessel = 'stripe_gebuehr_fix_cent';
  update public.plattform_werte set wert = '30'::jsonb where schluessel = 'kosten_warnung_prozent';
  insert into public.mandanten (name, slug) values ('Kostenhaus', 'ko-x') returning id into m;
  insert into public.mandant_abo (mandant_id, tarif, intervall, status) values (m, 'ko_tarif', 'monat', 'aktiv');
  insert into auth.users (id, email) values (v_admin, 'admin@ko.example'), (v_support, 'support@ko.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (v_admin, 'Admin', 'admin@ko.example', 'chef', m), (v_support, 'Support', 'support@ko.example', 'mitarbeiter', m);
  insert into public.plattform_admins (benutzer_id, rolle, aktiv, notiz) values
    (v_admin, 'admin', true, 'Pruefung'), (v_support, 'support', true, 'Pruefung');
  -- 30 Tage, Erloes 30,00 EUR. KI-Kosten 12,00 EUR (= 40 % > 30 % -> Warnung), 100 Credits.
  insert into public.credit_buchungen (vorgang_id, mandant_id, aktion, credits, status, ki_kosten_eur, anbieter, modell, zeitpunkt, abgeschlossen_am)
    values (vg, m, 'ki_text', 100, 'gebucht', 12.0, 'anthropic', 'claude-probe', current_date - 5, now());
  insert into wer values ('m', m), ('admin', v_admin), ('support', v_support);
end $$;

do $$
declare m uuid := (select wert from wer where was='m'); r jsonb; jm jsonb; ja jsonb;
begin
  select public.plattform_kosten(current_date - 29, current_date) into r;
  select x into jm from jsonb_array_elements(r->'je_mandant') x where (x->>'mandant_id')::uuid = m;
  select x into ja from jsonb_array_elements(r->'je_aktion') x where x->>'aktion' = 'ki_text';
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Erloes 30 Tage = 30,00 (MRR anteilig)', (jm->>'erloes_cent')::int = 3000, jm->>'erloes_cent'),
    ('KI-Kosten 12,00', (jm->>'ki_eur')::numeric = 12.0, jm->>'ki_eur'),
    ('Pauschale 1,50', (jm->>'pauschale_cent')::int = 150, jm->>'pauschale_cent'),
    ('Deckung = 3000 - 1200 - 0 - 150 = 1650', (jm->>'deckung_cent')::int = 1650, jm->>'deckung_cent'),
    ('Warnliste: 40 % KI-Kosten am Erloes liegen ueber 30 %', (jm->>'ueber_grenze')::boolean, ''),
    ('Ist-Kosten je Credit = 0,12', (ja->>'ist_je_credit')::numeric = 0.12, ja->>'ist_je_credit'),
    ('Anbieter/Modell erscheinen', exists (select 1 from jsonb_array_elements(r->'je_anbieter') x where x->>'modell' = 'claude-probe'), ''),
    ('Die Gebuehr ist als Schaetzung gekennzeichnet', (r->>'gebuehr_geschaetzt')::boolean, '');
end $$;

-- Fixkosten: support darf nicht, admin darf.
do $$
declare v uuid := (select wert from wer where was='support'); n int; ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  begin
    insert into public.plattform_fixkosten (bezeichnung, betrag_cent) values ('Probe-Hosting', 1000);
  exception when others then ok := sqlstate = '42501';
  end;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values ('support legt keine Fixkosten an', ok, '');
end $$;
do $$
declare v uuid := (select wert from wer where was='admin'); r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  insert into public.plattform_fixkosten (bezeichnung, betrag_cent) values ('Probe-Hosting', 3000);
  select public.plattform_kosten(current_date - 29, current_date) into r;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('admin legt Fixkosten an, und sie zaehlen (30 Tage = 30,00)', (r->>'fixkosten_cent')::int = 3000, r->>'fixkosten_cent');
end $$;

-- Aufraeumen (Ledger und Mandant bleiben: append-only).
delete from public.plattform_fixkosten where bezeichnung = 'Probe-Hosting';
delete from public.plattform_admins where benutzer_id in (select wert from wer where was in ('admin','support'));
update public.plattform_werte set wert = '1.5'::jsonb where schluessel = 'stripe_gebuehr_prozent';
update public.plattform_werte set wert = '25'::jsonb where schluessel = 'stripe_gebuehr_fix_cent';

select nr, case when bestanden then 'ok' else 'FEHLER' end as ergebnis, pruefung, bemerkung from befund order by nr;
do $$
declare n int;
begin
  select count(*) into n from befund where not bestanden;
  if n > 0 then raise exception 'Betreiber-Kosten: % Pruefung(en) nicht bestanden.', n; end if;
  raise notice 'Betreiber-Kosten: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
