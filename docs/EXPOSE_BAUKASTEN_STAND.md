# Exposé-Baukasten — Stand

> Auftrag: [`PROMPT_immoOffice_Expose_Baukasten.md`](PROMPT_immoOffice_Expose_Baukasten.md),
> darauf aufbauend [`PROMPT_immoOffice_Expose_Vorlagen.md`](PROMPT_immoOffice_Expose_Vorlagen.md).
> Entscheidungen mit Begründung: [`ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md).

| Etappe | Stand |
|---|---|
| 1 — Renderer, Schema, drei Start-Vorlagen | **fertig** |
| 2 — Edge Function und Datenbank auf den Renderer umstellen | **fertig** |
| 3 — Editor Basis | **fertig**: Liste, Kopie, Vorschau, Texte bearbeiten, Felder festlegen |
| 4 — Editor Komfort | teils: Fangen, Raster, Tastatur, Reihenfolge; Rückgängig und Vorschaubilder offen |
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

**Die Schriften liegen in der Funktion.** `supabase/functions/
expose-pdf-erzeugen/schriften.mjs` trägt alle zwanzig Schnitte gepackt und
base64-kodiert; entpackt wird nur, was die Vorlage nennt. Erzeugt von
`scripts/expose-schriften-einbetten.py` aus `assets/fonts/expose/`, geprüft
von `npm run check`.

Vorher gingen sie über den Eimer `branding-assets` und, wenn sie dort
fehlten, über die ausgelieferte Oberfläche; welche Adresse das ist, sagte
`PORTAL_URL`. Am 05.10.2026 hat genau diese Kette gerissen: der Eimer war
leer, keiner der beiden Werte stand im Projekt, und die Funktion brach beim
ersten Schnitt ab („Die Schrift Jak-Light fehlt …"). Es betraf nicht einen
Schnitt, sondern alle zwanzig — der genannte ist nur der erste, den die
Vorlage braucht. Drei Dinge, die zusammenpassen müssen — eine
Umgebungsvariable, eine Auslieferung, ein Eimerinhalt —, sind eine
Verkettung zu viel für etwas, das 395 KiB wiegt und sich mitliefern lässt.
Von der Google-Quelle kann es ohnehin nicht kommen: die Schnitte sind
zurückgerechnete, verkleinerte Instanzen.

`scripts/bauen.py` legt sie weiterhin nach `dist/schriften/expose/` — die
**Vorschau im Editor** zeichnet im Browser und holt sie von dort. Das PDF
braucht die Auslieferung nicht mehr.

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

**Ausgerollt am 05.10.2026.** Die Migrationen `fork_37` bis `fork_41` liegen
auf `usguiggfciavwzkdfjgt`, die 121 Edge Functions sind über
`funktionen-ausrollen.yml` ausgerollt (Lauf 54), und die Oberfläche steht in
Produktion auf `immoofficeeai.netlify.app`. Der Workflow sieht jetzt selbst
nach, was angekommen ist: Seite, zwei Schriftschnitte, ein Lizenztext und
`freigabe.html`, alle mit 200 beantwortet.

`expose-pdf-erzeugen` mit den eingebetteten Schriften ist mit Lauf 59
nachgezogen worden, Fassung 53 um 20:53 Uhr. Nachgeprüft nicht am Lauf,
sondern am Projekt: alle drei Dateien liegen dort byte-genau so, wie sie im
Repository stehen (`index.ts` 50.165, `immo-expose.mjs` 150.846,
`schriften.mjs` 590.196 Zeichen, zwanzig Schnitte), und `index.ts` nennt
`schriften.mjs` statt einer Webadresse.

Vier Läufe davor sind ohne einen einzigen Schritt gestorben — „The job was
not acquired by Runner of type hosted even after multiple attempts". Kein
Fehler am Inhalt: GitHub gab dem Konto zwischen 19:51 und 20:52 Uhr keine
Maschine, auch nicht für einen reinen Prüf-Lauf. Ausrollen von der
Arbeitsumgebung aus ist keine Ausweichmöglichkeit: der Netzfilter beantwortet
`api.supabase.com` **und** `usguiggfciavwzkdfjgt.supabase.co` mit 403.

Dass beim Ausrollen ein echtes Objekt im Projekt stand, hat gleich einen
Fehler gezeigt, den kein Test finden konnte: seine `vertragsart` ist
`verkauf`, und die Kostenseite prüfte auf `kauf`. Siehe
`ENTSCHEIDUNGEN.md`, „Die Vermarktungsart steht zweimal in den Daten".

Offen und nicht vergessen:

- **Das erste Exposé im Betrieb ist noch nicht erzeugt.** Die beiden
  Versuche vom 05.10.2026 um 19:42 und 19:44 Uhr stehen in `expose_debug`:
  `start → auto-befuellung-ok → vorbereitung-ok → vorlage-ok` („Raster 10
  Seiten", „Signature (Kopie) 12 Seiten") — und dann nichts mehr, weil die
  Schriften fehlten. Seit Fassung 53 trägt die Funktion sie selbst. Ein
  Klick im Betrieb muss das bestätigen; zu sehen ist es an `schriften-ok`
  und `pdf-fertig` in `expose_debug`. Von der Arbeitsumgebung aus lässt sich
  die Funktion nicht rufen: sie verlangt ein JWT oder den Kopf
  `x-diagnose-secret`, und das Geheimnis `diagnose_secret` liegt im Projekt
  nicht im Vault. Dafür eines anzulegen heißt, die Exposé-Erzeugung ohne
  Anmeldung zu öffnen — das ist eine Abkürzung, die eine Prüfung nicht wert
  ist.
- **Die Bildunterschriften** der Fotos (`immobilie_datei.titel`) stehen noch
  nicht im Exposé. Die Vorlagen führen die Beschriftung als Text am
  Bildelement; sie gehört ans Bild, und das heißt: als Abweichung am
  Objekt, die der Editor schreibt (Etappe 5).

## Was zwei echte Exposés gezeigt haben (06.10.2026)

Der erste Betrieb lieferte zwei PDFs, und mit ihnen drei Sätze: „Man kann
manche Überschriften nicht bearbeiten, die Logos müssen richtig angezeigt
werden, manche überschneiden sich auch." Dahinter standen fünf Fehler, jeder
mit vielen Fundstellen. Alle fünf sind behoben; die Begründungen stehen in
[`ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md).

