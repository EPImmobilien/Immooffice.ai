-- Arbeitsmittel am Objekt: Dokumente, Verlauf, Aufgaben, Termine.
--
-- Bis hierher war das Objekt eine Karteikarte: Angaben, Bilder, Exposé. Was im
-- Alltag daran haengt, fehlte — die Unterlagen, die Frage „wer hat wann was
-- gemacht" und alles, was als naechstes zu tun ist.
--
-- Zwei der sechs Architektur-Grundprinzipien werden hier baulich verankert:
--
--   Objekt als Drehkreuz. Dokumente, Verlaufseintraege, Aufgaben und Termine
--   haengen am Objekt (und wahlweise zusaetzlich an einem Kontakt), nicht in
--   eigenen, unverbundenen Listen.
--
--   Verkettete Arbeitsschritte. Der Verlauf entsteht zum Teil von selbst:
--   Datenbank-Trigger schreiben ihn beim Anlegen eines Objekts und beim
--   Hinzufuegen von Dokumenten und Bildern. Nicht in der Anwendungsschicht,
--   weil dort jeder neue Codepfad das Protokollieren vergessen kann.

-- ---------------------------------------------------------------------------
-- 1. Dokumente am Objekt
-- ---------------------------------------------------------------------------

create type public.dokumentart as enum (
  'grundriss',
  'energieausweis',
  'grundbuchauszug',
  'flurkarte',
  'teilungserklaerung',
  'wohnflaechenberechnung',
  'baubeschreibung',
  'protokoll',
  'nebenkostenabrechnung',
  'mietvertrag',
  'kaufvertrag',
  'maklervertrag',
  'reservierungsvereinbarung',
  'vollmacht',
  'expose',
  'sonstiges'
);

comment on type public.dokumentart is
  'Unterlagenarten am Objekt. Bewusst fachlich benannt statt „Datei 1..n" — die Art steuert die Sortierung und die Vollstaendigkeitspruefung.';

-- Sichtbarkeit ist kein Komfort, sondern Schutz. Ein Grundbuchauszug, eine
-- Vollmacht oder ein Maklervertrag darf niemals in einem oeffentlichen
-- Web-Exposé auftauchen. Deshalb ist 'intern' die Vorbelegung, und die
-- Freigabe an Kunden ist die ausdrueckliche Ausnahme.
create type public.dokumentsichtbarkeit as enum ('intern', 'kunde');

create table public.objekt_dokumente (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,
  objekt_id uuid not null references public.objekte(id) on delete cascade,

  -- Pfad im Bucket 'objektdokumente'. Erstes Segment ist immer die
  -- Mandanten-ID; darauf stuetzen sich die Storage-Policies.
  pfad text not null unique,
  dateiname text not null check (length(trim(dateiname)) between 1 and 300),
  art public.dokumentart not null default 'sonstiges',
  titel text,
  notiz text,

  sichtbarkeit public.dokumentsichtbarkeit not null default 'intern',

  bytes integer,
  mime text,

  -- Fuer Unterlagen mit Frist: Ein Energieausweis ist zehn Jahre gueltig, und
  -- ein abgelaufener im Exposé ist ein Ordnungswidrigkeitsrisiko.
  gueltig_bis date,

  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create index objekt_dokumente_objekt_idx
  on public.objekt_dokumente(objekt_id, art);
create index objekt_dokumente_mandant_idx on public.objekt_dokumente(mandant_id);

comment on table public.objekt_dokumente is
  'Unterlagen am Objekt. Sichtbarkeit steuert, was ein oeffentliches Web-Exposé zeigen darf.';
comment on column public.objekt_dokumente.sichtbarkeit is
  'intern = nur im Unternehmen; kunde = darf an Interessenten herausgegeben werden.';

create trigger objekt_dokumente_geaendert before update on public.objekt_dokumente
  for each row execute function intern.setze_geaendert_am();

-- Der Pfad ist unveraenderlich. Ein Update darauf wuerde den Datensatz von der
-- Datei entkoppeln, ohne dass es auffaellt.
create or replace function intern.dokument_pfad_schuetzen()
returns trigger language plpgsql
as $$
begin
  if new.pfad <> old.pfad then
    raise exception 'Der Dokumentpfad ist unveraenderlich. Bitte neu hochladen.';
  end if;
  return new;
end; $$;

alter function intern.dokument_pfad_schuetzen() set search_path = public, pg_temp;

create trigger objekt_dokumente_pfad_schuetzen
  before update on public.objekt_dokumente
  for each row execute function intern.dokument_pfad_schuetzen();

alter table public.objekt_dokumente enable row level security;

create policy objekt_dokumente_lesen on public.objekt_dokumente
  for select using (mandant_id = intern.aktueller_mandant());
create policy objekt_dokumente_schreiben on public.objekt_dokumente
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- Nicht oeffentlich. Unterlagen sind heikler als Bilder: Ein oeffentlicher
-- Bucket wuerde Grundbuchauszuege ueber erratbare Pfade zugaenglich machen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('objektdokumente', 'objektdokumente', false, 52428800,
        array[
          'application/pdf',
          'image/jpeg','image/png','image/webp',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ])
on conflict (id) do nothing;

create policy objektdokumente_lesen on storage.objects
  for select to authenticated
  using (
    bucket_id = 'objektdokumente'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
  );

create policy objektdokumente_anlegen on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'objektdokumente'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.darf_schreiben()
  );

