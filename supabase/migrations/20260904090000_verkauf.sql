-- ===========================================================================
-- Verkauf (docs/FUNKTIONSABGLEICH.md, Pakete V1/V2): strukturierte Vertraege
-- mit Vollmacht und Objektnachweis, Uebergabeprotokolle als Assistent,
-- Notar-Laufzettel (Kaufabwicklung), Credits fuer Dokumentauslesung.
-- ===========================================================================

-- --- Vertragsarten erweitern ----------------------------------------------
-- Neue Werte duerfen in derselben Transaktion nicht verwendet werden; sie
-- werden hier nur angelegt.
alter type public.vertragsart add value if not exists 'vollmacht';
alter type public.vertragsart add value if not exists 'objektnachweis';
alter type public.vertragsart add value if not exists 'mietvertrag';

-- --- Vertraege: strukturierte Daten, Herkunft, Original --------------------
alter table public.vertraege
  add column if not exists daten jsonb not null default '{}'::jsonb,
  add column if not exists vollmacht_mitgenerieren boolean not null default false,
  add column if not exists original_pfad text,
  add column if not exists quelle text not null default 'manuell'
    check (quelle in ('manuell', 'vorlage', 'import'));

comment on column public.vertraege.daten is
  'Formulardaten der Vorlage (Verkaeufer, Provision, Laufzeit ...). Der unterzeichnete Text steht in inhalt.';
comment on column public.vertraege.original_pfad is
  'Pfad des hochgeladenen Originals (Bucket objektdokumente, Ordner <mandant>/vorgaenge/...).';

-- --- Uebergabeprotokolle ----------------------------------------------------
create table public.uebergabeprotokolle (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  objekt_id     uuid references public.objekte(id) on delete set null,
  vertrag_id    uuid references public.vertraege(id) on delete set null,
  kontext       text not null check (kontext in ('verkauf', 'vermietung')),
  typ           text not null check (typ in ('uebergabe', 'rueckgabe', 'einzug', 'auszug')),
  status        text not null default 'entwurf' check (status in ('entwurf', 'abgeschlossen')),
  bezeichnung   text not null check (length(trim(bezeichnung)) between 1 and 200),
  datum         date,
  uhrzeit       text check (uhrzeit is null or uhrzeit ~ '^[0-2][0-9]:[0-5][0-9]$'),
  -- Beteiligte: {name, strasse, plz, ort, anwesend}
  uebergeber    jsonb not null default '{}'::jsonb,
  uebernehmer   jsonb not null default '{}'::jsonb,
  -- Objektangaben zum Zeitpunkt der Uebergabe (Adresse, Etage, Lage)
  objekt        jsonb not null default '{}'::jsonb,
  -- Listen: [{art, anzahl, bemerkung}], [{art, nummer, stand, einheit, foto_pfad, ki_gelesen}], [{name, zustand, maengel, foto_pfade[]}]
  schluessel    jsonb not null default '[]'::jsonb,
  zaehler       jsonb not null default '[]'::jsonb,
  raeume        jsonb not null default '[]'::jsonb,
  -- Rauchmelder, Schimmel, Hausordnung, Anleitungen, Sonderabreden
  sonstiges     jsonb not null default '{}'::jsonb,
  -- {uebergeber: {name, bild, zeit}, uebernehmer: {...}} — Bild als Data-URL (PNG)
  unterschriften jsonb not null default '{}'::jsonb,
  pdf_pfad      text,
  abgeschlossen_am timestamptz,
  erstellt_von  uuid references public.benutzer(id) on delete set null,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  constraint uebergabe_typ_passt check (
    (kontext = 'verkauf' and typ in ('uebergabe', 'rueckgabe'))
    or (kontext = 'vermietung' and typ in ('einzug', 'auszug'))
  )
);

create index uebergabeprotokolle_mandant on public.uebergabeprotokolle (mandant_id, erstellt_am desc);
create index uebergabeprotokolle_objekt on public.uebergabeprotokolle (objekt_id);

create trigger uebergabeprotokolle_geaendert before update on public.uebergabeprotokolle
  for each row execute function intern.setze_geaendert_am();

