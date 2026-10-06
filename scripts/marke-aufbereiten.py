#!/usr/bin/env python3
"""Macht aus den gelieferten Druckdateien die Marken-Dateien des Produkts.

Geliefert wurden sechs Logo-Varianten als SVG und als CMYK-PDF
(`assets/marke/quelle/`, unveraendert, so wie sie aus der Gestaltung kamen).
Dieses Skript erzeugt daraus `assets/marke/` — das, was Anwendung, Website
und PDFs wirklich benutzen. Drei Dinge passieren dabei:

1. **Farben auf die Plattform-CI.** Die Lieferung traegt Blau #263159 und
   Gold #D4A567. Das sind genau die beiden Farben, die am 28.09.2026 als
   Kennzeichen des Referenzunternehmens entfernt worden sind
   (docs/ENTSCHEIDUNGEN.md, docs/NEUTRALITAET.md nennt Farbwerte
   ausdruecklich). Entscheidung des Auftraggebers vom 06.10.2026: die Form
   der Lieferung gilt, die Farben bleiben die der Plattform. Getauscht
   werden genau zwei Fuellwerte — an der Zeichnung aendert sich nichts.

2. **Die Bildmarke wird herausgeschnitten.** Haus und Netz-Motiv enden bei
   x=401, die Wortmarke beginnt bei x=438. Dazwischen liegt eine Luecke, in
   der kein einziger Punkt liegt. Geschnitten wird ueber den viewBox-
   Ausschnitt, nicht ueber die Pfaddaten: so bleibt die Zeichnung
   unangetastet und ein spaeterer Nachschnitt ist eine Zahl, kein Eingriff.

3. **Die Zahlen werden gekuerzt.** Die Lieferung schreibt jeden Punkt als
   "145.00,12.00"; nachgezeichnete Konturen haben Tausende davon. Ohne die
   bedeutungslosen Nullen ist dieselbe Zeichnung halb so gross. Das zaehlt,
   weil die Anwendung EINE index.html ist, in der die Marke mitfaehrt.

Aufruf:
    python3 scripts/marke-aufbereiten.py            SVGs erzeugen
    python3 scripts/marke-aufbereiten.py --pruefen  nur vergleichen (Gate)
    python3 scripts/marke-aufbereiten.py --icons    zusaetzlich die PNG-Icons
                                                    (braucht Chromium)
"""
import pathlib
import re
import subprocess
import sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
QUELLE = WURZEL / "assets" / "marke" / "quelle"
ZIEL = WURZEL / "assets" / "marke"
# Die Website wird getrennt ausgeliefert (website-ausliefern.yml) und kann
# nicht auf dist/ zugreifen. Sie bekommt deshalb ihre eigene Kopie — nicht
# alle Varianten, nur was sie zeigt.
WEBSITE = WURZEL / "website" / "marke"
FUER_WEBSITE = [
    "immooffice-logo.svg",          # Kopfzeile, heller Grund
    "immooffice-logo-invers.svg",   # Fusszeile, dunkler Grund
    "immooffice-haus.svg",          # Favicon
]

# Lieferung -> Plattform-CI (CLAUDE.md, "Branding fixiert").
FARBEN = {
    "#263159": "#1B2A47",   # Marineblau
    "#D4A567": "#B5934F",   # Gold
}

# Gelieferter Name -> Name im Produkt, Zweck.
VARIANTEN = [
    ("ImmoOffice_Blau_Gold",          "immooffice-logo",            "fuer helle Untergruende"),
    ("ImmoOffice_Weiss_Gold",         "immooffice-logo-invers",     "fuer dunkle Untergruende"),
    ("ImmoOffice_Weiss",              "immooffice-logo-weiss",      "einfarbig weiss"),
    ("ImmoOffice_Schwarz",            "immooffice-logo-schwarz",    "einfarbig schwarz, Fax und Graustufendruck"),
    ("ImmoOffice_Navy_Hintergrund",   "immooffice-logo-auf-navy",   "mit eigener Flaeche, dunkel"),
    ("ImmoOffice_Weisser_Hintergrund", "immooffice-logo-auf-weiss", "mit eigener Flaeche, hell"),
]

