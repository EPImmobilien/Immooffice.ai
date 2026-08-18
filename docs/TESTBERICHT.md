# Testbericht Durchstich v0.1

**Stand:** 17.08.2026 · Master-Prompt Abschnitt 19 · Phase 1

---

## 1. Automatisierte Prüfungen

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Typprüfung (strict) | `npm run typecheck` | bestanden |
| Linting | `npm run lint` | bestanden |
| Unit-Tests | `npm run test` | 103 Tests bestanden |
| Produktions-Build | `npm run build` | bestanden, 25 Routen |
| Marken-Scan | `npm run marken-scan` | sauber, keine Treffer |

Alles zusammen: `npm run pruefen`.

### Abgedeckte Unit-Tests

| Bereich | Prüft |
|---|---|
| Design-Tokens | Beide Dunkelmodus-Blöcke setzen dieselben Tokens; jeder Dunkel-Token hat eine Entsprechung im Hellmodus; die fixierten Markenfarben sind unverändert |
| Lückenerkennung | Vollständige Objekte melden keine Lücken; fehlende Pflichtangaben werden gemeldet statt ergänzt; kategorieabhängige Regeln greifen nur, wo sie gelten |
| Entwurfstexte | Ohne Modell keine KI-Kennzeichnung und keine Credits; nur erfasste Werte werden verwendet; bei fehlendem Baujahr taucht **kein** Jahr im Text auf |
| Exposé-Vorlagen | Alle fünf Vorlagen erzeugen gültige PDF-Dateien, kommen ohne Bilder und ohne optionale Angaben aus, **betten die angekündigte Zahl Bilder tatsächlich ein**, **haben die vorgesehene Seitenzahl**, und Kurzexposé wie Aushang bleiben auch mit überlangen Texten einseitig |
| Marketingmotive | Zeilenumbruch an Wortgrenzen mit sichtbarer Kürzung; alle Texte liegen innerhalb der Fläche; das Preisband überlagert den Textblock in keinem der sechs Formate; Sonderzeichen werden maskiert; Mandanten-Branding schlägt durch; KI-Hinweis nur bei KI-Beteiligung |
| OpenImmo-Prüfung | Vollständiges Objekt geht durch; fehlende Freigabe, Energieangaben oder Kaltmiete blockieren; Grundstücke brauchen keine Energieangaben; „Preis auf Anfrage“ ist zulässig |
| OpenImmo-XML | Rahmenelemente und Namensraum; Vermarktungs- und Nutzungsart als Attribute; Straße nur bei freigegebener Adresse; Punkt als Dezimaltrenner; Übertragungsart NEU/CHANGE; Mehrfachobjekte; Maskierung von Sonderzeichen und Entfernen von Steuerzeichen |
| OpenImmo-Anhänge | Gruppe, Format und Dateiname je Anhang; **der Vermerk für KI-bearbeitete Bilder steht im `anhangtitel`**, auch ohne eigenen Bildtitel; ohne Anhänge entfällt der Block; die Position im Dokument liegt zwischen `freitexte` und `verwaltung_objekt` |
| Übertragungspaket | Archivkennung und zentrales Verzeichnis; gleiche Eingabe ergibt dieselben Bytes; **ein echter Entpacker (`unzip -t`) liest das Archiv und bestätigt die Prüfsummen**; Umlaute im Dateinamen bleiben erhalten; zu große Pakete werden abgewiesen statt still falsch geschrieben |
| Web-Exposé-Token | Länge und Zeichenmenge stimmen mit der Prüfung in der Datenbank überein; 2000 Aufrufe ergeben 2000 verschiedene Werte; **die Zeichen sind gleichmäßig verteilt** — eine Häufung würde den Raum verkleinern, ohne aufzufallen |
| Öffentliche Adresse | Basis und Token werden korrekt zusammengesetzt; weitergeleiteter Host und weitergeleitetes Schema haben Vorrang; lokal bleibt es bei `http` |
| Energiekennwert | **Bedarfsausweis schreibt `endenergiebedarf`, Verbrauchsausweis `energieverbrauchkennwert` — und jeweils das andere Element gerade nicht.** Portale weisen Objekte ab, bei denen Typ und Element nicht zusammenpassen |

Drei Tests wurden durch gezielte Änderung am Code gegengeprüft und schlagen
dann fehl — sie können die jeweilige Regression also tatsächlich erkennen:
der Token-Test (ein Token entfernt), der Überlagerungstest der Marketingmotive
(Preisband verschoben) und der Einseitigkeitstest des Aushangs (Titelkürzung
aufgehoben).

