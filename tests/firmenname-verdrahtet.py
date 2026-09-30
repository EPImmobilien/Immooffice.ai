#!/usr/bin/env python3
"""Steht irgendwo noch ein fest verdrahteter Firmenname im Quelltext?

WARUM ES DIESE PRUEFUNG GIBT — und warum das Neutralitaets-Gate sie nicht
ersetzt:

`scripts/neutral.sh` prueft, dass kein Kennzeichen des REFERENZUNTERNEHMENS
im Repository steht. Das tut es zuverlaessig. Was es nicht prueft — und auch
nicht pruefen kann, weil der Name dort auf der Erlaubnisliste steht —, ist
der Name des DEMO-MANDANTEN.

Die Neutralisierung hat naemlich nicht nur entfernt, sie hat auch ersetzt:
ueberall, wo die Vorlage ihren eigenen Firmennamen verdrahtet hatte, steht
jetzt der des Demo-Mandanten. Fuer das Gate ist das richtig. Fuer ein
mandantenfaehiges Produkt ist es derselbe Fehler in neuer Farbe: **ein fest
verdrahteter Firmenname ist bei jedem Mandanten ausser einem falsch.**

Und er ist nicht harmlos. Am 30.09.2026 stand er unter anderem

  - im Feld <anbieter><firma> des OpenImmo-ZIPs, das jedes Portal anzeigt,
  - im Muster-Widerrufsformular einer gesetzlichen Widerrufsbelehrung,
  - als Grussformel unter Mails an Kunden und Eigentuemer,
  - als Ueberschrift auf den Seiten der Akquise-Praesentation,
  - in den Systemvorgaben der KI, die Exposetexte schreibt.

WAS DIE PRUEFUNG NICHT LEISTET: sie zaehlt Vorkommen, nicht Wirkung. Ein Name
in einem Kommentar ist kein Fehler, einer in einer Grussformel schon. Sie ist
deshalb eine Buchfuehrung wie `tests/dienstschluessel-mandant.py`: jede
Funktion steht mit einer Zahl und einer Einstufung im Buch. Wird es mehr,
schlaegt sie an.
"""
import re
import sys
from collections import Counter
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
FUNKTIONEN = WURZEL / 'supabase' / 'functions'

# Der Name des Demo-Mandanten, wie ihn die Neutralisierung eingesetzt hat.
# Gesucht wird das Kennwort, nicht die ganze Firmierung: es gibt "Musterhaus
# Immobilien GmbH", "Musterhaus Immobilien", "Musterhaus-Stil" und
# "Lasse Musterhaus".
NAME = re.compile(r'Musterhaus')

# Das Buch. Funktion -> (Anzahl, Einstufung, Wirkung).
#
# KOMMENTAR   Steht nur in einem Kommentar oder einem Vermerk. Kein Fehler,
#             aber auch kein Gewinn — faellt weg, wenn die Stelle ohnehin
#             angefasst wird.
# HEURISTIK   Der Name wird zur ERKENNUNG benutzt, nicht zur Ausgabe (etwa
#             "steht meine Signatur schon in diesem Text?"). Falsch, aber
#             ohne Wirkung nach draussen: die Erkennung greift nur nicht.
# KI          Steht in einer Systemvorgabe fuer die KI. Wirkt indirekt: der
#             erzeugte Text kann den Namen uebernehmen.
# AUSGABE     Steht in etwas, das ein Kunde liest — Mail, PDF, Portal,
#             Webseite. Das ist die Klasse, die weg muss.
#
# Stand 30.09.2026, nach zwei Durchgaengen: von 107 Vorkommen sind 32 uebrig,
# und die Klasse AUSGABE — alles, was ein Kunde liest — steht auf NULL.
# Behoben unter anderem: das OpenImmo-Feld <firma>, die Widerrufsbelehrung
# des Energieausweis-Fragebogens, der Maklervertrag samt zeichnendem
# Vertreter, die neun Ueberschriften der Akquise-Praesentation und saemtliche
# Grussformeln. Der Weg dorthin ist der Helfer immoFirmenName(db, mandant),
# der ohne Eintrag einen LEEREN Text liefert — nie einen Beispielnamen.
BUCH = {
    # --- KI: wirkt ueber den erzeugten Text -------------------------------
    # Eine Systemvorgabe nennt das Haus, fuer das die KI schreibt. Mit einem
    # verdrahteten Namen schreibt sie fuer jeden Mandanten im Namen eines
    # fremden — und der Name kann in den erzeugten Text geraten.
    #
    # Der Umbau ist ein anderer als bei den Ausgaben: die Vorgabe muss den
    # Namen des Mandanten als Baustein bekommen, und dafuer braucht jede
    # dieser Funktionen den Mandanten an der Stelle, an der sie die Vorgabe
    # zusammensetzt. Das ist der naechste Block von Phase 2.4.
    'generate-text':           (14, 'KI', 'Systemvorgaben fuer Exposetexte und Beitraege'),
    'mail-ki-vorschlag':       (5, 'KI', 'Systemvorgabe nennt zusaetzlich einen erfundenen Geschaeftsfuehrer'),
    'claude-chat':             (2, 'KI', 'Systemvorgabe des Assistenten'),
    'akq-ki-vorlage':          (1, 'KI', 'Systemvorgabe fuer Akquisevorlagen'),
    'akq-mail-leads':          (1, 'KI', 'Systemvorgabe der Lead-Erkennung'),
    'bewerbertest-abgeben':    (1, 'KI', 'Systemvorgabe der Testbewertung'),
    'bewertung-aus-aufnahme':  (1, 'KI', 'Systemvorgabe der Bewertung'),
    'bild-beschriften':        (1, 'KI', 'Systemvorgabe der Bildunterschriften'),
    'expose-pruefen':          (1, 'KI', 'Systemvorgabe der Endkontrolle'),
    'mail-anfrage-verarbeiten': (1, 'KI', 'Systemvorgabe der Anfrage-Auslese'),
    'objekt-wissen-auslesen':  (1, 'KI', 'Systemvorgabe der Unterlagen-Auslese'),

    # --- HEURISTIK und KOMMENTAR ------------------------------------------
    'akq-automation-lauf':     (2, 'HEURISTIK', 'Signaturerkennung im Mailtext, dazu ein Team-Name'),
    'mail-senden':             (1, 'KOMMENTAR', 'Vermerk zur Signaturerkennung'),
}


