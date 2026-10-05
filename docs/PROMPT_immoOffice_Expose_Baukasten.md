# Auftrag: Exposé-Baukasten für immoOffice.ai

> Wortlaut des Auftrags vom 05.10.2026, unverändert übernommen. Er baut auf
> [`PROMPT_immoOffice_Expose_Vorlagen.md`](PROMPT_immoOffice_Expose_Vorlagen.md)
> auf; wo sich beide widersprechen, gilt dieser. Stand der Umsetzung:
> [`EXPOSE_BAUKASTEN_STAND.md`](EXPOSE_BAUKASTEN_STAND.md).

Arbeite autonom, ohne Rückfragen (siehe docs/AUTONOMIE.md). Halte dich an docs/NEUTRALITAET.md: nirgends „Engfer“, „E&P“ oder E&P-Daten.
Dieser Auftrag baut auf `docs/PROMPT_immoOffice_Expose_Vorlagen.md` auf. Ist der noch nicht umgesetzt, setze beide zusammen um. Wo sie sich widersprechen, gilt dieser Auftrag. Die drei Vorlagen „Raster“, „Signature“ und „Studio“ werden hier nicht mehr hart codiert, sondern als Baukasten-Vorlagen (JSON) abgebildet.
Ziel
Jeder immoOffice-Mandant kann seine Exposés selbst gestalten, ähnlich dem Exposé-Editor von onOffice, aber einfacher zu bedienen:

* Er startet von einer der drei Vorlagen, dupliziert sie und passt sie an.
* Er stellt Seiten aus einer Seitenbibliothek zusammen, sortiert sie per Drag & Drop, blendet sie aus.
* Auf jeder Seite kann er Elemente verschieben, in der Größe ändern, hinzufügen und löschen.
* Texte enthalten Platzhalter für Objektdaten (z. B. `{{objekt.wohnflaeche}}`), die beim Erzeugen automatisch befüllt werden.
* Farben, Schriften und Logo kommen aus dem Mandanten-Branding, können je Vorlage überschrieben werden.
* Er sieht beim Bearbeiten eine Live-Vorschau mit echten Daten eines wählbaren Objekts.

Leitgedanke: Ein Makler ohne Designkenntnisse muss in 10 Minuten ein ordentliches Exposé bauen können. Darum gibt es Raster, Hilfslinien, Einrasten, Stilvorgaben aus der Vorlage und Sperren für tragende Elemente. Völlig freies Gestalten ist möglich, aber nicht der Standardweg.
Grundsatzentscheidungen (verbindlich)

1. Eine Vorlage ist ein JSON-Dokument. Kein HTML, kein Code. Schema siehe unten. Die Vorlage beschreibt Seitentypen, Elemente, Positionen in Punkt (A4 = 595,28 × 841,89), Stile und Datenbindungen.
2. Ein Renderer für alles. Ein TypeScript-Paket `packages/expose-renderer` (pdf-lib + fontkit) nimmt Vorlage + Daten + Branding und liefert ein PDF. Dasselbe Paket läuft:
   * im Browser für die Live-Vorschau (PDF erzeugen → mit pdf.js auf Canvas zeichnen),
   * in der Edge Function `expose-pdf-erzeugen` für das endgültige PDF. So sehen Vorschau und Ergebnis garantiert gleich aus.
3. Der Editor zeichnet nicht selbst ins PDF. Die Arbeitsfläche ist eine HTML/SVG-Ebene mit den Element-Rahmen über dem gerenderten Vorschau-Canvas. Beim Bearbeiten wird nur das JSON geändert, der Renderer zeichnet neu (entprellt, ca. 300 ms; nur die aktive Seite sofort, Rest im Hintergrund).
4. Dynamische Inhalte wachsen nicht frei. Jedes Element hat einen festen Rahmen. Text, der nicht passt, wird stufenweise verdichtet (Zeilenabstand, dann Schriftgröße bis zur Untergrenze), sonst gekürzt mit Warnung im Editor. Ausnahme: Seiten vom Typ „Fließseite“ (siehe unten) dürfen Folgeseiten erzeugen.
5. Datenbedingte Sichtbarkeit. Jedes Element und jede Seite kann eine Bedingung haben (`sichtbar_wenn`), z. B. nur bei Kauf, nur wenn Grundrisse vorhanden. Seiten ohne Pflichtdaten entfallen automatisch, Seitenzahlen und Inhaltsverzeichnis passen sich an.

Datenmodell (Migration `expose_baukasten`)
Tabelle `expose_vorlagen`:

* `id uuid pk`, `firma_id uuid` (null = System-Vorlage, für alle lesbar, nur Plattform-Admin schreibt), `name text`, `beschreibung text`
* `basis text` ('raster' | 'signature' | 'studio' | 'leer')
* `dokument jsonb` (die Vorlage, siehe Schema)
* `version int`, `ist_standard boolean` (je Firma höchstens eine), `archiviert boolean default false`
* `vorschaubild_pfad text` (PNG der ersten Seite, nach dem Speichern erzeugt)
* `erstellt_von`, `erstellt_am`, `geaendert_am`

Tabelle `expose_vorlagen_versionen`: jede Speicherung als Kopie (`vorlage_id`, `version`, `dokument`, `geaendert_von`, `geaendert_am`), die letzten 30 je Vorlage behalten. Im Editor: „Versionen“ mit Wiederherstellen.
An `immobilien`: `expose_vorlage_id uuid` (Override je Objekt), `expose_overrides jsonb` (objektbezogene Abweichungen: ausgeblendete Seiten, ersetzte Bilder je Bildslot, abweichende Texte je Textelement — die Vorlage selbst bleibt unverändert).
RLS: Lesen/Schreiben nur eigene `firma_id`; System-Vorlagen nur lesen. Bearbeiten von Firmen-Vorlagen über das Recht `expose_vorlagen_bearbeiten` im bestehenden Rechte-System (Standard: nur Rolle `chef`).
Assets: Bucket `expose-assets` (Ordner je `firma_id`) für eigene Grafiken, Hintergründe, Icons. Upload im Editor.
Vorlagen-Schema (TypeScript-Typen in `packages/expose-renderer/src/schema.ts`, dazu JSON-Schema zur Validierung)

```ts
type Vorlage = {
  schema: 1;
  format: { breite: 595.28; hoehe: 841.89; ausrichtung: "hoch" | "quer" };
  stil: {
    farben: { f1: Farbe; f2: Farbe; ableitung: "raster" | "signature" | "studio" }; // Farbe = Hex oder "ci.primaer"/"ci.akzent"
    schriften: { headline: SchriftRef; text: SchriftRef; label: SchriftRef };   // SchriftRef = System-Schrift oder "ci.font"
    textstile: Record<string, TextStil>;  // z. B. "h1","h2","fliesstext","label","zahl_gross"
    raster: { spalten: 12; rand: number; abstand: number };
    seitenfuss?: ElementGruppe;           // auf allen Seiten außer denen mit ohne_fuss
  };
  seiten: Seite[];
};

type Seite = {
  id: string;
  typ: SeitenTyp;          // siehe Seitenbibliothek
  name: string;
  hintergrund?: Fuellung;  // Farbe aus Palette, Bildslot oder Asset
  ohne_fuss?: boolean;
  sichtbar_wenn?: Bedingung;
  fliessend?: boolean;     // darf Folgeseiten erzeugen (nur für Text-/Tabellen-/Galerie-Seiten)
  elemente: Element[];
};

type Element = {
  id: string; typ: ElementTyp;
  x: number; y: number; b: number; h: number; drehung?: 0 | 90 | 270;
  gesperrt?: boolean;       // vom Vorlagenautor gesperrt: nicht verschiebbar/löschbar
  sichtbar_wenn?: Bedingung;
  // je Typ weitere Felder, z. B. text/stil/bindung/eckradius/deckkraft/rahmen
};

```

Elementtypen (Version 1):