Beim Schreiben der Vorlagentests fiel auf, dass die PDF-Erzeugung ein
**unlesbares Bild wortlos verwirft**, ohne einen Fehler zu melden. Die erste
Fassung der Tests prüfte nur, ob eine PDF-Datei entstand, und war deshalb grün,
obwohl kein einziges Bild eingebettet wurde. Die Tests zählen jetzt die
eingebetteten Bildobjekte im fertigen Dokument.

**Grün heißt nicht brauchbar.** Die Vorlagen waren nach Testlage fehlerfrei und
trotzdem unbrauchbar: Sie liefen in Helvetica statt in der Hausschrift, die
Akzentfarbe kam praktisch nicht vor, und alles lag zwischen 9 und 11 Punkt —
das Ergebnis las sich wie ein Formular. Bei der Premium-Vorlage füllte das
Titelbild Seite eins allein, der Titel stand auf einer zweiten, sonst leeren
Seite. Nichts davon konnte ein Test finden, der nur die Dateikennung prüft.
Aufgefallen ist es erst beim Betrachten der gerenderten Seiten.

`src/lib/expose/muster.test.tsx` erzeugt die Muster-PDFs dafür auf Zuruf:

```bash
MUSTER_ZIEL=/tmp/muster npx vitest run src/lib/expose/muster.test.tsx
pdftoppm -png -r 72 /tmp/muster/klassisch.pdf /tmp/muster/klassisch
```

Der Seitenzahltest hält seither fest, was jede Vorlage produzieren soll. Er hat
sich beim Wechsel auf Querformat sofort bezahlt gemacht: Drei Vorlagen liefen
dabei um wenige Punkte über und erzeugten je eine fast leere Folgeseite.

**Eigene Höhenrechnung statt Layout-Engine.** Die Premium-Titelseite besteht aus
einem Bildbereich und einem Titelband. Mit `flexGrow` für das Bild füllte dieses
die Seite und schob das Band auf die nächste. Eine Rechnung aus der Zeilenzahl
des Titels lag mal vier Punkt zu niedrig, mal vierzehn zu hoch — beides genügt
für eine überzählige Seite. Jetzt sind beide Höhen feste Zahlen, die zusammen
genau eine Seite ergeben, und der Titel ist auf zwei Zeilen begrenzt.

## 2. Nachweis der Mandantentrennung

Vorgabe aus Abschnitt 19 und Voraussetzung für **Gate B**.
Skript: [`supabase/tests/rls-mandantentrennung.sql`](../supabase/tests/rls-mandantentrennung.sql)

Der Test legt zwei Mandanten mit je einem Inhaber sowie einen Nur-Lese-Benutzer
an, schlüpft per `set_config` in deren Sitzung und prüft die Policies direkt in
der Datenbank. Alles läuft in einer Transaktion und wird zurückgerollt.

| # | Prüfung | Ergebnis |
|---:|---|---|
| 1 | A sieht nur eigene Objekte | bestanden |
| 2 | A sieht nur eigene Kontakte | bestanden |
| 3 | A sieht nur den eigenen Mandanten | bestanden |
| 4 | A kann fremdes Objekt nicht über die ID lesen | bestanden |
| 5 | A kann fremdes Objekt nicht ändern | bestanden |
| 6 | A kann fremdes Objekt nicht löschen | bestanden |
| 7 | A kann nicht im fremden Mandanten anlegen | bestanden |
| 8 | A kann im eigenen Mandanten anlegen (Gegenprobe) | bestanden |
| 9 | B sieht ausschließlich eigene Objekte | bestanden |
| 10 | B sieht nur Benutzer des eigenen Mandanten | bestanden |
| 11 | Nur-Lesen sieht Objekte des eigenen Mandanten | bestanden |
| 12 | Nur-Lesen darf nicht anlegen | bestanden |
| 13 | Nur-Lesen darf nicht ändern | bestanden |

**13 von 13 bestanden.** Prüfung 8 ist bewusst enthalten: Ohne sie könnte der
Test auch dann grün sein, wenn schlicht gar nichts erlaubt wäre.

### Wohlgeformtheit des XML

Das erzeugte Dokument wurde zusätzlich mit einem echten XML-Parser gegengelesen:
Wurzelelement und Namensraum stimmen, die Struktur ist wohlgeformt, und
maskierte Sonderzeichen (`< & " ²`) kommen beim Auslesen unverändert zurück.

**Offen:** Die Prüfung gegen die **offizielle XSD** des OpenImmo e. V. steht aus
— das Schema liegt hier nicht vor. Bis dahin gilt der Vorbehalt aus dem
Kopfabschnitt von `OPENIMMO_MAPPING.md`: Die Feldabbildung ist fachlich
abgeleitet, die exakten Elementnamen sind vor dem Produktivbetrieb zu
bestätigen.

