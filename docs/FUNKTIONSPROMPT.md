# Funktionsprompt: Makler-Betriebssystem (für Claude Code)

> **Einordnung.** Dieses Dokument ist die verbindliche Funktionsspezifikation
> (das WAS). Es steht neben [`MASTERPROMPT.md`](MASTERPROMPT.md), der den
> technischen Rahmen, den Phasenplan und die Scope-Steuerung festlegt (das WIE
> und WANN). **Bei Widersprüchen gewinnt der Masterprompt** — so bestimmt es
> dieses Dokument selbst.
>
> Der folgende Text ist bis auf **eine** Stelle unverändert übernommen: Der Name
> des Referenzunternehmens ist durch „des Referenzunternehmens" ersetzt. Nach
> Abschnitt 2 des Masterprompts darf dieses Kennzeichen an keiner Stelle des
> Repositorys erscheinen — auch nicht in einer Spezifikation.

---

## Rolle & Auftrag

Du bist Senior-Fullstack-Entwickler und baust eine mandantenfähige SaaS-Plattform für Immobilienmakler — ein „Makler-Betriebssystem", das den kompletten Arbeitsablauf von der Einwertung bis zum Notartermin in einer Anwendung abbildet. Dieses Dokument ist die verbindliche Funktionsspezifikation (das WAS). Liegt im Repo ein `MASTERPROMPT.md`, gilt dessen technischer Rahmen, Phasenplan und Scope-Steuerung (das WIE und WANN) — bei Widersprüchen gewinnt der Masterprompt. Als funktionale Referenz dient das bestehende Portal des Referenzunternehmens (Kompilat unter `reference/`), dessen Funktionen hier beschrieben sind. Übernimm die Funktionslogik, NICHT die Alt-Implementierung (Monolith, Inline-Styles, Babel).

## Technischer Rahmen (Kurzfassung, falls kein Masterprompt vorliegt)

- Next.js + TypeScript, Deployment via Netlify (GitHub-Anbindung), Supabase als Backend (Postgres, Auth, Storage, Edge Functions).
- Echte Mandantenfähigkeit: jede Tabelle trägt `firma_id`, Datentrennung serverseitig per RLS ab der ersten Migration — nie nur im Frontend.
- UI-Sprache Deutsch, saubere Umlaute überall (UI, PDFs, Mails). Mobile-tauglich (responsive, keine festen Pixelraster).
- Branding je Mandant (Logo, Primär-/Akzentfarbe, Schrift) als Self-Service; alle Dokumente/PDFs rendern im Mandanten-CI.
- KI-Features über serverseitige Functions (API-Keys niemals im Client); Modell-Aufrufe mit Credit-Verbrauch verbuchen.

## Architektur-Grundprinzipien (die „Tricks" — verbindlich für jedes Modul)

Diese Prinzipien sind der eigentliche Wert der Software. Jedes Modul muss sie erfüllen:

1. **Das Objekt ist das Drehkreuz.** Bewertungen, Verträge, Objektnachweise, Termine, Mails, Anfragen, Exposés, Dateien und Kundenzugänge tragen eine Objekt-Verknüpfung (FK auf `immobilien`). Wer ein Objekt öffnet, sieht den kompletten Vorgang chronologisch. Nichts wird doppelt erfasst — Daten fließen entlang der Kette weiter.
2. **Verkettete Arbeitsschritte statt Insellösungen.** Der Kernpfad lautet: Einwertung → Exposé → Maklervertrag → Objektnachweis/Reservierung → Kaufabwicklung → Rechnung. An jeder Übergabe werden Daten vorbelegt (z. B. Verkäuferliste des Objektnachweises aus den Eigentümern des Maklervertrags; Rechnungspositionen aus der Vertragsprovision; Ansprechpartner aus dem angemeldeten Nutzer mit stets frischem Profil inkl. Titel).
3. **KI-Dokumentenauslese als wiederkehrendes Muster.** Ablauf immer gleich: Dokument/Bild hochladen → KI extrahiert strukturiert (JSON) → Ergebnis landet in einem editierbaren Formular → Nutzer prüft und übernimmt. KI-Ergebnisse gehen NIE ungeprüft in Kundendokumente. Bereits gefüllte Felder werden nicht überschrieben.
4. **Hintergrund-Automatik mit Wächter.** Wiederkehrende Jobs (Syncs, Benachrichtigungen, Bild-Pipeline) laufen über eine Job-Queue/Crons mit ausreichendem Timeout. Ein Wächter-Job prüft stündlich alle Ketten (letzter Lauf, Fehlerzähler, Datenabweichungen) und mailt Befunde proaktiv an den Admin — mit Anti-Spam (gleiche Befundlage max. 1×/24 h per Hash, neue Lage sofort, Entwarnungsmail bei Grün).
5. **Rechte-System: Stufen als Vorlagen, Häkchen einzeln.** Nutzerstufen (Chef / Standortleitung / Makler / Assistenz) sind nur Vorlagen für Modul-Rechte; jedes Modul-Häkchen ist pro Nutzer einzeln überschreibbar. Kacheln UND Routen sind gegated, sensible Daten zusätzlich per RLS (Sichtbarkeit im Frontend ist nie die einzige Schranke). Schutz-Trigger verhindern, dass Nutzer sich selbst Rollen/Rechte erhöhen.
6. **Bild-Pipeline.** Jeder Bild-Upload erzeugt automatisch eine schlanke Web-Variante (`<pfad>_web.jpg`, max. ~1600 px) für Exposés und Web — Originale bleiben erhalten. Dokumente/PDF-Generatoren laden bevorzugt die Web-Variante (selbstheilend: fehlt sie, wird sie beim ersten Zugriff erzeugt).

