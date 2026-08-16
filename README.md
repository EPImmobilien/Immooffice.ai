# ImmoOffice.ai

Mandantenfähige SaaS-Plattform für deutsche Immobilienmakler und
Immobiliensachverständige: Objekte, Kontakte, Exposés, Wertermittlung,
Portalexport, Verträge und Abrechnung in einer Anwendung.

**Aktueller Stand: Phase 1, Durchstich v0.1.** Gate A ist freigegeben.
Verfügbar sind Registrierung, Mandant und Rollen, Objekte, Kontakte, Exposé mit
Textentwurf und PDF-Export. Der Rest von Phase 1 folgt; **Gate B** steht vor dem
Livebetrieb der Abrechnung.

---

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [`docs/MASTERPROMPT.md`](docs/MASTERPROMPT.md) | Maßgeblicher Auftrag. Bei Widersprüchen gilt dieses Dokument. |
| [`CLAUDE.md`](CLAUDE.md) | Destillat der harten Regeln |
| [`docs/BESTANDSAUFNAHME.md`](docs/BESTANDSAUFNAHME.md) | Analyse der Referenz-Anwendung |
| [`docs/FUNKTIONSMATRIX.md`](docs/FUNKTIONSMATRIX.md) | Übernehmen / nicht übernehmen / neu konzipieren |
| [`docs/UMSETZUNGSPLAN.md`](docs/UMSETZUNGSPLAN.md) | Phasen, Aufwandsschätzung, Risiken |
| [`docs/TESTBERICHT.md`](docs/TESTBERICHT.md) | Was geprüft ist — und was nicht |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Zielarchitektur, Job-Verarbeitung, Sicherheit |
| [`DATA_MODEL.md`](DATA_MODEL.md) | Mandanten-, Rollen- und Datenmodell |
| [`OPENIMMO_MAPPING.md`](OPENIMMO_MAPPING.md) | Feldabbildung für den Portalexport |
| [`SECURITY_AND_DSGVO.md`](SECURITY_AND_DSGVO.md) | Sicherheit, Datenschutz, offene Punkte |
| [`DEPLOYMENT_NETLIFY.md`](DEPLOYMENT_NETLIFY.md) | Inbetriebnahme und Betrieb |
| [`PRICING_AND_GUV.md`](PRICING_AND_GUV.md) | Preise, GuV-Modell, Sensitivität |

## Schnellstart

Voraussetzungen: Node.js ≥ 20.11, npm, Zugang zum Supabase-Projekt.

```bash
npm install
cp .env.example .env.local     # Werte eintragen, siehe unten
npm run dev                    # http://localhost:3000
```

Designsystem und Kernkomponenten: <http://localhost:3000/styleguide>

### Umgebungsvariablen

`.env.example` beschreibt jede Variable. Zwingend für den Start sind
`NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY`; die übrigen werden
erst mit den jeweiligen Funktionen benötigt.

**Es gehören niemals echte Werte ins Repository.** `.env*` ist ausgenommen,
`.env.example` enthält ausschließlich Platzhalter.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktions-Build |
| `npm run typecheck` | TypeScript ohne Ausgabe |
| `npm run lint` | ESLint |
| `npm run test` | Unit-Tests (Vitest) |
| `npm run test:e2e` | Kernflüsse (Playwright) |
| `npm run marken-scan` | Prüfung auf Altkennzeichen und Geheimnisse |
| `npm run pruefen` | Alles zusammen — vor jedem Meilenstein |

Weitere Werkzeuge:

```bash
psql "$DATENBANK_URL" -f supabase/tests/rls-mandantentrennung.sql  # Mandantentrennung
python3 scripts/guv-modell.py            # Wirtschaftlichkeitsmodell neu rechnen
python3 scripts/build-brand.py <ttf>     # Markenassets neu erzeugen
scripts/analyse-referenz.sh              # Referenzanalyse reproduzieren
```

## Projektstruktur

```
src/
  app/           Routen (App Router), /styleguide
  components/    Anzeigekomponenten ohne Datenzugriff
  lib/           Supabase, Auth, Credits, OpenImmo, KI, Jobs
  middleware.ts  Sicherheits-Kopfzeilen und CSP mit Nonce
supabase/        Migrationen
scripts/         Analyse, Marken-Scan, Marke, GuV-Modell
assets/brand/    Markenassets (erzeugt)
docs/            Auftrag und Analysen
reference/       Referenzmaterial — bewusst nicht versioniert
```

## Grundregeln

- **Deutsch** als Oberflächensprache, Struktur für spätere Übersetzung vorbereitet.
- **Keine Kennzeichen der Referenz-Anwendung**, an keiner Stelle. Prüfung über
  `npm run marken-scan`.
- **Mandantentrennung** wird in der Datenbank erzwungen (RLS), nicht in der Oberfläche.
- **Keine Geheimnisse** im Repository oder im Client.
- **KI erfindet keine Objektdaten.** Fehlende Angaben werden gekennzeichnet und sind
  vor Veröffentlichung zu bestätigen.
- **Credits** werden nur für KI-Erzeugung berechnet — nie für PDF-Export oder erneute
  Downloads.

## Datenverarbeitung

Datenbank, Authentifizierung und Dateien liegen bei Supabase in `eu-central-1`
(Frankfurt am Main). Schriften werden selbst ausgeliefert; es besteht zur Laufzeit
keine Verbindung zu einem fremden CDN. Einzelheiten und offene juristische Punkte
stehen in [`SECURITY_AND_DSGVO.md`](SECURITY_AND_DSGVO.md).
