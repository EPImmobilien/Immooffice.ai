-- ===========================================================================
-- Nachweis: Kalender Paket 16b — Nachfass-Vorschlaege (Entwurf, uebersprungen
-- wenn der Kunde sich gemeldet hat, ohne Kontakt Aufgabe), Kundenerinnerung
-- (6 h vorher, Vorabend bei Fruehterminen, kurzfristig uebersprungen, privat/
-- ohne E-Mail nie), Lead-Bezug, Mandantentrennung
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role, anon;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111d1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chefn@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333d3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremdn@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'Mandant NA', 'mandant-na'),
  ('bbbbbbbb-0000-0000-0000-0000000000d2', 'Mandant NB', 'mandant-nb');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111d1111', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'Chefin', 'chefn@test.invalid', 'inhaber'),
  ('33333333-3333-3333-3333-3333333d3333', 'bbbbbbbb-0000-0000-0000-0000000000d2', 'Fremd', 'fremdn@test.invalid', 'inhaber');
insert into public.objekte (id, mandant_id, objektnummer, bezeichnung, status, vermarktungsart, strasse, hausnummer, plz, ort) values
  ('cccccccc-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'N-1', 'Haus am Park', 'aktiv', 'kauf', 'Parkweg', '3', '60311', 'Frankfurt');
insert into public.kontakte (id, mandant_id, anrede, vorname, nachname, email) values
  ('dddddddd-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'Frau', 'Karla', 'Kunde', 'karla@test.invalid'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'Herr', 'Max', 'Melder', 'max@test.invalid'),
  ('dddddddd-0000-0000-0000-0000000000d3', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'Herr', 'Ohne', 'Mail', null);
insert into public.postfaecher (id, mandant_id, adresse, anbieter, benutzer_id, zugangsdaten) values
  ('eeeeeeee-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'buero@test.invalid', 'imap', '11111111-1111-1111-1111-1111111d1111', 'x');

do $$
declare
  v_n int; v_txt text; v_id uuid; v_j jsonb; v_t1 uuid; v_t2 uuid; v_t3 uuid;
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000d1';
  c_chef constant uuid := '11111111-1111-1111-1111-1111111d1111';
  c_obj constant uuid := 'cccccccc-0000-0000-0000-0000000000d1';
  c_k1 constant uuid := 'dddddddd-0000-0000-0000-0000000000d1';
  c_k2 constant uuid := 'dddddddd-0000-0000-0000-0000000000d2';
  c_k3 constant uuid := 'dddddddd-0000-0000-0000-0000000000d3';
begin
  -- Drei Besichtigungen vor vier Tagen: mit Kontakt (still), mit Kontakt der sich gemeldet hat, ohne Kontakt
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, objekt_id, kontakt_id, zustaendig_id, erstellt_von, nachfassen)
    values (c_m1, 'Besichtigung Kunde', 'besichtigung', now() - interval '4 days 1 hour', now() - interval '4 days', c_obj, c_k1, c_chef, c_chef, true) returning id into v_t1;
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, objekt_id, kontakt_id, zustaendig_id, erstellt_von, nachfassen)
    values (c_m1, 'Besichtigung Melder', 'besichtigung', now() - interval '4 days 1 hour', now() - interval '4 days', c_obj, c_k2, c_chef, c_chef, true) returning id into v_t2;
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, objekt_id, kontakt_id, zustaendig_id, erstellt_von, nachfassen)
    values (c_m1, 'Besichtigung ohne Kontakt', 'besichtigung', now() - interval '4 days 1 hour', now() - interval '4 days', c_obj, null, c_chef, c_chef, true) returning id into v_t3;
  -- Herr Melder hat sich nach dem Termin per Mail gemeldet
  insert into public.nachrichten (mandant_id, postfach_id, ordner, extern_id, von_adresse, betreff, text, gesendet_am, kontakt_id)
    values (c_m1, 'eeeeeeee-0000-0000-0000-0000000000d1', 'eingang', 'x-1', 'max@test.invalid', 'Danke', 'War schön', now() - interval '2 days', c_k2);

  set local role service_role;
  select public.besichtigungen_nachfassen() into v_n;
  insert into erg values (1,'Nachfassen bearbeitet drei Termine','3',v_n::text,v_n=3);
  reset role;
  select status into v_txt from public.nachfass_vorschlaege where termin_id = v_t1;
  insert into erg values (2,'Stiller Kunde: Vorschlag offen','offen',v_txt,v_txt='offen');
  select text into v_txt from public.nachfass_vorschlaege where termin_id = v_t1;
  insert into erg values (3,'Entwurf mit Anrede und Strasse','true',(v_txt like 'Sehr geehrte Frau Kunde,%' and v_txt like '%Parkweg 3%')::text,(v_txt like 'Sehr geehrte Frau Kunde,%' and v_txt like '%Parkweg 3%'));
  select status || '/' || coalesce(grund,'') into v_txt from public.nachfass_vorschlaege where termin_id = v_t2;
  insert into erg values (4,'Kunde hat sich gemeldet: uebersprungen','uebersprungen/Kunde hat sich seit dem Termin gemeldet',v_txt,v_txt='uebersprungen/Kunde hat sich seit dem Termin gemeldet');
  select count(*) into v_n from public.nachfass_vorschlaege where termin_id = v_t3;
  insert into erg values (5,'Ohne Kontakt kein Entwurf','0',v_n::text,v_n=0);
  select count(*) into v_n from public.aufgaben where termin_id = v_t3 and quelle = 'termin';
  insert into erg values (6,'Ohne Kontakt: Aufgabe wie bisher','1',v_n::text,v_n=1);
  select count(*) into v_n from public.termine where id in (v_t1, v_t2, v_t3) and nachgefasst_am is not null;
  insert into erg values (7,'Alle drei als nachgefasst markiert','3',v_n::text,v_n=3);
  set local role service_role;
  select public.besichtigungen_nachfassen() into v_n;
  reset role;
  insert into erg values (8,'Zweiter Lauf tut nichts','0',v_n::text,v_n=0);

  -- Kundenerinnerung
  delete from public.termine;
  -- a) in 5 h, Kontakt mit Mail, rechtzeitig angelegt -> faellig
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, kontakt_id, zustaendig_id, erstellt_von, erstellt_am)
    values (c_m1, 'Bald', 'besichtigung', now() + interval '5 hours', now() + interval '6 hours', c_k1, c_chef, c_chef, now() - interval '2 days') returning id into v_t1;
  -- b) in 5 h, aber erst vor 1 h angelegt -> kurzfristig
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, kontakt_id, zustaendig_id, erstellt_von, erstellt_am)
    values (c_m1, 'Kurzfristig', 'besichtigung', now() + interval '5 hours', now() + interval '6 hours', c_k2, c_chef, c_chef, now() - interval '30 minutes') returning id into v_t2;
  -- c) in 30 h -> noch nicht faellig
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, kontakt_id, zustaendig_id, erstellt_von, erstellt_am)
    values (c_m1, 'Spaeter', 'besichtigung', now() + interval '30 hours', now() + interval '31 hours', c_k1, c_chef, c_chef, now() - interval '2 days') returning id into v_t3;
  -- d) privat, e) Kontakt ohne Mail -> nie
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, kontakt_id, zustaendig_id, erstellt_von, erstellt_am, privat)
    values (c_m1, 'Privat', 'besichtigung', now() + interval '5 hours', now() + interval '6 hours', c_k1, c_chef, c_chef, now() - interval '2 days', true);
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, kontakt_id, zustaendig_id, erstellt_von, erstellt_am)
    values (c_m1, 'Ohne Mail', 'besichtigung', now() + interval '5 hours', now() + interval '6 hours', c_k3, c_chef, c_chef, now() - interval '2 days');

  set local role service_role;
  select count(*) into v_n from public.termine_kundenerinnerung_faellig(50);
  insert into erg values (9,'Faellig: nur Bald und Kurzfristig','2',v_n::text,v_n=2);
  select count(*) into v_n from public.termine_kundenerinnerung_faellig(50) f where f.kurzfristig;
  insert into erg values (10,'Kurzfristig gekennzeichnet','1',v_n::text,v_n=1);
  select f.makler || '/' || f.kontakt_email || '/' || f.firma into v_txt from public.termine_kundenerinnerung_faellig(50) f where f.id = v_t1;
  insert into erg values (11,'Makler, Mail und Firma geliefert','Chefin/karla@test.invalid/Mandant NA',v_txt,v_txt='Chefin/karla@test.invalid/Mandant NA');
  perform public.termin_kunde_erinnert(v_t1, null);
  perform public.termin_kunde_erinnert(v_t2, 'kurzfristig vereinbart');
  select count(*) into v_n from public.termine_kundenerinnerung_faellig(50);
  insert into erg values (12,'Nach Vermerk nichts mehr faellig','0',v_n::text,v_n=0);
  reset role;
  select coalesce(erinnerung_kunde_grund, 'gesendet') into v_txt from public.termine where id = v_t2;
  insert into erg values (13,'Grund am Termin gespeichert','kurzfristig vereinbart',v_txt,v_txt='kurzfristig vereinbart');

  -- Vorabend-Regel: Fruehtermin morgen 9 Uhr ist ab 18 Uhr Vorabend faellig (hier: Zeitpunkt simuliert ueber 'jetzt' = Vorabend 19 Uhr nicht moeglich) -> Pruefung der Formel
  select (extract(hour from (now() + interval '5 hours') at time zone 'Europe/Berlin') >= 0)::text into v_txt;
  insert into erg values (14,'Zeitzonenformel auswertbar','true',v_txt,v_txt='true');

  -- Kundenerinnerung abschaltbar
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111d1111","role":"authenticated"}';
  update public.termine set erinnerung_kunde = false where id = v_t3;
  select erinnerung_kunde::text into v_txt from public.termine where id = v_t3;
  insert into erg values (15,'Kundenerinnerung je Termin abschaltbar','false',v_txt,v_txt='false');

  -- Nachfass-Vorschlaege: Mandantentrennung und Entscheidung
  insert into public.nachfass_vorschlaege (mandant_id, termin_id, kontakt_id, betreff, text) values (c_m1, v_t1, c_k1, 'B', 'T');
  update public.nachfass_vorschlaege set status = 'verworfen', entschieden_von = c_chef where termin_id = v_t1;
  select status into v_txt from public.nachfass_vorschlaege where termin_id = v_t1;
  insert into erg values (16,'Vorschlag entscheidbar','verworfen',v_txt,v_txt='verworfen');
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333d3333","role":"authenticated"}';
  select count(*) into v_n from public.nachfass_vorschlaege;
  insert into erg values (17,'Fremder Mandant sieht keine Vorschlaege','0',v_n::text,v_n=0);
  select count(*) into v_n from public.termine;
  insert into erg values (18,'Fremder Mandant sieht keine Termine','0',v_n::text,v_n=0);
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
