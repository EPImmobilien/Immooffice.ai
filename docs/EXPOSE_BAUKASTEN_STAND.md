# Exposé-Baukasten — Stand

> Auftrag: [`PROMPT_immoOffice_Expose_Baukasten.md`](PROMPT_immoOffice_Expose_Baukasten.md),
> darauf aufbauend [`PROMPT_immoOffice_Expose_Vorlagen.md`](PROMPT_immoOffice_Expose_Vorlagen.md).
> Entscheidungen mit Begründung: [`ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md).

| Etappe | Stand |
|---|---|
| 1 — Renderer, Schema, drei Start-Vorlagen | **fertig** |
| 2 — Edge Function und Datenbank auf den Renderer umstellen | offen |
| 3 — Editor Basis | offen |
| 4 — Editor Komfort | offen |
| 5 — Objektmodus mit Abweichungen | Renderer-Seite fertig, Oberfläche offen |
| 6 — E2E-Tests, Neutralitäts-Gate, dieser Bericht | Gates stehen, Playwright offen |

## Was Etappe 1 abgenommen hat

Die Abnahme sollte laut Auftrag durch Hinsehen erfolgen — Seiten als PNG
rendern und mit den Referenz-PDFs vergleichen, höchstens ±2 pt Abweichung
bei Position und Größe.

Hinsehen findet keine Abweichung von zwei Punkt, und es findet sie nicht
wieder, wenn ein halbes Jahr später jemand eine Vorlage pflegt. Darum
läuft die Abnahme zusätzlich maschinell:

`tests/expose-aufzeichnung.py` lässt die drei Prototypen gegen eine
Leinwand laufen, die nicht zeichnet, sondern mitschreibt — jeder Text mit
Ort, Schnitt, Größe, Sperrung und Farbe, jedes Rechteck, jede Linie, jeder
Pfad, jeder Verlauf. `tests/expose-vorlagen.js` stellt die Ausgabe des
Renderers dagegen.

**Ergebnis: 31 Seiten, 2021 Zeichenschritte, größte Abweichung beim Ort
0,650 Punkt.** Und diese 0,65 entstehen daran, dass ein Prototyp an einer
Stelle „inkl, MwSt," schreibt statt „inkl. MwSt." und sein Text damit
anders breit ist. Alles übrige stimmt auf 0,000.

Angesehen wurden außerdem Titelseite, Angabenseite, Grundrissseite und
Kontaktseite jeder Vorlage als PNG (`npm run expose -- raster`).

### Was der Vergleich nicht fordert, und warum

| Ausnahme | Grund |
|---|---|
| Platzhaltergrafik in Bildrahmen (884 Schritte) | Der Auftrag sagt ausdrücklich: „Die Bildplatzhalter …, die stilisierten Karten und Grundrisse in den Prototypen sind NUR Platzhalter. Im Produkt kommen dort echte Objektfotos … hin." |
| Text in einem **Zeichnungs**rahmen (Grundriss, Lageplan) | Der gezeichnete Grundriss trägt Raumnamen, die gezeichnete Karte ein Adressschild. Ein hochgeladener Grundriss bringt seine Beschriftung selbst mit. Überall sonst bleibt fehlender Text ein Fehler. |
| Ein Schritt, den ein Prototyp zweimal an dieselbe Stelle zeichnet | Der zweite Strich ist unsichtbar. Eine Vorlage, die ein Element doppelt führt, damit ein Test grün wird, wäre schlechter als der Test. |
| Vier Texte im Buch der begründeten Abweichungen | Dreimal derselbe Tippfehler der Prototypen (`.replace(".", ",")` trifft auch den Punkt in „ca." und „inkl. MwSt."), einmal eine Unterzeile, die eine Aussage über **ein** Objekt macht und als Vorlagenvorgabe für jedes andere eine erfundene Angabe wäre. |

Die Reihenfolge ist dabei entscheidend und war im ersten Anlauf falsch:
**erst zuordnen, dann einstufen.** Der Bildrahmen des Raster-Covers bedeckt
sechzig Prozent der Seite, und darin stehen das weiße Markenfeld, das
Logo, der Markenname und das gedrehte Seitenband — alles tragende
Gestaltung. Wer vor dem Zuordnen alles im Rahmen überspringt, lässt
fünfzehn Schritte der Titelseite ungeprüft und bekommt einen grünen Test,
der nichts weiß.

## Was liegt wo

```
packages/expose-renderer/
  src/           TypeScript-Quelle (Modulsyntax — Quelltext, kein Produktbestandteil)
  vorlagen/      raster.json, signature.json, studio.json, schema.json
  buendel/       immo-expose.js (IIFE für die Oberfläche), immo-expose.mjs (Deno)
  bauen.mjs      erzeugt beide Bündel
assets/fonts/expose/   20 Schnitte, OFL 1.1, erzeugt von scripts/expose-schriften.py
scripts/expose-vorschau.mjs   eine Vorlage als PDF ansehen
```

Die Bündel sind versioniert. Browser und Edge Function bekommen damit
**dasselbe** Paket — das ist die Bedingung dafür, dass die Live-Vorschau
zeigt, was das PDF wird.

## Tore, die daran hängen

Alle Teil von `npm run check`; ohne `reference/` übersprungen, weil die
Prototypen nicht versioniert sind.

| Tor | Was es prüft |
|---|---|
| `scripts/expose-schriften.py --pruefen` | `assets/fonts/expose/` ist byte-genau das, was das Skript erzeugt |
| `tests/expose-schriften.py` | 18 Schnitte stimmen Glyph für Glyph mit den eingebetteten Schriften der Referenz-PDFs |
| `tests/expose-felder.js` | jede Spalte von `immobilien`, `profiles`, `firma_stammdaten` ist Platzhalter oder mit Grund ausgenommen |
| `tests/expose-zufall.js` | der nachgebaute Mersenne-Twister liefert Pythons Folge |
| `tests/expose-breiten.js` | 35 282 Zeilenbreiten gegen `pdfmetrics.stringWidth` |
| `tests/expose-farben.js` | 146 abgeleitete Farben gegen die `theme()`-Funktionen |
| `tests/expose-schema.js` | die Vorlagen halten `schema.json`; Schema und Renderer führen dieselben 19 Elementtypen |
| `tests/expose-seitenlogik.js` | Bedingungen, Wiederholungen, Abweichungen, fehlende Werte, Verdichtung |
| `tests/expose-vorlagen.js` | der Schritt-für-Schritt-Vergleich mit den Prototypen |
| `tests/expose-pdf.js` | aus jeder Vorlage entsteht ein PDF mit Seiten und eingebetteten Schriften |
| `packages/expose-renderer/bauen.mjs --pruefen` | die Bündel entsprechen der Quelle |

## Was aus den Prototypen zurückgerechnet werden musste

**Die Schriften.** Die Prototypen laden `/home/claude/fonts/Jak-*.ttf` —
Dateien, die es nur auf dem Rechner gab, auf dem sie liefen. Welche
Achsenwerte dahinterstanden, stand nirgends, und „Light" ist kein Maß:
Archivo hat zwei Achsen. Die sechs Referenz-PDFs tragen aber die
eingebetteten Schriftprogramme; jede der achtzehn Instanzen ist daraus
zurückgerechnet, Vorschubbreite und Umrissrahmen jedes Glyphs gegen ein
Gitter aus `wght` × `wdth` gestellt, Treffer jeweils 100 %. `Arch-CondXB`
ist damit `wght 800, wdth 62` — die **Untergrenze** der Breitenachse, nicht
die Konvention 75 oder 87,5, die man sonst geraten hätte.

**Die Zufallsfolge.** Zwei Prototypen streuen Platzhaltergrafik mit
`random.Random(saat)`. Die Saat ist eine Zahl, die Folge also fest.
`zufall.ts` baut Pythons Mersenne-Twister nach, 1520 Werte geprüft.

## Felder, die das Schema nicht hatte

Fünf Angaben nennen die Prototypen, und der Fork hatte sie nicht. Sie
stehen jetzt in der Datenbank statt als feste Texte in den Vorlagen —
CLAUDE.md untersagt erfundene Objektdaten, und ein fester Vorlagentext
wäre für jedes andere Objekt genau das.

| Migration | Feld |
|---|---|
| `fork_35` | `immobilien.ortsteil`, `immobilien.modernisierung_jahr`, `profiles.mobil` |
| `fork_36` | `immobilien.expose_energie_hinweis`, `immobilien.laufende_kosten` |

## Bewusst nicht in Version 1

Aus dem Auftrag: freie Seitenformate außer A4, Ebenen-Gruppen mit
Verschachtelung, Masken und Freistellen, Animationen, Mehrbenutzer-
Bearbeitung in Echtzeit, Import von onOffice- oder InDesign-Vorlagen.

Dazu, aus der Umsetzung:

- **Fließender Text über Seitengrenzen.** Eine Seite kann sich je Eintrag
  einer Liste wiederholen (`wiederholen`, „je Grundriss eine Seite"). Dass
  ein zu langer Fließtext selbst eine Folgeseite erzeugt, fehlt noch; er
  wird verdichtet und sonst mit Warnung gekürzt. Für Etappe 3, wenn der
  Editor die Warnung auch anzeigen kann.
- **`ci.font`.** Eine eigene Schrift des Mandanten braucht einen Platz im
  Speicher, eine Lizenzprüfung und eine Fallunterscheidung für fehlende
  Schnitte. Bis dahin wird daraus die Textschrift der Vorlage, und der
  Renderer sagt das als Warnung — er tut nicht so, als wäre die Marke
  berücksichtigt.
- **Die Linie im Kapitelkopf** setzt im Prototyp hinter der Rubrik an, ihre
  Breite hängt also an der Beschriftung. In einer Vorlage mit festen Rahmen
  steht sie an fester Stelle; wird die Rubrik umbenannt, zieht der Nutzer
  die Linie nach.
- **`Arch-SemiCondBold`.** Studio registriert den Schnitt, zeichnet aber nie
  mit ihm. Er steht in keinem Referenz-PDF, seine Breitenachse ist also
  nicht messbar. Geraten wird nichts.

## Was als Nächstes kommt

Etappe 2: `expose-pdf-erzeugen` lädt Vorlage, Abweichungen, Daten, Bilder
und Schriften und ruft den Renderer; Migration `expose_baukasten` mit
`expose_vorlagen`, `expose_vorlagen_versionen`, `immobilien.expose_vorlage_id`,
`immobilien.expose_overrides`, Bucket `expose-assets` und dem Recht
`expose_vorlagen_bearbeiten`.

Die Rechenwerte (`rechnung.*`) kommen dabei aus **einer** Stelle: die
bestehende Edge Function rechnet Grunderwerbsteuer, Notarkosten, Courtage,
Gesamtaufwand, Monatsrate und Rendite schon, und der Renderer bekommt sie
fertig herein. Zwei Rechenwege für denselben Betrag wären zwei Beträge.
