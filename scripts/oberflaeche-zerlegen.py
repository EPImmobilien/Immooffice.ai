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
    ('PHASE14',
     r'/engfer/i\.test\(t\.bearbeiter\) && /lasse/i\.test\(t\.bearbeiter\) && '
     r'\(t\.zusatz = "[^"]*"\), ',
     '',
     'Fest verdrahteter Titel samt Registriernummer fuer eine namentlich '
     'genannte Person, mit Bewertungsdienst. Person und Dienst entfallen; der '
     'Zusatz kommt aus dem Profil.'),
    ('PHASE14', r' \(Sprengnetter\)', '',
     'Anbietername im Platzhalter eines Eingabefeldes.'),
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

    # ------------------------------------------------------------------
    # Nachtrag 28.09.2026. Bis hierher war die Marke getroffen, die HERKUNFT
    # aber nicht: Rufnummer, Postleitzahlen und die Standorte der Referenz
    # standen weiter im Quelltext — als Rueckfallwerte, als Schluessel, als
    # Beispiele in Eingabefeldern und in einem Woerterbuch. Aufgefallen ist
    # es erst, als das Neutralitaets-Gate selbst repariert war
    # (scripts/neutral.sh, gleiches Datum).
    # ------------------------------------------------------------------

    # --- MARKE: Rufnummer der Referenz. Platzhalter statt Leerstring, weil
    # die Nummer in Fliesstexten steht, die sonst mitten im Satz abbrechen.
    ('MARKE', r'tel:\+493813677998', 'tel:{telefon}',
     'Rufnummer der Referenz als Telefon-Link im 360-Grad-Rundgang.'),
    ('MARKE', r'0381 36 77 99 88', '{telefon}',
     'Rufnummer der Referenz im Fuss, in der Abwesenheitsnotiz und als '
     'Beispiel in einem Eingabefeld.'),

    # --- MARKE: regionale Eigennamen im Woerterbuch der Rechtschreibpruefung.
    # Muss VOR den Ortsregeln unten stehen, sonst benennt es sie nur um.
    ('MARKE',
     r'"Warnem(ü|ue)nde", "K(ü|ue)hlungsborn", "B(ü|ue)tzow", "Teterow", '
     r'"G(ü|ue)strow", "Ludwigslust", "Parchim", "Sanitz", ',
     '',
     'Orte im Umkreis der Referenz. Sie stehen im Woerterbuch, damit die '
     'Rechtschreibpruefung sie nicht anstreicht — und verraten damit die '
     'Herkunft. Der Mandant pflegt seine eigenen Orte (Phase 2.4).'),
    ('MARKE', r'"Skyborn", "AKANT", ', '',
     'Zwei regionale Eigennamen im selben Woerterbuch.'),
    ('MARKE', r'Qonto-Export \(Rostock/Schwerin\), Vivid-Export \(Berlin\)',
     'Qonto-Export, Vivid-Export',
     'Zuordnung der Bankexporte zu den Bueros der Referenz im Hilfetext.'),
    ('MARKE', r'Notarin Dr\. Zierau', 'Notarin Dr. Muster',
     'Name einer namentlich genannten Notarin im Beispieltext eines Feldes.'),
    ('MARKE', r'Doberaner Str\. 16', 'Musterstrasse 16',
     'Strasse am Sitz der Referenz als Beispiel in einem Eingabefeld.'),
    ('MARKE', r'Hopfenmarkt 1', 'Marktplatz 1', 'wie oben'),
    ('MARKE', r'"Am  26"', '"{strasse}"',
     'Rest der Bueroanschrift, nachdem der Strassenname entfernt wurde. Sie '
     'steht in der Liste der Textbausteine, die aus den Word-Vorlagen '
     'herausgefiltert werden — ein Platzhalter haelt die Liste brauchbar.'),
    ('MARKE',
     r'lat: 54\.0887, lng: 12\.1394,(\s*)// Vorgabe: Rostock, bis eine Adresse',
     r'lat: 51.1657, lng: 10.4515,\1// Vorgabe: Mitte Deutschlands, bis eine Adresse',
     'Kartenmittelpunkt auf den Sitz der Referenz. Die geografische Mitte '
     'Deutschlands ist der neutrale Ersatz.'),

    # --- MARKE: Postleitzahlen der Referenz.
    ('MARKE', r'\b1805[0-9]\b', '12345', 'Postleitzahlen am Sitz der Referenz.'),
    ('MARKE', r'\b18119\b', '12345', 'Postleitzahl des Ortsteils.'),
    ('MARKE', r'\b19055\b', '12345', 'Postleitzahl der Zweigstelle.'),

    # --- MARKE: die Standorte der Referenz. Durchgehend ersetzt, nicht
    # entfernt: die Namen stehen nicht nur in Beispieltexten, sondern auch
    # als Schluessel einer Standorttabelle und als Wert in Auswahlfeldern.
    # Wer sie nur dort tilgt, wo sie sichtbar sind, zerlegt die Zuordnung.
    ('MARKE', r'Warnem(ü|ue)nde', 'Musterdorf', 'Ortsteil am Sitz der Referenz.'),
    ('MARKE', r'WARNEM(Ü|UE)NDE', 'MUSTERDORF', 'wie oben, in Versalien.'),
    ('MARKE', r'Rostock', 'Musterstadt', 'Sitz der Referenz.'),
    ('MARKE', r'ROSTOCK', 'MUSTERSTADT', 'wie oben, in Versalien.'),
    ('MARKE', r'rostock', 'musterstadt', 'wie oben, als Schluessel.'),
    ('MARKE', r'Schwerin', 'Beispielstadt', 'Zweigstelle der Referenz.'),
    ('MARKE', r'SCHWERIN', 'BEISPIELSTADT', 'wie oben, in Versalien.'),
    ('MARKE', r'schwerin', 'beispielstadt', 'wie oben, als Schluessel.'),
    ('MARKE', r'Musterhaus Immobilien GmbH Beispielstadt GmbH',
     'Musterhaus Immobilien Beispielstadt GmbH',
     'doppeltes GmbH, das erst durch die Ortsersetzung entsteht.'),

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
    # Die Versionsnummern stammen aus der npm-Registry — sie ist die Quelle,
    # aus der die CDNs ihre Pakete ziehen, also loest @2 genau dorthin auf.
    # Was diese Umgebung NICHT kann: die CDN-Adresse selbst abrufen; der
    # Egress-Proxy sperrt jsdelivr und unpkg. Ein Tippfehler in der Adresse
    # faellt deshalb erst beim ersten Start auf. Vermerkt in docs/OFFEN.md.
    ('MARKE', r'react@18/umd', 'react@18.3.1/umd', 'React auf 18.3.1 gepinnt.'),
    ('MARKE', r'react-dom@18/umd', 'react-dom@18.3.1/umd', 'React-DOM auf 18.3.1 gepinnt.'),
    ('MARKE', r'supabase-js@2"', 'supabase-js@2.117.2"',
     'supabase-js auf 2.117.2 gepinnt — das ist, was @2 heute aufloest.'),
    ('MARKE', r'tesseract\.js@5/', 'tesseract.js@5.1.1/',
     'tesseract.js auf 5.1.1 gepinnt.'),
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


