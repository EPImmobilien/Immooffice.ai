# Social-Media-Beiträge aus dem Objekt

Stand 06.10.2026. Der Betreiber hat drei Entwurfssätze geliefert — Raster,
Signature und Studio, dieselben drei Handschriften wie beim Exposé-Baukasten.

## Was gebaut wurde — und was nicht

Die Entwürfe sind **nicht als Bilder nachgebaut**, sondern in dieselbe Sprache
übersetzt, in der auch die Exposé-Vorlagen stehen: ein JSON-Dokument mit
Format, Stil und Seiten, gezeichnet vom vorhandenen Renderer.

Das hat einen Preis und einen Gewinn. Der Preis: einzelne Feinheiten der
Entwürfe (ein Farbverlauf hier, ein Buchstabenabstand dort) sind
Annäherungen. Der Gewinn: die Beiträge tragen die **CI des Mandanten**, sein
**Logo** und seine **echten Objektdaten**, sie lassen sich im vorhandenen
Editor ändern, und sie zeigen in der Vorschau dasselbe wie im Export — weil
es dieselbe Schrittliste ist.

## Die sechs Vorlagen

| Datei | Format | Seiten |
|---|---|---|
| `social-{raster,signature,studio}-feed.json` | 540 × 675 pt (1080 × 1350 px) | Neu im Angebot · Verkauft · vier Karussellseiten |
| `social-{raster,signature,studio}-story.json` | 540 × 960 pt (1080 × 1920 px) | Neu im Angebot · Verkauft |
| `social-{raster,signature,studio}-quadrat.json` | 540 × 540 pt (1080 × 1080 px) | Neu im Angebot · Verkauft |

Das Quadrat ist kein vierter Entwurf, sondern der Beitrag gestaucht: alles
oberhalb der Textzone rückt nach, das Foto wird flacher. Ränder,
Schriftgrößen und Abstände bleiben die des Entwurfs.

Zwei Pixel je Punkt — Instagram rechnet in Pixeln, der Baukasten in Punkten.

Erzeugt werden sie von `scripts/social-vorlagen.py` aus **einer**
Beschreibung: die drei Handschriften teilen sich die Rechnung (Ränder,
Rasterschritte, Bildkästen), nicht das Aussehen. Von Hand liefen sie beim
ersten Nachziehen auseinander.

`scripts/social-systemvorlagen.py` erzeugt daraus die Migration. `npm run
check` hält beide Skripte, die sechs JSON-Dateien und die Migration
zusammen — wer eine Datei von Hand ändert, fällt auf.

## Wo sie liegen

In `expose_vorlagen`, derselben Tabelle wie die Exposé-Vorlagen. Es ist
dasselbe Dokumentformat und derselbe Renderer; zwei Tabellen wären zwei
Stellen, an denen derselbe Fehler zu beheben wäre. Unterschieden werden sie
über die Spalte `art` (`expose` | `social`), und beide Auswahllisten filtern
danach.

Eine Kopie behält ihre Art. Ohne das landete die Kopie einer Social-Vorlage
in der Exposé-Liste — mit 540 × 675 Punkten Format.

## In der Anwendung

Marketing → **Social aus dem Objekt**: Objekt wählen, Handschrift wählen,
ansehen, als PNG speichern. Die alten Marketing-Vorlagen bleiben daneben;
sie arbeiten auf **Bildern** (zuschneiden, Text darüberlegen), die neuen auf
**Daten**. Wer ein Foto beschriften will, will keine Kennzahlleiste.

Drei Zusagen, die `tests/social.js` festhält:

- **Es wird nichts erfunden.** Jede Zahl kommt aus dem Objekt; fehlt eine,
  bleibt die Stelle leer, und die Tafel sagt, wie viele fehlen. Ein Beitrag,
  der eine Wohnfläche dazudichtet, wäre Werbung mit falschen Angaben.
- **Es kostet keine Credits.** Hier entsteht nichts durch KI, sondern
  dasselbe Dokument in anderem Format — `CLAUDE.md` zählt den Export
  bestehender Inhalte ausdrücklich zu den kostenfreien Aktionen.
- **Nichts wird hochgeladen.** Die Bilder entstehen im Browser.

## Was dabei aufgefallen ist

Drei Dinge, die man nicht errät und die ohne Zeichnen niemand gefunden hätte:

1. **Der Trenner einer Kennzahlleiste muss aus der Palette der jeweiligen
   Handschrift kommen.** „line" gibt es nur bei Raster; bei Studio heißt
   dieselbe Farbe „rule". Ein unbekannter Name ließ das ganze Element ohne
   Text liegen — der Balken stand da, die Zahlen fehlten, und es sah aus wie
   ein Objekt ohne Daten.
2. **Der obere Rand eines Textkastens ist die Grundlinie der ersten Zeile**,
   nicht ihre Oberkante. Die Versalhöhe steht darüber; bei 52 pt sind das
   rund 38 pt, und die Umlautpunkte ragten in die Pille darüber.
3. **Was einzeilig nicht in seinen Kasten passt, lässt der Renderer weg.**
   Die Signature-Wortmarke stand deshalb nirgends.

Dazu ein Fehler, der auch **jedes Exposé** betraf: `objekt.objekttitel` blieb
leer, wenn nur `bezeichnung` gepflegt war und die Spalte `objekttitel` nicht.
An der größten Stelle der Seite stand dann nichts. Der Renderer fällt jetzt
auf die Bezeichnung zurück.

## Die Bildunterschrift

Unter der Vorschau steht ein Knopf, der einen Beitragstext vorschlägt —
über `generate-text`, textart `instagram_caption` (oder
`instagram_caption_verkauft`). Zwei Dinge sind daran keine
Gestaltungsfrage:

- **Das Bild kostet nichts, der Text schon.** Hier erzeugt die KI etwas, und
  dafür gelten dieselben Credits wie überall. Der Knopf sagt es, bevor er
  gedrückt wird; eine Überraschung auf der Abrechnung wäre schlimmer als ein
  Satz mehr auf dem Knopf.
- **Vorgeschlagen, nicht veröffentlicht.** Der Text steht in einem Feld, das
  sich ändern lässt, und wird nirgendwohin geschickt. CLAUDE.md: alle
  KI-Texte editierbar und freigabepflichtig. Den Hinweis auf die
  KI-Erzeugung hängt `generate-text` selbst an.

## Was noch fehlt

- **Direkt veröffentlichen.** Die Bilder werden heruntergeladen und von Hand
  hochgeladen. Eine Anbindung an Meta oder LinkedIn ist eine eigene
  Entscheidung mit eigenen Zugangsdaten.
- **Querformat.** 1200 × 630 für geteilte Links fehlt; im Erzeuger ist das
  ein weiterer Eintrag.
