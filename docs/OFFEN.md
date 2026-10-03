# Offen

Was ohne Verhaltensänderung, ohne fehlende Zugangsdaten oder ohne Netzzugang
nicht lösbar ist. Nach Auftrag Abschnitt 9.

## Umgebung

| Punkt | Wirkung |
|---|---|
| Egress-Proxy sperrt `api.supabase.com` und beide `*.supabase.co` | Kein CLI-Export, kein `db push`. Schema nur über die Verwaltungsschnittstelle lesbar. |
| ~~Egress-Proxy sperrt `unpkg.com` und `cdn.jsdelivr.net`~~ | **Gelöst am 28.09.2026:** `.github/workflows/oberflaeche-pruefen.yml` ruft alle geladenen Adressen auf einem Runner ab und lädt die Seite in einem echten Chromium. Ergebnis: alle 14 Bibliotheken antworten mit 200, die Anwendung startet fehlerfrei, die Anmeldung geht durch. Die Sperre bleibt, aber sie blockiert den Nachweis nicht mehr. |
| Kein Supabase-CLI, Installation ohne Netz nicht möglich | `supabase functions download`, `supabase secrets list`, `supabase db dump` entfallen. |
| ~~Ausrollen der Edge Functions nur über das MCP-Werkzeug, Datei für Datei~~ | **Gelöst am 28.09.2026:** `.github/workflows/funktionen-ausrollen.yml`. Ein Actions-Runner hat freien Netzzugang und überträgt die Dateien so, wie sie im Repository liegen — byte-genau, ohne Abschrift. Braucht das Repository-Geheimnis `SUPABASE_ACCESS_TOKEN`. |

## Zugangsdaten

`.env.local` enthält die Werte aus Auftrag Abschnitt 2 nicht. Betroffene
Funktionen entstehen nach Abschnitt 2 mit Status `SPÄTER` hinter einem
Feature-Flag. Einzeln aufgeführt in `docs/SECRETS.md`.

## ~~Quelltext der Edge Functions~~ — erledigt am 28.09.2026

~~130 Funktionen, mehrere Megabyte. Nicht über die Verwaltungsschnittstelle
holbar.~~ Der Betreiber hat sie mit dem Supabase-CLI geholt: 143 Funktionen,
2,8 MB. 139 davon sind neutralisiert übernommen, vier entfallen nach Phase 1.4.
Einzelheiten in `docs/EDGE_FUNCTIONS.md`.

## ~~Der Dienstschlüssel liest über die Mandantengrenze~~ — erledigt am 30.09.2026

62 Fundstellen in 51 Funktion/Tabelle-Paaren, gefunden mit
`tests/dienstschluessel-mandant.py`. **Alle behoben.** Die Prüfung läuft in
`npm run check` mit und meldet noch 21 Abfragen, die aus einem genannten
Grund über alle Mandanten gehen: Cron-Läufe, Missbrauchssperren, Kontosuche.
Keine davon gibt Inhalte eines fremden Mandanten heraus.

Einzelheiten in `docs/ENTSCHEIDUNGEN.md` — die beiden Einträge vom
30.09.2026. Das Buch in der Prüfung selbst ist der aktuelle Stand.

**Was die Prüfung nicht leistet:** sie liest Abfragen, nicht Wirkung. Eine
Abfrage mit `mandant_id` gilt ihr als eingeschränkt, auch wenn der Wert
daneben aus der falschen Quelle kommt. Sie ist ein Netz gegen unbemerktes
Hinzukommen, kein Beweis der Richtigkeit.

**Was dabei offen bleibt — drei Punkte, alle Phase 2.4:**

1. ~~**Die Funktionen sind einmandantig.**~~ **Erledigt am 30.09.2026.**
   Firmenname, Briefkopf und Anschrift kommen aus `firma_stammdaten` des
   Mandanten; `tests/firmenname-verdrahtet.py` hält den Stand (0 von
   ursprünglich 107 Vorkommen).

   **Was am Absender bewusst bleibt:** die **Absenderadresse** ist weiter die
   der Plattform. Ein Mailanbieter verschickt nur von einer Domain, die ihm
   nachgewiesen ist (SPF/DKIM); eine fremde Adresse als `From` wird
   abgewiesen oder landet im Spam. Je Mandant wechseln **Anzeigename** und
   **Antwortadresse** — der Empfänger sieht den richtigen Namen, und seine
   Antwort erreicht den richtigen Makler. Eigene Absenderdomains je Mandant
   gehören zur Anbieter-Schicht in Phase 6.

   Funktionen, die über `mail_postfaecher` versenden, nutzen ohnehin den
   SMTP-Zugang des Mandanten und sind davon nicht betroffen.

2. **Die Platzhalter-Adresse `immooffice.example` muss ersetzt werden**
   (Stand 30.09.2026: 83 Fundstellen in 45 Funktionen). Sie
   steht überall dort, wo die Vorlage ihre eigene Domain verdrahtet hatte:
   als Rückfall hinter `PORTAL_URL` und `EXPOSE_FREIGABE_BASIS`, in
   Absenderadressen und in den Empfängerlisten von `web-lead`. Die Endung
   `.example` ist nach RFC 2606 reserviert und existiert nicht — solange sie
   dort steht, gehen diese Mails ins Leere und diese Links führen nirgendwohin.
   Das ist Absicht: ein Platzhalter, der auffällt, ist besser als eine
   erfundene Domain, die zufällig jemandem gehört.

3. ~~**`vertrag-pdf` erzeugt Verträge ohne Firmenkopf.**~~ **Erledigt am
   30.09.2026.** Die Standorttabelle ist durch eine Abfrage auf
   `firma_stammdaten` ersetzt, gefiltert auf den Mandanten des Vertrags.
   Dabei kam heraus, dass der Vertrag zusätzlich einen **erfundenen
   Geschäftsführer** als Unterzeichner trug — in der Zustimmungsklausel,
   unter der Unterschrift und im Widerrufsformular; `signatur-vorgang-starten`
   setzte ihn sogar in Schreibschrift auf die Unterschriftenlinie. Beide
   Funktionen brechen jetzt ab, wenn Firmenname oder Geschäftsführer fehlen.

## ~~Der Quelltext der Oberflaeche~~ — geklärt am 28.09.2026, anders als gedacht

**Es gibt keinen.** `EPImmobilien/epworld-app` ist die iOS-Hülle; die README
sagt: „Das Portal bleibt die einzige Quelle: Netlify-Deploy wie bisher."
Daneben liegen rund zwanzig Einbau-Skripte (`warnzone-einbau.py`,
`kosten-einbau.py`, `werkzeuge-einbau.mjs` …), die **die eine `index.html`
flicken** — und dabei fertig kompilierten Code schreiben, kein JSX. Auch die
Zeile `/* E&P World – vorkompiliert TT.MM.JJJJ (…) */` ist kein Hinweis auf
einen Bauschritt: sie ist ein Änderungsvermerk, den diese Skripte bei jedem
Einbau neu setzen.

Die `index.html` **ist** die Quelle. Die Frage nach einem Stand davor ging ins
Leere.

**Gelöst durch Ausformatieren.** Die drei vorkompilierten Zeilen sind
umgebrochen: aus 2,97 MB in drei Zeilen wurden rund 136.000 lesbare. Dass dabei
nur Leerraum angefasst wurde, rechnet das Skript nach — entfernt man aus beiden
Fassungen jeden Leerraum, müssen sie zeichengleich sein. `ShopTvPage` steht
jetzt als gewöhnliche Funktion in Zeile 56719 und lässt sich normal entfernen.

