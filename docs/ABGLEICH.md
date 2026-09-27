# Abgleich mit der Vorlage

Dieses Dokument wird bei jedem Abgleich fortgeschrieben. Es sagt, welchen Stand
der Vorlage ImmoOffice.ai abbildet und was sich seit dem letzten Abgleich
geändert hat.

| Abgleich | Stand der Vorlage | Grundlage |
|---|---|---|
| 14.09.2026 | Schema vom 14.09., Oberfläche vom 14.09. | Vollexport, prüfsummengesichert |
| 27.09.2026 | Schema vom 26.09., Oberfläche vom 26.09. | Fingerabdruck-Vergleich (siehe unten) |

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

**Ein Messfehler, der erst beim zweiten Blick auffiel:** Der erste Durchlauf
meldete **45 geänderte Funktionen**. Tatsächlich geändert sind **drei**. Die
anderen 42 unterscheiden sich nur darin, dass ich beim Export die
Wagenrückläufe (CR) aus den Funktionskörpern entfernt hatte — der Hash sah
Unterschiede, wo keine Verhaltensänderung ist. Nach `replace(…, E'\r', '')` auf
beiden Seiten blieb die richtige Zahl übrig. Wer nur die erste Zahl gelesen
hätte, hätte 42 Funktionen ohne Grund angefasst.

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

1. **Stichtag.** Bei vier Migrationen pro Tag in der Vorlage: soll
   ImmoOffice.ai auf den Stand **26.09.2026** eingefroren und fertiggebaut
   werden, und spätere Änderungen der Vorlage kommen als eigener, bewusster
   Abgleich dazu? Alles andere führt zu einem Fork, der dauerhaft hinterherläuft
   und nie fertig wird.

2. **Quelltext statt Bauergebnis.** Die eingekürzten Variablennamen entstehen in
   einem Bauschritt. Wenn es die Datei **vor** diesem Schritt gibt, ist sie die
   bessere Grundlage — dann ist die Kopie vollständig lesbar. Wenn es sie nicht
   gibt, arbeite ich mit dem Bauergebnis weiter; es geht, nur bleibt ein Teil
   des Codes schwer lesbar.

Beides blockiert nicht: ich ziehe das Schema auf den 26.09. nach und zerlege die
Oberfläche nach den 101 Abschnitten. Die Antworten ändern nur, wie gut das
Ergebnis wird und wie oft es wiederholt werden muss.
