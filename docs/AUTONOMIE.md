# Autonomie- und Integrations-Prompt — ImmoOffice.ai

**Stand:** 03.09.2026 · Ablage laut Auftrag: `docs/AUTONOMIE.md`

Dieses Dokument legt fest, **wie** an ImmoOffice.ai gearbeitet wird (eigenständig,
ohne Rückfragen), welche **Standardentscheidungen** gelten, und spezifiziert die
Module **Registrierung/Onboarding/Self-Service-CI**, **Abo/Stripe**,
**Integrationen (CRM-Schnittstellen)** und **Postfächer**.

---

## Einordnung in die vorhandene Dokumentenlage

Der Auftragstext verweist auf `docs/FUNKTIONEN.md`, `docs/NEUTRALITAET.md` und
`scripts/check-neutral.sh`. Diese Namen gibt es im Repository nicht; die Inhalte
schon. Es gilt die folgende Zuordnung — sie ist eine Umbenennung, keine
inhaltliche Änderung:

| Auftragstext | tatsächlich im Repository |
|---|---|
| `docs/FUNKTIONEN.md` | [`docs/FUNKTIONSPROMPT.md`](FUNKTIONSPROMPT.md) |
| `docs/NEUTRALITAET.md` | Abschnitt „Abgrenzung“ in [`CLAUDE.md`](../CLAUDE.md), ausführlich in [`docs/MASTERPROMPT.md`](MASTERPROMPT.md) Abschnitt 2 |
| `scripts/check-neutral.sh` | [`scripts/marken-scan.sh`](../scripts/marken-scan.sh) (`npm run marken-scan`) |
| `docs/DATENMODELL.md` | [`DATA_MODEL.md`](../DATA_MODEL.md) |
| `docs/OPENIMMO_MAPPING.md` | [`OPENIMMO_MAPPING.md`](../OPENIMMO_MAPPING.md) |
| `docs/SCOPE.md` | [`docs/SCOPE.md`](SCOPE.md) — vorhanden, entscheidet über den Scope je Modul |
| `docs/ANLEITUNG_LASSE.md` | [`docs/ANLEITUNG.md`](ANLEITUNG.md) — ohne Personennamen im Dateinamen |
| `docs/legal/` | Rechtstexte liegen je Mandant in der Datenbank (`mandant_branding`); der Plattformrahmen in [`SECURITY_AND_DSGVO.md`](../SECURITY_AND_DSGVO.md) |