## Module im Detail

### A) Objekte & Vertrieb (CRM-Kern)

#### A1 — Immobilienverwaltung (Objektakte)

- Vollseitige Objektmaske mit Reitern: Grunddaten / Preise & Flächen / Freitexte / Energieausweis / Fotos / Dokumente / Verknüpfungen / Aktivitäten / Vermarktung.
- Fortlaufende Objektnummer per DB-Trigger (Stammobjekt + Einheiten als `<Stamm>_<lfd>`), natürliche Sortierung in der Liste.
- Ausstattung & Technik (Zustand, Unterkellerung, Heizungsart, Befeuerung, Wintergarten u. ä.), Ansprechpartner-Zuordnung (Dropdown auf Teammitglieder), Vermarktungsstatus (Akquise/Vermarktung/reserviert/verkauft).
- Foto-Galerie: Drag-&-Drop-Sortierung, Inline-Bildunterschriften, Toggle öffentlich/intern je Datei, Kategorien (Foto/Grundriss/Lageplan/Dokument).
- Getrennte Titelbild-Logik: Portal-Hauptbild ≠ Exposé-Titelbild. Je Bild ein Flag „nicht ins Exposé"; Werbe-/Infobilder werden per Namensmuster automatisch vorbelegt (jederzeit überschreibbar).
- Öffentliche Objektliste als einbettbare Website-Seite (nur Status Vermarktung/reserviert) + OpenImmo-Export (validiert gegen XSD, ZIP + FTP je Portal-Zugang) als Anbindung an Homepage und Immobilienportale.

#### A2 — Kontakte (Adressbuch)

- Kontakte mit Mehrfachrollen (Interessent, Eigentümer, Käufer, Mieter, Notar, Bank, Gutachter, Dienstleister …), Pflichtregel „Nachname ODER Firma".
- Suchprofil je Interessent (Kauf/Miete, Kriterien als JSON) für späteres Matching; Betreuer-Zuordnung auf Teammitglieder; akademischer Titel als eigenes Feld (fließt in alle Dokumente und Anreden).
- Objekt-Verknüpfungen: die Rolle hängt an der Verknüpfung (ein Kontakt kann bei Objekt A Eigentümer, bei B Interessent sein).
- Ausbaustufe: automatisches Matching Suchprofil ↔ neue Objekte mit Benachrichtigung.

#### A3 — Wertermittlung / Marktpreiseinschätzung (MPE)

