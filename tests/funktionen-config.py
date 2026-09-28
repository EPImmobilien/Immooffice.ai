#!/usr/bin/env python3
"""Prueft, dass supabase/config.toml zu supabase/functions/ passt.

Die Datei entscheidet fuer jede Edge Function, ob die Plattform vor dem
Aufruf ein JWT verlangt. Fehlt ein Eintrag, setzt die Supabase-CLI stillschweigend
verify_jwt = true — die Funktion ist dann aus dem Netz nicht mehr erreichbar,
und niemand merkt es beim Ausrollen, sondern erst, wenn ein Kunde auf einen
Abmeldelink klickt.

Der umgekehrte Fall ist schlimmer: ein Eintrag fuer eine Funktion, die es
nicht mehr gibt, faellt gar nicht auf und traegt eine Entscheidung weiter,
die niemand mehr prueft.
"""
import pathlib, sys, tomllib

WURZEL = pathlib.Path(__file__).resolve().parent.parent
CONFIG = WURZEL / 'supabase' / 'config.toml'
FUNKTIONEN = WURZEL / 'supabase' / 'functions'


def main():
    if not CONFIG.exists():
        print(f'[FEHLER] {CONFIG.relative_to(WURZEL)} fehlt.')
        return 1
    with CONFIG.open('rb') as f:
        konfig = tomllib.load(f)
    eingetragen = konfig.get('functions', {})
    vorhanden = {d.name for d in FUNKTIONEN.iterdir() if d.is_dir()}

    fehlt = sorted(vorhanden - set(eingetragen))
    ueberzaehlig = sorted(set(eingetragen) - vorhanden)
    ohne_wert = sorted(n for n, v in eingetragen.items() if 'verify_jwt' not in v)
    ohne_einstieg = sorted(n for n in vorhanden if not (FUNKTIONEN / n / 'index.ts').exists())

    fehler = 0
    for titel, liste in (('ohne Eintrag in config.toml', fehlt),
                         ('eingetragen, aber nicht vorhanden', ueberzaehlig),
                         ('Eintrag ohne verify_jwt', ohne_wert),
                         ('ohne index.ts', ohne_einstieg)):
        if liste:
            fehler = 1
            print(f'[FEHLER] {len(liste)} Funktion(en) {titel}:')
            for n in liste[:15]:
                print(f'    {n}')
            if len(liste) > 15:
                print(f'    … und {len(liste) - 15} weitere')
    if fehler:
        return 1
    offen = sum(1 for v in eingetragen.values() if not v['verify_jwt'])
    print(f'[ok] {len(vorhanden)} Funktionen, fuer jede ist verify_jwt festgelegt '
          f'({offen} ohne JWT-Pruefung, {len(vorhanden) - offen} mit).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
