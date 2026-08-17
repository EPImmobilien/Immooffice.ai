-- Objektbilder mit Versionierung (Abschnitt 7 und 11).
--
-- Zwei Regeln aus Abschnitt 11 sind hier baulich verankert, nicht nur in der
-- Oberflaeche:
--   1. Das Original bleibt unveraendert. Eine Bearbeitung erzeugt einen neuen
--      Datensatz, der auf das Original zeigt — sie ueberschreibt es nie.
--   2. Eine KI-Bearbeitung ist dauerhaft gekennzeichnet. Das Kennzeichen haengt
--      am Datensatz und wandert dadurch in Export, PDF und Web-Expose mit.

create type public.bildart as enum (
  'foto','grundriss','lageplan','energieausweis','sonstiges'
);

create table public.objekt_bilder (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,
  objekt_id uuid not null references public.objekte(id) on delete cascade,

  -- Pfad im Bucket 'objektbilder'. Erstes Segment ist immer die Mandanten-ID;
  -- darauf stuetzen sich die Storage-Policies.
  pfad text not null unique,
  art public.bildart not null default 'foto',
  titel text,
  reihenfolge integer not null default 0,
  ist_titelbild boolean not null default false,

  breite integer,
  hoehe integer,
  bytes integer,
  mime text,

  -- Versionierung: zeigt auf das unveraenderte Original.
  original_id uuid references public.objekt_bilder(id) on delete cascade,
  bearbeitung text,
  ki_bearbeitet boolean not null default false,

  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  -- Eine Bearbeitung ohne Beschreibung waere spaeter nicht mehr nachvollziehbar.
  constraint bild_bearbeitung_beschrieben
    check (original_id is null or bearbeitung is not null)
);

create index objekt_bilder_objekt_idx
  on public.objekt_bilder(objekt_id, reihenfolge);
create index objekt_bilder_mandant_idx on public.objekt_bilder(mandant_id);
create index objekt_bilder_original_idx on public.objekt_bilder(original_id);

-- Hoechstens ein Titelbild je Objekt.
create unique index objekt_bilder_titelbild_idx
  on public.objekt_bilder(objekt_id) where ist_titelbild;

comment on table public.objekt_bilder is
  'Objektbilder. Bearbeitungen sind eigene Datensaetze mit Verweis auf das Original (Abschnitt 11).';

create trigger objekt_bilder_geaendert before update on public.objekt_bilder
  for each row execute function intern.setze_geaendert_am();

-- Das Original bleibt unveraendert: Pfad und KI-Kennzeichen eines Originals
-- lassen sich nachtraeglich nicht mehr aendern. Ohne diese Sperre liesse sich
-- die Kennzeichnung aus Abschnitt 11 durch ein einfaches Update entfernen.
create or replace function intern.bild_original_schuetzen()
returns trigger language plpgsql
as $$
begin
  if new.pfad <> old.pfad then
    raise exception 'Der Bildpfad ist unveraenderlich. Eine Bearbeitung wird als neue Version angelegt.';
  end if;
  if old.ki_bearbeitet and not new.ki_bearbeitet then
    raise exception 'Die Kennzeichnung einer KI-Bearbeitung kann nicht entfernt werden.';
  end if;
  return new;
end; $$;

create trigger objekt_bilder_original_schuetzen
  before update on public.objekt_bilder
  for each row execute function intern.bild_original_schuetzen();

alter table public.objekt_bilder enable row level security;

create policy objekt_bilder_lesen on public.objekt_bilder
  for select using (mandant_id = intern.aktueller_mandant());
create policy objekt_bilder_schreiben on public.objekt_bilder
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- Nicht oeffentlich: Objektbilder werden ueber signierte URLs ausgeliefert.
-- Ein oeffentlicher Bucket wuerde jedes Bild jedes Mandanten fuer jeden
-- erratbaren Pfad zugaenglich machen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('objektbilder', 'objektbilder', false, 20971520,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Der Mandant ist das erste Pfadsegment. Damit greift die Trennung auch dann,
-- wenn ein Pfad erraten wird.
create policy objektbilder_lesen on storage.objects
  for select to authenticated
  using (
    bucket_id = 'objektbilder'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
  );

create policy objektbilder_anlegen on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'objektbilder'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.darf_schreiben()
  );

create policy objektbilder_aendern on storage.objects
  for update to authenticated
  using (
    bucket_id = 'objektbilder'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.darf_schreiben()
  );

create policy objektbilder_loeschen on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'objektbilder'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.darf_schreiben()
  );
