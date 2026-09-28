-- ===========================================================================
-- Fork-eigene Migration 12 — eigene Vertragsvorlagen je Mandant
--
-- Angefordert am 28.09.2026: "jeder makler soll auch seine eignen vorlagen
-- fuer maklervertraege/vollmachten/objektnachweise/reservierung einfuegen
-- koennen."
--
-- AUSGANGSLAGE: Die Vorlage fuehrte zwei Word-Dateien als Base64 im Quelltext
-- (VORLAGE_MAKLERVERTRAG, VORLAGE_OBJEKTNACHWEIS). Beide sind im Fork geleert,
-- weil sie Briefkopf und Vertragstext der Referenz trugen und
-- docs/NEUTRALITAET.md Abschnitt 5 Rechtstexte der Referenz ersetzen statt
-- uebernehmen laesst. Seitdem entsteht gar kein Maklervertrag mehr. Diese
-- Migration ist die Antwort darauf: die Vorlage kommt nicht mehr aus dem
-- Quelltext, sondern vom Mandanten.
--
-- GESELLSCHAFT OPTIONAL: Ein Mandant mit mehreren Gesellschaften kann je
-- Gesellschaft eine eigene Vorlage hinterlegen. Ohne Angabe gilt sie fuer den
-- ganzen Mandanten. Gesucht wird von innen nach aussen: erst die der
-- Gesellschaft, sonst die des Mandanten.
--
-- VERSIONEN: Eine neue Vorlage ersetzt die alte nicht, sie ueberholt sie.
-- Wer wissen muss, mit welchem Text ein Vertrag von vor einem Jahr entstanden
-- ist, findet die Datei noch.
-- ===========================================================================

create table if not exists public.vertragsvorlagen (
  id              uuid primary key default gen_random_uuid(),
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  gesellschaft_id uuid references public.gesellschaften(id) on delete set null,
  art             text not null,
  bezeichnung     text,
  storage_pfad    text not null,
  dateiname       text,
  version         integer not null default 1,
  aktiv           boolean not null default true,
  hochgeladen_von uuid references public.profiles(id) on delete set null,
  erstellt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now(),
  constraint vertragsvorlagen_art_check
    check (art in ('maklervertrag', 'vollmacht', 'objektnachweis', 'reservierung'))
);

create index if not exists vertragsvorlagen_mandant_id_idx
  on public.vertragsvorlagen (mandant_id);
create index if not exists vertragsvorlagen_suche_idx
  on public.vertragsvorlagen (mandant_id, art, aktiv, version desc);

comment on table public.vertragsvorlagen is
  'Eigene Word-Vorlagen je Mandant fuer Maklervertrag, Vollmacht, '
  'Objektnachweis und Reservierung. Die Datei liegt im Eimer '
  'vertragsvorlagen; storage_pfad ist der mandantenrelative Pfad, den '
  'Speicher-Huelle und Richtlinie um die Mandantenkennung ergaenzen.';
comment on column public.vertragsvorlagen.gesellschaft_id is
  'Leer = gilt fuer den ganzen Mandanten. Gesetzt = gilt nur fuer diese '
  'Gesellschaft und sticht die des Mandanten.';
comment on column public.vertragsvorlagen.version is
  'Zaehlt je Art hoch. Die hoechste aktive Version wird verwendet; aeltere '
  'bleiben liegen, damit nachvollziehbar ist, mit welchem Text ein alter '
  'Vertrag entstanden ist.';

-- Mandantentrennung wie bei jeder fachlichen Tabelle: DEFAULT plus
-- restriktive Richtlinie, gleiche Bauart wie fork_07.
alter table public.vertragsvorlagen
  alter column mandant_id set default public.aktuelle_mandant_id();

alter table public.vertragsvorlagen enable row level security;

drop policy if exists "vertragsvorlagen_lesen" on public.vertragsvorlagen;
create policy "vertragsvorlagen_lesen" on public.vertragsvorlagen
  for select to authenticated using (true);

-- Aendern darf nur, wer die Firmendaten pflegen darf. Das ist das Modul
-- "admin" der Rechte-Matrix — dieselbe Regel, die auch die Standorte schuetzt.
drop policy if exists "vertragsvorlagen_pflegen" on public.vertragsvorlagen;
create policy "vertragsvorlagen_pflegen" on public.vertragsvorlagen
  for all to authenticated
  using (public.hat_recht('admin')) with check (public.hat_recht('admin'));

drop policy if exists "mandant_trennung" on public.vertragsvorlagen;
create policy "mandant_trennung" on public.vertragsvorlagen
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('vertragsvorlagen', 'MANDANT',
        'Eigene Vertragsvorlagen des Mandanten')
on conflict (tabelle) do nothing;

-- Der Eimer. Nicht oeffentlich: eine Vertragsvorlage ist ein Geschaeftsdokument.
insert into storage.buckets (id, name, public)
values ('vertragsvorlagen', 'vertragsvorlagen', false)
on conflict (id) do nothing;

-- Lesen darf jeder Angemeldete des Mandanten — die Vertragserzeugung braucht
-- die Datei. Schreiben nur mit dem Modul "admin". Die Mandantengrenze zieht
-- die restriktive Richtlinie aus fork_09, ueber das erste Pfadsegment.
drop policy if exists "vertragsvorlagen_datei_lesen" on storage.objects;
create policy "vertragsvorlagen_datei_lesen" on storage.objects
  for select to authenticated using (bucket_id = 'vertragsvorlagen');

drop policy if exists "vertragsvorlagen_datei_pflegen" on storage.objects;
create policy "vertragsvorlagen_datei_pflegen" on storage.objects
  for all to authenticated
  using (bucket_id = 'vertragsvorlagen' and public.hat_recht('admin'))
  with check (bucket_id = 'vertragsvorlagen' and public.hat_recht('admin'));
