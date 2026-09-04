-- ===========================================================================
-- Nachweis: Kalender-Ausbau — Teilnehmer, private Termine, Erinnerungen,
-- Nachfassen, Serie loeschen, ICS-Token und Feed, Geokodierung, Mandanten-
-- trennung
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role, anon;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-1111111e1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chefk@test.invalid','x',now(),now(),now()),
  ('22222222-2222-2222-2222-2222222e2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','maklerk@test.invalid','x',now(),now(),now()),
  ('44444444-4444-4444-4444-4444444e4444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','kollegek@test.invalid','x',now(),now(),now()),
  ('33333333-3333-3333-3333-3333333e3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fremdk@test.invalid','x',now(),now(),now());
insert into public.mandanten (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'Mandant KA', 'mandant-ka'),
  ('bbbbbbbb-0000-0000-0000-0000000000e2', 'Mandant KB', 'mandant-kb');
insert into public.benutzer (id, mandant_id, name, email, rolle) values
  ('11111111-1111-1111-1111-1111111e1111', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'Chefin', 'chefk@test.invalid', 'inhaber'),
  ('22222222-2222-2222-2222-2222222e2222', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'Makler', 'maklerk@test.invalid', 'makler'),
  ('44444444-4444-4444-4444-4444444e4444', 'aaaaaaaa-0000-0000-0000-0000000000e1', 'Kollege', 'kollegek@test.invalid', 'makler'),
  ('33333333-3333-3333-3333-3333333e3333', 'bbbbbbbb-0000-0000-0000-0000000000e2', 'Fremd', 'fremdk@test.invalid', 'inhaber');

