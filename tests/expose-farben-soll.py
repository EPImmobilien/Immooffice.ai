#!/usr/bin/env python3
"""Die Soll-Farben der drei Exposé-Vorlagen, aus den Prototypen gerechnet.

Gehoert zu tests/expose-farben.js und wird von dort aufgerufen.

Die theme()-Funktionen werden nicht nachgebaut, sondern AUSGEFUEHRT: ihr
Quelltext wird aus reference/expose-vorlagen/ geschnitten und mit winzigen
Ersatzteilen fuer ReportLab ausgewertet. Damit kann die Pruefung nicht
auseinanderlaufen, ohne dass sich die Quelle aendert — anders als bei
abgeschriebenen Zahlen.

Aufruf: expose-farben-soll.py <verzeichnis> <paare-als-json>
"""
import json
import sys


class Farbe:
    """Ersatzteil fuer reportlab.lib.colors.Color.

    Die Prototypen greifen auf zwei Arten zu: Signature und Raster rechnen
    ueber die eigene mix()-Funktion, Studio liest s.red/.green/.blue direkt.
    Beides muss gehen, deshalb Attribute UND Indexzugriff.
    """

    __slots__ = ('red', 'green', 'blue')

    def __init__(self, r, g, b, a=1):
        self.red, self.green, self.blue = r, g, b

    def __getitem__(self, i):
        return (self.red, self.green, self.blue)[i]

    def __iter__(self):
        return iter((self.red, self.green, self.blue))


def hx(h):
    h = h.lstrip('#')
    return Farbe(int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)


def mix(a, b, t):
    return Farbe(*(a[i] + (b[i] - a[i]) * t for i in range(3)))


def alpha(c, a):
    return c


def Color(r, g, b, a=1):
    return Farbe(r, g, b)


def HexColor(h):
    return hx(h)


WH = WHITE = hx('#FFFFFF')
BK = hx('#000000')

# Welche Schluessel die Portierung tragen muss. Die Prototypen fuehren
# daneben noch *_hex und name — das sind keine Farben.
PRUEFEN = {
    'raster': ['p', 'a', 'ink', 'text', 'muted', 'line', 'surf', 'surf2', 'pdark', 'asoft'],
    'signature': ['d', 'a', 'paper', 'paper2', 'ink', 'text', 'muted', 'hair', 'onD', 'onDm', 'dline'],
    'studio': ['s', 'd', 'on_s', 'paper', 'tint', 'tint2', 'text', 'muted', 'rule', 'hair'],
    'buehne': ['d', 'a', 'paper', 'card', 'ink', 'text', 'muted', 'line', 'soft', 'softD', 'ph',
               'onD', 'onDm', 'dline', 'onA', 'aT'],
}

DATEI = {
    'raster': 'immoOffice_expose_generator.py',
    'signature': 'immoOffice_luxus_generator.py',
    'studio': 'immoOffice_studio_generator.py',
    'buehne': 'immoOffice_buehne_generator.py',
}


def theme_aus(ordner, datei):
    """Den Quelltext von def theme(...) bis vor die Beispieldaten schneiden."""
    text = open(f'{ordner}/{datei}', encoding='utf-8').read()
    i = text.index('def theme(')
    j = text.index('\nD = dict(', i)
    def lum(c):
        f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        return 0.2126 * f(c.red) + 0.7152 * f(c.green) + 0.0722 * f(c.blue)
    raum = {'hx': hx, 'mix': mix, 'alpha': alpha, 'WH': WH, 'WHITE': WHITE,
            'BK': BK, 'Color': Color, 'HexColor': HexColor, 'dict': dict, 'lum': lum}
    exec(compile(text[i:j], datei, 'exec'), raum)
    return raum['theme']


def main():
    ordner, paare = sys.argv[1], json.loads(sys.argv[2])
    raus = {}
    import os
    for art, datei in DATEI.items():
        if not os.path.exists(f'{ordner}/{datei}') or art not in paare:
            continue
        fn = theme_aus(ordner, datei)
        raus[art] = {}
        for f1, f2 in paare[art]:
            th = fn(f1, f2)
            raus[art][f'{f1}/{f2}'] = {k: list(th[k]) for k in PRUEFEN[art]}
    print(json.dumps(raus))
    return 0


if __name__ == '__main__':
    sys.exit(main())
