-- Erweiterungen, die die Vorlage braucht
--
-- Das Zielprojekt hatte beim Schema-Export nur pgcrypto, uuid-ossp,
-- pg_stat_statements und den Vault. Es fehlten pg_cron und pg_net — und ohne
-- die laeuft ein guter Teil der Vorlage nicht:
--
--   pg_net   drei Trigger-Funktionen rufen net.http_post auf (Push bei neuer
--            Mail, Termin-Erinnerung, Treffer-Meldung), ausserdem jedes
--            Cron-Kommando.
--   pg_cron  die 33 Hintergrundjobs.
--
-- Deshalb hier und nicht als Klickarbeit in der Oberflaeche: eine Migration
-- ist nachlesbar und laeuft auf einem zweiten Projekt genauso.
--
-- Der Schema-Ort ist der der Vorlage: pg_cron in pg_catalog (Vorgabe),
-- pg_net in `extensions`.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

do $$
begin
  -- Auf einer gewoehnlichen Postgres-Installation gibt es die beiden nicht.
  -- Dort ersetzt tests/supabase-nachbau.sql sie durch Platzhalter, und diese
  -- Migration darf deswegen nicht abbrechen.
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  else
    raise notice 'pg_net nicht verfuegbar — es gilt der Platzhalter aus tests/supabase-nachbau.sql';
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
  else
    raise notice 'pg_cron nicht verfuegbar — es gilt der Platzhalter aus tests/supabase-nachbau.sql';
  end if;

  if exists (select 1 from pg_available_extensions where name = 'supabase_vault') then
    execute 'create extension if not exists supabase_vault with schema vault';
  else
    raise notice 'supabase_vault nicht verfuegbar — es gilt der Platzhalter aus tests/supabase-nachbau.sql';
  end if;
end;
$$;

-- pg_cron legt seine Tabellen in `cron` an; ohne dieses Recht kann die
-- Anwendung den Zustand der Jobs nicht anzeigen (das Admin-Fenster der Vorlage
-- liest cron.job und cron.job_run_details).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute 'grant usage on schema cron to postgres';
  end if;
end;
$$;
