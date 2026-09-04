-- ===========================================================================
-- Nachweis: Rechnungen (Absender mit Nummernkreis, Positionen und Summen,
-- Festschreiben, Unveraenderlichkeit, Storno, bezahlt, Test-Rechnung,
-- persoenlicher Absender) und Briefe, Mandantentrennung
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role, anon;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111d1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chefd@test.invalid','x',now(),now(),now()),
  ('22222222-2222-2222-2222-2222222d2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','maklerd@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333d3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremdd@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'Mandant DA', 'mandant-da'),
  ('bbbbbbbb-0000-0000-0000-0000000000d2', 'Mandant DB', 'mandant-db');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111d1111', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'Chefin', 'chefd@test.invalid', 'inhaber'),
  ('22222222-2222-2222-2222-2222222d2222', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'Makler', 'maklerd@test.invalid', 'makler'),
  ('33333333-3333-3333-3333-3333333d3333', 'bbbbbbbb-0000-0000-0000-0000000000d2', 'Fremd', 'fremdd@test.invalid', 'inhaber');
insert into public.kontakte (id, mandant_id, anrede, vorname, nachname) values
  ('dddddddd-0000-0000-0000-0000000000d2', 'bbbbbbbb-0000-0000-0000-0000000000d2', 'Herr', 'Fremd', 'Kontakt');

do $$
declare
  v_fehler text; v_txt text; v_n int; v_a uuid; v_p uuid; v_r uuid; v_s uuid; v_b uuid; v_nr text; v_j jsonb;
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000d1';
  c_chef constant uuid := '11111111-1111-1111-1111-1111111d1111';
  c_makler constant uuid := '22222222-2222-2222-2222-2222222d2222';
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111d1111","role":"authenticated"}';

  -- --- Absender und Nummernkreis ------------------------------------------------------
  insert into public.rechnungs_absender (mandant_id, name, strasse, plz, ort, praefix, mit_jahr, naechste_nummer, zahlungsziel_tage, iban)
    values (c_m1, 'Testmakler GmbH', 'Weg 1', '60311', 'Frankfurt', 'RE', true, 41, 10, 'DE00 1234') returning id into v_a;
  select public.rechnung_startnummer_info(v_a) into v_j;
  insert into erg values (1,'Startnummer editierbar ohne gestellte Rechnung','true/41',(v_j->>'editierbar') || '/' || (v_j->>'naechste'),(v_j->>'editierbar')='true' and (v_j->>'naechste')='41');

  -- --- Rechnung mit Positionen, Summen --------------------------------------------------
  insert into public.rechnungen (mandant_id, absender_id, empfaenger_anrede, empfaenger_name, empfaenger_strasse, empfaenger_plz, empfaenger_ort, ausstellungsdatum, zahlungsziel_tage, erstellt_von)
    values (c_m1, v_a, 'Frau', 'Erika Beispiel', 'Musterweg 5', '60322', 'Frankfurt', date '2026-09-04', 10, c_chef) returning id into v_r;
  insert into public.rechnungspositionen (mandant_id, rechnung_id, position, beschreibung, menge, einzelpreis_netto, mwst_satz) values
    (c_m1, v_r, 1, 'Maklerprovision Verkauf Musterweg 5', 1, 10000, 19),
    (c_m1, v_r, 2, 'Energieausweis (Auslage)', 2, 50, 7);
  select netto::text || '/' || mwst::text || '/' || brutto::text into v_txt from public.rechnungen where id = v_r;
  insert into erg values (2,'Summen aus Positionen (19 % und 7 %)','10100.00/1907.00/12007.00',v_txt,v_txt='10100.00/1907.00/12007.00');
  select status || '/' || coalesce(rechnungsnummer, 'ohne') into v_txt from public.rechnungen where id = v_r;
  insert into erg values (3,'Entwurf ohne Nummer','entwurf/ohne',v_txt,v_txt='entwurf/ohne');

  -- --- Festschreiben --------------------------------------------------------------------
  select public.rechnung_stellen(v_r) into v_nr;
  insert into erg values (4,'Nummer aus Praefix, Jahr und Startnummer','RE-2026-041',v_nr,v_nr='RE-2026-041');
  select status || '/' || faellig_am::text || '/' || (absender_snapshot->>'iban') into v_txt from public.rechnungen where id = v_r;
  insert into erg values (5,'Gestellt mit Faelligkeit und Absender-Schnappschuss','gestellt/2026-09-14/DE00 1234',v_txt,v_txt='gestellt/2026-09-14/DE00 1234');
  select naechste_nummer into v_n from public.rechnungs_absender where id = v_a;
  insert into erg values (6,'Nummernkreis zaehlt weiter','42',v_n::text,v_n=42);
  begin
    update public.rechnungs_absender set naechste_nummer = 1 where id = v_a;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (7,'Startnummer nach erster Rechnung gesperrt','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    update public.rechnungen set empfaenger_name = 'Jemand anderes' where id = v_r;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (8,'Gestellte Rechnung unveraenderlich (Empfaenger)','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.rechnungspositionen (mandant_id, rechnung_id, position, beschreibung, menge, einzelpreis_netto) values (c_m1, v_r, 3, 'Nachtrag', 1, 1);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (9,'Keine neuen Positionen an gestellter Rechnung','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    update public.rechnungen set status = 'entwurf' where id = v_r;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (10,'Kein Zurueck zum Entwurf','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    delete from public.rechnungen where id = v_r;
    get diagnostics v_n = row_count;
    v_fehler := case when v_n = 0 then 'abgewiesen' else 'DURCHGEKOMMEN' end;
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (11,'Gestellte Rechnung nicht loeschbar','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    select public.rechnung_stellen(v_r) into v_nr;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (12,'Doppeltes Stellen abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Bezahlt und Storno -----------------------------------------------------------------
  perform public.rechnung_bezahlt(v_r, date '2026-09-10', null);
  select status || '/' || bezahlt_betrag::text into v_txt from public.rechnungen where id = v_r;
  insert into erg values (13,'Bezahlt mit Betrag aus Brutto','bezahlt/12007.00',v_txt,v_txt='bezahlt/12007.00');
  select public.rechnung_stornieren(v_r, 'Falscher Betrag') into v_s;
  select status || '/' || (storniert_durch_id = v_s)::text into v_txt from public.rechnungen where id = v_r;
  insert into erg values (14,'Original storniert und verknuepft','storniert/true',v_txt,v_txt='storniert/true');
  select typ || '/' || rechnungsnummer || '/' || brutto::text || '/' || status into v_txt from public.rechnungen where id = v_s;
  insert into erg values (15,'Storno-Rechnung mit eigener Nummer und negativem Brutto','storno/RE-2026-042/-12007.00/gestellt',v_txt,v_txt='storno/RE-2026-042/-12007.00/gestellt');
  begin
    select public.rechnung_stornieren(v_s, null) into v_b;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (16,'Storno nicht stornierbar','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Leere Rechnung, Test-Rechnung -----------------------------------------------------
  insert into public.rechnungen (mandant_id, absender_id, empfaenger_name) values (c_m1, v_a, 'Leer') returning id into v_p;
  begin
    select public.rechnung_stellen(v_p) into v_nr;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (17,'Rechnung ohne Positionen nicht stellbar','abgewiesen',v_fehler,v_fehler='abgewiesen');
  update public.rechnungen set ist_test = true where id = v_p;
  insert into public.rechnungspositionen (mandant_id, rechnung_id, beschreibung, einzelpreis_netto) values (c_m1, v_p, 'Probe', 100);
  select public.rechnung_stellen(v_p) into v_nr;
  select naechste_nummer into v_n from public.rechnungs_absender where id = v_a;
  insert into erg values (18,'Test-Rechnung verbraucht keine Nummer','TEST/43',left(v_nr, 4) || '/' || v_n::text,left(v_nr, 4)='TEST' and v_n=43);
  delete from public.rechnungen where id = v_p;
  select count(*) into v_n from public.rechnungen where id = v_p;
  insert into erg values (19,'Test-Rechnung loeschbar','0',v_n::text,v_n=0);

  -- --- Persoenlicher Absender des Maklers -------------------------------------------------
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222d2222","role":"authenticated"}';
  begin
    insert into public.rechnungs_absender (mandant_id, typ, name, strasse, plz, ort) values (c_m1, 'firma', 'Zweite Firma', 'x', '1', 'y');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (20,'Makler legt keinen Firmen-Absender an','abgewiesen',v_fehler,v_fehler='abgewiesen');
  insert into public.rechnungs_absender (mandant_id, typ, benutzer_id, name, strasse, plz, ort, praefix, mit_jahr) values (c_m1, 'persoenlich', c_makler, 'Max Makler', 'Weg 2', '60311', 'Frankfurt', 'MM', false);
  select count(*) into v_n from public.rechnungs_absender where typ = 'persoenlich' and benutzer_id = c_makler;
  insert into erg values (21,'Persoenlicher Absender angelegt','1',v_n::text,v_n=1);

  -- --- Verweise, Briefe --------------------------------------------------------------------
  begin
    insert into public.rechnungskunden (mandant_id, name, kontakt_id) values (c_m1, 'Fremd', 'dddddddd-0000-0000-0000-0000000000d2');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (22,'Kunde mit fremdem Kontakt abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  insert into public.briefe (mandant_id, absender_id, empfaenger_name, betreff, text, erstellt_von) values (c_m1, v_a, 'Amt fuer Bodenmanagement', 'Anfrage Flurkarte', 'Bitte senden Sie …', c_makler) returning id into v_b;
  select status || '/' || anrede into v_txt from public.briefe where id = v_b;
  insert into erg values (23,'Brief als Entwurf mit Standardanrede','entwurf/Sehr geehrte Damen und Herren,',v_txt,v_txt='entwurf/Sehr geehrte Damen und Herren,');

  -- --- Mandantentrennung ---------------------------------------------------------------
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333d3333","role":"authenticated"}';
  select count(*) into v_n from public.rechnungen; insert into erg values (24,'Fremder Mandant sieht keine Rechnungen','0',v_n::text,v_n=0);
  select count(*) into v_n from public.rechnungs_absender; insert into erg values (25,'Fremder Mandant sieht keine Absender','0',v_n::text,v_n=0);
  select count(*) into v_n from public.briefe; insert into erg values (26,'Fremder Mandant sieht keine Briefe','0',v_n::text,v_n=0);
  begin
    select public.rechnung_stellen(v_r) into v_nr;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (27,'Fremder Mandant stellt keine fremde Rechnung','abgewiesen',v_fehler,v_fehler='abgewiesen');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
