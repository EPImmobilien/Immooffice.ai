-- ===========================================================================
-- ImmoOffice.ai — Kernschema: Mandanten, Benutzer, Rechte
--
-- Master-Prompt Abschnitt 5. Ersetzt den Vorentwurf (profiles,
-- firma_stammdaten); Begruendung in DATA_MODEL.md, Abschnitt 8.
--
-- Grundregel: Jede fachliche Tabelle traegt mandant_id und hat RLS. Ohne
-- Policy keine Tabelle.
-- ===========================================================================

-- --- Vorentwurf entfernen ---------------------------------------------------
-- Beide Tabellen sind verwerfbar (Abschnitt 0): firma_stammdaten ist leer,
-- profiles enthaelt nur einen Testdatensatz.
drop table if exists public.profiles cascade;
drop table if exists public.firma_stammdaten cascade;

-- --- Aufzaehlungen ----------------------------------------------------------

create type public.benutzerrolle as enum (
  'inhaber',
  'administrator',
  'makler',
  'assistenz',
  'marketing',
  'nur_lesen'
);

create type public.abo_status as enum (
  'test',
  'aktiv',
  'zahlung_offen',
  'gekuendigt',
  'gesperrt'
);

-- --- Mandanten --------------------------------------------------------------

create table public.mandanten (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 2 and 200),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  land          text not null default 'DE',
  zeitzone      text not null default 'Europe/Berlin',

  abo_status    public.abo_status not null default 'test',
  testphase_bis timestamptz not null default (now() + interval '7 days'),

  gesperrt_am     timestamptz,
  gesperrt_grund  text,

  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);

comment on table public.mandanten is
  'Ein Unternehmen. Oberste Trennlinie: kein Datensatz ohne Mandantenbezug.';

-- --- Mandanten-Branding (Abschnitt 5) --------------------------------------

create table public.mandant_branding (
  mandant_id        uuid primary key references public.mandanten(id) on delete cascade,

  logo_pfad         text,
  logo_invers_pfad  text,
  farbe_primaer     text check (farbe_primaer ~ '^#[0-9A-Fa-f]{6}$'),
  farbe_akzent      text check (farbe_akzent ~ '^#[0-9A-Fa-f]{6}$'),
  schriftart        text,

  firmenname        text,
  strasse           text,
  hausnummer        text,
  plz               text,
  ort               text,
  telefon           text,
  email             text,
  web               text,

  impressum             text,
  datenschutztext       text,
  widerrufsbelehrung    text,
  rechtstexte_sonstige  text,

  mail_absender_name    text,
  mail_absender_adresse text,

  geaendert_am      timestamptz not null default now()
);

comment on table public.mandant_branding is
  'Wird automatisch auf Exposes, Wertermittlungen, Vertraege und E-Mails angewendet.';

-- --- Benutzer ---------------------------------------------------------------

create table public.benutzer (
  id           uuid primary key references auth.users(id) on delete cascade,
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,

  name         text not null check (length(trim(name)) between 1 and 200),
  email        text not null,
  telefon      text,
  funktion     text,
  foto_pfad    text,

  rolle        public.benutzerrolle not null default 'makler',
  -- Feinjustierung je Benutzer. Die Rolle liefert die Vorbelegung; hier stehen
  -- nur die Abweichungen davon (Abschnitt 5).
  rechte_uebersteuerung jsonb not null default '{}'::jsonb,

  aktiv            boolean not null default true,
  letzter_login_am timestamptz,

  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create index benutzer_mandant_idx on public.benutzer(mandant_id);

comment on column public.benutzer.rechte_uebersteuerung is
  'Nur Abweichungen von der Rollenvorbelegung, Form: {"modul": {"aktion": true|false}}.';

-- ===========================================================================
-- Hilfsfunktionen fuer RLS
--
-- security definer, damit sie die Policies nicht erneut ausloesen — sonst
-- entstuende beim Lesen von benutzer eine Endlosschleife.
-- ===========================================================================

create or replace function public.aktueller_mandant()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mandant_id from public.benutzer where id = auth.uid() and aktiv
$$;

comment on function public.aktueller_mandant() is
  'Mandant der laufenden Sitzung. Grundlage jeder RLS-Policy.';

create or replace function public.aktuelle_rolle()
returns public.benutzerrolle
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rolle from public.benutzer where id = auth.uid() and aktiv
$$;

create or replace function public.ist_verwaltung()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select rolle in ('inhaber', 'administrator')
       from public.benutzer where id = auth.uid() and aktiv),
    false
  )
$$;

create or replace function public.darf_schreiben()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select rolle <> 'nur_lesen'
       from public.benutzer where id = auth.uid() and aktiv),
    false
  )
$$;

-- --- geaendert_am automatisch pflegen ---------------------------------------

create or replace function public.setze_geaendert_am()
returns trigger
language plpgsql
as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

create trigger mandanten_geaendert
  before update on public.mandanten
  for each row execute function public.setze_geaendert_am();

