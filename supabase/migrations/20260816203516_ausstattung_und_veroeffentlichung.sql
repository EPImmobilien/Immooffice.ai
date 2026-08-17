-- Strukturierte Ausstattung und Veroeffentlichung je Kanal (Abschnitt 7).
-- Die Referenz fuehrte Ausstattung nur als Freitext; OpenImmo verlangt
-- einzelne Merkmale. Siehe OPENIMMO_MAPPING.md, Abschnitt 7.

create type public.veroeffentlichungskanal as enum (
  'web_expose','immoscout24','immowelt','kleinanzeigen'
);

create type public.veroeffentlichungsstatus as enum (
  'entwurf','geplant','uebertragen','fehler','zurueckgezogen'
);

create table public.objekt_ausstattung (
  objekt_id  uuid not null references public.objekte(id) on delete cascade,
  mandant_id uuid not null references public.mandanten(id) on delete cascade,
  merkmal    text not null,
  wert       text,
  primary key (objekt_id, merkmal)
);

create index objekt_ausstattung_mandant_idx on public.objekt_ausstattung(mandant_id);

comment on table public.objekt_ausstattung is
  'Einzelmerkmale statt Freitext — Voraussetzung fuer verlustfreien OpenImmo-Export.';

create table public.objekt_veroeffentlichung (
  id         uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,
  objekt_id  uuid not null references public.objekte(id) on delete cascade,
  kanal      public.veroeffentlichungskanal not null,
  status     public.veroeffentlichungsstatus not null default 'entwurf',

  veroeffentlicht_am     timestamptz,
  zurueckgezogen_am      timestamptz,
  letzte_uebertragung_am timestamptz,
  letzte_meldung         text,
  -- Zaehlt hoch, sobald ein Objekt erneut uebertragen wird. OpenImmo
  -- unterscheidet Erstuebertragung (NEU) von Aenderung (CHANGE).
  uebertragungen         integer not null default 0,

  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  unique (objekt_id, kanal)
);

create index objekt_veroeffentlichung_mandant_idx
  on public.objekt_veroeffentlichung(mandant_id);

create trigger objekt_veroeffentlichung_geaendert
  before update on public.objekt_veroeffentlichung
  for each row execute function intern.setze_geaendert_am();

alter table public.objekt_ausstattung       enable row level security;
alter table public.objekt_veroeffentlichung enable row level security;

create policy ausstattung_lesen on public.objekt_ausstattung
  for select using (mandant_id = intern.aktueller_mandant());
create policy ausstattung_schreiben on public.objekt_ausstattung
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create policy veroeffentlichung_lesen on public.objekt_veroeffentlichung
  for select using (mandant_id = intern.aktueller_mandant());
create policy veroeffentlichung_schreiben on public.objekt_veroeffentlichung
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- Portalzugaenge je Mandant. Die Zugangsdaten gehoeren dem Mandanten, nicht
-- der Plattform (OPENIMMO_MAPPING.md, Abschnitt 12). Sie werden verschluesselt
-- abgelegt und sind fuer andere Mandanten nicht lesbar.
create table public.portal_zugang (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  kanal         public.veroeffentlichungskanal not null,
  anbieternummer text,
  openimmo_anid  text,
  -- Verschluesselt ueber pgsodium/vault; nie im Klartext.
  zugangsdaten_verschluesselt text,
  aktiv         boolean not null default false,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  unique (mandant_id, kanal)
);

create trigger portal_zugang_geaendert before update on public.portal_zugang
  for each row execute function intern.setze_geaendert_am();

alter table public.portal_zugang enable row level security;

-- Nur die Verwaltung darf Portalzugaenge sehen und pflegen: Sie enthalten
-- Zugangsdaten und gehen Makler oder Assistenz nichts an.
create policy portal_zugang_verwaltung on public.portal_zugang
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung());
