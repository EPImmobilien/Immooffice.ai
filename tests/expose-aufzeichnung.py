#!/usr/bin/env python3
"""Zeichnet auf, was die Prototypen zeichnen.

Der Auftrag nennt die drei Python-Prototypen verbindlich: "Masse,
Abstaende, Schriftgroessen, Farbableitung und Seitenaufbau sind
verbindlich und 1:1 zu uebernehmen." Abnehmen soll man das, indem man
Seiten als PNG rendert und ansieht.

Hinsehen findet aber keine Abweichung von zwei Punkt, und es findet sie
nicht wieder, wenn ein halbes Jahr spaeter jemand eine Vorlage pflegt.
Darum laufen die Prototypen hier gegen eine Leinwand, die nicht zeichnet,
sondern mitschreibt: jeder Text mit Ort, Schnitt, Groesse, Sperrung und
Farbe, jedes Rechteck, jede Linie, jeder Pfad, jeder Verlauf. Das Ergebnis
ist die Sollfassung, gegen die tests/expose-vorlagen.js die Ausgabe des
Renderers stellt.

Aufruf:  python3 tests/expose-aufzeichnung.py <vorlage>
         vorlage: raster | signature | studio   (oder "alle")
Gibt JSON auf stdout.
"""
import importlib.util
import json
import os
import sys

STAMM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROTOTYPEN = os.path.join(STAMM, "reference", "expose-vorlagen")
SCHRIFTEN = os.path.join(STAMM, "assets", "fonts", "expose")

DATEI = {
    "raster": "immoOffice_expose_generator.py",
    "signature": "immoOffice_luxus_generator.py",
    "studio": "immoOffice_studio_generator.py",
    "buehne": "immoOffice_buehne_generator.py",
}


def farbe(c):
    if c is None:
        return None
    try:
        return [round(c.red, 6), round(c.green, 6), round(c.blue, 6),
                round(getattr(c, "alpha", 1.0), 6)]
    except AttributeError:
        return None


class Textobjekt:
    """Was c.beginText() liefert — sammelt, bis drawText() es abholt."""

    def __init__(self, leinwand, x, y):
        self.leinwand = leinwand
        self.x, self.y = x, y
        self.schnitt = None
        self.groesse = None
        self.sperrung = 0
        self.farbe = None
        self.stuecke = []

    def setFont(self, f, size, leading=None):
        self.schnitt, self.groesse = f, size

    def setCharSpace(self, cs):
        # Die Prototypen setzen die Sperrung VOR textOut und danach auf 0
        # zurueck. Nur der Wert zum Zeitpunkt von textOut gilt.
        self.sperrung = cs

    def setFillColor(self, c):
        self.farbe = c

    def textOut(self, s):
        self.stuecke.append((s, self.schnitt, self.groesse, self.sperrung, self.farbe))

    def textLine(self, s=""):
        self.textOut(s)


class Pfad:
    def __init__(self):
        self.schritte = []

    def moveTo(self, x, y):
        self.schritte.append(["moveTo", x, y])

    def lineTo(self, x, y):
        self.schritte.append(["lineTo", x, y])

    def curveTo(self, a, b, c, d, e, f):
        self.schritte.append(["curveTo", a, b, c, d, e, f])

    def close(self):
        self.schritte.append(["close"])

    def rect(self, x, y, w, h):
        self.schritte.append(["rect", x, y, w, h])

    def roundRect(self, x, y, w, h, r):
        self.schritte.append(["roundRect", x, y, w, h, r])

    def circle(self, x, y, r):
        self.schritte.append(["circle", x, y, r])

    def ellipse(self, x1, y1, x2, y2):
        self.schritte.append(["ellipse", x1, y1, x2, y2])

    def arc(self, x1, y1, x2, y2, startAng=0, extent=90):
        """Der Tacho der Vorlage Buehne: Kreisboegen als Pfad."""
        self.schritte.append(["arc", x1, y1, x2, y2, startAng, extent])

    def arcTo(self, x1, y1, x2, y2, startAng=0, extent=90):
        self.schritte.append(["arcTo", x1, y1, x2, y2, startAng, extent])