**Rangfolge bei Widersprüchen:**
`MASTERPROMPT` entscheidet über die Architektur (WIE, WANN) —
[`docs/SCOPE.md`](SCOPE.md) entscheidet, **ob** ein Modul gebaut wird —
dieses Dokument entscheidet über Arbeitsweise und über die hier ausdrücklich
getroffenen Fachentscheidungen. Wo zwei Dokumente dasselbe anders regeln, ist
die Auflösung in [`docs/ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md) einzeln begründet.

---

## 0. Arbeitsmodus: eigenständig, keine Rückfragen

1. **Keine Rückfragen.** Jede offene Frage wird selbst beantwortet, in dieser
   Reihenfolge: (a) dieses Dokument, (b) MASTERPROMPT / FUNKTIONSPROMPT /
   Abgrenzung, (c) branchenüblicher Standard für deutsche Maklersoftware,
   (d) die einfachste Lösung, die später erweiterbar bleibt. Die Entscheidung
   wird mit einem Satz Begründung in `docs/ENTSCHEIDUNGEN.md` festgehalten
   (fortlaufend, datiert).
2. **Zugänge liegen in `.env.local`** (Abschnitt 1). Sie werden gelesen und
   genutzt, nie erfragt. Fehlt ein Wert, wird in `docs/ZUGAENGE_FEHLEND.md`
   vermerkt, was fehlt und wofür; alles Übrige läuft weiter, nur das betroffene
   Modul blockiert.
3. **GitHub, Netlify, Supabase und Stripe werden selbst bedient** — über CLI
   beziehungsweise API.
4. **Gate A und Gate B aus dem Masterprompt bleiben die einzigen Stopps.**
   Nach Phase 0 und vor der Stripe-Liveschaltung entsteht ein Statusbericht in
   `docs/STATUS.md`, dann endet der Lauf. Alles dazwischen läuft durch.
5. **Fehler werden selbst behoben.** Build rot → reparieren. Migration schlägt
   fehl → korrigieren, erneut ausführen. Deploy scheitert → Protokoll lesen,
   beheben. Erst nach drei gescheiterten Versuchen desselben Problems geht es
   nach `docs/BLOCKER.md` und mit dem nächsten Arbeitspaket weiter.
6. **Jedes Arbeitspaket endet mit:** Tests grün · `npm run marken-scan` grün ·
   Commit mit sprechender Nachricht · Push · erfolgreiche Deploy-Vorschau ·
   Eintrag in `docs/STATUS.md`.
7. **Der Auftraggeber ist Git- und Deploy-Einsteiger.** Alles, was er selbst
   klicken muss, steht in `docs/ANLEITUNG.md` — Schritt für Schritt, ohne
   Fachbegriffe.

---

## 1. Zugänge und Selbstbedienung der Dienste

### 1.1 `.env.local`

Die Datei wird **einmal** vom Auftraggeber gefüllt und steht in `.gitignore`.
Struktur und Kommentare stehen in [`.env.example`](../.env.example); diese
Vorlagendatei enthält niemals echte Werte.

Benötigt werden Zugänge für: GitHub · Netlify · Supabase · Stripe (ab Phase 3,
Testmodus) · KI-Anbieter · Transaktionsmail · OAuth für Postfach- und
Kalenderanbindung (Phase 4) · Schlüssel zur Verschlüsselung gespeicherter
Fremdzugangsdaten.

Der Verschlüsselungsschlüssel heißt im Repository `VERSCHLUESSELUNG_SCHLUESSEL`
(nicht `CREDENTIALS_ENCRYPTION_KEY`) und wird erzeugt mit
`openssl rand -base64 32`.

### 1.2 Selbstbedienung

- **GitHub:** Anmeldung per Token, privates Repository, Branch-Schutz für `main`,
  Actions für Typecheck, Lint, Test und Marken-Scan. `reference/` steht in
  `.gitignore`.
- **Netlify:** Anmeldung per Token, Site anlegen und mit dem Repository
  verknüpfen (Continuous Deployment von `main`, Deploy-Vorschau für Pull
  Requests), Umgebungsvariablen per `netlify env:set` setzen, Domain
  vorbereiten. Kein Drag-and-Drop-Deploy.
- **Supabase:** ausschließlich Projekt `usguiggfciavwzkdfjgt`, Region
  `eu-central-1`. Migrationen versioniert unter `supabase/migrations/`,
  Ausrollen per `supabase db push`. Kein neues Projekt.
- **Stripe:** Produkte, Preise, Webhook-Endpunkt und Kundenportal im **Testmodus**
  per CLI/API anlegen. Livebetrieb erst nach Gate B.
- **Windows ohne Administratorrechte:** alle Werkzeuge so installieren, dass sie
  ohne erhöhte Rechte laufen (`npx`, `winget --scope user`, portable Binärdateien
  unter `%LOCALAPPDATA%`). Dokumentiert in `docs/ANLEITUNG.md`.

---

## 2. Standardentscheidungen

Sie gelten, bis sie in `docs/ENTSCHEIDUNGEN.md` ausdrücklich überschrieben werden.

### Registrierung und Anmeldung

| # | Entscheidung |
|---|---|
| R1 | Registrierung mit E-Mail und Passwort, zusätzlich Magic-Link. Anmeldung über Google/Microsoft erst Phase 4, technisch vorbereitet. |
| R2 | E-Mail-Bestätigung ist Pflicht vor der ersten Anmeldung. |
| R3 | Wer zuerst registriert, wird **Inhaber** und legt das Unternehmen an. Mitarbeiter kommen ausschließlich über einen Einladungslink (7 Tage gültig) hinzu. Ein Konto gehört genau einem Unternehmen. |
| R4 | Die Gewerbeerlaubnis nach § 34c GewO wird nicht geprüft; erfasst wird nur die Erlaubnisbehörde für das Impressum. |
| R5 | Passwort mindestens 10 Zeichen. Zwei-Faktor-Anmeldung (TOTP) optional je Benutzer, für den Inhaber empfohlen. |

### Onboarding und Stammdaten

| # | Entscheidung |
|---|---|
| O1 | Geführter Assistent: 1 Firmierung → 2 Anschrift → 3 Impressumsdaten → 4 Logo → 5 Farben → 6 Schrift → 7 Signatur → 8 Einladungen. Schritte 1–3 sind Pflicht, 4–8 überspringbar und jederzeit in den Einstellungen nachholbar. Ohne 1–3 entsteht kein Dokument. |
| O2 | Ein Standort in Stufe 1; die Tabelle `standorte` (1:n zum Mandanten) ist trotzdem bereits angelegt. |
| O3 | Persönliche Angaben (Foto, Mobilnummer, Funktion, Signatur) pflegt jeder Makler selbst; der Inhaber kann übersteuern. |
| O4 | Alle Felder mit Pflicht- beziehungsweise Optional-Kennzeichnung und Prüfung direkt im Feld (Postleitzahl fünfstellig, Format der USt-IdNr., E-Mail). |

### Erscheinungsbild (Self-Service-CI)

| # | Entscheidung |
|---|---|
| B1 | Der Mandant wählt Primär- und Akzentfarbe. Hintergrund, Text, Ränder und Hover-Stufen werden abgeleitet; Kontrastprüfung nach WCAG AA mit Warnung und Korrekturvorschlag. |
| B2 | Schriften aus kuratierter Liste (OFL). Serifenlos: Inter, Montserrat, Poppins, Work Sans, Source Sans 3, Nunito Sans. Mit Serifen: Marcellus, Cormorant Garamond, Playfair Display, Lora, EB Garamond, Libre Baskerville. Je eine Wahl. Kein Schrift-Upload in Stufe 1. |
| B3 | Logo-Upload als PNG, SVG oder JPG, hell und dunkel (dunkel optional — sonst wird die helle Fassung auf dunklem Grund mit weißer Fläche hinterlegt). Farbvorschläge werden aus dem Logo abgeleitet. |
| B4 | Das Erscheinungsbild greift in allen Dokumenten, Exposés und Endkundenmails sowie in Kopfzeile, Hauptschaltflächen und Akzenten der Anwendung. Die Anmeldeseite bleibt im Plattformdesign. Eigene Subdomain je Unternehmen erst Phase 5. |
| B5 | Live-Vorschau im Editor: Exposé-Deckblatt, ein Social-Motiv, eine E-Mail. |
| B6 | Gespeichert wird in `mandant_branding`, Dateien im Storage unter `<mandant_id>/`. Die Anwendung lädt das Erscheinungsbild bei der Anmeldung und setzt CSS-Variablen; kein Neuladen nötig. |

### Team und Rechte

| # | Entscheidung |
|---|---|
| T1 | Es bleiben die **sechs Rollen** des Masterprompts: Inhaber, Administrator, Makler, Assistenz, Marketing, Nur-Lese-Zugriff. Die im Auftragstext genannte Rolle „Buchhaltung“ wird über Feinrechte abgebildet (nur `abrechnung`), nicht über eine siebte Rolle. Begründung: [`docs/ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md), E-2026-09-03-02. |
| T2 | Standardmäßig sehen alle im Unternehmen alle Objekte und Kontakte; ändern dürfen Ersteller und Verwaltung. Unternehmensweit umschaltbar auf „nur eigene“ (`mandanten.objekt_sichtbarkeit`). |

