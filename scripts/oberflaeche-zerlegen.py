#!/usr/bin/env python3
"""Zerlegt die Oberflaeche der Vorlage in src/ und neutralisiert sie dabei.

Eingabe:  reference/epworld-src.html   (nicht versioniert, 5,2 MB, eine Datei)
Ausgabe:  src/huelle/, src/start/, src/app/   (versioniert)

Warum zerlegen: der Auftrag verlangt eine index.html als Auslieferung, nicht
als Arbeitsstand. Eine Datei mit 15.778 Zeilen laesst sich nicht sinnvoll
aendern, nicht besprechen und nicht pruefen. scripts/bauen.py setzt die Stuecke
wieder zusammen.

Die Grenzen sind nicht erfunden, sondern die Tag-Grenzen der Vorlage: jedes
<script> und <style> wird zu einer Datei, der HTML-Rahmen dazwischen ebenso.
Deshalb ist der Rueckbau byte-genau nachweisbar — `scripts/bauen.py --pruefen`
vergleicht mit der Vorlage. Dieser Nachweis ist der Grund fuer den Zuschnitt;
eine feinere Gliederung nach Modulen kommt erst, wenn der Quelltext der drei
vorkompilierten Abschnitte vorliegt (siehe docs/OFFEN.md).

Die Ersetzungen wiederholen absichtlich einen Teil dessen, was
scripts/neutralisieren-funktionen.py fuer die Edge Functions tut. Zusammenlegen
waere weniger Text, aber mehr Kopplung: die beiden Skripte laufen unabhaengig,
und dass ihre Ergebnisse zusammenpassen, prueft ohnehin das Gate.

Aufruf:
    python3 scripts/oberflaeche-zerlegen.py           zerlegen und neutralisieren
    python3 scripts/oberflaeche-zerlegen.py --roh DIR nur zerlegen, nach DIR
"""
import pathlib, re, shutil, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
VORLAGE = WURZEL / 'reference' / 'epworld-src.html'
ZIEL = WURZEL / 'src'

HOST = 'immooffice.example'

# Die Stuecke: Datei -> (erste Zeile, letzte Zeile) in der Vorlage, 1-basiert,
# jeweils OHNE das umschliessende <script>/<style>-Tag. scripts/bauen.py setzt
# die Tags wieder. Die Zeilennummern gelten fuer den Stand vom 26.09.2026; sie
# werden beim Lauf gegen die Tags geprueft, damit eine neue Vorlage nicht still
# falsch zerlegt wird.
STUECKE = {
    'huelle/01-kopf.html':              (1, 6),
    'start/01-fruehstart.js':           (8, 103),
    'huelle/02-pwa-und-schriften.html': (105, 133),
    'huelle/03-stil.css':               (135, 268),
    'huelle/04-koerper.html':           (270, 284),
    'huelle/05-bibliotheken.html':      (285, 297),
    'start/02-nach-bibliotheken.js':    (299, 313),
    'huelle/06-msal.html':              (315, 315),
    'start/03-msal.js':                 (317, 322),
    'huelle/07-babel-hinweis.html':     (324, 336),
    'start/04-vorbereitung.js':         (338, 373),
    'app/anwendung.js':                 (377, 15755),
    'huelle/08-sw-hinweis.html':        (15758, 15761),
    'start/05-abschluss.js':            (15763, 15774),
    'huelle/09-fuss.html':              (15776, 15778),
}

# Zeilen, die vor bzw. nach einem Stueck ein Tag tragen muessen. Stimmt das
# nicht, ist die Vorlage eine andere als die, fuer die STUECKE geschrieben ist.
TAGS = {
    'start/01-fruehstart.js':        ('<script>', '</script>'),
    'huelle/03-stil.css':            ('<style>', '</style>'),
    'start/02-nach-bibliotheken.js': ('<script>', '</script>'),
    'start/03-msal.js':              ('<script>', '</script>'),
    'start/04-vorbereitung.js':      ('<script>', '</script>'),
    'app/anwendung.js':              ('<script>', '</script>'),
    'start/05-abschluss.js':         ('<script>', '</script>'),
}

