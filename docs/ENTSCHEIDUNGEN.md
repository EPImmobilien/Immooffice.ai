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
