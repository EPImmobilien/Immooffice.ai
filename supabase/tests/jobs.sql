-- ===========================================================================
-- Nachweis: Auftragswarteschlange — Rechte, Wiederholung, Waechter, Credits
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/jobs.sql
--              oder scripts/db-lokal.sh
--
-- Kernfragen: Kann ein Benutzer fremde Auftraege beanspruchen? Werden
-- reservierte Credits beim endgueltigen Scheitern frei? Holt der Waechter
-- einen Auftrag zurueck, dessen Arbeiter verschwunden ist?
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, erwartet text, ist text, ok boolean) on commit drop;
grant all on erg to authenticated, service_role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-1111111a1111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm-a@test.invalid','x',now(),now(),now()),
       ('22222222-2222-2222-2222-2222222a2222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lese-a@test.invalid','x',now(),now(),now()),
       ('33333333-3333-3333-3333-3333333a3333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm-b@test.invalid','x',now(),now(),now());

insert into public.mandanten (id,name,slug) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','Mandant A','mandant-job-a'),
  ('bbbbbbbb-0000-0000-0000-0000000000a2','Mandant B','mandant-job-b');
insert into public.benutzer (id,mandant_id,name,email,rolle) values
  ('11111111-1111-1111-1111-1111111a1111','aaaaaaaa-0000-0000-0000-0000000000a1','Admin A','adm-a@test.invalid','administrator'),
  ('22222222-2222-2222-2222-2222222a2222','aaaaaaaa-0000-0000-0000-0000000000a1','Leser A','lese-a@test.invalid','nur_lesen'),
  ('33333333-3333-3333-3333-3333333a3333','bbbbbbbb-0000-0000-0000-0000000000a2','Admin B','adm-b@test.invalid','administrator');

-- Credits fuer Mandant A, damit ein Vorgang reserviert werden kann.
insert into public.credit_konto (mandant_id, herkunft, menge, gueltig_bis)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'test', 100, now() + interval '30 days');

do $$
declare
  v_fehler text; v_txt text; v_n int; v_job uuid; v_job2 uuid; v_vorgang uuid;
  v_zeile public.jobs%rowtype; v_frei int; v_status text;