# ---------------------------------------------------------------- Ersetzungen
# (Grund, Muster, Ersatz, Bemerkung) — Muster ist ein regulaerer Ausdruck.
ERSETZUNGEN = [
    # --- MARKE: ein Personenname im Bezeichner. Muss vor der Wortmarken-Regel
    # stehen, sonst bleibt "Lasse" allein stehen.
    ('MARKE', r'moveLasseEngferLeft', 'moveNamenszeileLinks',
     'Funktionsname mit dem Namen des Geschaeftsfuehrers der Referenz.'),

    # --- MARKE: Adressen und Domains
    ('MARKE', r'https://epworld\.netlify\.app', f'https://{HOST}',
     'Portal-Adresse der Referenz.'),
    ('MARKE', r'https://(www\.)?engferundpartner\.(de|com)', f'https://{HOST}',
     'Webauftritt der Referenz.'),
    ('MARKE', r'@engferundpartner\.(de|com)\b', f'@{HOST}', 'Maildomain der Referenz.'),
    ('MARKE', r'engferundpartner\.(de|com)', HOST, 'Domain der Referenz im Fliesstext.'),

    # --- MARKE: Firmenname in allen Schreibweisen
    ('MARKE', r'ENGFER\s*&(amp;)?\s*PARTNER\s+IMMOBILIEN', 'MUSTERHAUS IMMOBILIEN',
     'Firmenname in Versalien.'),
    ('MARKE', r'Engfer\s*&amp;\s*Partner\s+Immobilien', 'Musterhaus Immobilien GmbH',
     'Firmenname HTML-maskiert.'),
    ('MARKE', r'Engfer\s*&\s*Partner\s+Immobilien', 'Musterhaus Immobilien GmbH',
     'Firmenname im Klartext.'),
    ('MARKE', r'Engfer\s*&amp;\s*Partner', 'Musterhaus Immobilien',
     'Firmenname ohne Zusatz, HTML-maskiert.'),
    ('MARKE', r'Engfer\s*&\s*Partner', 'Musterhaus Immobilien', 'Firmenname ohne Zusatz.'),
    ('MARKE', r'\bENGFER\b', 'MUSTERHAUS', 'Wortmarke in Versalien.'),
    ('MARKE', r'\bE&P\s*World\b', 'ImmoOffice', 'Produktname der Referenz.'),
    ('MARKE', r'\bE&amp;P\s*World\b', 'ImmoOffice', 'Produktname HTML-maskiert.'),
    ('MARKE', r'\bE&P\s*Portal\b', 'ImmoOffice', 'Name der Anwendung in den PWA-Angaben.'),
    ('MARKE', r'\bE&P\s*Immobilien\b', 'Musterhaus Immobilien GmbH', 'Firmenname kurz.'),
    ('MARKE', r'\bE&amp;P\b', 'ImmoOffice', 'Kuerzel HTML-maskiert, Restfaelle.'),
    ('MARKE', r'\bepworld\b', 'immooffice', 'Produktname klein geschrieben.'),
    ('MARKE', r'\bEngfer\b', 'Musterhaus', 'Nachname der Referenz, Restfaelle.'),
    ('MARKE', r'\bengfer\b', 'musterhaus', 'wie oben, klein geschrieben.'),

    # --- MARKE: Anschrift der Referenz
    ('MARKE', r'Am V(ö|oe)genteich 26 ?[rR]', '', 'Bueroanschrift der Referenz.'),
    ('MARKE', r'V(ö|oe)genteich', '', 'Strassenname der Referenz, Restfaelle.'),

    # --- FREMD: Zugangsdaten. Die Vorlage traegt Projekt-Adresse und
    # anon-Schluessel im Klartext im Auslieferungsstand. Der Schluessel ist
    # zwar oeffentlich, aber es ist der FREMDE — er gehoert weder ins
    # Repository noch in einen Fork, der auf ein anderes Projekt zeigt. Beides
    # kommt jetzt aus zwei globalen Werten, die huelle/01-kopf.html setzt.
    ('FREMD',
     r'createClient\("https://[a-z]+\.supabase\.co","eyJ[A-Za-z0-9._-]+",',
     'createClient(window.IMMO_SUPABASE_URL, window.IMMO_SUPABASE_KEY,',
     'Anlegen des Supabase-Zugangs ohne verdrahtete Zugangsdaten.'),
    ('FREMD',
     r"var sb = 'https://[a-z]+\.supabase\.co'",
     'var sb = window.IMMO_SUPABASE_URL',
     'Projekt-Adresse im Fehlermelder des Fruehstarts.'),
    ('FREMD',
     r"'apikey': 'eyJ[A-Za-z0-9._-]+'",
     "'apikey': window.IMMO_SUPABASE_KEY",
     'Schluessel im Fehlermelder des Fruehstarts.'),

    # --- FREMD: Verweise auf das Supabase-Projekt der Vorlage
    ('FREMD', r'yazwkzzjiquprtjpurur', 'usguiggfciavwzkdfjgt',
     'Projektkennung der Vorlage durch die eigene ersetzt.'),

    # --- MARKE: gepinnte CDN-Versionen. Die Vorlage laesst vier Bibliotheken
    # offen. Sie hat sich daran am 17.06.2026 einen Totalausfall geholt — eine
    # neue Babel-Version wechselte still die Standard-Laufzeit, und die App
    # startete nicht mehr. Der Kommentar dazu steht in huelle/07. React und
    # react-dom werden hier festgenagelt; fuer supabase-js und tesseract.js
    # fehlt die Gegenprobe, weil diese Umgebung die CDNs nicht erreicht —
    # vermerkt in docs/OFFEN.md.
    ('MARKE', r'react@18/umd', 'react@18.3.1/umd', 'React auf 18.3.1 gepinnt.'),
    ('MARKE', r'react-dom@18/umd', 'react-dom@18.3.1/umd', 'React-DOM auf 18.3.1 gepinnt.'),
]