## 2a. Weitere Nachweise in der Datenbank

Dieselbe Bauart wie der RLS-Test: Transaktion, Rollenwechsel per
`set_config`, Rollback am Ende. Geprüft wird die Regel dort, wo sie gilt — in
der Datenbank, nicht in der Oberfläche.

| Skript | Gegenstand | Ergebnis |
|---|---|---|
| [`credits.sql`](../supabase/tests/credits.sql) | Unveränderbares Ledger, kein negativer Saldo, älteste Credits zuerst, Freigabe reservierter Credits bei fehlgeschlagenen Aufträgen | 16 von 16 |
| [`matching.sql`](../supabase/tests/matching.sql) | Vermarktungsart, Kategorie, Ort und Preisrahmen schließen aus; weiche Kriterien ordnen nur; bearbeitete Treffer werden nicht überschrieben; keine Treffer über die Mandantengrenze | 10 von 10 |
| [`web-expose.sql`](../supabase/tests/web-expose.sql) | Nur festgelegte Felder gelangen nach außen; Passwortschutz, Widerruf und Ablauf wirken sofort; Tabellen bleiben für Besucher leer; Kontaktformular prüft Eingaben und Freigabe; der PDF-Download zählt nicht als Seitenaufruf | 20 von 20 |
| [`funktionsrechte.sql`](../supabase/tests/funktionsrechte.sql) | Nicht angemeldete und angemeldete Aufrufer können keine Credits gutschreiben, kein Monatskontingent zuteilen, keinen fremden Kontostand lesen und kein Matching auslösen — mit Gegenproben für das, was erlaubt bleiben muss | 8 von 8 |
| [`bilder.sql`](../supabase/tests/bilder.sql) | Original bleibt unverändert, Bearbeitung ist eine eigene Version mit Beschreibung, KI-Kennzeichen nicht entfernbar, Bildpfad unveränderlich, ein Titelbild je Objekt, keine Sicht auf fremde Bilder | 10 von 10 |

Die Prüfung des Datenbankanbieters hat dabei einen **schwerwiegenden Befund**
zutage gefördert: `credits_gutschreiben` nahm die Mandanten-ID als Parameter
entgegen, prüfte den Aufrufer nicht und war als security-definer-Funktion für
**nicht angemeldete** Aufrufer freigeschaltet. Wer eine Mandanten-ID kannte, hätte
sich ohne Anmeldung beliebig viele Credits gutschreiben können. Ursache ist eine
Voreinstellung von Postgres, nicht ein Tippfehler: Das Ausführungsrecht neuer
Funktionen geht an `PUBLIC`, und die REST-Rolle `anon` erbt davon. Behoben in
`funktionsrechte_einschraenken`, festgehalten in `funktionsrechte.sql`.

Der Matching-Test hat eine **Fehlentscheidung im Entwurf aufgedeckt**: Ein
Objekt in Hamburg erhielt für ein Kieler Suchprofil noch 75 von 100 Punkten,
weil der Ort als weiches Kriterium zählte. Für den Makler ist das kein
schlechterer Treffer, sondern Rauschen. Der Ort ist seither ein
Ausschlusskriterium (Migration `matching_ort_als_ausschluss`).

## 3. Manuell geprüft

| Prüfung | Ergebnis |
|---|---|
| Öffentliche Routen erreichbar (`/`, `/anmelden`, `/registrieren`, `/styleguide`) | HTTP 200 |
| Geschützte Route ohne Anmeldung (`/dashboard`) | HTTP 307 auf `/anmelden?weiter=%2Fdashboard` |
| Content-Security-Policy mit Nonce | Nonce an den Skript-Elementen vorhanden |
| Hydration ohne Fehler | keine Konsolenfehler |
| Farbmodus-Umschalter inklusive Persistenz | funktioniert, übersteht das Neuladen |
| Exposé-PDF | Branding angewandt, KI-Vermerk enthalten, Haftungshinweis im Fuß |

## 4. Nicht geprüft — und warum

**Die Anwendung konnte in dieser Arbeitsumgebung nicht gegen die Datenbank
betrieben werden.** Der ausgehende Netzzugang der Umgebung lässt Verbindungen zu
`usguiggfciavwzkdfjgt.supabase.co:443` nicht zu (Antwort 403 des vorgeschalteten
Proxys). Betroffen ist ausschließlich der Weg *Anwendung → Datenbank*; die
Verwaltungsschnittstelle, über die Migrationen und der RLS-Test liefen, nutzt
einen anderen Weg und funktioniert.

