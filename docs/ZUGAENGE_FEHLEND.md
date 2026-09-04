# Fehlende Zugänge

Verlangt von [`docs/AUTONOMIE.md`](AUTONOMIE.md), Abschnitt 0.2: Fehlt ein Wert in
`.env.local`, steht hier, **was** fehlt und **wofür**. Alles andere läuft weiter;
nur das betroffene Modul wartet.

Vorlage aller Schlüssel: [`.env.example`](../.env.example). Wie die Werte
beschafft werden: [`docs/ANLEITUNG.md`](ANLEITUNG.md).

**Stand:** 03.09.2026 — in der Entwicklungsumgebung dieses Laufs lag **keine**
`.env.local` vor. Die Datenbank war trotzdem erreichbar: über die
Verwaltungsschnittstelle des Projekts wurden die Migrationen ausgerollt und
die Nachweise ausgeführt (`docs/STATUS.md`). Für alles andere gilt die Tabelle.

| Schlüssel | Wofür | Blockiert |
|---|---|---|
| `GITHUB_TOKEN`, `GITHUB_OWNER` | Branch-Schutz für `main`, Repository-Einstellungen per CLI | nichts — Push läuft über die Sitzung; Branch-Schutz ist in `docs/ANLEITUNG.md` beschrieben |
| `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_NAME` | Site anlegen, Umgebungsvariablen setzen, Deploy-Vorschau | Deploy-Vorschau je Arbeitspaket |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | `supabase link`, `supabase db push` als Werkzeugkette des Auftraggebers | nichts Akutes — die Migrationen `20260903*` sind ausgerollt; die CLI-Kette bleibt für künftige Läufe einzurichten |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anwendung gegen die Datenbank starten | lokaler Start, Endtest „Neuer Makler“ |
| `SUPABASE_SERVICE_ROLE_KEY` | Einladung einlösen (Dienstrolle), Stripe-Rückrufe, Hintergrundjobs | Einlösen von Einladungen im Betrieb |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Phase 3: Tarife, Abrechnungsportal, Rückrufe im Testmodus | Modul Abo (Phase 3) |
| Stripe-Live-Schlüssel (`sk_live_…`, `pk_live_…`, Webhook-Geheimnis im Livemodus) und `STRIPE_LIVE_BESTAETIGT="ja"` | Livebetrieb der Abrechnung nach Gate B — Voraussetzung: anwaltlich geprüfte Rechtstexte | Stripe bleibt im Testmodus; das Einrichtungsskript verweigert Live-Schlüssel ohne `--live` und Bestätigung (`docs/ANLEITUNG.md`, Abschnitt 8) |
| `OPENAI_API_KEY` bzw. `ANTHROPIC_API_KEY` | KI-Texte, Bildbearbeitung (Bild-Editor: Himmel, Retusche, Home Staging, Optimierung über `OPENAI_BILDMODELL`), Energieausweis-Auslesung | KI-Erzeugung; die Anwendung kennzeichnet fehlende KI (`src/lib/ki/ohne-ki.ts`); der Bild-Editor arbeitet ohne KI mit Zuschnitt, Korrekturen, Verpixeln, Text, Logo und RAW |
| `MAIL_API_KEY`, `MAIL_ABSENDER` | Transaktionsmails: Einladungen, Testphasen-Erinnerungen | automatischer Versand von Einladungslinks — bis dahin Link zum Kopieren (E-2026-09-03-07) |
| `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET/TENANT_ID` | Phase 4: Postfächer über Microsoft 365 und Google (OAuth), Anmeldung über Google/Microsoft; seit Paket 12 auch der Kalender-Abgleich (Berechtigungen `Calendars.ReadWrite` bzw. `calendar.events` werden beim Verbinden mit angefragt) | Verbinden von Microsoft-/Google-Postfächern — IMAP/SMTP funktioniert ohne; die Schaltflächen bleiben bis dahin mit Hinweis gesperrt (`docs/ANLEITUNG.md`, Abschnitt 9); der Kalender-Abgleich ist gebaut und gegen die Schnittstellenbeschreibung geschrieben, aber ohne Zugang nicht live geprüft — das ICS-Abo funktioniert unabhängig davon |
| `ROUTING_API_KEY` (OpenRouteService) | Fahrzeiten im Kalender aus der Straßenroute | nichts Akutes — ohne Schlüssel schätzt die Anwendung aus der Luftlinie und kennzeichnet das; Geokodierung läuft über OpenStreetMap (Nominatim, mit Cache) |
| `VERSCHLUESSELUNG_SCHLUESSEL` | Zugangsdaten von Integrationen und Postfächern verschlüsseln | Speichern einer Integration mit Zugangsdaten; Erzeugen: `openssl rand -base64 32` |
| Propstack-Testzugang (API-Schlüssel eines Testkontos) | Phase 4: Pfade und Feldnamen des Propstack-Connectors gegen ein echtes Konto prüfen | den ersten Kundenlauf mit Propstack — der Connector ist gebaut und getestet, seine Feldnamen sind Annahmen nach der öffentlichen Dokumentation (E-31) |
| FlowFact-Testzugang (Client-ID/-Geheimnis, aktuelle Schnittstellenbeschreibung) | Phase 4: Token-Adresse, Basisadresse, Pfade und Feldnamen des FlowFact-Connectors prüfen | den ersten Kundenlauf mit FlowFact (E-31) |
| `WAECHTER_EMPFAENGER` | Empfänger der Wächter-Befunde (Hintergrundketten) | Benachrichtigung des Betreibers; der Befund wird trotzdem stündlich erhoben und im Antwortkörper des Worker-Endpunkts ausgegeben |
| `JOB_GEHEIMNIS` | Schutz des Worker-Endpunkts `/api/jobs/ausfuehren`, den Netlify minütlich aufruft | Hintergrundausführung von Abgleichen und Importen; bis dahin läuft nur der Sofortversuch aus der Server Action (Zeitbudget 8 s) — Erzeugen: `openssl rand -hex 32`, auch bei Netlify setzen |

Sobald ein Wert vorliegt, wird die Zeile hier gestrichen und der zugehörige
Schritt (Migration ausrollen, Deploy, Test) nachgeholt und in `docs/STATUS.md`
vermerkt.
