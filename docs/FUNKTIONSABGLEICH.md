# Funktionsabgleich — Referenz 1:1 gegen ImmoOffice.ai

**Stand:** 03.09.2026 · Grundlage: Vorgabe des Auftraggebers vom 03.09.2026
(„es soll eine 1:1-Kopie der Referenz werden“), festgehalten als
[E-2026-09-03-36](ENTSCHEIDUNGEN.md). Inventar der Referenz aus der Analyse auf
der Festplatte: 16 Kacheln, 307 Komponenten, 89 Abschnitte, 90 Tabellen,
64 Edge Functions, 11 RPCs. Kein Kennzeichen der Referenz wird übernommen —
nur Funktionen.

Legende: **✓** vorhanden · **◐** teilweise · **✗** fehlt · Paket = Arbeitspaket
in `docs/STATUS.md`.

## Kachel 1 — Kalender (Termine)

| Funktion der Referenz | Stand | Paket |
|---|---|---|
| Termine anlegen, Besichtigung/Übergabe/Notar, Objekt- und Kontaktbezug | ✓ | — |
| Wochen-, Monats-, Tagesansicht, farbig je Mitarbeiter | ◐ (Listenansicht) | K1 |
| Serientermine (Besichtigungsserien) | ✗ | K1 |
| Terminbestätigung per Mail mit Kalenderdatei (ICS) | ✗ | K1 |
| Erinnerung sechs Stunden vorher | ✗ | K1 |
| Fahrzeit-Vorschau zwischen Terminen | ✗ | K1 |
| Zuordnung Termin → Objektaufnahme/Lead („Aus der Aufnahme entsteht der Lead“) | ✗ | A1 |
| Abgleich in beide Richtungen mit onOffice | ◐ (Objekte/Kontakte) | K2 |
| Google-/Outlook-Kalender-Sync | ✗ | K2 |

## Kachel 2 — ToDos (Aufgaben)

| Funktion | Stand | Paket |
|---|---|---|
| Aufgaben mit Fälligkeit, Priorität, Objekt/Kontakt, Zuständigkeit | ✓ | — |
| Tags, Wiederholungen | ✗ | N1 |
| Schritte (Teilaufgaben), Kommentare, Verknüpfungen (Mail, Termin) | ✗ | N1 |
| Übergabe an Kollegen, Kanban-Ansicht | ✗ | N1 |
| Arbeitsketten (Vorgänge) mit Checklisten-Vorlagen | ✗ | N1 |
| ToDo aus Mail (KI-Erkennung) und per Spracheingabe | ◐ (Postfach: Anhang übernehmen) | N1 |

## Kachel 3 — Adressbuch (Kontakte)

| Funktion | Stand | Paket |
|---|---|---|
| Personen, Firmen, Anrede/Titel, Quelle, Einwilligung | ✓ | — |
| Mehrfachrollen je Kontakt (Interessent, Eigentümer, Käufer, Mieter, Notar, Bank) | ✓ (kontakt_rollen) | — |
| Suchprofil am Kontakt, Matching | ✓ | — |
| Verknüpfte Objekte, Eigentümerzuordnung | ✓ | — |
| E-Mail-Verlauf zur Adresse | ◐ (Postfach ordnet zu; Anzeige am Kontakt fehlt) | N1 |
| Eigentümer-Portalzugang, Einladung | ✗ | P1 |
| Personalausweis-Scanner (Daten aus Ausweisfoto) | ✗ | W1 |

## Kachel 4 — Kundenportal (Eigentümer- und Käuferbereich)

| Funktion | Stand | Paket |
|---|---|---|
| Eigentümer-Portal: Vermarktungsstand, Dokumente, Nachrichten, Checkliste Unterlagen | ✗ | P1 |
| Käuferportal: Kaufabwicklung mit Unterlagen | ✗ | P1 |
| Einladung, Zugänge, Passwort setzen, Benachrichtigungsglocke | ✗ | P1 |
| Neubau-Projektportal (Projekte, Einheiten, Merkliste, Anfragen, Nachrichten) | ✗ | P2 |

## Kachel 5 — Akquise

| Funktion | Stand | Paket |
|---|---|---|
| Leads (manuell, aus Kontakt, Objekt, Radar, CSV) | ✗ | A1 |
| Pipeline-Stufen, Kanban, Verlustgrund | ✗ | A1 |
| Aktivitäten planen, Dossier, Dokumente (Objektablage), Interessenten-Matching | ✗ | A1 |
| Preis-Finder (Wertindikation aus eigenen Vergleichswerten), Wertindikations-PDF | ◐ (Wertermittlung) | A1 |
| Kampagnen, Quellen, Automationen (Matrix Pipeline × Quelle × Stufe), Vorlagen, Läufe | ✗ | A2 |
| Lead-Mails aus dem Posteingang übernehmen | ✗ | A2 |
| Auswertung: Marketing-Report, Conversion | ✗ | A2 |
| Akquise-Radar (Privatanbieter) | ✗ — rechtliche Prüfung offen, nur manuelle Erfassung | A2 |

