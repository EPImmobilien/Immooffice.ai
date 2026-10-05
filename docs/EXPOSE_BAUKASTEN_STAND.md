# Exposé-Baukasten — Stand

> Auftrag: [`PROMPT_immoOffice_Expose_Baukasten.md`](PROMPT_immoOffice_Expose_Baukasten.md),
> darauf aufbauend [`PROMPT_immoOffice_Expose_Vorlagen.md`](PROMPT_immoOffice_Expose_Vorlagen.md).
> Entscheidungen mit Begründung: [`ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md).

| Etappe | Stand |
|---|---|
| 1 — Renderer, Schema, drei Start-Vorlagen | **fertig** |
| 2 — Edge Function und Datenbank auf den Renderer umstellen | **fertig** |
| 3 — Editor Basis | Liste, Kopie und Vorschau fertig; Element-Editor offen |
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
| `packages/expose-renderer/bauen.mjs --pruefen` | die Bündel entsprechen der Quelle, auch die Kopie im Ordner der Edge Function |
| `tests/expose-aufbereiten.js` | aus vollständigen Datenbankzeilen kommt jeder der 169 Platzhalter an, aus leeren keiner |
| `scripts/expose-systemvorlagen.py --pruefen` | die Migration spielt genau die drei JSON-Vorlagen ein |
| `tests/expose-funktion.js` | der Handler der Edge Function läuft wirklich durch — ohne Deno, ohne Netz, mit nachgebautem Supabase |

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
| `fork_39` | `firma_stammdaten.marken_linie` (zweite Markenzeile der Luxusvorlage) |

Eine Angabe hat **keine** Quelle und bekommt auch keine: `objekt.seeufer_meter`,
die Besonderheit „eigenes Seeufer, 80 m" aus den Demodaten der Luxusvorlage.
Eine Spalte dafür hieße, sie für jedes andere Objekt leer mitzuschleppen. Die
Kennzahl entfällt, bis der Editor eigene Kennzahlen am Objekt erlaubt
(Etappe 5). `tests/expose-aufbereiten.js` führt sie mit diesem Grund.

## Was Etappe 2 gebracht hat

**Eine Vorlage ist ab jetzt ein Dokument in der Datenbank.** `fork_37` legt
`expose_vorlagen` an, `fork_38` spielt die drei Systemvorlagen ein — erzeugt
von `scripts/expose-systemvorlagen.py` aus den JSON-Dateien, damit es nicht
zwei Fassungen derselben Vorlage gibt.

Systemvorlagen tragen `mandant_id = null`: für alle lesbar, über RLS für
niemanden schreibbar, auch nicht für einen Chef. Das Recht
`expose_vorlagen_bearbeiten` steht in der Sperrliste von `hat_recht()` — wer
die Hausvorlage ändert, ändert sie für jedes künftige Exposé des Hauses.

**Die Edge Function zeichnet nicht mehr selbst.** Statt siebenhundert Zeilen
Querformat lädt `expose-pdf-erzeugen` die Vorlage, sammelt Daten, Bilder und
Schriften und ruft `packages/expose-renderer`. Die Vorlage wird in drei
Stufen gesucht: die des Objekts, sonst die Standardvorlage des Mandanten,
sonst die Systemvorlage, die der Standort nennt. Eine Vorlage eines fremden
Mandanten gilt nicht, auch wenn sie am Objekt steht.

**Die Übersetzung zwischen Datenbank und Renderer steht im Paket**
(`aufbereiten.ts`, `rechnen.ts`), nicht in der Edge Function: der Editor
braucht sie genauso, und zwei Übersetzungen wären zwei Exposés. Die
Spaltenwerte kopiert sie aus dem Feldkatalog, nicht von Hand — eine neue
Spalte kann damit nicht im Katalog stehen und in der Übersetzung fehlen.

**KI-bearbeitete Bilder tragen im PDF das Schild „MIT KI BEARBEITET".**
Welche Bilder das sind, sagen die Daten, nicht die Vorlage: eine
Pflichtkennzeichnung, die der Vorlagenautor ansprechen und damit abschalten
kann, ist keine.

**Die Schriften gehen über die Auslieferung.** `scripts/bauen.py` legt sie
nach `dist/schriften/expose/`; von dort holt die Edge Function eine fehlende
Schrift einmal nach und legt sie im Eimer ab (dafür braucht sie `PORTAL_URL`).
Von der Google-Quelle kann sie nicht kommen — die Schnitte sind
zurückgerechnete, verkleinerte Instanzen.

Dass es wirklich läuft, prüft `tests/expose-funktion.js`: der echte Handler,
ohne Deno und ohne Netz, mit nachgebautem Supabase. Aus einem vollständigen
Objekt entstehen zehn Seiten und 123 KB, aus einem mageren weniger, und alle
drei Systemvorlagen kommen durch. Gefunden hat der Test gleich einen Fehler:
die Rahmenprüfung meldete jedes gedrehte Seitenband als „reicht über die
Seite hinaus".

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

## Was Etappe 3 bisher gebracht hat

**Einen Ort für eigene Oberfläche.** `src/eigene/` wird von
`scripts/oberflaeche-zerlegen.py` nicht angefasst — wie `src/seiten/` — und
von `scripts/bauen.py` als eigener `<script>`-Block in `dist/index.html`
eingesetzt, zusammen mit dem Renderer-Bündel. Eingebettet und nicht als
zweite Datei: Anwendung und Renderer können so nicht in verschiedenen
Fassungen im Zwischenspeicher eines Browsers liegen, und die Auslieferung
bleibt die eine `index.html`, die der Auftrag verlangt.

**Den Bereich „Exposé-Vorlagen".** Systemvorlagen und eigene in einer Liste,
Kopie anlegen, umbenennen, Standard setzen, archivieren. Die Vorschau zeichnet
**derselbe Renderer**, den die Edge Function benutzt — damit können Vorschau
und Ergebnis nicht auseinanderlaufen. Die Werte sind Beispiele und heißen auch
so; die Marke des Mandanten wird übernommen, damit man seine Farben sieht.

Angemeldet ist der Bereich über vier Regeln in `oberflaeche-zerlegen.py`:
Ansichtentafel, Kachel, Rechteprüfung (`expose_vorlagen_bearbeiten`) und
fontkit in den Bibliotheken.

`tests/expose-editor.js` führt die Ansicht wirklich aus: gegen ein winziges
React, aber mit echtem Bündel, echtem pdf-lib und den ausgelieferten
Schriften. Aus der Hausvorlage entsteht ein PDF mit zehn Seiten.

Noch nicht da: Seiten und Elemente verschieben, Eigenschaftenleiste,
Rückgängig, Vorschaubilder in der Liste, Fassungen zurückholen.

## Was als Nächstes kommt

Der Element-Editor: Seiten und Elemente auswählen, verschieben und ändern,
Eigenschaftenleiste, Speichern mit Fassung in `expose_vorlagen_versionen`.

Offen und nicht vergessen:

- **Ausgerollt ist noch nichts.** `fork_37`, `fork_38` und `fork_39` liegen
  auf `usguiggfciavwzkdfjgt`, die Edge Function und die Oberfläche müssen
  noch über die beiden GitHub-Workflows hinaus. Vor dem ersten Exposé im
  Betrieb muss `PORTAL_URL` in der Supabase-Umgebung stehen, sonst findet
  die Funktion die Schriften nicht.
- **Die Bildunterschriften** der Fotos (`immobilie_datei.titel`) stehen noch
  nicht im Exposé. Die Vorlagen führen die Beschriftung als Text am
  Bildelement; sie gehört ans Bild, und das heißt: als Abweichung am
  Objekt, die der Editor schreibt (Etappe 5).
