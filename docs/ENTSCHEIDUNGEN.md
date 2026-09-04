# Entscheidungen

Fortlaufendes, datiertes Protokoll aller Festlegungen, die ohne Rückfrage
getroffen wurden — verlangt von [`docs/AUTONOMIE.md`](AUTONOMIE.md), Abschnitt 0.1.

Jeder Eintrag nennt die Frage, die Entscheidung und einen Satz Begründung.
Der Auftraggeber kann jede Zeile überschreiben; dann wird sie hier durchgestrichen
und die neue Festlegung darunter ergänzt.

---

## 03.09.2026

### E-2026-09-03-01 — Dateinamen des Auftragstexts auf den Bestand abbilden

**Frage:** Der Auftragstext verweist auf `docs/FUNKTIONEN.md`,
`docs/NEUTRALITAET.md`, `scripts/check-neutral.sh`, `docs/DATENMODELL.md` und
`docs/OPENIMMO_MAPPING.md`. Diese Dateien gibt es nicht.

**Entscheidung:** Die Inhalte existieren unter anderen Namen; die Zuordnung steht
in `docs/AUTONOMIE.md`, Abschnitt „Einordnung“. Es werden **keine** Dateien
umbenannt oder doppelt angelegt.

**Begründung:** Eine Umbenennung würde alle bestehenden Querverweise brechen,
ohne inhaltlich etwas zu gewinnen.

### E-2026-09-03-02 — Es bleiben sechs Rollen

**Frage:** Der Auftragstext nennt in T1 die Rollen `chef`, `makler`, `assistenz`,
`buchhaltung`. Masterprompt und Datenbank kennen sechs: Inhaber, Administrator,
Makler, Assistenz, Marketing, Nur-Lese-Zugriff.

**Entscheidung:** Die sechs Rollen bleiben. „Chef“ entspricht `inhaber`.
„Buchhaltung“ wird nicht als siebte Rolle eingeführt, sondern über die bereits
vorhandene Feinjustierung `benutzer.rechte_uebersteuerung` abgebildet: ein
Zugang mit der Rolle `nur_lesen` und der Abweichung `abrechnung: lesen` sieht
genau Abo, Rechnungen und Credit-Verbrauch.

**Begründung:** Rollen sind Architektur — dort entscheidet laut CLAUDE.md und
laut `docs/AUTONOMIE.md` der Masterprompt. Eine siebte Rolle würde außerdem die
Rechtematrix, die RLS-Policies und die pgTAP-Tests anfassen, um etwas
abzubilden, wofür die Feinrechte gebaut wurden.

### E-2026-09-03-03 — onOffice-Connector bleibt gesperrt

**Frage:** Abschnitt 5.2 des Auftragstexts verlangt einen onOffice-Connector.
Die Abgrenzung in `CLAUDE.md` — dort ausdrücklich „nicht verhandelbar“ — führt
die onOffice-Synchronisation unter „nicht übernehmen“, und `scripts/marken-scan.sh`
lässt das Wort im ausgelieferten Code nicht zu.

~~Erste Festlegung am selben Tag: Der Connector bleibt gesperrt, weil über den
Scope der Masterprompt entscheidet.~~

**Entscheidung (überschrieben durch `docs/SCOPE.md`, Abschnitt G, am selben
Tag):** onOffice wird als Connector in Phase 2 gebaut. Übernommen wird nur die
Abgleichlogik — insbesondere die Erkenntnis der Referenz, dass die
onOffice-Schnittstelle einen ganzen Aufruf mit Fehler 141 abweist, sobald ein
einziger Feldname unbekannt ist, und Feldnamen deshalb vorab einzeln geprüft
werden. Keine Zugangsdaten, keine Kennungen, kein Hinweis auf die Instanz der
Referenz. `CLAUDE.md` und `scripts/marken-scan.sh` sind entsprechend angepasst.

**Begründung:** `docs/SCOPE.md` ist ausdrücklich das Dokument, das die Frage „ist
Modul X im Scope“ entscheidet, und es ist jünger als die Ausschlussliste.

### E-2026-09-03-12 — Passwortlänge bleibt bei 12 Zeichen

**Frage:** R5 nennt mindestens 10 Zeichen; die Anwendung verlangt nach
Masterprompt Abschnitt 16 zwölf.

**Entscheidung:** Es bleibt bei zwölf Zeichen.

**Begründung:** Sicherheitsvorgaben sind Architektur, und die strengere Regel
gilt bereits. Zwei Zeichen weniger brächten niemandem etwas.

### E-2026-09-03-14 — Migrationsstand des Repositories an das Produktivprojekt angeglichen

**Befund:** Die Tabelle `supabase_migrations.schema_migrations` im Projekt
`usguiggfciavwzkdfjgt` kennt 26 Versionen, das Repository kannte 23 — und nur
12 Versionsnummern stimmten überein. Drei ausgerollte Migrationen fehlten im
Repository ganz (`einladungen_und_benutzerverwaltung`, `eigenes_konto_lesbar`,
`keine_selbstermaechtigung_korrigiert`), neun trugen andere Zeitstempel als in
der Datenbank, und die zwei Migrationen des Vorentwurfs vom 17.07. gab es nur
dort. Ein `supabase db push` hätte damit unbekannte Fernversionen gemeldet und
bereits angewendete Migrationen erneut versucht.

**Entscheidung:** Die drei fehlenden Migrationen wurden mit ihrem
Datenbankinhalt und ihrer Versionsnummer nachgetragen, die neun abweichenden
Dateien auf die Versionsnummern der Datenbank umbenannt (`git mv`, Inhalt
unverändert), und für die beiden Vorentwurfs-Versionen liegen Platzhalter
ohne Wirkung vor. Die Reihenfolge bleibt dieselbe.

**Begründung:** Die Datenbank ist die Wahrheit über das, was ausgerollt ist;
das Repository muss sie abbilden, nicht umgekehrt. Ein Neuschreiben der
Datenbankhistorie (`migration repair`) wäre ein Eingriff in das
Produktivprojekt ohne Not.

### E-2026-09-03-15 — Datenbank-Nachweise laufen lokal ohne Supabase

**Entscheidung:** `scripts/db-lokal.sh` startet eine eigene Postgres-Instanz,
bildet mit `scripts/db-lokal-shim.sql` die Supabase-Umgebung nach (Rollen,
`auth.uid()`, `storage`, `pgcrypto`, Standardrechte), spielt alle Migrationen
ein und lässt jede Datei unter `supabase/tests/` laufen. Der Lauf ist Teil der
GitHub-Actions-Prüfung.

**Begründung:** Ohne Zugangsdaten zum Projekt liefen die Nachweise bisher gar
nicht — und die Migrationskette wurde nie auf leerem Grund geprüft. Die
Nachbildung ist kein Supabase, aber sie fängt Reihenfolge-, Rechte- und
RLS-Fehler, bevor sie das Projekt erreichen. Der letzte Nachweis läuft
weiterhin gegen das echte Projekt.

### E-2026-09-03-16 — Warteschlange als Tabelle mit `SKIP LOCKED`, nicht pgmq

**Frage:** `ARCHITECTURE.md` Abschnitt 3 nennt pgmq als Warteschlange plus eine
Job-Tabelle für den Zustand. pgmq ist im Projekt verfügbar, aber nicht
installiert, und in der lokalen Prüfumgebung gar nicht zu haben.

**Entscheidung:** Die Tabelle `jobs` ist die Warteschlange. Beanspruchen läuft
über `FOR UPDATE SKIP LOCKED` mit Sichtbarkeitsfrist (`sperre_bis`); ein
Wächter gibt liegen gebliebene Aufträge frei oder erklärt sie nach dem letzten
Versuch für gescheitert. Wiederholung mit wachsendem Abstand, Verlauf je
Versuch, Freigabe reservierter Credits beim Scheitern und Einlösen beim Erfolg
— alles in denselben Funktionen.

**Begründung:** Die drei Gründe der Architekturentscheidung (abfragbarer
Zustand, Credits in derselben Transaktion, Historie je Versuch) sind mit einer
Tabelle vollständig erfüllt; pgmq hätte den Zustand nur ein zweites Mal
gehalten. Ohne Erweiterung läuft alles in `scripts/db-lokal.sh` und in GitHub
Actions. Steigt das Volumen, lässt sich `jobs_beanspruchen()` auf pgmq
umstellen, ohne dass Arbeiter oder Anwendung es merken.

### E-2026-09-03-17 — Taktgeber ist eine geplante Netlify-Funktion

**Entscheidung:** `netlify/functions/jobs-worker.mts` ruft minütlich
`/api/jobs/ausfuehren` mit `JOB_GEHEIMNIS`. pg_cron + pg_net bleiben als
Alternative möglich (gleicher Endpunkt), sind aber nicht eingerichtet.

