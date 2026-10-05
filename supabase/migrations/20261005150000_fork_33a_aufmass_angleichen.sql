-- ===========================================================================
-- Fork-eigene Migration 33a — Aufmass an die echte Fassung der Vorlage
-- angleichen, dazu Aufmass-Projekte (Stufen 151–173 der Vorlage)
--
-- fork_31a hat aufmass_scan und scan_ablage aus der Oberflaeche abgeleitet,
-- weil der Export der Vorlage keine Tabellendefinition mitbrachte. Inzwischen
-- liegt die Definition der Vorlage vor (Datei portal/aufmass/aufmass.sql und
-- die Migrationen aufmass_scan_raumscan_datei, aufmass_projekt,
-- scan_ablage_projekt vom 02. und 03.10.2026). Der Vergleich zeigt, dass die
-- abgeleitete Fassung zu schmal war: die Oberflaeche schreibt beim
-- Zuordnen aus der Ablage quelle, scan_ablage_id und ersteller_id — Spalten,
-- die es im Fork nicht gab. Jedes dieser inserts waere gescheitert.
--
-- Bewusst abweichend von der Vorlage, wie bei allen Fork-Tabellen:
--   * id bleibt uuid (Vorlage: bigint identity). Die Oberflaeche vergleicht
--     Kennungen nur als Zeichenkette; scan_ablage.id ist im Fork ebenfalls
--     uuid, also ist auch scan_ablage_id uuid.
--   * mandant_id mit Vorgabewert aus der Anmeldung und restriktiver
--     Mandantengrenze (Regel aus fork_07/fork_22).
--   * ersteller_id zeigt auf profiles statt auf auth.users, wie in fork_31a.
--
-- Beide Tabellen sind leer (gemessen am 05.10.2026), die Angleichung ist
-- also verlustfrei.
-- ===========================================================================

-- ------------------------------------------------------------ aufmass_scan
alter table public.aufmass_scan
  add column if not exists quelle            text,
  add column if not exists scan_ablage_id    uuid references public.scan_ablage(id) on delete cascade,
  add column if not exists datei_id          uuid references public.immobilie_datei(id) on delete cascade,
  add column if not exists ersteller_id      uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at        timestamptz not null default now(),
  -- Hybrid (App ab Build 36): datei_id zeigt auf die Rohwolke,
  -- raumscan_datei_id auf die scan.json des Raumscans.
  add column if not exists raumscan_datei_id uuid references public.immobilie_datei(id) on delete set null;

-- Die Vorlage verlangt die Herkunft und genau einen Verweis passend dazu.
alter table public.aufmass_scan alter column quelle set not null;
alter table public.aufmass_scan
  add constraint aufmass_scan_quelle_check check (quelle in ('ablage', 'objekt')),
  add constraint aufmass_scan_verweis_check check (
    (quelle = 'ablage' and scan_ablage_id is not null and datei_id is null)
    or (quelle = 'objekt' and datei_id is not null and scan_ablage_id is null));

-- Geraten in fork_31a, in der Vorlage nicht vorhanden: ein Gesamtscan je
-- Geschoss und "Gesamt ohne Raum". Sie fallen in fork_33c weg (getrennt,
-- weil ein drop eine eigene Freigabe braucht).

-- Eine Datei wird nur einmal zugeordnet.
create unique index if not exists aufmass_scan_ablage_uq on public.aufmass_scan (scan_ablage_id) where scan_ablage_id is not null;
create unique index if not exists aufmass_scan_datei_uq on public.aufmass_scan (datei_id) where datei_id is not null;

create or replace function public.aufmass_scan_aktualisiert() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create or replace trigger aufmass_scan_aktualisiert before update on public.aufmass_scan
  for each row execute function public.aufmass_scan_aktualisiert();

-- --------------------------------------------------------- aufmass_projekt
-- Stufe 157: Aufmass-Projekte im Scanner — eine Adresse, mehrere Scans,
-- spaeter einem Objekt zuordenbar.
create table if not exists public.aufmass_projekt (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null default public.aktuelle_mandant_id()
               references public.mandanten(id) on delete cascade,
  titel        text not null check (length(btrim(titel)) > 0),
  strasse      text,
  hausnummer   text,
  plz          text,
  ort          text,
  lat          double precision,
  lon          double precision,
  art          text not null default 'wohnung' check (art in ('wohnung', 'einfamilienhaus', 'doppelhaushaelfte', 'reihenhaus', 'mehrfamilienhaus', 'wohn_geschaeftshaus', 'gewerbe', 'grundstueck', 'sonstiges')),
  notiz        text,
  immobilie_id uuid references public.immobilien(id) on delete set null,
  status       text not null default 'offen' check (status in ('offen', 'fertig')),
  ersteller_id uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists aufmass_projekt_erstellt_idx on public.aufmass_projekt (created_at desc);
create index if not exists aufmass_projekt_mandant_idx on public.aufmass_projekt (mandant_id);

alter table public.aufmass_projekt enable row level security;
create policy aufmass_projekt_select on public.aufmass_projekt for select to authenticated using (public.ist_team());
create policy aufmass_projekt_insert on public.aufmass_projekt for insert to authenticated with check (public.ist_team());
create policy aufmass_projekt_update on public.aufmass_projekt for update to authenticated using (public.ist_team()) with check (public.ist_team());
create policy aufmass_projekt_delete on public.aufmass_projekt for delete to authenticated
  using (public.ist_team() and (ersteller_id = auth.uid() or public.ist_chef()));
create policy mandant_trennung on public.aufmass_projekt as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

create or replace function public.aufmass_projekt_aktualisiert() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create or replace trigger aufmass_projekt_aktualisiert before update on public.aufmass_projekt
  for each row execute function public.aufmass_projekt_aktualisiert();

insert into public.mandanten_einstufung (tabelle, gruppe, grund) values
  ('aufmass_projekt', 'MANDANT', 'Aufmass-Projekte des Bueros (Stufe 157)')
on conflict (tabelle) do nothing;

-- ------------------------------------------------------------- scan_ablage
-- Scans eines Aufmass-Projekts, dazu Fotos als eigene Art. Die Werte
-- 'aufmass' und 'sonstiges' aus fork_31a bleiben erlaubt, damit nichts
-- abgelehnt wird, was der Fork bisher angenommen hat.
alter table public.scan_ablage
  add column if not exists projekt_id uuid references public.aufmass_projekt(id) on delete set null;
create index if not exists scan_ablage_projekt_idx on public.scan_ablage (projekt_id, created_at desc) where projekt_id is not null;
-- Die Pruefbedingung der Art wird in fork_33c um 'foto' erweitert.
