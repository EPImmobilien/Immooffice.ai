# Anleitung — was Sie selbst klicken müssen

Diese Anleitung ist für Sie als Auftraggeber geschrieben, ohne Fachbegriffe.
Sie enthält alles, was die Entwicklung nicht für Sie tun kann, weil es Ihre
Zugänge, Ihre Verträge oder Ihre Entscheidungen braucht. Die Reihenfolge ist
die Reihenfolge, in der Sie es erledigen sollten.

Verlangt von [`docs/AUTONOMIE.md`](AUTONOMIE.md), Abschnitt 0.7. Was gerade
fehlt: [`docs/ZUGAENGE_FEHLEND.md`](ZUGAENGE_FEHLEND.md).

---

## 0. Einmal vorab: die Datei `.env.local` anlegen

Alle Zugangsdaten stehen in einer einzigen Datei namens `.env.local` im
Hauptordner des Projekts. Diese Datei wird **nie** ins Internet hochgeladen —
sie steht in der Liste der ausgeschlossenen Dateien.

1. Öffnen Sie den Projektordner im Datei-Explorer.
2. Kopieren Sie die Datei `.env.example` und nennen Sie die Kopie `.env.local`.
   Falls Windows die Endung versteckt: Rechtsklick → Umbenennen → den Namen
   genau so eingeben, inklusive Punkt am Anfang.
3. Öffnen Sie `.env.local` mit dem Editor (Rechtsklick → Öffnen mit → Editor).
4. Tragen Sie hinter jedem `=` den jeweiligen Wert ein — woher die Werte kommen,
   steht in den folgenden Abschnitten. Zeilen, die Sie noch nicht füllen
   können, lassen Sie leer.
5. Speichern (Strg + S).

Den Wert für `VERSCHLUESSELUNG_SCHLUESSEL` erzeugen Sie selbst — Abschnitt 6.

## 1. Werkzeuge ohne Administratorrechte installieren (Windows)

Sie brauchen keine Administratorrechte. Alles läuft im eigenen Benutzerordner.

1. **Node.js:** Gehen Sie auf nodejs.org, laden Sie unter „Download" die Datei
   mit „Windows Binary (.zip)" für 64-Bit herunter (Version 20 oder neuer).
   Entpacken Sie den Ordner nach `%LOCALAPPDATA%\Programs\node`
   (in der Adresszeile des Explorers `%LOCALAPPDATA%\Programs` eingeben und
   dort einen Ordner `node` anlegen).
2. Windows-Taste → „Umgebungsvariablen für dieses Konto bearbeiten" eingeben →
   öffnen. Bei „Path" auf Bearbeiten → Neu → den Ordner von oben eintragen →
   OK, OK.
3. Öffnen Sie eine **neue** Eingabeaufforderung (Windows-Taste, `cmd`, Enter)
   und tippen Sie `node -v`. Erscheint eine Versionsnummer, ist alles richtig.
4. **Git:** Auf git-scm.com → Download → „64-bit Git for Windows Portable".
   Die Datei ausführen und als Zielordner `%LOCALAPPDATA%\Programs\git`
   wählen. Danach wie bei Schritt 2 den Unterordner `cmd` dieses Ordners zum
   „Path" hinzufügen.
5. Die übrigen Werkzeuge (Supabase, Netlify, Stripe) werden über `npx`
   gestartet und brauchen keine Installation.

## 2. GitHub — Ihr Quellcode-Speicher

1. Melden Sie sich auf github.com an.
2. Oben rechts auf Ihr Profilbild → **Settings** → ganz unten links
   **Developer settings** → **Personal access tokens** → **Tokens (classic)**
   → **Generate new token (classic)**.
3. Bei „Note" eintragen: `immooffice`. Bei „Expiration": 90 days.
   Häkchen setzen bei **repo** und **workflow**. Unten **Generate token**.
4. Den angezeigten Text (beginnt mit `ghp_`) sofort kopieren — er wird nur
   einmal gezeigt — und in `.env.local` hinter `GITHUB_TOKEN=` einfügen.
5. Hinter `GITHUB_OWNER=` Ihren GitHub-Benutzernamen eintragen.

