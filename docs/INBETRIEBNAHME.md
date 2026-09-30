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
| `PORTAL_URL` | `https://immoofficeeai.netlify.app` — ohne Schrägstrich am Ende. Später die eigene Domain. |
| `EXPOSE_FREIGABE_BASIS` | `https://immoofficeeai.netlify.app/freigabe.html` |
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

Bisher gibt es nur Entwürfe unter Vorschau-Adressen. Ohne diesen Schritt ist
die Registrierung nirgends erreichbar, egal wie grün die Tests sind.

Die beiden Netlify-Geheimnisse (`NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`)
liegen bereits im Repository — die Entwürfe sind damit gelaufen.

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

resend.com → Konto → **Domains** → `immooffice.ai` eintragen → die drei
angezeigten DNS-Einträge (SPF, DKIM, DMARC) bei **IONOS** setzen, wo die Zone
liegt. Danach **API Keys → Create API Key**, und den Wert in Supabase als
`RESEND_API_KEY` hinterlegen.

**Wichtig:** `immoofficeeai.netlify.app` lässt sich **nicht** verifizieren —
die DNS-Zone gehört Netlify, nicht Ihnen. Es muss `immooffice.ai` sein.

*Ohne Resend:* Keine Mail aus der Anwendung geht hinaus — keine
Eigentümer-Einladung, kein Exposé-Link, keine Terminerinnerung.

### 6b — Eigener SMTP-Zugang für die Bestätigungsmails

Supabase → **Authentication → Emails → SMTP Settings**. Dort denselben
Resend-Zugang eintragen (Host `smtp.resend.com`, Port 465, Benutzer `resend`,
Passwort = der API-Schlüssel). Damit fällt die Stundengrenze des eingebauten
Versands weg.

---

## Schritt 7 — Eigene Domain (20 Minuten plus DNS-Wartezeit)

`immooffice.ai` liegt bei IONOS und zeigt heute auf `217.160.0.104`, nicht auf
Netlify.

1. Netlify → die Site → *Domain management* → *Add a domain* → `immooffice.ai`.
2. Die von Netlify angezeigten DNS-Einträge bei IONOS setzen.
3. Danach in Supabase `PORTAL_URL` und `EXPOSE_FREIGABE_BASIS` auf die neue
   Adresse umstellen.

Reihenfolge einhalten: Links, die vor der Umstellung verschickt wurden,
zeigen weiter auf die Netlify-Adresse.

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
