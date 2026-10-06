# Tarife, Abos und Credits

Stand 06.10.2026 · Auftrag „Tarife, Abos & Credits für immoOffice.ai"

Dieses Dokument hält fest, **was gebaut wurde, welche Annahmen dabei getroffen
wurden und was davon geprüft ist** — getrennt nach dem, was hier prüfbar war,
und dem, was nur beim Betreiber mit einem echten Stripe-Konto prüfbar ist.

> **Ausschließlich Stripe-Testmodus.** Jeder Schlüssel, der nicht mit
> `sk_test_` beginnt, bricht den Lauf ab — im Skript, im Checkout, in der
> Verwaltung. Ein Live-Schalter existiert nicht. Die Umstellung macht der
> Betreiber selbst, und sie verlangt, diese Prüfungen bewusst zu entfernen
> (Gate 3 in `CLAUDE.md`). Genau so soll es sein: sie darf nicht aus Versehen
> passieren.

---

## 1. Was ein Credit ist

Eine **interne Nutzungseinheit**, kein Euro-Guthaben. Verbraucht wird er,
wenn die KI etwas **erzeugt**. Was nur ausgegeben, heruntergeladen oder von
Hand bearbeitet wird, kostet nichts — auch nicht beim zweiten Mal.

Drei Töpfe, in dieser Reihenfolge verbraucht:

| Topf | Herkunft | Gültig |
|---|---|---|
| `tarif` | monatliche Inklusiv-Credits | bis Periodenende, Rest in den **unmittelbar** folgenden Monat übertragbar, höchstens ein reguläres Monatskontingent |
| `test` | Testphase | bis Testende |
| `paket` | gekauft | 12 Monate, **älteste zuerst** |

Alles steht im Ledger `credit_buchungen`: Quelle, Aktion, Credits, Zeit,
Status, Anbieterkosten in Euro. Auch die kostenfreien Aktionen — sonst wäre
die Nutzung nur dort sichtbar, wo sie Geld kostet.

---

## 2. Datenmodell

`supabase/migrations/20261006210000_fork_47_abrechnung.sql` (9 Tabellen) und
`…210100_fork_47_abrechnung_funktionen.sql` (13 Funktionen).

**Katalog (DIENST, für alle lesbar, nur Plattform-Admin schreibbar):**
`plattform_tarife` · `plattform_credit_preise` · `plattform_credit_pakete` ·
`plattform_werte` · `plattform_admins`

**Je Mandant (MANDANT, RLS je `mandant_id`):**
`mandant_abo` · `credit_konten` · `credit_buchungen`

**Ohne Mandantenbezug:** `stripe_ereignisse` — die Tabelle, die
Doppelzustellungen abwehrt. Sie trägt bewusst **keine** `mandant_id`: zum
Zeitpunkt des Einfügens ist der Mandant noch nicht bekannt, und die Kennung
ist die Idempotenzschranke, nicht der Inhalt.

Jede dieser Tabellen ist in `mandanten_einstufung` eingetragen und läuft
damit durch `tests/mandant-rundumschlag.sql` — die Prüfung, die eine Tabelle
ohne Richtlinie gar nicht erst durchlässt.

### Das Ledger ist unveränderlich

Ein Trigger lässt genau **einen** Übergang zu: `reserviert → gebucht` oder
`reserviert → erstattet`. Kein Update auf Credits, Mandant oder Zeit, kein
Löschen. Die eine Ausnahme: Verschwindet der Mandant, geht sein Ledger mit —
sonst wäre aus „unveränderlich" ein „unlöschbar" geworden und ein Mandant
ließe sich nie entfernen (DSGVO-Löschung eingeschlossen).

---

## 3. Getroffene Annahmen

Der Auftrag ließ diese Punkte offen. Entschieden wurde jeweils so, wie es dem
Verhalten der Vorlage und den Regeln in `CLAUDE.md` am nächsten kommt.

