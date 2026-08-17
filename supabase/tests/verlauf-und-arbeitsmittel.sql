-- ===========================================================================
-- Nachweis fuer Dokumente, Verlauf, Aufgaben und Termine
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/verlauf-und-arbeitsmittel.sql
--
-- Fachlicher Kern:
--   1. Der Verlauf entsteht von selbst. Ein Objekt anzulegen, eine Unterlage
--      hochzuladen oder einen Termin einzutragen erzeugt einen Eintrag, ohne
--      dass die Anwendungsschicht daran denken muss.
--   2. Der Verlauf ist nachtraeglich NICHT aenderbar. Ein Protokoll, das man
--      glaetten kann, ist als Nachweis wertlos — etwa bei der Frage, wann ein
--      Interessent welche Unterlage bekommen hat.
--   3. Fremde Mandanten bleiben in allen vier Tabellen unerreichbar.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to anon, authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.invalid','x',now(),now(),now()),
       ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','l@test.invalid','x',now(),now(),now());

insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Mandant A','mandant-a'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Mandant B','mandant-b');

insert into public.benutzer (id,mandant_id,name,email,rolle) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Nutzer A','a@test.invalid','inhaber'),
  ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001','Nur Lesen','l@test.invalid','nur_lesen');

insert into public.objekte (id,mandant_id,objektnummer,bezeichnung,vermarktungsart,objektkategorie,status) values
  ('c0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','0001','Objekt A','kauf','wohnung','aktiv'),
  ('d0000000-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000002','9001','Objekt B','kauf','wohnung','aktiv');

-- Fremde Unterlage und fremder Verlaufseintrag als Koeder.
insert into public.objekt_dokumente (id,mandant_id,objekt_id,pfad,dateiname,art) values
  ('e0000000-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000002',
   'd0000000-0000-0000-0000-000000000009',
   'bbbbbbbb-0000-0000-0000-000000000002/d0000000-0000-0000-0000-000000000009/fremd.pdf',
   'fremd.pdf','grundbuchauszug');

