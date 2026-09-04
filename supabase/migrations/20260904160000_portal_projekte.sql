-- ===========================================================================
-- Neubau-Projektvertrieb und Kundenbereich (docs/FUNKTIONSABGLEICH.md P1/P2,
-- Referenz-Kacheln „Immobilien → Neubauprojekte" und „Kundenbereich").
--
-- Hinweis zum Rahmen: Der Masterprompt schliesst einen Kundenbereich aus; der
-- Auftraggeber hat am 03.09.2026 die funktionale 1:1-Uebernahme der Referenz
-- angeordnet (docs/ENTSCHEIDUNGEN.md E-2026-09-03-36). Dieses Paket ist im
-- Status als Widerspruch gekennzeichnet und kann als Ganzes gestrichen werden:
-- Es haengt an keiner anderen Tabelle, nur die Fremdschluessel zeigen nach aussen.
--
-- Bausteine:
--   projekte, projekt_einheiten, projekt_ordner, projekt_dateien,
--   projekt_updates (Baufortschritt), projekt_kontakte (Gewerke)
--   portal_kunden (Eigentuemer, Kaeufer, Projekt-Interessenten — ein Zugang je
--   Person und Rolle), portal_kunden_objekte, portal_nachrichten,
--   portal_dokumente (persoenliche Unterlagen), portal_aktivitaeten,
--   projekt_anfragen, projekt_merkliste, verbrauchsausweis_antraege
--   Kundenseite ohne Konto: Funktionen mit Zugangslink (Token), optional mit
--   selbst gesetztem Passwort — Muster wie das Web-Exposé.
-- ===========================================================================

-- --- Projekte ------------------------------------------------------------------------
create table public.projekte (
  id              uuid primary key default gen_random_uuid(),
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 200),
  slug            text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  strasse         text,
  plz             text,
  ort             text,
  beschreibung    text,
  vermarktungsart text not null default 'kauf' check (vermarktungsart in ('kauf', 'miete')),
  status          text not null default 'vorbereitung' check (status in ('vorbereitung', 'aktiv', 'abgeschlossen', 'archiviert')),
  baubeginn       date,
  fertigstellung  date,
  -- Oeffentliche Projektseite: nur mit Token erreichbar, Freigabe ueber oeffentlich
  token           text unique check (token is null or token ~ '^[a-z0-9]{16,64}$'),
  oeffentlich     boolean not null default false,
  titelbild_pfad  text,
  ansprechpartner_id uuid references public.benutzer(id) on delete set null,
  erstellt_von    uuid references public.benutzer(id) on delete set null,
  erstellt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now(),
  geloescht_am    timestamptz,
  unique (mandant_id, slug)
);
create index projekte_mandant_idx on public.projekte (mandant_id, erstellt_am desc);
create trigger projekte_geaendert before update on public.projekte
  for each row execute function intern.setze_geaendert_am();
alter table public.projekte enable row level security;
create policy projekte_lesen on public.projekte
  for select using (mandant_id = intern.aktueller_mandant());
create policy projekte_schreiben on public.projekte
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Einheiten ---------------------------------------------------------------------
create table public.projekt_einheiten (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  projekt_id    uuid not null references public.projekte(id) on delete cascade,
  we_nr         text not null check (length(trim(we_nr)) between 1 and 40),
  geschoss      text,
  geschoss_index integer not null default 0,
  zimmer        numeric(4,1),
  wohnflaeche   numeric(10,2),
  ausrichtung   text,
  kaufpreis     numeric(14,2),
  miete         numeric(12,2),
  hausgeld      numeric(10,2),
  status        text not null default 'verfuegbar' check (status in ('verfuegbar', 'reserviert', 'verkauft', 'vermietet')),
  -- Optionaler Bezug zum Objekt (Exposé, Portalexport, Vertraege laufen dort)
  objekt_id     uuid references public.objekte(id) on delete set null,
  notiz         text,
  sortierung    integer not null default 0,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  unique (projekt_id, we_nr)
);
create index projekt_einheiten_projekt_idx on public.projekt_einheiten (projekt_id, geschoss_index, sortierung);
create trigger projekt_einheiten_geaendert before update on public.projekt_einheiten
  for each row execute function intern.setze_geaendert_am();
alter table public.projekt_einheiten enable row level security;
create policy projekt_einheiten_lesen on public.projekt_einheiten
  for select using (mandant_id = intern.aktueller_mandant());
