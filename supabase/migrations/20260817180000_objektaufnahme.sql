-- Objektaufnahme: der Vor-Ort-Termin beim Eigentuemer.
--
-- Bisher fing jedes Objekt beim leeren Formular an. Das ist die Reihenfolge der
-- Datenbank, nicht die der Arbeit: Zuerst steht der Termin in der Wohnung, mit
-- Zollstock, Kamera und einem Eigentuemer, der erzaehlt. Erst danach entsteht
-- ein Objekt — und nur, wenn der Auftrag zustande kommt.
--
-- Die Aufnahme ist deshalb ein eigener Datensatz und nicht ein halbfertiges
-- Objekt. Ein Objekt im Bestand, das eigentlich nur ein Besichtigungstermin
-- war, verfaelscht jede Auswertung und taucht in Listen auf, in die es nicht
-- gehoert.

-- Bewusst grob: vier Stufen sind vor Ort in Sekunden zu treffen. Eine
-- Schulnotenskala von eins bis sechs suggeriert eine Genauigkeit, die bei einem
-- Blick auf ein Dach niemand hat.
create type public.zustandsnote as enum ('gut', 'mittel', 'schlecht', 'unbekannt');

create type public.aufnahmestatus as enum ('offen', 'uebernommen', 'verworfen');

create table public.objektaufnahmen (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,

  aufgenommen_am date not null default current_date,
  -- Der Eigentuemer, sofern er schon als Kontakt erfasst ist. Beim ersten
  -- Termin ist er das oft noch nicht — deshalb freiwillig.
  kontakt_id uuid references public.kontakte(id) on delete set null,

  bezeichnung text not null check (length(trim(bezeichnung)) between 1 and 200),
  strasse text,
  hausnummer text,
  plz text,
  ort text,

  objektkategorie public.objektkategorie,
  vermarktungsart public.vermarktungsart,

  wohnflaeche numeric(10,2),
  grundstuecksflaeche numeric(10,2),
  zimmer numeric(4,1),
  baujahr integer check (baujahr is null or baujahr between 1000 and 2200),
  etage integer,

  -- Zustand der Bauteile, die den Preis tragen. Genau diese sechs, weil sie
  -- vor Ort ohne Gutachter beurteilbar sind und weil sie die Fragen sind, die
  -- ein Kaeufer stellt.
  zustand_dach public.zustandsnote not null default 'unbekannt',
  zustand_fenster public.zustandsnote not null default 'unbekannt',
  zustand_heizung public.zustandsnote not null default 'unbekannt',
  zustand_baeder public.zustandsnote not null default 'unbekannt',
  zustand_elektrik public.zustandsnote not null default 'unbekannt',
  zustand_fassade public.zustandsnote not null default 'unbekannt',

  heizungsart text,
  heizung_baujahr integer check (heizung_baujahr is null or heizung_baujahr between 1000 and 2200),

  -- Was der Eigentuemer sich vorstellt. Ausdruecklich NICHT der Angebotspreis:
  -- Die Preisvorstellung ist eine Aussage des Eigentuemers, keine Bewertung.
  preisvorstellung numeric(14,2),

  -- Unterlagen, die noch fehlen. Aus dieser Liste entstehen bei der Uebernahme
  -- Aufgaben — das ist der Punkt, an dem der Termin Arbeit erzeugt statt einer
  -- Notiz, die niemand wiederfindet.
  unterlagen_offen public.dokumentart[] not null default '{}',

  notizen text,

  status public.aufnahmestatus not null default 'offen',
  -- Bei Uebernahme gesetzt. Der Verweis bleibt: Man soll spaeter sehen, aus
  -- welchem Termin ein Objekt entstanden ist.
  objekt_id uuid references public.objekte(id) on delete set null,

  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  -- „Uebernommen" ohne Objekt waere eine Behauptung ohne Gegenstand.
  constraint aufnahme_uebernahme_vollstaendig
    check ((status = 'uebernommen') = (objekt_id is not null))
);

create index objektaufnahmen_mandant_idx
  on public.objektaufnahmen(mandant_id, aufgenommen_am desc);
create index objektaufnahmen_offen_idx
  on public.objektaufnahmen(mandant_id) where status = 'offen';
create index objektaufnahmen_kontakt_idx on public.objektaufnahmen(kontakt_id);

comment on table public.objektaufnahmen is
  'Vor-Ort-Erfassung beim Eigentuemer. Wird bei Auftrag in ein Objekt uebernommen.';
comment on column public.objektaufnahmen.preisvorstellung is
  'Aussage des Eigentuemers, keine Bewertung und kein Angebotspreis.';