do $$
declare v int; v_txt text; v_fehler text; v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

  -- --- 1. Automatischer Verlauf ------------------------------------------

  select count(*) into v from public.aktivitaeten
   where objekt_id='c0000000-0000-0000-0000-000000000001' and typ='objekt_angelegt';
  insert into erg values (1,'Anlegen eines Objekts erzeugt einen Verlaufseintrag','1',v::text,v=1);

  update public.objekte set status='reserviert'
   where id='c0000000-0000-0000-0000-000000000001';
  select beschreibung into v_txt from public.aktivitaeten
   where objekt_id='c0000000-0000-0000-0000-000000000001' and typ='status_geaendert';
  insert into erg values (3,'Statuswechsel wird mit Vorher und Nachher festgehalten',
    'Status geändert: aktiv → reserviert', v_txt,
    v_txt='Status geändert: aktiv → reserviert');

  insert into public.objekt_dokumente (mandant_id,objekt_id,pfad,dateiname,art,titel)
  values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001/grundriss.pdf',
          'grundriss.pdf','grundriss','Grundriss Erdgeschoss');
  select count(*) into v from public.aktivitaeten
   where objekt_id='c0000000-0000-0000-0000-000000000001' and typ='dokument_hinzugefuegt';
  insert into erg values (4,'Unterlage erzeugt einen Verlaufseintrag','1',v::text,v=1);

  -- Ein Verlauf ohne Verursacher taugt nicht als Nachweis. Hier laeuft eine
  -- Sitzung, also muss der Eintrag den angemeldeten Benutzer tragen.
  select benutzer_id into v_id from public.aktivitaeten
   where objekt_id='c0000000-0000-0000-0000-000000000001' and typ='dokument_hinzugefuegt';
  insert into erg values (2,'Verlauf haelt den Verursacher fest',
    '11111111-1111-1111-1111-111111111111', coalesce(v_id::text,'nicht gesetzt'),
    v_id='11111111-1111-1111-1111-111111111111');

  insert into public.termine (mandant_id,objekt_id,titel,art,beginnt_am,endet_am)
  values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
          'Besichtigung Familie Sommer','besichtigung',
          '2026-09-01 14:00+02','2026-09-01 15:00+02');
  select count(*) into v from public.aktivitaeten
   where objekt_id='c0000000-0000-0000-0000-000000000001' and typ='besichtigung';
  insert into erg values (5,'Termin erzeugt einen Verlaufseintrag','1',v::text,v=1);

  -- --- 2. Der Verlauf ist unveraenderbar ---------------------------------

  -- Kein UPDATE: Es gibt bewusst keine Policy dafuer. Unter
  -- Row-Level-Security bedeutet das „verboten" — die Anweisung laeuft ohne
  -- Fehler durch, trifft aber keine Zeile.
  update public.aktivitaeten set beschreibung='nachtraeglich geglaettet'
   where objekt_id='c0000000-0000-0000-0000-000000000001';
  select count(*) into v from public.aktivitaeten
   where beschreibung='nachtraeglich geglaettet';
  insert into erg values (6,'Verlaufseintrag laesst sich nicht aendern','0',v::text,v=0);

  select count(*) into v from public.aktivitaeten
   where objekt_id='c0000000-0000-0000-0000-000000000001';
  delete from public.aktivitaeten
   where objekt_id='c0000000-0000-0000-0000-000000000001';
  select count(*) into v_txt from public.aktivitaeten
   where objekt_id='c0000000-0000-0000-0000-000000000001';
  insert into erg values (7,'Verlaufseintrag laesst sich nicht loeschen',v::text,v_txt,v::text=v_txt);

  -- Eigene Eintraege anlegen bleibt moeglich: Notizen, Anrufe, Gespraeche.
  insert into public.aktivitaeten (mandant_id,objekt_id,typ,beschreibung)
  values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
          'anruf','Eigentümer über Besichtigung informiert');
  select count(*) into v from public.aktivitaeten
   where objekt_id='c0000000-0000-0000-0000-000000000001' and typ='anruf';
  insert into erg values (8,'Eigene Verlaufseintraege sind moeglich','1',v::text,v=1);

  -- Ein Eintrag ohne Bezug waere ein Protokoll ohne Gegenstand.
  begin
    insert into public.aktivitaeten (mandant_id,typ,beschreibung)
    values ('aaaaaaaa-0000-0000-0000-000000000001','notiz','ohne Bezug');
    v_fehler := 'kein Fehler';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (9,'Verlaufseintrag ohne Bezug wird abgelehnt','abgelehnt',v_fehler,v_fehler='abgelehnt');

  -- --- 3. Dokumente -------------------------------------------------------

  select count(*) into v from public.objekt_dokumente;
  insert into erg values (10,'Nur eigene Unterlagen sichtbar','1',v::text,v=1);

  select sichtbarkeit::text into v_txt from public.objekt_dokumente
   where dateiname='grundriss.pdf';
  insert into erg values (11,'Unterlagen sind ohne Zutun intern','intern',v_txt,v_txt='intern');

  -- Der Pfad darf sich nicht aendern: Der Datensatz wuerde sich sonst
  -- unbemerkt von der Datei entkoppeln.
  begin
    update public.objekt_dokumente set pfad='anderer/pfad.pdf' where dateiname='grundriss.pdf';
    v_fehler := 'kein Fehler';
  exception when others then v_fehler := 'abgelehnt';
  end;
  insert into erg values (12,'Dokumentpfad ist unveraenderlich','abgelehnt',v_fehler,v_fehler='abgelehnt');

  update public.objekt_dokumente set titel='uebernommen'
   where id='e0000000-0000-0000-0000-000000000009';
  select count(*) into v from public.objekt_dokumente where titel='uebernommen';
  insert into erg values (13,'Fremde Unterlage nicht aenderbar','0',v::text,v=0);

  -- --- 4. Aufgaben und Termine -------------------------------------------

  insert into public.aufgaben (mandant_id,objekt_id,titel,faellig_am,prioritaet)
  values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
          'Energieausweis anfordern','2026-09-05','hoch');
  select count(*) into v from public.aufgaben where erledigt_am is null;
  insert into erg values (14,'Aufgabe anlegen','1',v::text,v=1);

  -- „Fertig" ohne Verantwortlichen waere keine Erledigung.
  begin
    update public.aufgaben set erledigt_am=now() where titel='Energieausweis anfordern';
    v_fehler := 'kein Fehler';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (15,'Erledigen ohne Bearbeiter wird abgelehnt','abgelehnt',v_fehler,v_fehler='abgelehnt');

  update public.aufgaben
     set erledigt_am=now(), erledigt_von='11111111-1111-1111-1111-111111111111'
   where titel='Energieausweis anfordern';
  select count(*) into v from public.aufgaben where erledigt_am is not null;
  insert into erg values (16,'Erledigen mit Bearbeiter','1',v::text,v=1);

  -- Ein Termin, der vor seinem Beginn endet, ist ein Eingabefehler.
  begin
    insert into public.termine (mandant_id,titel,beginnt_am,endet_am)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Verdrehter Termin',
            '2026-09-01 15:00+02','2026-09-01 14:00+02');
    v_fehler := 'kein Fehler';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (17,'Termin mit verdrehtem Zeitraum wird abgelehnt','abgelehnt',v_fehler,v_fehler='abgelehnt');

  -- --- 5. Nur-Lese-Zugriff ------------------------------------------------

  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

  select count(*) into v from public.aktivitaeten
   where objekt_id='c0000000-0000-0000-0000-000000000001';
  insert into erg values (18,'Nur-Lese-Zugriff sieht den Verlauf', 'mehr als 0', v::text, v>0);

  begin
    insert into public.aufgaben (mandant_id,titel)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Von Nur-Lese angelegt');
    v_fehler := 'kein Fehler';
  exception when insufficient_privilege then v_fehler := 'abgelehnt';
  end;
  select count(*) into v from public.aufgaben where titel='Von Nur-Lese angelegt';
  insert into erg values (19,'Nur-Lese-Zugriff legt keine Aufgabe an','0',v::text,v=0);

  begin
    insert into public.aktivitaeten (mandant_id,objekt_id,typ,beschreibung)
    values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
            'notiz','Von Nur-Lese angelegt');
    v_fehler := 'kein Fehler';
  exception when insufficient_privilege then v_fehler := 'abgelehnt';
  end;
  select count(*) into v from public.aktivitaeten where beschreibung='Von Nur-Lese angelegt';
  insert into erg values (20,'Nur-Lese-Zugriff schreibt nicht in den Verlauf','0',v::text,v=0);