Das ist eine Einschränkung der Arbeitsumgebung, kein Mangel des Codes. Der
Nachweis steht aber aus und ist beim ersten Deployment nachzuholen:

| Offen | Nachzuholen |
|---|---|
| Registrierung mit Anlage von Mandant und Inhaber | beim ersten Deployment |
| Anmeldung und Sitzungsauffrischung | beim ersten Deployment |
| Objekt anlegen, bearbeiten, löschen über die Oberfläche | beim ersten Deployment |
| Kontakt anlegen mit Rollen | beim ersten Deployment |
| Exposé-Textentwurf mit echten Objektdaten | beim ersten Deployment |
| PDF-Export mit echten Mandantendaten | beim ersten Deployment |
| Verhalten bei aktivierter E-Mail-Bestätigung | beim ersten Deployment |

Die zugrunde liegenden Bausteine sind einzeln geprüft: Die Datenbankschicht über
den RLS-Test, die Texterzeugung und die PDF-Ausgabe über Unit-Tests, der
Auslieferungsweg über die manuellen Prüfungen.

## 4a. Ein Ausfall, den kein Test gesehen hat

In der Produktion ließ sich **kein einziges PDF-Exposé erzeugen**, während
lokal und im Test alle 34 PDF-Prüfungen grün waren. Der Fall ist hier
festgehalten, weil er eine Lücke in der Prüfstrategie offenlegt und nicht
einen Fehler in der Fachlogik.

Ursache: Die Hausschriften wurden zur Laufzeit über `require.resolve` aus
`@fontsource` geladen. Für einen Bundler ist ein `require.resolve` auf eine
`.woff`-Datei nicht nachvollziehbar — die Dateien landeten nicht im
Funktionsbündel, `Font.register` zeigte auf Pfade, die es dort nicht gab, und
`renderToBuffer` brach mit `MODULE_NOT_FOUND` ab. Im Test fiel das nie auf,
weil `node_modules` dort immer vorhanden ist.

Der naheliegende Ausweg trägt nicht: `outputFileTracingIncludes` in
`next.config.ts` wendet Next **nur auf webpack-Einträge** an, gebaut wird mit
Turbopack. Nachgeprüft an den erzeugten `.nft.json`-Dateien — sie blieben ohne
jede Schriftdatei, obwohl der Eintrag gesetzt war.

Behoben, indem die sechs Schnitte als Base64 Teil des Quelltexts sind
(`scripts/schriften-einbetten.mjs` erzeugt `src/lib/expose/schriften-daten.ts`).
Damit existiert kein Pfad mehr, der ins Leere zeigen kann.

Drei Nachweise, die den Fehler künftig fangen:

| Nachweis | Was er sichert |
|---|---|
| `schriften.test.ts` prüft Datenquellen statt Dateipfade | Ein Rückfall auf `require.resolve` fällt sofort auf |
| PDF-Tests laufen mit **entferntem** `@fontsource` durch (34/34) | Die Erzeugung hängt an keiner Datei auf der Platte |
| Base64 der eingebetteten Schnitte gegen `@fontsource` verglichen | Eine Aktualisierung der Schriften läuft nicht still auseinander |

Zusätzlich haben beide PDF-Routen jetzt eine Fehlerbehandlung. Vorher schlug
ein Fehlschlag als allgemeine Serverfehlerseite durch: Der Download blieb ohne
Erklärung leer, und in welchem Schritt es klemmte, war von außen nicht zu
erkennen.

Die Lehre ist dieselbe wie beim ungültigen Test-PNG weiter oben: **Ein Test,
der die Umgebung der Produktion nicht nachbildet, prüft die Fachlogik — nicht
die Auslieferung.**

## 4b. Nachweise für Unterlagen, Verlauf, Aufgaben und Termine

`supabase/tests/verlauf-und-arbeitsmittel.sql` — **25 von 25 bestanden.**
Schwerpunkte, die über eine reine Mandantentrennung hinausgehen:

| Nachweis | Warum er zählt |
|---|---|
| Ein Verlaufseintrag lässt sich **nicht ändern** (Prüfung 6) | Ein Protokoll, das man glätten kann, ist als Nachweis wertlos |
| Ein Verlaufseintrag lässt sich **nicht löschen** (7) | Dieselbe Begründung; beides über fehlende Policies, nicht über die Oberfläche |
| Anlegen, Statuswechsel, Unterlage und Termin erzeugen von selbst einen Eintrag (1, 3, 4, 5) | Ein neuer Codepfad kann das Protokollieren nicht vergessen — es hängt an Datenbank-Triggern |
| Der Eintrag hält den Verursacher fest (2) | Ohne Urheber ist der Verlauf kein Nachweis |
| Ein **Grundbuchauszug** kann nicht an Interessenten freigegeben werden (22, 25) | Ein Fehlklick ist nicht zurückzuholen: Die Datei kann in derselben Minute heruntergeladen sein |
| Unterlagen sind ohne Zutun `intern` (11) | Freigabe ist die Ausnahme, nicht die Vorbelegung |
| Der Dokumentpfad ist unveränderlich (12) | Ein Update würde den Datensatz unbemerkt von der Datei entkoppeln |
| „Erledigt" ohne Bearbeiter wird abgelehnt (15) | Sonst steht später „fertig" da, ohne dass jemand dafür geradesteht |
| `anon` darf nicht in den Verlauf schreiben (21) | Dieselbe Klasse Fehler wie bei `credits_gutschreiben` — die Funktion läuft mit erhöhten Rechten |
| Nur-Lese-Zugriff sieht den Verlauf, schreibt aber nicht (18–20) | Rollen wirken auch auf die neuen Tabellen |

Die Regel „vertrauliche Unterlagen bleiben intern" steht **doppelt**: als
Bedingung in der Datenbank und in der Server-Aktion. Das ist bewusst
redundant — bei einer Unterlage, die einmal draußen ist, hilft keine
nachträgliche Korrektur.

## 4c. Verweise überschreiten den Mandanten nicht

`supabase/tests/verweise-mandantenrein.sql` — **9 von 9 bestanden.**

Beim Verdrahten der Beteiligten ist ein Befund aufgefallen: Jede Policy prüfte
bisher nur den **eigenen** `mandant_id` einer Zeile. Ein Datensatz mit dem
eigenen Mandanten, aber einem **fremden** `objekt_id` oder `kontakt_id` kam
damit durch — Fremdschlüssel verweisen auf die Tabelle, nicht auf den
Mandanten.

Ein Datenleck war das nicht: Beim Lesen filtert die Row-Level-Security der
Zieltabelle, ein solcher Verweis liefert nichts. Es entstanden aber Zeilen,
die auf Fremdes zeigen — eine Aufgabe zu einem unsichtbaren Objekt, ein
Verlaufseintrag an einem fremden Kontakt. Bei jeder späteren Auswertung ist
das eine Fehlerquelle, und die nächste Policy, die über einen solchen Verweis
joint, macht daraus ein echtes Problem.

Geschlossen durch einen zentralen Trigger `intern.verweise_mandantenrein()`,
angehängt an `kontakt_objekt`, `objekt_dokumente`, `aktivitaeten`, `aufgaben`,
`termine` und `objekt_bilder`. Geprüft ist beides: dass fremde Verweise
abgewiesen werden (1, 2, 4, 5, 6, 7) **und** dass stimmige weiter durchlaufen
(3, 8, 9) — eine Härtung, die den Normalfall mit abwürgt, ist keine.

## 4d. Nur freigegebene Unterlagen im Web-Exposé

`supabase/tests/web-expose-unterlagen.sql` — **7 von 7 bestanden.**

Anders als bei Bildern ist hier **nicht** alles öffentlich, was am Objekt hängt.
Bilder eines veröffentlichten Objekts sind samt und sonders zur Ansicht
gedacht; Unterlagen sind es nicht. Geprüft ist deshalb beides — dass die
freigegebene Unterlage ankommt und dass drei andere Fälle draußen bleiben:

| Fall | Erwartung |
|---|---|
| Grundriss, freigegeben, gültig | erscheint |
| Protokoll, nicht freigegeben | erscheint nicht |
| Grundbuchauszug | kann „freigegeben" nicht erreichen (Bedingung in der Tabelle) |
| Energieausweis, freigegeben, **abgelaufen** | erscheint nicht |

Zwei Punkte, die über die Liste hinausgehen:

- **Die Speicherfreigabe zieht dieselbe Grenze wie die Liste** (4–6). Wäre sie
  weiter, käme man an der Liste vorbei an die Datei. Die Prüffunktion vergleicht
  deshalb den **vollständigen Pfad** gegen die Unterlagentabelle — nicht, wie
  das Gegenstück für Bilder, ein Pfadsegment gegen die Veröffentlichung. Bei
  geändertem Pfadaufbau gäbe eine Segmentprüfung eine Datei frei, die niemand
  freigegeben hat.
- **Nach Widerruf ist die Datei gesperrt** (7). Eine Seite ohne Verweis, deren
  Dateien weiter erreichbar sind, wäre kein Widerruf.

Die Liste wird in `web_expose_oeffnen` Feld für Feld aufgebaut und nicht mit
`to_jsonb` erzeugt (3). Sonst wanderte jede später ergänzte Spalte automatisch
nach draußen — der interne Vermerk zum Beispiel.