# ---------------------------------------------------------------- Phase 1.4
# Shop-TV / Digital Signage entfaellt nach Phase 1.4 des Auftrags ersatzlos.
# Das ist keine Textersetzung, sondern eine Modulentfernung ueber acht
# Aufrufstellen. Moeglich wurde sie erst durch das Ausformatieren — vorher lag
# alles davon in einer 2,4-MB-Zeile.
#
# Reihenfolge: erst die Aufrufer, dann die Funktionen. Andersherum stuende
# zwischendurch ein Aufruf ins Leere, und ein Abbruch mittendrin hinterliesse
# eine Datei, die nicht mehr laedt.
#
# Geprueft wird das Ergebnis mit `node --check` (Teil von npm run check). Ohne
# diese Pruefung waere der Eingriff nicht zu verantworten: die Oberflaeche
# laesst sich in dieser Umgebung nicht starten.


def _spring(text, i):
    """Ueberspringt ab i eine Zeichenkette oder einen Kommentar; sonst None.

    Ohne diese Ruecksicht zaehlt ein Klammernzaehler die Klammern mit, die in
    Texten und Kommentaren stehen — und schneidet an der falschen Stelle.
    """
    z = text[i]
    if z in '"\'`':
        j = i + 1
        while j < len(text):
            if text[j] == '\\':
                j += 2
                continue
            if text[j] == z:
                return j + 1
            j += 1
        sys.exit('ABBRUCH: unbeendete Zeichenkette beim Suchen der Klammern.')
    if text.startswith('//', i):
        j = text.find('\n', i)
        return len(text) if j < 0 else j
    if text.startswith('/*', i):
        j = text.find('*/', i)
        if j < 0:
            sys.exit('ABBRUCH: unbeendeter Kommentar.')
        return j + 2
    return None


