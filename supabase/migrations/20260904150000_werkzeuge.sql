-- ===========================================================================
-- Werkzeuge (docs/FUNKTIONSABGLEICH.md W1, Referenz-Kacheln „Werkzeuge" und
-- „Bild-Editor"): Wohnflaechenberechnungen nach WoFlV, Grundrisse (Editor,
-- Aufbereiter, Raumscan-Import), Infrastruktur-Entfernungen am Objekt,
-- Energieausweis-Auslesung (Credits), Bildversionen aus dem Bild-Editor.
-- ===========================================================================

-- --- Wohnflaechenberechnungen --------------------------------------------------------
create table public.wohnflaechen_berechnungen (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  objekt_id     uuid references public.objekte(id) on delete cascade,
  bezeichnung   text not null default 'Wohnflächenberechnung' check (length(trim(bezeichnung)) between 1 and 200),
  -- Geschosse → Raeume → Teilflaechen (src/lib/werkzeuge/wohnflaeche.ts)
  blatt         jsonb not null default '{}'::jsonb,
  wohnflaeche   numeric(10,2) not null default 0,
  grundflaeche  numeric(10,2) not null default 0,
  uebernommen_am timestamptz,
  erstellt_von  uuid references public.benutzer(id) on delete set null,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);
create index wohnflaechen_objekt_idx on public.wohnflaechen_berechnungen (objekt_id);
create index wohnflaechen_mandant_idx on public.wohnflaechen_berechnungen (mandant_id, erstellt_am desc);
create trigger wohnflaechen_geaendert before update on public.wohnflaechen_berechnungen
  for each row execute function intern.setze_geaendert_am();
alter table public.wohnflaechen_berechnungen enable row level security;
create policy wohnflaechen_lesen on public.wohnflaechen_berechnungen
  for select using (mandant_id = intern.aktueller_mandant());
create policy wohnflaechen_schreiben on public.wohnflaechen_berechnungen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Grundrisse ------------------------------------------------------------------------
create table public.grundrisse (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  objekt_id     uuid references public.objekte(id) on delete cascade,
  bezeichnung   text not null default 'Grundriss' check (length(trim(bezeichnung)) between 1 and 200),
  quelle        text not null default 'editor' check (quelle in ('editor', 'scan', 'aufbereitet')),
  -- Waende, Tueren, Fenster, Raeume, Moebel, Masse in Zentimetern (src/lib/werkzeuge/grundriss.ts)
  daten         jsonb not null default '{}'::jsonb,
  -- Hinterlegter Plan (Aufbereiter): Pfad im Unterlagen-Bucket
  vorlage_pfad  text,
  bild_id       uuid references public.objekt_bilder(id) on delete set null,
  erstellt_von  uuid references public.benutzer(id) on delete set null,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);
create index grundrisse_objekt_idx on public.grundrisse (objekt_id);
create index grundrisse_mandant_idx on public.grundrisse (mandant_id, erstellt_am desc);
create trigger grundrisse_geaendert before update on public.grundrisse
  for each row execute function intern.setze_geaendert_am();
alter table public.grundrisse enable row level security;
create policy grundrisse_lesen on public.grundrisse
  for select using (mandant_id = intern.aktueller_mandant());
create policy grundrisse_schreiben on public.grundrisse
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- Verweise mandantenrein
create or replace function intern.werkzeug_verweise_pruefen()
returns trigger language plpgsql as $$
begin
  if new.objekt_id is not null and not exists (select 1 from public.objekte o where o.id = new.objekt_id and o.mandant_id = new.mandant_id) then
    raise exception 'Das Objekt gehoert nicht zu diesem Mandanten.';
  end if;
  -- Spalte gibt es nur bei grundrisse — deshalb ueber JSON lesen statt new.bild_id
  if tg_table_name = 'grundrisse' and (to_jsonb(new)->>'bild_id') is not null
     and not exists (select 1 from public.objekt_bilder b where b.id = (to_jsonb(new)->>'bild_id')::uuid and b.mandant_id = new.mandant_id) then
    raise exception 'Das Bild gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;
create trigger wohnflaechen_verweise before insert or update on public.wohnflaechen_berechnungen
  for each row execute function intern.werkzeug_verweise_pruefen();
create trigger grundrisse_verweise before insert or update on public.grundrisse
  for each row execute function intern.werkzeug_verweise_pruefen();

-- --- Infrastruktur am Objekt (Entfernungen zu Schulen, Einkauf, Verkehr …) ----------------
alter table public.objekte
  add column infrastruktur     jsonb,
  add column infrastruktur_am  timestamptz;
comment on column public.objekte.infrastruktur is 'Naechste Einrichtungen je Kategorie mit Entfernung (OpenStreetMap), src/lib/werkzeuge/infrastruktur.ts';

-- --- Credits: Energieausweis auslesen, Bild-Editor-KI ----------------------------------
insert into public.credit_preise (aktion, bezeichnung, credits) values
  ('ki_energieausweis', 'Energieausweis auslesen (PDF oder Foto)', 2),
  ('ki_bild_himmel', 'Bild-Editor: Himmel ersetzen (KI)', 3),
  ('ki_bild_retusche', 'Bild-Editor: Objekt entfernen / Retusche (KI)', 3)
on conflict (aktion) do nothing;