* `text` — Freitext mit Platzhaltern, Textstil, Ausrichtung, Blocksatz, Spalten (1–3), Verdichtung
* `datenfeld` — ein einzelner gebundener Wert mit Label (z. B. Wohnfläche), Format (Zahl, m², €, Datum)
* `kennzahl` — große Zahl + Einheit + Label (wie „Das Anwesen in Zahlen“)
* `faktentabelle` — Liste gebundener Felder, vom Nutzer auswählbar und sortierbar, Stil: Zebra / Punktlinie / Linie
* `bild` — Bildslot: Titelbild, Foto Nr. n, Foto nach Kategorie/Tag, Grundriss n, Lageplan, Ansprechpartner-Foto, Logo hell/dunkel, eigenes Asset; Füllmodus cover/contain; Eckradius; optionaler Bildlabel
* `galerie` — Raster aus Bildslots (Layouts: 1+2, 2×2, 1 groß + 2 klein, Mosaik), füllt die nächsten freien Fotos
* `form` — Rechteck, Linie, Kreis, mit Palettenfarbe, Deckkraft, Verlauf (Scrim)
* `highlights` — 3–6 Highlights aus `expose_highlights`, Darstellung Karten / nummerierte Liste
* `ausstattung` — Ausstattungspunkte, Darstellung Checkliste / Gruppen / nummeriert
* `distanzen` — Entfernungen, Darstellung Balken / Punktlinie / Wegezeiten-Tabelle
* `energieskala` — Darstellung Ampel / Ton-in-Ton / Balken, mit Markierung
* `kostenrechnung` — Nebenkosten, Gesamtaufwand, optional Monatsrate (Annahmen aus `finanzierungs_annahmen`)
* `rendite` — Brutto/Netto/Faktor als Kacheln
* `raumliste` — aus `raumaufteilung`, mit Summe
* `karte` — Lageplan (generiert, Ausschnitt wie in der Objektseite gewählt)
* `qr` — Link auf Web-Exposé / Website / freie URL
* `kontaktkarte` — Ansprechpartner (Foto, Name, Titel, Rolle, Kontakte)
* `inhaltsverzeichnis` — automatisch aus den sichtbaren Seiten
* `rechtstext` — Widerrufsbelehrung, Widerrufsformular, Impressum, Provisionshinweis aus den Vertragsvorlagen des Mandanten

Platzhalter: `{{objekt.*}}`, `{{ansprechpartner.*}}`, `{{firma.*}}`, `{{rechnung.*}}` (berechnete Werte wie Gesamtaufwand, Monatsrate), `{{seite.nummer}}`, `{{seite.gesamt}}`, `{{datum}}`. Die vollständige Liste generierst du aus dem tatsächlichen Schema (`immobilien`, `profiles`, `firma_stammdaten`) in `packages/expose-renderer/src/felder.ts` mit deutschem Anzeigenamen, Typ und Formatierung. Fehlende Werte: Element/Zeile entfällt, kein „null“ und keine leeren Labels im PDF.
Bedingungen: einfache Ausdrücke als JSON, z. B. `{"feld":"objekt.vermarktungsart","gleich":"kauf"}`, `{"vorhanden":"grundrisse"}`, `{"und":[…]}`, `{"nicht":…}`. Kein freier Code.
Seitenbibliothek
Fertige Seitentypen mit sinnvoller Standardbelegung, aus denen der Nutzer neue Seiten einfügt (in jedem der drei Stile vorhanden):
Cover · Inhalt & Ansprechpartner · Auf einen Blick · Objektbeschreibung · Ausstattung · Bildseite (5 Layouts) · Grundriss (je Grundriss eine Seite, fließend) · Lage mit Karte · Energie · Kosten & Finanzierung · Kapitalanlage · Kontakt · Rechtliches (Widerruf + Formular) · Leere Seite
Die drei Start-Vorlagen Raster, Signature und Studio werden als System-Vorlagen aus diesen Seitentypen zusammengesetzt und müssen optisch den Referenz-PDFs in `reference/expose-vorlagen/` entsprechen (Abnahmekriterium, siehe unten).
Editor (Seite „Exposé-Vorlagen“ unter Einstellungen bzw. Marketing)
Aufbau:

* Links: Seitenleiste mit Miniaturen aller Seiten, Drag & Drop zum Sortieren, Augen-Symbol zum Ausblenden, „+ Seite“ öffnet die Seitenbibliothek, Rechtsklick: Duplizieren / Löschen / Bedingung.
* Mitte: Arbeitsfläche mit der aktuellen Seite, Zoom (Seite einpassen / 100 % / 200 %), Rasterlinien und magnetische Hilfslinien (Seitenrand, Mitte, Kanten anderer Elemente), Mehrfachauswahl, Pfeiltasten verschieben (Shift = 10 pt), Strg+Z/Strg+Y (Undo-Verlauf mind. 50 Schritte), Strg+C/V, Entf, Ebenen nach vorn/hinten.
* Rechts: Eigenschaften des gewählten Elements (Position/Größe in mm, Stil, Bindung, Bedingung) bzw. bei keiner Auswahl der Seite; Reiter „Stil“ für Vorlagen-Farben, Schriften und Textstile.
* Oben: Vorlagenname, Objekt für die Vorschau wählen (Standard: Demo-Objekt), „Vorschau als PDF“, „Speichern“, „Als Standard festlegen“, „Versionen“.

Bedienregeln:

