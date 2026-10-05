-- ===========================================================================
-- fork_39 — die zweite Markenzeile
--
-- Die Luxusvorlage des Exposé-Baukastens setzt unter den Markennamen eine
-- zweite, gesperrte Zeile ({{firma.linie}}) — im Prototyp stand dort die
-- Produktlinie des Referenzunternehmens. Der Feldkatalog des Renderers
-- fuehrt das Feld, das Schema hatte es nicht.
--
-- Es ist bewusst eine SPALTE und kein fester Text: "Premium Immobilien"
-- waere fuer jeden anderen Mandanten eine Behauptung ueber sein Geschaeft.
-- Bleibt die Spalte leer, entfaellt die Zeile — der Renderer laesst
-- fehlende Werte weg, statt sie zu erfinden.
-- ===========================================================================

alter table public.firma_stammdaten
  add column if not exists marken_linie text;

comment on column public.firma_stammdaten.marken_linie is
  'Zweite Markenzeile unter dem Markennamen, etwa eine Produktlinie. '
  'Leer = die Zeile entfaellt im Exposé.';