# Die Zugangsdaten stehen in der Vorlage im Auslieferungsstand. Im Fork setzt
# sie die Auslieferung — beim Bauen aus Umgebungsvariablen, nicht im Quelltext.
# Die Platzhalter sind absichtlich leer und nicht etwa mit dem eigenen Projekt
# vorbelegt: ein leerer Wert faellt beim ersten Start auf, ein falscher nicht.
KONFIGURATION = """<script>
  // Von der Auslieferung zu setzen (scripts/bauen.py, Umgebungsvariablen
  // IMMO_SUPABASE_URL und IMMO_SUPABASE_KEY). Leer heisst: nicht gesetzt.
  window.IMMO_SUPABASE_URL = "";
  window.IMMO_SUPABASE_KEY = "";
</script>
"""


def pruefe_haeufigkeit(n, bemerkung, datei):
    """Notbremse gegen Regeln, die versehentlich zu breit greifen."""
    if n > 400:
        sys.exit(f'ABBRUCH: Regel "{bemerkung}" trifft in {datei} {n}-mal zu. '
                 'Das ist zu oft, um beabsichtigt zu sein.')


def main():
    if not VORLAGE.is_dir() and not VORLAGE.is_file():
        sys.exit(f'Nicht gefunden: {VORLAGE}\n'
                 'Die Oberflaeche der Vorlage gehoert unversioniert nach reference/.')

    roh = '--roh' in sys.argv
    ziel = pathlib.Path(sys.argv[sys.argv.index('--roh') + 1]) if roh else ZIEL

    z = VORLAGE.read_text(encoding='utf-8').split('\n')

    # Zuschnitt gegen die Vorlage pruefen, bevor irgendetwas geschrieben wird.
    for datei, (auf, zu) in TAGS.items():
        a, b = STUECKE[datei]
        if z[a - 2].strip() != auf or z[b].strip() != zu:
            sys.exit(f'ABBRUCH: {datei} soll von {auf}/{zu} umschlossen sein, '
                     f'Zeile {a-1} ist {z[a-2].strip()[:40]!r} und '
                     f'Zeile {b+1} ist {z[b].strip()[:40]!r}.\n'
                     'Die Vorlage hat einen anderen Aufbau als STUECKE beschreibt.')

    if ziel.exists():
        shutil.rmtree(ziel)

    zaehler = {}
    for datei, (a, b) in STUECKE.items():
        inhalt = '\n'.join(z[a - 1:b]) + '\n'
        if not roh:
            for grund, muster, ersatz, bemerkung in ERSETZUNGEN:
                inhalt, n = re.subn(muster, ersatz, inhalt)
                pruefe_haeufigkeit(n, bemerkung, datei)
                if n:
                    zaehler[(grund, muster)] = zaehler.get((grund, muster), 0) + n
            if datei == 'huelle/01-kopf.html':
                inhalt += KONFIGURATION
        p = ziel / datei
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(inhalt, encoding='utf-8')

    if roh:
        print(f'{len(STUECKE)} Stuecke unveraendert nach {ziel}')
        return 0

    print('Neutralisierung der Oberflaeche:')
    for grund, muster, _, bemerkung in ERSETZUNGEN:
        n = zaehler.get((grund, muster), 0)
        if n:
            print(f'  [{grund:5s}] {n:4d}x  {bemerkung}')
    nie = [b for g, m, _, b in ERSETZUNGEN if not zaehler.get((g, m))]
    if nie:
        print(f'\n  {len(nie)} Regel(n) ohne Treffer:')
        for b in nie:
            print(f'    - {b}')
    print(f'\n{len(STUECKE)} Stuecke geschrieben nach {ziel}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
