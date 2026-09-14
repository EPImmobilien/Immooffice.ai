-- Nachbau der Supabase-Umgebung fuer eine lokale Postgres-Instanz
--
-- Zweck: Migrationen und SQL-Tests laufen lassen, ohne das echte Projekt
-- anzufassen. Das ist kein Supabase-Ersatz — nur genau so viel, wie die
-- Migrationen brauchen: die Rollen, die Schemata, `auth.uid()`, ein
-- Minimal-Storage und Platzhalter fuer die drei Erweiterungen, die es auf
-- einer gewoehnlichen Postgres-Installation nicht gibt (pg_cron, pg_net,
-- supabase_vault).
--
-- Wo ein Platzhalter steht, ist er als solcher gekennzeichnet. Ein Test, der
-- echtes Verhalten von pg_cron oder pg_net braucht, ist hier nicht
-- aussagefaehig und muss das sagen, statt gruen zu leuchten.

-- ---------------------------------------------------------------- Rollen
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit createrole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then
    create role supabase_storage_admin nologin noinherit createrole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin noinherit;
  end if;
end;
$$;

grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

-- ------------------------------------------------------------- Schemata
create schema if not exists extensions;
create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists storage authorization supabase_storage_admin;
create schema if not exists vault;
create schema if not exists graphql_public;
create schema if not exists net;
create schema if not exists cron;

grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant usage on schema storage to anon, authenticated, service_role, postgres;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- Auf Supabase liegen die Erweiterungsfunktionen im Suchpfad der Datenbank.
do $$
begin
  execute format('alter database %I set search_path = %s',
                 current_database(), '"$user", public, extensions');
end;
$$;

-- ------------------------------------------------------- Angemeldeter Nutzer
--
-- Auf Supabase liest `auth.uid()` den Anspruch `sub` aus dem JWT, das
-- PostgREST als `request.jwt.claims` setzt. Genau das macht der Nachbau — die
-- Tests setzen die Einstellung selbst und pruefen damit RLS.
create table if not exists auth.users (
  id uuid primary key default extensions.gen_random_uuid(),
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  deleted_at timestamptz,
  banned_until timestamptz
);

create table if not exists auth.identities (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  identity_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt()
returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'role', ''), current_setting('role', true));
$$;

create or replace function auth.email()
returns text language sql stable as $$
  select nullif(auth.jwt() ->> 'email', '');
$$;

grant execute on function auth.jwt, auth.uid, auth.role, auth.email
  to anon, authenticated, service_role, postgres;

-- ---------------------------------------------------------------- Storage
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

create or replace function storage.foldername(name text)
returns text[] language plpgsql immutable as $$
declare teile text[];
begin
  teile := string_to_array(name, '/');
  return teile[1 : array_length(teile, 1) - 1];
end;
$$;

create or replace function storage.filename(name text)
returns text language plpgsql immutable as $$
declare teile text[];
begin
  teile := string_to_array(name, '/');
  return teile[array_length(teile, 1)];
end;
$$;

create or replace function storage.extension(name text)
returns text language plpgsql immutable as $$
declare teile text[]; datei text;
begin
  teile := string_to_array(name, '/');
  datei := teile[array_length(teile, 1)];
  teile := string_to_array(datei, '.');
  return teile[array_length(teile, 1)];
end;
$$;

grant all on storage.buckets, storage.objects to postgres, service_role;
grant select on storage.buckets, storage.objects to anon, authenticated;

-- --------------------------------------------------- Platzhalter: pg_net
--
-- PLATZHALTER. Schreibt den Aufruf in eine Tabelle, statt ihn zu senden. Ein
-- Test kann damit pruefen, DASS ein Auftrag abgesetzt wuerde — nicht, was der
-- Empfaenger antwortet.
create table if not exists net._http_aufrufe (
  id bigserial primary key,
  methode text not null,
  url text not null,
  kopfzeilen jsonb,
  koerper jsonb,
  zeit timestamptz not null default now()
);

create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into net._http_aufrufe (methode, url, kopfzeilen, koerper)
  values ('POST', url, headers, body)
  returning id;
$$;

create or replace function net.http_get(
  url text,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into net._http_aufrufe (methode, url, kopfzeilen, koerper)
  values ('GET', url, headers, null)
  returning id;
$$;

-- -------------------------------------------------- Platzhalter: pg_cron
--
-- PLATZHALTER. Merkt sich den Zeitplan, fuehrt nichts aus. Genau richtig, um
-- zu pruefen, ob eine Migration die erwarteten Jobs anlegt.
create table if not exists cron.job (
  jobid bigserial primary key,
  schedule text not null,
  command text not null,
  nodename text not null default 'localhost',
  nodeport integer not null default 5432,
  database text not null default current_database(),
  username text not null default current_user,
  active boolean not null default true,
  jobname text unique
);

create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language plpgsql as $$
declare kennung bigint;
begin
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname) do update
    set schedule = excluded.schedule, command = excluded.command
  returning jobid into kennung;
  return kennung;
end;
$$;

create or replace function cron.schedule(schedule text, command text)
returns bigint language sql as $$
  select cron.schedule('job-' || md5(schedule || command), schedule, command);
$$;

create or replace function cron.unschedule(job_name text)
returns boolean language plpgsql as $$
begin
  delete from cron.job where jobname = job_name;
  return found;
end;
$$;

create or replace function cron.unschedule(job_id bigint)
returns boolean language plpgsql as $$
begin
  delete from cron.job where jobid = job_id;
  return found;
end;
$$;

-- ------------------------------------------- Platzhalter: supabase_vault
--
-- PLATZHALTER OHNE VERSCHLUESSELUNG. Legt die Geheimnisse im Klartext ab.
-- Nur fuer Tests der Zugriffswege zulaessig; ein Test, der Verschluesselung
-- behauptet, darf hier nicht laufen.
create table if not exists vault.secrets (
  id uuid primary key default extensions.gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null,
  key_id uuid,
  nonce bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret,
         key_id, nonce, created_at, updated_at
  from vault.secrets;

create or replace function vault.create_secret(
  new_secret text,
  new_name text default null,
  new_description text default '',
  new_key_id uuid default null
) returns uuid language sql as $$
  insert into vault.secrets (secret, name, description, key_id)
  values (new_secret, new_name, new_description, new_key_id)
  returning id;
$$;

create or replace function vault.update_secret(
  secret_id uuid,
  new_secret text default null,
  new_name text default null,
  new_description text default null,
  new_key_id uuid default null
) returns void language sql as $$
  update vault.secrets set
    secret = coalesce(new_secret, secret),
    name = coalesce(new_name, name),
    description = coalesce(new_description, description),
    key_id = coalesce(new_key_id, key_id),
    updated_at = now()
  where id = secret_id;
$$;
