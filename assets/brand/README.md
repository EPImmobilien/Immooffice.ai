# Markenassets ImmoOffice.ai

Erzeugt durch `scripts/build-brand.py`. **Die SVGs nicht von Hand bearbeiten** —
Änderungen gehören in das Skript, damit alle vier Dateien konsistent bleiben.

## Dateien

| Datei | Verwendung |
|---|---|
| `immooffice-logo-primaer.svg` | Vollständige Sperrung auf hellen Flächen — Anmeldung, Kopfzeile, Exposé-Deckblatt |
| `immooffice-logo-invers.svg` | Vollständige Sperrung auf dunklen Flächen — Dunkelmodus, dunkle Deckblätter |
| `immooffice-icon-dunkel.svg` | Bildmarke allein, dunkel — Favicon, App-Icon, PDF-Kopf auf hellem Grund |
| `immooffice-icon-hell.svg` | Bildmarke allein, hell — auf dunklem Grund |

## Aufbau

**Bildmarke „Schlüsselloch-Turm“:** Turm mit Rundbogen auf einem Sockel, in den ein
Schlüsselloch eingesetzt ist. Reine Geometrie auf einem 64×64-Raster, ganzzahlig
gerastert — dadurch schriftunabhängig und in jeder Größe identisch.

**Wortmarke:** Poppins SemiBold, als Pfade eingebettet. Der Produktname steht in
Marineblau, die Endung `.ai` in Gold. Die Schriftdatei liegt aus Lizenzgründen (OFL)
nicht im Repository.

## Neu erzeugen

```bash
# Poppins SemiBold beziehen (Google Fonts, OFL)
curl -s "https://fonts.googleapis.com/css2?family=Poppins:wght@600" \
  -H "User-Agent: Mozilla/5.0" | grep -o 'https://[^)]*\.ttf' | xargs curl -sO

pip install fonttools
python3 scripts/build-brand.py Poppins-SemiBold.ttf
```

## Anwendungsregeln

- **Schutzraum:** rundum mindestens die halbe Breite der Bildmarke freihalten.
- **Mindestgröße:** Sperrung ab 120 px Breite, Bildmarke ab 24 px. Darunter verliert
  das Schlüsselloch seine Lesbarkeit; für 16 px wird zur Implementierung eine
  vereinfachte Favicon-Fassung ohne Sockel erzeugt.
- **Farbe:** ausschließlich in den fixierten Markenfarben (siehe `docs/DESIGNSYSTEM.md`).
  Keine Verläufe, keine Schatten, keine Umfärbung.
- **Nicht** verzerren, drehen, umsortieren oder die Wortmarke ersetzen.

## Abgrenzung

Diese Marke ist eine Neuzeichnung für ImmoOffice.ai. Sie steht in keinem Bezug zur
Referenz-Anwendung und darf keine deren Kennzeichen aufnehmen (Master-Prompt
Abschnitt 2). Das **Mandanten-Branding** (Abschnitt 5) ist davon getrennt: Kunden
hinterlegen ihr eigenes Logo für Exposés und Dokumente — es ersetzt nie die
Plattformmarke in der Anwendungsoberfläche.