| # | Frage | Entscheidung | Grund |
|---|---|---|---|
| 1 | Wer darf ein Abo abschließen? | nur die Rolle `chef` | Ein Mitarbeiter soll nicht versehentlich einen Vertrag für das Haus schließen. Der **Credit-Stand** bleibt für alle sichtbar: wer KI benutzt, muss wissen, woran er ist. |
| 2 | Kündigung über das Stripe-Kundenportal? | nein, über `abo-verwalten` | Stripe kennt die Mindestlaufzeit nicht und würde zum Periodenende kündigen, auch wenn noch vier Monate offen sind. Das Portal bleibt für Zahlungsmittel und Rechnungen zuständig. |
| 3 | Kündigungstermin | der **spätere** von Periodenende und Mindestlaufzeitende | Das ist die ganze Regel; sie steht an einer Stelle und wird dem Kunden vor der Bestätigung als Datum gezeigt. |
| 4 | Preisänderung im Admin | legt bei Stripe einen **neuen** Preis an, der alte wird stillgelegt | Preise sind bei Stripe unveränderlich. Laufende Abos bleiben auf ihrem alten Preis — ein laufender Vertrag wird nicht im Vorbeigehen teurer. |
| 5 | Umsatzsteuer | `tax_behavior: exclusive`, Stripe Tax **aus** | `CLAUDE.md`: Preise sind Nettopreise zzgl. USt. Stripe Tax ist vorbereitet, aber ein steuerliches Thema des Betreibers. |
| 6 | Zahlung schlägt fehl | `zahlung_offen`, volle Nutzung für `zahlung_frist_tage` (14), danach Lesezugriff, dann gesperrt | Eine Karte, die einmal abgelehnt wird, ist kein Kündigungsgrund. |
| 7 | Nach Testende / Kündigung | **30 Tage Lesezugriff** (`lesezugriff_tage`) | Wer aufhört, muss exportieren können, was ihm gehört. |
| 8 | Testphase | 28 Tage, 300 Credits, **ohne** Zahlungsmittel, kein automatischer Übergang ins Abo | Eine stillschweigende Verlängerung wäre eine Abofalle. |
| 9 | Gründerpreis | Coupon `GRUENDER`, `max_redemptions` **und** Zähler in der Datenbank | Zwei Sperren, weil ein Zähler zwischen Prüfung und Abschluss weiterlaufen kann. |
| 10 | Zusatznutzer verringern | nur bis zur Zahl der tatsächlich angelegten Zugänge | Sonst stünde jemand morgen vor einer Anwendung, die ihn nicht mehr kennt. |
| 11 | Anbieterkosten (`ki_kosten_eur`) | anteilig auf die Ledger-Zeilen verteilt | Ein Vorgang über zwei Töpfe erzeugt zwei Zeilen; die Summe muss die Kosten wieder ergeben, sonst ist der Deckungsbeitrag falsch. |
| 12 | Neuer Tarif im Admin | erscheint auf der Website **nicht** von selbst | Eine Preiskarte ist Text und Haltung, nicht nur eine Zahl. Beträge, Nutzerzahl, Credits und Merkmale kommen aus dem Katalog; die Karte selbst schreibt ein Mensch. |
| 13 | Stripe-Kennungen auf der Website | gehen **nicht** hinaus | Sie sind kein Geheimnis im engen Sinn, aber wer sie hat, kann Zahlungsvorgänge anlegen — und die Werbeseite braucht sie nicht. |
| 14 | Abrechnung im Hintergrundlauf | **vorerst nicht** — nur Aufrufe mit angemeldetem Nutzer kosten | Ein Zeitplan-Lauf, der einem Mandanten unbemerkt Credits abzieht, muss vorher angekündigt sein. Siehe Abschnitt 5. |
| 15 | Dollar in Euro | Kurs aus `plattform_werte.usd_eur_kurs`, ohne gültigen Wert **keine** Kostenangabe | Ein fest verdrahteter Kurs ist irgendwann still falsch. Lieber eine leere Spalte als eine erfundene Zahl. |
| 16 | Preise im Client | kein Wert wird dem Frontend geglaubt | `abo-checkout` schreibt **nie** einen Status. Was gilt, entscheidet der Webhook. Käme der Status von der Kasse, stünde er schon dann in der Datenbank, wenn jemand nur die Kasse geöffnet und abgebrochen hat. |

