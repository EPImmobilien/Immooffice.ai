# Offen

Was ohne Verhaltensänderung, ohne fehlende Zugangsdaten oder ohne Netzzugang
nicht lösbar ist. Nach Auftrag Abschnitt 9.

## Umgebung

| Punkt | Wirkung |
|---|---|
| Egress-Proxy sperrt `api.supabase.com` und beide `*.supabase.co` | Kein CLI-Export, kein `db push`. Schema nur über die Verwaltungsschnittstelle lesbar. |
| Egress-Proxy sperrt `unpkg.com` und `cdn.jsdelivr.net` | Die tatsächlich aufgelösten CDN-Versionen sind nicht feststellbar; exakte Pins stehen aus. Ein lokaler Build kann die Bibliotheken nicht laden, der Smoke-Test also nur die Struktur prüfen, nicht das Laufverhalten. |
| Kein Supabase-CLI, Installation ohne Netz nicht möglich | `supabase functions download`, `supabase secrets list`, `supabase db dump` entfallen. |

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

## Der Quelltext der Oberflaeche — **Ihre Mitwirkung noetig**

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

## Zwei CDN-Bibliotheken ohne feste Version

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
