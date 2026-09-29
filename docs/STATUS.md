# Status — immoOffice.ai als Fork der E&P World

**Stand:** 14.09.2026 · Phase 0 (Backend 1:1 übernehmen)

---

## 1. Aufnahme der Quelle

### Frontend

| Datei | Größe | SHA-256 (Anfang) |
|---|---|---|
| `reference/epworld-src.html` | 4.689.542 B · 6.766 Zeilen | `43767704d96be0bf…` |
| `reference/epworld-freigabe.html` | 11.828 B | Exposé-Freigabeseite |
| `reference/epworld-sw.js` | 6.614 B | Service Worker |
| `reference/epworld-_redirects` | 297 B | Netlify-Weiterleitungen |

`reference/epworld-index.html` (22 MB, minifiziert, Stand 16.08.) ist der **alte**
Export und nur noch Altbestand. Wahrheit für Funktion und Verhalten ist
`epworld-src.html`.

Eingebundene Fremdbibliotheken (alle über CDN, Versionen im Original gepinnt):
React 18 UMD · react-dom 18 UMD · supabase-js 2 · jszip 3.10.1 ·
tesseract.js 5 · html2canvas 1.4.1 · qrcode-generator 1.4.4 ·
pdfjs-dist 3.11.174 · jspdf 2.5.1 · pdf-lib 1.17.1 · mammoth 1.7.2 ·
leaflet 1.9.4 · msal-browser 2.38.3 · babel/standalone.

**Befund:** `supabase-js@2` und `react@18` sind **nicht exakt** gepinnt
(Major-Alias). Abschnitt 2 des Auftrags verlangt exakte Pins; das wird in
Phase 1.2 nachgezogen und in `docs/ENTSCHEIDUNGEN.md` protokolliert.

### Backend der Referenz (Projekt `yazwkzzjiquprtjpurur`, eu-west-1)

| Gegenstand | Menge |
|---|---|
| Tabellen (`public`) | **167** |
| Views (`public`) | 4 |
| Datenbankfunktionen (`public`) | 84 |
| Trigger (`public`) | 54 |
| RLS-Policies (`public`) | **320** |
| Enum-Typen | 0 (Statuswerte durchweg als `text`) |
| Storage-Buckets | **25**, davon 5 öffentlich |
| Edge Functions | **130** |
| Extensions | `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp` |
| Schemas | `auth`, `cron`, `extensions`, `graphql`, `graphql_public`, `net`, `public`, `realtime`, `storage`, `supabase_migrations`, `vault` |

Öffentliche Buckets: `immobilie-dateien`, `ki-bilder`, `shop-tv`, `web-assets`.
`shop-tv` gehört zum Yodeck-Betrieb der Referenz und entfällt (Phase 1.4).

Drei Buckets heißen `Marcellus regular`, `Montserrat bold`,
`Montserrat regular` — dort liegen Schriftdateien. Namen mit Leerzeichen sind
in Pfaden unangenehm; beim Übernehmen werden sie zu einem Bucket `schriften`
zusammengeführt (siehe `docs/ENTSCHEIDUNGEN.md`).

---

## 2. Was Phase 0 **nicht** leisten kann — und warum

### 2.1 Kein Supabase-CLI, kein Netzzugang zu Supabase

Der Auftrag sieht `supabase db dump` und `supabase functions download` vor.
Beides ist in dieser Arbeitsumgebung nicht ausführbar:

| Ziel | Ergebnis |
|---|---|
| `api.supabase.com` | Verbindung vom Egress-Proxy abgelehnt |
| `yazwkzzjiquprtjpurur.supabase.co` | abgelehnt |
| `usguiggfciavwzkdfjgt.supabase.co` | abgelehnt |
| `unpkg.com`, `cdn.jsdelivr.net` | abgelehnt |
| Supabase-CLI | nicht installiert, Installation ohne Netz nicht möglich |
| Datenbank-Port 5432 (Pooler und `db.<ref>.supabase.co`) | DNS löst auf, TCP läuft in den Zeitablauf |

Damit ist auch `pg_dump` gegen das Projekt ausgeschlossen, obwohl
`pg_dump`/`psql` 16 lokal vorhanden sind: der Ausgangsproxy führt nur HTTPS,
keine rohen TCP-Verbindungen.

