-- ===========================================================================
-- ImmoOffice.ai — Objekte und Kontakte
--
-- Master-Prompt Abschnitt 7. Das Objektmodell folgt der OpenImmo-Feldlogik,
-- damit der Portalexport ohne verlustbehaftete Abbildung moeglich ist —
-- Einzelheiten in OPENIMMO_MAPPING.md.
-- ===========================================================================

create type public.vermarktungsart as enum ('kauf', 'miete', 'kauf_miete');

create type public.objektkategorie as enum (
  'wohnung', 'haus', 'grundstueck', 'gewerbe', 'anlage', 'sonstige'
);

create type public.nutzungsart as enum ('wohnen', 'gewerbe', 'anlage', 'gemischt');

create type public.objektstatus as enum (
  'akquise', 'vorbereitung', 'aktiv', 'reserviert', 'verkauft', 'vermietet',
  'zurueckgezogen', 'archiviert'
);

create type public.energieausweistyp as enum (
  'bedarf', 'verbrauch', 'nicht_erforderlich', 'liegt_nicht_vor'
);

create type public.kontaktrolle as enum (
  'eigentuemer', 'interessent', 'kaeufer', 'mieter', 'dienstleister',
  'notar', 'sonstige'
);

-- --- Objekte ---------------------------------------------------------------

