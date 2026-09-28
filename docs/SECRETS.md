# Secrets — Namen, nicht Werte

**Werte stehen niemals hier, niemals im Code, niemals im Repository.**
Sie kommen aus `.env.local` beziehungsweise aus den Function-Secrets des
Supabase-Projekts.

## ~~Inventar der Referenz — offen~~ — erledigt am 28.09.2026

~~`supabase secrets list --project-ref …` konnte nicht laufen: kein CLI, kein
Netzzugang.~~ Das Inventar steht jetzt weiter unten. Es stammt nicht aus dem
Projekt der Vorlage, sondern aus dem Quelltext der Edge Functions — und das
ist die bessere Quelle: `secrets list` sagt, was jemand einmal gesetzt hat,
der Quelltext sagt, was die Funktionen tatsächlich lesen.

## Was nach Auftrag Abschnitt 2 gebraucht wird

| Name | Zweck | Stand |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | CLI, Schema- und Function-Export | **fehlt** |
| DB-Passwort `usguiggfciavwzkdfjgt` | Migrationen einspielen | **fehlt** |
| DB-Passwort `yazwkzzjiquprtjpurur` | nur lesender Export | **fehlt** |
| `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` | Auslieferung | **fehlt** |
| `GITHUB_TOKEN` | Repository, Netlify-Anbindung | **fehlt** |
| `ANTHROPIC_API_KEY` | KI-Funktionen | **fehlt** |
| `RESEND_API_KEY` | Systemversand | **fehlt** |
| `CARTO_KEY` | Kartengrundlage | im Quelltext der Referenz vorhanden, siehe unten |
| `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Microsoft 365, mandantenfähig | **fehlt** → `SPÄTER` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Workspace | **fehlt** → `SPÄTER` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Abrechnung | **fehlt** → `SPÄTER` |

Vorhanden sind in `.env.local` nur drei Variablen des Altbestands:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_APP_URL`.

## CARTO-Schlüssel

Die Referenz setzt ihn im Kopf der `index.html` als `window.CARTO_KEY` — im
Frontend zwangsläufig öffentlich, so ist der Dienst gedacht. Der Schlüssel der
Referenz wird **nicht** übernommen (Neutralität); immoOffice.ai braucht einen
eigenen. Bis dahin: Karten ohne Basemap, Hinweis im Portal.

## Regel für Zugangsdaten der Mandanten

Zugangsdaten zu fremden CRM-, Portal- und Mail-Diensten gehören nach Phase 2b
**ausschließlich** in den Supabase Vault (`firma_integrationen.zugangsdaten_id`,
`postfaecher.zugangsdaten_id`). Niemals im Klartext, niemals in einer
Fachtabelle, niemals im Frontend. Nur Edge Functions lesen sie.

Die Referenz hat dafür `public.external_credentials` mit dem Kommentar
„Passwoerter sind obfuscated, kein Klartext". Verschleierung ist keine
Verschlüsselung — bei der Übernahme wird das auf den Vault umgestellt und in
`docs/ENTSCHEIDUNGEN.md` protokolliert.

<!-- INVENTAR-ANFANG -->
## Inventar aus dem Quelltext — Stand 28.09.2026

Erzeugt von `scripts/geheimnisse-inventar.py` aus jedem
`Deno.env.get("…")` in `supabase/functions/`. Nicht von Hand pflegen.

Die Liste sagt, was **gebraucht** wird, nicht was gesetzt ist. Fehlt ein
Wert, antwortet die betroffene Funktion mit einem Fehler — sie faellt
nicht stumm aus, aber sie arbeitet auch nicht.

| Geheimnis | Funktionen | Wofür |
|---|---:|---|
| `ANTHROPIC_API_KEY` | 41 | KI-Texte, Auslese von Unterlagen, Bewertung |
| `RESEND_API_KEY` | 29 | Mailversand ueber Resend |
| `MAIL_SECRET_KEY` | 21 | Schluessel, mit dem die SMTP-Passwoerter der Postfaecher verschluesselt sind |
| `ONOFFICE_SECRET` | 13 | CRM-Anbindung onOffice, zweiter Teil des Zugangs |
| `ONOFFICE_TOKEN` | 13 | CRM-Anbindung onOffice — je Mandant (Phase 6) |
| `PORTAL_URL` | 12 | Adresse, unter der die Anwendung erreichbar ist; steckt in jedem Einladungslink |
| `SMTP_FROM_EMAIL` | 9 | Absenderadresse des Systemversands |
| `SMTP_FROM_NAME` | 5 | Absendername des Systemversands |
| `SMTP_HOST` | 5 | Systemversand ohne Resend |
| `SMTP_PASSWORD` | 5 | wie oben |
| `SMTP_PORT` | 5 | wie oben |
| `SMTP_USERNAME` | 5 | wie oben |
| `EXPOSE_FREIGABE_BASIS` | 4 | Adresse der Exposé-Freigabeseite |
| `REPLICATE_API_TOKEN` | 4 | Spracherkennung (Whisper) und Bildbearbeitung |
| `CREDENTIALS_OBF_SECRET` | 2 | Schluessel der im Portal hinterlegten Fremdzugaenge |
| `APNS_BUNDLE_ID` | 1 | wie oben |
| `APNS_KEY_ID` | 1 | wie oben |
| `APNS_PRIVATE_KEY` | 1 | Push an die iOS-Huelle |
| `APNS_TEAM_ID` | 1 | wie oben |
| `APNS_UMGEBUNG` | 1 | wie oben — "sandbox" oder "production" |
| `BUCHHALTUNG_EMAIL` | 1 | Empfaenger weitergeleiteter Rechnungen |
| `PUSH_HOOK_SECRET` | 1 | schuetzt den Push-Endpunkt gegen fremde Aufrufe |

Dazu 3 Werte, die Supabase selbst in jede Funktion setzt und die niemand eintragen muss: `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.

Eintragen unter *Project Settings → Edge Functions → Secrets* oder mit
`supabase secrets set NAME=wert --project-ref usguiggfciavwzkdfjgt`.
<!-- INVENTAR-ENDE -->
