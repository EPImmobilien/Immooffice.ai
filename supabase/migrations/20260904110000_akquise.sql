-- ===========================================================================
-- Akquise (docs/FUNKTIONSABGLEICH.md A1/A2, Referenz-Kachel „Akquise"):
-- Pipelines mit Stufen (Wahrscheinlichkeit, gewonnen/verloren), Kampagnen und
-- Quellen, Leads mit Dossier und Historie, Aktivitaeten, Vorlagen und
-- Automationen (Matrix Pipeline x Stufe x Quelle) mit geplanten Laeufen,
-- Akquise-Radar (manuell erfasste Inserate), Einstellungen des Preis-Finders.
-- Der Objektstatus bleibt beim Objekt; ein gewonnener Lead wird zum Objekt
-- im Status „akquise".
-- ===========================================================================

-- --- Einstellungen je Mandant (Preis-Finder, Verlustgruende, Nachfassen) ------
create table public.akquise_einstellungen (
  mandant_id        uuid primary key references public.mandanten(id) on delete cascade,
  provision_satz    numeric(5,2) not null default 3.57 check (provision_satz between 0 and 20),
  startpreis_faktor numeric(4,2) not null default 0.85 check (startpreis_faktor between 0.5 and 1.5),
  spanne_prozent    numeric(5,2) not null default 10 check (spanne_prozent between 0 and 50),
  nachfassen_tage   integer not null default 7 check (nachfassen_tage between 1 and 365),
  verlustgruende    text[] not null default array['Kein Verkaufsinteresse mehr','Anderer Makler beauftragt','Privat verkauft','Preisvorstellung zu hoch','Nicht erreichbar','Sonstiges'],
  geaendert_am      timestamptz not null default now()
);
create trigger akquise_einstellungen_geaendert before update on public.akquise_einstellungen
  for each row execute function intern.setze_geaendert_am();
alter table public.akquise_einstellungen enable row level security;
create policy akquise_einstellungen_lesen on public.akquise_einstellungen
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_einstellungen_schreiben on public.akquise_einstellungen
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

-- --- Pipelines und Stufen --------------------------------------------------------
create table public.akquise_pipelines (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  beschreibung text,
  ist_standard boolean not null default false,
  sortierung   integer not null default 0,
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);
create index akquise_pipelines_mandant on public.akquise_pipelines (mandant_id, sortierung);
create trigger akquise_pipelines_geaendert before update on public.akquise_pipelines
  for each row execute function intern.setze_geaendert_am();
alter table public.akquise_pipelines enable row level security;
create policy akquise_pipelines_lesen on public.akquise_pipelines
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_pipelines_schreiben on public.akquise_pipelines
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

create table public.akquise_stufen (
  id                 uuid primary key default gen_random_uuid(),
  mandant_id         uuid not null references public.mandanten(id) on delete cascade,
  pipeline_id        uuid not null references public.akquise_pipelines(id) on delete cascade,
  name               text not null check (length(trim(name)) between 1 and 120),
  zusatz             text,
  sortierung         integer not null default 0,
  wahrscheinlichkeit smallint not null default 0 check (wahrscheinlichkeit between 0 and 100),
  ist_gewonnen       boolean not null default false,
  ist_verloren       boolean not null default false,
  erstellt_am        timestamptz not null default now(),
  constraint akquise_stufe_eindeutig check (not (ist_gewonnen and ist_verloren))
);
create index akquise_stufen_pipeline on public.akquise_stufen (pipeline_id, sortierung);
alter table public.akquise_stufen enable row level security;
create policy akquise_stufen_lesen on public.akquise_stufen
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_stufen_schreiben on public.akquise_stufen
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

-- --- Kampagnen und Quellen -------------------------------------------------------
create table public.akquise_kampagnen (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 160),
  art         text not null default 'online' check (art in ('online', 'offline', 'netzwerk', 'tippgeber')),
  kanal       text,
  budget      numeric(12,2) check (budget is null or budget >= 0),
  ausgaben    numeric(12,2) not null default 0 check (ausgaben >= 0),
  beginn      date,
  ende        date,
  notiz       text,
  aktiv       boolean not null default true,
  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  constraint akquise_kampagne_zeitraum check (beginn is null or ende is null or ende >= beginn)
);
create index akquise_kampagnen_mandant on public.akquise_kampagnen (mandant_id, aktiv);
create trigger akquise_kampagnen_geaendert before update on public.akquise_kampagnen
  for each row execute function intern.setze_geaendert_am();
