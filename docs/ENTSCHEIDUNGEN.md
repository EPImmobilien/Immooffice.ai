# Entscheidungen

Nach Auftrag Abschnitt 2: Bei Unklarheit wird die Entscheidung getroffen, die
dem heutigen Verhalten der Referenz am nächsten kommt — und hier protokolliert.

---

## 2026-09-14 · Rangfolge der Dokumente

**Frage:** `CLAUDE.md` schreibt fest, dass `docs/MASTERPROMPT.md` bei
Widersprüchen gewinnt. Der neue Auftrag erklärt Masterprompt, FUNKTIONEN und
SCOPE für überholt.

**Entscheidung:** Der Auftrag vom 14.09.2026 gilt. `CLAUDE.md` wurde angepasst;
die überholten Dokumente bleiben als Nachschlagewerk liegen und sind als
überholt gekennzeichnet.

**Grund:** Der Auftraggeber hat die Rangfolge ausdrücklich geändert. Eine Datei
im Repository kann eine spätere Anweisung desselben Auftraggebers nicht
überstimmen.

---

## 2026-09-14 · Altbestand des Zielprojekts

**Frage:** Im Projekt `usguiggfciavwzkdfjgt` liegen rund 110 Tabellen des
vorangegangenen Next.js-Datenmodells. Über zwei Dutzend Namen kollidieren mit
dem E&P-Schema bei anderen Spalten. Der Auftrag erwartet dort lediglich
`profiles` und `firma_stammdaten`.

**Entscheidung:** Migration vorbereitet, die den Altbestand per
`alter table … set schema altbestand` verschiebt — **nicht angewendet**.

**Grund:** Verschieben verliert keine Zeile und ist mit `set schema public`
umkehrbar; das entspricht der Vorgabe „Superset, nichts verlieren" aus Phase
0.4. Nicht angewendet, weil es fremde Daten sind und die auf Netlify laufende
Anwendung damit sofort aufhört zu arbeiten. Das ist keine fachliche Unklarheit,
sondern ein Eingriff, der dem Betreiber gehört.

---

## 2026-09-14 · Schriften-Buckets

**Frage:** Die Referenz hat drei Buckets mit Leerzeichen im Namen:
`Marcellus regular`, `Montserrat bold`, `Montserrat regular`.

**Entscheidung:** Bei der Übernahme zu einem Bucket `schriften` mit Unterpfaden
zusammenführen.

**Grund:** Leerzeichen in Bucket-Namen müssen in jedem Pfad und jeder URL
maskiert werden und sind eine ständige Fehlerquelle. Das Verhalten der Anwendung
ändert sich dadurch nicht — nur der Ablageort einer Schriftdatei. Ein Fall von
„gleiches Verhalten, weniger Fußangel".

---

## 2026-09-14 · Zugangsdaten fremder Dienste

**Frage:** Die Referenz legt sie in `public.external_credentials` ab, Kommentar:
„Passwoerter sind obfuscated, kein Klartext".

**Entscheidung:** Bei der Übernahme auf den Supabase Vault umstellen.

**Grund:** Verschleierung ist keine Verschlüsselung — wer die Tabelle lesen
kann, kann sie umkehren. In einer mandantenfähigen Instanz liegen dort die
Zugangsdaten **fremder** Firmen; Abschnitt 6.1 des Auftrags verlangt dafür
ausdrücklich Vault/pgsodium. Das ist eine Verhaltensänderung, aber eine vom
Auftrag geforderte.

---

## 2026-09-14 · CDN-Versionen

**Frage:** Die Referenz bindet `react@18` und `@supabase/supabase-js@2` über
Major-Alias ein, nicht exakt gepinnt. Abschnitt 2 verlangt exakte Pins.

**Entscheidung:** In Phase 1.2 auf die Versionen festnageln, die der Alias heute
auflöst.

**Grund:** Ein Alias holt bei jedem Aufruf die neueste Nebenversion. Bei einem
Single-File-Portal ohne Testnetz heißt das: Die Anwendung kann über Nacht
brechen, ohne dass jemand etwas geändert hat. Die aufgelösten Versionen lassen
sich erst bestimmen, wenn der Egress-Proxy die CDNs zulässt (siehe
`docs/OFFEN.md`).

## 14.09.2026 — Schema-Export wörtlich statt aus dem Katalog rekonstruiert

**Frage:** Das Schema der Vorlage soll nach Phase 0.1 exportiert werden. Ohne
CLI und ohne Datenbank-Port blieb nur, es aus dem Systemkatalog
zusammenzusetzen — mit allen Ungenauigkeiten, die das mitbringt
(Spaltenreihenfolge, Standardwerte, Kommentare, Reihenfolge der Abhängigkeiten).

