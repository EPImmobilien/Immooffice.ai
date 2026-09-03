-- ===========================================================================
-- ImmoOffice.ai — Einladungen und Benutzerverwaltung
--
-- Master-Prompt Abschnitt 5, Umsetzungsplan Phase 1, Paket
-- "Unternehmen, Benutzer, Rollen, Einladung".
--
-- Nachgetragen aus dem Produktivprojekt (supabase_migrations.schema_migrations,
-- Version 20260817144057). Die Migration war ausgerollt, aber nicht
-- versioniert — siehe docs/STATUS.md vom 03.09.2026. Inhalt unveraendert;
-- nur dieser Vermerk ist neu.
-- ===========================================================================

create table public.einladungen (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,

  email         text not null check (position('@' in email) > 1),
  rolle         public.benutzerrolle not null default 'makler',
  rechte_uebersteuerung jsonb not null default '{}'::jsonb,

  token_hash    text not null unique,

  eingeladen_von uuid references public.benutzer(id) on delete set null,
  erstellt_am    timestamptz not null default now(),
  gueltig_bis    timestamptz not null default (now() + interval '14 days'),

  eingeloest_am  timestamptz,
  eingeloest_von uuid references public.benutzer(id) on delete set null,
  widerrufen_am  timestamptz
);

comment on table public.einladungen is
  'Offene Einladungen in einen Mandanten. Enthaelt nur den Hash des Tokens.';

create index einladungen_mandant_idx on public.einladungen(mandant_id);

create unique index einladungen_offen_idx
  on public.einladungen(mandant_id, lower(email))
  where eingeloest_am is null and widerrufen_am is null;

alter table public.einladungen enable row level security;

create policy einladungen_lesen on public.einladungen
  for select using (
    mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung()
  );

create policy einladungen_widerrufen on public.einladungen
  for update using (
    mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung()
  )
  with check (mandant_id = intern.aktueller_mandant());