create policy projekt_einheiten_schreiben on public.projekt_einheiten
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Ordner, Dateien, Updates, Gewerke --------------------------------------------------
create table public.projekt_ordner (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  projekt_id   uuid not null references public.projekte(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  sichtbarkeit text not null default 'interessent' check (sichtbarkeit in ('intern', 'interessent', 'kaeufer', 'oeffentlich')),
  sortierung   integer not null default 0
);
alter table public.projekt_ordner enable row level security;
create policy projekt_ordner_lesen on public.projekt_ordner
  for select using (mandant_id = intern.aktueller_mandant());
create policy projekt_ordner_schreiben on public.projekt_ordner
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.projekt_dateien (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  projekt_id   uuid not null references public.projekte(id) on delete cascade,
  einheit_id   uuid references public.projekt_einheiten(id) on delete cascade,
  ordner_id    uuid references public.projekt_ordner(id) on delete set null,
  kategorie    text not null default 'sonstiges' check (kategorie in ('expose', 'grundriss', 'baubeschreibung', 'energieausweis', 'vertrag', 'baufortschritt', 'sonstiges')),
  name         text not null check (length(trim(name)) between 1 and 300),
  -- Pfad im Bucket objektdokumente: <mandant>/projekte/<projekt>/...
  pfad         text not null unique,
  bytes        integer,
  mime         text,
  sichtbarkeit text not null default 'interessent' check (sichtbarkeit in ('intern', 'interessent', 'kaeufer', 'oeffentlich')),
  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am  timestamptz not null default now()
);
create index projekt_dateien_projekt_idx on public.projekt_dateien (projekt_id, erstellt_am desc);
alter table public.projekt_dateien enable row level security;
create policy projekt_dateien_lesen on public.projekt_dateien
  for select using (mandant_id = intern.aktueller_mandant());
create policy projekt_dateien_schreiben on public.projekt_dateien
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.projekt_updates (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  projekt_id   uuid not null references public.projekte(id) on delete cascade,
  titel        text not null check (length(trim(titel)) between 1 and 200),
  text         text,
  -- Bildpfade im Bucket objektdokumente
  bilder       text[] not null default '{}',
  sichtbarkeit text not null default 'interessent' check (sichtbarkeit in ('intern', 'interessent', 'kaeufer', 'oeffentlich')),
  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am  timestamptz not null default now()
);
create index projekt_updates_projekt_idx on public.projekt_updates (projekt_id, erstellt_am desc);
alter table public.projekt_updates enable row level security;
create policy projekt_updates_lesen on public.projekt_updates
  for select using (mandant_id = intern.aktueller_mandant());
create policy projekt_updates_schreiben on public.projekt_updates
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.projekt_kontakte (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  projekt_id  uuid not null references public.projekte(id) on delete cascade,
  gewerk      text not null check (length(trim(gewerk)) between 1 and 120),
  firma       text,
  name        text,
  telefon     text,
  email       text,
  ort         text,
  info        text,
  fuer_kunden boolean not null default false,
  sortierung  integer not null default 0
);
alter table public.projekt_kontakte enable row level security;
create policy projekt_kontakte_lesen on public.projekt_kontakte
  for select using (mandant_id = intern.aktueller_mandant());
create policy projekt_kontakte_schreiben on public.projekt_kontakte
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Kundenzugaenge ------------------------------------------------------------------
create table public.portal_kunden (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  art           text not null default 'interessent' check (art in ('eigentuemer', 'kaeufer', 'interessent')),
  anzeigename   text not null check (length(trim(anzeigename)) between 1 and 200),
  email         text not null check (position('@' in email) > 1),
  telefon       text,
  -- Zugangslink: nur der Hash liegt in der Datenbank
  token_hash    text not null unique,
  passwort_salz text not null default gen_random_uuid()::text,
  passwort_hash text,
  aktiv         boolean not null default true,
  eingeladen_am timestamptz not null default now(),
  einladung_gueltig_bis timestamptz not null default (now() + interval '30 days'),
  angenommen_am timestamptz,
  letzter_login_am timestamptz,
  ansprechpartner_id uuid references public.benutzer(id) on delete set null,
  -- Neubau: Zugang gehoert zu einem Projekt, optional zu einer Einheit
  projekt_id    uuid references public.projekte(id) on delete cascade,
  einheit_id    uuid references public.projekt_einheiten(id) on delete set null,
  fortschritt_stufe integer not null default 1 check (fortschritt_stufe between 1 and 7),
  fortschritt_notiz text,
  quelle        text not null default 'einladung' check (quelle in ('einladung', 'projektseite', 'kontakt')),
  erstellt_von  uuid references public.benutzer(id) on delete set null,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  geloescht_am  timestamptz
);
create index portal_kunden_mandant_idx on public.portal_kunden (mandant_id, art, erstellt_am desc);
create index portal_kunden_projekt_idx on public.portal_kunden (projekt_id);
create trigger portal_kunden_geaendert before update on public.portal_kunden
  for each row execute function intern.setze_geaendert_am();
alter table public.portal_kunden enable row level security;
create policy portal_kunden_lesen on public.portal_kunden
  for select using (mandant_id = intern.aktueller_mandant());
create policy portal_kunden_schreiben on public.portal_kunden
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.portal_kunden_objekte (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  kunde_id    uuid not null references public.portal_kunden(id) on delete cascade,
  objekt_id   uuid not null references public.objekte(id) on delete cascade,
  vertrag_id  uuid references public.vertraege(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  unique (kunde_id, objekt_id)
);
alter table public.portal_kunden_objekte enable row level security;
create policy portal_kunden_objekte_lesen on public.portal_kunden_objekte
  for select using (mandant_id = intern.aktueller_mandant());
create policy portal_kunden_objekte_schreiben on public.portal_kunden_objekte
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.portal_nachrichten (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  kunde_id    uuid not null references public.portal_kunden(id) on delete cascade,
  richtung    text not null check (richtung in ('makler', 'kunde')),
  text        text not null check (length(trim(text)) between 1 and 5000),
  benutzer_id uuid references public.benutzer(id) on delete set null,
  gelesen_am  timestamptz,
  erstellt_am timestamptz not null default now()
);
create index portal_nachrichten_kunde_idx on public.portal_nachrichten (kunde_id, erstellt_am);
alter table public.portal_nachrichten enable row level security;
create policy portal_nachrichten_lesen on public.portal_nachrichten
  for select using (mandant_id = intern.aktueller_mandant());
create policy portal_nachrichten_schreiben on public.portal_nachrichten
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.portal_dokumente (
  id             uuid primary key default gen_random_uuid(),
  mandant_id     uuid not null references public.mandanten(id) on delete cascade,
  kunde_id       uuid not null references public.portal_kunden(id) on delete cascade,
  objekt_id      uuid references public.objekte(id) on delete set null,
  kategorie      text not null default 'sonstiges' check (length(kategorie) between 1 and 60),
  name           text not null check (length(trim(name)) between 1 and 300),
  -- Pfad im Bucket objektdokumente: <mandant>/portal/<kunde>/...
  pfad           text not null unique,
  bytes          integer,
  mime           text,
  hochgeladen_von text not null default 'makler' check (hochgeladen_von in ('makler', 'kunde')),
  gesehen_am     timestamptz,
  erstellt_am    timestamptz not null default now()
);
create index portal_dokumente_kunde_idx on public.portal_dokumente (kunde_id, erstellt_am desc);
alter table public.portal_dokumente enable row level security;
create policy portal_dokumente_lesen on public.portal_dokumente
  for select using (mandant_id = intern.aktueller_mandant());
create policy portal_dokumente_schreiben on public.portal_dokumente
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.portal_aktivitaeten (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  kunde_id    uuid not null references public.portal_kunden(id) on delete cascade,
  art         text not null check (art in ('einladung', 'login', 'datei', 'upload', 'nachricht', 'merkliste', 'anfrage', 'antrag', 'passwort')),
  detail      text,
  gesehen_am  timestamptz,
  erstellt_am timestamptz not null default now()
);
create index portal_aktivitaeten_kunde_idx on public.portal_aktivitaeten (kunde_id, erstellt_am desc);
create index portal_aktivitaeten_offen_idx on public.portal_aktivitaeten (mandant_id) where gesehen_am is null;
alter table public.portal_aktivitaeten enable row level security;
create policy portal_aktivitaeten_lesen on public.portal_aktivitaeten
  for select using (mandant_id = intern.aktueller_mandant());
create policy portal_aktivitaeten_schreiben on public.portal_aktivitaeten
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.projekt_anfragen (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  projekt_id    uuid not null references public.projekte(id) on delete cascade,
  kunde_id      uuid not null references public.portal_kunden(id) on delete cascade,
  einheit_id    uuid references public.projekt_einheiten(id) on delete cascade,
  art           text not null default 'reservierung' check (art in ('reservierung', 'information', 'besichtigung')),
  nachricht     text,
  status        text not null default 'offen' check (status in ('offen', 'bestaetigt', 'abgelehnt')),
  bearbeitet_von uuid references public.benutzer(id) on delete set null,
  bearbeitet_am timestamptz,
  erstellt_am   timestamptz not null default now()
);
create index projekt_anfragen_projekt_idx on public.projekt_anfragen (projekt_id, erstellt_am desc);
alter table public.projekt_anfragen enable row level security;
create policy projekt_anfragen_lesen on public.projekt_anfragen
  for select using (mandant_id = intern.aktueller_mandant());
create policy projekt_anfragen_schreiben on public.projekt_anfragen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.projekt_merkliste (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  projekt_id  uuid not null references public.projekte(id) on delete cascade,
  kunde_id    uuid not null references public.portal_kunden(id) on delete cascade,
  einheit_id  uuid not null references public.projekt_einheiten(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  unique (kunde_id, einheit_id)
);
alter table public.projekt_merkliste enable row level security;
create policy projekt_merkliste_lesen on public.projekt_merkliste
  for select using (mandant_id = intern.aktueller_mandant());
create policy projekt_merkliste_schreiben on public.projekt_merkliste
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Verbrauchsausweis-Antraege (Eigentuemer fuellt aus, Makler reicht ein) ----------------
create table public.verbrauchsausweis_antraege (
  id             uuid primary key default gen_random_uuid(),
  mandant_id     uuid not null references public.mandanten(id) on delete cascade,
  kunde_id       uuid references public.portal_kunden(id) on delete set null,
  objekt_id      uuid references public.objekte(id) on delete set null,
  status         text not null default 'in_arbeit' check (status in ('in_arbeit', 'eingereicht', 'erledigt')),
  -- Antragsteller, Gebaeude, Anlagentechnik, Sanierungen, Verbrauch (src/lib/portal/verbrauchsausweis.ts)
  daten          jsonb not null default '{}'::jsonb,
  erstellt_von_typ text not null default 'makler' check (erstellt_von_typ in ('makler', 'kunde')),
  eingereicht_am timestamptz,
  erledigt_am    timestamptz,
  erstellt_am    timestamptz not null default now(),
  geaendert_am   timestamptz not null default now()
);
create index verbrauchsausweis_mandant_idx on public.verbrauchsausweis_antraege (mandant_id, erstellt_am desc);
create trigger verbrauchsausweis_geaendert before update on public.verbrauchsausweis_antraege
  for each row execute function intern.setze_geaendert_am();
alter table public.verbrauchsausweis_antraege enable row level security;
create policy verbrauchsausweis_lesen on public.verbrauchsausweis_antraege
  for select using (mandant_id = intern.aktueller_mandant());
create policy verbrauchsausweis_schreiben on public.verbrauchsausweis_antraege
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Verweise mandantenrein ---------------------------------------------------------------
create or replace function intern.portal_verweise_pruefen()
returns trigger language plpgsql as $$
declare j jsonb := to_jsonb(new);
begin
  if (j->>'projekt_id') is not null and not exists
     (select 1 from public.projekte p where p.id = (j->>'projekt_id')::uuid and p.mandant_id = new.mandant_id) then
    raise exception 'Das Projekt gehoert nicht zu diesem Mandanten.';
  end if;
  if (j->>'einheit_id') is not null and not exists
     (select 1 from public.projekt_einheiten e where e.id = (j->>'einheit_id')::uuid and e.mandant_id = new.mandant_id) then
    raise exception 'Die Einheit gehoert nicht zu diesem Mandanten.';
  end if;
  if (j->>'kunde_id') is not null and not exists
     (select 1 from public.portal_kunden k where k.id = (j->>'kunde_id')::uuid and k.mandant_id = new.mandant_id) then
    raise exception 'Der Kundenzugang gehoert nicht zu diesem Mandanten.';
  end if;
  if (j->>'objekt_id') is not null and not exists
     (select 1 from public.objekte o where o.id = (j->>'objekt_id')::uuid and o.mandant_id = new.mandant_id) then
    raise exception 'Das Objekt gehoert nicht zu diesem Mandanten.';
  end if;
  if (j->>'kontakt_id') is not null and not exists
     (select 1 from public.kontakte c where c.id = (j->>'kontakt_id')::uuid and c.mandant_id = new.mandant_id) then
    raise exception 'Der Kontakt gehoert nicht zu diesem Mandanten.';
  end if;
  if (j->>'vertrag_id') is not null and not exists
     (select 1 from public.vertraege v where v.id = (j->>'vertrag_id')::uuid and v.mandant_id = new.mandant_id) then
    raise exception 'Der Vertrag gehoert nicht zu diesem Mandanten.';
  end if;
  if (j->>'ordner_id') is not null and not exists
     (select 1 from public.projekt_ordner o where o.id = (j->>'ordner_id')::uuid and o.mandant_id = new.mandant_id) then
    raise exception 'Der Ordner gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;

create trigger projekt_einheiten_verweise before insert or update on public.projekt_einheiten
  for each row execute function intern.portal_verweise_pruefen();
create trigger projekt_ordner_verweise before insert or update on public.projekt_ordner
  for each row execute function intern.portal_verweise_pruefen();
create trigger projekt_dateien_verweise before insert or update on public.projekt_dateien
  for each row execute function intern.portal_verweise_pruefen();
create trigger projekt_updates_verweise before insert or update on public.projekt_updates
  for each row execute function intern.portal_verweise_pruefen();
create trigger projekt_kontakte_verweise before insert or update on public.projekt_kontakte
  for each row execute function intern.portal_verweise_pruefen();
create trigger portal_kunden_verweise before insert or update on public.portal_kunden
  for each row execute function intern.portal_verweise_pruefen();
create trigger portal_kunden_objekte_verweise before insert or update on public.portal_kunden_objekte
  for each row execute function intern.portal_verweise_pruefen();
create trigger portal_nachrichten_verweise before insert or update on public.portal_nachrichten
  for each row execute function intern.portal_verweise_pruefen();
create trigger portal_dokumente_verweise before insert or update on public.portal_dokumente
  for each row execute function intern.portal_verweise_pruefen();
create trigger portal_aktivitaeten_verweise before insert or update on public.portal_aktivitaeten
  for each row execute function intern.portal_verweise_pruefen();
create trigger projekt_anfragen_verweise before insert or update on public.projekt_anfragen
  for each row execute function intern.portal_verweise_pruefen();
create trigger projekt_merkliste_verweise before insert or update on public.projekt_merkliste
  for each row execute function intern.portal_verweise_pruefen();
create trigger verbrauchsausweis_verweise before insert or update on public.verbrauchsausweis_antraege
  for each row execute function intern.portal_verweise_pruefen();

-- --- Glocke: offene Ereignisse aus dem Kundenbereich --------------------------------------
create or replace function public.portal_glocke()
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'nachrichten', (select count(*) from public.portal_nachrichten where richtung = 'kunde' and gelesen_am is null),
    'anfragen',    (select count(*) from public.projekt_anfragen where status = 'offen'),
    'uploads',     (select count(*) from public.portal_dokumente where hochgeladen_von = 'kunde' and gesehen_am is null),
    'antraege',    (select count(*) from public.verbrauchsausweis_antraege where status = 'eingereicht'),
    'aktivitaeten',(select count(*) from public.portal_aktivitaeten where gesehen_am is null)
  );
$$;
grant execute on function public.portal_glocke() to authenticated;

-- ===========================================================================
-- Kundenseite: Zugang ueber Token (ohne Konto), optional Passwort.
-- Alle Funktionen sind security definer und laufen fuer anon; sie geben nur
-- Daten des einen Kunden heraus. Fehlermeldungen sind bewusst gleichfoermig.
-- ===========================================================================

create or replace function intern.portal_token_hash(p_token text)
returns text language sql immutable
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex'); $$;

create or replace function intern.portal_passwort_hash(p_salz text, p_passwort text)
returns text language sql immutable
as $$ select encode(sha256(convert_to(p_salz || ':' || p_passwort, 'UTF8')), 'hex'); $$;

/**
 * Laedt den Kunden zu Token und Passwort. Rueckgabe null, wenn der Link
 * unbekannt, gesperrt oder abgelaufen ist oder das Passwort nicht passt.
 * p_passwort_pruefen = false: nur den Link pruefen (Passwortabfrage anzeigen).
 */
create or replace function intern.portal_kunde(p_token text, p_passwort text, p_passwort_pruefen boolean default true)
returns public.portal_kunden
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden;
begin
  if p_token is null or p_token !~ '^[a-z0-9]{16,64}$' then return null; end if;
  select * into k from public.portal_kunden
   where token_hash = intern.portal_token_hash(p_token) and aktiv and geloescht_am is null;
  if not found then return null; end if;
  if k.angenommen_am is null and k.einladung_gueltig_bis < now() then return null; end if;
  if p_passwort_pruefen and k.passwort_hash is not null
     and (p_passwort is null or k.passwort_hash <> intern.portal_passwort_hash(k.passwort_salz, p_passwort)) then
    return null;
  end if;
  return k;
end $$;

create or replace function intern.portal_aktivitaet(p_kunde public.portal_kunden, p_art text, p_detail text)
returns void language sql security definer set search_path = public, pg_temp
as $$
  insert into public.portal_aktivitaeten (mandant_id, kunde_id, art, detail)
  values (p_kunde.mandant_id, p_kunde.id, p_art, left(p_detail, 500));
$$;

/** Oeffnet den Zugang: Zustand unbekannt | passwort | ok. Vermerkt Annahme und Login. */
create or replace function public.portal_oeffnen(p_token text, p_passwort text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden; v_neu boolean;
begin
  k := intern.portal_kunde(p_token, null, false);
  if k.id is null then return jsonb_build_object('zustand', 'unbekannt'); end if;
  if k.passwort_hash is not null
     and (p_passwort is null or k.passwort_hash <> intern.portal_passwort_hash(k.passwort_salz, p_passwort)) then
    return jsonb_build_object('zustand', 'passwort', 'anzeigename', k.anzeigename);
  end if;
  v_neu := k.angenommen_am is null;
  update public.portal_kunden
     set angenommen_am = coalesce(angenommen_am, now()), letzter_login_am = now()
   where id = k.id;
  if v_neu or k.letzter_login_am is null or k.letzter_login_am < now() - interval '30 minutes' then
    perform intern.portal_aktivitaet(k, 'login', case when v_neu then 'Einladung angenommen' else 'Anmeldung im Kundenbereich' end);
  end if;
  return jsonb_build_object('zustand', 'ok', 'kunde_id', k.id, 'art', k.art, 'anzeigename', k.anzeigename,
                            'passwort_gesetzt', k.passwort_hash is not null);
end $$;
grant execute on function public.portal_oeffnen(text, text) to anon, authenticated;

/** Passwort setzen oder aendern (bei gesetztem Passwort ist das alte noetig). */
create or replace function public.portal_passwort_setzen(p_token text, p_altes text, p_neues text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden;
begin
  k := intern.portal_kunde(p_token, p_altes, true);
  if k.id is null then return jsonb_build_object('ok', false, 'grund', 'zugang'); end if;
  if p_neues is null or length(p_neues) < 8 or length(p_neues) > 200 then
    return jsonb_build_object('ok', false, 'grund', 'laenge');
  end if;
  update public.portal_kunden set passwort_hash = intern.portal_passwort_hash(passwort_salz, p_neues) where id = k.id;
  perform intern.portal_aktivitaet(k, 'passwort', 'Passwort gesetzt');
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.portal_passwort_setzen(text, text, text) to anon, authenticated;

/** Sichtbarkeitsstufen, die ein Kunde sehen darf. */
create or replace function intern.portal_sichtbar(p_kunde public.portal_kunden)
returns text[] language sql immutable
as $$
  select case when p_kunde.art = 'kaeufer' then array['oeffentlich', 'interessent', 'kaeufer']
              else array['oeffentlich', 'interessent'] end;
$$;

/** Alle Daten des Kundenbereichs in einem Aufruf. */
create or replace function public.portal_daten(p_token text, p_passwort text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden; v jsonb; v_sicht text[];
begin
  k := intern.portal_kunde(p_token, p_passwort, true);
  if k.id is null then return jsonb_build_object('zustand', 'unbekannt'); end if;
  v_sicht := intern.portal_sichtbar(k);

  v := jsonb_build_object(
    'zustand', 'ok',
    'kunde', jsonb_build_object('id', k.id, 'art', k.art, 'anzeigename', k.anzeigename, 'email', k.email,
                                'passwort_gesetzt', k.passwort_hash is not null,
                                'fortschritt_stufe', k.fortschritt_stufe, 'fortschritt_notiz', k.fortschritt_notiz,
                                'einheit_id', k.einheit_id),
    'mandant', (select jsonb_build_object('name', m.name) from public.mandanten m where m.id = k.mandant_id),
    'ansprechpartner', (select jsonb_build_object('name', b.name, 'email', b.email, 'telefon', b.telefon, 'funktion', b.funktion)
                          from public.benutzer b where b.id = k.ansprechpartner_id),
    'nachrichten', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'richtung', n.richtung, 'text', n.text, 'erstellt_am', n.erstellt_am) order by n.erstellt_am)
                          from (select * from public.portal_nachrichten where kunde_id = k.id order by erstellt_am desc limit 200) n), '[]'::jsonb),
    'dokumente', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kategorie', d.kategorie, 'bytes', d.bytes,
                                                              'hochgeladen_von', d.hochgeladen_von, 'objekt_id', d.objekt_id, 'erstellt_am', d.erstellt_am) order by d.erstellt_am desc)
                          from public.portal_dokumente d where d.kunde_id = k.id), '[]'::jsonb),
    'objekte', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'bezeichnung', o.bezeichnung, 'titel', o.titel, 'strasse', o.strasse, 'hausnummer', o.hausnummer,
        'plz', o.plz, 'ort', o.ort, 'status', o.status, 'vermarktungsart', o.vermarktungsart,
        'kaufpreis', o.kaufpreis, 'kaltmiete', o.kaltmiete,
        'web_expose', (select w.veroeffentlicht_am is not null and w.widerrufen_am is null from public.web_expose w where w.objekt_id = o.id order by w.erstellt_am desc limit 1),
        'aufrufe', coalesce((select sum(a.aufrufe) from public.web_expose w join public.web_expose_aufruf a on a.web_expose_id = w.id where w.objekt_id = o.id), 0),
        'anfragen', (select count(*) from public.web_expose_anfrage a where a.objekt_id = o.id),
        'besichtigungen', (select count(*) from public.termine t where t.objekt_id = o.id and t.art = 'besichtigung' and t.geloescht_am is null),
        'naechste_besichtigung', (select min(t.beginnt_am) from public.termine t where t.objekt_id = o.id and t.art = 'besichtigung' and t.geloescht_am is null and t.beginnt_am > now()),
        'dokumente', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'titel', coalesce(d.titel, d.dateiname), 'art', d.art, 'bytes', d.bytes, 'erstellt_am', d.erstellt_am) order by d.erstellt_am desc)
                              from public.objekt_dokumente d where d.objekt_id = o.id and d.sichtbarkeit = 'kunde'), '[]'::jsonb),
        'checkliste', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'titel', p.titel, 'pflicht', p.pflicht, 'status', p.status, 'dokumentart', p.dokumentart) order by p.sortierung)
                               from public.checklisten c join public.checklisten_punkte p on p.checkliste_id = c.id
                               where c.objekt_id = o.id and c.abgeschlossen_am is null), '[]'::jsonb),
        'verlauf', coalesce((select jsonb_agg(jsonb_build_object('typ', a.typ, 'beschreibung', a.beschreibung, 'erstellt_am', a.erstellt_am) order by a.erstellt_am desc)
                            from (select * from public.aktivitaeten where objekt_id = o.id and typ in ('status_geaendert', 'expose_erzeugt', 'web_expose_veroeffentlicht', 'web_expose_widerrufen', 'portal_uebertragen', 'bild_hinzugefuegt', 'dokument_hinzugefuegt') order by erstellt_am desc limit 30) a), '[]'::jsonb)
      ) order by o.bezeichnung)
      from public.portal_kunden_objekte ko join public.objekte o on o.id = ko.objekt_id
      where ko.kunde_id = k.id and o.geloescht_am is null), '[]'::jsonb),
    'antraege', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'status', a.status, 'daten', a.daten, 'objekt_id', a.objekt_id, 'geaendert_am', a.geaendert_am) order by a.erstellt_am desc)
                         from public.verbrauchsausweis_antraege a where a.kunde_id = k.id), '[]'::jsonb)
  );

  if k.projekt_id is not null then
    v := v || jsonb_build_object(
      'projekt', (select jsonb_build_object('id', p.id, 'name', p.name, 'strasse', p.strasse, 'plz', p.plz, 'ort', p.ort,
                                            'beschreibung', p.beschreibung, 'status', p.status, 'vermarktungsart', p.vermarktungsart,
                                            'baubeginn', p.baubeginn, 'fertigstellung', p.fertigstellung, 'titelbild_pfad', p.titelbild_pfad)
                    from public.projekte p where p.id = k.projekt_id and p.geloescht_am is null),
      'einheiten', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'we_nr', e.we_nr, 'geschoss', e.geschoss, 'zimmer', e.zimmer,
                                                                'wohnflaeche', e.wohnflaeche, 'ausrichtung', e.ausrichtung, 'kaufpreis', e.kaufpreis,
                                                                'miete', e.miete, 'hausgeld', e.hausgeld, 'status', e.status)
                                              order by e.geschoss_index, e.sortierung, e.we_nr)
                            from public.projekt_einheiten e where e.projekt_id = k.projekt_id), '[]'::jsonb),
      'merkliste', coalesce((select jsonb_agg(m.einheit_id) from public.projekt_merkliste m where m.kunde_id = k.id), '[]'::jsonb),
      'ordner', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.sortierung, o.name)
                         from public.projekt_ordner o where o.projekt_id = k.projekt_id and o.sichtbarkeit = any(v_sicht)), '[]'::jsonb),
      'dateien', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kategorie', d.kategorie, 'bytes', d.bytes,
                                                              'ordner_id', d.ordner_id, 'einheit_id', d.einheit_id, 'erstellt_am', d.erstellt_am) order by d.erstellt_am desc)
                          from public.projekt_dateien d
                          where d.projekt_id = k.projekt_id and d.sichtbarkeit = any(v_sicht)
                            and (d.einheit_id is null or d.einheit_id = k.einheit_id)
                            and (d.ordner_id is null or exists (select 1 from public.projekt_ordner o where o.id = d.ordner_id and o.sichtbarkeit = any(v_sicht)))), '[]'::jsonb),
      'updates', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'titel', u.titel, 'text', u.text, 'bilder', to_jsonb(u.bilder), 'erstellt_am', u.erstellt_am) order by u.erstellt_am desc)
                          from public.projekt_updates u where u.projekt_id = k.projekt_id and u.sichtbarkeit = any(v_sicht)), '[]'::jsonb),
      'gewerke', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'gewerk', g.gewerk, 'firma', g.firma, 'name', g.name, 'telefon', g.telefon,
                                                              'email', g.email, 'ort', g.ort, 'info', g.info) order by g.sortierung, g.gewerk)
                          from public.projekt_kontakte g where g.projekt_id = k.projekt_id and g.fuer_kunden), '[]'::jsonb),
      'anfragen', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'einheit_id', a.einheit_id, 'art', a.art, 'status', a.status,
                                                               'nachricht', a.nachricht, 'erstellt_am', a.erstellt_am) order by a.erstellt_am desc)
                           from public.projekt_anfragen a where a.kunde_id = k.id), '[]'::jsonb)
    );
  end if;
  return v;
