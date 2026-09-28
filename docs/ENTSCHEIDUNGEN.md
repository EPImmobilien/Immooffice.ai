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

## 27.09.2026 — Rückstand als Ergänzung, nicht als Neufassung

**Frage:** Die Vorlage ist in zwölf Tagen um 20 Tabellen, 253 Spalten und 19
Funktionen gewachsen. Den Export vom 14.09. neu ziehen oder den Unterschied
nachtragen?

**Entscheidung:** Nachtragen. Sieben Migrationen `20260927100100` bis
`20260927100700`, jede mit `add column if not exists`, `create` und
`alter table … enable row level security`. Der Export vom 14.09. bleibt, wie er
ist.

**Grund:** Ein neuer Vollexport würde die 22 Marken-Ersetzungen und die drei
Phase-1.4-Streichungen aus `scripts/neutralisieren.py` überschreiben und müsste
von Hand wieder eingearbeitet werden — genau die Stelle, an der ein Kennzeichen
der Referenz zurück ins Repository rutscht. Der Nachtrag ist reine Ergänzung:
in der Vorlage ist zwischen dem 14. und dem 26.09. nichts entfernt und nichts
umbenannt worden, nur hinzugekommen.

## 27.09.2026 — Ein Fingerabdruck über neutralisierten Code taugt nicht zum Vergleich

**Frage:** Der Vergleich meldete neun geänderte Funktionen und 27 geänderte
Cron-Jobs. Alle nachziehen?

**Entscheidung:** Nein. Vor dem Vergleich werden dieselben Ersetzungen, die
`scripts/neutralisieren.py` macht, auf den heutigen Stand der Vorlage angewendet;
verglichen wird erst danach. Übrig bleiben **drei** geänderte Funktionen und
**kein** geänderter Cron-Job.

**Grund:** Projekt-URL, eigene Mail-Domain, Kleinanzeigen-Kennung und
Firmenname sind im Fork absichtlich anders. Ein Hash über diese Stellen meldet
immer einen Unterschied. Wer dem folgt, überschreibt bei jedem Abgleich die
Neutralisierung und trägt die Kennzeichen der Referenz wieder ein. Festgehalten
in `docs/ABGLEICH.md`, Abschnitt 2, damit der nächste Abgleich nicht in dieselbe
Falle läuft.

## 27.09.2026 — `newsletter_anmeldungen` behält zwei gleiche Indexe

**Frage:** Die Vorlage hat auf `newsletter_anmeldungen(kontakt_id)` zwei Indexe
mit identischer Definition: `..._kontakt_id_idx` und `..._kontakt_idx`.

**Entscheidung:** Beide übernehmen.

**Grund:** „Funktionsumfang = Vorlage Stand heute." Einen davon zu streichen
wäre eine Verbesserung — und damit eine Abweichung, die beim nächsten Abgleich
wieder als Unterschied auftaucht und jedes Mal neu begründet werden müsste.
Wenn die Vorlage einen löscht, folgt der Fork.

## 27.09.2026 — Storage-Reste des Altbestands bleiben stehen

**Frage:** Die lokale Instanz hat fünf Buckets und zwanzig
Storage-Richtlinien mehr als die Vorlage: `branding`, `importe`, `marke`,
`objektbilder`, `objektdokumente`. Sie stammen aus der Next.js-Anwendung und
wandern beim Verschieben nicht nach `altbestand`, weil `storage` ein eigenes
Schema ist. (Zuerst waren nur drei Buckets und dreizehn Richtlinien notiert;
`branding` und `importe` kamen beim Vollständigkeitstest dazu.)

**Entscheidung:** Stehen lassen, nicht löschen. `tests/vorlage-vollstaendig.sql`
zählt sie ausdrücklich heraus, damit der Test auf einer Instanz mit Altbestand
dasselbe Ergebnis liefert wie auf einer ohne.

**Grund:** In den Buckets können Dateien der alten Anwendung liegen. Der Auftrag
sagt „es wird verschoben, nicht gelöscht"; für Storage gibt es kein
Verschieben, also bleibt Stehenlassen. Zu entscheiden nach Gate 1, vermerkt in
`docs/OFFEN.md`, Punkt 9.

## 27.09.2026 — Kein Stichtag: laufend nachziehen

**Frage:** Die Vorlage legt rund vier Migrationen pro Tag zu. Fork auf den
26.09. einfrieren und fertigbauen, oder bei jeder Sitzung neu abgleichen?

**Entscheidung des Auftraggebers:** Laufend nachziehen. Kein Stichtag.

**Was das heisst, damit es niemanden ueberrascht:** Jeder Abgleich kostet Arbeit,
die nicht in Mandantenfaehigkeit, Selbstregistrierung oder Abrechnung fliesst.
Der Fork erreicht damit keinen Zustand „fertig gegenueber der Vorlage" — er
erreicht bestenfalls „gleich wie die Vorlage an Tag X". Die Gates 1 bis 3 des
Auftrags bleiben davon unberuehrt: sie bemessen sich am Fork, nicht am Abstand
zur Vorlage.

**Was daraus folgt:** Der Abgleich muss billig bleiben, sonst frisst er die
Phasen. Deshalb bleibt es beim Fingerabdruck-Verfahren (`docs/ABGLEICH.md`,
Abschnitt 2) und nicht beim Vollexport: nur was sich unterscheidet, wird
geholt. Und deshalb ist die Regel aus derselben Sitzung wichtig, dass die
Neutralisierung vor dem Vergleich auf beide Seiten angewendet wird — ohne sie
melden bei jedem Durchlauf 27 Cron-Jobs und sechs Funktionen einen Unterschied,
den es nicht gibt.

## 27.09.2026 — Schema ueber die Verwaltungsschnittstelle statt ueber die CLI

**Frage:** Die 507 kB Fork-Schema muessen in das Projekt. Ueber `supabase db
push` von einem Rechner mit dem Repository, oder ueber die
Verwaltungsschnittstelle?

**Entscheidung des Auftraggebers:** Ueber die Verwaltungsschnittstelle, von mir.

**Grund und Risiko, ausgesprochen:** Der Weg ueber die CLI uebertraegt Dateien
als Dateien; ueber die Verwaltungsschnittstelle muss ich den Inhalt wortgetreu
abschreiben. Beim Sichern der alten Migrationen ist mir das bei 17 kB an einem
verlorenen Leerzeichen gescheitert. Deshalb wird jeder Abschnitt nach dem
Anwenden gegengeprueft: Supabase legt den angewendeten Text in
`supabase_migrations.schema_migrations.statements` ab, und dessen Pruefsumme
muss mit der Pruefsumme des Abschnitts auf der Platte uebereinstimmen. Zusaetzlich
wird am Ende jedes Objekt gegen das Quellprojekt verglichen, wie beim Abgleich.

## 28.09.2026 — Inaktive Cron-Jobs über `cron.alter_job` statt `update cron.job`

**Frage:** Der Schema-Export schaltet die beiden inaktiven Jobs
`news-briefing-taeglich` und `onoffice-waechter-60min` mit
`update cron.job set active = false` ab. Auf dem eigenen Projekt scheitert das:
`permission denied for table job`. Die Migrationsrolle darf `cron.job` lesen,
aber nicht schreiben — lokal fällt das nicht auf, weil die Testinstanz die
Tabelle ohne diese Einschränkung anlegt.

**Entscheidung:** In `scripts/neutralisieren.py` wird das `update` beim
Erzeugen der Migration durch
`select cron.alter_job((select jobid from cron.job where jobname = '…'), active := false)`
ersetzt. `20260915001000_vorlage_cron.sql` ist entsprechend neu erzeugt.

**Grund:** Gleiches Ergebnis — 33 Jobs, davon zwei inaktiv, nachgemessen —,
aber über die dafür vorgesehene Funktion von pg_cron statt über einen direkten
Schreibzugriff auf die Systemtabelle. Die Änderung gehört ins Skript und nicht
in die erzeugte Datei, sonst verwirft sie der nächste Lauf. Kein
Verhaltensunterschied zur Vorlage: dort sind dieselben zwei Jobs inaktiv.


## 28.09.2026 — Platzhalter statt erfundener Domain in den Edge Functions

**Frage:** Die Funktionen der Vorlage verdrahten an rund vierzig Stellen die
Domain des Referenzunternehmens — als Absenderadresse, als Rückfall hinter
`PORTAL_URL`, in Empfängerlisten. Wodurch ersetzen?

**Entscheidung:** Durch `immooffice.example`. Die Endung `.example` ist nach
RFC 2606 reserviert und kann niemandem gehören.

**Grund:** Eine plausibel klingende Domain wäre gefährlich. Sie kann heute
frei sein und morgen jemandem gehören — und dann gehen Exposé-Links und
Kundenmails an einen Fremden. Ein Platzhalter, der sichtbar keiner ist, kostet
einen Konfigurationsschritt und schließt diesen Fehler aus. Vermerkt in
`docs/OFFEN.md`, Punkt 2.

## 28.09.2026 — Die Standorttabelle in vertrag-pdf wird leer, nicht erfunden

**Frage:** `vertrag-pdf` trägt die drei Standorte der Referenz als Tabelle im
Quelltext, mit den Ortsnamen als Schlüssel. Ersetzen durch Musterdaten oder
leeren?

**Entscheidung:** Ein einziger leerer Eintrag `standard`. Kein Musterfirmenname,
keine erfundene Anschrift.

**Grund:** Ein Maklervertrag mit einer Musteranschrift im Kopf sieht
gebrauchsfertig aus und ist es nicht — das ist die gefährlichere Variante.
Leer fällt beim ersten Blick auf das PDF auf. Die richtige Quelle ist
`firma_stammdaten` mit `typ = 'standort'`; die Tabelle dafür steht schon im
Schema. Das Verdrahten ist Phase 2.4 und steht in `docs/OFFEN.md`, Punkt 3.

## 28.09.2026 — Eine Prüfung gegen zu breite Ersetzungsregeln

**Frage:** Die Neutralisierung der Funktionen sind rund dreißig
Ersetzungsregeln über 2,7 MB Quelltext. Wie merkt man, dass eine Regel mehr
trifft als gedacht?

**Anlass:** Beim ersten Versuch stand `STANDORTE["rostock"]` als Muster da.
Muster sind reguläre Ausdrücke, und `[...]` ist dort eine Zeichenklasse — die
Regel hat quer durch alle 149 Dateien einzelne Buchstaben ersetzt. Aufgefallen
ist es erst beim Hineinschauen in eine erzeugte Datei.

**Entscheidung:** Drei Sicherungen.
1. `NACHBESSERN` wird wörtlich ausgewertet, nicht als Ausdruck — dort stehen
   Code-Schnipsel mit Klammern und Punkten.
2. Das Skript bricht ab, wenn eine Regel in einer Datei öfter als 60-mal
   greift oder wenn eine Datei Zeilen gewinnt.
3. `tests/funktionen-unveraendert.py` prüft jede geänderte Zeile darauf, ob
   sie vorher ein Kennzeichen enthielt. Teil von `npm run check`.

**Grund:** Der Fehler war nicht klug, aber er war billig — die Vorlage liegt
unverändert in `reference/`, das Skript erzeugt neu. Teuer wäre er geworden,
wenn er unbemerkt in einen Commit gelaufen wäre. Eine Prüfung, die genau diese
Klasse von Fehlern erkennt, ist billiger als Sorgfalt beim Schreiben.


## 28.09.2026 — Der Altbestand im Repository zieht um, er wird nicht gelöscht

**Frage:** Die Oberfläche des Forks gehört nach `src/`. Dort liegt die
Next.js-Anwendung des Altbestands.

**Entscheidung:** `git mv src altbestand/next-app`. Nichts gelöscht.

**Grund:** Dieselbe Überlegung wie bei der Datenbank am 27.09.: verschieben ist
umkehrbar, löschen nicht. Der Altbestand ist laut `CLAUDE.md` kein
Produktbestandteil, aber er ist der einzige Ort, an dem Teile seiner
Geschichte noch stehen — im Repository fehlen 33 seiner 45 Migrationen.

## 28.09.2026 — src/ ist vorerst nicht versioniert

**Frage:** `src/` entsteht aus `reference/epworld-src.html` und ist
neutralisiert — bis auf Shop-TV, das zu 19 Stellen im vorkompilierten Kern
liegt und dort nicht sauber zu entfernen ist. Trotzdem einchecken, mit einer
Ausnahme im Neutralitäts-Gate?

**Entscheidung:** Nein. `src/` bleibt in `.gitignore`, bis der Quelltext der
vorkompilierten Abschnitte vorliegt.

**Grund:** Eine Ausnahme im Gate ist teurer als sie aussieht. Sie steht dann
dort, sie wird mit der Zeit selbstverständlich, und niemand prüft mehr, ob sie
noch nötig ist. `src/` ist außerdem vollständig aus der Vorlage reproduzierbar
— es geht nichts verloren, es liegt nur nicht im Repository. Vermerkt in
`docs/OFFEN.md`.

## 28.09.2026 — Zugangsdaten kommen aus der Auslieferung, nicht aus dem Quelltext

**Frage:** Die Vorlage trägt Projekt-Adresse und anon-Schlüssel im Klartext im
Auslieferungsstand — im Hauptskript und im Fehlermelder des Frühstarts.

**Entscheidung:** Beides kommt aus `window.IMMO_SUPABASE_URL` und
`window.IMMO_SUPABASE_KEY`, die ein Konfigurationsblock im Kopf setzt. Die
Platzhalter sind **leer**, nicht mit dem eigenen Projekt vorbelegt.

**Grund:** Der anon-Schlüssel ist zwar öffentlich, aber es war der *fremde* —
und nach der Ersetzung der Projekt-Adresse hätte im Fork eine Adresse des
eigenen Projekts neben einem Schlüssel des fremden gestanden. Das ist nicht
nur falsch, es fällt beim Ausprobieren auch nicht sofort auf. Ein leerer Wert
fällt beim ersten Start auf, ein falscher nicht.


## 28.09.2026 — Die vorkompilierten Abschnitte werden ausformatiert

**Frage:** 2,97 MB des Anwendungscodes liegen in drei Zeilen, die größte mit
2,4 MB. Darin ist nichts zu finden, nichts zu ändern und nichts zu prüfen.
Hinnehmen oder umbrechen?

**Entscheidung:** Umbrechen, mit `js-beautify` als Schritt der Zerlegung.

**Grund:** Es ist eine reine Leerraum-Änderung — kein Zeichen Programmlogik
wird angefasst. Das Skript rechnet es nach: entfernt man aus beiden Fassungen
jeden Leerraum, müssen sie zeichengleich sein; sonst bricht es ab. Der Gewinn
ist groß — aus drei unlesbaren Zeilen werden 136.000 lesbare, und damit wird
aus „nicht machbar" eine gewöhnliche Codeänderung.