# Bildmarke: Haus und Netz ohne Wortmarke.
# Gemessen, nicht geschaetzt: Bildmarke x 12..401 / y 12..272, Wortmarke ab
# x 438. Der Schnitt liegt in der Luecke.
BILDMARKE = {"x": 12, "y": 12, "b": 389, "h": 260, "luft": 1.08}

# Nur das Haus, ohne das Netz-Motiv. Gemessen: x 12..276, y 12..249.
# Wofuer: unter etwa 48 px wird das Netz zu Matsch — drei Ringe, drei
# Leitungen und ein Fensterkreuz auf 32 Pixeln ergeben einen Fleck. Das
# Haus allein bleibt dort eine Form, die man wiedererkennt. Darum bekommen
# die kleinen Icons das Haus und die grossen die ganze Bildmarke.
HAUS = {"x": 12, "y": 12, "b": 264, "h": 237, "luft": 1.10}
KLEIN_BIS = 48

ICONS = [
    ("favicon-16.png", 16), ("favicon-32.png", 32),
    ("apple-touch-icon.png", 180), ("apple-touch-icon-ipad.png", 167),
    ("apple-touch-icon-ipad-old.png", 152), ("apple-touch-icon-iphone.png", 120),
]


def faerben(svg: str) -> str:
    for alt, neu in FARBEN.items():
        svg = re.sub(re.escape(alt), neu, svg, flags=re.IGNORECASE)
    return svg


def kuerzen(svg: str) -> str:
    """Bedeutungslose Stellen weg — an der Zeichnung aendert das nichts."""
    def pfad(m):
        d = m.group(1)
        d = re.sub(r"(\d)\.0+(?=\D|$)", r"\1", d)          # 12.00 -> 12
        d = re.sub(r"(\.\d*[1-9])0+(?=\D|$)", r"\1", d)    # 1.250 -> 1.25
        d = d.replace(",", " ").replace(" L", "L").replace(" Z", "Z")
        return f'd="{d}"'
    return re.sub(r'd="([^"]+)"', pfad, svg)


def kopf_setzen(svg: str, titel: str, viewbox: str | None = None,
                breite: str | None = None, hoehe: str | None = None) -> str:
    """Macht aus dem nackten <svg> eines mit Titel und Rolle.

    Ohne role und aria-label liest ein Screenreader ein Logo als "Grafik"
    oder gar nicht vor. Der Titel steht zusaetzlich im Element, weil
    manche Leser ihn dem Attribut vorziehen.
    """
    def ersetzen(m):
        kopf = m.group(0)
        if viewbox:
            kopf = re.sub(r'viewBox="[^"]*"', f'viewBox="{viewbox}"', kopf)
        for name, wert in (("width", breite), ("height", hoehe)):
            if wert is None:
                continue
            kopf = (re.sub(rf'{name}="[^"]*"', f'{name}="{wert}"', kopf)
                    if f'{name}="' in kopf else kopf[:-1] + f' {name}="{wert}">')
        kopf = kopf[:-1] + f' role="img" aria-label="{titel}">'
        return kopf + f"<title>{titel}</title>"
    return re.sub(r"<svg[^>]*>", ersetzen, svg, count=1)


def ausschnitt(svg: str, titel: str, mass: dict) -> str:
    """Quadratischer Ausschnitt; was daneben liegt, faellt aus dem viewBox."""
    seite = max(mass["b"], mass["h"]) * mass["luft"]
    mx = mass["x"] + mass["b"] / 2
    my = mass["y"] + mass["h"] / 2
    vb = f"{mx - seite / 2:.1f} {my - seite / 2:.1f} {seite:.0f} {seite:.0f}"
    return kopf_setzen(svg, titel, viewbox=vb, breite="64", hoehe="64")


def ohne_netz(svg: str) -> str:
    """Laesst den goldenen Pfad weg — uebrig bleibt das Haus."""
    return re.sub(r'<path fill="' + re.escape(FARBEN["#D4A567"]) + r'"[^>]*?/>',
                  "", svg, flags=re.IGNORECASE | re.S)


