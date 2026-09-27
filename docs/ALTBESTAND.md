# Altbestand — Bestandsaufnahme vor dem Verschieben

Aufgenommen am **27.09.2026**, unmittelbar vor
`20260914210000_altbestand_verschieben.sql`. Dieses Dokument ist die Sicherung,
die Sie mit „erst sichern und dann verschieben" verlangt haben: es hält fest,
**was** vorher da war, damit sich nachher nachweisen lässt, dass alles
angekommen ist.

Gelöscht wird nichts. Die Migration führt ausschließlich
`alter table … set schema altbestand` aus.

## 1. Was im Schema `public` steht

| Art | Anzahl | Fingerabdruck der Namensliste |
|---|---|---|
| Tabellen | 110 | `9e5221ad5dde` |
| Sequenzen | 1 | `64d9a2025817` |
| Funktionen | 93 | `9013dcf28a66` |
| Aufzählungs- und Domänentypen | 34 | `1e961d4ac296` |
| Sichten | 0 | — |
| Trigger | 138 | |
| Richtlinien | 208 | |
| Constraints | 755 | |
| Indexe | 291 | |
| Spalten | 1532 | |

Der Fingerabdruck ist `left(md5(string_agg(name, E'\n' order by name)), 12)`.

Dazu das Schema **`intern`** mit **74 Funktionen** (Fingerabdruck
`2b8247602ed7`), ohne Tabellen. Es bleibt stehen — Begründung im Kopf der
Migration —, verliert aber die Rechte für `anon` und `authenticated`.

## 2. Wie viele Daten wirklich drinstehen

**120 Zeilen, verteilt auf 22 von 110 Tabellen.** Fingerabdruck der
Zeilenzahlen: `8552b8acff52`.

| Tabelle | Zeilen |
|---|---|
| `registrierungs_sperrliste` | 48 |
| `credit_preise` | 20 |
| `objekt_bilder` | 7 |
| `aktivitaeten`, `preise` | je 5 |
| `kontakte`, `objekte`, `plattform_einstellungen` | je 4 |
| `aufgaben`, `tarife` | je 3 |
| `benutzer`, `mandant_branding`, `mandanten`, `termine`, `wertermittlungen` | je 2 |
| `abonnements`, `credit_buchungen`, `credit_konto`, `plattform_admins`, `vertraege`, `web_expose`, `web_expose_aufruf` | je 1 |
| 88 weitere Tabellen | 0 |

**Das ist der wichtigste Befund dieser Aufnahme.** Der Altbestand ist
Testbestand, kein Produktivdatenbestand: 120 Zeilen, davon 48 eine
Sperrliste und 20 Preistabelle. Es gibt keinen Kundendatenbestand, der beim
Verschieben Schaden nehmen könnte. Das Verschieben ist damit ein technischer
Vorgang ohne Datenrisiko — was es nicht weniger endgültig macht: die auf
Netlify veröffentlichte Next.js-Anwendung hört in dem Moment auf zu arbeiten.

## 3. Die Migrationsgeschichte ist unvollständig — und bleibt es

Im Projekt sind **45 Migrationen** als angewendet vermerkt. **24 davon haben
keine Datei im Repository**, und sie sind auch **nicht in der Git-Geschichte**
(geprüft mit `git log --all --diff-filter=A`). Aus der Datenbank
wiederherstellbar ist nur ein Teil:

| Zustand | Anzahl | |
|---|---|---|
| Datei im Repository vorhanden | 21 | in Ordnung |
| nur in der Datenbank, mit vollem SQL-Text | 5 | wiederherstellbar |
| nur in der Datenbank, Eintrag ist ein Verweis auf eine Datei, die es nicht gibt | 8 | **Text verloren** |
| nur in der Datenbank, ohne jede Anweisung gespeichert | 11 | **Text verloren** |

Die fünf wiederherstellbaren sind `20260717125218_kern_mandant_profile_rls`,
`20260717125227_storage_branding_bucket`,
`20260817144057_einladungen_und_benutzerverwaltung`,
`20260817144255_eigenes_konto_lesbar`,
`20260817183433_keine_selbstermaechtigung_korrigiert`.

**Warum diese Texte hier nicht abgelegt sind.** Sie stehen in
`supabase_migrations.schema_migrations` im Projekt selbst, und diese Tabelle
liegt im Schema `supabase_migrations` — das Verschieben fasst sie nicht an. Die
Texte sind durch das Verschieben also nicht bedroht. Wenn Sie sie trotzdem als
Dateien im Repository haben wollen, ist der verlässliche Weg **nicht** über
mich: im SQL-Editor des Projekts

```sql
select version || '_' || name || '.sql' as datei,
       array_to_string(statements, E';\n\n')  as inhalt
from supabase_migrations.schema_migrations
where version in ('20260717125218','20260717125227','20260817144057',
                  '20260817144255','20260817183433')
order by version;
```

und das Ergebnis als CSV herunterladen. Ich habe versucht, die 17 kB über die
Verwaltungsschnittstelle abzuschreiben, und mir dabei ein Zeichen verloren —
für diese Textmenge ist der Weg über meinen Kontext nicht zuverlässig, und ein
Archiv, das ein Zeichen falsch hat, ist kein Archiv.

**Für die 19 verlorenen Texte gibt es keinen Weg zurück.** Was sie erzeugt
haben, steht aber vollständig in der Datenbank und wird durch das Verschieben
erhalten. Wer das alte Datenmodell je wieder braucht, liest es aus `altbestand`
aus, nicht aus Migrationsdateien.

## 4. Nachweis nach dem Verschieben

Diese Abfrage muss dieselben Zahlen und Fingerabdrücke liefern wie Abschnitt 1
und 2 — nur eben für `altbestand` statt `public`:

```sql
with tab as (
  select c.relkind::text as art, c.relname as name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'altbestand' and c.relkind in ('r','v','m','S')
), fkt as (
  select 'F', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'altbestand'
), typ as (
  select 'T', t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'altbestand' and t.typtype in ('e','d')
), alles as (select * from tab union all select * from fkt union all select * from typ)
select art, count(*), left(md5(string_agg(name, E'\n' order by name)), 12)
from alles group by art order by 1;
```

und für die Zeilen:

```sql
with t as (
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'altbestand' and c.relkind = 'r'
), z as (
  select relname,
         (xpath('/row/c/text()', query_to_xml(
            format('select count(*) as c from altbestand.%I', relname),
            false, true, '')))[1]::text::bigint as zeilen
  from t
)
select sum(zeilen), count(*) filter (where zeilen > 0), count(*),
       left(md5(string_agg(relname || '=' || zeilen, E'\n' order by relname)), 12)
from z;
```

Erwartet: `120`, `22`, `110`, `8552b8acff52`.