**Branch-Schutz für `main`** (verhindert, dass ungeprüfter Code live geht):
Im Repository → **Settings** → **Branches** → **Add branch ruleset** →
Name `main`, Enforcement „Active", unter Targets „Include default branch",
dann Häkchen bei **Require a pull request before merging** und **Require
status checks to pass** (dort „Pruefen" auswählen) → **Create**.

## 3. Netlify — dort läuft die Anwendung

1. Auf netlify.com anmelden (am einfachsten mit „Sign up with GitHub").
2. Oben rechts auf Ihr Profilbild → **User settings** → **Applications** →
   **Personal access tokens** → **New access token**. Beschreibung
   `immooffice`, Ablauf 1 Jahr → **Generate token**.
3. Den Text kopieren und in `.env.local` hinter `NETLIFY_AUTH_TOKEN=` einfügen.

Alles Weitere (Site anlegen, mit GitHub verbinden, Umgebungsvariablen setzen)
erledigt die Entwicklung mit diesem Token. Sie müssen später nur noch **die
Domain** eintragen:

4. Bei Ihrem Domain-Anbieter (dort, wo Sie `immooffice.ai` gekauft haben) in die
   DNS-Einstellungen gehen und zwei Einträge anlegen:
   - Typ `A`, Name `@`, Wert `75.2.60.5`
   - Typ `CNAME`, Name `www`, Wert `<name-der-site>.netlify.app`
     (den genauen Namen sagt Ihnen die Entwicklung in `docs/STATUS.md`).
5. In Netlify: Ihre Site → **Domain management** → **Add a domain** →
   `immooffice.ai` eingeben → Verify → Add domain. Das Zertifikat für HTTPS
   entsteht danach automatisch (kann bis zu einer Stunde dauern).

## 4. Supabase — die Datenbank

Das Projekt `usguiggfciavwzkdfjgt` in Frankfurt gibt es bereits. Es wird
**kein** neues angelegt.

1. Auf supabase.com anmelden.
2. Oben rechts auf Ihr Profilbild → **Account preferences** → **Access Tokens**
   → **Generate new token** → Name `immooffice` → Generate token. Kopieren und
   in `.env.local` hinter `SUPABASE_ACCESS_TOKEN=` einfügen.
3. Projekt öffnen → links unten das Zahnrad **Project Settings** → **Database**
   → bei „Database password" auf **Reset database password** (falls Sie das
   Passwort nicht mehr haben) → das neue Passwort hinter
   `SUPABASE_DB_PASSWORD=` eintragen.
4. Im selben Bereich **Project Settings** → **API**:
   - „Project URL" → hinter `NEXT_PUBLIC_SUPABASE_URL=`
   - „anon public" → hinter `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
   - „service_role" (auf „Reveal" klicken) → hinter `SUPABASE_SERVICE_ROLE_KEY=`
     — **dieser Wert ist geheim**, nie weitergeben, nie in eine E-Mail.

5. **E-Mail-Bestätigung bei der Registrierung:** Projekt → **Authentication**
   → **Providers** → **Email** → „Confirm email" muss **eingeschaltet** sein.
6. **Weiterleitungsadressen:** **Authentication** → **URL Configuration** →
   bei „Site URL" `https://immooffice.ai` eintragen; bei „Redirect URLs"
   hinzufügen: `https://immooffice.ai/auth/bestaetigen`,
   `https://*.netlify.app/auth/bestaetigen` und
   `http://localhost:3000/auth/bestaetigen`.

## 5. E-Mail-Versand (Einladungen, Erinnerungen)

1. Auf resend.com ein Konto anlegen.
2. **Domains** → **Add Domain** → `immooffice.ai` eingeben. Resend zeigt drei
   DNS-Einträge; die tragen Sie beim Domain-Anbieter genauso ein wie in
   Abschnitt 3.4. Danach in Resend auf **Verify** (kann bis zu einer Stunde
   dauern).
3. **API Keys** → **Create API Key** → Name `immooffice`, Permission „Sending
   access" → Create. Kopieren und hinter `MAIL_API_KEY=` einfügen.
4. Hinter `MAIL_ABSENDER=` eintragen: `noreply@immooffice.ai`.

Bis dieser Schritt erledigt ist, zeigt die Anwendung Einladungslinks zum
Kopieren an, statt sie zu verschicken — das funktioniert, ist nur weniger
bequem.

## 6. Verschlüsselungsschlüssel für gespeicherte Zugangsdaten

Zugangsdaten zu Fremdsystemen (etwa Ihr onOffice-Konto) werden verschlüsselt
gespeichert. Den Schlüssel dafür erzeugen Sie einmal selbst:

1. Eingabeaufforderung öffnen (Windows-Taste, `cmd`, Enter).
2. Eingeben und Enter drücken:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
3. Die ausgegebene Zeile (44 Zeichen) kopieren und hinter
   `VERSCHLUESSELUNG_SCHLUESSEL=` einfügen.

**Wichtig:** Bewahren Sie diesen Wert zusätzlich an einem sicheren Ort auf
(Passwort-Manager). Geht er verloren, müssen alle Kunden ihre Zugangsdaten zu
Fremdsystemen neu eingeben.

## 6a. Geheimnis für den Hintergrund-Arbeiter

Abgleiche mit anderen Systemen und Importe laufen im Hintergrund. Damit
niemand von außen diesen Arbeiter anstoßen kann, braucht er ein Geheimnis:

1. Eingabeaufforderung öffnen und eingeben:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Die Zeile kopieren und in `.env.local` hinter `JOB_GEHEIMNIS=` einfügen.
3. Denselben Wert in Netlify eintragen: Ihre Site → **Site configuration** →
   **Environment variables** → **Add a variable** → Key `JOB_GEHEIMNIS`, Value
   einfügen → Create variable. Ohne diesen Wert werden Aufträge zwar
   eingeplant, aber nicht ausgeführt.

