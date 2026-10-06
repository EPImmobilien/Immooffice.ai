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
5. Eine Farbe der Referenz steht wieder im ausgelieferten Quelltext. Punkt 2
   sieht nur die SVGs; bis zum 06.10.2026 standen die Vorgabefarben noch an
   392 weiteren Stellen — in der Anwendung, in den Nebenseiten, in
   Mailvorlagen und in den PDF-Erzeugern. Gesucht wird in allen fuenf
   Schreibweisen, die scripts/farben.py kennt, und anders als das
   Neutralitaets-Gate ueberliest dieser Test auch Kommentarzeilen nicht:
   CLAUDE.md nennt den Kommentar ausdruecklich.
"""
import pathlib
import re
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
import farben  # scripts/farben.py — dieselbe Palette, die die Erzeuger tauschen

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

    # 5. Keine Farbe der Referenz im ausgelieferten Quelltext.
    #    Die unversionierten und die erzeugenden Dateien sind aus: die
    #    Erzeuger MUESSEN die alten Werte nennen, um sie zu ersetzen.
    AUS = {
        "scripts/farben.py",
        "scripts/marke-aufbereiten.py",
        "scripts/neutralisieren-funktionen.py",
        "scripts/oberflaeche-zerlegen.py",
        "tests/marke.py",
        # Eine angewendete Migration ist ein Protokoll, keine Arbeitsdatei.
        # Die beiden Vorgaben darin sind seit fork_58 ueberschrieben, und
        # dass sie es BLEIBEN, prueft tests/vorlage-vollstaendig.sql am
        # laufenden Schema — dort, wo es zaehlt.
        "supabase/migrations/20260915000100_vorlage_tabellen.sql",
    }
    # Die Lieferung selbst. assets/marke/quelle/ ist der unveraenderte Stand
    # des Gestalters, und er traegt die Farben der Lieferung — genau deshalb
    # faerbt scripts/marke-aufbereiten.py sie um. Ausgeliefert wird nichts
    # davon: scripts/bauen.py nimmt assets/marke/*.svg und
    # assets/marke/icons/*.png. Dass das Erzeugte sauber ist, prueft Punkt 2.
    AUS_ORDNER = ("assets/marke/quelle/", "assets/marke/README.md")
    ENDUNGEN = {".js", ".ts", ".tsx", ".html", ".css", ".json", ".mjs",
                ".sql", ".py", ".md", ".toml", ".yml", ".svg"}
    BEREICHE = ["src", "supabase", "website", "packages", "scripts", "tests",
                "assets", "index.html", "netlify.toml"]
    gefunden = []
    for bereich in BEREICHE:
        wurzel = STAMM / bereich
        if not wurzel.exists():
            continue
        kandidaten = [wurzel] if wurzel.is_file() else sorted(wurzel.rglob("*"))
        for p in kandidaten:
            if not p.is_file() or p.suffix not in ENDUNGEN:
                continue
            rel = str(p.relative_to(STAMM))
            if (rel in AUS or rel.startswith(AUS_ORDNER)
                    or "node_modules" in rel or "__pycache__" in rel):
                continue
            try:
                text = p.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            for muster, _, bemerkung in farben.REGELN:
                for m in muster.finditer(text):
                    zeile = text.count("\n", 0, m.start()) + 1
                    gefunden.append((rel, zeile, bemerkung, m.group(0)))
    for rel, zeile, bemerkung, text in gefunden[:20]:
        print(f"[FEHLER] {rel}:{zeile} traegt {text!r} — {bemerkung}.")
    if len(gefunden) > 20:
        print(f"[FEHLER] ... und {len(gefunden) - 20} weitere.")
    fehler += len(gefunden)

    if fehler:
        print(f"\n{fehler} Befund(e).")
        return 1
    print(f"[ok] Marke: {len(list(MARKE.glob('*.svg')))} SVGs und "
          f"{len(list((MARKE / 'icons').glob('*.png')))} Icons stimmen mit der")
    print(f"     Lieferung ueberein, tragen die Plattform-CI "
          f"({', '.join(PLATTFORM)}),")
    print(f"     und alle {len(set(gefordert))} angeforderten Pfade haben eine Datei.")
    print(f"     Keine Farbe der Referenz in {len(BEREICHE)} Bereichen des "
          f"Quelltextes — {len(farben.REGELN)} Muster ueber alle fuenf Schreibweisen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