---

## 4. Die Stripe-Schicht

Vier eigene Edge Functions, alle ohne SDK (Formular-API über `fetch` — ein
SDK brächte eine Abhängigkeit mit, die bei Deno-Deployments regelmäßig
bricht, für drei Endpunkte):

| Funktion | JWT | Aufgabe |
|---|---|---|
| `abo-checkout` | ja | Kasse für Abo oder Credit-Paket. Schreibt **keinen** Status. |
| `abo-verwalten` | ja | Stand, Kundenportal, Kündigung, Widerruf, Zusatznutzer. |
| `tarife-oeffentlich` | **nein** | Der Katalog für die Website. Liest nie aus einer Mandantentabelle. |
| `stripe-webhook` | **nein** | Die einzige Stelle, die den Abo-Status schreibt. |

**Signaturprüfung:** selbst gerechnet (HMAC-SHA256 über
`zeit.nutzlast`), Zeitfenster 300 Sekunden, Vergleich in konstanter Zeit.
Zurückgewiesen wird außerdem jedes Ereignis mit `livemode: true`.

**Idempotenz:** Die Ereigniskennung wird als Primärschlüssel in
`stripe_ereignisse` eingefügt. Kommt sie ein zweites Mal, scheitert das
Einfügen mit `23505`, und die Funktion antwortet `200 {doppelt:true}` —
ohne irgendetwas zu buchen. Geht die Verarbeitung schief, wird die Zeile
wieder gelöscht, damit Stripes Wiederholung eine Chance hat.

**Verarbeitet:** `checkout.session.completed` ·
`customer.subscription.created/updated/deleted` · `invoice.paid` ·
`invoice.payment_failed`.

---

## 5. Wo Credits wirklich verbraucht werden (fork_49)

Bis hierher war die Abrechnung Zierde: Töpfe, Ledger und Preise gab es,
aber nichts verbrauchte je etwas. Seit fork_49 hängt sie an den KI-Aufrufen.

Die Abrechnung liegt als **Beilage** `credits.ts` im Ordner der jeweiligen
Funktion; die Quelle ist `supabase/eigene-beilagen/_credits/credits.ts`, und
`tests/credits.js` besteht darauf, dass alle Kopien byte-gleich sind. Welche
Funktion sie bekommt, steht an einer Stelle: `GEMEINSAME_BEILAGEN` in
`scripts/neutralisieren-funktionen.py`.

| Funktion | Aktion | Credits |
|---|---|---|
| `generate-text` | `ki_text` | 2 |
| `text-korrigieren` | `ki_text` | 2 |
| `expose-pruefen` | `expose_pruefer` | 2 |
| `ki-bildbearbeitung` (Retusche, Himmel) | `bild_optimieren` | 10 |
| `ki-bildbearbeitung` (Homestaging) | `bild_homestaging` | 30 |

Die Reihenfolge ist in jeder dieser Funktionen dieselbe und wird von
`tests/credits.js` erzwungen:

1. **Reservieren**, bevor der Anbieter gerufen wird. Wer erst hinterher
   abrechnet, hat bei jedem Abbruch geliefert und nichts genommen — und kann
   nicht verhindern, dass zehn gleichzeitige Aufrufe denselben Rest ausgeben.
2. **Buchen**, wenn ein Ergebnis vorliegt — mit den Anbieterkosten, soweit
   sie bekannt sind. Replicate nennt Dollar; der Kurs steht in
   `plattform_werte.usd_eur_kurs` und wird vom Betreiber gepflegt. Fehlt er,
   bleibt die Kostenspalte leer: lieber keine Zahl als eine erfundene.
   Anthropic liefert Token, keinen Preis — dort bleibt sie ebenfalls leer.
3. **Freigeben** auf jedem Rückweg dazwischen und im `catch`. Der Test zählt
   Rückwege und Freigaben paarweise ab; eine gelöschte Freigabe fällt auf.