## 4e. Passwort-Wiederherstellung — geprüft und offen

Neu geprüft (`src/lib/auth/ziel.test.ts`, 7 Prüfungen): Die Weiterleitung nach
Anmeldung und nach einem Mail-Link nimmt nur eigene Pfade an. Abgewiesen werden
vollständige Adressen, **schemalose** Adressen (`//fremde.example` — kein
relativer Pfad, sondern ein fremder Host) und der Rückstrich (`/\fremde.example`
— Browser lesen ihn in der Hostposition wie einen Schrägstrich). Ohne diese
Prüfung wäre jeder der beiden Wege eine offene Weiterleitung: ein Link, der auf
der vertrauten Adresse beginnt und auf einer fremden endet.

Die Prüfung lag vorher zweimal im Code, in zwei unterschiedlich strengen
Fassungen. Jetzt einmal, mit Test.

Beim Bauen gefunden und behoben: `/passwort-vergessen` und der Rückläufer
`/auth/bestaetigen` waren nicht als öffentlich eingetragen. Wer sein Passwort
vergisst, ist gerade **nicht** angemeldet — die Seite hätte auf die Anmeldung
zurückgeworfen und damit eine Schleife gebildet. `/passwort-neu` bleibt
absichtlich geschützt: Dorthin gelangt man nur mit der Sitzung, die der
Wiederherstellungslink erzeugt, und genau das ist der Nachweis über das Postfach.

**Zwei Handgriffe in der Supabase-Konsole, ohne die der Link nicht ankommt:**

1. Unter *Authentication → URL Configuration* die Adresse
   `https://<ihre-domain>/auth/bestaetigen` als **Redirect URL** eintragen.
   Supabase leitet nur auf freigegebene Adressen weiter.
2. `NEXT_PUBLIC_APP_URL` auf die Produktionsadresse setzen. Ohne diese Angabe
   wird die Basisadresse aus den Anfragekopfzeilen erschlossen — das trägt, ist
   aber bei einem vorgeschalteten Dienst nicht verlässlich.

Nicht geprüft, weil in dieser Arbeitsumgebung nicht prüfbar: der Mailversand
selbst und der vollständige Durchlauf im Browser. Der eingebaute Versand von
Supabase ist mengenbegrenzt und für den Dauerbetrieb nicht geeignet.

## 4f. Rechte je Benutzer — und ein Fehler, den erst der Test fand

`supabase/tests/rechte-selbstermaechtigung.sql` — **9 von 9 bestanden**, dazu
13 Einheitentests in `src/lib/auth/rechte.test.ts`.

**Befund vorab: die Übersteuerung war wirkungslos.** Die Spalte
`benutzer.rechte_uebersteuerung` gab es seit dem Datenmodell, die Auswertung in
`hatRecht` ebenfalls — nur den Weg dazwischen nicht. Die Sitzung lud das Feld
nicht, und alle 78 Prüfstellen riefen ohne Übersteuerung auf. Ein entzogenes
Recht wäre also weiterhin vorhanden gewesen, ohne dass irgendetwas
fehlgeschlagen wäre. Behoben: Die Sitzung trägt das Feld, alle Prüfstellen und
die Navigation geben es mit.

**Selbstermächtigung geschlossen.** Bisher galt die Sperre nur für Nutzer ohne
Verwaltungsrechte. Ein Administrator konnte sich selbst Rechte geben, die seine
Rolle nicht vorsieht. Jetzt sind Rolle und Rechte am **eigenen** Datensatz für
niemanden änderbar — dasselbe Prinzip wie beim Löschen und Abschalten.

**Was der Test fand — und die Migration allein nicht gezeigt hätte:**

Der erste Anlauf schrieb die Sperre als
`create or replace function public.pruefe_benutzer_aenderung()`. Die Migration
meldete Erfolg. Der Trigger zeigt aber auf die Fassung in `intern`: Es entstand
eine zweite, von niemandem aufgerufene Funktion, die Sperre blieb wirkungslos,
und nichts wies darauf hin. Nur weil Prüfung 3 die **Wirkung** misst statt die
Anwendung der Migration, fiel es auf.

Beim Nachsehen kam ein zweiter Punkt heraus: Die wirksame Fassung enthielt
**mehr Regeln als die älteste Migrationsdatei zeigt** — Schutz des letzten
aktiven Inhabers, Vergabe der Inhaberrolle nur durch den Inhaber, E-Mail-Änderung
nur durch die Verwaltung. Hätte die erste Fassung das richtige Schema getroffen,
wären diese drei Regeln stillschweigend verschwunden. Die Prüfungen 5 bis 9
halten sie seither fest.

