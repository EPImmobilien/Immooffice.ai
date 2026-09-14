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
- [x] Migration gegen eine lokale Instanz geprüft, nicht angewendet
- [x] `scripts/lokale-db.sh` und `tests/supabase-nachbau.sql` — Migrationen sind
      ab jetzt vor dem Anwenden prüfbar
- [x] `CLAUDE.md` auf die neue Rangfolge umgestellt; die Stellen, die dem
      Auftrag widersprachen (Gate A/B, Modul-Streichungen, OpenImmo-Vorrang,
      eigenständiges Layout), sind korrigiert statt stehen gelassen
- [x] Wortlaut aller 166 Migrationen der Vorlage als Exportweg gesichert
      (Abschnitt 2.1)

## 5. Als Nächstes

1. Schema der Vorlage als Migrationen übernehmen — 166 Migrationen wörtlich,
   in neue Zeitstempel umnummeriert, gegen die lokale Instanz geprüft und
   gegen das Inventar der Vorlage abgeglichen (167 Tabellen, 320 Richtlinien,
   84 Funktionen, 54 Trigger, 4 Sichten). Läuft ohne Ihre Mitwirkung.
2. Buckets und Cron-Jobs übernehmen, Bearer auf den anon-Key von immooffice.
   Die drei Schrift-Buckets mit Leerzeichen im Namen werden zu `schriften`
   zusammengelegt.
3. Neutralisierung und `npm run neutral` gegen die Blockliste.
4. **Ihre Entscheidung** zu Abschnitt 3 (Altbestand) — nötig, bevor
   irgendetwas in das Projekt eingespielt wird. Bis dahin entsteht alles als
   Datei, nichts in der Datenbank.
5. Edge Functions: wartet auf Abschnitt 2.2.

## 6. Sicherheitsbefund im Referenzprojekt

`public.suchkriterien_lauf` hat **kein Row-Level-Security**. Mit dem
öffentlichen anon-Key ist die Tabelle für jeden lesbar **und schreibbar**. Das
betrifft Ihr Produktivsystem, nicht den Fork — ich habe dort nichts verändert.

Abhilfe (von Ihnen zu entscheiden, Policies müssen dazu passen):

```sql
alter table public.suchkriterien_lauf enable row level security;
```

Ohne passende Policy sperrt das anschließend **jeden** Zugriff, auch den der
Anwendung. Erst Policy formulieren, dann aktivieren.
