-- ===========================================================================
-- Fork-eigene Migration 31b — Download-Links fuer Objektunterlagen
-- (Stufe 114 und 117 der Vorlage)
--
-- "Wie WeTransfer": der Makler waehlt Dateien am Objekt aus, setzt ein
-- Ablaufdatum und optional ein Passwort; der Empfaenger laedt auf der
-- oeffentlichen Seite unterlagen.html. Jeder Abruf wird protokolliert.
--
-- Das PASSWORT liegt als Hash, nie im Klartext — und die Oberflaeche liest
-- nur hat_passwort, nicht den Hash. Das Token ist der Schluessel zur Datei
-- und muss unerratbar sein; es entsteht in der Edge Function unterlagen-link.
-- ===========================================================================

create table if not exists public.unterlagen_links (
  id                  uuid primary key default gen_random_uuid(),
  mandant_id          uuid not null references public.mandanten(id) on delete cascade,
  -- Nullable: ein Transfer ohne Objekt (Stufe 117, Werkzeuge -> Transfer).
  immobilie_id        uuid references public.immobilien(id) on delete cascade,
  erstellt_von        uuid references public.profiles(id) on delete set null,
  token               text not null,
  titel               text,
  nachricht           text,
  -- Dateien am Objekt: die Kennungen aus immobilie_datei.
  datei_ids           uuid[] not null default '{}',
  -- Transfer ohne Objekt: der Ordner im Eimer; die Dateien stehen in
  -- transfer_dateien.
  ordner              text,
  gueltig_bis         timestamptz not null,
  passwort_hash       text,
  hat_passwort        boolean not null default false,
  empfaenger_name     text,
  empfaenger_email    text,
  kontakt_id          uuid references public.kontakte(id) on delete set null,
  benachrichtigen     boolean not null default true,
  aufrufe             integer not null default 0,
  downloads           integer not null default 0,
  zuletzt_geoeffnet_am timestamptz,
  zuletzt_download_am  timestamptz,
  widerrufen_am       timestamptz,
  created_at          timestamptz not null default now(),
  -- Plattformweit eindeutig: die oeffentliche Seite kennt keinen Mandanten,
  -- sie hat nur das Token.
  constraint unterlagen_links_token_key unique (token),
  constraint unterlagen_links_passwort_stimmig
    check (hat_passwort = (passwort_hash is not null))
);
create index if not exists unterlagen_links_mandant_idx on public.unterlagen_links (mandant_id);
create index if not exists unterlagen_links_immobilie_idx on public.unterlagen_links (immobilie_id);
create index if not exists unterlagen_links_erstellt_von_idx on public.unterlagen_links (erstellt_von);

create table if not exists public.transfer_dateien (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  link_id      uuid not null references public.unterlagen_links(id) on delete cascade,
  name         text not null,
  pfad         text not null,
  groesse      bigint,
  mime_type    text,
  -- Gesetzt, wenn die Dateien endgueltig geloescht wurden. Die Zeile bleibt,
  -- damit das Protokoll lesbar bleibt: der Link zeigt dann "nicht mehr da"
  -- statt "gab es nie".
  geloescht_am timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists transfer_dateien_link_idx on public.transfer_dateien (link_id);
create index if not exists transfer_dateien_mandant_idx on public.transfer_dateien (mandant_id);

create table if not exists public.unterlagen_link_abrufe (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  link_id     uuid not null references public.unterlagen_links(id) on delete cascade,
  art         text not null,
  datei_name  text,
  -- Die Adresse des Abrufers. Personenbezogenes Datum: sie steht im
  -- Protokoll, weil der Makler sehen soll, ob der Empfaenger geladen hat.
  -- Eine Aufbewahrungsfrist ist NICHT gesetzt — offener Rechtspunkt,
  -- vermerkt in docs/OFFEN.md.
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  constraint unterlagen_link_abrufe_art_check
    check (art in ('geoeffnet', 'passwort_falsch', 'download', 'zip', 'abgelaufen'))
);
create index if not exists unterlagen_link_abrufe_link_idx
  on public.unterlagen_link_abrufe (link_id, created_at desc);
create index if not exists unterlagen_link_abrufe_mandant_idx
  on public.unterlagen_link_abrufe (mandant_id);