**Preis, bewusst in Kauf genommen:** Die Oberfläche ist danach nicht mehr
zeilenweise mit der Vorlage vergleichbar. Für den laufenden Abgleich gilt
dieselbe Regel wie für die Neutralisierung (siehe Eintrag vom 27.09.): erst
die Vorlage genauso behandeln, dann vergleichen. Ein Schritt mehr, kein Risiko.

## 28.09.2026 — Eingebettete Dateien der Referenz werden geleert, nicht ersetzt

**Frage:** Im Quelltext stecken sechs Logos und zwei Word-Vorlagen der Referenz
als Base64 — zusammen rund 1 MB. Für das Neutralitäts-Gate unsichtbar, weil es
Text liest und keine Bilder. Womit ersetzen?

**Entscheidung:** Die Konstanten bleiben stehen und werden leer.

**Grund:** Ein erfundenes Logo wäre eine Behauptung, eine nachgebaute
Vertragsvorlage wäre schlimmer — sie sähe gebrauchsfertig aus und trüge
Rechtstext, den niemand geprüft hat. `docs/NEUTRALITAET.md` Abschnitt 5
verlangt ausdrücklich, Rechtstexte zu ersetzen statt zu übernehmen; bis es
neutrale Muster gibt, ist „erzeugt nichts" der ehrliche Zustand. Beides steht
in `docs/OFFEN.md`, damit es nicht in Vergessenheit gerät.


## 28.09.2026 — Shop-TV entfernt, mit `node --check` als Netz

**Frage:** Phase 1.4 streicht Digital Signage ersatzlos. In der Oberfläche war
das kein Textschnipsel, sondern ein Modul über ein Dutzend Aufrufstellen: eine
eigene Seite, eine Kachelkomponente, ein Marketing-Format mit eigenen
Bildslots, die Kanalzeile der Objektseite, die Yodeck-Schnittstelle und eine
Videoaufnahme, die an den Bürobildschirm überträgt. Die Oberfläche lässt sich
in dieser Umgebung nicht starten — wie prüft man so einen Eingriff?

**Entscheidung:** Mit `node --check`. Es liest 5 MB in 0,17 Sekunden und ist
jetzt fester Abschnitt von `npm run check`.

**Was es gebracht hat:** Es hat **vier** Fehler gefangen, die ich sonst
eingecheckt hätte.
1. Ein Objektschnitt, der Komma davor *und* dahinter entfernte: `}{`.
2. Ein Eigenschaftsschnitt, der nur den Wert nahm: `shoptv: ,`.
3. Ein Rückwärtssprung, der den Geschwister-Aufruf traf statt des gemeinten.
4. Ein Zeilenschnitt, dessen Endmerkmal erst 15.218 Zeilen später zutraf.

Der vierte ist der lehrreiche: Er hätte ein Drittel der Anwendung gelöscht,
ohne dass irgendetwas außer dem Syntaxprüfer es gemerkt hätte. `zeilen_weg`
begrenzt seitdem den Abstand und bricht ab, statt zu raten.

**Grund für das Ganze:** Ohne Prüfung wäre der Eingriff nicht zu verantworten
gewesen. Mit ihr ist er eine gewöhnliche Codeänderung.

**Was bleibt:** Die Spalte `shoptv_veroeffentlichen` und ihr Prüfwert im
Schema — Phase 9 verbietet das Entfernen von Spalten. Die Oberfläche liest und
schreibt sie nicht mehr. Ebenso bleibt das Druckformat „Schaufenster-Aushang":
ein Aushang aus Papier ist kein Digital Signage.

## 28.09.2026 — das Neutralitäts-Gate war undicht, an drei Stellen

**Frage:** Beim Ausrollen der Edge Functions fiel in `parse-objektnachweis`
eine Beispieladresse mit der Postleitzahl des Referenzunternehmens auf. Das
Gate war grün. Warum?

**Befund:** Drei unabhängige Lücken, jede für sich ausreichend.

1. **Der Kommentarfilter war nicht verankert.** `rg` liefert
   `pfad:nummer:inhalt`; der Filter `':[[:space:]]*(--|#|//|\*)'` suchte
   irgendwo in dieser Zeile. Damit galt jede Zeile als Kommentar, die
   `: #` oder `://` enthielt — also jede Zeile mit einer URL und jede mit
   einem Hashtag. Auf diese Weise sind drei Zeilen mit dem Marken-Hashtag
   des Referenzunternehmens durchgerutscht.
2. **`\uXXXX` wurde nicht gelesen.** Die Büroanschrift stand in
   `energieausweis-anfrage` als `Am Vögenteich 26 R, 18055 Rostock`.
   Das Muster `V(oe|ö)genteich` geht daran vorbei.
3. **Rufnummer und Standorte standen in keinem Muster.** Die Durchwahl des
   Referenzunternehmens stand 15-mal im Quelltext, die Sitze 141-mal — als
   Rückfallwert, als Schlüssel einer Standorttabelle, als Beispiel in
   Eingabefeldern und in einem Wörterbuch der Rechtschreibprüfung.

**Entscheidung:** Alle drei behoben. Der Filter ist auf den Zeilenanfang
verankert, die Muster führen die `\uXXXX`-Schreibweise mit, und Rufnummer,
Postleitzahlen und Standorte sind aufgenommen — letztere als eigene Prüfung,
die nur den Produktcode liest, weil `docs/` sie benennen muss.

**Die Muster stehen BASE64-kodiert im Skript.** `docs/NEUTRALITAET.md` sah
dafür eine unversionierte Datei vor. Die gibt es nicht, und auf einem frischen
Klon hätte sie das Gate stumm durchgewunken — die schlechteste aller
Varianten. Kodiert ist beides erfüllt: im Repository steht kein lesbares
Kennzeichen, und das Gate greift überall. `tests/funktionen-unveraendert.py`
macht es seitdem genauso; dort standen die Ortsnamen bis dahin im Klartext.

**Was ersetzt wurde:** Rufnummer → `{telefon}`; Anschrift → entfernt, wie
schon zuvor bei den unmaskierten Vorkommen; Postleitzahlen → `12345`;
Standorte durchgehend → `Musterstadt`, `Beispielstadt`, `Musterdorf`. Die
Standorte sind *ersetzt*, nicht entfernt: sie sind nicht nur Beispieltext,
sondern auch Schlüssel einer Standorttabelle und Wert in Auswahlfeldern. Wer
sie nur dort tilgt, wo sie sichtbar sind, zerlegt die Zuordnung.

**Was das über die Arbeitsweise sagt:** Ein Gate, das nie etwas findet, ist
kein Beweis für Sauberkeit. Dieses hier hat 146 Zeilen übersehen, während es
„sauber" meldete. Gefunden wurden sie nicht vom Gate, sondern beim Lesen einer
einzelnen Datei vor dem Ausrollen.

## 28.09.2026 — Gate 1: die Kopie läuft, und was die Diagnose gekostet hat

**Stand:** Die neutralisierte Kopie läuft auf `usguiggfciavwzkdfjgt`. Der
Browser-Nachweis: Titel `ImmoOffice – Musterhaus Immobilien GmbH`, Anmeldemaske,
null Skriptfehler, null gescheiterte Anfragen; nach der Anmeldung das
Arbeitszimmer mit Zeiterfassung, Terminen und Aufgaben. `auth.sessions` bestätigt
es serverseitig. `npm run check` grün, 139 von 139 Edge Functions ausgerollt.

**Der Weg dahin war zweimal falsch abgebogen, beide Male durch mich.**

**Erster Fehlschluss — die leere Protokolltabelle.** Auf die Meldung „ich kann
mich nicht einloggen" habe ich `auth.audit_log_entries` abgefragt, nichts
gefunden und daraus geschlossen, kein Anmeldeversuch habe Supabase erreicht —
also starte die Seite nicht. Das war falsch: dieses Projekt schreibt dort
überhaupt keine Einträge, auch nicht für erfolgreiche Anmeldungen. Die richtige
Tabelle ist `auth.sessions`, und dort standen die Versuche die ganze Zeit.

Daraus folgt eine Regel für das weitere Vorgehen: **eine leere Tabelle ist kein
Beweis.** Bevor ihr Schweigen etwas heißen soll, muss feststehen, dass sie im
Erfolgsfall etwas enthielte.

**Zweiter Fehlschluss — der eigene Test.** Der Diagnoselauf meldete zwei nicht
erreichbare CDN-Adressen. Beide waren Fehlalarme: `fonts.googleapis.com` und
`fonts.gstatic.com` stehen als `<link rel="preconnect">` ohne Pfad da und
antworten deshalb mit 404. Ich hatte sie als ladbare Adressen eingesammelt.
Ebenso `/_redirects`: Netlify wertet die Datei aus und liefert sie nicht aus —
der 404 ist der Beweis, dass sie angekommen ist. Beides ist im Test korrigiert.

**Die eigentliche Ursache** war keine von beiden. Der Betreiber hatte sich
registriert; das Konto entstand, das Profil nicht. Die Anmeldung ging durch, die
Anwendung blieb leer. Siehe `docs/OFFEN.md` — es ist eine Aufgabe für Phase 3.

**Was daraus in die Werkzeuge eingegangen ist:** `oberflaeche-pruefen.yml` prüft
jetzt, was `npm run check` nicht kann — echte Adressen, echter Browser, echte
Anmeldung. Jeder Schritt schreibt seinen Befund in eine Datei, ein letzter gibt
alle aus; sonst verschwindet das Ergebnis hinter den Fortschrittsbalken des
Browser-Downloads.

## 28.09.2026 — Phase 2, Auftakt: sieben Türen bleiben zu

**Frage:** Der Auftrag vom 28.09. verlangt als ersten Schritt, „die 64
Tabellen ohne Richtlinie bekommen Richtlinien".

**Erste Feststellung: die Zahlen des Auftrags sind überholt.** Nachgemessen am
selben Tag:

| | Auftrag | tatsächlich |
|---|---|---|
| Tabellen in `public` | 167 | **187** |
| Richtlinien | 215 | **344** |
| ohne Richtlinie | 64 | **8** |
| Funktionen | 85 | **104** |
| mit `firma_id` | 2 | 2 ✓ |
| `altbestand` | 110 | 110 ✓ |

Sie stammen aus einem Stand vor dem Abschluss der Schema-Übernahme.

**Zweite Feststellung: sieben der acht sollen gesperrt bleiben.** RLS an und
keine Richtlinie heißt: für normale Nutzer vollständig zu, für `service_role`
offen. Geprüft wurde, wer jede Tabelle tatsächlich anspricht — die Oberfläche,
eine Edge Function oder niemand:

| Tabelle | Wer greift zu | Ergebnis |
|---|---|---|
| `amt_vorlage` | Oberfläche | Richtlinie: Team liest, Chef pflegt |
| `eigentuemer_benachrichtigung_queue` | nur Edge Function | bleibt zu |
| `immobilie_datei_geloescht` | nur Edge Function | bleibt zu |
| `onoffice_expose_pruefung` | nur Edge Function | bleibt zu |
| `waechter_status` | nur Edge Function | bleibt zu |
| `ea_accounts`, `ea_events`, `ea_orders` | niemand | bleibt zu |

**Entscheidung:** Nur `amt_vorlage` bekommt Richtlinien. Die sieben übrigen
behalten den gesperrten Zustand und bekommen stattdessen einen
Tabellen-Kommentar, der festhält, dass das Absicht ist. Der Kommentar steht in
der Datenbank, nicht nur hier — damit ihn auch findet, wer das Schema liest
und nicht das Repository.

**Grund:** Eine Richtlinie öffnet eine Tür. Sieben Türen zu öffnen, an die
niemand klopft, vergrößert die Angriffsfläche und gewinnt nichts. Die Absicht
des Auftrags — kein Datenzugriff bleibt unbedacht — ist damit erfüllt; sein
Wortlaut nicht. Siehe `docs/AUTONOMIE.md`, Abschnitt „Aufträge sind nicht
unfehlbar".

**Nebenbefund, mitbehoben:** `aktuelle_rolle()` ist `SECURITY DEFINER` und
lief als einzige der drei Rollen-Helfer **ohne** festen `search_path`. Wer in
einem früher durchsuchten Schema eine eigene Tabelle `profiles` anlegen kann,
entscheidet sonst mit, was die Funktion zurückgibt — und damit, was jede
Richtlinie erlaubt, die sie aufruft. `ist_chef()` und `ist_team()` machen es
seit jeher richtig. Jetzt alle drei.

**Was offen bleibt:** Die Richtlinien trennen bisher nach Rolle, nicht nach
Mandant. Das ist der nächste Schritt.

## 28.09.2026 — `konto_id` ist die Mandantengrenze, nicht `firma_id`

**Frage:** Der Auftrag verlangt drei Ebenen — Konto, Gesellschaften, Standorte
— und schlägt vor, dafür die vorhandene `firma_id` als Konto zu verwenden,
„damit nicht 167 Tabellen umbenannt werden müssen". Geht das?

**Nein, und der Grund spart zugleich die befürchtete Umbenennung.**

`firma_id` gibt es bisher in genau **zwei** Tabellen: `profiles` und
`rechnung_nummern_sequence`. Beide zeigen per Fremdschlüssel auf
`firma_stammdaten`. Dort bedeutet sie heute schon „Standort beziehungsweise
Rechtsträger": `firma_stammdaten.typ` hat den Standardwert `'standort'`, und
die Vorlage führte darin ihre drei Büros mit je eigenen Firmendaten,
Registerangaben und Nummernkreisen.

Genau das will der Auftrag selbst: „Jede Gesellschaft hat einen eigenen
Rechnungs-Nummernkreis." Würde `firma_id` zum Konto umgedeutet, hinge
`rechnung_nummern_sequence` am Konto statt an der Gesellschaft — das Gegenteil
der Anforderung, und zwar stillschweigend, weil die Spalte gleich heißt.

Die befürchtete Umbenennung fällt ohnehin nicht an: **185 der 187 Tabellen
haben überhaupt keine Mandantenspalte.** Sie brauchen so oder so eine neue.
Wie sie heißt, kostet nichts.

**Entscheidung:**

| Ebene | Träger | Spalte |
|---|---|---|
| Konto (Mandant) | neue Tabelle `konten` | `konto_id` — **hier trennt die RLS** |
| Gesellschaft | neue Tabelle `gesellschaften` | `gesellschaft_id` |
| Standort | `firma_stammdaten` (ist es schon) | `firma_id` — unverändert |

Die Helferfunktion heißt `aktuelle_konto_id()`, nicht `current_firma_id()`:
das Schema ist durchgehend deutsch benannt (`aktuelle_rolle`, `ist_chef`,
`ist_team`), und gemischte Sprachen bei sicherheitskritischen Namen laden zu
Verwechslungen ein. Gleiche Bauart wie die Geschwister — `stable`,
`security definer`, fester `search_path`.

**Zwei weitere Annahmen des Auftrags, die nicht zutreffen:**

