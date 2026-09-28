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

**Was dabei offen bleibt — drei Punkte, alle Phase 2.4:**

1. **Die Funktionen sind einmandantig.** Sie lesen Firmenname, Absender und
   Anschrift aus Umgebungsvariablen und festen Vorgabewerten, nicht aus
   `firma_stammdaten` des Mandanten, dem der Datensatz gehört. Mit mehreren
   Mandanten verschickt jede Mail denselben Absender.

2. **Die Platzhalter-Adresse `immooffice.example` muss ersetzt werden.** Sie
   steht überall dort, wo die Vorlage ihre eigene Domain verdrahtet hatte:
   als Rückfall hinter `PORTAL_URL` und `EXPOSE_FREIGABE_BASIS`, in
   Absenderadressen und in den Empfängerlisten von `web-lead`. Die Endung
   `.example` ist nach RFC 2606 reserviert und existiert nicht — solange sie
   dort steht, gehen diese Mails ins Leere und diese Links führen nirgendwohin.
   Das ist Absicht: ein Platzhalter, der auffällt, ist besser als eine
   erfundene Domain, die zufällig jemandem gehört.

3. **`vertrag-pdf` erzeugt Verträge ohne Firmenkopf.** Die Funktion trug die
   drei Standorte der Referenz als Tabelle im Quelltext. An ihre Stelle ist
   ein leerer Eintrag `standard` getreten. Bis die Werte aus
   `firma_stammdaten` (`typ = 'standort'`) kommen, bleiben Firmenname,
   Anschrift und Ort im erzeugten Maklervertrag leer. Ein Vertrag ohne
   Firmenkopf darf nicht an einen Kunden gehen.

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

## Adressbuch als CSV ausgeben — angefordert 28.09.2026

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

**Gebaut wird er deshalb zusammen mit der Rechte-Matrix (1b)**, mit diesen
Eigenschaften:

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

## Eigene Vertragsvorlagen je Makler — angefordert 28.09.2026

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
