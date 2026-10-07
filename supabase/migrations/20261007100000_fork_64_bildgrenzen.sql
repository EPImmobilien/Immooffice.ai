-- ===========================================================================
-- fork_64 — wie viele Bilder ins Exposé gehen, entscheidet der Betreiber
-- ===========================================================================
-- In `expose-pdf-erzeugen` standen 10 Fotos und 6 Grundrisse, fest
-- verdrahtet. Wer dreißig Fotos pflegte, bekam zehn — die übrigen wurden
-- nicht einmal geladen, und niemand erfuhr davon.
--
-- Seit fork_64 tragen die drei Systemvorlagen beliebig viele Bilder: die
-- Seite „Weitere Bilder" wiederholt sich je vier Fotos, die Seite „Weitere
-- Grundrisse" je Plan. Damit ist die Zahl keine Grenze der Gestaltung mehr,
-- sondern eine des Speichers — eine Edge Function hat endlichen.
--
-- Deshalb bleibt eine Grenze, aber sie steht hier und nicht im Code
-- (CLAUDE.md: Limits über den Plattform-Admin konfigurierbar), und die
-- Funktion sagt es in den Warnungen, wenn sie greift.
--
-- Die Vorgaben sind vorsichtig gewählt: 60 Fotos zu je ein paar hundert
-- Kilobyte in der Web-Fassung bleiben deutlich unter dem Budget. Das Budget
-- ist die eigentliche Sicherung — es greift auch dann, wenn jemand die
-- Fotozahl hochstellt und die Bilder groß sind.
-- ===========================================================================

insert into public.plattform_werte (schluessel, wert, beschreibung) values
  ('expose_max_fotos', '60'::jsonb,
   'So viele Objektfotos kommen höchstens ins Exposé-PDF (ohne Titelbild). '
   'Die Vorlagen tragen beliebig viele; die Grenze schützt den Speicher der '
   'Edge Function. Was nicht mehr hineinpasst, steht in den Warnungen.'),
  ('expose_max_grundrisse', '20'::jsonb,
   'So viele Grundrisse kommen höchstens ins Exposé-PDF.'),
  ('expose_bild_budget_mb', '48'::jsonb,
   'Speicherbudget für alle Bilder eines Exposés in MB. Die eigentliche '
   'Sicherung: sie greift auch bei wenigen, aber sehr großen Bildern.')
on conflict (schluessel) do nothing;