Ersatzweg: Beide Projekte sind über die **Supabase-Verwaltungsschnittstelle**
erreichbar. Das Schema wird darüber gelesen und als Migration nachgebaut —
lesend, das Referenzprojekt wird nicht verändert.

**Besser als erwartet:** Supabase legt zu jeder angewendeten Migration den
Wortlaut in `supabase_migrations.schema_migrations.statements` ab. Das Schema
der Vorlage muss also nicht aus dem Katalog rekonstruiert (und damit in Teilen
erraten) werden — es lässt sich **wörtlich** lesen: 166 Migrationen, 426 kB,
vom 05.06.2026 bis heute. Das ist der Schema-Export aus Phase 0.1, in der
genauen Fassung, in der er im Projekt gelaufen ist.

**Prüfbarkeit hergestellt:** Ein Postgres-Server ist lokal vorhanden.
`scripts/lokale-db.sh` legt eine Wegwerf-Instanz an, baut mit
`tests/supabase-nachbau.sql` so viel Supabase nach, wie die Migrationen
brauchen (Rollen, `auth.uid()`, Minimal-Storage, Platzhalter für pg_cron,
pg_net und den Vault — jeder Platzhalter im Kopf der Datei als solcher
gekennzeichnet), und spielt `supabase/migrations/*.sql` der Reihe nach ein.
Damit ist jede Migration vor dem Anwenden prüfbar, ohne das echte Projekt
anzufassen. Das galt bis hierher nicht.

### 2.2 Edge Functions: Quelltext nicht übertragbar — **erledigt am 28.09.2026**

Der Betreiber hat die Funktionen mit dem Supabase-CLI geholt: **143 statt der
130 aus dem Inventar vom 14.09.** — keine fehlte, dreizehn sind dazugekommen.
139 sind neutralisiert übernommen, vier entfallen nach Phase 1.4.
Siehe `docs/EDGE_FUNCTIONS.md`. Der nachstehende Weg ist damit gegangen; er
bleibt hier stehen, weil er bei jedem weiteren Abgleich wieder gebraucht wird.

### 2.2 Edge Functions: Quelltext nicht übertragbar — `SPÄTER`

130 Funktionen mit geschätzt mehreren Megabyte Quelltext lassen sich über diesen
Kanal nicht holen: Jeder Abruf läuft durch den Arbeitsspeicher des Modells und
sprengt dessen Grenze um Größenordnungen. Der Weg über das CLI ist der einzige
gangbare.

**Was Sie dafür brauchen:** einen Rechner mit Netzzugang, das Supabase-CLI und
`SUPABASE_ACCESS_TOKEN`.

```bash
supabase login
for f in $(supabase functions list --project-ref yazwkzzjiquprtjpurur \
             --output json | jq -r '.[].slug'); do
  supabase functions download "$f" --project-ref yazwkzzjiquprtjpurur
done
```

Die Dateien landen in `supabase/functions/<name>/`. Sobald sie im Repository
liegen, läuft die Neutralisierung und die Umstellung auf `firma_id` aus dem JWT
(Phase 2.4) mechanisch weiter.

Die vollständige Liste der 130 Funktionen mit `verify_jwt` und Version steht in
`docs/EDGE_FUNCTIONS.md`.

### 2.3 `.env.local` enthält die Werte aus Abschnitt 2 nicht

