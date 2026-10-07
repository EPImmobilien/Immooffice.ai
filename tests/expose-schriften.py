#!/usr/bin/env python3
"""Sind es wirklich die Schriften der Prototypen?

Die drei Prototypen laden Dateien, die es nur auf dem Rechner gab, auf
dem sie liefen. Ihre Referenz-PDFs tragen aber die eingebetteten
Schriftprogramme. Dieser Test holt sie heraus und vergleicht sie mit
assets/fonts/expose/ — Glyph fuer Glyph, ueber Vorschubbreite und
Umrissrahmen. Stimmt eine Achse nicht, faellt das hier auf und nicht
erst, wenn ein Expose eine Zeile zu breit setzt.

Ohne reference/ nicht pruefbar; dann sagt der Test das und ist gruen,
wie die anderen referenzgebundenen Tore.
"""
import os
import re
import sys
import zlib

STAMM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDFS = os.path.join(STAMM, "reference", "expose-vorlagen")
SCHRIFTEN = os.path.join(STAMM, "assets", "fonts", "expose")

# PostScript-Name im PDF -> Datei in assets/fonts/expose/
DATEI = {
    "PlusJakarta-Light": "Jak-Light.ttf",
    "PlusJakarta-Regular": "Jak-Regular.ttf",
    "PlusJakarta-Medium": "Jak-Medium.ttf",
    "PlusJakarta-SemiBold": "Jak-SemiBold.ttf",
    "PlusJakarta-Bold": "Jak-Bold.ttf",
    "PlusJakarta-ExtraBold": "Jak-ExtraBold.ttf",
    "Corm-Light": "Corm-Light.ttf",
    "Corm-Regular": "Corm-Regular.ttf",
    "Corm-Medium": "Corm-Medium.ttf",
    "Corm-SemiBold": "Corm-SemiBold.ttf",
    "Corm-LightItalic": "Corm-LightItalic.ttf",
    "Corm-RegularItalic": "Corm-RegularItalic.ttf",
    "Corm-MediumItalic": "Corm-MediumItalic.ttf",
    "Arch-Light": "Arch-Light.ttf",
    "Arch-Regular": "Arch-Regular.ttf",
    "Arch-Medium": "Arch-Medium.ttf",
    "Arch-SemiBold": "Arch-SemiBold.ttf",
    "Arch-Bold": "Arch-Bold.ttf",
    "Arch-CondXB": "Arch-CondXB.ttf",
    "Arch-CondBlack": "Arch-CondBlack.ttf",
    # Buehne: der Prototyp registriert Kurznamen (Bx = Bricolage Grotesque,
    # Sx = DM Sans), und ReportLab bettet sie unter diesem Namen ein. Die
    # Dateien hier tragen den vollen Namen — ein PDF, das jemand oeffnet,
    # soll die Schrift nennen, nicht ihr Kuerzel.
    "Bx-Medium": "Bric-Medium.ttf",
    "Bx-Bold": "Bric-Bold.ttf",
    "Bx-ExtraBold": "Bric-ExtraBold.ttf",
    "Sx-Regular": "DMS-Regular.ttf",
    "Sx-Medium": "DMS-Medium.ttf",
    "Sx-Bold": "DMS-Bold.ttf",
}

# PostScript-Name, den die Datei tragen soll, wo er vom Namen im
# Referenz-PDF abweicht (siehe oben).
PS_NAME = {
    "Bx-Medium": "BricolageGrotesque-Medium",
    "Bx-Bold": "BricolageGrotesque-Bold",
    "Bx-ExtraBold": "BricolageGrotesque-ExtraBold",
    "Sx-Regular": "DMSans-Regular",
    "Sx-Medium": "DMSans-Medium",
    "Sx-Bold": "DMSans-Bold",
}