alter table public.akquise_kampagnen enable row level security;
create policy akquise_kampagnen_lesen on public.akquise_kampagnen
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_kampagnen_schreiben on public.akquise_kampagnen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.akquise_quellen (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  art         text not null default 'online' check (art in ('online', 'offline', 'netzwerk', 'tippgeber')),
  kampagne_id uuid references public.akquise_kampagnen(id) on delete set null,
  -- Leads dieser Quelle landen in dieser Pipeline (sonst Standard)
  pipeline_id uuid references public.akquise_pipelines(id) on delete set null,
  sortierung  integer not null default 0,
  aktiv       boolean not null default true,
  erstellt_am timestamptz not null default now()
);
create index akquise_quellen_mandant on public.akquise_quellen (mandant_id, sortierung);
alter table public.akquise_quellen enable row level security;
create policy akquise_quellen_lesen on public.akquise_quellen
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_quellen_schreiben on public.akquise_quellen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Vorlagen und Automationen ---------------------------------------------------
create table public.akquise_vorlagen (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 160),
  kanal       text not null default 'mail' check (kanal in ('mail', 'aufgabe', 'whatsapp')),
  betreff     text,
  text        text not null default '',
  aktiv       boolean not null default true,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);
create index akquise_vorlagen_mandant on public.akquise_vorlagen (mandant_id, kanal);
create trigger akquise_vorlagen_geaendert before update on public.akquise_vorlagen
  for each row execute function intern.setze_geaendert_am();
alter table public.akquise_vorlagen enable row level security;
create policy akquise_vorlagen_lesen on public.akquise_vorlagen
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_vorlagen_schreiben on public.akquise_vorlagen
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

create table public.akquise_automationen (
  id                  uuid primary key default gen_random_uuid(),
  mandant_id          uuid not null references public.mandanten(id) on delete cascade,
  name                text,
  pipeline_id         uuid not null references public.akquise_pipelines(id) on delete cascade,
  stufe_id            uuid not null references public.akquise_stufen(id) on delete cascade,
  -- null = jede Quelle
  quelle_id           uuid references public.akquise_quellen(id) on delete cascade,
  kanal               text not null default 'mail' check (kanal in ('mail', 'aufgabe', 'whatsapp')),
  vorlage_id          uuid references public.akquise_vorlagen(id) on delete set null,
  verzoegerung_stunden integer not null default 0 check (verzoegerung_stunden between 0 and 8760),
  aktiv               boolean not null default true,
  bedingungen         jsonb not null default '{}'::jsonb,
  erstellt_am         timestamptz not null default now(),
  geaendert_am        timestamptz not null default now()
);
create index akquise_automationen_matrix on public.akquise_automationen (pipeline_id, stufe_id, quelle_id) where aktiv;
create trigger akquise_automationen_geaendert before update on public.akquise_automationen
  for each row execute function intern.setze_geaendert_am();
alter table public.akquise_automationen enable row level security;
create policy akquise_automationen_lesen on public.akquise_automationen
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_automationen_schreiben on public.akquise_automationen
  for all using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