**Preis:** Die Oberfläche ist nicht mehr zeilenweise mit der Vorlage
vergleichbar. Für den laufenden Abgleich gilt dieselbe Regel wie für die
Neutralisierung: erst die Vorlage genauso formatieren, dann vergleichen.

## Noch offen an der Oberfläche

1. **Shop-TV ist noch drin** — 118 Zeilen über acht Aufrufstellen: die Seite
   `ShopTvPage`, `ShopTvKachelModern`, ein Marketing-Format, Kacheln, die
   Kanalzeile der Objektseite, die Yodeck-Anbindung. Phase 1.4 verlangt die
   ersatzlose Streichung. Das ist eine echte Modulentfernung, keine
   Textersetzung — und der Grund, warum `src/` noch nicht versioniert ist.

2. **Die beiden Word-Vorlagen sind leer.** `VORLAGE_MAKLERVERTRAG` und
   `VORLAGE_OBJEKTNACHWEIS` lagen als Base64 im Quelltext und trugen Briefkopf
   und Vertragstext der Referenz. `docs/NEUTRALITAET.md` Abschnitt 5 ist
   eindeutig: Rechtstexte der Referenz werden **ersetzt**, nicht übernommen.
   Ersetzen kann ein Skript sie nicht — eine gültige Word-Datei lässt sich
   nicht als Regel schreiben. Bis neutrale Muster vorliegen, erzeugt der Fork
   **keine Maklerverträge und keine Objektnachweise**.

3. **Die Logos sind leer.** Sechs Konstanten trugen die Wortmarke der Referenz
   als Base64 — für das Gate unsichtbar, weil es Text liest und keine Bilder.
   Geleert; laut `docs/NEUTRALITAET.md` tritt bei fehlendem Logo eine Wortmarke
   aus dem Firmennamen an seine Stelle.

4. **Die Mail-Signatur ist ein Platzhaltergerüst.** Sie trug den vollständigen
   Geschäftsbriefkopf der Referenz. Jetzt stehen dort `{firma_name}`,
   `{firma_register}` und so weiter — zu füllen aus `firma_stammdaten` in
   Phase 2.4.

## ~~Der Quelltext der Oberflaeche — Ihre Mitwirkung noetig~~

Hinzugekommen am 28.09.2026 beim Zerlegen von `reference/epworld-src.html`.

Die Datei sagt es in ihrer zweiten Zeile selbst: **„E&P World – vorkompiliert
26.09.2026"**. Gemessen über die ganze Datei:

| Anteil | Umfang |
|---|---|
| lesbarer Quelltext | 1,02 MB (20 %) |
| **vorkompiliert** | **2,97 MB (58 %)** |
| eingebettete Blobs (Base64) | 1,17 MB (23 %) |

Der vorkompilierte Teil steckt in **drei Zeilen**: Zeile 31 (0,72 MB), Zeile
180 (0,03 MB) und Zeile 4316 (2,22 MB). Die letzte ist `ImmobilienPage` — das
Kernmodul des Produkts. Bezeichner sind auf einzelne Buchstaben verkürzt, die
Formatierung ist weg.

**Warum das ein Blocker ist, nicht nur unschön:** Phase 1.4 des Auftrags
streicht Shop-TV ersatzlos. Die Streichung ist im lesbaren Teil möglich —
`epShopTvPasst`, `epShopTvAbgleich` und die Kanalzeile lassen sich sauber
entfernen. Aber **19 weitere Stellen liegen im vorkompilierten Kern**, in
Zeichenketten und Feldnamen mitten in 2,22 MB auf einer Zeile. Dort lässt sich
nichts herausschneiden, ohne zu raten. Dasselbe gilt für jede spätere
Änderung: Mandantenfähigkeit, `firma_id` im Frontend, Neutralisierung von
Texten, die im Kompilat stehen.