### Plattform-Administration

| # | Entscheidung |
|---|---|
| A1 | Der Plattformbereich zeigt ausschließlich Metadaten: Mandant, Tarif, Anzahl Benutzer, Credit-Verbrauch, letzte Aktivität, Zustand der Integrationen. Keine Inhalte. |
| A2 | Zugriff auf Mandanteninhalte nur nach ausdrücklicher Freigabe durch einen Inhaber des Mandanten („Supportzugriff für 24 Stunden gewähren“), jeder Zugriff wird im `audit_log` protokolliert. |
| A3 | Mandanten kündigen selbst. Vor der Kündigung wird der vollständige Export angeboten (OpenImmo-XML, CSV, Dokumente als ZIP). |

---

## 3. Modul Registrierung, Onboarding, Einstellungen

**Routen:** `/registrieren` · `/anmelden` · `/einladung/[token]` ·
`/onboarding/[schritt]` · `/einstellungen` mit den Bereichen Unternehmen,
Erscheinungsbild, Team, Abo, Integrationen, Postfächer, Profil.

**Datenmodell — Erweiterungen des bestehenden Schemas:**

- `mandanten` +: `objekt_sichtbarkeit` (`alle` | `eigene`), `onboarding_abgeschlossen`
- `mandant_branding` +: `rechtsform`, `geschaeftsfuehrer`, `handelsregister`,
  `ust_id`, `aufsichtsbehoerde`, `schrift_serifenlos`, `schrift_serifen`,
  `favicon_pfad`, `signatur_html`
