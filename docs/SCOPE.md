# SCOPE — Ja/Nein-Liste aller Referenzmodule für ImmoOffice.ai

**Stand:** 03.09.2026 · Verbindliche Übernahmeliste.

Ergänzt [`docs/MASTERPROMPT.md`](MASTERPROMPT.md), [`docs/FUNKTIONSPROMPT.md`](FUNKTIONSPROMPT.md),
die Abgrenzung in [`CLAUDE.md`](../CLAUDE.md) und [`docs/AUTONOMIE.md`](AUTONOMIE.md).
**Bei Widersprüchen zu Masterprompt oder Funktionsprompt in der Frage „ist Modul X
im Scope“ gilt dieses Dokument.** Ablage: `docs/SCOPE.md`.

Legende: **JA** = vollständig nachbauen · **JA (reduziert)** = im beschriebenen
Umfang · **SPÄTER** = nicht in Version 1, Datenmodell vorbereiten, Phase angegeben ·
**NEIN** = nicht bauen, auch nicht vorbereiten. Phasen wie in
`docs/AUTONOMIE.md`, Abschnitt 7.

---

## A. Kern: Objekte, Kontakte, Vorgänge

| Modul der Referenz | Entscheidung | Phase | Hinweis |
|---|---|---|---|
| Startseite/Cockpit (Kacheln, Heute-Zone, Aufgaben) | **JA** | 1 | Kachelreihenfolge und Sichtbarkeit je Nutzer |
| Immobilien-Verwaltung (Objektentität, Objektmaske inkl. Flächen, Ausstattung und Technik, Preise, Energie) | **JA** | 1 | Kanonisches Modell nach `DATA_MODEL.md` / OpenImmo |
| Objektfotos, Dateien, Bildkategorien, Exposé-Ausschluss, Exposé-Titelbild | **JA** | 1 | inkl. automatische Web-Variante beim Upload (kein Transform-Endpunkt) |
| Objektsuche (Mehrwort, Filter) | **JA** | 1 | |
| Kontakte/CRM (Personen, Firmen, Titel, Kategorien) | **JA** | 1 | |
| Eigentümer an Objekten (Personen, Miteigentümer, Erben, Firmen) | **JA** | 1 | Teil des CRM, kein eigenes Portal |
| Suchprofile und Matching (Interessent ↔ Objekt) | **JA** | 2 | laut Masterprompt |
| Nachfass-Automatik und Aufgaben-Karte | **JA** | 2 | Wächter-Prinzip aus dem Funktionsprompt |
| Notizen-Dashboard (persönlich, Spracheingabe, KI-Vorschläge) | **JA (reduziert)** | 2 | Text und Sprachnotiz; KI-Vorschläge 1 Credit |
| Aktivitäten-Historie am Objekt/Kontakt | **JA** | 1 | |
| Mietanfragen/Lead-Eingang | **JA (reduziert)** | 2 | Eigenes Web-Formular und E-Mail-Parser für Portalanfragen; **JotForm-Anbindung NEIN** |
| Reservierungen (Bestand) | **JA** | 2 | |
| Kaufabwicklung (Käuferdaten, Notar-Anschreiben, Notar-Laufzettel) | **JA** | 4 | |
| Übergabeprotokoll | **JA** | 4 | |
| Neubau-Projektvertrieb (Projekt mit Einheiten, Neubau-Reservierungen, Ausstattungslisten) | **SPÄTER** | 5 | Datenmodell `projekte`/`einheiten` in Phase 1 anlegen |

## B. Verträge und E-Signatur

| Modul der Referenz | Entscheidung | Phase | Hinweis |
|---|---|---|---|
| Maklervertrag (Verkäufertypen: Einzel/Ehepaar/mehrere/Erben/Firma; Provisionsmodelle Teilung/Verkäufer/Käufer; § 656d-Warnung) | **JA** | 1 | Vorlagen neu und neutral |
| Vollmacht | **JA** | 1 | |
| Objektnachweis mit beidseitiger Unterschrift | **JA** | 2 | |
| Reservierungsvereinbarung | **JA** | 2 | |
| Mietvertrag (inkl. Neubau-Klausel, PDF-Export) | **JA** | 4 | Generische Vorlage Wohnraum |
| Word/PDF-Export mit Mandanten-Layout | **JA** | 1 | Word-Layout als Basis, PDF daraus |
| E-Signatur (Vorgänge, Reihenfolgen, Magic-Link, Abschluss-Versand, Ereignisprotokoll) | **JA** | 1 | RLS korrekt: nur Ersteller und Empfänger-Token |
| „Abbrechen und mit Korrektur neu starten“ | **JA** | 2 | |
| Makler-Vorunterzeichnung per Bild | **JA (reduziert)** | 2 | Signaturbild je Nutzer im Profil, kein Standard |
| KI-PDF-Import bestehender Maklerverträge | **JA** | 4 | 5 Credits |
| Geschäftsbriefe (Briefe-Modul, mehrseitig, Briefpapier) | **JA** | 4 | Layouts „Klassik/Modern“, Mandanten-CI |