**Was gebraucht wird:** der Stand *vor* dem Vorkompilieren. Die Vorlage
kompiliert seit dem 19.07.2026 offline — der Kommentar in der Datei nennt das
ausdrücklich („JSX wird seit 19.07.2026 offline vorkompiliert, iOS-Speicher"),
also existiert auf der Seite der Vorlage ein Quellstand und ein Bauschritt.
Gebraucht wird beides: die Quelldateien und das Skript, das daraus
`epworld-src.html` macht.

**Bis dahin:** `src/` entsteht zwar vollständig und ist neutralisiert bis auf
Shop-TV, wird aber **nicht versioniert** (siehe `.gitignore`). Ein Stand, der
das Gate nur mit einer Ausnahme passiert, wäre ein Gate mit einem Loch.
`scripts/oberflaeche-zerlegen.py` erzeugt ihn in Sekunden neu.

## ~~Zwei CDN-Bibliotheken ohne feste Version~~ — erledigt am 28.09.2026

Alle **vierzehn** Fremdbibliotheken tragen jetzt eine feste Version.
`@supabase/supabase-js@2` → `2.117.2`, `tesseract.js@5` → `5.1.1`, React und
React-DOM → `18.3.1`. Die Nummern stammen aus der npm-Registry — sie ist die
Quelle, aus der die CDNs ihre Pakete ziehen, also löst `@2` genau dorthin auf.
Der Rauchtest prüft ab jetzt bei jedem Lauf, dass keine Adresse ohne
Versionsnummer zurückkommt.

**Was offen bleibt:** Die CDN-Adressen selbst sind ungeprüft — der
Egress-Proxy sperrt jsdelivr und unpkg. Ein Tippfehler in einem Pfad fiele
erst beim ersten Start auf.

## ~~Zwei CDN-Bibliotheken ohne feste Version~~

`@supabase/supabase-js@2` und `tesseract.js@5` sind nur auf die Hauptversion
festgelegt. React und React-DOM sind beim Zerlegen auf `18.3.1` festgenagelt
worden; für die beiden anderen fehlt die Gegenprobe, weil der Egress-Proxy
dieser Umgebung die CDNs nicht erreicht — eine geratene Patch-Version, die es
nicht gibt, ließe die Anwendung gar nicht erst starten.

Das ist kein theoretisches Risiko. Die Vorlage hat sich daran am **17.06.2026
einen Totalausfall geholt**: eine neue Babel-Version wechselte still die
Standard-Laufzeit, der Browser meldete „Cannot use import statement outside a
module", und die gesamte Anwendung startete nicht mehr — bei unveränderter
HTML. Der Kommentar dazu steht in `src/huelle/07-babel-hinweis.html`.

Zu tun: einmal mit Netz die tatsächlich aufgelösten Versionen ablesen und
eintragen.

## Entscheidung des Betreibers

Der Altbestand im Zielprojekt (rund 110 Tabellen, Testdaten) blockiert das
Einspielen des E&P-Schemas. Drei Wege in `docs/STATUS.md` Abschnitt 3.

## Nachtrag 14.09.2026 — offene Punkte aus dem Schema-Export

### Ihre Mitwirkung nötig

1. ~~**Zwei Vault-Einträge im Projekt `usguiggfciavwzkdfjgt`.**~~ **Erledigt
   am 15.09.2026.** `projekt_url` und `anon_key` liegen im Vault und lassen
   sich lesen. Der anon-Schlüssel ist öffentlich (er steht auch in
   `netlify.toml`); er gehört nur nicht in eine Migration, deshalb der Vault.

   Dabei aufgefallen: dem Zielprojekt fehlten **pg_cron und pg_net**. Ohne die
   beiden laufen weder die 33 Jobs noch die drei Trigger, die
   `net.http_post` aufrufen. Nachgezogen in
   `supabase/migrations/20260915000050_erweiterungen.sql` — als Migration, nicht
   als Klickarbeit, damit ein zweites Projekt genauso aufgesetzt werden kann.

2. **Eigene Maildomain hinterlegen.** Der Anfrage-Vorfilter erkennt interne
   Weiterleitungen an der Absenderdomain. Er liest sie jetzt aus
   `firma_stammdaten.email` des Hauptstandorts. Solange dort keine Adresse
   steht, greift der Filter nicht — und weitergeleitete Anfragen von Kollegen
   werden als „keine Anfrage" eingeordnet.

3. **Kleinanzeigen-Anbieternummer hinterlegen**, in
   `portal_zugaenge.anbieter_nr` für `portal = 'kleinanzeigen'`. Fehlt sie,
   baut der Importbericht die Anzeigen-URL mit dem Platzhalter `openimmo` und
   der Link führt ins Nichts. Der Bericht selbst wird trotzdem verarbeitet.

### Befunde in der Vorlage, die mit übernommen sind

4. **Zwei Cron-Jobs können in der Vorlage nicht durchlaufen.**
   `news-briefing-taeglich` trägt den Platzhalter `DEIN_ECHTER_ANON_KEY` als
   Schlüssel, `jotform-sync-5min` einen Schlüssel, der mit `Hy` statt `ey`
   beginnt und damit kein gültiges JWT ist. Beide sind in der Vorlage
   entsprechend inaktiv beziehungsweise wirkungslos. Der erste ist übernommen
   und inaktiv, der zweite entfällt nach Phase 1.4.

5. **Zwei Storage-Richtlinien zeigen auf Buckets, die es nicht gibt** —
   `marketing-print-vorlagen` und `uebergabeprotokolle`. Entweder fehlen die
   Buckets, oder die Richtlinien sind Reste. Unverändert übernommen; zu
   entscheiden beim Sichten der Oberfläche in Phase 1.

6. **`signatur_*`: jeder Angemeldete liest jeden Unterschrifts-Token.** Die drei
   Richtlinien lauten `using (true)`. Bestätigt im Export, bewusst nicht
   geflickt — der Fork soll zuerst nachweisbar dasselbe tun wie die Vorlage.
   Geschlossen wird das in Phase 2.3, wie im Auftrag verlangt.

7. ~~**`suchkriterien_lauf` ohne RLS.**~~ **Erledigt am 27.09.2026.** In der
   Vorlage ist RLS eingeschaltet und die Richtlinie `suchkriterien_lauf_team`
   angelegt; der Fork zieht in
   `20260927100600_abgleich_rls_und_richtlinien.sql` mit. Siehe
   `docs/STATUS.md`, Abschnitt 6.

8. **`onoffice-expose-abgleich` ohne JWT-Prüfung.** Der Cron-Job
   `onoffice-expose-abgleich-2h` schickt nur `Content-Type`, keinen
   `Authorization`-Kopf. Das geht nur, wenn die Edge Function ohne
   JWT-Prüfung läuft — sie ist dann von außen aufrufbar, ohne Anmeldung.
   Unverändert aus der Vorlage übernommen, wie der Auftrag es verlangt. Zu
   entscheiden, sobald die Edge Functions vorliegen: entweder JWT-Prüfung
   einschalten und den Job mit Schlüssel versehen, oder ein eigenes Geheimnis
   wie bei `x-diagnose-secret`.

9. **Storage-Reste des Altbestands.** Die Buckets `branding`, `importe`,
   `marke`, `objektbilder`, `objektdokumente` und zwanzig Storage-Richtlinien
   stammen aus der Next.js-Anwendung. Beim Verschieben des Altbestands wandern sie nicht mit,
   weil `storage` ein eigenes Schema ist und
   `alter table … set schema altbestand` dort nicht greift. Sie enthalten
   möglicherweise Dateien; gelöscht wird nichts. Zu entscheiden nach Gate 1:
   Dateien sichern und Buckets entfernen, oder behalten. Bis dahin zählt
   `tests/vorlage-vollstaendig.sql` sie ausdrücklich heraus.

### Nicht prüfbar in dieser Umgebung

10. **Edge Functions.** 130 Stück, Quelltext nicht über diese Schnittstelle
   erreichbar. Siehe `docs/STATUS.md`, Abschnitt 2.2.

11. **Verhalten.** Der Export ist vollständig — 15 Kennzahlen stimmen mit dem
   Quellprojekt überein. Das beweist, dass nichts verloren ging, nicht dass
   sich alles gleich verhält. Ein Verhaltensvergleich braucht die Oberfläche
   und die Edge Functions.

## Selbstregistrierung legt kein Profil an — Phase 3

Gefunden am 28.09.2026 beim ersten echten Anmeldeversuch des Betreibers.

Die Oberfläche erlaubt die Registrierung; dabei entsteht ein Konto in
`auth.users`, aber **kein Eintrag in `profiles`**. Es gibt keinen Trigger auf
`auth.users`, und die Oberfläche schreibt selbst nie in `profiles` — sie liest
nur. Wer sich registriert, meldet sich erfolgreich an und landet in einer
Anwendung ohne Rolle und ohne Rechte. Von außen sieht das aus, als ginge die
Anmeldung nicht.

In der Vorlage fällt das nicht auf: dort legt der Chef Mitarbeiter über die
Edge Function `mitarbeiter-anlegen` an, die Konto **und** Profil erzeugt. Eine
Selbstregistrierung war dort nicht vorgesehen — sie ist eine Anforderung des
Forks (Auftrag, Phase 3).

**Was Phase 3 lösen muss:** Konto und Profil entstehen gemeinsam, das Profil
trägt von Anfang an eine `firma_id`, und der erste Nutzer einer neuen Firma
bekommt die Rolle `chef`. Ein Trigger auf `auth.users` ist der naheliegende
Weg, weil er auch bei Registrierung über einen fremden Anbieter greift.

Bis dahin muss ein Profil von Hand angelegt werden.

## ~~Adressbuch als CSV ausgeben~~ — erledigt 28.09.2026

Die Vorlage kann CSV für Akquise-Pipeline, Kosten/Kennzahlen und
Newsletter-Anmeldungen. Für **Kontakte** gibt es keinen Export. Der Wunsch ist
also eine echte Erweiterung, keine Übernahme.

**Wird nicht vorgezogen, und zwar aus zwei Gründen:**

1. Ein Export ist die breiteste Tür, die eine Anwendung hat. Solange die
   Mandantentrennung nicht steht (`firma_id`, RLS), zieht er potenziell
   Datensätze über Mandantengrenzen hinweg. Genau die Lücke, die niemand
   sieht, weil im Bildschirm alles richtig aussieht.
2. Der Auftrag definiert in Abschnitt 1b ein eigenes Recht „Export" und einen
   Sichtbarkeitsbereich je Mitarbeiter (nur eigene / Standort / Gesellschaft /
   Konto). Ein Export, der vor diesen Regeln entsteht, ignoriert sie.

**Gebaut mit der Rechte-Matrix (1b)**, mit genau diesen Eigenschaften — jede
davon steht jetzt im Quelltext:

- Semikolon als Trennzeichen, UTF-8 mit BOM — wie die drei vorhandenen
  Exporte der Vorlage, damit Excel die Umlaute richtig liest.
- Spalten folgen der Kontaktliste, nicht der Tabelle: Anrede, Vorname,
  Nachname, Firma, Rolle, E-Mail, Telefon, Mobil, Anschrift, Tags, Zuständig,
  Quelle, angelegt am.
- Es wird exportiert, was der Nutzer **auch sehen darf** — dieselbe Abfrage
  wie die Liste, nicht ein eigener, weiter gefasster Zugriff.
- Jeder Export landet im Audit-Log, mit Anzahl der Datensätze. Ein Export
  personenbezogener Daten ist ein Vorgang, über den man Auskunft geben können
  muss.
- Widerrufene Newsletter-Kontakte werden gekennzeichnet, nicht stillschweigend
  mitgeliefert.

## ~~Feiertage: das Bundesland erreicht die Oberfläche noch nicht~~ — erledigt 28.09.2026

`feiertage(jahr, land)` rechnet für alle sechzehn Länder, und
`firma_stammdaten.bundesland` trägt den Wert. Die Edge Function
`urlaub-hinweise` liest ihn einmal je Lauf.

**Die Oberfläche jetzt auch:** `getProfile()` legt nach der Anmeldung
`window.IMMO_MANDANT_ID`, `IMMO_STANDORT_ID`, `IMMO_GESELLSCHAFT_ID` und
`IMMO_BUNDESLAND` ab. Das ist die einzige Stelle, an der das Profil des
Angemeldeten geladen wird; damit steht der Kontext genau einmal und nicht in
jedem Aufrufer.

**Was daran noch offen ist:** Der Standort ist der erste nach Sortierung, nicht
der des Mitarbeiters. Sobald Abschnitt 1b jedem Mitarbeiter einen Hauptstandort
gibt, kommt das Land von dort.

## ~~Eigene Vertragsvorlagen je Makler~~ — grosstenteils erledigt 28.09.2026

Jeder Mandant soll eigene Vorlagen für **Maklerverträge, Vollmachten,
Objektnachweise und Reservierungen** hinterlegen können.

**Stand:** Die Vorlage führt zwei Word-Vorlagen als Base64 im Quelltext —
`VORLAGE_MAKLERVERTRAG` und `VORLAGE_OBJEKTNACHWEIS`. Beide sind im Fork
**geleert**, weil sie Briefkopf und Vertragstext der Referenz trugen und
`docs/NEUTRALITAET.md` Abschnitt 5 Rechtstexte der Referenz ersetzen, nicht
übernehmen lässt. Es entstehen derzeit also gar keine Verträge. Vollmacht und
Reservierung haben in der Vorlage überhaupt keine hinterlegbare Vorlage.

**Was zu bauen ist:**

- Tabelle `vertragsvorlagen` mit `mandant_id`, `gesellschaft_id` (optional),
  Art (`maklervertrag`, `vollmacht`, `objektnachweis`, `reservierung`),
  Datei im Storage unter `vorlagen/{mandant_id}/…`, Version, aktiv.
- Die Erzeugung liest die Vorlage des Mandanten; fehlt sie, eine neutrale
  Musterfassung mit dem Pflichthinweis auf anwaltliche Prüfung.
- Platzhalter wie `{firma_name}`, `{geschaeftsfuehrer}`, `{strasse}` — die
  Liste steht schon im Quelltext der Vorlage und wird dort gefiltert.
- Rechte: nur mit „Firmendaten bearbeiten" (Abschnitt 1b).

**Reihenfolge:** nach der Mandantentrennung. Eine Vorlagenverwaltung ohne
`mandant_id` auf der Tabelle und ohne Trennung im Storage wäre genau die Art
Tür, die man später nicht mehr zubekommt.

## Storage: die Buckets sind noch nicht getrennt

Die Tabellen sind getrennt (`tests/mandant.sql`, sieben Prüfungen). Die 27
Buckets nicht. Ein Pfad wie `objektbilder/{immobilie_id}/…` trägt keinen
Mandanten, und fünf Buckets sind **öffentlich** (`branding`,
`immobilie-dateien`, `ki-bilder`, `marke`, `web-assets`) — dort liest jeder
mit, der den Pfad kennt.

**Der Weg ist klar, er ist nur nicht klein.** Supabase trennt Mandanten im
Storage über das erste Pfadsegment, geprüft mit
`(storage.foldername(name))[1] = aktuelle_mandant_id()::text` in einer
restriktiven Richtlinie auf `storage.objects` — dieselbe Bauart wie bei den
Tabellen, eine Richtlinie für alle Buckets.

Was daran hängt: **51 Schreibstellen in 12 Dateien** bauen Pfade. Sie müssen
den Mandanten voranstellen, und die 90 vorhandenen Dateien müssen umziehen,
samt der Pfade, die in `immobilie_datei.storage_path` und Geschwistern stehen.

Nicht im Trigger lösbar: schriebe die Datenbank den Pfad um, läse der Aufrufer
danach einen anderen zurück, als er gespeichert hat.

**Voraussetzung ist erfüllt:** `window.IMMO_MANDANT_ID` steht seit dem
28.09.2026. Ohne die wäre der Umbau nicht möglich gewesen.

### Stand 28.09.2026 — Schritt 1 von 4 ist gebaut

| Schritt | Stand |
|---|---|
| 1. Oberfläche stellt den Mandanten voran | **fertig** — eine Hülle um `storage.from()`, neun Prüfungen in `tests/storage-huelle.js` |
| 2a. Hülle in den Edge Functions | **fertig** — 11 Funktionen, 22 Schreibstellen |
| 2b. Jede Funktion ihren Mandanten ermitteln lassen | **9 von 11** — siehe Liste unten |
| 3. Die 90 vorhandenen Dateien umziehen | offen |
| 4. Restriktive Richtlinie auf `storage.objects` | offen — **erst nach 2 und 3**, sonst sperrt sie aus, was noch am alten Ort liegt |

Die Reihenfolge ist nicht beliebig. Schritt 4 zuerst, und die Anwendung
kommt an keine Datei mehr; Schritt 3 zuerst, und die Oberfläche sucht am
neuen Ort, während die Edge Functions am alten schreiben.

**Die Hülle ist Bequemlichkeit, nicht die Sicherung.** Sie erspart es, 51
Aufrufstellen anzufassen — aber wer sie umgeht, kommt an Pfade ohne Präfix.
Gesichert wird erst in Schritt 4, in der Datenbank.

### Schritt 2b: welche Funktion woher ihren Mandanten bekommt

Die Hülle steht in allen elf und ist **untätig**, solange
`immoSetzeMandant()` nicht gerufen wurde — die Funktionen schreiben bis dahin
wie bisher. Das ist Absicht: eine Hülle, die ohne Mandanten einen erfundenen
Pfad baut, verlöre Dateien.

| Funktion | Aufruf | Quelle des Mandanten |
|---|---|---|
| ~~`expose-pdf-erzeugen`~~ | Nutzer (JWT) | **fertig** — die vorhandene Profilabfrage um `mandant_id` erweitert |
| ~~`mpe-pdf-erzeugen`~~ | Nutzer (JWT) | **fertig**, dito |
| ~~`eigentuemer-dokument-uebernehmen`~~ | Nutzer (JWT) | **fertig**, dito |
| ~~`eigentuemer-report-pdf`~~ | Nutzer (JWT) | **fertig**, dito |
| ~~`signatur-vorgang-starten`~~ | Nutzer (JWT) | **fertig** — eigene Abfrage, weil sie ihren Client erst nach `getUser` erzeugt |
| ~~`brief-pdf-erzeugen`~~ | Nutzer (JWT) | **fertig** — der Brief wird ohnehin mit `select("*")` geladen |
| ~~`web-asset-kopieren`~~ | Nutzer (JWT) | **fertig** — neu mit `getUser`; sie prüfte vorher **gar nichts** außer dem Plattform-JWT |
| `energieausweis-anfrage` | **öffentlich** | aus dem Standort, an den die Anfrage geht |
| ~~`signatur-unterschreiben`~~ | öffentlich (Token) | **fertig** — der Vorgang wird ohnehin mit `select("*")` geladen |
| ~~`bild-empfang`~~ | öffentlich (Token) | **fertig** — Abfrage auf die Ziel-Immobilie |
| `mail-anhaenge-diagnose` | **öffentlich** (Geheimnis) | aus dem Postfach |

Die vier öffentlichen sind die heiklen: sie haben keinen angemeldeten Nutzer
und müssen den Mandanten aus dem Datensatz ableiten, den sie ohnehin laden.
Wer das falsch macht, schreibt die Datei eines Mandanten in den Ordner eines
anderen — und die Richtlinie aus Schritt 4 macht sie dann für den Falschen
sichtbar.

### Die letzten zwei — und eine Lücke, die kein Code schließt

**`mail-anhaenge-diagnose`** schreibt an drei Stellen mit drei verschiedenen
Quellen (`bild_transfer.immobilie_id`, `immobilie_datei.immobilie_id`, ein
fester Diagnosepfad). Kein einzelner Aufruf von `immoSetzeMandant()` deckt
alle drei ab; sie braucht je Schreibstelle einen. Machbar, nur nicht mit einer
Regel.

**`energieausweis-anfrage` ist der eigentliche Befund.** Sie ist ein
**öffentliches Formular** auf der Webseite des Maklers — ohne Anmeldung, ohne
Token. Sie kann gar nicht wissen, zu welchem Mandanten sie gehört: heute nimmt
sie das erste aktive Postfach, was bei einem Mandanten stimmt und bei zweien
rät.

Das ist keine Sache des Quelltexts, sondern des Entwurfs: **ein öffentlicher
Endpunkt muss den Mandanten mitbekommen.** Entweder über den Pfad
(`…/energieausweis-anfrage?mandant=<slug>`), den die eingebettete Seite setzt,
oder über einen Token je Mandant. Solange das nicht entschieden ist, bleibt
die Funktion beim ersten Postfach und ist damit **nicht mandantenfähig**.

Dasselbe gilt für jeden weiteren öffentlichen Endpunkt, der später dazukommt.
Es lohnt, das einmal zu entscheiden und dann überall gleich zu machen.

## Das Schema `intern` ist geparkt und in sich kaputt

Gefunden am 28.09.2026, als `tests/mandant.sql` zum ersten Mal den
Dateispeicher mitgeprüft hat.

Der geparkte Greenfield-Stand hat neben seinen 110 Tabellen auch ein Schema
`intern` mit rund 50 Hilfsfunktionen hinterlassen. Die Tabellen sind am 14.09.
nach `altbestand` gewandert, die Funktionen nicht — sie greifen weiter auf
`public.benutzer`, `public.objekte`, `public.web_expose` und ein gutes Dutzend
weiterer Namen zu, die es unter `public` nicht mehr gibt. Jeder Aufruf endet
mit `relation "public.…" does not exist`.

**Folgenlos, solange es dort bleibt:** 204 der 208 Richtlinien auf
`altbestand`-Tabellen rufen `intern.*` auf, aber `altbestand` ist nicht
exponiert, und ein Fehler in einer Richtlinie sperrt, er öffnet nicht. Von den
525 Richtlinien im Schema `public` nutzt keine einzige `intern.*`.

**Nicht folgenlos war:** 16 Richtlinien auf `storage.objects`. Die Tabelle
gehört dem Produkt, nicht dem geparkten Stand — dort hat jeder angemeldete
Zugriff einen Fehler geworfen. Gelöscht in `fork_10`, begründet in
`docs/ENTSCHEIDUNGEN.md`. Die Migration hat einen Wachposten: eine neue
Richtlinie auf `storage.objects`, die `intern.*` aufruft, lässt sie scheitern.

**Was noch offen ist:** `intern` verschwindet zusammen mit `altbestand`, wenn
der geparkte Stand endgültig abgeräumt wird. Das ist eine Entscheidung des
Betreibers, kein technischer Schritt — bis dahin bleibt beides liegen.

## Was am Sichtbarkeitsbereich noch offen ist

`fork_11` und die Bedienelemente stehen. Zwei Dinge fehlen noch:

- **Der Hauptstandort des Mitarbeiters.** `profiles.firma_id` gibt es, und der
  Rechte-Dialog setzt ihn. Aber `getProfile()` legt in `IMMO_STANDORT_ID`
  weiterhin den *ersten* Standort nach Sortierung ab, nicht den des
  Angemeldeten. Für die Feiertage im Urlaubsmodul heißt das: bei mehreren
  Standorten in verschiedenen Bundesländern rechnet es mit dem falschen Land.
  Die Datenbank ist davon nicht betroffen — `sichtbare_mitarbeiter()` liest
  `firma_id` direkt aus dem Profil.
- **Die übrigen Module.** `public.hat_recht()` ist gebaut und geprüft, gerufen
  wird es bisher nur von `darf_exportieren()`. Die anderen fünfzehn Module
  hängen weiterhin allein an `hatRecht()` in der Oberfläche. Das ist keine
  Verschlechterung gegenüber der Vorlage, aber es ist auch noch nicht das,
  was `CLAUDE.md` verlangt. Der Weg dahin ist gebahnt: die Funktion steht, es
  fehlen die Richtlinien, die sie fragen.

## Vertragsvorlagen: zwei der vier lesen noch keine

`fork_12` und der Reiter **Einstellungen → Vertragsvorlagen** stehen. Alle vier
Arten lassen sich hochladen, versionieren und werden mandantengetrennt
abgelegt. Gelesen wird die hinterlegte Vorlage aber erst von zweien:

| Art | liest die Vorlage | warum |
|---|---|---|
| Maklervertrag | **ja** | las vorher `VORLAGE_MAKLERVERTRAG`, jetzt den Mandanten |
| Objektnachweis | **ja** | dasselbe mit `VORLAGE_OBJEKTNACHWEIS` |
| Vollmacht | noch nicht | `fillVollmacht` baut das Dokument im Quelltext zusammen, es gibt gar keine Datei zum Ersetzen |
| Reservierung | noch nicht | entsteht in der Edge Function `reservierung-word-erzeugen`, nicht in der Oberfläche |

Beide Umbauten sind Verhaltensänderungen an Stellen, die heute funktionieren —
anders als bei den ersten beiden, die ohne Vorlage gar nichts mehr erzeugt
haben. Sie gehören deshalb in einen eigenen Schritt und nicht nebenbei.

**Kein eingebauter Ersatztext, bewusst.** Fehlt die Vorlage, sagt die Anwendung
das und nennt den Weg dorthin. Ein Vertragsmuster, das niemand geprüft hat,
wird benutzt, als wäre es geprüft — `CLAUDE.md` verbietet genau das.

## Abschnitt 3: was steht und was noch fehlt

**Steht:**

- Die Mandantengrenze gilt jetzt auch in den Funktionen (`fork_14`) — das war
  der wichtigste Fund beim Einstieg ins Rechnungswesen, siehe
  `docs/ENTSCHEIDUNGEN.md`.
- Konto → Gesellschaften → Standorte ist bedienbar: **Einstellungen →
  Gesellschaften**. Anlegen, umbenennen, Rechtsform, stilllegen, und die
  Zuordnung der Standorte. Gelöscht wird nicht, sondern stillgelegt: an einer
  Gesellschaft hängen Standorte, und an denen hängen Rechnungen, deren
  Nummernkreis nicht verschwinden darf.
- Das Rechnungswesen selbst ist vollständig aus der Vorlage übernommen —
  `rechnungen`, `rechnung_positionen`, `rechnung_kunden`,
  `rechnung_nummern_sequence` (je Standort und Jahr), `rechnungen_audit`,
  dazu die Liquiditätsplanung. Es wird nichts nachgebaut.

**Fehlt noch:**

- **Der Rechnungsnummernkreis hängt am Standort, nicht an der Gesellschaft.**
  Der Primärschlüssel von `rechnung_nummern_sequence` ist `(firma_id, jahr)`.
  Für ein Unternehmen mit zwei Standorten unter einer Gesellschaft heißt das
  zwei getrennte Nummernkreise. Ob das gewollt ist, ist eine kaufmännische
  Entscheidung des Betreibers, keine technische — beides ist zulässig, solange
  jeder Kreis für sich lückenlos ist. **Nicht geändert**, weil es das Verhalten
  der Vorlage ist und eine Umstellung bestehende Nummern berührt.
- Die Umsatzsteuer-Vorgaben (`standard_mwst_satz`, `kleinunternehmer`) stehen
  je Standort in `firma_stammdaten` und werden dort auch gepflegt. Eine
  Prüfung, ob sie zur Rechtsform der Gesellschaft passt, gibt es nicht.
- `eigentuemer_benachrichtigung_queue` hat als einzige Warteschlange kein
  `mandant_id`. Sie ist in `mandanten_einstufung` als DIENST geführt; zu
  prüfen bleibt, ob das stimmt oder ob sie fachlich zum Mandanten gehört.

## Die Vorlage ist einmandantig gebaut — was das noch heißen kann

Zwischen `fork_14` und `fork_16` sind an einem Nachmittag **zwanzig** Stellen
gefunden worden, an denen die Mandantengrenze nicht galt. Das ist kein Vorwurf
an die Vorlage: sie war für **ein** Unternehmen geschrieben, und dort ist jede
dieser Stellen richtig. Im Fork ist jede davon ein Loch.

Das Muster, das sich durchzieht — als Suchhilfe für alles, was noch kommt:

| Muster | Beispiel |
|---|---|
| `SECURITY DEFINER` nimmt eine fremde ID entgegen | `rechnung_startnummer_setzen` |
| Verknüpfung zweier Mandantentabellen ohne Bedingung | `cross join kontakte` |
| Zuordnung über **Namen** statt Kennung | `push_termin_erinnerungen_senden` |
| Rückfallebene ohne Mandantenbezug | „der älteste Chef" |
| Abgleich über **E-Mail-Adresse** | `eigentuemer_besichtigungen` |
| Rechteprüfung über `current_user` in `SECURITY DEFINER` | `newsletter_empfaenger` |

**Was geprüft ist:** alle Funktionen im Schema `public`. Drei Wachposten in
den Migrationen schlagen an, wenn eine neue ungeprüfte dazukommt, und drei
Tests im Gate weisen die Grenze nach (`tests/mandant.sql`,
`tests/funktionen-mandant.sql`, `tests/hintergrund-mandant.sql`).

**Was NICHT geprüft ist — und das ist die wichtigste offene Zeile dieses
Dokuments:** die **139 Edge Functions**. Sie laufen mit dem `service_role`, für
den die Grenze bewusst nicht gilt; sie müssen sie also selbst ziehen. Elf
davon sind in Phase 2 angefasst worden (Storage-Hülle und `immoSetzeMandant`),
die übrigen 128 sind auf dieses Muster **nicht** durchgesehen. Sie sind in
TypeScript und lassen sich nicht wie SQL-Funktionen aus der Datenbank
abfragen — das braucht einen eigenen, systematischen Durchgang.

**Vor Gate 2 (Ende Phase 3) ist das zu erledigen.** Ein zweiter Mandant darf
erst auf ein System, bei dem auch dieser Teil durchgesehen ist.

## Belegnummern: was der Test nicht beweist

`tests/belegnummern.sql` prüft 200 aufeinanderfolgende Vergaben. Der Auftrag
(Abschnitt 5) verlangt einen **Lasttest mit 50 gleichzeitigen Anlagen**. Das
geht in einer psql-Sitzung nicht — und der Unterschied ist genau der, auf den
es ankommt: ein `select` gefolgt von einem `update` wäre in diesem Test
ebenfalls grün und im Betrieb trotzdem falsch.

Gebaut ist die sichere Form (ein `update … returning`). **Nachgewiesen ist sie
nicht.** Dafür braucht es einen Lauf mit echten parallelen Verbindungen, etwa
über `pgbench` oder mehrere Edge-Function-Aufrufe gleichzeitig. Vor Gate 3
(Stripe-Live) nachzuholen, weil dann Rechnungen im Echtbetrieb entstehen.

**Ebenfalls offen aus Abschnitt 3c:** Mahnstufen, Buchungskonten (SKR03/04),
Steuersätze und Reverse Charge, SEPA-Gläubiger-ID, DATEV-Export, ZUGFeRD und
XRechnung.

Gebaut sind: der Nummernkreis, Zahlungsziele mit Skonto und die
Rechnungsfreigabe — jeweils samt Maske unter *Einstellungen → Belegnummern*
beziehungsweise *Einstellungen → Zahlung & Freigabe*.

## Das Fremd-CRM: was noch im Quelltext steht

Ausgebaut sind die Wege hinein: Cron-Jobs abbestellt, 21 Edge Functions
gestrichen, Kachel und Admin-Reiter entfernt. **Seit dem 29.09.2026 nennt
auch kein sichtbarer Text die Marke mehr** — 94 Textregeln und sechs
bauliche Regeln, der Rauchtest hält den Stand (siehe
`docs/ENTSCHEIDUNGEN.md`).

**Was bleibt:**

- **Technische Bezeichner** — Spalten wie `onoffice_id`, Namen von Edge
  Functions, Schlüssel der Funktionsschalter. Sie bleiben absichtlich:
  `CLAUDE.md` schreibt vor, dass der CRM-Sync bis Phase 2b im Code bleibt,
  und die Spalten stehen so in der Datenbank.
- **Kommentare**, die diese Bezeichner erklären. Ohne den Namen wären sie
  unlesbar. Sie sind über die ausgelieferte Datei einsehbar, wenn jemand sie
  öffnet — ein kosmetischer Rest, kein Funktionsproblem.
- **13 leere Tabellen** in der Datenbank.

Das aufzuräumen lohnt erst, wenn die Adapter-Schicht aus Abschnitt 4b steht —
dann wird daraus entweder ein Adapter unter mehreren oder es fällt ganz weg.

**Zu prüfen, bevor ein Mandant mit einem anderen CRM startet:** ob eine dieser
Fundstellen beim Laden einer Ansicht eine der gestrichenen Funktionen ruft. Ein
Aufruf ins Leere liefert 404 und sollte abgefangen sein — geprüft ist das
nicht.

## Drei Dokumente suchen ein Logo, das es nicht gibt

`vertrag-pdf`, `mietvertrag-pdf` und `signatur-vorgang-starten` holen ihr Logo
aus einem fest verdrahteten `const LOGO_PFAD = "logo.png"`. Diese Datei liegt
weder im Wurzelverzeichnis des Eimers noch bei einem Mandanten — die drei
Dokumente entstehen also ohne Logo. Kaputt sind sie deshalb nicht: der
Download scheitert still, das PDF wird gebaut.

Die übrigen Dokumente lesen `firma.logo_pfad` aus `firma_stammdaten`, also das
Logo des Mandanten. Diese drei laden `firma_stammdaten` gar nicht erst. Das
sauber nachzuziehen heißt, ihnen den Firmensatz mitzugeben — ein Eingriff in
fremden Code, der über das hinausgeht, was der gemeldete Fehler verlangt.

**Gehört zu Abschnitt 2c des Auftrags** („zwei Logo-Plätze, ein einziger
Dienst `getBranding()`"): dort wird die Logoherkunft ohnehin an eine Stelle
gezogen. Dann fällt `LOGO_PFAD` mit weg.

## Die Umbuchungs-Erkennung kennt den eigenen Firmennamen nicht

In der Liquiditätsplanung gelten zwei Buchungen als interne Umbuchung, wenn
Betrag, Datum und Konten zusammenpassen **und** entweder eine eigene IBAN
beteiligt ist **oder** ein Stichwort im Verwendungszweck steht.

Die Stichwortliste enthielt bis zum 28.09.2026 den Namen des
Referenzunternehmens. Er ist entfernt; geblieben sind die vier Begriffe, die
eine Umbuchung wirklich beschreiben („interne Überweisung", „internal
transfer", „Umbuchung"). Der verlässliche Zweig — die eigene IBAN — war nie
betroffen.

**Offen:** die Liste um den **eigenen** Firmennamen zu ergänzen. Das braucht
ihn an dieser Stelle im Quelltext und gehört damit zu `getBranding()` aus
Abschnitt 2c.

## Das KI-Modell steht an 28 Stellen im Quelltext

41 Edge Functions rufen Anthropic, und der Modellname ist jedes Mal fest
eingetragen — in fünf verschiedenen Fassungen:

| Fassung | Fundstellen |
|---|---|
| `claude-sonnet-4-6` | 19 |
| `claude-sonnet-4-5` | 3 |
| `claude-sonnet-4-5-20250929` | 2 |
| `claude-haiku-4-5-20251001` | 2 |
| `large-v3` (Transkription) | 2 |

`CLAUDE.md` sagt für Preise und Limits: *„nicht an vielen Stellen im Code
verdrahtet"*. Für das Modell gilt dasselbe Argument — wechselt der Anbieter
eine Bezeichnung, sind heute 28 Stellen zu finden. Es gehört an eine Stelle,
über den Plattform-Admin einstellbar, mit einem vernünftigen Standardwert.

**Noch nicht geprüft, ob die Namen überhaupt gültig sind.** Der erste Versuch
scheiterte vorher am Schlüssel (siehe `docs/SECRETS.md`); die Anfrage kam nie
so weit, dass das Modell geprüft worden wäre.

## Die Dokumenterzeugung sucht nach dem Mustervertrag der Referenz

**Gefunden am 28.09.2026**, beim Einbau der Vorlagen-Werte. Die drei
Word-Erzeuger füllen die Vorlage nicht über Platzhalter, sondern indem sie
**wörtliche Sätze aus einem konkreten Beispielvertrag der Referenz suchen und
ersetzen** — 56 solcher Anker, davon 38 allein in `fillObjektnachweis`.

**Zwei Folgen, und beide wiegen.**

**1. Personenbezogene Daten im Quelltext.** Unter den Ankern stehen Namen,
Anschriften, Geburtsdaten und **Ausweisnummern** von Vertragsparteien aus den
Musterverträgen der Referenz. `CLAUDE.md` verbietet Beispieldaten der
Referenz an jeder Stelle; die Blockliste hat sie nicht gefunden, weil sie
Firma, Anschrift und Städte der Referenz kennt, aber nicht diese Orte und
Personen. Das ist unabhängig von allem anderen zu entfernen.

**2. Eine eigene Vorlage kann so gar nicht funktionieren.** Der Word-Text
eines anderen Maklers enthält diese Sätze nicht. Die Ersetzung findet nichts,
und das erzeugte Dokument bleibt, wie es war — ohne Fehlermeldung. Das
Hochladen eigener Vorlagen, das `fork_12` ermöglicht, läuft damit heute ins
Leere.

**Der richtige Weg** ist der, den die Oberfläche im Reiter
*Vertragsvorlagen* ohnehin schon verspricht: **benannte Platzhalter**
(`{firma_name}`, `{laufzeit_monate}`, `{provision}`, …), die im Word-Text
stehen und ersetzt werden. Damit funktioniert jede Vorlage, die diese Marken
enthält — und es steht kein fremder Vertragstext mehr im Programm.

**Erledigt am 28.09.2026 für zwei der drei:** `fillMaklervertrag` und
`fillObjektnachweis` holen ihren Inhalt jetzt aus den markierten Stellen
(`immoVorlageFuellen`). Neunundvierzig Anker sind damit weg, darunter alle
Namen, Anschriften, Geburtsdaten und Ausweisnummern.

**Ebenfalls erledigt: `fillMietvertrag`.** `fork_26` hat `mietvertrag` als
fünfte Vorlagenart aufgenommen, mit eigenem Feldkatalog und zwei
Beteiligten-Blöcken (Vermieter und Mieter können beide Eheleute sein).
Damit sind alle 56 Anker weg.

**Offen bleibt nur**, welche Vorgabewerte für den Mietvertrag sinnvoll wären
— Kündigungsausschluss, Kaution in Monatsmieten. Die Prüfbedingung lässt für
ihn bisher nur `{}` zu. Das ist eine fachliche Frage, die niemand gestellt
hat; lieber keine Vorgabe als eine erfundene.

## Die Blockliste steht an zwei Stellen

`scripts/neutral.sh` und `tests/funktionen-unveraendert.py` führen je ein
eigenes, base64-kodiertes Muster für die Kennzeichen der Referenz. Am
28.09.2026 ist das aufgefallen, als die eine Liste grün war und die andere
rot — dieselbe Fundstelle, zwei Urteile.

Beide zu pflegen ist fehleranfällig; die Muster laufen auseinander, und
gemerkt wird es erst, wenn ein Kennzeichen durchrutscht. Sie gehören an eine
Stelle, aus der sich beide bedienen.

Nicht dringend, aber es wird nicht besser: jede neue Fundstelle vergrößert
den Abstand.

## Die angemeldeten Funktionen sind durchgesehen — **erledigt 29.09.2026**

*Erledigt am selben Tag. 63 der 90 JWT-geprüften Funktionen benutzen den
`service_role`; alle 63 sind durchgegangen — 62 abgesichert, 1 unbedenklich,
0 offen. Was unten steht, ist der Befund, der zu der Arbeit geführt hat; er
bleibt als Begründung stehen. Buch führt `tests/funktionen-angemeldet.py`,
und die Liste darf nur kürzer werden.*

`tests/funktionen-oeffentlich.py` führt Buch über die 28 Edge Functions
**ohne** JWT-Prüfung. Das ist die halbe Frage.

Am 29.09.2026 ist bei `fahrt-ermitteln` aufgefallen, dass die andere Hälfte
dieselbe Lücke haben kann: die Funktion prüft das JWT, arbeitet danach aber
mit dem `service_role`, für den RLS nicht gilt, und nahm eine `immobilie_id`
aus dem Anfragekörper, ohne zu fragen, wem das Objekt gehört. Ein
angemeldeter Nutzer des einen Maklers hätte Entfernung, Fahrzeit und
Koordinaten zu jedem Objekt jedes anderen abrufen können — und der
Zwischenspeicher wurde dabei auch noch beschrieben.

Das Muster ist immer dasselbe: **JWT geprüft, service_role benutzt, Kennung
aus dem Körper geglaubt.** 90 der 118 Funktionen sind JWT-geprüft, und die
meisten benutzen den `service_role`. Wie viele davon eine Kennung ungeprüft
übernehmen, ist nicht gezählt.

Der ehrliche Weg ist derselbe wie bei den öffentlichen: eine Liste, die nur
kürzer werden darf. Nicht vor Gate 2 zu schaffen, aber vor einem echten
zweiten Mandanten nötig.

## Selbstregistrierung: zwei Schalter in Supabase

Der Unterbau (`fork_30`) und die Oberfläche stehen. Damit sich jemand
wirklich anmelden kann, müssen im Supabase-Projekt zwei Dinge stimmen:

1. **Authentication → Providers → Email → „Enable email signups"** muss an
   sein. Ist es aus, antwortet `auth.signUp()` mit *Signups not allowed for
   this instance* — das Formular meldet das, aber niemand kommt hinein.
2. **Die Bestätigung der E-Mail-Adresse muss eingeschaltet bleiben.** Ohne
   sie entsteht ein Konto ohne geprüfte Adresse; `registrierung_abschliessen()`
   weist so eines ab, und der Anmeldende käme in eine leere Oberfläche.

Dazu kommt die Mailzustellung: Supabase verschickt die Bestätigungsmails
über seinen eingebauten Versand, der eng begrenzt ist (wenige Mails je
Stunde). Für den echten Betrieb gehört dort ein eigener SMTP-Zugang
hinterlegt — dieselbe Frage wie beim `RESEND_API_KEY`.

## ~~Der verdrahtete Firmenname steht noch in der Oberfläche~~ — grösstenteils erledigt 03.10.2026

`tests/firmenname-verdrahtet.py` hat die Klasse für `supabase/functions/`
geschlossen: null von 107. Die Prüfung sieht aber nur dieses Verzeichnis.

In `src/app/anwendung.js` stehen **98 Vorkommen** von `Musterhaus` — dem Namen
des Demo-Mandanten, den die Neutralisierung überall dort eingesetzt hat, wo
die Vorlage ihren eigenen Namen verdrahtet hatte. Stand 03.10.2026 ist nicht
durchgesehen, welche davon ein Kunde liest und welche nur ein Kommentar oder
ein Vorgabewert in einem Formular sind. Die drei Kundenseiten
(`freigabe.html`, `objekt.html`, `unterlagen.html`) und `sonnenverlauf.html`
sind behoben — dort war der Name ein Briefkopf.

**Erledigt am 03.10.2026, am selben Tag.** 99 → 29, und keine der 29 ist ein
Ausgabetext. Der Weg war `immoMarke()` beziehungsweise `immoMarkeMit()`, auf
den beiden öffentlichen Seiten der Name aus der Antwort der Edge Function —
siehe `docs/ENTSCHEIDUNGEN.md`. `tests/firmenname-verdrahtet.py` hat ein
zweites Buch (`BUCH_OBERFLAECHE`) und meldet jede neue Stelle.

**Was davon bewusst stehen bleibt und weiter offen ist:** vier Ordnernamen im
angebundenen Dateispeicher (`001 | …` für die Vertragsvorlagen,
`Musterhaus-Eigentuemer/…` für die Eigentümer-Unterlagen). Ein Pfad ist kein
Text: ihn zu ändern verschiebt Dateien, die schon dort liegen. Das ist eine
Umstellung mit Datenwanderung — sie gehört in die Arbeit am Dateispeicher
(Abschnitt „Storage: die Buckets sind noch nicht getrennt"), nicht in eine
Neutralisierung.

Zwei Fallstricke für diesen Durchgang, beide am 03.10. gesehen:

- `Musterhausen` ist eine **Ortsangabe** in einem Platzhalter, kein
  Firmenname. Eine Prüfung auf `Musterhaus` trifft sie mit.
- Die Straßen-Regel hat an einer Stelle den Namen entfernt und die Hausnummer
  stehen gelassen (`„Am  26, 12345 Musterstadt"`, zwei Leerzeichen). So etwas
  fällt keinem Gate auf, nur beim Lesen.

## Ein neuer Fremdanbieter für Adressen: photon.komoot.io

Die neue Vorlage sucht Adressen im Browser zuerst bei Nominatim (OSM) und
fällt dann auf **Photon** zurück (`epAdresseSuchen`, zwei Stellen). Das ist
ein Dienst, den es im Fork vorher nicht gab.

Was daran offen ist, ist nicht technisch — es gibt keine
Content-Security-Policy im Projekt, der Aufruf geht durch, und die Antwort
wird auf Deutschland, passende Postleitzahl und passenden Straßennamen
geprüft, bevor sie verwendet wird. Offen ist die **datenschutzrechtliche
Seite**: der Browser des Maklers schickt die Adresse des Objekts an einen
weiteren Dritten. Das gehört in die Datenschutzhinweise, zusammen mit
Nominatim und Overpass, und ist bisher nirgends genannt.

## Die drei eigenen Funktionen sind geschrieben, aber nicht erprobt

`unterlagen-link`, `grundriss-ki-lesen` und `bild-privat-retusche` sind
vollständig und syntaktisch geprüft; `npm run check` ist grün. Ausgerollt
sind sie auch — alle drei stehen auf dem eigenen Projekt auf `ACTIVE`, mit
dem `verify_jwt` aus `supabase/config.toml` (121 Funktionen). **Aufgerufen hat
sie noch niemand.** Dazu fehlen:

- **`ANTHROPIC_API_KEY`** und **`REPLICATE_API_TOKEN`** als Secrets im
  Supabase-Projekt. Beide sind jetzt in `.env.example` dokumentiert; der
  Schlüssel selbst gehört nicht ins Repository. Ohne den Replicate-Zugang
  meldet die Privat-Prüfung ihren Befund, kann aber keinen
  Retusche-Vorschlag erzeugen — das ist gewollt und steht so im Befund.
- Ein **Objekt mit Fotos und einem alten Grundriss** im eigenen Projekt, um
  die beiden KI-Wege einmal von Hand durchzuspielen.
- Die **Zustellung der Meldemails** von `unterlagen-link` hängt am selben
  `RESEND_API_KEY` wie der übrige Versand.

Was ohne diese Schlüssel nicht geprüft werden kann: ob das von der KI
gelieferte JSON wirklich durch `epGrundrissKiZuScan` läuft und im Editor ein
brauchbares Blatt ergibt. Das Format ist aus dem Leser abgeleitet, nicht aus
einer Dokumentation — und abgeleitet heißt nicht erprobt.