end $$;
grant execute on function public.portal_daten(text, text) to anon, authenticated;

/** Prueft, ob der Kunde eine Datei sehen darf, und liefert den Speicherpfad. */
create or replace function public.portal_datei(p_token text, p_passwort text, p_quelle text, p_datei uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden; v_pfad text; v_name text; v_mime text;
begin
  k := intern.portal_kunde(p_token, p_passwort, true);
  if k.id is null then return jsonb_build_object('ok', false); end if;
  if p_quelle = 'objekt' then
    select d.pfad, d.dateiname, d.mime into v_pfad, v_name, v_mime
      from public.objekt_dokumente d
      join public.portal_kunden_objekte ko on ko.objekt_id = d.objekt_id and ko.kunde_id = k.id
     where d.id = p_datei and d.sichtbarkeit = 'kunde';
  elsif p_quelle = 'projekt' then
    select d.pfad, d.name, d.mime into v_pfad, v_name, v_mime
      from public.projekt_dateien d
     where d.id = p_datei and d.projekt_id = k.projekt_id and d.sichtbarkeit = any(intern.portal_sichtbar(k))
       and (d.einheit_id is null or d.einheit_id = k.einheit_id);
  elsif p_quelle = 'persoenlich' then
    select d.pfad, d.name, d.mime into v_pfad, v_name, v_mime
      from public.portal_dokumente d where d.id = p_datei and d.kunde_id = k.id;
    update public.portal_dokumente set gesehen_am = coalesce(gesehen_am, now()) where id = p_datei and hochgeladen_von = 'makler';
  elsif p_quelle = 'update' then
    -- Bild eines Baufortschritts: p_datei ist die Update-ID, Pfad kommt als Index ueber p_passwort? Nein — eigene Funktion unten.
    return jsonb_build_object('ok', false);
  end if;
  if v_pfad is null then return jsonb_build_object('ok', false); end if;
  perform intern.portal_aktivitaet(k, 'datei', 'Datei angesehen: ' || v_name);
  return jsonb_build_object('ok', true, 'pfad', v_pfad, 'name', v_name, 'mime', v_mime);
end $$;
grant execute on function public.portal_datei(text, text, text, uuid) to anon, authenticated;

/** Bilder eines Baufortschritts (Pfadliste), wenn das Update sichtbar ist. */
create or replace function public.portal_update_bilder(p_token text, p_passwort text, p_update uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden; v text[];
begin
  k := intern.portal_kunde(p_token, p_passwort, true);
  if k.id is null then return '[]'::jsonb; end if;
  select u.bilder into v from public.projekt_updates u
   where u.id = p_update and u.projekt_id = k.projekt_id and u.sichtbarkeit = any(intern.portal_sichtbar(k));
  return coalesce(to_jsonb(v), '[]'::jsonb);
end $$;
grant execute on function public.portal_update_bilder(text, text, uuid) to anon, authenticated;

/** Nachricht des Kunden an den Makler. */
create or replace function public.portal_nachricht_senden(p_token text, p_passwort text, p_text text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden; v_n int;
begin
  k := intern.portal_kunde(p_token, p_passwort, true);
  if k.id is null then return jsonb_build_object('ok', false, 'grund', 'zugang'); end if;
  if p_text is null or length(trim(p_text)) = 0 or length(p_text) > 5000 then return jsonb_build_object('ok', false, 'grund', 'text'); end if;
  select count(*) into v_n from public.portal_nachrichten where kunde_id = k.id and richtung = 'kunde' and erstellt_am > now() - interval '1 day';
  if v_n >= 50 then return jsonb_build_object('ok', false, 'grund', 'zu_viele'); end if;
  insert into public.portal_nachrichten (mandant_id, kunde_id, richtung, text) values (k.mandant_id, k.id, 'kunde', trim(p_text));
  perform intern.portal_aktivitaet(k, 'nachricht', left(trim(p_text), 120));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.portal_nachricht_senden(text, text, text) to anon, authenticated;

/** Nachrichten des Maklers als gelesen vermerken (Kunde hat sie gesehen). */
create or replace function public.portal_gelesen(p_token text, p_passwort text)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden;
begin
  k := intern.portal_kunde(p_token, p_passwort, true);
  if k.id is null then return; end if;
  update public.portal_nachrichten set gelesen_am = now() where kunde_id = k.id and richtung = 'makler' and gelesen_am is null;
end $$;
grant execute on function public.portal_gelesen(text, text) to anon, authenticated;

/** Merkliste an/aus. */
create or replace function public.portal_merkliste_schalten(p_token text, p_passwort text, p_einheit uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden; e public.projekt_einheiten;
begin
  k := intern.portal_kunde(p_token, p_passwort, true);
  if k.id is null or k.projekt_id is null then return jsonb_build_object('ok', false, 'grund', 'zugang'); end if;
  select * into e from public.projekt_einheiten where id = p_einheit and projekt_id = k.projekt_id;
  if not found then return jsonb_build_object('ok', false, 'grund', 'einheit'); end if;
  if exists (select 1 from public.projekt_merkliste where kunde_id = k.id and einheit_id = e.id) then
    delete from public.projekt_merkliste where kunde_id = k.id and einheit_id = e.id;
    perform intern.portal_aktivitaet(k, 'merkliste', e.we_nr || ' von der Merkliste entfernt');
    return jsonb_build_object('ok', true, 'gemerkt', false);
  end if;
  insert into public.projekt_merkliste (mandant_id, projekt_id, kunde_id, einheit_id) values (k.mandant_id, k.projekt_id, k.id, e.id);
  perform intern.portal_aktivitaet(k, 'merkliste', e.we_nr || ' auf die Merkliste gesetzt');
  return jsonb_build_object('ok', true, 'gemerkt', true);
end $$;
grant execute on function public.portal_merkliste_schalten(text, text, uuid) to anon, authenticated;

/** Anfrage (Reservierung, Information, Besichtigung) zu einer Einheit. */
create or replace function public.portal_anfrage_senden(p_token text, p_passwort text, p_einheit uuid, p_art text, p_nachricht text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden; e public.projekt_einheiten; v_n int;
begin
  k := intern.portal_kunde(p_token, p_passwort, true);
  if k.id is null or k.projekt_id is null then return jsonb_build_object('ok', false, 'grund', 'zugang'); end if;
  if p_art not in ('reservierung', 'information', 'besichtigung') then return jsonb_build_object('ok', false, 'grund', 'art'); end if;
  if p_einheit is not null then
    select * into e from public.projekt_einheiten where id = p_einheit and projekt_id = k.projekt_id;
    if not found then return jsonb_build_object('ok', false, 'grund', 'einheit'); end if;
    if p_art = 'reservierung' and e.status <> 'verfuegbar' then return jsonb_build_object('ok', false, 'grund', 'vergeben'); end if;
  end if;
  select count(*) into v_n from public.projekt_anfragen where kunde_id = k.id and status = 'offen';
  if v_n >= 10 then return jsonb_build_object('ok', false, 'grund', 'zu_viele'); end if;
  if exists (select 1 from public.projekt_anfragen where kunde_id = k.id and einheit_id is not distinct from p_einheit and art = p_art and status = 'offen') then
    return jsonb_build_object('ok', false, 'grund', 'doppelt');
  end if;
  insert into public.projekt_anfragen (mandant_id, projekt_id, kunde_id, einheit_id, art, nachricht)
    values (k.mandant_id, k.projekt_id, k.id, p_einheit, p_art, nullif(left(trim(coalesce(p_nachricht, '')), 2000), ''));
  perform intern.portal_aktivitaet(k, 'anfrage', p_art || coalesce(' ' || e.we_nr, ''));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.portal_anfrage_senden(text, text, uuid, text, text) to anon, authenticated;

/** Persoenliche Unterlage des Kunden eintragen (die Datei liegt bereits im Bucket). */
create or replace function public.portal_dokument_eintragen(p_token text, p_passwort text, p_name text, p_pfad text, p_bytes integer, p_mime text, p_objekt uuid, p_kategorie text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden; v_id uuid;
begin
  k := intern.portal_kunde(p_token, p_passwort, true);
  if k.id is null then return jsonb_build_object('ok', false, 'grund', 'zugang'); end if;
  if p_pfad not like k.mandant_id::text || '/portal/' || k.id::text || '/%' then return jsonb_build_object('ok', false, 'grund', 'pfad'); end if;
  if p_objekt is not null and not exists (select 1 from public.portal_kunden_objekte where kunde_id = k.id and objekt_id = p_objekt) then
    return jsonb_build_object('ok', false, 'grund', 'objekt');
  end if;
  insert into public.portal_dokumente (mandant_id, kunde_id, objekt_id, kategorie, name, pfad, bytes, mime, hochgeladen_von)
    values (k.mandant_id, k.id, p_objekt, coalesce(nullif(p_kategorie, ''), 'sonstiges'), left(p_name, 300), p_pfad, p_bytes, p_mime, 'kunde')
    returning id into v_id;
  perform intern.portal_aktivitaet(k, 'upload', 'Unterlage hochgeladen: ' || left(p_name, 200));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
grant execute on function public.portal_dokument_eintragen(text, text, text, text, integer, text, uuid, text) to anon, authenticated;

/** Verbrauchsausweis-Antrag speichern oder einreichen. */
create or replace function public.portal_antrag_speichern(p_token text, p_passwort text, p_id uuid, p_objekt uuid, p_daten jsonb, p_einreichen boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare k public.portal_kunden; v_id uuid;
begin
  k := intern.portal_kunde(p_token, p_passwort, true);
  if k.id is null then return jsonb_build_object('ok', false, 'grund', 'zugang'); end if;
  if p_objekt is not null and not exists (select 1 from public.portal_kunden_objekte where kunde_id = k.id and objekt_id = p_objekt) then
    return jsonb_build_object('ok', false, 'grund', 'objekt');
  end if;
  if p_id is null then
    insert into public.verbrauchsausweis_antraege (mandant_id, kunde_id, objekt_id, daten, erstellt_von_typ, status, eingereicht_am)
      values (k.mandant_id, k.id, p_objekt, coalesce(p_daten, '{}'::jsonb), 'kunde',
              case when p_einreichen then 'eingereicht' else 'in_arbeit' end, case when p_einreichen then now() end)
      returning id into v_id;
  else
    update public.verbrauchsausweis_antraege
       set daten = coalesce(p_daten, daten), objekt_id = coalesce(p_objekt, objekt_id),
           status = case when p_einreichen then 'eingereicht' else status end,
           eingereicht_am = case when p_einreichen then coalesce(eingereicht_am, now()) else eingereicht_am end
     where id = p_id and kunde_id = k.id and status = 'in_arbeit'
     returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'grund', 'antrag'); end if;
  end if;
  if p_einreichen then perform intern.portal_aktivitaet(k, 'antrag', 'Verbrauchsausweis-Antrag eingereicht'); end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
grant execute on function public.portal_antrag_speichern(text, text, uuid, uuid, jsonb, boolean) to anon, authenticated;

-- ===========================================================================
-- Oeffentliche Projektseite (Token des Projekts, oeffentlich = true)
-- ===========================================================================
create or replace function public.projekt_oeffentlich(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare p public.projekte;
begin
  if p_token is null or p_token !~ '^[a-z0-9]{16,64}$' then return jsonb_build_object('zustand', 'unbekannt'); end if;
  select * into p from public.projekte where token = p_token and oeffentlich and geloescht_am is null and status in ('aktiv', 'abgeschlossen');
  if not found then return jsonb_build_object('zustand', 'unbekannt'); end if;
  return jsonb_build_object(
    'zustand', 'ok',
    'projekt', jsonb_build_object('id', p.id, 'name', p.name, 'strasse', p.strasse, 'plz', p.plz, 'ort', p.ort, 'beschreibung', p.beschreibung,
                                  'status', p.status, 'vermarktungsart', p.vermarktungsart, 'baubeginn', p.baubeginn, 'fertigstellung', p.fertigstellung,
                                  'titelbild_pfad', p.titelbild_pfad),
    'anbieter', (select jsonb_build_object('name', m.name) from public.mandanten m where m.id = p.mandant_id),
    'einheiten', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'we_nr', e.we_nr, 'geschoss', e.geschoss, 'zimmer', e.zimmer,
                                                              'wohnflaeche', e.wohnflaeche, 'ausrichtung', e.ausrichtung, 'kaufpreis', e.kaufpreis,
                                                              'miete', e.miete, 'status', e.status) order by e.geschoss_index, e.sortierung, e.we_nr)
                          from public.projekt_einheiten e where e.projekt_id = p.id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'titel', u.titel, 'text', u.text, 'erstellt_am', u.erstellt_am) order by u.erstellt_am desc)
                        from (select * from public.projekt_updates where projekt_id = p.id and sichtbarkeit = 'oeffentlich' order by erstellt_am desc limit 20) u), '[]'::jsonb),
    'dateien', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kategorie', d.kategorie, 'bytes', d.bytes) order by d.erstellt_am desc)
                        from public.projekt_dateien d where d.projekt_id = p.id and d.sichtbarkeit = 'oeffentlich' and d.einheit_id is null), '[]'::jsonb)
  );
