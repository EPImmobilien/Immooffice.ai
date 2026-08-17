-- ===========================================================================
-- Nachweis: Verweise ueberschreiten den Mandanten nicht
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/verweise-mandantenrein.sql
--
-- Hintergrund: Jede Policy prueft den eigenen `mandant_id` der Zeile. Ein
-- Datensatz mit dem EIGENEN Mandanten, aber einem FREMDEN `objekt_id` oder
-- `kontakt_id` kam damit durch — die Fremdschluessel verweisen auf die Tabelle,
-- nicht auf den Mandanten.
--
-- Ein Datenleck war das nicht: Beim Lesen filtert die Row-Level-Security der
-- Zieltabelle, ein solcher Verweis liefert also nichts. Es entstanden aber
-- Zeilen, die auf Fremdes zeigen — eine Aufgabe zu einem unsichtbaren Objekt,
-- ein Verlaufseintrag an einem fremden Kontakt. Bei jeder spaeteren Auswertung
-- ist das eine Fehlerquelle, und die naechste Policy, die ueber einen solchen
-- Verweis joint, macht daraus ein echtes Problem.
--
-- Geprueft wird ausserdem die Gegenrichtung: Was stimmig ist, muss weiter
-- durchlaufen. Eine Haertung, die den Normalfall mit abwuergt, ist keine.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to anon, authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-11111111aaaa','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a2@test.invalid','x',now(),now(),now());

insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000b1','Mandant A','mandant-a'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2','Mandant B','mandant-b');
insert into public.benutzer (id,mandant_id,name,email,rolle) values
  ('11111111-1111-1111-1111-11111111aaaa','aaaaaaaa-0000-0000-0000-0000000000b1','Nutzer A','a2@test.invalid','inhaber');

insert into public.objekte (id,mandant_id,objektnummer,bezeichnung,vermarktungsart,objektkategorie,status) values
  ('c0000000-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000b1','0001','Objekt A','kauf','wohnung','aktiv'),
  ('d0000000-0000-0000-0000-0000000000b2','bbbbbbbb-0000-0000-0000-0000000000b2','9001','Objekt B','kauf','wohnung','aktiv');
insert into public.kontakte (id,mandant_id,nachname) values
  ('e0000000-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000b1','Eigen'),
  ('f0000000-0000-0000-0000-0000000000b2','bbbbbbbb-0000-0000-0000-0000000000b2','Fremd');

do $$
declare v_fehler text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-11111111aaaa","role":"authenticated"}';

  -- Eigener Mandant, aber FREMDER Kontakt. Genau das war vorher erlaubt.
  begin
    insert into public.kontakt_objekt (mandant_id,objekt_id,kontakt_id,rolle)
    values ('aaaaaaaa-0000-0000-0000-0000000000b1','c0000000-0000-0000-0000-0000000000b1',
            'f0000000-0000-0000-0000-0000000000b2','eigentuemer');
    v_fehler := 'DURCHGEKOMMEN';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (1,'Fremder Kontakt nicht verknuepfbar','abgelehnt',v_fehler,v_fehler='abgelehnt');

  begin
    insert into public.kontakt_objekt (mandant_id,objekt_id,kontakt_id,rolle)
    values ('aaaaaaaa-0000-0000-0000-0000000000b1','d0000000-0000-0000-0000-0000000000b2',
            'e0000000-0000-0000-0000-0000000000b1','eigentuemer');
    v_fehler := 'DURCHGEKOMMEN';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (2,'Fremdes Objekt nicht verknuepfbar','abgelehnt',v_fehler,v_fehler='abgelehnt');

  -- Gegenprobe: Was stimmig ist, muss durchlaufen.
  insert into public.kontakt_objekt (mandant_id,objekt_id,kontakt_id,rolle)
  values ('aaaaaaaa-0000-0000-0000-0000000000b1','c0000000-0000-0000-0000-0000000000b1',
          'e0000000-0000-0000-0000-0000000000b1','eigentuemer');
  insert into erg values (3,'Eigene Verknuepfung moeglich','angelegt','angelegt',true);

  begin
    insert into public.aufgaben (mandant_id,objekt_id,titel)
    values ('aaaaaaaa-0000-0000-0000-0000000000b1','d0000000-0000-0000-0000-0000000000b2','Fremd');
    v_fehler := 'DURCHGEKOMMEN';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (4,'Aufgabe an fremdem Objekt abgelehnt','abgelehnt',v_fehler,v_fehler='abgelehnt');

  begin
    insert into public.aktivitaeten (mandant_id,kontakt_id,typ,beschreibung)
    values ('aaaaaaaa-0000-0000-0000-0000000000b1','f0000000-0000-0000-0000-0000000000b2','notiz','Fremd');
    v_fehler := 'DURCHGEKOMMEN';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (5,'Verlauf an fremdem Kontakt abgelehnt','abgelehnt',v_fehler,v_fehler='abgelehnt');

  begin
    insert into public.objekt_dokumente (mandant_id,objekt_id,pfad,dateiname)
    values ('aaaaaaaa-0000-0000-0000-0000000000b1','d0000000-0000-0000-0000-0000000000b2','x/y.pdf','y.pdf');
    v_fehler := 'DURCHGEKOMMEN';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (6,'Unterlage an fremdem Objekt abgelehnt','abgelehnt',v_fehler,v_fehler='abgelehnt');

  -- Ein Zustaendiger, den es nicht gibt, ist derselbe Fehler wie ein fremder.
  begin
    insert into public.termine (mandant_id,titel,beginnt_am,endet_am,zustaendig_id)
    values ('aaaaaaaa-0000-0000-0000-0000000000b1','T','2026-09-01 10:00+02','2026-09-01 11:00+02',
            '99999999-9999-9999-9999-999999999999');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgelehnt';
  end;
  insert into erg values (7,'Termin mit unbekanntem Zustaendigen abgelehnt','abgelehnt',v_fehler,v_fehler='abgelehnt');

  -- Ein leerer Verweis bleibt erlaubt: Ein Rueckruf braucht kein Objekt.
  insert into public.aufgaben (mandant_id,titel) values
    ('aaaaaaaa-0000-0000-0000-0000000000b1','Rückruf ohne Bezug');
  insert into erg values (8,'Aufgabe ohne Bezug moeglich','angelegt','angelegt',true);
end $$;

-- Gegenprobe fuer Bilder: Original und Bearbeitung sind dasselbe Muster wie in
-- supabase/tests/bilder.sql und muessen weiter durchlaufen.
do $$
declare v int;
begin
  insert into public.objekt_bilder (id,mandant_id,objekt_id,pfad,art,ist_titelbild)
  values ('b0000000-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000b1',
          'c0000000-0000-0000-0000-0000000000b1',
          'aaaaaaaa-0000-0000-0000-0000000000b1/b1/original.jpg','foto',true);
  insert into public.objekt_bilder (mandant_id,objekt_id,pfad,art,original_id,bearbeitung,ki_bearbeitet)
  values ('aaaaaaaa-0000-0000-0000-0000000000b1','c0000000-0000-0000-0000-0000000000b1',
          'aaaaaaaa-0000-0000-0000-0000000000b1/b1/v2.jpg','foto',
          'b0000000-0000-0000-0000-0000000000b1','Himmel aufgehellt',true);

  select count(*) into v from public.objekt_bilder
   where objekt_id='c0000000-0000-0000-0000-0000000000b1';
  insert into erg values (9,'Bild und Bearbeitung laufen weiter durch','2',v::text,v=2);
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
