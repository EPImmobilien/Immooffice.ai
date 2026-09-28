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
import pathlib, re, shutil, subprocess, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
VORLAGE = WURZEL / 'reference' / 'epworld-src.html'
ZIEL = WURZEL / 'src'

HOST = 'immooffice.example'

# Ein einzelner Backslash. Als Name lesbarer als drei Anfuehrungszeichen tief
# verschachtelte Maskierung.
BS = chr(92)

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
    ('MARKE', r'vertreten durch Lasse Engfer', 'vertreten durch {geschaeftsfuehrer}',
     'Name in den Textbausteinen, die aus den Word-Vorlagen herausgefiltert '
     'werden.'),
    ('MARKE', r'(Genehmigung durch|wird) Lasse Engfer', r'\1 die Geschaeftsfuehrung',
     'Name im Hinweistext der Urlaubsverwaltung. Die Rolle statt der Person — '
     'inhaltlich dasselbe, ohne Kennzeichen.'),
    ('MARKE', r'"Lasse Engfer"', '"{geschaeftsfuehrer}"',
     'Name des Geschaeftsfuehrers als Vorgabewert und als Suchbegriff in den '
     'Word-Vorlagen. Ein Platzhalter statt eines leeren Werts: die Suche darf '
     'weiterhin ins Leere laufen, nicht auf Position 0 treffen.'),
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
    # Achtung: KEINE fuehrende Wortgrenze \b bei den folgenden Regeln. Die
    # Treffer stehen oft direkt hinter einem maskierten \n in einer
    # JS-Zeichenkette; dessen 'n' ist ein Wortzeichen, und \b greift dann
    # nicht. Die Muster sind auch ohne Wortgrenze eindeutig genug.
    ('MARKE', r'ENGFER\b', 'MUSTERHAUS', 'Wortmarke in Versalien.'),
    ('MARKE', r'E&P[- ]?World\b', 'ImmoOffice',
     'Produktname der Referenz, auch mit Bindestrich geschrieben.'),
    ('MARKE', r'E&amp;P\s*World\b', 'ImmoOffice', 'Produktname HTML-maskiert.'),
    ('MARKE', r'E&P\s*Portal\b', 'ImmoOffice', 'Name der Anwendung in den PWA-Angaben.'),
    ('MARKE', r'E&P\s*Immobilien\b', 'Musterhaus Immobilien GmbH', 'Firmenname kurz.'),
    ('MARKE', r'E&amp;P\b', 'ImmoOffice', 'Kuerzel HTML-maskiert, Restfaelle.'),
    ('MARKE', r'epworld\b', 'immooffice', 'Produktname klein geschrieben.'),
    ('MARKE', r'Engfer\b', 'Musterhaus', 'Nachname der Referenz, Restfaelle.'),
    ('MARKE', r'engfer\b', 'musterhaus', 'wie oben, klein geschrieben.'),
    ('MARKE', r'https://www\.instagram\.com/engfer_und_partner_immo/', '{instagram}',
     'Instagram-Adresse der Referenz in der Mail-Signatur. Der Platzhalter '
     'folgt der Schreibweise, die die Signatur ohnehin benutzt ({absender_name}).'),
    ('MARKE', r'engfer_', 'immooffice_',
     'Dateinamen-Vorsatz der Referenz bei Marketing-Ausgaben.'),
    ('MARKE', r'@engferundpartner\\\.\(de\|com\)', f'@{HOST.replace(".", chr(92)+chr(92)+".")}',
     'Maildomain der Referenz innerhalb eines regulaeren Ausdrucks — dort ist '
     'der Punkt maskiert, deshalb greift die Regel weiter oben nicht.'),
    ('MARKE', r'"e&p immobilien", "e und p immobilien", ', '',
     'Eigennamen der Referenz in der Kontenzuordnung der Liquiditaetsplanung.'),
    ('MARKE', r', "ep immobilien"', '', 'wie oben'),
    ('MARKE', r'EPWorldApp', 'ImmoOfficeApp',
     'Kennung der iOS-Huelle im User-Agent.'),
    # Zuletzt, damit die Regeln oben ihre genaueren Faelle zuerst bekommen.
    ('MARKE', r'E&P\b', 'ImmoOffice', 'Kuerzel der Referenz, Restfaelle.'),

    ('MARKE', r'"DE74100101236085969429"', '"DE02120300000000202051"',
     'IBAN der Referenz als Beispiel im Bankfeld — ersetzt durch die offizielle '
     'Test-IBAN der Deutschen Bundesbank, die keinem Konto gehoert.'),

    ('MARKE', r'Musterhaus Immobilien GmbH GmbH', 'Musterhaus Immobilien GmbH',
     'doppeltes GmbH, wo im Original schon eines stand.'),

    # --- MARKE: Anschrift der Referenz
    ('MARKE', r'Am V(ö|oe)genteich 26 ?[rR]', '', 'Bueroanschrift der Referenz.'),
    ('MARKE', r'V(ö|oe)genteich', '', 'Strassenname der Referenz, Restfaelle.'),

    # --- MARKE: eingebettete Dateien. Sie stehen als Base64 im Quelltext und
    # sind fuer das Neutralitaets-Gate unsichtbar — es liest Text, nicht Bilder.
    # Vier Logos der Referenz in zwei Bloecken, zweimal dieselbe Wortmarke in
    # anderer Groesse. Die Konstanten bleiben stehen und werden leer: der Code
    # prueft sie ohnehin auf Inhalt, und laut docs/NEUTRALITAET.md tritt bei
    # fehlendem Logo eine Wortmarke aus dem Firmennamen an seine Stelle.
    ('MARKE',
     r'(\b(?:LOGO_BLAU|LOGO_DUNKEL|LOGO_ECHT|LOGO_HELL|EP_LOGO_DATAURL|'
     r'EP_LOGO2_DATAURL)\s*=\s*)"data:image/[a-z+]+;base64,[A-Za-z0-9+/=]+"',
     r'\1""',
     'Logos der Referenz als Base64 — geleert.'),

    # --- MARKE: die beiden Word-Vorlagen der Referenz, ebenfalls Base64.
    # Sie tragen Briefkopf und Vertragstext der Referenz. docs/NEUTRALITAET.md
    # Abschnitt 5 ist eindeutig: Rechtstexte der Referenz werden ERSETZT, nicht
    # uebernommen. Ersetzen kann dieses Skript sie nicht — eine gueltige
    # Word-Datei laesst sich nicht als Ersetzungsregel schreiben. Also geleert;
    # die Vertragserzeugung steht damit still, bis neutrale Muster vorliegen.
    # Vermerkt in docs/OFFEN.md.
    ('MARKE',
     r'(\b(?:VORLAGE_MAKLERVERTRAG|VORLAGE_OBJEKTNACHWEIS)\s*=\s*)"[A-Za-z0-9+/=]{500,}"',
     r'\1""',
     'Word-Vorlagen der Referenz als Base64 — geleert.'),

    # --- FREMD: Zugangsdaten. Die Vorlage traegt Projekt-Adresse und
    # anon-Schluessel im Klartext im Auslieferungsstand. Der Schluessel ist
    # zwar oeffentlich, aber es ist der FREMDE — er gehoert weder ins
    # Repository noch in einen Fork, der auf ein anderes Projekt zeigt. Beides
    # kommt jetzt aus zwei globalen Werten, die huelle/01-kopf.html setzt.
    ('FREMD',
     r'createClient\(\s*"https://[a-z]+\.supabase\.co"\s*,\s*"eyJ[A-Za-z0-9._-]+"\s*,',
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


def ist_vorkompiliert(zeile):
    """Erkennt eine Zeile, die aus einem Kompilat stammt.

    Zwei Merkmale zusammen, nicht einzeln: sehr lang UND voller Bezeichner aus
    einem einzigen Buchstaben. Lang allein trifft auch eingebettete Blobs,
    kurze Namen allein auch handgeschriebene Schleifen.
    """
    return len(zeile) > 2000 and len(re.findall(r'[({,]\s*[a-z]\s*[:,)=]', zeile)) > 5


def ausformatieren(inhalt, datei):
    """Bricht vorkompilierte Zeilen um, ohne ein Zeichen Logik zu aendern.

    Die Vorlage liefert 2,97 MB Anwendungscode in drei Zeilen, die groesste mit
    2,4 MB. Darin ist nichts zu finden, nichts zu aendern und nichts zu pruefen.
    js-beautify setzt nur Zeilenumbrueche und Einrueckungen.

    Dass wirklich nur Leerraum angefasst wurde, wird nachgerechnet: entfernt man
    aus beiden Fassungen jeden Leerraum, muessen sie zeichengleich sein. Waere
    irgendwo ein Zeichen Programmtext verlorengegangen, hinzugekommen oder
    vertauscht worden, fiele das hier auf.
    """
    zeilen = inhalt.split('\n')
    treffer = [i for i, z in enumerate(zeilen) if ist_vorkompiliert(z)]
    if not treffer:
        return inhalt, 0

    werkzeug = WURZEL / 'node_modules' / '.bin' / 'js-beautify'
    if not werkzeug.exists():
        sys.exit(f'{werkzeug} fehlt. Einmal `npm install` ausfuehren — '
                 'js-beautify steht in den devDependencies.')

    for i in treffer:
        roh = zeilen[i]
        fertig = subprocess.run(
            [str(werkzeug), '--indent-size', '2', '-f', '-'],
            input=roh, capture_output=True, text=True, check=True).stdout.rstrip('\n')
        ohne = lambda s: re.sub(r'\s+', '', s)
        if ohne(roh) != ohne(fertig):
            sys.exit(f'ABBRUCH: Beim Umbrechen von {datei}, Zeile {i+1}, hat sich '
                     'mehr als Leerraum geaendert. Ergebnis verworfen.')
        zeilen[i] = fertig
    return '\n'.join(zeilen), len(treffer)


def signatur_neutralisieren(inhalt):
    """Ersetzt den Geschaeftsbriefkopf in der Mail-Signatur durch Platzhalter.

    Die Signatur traegt Handelsregister, Anschrift, Geschaeftsfuehrer und
    Telefonnummer der Referenz. Einzelne Ersetzungen lassen ein Flickwerk
    zurueck, deshalb wird der Block als Ganzes getauscht — in derselben
    Schreibweise, die die Signatur ohnehin benutzt ({absender_name}). Gefuellt
    wird er aus firma_stammdaten; das ist Phase 2.4.

    Bewusst keine Regel mit regulaerem Ausdruck: die Zeichenkette enthaelt
    maskierte Zeilenumbrueche (Backslash + n), und die richtig zu maskieren ist
    eine Fehlerquelle ohne Gewinn. Ein Textfund ist hier eindeutig.
    """
    anfang = inhalt.find('const EP_SIGNATUR = "')
    if anfang < 0:
        return inhalt, 0
    nach_rolle = inhalt.find('{absender_rolle}' + BS + 'n' + BS + 'n', anfang)
    trenner = inhalt.find(BS + 'n---' + BS + 'n', anfang)
    if nach_rolle < 0 or trenner < 0 or trenner < nach_rolle:
        sys.exit('ABBRUCH: EP_SIGNATUR hat einen anderen Aufbau als erwartet.')
    kopf_ab = nach_rolle + len('{absender_rolle}' + BS + 'n' + BS + 'n')
    ersatz = BS.join([
        '{firma_name}', 'n{firma_zusatz}', 'n', 'n{firma_register}',
        'n{firma_strasse}', 'n{firma_plz_ort}',
        'nGesch\u00e4ftsf\u00fchrer: {firma_geschaeftsfuehrer}',
        'nTel.: {firma_telefon}', 'nMail: {firma_email}',
        'nWeb: {firma_web}', 'nInstagram: {firma_instagram}',
    ])
    return inhalt[:kopf_ab] + ersatz + inhalt[trenner:], 1


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

    zaehler, formatiert = {}, {}
    for datei, (a, b) in STUECKE.items():
        inhalt = '\n'.join(z[a - 1:b]) + '\n'
        if not roh:
            inhalt, n_formatiert = ausformatieren(inhalt, datei)
            if n_formatiert:
                formatiert[datei] = n_formatiert
            # Erst nach dem Umbrechen: vorher steht die Signatur als
            # EP_SIGNATUR=" mitten in einer 2,4-MB-Zeile und ist so nicht
            # zuverlaessig zu greifen.
            inhalt, n_signatur = signatur_neutralisieren(inhalt)
            if n_signatur:
                print('  [MARKE]    1x  Geschaeftsbriefkopf in der Mail-Signatur '
                      'durch Platzhalter ersetzt.')
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
    for datei, n in formatiert.items():
        print(f'\n[FORMAT] {datei}: {n} vorkompilierte Zeile(n) umgebrochen '
              f'(nur Leerraum, nachgerechnet).')
    print(f'\n{len(STUECKE)} Stuecke geschrieben nach {ziel}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
