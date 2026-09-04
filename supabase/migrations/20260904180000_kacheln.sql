-- ===========================================================================
-- Kachel-Startseite je Benutzer (Referenz: Startseite mit Anpassen-Modus)
--
-- Reihenfolge und ausgeblendete Kacheln werden je Benutzer gespeichert:
--   { "reihenfolge": ["immobilien", "kontakte", …], "ausgeblendet": ["bewerber"] }
-- Kein Trigger noetig: Jeder Benutzer darf seine eigene Zeile aendern
-- (bestehende Policy), die Verwaltung bleibt aussen vor.
-- ===========================================================================
begin;

alter table public.benutzer add column if not exists kacheln jsonb;
comment on column public.benutzer.kacheln is 'Startseite: Reihenfolge und ausgeblendete Kacheln je Benutzer (src/lib/kacheln.ts)';

commit;