-- --- Radar: manuell erfasste Privatanbieter-Inserate ------------------------------
-- Kein automatisches Auslesen fremder Portale (rechtliche Pruefung offen, siehe
-- docs/BLOCKER.md); die Erfassung erfolgt von Hand oder ueber die Schnittstelle.
create table public.akquise_radar (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  titel        text,
  strasse      text,
  plz          text,
  ort          text,
  objektart    text,
  wohnflaeche  numeric(10,2) check (wohnflaeche is null or wohnflaeche >= 0),
  preis        numeric(14,2) check (preis is null or preis >= 0),
  quelle       text,
  url          text,
  anbieter_typ text not null default 'privat' check (anbieter_typ in ('privat', 'gewerblich', 'unbekannt')),
  telefon      text,
  notiz        text,
  status       text not null default 'neu' check (status in ('neu', 'uebernommen', 'verworfen')),
  lead_id      uuid,
  erfasst_von  uuid references public.benutzer(id) on delete set null,
  erstellt_am  timestamptz not null default now()
);
create index akquise_radar_mandant on public.akquise_radar (mandant_id, status, erstellt_am desc);
alter table public.akquise_radar enable row level security;
create policy akquise_radar_lesen on public.akquise_radar
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_radar_schreiben on public.akquise_radar
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Leads -----------------------------------------------------------------------
create table public.akquise_leads (
  id              uuid primary key default gen_random_uuid(),
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  titel           text not null check (length(trim(titel)) between 1 and 200),
  strasse         text,
  hausnummer      text,
  plz             text,
  ort             text,
  objektart       text,
  wohnflaeche     numeric(10,2) check (wohnflaeche is null or wohnflaeche >= 0),
  grundstueck     numeric(10,2) check (grundstueck is null or grundstueck >= 0),
  baujahr         integer check (baujahr is null or baujahr between 1000 and 2200),
  zustand         text,
  verkaufszeitraum text,
  kontakt_id      uuid references public.kontakte(id) on delete set null,
  tippgeber_kontakt_id uuid references public.kontakte(id) on delete set null,
  objekt_id       uuid references public.objekte(id) on delete set null,
  wertermittlung_id uuid references public.wertermittlungen(id) on delete set null,
  aufnahme_id     uuid references public.objektaufnahmen(id) on delete set null,
  radar_id        uuid references public.akquise_radar(id) on delete set null,
  pipeline_id     uuid not null references public.akquise_pipelines(id) on delete restrict,
  stufe_id        uuid not null references public.akquise_stufen(id) on delete restrict,
  quelle_id       uuid references public.akquise_quellen(id) on delete set null,
  kampagne_id     uuid references public.akquise_kampagnen(id) on delete set null,
  zustaendig_id   uuid references public.benutzer(id) on delete set null,
  status          text not null default 'offen' check (status in ('offen', 'gewonnen', 'verloren')),
  verlustgrund    text,
  gewonnen_am     timestamptz,
  verloren_am     timestamptz,
  -- Preis-Finder: Indikation aus eigenen Vergleichswerten, Angebotspreis, Provision
  wert_indikation numeric(14,2) check (wert_indikation is null or wert_indikation >= 0),
  angebotspreis   numeric(14,2) check (angebotspreis is null or angebotspreis >= 0),
  provision_satz  numeric(5,2) check (provision_satz is null or provision_satz between 0 and 20),
  provision_erwartet numeric(12,2) check (provision_erwartet is null or provision_erwartet >= 0),
  nachfassen      boolean not null default true,
  nachfassen_am   date,
  notiz           text,
  email_eingang   jsonb,
  erstellt_von    uuid references public.benutzer(id) on delete set null,
  erstellt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now()
);
create index akquise_leads_mandant on public.akquise_leads (mandant_id, status, erstellt_am desc);
create index akquise_leads_pipeline on public.akquise_leads (pipeline_id, stufe_id);
create index akquise_leads_nachfassen on public.akquise_leads (mandant_id, nachfassen_am) where status = 'offen' and nachfassen;
create index akquise_leads_kontakt on public.akquise_leads (kontakt_id);
alter table public.akquise_radar add constraint akquise_radar_lead
  foreign key (lead_id) references public.akquise_leads(id) on delete set null;
create trigger akquise_leads_geaendert before update on public.akquise_leads
  for each row execute function intern.setze_geaendert_am();