**Begründung:** Der Zeitplan lebt dann im Repository statt in einer
Datenbankzeile mit Klartext-Adresse und -Geheimnis; und Netlify hält das
Geheimnis ohnehin als Umgebungsvariable. Zusätzlich stößt jede Server Action
nach dem Einstellen den Arbeiter sofort mit kleinem Zeitbudget an — der Nutzer
wartet nicht auf die nächste Minute.

### E-2026-09-03-18 — Import legt Dubletten als eigene Datensätze an

**Entscheidung:** Die Vorschau vor der Übernahme zeigt Objekte mit gleicher
Anschrift wie ein vorhandenes Objekt an; übernommen werden sie trotzdem als
eigene Datensätze. Wiedererkennung läuft ausschließlich über die Zuordnung
Fremd-ID ↔ lokale ID je Integration.

**Begründung:** Zwei Wohnungen im selben Haus haben dieselbe Anschrift und
sind keine Dublette. Ein automatisches Zusammenführen würde Datensätze
verschmelzen, die nicht zusammengehören; die Entscheidung bleibt beim
Nutzer, der die Liste vorher sieht.

### E-2026-09-03-19 — Lesemodus wird in `intern.darf_schreiben()` erzwungen

**Entscheidung:** Nach der Testphase ohne Abo (S3), bei Kündigung oder Sperre
liefert `intern.darf_schreiben()` `false`. Damit greifen alle bestehenden
Schreib-Policies ohne Änderung; `zahlung_offen` bleibt aus Kulanz schreibbar.
Die Oberfläche zeigt nur noch, warum nichts gespeichert wird.

**Begründung:** Rechte werden serverseitig und in der Datenbank erzwungen —
ein Lesemodus, der nur Schaltflächen ausblendet, wäre kein Lesemodus.

### E-2026-09-03-20 — Preise sind Daten: Tabelle `preise` plus Stripe-IDs in der Datenbank

**Entscheidung:** Zusatzbenutzer und Credit-Pakete stehen in `preise`,
Tarife in `tarife`; die Stripe-Preis-IDs stehen daneben und werden von
`scripts/stripe-einrichten.mjs` angelegt und zurückgeschrieben. Die
`STRIPE_PREIS_*`-Umgebungsvariablen entfallen.

**Begründung:** Masterprompt Abschnitt 14: Preise, Limits und Credit-Werte
müssen über den Plattform-Admin änderbar sein und dürfen nicht im Code
verdrahtet werden. Umgebungsvariablen sind Code.

### E-2026-09-03-21 — Tarifwechsel und Kündigung über das Stripe-Abrechnungsportal

**Entscheidung:** Buchen läuft über Checkout, alles Weitere (Zahlungsmittel,
Rechnungen, Tarifwechsel mit anteiliger Berechnung, Kündigung zum
Periodenende) über das Abrechnungsportal. Die Anwendung erfährt jede Änderung nur
über den Webhook.

**Begründung:** S9 nennt das Abrechnungsportal ausdrücklich; eine eigene
Wechsellogik würde die anteilige Berechnung und die Steuerlogik von Stripe
nachbauen, ohne besser zu sein.

### E-2026-09-03-22 — Testphase: ein Benutzer, Einladung erst mit Tarif

**Frage:** Der Endtest in `docs/AUTONOMIE.md` Abschnitt 8 lädt „eine Kollegin
ein“, bevor das Abo abgeschlossen wird; der Masterprompt begrenzt die
Testphase auf einen Benutzer.

**Entscheidung:** Das Benutzerlimit gilt beim Einladen (nicht erst beim
Einlösen): In der Testphase ist kein zweiter Platz frei; die Meldung sagt, was
zu tun ist. Der Endtest läuft in der Reihenfolge Tarif buchen → einladen.

**Begründung:** Wer einladen kann, dessen Kollegin dann beim Einlösen
abgewiesen wird, erlebt den Fehler an der schlimmsten Stelle. Die Zahl der
Plätze ist eine Regel des Masterprompts.

### E-2026-09-03-23 — Der Tageslauf schaltet Zugänge über eine Transaktionsmarke ab

**Frage:** `abos_pruefen()` (Tageslauf, Dienstrolle) muss nach einem Downgrade
überzählige Zugänge abschalten. Der Trigger `intern.pruefe_benutzer_aenderung()`
erlaubt das nur Inhabern und Administratoren — der Tageslauf hat keine
Benutzersitzung und scheiterte daran (Nachweis `abo.sql`, Prüfung 29).

**Entscheidung:** `abos_pruefen()` setzt vor dem Abschalten die
Transaktionsmarke `intern.systemlauf = 'ja'` (`set_config(…, true)`, gilt nur in
dieser Transaktion) und löscht sie danach. Der Trigger lässt genau die Änderung
von `aktiv` durch, wenn die Marke gesetzt ist; alle anderen Regeln (Rollen,
Rechte, Inhaberschutz, eigener Zugang) bleiben unverändert.

**Begründung:** Die Alternativen wären schlechter: den Trigger abschalten
(Tabellensperre, Eigentümerrechte), die Dienstrolle pauschal freistellen (jeder
Aufruf mit Service-Key dürfte dann Zugänge abschalten) oder das Abschalten in
TypeScript nachbauen (Logik doppelt). Die Marke lässt sich über die API nicht
setzen — sie entsteht nur in einer SQL-Funktion, die allein die Dienstrolle
ausführen darf.

### E-2026-09-03-24 — Testphase des vorhandenen Mandanten verlängert

**Frage:** Im Projekt existiert ein Mandant, angelegt am 17.08.2026 vor dieser
Phase; seine Testphase war am 24.08.2026 abgelaufen. Mit dem Lesemodus (E-19)
wäre er beim Ausrollen sofort schreibgeschützt gewesen — ohne Möglichkeit, im
Testmodus einen Tarif zu buchen, weil die Stripe-Schlüssel fehlen.

**Entscheidung:** Die Testphase dieses einen Mandanten wurde beim Ausrollen um
30 Tage verlängert (bis 03.10.2026). Keine weiteren Datenänderungen, keine
Ausnahme im Code.

**Begründung:** Die Abnahme an Gate B soll mit einem arbeitsfähigen Mandanten
beginnen. Ein einmaliger, dokumentierter Eingriff in einen Datensatz ist
kleiner als eine Ausnahme im Lesemodus.

### E-2026-09-03-25 — „Abrechnungsportal“ statt „Kundenportal“

**Frage:** S9 nennt das Stripe-Portal für Zahlungsmittel, Rechnungen und
Tarifwechsel „Kundenportal“. Derselbe Begriff bezeichnet in `docs/SCOPE.md`
ein ausgeschlossenes Modul; der Marken-Scan meldet ihn im Code als entfallenes
Modul.

**Entscheidung:** Im Code, in der Oberfläche und in den eigenen Dokumenten
heißt das Stripe-Portal „Abrechnungsportal“ (bei Stripe „Customer Portal“).
Der Auftragstext in `docs/AUTONOMIE.md` bleibt unverändert.

**Begründung:** Ein Wort für zwei Dinge — eines davon ausdrücklich
ausgeschlossen — verwirrt bei jeder Prüfung. Der Scan bleibt streng; die
Umbenennung ist billig.

### E-2026-09-03-26 — Postfach spiegelt nur Text, Anhänge bleiben beim Anbieter

**Frage:** Was von einer E-Mail wird in ImmoOffice.ai gespeichert?

**Entscheidung:** Kopfdaten und Text (HTML wird beim Abruf in Text überführt),
Anhänge nur als Kennung, Name, Typ und Größe. Der Inhalt eines Anhangs wird
erst geholt, wenn jemand ihn in die Unterlagen eines Objekts übernimmt. Nach
der Aufbewahrungsfrist (Vorgabe 24 Monate, je Unternehmen einstellbar) bleibt
nur die Verknüpfung; beim Trennen werden nicht zugeordnete Nachrichten
gelöscht, zugeordnete anonymisiert.

**Begründung:** P4 und P7 des Auftragstexts, und Datensparsamkeit: Ein
Mail-Archiv wäre ein zweiter Client — genau das schließt P8 aus.

### E-2026-09-03-27 — OAuth-Rückruf an Benutzer und Mandant gebunden

**Frage:** Wie verhindert die Anwendung, dass ein Microsoft- oder Google-Konto
im falschen Mandanten oder bei einem fremden Benutzer landet?

**Entscheidung:** Der Zustand (`state`) des OAuth-Ablaufs trägt Benutzer,
Mandant, Anbieter und die Absicht (persönlich oder Unternehmen), ist mit dem
Verschlüsselungsschlüssel signiert und 15 Minuten gültig. Der Rückruf prüft
Signatur, Ablauf und die angemeldete Sitzung. Dauerhaft gespeichert wird nur
das Aktualisierungstoken — verschlüsselt, für Benutzer unlesbar.

**Begründung:** Der Rückruf kommt von außen; ohne Bindung an die Sitzung wäre
er eine Tür in fremde Mandanten.

