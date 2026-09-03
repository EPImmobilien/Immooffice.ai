-- ===========================================================================
-- Nachweis: Vermietung — Mietanfragen, Selbstauskunft (oeffentlich),
-- Mietvertraege, Reservierungen mit Objektstatus, Antwortvorlagen,
-- Mandantentrennung
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role, anon;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111f1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chefm@test.invalid','x',now(),now(),now()),
  ('22222222-2222-2222-2222-2222222f2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','maklerm@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333f3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremdm@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'Mandant MA', 'mandant-ma'),
  ('bbbbbbbb-0000-0000-0000-0000000000f2', 'Mandant MB', 'mandant-mb');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111f1111', 'aaaaaaaa-0000-0000-0000-0000000000f1', 'Chefin', 'chefm@test.invalid', 'inhaber'),
  ('22222222-2222-2222-2222-2222222f2222', 'aaaaaaaa-0000-0000-0000-0000000000f1', 'Makler', 'maklerm@test.invalid', 'makler'),
  ('33333333-3333-3333-3333-3333333f3333', 'bbbbbbbb-0000-0000-0000-0000000000f2', 'Fremd', 'fremdm@test.invalid', 'inhaber');
insert into public.objekte (id, mandant_id, objektnummer, bezeichnung, status, vermarktungsart, kaltmiete) values
  ('cccccccc-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-0000000000f1', 'M-1', 'Wohnung A', 'aktiv', 'miete', 900),
  ('cccccccc-0000-0000-0000-0000000000f2', 'bbbbbbbb-0000-0000-0000-0000000000f2', 'M-2', 'Wohnung B', 'aktiv', 'miete', 700);
insert into public.selbstauskunft_links (mandant_id, objekt_id, bezeichnung, token) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'cccccccc-0000-0000-0000-0000000000f1', 'Formular A', 'selbstauskunfttokenaaaa0001');

do $$
declare
  v_fehler text; v_txt text; v_n int; v_id uuid; v_j jsonb; v_r uuid;
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000f1';
  c_m2 constant uuid := 'bbbbbbbb-0000-0000-0000-0000000000f2';
  c_o1 constant uuid := 'cccccccc-0000-0000-0000-0000000000f1';
  c_o2 constant uuid := 'cccccccc-0000-0000-0000-0000000000f2';
