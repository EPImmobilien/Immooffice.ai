-- ===========================================================================
-- Fork-eigene Migration 31i — drei Spalten fuer die Privat-Pruefung
--
-- Stufe 112 der Vorlage: die KI prueft Objektfotos auf private Details
-- (Familienfotos, Personen), und bei einem Fund liegt ein retuschierter
-- Vorschlag NEBEN dem Original. Uebernommen wird erst per Klick; das
-- Original bleibt im Speicher und laesst sich zurueckholen.
--
-- Die drei Spalten liest die Oberflaeche namentlich. Sie fehlten, weil der
-- Export der Vorlage nur die Oberflaeche enthaelt.
--
-- Das Original wird NICHT ersetzt — CLAUDE.md: "Originale bleiben
-- unveraendert, jede Bearbeitung erzeugt eine Version".
-- privat_vorschlag_pfad zeigt auf die Version, nicht auf das Original.
-- ===========================================================================

alter table public.immobilie_datei
  add column if not exists privat_status text,
  add column if not exists privat_befund jsonb,
  add column if not exists privat_vorschlag_pfad text;

comment on column public.immobilie_datei.privat_status is
  'Stand der Pruefung auf private Details: offen, geprueft, fund, uebernommen, zurueckgesetzt. Leer = nie geprueft.';
comment on column public.immobilie_datei.privat_befund is
  'Was die KI gefunden hat, als JSON. Sichtbar im Dialog; Grundlage fuer die Entscheidung des Nutzers.';
comment on column public.immobilie_datei.privat_vorschlag_pfad is
  'Pfad der retuschierten Version. Das Original unter storage_path bleibt unveraendert.';
