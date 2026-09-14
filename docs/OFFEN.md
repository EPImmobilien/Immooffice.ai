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