create policy objektdokumente_aendern on storage.objects
  for update to authenticated
  using (
    bucket_id = 'objektdokumente'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.darf_schreiben()
  );

create policy objektdokumente_loeschen on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'objektdokumente'
    and (storage.foldername(name))[1] = intern.aktueller_mandant()::text
    and intern.darf_schreiben()
  );

-- ---------------------------------------------------------------------------
-- 2. Verlauf
-- ---------------------------------------------------------------------------

create type public.aktivitaetstyp as enum (
  'objekt_angelegt',
  'objekt_geaendert',
  'status_geaendert',
  'dokument_hinzugefuegt',
  'bild_hinzugefuegt',
  'expose_erzeugt',
  'web_expose_veroeffentlicht',
  'web_expose_widerrufen',
  'portal_uebertragen',
  'kontakt_verknuepft',
  'notiz',
  'anruf',
  'email',
  'besichtigung',
  'angebot',
  'sonstiges'
);

create table public.aktivitaeten (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,

  -- Mindestens einer der beiden Bezuege muss gesetzt sein: Ein Eintrag ohne
  -- Bezug waere ein Protokoll ohne Gegenstand.
  objekt_id uuid references public.objekte(id) on delete cascade,
  kontakt_id uuid references public.kontakte(id) on delete cascade,

  typ public.aktivitaetstyp not null,
  beschreibung text not null check (length(trim(beschreibung)) between 1 and 2000),
  -- Strukturierte Zusatzangaben, etwa geaenderte Felder oder die verwendete
  -- Vorlage. Bewusst frei, damit ein neuer Eintragstyp keine Migration braucht.
  metadaten jsonb not null default '{}'::jsonb,

  benutzer_id uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),

  constraint aktivitaet_hat_bezug
    check (objekt_id is not null or kontakt_id is not null)
);

create index aktivitaeten_objekt_idx
  on public.aktivitaeten(objekt_id, erstellt_am desc);
create index aktivitaeten_kontakt_idx
  on public.aktivitaeten(kontakt_id, erstellt_am desc);
create index aktivitaeten_mandant_idx
  on public.aktivitaeten(mandant_id, erstellt_am desc);

comment on table public.aktivitaeten is
  'Verlauf zu Objekten und Kontakten. Nachtraeglich nicht aenderbar: es gibt bewusst keine UPDATE- und keine DELETE-Policy.';

alter table public.aktivitaeten enable row level security;

-- Lesen und Anlegen, aber KEIN Aendern und KEIN Loeschen.
--
-- Das ist der Kern dieser Tabelle. Ein Verlauf, den man nachtraeglich glaetten
-- kann, ist als Nachweis wertlos — etwa bei der Frage, wann ein Interessent
-- welche Unterlage erhalten hat. Fehlende Policies bedeuten unter
-- Row-Level-Security: verboten. Es gibt also nichts zu umgehen.
create policy aktivitaeten_lesen on public.aktivitaeten
  for select using (mandant_id = intern.aktueller_mandant());
create policy aktivitaeten_anlegen on public.aktivitaeten
  for insert with check (
    mandant_id = intern.aktueller_mandant() and intern.darf_schreiben()
  );

