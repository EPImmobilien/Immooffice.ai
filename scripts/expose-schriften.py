#!/usr/bin/env python3
"""Erzeugt die Schriftschnitte fuer die Expose-Vorlagen.

Die drei Prototypen in reference/expose-vorlagen/ laden feste Dateien
(Jak-*.ttf, Corm-*.ttf, Arch-*.ttf). Woher die kamen, stand nicht im
Auftrag — aber in den Referenz-PDFs: sie tragen die eingebetteten
Schriftprogramme. Jede der achtzehn Instanzen wurde daraus
zurueckgerechnet (Vorschubbreiten und Umrissrahmen jedes Glyphs gegen ein
Gitter aus wght x wdth gestellt, Treffer jeweils 100 %). Die Koordinaten
unten sind also nicht geraten, sondern gemessen. tests/expose-schriften.py
rechnet die Messung bei jedem check nach.

Die variablen Ausgangsschriften liegen nicht im Repository: sie sind
Arbeitsmaterial, und ihre Pruefsumme steht hier. Das Erzeugnis dagegen
ist versioniert — dasselbe Muster wie bei src/ und supabase/functions/.

    python3 scripts/expose-schriften.py            # erzeugen
    python3 scripts/expose-schriften.py --pruefen  # nur vergleichen
"""
import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import urllib.request

STAMM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIEL = os.path.join(STAMM, "assets", "fonts", "expose")
ZWISCHEN = os.path.join(STAMM, "reference", "schriften-vf")

ROH = "https://raw.githubusercontent.com/google/fonts/main/ofl"

# Die variablen Ausgangsschriften. Die Pruefsumme ist die Wache: aendert
# Google die Datei, faellt das hier auf und ein Mensch entscheidet, statt
# dass sich die Schnitte unter der Hand verschieben.
QUELLEN = {
    "jakarta": (
        f"{ROH}/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf",
        "89b3fb38aa0d275d7a731d0d817a4f1622b316b4d7fbdedcf02ee9099ff68bc8",
        "plusjakartasans",
    ),
    "cormorant": (
        f"{ROH}/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf",
        "b20b7d9626dd956b2c5e558692ad328b1f19e3275e2782db4fa07670d83f35e0",
        "cormorantgaramond",
    ),
    "cormorant-kursiv": (
        f"{ROH}/cormorantgaramond/CormorantGaramond-Italic%5Bwght%5D.ttf",
        "0f48ea6abb2084537854f7174c470991a463b13036309e3b50a81511611c530d",
        "cormorantgaramond",
    ),
    "archivo": (
        f"{ROH}/archivo/Archivo%5Bwdth,wght%5D.ttf",
        "0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053",
        "archivo",
    ),
    # Vorlage „Buehne" (07.10.2026): Headlines in Bricolage Grotesque, Text
    # in DM Sans. Die Achsen stehen im Kopf des Prototyps
    # (immoOffice_buehne_generator.py): opsz 48 / wdth 90 fuer die
    # Headlines; DM Sans in der optischen Groesse fuer Lesetext.
    "bricolage": (
        f"{ROH}/bricolagegrotesque/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf",
        "413e7357809ddd12fd80a96a8a396de0e401638d4acd3cb3e37532f0472ac682",
        "bricolagegrotesque",
    ),
    "dmsans": (
        f"{ROH}/dmsans/DMSans%5Bopsz,wght%5D.ttf",
        "8cd08d97e89c24d0aa92edd2f0f4c8ee6195eee9b7c9f154865a58b02f0c1c0d",
        "dmsans",
    ),
}

