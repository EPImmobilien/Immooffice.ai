-- ===========================================================================
-- fork_60 — drei Preise für Aktionen, die es nicht gibt
-- ===========================================================================
-- `tarife-oeffentlich` zeigt die Credit-Tabelle auf der Website, und zwar
-- nur die aktiven Zeilen. Drei davon versprechen etwas, das die Software
-- nicht tut:
--
--   expose_text      „Vollständiger Exposé-Text", 10 Credits.
--                    Die Oberfläche erzeugt Baustein für Baustein, jeder als
--                    eigener Aufruf von generate-text zu ki_text. Einen
--                    Sammelaufruf gibt es nicht.
--   social_paket     „Social-Media-/Marketing-Paket", 5 Credits.
--                    Die Bildunterschrift ist ein einzelner generate-text-
--                    Aufruf, also ebenfalls ki_text.
--   grundriss_visual „Grundrissvisualisierung", 30 Credits.
--                    Keine Funktion erzeugt so etwas. grundriss-ki-lesen
--                    LIEST einen Grundriss, es zeichnet keinen.
--
-- Ein Preis für eine Aktion, die niemand auslöst, ist schlimmer als kein
-- Preis: der Interessent liest ihn auf der Preisseite, der Betreiber pflegt
-- ihn im Admin, und beides geht ins Leere.
--
-- Die Zeilen werden NICHT gelöscht. Sie beschreiben, was gebaut werden soll,
-- und der Betreiber schaltet sie im Plattform-Admin mit einem Häkchen
-- wieder an, sobald es die Aktion gibt. Gelöscht wären sie samt Preis weg.
--
-- Verbraucht hat sie nie jemand: credit_buchungen ist für alle drei leer
-- (nachgesehen am 06.10.2026, die Tabelle ist insgesamt leer).
--
-- Dass keine vierte dazukommt, prüft tests/credits.js: jede Aktion des
-- Katalogs mit einem Preis über null braucht einen Aufrufer in einer Edge
-- Function — oder einen Eintrag mit Grund.
-- ===========================================================================

update public.plattform_credit_preise
   set aktiv = false,
       beschreibung = beschreibung
         || ' — noch nicht ausgelöst: keine Funktion ruft diese Aktion auf. '
         || 'Wieder anschalten, sobald es sie gibt.',
       geaendert_am = now()
 where aktion in ('expose_text', 'social_paket', 'grundriss_visual')
   and aktiv;
