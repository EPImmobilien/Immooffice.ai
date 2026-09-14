# Secrets — Namen, nicht Werte

**Werte stehen niemals hier, niemals im Code, niemals im Repository.**
Sie kommen aus `.env.local` beziehungsweise aus den Function-Secrets des
Supabase-Projekts.

## Inventar der Referenz — offen

`supabase secrets list --project-ref yazwkzzjiquprtjpurur` konnte nicht laufen:
kein CLI, kein Netzzugang (siehe `docs/STATUS.md` 2.1). Das Inventar der
tatsächlich gesetzten Secret-Namen fehlt deshalb noch und wird nachgezogen,
sobald der Quelltext der Edge Functions vorliegt — dort ist an jedem
`Deno.env.get("…")` ablesbar, was gebraucht wird.

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