Dabei wird **auch das Abo geprüft** (`abo_zugriff`). Ein Mandant im
Lesezugriff oder gesperrt kommt nicht an die KI — serverseitig, nicht durch
einen ausgeblendeten Knopf.

In der Oberfläche liest eine Hülle um `functions.invoke` den Antwortkörper
aus. Ohne sie zeigte supabase-js „Edge Function returned a non-2xx status
code"; jetzt steht da, woran es lag, und bei fehlenden Credits ein Satz dazu,
wo man sie nachkauft. Eine Hülle statt achtzig Aufrufstellen — und sie gilt
auch für die, die später dazukommen.

### Was noch NICHT abgerechnet wird

Ehrlich benannt, weil es Geld ist: rund vierzig weitere Edge Functions rufen
KI, ohne Credits zu verbrauchen. Zwei Gründe, und beide sind keine
Nachlässigkeit:

- **Kein Preis im Katalog.** Die Parser (`parse-*`), die Auslesefunktionen
  (`energieausweis-auslesen`, `grundriss-ki-lesen`, `objekt-wissen-auslesen`,
  `sprachmemo-auswerten`) und die kleinen Helfer (`bild-beschriften`,
  `datei-namen-ki`) haben keinen Eintrag in `plattform_credit_preise`. Einen
  zu erfinden wäre eine Preisentscheidung — die trifft der Betreiber im
  Plattform-Admin, nicht dieser Code. Danach sind es je Funktion drei
  Einhängungen und ein Eintrag in `GEMEINSAME_BEILAGEN`.
- **Kein Nutzer, dem man es zuordnen könnte.** Die Hintergrundläufe
  (`mail-postfach-pull`, `mail-anfrage-verarbeiten`, `akq-mail-leads`,
  `besichtigung-nachfassen`, `news-briefing-erstellen` und Geschwister)
  laufen aus einem Zeitplan heraus, ohne Anmeldekopf. Sie bräuchten einen
  anderen Weg: Mandant aus dem Datensatz statt aus dem Konto. Das ist
  machbar, aber eine eigene Entscheidung — ein Hintergrundlauf, der einem
  Mandanten unbemerkt Credits abzieht, muss vorher angekündigt sein.

---

## 6. Der Kundenbereich „Abo & Abrechnung" (fork_51)

Ein Reiter in den Einstellungen — und damit hinter deren Chef-Schranke;
`abo-verwalten` prüft dieselbe Rolle noch einmal. Zwei Schranken, und die
zweite ist die, die zählt.

Die Tafel (`src/eigene/abrechnung.js`) zeigt: Credit-Saldo mit getrennten
Töpfen und Gültigkeit, Tarif, Nutzer von Limit, laufende Periode,
Mindestlaufzeit, Kündigungstermin — und je nach Lage ein Band mit dem einen
Satz, der gerade gilt (Testphase läuft noch X Tage · Zahlung offen · nur
Lesezugriff · gekündigt zum …).

Was sie **nicht** kann, und zwar mit Absicht: den Abo-Stand ändern. Sie
fasst `mandant_abo`, `credit_konten` und `credit_buchungen` nicht an —
`tests/abrechnung-ui.js` prüft genau das am Quelltext. Geschrieben wird dort
ausschliesslich vom Webhook.

Vor einer Kündigung wird gefragt, und das **Datum rechnet der Server**. Eine
zweite Rechnung in der Oberfläche könnte ein anderes Ergebnis zeigen als die,
die gilt — bei sechs Monaten Mindestlaufzeit ist das kein Schönheitsfehler.

Preise stehen nicht in der Datei. Sie kommen aus `tarife-oeffentlich`, also
aus demselben Katalog, aus dem auch die Rechnung entsteht. Fällt er aus,
bleibt die Tafel lesbar und zeigt **keinen** Preis — der Test besteht darauf.

`tests/abrechnung-ui.js` zeichnet die Tafel mit einem nachgebauten React
(sie benutzt nur `useState`, `useEffect` und `useCallback`) und sieht sich
fünf Lagen einzeln an: Testphase, laufendes Abo, Kündigung, Sperre und den
Fall ohne Katalog. 38 Prüfungen.

