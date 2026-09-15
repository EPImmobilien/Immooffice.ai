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

## Quelltext der Edge Functions

130 Funktionen, mehrere Megabyte. Nicht über die Verwaltungsschnittstelle
holbar — jeder Abruf läuft durch den Arbeitsspeicher des Modells. Der Befehl
zum Export steht in `docs/STATUS.md` 2.2.

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

7. **`suchkriterien_lauf` ohne RLS.** Siehe `docs/STATUS.md`, Abschnitt 6. Die
   Zeile steht in der Migration auskommentiert, weil Einschalten ohne passende
   Richtlinie jeden Zugriff sperrt.

### Nicht prüfbar in dieser Umgebung

8. **Edge Functions.** 130 Stück, Quelltext nicht über diese Schnittstelle
   erreichbar. Siehe `docs/STATUS.md`, Abschnitt 2.2.

9. **Verhalten.** Der Export ist vollständig — 15 Kennzahlen stimmen mit dem
   Quellprojekt überein. Das beweist, dass nichts verloren ging, nicht dass
   sich alles gleich verhält. Ein Verhaltensvergleich braucht die Oberfläche
   und die Edge Functions.
