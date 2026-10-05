#!/usr/bin/env python3
"""Sollbreiten aus ReportLab — die Rechnung der Prototypen.

Wird von tests/expose-breiten.js aufgerufen und gibt JSON auf stdout. Die
Prototypen setzen jede Zeile mit pdfmetrics.stringWidth; weicht der
Renderer davon ab, bricht er anders um als die verbindliche Vorlage.
"""
import json
import os
import sys

STAMM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHRIFTEN = os.path.join(STAMM, "assets", "fonts", "expose")

# Was in den Prototypen und in echten Objektdaten vorkommt: Umlaute,
# Zahlen mit Komma, Einheiten, Gedankenstriche, Anfuehrungszeichen,
# gesperrte Versalien, lange Fliesstexte.
PROBEN = [
    "",
    " ",
    "A",
    "Wohnfläche",
    "148 m²",
    "589.000 €",
    "3,57 % inkl. MwSt.",
    "AUF EINEN BLICK",
    "Lichtdurchflutetes Einfamilienhaus mit Südgarten",
    "Am Lindenhang 12 · 12345 Musterstadt",
    "„Ankommen, durchatmen, zuhause sein.“",
    "Luft-Wasser-Wärmepumpe – 2022 erneuert",
    "Übergabe nach Vereinbarung / frei ab 01.04.",
    "Kita & Grundschule fußläufig, Ärzte in 1,3 km",
    "62,4 kWh/(m²a)",
    "HRB 12345 · Amtsgericht Musterstadt · USt-IdNr. DE123456789",
    "Dieses freistehende Einfamilienhaus wurde 2004 in massiver Bauweise "
    "errichtet und seither mit viel Sorgfalt gepflegt.",
    "Maße: 12,40 m × 8,75 m",
    "ÉCLAIRÉ · ŁÓDŹ · ÇEŞME · ŽIŽKOV",
    "iiiiiiiiiiWWWWWWWWWW",
]

GROESSEN = [5.8, 6.0, 6.5, 7.0, 7.8, 8.5, 9.0, 9.2, 10.0, 13.0, 17.0, 24.0, 27.0, 56.0]
SPERRUNGEN = [0, 0.5, 1.2, 1.8, 2.2, -0.4, -0.6]


def main():
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except ImportError:
        print(json.dumps({"uebersprungen": "reportlab fehlt"}))
        return 0
    if not os.path.isdir(SCHRIFTEN):
        print(json.dumps({"uebersprungen": "assets/fonts/expose/ fehlt"}))
        return 0

    schnitte = sorted(f for f in os.listdir(SCHRIFTEN) if f.endswith(".ttf"))
    werte = {}
    for datei in schnitte:
        name = datei[:-4]
        pdfmetrics.registerFont(TTFont(name, os.path.join(SCHRIFTEN, datei)))
        for i, probe in enumerate(PROBEN):
            for groesse in GROESSEN:
                for sperrung in SPERRUNGEN:
                    b = pdfmetrics.stringWidth(probe, name, groesse)
                    b += sperrung * max(len(probe) - 1, 0)
                    werte[f"{name}|{i}|{groesse}|{sperrung}"] = b
    print(json.dumps({"proben": PROBEN, "schnitte": schnitte, "werte": werte}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
