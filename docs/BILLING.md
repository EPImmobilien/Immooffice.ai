# Tarife, Abos und Credits

Stand 07.10.2026 · Auftrag „Tarife, Abos & Credits für immoOffice.ai",
abgeglichen mit dem Stripe-Integrationsplan vom 07.10.2026 (Abschnitt 4a)

Dieses Dokument hält fest, **was gebaut wurde, welche Annahmen dabei getroffen
wurden und was davon geprüft ist** — getrennt nach dem, was hier prüfbar war,
und dem, was nur beim Betreiber mit einem echten Stripe-Konto prüfbar ist.

> **Test- und Livemodus (seit 07.10.2026).** Gate 3 hat der Betreiber am
> 07.10.2026 ausdrücklich freigegeben („ich will direkt live alles machen").
> Erlaubt sind `sk_test_…` und `sk_live_…`; der Modus ergibt sich aus dem
> hinterlegten Schlüssel. Der Webhook weist jedes Ereignis ab, dessen
> `livemode` nicht zum Schlüssel passt — eine Testkarte schreibt an einem
> Live-System nichts gut, und umgekehrt. Das Seed-Skript legt einen
> Live-Katalog nur mit ausdrücklichem `--live` an.

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
| 5 | Umsatzsteuer | `tax_behavior: exclusive`, **Stripe Tax an** (seit 07.10.2026) | Preise bleiben netto. Stripe rechnet 19 % für Deutschland und Reverse Charge bei gültiger EU-USt-IdNr. ausserhalb Deutschlands; die Kasse fragt die USt-IdNr. ab. Voraussetzung: Steuerregistrierung Deutschland im Stripe-Konto. Vorher stand hier „aus" — überholt durch den Integrationsplan. |
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
`customer.subscription.created/updated/deleted` · `invoice.finalized` ·
`invoice.paid` · `invoice.payment_failed` · `invoice.voided` ·
`invoice.marked_uncollectible` · `credit_note.created`.

---

## 4a. Abgleich mit dem Stripe-Integrationsplan (07.10.2026)

Der Plan kam aus Stripes eigenem Integrationsplaner, angewendet auf das
Sandbox-Konto. Was er verlangt und wo es steht:

| Plan | Umsetzung |
|---|---|
| Stripe-gehostete Kasse (Weiterleitung) | `abo-checkout`, unverändert |
| Pauschaltarife, Zusatznutzer als Menge | unverändert |
| Test ohne Zahlungsmittel, Abo erst beim Abschluss | unverändert |
| Flexible Abrechnung | `subscription_data[billing_mode][type]=flexible` |
| Stripe Tax mit Erhebung | `automatic_tax`, `tax_id_collection`, `customer_update` in jeder Kasse; Produkte mit Steuerkategorie `txcd_10103001` (SaaS, geschäftlich) |
| Karte und SEPA-Lastschrift | `payment_method_types` in jeder Kasse |
| Eigene Abo-Verwaltung statt Kundenportal (Mindestlaufzeit) | `abo-verwalten`: Kündigung, Widerruf, Zusatznutzer, **neu: `tarif_wechseln`** |
| Kundenportal nur für Zahlungsmittel und Rechnungen | eigene Portal-Konfiguration ohne Kündigung und ohne Tarifwechsel; Kennung in `plattform_werte.stripe_portal_konfiguration` |
| Smart Retries, Mahn-Mails | Einstellung im Stripe-Dashboard (Betreiber) |
| Rechnungen automatisch, Abgleich per Webhook | `stripe_rechnungen` (fork_71), geschrieben vom Webhook |

**Feste API-Fassung `2026-08-26.dahlia`.** Die Funktionen senden sie im
Kopf `Stripe-Version`, der Webhook-Endpunkt wird mit derselben angelegt.
Am 07.10.2026 von Clover auf Dahlia gehoben, weil das Stripe-Dashboard für neue Endpunkte nur noch Dahlia anbietet; die Dahlia-Brüche (Checkout-UI-Modi, Event-Destination-Parameter, Kündigungsgrund, Connect/Issuing/Elements) betreffen diese Integration nicht. Ohne feste Fassung gälte, was im Konto eingestellt ist — ein Klick dort
änderte still die Form jeder Antwort. Seit der Basil-Fassung liegen drei
Dinge woanders: die Abo-Periode an den Positionen, der Preis einer
Rechnungszeile unter `pricing.price_details.price`, das Abo einer Rechnung
unter `parent.subscription_details`. Der Webhook liest beide Formen.

**Drei Fehler, die dabei gefunden und behoben wurden:**

1. *Ein Paketkauf brachte ein Monatskontingent mit.* `invoice.paid` schrieb
   Tarif-Credits für **jede** bezahlte Rechnung gut — auch für die Rechnung
   eines Credit-Pakets. Jetzt nur bei `billing_reason` `subscription_create`
   und `subscription_cycle`. Eine Nachberechnung beim Wechsel nach oben
   bringt kein zweites Kontingent; das grössere kommt mit der nächsten
   Periode.
2. *Ein Paketkauf löschte die Abo-Kennung.* `checkout.session.completed`
   schrieb bei einer Einmalzahlung `stripe_subscription_id = null`. Danach
   fand der Webhook das Abo nicht mehr. Jetzt nur im Abo-Modus.
3. *Die Rechnung zum Paket kam nie zustande.* `invoice_creation=true` ist
   kein gültiger Wert; Stripe verlangt `invoice_creation[enabled]=true`.

Dazu: eine zweite Kasse bei laufendem Abo wird abgewiesen (vorher hätte die
Tarifwahl bei einem gekündigten Abo ein **zweites** Abo angelegt), und das
Seed-Skript legte den Gründer-Coupon beim ersten Lauf **ohne**
Tarifbeschränkung an, weil es die Produktkennung aus einer Liste las, die
vor dem Anlegen gelesen worden war.

### Tarif wechseln

`abo-verwalten`, Aktion `tarif_wechseln`. Verglichen wird der Monatswert
(Jahrespreis durch zwölf), damit auch ein Wechsel des Takts richtig
eingeordnet wird.

- **Höher:** sofort, `proration_behavior: always_invoice` — die Differenz
  wird gleich berechnet.
- **Niedriger:** zum Ende der laufenden Periode über einen Subscription
  Schedule; danach gibt der Zeitplan das Abo wieder frei.
- Der Gründerpreis entfällt beim Wechsel endgültig.
- Reicht der neue Tarif nicht für alle, die im Haus arbeiten, wird
  abgewiesen. Bei einem gekündigten Abo ebenso — erst widerrufen.
- Eine Kündigung löst einen vorgemerkten Wechsel nach unten (Stripe nimmt
  `cancel_at` an einem Abo mit Zeitplan nicht an).

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

### Nachtrag 06.10.2026 — der Signaturvorgang (fork_59)

`plattform_credit_preise` kennt `signatur_vorgang` seit fork_47 mit fünf
Credits. Gefragt hat danach nie jemand: `signatur-vorgang-starten` legte den
Vorgang an, baute das PDF, verschickte die Links — und zog nichts ab. Das war
keine offene Preisfrage wie bei den Parsern, sondern eine Leistung mit
festgesetztem Preis, die verschenkt wurde.

Jetzt hängt sie an derselben Beilage wie die KI-Aufrufe. Reserviert wird nach
der Prüfung von `vertrag_id` und `dokument_typ` — eine Anfrage, die an der
Form scheitert, soll kein Reservieren-und-Freigeben im Ledger hinterlassen —
und vor der ersten Schreiboperation. Gebucht wird vor der Erfolgsantwort,
freigegeben im `catch`, der jeden Fehler dieser Funktion auffängt.

Mitgekommen ist die Abo-Prüfung: ein gesperrter Mandant startet keinen
Signaturvorgang mehr. Das ist eine Verhaltensänderung, und sie ist gewollt —
`CLAUDE.md` verlangt, dass Rechte serverseitig durchgesetzt werden.

`tests/credits.js` prüft die Reihenfolge jetzt nicht mehr gegen „den
Anbieter", sondern gegen „die Leistung": für die KI-Funktionen ist das der
Anbieteraufruf, für den Signaturvorgang die Zeile in `signatur_vorgaenge`.
Eine Funktion ohne Anbieter wäre sonst ungeprüft geblieben.

### Nachtrag 06.10.2026 — drei Preise ohne Aktion (fork_60)

Die Gegenrichtung zur Lücke unten: nicht eine Funktion ohne Preis, sondern
ein Preis ohne Funktion. Drei Katalogzeilen standen auf der öffentlichen
Preisseite und versprachen etwas, das die Software nicht tut:

| Aktion | Preis | Warum nichts sie auslöst |
|---|---|---|
| `expose_text` | 10 | Die Oberfläche erzeugt Baustein für Baustein, jeder als eigener `generate-text`-Aufruf zu `ki_text`. Einen Sammelaufruf gibt es nicht. |
| `social_paket` | 5 | Die Bildunterschrift ist ein einzelner `generate-text`-Aufruf, also ebenfalls `ki_text`. |
| `grundriss_visual` | 30 | Keine Funktion erzeugt so etwas. `grundriss-ki-lesen` **liest** einen Grundriss, es zeichnet keinen. |

`fork_60` schaltet sie ab, löscht sie aber nicht: sie beschreiben, was gebaut
werden soll, und der Betreiber macht im Plattform-Admin ein Häkchen, sobald es
die Aktion gibt. Ob ein Sammelpreis überhaupt gewollt ist — zehn Credits für
das ganze Exposé gegen zwei je Baustein — ist eine Produktentscheidung, keine
Code-Frage.

Dass keine vierte Karteileiche entsteht, prüft `tests/credits.js`: jede
Katalogaktion mit einem Preis über null braucht einen Aufrufer oder einen
Eintrag mit Grund — und umgekehrt meldet der Test, wenn eine der drei
plötzlich doch einen bekommt.

**Nebenbefund dabei:** derselbe Test las die Katalognamen bis dahin aus der
ganzen Migrationsdatei und nahm die Tarifzeilen aus `plattform_tarife` mit.
`starter`, `professional`, `business` und `zusatznutzer` galten damit als
bekannte Aktionen; ein `kiAbrechnen(req, "starter")` wäre durchgegangen.
Aufgefallen ist es erst, als die Gegenrichtung geprüft wurde — ein zu großer
Satz bekannter Namen fällt bei einer Prüfung auf Zugehörigkeit nie auf.

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

#### Aber eine Schranke haben sie jetzt (fork_61)

Dass der **Preis** fehlt, ist eine offene Frage. Daran hing eine zweite, die
keine Preisfrage ist: durfte ein Mandant, dessen Testphase abgelaufen ist
oder dessen Zahlung ausbleibt, weiter ein Sprachmodell rufen? Er durfte —
dreißig Funktionen lang. Jeder solche Aufruf kostet den Betreiber bares Geld
beim Anbieter, und `CLAUDE.md` verlangt, dass Rechte serverseitig
durchgesetzt werden.

`supabase/eigene-beilagen/_abo/abo.ts` beantwortet nur diese zweite Frage.
Credits zieht sie keine ab; das tut `credits.ts`, sobald ein Preis im Katalog
steht. Sie liegt als Beilage in dreißig Ordnern und steht in jedem als
Erstes nach dem OPTIONS-Zweig.

**Sie fällt im Zweifel offen aus, und zwar absichtlich.** Abgewiesen wird
nur der eindeutige Fall: ein angemeldeter Nutzer, dessen Mandant bekannt ist
und dessen `abo_zugriff` nicht `voll` lautet. Kein Anmeldekopf, ein Kopf ohne
Nutzer (die Cron-Läufe dieses Projekts schicken den anon-Schlüssel), kein
Mandant am Profil, ein Fehler der Datenbank — alles kommt durch. Eine
Schranke, die im Zweifel zumacht, legt beim ersten Schluckauf das Haus still;
eine, die im Zweifel durchlässt, kostet im schlimmsten Fall einen KI-Aufruf.
Die Abrechnung selbst ist strenger, weil dort Geld bewegt wird.

Eingehängt wird sie nicht von dreißig handgeschriebenen Regelpaaren, sondern
von einem Durchgang in `scripts/neutralisieren-funktionen.py`
(`abo_schranke_einhaengen`): die dreißig Funktionen unterscheiden sich im
Vorspann nur in Kleinigkeiten — `Deno.serve` oder `serve`, `req` oder `_req`,
`corsHeaders` oder `cors`, der OPTIONS-Zweig ein- oder dreizeilig. Findet der
Durchgang seine Anker nicht, bricht er ab; eine Schranke, die sich still
nicht einhängt, wäre schlimmer als keine.

`tests/abo-schranke.js` prüft 247 Punkte. Der wichtigste ist nicht „steht vor
dem Anbieter" — das wäre unprüfbar, weil in der Hälfte dieser Funktionen der
Anbieteraufruf in einem Helfer **oberhalb** des Handlers steht, textlich
davor und ausgeführt danach. Geprüft wird stattdessen, dass zwischen
OPTIONS-Zweig und Schranke nichts steht außer Leerraum und Kommentar. Dann
läuft sie vor allem, was die Funktion sonst tut, Helfer eingeschlossen.
Gegenprobe gemacht: die Schranke in den try-Block verschoben, der Test
schlägt an.

**Zwei Funktionen von Hand:** `bild-privat-retusche` und `grundriss-ki-lesen`
liegen in `supabase/eigene/` und haben keine Vorlage. Dort steht die Schranke
im Quelltext — ein Durchgang, der handgeschriebenen Code umschreibt, wäre
eine Falle für den Nächsten, der ihn anfasst.

**Kein Mandant wurde dabei ausgesperrt:** beide bestehenden Mandanten
antworten auf `abo_zugriff` mit `voll` (nachgesehen am 06.10.2026, vor dem
Ausrollen).

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

## 7. Der Plattform-Bereich des Betreibers (fork_52)

Eine eigene Kachel, sichtbar nur für die, die in `plattform_admins` stehen.
Vier Reiter: **Zahlen** (Monatserlös, zahlende Abos, Credit-Verbrauch und
Anbieterkosten der letzten 30 Tage, freie Gründerplätze, Verbrauch nach
Aktion), **Mandanten**, **Katalog** und **Protokoll**.

**Die Grenze.** CLAUDE.md: „Plattform-Administratoren erhalten keinen
automatischen Zugriff auf Mandantendaten." Sie verläuft nicht bei „Daten über
einen Mandanten" — Tarif, Status und Verbrauch braucht jeder, der Rechnungen
schreibt —, sondern bei **Daten aus einem Mandanten**. Keine Immobilie, kein
Kontakt, keine Mail, keine Datei.

`tests/plattform-admin.js` prüft das gegen eine Liste **erlaubter** Tabellen,
nicht gegen eine Liste verbotener: eine Verbotsliste ist am Tag ihrer
Entstehung vollständig und danach nie wieder.

**Was sich ändern lässt**, steht ebenfalls in einer Liste: Name, Preise,
Nutzerzahl, Credits, Merkmale, Hinweis, aktiv, empfohlen. Keine
Stripe-Kennung und keine Mandantenzuordnung — sonst liesse sich über dieselbe
Aktion `stripe_price_id` setzen, und ein Tarif zeigte auf ein fremdes Produkt.

**Jede Änderung** steht in `plattform_protokoll`, mit Person, Zeit,
Gegenstand und Vorher/Nachher. Eine Credit-Gutschrift ohne Begründung wird
abgewiesen. Das Protokoll ist durch einen Trigger geschützt — eine Richtlinie
allein genügte nicht, weil der Dienstschlüssel sie umgeht.

Eine Preisänderung wirkt **sofort** auf der Website und im Kundenbereich; bei
Stripe entsteht sie erst mit dem nächsten Lauf von
`scripts/stripe-einrichten.mjs`. Das sagt die Antwort der Funktion, statt es
den Betreiber herausfinden zu lassen.

---

## 8. Die Testphase endet nicht unangekündigt (fork_53)

Drei Meldungen, gerechnet in **verbleibenden** Tagen: sieben, zwei, null. Bei
der voreingestellten Testphase von 28 Tagen ist das Tag 21, 26 und 28; ändert
der Betreiber die Länge im Plattform-Admin, wandern die Meldungen mit. Eine
feste Zahl „Tag 21" wäre bei einer vierzehntägigen Testphase die dritte Mail
nach dem Ende.

Jede Meldung geht **einmal**. Die Sperre ist der Primärschlüssel von
`abo_erinnerungen` (Mandant, Art), nicht eine Abfrage davor: zwei
gleichzeitige Läufe sähen sich sonst nicht. Scheitert der Versand, wird die
Sperre wieder gelöst — eine Meldung, die nicht hinausging, darf nicht als
erledigt gelten.

Empfänger sind die **Chef-Konten desselben Mandanten**. Inhalt: die Frist,
der Hinweis, dass nichts automatisch abgebucht und nichts stillschweigend
verlängert wird, die Dauer des anschliessenden Lesezugriffs und ein Link zur
Tarifwahl. Keine fachliche Angabe.

Dazu ein **Band über jeder Seite** der Anwendung, in genau vier Lagen:
Testphase läuft in sieben Tagen aus · Zahlung offen · Lesezugriff oder Sperre
· Credits knapp. Sonst ist es nicht da — ein Band, das immer steht, liest
niemand mehr. Bei einer Sperre lässt es sich nicht wegklicken, in den letzten
beiden Testtagen auch nicht.

„Knapp" ist kein Gefühl: der Anteil steht als `warnung_rest_prozent` im
Katalog und wird gegen das Monatskontingent des Tarifs gerechnet — in
`abo-verwalten`, nicht in der Oberfläche, weil ein Mitarbeiter den Tarif mit
Absicht nicht zu sehen bekommt.

---

## 9. Die Preise auf der Website

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

## 10. Abnahme

### 10.1 Hier geprüft — `tests/abrechnung.sql`, Teil von `npm run check`

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

Dazu `tests/plattform-admin.js` (44 Prüfungen): die Funktion fasst nur
Plattform- und Vertragstabellen an, keine Stripe-Kennung lässt sich von Hand
setzen, jede Änderung wird protokolliert, und die vier Reiter zeichnen sich.
Und `tests/testphase.js` (33 Prüfungen): drei Stufen in verbleibenden Tagen,
die Sperre vor dem Versand, die Freigabe nach einem Fehlschlag, nur
Chef-Konten desselben Hauses — und ein Band, das in sieben Lagen das Richtige
zeigt oder gar nichts.

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

### 10.2 Nicht hier prüfbar — Abnahme beim Betreiber

Dieser Container kommt **weder an Stripe noch an Supabase über HTTPS** heran,
und einen Stripe-Schlüssel gibt es hier nicht. Die folgenden Punkte muss der
Betreiber einmal durchspielen. Die Reihenfolge ist die sinnvolle.

1. `node scripts/stripe-einrichten.mjs --trocken` — zeigt, was angelegt
   würde. Dann ohne `--trocken`.
2. Webhook-Endpunkt bei Stripe anlegen auf
   `…/functions/v1/stripe-webhook`, API-Fassung `2026-08-26.dahlia`,
   Ereignisse wie in Abschnitt 4. `STRIPE_WEBHOOK_SECRET` setzen.
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
9. **SEPA-Lastschrift** (IBAN `DE89370400440532013000`) → Credits erst nach
   `invoice.paid`, nicht beim Rücksprung aus der Kasse.
10. **USt-IdNr. eines anderen EU-Landes** in der Kasse → Rechnung mit Reverse
   Charge, 0 % USt.; ohne USt-IdNr. in Deutschland → 19 %.
11. **Tarif wechseln** Starter → Professional (sofort, anteilige Rechnung) und
   zurück (vorgemerkt zum Periodenende).
12. **Kundenportal** zeigt weder „Kündigen" noch „Tarif ändern".
13. **Zwei Mandanten nebeneinander** → Mandant A sieht in der Oberfläche
   nichts von B. (Die Datenbankseite ist unter 10.1 geprüft; hier geht es um
   den Weg durch die Anwendung.)

Ergebnisse gehören in dieses Dokument, Abschnitt 10.3.

### 10.3 Ergebnisse der Abnahme beim Betreiber

Noch keine. Einzutragen, sobald die Punkte aus 10.2 durchgespielt sind.

---

## 11. Was der Betreiber setzen muss

Supabase → Edge Functions → Secrets (siehe `docs/SECRETS.md` und
`.env.example`):

| Name | Wofür |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` — alles andere bricht ab |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` aus dem Webhook-Endpunkt |
| `STRIPE_COUPON_GRUENDER` | `GRUENDER` — ohne ihn gibt es schlicht keinen Nachlass |
| `PORTAL_URL` | wohin Stripe den Kunden zurückschickt |
| `RESEND_API_KEY`, `SMTP_FROM_EMAIL` | für die Testphasen-Erinnerung (beide sind schon für andere Mails gesetzt) |

Dazu **einmalig**: sich selbst in `plattform_admins` eintragen — sonst ist
der Plattform-Bereich für niemanden sichtbar.

```sql
insert into public.plattform_admins (benutzer_id, notiz)
select id, 'Betreiber' from public.profiles where email = '…';
```

Danach `website/konfig.js` → `preise` auf die eigene Projektadresse prüfen.

---

## 12. Gate 3 — freigegeben am 07.10.2026

Der Betreiber hat den Live-Gang am 07.10.2026 freigegeben. Die
Testmodus-Sperren sind ersetzt durch die Modus-Sperre (siehe oben). Was
dieses Gate prüfen sollte, bleibt als Liste stehen — es ist jetzt Aufgabe
des Betreibers, nicht mehr eine Sperre im Code:

1. ~~Testmodus-Sperren entfernen~~ — erledigt, ersetzt durch die Modus-Sperre.
2. Preise, Limits und Credit-Werte im Plattform-Admin auf den Stand bringen,
   der verkauft werden soll. Sie stehen an **einer** Stelle, nicht im Code.
3. AGB, Widerrufsbelehrung und Preisangabenverordnung prüfen lassen. Dieses
   Dokument trifft dazu **keine** Aussage; was hier steht, ist Technik.
4. `stripe_ereignisse` leeren oder die Testdaten kennzeichnen — sonst
   mischen sich Testmodus-Kennungen unter die echten.