### E-2026-09-03-28 — Antworten laufen über den Anbieter, nicht über den Plattformversand

**Frage:** Wie werden Antworten versendet, damit sie beim Absender im Ordner
„Gesendet“ liegen (P5)?

**Entscheidung:** Microsoft: `createReply` → Text setzen → `send` (Graph legt
die Nachricht ab und hält den Verlauf). Google: Versand als RFC-822-Quelltext
im selben Thread mit `In-Reply-To`. IMAP: Versand über SMTP und Ablage per
IMAP-APPEND im Ordner „Gesendet“. Vor jedem Versand entsteht erst die Zeile in
`nachrichten` — die Policy entscheidet, ob über das Postfach gesendet werden
darf, bevor etwas rausgeht.

**Begründung:** P5 wörtlich; und die Reihenfolge „erst Datenbank, dann
Versand“ macht das Senderecht in der Datenbank zur letzten Instanz.

### E-2026-09-03-29 — KI-Antwortentwurf nutzt den Preis „ki_text_einzeln“

**Frage:** Was kostet ein KI-Antwortentwurf, und wie wird er abgerechnet?

**Entscheidung:** Der Entwurf ist ein einzelner KI-Text und läuft über den
bestehenden Preisschlüssel `ki_text_einzeln` aus `credit_preise` (2 Credits,
im Plattform-Admin änderbar): Reservierung vor dem Aufruf, Einlösen nach
Erfolg, Freigabe bei Fehler. Ohne KI-Zugang entsteht ein Rahmen aus den
Stichpunkten — ohne Kennzeichnung als KI und ohne Credits. An den Anbieter
gehen nur Betreff, Text ohne Zitate und Stichpunkte, keine Adressen.

**Begründung:** Kein neuer Preis im Code (Masterprompt 14), und Abschnitt 16:
personenbezogene Daten auf das Minimum.

### E-2026-09-03-30 — Suche im Postfach vorerst per ILIKE

**Frage:** Der Volltextindex (`german`) liegt in der Datenbank; die
Datenzugriffsschicht kann ihn ohne eigene Funktion nicht nutzen.

**Entscheidung:** Die Oberfläche sucht in Betreff, Absender und Text per
ILIKE (bis 100 Treffer). Eine Datenbankfunktion für die Volltextsuche folgt
mit der Härtung, wenn Postfächer in Betrieb sind.

**Begründung:** Für die Datenmengen der ersten Kunden reicht ILIKE; eine
weitere Migration ohne Betriebserfahrung wäre Vorsorge ins Blaue.

### E-2026-09-03-31 — Connectoren ohne Testzugang: Annahmen an einer Stelle, Diagnose beim Prüfen

**Frage:** Propstack und FlowFact sind für Phase 4 vorgesehen; in dieser
Umgebung gibt es weder Testzugänge noch die Möglichkeit, Feldnamen und Pfade
gegen ein echtes Konto zu verifizieren. Bauen oder warten?

**Entscheidung:** Bauen — vollständig gegen die öffentliche Beschreibung der
Schnittstellen, mit Fetch-Attrappen getestet. Alles, was nicht verifiziert
werden konnte, ist als ANNAHME markiert und liegt je Anbieter an einer Stelle
(`api.ts`: Adressen und Pfade, `mapping.ts`: Feldnamen mit Kandidatenlisten).
Bei FlowFact sind Token- und Basisadresse je Integration überschreibbar. Die
Verbindungsprüfung vergleicht die erwarteten Felder mit einem echten Datensatz
und schreibt fehlende nach `konfig.felder_fehlend` und ins Protokoll. Der
Testzugang steht in `docs/ZUGAENGE_FEHLEND.md`.

**Begründung:** Warten hieße, den Umfang von Phase 4 auf unbestimmte Zeit zu
verschieben; unmarkierte Annahmen hießen, Kunden eine funktionierende
Anbindung vorzuspiegeln. Der Mittelweg macht den ersten echten Lauf zu einer
Sache von Minuten und lässt niemanden im Unklaren.

### E-2026-09-03-32 — Anmeldung über Google und Microsoft läuft über Supabase Auth

**Frage:** Eigener OAuth-Ablauf (wie bei den Postfächern) oder die Anbieter
von Supabase Auth?

**Entscheidung:** Supabase Auth. Google und Azure werden im Dashboard
eingerichtet; die Anwendung startet den Ablauf serverseitig
(`signInWithOAuth`), der bestehende Rückläufer `/auth/bestaetigen` tauscht den
Code gegen die Sitzung. Die Schaltflächen erscheinen nur mit
`NEXT_PUBLIC_ANMELDUNG_GOOGLE/MICROSOFT="1"`. Wer so neu kommt, hat kein
Unternehmen und landet — wie nach der E-Mail-Bestätigung — in der
Unternehmensregistrierung; Einladungen werden über das Weiterleitungsziel
übernommen.

**Begründung:** Ein zweiter Identitätsanbieter neben Supabase Auth hieße zwei
Sitzungsmodelle. Die Postfach-Anmeldung braucht dagegen eigene Tokens für
Mail-Zugriff — das ist ein anderer Zweck als die Anmeldung.

### E-2026-09-03-33 — Stripe-Livebetrieb nur mit doppeltem Schalter

**Frage:** Gate B ist freigegeben. Darf das Einrichtungsskript jetzt
Live-Schlüssel annehmen?

**Entscheidung:** Ja, aber nur mit `--live` **und** `STRIPE_LIVE_BESTAETIGT="ja"`.
Ein Live-Schlüssel ohne beides bricht ab; `--live` mit Testschlüssel ebenso.
Die Anwendung selbst kennt keinen Unterschied — Test und Live sind Schlüssel,
keine Codepfade.

**Begründung:** Die Liveschaltung setzt anwaltlich geprüfte Rechtstexte
voraus (Masterprompt, Gate B). Der zweite Schalter ist die Stelle, an der der
Auftraggeber diese Voraussetzung bewusst bestätigt, statt dass ein Skript sie
stillschweigend annimmt.

### E-2026-09-03-34 — Missbrauchsschutz bei der Registrierung in der Datenbank

**Frage:** Wie werden Mehrfach- und Wegwerf-Registrierungen gebremst, ohne
einen weiteren Dienst einzuführen?

**Entscheidung:** Drei Stufen, alle ohne Zusatzdienst: ein Honigtopf-Feld im
Formular (Skripte füllen es, Menschen sehen es nicht), eine Sperrliste für
Wegwerfdomains in der Datenbank (`registrierungs_sperrliste`, per Dienstrolle
pflegbar) und eine Ratenbegrenzung je E-Mail-Adresse (3/h) und je Absender
(5/h) über `registrierung_pruefen()`. Der Absender wird nur als gepfefferter
Hash gespeichert und nach 24 Stunden gelöscht; die Limits stehen in
`plattform_einstellungen`. Supabase Auth begrenzt zusätzlich auf seiner Seite.

**Begründung:** Masterprompt 16 verlangt Missbrauchsschutz; Abschnitt 16 und
die DSGVO verlangen Datensparsamkeit — ein Hash mit kurzer Frist genügt für
die Begrenzung. Ein externer Dienst (Captcha) käme mit eigener
Datenverarbeitung, die erst in die Datenschutzerklärung müsste.

### E-2026-09-03-35 — Wächter meldet Befunde per Mail, gleiche Lage einmal je Tag

**Frage:** Grundprinzip 4 des Funktionsprompts verlangt einen Wächter, der
alle Ketten prüft und Befunde proaktiv mailt — mit Anti-Spam.

**Entscheidung:** `waechter_befund()` liefert acht Kennzahlen (gescheiterte
und hängende Aufträge, alte offene Aufträge, gestörte Integrationen und
Postfächer, Stripe-Fehler; dazu Lesemodus und offene Zahlungen als Hinweise).
Der Arbeiter bewertet stündlich, hasht nur die roten Kennzahlen und mailt an
`WAECHTER_EMPFAENGER` (oder `plattform_einstellungen.waechter_empfaenger`):
neue Lage sofort, gleiche Lage höchstens einmal je 24 Stunden, Entwarnung bei
Grün. Der Zustand liegt in `plattform_einstellungen.waechter_zustand`.

**Begründung:** Wörtlich nach Grundprinzip 4. Hinweise bleiben aus dem Hash
heraus, damit ein Mandant im Lesemodus keine tägliche Alarmmail auslöst.

### E-2026-09-03-36 — Funktionale 1:1-Übernahme der Referenz

**Frage:** Der Auftraggeber hat am 03.09.2026 festgelegt, dass ImmoOffice.ai
funktional eine 1:1-Kopie der Referenzsoftware werden soll. Der Masterprompt
schließt einzelne Module ausdrücklich aus (OneDrive, Bewerber, Kundenportal,
Liquidität, Digital Signage, Provisionsrechner); `docs/SCOPE.md` führt sie als
NEIN.

