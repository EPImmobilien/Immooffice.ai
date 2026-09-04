# Inbetriebnahme auf Netlify

**Stand:** 16.08.2026 · Master-Prompt Abschnitt 4

---

## 1. Überblick

| Baustein | Zweck |
|---|---|
| Netlify | Build, Auslieferung, Server-Rendering, Background Functions |
| Supabase (`eu-central-1`) | Datenbank, Authentifizierung, Dateien, Warteschlange |
| Stripe | Abonnements, Zusatznutzer, Credit-Pakete |

Die Konfiguration steht in [`netlify.toml`](netlify.toml).

## 2. Erstmalige Einrichtung

### 2.1 Netlify-Projekt anlegen

1. Repository verbinden, Branch `main` als Produktion.
2. Build-Befehl `npm run build`, Verzeichnis `.next`.
3. Node-Version 22 (steht bereits in `netlify.toml`).
4. Das Next.js-Plugin wird über `netlify.toml` geladen.

### 2.2 Umgebungsvariablen setzen

Alle Variablen aus [`.env.example`](.env.example) in Netlify hinterlegen.
**Niemals** in das Repository schreiben.

Für den ersten Build ist **nichts** zu setzen: Die beiden Supabase-Werte stehen
in [`netlify.toml`](netlify.toml).

```
NEXT_PUBLIC_SUPABASE_URL       steht in netlify.toml
NEXT_PUBLIC_SUPABASE_ANON_KEY  steht in netlify.toml
```

Das ist bewusst so. Next setzt jede Variable mit dem Präfix `NEXT_PUBLIC_` zur
Bauzeit fest in den Code ein — der Anon-Schlüssel wird also ohnehin an jeden
Browser ausgeliefert. Der Schutz der Daten hängt an der Row-Level-Security, nicht
an der Geheimhaltung dieses Schlüssels. Im Gegenzug läuft ein frisch verbundenes
Netlify-Projekt ohne einen einzigen Handgriff in der Oberfläche.

**Werte aus `netlify.toml` haben Vorrang vor der Oberfläche.** Für ein anderes
Supabase-Projekt sind die beiden Zeilen dort zu entfernen, nicht in der
Oberfläche zu überschreiben.

`NEXT_PUBLIC_APP_URL` ist optional: Ohne diesen Wert bildet die Anwendung die
Adresse von Web-Exposés aus dem Host der Anfrage. Gesetzt werden sollte er,
sobald eine eigene Domain davorsteht.

Vor dem ersten Produktivbetrieb zusätzlich:

```
SUPABASE_SERVICE_ROLE_KEY      nur serverseitig, NIEMALS in netlify.toml
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
OPENAI_API_KEY
MAIL_API_KEY
VERSCHLUESSELUNG_SCHLUESSEL    openssl rand -base64 32
NEXT_PUBLIC_APP_URL            vollständige Produktionsadresse
```

**Trennung nach Kontext:** Produktion und Vorschau erhalten *unterschiedliche*
Schlüssel. Vorschau-Deployments dürfen niemals gegen die Produktionsdatenbank oder
gegen Stripe im Livemodus laufen.

### 2.3 Supabase vorbereiten

```bash
supabase link --project-ref usguiggfciavwzkdfjgt
supabase db push                       # Migrationen einspielen
```

Anschließend in Supabase prüfen:

- Für **jede** fachliche Tabelle ist RLS aktiv und mindestens eine Policy vorhanden.
- Storage-Buckets sind nicht öffentlich; Policies prüfen das erste Pfadsegment.
- Die Adresse der Anwendung ist als Redirect-URL für die Authentifizierung eingetragen.
- Erweiterungen `pgmq`, `pg_cron` und `pg_net` sind aktiviert (ab Phase 2 nötig).

### 2.4 Stripe verbinden

1. Produkte und Preise anlegen, Preis-IDs in die Umgebungsvariablen eintragen.
2. Webhook auf `https://<adresse>/api/stripe/webhook` einrichten.
3. `STRIPE_WEBHOOK_SECRET` übernehmen.
4. Zunächst im Testmodus prüfen — der Livebetrieb ist Bestandteil von **Gate B**.

Webhooks werden idempotent verarbeitet: Jede Ereignis-ID wird gespeichert, eine bereits
verarbeitete wird verworfen. Stripe stellt mehrfach zu; ohne diese Prüfung würden
Credits doppelt gutgeschrieben.

### Erstes Deployment — Reihenfolge

1. Repository verbinden, **Branch `claude/autonomie-integrations-prompt-rl2qkr`**
   als zu bauenden Branch wählen (das ist der aktuelle Stand mit allen
   Arbeitspaketen; `docs/STATUS.md`). Klick-für-Klick: `docs/ANLEITUNG.md`,
   Abschnitt 3a.
2. `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` stehen in
   `netlify.toml` — nichts zu tun. Ohne sie schlägt bereits die Middleware fehl
   und **jede** Seite antwortet mit HTTP 500.