do $$
declare
  v_fehler text; v_txt text; v_n int; v_id uuid; v_j jsonb; v_serie uuid := gen_random_uuid(); v_tok text; v_tok2 text; v_arr text[];
  c_m1 constant uuid := 'aaaaaaaa-0000-0000-0000-0000000000e1';
  c_makler constant uuid := '22222222-2222-2222-2222-2222222e2222';
  c_kollege constant uuid := '44444444-4444-4444-4444-4444444e4444';
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222e2222","role":"authenticated"}';

  -- Teilnehmer: Zustaendiger wird automatisch ergaenzt, fremde Benutzer abgewiesen
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, zustaendig_id, teilnehmer, erstellt_von, erinnerung_minuten)
    values (c_m1, 'Besichtigung A', 'besichtigung', now() + interval '2 hours', now() + interval '3 hours', c_makler, array[c_kollege], c_makler, 360)
    returning id into v_id;
  select array_length(teilnehmer, 1) into v_n from public.termine where id = v_id;
  insert into erg values (1,'Zustaendiger wird Teilnehmer','2',v_n::text,v_n=2);
  begin
    insert into public.termine (mandant_id, titel, beginnt_am, endet_am, zustaendig_id, teilnehmer, erstellt_von)
      values (c_m1, 'Fremd', now(), now() + interval '1 hour', c_makler, array['33333333-3333-3333-3333-3333333e3333'::uuid], c_makler);
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (2,'Fremder Teilnehmer abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- Erinnerung faellig (6 h vorher, Termin in 2 h) — Dienstrolle
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select count(*) into v_n from public.termine_erinnerungen_faellig(50) where id = v_id;
  insert into erg values (3,'Erinnerung ist faellig','1',v_n::text,v_n=1);
  select empfaenger into v_arr from public.termine_erinnerungen_faellig(50) where id = v_id;
  insert into erg values (4,'Erinnerung geht an Zustaendigen und Teilnehmer','2',array_length(v_arr,1)::text,array_length(v_arr,1)=2 and 'kollegek@test.invalid' = any(v_arr));
  perform public.termin_erinnert(v_id);
  select count(*) into v_n from public.termine_erinnerungen_faellig(50) where id = v_id;
  insert into erg values (5,'Nach dem Versand nicht mehr faellig','0',v_n::text,v_n=0);

  -- Nachfassen: Besichtigung gestern → Aufgabe fuer den Zustaendigen
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222e2222","role":"authenticated"}';
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, zustaendig_id, erstellt_von)
    values (c_m1, 'Besichtigung gestern', 'besichtigung', now() - interval '26 hours', now() - interval '25 hours', c_makler, c_makler);
  insert into public.termine (mandant_id, titel, art, beginnt_am, endet_am, zustaendig_id, erstellt_von, nachfassen)
    values (c_m1, 'Ohne Nachfassen', 'besichtigung', now() - interval '26 hours', now() - interval '25 hours', c_makler, c_makler, false);
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select public.besichtigungen_nachfassen() into v_n;
  insert into erg values (6,'Eine Nachfass-Aufgabe entsteht','1',v_n::text,v_n=1);
  select count(*) into v_n from public.aufgaben where titel like 'Nachfassen: Besichtigung gestern%' and zustaendig_id = c_makler and quelle = 'termin';
  insert into erg values (7,'Aufgabe beim Zustaendigen mit Terminbezug','1',v_n::text,v_n=1);
  select public.besichtigungen_nachfassen() into v_n;
  insert into erg values (8,'Kein doppeltes Nachfassen','0',v_n::text,v_n=0);

  -- Private Termine: Kollege sieht sie nicht, Beteiligte und Verwaltung schon
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222e2222","role":"authenticated"}';
  insert into public.termine (mandant_id, titel, beginnt_am, endet_am, zustaendig_id, erstellt_von, privat)
    values (c_m1, 'Privat Zahnarzt', now() + interval '1 day', now() + interval '1 day 1 hour', c_makler, c_makler, true);
  set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-4444444e4444","role":"authenticated"}';
  select count(*) into v_n from public.termine where titel = 'Privat Zahnarzt';
  insert into erg values (9,'Kollege sieht private Termine nicht','0',v_n::text,v_n=0);
  select count(*) into v_n from public.termine where titel = 'Besichtigung A';
  insert into erg values (10,'Kollege sieht Termine, an denen er teilnimmt','1',v_n::text,v_n=1);
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111e1111","role":"authenticated"}';
  select count(*) into v_n from public.termine where titel = 'Privat Zahnarzt';
  insert into erg values (11,'Verwaltung sieht private Termine','1',v_n::text,v_n=1);

  -- Serie: diesen oder alle folgenden loeschen (weich)
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222e2222","role":"authenticated"}';
  insert into public.termine (mandant_id, titel, beginnt_am, endet_am, zustaendig_id, erstellt_von, serie_id, serie_regel)
    select c_m1, 'Serie ' || g, now() + (g || ' days')::interval, now() + (g || ' days')::interval + interval '1 hour', c_makler, c_makler, v_serie, '{"takt":"tag","intervall":1}'::jsonb from generate_series(1, 5) g;
  select id into v_id from public.termine where titel = 'Serie 3';
  select public.termin_loeschen(v_id, false) into v_n;
  insert into erg values (12,'Einzelnen Serientermin loeschen','1',v_n::text,v_n=1);
  select id into v_id from public.termine where titel = 'Serie 4';
  select public.termin_loeschen(v_id, true) into v_n;
  insert into erg values (13,'Alle folgenden loeschen (4 und 5)','2',v_n::text,v_n=2);
  select count(*) into v_n from public.termine where serie_id = v_serie and geloescht_am is null;
  insert into erg values (14,'Serie 1 und 2 bleiben','2',v_n::text,v_n=2);

  -- ICS-Token: nur ueber die Funktion, erneuerbar; Feed ueber Dienstrolle
  select public.kalender_token_lesen(false) into v_tok;
  insert into erg values (15,'Token vorhanden (48 Zeichen)','48',length(v_tok)::text,length(v_tok)=48);
  select public.kalender_token_lesen(true) into v_tok2;
  insert into erg values (16,'Token erneuert','verschieden',case when v_tok2 <> v_tok then 'verschieden' else 'gleich' end,v_tok2<>v_tok);
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select count(*) into v_n from public.kalender_feed(v_tok2);
  insert into erg values (17,'Feed liefert die Termine des Maklers (ohne geloeschte)','6',v_n::text,v_n=6);
  select count(*) into v_n from public.kalender_feed(v_tok);
  insert into erg values (18,'Alter Token liefert nichts','0',v_n::text,v_n=0);
  select count(*) into v_n from public.kalender_feed('kurz');
  insert into erg values (19,'Zu kurzer Token liefert nichts','0',v_n::text,v_n=0);

  -- Geokodierung: Cache ohne direkten Tabellenzugriff
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222e2222","role":"authenticated"}';
  perform public.geokodierung_merken('  Musterweg 1,  60311 Frankfurt ', 50.11, 8.68);
  select public.geokodierung_holen('musterweg 1, 60311 frankfurt') into v_j;
  insert into erg values (20,'Geokodierung normalisiert und gefunden','50.11',v_j->>'lat',(v_j->>'lat')='50.11');
  begin
    select count(*) into v_n from public.geokodierung;
    v_fehler := v_n::text;
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (21,'Kein direkter Zugriff auf den Cache','0/abgewiesen',v_fehler,v_fehler in ('0','abgewiesen'));

  -- Mandantentrennung
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333e3333","role":"authenticated"}';
  select count(*) into v_n from public.termine;
  insert into erg values (22,'Fremder Mandant sieht keine Termine','0',v_n::text,v_n=0);
  begin
    select public.termin_loeschen((select id from public.termine where titel = 'Serie 1' limit 1), false) into v_n;
    v_fehler := 'angenommen';
  exception when others then v_fehler := 'abgewiesen'; end;
  insert into erg values (23,'Fremder Mandant loescht keine Termine','abgewiesen',v_fehler,v_fehler='abgewiesen');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