**Entscheidung:** Die Vorgabe des Auftraggebers gilt als jüngste Weisung. Alle
Funktionen der Referenz werden nachgebaut, Reihenfolge und Stand in
`docs/FUNKTIONSABGLEICH.md`. Die vom Masterprompt ausgeschlossenen Module
werden **zuletzt** gebaut und im Status als Widerspruch zum Masterprompt
gekennzeichnet, damit der Auftraggeber sie einzeln streichen kann. Nicht
nachgebaut werden nur Dinge, die ohne fremde Verträge oder Hardware nicht
gehen (Bürobildschirm-API, iPhone-Raumscanner, externer Bewertungsdienst) —
dort bleibt der Datenimport.

**Unverändert:** Keine Kennzeichen der Referenz (Name, Domain, Projekt,
Adressen, Beispieldaten); eigenes Layout und eigene Komponenten; Rechte
serverseitig; alle KI-Auslesungen über editierbare Formulare.

**Begründung:** Der Auftraggeber entscheidet den Umfang. Die Reihenfolge
schützt davor, dass umstrittene Module Arbeitszeit vor den unstrittigen
binden.

### E-2026-09-03-37 — API-Schlüssel: Hash statt Klartext, Rechte je Bereich, Limit je Schlüssel

**Frage:** Wie werden Schlüssel der eigenen Schnittstelle gespeichert, und wie
fein sind die Rechte?

**Entscheidung:** Der Schlüssel (`io_` + 32 Byte Zufall) wird nur als SHA-256
gespeichert und beim Anlegen genau einmal gezeigt; die ersten elf Zeichen
bleiben als Wiedererkennung lesbar. Rechte gelten je Bereich (Objekte,
Kontakte, Termine) in drei Stufen. Das Ratenlimit (Vorgabe 600 je Minute,
5.4 des Auftrags) ist je Schlüssel einstellbar und wird in der Datenbank
je Minute gezählt. Die Route Handler arbeiten mit der Dienstrolle und filtern
jede Abfrage nach dem Mandanten des Schlüssels; im Lesemodus des Mandanten
sind nur Leseanfragen erlaubt.

**Begründung:** Ein Schlüssel ist kein Supabase-Benutzer; die Mandantentrennung
muss deshalb in der Serverschicht liegen und ist durch den Datenbank-Nachweis
abgesichert (fremder Mandant sieht nichts, Hash nicht lesbar).

### E-2026-09-03-38 — Rückrufe signiert, Wiederholung mit wachsendem Abstand

**Frage:** Wie erfährt ein Fremdsystem von neuen Datensätzen, und wie sicher
ist das?

**Entscheidung:** Trigger auf `objekte`, `kontakte`, `termine` reihen je
aktivem Ziel des Mandanten einen Rückruf ein. Der Hintergrund-Arbeiter stellt
zu (zehn Sekunden Zeitlimit je Lieferung), signiert mit HMAC-SHA256 über
`<zeit>.<körper>`, Geheimnis je Ziel verschlüsselt gespeichert. Fehlschläge
werden mit 2^n Minuten (höchstens 60) bis zu acht Mal wiederholt, danach
„gescheitert“ mit manueller Wiederholung. Ziele nur über https.

**Begründung:** Signatur mit Zeitstempel verhindert Fälschung und
Wiedereinspielung; die Wiederholung in der Datenbank überlebt Neustarts des
Arbeiters.

### E-2026-09-03-39 — Vertragsvorlagen: Formulardaten plus erzeugter Text, Vollmacht als eigener Vertrag

**Frage:** Wie bilden wir die strukturierten Verträge der Referenz (Verkäufertypen,
Provisionsmodelle, Vollmacht) ab, ohne die bestehende Signaturlogik zu
brechen?

**Entscheidung:** Die Formulardaten liegen in `vertraege.daten` (JSON), der
daraus erzeugte Text wie bisher in `inhalt` — er wird unterzeichnet und ist
ab der ersten Unterschrift gesperrt. Die Vollmacht ist ein eigener Vertrag
(Art `vollmacht`, Verweis `daten.zu_vertrag_id`); das PDF des Maklervertrags
nimmt sie als Anlage auf. Word-Export entsteht aus derselben
Dokumentstruktur wie das PDF.

**Begründung:** Signatur, Hash und Widerrufsfrist funktionieren unverändert
über den Text; die Daten bleiben für Folgedokumente (Laufzettel,
Übergabe, Rechnung) auswertbar. Eine Vollmacht kann auch ohne Vertrag
gebraucht werden.

### E-2026-09-03-40 — Auslesungen (Vertrag, Anhänge, Zähler) über Funktionen statt neuer Anbieter-Klassen

**Frage:** Wie kommen Dokument- und Bildauslesungen in den Provider-Layer?

**Entscheidung:** `src/lib/ki/auslese.ts` bietet `strukturAuslesen` und
`bildAuslesen`; ohne Modellzugang greifen Heuristiken (Muster im Text),
gekennzeichnet als „ohne KI“ und ohne Credits. Preise `ki_dokument_import`
(5) und `ki_bild_auslesen` (1) stehen in `credit_preise`. Jedes Ergebnis
landet in einem editierbaren Formular; die Anwendung übernimmt nichts
ungeprüft.

**Begründung:** Der Provider-Layer bleibt austauschbar (ein Endpunkt, ein
Schlüssel), Grundprinzip 3 des Funktionsprompts wird eingehalten, und die
Anwendung bleibt ohne Modellzugang benutzbar.

### E-2026-09-03-41 — Mietanfragen als eigene Tabelle, Selbstauskunft ohne Konto über Token-Link

**Frage:** Werden Mietinteressenten direkt als Kontakte angelegt, und wie
kommt die Mieterselbstauskunft ins System?

**Entscheidung:** Mietanfragen sind eine eigene Tabelle (`mietanfragen`) mit
Quelle (manuell, Postfach/Portal, Selbstauskunft, Web-Exposé, Schnittstelle),
Bewertung, Statusfolge und den Angaben der Selbstauskunft. Ein Kontakt
entsteht erst auf Klick („Als Kontakt anlegen“) oder beim Mietvertrag. Die
Selbstauskunft füllen Interessenten über einen öffentlichen Token-Link
(`/selbstauskunft/<token>`, je Objekt oder allgemein, deaktivierbar) ohne
Konto aus; die Verarbeitung läuft serverseitig mit Dienstrolle, geprüft gegen
Token, Aktiv-Schalter und ein Ratenlimit je Absender. Antwortvorlagen liegen
als Standard im Code und lassen sich je Mandant in `antwortvorlagen`
überschreiben; Platzhalter werden serverseitig ersetzt.

**Begründung:** Anfragen kommen zu Dutzenden je Objekt, die meisten enden mit
einer Absage — sie würden die Kontaktliste verstopfen (Funktionsprompt:
Objekt als Drehkreuz, keine Insellösungen; Referenz-Kachel Vermietung). Das
Formular ohne Konto ist kein Kundenportal im Sinne der Abgrenzung: kein Login,
kein Zugriff auf Mandantendaten, nur ein Einreichweg wie das Web-Exposé.
Personenbezogene Angaben (Einkommen, Schufa) werden nur gespeichert, wenn der
Interessent sie bestätigt; sie gehen nicht an KI-Anbieter.

### E-2026-09-03-42 — Reservierung: Objektstatus per Datenbank-Trigger, eine aktive je Objekt, Vereinbarung als Vertrag

**Frage:** Wie folgt der Objektstatus einer Reservierung, und wie wird die
Reservierungsvereinbarung unterschrieben?

**Entscheidung:** Ein Trigger auf `reservierungen` setzt das Objekt bei
„aktiv“ auf `reserviert` und bei Ablauf/Aufhebung zurück auf `aktiv`; ein
Teil-Unique-Index erlaubt nur eine aktive Reservierung je Objekt.
„Abgeschlossen“ setzt das Objekt auf `verkauft` (Serveraktion). Abgelaufene
Fristen schließt `reservierungen_ablaufen()` im Tagesjob. Die Vereinbarung
entsteht als Vertrag der Art `reservierungsvereinbarung` und nutzt den
vorhandenen Signaturlink; ihr Text warnt vor unangemessen hohen Gebühren
(§ 307 BGB) und verlangt anwaltliche Prüfung. Mietverträge folgen demselben
Muster: Formulardaten in `mietvertraege`, der erzeugte Text als Vertrag der
Art `mietvertrag`; „unterzeichnet“ setzt das Objekt auf `vermietet`.

**Begründung:** Der Status muss auch dann stimmen, wenn eine Reservierung über
die Schnittstelle oder einen Connector entsteht — deshalb Datenbank statt
Oberfläche (Masterprompt: Regeln serverseitig erzwingen). Ein zweiter
Signaturweg wäre eine Insellösung; die Vertragsinfrastruktur (Textform,
Signaturvorgänge, PDF) existiert bereits.

