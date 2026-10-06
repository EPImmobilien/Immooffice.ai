#!/usr/bin/env python3
"""Kein Rückfall auf eine Adresse, die niemandem gehört.

`immooffice.example` ist nach RFC 2606 eine reservierte Platzhalter-Domain.
Als **Ersatz** für die Domain des Referenzunternehmens ist sie richtig — sie
führt bewusst nirgendwohin, und genau das soll ein neutralisierter Name tun.

Als **Rückfall** hinter einer fehlenden Angabe ist sie falsch:

    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || "info@immooffice.example";

Fehlt die Variable, geht die Mail trotzdem hinaus — mit einem Absender, den
es nicht gibt, und einem Link, der ins Leere führt. Niemand merkt es: es
sieht aus wie Betrieb. `docs/OFFEN.md` hat das benannt und gleich das
Richtige gesagt: *„Ein Rückfall auf eine Adresse, die niemandem gehört, ist
schlechter als keiner … Richtig wäre: ohne Absenderadresse nicht senden und
das protokollieren."*

Seit dem 06.10.2026 steht an diesen Stellen `immoFehlt(...)`. Dieser Test
hält das fest. Er prüft dreierlei:

1. Kein `|| "...immooffice.example..."` mehr — in keiner Edge Function.
2. Wer `immoFehlt()` ruft, hat es auch. Eine Datei, die den Aufruf enthält
   und die Funktion nicht, lädt gar nicht erst — und das fiele erst beim
   ersten Aufruf auf, also beim Kunden.
3. Jede Variable, die `immoFehlt()` namentlich verlangt, steht in
   `.env.example` und in `docs/SECRETS.md`. Eine Pflichtangabe, die
   nirgends dokumentiert ist, kann niemand setzen.
"""
import pathlib
import re
import sys

STAMM = pathlib.Path(__file__).resolve().parent.parent
FUNKTIONEN = STAMM / "supabase" / "functions"
EIGENE = STAMM / "supabase" / "eigene"

# Stellen, an denen die Platzhalter-Domain als Rückfall bleiben DARF, mit
# Grund. Ohne Begründung steht hier nichts.
ERLAUBT = {
    # Die Message-ID braucht irgendeinen Domainteil. Sie ist technisch, nie
    # sichtbar, und ohne Postfachadresse kommt die Funktion ohnehin nicht
    # bis hierher — die Prüfung darauf steht weiter oben.
    ("mail-senden", 'split("@")[1] || "immooffice.example"'),
}


def rueckfaelle(text: str):
    """Findet `|| "…immooffice.example…"` — den Rückfall, nicht den Ersatz.

    Geliefert wird die ganze ZEILE: die Ausnahmeliste unten erkennt einen
    Fall an seinem Umfeld, nicht am Rückfall allein — `|| "immooffice.example"`
    sieht überall gleich aus.
    """
    treffer = []
    for zeile in text.split("\n"):
        if re.search(r'\|\|\s*"[^"]*immooffice\.example[^"]*"', zeile):
            treffer.append(zeile.strip())
    return treffer


def main() -> int:
    fehler = 0
    gefunden = 0
    verlangt = set()

    dateien = sorted(list(FUNKTIONEN.rglob("*.ts")) + list(EIGENE.rglob("*.ts")))
    if not dateien:
        print("[FEHLER] Keine Edge Functions gefunden.")
        return 1

    for pfad in dateien:
        text = pfad.read_text(encoding="utf-8")
        funktion = pfad.relative_to(pfad.parents[1]).parts[0] \
            if len(pfad.relative_to(FUNKTIONEN if FUNKTIONEN in pfad.parents else EIGENE).parts) > 1 \
            else pfad.stem

        # 1. Kein Rückfall auf die Platzhalter-Domain.
        for treffer in rueckfaelle(text):
            if any(name in str(pfad) and muster in treffer
                   for name, muster in ERLAUBT):
                continue
            fehler += 1
            print(f"[FEHLER] {pfad.relative_to(STAMM)}: Rueckfall auf eine "
                  f"Adresse, die niemandem gehoert —\n         {treffer.strip()}\n"
                  f"         Richtig: || immoFehlt(\"<was fehlt>\"). Siehe "
                  f"docs/OFFEN.md.")

        # 2. Wer ruft, hat auch.
        if "immoFehlt(" in text:
            gefunden += 1
            if "function immoFehlt" not in text:
                fehler += 1
                print(f"[FEHLER] {pfad.relative_to(STAMM)} ruft immoFehlt(), "
                      f"definiert es aber nicht. Die Datei laedt nicht — und "
                      f"das faellt erst beim ersten Aufruf auf.")
            for m in re.finditer(r'immoFehlt\("([A-Z][A-Z0-9_]+)"\)', text):
                verlangt.add(m.group(1))

    # 3. Jede namentlich verlangte Variable ist dokumentiert.
    beispiel = (STAMM / ".env.example")
    geheimnisse = (STAMM / "docs" / "SECRETS.md")
    beispieltext = beispiel.read_text(encoding="utf-8") if beispiel.exists() else ""
    geheimtext = geheimnisse.read_text(encoding="utf-8") if geheimnisse.exists() else ""
    for name in sorted(verlangt):
        if not re.search(rf"^{name}=", beispieltext, re.M):
            fehler += 1
            print(f"[FEHLER] {name} wird als Pflichtangabe verlangt, steht "
                  f"aber nicht in .env.example.")
        if name not in geheimtext:
            fehler += 1
            print(f"[FEHLER] {name} wird als Pflichtangabe verlangt, steht "
                  f"aber nicht in docs/SECRETS.md.")

    if fehler:
        print(f"\n{fehler} Befund(e).")
        return 1
    print(f"[ok] Kein Rueckfall auf eine Adresse, die niemandem gehoert.")
    print(f"     {gefunden} Dateien verweigern den Versand, statt ins Leere zu "
          f"senden;")
    print(f"     die {len(verlangt)} namentlich verlangten Variablen "
          f"({', '.join(sorted(verlangt))})")
    print(f"     stehen in .env.example und docs/SECRETS.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
