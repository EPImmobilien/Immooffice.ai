-- ===========================================================================
-- Nachweis: Postfaecher — Sichtbarkeit je Benutzer, Freigaben, Spaltenrechte,
-- mandantenreine Zuordnung, Einplaner, Aufbewahrung, Trennen
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/postfaecher.sql
--              oder scripts/db-lokal.sh
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111a1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chef@test.invalid','x',now(),now(),now()),
  ('22222222-2222-2222-2222-2222222a2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','makler@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333a3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremd@test.invalid','x',now(),now(),now()),
  ('44444444-4444-4444-4444-4444444a4444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','leser@test.invalid','x',now(),now(),now());

insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Mandant PA', 'mandant-pa'),
  ('bbbbbbbb-0000-0000-0000-0000000000a2', 'Mandant PB', 'mandant-pb');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111a1111', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Chefin', 'chef@test.invalid', 'inhaber'),
  ('22222222-2222-2222-2222-2222222a2222', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Makler', 'makler@test.invalid', 'makler'),
  ('44444444-4444-4444-4444-4444444a4444', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Leser', 'leser@test.invalid', 'nur_lesen'),
  ('33333333-3333-3333-3333-3333333a3333', 'bbbbbbbb-0000-0000-0000-0000000000a2', 'Fremd', 'fremd@test.invalid', 'inhaber');
insert into public.objekte (id, mandant_id, objektnummer, bezeichnung) values
  ('aaaaaaaa-1111-1111-1111-1111111a1111', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'PA-1', 'Wohnung Musterweg'),
  ('bbbbbbbb-2222-2222-2222-2222222a2222', 'bbbbbbbb-0000-0000-0000-0000000000a2', 'PB-1', 'Fremdes Objekt');
insert into public.kontakte (id, mandant_id, nachname, email) values
  ('aaaaaaaa-3333-3333-3333-3333333a3333', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Kunde', 'kunde@test.invalid');

do $$
declare
  v_fehler text; v_txt text; v_n int;
  v_pb uuid; v_pu uuid; v_n1 uuid; v_n2 uuid; v_n3 uuid; v_alt uuid;
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000a1';
  c_m2 constant uuid := 'bbbbbbbb-0000-0000-0000-0000000000a2';
  c_a  constant uuid := '11111111-1111-1111-1111-1111111a1111';
  c_b  constant uuid := '22222222-2222-2222-2222-2222222a2222';
  c_c  constant uuid := '33333333-3333-3333-3333-3333333a3333';
  c_d  constant uuid := '44444444-4444-4444-4444-4444444a4444';
  c_o1 constant uuid := 'aaaaaaaa-1111-1111-1111-1111111a1111';
  c_o2 constant uuid := 'bbbbbbbb-2222-2222-2222-2222222a2222';
  c_k1 constant uuid := 'aaaaaaaa-3333-3333-3333-3333333a3333';
begin
  -- --- Makler B: eigenes Postfach --------------------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222a2222","role":"authenticated"}';
  insert into public.postfaecher (mandant_id, benutzer_id, anbieter, adresse, zugangsdaten)
  values (c_m1, c_b, 'imap', 'makler@test.invalid', 'v1.a.b.c') returning id into v_pb;
  insert into erg values (1,'Makler verbindet eigenes Postfach','angelegt','angelegt',true);

  begin
    insert into public.postfaecher (mandant_id, benutzer_id, anbieter, adresse) values (c_m1, null, 'imap', 'info@test.invalid');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (2,'Makler darf kein Unternehmenspostfach anlegen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  begin
    insert into public.postfaecher (mandant_id, benutzer_id, anbieter, adresse) values (c_m1, c_a, 'imap', 'chef@test.invalid');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (3,'Makler darf kein Postfach fuer Kollegen anlegen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  begin
    select zugangsdaten into v_txt from public.postfaecher where id = v_pb;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (4,'Zugangsdaten sind fuer Benutzer nicht lesbar','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Inhaberin A: Unternehmenspostfach ---------------------------------------
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111a1111","role":"authenticated"}';
  insert into public.postfaecher (mandant_id, benutzer_id, anbieter, adresse, zugangsdaten)
  values (c_m1, null, 'microsoft', 'info@test.invalid', 'v1.a.b.c') returning id into v_pu;
  insert into erg values (5,'Verwaltung legt Unternehmenspostfach an','angelegt','angelegt',true);
  select count(*) into v_n from public.postfaecher where id = v_pb;
  insert into erg values (6,'Verwaltung sieht das persoenliche Postfach des Maklers nicht','0',v_n::text,v_n=0);

  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222a2222","role":"authenticated"}';
  select count(*) into v_n from public.postfaecher where id = v_pu;
  insert into erg values (7,'Ohne Freigabe ist das Unternehmenspostfach unsichtbar','0',v_n::text,v_n=0);
  begin
    insert into public.postfach_freigaben (postfach_id, benutzer_id, mandant_id) values (v_pu, c_b, c_m1);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (8,'Makler kann sich keine Freigabe selbst erteilen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111a1111","role":"authenticated"}';
  insert into public.postfach_freigaben (postfach_id, benutzer_id, mandant_id) values (v_pu, c_b, c_m1);
  insert into erg values (9,'Verwaltung gibt das Unternehmenspostfach frei','angelegt','angelegt',true);
  begin
    insert into public.postfach_freigaben (postfach_id, benutzer_id, mandant_id) values (v_pu, c_c, c_m1);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (10,'Freigabe an fremden Benutzer abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.postfach_freigaben (postfach_id, benutzer_id, mandant_id) values (v_pb, c_a, c_m1);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (11,'Persoenliche Postfaecher lassen sich nicht freigeben','abgewiesen',v_fehler,v_fehler='abgewiesen');

  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222a2222","role":"authenticated"}';
  select count(*) into v_n from public.postfaecher where id = v_pu;
  insert into erg values (12,'Mit Freigabe ist das Unternehmenspostfach sichtbar','1',v_n::text,v_n=1);

  -- --- Fremder Mandant C -------------------------------------------------------
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333a3333","role":"authenticated"}';
  select count(*) into v_n from public.postfaecher;
  insert into erg values (13,'Fremder Mandant sieht keine Postfaecher','0',v_n::text,v_n=0);
  begin
    insert into public.postfach_freigaben (postfach_id, benutzer_id, mandant_id) values (v_pu, c_c, c_m2);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (14,'Fremder Mandant kann sich keine Freigabe eintragen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Nur-Lese-Zugang D -------------------------------------------------------
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-4444444a4444","role":"authenticated"}';
  begin
    insert into public.postfaecher (mandant_id, benutzer_id, anbieter, adresse) values (c_m1, c_d, 'imap', 'leser@test.invalid');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (15,'Nur-Lese-Zugang kann kein Postfach verbinden','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Dienstrolle spiegelt den Eingang ----------------------------------------
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  insert into public.nachrichten (mandant_id, postfach_id, extern_id, von_adresse, betreff, text, gesendet_am)
  values (c_m1, v_pb, 'uid-1', 'kunde@test.invalid', 'Besichtigung Musterweg', 'Guten Tag, wann passt eine Besichtigung?', now() - interval '1 day') returning id into v_n1;
  insert into public.nachrichten (mandant_id, postfach_id, extern_id, von_adresse, betreff, text, gesendet_am)
  values (c_m1, v_pb, 'uid-2', 'jemand@test.invalid', 'Newsletter', 'Angebote der Woche', now() - interval '2 days') returning id into v_n2;
  insert into public.nachrichten (mandant_id, postfach_id, extern_id, von_adresse, betreff, text, gesendet_am, hat_anhaenge)
  values (c_m1, v_pu, 'AAMk-1', 'interessent@test.invalid', 'Anfrage', 'Ich interessiere mich fuer Objekt PA-1', now() - interval '3 hours', true) returning id into v_n3;
  insert into public.nachricht_anhaenge (mandant_id, nachricht_id, extern_id, dateiname, mime, bytes)
  values (c_m1, v_n3, 'att-1', 'Ausweis.pdf', 'application/pdf', 1234);
  begin
    insert into public.nachrichten (mandant_id, postfach_id, extern_id, von_adresse, betreff, gesendet_am)
    values (c_m1, v_pb, 'uid-1', 'x@test.invalid', 'Dublette', now());
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (16,'Dieselbe Nachricht nicht zweimal je Postfach','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.nachrichten (mandant_id, postfach_id, extern_id, von_adresse, betreff, gesendet_am)
    values (c_m2, v_pb, 'uid-9', 'x@test.invalid', 'Falscher Mandant', now());
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (17,'Nachricht mit fremder Mandantenkennung abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Makler B liest, sucht, ordnet zu -----------------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222a2222","role":"authenticated"}';
  select count(*) into v_n from public.nachrichten;
  insert into erg values (18,'Makler sieht eigene und freigegebene Nachrichten','3',v_n::text,v_n=3);
  select count(*) into v_n from public.nachricht_anhaenge;
  insert into erg values (19,'Anhaenge folgen der Sichtbarkeit der Nachricht','1',v_n::text,v_n=1);
  select count(*) into v_n from public.nachrichten
   where to_tsvector('german', coalesce(betreff,'') || ' ' || coalesce(von_adresse,'') || ' ' || coalesce(text,'')) @@ plainto_tsquery('german', 'Besichtigung');
  insert into erg values (20,'Volltextsuche findet die Nachricht','1',v_n::text,v_n=1);

  update public.nachrichten set objekt_id = c_o1, kontakt_id = c_k1, zuordnung_art = 'manuell', gelesen = true where id = v_n1;
  get diagnostics v_n = row_count;
  insert into erg values (21,'Makler ordnet Nachricht Objekt und Kontakt zu','1',v_n::text,v_n=1);
  begin
    update public.nachrichten set objekt_id = c_o2 where id = v_n2;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (22,'Zuordnung zu fremdem Objekt abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    update public.nachrichten set text = 'manipuliert' where id = v_n2;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (23,'Inhalt ist fuer Benutzer nicht aenderbar','abgewiesen',v_fehler,v_fehler='abgewiesen');

  insert into public.nachrichten (mandant_id, postfach_id, ordner, extern_id, von_adresse, an, betreff, text, gesendet_am)
  values (c_m1, v_pu, 'gesendet', 'sent-1', 'info@test.invalid', '[{"adresse":"interessent@test.invalid"}]'::jsonb, 'Re: Anfrage', 'Gern.', now());
  insert into erg values (24,'Freigegebener Kollege sendet ueber das Unternehmenspostfach','angelegt','angelegt',true);
  begin
    insert into public.nachrichten (mandant_id, postfach_id, ordner, extern_id, von_adresse, betreff, gesendet_am)
    values (c_m1, v_pb, 'eingang', 'uid-77', 'x@test.invalid', 'Eingeschmuggelt', now());
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (25,'Benutzer koennen keine Eingangsnachrichten anlegen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Verwaltung A sieht nur das Unternehmenspostfach -----------------------------
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111a1111","role":"authenticated"}';
  select count(*) into v_n from public.nachrichten;
  insert into erg values (26,'Verwaltung sieht nur Nachrichten des Unternehmenspostfachs','2',v_n::text,v_n=2);
  update public.nachrichten set gelesen = true where id = v_n2;
  get diagnostics v_n = row_count;
  insert into erg values (27,'Verwaltung kann fremde persoenliche Nachricht nicht aendern','0',v_n::text,v_n=0);
  update public.postfach_freigaben set darf_senden = false where postfach_id = v_pu and benutzer_id = c_b;

  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222a2222","role":"authenticated"}';
  begin
    insert into public.nachrichten (mandant_id, postfach_id, ordner, extern_id, von_adresse, betreff, gesendet_am)
    values (c_m1, v_pu, 'gesendet', 'sent-2', 'info@test.invalid', 'Nochmal', now());
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (28,'Ohne Senderecht kein Versand ueber das Unternehmenspostfach','abgewiesen',v_fehler,v_fehler='abgewiesen');

  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333a3333","role":"authenticated"}';
  select count(*) into v_n from public.nachrichten;
  insert into erg values (29,'Fremder Mandant sieht keine Nachrichten','0',v_n::text,v_n=0);
  begin
    perform public.postfach_trennen(v_pu);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (30,'Fremder Mandant kann kein Postfach trennen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Einplaner (Dienstrolle) --------------------------------------------------------
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  update public.postfaecher set status = 'aktiv' where id in (v_pb, v_pu);
  select public.postfaecher_faellige_einplanen() into v_n;
  insert into erg values (31,'Einplaner stellt je aktivem Postfach einen Auftrag ein','2',v_n::text,v_n=2);
  select public.postfaecher_faellige_einplanen() into v_n;
  insert into erg values (32,'Kein zweiter Auftrag, solange einer offen ist','0',v_n::text,v_n=0);
  update public.jobs set status = 'fertig' where art = 'postfach';
  update public.postfaecher set letzter_abruf_am = now() where id in (v_pb, v_pu);
  select public.postfaecher_faellige_einplanen() into v_n;
  insert into erg values (33,'Gerade abgerufen: nicht faellig','0',v_n::text,v_n=0);
  update public.postfaecher set letzter_abruf_am = now() - interval '6 minutes' where id in (v_pb, v_pu);
  update public.postfaecher set fehler_zaehler = 3 where id = v_pu;
  select public.postfaecher_faellige_einplanen() into v_n;
  insert into erg values (34,'Nach sechs Minuten faellig; gestoertes Postfach wartet laenger','1',v_n::text,v_n=1);
  update public.jobs set status = 'fertig' where art = 'postfach';

  -- --- Aufbewahrung (P7) ---------------------------------------------------------------
  insert into public.nachrichten (mandant_id, postfach_id, extern_id, von_adresse, von_name, an, betreff, text, gesendet_am, kontakt_id)
  values (c_m1, v_pb, 'uid-alt', 'kunde@test.invalid', 'Kunde', '[{"adresse":"makler@test.invalid"}]'::jsonb, 'Altes Anliegen', 'Langer Text', now() - interval '25 months', c_k1) returning id into v_alt;
  insert into public.nachricht_anhaenge (mandant_id, nachricht_id, dateiname) values (c_m1, v_alt, 'alt.pdf');
  select public.nachrichten_aufraeumen() into v_n;
  insert into erg values (35,'Aufraeumen bereinigt die Nachricht ueber der Frist','1',v_n::text,v_n=1);
  select (text is null and an = '[]'::jsonb and inhalt_entfernt_am is not null and betreff = 'Altes Anliegen' and kontakt_id = c_k1)::text
    into v_txt from public.nachrichten where id = v_alt;
  insert into erg values (36,'Nach der Frist bleibt nur die Verknuepfung','true',v_txt,v_txt='true');
  select count(*) into v_n from public.nachricht_anhaenge where nachricht_id = v_alt;
  insert into erg values (37,'Anhaenge bereinigter Nachrichten sind entfernt','0',v_n::text,v_n=0);
  update public.mandanten set nachrichten_aufbewahrung_monate = 12 where id = c_m1;
  insert into public.nachrichten (mandant_id, postfach_id, extern_id, von_adresse, betreff, text, gesendet_am)
  values (c_m1, v_pb, 'uid-13m', 'kunde@test.invalid', 'Dreizehn Monate', 'Text', now() - interval '13 months');
  select public.nachrichten_aufraeumen() into v_n;
  insert into erg values (38,'Aufbewahrungsfrist ist je Unternehmen einstellbar','1',v_n::text,v_n=1);

  -- --- Trennen und Loeschen ------------------------------------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222a2222","role":"authenticated"}';
  delete from public.postfaecher where id = v_pb;
  get diagnostics v_n = row_count;
  insert into erg values (39,'Aktives Postfach laesst sich nicht direkt loeschen','0',v_n::text,v_n=0);
  begin
    perform public.postfach_trennen(v_pu);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (40,'Freigegebener Kollege kann das Unternehmenspostfach nicht trennen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  perform public.postfach_trennen(v_pb);
  select status::text into v_txt from public.postfaecher where id = v_pb;
  insert into erg values (41,'Trennen setzt den Status','getrennt',v_txt,v_txt='getrennt');
  select count(*) into v_n from public.nachrichten where postfach_id = v_pb;
  insert into erg values (42,'Trennen loescht Nachrichten ohne Verknuepfung','2',v_n::text,v_n=2);
  select (text is null and objekt_id = c_o1 and inhalt_entfernt_am is not null)::text into v_txt from public.nachrichten where id = v_n1;
  insert into erg values (43,'Verknuepfte Nachrichten bleiben anonymisiert erhalten','true',v_txt,v_txt='true');

  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select (zugangsdaten is null and sync_zustand = '{}'::jsonb)::text into v_txt from public.postfaecher where id = v_pb;
  insert into erg values (44,'Trennen entfernt Zugangsdaten und Abgleichzustand','true',v_txt,v_txt='true');

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222a2222","role":"authenticated"}';
  delete from public.postfaecher where id = v_pb;
  get diagnostics v_n = row_count;
  insert into erg values (45,'Getrenntes Postfach kann geloescht werden','1',v_n::text,v_n=1);
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
