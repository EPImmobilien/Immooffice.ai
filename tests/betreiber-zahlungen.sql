-- Betreiber, Schritt 6 (fork_74): Mahnstufe und Tage bis Sperre aus Abo und
-- Abbild; echte Gebuehr schlaegt die Schaetzung; finanzen darf lesen,
-- support nicht; ein chef sieht nur die eigenen Rechnungen.
\set ON_ERROR_STOP on
set client_min_messages to warning;
create temp table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temp table wer (was text, wert uuid);

do $$
declare a uuid; b uuid; uf uuid := gen_random_uuid(); us uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
begin
  update public.plattform_werte set wert = '14'::jsonb where schluessel = 'zahlung_frist_tage';
  insert into public.plattform_tarife (schluessel, name, preis_monat_cent, preis_jahr_cent, ist_zusatznutzer)
    values ('za_tarif', 'ZA', 3000, 30000, false) on conflict (schluessel) do nothing;
  insert into public.mandanten (name, slug) values ('ZA Haus A', 'za-a') returning id into a;
  insert into public.mandanten (name, slug) values ('ZA Haus B', 'za-b') returning id into b;
  insert into public.mandant_abo (mandant_id, tarif, intervall, status, zahlung_fehler_seit, stripe_customer_id)
    values (a, 'za_tarif', 'monat', 'zahlung_offen', now() - interval '4 days', 'cus_a'),
           (b, 'za_tarif', 'monat', 'aktiv', null, 'cus_b');
  insert into public.stripe_rechnungen (id, mandant_id, art, nummer, status, netto_cent, steuer_cent, brutto_cent, bezahlt_cent, offen_cent, erstellt_am, versuche)
    values ('in_a1', a, 'abo', 'R-1', 'open', 3000, 570, 3570, 0, 3570, now() - interval '4 days', 2),
           ('in_b1', b, 'abo', 'R-2', 'paid', 3000, 570, 3570, 3570, 0, now() - interval '2 days', 1);
  update public.stripe_rechnungen set bezahlt_am = now() - interval '2 days', gebuehr_cent = 77 where id = 'in_b1';
  insert into auth.users (id, email) values (uf, 'f@za.example'), (us, 's@za.example'), (uc, 'c@za.example');
  insert into public.profiles (id, name, email, role, mandant_id) values
    (uf, 'Finanzen', 'f@za.example', 'mitarbeiter', b), (us, 'Support', 's@za.example', 'mitarbeiter', b), (uc, 'Chef A', 'c@za.example', 'chef', a);
  insert into public.plattform_admins (benutzer_id, rolle, aktiv, notiz) values (uf, 'finanzen', true, 'P'), (us, 'support', true, 'P');
  insert into wer values ('a', a), ('b', b), ('uf', uf), ('us', us), ('uc', uc);
end $$;

do $$
declare v uuid := (select wert from wer where was='uf'); r jsonb; f jsonb; k jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select public.plattform_zahlungen(current_date - 30, current_date) into r;
  select public.plattform_kosten(current_date - 30, current_date) into k;
  reset role;
  select x into f from jsonb_array_elements(r->'fehlgeschlagen') x where (x->>'mandant_id')::uuid = (select wert from wer where was='a');
  insert into befund (pruefung, bestanden, bemerkung) values
    ('finanzen: fehlgeschlagene Zahlung von A gelistet', f is not null, ''),
    ('Mahnstufe = Versuche (2)', (f->>'mahnstufe')::int = 2, f->>'mahnstufe'),
    ('Tage bis Sperre = 14 - 4 = 10', (f->>'tage_bis_sperre')::int = 10, f->>'tage_bis_sperre'),
    ('offener Betrag 35,70', (f->>'offen_cent')::int = 3570, f->>'offen_cent'),
    ('Summen: Gebuehren 0,77 gespiegelt', (r->'summen'->>'gebuehren_cent')::int = 77, r->'summen'->>'gebuehren_cent'),
    ('Kosten: Gebuehr ist jetzt ECHT, nicht geschaetzt', (k->>'gebuehr_geschaetzt')::boolean = false, k->>'gebuehr_geschaetzt'),
    ('Kosten: Gebuehr von B = 77', exists (select 1 from jsonb_array_elements(k->'je_mandant') x
        where (x->>'mandant_id')::uuid = (select wert from wer where was='b') and (x->>'gebuehr_cent')::int = 77), '');
end $$;

do $$
declare v uuid := (select wert from wer where was='us'); ok boolean := false; r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  begin select public.plattform_zahlungen(current_date - 30, current_date) into r;
  exception when others then ok := sqlstate = '42501'; end;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values ('support: Zahlungen verweigert', ok, '');
end $$;

do $$
declare v uuid := (select wert from wer where was='uc'); n int; m int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  select count(*) into n from public.stripe_rechnungen;
  select count(*) into m from public.stripe_abgleich;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('chef A sieht nur seine Rechnung (1)', n = 1, n::text),
    ('chef sieht keinen Abgleich', m = 0, m::text);
end $$;

-- Aufraeumen
delete from public.plattform_admins where benutzer_id in (select wert from wer where was in ('uf','us'));
delete from public.stripe_rechnungen where id in ('in_a1', 'in_b1');
delete from public.mandanten where slug like 'za-%';
delete from public.profiles where id in (select wert from wer where was in ('uf','us','uc'));
delete from auth.users where id in (select wert from wer where was in ('uf','us','uc'));
delete from public.plattform_tarife where schluessel = 'za_tarif';

select nr, case when bestanden then 'ok' else 'FEHLER' end as ergebnis, pruefung, bemerkung from befund order by nr;
do $$
declare n int;
begin
  select count(*) into n from befund where not bestanden;
  if n > 0 then raise exception 'Betreiber-Zahlungen: % Pruefung(en) nicht bestanden.', n; end if;
  raise notice 'Betreiber-Zahlungen: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