alter table public.akquise_leads enable row level security;
create policy akquise_leads_lesen on public.akquise_leads
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_leads_schreiben on public.akquise_leads
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.akquise_lead_historie (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  lead_id     uuid not null references public.akquise_leads(id) on delete cascade,
  feld        text not null,
  alt         text,
  neu         text,
  benutzer_id uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now()
);
create index akquise_lead_historie_lead on public.akquise_lead_historie (lead_id, erstellt_am desc);
alter table public.akquise_lead_historie enable row level security;
create policy akquise_lead_historie_lesen on public.akquise_lead_historie
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_lead_historie_schreiben on public.akquise_lead_historie
  for insert with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.akquise_aktivitaeten (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  lead_id       uuid not null references public.akquise_leads(id) on delete cascade,
  typ           text not null check (typ in ('anruf', 'termin', 'aufgabe', 'mail', 'whatsapp', 'ki', 'notiz')),
  titel         text not null check (length(trim(titel)) between 1 and 300),
  betreff       text,
  text          text,
  faellig_am    timestamptz,
  erledigt_am   timestamptz,
  automation_id uuid references public.akquise_automationen(id) on delete set null,
  aufgabe_id    uuid references public.aufgaben(id) on delete set null,
  termin_id     uuid references public.termine(id) on delete set null,
  erstellt_von  uuid references public.benutzer(id) on delete set null,
  erstellt_am   timestamptz not null default now()
);
create index akquise_aktivitaeten_lead on public.akquise_aktivitaeten (lead_id, erstellt_am desc);
create index akquise_aktivitaeten_faellig on public.akquise_aktivitaeten (mandant_id, faellig_am) where erledigt_am is null;
alter table public.akquise_aktivitaeten enable row level security;
create policy akquise_aktivitaeten_lesen on public.akquise_aktivitaeten
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_aktivitaeten_schreiben on public.akquise_aktivitaeten
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.akquise_laeufe (
  id             uuid primary key default gen_random_uuid(),
  mandant_id     uuid not null references public.mandanten(id) on delete cascade,
  automation_id  uuid not null references public.akquise_automationen(id) on delete cascade,
  lead_id        uuid not null references public.akquise_leads(id) on delete cascade,
  geplant_am     timestamptz not null default now(),
  status         text not null default 'geplant' check (status in ('geplant', 'erledigt', 'abgebrochen', 'fehler')),
  fehler         text,
  aktivitaet_id  uuid references public.akquise_aktivitaeten(id) on delete set null,
  ausgefuehrt_am timestamptz,
  erstellt_am    timestamptz not null default now()
);
create index akquise_laeufe_faellig on public.akquise_laeufe (geplant_am) where status = 'geplant';
create index akquise_laeufe_lead on public.akquise_laeufe (lead_id);
create unique index akquise_laeufe_einmal on public.akquise_laeufe (automation_id, lead_id) where status = 'geplant';
alter table public.akquise_laeufe enable row level security;
create policy akquise_laeufe_lesen on public.akquise_laeufe
  for select using (mandant_id = intern.aktueller_mandant());
