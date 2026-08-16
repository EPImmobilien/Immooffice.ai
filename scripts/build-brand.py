#!/usr/bin/env python3
"""
Erzeugt die vier Marken-SVGs von ImmoOffice.ai in assets/brand/.

Bildmarke "Schluesselloch-Turm": ein Turm mit Rundbogen, in den ein Schluesselloch
eingesetzt ist, auf einem Sockel. Reine Geometrie, keine Schriftabhaengigkeit.

Wortmarke: Poppins SemiBold, als Pfade eingebettet (Master-Prompt Abschnitt 3).
Die Schriftdatei liegt bewusst nicht im Repository (OFL, Bezug ueber Google Fonts):

    curl -s "https://fonts.googleapis.com/css2?family=Poppins:wght@600" \
      -H "User-Agent: Mozilla/5.0" | grep -o 'https://[^)]*\\.ttf'

Aufruf:  python3 scripts/build-brand.py <Poppins-SemiBold.ttf>
"""
import pathlib
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

# --- Farbwelt (Master-Prompt Abschnitt 3, fixiert) --------------------------
MARINE = "#1B2A47"
GOLD = "#B5934F"
GOLD_HELL = "#C9AE72"
WEISS = "#FFFFFF"

ZIEL = pathlib.Path(__file__).resolve().parent.parent / "assets" / "brand"

# --- Bildmarke --------------------------------------------------------------
# Zeichenflaeche 64x64. Turm x=16..48, Rundbogen mit Radius 16 um (32,26),
# Sockel x=12..52. Alles ganzzahlig gerastert, damit die Marke auch bei
# 16 px (Favicon) sauber steht.
TURM = "M16 55V26a16 16 0 0 1 32 0v29Z"
SOCKEL = "M12 57h40a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z"
# Schluesselloch bewusst grosszuegig: es traegt die Wiedererkennung und muss
# auch bei 24 px noch als Loch lesbar bleiben, nicht als Punkt.
SCHLUESSELLOCH = (
    "M32 19a7.5 7.5 0 0 0-4.1 13.78L25.4 46h13.2l-2.5-13.22A7.5 7.5 0 0 0 32 19Z"
)

# --- Wortmarke --------------------------------------------------------------
# Zweifarbig: Produktname in Marineblau, Endung in Gold.
TEILE = [("ImmoOffice", "name"), (".ai", "endung")]
VERSALHOEHE = 100.0


def wortmarke(ttf_pfad):
    """Liefert {teil: pfaddaten} sowie die Gesamtbreite bei Versalhoehe 100."""
    font = TTFont(ttf_pfad)
    glyphset = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    kern = font["kern"].kernTables[0].kernTable if "kern" in font else {}
    skalierung = VERSALHOEHE / font["head"].unitsPerEm

    ergebnis = {}
    x = 0.0
    vorheriger = None

    for text, bezeichnung in TEILE:
        stuecke = []
        for zeichen in text:
            name = cmap.get(ord(zeichen))
            if name is None:
                raise SystemExit(f"Zeichen fehlt in der Schrift: {zeichen!r}")
            if vorheriger is not None:
                x += kern.get((vorheriger, name), 0) * skalierung

            stift = SVGPathPen(glyphset)
            glyphset[name].draw(stift)
            daten = stift.getCommands()
            if daten:
                # Schriften zeichnen nach oben, SVG nach unten -> y spiegeln.
                stuecke.append(
                    f'<g transform="translate({x:.2f} 0) '
                    f'scale({skalierung:.4f} {-skalierung:.4f})">'
                    f'<path d="{daten}"/></g>'
                )
            x += hmtx[name][0] * skalierung
            vorheriger = name
        ergebnis[bezeichnung] = "".join(stuecke)

    return ergebnis, x


def kopf(breite, hoehe, titel):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {breite} {hoehe}" '
        f'width="{breite}" height="{hoehe}" role="img" aria-label="{titel}">\n'
        f"  <title>{titel}</title>\n"
    )


