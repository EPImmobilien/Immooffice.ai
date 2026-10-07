#!/usr/bin/env python3
"""Sucht Rufnummern im Quelltext — aber nur dort, wo eine steht.

Am 06.10.2026 stand eine echte Mobilnummer eines Mitarbeiters der Referenz
im Quelltext (`mail-ki-vorschlag`). Das Neutralitaets-Gate hat sie nicht
gefunden: auf seiner Blockliste stehen Firmennamen, und eine Nummer ist
kein Name. Sie steht dort jetzt — aber nur SIE. Die naechste faellt wieder
durch.

Ein allgemeines Muster fuer deutsche Rufnummern wurde am selben Tag
ausprobiert und verworfen: ueber siebzig Treffer in `src/` und
`supabase/functions/`, kein einziger echter. Es trifft Koordinaten,
Zeitstempel, Farbwerte, Versionsnummern und Pixelangaben. Ein Gate, das man
ignoriert, ist kein Gate.

Was den Unterschied macht, ist der UMKREIS. Eine Ziffernfolge ist nur dann
eine Rufnummer, wenn in ihrer Naehe steht, dass sie eine ist — `telefon`,
`mobil`, `fax`, `rufnummer`, `tel`. Damit sind es vier Treffer statt
siebzig, und alle vier sind erklaerbar:

    0171 1234567    Platzhalter in einem Eingabefeld ("z. B. …")
    040 000000      Beispielfirma des Vorlagen-Editors
    0170 0000000    dito, Ansprechpartner
    06.10.2026      ein Datum, zufaellig neben dem Wort "Telefon"

Fuer genau diese drei Arten gibt es Ausnahmen, und sie sind so eng
geschnitten, dass eine ECHTE Nummer sie nicht trifft: lauter gleiche
Ziffern, eine Zaehlfolge, ein Datum. Alles andere ist ein Befund.

Kommentarzeilen zaehlen mit. CLAUDE.md nennt den Kommentar ausdruecklich
unter dem, worin kein Kennzeichen der Referenz stehen darf — und die
gefundene Nummer stand in einer Anweisung an das Sprachmodell, also in
Prosa.
"""
import pathlib
import re
import sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent

BEREICHE = ['src', 'supabase/functions', 'supabase/eigene',
            'supabase/eigene-beilagen', 'website', 'packages', 'index.html']
ENDUNGEN = {'.js', '.ts', '.tsx', '.html', '.css', '.json', '.mjs'}

# Was eine Ziffernfolge zur Rufnummer erklaert. Innerhalb desselben
# Fensters, nicht irgendwo in der Datei: ein Wort zehn Zeilen weiter oben
# sagt nichts ueber diese Zahl.
SCHLUESSEL = re.compile(
    r'(tel\b|tel[:=]|telefon|telephon|mobil|rufnummer|handy|phone|'
    r'\bfax\b|\bfon\b|durchwahl)', re.I)
UMKREIS_VOR, UMKREIS_NACH = 60, 30

# Deutsche Schreibweisen: +49…, 0049…, oder die fuehrende Null.
NUMMER = re.compile(r'(?:\+49|0049|\b0)[\s./()-]*\d[\d\s./()-]{6,}\d')

# Ein Datum ist keine Rufnummer. tt.mm.jjjj und tt.mm.jj.
DATUM = re.compile(r'\b[0-3]?\d\.[01]?\d\.(\d{2}|\d{4})\b')


def ist_platzhalter(ziffern):
    """Lauter gleiche Ziffern oder eine Zaehlfolge — beides ist keine
    Nummer, die jemand anrufen kann.

    Geprueft wird der Teil HINTER der Vorwahl, denn `040 000000` hat eine
    echte Vorwahl und einen leeren Anschluss. Wo die Vorwahl aufhoert,
    weiss hier niemand; deshalb die laengste Endziffernfolge, die noch
    mindestens fuenf Stellen hat.
    """
    for ab in range(0, len(ziffern) - 4):
        rest = ziffern[ab:]
        if len(set(rest)) == 1:
            return True
        if all(ord(b) - ord(a) == 1 for a, b in zip(rest, rest[1:])):
            return True
        if all(ord(a) - ord(b) == 1 for a, b in zip(rest, rest[1:])):
            return True
    return False


# Nummern, die bleiben duerfen, mit Grund. Wer eine eintraegt, traegt sie
# hier mit Grund ein oder nimmt sie wieder heraus.
# Stand 07.10.2026: leer. Die Kontaktnummer des Betreibers im Impressum
# der Website steht nicht hier, sondern die ganze Datei website/konfig.js
# ist in AUSGENOMMEN — sie ist Konfiguration des Betreibers, kein Quelltext.
ERLAUBT = {
}

# Dateien, die keine Rufnummer der Vorlage tragen KOENNEN, weil sie die
# Pflichtangaben des Anbieters tragen: das Impressum der Website (§ 5 DDG).
# Dieselbe Ausnahme macht scripts/neutral.sh. Die Nummer selbst steht hier
# mit Absicht nicht — sie waere ein Treffer des Neutralitaets-Gates.
AUSGENOMMEN = {'website/konfig.js'}


def dateien():
    for b in BEREICHE:
        p = WURZEL / b
        if not p.exists():
            continue
        for f in ([p] if p.is_file() else sorted(p.rglob('*'))):
            if not f.is_file() or f.suffix not in ENDUNGEN:
                continue
            if 'node_modules' in str(f) or '__pycache__' in str(f):
                continue
            if str(f.relative_to(WURZEL)) in AUSGENOMMEN:
                continue
            yield f


def main():
    befunde, geprueft, entschuldigt = [], 0, 0
    for f in dateien():
        geprueft += 1
        try:
            text = f.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        for nr, zeile in enumerate(text.splitlines(), 1):
            for m in NUMMER.finditer(zeile):
                umkreis = zeile[max(0, m.start() - UMKREIS_VOR):
                                m.end() + UMKREIS_NACH]
                if not SCHLUESSEL.search(umkreis):
                    continue
                roh = m.group(0).strip()
                ziffern = re.sub(r'\D', '', roh)
                if DATUM.search(roh) or ist_platzhalter(ziffern):
                    entschuldigt += 1
                    continue
                if ziffern in ERLAUBT:
                    entschuldigt += 1
                    continue
                befunde.append((str(f.relative_to(WURZEL)), nr, roh,
                                zeile.strip()[:90]))

    if befunde:
        print(f'[FEHLER] {len(befunde)} Rufnummer(n) im Quelltext:\n')
        for datei, nr, roh, zeile in befunde[:20]:
            print(f'  {datei}:{nr}\n    {roh!r} in {zeile!r}')
        if len(befunde) > 20:
            print(f'  … und {len(befunde) - 20} weitere')
        print('\nEine Rufnummer gehoert in firma_stammdaten, nicht in den '
              'Quelltext.\nIst sie ein Platzhalter, soll sie wie einer '
              'aussehen (lauter Nullen).')
        return 1

    print(f'[ok] {geprueft} Dateien: keine erreichbare Rufnummer im Quelltext.')
    print(f'     {entschuldigt} Ziffernfolge(n) neben einem Telefon-Wort sind '
          f'Platzhalter oder Datum.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