**Entscheidung:** Der Wortlaut der 166 angewendeten Migrationen wird aus
`supabase_migrations.schema_migrations.statements` gelesen und wörtlich
übernommen, umnummeriert auf eine neue Zeitstempelfolge, mit der ursprünglichen
Version als Kommentar im Kopf jeder Datei.

**Grund:** Das ist genau das, was im Projekt gelaufen ist — nicht meine
Rekonstruktion davon. Der Auftrag sagt „nichts wird neu erfunden"; eine aus dem
Katalog erzeugte Fassung wäre erfunden, auch wenn sie ähnlich aussieht. Die
Umnummerierung ist unvermeidbar: die Versionen der Vorlage (ab 20260605)
liegen zwischen und unter denen des Altbestands im Repository, und die
Verschiebung des Altbestands muss vor dem neuen Schema laufen.

## 14.09.2026 — Lokale Postgres-Instanz als Prüfstand

**Frage:** Migrationen waren bisher nur am lebenden Projekt prüfbar — also
nicht prüfbar, sondern angewendet. Genau daraus ist in der vorigen Phase ein
stiller Fehlgriff entstanden (eine Funktion im falschen Schema, der Trigger
zeigte weiter auf die alte).

**Entscheidung:** `scripts/lokale-db.sh` legt eine Wegwerf-Instanz an,
`tests/supabase-nachbau.sql` baut die Supabase-Umgebung so weit nach, wie die
Migrationen sie brauchen. Jede Migration läuft zuerst dort.

**Grund:** Ein Postgres-Server ist lokal vorhanden; es gab keinen Grund, ohne
Prüfstand zu arbeiten. Wo der Nachbau nur ein Platzhalter ist — pg_cron,
pg_net, Vault —, steht das im Kopf der Datei, damit kein Test Sicherheit
behauptet, die er nicht prüft.

## 14.09.2026 — CLAUDE.md auf den neuen Auftrag umgestellt

**Frage:** `CLAUDE.md` erklärte den Masterprompt für maßgeblich und schrieb
Gate A/B, Modul-Streichungen, OpenImmo-Vorrang und ein „eigenständiges Layout"
vor. Alle vier widersprechen dem Auftrag vom 14.09.2026.

**Entscheidung:** Die Rangfolge steht jetzt im Kopf der Datei, die vier
widersprechenden Stellen sind ersetzt. Die Abschnitte zu Sicherheit,
Mandantentrennung, Credits, KI und Recht bleiben — sie widersprechen nicht,
sondern präzisieren.

**Grund:** Eine Datei im Repository kann eine spätere Anweisung desselben
Auftraggebers nicht überstimmen. Sie stehen zu lassen hieße, bei jeder
Entscheidung neu zu prüfen, welche der beiden Fassungen gemeint ist.

## 14.09.2026 — Schema-Export doch aus dem Katalog, nicht aus den Migrationen

**Frage:** Die Entscheidung von heute früh war, die 166 Migrationen der Vorlage
wörtlich zu übernehmen. Beim Nachrechnen zeigte sich: **64 der 167 Tabellen
haben in diesen Migrationen kein `create table`** — darunter `immobilien`,
`profiles`, `firma_stammdaten`, `eigentuemer`, `dokumente`, `termine`,
`vertraege`, `rechnungen`, die ganzen `mail_*`- und `liquid_*`-Tabellen. Sie
sind älter als die Migrationsverwaltung des Projekts. Ein Nachspielen der
Migrationen ergibt also **nicht** das heutige Schema.

**Entscheidung:** Der Export beschreibt den **heutigen Stand**, gelesen aus dem
Systemkatalog: Tabellen, Schlüssel, Prüfbedingungen, Fremdschlüssel, Indizes,
Funktionen, Sichten, Trigger, Richtlinien, Buckets, Cron-Jobs. Jede Sektion
wurde über eine Prüfsumme gegen das Quellprojekt abgeglichen, bevor sie
abgelegt wurde.

**Grund:** „Funktionsumfang = Vorlage Stand heute" heißt: der Stand von heute,
nicht der Weg dorthin. Die Migrationsgeschichte bleibt als Nachschlagewerk
verfügbar, ist aber nicht die Quelle.

## 14.09.2026 — Prüfsumme je Sektion statt Vertrauen

