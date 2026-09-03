# Status

Fortlaufender Statusbericht, verlangt von [`docs/AUTONOMIE.md`](AUTONOMIE.md),
Abschnitt 0.4 und 0.6. Neueste Einträge oben.

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
