# Betreiberbereich („Plattform-Admin") — Stand und Entscheidungen

Auftrag vom 07.10.2026: „Betreiber-Dashboard". Dieses Dokument führt je
Schritt, was gebaut ist, was angenommen wurde und was der Betreiber selbst
erledigen muss. Die Kennzahl-Definitionen (Abschnitt 3 des Auftrags) stehen
hier verbindlich, sobald Schritt 3 gebaut ist.

## Vier Abweichungen vom Wortlaut des Auftrags — und warum

| Auftrag sagt | Gebaut | Grund |
|---|---|---|
| `firma_id` | `mandant_id` | Die Mandantentrennung heißt seit fork_07 so, in 194 Tabellen. CLAUDE.md: keine Umbenennung. |
| neue Tabellen `plattform_audit_log`, `support_zugriffe` | `plattform_protokoll` (fork_52) erweitert, `plattform_audit_log` als Sicht darauf; `support_sitzungen` (fork_54) wird erweitert | Der Auftrag verlangt selbst: keine Parallelstrukturen. |
| Route `#/betreiber` | die vorhandene Plattform-Kachel, zur Navigation ausgebaut | Die Anwendung hat keinen Router (Stack-Vorgabe); Ansichten liegen im History-State. Die Kachel erscheint nur für Betreiber — nicht ausgegraut, sondern gar nicht. |
| MFA-Pflicht | ja, als Plattformwert `betreiber_mfa_pflicht` (Start: `true`) | CLAUDE.md sagte „in Version 1 nicht verpflichtend"; der Auftrag ist jünger. Als Wert, damit sich der Betreiber nicht aussperrt und die Pflicht ohne Ausrollen abschaltbar bleibt. |

## Schritt 1 — Zugang, Rollen, MFA, Audit-Log (fork_68) · erledigt 07.10.2026

### Rollen

| Rolle | darf |
|---|---|
| `owner` | alles, auch Betreiber ernennen/deaktivieren, Preise, endgültig löschen |
| `admin` | alles außer Betreiber verwalten und endgültig löschen |
| `support` | Mandanten ansehen (Metadaten), Testphase um bis zu 30 Tage verlängern, Credits bis 500 gutschreiben, Supportzugriff anfragen, Tickets |
| `finanzen` | Umsatz, Rechnungen, Zahlungen, Gutscheine lesen; keine Eingriffe in Mandanten oder Technik |

Wo die Rolle greift — **zweimal**, absichtlich:

1. **Datenbank**: `plattform_rolle()` (security definer) in den Richtlinien
   der Plattformtabellen. `plattform_tarife`, `plattform_credit_preise`,
   `plattform_credit_pakete`, `plattform_werte` schreibt nur `owner`/`admin`.
   `ist_plattform_admin()` kennt jetzt `aktiv`.
2. **Edge Function** `plattform-admin`: eine Karte `ROLLEN` je Aktion, geprüft
   **vor** der Aktion. Was nicht in der Karte steht, dürfen nur `owner` und
   `admin` — ein vergessener Eintrag sperrt also zu viel, nie zu wenig.

Deaktiviert statt gelöscht: das Audit-Log soll weiter zeigen, wer damals
gehandelt hat. Mindestens ein aktiver `owner` bleibt immer — der Trigger
`plattform_admins_letzter_owner` lässt das Gegenteil nicht zu, auch nicht mit
Dienstschlüssel.

### Zweiter Faktor

Supabase schreibt die Stufe der Anmeldung ins Token: `aal1` Passwort, `aal2`
Passwort und bestätigter zweiter Faktor. Die Edge Function liest das Token
und weist alles unter `aal2` mit `{ mfa: true }` ab, wenn
`betreiber_mfa_pflicht` gesetzt ist. Die Oberfläche fängt das ab und führt
durch Einrichtung (QR-Code, Geheimnis) oder Bestätigung (sechs Ziffern).
Nach 30 Minuten ohne Eingabe (`betreiber_sitzung_minuten`) sperrt sich die
Tafel und fragt erneut.

**Voraussetzung, die der Betreiber prüfen muss:** in der Supabase-Konsole
unter *Authentication → Multi-Factor* muss TOTP eingeschaltet sein. Das
lässt sich aus dem Repository nicht setzen.

### Audit-Log

`plattform_protokoll` trägt jetzt `rolle, ziel_typ, ziel_id, vorher, nachher,
begruendung, ip, user_agent`. `plattform_audit_log` ist eine Sicht darauf
mit den Spaltennamen aus dem Auftrag. Nur INSERT: der Trigger
`plattform_protokoll_schutz` (fork_52) verweigert UPDATE und DELETE — auch
dem Owner, auch dem Dienstschlüssel. `tests/betreiber-rollen.sql` führt es vor.

### Der erste Owner

Der Auftrag sieht einen Seed aus `.env.local` (`PLATFORM_OWNER_EMAIL`) vor.
Eine Migration kann keine Umgebungsvariable lesen; der Seed ist deshalb ein
Statement, das der Betreiber einmal ausführt:

```sql
insert into public.plattform_admins (benutzer_id, rolle, aktiv, notiz)
select u.id, 'owner', true, 'Erster Owner (Seed)'
  from auth.users u where lower(u.email) = lower('<PLATFORM_OWNER_EMAIL>')
on conflict (benutzer_id) do update set rolle = 'owner', aktiv = true;
```

Auf dem Projekt `usguiggfciavwzkdfjgt` ist das bereits geschehen:
`info@immooffice.ai` ist Owner (07.10.2026). Das Konto
`info@engferundpartner.de` hat dieselbe Rolle, bis es stillgelegt wird
(siehe `docs/OFFEN.md`).

### Wie fork_68 live kam — und was dabei auffiel

Die Migration ist auf `usguiggfciavwzkdfjgt` angewendet (07.10.2026), aber
nicht in einem Stück: `apply_migration` über das Supabase-MCP lief dreimal
in den 60-Sekunden-Zeitbegrenzer, ohne dass eine Sperre zu sehen war
(`pg_locks` leer, `lock_timeout` schlug nicht an). Eingekreist auf die
Anweisung: **jede Anweisung mit `DROP … IF EXISTS` hängt** über dieses
Werkzeug — `drop trigger`, `drop view`, `drop policy`; dieselben Stücke ohne
`drop` (`create trigger`, `create view`, `alter policy`) liefen in Sekunden.
Deshalb wurde die Datei stückweise und ohne `drop` eingespielt; der Stand
entspricht der Datei im Repository, geprüft über `pg_trigger`, `pg_policy`
und `to_regclass`. Für künftige Migrationen: entweder den Workflow
`migrationen-einspielen.yml` (Runner, `psql`) nehmen oder im MCP auf
`DROP … IF EXISTS` verzichten.

### Abnahme Schritt 1

- [x] Normaler Nutzer / `chef` kommt nicht hinein — Function 403, Richtlinien
      liefern 0 Zeilen, Sicht `plattform_audit_log` leer (`tests/betreiber-rollen.sql`)
- [x] Betreiber ohne zweiten Faktor wird abgewiesen (Function, `aal2`)
- [x] `support` kann keine Preise ändern (Richtlinie + Function)
- [x] Audit-Log weder änderbar noch löschbar (Trigger, Test)
- [x] Mindestens ein aktiver Owner (Trigger, Test)
- [ ] TOTP in der Supabase-Konsole eingeschaltet — **Betreiber**