def einbettungen(pfad):
    """Alle eingebetteten Schriftprogramme eines PDF, nach Name.

    Die Objektgrenzen kommen aus den "N 0 obj"-Marken, nicht aus
    "endobj": die Bytefolge "endobj" kann in einem Schriftstrom
    vorkommen und zerschneidet das PDF dann an der falschen Stelle. Der
    erste Anlauf hatte genau das getan — und die Namen um eine Stelle
    verdreht den Programmen zugeordnet.
    """
    roh = open(pfad, "rb").read()
    marken = [(int(m.group(1)), m.start(), m.end())
              for m in re.finditer(rb"(?<![0-9])(\d+) 0 obj", roh)]
    objekte = {}
    for i, (nr, anfang, ende_marke) in enumerate(marken):
        bis = marken[i + 1][1] if i + 1 < len(marken) else len(roh)
        objekte[nr] = roh[ende_marke:bis]

    gefunden = {}
    for k in objekte.values():
        kopf = k[:k.find(b"stream")] if b"stream" in k else k
        if b"/FontFile2" not in kopf:
            continue
        nm = re.search(rb"/FontName\s*/([A-Za-z0-9+#-]+)", kopf)
        ff = re.search(rb"/FontFile2\s+(\d+) 0 R", kopf)
        if not nm or not ff:
            continue
        name = nm.group(1).decode().split("+")[-1]
        d = objekte.get(int(ff.group(1)))
        if d is None:
            continue
        s, e = d.find(b"stream"), d.rfind(b"endstream")
        daten = d[s + 6:e].lstrip(b"\r\n")
        if b"/FlateDecode" in d[:s]:
            daten = zlib.decompress(daten)
        gefunden.setdefault(name, daten)
    return gefunden


def metriken(schrift, neu_rechnen=False):
    """Vorschubbreite und Umrissrahmen jedes Glyphs als Menge.

    Die Namen der Glyphs sagen nichts: der Teilsatz im PDF heisst
    glyph00001 und folgende. Die Geometrie sagt alles.
    """
    glyf, hmtx = schrift["glyf"], schrift["hmtx"]
    menge = set()
    for g in schrift.getGlyphOrder():
        gl = glyf[g]
        breite = hmtx[g][0]
        if gl.numberOfContours == 0:
            menge.add((breite,))
            continue
        if neu_rechnen:
            gl.recalcBounds(glyf)
        menge.add((breite, gl.xMin, gl.yMin, gl.xMax, gl.yMax))
    return menge


def main():
    if not os.path.isdir(PDFS):
        print("reference/expose-vorlagen/ fehlt — nicht pruefbar "
              "(reference/ ist nicht versioniert).")
        return 0
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print("fontTools fehlt — nicht pruefbar (`pip install fonttools`).")
        return 0

    import io

    teilsaetze = {}
    for name in sorted(os.listdir(PDFS)):
        if not name.endswith(".pdf"):
            continue
        for ps, daten in einbettungen(os.path.join(PDFS, name)).items():
            teilsaetze.setdefault(ps, daten)

    if not teilsaetze:
        print("[FEHLER] Kein eingebettetes Schriftprogramm in den "
              "Referenz-PDFs gefunden — der Test prueft nichts.")
        return 1

    fehler = []
    geprueft = 0
    for ps, daten in sorted(teilsaetze.items()):
        datei = DATEI.get(ps)
        if datei is None:
            fehler.append(f"{ps}: in keinem Schnitt von assets/fonts/expose/ "
                          f"abgebildet — die Zuordnung in diesem Test ist "
                          f"unvollstaendig.")
            continue
        pfad = os.path.join(SCHRIFTEN, datei)
        if not os.path.exists(pfad):
            fehler.append(f"{datei} fehlt — "
                          f"`python3 scripts/expose-schriften.py` ausfuehren.")
            continue
        soll = metriken(TTFont(io.BytesIO(daten)))
        ist = metriken(TTFont(pfad))
        fremd = soll - ist
        if fremd:
            beispiel = sorted(fremd)[:3]
            fehler.append(
                f"{ps} ({datei}): {len(fremd)} von {len(soll)} Glyphs der "
                f"Referenz haben hier keine Entsprechung, z. B. {beispiel}. "
                f"Achse falsch oder Zeichensatz zu eng geschnitten.")
            continue
        namen = TTFont(pfad)["name"].getDebugName(6)
        if namen != PS_NAME.get(ps, ps):
            fehler.append(f"{datei}: PostScript-Name ist {namen!r}, "
                          f"erwartet {PS_NAME.get(ps, ps)!r} (Referenz: {ps!r}).")
            continue
        geprueft += 1

    offen = sorted(set(DATEI) - set(teilsaetze))
    if fehler:
        for z in fehler:
            print("  [FEHLER]", z)
        return 1

    print(f"[ok] {geprueft} Schnitte stimmen Glyph fuer Glyph mit den "
          f"Referenz-PDFs ueberein")
    print(f"     (Vorschubbreite und Umrissrahmen, PostScript-Name).")
    if offen:
        print(f"     Nicht gegen die Referenz pruefbar, weil in keinem "
              f"Referenz-PDF gezeichnet: {', '.join(offen)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
