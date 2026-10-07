# Inbetriebnahme — was der Betreiber tun muss

*Stand 29.09.2026. Diese Liste ist nach Abhängigkeit geordnet: Schritt 4 ist
der erste, bei dem etwas sichtbar funktioniert. Alles davor ist Voraussetzung.*

Was **nicht** hier steht, ist bereits erledigt: Schema, Edge Functions,
Mandantentrennung, Selbstregistrierung. Siehe `docs/GATE2.md`.

---

## Schritt 1 — Registrierung freigeben (2 Minuten)

Supabase-Projekt `usguiggfciavwzkdfjgt` öffnen:

**Authentication → Sign In / Providers → Email**

- **„Allow new users to sign up"** einschalten.
  *Ohne das:* `auth.signUp()` antwortet mit *Signups not allowed for this
  instance*. Niemand kann sich registrieren.
- **„Confirm email"** eingeschaltet **lassen**.
  *Ohne das:* Es entstehen Konten ohne geprüfte Adresse.
  `registrierung_abschliessen()` weist die ab — mit Absicht, sonst wäre jede
  fremde E-Mail-Adresse ein Mandant. Der Anmeldende käme in eine leere
  Oberfläche.

---

## Schritt 2 — Vier Werte hinterlegen (10 Minuten)

Supabase: **Edge Functions → Secrets** (in älteren Oberflächen:
*Project Settings → Edge Functions*). Dort mit *Add new secret*:

| Name | Wert |
|---|---|
| `PORTAL_URL` | `https://app.immooffice.ai` — ohne Schrägstrich am Ende (bis die Domain auflöst: `https://immoofficeeai.netlify.app`). |
| `EXPOSE_FREIGABE_BASIS` | `https://app.immooffice.ai/freigabe.html` |
| `MAIL_SECRET_KEY` | selbst erzeugen: `openssl rand -base64 32` |
| `CREDENTIALS_OBF_SECRET` | selbst erzeugen: `openssl rand -base64 32` |

**Die beiden Schlüssel einmal setzen und nie wieder ändern.** Mit ihnen
werden die SMTP-Passwörter der Postfächer und die hinterlegten Fremdzugänge
verschlüsselt. Wer sie tauscht, kann das Verschlüsselte nicht mehr lesen; es
muss dann neu eingegeben werden. **Bitte an einem sicheren Ort ablegen** —
nicht im Repository.

*Ohne `PORTAL_URL`:* Jeder Einladungs- und Freigabelink zeigt auf
`https://immooffice.example` — eine nach RFC 2606 reservierte Domain, die
nirgendwohin führt.

---

## Schritt 2b — Auf die richtige Netlify-Site zeigen (5 Minuten)

*Am 29.09.2026 gab es zwei Sites mit fast gleichem Namen:
`immoofficeai.netlify.app` (ein `e`) und `immoofficeeai.netlify.app` (zwei).
Die Auslieferung ging auf die erste, benutzt wurde die zweite — auf der lief
der **Altbestand**, dessen Registrierung eine Datenbankfunktion ruft, die es
in diesem Projekt nicht gibt. Deshalb die Fehlermeldung „Das Unternehmen
konnte nicht angelegt werden".*

Maßgeblich ist jetzt **`immoofficeeai.netlify.app`**. Damit die Auslieferung
dort ankommt:

1. Netlify → die Site `immoofficeeai` → *Site configuration → General* →
   **Site ID** kopieren.
2. GitHub → das Repository → *Settings → Secrets and variables → Actions* →
   **`NETLIFY_SITE_ID`** auf diesen Wert ändern.

Die `netlify.toml` baut seit dem 29.09.2026 **immoOffice.ai** statt des
Altbestands. Ein Bau aus dem Repository liefert damit dasselbe wie der
Workflow — die Seite kann sich nicht mehr gegenseitig überschreiben.

---

## Schritt 3 — Oberfläche in Produktion ausliefern (2 Minuten)

GitHub → **Actions** → Workflow **„Oberflaeche ausliefern"** → *Run workflow*
→ bei `umgebung` **`produktion`** wählen → *Run workflow*.

**Am 07.10.2026 erledigt** (Lauf 29, Commit `95adc02`): `immoofficeeai.netlify.app`
trägt jetzt denselben Stand wie der Entwurf. Bis dahin gingen alle 28
Auslieferungen auf den Entwurf — deshalb war in der Produktion nichts von der
Arbeit der letzten Tage zu sehen, und zwar ohne jede Fehlermeldung.

Der Schritt bleibt für jede weitere Auslieferung derselbe. Ohne ihn ist eine
Änderung nirgends erreichbar, egal wie grün die Tests sind — und eine eigene
Domain zeigt **immer** auf die Produktion, nie auf den Entwurf.

