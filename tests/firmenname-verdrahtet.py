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
OBERFLAECHE = WURZEL / 'src'

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
# Stand 30.09.2026: **leer**. Von 107 Vorkommen ist keines uebrig; das Buch
# ist damit vom Verzeichnis offener Stellen zur Schranke geworden. Kommt ein
# verdrahteter Firmenname zurueck, schlaegt die Pruefung an, und wer ihn
# braucht, muss ihn hier mit Grund eintragen.
#
# Behoben wurden unter anderem: das OpenImmo-Feld <firma>, das jedes Portal
# anzeigt; die Widerrufsbelehrung des Energieausweis-Fragebogens; der
# Maklervertrag samt zeichnendem Vertreter; neun Ueberschriften der
# Akquise-Praesentation; saemtliche Grussformeln; und die Systemvorgaben der
# KI — darunter eine, die die KI als erfundenen Geschaeftsfuehrer schreiben
# und unter dessen Namen unterzeichnen liess.
#
# Der Weg dorthin ist der Helfer immoFirmenName(db, mandant). Er liefert
# ohne Eintrag einen LEEREN Text — nie einen Beispielnamen. Wo der Name die
# Aufgabe gar nicht formt (JSON aus einer Mail ziehen, einen Test bewerten),
# ist er ersatzlos entfallen.
BUCH: dict[str, tuple[int, str, str]] = {}


# ---------------------------------------------------------------------------
# DAS ZWEITE BUCH: die Oberflaeche (src/)
#
# Die Pruefung oben sieht nur supabase/functions/. Am 03.10.2026 ist
# aufgefallen, dass src/app/anwendung.js dieselbe Klasse 99-mal trug — und
# zwar nicht nur in Kommentaren: in Kalendereinladungen, PDF-Fusszeilen,
# Grussformeln unter Mails, Portaltexten, die Eigentuemer lesen, und in der
# Widerrufsbelehrung nach § 356 BGB.
#
# 71 davon sind behoben. Der Weg ist immoMarke() beziehungsweise
# immoMarkeMit() (scripts/oberflaeche-zerlegen.py, Liste WOERTLICH) — und wie
# immoFirmenName in den Edge Functions liefert er ohne Eintrag LEER. Auf den
# beiden OEFFENTLICHEN Seiten (Signatur, Bewerbertest) gibt es kein
# window.IMMO_MARKE; dort kommt der Name mit der Antwort der Edge Function
# (immoSigFirma, immoBwFirma).
#
# Was hier steht, ist der Rest. Jede Zeile ist ein Suchtext, der im Quelltext
# vorkommen DARF, mit Zahl und Grund. Kommt etwas dazu, das nicht gebucht
# ist, schlaegt die Pruefung an.
BUCH_OBERFLAECHE: list[tuple[str, int, str, str]] = [
    # (Suchtext, Anzahl, Einstufung, Grund)
    ('name: "Musterhaus Immobilien GmbH"', 2, 'BEISPIELDATEN',
     'Die drei Standorte des Demo-Mandanten als Beispieldatensatz. Sie sind '
     'kein Ausgabetext, sondern Inhalt — und der Demo-Mandant darf seinen '
     'eigenen Namen tragen.'),
    ('firma: "Musterhaus Immobilien GmbH"', 1, 'BEISPIELDATEN', 'dieselbe Stelle'),
    ('name: "Musterhaus Immobilien GmbH Beispielstadt"', 1, 'BEISPIELDATEN', 'dieselbe Stelle'),
    ('firma: "Musterhaus Immobilien Beispielstadt GmbH"', 1, 'BEISPIELDATEN', 'dieselbe Stelle'),
    ('name: "Musterhaus Immobilien GmbH Berlin"', 1, 'BEISPIELDATEN', 'dieselbe Stelle'),
    ('firma: "Musterhaus Immobilien GmbH Berlin GmbH"', 1, 'BEISPIELDATEN', 'dieselbe Stelle'),
    ('name: "Musterhaus Immobilien Beispielstadt GmbH"', 1, 'BEISPIELDATEN', 'dieselbe Stelle'),
    ('name: "Musterhaus Immobilien GmbH Berlin GmbH"', 1, 'BEISPIELDATEN', 'dieselbe Stelle'),
    ('Musterstadt \u2013 Musterhaus Immobilien GmbH', 2, 'BEISPIELDATEN',
     'Auswahlliste der drei Standorte, zweimal im Quelltext. Sie zeigt den '
     'Bestand des Mandanten, nicht einen verdrahteten Namen.'),
    ('Beispielstadt \u2013 Musterhaus Immobilien Beispielstadt GmbH', 2, 'BEISPIELDATEN', 'dieselbe Liste'),
    ('Berlin \u2013 Musterhaus Immobilien GmbH Berlin GmbH', 2, 'BEISPIELDATEN', 'dieselbe Liste'),

    ('"Immobilien", "Musterhaus", "Partner"', 1, 'HEURISTIK',
     'Wortliste der Namenserkennung im Texterkenner. Der Name wird GESUCHT, '
     'nicht ausgegeben. Falsch, aber ohne Wirkung nach draussen: die '
     'Erkennung greift nur nicht.'),
    ('"Kleinanzeigen", "Musterhaus", "ImmoOffice"', 1, 'HEURISTIK',
     'Wortliste der Rechtschreibhilfe. Dasselbe.'),

    ('"z. B. Musterhaus Immobilien GmbH"', 1, 'PLATZHALTER',
     'Platzhalter eines leeren Eingabefeldes. Er wird nie mitgesendet und '
     'nie gedruckt — er steht da, solange das Feld leer ist.'),
    ('"z. B. Musterhaus Immobilien GmbH Beispielstadt"', 1, 'PLATZHALTER', 'dieselbe Art'),
    ('"\\nMusterhaus Immobilien GmbH"', 1, 'PLATZHALTER',
     'Platzhalter des Signaturfeldes — er zeigt, wie eine Signatur aussieht.'),
    ('"z.B. Abwesenheitsnotiz \u2014 Musterhaus Immobilien GmbH"', 1, 'PLATZHALTER', 'dieselbe Art'),
    ('"z. B. Ihr Anliegen bei Musterhaus Immobilien"', 1, 'PLATZHALTER', 'dieselbe Art'),
    ('"Name, z. B. Musterhaus Immobilien GmbH"', 1, 'PLATZHALTER', 'dieselbe Art'),

    ('"001 | Musterhaus Immobilien GmbH"', 1, 'ABLAGEPFAD',
     'Name eines Ordners im angebundenen Dateispeicher, und daneben die '
     'Beschriftung, die ihn nennt. Ein Pfad ist kein Text: ihn zu aendern '
     'verschiebt Dateien, die schon dort liegen. Das ist eine Umstellung mit '
     'Datenwanderung, keine Neutralisierung — siehe docs/OFFEN.md.'),
    ('\u201e001 | Musterhaus Immobilien GmbH\u201c', 1, 'ABLAGEPFAD', 'die Beschriftung dazu'),
    ('`Musterhaus-Eigentuemer/', 2, 'ABLAGEPFAD',
     'Zielordner der Eigentuemer-Unterlagen im angebundenen Dateispeicher. '
     'Dasselbe: eine Umstellung mit Datenwanderung.'),

    ('Musterdorf, Musterhausen', 2, 'ORTSNAME',
     'Kein Firmenname, sondern ein ORT im Platzhalter der Ortssuche. Die '
     'Suche nach "Musterhaus" trifft ihn mit — wer hier aufraeumt, muss ihn '
     'stehen lassen. Zweimal: einmal in der Anwendung, einmal in '
     'src/seiten/objekt.html.'),
]