create policy akquise_laeufe_schreiben on public.akquise_laeufe
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Verweise pruefen (Mandantentrennung ueber Fremdschluessel) --------------------
create or replace function intern.akquise_verweise_pruefen()
returns trigger language plpgsql as $$
declare v_pipeline uuid;
begin
  if tg_table_name = 'akquise_stufen' then
    if not exists (select 1 from public.akquise_pipelines p where p.id = new.pipeline_id and p.mandant_id = new.mandant_id) then
      raise exception 'Die Pipeline gehoert nicht zu diesem Mandanten.';
    end if;
    return new;
  end if;
  if tg_table_name = 'akquise_quellen' then
    if new.kampagne_id is not null and not exists (select 1 from public.akquise_kampagnen k where k.id = new.kampagne_id and k.mandant_id = new.mandant_id) then
      raise exception 'Die Kampagne gehoert nicht zu diesem Mandanten.';
    end if;
    if new.pipeline_id is not null and not exists (select 1 from public.akquise_pipelines p where p.id = new.pipeline_id and p.mandant_id = new.mandant_id) then
      raise exception 'Die Pipeline gehoert nicht zu diesem Mandanten.';
    end if;
    return new;
  end if;
  if tg_table_name = 'akquise_automationen' then
    select pipeline_id into v_pipeline from public.akquise_stufen s where s.id = new.stufe_id and s.mandant_id = new.mandant_id;
    if v_pipeline is null or v_pipeline <> new.pipeline_id then
      raise exception 'Die Stufe gehoert nicht zu dieser Pipeline.';
    end if;
    if new.quelle_id is not null and not exists (select 1 from public.akquise_quellen q where q.id = new.quelle_id and q.mandant_id = new.mandant_id) then
      raise exception 'Die Quelle gehoert nicht zu diesem Mandanten.';
    end if;
    if new.vorlage_id is not null and not exists (select 1 from public.akquise_vorlagen v where v.id = new.vorlage_id and v.mandant_id = new.mandant_id) then
      raise exception 'Die Vorlage gehoert nicht zu diesem Mandanten.';
    end if;
    return new;
  end if;
  if tg_table_name in ('akquise_aktivitaeten', 'akquise_lead_historie', 'akquise_laeufe') then
    if not exists (select 1 from public.akquise_leads l where l.id = new.lead_id and l.mandant_id = new.mandant_id) then
      raise exception 'Der Lead gehoert nicht zu diesem Mandanten.';
    end if;
    return new;
  end if;
  -- akquise_leads
  select pipeline_id into v_pipeline from public.akquise_stufen s where s.id = new.stufe_id and s.mandant_id = new.mandant_id;
  if v_pipeline is null or v_pipeline <> new.pipeline_id then
    raise exception 'Die Stufe gehoert nicht zu dieser Pipeline.';
  end if;
  if new.kontakt_id is not null and not exists (select 1 from public.kontakte k where k.id = new.kontakt_id and k.mandant_id = new.mandant_id) then
    raise exception 'Der Kontakt gehoert nicht zu diesem Mandanten.';
  end if;
  if new.tippgeber_kontakt_id is not null and not exists (select 1 from public.kontakte k where k.id = new.tippgeber_kontakt_id and k.mandant_id = new.mandant_id) then
    raise exception 'Der Tippgeber gehoert nicht zu diesem Mandanten.';
  end if;
  if new.objekt_id is not null and not exists (select 1 from public.objekte o where o.id = new.objekt_id and o.mandant_id = new.mandant_id) then
    raise exception 'Das Objekt gehoert nicht zu diesem Mandanten.';
  end if;
  if new.quelle_id is not null and not exists (select 1 from public.akquise_quellen q where q.id = new.quelle_id and q.mandant_id = new.mandant_id) then
    raise exception 'Die Quelle gehoert nicht zu diesem Mandanten.';
  end if;
  if new.kampagne_id is not null and not exists (select 1 from public.akquise_kampagnen k where k.id = new.kampagne_id and k.mandant_id = new.mandant_id) then
    raise exception 'Die Kampagne gehoert nicht zu diesem Mandanten.';
  end if;
  if new.zustaendig_id is not null and not exists (select 1 from public.benutzer b where b.id = new.zustaendig_id and b.mandant_id = new.mandant_id) then
    raise exception 'Der zustaendige Benutzer gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;

create trigger akquise_stufen_verweise before insert or update on public.akquise_stufen
  for each row execute function intern.akquise_verweise_pruefen();
create trigger akquise_quellen_verweise before insert or update on public.akquise_quellen
  for each row execute function intern.akquise_verweise_pruefen();
create trigger akquise_automationen_verweise before insert or update on public.akquise_automationen
  for each row execute function intern.akquise_verweise_pruefen();
create trigger akquise_aktivitaeten_verweise before insert or update on public.akquise_aktivitaeten
  for each row execute function intern.akquise_verweise_pruefen();
create trigger akquise_lead_historie_verweise before insert on public.akquise_lead_historie
  for each row execute function intern.akquise_verweise_pruefen();
create trigger akquise_laeufe_verweise before insert or update on public.akquise_laeufe
  for each row execute function intern.akquise_verweise_pruefen();
create trigger akquise_leads_verweise before insert or update on public.akquise_leads
  for each row execute function intern.akquise_verweise_pruefen();

