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
## Woher die Werte kommen — gefragt am 28.09.2026

Die Liste unten sagt, **was** gebraucht wird. Hier steht, **woher**. Die
wenigsten davon sind „Passwörter, die irgendwo liegen" — die meisten muss der
Betreiber erst anlegen.

**Grundsatz: kein Wert des Referenzunternehmens.** Auch wenn ein Schlüssel der
Vorlage bekannt wäre — er gehört einer anderen Firma, und `CLAUDE.md` schließt
das aus. Jeder Zugang hier ist ein **neuer**, auf immoOffice.ai ausgestellter.

### Die vier, ohne die nichts geht

| Wert | Woher | Aufwand |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → *API Keys* → *Create Key*. Beginnt mit `sk-ant-`. Kostet nach Verbrauch; für den Anfang reicht ein kleines Guthaben. | 5 Minuten |
| `PORTAL_URL` | **Kein Passwort.** Die eigene Adresse der Anwendung, ohne Schrägstrich am Ende. Heute: `https://app.immooffice.ai` (Rückfall `https://immoofficeeai.netlify.app`), nach Schritt 7 der Inbetriebnahme die eigene Domain (siehe `docs/DOMAIN_VERBINDEN.md`). Solange sie fehlt, zeigt jeder Einladungs- und Freigabelink auf `https://immooffice.example` — eine reservierte Platzhalter-Domain, die nirgendwo hinführt. | 1 Minute |
| `RESEND_API_KEY` | resend.com → Konto anlegen → *API Keys* → *Create API Key*. Beginnt mit `re_`. **Vorher** unter *Domains* die eigene Absenderdomäne eintragen und die drei DNS-Einträge setzen, die Resend anzeigt (SPF, DKIM, DMARC). Ohne verifizierte Domäne nimmt Resend nur Post an die eigene Kontoadresse an. | 20 Minuten plus DNS-Wartezeit |
| `EXPOSE_FREIGABE_BASIS` | Wieder kein Passwort: die Adresse der Freigabeseite, in aller Regel `{PORTAL_URL}/freigabe.html`. | 1 Minute |

### Die beiden Verschlüsselungs-Schlüssel

`MAIL_SECRET_KEY` und `CREDENTIALS_OBF_SECRET` sind **selbst zu erzeugen** —
sie kommen von niemandem. Mit ihnen werden die SMTP-Passwörter der Postfächer
und die hinterlegten Fremdzugänge verschlüsselt:

```
openssl rand -base64 32
```

**Einmal setzen und nie wieder ändern.** Wer sie tauscht, kann die damit
verschlüsselten Zugangsdaten nicht mehr lesen; sie müssen dann neu eingegeben
werden.

### Was warten kann

- `SMTP_*` — nur nötig, wenn der Systemversand **ohne** Resend laufen soll.
  Mit Resend bleiben sie leer.
- `REPLICATE_API_TOKEN` — replicate.com, für Spracherkennung und
  KI-Bildbearbeitung. Ohne ihn fehlen diese beiden Funktionen, der Rest läuft.
- `APNS_*` — nur für Push an eine iOS-Hülle. Kommt aus dem Apple Developer
  Account und ist ohne App gegenstandslos.
- `PUSH_HOOK_SECRET` — selbst erzeugt wie oben, schützt den Push-Endpunkt.
- `AUTH_HOOK_SECRET` — erzeugt Supabase beim Einrichten des Send-Email-Hooks
  (Authentication → Hooks). Ohne ihn bleiben die Anmelde-Mails englisch
  (`docs/AUTH_MAILS.md`).
- `BUCHHALTUNG_EMAIL` — eine Adresse, keine Anmeldung.

### Eintragen

**https://supabase.com/dashboard/project/usguiggfciavwzkdfjgt/functions/secrets**

Ohne Anführungszeichen, ohne Leerzeichen am Ende. Die Funktionen lesen den
neuen Wert beim nächsten Aufruf — ein erneutes Ausrollen ist nicht nötig.

## Inventar aus dem Quelltext — Stand 28.09.2026

Erzeugt von `scripts/geheimnisse-inventar.py` aus jedem
`Deno.env.get("…")` in `supabase/functions/`. Nicht von Hand pflegen.

Die Liste sagt, was **gebraucht** wird, nicht was gesetzt ist. Fehlt ein
Wert, antwortet die betroffene Funktion mit einem Fehler — sie faellt
nicht stumm aus, aber sie arbeitet auch nicht.

| Geheimnis | Funktionen | Wofür |
|---|---:|---|
| `ANTHROPIC_API_KEY` | 41 | KI-Texte, Auslese von Unterlagen, Bewertung |
| `RESEND_API_KEY` | 28 | Mailversand ueber Resend |
| `MAIL_SECRET_KEY` | 21 | Schluessel, mit dem die SMTP-Passwoerter der Postfaecher verschluesselt sind |
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
| `AUTH_HOOK_SECRET` | 1 | Signatur des Send-Email-Hooks (auth-mail) |
| `PUSH_HOOK_SECRET` | 1 | schuetzt den Push-Endpunkt gegen fremde Aufrufe |

Dazu 3 Werte, die Supabase selbst in jede Funktion setzt und die niemand eintragen muss: `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.

Eintragen unter *Project Settings → Edge Functions → Secrets* oder mit
`supabase secrets set NAME=wert --project-ref usguiggfciavwzkdfjgt`.
<!-- INVENTAR-ENDE -->

## ANTHROPIC_API_KEY — der Schlüssel muss zu einem Workspace gehören

Am 28.09.2026 war der Schlüssel gesetzt, und trotzdem kam aus jeder
KI-Funktion eine 400 zurück:

```
This API key is not scoped to a workspace, so this request must include
the anthropic-workspace-id header with the ID of the workspace to use.
```

Das ist kein Fehler im Code. Die Anthropic-Konsole kennt zwei Arten von
Schlüsseln: einen auf Ebene der Organisation und einen, der zu einem
**Workspace** gehört. Nur der zweite funktioniert ohne zusätzlichen Header.

**Richtig anlegen:** Console → *Settings → API Keys* → beim Anlegen einen
Workspace auswählen (der vorhandene „Default" genügt) → der neue Schlüssel
beginnt mit `sk-ant-` und ersetzt den alten unter *Supabase → Edge Functions
→ Secrets*.

Der Weg über den Header `anthropic-workspace-id` wäre der andere — er müsste
in 41 Funktionen eingetragen werden und bringt nichts, was der richtige
Schlüssel nicht auch könnte.

**Nachgewiesen wird das so:** `generate-text` mit einem echten Anmelde-Token
rufen. Kommt `502 Anthropic-API: 400 …not scoped to a workspace`, ist es
dieser Fall. Kommt ein Text zurück, greift der Schlüssel.
