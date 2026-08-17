-- ===========================================================================
-- Nachweis der Matching-Regeln (Master-Prompt Abschnitt 7)
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/matching.sql
--
-- Fachlicher Kern: Ausschlusskriterien (Vermarktungsart, Kategorie, Ort,
-- Preisrahmen) schliessen wirklich aus. Weiche Kriterien bestimmen nur die
-- Reihenfolge. Eine Trefferliste voller entfernter Objekte wird nicht benutzt.
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

insert into public.objekte (id,mandant_id,bezeichnung,vermarktungsart,objektkategorie,status,ort,plz,wohnflaeche,zimmer,kaufpreis,kaltmiete) values
  ('c0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Passend','kauf','wohnung','aktiv','Kiel','24103',80,3,340000,null),
  ('c0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Zu teuer','kauf','wohnung','aktiv','Kiel','24103',80,3,900000,null),
  ('c0000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','Falsche Kategorie','kauf','gewerbe','aktiv','Kiel','24103',80,3,300000,null),
  ('c0000000-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','Mietobjekt','miete','wohnung','aktiv','Kiel','24103',80,3,null,900),
  ('c0000000-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','Anderer Ort','kauf','wohnung','aktiv','Hamburg','20095',80,3,320000,null),
  ('c0000000-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000001','Kleiner','kauf','wohnung','aktiv','Kiel','24103',48,2,300000,null),
  ('d0000000-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000002','Fremd','kauf','wohnung','aktiv','Kiel','24103',80,3,300000,null);

insert into public.kontakte (id,mandant_id,nachname) values
  ('e0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Petersen');
insert into public.suchprofile (id,mandant_id,kontakt_id,bezeichnung,vermarktungsart,objektkategorien,preis_bis,flaeche_von,zimmer_von,orte) values
  ('f0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',
   'ETW Kiel bis 400k','kauf','{wohnung}',400000,70,3,'{Kiel}');

do $$
declare v int; v_txt text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

  v := public.treffer_fuer_profil('f0000000-0000-0000-0000-000000000001');
  select string_agg(o.bezeichnung, ', ' order by o.bezeichnung) into v_txt
    from public.treffer t join public.objekte o on o.id=t.objekt_id;
  insert into erg values (1,'Nur ortsrichtige, bezahlbare Wohnungen','Kleiner, Passend',coalesce(v_txt,'-'),v_txt='Kleiner, Passend');

  select punktzahl into v from public.treffer where objekt_id='c0000000-0000-0000-0000-000000000001';
  insert into erg values (2,'Alle Wuensche erfuellt ergibt 100','100',v::text,v=100);
  select punktzahl into v from public.treffer where objekt_id='c0000000-0000-0000-0000-000000000006';
  insert into erg values (3,'Zu klein und zu wenig Zimmer sinkt auf 40','40',v::text,v=40);

  select count(*) into v from public.treffer where objekt_id='c0000000-0000-0000-0000-000000000005';
  insert into erg values (4,'Falscher Ort schliesst aus','0',v::text,v=0);
  select count(*) into v from public.treffer where objekt_id='c0000000-0000-0000-0000-000000000002';
  insert into erg values (5,'Ueber dem Preisrahmen schliesst aus','0',v::text,v=0);
  select count(*) into v from public.treffer where objekt_id='c0000000-0000-0000-0000-000000000003';
  insert into erg values (6,'Falsche Kategorie schliesst aus','0',v::text,v=0);
  select count(*) into v from public.treffer where objekt_id='c0000000-0000-0000-0000-000000000004';
  insert into erg values (7,'Miete trifft kein Kaufprofil','0',v::text,v=0);

  select count(*) into v from public.treffer t join public.objekte o on o.id=t.objekt_id
   where o.mandant_id <> 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into erg values (8,'Kein Treffer ueber die Mandantengrenze','0',v::text,v=0);

  -- Bereits bearbeitete Treffer duerfen nicht ueberschrieben werden.
  update public.treffer set status='abgelehnt' where objekt_id='c0000000-0000-0000-0000-000000000001';
  v := public.treffer_fuer_objekt('c0000000-0000-0000-0000-000000000001');
  select status::text into v_txt from public.treffer where objekt_id='c0000000-0000-0000-0000-000000000001';
  insert into erg values (9,'Abgelehnter Treffer bleibt abgelehnt','abgelehnt',v_txt,v_txt='abgelehnt');

  -- Wer keinen Ort angibt, sucht bewusst ueberall.
  update public.suchprofile set orte='{}' where id='f0000000-0000-0000-0000-000000000001';
  delete from public.treffer;
  v := public.treffer_fuer_profil('f0000000-0000-0000-0000-000000000001');
  select count(*) into v from public.treffer where objekt_id='c0000000-0000-0000-0000-000000000005';
  insert into erg values (10,'Ohne Ortsangabe wird ueberall gesucht','1',v::text,v=1);

  reset role;
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
