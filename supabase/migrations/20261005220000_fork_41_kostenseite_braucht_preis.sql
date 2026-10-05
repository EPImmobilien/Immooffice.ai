-- ===========================================================================
-- fork_41 — die Kostenseite braucht einen Preis
--
-- Die Seite "Kosten & Finanzierung" zeigt Kaufpreis, Grunderwerbsteuer,
-- Notar, Courtage, Gesamtaufwand und die Monatsrate. Alles davon haengt am
-- Angebotspreis. Fehlt der, faellt jede einzelne Zeile aus — der Renderer
-- laesst fehlende Werte weg — und zurueck bleiben zwei Ueberschriften auf
-- einer leeren Seite. Das ist schlechter als keine Seite.
--
-- Der Fall ist nicht theoretisch: das eine Objekt, das am 05.10.2026 im
-- eigenen Projekt steht, hat keinen Angebotspreis.
--
-- Die Bedingung wird also erweitert, nicht ersetzt: Verkauf UND Preis
-- vorhanden. Dieselbe Textersetzung wie in fork_40, aus demselben Grund —
-- die Bedingung kann an jeder Seite stehen.
-- ===========================================================================

update public.expose_vorlagen
   set dokument = replace(
         dokument::text,
         '{"feld": "objekt.vermarktung", "gleich": "kauf"}',
         '{"und": [{"feld": "objekt.vermarktung", "gleich": "kauf"}, '
         || '{"vorhanden": "rechnung.kaufpreis"}]}')::jsonb,
       geaendert_am = now()
 where dokument::text like '%{"feld": "objekt.vermarktung", "gleich": "kauf"}%';
