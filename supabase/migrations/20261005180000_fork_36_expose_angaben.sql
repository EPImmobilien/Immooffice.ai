-- fork_36: zwei Angaben, die die Exposé-Seiten brauchen
--
-- Zwei Kaesten in den Prototypen stehen im Fork auf erfundenen Daten:
--
--   Der Hinweiskasten der Energieseite ("Durch Wärmepumpe und
--   Photovoltaik … wird ein großer Teil des Strombedarfs selbst
--   erzeugt."). Das ist eine Aussage ueber ein bestimmtes Objekt. Als
--   festen Text in die Vorlage zu schreiben waere eine erfundene
--   Objektangabe fuer jedes andere Objekt — CLAUDE.md untersagt das
--   ausdruecklich. Also ein Feld, und die Seite laesst den Kasten weg,
--   wenn es leer ist.
--
--   Die laufenden Kosten ("Grundsteuer 38 €, Gebäudeversicherung 54 € …").
--   Dieselbe Lage: entweder erfasst sie jemand, oder sie stehen nicht da.
--   Form: [{"name": "Grundsteuer", "betrag": 38}, …], Betrag in Euro je
--   Monat.
--
-- Beides nullable beziehungsweise leere Liste, ohne Wirkung auf
-- vorhandene Zeilen.

alter table public.immobilien
  add column if not exists expose_energie_hinweis text,
  add column if not exists laufende_kosten jsonb not null default '[]'::jsonb;

comment on column public.immobilien.expose_energie_hinweis is
  'Freier Hinweis fuer den Kasten "Gut zu wissen" auf der Energieseite des Exposes.';
comment on column public.immobilien.laufende_kosten is
  'Laufende Kosten je Monat: [{"name": "Grundsteuer", "betrag": 38}, ...].';
