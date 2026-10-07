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

## Noch offen aus dem Auftrag (Schritte 4–10)

Werden hier je Schritt nachgetragen. Reihenfolge wie im Auftrag.

## Was der Betreiber selbst erledigen muss

1. TOTP unter *Authentication → Multi-Factor* einschalten, dann sich selbst
   einmal mit der Authenticator-App einrichten (die Tafel führt hin).
2. Ersten Owner festlegen (ist auf dem Projekt geschehen; Statement oben für
   weitere Installationen).
3. Betreiber-E-Mail für Warnungen — kommt mit Schritt 10.
4. Rechtstexte einpflegen — kommt mit Schritt 9.
