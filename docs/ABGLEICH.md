# Abgleich mit der Vorlage

Dieses Dokument wird bei jedem Abgleich fortgeschrieben. Es sagt, welchen Stand
der Vorlage ImmoOffice.ai abbildet und was sich seit dem letzten Abgleich
geändert hat.

| Abgleich | Stand der Vorlage | Grundlage |
|---|---|---|
| 14.09.2026 | Schema vom 14.09., Oberfläche vom 14.09. | Vollexport, prüfsummengesichert |
| 27.09.2026 | Schema vom 26.09., Oberfläche vom 26.09. | Fingerabdruck-Vergleich (siehe unten) |
| 02./03.10.2026 | Oberfläche bis Stufe 150 | neuer Export, 40 Stufen (ENTSCHEIDUNGEN, 02.10.) |
| 05.10.2026 | Schema vom 05.10., Oberfläche Stufe 173 | Bauergebnis aus dem Quell-Repository, Migrationsliste (Abschnitt 7) |

---

## 1. Die Vorlage ist ein bewegliches Ziel

In **zwölf Tagen** hat die Vorlage zugelegt:

| | 14.09. | 26.09. | Δ |
|---|---|---|---|
| Tabellen | 167 | 187 | **+20** |
| Spalten | 2538 | 2791 | **+253** |
| Funktionen | 84 | 103 | **+19** |
| Trigger | 54 | 64 | +10 |
| Richtlinien | 320 | 344 | +24 |
| Fremdschlüssel | 273 | 302 | +29 |
| Indizes | 243 | 266 | +23 |
| Schlüssel | 211 | 232 | +21 |
| Prüfbedingungen | 94 | 98 | +4 |
| Sichten | 4 | 5 | +1 |
| Sequenzen | 5 | 6 | +1 |
| Cron-Jobs | 34 | 43 | +9 |
| angewendete Migrationen | 166 | 219 | **+53** |
| Buckets | 25 | 25 | 0 |
| Storage-Richtlinien | 63 | 63 | 0 |
| Oberfläche `index.html` | 4,69 MB | 5,25 MB | **+12 %** |

Das ist kein Ausrutscher, das ist der Takt: **rund vier Migrationen pro Tag.**
Ein Fork, der diesem Takt hinterherläuft, kommt nie an. Deshalb braucht der
Fork einen **Stichtag** — dazu die Frage am Ende.

## 2. Wie gemessen wurde

Nicht durch erneutes Vollexportieren, sondern über Fingerabdrücke: für jedes
Objekt bildet die lokale Instanz (die den Stand 14.09. exakt reproduziert) einen
kurzen Hash, das Quellprojekt bildet denselben Hash, verglichen wird im
Quellprojekt. Nur was sich unterscheidet, wird im Volltext geholt.

**Zwei Messfehler, beide in derselben Zahl.** Der erste Durchlauf meldete
**45 geänderte Funktionen**, der zweite **9**, tatsächlich geändert sind
**3**. Beide Male lag der Fehler nicht in der Vorlage, sondern im Vergleich:

1. *Wagenrückläufe.* Beim Export vom 14.09. habe ich CR aus den
   Funktionskörpern entfernt. Der Hash sah damit Unterschiede, wo keine
   Verhaltensänderung ist. `replace(…, E'\r', '')` auf beiden Seiten: 45 → 9.
2. *Meine eigene Neutralisierung.* Sechs der restlichen neun unterscheiden sich
   nur da, wo in `20260915000400_vorlage_funktionen.sql` Projekt-URL, eigene
   Mail-Domain, Kleinanzeigen-Kennung und Firmenname ersetzt sind
   (`mail_eingang_push`, `push_termin_erinnerungen_senden`,
   `suchkriterien_abgleich_lauf`, `portal_importbericht_auswerten`,
   `rechnung_vorlage_aus_objektnachweis`, `mail_eingang_anfrage_vorfilter`).
   Gegenprobe: dieselben Ersetzungen auf den heutigen Stand der Vorlage
   angewendet und erneut verglichen — sechs Funktionen waren danach Zeichen für
   Zeichen gleich. 9 → 3.