def bildmarke(turm_farbe, akzent_farbe, loch_farbe):
    """Bildmarke als Gruppe. Das Schluesselloch traegt seine eigene Farbe."""
    return (
        f'  <path fill="{turm_farbe}" d="{TURM}"/>\n'
        f'  <path fill="{akzent_farbe}" d="{SOCKEL}"/>\n'
        f'  <path fill="{loch_farbe}" d="{SCHLUESSELLOCH}"/>\n'
    )


def schreibe_icon(datei, turm, akzent, loch, titel):
    inhalt = kopf(64, 64, titel) + bildmarke(turm, akzent, loch) + "</svg>\n"
    (ZIEL / datei).write_text(inhalt, encoding="utf-8")
    return datei


def schreibe_logo(datei, marke, turm, akzent, loch, name_farbe, endung_farbe, titel):
    """Waagerechte Sperrung: Bildmarke links, Wortmarke rechts."""
    icon_groesse = 56.0          # Bildmarke auf 56 px Hoehe
    icon_skala = icon_groesse / 64.0
    versal = 34.0                # Versalhoehe der Wortmarke
    wort_skala = versal / VERSALHOEHE
    abstand = 20.0
    wort_x = icon_groesse + abstand
    hoehe = 64.0
    icon_y = (hoehe - icon_groesse) / 2.0
    grundlinie = hoehe / 2.0 + versal / 2.0   # optisch mittig
    breite = wort_x + marke["breite"] * wort_skala

    return _schreibe(
        datei,
        kopf(round(breite, 1), hoehe, titel)
        + f'  <g transform="translate(0 {icon_y:.2f}) scale({icon_skala:.4f})">\n  '
        + bildmarke(turm, akzent, loch).replace("\n  ", "\n    ").rstrip()
        + "\n  </g>\n"
        + f'  <g transform="translate({wort_x:.2f} {grundlinie:.2f}) '
        f'scale({wort_skala:.4f})">\n'
        + f'    <g fill="{name_farbe}">{marke["name"]}</g>\n'
        + f'    <g fill="{endung_farbe}">{marke["endung"]}</g>\n'
        + "  </g>\n</svg>\n",
    )


def _schreibe(datei, inhalt):
    (ZIEL / datei).write_text(inhalt, encoding="utf-8")
    return datei


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)

    ZIEL.mkdir(parents=True, exist_ok=True)
    teile, breite = wortmarke(sys.argv[1])
    marke = {**teile, "breite": breite}

    erzeugt = [
        # Bildmarke allein — Favicon, App-Icon, PDF-Kopf, E-Mail-Signatur.
        schreibe_icon(
            "immooffice-icon-dunkel.svg", MARINE, GOLD, GOLD,
            "ImmoOffice.ai Bildmarke (dunkel, fuer helle Flaechen)",
        ),
        schreibe_icon(
            "immooffice-icon-hell.svg", WEISS, GOLD_HELL, GOLD_HELL,
            "ImmoOffice.ai Bildmarke (hell, fuer dunkle Flaechen)",
        ),
        # Vollstaendige Sperrung aus Bildmarke und Wortmarke.
        schreibe_logo(
            "immooffice-logo-primaer.svg", marke, MARINE, GOLD, GOLD,
            MARINE, GOLD, "ImmoOffice.ai",
        ),
        schreibe_logo(
            "immooffice-logo-invers.svg", marke, WEISS, GOLD_HELL, GOLD_HELL,
            WEISS, GOLD_HELL, "ImmoOffice.ai",
        ),
    ]

    for datei in erzeugt:
        groesse = (ZIEL / datei).stat().st_size
        print(f"{datei:34s} {groesse:6d} Bytes")
    print(f"\nWortmarkenbreite bei Versalhoehe {VERSALHOEHE:.0f}: {breite:.1f}")


if __name__ == "__main__":
    main()