---

## 7. Die Preise auf der Website

Ein Abschnitt `#preise` in der bestehenden Landingpage, keine eigene
Preisseite. Die Zahlen im HTML sind **Rückfall**, nicht Quelle: `seite.js`
holt den Stand beim Laden über `tarife-oeffentlich` und schreibt ihn in die
`data-…`-Stellen. Fällt der Endpunkt aus, bleibt der Rückfall stehen — eine
Preisseite ohne Preise wäre schlimmer als eine mit dem Stand von gestern.
Die Adresse des Endpunkts steht in `website/konfig.js`, nicht im HTML.

Gerechnet wird aus Cent-Beträgen in `data`-Attributen, nicht aus dem
sichtbaren Text: sonst müsste der Monat/Jahr-Umschalter „129,99 €" zurück in
eine Zahl lesen.

Der **Jahresvorteil wird gerechnet, nicht behauptet** (`1 − jahr / (12 ×
monat)`, abgerundet). Bei „Jährlich" steht der Jahresbetrag groß und der
Monatswert klein darunter — nicht umgekehrt: abgerechnet wird das Jahr.

Der **Gründerzähler bleibt verborgen**, bis der Endpunkt eine Zahl geliefert
hat. Eine Seite, die „noch 50 Plätze frei" behauptet, ohne nachgesehen zu
haben, wirbt mit einer Zahl, die sie nicht kennt.

`tests/website.py` erzwingt seither, dass **jeder** Eurobetrag im HTML im
Abschnitt `#preise` steht. Ein Preis in der Bühne, in einer Modulkachel oder
in den Fragen ist genau der, den später niemand mitpflegt.

---

## 8. Abnahme

### 8.1 Hier geprüft — `tests/abrechnung.sql`, Teil von `npm run check`

34 Prüfungen gegen eine echte Postgres-Instanz, alle grün:

| Bereich | Geprüft |
|---|---|
| Töpfe | Saldo = Summe der gültigen Töpfe · erst `tarif`, dann der **ältere** Paket-Topf · der jüngere bleibt unberührt |
| Reservierung | Reserviertes zählt sofort als verbraucht · ein gescheiterter Aufruf gibt die Credits zurück · zu wenig Credits wird abgewiesen, und es wird **nichts halb** genommen |
| Ledger | kostenfreie Aktionen stehen drin, mit 0 Credits · ein Vorgang über zwei Töpfe ergibt zwei Zeilen · die Anbieterkosten summieren sich wieder auf |
| Unveränderlichkeit | gebuchte Zeile nicht änderbar · Status nicht zurückdrehbar · nicht löschbar · **aber** mit dem Mandanten löschbar |
| Mandantentrennung | Chef A sieht Abo, Credits und Ledger von B **nicht** · seine eigenen sehr wohl |
| Selbstbedienung | ein Chef kann seinen Tarif nicht selbst hochsetzen und sich keine Credits gutschreiben |
| Limits | Starter = 1 Nutzer, Platz belegt · zwei Zusatznutzer heben auf 3 |
| Zugriff | aktiv → `voll` · nach Kündigungstermin → `nur_lesen` · danach → `gesperrt` · Sperre wirkt sofort |
| Gründer | ein Platz wird vergeben, ein zweiter Aufruf vergibt keinen zweiten, der Zähler zählt genau einen herunter |

Dazu `tests/credits.js` (62 Prüfungen): jede Kopie der Beilage ist byte-gleich
mit ihrer Quelle, jeder Aktionsschlüssel steht im Katalog, reserviert wird vor
dem Anbieter, gebucht danach, und zwischen Reservierung und Buchung gibt jeder
Rückweg frei. Die letzte Prüfung ist die wichtigste — sie ist die, die eine
gelöschte Freigabe findet, und sie wurde erst dann geschrieben, als die erste
Fassung genau das **nicht** bemerkt hat.

