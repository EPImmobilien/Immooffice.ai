#!/usr/bin/env python3
"""
Erzeugt vorschau/index.html aus vorschau/vorlage.html.

Die Schriften werden auf die tatsaechlich vorkommenden Zeichen reduziert und als
WOFF2 eingebettet. Dadurch bleibt die Datei klein und benoetigt kein fremdes
CDN — dieselbe Vorgabe wie in der Anwendung (Abschnitt 16).

Voraussetzungen:
    pip install fonttools brotli
    Inter-400.ttf, Inter-500.ttf, Inter-600.ttf,
    Poppins-500.ttf, Poppins-SemiBold.ttf  im Arbeitsverzeichnis

Bezug der Schriften (SIL Open Font License 1.1):
    curl -s "https://fonts.googleapis.com/css2?family=Inter:wght@400" \
      -H "User-Agent: Mozilla/5.0" | grep -o 'https://[^)]*\.ttf'
"""
import base64
import io
import pathlib
import re
import sys

from fontTools import subset

WURZEL = pathlib.Path(__file__).resolve().parent.parent
VORSCHAU = WURZEL / "vorschau"

SCHRIFTEN = [
    ("Inter-400.ttf", "Inter", 400),
    ("Inter-500.ttf", "Inter", 500),
    ("Inter-600.ttf", "Inter", 600),
    ("Poppins-500.ttf", "Poppins", 500),
    ("Poppins-SemiBold.ttf", "Poppins", 600),
]


def sichtbare_zeichen(html: str) -> set[str]:
    """Alle Zeichen, die im Dokument tatsaechlich dargestellt werden."""
    ohne_code = re.sub(r"<(style|script)[^>]*>.*?</\1>", " ", html, flags=re.S)
    sichtbar = re.sub(r"<[^>]+>", " ", ohne_code)
    zeichen = set(sichtbar)
    # Zeichen, die erst durch Eingaben entstehen koennen, bewusst ergaenzen.
    zeichen |= set("0123456789.,€%²·–—+/()[]:;!?\"'&@#*")
    zeichen |= set("abcdefghijklmnopqrstuvwxyz")
    zeichen |= set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    zeichen |= set("äöüÄÖÜß")
    return {z for z in zeichen if z.isprintable()}


def einbetten(quelle: pathlib.Path, zeichen: set[str]) -> str:
    optionen = subset.Options()
    optionen.layout_features = ["kern", "liga", "tnum", "calt"]
    optionen.desubroutinize = True
    optionen.notdef_outline = True

    font = subset.load_font(str(quelle), optionen)
    schneider = subset.Subsetter(options=optionen)
    schneider.populate(text="".join(sorted(zeichen)))
    schneider.subset(font)

    puffer = io.BytesIO()
    font.flavor = "woff2"
    font.save(puffer)
    daten = puffer.getvalue()
    print(f"  {quelle.name:24s} {len(daten):>6d} Bytes")
    return base64.b64encode(daten).decode("ascii")


def main() -> int:
    vorlage = VORSCHAU / "vorlage.html"
    if not vorlage.exists():
        print(f"Vorlage fehlt: {vorlage}", file=sys.stderr)
        return 1

    html = vorlage.read_text(encoding="utf-8")
    zeichen = sichtbare_zeichen(html)
    print(f"Verwendete Zeichen: {len(zeichen)}")

    verzeichnis = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path.cwd()

    regeln = []
    for datei, familie, gewicht in SCHRIFTEN:
        pfad = verzeichnis / datei
        if not pfad.exists():
            print(f"Schriftdatei fehlt: {pfad}", file=sys.stderr)
            return 1
        b64 = einbetten(pfad, zeichen)
        regeln.append(
            f"@font-face{{font-family:{familie};font-style:normal;"
            f"font-weight:{gewicht};font-display:swap;"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2')}}"
        )

    html = html.replace("/* SCHRIFTEN_PLATZHALTER */", "\n".join(regeln))
    ziel = VORSCHAU / "index.html"
    ziel.write_text(html, encoding="utf-8")
    print(f"\n{ziel.relative_to(WURZEL)}: {ziel.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