# Datei, Quelle, Achsen, PostScript-Name (nameID 6), Anzeigename (1 und 4).
# Die PostScript-Namen sind die der Referenz-PDFs, Zeichen fuer Zeichen.
SCHNITTE = [
    ("Jak-Light.ttf",        "jakarta",   {"wght": 300},              "PlusJakarta-Light",     "PlusJakarta Light"),
    ("Jak-Regular.ttf",      "jakarta",   {"wght": 400},              "PlusJakarta-Regular",   "PlusJakarta Regular"),
    ("Jak-Medium.ttf",       "jakarta",   {"wght": 500},              "PlusJakarta-Medium",    "PlusJakarta Medium"),
    ("Jak-SemiBold.ttf",     "jakarta",   {"wght": 600},              "PlusJakarta-SemiBold",  "PlusJakarta SemiBold"),
    ("Jak-Bold.ttf",         "jakarta",   {"wght": 700},              "PlusJakarta-Bold",      "PlusJakarta Bold"),
    ("Jak-ExtraBold.ttf",    "jakarta",   {"wght": 800},              "PlusJakarta-ExtraBold", "PlusJakarta ExtraBold"),

    ("Corm-Light.ttf",       "cormorant", {"wght": 300},              "Corm-Light",            "Corm Light"),
    ("Corm-Regular.ttf",     "cormorant", {"wght": 400},              "Corm-Regular",          "Corm Regular"),
    ("Corm-Medium.ttf",      "cormorant", {"wght": 500},              "Corm-Medium",           "Corm Medium"),
    ("Corm-SemiBold.ttf",    "cormorant", {"wght": 600},              "Corm-SemiBold",         "Corm SemiBold"),
    ("Corm-LightItalic.ttf", "cormorant-kursiv", {"wght": 300},       "Corm-LightItalic",      "Corm Light Italic"),
    ("Corm-RegularItalic.ttf", "cormorant-kursiv", {"wght": 400},     "Corm-RegularItalic",    "Corm Regular Italic"),
    ("Corm-MediumItalic.ttf", "cormorant-kursiv", {"wght": 500},      "Corm-MediumItalic",     "Corm Medium Italic"),

    ("Arch-Light.ttf",       "archivo",   {"wght": 300, "wdth": 100}, "Arch-Light",            "Arch Light"),
    ("Arch-Regular.ttf",     "archivo",   {"wght": 400, "wdth": 100}, "Arch-Regular",          "Arch Regular"),
    ("Arch-Medium.ttf",      "archivo",   {"wght": 500, "wdth": 100}, "Arch-Medium",           "Arch Medium"),
    ("Arch-SemiBold.ttf",    "archivo",   {"wght": 600, "wdth": 100}, "Arch-SemiBold",         "Arch SemiBold"),
    ("Arch-Bold.ttf",        "archivo",   {"wght": 700, "wdth": 100}, "Arch-Bold",             "Arch Bold"),
    ("Arch-CondXB.ttf",      "archivo",   {"wght": 800, "wdth": 62},  "Arch-CondXB",           "Arch Condensed ExtraBold"),
    ("Arch-CondBlack.ttf",   "archivo",   {"wght": 900, "wdth": 62},  "Arch-CondBlack",        "Arch Condensed Black"),
    ("Bric-Medium.ttf",      "bricolage", {"wght": 500, "wdth": 90, "opsz": 48}, "BricolageGrotesque-Medium", "Bricolage Grotesque Medium"),
    ("Bric-Bold.ttf",        "bricolage", {"wght": 700, "wdth": 90, "opsz": 48}, "BricolageGrotesque-Bold", "Bricolage Grotesque Bold"),
    ("Bric-ExtraBold.ttf",   "bricolage", {"wght": 800, "wdth": 90, "opsz": 48}, "BricolageGrotesque-ExtraBold", "Bricolage Grotesque ExtraBold"),
    ("DMS-Regular.ttf",      "dmsans",    {"wght": 400, "opsz": 14}, "DMSans-Regular", "DM Sans Regular"),
    ("DMS-Medium.ttf",       "dmsans",    {"wght": 500, "opsz": 14}, "DMSans-Medium", "DM Sans Medium"),
    ("DMS-Bold.ttf",         "dmsans",    {"wght": 700, "opsz": 14}, "DMSans-Bold", "DM Sans Bold"),
]

# Welche Zeichen bleiben. Alles, was ein deutscher Makler tippt, und
# daneben die Nachbarsprachen (Latin Extended-A deckt Polnisch,
# Tschechisch, Ungarisch, Tuerkisch ab). Griechisch, Kyrillisch und
# Vietnamesisch fliegen heraus: Corm-Light ist damit 772 KiB, ohne sie
# ein Bruchteil davon, und die Vorschau im Browser laedt die Schriften.
# Was fehlt, meldet der Renderer als Warnung statt still ein leeres
# Rechteck zu setzen.
ZEICHEN = [
    (0x0000, 0x00FF),   # Latin-1, mit den Steuerzeichen davor: ReportLab
                        # bettet U+0000 mit ein, und tests/expose-schriften.py
                        # vergleicht Glyph fuer Glyph gegen genau diese PDFs.
    (0x0100, 0x017F),   # Latin Extended-A
    (0x0192, 0x0192),   # florin
    (0x02C6, 0x02DD),   # Zirkumflex, Tilde, Caron als Einzelzeichen
    (0x2010, 0x2027),   # Striche, Anfuehrungszeichen, Auslassungspunkte
    (0x2030, 0x2030),   # Promille
    (0x2039, 0x203A),   # einfache Winkelzeichen
    (0x2044, 0x2044),   # Bruchstrich
    (0x20A0, 0x20BF),   # Waehrungen, Euro eingeschlossen
    (0x2113, 0x2116),   # Liter, Nummernzeichen
    (0x2122, 0x2122),   # Marke
    (0x2126, 0x2126),   # Ohm
    (0x212E, 0x212E),   # Zaehlzeichen
    (0x215B, 0x215E),   # Achtelbrueche
    (0x2190, 0x2193),   # Pfeile in die vier Richtungen
    (0x2202, 0x2202), (0x2206, 0x2206), (0x220F, 0x220F),
    (0x2211, 0x2212), (0x2215, 0x2215), (0x2219, 0x221A),
    (0x221E, 0x221E), (0x222B, 0x222B), (0x2248, 0x2248),
    (0x2260, 0x2261), (0x2264, 0x2265),   # Mathematik, so weit sie vorkommt
    (0x25A0, 0x25A1), (0x25AA, 0x25AB), (0x25B2, 0x25B2),
    (0x25BC, 0x25BC), (0x25CF, 0x25CF),   # Quadrate, Dreiecke, Punkt
    (0x2713, 0x2714),   # Haken
    (0xFB01, 0xFB02),   # fi und fl als Einzelzeichen
]