Die beiden Netlify-Geheimnisse (`NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`)
liegen bereits im Repository — die Entwürfe sind damit gelaufen.

**Was an diesem Schritt hängt:** die Exposé-Schriften für den
**Vorlagen-Editor**. Er zeichnet seine Vorschau im Browser und holt die
zwanzig Schnitte von `/schriften/expose/`; die kommen mit dieser
Auslieferung. Ohne Produktions-Deploy bleibt die Vorschau ohne Schrift.

Das **PDF** braucht diesen Schritt nicht: `expose-pdf-erzeugen` trägt die
Schnitte seit dem 05.10.2026 selbst (`schriften.mjs`, gepackt). Bis dahin
holte sie sie von hier, und als am 05.10. weder `PORTAL_URL` noch der Eimer
etwas hatte, brach jedes Exposé beim ersten Schnitt ab.

---

## Schritt 4 — Ausprobieren (5 Minuten)

`https://immoofficeeai.netlify.app` öffnen. Unten auf der Anmeldeseite steht
**„Noch kein Konto? Firma registrieren"**.

1. Firma, Name, E-Mail, Passwort eingeben.
2. Bestätigungsmail abwarten und den Link anklicken.
3. Anmelden. Beim ersten Anmelden entsteht der Mandant.

**Wenn keine Mail ankommt:** Supabase verschickt Bestätigungsmails über
seinen eingebauten Versand, der auf wenige Mails je Stunde begrenzt ist und
gern im Spam landet. Das ist kein Fehler der Anwendung — siehe Schritt 6.

Ab hier ist die Anwendung benutzbar. Was jetzt noch fehlt, betrifft
einzelne Funktionen, nicht das Ganze.

---

## Schritt 5 — Anthropic-Schlüssel, richtig ausgestellt (5 Minuten)

Der bisher hinterlegte Schlüssel ist ein **Organisationsschlüssel**. Jeder
KI-Aufruf antwortet damit:

```
400 … not scoped to a workspace
```

Das betrifft alle 41 KI-Funktionen: Exposé-Texte, Auslese von Unterlagen,
Bewertung, Bildbeschriftung.

**Abhilfe:** console.anthropic.com → links oben einen **Workspace** wählen
(oder anlegen) → **API Keys** → *Create Key* — der Schlüssel muss **innerhalb**
des Workspace entstehen, nicht auf Organisationsebene. Dann in Supabase unter
*Edge Functions → Secrets* als `ANTHROPIC_API_KEY` ersetzen.

---

## Schritt 6 — Mailversand (30 Minuten plus DNS-Wartezeit)

Zwei Dinge, die unabhängig voneinander sind:

### 6a — Resend für den Versand aus der Anwendung

resend.com → Konto → **Domains** → die eigene Domain eintragen → die drei
angezeigten DNS-Einträge (SPF, DKIM, DMARC) dort setzen, wo die Zone liegt —
bei **Strato**, oder bei Netlify, wenn die Zone dorthin umgezogen ist
(Schritt 7). Danach **API Keys → Create API Key**, und den Wert in Supabase
als `RESEND_API_KEY` hinterlegen.

**Wichtig:** `immoofficeeai.netlify.app` lässt sich **nicht** verifizieren —
die DNS-Zone gehört Netlify, nicht Ihnen. Es muss die eigene Domain sein.

*Ohne Resend:* Keine Mail aus der Anwendung geht hinaus — keine
Eigentümer-Einladung, kein Exposé-Link, keine Terminerinnerung.

### 6b — Eigener SMTP-Zugang für die Bestätigungsmails

Supabase → **Authentication → Emails → SMTP Settings**. Dort denselben
Resend-Zugang eintragen (Host `smtp.resend.com`, Port 465, Benutzer `resend`,
Passwort = der API-Schlüssel). Damit fällt die Stundengrenze des eingebauten
Versands weg.

---

## Schritt 7 — Eigene Domain (20 Minuten plus DNS-Wartezeit)

Die Domain liegt seit dem 07.10.2026 bei **Strato**. Die vollständige
Anleitung steht in [`DOMAIN_VERBINDEN.md`](DOMAIN_VERBINDEN.md) — beide Wege
(Zone zu Netlify oder Zone bleibt bei Strato), mit dem Haken an jedem, und
den vier Nachzügen in der Anwendung.

Kurzform:

1. Netlify → die Site → *Domain management* → *Add a domain* → die Domain
   ohne `www`.
2. Bei Strato entweder die vier Netlify-Nameserver eintragen (Zone zieht um,
   dann müssen `MX`-Einträge mit) oder `A @ → 75.2.60.5` und
   `CNAME www → immoofficeeai.netlify.app` setzen.