## 4g. Wertermittlung — geprüfte Rechnung statt Blackbox

`src/lib/wertermittlung.test.ts` — **22 Prüfungen.** Der Master-Prompt verlangt
hier ausdrücklich keine Blackbox und keine automatisch „ermittelten" Werte. Die
Rechenfunktionen beschaffen deshalb keine Marktdaten, schätzen nichts und füllen
keine Annahme selbst aus; jeder Ansatz kommt vom Nutzer.

Geprüft ist unter anderem:

| Prüfung | Warum sie zählt |
|---|---|
| Vervielfältiger 5 % / 30 Jahre ≈ 15,37 | Nachgerechnetes Lehrbuchbeispiel zu § 20 ImmoWertV |
| Zinssatz 0 fällt auf die Restnutzungsdauer zurück | Die Formel ist bei p = 0 nicht definiert; ohne Sonderfall entstünde `NaN` und liefe als Ergebnis durch |
| Alterswertminderung auf 100 % begrenzt | Ohne Grenze ergäbe ein 120 Jahre altes Haus bei 80 Jahren Gesamtnutzungsdauer einen **negativen** Gebäudewert — der Sachwert läge unter dem Bodenwert |
| Median statt Mittelwert beim Vergleichswert | Bei drei Vergleichen zieht ein Ausreißer den Mittelwert um 25 % nach oben |
| Negativer Gebäudereinertrag wird erklärt | Ein zulässiges Ergebnis bei hohem Bodenwert — es muss erklärt und nicht versteckt werden |
| Bewirtschaftungsquote 0 gilt als Angabe | Eine Wahrheitsprüfung hätte sie als „fehlt" behandelt |
| Fehlende Ansätze werden benannt, nicht geraten | Der Kern der Vorgabe |

**Bewusst nicht gebaut:** ein gewichteter Mittelwert über die drei Verfahren.
Welches Verfahren trägt, ist eine fachliche Entscheidung — bei einer
selbstgenutzten Wohnung der Vergleichswert, bei einem Zinshaus der Ertragswert.
Eine Software, die daraus stillschweigend einen Durchschnitt bildet, trifft
diese Entscheidung anstelle des Nutzers und verdeckt sie. Angezeigt wird die
Bandbreite; das führende Verfahren wählt der Nutzer.

Gespeichert werden **nur die Ansätze**, nie das Ergebnis. Ein gespeichertes
Ergebnis könnte von seinen Ansätzen abweichen, sobald an der Rechnung etwas
korrigiert wird — dann stünde eine Zahl im System, die sich aus den daneben
stehenden Angaben nicht mehr herleiten lässt.

Der Pflichthinweis (Marktpreiseinschätzung, keine gutachterliche Aussage, kein
Ersatz für ein Verkehrswertgutachten nach § 194 BauGB) steht an einer Stelle im
Code und erscheint auf der Übersicht **und** oben auf jedem Rechenblatt — nicht
als Fußnote.

## 4h. Verträge und die einfache elektronische Signatur

`supabase/tests/vertraege.sql` — **12 von 12 bestanden**, dazu 18
Einheitentests in `src/lib/vertraege.test.ts`.

Drei rechtliche Vorgaben bestimmen den Aufbau, und alle drei sind geprüft:

**Die Signatur ist eine einfache.** Sie wird an keiner Stelle als
fortgeschrittene oder qualifizierte Signatur dargestellt. Der Einordnungstext
steht an einer einzigen Stelle im Code und erscheint in der Übersicht, auf der
Vertragsseite **und** auf der öffentlichen Unterschriftsseite — wer
unterzeichnet, soll wissen, was er tut. Für die Textform nach § 126b BGB
genügt sie, und § 656a BGB verlangt für Maklerverträge über Wohnungen und
Einfamilienhäuser mit Verbrauchern ausdrücklich Textform, nicht Schriftform.

**Das Widerrufsrecht wird mitgeführt, nicht erwähnt.** Ohne hinterlegtes
Belehrungsdatum zeigt die Anwendung nicht vierzehn Tage an, sondern zwölf
Monate und vierzehn Tage nach § 356 Absatz 3 Satz 2 BGB. Eine Anwendung, die
pauschal vierzehn Tage anzeigt, wiegt einen Makler in Sicherheit, der seine
Provision noch ein Jahr lang verlieren kann. Bei unlesbarem Belehrungsdatum
gilt die **lange** Frist — der sichere Fehlschlag ist der zum Nachteil des
Maklers, nicht der des Kunden.