Vorhanden sind nur drei Variablen des Altbestands
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_APP_URL`).

Es fehlen: `SUPABASE_ACCESS_TOKEN`, die DB-Passwörter beider Projekte,
`NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`,
`RESEND_API_KEY`, `CARTO_KEY`, `AZURE_*`, `GOOGLE_*`, `STRIPE_*`.

Folge nach Abschnitt 2: Die betroffenen Funktionen entstehen mit Status
`SPÄTER` hinter einem Feature-Flag. Kein Stopp.

---

## 3. Zielprojekt weicht vom Auftrag ab — **eine Entscheidung nötig**

Der Auftrag (Phase 0.4) geht davon aus, im Projekt `usguiggfciavwzkdfjgt`
lägen „bereits vorhandene Tabellen `profiles` und `firma_stammdaten`", die mit
dem E&P-Schema zusammenzuführen seien.

**Tatsächlich** liegen dort **rund 110 Tabellen eines anderen Datenmodells** —
das Ergebnis der vorangegangenen Next.js-Entwicklung. Weder `profiles` noch
`firma_stammdaten` existieren; an ihrer Stelle stehen `benutzer` und
`mandant_branding`. Mandantenschlüssel ist `mandant_id`, nicht `firma_id`.

Über zwei Dutzend Tabellennamen **kollidieren** mit dem E&P-Schema bei
vollständig anderen Spalten, unter anderem:

`kontakte` · `kontakt_objekt` · `termine` · `aufgaben` · `aktivitaeten` ·
`vertraege` · `objektaufnahmen` · `briefe` · `rechnungen` · `mietanfragen` ·
`mietvertraege` · `projekte` · `projekt_einheiten` · `projekt_ordner` ·
`projekt_dateien` · `projekt_updates` · `projekt_kontakte` ·
`projekt_anfragen` · `projekt_merkliste` · `verbrauchsausweis_antraege` ·
`arbeitszeit_modelle` · `arbeitszeit_stempel` · `arbeitszeit_tage` ·
`urlaub_hinweise` · `firma_kennzahlen` · `finanzierungs_annahmen` ·
`notar_laufzettel`

Das E&P-Schema lässt sich daneben nicht einspielen. In den Tabellen liegen
Testdaten (2 Mandanten, 2 Benutzer, 4 Objekte, 4 Kontakte, 7 Bilder,
1 Web-Exposé, 1 Vertrag, 2 Wertermittlungen).

### Der Altbestand hat im Repository keine vollständige Quelle

Nachträglich gefunden, und der Grund, warum „löschen" die schlechteste der drei
Möglichkeiten ist:

Im Projekt sind **45 Migrationen angewendet**, im Repository liegen **21
Dateien**. Die fehlenden **33** — darunter der gesamte Block vom 03. und
04.09.2026: `onboarding_team_audit`, `integrationen`,
`jobs_und_importdateien`, `sync_einplaner`, `abo_und_stripe`, `postfaecher`,
`haertung`, `schnittstelle`, `verkauf`, `vermietung`, `akquise`,
`aufgaben_checklisten`, `rechnungen_briefe`, `kalender`, `werkzeuge`,
`portal_projekte`, `verwaltung`, `kacheln`, `kalender_nachfass` — existieren in
**keinem Zweig** dieses Repositorys. Ihr SQL liegt nur noch in der Datenbank,
in `supabase_migrations.schema_migrations.statements`.

Gegenprobe mit der lokalen Instanz: die 21 Dateien des Repositorys erzeugen
**29 Tabellen, 15 Funktionen, 27 Aufzählungstypen**. Im Projekt stehen **110
Tabellen, 93 Funktionen, 34 Typen**. Rund 81 Tabellen — Akquise, Projekte,
Rechnungen, Briefe, Arbeitszeit, Bewerbungen, Postfächer, Portal, Notar — sind
aus dem Repository heraus **nicht wiederherstellbar**.

Das Verschieben verliert davon nichts. Ein `drop` wäre endgültig, auch für den
Quelltext. Wenn Ihnen der Altbestand etwas wert ist, lässt sich sein SQL vorher
aus `statements` sichern (rund 90 kB, etwa eine Arbeitseinheit) — sagen Sie
Bescheid, dann liegt er als `altbestand/migrationen/` im Repository, bevor
irgendetwas verschoben wird.

**Vorgeschlagener Weg, weil er nichts verliert und umkehrbar ist:** Der
Altbestand wandert per `alter table … set schema altbestand` in ein eigenes
Schema. Keine Zeile geht verloren, der Namensraum `public` ist frei, und ein
`set schema public` holt alles zurück. Die Migration liegt fertig unter
`supabase/migrations/20260914210000_altbestand_verschieben.sql` und ist **nicht
angewendet**.

Sie ist aber **geprüft**: gegen eine lokale Postgres-16-Instanz laufen die 21
Migrationen des Repositorys und danach die Verschiebung durch — `public` ist
anschließend leer, 29 Tabellen, 56 Richtlinien und 40 Trigger stehen unversehrt
in `altbestand`. Die Migration bricht selbst ab, wenn in `public` etwas liegen
bleibt, statt eine halb geräumte Datenbank zu hinterlassen.

Nicht von mir entschieden, weil es Ihre Daten sind und die auf Netlify laufende
Anwendung damit sofort aufhört zu arbeiten. Zwei Alternativen: ein frisches
Supabase-Projekt, oder ausdrückliche Freigabe zum Löschen.

---

## 4. Erledigt

- [x] Quelle aufgenommen, Prüfsummen festgehalten
- [x] Referenzdateien unter `reference/` eingerichtet (nicht versioniert)
- [x] `docs/NEUTRALITAET.md` geschrieben (Blockliste, Herkunft der Firmenangaben)
- [x] Backend der Referenz vollständig vermessen
- [x] `docs/EDGE_FUNCTIONS.md` — alle 130 Funktionen mit `verify_jwt`
- [x] `docs/SECRETS.md` — Inventar der Secret-Namen
- [x] Kollision mit dem Altbestand erkannt und Migration vorbereitet
- [x] Migration gegen eine lokale Instanz geprüft
- [x] **Am 27.09.2026 angewendet.** Nachweis in `docs/ALTBESTAND.md`, Abschnitt 4:
      110 Tabellen, 1 Sequenz, 93 Funktionen, 34 Typen und 120 Zeilen in 22
      Tabellen sind vollständig in `altbestand` angekommen, `public` war danach
      leer. Die Netlify-Anwendung arbeitet seitdem nicht mehr — vorhergesagt
      und gewollt.
- [x] `scripts/lokale-db.sh` und `tests/supabase-nachbau.sql` — Migrationen sind
      ab jetzt vor dem Anwenden prüfbar
- [x] `CLAUDE.md` auf die neue Rangfolge umgestellt; die Stellen, die dem
      Auftrag widersprachen (Gate A/B, Modul-Streichungen, OpenImmo-Vorrang,
      eigenständiges Layout), sind korrigiert statt stehen gelassen
- [x] Wortlaut aller 166 Migrationen der Vorlage als Exportweg gesichert
      (Abschnitt 2.1) — und dann als untauglich erkannt, siehe Abschnitt 7
- [x] **Schema der Vorlage vollständig übernommen**, jede Sektion über eine
      Prüfsumme gegen das Quellprojekt abgeglichen (Abschnitt 7)
- [x] Neutralisierung als nachlesbares Skript: `scripts/neutralisieren.py`
- [x] `npm run neutral` und `npm run check` eingerichtet, beide grün
- [x] `tests/vorlage-vollstaendig.sql` — 15 Kennzahlen, alle gleich wie im
      Quellprojekt
- [x] **Am 28.09.2026 auf `usguiggfciavwzkdfjgt` angewendet.** Alle 19
      Fork-Migrationen, in 31 Abschnitten abgeschrieben und jeder einzeln
      gegengeprüft: Supabase legt den angewendeten Text in
      `supabase_migrations.schema_migrations.statements` ab, dessen Prüfsumme
      mit der des Abschnitts auf der Platte verglichen wurde. 31 von 31 beim
      ersten Versuch gleich. Danach alle 15 Kennzahlen im laufenden Projekt
      gemessen: 187 Tabellen, 5 Sichten, 6 Sequenzen, 104 Funktionen, 64
      Trigger, 344 Richtlinien, 232 Primär-/Eindeutigkeitsschlüssel, 98
      Prüfbedingungen, 302 Fremdschlüssel, 266 Indizes, 187 Tabellen mit RLS,
      22 Buckets, 59 Storage-Richtlinien, 42 Cron-Jobs, 2791 Spalten — alle
      gleich wie im Quellprojekt.

- [x] **Edge Functions übernommen am 28.09.2026.** 143 geliefert, 139
      neutralisiert übernommen, 4 nach Phase 1.4 gestrichen. Die
      Neutralisierung ist ein Skript
      (`scripts/neutralisieren-funktionen.py`), ihr Ergebnis wird von
      `tests/funktionen-unveraendert.py` geprüft: jede geänderte Zeile muss
      vorher ein Kennzeichen enthalten haben. Beides Teil von `npm run check`.

- [x] **Phase 1 weitgehend abgeschlossen (28.09.2026).** Oberfläche zerlegt,
      ausformatiert, neutralisiert, Shop-TV entfernt, alle vierzehn
      CDN-Bibliotheken gepinnt. `npm run check` deckt jetzt vier der fünf vom
      Auftrag geforderten Teile ab: Build, Syntaxprüfung, Rauchtest,
      Neutralitäts-Gate. Der Mandantentest kommt mit Phase 2.

## 5. Als Nächstes

1. **Phase 1 hängt am Quelltext der Oberfläche.** Zerlegt, neutralisiert und
   wieder zusammengebaut ist sie — aber 58 % des Anwendungscodes liegen
   vorkompiliert vor, und dort lässt sich die Streichung aus Phase 1.4 nicht
   ausführen. Es wird der Stand vor dem Vorkompilieren gebraucht.
   `docs/OFFEN.md`, Abschnitt „Der Quelltext der Oberfläche".
2. Phase 2.4: die Edge Functions mandantenfähig machen — `firma_stammdaten`
   statt fester Vorgabewerte. Die drei offenen Punkte stehen in
   `docs/OFFEN.md`.
3. Die Funktionen ausrollen. Bis dahin feuern die Cron-Jobs gegen Funktionen,
   die im eigenen Projekt noch nicht liegen.

## 6. Sicherheitsbefund im Referenzprojekt — **behoben**

`public.suchkriterien_lauf` hatte **kein Row-Level-Security**: mit dem
öffentlichen anon-Key war die Tabelle für jeden lesbar **und schreibbar**.

**Erledigt.** Sie haben RLS in der Vorlage eingeschaltet und die Richtlinie
`suchkriterien_lauf_team` angelegt (Lesen und Schreiben nur für `chef` und
`mitarbeiter`). Nachgeprüft am 27.09.: `relrowsecurity = true`, Richtlinie
vorhanden. Der nächtliche Lauf funktioniert weiter, weil
`suchkriterien_abgleich_lauf()` `security definer` ist und die Richtlinie
deshalb nicht passieren muss.

Der Fork zieht mit: `20260927100600_abgleich_rls_und_richtlinien.sql` schaltet
RLS ein und legt dieselbe Richtlinie an. Damit haben **alle 187 Tabellen** RLS —
keine Ausnahme mehr.

Ein neuer Befund ist dazugekommen: der Cron-Job `onoffice-expose-abgleich-2h`
ruft seine Edge Function **ohne Authorization-Kopf** auf, die Funktion ist also
ohne JWT-Prüfung erreichbar. Unverändert übernommen, vermerkt in
`docs/OFFEN.md`.

---

## 7. Der Schema-Export — was daraus geworden ist

### Die Migrationsgeschichte war die falsche Quelle

Der erste Plan war, die 166 Migrationen der Vorlage wörtlich zu übernehmen. Das
wäre falsch gewesen: **64 der 167 Tabellen haben in diesen Migrationen kein
`create table`.** Darunter sind die zentralen — `immobilien`, `profiles`,
`firma_stammdaten`, `eigentuemer`, `dokumente`, `termine`, `vertraege`,
`rechnungen`, alle `mail_*` und alle `liquid_*`. Sie sind älter als die
Migrationsverwaltung des Projekts. Ein Nachspielen hätte ein Schema ergeben,
dem ein Drittel fehlt — und das wäre erst beim ersten Start aufgefallen.

Übernommen ist deshalb der **heutige Stand**, gelesen aus dem Systemkatalog.

### Was übernommen ist

| Gegenstand | Anzahl | Datei |
|---|---|---|
| Tabellen (2538 Spalten) | 167 | `20260915000100_vorlage_tabellen.sql` |
| Sequenzen | 5 | dieselbe |
| Primär-/Eindeutigkeitsschlüssel | 211 | `…000200_vorlage_schluessel.sql` |
| Prüfbedingungen | 94 | dieselbe |
| Fremdschlüssel | 273 | dieselbe |
| Indizes | 243 | `…000300_vorlage_indizes.sql` |
| Funktionen | 84 + 1 eigene | `…000400_vorlage_funktionen.sql` |
| Sichten | 4 | `…000500_vorlage_sichten.sql` |
| Trigger | 54 | `…000600_vorlage_trigger.sql` |
| RLS und Rechte | 166 Tabellen | `…000700_vorlage_rls_und_rechte.sql` |
| Richtlinien | 320 | `…000800_vorlage_richtlinien.sql` |
| Buckets / Storage-Richtlinien | 22 / 59 | `…000900_vorlage_storage.sql` |
| Cron-Jobs | 33 | `…001000_vorlage_cron.sql` |

Aufzählungstypen hat die Vorlage keine — alles ist `text` mit Prüfbedingung.

### Woran man erkennt, dass nichts verloren ging

Zwei Prüfungen, keine Behauptung:

1. **Prüfsumme je Sektion.** Das Quellprojekt hat für jede Sektion die
   MD5-Summe über genau den Text gebildet, der geschrieben werden sollte;
   nach dem Schreiben wurde sie lokal nachgerechnet. Keine Datei gilt als
   exportiert, bevor sie stimmt. Drei Abweichungen sind dabei aufgefallen und
   korrigiert — zwei Zeilenumbrüche in einem Standardwert, ein doppelter
   Backslash, eine Escape-Folge in einem `E'…'`-Literal. Keine davon hätte
   man beim Lesen gefunden.
2. **`tests/vorlage-vollstaendig.sql`.** Spielt alle Migrationen auf eine leere
   Instanz und vergleicht 15 Kennzahlen mit dem Quellprojekt. Alle 15 stimmen.

Was das **nicht** zeigt: dass sich alles gleich verhält. Dafür fehlen die
Oberfläche und die Edge Functions. Der Export beweist Vollständigkeit, nicht
Gleichheit.

### Was am Schema geändert wurde — und warum

Vollständig und je Stelle begründet in `scripts/neutralisieren.py`. In Summe:

- **22 Kennzeichen** des Referenzunternehmens aus Standardwerten und drei
  Funktionskörpern entfernt. Wo es keine sinnvolle Vorbelegung gibt —
  Anschrift, Bankverbindung, Steuernummern — entfällt der Standardwert, statt
  eine Fantasieangabe einzusetzen.
- **Projekt-URL und anon-Schlüssel** kommen aus dem Vault statt aus dem Code.
  In der Vorlage steht der Schlüssel 33-mal im Klartext im Cron-Kommando.
- **Drei Funktionen** lesen ihren Wert jetzt aus der Datenbank statt aus dem
  Code — eigene Maildomain, Kleinanzeigen-Anbieternummer, Auswahl des
  Absenders. Gleiche Absicht, nur mandantenfähig.
- **Phase 1.4:** Bucket `shop-tv` samt vier Richtlinien und der Cron-Job
  `jotform-sync-5min` entfallen. Sonst nichts.
- **Drei Schrift-Buckets** mit Leerzeichen im Namen zu `schriften`
  zusammengelegt.

Nicht geändert: kein Tabellen- oder Spaltenname, keine Richtlinie, kein
Trigger, keine Prüfbedingung. Auch nicht das `signatur_*`-Loch — das gehört
in Phase 2.3.

---

## Nachtrag 28.09.2026 — Edge Functions laufen auf dem eigenen Projekt

| Gegenstand | Stand |
|---|---|
| Edge Functions ausgerollt | **139 von 139** (`usguiggfciavwzkdfjgt`) |
| `verify_jwt` | für jede Funktion aus `supabase/config.toml`, 30 bewusst ohne JWT-Prüfung |
| Gegenprobe | `supabase functions list` gegen `config.toml` — Teil des Workflows, bricht bei Abweichung ab |
| Weg | `.github/workflows/funktionen-ausrollen.yml`, nicht Datei für Datei über die Verwaltungsschnittstelle |

**Was davon noch nicht läuft:** die Funktionen antworten, aber die meisten
brauchen Geheimnisse, die im Projekt noch nicht gesetzt sind — 22 Namen,
aufgelistet in `docs/SECRETS.md`. Ohne `ANTHROPIC_API_KEY` antwortet jede der
41 KI-Funktionen mit einem Fehler; ohne `RESEND_API_KEY` beziehungsweise die
`SMTP_*`-Werte geht keine Mail hinaus.

**Was für Gate 1 noch fehlt:** ein Ort, an dem `dist/index.html` liegt, und
der erste echte Anmeldeversuch dagegen. Beides braucht eine Entscheidung des
Betreibers (siehe `docs/OFFEN.md`).

## Nachtrag 29.09.2026 — die öffentlichen Endpunkte sind durch

Am 28.09. hat ein Durchgang durch die 28 Edge Functions, die **ohne
JWT-Prüfung** mit dem `service_role` arbeiten, 19 Stellen aufgeworfen, an
denen die Mandantengrenze beim **Lesen** nicht gezogen war.
`tests/funktionen-oeffentlich.py` hat darüber Buch geführt; die Liste durfte
nur kürzer werden.

**Sie ist leer.** 24 abgesichert, 4 unbedenklich, 0 offen.

Was dabei gefunden wurde, in der Reihenfolge des Gewichts:

| Fund | Wirkung |
|---|---|
| `push-antworten` | Mit der Rolle „chef" ließ sich **jede Mail jedes Maklers** beantworten — über dessen Postfach, mit dessen Absender, zitierter Fremdtext inklusive |
| `expose-freigabe` | Das Exposé trug ein **fremdes Impressum** (Slug „standard"), und ein Download setzte die Newsletter-Zustimmung am Kontakt eines fremden Mandanten |
| `suchkriterien-newsletter` | Ein Klick des einen Chefs verschickte die Newsletter **aller** Makler und legte ihm deren Empfängerlisten vor |
| `upload-benachrichtigung-versenden` | Jede Upload-Meldung ging an die Büroleitung **aller** Mandanten, mit Eigentümername und Dokumenttiteln |
| `eigentuemer-zugang-anfordern` | Der Rückfall „irgendein Chef" traf die ganze Plattform; dessen Name und Telefonnummer standen in der Mail |
| `push-senden` | Anlass und Empfänger wurden nie verglichen — die Mail des einen konnte im Sperrbildschirm des anderen aufleuchten |
| `projekt-wohnungen` | Ein **Kundenprojekt im Quelltext**, und die Wohnungen wurden über Straße und Ort ohne Mandanten gesucht |
| Neubauportal-Postfächer | Einladungen gingen über den SMTP-Zugang eines fremden Mandanten hinaus |
| `ki-bildbearbeitung` | Bilder lagen außerhalb des Mandantenordners — unsichtbar für die Anwendung, nicht mehr löschbar |
| `signatur-token-validieren` | Las das PDF ohne Mandantenpfad; der signierte Link zeigte ins Leere |
| `news-briefing-erstellen`, `portal-ftp-diagnose` | Kein Leck, aber ab dem zweiten Mandanten schlicht kaputt |

Dazu zwei Schema-Migrationen:

- **`fork_28`** — `push_einstellungen`, `kosten_saetze`, `liquid_settings` und
  `akq_einstellungen` hatten **eine Zeile für die ganze Plattform**. Jetzt je
  Mandant eine, plus `mandant_grundeinstellungen(uuid)` für neue Mandanten.
- **`fork_29`** — `projekte.slug` ist wieder plattformweit eindeutig. Er ist
  die öffentliche Adresse des Neubauportals; das ist ein globaler Namensraum
  wie eine Subdomain, kein Mandantenname.

**Was als Nächstes ansteht:** dieselbe Frage für die **90 Funktionen mit**
JWT-Prüfung. `fahrt-ermitteln` war der erste Fund dieser Art: JWT geprüft,
danach `service_role`, und eine `immobilie_id` aus dem Anfragekörper
geglaubt — Entfernung, Fahrzeit und Koordinaten zu jedem Objekt jedes
Maklers. Wie viele weitere es sind, ist nicht gezählt. Steht in
`docs/OFFEN.md`.