* Gesperrte Elemente einer System-Vorlage bleiben auch in der Kopie gesperrt, bis der Nutzer sie mit „Entsperren“ ausdrücklich freigibt.
* Textstile statt Einzelformatierung: Der Nutzer wählt „Überschrift“, „Fließtext“ usw.; Abweichungen (Größe, Farbe) sind möglich, werden aber als Überschreibung markiert und lassen sich zurücksetzen.
* Farbwahl nur aus der Vorlagenpalette (f1, f2 und deren berechnete Abstufungen, Weiß, Schwarz). Freie Hex-Farbe nur über „Eigene Farbe“.
* Kontrastwarnung, wenn Text auf Fläche unter WCAG 3:1 (große Schrift) bzw. 4,5:1 fällt.
* Autosave als Entwurf alle 30 s, aber erst „Speichern“ erzeugt eine neue Version und wirkt auf neue Exposés.
* Desktop-Pflicht: Editor ab 1280 px Breite; darunter Hinweis und nur Seitenreihenfolge/Sichtbarkeit bearbeitbar.

Objekt-Ebene (Exposé-Reiter der Objektseite)

* Auswahl der Vorlage (Standard der Firma vorausgewählt).
* „Für dieses Objekt anpassen“: öffnet den Editor im Objektmodus. Hier ändert der Nutzer nur Inhalte, nicht das Layout: Seiten ein-/ausblenden, Bild je Slot tauschen (aus den Objektfotos), Texte je Textelement überschreiben. Gespeichert in `immobilien.expose_overrides`. Wird die Vorlage später geändert, bleiben die Overrides erhalten, soweit Seiten-/Element-IDs noch existieren; verwaiste Overrides werden im Editor angezeigt und können gelöscht werden.
* „Vorschau“ und „Exposé erzeugen“ wie bisher.

Edge Function
`expose-pdf-erzeugen` lädt Vorlage (Objekt-Override > Firmen-Standard > System „Raster“), Overrides, Daten, Bilder, Fonts und ruft den Renderer. Alles, was das Fork-Exposé schon kann, weiterverwenden: `_web.jpg`-Bildcache, Lageplan-Generator, Distanzen, Courtage-Parser, Zeichenbreiten-Cache (CPU-Limit ca. 8 s), Fonts ohne Subsetting, Debug-Tabelle. Zusätzlich: Vorlage beim Laden gegen das JSON-Schema validieren, bei Fehlern klare Meldung mit Seiten- und Element-ID.
Browser-Vorschau: der Renderer läuft clientseitig mit den bereits geladenen Objektdaten; Bilder in Vorschau-Auflösung (`_web.jpg` bzw. 800 px). Fonts einmal laden und im Speicher halten.
Umsetzung in Etappen (jede Etappe lauffähig committen und deployen)

1. Renderer + Schema: Paket, Typen, JSON-Schema, alle Elementtypen, Platzhalter, Bedingungen, Verdichtung, fließende Seiten. Die drei Start-Vorlagen als JSON. Abnahme: Renderer-Ausgabe der drei Vorlagen mit den Demo-Daten aus den Python-Referenzen gegen die Referenz-PDFs visuell vergleichen (Seiten als PNG rendern und ansehen); Abweichungen bei Position/Größe max. ±2 pt.
2. Edge Function + Datenbank auf den Renderer umstellen; Exposé-Erzeugung im Objekt nutzt die Vorlagen.
3. Editor Basis: Seitenleiste, Seitenbibliothek, Arbeitsfläche mit Auswahl/Verschieben/Größe, Eigenschaften, Live-Vorschau, Speichern, Versionen.
4. Editor Komfort: Hilfslinien/Einrasten, Undo/Redo, Mehrfachauswahl, Kopieren, Ebenen, Textstile, Kontrastwarnung, Asset-Upload, Bedingungs-Editor.
5. Objektmodus mit Overrides.
6. Test & Abnahme: E2E-Tests (Playwright) für Vorlage duplizieren → Element verschieben → speichern → Exposé erzeugen; Neutralitäts-Gate (null Treffer für „Engfer“, „E&P“, „engferundpartner“ in Code, Vorlagen und PDF-Texten); Ergebnis und offene Punkte in `docs/EXPOSE_BAUKASTEN_STAND.md`.

Bewusst nicht in Version 1
Freie Seitenformate außer A4, Ebenen-Gruppen mit Verschachtelung, Masken/Freistellen, Animationen, Mehrbenutzer-Bearbeitung in Echtzeit, Import von onOffice-/InDesign-Vorlagen. In `docs/EXPOSE_BAUKASTEN_STAND.md` als „später“ vermerken.