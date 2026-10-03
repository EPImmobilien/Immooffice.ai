# Eigene Edge Functions des Forks

Hier liegen Edge Functions, die es in der Vorlage **nicht gibt** — und die
deshalb nicht aus `reference/functions/` entstehen können.

## Warum ein eigener Ort

`scripts/neutralisieren-funktionen.py` leert `supabase/functions/` bei jedem
Lauf vollständig (`shutil.rmtree`) und baut es aus `reference/functions/`
neu auf. Eine Funktion, die dort von Hand hineingelegt würde, wäre beim
nächsten Lauf weg. `reference/` ist der andere mögliche Ort und fällt
ebenfalls aus: es ist nicht versioniert.

Also: hier schreiben, versioniert. Der Erzeuger kopiert diesen Ordner nach
dem Neuaufbau nach `supabase/functions/` und nennt dabei jede Datei. Das
Ausrollen (`.github/workflows/funktionen-ausrollen.yml`) findet sie dann wie
jede andere.

## Was hier hingehört — und was nicht

**Hier:** Funktionen, die die Oberfläche der Vorlage ruft, die aber im
Netlify-Export nicht mitkommen (der liefert nur die Oberfläche).

**Nicht hier:** eine geänderte Fassung einer Funktion der Vorlage. Solche
Änderungen gehören als Regel in den Erzeuger — sonst läuft die Kopie
auseinander, und `tests/funktionen-unveraendert.py` kann nicht mehr prüfen,
ob die Neutralisierung nur Kennzeichen getroffen hat.

## Woher der Inhalt kommt

Aus dem Vertrag der Oberfläche: welche Felder sie im Anfragekörper schickt,
welche sie in der Antwort liest, welche Spalten sie danach abfragt. Das legt
Verhalten und Datenfluss fest. Was es **nicht** festlegt, ist die innere
Arbeitsweise der KI-Funktionen — dort steht die Fassung dieses Forks, und
ein späterer Export der Vorlage ersetzt sie.

Entschieden am 03.10.2026 auf Weisung des Auftraggebers („alle drei selbst
schreiben"), vermerkt in `docs/ENTSCHEIDUNGEN.md`.