create or replace function intern.token_hash(p_token text)
returns text
language sql
immutable
set search_path = extensions, pg_temp
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create or replace function public.einladung_erstellen(
  p_email  text,
  p_rolle  public.benutzerrolle,
  p_rechte jsonb,
  p_token  text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid;
  v_email   text;
  v_id      uuid;
begin
  v_mandant := intern.aktueller_mandant();

  if v_mandant is null or not intern.ist_verwaltung() then
    raise exception 'Nur Inhaber und Administratoren duerfen einladen.';
  end if;

  if p_rolle = 'inhaber' and intern.aktuelle_rolle() <> 'inhaber' then
    raise exception 'Nur der Inhaber darf die Inhaberrolle vergeben.';
  end if;

  v_email := lower(trim(p_email));

  if position('@' in v_email) < 2 then
    raise exception 'Bitte eine gueltige E-Mail-Adresse angeben.';
  end if;

  if length(p_token) < 24 then
    raise exception 'Das Einladungstoken ist zu kurz.';
  end if;

  if exists (
    select 1 from public.benutzer
     where mandant_id = v_mandant and lower(email) = v_email
  ) then
    raise exception 'Diese Adresse gehoert bereits zum Unternehmen.';
  end if;

  insert into public.einladungen (
    mandant_id, email, rolle, rechte_uebersteuerung, token_hash, eingeladen_von
  )
  values (
    v_mandant, v_email, p_rolle, coalesce(p_rechte, '{}'::jsonb),
    intern.token_hash(p_token), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function
  public.einladung_erstellen(text, public.benutzerrolle, jsonb, text)
  from public, anon;
grant execute on function
  public.einladung_erstellen(text, public.benutzerrolle, jsonb, text)
  to authenticated;

create or replace function public.einladung_erneuern(
  p_id    uuid,
  p_token text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid;
begin
  v_mandant := intern.aktueller_mandant();

  if v_mandant is null or not intern.ist_verwaltung() then
    raise exception 'Nur Inhaber und Administratoren duerfen einladen.';
  end if;

  if length(p_token) < 24 then
    raise exception 'Das Einladungstoken ist zu kurz.';
  end if;

  update public.einladungen
     set token_hash  = intern.token_hash(p_token),
         gueltig_bis = now() + interval '14 days',
         erstellt_am = now()
   where id = p_id
     and mandant_id = v_mandant
     and eingeloest_am is null
     and widerrufen_am is null;

  if not found then
    raise exception 'Diese Einladung besteht nicht mehr.';
  end if;
end;
$$;

revoke execute on function public.einladung_erneuern(uuid, text) from public, anon;
grant execute on function public.einladung_erneuern(uuid, text) to authenticated;

create or replace function public.einladung_ansehen(p_token text)
returns table (
  zustand      text,
  unternehmen  text,
  email        text,
  rolle        public.benutzerrolle,
  gueltig_bis  timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ein public.einladungen;
begin
  select * into v_ein
    from public.einladungen e
   where e.token_hash = intern.token_hash(coalesce(p_token, ''));

  if not found then
    return query select 'unbekannt'::text, null::text, null::text,
                        null::public.benutzerrolle, null::timestamptz;
    return;
  end if;

  return query
    select case
             when v_ein.widerrufen_am is not null then 'widerrufen'
             when v_ein.eingeloest_am is not null then 'eingeloest'
             when v_ein.gueltig_bis < now()       then 'abgelaufen'
             else 'ok'
           end,
           (select m.name from public.mandanten m where m.id = v_ein.mandant_id),
           v_ein.email,
           v_ein.rolle,
           v_ein.gueltig_bis;
end;
$$;

revoke execute on function public.einladung_ansehen(text) from public;
grant execute on function public.einladung_ansehen(text) to anon, authenticated;

create or replace function public.einladung_einloesen(
  p_token text,
  p_name  text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ein     public.einladungen;
  v_email   text;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if exists (select 1 from public.benutzer where id = auth.uid()) then
    raise exception 'Dieses Konto gehoert bereits zu einem Unternehmen.';
  end if;

  select * into v_ein
    from public.einladungen e
   where e.token_hash = intern.token_hash(coalesce(p_token, ''))
   for update;

  if not found
     or v_ein.widerrufen_am is not null
     or v_ein.eingeloest_am is not null
     or v_ein.gueltig_bis < now() then
    raise exception 'Diese Einladung ist nicht mehr gueltig.';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();

  if v_email is distinct from lower(v_ein.email) then
    raise exception 'Diese Einladung gilt fuer eine andere E-Mail-Adresse.';
  end if;

  insert into public.benutzer (
    id, mandant_id, name, email, rolle, rechte_uebersteuerung
  )
  values (
    auth.uid(), v_ein.mandant_id,
    coalesce(nullif(trim(p_name), ''), split_part(v_ein.email, '@', 1)),
    v_ein.email, v_ein.rolle, v_ein.rechte_uebersteuerung
  );

  update public.einladungen
     set eingeloest_am = now(), eingeloest_von = auth.uid()
   where id = v_ein.id;

  return v_ein.mandant_id;
end;
$$;

revoke execute on function public.einladung_einloesen(text, text) from public, anon;
grant execute on function public.einladung_einloesen(text, text) to authenticated;

create or replace function intern.pruefe_benutzer_aenderung()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_verwaltung boolean := intern.ist_verwaltung();
  v_rolle      public.benutzerrolle := intern.aktuelle_rolle();
begin
  if new.mandant_id <> old.mandant_id then
    raise exception 'Der Mandant eines Benutzers kann nicht geaendert werden.';
  end if;

  if new.rolle <> old.rolle and not v_verwaltung then
    raise exception 'Nur Inhaber und Administratoren duerfen Rollen aendern.';
  end if;

  if new.rechte_uebersteuerung <> old.rechte_uebersteuerung and not v_verwaltung then
    raise exception 'Nur Inhaber und Administratoren duerfen Rechte aendern.';
  end if;

  if (old.rolle = 'inhaber' or new.rolle = 'inhaber')
     and old.rolle <> new.rolle
     and v_rolle <> 'inhaber' then
    raise exception 'Nur der Inhaber darf die Inhaberrolle vergeben oder entziehen.';
  end if;

  if new.aktiv <> old.aktiv and not v_verwaltung then
    raise exception 'Nur Inhaber und Administratoren duerfen Zugaenge abschalten.';
  end if;

  if not new.aktiv and new.id = auth.uid() then
    raise exception 'Der eigene Zugang kann nicht abgeschaltet werden.';
  end if;

  if lower(new.email) <> lower(old.email) and not v_verwaltung then
    raise exception 'Die E-Mail-Adresse kann nur die Verwaltung aendern.';
  end if;

  if (old.rolle = 'inhaber' and old.aktiv)
     and (new.rolle <> 'inhaber' or not new.aktiv)
     and not exists (
       select 1 from public.benutzer
        where mandant_id = old.mandant_id
          and rolle = 'inhaber'
          and aktiv
          and id <> old.id
     ) then
    raise exception 'Das Unternehmen braucht mindestens einen aktiven Inhaber.';
  end if;

  return new;
end;
$$;

create or replace function intern.pruefe_benutzer_loeschung()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.rolle = 'inhaber'
     and not exists (
       select 1 from public.benutzer
        where mandant_id = old.mandant_id
          and rolle = 'inhaber'
          and aktiv
          and id <> old.id
     ) then
    raise exception 'Das Unternehmen braucht mindestens einen aktiven Inhaber.';
  end if;

  return old;
end;
$$;

create trigger benutzer_loeschung_pruefen
  before delete on public.benutzer
  for each row execute function intern.pruefe_benutzer_loeschung();