## Kachel 6 — Verkauf

| Funktion | Stand | Paket |
|---|---|---|
| Maklervertrag (Verkäufertypen, Provisionsmodelle, § 656d) | ✓ | — |
| Vollmacht mitgenerieren (PDF angehängt / Word zweite Datei) | ✓ | V1 |
| Word-Export | ✓ | V1 |
| Objektnachweis (beidseitig, aus PDF einlesen) | ◐ (Vorlage und Signatur; Einlesen nur für Maklerverträge) | V1 |
| Objektbewertung | ✓ (Wertermittlung) | — |
| Objektaufnahme vor Ort | ✓ | — |
| Übergabeprotokoll (Stammdaten, Schlüssel, Zähler mit KI-Auslesung, Räume mit Fotos, Sonstiges, Unterschriften, PDF) | ✓ (Raumfotos über Objektunterlagen) | V1 |
| Reservierungen (Neubau) | ✓ (Reservierungen mit Frist, Gebühr, Vereinbarung, Objektstatus) | M1 |
| Notar-Laufzettel (8 Schritte: Immobilie, Verkäufer, Käufer, Kaufpreis, Sonstiges, Anhänge mit KI, Beauftragung, Abschluss PDF/Word/ZIP) | ✓ (PDF/Word; kein ZIP) | V2 |
| Notar-Anschreiben, Behördenanfragen | ◐ (Anschreiben ✓, Behördenanfragen → R1) | V2 |
| Maklervertrag aus PDF importieren (KI) | ✓ | V1 |
| Signatur-Vorgänge, öffentliche Signaturseite | ✓ | — |
| Vorunterzeichnung des Maklers per Bild | ✗ | V1 |

## Kachel 7 — Vermietung

| Funktion | Stand | Paket |
|---|---|---|
| Mietanfragen aus Portalen (Mail-Parser) und Selbstauskunft-Formular | ✓ (Parser auf Klick im Postfach; Selbstauskunft über Token-Link) | M1 |
| Bewertung der Anfrage, Antwortvorlagen | ✓ | M1 |
| Mietverträge inkl. Neubau-Klausel, PDF | ✓ (PDF, Word, Signaturlink) | M1 |
| Übergabeprotokolle Ein-/Auszug | ✓ | V1 |

## Kachel 8 — Exposé-Schmiede

| Funktion | Stand | Paket |
|---|---|---|
| KI-Texte je Baustein, Übernahme ins Objekt, Exposé | ✓ | — |
| Notizen der Schmiede auslesen (parse-schmiede-notizen) | ✗ | W1 |
| Rechtschreibkorrektur (text-korrigieren) | ✗ | N1 |

## Kachel 9 — Marketing

| Funktion | Stand | Paket |
|---|---|---|
| Social-Media-Vorlagen mit Branding | ✓ | — |
| Marketing-Ablage | ✗ | D1 |
| KI-Bildbearbeitung (Retusche, Himmel, Home Staging, Vorher/Nachher, Historie) | ✗ | W1 |
| Print-Materialien (Visitenkarten, Flyer, Vorlagenverwaltung, Bestellung) | ◐ (Flyer/Postkarte) | D1 |
| Bild-Editor mit Zuschnitt und RAW-Entwickler | ✗ | W1 |
| Standortkarte (Kartenkachel), Schaufenster-Kachel, Verkauft-/Reserviert-Banner, Energieskala | ◐ (Aushang) | D1 |
| Web-Fassung von Objektbildern | ✓ | — |
| News-Briefing, Caption-Generator, News-Posts | ✗ | D1 |
| Shop TV (Bürobildschirm) | ✗ — Hardwareanbindung; Kachel-Export ohne Fremd-API | D1 |

## Kachel 10 — Dokumente

| Funktion | Stand | Paket |
|---|---|---|
| Zentrale Ablage nach Kategorien | ◐ (Unterlagen je Objekt) | D1 |
| Geschäftsbriefe im Briefpapier, PDF, versenden, ablegen | ✗ | R1 |
| Dateinamen per KI, Objektwissen auslesen | ✗ | W1 |

## Kachel 11 — KI-Agenten