Netlify ruft den Arbeiter danach von selbst jede Minute auf
(`netlify/functions/jobs-worker.mts`); Sie müssen nichts weiter einrichten.

## 7. KI-Anbieter

1. Auf platform.openai.com → **API keys** → **Create new secret key** → Name
   `immooffice` → Create. Kopieren, hinter `OPENAI_API_KEY=` einfügen.
2. Unter **Settings** → **Organization** → **Data controls** prüfen, ob
   „EU data residency" verfügbar ist, und es einschalten, falls ja.
3. Optional dasselbe bei console.anthropic.com für `ANTHROPIC_API_KEY=`.

## 8. Stripe — Abrechnung (erst Phase 3, im Testmodus)

1. Auf stripe.com ein Konto anlegen. Der Umschalter „Test mode" oben rechts
   bleibt **eingeschaltet**, bis die Entwicklung Gate B meldet.
2. **Developers** → **API keys**: „Secret key" hinter `STRIPE_SECRET_KEY=`,
   „Publishable key" hinter `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=`.
3. Alles Weitere (Produkte, Preise, Webhook, Kundenportal) legt die
   Entwicklung im Testmodus an und trägt die Preis-IDs in `.env.local` ein.
4. **Vor der Liveschaltung** (nach Gate B) müssen Sie selbst: **Settings** →
   **Business** → alle Unternehmensangaben ausfüllen, ein Bankkonto für
   Auszahlungen hinterlegen und unter **Settings** → **Tax** die
   Steuererfassung aktivieren. Dann teilen Sie der Entwicklung mit, dass der
   Livemodus freigegeben ist.

## 9. Postfächer und Kalender (Phase 4)

### Microsoft 365

1. Auf portal.azure.com anmelden → **App registrations** → **New registration**.
2. Name `ImmoOffice.ai`. Bei „Supported account types": **Accounts in any
   organizational directory (Any Microsoft Entra ID tenant)**.
   Bei „Redirect URI": Web, `https://immooffice.ai/api/auth/microsoft/callback`
   → Register.
3. Auf der Übersichtsseite „Application (client) ID" kopieren →
   `MICROSOFT_CLIENT_ID=`.
4. **Certificates & secrets** → **New client secret** → Beschreibung
   `immooffice`, Ablauf 24 Monate → Add. Den Wert unter „Value" (nicht „Secret
   ID") sofort kopieren → `MICROSOFT_CLIENT_SECRET=`.
5. **API permissions** → **Add a permission** → Microsoft Graph → Delegated →
   `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `offline_access`,
   `User.Read` → Add permissions.

### Google Workspace / Gmail

1. Auf console.cloud.google.com → Projekt anlegen `ImmoOffice`.
2. **APIs & Services** → **Enable APIs** → „Gmail API" und „Google Calendar
   API" aktivieren.
3. **OAuth consent screen** → External → App name `ImmoOffice.ai`, Support-
   E-Mail, Entwickler-E-Mail → Save. Unter „Scopes" die Gmail- und Calendar-
   Scopes hinzufügen. Unter „Test users" bis zu 100 Adressen eintragen —
   solange die App nicht von Google geprüft ist, können nur diese sie nutzen.
4. **Credentials** → **Create credentials** → OAuth client ID → Web application
   → Name `ImmoOffice.ai` → bei „Authorized redirect URIs":
   `https://immooffice.ai/api/auth/google/callback` → Create.
5. „Client ID" → `GOOGLE_CLIENT_ID=`, „Client secret" → `GOOGLE_CLIENT_SECRET=`.
6. Die Google-Prüfung („Verification") beantragen Sie, sobald die Anbindung
   fertig ist — das dauert mehrere Wochen und braucht eine öffentliche
   Datenschutzerklärung unter `https://immooffice.ai/datenschutz`.

## 10. onOffice — für Kunden, die es nutzen

Nichts für Sie zu tun: Jeder Kunde trägt seinen eigenen API-Token und sein
Geheimnis in ImmoOffice.ai unter **Einstellungen → Integrationen** ein. Wo er
die findet: In onOffice enterprise → **Marketplace** → **API-Zugang** (Token und
Geheimnis werden dort je Benutzer erzeugt).

## 11. Was Sie an Gate A und Gate B entscheiden

- **Gate A** (bereits erreicht): Bestandsaufnahme, Funktionsmatrix, Architektur
  und Umsetzungsplan freigeben — siehe `docs/STATUS.md`.
- **Gate B** (vor der Stripe-Liveschaltung): Die Entwicklung führt Ihnen die
  Kernflüsse vor und legt die Testnachweise zur Mandantentrennung vor. Sie
  geben Preise und Rechtstexte frei — **nach anwaltlicher Prüfung** von
  Vertragsmustern, Widerrufsbelehrung, Datenschutzerklärung und
  Signaturablauf. Ohne diese Prüfung geht nichts live.