create trigger objektaufnahmen_geaendert before update on public.objektaufnahmen
  for each row execute function intern.setze_geaendert_am();

create trigger objektaufnahmen_mandantenrein
  before insert or update on public.objektaufnahmen
  for each row execute function intern.verweise_mandantenrein(
    'kontakt_id', 'kontakte', 'objekt_id', 'objekte');

alter table public.objektaufnahmen enable row level security;

create policy objektaufnahmen_lesen on public.objektaufnahmen
  for select using (mandant_id = intern.aktueller_mandant());
create policy objektaufnahmen_schreiben on public.objektaufnahmen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Uebernahme in ein Objekt ----------------------------------------------
--
-- Als Datenbankfunktion, weil hier mehrere Schritte zusammengehoeren: Objekt
-- anlegen, Eigentuemer verknuepfen, Aufgaben fuer die offenen Unterlagen
-- erzeugen, Aufnahme als uebernommen kennzeichnen. Bricht einer davon ab,
-- soll keiner davon stehen bleiben — ein Objekt ohne Eigentuemer und ohne
-- Aufgaben waere schlechter als gar keines.
--
-- Bewusst OHNE `security definer`: Die Funktion soll genau die Rechte des
-- Aufrufers haben. Alle Einfuegungen laufen dadurch durch die normalen
-- Policies, und ein Nur-Lese-Zugriff kann hiermit nichts anlegen.
create or replace function public.aufnahme_uebernehmen(p_aufnahme uuid)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  a public.objektaufnahmen;
  v_objekt uuid;
  v_art public.dokumentart;
begin
  select * into a from public.objektaufnahmen where id = p_aufnahme;
  if not found then
    raise exception 'Aufnahme nicht gefunden';
  end if;

  if a.status <> 'offen' then
    raise exception 'Diese Aufnahme ist bereits abgeschlossen';
  end if;

  insert into public.objekte (
    mandant_id, bezeichnung, vermarktungsart, objektkategorie, status,
    strasse, hausnummer, plz, ort, etage,
    wohnflaeche, grundstuecksflaeche, zimmer, baujahr,
    -- Die Preisvorstellung des Eigentuemers wird NICHT als Kaufpreis
    -- uebernommen. Sie ist seine Aussage; der Angebotspreis entsteht aus einer
    -- Bewertung. Sie wandert stattdessen in den internen Vermerk.
    beschreibung_sonstiges
  )
  values (
    a.mandant_id, a.bezeichnung,
    coalesce(a.vermarktungsart, 'kauf'),
    coalesce(a.objektkategorie, 'sonstige'),
    'akquise',
    a.strasse, a.hausnummer, a.plz, a.ort, a.etage,
    a.wohnflaeche, a.grundstuecksflaeche, a.zimmer, a.baujahr,
    nullif(concat_ws(
      E'\n',
      case when a.preisvorstellung is not null
        then 'Preisvorstellung des Eigentümers: '
             || to_char(a.preisvorstellung, 'FM999G999G999D00') || ' EUR'
      end,
      case when a.heizungsart is not null then 'Heizung: ' || a.heizungsart end,
      a.notizen
    ), '')
  )
  returning id into v_objekt;

  -- Eigentuemer verknuepfen, wenn bekannt.
  if a.kontakt_id is not null then
    insert into public.kontakt_objekt (mandant_id, objekt_id, kontakt_id, rolle)
    values (a.mandant_id, v_objekt, a.kontakt_id, 'eigentuemer')
    on conflict do nothing;
  end if;

  -- Aus jeder offenen Unterlage eine Aufgabe. Das ist der Kern der Uebernahme:
  -- Der Termin erzeugt die Arbeit, die aus ihm folgt.
  foreach v_art in array a.unterlagen_offen loop
    insert into public.aufgaben
      (mandant_id, objekt_id, kontakt_id, titel, prioritaet, zustaendig_id, erstellt_von)
    values (
      a.mandant_id, v_objekt, a.kontakt_id,
      'Unterlage anfordern: ' || v_art::text,
      'hoch', a.erstellt_von, a.erstellt_von
    );
  end loop;

  update public.objektaufnahmen
     set status = 'uebernommen', objekt_id = v_objekt
   where id = p_aufnahme;

  return v_objekt;
end; $$;

revoke all on function public.aufnahme_uebernehmen(uuid) from public;
grant execute on function public.aufnahme_uebernehmen(uuid) to authenticated;

comment on function public.aufnahme_uebernehmen(uuid) is
  'Erzeugt aus einer Aufnahme ein Objekt, verknuepft den Eigentuemer und legt Aufgaben fuer die offenen Unterlagen an.';