Dazu `tests/website.py` und `tests/website-browser.js`: der Preisbereich
holt den Stand wirklich (geprüft mit **abweichenden** Zahlen im Stub — sonst
sähe man nicht, ob die Seite den Katalog oder den Rückfall zeigt), der
Umschalter rechnet, der Knopf nimmt Tarif und Takt mit, und bei 375 px Breite
steht nichts über dem Rand.

### 8.2 Nicht hier prüfbar — Abnahme beim Betreiber

Dieser Container kommt **weder an Stripe noch an Supabase über HTTPS** heran,
und einen Stripe-Schlüssel gibt es hier nicht. Die folgenden Punkte muss der
Betreiber einmal durchspielen. Die Reihenfolge ist die sinnvolle.

1. `node scripts/stripe-einrichten.mjs --trocken` — zeigt, was angelegt
   würde. Dann ohne `--trocken`.
2. Webhook-Endpunkt bei Stripe anlegen auf
   `…/functions/v1/stripe-webhook`, Ereignisse wie in Abschnitt 4.
   `STRIPE_WEBHOOK_SECRET` setzen.
3. **Testkarte 4242 4242 4242 4242** → Abo kommt zustande, `mandant_abo`
   steht auf `aktiv`, Inklusiv-Credits sind zugeteilt.
4. **Testkarte 4000 0000 0000 0341** (Zahlung schlägt später fehl) →
   `zahlung_offen`, volle Nutzung für 14 Tage, danach Lesezugriff.
5. **Webhook doppelt zustellen** (Stripe-Dashboard → „Resend") → zweite
   Zustellung antwortet `200 {doppelt:true}`, **keine** zweite Buchung in
   `credit_buchungen`.
6. **Kündigung** mitten in der Mindestlaufzeit → das angezeigte Datum ist das
   Ende der Mindestlaufzeit, nicht das Periodenende.
7. **Credit-Paket kaufen** → `credit_konten` bekommt einen Topf mit
   `gueltig_bis` in 12 Monaten.
8. **Gründerpreis** → der Coupon greift nur auf dem dafür bestimmten Tarif,
   und der Zähler auf der Website zählt herunter.
9. **Zwei Mandanten nebeneinander** → Mandant A sieht in der Oberfläche
   nichts von B. (Die Datenbankseite ist unter 8.1 geprüft; hier geht es um
   den Weg durch die Anwendung.)

Ergebnisse gehören in dieses Dokument, Abschnitt 8.3.

### 8.3 Ergebnisse der Abnahme beim Betreiber

Noch keine. Einzutragen, sobald die Punkte aus 8.2 durchgespielt sind.

---

## 9. Was der Betreiber setzen muss

Supabase → Edge Functions → Secrets (siehe `docs/SECRETS.md` und
`.env.example`):

| Name | Wofür |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` — alles andere bricht ab |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` aus dem Webhook-Endpunkt |
| `STRIPE_COUPON_GRUENDER` | `GRUENDER` — ohne ihn gibt es schlicht keinen Nachlass |
| `PORTAL_URL` | wohin Stripe den Kunden zurückschickt |

Danach `website/konfig.js` → `preise` auf die eigene Projektadresse prüfen.

---

## 10. Gate 3 — bevor es live geht

Dieses Gate ist ein **Stopp**, kein Haken. Vor der Umstellung auf Live-Keys:

1. Die Testmodus-Sperren in `abo-checkout`, `abo-verwalten` und
   `scripts/stripe-einrichten.mjs` bewusst entfernen — jede einzeln, mit
   Blick auf das, was sie verhindert hat.
2. Preise, Limits und Credit-Werte im Plattform-Admin auf den Stand bringen,
   der verkauft werden soll. Sie stehen an **einer** Stelle, nicht im Code.
3. AGB, Widerrufsbelehrung und Preisangabenverordnung prüfen lassen. Dieses
   Dokument trifft dazu **keine** Aussage; was hier steht, ist Technik.
4. `stripe_ereignisse` leeren oder die Testdaten kennzeichnen — sonst
   mischen sich Testmodus-Kennungen unter die echten.
