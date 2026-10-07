# Eigene Domain mit Netlify verbinden (Strato)

Stand 07.10.2026. Ersetzt den IONOS-Absatz in
[`INBETRIEBNAHME.md`](INBETRIEBNAHME.md), Schritt 7: die Domain liegt jetzt
bei **Strato**.

Im Quelltext ist dafür **nichts** zu ändern. Die Adresse steht an keiner
Stelle im Repository — `grep` nach `immoofficeeai` in `src/`, `scripts/`,
`supabase/functions/` und `assets/` findet null Treffer. Sie kommt
ausschließlich aus zwei Umgebungswerten (`PORTAL_URL`,
`EXPOSE_FREIGABE_BASIS`) und aus der Auth-Einstellung von Supabase. Das hier
ist also reine Konfiguration — in zwei Konsolen, nicht im Code.

---

## Erst entscheiden: wer führt die DNS-Zone?

Das ist die einzige echte Weiche. Alles danach folgt daraus.

| | **Weg A — Netlify DNS** | **Weg B — Zone bleibt bei Strato** |
|---|---|---|
| Was passiert | Strato zeigt mit vier Nameserver-Einträgen auf Netlify; die ganze Zone zieht um | Die Zone bleibt bei Strato, nur zwei Einträge zeigen auf Netlify |
| Zertifikat | Netlify stellt es selbst aus und erneuert es | ebenso, sobald die Einträge auflösen |
| Hauptdomain ohne `www` | funktioniert ohne Umweg | braucht einen A-Eintrag auf eine feste IP |
| **Haken** | **Alle übrigen Einträge ziehen mit — vor allem `MX`. Wer Strato-Postfächer auf dieser Domain hat, muss sie bei Netlify neu eintragen, sonst kommt keine Mail mehr an.** | Eine feste IP statt eines Namens: ändert Netlify sie, muss sie nachgezogen werden |
| Empfehlung | wenn die Domain **neu** ist und dort keine Postfächer hängen | wenn auf der Domain **Strato-Mail** liegt |

**Gewählt am 07.10.2026: Weg A.** Die Domain ist neu, es liegen keine
Strato-Postfächer darauf — damit entfällt der einzige Haken dieses Wegs.
Weg B bleibt beschrieben, weil die Entscheidung umkehrbar sein muss und
weil eine zweite Domain mit Mail darauf anders ausgehen würde.

Weg A ist der bequemere, Weg B der eingriffsärmere. Beides ist tragfähig;
kaputt geht nur die Mischung — Nameserver bei Netlify *und* Einträge bei
Strato pflegen führt dazu, dass Strato-Einträge gar nicht mehr gelesen
werden und niemand sieht, warum.

---

## Gemeinsamer Anfang: die Domain bei Netlify anmelden

**Vermutlich schon passiert.** Die Produktions-Auslieferung vom 07.10.2026
(Lauf 29) hat als Adresse der Site `https://immooffice.ai` zurückgegeben —
`netlify deploy --prod --json` nennt dort die **primäre Domain**. Diese Domain
ist also bereits an die Site gehängt und als primär gesetzt; es fehlt allein
das DNS. Wenn die Strato-Domain `immooffice.ai` ist, ist dieser Abschnitt
erledigt und es geht direkt bei Weg A weiter. Ist es eine **andere** Domain,
muss sie hier dazukommen und unter *Primary domain* an die erste Stelle.

1. Netlify → die Site **`immoofficeeai`** → *Domain management* →
   *Domains* → **Add a domain**.
2. Die Domain **ohne** `www` eintragen (`ihre-domain.de`). Netlify legt
   `www.ihre-domain.de` von selbst dazu und leitet die eine Form auf die
   andere um; welche die führende ist, lässt sich danach unter *Primary
   domain* umstellen.
3. Netlify fragt, ob es die DNS-Verwaltung übernehmen soll. Diese Frage ist
   die Weiche oben — *Set up Netlify DNS* ist Weg A, *Add domain* ohne
   Übernahme ist Weg B.

Die bisherige Adresse `immoofficeeai.netlify.app` bleibt in jedem Fall
erreichbar. Das ist beabsichtigt und nicht abschaltbar: alle Links, die vor
der Umstellung verschickt wurden — Exposé-Freigaben, Eigentümer-Einladungen,
Signaturvorgänge — zeigen weiter dorthin.

---

## Weg A — Nameserver bei Strato auf Netlify stellen

Netlify zeigt nach *Set up Netlify DNS* vier Namen der Form
`dns1.p03.nsone.net` bis `dns4.p03.nsone.net`. Die Zahl in der Mitte ist je
Site verschieden — die vier aus **Ihrer** Anzeige nehmen, nicht die aus
diesem Dokument.

Bei Strato:

1. Kunden-Login → **Domains → Domainverwaltung**.
2. Bei der Domain das **Zahnrad** anklicken.
3. Reiter **DNS** → **NS-Record verwalten**.
4. **Eigene Nameserver** aktivieren und alle vier eintragen, in der
   Schreibweise `dns1.p03.nsone.net` (ohne Punkt am Ende).

**Vorher**, nicht nachher: wenn auf der Domain Strato-Postfächer liegen, die
`MX`-Einträge aus der Strato-Zone abschreiben und in Netlify unter *DNS
panel* wieder anlegen. Nach dem Nameserver-Wechsel liest sie niemand mehr,
und die Mail fällt still aus.

---

## Weg B — zwei Einträge in der Strato-Zone

Strato kennt kein `ALIAS` und kein `ANAME`, und ein `CNAME` ist auf der
Hauptdomain nicht erlaubt. Deshalb für die Hauptdomain eine feste IP:

