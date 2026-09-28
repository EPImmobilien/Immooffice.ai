-- ===========================================================================
-- Fork-eigene Migration 02 — Konto, Gesellschaften, Standorte
--
-- Der Auftrag vom 28.09.2026 verlangt drei Ebenen: Konto (Mandantengrenze),
-- darunter beliebig viele Gesellschaften (Rechtstraeger), darunter beliebig
-- viele Standorte (Bueros). Er schlaegt vor, dafuer die vorhandene `firma_id`
-- als Konto zu verwenden, "damit nicht 167 Tabellen umbenannt werden muessen".
--
-- Das geht nicht, und der Grund dafuer spart zugleich die Umbenennung:
--
--   * `firma_id` gibt es bisher in genau ZWEI Tabellen, profiles und
--     rechnung_nummern_sequence, und beide zeigen per Fremdschluessel auf
--     firma_stammdaten. Dort bedeutet sie heute schon "Standort bzw.
--     Rechtstraeger" — firma_stammdaten.typ hat den Standardwert 'standort',
--     und die Vorlage fuehrte darin ihre drei Bueros mit je eigenen
--     Firmendaten, Registerangaben und Nummernkreisen.
--   * Genau das will der Auftrag selbst: "Jede Gesellschaft hat einen eigenen
--     Rechnungs-Nummernkreis." Wuerde firma_id zum Konto umgedeutet, haenge
--     der Nummernkreis am Konto statt an der Gesellschaft — das Gegenteil.
--   * Die befuerchtete Umbenennung faellt ohnehin nicht an: 185 der 187
--     Tabellen haben ueberhaupt keine Mandantenspalte. Sie brauchen so oder
--     so eine neue Spalte. Wie sie heisst, kostet nichts.
--
-- Deshalb: `konto_id` ist die Mandantengrenze, `firma_id` behaelt seine
-- Bedeutung. Begruendet in docs/ENTSCHEIDUNGEN.md, 28.09.2026.
--
-- Diese Migration legt nur die Struktur an. Sie verschiebt keine Daten und
-- macht noch keine Spalte NOT NULL — das folgt in fork_03, nachdem das erste
-- Konto steht.
-- ===========================================================================

-- --- Konto: die Mandantengrenze ------------------------------------------
create table public.konten (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  land          text not null default 'DE',
  zeitzone      text not null default 'Europe/Berlin',
  abo_status    text not null default 'test'
                check (abo_status in ('test','aktiv','gesperrt','gekuendigt')),
  testphase_bis timestamptz,
  gesperrt_am   timestamptz,
  gesperrt_grund text,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);
comment on table public.konten is
  'Die Mandantengrenze. Ein Konto ist ein Kunde von immoOffice.ai; die RLS '
  'trennt ausschliesslich auf dieser Ebene hart. Darunter liegen '
  'gesellschaften (Rechtstraeger) und firma_stammdaten (Standorte).';

-- --- Gesellschaften: die Rechtstraeger eines Kontos -----------------------
create table public.gesellschaften (
  id            uuid primary key default gen_random_uuid(),
  konto_id      uuid not null references public.konten(id) on delete cascade,
  name          text not null,
  rechtsform    text not null default 'GmbH',
  ist_standard  boolean not null default false,
  aktiv         boolean not null default true,
  archiviert_am timestamptz,
  sortierung    integer not null default 0,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);
comment on table public.gesellschaften is
  'Rechtstraeger eines Kontos. Traegt spaeter Register, Steuer, Bank, § 34c '
  'und einen eigenen Rechnungs-Nummernkreis. Die Firmendaten selbst liegen '
  'vorerst weiter in firma_stammdaten und wandern in einem eigenen Schritt.';
create unique index gesellschaften_ein_standard
  on public.gesellschaften (konto_id) where ist_standard;
create index gesellschaften_konto_idx on public.gesellschaften (konto_id);

-- --- firma_stammdaten wird zum Standort unter einer Gesellschaft ----------
-- Die Tabelle ist schon heute die Standorttabelle: typ hat den Standardwert
-- 'standort', und die Vorlage fuehrte darin ihre drei Bueros mit je eigenen
-- Firmendaten. Sie bekommt nur die beiden Verweise nach oben.
alter table public.firma_stammdaten
  add column konto_id uuid references public.konten(id) on delete cascade,
  add column gesellschaft_id uuid references public.gesellschaften(id);
create index firma_stammdaten_konto_idx on public.firma_stammdaten (konto_id);
create index firma_stammdaten_gesellschaft_idx on public.firma_stammdaten (gesellschaft_id);

-- --- Mitarbeiter haengen am Konto und an einem Hauptstandort --------------
alter table public.profiles
  add column konto_id uuid references public.konten(id) on delete cascade;
create index profiles_konto_idx on public.profiles (konto_id);

-- --- Die Mandantengrenze als Funktion ------------------------------------
-- Gegenstueck zu aktuelle_rolle(), gleiche Bauart: STABLE, SECURITY DEFINER,
-- fester search_path. Sie ist die Grundlage jeder Mandanten-Richtlinie und
-- darf deshalb nicht davon abhaengen, was sonst im Suchpfad liegt.
create or replace function public.aktuelle_konto_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select konto_id from public.profiles where id = auth.uid()
$function$;
comment on function public.aktuelle_konto_id() is
  'Das Konto des angemeldeten Nutzers. Grundlage jeder Mandanten-Richtlinie.';

-- --- Richtlinien fuer die beiden neuen Tabellen ---------------------------
alter table public.konten enable row level security;
alter table public.gesellschaften enable row level security;

create policy "konten_eigenes_lesen" on public.konten
  for select to authenticated using (id = public.aktuelle_konto_id());
create policy "konten_chef_aendert" on public.konten
  for update to authenticated
  using (id = public.aktuelle_konto_id() and public.ist_chef())
  with check (id = public.aktuelle_konto_id() and public.ist_chef());

create policy "gesellschaften_eigene_lesen" on public.gesellschaften
  for select to authenticated using (konto_id = public.aktuelle_konto_id());
create policy "gesellschaften_chef_verwaltet" on public.gesellschaften
  for all to authenticated
  using (konto_id = public.aktuelle_konto_id() and public.ist_chef())
  with check (konto_id = public.aktuelle_konto_id() and public.ist_chef());
