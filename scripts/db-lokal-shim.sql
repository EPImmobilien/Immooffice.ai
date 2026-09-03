-- ===========================================================================
-- Nachbildung der Supabase-Umgebung fuer eine lokale, leere Postgres-Instanz.
--
-- Zweck: Die Migrationen unter supabase/migrations/ und die Nachweise unter
-- supabase/tests/ laufen ohne Supabase-CLI und ohne Netz — auf jedem Rechner
-- mit einem Postgres-Server (scripts/db-lokal.sh).
--
-- Nachgebildet wird NUR, was die Migrationen anfassen: die drei Rollen, das
-- Schema `auth` mit `users` und `uid()`, das Schema `storage` mit Buckets,
-- Objekten und `foldername()`, das Schema `extensions` mit pgcrypto und die
-- Standardrechte, die Supabase Tabellen im Schema public gibt.
--
-- Das ist kein Supabase. Was hier gruen ist, ist ein starker Hinweis, kein
-- Beweis — der letzte Nachweis laeuft gegen das echte Projekt.
-- ===========================================================================

-- --- Rollen ----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- --- extensions ------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- --- auth ------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  instance_id        uuid,
  aud                text,
  role               text,
  email              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at         timestamptz,
  last_sign_in_at    timestamptz,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  phone              text,
  created_at         timestamptz,
  updated_at         timestamptz
);

-- Wie bei Supabase: Die Benutzer-ID kommt aus den JWT-Claims der Sitzung.
-- Tests setzen sie mit `set local request.jwt.claims = '{"sub": "..."}'`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- --- storage ---------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean not null default false,
  avif_autodetection boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets(id),
  name             text,
  owner            uuid,
  owner_id         text,
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  version          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  teile text[];
begin
  select string_to_array(name, '/') into teile;
  return teile[1 : array_length(teile, 1) - 1];
end;
$$;

create or replace function storage.filename(name text)
returns text
language plpgsql
immutable
as $$
declare
  teile text[];
begin
  select string_to_array(name, '/') into teile;
  return teile[array_length(teile, 1)];
end;
$$;

create or replace function storage.extension(name text)
returns text
language plpgsql
immutable
as $$
declare
  teile text[];
  datei text;
begin
  select string_to_array(name, '/') into teile;
  datei := teile[array_length(teile, 1)];
  return reverse(split_part(reverse(datei), '.', 1));
end;
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- --- Standardrechte im Schema public (wie bei Supabase) --------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