-- --- Lead: Status aus der Stufe, Verlustgrund Pflicht, Nachfasstermin -------------
create or replace function intern.akquise_lead_stufe()
returns trigger language plpgsql as $$
declare v_gewonnen boolean; v_verloren boolean; v_tage integer;
begin
  select ist_gewonnen, ist_verloren into v_gewonnen, v_verloren from public.akquise_stufen where id = new.stufe_id;
  if v_verloren then
    if coalesce(trim(new.verlustgrund), '') = '' then
      raise exception 'Fuer eine verlorene Stufe ist ein Verlustgrund Pflicht.';
    end if;
    new.status := 'verloren';
    new.verloren_am := coalesce(case when tg_op = 'UPDATE' and old.status = 'verloren' then old.verloren_am end, now());
    new.gewonnen_am := null;
    new.nachfassen_am := null;
  elsif v_gewonnen then
    new.status := 'gewonnen';
    new.gewonnen_am := coalesce(case when tg_op = 'UPDATE' and old.status = 'gewonnen' then old.gewonnen_am end, now());
    new.verloren_am := null;
    new.verlustgrund := null;
    new.nachfassen_am := null;
  else
    new.status := 'offen';
    new.gewonnen_am := null;
    new.verloren_am := null;
    new.verlustgrund := null;
    if new.nachfassen and (new.nachfassen_am is null or (tg_op = 'UPDATE' and old.stufe_id <> new.stufe_id and old.nachfassen_am is not distinct from new.nachfassen_am)) then
      select nachfassen_tage into v_tage from public.akquise_einstellungen where mandant_id = new.mandant_id;
      new.nachfassen_am := current_date + coalesce(v_tage, 7);
    end if;
  end if;
  return new;
end $$;
create trigger akquise_leads_stufe before insert or update of stufe_id, verlustgrund, nachfassen on public.akquise_leads
  for each row execute function intern.akquise_lead_stufe();

-- --- Historie und Automationen planen (nach Anlage oder Stufenwechsel) -----------
create or replace function intern.akquise_lead_nachlauf()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_alt text; v_neu text; a record;
begin
  if tg_op = 'UPDATE' and old.stufe_id = new.stufe_id and old.status = new.status and coalesce(old.zustaendig_id, '00000000-0000-0000-0000-000000000000') = coalesce(new.zustaendig_id, '00000000-0000-0000-0000-000000000000') then
    return new;
  end if;
  if tg_op = 'INSERT' or old.stufe_id <> new.stufe_id then
    select name into v_neu from public.akquise_stufen where id = new.stufe_id;
    if tg_op = 'UPDATE' then select name into v_alt from public.akquise_stufen where id = old.stufe_id; end if;
    insert into public.akquise_lead_historie (mandant_id, lead_id, feld, alt, neu, benutzer_id)
      values (new.mandant_id, new.id, case when tg_op = 'INSERT' then 'angelegt' else 'stufe' end, v_alt, v_neu, auth.uid());
    -- Laeufe der alten Stufe verfallen, passende Automationen der neuen Stufe werden geplant
    if tg_op = 'UPDATE' then
      update public.akquise_laeufe set status = 'abgebrochen', fehler = 'Stufe gewechselt'
       where lead_id = new.id and status = 'geplant';
    end if;
    for a in select * from public.akquise_automationen
              where mandant_id = new.mandant_id and aktiv and pipeline_id = new.pipeline_id and stufe_id = new.stufe_id
                and (quelle_id is null or quelle_id = new.quelle_id)
    loop
      insert into public.akquise_laeufe (mandant_id, automation_id, lead_id, geplant_am)
        values (new.mandant_id, a.id, new.id, now() + make_interval(hours => a.verzoegerung_stunden))
        on conflict do nothing;
    end loop;
  end if;
  if tg_op = 'UPDATE' and old.status <> new.status then
    insert into public.akquise_lead_historie (mandant_id, lead_id, feld, alt, neu, benutzer_id)
      values (new.mandant_id, new.id, 'status', old.status, new.status || coalesce(' (' || new.verlustgrund || ')', ''), auth.uid());
  end if;
  if tg_op = 'UPDATE' and coalesce(old.zustaendig_id, '00000000-0000-0000-0000-000000000000') <> coalesce(new.zustaendig_id, '00000000-0000-0000-0000-000000000000') then
    insert into public.akquise_lead_historie (mandant_id, lead_id, feld, alt, neu, benutzer_id)
      values (new.mandant_id, new.id, 'zustaendig',
        (select name from public.benutzer where id = old.zustaendig_id),
        (select name from public.benutzer where id = new.zustaendig_id), auth.uid());
  end if;
  return new;
end $$;
create trigger akquise_leads_nachlauf after insert or update on public.akquise_leads
  for each row execute function intern.akquise_lead_nachlauf();

