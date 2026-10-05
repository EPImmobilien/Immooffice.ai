-- fork_35: drei Felder, die die Exposé-Vorlagen brauchen und das Schema nicht hat
--
-- Die drei Prototypen in reference/expose-vorlagen/ sind laut Auftrag die
-- verbindliche Design-Referenz. Drei ihrer Angaben haben im Fork keine
-- Spalte, und ohne Spalte muesste die Vorlage die Zeile weglassen —
-- obwohl jeder Makler diese Angabe erfasst:
--
--   ortsteil            "Musterstadt-Lindenau" — steht in jedem Expose
--                       unter der Anschrift. In OpenImmo heisst das Feld
--                       regionaler_zusatz.
--   modernisierung_jahr Letzte Modernisierung. Bisher gab es nur
--                       energie_baujahr_anlage, und das ist die Heizung,
--                       nicht das Gebaeude. In OpenImmo:
--                       letztemodernisierung.
--   profiles.mobil      Die Kontaktkarte nennt Telefon UND Mobil. Bisher
--                       hatte ein Mitarbeiter nur eine Nummer.
--
-- Alle drei sind reine Ergaenzungen: nullable, ohne Standardwert, ohne
-- Wirkung auf vorhandene Zeilen. Der Feldkatalog in
-- packages/expose-renderer/src/felder.ts nimmt sie auf, und
-- tests/expose-felder.js prueft, dass beides zusammenpasst.

alter table public.immobilien
  add column if not exists ortsteil text,
  add column if not exists modernisierung_jahr integer;

alter table public.profiles
  add column if not exists mobil text;

comment on column public.immobilien.ortsteil is
  'Ortsteil oder Stadtviertel. OpenImmo: regionaler_zusatz.';
comment on column public.immobilien.modernisierung_jahr is
  'Jahr der letzten Modernisierung des Gebaeudes. OpenImmo: letztemodernisierung.';
comment on column public.profiles.mobil is
  'Mobilnummer fuer die Kontaktkarte im Expose.';