class Leinwand:
    """Eine Leinwand, die mitschreibt statt zu zeichnen.

    Nur die Aufrufe, die die drei Prototypen tatsaechlich machen. Ein
    Aufruf, den es hier nicht gibt, soll laut abbrechen — eine Leinwand,
    die alles stillschweigend schluckt, wuerde eine halbe Seite
    verschwinden lassen, ohne dass es auffaellt.
    """

    def __init__(self, metriken):
        self.metriken = metriken
        self.seiten = []
        self.schritte = []
        self.zustand = {"fuell": None, "strich": None, "linienbreite": 1.0,
                        "strichmuster": None}
        self.stapel = []
        # Die Verschiebungen aus translate/rotate/scale, damit ein
        # gedrehter Text an der Stelle landet, wo er im PDF landet.
        self.ctm = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        self.ctm_stapel = []
        self.kopf = {}

    # ---- Dokument ------------------------------------------------------
    def setTitle(self, s):
        self.kopf["titel"] = s

    def setAuthor(self, s):
        self.kopf["autor"] = s

    def setCreator(self, s):
        self.kopf["ersteller"] = s

    def setSubject(self, s):
        self.kopf["thema"] = s

    def showPage(self):
        self.seiten.append(self.schritte)
        self.schritte = []

    def save(self):
        if self.schritte:
            self.showPage()

    # ---- Zustand -------------------------------------------------------
    def saveState(self):
        self.stapel.append(dict(self.zustand))
        self.ctm_stapel.append(self.ctm)

    def restoreState(self):
        self.zustand = self.stapel.pop()
        self.ctm = self.ctm_stapel.pop()

    def setFillColor(self, c):
        self.zustand["fuell"] = c

    def setFillColorRGB(self, r, g, b):
        from reportlab.lib.colors import Color
        self.zustand["fuell"] = Color(r, g, b)

    def setStrokeColor(self, c):
        self.zustand["strich"] = c

    def setLineWidth(self, w):
        self.zustand["linienbreite"] = w

    def setLineCap(self, k):
        pass

    def setLineJoin(self, k):
        pass

    def setDash(self, *a):
        self.zustand["strichmuster"] = list(a) if a else None

    def setFont(self, f, size, leading=None):
        self.zustand["schnitt"], self.zustand["groesse"] = f, size

    # ---- Matrix --------------------------------------------------------
    def _mal(self, m):
        a, b, c, d, e, f = self.ctm
        a2, b2, c2, d2, e2, f2 = m
        self.ctm = (a2 * a + b2 * c, a2 * b + b2 * d,
                    c2 * a + d2 * c, c2 * b + d2 * d,
                    e2 * a + f2 * c + e, e2 * b + f2 * d + f)

    def translate(self, dx, dy):
        self._mal((1, 0, 0, 1, dx, dy))

    def rotate(self, grad):
        import math
        r = math.radians(grad)
        self._mal((math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0))

    def scale(self, sx, sy):
        self._mal((sx, 0, 0, sy, 0, 0))

    def _matrix(self):
        return [round(v, 6) for v in self.ctm]

    # ---- Zeichnen ------------------------------------------------------
    def beginText(self, x=0, y=0):
        return Textobjekt(self, x, y)

    def drawText(self, t):
        for s, schnitt, groesse, sperrung, farb in t.stuecke:
            self.schritte.append({
                "art": "text", "x": round(t.x, 6), "y": round(t.y, 6), "text": s,
                "schnitt": schnitt, "groesse": groesse, "sperrung": sperrung,
                "farbe": farbe(farb if farb is not None else self.zustand["fuell"]),
                "matrix": self._matrix(),
            })

    def drawString(self, x, y, text, mode=None, charSpace=0, direction=None,
                   wordSpace=None):
        """Buehne schreibt kurze Zeilen direkt, ohne Textobjekt."""
        self.schritte.append({
            "art": "text", "x": round(x, 6), "y": round(y, 6), "text": text,
            "schnitt": self.zustand.get("schnitt"),
            "groesse": self.zustand.get("groesse"), "sperrung": charSpace,
            "farbe": farbe(self.zustand["fuell"]), "matrix": self._matrix(),
        })

    def drawRightString(self, x, y, text, **k):
        self.drawString(x, y, text, **k)

    def drawCentredString(self, x, y, text, **k):
        self.drawString(x, y, text, **k)

    def rect(self, x, y, w, h, stroke=1, fill=0):
        self.schritte.append({
            "art": "rechteck", "x": round(x, 6), "y": round(y, 6),
            "b": round(w, 6), "h": round(h, 6),
            "fuell": farbe(self.zustand["fuell"]) if fill else None,
            "strich": farbe(self.zustand["strich"]) if stroke else None,
            "linienbreite": self.zustand["linienbreite"] if stroke else None,
            "matrix": self._matrix(),
        })

    def roundRect(self, x, y, w, h, r, stroke=1, fill=0):
        self.schritte.append({
            "art": "rundrechteck", "x": round(x, 6), "y": round(y, 6),
            "b": round(w, 6), "h": round(h, 6), "r": round(r, 6),
            "fuell": farbe(self.zustand["fuell"]) if fill else None,
            "strich": farbe(self.zustand["strich"]) if stroke else None,
            "linienbreite": self.zustand["linienbreite"] if stroke else None,
            "matrix": self._matrix(),
        })

    def line(self, x1, y1, x2, y2):
        self.schritte.append({
            "art": "linie", "x1": round(x1, 6), "y1": round(y1, 6),
            "x2": round(x2, 6), "y2": round(y2, 6),
            "strich": farbe(self.zustand["strich"]),
            "linienbreite": self.zustand["linienbreite"],
            "strichmuster": self.zustand["strichmuster"],
            "matrix": self._matrix(),
        })

    def circle(self, x, y, r, stroke=1, fill=0):
        self.schritte.append({
            "art": "kreis", "x": round(x, 6), "y": round(y, 6), "r": round(r, 6),
            "fuell": farbe(self.zustand["fuell"]) if fill else None,
            "strich": farbe(self.zustand["strich"]) if stroke else None,
            "linienbreite": self.zustand["linienbreite"] if stroke else None,
            "matrix": self._matrix(),
        })

    def ellipse(self, x1, y1, x2, y2, stroke=1, fill=0):
        self.schritte.append({
            "art": "ellipse", "x1": round(x1, 6), "y1": round(y1, 6),
            "x2": round(x2, 6), "y2": round(y2, 6),
            "fuell": farbe(self.zustand["fuell"]) if fill else None,
            "strich": farbe(self.zustand["strich"]) if stroke else None,
            "matrix": self._matrix(),
        })

    def beginPath(self):
        return Pfad()

    def drawPath(self, p, stroke=1, fill=0):
        self.schritte.append({
            "art": "pfad", "schritte": [[round(v, 6) if isinstance(v, float) else v
                                         for v in s] for s in p.schritte],
            "fuell": farbe(self.zustand["fuell"]) if fill else None,
            "strich": farbe(self.zustand["strich"]) if stroke else None,
            "linienbreite": self.zustand["linienbreite"] if stroke else None,
            "matrix": self._matrix(),
        })

    def clipPath(self, p, stroke=0, fill=0):
        self.schritte.append({
            "art": "maske", "schritte": [[round(v, 6) if isinstance(v, float) else v
                                          for v in s] for s in p.schritte],
            "matrix": self._matrix(),
        })

    def linearGradient(self, x0, y0, x1, y1, farben, positions=None, extend=True):
        self.schritte.append({
            "art": "verlauf", "x0": round(x0, 6), "y0": round(y0, 6),
            "x1": round(x1, 6), "y1": round(y1, 6),
            "farben": [farbe(c) for c in farben],
            "stellen": list(positions) if positions else None,
            "matrix": self._matrix(),
        })

    def radialGradient(self, x, y, r, farben, positions=None, extend=True):
        self.schritte.append({
            "art": "radialverlauf", "x": round(x, 6), "y": round(y, 6),
            "r": round(r, 6), "farben": [farbe(c) for c in farben],
            "stellen": list(positions) if positions else None,
            "matrix": self._matrix(),
        })

    def drawImage(self, *a, **k):
        self.schritte.append({"art": "bild"})

    def transform(self, *a):
        self._mal(tuple(a))

    def setStrokeColorRGB(self, r, g, b):
        from reportlab.lib.colors import Color
        self.zustand["strich"] = Color(r, g, b)

    def __getattr__(self, name):
        raise AttributeError(
            f"Die aufzeichnende Leinwand kennt '{name}' nicht. Der Prototyp "
            f"benutzt einen Aufruf, der hier fehlt — er muesste ergaenzt "
            f"werden, sonst verschwindet, was er damit zeichnet.")