def finde_oberflaeche():
    """Vorkommen in src/, und welche davon gebucht sind."""
    gefunden = 0
    gedeckt = 0
    unbekannt = []
    nicht_mehr = []
    for p in sorted(OBERFLAECHE.rglob('*')):
        if not p.is_file() or p.suffix not in ('.js', '.html', '.css'):
            continue
        txt = p.read_text(encoding='utf-8')
        gefunden += len(NAME.findall(txt))
    for suche, soll, _art, _grund in BUCH_OBERFLAECHE:
        ist = 0
        for p in sorted(OBERFLAECHE.rglob('*')):
            if not p.is_file() or p.suffix not in ('.js', '.html', '.css'):
                continue
            ist += p.read_text(encoding='utf-8').count(suche)
        gedeckt += len(NAME.findall(suche)) * ist
        if ist == 0:
            nicht_mehr.append(suche)
        elif ist > soll:
            unbekannt.append((suche, soll, ist))
    return gefunden, gedeckt, unbekannt, nicht_mehr


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

    # --- Teil 2: die Oberflaeche --------------------------------------
    ober_gefunden, ober_gedeckt, ober_mehr, ober_weg = finde_oberflaeche()
    print(f'\n  src/: {ober_gefunden} Vorkommen, {ober_gedeckt} gebucht.')
    for art in ('BEISPIELDATEN', 'PLATZHALTER', 'HEURISTIK', 'ABLAGEPFAD', 'ORTSNAME'):
        n = sum(a for _s, a, k, _g in BUCH_OBERFLAECHE if k == art)
        if n:
            print(f'    {art:14s} {n:3d}')

    if ober_weg:
        print(f'\n  {len(ober_weg)} Eintrag/Eintraege im Buch ohne Fundstelle — '
              f'behoben, also aus dem Buch nehmen:')
        for s in ober_weg:
            print(f'    - {s[:70]}')

    if ober_mehr:
        fehler = True
        print(f'\n  [FEHLER] {len(ober_mehr)} Eintrag/Eintraege kommen oefter vor als verbucht:')
        for s, soll, ist in ober_mehr:
            print(f'    - {s[:60]}: verbucht {soll}, gefunden {ist}')

    if ober_gefunden > ober_gedeckt:
        fehler = True
        print(f'\n  [FEHLER] {ober_gefunden - ober_gedeckt} Vorkommen in src/ '
              f'stehen in keinem Eintrag des Buches.')
        print('    Ein Firmenname gehoert in firma_stammdaten, nicht in den '
              'Quelltext. Der Weg\n    ist immoMarke() beziehungsweise '
              'immoMarkeMit() — auf den oeffentlichen\n    Seiten '
              'immoSigFirma()/immoBwFirma(), weil es dort kein Konto gibt.\n'
              '    Wo der Name trotzdem stehen muss, braucht er hier einen '
              'Eintrag mit Grund.')

    if not fehler:
        print('\n  [ok] Keine unverbuchte Stelle.')
    return 1 if fehler else 0


if __name__ == '__main__':
    sys.exit(main())