def erzeugen() -> dict[str, str]:
    dateien = {}
    for gel, name, _zweck in VARIANTEN:
        roh = (QUELLE / f"{gel}.svg").read_text(encoding="utf-8")
        svg = kuerzen(faerben(roh))
        dateien[f"{name}.svg"] = kopf_setzen(svg, "ImmoOffice.Ai") + "\n"
    hell = kuerzen(faerben((QUELLE / "ImmoOffice_Blau_Gold.svg").read_text(encoding="utf-8")))
    dunkel = kuerzen(faerben((QUELLE / "ImmoOffice_Weiss_Gold.svg").read_text(encoding="utf-8")))
    dateien["immooffice-bildmarke.svg"] = ausschnitt(hell, "ImmoOffice.Ai", BILDMARKE) + "\n"
    dateien["immooffice-bildmarke-invers.svg"] = ausschnitt(dunkel, "ImmoOffice.Ai", BILDMARKE) + "\n"
    dateien["immooffice-haus.svg"] = ausschnitt(ohne_netz(hell), "ImmoOffice.Ai", HAUS) + "\n"
    dateien["immooffice-haus-invers.svg"] = ausschnitt(ohne_netz(dunkel), "ImmoOffice.Ai", HAUS) + "\n"
    return dateien


def icons_bauen() -> int:
    """Rastert die Bildmarke zu den Icons, die die Huelle anfordert.

    Auf Marineblau und nicht durchsichtig: Apple legt durchsichtige
    Touch-Icons schwarz hinterlegt ab, und ein schwarzes Quadrat ist
    kein Logo. Gerastert wird mit Chromium — einmalig, das Ergebnis
    liegt als Datei im Repository. Kein Bauschritt haengt davon ab.
    """
    import json
    ziel = WURZEL / "assets" / "marke" / "icons"
    ziel.mkdir(parents=True, exist_ok=True)
    gross = (ZIEL / "immooffice-bildmarke-invers.svg").read_text(encoding="utf-8")
    klein = (ZIEL / "immooffice-haus-invers.svg").read_text(encoding="utf-8")
    auftrag = {"grund": FARBEN["#263159"], "ziel": str(ziel),
               "icons": [[n, g, klein if g <= KLEIN_BIS else gross]
                         for n, g in ICONS]}
    skript = WURZEL / "scripts" / "marke-icons.mjs"
    erg = subprocess.run(["node", str(skript)], input=json.dumps(auftrag),
                         text=True, capture_output=True)
    sys.stdout.write(erg.stdout)
    if erg.returncode != 0:
        sys.stderr.write(erg.stderr)
    return erg.returncode


def main() -> int:
    if not QUELLE.is_dir():
        print(f"[FEHLER] {QUELLE.relative_to(WURZEL)} fehlt.")
        return 1
    dateien = erzeugen()
    pruefen = "--pruefen" in sys.argv

    abweichend = []
    WEBSITE.mkdir(parents=True, exist_ok=True)
    for name, inhalt in sorted(dateien.items()):
        orte = [ZIEL / name]
        if name in FUER_WEBSITE:
            orte.append(WEBSITE / name)
        for pfad in orte:
            vorher = pfad.read_text(encoding="utf-8") if pfad.exists() else None
            if vorher == inhalt:
                continue
            abweichend.append(str(pfad.relative_to(WURZEL)))
            if not pruefen:
                pfad.write_text(inhalt, encoding="utf-8")

    if pruefen:
        if abweichend:
            print("[FEHLER] assets/marke/ weicht von der Quelle ab: "
                  + ", ".join(abweichend))
            print("         python3 scripts/marke-aufbereiten.py")
            return 1
        print(f"[ok] {len(dateien)} Marken-Dateien stimmen mit der Lieferung "
              f"ueberein (Farben auf Plattform-CI).")
        return 0

    for name, inhalt in sorted(dateien.items()):
        roh = len((QUELLE / "ImmoOffice_Blau_Gold.svg").read_text(encoding="utf-8"))
        print(f"  {name:36s} {len(inhalt):7,d} B")
    print(f"{len(dateien)} Dateien in assets/marke/ "
          f"({'unveraendert' if not abweichend else str(len(abweichend)) + ' neu'}).")

    if "--icons" in sys.argv:
        return icons_bauen()
    return 0


if __name__ == "__main__":
    sys.exit(main())