Daraus folgt eine Regel für jeden weiteren Abgleich: **ein Fingerabdruck über
neutralisierten Code kann nie gleich sein.** Vergleichbar wird er erst, wenn die
Neutralisierung auf beide Seiten angewendet wird. Dasselbe gilt für die
Cron-Jobs — dort melden alle 27 vorhandenen Jobs einen Unterschied, und keiner
ist einer.

## 3. Was sich wirklich geändert hat

### 20 neue Tabellen

Sie zeigen, woran gearbeitet wurde:

| Bereich | Tabellen |
|---|---|
| Newsletter | `newsletter_anmeldungen`, `newsletter_kampagnen`, `newsletter_versand` |
| Landing-Pages | `landing_faq`, `landing_fragen`, `landing_besichtigungswuensche` |
| onOffice-Exposéversand | `onoffice_expose_versand`, `onoffice_expose_pruefung`, `onoffice_status_log`, `onoffice_benutzer_zuordnung` |
| Objektdateien | `immobilie_datei_geloescht`, `immobilie_titelbild_wahl`, `projekt_datei_freigaben` |
| Mail | `mail_rechnung_ziele`, `mail_termineinladungen` |
| Sonstiges | `besichtigung_absagen`, `kontakt_emails`, `objekt_status_vorschlag`, `portal_einstellungen`, `akq_vorlagen_sicherung` |

### 16 geänderte Tabellen

`checkliste_vorlagen`, `eigentuemer_dokumente`, `eigentuemer_einladungen`,
`eigentuemer_personen`, `expose_freigaben`, `immobilie_datei`,
`immobilie_wissen`, `kontakte`, `mail_ordner`, `mail_versendet`,
`notar_laufzettel`, `profiles`, `projekt_dateien`, `projekt_zugaenge`,
`termine`, `todos` — durchweg neue Spalten, keine entfernten.

Sechs weitere Tabellen melden einen Unterschied, der **von mir** kommt und kein
Rückstand ist: `firma_stammdaten`, `kosten_saetze`, `provision_tracker`,
`vertraege`, `objektnachweise`, `reservierungen_neubau` — dort sind die
Firmenangaben der Vorlage aus den Standardwerten entfernt.

### 19 neue Funktionen, 3 echt geänderte

Neu, gruppiert: Exposé-Nachfassen (`expose_nachfass_aufgaben`,
`expose_nachfass_erledigen`, `expose_abgerufen`, `expose_freigabe_geloescht`),
Newsletter (`newsletter_empfaenger`, `newsletter_abmelden`,
`newsletter_freigabe_pruefen`), Dateifreigaben
(`immobilie_datei_freigabe_sync`, `immobilie_wissen_freigabe_sync`,
`immobilie_datei_loeschung_merken`), Projektglocke
(`projekt_nachricht_glocke`, `projekt_nachricht_gelesen_glocke`,
`projekt_zugaenge_touch`), onOffice (`oo_benutzer_profil`,
`oev_nachfass_erledigen`), dazu `eigentuemer_besichtigungen`,
`kontakte_zustaendig_abgleichen`, `termine_eigentuemer_kontakt_aufraeumen`,
`intern_secret_pruefen`.

Echt geändert: `checkliste_aus_vorlage_kopieren`, `objekt_kosten_berechnen`,
`reservierung_status_sync`.

### 10 neue Trigger, 1 neue Sicht, 1 neue Sequenz, 9 neue Cron-Jobs

Sicht `expose_abgerufen_schluessel`, Sequenz `onoffice_status_log_id_seq`.
Neue Jobs: `expose-nachfass-taeglich`,
`eigentuemer-einladung-nachfassen-taeglich`, `landing-fragen-5min`,
`kontakte-zustaendig-abgleich`, `onoffice-expose-abgleich-2h`,
`onoffice-adressen-neu-30min`, `onoffice-adressen-kontakte-30min`,
`onoffice-adressen-sync-c`, `onoffice-adressen-sync-d`.

### Nichts entfernt

Keine Tabelle, keine Spalte, keine Funktion, kein Trigger ist weggefallen. Der
Rückstand ist reine Ergänzung — das macht das Nachziehen unkritisch.

---

## 4. Die Oberfläche: was der Upload wirklich ist