-- Der Verlauf soll auch dann entstehen, wenn er von einem Trigger geschrieben
-- wird. `security definer` umgeht dabei die Policies der Tabelle — die
-- Mandantenzuordnung kommt aber NICHT aus einem Parameter, sondern aus dem
-- Datensatz, der den Trigger ausgeloest hat und selbst schon durch RLS
-- gelaufen ist.
create or replace function intern.verlauf_schreiben(
  p_mandant uuid,
  p_objekt uuid,
  p_kontakt uuid,
  p_typ public.aktivitaetstyp,
  p_beschreibung text,
  p_metadaten jsonb default '{}'::jsonb
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.aktivitaeten
    (mandant_id, objekt_id, kontakt_id, typ, beschreibung, metadaten, benutzer_id)
  values
    (p_mandant, p_objekt, p_kontakt, p_typ, p_beschreibung, p_metadaten, auth.uid())
  returning id
$$;

-- Lehre aus dem Befund zu `credits_gutschreiben`: Postgres vergibt EXECUTE auf
-- neue Funktionen an PUBLIC, und die PostgREST-Rolle `anon` erbt das. Diese
-- Funktion nimmt eine Mandanten-ID als Parameter und laeuft mit erhoehten
-- Rechten — sie darf ausschliesslich fuer Trigger erreichbar sein.
revoke all on function intern.verlauf_schreiben(uuid, uuid, uuid, public.aktivitaetstyp, text, jsonb) from public;

-- --- Automatische Eintraege ------------------------------------------------

create or replace function intern.verlauf_objekt_angelegt()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform intern.verlauf_schreiben(
    new.mandant_id, new.id, null, 'objekt_angelegt',
    'Objekt ' || new.objektnummer || ' angelegt: ' || new.bezeichnung
  );
  return new;
end; $$;

revoke all on function intern.verlauf_objekt_angelegt() from public;

create trigger objekte_verlauf_angelegt after insert on public.objekte
  for each row execute function intern.verlauf_objekt_angelegt();

-- Statuswechsel getrennt festhalten: „von reserviert auf verkauft" ist die
-- Angabe, die spaeter tatsaechlich gebraucht wird — nicht „irgendetwas wurde
-- geaendert".
create or replace function intern.verlauf_objekt_status()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    perform intern.verlauf_schreiben(
      new.mandant_id, new.id, null, 'status_geaendert',
      'Status geändert: ' || old.status::text || ' → ' || new.status::text,
      jsonb_build_object('vorher', old.status, 'nachher', new.status)
    );
  end if;

  -- Loeschen ist bei uns ein Setzen von geloescht_am. Ohne Eintrag verschwaende
  -- ein Objekt lautlos aus jeder Liste.
  if new.geloescht_am is not null and old.geloescht_am is null then
    perform intern.verlauf_schreiben(
      new.mandant_id, new.id, null, 'objekt_geaendert',
      'Objekt in den Papierkorb gelegt'
    );
  end if;

  return new;
end; $$;

revoke all on function intern.verlauf_objekt_status() from public;

create trigger objekte_verlauf_status after update on public.objekte
  for each row execute function intern.verlauf_objekt_status();

create or replace function intern.verlauf_dokument()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform intern.verlauf_schreiben(
    new.mandant_id, new.objekt_id, null, 'dokument_hinzugefuegt',
    'Unterlage hinzugefügt: ' || coalesce(new.titel, new.dateiname),
    jsonb_build_object('art', new.art, 'sichtbarkeit', new.sichtbarkeit)
  );
  return new;
end; $$;

revoke all on function intern.verlauf_dokument() from public;

create trigger objekt_dokumente_verlauf after insert on public.objekt_dokumente
  for each row execute function intern.verlauf_dokument();

create or replace function intern.verlauf_bild()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform intern.verlauf_schreiben(
    new.mandant_id, new.objekt_id, null, 'bild_hinzugefuegt',
    case
      when new.original_id is not null
        then 'Bildbearbeitung angelegt: ' || coalesce(new.bearbeitung, 'ohne Angabe')
      else 'Bild hinzugefügt: ' || coalesce(new.titel, new.art::text)
    end,
    jsonb_build_object('ki_bearbeitet', new.ki_bearbeitet, 'art', new.art)
  );
  return new;
end; $$;

revoke all on function intern.verlauf_bild() from public;

create trigger objekt_bilder_verlauf after insert on public.objekt_bilder
  for each row execute function intern.verlauf_bild();

-- ---------------------------------------------------------------------------
-- 3. Aufgaben
-- ---------------------------------------------------------------------------

create type public.prioritaet as enum ('hoch', 'mittel', 'niedrig');

create table public.aufgaben (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,

  titel text not null check (length(trim(titel)) between 1 and 300),
  beschreibung text,
  prioritaet public.prioritaet not null default 'mittel',
  faellig_am date,

  -- Bezug ist freiwillig: „Rueckruf Herr Sommer" braucht kein Objekt.
  objekt_id uuid references public.objekte(id) on delete cascade,
  kontakt_id uuid references public.kontakte(id) on delete set null,

  zustaendig_id uuid references public.benutzer(id) on delete set null,

  erledigt_am timestamptz,
  erledigt_von uuid references public.benutzer(id) on delete set null,

  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  -- Wer erledigt hat, gehoert zum Erledigen. Sonst steht spaeter „fertig" da,
  -- ohne dass jemand dafuer geradesteht.
  constraint aufgabe_erledigt_vollstaendig
    check ((erledigt_am is null) = (erledigt_von is null))
);

create index aufgaben_offen_idx
  on public.aufgaben(mandant_id, faellig_am) where erledigt_am is null;
create index aufgaben_objekt_idx on public.aufgaben(objekt_id);
create index aufgaben_zustaendig_idx
  on public.aufgaben(zustaendig_id) where erledigt_am is null;

comment on table public.aufgaben is
  'Aufgaben, wahlweise mit Bezug zu Objekt und Kontakt.';

create trigger aufgaben_geaendert before update on public.aufgaben
  for each row execute function intern.setze_geaendert_am();

alter table public.aufgaben enable row level security;

create policy aufgaben_lesen on public.aufgaben
  for select using (mandant_id = intern.aktueller_mandant());
create policy aufgaben_schreiben on public.aufgaben
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- ---------------------------------------------------------------------------
-- 4. Termine
-- ---------------------------------------------------------------------------

create type public.terminart as enum (
  'besichtigung',
  'beratung',
  'objektaufnahme',
  'notartermin',
  'uebergabe',
  'telefonat',
  'sonstiges'
);

create table public.termine (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,

  titel text not null check (length(trim(titel)) between 1 and 300),
  art public.terminart not null default 'besichtigung',
  notiz text,

  beginnt_am timestamptz not null,
  endet_am timestamptz not null,
  ort text,

  objekt_id uuid references public.objekte(id) on delete cascade,
  kontakt_id uuid references public.kontakte(id) on delete set null,
  zustaendig_id uuid references public.benutzer(id) on delete set null,

  abgesagt_am timestamptz,

  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  constraint termin_zeitraum check (endet_am > beginnt_am)
);

create index termine_zeitraum_idx
  on public.termine(mandant_id, beginnt_am) where abgesagt_am is null;
create index termine_objekt_idx on public.termine(objekt_id);
create index termine_zustaendig_idx on public.termine(zustaendig_id, beginnt_am);

comment on table public.termine is
  'Termine, wahlweise mit Bezug zu Objekt und Kontakt. Absagen bleiben erhalten statt geloescht zu werden.';

create trigger termine_geaendert before update on public.termine
  for each row execute function intern.setze_geaendert_am();

alter table public.termine enable row level security;

create policy termine_lesen on public.termine
  for select using (mandant_id = intern.aktueller_mandant());
create policy termine_schreiben on public.termine
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- Ein Besichtigungstermin gehoert in den Verlauf des Objekts.
create or replace function intern.verlauf_termin()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.objekt_id is null then return new; end if;

  perform intern.verlauf_schreiben(
    new.mandant_id, new.objekt_id, new.kontakt_id, 'besichtigung',
    'Termin angelegt: ' || new.titel ||
      ' am ' || to_char(new.beginnt_am, 'DD.MM.YYYY HH24:MI'),
    jsonb_build_object('art', new.art)
  );
  return new;
end; $$;

revoke all on function intern.verlauf_termin() from public;

create trigger termine_verlauf after insert on public.termine
  for each row execute function intern.verlauf_termin();