def lade(vorlage):
    """Importiert einen Prototyp, ohne ihn zu bauen.

    Zwei Eingriffe: die Schriften kommen aus assets/fonts/expose/ statt aus
    /home/claude/fonts/, und reportlab.pdfgen.canvas.Canvas wird durch die
    aufzeichnende Leinwand ersetzt. Der Modulrumpf laeuft sonst
    unveraendert — auch die Schriftregistrierung, damit sw() dieselben
    Breiten rechnet wie im Original.
    """
    import reportlab.graphics.renderPDF as rp
    import reportlab.pdfbase.ttfonts as tt
    import reportlab.pdfgen.canvas as cv

    echt = tt.TTFont
    ersetzt = {}

    # Ein Schnitt, den assets/fonts/expose/ nicht hat, wird durch den
    # naechstliegenden ersetzt — sonst laesst sich der Prototyp nicht
    # importieren. Welcher ersetzt wurde, steht hinterher in `ersetzt`, und
    # pruefe_ersatz() stellt sicher, dass kein aufgezeichneter Schritt ihn
    # benutzt. Ein stiller Ersatz waere genau der Fehler, den dieser Test
    # finden soll.
    ERSATZ = {
        "A-SemiCondBold": "Arch-Bold.ttf",   # wdth nicht messbar, nie gezeichnet
    }

    # Buehne nennt seine Dateien "B-Medium.ttf" und "S-Regular.ttf";
    # assets/fonts/expose/ fuehrt sie als Bric-* und DMS-*. ("S-" ist bei
    # Signature Cormorant — deshalb je Vorlage, nicht global.)
    DATEI_ALIAS = {"buehne": {"B-": "Bric-", "S-": "DMS-"}}.get(vorlage, {})

    def umgeleitet(name, pfad, **k):
        datei = os.path.basename(pfad)
        for kurz, lang in DATEI_ALIAS.items():
            if datei.startswith(kurz):
                datei = lang + datei[len(kurz):]
        voll = os.path.join(SCHRIFTEN, datei)
        if not os.path.exists(voll):
            ziel = ERSATZ.get(name)
            if ziel is None:
                raise FileNotFoundError(
                    f"{datei} fehlt in assets/fonts/expose/ und steht in "
                    f"keiner Ersatzliste. `python3 scripts/expose-schriften.py` "
                    f"ausfuehren, oder den Schnitt in ERSATZ eintragen.")
            ersetzt[name] = ziel
            voll = os.path.join(SCHRIFTEN, ziel)
        return echt(name, voll, **k)

    tt.TTFont = umgeleitet
    aufzeichnungen = []

    class Aufnahme(Leinwand):
        def __init__(self, pfad=None, pagesize=None, **k):
            super().__init__(None)
            self.pfad = pfad
            aufzeichnungen.append(self)

    echte_leinwand = cv.Canvas
    cv.Canvas = Aufnahme

    # Der QR-Code laeuft bei ReportLab durch renderPDF und zeichnet dort
    # Hunderte Einzelflaechen. Nachzubauen ist das sinnlos: der Renderer
    # hat dafuer ein eigenes Element. Aufgezeichnet wird deshalb ein
    # Schritt mit Ort, Groesse und Inhalt — das ist, was verglichen werden
    # kann und soll.
    echte_zeichnung = rp.draw

    def zeichnung(drawing, leinwand, x, y, showBoundary=False):
        inhalt = None
        for teil in getattr(drawing, "contents", []):
            wert = getattr(teil, "value", None)
            if wert is not None:
                inhalt = wert
                break
        leinwand.schritte.append({
            "art": "qr", "x": round(x, 6), "y": round(y, 6),
            "b": round(float(drawing.width), 6), "h": round(float(drawing.height), 6),
            "inhalt": inhalt, "matrix": leinwand._matrix(),
        })

    rp.draw = zeichnung

    pfad = os.path.join(PROTOTYPEN, DATEI[vorlage])
    spec = importlib.util.spec_from_file_location(f"proto_{vorlage}", pfad)
    modul = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(modul)
    finally:
        tt.TTFont = echt
        cv.Canvas = echte_leinwand
        # rp.draw bleibt umgeleitet: die Seiten werden erst NACH dem Import
        # gezeichnet. Der erste Anlauf hat es hier zurueckgesetzt — und dann
        # lief der QR-Code wieder durch das echte renderPDF.
    return modul, Aufnahme, aufzeichnungen, ersetzt


