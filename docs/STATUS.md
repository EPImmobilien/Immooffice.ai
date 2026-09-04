# Status

Fortlaufender Statusbericht, verlangt von [`docs/AUTONOMIE.md`](AUTONOMIE.md),
Abschnitt 0.4 und 0.6. Neueste Einträge oben.

---

## 04.09.2026 (Paket 13) — Werkzeuge: Bild-Editor mit RAW und KI, PDF-Werkzeuge, Grundriss-Editor/-Aufbereiter, Raumscan, Wohnflächenrechner, Energieausweis, Entfernungen

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr` · Referenz-Kacheln „Werkzeuge“ und „Bild-Editor“ nach `docs/FUNKTIONSABGLEICH.md` (W1)

### Erledigt (Migration `20260904150000_werkzeuge.sql`, im Projekt ausgerollt, 11 Nachweise grün)

- **Bild-Editor** (`/werkzeuge/bild-editor`, im Browser): Datei oder
  Objektbild laden, Zuschnitt mit Seitenverhältnis, Zielbreite, Drehen,
  Spiegeln, Helligkeit/Kontrast/Sättigung, Verpixeln/Weichzeichnen von
  Bereichen, Text, Firmenlogo, Vorher/Nachher-Regler, JPG/PNG-Download,
  **Speichern als neue Version** am Objekt (Original bleibt, Beschreibung
  der Bearbeitung); **RAW-Entwicklung** (ARW, CR2, CR3, NEF, DNG, RAF, RW2,
  ORF …) über LibRaw-WASM, ersatzweise eingebettete Vorschau.
- **KI-Bildbearbeitung:** Himmel, Störendes entfernen, Home Staging,
  Optimierung über `src/lib/ki/bild.ts` (Bild-Endpunkt des Anbieters, je 3
  Credits, Reservierung/Einlösung/Freigabe), gekennzeichnete Version.
- **PDF-Werkzeuge** (`/werkzeuge/pdf`, im Browser): Zusammenfügen mit
  Reihenfolge, Teilen (Bereich oder jede Seite als ZIP — eigener
  ZIP-Schreiber), Seiten drehen/löschen/umsortieren mit Vorschau,
  Komprimieren (leicht/stark), Schwärzen (automatisch IBAN, Telefon,
  E-Mail, eigene Begriffe; Rechtecke von Hand; unwiderruflich).
- **Grundriss-Editor & Aufbereiter** (`/werkzeuge/grundriss`): Wände am
  Raster, Türen mit Anschlag, Fenster, Räume mit Fläche, Möbel (12 Typen),
  Maßketten, Text, Undo, Zoom; Vorlage (Plan hinterlegen, Maßstab,
  Deckkraft); **Raumscan-Import** (RoomPlan-JSON); PNG/SVG-Export; Ablage
  als Objektbild (Art Grundriss); Räume in den Wohnflächenrechner.
- **Wohnflächenrechner** (`/werkzeuge/wohnflaeche`): WoFlV-Anrechnung,
  Geschosse/Räume/Teilflächen, Abzüge, Schnellräume, PDF/Word, Übernahme
  ins Objekt, gespeicherte Berechnungen.
- **Objektseite:** Energieausweis hochladen und auslesen (PDF-Text oder
  Foto, 2 Credits; Werte im Bestätigungsformular), Infrastruktur und
  Entfernungen (OpenStreetMap/Overpass, Luftlinie mit Gehminuten, am Objekt
  gespeichert), Karte „Werkzeuge“ mit Sprüngen.
- Prüfstand: Typecheck, Lint, 432 Unit-Tests (WoFlV, Grundriss/SVG/Scan,
  Infrastruktur, RAW-Vorschau, ZIP), 512 Datenbank-Nachweise lokal,
  Marken-Scan, Produktions-Build; Ende-zu-Ende gegen den lokalen Stack
  (Wohnfläche anlegen/PDF/übernehmen, Grundriss zeichnen/speichern/Räume in
  den Rechner, PDF zusammenfügen/teilen/ZIP/Seiten drehen/schwärzen mit
  IBAN-Prüfung, Bild-Editor Bereich/Drehen/Speichern, Objektseite mit
  Energieausweis- und Infrastruktur-Karten). Ablage im Bucket und
  Geokodierung sind lokal nicht erreichbar und melden das sauber.
- Build-Erkenntnis: libraw-wasm läuft zur Laufzeit aus `public/werkzeuge/libraw`,
  CSP mit `'wasm-unsafe-eval'`, Server-Actions bis 12 MB (E-53).

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Live-Lauf der KI-Bildbearbeitung und des Energieausweis-Auslesens | kein `OPENAI_API_KEY` (`docs/ZUGAENGE_FEHLEND.md`); ohne Schlüssel sagt es die Oberfläche, Credits werden nicht berührt |
| Overpass/Nominatim aus der Entwicklungsumgebung | kein Netzzugang im Prüfstand; Aufruf und Auswertung sind durch Unit-Tests abgedeckt, Fehlerpfad meldet „nicht erreichbar“ |
| Personalausweis-Scanner, Dateinamen/Objektwissen per KI, Notizen-Auslese | KI-Assistenten-Paket (W2, mit Exposé-Prüfer) |
| Raumscan mit eigener App (LiDAR) | laut Funktionsabgleich bewusst nur Import einer Scan-Datei |

---

## 04.09.2026 (Paket 12) — Kalender-Ausbau: Ansichten, Serien, Erinnerungen, Fahrzeiten, Bestätigung, Abo, Abgleich

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr` · Referenz-Kachel „Kalender“ nach `docs/FUNKTIONSABGLEICH.md` (K1, K2)

### Erledigt (Migration `20260904140000_kalender.sql`, im Projekt ausgerollt, 23 Nachweise grün)

- **Ansichten:** Tag, Woche, Monat, Liste; Farbe je Mitarbeiter (eigene
  Farbe einstellbar), Personenfilter, Ganztagszeile, überlappende Termine
  nebeneinander, Klick in eine Stunde öffnet das Formular mit Datum und Zeit.
- **Termin:** Anlass, Art, Zeit oder ganztägig (mehrtägig), Ort (leer =
  Objektanschrift), Objekt, Kontakt, Zuständiger, Teilnehmer (Zuständiger
  automatisch dabei), Erinnerung (30 Min bis 2 Tage, Standard 6 h),
  Nachfassen nach Besichtigung, privat (nur Beteiligte und Verwaltung sehen
  ihn — Policies getrennt), Notiz; Detailseite mit Absage, Löschen,
  Kalenderdatei.
- **Serien:** täglich, wöchentlich (mit Wochentagen), alle 2 Wochen,
  monatlich, vierteljährlich, jährlich, eigener Turnus; Ende nach Anzahl
  oder Datum; Vorschau; Ändern und Löschen „nur dieser“ oder „alle
  folgenden“ (`termin_loeschen`, weiches Löschen).
- **Erinnerungen und Nachfassen:** `termine_erinnerungen_faellig` +
  Mailversand an Zuständigen und Teilnehmer in den Tagesarbeiten, Vermerk am
  Termin; `besichtigungen_nachfassen` legt am Folgetag eine Aufgabe mit
  Terminbezug an.
- **Fahrzeiten:** Anfahrt ab Vortermin (≤ 4 h Abstand) oder Startadresse,
  Rückfahrt zum Folgetermin oder zur Startadresse, Puffer je Fahrt;
  Geokodierung über OpenStreetMap mit Cache (`geokodierung`, nur über
  Funktionen), Route über OpenRouteService mit `ROUTING_API_KEY`, sonst
  gekennzeichnete Schätzung; Schraffur vor und nach dem Termin im Kalender.
- **Terminbestätigung:** Text nach Referenz (Anrede, Art, Objekt, Zeit,
  Ort), Betreff, Kalenderdatei als Anhang — über das Postfach; Versand
  wird am Termin vermerkt; Häkchen schon beim Anlegen.
- **Kalender-Abo (ICS):** `/api/kalender/<token>` je Benutzer (Token nur
  über Funktion lesbar, erneuerbar, unbekannt = leerer Kalender), Termine
  ±90/400 Tage, webcal-Link.
- **Abgleich Google/Microsoft:** `src/lib/kalender/sync.ts` über die
  OAuth-Verbindung des Postfachs (neue Berechtigungen `Calendars.ReadWrite`,
  `calendar.events`): eigene Termine hinaus (anlegen/aktualisieren/löschen,
  Kennung in der Beschreibung), fremde herein als „Sonstiges“; Schalter und
  „Jetzt abgleichen“ in den Kalender-Einstellungen; läuft mit jedem
  Postfach-Abruf.