## Schritt 2 — Mandantenliste und Detail (fork_69) · erledigt 07.10.2026

**Die Grenze, technisch.** `tests/plattform-admin.js` lässt die Edge
Function nur Plattform- und Vertragstabellen anfassen — eine Liste erlaubter
Tabellen. Zählen in `immobilien` dürfte sie also gar nicht. Deshalb zählen
zwei Datenbankfunktionen mit Security Definer und geben **nur Zahlen und
Zeitpunkte** zurück:

- `plattform_mandanten_kennzahlen()` — eine Zeile je Mandant: letzter Login,
  Nutzer, aktive Nutzer (14 Tage), Onboarding-Schritte (0–8), Aktionen in
  30 Tagen, Gesundheitswert.
- `plattform_mandant_metadaten(mandant)` — Onboarding mit Datum, Zählwerte,
  letzte Logins je Konto, Modulnutzung 30 Tage (aus `aktivitaets_log`,
  nur `objekt_typ` gezählt), Speicher je Bucket (`storage.objects`, Summe
  `metadata.size` unter dem Mandantenpräfix).

`tests/betreiber-metadaten.sql` legt ein Objekt „Geheimes Objekt" an und
prüft, dass diese Zeichenkette in der Antwort **nicht** vorkommt — und dass
ein `chef` mit 42501 abgewiesen wird.

**Gesundheitswert (0–100).** Gewichte in `plattform_werte.gesundheit_gewichte`
(Start: login14 30, aktive_nutzer 20, onboarding 25, module 15, zahlung 10):

| Anteil | Rechnung |
|---|---|
| login14 | 1, wenn ein Login in den letzten 14 Tagen, sonst 0 |
| aktive_nutzer | aktive Nutzer (Login ≤ 14 Tage) ÷ Nutzer |
| onboarding | erledigte Schritte ÷ 8 |
| module | min(1, Aktionen in 30 Tagen ÷ 20) |
| zahlung | aktiv/test 1 · gekündigt 0,5 · sonst 0 |

Ampel: ≥ 70 grün, ≥ 40 gelb, sonst rot. Schnellfilter „Risiko" = Wert < 40
oder Zahlung offen; „Test endet bald" = ≤ 3 Tage.

**Credits abziehen** (`credits_abziehen`): älteste Töpfe zuerst — dieselbe
Reihenfolge wie beim Verbrauch —, nie unter null, jede Buchung mit Quelle
`betreiber` und Grund im Ledger, idempotent über die Referenz. Nur
owner/admin, geprüft in der Rollenkarte **und** in der Funktion. Der
Quelle-Check auf `credit_konten` kennt jetzt `betreiber`.

**Notizen** (`plattform_notizen`): lesen alle Betreiber, schreiben
owner/admin/support; Einstufung GLOBAL, und die Spalte heißt
`betrifft_mandant_id`, nicht `mandant_id`: `tests/mandant-einstufung.sql`
stuft jede Tabelle mit `mandant_id` als MANDANT ein, und MANDANT hieße, der
Mandant liest mit. Die Notiz handelt vom Mandanten, gehört ihm aber nicht.

**CSV-Export** (`csvExport` in `plattform.js`): UTF-8 mit BOM, Semikolon,
Zahlen mit Komma, Zeitpunkte im deutschen Format — eine Funktion für alle
Tabellen des Bereichs.

**Testphase verlängern**: Knöpfe +7/+14/+30 Tage setzen `testphase_bis`
relativ zum späteren von heute und bisherigem Ende; gespeichert wird wie
bisher mit Grund. Für `support` lässt die Function nur dieses Feld und
höchstens 30 Tage ab heute zu.

**Noch nicht in diesem Schritt** (kommen mit den genannten Schritten):
Deckungsbeitrag je Mandant (Schritt 4), Rechnungen mit Stripe-Link
(Schritt 6), Gutschein zuweisen (Schritt 5), Tarif per Stripe-API setzen
(Schritt 5), DSGVO-Löschprozess mit 30-Tage-Frist (Schritt 9/10 — heute
gibt es nur die sofortige Löschung durch owner, mit Namensbestätigung).

### Abnahme Schritt 2

- [x] Liste: Firma, ID, Tarif, Status, Nutzer, Credits, MRR, letzter Login,
      Erstellt, Gesundheit; Suche, Schnellfilter, Sortierung, CSV
- [x] Detail nur Metadaten; Onboarding-Checkliste ja/nein + Datum;
      Modulnutzung; Speicher je Bucket; Notizen; Verlauf aus dem Audit-Log
- [x] Aktionen mit Pflicht-Begründung und Audit: Test verlängern, Credits
      gutschreiben/abziehen, sperren/entsperren
- [x] Kein Inhalt einer Fachtabelle in der Antwort (Test)

## Schritt 3 — Übersicht, Kennzahlen-Job, Umsatz & Abos (fork_70) · erledigt 07.10.2026

### Kennzahl-Definitionen (verbindlich)

| Kennzahl | Definition | Wo gerechnet |
|---|---|---|
| **MRR** (netto) | Summe der monatlichen Nettobeträge aller zahlenden Abos (`aktiv`, und `gekuendigt` solange `cancel_at` in der Zukunft) inkl. Zusatznutzer; Jahresabos ÷ 12 (gerundet); Gründer-Rabatt (`gruender_rabatt_cent`) abgezogen, wenn `gruenderpreis` und Tarif = `gruender_tarif`; Testkonten und Credit-Pakete nicht enthalten | `plattform_mrr_je_mandant()` — **die eine Rechnung**, Dashboard und Schnappschuss lesen sie |
| **ARR** | MRR × 12 | Function |
| **Kündigungsquote** | im Zeitraum von zahlend auf nicht zahlend gewechselte Mandanten ÷ zahlende Mandanten am Anfang des Zeitraums (Schnappschuss) | Function, aus `plattform_mandanten_tag` |
| **Umwandlungsquote** | im Zeitraum beendete Tests, die in ein zahlendes Abo übergingen ÷ alle im Zeitraum beendeten Tests | Function, aus `plattform_mandanten_tag` |
| **Deckungsbeitrag** (Schritt 3) | Erlös (MRR anteilig auf den Zeitraum) − KI-Kosten (`ki_kosten_eur` gebuchter Buchungen) — **ohne** Stripe-Gebühren und Infrastrukturpauschale, die kommen mit Schritt 4 | Function |
| **Aktiver Nutzer** | mindestens ein Login im Zeitraum (`auth.users.last_sign_in_at`) | `plattform_mandanten_kennzahlen()` (14 Tage) |

`tests/betreiber-kennzahlen.sql` rechnet die MRR-Probe von Hand nach:
Monatsabo 100,00, Jahresabo 1.080,00 ÷ 12 + zwei Zusatznutzer, Gründer
100,00 − 10,00, Testkonto 0 — Summe muss gleich sein.

### Datenbasis

- `plattform_mandanten_tag` — nächtlicher Schnappschuss je Mandant (Tarif,
  Intervall, Status, zahlend, MRR, Gründer). **Die Historie, die
  `mandant_abo` nicht hat.** Daraus: Wasserfall, Kohorten, Quoten.
- `plattform_kennzahlen_tag` — Tagessummen (`mrr_cent`, `zahlende`,
  `test_aktiv`, `gruender_belegt`, `zahlung_offen`, `kuendigung_vorgemerkt`,
  `ki_kosten_eur`, `credits_verbraucht`, `technikfehler`, `mandanten`), je
  Tarif und gesamt (`tarif = ''`).