create trigger mandant_branding_geaendert
  before update on public.mandant_branding
  for each row execute function public.setze_geaendert_am();

create trigger benutzer_geaendert
  before update on public.benutzer
  for each row execute function public.setze_geaendert_am();

-- ===========================================================================
-- Row-Level-Security
-- ===========================================================================

alter table public.mandanten        enable row level security;
alter table public.mandant_branding enable row level security;
alter table public.benutzer         enable row level security;

-- Mandanten: nur der eigene, und nur die Verwaltung darf ihn aendern.
create policy mandanten_lesen on public.mandanten
  for select using (id = public.aktueller_mandant());

create policy mandanten_aendern on public.mandanten
  for update using (id = public.aktueller_mandant() and public.ist_verwaltung())
  with check (id = public.aktueller_mandant());

-- Branding: alle im Mandanten duerfen lesen (Exposes brauchen es),
-- aendern nur die Verwaltung.
create policy branding_lesen on public.mandant_branding
  for select using (mandant_id = public.aktueller_mandant());

create policy branding_schreiben on public.mandant_branding
  for all using (mandant_id = public.aktueller_mandant() and public.ist_verwaltung())
  with check (mandant_id = public.aktueller_mandant() and public.ist_verwaltung());

-- Benutzer: eigenen Mandanten sehen; anlegen und loeschen nur die Verwaltung.
create policy benutzer_lesen on public.benutzer
  for select using (mandant_id = public.aktueller_mandant());

create policy benutzer_anlegen on public.benutzer
  for insert with check (
    mandant_id = public.aktueller_mandant() and public.ist_verwaltung()
  );

-- Jeder darf sein eigenes Profil pflegen; die Verwaltung alle Profile des
-- Mandanten. Rolle und Mandant werden hier bewusst NICHT geschuetzt — das
-- uebernimmt der Trigger unten, weil eine Policy Spaltenwerte nicht vergleichen
-- kann, ohne den alten Wert zu kennen.
create policy benutzer_aendern on public.benutzer
  for update using (
    mandant_id = public.aktueller_mandant()
    and (id = auth.uid() or public.ist_verwaltung())
  )
  with check (mandant_id = public.aktueller_mandant());

create policy benutzer_loeschen on public.benutzer
  for delete using (
    mandant_id = public.aktueller_mandant()
    and public.ist_verwaltung()
    and id <> auth.uid()   -- niemand entfernt sich selbst
  );

-- Rechteausweitung verhindern: Wer nicht zur Verwaltung gehoert, darf weder
-- die eigene Rolle noch den Mandanten aendern.
create or replace function public.pruefe_benutzer_aenderung()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.mandant_id <> old.mandant_id then
    raise exception 'Der Mandant eines Benutzers kann nicht geaendert werden.';
  end if;

  if new.rolle <> old.rolle and not public.ist_verwaltung() then
    raise exception 'Nur Inhaber und Administratoren duerfen Rollen aendern.';
  end if;

  if new.rechte_uebersteuerung <> old.rechte_uebersteuerung
     and not public.ist_verwaltung() then
    raise exception 'Nur Inhaber und Administratoren duerfen Rechte aendern.';
  end if;

  return new;
end;
$$;

create trigger benutzer_aenderung_pruefen
  before update on public.benutzer
  for each row execute function public.pruefe_benutzer_aenderung();

-- ===========================================================================
-- Registrierung: Mandant und ersten Benutzer gemeinsam anlegen
--
-- Laeuft als security definer, weil zum Zeitpunkt des Aufrufs noch kein
-- Benutzer existiert und damit aktueller_mandant() leer waere.
-- ===========================================================================

create or replace function public.registriere_mandant(
  p_firmenname text,
  p_name       text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mandant uuid;
  v_slug    text;
  v_email   text;
  v_zaehler int := 0;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if exists (select 1 from public.benutzer where id = auth.uid()) then
    raise exception 'Dieses Konto gehoert bereits zu einem Unternehmen.';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  -- Slug aus dem Firmennamen ableiten und bei Bedarf durchnummerieren.
  v_slug := regexp_replace(lower(trim(p_firmenname)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) < 2 then
    v_slug := 'unternehmen';
  end if;
  v_slug := left(v_slug, 50);

  while exists (select 1 from public.mandanten where slug = v_slug) loop
    v_zaehler := v_zaehler + 1;
    v_slug := left(v_slug, 45) || '-' || v_zaehler;
  end loop;

  insert into public.mandanten (name, slug)
  values (trim(p_firmenname), v_slug)
  returning id into v_mandant;

  -- Wer registriert, ist Inhaber.
  insert into public.benutzer (id, mandant_id, name, email, rolle)
  values (auth.uid(), v_mandant, trim(p_name), v_email, 'inhaber');

  insert into public.mandant_branding (mandant_id, firmenname, email)
  values (v_mandant, trim(p_firmenname), v_email);

  return v_mandant;
end;
$$;

revoke all on function public.registriere_mandant(text, text) from public;
grant execute on function public.registriere_mandant(text, text) to authenticated;
