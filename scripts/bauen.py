#!/usr/bin/env python3
"""Setzt aus src/ die eine Auslieferungsdatei dist/index.html zusammen.

Der Auftrag gibt den Aufbau vor: eine index.html, React 18 als UMD ueber CDN,
klassische Laufzeit, kein Modulsystem, kein Buendler. Genau deshalb kann das
Zusammensetzen ein Skript von hundert Zeilen sein und braucht keine
Werkzeugkette: es haengt Textstuecke in einer festen Reihenfolge aneinander.

Die Reihenfolge ist nicht frei. Sie stammt aus der Vorlage und ist dort
begruendet — die Bibliotheken muessen vor dem Anwendungsskript stehen, der
Fruehstart vor den Bibliotheken, der Service-Worker-Aufraeumer nach allem.
Wer sie aendert, aendert das Startverhalten.

Aufruf:
    python3 scripts/bauen.py            baut dist/index.html
    python3 scripts/bauen.py --pruefen  baut und vergleicht mit der Vorlage
"""
import hashlib, os, pathlib, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
SRC = WURZEL / 'src'
ZIEL = WURZEL / 'dist' / 'index.html'
VORLAGE = WURZEL / 'reference' / 'epworld-src.html'

# (Datei, Huelle) — Huelle ist None fuer HTML, sonst das umschliessende Tagpaar.
AUFBAU = [
    ('huelle/01-kopf.html',              None),
    ('start/01-fruehstart.js',           ('<script>', '</script>')),
    ('huelle/02-pwa-und-schriften.html', None),
    ('huelle/03-stil.css',               ('<style>', '</style>')),
    ('huelle/04-koerper.html',           None),
    ('huelle/05-bibliotheken.html',      None),
    ('start/02-nach-bibliotheken.js',    ('<script>', '</script>')),
    ('huelle/06-msal.html',              None),
    ('start/03-msal.js',                 ('<script>', '</script>')),
    ('huelle/07-babel-hinweis.html',     None),
    ('start/04-vorbereitung.js',         ('<script>', '</script>')),
    ('app/anwendung.js',                 ('<script>', '</script>')),
    ('huelle/08-sw-hinweis.html',        None),
    ('start/05-abschluss.js',            ('<script>', '</script>')),
    ('huelle/09-fuss.html',              None),
]

# Leerzeilen, die in der Vorlage zwischen den Stuecken stehen. Sie sind ohne
# Wirkung, aber ohne sie ist der Byte-Vergleich mit der Vorlage nicht moeglich —
# und der ist der einzige Nachweis, dass beim Zerlegen nichts verloren ging.
LEERZEILE_NACH = {'start/04-vorbereitung.js', 'app/anwendung.js'}


def bauen(quelle=None):
    quelle = quelle or SRC
    teile = []
    for datei, huelle in AUFBAU:
        pfad = quelle / datei
        if not pfad.exists():
            sys.exit(f'Fehlt: {pfad}')
        inhalt = pfad.read_text(encoding='utf-8')
        if inhalt.endswith('\n'):
            inhalt = inhalt[:-1]
        if huelle:
            auf, zu = huelle
            teile.append(f'{auf}\n{inhalt}\n{zu}')
        else:
            teile.append(inhalt)
        if datei in LEERZEILE_NACH:
            teile.append('')
    return '\n'.join(teile) + '\n'


# Die Zugangsdaten stehen NICHT im Quelltext. src/ traegt zwei leere
# Platzhalter; gefuellt werden sie hier, beim Bauen, aus der Umgebung. So
# taucht kein Schluessel im Repository auf, und derselbe Quellstand baut fuer
# verschiedene Projekte.
ZUGANG = ('IMMO_SUPABASE_URL', 'IMMO_SUPABASE_KEY')


def zugang_einsetzen(inhalt):
    gesetzt, fehlend = [], []
    for name in ZUGANG:
        wert = os.environ.get(name, '').strip()
        platzhalter = f'window.{name} = "";'
        if platzhalter not in inhalt:
            sys.exit(f'ABBRUCH: Platzhalter fuer {name} fehlt in src/huelle/01-kopf.html.')
        if wert:
            if '"' in wert or '\\' in wert:
                sys.exit(f'ABBRUCH: {name} enthaelt Anfuehrungszeichen oder Backslash.')
            inhalt = inhalt.replace(platzhalter, f'window.{name} = "{wert}";')
            gesetzt.append(name)
        else:
            fehlend.append(name)
    return inhalt, gesetzt, fehlend