-- --- Standard-Stammdaten je Mandant anlegen (beim ersten Aufruf) ------------------
create or replace function public.akquise_standard_anlegen()
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m uuid := intern.aktueller_mandant(); v_p uuid;
begin
  if v_m is null or not intern.darf_schreiben() then
    raise exception 'Nicht erlaubt.';
  end if;
  insert into public.akquise_einstellungen (mandant_id) values (v_m) on conflict do nothing;
  select id into v_p from public.akquise_pipelines where mandant_id = v_m order by ist_standard desc, sortierung limit 1;
  if v_p is not null then return v_p; end if;
  insert into public.akquise_pipelines (mandant_id, name, beschreibung, ist_standard, sortierung)
    values (v_m, 'Eigentümer-Akquise', 'Vom ersten Kontakt bis zum Maklervertrag', true, 1) returning id into v_p;
  insert into public.akquise_stufen (mandant_id, pipeline_id, name, zusatz, sortierung, wahrscheinlichkeit, ist_gewonnen, ist_verloren) values
    (v_m, v_p, 'Neuer Lead', 'Noch nicht kontaktiert', 1, 10, false, false),
    (v_m, v_p, 'Kontakt aufgenommen', 'Erstgespräch geführt', 2, 25, false, false),
    (v_m, v_p, 'Einwertung / Termin', 'Objektaufnahme oder Wertindikation', 3, 50, false, false),
    (v_m, v_p, 'Angebot', 'Maklervertrag vorgelegt', 4, 75, false, false),
    (v_m, v_p, 'Gewonnen', 'Maklervertrag unterschrieben', 5, 100, true, false),
    (v_m, v_p, 'Verloren', 'Mit Verlustgrund', 6, 0, false, true);
  insert into public.akquise_quellen (mandant_id, name, art, sortierung) values
    (v_m, 'Website / Wertermittlung', 'online', 1),
    (v_m, 'Empfehlung', 'netzwerk', 2),
    (v_m, 'Telefon / Laufkundschaft', 'offline', 3),
    (v_m, 'Privatinserat (Radar)', 'online', 4),
    (v_m, 'Tippgeber', 'tippgeber', 5),
    (v_m, 'E-Mail-Eingang', 'online', 6);
  insert into public.akquise_vorlagen (mandant_id, name, kanal, betreff, text) values
    (v_m, 'Eingangsbestätigung Eigentümer', 'mail', 'Ihre Anfrage zu {adresse}', E'{anrede},\n\nvielen Dank für Ihre Anfrage zu Ihrer Immobilie {adresse}. Wir melden uns innerhalb eines Werktags, um einen Termin für eine kostenlose Einwertung abzustimmen.\n\nMit freundlichen Grüßen\n{absender}\n{firma}'),
    (v_m, 'Nachfassen nach Einwertung', 'mail', 'Ihre Einwertung {adresse}', E'{anrede},\n\nhaben Sie unsere Einwertung für {adresse} erhalten? Gern besprechen wir die nächsten Schritte und die Vermarktungsstrategie in einem kurzen Gespräch.\n\nMit freundlichen Grüßen\n{absender}\n{firma}'),
    (v_m, 'Anruf: Erstkontakt', 'aufgabe', 'Erstkontakt {name}', 'Eigentümer anrufen, Verkaufsabsicht und Zeitraum klären, Termin zur Einwertung anbieten.'),
    (v_m, 'Aufgabe: Nachfassen', 'aufgabe', 'Nachfassen {name}', 'Nachfassen zum Stand des Verkaufsvorhabens; Einwertung und Angebot ansprechen.');
  return v_p;
end $$;
revoke all on function public.akquise_standard_anlegen() from public;
grant execute on function public.akquise_standard_anlegen() to authenticated, service_role;

-- --- Geplante Laeufe ausfuehren (Tagesjob / Arbeiter) -----------------------------
-- Mail und WhatsApp entstehen als Entwurf im Lead (Aktivitaet), Aufgaben als
-- echte Aufgabe des Zustaendigen. Der Versand bleibt beim Menschen (Postfach
-- oder E-Mail-Programm) — kein Roboter-Versand ohne Freigabe.
create or replace function public.akquise_laeufe_ausfuehren(p_max integer default 200)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; l record; v record; n integer := 0; v_betreff text; v_text text; v_akt uuid; v_aufgabe uuid;
  v_anrede text; v_name text; v_adresse text; v_absender text; v_firma text;