- **Einstellungen je Benutzer:** Startadresse, Besichtigungsdauer, Puffer,
  Fahrzeiten an/aus, Farbe.
- **Ende-zu-Ende gegen den lokalen Stack:** Einstellungen; Formular über
  Stundenklick; Serie „wöchentlich“ mit 10 Terminen; Detail mit Serienmarke,
  Fahrzeit-Berechnung, Änderung „alle folgenden“; ICS-Download; Abo-Feed;
  Bestätigung öffnet Postfach mit Text und Anhang; Löschen „alle folgenden“;
  Monats- und Tagesansicht.
- Prüfstand: Typecheck, Lint, 422 Unit-Tests (Zeitzonen, Serien, ICS,
  Fahrzeit, Bestätigung), 501 Datenbank-Nachweise lokal, Marken-Scan,
  Produktions-Build.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Live-Abgleich gegen echte Google-/Microsoft-Kalender | keine OAuth-Zugänge (`docs/ZUGAENGE_FEHLEND.md`); Aufrufe nach Schnittstellenbeschreibung, Fehlerpfade abgefangen |
| Fahrzeit aus der Straßenroute | ohne `ROUTING_API_KEY` Schätzung aus der Luftlinie, sichtbar gekennzeichnet |
| Drag-and-drop zum Verschieben | Verschieben über das Formular; folgt mit dem Werkzeuge-Paket |
| Abgleich mit onOffice-Terminen | Connector-Paket (Phase 2, Objekte/Kontakte) — Termine folgen dort |

---

## 04.09.2026 (Paket 11) — Rechnungen (GoBD) und Geschäftsbriefe

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr` · Referenz-Kacheln „Rechnungen“ und „Dokumente → Geschäftsbriefe“ nach `docs/FUNKTIONSABGLEICH.md` (R1)

### Erledigt (Migration `20260904130000_rechnungen_briefe.sql`, im Projekt ausgerollt, 27 Nachweise grün)

- **Absender:** Firmen- und persönliche Absender (je Benutzer) mit Anschrift,
  Steuernummer/USt-IdNr., Kleinunternehmer-Regel, Bankverbindung,
  Nummernkreis (Präfix, Jahr, Startnummer, Vorschau), Zahlungsziel,
  Standardtexte; Startnummer gesperrt, sobald eine Rechnung gestellt ist.
- **Kunden:** eigener Rechnungsstamm, optional an Kontakt gebunden, beim
  Anlegen aus einem Kontakt automatisch.
- **Rechnungen:** Entwurf mit Positionen (Menge, Einheit, Netto, Steuersatz
  0/7/19, Brutto→Netto-Umrechnung, Summen je Steuersatz), Empfänger,
  Leistungszeitraum, Zahlungsziel; **Stellen** vergibt die fortlaufende
  Nummer, friert Inhalt und Absender ein und legt das PDF im Bucket ab;
  **Storno** als Gegenrechnung mit eigener Nummer; **Zahlungseingang** mit
  Datum und Betrag; Notiz; Testrechnungen außerhalb des Nummernkreises;
  Provisionsrechnung aus dem Maklervertrag (Prozentsatz, Kaufpreis) vorbelegt;
  Übersicht mit offenen und überfälligen Posten und Filtern; Links von
  Vertrags- und Objektseite.
- **Versand:** Mail-Vorlagen (Standard, Zusammenarbeit, Verkauf, Erinnerung)
  öffnen das Postfach mit Empfänger, Text und der Rechnung als PDF-Anhang;
  Anhänge über IMAP/SMTP, Gmail (MIME) und Microsoft Graph; der Anhang wird
  an der gesendeten Nachricht vermerkt.
- **Geschäftsbriefe:** Vorlagen für Flurkarte, Grundbuch, Altlasten,
  Baulasten, Eigentümer-Unterlagen und -Bericht, Dankschreiben, freier Brief;
  Platzhalter aus Objekt (Adresse, Eigentümer) und Kontakt; Anschrift, Betreff,
  Anrede, Text, Gruß, Unterzeichner; PDF und Word auf Briefpapier
  (Absender überschreibt den Kopf); „PDF erstellen und ablegen“, Versand per
  Post vermerken oder aus dem Postfach senden (setzt „versendet“).
- **Dokumente:** gemeinsamer Erzeuger `src/lib/dokument/erzeugen.ts`
  (Briefkopf laden, PDF rendern, festschreiben, Anhang holen); Download-Route
  liefert gestellte Rechnungen aus dem Storage.
- **Ende-zu-Ende gegen den lokalen Stack:** Absender mit Startnummer 100;
  Rechnung aus Kontakt und Objekt; Brutto 11.900,00 → Netto 10.000,00; zweite
  Position 7 %; Entwurf-PDF; Stellen (RE-2026-100, Felder gesperrt, PDF
  festgeschrieben); Mail-Link mit Anhang; Nummernkreis gesperrt; bezahlt;
  Storno (RE-2026-101, negative Beträge); Brief aus Vorlage „Grundbuch“ mit
  Objektadresse, PDF/Word, als versendet vermerkt.
- Prüfstand: Typecheck, Lint, 412 Unit-Tests, 478 Datenbank-Nachweise lokal,
  Marken-Scan, Produktions-Build.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| E-Rechnung (XRechnung/ZUGFeRD) | ab 2025 nur Empfangspflicht für Unternehmen; Ausstellungspflicht für kleine Unternehmen erst 2028 — vorgemerkt, Datenmodell (Positionen, Steuersätze, Absender-Snapshot) trägt es |
| Vollständige GoBD-Konformität behaupten | nicht behauptet; Aufbewahrung, Verfahrensdokumentation und Export für die Betriebsprüfung sind offene Punkte in `docs/BLOCKER.md` |
| Mahnwesen mit Stufen und Gebühren | heute: Filter „Überfällig“ und Erinnerungs-Mail-Vorlage; Mahnstufen folgen mit dem Finanz-Paket (F1) |
| Versand mit Anhang gegen echte Postfächer geprüft | Aufbau der MIME-Nachricht ist durch Unit-Tests abgedeckt; ein Live-Versand braucht die Zugänge aus `docs/ZUGAENGE_FEHLEND.md` |

---

## 04.09.2026 (Paket 10) — ToDos-Ausbau, Notizen, Checklisten, Heute-Zone, Rundgang

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr` · Referenz-Kacheln „ToDos“ und „Erinnerungen & Arbeitsketten“ nach `docs/FUNKTIONSABGLEICH.md` (N1)

### Erledigt (Migration `20260904120000_aufgaben_checklisten.sql`, im Projekt ausgerollt, 29 Nachweise grün)

- **Aufgaben:** Status (Offen, Läuft, Wartet, Erledigt, Verworfen) im
  Abgleich mit dem Erledigt-Zeitpunkt, Typ Aufgabe/Notiz, Tags je Mandant,
  Wiederholung (nächste Aufgabe beim Erledigen), Erinnerung, Sichtbarkeit
  Team/privat, Verknüpfungen zu Lead, Termin, E-Mail, Vertrag; Schritte mit
  Fortschritt; Kommentare mit Systemverlauf (Statuswechsel, Übergabe an
  Kollegen), unveränderlich.