### E-2026-09-03-43 — Akquise: eigenes Modul „akquise“, Automationen erzeugen Entwürfe und Aufgaben, kein Roboter-Versand

**Frage:** Wie werden Eigentümer-Leads von Objekten und Kontakten getrennt,
und dürfen Automationen selbständig E-Mails an Eigentümer senden?

**Entscheidung:** Leads sind eine eigene Tabelle (`akquise_leads`) mit
Pipeline, Stufe, Quelle, Kampagne, Zuständigem und Preis-Finder-Feldern; das
Rechtemodul heißt `akquise` (Verwaltung für Pipelines, Stufen, Vorlagen,
Automationen und Einstellungen; Makler und Assistenz für Leads, Kampagnen,
Quellen, Radar). Status, Zeitpunkte, Verlustgrund-Pflicht, Historie und das
Planen der Automationen laufen in Datenbank-Triggern. Ein Automationslauf
erzeugt eine Aufgabe beim Zuständigen oder einen Mail-Entwurf am Lead — der
Versand bleibt beim Menschen (Postfach oder E-Mail-Programm). Ein gewonnener
Lead wird per Klick zum Objekt im Status „akquise“; Unterlagen, Matching und
Maklervertrag laufen dann über das Objekt.

**Begründung:** Objekt als Drehkreuz und verkettete Arbeitsschritte
(Funktionsprompt, Grundprinzipien 1 und 2): Ein Lead ist noch kein Objekt und
soll den Bestand nicht mit Absagen füllen. Automatischer Versand an
Privatpersonen ohne Sichtkontrolle ist rechtlich heikel (§ 7 UWG, DSGVO) und
widerspricht der Regel, dass jeder Text editierbar und freigabepflichtig
bleibt; Datenbank-Trigger sorgen dafür, dass Leads aus Schnittstelle, CSV und
Postfach dieselben Regeln durchlaufen wie Leads aus der Oberfläche.

### E-2026-09-03-44 — Preis-Finder aus eigenen Vergleichswerten, Akquise-Radar nur manuell

**Frage:** Woher kommt die Wertindikation im Preis-Finder, und liest das
Radar Portale aus?

**Entscheidung:** Die Wertindikation ist der Median der €/m² verkaufter
Objekte des Mandanten (gleiche Objektkategorie, Eingrenzung PLZ → Ort →
Bestand, jeweils nur bei mindestens drei Werten), multipliziert mit der
Wohnfläche und auf Tausend gerundet; Spanne, Startpreis und Provisionssatz
kommen aus den Akquise-Einstellungen und sind je Lead überschreibbar. Jeder
Schritt und jeder Vergleichswert steht im Dossier und im PDF, zusammen mit
dem Pflichthinweis. Das Radar ist eine manuelle Sammlung erfasster Inserate
(oder Einträge über die Schnittstelle) ohne Portal-Auslesung.

**Begründung:** Masterprompt: Wertermittlung ohne Blackbox, keine automatisch
„ermittelten“ Werte; eigene Verkäufe sind die einzige Datenquelle, die dem
Makler vorliegt und die er verantworten kann. Portal-Scraping verstößt in der
Regel gegen Nutzungsbedingungen und ist wettbewerbs- und urheberrechtlich
ungeklärt — ein rechtlicher Blocker, kein technischer.

### E-2026-09-04-45 — Aufgaben bleiben eine Tabelle, Notizen sind Aufgaben vom Typ „notiz“; Checklisten erledigen sich über Unterlagen

**Frage:** Braucht es für Notizen, Schritte, Kommentare und Checklisten neue
Module oder eigene Datenmodelle?

**Entscheidung:** Die Tabelle `aufgaben` wird erweitert (Status mit fünf
Stufen, Typ Aufgabe/Notiz, Tags, Wiederholung, Erinnerung, Quelle,
Sichtbarkeit, Verknüpfungen zu Lead, Termin, Nachricht und Vertrag); Schritte
und Kommentare sind Kindtabellen, Kommentare unveränderlich. Status und
Erledigt-Zeitpunkt gleicht ein Trigger ab, Statuswechsel und Übergaben
protokolliert die Datenbank als Systemkommentar, Wiederholungen erzeugen beim
Erledigen die nächste Aufgabe. Checklisten haben Vorlagen mit Punkten
(Pflicht, Unterlagenart, Frist); ein Punkt mit Unterlagenart wird automatisch
erledigt, sobald die Unterlage am Objekt liegt, und der Abschluss ergibt sich
aus den Pflichtpunkten. Rechte laufen weiter über das Modul `kalender`.

**Begründung:** Die Referenz führt Notizen ebenfalls als ToDos mit Tags; ein
zweites Modell hätte die Verkettung (Objekt, Kontakt, Lead, Postfach)
doppelt gebraucht. Regeln in der Datenbank gelten für alle Wege — Oberfläche,
Schnittstelle, Connectoren (Masterprompt: serverseitig erzwingen; Funktions-
prompt: verkettete Arbeitsschritte). Die Unterlage als Auslöser macht die
Checkliste zur echten Vollständigkeitsprüfung statt zu einer Liste, die
jemand parallel pflegen muss.

### E-2026-09-04-46 — Schnelleingabe ohne KI, Rechtschreibkorrektur mit KI (1 Credit), Spracheingabe nur im Browser

**Frage:** Wie entstehen Aufgaben „in Sekunden“, und wo kommt KI ins Spiel?

**Entscheidung:** Die Schnelleingabe ist ein deterministischer Parser (Frist,
Priorität, Tags, Wiederholung, Notiz) mit sichtbarer Vorschau — keine KI,
keine Credits. Diktat nutzt die Spracherkennung des Browsers, falls
vorhanden, ohne Audio an einen Anbieter zu senden. Die
Rechtschreibkorrektur ist eine KI-Funktion (`ki_text_korrektur`, 1 Credit)
mit strenger Anweisung „nur korrigieren, nichts umformulieren“; ohne
Modellzugang bleibt der Text unverändert und die Oberfläche sagt das.

**Begründung:** Ein Parser ist prüfbar (Unit-Tests) und kostet nichts;
Masterprompt: kostenpflichtig ist nur KI-Erstellung, und jede KI-Ausgabe
bleibt editierbar. Audio-Verarbeitung im Browser hält personenbezogene
Daten weg von Anbietern (Abschnitt 16).

### E-2026-09-04-47 — GoBD-Regeln für Rechnungen liegen in der Datenbank, das PDF wird festgeschrieben

**Frage:** Wo werden Unveränderlichkeit, fortlaufende Nummern und Storno
erzwungen — in der Oberfläche, im Server-Code oder in der Datenbank?

**Entscheidung:** In der Datenbank. Trigger verhindern jede inhaltliche
Änderung einer gestellten Rechnung (auch der Positionen), das Löschen
gestellter Rechnungen und das Verstellen des Nummernkreises, sobald über
einen Absender eine Rechnung gestellt wurde. `rechnung_stellen` vergibt die
Nummer (`PRÄFIX-JJJJ-NNN`) in einer Transaktion mit Zeilensperre und friert
den Absender als Snapshot ein; `rechnung_stornieren` erzeugt eine
Storno-Rechnung mit eigener Nummer und negativen Positionen, das Original
bleibt unverändert. Beim Stellen wird das PDF erzeugt und im
Unterlagen-Bucket abgelegt; die Download-Route liefert für gestellte
Rechnungen immer diese Datei und rendert nie neu. Testrechnungen
(`ist_test`) laufen außerhalb des Nummernkreises (`TEST-…`) und sind
löschbar.

**Begründung:** Rechte werden serverseitig und in der Datenbank erzwungen
(Masterprompt). Ein Trigger gilt für jede Schreibstelle — Oberfläche,
Schnittstelle, Import — und lässt sich in SQL-Nachweisen prüfen. Ein
festgeschriebenes PDF ist die einzige Fassung, die dem Kunden vorlag; ein
späteres Rendern mit geändertem Briefkopf wäre ein anderer Beleg. Keine
Aussage zur vollständigen GoBD-Konformität — Aufbewahrung und
Verfahrensdokumentation bleiben Sache des Mandanten (offener Punkt,
`docs/BLOCKER.md`).

### E-2026-09-04-48 — Rechnungskunden sind ein eigener Stamm; persönliche Absender je Mitarbeiter

**Frage:** Reicht der Kontaktstamm als Rechnungsempfänger? Und wie werden
„persönliche Rechnungen“ der Referenz (freie Handelsvertreter) abgebildet?

**Entscheidung:** Rechnungskunden sind eine eigene Tabelle mit
Rechnungsanschrift und USt-IdNr., optional an einen Kontakt gebunden; beim
Anlegen einer Rechnung aus einem Kontakt entsteht der Kunde automatisch. Die
Anschrift wird beim Stellen in die Rechnung kopiert. Absender gibt es als
Firma und als „persönlich“ (an einen Benutzer gebunden, eigener
Nummernkreis, eigene Bankverbindung); Makler dürfen ihre persönlichen
Absender selbst pflegen, Firmenabsender nur Inhaber und Administratoren.
Die Provisionsrechnung aus dem Maklervertrag rechnet den im Vertrag
vereinbarten Bruttosatz (inkl. USt) auf den Nettopreis zurück.

