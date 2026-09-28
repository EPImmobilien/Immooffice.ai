#!/usr/bin/env python3
"""Prueft, dass die Neutralisierung der Edge Functions nur Kennzeichen trifft.

Hintergrund: die Neutralisierung ist eine Reihe von Ersetzungen ueber 2,7 MB
Quelltext. Eine zu breit geratene Regel aendert dabei Dinge, die niemand
angefasst haben wollte — beim Schreiben des Skripts ist genau das passiert
(ein Muster mit eckigen Klammern wurde als Zeichenklasse ausgewertet und hat
quer durch alle Dateien einzelne Buchstaben ersetzt).

Die Pruefung stellt eine einfache Frage: Enthielt jede geaenderte Zeile
vorher ein Kennzeichen, das entfernt werden sollte? Wenn nicht, hat eine
Regel etwas getroffen, das sie nichts angeht.

Laeuft nur, wenn reference/functions vorhanden ist — ohne die Vorlage gibt es
nichts zu vergleichen. Auf einem Rechner ohne Referenzmaterial meldet sie das
und ist zufrieden; sie ist eine Pruefung der Uebersetzung, nicht des Ergebnisses.
"""
import difflib, pathlib, re, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
VORLAGE = WURZEL / 'reference' / 'functions'
FORK = WURZEL / 'supabase' / 'functions'

# Was eine Zeile enthalten haben muss, damit ihre Aenderung erklaert ist.
KENNZEICHEN = re.compile(
    r'engfer|epworld|ep-world|EP World|E&P|E&amp;P|ENGFER|'
    r'V(ö|oe)genteich|Voegenteich|Rostock|Schwerin|Berlin|18055|19055|Puschkin|'
    r'sprengnetter|SPRENGNETTER|jotform|sipgate|yodeck|shop-?tv|'
    r'yazwkzzjiquprtjpurur|STANDORTE\[',
    re.IGNORECASE)


def main():
    if not VORLAGE.is_dir():
        print('reference/functions fehlt — nichts zu vergleichen. Das ist in '
              'Ordnung: die Vorlage ist nicht versioniert.')
        return 0

    beanstandet = []
    geprueft = 0
    for ordner in sorted(FORK.iterdir()):
        if not ordner.is_dir():
            continue
        for neu in sorted(ordner.rglob('*')):
            if neu.is_dir():
                continue
            alt = VORLAGE / ordner.name / neu.relative_to(ordner)
            if not alt.exists():
                beanstandet.append((str(neu), 0, 'hat keine Entsprechung in der Vorlage'))
                continue
            geprueft += 1
            a = alt.read_text(encoding='utf-8').splitlines()
            b = neu.read_text(encoding='utf-8').splitlines()
            # difflib fasst benachbarte Zeilen gelegentlich zu einem Block
            # zusammen und meldet dann auch unveraenderte Zeilen als ersetzt.
            # Deshalb zaehlt nur, was auf der neuen Seite nicht wortgleich
            # wieder auftaucht.
            weg, dazu = [], set()
            for zeile in difflib.unified_diff(a, b, n=0, lineterm=''):
                if zeile.startswith('---') or zeile.startswith('+++'):
                    continue
                if zeile.startswith('-'):
                    weg.append(zeile[1:])
                elif zeile.startswith('+'):
                    dazu.add(zeile[1:])
            for zeile in weg:
                if zeile in dazu:
                    continue
                if not KENNZEICHEN.search(zeile):
                    beanstandet.append(
                        (str(neu.relative_to(WURZEL)), 0, zeile.strip()[:120]))

    if beanstandet:
        print(f'[FEHLER] {len(beanstandet)} Zeile(n) wurden geaendert, ohne ein '
              f'Kennzeichen zu enthalten:\n')
        for datei, _, text in beanstandet[:20]:
            print(f'  {datei}\n    {text}')
        if len(beanstandet) > 20:
            print(f'  … und {len(beanstandet) - 20} weitere')
        return 1

    print(f'[ok] {geprueft} Dateien verglichen — jede Aenderung entfernt ein '
          f'Kennzeichen der Vorlage.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