end $$;
grant execute on function public.projekt_oeffentlich(text) to anon, authenticated;

/** Oeffentliche Projektdatei: Pfad, wenn sie frei sichtbar ist. */
create or replace function public.projekt_oeffentliche_datei(p_token text, p_datei uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select jsonb_build_object('ok', true, 'pfad', d.pfad, 'name', d.name, 'mime', d.mime)
                     from public.projekt_dateien d join public.projekte p on p.id = d.projekt_id
                    where p.token = p_token and p.oeffentlich and p.geloescht_am is null
                      and d.id = p_datei and d.sichtbarkeit = 'oeffentlich' and d.einheit_id is null),
                  jsonb_build_object('ok', false));
$$;
grant execute on function public.projekt_oeffentliche_datei(text, uuid) to anon, authenticated;

/**
 * Anfrage von der oeffentlichen Projektseite: legt einen Interessenten-Zugang an
 * (oder findet ihn ueber die E-Mail) und die Anfrage. Der Zugangslink wird vom
 * Server per Mail verschickt; die Funktion gibt nur die Kunden-ID zurueck.
 */
create or replace function public.projekt_anfrage_oeffentlich(p_token text, p_name text, p_email text, p_telefon text, p_einheit uuid, p_art text, p_nachricht text, p_token_hash text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare p public.projekte; k public.portal_kunden; v_n int; v_email text;
begin
  select * into p from public.projekte where token = p_token and oeffentlich and geloescht_am is null and status in ('aktiv', 'abgeschlossen');
  if not found then return jsonb_build_object('ok', false, 'grund', 'unbekannt'); end if;
  v_email := lower(trim(coalesce(p_email, '')));
  if length(trim(coalesce(p_name, ''))) < 2 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return jsonb_build_object('ok', false, 'grund', 'eingabe'); end if;
  if p_art not in ('reservierung', 'information', 'besichtigung') then return jsonb_build_object('ok', false, 'grund', 'eingabe'); end if;
  select count(*) into v_n from public.projekt_anfragen where projekt_id = p.id and erstellt_am > now() - interval '1 day';
  if v_n >= 200 then return jsonb_build_object('ok', false, 'grund', 'zu_viele'); end if;
  if p_einheit is not null and not exists (select 1 from public.projekt_einheiten e where e.id = p_einheit and e.projekt_id = p.id) then
    return jsonb_build_object('ok', false, 'grund', 'eingabe');
  end if;

  select * into k from public.portal_kunden where projekt_id = p.id and email = v_email and geloescht_am is null order by erstellt_am limit 1;
  if not found then
    if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok', false, 'grund', 'eingabe'); end if;
    insert into public.portal_kunden (mandant_id, art, anzeigename, email, telefon, token_hash, projekt_id, einheit_id, quelle, ansprechpartner_id)
      values (p.mandant_id, 'interessent', left(trim(p_name), 200), v_email, nullif(left(trim(coalesce(p_telefon, '')), 60), ''), p_token_hash, p.id, p_einheit, 'projektseite', p.ansprechpartner_id)
      returning * into k;
    perform intern.portal_aktivitaet(k, 'einladung', 'Zugang ueber die Projektseite angelegt');
  end if;
  insert into public.projekt_anfragen (mandant_id, projekt_id, kunde_id, einheit_id, art, nachricht)
    values (p.mandant_id, p.id, k.id, p_einheit, p_art, nullif(left(trim(coalesce(p_nachricht, '')), 2000), ''));
  perform intern.portal_aktivitaet(k, 'anfrage', p_art || ' ueber die Projektseite');
  return jsonb_build_object('ok', true, 'kunde_id', k.id, 'neu', k.angenommen_am is null and k.letzter_login_am is null and k.quelle = 'projektseite' and p_token_hash = k.token_hash);
end $$;
grant execute on function public.projekt_anfrage_oeffentlich(text, text, text, text, uuid, text, text, text) to anon, authenticated;

-- ===========================================================================
-- Maklerseite: Anfrage bestaetigen (Einheit reservieren, Zugang hochstufen)
-- ===========================================================================
create or replace function public.projekt_anfrage_bearbeiten(p_anfrage uuid, p_status text)
returns jsonb
language plpgsql volatile security invoker
set search_path = public, pg_temp
as $$
declare a public.projekt_anfragen; k public.portal_kunden;
begin
  if p_status not in ('bestaetigt', 'abgelehnt', 'offen') then raise exception 'Unbekannter Status.'; end if;
  select * into a from public.projekt_anfragen where id = p_anfrage;
  if not found then raise exception 'Anfrage nicht gefunden.'; end if;
  update public.projekt_anfragen set status = p_status, bearbeitet_von = auth.uid(), bearbeitet_am = now() where id = a.id;
  if p_status = 'bestaetigt' and a.art = 'reservierung' and a.einheit_id is not null then
    update public.projekt_einheiten set status = 'reserviert' where id = a.einheit_id and status = 'verfuegbar';
    select * into k from public.portal_kunden where id = a.kunde_id;
    update public.portal_kunden set einheit_id = a.einheit_id, fortschritt_stufe = greatest(fortschritt_stufe, 2) where id = a.kunde_id;
    insert into public.projekt_merkliste (mandant_id, projekt_id, kunde_id, einheit_id)
      values (a.mandant_id, a.projekt_id, a.kunde_id, a.einheit_id) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.projekt_anfrage_bearbeiten(uuid, text) to authenticated;