def _ende_ab(text, a, auf, zu):
    i = text.index(auf, a)
    tiefe = 0
    while i < len(text):
        s = _spring(text, i)
        if s is not None:
            i = s
            continue
        if text[i] == auf:
            tiefe += 1
        elif text[i] == zu:
            tiefe -= 1
            if tiefe == 0:
                return i + 1
        i += 1
    sys.exit('ABBRUCH: keine schliessende Klammer gefunden.')


def aufruf_weg(inhalt, anker, ebenen=0, start='React.createElement('):
    """Entfernt den React-Aufruf, in dem `anker` steht — samt folgendem Komma.

    `ebenen` steigt in den umschliessenden Aufruf. Rueckwaerts steht dabei oft
    ein Geschwister und kein Elternteil, deshalb wird weitergesucht, bis einer
    gefunden ist, der hinter dem inneren endet.
    """
    pos = inhalt.index(anker)
    # Der Anker kann selbst am Anfang des Aufrufs stehen; rindex wuerde dann den
    # davorstehenden Geschwister-Aufruf treffen.
    a = pos if inhalt.startswith(start, pos) else inhalt.rindex(start, 0, pos)
    b = _ende_ab(inhalt, a, '(', ')')
    for _ in range(ebenen):
        suche = a
        while True:
            suche = inhalt.rindex(start, 0, suche)
            ende = _ende_ab(inhalt, suche, '(', ')')
            if ende >= b:
                a, b = suche, ende
                break
    while inhalt[b:b + 2] == ', ':
        b += 2
    return inhalt[:a] + inhalt[b:]


def objekt_weg(inhalt, anker):
    """Entfernt das Objektliteral, in dem `anker` steht — samt Trennkomma."""
    pos = inhalt.index(anker)
    a = inhalt.rindex('{', 0, pos)
    b = _ende_ab(inhalt, a, '{', '}')
    # Genau EIN Trennzeichen faellt mit: bevorzugt das dahinter, sonst das
    # davor. Beide zu nehmen schweisst die Nachbarn zusammen ("}{") — genau
    # daran ist der erste Versuch gescheitert.
    if inhalt[b:b + 2] == ', ':
        b += 2
    elif inhalt[a - 2:a] == ', ':
        a -= 2
    return inhalt[:a] + inhalt[b:]


def zeilen_weg(inhalt, von, bis=None, hoechstens=40, genau_einmal=True):
    """Entfernt ganze Zeilen: die mit `von`, bis einschliesslich der mit `bis`.

    `hoechstens` begrenzt den Abstand. Ohne die Grenze trifft ein unscharfes
    Endmerkmal irgendeine spaetere Zeile und reisst hunderte Zeilen mit — still,
    und erst der Syntaxpruefer merkt es, an einer ganz anderen Stelle.
    """
    zeilen = inhalt.split('\n')
    treffer = [i for i, l in enumerate(zeilen) if von in l]
    if not treffer:
        sys.exit(f'ABBRUCH: {von!r} kommt nicht vor.')
    if genau_einmal and len(treffer) != 1:
        sys.exit(f'ABBRUCH: {von!r} kommt {len(treffer)}-mal vor, erwartet genau einmal.')
    a = treffer[0]
    if bis is None:
        b = a
    else:
        kandidaten = [i for i in range(a, len(zeilen)) if bis in zeilen[i]]
        if not kandidaten:
            sys.exit(f'ABBRUCH: {bis!r} nach {von!r} nicht gefunden.')
        b = kandidaten[0]
        if b - a > hoechstens:
            sys.exit(f'ABBRUCH: von {von!r} bis {bis!r} liegen {b - a} Zeilen. '
                     f'Erlaubt sind {hoechstens}. Das Endmerkmal trifft zu frueh '
                     'oder zu spaet.')
    return '\n'.join(zeilen[:a] + zeilen[b + 1:])


