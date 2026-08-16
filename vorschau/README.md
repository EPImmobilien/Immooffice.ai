# Design-Vorschau

`index.html` ist eine **eigenständige Design-Vorschau ohne Funktion**. Sie lässt
sich per Drag-and-drop auf Netlify hochladen und dient ausschließlich der
Abstimmung über Layout, Farbwelt und Typografie.

**Sie ist ausdrücklich nicht das Produkt.** Master-Prompt Abschnitt 1 schließt
einen Klick-Dummy als Ergebnis aus; die tatsächliche Anwendung läuft
serverseitig mit Datenbank, Anmeldung und Mandantentrennung. Alle dargestellten
Objekte, Personen und Firmen sind frei erfunden.

## Aufbau

| Datei | Inhalt |
|---|---|
| `vorlage.html` | Quelle ohne eingebettete Schriften |
| `index.html` | Erzeugte Fassung mit eingebetteten Schriften — diese hochladen |

Die Design-Tokens sind mit `src/app/globals.css` der Anwendung identisch. Ändert
sich dort die Farbwelt, ist die Vorschau nachzuziehen.

## Neu erzeugen

Die Schriften werden auf die tatsächlich verwendeten Zeichen reduziert und als
WOFF2 eingebettet — dadurch bleibt die Datei bei rund 80 KB und benötigt **kein**
fremdes CDN. Das entspricht der Vorgabe aus Abschnitt 16, keine IP-Adressen an
Dritte zu übertragen.

```bash
pip install fonttools brotli
# Inter (400/500/600) und Poppins (500/600) von Google Fonts beziehen
python3 scripts/vorschau-bauen.py
```

## Schriftlizenz

Die eingebetteten Schriften **Inter** und **Poppins** stehen unter der
[SIL Open Font License 1.1](https://openfontlicense.org/). Die Einbettung und
Weitergabe innerhalb dieses Dokuments ist davon gedeckt; die Schriften selbst
werden nicht verkauft und nicht unter anderem Namen geführt.
