#!/usr/bin/env python3
"""Die Farbwerte der Referenz gegen die Plattform-CI.

`docs/NEUTRALITAET.md` nennt die Farbwerte ausdruecklich unter dem, was
neutralisiert wird, und CLAUDE.md legt die Plattform-CI fest. Am 28.09.2026
wurde der Farb-Block der Anwendung getauscht — und sonst nichts. Die
Vorgabewerte standen weiter im Haus: 269 Stellen in Hexschreibweise und noch
einmal 123 in Dezimalschreibweise, verteilt auf Farbwaehler,
Grundriss-Zeichner, PDF-Erzeuger, Mailvorlagen und Nebenseiten.

Eine Regel je Stelle waere ein Regelsatz, den niemand pflegt. Deshalb ein
Nachlauf: er greift NACH allen anderen Regeln und tauscht die Zahl, egal in
welcher der fuenf Schreibweisen sie steht.

    #D4A567            Hexfarbe, Gross- und Kleinschreibung egal
    "D4A567"           ohne Doppelkreuz, in Anfuehrungszeichen — so steht
                       sie im OOXML der Word- und PowerPoint-Ausgabe
    rgb(212,165,103)   Dezimal, mit und ohne Leerzeichen
    rgba(212,165,103,.22)   dito, die Deckkraft bleibt stehen
    rgb(0.831,0.647,0.404)  Fliesskomma — so will es pdf-lib

Was er NICHT tut: Farben erfinden oder Layout aendern. Es sind acht Zahlen.

Die Fliesskomma-Schreibweise ist der Grund, warum das Neutralitaets-Gate
diese Stellen jahrelang nicht gesehen hat: in `rgb(0.831, 0.647, 0.404)`
steht nirgends `D4A567`.
"""
import re

# (alt, neu, Bezeichnung). Die Dezimal- und Fliesskommaform wird ausgerechnet,
# nicht abgeschrieben — abgeschriebene Zahlen laufen auseinander.
PALETTE = [
    ('#263159', '#1B2A47', 'Marineblau'),
    ('#1a2342', '#12203B', 'Marineblau dunkel'),
    ('#D4A567', '#B5934F', 'Gold'),
    ('#e0bd80', '#C9AE72', 'Gold hell'),
    ('#e6c894', '#C9AE72', 'Gold hell (zweite Schreibweise der Vorlage)'),
    ('#FAFAF7', '#FAFAFA', 'Hintergrund'),
    ('#E8E4DA', '#E6E8EB', 'Linien'),
    ('#8B8377', '#7A828C', 'gedaempfter Text'),
]


def _kanal(hexwert):
    h = hexwert.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _regeln():
    """Baut je Farbe die fuenf Suchmuster. Einmal, beim Import."""
    raus = []
    for alt, neu, name in PALETTE:
        a, n = _kanal(alt), _kanal(neu)
        roh_alt, roh_neu = alt.lstrip('#'), neu.lstrip('#')

        # 1) #rrggbb — die naechste Hexziffer darf nicht dazugehoeren, sonst
        #    schneidet die Regel aus #2631590 ein #1B2A470.
        raus.append((re.compile('#' + roh_alt + r'(?![0-9A-Fa-f])', re.I),
                     neu, f'{name}: Hexfarbe'))

        # 2) "rrggbb" ohne Doppelkreuz, nur in Anfuehrungszeichen. Ohne diese
        #    Klammer traefe die Regel jede sechsstellige Zahl, die zufaellig
        #    so aussieht.
        raus.append((re.compile(r'(?P<q>[\'"])' + roh_alt + r'(?P=q)', re.I),
                     lambda m, neu=roh_neu: m.group('q') + neu + m.group('q'),
                     f'{name}: Hexfarbe ohne Doppelkreuz (OOXML)'))

        # 3)+4) rgb(r,g,b) und rgba(r,g,b,x) — Leerraum beliebig, die
        #       Deckkraft bleibt unberuehrt.
        raus.append((re.compile(r'\brgb(?P<a>a?)\(\s*%d\s*,\s*%d\s*,\s*%d\s*'
                                % a),
                     lambda m, n=n: 'rgb%s(%d, %d, %d' % (m.group('a'), *n),
                     f'{name}: rgb()/rgba() dezimal'))

        # 5) Fliesskomma fuer pdf-lib: drei Nachkommastellen, so wie die
        #    Vorlage sie schreibt.
        f_alt = tuple(round(x / 255, 3) for x in a)
        f_neu = tuple(round(x / 255, 3) for x in n)
        raus.append((re.compile(r'\brgb\(\s*%s\s*,\s*%s\s*,\s*%s\s*\)'
                                % tuple(re.escape(f'{x:.3f}') for x in f_alt)),
                     'rgb(%.3f, %.3f, %.3f)' % f_neu,
                     f'{name}: rgb() in Fliesskomma (pdf-lib)'))
    return raus


REGELN = _regeln()


def tauschen(inhalt):
    """Gibt (neuer Inhalt, {Bemerkung: Anzahl}) zurueck."""
    zaehler = {}
    for muster, ersatz, bemerkung in REGELN:
        inhalt, n = muster.subn(ersatz, inhalt)
        if n:
            zaehler[bemerkung] = zaehler.get(bemerkung, 0) + n
    return inhalt, zaehler


def bericht(zaehler, vorsatz='  '):
    for bemerkung, n in sorted(zaehler.items(), key=lambda x: (-x[1], x[0])):
        print(f'{vorsatz}[FARBE] {n:4d}x  {bemerkung}')