begin
  set local role authenticated;

  -- --- Nur-Lese kann nichts einstellen -------------------------------------
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-2222222a2222","role":"authenticated"}';
  begin
    perform public.job_einstellen('sync', '{}'::jsonb);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (1,'Nur-Lese-Zugang stellt keine Auftraege ein','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Verwaltung A stellt ein, mit reservierten Credits -------------------
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111a1111","role":"authenticated"}';
  v_vorgang := public.credits_reservieren('ki_text_einzeln');
  v_job := public.job_einstellen('ki_text', '{"objekt":"x"}'::jsonb, 3::smallint, v_vorgang);
  insert into erg values (2,'Auftrag mit Credit-Vorgang eingestellt','angelegt',case when v_job is null then 'nichts' else 'angelegt' end,v_job is not null);

  select status::text into v_txt from public.jobs where id = v_job;
  insert into erg values (3,'Neuer Auftrag ist offen','offen',v_txt,v_txt='offen');

  -- Fremder Credit-Vorgang wird abgewiesen (hier: einer, den es nicht gibt).
  begin
    perform public.job_einstellen('sync', '{}'::jsonb, 5::smallint, gen_random_uuid());
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (4,'Unbekannter Credit-Vorgang abgewiesen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Benutzer koennen nicht beanspruchen -----------------------------------
  begin
    perform public.jobs_beanspruchen('test', 1, 60);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (5,'Angemeldeter Benutzer kann nicht beanspruchen','abgewiesen',v_fehler,v_fehler='abgewiesen');
  begin
    perform public.job_abschliessen(v_job, '{}'::jsonb);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (6,'Angemeldeter Benutzer kann nicht abschliessen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Mandant B sieht nichts von A ---------------------------------------
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-3333333a3333","role":"authenticated"}';
  select count(*) into v_n from public.jobs;
  insert into erg values (7,'Mandant B sieht keine Auftraege von A','0',v_n::text,v_n=0);
  begin
    perform public.job_abbrechen(v_job);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (8,'Mandant B kann Auftrag von A nicht abbrechen','abgewiesen',v_fehler,v_fehler='abgewiesen');

  -- --- Arbeiter (Dienstrolle) beansprucht ---------------------------------
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select * into v_zeile from public.jobs_beanspruchen('arbeiter-1', 5, 60);
  insert into erg values (9,'Arbeiter erhaelt den Auftrag',v_job::text,coalesce(v_zeile.id::text,'nichts'),v_zeile.id = v_job);
  insert into erg values (10,'Auftrag laeuft, Versuch 1','laeuft/1',v_zeile.status::text || '/' || v_zeile.versuche, v_zeile.status='laeuft' and v_zeile.versuche=1);

  -- Ein zweiter Arbeiter bekommt ihn nicht (gesperrt).
  select count(*) into v_n from public.jobs_beanspruchen('arbeiter-2', 5, 60);
  insert into erg values (11,'Gesperrter Auftrag wird nicht doppelt vergeben','0',v_n::text,v_n=0);

  -- --- Scheitern: zurueck in die Schlange mit Abstand ----------------------
  perform public.job_fehlgeschlagen(v_job, 'Anbieter nicht erreichbar');
  select * into v_zeile from public.jobs where id = v_job;
  insert into erg values (12,'Nach Fehlschlag wieder offen','offen',v_zeile.status::text,v_zeile.status='offen');
  insert into erg values (13,'Naechster Versuch liegt in der Zukunft','spaeter',
    case when v_zeile.naechster_versuch_am > now() + interval '90 seconds' then 'spaeter' else 'sofort' end,
    v_zeile.naechster_versuch_am > now() + interval '90 seconds');
  insert into erg values (14,'Fehlerverlauf hat einen Eintrag','1',jsonb_array_length(v_zeile.fehler_verlauf)::text,jsonb_array_length(v_zeile.fehler_verlauf)=1);

  -- Nicht faellig → nicht beanspruchbar.
  select count(*) into v_n from public.jobs_beanspruchen('arbeiter-1', 5, 60);
  insert into erg values (15,'Wartender Auftrag wird nicht vorzeitig vergeben','0',v_n::text,v_n=0);

  -- Faellig stellen, zwei weitere Fehlschlaege → endgueltig, Credits frei.
  update public.jobs set naechster_versuch_am = now() where id = v_job;
  perform public.jobs_beanspruchen('arbeiter-1', 5, 60);
  perform public.job_fehlgeschlagen(v_job, 'noch einmal');
  update public.jobs set naechster_versuch_am = now() where id = v_job;
  perform public.jobs_beanspruchen('arbeiter-1', 5, 60);
  perform public.job_fehlgeschlagen(v_job, 'und ein drittes Mal');
  select * into v_zeile from public.jobs where id = v_job;
  insert into erg values (16,'Nach drei Versuchen endgueltig gescheitert','fehler/3',v_zeile.status::text || '/' || v_zeile.versuche, v_zeile.status='fehler' and v_zeile.versuche=3);
  select status::text into v_status from public.credit_vorgaenge where id = v_vorgang;
  insert into erg values (17,'Reservierte Credits freigegeben','freigegeben',v_status,v_status='freigegeben');

  -- --- Erfolg loest Credits ein -------------------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111a1111","role":"authenticated"}';
  v_vorgang := public.credits_reservieren('ki_text_einzeln');
  v_job2 := public.job_einstellen('ki_text', '{}'::jsonb, 5::smallint, v_vorgang);
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  perform public.jobs_beanspruchen('arbeiter-1', 5, 60);
  perform public.job_abschliessen(v_job2, '{"text":"fertig"}'::jsonb);
  select status::text into v_txt from public.jobs where id = v_job2;
  select status::text into v_status from public.credit_vorgaenge where id = v_vorgang;
  insert into erg values (18,'Erfolg: fertig und Credits eingeloest','fertig/eingeloest',v_txt || '/' || v_status, v_txt='fertig' and v_status='eingeloest');

  -- --- Waechter: verschwundener Arbeiter -----------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111a1111","role":"authenticated"}';
  v_job := public.job_einstellen('sync', '{}'::jsonb);
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  perform public.jobs_beanspruchen('arbeiter-tot', 5, 60);
  -- Sperre kuenstlich ablaufen lassen.
  update public.jobs set sperre_bis = now() - interval '1 minute' where id = v_job;
  select public.jobs_waechter() into v_n;
  insert into erg values (19,'Waechter gibt den Auftrag frei','1',v_n::text,v_n=1);
  select status::text into v_txt from public.jobs where id = v_job;
  insert into erg values (20,'Freigegebener Auftrag ist wieder offen','offen',v_txt,v_txt='offen');
  -- Beim Beanspruchen laeuft der Waechter automatisch mit.
  update public.jobs set status='laeuft', sperre_bis = now() - interval '1 minute', versuche = 3 where id = v_job;
  perform public.jobs_beanspruchen('arbeiter-neu', 5, 60);
  select status::text into v_txt from public.jobs where id = v_job;
  insert into erg values (21,'Waechter im Beanspruchen: Versuche aufgebraucht → fehler','fehler',v_txt,v_txt='fehler');

  -- --- Abbrechen durch den Mandanten --------------------------------------
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111a1111","role":"authenticated"}';
  v_job := public.job_einstellen('sync', '{}'::jsonb);
  perform public.job_abbrechen(v_job);
  select status::text into v_txt from public.jobs where id = v_job;
  insert into erg values (22,'Mandant bricht offenen Auftrag ab','abgebrochen',v_txt,v_txt='abgebrochen');
  begin
    perform public.job_abbrechen(v_job2);
    v_fehler := 'DURCHGEKOMMEN';
  exception when others then v_fehler := 'abgewiesen';
  end;
  insert into erg values (23,'Fertiger Auftrag laesst sich nicht abbrechen','abgewiesen',v_fehler,v_fehler='abgewiesen');
end $$;

select nr,pruefung,erwartet,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
