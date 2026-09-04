-- ===========================================================================
-- Nachweis: Neubau-Projekte und Kundenbereich — Projekte, Einheiten, Zugaenge
-- mit Token, Kundensicht (anon), Sichtbarkeit, Anfragen, Merkliste, Passwort,
-- Mandantentrennung
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role, anon;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111e1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chefp@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333e3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremdp@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'Mandant PA', 'mandant-pa'),
  ('bbbbbbbb-0000-0000-0000-0000000000e2', 'Mandant PB', 'mandant-pb');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111e1111', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'Chefin', 'chefp@test.invalid', 'inhaber'),
  ('33333333-3333-3333-3333-3333333e3333', 'bbbbbbbb-0000-0000-0000-0000000000e2', 'Fremd', 'fremdp@test.invalid', 'inhaber');
insert into public.objekte (id, mandant_id, objektnummer, bezeichnung, status, vermarktungsart) values
  ('cccccccc-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'P-1', 'Haus A', 'aktiv', 'kauf'),
  ('cccccccc-0000-0000-0000-0000000000e2', 'bbbbbbbb-0000-0000-0000-0000000000e2', 'P-2', 'Haus B', 'aktiv', 'kauf');

do $$
declare
  v_fehler text; v_n int; v_id uuid; v_j jsonb; v_e1 uuid; v_e2 uuid; v_k uuid; v_a uuid; v_d_kaeufer uuid; v_d_interessent uuid;
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000e1';
  c_m2 constant uuid := 'bbbbbbbb-0000-0000-0000-0000000000e2';
  c_o1 constant uuid := 'cccccccc-0000-0000-0000-0000000000e1';
  c_o2 constant uuid := 'cccccccc-0000-0000-0000-0000000000e2';
  c_p  constant uuid := 'dddddddd-0000-0000-0000-0000000000e1';
  c_tok constant text := 'kundentokenabcdef0123456789abcdef';
  c_ptok constant text := 'projekttoken0123456789abcdefabcd';
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111e1111","role":"authenticated"}';

  -- Projekt mit Einheiten
  insert into public.projekte (id, mandant_id, name, slug, ort, vermarktungsart, status, token, oeffentlich)
    values (c_p, c_m1, 'Quartier Nord', 'quartier-nord', 'Musterstadt', 'kauf', 'aktiv', c_ptok, true);
  insert into public.projekt_einheiten (mandant_id, projekt_id, we_nr, geschoss, geschoss_index, zimmer, wohnflaeche, kaufpreis)
    values (c_m1, c_p, 'WE 01', 'EG', 0, 3, 78.5, 389000) returning id into v_e1;
  insert into public.projekt_einheiten (mandant_id, projekt_id, we_nr, geschoss, geschoss_index, zimmer, wohnflaeche, kaufpreis)
    values (c_m1, c_p, 'WE 02', '1. OG', 1, 2, 61.0, 315000) returning id into v_e2;
  select count(*) into v_n from public.projekt_einheiten where projekt_id = c_p;
  insert into erg values (1,'Projekt mit zwei Einheiten','2',v_n::text,v_n=2);
  begin
    insert into public.projekt_einheiten (mandant_id, projekt_id, we_nr) values (c_m1, c_p, 'WE 01');
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (2,'Doppelte WE-Nummer abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.projekt_einheiten (mandant_id, projekt_id, we_nr, objekt_id) values (c_m1, c_p, 'WE 09', c_o2);
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (3,'Einheit mit fremdem Objekt abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Dateien mit Sichtbarkeit, Update, Gewerk
  insert into public.projekt_dateien (mandant_id, projekt_id, kategorie, name, pfad, sichtbarkeit)
    values (c_m1, c_p, 'expose', 'Projektexposé.pdf', c_m1::text || '/projekte/' || c_p::text || '/expose.pdf', 'interessent');
  insert into public.projekt_dateien (mandant_id, projekt_id, kategorie, name, pfad, sichtbarkeit)
    values (c_m1, c_p, 'vertrag', 'Kaufvertragsentwurf.pdf', c_m1::text || '/projekte/' || c_p::text || '/kv.pdf', 'kaeufer');
  insert into public.projekt_dateien (mandant_id, projekt_id, kategorie, name, pfad, sichtbarkeit)
    values (c_m1, c_p, 'sonstiges', 'Kalkulation.xlsx', c_m1::text || '/projekte/' || c_p::text || '/intern.xlsx', 'intern');
  insert into public.projekt_dateien (mandant_id, projekt_id, kategorie, name, pfad, sichtbarkeit)
    values (c_m1, c_p, 'baubeschreibung', 'Baubeschreibung.pdf', c_m1::text || '/projekte/' || c_p::text || '/bau.pdf', 'oeffentlich');
  insert into public.projekt_updates (mandant_id, projekt_id, titel, text, sichtbarkeit) values (c_m1, c_p, 'Rohbau fertig', 'Der Rohbau steht.', 'oeffentlich');
  insert into public.projekt_kontakte (mandant_id, projekt_id, gewerk, firma, fuer_kunden) values (c_m1, c_p, 'Sanitär', 'Bad GmbH', true);
  insert into public.projekt_kontakte (mandant_id, projekt_id, gewerk, firma, fuer_kunden) values (c_m1, c_p, 'Statik', 'Ing. Büro', false);

  -- Kundenzugang (Interessent im Projekt)
  insert into public.portal_kunden (mandant_id, art, anzeigename, email, token_hash, projekt_id, ansprechpartner_id)
    values (c_m1, 'interessent', 'Ina Interessent', 'ina@test.invalid', intern.portal_token_hash(c_tok), c_p, '11111111-1111-1111-1111-1111111e1111')
    returning id into v_k;
  -- Eigentuemer-Zugang am Objekt
  insert into public.portal_kunden (mandant_id, art, anzeigename, email, token_hash)
    values (c_m1, 'eigentuemer', 'Egon Eigentümer', 'egon@test.invalid', intern.portal_token_hash('eigentuemertoken0123456789abcdef'))
    returning id into v_id;
  insert into public.portal_kunden_objekte (mandant_id, kunde_id, objekt_id) values (c_m1, v_id, c_o1);
  begin
    insert into public.portal_kunden_objekte (mandant_id, kunde_id, objekt_id) values (c_m1, v_id, c_o2);
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (4,'Zugang auf fremdes Objekt abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  insert into public.objekt_dokumente (mandant_id, objekt_id, pfad, dateiname, art, sichtbarkeit)
    values (c_m1, c_o1, c_m1::text || '/' || c_o1::text || '/expose.pdf', 'expose.pdf', 'expose', 'kunde');
  insert into public.objekt_dokumente (mandant_id, objekt_id, pfad, dateiname, art, sichtbarkeit)
    values (c_m1, c_o1, c_m1::text || '/' || c_o1::text || '/intern.pdf', 'intern.pdf', 'sonstiges', 'intern');

  select id into v_d_kaeufer from public.projekt_dateien where name = 'Kaufvertragsentwurf.pdf';
  select id into v_d_interessent from public.projekt_dateien where name = 'Projektexposé.pdf';

  -- Kundensicht: anon mit Token
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  select count(*) into v_n from public.portal_kunden;
  insert into erg values (5,'anon sieht keine Zugaenge direkt','0',v_n::text,v_n=0);
  v_j := public.portal_oeffnen('falschertoken0123456789abcdef', null);
  insert into erg values (6,'Unbekannter Link','unbekannt',v_j->>'zustand',v_j->>'zustand'='unbekannt');
  v_j := public.portal_oeffnen(c_tok, null);
  insert into erg values (7,'Zugang ueber Link geoeffnet','ok',v_j->>'zustand',v_j->>'zustand'='ok');
  v_j := public.portal_daten(c_tok, null);
  select count(*) into v_n from jsonb_array_elements(v_j->'einheiten');
  insert into erg values (8,'Kunde sieht beide Einheiten','2',v_n::text,v_n=2);
  select count(*) into v_n from jsonb_array_elements(v_j->'dateien');
  insert into erg values (9,'Interessent sieht nur oeffentliche und Interessenten-Dateien','2',v_n::text,v_n=2);
  select count(*) into v_n from jsonb_array_elements(v_j->'gewerke');
  insert into erg values (10,'Nur freigegebene Gewerke sichtbar','1',v_n::text,v_n=1);
  insert into erg values (11,'Ansprechpartner enthalten','Chefin',v_j->'ansprechpartner'->>'name',v_j->'ansprechpartner'->>'name'='Chefin');

  v_j := public.portal_merkliste_schalten(c_tok, null, v_e2);
  insert into erg values (12,'Einheit gemerkt','true',v_j->>'gemerkt',(v_j->>'gemerkt')::boolean);
  v_j := public.portal_anfrage_senden(c_tok, null, v_e1, 'reservierung', 'Bitte reservieren.');
  insert into erg values (13,'Reservierungsanfrage angenommen','true',v_j->>'ok',(v_j->>'ok')::boolean);
  v_j := public.portal_anfrage_senden(c_tok, null, v_e1, 'reservierung', 'nochmal');
  insert into erg values (14,'Doppelte Anfrage abgewiesen','doppelt',v_j->>'grund',v_j->>'grund'='doppelt');
  v_j := public.portal_nachricht_senden(c_tok, null, 'Wann ist Bemusterung?');
  insert into erg values (15,'Nachricht des Kunden gespeichert','true',v_j->>'ok',(v_j->>'ok')::boolean);
  v_j := public.portal_datei(c_tok, null, 'projekt', v_d_kaeufer);
  insert into erg values (16,'Kaeufer-Datei fuer Interessenten gesperrt','false',v_j->>'ok',v_j->>'ok'='false');
  v_j := public.portal_datei(c_tok, null, 'projekt', v_d_interessent);
  insert into erg values (17,'Interessenten-Datei freigegeben','true',v_j->>'ok',v_j->>'ok'='true');

  -- Passwort setzen und pruefen
  v_j := public.portal_passwort_setzen(c_tok, null, 'geheim123');
  insert into erg values (18,'Passwort gesetzt','true',v_j->>'ok',(v_j->>'ok')::boolean);
  v_j := public.portal_oeffnen(c_tok, null);
  insert into erg values (19,'Ohne Passwort: Passwortabfrage','passwort',v_j->>'zustand',v_j->>'zustand'='passwort');
  v_j := public.portal_oeffnen(c_tok, 'falsch');
  insert into erg values (20,'Falsches Passwort: Passwortabfrage','passwort',v_j->>'zustand',v_j->>'zustand'='passwort');
  v_j := public.portal_daten(c_tok, 'geheim123');
  insert into erg values (21,'Mit Passwort: Daten','ok',v_j->>'zustand',v_j->>'zustand'='ok');

  -- Eigentuemer-Sicht
  v_j := public.portal_daten('eigentuemertoken0123456789abcdef', null);
  select count(*) into v_n from jsonb_array_elements(v_j->'objekte'->0->'dokumente');
  insert into erg values (22,'Eigentuemer sieht nur Kundendokumente','1',v_n::text,v_n=1);
  v_j := public.portal_antrag_speichern('eigentuemertoken0123456789abcdef', null, null, c_o1, '{"gebaeudetyp":"EFH"}'::jsonb, true);
  insert into erg values (23,'Verbrauchsausweis-Antrag eingereicht','true',v_j->>'ok',(v_j->>'ok')::boolean);

  -- Oeffentliche Projektseite
  v_j := public.projekt_oeffentlich(c_ptok);
  select count(*) into v_n from jsonb_array_elements(v_j->'dateien');
  insert into erg values (24,'Projektseite zeigt nur oeffentliche Dateien','1',v_n::text,v_n=1);
  v_j := public.projekt_anfrage_oeffentlich(c_ptok, 'Neu Kunde', 'neu@test.invalid', null, v_e2, 'information', 'Infos bitte', repeat('ab', 32));
  insert into erg values (25,'Anfrage von der Projektseite legt Zugang an','true',v_j->>'ok',(v_j->>'ok')::boolean);

  -- Maklerseite: Anfrage bestaetigen, Glocke
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111e1111","role":"authenticated"}';
  select id into v_a from public.projekt_anfragen where kunde_id = v_k and art = 'reservierung';
  v_j := public.projekt_anfrage_bearbeiten(v_a, 'bestaetigt');
  select status into v_fehler from public.projekt_einheiten where id = v_e1;
  insert into erg values (26,'Einheit nach Bestaetigung reserviert','reserviert',v_fehler,v_fehler='reserviert');
  select fortschritt_stufe::text || '/' || einheit_id::text into v_fehler from public.portal_kunden where id = v_k;
  insert into erg values (27,'Zugang auf Stufe 2 mit Einheit','2/'||v_e1::text,v_fehler,v_fehler='2/'||v_e1::text);
  v_j := public.portal_glocke();
  insert into erg values (28,'Glocke zaehlt ungelesene Nachricht','1',v_j->>'nachrichten',(v_j->>'nachrichten')::int=1);
  insert into erg values (29,'Glocke zaehlt offene Anfrage','1',v_j->>'anfragen',(v_j->>'anfragen')::int=1);
  select count(*) into v_n from public.portal_kunden where projekt_id = c_p;
  insert into erg values (30,'Zwei Projekt-Zugaenge (Einladung + Projektseite)','2',v_n::text,v_n=2);

  -- Mandantentrennung
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333e3333","role":"authenticated"}';
  select count(*) into v_n from public.projekte;
  insert into erg values (31,'Fremder Mandant sieht keine Projekte','0',v_n::text,v_n=0);
  select count(*) into v_n from public.portal_kunden;
  insert into erg values (32,'Fremder Mandant sieht keine Zugaenge','0',v_n::text,v_n=0);
  select count(*) into v_n from public.portal_nachrichten;
  insert into erg values (33,'Fremder Mandant sieht keine Nachrichten','0',v_n::text,v_n=0);
  v_j := public.portal_glocke();
  insert into erg values (34,'Fremde Glocke leer','0',v_j->>'nachrichten',(v_j->>'nachrichten')::int=0);
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
