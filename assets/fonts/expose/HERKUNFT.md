# Schriften der Exposé-Vorlagen

Achtzehn Schnitte, erzeugt von `scripts/expose-schriften.py` aus vier
variablen Schriften von [google/fonts](https://github.com/google/fonts).
Alle drei Familien stehen unter der SIL Open Font License 1.1; die
Lizenztexte liegen daneben (`OFL-*.txt`) und müssen mitgeliefert werden,
wenn die Dateien weitergegeben werden.

| Familie | Quelle | Lizenz | Urheber |
|---|---|---|---|
| Plus Jakarta Sans | `ofl/plusjakartasans/PlusJakartaSans[wght].ttf` | OFL 1.1 | Tokotype |
| Cormorant Garamond | `ofl/cormorantgaramond/CormorantGaramond[wght].ttf` und `-Italic` | OFL 1.1 | Catharsis Fonts |
| Archivo | `ofl/archivo/Archivo[wdth,wght].ttf` | OFL 1.1 | Omnibus-Type |

## Warum genau diese Schnitte

Die drei Prototypen in `reference/expose-vorlagen/` laden Dateien, die es
nur auf dem Rechner gab, auf dem sie liefen (`/home/claude/fonts/`). Welche
Achsenwerte dahinterstanden, stand nirgends. Die Referenz-PDFs tragen aber
die eingebetteten Schriftprogramme: jede Instanz wurde daraus
zurückgerechnet, indem Vorschubbreite und Umrissrahmen jedes Glyphs gegen
ein Gitter aus `wght` × `wdth` gestellt wurden. Treffer jeweils 100 %.

`tests/expose-schriften.py` rechnet das bei jedem `npm run check` nach.
Verschiebt sich eine Achse, fällt es dort auf — und nicht erst, wenn ein
Exposé eine Zeile zu breit setzt.

| Datei | Achsen | PostScript-Name im PDF |
|---|---|---|
| `Jak-Light.ttf` | wght 300 | `PlusJakarta-Light` |
| `Jak-Regular.ttf` | wght 400 | `PlusJakarta-Regular` |
| `Jak-Medium.ttf` | wght 500 | `PlusJakarta-Medium` |
| `Jak-SemiBold.ttf` | wght 600 | `PlusJakarta-SemiBold` |
| `Jak-Bold.ttf` | wght 700 | `PlusJakarta-Bold` |
| `Jak-ExtraBold.ttf` | wght 800 | `PlusJakarta-ExtraBold` |
| `Corm-Light.ttf` | wght 300 | `Corm-Light` |
| `Corm-Regular.ttf` | wght 400 | `Corm-Regular` |
| `Corm-Medium.ttf` | wght 500 | `Corm-Medium` |
| `Corm-SemiBold.ttf` | wght 600 | `Corm-SemiBold` |
| `Corm-LightItalic.ttf` | wght 300, kursiv | `Corm-LightItalic` |
| `Corm-RegularItalic.ttf` | wght 400, kursiv | `Corm-RegularItalic` |
| `Arch-Regular.ttf` | wght 400, wdth 100 | `Arch-Regular` |
| `Arch-Medium.ttf` | wght 500, wdth 100 | `Arch-Medium` |
| `Arch-SemiBold.ttf` | wght 600, wdth 100 | `Arch-SemiBold` |
| `Arch-Bold.ttf` | wght 700, wdth 100 | `Arch-Bold` |
| `Arch-CondXB.ttf` | wght 800, wdth 62 | `Arch-CondXB` |
| `Arch-CondBlack.ttf` | wght 900, wdth 62 | `Arch-CondBlack` |

## Was absichtlich fehlt

**`A-SemiCondBold` und `A-Light`.** Der Studio-Prototyp registriert beide,
zeichnet aber nie mit ihnen. Sie stehen in keinem Referenz-PDF, also ist
ihre Breitenachse nicht messbar. Geraten wird hier nichts.

**Unterschneidung und Ligaturen.** `GSUB` und `GPOS` sind entfernt. Die
Prototypen rechnen Breiten mit `pdfmetrics.stringWidth`, und das addiert
Vorschubbreiten — ohne Kerning, ohne Ligaturen. Ein Renderer, der
unterschneidet, läuft mit jeder Zeile weiter von der verbindlichen Vorlage
weg. Ohne die beiden Tabellen hat fontkit nichts anzuwenden, und Browser
und Edge Function rechnen dasselbe.

**Griechisch, Kyrillisch, Vietnamesisch.** `Corm-Light` wäre mit vollem
Zeichensatz 772 KiB, die Signature-Vorlage lädt sechs Schnitte — vier
Megabyte für eine Vorschau im Browser. Geblieben sind Latin-1 und Latin
Extended-A (also auch Polnisch, Tschechisch, Ungarisch, Türkisch),
Interpunktion, Währungen, die Mathematikzeichen und Aufzählungsmarken, die
vorkommen. Fehlt ein Zeichen, meldet der Renderer das als Warnung, statt
still ein leeres Rechteck zu setzen.

## Die variablen Ausgangsschriften

Sie liegen **nicht** im Repository — sie sind Arbeitsmaterial. Ihre
SHA-256-Summen stehen in `scripts/expose-schriften.py`; ändert Google eine
Datei, bricht das Skript ab, statt die Schnitte unter der Hand zu
verschieben. Das Erzeugnis dagegen ist versioniert, dasselbe Muster wie bei
`src/` und `supabase/functions/`.