**Begründung:** Rechnungen gehen oft an Hausverwaltungen, Firmen oder
Erbengemeinschaften, die im Kontaktstamm nicht als Person geführt werden;
eine spätere Änderung am Kontakt darf einen Beleg nicht verändern. Die
Referenz kennt persönliche Absender mit eigener Startnummer — das ist die
Struktur, nicht eine Kennung. Maklerverträge nennen die Provision nach
Handelsbrauch inklusive Umsatzsteuer.

### E-2026-09-04-49 — Serien werden ausgeschrieben, Termine bleiben eigene Zeilen; Erinnerungen laufen über die Tagesarbeiten

**Frage:** Wie werden Serientermine gespeichert, und woher kommen Erinnerungen
und das Nachfassen nach Besichtigungen?

**Entscheidung:** Eine Serie wird beim Anlegen ausgeschrieben (höchstens 200
Termine, höchstens drei Jahre); jeder Termin ist eine Zeile mit `serie_id`
und der Regel als JSON. Ändern und Löschen fragen „nur dieser“ oder „dieser
und alle folgenden“. Erinnerungen (Standard sechs Stunden, wählbar) und die
Nachfass-Aufgabe am Tag nach einer Besichtigung erzeugt der Arbeiter in den
Tagesarbeiten aus Datenbankfunktionen; Löschen ist weich (`geloescht_am`),
damit der Kalender-Abgleich die Löschung weitergeben kann. Private Termine
sieht nur, wer beteiligt ist — die frühere Schreib-Policy „for all“ wirkte
auch beim Lesen und wurde in Anlegen/Ändern/Löschen getrennt.

**Begründung:** Ausgeschriebene Termine lassen sich einzeln verschieben,
absagen und mit fremden Kalendern abgleichen; eine Regel-Auswertung zur
Laufzeit könnte das nicht. Die Referenz arbeitet ebenso (Edge Function
„termin-serie“). Erinnerungen über die vorhandene Job-Kette mit Wächter
statt einer zweiten Zeitsteuerung (Grundprinzip 4).

### E-2026-09-04-50 — Fahrzeiten mit OpenStreetMap-Geokodierung und optionalem Routendienst; Kalender-Abgleich über das Postfach-OAuth, ICS-Abo für alle

**Frage:** Welche Dienste dürfen für Fahrzeiten und Kalender-Abgleich
angebunden werden, und was funktioniert ohne Zugangsdaten?

**Entscheidung:** Adressen werden über Nominatim (OpenStreetMap) geokodiert,
sparsam und mit Cache in der Datenbank (nur Adresse → Koordinate, kein
Personenbezug). Die Route kommt von OpenRouteService, wenn
`ROUTING_API_KEY` gesetzt ist; sonst wird aus der Luftlinie geschätzt und
das in Kalender und Termin sichtbar gekennzeichnet. Der Abgleich mit Google
Kalender und Outlook nutzt die OAuth-Verbindung des Postfachs (zusätzliche
Kalender-Berechtigung beim Verbinden) und läuft mit jedem Postfach-Abruf;
Konfliktregel: der ImmoOffice-Datensatz gewinnt, fremde Termine kommen als
„Sonstiges“ herein. Unabhängig davon gibt es je Benutzer ein ICS-Abo mit
geheimem, erneuerbarem Link.

**Begründung:** Keine Geheimnisse im Code; jede Anbindung muss ohne
Schlüssel degradieren statt zu blockieren (`docs/AUTONOMIE.md`). Das ICS-Abo
deckt Apple, Google und Outlook ohne jede Freigabe ab. Der OAuth-Abgleich
ist gebaut, aber ohne Testzugänge nicht live geprüft — vermerkt in
`docs/ZUGAENGE_FEHLEND.md`.

### E-2026-09-04-51 — PDF-Werkzeuge und Bild-Editor laufen im Browser; Bearbeitungen werden Versionen am Objekt

**Frage:** Wo werden PDFs und Bilder bearbeitet, und wie bleibt das Original
erhalten?

**Entscheidung:** PDF-Werkzeuge (zusammenfügen, teilen, Seiten, komprimieren,
schwärzen) und der Bild-Editor (Zuschnitt, Größe, Farben, Verpixeln, Text,
Logo, RAW-Entwicklung) laufen vollständig im Browser mit pdf-lib, pdf.js
(Worker unter `public/werkzeuge/`) und Canvas; keine Datei verlässt den
Rechner, kein Server-Upload zum Bearbeiten. Ein bearbeitetes Bild wird auf
Wunsch als **neue Version** am Objekt gespeichert (`objekt_bilder.original_id`,
`bearbeitung`, `ki_bearbeitet`); das Original bleibt unverändert. Schwärzen
baut markierte Seiten als Bild neu auf — der Text darunter ist unwiderruflich
entfernt, nicht nur überdeckt. RAW-Dateien werden über LibRaw (WASM) im
Browser entwickelt; ist der Decoder nicht ladbar, dient die eingebettete
Kamera-Vorschau als Grundlage und der Editor sagt das.

**Begründung:** Datenschutz (Unterlagen mit personenbezogenen Daten bleiben
lokal), keine Serverlast für Bildarbeit, und die Masterprompt-Regeln zur
Bildpipeline (Originale unverändert, jede Bearbeitung eine Version,
Vorher/Nachher, Kennzeichnung) lassen sich so direkt umsetzen.

### E-2026-09-04-52 — KI-Bildbearbeitung über den Provider-Layer mit festen Schutzanweisungen; Infrastruktur aus OpenStreetMap; Energieausweis nur über Bestätigungsformular

**Frage:** Welche KI-Bildfunktionen sind erlaubt, woher kommen Entfernungen,
und wie landen ausgelesene Energiewerte im Objekt?

**Entscheidung:** Vier KI-Bearbeitungen (Himmel, Störendes entfernen,
virtuelles Home Staging, Optimierung) laufen über `src/lib/ki/bild.ts` mit
festen Anweisungen, die Architektur, Raumgeometrie, Fenster und Türen
unverändert lassen; je 3 Credits, Ergebnis mit Vorher/Nachher-Regler,
gespeichert nur als gekennzeichnete Version. Entfernungen (Kita, Schule,
Supermarkt, Bäcker, Apotheke, Arzt, Krankenhaus, Haltestelle, Bahnhof,
Autobahn, Park, Spielplatz) kommen aus OpenStreetMap (Overpass, Luftlinie
mit Gehminuten) und werden am Objekt gespeichert. Der Energieausweis wird als
Unterlage abgelegt und ausgelesen (PDF-Text oder Foto, 2 Credits); die Werte
gehen in ein editierbares Formular und erst nach Bestätigung ins Objekt.

**Begründung:** Masterprompt: Bildbearbeitung darf Architektur nicht
unbemerkt verfälschen; Home Staging bleibt erkennbar virtuell. OpenStreetMap
braucht keinen Schlüssel und keine personenbezogenen Daten. KI-Auslese
immer über ein editierbares Formular (Grundprinzip 3).

### E-2026-09-04-53 — RAW-Entwickler lädt libraw zur Laufzeit aus dem eigenen Ursprung; CSP erlaubt WebAssembly; Server-Actions bis 12 MB

**Frage:** Der Produktions-Build blieb ohne Meldung beim Übersetzen stehen.
Ursache war der dynamische Import von `libraw-wasm`: Das Paket startet einen
Worker mit WebAssembly, und der Bundler hängt beim Analysieren dieses
Worker-Graphen. Außerdem sperrte die Content-Security-Policy zwei Dinge, die im
Entwicklungsmodus unbemerkt blieben: das Übersetzen von WebAssembly und
`fetch()` auf Daten-URLs (PDF-Werkzeuge beim Zusammenbauen geschwärzter Seiten).

**Entscheidung:** Die vier Laufzeitdateien von libraw-wasm liegen unverändert
unter `public/werkzeuge/libraw/` (gleiche Version wie in `package.json`) und
werden im Bild-Editor erst beim ersten RAW-Bild aus dem eigenen Ursprung
geladen; der Bundler lässt diesen Import unangetastet. Die CSP erhält
`'wasm-unsafe-eval'` — das erlaubt ausschließlich WebAssembly, kein `eval()`.
Daten-URLs werden im Browser selbst dekodiert statt per `fetch()`. Bearbeitete
Bilder gehen als Server-Action zum Server; dafür ist die Grenze auf 12 MB
gesetzt (Vorgabe 1 MB). Versteckte Formularfelder mit Bilddaten werden im
Absende-Ereignis synchron gefüllt — ein React-Zustand käme erst nach dem
Einsammeln des Formulars an.