**Kein Muster wird als rechtssicher bezeichnet.** ImmoOffice.ai liefert
bewusst gar keinen Mustertext mit; der Hinweis auf anwaltliche Prüfung ist
fest verdrahtet, und ein Test prüft, dass das Wort „rechtssicher" darin nicht
vorkommt.

Technisch entscheidend:

| Prüfung | Warum sie zählt |
|---|---|
| Text nach der ersten Unterschrift gesperrt (10) | Sonst stünde eine Unterschrift unter einem anderen Text als dem unterzeichneten |
| Entwurf bleibt änderbar (11) | Gegenprobe — eine Sperre, die den Normalfall mit abwürgt, ist keine |
| Fingerabdruck stimmt mit der Anwendung überein (8) | Datenbank und TypeScript rechnen SHA-256 über denselben Text. Wichen sie ab, meldete die Anwendung bei **jedem** Vertrag fälschlich eine Änderung — der Hinweis wäre wertlos, weil er immer erschiene |
| Kein zweites Unterzeichnen über denselben Link (12) | Der Vertrag ist danach nicht mehr `versendet` |
| Kein Mandantenbezug nach außen (3) | Die Auskunft zählt die Felder auf, statt sie abzuziehen |

Der Fingerabdruck entsteht **in der Datenbank** aus dem gespeicherten Text. Ein
vom Browser mitgeschickter Hash wäre die Behauptung des Unterzeichners darüber,
was er gesehen hat, und damit als Nachweis wertlos. Er ist ausdrücklich als
Schutz gegen **versehentliche** Änderung bezeichnet, nicht als
kryptografischer Manipulationsschutz: Wer die Datenbank beherrscht, kann Text
und Fingerabdruck gemeinsam austauschen.

**Offen:** Der Unterschriftslink wird nicht automatisch versendet — dafür fehlt
der eigene Mailversand. Die Oberfläche sagt das ausdrücklich, statt es
vorzutäuschen.

## 5. Offene Punkte aus der Sicherheitsprüfung

Die Prüfung des Datenbankanbieters meldet einen verbleibenden Punkt:

| Punkt | Maßnahme |
|---|---|
| Schutz gegen bekannte geleakte Passwörter ist deaktiviert | In der Projektverwaltung aktivieren. Abschnitt 16 fordert den Abgleich; er lässt sich nur dort einschalten, nicht per Migration. |

Die verbleibenden Meldungen zu security-definer-Funktionen betreffen
`registriere_mandant` sowie die beiden Web-Exposé-Funktionen. Sie **müssen** ohne
Anmeldung erreichbar sein und prüfen jeweils selbst, was sie preisgeben.

Drei Befunde wurden bereits während der Umsetzung behoben:

1. Auf `auth.users` lag noch ein Trigger aus dem Vorentwurf, der in die
   entfernte Tabelle `profiles` schrieb. **Jede Registrierung wäre daran
   gescheitert.** Entfernt in Migration `aufraeumen_und_helfer_kapseln`.
2. Die RLS-Hilfsfunktionen lagen im Schema `public` und waren dadurch als
   REST-Endpunkte aufrufbar. Sie liegen jetzt im Schema `intern`, das nicht
   ausgeliefert wird.
3. **`credits_gutschreiben` war ohne Anmeldung aufrufbar** und schrieb einer
   beliebigen, als Parameter übergebenen Mandanten-ID Credits gut. Entfernt in
   Migration `funktionsrechte_einschraenken`; die Funktion gehört jetzt
   ausschließlich zu Stripe-Webhook und Job-Worker.

## 6. Bekannte Einschränkungen des Durchstichs

- Ohne hinterlegten Modellzugang entstehen **Entwurfstexte aus Objektdaten**,
  keine KI-Texte. Sie werden ausdrücklich nicht als KI-Inhalt gekennzeichnet und
  kosten keine Credits.
- Der Credit-Kontostand auf dem Dashboard zeigt den Testwert an; das Ledger
  entsteht im weiteren Verlauf von Phase 1.
- Bildbearbeitung ist datenseitig vorbereitet (Versionen, unveränderbares
  Original, nicht entfernbares KI-Kennzeichen), aber noch ohne Bedienoberfläche.
- Je Objekt gibt es **einen** öffentlichen Link. Mehrere Links mit eigenem
  Passwort und eigener Frist — etwa einer je Interessent — sind datenseitig
  möglich, brauchen aber eine eigene Verwaltung in der Oberfläche.
- Kalender, Aufgaben, Wertermittlung, Verträge, Auswertungen, Einstellungen und
  Plattform-Admin sind in der Navigation als „geplant“ gekennzeichnet und ohne
  Funktion.