- Erfassung: Objektdaten (inkl. Nutzfläche, Bodenrichtwert, Renovierungen), Vorteile/Einwände/Zielgruppen (+ Freitexte), 1–8 Vergleichsobjekte (€/m² automatisch aus Preis/Fläche, manuell überschreibbar), Preisentwicklungs-Datenserien, Sachwert- und Ertragswertrechner, Finanzierungsbeispiel (fehlende Beträge werden aus Prozentsätzen selbst gerechnet).
- Drei-Werte-Preismodell: Vergleichs-/Angebotspreisniveau (Herleitung) / realistisch erzielbar (manuell) / empfohlener Angebotspreis.
- PDF-Generator im Mandanten-CI (Querformat, Cover, Kapiteltrenner, Karten des Vertriebsgebiets als Vektorgrafik): dynamischer Seitenplan (fehlende Daten → Seite entfällt, Inhaltsverzeichnis passt sich an), Vergleichsobjekt-Layouts je Anzahl (Karten / zwei Reihen / Tabelle mit Ø-Zeile), verfahrensabhängige Preisherleitung (Sachwert-Wasserfall / Vergleichswert), Startpreis-Argumentationsseite (Studien-Daten: überhöhter Startpreis → längere Dauer, geringerer Erlös).
- Seiten-Baukasten: freie Zusatzseiten je Bewertung (Layouts Bild / Text / Bild+Text, Einfügepunkte über Anker an jeder Kapitelgrenze) + admin-gepflegte wiederverwendbare Bausteine.
- KI 1 — Gutachten-Auswertung: hochgeladenes Wertgutachten (PDF) wird ausgelesen, der Rechenweg landet als editierbare Posten auf der Herleitungsseite (Gutachten selbst geht NICHT an den Kunden, nur Arbeitsgrundlage).
- KI 2 — Preistrend: Screenshot eines Portal-Preischarts hochladen, KI liest die Datenpunkte aus, PDF zeichnet daraus ein natives Diagramm.
- Firmen-Kennzahlen (vermittelte Objekte, Erzielungsquote, Bewertungen …) jährlich im Admin pflegbar; Generator nimmt das höchste aktive Jahr MIT Daten.

#### A4 — Maklervertrag & Vollmacht (Dokumentgenerator)