-- Ein abgeschlossenes Protokoll traegt Unterschriften; danach werden Inhalte nicht mehr geaendert.
create or replace function intern.uebergabe_schuetzen()
returns trigger language plpgsql as $$
begin
  if old.status = 'abgeschlossen' and new.status = 'abgeschlossen'
     and (new.schluessel, new.zaehler, new.raeume, new.sonstiges, new.uebergeber, new.uebernehmer, new.unterschriften)
         is distinct from (old.schluessel, old.zaehler, old.raeume, old.sonstiges, old.uebergeber, old.uebernehmer, old.unterschriften) then
    raise exception 'Ein abgeschlossenes Uebergabeprotokoll kann nicht mehr geaendert werden.';
  end if;
  return new;
end $$;
create trigger uebergabeprotokolle_schuetzen before update on public.uebergabeprotokolle
  for each row execute function intern.uebergabe_schuetzen();

alter table public.uebergabeprotokolle enable row level security;
create policy uebergabeprotokolle_lesen on public.uebergabeprotokolle
  for select using (mandant_id = intern.aktueller_mandant());
create policy uebergabeprotokolle_schreiben on public.uebergabeprotokolle
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Notar-Laufzettel (Kaufabwicklung) ---------------------------------------
create table public.notar_laufzettel (
  id               uuid primary key default gen_random_uuid(),
  mandant_id       uuid not null references public.mandanten(id) on delete cascade,
  objekt_id        uuid references public.objekte(id) on delete set null,
  vertrag_id       uuid references public.vertraege(id) on delete set null,
  objektnachweis_id uuid references public.vertraege(id) on delete set null,
  bezeichnung      text not null check (length(trim(bezeichnung)) between 1 and 200),
  status           text not null default 'entwurf'
    check (status in ('entwurf', 'bereit', 'versendet', 'abgeschlossen')),
  -- Acht Schritte als ein Dokument: immobilie, verkaeufer[], kaeufer[], kaufpreis, sonstiges, beauftragung
  daten            jsonb not null default '{}'::jsonb,
  -- [{id, name, pfad, mime, bytes, kategorie, ki_auswertung, hochgeladen_am}]
  anhaenge         jsonb not null default '[]'::jsonb,
  versendet_am     timestamptz,
  abgeschlossen_am timestamptz,
  erstellt_von     uuid references public.benutzer(id) on delete set null,
  erstellt_am      timestamptz not null default now(),
  geaendert_am     timestamptz not null default now()
);

create index notar_laufzettel_mandant on public.notar_laufzettel (mandant_id, erstellt_am desc);
create index notar_laufzettel_objekt on public.notar_laufzettel (objekt_id);

create trigger notar_laufzettel_geaendert before update on public.notar_laufzettel
  for each row execute function intern.setze_geaendert_am();

alter table public.notar_laufzettel enable row level security;
create policy notar_laufzettel_lesen on public.notar_laufzettel
  for select using (mandant_id = intern.aktueller_mandant());
create policy notar_laufzettel_schreiben on public.notar_laufzettel
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- Verweise bleiben mandantenrein (wie in 20260817162948).
create or replace function intern.verkauf_verweise_pruefen()
returns trigger language plpgsql as $$
begin
  if new.objekt_id is not null and not exists (
    select 1 from public.objekte o where o.id = new.objekt_id and o.mandant_id = new.mandant_id) then
    raise exception 'Das Objekt gehoert nicht zu diesem Mandanten.';
  end if;
  if new.vertrag_id is not null and not exists (
    select 1 from public.vertraege v where v.id = new.vertrag_id and v.mandant_id = new.mandant_id) then
    raise exception 'Der Vertrag gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;
create trigger uebergabeprotokolle_verweise before insert or update on public.uebergabeprotokolle
  for each row execute function intern.verkauf_verweise_pruefen();
create trigger notar_laufzettel_verweise before insert or update on public.notar_laufzettel
  for each row execute function intern.verkauf_verweise_pruefen();

-- --- Credits fuer Auslesungen -----------------------------------------------
insert into public.credit_preise (aktion, bezeichnung, credits) values
  ('ki_dokument_import', 'Vertrag oder Dokument per KI auslesen (Import)', 5),
  ('ki_bild_auslesen',   'Zaehlerstand oder Beleg aus einem Foto auslesen', 1)
on conflict (aktion) do nothing;

-- --- Verlauf: Aktivitaetstypen fuer die neuen Vorgaenge --------------------
-- (Verlaufseintraege schreiben die Server-Aktionen ueber die bestehende
-- Funktion; keine Schemaaenderung noetig.)