**Folge:** Beim Aktualisieren von libraw-wasm sind die Dateien in
`public/werkzeuge/libraw/` mitzuziehen (Hinweis im Quelltext).

### E-2026-09-04-54 — Kundenbereich ohne Konto: Zugangslink mit Hash, optionales Passwort, Datenbankfunktionen statt Dienstrolle

**Frage:** Die Referenz führt Eigentümer, Käufer und Neubau-Interessenten als
eigene Konten (Magic-Link) in einem separaten Portal. Wie bilden wir das ab,
ohne die Mandantentrennung zu schwächen — und obwohl der Masterprompt ein
Kundenportal ausschließt?

**Entscheidung:** Der Auftraggeber hat die funktionale 1:1-Übernahme angeordnet
(E-2026-09-03-36); das Paket heißt „Kundenbereich“, ist als Widerspruch zum
Masterprompt gekennzeichnet und hängt an keiner anderen Funktion — es lässt sich
als Ganzes streichen (`docs/SCOPE.md` bleibt unverändert: NEIN laut Masterprompt).
Technisch: Ein Zugang ist ein Datensatz `portal_kunden` mit Rolle (Eigentümer,
Käufer, Interessent), ohne Benutzerkonto. Der Zugangslink trägt ein 48-stelliges
Token; in der Datenbank liegt nur der SHA-256-Hash. Der Kunde kann zusätzlich
ein Passwort setzen (Hash mit Salz je Zugang); es wird wie beim Web-Exposé in
einem pfadgebundenen Cookie für acht Stunden gemerkt und bei jedem Aufruf neu
geprüft. Alle Kundenaktionen laufen über `security definer`-Funktionen, die
Token und Passwort prüfen und nur die Daten dieses einen Zugangs herausgeben
(`portal_daten`, `portal_nachricht_senden`, `portal_merkliste_schalten`,
`portal_anfrage_senden`, `portal_dokument_eintragen`, `portal_antrag_speichern`,
`portal_datei`). Die Dienstrolle wird nur für den Bucket gebraucht (signierte
Adressen, Ablage von Kunden-Uploads) — nachdem die Datenbank den Zugriff bejaht
hat. Sichtbarkeit von Projektdateien: intern · alle Kunden des Projekts · nur
Käufer · öffentlich; „nur Käufer“ sieht ausschließlich die Rolle Käufer.
Einladungs- und Benachrichtigungsmails gehen über die Job-Warteschlange mit der
freien Vorlage; ohne Mail-Dienst zeigt die Oberfläche den Link zum Weitergeben.
Eine öffentliche Projektseite (`/projekt/[token]`) zeigt Einheiten, öffentliche
Dateien und Baufortschritte; eine Anfrage legt den Interessenten-Zugang an.

**Folge:** Das Rechtemodul „portal“ steuert Neubauprojekte und Kundenbereich
(Inhaber/Admin alles, Makler inkl. Löschen, Assistenz bearbeiten, Nur-Lesen
lesen). `scripts/marken-scan.sh` behält die Regel gegen das Wort „Kundenportal“;
Code und Texte sprechen vom Kundenbereich.

### E-2026-09-04-55 — Verwaltung: Arbeitszeit und Urlaub im eigenen Datenmodell, Plattformbereich nur über die Dienstrolle, Bewerber-Test mit eigenen Fragen

**Frage:** Die Referenz führt Urlaub als Termine mit Sonderfeldern, Arbeitszeit
über Profile und einen Bewerbertest mit eigenem Fragenkatalog; der Masterprompt
verlangt zusätzlich Plattform-Administration, Datenexport, Selbstkündigung, PWA
und streicht das Bewerber-Modul.

**Entscheidung:** Urlaub und Arbeitszeit bekommen eigene Tabellen
(`urlaubsantraege`, `arbeitszeit_modelle`, `arbeitszeit_stempel`,
`arbeitszeit_tage`, `urlaub_hinweise`) mit klaren Regeln in der Datenbank: Nur
die Verwaltung entscheidet und pflegt Kontingente (Trigger), jeder stempelt und
trägt für sich nach, genehmigte Abwesenheiten sind für alle sichtbar. Ein
genehmigter Urlaub erzeugt einen ganztägigen Kalendertermin und Urlaubstage in
der Arbeitszeit. Feiertage werden bundesweit plus je Bundesland berechnet
(Gauß-Osterformel), das Bundesland steht am Profil. Die Bilanz folgt der
Referenz: Staffel je Jahr, anteiliger Anspruch im Eintrittsjahr, Übertrag aus
Rest und manueller Angabe, Verfall am 31. März.
Der Plattformbereich (`/plattform`) prüft die Mitgliedschaft in
`plattform_admins` und liest ausschließlich Metadaten über die Dienstrolle;
Sperren, Preise, Credit-Werte und Schalter landen im Audit-Log des betroffenen
Mandanten. Der Datenexport (`/api/export`) liefert CSV je Tabelle, OpenImmo-XML
und auf Wunsch die Dateien, gedeckelt bei 400 MB; die Selbstkündigung setzt die
Löschung auf 30 Tage, beendet ein Stripe-Abo zum Laufzeitende und lässt sich
zurücknehmen. Die PWA ist ein Grundgerüst (Manifest, Icons, Service Worker mit
Offline-Seite, keine fachlichen Daten im Cache). Die globale Suche ist eine
Datenbankfunktion mit RLS (`global_suche`), erreichbar über Strg+K.
Das Bewerber-Modul ist gebaut, weil der Auftraggeber die 1:1-Übernahme
angeordnet hat (E-2026-09-03-36); die Fragen sind eigene Formulierungen, die
Tabelle heißt `bewerbungen`, das Modul ist als Widerspruch gekennzeichnet und
streichbar. Nicht nachgebaut bleiben Liquiditätstool und Provisionsrechner
(Masterprompt „nicht übernehmen“, `docs/SCOPE.md` NEIN) — dort gibt es keine
gegenteilige Weisung.

**Folge:** `scripts/marken-scan.sh` bleibt unverändert; deshalb heißt die
Tabelle `bewerbungen`. Die Plattform-Administratoren werden weiterhin nur per
Dienstschlüssel in `plattform_admins` eingetragen (docs/ANLEITUNG.md 10j).

### E-2026-09-03-13 — Credit-Werte bleiben die der Datenbank

**Frage:** S4 nennt Startwerte (Exposétext 5, Kurztext 2, Bild 3 je Bild,
Wertermittlung 10, Signatur 5, Mail-Entwurf 1). In `credit_preise` stehen
andere Werte (Exposétext 10, Einzeltext 2, Bild 10/30, Signatur 5).

**Entscheidung:** Die Werte der Datenbank bleiben; sie stehen in
`docs/CREDITS.md`. Für noch nicht vorhandene Aktionen (Wertermittlung,
Mail-Entwurf) werden die Startwerte aus S4 in die Tabelle aufgenommen.

**Begründung:** Die vorhandenen Werte sind aus dem Kostenmodell in
`PRICING_AND_GUV.md` hergeleitet; S4 nennt seine Zahlen ausdrücklich
„Startwerte“, und alle Werte sind ohnehin über den Plattform-Admin änderbar,
nicht im Code verdrahtet.

### E-2026-09-03-04 — Kein Personenname im Dateinamen

**Frage:** Der Auftragstext verlangt `docs/ANLEITUNG_LASSE.md`.

**Entscheidung:** Die Datei heißt `docs/ANLEITUNG.md`; Inhalt und Zweck
unverändert.

**Begründung:** Das Repository trägt sonst keine Personennamen, und die
Abgrenzung verlangt ausdrücklich, dass auch Dateinamen keine Ansprechpartner
benennen. Der Inhalt ist ohnehin für jeden Betreiber gedacht, nicht für eine
Person.

### E-2026-09-03-05 — Deutsche Bezeichner statt der englischen aus dem Auftragstext

**Frage:** Der Auftragstext nennt `firma_stammdaten`, `profiles`,
`current_firma_id()`, `role = 'chef'`, `credits`, `postfaecher.freigegeben_fuer`.
Die Datenbank hat `mandanten`, `benutzer`, `mandant_branding`,
`aktueller_mandant()`, `credit_konto`, `credit_buchungen`.

**Entscheidung:** Es gilt das bestehende Schema. Die Felder aus dem Auftragstext
werden inhaltlich übernommen und auf die vorhandenen Tabellen gelegt:
`onboarding_abgeschlossen` und `objekt_sichtbarkeit` an `mandanten`, die
Impressums- und Gestaltungsfelder an `mandant_branding`.

**Begründung:** `profiles` und `firma_stammdaten` waren der Vorentwurf und
wurden bereits in der ersten Migration verworfen (Kommentar dort). Sie
wiedereinzuführen hieße, die gesamte Anwendung umzuschreiben.

### E-2026-09-03-06 — Einladungs-Token wird nur als Hash gespeichert

