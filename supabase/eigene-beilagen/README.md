# Beilagen zu Funktionen der Vorlage

Hier liegen Dateien, die **neben** eine übernommene Edge Function gelegt
werden — also in deren Ordner, ohne dass es sie in `reference/functions/`
gibt.

## Warum ein eigener Ort

`scripts/neutralisieren-funktionen.py` leert `supabase/functions/` bei jedem
Lauf und baut es aus `reference/functions/` neu auf. Eine Datei, die dort
von Hand hineingelegt würde, wäre beim nächsten Lauf weg — derselbe Grund,
aus dem es `supabase/eigene/` gibt.

`supabase/eigene/` passt dafür nicht: dort liegen **ganze** Funktionen, die
die Vorlage nicht hat, und der Erzeuger bricht ausdrücklich ab, wenn ein
Ordner in beiden vorkommt.

## Was hier hingehört

Gemeinsamer Quelltext, den mehrere Funktionen brauchen und der nicht in
jede einzelne kopiert werden soll — zum Beispiel `anbieter.ts`, die
Anbieter-Schicht der Postfächer (Microsoft, Google, IMAP). Sie liegt
außerdem in den beiden eigenen Funktionen `postfach-anbieter-start` und
`postfach-anbieter-rueckruf`; `tests/postfach-anbieter.js` besteht darauf,
dass alle Kopien byte-gleich sind.

## Was nicht

Änderungen am Quelltext einer übernommenen Funktion. Die gehören als Regel
in den Erzeuger — sonst kann `tests/funktionen-unveraendert.py` nicht mehr
prüfen, ob die Neutralisierung nur Kennzeichen getroffen hat.
