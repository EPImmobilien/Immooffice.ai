-- ===========================================================================
-- Fork-eigene Migration 34 — die drei Exposé-Vorlagen
--
-- HINWEIS ZUR NUMMER: angewendet wurde sie unter dem Namen
-- fork_33_expose_vorlagen (Version 20261005151853). Am selben Tag hat der
-- naechtliche Abgleich fork_33a bis fork_33c belegt, und zwar frueher. Zwei
-- unverwandte Arbeiten mit fast derselben Nummer waeren eine Falle, deshalb
-- heisst die Datei fork_34. In supabase_migrations.schema_migrations steht
-- weiter der Name von damals — eine angewendete Migration wird nicht
-- umbenannt.
--
-- Auftrag vom 05.10.2026: raster (Standard), signature (Luxus), studio
-- (grafisch). Die Wahl faellt auf drei Ebenen, von unten nach oben:
--
--   Anfragekoerper  >  immobilien.expose_vorlage  >  firma_stammdaten
--                      (Objekt-Uebersteuerung)      .expose_vorlage
--                                                   > 'raster'
--
-- Alle Spalten an immobilien sind nullable: null heisst "wie der Mandant es
-- haelt", nicht "leer". Ein Vorgabewert waere hier falsch, weil er die
-- Mandanteneinstellung stumm uebersteuern wuerde.
--
-- RLS: beide Tabellen tragen sie bereits, und zwar zeilenweise. Neue Spalten
-- brauchen keine eigene Richtlinie — die Grenze liegt an der Zeile.
-- ===========================================================================

-- --- Mandanten-Ebene -------------------------------------------------------
alter table public.firma_stammdaten
  add column if not exists expose_vorlage     text    not null default 'raster',
  add column if not exists expose_farben      jsonb   not null default '{}'::jsonb,
  add column if not exists expose_rechtsanhang boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'firma_stammdaten_expose_vorlage_check') then
    alter table public.firma_stammdaten
      add constraint firma_stammdaten_expose_vorlage_check
      check (expose_vorlage in ('raster', 'signature', 'studio'));
  end if;
end $$;

comment on column public.firma_stammdaten.expose_vorlage is
  'Welche der drei Exposé-Vorlagen der Mandant standardmaessig benutzt: raster, signature oder studio.';
comment on column public.firma_stammdaten.expose_farben is
  'Farben je Vorlage, optional: {"raster":{"f1":"#...","f2":"#..."}, ...}. Leer heisst: Farbe 1 = ci_primaer, Farbe 2 = ci_akzent — bei studio umgekehrt, dort traegt der Akzent die Signalflaeche.';
comment on column public.firma_stammdaten.expose_rechtsanhang is
  'Haengt an das Exposé eine Seite mit Widerrufsbelehrung und Muster-Widerrufsformular. Bei Mietobjekten entfaellt sie ohnehin.';

-- --- Objekt-Ebene ----------------------------------------------------------
alter table public.immobilien
  add column if not exists expose_vorlage            text,
  add column if not exists expose_zitat              text,
  add column if not exists expose_titel_zeilen       jsonb,
  add column if not exists expose_ausstattung_gruppen jsonb,
  add column if not exists expose_preis_auf_anfrage  boolean not null default false,
  add column if not exists expose_wege               jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'immobilien_expose_vorlage_check') then
    alter table public.immobilien
      add constraint immobilien_expose_vorlage_check
      check (expose_vorlage is null or expose_vorlage in ('raster', 'signature', 'studio'));
  end if;
end $$;

comment on column public.immobilien.expose_vorlage is
  'Uebersteuert die Vorlage des Mandanten fuer dieses eine Objekt. null = wie der Mandant es haelt.';
comment on column public.immobilien.expose_zitat is
  'Ein Satz, der das Objekt traegt: Prolog-Zitat bei signature, Pull-Quote bei raster.';
comment on column public.immobilien.expose_titel_zeilen is
  'Von Hand umbrochener Covertitel als Liste von Zeilen (signature zwei, studio bis drei). Fehlt er, bricht die Function selbst um.';
comment on column public.immobilien.expose_ausstattung_gruppen is
  'Ausstattung in Bloecken: [{"titel":"Architektur","punkte":["..."]}]. Fuer signature. Fehlt es, wird die normale Ausstattung auf vier Bloecke verteilt.';
comment on column public.immobilien.expose_preis_auf_anfrage is
  'Statt des Preises steht "auf Anfrage" im Exposé, und die Kostenrechnung entfaellt.';
comment on column public.immobilien.expose_wege is
  'Wegezeiten fuer studio: [{"ziel":"S-Bahn","fuss":7,"rad":3,"auto":3}]. Fehlt es, werden sie aus lage_distanzen abgeleitet.';