**Frage:** Der Auftragstext sieht in `einladungen` eine Spalte `token` vor.

**Entscheidung:** Gespeichert wird ausschließlich `token_hash` (SHA-256). Der
Klartext existiert einmal — im Link in der Einladungsmail.

**Begründung:** Ein Einladungs-Token ist ein Zugangsmittel. Wer die Tabelle
lesen kann, könnte sonst jede offene Einladung selbst einlösen und damit in
einen fremden Mandanten gelangen. Dasselbe Vorgehen wie bei den Tokens der
Web-Exposés.

### E-2026-09-03-07 — Einladung ohne automatischen Mailversand

**Frage:** Wie erreicht die Einladung den Empfänger?

**Entscheidung:** Die Anwendung erzeugt die Einladung und zeigt den Link **einmal**
zum Kopieren an. Ein automatischer Versand folgt, sobald der Transaktionsmail-
Dienst eingerichtet ist (`docs/ZUGAENGE_FEHLEND.md`).

**Begründung:** Der Einladungsversand über Supabase Auth ist mengenbegrenzt und
für den Produktivbetrieb ungeeignet — dieselbe Überlegung steht bereits als
Kommentar in `src/components/einstellungen/Benutzerliste.tsx`. Eine Schaltfläche,
die eine Mail verspricht, die nie ankommt, ist schlechter als ein Link zum
Kopieren.

### E-2026-09-03-08 — Farben werden im OKLCH-Raum abgeleitet

**Frage:** Aus Primär- und Akzentfarbe sollen Hintergrund, Ränder, Text und
Hover-Stufen entstehen (B1).

**Entscheidung:** Die Ableitung rechnet in OKLCH; der Kontrast wird nach WCAG 2.1
(relative Luminanz) geprüft. Ausgegeben werden Hexwerte, damit PDF-Erzeugung und
ältere Mailprogramme sie verstehen.

**Begründung:** In OKLCH sind Helligkeitsschritte wahrnehmungsgleichmäßig — eine
um 20 % aufgehellte Marineblau-Stufe sieht dann so aus wie eine um 20 %
aufgehellte Goldstufe. In HSL ist das nicht der Fall. Hex als Ausgabeformat,
weil `@react-pdf/renderer` und E-Mail-Clients OKLCH nicht unterstützen.

### E-2026-09-03-09 — Schriften werden lokal ausgeliefert, nicht von Google geladen

**Frage:** B2 nennt zwölf Schriften aus der Google-Bibliothek.

**Entscheidung:** Die Liste gilt, die Dateien werden aber als npm-Paket
(`@fontsource/*`) mitgeliefert und aus der eigenen Domain ausgeliefert. Solange
ein Paket fehlt, greift die Anwendung auf die bereits vorhandenen Schriften
zurück und kennzeichnet das im Editor.

**Begründung:** Ein Aufruf von `fonts.googleapis.com` überträgt die IP-Adresse
jedes Besuchers in die USA. Für ein Produkt, das mit Datenschutz wirbt und ein
öffentliches Web-Exposé ausliefert, ist das kein vertretbarer Standardzustand.

### E-2026-09-03-10 — Zugangsdaten fremder Systeme: AES-256-GCM mit Mandantenbindung

**Frage:** Wie werden Zugangsdaten von Integrationen und Postfächern gespeichert?

**Entscheidung:** AES-256-GCM mit dem Schlüssel aus
`VERSCHLUESSELUNG_SCHLUESSEL`, je Datensatz eigener Zufallsvektor, und die
Mandanten-ID als mitauthentifizierte Zusatzdaten (AAD). Gespeichert wird ein
einziges Textfeld im Format `v1.<iv>.<tag>.<geheimtext>`.

**Begründung:** Die Mandanten-ID als AAD macht das kryptografische Verfahren
selbst mandantenfest: Ein Geheimtext, der in die Zeile eines anderen Mandanten
kopiert wird, lässt sich nicht mehr entschlüsseln. Das ist eine zweite Grenze
zusätzlich zur Row-Level-Security.

### E-2026-09-03-11 — Reihenfolge dieses Arbeitspakets

**Frage:** Der Auftragstext beschreibt vier Module. Welche entstehen zuerst?

**Entscheidung:** In dieser Reihenfolge: (1) Arbeitsmodus-Dokumente,
(2) Onboarding, Einladungen, Erscheinungsbild — Phase 1, (3) Connector-Rahmen mit
OpenImmo — Phase 2. Stripe (Phase 3), weitere Connectoren und Postfächer
(Phase 4) folgen danach; Stripe endet ohnehin an Gate B.

**Begründung:** Die Phasenordnung des Masterprompts, und OpenImmo hat dort
ausdrücklich Vorrang vor allem anderen. Module vorzuziehen, deren Zugangsdaten
noch fehlen, hieße, sie ungetestet zu bauen.

### E-2026-09-04-56 — Kachel-Struktur 1:1 nach der Referenz; Funktionsinventar auf Bedienelement-Ebene ersetzt den groben Funktionsabgleich

**Frage:** Der Auftraggeber sieht die Anwendung nicht als Abbild der Referenz:
„mehr an der Referenz halten und Kacheln bauen, dutzende Funktionen fehlen".
Der bisherige `docs/FUNKTIONSABGLEICH.md` setzte Haken je Funktionsfamilie,
nicht je Schaltfläche; die Anwendung war über eine Seitenleiste und anders
geschnittene Seiten organisiert.

**Entscheidung:** (1) Die Startseite wird ein Kachel-Raster in der
Reihenfolge und Wortwahl der Referenz, mit Anpassen-Modus je Benutzer
(`benutzer.kacheln`); jede Kachel öffnet eine Modulseite mit denselben
Unterkacheln (`src/lib/kacheln.ts`). Kacheln ohne Gegenstück zeigen „in
Vorbereitung" oder „nicht im Umfang" statt zu fehlen. Das Menü folgt der
Referenz; die eigene Gestaltung (Raster, Symbole, Farben) bleibt. Die laut
Masterprompt gestrichenen Module (Firmen-Cloud-Ablage, Bürobildschirm,
Liquidität, Provisionsrechner) erscheinen nur als Hinweis. (2) Die Referenz
wird auf Ebene der Bedienelemente inventarisiert (`docs/FUNKTIONSINVENTAR.md`,
Quelle: extrahierte Oberflächentexte je Komponente, nie die Referenzdatei als
Ganzes). Jede Zeile trägt Stand ✓/◐/✗ mit Fundstelle; ein ✓ ohne Fundstelle
gibt es nicht. Das Inventar ist ab jetzt die Arbeitsliste; der alte Abgleich
bleibt als historisches Dokument stehen. (3) Reihenfolge der Lückenschließung:
Termine, ToDos, Adressbuch, Immobilien-Akte, dann die übrigen Kacheln.

**Folgen:** Erwartungen des Auftraggebers und Oberfläche decken sich; der
Umfang der verbleibenden Arbeit ist sichtbar und zählbar. Kosten: Umbau von
Startseite und Menü (Paket 16a), Pflege des Inventars je Paket.

### E-2026-09-04-57 — Nachfassen als Vorschlag mit Freigabe statt stiller Aufgabe; Kundenerinnerung mit Vorabend-Regel; Lead aus Termin ohne Dubletten

**Frage:** Die Referenz fasst drei Tage nach der Besichtigung mit einem
Mailentwurf nach, den der Makler auf der Startseite freigibt, erinnert den
Kunden selbst etwa sechs Stunden vorher und legt aus dem Termin einen
Akquise-Lead an. ImmoOffice.ai hatte dafür eine Aufgabe am Folgetag, eine
interne Erinnerung und keinen Lead-Bezug.

**Entscheidung:** Nachfassen wird ein eigener Datensatz
(`nachfass_vorschlaege`) mit Entwurf, Status und Grund; die Entscheidung
(senden, überspringen, verwerfen) bleibt beim Menschen, der Versand läuft
über das verbundene Postfach und schließt den Vorschlag. Antworten des
Kontakts (Posteingang seit dem Termin) überspringen automatisch. Die
Kundenerinnerung folgt den Regeln der Referenz (6 h, Vorabend 18 Uhr bei
Frühterminen, nicht bei kurzfristiger Vereinbarung) und ist je Termin
abschaltbar; sie geht nur an Kontakte mit E-Mail, nie bei privaten Terminen.
Der Lead aus dem Termin prüft die Adresse gegen bestehende Leads und
verknüpft statt zu doppeln. Der KI-Bestätigungstext läuft über den
Provider-Layer mit Credit-Reservierung; ohne Modell steht die Vorlage.

**Folgen:** Kein automatischer Mailversand an Kunden ohne Freigabe, außer der
angekündigten Erinnerung; alle Automatiken hinterlassen Status und Grund am
Termin. Kosten: eine Tabelle, zwei Datenbankfunktionen, Tagesarbeit im Worker.