## C. Bewertung und Exposé

| Modul der Referenz | Entscheidung | Phase | Hinweis |
|---|---|---|---|
| Wertermittlung/Marktpreiseinschätzung (Vergleichs-/Sachwert-Rechenlogik, Vorlage je Makler, Ansprechpartner-Block) | **JA** | 2 | Ausgabe als PDF (nicht PPTX); Hinweistexte generisch |
| Bewertungs-Datenbank (eigene Vergleichsobjekte des Mandanten) | **JA** | 2 | |
| Sprengnetter-API-Anbindung | **NEIN** (V1) | — | ggf. später als Connector mit eigenem Vertrag des Mandanten |
| Exposé-Schmiede (KI-Texte, editierbar, Übernahme ins Objekt) | **JA** | 2 | |
| Exposé-PDF (Layouts, Makro-/Mikrolage mit Karte, Auto-Lageplan, Grundrisse, Ansprechpartner) | **JA** | 2 | Kartenanbieter mit Plattform-Schlüssel, neutral |
| Web-Exposé / öffentliche Objektseite | **JA** | 3 | unter Firmen-Subdomain ab Phase 5 |
| KI-Agent „Exposé-Prüfer“ | **JA** | 3 | 2 Credits |
| KI-Agent „Mietvertrags-Prüfer“ | **SPÄTER** | 5 | |
| Energieausweis-Fragebogen (Verbrauchsdaten vom Eigentümer) | **SPÄTER** | 5 | als Web-Formular am Objekt |
| Einwertungs-PPTX-Vorlage (je Makler) | **NEIN** | — | ersetzt durch PDF-Layouts |

## D. Marketing und Bild

| Modul der Referenz | Entscheidung | Phase | Hinweis |
|---|---|---|---|
| Marketing-Editor (Social-Posts, Print, Feldzuordnung aus Objekt) | **JA** | 2 | Designs neutral |
| Standortkarte für Social Media | **JA** | 2 | |
| Schaufenster-Aushang, „Reserviert“-Banner | **JA** | 3 | |
| Bild-Editor (Zuschnitt, Korrekturen, Himmel, Objektentfernung, Web-Varianten) | **JA** | 3 | USP; KI-Funktionen über den Provider-Layer, je 3 Credits |
| RAW-Entwickler (LibRaw-Wasm, Sony ARW u. a.) | **JA** | 3 | nachgeladen |
| Grundriss-Aufbereiter (Stufe 1: Aufhübschen bestehender Pläne) | **JA** | 3 | |
| Grundriss-Editor (Wände, Türen, Fenster, Möbel, Neuzeichnung) | **JA** | 3 | Standalone-Kern übernehmen, Branding raus |
| Wohnflächenrechner (WoFlV, PDF, Brücke vom Grundriss-Editor) | **JA** | 3 | |
| PDF-Werkzeuge (zusammenfügen, drehen, komprimieren) | **JA** | 3 | läuft im Browser |
| Shop-TV / Digital Signage | **NEIN** | — | |
| Imagefilm/Video-Vorlagen | **NEIN** | — | |
| Immobilien-Quartett | **NEIN** | — | |

## E. Kommunikation und Kalender

| Modul der Referenz | Entscheidung | Phase | Hinweis |
|---|---|---|---|
| Kalender/Termine (Ansichten, Erinnerungen, Besichtigungsserien, Termin in Mail einfügen) | **JA** | 1 | Google/Outlook-Sync Phase 2 |
| Posteingang (Outlook-ähnlicher Client, Ordner, Regeln, Rechtschreibprüfung, Gesendet-Sync) | **JA (reduziert)** | 4 | Umfang nach `AUTONOMIE.md`, Abschnitt 6: lesen, zuordnen, antworten, KI-Entwurf, Anhänge übernehmen. **Kein Vollclient** |
| Mehrere Postfächer je Nutzer (M365/Gmail/IMAP) | **JA** | 4 | |
| KI-Antwort / Mail-Vorschlag | **JA** | 4 | 1 Credit |
| Transaktionsmails der Plattform | **JA** | 1 | Resend |
| Eigentümer-/Kunden-Portal (Login für Eigentümer und Käufer, Freigaben, Nachrichten) | **NEIN** (V1) | — | Hart raus laut Masterprompt; frühestens Phase 6 |
| Telefonie (VoIP-Anbieter, KI-Agentin) | **NEIN** | — | |
| WhatsApp/SMS | **NEIN** | — | |

## F. Verwaltung, Finanzen, Team