- **Schnelleingabe** mit Parser (heute/morgen/Wochentage/„in 2 Wochen“/
  Datum, „!!“, #Tags, Wiederholung, „Notiz:“) und Vorschau; Diktat über die
  Browser-Spracherkennung; Liste mit Filtern, Kanban nach Status,
  Notizen-Ansicht; Aufgabe im Detail; „Als Aufgabe übernehmen“ im Postfach
  (Betreff, Frist aus dem Text, Verknüpfung).
- **Rechtschreibkorrektur** der Beschreibung per KI (`ki_text_korrektur`,
  1 Credit, Anbieter-Schnittstelle `textKorrigieren`), ohne KI unverändert.
- **Checklisten:** Vorlagen mit Punkten (Pflicht, Unterlagenart, Frist), vier
  Standardvorlagen je Mandant; laufende Checklisten an Objekt, Kontakt, Lead
  oder Vertrag; Punkte abhaken, „nicht nötig“, als Aufgabe; Unterlage am
  Objekt erledigt den Punkt (auch rückwirkend); Abschluss über Pflichtpunkte;
  Karte auf der Objektseite, Menüpunkt „Checklisten“.
- **Startseite:** Heute-Zone (Termine heute, fällige Aufgaben, „Wartet auf
  Sie“ mit Unterschriften, Mietanfragen, Nachfassen, Treffern, Aufnahmen),
  Notizen-Karte, Kacheln Akquise, Vermietung und Checklisten; **Rundgang**
  beim ersten Anmelden (8 Schritte, hervorgehobene Bereiche), Merker am
  Konto, Neustart über die Startseite.
- **Ende-zu-Ende gegen den lokalen Stack:** Rundgang gestartet, weiter,
  übersprungen; Heute-Zone; Schnelleingabe mit Vorschau (Frist, Hoch,
  #unterlagen, wöchentlich) und Notiz; Detail mit zwei Schritten (1 von 2),
  Kommentar, Statuswechsel im Verlauf, Erledigen mit Wiederholung; Kanban;
  Notizen; Standardvorlagen; Checkliste am Objekt gestartet, Punkt erledigt,
  „nicht nötig“, Punkt als Aufgabe.
- Prüfstand: Typecheck, Lint, 407 Unit-Tests, 451 Datenbank-Nachweise lokal,
  Marken-Scan, Produktions-Build.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Erinnerungen als Push/E-Mail zum Zeitpunkt | Feld `erinnerung_am` ist da; Versand folgt mit dem Kalender-Paket (K1, Erinnerung sechs Stunden vorher) über dieselbe Mail-Schiene |
| Globale Suche, Profil (Foto, Signatur), Bausteine | Verwaltungs-Paket (#30) |
| ToDo aus Mail per KI-Erkennung mehrerer Aufgaben | heute: eine Aufgabe je Mail mit erkannter Frist; Mehrfach-Erkennung mit dem KI-Assistenten-Paket (W2) |
| Kanban per Drag-and-drop | Verschieben über Schaltflächen — funktional gleich, ohne zusätzliche Bibliothek; Drag-and-drop folgt mit dem Werkzeuge-Paket |

---

## 04.09.2026 (Paket 9) — Akquise: Leads, Pipeline, Kampagnen, Quellen, Automationen, Preis-Finder, Radar, Auswertung

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr` · Referenz-Kachel „Akquise“ nach `docs/FUNKTIONSABGLEICH.md` (A1, A2)

### Erledigt (Migration `20260904110000_akquise.sql`, im Projekt ausgerollt, 28 Nachweise grün)

- **Leads** (`/akquise/leads`): manuell, aus Kontakt, aus Objekt, CSV-Import,
  aus Postfach-Mail (Eigentümer-Parser), aus Objektaufnahme, aus Radar; Liste
  und Kanban je Pipeline, Suche, Filter (Status, Nachfassen fällig), Stufe in
  Zeile und Karte wechseln, Verlustgrund-Pflicht, Nachfasstermin automatisch.
- **Dossier:** Info, Preis-Finder (Wertindikation aus eigenen verkauften
  Objekten mit Rechenweg und Vergleichstabelle, Spanne, Startpreis,
  Provisionserwartung nach Provisionsart mit Warnung bei doppelter Courtage,
  Wertindikation als PDF/Word mit Pflichthinweis), Aktivitäten (Anruf,
  Termin → Kalender, Aufgabe → Aufgaben, E-Mail aus Vorlage, WhatsApp-Text,
  Notiz; Verlauf am Kontakt), Dossier (Kontakt anlegen, Objekt im Status
  „Akquise“ anlegen, Wertermittlung verknüpfen, Maklervertrag, Matching,
  Objektablage), Historie (Trigger-Protokoll).
- **Kampagnen und Quellen** mit Art, Budget, Ausgaben, Laufzeit, Kampagne und
  Ziel-Pipeline je Quelle; Lead-Zähler.
- **Automationen** (Matrix Pipeline × Stufe × Quelle, Kanal, Vorlage,
  Verzögerung), Vorlagen mit Platzhaltern, geplante Läufe mit Abbruch; Läufe
  werden in der Datenbank geplant und vom Tagesjob ausgeführt (Aufgabe oder
  Mail-Entwurf, kein Versand ohne Freigabe).
- **Akquise-Radar:** Inserate erfassen, verwerfen, als Lead übernehmen —
  manuell, mit rechtlichem Hinweis.
- **Auswertung:** Marketing-Report je Zeitraum (Leads nach Quellenart,
  gewonnen/verloren, erwartete Provision, Ausgaben, Kosten je Lead und je
  Abschluss, ROAS, Conversion, Verlustgründe, Leads je Quelle) und
  Pipeline-Prognose (roh und gewichtet, je Stufe).
- **Einstellungen:** Pipelines und Stufen (Wahrscheinlichkeit, gewonnen/
  verloren), Verlustgründe, Provisionssatz, Startpreis-Faktor, Spanne,
  Nachfassfrist. Rechtemodul `akquise` in Matrix und Rechteverwaltung.
- **Ende-zu-Ende gegen den lokalen Stack:** Standard-Stammdaten beim ersten
  Aufruf, Automation angelegt, Lead angelegt (Titel aus Objektart und
  Anschrift), Preis-Finder gespeichert (Provision-Marke), Wertindikation PDF
  und Word 200, Anruf vermerkt, Mail-Entwurf mit Anrede und Anschrift,
  Objekt aus Lead angelegt, Stufe „Verloren“ mit Grund, Historie, Kanban,
  Radar → Lead, Kampagne, CSV-Import (2 Leads), Auswertung; Automationslauf
  über die Datenbankfunktion (Aufgabe beim Zuständigen).
- Prüfstand: Typecheck, Lint, 403 Unit-Tests, 422 Datenbank-Nachweise lokal,
  Marken-Scan, Produktions-Build.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Automatischer Portal-Abgleich im Radar | rechtlich ungeklärt (Nutzungsbedingungen, § 7 UWG) — Eintrag in `docs/BLOCKER.md`; Erfassung manuell oder über die Schnittstelle |
| Automatischer Mail-Versand aus Automationen | bewusst nicht: Entwurf am Lead, Versand nach Sichtkontrolle (E-43) |
| WhatsApp-Versand | kein Anbieter angebunden; Text zum Kopieren |
| KI-Aktivität (Textvorschlag für Vorlagen) | folgt mit dem KI-Assistenten-Paket (W2) |
| Leads über die eigene Schnittstelle | Endpunkt `/api/v1/leads` folgt im Verwaltungs-Paket zusammen mit den übrigen neuen Ressourcen |

---

## 04.09.2026 (Paket 8) — Vermietung: Mietanfragen, Selbstauskunft, Antwortvorlagen, Mietverträge, Reservierungen

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr` · Referenz-Kachel „Vermietung“ und „Reservierungen“ nach `docs/FUNKTIONSABGLEICH.md` (M1)

### Erledigt (Migration `20260904100000_vermietung.sql`, im Projekt ausgerollt, 24 Nachweise grün)

- **Mietanfragen** (`/vermietung/anfragen`): Erfassen von Hand, Übernahme aus
  dem Postfach („Als Mietanfrage übernehmen“ mit Portal-Mail-Parser), Quelle,
  Bewertung 1–5 mit Vorschlag, Statusfolge Neu → … → Zusage/Absage → Vertrag,
  Notizen, „Als Kontakt anlegen“, Mietvertrag direkt aus der Anfrage.
- **Selbstauskunft-Formular** ohne Konto über Token-Link je Objekt oder
  allgemein (`/selbstauskunft/<token>`), deaktivierbar, Ratenlimit; Ergebnis
  landet als Anfrage mit Quelle „Selbstauskunft“.
- **Antwortvorlagen** (Eingang, Besichtigung mit Termin, Selbstauskunft mit
  Link, Unterlagen, Zusage, Absage) mit Platzhaltern, je Mandant
  überschreibbar; Versand über Postfach oder E-Mail-Programm, „Als gesendet
  vermerken“ zieht den Status nach.
- **Mietverträge** (`/vermietung/mietvertraege`): Vermieter/Mieter als
  Einzelperson, Eheleute, mehrere, Erbengemeinschaft, Firma; Objektangaben,
  Eigentümer und Miete aus der Objektakte, Mieter aus der Anfrage;
  Befristung, Kündigungsausschluss, Neubau-Klausel, Kaution mit § 551-Grenze,
  Bankverbindung, besondere Vereinbarungen; PDF und Word; Vertragstext als
  Vertrag zur Unterschrift über den Signaturlink; „unterzeichnet“ setzt das
  Objekt auf „Vermietet“.
- **Reservierungen** (`/vermietung/reservierungen`): Objekt, Interessent,
  Frist, Gebühr (anrechenbar/nicht, bezahlt am), Notiz; Objektstatus über
  Datenbank-Trigger (reserviert ↔ aktiv), nur eine aktive je Objekt,
  Vereinbarung als Vertrag, Ablauf im Tagesjob (`reservierungen_ablaufen`),
  Abschluss setzt „Verkauft“, Aufhebung mit Grund.
- **Ende-zu-Ende gegen den lokalen Stack:** Anfrage angelegt, Antwort mit
  Termin erzeugt und vermerkt (Status „Besichtigung geplant“), Selbstauskunft-
  Link angelegt und öffentlich ausgefüllt (Anfrage erscheint), Mietvertrag aus
  der Anfrage mit Vorbelegung, gespeichert, PDF 200, Word 200, Vertragstext
  erzeugt (Neubau-Klausel, Kündigungsausschluss), unterzeichnet → Objekt
  „Vermietet“; Reservierung angelegt (Vereinbarung als Vertrag),
  Doppelreservierung abgewiesen, Gebühr bezahlt, abgeschlossen → Objekt
  „Verkauft“; Ablauffunktion setzt das Objekt zurück auf „Aktiv“.
- Prüfstand: Typecheck, Lint, 389 Unit-Tests, 394 Datenbank-Nachweise lokal,
  Marken-Scan, Produktions-Build.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Automatische Zuordnung eingehender Portal-Mails ohne Klick | der Parser läuft heute auf Klick im Postfach; eine Regel „Portal-Mails automatisch als Anfrage“ folgt mit den Automationen (A2) |
| Mietvertrags-Prüfer (KI) | Werkzeuge-Paket W2 |
| Web-Exposé-Anfrageformular als Quelle | Quelle ist vorgesehen (`web_expose`); das Formular im Web-Exposé kommt mit dem Exposé-Paket |

---

## 04.09.2026 (Paket 7) — Verkauf: Vertragsvorlagen, Vollmacht, Objektnachweis, Übergabeprotokoll, Notar-Laufzettel, Vertragsimport

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr` · Referenz-Kachel „Verkauf“ nach `docs/FUNKTIONSABGLEICH.md` (V1, V2)

### Erledigt (Migration `20260904090000_verkauf.sql`, im Projekt ausgerollt, 20 Nachweise grün)

- **Maklervertrag aus Vorlage:** Verkäufertypen (Einzelperson, Eheleute, mehrere,
  Erbengemeinschaft, Firma), Provisionsmodelle (Teilung, nur Verkäufer, nur
  Käufer) mit § 656d-Warnung, Laufzeit, Verbraucher/Unternehmer, Vollmacht
  mitgenerieren (eigener Vertrag, im PDF als Anlage), Untervollmacht. Objekt
  und Kontakt belegen vor; Text bleibt bis zur Unterschrift bearbeitbar.
- **Objektnachweis** mit Provisionsvereinbarung (§ 656c), Besichtigungsdatum,
  Ausweisprüfung; Unterschrift über den vorhandenen Signaturlink.
- **Vertrag aus PDF einlesen** (KI, 5 Credits; ohne KI Mustererkennung):
  Textauslesung, Felder ins Formular, Original im Bucket abgelegt.
- **PDF und Word** für Verträge, Protokolle und Laufzettel aus einer
  Dokumentstruktur (`src/lib/dokument`), Briefkopf des Mandanten mit Logo.
- **Übergabeprotokoll** als Assistent (7 Schritte): Stammdaten, Schlüssel,
  Zähler mit Foto und KI-Auslesung (1 Credit), Räume mit Zustand, Sonstiges,
  Unterschriften auf dem Bildschirm (Canvas), Abschluss; abgeschlossene
  Protokolle sind in der Datenbank unveränderlich.
- **Notar-Laufzettel** (8 Schritte): Immobilie, Verkäufer, Käufer, Kaufpreis
  und Bank, Sonstiges, Anhänge mit KI-Auswertung, Beauftragung, Abschluss mit
  Begleitschreiben an das Notariat, Statusfolge Entwurf → Bereit → Versendet →
  Abgeschlossen. Maklervertrag und Objektnachweis belegen die Parteien vor.
- **Ende-zu-Ende gegen den lokalen Stack:** Maklervertrag mit Vollmacht über die
  Oberfläche angelegt (PDF 200, Word 200, Vollmacht-Anlage im Text),
  Objektnachweis angelegt, Übergabeprotokoll mit Unterschriften gespeichert und
  abgeschlossen, Laufzettel mit Vorbelegung, Begleitschreiben, PDF/Word,
  Statuswechsel.
- Prüfstand: Typecheck, Lint, 381 Unit-Tests, 370 Datenbank-Nachweise lokal,
  Marken-Scan, Produktions-Build.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Fotos je Raum im Übergabeprotokoll | Ablage läuft über die Unterlagen des Objekts; ein Foto-Upload je Raum folgt mit dem Bild-Werkzeuge-Paket (W1) |
| Behördenanfragen (Flurkarte, Altlasten) mit Vorlagen je Amt | gehört zu den Geschäftsbriefen (R1): gleiche Vorlagenlogik, Versand über das Postfach |
| Vorunterzeichnung des Maklers per Signaturbild | kommt mit dem Profil (N1) |
| Zählerstand-KI und Vertragsimport mit echtem Modell | kein Modellzugang in dieser Umgebung; Fehlerpfade und Credit-Freigabe sind getestet |

---

## 03.09.2026 (Paket 6, Teil 1) — Schnittstelle, Bildmarke, Produktionsfehler, Funktionsabgleich

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr`

### Erledigt

- **Eigene Schnittstelle** (Migration `20260903180000_schnittstelle.sql`, im
  Projekt ausgerollt, 27 Nachweise grün): `/api/v1/objekte`, `/kontakte`,
  `/termine` mit Schlüssel je Mandant (`io_…`, nur Hash gespeichert), Rechte je
  Bereich, 600 Anfragen je Minute und Schlüssel, Lesemodus-Sperre, OpenAPI
  unter `/api/v1/openapi.json`, signierte Rückrufe `objekt.angelegt`,
  `kontakt.angelegt`, `termin.angelegt` mit Wiederholung (2^n Minuten, acht
  Versuche). Oberfläche unter Einstellungen → Schnittstelle: Schlüssel anlegen
  (einmalige Anzeige), Rechte und Limit ändern, widerrufen; Rückrufziele mit
  Geheimnis, Ereignissen, Pause, Zustellprotokoll und „Erneut“. Anleitung
  Abschnitt 10a, Entscheidungen E-37 und E-38.
- **Bildmarke und Wortmarke** auf das Schlüsselloch im Goldkreis umgestellt
  (`public/marke/`, Komponente `Marke`, Favicon, Styleguide).
- **Vollständiger Durchlauf des Produktionsbuilds** gegen eine lokale Datenbank
  mit allen 34 Migrationen und einem Demo-Unternehmen: 30 Seiten fotografiert
  und als Gesamtübersicht an den Auftraggeber gegeben. Dabei zwei Abstürze im
  Produktionsbuild gefunden und behoben: Werte aus `"use client"`-Modulen
  waren in Server-Komponenten importiert (Anmelde-/Registrierseite,
  Einstellungen, Onboarding-Schritt 8). Der Entwicklungsmodus verdeckt das.
- **Funktionsabgleich 1:1** gegen die Referenz: `docs/FUNKTIONSABGLEICH.md`
  (16 Kacheln, je Funktion Stand und Paket), Entscheidung E-2026-09-03-36.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Supabase aus der Entwicklungsumgebung erreichbar | Netzwerkrichtlinie der Umgebung blockiert `*.supabase.co`; Migrationen und Nachweise laufen über die Verwaltungsschnittstelle, die Anwendung selbst gegen einen lokalen Stack |

### Wie es weitergeht

Reihenfolge laut `docs/FUNKTIONSABGLEICH.md`: S1 → V1 → V2 → M1 → A1/A2 → N1 →
R1 → K1/K2 → W1/W2 → D1 → P1/P2 → F1.

---

## 03.09.2026 (Paket 5) — Härtung: Volltextsuche, Missbrauchsschutz, Wächter, Sicherung

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr`

### Erledigt (Migration `20260903170000_haertung.sql`, im Projekt ausgerollt)

- **Volltextsuche im Postfach** über `nachrichten_suchen()` (security invoker,
  RLS des Aufrufers, Index `german`, Filter Postfach und „nur ungelesene“);
  die Oberfläche nutzt sie — E-30 ist damit abgelöst.
- **Missbrauchsschutz bei der Registrierung** (E-34): Honigtopf-Feld,
  Sperrliste für Wegwerfdomains (48 Einträge, per Dienstrolle erweiterbar),
  Ratenbegrenzung je E-Mail-Adresse (3/h) und je Absender-Hash (5/h) mit
  Limits in `plattform_einstellungen`; Versuche werden nach 24 Stunden gelöscht.
- **Wächter** (E-35, Grundprinzip 4 des Funktionsprompts): `waechter_befund()`
  liefert acht Kennzahlen; der Arbeiter prüft stündlich, mailt Befunde an
  `WAECHTER_EMPFAENGER` — gleiche Lage höchstens einmal je 24 Stunden, neue
  Lage sofort, Entwarnung bei Grün — und gibt den Befund im Antwortkörper des
  Worker-Endpunkts aus.
- **Plattform-Einstellungen** als Tabelle (nur Dienstrolle) — Vorstufe des
  Plattform-Admins.
- **Sicherung und Wiederherstellung** dokumentiert (Anleitung, Abschnitt 4):
  tägliche Sicherung, PITR, monatlicher Dump, Wiederherstellungstest lokal —
  ohne neues Supabase-Projekt.

**Nachweise:** `supabase/tests/haertung.sql` (20 Prüfungen: Suche unter RLS,
Sperrliste samt Unterdomains, Limits je Adresse und Absender, Limit aus den
Plattform-Einstellungen, Befund) — lokal **323 von 323** und im Projekt
bestanden; Wächter-Logik mit 6 Unit-Tests (insgesamt 353). Typecheck, Lint,
Marken-Scan, Produktions-Build grün.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Last- und Sicherheitstests, Observability (Masterprompt Phase 3) | brauchen eine laufende Umgebung (Netlify) und Betriebsdaten; die Wächter-Kennzahlen sind die Grundlage |
| Wiederherstellungstest tatsächlich durchführen | braucht eine Sicherung aus dem Projekt (Datenbankpasswort, `docs/ZUGAENGE_FEHLEND.md`) |
| Plattform-Admin-Oberfläche für Sperrliste, Limits und Wächter | Abschnitt 15 des Masterprompts, eigenes Paket; bis dahin per Dienstrolle in der Datenbank |

---

## 03.09.2026 (Paket 4c) — Phase 4: Anmeldung über Google/Microsoft, Stripe-Livevorbereitung

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr`

### Erledigt

- **Anmeldung und Registrierung über Google und Microsoft** (Supabase Auth,
  E-32): serverseitiger Start des Ablaufs, bestehender Rückläufer
  `/auth/bestaetigen`, neue Konten landen in der Unternehmensregistrierung,
  Einladungen werden über das Weiterleitungsziel übernommen. Schaltflächen
  nur mit `NEXT_PUBLIC_ANMELDUNG_GOOGLE/MICROSOFT="1"`; Anleitung Abschnitt 9.
- **Stripe-Livebetrieb vorbereitet** (E-33): Das Einrichtungsskript nimmt
  Live-Schlüssel nur mit `--live` **und** `STRIPE_LIVE_BESTAETIGT="ja"`;
  Anleitung Abschnitt 8, Schritte 8–10 (Liveschaltung, Probebuchung);
  `docs/ZUGAENGE_FEHLEND.md` um die Live-Schlüssel ergänzt.

**Nachweise:** Typecheck, Lint, 347 Unit-Tests, Marken-Scan, Produktions-Build grün.

### Phase 4 — Stand

| Baustein | Stand |
|---|---|
| Postfächer (Microsoft 365, Google, IMAP) | gebaut und nachgewiesen (45 Datenbank-, 37 Unit-Prüfungen); der erste Lauf gegen ein echtes Konto wartet auf Client-IDs bzw. ein IMAP-Konto |
| Propstack, FlowFact | gebaut, 16 Unit-Tests; Pfade und Feldnamen als Annahme markiert, Testzugänge fehlen (E-31) |
| Anmeldung über Google/Microsoft | gebaut; Einrichtung der Anbieter im Supabase-Dashboard durch den Auftraggeber (Anleitung 9) |
| Stripe live | vorbereitet; Live-Schlüssel und anwaltlich geprüfte Rechtstexte fehlen |

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Ende-zu-Ende-Test der Anmeldung über Google/Microsoft | die Anbieter sind im Supabase-Dashboard nicht eingerichtet (Client-IDs fehlen) |
| Kalender-Synchronisation mit Google/Outlook (Masterprompt Phase 2) | eigenes Paket nach den Postfächern; die OAuth-Registrierungen brauchen dafür zusätzliche Berechtigungen (Anleitung 9) |

### Wie es weitergeht

Ohne weitere Zugänge (Netlify, Stripe, Client-IDs, Testkonten der
Maklersoftware) lassen sich die verbleibenden Punkte nur teilweise umsetzen.
Nächste Pakete ohne Zugänge: **Härtung** (Volltextsuche im Postfach,
Missbrauchsschutz bei der Registrierung, Wächter-Mail für Hintergrundketten,
Backup-Wiederherstellung dokumentieren), danach **Phase 5** mit der eigenen
Schnittstelle samt Rückrufen (`docs/AUTONOMIE.md` 5.4). Subdomains je
Unternehmen und Portalanbindungen brauchen Netlify beziehungsweise
Partnerprogramme.

---

## 03.09.2026 (Paket 4b) — Phase 4: Connectoren Propstack und FlowFact

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr`

### Erledigt

- **Propstack** (`src/integrationen/propstack/`): API-Schlüssel im Kopf,
  seitenweiser Abruf mit Zeitfilter, Objekte und Kontakte in beide Richtungen,
  Bilder (Titelbild, Grundriss, Fotos) — Fähigkeiten `objekte_holen`,
  `objekte_senden`, `kontakte_holen`, `kontakte_senden`, `bilder`.
- **FlowFact** (`src/integrationen/flowfact/`): OAuth2 Client Credentials mit
  Token-Zwischenspeicher im Arbeiter (kein Token in der Datenbank), Entitäten
  mit `{ values: [...] }`-Feldern, Objekte und Kontakte holen, Objekte senden;
  Token- und Basisadresse je Integration überschreibbar.
- Beide Connectoren: Fehler in Nutzersprache ohne Rohantworten, ein
  fehlerhafter Datensatz stoppt den Lauf nicht (5.3), Feldprüfung beim
  „Verbindung prüfen“ mit Ergebnis in `konfig.felder_fehlend` und im Protokoll.
  Oberfläche und Warteschlange brauchten keine Änderung — der Rahmen aus
  Paket 2 trägt.
- Anleitung Abschnitt 10 (Zugangsdaten je Anbieter), Entscheidung E-31,
  `docs/ZUGAENGE_FEHLEND.md` um die Testzugänge ergänzt.

**Nachweise:** 16 neue Unit-Tests mit Fetch-Attrappen (Anmeldung, Fehlerbilder,
Mapping in beide Richtungen, Seiten und Zeitfilter, Senden mit Fehlerliste) —
insgesamt 347; Typecheck, Lint, Marken-Scan, Produktions-Build grün.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Lauf gegen ein echtes Propstack- oder FlowFact-Konto | keine Testzugänge (`docs/ZUGAENGE_FEHLEND.md`); Pfade und Feldnamen sind als Annahme markiert und liegen je Anbieter an einer Stelle (E-31) |
| Propstack-Aufgaben und Bild-Upload nach Propstack | der Connector-Rahmen kennt keine Aufgaben-Fähigkeit; Bilder werden geholt, nicht gesendet — beides nach dem ersten echten Lauf |
| Rückrufe (Webhooks) der Anbieter | brauchen eine öffentliche Adresse; nach der Netlify-Einrichtung |

---

## 03.09.2026 (Paket 4a) — Phase 4: Postfächer (Microsoft 365, Google, IMAP)

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr`

**Gate B ist freigegeben** (Auftraggeber, 03.09.2026: „b passt“). Damit beginnt
Phase 4 nach `docs/AUTONOMIE.md` Abschnitt 7: Postfächer, Propstack, FlowFact,
Anmeldung über Google/Microsoft. Der Stripe-Livebetrieb wartet auf
Live-Schlüssel und anwaltlich geprüfte Rechtstexte (`docs/ZUGAENGE_FEHLEND.md`).

### Erledigt

**Datenmodell (Migration `20260903160000_postfaecher.sql`, im Projekt ausgerollt)**
- `postfaecher` (persönlich oder Unternehmen; Zugangsdaten verschlüsselt und
  für Benutzer nicht lesbar), `postfach_freigaben`, `nachrichten` (nur
  Kopfdaten und Text, P4), `nachricht_anhaenge` (Kennung, Name, Größe — der
  Inhalt bleibt beim Anbieter).
- RLS: persönliche Postfächer sieht nur der verbundene Benutzer;
  Unternehmenspostfächer die Verwaltung und freigegebene Kollegen (P1).
  Benutzer ändern an Nachrichten nur Lesestatus und Zuordnung (Spaltenrechte);
  den Eingang schreibt allein der Arbeiter.
- Einplaner alle fünf Minuten mit Rückzug nach Fehlern, Aufbewahrung 24 Monate
  je Unternehmen (P7), Trennen mit Anonymisierung, Löschen erst danach;
  Volltextindex (`german`).

**Anbieter-Schicht (`src/lib/postfach/`)**
- IMAP/SMTP (imapflow, nodemailer, mailparser) mit UIDVALIDITY/UIDNEXT-
  Abgleich und Ablage in „Gesendet“ (P5); Microsoft Graph mit Delta-Abfrage,
  Text statt HTML, Antworten über createReply; Gmail mit History-API und
  Versand im selben Thread. OAuth2 mit Aktualisierungstoken; der Zustand ist
  signiert und an Benutzer und Mandant gebunden (E-27).
- Zuordnung (P3): Absender → Kontakt, Objektnummer oder Anschrift → Objekt;
  ab 90 % automatisch und gekennzeichnet, darunter als Vorschlag. Jede
  Zuordnung erscheint im Objekt- und Kontaktverlauf.
- Job-Art `postfach` im Arbeiter; die Tagesarbeiten planen Abrufe ein und
  räumen nach der Aufbewahrungsfrist auf.

**Oberfläche**
- `/postfach`: Eingang, Suche, Filter, Detail, Zuordnung mit Vorschlag,
  Anhänge in die Unterlagen eines Objekts übernehmen, Antworten und neue
  Nachrichten, KI-Antwortentwurf (Credits nach `credit_preise.ki_text_einzeln`,
  gekennzeichnet, editierbar; ohne KI-Zugang ein Rahmen aus Stichpunkten).
- `/einstellungen/postfaecher`: Microsoft/Google verbinden (sobald Client-IDs
  vorliegen), IMAP/SMTP mit Verbindungsprüfung, Unternehmenspostfächer und
  Freigaben, Abrufabstand, Signatur (P6), Trennen und Entfernen.
- Rechte-Modul `postfach`, Navigationseintrag, Einstellungskarte.

**Nachweise**
- `supabase/tests/postfaecher.sql` (45 Prüfungen): Sichtbarkeit je Benutzer,
  Freigaben, Spaltenrechte, mandantenreine Zuordnung, Senderecht, Einplaner,
  Aufbewahrung, Trennen — lokal (**303 von 303** insgesamt) und im Projekt
  `usguiggfciavwzkdfjgt` bestanden (Migration nach Trockenlauf ausgerollt).
- Unit-Tests: Texthelfer, Zuordnung, MIME, OAuth, Microsoft, Google, Übernahme
  (37 neue) — insgesamt 331. Typecheck, Lint, Marken-Scan, Produktions-Build grün.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Verbindung mit einem echten Microsoft- oder Google-Konto | keine Client-IDs in dieser Umgebung (`docs/ZUGAENGE_FEHLEND.md`); die Anbieter sind gegen Fetch-Attrappen getestet, IMAP/SMTP gegen MIME-Fixtures — der erste Lauf gegen ein echtes Konto ist der nächste Schritt, sobald Zugänge vorliegen |
| Push-Benachrichtigungen der Anbieter (P4, „wo verfügbar“) | der Abgleich läuft im Fünf-Minuten-Takt; Graph-Subscriptions und Gmail-Pub/Sub brauchen eine öffentliche Adresse — nach der Netlify-Einrichtung |
| Suche über den Volltextindex | vorerst ILIKE über Betreff, Absender und Text (E-30) |
| Aufbewahrungsfrist in der Oberfläche einstellen | Spalte und Aufräumlauf stehen; die Einstellung kommt mit dem Plattform-Admin |

---

## 03.09.2026 (Paket 3) — Phase 3: Abo, Testphase, Lesemodus, Stripe im Testmodus — **Gate B**

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr`

Dieser Lauf endet hier: Gate B ist der zweite verbindliche Stopp (Masterprompt,
`docs/AUTONOMIE.md` 0.4). Was der Auftraggeber prüfen und freigeben muss, steht
unten unter „Gate B“.

### Erledigt

**Abo und Testphase (Migration `20260903150000_abo_und_stripe.sql`)**
- Registrierung legt jetzt die Abo-Zeile (Testphase) und **100 Test-Credits**
  an — bisher gab es beides nur auf dem Papier.
- **Lesemodus** (S3): Nach der Testphase ohne Abo, bei Kündigung oder Sperre
  erzwingt `intern.darf_schreiben()` das Lesen; Exportieren bleibt möglich.
  Täglicher Lauf `abos_pruefen()` setzt Lesemodus, plant die Löschung (30 Tage)
  und stellt die Erinnerungen als Mail-Aufträge ein (Tag 5, Tag 7, Tag 23, Tag 29).
- **Benutzerlimit** (S1/S5): Testphase 1, sonst Tarif plus Zusatzbenutzer; beim
  Einladen geprüft; nach einem Downgrade werden zum Abrechnungstag die zuletzt
  angelegten Zugänge abgeschaltet — nie der Inhaber (Audit-Log).
- Tabelle `preise` (Zusatzbenutzer, drei Credit-Pakete), Stripe-Preis-IDs in
  der Datenbank statt in Umgebungsvariablen (E-20).
- Getaktete Abgleiche: `sync_faellige_einplanen()` (Migration
  `20260903140000`), vom Worker-Endpunkt bei jedem Aufruf ausgeführt.

**Stripe (Testmodus)**
- Webhook `POST /api/stripe/webhook`: Signaturprüfung, **Idempotenz** über
  `stripe_ereignisse` (jedes Ereignis genau einmal; nach Fehlschlag erneut),
  Ereignisse `checkout.session.completed`, `customer.subscription.*`,
  `invoice.paid`, `invoice.payment_failed`. Zustandsübergänge ausschließlich in
  Datenbankfunktionen; Inklusiv-Credits je Rechnung genau einmal, Pakete je
  Zahlung genau einmal.
- Checkout (Abo mit Zusatzbenutzern, Credit-Pakete) mit Stripe Tax, USt-IdNr.,
  SEPA und Karte; Abrechnungsportal für Zahlungsmittel, Rechnungen, Tarifwechsel,
  Kündigung (E-21). `scripts/stripe-einrichten.mjs` legt Produkte, Preise und
  Portal aus den Datenbankwerten an.
- Seite „Abo und Credits“ zeigt Zustand, Guthaben, Ledger, Tarife und Pakete;
  ohne Stripe-Schlüssel bleiben die Schaltflächen mit Hinweis gesperrt.
- Transaktionsmails (Erinnerungen) über die Resend-API; ohne `MAIL_API_KEY`
  bleibt der Auftrag mit sprechendem Fehler sichtbar.

**Nachweise**
- `supabase/tests/abo.sql` (30 Prüfungen): Test-Credits, Schreiben in der
  Testphase, Benutzerlimit, Idempotenz der Ereignisse, Abo-Übernahme,
  Kontingent je Rechnung, Paket je Zahlung, Zahlung offen, Kündigung,
  **Lesemodus wirkt in den Policies**, Tageslauf, Downgrade.
- Unit-Tests für die Ereignisverarbeitung (10) und Mailvorlagen (3).
- Lokal (`scripts/db-lokal.sh`): 31 Migrationen auf leerem Grund, **258 von
  258 Nachweisen** bestanden; Typecheck, Lint, 294 Unit-Tests, Marken-Scan,
  Produktions-Build grün.
- Im Projekt `usguiggfciavwzkdfjgt`: beide Migrationen (`20260903140000`,
  `20260903150000`) nach Trockenlauf mit Rollback ausgerollt und in
  `schema_migrations` eingetragen; `abo.sql` dort **30 von 30** bestanden
  (in einer zurückgerollten Transaktion).

**Nachträge beim Abschluss**
- Der Tageslauf konnte Zugänge nicht abschalten (Trigger gegen
  Selbstermächtigung); gelöst über die Transaktionsmarke `intern.systemlauf`
  (E-23).
- Der vorhandene Mandant (angelegt 17.08.2026) hätte mit dem Lesemodus sofort
  im Schreibschutz gestanden; Testphase bis 03.10.2026 verlängert (E-24).
- „Kundenportal“ (Stripe) heißt im Code und in der Oberfläche jetzt
  „Abrechnungsportal“, weil der Marken-Scan den Begriff als entfallenes Modul
  meldet (E-25).

### Gate B — bitte prüfen und freigeben

1. **Kernflüsse vorführen** (Endtest „Neuer Makler“, Reihenfolge nach E-22):
   Registrieren → Bestätigen → Onboarding → Tarif im Testmodus buchen →
   Kollegin einladen → Erscheinungsbild → OpenImmo importieren → Exposé →
   Web-Exposé. Dafür braucht es die Zugänge aus `docs/ANLEITUNG.md`
   (Abschnitte 0–8) — insbesondere Netlify und die Stripe-Testschlüssel.
2. **Cross-Tenant-Isolation:** Nachweise `rls-mandantentrennung.sql`,
   `verweise-mandantenrein.sql`, `integrationen.sql`, `jobs.sql`,
   `einladungen-und-audit.sql`, `abo.sql` — zusammen 258 Prüfungen, lokal und
   gegen das Projekt bestanden (`scripts/db-lokal.sh`, GitHub Actions).
3. **Preise freigeben:** Starter 29,99 / Professional 99,99 / Business 199,99 €
   netto monatlich, Jahrespreis = zehn Monatsbeiträge, Zusatzbenutzer 14,99 €,
   Pakete 250/1.000/3.000 Credits für 9,99/29,99/69,99 € — alles in `tarife`
   und `preise` änderbar.
4. **Rechtstexte:** AGB, Widerrufsbelehrung (Unternehmerkunden), Datenschutz-
   erklärung, Auftragsverarbeitung, Vertragsmuster — **anwaltliche Prüfung
   ist Pflicht** und von der Entwicklung nicht leistbar. Ohne diese Freigabe
   bleibt Stripe im Testmodus.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Stripe-Produkte anlegen, Webhook registrieren, Probebuchung | kein Stripe-Testschlüssel in dieser Umgebung; Skript und Anleitung liegen bereit |
| Endgültige Löschung nach 30 Tagen Lesemodus | Löschtermin und Warnmails sind gebaut; die Löschung selbst wird erst nach Gate B und mit dem Plattform-Admin (Abschnitt 15) freigeschaltet — ein automatischer Datenverlust ohne Betreiber-Einsicht wäre nicht vertretbar |
| Gutscheine | Stripe-Promotion-Codes sind im Checkout erlaubt; eigene Gutscheinverwaltung folgt mit dem Plattform-Admin |
| Missbrauchsschutz gegen Mehrfachregistrierung | E-Mail-Bestätigung ist Pflicht; Prüfung auf Wegwerfadressen und Ratenbegrenzung folgen in Phase 3 „Härtung“ |

---

## 03.09.2026 (Paket 2) — Integrationen bedienbar, Auftragswarteschlange mit Wächter

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr`

### Erledigt

**Auftragswarteschlange (Phase 2, ARCHITECTURE.md Abschnitt 3)**
- Migration `20260903130000_jobs_und_importdateien.sql`: Tabelle `jobs` als
  Warteschlange (`FOR UPDATE SKIP LOCKED`, Sichtbarkeitsfrist), Wächter für
  verschwundene Arbeiter, Wiederholung mit wachsendem Abstand (1, 2, 4 …
  Minuten), Verlauf je Versuch, Credits werden beim Erfolg eingelöst und beim
  endgültigen Scheitern freigegeben — auch ohne Sitzung (`intern.credit_vorgang_beenden`).
  Arbeiterfunktionen nur für die Dienstrolle. Bucket `importe` (privat) für
  OpenImmo-Pakete. E-2026-09-03-16/17.
- Arbeiter `src/lib/jobs/worker.ts`, Endpunkt `POST /api/jobs/ausfuehren`
  (Bearer `JOB_GEHEIMNIS`, Zeitbudget 20 s), geplante Netlify-Funktion
  `netlify/functions/jobs-worker.mts` (minütlich). Jede Server Action stößt
  den Arbeiter nach dem Einstellen zusätzlich sofort an (8 s Budget).
- Nachweis `supabase/tests/jobs.sql` (23 Prüfungen): Rechte, Sperre,
  Wiederholung, endgültiges Scheitern mit Credit-Freigabe, Erfolg mit
  Einlösung, Wächter, Abbruch durch den Mandanten.

**Sync-Lauf (`src/integrationen/kern/lauf.ts`)**
- Holen, senden, beide Richtungen; „letzte Änderung gewinnt“ mit
  Konfliktliste; ein fehlerhafter Datensatz stoppt den Lauf nicht; Bilder nur
  bei neuen Objekten und Objekten ohne Bilder; Kontakte ebenso. Läuft gegen
  eine Speicherschnittstelle — sieben Unit-Tests mit Speicher im
  Arbeitsspeicher, Supabase-Fassung setzt bei jeder Abfrage den Mandanten.

**Oberfläche `/einstellungen/integrationen`**
- OpenImmo-Datei: Upload direkt in den Bucket, Vorschau (Anzahl, Bilder,
  zurückgezogene Objekte, mögliche Dubletten über die Anschrift, Hinweise),
  dann Übernahme als Auftrag. E-2026-09-03-18.
- Systeme verbinden: Formular aus der Registry (Anmeldefelder je Connector),
  Verbindung wird vor dem Speichern geprüft, Zugangsdaten verschlüsselt.
- Je Integration: Zustand, letzter Abgleich, „Verbindung prüfen“, „Jetzt
  abgleichen“, Einstellungen (Bezeichnung, Richtung, Takt), Entfernen; die
  letzten Läufe mit Zahlen, Fehlerliste und Konfliktliste.

**Prüfung:** Typecheck, Lint, 281 Unit-Tests, Marken-Scan, Build; lokal 29
Migrationen und **228 Datenbank-Nachweise**; Migration im Projekt ausgerollt
(Trockenlauf, dann endgültig) und `jobs.sql` dort bestanden.

### Nicht erledigt — und warum

| Punkt | Grund |
|---|---|
| Automatische Läufe nach Takt (15 min / stündlich / täglich) | Der Takt ist gespeichert; der Einplaner, der fällige Integrationen als Aufträge einstellt, kommt mit dem nächsten Paket (eine Funktion `sync_faellige_einplanen()`, vom Worker-Endpunkt aufgerufen) |
| Rückrufe (Webhooks) von Anbietern | kein Anbieter der Stufe 1 bietet sie ohne Partnerprogramm |
| Termine abgleichen | onOffice-Kalender folgt mit dem Kalendermodul (Phase 2) |
| Deploy-Vorschau, `JOB_GEHEIMNIS` bei Netlify | kein Netlify-Zugang (`ZUGAENGE_FEHLEND.md`) |

---

## 03.09.2026 — Autonomie-Prompt aufgenommen, Onboarding/Team, Connector-Rahmen

**Branch:** `claude/autonomie-integrations-prompt-rl2qkr`
**Gate-Stand:** Gate A ist überschritten (Phase-1-Code besteht seit 16.08.).
Gate B steht aus — Stripe ist noch nicht begonnen.

### Erledigt in diesem Arbeitspaket

**Arbeitsmodus und Dokumente**
- `docs/AUTONOMIE.md` — der Auftragstext, auf die vorhandenen Dateinamen
  abgebildet, mit Rangfolge zu Masterprompt und `SCOPE.md`.
- `docs/SCOPE.md` — die verbindliche Ja/Nein-Liste je Referenzmodul.
- `docs/ENTSCHEIDUNGEN.md` — 13 datierte Entscheidungen, darunter die
  Auflösung der beiden Widersprüche (sechs Rollen; onOffice im Scope).
- `docs/ZUGAENGE_FEHLEND.md`, `docs/BLOCKER.md`, `docs/CREDITS.md`,
  `docs/ANLEITUNG.md` (Klick-für-Klick, ohne Fachbegriffe).
- `CLAUDE.md` und `scripts/marken-scan.sh` an `SCOPE.md` angeglichen: onOffice
  ist kein entfallenes Modul mehr; alle Kennzeichen des Referenzunternehmens
  bleiben verboten.
- `.env.example` um GitHub/Netlify/Supabase-CLI, Anthropic, Microsoft-Tenant
  ergänzt; `VERSCHLUESSELUNG_SCHLUESSEL` dokumentiert.
- GitHub-Actions-Workflow `pruefen.yml`: Typecheck, Lint, Tests, Marken-Scan,
  Produktions-Build bei jedem Push.

**Datenbank**
- **Migrationsstand angeglichen** (E-2026-09-03-14): Das Produktivprojekt
  kannte drei Migrationen, die im Repository fehlten — darunter die komplette
  Einladungsverwaltung (`einladungen`, `einladung_erstellen/ansehen/einloesen/
  erneuern`) — und neun Migrationen unter anderen Versionsnummern. Alles ist
  nachgetragen beziehungsweise umbenannt; `supabase db push` findet jetzt eine
  deckungsgleiche Historie vor.
- `20260903120000_onboarding_team_audit.sql`: `standorte`, Einladungen auf
  7 Tage (R3) mit Protokoll, `audit_log` (unveränderbar, nur über Funktion und
  Trigger), `plattform_admins` (nur Dienstrolle), `support_freigaben` (24 h
  durch Inhaber), Onboarding-Zustand am Mandanten, Impressums- und
  Gestaltungsfelder am Branding, vier neue Credit-Preise.
- `20260903120100_integrationen.sql`: `integrationen` (Zugangsdaten
  verschlüsselt, Spalte für Benutzer **nicht lesbar**),
  `integration_mappings`, `sync_laeufe`, Mandantenreinheit per Trigger.
- **Lokaler Nachweislauf** `scripts/db-lokal.sh` (E-2026-09-03-15): alle 28
  Migrationen auf leerem Grund, dann alle 15 Nachweisdateien —
  **205 Prüfungen bestanden**, darunter neu `einladungen-und-audit.sql` (35)
  und `integrationen.sql` (14). Läuft auch in GitHub Actions.
- **Ausgerollt:** Beide neuen Migrationen sind im Projekt `usguiggfciavwzkdfjgt`
  angewendet — erst als Trockenlauf mit Rollback, dann endgültig — und in
  `supabase_migrations.schema_migrations` unter den Versionsnummern der
  Repository-Dateien eingetragen. Die Nachweise `einladungen-und-audit.sql`
  und `integrationen.sql` liefen anschließend auch gegen das Projekt (in einer
  zurückgerollten Transaktion). Rückbau, falls nötig: `drop table` der neuen
  Tabellen, `alter table … drop column` der neuen Spalten — beides ohne
  Datenverlust an Bestandstabellen, weil die Migration nur ergänzt.

**Anwendung**
- Onboarding-Assistent `/onboarding/1…8` (Pflicht 1–3, Rest überspringbar);
  offene Verwaltung wird beim Anmelden hineingeleitet, alle anderen Rollen
  arbeiten normal.
- Einladungen: Anlegen mit Rolle, Link einmalig zum Kopieren, Zurücknehmen,
  Landeseite `/einladung/[token]`, Registrierung mit Token (Token überlebt die
  E-Mail-Bestätigung), Einlösen nur mit der eingeladenen Adresse.
- Erscheinungsbild: helles und dunkles Logo, Farben mit WCAG-AA-Prüfung und
  Korrekturvorschlag, zwölf kuratierte Schriften (lokal ausgeliefert),
  Live-Vorschau (Deckblatt, Social-Motiv, E-Mail). Mandantenfarben wirken in
  Kopfzeile, Hauptschaltflächen und Akzenten der Anwendung.
- Unternehmensangaben um Rechtsform, Vertretung, Handelsregister, USt-IdNr.
  (Formatprüfung), Erlaubnisbehörde ergänzt.
- Registrierung fragt die Unternehmereigenschaft ab (S8).

**Connector-Rahmen (`src/integrationen/`)**
- Kern: Schnittstelle, Registry, kanonisches Modell, AES-256-GCM mit
  Mandantenbindung, Dubletten- und Konfliktlogik.
- OpenImmo: Import aus XML oder ZIP (eigener ZIP-Leser), Export über den
  vorhandenen Erzeuger, Rundreise getestet.
- onOffice: HMAC-v2-Signatur, Objekte/Adressen/Bilder holen, Objekte/Adressen
  senden, **Feldprüfung einzeln je Feld** (Verhalten aus der Referenz:
  Fehler 141 bei unbekanntem Feld). Getestet gegen eine fetch-Attrappe.
- Propstack und FlowFact registriert, ohne Fähigkeiten (Phase 4).

**Prüfung:** `npm run typecheck`, `npm run lint`, `npm test` (69 neue
Unit-Tests), `scripts/marken-scan.sh` — alle grün. Produktions-Build siehe
unten.

### Nicht erledigt — und warum

| Punkt | Grund | Wo dokumentiert |
|---|---|---|
| `supabase link` / `supabase db push` als Werkzeugkette einrichten | Die Migrationen sind über die Verwaltungsschnittstelle ausgerollt (siehe oben); die CLI-Kette braucht Token und Datenbankpasswort aus `.env.local` | `ZUGAENGE_FEHLEND.md` |
| Netlify-Site anlegen, Umgebungsvariablen setzen, Deploy-Vorschau | kein Netlify-Token | `ZUGAENGE_FEHLEND.md` |
| Einladungsmail automatisch versenden | kein Transaktionsmail-Dienst; Link wird stattdessen angezeigt | E-2026-09-03-07 |
| Oberfläche `/einstellungen/integrationen` (Integration anlegen, Verbindung prüfen, Sync starten, Fehlerliste) | der Rahmen und beide Connectoren stehen; die Oberfläche und der Sync-Lauf mit Hintergrundjob (Phase 2, Job-Queue) folgen als nächstes Paket | — |
| Benutzerlimit je Tarif bei Einladungen (S5) | gehört zum Abo-Modul, Phase 3 | — |
| Stripe, Postfächer, Propstack, FlowFact, Social-Login | Phasen 3–4 laut `AUTONOMIE.md` Abschnitt 7 | — |
| Gewählte Schriften in PDF-Exposés einbetten | Exposé-Erzeuger nutzt derzeit Inter/Poppins mit eingebetteten Dateien (`scripts/schriften-einbetten.mjs`); Erweiterung auf zwölf Schriften ist ein eigenes Paket | — |

### Für den Auftraggeber

Zwei Punkte wurden entschieden, obwohl die Dokumente sich widersprachen —
bitte prüfen, ob das so gewollt ist:

1. **Sechs Rollen statt vier** (E-2026-09-03-02): „Buchhaltung" läuft über
   Feinrechte, nicht als eigene Rolle.
2. **Credit-Werte und Pakete** (E-2026-09-03-13): Es gelten die Werte aus dem
   Kostenmodell, nicht die Startwerte aus dem Autonomie-Prompt.

Sobald `.env.local` gefüllt ist (`docs/ANLEITUNG.md`, Abschnitte 0–6), werden
Migrationen ausgerollt, die Datenbanktests ausgeführt und die Deploy-Vorschau
erzeugt — das ist der erste Schritt des nächsten Laufs.

---

## 16.08.2026 — Gate A

Bestandsaufnahme, Funktionsmatrix, Styleguide, Architektur, Datenmodell,
OpenImmo-Mapping, Umsetzungsplan und Aufwandsschätzung liegen vor
(`docs/BESTANDSAUFNAHME.md`, `docs/FUNKTIONSMATRIX.md`, `ARCHITECTURE.md`,
`DATA_MODEL.md`, `OPENIMMO_MAPPING.md`, `docs/UMSETZUNGSPLAN.md`,
`PRICING_AND_GUV.md`). Phase-1-Code ist seither entstanden (siehe Git-Log).