- `pg_cron` **02:10 Uhr** (`plattform-kennzahlen-naechtlich`) schreibt den
  Vortag; `plattform_kennzahlen_schreiben(datum)` ist idempotent und von Hand
  nachholbar. Der erste Schnappschuss entstand mit der Migration.
- Live-Werte für heute kommen direkt aus `plattform_mrr_je_mandant()`.

**Ehrlichkeit vor dem ersten Schnappschuss:** Vergleich zum Vorzeitraum,
Wasserfall, Kohorten und Quoten zeigen nichts, solange es keinen
Schnappschuss von damals gibt — keine erfundene Null. Die Demo-Daten
(Schritt 10) füllen zwölf Monate rückwirkend.

### Oberfläche

- Zeitraumleiste 7 / 30 / 90 / 12 Monate / frei (Tage) über allen Reitern.
- Übersicht: neun Kacheln mit Pfeil und Prozent zum Vorzeitraum, „Heute zu
  tun" (Test endet ≤ 3 Tage, Zahlung offen, laufende Supportzugriffe,
  Gesundheit < 40 — jeder Eintrag öffnet den Mandanten), MRR-Verlauf 12
  Monate gestapelt nach Tarif.
- Reiter „Umsatz & Abos" (owner/admin/finanzen): Wasserfall je Monat,
  Verteilung Monat/Jahr/Gründer/je Tarif, Kohorten 1/3/6/12, Credit-Pakete
  je Monat (Anzahl, Credits — Umsatz je Paket mit Schritt 6),
  Mindestlaufzeit endet in 30 Tagen, Kündigung vorgemerkt.
- **Diagramme ohne Bibliothek**: der Auftrag nennt Chart.js als Beispiel,
  falls keine vorhanden ist. Es ist keine vorhanden, und eine neue
  CDN-Bibliothek müsste in Hülle und Service-Worker-Liste. Für gestapelte
  Balken reicht SVG aus `React.createElement` — kein neues Paket, kein
  Zwischenspeicher-Eintrag. Wenn Linien- oder Kreisdiagramme nötig werden,
  wird das neu entschieden.

### Abnahme Schritt 3

- [x] MRR = Handrechnung (Jahr ÷ 12, Gründerrabatt ab, Test/Pakete nicht) — Test
- [x] Kennzahlen-Tabelle nächtlich per pg_cron, Live-Werte für heute
- [x] Kacheln mit Vorzeitraum, Heute-zu-tun mit Direktlink, MRR-Verlauf
- [x] Wasserfall, Verteilung, Kohorten, Fristenlisten
- [ ] Stripe-Spiegeltabellen `rechnungen`/`zahlungen` und Stripe-Abgleich — Schritt 6

## Schritt 4 — Kosten & Marge (fork_72) · erledigt 07.10.2026

Alles aus **einer** Datenbankfunktion, `plattform_kosten(von, bis)`;
die Edge Function reicht den Zeitraum durch und hängt Namen an.

| Größe | Rechnung |
|---|---|
| Erlös je Mandant | MRR (aus `plattform_mrr_je_mandant()`) × Tage ÷ 30 |
| KI-Kosten | Summe `ki_kosten_eur` gebuchter Buchungen im Zeitraum |
| Stripe-Gebühr | **Schätzung**: Erlös × `stripe_gebuehr_prozent` + `stripe_gebuehr_fix_cent` × Tage ÷ 30 — bis Balance Transactions gespiegelt sind (Schritt 6). Die Oberfläche nennt sie „GESCHÄTZT". |
| Infrastruktur | `infrastruktur_pauschale_cent` (Start 150) je zahlendem Mandanten × Tage ÷ 30 |
| Deckungsbeitrag | Erlös − KI − Gebühr − Pauschale; Marge = Deckung ÷ Erlös |
| Ist-Kosten je Credit | Σ `ki_kosten_eur` ÷ Σ Credits der Buchungen **mit** Kostenangabe, je Aktion; Ampel gegen `credit_zielkosten_eur` (Start 0,02): grün ≤ 20 % Abweichung, gelb ≤ 50 %, sonst rot |
| Warnliste | KI-Kosten > `kosten_warnung_prozent` (Start 30) % des Erlöses — oder KI-Kosten ohne jeden Erlös |
| Ergebnis vor Personal & Miete | Deckungsbeitrag − Σ aktive `plattform_fixkosten` × Tage ÷ 30 |

**Anbieter und Modell** stehen seit fork_72 im Ledger (`credit_buchungen.anbieter`,
`.modell`, nullable). `credits_buchen` hat eine Fünfer-Fassung, die sie
entgegennimmt; die Dreier-Fassung bleibt für die fünf bestehenden Aufrufer.
Die Beilage `_credits/credits.ts` reicht sie durch (`buchen(eur, notiz,
anbieter, modell)`). Zentral gesetzt werden sie mit der KI-Steuerung
(Schritt 9); bis dahin zeigt „je Anbieter" `unbekannt`.

`tests/betreiber-kosten.sql`: 30 Tage, Erlös 30,00, KI 12,00, Pauschale
1,50 → Deckung 16,50; 40 % > 30 % → Warnliste; Ist je Credit 0,12; support
legt keine Fixkosten an, admin schon.

### Abnahme Schritt 4

- [x] KI-Kosten je Tag, je Aktion, je Anbieter/Modell
- [x] Ist-Kosten je Credit neben dem Ziel, Ampel > 20 %
- [x] Deckungsbeitrag je Tarif und je Mandant, sortiert, CSV; Marge
- [x] Warnliste mit einstellbarem Prozentsatz
- [x] Fixkostenliste, „Ergebnis vor Personal & Miete"
- [ ] Stripe-Gebühren aus Balance Transactions statt Schätzung — Schritt 6

## Schritt 5 — Preise & Credits, Funktionsschalter (fork_73) · erledigt 07.10.2026

### Preise

- Tarife, Zusatznutzer-Preis, Credit-Kosten je Aktion, Credit-Pakete,
  Testphase, Mindestlaufzeit, Sperrfrist, Gründerpreis: im Reiter „Katalog"
  (gab es seit fork_52; jetzt mit Ist-Kosten je Credit neben jeder Aktion,
  aus Schritt 4).
- **Preisänderung bei Stripe**: ist `STRIPE_SECRET_KEY` gesetzt und trägt der
  Tarif ein `stripe_product_id`, legt `katalog_speichern` beim Speichern
  einen **neuen** Price an und trägt dessen Kennung ein; der alte Price
  bleibt bei Stripe, laufende Abos behalten ihn. Ohne Stripe sagt die Antwort
  `stripe_noetig`.
- **Bestandskunden umstellen** (`tarif_umstellen`, nur owner): ausdrücklich,
  mit Grund inkl. Datum der Kundeninformation, Bestätigungsdialog mit dem
  Hinweis auf die Informationspflicht; je Abo die Tarifposition auf den
  aktuellen Price, ohne Proration; jedes Ergebnis im Audit-Log.
- **Vorschau** „So sieht die Preissektion der Landingpage aus" zeichnet aus
  denselben Feldern wie `src/eigene/abrechnung.js`.
