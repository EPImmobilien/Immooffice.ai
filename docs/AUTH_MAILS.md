# Anmelde-Mails: deutsch, im Namen der Firma, mit Logo

Supabase Auth verschickt Bestätigungs-, Einladungs-, Anmeldelink- und
Passwort-Mails aus **einer projektweiten, englischen Vorlage**. Für eine
mandantenfähige Plattform ist das doppelt falsch: falsche Sprache, falscher
Absender. Seit fork_88 übernimmt die Function `auth-mail` den Versand als
**Send-Email-Hook**: deutsch, mit Name, Logo und Farbe der Firma des
Nutzers, abgeschickt über deren Postfach (Resend). Bei der Registrierung
einer neuen Firma (noch kein Mandant) geht die Mail neutral im Namen von
immoOffice.

## Einrichten (einmalig, Betreiber, 5 Minuten)

Die Function ist ausgerollt. Der Hook selbst lässt sich nur im Dashboard
setzen — das Management-API ist aus der Entwicklungsumgebung nicht erreichbar.

1. Supabase → Projekt `usguiggfciavwzkdfjgt` → **Authentication → Hooks**.
2. **Send Email Hook** → *Enable* → Typ **HTTPS** → URL
   `https://usguiggfciavwzkdfjgt.supabase.co/functions/v1/auth-mail`.
3. **Generate secret** → den Wert (Form `v1,whsec_…`) kopieren.
4. **Project Settings → Edge Functions → Secrets** → `AUTH_HOOK_SECRET` =
   dieser Wert. Dazu müssen `RESEND_API_KEY` und `SMTP_FROM_EMAIL` gesetzt
   sein (`docs/SECRETS.md`) — ohne Versandweg antwortet der Hook mit Fehler,
   und Supabase meldet den Versand als gescheitert.
5. Prüfen: einmal „Firma registrieren" mit einer Testadresse. Die Mail muss
   deutsch sein und „immoOffice" als Absender tragen. Danach ein Eigentümer
   des Demo-Mandanten einladen: Absender und Logo sind die der Demo-Firma.

Was die Firma selbst pflegt, unter *Einstellungen → Firma & Impressum*:
**Marken-/Firmenname**, **Logo** (Marketing › Logos) und **Primärfarbe**.
Der Absender ist das Standardpostfach des Mandanten (*Einstellungen →
Postfächer*); fehlt es, die `SMTP_FROM_EMAIL` mit dem Firmennamen.

## Was der Hook verschickt

| Anlass (`email_action_type`) | Betreff | Inhalt |
|---|---|---|
| `signup` | Bitte bestätigen Sie Ihre E-Mail-Adresse — *Firma* | Knopf „E-Mail-Adresse bestätigen", Link als Text |
| `invite` | Sie wurden eingeladen — *Firma* | Knopf „Einladung annehmen", eingeladen von … |
| `magiclink` | Ihr Anmeldelink — *Firma* | Knopf „Jetzt anmelden", Code |
| `recovery` | Passwort zurücksetzen — *Firma* | Knopf „Passwort festlegen", Hinweis bei Fremdanforderung |
| `email_change` | Bitte bestätigen Sie Ihre neue E-Mail-Adresse — *Firma* | Knopf „Neue Adresse bestätigen" |
| `reauthentication` | Ihr Bestätigungscode — *Firma* | nur der Code |

Jede Mail trägt den Link zusätzlich als Text und, wo Supabase einen
sechsstelligen Code liefert, auch den Code. Der Link zeigt auf
`…/auth/v1/verify?token=…&type=…&redirect_to=<redirect_to | PORTAL_URL>`.

Sicherheit: Supabase signiert jeden Aufruf (Standard Webhooks). Die Function
prüft Signatur und Zeitstempel (5 Minuten) gegen `AUTH_HOOK_SECRET` und tut
ohne gültige Signatur nichts. Den Mandanten nimmt sie aus dem Profil des
Nutzers (`profiles`, ersatzweise `eigentuemer`), nie aus dem Aufruf.