begin
  for r in select lf.*, a.kanal, a.vorlage_id, a.name as automation_name
             from public.akquise_laeufe lf join public.akquise_automationen a on a.id = lf.automation_id
            where lf.status = 'geplant' and lf.geplant_am <= now()
            order by lf.geplant_am limit greatest(1, least(p_max, 1000))
  loop
    begin
      select * into l from public.akquise_leads where id = r.lead_id;
      if l.id is null or l.status <> 'offen' then
        update public.akquise_laeufe set status = 'abgebrochen', fehler = 'Lead nicht mehr offen', ausgefuehrt_am = now() where id = r.id;
        continue;
      end if;
      select * into v from public.akquise_vorlagen where id = r.vorlage_id;
      select coalesce(nullif(concat_ws(' ', k.anrede, k.vorname, k.nachname), ''), k.firma, 'Eigentümer'),
             case when k.anrede = 'Frau' then 'Sehr geehrte Frau ' || coalesce(k.nachname, '') when k.anrede = 'Herr' then 'Sehr geehrter Herr ' || coalesce(k.nachname, '') else 'Guten Tag' end
        into v_name, v_anrede from public.kontakte k where k.id = l.kontakt_id;
      v_name := coalesce(v_name, 'Eigentümer'); v_anrede := coalesce(v_anrede, 'Guten Tag');
      v_adresse := coalesce(nullif(concat_ws(', ', nullif(concat_ws(' ', l.strasse, l.hausnummer), ''), nullif(concat_ws(' ', l.plz, l.ort), '')), ''), l.titel);
      select name into v_absender from public.benutzer where id = l.zustaendig_id;
      select coalesce(b.firmenname, m.name) into v_firma from public.mandanten m left join public.mandant_branding b on b.mandant_id = m.id where m.id = l.mandant_id;
      v_betreff := coalesce(v.betreff, r.automation_name, 'Akquise');
      v_text := coalesce(v.text, '');
      v_betreff := replace(replace(replace(replace(replace(replace(v_betreff, '{anrede}', v_anrede), '{name}', v_name), '{adresse}', v_adresse), '{titel}', l.titel), '{absender}', coalesce(v_absender, '')), '{firma}', coalesce(v_firma, ''));
      v_text := replace(replace(replace(replace(replace(replace(replace(v_text, '{anrede}', v_anrede), '{name}', v_name), '{adresse}', v_adresse), '{titel}', l.titel), '{absender}', coalesce(v_absender, '')), '{firma}', coalesce(v_firma, '')), '{objektart}', coalesce(l.objektart, 'Immobilie'));
      v_aufgabe := null;
      if r.kanal = 'aufgabe' then
        insert into public.aufgaben (mandant_id, titel, beschreibung, prioritaet, faellig_am, kontakt_id, objekt_id, zustaendig_id, erstellt_von)
          values (l.mandant_id, left(v_betreff, 300), v_text, 'mittel', current_date, l.kontakt_id, l.objekt_id, l.zustaendig_id, l.zustaendig_id)
          returning id into v_aufgabe;
      end if;
      insert into public.akquise_aktivitaeten (mandant_id, lead_id, typ, titel, betreff, text, faellig_am, automation_id, aufgabe_id, erstellt_von)
        values (l.mandant_id, l.id, r.kanal, left(coalesce(r.automation_name, v_betreff), 300), v_betreff, v_text, now(), r.automation_id, v_aufgabe, l.zustaendig_id)
        returning id into v_akt;
      update public.akquise_laeufe set status = 'erledigt', aktivitaet_id = v_akt, ausgefuehrt_am = now() where id = r.id;
      n := n + 1;
    exception when others then
      update public.akquise_laeufe set status = 'fehler', fehler = left(sqlerrm, 500), ausgefuehrt_am = now() where id = r.id;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.akquise_laeufe_ausfuehren(integer) from public;
grant execute on function public.akquise_laeufe_ausfuehren(integer) to service_role;
