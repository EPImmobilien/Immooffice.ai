-- ===========================================================================
-- Nachweis der Bildregeln (Master-Prompt Abschnitt 11)
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/bilder.sql
--
-- Fachlicher Kern: Das Original bleibt unveraendert, jede Bearbeitung ist eine
-- eigene Version mit Verweis, und die Kennzeichnung einer KI-Bearbeitung laesst
-- sich nicht nachtraeglich entfernen. Eine Kennzeichnung, die per Update
-- verschwindet, waere keine.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.invalid','x',now(),now(),now());
insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Mandant A','mandant-a'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Mandant B','mandant-b');
insert into public.benutzer (id,mandant_id,name,email,rolle) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Nutzer A','a@test.invalid','inhaber');

insert into public.objekte (id,mandant_id,bezeichnung,vermarktungsart,objektkategorie,status) values
  ('c0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Objekt A','kauf','wohnung','aktiv'),
  ('d0000000-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000002','Objekt B','kauf','wohnung','aktiv');

insert into public.objekt_bilder (id,mandant_id,objekt_id,pfad,art,ist_titelbild) values
  ('b0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001/original.jpg','foto',true);
insert into public.objekt_bilder (id,mandant_id,objekt_id,pfad,art) values
  ('b0000000-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000002',
   'd0000000-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000002/d0000000-0000-0000-0000-000000000009/fremd.jpg','foto');

do $$
declare v int; v_txt text; v_fehler text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

  select count(*) into v from public.objekt_bilder;
  insert into erg values (1,'Nur eigene Bilder sichtbar','1',v::text,v=1);

  -- Eine Bearbeitung entsteht als neuer Datensatz mit Verweis auf das Original.
  insert into public.objekt_bilder (mandant_id,objekt_id,pfad,art,original_id,bearbeitung,ki_bearbeitet)
  values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001/v2.jpg','foto',
          'b0000000-0000-0000-0000-000000000001','Himmel aufgehellt',true);
  select count(*) into v from public.objekt_bilder where objekt_id='c0000000-0000-0000-0000-000000000001';
  insert into erg values (2,'Bearbeitung ergibt eine zweite Version','2',v::text,v=2);

  select pfad into v_txt from public.objekt_bilder where id='b0000000-0000-0000-0000-000000000001';
  insert into erg values (3,'Original bleibt unveraendert erhalten',
    'aaaaaaaa-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001/original.jpg', v_txt,
    v_txt='aaaaaaaa-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001/original.jpg');

  -- Eine Bearbeitung ohne Beschreibung waere spaeter nicht nachvollziehbar.
  begin
    insert into public.objekt_bilder (mandant_id,objekt_id,pfad,original_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001/v3.jpg',
            'b0000000-0000-0000-0000-000000000001');
    v_fehler := 'kein Fehler';
  exception when check_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (4,'Bearbeitung ohne Beschreibung abgelehnt','abgelehnt',v_fehler,v_fehler='abgelehnt');

  -- Kern von Abschnitt 11: Das Kennzeichen laesst sich nicht entfernen.
  begin
    update public.objekt_bilder set ki_bearbeitet=false
     where original_id='b0000000-0000-0000-0000-000000000001';
    v_fehler := 'kein Fehler';
  exception when others then v_fehler := 'abgelehnt';
  end;
  insert into erg values (5,'KI-Kennzeichen nicht entfernbar','abgelehnt',v_fehler,v_fehler='abgelehnt');

  -- Der Pfad ist unveraenderlich; sonst liesse sich das Original still ersetzen.
  begin
    update public.objekt_bilder set pfad='aaaaaaaa-0000-0000-0000-000000000001/x.jpg'
     where id='b0000000-0000-0000-0000-000000000001';
    v_fehler := 'kein Fehler';
  exception when others then v_fehler := 'abgelehnt';
  end;
  insert into erg values (6,'Bildpfad unveraenderlich','abgelehnt',v_fehler,v_fehler='abgelehnt');

  -- Hoechstens ein Titelbild je Objekt.
  begin
    insert into public.objekt_bilder (mandant_id,objekt_id,pfad,ist_titelbild)
    values ('aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001/v4.jpg',true);
    v_fehler := 'kein Fehler';
  exception when unique_violation then v_fehler := 'abgelehnt';
  end;
  insert into erg values (7,'Nur ein Titelbild je Objekt','abgelehnt',v_fehler,v_fehler='abgelehnt');

  -- Fremde Bilder sind auch mit bekannter ID nicht erreichbar.
  update public.objekt_bilder set titel='uebernommen'
   where id='b0000000-0000-0000-0000-000000000009';
  select count(*) into v from public.objekt_bilder where titel='uebernommen';
  insert into erg values (8,'Fremdes Bild nicht aenderbar','0',v::text,v=0);

  delete from public.objekt_bilder where id='b0000000-0000-0000-0000-000000000009';
  reset role;
  select count(*) into v from public.objekt_bilder where id='b0000000-0000-0000-0000-000000000009';
  insert into erg values (9,'Fremdes Bild nicht loeschbar','1',v::text,v=1);

  -- Das Loeschen des Originals nimmt die Bearbeitungen mit: eine Version ohne
  -- Original waere ein Bild ohne Herkunft.
  delete from public.objekt_bilder where id='b0000000-0000-0000-0000-000000000001';
  select count(*) into v from public.objekt_bilder where objekt_id='c0000000-0000-0000-0000-000000000001';
  insert into erg values (10,'Loeschen des Originals entfernt die Versionen','0',v::text,v=0);
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
