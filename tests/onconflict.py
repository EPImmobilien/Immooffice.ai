#!/usr/bin/env python3
"""Zeigt jeder upsert-Konfliktschluessel der Oberflaeche auf eine wirklich
vorhandene Eindeutigkeitsregel?

WARUM ES DIESE PRUEFUNG GIBT: fork_17, fork_23 und fork_28 haben
Eindeutigkeitsregeln von "je Plattform" auf "je Mandant" umgestellt. Damit
aendert sich der Schluessel, auf den ein upsert sich beruft. Steht in der
Oberflaeche noch der alte, antwortet PostgREST mit

    there is no unique or exclusion constraint matching the ON CONFLICT
    specification

und der Knopf tut nichts. Am 29.09.2026 war genau das bei
portal_einstellungen der Fall — an EINER von zwei Stellen. Die andere war
laengst umgestellt, und deshalb ist es niemandem aufgefallen.

Ein Schreibfehler im Spaltennamen faellt hier ebenso auf.
"""
import re
import subprocess
import sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent

# Wie weit vor dem onConflict nach dem .from("…") gesucht wird. Die Vorlage
# baut ihre Objektliterale lang; 1500 Zeichen decken auch den laengsten ab.
FENSTER = 1500


def paare():
    """(Tabelle, Konfliktschluessel) aus allen Stuecken der Oberflaeche."""
    gefunden = set()
    for datei in sorted((WURZEL / 'src').rglob('*.js')):
        text = datei.read_text(encoding='utf-8')
        for treffer in re.finditer(r'onConflict:\s*"([^"]+)"', text):
            vor = text[max(0, treffer.start() - FENSTER):treffer.start()]
            tabellen = re.findall(r'\.from\(\s*"([a-z0-9_]+)"\s*\)', vor)
            if not tabellen:
                gefunden.add(('?', treffer.group(1), datei.name))
                continue
            gefunden.add((tabellen[-1], treffer.group(1), datei.name))
    return sorted(gefunden)


def main():
    gesucht = paare()
    if not gesucht:
        print('Kein upsert mit onConflict gefunden — nichts zu pruefen.')
        return 0

    werte = ', '.join("(%s, %s)" % (_sql(t), _sql(s)) for t, s, _ in gesucht)
    frage = f"""
with paare(tab, sp) as (values {werte})
select p.tab || '|' || p.sp || '|' || coalesce((
  select 'ja' from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = p.tab
     and (i.indisunique or i.indisprimary)
     and (select string_agg(a.attname, ',' order by x.ord)
            from unnest(i.indkey) with ordinality x(attnum, ord)
            join pg_attribute a on a.attrelid = c.oid and a.attnum = x.attnum)
         = p.sp
   limit 1), 'NEIN')
from paare p order by 1;
"""
    lauf = subprocess.run(
        [str(WURZEL / 'scripts' / 'lokale-db.sh'), 'psql', '-qtA', '-c', frage],
        capture_output=True, text=True)
    if lauf.returncode != 0:
        print('Die lokale Datenbank antwortet nicht:')
        print((lauf.stderr or lauf.stdout).strip()[:400])
        return 1

    herkunft = {(t, s): d for t, s, d in gesucht}
    offen = []
    n = 0
    for zeile in lauf.stdout.splitlines():
        if not zeile.strip():
            continue
        tab, sp, urteil = zeile.split('|')
        n += 1
        if urteil != 'ja':
            offen.append(f'{tab}.upsert(onConflict: "{sp}") '
                         f'— in {herkunft.get((tab, sp), "?")}')

    if offen:
        print(f'[FEHLER] {len(offen)} von {n} Konfliktschluessel(n) zeigen auf '
              'keine vorhandene Eindeutigkeitsregel:')
        for z in offen:
            print(f'  {z}')
        print('\n  PostgREST antwortet darauf mit "there is no unique or '
              'exclusion constraint\n  matching the ON CONFLICT '
              'specification" — der Knopf tut nichts.')
        return 1

    print(f'[ok] {n} Konfliktschluessel, jeder auf einer vorhandenen '
          'Eindeutigkeitsregel.')
    return 0


def _sql(wert):
    return "'" + wert.replace("'", "''") + "'"


if __name__ == '__main__':
    sys.exit(main())
