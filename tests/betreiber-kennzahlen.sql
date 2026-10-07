-- Betreiber, Schritt 3 (fork_70): stimmt der MRR mit der Handrechnung
-- ueberein — Jahresabo durch zwoelf, Zusatznutzer dazu, Gruenderrabatt ab,
-- Test und Pakete nicht? Und schreibt der Schnappschuss, was er soll?
\set ON_ERROR_STOP on
set client_min_messages to warning;
create temp table befund (nr serial, pruefung text, bestanden boolean, bemerkung text);
create temp table wer (was text, wert uuid);

do $$
declare a uuid; b uuid; c uuid; d uuid;
begin
  -- Katalog fuer die Probe: ein Tarif 100,00 / 1.080,00 im Jahr, Zusatznutzer 10,00 / 108,00.
  insert into public.plattform_tarife (schluessel, name, preis_monat_cent, preis_jahr_cent, ist_zusatznutzer)
    values ('kz_tarif', 'KZ-Tarif', 10000, 108000, false)
    on conflict (schluessel) do update set preis_monat_cent = 10000, preis_jahr_cent = 108000;
  update public.plattform_werte set wert = '1000'::jsonb where schluessel = 'gruender_rabatt_cent';
  update public.plattform_werte set wert = '"kz_tarif"'::jsonb where schluessel = 'gruender_tarif';

  insert into public.mandanten (name, slug) values ('KZ Monat', 'kz-a') returning id into a;
  insert into public.mandanten (name, slug) values ('KZ Jahr', 'kz-b') returning id into b;
  insert into public.mandanten (name, slug) values ('KZ Test', 'kz-c') returning id into c;
  insert into public.mandanten (name, slug) values ('KZ Gruender', 'kz-d') returning id into d;
  insert into public.mandant_abo (mandant_id, tarif, intervall, status, zusatznutzer, gruenderpreis) values
    (a, 'kz_tarif', 'monat', 'aktiv', 0, false),   -- 100,00
    (b, 'kz_tarif', 'jahr',  'aktiv', 2, false),   -- 1080/12 = 90,00 + 2 Zusatznutzer
    (c, 'kz_tarif', 'monat', 'test',  0, false),   -- zaehlt nicht
    (d, 'kz_tarif', 'monat', 'aktiv', 0, true);    -- 100,00 - 10,00
  insert into wer values ('a', a), ('b', b), ('c', c), ('d', d);
end $$;

do $$
declare soll int; ist int; addon_jahr int; a int; b int; d int;
begin
  select coalesce(round(preis_jahr_cent / 12.0), 0)::int into addon_jahr from public.plattform_tarife where ist_zusatznutzer limit 1;
  soll := 10000 + (9000 + 2 * addon_jahr) + 0 + (10000 - 1000);
  select coalesce(sum(mrr_cent), 0) into ist from public.plattform_mrr_je_mandant()
   where mandant_id in (select wert from wer);
  select mrr_cent into a from public.plattform_mrr_je_mandant() where mandant_id = (select wert from wer where was='a');
  select mrr_cent into b from public.plattform_mrr_je_mandant() where mandant_id = (select wert from wer where was='b');
  select mrr_cent into d from public.plattform_mrr_je_mandant() where mandant_id = (select wert from wer where was='d');
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Monatsabo zaehlt voll (100,00)', a = 10000, a::text),
    ('Jahresabo zaehlt mit einem Zwoelftel plus Zusatznutzer', b = 9000 + 2 * addon_jahr, b::text || ' (Zusatznutzer je ' || addon_jahr || ')'),
    ('Gruenderpreis zieht den Rabatt ab (90,00)', d = 9000, d::text),
    ('Testkonto zaehlt nicht', (select mrr_cent from public.plattform_mrr_je_mandant() where mandant_id = (select wert from wer where was='c')) = 0, ''),
    ('Summe der Probe = Handrechnung', ist = soll, ist::text || ' vs ' || soll::text);
end $$;

-- Der Schnappschuss schreibt je Mandant eine Zeile und die Summen.
do $$
declare n int; s numeric; z numeric;
begin
  perform public.plattform_kennzahlen_schreiben(current_date);
  select count(*) into n from public.plattform_mandanten_tag where datum = current_date and mandant_id in (select wert from wer);
  select wert into s from public.plattform_kennzahlen_tag where datum = current_date and kennzahl = 'mrr_cent' and tarif = '';
  select wert into z from public.plattform_kennzahlen_tag where datum = current_date and kennzahl = 'zahlende' and tarif = 'kz_tarif';
  insert into befund (pruefung, bestanden, bemerkung) values
    ('Schnappschuss: vier Mandanten der Probe geschrieben', n = 4, n::text),
    ('Schnappschuss: MRR gesamt steht da', s is not null and s >= 28000, coalesce(s::text, 'null')),
    ('Schnappschuss: drei Zahlende im Probetarif', z = 3, coalesce(z::text, 'null')),
    ('Cron-Job angemeldet', exists (select 1 from cron.job where jobname = 'plattform-kennzahlen-naechtlich'), '');
end $$;

-- Ein chef bekommt die Rechnung nicht.
do $$
declare v uuid := gen_random_uuid(); ok boolean := false; n int;
begin
  insert into auth.users (id, email) values (v, 'chef@kz.example');
  insert into public.profiles (id, name, email, role, mandant_id) values (v, 'Chef', 'chef@kz.example', 'chef', (select wert from wer where was='a'));
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  set local role authenticated;
  begin
    select count(*) into n from public.plattform_mrr_je_mandant();
  exception when others then ok := sqlstate = '42501';
  end;
  select count(*) into n from public.plattform_kennzahlen_tag;
  reset role;
  insert into befund (pruefung, bestanden, bemerkung) values
    ('chef: MRR-Rechnung verweigert', ok, ''),
    ('chef: Kennzahlentabelle leer', n = 0, n::text);
  delete from public.profiles where id = v; delete from auth.users where id = v;
end $$;

-- Aufraeumen: der Probetarif und die Werte zurueck; die Probemandanten bleiben
-- (Schnappschuss-Zeilen haengen per Kaskade an ihnen und gehen mit).
delete from public.mandanten where slug like 'kz-%';
delete from public.plattform_tarife where schluessel = 'kz_tarif';
update public.plattform_werte set wert = '"starter"'::jsonb where schluessel = 'gruender_tarif';

select nr, case when bestanden then 'ok' else 'FEHLER' end as ergebnis, pruefung, bemerkung from befund order by nr;
do $$
declare n int;
begin
  select count(*) into n from befund where not bestanden;
  if n > 0 then raise exception 'Betreiber-Kennzahlen: % Pruefung(en) nicht bestanden.', n; end if;
  raise notice 'Betreiber-Kennzahlen: alle % Pruefungen bestanden.', (select count(*) from befund);
end $$;
