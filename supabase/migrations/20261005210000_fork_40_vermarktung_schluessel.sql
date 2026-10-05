-- ===========================================================================
-- fork_40 — die Kostenseite erschien nie
--
-- Die Raster-Vorlage zeigt ihre Seite "Kosten & Finanzierung" nur bei einem
-- Verkauf. Die Bedingung lautete:
--
--     {"feld": "objekt.vertragsart", "gleich": "kauf"}
--
-- In immobilien.vertragsart steht aber, was die Oberflaeche schreibt:
-- "verkauf", "vermietung" oder "beides". Nie "kauf". Die Bedingung war damit
-- bei JEDEM Objekt falsch, und die Seite ist still entfallen — ohne Fehler,
-- ohne Warnung, denn eine Seite, die ihre Bedingung nicht erfuellt, SOLL
-- entfallen.
--
-- Seit dem 05.10.2026 rechnet packages/expose-renderer/src/aufbereiten.ts
-- daraus zwei Werte: objekt.vermarktung als Schluessel (kauf/miete/beides)
-- fuer Bedingungen und objekt.vertragsart als Text fuer das Papier
-- ("Haus zum verkauf" waere kein deutscher Satz). Diese Migration zieht die
-- Bedingung in den gespeicherten Vorlagen nach.
--
-- Ersetzt wird im TEXT des Dokuments und nicht mit jsonb_set: die Bedingung
-- kann an jeder Seite und an jedem Element stehen, und ein Pfad je Fundstelle
-- waere eine Liste, die beim naechsten Vorlagenstand nicht mehr stimmt. Der
-- Suchtext ist die Schreibweise, die jsonb selbst erzeugt.
--
-- Auch fuer EIGENE Vorlagen der Mandanten: wer eine Kopie der Systemvorlage
-- gezogen hat, traegt den Fehler mit. Deshalb ohne Einschraenkung auf
-- mandant_id — die Migration laeuft mit dem Dienstschluessel.
-- ===========================================================================

update public.expose_vorlagen
   set dokument = replace(
         dokument::text,
         '{"feld": "objekt.vertragsart", "gleich": "kauf"}',
         '{"feld": "objekt.vermarktung", "gleich": "kauf"}')::jsonb,
       geaendert_am = now()
 where dokument::text like '%{"feld": "objekt.vertragsart", "gleich": "kauf"}%';

-- Die Fassungen in der Historie bleiben, wie sie waren: sie sind ein
-- Abbild des Stands, zu dem sie gehoeren. Wer eine alte Fassung
-- zurueckholt, holt auch die alte Bedingung zurueck — und sieht dann an
-- der fehlenden Kostenseite, warum man das nicht tut.