def finde():
    """Vorkommen je Funktion."""
    gezaehlt = Counter()
    stellen = []
    for p in sorted(FUNKTIONEN.rglob('*.ts')):
        t = p.read_text(encoding='utf-8')
        for m in NAME.finditer(t):
            gezaehlt[p.parent.name] += 1
            stellen.append((p.parent.name, t.count('\n', 0, m.start()) + 1))
    return gezaehlt, stellen


def main():
    gezaehlt, stellen = finde()

    neu, gewachsen, weg = [], [], []
    for f, n in sorted(gezaehlt.items()):
        if f not in BUCH:
            neu.append((f, n))
        elif n > BUCH[f][0]:
            gewachsen.append((f, BUCH[f][0], n))
    for f in sorted(BUCH):
        if f not in gezaehlt:
            weg.append(f)

    print(f'  {len(stellen)} verdrahtete Firmennamen in {len(gezaehlt)} Funktionen:')
    for art in ('AUSGABE', 'KI', 'HEURISTIK', 'KOMMENTAR'):
        anzahl = sum(n for f, n in gezaehlt.items()
                     if f in BUCH and BUCH[f][1] == art)
        if anzahl:
            print(f'    {art:10s} {anzahl:3d}')

    if weg:
        print(f'\n  {len(weg)} Funktion(en) im Buch ohne Fundstelle — behoben, '
              f'also aus dem Buch nehmen:')
        for f in weg:
            print(f'    - {f}')

    fehler = False
    if neu:
        fehler = True
        print(f'\n  [FEHLER] {len(neu)} Funktion(en) stehen nicht im Buch:')
        for f, n in neu:
            print(f'    - {f} ({n}x)')
        print('    Ein Firmenname gehoert in firma_stammdaten, nicht in den '
              'Quelltext.\n    Wo er dort trotzdem stehen muss, braucht er '
              'einen Eintrag mit Grund.')
    if gewachsen:
        fehler = True
        print(f'\n  [FEHLER] {len(gewachsen)} Funktion(en) haben mehr Vorkommen als verbucht:')
        for f, war, ist in gewachsen:
            print(f'    - {f}: verbucht {war}, gefunden {ist}')

    ausgabe = sum(n for f, n in gezaehlt.items()
                  if f in BUCH and BUCH[f][1] == 'AUSGABE')
    if ausgabe:
        print(f'\n  NOCH OFFEN — {ausgabe} Vorkommen in etwas, das ein Kunde liest:')
        for f, n in sorted(gezaehlt.items()):
            if f in BUCH and BUCH[f][1] == 'AUSGABE':
                print(f'    {f} ({n}x): {BUCH[f][2]}')

    if not fehler:
        print('\n  [ok] Keine unverbuchte Stelle.')
    return 1 if fehler else 0


if __name__ == '__main__':
    sys.exit(main())