| | |
|---|---|
| Datei | `index.html`, 5.253.813 Bytes, 15.778 Zeilen |
| dazu | `objekt.html` (63 kB), `sonnenverlauf.html` (76 kB) — **beide neu**, 14.09. noch nicht vorhanden |
| weiter | `freigabe.html`, `sw.js`, `_redirects` |
| Anwendungscode | **ein** `<script>`-Block, Zeilen 406–15756 |
| `React.createElement` | 14.957 — kein JSX, kein Babel zur Laufzeit |
| `ReactDOM.createRoot` | 4 (Hauptanwendung, Telefonbalken, Offline-Hinweis, Dialoge) |
| CDN-Skripte | 14, darunter **neu**: `maplibre-gl@4.7.1` |
| Schriften | Montserrat, Marcellus, **neu**: Cormorant Garamond |

**Der Befund, der Phase 1 bestimmt:** Die Datei ist ein **Bauergebnis, kein
Quelltext.** 81 % aller Zeichen stecken in 53 sehr langen Zeilen, und eine
einzige Zeile ist **2.431.408 Zeichen** lang — 46 % der ganzen Datei. Lokale
Variablennamen darin sind auf einen Buchstaben eingekürzt
(`function ImmobilienPage({user:e}){const[t,n]=useState(…)`).

Zurückverwandeln lässt sich das nicht: die eingekürzten Namen sind verloren.