end $$;

-- --- 6. Ausfuehrungsrechte der Verlauf-Funktion -----------------------------
--
-- Lehre aus dem Befund zu `credits_gutschreiben`: Die Funktion nimmt eine
-- Mandanten-ID entgegen und laeuft mit erhoehten Rechten. Sie darf nicht ohne
-- Anmeldung erreichbar sein.
do $$
declare r text;
begin
  set local role anon;
  begin
    perform intern.verlauf_schreiben(
      'aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
      null,'notiz','Eingeschleust');
    r := 'DURCHGEKOMMEN';
  exception when others then r := 'abgewiesen';
  end;
  insert into erg values (21,'anon darf nicht in den Verlauf schreiben','abgewiesen',r,r='abgewiesen');
  reset role;
end $$;

-- --- 7. Vertrauliche Unterlagen bleiben intern ------------------------------
--
-- Die Sichtbarkeit ist eine Auswahl in der Oberflaeche, und eine Auswahl kann
-- falsch getroffen werden. Bei einem Grundbuchauszug ist ein Fehlklick nicht
-- zurueckzuholen — die Datei kann in derselben Minute heruntergeladen sein.
do $$
declare v_fehler text;
begin
  begin
    insert into public.objekt_dokumente (mandant_id,objekt_id,pfad,dateiname,art,sichtbarkeit)
    values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001/gb.pdf',
            'gb.pdf','grundbuchauszug','kunde');
    v_fehler := 'DURCHGEKOMMEN';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (22,'Grundbuchauszug nicht an Kunden freigebbar','abgelehnt',v_fehler,v_fehler='abgelehnt');

  insert into public.objekt_dokumente (mandant_id,objekt_id,pfad,dateiname,art,sichtbarkeit)
  values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001/gb2.pdf',
          'gb2.pdf','grundbuchauszug','intern');
  insert into erg values (23,'Grundbuchauszug intern moeglich','angelegt','angelegt',true);

  insert into public.objekt_dokumente (mandant_id,objekt_id,pfad,dateiname,art,sichtbarkeit)
  values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001/gr.pdf',
          'gr.pdf','grundriss','kunde');
  insert into erg values (24,'Grundriss an Kunden freigebbar','angelegt','angelegt',true);

  -- Auch nachtraegliches Umstellen per UPDATE muss scheitern.
  begin
    update public.objekt_dokumente set sichtbarkeit='kunde' where dateiname='gb2.pdf';
    v_fehler := 'DURCHGEKOMMEN';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (25,'Nachtraegliche Freigabe wird abgelehnt','abgelehnt',v_fehler,v_fehler='abgelehnt');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