- Vertragserstellung aus Formular mit Verkäufertypen: Einzelperson / Eheleute / Erbengemeinschaft / mehrere Verkäufer (bis 8) / Firma (Firmenname inkl. Rechtsform, „vertreten durch", optional Registergericht/HRB).
- Drei Provisionsmodelle: Teilung / reine Verkäuferprovision (Käufer provisionsfrei) / reine Käuferprovision — Vertragstexte passen sich automatisch an, inkl. Warnhinweis auf § 656d BGB im Formular bei reiner Käuferprovision (EFH/ETW an Verbraucher).
- Ausgabe als Word UND PDF im Mandanten-Layout; Vollmacht als Zusatzdokument (bei mehreren Verkäufern je Person eine Unterschriftslinie).
- KI-Import: bestehenden Alt-Vertrag als PDF hochladen → KI extrahiert die Vertragsdaten → Vorgang wird angelegt.

#### A5 — E-Signatur (eigenes System, zentraler Baustein)

- Unterschrift per Magic-Link ohne Login (Token-URL), Signatur zeichnen auf Touch/Maus; Signaturbild wird mit Trennlinie, Name und „Elektronisch unterschrieben am …" eingebrannt.
- Runden-Logik: beliebig viele Empfänger je Runde (z. B. alle Käufer parallel in Runde 1, Verkäufer in Runde 2), Folgestatus richtet sich nach der Rolle der nächsten Runde; Doppel-E-Mail-Prüfung.
- Makler-Vorunterzeichnung: hinterlegtes Unterschriftsbild je Nutzer wird automatisch eingesetzt (Fallback: Name in Schreibschrift) — der Makler muss nicht mehr per Link gegenzeichnen.
- Dokumenttypen polymorph (Maklervertrag, Vollmacht, Objektnachweis, Reservierung — erweiterbar); Layout des Signatur-PDFs entspricht dem jeweiligen Dokumentlayout (Unterschriftsfelder VOR Anlagen wie Widerrufsformular/AGB).
- Nach der letzten Unterschrift: fertiges PDF automatisch an ALLE Beteiligten + Kopie ins Postfach des objektzuständigen Maklers; lückenloses Ereignisprotokoll (Audit-Trail).
- Selbstbedienung „Abbrechen & mit Korrektur neu starten": laufenden Vorgang widerrufen, offene Token entwerten, Empfängerdaten (z. B. Namensfehler) korrigieren — optional direkt in die Stammdaten zurückschreiben — und mit einem Klick neu starten (Warnung, wer bereits unterschrieben hatte und erneut muss).
- Sicherheit: Token-Tabellen strikt per RLS abschotten (kein eingeloggter Nutzer darf fremde Token lesen); öffentliche Signatur-Endpunkte bewusst ohne Login, alles andere authentifiziert.

#### A6 — Objektnachweis

- Nachweis-/Reservierungsdokument mit Empfängerblock, GwG-Angaben je Käufer, Provisions-/Notar-/Vorkenntnis-Feldern, Widerrufsbelehrung, Muster-Widerrufsformular und AGB als Anlagen.
- Beidseitige Unterschrift: Käufer (Runde 1) UND Verkäufer (Runde 2); Verkäuferliste wird automatisch über den verknüpften Maklervertrag aus den Eigentümer-Stammdaten vorbelegt (editierbar, leere Liste = nur Käufer).

#### A7 — Reservierungen (Neubau)

- Reservierungsvereinbarungen je Einheit mit E-Signatur; Statusanzeige (z. B. Reserviert-Banner) für Schaufenster/Web.

#### A8 — Kaufabwicklung

- Käufererfassung (mehrere Käufer, inkl. Titel), Notar-Anschreiben mit Datenblättern (Anrede, Adressblöcke, vollständige Namen automatisch), Notar-Laufzettel mit Auswahl der abrechnenden Gesellschaft.

#### A9 — Übergabeprotokoll

- Digitales Protokoll mit kontextabhängigen Feldern (z. B. Rauchmelder nur wo relevant), Zählerständen, Schlüsseln, Unterschriften; für alle Teammitglieder nutzbar.

#### A10 — Miet-/Kaufanfragen

- Anbindung externer Formulare (z. B. JotForm) per Sync-Job; Anfragen werden Objekten zugeordnet und erscheinen in der Objektakte; Antwortvorlagen, optional mit Exposé-PDF als Anhang.

### B) Kommunikation

#### B1 — Posteingang (E-Mail-Client) (interner Baustein — nur bauen, wenn im Scope)

- Outlook-artig: mehrere Postfächer je Nutzer, 3-Spalten-Layout, Standardordner, Entwürfe mit Bearbeitungsmodus, Anhänge bis 25 MB.
- Versand über Mail-API (z. B. Resend) mit SMTP-Fallback; Absender bleibt echte Firmenadresse mit Reply-To.
- KI: Antwortvorschläge im Kontext, Anhang-Extraktion mit sinnvoller KI-Benennung, Mail→Notiz-Zusammenfassung.
- Komfort: Termin-Platzhalter im Editor, Absender→Zielordner-Lernen für die Ablage, Behörden-Datenbank für Amts-Korrespondenz.

#### B2 — Briefe

- Editierbare Geschäftsbriefe im Briefpapier-Design des Mandanten (Logo, Linienführung, Fußzeile mit Firmen-/Register-/Bankdaten LIVE aus den Stammdaten), mehrseitenfähig mit Folgeseiten-Kopf, PDF-Ausgabe.

#### B3 — Kundenzugänge / Kundenportal (nur bauen, wenn im Scope)

- Einladung von Eigentümern und Käufern in ein eigenes Portal: Dateifreigaben je Objekt, Nachrichten Makler ↔ Kunde, Benachrichtigungen empfängerbezogen und gebündelt (Upload-Debounce statt Mail-Flut), Archivierung abgeschlossener Zugänge.

### C) Marketing & Medien

#### C1 — Exposé-Schmiede (KI-Texte)

- Generiert: Objekttitel (≤100 Zeichen), Objekt- und Lagebeschreibung (Ziel 1.700–1.950, hart ≤2.000 Zeichen), Ausstattung als Bulletpoints, Energie-Hinweistext; 6 Stilrichtungen; Länge „kürzer" als Option.
- Prompt-Qualität: verkaufsfördernde Dramaturgie (stärkstes Argument zuerst → Rundgang → Technik → Außenbereich; Lage: Mikrolage → Versorgung → Freizeit → Anbindung → Zielgruppensatz), Fakten-Nutzen-Verknüpfung, Floskel-Verbotsliste.
- Vision: Objektfotos werden analysiert und fließen in die Texte ein; Bilder-Picker greift direkt auf die Objekt-Galerie zu (Web-Varianten, bereits genutzte markiert).
- Voll integriert: Eckdaten werden aus der Objektakte vorbefüllt (auch ungespeicherter Formularstand), Ergebnisse per Klick in die Objektfelder übernommen — DB UND offenes Formular werden synchron aktualisiert (klassische Falle: nur DB schreiben, Formular überschreibt beim nächsten Speichern).

#### C2 — Exposé-PDF + Web-Exposé

- PDF-Generator im Mandanten-CI: Titelbild nach Exposé-Titelbild-Logik (nie das gebrandete Portal-Bild), nur Bilder ohne Ausschluss-Flag, Highlights, Lagekarte + Distanzen, QR-Code, Ansprechpartner mit Foto.
- Zusätzlich Web-Exposé als teilbare Seite je Objekt.

#### C3 — Grundriss-Aufbereiter

- Stufe 1 (jede Quelle, auch Scans/Fotos): Weißpunkt-Streckung, Duotone in CI-Farben, Kompositions-Layout (Titel, Adresszeile, Flächen-KPIs, „nicht maßstabsgetreu"), Formate A4 quer + Quadrat; Zuschnitt per Aufziehen, PDF-Seitenwahl bei Mehrseitern.
- Stufe 2 (Architekten-PDFs mit echten Vektoren): Pfade aus dem PDF extrahieren, Wände von Bemaßung/Schraffur über Linienstärke trennen, Raumbeschriftung übernehmen, sauber neu rendern; automatische Erkennung, Scans fallen auf Stufe 1 zurück.
- Ergebnis landet als neue Grundriss-Datei in der Objekt-Galerie (Original bleibt, optional auf „intern").

#### C4 — Marketing-Editor / Vorlagen

- Vorlagen für Social, Print (Feld-Mapping aus Objekt- und Nutzerdaten inkl. Titel) und das gebrandete Portal-Hauptbild (Collage 1600×1200); Ein-Klick-Weg: Objektfoto wählen → branden → als Kopie ans Objekt + direkt als Hauptbild setzen.

#### C5 — Bild-Editor (inkl. RAW-Entwicklung)

- Canvas-Editor (Zuschnitt, Logo, Anpassungen) + echter RAW-Entwickler für Sony ARW & Co. (LibRaw als Wasm im Worker): Belichtung, Weißabgleich, Lichter-Rekonstruktion, Kontrast/Lichter/Tiefen/Weiß/Schwarz/Sättigung, idempotente Auto-Funktion (analysiert immer eine neutrale Basis, nie die schon angepasste Vorschau).
- Zweistufige Performance: schnelle Half-Size-Vorschau bei Decode-Reglern, sofortige LUT-Tonwerte ohne Re-Decode, Full-Res erst beim Übernehmen.
- Serienbearbeitung: mehrere Dateien als Serie mit Filmstreifen, jedes Bild einzeln bearbeiten, „alle speichern" gestaged; Einstellungen kopieren/einfügen und je Datei merken.
- Objekt-Integration in beide Richtungen: aus der Objekt-Galerie heraus öffnen (Ergebnis als Kopie zurück ans Objekt) und aus dem Editor gezielt „in Immobilie speichern" / „als Hauptbild setzen" (zuletzt genutztes Objekt als Schnellwahl).

#### C6 — Digital Signage / Schaufenster-TV (interner Baustein — nur bauen, wenn im Scope)

- Anbindung an Signage-Dienst, animierte Hochkant-Videovorlage (1080×1920) aus Objektdaten, Reserviert-Banner.

### D) Termine & Organisation

#### D1 — Kalender

- Eigener Terminkalender mit Objekt- und Kontakt-Verknüpfung, Erinnerungen; Sync mit Google und Outlook.

#### D2 — Notizen

- Persönliches Notizen-Dashboard je Nutzer (strikt privat per RLS), Spracheingabe (Speech-to-Text), KI-Vorschläge; Mail→Notiz aus dem Posteingang.

### E) Finanzen (interne Bausteine — nur bauen, wenn im Scope)

#### E1 — Rechnungen (GoBD-konform)

- Entwurf→Finalisieren-Workflow (finalisierte Rechnungen unveränderlich, DB-Trigger blockt Positionsänderungen), Storno statt Löschen, fortlaufende lückenlose Nummern je Absender und Jahr (Sequenz-Tabelle).
- Mehrere Rechnungs-Absender: Firmenstandorte UND persönliche Absender je Makler (Selfservice-Stammdaten inkl. Steuer-/Bankdaten, Kleinunternehmer-Option mit §19-Hinweis, eigener Nummernkreis mit Startnummer — änderbar nur solange keine echte Rechnung existiert).
- Rechte-Trennung: Makler sehen nur eigene Rechnungen, Chef alles; Vorbelegung aus Vertragsdaten (Provision).

#### E2 — Liquidität

- CSV-Import von Bankkonten (z. B. Qonto/Vivid), Kategorisierung, Liquiditäts-Forecast.

#### E3 — Provisions-Tracker

- Chef-only: Provisionsstaffeln je Mitarbeiter (z. B. 15–35 % gestaffelt), laufende Zählung pro Jahr.

### F) Team & Administration

#### F1 — Admin-Bereich

- Mitarbeiter einladen (Name, Titel, E-Mail, Firma/Standort, Stufe), Rechte-Karte je Mitarbeiter (alle Module einzeln schaltbar).
- Firmen-/Standort-Stammdaten (mehrere Gesellschaften: Anschrift, Register, Steuernummern, Bank — Vorsicht bei Defaults: Bankfelder beim Anlegen explizit leeren, nie aus anderen Zeilen erben).
- Branding-Verwaltung (Logo-Varianten, Unterschriftsbilder, Briefpapier), Kennzahlen-Pflege (MPE), Bausteine-Verwaltung (MPE-Zusatzseiten), Plattform-Admin (Mandanten, Abos, Credits) bei SaaS-Betrieb.

#### F2 — Bewerber / Einstellungstest (interner Baustein — nur bauen, wenn im Scope)

- Chef-only: Einladungen mit Token-Link (Gültigkeit 14 Tage, Quereinsteiger-Modus), öffentlicher Test ohne Login in derselben App (Token-URL), 6 Teile (~80 Min.), Auto-Bewertung (MC + Rechnen mit deutschem Zahlen-Parser und Toleranzen) + KI-Bewertung der Freitexte mit Lösungsschlüssel, K.-o.-Kriterium Sorgfalt, Empfehlungs-Badge, 7-dimensionales Motivationsprofil (Realitätsbild, Resilienz, EQ, Integrität, Teamfähigkeit, Selbstorganisation, Führungspotenzial) mit Interviewfragen; Chef-Notizfelder.

## Abo & Credits (SaaS-Betrieb)

- Stripe-Abos: Starter 29,99 € netto/Monat (1 Nutzer, 300 Credits), Professional 99,99 € (3 Nutzer, 1.500), Business 199,99 € (10 Nutzer, 4.000), Zusatznutzer 14,99 €; Jahrespreis = 10 Monatsbeiträge; 7-Tage-Test mit 100 Credits.
- Jede KI-Aktion (Texte, Vision, Dokumenten-Auslese, Bildbearbeitung) verbraucht Credits; Verbrauch transparent je Mandant, sauberes Verhalten bei 0 Credits (Hinweis + Nachkauf, kein stiller Fehler).

## Nicht-funktionale Anforderungen

- Mandantentrennung hat höchste Priorität: RLS auf jeder Tabelle ab Tag 1; Storage-Pfade je Mandant; Schutz-Trigger gegen Selbst-Privilegierung.
- GoBD serverseitig erzwingen (Unveränderlichkeit, Nummernkreise), nicht nur im UI.
- DSGVO: Datenminimierung, Löschkonzept, AV-tauglicher Aufbau; Signatur-Audit-Trail.
- PDF-Qualität: eine Farbreferenz je Mandant (Gold/Akzent überall identisch, keine „helleren" Varianten je Hintergrund), Zeichenbreiten-Cache und serverseitige Bildskalierung gegen CPU-Limits, dynamische Boxhöhen statt fester Maße (Überläufe konstruktiv ausschließen).
- Zahlen-Parsing deutsch (1.234,56) — Punkt nur als Tausendertrenner strippen, wenn das Muster passt; Floats direkt durchreichen (klassischer Bug: aus 332999.99 werden Billionen).
- Robustheit: Jobs mit Timeout, „latest wins" bei parallelen Läufen, idempotente Importe (Upsert über externe IDs), Dublettenschutz.

## Arbeitsweise für Claude Code

1. Phasenweise bauen (Reihenfolge und Gates laut Masterprompt); nach jeder Phase lauffähiger Stand, kein Big Bang.
2. Migrations versioniert und benannt; niemals destruktive Änderungen ohne Backup-Pfad.
3. Jedes Modul erfüllt die Grundprinzipien 1–6 (Objekt-Drehkreuz, Verkettung, editierbare KI, Automatik, Rechte, Bild-Pipeline) — das ist Teil der Definition of Done.
4. KI-Ausgaben immer als strukturierte JSON-Verträge mit Validierung; bei KI-Fehlern speichern + manuellen Weg anbieten, nie den Vorgang verlieren.
5. Keine Platzhalter-Implementierungen deployen; lieber Feature-Flag als halbfertige Funktion.
6. Referenz-Implementierung unter `reference/` nur lesend als fachliche Quelle nutzen — Verhalten nachbauen, Code nicht kopieren.