**Was aber geht, und das ist viel:** Auf oberster Ebene ist **nichts**
eingekürzt. Der große Block enthält **461 Namen, davon 456 sprechend** —
`AdminPage`, `AkqDossier`, `AkqKampagneEditor`, `AKQ_MPE_SPALTEN` und so
weiter. Kein einziger einbuchstabiger Name auf oberster Ebene. Dazu kommen im
lesbaren Teil **101 Abschnittsbanner** mit deutschen Modulnamen
(„360°-Rundgang (Modul)", „Telefonate per Klick verbuchen",
„Kostenrechner pro Objekt", …).

Die Zerlegung in `src/` ist damit möglich und sinnvoll: Module und Komponenten
bekommen eigene Dateien mit ihren richtigen Namen. Was terse bleibt, sind die
Variablennamen **innerhalb** der Funktionen.

---

## 5. Zwei Fragen, die den Fork sonst einholen

1. ~~**Stichtag.**~~ **Entschieden am 27.09.2026: laufend nachziehen.** Kein
   Stichtag. Der Fork wird bei jeder Sitzung neu abgeglichen. Das ist die
   teurere Variante, und sie ist bewusst gewählt: der Fork soll dicht an der
   Vorlage bleiben. Was das kostet, steht in `docs/ENTSCHEIDUNGEN.md` unter
   dem 27.09. — und es bedeutet, dass dieses Dokument bei jedem Abgleich eine
   neue Zeile in der Tabelle oben bekommt.

2. **Quelltext statt Bauergebnis.** Die eingekürzten Variablennamen entstehen in
   einem Bauschritt. Wenn es die Datei **vor** diesem Schritt gibt, ist sie die
   bessere Grundlage — dann ist die Kopie vollständig lesbar. Wenn es sie nicht
   gibt, arbeite ich mit dem Bauergebnis weiter; es geht, nur bleibt ein Teil
   des Codes schwer lesbar.

Beides blockiert nicht: das Schema ist auf den 26.09. nachgezogen (Abschnitt 6),
als nächstes wird die Oberfläche nach den 101 Abschnitten zerlegt. Die Antworten
ändern nur, wie gut das Ergebnis wird und wie oft es wiederholt werden muss.

---

## 6. Was nachgezogen wurde — Stand 27.09.2026

Sieben Migrationen, jede einzeln gegen das Quellprojekt geprüft:

| Datei | Inhalt |
|---|---|
| `20260927100100_abgleich_tabellen.sql` | 1 Sequenz, 20 Tabellen, 46 Spalten |
| `20260927100200_abgleich_schluessel.sql` | 19 Primärschlüssel, 2 Eindeutigkeiten, 4 neue und 3 erweiterte Prüfbedingungen, 29 Fremdschlüssel |
| `20260927100300_abgleich_indexe.sql` | 23 Indexe |
| `20260927100400_abgleich_funktionen.sql` | 19 neue, 3 geänderte Funktionen |
| `20260927100500_abgleich_sichten_und_trigger.sql` | 1 Sicht, 10 Trigger |
| `20260927100600_abgleich_rls_und_richtlinien.sql` | RLS für 21 Tabellen, 31 Richtlinien, 1 Rechte-Korrektur |
| `20260927100700_abgleich_cron.sql` | 9 Cron-Jobs |

**Wie geprüft wurde:** nach jedem Schritt bildet die lokale Instanz einen
Gesamt-Hash über alle Objekte der Art (Name plus Definition, sortiert), das
Quellprojekt bildet denselben Hash. Tabellen, Spalten, Schlüssel,
Prüfbedingungen, Fremdschlüssel, Indexe, Sichten, Trigger, Richtlinien und
RLS-Zustand stimmen danach **zeichengleich** — nicht nur in der Anzahl.
`npm run check` läuft die ganze Kette auf einer leeren Instanz durch; alle 15
Kennzahlen von `tests/vorlage-vollstaendig.sql` stehen auf dem Stand 26.09.

**Absichtliche Abweichungen, unverändert vier:** `eigene_funktions_url` kommt
hinzu (Projekt-URL aus dem Vault statt im Klartext), `jotform-sync-5min`
entfällt (Phase 1.4), `shop-tv` entfällt samt vier Storage-Richtlinien
(Phase 1.4), die drei Schrift-Buckets sind zu `schriften` zusammengelegt.

**Zwei Lücken im eigenen Vorgehen, beide gefunden und geschlossen:**

- Die sechs neutralisierten Tabellen hatte ich aus dem Spaltenvergleich
  ausgeschlossen. Dort fehlten trotzdem **sieben Spalten**
  (`firma_stammdaten.marken_name`, `.fax`, `.kammer`, `.aufsichtsbehoerde`,
  `.rechtshinweis`, `reservierungen_neubau.immobilie_id`,
  `.kaeufer_kontakt_ids`). Aufgefallen ist es an einem Fremdschlüssel, der auf
  eine Spalte zeigte, die es lokal nicht gab.
- Beim Übertragen eines Blocks habe ich ein Leerzeichen verloren. Der
  Blockvergleich hat es gefunden, weil die Länge gleich, der Hash aber anders
  war. Deshalb wird jeder Block einzeln geprüft und nicht nur die Datei als
  Ganzes.

**Storage braucht keinen Nachtrag.** Die fünf Buckets `branding`, `importe`,
`marke`, `objektbilder`, `objektdokumente` und zwanzig Storage-Richtlinien, die
die lokale Instanz mehr hat als die Vorlage, stammen aus dem **Altbestand** der
Next.js-Anwendung. Sie wandern beim Verschieben nach `altbestand` nicht mit,
weil `storage` ein eigenes Schema ist. Gelöscht wird nichts — vermerkt in
`docs/OFFEN.md`.

Die Liste stand zuerst auf drei Buckets und dreizehn Richtlinien. Beim
Vollständigkeitstest gegen das laufende Projekt fehlten genau zwei Buckets und
sieben Richtlinien: `branding` mit vier und `importe` mit drei. Beide sind vom
17.07. und 03.09. und damit älter als jede Fork-Migration. Nicht zu verwechseln
mit dem eigenen Bucket `branding-assets` der Vorlage, dessen Richtlinien
`branding_lesen`, `branding_schreiben` und `branding_loeschen` heißen — der
Altbestand nutzt `branding_read`, `branding_insert`, `branding_update`,
`branding_delete`. Die Zählung war unvollständig, nicht der Abgleich: im Schema
`public` stimmen alle dreizehn übrigen Kennzahlen.

**Ein Sicherheitsbefund ist behoben.** `suchkriterien_lauf` hatte in der Vorlage
kein RLS; im Export vom 14.09. stand die Zeile deshalb auskommentiert. Die
Vorlage hat den Befund inzwischen behoben, der Fork zieht nach: RLS an,
Richtlinie `suchkriterien_lauf_team`. Damit haben **alle 187 Tabellen** RLS.

**Ein neuer Befund kommt dazu.** Der Job `onoffice-expose-abgleich-2h` ruft die
Funktion `onoffice-expose-abgleich` **ohne Authorization-Kopf** auf. Das
funktioniert nur, wenn die Funktion ohne JWT-Prüfung läuft, also öffentlich
erreichbar ist. Übernommen wie in der Vorlage, aber vermerkt in
`docs/OFFEN.md`.

---

## 7. Abgleich vom 05.10.2026 — Stufe 151 bis 173

**Grundlage diesmal nicht ein Netlify-Export, sondern das Bauergebnis aus dem
Quell-Repository der Vorlage** (`portal/bau/liefer/`, Commit `cd433e9`, Stand 05.10. 13:48).
Ab jetzt läuft der Abgleich nachts automatisch, nach `docs/ABGLEICH-NACHTLAUF.md`;
der übernommene Stand steht in `docs/abgleich-stand.txt`.
Das ist dieselbe Datei, die ausgeliefert wird, nur ohne den Umweg über einen
Upload.

### Oberfläche

`src/app/anwendung.js` +4.136 / −130 Zeilen, Zerlegung byte-genau, Gate
sauber. Inhalt der 23 Stufen: Geometrie (Punktwolke Runden 2–5,
Wandmodell in gemessener Stärke, Außenwände fest 30 cm und geschlossene Hülle,
Dachgeschoss mit Treppe, Dachfenstern und Wänden über Möbelhöhe, L-Treppe,
Ansichten/Schnitte/Kubatur, Geschosse stapeln, DXF/PTS-Ausgabe,
Wohnflächenrechner aus dem Grundriss) und Aufmaß-Projekte im Scanner.
Nebenseiten: nur `sw.js` (Versionsmarke).

**Kein neuer Aufruf einer Edge Function, kein neuer Bucket, keine neue
Datenbankfunktion.** Geprüft, indem jede Tabelle, jeder Bucket und jede
`rpc`/`invoke`-Kennung der Oberfläche gegen die lokale Instanz gehalten wurde.
Einzige neue Tabelle: `aufmass_projekt`. (`marketing-print-vorlagen` fehlt
weiterhin, bekannt aus `docs/OFFEN.md`.)

### Schema

Sechs Migrationen der Vorlage seit dem 02.10.:

| Vorlage | Fork | Inhalt |
|---|---|---|
| `aufmass_scan`, `aufmass_scan_raumscan_datei` | `fork_33a` | **Korrektur:** `fork_31a` hatte die Tabelle aus der Oberfläche abgeleitet und sechs Spalten nicht gekannt (`quelle`, `scan_ablage_id`, `datei_id`, `ersteller_id`, `updated_at`, `raumscan_datei_id`). Die Oberfläche schreibt drei davon beim Zuordnen aus der Ablage — dieser Weg war im Fork bisher kaputt. |
| `aufmass_projekt`, `scan_ablage_projekt` | `fork_33a` | neue Tabelle mit Mandantengrenze, `scan_ablage.projekt_id` |
| `sicherheit_team_only_policies` | `fork_33b` | `is_chef()` nur noch aus `profiles`; 73 erlaubende `true`-Richtlinien gelten nur noch für das Team |
| `sicherheit_definer_funktionen_team_guard` | `fork_33b` | Team-Wache in zwölf SECURITY-DEFINER-Funktionen, in **ihrer Fork-Fassung** |
| (entfernende Schritte beider) | `fork_33c` | zwei geratene Regeln aus `fork_31a` weg, Art `foto`, zwei `revoke` |

Bestätigt: `aufmass_scan`, `aufmass_projekt` und `scan_ablage` stimmen im
lebenden Projekt Spalte für Spalte mit der lokalen Instanz überein (Hash),
bis auf den Vorgabewert von `umfang`, der in `fork_33c` fällt.

**Im lebenden Projekt noch nicht angewendet:** `fork_33b` Teil 2 (die
Funktionswachen) und `fork_33c` — siehe `docs/OFFEN.md`. Das Werkzeug lässt
`drop`/`revoke` nur nach Einzelfreigabe zu.

### Edge Functions und Cron

Keine Funktion der Vorlage ist seit dem 01.10. geändert worden. Bei den
Cron-Jobs hat die Vorlage drei, die im Fork fehlen, alle zu den beiden
selbst geschriebenen Funktionen: `bild-privat-retusche-2min` (Aktion
`batch`), `unterlagen-link-benachrichtigen-5min` (im Fork:
`unterlagen-link-melden-5min`, gleichwertig) und
`transfer-aufraeumen-taeglich` (Aktion `aufraeumen`). Die Aktionen `batch`
und `aufraeumen` kennt die Fork-Fassung nicht — vermerkt in `docs/OFFEN.md`.
