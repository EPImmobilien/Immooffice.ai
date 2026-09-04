-- ===========================================================================
-- Nachweis: ToDos-Ausbau (Status, Schritte, Kommentare, Uebergabe,
-- Wiederholung, Verknuepfungen) und Checklisten (Vorlagen, aus Vorlage,
-- Unterlage erledigt Punkt, Abschluss), Mandantentrennung
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role, anon;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111c1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chefc@test.invalid','x',now(),now(),now()),
  ('22222222-2222-2222-2222-2222222c2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','maklerc@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333c3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremdc@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'Mandant CA', 'mandant-ca'),
  ('bbbbbbbb-0000-0000-0000-0000000000c2', 'Mandant CB', 'mandant-cb');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111c1111', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Chefin', 'chefc@test.invalid', 'inhaber'),
  ('22222222-2222-2222-2222-2222222c2222', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Makler', 'maklerc@test.invalid', 'makler'),
  ('33333333-3333-3333-3333-3333333c3333', 'bbbbbbbb-0000-0000-0000-0000000000c2', 'Fremd', 'fremdc@test.invalid', 'inhaber');
insert into public.objekte (id, mandant_id, objektnummer, bezeichnung, status) values
  ('cccccccc-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'C-1', 'Haus C', 'akquise'),
  ('cccccccc-0000-0000-0000-0000000000c2', 'bbbbbbbb-0000-0000-0000-0000000000c2', 'C-2', 'Fremdes Haus', 'aktiv');

do $$
declare
  v_fehler text; v_txt text; v_n int; v_a uuid; v_v uuid; v_c uuid; v_p uuid; v_d uuid;
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000c1';
  c_chef constant uuid := '11111111-1111-1111-1111-1111111c1111';
  c_makler constant uuid := '22222222-2222-2222-2222-2222222c2222';
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111c1111","role":"authenticated"}';

  -- --- Aufgabe mit Uebergabe, Schritten, Kommentaren, Status ------------------------
  insert into public.aufgaben (mandant_id, titel, prioritaet, faellig_am, zustaendig_id, erstellt_von, tags, wiederholung)
    values (c_m1, 'Energieausweis anfordern', 'hoch', current_date, c_makler, c_chef, array['unterlagen'], 'woechentlich') returning id into v_a;
  select status into v_txt from public.aufgaben where id = v_a;
  insert into erg values (1,'Neue Aufgabe ist offen','offen',v_txt,v_txt='offen');
  select count(*) into v_n from public.aufgaben_kommentare where aufgabe_id = v_a and system and text like 'Angelegt von Chefin für Makler%';
  insert into erg values (2,'Uebergabe beim Anlegen im Verlauf','1',v_n::text,v_n=1);
  insert into public.aufgaben_schritte (mandant_id, aufgabe_id, titel, sortierung) values (c_m1, v_a, 'Eigentümer anrufen', 1), (c_m1, v_a, 'Ausweis hochladen', 2);
  update public.aufgaben_schritte set erledigt_am = now(), erledigt_von = c_chef where aufgabe_id = v_a and sortierung = 1;
  select count(*) filter (where erledigt_am is not null) || '/' || count(*) into v_txt from public.aufgaben_schritte where aufgabe_id = v_a;
  insert into erg values (3,'Schritte: einer von zwei erledigt','1/2',v_txt,v_txt='1/2');
  insert into public.aufgaben_kommentare (mandant_id, aufgabe_id, text, benutzer_id, benutzer_name) values (c_m1, v_a, 'Eigentümer meldet sich Montag.', c_chef, 'Chefin');
  begin
    update public.aufgaben_kommentare set text = 'geglättet' where aufgabe_id = v_a and not system;
    get diagnostics v_n = row_count;
    v_fehler := case when v_n = 0 then 'abgewiesen' else 'DURCHGEKOMMEN' end;
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (4,'Kommentare sind unveraenderlich','abgewiesen',v_fehler,v_fehler='abgewiesen');
  update public.aufgaben set status = 'wartet' where id = v_a;
  select count(*) into v_n from public.aufgaben_kommentare where aufgabe_id = v_a and system and text = 'Status: offen → wartet';
  insert into erg values (5,'Statuswechsel im Verlauf','1',v_n::text,v_n=1);
  update public.aufgaben set zustaendig_id = c_chef where id = v_a;
  select count(*) into v_n from public.aufgaben_kommentare where aufgabe_id = v_a and system and text = 'Übergeben: Makler → Chefin';
  insert into erg values (6,'Uebergabe im Verlauf','1',v_n::text,v_n=1);

  -- Erledigen ueber Status setzt Zeitpunkt und Person; Wiederholung erzeugt die naechste
  update public.aufgaben set status = 'erledigt' where id = v_a;
  select (erledigt_am is not null)::text || '/' || (erledigt_von = c_chef)::text into v_txt from public.aufgaben where id = v_a;
  insert into erg values (7,'Erledigt-Zeit und Person aus dem Status','true/true',v_txt,v_txt='true/true');
  select count(*) into v_n from public.aufgaben where titel = 'Energieausweis anfordern' and status = 'offen' and faellig_am = current_date + 7 and quelle = 'wiederholung' and tags = array['unterlagen'];
  insert into erg values (8,'Woechentliche Wiederholung angelegt','1',v_n::text,v_n=1);
  -- Erledigen ueber den alten Weg (erledigt_am) setzt den Status
  update public.aufgaben set erledigt_am = now(), erledigt_von = c_chef where titel = 'Energieausweis anfordern' and status = 'offen';
  select count(*) into v_n from public.aufgaben where titel = 'Energieausweis anfordern' and status = 'erledigt';
  insert into erg values (9,'erledigt_am setzt Status erledigt','2',v_n::text,v_n=2);
  -- Wieder oeffnen ueber den Status loescht den Zeitpunkt
  update public.aufgaben set status = 'offen' where id = v_a;
  select (erledigt_am is null and erledigt_von is null)::text into v_txt from public.aufgaben where id = v_a;
  insert into erg values (10,'Wieder oeffnen loescht Erledigt-Zeit','true',v_txt,v_txt='true');
  begin
    update public.aufgaben set status = 'egal' where id = v_a;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (11,'Unbekannter Status abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  -- Notiz ohne Frist
  insert into public.aufgaben (mandant_id, titel, typ, tags, erstellt_von, zustaendig_id) values (c_m1, 'Idee: Flyer für Nordend', 'notiz', array['marketing','idee'], c_chef, c_chef);
  select count(*) into v_n from public.aufgaben where typ = 'notiz' and 'idee' = any(tags);
  insert into erg values (12,'Notiz mit Tags','1',v_n::text,v_n=1);
  insert into public.aufgaben_tags (mandant_id, name, farbe) values (c_m1, 'idee', '#B5934F');
  begin
    insert into public.aufgaben_tags (mandant_id, name) values (c_m1, 'idee');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (13,'Tag je Mandant eindeutig','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Checklisten -----------------------------------------------------------------------
  select public.checklisten_standard_anlegen() into v_n;
  insert into erg values (14,'Vier Standardvorlagen angelegt','4',v_n::text,v_n=4);
  select public.checklisten_standard_anlegen() into v_n;
  insert into erg values (15,'Zweiter Aufruf legt nichts doppelt an','0',v_n::text,v_n=0);
  select id into v_v from public.checklisten_vorlagen where name = 'Unterlagen Verkauf';
  -- Ein Grundriss liegt schon am Objekt
  insert into public.objekt_dokumente (mandant_id, objekt_id, pfad, dateiname, art, erstellt_von) values (c_m1, 'cccccccc-0000-0000-0000-0000000000c1', 'x/c1/grundriss.pdf', 'grundriss.pdf', 'grundriss', c_chef);
  select public.checkliste_aus_vorlage(v_v, 'cccccccc-0000-0000-0000-0000000000c1') into v_c;
  select count(*) into v_n from public.checklisten_punkte where checkliste_id = v_c;
  insert into erg values (16,'Punkte aus der Vorlage','9',v_n::text,v_n=9);
  select status || '/' || (dokument_id is not null)::text into v_txt from public.checklisten_punkte where checkliste_id = v_c and dokumentart = 'grundriss';
  insert into erg values (17,'Vorhandene Unterlage gilt sofort','erledigt/true',v_txt,v_txt='erledigt/true');
  select faellig_am = current_date + 14 into v_txt from public.checklisten_punkte where checkliste_id = v_c and dokumentart = 'energieausweis';
  insert into erg values (18,'Frist aus der Vorlage','true',v_txt,v_txt='true');
  -- Neue Unterlage erledigt den Punkt
  insert into public.objekt_dokumente (mandant_id, objekt_id, pfad, dateiname, art, erstellt_von) values (c_m1, 'cccccccc-0000-0000-0000-0000000000c1', 'x/c1/energie.pdf', 'energie.pdf', 'energieausweis', c_chef) returning id into v_d;
  select status || '/' || (dokument_id = v_d)::text into v_txt from public.checklisten_punkte where checkliste_id = v_c and dokumentart = 'energieausweis';
  insert into erg values (19,'Hochgeladene Unterlage erledigt den Punkt','erledigt/true',v_txt,v_txt='erledigt/true');
  select (abgeschlossen_am is null)::text into v_txt from public.checklisten where id = v_c;
  insert into erg values (20,'Checkliste noch offen','true',v_txt,v_txt='true');
  update public.checklisten_punkte set status = 'erledigt' where checkliste_id = v_c and pflicht and status = 'offen';
  update public.checklisten_punkte set status = 'nicht_noetig' where checkliste_id = v_c and not pflicht;
  select (abgeschlossen_am is not null)::text into v_txt from public.checklisten where id = v_c;
  insert into erg values (21,'Alle Pflichtpunkte erledigt → abgeschlossen','true',v_txt,v_txt='true');
  update public.checklisten_punkte set status = 'offen' where checkliste_id = v_c and dokumentart = 'expose';
  select (abgeschlossen_am is null)::text into v_txt from public.checklisten where id = v_c;
  insert into erg values (22,'Wieder geoeffneter Pflichtpunkt hebt Abschluss auf','true',v_txt,v_txt='true');
  begin
    select public.checkliste_aus_vorlage(v_v, 'cccccccc-0000-0000-0000-0000000000c2') into v_c;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (23,'Checkliste an fremdem Objekt abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.checklisten (mandant_id, name) values (c_m1, 'Ohne Bezug');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (24,'Checkliste ohne Bezug abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Tutorial-Merker am eigenen Konto ---------------------------------------------
  update public.benutzer set tutorial_gesehen_am = now() where id = c_chef;
  select (tutorial_gesehen_am is not null)::text into v_txt from public.benutzer where id = c_chef;
  insert into erg values (25,'Tutorial-Merker gesetzt','true',v_txt,v_txt='true');

  -- --- Mandantentrennung ---------------------------------------------------------------
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333c3333","role":"authenticated"}';
  select count(*) into v_n from public.aufgaben_schritte; insert into erg values (26,'Fremder Mandant sieht keine Schritte','0',v_n::text,v_n=0);
  select count(*) into v_n from public.aufgaben_kommentare; insert into erg values (27,'Fremder Mandant sieht keine Kommentare','0',v_n::text,v_n=0);
  select count(*) into v_n from public.checklisten; insert into erg values (28,'Fremder Mandant sieht keine Checklisten','0',v_n::text,v_n=0);
  select count(*) into v_n from public.checklisten_vorlagen; insert into erg values (29,'Fremder Mandant sieht keine Vorlagen','0',v_n::text,v_n=0);
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