| Modul der Referenz | Entscheidung | Phase | Hinweis |
|---|---|---|---|
| Rollen und Rechte (Stufen als Vorlagen, Häkchen je Modul, Datentrennung per RLS) | **JA** | 1 | Rollenzuschnitt: sechs Rollen des Masterprompts, siehe `ENTSCHEIDUNGEN.md` E-2026-09-03-02 |
| Mitarbeiter-Verwaltung, Einladungen, Profil (Foto, Titel, Signatur) | **JA** | 1 | |
| Firmen-Stammdaten und Branding (Self-Service) | **JA** | 1 | |
| Rechnungstool (Provisionsrechnungen, Positionen, GoBD-Sperre, Storno, Nummernkreis, persönliche Absender) | **JA** | 4 | Nummernkreis je Mandant; Bankdaten des Mandanten |
| Liquiditätstool (Bank-CSV-Import, Prognose) | **NEIN** | — | |
| Provisionstracker (Staffel je Mitarbeiter, Chef-Ansicht) | **NEIN** | — | |
| BWA/Auswertungen | **NEIN** | — | Einfache Statistik (Objekte, Abschlüsse, Umsatz) Phase 5 |
| Bewerber-Modul / Einstellungstest | **NEIN** | — | |
| Tutorial/Erstlogin-Führung | **JA** | 1 | neutral formuliert |
| Admin: Stammdaten-Editor für mehrere Gesellschaften | **JA (reduziert)** | 1 | eine Firma je Mandant, Standorte als Untereinheit |

## G. Integrationen und Sync

| Modul der Referenz | Entscheidung | Phase | Hinweis |
|---|---|---|---|
| onOffice (Objekte, Adressen, Termine, Bilder, bidirektional) | **JA** als Connector | 2 | Mapping-Logik übernehmen, keine IDs/Schlüssel |
| Propstack | **JA** als Connector | 4 | neu |
| FlowFact | **JA** als Connector | 4 | neu |
| OpenImmo Import/Export | **JA** | 2 | Pflicht-Wechselkriterium |
| ImmoScout24 / Immowelt | **SPÄTER** | 5 | Partnerprogramm nötig |
| Google/Outlook Kalender-Sync | **JA** | 2 | |
| OneDrive/SharePoint | **NEIN** | — | |
| JotForm | **NEIN** | — | |
| Digital Signage, VoIP, Bank-Anbindungen | **NEIN** | — | |
| Stripe (Abo, Credits, Portal) | **JA** | 3 | |
| Öffentliche REST-API und Webhooks | **SPÄTER** | 5 | |
| Akquise-Radar / Marktbeobachtung (Privatanbieter) | **SPÄTER** | 5 | rechtliche Prüfung des Scrapings vorher |

## H. Plattform und Apps

| Modul der Referenz | Entscheidung | Phase | Hinweis |
|---|---|---|---|
| Web-App responsiv (Desktop und Mobil) | **JA** | 1 | Mobil von Anfang an, nicht nachgerüstet |
| PWA (Startbildschirm, Offline-Grundgerüst) | **JA** | 3 | |
| Native iOS-App / LiDAR-Raumscanner | **NEIN** | — | |
| Plattform-Admin (Mandanten, Tarife, Verbrauch, Support-Freigabe, Audit-Log) | **JA** | 3 | `AUTONOMIE.md` A1–A3 |
| Datenexport und Selbstkündigung | **JA** | 3 | |
| Firmen-Subdomain mit gebrandeter Anmeldung | **SPÄTER** | 5 | |

---

## Zusammenfassung

- **JA / JA (reduziert):** 62 Module
- **SPÄTER (Phase 5–6):** 10 Module
- **NEIN:** 17 Module — interne Betriebsmodule des Referenzunternehmens
  (Liquidität, Provisionstracker, Bewerber, Digital Signage, Telefonie, OneDrive,
  JotForm, Bank-Anbindungen), Sonderprojekte (iOS-App, Quartett, Imagefilm),
  Kundenportal und Sprengnetter in Version 1.

Jede Änderung an dieser Liste wird in `docs/ENTSCHEIDUNGEN.md` datiert festgehalten.
Gebaut wird ausschließlich, was hier auf JA steht, in der angegebenen Phase.

## Folgen für die Abgrenzung

Diese Liste hebt zwei Punkte der bisherigen Ausschlussliste auf beziehungsweise
präzisiert sie:

| bisher (`CLAUDE.md`, Masterprompt Abschnitt 2) | jetzt |
|---|---|
| onOffice-Synchronisation: nicht übernehmen | **onOffice als Connector, Phase 2** — ohne Zugangsdaten oder Kennungen der Referenz |
| Posteingang/E-Mail-Client: nicht übernehmen | **Postfach reduziert, Phase 4** — kein Vollclient (`AUTONOMIE.md`, Abschnitt 6) |

`scripts/marken-scan.sh` prüft entsprechend nicht mehr auf das Wort „onoffice“,
weiterhin aber auf alle Kennzeichen des Referenzunternehmens und auf die
entfallenen Module.
