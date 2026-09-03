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