| Befund | Wo es sichtbar war | Was jetzt gilt |
|---|---|---|
| Ein Text entfiel ganz, sobald ein Platzhalter leer war | Fußzeile auf 9 Seiten, Seitenkopf auf 6 | Nur der Abschnitt ohne Wert entfällt, mit seinem Trenner |
| Ein Einzeiler lief über seinen Rahmen | Markenname quer über dem Titelbild | Verkleinern bis zur Mindestgröße, dann Warnung |
| Das Logo wurde nirgends gezeigt | Studio und Signature hatten kein Logo-Element | Logo-Element in allen drei Vorlagen, sichtbar nur mit Logo |
| Die weiße Logo-Fassung wurde unter festem Namen gesucht | dunkle Seiten ohne Logo | Pfad des Mandanten, Zwischenspeicher am Pfad |
| Die zweite Mandantenfarbe war hell, die Rolle „dunkel" | weiße Schrift auf hellgrau | Wird abgedunkelt, wenn sie hell ist |
| Vorlagen behaupteten Objektdaten | „SEETERRASSE" unter einem Schlafzimmer | Unterschriften aus `immobilie_datei.titel`, neutrale Kapitelzeilen |
| Überschriften waren nicht änderbar | jede feste Zeile der Vorlage | Textliste je Seite, Vorschau mit Entwurf, Historie beim Speichern |

Dazu, aus demselben Befund: die Initiale nur noch bei einem Absatz mit drei
Zeilen; das Baujahr ohne Tausenderpunkt; Überschriften entfallen mit ihrem
Block; die Grundriss-Seite entfällt ohne Grundriss; Kennwert und
Effizienzklasse melden sich, wenn sie sich widersprechen.

**Das Werkzeug dazu:** `scripts/expose-probe.mjs` rendert alle drei Vorlagen
mit nachgebauten Daten eines **dünn gepflegten** Objekts — Eckdaten ja,
Beschreibung ein Satz, keine Grundrisse, keine Highlights, langer
Markenname. Genau das konnte `scripts/expose-vorschau.mjs` nicht zeigen,
weil in den Demodaten der Prototypen jedes Feld steht. Beim ersten Lauf 55
Warnungen, jetzt 38 — und die übrigen sind ehrliche Hinweise auf fehlende
Angaben, keine Fehler.

## Felder festlegen (06.10.2026)

> „Wir brauchen einen Editor, wo man die Text- und Bildfelder selber
> festlegt."

Die Flächenansicht in [`src/eigene/expose-bearbeiten.js`](../src/eigene/expose-bearbeiten.js)
zeigt eine Seite der Vorlage in Originalgestalt, jedes Feld als Rahmen
darauf. Was damit geht:

- **anfassen und verschieben**, an acht Griffen größer ziehen;
- **Pfeiltasten** um einen Punkt, mit Umschalt um zehn;
- **Maße als Zahl** eintragen (x, y, Breite, Höhe);
- **Einrasten** an den Kanten der Nachbarn und am Satzspiegel, Alt schaltet
  es aus;
- **neue Text- und Bildfelder** anlegen, verdoppeln, in der Reihenfolge
  schieben, löschen;
- bei einem Bildfeld sagen, **welches** Bild es zeigt — Foto nach Nummer,
  nach Kategorie, Grundriss, Lageplan, Porträt, Logo hell oder dunkel — und
  ob es den Rahmen füllt oder ganz hineinpasst;
- bei einem Textfeld den Text und den Textstil wählen.

**Gesperrte Felder** bleiben gesperrt: sie tragen die Gestaltung der Seite
(die Farbfläche des Covers, das Band am Rand). Die Sperre lässt sich
aufheben, aber nicht aus Versehen.

**Gemalt** wird mit [`src/eigene/expose-leinwand.js`](../src/eigene/expose-leinwand.js)
aus derselben Schrittliste, die auch ins PDF geht —
`packages/expose-renderer/src/schritte.ts` nennt genau das als zweiten
Grund für die Schrittliste. Es gibt also keine zweite Fassung der Seite,
die auseinanderlaufen könnte. Die Schriften werden dafür zusätzlich als
Webschrift angemeldet; es sind dieselben Dateien, die schon für die Maße
geladen werden.

**Geprüft** wird beides: `tests/expose-editor.js` zieht ein Feld wirklich
(Zeigerereignisse am Fenster, wie im Browser) und misst das Ergebnis am
gespeicherten Dokument; `tests/expose-leinwand.js` öffnet Chromium, lässt
alle drei Vorlagen zeichnen und sieht nach, ob Farbe auf dem Blatt liegt
und ob die eingebettete Schrift benutzt wurde.

**Offen bleibt:** Rückgängig (bisher nur „Verwerfen" für alles),
Vorschaubilder der Seiten statt einer Auswahlliste, mehrere Felder
zugleich auswählen, Bedingungen (`sichtbar_wenn`) im Editor ändern — und
der Objektmodus, in dem dieselbe Fläche die Abweichungen EINES Objekts
bearbeitet statt der Vorlage (Etappe 5).
