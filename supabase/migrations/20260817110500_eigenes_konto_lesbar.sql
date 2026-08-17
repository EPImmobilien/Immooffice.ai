-- ===========================================================================
-- Das eigene Konto bleibt lesbar, auch wenn es abgeschaltet ist
--
-- Aufgefallen beim Bau der Benutzerverwaltung: `benutzer_lesen` haengt an
-- `intern.aktueller_mandant()`, und diese Funktion liefert fuer ein
-- abgeschaltetes Konto nichts. Ein deaktivierter Benutzer konnte damit nicht
-- einmal seinen eigenen Datensatz sehen — die Anwendung hielt ihn fuer ein
-- Konto ohne Unternehmen und schickte ihn auf "Unternehmen anlegen". Dort
-- meldet `registriere_mandant`, das Konto gehoere bereits zu einem
-- Unternehmen, und leitet aufs Dashboard. Das Dashboard schickt ihn wieder
-- zurueck: eine Endlosschleife statt einer Erklaerung.
--
-- Policies wirken additiv. Diese hier oeffnet ausschliesslich die eigene
-- Zeile; fremde Datensaetze bleiben unberuehrt.
-- ===========================================================================

create policy benutzer_eigenes_konto on public.benutzer
  for select using (id = auth.uid());