- `standorte` (id, mandant_id, bezeichnung, Anschrift, `ist_hauptsitz`)
- `einladungen` (id, mandant_id, email, rolle, token-Hash, läuft ab,
  angenommen am, eingeladen von)
- `audit_log` (id, mandant_id, benutzer_id, aktion, ziel, details, erstellt am)
- `plattform_admins` (benutzer_id) — nur über den Dienstschlüssel lesbar

Row-Level-Security auf allen Tabellen über `aktueller_mandant()`.

**Registrierung mit Einladung:** Löst das Konto einen gültigen Einladungs-Token
ein, entsteht der Benutzer im Unternehmen der Einladung mit deren Rolle. Ohne
Token entsteht ein neues Unternehmen, der Registrierende wird Inhaber,
`onboarding_abgeschlossen` ist `false`, die Testphase beginnt.

---

## 4. Modul Abo und Stripe

| # | Entscheidung |
|---|---|
| S1 | Tarife netto je Monat: Starter 29,99 € (1 Benutzer, 300 Credits), Professional 99,99 € (3 Benutzer, 1.500), Business 199,99 € (10 Benutzer, 4.000), Zusatzbenutzer 14,99 €. Jahrespreis = zehn Monatsbeiträge. |
| S2 | Testphase 7 Tage, 100 Credits, **ohne Zahlungsmittel**. Erinnerung an Tag 5 und Tag 7. |
| S3 | Nach der Testphase ohne Abo: 30 Tage Lesemodus mit Exportmöglichkeit, danach Löschung mit Vorwarnung an Tag 23 und 29. |
| S4 | Inklusiv-Credits verfallen zum Monatsende (Übertrag siehe Masterprompt); nachgekaufte Pakete 500 (19,99 €) und 1.000 (34,99 €) netto verfallen nicht. Verbrauch je Aktion: [`docs/CREDITS.md`](CREDITS.md). |
| S5 | Ein Downgrade mit zu vielen Benutzern greift zum nächsten Abrechnungstag; bis dahin muss der Inhaber Zugänge abschalten, sonst werden die zuletzt angelegten automatisch abgeschaltet. |
| S6 | Rechnungen vollständig über Stripe Invoicing und Stripe Tax (Deutschland 19 %, Reverse-Charge innerhalb der EU mit Prüfung der USt-IdNr.). Nummernkreis von Stripe, keine eigenen Rechnungsnummern. |
| S7 | Zahlungsarten: SEPA-Lastschrift und Karte. Kein Rechnungskauf. |
| S8 | Preise werden netto mit dem Hinweis „zzgl. USt.“ angezeigt. Zielgruppe sind ausschließlich Gewerbetreibende — bei der Registrierung bestätigt der Nutzer, als Unternehmer zu handeln. |
| S9 | Kundenportal von Stripe für Zahlungsmittel, Tarifwechsel und Rechnungen. Verarbeitete Ereignisse: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed` — **idempotent**. |
| S10 | Jede KI-Aktion bucht über die vorhandene Server-Funktion `credits_reservieren` / `credits_einloesen` / `credits_freigeben`; bei fehlendem Guthaben wird mit sprechender Meldung abgelehnt. Kein negativer Saldo. |

---

## 5. Modul Integrationen (Connector-Rahmen)

### 5.1 Architektur

Ein einheitlicher Rahmen, damit jede weitere Software mit einer Datei ergänzt
werden kann:

```
src/integrationen/
  kern/
    connector.ts     # Schnittstelle: id, name, faehigkeiten, pruefen(), holen(), senden()
    registry.ts      # alle Connectoren; die Oberfläche liest ausschliesslich hieraus
    modell.ts        # kanonisches Objekt-/Kontaktmodell
    zugangsdaten.ts  # AES-256-GCM mit VERSCHLUESSELUNG_SCHLUESSEL
  openimmo/          # Datei-Import und -Export, kein Vertragspartner nötig