def zuweisung_weg(inhalt, anker):
    """Entfernt eine Zuweisung `name = async (...) => { ... }` aus einer Kette.

    Die Vorlage bindet mehrere Funktionen in einer einzigen const-Kette. Die
    Klammern der Parameterliste zaehlen dabei nicht — gesucht wird der Koerper
    hinter dem Pfeil.
    """
    a = inhalt.index(anker)
    pfeil = inhalt.index(' => {', a)
    b = _ende_ab(inhalt, pfeil + 4, '{', '}')
    if inhalt[b:b + 2] == ', ':
        b += 2
    elif inhalt[a - 2:a] == ', ':
        a -= 2
    return inhalt[:a] + inhalt[b:]


def ternaer_zweig_weg(inhalt, bedingung):
    """Entfernt `<bedingung> ? React.createElement(...) : ` aus einer Kette.

    Nur den Aufruf zu entfernen genuegt nicht — Bedingung, Fragezeichen und
    Doppelpunkt bleiben sonst als Rumpf stehen.
    """
    a = inhalt.index(bedingung)
    frage = inhalt.index(' ? ', a)
    ausdruck = frage + 3
    if not inhalt.startswith('React.createElement(', ausdruck):
        sys.exit(f'ABBRUCH: hinter {bedingung!r} steht kein React-Aufruf.')
    b = _ende_ab(inhalt, ausdruck, '(', ')')
    if inhalt[b:b + 3] != ' : ':
        sys.exit(f'ABBRUCH: hinter dem Zweig zu {bedingung!r} fehlt der Doppelpunkt.')
    return inhalt[:a] + inhalt[b + 3:]


def und_zweig_weg(inhalt, bedingung):
    """Entfernt `<bedingung> && <ausdruck>` samt Trennkomma.

    Der Ausdruck ist mal ein React-Aufruf, mal eine sofort ausgefuehrte
    Funktion `(() => {...})()`. Beide beginnen mit einer Klammer, also wird ab
    der ersten Klammer hinter dem && gezaehlt — und ein angehaengtes ()
    mitgenommen.
    """
    a = inhalt.index(bedingung)
    ruf = inhalt.index('(', inhalt.index(' && ', a))
    b = _ende_ab(inhalt, ruf, '(', ')')
    if inhalt[b:b + 2] == '()':
        b += 2
    if inhalt[a - 2:a] == ', ':
        a -= 2
    elif inhalt[b:b + 2] == ', ':
        b += 2
    return inhalt[:a] + inhalt[b:]


def bindung_weg(inhalt, name):
    """Entfernt `NAME = [ ... ],` aus einer const-Kette, ueber Klammernzaehlung.

    Ein Zeilenmerkmal als Ende ist hier untauglich: schliessende Klammern in
    dieser Einrueckung gibt es tausendfach.
    """
    a = inhalt.index(f'{name} = [')
    b = _ende_ab(inhalt, a, '[', ']')
    if inhalt[b:b + 2] in (',\n', ', '):
        b += 2
    else:
        # Letzte Bindung der Kette: dann faellt das Komma davor, sonst bleibt
        # ein einsames Semikolon stehen.
        for trenner in (',\n  ', ', '):
            if inhalt[a - len(trenner):a] == trenner:
                a -= len(trenner)
                break
    return inhalt[:a] + inhalt[b:]