3. Warten, bis die Domain auflöst und Netlify das Zertifikat ausgestellt hat.
4. Danach in Supabase `PORTAL_URL` (`https://app.immooffice.ai`) und
   `EXPOSE_FREIGABE_BASIS` (`https://app.immooffice.ai/freigabe.html`)
   umstellen — **und** unter *Authentication → URL Configuration* die
   **Site URL** auf `https://app.immooffice.ai`, Redirect URL
   `https://app.immooffice.ai/**` dazu. Die Registrierung baut den
   Bestätigungslink aus der Site URL. Die Website ohne `app.` ist eine
   andere Site (`website-ausliefern.yml`).

Reihenfolge einhalten: Links, die vor der Umstellung verschickt wurden,
zeigen weiter auf die Netlify-Adresse. Die bleibt erreichbar.

---

## Schritt 8 — Demo-Passwort ändern (1 Minute)

Das Konto aus der Aufbauphase trägt noch das Passwort, mit dem es angelegt
wurde. Supabase → **Authentication → Users** → das Konto → *Send password
recovery* oder direkt ein neues Passwort setzen.

---

## Schritt 9 — Firmenstammdaten vollständig füllen (5 Minuten)

**Seit dem 30.09.2026 ist das nicht mehr Kosmetik, sondern Voraussetzung.**
Bis dahin standen Firmenname, Briefkopf und Absender fest im Quelltext; jetzt
kommen sie aus `firma_stammdaten` des Mandanten. Was dort fehlt, fehlt im
Dokument — und an zwei Stellen entsteht gar kein Dokument mehr:

| Feld | Wird gebraucht für | Ohne Eintrag |
|---|---|---|
| `firma_name` | Briefkopf, Grußformel, OpenImmo-Anbieter | Portalexport **bricht ab**; Mails ohne Grußformel |
| `geschaeftsfuehrer` | Zeichnender Vertreter im Maklervertrag | Maklervertrag und Signaturvorgang **brechen ab** |
| `email` | Antwortadresse, Kontakt im Portal-Inserat, Widerrufsbelehrung | Antworten gehen an die Plattform statt an den Makler |
| `strasse`, `plz`, `ort` | Briefkopf, Fahrzeit-Startpunkt | Leere Zeilen im Dokument |
| `telefon` | Kontakt im Inserat, Hinweiskasten | Zeile entfällt |

**Das ist so gewollt:** vorher standen an diesen Stellen entweder ein fest
verdrahteter Name oder — schlimmer — die Daten eines *anderen* Mandanten. Ein
Dokument ohne Briefkopf fällt auf, eines mit dem falschen nicht. Und ein
Maklervertrag, dessen Unterzeichner nicht existiert, ist im Streitfall
wertlos.

**Stand am 30.09.2026 im Projekt:** `geschaeftsfuehrer` ist leer. Solange das
so ist, erzeugt `vertrag-pdf` keinen Maklervertrag mehr und
`signatur-vorgang-starten` keinen Signaturvorgang — beide mit einer Meldung,
die den Grund nennt.

**Ebenfalls prüfen:** unter `email` steht die Adresse des
Referenzunternehmens. Bis zum 30.09.2026 wurde das Feld gar nicht benutzt,
weshalb es nicht auffiel. Jetzt geht diese Adresse als Antwortadresse in
Mails und als Kontakt in das OpenImmo-Inserat. Das ist eingegebene
**Mandantendaten**, kein Quelltext — das Neutralitäts-Gate prüft das
Repository und kann sie nicht sehen. Bitte auf die eigene Adresse ändern.

Zu finden unter *Einstellungen → Firmendaten*.

---

## Was danach noch offen ist

Kein Handgriff des Betreibers, sondern Entwicklungsarbeit — steht in
`docs/OFFEN.md`:

- ~~Der **Absender** ist noch plattformweit.~~ Erledigt: Anzeigename und
  Antwortadresse kommen je Mandant aus `firma_stammdaten`. Die
  **Absenderadresse** bleibt bewusst die der Plattform — ein Mailanbieter
  verschickt nur von einer nachgewiesenen Domain (SPF/DKIM). Eigene
  Absenderdomains je Mandant sind Phase 6.
- ~~`vertrag-pdf` erzeugt Verträge **ohne Firmenkopf**.~~ Erledigt, siehe
  Schritt 9.
- Die **Platzhalter-Adresse `immooffice.example`** steht noch an 83 Stellen
  in 45 Funktionen — überall dort, wo die Vorlage ihre eigene Domain
  verdrahtet hatte. Die Endung ist nach RFC 2606 reserviert und existiert
  nicht; diese Links führen nirgendwohin. Das ist Absicht: ein Platzhalter,
  der auffällt, ist besser als eine erfundene Domain.
- Die Fremdanbindungen (CRM, Microsoft 365, Immowelt, Kleinanzeigen) liegen
  hinter Funktionsschaltern und sind aus (Phase 2b).
- Stripe und damit die Abrechnung ist Gate 3.