## Rückfall: deutsche Vorlagen im Dashboard

Solange der Hook nicht aktiv ist, nutzt Supabase seine Vorlagen. Diese
lassen sich unter **Authentication → Email Templates** ersetzen — deutsch,
aber ohne Firmenbranding (die Vorlage ist projektweit; `{{ .Data.firma }}`
ist nur bei der Registrierung gefüllt). Zum Einfügen:

**Confirm signup — Betreff:** `Bitte bestätigen Sie Ihre E-Mail-Adresse`
```html
<h2>Willkommen{{ if .Data.firma }} bei immoOffice für {{ .Data.firma }}{{ end }}!</h2>
<p>Bitte bestätigen Sie Ihre E-Mail-Adresse, damit wir Ihren Zugang freischalten können.</p>
<p><a href="{{ .ConfirmationURL }}">E-Mail-Adresse bestätigen</a></p>
<p style="color:#7A828C;font-size:12px">Falls der Knopf nicht funktioniert: {{ .ConfirmationURL }}<br>Sie erhalten diese Mail, weil mit Ihrer Adresse ein Zugang angelegt wurde. War das nicht Sie, ignorieren Sie die Nachricht.</p>
```

**Invite user — Betreff:** `Sie wurden eingeladen`
```html
<h2>Ihre Einladung</h2>
<p>Sie wurden eingeladen, den Kundenbereich zu nutzen. Über den Link legen Sie Ihr Passwort fest und melden sich an.</p>
<p><a href="{{ .ConfirmationURL }}">Einladung annehmen</a></p>
<p style="color:#7A828C;font-size:12px">{{ .ConfirmationURL }}</p>
```

**Magic Link — Betreff:** `Ihr Anmeldelink`
```html
<h2>Anmelden ohne Passwort</h2>
<p>Mit diesem Link melden Sie sich einmalig an. Er ist nur kurze Zeit gültig.</p>
<p><a href="{{ .ConfirmationURL }}">Jetzt anmelden</a></p>
<p>Code: <strong>{{ .Token }}</strong></p>
```

**Reset password — Betreff:** `Passwort zurücksetzen`
```html
<h2>Neues Passwort</h2>
<p>Sie haben ein neues Passwort angefordert. Über den Link legen Sie es fest. Wenn Sie das nicht waren, ignorieren Sie diese Mail — Ihr Zugang bleibt unverändert.</p>
<p><a href="{{ .ConfirmationURL }}">Passwort festlegen</a></p>
```

**Change email — Betreff:** `Bitte bestätigen Sie Ihre neue E-Mail-Adresse`
```html
<h2>E-Mail-Adresse ändern</h2>
<p>Bitte bestätigen Sie, dass {{ .NewEmail }} künftig zu Ihrem Zugang gehört.</p>
<p><a href="{{ .ConfirmationURL }}">Neue Adresse bestätigen</a></p>
```

**Reauthentication — Betreff:** `Ihr Bestätigungscode`
```html
<p>Zur Bestätigung geben Sie bitte diesen Code ein: <strong>{{ .Token }}</strong></p>
```

## Grenzen

- Das Logo kommt als signierte Adresse aus dem privaten Bucket
  `branding-assets` (30 Tage gültig). Mailprogramme, die Bilder nicht laden,
  zeigen den Firmennamen als Text.
- „Passwort vergessen" für Mitarbeiter bietet die Oberfläche der Vorlage
  nicht an (Hinweis an den Ansprechpartner). Mit dem Hook wäre eine
  Selbstbedienung sauber möglich; sie braucht aber eine Seite „Neues
  Passwort setzen" in der Anwendung — offen in `docs/OFFEN.md`.
- Eigentümer-Einladungen gehen schon heute über Resend mit eigenem Text
  (`eigentuemer-einladen`); der Hook greift dort nur im Rückfall ohne
  `RESEND_API_KEY`.