# Zwei der obigen Schnitte zeichnet kein Referenz-PDF: Corm-MediumItalic
# (Signature registriert ihn) und Arch-Light (Studio registriert ihn).
# Sie sind trotzdem dabei, weil nichts daran zu raten ist: die kursive
# Gewichtsachse ist mit 300 und 400 zweifach belegt, und wdth 100 ist fuer
# vier andere Archivo-Schnitte belegt. 500 bzw. 300 liegt auf derselben
# Achse mit derselben Benennung.
#
# Arch-SemiCondBold fehlt dagegen bewusst. Studio registriert ihn, zeichnet
# nie damit, und Google liefert fuer Archivo ueberhaupt keine statischen
# Schnitte — es gibt also keine Konvention, von der man "SemiCondensed"
# ableiten koennte. Cond ist nachweislich wdth 62, die Untergrenze der
# Achse; SemiCond waere die Mitte, waere aber geraten.
# tests/expose-aufzeichnung.py setzt beim Laden der Prototypen einen
# vorhandenen Schnitt an seine Stelle UND prueft danach, dass kein
# aufgezeichneter Schritt ihn benutzt. Faengt eine Vorlage doch damit an zu
# zeichnen, faellt es dort auf. Siehe docs/ENTSCHEIDUNGEN.md.


class KeinNetz(Exception):
    """Die variable Schrift liegt nicht da und ist nicht zu holen."""


def hole(name):
    """Laedt eine variable Schrift, wenn sie nicht schon daliegt."""
    url, summe, _ = QUELLEN[name]
    pfad = os.path.join(ZWISCHEN, name + ".ttf")
    if not os.path.exists(pfad):
        try:
            with urllib.request.urlopen(url, timeout=120) as a:
                daten = a.read()
        except Exception as grund:
            raise KeinNetz(f"{name}: {grund}") from grund
        os.makedirs(ZWISCHEN, exist_ok=True)
        with open(pfad, "wb") as f:
            f.write(daten)
    daten = open(pfad, "rb").read()
    ist = hashlib.sha256(daten).hexdigest()
    if ist != summe:
        sys.exit(
            f"[FEHLER] {name}: Pruefsumme weicht ab.\n"
            f"         erwartet {summe}\n         gelesen  {ist}\n"
            f"         Die variable Schrift wurde oben geaendert. Ein Mensch\n"
            f"         muss entscheiden, ob die Schnitte nachgezogen werden."
        )
    return pfad


def setze_namen(schrift, ps, anzeige, kursiv):
    """Ein eigener Namenssatz je Schnitt.

    Alle achtzehn Schnitte stammen aus vier Dateien. Behielten sie den
    Namen der Ausgangsschrift, waeren sie fuer einen PDF-Betrachter
    dieselbe Schrift, und er duerfte Schnitte selbst nachbilden. Darum
    traegt jeder Schnitt eine eigene Familie.
    """
    namen = schrift["name"]
    namen.names = []
    unter = "Italic" if kursiv else "Regular"
    for kennung, wert in ((1, anzeige), (2, unter), (3, f"{anzeige}; immoOffice"),
                          (4, anzeige), (6, ps)):
        namen.setName(wert, kennung, 3, 1, 0x409)   # Windows, Unicode
        namen.setName(wert, kennung, 1, 0, 0)       # Macintosh, Roman
    # 16/17 (typografische Familie) wuerden die Vereinzelung wieder
    # aufheben: ein Betrachter gruppiert danach. Also nicht setzen.