```

**Kanonisches Modell:** Objekte, Kontakte, Termine, Aktivitäten, Dokumente,
Bilder. Feldliste in [`DATA_MODEL.md`](../DATA_MODEL.md); jeder Connector liefert
nur ein Mapping darauf. Grundlage ist
[`OPENIMMO_MAPPING.md`](../OPENIMMO_MAPPING.md), weil OpenImmo der De-facto-Standard
ist und laut Masterprompt Vorrang hat.

**Datenmodell:** `integrationen` · `integration_mappings` · `sync_laeufe`
(Aufbau siehe Migration `20260903120100_integrationen.sql`).

**Fähigkeiten je Connector:** `objekte_holen`, `objekte_senden`,
`kontakte_holen`, `kontakte_senden`, `termine`, `bilder`, `dokumente`,
`rueckruf`. Die Oberfläche zeigt nur, was der Connector tatsächlich kann.

### 5.2 Connectoren Stufe 1

| Anbieter | Anmeldung | Umfang | Zustand |
|---|---|---|---|
| **OpenImmo** | keine | XML-Import (ZIP mit Bildern) und Export | umgesetzt |
| **Propstack** | API-Schlüssel im Kopf | Objekte, Kontakte, Aufgaben, Bilder — beide Richtungen | geplant, Phase 4 |
| **FlowFact** | OAuth2 (Client Credentials) | Objekte und Kontakte importieren, Objekte exportieren | geplant, Phase 4 |
| **onOffice** | API-Token und Geheimnis (HMAC-Signatur mit Zeitstempel) | Objekte, Adressen, Termine, Bilder — beide Richtungen | im Scope laut `docs/SCOPE.md`, Abschnitt G; nur die Abgleichlogik der Referenz übernehmen, keine Zugangsdaten oder Kennungen. Feldnamen werden vor dem ersten Lauf einzeln geprüft (siehe Connector) |

### 5.3 Verhalten

- **Richtung** je Integration wählbar: nur holen, nur senden, beides. Bei „beides“
  gewinnt die jüngste Änderung; Konflikte landen in einer Liste zur Prüfung.
- **Erstimport** mit Vorschau: Anzahl Objekte und Kontakte, Dublettenprüfung
  gegen den Bestand über Anschrift beziehungsweise Name und E-Mail.
- **Takt:** manuell, alle 15 Minuten, stündlich, täglich. Rückrufe, wo der
  Anbieter sie anbietet.
- **Schaltfläche „Verbindung prüfen“** vor dem Speichern.
- **Fehlerbehandlung:** ein fehlerhafter Datensatz stoppt den Lauf nicht;
  Fehlerliste mit Wiederholung.
- **Datenschutz:** Zugangsdaten nur verschlüsselt, nie im Protokoll; Anbieter in
  der Liste der Auftragsverarbeiter nachpflegen.
- **Neutralität:** kein Connector bringt Standardzugangsdaten mit.

### 5.4 Eigene Schnittstelle (Phase 5)

REST mit einem Schlüssel je Mandant (`/api/v1/objekte`, `/kontakte`, `/termine`),
OpenAPI-Beschreibung, ausgehende Rückrufe (`objekt.angelegt`, `kontakt.angelegt`,
`termin.angelegt`), 600 Anfragen je Minute und Schlüssel.

---

## 6. Modul Postfächer (Phase 4)

| # | Entscheidung |
|---|---|
| P1 | Jeder Benutzer kann mehrere Postfächer verbinden; der Inhaber zusätzlich Unternehmenspostfächer und deren Freigabe an Kollegen. |
| P2 | Anbindung über Microsoft 365 (Graph, OAuth2), Google Workspace/Gmail (OAuth2) und IMAP/SMTP (beliebiger Anbieter, Zugangsdaten verschlüsselt). |
| P3 | **Kein vollwertiger Mail-Client.** Umfang: Eingang lesen, Suche, Senden und Antworten aus der Anwendung, automatische Zuordnung zu Kontakten (Absender) und Objekten (Betreff, Objektnummer, Anschrift), Anhänge in die Unterlagen übernehmen, KI-Antwortentwurf. Ordner, Regeln und Signaturverwaltung bleiben beim Anbieter. |
| P4 | Abgleich alle fünf Minuten (Delta-Token beziehungsweise UID), Push wo verfügbar. Gespeichert werden nur Kopfdaten und Text; Anhänge auf Anforderung. |
| P5 | Versand über das verbundene Postfach des Benutzers, damit die Nachricht in dessen Ordner „Gesendet“ liegt. Nur ohne verbundenes Postfach über den Plattformversand mit Antwortadresse des Maklers. |
| P6 | Die Signatur aus Profil und Erscheinungsbild wird angehängt, wenn der Benutzer das aktiviert; sonst gilt die Signatur des Anbieters. |
| P7 | Aufbewahrung gespiegelter Nachrichten 24 Monate, danach nur die Verknüpfung (Betreff, Datum, Kontakt); je Unternehmen einstellbar. Beim Trennen werden gespiegelte Inhalte gelöscht, Verknüpfungen bleiben anonymisiert. |
| P8 | Das Postfachmodul der Referenz wird **nicht** nachgebaut; nur die Zuordnungslogik dient als Vorbild. Der Masterprompt schließt einen E-Mail-Client aus — umgesetzt wird deshalb ausschließlich der hier beschriebene, deutlich engere Umfang. |

---

## 7. Ergänzung zu den Phasen des Masterprompts

| Phase | Ergänzung durch dieses Dokument |
|---|---|
| 0 | `.env.local` anlegen und prüfen, Repository/Netlify/Supabase verbinden, CI mit Neutralitätsprüfung, `docs/ENTSCHEIDUNGEN.md` beginnen — dann **Gate A** |
| 1 | Registrierung, Anmeldung, Einladungen, Onboarding-Assistent, Erscheinungsbild mit Live-Vorschau, Rollen |
| 2 | Connector-Rahmen, OpenImmo-Import und -Export, Auftragswarteschlange |
| 3 | Stripe im Testmodus vollständig (Tarife, Testphase, Credits, Portal, Rückrufe) — dann **Gate B** |
| 4 | Postfächer (Microsoft 365, Gmail, IMAP), Propstack, FlowFact, Anmeldung über Google/Microsoft |
| 5 | Subdomains je Unternehmen, eigene Schnittstelle mit Rückrufen, Portale |

---

## 8. Abnahme je Phase

Zusätzlich zu Masterprompt und Abgrenzung:

1. **Endtest „Neuer Makler“:** registrieren → bestätigen → Onboarding →
   Kollegin einladen → Erscheinungsbild setzen → Objekt aus OpenImmo importieren
   → Exposé erzeugen → versenden → Abo im Testmodus abschließen — ohne
   Eingriff von Entwicklerseite.
2. `docs/ANLEITUNG.md` enthält alles, was der Auftraggeber selbst klicken muss,
   in der richtigen Reihenfolge.
3. `docs/ENTSCHEIDUNGEN.md` und `docs/STATUS.md` sind aktuell.
