#!/usr/bin/env python3
"""
Baut vorschau/index.html aus vorschau/vorlage.html neu.

Unterschied zu scripts/vorschau-bauen.py: Dieses Skript braucht die
Schriftdateien NICHT. Es uebernimmt die bereits eingebetteten
@font-face-Regeln aus der vorhandenen index.html. Das genuegt, solange nur
Text geaendert wird — der eingebettete Schnitt deckt das deutsche Alphabet,
Ziffern und die ueblichen Satzzeichen ab.

Kommen neue Zeichen hinzu (etwa × oder ein Gedankenstrich, den es bisher
nicht gab), meldet das Skript sie und bricht ab. Dann ist der vollstaendige
Bau mit scripts/vorschau-bauen.py und den Schriftdateien noetig.

Aufruf:  python3 scripts/vorschau-neu-bauen.py
"""
import pathlib
import re
import sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
VORSCHAU = WURZEL / "vorschau"

# Zeichen, die scripts/vorschau-bauen.py unabhaengig vom Text immer einbettet.
GRUNDMENGE = set(
    "0123456789.,€%²·–—+/()[]:;!?\"'&@#*"
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "äöüÄÖÜß"
)


def sichtbare_zeichen(html: str) -> set[str]:
    ohne_code = re.sub(r"<(style|script)[^>]*>.*?</\1>", " ", html, flags=re.S)
    sichtbar = re.sub(r"<[^>]+>", " ", ohne_code)
    return {z for z in sichtbar if z.isprintable()}


def main() -> int:
    vorlage = VORSCHAU / "vorlage.html"
    ziel = VORSCHAU / "index.html"

    if not vorlage.exists() or not ziel.exists():
        print("vorlage.html und eine vorhandene index.html werden benoetigt.", file=sys.stderr)
        return 1

    neu = vorlage.read_text(encoding="utf-8")
    alt = ziel.read_text(encoding="utf-8")

    abgedeckt = sichtbare_zeichen(alt) | GRUNDMENGE
    fehlend = sorted(sichtbare_zeichen(neu) - abgedeckt)
    if fehlend:
        print("Diese Zeichen sind im eingebetteten Schnitt nicht enthalten:", file=sys.stderr)
        print("  " + " ".join(f"{z} (U+{ord(z):04X})" for z in fehlend), file=sys.stderr)
        print("Vollstaendigen Bau mit scripts/vorschau-bauen.py ausfuehren.", file=sys.stderr)
        return 1

    regeln = re.findall(r"@font-face\{[^}]*\}", alt)
    if len(regeln) != 5:
        print(f"Erwartet werden 5 @font-face-Regeln, gefunden: {len(regeln)}", file=sys.stderr)
        return 1

    ziel.write_text(
        neu.replace("/* SCHRIFTEN_PLATZHALTER */", "\n".join(regeln)),
        encoding="utf-8",
    )
    print(f"{ziel.relative_to(WURZEL)}: {ziel.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