create table public.objekte (
  id             uuid primary key default gen_random_uuid(),
  mandant_id     uuid not null references public.mandanten(id) on delete cascade,
  objektnummer   text not null,
  stammobjekt_id uuid references public.objekte(id) on delete set null,

  bezeichnung text not null check (length(trim(bezeichnung)) between 1 and 200),
  titel       text,

  vermarktungsart public.vermarktungsart not null default 'kauf',
  objektkategorie public.objektkategorie not null default 'wohnung',
  objektart       text,
  nutzungsart     public.nutzungsart not null default 'wohnen',
  status          public.objektstatus not null default 'akquise',

  auftragsart text,
  auftrag_von date,
  auftrag_bis date,

  -- Adresse
  strasse        text,
  hausnummer     text,
  plz            text check (plz is null or plz ~ '^[0-9]{4,5}$'),
  ort            text,
  ortsteil       text,
  land           text not null default 'DE',
  etage          text,
  etagen_gesamt  smallint check (etagen_gesamt is null or etagen_gesamt between 0 and 200),
  wohnungsnummer text,
  -- Geokoordinaten fehlten der Referenz; OpenImmo verlangt sie.
  lat numeric(9,6) check (lat is null or lat between -90 and 90),
  lon numeric(9,6) check (lon is null or lon between -180 and 180),
  adresse_veroeffentlichen boolean not null default false,

  -- Flaechen und Raeume
  wohnflaeche         numeric(10,2) check (wohnflaeche is null or wohnflaeche >= 0),
  nutzflaeche         numeric(10,2) check (nutzflaeche is null or nutzflaeche >= 0),
  gesamtflaeche       numeric(10,2) check (gesamtflaeche is null or gesamtflaeche >= 0),
  grundstuecksflaeche numeric(10,2) check (grundstuecksflaeche is null or grundstuecksflaeche >= 0),
  zimmer              numeric(4,1) check (zimmer is null or zimmer >= 0),
  schlafzimmer        smallint check (schlafzimmer is null or schlafzimmer >= 0),
  badezimmer          smallint check (badezimmer is null or badezimmer >= 0),
  anzahl_balkone      smallint check (anzahl_balkone is null or anzahl_balkone >= 0),
  anzahl_terrassen    smallint check (anzahl_terrassen is null or anzahl_terrassen >= 0),
  stellplatz_anzahl   smallint check (stellplatz_anzahl is null or stellplatz_anzahl >= 0),
  stellplatz_art      text,

  -- Zustand
  baujahr               smallint check (baujahr is null or baujahr between 1000 and 2200),
  letzte_modernisierung smallint check (letzte_modernisierung is null or letzte_modernisierung between 1000 and 2200),
  zustand               text,
  ausstattungsqualitaet text,
  verfuegbar_ab         text,

  -- Preise
  kaufpreis             numeric(14,2) check (kaufpreis is null or kaufpreis >= 0),
  kaufpreis_auf_anfrage boolean not null default false,
  kaltmiete             numeric(14,2) check (kaltmiete is null or kaltmiete >= 0),
  warmmiete             numeric(14,2) check (warmmiete is null or warmmiete >= 0),
  nebenkosten           numeric(14,2) check (nebenkosten is null or nebenkosten >= 0),
  heizkosten            numeric(14,2) check (heizkosten is null or heizkosten >= 0),
  kaution               numeric(14,2) check (kaution is null or kaution >= 0),
  hausgeld              numeric(14,2) check (hausgeld is null or hausgeld >= 0),
  miete_ist             numeric(14,2) check (miete_ist is null or miete_ist >= 0),
  miete_soll            numeric(14,2) check (miete_soll is null or miete_soll >= 0),
  provision_kaeufer     text,
  provision_verkaeufer  text,
  provision_hinweis     text,
  courtage_frei         boolean not null default false,
  grunderwerbsteuer_satz numeric(5,2),

  -- Energieausweis (GEG-Pflichtangaben)
  energieausweis_typ  public.energieausweistyp,
  energie_kennwert    numeric(8,2) check (energie_kennwert is null or energie_kennwert >= 0),
  energie_klasse      text check (energie_klasse is null or energie_klasse in
                        ('A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  energie_traeger     text,
  energie_baujahr_anlage smallint,
  energie_warmwasser_enthalten boolean,
  energie_gueltig_bis date,

  -- Texte
  beschreibung_objekt      text,
  beschreibung_ausstattung text,
  beschreibung_lage        text,
  beschreibung_sonstiges   text,
  -- KI-Texte sind freigabepflichtig (Abschnitt 8).
  texte_ki_erzeugt      boolean not null default false,
  texte_freigegeben_am  timestamptz,
  texte_freigegeben_von uuid references public.benutzer(id) on delete set null,

  zustaendig_id uuid references public.benutzer(id) on delete set null,
  erstellt_von  uuid references public.benutzer(id) on delete set null,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  -- Loeschen ist fachlich ein Zustand (Aufbewahrungspflichten, Abschnitt 16).
  geloescht_am  timestamptz,

  constraint objekte_nummer_je_mandant unique (mandant_id, objektnummer)
);

create index objekte_mandant_idx on public.objekte(mandant_id) where geloescht_am is null;
create index objekte_status_idx on public.objekte(mandant_id, status) where geloescht_am is null;
create index objekte_stammobjekt_idx on public.objekte(stammobjekt_id);

comment on table public.objekte is
  'Objektstamm entlang der OpenImmo-Feldlogik (siehe OPENIMMO_MAPPING.md).';

-- --- Kontakte --------------------------------------------------------------
-- Anders als in der Referenz EINE Entitaet mit Rollen statt getrennter
-- Tabellen fuer Interessenten und Eigentuemer — dieselbe Person ist haeufig
-- beides.

create table public.kontakte (
  id         uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,

  anrede     text,
  titel      text,
  vorname    text,
  nachname   text,
  firma      text,
  email      text,
  telefon    text,
  mobil      text,
  strasse    text,
  hausnummer text,
  plz        text,
  ort        text,
  land       text not null default 'DE',

  quelle      text,
  notizen     text,
  betreuer_id uuid references public.benutzer(id) on delete set null,

  einwilligung_werbung boolean not null default false,
  einwilligung_am      timestamptz,

  erstellt_von    uuid references public.benutzer(id) on delete set null,
  erstellt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now(),
  geloescht_am    timestamptz,
  -- Anonymisierung, wo Aufbewahrungspflichten einer Loeschung entgegenstehen.
  anonymisiert_am timestamptz,

  constraint kontakte_bezeichnung check (
    coalesce(trim(nachname), '') <> '' or coalesce(trim(firma), '') <> ''
  )
);

create index kontakte_mandant_idx on public.kontakte(mandant_id) where geloescht_am is null;
create index kontakte_name_idx on public.kontakte(mandant_id, nachname, vorname);

create table public.kontakt_rollen (
  kontakt_id uuid not null references public.kontakte(id) on delete cascade,
  mandant_id uuid not null references public.mandanten(id) on delete cascade,
  rolle      public.kontaktrolle not null,
  primary key (kontakt_id, rolle)
);

create table public.kontakt_objekt (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  kontakt_id  uuid not null references public.kontakte(id) on delete cascade,
  objekt_id   uuid not null references public.objekte(id) on delete cascade,
  rolle       public.kontaktrolle not null,
  anteil      numeric(5,2) check (anteil is null or anteil between 0 and 100),
  seit        date,
  bis         date,
  erstellt_am timestamptz not null default now(),
  unique (kontakt_id, objekt_id, rolle)
);

create index kontakt_objekt_objekt_idx on public.kontakt_objekt(objekt_id);
create index kontakt_objekt_kontakt_idx on public.kontakt_objekt(kontakt_id);

create trigger objekte_geaendert before update on public.objekte
  for each row execute function public.setze_geaendert_am();
create trigger kontakte_geaendert before update on public.kontakte
  for each row execute function public.setze_geaendert_am();

-- --- Objektnummer je Mandant fortlaufend vergeben --------------------------

create or replace function public.naechste_objektnummer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_naechste int;
begin
  if new.objektnummer is not null and trim(new.objektnummer) <> '' then
    return new;
  end if;
  select coalesce(max(nullif(regexp_replace(objektnummer, '\D', '', 'g'), '')::int), 0) + 1
    into v_naechste
    from public.objekte
   where mandant_id = new.mandant_id;
  new.objektnummer := lpad(v_naechste::text, 4, '0');
  return new;
end;
$$;

create trigger objekte_nummer before insert on public.objekte
  for each row execute function public.naechste_objektnummer();

-- ===========================================================================
-- Row-Level-Security: strikte Mandantentrennung (Abschnitt 5)
-- ===========================================================================

alter table public.objekte        enable row level security;
alter table public.kontakte       enable row level security;
alter table public.kontakt_rollen enable row level security;
alter table public.kontakt_objekt enable row level security;

create policy objekte_lesen on public.objekte
  for select using (mandant_id = public.aktueller_mandant());
create policy objekte_anlegen on public.objekte
  for insert with check (mandant_id = public.aktueller_mandant() and public.darf_schreiben());
create policy objekte_aendern on public.objekte
  for update using (mandant_id = public.aktueller_mandant() and public.darf_schreiben())
  with check (mandant_id = public.aktueller_mandant());
create policy objekte_loeschen on public.objekte
  for delete using (mandant_id = public.aktueller_mandant() and public.ist_verwaltung());

create policy kontakte_lesen on public.kontakte
  for select using (mandant_id = public.aktueller_mandant());
create policy kontakte_anlegen on public.kontakte
  for insert with check (mandant_id = public.aktueller_mandant() and public.darf_schreiben());
create policy kontakte_aendern on public.kontakte
  for update using (mandant_id = public.aktueller_mandant() and public.darf_schreiben())
  with check (mandant_id = public.aktueller_mandant());
create policy kontakte_loeschen on public.kontakte
  for delete using (mandant_id = public.aktueller_mandant() and public.ist_verwaltung());

create policy kontakt_rollen_lesen on public.kontakt_rollen
  for select using (mandant_id = public.aktueller_mandant());
create policy kontakt_rollen_schreiben on public.kontakt_rollen
  for all using (mandant_id = public.aktueller_mandant() and public.darf_schreiben())
  with check (mandant_id = public.aktueller_mandant() and public.darf_schreiben());

create policy kontakt_objekt_lesen on public.kontakt_objekt
  for select using (mandant_id = public.aktueller_mandant());
create policy kontakt_objekt_schreiben on public.kontakt_objekt
  for all using (mandant_id = public.aktueller_mandant() and public.darf_schreiben())
  with check (mandant_id = public.aktueller_mandant() and public.darf_schreiben());
