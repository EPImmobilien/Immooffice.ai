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