1. „`firma_stammdaten` mit `ci_primaer`, `ci_akzent` und `ci_font`" — diese
   Spalten gibt es dort nicht. `firma_stammdaten` hat von Branding nur
   `logo_pfad`. Die Farb- und Schriftspalten liegen in
   `altbestand.mandant_branding` und heißen `farbe_primaer`, `farbe_akzent`,
   `schriftart`, `schrift_serifen`, `schrift_serifenlos`, `logo_pfad`,
   `logo_invers_pfad`. Beim Aufbau des Brandings (Abschnitt 2) wird darauf
   aufgesetzt, nicht auf erfundene `ci_*`-Namen.
2. Die Ausgangszahlen (167 Tabellen, 215 Richtlinien, 64 ohne Richtlinie)
   stammen aus einem Stand vor Abschluss der Schema-Übernahme. Tatsächlich:
   187, 344, 8.

**Was offen bleibt:** `fork_02` legt nur die Struktur an. Keine Daten
verschoben, keine Spalte `NOT NULL`. Das erste Konto, der Backfill und die
Pflichtfelder folgen in `fork_03`; erst danach lassen sich die 185 übrigen
Tabellen sinnvoll mit `konto_id` versehen.

## 28.09.2026 — Feiertage: alle sechzehn Länder statt eines

**Frage:** Die Urlaubsverwaltung rechnet Arbeitstage „ohne die Feiertage in
Mecklenburg-Vorpommern" — fest im Quelltext, an zwei Stellen: `feiertageMV()`
in der Oberfläche und noch einmal in der Edge Function `urlaub-hinweise`.

**Warum das mehr ist als ein Schönheitsfehler:** Ein Mandant in Bayern bekäme
drei Feiertage zu wenig (Heilige Drei Könige, Fronleichnam, Allerheiligen) und
einen zu viel (Frauentag). Das Ergebnis ist eine Urlaubsbilanz, die falsch ist
und **plausibel aussieht** — niemand zählt Feiertage nach.

**Entscheidung:** `feiertage(jahr, land)` für alle sechzehn Länder, dieselbe
Rechnung in Oberfläche und Edge Function. Das Land kommt vom **Standort**
(`firma_stammdaten.bundesland`), nicht vom Konto: ein Mandant mit Büros in
Rostock und München hat zwei Feiertagskalender.

Ohne hinterlegtes Land bleiben die neun bundesweiten Feiertage stehen — lieber
zu wenige als falsche —, und der Hinweistext sagt das ausdrücklich. Ein
erfundener Vorgabewert wäre hier besonders heikel.

**Nicht enthalten, weil nicht landesweit gesetzlich:** Fronleichnam in Sachsen
und Thüringen, Mariä Himmelfahrt in Bayern (je nur in bestimmten Gemeinden),
Augsburger Friedensfest (nur Stadtgebiet). Ostersonntag und Pfingstsonntag
sind nur in Brandenburg gesetzlich; sie fallen ohnehin auf einen Sonntag und
ändern an Arbeitstagen nichts, stehen aber der Vollständigkeit halber drin.

Nachgerechnet für 2026: MV 11 Tage, BY 12, BE 10, SN 11 (Buß- und Bettag
18.11.), ohne Land 9. Fronleichnam BY am 04.06.2026.

**Zwei Nebenbefunde:**

1. **Der Slug `ep-immobilien` lag neunmal im Quelltext** und ist dem Gate
   entgangen: sein Muster verlangte ein kaufmännisches Und (`e&p immobilien`)
   oder gar kein Trennzeichen (`epimmobilien`). Der Bindestrich fiel durch.
   Das Muster hat jetzt `[-_ ]?` an jeder Fuge.
2. **Eine Regel griff in siebzehn Dateien statt in einer.** Der erste Versuch,
   das Bundesland zu laden, hängte die Zeile hinter die `antwort`-Hilfsfunktion
   — die steht wortgleich in siebzehn Edge Functions, und sechzehn davon kennen
   die Variable nicht. Die Häufigkeitsbremse greift dort nicht, weil es je
   Datei nur ein Treffer ist. Der Anker heißt jetzt `jahresende`, ein Wort, das
   in genau dieser einen Funktion vorkommt.