| Eintrag | Name | Ziel |
|---|---|---|
| `A` | leer bzw. `@` (die Domain selbst) | `75.2.60.5` |
| `CNAME` | `www` | `immoofficeeai.netlify.app` |

`75.2.60.5` ist der Lastverteiler von Netlify ([Netlify-Doku:
Configure external DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)).

Bei Strato: Kunden-Login → **Domains → Domainverwaltung** → Zahnrad →
Reiter **DNS**. Dort steht die Domain heute vermutlich auf dem
Strato-Webspace; dieser `A`-Eintrag wird ersetzt, nicht ergänzt. Zwei
`A`-Einträge auf derselben Domain führen dazu, dass die Hälfte der Aufrufe
bei Strato landet — und das sieht man nicht, weil die andere Hälfte richtig
ist.

Die `MX`-Einträge bleiben unangetastet. Das ist der ganze Vorteil dieses
Wegs.

---

## Danach: HTTPS

Netlify stellt das Zertifikat selbst aus (Let's Encrypt), sobald die Domain
auf Netlify auflöst — in Weg A nach dem Nameserver-Wechsel, in Weg B nach
dem Greifen der beiden Einträge. Unter *Domain management → HTTPS* steht
*Verify DNS configuration*, falls es nicht von allein losgeht.

Dauer: meist Minuten, laut Netlify bis zu einem Tag. Vorher antwortet die
Domain mit einer Zertifikatswarnung — das ist Wartezeit, kein Fehler.

Ein Sonderfall, der selten auftritt und dann schwer zu finden ist: ein
vorhandener `CAA`-Eintrag in der Zone, der Let's Encrypt nicht erlaubt. Dann
entweder `letsencrypt.org` zulassen oder den Eintrag entfernen. Strato setzt
standardmäßig keinen.

---

## Und dann die vier Nachzüge in der Anwendung

Ohne diese Schritte läuft die Seite unter der neuen Adresse, aber jede Mail
aus der Anwendung verweist weiter auf die alte — und die Registrierung
bestätigt auf der alten Adresse.

### 1. Zwei Werte in Supabase

Supabase → *Edge Functions → Secrets*:

| Name | Wert |
|---|---|
| `PORTAL_URL` | `https://ihre-domain.de` — **ohne** Schrägstrich am Ende |
| `EXPOSE_FREIGABE_BASIS` | `https://ihre-domain.de/freigabe.html` |

Diese beiden lesen 20 Edge Functions; davon hängen Eigentümer-Einladung,
Exposé-Freigabe, Upload-Benachrichtigung, Signaturvorgang, Terminerinnerung
und der Suchkriterien-Newsletter ab. Solange `PORTAL_URL` fehlt, zeigt jeder
dieser Links auf `https://immooffice.example` — eine nach RFC 2606
reservierte Platzhalter-Domain, die nirgendwo hinführt.

### 2. Die Site URL in Supabase

Supabase → *Authentication → URL Configuration*:

- **Site URL**: `https://ihre-domain.de`
- **Redirect URLs**: `https://ihre-domain.de/**` ergänzen

Der Grund ist nicht Kosmetik. Die Registrierung ruft `auth.signUp` **ohne**
`emailRedirectTo` (`src/app/anwendung.js`) — der Bestätigungslink wird also
aus der Site URL gebaut. Bleibt dort die Netlify-Adresse stehen, bestätigt
jeder Neukunde auf der alten Adresse, und das fällt erst auf, wenn sich
jemand wundert, warum er nach der Bestätigung woanders ist.

Die alte Adresse in den Redirect URLs **stehen lassen**. Bestätigungslinks,
die schon unterwegs sind, laufen sonst ins Leere.

### 3. Resend auf die neue Domain

resend.com → **Domains** → die neue Domain eintragen → die drei angezeigten
Einträge (SPF, DKIM, DMARC) dort setzen, wo die Zone liegt: in Weg A bei
Netlify, in Weg B bei Strato.

Das ersetzt den bisherigen Absender. `immoofficeeai.netlify.app` ließ sich
nie verifizieren — die Zone gehört Netlify, nicht Ihnen. Mit einer eigenen
Domain geht es.

### 4. Nichts davon in das Repository

Alle vier Werte bleiben in den Konsolen. `PORTAL_URL` und
`EXPOSE_FREIGABE_BASIS` sind in [`SECRETS.md`](SECRETS.md) und
`.env.example` als Namen dokumentiert, ohne Werte — so bleibt es.

---

## Reihenfolge

1. Domain bei Netlify anmelden.
2. Weg A oder Weg B bei Strato einrichten.
3. Warten, bis die Domain auflöst und das Zertifikat steht.
4. Erst dann die vier Nachzüge. Vorher umgestellt, verschickt die Anwendung
   Links auf eine Adresse, die noch nicht antwortet.
5. Probe: Registrierung unter der neuen Adresse durchlaufen und einen
   Exposé-Freigabelink erzeugen. Beide Mails müssen die neue Domain tragen.

## Quellen

- [Netlify: Configure external DNS for a custom domain](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
- [Netlify: Get started with domains](https://docs.netlify.com/manage/domains/get-started-with-domains/)
- [Strato: Wie kann ich bei STRATO meine DNS-Einträge verwalten?](https://www.strato.de/faq/domains/wie-kann-ich-bei-strato-meine-dns-eintraege-verwalten/)
- [Strato: So ändern Sie den CNAME-Eintrag für Ihre Subdomain](https://www.strato.de/faq/article/111/So-%C3%A4ndern-Sie-den-CNAME-Eintrag-f%C3%BCr-Ihre-Subdomain.html)