3. Deployment starten und die vergebene Adresse notieren.
4. **Sofort nutzbar:** Anmeldung mit dem Demo-Zugang
   `demo-makler@example.com` / `Demo-Portal-2026!` (Mandant „Demo Immobilien
   GmbH", Testphase bis 31.12.2026, Onboarding abgeschlossen) oder mit dem
   eigenen Konto des Auftraggebers. Die Anmeldung mit Passwort braucht keine
   Weiterleitungsadresse.
5. In Supabase unter *Authentication → URL Configuration* die Adresse als
   *Site URL* und als *Redirect URL* eintragen. Ohne diesen Schritt schlagen
   Registrierung mit E-Mail-Bestätigung und „Passwort vergessen" ohne sichtbare
   Meldung fehl.
6. Entscheiden, ob die **E-Mail-Bestätigung** aktiv sein soll. Ist sie aktiv,
   entsteht bei der Registrierung noch keine Sitzung; die Anwendung zeigt dann
   den Hinweis, die Adresse zuerst zu bestätigen. Für einen schnellen Test ist
   sie einfacher abgeschaltet, für den Produktivbetrieb gehört sie an.
7. *Authentication → Policies*: **Schutz gegen bekannte geleakte Passwörter
   aktivieren** (Abschnitt 16 fordert ihn).
8. Danach nach Bedarf die serverseitigen Schlüssel in Netlify setzen
   (*Site configuration → Environment variables*), jeweils mit neuem Build:
   `SUPABASE_SERVICE_ROLE_KEY` (Betreiberbereich `/plattform`, Einladungen,
   Stripe-Rückrufe, Hintergrundjobs), `OPENAI_API_KEY` (KI-Texte, Auslesen,
   Bild-KI), `MAIL_API_KEY`/`MAIL_ABSENDER` (Versand), `VERSCHLUESSELUNG_SCHLUESSEL`
   (Integrationen, Postfächer), `JOB_GEHEIMNIS` (Hintergrund-Arbeiter),
   Stripe-Testschlüssel (Abo). Ohne diese Werte läuft alles Übrige; die
   betroffenen Stellen zeigen einen Hinweis statt eines Fehlers.

**Grenzen auf Netlify:** Anfragen an Server Actions sind auf 6 MB begrenzt.
Uploads über dieser Größe (RAW-Fotos, große PDFs) schlagen dort fehl, obwohl die
Anwendung 12 MB zulässt — für große Dateien den Upload direkt in den Speicher
(Storage) vorsehen, sobald der Betrieb es braucht.

## 3. Betrieb

### Vorschau-Deployments

Jeder Pull Request erhält ein eigenes Deployment. Diese tragen
`X-Robots-Tag: noindex, nofollow` und dürfen keine echten Kundendaten enthalten.

Der Header wird in `src/middleware.ts` anhand von `NEXT_PUBLIC_UMGEBUNG` gesetzt,
**nicht** in `netlify.toml`: Dort gelten Kopfzeilen für alle Kontexte, ein
pauschales `noindex` hätte auch die Produktion aus dem Index gehalten.

### Hintergrundaufgaben

Ab Phase 2 weckt `pg_cron` minütlich den Job-Worker als Netlify Background Function.
Der Zustand liegt in Supabase (`pgmq`), die Ausführung auf Netlify — Begründung in
[`ARCHITECTURE.md`](ARCHITECTURE.md), Abschnitt 3.

Der Worker-Endpunkt ist durch ein gemeinsames Geheimnis geschützt und niemals
öffentlich aufrufbar.

### Sicherungen

Supabase erstellt automatische Sicherungen. Zwei Punkte gehören zum Betrieb:

- Aufbewahrungsdauer entsprechend dem gewählten Tarif prüfen.
- **Die Wiederherstellung ist zu erproben, nicht nur zu konfigurieren** (Abschnitt 16).
  Eine ungetestete Sicherung ist keine Sicherung. Termin: Phase 3.

## 4. Vor jedem Produktiv-Deployment

```bash
npm run pruefen     # Typecheck, Lint, Tests, Marken-Scan
npm run build
```

Zusätzlich:

- [ ] Keine neuen Geheimnisse im Repository (`npm run marken-scan`)
- [ ] Migrationen sind aufwärtskompatibel zur laufenden Fassung
- [ ] RLS für neue Tabellen aktiv und getestet
- [ ] CSP gegen eine **echte Browsersitzung** geprüft — nicht nur gegen das HTML.
      Ein Fehler in der Policy blockiert die Skripte von Next.js; die Seite sieht dann
      normal aus, reagiert aber auf keine Eingabe (siehe `SECURITY_AND_DSGVO.md`).
- [ ] Stripe-Webhook erreichbar und Signaturprüfung aktiv

## 5. Rollback

Netlify hält frühere Deployments vor; die Rückkehr erfolgt über „Publish deploy“.

**Achtung:** Ein Rollback der Anwendung nimmt **keine** Datenbankmigration zurück.
Migrationen sind deshalb so zu schreiben, dass die vorherige Anwendungsfassung mit dem
neuen Schema weiterläuft — Spalten zunächst ergänzen, erst nach dem nächsten
erfolgreichen Deployment entfernen.

## 6. Fehlersuche

| Symptom | Ursache | Abhilfe |
|---|---|---|
| Seite lädt, aber nichts reagiert | CSP blockiert die Skripte von Next | Browserkonsole prüfen; Nonce muss an den `<script>`-Elementen stehen |
| `Missing Supabase URL` beim Build | Umgebungsvariable fehlt im Build-Kontext | In Netlify für **alle** Kontexte setzen |
| Anmeldung schlägt fehl, ohne Meldung | Redirect-URL nicht in Supabase hinterlegt | Adresse ergänzen |
| Webhook liefert 400 | Falsches `STRIPE_WEBHOOK_SECRET` | Geheimnis je Umgebung prüfen |
| Schriften werden nicht geladen | Build hatte keinen Netzzugang | Build wiederholen; `next/font` lädt zur Bauzeit |