def shoptv_entfernen(inhalt):
    """Streicht Shop-TV / Digital Signage nach Phase 1.4 des Auftrags.

    Erst die Aufrufer, dann die Funktionen: andersherum stuende zwischendurch
    ein Aufruf ins Leere. Was NICHT faellt: die Spalte
    shoptv_veroeffentlichen und der Pruefwert im Schema (Phase 9 verbietet das
    Entfernen von Spalten) und das Druckformat "Schaufenster-Aushang" — ein
    Aushang aus Papier ist kein Digital Signage.
    """
    schritte = []

    # --- Oberflaeche: Kacheln, Listen, Routen
    inhalt = zeilen_weg(inhalt, '    shoptv: "Schaufenster-TV"')
    schritte.append('Beschriftung in der Portalstatus-Anzeige')
    inhalt = objekt_weg(inhalt, 'id: "shoptv",\n    label: "Schaufenster-TV"')
    schritte.append('Eintrag in der Auswahlliste der Vermarktungsorte')
    inhalt = aufruf_weg(inhalt, 'feld: "shoptv_veroeffentlichen"', ebenen=1)
    schritte.append('Karte "Im Schaufenster-TV zeigen" in der Objektseite')
    inhalt = aufruf_weg(inhalt, 'kanal: "shoptv"')
    schritte.append('Kanalzeile Schaufenster-TV in der Objektseite')
    # Hier faellt die ganze Eigenschaft, nicht nur ihr Wert: objekt_weg wuerde
    # "shoptv: ," stehen lassen.
    inhalt = zeilen_weg(inhalt, '  shoptv: {', '  },')
    schritte.append('Marketing-Format "Shop TV"')
    inhalt = inhalt.replace('r("shoptv", "\U0001f4fa", "Shop TV", '
                            '"Hochformat f\u00fcr den B\u00fcrobildschirm"), ', '')
    schritte.append('Knopf "Shop TV" in der Formatauswahl')
    inhalt = objekt_weg(inhalt, 'id: "shoptv",\n      label: "Shop TV",')
    schritte.append('Kachel "Shop TV" in der Marketing-Uebersicht')
    # --- Erst die Bedingungen entschaerfen: "shop-tv" kann kein Format mehr
    # sein, also faellt der Zweig. Das muss VOR der Zweig-Schleife laufen,
    # sonst bleibt sie an einer Zahlenbedingung haengen.
    for a, b, was in [
        ('"coming-soon-story" === t || "shop-tv" === t',
         '"coming-soon-story" === t', 'Formatpruefung in der Kachelvorschau'),
        ('"coming-soon-story" === d || "shop-tv" === d ? 1920 : 1080',
         '"coming-soon-story" === d ? 1920 : 1080', 'Hoehe der Vorschauflaeche'),
        (' && "shop-tv" !== d', '', 'Ausschluss in der Werkzeugleiste'),
        ('("schaufenster" === d || "shop-tv" === d)', '("schaufenster" === d)',
         'gemeinsamer Zweig mit dem Schaufenster-Aushang'),
        ('"shop-tv" !== d && ', '', 'Ausschluss am Knopf'),
    ]:
        if a in inhalt:
            inhalt = inhalt.replace(a, b)
            schritte.append(f'Bedingung: {was}')

    n = 0
    while True:
        i = inhalt.find('"shop-tv" === d ?')
        if i < 0:
            break
        if not inhalt.startswith('React.createElement(', inhalt.index(' ? ', i) + 3):
            print('  [HINWEIS] Zweig mit anderem Aufbau, bleibt vorerst stehen:\n'
                  f'    …{inhalt[i:i+140]}…')
            break
        inhalt = ternaer_zweig_weg(inhalt, '"shop-tv" === d ?')
        n += 1
    schritte.append(f'Vorschau-Zweige der Shop-TV-Kachel ({n})')
    inhalt = inhalt.replace(', "shoptv" === t && React.createElement(ShopTvPage, {\n'
                            '    user: e\n  })', '')
    schritte.append('Route zur Shop-TV-Seite')
    inhalt = inhalt.replace('"shop-tv" === t ? ShopTvKachelModern : ', '')
    schritte.append('Shop-TV-Zweig in der Kachelauswahl')
    inhalt = zuweisung_weg(inhalt, 'ie = async ({')
    schritte.append('Uebertragung an den Buerobildschirm (Video + Yodeck-Upload)')
    inhalt = aufruf_weg(inhalt, 'Direkt auf Shop TV (Live)', ebenen=1)
    schritte.append('Knopf "Direkt auf Shop TV"')

    # --- Die beiden Seiten selbst
    for name in ('ShopTvPage', 'ShopTvKachelModern'):
        inhalt, n = funktion_entfernen(inhalt, name)
        if not n:
            sys.exit(f'ABBRUCH: {name} nicht gefunden.')
        schritte.append(f'Funktion {name} ({n} Zeilen)')

    # --- Yodeck-Anbindung im Kanal-Baustein
    inhalt = inhalt.replace('const EP_KANAL_LABEL = { website: "Eigene Internetseite", '
                            'shoptv: "Schaufenster-TV" };',
                            'const EP_KANAL_LABEL = { website: "Eigene Internetseite" };')
    for name in ('epShopTvPasst', 'epShopTvAbgleich'):
        inhalt, n = funktion_entfernen(inhalt, name)
        if not n:
            sys.exit(f'ABBRUCH: {name} nicht gefunden.')
        schritte.append(f'Funktion {name} ({n} Zeilen)')
    inhalt = inhalt.replace('const erg = { website: null, shoptv: null, yodeck: null };',
                            'const erg = { website: null };')
    inhalt = inhalt.replace('const paare = [["website", "website_veroeffentlichen"], '
                            '["shoptv", "shoptv_veroeffentlichen"]];',
                            'const paare = [["website", "website_veroeffentlichen"]];')
    inhalt = zeilen_weg(inhalt, 'if (portal === "shoptv") erg.yodeck')
    inhalt = zeilen_weg(inhalt, 'if (erg.yodeck && erg.yodeck.ok')
    schritte.append('Yodeck-Abgleich beim Speichern der Kanaele')
    inhalt = zeilen_weg(inhalt, 'const [live, setLive] = useState(null);',
                        '}, [kanal, objekt && objekt.id]);')
    inhalt = zeilen_weg(inhalt, 'if (kanal === "shoptv" && live !== null)')
    inhalt = zeilen_weg(inhalt, 'kanal === "shoptv" && onKachel &&')
    schritte.append('Live-Anzeige und Kachel-Knopf in der Kanalzeile')
    inhalt, n = funktion_entfernen(inhalt, 'yodeckCall')
    if n:
        schritte.append(f'Yodeck-Schnittstelle yodeckCall ({n} Zeilen)')
    inhalt = zeilen_weg(inhalt, 'const YODECK_SCREEN_ID =', 'YODECK_PLAYLIST_TEST =')
    schritte.append('Kennungen des Yodeck-Bildschirms')

    # --- Der Rest ist Zubehoer des Formats im Marketing-Editor: Bildslots,
    # Standardwerte, Hinweistexte. Ohne das Format ist es toter Code.
    while '"shop-tv" === d &&' in inhalt:
        inhalt = und_zweig_weg(inhalt, '"shop-tv" === d &&')
    schritte.append('Bildslot-Bereich und Aufnahmeknopf des Shop-TV-Formats')
    inhalt = inhalt.replace('(Instagram, Schaufenster, Shop-TV \u2026)',
                            '(Instagram, Schaufenster \u2026)')
    inhalt = objekt_weg(inhalt, 'id: "shoptv",\n    title: "Shop TV",')
    schritte.append('Kachel "Shop TV" in der Werkzeuguebersicht')
    inhalt = bindung_weg(inhalt, 'MKT_SHOPTV_SLOTS')
    inhalt = inhalt.replace('MKT_SHOPTV_SLOTS.map(', '[].map(')
    schritte.append('Auswahlliste der Shop-TV-Bildslots')
    inhalt = inhalt.replace('useState("shopTvBildHero")', 'useState("")')
    inhalt = inhalt.replace('i = "shop-tv" === t,', 'i = !1,')
    for marke in ('shopTvBildHero:', 'shopTvBild2:', 'shopTvBild3:'):
        while any(marke in z for z in inhalt.split('\n')):
            inhalt = zeilen_weg(inhalt, marke, genau_einmal=False)
    inhalt = inhalt.replace(
        '!b.shopTvBildHero && "Hauptbild", !b.shopTvBild2 && "weiteres Foto (1)", '
        '!b.shopTvBild3 && "weiteres Foto (2)"', '')
    schritte.append('Bildslots und ihre Standardwerte')
    for marke in ('shoptv_veroeffentlichen',):
        while any(marke in z for z in inhalt.split('\n')):
            inhalt = zeilen_weg(inhalt, marke, genau_einmal=False)
    schritte.append('Lesen und Schreiben der Spalte shoptv_veroeffentlichen '
                    '(die Spalte selbst bleibt, Phase 9)')
    # Phase 1.4 streicht auch den Bewertungsdienst-Zugang.
    inhalt = aufruf_weg(inhalt, 'service: "sprengnetter"', ebenen=1)
    schritte.append('Kachel fuer den Zugang zum Bewertungsdienst')
    inhalt = inhalt.replace('(z. B. Sprengnetter, PDF)', '(PDF)')
    inhalt = inhalt.replace('"Sprengnetter", ', '')
    inhalt = inhalt.replace(' (z. B. Sprengnetter)', '')
    schritte.append('Anbietername im Hinweistext der Gutachten-Auslese')
    inhalt = inhalt.replace('shopTvQrGroesse', 'qrGroesse')
    schritte.append('Feldname der QR-Groesse entkoppelt (gilt auch fuer den Aushang)')

    # --- Kommentarzeilen, die nur noch Entferntes beschreiben
    for zeile in ('// Passt ein Yodeck-Medien-/Playlist-Name zum Objekt?',
                  '// Live-Playlist mit dem Schalter abgleichen:'):
        if zeile in inhalt:
            inhalt = zeilen_weg(inhalt, zeile)
    inhalt = inhalt.replace(
        '// ===== Stufe 94: Vermarktungskanaele Eigene Internetseite / Schaufenster-TV (Auftrag 13) =====',
        '// ===== Stufe 94: Vermarktungskanal Eigene Internetseite (Auftrag 13) =====\n'
        '// Schaufenster-TV/Yodeck ist nach Phase 1.4 des Auftrags entfallen.')
    inhalt = inhalt.replace(
        '// Beim Speichern: geaenderte Schalter als Portal-Status spiegeln, Shop-TV mit Yodeck abgleichen.',
        '// Beim Speichern: geaenderte Schalter als Portal-Status spiegeln.')
    return inhalt, schritte


