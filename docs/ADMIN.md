# Betreiberbereich („Plattform-Admin") — Stand und Entscheidungen

Auftrag vom 07.10.2026: „Betreiber-Dashboard". Dieses Dokument führt je
Schritt, was gebaut ist, was angenommen wurde und was der Betreiber selbst
erledigen muss. Die Kennzahl-Definitionen (Abschnitt 3 des Auftrags) stehen
hier verbindlich, sobald Schritt 3 gebaut ist.

## Vier Abweichungen vom Wortlaut des Auftrags — und warum

| Auftrag sagt | Gebaut | Grund |
|---|---|---|
| `firma_id` | `mandant_id` | Die Mandantentrennung heißt seit fork_07 so, in 194 Tabellen. CLAUDE.md: keine Umbenennung. |
| neue Tabellen `plattform_audit_log`, `support_zugriffe` | `plattform_protokoll` (fork_52) erweitert, `plattform_audit_log` als Sicht darauf; `support_sitzungen` (fork_54) wird erweitert | Der Auftrag verlangt selbst: keine Parallelstrukturen. |
| Route `#/betreiber` | die vorhandene Plattform-Kachel, zur Navigation ausgebaut | Die Anwendung hat keinen Router (Stack-Vorgabe); Ansichten liegen im History-State. Die Kachel erscheint nur für Betreiber — nicht ausgegraut, sondern gar nicht. |
| MFA-Pflicht | ja, als Plattformwert `betreiber_mfa_pflicht` (Start: `true`) | CLAUDE.md sagte „in Version 1 nicht verpflichtend"; der Auftrag ist jünger. Als Wert, damit sich der Betreiber nicht aussperrt und die Pflicht ohne Ausrollen abschaltbar bleibt. |

## Schritt 1 — Zugang, Rollen, MFA, Audit-Log (fork_68) · erledigt 07.10.2026

### Rollen

| Rolle | darf |
|---|---|
| `owner` | alles, auch Betreiber ernennen/deaktivieren, Preise, endgültig löschen |
| `admin` | alles außer Betreiber verwalten und endgültig löschen |
| `support` | Mandanten ansehen (Metadaten), Testphase um bis zu 30 Tage verlängern, Credits bis 500 gutschreiben, Supportzugriff anfragen, Tickets |
| `finanzen` | Umsatz, Rechnungen, Zahlungen, Gutscheine lesen; keine Eingriffe in Mandanten oder Technik |

Wo die Rolle greift — **zweimal**, absichtlich:

1. **Datenbank**: `plattform_rolle()` (security definer) in den Richtlinien
   der Plattformtabellen. `plattform_tarife`, `plattform_credit_preise`,
   `plattform_credit_pakete`, `plattform_werte` schreibt nur `owner`/`admin`.
   `ist_plattform_admin()` kennt jetzt `aktiv`.
2. **Edge Function** `plattform-admin`: eine Karte `ROLLEN` je Aktion, geprüft
   **vor** der Aktion. Was nicht in der Karte steht, dürfen nur `owner` und
   `admin` — ein vergessener Eintrag sperrt also zu viel, nie zu wenig.

Deaktiviert statt gelöscht: das Audit-Log soll weiter zeigen, wer damals
gehandelt hat. Mindestens ein aktiver `owner` bleibt immer — der Trigger
`plattform_admins_letzter_owner` lässt das Gegenteil nicht zu, auch nicht mit
Dienstschlüssel.

### Zweiter Faktor

Supabase schreibt die Stufe der Anmeldung ins Token: `aal1` Passwort, `aal2`
Passwort und bestätigter zweiter Faktor. Die Edge Function liest das Token
und weist alles unter `aal2` mit `{ mfa: true }` ab, wenn
`betreiber_mfa_pflicht` gesetzt ist. Die Oberfläche fängt das ab und führt
durch Einrichtung (QR-Code, Geheimnis) oder Bestätigung (sechs Ziffern).
Nach 30 Minuten ohne Eingabe (`betreiber_sitzung_minuten`) sperrt sich die
Tafel und fragt erneut.

**Voraussetzung, die der Betreiber prüfen muss:** in der Supabase-Konsole
unter *Authentication → Multi-Factor* muss TOTP eingeschaltet sein. Das
lässt sich aus dem Repository nicht setzen.

### Audit-Log

`plattform_protokoll` trägt jetzt `rolle, ziel_typ, ziel_id, vorher, nachher,
begruendung, ip, user_agent`. `plattform_audit_log` ist eine Sicht darauf
mit den Spaltennamen aus dem Auftrag. Nur INSERT: der Trigger
`plattform_protokoll_schutz` (fork_52) verweigert UPDATE und DELETE — auch
dem Owner, auch dem Dienstschlüssel. `tests/betreiber-rollen.sql` führt es vor.

### Der erste Owner

Der Auftrag sieht einen Seed aus `.env.local` (`PLATFORM_OWNER_EMAIL`) vor.
Eine Migration kann keine Umgebungsvariable lesen; der Seed ist deshalb ein
Statement, das der Betreiber einmal ausführt:

```sql
insert into public.plattform_admins (benutzer_id, rolle, aktiv, notiz)
select u.id, 'owner', true, 'Erster Owner (Seed)'
  from auth.users u where lower(u.email) = lower('<PLATFORM_OWNER_EMAIL>')
on conflict (benutzer_id) do update set rolle = 'owner', aktiv = true;
```

Auf dem Projekt `usguiggfciavwzkdfjgt` ist das bereits geschehen:
`info@immooffice.ai` ist Owner (07.10.2026). Das Konto
`info@engferundpartner.de` hat dieselbe Rolle, bis es stillgelegt wird
(siehe `docs/OFFEN.md`).

### Abnahme Schritt 1

- [x] Normaler Nutzer / `chef` kommt nicht hinein — Function 403, Richtlinien
      liefern 0 Zeilen, Sicht `plattform_audit_log` leer (`tests/betreiber-rollen.sql`)
- [x] Betreiber ohne zweiten Faktor wird abgewiesen (Function, `aal2`)
- [x] `support` kann keine Preise ändern (Richtlinie + Function)
- [x] Audit-Log weder änderbar noch löschbar (Trigger, Test)
- [x] Mindestens ein aktiver Owner (Trigger, Test)
- [ ] TOTP in der Supabase-Konsole eingeschaltet — **Betreiber**

## Noch offen aus dem Auftrag (Schritte 2–10)

Werden hier je Schritt nachgetragen. Reihenfolge wie im Auftrag.

## Was der Betreiber selbst erledigen muss

1. TOTP unter *Authentication → Multi-Factor* einschalten, dann sich selbst
   einmal mit der Authenticator-App einrichten (die Tafel führt hin).
2. Ersten Owner festlegen (ist auf dem Projekt geschehen; Statement oben für
   weitere Installationen).
3. Betreiber-E-Mail für Warnungen — kommt mit Schritt 10.
4. Rechtstexte einpflegen — kommt mit Schritt 9.