begin
  -- --- Oeffentliche Selbstauskunft -------------------------------------------------
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  select public.selbstauskunft_oeffnen('selbstauskunfttokenaaaa0001') into v_j;
  insert into erg values (1,'Formular oeffnet mit Objektangaben','Wohnung A',v_j->'objekt'->>'bezeichnung',v_j->'objekt'->>'bezeichnung'='Wohnung A');
  select public.selbstauskunft_oeffnen('gibtesnicht0000000000') ->> 'zustand' into v_txt;
  insert into erg values (2,'Unbekannter Token','unbekannt',v_txt,v_txt='unbekannt');
  select public.selbstauskunft_einreichen('selbstauskunfttokenaaaa0001',
    '{"nachname":"Muster","vorname":"Sabine","email":"sabine@test.invalid","einkommen_netto":"3200,50","schufa_vorhanden":"true","datenschutz":"true","personen_anzahl":"2","einzug_ab":"2026-11-01"}'::jsonb) into v_j;
  insert into erg values (3,'Selbstauskunft eingereicht','true',v_j->>'ok',(v_j->>'ok')='true');
  select public.selbstauskunft_einreichen('selbstauskunfttokenaaaa0001', '{"nachname":"Ohne","email":"x@test.invalid","datenschutz":"false"}'::jsonb) ->> 'grund' into v_txt;
  insert into erg values (4,'Ohne Datenschutz-Einwilligung abgewiesen','datenschutz',v_txt,v_txt='datenschutz');
  select public.selbstauskunft_einreichen('selbstauskunfttokenaaaa0001', '{"nachname":"Kaputt","email":"keine-mail","datenschutz":"true"}'::jsonb) ->> 'grund' into v_txt;
  insert into erg values (5,'Ungueltige Adresse abgewiesen','eingabe',v_txt,v_txt='eingabe');
  begin
    select count(*) into v_n from public.mietanfragen;
    v_fehler := v_n::text;
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (6,'Anonym sieht keine Anfragen','0/abgewiesen',v_fehler,v_fehler in ('0','abgewiesen'));

  -- --- Makler sieht und bearbeitet Anfragen -------------------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222f2222","role":"authenticated"}';
  select count(*) into v_n from public.mietanfragen where quelle = 'selbstauskunft';
  insert into erg values (7,'Makler sieht die eingereichte Anfrage','1',v_n::text,v_n=1);
  select einkommen_netto::text || '/' || personen_anzahl::text || '/' || einzug_ab::text into v_txt from public.mietanfragen limit 1;
  insert into erg values (8,'Felder korrekt uebernommen','3200.50/2/2026-11-01',v_txt,v_txt='3200.50/2/2026-11-01');
  select id into v_id from public.mietanfragen limit 1;
  update public.mietanfragen set status = 'besichtigung_geplant', bewertung = 4, besichtigung_am = now() + interval '2 days' where id = v_id;
  select status into v_txt from public.mietanfragen where id = v_id;
  insert into erg values (9,'Status und Bewertung geaendert','besichtigung_geplant',v_txt,v_txt='besichtigung_geplant');
  begin
    update public.mietanfragen set status = 'egal' where id = v_id;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (10,'Unbekannter Status abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.mietanfragen (mandant_id, objekt_id, nachname) values (c_m1, c_o2, 'Fremdobjekt');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (11,'Anfrage zu fremdem Objekt abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Mietvertrag ------------------------------------------------------------------
  insert into public.mietvertraege (mandant_id, objekt_id, mietanfrage_id, bezeichnung, grundmiete, bk_kalt, bk_warm, stellplatz, kaution)
  values (c_m1, c_o1, v_id, 'Mietvertrag Wohnung A', 900, 150, 100, 50, 2700) returning id into v_r;
  select gesamtmiete::text into v_txt from public.mietvertraege where id = v_r;
  insert into erg values (12,'Gesamtmiete wird berechnet','1200.00',v_txt,v_txt='1200.00');
  begin
    update public.mietvertraege set kuendigungsausschluss_monate = 60 where id = v_r;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (13,'Kuendigungsausschluss hoechstens 48 Monate','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Reservierung und Objektstatus ------------------------------------------------
  insert into public.reservierungen (mandant_id, objekt_id, status, reserviert_bis, gebuehr) values (c_m1, c_o1, 'aktiv', current_date + 14, 500) returning id into v_r;
  select status::text into v_txt from public.objekte where id = c_o1;
  insert into erg values (14,'Aktive Reservierung setzt Objekt auf reserviert','reserviert',v_txt,v_txt='reserviert');
  begin
    insert into public.reservierungen (mandant_id, objekt_id, status) values (c_m1, c_o1, 'aktiv');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (15,'Nur eine aktive Reservierung je Objekt','abgewiesen',v_fehler,v_fehler='abgewiesen');
  update public.reservierungen set status = 'aufgehoben', aufgehoben_am = now(), aufhebungsgrund = 'Finanzierung geplatzt' where id = v_r;
  select status::text into v_txt from public.objekte where id = c_o1;
  insert into erg values (16,'Aufhebung gibt das Objekt frei','aktiv',v_txt,v_txt='aktiv');
  insert into public.reservierungen (mandant_id, objekt_id, status, reserviert_bis) values (c_m1, c_o1, 'aktiv', current_date - 1);
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select public.reservierungen_ablaufen() into v_n;
  insert into erg values (17,'Tageslauf schliesst abgelaufene Reservierungen','1',v_n::text,v_n=1);
  select status::text into v_txt from public.objekte where id = c_o1;
  insert into erg values (18,'Nach Ablauf ist das Objekt wieder aktiv','aktiv',v_txt,v_txt='aktiv');

  -- --- Antwortvorlagen: Verwaltung schreibt, Makler liest ---------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111f1111","role":"authenticated"}';
  insert into public.antwortvorlagen (mandant_id, schluessel, bezeichnung, betreff, text) values (c_m1, 'absage', 'Absage', 'Ihre Anfrage', 'Leider …');
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222f2222","role":"authenticated"}';
  select count(*) into v_n from public.antwortvorlagen;
  insert into erg values (19,'Makler liest Vorlagen','1',v_n::text,v_n=1);
  begin
    insert into public.antwortvorlagen (mandant_id, schluessel, bezeichnung, betreff, text) values (c_m1, 'x', 'X', 'x', 'x');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (20,'Makler kann keine Vorlagen anlegen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Mandantentrennung ---------------------------------------------------------------
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333f3333","role":"authenticated"}';
  select count(*) into v_n from public.mietanfragen;
  insert into erg values (21,'Fremder Mandant sieht keine Anfragen','0',v_n::text,v_n=0);
  select count(*) into v_n from public.mietvertraege;
  insert into erg values (22,'Fremder Mandant sieht keine Mietvertraege','0',v_n::text,v_n=0);
  select count(*) into v_n from public.reservierungen;
  insert into erg values (23,'Fremder Mandant sieht keine Reservierungen','0',v_n::text,v_n=0);
  select count(*) into v_n from public.selbstauskunft_links;
  insert into erg values (24,'Fremder Mandant sieht keine Formular-Links','0',v_n::text,v_n=0);
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