**Frage:** Der Export läuft über eine Textschnittstelle. Ein einzelnes falsch
übertragenes Zeichen in 460 kB SQL fällt nicht auf und kann eine Richtlinie
lautlos entschärfen.

**Entscheidung:** Für jede Sektion berechnet das Quellprojekt eine
MD5-Prüfsumme über genau den Text, der geschrieben werden soll; dieselbe
Prüfsumme wird nach dem Schreiben lokal gebildet und verglichen. Keine Datei
gilt als exportiert, bevor sie stimmt.

**Grund:** Es hat sich gelohnt: drei Abweichungen sind so aufgefallen (zwei
Zeilenumbrüche in einem Standardwert, ein doppelter Backslash in einer
Zeichenkette, eine Escape-Folge in einem `E'…'`-Literal). Alle drei hätten
niemand beim Lesen gefunden.

## 14.09.2026 — Projekt-URL und anon-Schlüssel in den Vault

**Frage:** Die Vorlage schreibt die Projekt-URL und den anon-Schlüssel in jeden
`net.http_post` und in jedes Cron-Kommando — 33 Jobs und drei Funktionen mit
demselben Schlüssel im Klartext. Für den Fork müsste dort der eigene Schlüssel
stehen.

**Entscheidung:** Beides kommt aus dem Vault. Eine kleine Funktion
`public.eigene_funktions_url(name)` setzt die URL zusammen, der Schlüssel wird
im Cron-Kommando aus `vault.decrypted_secrets` gelesen.

**Grund:** Ein Schlüssel im Repository ist nach `CLAUDE.md` nicht zulässig, und
ich kenne den anon-Schlüssel des Zielprojekts ohnehin nicht. Es ist außerdem
kein neues Verhalten: die Vorlage liest `diagnose_secret` schon genauso. Was
zu tun bleibt, steht in `docs/OFFEN.md`: zwei Vault-Einträge, sonst laufen die
Jobs ins Leere.

## 14.09.2026 — Drei Funktionen mandantenfähig statt markenfrei geklebt

**Frage:** Drei Funktionen der Vorlage enthalten Kennzeichen, die sich nicht
einfach löschen lassen, weil dann die Funktion ihren Sinn verliert: die eigene
Maildomain im Anfrage-Vorfilter, der Kleinanzeigen-Anzeigenpfad im
Importbericht, die Auswahl des Absenders über den Firmennamen.

**Entscheidung:** Alle drei lesen den Wert jetzt aus der Datenbank —
`firma_stammdaten` beziehungsweise `portal_zugaenge` —, statt ihn im Code zu
tragen.

**Grund:** Das ist dieselbe Absicht, nur ohne Marke und je Mandant richtig.
Die Alternative — Platzhalter einsetzen und die Funktion stillegen — hätte
Verhalten entfernt, und das verbietet Phase 9. Jede der drei Stellen steht mit
Begründung in `scripts/neutralisieren.py`.

## 14.09.2026 — `scripts/marken-scan.sh` entfernt

**Frage:** Der Auftrag verlangt `npm run neutral`. Das alte
`scripts/marken-scan.sh` prüfte dasselbe, aber mit der Streichliste des
Masterprompts.

**Entscheidung:** Ersetzt durch `scripts/neutral.sh`. Das neue Gate prüft die
Kennzeichen, die Stammdaten (IBAN, HRB, Steuernummern), das fremde Projekt, die
fünf Streichungen aus Phase 1.4 und Schlüssel im Klartext.

**Grund:** Zwei Gates mit derselben Aufgabe und verschiedenen Listen führen
dazu, dass man sich auf das falsche verlässt. Zwei Feinheiten sind bewusst
eingebaut: Kommentarzeilen zählen nicht (eine Zeile, die eine Streichung
erklärt, ist kein Aufruf), und der öffentliche anon-Schlüssel des eigenen
Projekts in `netlify.toml` ist ausgenommen — der Browser braucht ihn, er ist
kein Geheimnis, und die Datei begründet das an der Stelle selbst.

## 14.09.2026 — `npm run check` benennt seine Lücken

**Frage:** Der Auftrag definiert `check` als Build + Syntaxprüfung + Rauchtest
+ Neutralitäts-Gate + Mandantentest. Vier davon setzen Code voraus, den es noch
nicht gibt.

**Entscheidung:** `check` führt aus, was prüfbar ist, und schreibt am Ende
ausdrücklich hin, was noch nicht abgedeckt ist und wann es dazukommt.

**Grund:** Ein Gate, das grün leuchtet und dabei verschweigt, dass es vier von
fünf Teilen nicht prüft, ist schlimmer als keins.
