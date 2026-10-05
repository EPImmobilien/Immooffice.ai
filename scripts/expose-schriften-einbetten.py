#!/usr/bin/env python3
"""Legt die Exposé-Schriften IN die Edge Function.

Warum überhaupt: `expose-pdf-erzeugen` hat die Schriften bisher geholt —
erst aus dem Eimer `branding-assets`, und wenn sie dort fehlten, einmal von
der ausgelieferten Oberfläche. Welche Adresse das ist, sagte `PORTAL_URL`
beziehungsweise `EXPOSE_FREIGABE_BASIS`.

Am 05.10.2026 ist genau das schiefgegangen: der Eimer war leer, und keiner
der beiden Werte stand im Projekt. Die Funktion brach beim ersten Schnitt ab
(„Die Schrift Jak-Light fehlt …"), und sie hätte es bei jedem der zwanzig
getan. Drei Dinge mussten zusammenpassen — eine Umgebungsvariable, eine
Auslieferung und ein Eimerinhalt —, damit ein Exposé entsteht. Das ist eine
Verkettung zu viel für etwas, das sich mitliefern lässt.

Die Schnitte sind klein, weil sie schon auf den Zeichensatz der Vorlagen
verkleinert sind: 928 KiB zusammen, gepackt 395, als base64 im Quelltext
527. Das ist weniger als das Renderer-Bündel daneben.

Erzeugnis, nicht Handarbeit — wie `buendel/immo-expose.mjs`:

    python3 scripts/expose-schriften-einbetten.py            erzeugen
    python3 scripts/expose-schriften-einbetten.py --pruefen  nur vergleichen

Die Quelle ist `assets/fonts/expose/`, die ihrerseits von
`scripts/expose-schriften.py` erzeugt wird. Wer dort etwas ändert, lässt
beide Skripte laufen; `npm run check` sagt es sonst.
"""
import base64
import gzip
import pathlib
import sys
import textwrap

WURZEL = pathlib.Path(__file__).resolve().parent.parent
QUELLE = WURZEL / 'assets' / 'fonts' / 'expose'
ZIEL = WURZEL / 'supabase' / 'functions' / 'expose-pdf-erzeugen' / 'schriften.mjs'

KOPF = '''// Erzeugt von scripts/expose-schriften-einbetten.py — nicht von Hand aendern.
//
// Die Exposé-Schriften, gepackt und base64-kodiert. Die Edge Function
// entpackt nur, was die Vorlage nennt — vier bis zehn Schnitte je Expose.
//
// Sie liegen HIER und nicht im Eimer oder auf der Oberflaeche, weil ein
// Expose sonst von drei Dingen abhaengt, die zusammenpassen muessen: einer
// Umgebungsvariablen, einer Auslieferung und einem Eimerinhalt. Am
// 05.10.2026 hat genau diese Kette gerissen.
//
// Quelle: assets/fonts/expose/, erzeugt von scripts/expose-schriften.py.
// Lizenz: SIL Open Font License 1.1, Texte in assets/fonts/expose/OFL-*.txt
// und in der Auslieferung unter /schriften/expose/.
'''


def erzeugen() -> str:
    if not QUELLE.is_dir():
        sys.exit(f'Fehlt: {QUELLE} — erst python3 scripts/expose-schriften.py')
    teile = [KOPF, '\nexport const SCHRIFTEN = {\n']
    roh = gepackt = 0
    for pfad in sorted(QUELLE.glob('*.ttf')):
        name = pfad.stem
        bytes_ = pfad.read_bytes()
        # mtime=0: ohne das steckt die Uhr im Ergebnis, und dann weicht jede
        # Erzeugung von der vorigen ab — der Vergleich in --pruefen waere
        # wertlos.
        gz = gzip.compress(bytes_, 9, mtime=0)
        roh += len(bytes_)
        gepackt += len(gz)
        kodiert = base64.b64encode(gz).decode()
        teile.append(f'  // {name}: {len(bytes_):,} B, gepackt {len(gz):,} B\n')
        teile.append(f'  "{name}":\n')
        for zeile in textwrap.wrap(kodiert, 100):
            teile.append(f'    "{zeile}" +\n')
        # Die letzte Zeile schliesst den Eintrag ab: ' +' weg, ',' dran.
        teile[-1] = teile[-1][:-3] + ',\n'
    teile.append('};\n')
    teile.append(f'\n// {len(list(QUELLE.glob("*.ttf")))} Schnitte, '
                 f'{roh:,} B roh, {gepackt:,} B gepackt.\n')
    return ''.join(teile)


def main() -> int:
    neu = erzeugen()
    pruefen = '--pruefen' in sys.argv
    alt = ZIEL.read_text(encoding='utf-8') if ZIEL.exists() else None
    if pruefen:
        if alt == neu:
            print(f'  [ok] {ZIEL.relative_to(WURZEL)} entspricht '
                  f'assets/fonts/expose/.')
            return 0
        print(f'  [FEHLER] {ZIEL.relative_to(WURZEL)} weicht von '
              f'assets/fonts/expose/ ab.')
        print('  `python3 scripts/expose-schriften-einbetten.py` ausfuehren.')
        return 1
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    ZIEL.write_text(neu, encoding='utf-8')
    print(f'{ZIEL.relative_to(WURZEL)}: {len(neu) / 1024:.0f} KiB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