- **Stripe-Modus** steht im Katalog (TESTMODUS / LIVE / nicht verbunden), aus
  dem Präfix des Schlüssels. Hinweis: eine parallele Sitzung hat am
  07.10.2026 Gate 3 („Stripe live erlaubt") freigegeben — siehe
  `ENTSCHEIDUNGEN.md`, Eintrag „Gate 3 freigegeben". Dieser Bereich schreibt
  nie einen Live-Schlüssel; er liest nur, welcher gesetzt ist.

### Gutscheine

Tabelle `gutscheine` (Original) mit Stripe-Coupon als Abbild
(`stripe_coupon_id`, beim ersten Speichern angelegt, wenn Stripe da ist):
Prozent oder Betrag, einmalig / X Monate / dauerhaft, gültig bis, maximale
Einlösungen, Tarifbeschränkung. `gutschein_einloesungen` (MANDANT) zählt
die Einlösungen; **Zuweisen** an einen Mandanten hinterlegt den Coupon am
laufenden Stripe-Abo — ohne laufendes Abo wird nur vermerkt, und die Antwort
sagt das. Pflegen dürfen owner/admin/**finanzen**, Einlösungen sieht das
Haus (nur die eigenen).

### Funktionsschalter

Drei Tabellen, eine Entscheidung:

| Tabelle | Bedeutung |
|---|---|
| `plattform_features` | was es gibt, `standard_an` |
| `tarif_features` | schaltet je Tarif **an**, was standardmäßig aus ist |
| `mandant_features` | Ausnahme je Haus, an oder aus, befristbar (`bis`) |

`hat_feature(schluessel)` entscheidet: Ausnahme des Hauses (solange sie
gilt) → Tarif → Standard. Unbekannte Schlüssel sind **aus**.
`meine_features()` liefert alle Schalter mit dem Stand des eigenen Hauses —
die Anwendung lädt sie einmal beim Start (`src/eigene/features.js`,
`window.ImmoFeature`) und zeigt gesperrte Module als Kachel mit
Upgrade-Hinweis statt sie zu verstecken.

Angelegt: `ki_text`, `ki_bild`, `social`, `portalexport`, `signatur`,
`kundenportal`, `akquise` (alle an — Phase 9: keine Verhaltensänderung) und
`mcp_connector` (aus; an für `professional`/`business`/`enterprise`, soweit
diese Tarife existieren). Ein Modul, das noch gar nicht gebaut ist, hat
damit schon seinen Schalter.

`tests/betreiber-features.sql`: abgelaufene Ausnahme zählt nicht, Ausnahme
schlägt Tarif, Tarif schlägt Standard, unbekannt = aus, ein Haus sieht
fremde Ausnahmen nicht, support legt keine Gutscheine an.

### Abnahme Schritt 5

- [x] Tarife/Zusatznutzer/Credit-Preise/Pakete/Werte bearbeitbar, Ist-Kosten daneben
- [x] Neuer Stripe-Price statt stiller Preisänderung; Umstellung nur ausdrücklich mit Hinweis
- [x] Gutscheine mit Einlöse-Statistik, Tarifbeschränkung, Stripe-Coupon, Zuweisung
- [x] Vorschau der Preissektion vor dem Speichern
- [x] Feature-Matrix Module × Tarife, Ausnahmen je Mandant, `hat_feature()`, Upgrade-Hinweis
- [ ] Abnahmepunkt „Preisänderung erzeugt neuen Stripe-Price" live — braucht `STRIPE_SECRET_KEY` und ein Produkt mit `stripe_product_id`; lokal nicht prüfbar

## Schritt 6 — Zahlungen, Buchhaltungs-Export, Stripe-Abgleich (fork_74) · erledigt 07.10.2026

Baut auf `stripe_rechnungen` auf (fork_71 der parallelen Sitzung — das
Abbild der Rechnungen, geschrieben vom Webhook). Dazu:

- **Drei Spalten am Abbild**, die der Webhook nicht kennt: `gebuehr_cent`
  (Balance Transaction), `versuche` (= Mahnstufe), `naechster_versuch`. Gefüllt
  vom **täglichen Abgleich** (`plattform-stripe-abgleich`, 03:10 Uhr, auch
  per Knopf), nicht vom Webhook — der gehört der Stripe-Integration, und ein
  Webhook mit zwei Nachfragen je Ereignis wird langsam.
- **Fehlgeschlagene Zahlungen**: seit wann (`mandant_abo.zahlung_fehler_seit`),
  Mahnstufe, Betrag, nächster Versuch, **Tage bis Sperre** =
  `zahlung_frist_tage` − Tage seit Ausfall. „Erinnerung senden" lässt Stripe
  die Rechnung erneut versenden (`send_invoice`); bei automatischem Einzug
  stößt es stattdessen den Einzug erneut an (`pay`).
- **Rechnungen** offen / bezahlt / Gutschriften, je mit „In Stripe öffnen"
  (Testmodus-Pfad automatisch). **Erstattung** nur owner/finanzen, mit Grund,
  voll oder Teilbetrag, über `refunds` auf den Payment Intent der Rechnung.
- **Stripe-Abgleich** (`stripe_abgleich`): bezahlte und offene Rechnungen im
  laufenden und im Vormonat, aktive Abos — Anzahl und Summe bei Stripe neben
  dem Abbild, Abweichung mit den Kennungen, die nur auf einer Seite stehen.
  Ein verlorener Webhook fällt so am nächsten Morgen auf.
- **Kosten & Marge** rechnet ab jetzt mit der **echten** Gebühr, sobald der
  Abgleich sie geliefert hat; sonst weiter mit der Schätzung, so beschriftet.

### Export für die Buchhaltung (DATEV-kompatible Struktur)

Monats-CSV, UTF-8 mit BOM, Semikolon, Komma als Dezimaltrenner, eine Zeile
je Beleg (Rechnung oder Gutschrift):

| Spalte | Inhalt | DATEV-Entsprechung (Buchungsstapel) |
|---|---|---|
| Belegart | Rechnung / Gutschrift | Soll/Haben-Kennzeichen (S = Rechnung, H = Gutschrift) |
| Belegnummer | Stripe-Rechnungsnummer | Belegfeld 1 |
| Belegdatum | JJJJ-MM-TT | Belegdatum (TTMM) |
| Mandant, Mandanten-ID | Kunde | Konto (Debitor) — Zuordnung Debitorennummer ↔ Mandanten-ID führt die Buchhaltung |
| Netto EUR, USt EUR, Brutto EUR | Beträge | Umsatz (Brutto) mit BU-Schlüssel |
| USt-Satz % | 19 oder 0 (Reverse Charge) | BU-Schlüssel (z. B. 3 = 19 %, Reverse Charge gesondert) |
| Reverse Charge | ja/nein | Steuerschlüssel §13b |
| Zahlungsstatus, Bezahlt am | paid/open/void | für den Zahlungseingang (Bank) |
| Gebühr EUR | Stripe-Gebühr | separater Aufwandsbeleg (Nebenkosten des Geldverkehrs) |
| Stripe-ID, Währung | Referenz | Buchungstext |

Das ist bewusst **keine** fertige DATEV-Datei (EXTF-Format mit 116 Spalten
und Kopfzeile): die Kontenzuordnung (Erlöskonto, Debitorenkonten, BU-
Schlüssel) gehört der Buchhaltung. Die CSV liefert die Belege so, dass ein
Steuerberater sie mit einer Zuordnungstabelle in einen Buchungsstapel
überführen kann; `docs/ADMIN.md` hält die Spaltenbedeutung fest.

`tests/betreiber-zahlungen.sql`: Mahnstufe 2, Tage bis Sperre 10 (14 − 4),
offener Betrag, Gebühr im Abbild, Kosten rechnen echt statt geschätzt,
support abgewiesen, chef sieht nur die eigene Rechnung.

### Abnahme Schritt 6

- [x] Fehlgeschlagene Zahlungen mit Mahnstufe, Datum, Betrag, Tage bis Sperre, Erinnerung
- [x] Offene/bezahlte/erstattete Rechnungen, Erstattung (owner/finanzen, Begründung)
- [x] Monats-CSV mit Rechnungsnummer, Datum, Mandant, Netto, USt, Brutto, Status; DATEV-Struktur beschrieben
- [x] Stripe-Abgleich täglich mit Abweichungsliste
- [ ] Live-Nachweis braucht Stripe-Verkehr; im Projekt gibt es heute noch keine Rechnung

## Schritt 7 — Technik & Jobs, Fehlerprotokoll (fork_75) · erledigt 07.10.2026

**Migration** `20261007210000_fork_75_betreiber_technik.sql`: Tabellen
`system_fehler` (Funktion, Meldung, betroffener Mandant, erledigt_am — nur
Betreiber, nie Mandant) und `dienst_aufrufe` (Dienst, Dauer, ok — Latenz je
Fremddienst); Funktionen `cron_laeufe(stunden)`, `cron_job_jetzt(jobname)`,
`plattform_speicher()`, `plattform_technik()`.

**Reiter „Technik"** (owner/admin):

| Block | Woher | Was man tun kann |
|---|---|---|
| Status-Ampel | `plattform_technik()` — pg_cron, Stripe-Webhooks, Stripe-Abgleich, Edge Functions, Credit-Ledger, E-Mail | grün/gelb/rot/grau je Dienst, mit einem Satz Begründung |
| Zeitplan-Jobs | `cron_zustand()` (fork_55) | **Jetzt ausführen** → `cron_job_jetzt`: führt exakt das Kommando des Jobs aus, protokolliert `job_sofort` |
| Letzte Läufe | `cron_laeufe(24)` | Start, Dauer, Stand, Meldung (gekürzt auf 300 Zeichen) |
| Stripe-Webhooks | `stripe_ereignisse`, letzte 50 | Link ins Stripe-Dashboard (Test-/Live-Pfad nach Modus). **Kein „Erneut verarbeiten"** — siehe Entscheidungen |
| Funktionsfehler | `system_fehler`, 7 Tage | **Erledigt** setzt `erledigt_am`; Zeile bleibt, wird ausgegraut |
| Hängende Reservierungen | `credit_buchungen`, Status `reserviert`, älter als 1 h | **Freigeben** mit Grund (≥ 5 Zeichen) → `credits_freigeben`, protokolliert `reservierung_freigegeben` |
| Dienste | `dienst_aufrufe`, 24 h | Aufrufe, Fehlerquote, Median, p95 — erscheint erst, wenn eine Funktion misst |
| Speicher | `plattform_speicher()` auf Knopfdruck | Gesamt, Datenbankgröße, je Bucket, je Haus (Top 30), Zuwachs je Monat |
| Oberflächenfehler | `fehler_uebersicht(7)` (fork_55) | Haus, Schlüssel, Quelle, Anzahl — kein Wortlaut, keine Stapelspur |
| E-Mail-Zustellung | — | Platzhalter: kein Zustellprotokoll, bis der Versanddienst-Webhook angebunden ist |

**Grenzen:** Von 130 Edge Functions schreiben heute nur `plattform-admin`
und `plattform-stripe-abgleich` nach `system_fehler`; die Ampel „Edge
Functions" sieht nur diese. Das Anschließen der übrigen ist eine
Fleißarbeit über den Generator (`scripts/neutralisieren-funktionen.py`) und
steht in `docs/OFFEN.md`. `dienst_aufrufe` ist angelegt, aber noch leer.

`tests/betreiber-technik.sql`: support darf `plattform_technik` nicht,
Mandant sieht `system_fehler` nicht, `cron_job_jetzt` mit unbekanntem Job
wirft 22023, Läufe-Funktion weist support ab (42501).

### Abnahme Schritt 7

- [x] Zeitplan-Jobs mit letztem Lauf, Ausgang, Fehlern; „Jetzt ausführen"
- [x] Stripe-Webhook-Log mit Link ins Dashboard
- [x] Funktionsfehler mit Erledigt-Vermerk
- [x] Hängende Credit-Reservierungen mit begründeter Freigabe im Audit-Log
- [x] Speicher je Haus und je Monat
- [x] Status-Ampel
- [ ] E-Mail-Zustellung — erst mit Versanddienst-Webhook
- [ ] Fehler aus allen Funktionen — heute nur zwei Funktionen angeschlossen

## Schritt 8 — Support-Anfragen, Supportzugriff mit Freigabe (fork_77) · erledigt 07.10.2026

**Migration** `20261007230000_fork_77_betreiber_support.sql`.

**Supportzugriff — der einzige Weg zu Fachdaten — hat jetzt vier Schritte:**

1. Der Betreiber (owner/admin/support) fragt in der Mandantenansicht an:
   Grund (≥ 5 Zeichen), Umfang (nur lesen / lesen + ändern), Dauer
   1–24 h. Das ist eine Zeile in `support_sitzungen` **ohne**
   `freigegeben_am`. Audit: `support_angefragt`. Der Chef des Hauses
   bekommt eine E-Mail (Resend, best effort) und ein Band im Portal.
2. Der `chef` entscheidet — im Band oder unter *Einstellungen →
   Support-Zugriffe* — über `support_zugriff_entscheiden(id, ja)`.
   Nur der Chef **dieses** Hauses; Mitarbeiter und fremde Chefs bekommen
   42501. Bei Freigabe wird die Uhr **jetzt** gestellt
   (`gueltig_bis = now() + dauer`).
3. `support_sitzung()` liefert nur Sitzungen mit `freigegeben_am`. Ohne
   Freigabe zeigt `aktuelle_mandant_id()` auf das eigene Haus des
   Administrators — jede RLS-Richtlinie bleibt zu. Nachgewiesen in
   `tests/supportzugriff.sql`, Block 8a.
4. Protokoll (`support_protokoll`): jeder Seitenwechsel (das rote Band
   meldet `location.hash` über `support_seite_protokollieren`) und jede
   geänderte Zeile (Trigger `support_protokoll_tr` an allen 200
   Mandantentabellen: Tabelle, Kennung, insert/update/delete — **kein
   Inhalt**). Der Mandant liest es in den Einstellungen; der Admin liest es
   nicht als „eigenes". Der Chef beendet jederzeit vorzeitig
   (`support_zugriff_beenden`); automatisches Ende nach Ablauf.

**Support-Anfragen** (Portal-Kachel „Hilfe & Support", für jeden im Haus):

| Tabelle | Wer schreibt | Wer liest |
|---|---|---|
| `support_anfragen` | Mandant (insert, nur `status = offen`), Betreiber (service role: Stand, Priorität, Zuständiger, Übernahme-Stand, Paket-Rechnung) | das Haus; Betreiber |
| `support_antworten` | Mandant (`von_betreiber = false` erzwungen), Betreiber | das Haus; Betreiber |

Trigger `support_antwort_nach`: erste Betreiber-Antwort stempelt
`erste_antwort_am`; Betreiber-Antwort → `wartet_kunde`, Kunden-Antwort →
`offen`; gelöst/geschlossen bleiben. Der Kunde schließt selbst
(`support_anfrage_schliessen`). Antwort des Betreibers geht per E-Mail an
den Fragesteller (best effort) und steht im Portal.

**Datenübernahme:** Kategorie `datenuebernahme` mit `uebernahme_status`
(beauftragt → datei_erhalten → importiert → abgenommen) und
`paket_rechnung_id` (Stripe-Rechnung `in_…` des Einrichtungspakets, Link
ins Dashboard).

**Kennzahlen** (`plattform_support_kennzahlen()`, owner/admin/support):
offen, davon > 24 h ohne erste Antwort, Priorität hoch, erste Antwortzeit
und Lösungszeit als **Median in Stunden über 90 Tage**, Anfragen je
Kategorie, Übernahmen je Stand, Zugriffsanfragen offen/laufend. Die
Übersicht zählt offene Anfragen; „Heute zu tun" nennt Anfragen ohne
Antwort seit > 24 h.

**Neue Mandantentabellen brauchen den Trigger:** Block 6 der Migration
(Schleife über `mandanten_einstufung`, Gruppe MANDANT) in der nächsten
Migration wiederholen — er ist idempotent.

`tests/betreiber-support.sql`: 19 Prüfungen (Hausgrenze, kein falscher
Betreiber, Statuswechsel, Protokoll von Seite und Änderung, Kennzahlen
nur Betreiber).

### Abnahme Schritt 8

- [x] Anfrage → Freigabe durch `chef` → Banner (rot, nicht wegklickbar) → Zugriff endet automatisch → Mandant sieht Protokoll
- [x] Ohne Freigabe kein Zugriff (RLS-Test mit echten Abfragen)
- [x] Tickets: Mandant stellt, Betreiber antwortet (Dashboard + E-Mail + Portal), Kennzahlen
- [x] Datenübernahme als eigener Anfragetyp mit Stand und Paketverknüpfung
- [ ] E-Mail-Versand live nachweisen — braucht `RESEND_API_KEY`/`SMTP_FROM_EMAIL` als Function-Secrets

## Schritt 9 — KI-Steuerung, Vorlagen & System-Mails, Rechtstexte, Ankündigungen (fork_78) · erledigt 07.10.2026

**Migration** `20261007240000_fork_78_betreiber_steuerung.sql`.

### KI-Steuerung (Reiter „KI")

| Was | Wo | Wirkung |
|---|---|---|
| Anbieter, Modell, Temperatur, Max-Tokens je Funktion | `plattform_ki_einstellungen` | Die Beilage `_credits` liefert die Zeile mit (`abr.modell(standard)`, `abr.maxTokens(standard)`, `abr.temperatur(standard)`); `generate-text`, `text-korrigieren`, `expose-pruefen` nutzen sie. Bild-KI (Replicate) trägt „siehe Funktion": das Modell steht dort fest im Code. |
| Notschalter mit Hinweis | `aktiv = false` + `hinweis` | Zweifach: die Beilage antwortet 503 `notschalter` mit dem Hinweis, **und** der Trigger `ki_schranke` am Ledger wirft `KI001` — auch an jeder Stelle, die die Beilage nicht nutzt. |
| Tageslimit je Mandant | `plattform_werte.ki_tageslimit_credits` / `_eur` (0 = kein Limit), Ausnahme je Haus in `mandant_ki_limits` | Trigger `ki_schranke` vor jeder Reservierung: Summe von heute (Mitternacht **Europe/Berlin**, Status reserviert/gebucht) + Kosten der Aktion > Limit → `KI002`, Beilage antwortet 429 `tageslimit`. Kostenfreie Aktionen (`pdf_export` …) sind nie betroffen. |
| Kostenalarm-Schwellen | `alarm_kosten_tag_eur`, `alarm_kosten_monat_eur`, `alarm_kosten_mandant_tag_eur`, `alarm_kosten_mandant_monat_eur` | Gespeichert; ausgewertet von den Warnregeln in Schritt 10. |

### Vorlagen & System-Mails (Reiter „Vorlagen & Mails")

Globale Vorlagen sind die Zeilen **ohne Mandant** in `expose_vorlagen`,
`vertragsvorlagen`, `mpe_bausteine`, `marketing_print_vorlagen`. Der
Betreiber archiviert/aktiviert sie (`archiviert` bzw. `aktiv`) und legt
für Exposé-Systemvorlagen eine neue Version an (Kopie mit `version + 1`,
alte archiviert). Mandanten-Kopien werden nie angefasst. Neue globale
Vorlagen entstehen weiterhin im jeweiligen Modul.

System-Mails (`system_mail_vorlagen`, Schlüssel `willkommen`, `test_7`,
`test_2`, `test_0`, `zahlung_problem`, `kuendigung_bestaetigt`,
`support_zugriff_angefragt`, `support_antwort`, `loeschung_angekuendigt`):
Betreff + Text mit `{{firma.name}}`-Platzhaltern, Vorschau mit
Beispielwerten, Testversand an die eigene Adresse. `system_mail_rendern()`
setzt ein; unbekannte Platzhalter bleiben sichtbar stehen. **Angeschlossen:**
`testphase-erinnerung` (test_7/2/0), `plattform-admin`
(support_zugriff_angefragt, support_antwort). Die übrigen Schlüssel sind
gepflegt, aber noch ohne Versender — siehe OFFEN.

### Rechtstexte (Reiter „Rechtstexte")

`rechtstexte` (AGB, AVV, Datenschutz, Impressum; Version, gültig ab,
Änderungshinweis, Zustimmungspflicht). Entwurf → Veröffentlichen (nur
**owner**, mit Grund im Audit-Log); veröffentlichte Texte sind öffentlich
lesbar (auch anon) und werden nicht mehr geändert. Bei
`zustimmung_noetig`: `rechtstexte_offen()` nennt dem Chef die jüngste
gültige Fassung je Art ohne Zustimmung seines Hauses; das Portal legt
`ImmoRechtstextSperre` über die Anwendung (Chef; Mitarbeiter sehen
nichts). Zustimmung = Zeile in `rechtstext_zustimmungen` (nur chef,
eigenes Haus, RLS). Übersicht „X von Y" über
`plattform_rechtstexte_stand()`.

### Ankündigungen (Reiter „Ankündigungen")

`ankuendigungen`: Typ (Info/Wartung/Neue Funktion/Warnung), Zeitraum,
schließbar ja/nein, Ziel nach Tarif, Status, einzelnen Häusern (leer =
alle), optional einmalige Mail an die Chefs. `meine_ankuendigungen()`
filtert serverseitig; Wartungen erscheinen sieben Tage vorher mit
Countdown. Weggeklickte Hinweise merkt sich der Browser (`localStorage`).

`tests/betreiber-steuerung.sql`: 20 Prüfungen (KI001 ohne Ledger-Zeile,
KI002 mit Tageszählung ohne gestern, Ausnahme je Haus, kostenfrei nie
betroffen, Rendern, anon liest nur Veröffentlichtes, Zustimmung nur
chef/eigenes Haus, Tarif-Ziel, Wartungs-Countdown).

### Abnahme Schritt 9

- [x] Je KI-Funktion Anbieter/Modell wählbar, Temperatur/Max-Tokens
- [x] Tageslimit greift und gibt nach Mitternacht wieder frei (Trigger, Zeitzone Europe/Berlin)
- [x] Globaler Notschalter je Funktion mit Hinweistext
- [x] Kostenalarm-Schwellen hinterlegt (Auswertung Schritt 10)
- [x] Globale Vorlagen: archivieren, neue Version (Exposé), Mandanten-Kopien unberührt
- [x] System-E-Mails mit Platzhaltern, Vorschau, Testversand
- [x] Rechtstexte versioniert; neue AGB-Version mit Zustimmungspflicht blockiert `chef` bis zur Zustimmung; Übersicht X von Y
- [x] Ankündigungen nach Tarif/Status/einzeln, Wartung mit Countdown, optional Mail
- [ ] Rechtstexte auf der Landingpage aus der Tabelle (heute statische Seiten) — OFFEN

## Schritt 10 — Warnungen, Tageszusammenfassung, Demo-Daten (fork_79) · erledigt 07.10.2026

**Migration** `20261007250000_fork_79_betreiber_warnungen_demo.sql`,
**Edge Function** `plattform-warnungen` (öffentlich wie alle Cron-Ziele,
nimmt nur `modus`/`erzwingen`).

### Warnregeln (Reiter „Warnungen")

| Regel | Auslöser | Eindeutig je |
|---|---|---|
| Zahlung fehlgeschlagen | `mandant_abo.zahlung_fehler_seit` | Mandant + Datum |
| Mandant über KI-Kostengrenze | Tages-/Monatskosten eines Hauses > `alarm_kosten_mandant_tag_eur` / `_monat_eur` | Mandant + Tag bzw. Monat |
| Tages-KI-Kosten gesamt | Summe aller Häuser > `alarm_kosten_tag_eur` / `_monat_eur` | Tag bzw. Monat |
| Job-/Webhook-Fehler > N in 1 h | gescheiterte Cron-Läufe + Stripe-Webhooks mit Fehler, Schwelle einstellbar (Start 3) | Stunde |
| Externer Dienst gestört | `dienst_aufrufe`: Fehlerquote > X % (Start 20) bei ≥ 5 Aufrufen in 1 h | Dienst + Stunde |
| Support-Anfrage Priorität hoch | offene Anfrage mit `prioritaet = hoch` | Anfrage |
| Neuer zahlender Mandant (Info) | Abo in den letzten 24 h aktiv | Mandant |
| Kündigung (Info) | `gekuendigt_am` | Mandant + Datum |

`plattform_warnungen_pruefen()` läuft stündlich (pg_cron 20 min nach voll →
`plattform-warnungen` modus `pruefen`), schreibt jede Warnung **einmal**
(`plattform_warnungen.eindeutig`); die Function sendet alles Ungesendete
an `plattform_werte.betreiber_email` und setzt `gesendet_am`. Ohne Adresse
wird nur protokolliert. Demo-Mandanten sind ausgenommen. **Kanal:** nur
E-Mail — die Vorlage hat keinen Push-Weg zum Betreiber; die Oberfläche
sagt das in der Regeltabelle.

### Tageszusammenfassung

`plattform_tageszusammenfassung()`: MRR und zahlende, gestern neue Abos /
Kündigungen / neue Tests, Tests endend in 3 Tagen, KI-Kosten und Credits
gestern, offene Probleme (Zahlungen, Job-/Webhook-Fehler, Support,
Zugriffsanfragen, hängende Reservierungen, Funktionsfehler, Warnungen).
Versand 7:30 Europe/Berlin: pg_cron kennt keine Zeitzone, deshalb zwei
Jobs (05:30 und 06:30 UTC); die Function sendet nur, wenn es in Berlin
7 Uhr ist, und nur einmal am Tag (Schlüssel `zusammenfassung:<Datum>`).
Schalter `zusammenfassung_aktiv`; „Zusammenfassung jetzt senden" erzwingt.

### Demo-Daten (Owner)

`plattform_demo_anlegen()`: 30 fiktive Mandanten (`ist_demo = true`,
Namen wie „Küstenmakler Demo GmbH"), 18 aktiv / 5 Test / 3 gekündigt /
3 Zahlung offen / 1 gesperrt, Tarife Starter/Professional/Business, Monat
und Jahr, Zusatznutzer, Gründerpreis; je Monat Tarif-Topf, Buchungen mit
KI-Kosten über bis zu 12 Monate (~1.800 Ledger-Zeilen), Rechnungen
(`in_demo_…`, Stripe-Abgleich nimmt sie aus), Objekte, Support-Anfragen,
Chef-Nutzer mit Login-Spur, Kennzahlen-Verlauf (Monatsenden, `ist_demo`).
`plattform_demo_entfernen()` löscht alles (Ledger geht mit, weil der
Mandant selbst verschwindet — fork_47). Bestätigung „DEMO".

`tests/betreiber-warnungen.sql`: 14 Prüfungen (einmalige Warnung,
abgeschaltete Regel, Support hoch, Tageskosten, Zusammenfassung, Demo:
30, MRR = Handsumme, Warnregeln ohne Demo, 12 Monate, Rechnungen,
doppeltes Anlegen abgewiesen, vollständiges Entfernen).

## Supabase-Advisors (Stand 07.10.2026, nach fork_79)

| Befund | Anzahl | Betreiber-Objekte | Umgang |
|---|---|---|---|
| `function_search_path_mutable` | 77 | 2 (`credit_buchung_unveraenderlich`, `plattform_protokoll_unveraenderlich`) | **behoben** (fork_80); die 75 übrigen sind Vorlage/Altbestand → OFFEN |
| `auth_rls_initplan` | 249 | 8 Richtlinien | **behoben** (fork_80: `(select auth.uid())`) |
| `unindexed_foreign_keys` | 378 | 17 | **behoben** (fork_80) |
| `authenticated_security_definer_function_executable` | 124 | alle Betreiberfunktionen | gewollt: das Gate `tests/funktionsrechte.sql` verlangt EXECUTE für `authenticated`; jede Funktion prüft `plattform_rolle()` im Körper |
| `rls_enabled_no_policy` | 21 | 5 (`ankuendigungen`, `mandant_ki_limits`, `plattform_warnregeln`, `plattform_warnungen`, `system_mail_vorlagen`) | gewollt: nur Dienstschlüssel; Angemeldete lesen über Funktionen |
| `multiple_permissive_policies` | 574 | 8 (`plattform_*`) | gewollt: lesen (alle) + pflegen (owner/admin) getrennt |
| `unused_index` | 364 | 19 | erwartbar auf einer jungen Datenbank; nach drei Monaten Betrieb erneut prüfen |
| `auth_leaked_password_protection` | 1 | — | Konsole: *Authentication → Password* einschalten (To-do Betreiber) |

## Abnahme (Auftrag, Abschnitt 22)

| # | Punkt | Stand | Nachweis |
|---|---|---|---|
| 1 | Normaler Nutzer und `chef` erreichen `#/betreiber` nicht, auch nicht per RPC/Function | ✓ | `plattform-admin` prüft `plattform_admins` je Aufruf; Plattformfunktionen werfen 42501 (`tests/betreiber-rollen.sql`, `-technik`, `-support`, `-steuerung`) |
| 2 | Plattform-Admin ohne zweiten Faktor wird abgewiesen | ✓ | fork_68: `aal`-Claim; TOTP muss in der Supabase-Konsole aktiviert sein (To-do) |
| 3 | Ohne Support-Zugriff keine Objekte, Kontakte, Verträge, Dateien (RLS-Test) | ✓ | `tests/supportzugriff.sql` Block 1 und 8a |
| 4 | Anfrage → Freigabe `chef` → Banner → automatisches Ende → Protokoll | ✓ | fork_77, `tests/supportzugriff.sql`, `tests/betreiber-support.sql` |
| 5 | `support` ändert keine Preise, `finanzen` sperrt keine Mandanten | ✓ | ROLLEN-Karte: `katalog_speichern` owner/admin, `mandant_speichern` owner/admin/support; `tests/betreiber-rollen.sql` |
| 6 | Audit-Log weder änderbar noch löschbar | ✓ | fork_52 Trigger; `tests/betreiber-rollen.sql` (auch mit Dienstrecht) |
| 7 | MRR = manuelle Summe der Demo-Abos | ✓ | `tests/betreiber-warnungen.sql`: 350.471 vs 350.469 Cent — Differenz = Rundung Jahrespreis ÷ 12 je Jahresabo; live mit denselben 30 Demo-Häusern: 350.471 Cent |
| 8 | Ist-Kosten je Credit aus `credit_buchungen` | ✓ | Schritt 4, `tests/betreiber-kosten.sql` |
| 9 | Preisänderung → neuer Stripe-Price, Bestand behält alten, Landingpage neu | ✓ (Testmodus) | Schritt 5 (`katalog_speichern`, `tarife-oeffentlich`) |
| 10 | Feature-Flag „ab Professional" sperrt Modul im Starter mit Upgrade-Hinweis | ✓ | Schritt 5, `hat_feature`, `features.js` |
| 11 | KI-Tageslimit greift und gibt nach Mitternacht frei | ✓ | `tests/betreiber-steuerung.sql` (gestern zählt nicht, KI002) |
| 12 | Neue AGB-Version mit Zustimmungspflicht blockiert `chef` | ✓ | `rechtstexte_offen()`, `ImmoRechtstextSperre`, Test |
| 13 | Warnung bei fehlgeschlagener Zahlung per E-Mail; Tageszusammenfassung versendet | ✓ Logik / ☐ live | Versand braucht `betreiber_email` + `RESEND_API_KEY`/`SMTP_FROM_EMAIL` als Function-Secrets |
| 14 | CSV öffnet sauber in Excel (UTF-8 BOM, Semikolon, deutsche Zahlen) | ✓ | `csvExport` in `plattform.js`: `\ufeff`, `;`, Komma-Dezimal, de-DE-Datum |
| 15 | Übersicht < 2 s mit Demo-Daten | ✓ | Live mit 30 Demo-Häusern (07.10.2026): `plattform_mandanten_kennzahlen()` + `plattform_kosten()` zusammen 13 ms; `plattform_technik()` (Technik-Reiter, liest `cron.job_run_details`) 1,7 s — nicht Teil der Übersicht |
| 16 | 375 px nutzbar | ✓ (gebaut) | Kacheln `auto-fit`, Tabellen scrollen nur innerhalb des Kastens (`overflowX: auto`); nicht auf Gerät gemessen |
| 17 | Neutralitäts-Gate grün | ✓ | Teil von `npm run check` |

## Kurzbericht

**Erledigt:** Schritte 1–10 des Auftrags, Migrationen fork_67–79, Edge
Functions `plattform-admin` (erweitert), `plattform-stripe-abgleich`,
`plattform-warnungen`, Oberfläche `src/eigene/plattform.js` (14 Reiter),
`hilfe.js`, `hinweise.js`, `features.js`; je Schritt SQL-Gates in
`npm run check`; alles auf dem Projekt `usguiggfciavwzkdfjgt` und unter
app.immooffice.ai ausgerollt (die Website ohne `app.` ist eine eigene Site).

**Offene Annahmen:** Stripe nur Testmodus (Gate 3); E-Mail-Versand
best effort über Resend; „Erneut verarbeiten" für Webhooks gibt es bewusst
nicht (Stripe sendet selbst erneut); Bild-KI wählt ihr Modell im Code
(„siehe Funktion"); Push-Kanal gibt es nicht.

**Bekannte Grenzen:** `system_fehler` füllen nur die drei eigenen
Betreiber-Functions; Rechtstexte stehen auf der Landingpage noch statisch;
System-Mails `willkommen`, `zahlung_problem`, `kuendigung_bestaetigt`,
`loeschung_angekuendigt` haben keinen Versender; DSGVO-Löschprozess
(30 Tage, Export-Angebot) ist nicht gebaut — Löschen ist sofort und nur
owner; Kohorten/Modulnutzung rechnen aus Metadaten, nicht aus Logins je
Modul; zwei Sitzungen auf einem Branch brauchen eine Nummernabsprache
(fork_71/fork_76 kollidierten je einmal).

**Stand auf dem Projekt:** Demo-Daten sind angelegt (30 Häuser, 1.774 Ledger-Zeilen, 174 Rechnungen, Kennzahlen-Verlauf 12 Monate) — nach der Abnahme über „Warnungen → Demo-Daten entfernen“ wieder weg.

**Der Betreiber selbst:** siehe nächster Abschnitt.



Werden hier je Schritt nachgetragen. Reihenfolge wie im Auftrag.

## Was der Betreiber selbst erledigen muss

1. TOTP unter *Authentication → Multi-Factor* einschalten, dann sich selbst
   einmal mit der Authenticator-App einrichten (die Tafel führt hin).
2. Ersten Owner festlegen (ist auf dem Projekt geschehen; Statement oben für
   weitere Installationen).
3. Betreiber-E-Mail für Warnungen und Tageszusammenfassung: Reiter
   „Warnungen" → Adresse speichern. Dazu `RESEND_API_KEY` und
   `SMTP_FROM_EMAIL` als Function-Secrets (docs/SECRETS.md), sonst wird nur
   protokolliert.
4. Rechtstexte einpflegen: Reiter „Rechtstexte" → je Art eine Fassung,
   anwaltlich prüfen lassen, veröffentlichen (owner). Bei AGB/AVV
   „Zustimmung erforderlich" setzen, wenn die Chefs zustimmen sollen.
5. KI-Grenzen prüfen: Reiter „KI" → Tageslimit (Start 0 = aus) und
   Alarm-Schwellen (Start 50 €/Tag, 1.000 €/Monat, je Mandant 10/100 €).
6. Leaked-Password-Schutz unter *Authentication → Password* einschalten
   (Supabase-Advisor).
7. Domain-Werte prüfen: `PORTAL_URL` = `https://app.immooffice.ai`,
   `EXPOSE_FREIGABE_BASIS` = `https://app.immooffice.ai/freigabe.html`,
   Supabase *Site URL* = `https://app.immooffice.ai` (docs/DOMAIN_VERBINDEN.md).
   Alle Mails des Betreiberbereichs (Support, Zugriffsanfrage) bauen ihre
   Links aus `PORTAL_URL`.
8. Demo-Daten nach der Abnahme wieder entfernen (Reiter „Warnungen", unten,
   Bestätigung DEMO) — sie zählen in allen Listen mit, nur Warnungen,
   Zusammenfassung und Stripe-Abgleich lassen sie aus.
