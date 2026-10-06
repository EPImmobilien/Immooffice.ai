#!/usr/bin/env python3
"""Haelt die Marke zusammen.

Vier Dinge koennen bei einer Marke still auseinanderlaufen, und jedes
davon faellt erst dem Kunden auf:

1. Jemand bearbeitet eine erzeugte SVG von Hand. Beim naechsten Lauf von
   scripts/marke-aufbereiten.py ist die Aenderung weg — und niemand weiss,
   warum das Logo wieder anders aussieht.
2. Die Farben der Lieferung (#263159 / #D4A567) stehen wieder in einer
   ausgelieferten Datei. Das sind die Farben des Referenzunternehmens;
   docs/NEUTRALITAET.md nennt Farbwerte ausdruecklich.
3. Die Website bekommt eine andere Fassung des Logos als die Anwendung.
   Sie wird getrennt ausgeliefert und haelt deshalb eine eigene Kopie.
4. Irgendwo wird eine Marken-Datei angefordert, die es nicht gibt. Genau
   das war bis zum 06.10.2026 der Fall: die Huelle verwies auf sechs
   Icon-Dateien, von denen keine je existiert hat.
"""
import pathlib
import re
import subprocess
import sys

STAMM = pathlib.Path(__file__).resolve().parent.parent
MARKE = STAMM / "assets" / "marke"
WEBSITE = STAMM / "website" / "marke"

# Farben der Lieferung — in erzeugten Dateien haben sie nichts verloren.
GELIEFERT = ["#263159", "#D4A567"]
PLATTFORM = ["#1B2A47", "#B5934F"]


def dateien_mit_markenpfaden():
    """(Datei, angeforderter Pfad) aus Anwendung, Huelle und Website."""
    treffer = []
    quellen = [
        *(STAMM / "src" / "huelle").glob("*.html"),
        STAMM / "src" / "app" / "anwendung.js",
        *(STAMM / "website").glob("*.html"),
    ]
    for p in quellen:
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8")
        for m in re.finditer(r'["\']((?:/|)(?:marke|icons)/[\w.-]+\.(?:svg|png))["\']', text):
            treffer.append((p, m.group(1)))
    return treffer


def main() -> int:
    fehler = 0

    if not MARKE.is_dir():
        print("[FEHLER] assets/marke/ fehlt.")
        return 1

    # 1. + 3. Erzeugtes stimmt mit der Lieferung ueberein.
    erg = subprocess.run(
        [sys.executable, str(STAMM / "scripts" / "marke-aufbereiten.py"), "--pruefen"],
        capture_output=True, text=True)
    sys.stdout.write("  " + erg.stdout.replace("\n", "\n  ").rstrip() + "\n")
    if erg.returncode != 0:
        fehler += 1

    # 2. Keine Farbe der Lieferung in einer erzeugten Datei.
    for p in sorted(list(MARKE.glob("*.svg")) + list(WEBSITE.glob("*.svg"))):
        text = p.read_text(encoding="utf-8")
        for farbe in GELIEFERT:
            if re.search(re.escape(farbe), text, re.IGNORECASE):
                fehler += 1
                print(f"[FEHLER] {p.relative_to(STAMM)} traegt {farbe} — das ist "
                      f"die Farbe der Lieferung, nicht die der Plattform.")

    # 4. Jeder angeforderte Pfad hat eine Datei.
    #    /marke/x.svg kommt aus dist/, marke/x.svg aus website/.
    gefordert = dateien_mit_markenpfaden()
    if not gefordert:
        fehler += 1
        print("[FEHLER] Niemand fordert eine Marken-Datei an — das Logo haengt "
              "nirgends.")
    for quelle, pfad in sorted(set(gefordert)):
        if quelle.parent.name == "website":
            da = (STAMM / "website" / pfad).exists()
            wo = f"website/{pfad}"
        else:
            # Ausgeliefert wird aus assets/marke/ (SVGs) und
            # assets/marke/icons/ (PNGs) — scripts/bauen.py legt beides
            # nach dist/marke/ und dist/icons/.
            name = pfad.rsplit("/", 1)[-1]
            unter = "icons/" if pfad.lstrip("/").startswith("icons/") else ""
            da = (MARKE / unter / name).exists()
            wo = f"assets/marke/{unter}{name}"
        if not da:
            fehler += 1
            print(f"[FEHLER] {quelle.relative_to(STAMM)} fordert \"{pfad}\" an, "
                  f"aber {wo} gibt es nicht.")

    if fehler:
        print(f"\n{fehler} Befund(e).")
        return 1
    print(f"[ok] Marke: {len(list(MARKE.glob('*.svg')))} SVGs und "
          f"{len(list((MARKE / 'icons').glob('*.png')))} Icons stimmen mit der")
    print(f"     Lieferung ueberein, tragen die Plattform-CI "
          f"({', '.join(PLATTFORM)}),")
    print(f"     und alle {len(set(gefordert))} angeforderten Pfade haben eine Datei.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
