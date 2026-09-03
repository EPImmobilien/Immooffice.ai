-- ===========================================================================
-- Nachweis: Verkauf — Vertragsarten, Uebergabeprotokolle, Notar-Laufzettel,
-- Mandantentrennung, Schutz abgeschlossener Protokolle, Credit-Preise
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111e1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chefv@test.invalid','x',now(),now(),now()),
  ('22222222-2222-2222-2222-2222222e2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','maklerv@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333e3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremdv@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'Mandant VA', 'mandant-va'),
  ('bbbbbbbb-0000-0000-0000-0000000000e2', 'Mandant VB', 'mandant-vb');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111e1111', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'Chefin', 'chefv@test.invalid', 'inhaber'),
  ('22222222-2222-2222-2222-2222222e2222', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'Makler', 'maklerv@test.invalid', 'makler'),
  ('33333333-3333-3333-3333-3333333e3333', 'bbbbbbbb-0000-0000-0000-0000000000e2', 'Fremd', 'fremdv@test.invalid', 'inhaber');
insert into public.objekte (id, mandant_id, objektnummer, bezeichnung) values
  ('cccccccc-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'V-1', 'Objekt A'),
  ('cccccccc-0000-0000-0000-0000000000e2', 'bbbbbbbb-0000-0000-0000-0000000000e2', 'V-2', 'Objekt B');

do $$
declare
  v_fehler text; v_txt text; v_n int; v_id uuid; v_v uuid;
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000e1';
  c_m2 constant uuid := 'bbbbbbbb-0000-0000-0000-0000000000e2';
begin
  -- --- Vertragsarten und neue Spalten ------------------------------------------------
  select count(*) into v_n from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'vertragsart' and e.enumlabel in ('vollmacht', 'objektnachweis', 'mietvertrag');
  insert into erg values (1,'Drei neue Vertragsarten vorhanden','3',v_n::text,v_n=3);

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222e2222","role":"authenticated"}';
  insert into public.vertraege (mandant_id, objekt_id, art, titel, inhalt, daten, vollmacht_mitgenerieren, quelle)
  values (c_m1, 'cccccccc-0000-0000-0000-0000000000e1', 'objektnachweis', 'Nachweis', 'Text', '{"kaeufer":[{"name":"Test"}]}'::jsonb, false, 'vorlage')
  returning id into v_v;
  select daten->'kaeufer'->0->>'name' into v_txt from public.vertraege where id = v_v;
  insert into erg values (2,'Makler legt Objektnachweis mit Formulardaten an','Test',v_txt,v_txt='Test');
  begin
    insert into public.vertraege (mandant_id, art, titel, quelle) values (c_m1, 'maklervertrag', 'Falsch', 'egal');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (3,'Unbekannte Herkunft wird abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Uebergabeprotokoll --------------------------------------------------------------
  insert into public.uebergabeprotokolle (mandant_id, objekt_id, vertrag_id, kontext, typ, bezeichnung, schluessel, zaehler)
  values (c_m1, 'cccccccc-0000-0000-0000-0000000000e1', v_v, 'verkauf', 'uebergabe', 'Uebergabe Objekt A',
          '[{"art":"haustuer","anzahl":2}]'::jsonb, '[{"art":"strom","stand":"1234"}]'::jsonb)
  returning id into v_id;
  insert into erg values (4,'Makler legt Uebergabeprotokoll an','angelegt','angelegt',true);
  begin
    insert into public.uebergabeprotokolle (mandant_id, kontext, typ, bezeichnung) values (c_m1, 'verkauf', 'einzug', 'Falsch');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (5,'Typ muss zum Kontext passen (Verkauf ohne Einzug)','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    insert into public.uebergabeprotokolle (mandant_id, objekt_id, kontext, typ, bezeichnung)
    values (c_m1, 'cccccccc-0000-0000-0000-0000000000e2', 'verkauf', 'uebergabe', 'Fremdes Objekt');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (6,'Objekt eines fremden Mandanten wird abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  update public.uebergabeprotokolle set status = 'abgeschlossen', abgeschlossen_am = now(),
    unterschriften = '{"uebergeber":{"name":"A","zeit":"2026-09-04T10:00:00Z"}}'::jsonb where id = v_id;
  select status into v_txt from public.uebergabeprotokolle where id = v_id;
  insert into erg values (7,'Protokoll abschliessen','abgeschlossen',v_txt,v_txt='abgeschlossen');
  begin
    update public.uebergabeprotokolle set zaehler = '[]'::jsonb where id = v_id;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (8,'Abgeschlossenes Protokoll ist unveraenderlich','abgewiesen',v_fehler,v_fehler='abgewiesen');
  update public.uebergabeprotokolle set pdf_pfad = 'x/y.pdf' where id = v_id;
  insert into erg values (9,'PDF-Pfad darf nachgetragen werden','ok','ok',true);

  -- --- Notar-Laufzettel -----------------------------------------------------------------
  insert into public.notar_laufzettel (mandant_id, objekt_id, vertrag_id, objektnachweis_id, bezeichnung, daten)
  values (c_m1, 'cccccccc-0000-0000-0000-0000000000e1', v_v, v_v, 'Laufzettel A', '{"kaufpreis":{"gesamt":"350000"}}'::jsonb)
  returning id into v_id;
  select daten->'kaufpreis'->>'gesamt' into v_txt from public.notar_laufzettel where id = v_id;
  insert into erg values (10,'Laufzettel mit Daten angelegt','350000',v_txt,v_txt='350000');
  begin
    update public.notar_laufzettel set status = 'fertig' where id = v_id;
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (11,'Unbekannter Status wird abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  update public.notar_laufzettel set status = 'versendet', versendet_am = now() where id = v_id;
  select status into v_txt from public.notar_laufzettel where id = v_id;
  insert into erg values (12,'Status versendet','versendet',v_txt,v_txt='versendet');

  -- --- Mandantentrennung ----------------------------------------------------------------
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333e3333","role":"authenticated"}';
  select count(*) into v_n from public.uebergabeprotokolle;
  insert into erg values (13,'Fremder Mandant sieht keine Uebergabeprotokolle','0',v_n::text,v_n=0);
  select count(*) into v_n from public.notar_laufzettel;
  insert into erg values (14,'Fremder Mandant sieht keine Laufzettel','0',v_n::text,v_n=0);
  begin
    update public.notar_laufzettel set bezeichnung = 'Gekapert' where id = v_id;
    get diagnostics v_n = row_count;
  exception when others then v_n := 0; end;
  insert into erg values (15,'Fremder Mandant aendert nichts','0',v_n::text,v_n=0);
  begin
    insert into public.notar_laufzettel (mandant_id, bezeichnung) values (c_m1, 'Eingeschleust');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (16,'Fremder Mandant kann nichts fuer andere anlegen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Lesemodus ------------------------------------------------------------------------
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  update public.mandanten set abo_status = 'test', testphase_bis = now() - interval '1 day' where id = c_m1;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111e1111","role":"authenticated"}';
  begin
    insert into public.uebergabeprotokolle (mandant_id, kontext, typ, bezeichnung) values (c_m1, 'vermietung', 'einzug', 'Lesemodus');
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (17,'Im Lesemodus kein neues Protokoll','abgewiesen',v_fehler,v_fehler='abgewiesen');
  select count(*) into v_n from public.uebergabeprotokolle;
  insert into erg values (18,'Im Lesemodus bleibt Lesen moeglich','1',v_n::text,v_n=1);

  -- --- Credit-Preise --------------------------------------------------------------------
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select credits::text into v_txt from public.credit_preise where aktion = 'ki_dokument_import';
  insert into erg values (19,'Dokumentimport kostet 5 Credits','5',v_txt,v_txt='5');
  select credits::text into v_txt from public.credit_preise where aktion = 'ki_bild_auslesen';
  insert into erg values (20,'Bildauslesung kostet 1 Credit','1',v_txt,v_txt='1');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