| Funktion | Stand | Paket |
|---|---|---|
| Exposé-Prüfer (Kerndaten, Provision, Rechtschreibung, Grundriss, Lageplan, Energieskala, Bildauswahl, Ampel, Übernahme) | ✗ | W2 |
| Mietvertrags-Prüfer | ✗ | W2 |
| KI-Assistent (Chat) im Mitarbeiterbereich | ✗ | W2 |

## Kachel 12 — Werkzeuge

| Funktion | Stand | Paket |
|---|---|---|
| PDF zusammenfügen, teilen, komprimieren, Seiten bearbeiten, schwärzen | ✗ | W1 |
| Grundriss-Editor (Wände, Türen, Maße, Möbel), Grundriss-Aufbereiter | ✗ | W1 |
| Raumscan (aus App-Datei) | ✗ — Import einer Scan-Datei, keine eigene App | W1 |
| Wohnflächenrechner nach WoFlV mit PDF | ✗ | W1 |

## Kachel 13 — OneDrive

| Funktion | Stand | Paket |
|---|---|---|
| Firmenablage, Ordner, Mailanhänge sichern, Objektordner verknüpfen | ✗ — laut Masterprompt ersatzlos; Ersatz: eigene Ablage (D1) und Postfach-Anhänge | D1 |

## Kachel 14 — Rechnungen

| Funktion | Stand | Paket |
|---|---|---|
| Entwurf, Festschreiben mit fortlaufender Nummer, Storno, bezahlt, PDF | ✗ | R1 |
| Positionen, Kunden, persönliche Absender, Startnummer | ✗ | R1 |
| Provisionsrechnung aus Maklervertrag vorbelegen | ✗ | R1 |

## Kachel 15 — Finanzen (Chef)

| Funktion | Stand | Paket |
|---|---|---|
| Liquidität (Kontoimport CSV, Cashflow, Prognose, Szenarien) | ✗ | F1 |
| Provisionsrechner/-tracker | ✗ | F1 |
| Chef-Passwort für sensible Aktionen | ✗ — Rollenrechte ersetzen es | — |

## Kachel 16 — Admin

| Funktion | Stand | Paket |
|---|---|---|
| Mitarbeiter einladen, Stufen und Rechte je Modul | ✓ | — |
| Firmen-Stammdaten, Kennzahlen, Finanzierungsannahmen | ◐ | R1 |
| onOffice-Import steuern | ✓ | — |
| Bausteine (Textbausteine) verwalten | ◐ (Wertermittlung) | N1 |
| Urlaub (Anträge, Bilanz, Hinweise), Arbeitszeit (Stempeluhr, Wochenmodell, Nachtragen) | ✗ | F1 |
| Profil: Foto, Funktion, Telefon, Signatur, Postfächer | ◐ | N1 |
| Aktivitäts-Log (Chef-Ansicht) | ◐ (Audit-Tabelle ohne Oberfläche) | F1 |
| Bewerber-Modul, Einstellungstest | ✗ — laut Masterprompt ersatzlos, am Ende | F1 |
| Globale Suche über alle Bereiche | ✗ | N1 |
| Tutorial/Erstlogin, Schnellaktionen, Heute-Zone, Warnzone | ◐ (Onboarding) | N1 |

## Paketplan (Reihenfolge)

| Paket | Inhalt | Aufgabe |
|---|---|---|
| S1 | Schnittstellen-Oberfläche (Schlüssel, Rückrufe) | #21 |
| V1 | Verkauf: Vollmacht, Word-Export, Objektnachweis, Übergabe-Assistent, Vertrag aus PDF, Vorunterzeichnung, Kontaktrollen | #22 |
| V2 | Notar-Laufzettel, Notar-Anschreiben, Kaufabwicklung | #22 |
| M1 | Vermietung: Mietanfragen, Selbstauskunft, Mietverträge, Reservierungen | #23 |
| A1/A2 | Akquise | #24 |
| N1 | ToDos-Ausbau, Notizen-Dashboard, Checklisten, Tutorial, globale Suche, Profil, Korrektur | #25 |
| R1 | Rechnungen, Geschäftsbriefe, Stammdaten-Ausbau | #26 |
| K1/K2 | Kalender-Ausbau und Sync | #27 |
| W1/W2 | Werkzeuge, Bildbearbeitung, KI-Agenten | #28 |
| D1 | Dokumente-Ablage, Marketing-Ausbau | #28 |
| P1/P2 | Kundenportal, Neubau-Projekte | #29 |
| F1 | Finanzen, Urlaub/Arbeitszeit, Aktivitäts-Log, Bewerber | #30 |

Jedes Paket endet mit Migration im Projekt, Datenbank-Nachweis, Unit-Tests,
Marken-Scan, Commit und Push; Fortschritt in `docs/STATUS.md`.
