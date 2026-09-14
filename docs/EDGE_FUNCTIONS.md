# Edge Functions der Referenz

Vollstaendige Liste aus dem Projekt `yazwkzzjiquprtjpurur`, gelesen ueber die
Verwaltungsschnittstelle. **Quelltext liegt noch nicht vor** — siehe
`docs/STATUS.md` Abschnitt 2.2.

**130 Funktionen.** `verify_jwt=false` heisst: ohne Anmeldung
aufrufbar. Jede dieser Funktionen muss in Phase 2.4 einzeln geprueft werden,
denn sie kann `firma_id` nicht aus einem JWT ableiten und braucht einen
anderen Nachweis (Token, Signatur, Freigabe).

Davon **33 ohne JWT-Pruefung**.

| Funktion | verify_jwt | Version | Uebernahme |
|---|---|---|---|
| `MIGRATION_notizen` | ja | 16 | uebernehmen |
| `akq-automation-lauf` | ja | 10 | uebernehmen |
| `akq-ki-vorlage` | ja | 9 | uebernehmen |
| `akq-lead-eingang` | **nein** | 9 | uebernehmen |
| `akq-mail-leads` | ja | 10 | uebernehmen |
| `akq-wertindikation-pdf` | ja | 9 | uebernehmen |
| `besichtigung-nachfassen` | ja | 10 | uebernehmen |
| `bewerbertest-abgeben` | **nein** | 12 | uebernehmen — ohne JWT-Pruefung, Token-Absicherung pruefen |
| `bewerbertest-abrufen` | **nein** | 12 | uebernehmen — ohne JWT-Pruefung, Token-Absicherung pruefen |
| `bewerbertest-einladen` | ja | 10 | uebernehmen |
| `bewertung-aus-aufnahme` | ja | 19 | uebernehmen |
| `bild-web-variante` | ja | 10 | uebernehmen |
| `brief-pdf-erzeugen` | ja | 10 | uebernehmen |
| `buero-verschieben` | **nein** | 9 | uebernehmen |
| `claude-chat` | ja | 18 | uebernehmen |
| `credentials-anzeigen` | ja | 19 | uebernehmen |
| `credentials-speichern` | ja | 19 | uebernehmen |
| `datei-namen-ki` | ja | 10 | uebernehmen |
| `dokument-umbenennen-vorschlag` | ja | 22 | uebernehmen |
| `ea-mailtest` | ja | 9 | uebernehmen |
| `eigentuemer-benachrichtigungen-versenden` | **nein** | 25 | uebernehmen |
| `eigentuemer-dokument-onedrive-push` | ja | 23 | uebernehmen |
| `eigentuemer-einladen` | ja | 23 | uebernehmen |
| `eigentuemer-link-erneut-senden` | ja | 24 | uebernehmen |
| `eigentuemer-loeschen` | ja | 22 | uebernehmen |
| `eigentuemer-nachricht-senden` | ja | 20 | uebernehmen |
| `eigentuemer-person-hinzufuegen` | ja | 20 | uebernehmen |
| `eigentuemer-report-pdf` | ja | 9 | uebernehmen |
| `energieausweis-anfrage` | **nein** | 11 | uebernehmen |
| `energieausweis-auslesen` | ja | 9 | uebernehmen |
| `energieausweis-schaetzen` | ja | 21 | uebernehmen |
| `entfernungen-berechnen` | ja | 21 | uebernehmen |
| `expose-erinnerung` | ja | 9 | uebernehmen |
| `expose-freigabe` | **nein** | 18 | uebernehmen |
| `expose-freigabe-erstellen` | ja | 16 | uebernehmen |
| `expose-memtest` | **nein** | 9 | uebernehmen, nicht ausliefern (Diagnose) |
| `expose-pdf-erzeugen` | ja | 47 | uebernehmen |
| `expose-pruefen` | ja | 11 | uebernehmen |
| `expose-rueckmeldung-melden` | ja | 16 | uebernehmen |
| `fahrt-ermitteln` | ja | 9 | uebernehmen |
| `generate-text` | ja | 40 | uebernehmen |
| `jotform-poll` | ja | 25 | entfaellt — JotForm-Sync der Referenz |
| `jotform-webhook` | ja | 19 | entfaellt — JotForm-Sync der Referenz |
| `ki-bildbearbeitung` | **nein** | 39 | uebernehmen |
| `mail-abwesenheit-verarbeiten` | ja | 10 | uebernehmen |
| `mail-anfrage-verarbeiten` | ja | 11 | uebernehmen |
| `mail-anhaenge-diagnose` | **nein** | 6 | uebernehmen, nicht ausliefern (Diagnose) |
| `mail-anhaenge-extrahieren` | ja | 25 | uebernehmen |
| `mail-aufgaben-erkennen` | ja | 9 | uebernehmen |
| `mail-ki-vorschlag` | ja | 24 | uebernehmen |
| `mail-postfach-backfill` | ja | 10 | uebernehmen |
| `mail-postfach-pull` | ja | 34 | uebernehmen |
| `mail-postfach-speichern` | ja | 18 | uebernehmen |
| `mail-rechnung-weiterleiten` | ja | 10 | uebernehmen |
| `mail-senden` | ja | 25 | uebernehmen |
| `mail-zu-mietanfrage` | ja | 16 | uebernehmen |
| `mail-zu-todo` | ja | 11 | uebernehmen |
| `makler-nachricht-senden` | ja | 20 | uebernehmen |
| `mietvertrag-pdf` | ja | 9 | uebernehmen |
| `mitarbeiter-loeschen` | ja | 19 | uebernehmen |
| `mpe-pdf-erzeugen` | ja | 30 | uebernehmen |
| `news-briefing-erstellen` | **nein** | 22 | uebernehmen |
| `notiz-analysieren` | ja | 16 | uebernehmen |
| `notiz-transkribieren` | ja | 17 | uebernehmen |
| `objekt-wissen-auslesen` | ja | 11 | uebernehmen |
| `oeffentliche-objekte` | **nein** | 14 | uebernehmen |
| `onoffice-adress-diagnose` | **nein** | 10 | uebernehmen, nicht ausliefern (Diagnose) |
| `onoffice-adressen` | ja | 11 | uebernehmen |
| `onoffice-bild-diagnose` | **nein** | 14 | uebernehmen, nicht ausliefern (Diagnose) |
| `onoffice-bilder` | ja | 12 | uebernehmen |
| `onoffice-felder-werte-diagnose` | **nein** | 12 | uebernehmen, nicht ausliefern (Diagnose) |
| `onoffice-import` | ja | 18 | uebernehmen |
| `onoffice-nachtrag-test` | **nein** | 9 | uebernehmen, nicht ausliefern (Diagnose) |
| `onoffice-objekt-anlegen` | ja | 15 | uebernehmen |
| `onoffice-objekt-speichern` | ja | 13 | uebernehmen |
| `onoffice-portal-diagnose` | **nein** | 10 | uebernehmen, nicht ausliefern (Diagnose) |
| `onoffice-suchkriterien` | **nein** | 4 | uebernehmen |
| `onoffice-sync` | ja | 16 | uebernehmen |
| `onoffice-termin-schreiben` | ja | 15 | uebernehmen |
| `onoffice-termine-sync` | ja | 11 | uebernehmen |
| `onoffice-test` | ja | 19 | uebernehmen, nicht ausliefern (Diagnose) |
| `onoffice-upload-diagnose` | **nein** | 11 | uebernehmen, nicht ausliefern (Diagnose) |
| `onoffice-vorlagen-import` | ja | 11 | uebernehmen |
| `onoffice-waechter` | ja | 9 | uebernehmen |
| `parse-einwertung` | ja | 21 | uebernehmen |
| `parse-energieabrechnung` | ja | 22 | uebernehmen |
| `parse-energieausweis` | ja | 22 | uebernehmen |
| `parse-expose` | ja | 20 | uebernehmen |
| `parse-grundbuch` | ja | 23 | uebernehmen |
| `parse-immo-dokument` | ja | 22 | uebernehmen |
| `parse-maklervertrag` | ja | 19 | uebernehmen |
| `parse-objektnachweis` | ja | 17 | uebernehmen |
| `parse-schmiede-notizen` | ja | 21 | uebernehmen |
| `parse-zaehler` | ja | 22 | uebernehmen |
| `portal-export` | ja | 11 | uebernehmen |
| `portal-export-homepage` | ja | 12 | uebernehmen |
| `portal-ftp-diagnose` | **nein** | 10 | uebernehmen, nicht ausliefern (Diagnose) |
| `projekt-datei-benachrichtigung` | ja | 14 | uebernehmen |
| `projekt-daten` | **nein** | 19 | uebernehmen |
| `projekt-interaktion` | **nein** | 14 | uebernehmen |
| `projekt-login` | **nein** | 13 | uebernehmen |
| `projekt-nachricht-antwort` | ja | 11 | uebernehmen |
| `projekt-upload` | **nein** | 11 | uebernehmen |
| `projekt-wohnungen` | **nein** | 10 | uebernehmen |
| `push-antworten` | **nein** | 1 | uebernehmen |
| `push-senden` | **nein** | 13 | uebernehmen |
| `radar-erfassen` | ja | 9 | uebernehmen |
| `rechnung-pdf-erzeugen` | ja | 26 | uebernehmen |
| `reservierung-pdf-erzeugen` | ja | 18 | uebernehmen |
| `reservierung-word-erzeugen` | ja | 12 | uebernehmen |
| `rundgang-oeffentlich` | **nein** | 9 | uebernehmen |
| `signatur-token-validieren` | **nein** | 14 | uebernehmen |
| `signatur-unterschreiben` | **nein** | 20 | uebernehmen |
| `signatur-vorgang-starten` | ja | 30 | uebernehmen |
| `signatur-vorgang-widerrufen` | ja | 9 | uebernehmen |
| `smooth-function` | ja | 23 | uebernehmen |
| `sprachmemo-auswerten` | ja | 21 | uebernehmen |
| `suchkriterien-newsletter` | **nein** | 1 | uebernehmen |
| `termin-erinnerung` | ja | 11 | uebernehmen |
| `termin-fahrzeit` | ja | 13 | uebernehmen |
| `termin-serie` | ja | 9 | uebernehmen |
| `text-korrigieren` | ja | 22 | uebernehmen |
| `upload-benachrichtigung-versenden` | **nein** | 17 | uebernehmen |
| `upload_benachrichtigung_planen` | ja | 16 | uebernehmen |
| `urlaub-hinweise` | ja | 9 | uebernehmen |
| `vertrag-pdf` | ja | 11 | uebernehmen |
| `web-asset-kopieren` | ja | 9 | uebernehmen |
| `web-lead` | **nein** | 10 | uebernehmen |
| `yodeck-api` | ja | 16 | entfaellt — Shop-TV der Referenz |
| `yodeck-test` | ja | 12 | entfaellt — Shop-TV der Referenz |

## Nicht zu uebernehmen

Nach Phase 1.4 des Auftrags. Die Tabellen dazu wandern ebenfalls nicht mit.

- `jotform-poll` — JotForm-Sync der Referenz
- `jotform-webhook` — JotForm-Sync der Referenz
- `yodeck-api` — Shop-TV der Referenz
- `yodeck-test` — Shop-TV der Referenz

**Korrektur vom 14.09.2026.** Die drei `bewerbertest-*`-Funktionen standen hier
zuerst als „entfaellt ersatzlos". Das war die Streichliste des Masterprompts,
und die gilt nicht mehr: Phase 1.4 des Auftrags nennt nur Telefonanlage,
Shop-TV, Formular-Sync, Cron-Mailadressen und den Bewertungsdienst-Schluessel,
Phase 9 verbietet jede weitere Streichung. Der Einstellungstest wird also
uebernommen. Falls er den Formular-Dienst braucht, ist das beim Sichten des
Quelltexts zu entscheiden und hier nachzutragen — nicht vorab zu streichen.

Dazu entfaellt die sipgate-Telefonie (keine eigene Function, im Frontend)
und der Sprengnetter-Schluessel.