def seiten(vorlage):
    """Die Seiten eines Prototyps, jede als Liste von Zeichenschritten."""
    modul, Aufnahme, _, ersetzt = lade(vorlage)
    leinwand = Aufnahme()
    if hasattr(modul, "erzeuge"):
        # Buehne: kein PAGES/THEMES, sondern erzeuge(pfad, T, c=...) mit
        # einem Seitenplan aus den Daten. Mit uebergebener Leinwand speichert
        # es nicht, zeichnet aber jede Seite und ruft showPage().
        thema = modul.theme("#2D2A4A", "#F08A5D", "Indigo / Mandarine")
        modul.erzeuge(None, thema, c=leinwand)
    else:
        thema = modul.THEMES[0]
        for seite in modul.PAGES:
            seite(leinwand, thema)
            leinwand.showPage()
    # Kein Schritt darf einen ersetzten Schnitt benutzen.
    for nr, schritte in enumerate(leinwand.seiten, 1):
        for schritt in schritte:
            if schritt.get("art") == "text" and schritt.get("schnitt") in ersetzt:
                raise SystemExit(
                    f"[FEHLER] {vorlage}, Seite {nr}: zeichnet mit "
                    f"{schritt['schnitt']}, und dieser Schnitt liegt nicht in "
                    f"assets/fonts/expose/ — er wurde beim Import nur durch "
                    f"{ersetzt[schritt['schnitt']]} ersetzt, damit der "
                    f"Prototyp laedt. Die Aufzeichnung waere falsch. Der "
                    f"Schnitt muss erzeugt werden.")
    return {
        "vorlage": vorlage,
        "farben": {k: farbe(v) for k, v in thema.items()
                   if hasattr(v, "red")},
        "ersetzte_schnitte": ersetzt,
        # Die Demodaten des Prototyps. Der Vergleich braucht sie: ein Text,
        # der aus anderen Daten entsteht, ist nicht vergleichbar. Tupel
        # werden dabei zu Listen — das ist in JSON so.
        "daten": {k: v for k, v in modul.D.items()},
        "seiten": leinwand.seiten,
    }


def main():
    welche = sys.argv[1] if len(sys.argv) > 1 else "alle"
    if not os.path.isdir(PROTOTYPEN):
        print(json.dumps({"uebersprungen": "reference/expose-vorlagen/ fehlt"}))
        return 0
    try:
        import reportlab  # noqa: F401
    except ImportError:
        print(json.dumps({"uebersprungen": "reportlab fehlt"}))
        return 0
    namen = list(DATEI) if welche == "alle" else [welche]
    # Ein Prototyp, der nicht auf der Platte liegt, ist kein Fehler des
    # Renderers: reference/ ist nicht versioniert, und wer nur einen der
    # vier hat, soll den pruefen koennen.
    ergebnis = {}
    for n in namen:
        if not os.path.exists(os.path.join(PROTOTYPEN, DATEI[n])):
            ergebnis[n] = {"uebersprungen": f"{DATEI[n]} fehlt in reference/expose-vorlagen/"}
        else:
            ergebnis[n] = seiten(n)
    print(json.dumps(ergebnis))
    return 0


if __name__ == "__main__":
    sys.exit(main())