# --- Nebenseiten ------------------------------------------------------------
# Die Anwendung ist nicht nur index.html: sie registriert sw.js, die
# Netlify-Umschreibung zeigt auf freigabe.html, und aus Exposés wird
# objekt.html und sonnenverlauf.html verlinkt. src/seiten/ entsteht aus
# scripts/nebenseiten.py; hier werden nur noch die Platzhalter gefuellt.
SEITEN = SRC / 'seiten'


def stand_von(inhalt):
    """Die Marke, unter der der Service Worker seinen Zwischenspeicher fuehrt.

    Aus dem Inhalt der ausgelieferten Datei, nicht aus der Uhr: der
    Zwischenspeicher soll genau dann wechseln, wenn sich etwas geaendert hat.
    Eine Zeitmarke wechselte auch bei einem unveraenderten Bau und zwaenge
    jedem Nutzer einen Neuladen auf, der nichts bringt.
    """
    return hashlib.sha256(inhalt.encode()).hexdigest()[:12]


def nebenseiten_ausliefern(stand):
    if not SEITEN.is_dir():
        print('HINWEIS: src/seiten/ fehlt — erst `npm run nebenseiten`. Die '
              'Auslieferung bestuende dann nur aus index.html; sw.js und die '
              'Kundenseiten fehlten.')
        return []
    url = os.environ.get('IMMO_SUPABASE_URL', '').strip()
    ref = url.split('//')[-1].split('.')[0] if url else ''
    geschrieben, offen = [], set()
    for p in sorted(SEITEN.iterdir()):
        if not p.is_file():
            continue
        inhalt = p.read_text(encoding='utf-8')
        for marke, wert in (('__IMMO_SUPABASE_URL__', url),
                            ('__IMMO_PROJEKT_REF__', ref),
                            ('__IMMO_STAND__', stand)):
            if marke in inhalt:
                if wert:
                    inhalt = inhalt.replace(marke, wert)
                else:
                    offen.add(marke)
        (ZIEL.parent / p.name).write_text(inhalt, encoding='utf-8')
        geschrieben.append((p.name, len(inhalt.encode())))
    if offen:
        print('HINWEIS: ' + ', '.join(sorted(offen)) + ' bleibt in den '
              'Nebenseiten stehen — IMMO_SUPABASE_URL ist nicht gesetzt.')
    return geschrieben


def main():
    quelle = None
    if '--aus' in sys.argv:
        quelle = pathlib.Path(sys.argv[sys.argv.index('--aus') + 1])
    inhalt = bauen(quelle)
    if '--roh' not in sys.argv and '--aus' not in sys.argv:
        inhalt, gesetzt, fehlend = zugang_einsetzen(inhalt)
        if gesetzt:
            print('Zugang aus der Umgebung gesetzt: ' + ', '.join(gesetzt))
        if fehlend:
            print('HINWEIS: ' + ', '.join(fehlend) + ' nicht gesetzt — die '
                  'gebaute Datei kann sich nicht anmelden. Zum Ausrollen die '
                  'Umgebungsvariablen setzen (siehe .env.example).')
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    ZIEL.write_text(inhalt, encoding='utf-8')
    print(f'{ZIEL.relative_to(WURZEL)}: {len(inhalt):,} Zeichen, '
          f'{inhalt.count(chr(10)):,} Zeilen')

    if '--roh' not in sys.argv and '--aus' not in sys.argv:
        for name, groesse in nebenseiten_ausliefern(stand_von(inhalt)):
            print(f'{(ZIEL.parent / name).relative_to(WURZEL)}: {groesse:,} B')

    if '--pruefen' in sys.argv:
        if not VORLAGE.exists():
            print('Vorlage nicht vorhanden — kein Vergleich moeglich. '
                  'Das ist in Ordnung: reference/ ist nicht versioniert.')
            return 0
        soll = VORLAGE.read_text(encoding='utf-8')
        a = hashlib.sha256(soll.encode()).hexdigest()
        b = hashlib.sha256(inhalt.encode()).hexdigest()
        if a == b:
            print(f'[ok] Byte-genau wie die Vorlage ({a[:16]}…)')
            return 0
        print(f'[FEHLER] Abweichung zur Vorlage.\n  Vorlage {a}\n  Bau     {b}')
        print(f'  Laenge: Vorlage {len(soll):,}, Bau {len(inhalt):,}')
        for i, (x, y) in enumerate(zip(soll.split('\n'), inhalt.split('\n')), 1):
            if x != y:
                print(f'  erste abweichende Zeile {i}:\n'
                      f'    Vorlage: {x[:100]!r}\n    Bau    : {y[:100]!r}')
                break
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
