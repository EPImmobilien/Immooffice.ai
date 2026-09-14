# Cron-Jobs der Referenz

34 Jobs aus `cron.job` des Projekts `yazwkzzjiquprtjpurur`, gelesen über die
Verwaltungsschnittstelle. Der Bearer im Kommando ist ein Geheimnis und steht
hier **nicht** — bei der Übernahme wird er auf den anon-Key von immooffice
gesetzt (Phase 0.3).

## Zu übernehmen

| Job | Zeitplan | Ziel | aktiv |
|---|---|---|---|
| `akq-automation-10min` | `5,15,25,35,45,55 * * * *` | `akq-automation-lauf` | ja |
| `akq-mail-leads-20min` | `8,28,48 * * * *` | `akq-mail-leads` | ja |
| `besichtigung-nachfassen-taeglich` | `30 5 * * *` | `besichtigung-nachfassen` | ja |
| `cron-logs-aufraeumen` | `0 3 * * *` | SQL, keine Function | ja |
| `eigentuemer-benachrichtigungen-versenden` | `*/5 * * * *` | gleichnamig | ja |
| `expose-erinnerung-stuendlich` | `15 * * * *` | `expose-erinnerung` | ja |
| `fehler-protokoll-aufraeumen` | `20 4 * * *` | SQL | ja |
| `mail-abwesenheit-5min` | `*/5 * * * *` | `mail-abwesenheit-verarbeiten` | ja |
| `mail-anfragen-5min` | `*/5 * * * *` | `mail-anfrage-verarbeiten` | ja |
| `mail-postfach-pull-5min` | `*/5 * * * *` | `mail-postfach-pull` | ja |
| `mail-rechnungen-10min` | `*/10 * * * *` | `mail-rechnung-weiterleiten` | ja |
| `news-briefing-taeglich` | `30 4 * * *` | `news-briefing-erstellen` | **nein** |
| `onoffice-adressen-kontakte` | `20 3 * * *` | `onoffice-adressen` | ja |
| `onoffice-adressen-sync-a` | `0 3 * * *` | `onoffice-adressen` | ja |
| `onoffice-adressen-sync-b` | `10 3 * * *` | `onoffice-adressen` | ja |
| `onoffice-import-bilder-10min` | `7,17,…,57 * * * *` | `onoffice-import` | ja |
| `onoffice-import-objekte-10min` | `4,14,…,54 * * * *` | `onoffice-import` | ja |
| `onoffice-suchkriterien-naechtlich` | `40 3 * * *` | `onoffice-suchkriterien` | ja |
| `onoffice-sync-10min` | `0,10,…,50 * * * *` | `onoffice-sync` | ja |
| `onoffice-termine-sync-10min` | `2,12,…,52 * * * *` | `onoffice-termine-sync` | ja |
| `onoffice-waechter-60min` | `20 * * * *` | `onoffice-waechter` | **nein** |
| `projekt-aktivitaeten-aufraeumen` | `20 3 * * *` | SQL | ja |
| `projekt-datei-benachrichtigung` | `*/5 * * * *` | gleichnamig | ja |
| `push-log-aufraeumen` | `10 3 * * *` | SQL | ja |
| `push-termin-erinnerungen-5min` | `*/5 * * * *` | SQL | ja |
| `suchkriterien-abgleich-15min` | `3,18,33,48 * * * *` | SQL | ja |
| `suchkriterien-newsletter-montags` | `30 6 * * 1` | `suchkriterien-newsletter` | ja |
| `suchkriterien-pflege-taeglich` | `10 6 * * *` | SQL | ja |
| `termin-erinnerung-stuendlich` | `5 * * * *` | `termin-erinnerung` | ja |
| `termin-fahrzeit-taeglich` | `45 4 * * *` | `termin-fahrzeit` | ja |
| `upload-benachrichtigung-versenden` | `*/5 * * * *` | gleichnamig | ja |
| `urlaub-hinweise-maerz` | `0 6 1 3 *` | `urlaub-hinweise` | ja |
| `urlaub-hinweise-november` | `0 6 1 11 *` | `urlaub-hinweise` | ja |

Die onOffice-Jobs werden übernommen, laufen aber bis Phase 2b hinter einem
Feature-Flag (Auftrag 1.4).

## Nicht zu übernehmen

| Job | Grund |
|---|---|
| `jotform-sync-5min` | JotForm-Sync der Referenz (Auftrag 0.3) |

sipgate und Yodeck haben keinen eigenen Cron-Job; sie entfallen im Frontend.

## Wichtig für die Mandantenfähigkeit

Alle Jobs der Referenz laufen für **eine** Firma. Nach Phase 2.4 muss jede
Cron-Function über alle aktiven Firmen iterieren. Ein Job, der das nicht tut,
arbeitet nach der Umstellung nur noch für die zufällig erste Firma — das fällt
im Betrieb erst auf, wenn ein Mandant sich beschwert, dass seine Mails nicht
abgeholt werden.