**Neu als Werkzeug:** die Kategorie `FORK` neben `MARKE`, `PHASE14` und
`FREMD`. Sie kennzeichnet Änderungen, die den Fork **erweitern** statt ihn zu
neutralisieren. Die Zeilenbremse der Neutralisierung („fügt keine Zeilen
hinzu") gilt für sie nicht — für alle anderen unverändert.

**Was offen bleibt:** `window.IMMO_BUNDESLAND` wird in der Oberfläche noch
nicht gesetzt; bis dahin rechnet sie mit den neun bundesweiten Feiertagen.
Die Zuordnung Mitarbeiter → Standort kommt mit Abschnitt 1b, und dann gehört
das Land an den Mitarbeiter, nicht an den ersten gefundenen Standort.

## 28.09.2026 — Mandantentrennung: eine restriktive Richtlinie statt 351 Umschreibungen

**Frage:** Die Vorlage hat 351 Richtlinien. Sie prüfen die *Rolle* —
`ist_team()`, `ist_chef()`, „gehört mir" — und sind darin richtig. Was ihnen
fehlt, ist der Mandant. Wie kommt er hinein?

**Der naheliegende Weg wäre der falsche.** Alle 351 umzuschreiben und jeder ein
`and mandant_id = aktuelle_mandant_id()` anzuhängen, wäre 351 Gelegenheiten,
sich zu vertun — und es fasste die Rollenlogik der Vorlage an, die nicht
angefasst werden soll.

**Entscheidung:** Je Mandantentabelle **eine** Richtlinie `as restrictive`.
Restriktive Richtlinien werden mit UND verknüpft, nicht mit ODER. Sie ist
damit nicht zu umgehen: keine noch so großzügige permissive Richtlinie kann
sie aufheben.

| | Frage | Verknüpfung |
|---|---|---|
| permissiv (Vorlage, 351) | darf ich das überhaupt? | ODER |
| restriktiv (Fork, 174) | ist es mein Mandant? | UND |

`to public` statt `to authenticated`: die Trennung gilt für jede Rolle, auch
für eine, die später hinzukommt. `service_role` umgeht RLS ohnehin — das ist
der Weg der Edge Functions und bleibt es.

**Nachgewiesen, nicht behauptet.** `tests/mandant.sql` legt zwei Mandanten mit
je einem Nutzer und einem Objekt an, gibt sich als der eine aus und versucht,
an die Daten des anderen zu kommen — lesen, einfügen, ändern, löschen, und
einmal ohne Anmeldung. Sieben Prüfungen, alle bestanden:

```
1 ok  Alpha liest nur eigene Objekte        gesehen: Objekt Alpha
2 ok  Alpha kann nicht fuer Beta einfuegen  abgewiesen: new row violates
                                            row-level security policy
3 ok  Alpha aendert keine Zeile von Beta    0 Zeile(n) getroffen
4 ok  Alpha loescht keine Zeile von Beta    0 Zeile(n) getroffen
5 ok  Alpha sieht nur eigene Profile        gesehen: chef@alpha.example
6 ok  Beta liest nur eigene Objekte         gesehen: Objekt Beta
7 ok  Ohne Anmeldung kein Objekt sichtbar   0 Zeile(n) sichtbar
```

Geprüft wird per SQL, nicht über die Oberfläche: ein ausgeblendetes
Bedienelement ist keine Trennung.

**Der Test hat sich beim ersten Lauf selbst bewährt.** Er meldete fünf von
sieben Prüfungen gescheitert — weil ich `fork_07` auf das Projekt angewendet,
die Migrationsdatei aber noch nicht geschrieben hatte. Die lokale Instanz
kannte die Richtlinien nicht. Genau dafür läuft der Test gegen eine leere
Instanz und nicht gegen das laufende Projekt.

**Was offen bleibt:**

- `NOT NULL` auf `mandant_id`. Der Vorgabewert greift nur bei angemeldetem
  Nutzer; Edge Functions arbeiten mit `service_role`, dort ist `auth.uid()`
  null. Erst wenn die 139 Funktionen durchgesehen sind.
- Storage. Die Trennung deckt bisher die Tabellen ab, nicht die Buckets. Ein
  Pfad wie `objektbilder/{immobilie_id}/…` trägt keinen Mandanten.
- Der Sichtbarkeitsbereich je Mitarbeiter (nur eigene / Standort /
  Gesellschaft / Mandant) aus Abschnitt 1b. Die harte Grenze steht; die feine
  Abstufung darin kommt mit der Rechte-Matrix.

## 2026-09-28 · Sechzehn Storage-Richtlinien des geparkten Stands gelöscht

**Frage:** Auf `storage.objects` lagen 16 Richtlinien aus dem geparkten
Greenfield-Stand. Sie rufen `intern.aktueller_mandant()`,
`intern.darf_schreiben()`, `intern.ist_verwaltung()`,
`intern.bild_im_web_expose()` und `intern.dokument_im_web_expose()` auf. Diese
Funktionen lesen aus `public.benutzer` beziehungsweise `public.web_expose` —
beide sind am 14.09. nach `altbestand` verschoben worden. Seitdem endete
**jeder angemeldete Zugriff auf den Dateispeicher** mit

```
ERROR:  relation "public.benutzer" does not exist
CONTEXT:  SQL function "aktueller_mandant" during startup
```

und zwar im Livebetrieb, nicht nur im Test. Reparieren oder löschen?

**Entscheidung:** gelöscht, in `fork_10`. Das Schema `intern` selbst bleibt
unberührt.

**Grund:** Die 16 Richtlinien betreffen vier Eimer — `importe`, `marke`,
`objektbilder`, `objektdokumente` —, die kein einziger Aufruf der Vorlage
anfasst; geprüft gegen `src/` und alle 139 Edge Functions. Von den 525
Richtlinien im Schema `public` nutzt **keine einzige** `intern.*`; alle 204
Aufrufer sitzen auf `altbestand`-Tabellen. Die Funktionen gehören also
vollständig zum geparkten Stand, und eine Richtlinie des geparkten Stands hat
auf einer Tabelle des Produkts nichts verloren. Reparieren hätte geheißen, das
Rechtemodell des Greenfield-Stands neben dem der Vorlage weiterzupflegen — zwei
Modelle für dieselbe Tabelle. Was schützt, ist ohnehin die restriktive
Richtlinie aus `fork_09`; die 59 Richtlinien der Vorlage bleiben unverändert.

Die acht Dateien in den vier Eimern bleiben liegen. Sie sind in `fork_08` ins
Mandantenverzeichnis umgezogen und danach nur noch über die `service_role`
erreichbar — Löschen wäre Datenverlust ohne Not.

`intern` selbst wird nicht angefasst: 204 Richtlinien auf `altbestand`-Tabellen
hängen daran, und dort ist der Fehler folgenlos, weil `altbestand` nicht
exponiert ist und ein Fehler sperrt statt öffnet. Vermerkt in `docs/OFFEN.md`.

## 2026-09-28 · Die Umzugsfunktion wird nach dem Umzug entfernt

**Frage:** `storage-mandant-umzug` hat in `fork_08` die 91 vorhandenen Dateien
ins Mandantenverzeichnis geschoben. Sie ist **ohne JWT** erreichbar, weil der
Aufruf aus der Datenbank über `pg_net` kommt und dort kein Nutzer-Token
existiert. Gesichert ist sie über ein Einmal-Token aus
`public.storage_umzug_token`, das beim Aufruf gelöscht wird. Im Repository
liegt sie nicht — deshalb hat der Schritt „Nachzählen" des Ausroll-Workflows
angeschlagen: 140 auf dem Projekt, 139 im Repository.

**Entscheidung:** vom Projekt entfernt, nicht ins Repository aufgenommen.
Dafür hat der Workflow eine neue Eingabe `loeschen` bekommen — nur von Hand
auslösbar, mit ausdrücklich eingetragenem Namen, und sie verweigert den Dienst,
solange die Funktion noch im Repository liegt.

**Grund:** Die Arbeit ist getan und wiederholt sich nicht: `storage_umzug_token`
ist leer, `storage_ohne_mandant()` liefert null Zeilen. Ein frisches Projekt hat
keine Altdateien, muss also nichts umziehen. Was bliebe, wäre ein Endpunkt ohne
JWT-Prüfung, der Dateien verschieben kann — geschützt allein dadurch, dass
niemand eine Token-Zeile anlegen kann. Das ist eine Annahme mehr, als nötig ist.
Die Migration `fork_08` beschreibt den Weg vollständig; wer ihn je wieder
braucht, baut die Funktion aus dieser Beschreibung neu.

**Kein automatischer Abgleich:** Der Workflow räumt nicht von selbst auf. Was
auf dem Projekt liegt und nicht im Repository steht, *meldet* er; entfernt wird
es von Hand. Ein Abgleich, der löscht, was er nicht kennt, ist auf einem
Produktivprojekt die falsche Richtung.

## 2026-09-28 · Sichtbarkeitsbereich und Export-Recht (Abschnitt 1b)

**Frage:** Abschnitt 1b verlangt je Mitarbeiter einen Sichtbarkeitsbereich
(nur eigene / Standort / Gesellschaft / Konto) und ein eigenes Recht „Export".
Neu bauen oder an das Rechtemodell der Vorlage anknüpfen?

**Entscheidung:** angeknüpft. Die Vorlage hat `profiles.stufe` (Rollenvorlage),
`profiles.rechte` (Einzelhäkchen je Modul, als jsonb) und `profiles.firma_id`
(Hauptstandort). Das ist bereits das Prinzip aus `CLAUDE.md`, „Rechte als
Vorlage plus Einzelhäkchen". Dazu kommen in `fork_11` nur zwei Dinge:
`profiles.sichtbarkeit` und das Modul `export`.

**Was neu ist und nicht in der Vorlage stand: die Durchsetzung.** `hatRecht()`
steht dort allein in der Oberfläche. `CLAUDE.md` verlangt „serverseitig und in
der Datenbank erzwungen (RLS) — niemals nur durch ausgeblendete
Bedienelemente". Deshalb gibt es jetzt `public.hat_recht(modul)` als
SQL-Fassung derselben Regel, Zeile für Zeile.

**Zwei Fassungen einer Regel sind eine Gefahrenquelle.** `tests/rechte.sql`
prüft die SQL-Fassung gegen jeden Zweig der JavaScript-Fassung — auch den
Sonderfall „`rechte` ist leer": dann gilt alles außer `finanzen`, `admin`,
`rechnungen` und `posteingang`. `posteingang` hängt in der Vorlage an einer
festen E-Mail-Adresse; im Fork ist sie neutralisiert und gehört niemandem, die
SQL-Fassung sperrt das Modul deshalb schlicht.

**Standardwert `konto` — keine Verhaltensänderung.** Wer nichts einstellt,
sieht wie bisher den ganzen Mandanten. Ein Chef sieht ihn immer, unabhängig von
der Einstellung: sonst schlösse ein versehentliches „nur eigene" den Inhaber
aus seinem eigenen Unternehmen aus.

**Datensätze ohne Zuständigen bleiben für alle sichtbar.** Sonst verschwänden
sie aus jeder Liste, und niemand könnte sie noch jemandem zuweisen.

**Nur sechs Tabellen:** `kontakte`, `immobilien`, `aufgaben`, `todos`,
`akq_leads`, `akq_aktivitaeten` — genau die mit `zustaendig_id`. Ohne
Zuständigen gibt es keinen Anker für „eigene", und ein erfundener wäre eine
Verhaltensänderung.

## 2026-09-28 · Kein eingebautes Vertragsmuster als Rückfallebene

**Frage:** `docs/OFFEN.md` hatte für die Vertragsvorlagen notiert: „fehlt sie,
eine neutrale Musterfassung mit dem Pflichthinweis auf anwaltliche Prüfung".
Beim Bauen stellte sich die Frage, ob das eine gute Idee ist.

**Entscheidung:** Nein. Es gibt keinen eingebauten Ersatztext. Fehlt die
Vorlage, bricht die Erzeugung mit einer Meldung ab, die den Weg nennt:
*Einstellungen → Vertragsvorlagen*.

**Grund:** `CLAUDE.md` ist an dieser Stelle eindeutig — „Vertragsmuster **nie**
ungeprüft als rechtssicher bezeichnen". Ein mitgeliefertes Muster wird aber
genau so benutzt: es erscheint im Produkt, es sieht fertig aus, und der
Hinweis daneben wird beim zweiten Mal überlesen. Ein Maklervertrag ist kein
Platzhaltertext; er begründet einen Provisionsanspruch. Lieber eine Anwendung,
die sagt „hier fehlt etwas", als eine, die etwas Erfundenes ausgibt.

Der Reiter trägt den Hinweis dafür dauerhaft und unübersehbar: die Anwendung
prüft die hochgeladenen Texte nicht, die rechtliche Verantwortung liegt beim
Mandanten, eine anwaltliche Prüfung ist erforderlich.

**Zwei der vier lesen noch keine Vorlage** — `fillVollmacht` baut ihr Dokument
im Quelltext zusammen, die Reservierung entsteht in einer Edge Function. Beide
funktionieren heute; sie umzubauen ist eine Verhaltensänderung und gehört in
einen eigenen Schritt. Vermerkt in `docs/OFFEN.md`.

## 2026-09-28 · Plattform-CI: die Farbwerte waren noch die der Referenz

**Befund:** `CLAUDE.md` legt die Plattform-CI fest — Marineblau `#1B2A47`
(dunkel `#12203B`), Gold `#B5934F` (hell `#C9AE72`), Hintergrund `#FAFAFA`,
Karten `#FFFFFF`, Linien `#E6E8EB`, gedämpfter Text `#7A828C`. Im Quelltext
standen `#263159`, `#D4A567`, `#1a2342`, `#e0bd80`, `#FAFAF7`, `#E8E4DA`,
`#8B8377`: die Farben der Referenz. `docs/NEUTRALITAET.md` nennt unter
„Neutralisiert wird die Marke" die **Farbwerte** ausdrücklich.

**Entscheidung:** getauscht, als `MARKE`-Regel im Zerlegeskript. Dazu die
beiden Schattenfarben, die dasselbe Blau in `rgba()` wiederholten.

**Kein Redesign.** Layout, Komponenten, Icons, Abstände, Schrift — alles
unverändert. Getauscht sind acht Zahlen. Das ist genau die Grenze, die
`CLAUDE.md` zieht: „Neutralisiert wird die Marke …, nicht die Oberfläche."

## 2026-09-28 · Logo: Wortmarke statt kaputtem Bild

**Befund:** `LOGO_BLAU` und `LOGO_DUNKEL` sind im Fork geleert — es waren die
Logos der Referenz. Die Komponente `Logo` gab sie aber unverändert als
`<img src="">` aus: an jeder Stelle ein kaputtes Bild.
`docs/NEUTRALITAET.md` Abschnitt 4 sagt, was stattdessen passieren soll:
„Fehlt ein Logo, tritt eine Wortmarke aus dem Firmennamen an seine Stelle."

**Entscheidung:** gebaut. `Logo` nimmt jetzt in dieser Reihenfolge: das Logo
des Mandanten aus `firma_stammdaten.logo_pfad`, sonst das eingebaute, sonst
eine Wortmarke aus `marken_name` beziehungsweise `firma_name`. Der `alt`-Text
trug bis hierher fest „Musterhaus Immobilien GmbH" und kommt jetzt aus
demselben Wert.

## 2026-09-28 · Mandanten-CI hängt am Standort, nicht am Mandanten

**Frage:** Wohin mit `ci_primaer`, `ci_akzent`, `ci_font` — an `mandanten`
oder an `firma_stammdaten`?

**Entscheidung:** an `firma_stammdaten`, also je Standort.

**Grund:** Die Vorlage hängt Logo, Anschrift und Briefkopf schon dort hin, und
die PDF-Funktionen lesen `logo_pfad` von dort (`reservierung-pdf-erzeugen`,
`akq-wertindikation-pdf`). Ein Mandant mit zwei Gesellschaften hat zwei
Briefköpfe. Eine zweite Ablage am Mandanten hätte zwei Wahrheiten ergeben —
und die Frage, welche gilt, wäre in jeder PDF-Funktion einzeln zu beantworten
gewesen. Der Angemeldete bekommt die CI seines Standorts.

**Wie sie ankommt:** `CI` wird an über 6000 Stellen gelesen, aber fast immer
beim Rendern — eine Änderung an den Eigenschaften des Objekts kommt dort von
selbst an. Nur fünf Stile stehen auf Modulebene und hatten ihre Farben zur
Ladezeit eingebacken (`inputStyle`, `labelStyle`, `primaryBtn`,
`secondaryBtn`, `cardStyle`); die werden überschrieben, nicht neu gebaut,
damit jeder Aufrufer dieselbe Referenz behält. Gesetzt wird immer **von der
Plattform-CI aus**, nie vom zuletzt Gesetzten — sonst bliebe beim Wechsel die
Farbe des vorigen Mandanten stehen.

## 2026-09-28 · Die Mandantengrenze galt in siebzehn Funktionen nicht

**Befund:** Die restriktiven Richtlinien aus `fork_07` schützen Tabellen. Sie
schützen **nicht**, was in einer `SECURITY DEFINER`-Funktion passiert — die
läuft mit den Rechten ihres Eigentümers, und RLS greift dort nicht. Im Schema
`public` stehen siebzehn solche Funktionen, die eine `uuid` vom Aufrufer
entgegennehmen. Keine einzige prüfte, ob der Datensatz dem Aufrufer gehört,
und alle sind für `authenticated` ausführbar.

Möglich war damit, sobald es zwei Mandanten gibt:

| Funktion | was ein fremder Mandant damit konnte |
|---|---|
| `rechnung_startnummer_setzen` | fremden Rechnungsnummernkreis zurücksetzen |
| `naechste_rechnungsnummer` | fremden Nummernkreis weiterzählen — eine Lücke in eine Nummernfolge reißen, die nach GoBD lückenlos sein muss |
| `rechnung_stellen`, `_stornieren`, `_bezahlt_markieren` | fremde Rechnungen stellen, stornieren, als bezahlt markieren |
| `delete_mitarbeiter` | fremden Mitarbeiter löschen |
| `eigentuemer_ansprechpartner_info` | Name, E-Mail, Telefon fremder Makler lesen |
| `objekt_kosten_berechnen`, `suchkriterien_abgleich` | Zahlen zu fremden Objekten |
| und sieben weitere | |

**Warum `tests/mandant.sql` das nicht gefunden hat:** Der Test prüft Tabellen,
und dort ist die Grenze dicht. Eine Funktion ist ein Tunnel daneben. Dafür gibt
es jetzt `tests/funktionen-mandant.sql` — zwei Mandanten, und Alpha ruft jede
Funktion mit einer Kennung von Beta auf.

**Entscheidung:** Die Körper der Vorlage werden **nicht** neu geschrieben. Eine
Zeile wird vorne eingezogen, maschinell, und danach nachgeprüft. So bleibt der
Rest Zeile für Zeile die Vorlage, und dieselbe Migration wirkt auch dann noch,
wenn die Vorlage ihre Funktion einmal ändert.

**Zwei bleiben ausgenommen:** `newsletter_abmelden` (der Token *ist* der
Nachweis) und `expose_abgerufen` (die öffentliche Exposéseite meldet den
Abruf). Ein Wachposten in der Migration lässt jede neue ungeprüfte Funktion
auffallen.

## 2026-09-28 · `current_user` ist in `SECURITY DEFINER` der Eigentümer

**Fehler im ersten Entwurf von `fork_14`:** Die Ausnahme für die `service_role`
stand als `current_user in ('service_role', 'postgres', 'supabase_admin')`. In
einer `SECURITY DEFINER`-Funktion ist `current_user` aber der **Eigentümer**,
nicht der Aufrufer — auf Supabase `postgres`. Die Ausnahme traf also immer zu,
und der Wächter hat jeden durchgelassen.

**Aufgefallen ist es nur, weil der Test zuerst geschrieben wurde** und alle
neun Prüfungen rot blieben, obwohl die Migration sauber durchlief. Ein Wächter,
der nichts abweist, sieht von außen genauso aus wie ein Wächter, den es nicht
gibt.

**Entscheidung:** `public.mandant_grenze_gilt()` liest den JWT-Anspruch, den
PostgREST als `request.jwt.claims` setzt. Kein JWT heißt Cron, Wartung oder
direkte Verbindung — dort gibt es keinen Mandanten, an dem zu messen wäre.
`service_role` bleibt ausgenommen: sie umgeht RLS ohnehin überall, das ist der
Weg der Edge Functions.

## 2026-09-28 · Die Hintergrundjobs haben Mandanten verkuppelt

**Befund, der schwerste bisher:** `fork_14` hat die *Argumente* der
`SECURITY DEFINER`-Funktionen abgesichert. Was diese Funktionen **innen**
verknüpfen, war damit noch nicht geprüft — und dort lag der eigentliche Fehler.

`public.suchkriterien_abgleich` enthielt:

```sql
from immobilien o
cross join kontakte k
```

Ein Kreuzprodukt **aller** Objekte mit **allen** Kontakten, ohne
Mandantenbedingung. Die Funktion ist `SECURITY DEFINER`, also greift RLS in ihr
nicht — weder beim Cron-Lauf alle 15 Minuten noch beim Knopf in der Oberfläche.
Sie schreibt Treffer in `suchkriterien_treffer`, und
`suchkriterien_abgleich_lauf` meldet diese Treffer danach **per Push an den
zuständigen Makler, mit den Namen der passenden Interessenten**. Über
Mandantengrenzen hinweg heißt das: fremde Kundennamen auf dem Telefon eines
fremden Maklers.

Drei weitere Wege über dieselbe Grenze:

- `push_termin_erinnerungen_senden` verknüpft Termin und Profil über den
  **Namen** des Teilnehmers. Zwei Mandanten mit je einem „Thomas Mustermann" —
  und der eine bekommt die Termine des anderen.
- `expose_nachfass_aufgaben` fällt zurück auf
  `(select id from profiles where role='chef' order by created_at limit 1)` —
  den ältesten Chef der **ganzen Datenbank**. Die daraus erzeugte Aufgabe trägt
  Namen und E-Mail des Interessenten.
- `kontakte_zustaendig_abgleichen` ordnet über die onOffice-Kennung zu, ohne zu
  prüfen, ob Adresse und Zuordnung zum selben Mandanten gehören.

**Entscheidung:** je Stelle eine Bedingung ergänzt, chirurgisch — die Körper
der Vorlage bleiben sonst unberührt. Jede Ersetzung prüft vorher, dass die
gesuchte Stelle genau einmal vorkommt, und danach, dass sie angekommen ist.
Ein Wachposten in der Migration schlägt an, wenn die Vorlage eine der
Funktionen einmal neu schreibt.

**Der Test war zuerst zahnlos.** `tests/hintergrund-mandant.sql` hat die
Terminerinnerung anfangs mit einer *hier nachgebauten* Abfrage geprüft — die
trug die Bedingung natürlich, also leuchtete sie auch ohne `fork_15` grün.
Jetzt liest der Test den Quelltext der Funktion. Nachgewiesen ist beides: mit
`fork_15` bestehen alle fünf Prüfungen, ohne sie fallen vier durch.

**Warum die Prüfung „innerhalb eines Mandanten findet er weiterhin" dazugehört:**
Ein Abgleich, der gar nichts mehr findet, wäre kein Datenschutz, sondern ein
Ausfall — und von außen nicht zu unterscheiden.

## 2026-09-28 · Newsletter-Empfänger waren ohne Anmeldung abrufbar

**Befund:** `public.newsletter_empfaenger` liest `newsletter_anmeldungen` ohne
Mandantenbedingung. Ihre Rechteprüfung endete auf

```sql
or current_user in ('service_role','postgres')
```

— dieselbe Falle wie in `fork_14`: In einer `SECURITY DEFINER`-Funktion ist
`current_user` der **Eigentümer**, auf Supabase `postgres`. Die Bedingung war
also immer wahr und die Rollenprüfung davor ohne jede Wirkung. Die Funktion ist
für `anon` ausführbar.

Zusammengenommen: **ohne Anmeldung** die E-Mail-Adressen, Namen und
Abmelde-Token sämtlicher Newsletter-Empfänger aller Mandanten.

**Nachgewiesen, nicht vermutet:** `tests/hintergrund-mandant.sql` ruft die
Funktion mit `{"role":"anon"}` auf. Gegen eine Instanz ohne `fork_16` kommen
beide Mandanten zurück; mit `fork_16` keiner.

**Entscheidung:** Mandantenbedingung ergänzt und die Rollenprüfung repariert
(über `mandant_grenze_gilt()` statt `current_user`). Dazu ein dritter
Wachposten: **keine** `SECURITY DEFINER`-Funktion im Schema `public` darf
Rechte über `current_user` prüfen. Die Migration schlägt fehl, wenn eine
dazukommt.

Ebenfalls in `fork_16`: `eigentuemer_besichtigungen` sammelte die Kontakte des
angemeldeten Eigentümers unter anderem über den Abgleich der E-Mail-Adresse.
Dieselbe Adresse bei einem anderen Makler — was vorkommt, wer zwei Makler
beauftragt — zog dessen Kontakt mit herein, samt Besichtigungsterminen.

`aktueller_eigentuemer_id` bleibt unverändert: sie sucht über `auth.uid()`, und
ein Benutzerkonto gehört zu genau einem Mandanten.

## 2026-09-28 · Öffentliche Endpunkte: `oeffentliche-objekte` zeigte alle Mandanten

**Befund:** 30 der 139 Edge Functions sind ohne JWT erreichbar **und**
benutzen den `service_role`. Für den gilt RLS nicht — sie müssen die
Mandantengrenze also selbst ziehen. `oeffentliche-objekte` tat es nicht:

```js
supabase.from("immobilien")
  .eq("website_veroeffentlichen", true)
  .in("status", ["vermarktung", "reserviert"])
```

Keine Mandantenbedingung, `Access-Control-Allow-Origin: *`, keine Anmeldung.
**Jede Makler-Webseite hätte die Objekte aller anderen Makler gezeigt** — mit
Preis, Fläche, Ort und, bei freigegebener Adresse, Straße und Hausnummer.

**Entscheidung — ein Muster, nicht fünf:** Ein öffentlicher Endpunkt bestimmt
seinen Mandanten in dieser Reihenfolge:

1. `?mandant=<Kennung oder Kürzel>` beziehungsweise der Kopfeintrag
   `x-immo-mandant`,
2. sonst: gibt es genau einen Mandanten, ist er gemeint,
3. sonst: ablehnen statt raten.

Schritt 2 hält den heutigen Betrieb am Laufen, ohne dass eine eingebettete
Seite etwas ändern muss. Ab dem zweiten Mandanten muss sie sagen, wen sie
meint — und bis dahin liefert der Endpunkt lieber nichts als das Falsche.
Dasselbe Vorgehen wie bei `energieausweis-anfrage`.

## 2026-09-28 · Ein Buch statt eines Urteils für die restlichen 24

**Frage:** 24 weitere öffentliche Endpunkte sind ungelesen. Das Gate rot zu
schalten, bis alle durchgesehen sind, hieße: kein Commit mehr, bis ein
Nachmittag Lesearbeit erledigt ist.

**Entscheidung:** `tests/funktionen-oeffentlich.py` führt Buch statt zu
urteilen. Es kann nicht entscheiden, ob eine Funktion die Grenze richtig
zieht — das muss ein Mensch lesen. Es hält fest, welche gelesen sind, und wird
**rot bei einer Verschlechterung**: eine neue Funktion ohne JWT, die in keiner
Liste steht, oder eine als abgesichert geführte, die ihr Kennzeichen verloren
hat.

Die Liste `NOCH_OFFEN` darf nur kürzer werden, nie länger. Jeder Lauf von
`npm run check` schreibt hin, wie viele es noch sind.

**Warum nicht einfach rot:** Ein Gate, das man abschalten muss, um arbeiten zu
können, wird abgeschaltet. Ein Gate, das eine Zahl nennt, die kleiner werden
muss, bleibt stehen.

## 2026-09-28 · `web-lead`: vier Befunde in einer Datei

Der Eingang für Bewertungsanfragen von der Webseite. Er entscheidet, in wessen
Postfach eine Kundenanfrage landet.

**1. Eine fest eingebaute Benutzerkennung der Referenz.**
`const CHEF_ID = "8e0529f2-…"` — die UUID des Chefs des Referenzunternehmens,
noch im Fork. Das Neutralitäts-Gate hat sie nicht gesehen, weil eine UUID
keinen Markennamen enthält. Sie ist im Fork auch funktionslos: den Benutzer
gibt es nicht, der Fremdschlüssel scheitert, und weil der Aufruf in einem
`try` steht, wurde der Kontakt **still gar nicht erst angelegt**.

Die Kennung steht jetzt auf der Blockliste (`scripts/neutral.sh`,
base64-kodiert wie die übrigen Muster) — sie kann nicht zurückkommen.

**2. Die Kontaktsuche lief über alle Mandanten.** Eine Anfrage an Makler A von
jemandem, der bei Makler B schon Kontakt ist, hätte **B's Datensatz geändert**:
Rolle „eigentuemer" gesetzt und eine Notiz mit Adresse und Nachricht angehängt.

**3. Beide `insert` trugen keinen Mandanten.** Der Standardwert
`aktuelle_mandant_id()` hilft hier nicht: die Funktion läuft mit dem
`service_role`, dort ist `auth.uid()` leer — der Lead landete ohne Mandanten.

**4. Die Empfängerliste stand im Quelltext.** Jetzt kommt sie vom Standort des
Mandanten. Der **Absender** bleibt die Plattform: die Absenderdomäne muss beim
Mailversand hinterlegt sein, und das ist Sache des Betreibers, nicht des
Mandanten.

## 2026-09-28 · Zehn Eindeutigkeitsregeln galten global statt je Mandant

**Befund, ein Blocker für Phase 3:** 41 Eindeutigkeitsregeln auf
Mandantentabellen enthalten `mandant_id` nicht. Die meisten zu Recht — ein
Zufallstoken, eine Fremdkennung oder ein zusammengesetzter Schlüssel über eine
ohnehin mandantengebundene Elterntabelle ist richtig global eindeutig.

**Zehn nicht.** Sie tragen einen *Namen*, den ein zweiter Mandant mit demselben
Recht führen will. Solange die Regel global gilt, nimmt der erste ihn dem
zweiten weg — und der zweite bekommt beim Anlegen eine Fehlermeldung, die
nichts erklärt.

| Regel | was der zweite Mandant nicht mehr kann |
|---|---|
| `rechnungen.rechnungsnummer` | **abrechnen** — zwei Mandanten mit Präfix „RE" kollidieren ab der ersten Rechnung |
| `external_credentials.service` | eine eigene CRM-Anbindung haben — genau das, was der Auftrag je Mandant verlangt |
| `portal_zugaenge.portal` | ein eigenes Portalkonto |
| `firma_kennzahlen.jahr` | ein eigenes Geschäftsjahr |
| `news_briefings.briefing_datum` | ein Briefing am selben Tag |
| `firma_stammdaten.slug` | einen Standort „standard" |
| `akq_quellen.slug` | eine Quelle „website" |
| `checkliste_vorlagen.name` | eine Checkliste „Eigentumswohnung" |
| `projekte.slug` | ein Projektkürzel wiederverwenden |
| `liquid_kategorisierung.match_key` | eigene Buchungsregeln |

**Entscheidung:** Regel weg, eindeutiger Index über `(mandant_id, Spalte)` hin.
Keine der zehn wird von einem Fremdschlüssel gebraucht — geprüft, und die
Migration bricht ab, falls sich das ändert.

**Nachgewiesen:** `tests/eindeutig-je-mandant.sql` legt beide Mandanten an und
lässt sie dieselben Namen führen. Mit `fork_17` gehen alle zehn durch, ohne sie
kollidieren alle zehn. Die elfte Prüfung ist die Gegenprobe: **innerhalb** eines
Mandanten bleibt der Name eindeutig — ein Index, der alles durchlässt, ist
keine Eindeutigkeit.

**Der Test war zuerst wertlos, zum zweiten Mal an einem Tag.** Er baute die
Einfügungen in einer Schleife per `format()`; der Bezeichner `wert` war dabei
mehrdeutig (Hilfstabelle *und* Variable), alle zehn scheiterten aus dem
**falschen** Grund, und ein `when others`-Zweig zählte das als bestanden.
Jetzt steht jede Einfügung ausgeschrieben, mit allen Pflichtfeldern, und nur
`unique_violation` zählt als Kollision; alles andere gilt als **nicht
gelaufener Testfall** und damit als Fehler.

## 2026-09-28 · `objekt-landing`: das Impressum kam vom falschen Mandanten

Die öffentliche Objektseite holte Firmenname, Anschrift, Registergericht,
Geschäftsführer und USt-IdNr. über einen **Slug**:

```js
.eq("slug", f.firma_slug || "standard")
```

`firma_stammdaten.slug` war bis `fork_17` global eindeutig — das traf also
immer genau einen Standort, irgendeinen. **Die Landingpage für das Objekt von
Makler A hätte die Rechtsangaben von Makler B gezeigt.** Das ist nicht nur
falsch, das verfehlt die Impressumspflicht.

Seit `fork_17` ist der Slug je Mandant eindeutig — ein Slug allein sagt also
gar nichts mehr. Der Standort kommt jetzt aus dem Mandanten **des Objekts**:
erst der mit passendem Slug, sonst der erste nach Sortierung. Das Objekt ist
die verlässliche Quelle; die Seite zeigt schließlich genau dieses Objekt.

Ebenfalls behoben: die Suche nach dem Interessentenkontakt lief über alle
Mandanten, und ein neu angelegter Kontakt trug keinen.

## 2026-09-28 · `akq-lead-eingang`: fünf Auswahlen ohne Mandantenbezug

Der öffentliche Eingang für Bewertungsanfragen wählte durchweg „den ersten,
den er findet":

| Auswahl | Folge |
|---|---|
| `mail_postfaecher` | die Benachrichtigung über einen Lead von Makler A wäre **aus dem Postfach von Makler B** gegangen |
| `profiles` | „der Makler mit den wenigsten offenen Leads" — über **alle** Mandanten. Ein Lead von A hätte bei B gelegen, mit Name, E-Mail und Anschrift des Interessenten |
| `akq_pipelines` | die erste aktive Pipeline, gleich welchen Mandanten |
| `akq_quellen` | die Quelle „website" irgendeines Mandanten |
| `kontakte` | Suche über die E-Mail-Adresse, mandantenübergreifend — und der gefundene Kontakt wurde danach **geändert** |

Dazu trugen `akq_leads` und `akq_lead_historie` keinen Mandanten.

**Ein Fehler beim Bauen, im selben Durchgang gefunden:** Ich habe die Signatur
von `benachrichtige()` um den Mandanten erweitert, die Aufrufstelle aber
zunächst nicht. Dort stand dann die E-Mail-Adresse an der Stelle des
Mandanten — die Benachrichtigung wäre gar nicht mehr rausgegangen. Aufgefallen
beim Lesen des erzeugten Ergebnisses, nicht beim Schreiben der Regel. Deshalb
gehört der Blick auf das Erzeugte zum Vorgang, nicht ans Ende.

## 2026-09-28 · Belegnummern: neuer Kreis neben dem alten, nicht darüber

**Angefordert:** „auch die Rechnungsnummer varianten müssen wie bei onoffice
irgendwie gepflegt werden." Abschnitt 3c nennt es genauer: ein Muster aus
Präfix, Jahr, Monat, fortlaufender Zahl mit n Stellen, Trennzeichen und
optionalem Standort-Kürzel, Live-Vorschau, eigener Kreis für Gutschriften,
Rücksetzung jährlich/monatlich/nie.

**Was die Vorlage kann:** `rechnung_nummer_praefix` und
`rechnung_nummer_mit_jahr`. Das Ergebnis ist immer `PRÄFIX-JAHR-001` mit drei
Stellen. Kein Muster, kein Monat, kein zweiter Kreis.

**Entscheidung:** `rechnung_nummern_sequence` wird **nicht angefasst**. Dort
stehen bereits vergebene Nummern; ein Umbau daran wäre ein Eingriff in eine
Folge, die nach GoBD lückenlos sein muss. Der neue Kreis steht daneben.
`naechste_rechnungsnummer()` benutzt ihn, **sobald einer eingerichtet ist**,
und verhält sich sonst wie bisher. Wer nichts einstellt, merkt nichts.

**Zähler und Konfiguration stehen in einer Zeile.** Das ist kein
Schönheitsfehler, sondern der Grund für die Lückenlosigkeit: die Vergabe ist
ein einziges `update … returning`, kein Lesen-dann-Rechnen-dann-Schreiben.
Dazwischen passt ein zweiter Aufruf.

**Die Vorschau rechnet nicht in der Oberfläche.** Sie ruft dieselbe
Datenbankfunktion, die später die echte Nummer erzeugt. Zwei Fassungen
derselben Regel laufen auseinander — bei `hat_recht()` ist genau das schon
einmal aufgefallen.

**Was der Test NICHT beweist:** Der Auftrag verlangt einen Lasttest mit 50
gleichzeitigen Anlagen. Echte Gleichzeitigkeit lässt sich in einer psql-Sitzung
nicht herstellen. Geprüft ist, dass 200 Vergaben 200 verschiedene, lückenlos
aufsteigende Nummern ergeben. Der Aufbau als ein `update … returning` ist das,
was auch unter Gleichzeitigkeit trägt — aber ein Lesen-dann-Schreiben wäre in
diesem Test ebenfalls grün und im Betrieb trotzdem falsch. Vermerkt in
`docs/OFFEN.md`.

## 2026-09-28 · Rechnungsfreigabe: nur der Benannte, auch nicht die Chefin

**Abschnitt 3c:** „Ist jemand gesetzt, gehen Rechnungen erst nach dessen
Freigabe raus: Entwurf → zur Freigabe → freigegeben → versendet."

**Entscheidung:** Die beiden neuen Zustände schieben sich **zwischen** die
vorhandenen. `entwurf → gestellt → bezahlt` der Vorlage bleibt unberührt, und
ohne eingerichteten Verantwortlichen ändert sich nichts: `rechnung_stellen()`
nimmt weiter einen Entwurf entgegen. Eine Freigabe, die immer nötig wäre, wäre
eine Verhaltensänderung für jeden bestehenden Mandanten.

**Auch ein Chef darf nicht freigeben, wenn er nicht der Benannte ist.** Das war
eine echte Entscheidung: die naheliegende Bequemlichkeit wäre „der Chef darf es
auch". Dann wäre die Freigabe aber eine Empfehlung und keine Kontrolle — und
genau als Kontrolle richtet man sie ein. Wer die Zuständigkeit ändern will,
ändert die Einstellung; das steht im Protokoll.

**Die Betragsgrenze entscheidet dieselbe Funktion, die es anzeigt.**
`rechnung_braucht_freigabe()` wird von `rechnung_stellen()` gefragt **und** von
der Oberfläche. Zwei Fassungen liefen auseinander; bei `hat_recht()` ist genau
das schon passiert.

## 2026-09-28 · Zahlungsbedingungen: Skontoziel nach Fälligkeit ist ein Fehler

Eine Prüfbedingung verlangt `skonto_tage <= netto_tage`. Ein Skontoziel nach
dem Fälligkeitsdatum ergibt keinen Sinn, und die Datenbank sagt das lieber
sofort, als es zuzulassen und später eine Rechnung mit unsinnigem Text zu
erzeugen.

Der Satz auf dem Beleg kommt aus `zahlungsbedingung_text()`: ein eigener Text
schlägt die Zahlen, sonst wird er daraus gebildet („Zahlbar innerhalb von 7
Tagen mit 2 % Skonto, innerhalb von 30 Tagen ohne Abzug."). Rein rechnend,
damit Vorschau und Beleg denselben Satz zeigen.

## 2026-09-28 · Die PDFs fanden weder Schriften noch Logo — mein Fehler

**Gemeldet:** „man kann keine Exposés generieren, keine PDFs, keine
Rechnungen … bisher ist es wirklich nur eine reine Oberfläche."

**Das Protokoll der Rechnungsfunktion sagt genau, warum:**

```
Fonts geladen: Montserrat-Regular: FEHLT  Montserrat-Bold: FEHLT  Marcellus: FEHLT
Logo-Download Fehler: Object not found
```

**Zwei Ursachen, die sich überlagert haben.**

**1. Mein Fehler.** `fork_08` hat alle Dateien im Speicher ins
Mandantenverzeichnis verschoben. Elf Funktionen, die Dateien **schreiben**,
haben damals die Speicher-Hülle bekommen. Die Funktionen, die Schriften und
Logo **lesen**, nicht — sie suchten weiter unter `fonts/Montserrat-Regular.ttf`
statt `{mandant}/fonts/…`. Die Trennung war richtig, die Durchsicht der
Lesestellen habe ich schlicht vergessen.

**2. Die gesuchten Dateien gibt es überhaupt nicht.** Im Eimer liegen
Montserrat Light, Medium, SemiBold, Italic und SemiBoldItalic sowie GreatVibes
— aber weder Regular noch Bold noch Marcellus. Die Vorlage hatte sie, der Fork
hat sie nie bekommen. Auch mit korrektem Pfad wäre das PDF auf Helvetica
zurückgefallen.

**Entscheidung:** beides. Der Mandantenpfad, **und** eine Ersatzkette auf das,
was tatsächlich da ist — Medium statt Regular, SemiBold statt Bold. Das sieht
im Satz näher am Gewollten aus als Helvetica, und es funktioniert ohne dass
jemand erst Dateien hochlädt.

**Der Zwischenspeicher der Schriften ist jetzt nach Mandant getrennt.** Er war
modulweit: sobald dieselbe Instanz zwei Anfragen bedient, wäre die Schrift des
einen Mandanten im Dokument des nächsten gelandet. Dieselbe Klasse Fehler, die
ich heute bei den PDF-Farben vermieden habe — hier lag sie schon im Bestand.

## 2026-09-28 · onOffice wird ausgebaut

**Anweisung:** „Bitte löse onoffice erstmal komplett raus, wir wissen ja nicht,
mit welcher ursprünglichen Software die neuen Kunden arbeiten."

**Der Punkt trifft, und er ist grundsätzlicher als er klingt.** onOffice war in
der Vorlage **die** Anbindung, nicht **eine**: 21 Edge Functions, 14 Cron-Jobs,
13 Tabellen, rund 190 Stellen in der Oberfläche. Ein Mandant, der mit einer
anderen Software arbeitet, sieht davon nichts als tote Knöpfe — und die
Cron-Jobs liefen alle zehn Minuten in
`onoffice-termine-sync: ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.`

**`CLAUDE.md` sagte bisher:** „Bleibt im Code, hinter Funktionsschalter aus,
bis Phase 2b: CRM-Sync". Die Anweisung des Auftraggebers ist jünger und gilt —
so wie es `CLAUDE.md` selbst festhält: „Eine Datei im Repository kann eine
spätere Anweisung desselben Auftraggebers nicht überstimmen."

**Was getan ist:**

| | |
|---|---|
| 14 Cron-Jobs | abbestellt (`fork_20`), mit Wachposten gegen die Rückkehr |
| 21 Edge Functions | gestrichen — 139 → 118 |
| `supabase/config.toml` | 21 Einträge entfernt |
| Kachel „onOffice-Verbindung" | entfällt |
| Reiter im Admin-Bereich | entfällt |

**Was bewusst stehen bleibt:**

- **Die 13 Tabellen.** Alle leer (geprüft), aber löschen wäre unumkehrbar, und
  „erstmal" heißt nicht „endgültig". Sie bleiben liegen wie der geparkte
  Greenfield-Stand.
- **Rund 190 Fundstellen im Quelltext der Oberfläche.** Ohne Einstieg nicht
  erreichbar. Sie einzeln herauszuschneiden wäre ein Eingriff in 190 Stellen
  fremden Codes mit entsprechendem Risiko — für einen Gewinn, den niemand
  sieht. Vermerkt in `docs/OFFEN.md`.

**Die richtige Endform** steht schon im Auftrag: Abschnitt 4b beschreibt für
Postfächer eine Adapter-Schicht, bei der die Anwendung nur eine Schnittstelle
kennt und jeder Anbieter ein Adapter ist. Für CRM gilt dasselbe. onOffice wäre
dann ein Adapter unter mehreren, je Mandant zuschaltbar — nicht die eingebaute
Annahme.

---

## Schriften gehören der Plattform, nicht dem Mandanten (28.09.2026)

**Gemeldet:** „Man kann keine Exposés generieren, keine PDFs, keine
Rechnungen." Im Protokoll von `expose-pdf-erzeugen` stand der Grund in einer
Zeile: `500 — Basis-Fonts fehlen in branding-assets`.

**Zwei Ursachen lagen übereinander.**

1. **Die Dateien gab es nicht.** Im Eimer lagen Montserrat Light, Medium,
   SemiBold, Italic, SemiBoldItalic und GreatVibes — aber weder
   Montserrat-Regular noch Montserrat-Bold noch Marcellus. Genau die drei,
   die Rechnung, Exposé und Reservierung verlangen. Die Vorlage hatte sie,
   der Fork hat sie nie bekommen.
2. **Mein Fehler aus `fork_08`.** Der Umzug hat alle Dateien ins
   Mandantenverzeichnis geschoben. Die elf Funktionen, die Dateien
   **schreiben**, haben damals die Storage-Hülle bekommen. Die Funktionen,
   die Schriften und Logo **lesen**, nicht — sie suchten weiter unter
   `fonts/…` statt `{mandant}/fonts/…`.

**Entscheidung: Schriften sind Plattform-Gut, kein Mandanten-Branding.** Sie
liegen im Wurzelverzeichnis des Eimers unter `fonts/`. Sie 450 KB weise für
jeden neuen Mandanten zu kopieren wäre Unfug — es sind für alle dieselben
Dateien, und ein Mandant, der eine eigene Hausschrift mitbringt, legt sie
unter `{mandant}/fonts/…` und übersteuert sie damit (Abschnitt 2a des
Auftrags).

**Gelöst an einer Stelle statt in zehn.** Die Storage-Hülle regelt jetzt auch
das Lesen, in drei Stufen:

| Stufe | | |
|---|---|---|
| 1 | `{mandant}/pfad` | die Datei des Mandanten |
| 2 | `pfad` | die der Plattform |
| 3 | Quelle im Netz | nur Schriften, nur einmal — danach liegt sie unter (2) |

Stufe 3 ist nicht neu erfunden: `expose-pdf-erzeugen` und `mpe-pdf-erzeugen`
heilen sich in der Vorlage schon selbst (`FONT_QUELLEN`). Neu ist nur, dass
es für alle Schnitte gilt und in jeder Funktion.

**Kein Leck.** Unter der Wurzel liegt seit `fork_08` nichts
Mandantenbezogenes mehr; **geschrieben** wird weiterhin ausschließlich mit
Mandantenpräfix, und die restriktive Richtlinie aus `fork_09` hält angemeldete
Nutzer ohnehin von der Wurzel fern. Nur der `service_role` der Edge Functions
kommt dorthin — und legt dort nur eine Schrift ab.

**Die Hülle haben jetzt sechzehn statt elf Funktionen:** dazu gekommen sind
`rechnung-pdf-erzeugen`, `vertrag-pdf`, `mietvertrag-pdf`,
`reservierung-pdf-erzeugen` und `reservierung-word-erzeugen`. Die
Sonderbehandlung, die `rechnung-pdf-erzeugen` am selben Tag bekommen hatte
(eigene Hilfsfunktionen `immoBrandingDatei`/`immoSchrift`), ist damit
entfallen. Zwei Wege zum selben Ziel sind einer zu viel — und der zweite ist
der, den man beim nächsten Mal vergisst.

**Nebenbei geschlossen:** der Schriften-Zwischenspeicher in
`rechnung-pdf-erzeugen` und `reservierung-pdf-erzeugen` lag auf Modulebene.
Heute fällt das niemandem auf, weil alle dieselben Schriften bekommen. Sobald
ein Mandant eine eigene hochlädt, wäre seine Schrift in der Rechnung des
nächsten, sobald dieselbe Instanz zwei Anfragen bedient. Der Speicher hält
jetzt je Mandant einen Satz.

**Neues Gate:** `tests/funktionen-syntax.js` liest alle 118 Funktionen mit dem
TypeScript-Parser. Bis heute stand im Bericht „kein Deno und kein TypeScript
in dieser Umgebung" — das erste stimmt, das zweite nicht. Der Parser braucht
weder Deno noch auflösbare Importe und fängt genau den Fehler, den ein
Generator macht: eine Regel, die eine Klammer zerschneidet. Typen prüft er
nicht; dafür bräuchte es Deno mit Netz.

**Nachgewiesen am 28.09.2026, gegen das eigene Projekt, nicht im Trockenen.**
Beide Funktionen wurden mit dem Anmelde-Token eines echten Benutzers gerufen
(über `pg_net` aus der Datenbank, weil der Netzfilter der Arbeitsumgebung
`*.supabase.co` sperrt):

| | |
|---|---|
| `rechnung-pdf-erzeugen` | `200` · `RE-2026-001.pdf` im Mandantenordner |
| `expose-pdf-erzeugen` | `200` · `Expose_1_2026-09-28.pdf` im Mandantenordner |

Vorher: `500 — Basis-Fonts fehlen in branding-assets`. Im Eimer liegen jetzt
die drei fehlenden Schriften unter `fonts/` — von der Funktion selbst geholt,
Zeitstempel 16:33:38, ohne dass jemand etwas hochgeladen hat. Die sechs
Schriften, die der Mandant schon hatte, wurden weiterhin unter
`{mandant}/fonts/` gefunden: Stufe 1 vor Stufe 2, wie gebaut.

---

## Zahlung und Freigabe bekommen eine Maske (28.09.2026)

`fork_19` hat Tabellen, Prüfung und Protokoll gebaut, aber keine Oberfläche.
Eine Regel, die nur in der Datenbank steht und die niemand einstellen kann,
ist keine Funktion, sondern eine Sperre. Der neue Reiter *Einstellungen →
Zahlung & Freigabe* pflegt beides je Gesellschaft.

**Zwei verschiedene Rechte, mit Absicht.** Zahlungsbedingungen darf pflegen,
wer das Recht „Rechnungen" hat. **Wer freigibt, legt nur die Verwaltung
fest** — sonst könnte sich der Buchhalter selbst zum Freigeber machen, und
die Freigabe wäre keine. Beides steht so schon in den Richtlinien von
`fork_19`; die Maske bildet es nur ab. Ausgeblendete Knöpfe sind kein
Schutz — die Datenbank weist den Versuch ohnehin ab.

**Die Vorschau rechnet nicht selbst.** `fork_21` zieht den Satz aus
`zahlungsbedingung_text(uuid)` heraus in
`zahlungsbedingung_text_aus(tage, prozent, skontotage, text)`; die alte
Funktion liest nur noch die Zeile und delegiert. Damit kann die Oberfläche
den Satz vor dem Speichern zeigen, ohne ihn ein zweites Mal zu bauen. Ein
Wachposten in der Migration und eine Prüfung in `tests/rechnung-freigabe.sql`
schlagen an, wenn der Satz je wieder an zwei Stellen steht — bei `hat_recht()`
ist genau das schon einmal passiert.

---

## Die öffentlichen Endpunkte schrieben Zeilen ohne Mandanten (28.09.2026)

Beim Durchlesen der offenen öffentlichen Endpunkte gefunden: **47
Einfügungen in 18 Funktionen, alle in Tabellen der Gruppe MANDANT, keine
einzige mit `mandant_id`.**

**Warum das ein Fehler ist, der sich versteckt.** `mandant_id` trägt den
Standardwert `aktuelle_mandant_id()`. Der liest den Mandanten aus dem
Anmelde-Token. Ein Aufruf ohne Token hat keinen — der Standard ist dann
NULL, und die Zeile entsteht ohne Mandanten. Die restriktive Richtlinie aus
`fork_07` vergleicht `mandant_id` mit dem Mandanten des Lesers, und **NULL
ist mit nichts gleich**. Die Zeile ist damit für jeden unsichtbar.

Es gibt keine Fehlermeldung. Der Interessent stellt seine Frage auf der
Objektseite, die Zeile entsteht, und kein Makler sieht sie je. Der Bewerber
füllt den Test aus, und das Ergebnis verschwindet.

Aufgefallen ist es nur, weil die Tabellen auf dieser Instanz noch fast leer
sind — die Fundstellen waren zu lesen, nicht zu spüren.

**Geschlossen sind sieben Fundstellen**, nämlich die, an denen der Mandant
schon in Reichweite lag:

| | |
|---|---|
| `signatur_events` (10×) und die abgelegte Vertragskopie | Mandant des Vorgangs |
| `bewerber_antworten` | Mandant der Einladung |
| `immobilie_datei` (`bild-empfang`) | Mandant der Immobilie, aus der Storage-Hülle |
| `energieausweis_anfragen` | der Mandant, den die Funktion selbst ermittelt |
| `akq_eingang_log` | Mandant der Anfrage, sobald er feststeht |

**25 bleiben offen** — vor allem das Neubauportal (`projekt-*`, fünf
Funktionen) und der Newsletter. Sie brauchen jeweils eine eigene Quelle für
den Mandanten, und die will gelesen, nicht geraten sein.

**Buch darüber führt `tests/oeffentlich-insert-mandant.py`,** Teil von
`npm run check`. Die Liste darf nur kürzer werden; eine neue Fundstelle
macht das Gate rot. Nachgewiesen an einem entfernten Eintrag.

**Was die Prüfung NICHT leistet:** sie sieht, *dass* eine Funktion
`mandant_id` mitgibt, nicht *ob der Wert stimmt*. Beim Akquise-Protokoll
wäre mir genau das beinahe durchgegangen — die erste Fassung setzte einen
optionalen Parameter, den kein Aufrufer je füllte. Die Trefferzählung des
Generators hat es gemeldet.

---

## Der Mandant kommt vom Elternsatz (28.09.2026)

Nach den sieben Stellen, die im Quelltext geschlossen wurden, blieben 28
Aufrufe in 14 Funktionen, die Zeilen ohne `mandant_id` anlegen. Jede einzeln
im Quelltext nachzuziehen wäre der falsche Weg gewesen — nicht weil es viel
Arbeit ist, sondern weil **jede neue Zeile Quelltext es wieder vergessen
kann**.

**Was dort fehlt, ist keine Angabe, die der Aufrufer treffen muss.** Sie
steht schon im Elternsatz: eine Projektaktivität gehört dem Mandanten ihres
Projekts, eine Frage auf der Objektseite dem Mandanten des Objekts. Das ist
keine Vermutung, sondern die Definition.

`fork_22` hängt deshalb einen BEFORE-INSERT-Wachposten an **sechzehn
Tabellen**, der `mandant_id` aus dem Elternsatz füllt — und nur dann, wenn
sie leer ist. Wer sie setzt, behält sie.

**Warum das kein Schlupfloch ist:** Postgres wertet die WITH-CHECK-Bedingung
einer Richtlinie **nach** den BEFORE-Triggern aus. Trägt ein angemeldeter
Nutzer ein Kind eines fremden Elternsatzes ein, setzt der Wachposten
pflichtgemäß den fremden Mandanten — und genau daran weist die restriktive
Richtlinie aus `fork_07` die Zeile ab. Der Wachposten kann die Grenze also
nicht aufweichen, nur vervollständigen. `tests/mandant-aus-eltern.sql` führt
beides vor; die Gegenprobe ist Prüfung 7.

**Was er nicht tut: raten.** Ist das Elternfeld leer oder der Elternsatz ohne
Mandanten, bleibt die Zeile ohne. Lieber sichtbar unvollständig als falsch
zugeordnet. Aus demselben Grund trägt `aktivitaeten` keinen Wachposten: die
Zeile hängt wahlweise an einem Eigentümer oder an einem Vertrag, und ein
Wachposten, der zwischen zwei gleichrangigen Eltern wählen müsste, rät.

**Damit sind von 47 Fundstellen noch sechs offen** — `aktivitaeten` in zwei
Funktionen, ein zweiter Aufruf in `mail-anhaenge-diagnose`, `kontakte` in
`expose-freigabe`, `news_briefings` und die onOffice-Diagnose, die mit der
Anbindung ohnehin wegfällt. Jede braucht eine eigene Quelle im Quelltext.

**Nebenbei:** die erste Fassung der Prüfung sah nur `insert`, nicht `upsert`.
Drei Fundstellen mehr kamen dabei heraus, darunter die Merkliste des
Neubauportals.

---

## Laufzeit, Provision und Fristen gehören zur Vorlage (28.09.2026)

**Anweisung:** „Wenn wir die Maklervertrag-Vorlage hochladen, da muss auf
jeden Fall Laufzeit und Provision auch noch definiert werden. Orientiere dich
an der E&P World, was wir dort für Felder haben. Gleiches gilt für
Reservierung und Objektnachweis."

**Nachgesehen, was die Vorlage hat** — nicht erfunden:

| Dokument | Felder | woher der Vorschlag heute kommt |
|---|---|---|
| Maklervertrag | `laufzeit_monate`, `provision`, `provisionsmodell` (Teilung / Innen / Außen) | `portal_einstellungen`: 6 Monate, 3,57 %, Teilung |
| Objektnachweis | `provision` | fest im Quelltext: `"3,00"` |
| Reservierung | Gebühr, Dauer, Zahlungsfrist | fest im Quelltext: 1000 €, 30 Tage, 5 Werktage |

Die Erzeugung ersetzt diese Werte im Word-Text. Lädt ein Makler seine
**eigene** Vorlage hoch, steht darin sein eigener Satz — und die Zahl muss
dazu passen. Deshalb gehören die Werte an die Vorlage.

**Vier Stufen, die innerste gewinnt:** eingebaut → Vorgaben des Mandanten →
Vorlage des Mandanten → Vorlage der Gesellschaft. Wer nichts einstellt,
bekommt genau das bisherige Verhalten. Gerechnet wird in der Datenbank
(`vorlage_vorgaben`), nicht in der Oberfläche — sonst gäbe es die Regel
zweimal.

Eine neue Fassung einer Vorlage **erbt die Werte der alten**. Sonst stünden
nach jedem Austausch des Word-Textes wieder die eingebauten Zahlen da, und
niemand merkte es, bis ein Vertrag mit sechs statt zwölf Monaten beim
Eigentümer liegt.

### Ein Fehler, der dem im Weg stand

`portal_einstellungen` trägt seit `fork_05` eine `mandant_id` — aber ihr
**Primärschlüssel war `(schluessel)`**. Eine Zeile je Schlüssel, für die
ganze Plattform. Die Oberfläche schreibt mit
`upsert(..., onConflict: "schluessel")`: **der zweite Mandant, der seine
Provision einstellt, überschreibt die des ersten.**

`fork_17` hat genau diese Klasse Fehler aufgeräumt und einen Wachposten
dagegen gestellt — der prüft aber nur `contype = 'u'`, also
Eindeutigkeitsregeln. Ein Primärschlüssel ist `contype = 'p'` und ist ihm
durchgegangen. Beides ist nachgezogen; der Wachposten sieht jetzt beide
Arten, mit fünfzehn benannten Ausnahmen (Schlüssel auf einer bereits
mandantengebundenen Elterntabelle, und die leeren onOffice-Tabellen).

---

## Markierte Felder statt Platzhalter-Syntax (28.09.2026)

**Frage:** „Können wir das so konzipieren, dass die Kunden eine Word- oder
eine PDF-Vorlage hochladen und dann in einem gesonderten Feld die Flächen
oder Bereiche markieren, die zu dem jeweiligen Eingabefeld gehören?"

**Ja — und den Mechanismus gibt es hier schon einmal.** Das Signaturverfahren
legt in `signatur_vorgaenge.unterschrift_positionen` genau solche Rechtecke
ab (Seite, x, y, Breite, Höhe) und stempelt die Unterschrift beim Abschluss
hinein. `fork_24` verallgemeinert das: nicht nur die Unterschrift, sondern
jedes Feld — und nicht vom Programm gerechnet, sondern vom Makler markiert.

**Zwei Zeiger-Arten, weil die Formate verschieden sind.**

| | |
|---|---|
| `rechteck` | **PDF.** Seite und Koordinaten. Der Makler zieht das Rechteck auf der angezeigten Seite auf. |
| `textstelle` | **Word.** Eine `.docx` hat keine Koordinaten, sie ist XML; wo ein Absatz auf der Seite landet, entscheidet erst Word beim Umbrechen. Ein aufgezogenes Rechteck ließe sich nicht zurückrechnen. Stattdessen markiert der Makler die Stelle im Text, und gespeichert wird Suchtext plus Nummer des Vorkommens. |

Das zweite ist genau das, was die Erzeugung heute tut — nur waren die
Suchtexte fest auf den Mustervertrag der Referenz verdrahtet, samt Namen,
Anschriften und Ausweisnummern echter Vertragsparteien (`docs/OFFEN.md`).
Sie zu Daten zu machen löst beides auf einmal.

**Überlauf:** Passt ein Wert nicht ins Rechteck, wird die Schrift
verkleinert, bis er passt (Entscheidung des Auftraggebers). Deshalb gibt es
`schriftgroesse` als Ausgangswert und keine Abschneide-Einstellung — ein
abgeschnittener Wert in einem Vertrag wäre schlimmer als eine kleinere
Schrift.

**Der Katalog der Felder steht in der Datenbank** (`vorlagen_feld_katalog`),
nicht in der Oberfläche: Markierung und Erzeugung müssen dieselbe Liste
sehen. Ein Feldname, den die Art nicht kennt, wird beim Speichern abgewiesen
statt still geschluckt — eine Markierung, die nichts tut, vermisst niemand.

### Zwei Löcher, die dabei aufgefallen sind

**Eine Markierung an der Vorlage eines fremden Mandanten ging durch.** Der
Grund ist lehrreich: `mandant_id` trägt den Standardwert
`aktuelle_mandant_id()`, ist beim Einfügen also schon mit dem **eigenen**
Mandanten gefüllt. Der Wachposten aus `fork_22` lässt sie deshalb in Ruhe,
und die restriktive Richtlinie sieht den eigenen Mandanten und ist zufrieden
— während `vorlage_id` auf eine fremde Vorlage zeigt. Der Wachposten
vergleicht jetzt beide.

**Ein NULL-Befund galt in zehn Prüfungen als bestanden.** `where not
bestanden` schließt NULL aus, und `case when bestanden then 'ok'` zeigte
zwar „FEHL" an — gezählt wurde es trotzdem nicht. Aufgefallen an einer
Prüfung, die unter RLS einen Wert nicht mehr lesen konnte und deshalb NULL
lieferte. Alle zehn Dateien prüfen jetzt `bestanden is not true`;
nachgewiesen an einem absichtlich unklaren Befund.

**Dieselbe Prüfung lief außerdem gar nicht unter RLS** — sie setzte zwar
`request.jwt.claims`, aber nie `set local role authenticated`, und
`aktuelle_mandant_id()` liest ohnehin über `auth.uid()` aus `profiles`. Sie
war grün, weil sonst nichts in der Tabelle stand.

---

## Mehrere Beteiligte: ein Block, nicht viele Felder (28.09.2026)

**Frage:** „Was machen wir, wenn es eine Gemeinschaft ist, wo wir mehrere
Kontaktadressen eintragen müssen?"

Ein markiertes Rechteck ist **ein** Platz. Wie viele Erben ein Vertrag hat,
weiß beim Markieren niemand. Die Vorlage hat darauf längst eine Antwort, und
sie ist die richtige: `buildVerkaeuferBlock()` setzt aus N Beteiligten
**einen mehrzeiligen Textblock** zusammen —

```
Erbengemeinschaft

Erbe 1: <Name>
<Straße>
<PLZ Ort>

Erbe 2: <Name>
…
```

— und der steht an einer Stelle im Dokument. Genauso bei Eheleuten
(„Eheleute" plus gemeinsamer Name) und bei einer Firma („vertreten durch",
Registernummer).

**Also markiert der Makler nicht „den Namen", sondern „den Block".** Jedes
Feld im Katalog nennt jetzt seine Gruppe, und jede Beteiligten-Gruppe hat
genau ein Block-Feld.

**Entweder-oder, serverseitig erzwungen:** wer den Block markiert, markiert
nicht zusätzlich die Einzelfelder derselben Gruppe. Beides zusammen stünde
doppelt im Dokument, und welches gewänne, wäre Zufall. Felder anderer Gruppen
stören nicht.

**Der Überlauf im PDF, jetzt zu Ende gedacht.** „Schrift verkleinern, bis es
passt" führt bei fünf Erben in einem Kasten für einen Namen zur
Unlesbarkeit. Deshalb `mindest_schriftgroesse` (Vorgabe 7 pt): bis dahin wird
verkleinert, darunter wandert der Rest auf eine **Anlage**, und im Kasten
steht ein Verweis. Abgeschnitten wird nie — ein fehlender Beteiligter in
einem Vertrag ist ein Rechtsmangel, keine Schönheitsfrage.

Im Word stellt sich die Frage nicht: dort fließt der Text um.

---

## Die Markierungs-Oberfläche (28.09.2026)

Ein Bauteil für beide Wege, weil sie sich nur im Zeiger unterscheiden.

**PDF:** die Seiten werden mit `pdf.js` auf eine Leinwand gezeichnet (1,5-fach
— groß genug, um ein Kästchen genau zu treffen, klein genug, dass zehn Seiten
den Rechner nicht anhalten). Der Makler zieht ein Rechteck; gespeichert wird
in **PDF-Punkten mit Ursprung unten links**, weil `pdf-lib` beim Stempeln so
rechnet. Bereits markierte Felder liegen als goldene Rahmen über der Seite.

**Word:** die Absätze werden aus `word/document.xml` gelesen und angezeigt.
**Nicht über `mammoth`** — das glättet den Text fürs Lesen, gesucht wird aber
später im XML. Was der Makler markiert, muss genau das sein, was dort steht;
sonst findet die Erzeugung nichts und sagt nichts. Kommt die markierte Stelle
mehrfach vor, fragt die Oberfläche, welche gemeint ist.

Ein Klick unter fünf Punkten Kantenlänge gilt als Versehen, nicht als
Rechteck. Schon markierte Felder verschwinden aus der Auswahlliste.

**Eine Vorlage darf jetzt auch ein PDF sein** — `dateiformat` wird beim
Hochladen aus der Dateiendung bestimmt und entscheidet, welcher Weg gilt.

**Beim Bauen gestolpert, weil es wiederkommt:** der Ersatztext einer Regel in
`scripts/oberflaeche-zerlegen.py` geht durch `re.subn`, und dort ist ein
Rückstrich eine Anweisung, kein Zeichen. Das `\s` in einem regulären Ausdruck
des eingefügten JavaScript ließ den Generator mit „bad escape" abbrechen. Im
Ersatz müssen Rückstriche verdoppelt stehen.

---

## Ein leergefallener Suchtext hätte jeden Vertrag zerlegt (28.09.2026)

Beim Lesen von `fillMaklervertrag` gefunden, bevor ich die Erzeugung umbaue.
Die Neutralisierung ersetzt die Anschrift der Referenz durch `""` — auch
dort, wo sie als **Suchtext** stand:

```js
r = r.split("<Anschrift der Referenz>").join(strasse)   // vorher
r = r.split("").join(strasse)                           // nachher
```

`"abc".split("").join("X")` ergibt `"aXbXc"`. Der Ausdruck hätte also
zwischen **jedes Zeichen** von `word/document.xml` die eigene Straßenangabe
geschrieben. Aus dem Vertrag wäre Buchstabensalat geworden — ohne
Fehlermeldung, ohne Absturz, mit einer Datei, die sich herunterladen lässt.

Zwei Fundstellen: Maklervertrag und Objektnachweis. Der Ausdruck fällt
ersatzlos weg; die Straße setzt ohnehin die Zeile darunter über den
Platzhalter `{strasse}`.

**Warum es niemandem aufgefallen ist:** die beiden eingebauten Word-Dateien
sind seit `fork_12` geleert, und ohne Vorlage kommt die Funktion nie so weit.
Der Fehler hätte genau dann zugeschlagen, wenn der erste Makler seine eigene
Vorlage hochlädt.

`tests/oberflaeche-rauchtest.py` hält jetzt fest, dass kein leerer Suchtext
zurückkommt — mit einer erlaubten Ausnahme, dem Alphabet der
Buchstabenhäufigkeit, das absichtlich in Einzelzeichen zerfällt.
Nachgewiesen an einem eingefügten zweiten Vorkommen.

---

## Die Vorlage füllen — an den markierten Stellen (28.09.2026)

Der Gegenpart zur Markierung. Vier Bauteile, und die drei mit Rechnung darin
sind absichtlich **ohne Browser prüfbar** — `tests/vorlagen-fuellen.js` holt
sie sich aus `src/app/anwendung.js` und lässt sie in einem Sandkasten laufen.

**`immoTrefferInLaeufen`** — die Hürde beim Word. Word zerlegt einen Satz
gern in mehrere `<w:t>`-Läufe, mitten im Wort, wenn die Rechtschreibprüfung
dazwischenkam. „Dauer von 6 Monaten" steht im XML dann als
`["Dauer von ", "6 Mo", "naten"]`. Die Funktion sagt, über welche Läufe sich
das *n*-te Vorkommen erstreckt und was vorn und hinten stehen bleibt. Die
Zählung läuft über Absatzgrenzen hinweg — sonst träfe „Musterstadt" den
falschen Satz.

**`immoZeilenUmbrechen`** — Umbruch auf die Breite des Kastens. Ein Wort, das
allein schon zu breit ist, wird **nicht** zerschnitten: ein in der Mitte
gebrochener Name wäre schlimmer als ein Überstand.

**`immoPasstEs`** — verkleinern in halben Punkten bis zur Untergrenze. Was
auch dann nicht passt, liefert kein Ergebnis, und der Aufrufer schreibt den
Wert auf die Anlage statt ihn abzuschneiden.

**`immoVorlageFuellen`** — der Weg: aktive Vorlage suchen (Gesellschaft vor
Mandant, dieselbe Reihenfolge wie bei den Vorgaben), Markierungen laden,
Datei holen, je nach Format stempeln oder ersetzen.

**Zwei Fälle, die ausdrücklich abbrechen statt still nichts zu tun:** keine
Vorlage hinterlegt, und eine Vorlage ohne jede Markierung. Beides mit dem
Hinweis, wo es einzurichten ist. Ein Dokument, das unverändert
herauskommt und wie ein fertiges aussieht, ist die schlechtere Antwort.

**Mehrzeiliges im Word** wird zu `<w:br/>`, nicht zu einem `\n`-Zeichen —
sonst stünde die Erbengemeinschaft in einer Zeile.

Dreizehn Prüfungen, darunter der über drei Läufe zerschnittene Treffer, das
zweite von drei Vorkommen, und die Erbengemeinschaft, die auch bei 7 pt nicht
in den Kasten passt.

---

## Die Anker sind weg — für zwei der drei (28.09.2026)

`fillMaklervertrag` und `fillObjektnachweis` holen ihren Inhalt jetzt aus
`immoVorlageFuellen()`. Damit fallen **49 der 56 wörtlichen Anker** weg,
darunter sämtliche Namen, Anschriften, Geburtsdaten und **Ausweisnummern**
der Vertragsparteien aus den Musterverträgen.

Die Namenslogik für den Dateinamen bleibt — sie war nie das Problem.

**Zwei Kommentare mussten noch hinterher.** Sie erklärten am Beispiel eines
echten Paares aus den Musterdaten, wie zwei Eheleute zu einem Namen
zusammengefasst werden. Die Erklärung ist geblieben, das Paar ist gegangen.
Und in meinem eigenen neuen Kommentar stand der Name noch einmal — beim
Beschreiben dessen, was ich gerade entfernte. `CLAUDE.md` nennt „Kommentar"
ausdrücklich; das gilt auch für den Kommentar, der die Bereinigung erklärt.

**Offen bleibt `fillMietvertrag`** mit sechs Ankern. Der Grund ist nicht
Bequemlichkeit: `vertragsvorlagen.art` kennt den Mietvertrag nicht, er hat
also gar keinen Weg über eine eigene Vorlage. Das braucht eine eigene
Migration mit eigenem Feldkatalog — steht in `docs/OFFEN.md`.

**Die Blockliste wächst erst mit.** Die verbliebenen Ortsangaben jetzt schon
aufzunehmen würde das Gate rot färben, solange `fillMietvertrag` sie noch
trägt — ein Gate, das man abschalten muss, um arbeiten zu können, wird
abgeschaltet. Sie kommen mit dem Umbau des Mietvertrags dazu.

---

## Auch der Mietvertrag, und damit sind alle Anker weg (28.09.2026)

`fork_26` nimmt `mietvertrag` als fünfte Vorlagenart auf. **Zwei
Beteiligten-Blöcke statt einem:** Vermieter *und* Mieter können Eheleute oder
eine Erbengemeinschaft sein — die Tabelle führt für beide ein
`vermieter_erben` beziehungsweise `mieter_erben`. Die Regel „entweder der
Block oder die Einzelfelder" gilt je Gruppe und trug das ohne Änderung; ein
Wachposten hält fest, dass keine Gruppe zwei Blöcke bekommt.

**Keine Vorgabewerte für den Mietvertrag.** Welche hier sinnvoll wären —
Kündigungsausschluss, Kaution in Monatsmieten — ist eine fachliche Frage, die
niemand gestellt hat. Lieber keine Vorgabe als eine erfundene.

### Was beim Aufräumen noch zum Vorschein kam

Nachdem die Anker weg waren, konnte die Blockliste endlich um die Orte aus
den Musterverträgen wachsen. Und prompt fand sie vier weitere Nester, die mit
der Dokumenterzeugung nichts zu tun hatten:

| Fundstelle | |
|---|---|
| Platzhalter der Mietvertrags-Maske | Straße, Stadt, Kreditinstitut und **zwei Namen** eines echten Paares — dem Nutzer direkt vor Augen |
| Stilbeispiele der KI in `generate-text` | die vollständige Beschreibung eines echten Objekts samt Ort, Landkreis und Naturpark. Sie steht im Auftrag an das Sprachmodell und prägt **jeden** erzeugten Text |
| Vorgabewerte der Marketingkachel | Ort und Koordinaten der Referenzregion |
| Ortssuche im Objektportal | ein Ort der Referenz als Beispiel |

Alle ersetzt — der **Stil** der KI-Beispiele war das Gewollte, nicht das
Objekt, also dieselbe Machart mit erfundenen Angaben.

**Die Blockliste steht jetzt an beiden Stellen**, in `scripts/neutral.sh` und
in `tests/funktionen-unveraendert.py`. Dass es zwei sind, ist keine schöne
Lösung — es ist mir erst aufgefallen, als die eine grün war und die andere
rot. Vermerkt in `docs/OFFEN.md`.

---

## Keine Einfügung ohne Mandanten mehr (28.09.2026)

Von den 47 Fundstellen, die am selben Tag aufgefallen waren, sind **alle
geschlossen**. `tests/oeffentlich-insert-mandant.py` führt jetzt eine leere
Liste — jede neue Fundstelle macht das Gate rot, nicht nur die Liste länger.

| | |
|---|---|
| 16 Tabellen | Wachposten aus `fork_22` |
| 2 Tabellen | `fork_27`, siehe unten |
| Rest | im Quelltext, an der Quelle des Vorgangs |

**Eine eigene Begründung musste ich zurücknehmen.** Zu `fork_22` hatte ich
geschrieben, `aktivitaeten` bekomme keinen Wachposten, weil die Zeile
„wahlweise an einem Eigentümer oder an einem Vertrag" hänge und ein
Wachposten zwischen zwei gleichrangigen Eltern raten müsste. Das war zu
vorsichtig: die Funktion nimmt ihre Argumente **paarweise und in einer
Reihenfolge** — Eigentümer, dann Vertrag, dann Empfänger. Das ist eine Regel,
kein Raten. Bei `immobilie_datei` war es schlicht Unaufmerksamkeit; eine
Fundstelle übergab ein vorbereitetes Objekt (`insert(neu)`) und kam in der
Durchsicht nicht vor.

**Drei brauchten wirklich eine eigene Quelle:**

- **`expose-freigabe`** — ein Kontakt hat keinen Elternsatz, er *ist* einer.
  Der Interessent gehört dem Mandanten des **Objekts**, dessen Exposé er
  herunterlädt.
- **`news-briefing-erstellen`** — das Briefing ist für alle dasselbe,
  Branchennachrichten sind es ja auch. Erzeugt wird es **einmal** (ein
  KI-Aufruf), gespeichert je Mandant. Dabei fiel ein zweiter Fehler auf: der
  `upsert` zielte noch auf `briefing_datum` allein, während `fork_17` die
  Eindeutigkeit längst auf `(mandant_id, briefing_datum)` umgestellt hatte —
  er hätte gar keine Regel mehr gefunden und wäre abgebrochen. Und die
  Idempotenzprüfung mit `maybeSingle()` hätte ab dem zweiten Mandanten
  mehrere Zeilen getroffen.
- **`portal-ftp-diagnose`** — der Eintrag gehört dem Mandanten des
  Portalzugangs, der geprüft wurde.

**Für Gate 2 ist dieser Punkt damit erfüllt.** Offen bleiben die
19 öffentlichen Endpunkte, die beim **Lesen** noch nicht begrenzen —
`tests/funktionen-oeffentlich.py` führt darüber Buch.

---

## Das Neubauportal verschickte Post über ein fremdes Postfach (28.09.2026)

Beim Durchgehen der 19 öffentlichen Endpunkte gefunden. `holePostfach()` nahm
**„das erste aktive Postfach"** — und dieselbe Auswahl steht in
`projekt-interaktion`, `projekt-login` und `projekt-upload`.

Mit einem Mandanten fällt das nicht auf. Ab dem zweiten geht die Einladung zum
Kundenbereich des einen Bauträgers über den **SMTP-Zugang des anderen** hinaus,
mit dessen Absenderadresse im Von. Das ist kein Schönheitsfehler: der Empfänger
sieht einen fremden Absender, und der fremde Mandant sieht den Versand in
seinem Postfach.

Alle drei nehmen jetzt das Postfach des eigenen Mandanten — und **ohne
Mandanten gar keines**. Eine Mail, die nicht rausgeht und im Protokoll steht,
ist besser als eine mit falschem Absender.

Damit der Mandant an den Aufrufstellen überhaupt zur Hand ist, bringen ihn
jetzt auch die geladenen Zeilen mit: das Projekt bei der Selbstregistrierung,
der Zugang bei allem Weiteren.

**Offen bleibt der Zugang über den Slug.** Seit `fork_17` ist
`projekte.slug` nur noch **je Mandant** eindeutig, und die öffentliche
Projektadresse trägt nichts Mandantenspezifisches. Zwei Bauträger mit einem
Projekt „am-park" wären nicht zu unterscheiden — `maybeSingle()` bricht dann
ab, was immerhin laut ist statt falsch. Die saubere Lösung wäre eine Adresse,
die den Mandanten mitführt; das ist eine Produktentscheidung, keine
Reparatur. Steht in `tests/mandant-nachzug.py`.

---

## Das Exposé verriet fremde Impressen und änderte fremde Kontakte (28.09.2026)

`expose-freigabe` ist der öffentlichste Endpunkt, den wir haben: jeder
Interessent, der ein Exposé herunterlädt, landet dort. Er las an sieben
Stellen ohne Mandantengrenze.

- **Das Impressum.** `firma_stammdaten` wurde über `slug = "standard"`
  geholt. Seit `fork_17` ist der Slug nur noch **je Mandant** eindeutig —
  das Exposé von Makler A hätte Firmenname, Anschrift, Registergericht, HRB,
  Geschäftsführer und USt-ID von Makler B tragen können. Ein falsches
  Impressum unter einem Exposé ist nicht nur peinlich, es ist eine
  Falschangabe gegenüber dem Interessenten.
- **Die Landing-Einstellung** aus `portal_einstellungen` — seit `fork_23`
  ebenfalls je Mandant — steuerte den Ablauf mandantenübergreifend.
- **Drei Zugriffe auf `kontakte` suchten allein über die E-Mail-Adresse.**
  Der schlimmste war ein **UPDATE**: Wer bei Makler A ein Exposé herunterlud
  und dabei den Newsletter bestätigte, bekam das Häkchen
  `newsletter_opt_in` auch am Kontaktsatz von Makler B gesetzt — samt
  Quellenangabe zu einem Objekt, das Makler B nie hatte. Eine
  Einwilligung, die der Betroffene diesem Makler nie gegeben hat, in dessen
  Datenbestand geschrieben: das ist der Fall, den die Mandantentrennung
  verhindern soll.
- Dazu die Prüfung auf eine vorhandene `newsletter_anmeldungen`-Zeile und
  beide `immobilien`-Selects, die den Mandanten gar nicht erst mitluden.

Alle sieben hängen jetzt am Mandanten der Immobilie. Fehlt der — was nach
`fork_22` nicht mehr vorkommen sollte —, wird gegen eine unmögliche
Kennung gefiltert; lieber kein Impressum als ein fremdes.

`tests/funktionen-oeffentlich.py` führt `expose-freigabe` damit unter
*abgesichert*. `rundgang-oeffentlich` und `bewerbertest-abrufen` sind beim
Durchlesen als **unbedenklich** herausgefallen: sie geben nur heraus, was
am mitgebrachten Token hängt, und lesen nichts daneben. Bleiben
**16 offene** Endpunkte.

---

## Zwei tokengebundene Endpunkte, zwei verschiedene Lücken (28.09.2026)

**`signatur-token-validieren`** war die harmlosere von beiden — und trotzdem
seit `fork_08` schlicht kaputt. Geschrieben wird das Vertrags-PDF von
`signatur-vorgang-starten` und `signatur-unterschreiben`, beide mit der
Storage-Hülle, also unter `{mandant}/…`. Gelesen wurde es hier ohne Hülle,
unter dem nackten Pfad. Der signierte Link zeigte auf eine Datei, die es an
dieser Stelle nicht gibt. Die Funktion bekommt jetzt dieselbe Hülle und den
Mandanten aus dem Vorgang.

Dazu die zweite Hälfte: der Vertrag hing am Vorgang über eine bloße Kennung.
Ein Vorgang, der auf ein fremdes Dokument zeigt, hätte dessen Adresse und
Bezeichnung an jeden mit dem Token herausgegeben. Eine Kennung ist kein
Nachweis; jetzt muss der Mandant übereinstimmen.

**`eigentuemer-zugang-anfordern`** war das Gegenteil: er fängt mit einer
E-Mail-Adresse an, und die gilt quer durch alle Mandanten. Gesucht wurde
damit alles — der Eigentümersatz, die Person, der Ansprechpartner. Und als
Rückfall, wenn kein Ansprechpartner hinterlegt war: `.eq("role", "chef")
.limit(1)`, über die ganze Plattform. Name, E-Mail-Adresse und Telefonnummer
eines wildfremden Geschäftsführers standen dann in der Mail an einen
Eigentümer, der ihn nie beauftragt hat.

Eindeutig ist genau eine Sache: das **Konto**. Eine Adresse, ein Login.
Also wird jetzt zuerst das Konto gesucht, daraus der Mandant gelesen, und
alles Weitere bleibt darin — Anrede, Ansprechpartner, Aktivität,
Einladungsvermerk. Findet sich kein Mandant, wird nichts versendet; die
Antwort ist ohnehin immer `{ ok: true }`, der Anfragende merkt keinen
Unterschied.

Das Stundenkontingent von 30 Versendungen war ebenfalls plattformweit. Das
ist keine Drosselung mehr, sondern eine Sperre, die ein Mandant dem anderen
zuziehen kann, ohne es zu merken — es zählt jetzt je Mandant und steht
deshalb hinter der Mandantenbestimmung. Die Grenze je Adresse (zehn Minuten)
bleibt, wo sie war: sie schützt die betroffene Person, und die ist dieselbe,
egal bei welchem Makler.

**Nebenbefund im Erzeuger.** Die Zeilenbremse in
`scripts/neutralisieren-funktionen.py` erlaubt einer FORK-Regel, die Vorlage
zu erweitern — aber das Kennzeichen `erweitert` wurde nur in der Schleife
über `ERSETZUNGEN` gesetzt, nicht in der über `NACHBESSERN`. Solange jede
erweiterte Funktion ohnehin eine Regel aus der ersten Liste abbekam, fiel es
nicht auf. Jetzt setzen beide Schleifen es.

Damit: **abgesichert 11, unbedenklich 3, noch offen 14.**