def verkleinern(schrift):
    """Zeichensatz eingrenzen und die Satzmerkmale entfernen.

    Die Prototypen rechnen Breiten mit pdfmetrics.stringWidth. Das
    unterlegt KEINE Unterschneidung und KEINE Ligaturen — es addiert
    Vorschubbreiten. Ein Renderer, der kerned, waeicht von der
    verbindlichen Vorlage ab, und zwar wachsend mit der Zeilenlaenge.
    Darum fliegen GSUB und GPOS heraus: dann hat fontkit nichts
    anzuwenden, und Browser und Edge Function rechnen dasselbe.
    """
    from fontTools import subset

    moeglich = set(schrift.getBestCmap())
    gewuenscht = {c for a, e in ZEICHEN for c in range(a, e + 1)}
    behalten = sorted(moeglich & gewuenscht)

    optionen = subset.Options()
    optionen.layout_features = []
    optionen.name_IDs = ["*"]
    optionen.name_legacy = True
    optionen.name_languages = ["*"]
    optionen.notdef_outline = True
    optionen.recalc_bounds = True
    optionen.drop_tables += ["GSUB", "GPOS", "GDEF", "kern", "morx", "MATH", "BASE"]
    optionen.glyph_names = False
    schneider = subset.Subsetter(options=optionen)
    schneider.populate(unicodes=behalten)
    schneider.subset(schrift)


def erzeuge(ziel):
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont

    os.makedirs(ziel, exist_ok=True)
    quellen = {}
    for name in sorted({q for _, q, _, _, _ in SCHNITTE}):
        quellen[name] = hole(name)

    for datei, quelle, achsen, ps, anzeige in SCHNITTE:
        schrift = TTFont(quellen[quelle])
        schrift = instantiateVariableFont(
            schrift, achsen, inplace=True, updateFontNames=False, optimize=True
        )
        kursiv = "Italic" in ps
        setze_namen(schrift, ps, anzeige, kursiv)
        os2 = schrift["OS/2"]
        os2.usWeightClass = int(achsen["wght"])
        if "wdth" in achsen:
            # usWidthClass ist eine Stufe von 1 bis 9, nicht die Achse.
            stufen = [(50, 1), (62.5, 2), (75, 3), (87.5, 4), (100, 5),
                      (112.5, 6), (125, 7), (150, 8), (200, 9)]
            breite = achsen["wdth"]
            os2.usWidthClass = min(stufen, key=lambda s: abs(s[0] - breite))[1]
        for tafel in ("STAT", "fvar", "gvar", "avar", "HVAR", "MVAR", "VVAR", "cvar"):
            if tafel in schrift:
                del schrift[tafel]
        verkleinern(schrift)
        # Ohne das schreibt fontTools die aktuelle Uhrzeit in head.modified
        # und jede Erzeugung liefert andere Bytes. Dann kann --pruefen nicht
        # mehr sagen, ob assets/ und Skript auseinanderlaufen.
        kopf = schrift["head"]
        kopf.modified = kopf.created
        schrift.recalcTimestamp = False
        schrift.save(os.path.join(ziel, datei))

    for name in sorted({QUELLEN[q][2] for _, q, _, _, _ in SCHNITTE}):
        lizenz = os.path.join(ZIEL, f"OFL-{name}.txt")
        if not os.path.exists(lizenz):
            with urllib.request.urlopen(f"{ROH}/{name}/OFL.txt", timeout=120) as a:
                open(lizenz, "wb").write(a.read())


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pruefen", action="store_true",
                   help="in ein Zwischenverzeichnis erzeugen und mit assets/ vergleichen")
    a = p.parse_args()

    if not a.pruefen:
        erzeuge(ZIEL)
        n = len([f for f in os.listdir(ZIEL) if f.endswith(".ttf")])
        gesamt = sum(os.path.getsize(os.path.join(ZIEL, f))
                     for f in os.listdir(ZIEL) if f.endswith(".ttf"))
        print(f"[ok] {n} Schnitte in assets/fonts/expose/ ({gesamt // 1024} KiB).")
        return 0

    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        try:
            erzeuge(tmp)
        except KeinNetz as grund:
            print(f"Die variablen Ausgangsschriften liegen nicht in "
                  f"reference/schriften-vf/ und sind nicht zu holen "
                  f"({grund}) — nicht pruefbar.")
            return 0
        abweichend = []
        for datei, *_ in SCHNITTE:
            a_pfad, b_pfad = os.path.join(ZIEL, datei), os.path.join(tmp, datei)
            if not os.path.exists(a_pfad):
                abweichend.append(f"{datei}: fehlt in assets/")
            elif open(a_pfad, "rb").read() != open(b_pfad, "rb").read():
                abweichend.append(f"{datei}: Inhalt weicht ab")
        if abweichend:
            for z in abweichend:
                print("  [FEHLER]", z)
            print("  `python3 scripts/expose-schriften.py` ausfuehren.")
            return 1
        print(f"[ok] Alle {len(SCHNITTE)} Schnitte in assets/fonts/expose/ "
              f"sind byte-genau das, was das Skript erzeugt.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