def funktion_entfernen(inhalt, name):
    """Entfernt eine Funktion der obersten Ebene samt Koerper.

    Nach dem Ausformatieren beginnt jede Funktion der obersten Ebene in Spalte 1
    und endet mit einer Zeile, die nur aus } besteht. Das ist verlaesslich genug,
    um ohne Parser auszukommen — und es wird nachgeprueft: zwischen Anfang und
    Ende darf keine weitere Funktion der obersten Ebene liegen.
    """
    zeilen = inhalt.split('\n')
    koepfe = (f'function {name}(', f'async function {name}(')
    anfang = None
    for i, l in enumerate(zeilen):
        if l.startswith(koepfe):
            anfang = i
            break
    if anfang is None:
        return inhalt, 0
    ende = None
    for i in range(anfang + 1, len(zeilen)):
        if zeilen[i] == '}':
            ende = i
            break
        if zeilen[i].startswith(('function ', 'async function ')):
            sys.exit(f'ABBRUCH: zwischen {name} und seinem Ende steht '
                     f'{zeilen[i][:40]!r}. Die Grenzen stimmen nicht.')
    if ende is None:
        sys.exit(f'ABBRUCH: kein Ende fuer {name} gefunden.')
    return '\n'.join(zeilen[:anfang] + zeilen[ende + 1:]), ende - anfang + 1


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
            if datei == 'app/anwendung.js':
                inhalt, schritte = shoptv_entfernen(inhalt)
                for s in schritte:
                    print(f'  [PHASE14]     {s}')
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
