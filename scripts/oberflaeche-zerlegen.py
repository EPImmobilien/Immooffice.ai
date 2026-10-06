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
# Der Zuschnitt der Vorlage. Bis zum 02.10.2026 standen hier feste
# Zeilennummern — und der naechste Export der Vorlage hat sie alle verschoben:
# die Anwendung war um 5.901 Zeilen gewachsen, und das Skript brach mit
# "Die Vorlage hat einen anderen Aufbau als STUECKE beschreibt" ab. Richtig
# war die Meldung, nur die Ursache war harmlos.
#
# Darum steht hier jetzt der AUFBAU, nicht die Zahlen: eine Folge von
# Abschnitten, jeder entweder ein Skript, ein Stil oder reines HTML. Die
# Grenzen sucht ZUSCHNITT() anhand der Tags. Die Sicherung bleibt: stimmt die
# Folge nicht, bricht es weiter ab — nur verschiebt eine laengere Anwendung
# sie nicht mehr.
AUFBAU = [
    ('huelle/01-kopf.html',              'html'),
    ('start/01-fruehstart.js',           'script'),
    ('huelle/02-pwa-und-schriften.html', 'html'),
    ('huelle/03-stil.css',               'style'),
    ('huelle/04-koerper.html',           'html'),
    ('huelle/05-bibliotheken.html',      'html-bibliotheken'),
    ('start/02-nach-bibliotheken.js',    'script'),
    ('huelle/06-msal.html',              'html'),
    ('start/03-msal.js',                 'script'),
    ('huelle/07-babel-hinweis.html',     'html'),
    ('start/04-vorbereitung.js',         'script'),
    ('app/anwendung.js',                 'script'),
    ('huelle/08-sw-hinweis.html',        'html'),
    ('start/05-abschluss.js',            'script'),
    ('huelle/09-fuss.html',              'html'),
]


# Leerzeilen, die in der Vorlage NACH einem Stueck stehen und zu keinem
# Stueck gehoeren. scripts/bauen.py setzt sie beim Rueckbau aus derselben
# Liste wieder ein (dort LEERZEILE_NACH) — beide muessen uebereinstimmen,
# sonst scheitert der Byte-Vergleich mit der Vorlage um genau diese Zeilen.
LEERZEILE_NACH = {'start/04-vorbereitung.js', 'app/anwendung.js'}


def zuschnitt(zeilen):
    """Grenzen je Abschnitt (1-basiert, beide Enden einschliesslich).

    Ein eigenes <script>…</script> beziehungsweise <style>…</style> ist ein
    Abschnitt fuer sich; alles dazwischen ist HTML. Eine Zeile wie
    <script src="…"></script> zaehlt NICHT als Blockanfang — sie laedt eine
    Bibliothek und gehoert zum HTML.
    """
    bloecke = []           # (art, erste_zeile_innen, letzte_zeile_innen)
    offen = None
    for i, l in enumerate(zeilen, 1):
        s = l.strip()
        if offen is None:
            if s == '<script>':
                offen = ('script', i + 1)
            elif s == '<style>':
                offen = ('style', i + 1)
        else:
            art, von = offen
            if s == '</script>' and art == 'script' or s == '</style>' and art == 'style':
                bloecke.append((art, von, i - 1))
                offen = None
    if offen:
        raise SystemExit(f'ABBRUCH: {offen[0]} ab Zeile {offen[1] - 1} wird nicht geschlossen.')

    erwartet = [a for _, a in AUFBAU if a in ('script', 'style')]
    gefunden = [b[0] for b in bloecke]
    if gefunden != erwartet:
        raise SystemExit(
            'ABBRUCH: Die Vorlage hat einen anderen Aufbau als AUFBAU beschreibt.\n'
            f'  erwartet: {" ".join(erwartet)}\n'
            f'  gefunden: {" ".join(gefunden)}')

    stuecke, blockindex, zeiger = {}, 0, 1
    for i, (name, art) in enumerate(AUFBAU):
        if art in ('html', 'html-bibliotheken'):
            # HTML laeuft bis zur Tag-Zeile des naechsten Blocks, oder bis zum
            # Dateiende, wenn keiner mehr folgt.
            if blockindex < len(bloecke):
                ende = bloecke[blockindex][1] - 2
            else:
                # Letztes Stueck: die Vorlage endet mit genau einem
                # Zeilenumbruch, split() liefert dafuer ein leeres Element.
                ende = len(zeilen) - 1 if zeilen[-1] == '' else len(zeilen)
            # Zwei HTML-Abschnitte stossen an genau einer Stelle aneinander:
            # der Koerper der Seite und darunter die Reihe der Bibliotheken.
            # Dort trennt kein Tag, also wird an der ersten Bibliothekszeile
            # geteilt — <script src=…> oder <link rel="stylesheet" …>.
            if i + 1 < len(AUFBAU) and AUFBAU[i + 1][1] == 'html-bibliotheken':
                trenn = next((n for n in range(zeiger, ende + 1)
                              if re.match(r'<(script[^>]*\ssrc=|link\b)', zeilen[n - 1].strip())), None)
                if trenn is None:
                    raise SystemExit('ABBRUCH: Die Reihe der Bibliotheken ist nicht zu finden '
                                     f'(gesucht zwischen Zeile {zeiger} und {ende}).')
                stuecke[name] = (zeiger, trenn - 1)
                zeiger = trenn
                continue
            stuecke[name] = (zeiger, ende)
            zeiger = ende + 1
        else:
            _, von, bis = bloecke[blockindex]
            stuecke[name] = (von, bis)
            blockindex += 1
            # bis + 1 ist die schliessende Tag-Zeile; danach beginnt das
            # naechste Stueck — ausser es folgt eine Trenn-Leerzeile.
            zeiger = bis + 2
            if name in LEERZEILE_NACH:
                if zeilen[zeiger - 1].strip() != '':
                    raise SystemExit(f'ABBRUCH: nach {name} wird eine Leerzeile '
                                     f'erwartet, Zeile {zeiger} ist nicht leer.')
                zeiger += 1
    return stuecke

# Zeilen, die vor bzw. nach einem Stueck ein Tag tragen muessen. Stimmt das
# nicht, ist die Vorlage eine andere als die, fuer die AUFBAU geschrieben ist.
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

    # --- MARKE: der Slug des Hauptstandorts der Referenz. Er steht neunmal
    # im Quelltext als fester Schluessel in .eq("slug", ...). Das Gate hat ihn
    # bis zum 28.09.2026 nicht gesehen — sein Muster verlangte ein
    # kaufmaennisches Und oder gar kein Trennzeichen.
    ('MARKE', r'"ep-immobilien"', '"standard"',
     'Slug des Hauptstandorts der Referenz.'),

    # --- FORK: der Hinweistext der Urlaubsverwaltung nannte fest
    # Mecklenburg-Vorpommern. Er nennt jetzt das Bundesland des Standorts —
    # und sagt es ausdruecklich, wenn keines hinterlegt ist. Eine Zahl, die
    # auf dem falschen Feiertagskalender beruht, sieht genauso plausibel aus
    # wie eine richtige.
    ('FORK', r'ohne die Feiertage in Mecklenburg-Vorpommern',
     'ohne die gesetzlichen Feiertage des Bundeslandes deines Standorts '
     '(ist dort keines hinterlegt, zaehlen nur die neun bundesweiten)',
     'Hinweistext der Urlaubsverwaltung nennt das Bundesland des Standorts.'),

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
    ('FORK', r'\}\)\), window\._isConfigured = !0;',
     '})), window._isConfigured = !0;\n\n// --- Storage: jeder Pfad traegt den Mandanten als erstes Segment ----------\n//\n// Warum hier und nicht an den 51 Stellen, die Pfade bauen: die Anwendung\n// arbeitet weiter mit mandantenrelativen Pfaden, und genau die stehen auch in\n// der Datenbank (immobilie_datei.storage_path und Geschwister). Waere der\n// Mandant Teil des gespeicherten Pfades, muesste jede dieser Spalten\n// mitwandern. So bleibt er, wo er hingehoert: in der Zugriffsschicht.\n//\n// Die restriktive Richtlinie auf storage.objects prueft genau dieses erste\n// Segment. Wer die Huelle umgeht, kommt also nicht weiter — sie ist\n// Bequemlichkeit, nicht die Sicherung.\n//\n// Ohne angemeldeten Nutzer (IMMO_MANDANT_ID null) bleibt der Pfad unberuehrt.\n// Solche Aufrufe scheitern ohnehin an der Richtlinie; ein erfundenes Praefix\n// machte daraus nur einen schwerer zu lesenden Fehler.\n(function () {\n  const echt = window._sb.storage.from.bind(window._sb.storage);\n  const vorne = (pfad) => {\n    const m = window.IMMO_MANDANT_ID;\n    if (!m || typeof pfad !== "string" || !pfad) return pfad;\n    return pfad === m || pfad.startsWith(m + "/") ? pfad : m + "/" + pfad;\n  };\n  const einsOderViele = (p) => Array.isArray(p) ? p.map(vorne) : vorne(p);\n  const MIT_PFAD = ["upload", "uploadToSignedUrl", "download", "remove",\n                    "createSignedUrl", "createSignedUrls", "getPublicUrl",\n                    "info", "exists"];\n  window._sb.storage.from = function (bucket) {\n    const api = echt(bucket);\n    const huelle = Object.create(api);\n    MIT_PFAD.forEach((name) => {\n      if (typeof api[name] !== "function") return;\n      huelle[name] = function (pfad, ...rest) {\n        return api[name](einsOderViele(pfad), ...rest);\n      };\n    });\n    // list ohne Prefix wuerde die Wurzel des Buckets auflisten — also alle\n    // Mandanten. Ohne Angabe wird deshalb der eigene Ordner aufgelistet.\n    if (typeof api.list === "function") {\n      huelle.list = function (prefix, ...rest) {\n        const m = window.IMMO_MANDANT_ID;\n        return api.list(prefix ? vorne(prefix) : (m || prefix), ...rest);\n      };\n    }\n    ["move", "copy"].forEach((name) => {\n      if (typeof api[name] !== "function") return;\n      huelle[name] = function (von, nach, ...rest) {\n        return api[name](vorne(von), vorne(nach), ...rest);\n      };\n    });\n    return huelle;\n  };\n})();',
     'Storage-Huelle: jeder Pfad traegt den Mandanten als erstes Segment.'),

    ('MARKE', r'tesseract\.js@5/', 'tesseract.js@5.1.1/',
     'tesseract.js auf 5.1.1 gepinnt.'),

    # --- MARKE: der Vorsatz EP_ in 41 Bezeichnern, rund 180 Stellen.
    # docs/NEUTRALITAET.md Abschnitt 3 verlangt die Umbenennung ausdruecklich
    # und nennt EP_TOKEN und EP_EXPOSE_MODE als Beispiele; passiert war sie
    # nie, und das Gate fragte nicht danach (EP_ enthaelt kein "world").
    #
    # Umbenannt wird der ganze Vorsatz, nicht die genannten zwei: eine
    # Auswahl liesse die Abkuerzung an 39 anderen Stellen stehen, und EP_ ist
    # die Abkuerzung der Referenz — CLAUDE.md nennt Variablennamen
    # ausdruecklich. IMMO_ ist die Entsprechung, die die Oberflaeche mit
    # IMMO_SUPABASE_URL ohnehin schon fuehrt.
    #
    # NICHT betroffen ist das kleingeschriebene ep (ep-Bus, epSpellGross):
    # Abschnitt 3 nimmt es begruendet aus. Diese Regel greift nur bei
    # Grossbuchstaben mit Unterstrich.
    #
    # Muss NACH der Logo-Regel stehen, die EP_LOGO_DATAURL beim Namen nennt.
    # =====================================================================
    # FORK — Abschnitt 1b: das Recht "Export" und der Sichtbarkeitsbereich
    #
    # Die Datenbank kennt beides seit fork_11 (public.hat_recht,
    # public.sichtbare_mitarbeiter, profiles.sichtbarkeit). Hier bekommt die
    # Oberflaeche die Bedienelemente dazu. Die Durchsetzung bleibt in der
    # Datenbank — was hier steht, blendet nur aus, was ohnehin nicht ginge.
    # =====================================================================

    # Ein neues Modul in der Rechte-Matrix, vor dem Admin-Bereich und als
    # sensibel gekennzeichnet: ein Export nimmt personenbezogene Daten aus
    # dem System heraus.
    ('FORK',
     r'\{\n    id: "admin",\n    label: "Admin-Bereich",',
     '{\n    id: "export",\n'
     '    label: "Export",\n'
     '    hinweis: "Adressbuch als CSV herunterladen",\n'
     '    sensibel: !0\n'
     '  }, {\n    id: "admin",\n    label: "Admin-Bereich",',
     'Rechte-Matrix: neues Modul "Export" (Abschnitt 1b).'),

    # Wer bekommt es aus der Vorlage? Chef ohnehin (MODULE.map). Bei den
    # uebrigen drei Stufen bleibt es aus: ein Export ist der breiteste Weg,
    # auf dem Kundendaten das Haus verlassen, und er laesst sich mit einem
    # Haeckchen je Mitarbeiter freigeben. Genau dafuer gibt es Einzelrechte.
    ('FORK',
     r'"objektkosten", "zinspreis", "posteingang", "akquise"\],',
     '"objektkosten", "zinspreis", "posteingang", "akquise", "export"],',
     'Standortleitung bekommt das Export-Recht aus der Vorlage.'),

    # Die vier Bereiche als eigene Liste neben STUFEN, damit Auswahlfeld und
    # Erklaertext aus einer Quelle kommen.
    ('FORK',
     r'  STUFEN = \[\{',
     '  IMMO_SICHTBARKEIT = [{\n'
     '    id: "eigene",\n'
     '    label: "Nur eigene",\n'
     '    beschreibung: "Sieht nur, wofuer er selbst zustaendig ist."\n'
     '  }, {\n'
     '    id: "standort",\n'
     '    label: "Eigener Standort",\n'
     '    beschreibung: "Sieht alles, wofuer Kollegen am selben Standort zustaendig sind."\n'
     '  }, {\n'
     '    id: "gesellschaft",\n'
     '    label: "Eigene Gesellschaft",\n'
     '    beschreibung: "Sieht alle Standorte der eigenen Gesellschaft."\n'
     '  }, {\n'
     '    id: "konto",\n'
     '    label: "Ganzes Konto",\n'
     '    beschreibung: "Sieht alles im Unternehmen. Voreinstellung."\n'
     '  }],\n'
     '  STUFEN = [{',
     'Die vier Sichtbarkeitsbereiche als eigene Liste.'),

    # Das Auswahlfeld im Rechte-Dialog, direkt ueber der Stufe.
    ('FORK',
     r'\}, "Stufe \(belegt die Häkchen vor\)"\), React\.createElement\("select", \{',
     '}, "Sichtbarkeit"), React.createElement("select", {\n'
     '      value: f.sichtbarkeit || "konto",\n'
     '      onChange: e => {\n'
     '        const w = e.target.value;\n'
     '        p(s => ({ ...s, sichtbarkeit: w }))\n'
     '      },\n'
     '      style: R\n'
     '    }, IMMO_SICHTBARKEIT.map(e => React.createElement("option", {\n'
     '      key: e.id,\n'
     '      value: e.id\n'
     '    }, e.label))), React.createElement("div", {\n'
     '      style: { fontSize: 11, color: CI.muted, marginTop: 6, marginBottom: 12, lineHeight: 1.4 }\n'
     '    }, (IMMO_SICHTBARKEIT.find(e => e.id === (f.sichtbarkeit || "konto")) || {}).beschreibung),\n'
     '    React.createElement("label", {\n'
     '      style: labelStyle\n'
     '    }, "Stufe (belegt die Häkchen vor)"), React.createElement("select", {',
     'Rechte-Dialog: Auswahlfeld fuer den Sichtbarkeitsbereich.'),

    # Gespeichert und protokolliert wird er mit.
    ('FORK',
     r'            firma_id: f\.firma_id \|\| null,\n            stufe: f\.stufe,\n'
     r'            rechte: f\.rechte\n          \}\), await logAction\("update", '
     r'"mitarbeiter", e\.id, e\.name, \{\n            stufe: f\.stufe,',
     '            firma_id: f.firma_id || null,\n'
     '            stufe: f.stufe,\n'
     '            sichtbarkeit: f.sichtbarkeit || "konto",\n'
     '            rechte: f.rechte\n'
     '          }), await logAction("update", "mitarbeiter", e.id, e.name, {\n'
     '            stufe: f.stufe,\n'
     '            sichtbarkeit: f.sichtbarkeit || "konto",',
     'Rechte-Dialog: Sichtbarkeit speichern und protokollieren.'),

    # =====================================================================
    # FORK — Adressbuch als CSV, angefordert am 28.09.2026
    #
    # Die Vorlage kann CSV fuer Akquise, Objektkosten und
    # Newsletter-Anmeldungen, fuer Kontakte nicht. Format und Vorgehen sind
    # von dort uebernommen: Semikolon, UTF-8 mit BOM (sonst liest Excel die
    # Umlaute falsch), Anfuehrungszeichen verdoppelt, CRLF.
    #
    # Ausgegeben wird GENAU die gefilterte und sortierte Liste, die der
    # Nutzer vor sich hat — nicht eine zweite, weiter gefasste Abfrage. Was
    # er nicht sehen darf, steht schon nicht in `b`: dafuer sorgen die
    # Mandantentrennung (fork_07) und der Sichtbarkeitsbereich (fork_11) in
    # der Datenbank, nicht dieser Quelltext.
    #
    # Der Knopf haengt am Recht "export" (fork_11). Er ist eine Bequemlichkeit,
    # keine Sicherung: hat_recht('export') gilt serverseitig.
    #
    # Jeder Export landet im Aktivitaets-Log, mit Anzahl der Datensaetze. Ein
    # Export personenbezogener Daten ist ein Vorgang, ueber den man Auskunft
    # geben koennen muss.
    # =====================================================================
    ('FORK',
     r'  \}\), " Neuer Kontakt"\), React\.createElement\(NewsletterKnopf, \{',
     '  }), " Neuer Kontakt"), hatRecht(e, "export") && React.createElement("button", {\n'
     '    onClick: () => immoKontakteCsv(b),\n'
     '    disabled: !b.length,\n'
     '    title: b.length\n'
     '      ? b.length + " angezeigte Kontakte als CSV herunterladen"\n'
     '      : "Keine Kontakte in der aktuellen Auswahl",\n'
     '    style: { ...secondaryBtn, opacity: b.length ? 1 : .5 }\n'
     '  }, "CSV-Export (" + b.length + ")"), React.createElement(NewsletterKnopf, {',
     'Adressbuch: CSV-Knopf, nur mit dem Recht "export".'),

    # Die Ausgabe selbst, neben logAction — dort steht schon alles, was sie
    # braucht, und sie wird nur von einer Stelle gerufen.
    ('FORK',
     r'\nfunction canDelete\(e\) \{',
     '\n'
     '// Adressbuch als CSV. Spalten folgen der Kontaktliste, nicht der\n'
     '// Tabelle: was der Nutzer auf dem Schirm hat, findet er wieder.\n'
     'async function immoKontakteCsv(liste) {\n'
     '  const zellen = (w) => w.map((x) => \'"\' + String(x == null ? "" : x).replace(/"/g, \'""\') + \'"\').join(";");\n'
     '  let namen = {};\n'
     '  try {\n'
     '    const { data } = await window._sb.from("profiles").select("id, name");\n'
     '    (data || []).forEach((p) => { namen[p.id] = p.name || ""; });\n'
     '  } catch (f) {\n'
     '    console.warn("Zustaendige konnten nicht geladen werden:", f && f.message || f);\n'
     '  }\n'
     '  const kopf = ["Anrede", "Titel", "Vorname", "Nachname", "Firma", "Rollen",\n'
     '                "E-Mail", "Telefon", "Mobil", "Strasse", "PLZ", "Ort", "Land",\n'
     '                "Tags", "Zustaendig", "Quelle", "Werbung", "Newsletter",\n'
     '                "Angelegt am"];\n'
     '  // Widerrufene Werbeeinwilligung wird gekennzeichnet, nicht\n'
     '  // stillschweigend mitgeliefert: wer die Datei weiterverwendet, muss\n'
     '  // sehen, wem er nicht schreiben darf.\n'
     '  const zeilen = (liste || []).map((k) => zellen([\n'
     '    k.anrede || "", k.titel || "", k.vorname || "", k.nachname || "",\n'
     '    k.firma || "", (k.rollen || []).join(", "),\n'
     '    k.email || "", k.telefon || "", k.mobil || "",\n'
     '    k.strasse || "", k.plz || "", k.ort || "", k.land || "",\n'
     '    epKontaktWeitereText ? (epKontaktWeitereText(k) || "") : "",\n'
     '    namen[k.zustaendig_id] || "", k.quelle || "",\n'
     '    k.werbung_opt_out ? "widersprochen" : "",\n'
     '    k.newsletter_opt_in ? "angemeldet" + (k.newsletter_opt_in_am ? " am " + String(k.newsletter_opt_in_am).slice(0, 10) : "") : "",\n'
     '    String(k.created_at || "").slice(0, 10)\n'
     '  ]));\n'
     '  const text = [zellen(kopf)].concat(zeilen).join("\\\\r\\\\n");\n'
     '  const blob = new Blob(["\\\\ufeff" + text], { type: "text/csv;charset=utf-8" });\n'
     '  const a = document.createElement("a");\n'
     '  a.href = URL.createObjectURL(blob);\n'
     '  a.download = "adressbuch-" + new Date().toISOString().slice(0, 10) + ".csv";\n'
     '  document.body.appendChild(a);\n'
     '  a.click();\n'
     '  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);\n'
     '  await logAction("export", "kontakte", "", "Adressbuch als CSV", {\n'
     '    anzahl: (liste || []).length,\n'
     '    mit_werbewiderspruch: (liste || []).filter((k) => k.werbung_opt_out).length\n'
     '  });\n'
     '}\n'
     '\nfunction canDelete(e) {',
     'Adressbuch: die CSV-Ausgabe samt Protokolleintrag.'),

    # =====================================================================
    # FORK — eigene Vertragsvorlagen je Mandant, angefordert am 28.09.2026
    #
    # VORLAGE_MAKLERVERTRAG und VORLAGE_OBJEKTNACHWEIS sind im Fork geleert
    # (Abschnitt 5 von docs/NEUTRALITAET.md: Rechtstexte der Referenz werden
    # ersetzt, nicht uebernommen). Seitdem entsteht gar kein Vertrag mehr.
    # Statt eines neuen fest eingebauten Textes kommt die Vorlage ab hier vom
    # Mandanten — aus dem Eimer vertragsvorlagen, ueber die Tabelle
    # public.vertragsvorlagen (fork_12).
    # =====================================================================
    ('FORK',
     r'\nasync function fillMaklervertrag\(e\) \{\n  const t = base64ToBlob\(VORLAGE_MAKLERVERTRAG\),',
     '\n'
     '// Die Word-Vorlage des Mandanten. Gesucht wird von innen nach aussen:\n'
     '// erst die der eigenen Gesellschaft, sonst die des Mandanten, jeweils die\n'
     '// hoechste aktive Version.\n'
     '//\n'
     '// KEIN eingebauter Ersatztext. Ein Vertragsmuster, das niemand geprueft\n'
     '// hat, wird benutzt, als waere es geprueft — CLAUDE.md verbietet genau\n'
     '// das ("Vertragsmuster nie ungeprueft als rechtssicher bezeichnen").\n'
     '// Fehlt die Vorlage, sagt die Anwendung das und nennt den Weg dorthin,\n'
     '// statt etwas Erfundenes auszugeben.\n'
     'async function immoVertragsvorlage(art, eingebaut) {\n'
     '  const bezeichnung = {\n'
     '    maklervertrag: "Maklervertrag", vollmacht: "Vollmacht",\n'
     '    objektnachweis: "Objektnachweis", reservierung: "Reservierung"\n'
     '  }[art] || art;\n'
     '  try {\n'
     '    const { data } = await window._sb.from("vertragsvorlagen")\n'
     '      .select("storage_pfad, gesellschaft_id, version")\n'
     '      .eq("art", art).eq("aktiv", true)\n'
     '      .order("version", { ascending: false });\n'
     '    const treffer = (data || []);\n'
     '    const eigene = window.IMMO_GESELLSCHAFT_ID\n'
     '      ? treffer.find((v) => v.gesellschaft_id === window.IMMO_GESELLSCHAFT_ID)\n'
     '      : null;\n'
     '    const gewaehlt = eigene || treffer.find((v) => !v.gesellschaft_id) || null;\n'
     '    if (gewaehlt) {\n'
     '      const { data: datei, error } = await window._sb.storage\n'
     '        .from("vertragsvorlagen").download(gewaehlt.storage_pfad);\n'
     '      if (error) throw error;\n'
     '      if (datei) return datei;\n'
     '    }\n'
     '  } catch (f) {\n'
     '    console.warn("Vertragsvorlage konnte nicht geladen werden:", f && f.message || f);\n'
     '  }\n'
     '  if (eingebaut) return base64ToBlob(eingebaut);\n'
     '  throw new Error("Für „" + bezeichnung + "“ ist keine Vorlage hinterlegt. "\n'
     '    + "Eine Word-Datei lädt hoch, wer den Admin-Bereich darf: "\n'
     '    + "Einstellungen → Vertragsvorlagen.");\n'
     '}\n'
     '\nasync function fillMaklervertrag(e) {\n'
     '  const t = await immoVertragsvorlage("maklervertrag", VORLAGE_MAKLERVERTRAG),',
     'Vertragsvorlagen: Lader und Maklervertrag daran angeschlossen.'),

    ('FORK',
     r'async function fillObjektnachweis\(e\) \{\n  const t = base64ToBlob\(VORLAGE_OBJEKTNACHWEIS\),',
     'async function fillObjektnachweis(e) {\n'
     '  const t = await immoVertragsvorlage("objektnachweis", VORLAGE_OBJEKTNACHWEIS),',
     'Vertragsvorlagen: Objektnachweis daran angeschlossen.'),

    # Der Reiter in den Einstellungen. Fuenfter neben Firma, Standorte,
    # Signatur und Vorgaben — dort gehoert er hin, denn es sind Firmendaten.
    ('FORK',
     r'  const reiterListe = \[\["firma", "Firma & Impressum"\], \["standorte", "Standorte"\], \["signatur", "Signatur & Texte"\], \["vorgaben", "Vorgaben"\]\];',
     '  const reiterListe = [["firma", "Firma & Impressum"], ["standorte", "Standorte"], ["signatur", "Signatur & Texte"], ["vorgaben", "Vorgaben"], ["vertragsvorlagen", "Vertragsvorlagen"]];',
     'Einstellungen: fuenfter Reiter fuer die Vertragsvorlagen.'),

    ('FORK',
     r'      : reiter === "signatur" \? React\.createElement\(EinstSignatur, \{ user \}\)\n      : React\.createElement\(EinstVorgaben, null\)\);',
     '      : reiter === "signatur" ? React.createElement(EinstSignatur, { user })\n'
     '      : reiter === "vertragsvorlagen" ? React.createElement(EinstVertragsvorlagen, { user })\n'
     '      : React.createElement(EinstVorgaben, null));',
     'Einstellungen: der Reiter zeigt EinstVertragsvorlagen.'),

    # Die Seite selbst, neben EinstStandorte.
    ('FORK',
     r'\n// Die Standorte sind kein eigener Datentopf mehr, sondern die Sicht auf firma_stammdaten\.',
     '\n'
     '// Vertragsvorlagen je Mandant. Hochladen darf nur, wer das Modul "admin"\n'
     '// hat; das erzwingen die Richtlinien aus fork_12 in der Datenbank und im\n'
     '// Dateispeicher. Was hier steht, blendet nur aus, was ohnehin scheitern\n'
     '// wuerde.\n'
     'const IMMO_VERTRAGSARTEN = [\n'
     '  ["maklervertrag", "Maklervertrag", "Der Auftrag des Eigentümers. Platzhalter: {firma_name}, {geschaeftsfuehrer}, {strasse}, {plz_ort}."],\n'
     '  ["vollmacht", "Vollmacht", "Die Vollmacht des Auftraggebers."],\n'
     '  ["objektnachweis", "Objektnachweis", "Der Nachweis gegenüber dem Interessenten."],\n'
     '  ["reservierung", "Reservierung", "Die Reservierungsvereinbarung."]\n'
     '];\n'
     '\n'
     'function EinstVertragsvorlagen({ user }) {\n'
     '  const [zeilen, setZeilen] = useState([]);\n'
     '  const [laedt, setLaedt] = useState(true);\n'
     '  const [meldung, setMeldung] = useState("");\n'
     '  const [fehler, setFehler] = useState("");\n'
     '  const [beschaeftigt, setBeschaeftigt] = useState("");\n'
     '  const darfPflegen = hatRecht(user, "admin");\n'
     '  const laden = async () => {\n'
     '    setLaedt(true);\n'
     '    try {\n'
     '      const { data, error } = await window._sb.from("vertragsvorlagen")\n'
     '        .select("*").order("art").order("version", { ascending: false });\n'
     '      if (error) throw error;\n'
     '      setZeilen(data || []);\n'
     '    } catch (f) {\n'
     '      setFehler("Vorlagen konnten nicht geladen werden: " + (f.message || f));\n'
     '    }\n'
     '    setLaedt(false);\n'
     '  };\n'
     '  useEffect(() => { laden(); }, []);\n'
     '  const aktuelle = (art) => (zeilen.filter((z) => z.art === art && z.aktiv)[0] || null);\n'
     '  const hochladen = async (art, datei) => {\n'
     '    if (!datei) return;\n'
     '    setFehler(""); setMeldung(""); setBeschaeftigt(art);\n'
     '    try {\n'
     '      const vorher = zeilen.filter((z) => z.art === art);\n'
     '      const version = vorher.reduce((m, z) => Math.max(m, z.version || 0), 0) + 1;\n'
     '      // Mandantenrelativ: die Speicher-Huelle stellt die Mandantenkennung\n'
     '      // voran, die Richtlinie aus fork_09 prueft sie.\n'
     '      const pfad = "vorlagen/" + art + "/v" + version + "-" + Date.now() + ".docx";\n'
     '      const { error: uErr } = await window._sb.storage.from("vertragsvorlagen")\n'
     '        .upload(pfad, datei, { upsert: false,\n'
     '          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });\n'
     '      if (uErr) throw uErr;\n'
     '      // Die neue Fassung gilt, die alten bleiben liegen.\n'
     '      await window._sb.from("vertragsvorlagen").update({ aktiv: false }).eq("art", art);\n'
     '      const { error: iErr } = await window._sb.from("vertragsvorlagen").insert({\n'
     '        art, storage_pfad: pfad, dateiname: datei.name || "", version, aktiv: true,\n'
     '        gesellschaft_id: window.IMMO_GESELLSCHAFT_ID || null,\n'
     '        hochgeladen_von: window._currentUserId || null\n'
     '      });\n'
     '      if (iErr) throw iErr;\n'
     '      await logAction("upload", "vertragsvorlage", art, datei.name || art, { version });\n'
     '      setMeldung("Vorlage für „" + art + "“ gespeichert (Fassung " + version + ").");\n'
     '      await laden();\n'
     '    } catch (f) {\n'
     '      setFehler("Hochladen fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '    setBeschaeftigt("");\n'
     '  };\n'
     '  if (laedt) return React.createElement("div", { style: { padding: 24, color: CI.muted } }, "Lade Vorlagen …");\n'
     '  return React.createElement("div", null,\n'
     '    React.createElement("div", { style: { fontSize: 13, color: CI.muted, marginBottom: 16, lineHeight: 1.6 } },\n'
     '      "Hier hinterlegst du deine eigenen Word-Vorlagen. Sie werden verwendet, sobald sie da sind; ",\n'
     '      "eine neue Fassung ersetzt die alte nicht, sie überholt sie — ältere bleiben nachvollziehbar liegen."),\n'
     '    React.createElement("div", { style: { padding: "12px 14px", background: `${CI.gold}18`,\n'
     '      borderLeft: `3px solid ${CI.gold}`, fontSize: 12.5, color: CI.blau, lineHeight: 1.5, marginBottom: 20 } },\n'
     '      React.createElement("strong", null, "Rechtlicher Hinweis: "),\n'
     '      "Diese Anwendung prüft die hochgeladenen Texte nicht und macht keine Aussage darüber, "\n'
     '      + "ob sie rechtssicher sind. Die inhaltliche und rechtliche Verantwortung für jede Vorlage "\n'
     '      + "liegt bei dir; eine anwaltliche Prüfung ist erforderlich."),\n'
     '    React.createElement(ErrorBox, null, fehler),\n'
     '    React.createElement(SuccessBox, null, meldung),\n'
     '    !darfPflegen ? React.createElement("div", { style: { fontSize: 12.5, color: CI.muted, marginBottom: 16 } },\n'
     '      "Zum Ändern fehlt dir das Recht „Admin-Bereich“ — du siehst hier nur, was hinterlegt ist.") : null,\n'
     '    React.createElement("div", { style: { display: "grid",\n'
     '      gridTemplateColumns: "repeat(auto-fit, minmax(min(300px,100%), 1fr))", gap: 12 } },\n'
     '      IMMO_VERTRAGSARTEN.map(([art, label, hinweis]) => {\n'
     '        const jetzt = aktuelle(art);\n'
     '        return React.createElement("div", { key: art, "data-vertragsart": art,\n'
     '          style: { border: `1px solid ${CI.border}`, padding: 16, background: "#fff" } },\n'
     '          React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: CI.blau } }, label),\n'
     '          React.createElement("div", { style: { fontSize: 12, color: CI.muted, marginTop: 6, lineHeight: 1.5 } }, hinweis),\n'
     '          React.createElement("div", { style: { fontSize: 12.5, marginTop: 12,\n'
     '            color: jetzt ? CI.blau : CI.muted } },\n'
     '            jetzt ? ("Fassung " + jetzt.version + (jetzt.dateiname ? " — " + jetzt.dateiname : ""))\n'
     '                  : "Noch keine Vorlage hinterlegt."),\n'
     '          darfPflegen ? React.createElement("label", { style: { ...secondaryBtn, display: "inline-flex",\n'
     '            marginTop: 12, cursor: beschaeftigt === art ? "wait" : "pointer",\n'
     '            opacity: beschaeftigt === art ? .6 : 1 } },\n'
     '            beschaeftigt === art ? "Lädt …" : (jetzt ? "Neue Fassung hochladen" : "Vorlage hochladen"),\n'
     '            React.createElement("input", { type: "file", accept: ".docx", style: { display: "none" },\n'
     '              disabled: beschaeftigt === art,\n'
     '              onChange: (ev) => { const d = ev.target.files && ev.target.files[0];\n'
     '                ev.target.value = ""; hochladen(art, d); } })) : null);\n'
     '      })));\n'
     '}\n'
     '\n// Die Standorte sind kein eigener Datentopf mehr, sondern die Sicht auf firma_stammdaten.',
     'Einstellungen: die Seite EinstVertragsvorlagen.'),

    # =====================================================================
    # MARKE — die Farbwerte der Referenz gegen die Plattform-CI
    #
    # docs/NEUTRALITAET.md nennt unter "Neutralisiert wird die Marke" die
    # Farbwerte ausdruecklich, und CLAUDE.md legt die Plattform-CI fest:
    # Marineblau #1B2A47 (dunkel #12203B), Gold #B5934F (hell #C9AE72),
    # Hintergrund #FAFAFA, Karten #FFFFFF, Linien #E6E8EB, gedaempfter Text
    # #7A828C. Im Quelltext standen bis hierher die der Referenz.
    #
    # Das ist KEIN Redesign: Layout, Komponenten, Icons und Abstaende bleiben
    # unveraendert. Getauscht werden acht Zahlen.
    # =====================================================================
    ('MARKE', r'    blau: "#263159",\n    gold: "#D4A567",\n    blauDark: "#1a2342",\n    goldLight: "#e0bd80",\n    bg: "#FAFAF7",\n    card: "#FFFFFF",\n    border: "#E8E4DA",\n    ink: "#263159",\n    muted: "#8B8377",',
     '    blau: "#1B2A47",\n'
     '    gold: "#B5934F",\n'
     '    blauDark: "#12203B",\n'
     '    goldLight: "#C9AE72",\n'
     '    bg: "#FAFAFA",\n'
     '    card: "#FFFFFF",\n'
     '    border: "#E6E8EB",\n'
     '    ink: "#1B2A47",\n'
     '    muted: "#7A828C",',
     'Farbwerte der Referenz gegen die Plattform-CI aus CLAUDE.md.'),
    ('MARKE', r'<meta name="theme-color" content="#263159" />',
     '<meta name="theme-color" content="#1B2A47" />',
     'Themenfarbe der Huelle: Marineblau der Plattform statt der Referenz.'),
    # Das SVG-Favicon war ein Marineblau-Quadrat mit dem Wort "ImmoOffice"
    # in 14 px — auf 32 Pixeln ein grauer Streifen, auf 16 gar nichts. Seit
    # der Lieferung vom 06.10.2026 gibt es eine Bildmarke; bei dieser
    # Groesse traegt die Haus-Kontur allein, ohne das Netz-Motiv.
    ('MARKE',
     r'<link rel=.icon. type=.image/svg\+xml. href=.data:image/svg\+xml,<svg[^>]*>.*?</svg>. />',
     '<link rel="icon" type="image/svg+xml" href="/marke/immooffice-haus.svg" />',
     'Favicon: die eigene Bildmarke statt eines Schriftzugs im Quadrat.'),
    ('MARKE', r'rgba\(38,49,89,0\.06\)', 'rgba(27,42,71,0.06)',
     'Schattenfarbe, aus demselben Marineblau.'),
    ('MARKE', r'rgba\(38,49,89,0\.12\)', 'rgba(27,42,71,0.12)',
     'Schattenfarbe beim Ueberfahren, aus demselben Marineblau.'),

    # =====================================================================
    # FORK — Abschnitt 2: Mandanten-CI und Logo
    #
    # Die Farben liegen seit fork_13 an firma_stammdaten (ci_primaer,
    # ci_akzent, ci_font), das Logo lag dort schon (logo_pfad, Eimer
    # branding-assets — die PDF-Funktionen der Vorlage lesen es von dort).
    # Die Oberflaeche kannte beides nicht.
    #
    # WARUM NUR FUENF STILE NACHGEZOGEN WERDEN: CI wird an ueber 6000 Stellen
    # gelesen, aber fast immer beim Rendern — eine Aenderung an den
    # Eigenschaften des Objekts kommt dort von selbst an. Nur fuenf Stile
    # stehen auf Modulebene und haben ihre Farben zur Ladezeit eingebacken.
    # Die werden ueberschrieben, nicht neu gebaut: jeder Aufrufer haelt
    # dieselbe Referenz.
    # =====================================================================
    ('FORK',
     r'\nfunction Logo\(\{\n  height: e = 60,\n  variant: t = "blau"\n\}\) \{\n  return React\.createElement\("img", \{\n    src: "dunkel" === t \? LOGO_DUNKEL : LOGO_BLAU,\n    alt: "Musterhaus Immobilien GmbH",',
     '\n'
     '// Die CI des Mandanten anwenden. Wird aus getProfile gerufen, also nach\n'
     '// der Anmeldung und bevor React mit dem Profil neu rendert.\n'
     '//\n'
     '// Leere Werte heissen "nichts einstellen", nicht "weiss": dann bleibt die\n'
     '// Plattform-CI stehen. So steht es in docs/NEUTRALITAET.md Abschnitt 4.\n'
     'const IMMO_CI_PLATTFORM = { ...CI };\n'
     'async function immoCiAnwenden(stamm) {\n'
     '  const hex = (w) => (typeof w === "string" && /^#[0-9A-Fa-f]{6}$/.test(w)) ? w : null;\n'
     '  const primaer = hex(stamm && stamm.ci_primaer);\n'
     '  const akzent = hex(stamm && stamm.ci_akzent);\n'
     '  // Immer von der Plattform-CI aus, nie vom zuletzt Gesetzten: sonst\n'
     '  // bliebe beim Abmelden die Farbe des vorigen Mandanten stehen.\n'
     '  Object.assign(CI, IMMO_CI_PLATTFORM);\n'
     '  if (primaer) { CI.blau = primaer; CI.ink = primaer; CI.blauDark = immoAbdunkeln(primaer, .25); }\n'
     '  if (akzent) { CI.gold = akzent; CI.goldLight = immoAbdunkeln(akzent, -.3); }\n'
     '  if (primaer) {\n'
     '    const r = parseInt(primaer.slice(1, 3), 16), g = parseInt(primaer.slice(3, 5), 16), b = parseInt(primaer.slice(5, 7), 16);\n'
     '    CI.shadow = `0 2px 12px rgba(${r},${g},${b},0.06)`;\n'
     '    CI.shadowHover = `0 12px 32px rgba(${r},${g},${b},0.12)`;\n'
     '  }\n'
     '  // Die fuenf Stile auf Modulebene haben ihre Farben zur Ladezeit\n'
     '  // eingebacken. Ueberschreiben statt neu bauen — jeder Aufrufer haelt\n'
     '  // dieselbe Referenz.\n'
     '  Object.assign(inputStyle, { border: `1px solid ${CI.border}`, background: CI.card, color: CI.ink });\n'
     '  Object.assign(labelStyle, { color: CI.muted });\n'
     '  Object.assign(primaryBtn, { background: CI.blau, color: "#fff" });\n'
     '  Object.assign(secondaryBtn, { background: "transparent", color: CI.blau, border: `1px solid ${CI.border}` });\n'
     '  Object.assign(cardStyle, { background: CI.card, border: `1px solid ${CI.border}`, boxShadow: CI.shadow });\n'
     '  window.IMMO_LOGO_URL = null;\n'
     '  window.IMMO_MARKE = (stamm && (stamm.marken_name || stamm.firma_name)) || null;\n'
     '  // branding-assets ist NICHT oeffentlich — dort liegen neben den Logos\n'
     '  // auch Schriften und Unterschriftsbilder. Also eine signierte Adresse,\n'
     '  // acht Stunden gueltig; bei jeder Anmeldung entsteht eine neue.\n'
     '  if (stamm && stamm.logo_pfad) {\n'
     '    try {\n'
     '      const { data } = await window._sb.storage.from("branding-assets")\n'
     '        .createSignedUrl(stamm.logo_pfad, 60 * 60 * 8);\n'
     '      window.IMMO_LOGO_URL = (data && data.signedUrl) || null;\n'
     '    } catch (f) { window.IMMO_LOGO_URL = null; }\n'
     '  }\n'
     '  if (typeof document !== "undefined" && document.documentElement) {\n'
     '    const s = document.documentElement.style;\n'
     '    s.setProperty("--immo-primaer", CI.blau);\n'
     '    s.setProperty("--immo-akzent", CI.gold);\n'
     '    if (stamm && stamm.ci_font) s.setProperty("--immo-font", stamm.ci_font);\n'
     '  }\n'
     '}\n'
     '// Hellt auf (negativer Anteil) oder dunkelt ab. Ohne Bibliothek, weil es\n'
     '// fuer zwei abgeleitete Farbtoene keine braucht.\n'
     'function immoAbdunkeln(farbe, anteil) {\n'
     '  const z = (i) => {\n'
     '    const w = parseInt(farbe.slice(i, i + 2), 16);\n'
     '    const neu = anteil >= 0 ? w * (1 - anteil) : w + (255 - w) * -anteil;\n'
     '    return Math.max(0, Math.min(255, Math.round(neu))).toString(16).padStart(2, "0");\n'
     '  };\n'
     '  return "#" + z(1) + z(3) + z(5);\n'
     '}\n'
     '\n'
     '// Vorschau eines Logos im Einstellungsformular. Eigene Komponente, weil\n'
     '// die Adresse signiert werden muss und das nicht im Rendern geht.\n'
     'function ImmoLogoVorschau({ pfad }) {\n'
     '  const [adresse, setAdresse] = useState(null);\n'
     '  useEffect(() => {\n'
     '    let laeuft = true;\n'
     '    window._sb.storage.from("branding-assets").createSignedUrl(pfad, 60 * 60)\n'
     '      .then(({ data }) => { if (laeuft) setAdresse((data && data.signedUrl) || null); })\n'
     '      .catch(() => { if (laeuft) setAdresse(null); });\n'
     '    return () => { laeuft = false; };\n'
     '  }, [pfad]);\n'
     '  if (!adresse) return React.createElement("span", {\n'
     '    style: { fontSize: 12, color: CI.muted }\n'
     '  }, "Logo hinterlegt");\n'
     '  return React.createElement("img", {\n'
     '    src: adresse,\n'
     '    alt: "Logo",\n'
     '    style: { height: 34, width: "auto", border: `1px solid ${CI.border}`, background: "#fff", padding: 2 }\n'
     '  });\n'
     '}\n'
     '\n'
     '// Das Logo: erst das des Mandanten, sonst eine Wortmarke aus dem\n'
     '// Firmennamen. Genau so verlangt es docs/NEUTRALITAET.md Abschnitt 4 —\n'
     '// und bis hierher stand hier ein <img src="">, also ein kaputtes Bild,\n'
     '// weil die eingebauten Logos der Referenz geleert worden sind.\n'
     'function Logo({\n'
     '  height: e = 60,\n'
     '  variant: t = "blau"\n'
     '}) {\n'
     '  const quelle = window.IMMO_LOGO_URL || ("dunkel" === t ? LOGO_DUNKEL : LOGO_BLAU);\n'
     '  const marke = window.IMMO_MARKE || "ImmoOffice";\n'
     '  if (!quelle) return React.createElement("div", {\n'
     '    style: {\n'
     '      height: e, display: "flex", alignItems: "center",\n'
     '      fontFamily: FONT_SERIF, fontSize: Math.max(14, Math.round(e * .42)),\n'
     '      fontWeight: 600, letterSpacing: ".04em", whiteSpace: "nowrap",\n'
     '      color: "dunkel" === t ? "#fff" : CI.blau\n'
     '    }\n'
     '  }, marke);\n'
     '  return React.createElement("img", {\n'
     '    src: quelle,\n'
     '    alt: marke,',
     'Mandanten-CI anwenden und das Logo mit Wortmarken-Ersatz.'),

    # getProfile holt die CI gleich mit — es ist die einzige Stelle, an der das
    # Profil des Angemeldeten geladen wird.
    ('FORK',
     r'      \.select\("id, bundesland, gesellschaft_id"\)',
     '      .select("id, bundesland, gesellschaft_id, ci_primaer, ci_akzent, ci_font, logo_pfad, marken_name, firma_name, strasse, plz, ort, telefon, email, web")',
     'getProfile laedt auch die CI des Standorts — und seit dem 03.10. die '
     'Kontaktfelder: Anschrift, Telefon, Mail, Web standen an mehreren '
     'Stellen im Quelltext.'),
    ('FORK',
     r'    window\.IMMO_BUNDESLAND = \(s && s\.bundesland\) \|\| null;\n  \} catch \(f\) \{',
     '    window.IMMO_BUNDESLAND = (s && s.bundesland) || null;\n'
     '    await immoCiAnwenden(s);\n'
     '  } catch (f) {',
     'getProfile wendet die CI an.'),
    ('FORK',
     r'    window\.IMMO_BUNDESLAND = null;\n  \}\n  return t\n\}',
     '    window.IMMO_BUNDESLAND = null;\n'
     '    await immoCiAnwenden(null);\n'
     '  }\n'
     '  return t\n'
     '}',
     'Faellt die Abfrage aus, gilt die Plattform-CI.'),

    # Die Bedienelemente: zwei Farben, eine Schrift, ein Logo — je Standort,
    # neben dem Markennamen. Dort steht schon, wie der Mandant nach aussen
    # auftritt.
    ('FORK',
     r'    placeholder: "z\. B\. Musterhaus Immobilien GmbH Beispielstadt"\n  \}\)\), React\.createElement\("div", null, React\.createElement\("label", \{\n    style: u\n  \}, "Web"\)',
     '    placeholder: "z. B. Musterhaus Immobilien GmbH Beispielstadt"\n'
     '  })), React.createElement("div", null, React.createElement("label", {\n'
     '    style: u\n'
     '  }, "Primärfarbe"), React.createElement("div", {\n'
     '    style: { display: "flex", gap: 8, alignItems: "center" }\n'
     '  }, React.createElement("input", {\n'
     '    type: "color",\n'
     '    value: e.ci_primaer || CI.blau,\n'
     '    onChange: t => c(e.id, "ci_primaer", t.target.value.toUpperCase()),\n'
     '    style: { width: 44, height: 38, padding: 0, border: `1px solid ${CI.border}`, background: "#fff", cursor: "pointer" }\n'
     '  }), React.createElement("input", {\n'
     '    style: { ...d, flex: 1 },\n'
     '    value: e.ci_primaer || "",\n'
     '    onChange: t => c(e.id, "ci_primaer", t.target.value.trim().toUpperCase()),\n'
     '    placeholder: "leer = Plattformfarbe"\n'
     '  }))), React.createElement("div", null, React.createElement("label", {\n'
     '    style: u\n'
     '  }, "Akzentfarbe"), React.createElement("div", {\n'
     '    style: { display: "flex", gap: 8, alignItems: "center" }\n'
     '  }, React.createElement("input", {\n'
     '    type: "color",\n'
     '    value: e.ci_akzent || CI.gold,\n'
     '    onChange: t => c(e.id, "ci_akzent", t.target.value.toUpperCase()),\n'
     '    style: { width: 44, height: 38, padding: 0, border: `1px solid ${CI.border}`, background: "#fff", cursor: "pointer" }\n'
     '  }), React.createElement("input", {\n'
     '    style: { ...d, flex: 1 },\n'
     '    value: e.ci_akzent || "",\n'
     '    onChange: t => c(e.id, "ci_akzent", t.target.value.trim().toUpperCase()),\n'
     '    placeholder: "leer = Plattformfarbe"\n'
     '  }))), React.createElement("div", null, React.createElement("label", {\n'
     '    style: u\n'
     '  }, "Schriftfamilie"), React.createElement("input", {\n'
     '    style: d,\n'
     '    value: e.ci_font || "",\n'
     '    onChange: t => c(e.id, "ci_font", t.target.value),\n'
     '    placeholder: "leer = Montserrat"\n'
     '  })), React.createElement("div", null, React.createElement("label", {\n'
     '    style: u\n'
     '  }, "Logo"), React.createElement("div", {\n'
     '    style: { display: "flex", gap: 8, alignItems: "center" }\n'
     '  }, e.logo_pfad ? React.createElement(ImmoLogoVorschau, { pfad: e.logo_pfad })\n'
     '    : React.createElement("span", {\n'
     '    style: { fontSize: 12, color: CI.muted }\n'
     '  }, "Ohne Logo steht der Markenname"), React.createElement("label", {\n'
     '    style: { ...secondaryBtn, padding: "7px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }\n'
     '  }, e.logo_pfad ? "Ersetzen" : "Hochladen", React.createElement("input", {\n'
     '    type: "file",\n'
     '    accept: "image/png,image/jpeg,image/svg+xml,image/webp",\n'
     '    style: { display: "none" },\n'
     '    onChange: async (ev) => {\n'
     '      const datei = ev.target.files && ev.target.files[0];\n'
     '      ev.target.value = "";\n'
     '      if (!datei) return;\n'
     '      try {\n'
     '        const endung = (datei.name.split(".").pop() || "png").toLowerCase();\n'
     '        // Mandantenrelativ — die Speicher-Huelle stellt die\n'
     '        // Mandantenkennung voran, die Richtlinie aus fork_09 prueft sie.\n'
     '        const pfad = "logos/" + e.id + "-" + Date.now() + "." + endung;\n'
     '        const { error: uErr } = await window._sb.storage.from("branding-assets")\n'
     '          .upload(pfad, datei, { upsert: false, contentType: datei.type || undefined });\n'
     '        if (uErr) throw uErr;\n'
     '        c(e.id, "logo_pfad", pfad);\n'
     '        await logAction("upload", "logo", e.id, e.firma_name || "", { pfad });\n'
     '      } catch (f) {\n'
     '        alert("Logo konnte nicht hochgeladen werden: " + (f.message || f));\n'
     '      }\n'
     '    }\n'
     '  })))), React.createElement("div", null, React.createElement("label", {\n'
     '    style: u\n'
     '  }, "Web")',
     'Firmendaten: Primaerfarbe, Akzentfarbe, Schrift und Logo je Standort.'),

    # Gespeichert werden sie mit.
    ('FORK',
     r'        marken_name: e\.marken_name,\n        web: e\.web,',
     '        marken_name: e.marken_name,\n'
     '        ci_primaer: e.ci_primaer || null,\n'
     '        ci_akzent: e.ci_akzent || null,\n'
     '        ci_font: e.ci_font || null,\n'
     '        logo_pfad: e.logo_pfad || null,\n'
     '        web: e.web,',
     'Firmendaten: CI und Logo mitspeichern.'),

    # =====================================================================
    # FORK — Abschnitt 3: Konto > Gesellschaften > Standorte
    #
    # Die Tabelle gesellschaften gibt es seit fork_02, firma_stammdaten
    # .gesellschaft_id seit fork_03, der Sichtbarkeitsbereich baut darauf
    # (fork_11) und die Vertragsvorlagen auch (fork_12). Nur anlegen und
    # zuordnen konnte sie niemand — in der ganzen Oberflaeche kam das Wort
    # "gesellschaften" kein einziges Mal vor.
    #
    # Die Richtlinien stehen bereits richtig: lesen darf jeder im Mandanten,
    # aendern nur der Chef (gesellschaften_chef_verwaltet). Die Oberflaeche
    # blendet entsprechend aus; durchgesetzt wird es in der Datenbank.
    # =====================================================================
    ('FORK',
     r'  const reiterListe = \[\["firma", "Firma & Impressum"\], \["standorte", "Standorte"\], \["signatur", "Signatur & Texte"\], \["vorgaben", "Vorgaben"\], \["vertragsvorlagen", "Vertragsvorlagen"\]\];',
     '  const reiterListe = [["firma", "Firma & Impressum"], ["gesellschaften", "Gesellschaften"], ["standorte", "Standorte"], ["signatur", "Signatur & Texte"], ["vorgaben", "Vorgaben"], ["vertragsvorlagen", "Vertragsvorlagen"]];',
     'Einstellungen: sechster Reiter fuer die Gesellschaften.'),

    ('FORK',
     r'      : reiter === "standorte" \? React\.createElement\(EinstStandorte, null\)',
     '      : reiter === "gesellschaften" ? React.createElement(EinstGesellschaften, { user })\n'
     '      : reiter === "standorte" ? React.createElement(EinstStandorte, null)',
     'Einstellungen: der Reiter zeigt EinstGesellschaften.'),

    ('FORK',
     r'\n// Vertragsvorlagen je Mandant\. Hochladen darf nur, wer das Modul "admin"',
     '\n'
     '// Die Gesellschaften eines Mandanten. Zwischen Konto und Standort: ein\n'
     '// Mandant kann mehrere Gesellschaften fuehren, jede mit eigenen\n'
     '// Standorten, eigenem Briefkopf und eigenem Rechnungsnummernkreis.\n'
     '//\n'
     '// Geloescht wird nicht, sondern stillgelegt: an einer Gesellschaft haengen\n'
     '// Standorte, und an denen haengen Rechnungen, deren Nummernkreis nicht\n'
     '// verschwinden darf.\n'
     'const IMMO_RECHTSFORMEN = ["GmbH", "GmbH & Co. KG", "UG (haftungsbeschränkt)",\n'
     '  "AG", "KG", "OHG", "GbR", "PartG", "PartG mbB", "e.K.", "Einzelunternehmen",\n'
     '  "eG", "Stiftung", "Sonstige"];\n'
     '\n'
     'function EinstGesellschaften({ user }) {\n'
     '  const [zeilen, setZeilen] = useState([]);\n'
     '  const [standorte, setStandorte] = useState([]);\n'
     '  const [laedt, setLaedt] = useState(true);\n'
     '  const [meldung, setMeldung] = useState("");\n'
     '  const [fehler, setFehler] = useState("");\n'
     '  const [speichert, setSpeichert] = useState(null);\n'
     '  const [neuName, setNeuName] = useState("");\n'
     '  const [neuForm, setNeuForm] = useState("GmbH");\n'
     '  const darfAendern = user && "chef" === user.role;\n'
     '  const laden = async () => {\n'
     '    setLaedt(true);\n'
     '    try {\n'
     '      const [g, s] = await Promise.all([\n'
     '        window._sb.from("gesellschaften").select("*").order("sortierung").order("name"),\n'
     '        window._sb.from("firma_stammdaten").select("id, firma_name, ort, gesellschaft_id, aktiv").order("sortierung")\n'
     '      ]);\n'
     '      if (g.error) throw g.error;\n'
     '      if (s.error) throw s.error;\n'
     '      setZeilen(g.data || []);\n'
     '      setStandorte(s.data || []);\n'
     '    } catch (f) {\n'
     '      setFehler("Gesellschaften konnten nicht geladen werden: " + (f.message || f));\n'
     '    }\n'
     '    setLaedt(false);\n'
     '  };\n'
     '  useEffect(() => { laden(); }, []);\n'
     '  const anlegen = async () => {\n'
     '    const name = neuName.trim();\n'
     '    if (!name) { setFehler("Bitte einen Namen eintragen."); return; }\n'
     '    setFehler(""); setMeldung(""); setSpeichert("neu");\n'
     '    try {\n'
     '      // mandant_id kommt aus dem Standardwert aktuelle_mandant_id().\n'
     '      const { error } = await window._sb.from("gesellschaften").insert({\n'
     '        name, rechtsform: neuForm,\n'
     '        ist_standard: (zeilen || []).length === 0,\n'
     '        sortierung: (zeilen || []).length + 1\n'
     '      });\n'
     '      if (error) throw error;\n'
     '      await logAction("create", "gesellschaft", "", name, { rechtsform: neuForm });\n'
     '      setNeuName(""); setMeldung("„" + name + "“ angelegt.");\n'
     '      await laden();\n'
     '    } catch (f) {\n'
     '      setFehler("Anlegen fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '    setSpeichert(null);\n'
     '  };\n'
     '  const aendern = async (zeile, felder) => {\n'
     '    setFehler(""); setMeldung(""); setSpeichert(zeile.id);\n'
     '    try {\n'
     '      const { error } = await window._sb.from("gesellschaften")\n'
     '        .update({ ...felder, geaendert_am: new Date().toISOString() }).eq("id", zeile.id);\n'
     '      if (error) throw error;\n'
     '      await logAction("update", "gesellschaft", zeile.id, zeile.name, felder);\n'
     '      setMeldung("„" + zeile.name + "“ gespeichert.");\n'
     '      await laden();\n'
     '    } catch (f) {\n'
     '      setFehler("Speichern fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '    setSpeichert(null);\n'
     '  };\n'
     '  const zuordnen = async (standort, gesellschaftId) => {\n'
     '    setFehler(""); setMeldung(""); setSpeichert(standort.id);\n'
     '    try {\n'
     '      const { error } = await window._sb.from("firma_stammdaten")\n'
     '        .update({ gesellschaft_id: gesellschaftId || null }).eq("id", standort.id);\n'
     '      if (error) throw error;\n'
     '      await logAction("update", "standort", standort.id, standort.firma_name || "",\n'
     '        { gesellschaft_id: gesellschaftId || null });\n'
     '      setMeldung("Standort „" + (standort.firma_name || "") + "“ zugeordnet.");\n'
     '      await laden();\n'
     '    } catch (f) {\n'
     '      setFehler("Zuordnen fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '    setSpeichert(null);\n'
     '  };\n'
     '  if (laedt) return React.createElement("div", { style: { padding: 24, color: CI.muted } }, "Lade Gesellschaften …");\n'
     '  const ohne = standorte.filter((s) => !s.gesellschaft_id);\n'
     '  return React.createElement("div", null,\n'
     '    React.createElement("div", { style: { fontSize: 13, color: CI.muted, marginBottom: 16, lineHeight: 1.6 } },\n'
     '      "Zwischen Konto und Standort. Ein Konto kann mehrere Gesellschaften führen, jede mit eigenen ",\n'
     '      "Standorten, eigenem Briefkopf und eigenem Rechnungsnummernkreis. Wer nur eine Firma hat, ",\n'
     '      "legt eine an und ordnet ihr alle Standorte zu."),\n'
     '    React.createElement(ErrorBox, null, fehler),\n'
     '    React.createElement(SuccessBox, null, meldung),\n'
     '    !darfAendern ? React.createElement("div", { style: { fontSize: 12.5, color: CI.muted, marginBottom: 16 } },\n'
     '      "Ändern darf nur die Geschäftsführung — du siehst hier nur, was eingerichtet ist.") : null,\n'
     '    darfAendern ? React.createElement("div", { style: { ...cardStyle, marginBottom: 20, padding: 16 } },\n'
     '      React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: CI.blau, marginBottom: 10 } }, "Neue Gesellschaft"),\n'
     '      React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },\n'
     '        React.createElement("input", { style: { ...inputStyle, flex: "2 1 220px" },\n'
     '          value: neuName, placeholder: "Name, z. B. Musterhaus Immobilien GmbH",\n'
     '          onChange: (ev) => setNeuName(ev.target.value) }),\n'
     '        React.createElement("select", { style: { ...inputStyle, flex: "1 1 160px" },\n'
     '          value: neuForm, onChange: (ev) => setNeuForm(ev.target.value) },\n'
     '          IMMO_RECHTSFORMEN.map((r) => React.createElement("option", { key: r, value: r }, r))),\n'
     '        React.createElement("button", { onClick: anlegen, disabled: speichert === "neu",\n'
     '          style: { ...primaryBtn, opacity: speichert === "neu" ? .6 : 1 } },\n'
     '          speichert === "neu" ? "Legt an …" : "Anlegen"))) : null,\n'
     '    !zeilen.length ? React.createElement("div", { style: { fontSize: 13, color: CI.muted } },\n'
     '      "Noch keine Gesellschaft angelegt.")\n'
     '      : React.createElement("div", { style: { display: "grid", gap: 12 } },\n'
     '        zeilen.map((z) => {\n'
     '          const meine = standorte.filter((s) => s.gesellschaft_id === z.id);\n'
     '          return React.createElement("div", { key: z.id, "data-gesellschaft": z.id,\n'
     '            style: { ...cardStyle, padding: 16, opacity: z.aktiv === false ? .55 : 1 } },\n'
     '            React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } },\n'
     '              React.createElement("input", { style: { ...inputStyle, flex: "2 1 220px" },\n'
     '                defaultValue: z.name || "", disabled: !darfAendern,\n'
     '                onBlur: (ev) => { const w = ev.target.value.trim();\n'
     '                  if (w && w !== z.name) aendern(z, { name: w }); } }),\n'
     '              React.createElement("select", { style: { ...inputStyle, flex: "1 1 160px" },\n'
     '                value: z.rechtsform || "Sonstige", disabled: !darfAendern,\n'
     '                onChange: (ev) => aendern(z, { rechtsform: ev.target.value }) },\n'
     '                IMMO_RECHTSFORMEN.map((r) => React.createElement("option", { key: r, value: r }, r))),\n'
     '              z.ist_standard ? React.createElement("span", {\n'
     '                style: { fontSize: 11, color: CI.gold, fontWeight: 600, letterSpacing: ".05em" } }, "STANDARD") : null,\n'
     '              darfAendern ? React.createElement("button", {\n'
     '                onClick: () => aendern(z, { aktiv: !(z.aktiv !== false) }),\n'
     '                disabled: speichert === z.id,\n'
     '                title: "Stilllegen statt löschen — an einer Gesellschaft hängen Standorte und deren Rechnungsnummern",\n'
     '                style: { ...secondaryBtn, padding: "7px 12px", fontSize: 12 } },\n'
     '                z.aktiv === false ? "Wieder aktiv" : "Stilllegen") : null),\n'
     '            React.createElement("div", { style: { fontSize: 12, color: CI.muted, marginTop: 10, lineHeight: 1.6 } },\n'
     '              meine.length ? ("Standorte: " + meine.map((s) => s.firma_name || "—").join(", "))\n'
     '                           : "Noch kein Standort zugeordnet."));\n'
     '        })),\n'
     '    !ohne.length ? null : React.createElement("div", { style: { marginTop: 24 } },\n'
     '      React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: CI.blau, marginBottom: 8 } },\n'
     '        "Standorte ohne Gesellschaft (" + ohne.length + ")"),\n'
     '      React.createElement("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 10, lineHeight: 1.5 } },\n'
     '        "Solange ein Standort keiner Gesellschaft gehört, greift der Sichtbarkeitsbereich ",\n'
     '        React.createElement("strong", null, "Eigene Gesellschaft"), " für ihn nicht."),\n'
     '      React.createElement("div", { style: { display: "grid", gap: 8 } },\n'
     '        ohne.map((s) => React.createElement("div", { key: s.id,\n'
     '          style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },\n'
     '          React.createElement("span", { style: { flex: "1 1 200px", fontSize: 13, color: CI.blau } },\n'
     '            (s.firma_name || "—") + (s.ort ? " — " + s.ort : "")),\n'
     '          React.createElement("select", { style: { ...inputStyle, flex: "1 1 200px" },\n'
     '            value: "", disabled: !darfAendern || speichert === s.id,\n'
     '            onChange: (ev) => zuordnen(s, ev.target.value) },\n'
     '            React.createElement("option", { value: "" }, "Gesellschaft wählen …"),\n'
     '            zeilen.filter((z) => z.aktiv !== false).map((z) =>\n'
     '              React.createElement("option", { key: z.id, value: z.id }, z.name))))))));\n'
     '}\n'
     '\n'
     '// Vertragsvorlagen je Mandant. Hochladen darf nur, wer das Modul "admin"',
     'Einstellungen: die Seite EinstGesellschaften.'),

    # =====================================================================
    # FORK — Abschnitt 3c: Belegnummern pflegen
    #
    # Angefordert am 28.09.2026. Die Vorlage kann Praefix und "mit Jahr", das
    # Ergebnis ist immer PRAEFIX-JAHR-001. Der Auftrag will ein frei
    # gestaltbares Muster mit Live-Vorschau, einen eigenen Kreis fuer
    # Gutschriften und eine Ruecksetzung jaehrlich, monatlich oder nie.
    #
    # Die Vorschau rechnet NICHT in der Oberflaeche, sondern ruft dieselbe
    # Datenbankfunktion, die spaeter die echte Nummer erzeugt
    # (belegnummer_aus_muster). Zwei Fassungen derselben Regel laufen sonst
    # auseinander — bei hat_recht() ist genau das schon einmal aufgefallen.
    # =====================================================================
    ('FORK',
     r'  const reiterListe = \[\["firma", "Firma & Impressum"\], \["gesellschaften", "Gesellschaften"\], \["standorte", "Standorte"\], \["signatur", "Signatur & Texte"\], \["vorgaben", "Vorgaben"\], \["vertragsvorlagen", "Vertragsvorlagen"\]\];',
     '  const reiterListe = [["firma", "Firma & Impressum"], ["gesellschaften", "Gesellschaften"], ["standorte", "Standorte"], ["belegnummern", "Belegnummern"], ["signatur", "Signatur & Texte"], ["vorgaben", "Vorgaben"], ["vertragsvorlagen", "Vertragsvorlagen"]];',
     'Einstellungen: siebter Reiter fuer die Belegnummern.'),

    ('FORK',
     r'      : reiter === "gesellschaften" \? React\.createElement\(EinstGesellschaften, \{ user \}\)',
     '      : reiter === "gesellschaften" ? React.createElement(EinstGesellschaften, { user })\n'
     '      : reiter === "belegnummern" ? React.createElement(EinstBelegnummern, { user })',
     'Einstellungen: der Reiter zeigt EinstBelegnummern.'),

    ('FORK',
     r'\n// Die Gesellschaften eines Mandanten\. Zwischen Konto und Standort: ein',
     '\n'
     '// Belegnummern je Gesellschaft. Muster mit Platzhaltern, Vorschau aus\n'
     '// derselben Datenbankfunktion, die spaeter die echte Nummer erzeugt.\n'
     '//\n'
     '// Warum nicht in der Oberflaeche gerechnet: dann gaebe es die Regel\n'
     '// zweimal, und die beiden Fassungen laufen auseinander. Die Vorschau ist\n'
     '// hier nur Anzeige, die Wahrheit steht in der Datenbank.\n'
     'const IMMO_BELEGARTEN = [\n'
     '  ["rechnung", "Rechnung", "RE-{JJJJ}-{MM}-{#####}"],\n'
     '  ["gutschrift", "Gutschrift / Korrektur", "GS-{JJJJ}-{MM}-{#####}"]\n'
     '];\n'
     'const IMMO_RUECKSETZUNG = [\n'
     '  ["jaehrlich", "jährlich"], ["monatlich", "monatlich"], ["nie", "nie"]\n'
     '];\n'
     '\n'
     'function EinstBelegnummern({ user }) {\n'
     '  const [kreise, setKreise] = useState([]);\n'
     '  const [gesellschaften, setGesellschaften] = useState([]);\n'
     '  const [laedt, setLaedt] = useState(true);\n'
     '  const [meldung, setMeldung] = useState("");\n'
     '  const [fehler, setFehler] = useState("");\n'
     '  const [vorschau, setVorschau] = useState({});\n'
     '  const [entwurf, setEntwurf] = useState({});\n'
     '  const [speichert, setSpeichert] = useState(null);\n'
     '  const darfAendern = hatRecht(user, "rechnungen") || hatRecht(user, "admin");\n'
     '  const laden = async () => {\n'
     '    setLaedt(true);\n'
     '    try {\n'
     '      const [k, g] = await Promise.all([\n'
     '        window._sb.from("belegnummernkreise").select("*"),\n'
     '        window._sb.from("gesellschaften").select("id, name, aktiv").order("sortierung").order("name")\n'
     '      ]);\n'
     '      if (k.error) throw k.error;\n'
     '      if (g.error) throw g.error;\n'
     '      setKreise(k.data || []);\n'
     '      setGesellschaften(g.data || []);\n'
     '    } catch (f) {\n'
     '      setFehler("Belegnummern konnten nicht geladen werden: " + (f.message || f));\n'
     '    }\n'
     '    setLaedt(false);\n'
     '  };\n'
     '  useEffect(() => { laden(); }, []);\n'
     '  // Die Vorschau kommt aus der Datenbank, mit der Beispielnummer 1.\n'
     '  const vorschauHolen = async (schluessel, muster) => {\n'
     '    try {\n'
     '      const { data } = await window._sb.rpc("belegnummer_aus_muster", {\n'
     '        p_muster: muster, p_nummer: 1, p_standort: "NORD"\n'
     '      });\n'
     '      setVorschau((v) => ({ ...v, [schluessel]: data || "" }));\n'
     '    } catch (f) {\n'
     '      setVorschau((v) => ({ ...v, [schluessel]: "(Vorschau nicht möglich)" }));\n'
     '    }\n'
     '  };\n'
     '  const kreisVon = (gid, art) => kreise.filter(\n'
     '    (k) => k.art === art && (k.gesellschaft_id || null) === (gid || null))[0] || null;\n'
     '  const sichern = async (gid, art, felder) => {\n'
     '    setFehler(""); setMeldung(""); setSpeichert(gid + art);\n'
     '    try {\n'
     '      const vorhanden = kreisVon(gid, art);\n'
     '      if (vorhanden) {\n'
     '        const { error } = await window._sb.from("belegnummernkreise")\n'
     '          .update({ ...felder, geaendert_am: new Date().toISOString() }).eq("id", vorhanden.id);\n'
     '        if (error) throw error;\n'
     '      } else {\n'
     '        const { error } = await window._sb.from("belegnummernkreise")\n'
     '          .insert({ gesellschaft_id: gid || null, art, ...felder });\n'
     '        if (error) throw error;\n'
     '      }\n'
     '      await logAction("update", "belegnummernkreis", gid || "", art, felder);\n'
     '      setMeldung("Gespeichert.");\n'
     '      await laden();\n'
     '    } catch (f) {\n'
     '      setFehler("Speichern fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '    setSpeichert(null);\n'
     '  };\n'
     '  if (laedt) return React.createElement("div", { style: { padding: 24, color: CI.muted } }, "Lade Belegnummern …");\n'
     '  // Ohne Gesellschaft ein Kreis fuer das ganze Konto — der Einzelmakler\n'
     '  // richtet einen ein und ist fertig.\n'
     '  const zeilen = gesellschaften.length\n'
     '    ? gesellschaften.map((g) => ({ id: g.id, name: g.name }))\n'
     '    : [{ id: null, name: "Ganzes Konto" }];\n'
     '  return React.createElement("div", null,\n'
     '    React.createElement("div", { style: { fontSize: 13, color: CI.muted, marginBottom: 16, lineHeight: 1.6 } },\n'
     '      "Jede Gesellschaft stellt eigene Belege und hat deshalb einen eigenen Nummernkreis. ",\n'
     '      "Die Nummer wird in der Datenbank vergeben, lückenlos und auch dann eindeutig, ",\n'
     '      "wenn zwei Rechnungen gleichzeitig entstehen."),\n'
     '    React.createElement("div", { style: { padding: "12px 14px", background: `${CI.blau}0e`,\n'
     '      borderLeft: `3px solid ${CI.blau}`, fontSize: 12.5, color: CI.blau, lineHeight: 1.6, marginBottom: 20 } },\n'
     '      React.createElement("strong", null, "Platzhalter: "),\n'
     '      "{JJJJ} Jahr vierstellig · {JJ} zweistellig · {MM} Monat · {TT} Tag · ",\n'
     '      "{STANDORT} Kürzel des Standorts · {#} bis {##########} die fortlaufende Zahl, ",\n'
     '      "eine Raute je Stelle."),\n'
     '    React.createElement(ErrorBox, null, fehler),\n'
     '    React.createElement(SuccessBox, null, meldung),\n'
     '    !darfAendern ? React.createElement("div", { style: { fontSize: 12.5, color: CI.muted, marginBottom: 16 } },\n'
     '      "Zum Ändern fehlt dir das Recht „Rechnungen“ — du siehst hier nur, was eingerichtet ist.") : null,\n'
     '    React.createElement("div", { style: { display: "grid", gap: 16 } },\n'
     '      zeilen.map((g) => React.createElement("div", { key: g.id || "konto", "data-belegkreis": g.id || "konto",\n'
     '        style: { ...cardStyle, padding: 16 } },\n'
     '        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: CI.blau, marginBottom: 12 } }, g.name),\n'
     '        IMMO_BELEGARTEN.map(([art, label, standard]) => {\n'
     '          const k = kreisVon(g.id, art);\n'
     '          const schluessel = (g.id || "konto") + "-" + art;\n'
     '          const wert = entwurf[schluessel] !== undefined\n'
     '            ? entwurf[schluessel] : (k ? k.muster : standard);\n'
     '          return React.createElement("div", { key: art, style: { marginBottom: 14 } },\n'
     '            React.createElement("label", { style: labelStyle }, label),\n'
     '            React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },\n'
     '              React.createElement("input", { style: { ...inputStyle, flex: "2 1 220px", fontFamily: "monospace" },\n'
     '                value: wert, disabled: !darfAendern,\n'
     '                onChange: (ev) => { const w = ev.target.value;\n'
     '                  setEntwurf((e) => ({ ...e, [schluessel]: w })); vorschauHolen(schluessel, w); },\n'
     '                onFocus: () => vorschauHolen(schluessel, wert) }),\n'
     '              React.createElement("select", { style: { ...inputStyle, flex: "1 1 140px" },\n'
     '                value: k ? k.zuruecksetzen : "jaehrlich", disabled: !darfAendern,\n'
     '                onChange: (ev) => sichern(g.id, art, { muster: wert, zuruecksetzen: ev.target.value }) },\n'
     '                IMMO_RUECKSETZUNG.map(([w, l]) => React.createElement("option", { key: w, value: w },\n'
     '                  "zurücksetzen: " + l))),\n'
     '              darfAendern ? React.createElement("button", {\n'
     '                onClick: () => sichern(g.id, art, { muster: wert,\n'
     '                  zuruecksetzen: k ? k.zuruecksetzen : "jaehrlich" }),\n'
     '                disabled: speichert === (g.id || "") + art,\n'
     '                style: { ...secondaryBtn, padding: "8px 14px", fontSize: 12.5 } },\n'
     '                speichert === (g.id || "") + art ? "Speichert …" : "Speichern") : null),\n'
     '            React.createElement("div", { style: { fontSize: 12, color: CI.muted, marginTop: 6 } },\n'
     '              "Vorschau: ",\n'
     '              React.createElement("span", { style: { fontFamily: "monospace", color: CI.blau, fontWeight: 600 } },\n'
     '                vorschau[schluessel] || (k ? "—" : "noch nicht eingerichtet")),\n'
     '              k ? ("  ·  zuletzt vergeben: " + (k.letzte_nummer || 0)\n'
     '                   + (k.periode ? " in " + k.periode : "")) : ""));\n'
     '        })))),\n'
     '    React.createElement("div", { style: { fontSize: 12, color: CI.muted, marginTop: 20, lineHeight: 1.6 } },\n'
     '      "Solange kein Kreis eingerichtet ist, gilt der bisherige Weg aus den Firmendaten ",\n'
     '      "(Präfix und „mit Jahr“). Bereits vergebene Nummern bleiben unberührt."));\n'
     '}\n'
     '\n'
     '// Die Gesellschaften eines Mandanten. Zwischen Konto und Standort: ein',
     'Einstellungen: die Seite EinstBelegnummern mit Live-Vorschau.'),

    # =====================================================================
    # FORK — Abschnitt 3c: Zahlungsziele, Skonto und die Freigabe
    #
    # fork_19 hat die Tabellen und die Pruefung in rechnung_stellen() gebaut,
    # aber keine Maske. Eine Regel, die nur in der Datenbank steht und die
    # niemand einstellen kann, ist keine Funktion, sondern eine Sperre.
    #
    # Die Vorschau des Belegtextes ruft zahlungsbedingung_text_aus (fork_21)
    # — dieselbe Funktion, die spaeter druckt. Deshalb kann sie nicht davon
    # abweichen. Wuerde die Oberflaeche den Satz selbst zusammensetzen, gaebe
    # es ihn zweimal, und die beiden Fassungen liefen auseinander.
    #
    # Zwei verschiedene Rechte, mit Absicht: Zahlungsbedingungen darf pflegen,
    # wer "Rechnungen" hat; WER FREIGIBT legt nur die Verwaltung fest. Sonst
    # koennte sich der Buchhalter selbst zum Freigeber machen, und die
    # Freigabe waere keine.
    # =====================================================================
    ('FORK',
     r'  const reiterListe = \[\["firma", "Firma & Impressum"\], \["gesellschaften", "Gesellschaften"\], \["standorte", "Standorte"\], \["belegnummern", "Belegnummern"\], \["signatur", "Signatur & Texte"\], \["vorgaben", "Vorgaben"\], \["vertragsvorlagen", "Vertragsvorlagen"\]\];',
     '  const reiterListe = [["firma", "Firma & Impressum"], ["gesellschaften", "Gesellschaften"], ["standorte", "Standorte"], ["belegnummern", "Belegnummern"], ["zahlung", "Zahlung & Freigabe"], ["signatur", "Signatur & Texte"], ["vorgaben", "Vorgaben"], ["vertragsvorlagen", "Vertragsvorlagen"]];',
     'Einstellungen: achter Reiter fuer Zahlung und Freigabe.'),

    ('FORK',
     r'      : reiter === "belegnummern" \? React\.createElement\(EinstBelegnummern, \{ user \}\)',
     '      : reiter === "belegnummern" ? React.createElement(EinstBelegnummern, { user })\n'
     '      : reiter === "zahlung" ? React.createElement(EinstZahlung, { user })',
     'Einstellungen: der Reiter zeigt EinstZahlung.'),

    ('FORK',
     r'(const IMMO_BELEGARTEN = \[)',
     '// Zahlungsbedingungen und Rechnungsfreigabe je Gesellschaft (Abschnitt 3c).\n'
     '//\n'
     '// Der Satz, der spaeter auf dem Beleg steht, wird NICHT hier gebaut. Die\n'
     '// Vorschau ruft zahlungsbedingung_text_aus — dieselbe Funktion, die auch die\n'
     '// Rechnung benutzt. Zwei Fassungen einer Regel laufen auseinander; bei\n'
     '// hat_recht() ist genau das schon einmal passiert.\n'
     'const IMMO_ZAHLUNG_LEER = { name: "", netto_tage: 14, skonto_prozent: null,\n'
     '  skonto_tage: null, text_auf_beleg: null, aktiv: true, ist_standard: false };\n'
     'function EinstZahlung({ user }) {\n'
     '  const [bedingungen, setBedingungen] = useState([]);\n'
     '  const [gesellschaften, setGesellschaften] = useState([]);\n'
     '  const [einstellungen, setEinstellungen] = useState([]);\n'
     '  const [leute, setLeute] = useState([]);\n'
     '  const [laedt, setLaedt] = useState(true);\n'
     '  const [meldung, setMeldung] = useState("");\n'
     '  const [fehler, setFehler] = useState("");\n'
     '  const [entwurf, setEntwurf] = useState({});\n'
     '  const [neue, setNeue] = useState({});\n'
     '  const [vorschau, setVorschau] = useState({});\n'
     '  const [speichert, setSpeichert] = useState(null);\n'
     '  const darfBedingungen = hatRecht(user, "rechnungen") || hatRecht(user, "admin");\n'
     '  const darfFreigabe = hatRecht(user, "admin");\n'
     '  const laden = async () => {\n'
     '    setLaedt(true);\n'
     '    try {\n'
     '      const [z, g, e, p] = await Promise.all([\n'
     '        window._sb.from("zahlungsbedingungen").select("*").order("sortierung").order("name"),\n'
     '        window._sb.from("gesellschaften").select("id, name").order("sortierung").order("name"),\n'
     '        window._sb.from("rechnung_einstellungen").select("*"),\n'
     '        window._sb.from("profiles").select("id, name, email, role").order("name")\n'
     '      ]);\n'
     '      for (const r of [z, g, e, p]) { if (r.error) throw r.error; }\n'
     '      setBedingungen(z.data || []);\n'
     '      setGesellschaften(g.data || []);\n'
     '      setEinstellungen(e.data || []);\n'
     '      setLeute(p.data || []);\n'
     '    } catch (f) {\n'
     '      setFehler("Zahlung und Freigabe konnten nicht geladen werden: " + (f.message || f));\n'
     '    }\n'
     '    setLaedt(false);\n'
     '  };\n'
     '  useEffect(() => { laden(); }, []);\n'
     '  // Leere Eingabe heisst "nicht gesetzt", nicht "null Prozent".\n'
     '  const zahl = (w) => {\n'
     '    if (w === null || w === undefined || String(w).trim() === "") return null;\n'
     '    const n = parseFloat(String(w).replace(",", "."));\n'
     '    return isFinite(n) ? n : null;\n'
     '  };\n'
     '  const wert = (id, feld, ersatz) => {\n'
     '    const e = entwurf[id];\n'
     '    return (e && e[feld] !== undefined) ? e[feld] : ersatz;\n'
     '  };\n'
     '  const setzen = (id, feld, w) =>\n'
     '    setEntwurf((alt) => ({ ...alt, [id]: { ...(alt[id] || {}), [feld]: w } }));\n'
     '  const vorschauHolen = async (schluessel, netto, proz, tage, text) => {\n'
     '    try {\n'
     '      const { data } = await window._sb.rpc("zahlungsbedingung_text_aus", {\n'
     '        p_netto_tage: zahl(netto) === null ? 0 : Math.round(zahl(netto)),\n'
     '        p_skonto_prozent: zahl(proz),\n'
     '        p_skonto_tage: zahl(tage) === null ? null : Math.round(zahl(tage)),\n'
     '        p_eigener_text: (text && String(text).trim()) ? String(text) : null\n'
     '      });\n'
     '      setVorschau((v) => ({ ...v, [schluessel]: data || "" }));\n'
     '    } catch (f) {\n'
     '      setVorschau((v) => ({ ...v, [schluessel]: "(Vorschau nicht möglich)" }));\n'
     '    }\n'
     '  };\n'
     '  const felderVon = (b, id) => {\n'
     '    const proz = zahl(wert(id, "skonto_prozent", b.skonto_prozent));\n'
     '    const tage = zahl(wert(id, "skonto_tage", b.skonto_tage));\n'
     '    const beides = proz !== null && tage !== null;\n'
     '    const text = String(wert(id, "text_auf_beleg", b.text_auf_beleg) || "").trim();\n'
     '    return {\n'
     '      name: String(wert(id, "name", b.name) || "").trim(),\n'
     '      netto_tage: Math.round(zahl(wert(id, "netto_tage", b.netto_tage)) || 0),\n'
     '      skonto_prozent: beides ? proz : null,\n'
     '      skonto_tage: beides ? Math.round(tage) : null,\n'
     '      text_auf_beleg: text || null,\n'
     '      aktiv: wert(id, "aktiv", b.aktiv) !== false\n'
     '    };\n'
     '  };\n'
     '  const sichern = async (b, gid, istNeu) => {\n'
     '    const id = istNeu ? "neu-" + (gid || "konto") : b.id;\n'
     '    setFehler(""); setMeldung(""); setSpeichert(id);\n'
     '    try {\n'
     '      const felder = felderVon(b, id);\n'
     '      if (!felder.name) throw new Error("Die Bedingung braucht einen Namen.");\n'
     '      if (felder.skonto_tage !== null && felder.skonto_tage > felder.netto_tage) {\n'
     '        throw new Error("Das Skontoziel liegt nach der Fälligkeit.");\n'
     '      }\n'
     '      const antwort = istNeu\n'
     '        ? await window._sb.from("zahlungsbedingungen").insert({ gesellschaft_id: gid || null, ...felder })\n'
     '        : await window._sb.from("zahlungsbedingungen").update(felder).eq("id", b.id);\n'
     '      if (antwort.error) throw antwort.error;\n'
     '      await logAction(istNeu ? "create" : "update", "zahlungsbedingung", istNeu ? "" : b.id, felder.name, felder);\n'
     '      setEntwurf((alt) => { const n = { ...alt }; delete n[id]; return n; });\n'
     '      if (istNeu) setNeue((alt) => { const n = { ...alt }; delete n[gid || "konto"]; return n; });\n'
     '      setMeldung("Gespeichert.");\n'
     '      await laden();\n'
     '    } catch (f) {\n'
     '      setFehler("Speichern fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '    setSpeichert(null);\n'
     '  };\n'
     '  // Es darf je Gesellschaft nur eine Standardbedingung geben; die Datenbank\n'
     '  // haelt das mit einem eindeutigen Index fest. Deshalb erst die alte\n'
     '  // abwaehlen, dann die neue setzen.\n'
     '  const standardSetzen = async (b) => {\n'
     '    setFehler(""); setMeldung(""); setSpeichert(b.id);\n'
     '    try {\n'
     '      let abwaehlen = window._sb.from("zahlungsbedingungen").update({ ist_standard: false }).eq("ist_standard", true);\n'
     '      abwaehlen = b.gesellschaft_id\n'
     '        ? abwaehlen.eq("gesellschaft_id", b.gesellschaft_id)\n'
     '        : abwaehlen.is("gesellschaft_id", null);\n'
     '      const a = await abwaehlen;\n'
     '      if (a.error) throw a.error;\n'
     '      const { error } = await window._sb.from("zahlungsbedingungen")\n'
     '        .update({ ist_standard: true }).eq("id", b.id);\n'
     '      if (error) throw error;\n'
     '      await logAction("update", "zahlungsbedingung", b.id, b.name, { ist_standard: true });\n'
     '      setMeldung("Standard gesetzt.");\n'
     '      await laden();\n'
     '    } catch (f) {\n'
     '      setFehler("Standard konnte nicht gesetzt werden: " + (f.message || f));\n'
     '    }\n'
     '    setSpeichert(null);\n'
     '  };\n'
     '  const entfernen = async (b) => {\n'
     '    if (!window.confirm("Die Zahlungsbedingung „" + b.name + "“ entfernen? Bereits gestellte Rechnungen behalten ihren Text.")) return;\n'
     '    setFehler(""); setMeldung(""); setSpeichert(b.id);\n'
     '    try {\n'
     '      const { error } = await window._sb.from("zahlungsbedingungen").delete().eq("id", b.id);\n'
     '      if (error) throw error;\n'
     '      await logAction("delete", "zahlungsbedingung", b.id, b.name, {});\n'
     '      setMeldung("Entfernt.");\n'
     '      await laden();\n'
     '    } catch (f) {\n'
     '      setFehler("Entfernen fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '    setSpeichert(null);\n'
     '  };\n'
     '  const freigabeVon = (gid) => einstellungen.filter(\n'
     '    (e) => (e.gesellschaft_id || null) === (gid || null))[0] || null;\n'
     '  const freigabeSichern = async (gid, felder) => {\n'
     '    setFehler(""); setMeldung(""); setSpeichert("freigabe-" + (gid || "konto"));\n'
     '    try {\n'
     '      const vorhanden = freigabeVon(gid);\n'
     '      const antwort = vorhanden\n'
     '        ? await window._sb.from("rechnung_einstellungen")\n'
     '            .update({ ...felder, geaendert_am: new Date().toISOString() }).eq("id", vorhanden.id)\n'
     '        : await window._sb.from("rechnung_einstellungen").insert({ gesellschaft_id: gid || null, ...felder });\n'
     '      if (antwort.error) throw antwort.error;\n'
     '      await logAction("update", "rechnung_einstellungen", gid || "", "Freigabe", felder);\n'
     '      setMeldung("Gespeichert.");\n'
     '      await laden();\n'
     '    } catch (f) {\n'
     '      setFehler("Speichern fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '    setSpeichert(null);\n'
     '  };\n'
     '  if (laedt) return React.createElement("div", { style: { padding: 24, color: CI.muted } }, "Lade Zahlung und Freigabe …");\n'
     '  const zeilen = gesellschaften.length\n'
     '    ? gesellschaften.map((g) => ({ id: g.id, name: g.name }))\n'
     '    : [{ id: null, name: "Ganzes Konto" }];\n'
     '  const feld = (id, name, w, breite, art) => React.createElement("input", {\n'
     '    style: { ...inputStyle, flex: "1 1 " + breite + "px", minWidth: 0 },\n'
     '    type: art || "text", value: w === null || w === undefined ? "" : w,\n'
     '    placeholder: name, disabled: !darfBedingungen,\n'
     '    onChange: (ev) => setzen(id, name, ev.target.value)\n'
     '  });\n'
     '  const bedingungKarte = (b, gid, istNeu) => {\n'
     '    const id = istNeu ? "neu-" + (gid || "konto") : b.id;\n'
     '    const netto = wert(id, "netto_tage", b.netto_tage);\n'
     '    const proz = wert(id, "skonto_prozent", b.skonto_prozent);\n'
     '    const tage = wert(id, "skonto_tage", b.skonto_tage);\n'
     '    const text = wert(id, "text_auf_beleg", b.text_auf_beleg);\n'
     '    if (vorschau[id] === undefined) vorschauHolen(id, netto, proz, tage, text);\n'
     '    return React.createElement("div", { key: id, "data-zahlungsbedingung": id,\n'
     '      style: { border: `1px solid ${CI.border}`, borderRadius: 6, padding: 12, marginBottom: 10,\n'
     '               background: b.ist_standard ? `${CI.gold}0e` : "transparent" } },\n'
     '      React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 } },\n'
     '        feld(id, "name", wert(id, "name", b.name), 200),\n'
     '        React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flex: "1 1 130px" } },\n'
     '          feld(id, "netto_tage", netto, 60, "number"),\n'
     '          React.createElement("span", { style: { fontSize: 12, color: CI.muted, whiteSpace: "nowrap" } }, "Tage netto")),\n'
     '        React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flex: "1 1 170px" } },\n'
     '          feld(id, "skonto_prozent", proz, 60, "number"),\n'
     '          React.createElement("span", { style: { fontSize: 12, color: CI.muted, whiteSpace: "nowrap" } }, "% Skonto bei"),\n'
     '          feld(id, "skonto_tage", tage, 60, "number"),\n'
     '          React.createElement("span", { style: { fontSize: 12, color: CI.muted, whiteSpace: "nowrap" } }, "Tagen"))),\n'
     '      React.createElement("input", { style: { ...inputStyle, width: "100%", marginBottom: 8 },\n'
     '        value: text === null || text === undefined ? "" : text, disabled: !darfBedingungen,\n'
     '        placeholder: "Eigener Text auf dem Beleg (leer = aus den Zahlen gebildet)",\n'
     '        onChange: (ev) => setzen(id, "text_auf_beleg", ev.target.value) }),\n'
     '      React.createElement("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 8 } },\n'
     '        "Auf dem Beleg: ",\n'
     '        React.createElement("span", { style: { color: CI.blau, fontWeight: 600 } },\n'
     '          vorschau[id] === undefined ? "…" : vorschau[id])),\n'
     '      React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },\n'
     '        darfBedingungen ? React.createElement("button", {\n'
     '          onClick: () => { vorschauHolen(id, netto, proz, tage, text); sichern(b, gid, istNeu); },\n'
     '          disabled: speichert === id,\n'
     '          style: { ...secondaryBtn, padding: "7px 14px", fontSize: 12.5 } },\n'
     '          speichert === id ? "Speichert …" : (istNeu ? "Anlegen" : "Speichern")) : null,\n'
     '        darfBedingungen ? React.createElement("button", {\n'
     '          onClick: () => vorschauHolen(id, netto, proz, tage, text),\n'
     '          style: { ...secondaryBtn, padding: "7px 14px", fontSize: 12.5 } }, "Vorschau") : null,\n'
     '        (!istNeu && darfBedingungen && !b.ist_standard) ? React.createElement("button", {\n'
     '          onClick: () => standardSetzen(b), disabled: speichert === id,\n'
     '          style: { ...secondaryBtn, padding: "7px 14px", fontSize: 12.5 } }, "als Standard") : null,\n'
     '        (!istNeu && b.ist_standard) ? React.createElement("span", {\n'
     '          style: { fontSize: 12, color: CI.gold, fontWeight: 700 } }, "Standard") : null,\n'
     '        (!istNeu && darfBedingungen) ? React.createElement("button", {\n'
     '          onClick: () => entfernen(b), disabled: speichert === id,\n'
     '          style: { ...secondaryBtn, padding: "7px 14px", fontSize: 12.5, marginLeft: "auto",\n'
     '                   color: CI.danger, borderColor: CI.danger } }, "Entfernen") : null));\n'
     '  };\n'
     '  return React.createElement("div", null,\n'
     '    React.createElement("div", { style: { fontSize: 13, color: CI.muted, marginBottom: 16, lineHeight: 1.6 } },\n'
     '      "Zahlungsziele und Skonto je Gesellschaft, und die Frage, wer eine Rechnung freigibt, ",\n'
     '      "bevor sie das Haus verlässt. Der Satz, der auf dem Beleg erscheint, kommt aus derselben ",\n'
     '      "Funktion, die ihn später druckt — die Vorschau kann also nicht davon abweichen."),\n'
     '    React.createElement(ErrorBox, null, fehler),\n'
     '    React.createElement(SuccessBox, null, meldung),\n'
     '    !darfBedingungen ? React.createElement("div", { style: { fontSize: 12.5, color: CI.muted, marginBottom: 16 } },\n'
     '      "Zum Ändern der Zahlungsbedingungen fehlt dir das Recht „Rechnungen“.") : null,\n'
     '    React.createElement("div", { style: { display: "grid", gap: 16 } },\n'
     '      zeilen.map((g) => {\n'
     '        const eigene = bedingungen.filter((b) => (b.gesellschaft_id || null) === (g.id || null));\n'
     '        const frei = freigabeVon(g.id) || {};\n'
     '        const freiSchluessel = "freigabe-" + (g.id || "konto");\n'
     '        const neuOffen = neue[g.id || "konto"];\n'
     '        return React.createElement("div", { key: g.id || "konto", "data-zahlung": g.id || "konto",\n'
     '          style: { ...cardStyle, padding: 16 } },\n'
     '          React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: CI.blau, marginBottom: 12 } }, g.name),\n'
     '          eigene.length ? eigene.map((b) => bedingungKarte(b, g.id, false))\n'
     '            : React.createElement("div", { style: { fontSize: 12.5, color: CI.muted, marginBottom: 10 } },\n'
     '                "Noch keine Bedingung eingerichtet. Ohne eine bleibt es beim bisherigen Verhalten."),\n'
     '          neuOffen ? bedingungKarte({ ...IMMO_ZAHLUNG_LEER, gesellschaft_id: g.id || null }, g.id, true) : null,\n'
     '          (darfBedingungen && !neuOffen) ? React.createElement("button", {\n'
     '            onClick: () => setNeue((alt) => ({ ...alt, [g.id || "konto"]: true })),\n'
     '            style: { ...secondaryBtn, padding: "7px 14px", fontSize: 12.5 } }, "Bedingung hinzufügen") : null,\n'
     '          React.createElement("div", { style: { marginTop: 18, paddingTop: 14, borderTop: `1px solid ${CI.border}` } },\n'
     '            React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: CI.blau, marginBottom: 8 } },\n'
     '              "Freigabe vor dem Versand"),\n'
     '            React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },\n'
     '              React.createElement("select", { style: { ...inputStyle, flex: "2 1 220px" },\n'
     '                value: frei.freigabe_durch || "", disabled: !darfFreigabe,\n'
     '                onChange: (ev) => freigabeSichern(g.id, { freigabe_durch: ev.target.value || null,\n'
     '                  freigabe_ab_betrag: frei.freigabe_ab_betrag === undefined ? null : frei.freigabe_ab_betrag }) },\n'
     '                React.createElement("option", { value: "" }, "niemand — Rechnungen gehen direkt raus"),\n'
     '                leute.map((p) => React.createElement("option", { key: p.id, value: p.id },\n'
     '                  (p.name || p.email) + (p.role ? " (" + p.role + ")" : "")))),\n'
     '              React.createElement("span", { style: { fontSize: 12, color: CI.muted, whiteSpace: "nowrap" } }, "ab"),\n'
     '              React.createElement("input", { style: { ...inputStyle, flex: "0 1 110px" }, type: "number",\n'
     '                value: frei.freigabe_ab_betrag === null || frei.freigabe_ab_betrag === undefined ? "" : frei.freigabe_ab_betrag,\n'
     '                placeholder: "jeder Betrag", disabled: !darfFreigabe || !frei.freigabe_durch,\n'
     '                onBlur: (ev) => freigabeSichern(g.id, { freigabe_durch: frei.freigabe_durch || null,\n'
     '                  freigabe_ab_betrag: ev.target.value === "" ? null : parseFloat(ev.target.value) }),\n'
     '                onChange: () => {} }),\n'
     '              React.createElement("span", { style: { fontSize: 12, color: CI.muted, whiteSpace: "nowrap" } }, "€ brutto"),\n'
     '              speichert === freiSchluessel ? React.createElement("span", {\n'
     '                style: { fontSize: 12, color: CI.muted } }, "speichert …") : null),\n'
     '            React.createElement("div", { style: { fontSize: 12, color: CI.muted, marginTop: 8, lineHeight: 1.6 } },\n'
     '              frei.freigabe_durch\n'
     '                ? "Rechnungen über der Grenze müssen erst freigegeben werden. Die Datenbank weist sie sonst ab — auch dann, wenn jemand den Weg über die Oberfläche umgeht."\n'
     '                : "Solange niemand benannt ist, ändert sich nichts am bisherigen Ablauf."),\n'
     '            !darfFreigabe ? React.createElement("div", { style: { fontSize: 12.5, color: CI.muted, marginTop: 6 } },\n'
     '              "Wer freigibt, legt die Verwaltung fest.") : null));\n'
     '      })));\n'
     '}\n'     '\n'
     r'\1',
     'Einstellungen: die Seite EinstZahlung mit Live-Vorschau des Belegtextes.'),

    # =====================================================================
    # FORK — onOffice aus der Oberflaeche nehmen
    #
    # Anweisung vom 28.09.2026: "Bitte loese onoffice erstmal komplett raus,
    # wir wissen ja nicht, mit welcher urspruenglichen Software die neuen
    # Kunden arbeiten."
    #
    # Die 21 Edge Functions sind gestrichen (scripts/neutralisieren-funktionen.py),
    # die 14 Cron-Jobs abbestellt (fork_20). Hier fallen die beiden Stellen
    # weg, ueber die man ueberhaupt hinkommt: die Kachel "onOffice-Verbindung"
    # im Werkzeugkasten und der Reiter im Admin-Bereich.
    #
    # Die uebrigen rund 190 Fundstellen bleiben vorerst im Quelltext. Sie sind
    # ohne Einstieg nicht erreichbar, und sie einzeln herauszuschneiden waere
    # ein Eingriff in 190 Stellen fremden Codes mit entsprechendem Risiko —
    # fuer einen Gewinn, den niemand sieht. Vermerkt in docs/OFFEN.md.
    # =====================================================================
    ('FORK',
     r'  !e \|\| "chef" !== e\.role && "mitarbeiter" !== e\.role \|\| a\.push\(\{\n    id: "onoffice",\n    gruppe: "Verbindungen",\n    icon: "🔌",\n    titel: "onOffice-Verbindung",\n    text: "API-Zugang testen und erste Objekte abrufen\."\n  \}\);',
     '  // Die Kachel "Fremdsystem-Verbindung" ist am 28.09.2026 entfallen: das\n'
     '  // CRM der Vorlage war DIE Anbindung, nicht EINE, und welche Software ein\n'
     '  // neuer Mandant benutzt, weiss niemand. Die Edge Functions sind\n'
     '  // gestrichen, die Cron-Jobs abbestellt (fork_20).',
     'onOffice: die Kachel im Werkzeugkasten entfaellt.'),

    ('FORK',
     r'  \}, React\.createElement\("button", \{\n    onClick: \(\) => b\("onoffice"\),\n    style: \{\n      background: "onoffice" === h \? CI\.blau : "transparent",\n      color: "onoffice" === h \? "#fff" : CI\.blau,',
     '  }, false && React.createElement("button", {\n'
     '    onClick: () => b("onoffice"),\n'
     '    style: {\n'
     '      background: "onoffice" === h ? CI.blau : "transparent",\n'
     '      color: "onoffice" === h ? "#fff" : CI.blau,',
     'onOffice: der Reiter im Admin-Bereich entfaellt.'),
    # =====================================================================
    # FORK — Laufzeit, Provision und Fristen gehoeren zur Vorlage
    #
    # ANWEISUNG vom 28.09.2026: "wenn wir die Maklervertrag Vorlage
    # hochladen, da muss auf jeden Fall Laufzeit und Provision auch noch
    # definiert werden. Gleiches gilt fuer Reservierung und Objektnachweis."
    #
    # Die Erzeugung ersetzt diese Zahlen im Word-Text — "Dauer von 6 Monaten"
    # wird zu "Dauer von 9 Monaten". Wer seine EIGENE Vorlage hochlaedt, hat
    # dort seinen eigenen Satz stehen, und die Zahl muss dazu passen.
    #
    # Die Rechnung macht die Datenbank (fork_23, vorlage_vorgaben): vier
    # Stufen, die innerste gewinnt — eingebaut, Vorgaben des Mandanten,
    # Vorlage des Mandanten, Vorlage der Gesellschaft. Die Oberflaeche fragt
    # nur nach dem Ergebnis. Sie selbst zu rechnen hiesse, die Regel zweimal
    # zu haben.
    # =====================================================================

    # Die Einstellungen sind seit fork_23 je Mandant eindeutig, nicht mehr
    # je Plattform. Bliebe der Konfliktschluessel "schluessel" allein, hiesse
    # jedes Speichern: "es gibt die Zeile schon" — und traefe die des
    # falschen Mandanten oder liefe auf einen Fehler.
    ('FORK',
     r'\{ schluessel, wert, updated_at: new Date\(\)\.toISOString\(\), updated_by: window\._currentUserId \|\| null \},\n    \{ onConflict: "schluessel" \}\);',
     '{ mandant_id: window.IMMO_MANDANT_ID || null, schluessel, wert,\n'
     '      updated_at: new Date().toISOString(), updated_by: window._currentUserId || null },\n'
     '    { onConflict: "mandant_id,schluessel" });',
     'Vorgaben werden je Mandant gespeichert, nicht je Plattform.'),

    # Die Vorgaben der vier Vorlagenarten einmal beim Start holen. Gleiche
    # Bauart wie __epEinst daneben: faellt der Aufruf aus, bleibt der
    # eingebaute Wert stehen und es entsteht trotzdem ein Vertrag.
    ('FORK',
     r'        window\.__epEinst = m;\n      \}\n    \} catch \(e\) \{ console\.warn\("Einstellungen laden:", \(e && e\.message\) \|\| e\); \}',
     '        window.__epEinst = m;\n'
     '      }\n'
     '    } catch (e) { console.warn("Einstellungen laden:", (e && e.message) || e); }\n'
     '    try {\n'
     '      const arten = ["maklervertrag", "objektnachweis", "reservierung"];\n'
     '      const ergebnis = {};\n'
     '      for (const art of arten) {\n'
     '        const { data } = await window._sb.rpc("vorlage_vorgaben", {\n'
     '          p_art: art, p_gesellschaft: window.IMMO_GESELLSCHAFT_ID || null });\n'
     '        if (data) ergebnis[art] = data;\n'
     '      }\n'
     '      window.__immoVorgaben = ergebnis;\n'
     '    } catch (e) { console.warn("Vorgaben der Vorlagen laden:", (e && e.message) || e); }',
     'Die Vorgaben der Vorlagen einmal beim Start holen.'),

    ('FORK',
     r'(function epEinst\(schluessel, vorgabe\) \{)',
     '// Was fuer einen neuen Vertrag/Nachweis/Reservierung gilt. Gerechnet hat\n'
     '// es die Datenbank (vorlage_vorgaben); hier steht nur der Zugriff und\n'
     '// der Notnagel, falls der Aufruf beim Start ausgefallen ist.\n'
     'window.__immoVorgaben = window.__immoVorgaben || null;\n'
     'function immoVorgabe(art, feld, ersatz) {\n'
     '  const alle = window.__immoVorgaben;\n'
     '  const wert = alle && alle[art] ? alle[art][feld] : undefined;\n'
     '  if (wert === null || wert === undefined || wert === "") return ersatz;\n'
     '  return String(wert);\n'
     '}\n'
     r'\1',
     'Zugriff auf die Vorgaben der Vorlagen.'),

    # --- Die drei Formulare fragen nach den Vorgaben ihrer Vorlage.
    # Der Ersatzwert hinter dem Komma ist jeweils das, was die Vorlage heute
    # einsetzt — faellt der Aufruf beim Start aus, aendert sich nichts.
    ('FORK',
     r'epEinst\("laufzeit_monate_standard", "6"\)',
     'immoVorgabe("maklervertrag", "laufzeit_monate", "6")',
     'Maklervertrag: Laufzeit aus der Vorlage.'),
    ('FORK',
     r'epEinst\("provision_verkaeufer_standard", "3,57"\)',
     'immoVorgabe("maklervertrag", "provision", "3,57")',
     'Maklervertrag: Provision aus der Vorlage.'),
    # Die dritte Fundstelle von provisionsmodell_standard steht in einer
    # Hilfsfunktion, die nur "aussen" von "geteilt" unterscheidet — auch sie
    # soll der Vorlage folgen.
    ('FORK',
     r'epEinst\("provisionsmodell_standard", "teilung"\)',
     'immoVorgabe("maklervertrag", "provisionsmodell", "teilung")',
     'Maklervertrag: Provisionsmodell aus der Vorlage.'),

    ('FORK',
     r'provision: "3,00",',
     'provision: immoVorgabe("objektnachweis", "provision", "3,00"),',
     'Objektnachweis: Provision aus der Vorlage.'),
    ('FORK',
     r'e\.provision \|\| "3,00"',
     'e.provision || immoVorgabe("objektnachweis", "provision", "3,00")',
     'Objektnachweis: Provision aus der Vorlage, auch beim Nachtragen.'),

    ('FORK',
     r'reservierungsgebuehr_brutto: "1000",',
     'reservierungsgebuehr_brutto: immoVorgabe("reservierung", "reservierungsgebuehr_brutto", "1000"),',
     'Reservierung: Gebuehr aus der Vorlage.'),
    ('FORK',
     r'zahlungsfrist_werktage: 5,',
     'zahlungsfrist_werktage: Number(immoVorgabe("reservierung", "zahlungsfrist_werktage", "5")) || 5,',
     'Reservierung: Zahlungsfrist aus der Vorlage.'),
    # 2592e6 Millisekunden sind dreissig Tage. Die Zahl stand zweimal im
    # Quelltext; jetzt steht die Dauer in der Vorlage und die Rechnung hier.
    ('FORK',
     r'new Date\(Date\.now\(\) \+ 2592e6\)\.toISOString\(\)\.slice\(0, 10\)',
     'new Date(Date.now() + (Number(immoVorgabe("reservierung", "reservierungsdauer_tage", "30")) || 30) * 864e5).toISOString().slice(0, 10)',
     'Reservierung: Dauer aus der Vorlage.'),

    # --- Die Felder an der Vorlage selbst, im Reiter "Vertragsvorlagen".
    ('FORK',
     r'(const IMMO_VERTRAGSARTEN = \[)',
     '// Welche Werte zu welcher Vorlagenart gehoeren. Die Liste ist die der\n'
     '// Vorlage — nachgesehen, nicht erfunden: der Maklervertrag kennt Laufzeit,\n'
     '// Provision und Provisionsmodell, der Objektnachweis die Kaeuferprovision,\n'
     '// die Reservierung Gebuehr, Dauer und Zahlungsfrist. Eine Vollmacht hat\n'
     '// keine solchen Werte.\n'
     '//\n'
     '// Dieselben Schluessel prueft die Datenbank in\n'
     '// vertragsvorlagen_vorgaben_check. Ein Tippfehler hier wird dort abgewiesen\n'
     '// statt still geschluckt.\n'
     'const IMMO_VORLAGE_FELDER = {\n'
     '  maklervertrag: [\n'
     '    ["laufzeit_monate", "Laufzeit (Monate)", "6"],\n'
     '    ["provision", "Provision (%)", "3,57"],\n'
     '    ["provisionsmodell", "Provisionsmodell", "teilung",\n'
     '      [["teilung", "Teilung"], ["innen", "Innenprovision"], ["aussen", "Außenprovision"]]]\n'
     '  ],\n'
     '  objektnachweis: [\n'
     '    ["provision", "Käuferprovision (%)", "3,00"]\n'
     '  ],\n'
     '  reservierung: [\n'
     '    ["reservierungsgebuehr_brutto", "Reservierungsgebühr (€ brutto)", "1000"],\n'
     '    ["reservierungsdauer_tage", "Reservierungsdauer (Tage)", "30"],\n'
     '    ["zahlungsfrist_werktage", "Zahlungsfrist (Werktage)", "5"]\n'
     '  ],\n'
     '  vollmacht: []\n'
     '};\n'     '\n'
     r'\1',
     'Vertragsvorlagen: welche Werte zu welcher Art gehoeren.'),

    # Beim Hochladen einer neuen Fassung die Werte der alten uebernehmen.
    # Sonst stuenden nach jedem Austausch des Word-Textes wieder die
    # eingebauten Zahlen da, und niemand wuerde es merken, bis ein Vertrag
    # mit sechs statt zwoelf Monaten beim Eigentuemer liegt.
    ('FORK',
     r'      const \{ error: iErr \} = await window\._sb\.from\("vertragsvorlagen"\)\.insert\(\{\n        art, storage_pfad: pfad, dateiname: datei\.name \|\| "", version, aktiv: true,',
     '      const vorher_aktiv = vorher.filter((z) => z.aktiv)[0] || vorher[0] || null;\n'
     '      const { error: iErr } = await window._sb.from("vertragsvorlagen").insert({\n'
     '        art, storage_pfad: pfad, dateiname: datei.name || "", version, aktiv: true,\n'
     '        vorgaben: (vorher_aktiv && vorher_aktiv.vorgaben) || {},',
     'Vertragsvorlagen: eine neue Fassung erbt die Werte der alten.'),

    # Die Eingabefelder unter jeder Karte. Sie erscheinen erst, wenn eine
    # Vorlage da ist — die Werte gehoeren zu EINEM Text, und ohne Text gibt
    # es nichts, wozu sie gehoeren koennten. Wer keine eigene Vorlage hat,
    # stellt dieselben Werte unter "Vorgaben" fuer den ganzen Mandanten ein.
    ('FORK',
     r'          darfPflegen \? React\.createElement\("label", \{ style: \{ \.\.\.secondaryBtn, display: "inline-flex",',
     '          (jetzt && (IMMO_VORLAGE_FELDER[art] || []).length) ? React.createElement("div",\n'
     '            { style: { marginTop: 12, paddingTop: 12, borderTop: `1px solid ${CI.border}` } },\n'
     '            React.createElement("div", { style: { fontSize: 11, color: CI.gold, letterSpacing: "0.12em",\n'
     '              textTransform: "uppercase", fontWeight: 600, marginBottom: 8 } }, "Werte zu diesem Text"),\n'
     '            IMMO_VORLAGE_FELDER[art].map(([feld, beschriftung, ersatz, auswahl]) => {\n'
     '              const schluessel = art + "." + feld;\n'
     '              const wert = vorgabenEntwurf[schluessel] !== undefined\n'
     '                ? vorgabenEntwurf[schluessel]\n'
     '                : ((jetzt.vorgaben && jetzt.vorgaben[feld]) || immoVorgabe(art, feld, ersatz));\n'
     '              return React.createElement("div", { key: feld, style: { marginBottom: 8 } },\n'
     '                React.createElement("label", { style: labelStyle }, beschriftung),\n'
     '                auswahl\n'
     '                  ? React.createElement("select", { style: inputStyle, value: wert,\n'
     '                      "data-vorlagenwert": schluessel, disabled: !darfPflegen,\n'
     '                      onChange: (ev) => setVorgabenEntwurf((a) => ({ ...a, [schluessel]: ev.target.value })) },\n'
     '                      auswahl.map(([w, l]) => React.createElement("option", { key: w, value: w }, l)))\n'
     '                  : React.createElement("input", { style: inputStyle, value: wert,\n'
     '                      "data-vorlagenwert": schluessel, disabled: !darfPflegen,\n'
     '                      onChange: (ev) => setVorgabenEntwurf((a) => ({ ...a, [schluessel]: ev.target.value })) }));\n'
     '            }),\n'
     '            darfPflegen ? React.createElement("button", {\n'
     '              onClick: () => werteSichern(art, jetzt), disabled: beschaeftigt === "werte-" + art,\n'
     '              style: { ...secondaryBtn, padding: "7px 14px", fontSize: 12.5, marginTop: 4 } },\n'
     '              beschaeftigt === "werte-" + art ? "Speichert …" : "Werte speichern") : null,\n'
     '            React.createElement("div", { style: { fontSize: 11, color: CI.muted, marginTop: 8, lineHeight: 1.5 } },\n'
     '              "Diese Werte werden in neue Vorgänge übernommen. Sie müssen zu dem passen, ",\n'
     '              "was im Text dieser Vorlage steht.")) : null,\n'
     '          darfPflegen ? React.createElement("label", { style: { ...secondaryBtn, display: "inline-flex",',
     'Vertragsvorlagen: Laufzeit, Provision und Fristen an der Vorlage pflegen.'),

    # Zustand und Speichern dafuer.
    ('FORK',
     r'(  const \[beschaeftigt, setBeschaeftigt\] = useState\(""\);\n  const darfPflegen = hatRecht\(user, "admin"\);)',
     r'\1\n'
     '  const [vorgabenEntwurf, setVorgabenEntwurf] = useState({});\n'
     '  // Nur die Felder DIESER Art werden geschrieben. Ein Wert, der zu\n'
     '  // einer anderen Art gehoert, weist die Datenbank ohnehin ab — aber\n'
     '  // es waere ein Fehler, der erst dort auffaellt.\n'
     '  const werteSichern = async (art, zeile) => {\n'
     '    setFehler(""); setMeldung(""); setBeschaeftigt("werte-" + art);\n'
     '    try {\n'
     '      const neu = {};\n'
     '      for (const [feld, , ersatz] of (IMMO_VORLAGE_FELDER[art] || [])) {\n'
     '        const schluessel = art + "." + feld;\n'
     '        const w = String(vorgabenEntwurf[schluessel] !== undefined\n'
     '          ? vorgabenEntwurf[schluessel]\n'
     '          : ((zeile.vorgaben && zeile.vorgaben[feld]) || immoVorgabe(art, feld, ersatz))).trim();\n'
     '        if (w) neu[feld] = w;\n'
     '      }\n'
     '      const { error } = await window._sb.from("vertragsvorlagen")\n'
     '        .update({ vorgaben: neu, geaendert_am: new Date().toISOString() }).eq("id", zeile.id);\n'
     '      if (error) throw error;\n'
     '      await logAction("update", "vertragsvorlage", zeile.id, art, neu);\n'
     '      // Damit die Formulare sofort den neuen Wert sehen und nicht erst\n'
     '      // nach dem naechsten Anmelden.\n'
     '      try {\n'
     '        const { data } = await window._sb.rpc("vorlage_vorgaben", {\n'
     '          p_art: art, p_gesellschaft: window.IMMO_GESELLSCHAFT_ID || null });\n'
     '        if (data) window.__immoVorgaben = { ...(window.__immoVorgaben || {}), [art]: data };\n'
     '      } catch (_) { /* beim naechsten Start */ }\n'
     '      setMeldung("Werte gespeichert.");\n'
     '      await laden();\n'
     '    } catch (f) {\n'
     '      setFehler("Speichern fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '    setBeschaeftigt("");\n'
     '  };',
     'Vertragsvorlagen: die Werte speichern.'),

    # --- Die Reservierung hatte im Reiter "Vorgaben" gar nichts stehen:
    # Gebuehr, Dauer und Zahlungsfrist standen als 1000, 2592e6 und 5 im
    # Quelltext. Wer keine eigene Vorlage hochlaedt, stellt sie jetzt hier
    # fuer den ganzen Mandanten ein.
    ('FORK',
     r'    \{ key: "laufzeit_monate_standard", label: "Laufzeit des Maklervertrags \(Monate\)", vorgabe: "6" \},',
     '    { key: "laufzeit_monate_standard", label: "Laufzeit des Maklervertrags (Monate)", vorgabe: "6" },\n'
     '    { key: "reservierung_gebuehr_standard", label: "Reservierungsgebühr (€ brutto)", vorgabe: "1000",\n'
     '      hinweis: "Gilt, solange an der Reservierungsvorlage nichts anderes hinterlegt ist." },\n'
     '    { key: "reservierung_dauer_tage_standard", label: "Reservierungsdauer (Tage)", vorgabe: "30" },\n'
     '    { key: "reservierung_zahlungsfrist_standard", label: "Zahlungsfrist der Reservierung (Werktage)", vorgabe: "5" },',
     'Vorgaben: Gebuehr, Dauer und Zahlungsfrist der Reservierung.'),

    # =====================================================================
    # FORK — die Markierung: wo in der eigenen Vorlage welcher Wert steht
    #
    # Gefragt am 28.09.2026: ob die Kunden eine Word- oder PDF-Vorlage
    # hochladen und darin die Bereiche markieren koennen, die zu einem
    # Eingabefeld gehoeren. fork_24 hat das Modell gebaut, hier kommt die
    # Oberflaeche dazu.
    #
    # Beide Wege in einem Bauteil, weil sie sich nur im Zeiger unterscheiden:
    # im PDF ein aufgezogenes Rechteck, im Word eine markierte Textstelle.
    # Gespeichert wird in beiden Faellen dieselbe Zeile.
    # =====================================================================
    ('FORK',
     r'(const IMMO_VERTRAGSARTEN = \[)',
     '// Markieren, wo in der eigenen Vorlage welcher Wert steht.\n'
     '//\n'
     '// Zwei Wege, weil die Dateiformate verschieden sind (fork_24):\n'
     '//\n'
     '//   PDF   Die Seite wird gezeichnet, der Makler zieht ein Rechteck auf.\n'
     '//         Gespeichert werden Seite und Koordinaten in Punkten, Ursprung\n'
     '//         unten links — dieselbe Rechnung wie beim Stempeln der\n'
     '//         Unterschrift, damit beide Seiten dasselbe meinen.\n'
     '//\n'
     '//   Word  Eine .docx hat keine Koordinaten, sie ist XML. Der Makler\n'
     '//         markiert die Stelle im Text, gespeichert wird der Suchtext und\n'
     '//         das wievielte Vorkommen gemeint ist.\n'
     '//\n'
     '// WARUM DER WORD-TEXT NICHT VON mammoth KOMMT: mammoth glaettet den Text\n'
     '// fuers Lesen. Gesucht wird spaeter aber in word/document.xml. Was der\n'
     '// Makler markiert, muss genau das sein, was dort steht — sonst findet die\n'
     '// Erzeugung nichts und sagt nichts. Deshalb lesen wir die Absaetze selbst.\n'
     'function immoDocxAbsaetze(xml) {\n'
     '  const doc = new DOMParser().parseFromString(xml, "application/xml");\n'
     '  const absaetze = [];\n'
     '  const p = doc.getElementsByTagName("w:p");\n'
     '  for (let i = 0; i < p.length; i++) {\n'
     '    const t = p[i].getElementsByTagName("w:t");\n'
     '    let zeile = "";\n'
     '    for (let j = 0; j < t.length; j++) zeile += (t[j].textContent || "");\n'
     '    absaetze.push(zeile);\n'
     '  }\n'
     '  return absaetze;\n'
     '}\n'
     '\n'
     'function VorlagenMarkierung({ vorlage, user, onSchliessen }) {\n'
     '  const [katalog, setKatalog] = useState([]);\n'
     '  const [felder, setFelder] = useState([]);\n'
     '  const [seiten, setSeiten] = useState([]);\n'
     '  const [absaetze, setAbsaetze] = useState([]);\n'
     '  const [laedt, setLaedt] = useState(true);\n'
     '  const [fehler, setFehler] = useState("");\n'
     '  const [meldung, setMeldung] = useState("");\n'
     '  const [zieht, setZieht] = useState(null);\n'
     '  const [offen, setOffen] = useState(null);\n'
     '  const [speichert, setSpeichert] = useState(false);\n'
     '  const darf = hatRecht(user, "admin");\n'
     '  const istPdf = vorlage.dateiformat === "pdf";\n'
     '\n'
     '  const felderLaden = async () => {\n'
     '    const { data, error } = await window._sb.from("vorlagen_felder")\n'
     '      .select("*").eq("vorlage_id", vorlage.id).order("feld");\n'
     '    if (error) throw error;\n'
     '    setFelder(data || []);\n'
     '  };\n'
     '\n'
     '  useEffect(() => { (async () => {\n'
     '    setLaedt(true); setFehler("");\n'
     '    try {\n'
     '      const { data: kat } = await window._sb.rpc("vorlagen_feld_katalog", { p_art: vorlage.art });\n'
     '      setKatalog(kat || []);\n'
     '      await felderLaden();\n'
     '\n'
     '      const { data: datei, error: dErr } = await window._sb.storage\n'
     '        .from("vertragsvorlagen").download(vorlage.storage_pfad);\n'
     '      if (dErr) throw dErr;\n'
     '      const puffer = await datei.arrayBuffer();\n'
     '\n'
     '      if (istPdf) {\n'
     '        if (typeof pdfjsLib === "undefined") throw new Error("Die PDF-Anzeige (pdf.js) ist nicht geladen.");\n'
     '        const dok = await pdfjsLib.getDocument({ data: puffer.slice(0) }).promise;\n'
     '        const raus = [];\n'
     '        // 1.5-fache Vergroesserung: gross genug, um ein Kaestchen genau zu\n'
     '        // treffen, klein genug, dass zehn Seiten den Rechner nicht anhalten.\n'
     '        const skala = 1.5;\n'
     '        for (let n = 1; n <= dok.numPages; n++) {\n'
     '          const seite = await dok.getPage(n);\n'
     '          const sicht = seite.getViewport({ scale: skala });\n'
     '          const leinwand = document.createElement("canvas");\n'
     '          leinwand.width = Math.floor(sicht.width);\n'
     '          leinwand.height = Math.floor(sicht.height);\n'
     '          await seite.render({ canvasContext: leinwand.getContext("2d"), viewport: sicht }).promise;\n'
     '          raus.push({ nr: n - 1, breite: leinwand.width, hoehe: leinwand.height,\n'
     '                      skala, bild: leinwand.toDataURL("image/png") });\n'
     '        }\n'
     '        setSeiten(raus);\n'
     '      } else {\n'
     '        const zip = await window.JSZip.loadAsync(puffer);\n'
     '        const xml = await zip.file("word/document.xml").async("string");\n'
     '        setAbsaetze(immoDocxAbsaetze(xml));\n'
     '      }\n'
     '    } catch (f) {\n'
     '      setFehler("Die Vorlage konnte nicht geöffnet werden: " + (f.message || f));\n'
     '    }\n'
     '    setLaedt(false);\n'
     '  })(); }, [vorlage.id]);\n'
     '\n'
     '  const feldName = (f) => {\n'
     '    const e = katalog.filter((k) => k.feld === f)[0];\n'
     '    return e ? e.name : f;\n'
     '  };\n'
     '  // Schon markierte Felder verschwinden aus der Auswahl: ein Feld gibt es\n'
     '  // je Vorlage nur einmal, und die Datenbank weist das zweite ohnehin ab.\n'
     '  const nochFrei = () => katalog.filter((k) => !felder.some((f) => f.feld === k.feld));\n'
     '\n'
     '  const sichern = async (satz) => {\n'
     '    setFehler(""); setMeldung(""); setSpeichert(true);\n'
     '    try {\n'
     '      const { error } = await window._sb.from("vorlagen_felder")\n'
     '        .insert({ vorlage_id: vorlage.id, ...satz });\n'
     '      if (error) throw error;\n'
     '      await logAction("create", "vorlagen_feld", vorlage.id, satz.feld, satz);\n'
     '      setMeldung("Markierung gespeichert.");\n'
     '      setOffen(null);\n'
     '      await felderLaden();\n'
     '    } catch (f) {\n'
     '      setFehler("Speichern fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '    setSpeichert(false);\n'
     '  };\n'
     '\n'
     '  const entfernen = async (zeile) => {\n'
     '    setFehler(""); setMeldung("");\n'
     '    try {\n'
     '      const { error } = await window._sb.from("vorlagen_felder").delete().eq("id", zeile.id);\n'
     '      if (error) throw error;\n'
     '      await logAction("delete", "vorlagen_feld", zeile.id, zeile.feld, {});\n'
     '      await felderLaden();\n'
     '    } catch (f) {\n'
     '      setFehler("Entfernen fehlgeschlagen: " + (f.message || f));\n'
     '    }\n'
     '  };\n'
     '\n'
     '  // --- PDF: ziehen ---------------------------------------------------------\n'
     '  const punkt = (ev, el) => {\n'
     '    const r = el.getBoundingClientRect();\n'
     '    return { x: ev.clientX - r.left, y: ev.clientY - r.top };\n'
     '  };\n'
     '  const zugStart = (ev, seite) => {\n'
     '    if (!darf) return;\n'
     '    const p = punkt(ev, ev.currentTarget);\n'
     '    setZieht({ seite: seite.nr, x0: p.x, y0: p.y, x1: p.x, y1: p.y });\n'
     '  };\n'
     '  const zugZieht = (ev) => {\n'
     '    if (!zieht) return;\n'
     '    const p = punkt(ev, ev.currentTarget);\n'
     '    setZieht({ ...zieht, x1: p.x, y1: p.y });\n'
     '  };\n'
     '  const zugEnde = (seite) => {\n'
     '    if (!zieht || zieht.seite !== seite.nr) return;\n'
     '    const x = Math.min(zieht.x0, zieht.x1), y = Math.min(zieht.y0, zieht.y1);\n'
     '    const b = Math.abs(zieht.x1 - zieht.x0), h = Math.abs(zieht.y1 - zieht.y0);\n'
     '    setZieht(null);\n'
     '    // Ein Klick ist kein Rechteck. Unter fünf Punkten war es ein Versehen.\n'
     '    if (b < 5 || h < 5) return;\n'
     '    // In PDF-Punkte umrechnen. pdf-lib zaehlt von unten links.\n'
     '    setOffen({\n'
     '      art: "rechteck", seite: seite.nr,\n'
     '      x: +(x / seite.skala).toFixed(2),\n'
     '      y: +((seite.hoehe - (y + h)) / seite.skala).toFixed(2),\n'
     '      breite: +(b / seite.skala).toFixed(2),\n'
     '      hoehe: +(h / seite.skala).toFixed(2)\n'
     '    });\n'
     '  };\n'
     '\n'
     '  // --- Word: markieren -----------------------------------------------------\n'
     '  const textMarkiert = () => {\n'
     '    if (!darf) return;\n'
     '    const s = window.getSelection ? String(window.getSelection()) : "";\n'
     '    const gewaehlt = s.replace(/\\\\s+/g, " ").trim();\n'
     '    if (gewaehlt.length < 2) return;\n'
     '    const ganz = absaetze.join("\\\\n");\n'
     '    const treffer = ganz.split(gewaehlt).length - 1;\n'
     '    if (treffer === 0) {\n'
     '      setFehler("Diese Stelle steht so nicht im Dokument — bitte innerhalb einer Zeile markieren.");\n'
     '      return;\n'
     '    }\n'
     '    setFehler("");\n'
     '    setOffen({ art: "textstelle", suchtext: gewaehlt, treffer, vorkommen: 1 });\n'
     '  };\n'
     '\n'
     '  if (laedt) return React.createElement("div", { style: { padding: 24, color: CI.muted } },\n'
     '    "Vorlage wird geöffnet …");\n'
     '\n'
     '  const zuordnung = offen ? React.createElement("div", {\n'
     '    style: { position: "fixed", inset: 0, background: "rgba(27,42,71,.35)", zIndex: 60,\n'
     '             display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } },\n'
     '    React.createElement("div", { style: { ...cardStyle, padding: 20, maxWidth: 460, width: "100%" } },\n'
     '      React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: CI.blau, marginBottom: 4 } },\n'
     '        "Wozu gehört diese Stelle?"),\n'
     '      React.createElement("div", { style: { fontSize: 12, color: CI.muted, marginBottom: 14, lineHeight: 1.5 } },\n'
     '        offen.art === "rechteck"\n'
     '          ? ("Seite " + (offen.seite + 1) + " · " + Math.round(offen.breite) + " × " + Math.round(offen.hoehe) + " Punkte")\n'
     '          : ("„" + offen.suchtext.slice(0, 70) + (offen.suchtext.length > 70 ? "…" : "") + "“")),\n'
     '      offen.art === "textstelle" && offen.treffer > 1\n'
     '        ? React.createElement("div", { style: { marginBottom: 12 } },\n'
     '            React.createElement("label", { style: labelStyle },\n'
     '              "Diese Stelle steht " + offen.treffer + "-mal im Dokument. Welche ist gemeint?"),\n'
     '            React.createElement("select", { style: inputStyle, value: offen.vorkommen,\n'
     '              onChange: (ev) => setOffen({ ...offen, vorkommen: Number(ev.target.value) }) },\n'
     '              Array.from({ length: offen.treffer }, (_, i) => React.createElement("option",\n'
     '                { key: i + 1, value: i + 1 }, "das " + (i + 1) + ". Vorkommen"))))\n'
     '        : null,\n'
     '      React.createElement("label", { style: labelStyle }, "Feld"),\n'
     '      React.createElement("select", { style: inputStyle, value: offen.feld || "",\n'
     '        "data-markierung-feld": "1",\n'
     '        onChange: (ev) => setOffen({ ...offen, feld: ev.target.value }) },\n'
     '        React.createElement("option", { value: "" }, "— bitte wählen —"),\n'
     '        nochFrei().map((k) => React.createElement("option", { key: k.feld, value: k.feld },\n'
     '          k.name + (k.block ? "  (mehrzeilig)" : "")))),\n'
     '      React.createElement("div", { style: { fontSize: 11, color: CI.muted, marginTop: 8, lineHeight: 1.5 } },\n'
     '        "Bei mehreren Beteiligten — Eheleuten, einer Erbengemeinschaft — nimm den ganzen Block. ",\n'
     '        "Wie viele Personen darin stehen, entscheidet sich erst beim Vertrag."),\n'
     '      React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 16 } },\n'
     '        React.createElement("button", {\n'
     '          onClick: () => {\n'
     '            if (!offen.feld) { setFehler("Bitte ein Feld wählen."); return; }\n'
     '            const satz = offen.art === "rechteck"\n'
     '              ? { feld: offen.feld, zeiger_art: "rechteck", seite: offen.seite,\n'
     '                  x: offen.x, y: offen.y, breite: offen.breite, hoehe: offen.hoehe }\n'
     '              : { feld: offen.feld, zeiger_art: "textstelle",\n'
     '                  suchtext: offen.suchtext, vorkommen: offen.vorkommen };\n'
     '            sichern(satz);\n'
     '          },\n'
     '          disabled: speichert, style: { ...primaryBtn, opacity: speichert ? .6 : 1 } },\n'
     '          speichert ? "Speichert …" : "Übernehmen"),\n'
     '        React.createElement("button", { onClick: () => setOffen(null), style: secondaryBtn }, "Abbrechen"))))\n'
     '    : null;\n'
     '\n'
     '  return React.createElement("div", null,\n'
     '    React.createElement("div", { style: { display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" } },\n'
     '      React.createElement("button", { onClick: onSchliessen, style: secondaryBtn }, "← Zurück"),\n'
     '      React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: CI.blau } },\n'
     '        "Felder markieren — " + (vorlage.dateiname || vorlage.art)),\n'
     '      React.createElement("span", { style: { fontSize: 11, color: CI.gold, letterSpacing: "0.12em",\n'
     '        textTransform: "uppercase", fontWeight: 600 } }, istPdf ? "PDF" : "Word")),\n'
     '    React.createElement("div", { style: { fontSize: 13, color: CI.muted, marginBottom: 16, lineHeight: 1.6 } },\n'
     '      istPdf\n'
     '        ? "Zieh mit der Maus ein Rechteck über die Stelle, an der ein Wert stehen soll, und ordne ihr ein Feld zu."\n'
     '        : "Markiere mit der Maus die Stelle im Text, an der ein Wert stehen soll, und ordne ihr ein Feld zu."),\n'
     '    React.createElement(ErrorBox, null, fehler),\n'
     '    React.createElement(SuccessBox, null, meldung),\n'
     '    !darf ? React.createElement("div", { style: { fontSize: 12.5, color: CI.muted, marginBottom: 14 } },\n'
     '      "Zum Markieren fehlt dir das Recht „Admin-Bereich“ — du siehst hier nur, was markiert ist.") : null,\n'
     '\n'
     '    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 16, alignItems: "start" } },\n'
     '      // --- links: das Dokument ---\n'
     '      React.createElement("div", null,\n'
     '        istPdf\n'
     '          ? seiten.map((s) => React.createElement("div", { key: s.nr,\n'
     '              style: { position: "relative", marginBottom: 16, border: `1px solid ${CI.border}`,\n'
     '                       width: s.breite, maxWidth: "100%" },\n'
     '              onMouseDown: (ev) => zugStart(ev, s),\n'
     '              onMouseMove: zugZieht,\n'
     '              onMouseUp: () => zugEnde(s),\n'
     '              onMouseLeave: () => setZieht(null) },\n'
     '              React.createElement("img", { src: s.bild, alt: "Seite " + (s.nr + 1),\n'
     '                draggable: false, style: { display: "block", width: "100%", userSelect: "none" } }),\n'
     '              felder.filter((f) => f.zeiger_art === "rechteck" && f.seite === s.nr).map((f) =>\n'
     '                React.createElement("div", { key: f.id, title: feldName(f.feld),\n'
     '                  style: { position: "absolute", border: `2px solid ${CI.gold}`,\n'
     '                           background: `${CI.gold}22`, pointerEvents: "none",\n'
     '                           left: Number(f.x) * s.skala, width: Number(f.breite) * s.skala,\n'
     '                           top: s.hoehe - (Number(f.y) + Number(f.hoehe)) * s.skala,\n'
     '                           height: Number(f.hoehe) * s.skala } },\n'
     '                  React.createElement("div", { style: { position: "absolute", top: -16, left: 0,\n'
     '                    fontSize: 10, color: "#fff", background: CI.gold, padding: "1px 4px",\n'
     '                    whiteSpace: "nowrap" } }, feldName(f.feld)))),\n'
     '              (zieht && zieht.seite === s.nr) ? React.createElement("div", {\n'
     '                style: { position: "absolute", border: `2px dashed ${CI.blau}`,\n'
     '                         background: `${CI.blau}14`, pointerEvents: "none",\n'
     '                         left: Math.min(zieht.x0, zieht.x1), top: Math.min(zieht.y0, zieht.y1),\n'
     '                         width: Math.abs(zieht.x1 - zieht.x0), height: Math.abs(zieht.y1 - zieht.y0) } }) : null))\n'
     '          : React.createElement("div", { onMouseUp: textMarkiert,\n'
     '              style: { border: `1px solid ${CI.border}`, background: "#fff", padding: 20,\n'
     '                       maxHeight: "70vh", overflow: "auto", fontSize: 13, lineHeight: 1.7,\n'
     '                       color: CI.ink, whiteSpace: "pre-wrap" } },\n'
     '              absaetze.length ? absaetze.join("\\\\n") : "(Dieses Dokument enthält keinen Text.)")),\n'
     '\n'
     '      // --- rechts: was schon markiert ist ---\n'
     '      React.createElement("div", null,\n'
     '        React.createElement("div", { style: { fontSize: 11, color: CI.gold, letterSpacing: "0.12em",\n'
     '          textTransform: "uppercase", fontWeight: 600, marginBottom: 8 } },\n'
     '          "Markiert (" + felder.length + " von " + katalog.length + ")"),\n'
     '        felder.length === 0\n'
     '          ? React.createElement("div", { style: { fontSize: 12.5, color: CI.muted, lineHeight: 1.5 } },\n'
     '              "Noch nichts markiert. Ohne Markierung bleibt das Dokument, wie es ist.")\n'
     '          : felder.map((f) => React.createElement("div", { key: f.id, "data-markierung": f.feld,\n'
     '              style: { border: `1px solid ${CI.border}`, padding: "8px 10px", marginBottom: 6,\n'
     '                       display: "flex", gap: 8, alignItems: "flex-start" } },\n'
     '              React.createElement("div", { style: { flex: 1, minWidth: 0 } },\n'
     '                React.createElement("div", { style: { fontSize: 12.5, fontWeight: 600, color: CI.blau } },\n'
     '                  feldName(f.feld)),\n'
     '                React.createElement("div", { style: { fontSize: 11, color: CI.muted, marginTop: 2,\n'
     '                  overflow: "hidden", textOverflow: "ellipsis" } },\n'
     '                  f.zeiger_art === "rechteck"\n'
     '                    ? ("Seite " + (f.seite + 1) + " · " + Math.round(f.breite) + " × " + Math.round(f.hoehe))\n'
     '                    : ("„" + String(f.suchtext).slice(0, 40) + "“"\n'
     '                       + (f.vorkommen > 1 ? " (" + f.vorkommen + ".)" : "")))),\n'
     '              darf ? React.createElement("button", { onClick: () => entfernen(f),\n'
     '                style: { background: "none", border: "none", color: CI.danger, cursor: "pointer",\n'
     '                         fontSize: 16, lineHeight: 1, padding: 0 }, title: "Markierung entfernen" }, "×") : null)),\n'
     '        React.createElement("div", { style: { fontSize: 11, color: CI.muted, marginTop: 12, lineHeight: 1.5 } },\n'
     '          istPdf\n'
     '            ? "Passt ein Wert nicht ins Rechteck, wird die Schrift verkleinert — bis 7 pt. Reicht auch das nicht, kommt der Rest auf eine Anlage."\n'
     '            : "Im Word fließt der Text um; ein Block darf beliebig lang werden."))),\n'
     '    zuordnung);\n'
     '}\n'     '\n'
     r'\1',
     'Vertragsvorlagen: die Oberflaeche zum Markieren der Felder.'),

    ('FORK',
     r'      const pfad = "vorlagen/" \+ art \+ "/v" \+ version \+ "-" \+ Date\.now\(\) \+ "\.docx";\n'
     r'      const \{ error: uErr \} = await window\._sb\.storage\.from\("vertragsvorlagen"\)\n'
     r'        \.upload\(pfad, datei, \{ upsert: false,\n'
     r'          contentType: "application/vnd\.openxmlformats-officedocument\.wordprocessingml\.document" \}\);',
     '      const istPdf = /\\\\.pdf$/i.test(datei.name || "");\n'
     '      const endung = istPdf ? ".pdf" : ".docx";\n'
     '      const pfad = "vorlagen/" + art + "/v" + version + "-" + Date.now() + endung;\n'
     '      const { error: uErr } = await window._sb.storage.from("vertragsvorlagen")\n'
     '        .upload(pfad, datei, { upsert: false,\n'
     '          contentType: istPdf ? "application/pdf"\n'
     '            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });',
     'Vertragsvorlagen: auch ein PDF darf hochgeladen werden.'),

    ('FORK',
     r'        art, storage_pfad: pfad, dateiname: datei\.name \|\| "", version, aktiv: true,',
     '        art, storage_pfad: pfad, dateiname: datei.name || "", version, aktiv: true,\n'
     '        dateiformat: istPdf ? "pdf" : "docx",',
     'Vertragsvorlagen: das Format wird mitgeschrieben.'),

    ('FORK',
     r'React\.createElement\("input", \{ type: "file", accept: "\.docx", style: \{ display: "none" \},',
     'React.createElement("input", { type: "file", accept: ".docx,.pdf", style: { display: "none" },',
     'Vertragsvorlagen: die Dateiauswahl nimmt auch PDF.'),

    ('FORK',
     r'(  const \[vorgabenEntwurf, setVorgabenEntwurf\] = useState\(\{\}\);)',
     r'\1\n  const [markiert, setMarkiert] = useState(null);',
     'Vertragsvorlagen: Zustand fuer die Markierung.'),

    ('FORK',
     r'(  if \(laedt\) return React\.createElement\("div", \{ style: \{ padding: 24, color: CI\.muted \} \}, "Lade Vorlagen …"\);)',
     r'\1\n'
     '  // Solange eine Vorlage markiert wird, tritt die Liste zurueck. Zwei\n'
     '  // Dinge nebeneinander waeren auf einem schmalen Bildschirm keines.\n'
     '  if (markiert) return React.createElement(VorlagenMarkierung, {\n'
     '    vorlage: markiert, user, onSchliessen: () => { setMarkiert(null); laden(); } });',
     'Vertragsvorlagen: die Markierung tritt an die Stelle der Liste.'),

    ('FORK',
     r'(          \(jetzt && \(IMMO_VORLAGE_FELDER\[art\] \|\| \[\]\)\.length\) \? React\.createElement\("div",)',
     '          jetzt ? React.createElement("button", {\n'
     '            onClick: () => setMarkiert(jetzt), "data-markieren": art,\n'
     '            style: { ...secondaryBtn, padding: "7px 14px", fontSize: 12.5, marginTop: 10 } },\n'
     '            darfPflegen ? "Felder markieren" : "Markierungen ansehen") : null,\n'
     r'\1',
     'Vertragsvorlagen: der Knopf zum Markieren.'),

    # =====================================================================
    # FORK — ein leergefallener Anker zerlegte das Dokument in Einzelzeichen
    #
    # GEFUNDEN am 28.09.2026 beim Lesen von fillMaklervertrag. Die
    # Neutralisierung ersetzt die Anschrift der Referenz durch "" — auch
    # dort, wo sie als SUCHTEXT stand:
    #
    #     r = r.split("Am Voegenteich 26 R, 18055 Rostock").join(strasse)
    #  wurde zu
    #     r = r.split("").join(strasse)
    #
    # "abc".split("").join("X") ergibt "aXbXc". Der Ausdruck haette also
    # zwischen JEDES Zeichen der Datei word/document.xml die eigene
    # Strassenangabe geschrieben — aus dem Vertrag waere Buchstabensalat
    # geworden, und zwar ohne Fehlermeldung.
    #
    # Zwei Fundstellen: Maklervertrag und Objektnachweis. Der Ausdruck faellt
    # ersatzlos weg; die Strasse setzt ohnehin die Zeile darunter ueber den
    # Platzhalter {strasse}. tests/oberflaeche-rauchtest.py haelt fest, dass
    # kein leerer Anker zurueckkommt.
    # =====================================================================
    ('FORK',
     r'r = r\.split\(""\)\.join\(escapeXml\(i\.strasse\)\), ',
     '',
     'Leergefallener Anker: split("") haette das Dokument zerlegt.'),

    # =====================================================================
    # FORK — die Vorlage fuellen, an den markierten Stellen
    #
    # Der Gegenpart zur Markierung (fork_24, fork_25). Bis heute suchte die
    # Erzeugung woertliche Saetze aus EINEM Mustervertrag; fuer eine fremde
    # Vorlage traf davon nichts, und im Quelltext standen dafuer Namen,
    # Anschriften und Ausweisnummern echter Vertragsparteien.
    #
    # Die Rechnung, an der es schiefgeht, steht in drei reinen Funktionen:
    # welche <w:t>-Laeufe ein Treffer beruehrt, wie umgebrochen wird und wann
    # verkleinert statt abgeschnitten wird. Sie sind absichtlich ohne Browser
    # pruefbar — tests/vorlagen-fuellen.js holt sie sich aus dieser Datei.
    # =====================================================================
    ('FORK',
     r'(function buildVerkaeuferBlock\(e\) \{)',
     '// Die Vorlage fuellen — an den Stellen, die der Makler markiert hat.\n'
     '//\n'
     '// Bis zum 28.09.2026 ging das anders: die Erzeugung suchte woertliche Saetze\n'
     '// aus EINEM Mustervertrag und ersetzte sie. Fuer eine fremde Vorlage traf\n'
     '// davon nichts, und im Quelltext standen dafuer Namen, Anschriften und\n'
     '// Ausweisnummern echter Vertragsparteien. Beides loest sich hier auf:\n'
     '// gesucht wird, was in vorlagen_felder steht, und das hat der Makler selbst\n'
     '// markiert.\n'
     '\n'
     '// --- Was in ein Dokument gehoert ------------------------------------------\n'
     '// Ein Feld kann ein einzelner Wert sein oder ein Block aus N Beteiligten.\n'
     '// Welcher es ist, sagt der Katalog; wie der Block aussieht, entscheidet\n'
     '// buildVerkaeuferBlock — dieselbe Funktion, die ihn immer schon gebaut hat.\n'
     'function immoWerteFuerVorgang(art, v, firma) {\n'
     '  const f = firma || {};\n'
     '  const heute = new Date().toLocaleDateString("de-DE");\n'
     '  const firmenAnschrift = [f.strasse || "", `${f.plz || ""} ${f.ort || ""}`.trim()]\n'
     '    .filter(Boolean).join("\\\\n");\n'
     '  const gemeinsam = {\n'
     '    firma_name: f.firma_name || f.name || "",\n'
     '    firma_anschrift: firmenAnschrift,\n'
     '    makler_name: (window._currentUserName || ""),\n'
     '    datum_heute: heute\n'
     '  };\n'
     '  if (art === "maklervertrag" || art === "vollmacht") {\n'
     '    return {\n'
     '      ...gemeinsam,\n'
     '      verkaeufer_block: buildVerkaeuferBlock(v),\n'
     '      verkaeufer_name: v.verkaeufer_name || "",\n'
     '      verkaeufer_vertreter: v.verkaeufer_vertreter || "",\n'
     '      verkaeufer_strasse: v.verkaeufer_strasse || "",\n'
     '      verkaeufer_plz: v.verkaeufer_plz || "",\n'
     '      verkaeufer_ort: v.verkaeufer_ort || "",\n'
     '      objekt_bezeichnung: v.objekt_bezeichnung || "",\n'
     '      objekt_adresse: v.objekt_adresse || epVertragObjektAdresse(v) || "",\n'
     '      angebotspreis: v.angebotspreis || "",\n'
     '      laufzeit_monate: v.laufzeit_monate || "",\n'
     '      provision: v.provision || "",\n'
     '      provisionsmodell: v.provisionsmodell || ""\n'
     '    };\n'
     '  }\n'
     '  if (art === "objektnachweis") {\n'
     '    const k = Array.isArray(v.kaeufer) ? v.kaeufer : [];\n'
     '    const person = (p) => [\n'
     '      [p.anrede, p.titel, p.vorname, p.nachname].filter(Boolean).join(" ").trim(),\n'
     '      p.strasse || "",\n'
     '      `${p.plz || ""} ${p.ort || ""}`.trim(),\n'
     '      p.geburtsdatum || p.geburt ? "geboren am " + (p.geburtsdatum || p.geburt) : "",\n'
     '      p.ausweis ? "Ausweis " + p.ausweis : ""\n'
     '    ].filter(Boolean).join("\\\\n");\n'
     '    const eins = k[0] || {}, zwei = k[1] || {};\n'
     '    const name = (p) => [p.anrede, p.titel, p.vorname, p.nachname].filter(Boolean).join(" ").trim();\n'
     '    const anschrift = (p) => [p.strasse || "", `${p.plz || ""} ${p.ort || ""}`.trim()]\n'
     '      .filter(Boolean).join("\\\\n");\n'
     '    return {\n'
     '      ...gemeinsam,\n'
     '      kaeufer_block: k.map(person).filter(Boolean).join("\\\\n\\\\n"),\n'
     '      k1_name: name(eins), k1_anschrift: anschrift(eins),\n'
     '      k1_geburt: eins.geburtsdatum || eins.geburt || "", k1_ausweis: eins.ausweis || "",\n'
     '      k2_name: name(zwei), k2_anschrift: anschrift(zwei),\n'
     '      k2_geburt: zwei.geburtsdatum || zwei.geburt || "", k2_ausweis: zwei.ausweis || "",\n'
     '      objekt_bezeichnung: v.objekt_bezeichnung || "",\n'
     '      objekt_adresse: v.objekt_adresse || "",\n'
     '      kaufpreis: v.kaufpreis || "",\n'
     '      provision: v.provision || "",\n'
     '      angebotsdatum: v.angebotsdatum || "",\n'
     '      notar_name: v.notar_name || "",\n'
     '      notar_adresse: v.notar_adresse || ""\n'
     '    };\n'
     '  }\n'
     '  if (art === "reservierung") {\n'
     '    const anschrift = [v.kaeufer_strasse || "",\n'
     '      `${v.kaeufer_plz || ""} ${v.kaeufer_ort || ""}`.trim(),\n'
     '      v.kaeufer_land && v.kaeufer_land !== "Deutschland" ? v.kaeufer_land : ""]\n'
     '      .filter(Boolean).join("\\\\n");\n'
     '    const vorsatz = v.kaeufer_typ === "eheleute" ? "Eheleute"\n'
     '      : v.kaeufer_typ === "firma" ? "" : "";\n'
     '    return {\n'
     '      ...gemeinsam,\n'
     '      kaeufer_block: [vorsatz, v.kaeufer_name || "", anschrift].filter(Boolean).join("\\\\n"),\n'
     '      kaeufer_name: v.kaeufer_name || "",\n'
     '      kaeufer_anschrift: anschrift,\n'
     '      projektname: v.projektname || "",\n'
     '      wohneinheit_nr: v.wohneinheit_nr || "",\n'
     '      etage: v.etage || "",\n'
     '      wohnflaeche_m2: v.wohnflaeche_m2 == null ? "" : String(v.wohnflaeche_m2),\n'
     '      objekt_adresse: [v.objekt_strasse || "",\n'
     '        `${v.objekt_plz || ""} ${v.objekt_ort || ""}`.trim()].filter(Boolean).join("\\\\n"),\n'
     '      kaufpreis: v.kaufpreis == null ? "" : String(v.kaufpreis),\n'
     '      reservierungsgebuehr_brutto: v.reservierungsgebuehr_brutto == null ? "" : String(v.reservierungsgebuehr_brutto),\n'
     '      reservierungsdauer_bis: v.reservierungsdauer_bis || "",\n'
     '      zahlungsfrist_werktage: v.zahlungsfrist_werktage == null ? "" : String(v.zahlungsfrist_werktage),\n'
     '      ort_unterzeichnung: v.ort_unterzeichnung || "",\n'
     '      datum_unterzeichnung: v.datum_unterzeichnung || ""\n'
     '    };\n'
     '  }\n'
     '  return gemeinsam;\n'
     '}\n'
     '\n'
     '// --- PDF: in das markierte Rechteck stempeln -------------------------------\n'
     '// Umbrechen auf die Breite des Kastens. Ein Wort, das allein schon zu breit\n'
     '// ist, wird nicht zerschnitten — es ragt lieber heraus, als in der Mitte\n'
     '// eines Namens zu brechen.\n'
     'function immoZeilenUmbrechen(text, schrift, groesse, breite) {\n'
     '  const raus = [];\n'
     '  for (const absatz of String(text).split("\\\\n")) {\n'
     '    const worte = absatz.split(/\\\\s+/).filter(Boolean);\n'
     '    if (!worte.length) { raus.push(""); continue; }\n'
     '    let zeile = worte[0];\n'
     '    for (let i = 1; i < worte.length; i++) {\n'
     '      const versuch = zeile + " " + worte[i];\n'
     '      if (schrift.widthOfTextAtSize(versuch, groesse) <= breite) zeile = versuch;\n'
     '      else { raus.push(zeile); zeile = worte[i]; }\n'
     '    }\n'
     '    raus.push(zeile);\n'
     '  }\n'
     '  return raus;\n'
     '}\n'
     '\n'
     '// Verkleinern, bis es passt — aber nicht unter die Untergrenze. Was dann noch\n'
     '// nicht passt, kommt auf eine Anlage: ein abgeschnittener Wert in einem\n'
     '// Vertrag ist ein Rechtsmangel, keine Schoenheitsfrage.\n'
     'function immoPasstEs(text, schrift, feld) {\n'
     '  const hoehe = Number(feld.hoehe), breite = Number(feld.breite);\n'
     '  const unten = Number(feld.mindest_schriftgroesse) || 7;\n'
     '  let groesse = Number(feld.schriftgroesse) || 11;\n'
     '  while (groesse >= unten) {\n'
     '    const zeilen = immoZeilenUmbrechen(text, schrift, groesse, breite);\n'
     '    const braucht = zeilen.length * groesse * 1.2;\n'
     '    const zuBreit = zeilen.some((z) => schrift.widthOfTextAtSize(z, groesse) > breite + 0.5);\n'
     '    if (braucht <= hoehe && !zuBreit) return { groesse, zeilen };\n'
     '    groesse = Math.round((groesse - 0.5) * 2) / 2;\n'
     '  }\n'
     '  return null;\n'
     '}\n'
     '\n'
     'async function immoPdfStempeln(bytes, felder, werte) {\n'
     '  const pdf = await PDFLib.PDFDocument.load(bytes);\n'
     '  const schrift = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);\n'
     '  const seiten = pdf.getPages();\n'
     '  const anlage = [];\n'
     '  const warnungen = [];\n'
     '\n'
     '  for (const f of felder) {\n'
     '    if (f.zeiger_art !== "rechteck") continue;\n'
     '    const wert = String(werte[f.feld] == null ? "" : werte[f.feld]).trim();\n'
     '    if (!wert) continue;\n'
     '    const seite = seiten[f.seite];\n'
     '    if (!seite) { warnungen.push(`Seite ${f.seite + 1} gibt es in der Vorlage nicht.`); continue; }\n'
     '\n'
     '    const passt = immoPasstEs(wert, schrift, f);\n'
     '    const x = Number(f.x), y = Number(f.y), b = Number(f.breite), h = Number(f.hoehe);\n'
     '    if (!passt) {\n'
     '      // Der Verweis muss selbst passen — er ist kurz, aber die Vorsicht\n'
     '      // kostet nichts.\n'
     '      anlage.push({ feld: f.feld, wert });\n'
     '      const verweis = "siehe Anlage " + anlage.length;\n'
     '      const klein = Number(f.mindest_schriftgroesse) || 7;\n'
     '      seite.drawText(verweis, { x, y: y + h - klein, size: klein, font: schrift,\n'
     '        color: PDFLib.rgb(0, 0, 0) });\n'
     '      warnungen.push(`„${f.feld}" passte nicht und steht auf Anlage ${anlage.length}.`);\n'
     '      continue;\n'
     '    }\n'
     '    const zeilenhoehe = passt.groesse * 1.2;\n'
     '    passt.zeilen.forEach((zeile, i) => {\n'
     '      const breiteZeile = schrift.widthOfTextAtSize(zeile, passt.groesse);\n'
     '      const versatz = f.ausrichtung === "mitte" ? (b - breiteZeile) / 2\n'
     '        : f.ausrichtung === "rechts" ? (b - breiteZeile) : 0;\n'
     '      seite.drawText(zeile, {\n'
     '        x: x + Math.max(0, versatz),\n'
     '        // Von oben nach unten setzen: y ist die UNTERE Kante des Kastens.\n'
     '        y: y + h - zeilenhoehe * (i + 1) + zeilenhoehe * 0.25,\n'
     '        size: passt.groesse, font: schrift, color: PDFLib.rgb(0, 0, 0)\n'
     '      });\n'
     '    });\n'
     '  }\n'
     '\n'
     '  if (anlage.length) {\n'
     '    const fett = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);\n'
     '    const seite = pdf.addPage();\n'
     '    const { width, height } = seite.getSize();\n'
     '    let y = height - 72;\n'
     '    seite.drawText("Anlage zu diesem Dokument", { x: 72, y, size: 14, font: fett });\n'
     '    y -= 12;\n'
     '    seite.drawText("Die folgenden Angaben passten nicht in das dafür vorgesehene Feld.",\n'
     '      { x: 72, y: y - 12, size: 9, font: schrift });\n'
     '    y -= 40;\n'
     '    anlage.forEach((a, i) => {\n'
     '      seite.drawText("Anlage " + (i + 1) + " — " + a.feld, { x: 72, y, size: 11, font: fett });\n'
     '      y -= 16;\n'
     '      for (const zeile of immoZeilenUmbrechen(a.wert, schrift, 10, width - 144)) {\n'
     '        if (y < 72) return;\n'
     '        seite.drawText(zeile, { x: 72, y, size: 10, font: schrift });\n'
     '        y -= 13;\n'
     '      }\n'
     '      y -= 12;\n'
     '    });\n'
     '  }\n'
     '  return { bytes: await pdf.save(), warnungen };\n'
     '}\n'
     '\n'
     '// --- Word: die markierte Textstelle ersetzen -------------------------------\n'
     '// Word zerlegt einen Satz oft in mehrere <w:t>-Laeufe — mitten im Wort, wenn\n'
     '// die Rechtschreibpruefung dazwischenkam. Die markierte Stelle steht im XML\n'
     '// also selten am Stueck. Deshalb wird erst der Text aller Laeufe eines\n'
     '// Absatzes aneinandergelegt, darin gesucht, und dann werden genau die Laeufe\n'
     '// angefasst, ueber die sich der Treffer erstreckt.\n'
     '// Die Rechnung darin ist rein: gegeben die Texte der Laeufe eines Absatzes\n'
     '// und ein Suchtext — ueber welche Laeufe erstreckt sich das n-te Vorkommen,\n'
     '// und was bleibt vorn und hinten stehen? Ausgelagert, damit sie sich ohne\n'
     '// Browser pruefen laesst; im Browser haengt nur noch das Setzen der Knoten\n'
     '// daran (tests/vorlagen-fuellen.js).\n'
     'function immoTrefferInLaeufen(texte, suche, schonGesehen, gesucht) {\n'
     '  const ganz = texte.join("");\n'
     '  let gesehen = schonGesehen, ab = 0;\n'
     '  for (;;) {\n'
     '    const treffer = ganz.indexOf(suche, ab);\n'
     '    if (treffer < 0) return { gesehen, fund: null };\n'
     '    gesehen += 1;\n'
     '    ab = treffer + suche.length;\n'
     '    if (gesehen !== gesucht) continue;\n'
     '    const ende = treffer + suche.length;\n'
     '    let pos = 0, von = -1, bis = -1, vorne = "", hinten = "";\n'
     '    for (let i = 0; i < texte.length; i++) {\n'
     '      const start = pos, stop = pos + texte[i].length;\n'
     '      if (stop > treffer && start < ende) {\n'
     '        if (von < 0) { von = i; vorne = texte[i].slice(0, treffer - start); }\n'
     '        bis = i; hinten = texte[i].slice(ende - start);\n'
     '      }\n'
     '      pos = stop;\n'
     '    }\n'
     '    if (von < 0) return { gesehen, fund: null };\n'
     '    return { gesehen, fund: { von, bis, vorne, hinten } };\n'
     '  }\n'
     '}\n'
     '\n'
     'function immoDocxErsetzen(xml, felder, werte) {\n'
     '  const doc = new DOMParser().parseFromString(xml, "application/xml");\n'
     '  const warnungen = [];\n'
     '\n'
     '  for (const f of felder) {\n'
     '    if (f.zeiger_art !== "textstelle") continue;\n'
     '    const wert = String(werte[f.feld] == null ? "" : werte[f.feld]);\n'
     '    const suche = String(f.suchtext || "");\n'
     '    if (!suche) continue;\n'
     '    const gesucht = Number(f.vorkommen) || 1;\n'
     '\n'
     '    let gesehen = 0, erledigt = false;\n'
     '    const absaetze = doc.getElementsByTagName("w:p");\n'
     '    for (let p = 0; p < absaetze.length && !erledigt; p++) {\n'
     '      const tListe = absaetze[p].getElementsByTagName("w:t");\n'
     '      const knoten = [], texte = [];\n'
     '      for (let i = 0; i < tListe.length; i++) {\n'
     '        knoten.push(tListe[i]);\n'
     '        texte.push(tListe[i].textContent || "");\n'
     '      }\n'
     '      const erg = immoTrefferInLaeufen(texte, suche, gesehen, gesucht);\n'
     '      gesehen = erg.gesehen;\n'
     '      if (!erg.fund) continue;\n'
     '      const { von, bis, vorne, hinten } = erg.fund;\n'
     '      // Die Laeufe hinter dem ersten leeren; der letzte behaelt seinen Rest.\n'
     '      for (let i = von + 1; i <= bis; i++) {\n'
     '        knoten[i].textContent = (i === bis) ? hinten : "";\n'
     '        knoten[i].setAttribute("xml:space", "preserve");\n'
     '      }\n'
     '      immoWordZeilen(doc, knoten[von], vorne, wert, von === bis ? hinten : "");\n'
     '      erledigt = true;\n'
     '    }\n'
     '    if (!erledigt) {\n'
     '      warnungen.push("„" + f.feld + "\\\\u201c: die markierte Stelle steht nicht mehr in der Vorlage.");\n'
     '    }\n'
     '  }\n'
     '  return { xml: new XMLSerializer().serializeToString(doc), warnungen };\n'
     '}\n'
     '\n'
     '// Mehrzeiliges in einen Lauf schreiben. Ein "\\\\n" ist in Word kein Zeichen,\n'
     '// sondern ein <w:br/> — sonst stuende die Erbengemeinschaft in einer Zeile.\n'
     'function immoWordZeilen(doc, knoten, vorne, wert, hinten) {\n'
     '  const zeilen = String(wert).split("\\\\n");\n'
     '  knoten.textContent = vorne + zeilen[0];\n'
     '  knoten.setAttribute("xml:space", "preserve");\n'
     '  let danach = knoten;\n'
     '  for (let i = 1; i < zeilen.length; i++) {\n'
     '    const br = doc.createElementNS(knoten.namespaceURI, "w:br");\n'
     '    danach.parentNode.insertBefore(br, danach.nextSibling);\n'
     '    const t = doc.createElementNS(knoten.namespaceURI, "w:t");\n'
     '    t.setAttribute("xml:space", "preserve");\n'
     '    t.textContent = zeilen[i];\n'
     '    br.parentNode.insertBefore(t, br.nextSibling);\n'
     '    danach = t;\n'
     '  }\n'
     '  if (hinten) {\n'
     '    const t = doc.createElementNS(knoten.namespaceURI, "w:t");\n'
     '    t.setAttribute("xml:space", "preserve");\n'
     '    t.textContent = hinten;\n'
     '    danach.parentNode.insertBefore(t, danach.nextSibling);\n'
     '  }\n'
     '}\n'
     '\n'
     '// --- Der Weg von der Vorlage zum fertigen Dokument -------------------------\n'
     'async function immoVorlageFuellen(art, vorgang, firma) {\n'
     '  const { data: vorlagen, error: vErr } = await window._sb.from("vertragsvorlagen")\n'
     '    .select("*").eq("art", art).eq("aktiv", true).order("version", { ascending: false });\n'
     '  if (vErr) throw vErr;\n'
     '  const eigene = (vorlagen || []);\n'
     '  // Die der Gesellschaft sticht die des Mandanten — dieselbe Reihenfolge wie\n'
     '  // bei den Vorgaben (fork_23), damit Werte und Text zusammenpassen.\n'
     '  const vorlage = eigene.filter((v) => v.gesellschaft_id\n'
     '      && v.gesellschaft_id === (window.IMMO_GESELLSCHAFT_ID || null))[0]\n'
     '    || eigene.filter((v) => !v.gesellschaft_id)[0] || null;\n'
     '  if (!vorlage) {\n'
     '    throw new Error("Für „" + art + "“ ist keine Vorlage hinterlegt. "\n'
     '      + "Unter Einstellungen → Vertragsvorlagen kannst du eine hochladen.");\n'
     '  }\n'
     '\n'
     '  const { data: felder, error: fErr } = await window._sb.from("vorlagen_felder")\n'
     '    .select("*").eq("vorlage_id", vorlage.id);\n'
     '  if (fErr) throw fErr;\n'
     '  if (!felder || !felder.length) {\n'
     '    throw new Error("In dieser Vorlage ist noch keine Stelle markiert. "\n'
     '      + "Ohne Markierung bliebe das Dokument, wie es ist — "\n'
     '      + "unter Einstellungen → Vertragsvorlagen auf „Felder markieren“.");\n'
     '  }\n'
     '\n'
     '  const { data: datei, error: dErr } = await window._sb.storage\n'
     '    .from("vertragsvorlagen").download(vorlage.storage_pfad);\n'
     '  if (dErr) throw dErr;\n'
     '  const puffer = await datei.arrayBuffer();\n'
     '  const werte = immoWerteFuerVorgang(art, vorgang, firma);\n'
     '\n'
     '  if (vorlage.dateiformat === "pdf") {\n'
     '    const { bytes, warnungen } = await immoPdfStempeln(puffer, felder, werte);\n'
     '    return { bytes, endung: "pdf", warnungen, vorlage };\n'
     '  }\n'
     '  const zip = await window.JSZip.loadAsync(puffer);\n'
     '  const alt = await zip.file("word/document.xml").async("string");\n'
     '  const { xml, warnungen } = immoDocxErsetzen(alt, felder, werte);\n'
     '  zip.file("word/document.xml", xml);\n'
     '  const bytes = await zip.generateAsync({ type: "uint8array" });\n'
     '  return { bytes, endung: "docx", warnungen, vorlage };\n'
     '}\n'     '\n'
     r'\1',
     'Vorlagen fuellen: stempeln im PDF, Textstelle ersetzen im Word.'),

    # =====================================================================
    # FORK — die Erzeugung benutzt die Markierungen, und die Anker fallen weg
    #
    # Damit schliesst sich, was am 28.09.2026 aufgefallen ist: die drei
    # Word-Erzeuger fuellten die Vorlage nicht ueber Platzhalter, sondern
    # indem sie sechsundfuenfzig woertliche Saetze aus EINEM Beispielvertrag
    # der Referenz suchten und ersetzten.
    #
    # Zwei Folgen hatte das, und beide sind hiermit erledigt:
    #
    #   1. Im Quelltext standen Namen, Anschriften, Geburtsdaten und
    #      AUSWEISNUMMERN von Vertragsparteien.
    #   2. Eine eigene Vorlage konnte so gar nicht funktionieren — der Text
    #      eines anderen Maklers enthaelt diese Saetze nicht, die Ersetzung
    #      fand nichts, und das Dokument kam unveraendert heraus. Ohne
    #      Fehlermeldung.
    #
    # An ihre Stelle tritt immoVorlageFuellen(): stempeln im PDF, Textstelle
    # ersetzen im Word — beides an den Stellen, die der Makler selbst
    # markiert hat.
    #
    # Die Namenslogik fuer die Datei bleibt, sie war nie das Problem.
    #
    # NICHT dabei: fillMietvertrag. Der Mietvertrag ist in
    # vertragsvorlagen.art nicht vorgesehen und hat damit keinen Weg ueber
    # eine eigene Vorlage. Seine sechs Fundstellen stehen in docs/OFFEN.md.
    # =====================================================================
    ('FORK',
     # Kein Leerzeile zwischen den beiden Funktionen — der Vorausblick
     # darf also keine erwarten.
     r'(?s)async function fillMaklervertrag\(e\) \{.*?\n\}\n(?=async function fillMietvertrag)',
     '// Eine fertige Datei zum Herunterladen anbieten.\n'
     'function immoDateiAnbieten(bytes, name, endung) {\n'
     '  const typ = endung === "pdf" ? "application/pdf"\n'
     '    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";\n'
     '  const blob = new Blob([bytes], { type: typ });\n'
     '  const url = URL.createObjectURL(blob);\n'
     '  const a = document.createElement("a");\n'
     '  a.href = url; a.download = name;\n'
     '  document.body.appendChild(a); a.click(); a.remove();\n'
     '  setTimeout(() => URL.revokeObjectURL(url), 1000);\n'
     '}\n'
     '\n'
     '// Warnungen aus der Erzeugung sichtbar machen. Ein Wert, der auf der Anlage\n'
     '// gelandet ist, oder eine Markierung, die ins Leere zeigt, darf nicht still\n'
     '// bleiben — sonst unterschreibt jemand ein Dokument mit einer leeren Stelle.\n'
     'function immoVorlageWarnungen(warnungen) {\n'
     '  if (warnungen && warnungen.length) {\n'
     '    window.alert("Hinweis zur Vorlage:\\\\n\\\\n" + warnungen.join("\\\\n"));\n'
     '  }\n'
     '}\n'
     '\n'
     'async function fillMaklervertrag(e) {\n'
     '  // Seit dem 28.09.2026 kommt der Inhalt aus den Stellen, die der Makler in\n'
     '  // seiner eigenen Vorlage markiert hat (fork_24, fork_25).\n'
     '  //\n'
     '  // Der alte Weg suchte woertliche Saetze aus EINEM Mustervertrag der\n'
     '  // Vorlage und ersetzte sie — den Namen der Vertragsparteien, ihre\n'
     '  // Strasse, ihren Ort. Fuer die Vorlage eines anderen Maklers traf davon\n'
     '  // nichts, und das Dokument kam unveraendert heraus, ohne dass es jemand\n'
     '  // gemerkt haette.\n'
     '  // Im Quelltext standen dafuer Namen, Anschriften und Ausweisnummern\n'
     '  // echter Vertragsparteien; die sind damit ebenfalls weg.\n'
     '  const firma = STANDORTE[e.standort || "musterstadt"] || {};\n'
     '  const { bytes, endung, warnungen } = await immoVorlageFuellen("maklervertrag", e, firma);\n'
     '\n'
     '  let p = "";\n'
     '  if ((e.verkaeufer_typ === "erben" || e.verkaeufer_typ === "mehrere")\n'
     '      && Array.isArray(e.erben) && e.erben.length > 0) {\n'
     '    p = e.erben.map((x) => {\n'
     '      const t = String(x.name || "").trim().split(/\\\\s+/);\n'
     '      return t[t.length - 1] || "";\n'
     '    }).filter(Boolean).join("+");\n'
     '  } else if (e.verkaeufer_typ === "firma") {\n'
     '    p = e.verkaeufer_name || "";\n'
     '  } else {\n'
     '    const t = String(e.verkaeufer_name || "").trim();\n'
     '    if (t) { const w = t.split(/\\\\s+/); p = w[w.length - 1] || ""; }\n'
     '  }\n'
     '  if (!p) p = "Verkaeufer";\n'
     '\n'
     '  immoDateiAnbieten(bytes, `Maklervertrag_${fileObjekt(e)}_${fileSafe(p)}.${endung}`, endung);\n'
     '  immoVorlageWarnungen(warnungen);\n'
     '}\n'     '\n'
     "",
     'Maklervertrag: Inhalt aus den markierten Stellen statt aus Ankern.'),

    ('FORK',
     r'(?s)async function fillObjektnachweis\(e\) \{.*?\n\}\n(?=\nfunction exportText)',
     'async function fillObjektnachweis(e) {\n'
     '  // Wie beim Maklervertrag: der Inhalt kommt aus den markierten Stellen.\n'
     '  // Hier standen achtunddreissig woertliche Anker aus einem Mustervertrag,\n'
     '  // darunter Namen, Anschriften, Geburtsdaten und Ausweisnummern der\n'
     '  // Vertragsparteien. Alle weg.\n'
     '  const firma = STANDORTE[e.standort || "musterstadt"] || {};\n'
     '  const { bytes, endung, warnungen } = await immoVorlageFuellen("objektnachweis", e, firma);\n'
     '  const kaeufer = Array.isArray(e.kaeufer) ? e.kaeufer : [];\n'
     '  const namen = kaeufer.map((k) => k.nachname || "").filter(Boolean).join("+") || "Kaeufer";\n'
     '  immoDateiAnbieten(bytes, `Objektnachweis_${fileObjekt(e)}_${fileSafe(namen)}.${endung}`, endung);\n'
     '  immoVorlageWarnungen(warnungen);\n'
     '}\n'     '\n'
     "",
     'Objektnachweis: Inhalt aus den markierten Stellen statt aus Ankern.'),

    # --- MARKE: Beispielnamen der Referenz in zwei Kommentaren.
    # Sie erklaeren, wie zwei Eheleute zu einem Namen zusammengefasst
    # werden — und tun das am Beispiel eines echten Paares aus den
    # Musterdaten. Die Erklaerung bleibt, das Paar geht.
    ('MARKE',
     r'// Beim Ehepaar ist der gemeinsame Nachname der Normalfall: Wer nur "Erich" eintraegt, meint\n  // "Erich Stecker"\. Gespeichert bleibt trotzdem genau das, was getippt wurde\.',
     '// Beim Ehepaar ist der gemeinsame Nachname der Normalfall: Wer beim zweiten\n'
     '  // nur den Vornamen eintraegt, meint den Nachnamen des ersten. Gespeichert\n'
     '  // bleibt trotzdem genau das, was getippt wurde.',
     'Beispielnamen der Referenz im Kommentar zur Namenszusammenfassung.'),
    ('MARKE',
     r'// "Anke & Erich Stecker" bei gemeinsamem Nachnamen, sonst "Anke Müller & Erich Stecker"\.',
     '// Bei gemeinsamem Nachnamen "Vorname & Vorname Nachname", sonst beide Namen voll.',
     'Beispielnamen der Referenz im Kommentar zum Personentext.'),

    # --- Der Mietvertrag ist seit fork_26 eine Vorlagenart wie die anderen.
    ('FORK',
     r'(  if \(art === "reservierung"\) \{)',
     '  if (art === "mietvertrag") {\n'
     '    const anschrift = (strasse, plz, ort) => [strasse || "",\n'
     '      `${plz || ""} ${ort || ""}`.trim()].filter(Boolean).join("\\\\n");\n'
     '    return {\n'
     '      ...gemeinsam,\n'
     '      vermieter_block: immoBeteiligtenBlock(v.vermieter_typ, v.vermieter_name,\n'
     '        v.vermieter_strasse, v.vermieter_plz, v.vermieter_ort, v.vermieter_erben),\n'
     '      vermieter_name: v.vermieter_name || "",\n'
     '      vermieter_strasse: v.vermieter_strasse || "",\n'
     '      vermieter_plz: v.vermieter_plz || "",\n'
     '      vermieter_ort: v.vermieter_ort || "",\n'
     '      mieter_block: immoBeteiligtenBlock(v.mieter_typ, v.mieter_name,\n'
     '        v.mieter_strasse, v.mieter_plz, v.mieter_ort, v.mieter_erben),\n'
     '      mieter_name: v.mieter_name || "",\n'
     '      mieter_strasse: v.mieter_strasse || "",\n'
     '      mieter_plz: v.mieter_plz || "",\n'
     '      mieter_ort: v.mieter_ort || "",\n'
     '      objekt_adresse: anschrift(v.objekt_strasse, v.objekt_plz, v.objekt_ort),\n'
     '      objekt_lage: v.objekt_lage || "",\n'
     '      objekt_raeume: v.objekt_raeume || "",\n'
     '      objekt_wohnflaeche: v.objekt_wohnflaeche || "",\n'
     '      objekt_zustand: v.objekt_zustand || "",\n'
     '      schluessel: v.schluessel || "",\n'
     '      mietbeginn: v.mietbeginn || "",\n'
     '      kuendigungsausschluss_monate: v.kuendigungsausschluss_monate || "",\n'
     '      miete_grundmiete: v.miete_grundmiete || "",\n'
     '      miete_stellplatz: v.miete_stellplatz || "",\n'
     '      miete_bk_kalt: v.miete_bk_kalt || "",\n'
     '      miete_bk_warm: v.miete_bk_warm || "",\n'
     '      miete_gesamt: v.miete_gesamt || "",\n'
     '      kaution_betrag: v.kaution_betrag || "",\n'
     '      bank_kontoinhaber: v.bank_kontoinhaber || "",\n'
     '      bank_iban: v.bank_iban || "",\n'
     '      bank_bic: v.bank_bic || "",\n'
     '      bank_institut: v.bank_institut || ""\n'
     '    };\n'
     '  }\n'     r'\1',
     'Vorlagen fuellen: die Werte des Mietvertrags.'),

    ('FORK',
     r'(?s)async function fillMietvertrag\(e\) \{.*?\n\}\n(?=\nfunction )',
     '// Ein Block aus N Beteiligten — dieselbe Form wie buildVerkaeuferBlock, nur\n'
     '// ohne Bindung an die Feldnamen des Maklervertrags. Der Mietvertrag fuehrt\n'
     '// zwei solche Gruppen: Vermieter und Mieter koennen beide Eheleute oder eine\n'
     '// Erbengemeinschaft sein.\n'
     'function immoBeteiligtenBlock(typ, name, strasse, plz, ort, weitere) {\n'
     '  const liste = Array.isArray(weitere) ? weitere.filter((p) => p && (p.name || p.strasse)) : [];\n'
     '  if ((typ === "erben" || typ === "mehrere") && liste.length > 0) {\n'
     '    const zeilen = typ === "erben" ? ["Erbengemeinschaft"] : [];\n'
     '    liste.forEach((p, i) => {\n'
     '      if (zeilen.length > 0) zeilen.push("");\n'
     '      zeilen.push(typ === "erben" ? `Erbe ${i + 1}: ${p.name || ""}` : (p.name || ""));\n'
     '      zeilen.push(p.strasse || "");\n'
     '      zeilen.push(`${p.plz || ""} ${p.ort || ""}`.trim());\n'
     '    });\n'
     '    return zeilen.join("\\\\n");\n'
     '  }\n'
     '  const vorsatz = typ === "eheleute" ? "Eheleute" : typ === "herr" ? "Herr"\n'
     '    : typ === "frau" ? "Frau" : "";\n'
     '  return [vorsatz, name || "", strasse || "", `${plz || ""} ${ort || ""}`.trim()]\n'
     '    .filter((z) => z !== "").join("\\\\n");\n'
     '}\n'
     '\n'
     'async function fillMietvertrag(e) {\n'
     '  // Wie bei Maklervertrag und Objektnachweis: der Inhalt kommt aus den\n'
     '  // markierten Stellen der eigenen Vorlage. Hier standen zuletzt die\n'
     '  // Vornamen der Mietparteien, ihre Strasse, die Anschrift des Objekts, das\n'
     '  // Kreditinstitut und die Hoehe der Miete aus einem Mustermietvertrag.\n'
     '  const firma = STANDORTE[e.standort || "musterstadt"] || {};\n'
     '  const { bytes, endung, warnungen } = await immoVorlageFuellen("mietvertrag", e, firma);\n'
     '  const wer = (e.vermieter_typ === "erben" || e.vermieter_typ === "mehrere")\n'
     '      && Array.isArray(e.vermieter_erben) && e.vermieter_erben[0] && e.vermieter_erben[0].name\n'
     '    ? e.vermieter_erben[0].name\n'
     '    : (e.vermieter_name || "Vermieter");\n'
     '  const datei = `Mietvertrag_${fileSafe(wer)}_${fileSafe(e.objekt_strasse || "Objekt")}.${endung}`;\n'
     '  immoDateiAnbieten(bytes, datei, endung);\n'
     '  immoVorlageWarnungen(warnungen);\n'
     '}\n'     '\n'
     "",
     'Mietvertrag: Inhalt aus den markierten Stellen statt aus Ankern.'),

    ('FORK',
     r'  \["reservierung", "Reservierung", "Die Reservierungsvereinbarung\."\]\n\];',
     '  ["reservierung", "Reservierung", "Die Reservierungsvereinbarung."],\n'
     '  ["mietvertrag", "Mietvertrag", "Der Mietvertrag über eine Wohnung."]\n'
     '];',
     'Vertragsvorlagen: der Mietvertrag als fuenfte Art.'),

    # --- MARKE: Beispielwerte aus dem Mustermietvertrag in den Platzhaltern
    # der Eingabemaske. Sie stehen dem Nutzer vor Augen: zwei Namen, eine
    # Strasse und eine Stadt der Referenz, ein Kreditinstitut. Ein Beispiel
    # muss ein Beispiel sein, keine Anschrift, die es wirklich gibt.
    ('MARKE', r'z\.B\. Kröpeliner Straße 7', 'z.B. Musterstraße 7',
     'Beispielanschrift der Referenz im Platzhalter.'),
    ('MARKE', r'z\.B\. ING DiBa', 'z.B. Musterbank',
     'Kreditinstitut aus den Musterdaten im Platzhalter.'),
    ('MARKE', r'\(z\.B\. „Maren & Andreas Engel“\)', '(z.B. „Anna & Bernd Muster“)',
     'Beispielnamen aus den Musterdaten im Platzhalter.'),
    ('MARKE', r'z\.B\. Andreas Engel und Maren Engel', 'z.B. Anna Muster und Bernd Muster',
     'wie oben, in der ausgeschriebenen Fassung.'),
    ('MARKE', r'z\. B\. Musterstadt, Musterdorf, Bad Doberan',
     'z. B. Musterstadt, Musterdorf, Musterhausen',
     'Ort der Referenz im Platzhalter der Ortssuche.'),

    # --- MARKE: Vorgabewerte der Marketingkachel. "19399 DOBBERTIN" ist der
    # Ort eines echten Objekts der Referenz, und die Koordinaten daneben
    # zeigen auf ihre Region. Beides steht als VORGABE im Quelltext und
    # erscheint jedem, der die Kachel zum ersten Mal oeffnet.
    ('MARKE', r'"19399 DOBBERTIN"', '"12345 MUSTERDORF"',
     'Ort eines Objekts der Referenz als Vorgabewert der Marketingkachel.'),
    ('MARKE', r'lat: 54\.0924,\n      lng: 12\.0991,',
     'lat: 51.1657,\n      lng: 10.4515,',
     'Koordinaten der Referenzregion als Vorgabe; jetzt die Mitte Deutschlands.'),

    ('MARKE', r'\bEP_', 'IMMO_', 'Vorsatz EP_ in Bezeichnern der Oberflaeche.'),

    # --- MARKE: das Kuerzel in der Erkennung interner Umbuchungen.
    #
    # Gefunden am 28.09.2026, nachdem das Neutralitaets-Gate auch das blosse
    # Kuerzel prueft. In der Liquiditaetsplanung stand:
    #
    #   ["e&p", "musterhaus", "immobilien gmbh", "interne ueberweisung", …]
    #
    # Zwei Buchungen gelten als Umbuchung, wenn Betrag, Datum und Konten
    # passen UND entweder eine eigene IBAN beteiligt ist ODER einer dieser
    # Begriffe im Verwendungszweck steht. Die drei Namen sind der Name der
    # Referenz — "musterhaus" und "immobilien gmbh" sind nur seine schon
    # ersetzte Fassung. Fuer jeden anderen Mandanten treffen sie entweder gar
    # nichts oder das Falsche.
    #
    # Sie entfallen; die vier Begriffe, die eine Umbuchung wirklich
    # beschreiben, bleiben. Der verlaessliche Weg — die eigene IBAN — ist
    # ohnehin der andere Zweig und unberuehrt.
    #
    # Richtig waere, die Liste um den EIGENEN Firmennamen zu ergaenzen. Das
    # braucht ihn an dieser Stelle im Quelltext und gehoert zu getBranding()
    # aus Abschnitt 2c. Vermerkt in docs/OFFEN.md.
    ('MARKE',
     r'a = \["e&p", "musterhaus", "immobilien gmbh", "interne ueberweisung"',
     'a = ["interne ueberweisung"',
     'Name der Referenz in der Erkennung interner Umbuchungen.'),

    # =====================================================================
    # MARKE — ein einzelnes Bauprojekt der Referenz stand als Kachel in der
    #         Oberflaeche
    #
    # Die Mietanfragen haben drei Kacheln: Selbstauskunft, ein NAMENTLICH
    # genanntes Bauprojekt, Online-Anfragen. Die mittlere traegt den Ort und
    # den Namen eines Kundenprojekts im Seitentitel, in der Unterzeile, im
    # Wegweiser und in der Abfrage (quelle = '...').
    #
    # Ersatzlos streichen ginge nicht: Zeilen mit dieser Quelle waeren dann
    # nirgends mehr zu sehen. Die Kachel wird deshalb zu "Weitere Quellen"
    # und faengt alles, was in keine der beiden anderen Listen faellt. Jede
    # Zeile bleibt erreichbar, und kein Projektname steht mehr im Produkt.
    # =====================================================================
    ('MARKE', '\\ \\ \\ \\ \\ \\ \\ \\ \\ \\ \\ \\ \\ \\ teterow:\\ e\\.filter\\(e\\ =>\\ "teterow"\\ ===\\ e\\.quelle\\)\\.length,', '              sonstige: e.filter(e => e.quelle && !t.includes(e.quelle) && !n.includes(e.quelle)).length,',
     'Zaehler der dritten Kachel: alles, was in keine der beiden Listen faellt.'),
    ('MARKE', '\\ \\ \\ \\ \\ \\ \\ \\ \\ \\ \\ \\ \\ \\ neu_teterow:\\ e\\.filter\\(e\\ =>\\ "teterow"\\ ===\\ e\\.quelle\\ \\&\\&\\ "neu"\\ ===\\ e\\.status\\)\\.length,', '              neu_sonstige: e.filter(e => e.quelle && !t.includes(e.quelle) && !n.includes(e.quelle) && "neu" === e.status).length,',
     'dasselbe fuer die ungelesenen.'),
    ('MARKE', '\\ \\ if\\ \\("teterow"\\ ===\\ t\\)\\ return\\ React\\.createElement\\(MietanfragenListe,\\ \\{\\\n\\ \\ \\ \\ user:\\ e,\\\n\\ \\ \\ \\ kategorie:\\ "teterow",\\\n\\ \\ \\ \\ onZurueck:\\ \\(\\)\\ =>\\ n\\(null\\)\\\n\\ \\ \\}\\);', '  if ("sonstige" === t) return React.createElement(MietanfragenListe, {\n    user: e,\n    kategorie: "sonstige",\n    onZurueck: () => n(null)\n  });',
     'Wegweiser zur dritten Kachel.'),
    ('MARKE', '\\ \\ \\ \\ id:\\ "teterow",\\\n\\ \\ \\ \\ title:\\ "Selbstauskunft\\ Teterow",\\\n\\ \\ \\ \\ subtitle:\\ "Eingaben\\ aus\\ dem\\ Teterow\\-Bauprojekt",\\\n\\ \\ \\ \\ icon:\\ "🏗️",\\\n\\ \\ \\ \\ count:\\ a\\.teterow,\\\n\\ \\ \\ \\ neu:\\ a\\.neu_teterow,', '    id: "sonstige",\n    title: "Weitere Quellen",\n    subtitle: "Anfragen aus anderen Formularen und Bauprojekten",\n    icon: "🏗️",\n    count: a.sonstige,\n    neu: a.neu_sonstige,',
     'Kachel eines einzelnen Bauprojekts durch eine allgemeine ersetzt.'),
    ('MARKE', '"selbstauskunft"\\ ===\\ t\\ \\?\\ e\\ =\\ e\\.in\\("quelle",\\ \\["jotform",\\ "selbstauskunft",\\ "manuell"\\]\\)\\ :\\ "teterow"\\ ===\\ t\\ \\?\\ e\\ =\\ e\\.eq\\("quelle",\\ "teterow"\\)\\ :\\ "online"\\ ===\\ t\\ \\&\\&\\ \\(e\\ =\\ e\\.in\\("quelle",\\ \\["immoscout",\\ "immowelt",\\ "kleinanzeigen",\\ "portal",\\ "mail"\\]\\)\\);', '"selbstauskunft" === t ? e = e.in("quelle", ["jotform", "selbstauskunft", "manuell"]) : "sonstige" === t ? e = e.not("quelle", "in", "(jotform,selbstauskunft,manuell,immoscout,immowelt,kleinanzeigen,portal,mail)") : "online" === t && (e = e.in("quelle", ["immoscout", "immowelt", "kleinanzeigen", "portal", "mail"]));',
     'Abfrage der dritten Kachel: der Rest statt eines benannten Projekts.'),
    ('MARKE', '"selbstauskunft"\\ ===\\ t\\ \\?\\ "Selbstauskunft\\-Antworten"\\ :\\ "online"\\ ===\\ t\\ \\?\\ "Online\\-Anfragen"\\ :\\ "teterow"\\ ===\\ t\\ \\?\\ "Selbstauskunft\\ Teterow"\\ :\\ "Mietanfragen"', '"selbstauskunft" === t ? "Selbstauskunft-Antworten" : "online" === t ? "Online-Anfragen" : "sonstige" === t ? "Weitere Quellen" : "Mietanfragen"',
     'Ueberschrift der Liste.'),
    ('MARKE', '\\("selbstauskunft"\\ ===\\ t\\ \\|\\|\\ "teterow"\\ ===\\ t\\ \\|\\|\\ !t\\)\\ \\&\\&\\ React\\.createElement\\("button",\\ \\{', '("selbstauskunft" === t || "sonstige" === t || !t) && React.createElement("button", {',
     'Schaltflaeche, die es auf beiden Selbstauskunft-Listen gibt.'),
    ('MARKE', 'const\\ t\\ =\\ prompt\\("Name\\ des\\ neuen\\ Ordners\\ \\(z\\.B\\.\\ „Mühlenblick\\ Teterow“\\):"\\);', 'const t = prompt("Name des neuen Ordners (z.B. „Wohnpark am See“):");',
     'Beispiel im Eingabefenster: ein Bauprojekt der Referenz.'),
    # Dieselbe Stelle ein zweites Mal — der Schalter "Objektseite als
    # Standard" speichert an einer eigenen Stelle. Aufgefallen ist sie
    # erst, als jeder onConflict der Oberflaeche gegen die wirklich
    # vorhandenen Eindeutigkeitsregeln gehalten wurde
    # (tests/onconflict.py). Ohne die Grenze ging der Schalter seit
    # fork_23 mit einem Fehler zurueck.
    ('FORK',
     '\\ \\ const\\ \\{\\ error\\ \\}\\ =\\ await\\ window\\._sb\\.from\\("portal_einstellungen"\\)\\.upsert\\(\\{\\ schluessel:\\ "landing_standard",\\ wert:\\ !!wert,\\ updated_at:\\ new\\ Date\\(\\)\\.toISOString\\(\\),\\ updated_by:\\ n\\.id\\ \\},\\ \\{\\ onConflict:\\ "schluessel"\\ \\}\\);',
     '  const { error } = await window._sb.from("portal_einstellungen").upsert({ mandant_id: window.IMMO_MANDANT_ID || null, schluessel: "landing_standard", wert: !!wert, updated_at: new Date().toISOString(), updated_by: n.id }, { onConflict: "mandant_id,schluessel" });',
     'Objektseite-Schalter: Konfliktschluessel je Mandant.'),

    # =====================================================================
    # FORK — Selbstregistrierung in der Oberflaeche (Phase 3)
    #
    # Drei Stellen. Das Konto entsteht ueber den normalen Weg von Supabase,
    # damit Bestaetigungsmail und Passwortregeln die von Supabase sind und
    # keine nachgebauten; Firmenname und Name reisen als Anmeldedaten mit.
    # Der MANDANT entsteht erst beim ersten Anmelden — vorher ist die
    # Adresse nicht bestaetigt, und ein Mandant je unbestaetigter Anmeldung
    # waere eine Einladung an jeden.
    # =====================================================================
    ('FORK',
     'async\\ function\\ getProfile\\(e\\)\\ \\{\\\n\\ \\ const\\ \\{\\\n\\ \\ \\ \\ data:\\ t,\\\n\\ \\ \\ \\ error:\\ n\\\n\\ \\ \\}\\ =\\ await\\ window\\._sb\\.from\\("profiles"\\)\\.select\\("\\*"\\)\\.eq\\("id",\\ e\\)\\.single\\(\\);\\\n\\ \\ if\\ \\(n\\)\\ throw\\ n;',
     'async function getProfile(e) {\n  let {\n    data: t,\n    error: n\n  } = await window._sb.from("profiles").select("*").eq("id", e).single();\n\n  // Erstanmeldung nach der Selbstregistrierung: das Konto gibt es, ein\n  // Profil noch nicht (PGRST116 = keine Zeile). Der Firmenname steht in den\n  // Anmeldedaten des Kontos, wo ihn das Registrierungsformular hinterlegt\n  // hat. registrierung_abschliessen() legt dann Mandant, Profil, Standort\n  // und Einstellungen in EINER Transaktion an — siehe fork_30.\n  //\n  // Ohne Firmennamen passiert nichts: dann ist es ein eingeladenes Konto,\n  // dessen Profil aus einem anderen Grund fehlt, und darueber entscheidet\n  // nicht diese Stelle.\n  if (n && n.code === "PGRST116") {\n    let firma = "", name = "";\n    try {\n      const { data: u } = await window._sb.auth.getUser();\n      firma = String(u?.user?.user_metadata?.firma || "").trim();\n      name = String(u?.user?.user_metadata?.name || "").trim();\n    } catch (f) { /* ohne Folgen */ }\n    if (firma) {\n      const { error: rFehler } = await window._sb.rpc("registrierung_abschliessen",\n        { p_firma: firma, p_name: name || null });\n      if (rFehler) throw rFehler;\n      ({ data: t, error: n } = await window._sb.from("profiles").select("*").eq("id", e).single());\n    }\n  }\n  if (n) throw n;',
     'Erstanmeldung: fehlt das Profil und steht ein Firmenname in den Anmeldedaten, wird der Mandant angelegt.'),
    ('FORK',
     'function\\ Login\\(\\)\\ \\{',
     '// ---------------------------------------------------------------------------\n// Selbstregistrierung (Phase 3)\n//\n// Angelegt wird hier nur das KONTO — ueber den normalen Weg von Supabase,\n// damit die Bestaetigungsmail und die Passwortregeln die von Supabase sind\n// und nicht nachgebaute. Firmenname und Name reisen als Anmeldedaten mit.\n//\n// Der Mandant entsteht erst beim ersten Anmelden, in getProfile: vorher ist\n// die Adresse nicht bestaetigt, und ein Mandant je unbestaetigter Anmeldung\n// waere eine Einladung an jeden.\n// ---------------------------------------------------------------------------\nfunction Registrieren({ onZurueck }) {\n  const [feld, setzeFeld] = useState({ firma: "", name: "", email: "", passwort: "", passwort2: "" });\n  const [fehler, setzeFehler] = useState("");\n  const [fertig, setzeFertig] = useState(false);\n  const [laeuft, setzeLaeuft] = useState(false);\n  const aendern = (k) => (ev) => setzeFeld({ ...feld, [k]: ev.target.value });\n\n  const absenden = async () => {\n    setzeFehler("");\n    if (feld.firma.trim().length < 2) return setzeFehler("Bitte geben Sie Ihren Firmennamen an.");\n    if (!/^[^@ ]+@[^@ ]+[.][^@ ]{2,}$/.test(feld.email.trim())) return setzeFehler("Bitte geben Sie eine gültige E-Mail-Adresse an.");\n    if (feld.passwort.length < 10) return setzeFehler("Das Passwort braucht mindestens 10 Zeichen.");\n    if (feld.passwort !== feld.passwort2) return setzeFehler("Die beiden Passwörter stimmen nicht überein.");\n    setzeLaeuft(true);\n    try {\n      const { error } = await window._sb.auth.signUp({\n        email: feld.email.trim().toLowerCase(),\n        password: feld.passwort,\n        options: { data: { firma: feld.firma.trim(), name: feld.name.trim() } }\n      });\n      if (error) throw error;\n      setzeFertig(true);\n    } catch (e) {\n      setzeFehler(e.message || "Die Registrierung ist fehlgeschlagen.");\n    }\n    setzeLaeuft(false);\n  };\n\n  const karte = (inhalt) => React.createElement("div", {\n    style: { minHeight: "100vh", background: `linear-gradient(135deg, ${CI.blau} 0%, ${CI.blauDark} 100%)`,\n             fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }\n  }, React.createElement("div", {\n    style: { background: "#fff", padding: 48, borderRadius: 4, maxWidth: 440, width: "100%",\n             boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }\n  }, React.createElement("div", { style: { display: "flex", justifyContent: "center", marginBottom: 32 } },\n      React.createElement(Logo, { height: 90, variant: "blau" })), inhalt));\n\n  if (fertig) return karte([\n    React.createElement("h1", { key: "h", style: { margin: 0, fontSize: 22, color: CI.blau, fontWeight: 600, textAlign: "center" } },\n      "Fast geschafft"),\n    React.createElement("p", { key: "p", style: { fontSize: 13, color: CI.muted, lineHeight: 1.7, marginTop: 16 } },\n      "Wir haben Ihnen eine E-Mail an ", React.createElement("b", null, feld.email.trim().toLowerCase()),\n      " geschickt. Bestätigen Sie darin Ihre Adresse — danach können Sie sich anmelden, und Ihr Zugang wird eingerichtet."),\n    React.createElement("button", { key: "b", onClick: onZurueck,\n      style: { ...primaryBtn, justifyContent: "center", marginTop: 8, width: "100%" } }, "Zur Anmeldung")\n  ]);\n\n  return karte([\n    React.createElement("div", { key: "k", style: { textAlign: "center", marginBottom: 28 } },\n      React.createElement("h1", { style: { margin: 0, fontSize: 22, color: CI.blau, fontWeight: 600 } }, "Konto anlegen"),\n      React.createElement("div", { style: { fontSize: 12, color: CI.muted, marginTop: 6 } },\n        "30 Tage testen, keine Zahlungsdaten nötig")),\n    React.createElement("div", { key: "f", style: { display: "flex", flexDirection: "column", gap: 16 } },\n      React.createElement("div", null,\n        React.createElement("label", { style: labelStyle }, "Firma"),\n        React.createElement("input", { value: feld.firma, onChange: aendern("firma"), style: inputStyle,\n          placeholder: "Name Ihres Unternehmens", autoComplete: "organization" })),\n      React.createElement("div", null,\n        React.createElement("label", { style: labelStyle }, "Ihr Name"),\n        React.createElement("input", { value: feld.name, onChange: aendern("name"), style: inputStyle,\n          placeholder: "Vor- und Nachname", autoComplete: "name" })),\n      React.createElement("div", null,\n        React.createElement("label", { style: labelStyle }, "E-Mail"),\n        React.createElement("input", { type: "email", value: feld.email, onChange: aendern("email"), style: inputStyle,\n          placeholder: "ihre.e-mail@example.de", autoComplete: "email" })),\n      React.createElement("div", null,\n        React.createElement("label", { style: labelStyle }, "Passwort"),\n        React.createElement("input", { type: "password", value: feld.passwort, onChange: aendern("passwort"), style: inputStyle,\n          placeholder: "mindestens 10 Zeichen", autoComplete: "new-password" })),\n      React.createElement("div", null,\n        React.createElement("label", { style: labelStyle }, "Passwort wiederholen"),\n        React.createElement("input", { type: "password", value: feld.passwort2, onChange: aendern("passwort2"), style: inputStyle,\n          placeholder: "••••••••", autoComplete: "new-password",\n          onKeyDown: (ev) => "Enter" === ev.key && absenden() })),\n      React.createElement(ErrorBox, null, fehler),\n      React.createElement("button", { onClick: absenden, disabled: laeuft,\n        style: { ...primaryBtn, justifyContent: "center", marginTop: 8, opacity: laeuft ? .6 : 1 } },\n        laeuft ? "Wird angelegt …" : "Konto anlegen"),\n      React.createElement("div", { style: { fontSize: 11, color: CI.muted, textAlign: "center", marginTop: 12, lineHeight: 1.6 } },\n        "Sie haben schon ein Konto? ",\n        React.createElement("a", { href: "#", onClick: (ev) => { ev.preventDefault(); onZurueck(); },\n          style: { color: CI.blau, fontWeight: 600 } }, "Anmelden")))\n  ]);\n}\n\nfunction Login() {\n  const [immoModus, immoSetzeModus] = useState("anmelden");',
     'Das Registrierungsformular und der Umschalter in der Anmeldung.'),
    ('FORK',
     '\\ \\ return\\ React\\.createElement\\("div",\\ \\{\\\n\\ \\ \\ \\ style:\\ \\{\\\n\\ \\ \\ \\ \\ \\ minHeight:\\ "100vh",\\\n\\ \\ \\ \\ \\ \\ background:\\ `linear\\-gradient\\(135deg,\\ \\$\\{CI\\.blau\\}\\ 0%,\\ \\$\\{CI\\.blauDark\\}\\ 100%\\)`,\\\n\\ \\ \\ \\ \\ \\ fontFamily:\\ FONT,\\\n\\ \\ \\ \\ \\ \\ display:\\ "flex",\\\n\\ \\ \\ \\ \\ \\ alignItems:\\ "center",\\\n\\ \\ \\ \\ \\ \\ justifyContent:\\ "center",\\\n\\ \\ \\ \\ \\ \\ padding:\\ 24,\\\n\\ \\ \\ \\ \\ \\ position:\\ "relative",\\\n\\ \\ \\ \\ \\ \\ overflow:\\ "hidden"\\\n\\ \\ \\ \\ \\}\\\n\\ \\ \\},\\ React\\.createElement\\("div",\\ \\{\\\n\\ \\ \\ \\ style:\\ \\{\\\n\\ \\ \\ \\ \\ \\ position:\\ "absolute",\\\n\\ \\ \\ \\ \\ \\ top:\\ \\-200,',
     '  // Der Zweig steht IM Rueckgabewert und nicht davor: ein vorgezogenes\n  // return wuerde die uebrigen useState-Aufrufe ueberspringen, und React\n  // verlangt bei jedem Durchlauf dieselbe Reihenfolge.\n  return "registrieren" === immoModus ? React.createElement(Registrieren, {\n    onZurueck: () => immoSetzeModus("anmelden")\n  }) : React.createElement("div", {\n    style: {\n      minHeight: "100vh",\n      background: `linear-gradient(135deg, ${CI.blau} 0%, ${CI.blauDark} 100%)`,\n      fontFamily: FONT,\n      display: "flex",\n      alignItems: "center",\n      justifyContent: "center",\n      padding: 24,\n      position: "relative",\n      overflow: "hidden"\n    }\n  }, React.createElement("div", {\n    style: {\n      position: "absolute",\n      top: -200,',
     'Anmelden oder Registrieren — der Zweig steht im Rueckgabewert.'),
    ('FORK',
     '\\ \\ \\},\\ React\\.createElement\\(ZugangLinkAnfordern,\\ null\\),\\ "Mitarbeiter:\\ Passwort\\ vergessen\\?",\\ React\\.createElement\\("br",\\ null\\),\\ "Bitte\\ wenden\\ Sie\\ sich\\ an\\ Ihren\\ Ansprechpartner\\ bei\\ Musterhaus\\ Immobilien\\."\\)\\)\\)\\)',
     '  }, React.createElement("div", {\n    style: { marginBottom: 10 }\n  }, "Noch kein Konto? ", React.createElement("a", {\n    href: "#",\n    onClick: ev => { ev.preventDefault(); immoSetzeModus("registrieren"); },\n    style: { color: CI.blau, fontWeight: 600 }\n  }, "Firma registrieren")), React.createElement(ZugangLinkAnfordern, null), "Mitarbeiter: Passwort vergessen?", React.createElement("br", null), "Bitte wenden Sie sich an Ihren Ansprechpartner."))))',
     'Hinweis auf die Registrierung in der Fusszeile der Anmeldung.'),
    # Die Rueckmeldung bei einer Adresse, die es schon gibt.
    ('FORK',
     '\\ \\ \\ \\ \\ \\ const\\ \\{\\ error\\ \\}\\ =\\ await\\ window\\._sb\\.auth\\.signUp\\(\\{\\\n\\ \\ \\ \\ \\ \\ \\ \\ email:\\ feld\\.email\\.trim\\(\\)\\.toLowerCase\\(\\),\\\n\\ \\ \\ \\ \\ \\ \\ \\ password:\\ feld\\.passwort,\\\n\\ \\ \\ \\ \\ \\ \\ \\ options:\\ \\{\\ data:\\ \\{\\ firma:\\ feld\\.firma\\.trim\\(\\),\\ name:\\ feld\\.name\\.trim\\(\\)\\ \\}\\ \\}\\\n\\ \\ \\ \\ \\ \\ \\}\\);\\\n\\ \\ \\ \\ \\ \\ if\\ \\(error\\)\\ throw\\ error;\\\n\\ \\ \\ \\ \\ \\ setzeFertig\\(true\\);',
     '      const { data, error } = await window._sb.auth.signUp({\n        email: feld.email.trim().toLowerCase(),\n        password: feld.passwort,\n        options: { data: { firma: feld.firma.trim(), name: feld.name.trim() } }\n      });\n      if (error) throw error;\n      // Eine Anmeldung mit einer BEREITS VORHANDENEN Adresse meldet Supabase\n      // nicht als Fehler — das wuerde verraten, welche Adressen es gibt. Es\n      // legt dann aber auch nichts an und verschickt nichts. Erkennbar ist\n      // der Fall allein an der leeren Liste der Identitaeten.\n      //\n      // Ohne diese Abfrage stand hier "Wir haben Ihnen eine E-Mail\n      // geschickt", und der Anmeldende wartete auf Post, die nie kommen\n      // konnte. Am 29.09.2026 genau so passiert.\n      //\n      // Ja, das verraet jetzt, dass es die Adresse gibt. Das ist die\n      // Abwaegung: eine Sackgasse ohne jede Rueckmeldung ist schlechter als\n      // die Auskunft, dass hier schon jemand ist — zumal die Anmeldemaske\n      // daneben dieselbe Auskunft ohnehin gibt.\n      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {\n        setzeLaeuft(false);\n        return setzeFehler("Zu dieser E-Mail-Adresse gibt es bereits ein Konto. Bitte melden Sie sich an — oder nehmen Sie eine andere Adresse, wenn Sie ein weiteres Unternehmen anlegen möchten.");\n      }\n      setzeFertig(true);',
     'Registrierung: eine vorhandene Adresse wird als solche gemeldet.'),

    # =====================================================================
    # FORK — die Einstellungen waren am Schreibtisch nicht zu finden
    #
    # Die Seite gibt es, die Rechtepruefung gibt es ("chef"), und seit
    # Phase 3 stehen dort zwei neue Reiter: "Zahlung & Freigabe" und
    # "Vertragsvorlagen". Einen WEG dorthin gab es nur an einer Stelle: im
    # Burger-Menue, und das rendert PageShell erst unter 768 Pixeln
    # Fensterbreite. Auf dem Dashboard fehlte die Kachel.
    #
    # Damit war eine Seite, an der wir gearbeitet haben, am Schreibtisch nur
    # ueber "#einstellungen" in der Adresszeile erreichbar. Gemeldet am
    # 29.09.2026 mit der Frage "wo finde ich Einstellungen".
    #
    # Eine Kachel, dieselbe Bedingung wie die Seite, in derselben Gruppe wie
    # "Admin". Kein Redesign, ein fehlender Eingang.
    # =====================================================================
    ('FORK',
     '\\ \\ \\ \\ id:\\ "verwaltung",\\\n\\ \\ \\ \\ titel:\\ "Werkzeuge\\ \\&\\ Verwaltung",\\\n\\ \\ \\ \\ tiles:\\ \\["werkzeuge",\\ "onedrive",\\ "rechnungen",\\ "finanzen",\\ "bewerber",\\ "admin"\\]',
     '    id: "verwaltung",\n    titel: "Werkzeuge & Verwaltung",\n    tiles: ["werkzeuge", "onedrive", "rechnungen", "finanzen", "bewerber", "admin", "einstellungen"]',
     'Kachelgruppe: die Einstellungen gehoeren zur Verwaltung.'),
    ('FORK',
     '\\ \\ \\ \\ s\\ =\\ \\{\\\n\\ \\ \\ \\ \\ \\ id:\\ "bewerber",\\\n\\ \\ \\ \\ \\ \\ title:\\ "Bewerber",\\\n\\ \\ \\ \\ \\ \\ subtitle:\\ "Einstellungstests\\ verwalten",\\\n\\ \\ \\ \\ \\ \\ icon:\\ Users,\\\n\\ \\ \\ \\ \\ \\ num:\\ "★",\\\n\\ \\ \\ \\ \\ \\ isChef:\\ !0\\\n\\ \\ \\ \\ \\};',
     '    s = {\n      id: "bewerber",\n      title: "Bewerber",\n      subtitle: "Einstellungstests verwalten",\n      icon: Users,\n      num: "★",\n      isChef: !0\n    },\n    // Die Seite "Einstellungen" gab es, erreichbar war sie nicht: einen\n    // Eintrag hatte nur das Burger-Menue, und das erscheint erst unter\n    // 768 Pixeln Fensterbreite. Am Schreibtisch fuehrte kein Weg dorthin —\n    // ausser ueber "#einstellungen" in der Adresszeile. Gemeldet am\n    // 29.09.2026: "wo finde ich Einstellungen".\n    immoEinstellungenKachel = {\n      id: "einstellungen",\n      title: "Einstellungen",\n      subtitle: "Firma, Standorte, Vorlagen",\n      icon: Wrench,\n      num: "★",\n      isChef: !0\n    };',
     'Kachel fuer die Einstellungen angelegt.'),
    ('FORK',
     'e\\ \\&\\&\\ "chef"\\ ===\\ e\\.role\\ \\&\\&\\ c\\.push\\(s\\),\\ hatRecht\\(e,\\ "admin"\\)\\ \\&\\&\\ c\\.push\\(r\\);',
     'e && "chef" === e.role && c.push(s), hatRecht(e, "admin") && c.push(r), e && "chef" === e.role && c.push(immoEinstellungenKachel);',
     'Die Kachel erscheint fuer den Chef — dieselbe Bedingung wie die Seite.'),

    # =====================================================================
    # FORK — die Schrift des Mandanten wurde gesetzt und nie benutzt
    #
    # immoCiAnwenden hat --immo-font als CSS-Variable gesetzt. Gelesen hat
    # sie niemand: die Oberflaeche schreibt fontFamily 966-mal als
    # INLINE-Stil, und inline schlaegt jede Regel im Stylesheet. Die
    # Einstellung war also da, das Feld war da, gespeichert wurde auch —
    # sichtbar wurde nichts. Gemeldet am 29.09.2026.
    #
    # Die Farben gehen den richtigen Weg: CI ist ein Objekt, das zur
    # Laufzeit ueberschrieben wird, und die Inline-Stile lesen es bei jedem
    # Rendern neu. FONT war dagegen eine feste Zeichenkette.
    #
    # Jetzt ist FONT veraenderlich und wird genauso ausgetauscht. Dazu zwei
    # Kleinigkeiten, die den Unterschied zwischen "eingestellt" und
    # "sichtbar" ausmachen: "TimesNewRoman" wird zu "Times New Roman"
    # auseinandergezogen (ohne Leerzeichen loest das kein Browser auf), und
    # eine Schrift, die nicht auf dem Geraet liegt, wird nachgeladen.
    # =====================================================================
    ('FORK',
     '\\ \\ FONT\\ =\\ "\'Montserrat\',\\ system\\-ui,\\ sans\\-serif",\\\n\\ \\ FONT_SERIF\\ =\\ "\'Cormorant\\ Garamond\',\\ \'Times\\ New\\ Roman\',\\ serif",',
     '  FONT_SERIF = "\'Cormorant Garamond\', \'Times New Roman\', serif",',
     'FONT aus der const-Kette geloest.'),
    ('FORK',
     'if\\ \\("undefined"\\ !=\\ typeof\\ document\\ \\&\\&\\ !document\\.querySelector\\(`link\\[href="\\$\\{fontLink\\}"\\]`\\)\\)\\ \\{\\\n\\ \\ const\\ e\\ =\\ document\\.createElement\\("link"\\);\\\n\\ \\ e\\.rel\\ =\\ "stylesheet",\\ e\\.href\\ =\\ fontLink,\\ document\\.head\\.appendChild\\(e\\)\\\n\\}',
     'if ("undefined" != typeof document && !document.querySelector(`link[href="${fontLink}"]`)) {\n  const e = document.createElement("link");\n  e.rel = "stylesheet", e.href = fontLink, document.head.appendChild(e)\n}\n\n// ---------------------------------------------------------------------------\n// Die Schrift des Mandanten.\n//\n// FONT steht an 966 Stellen als fontFamily in einem Inline-Stil. Inline\n// schlaegt jede Regel im Stylesheet — eine CSS-Variable zu setzen (so stand\n// es hier bis zum 29.09.2026) hat deshalb NICHTS bewirkt: niemand hat sie\n// gelesen. Gemeldet mit "das mit den Schriftarten funktioniert immer noch\n// nicht".\n//\n// Also derselbe Weg wie bei den Farben: der Wert wird zur Laufzeit\n// ausgetauscht. Die Inline-Stile werden bei jedem Rendern neu gebaut und\n// nehmen ihn dann mit. FONT ist dafuer veraenderlich statt fest.\n// ---------------------------------------------------------------------------\nconst IMMO_FONT_PLATTFORM = "\'Montserrat\', system-ui, sans-serif";\nlet FONT = IMMO_FONT_PLATTFORM;\n\n// Schriften, die auf den ueblichen Geraeten ohnehin liegen. Fuer sie wird\n// nichts nachgeladen.\nconst IMMO_SCHRIFT_SYSTEM = ["times new roman", "georgia", "arial", "helvetica",\n  "helvetica neue", "verdana", "tahoma", "trebuchet ms", "courier new",\n  "garamond", "palatino", "cambria", "calibri", "system-ui", "serif",\n  "sans-serif", "monospace"];\n\n// Aus der Eingabe des Mandanten eine brauchbare Schriftangabe machen. Das\n// Feld in den Einstellungen ist ein freies Textfeld; dort steht\n// "TimesNewRoman" ebenso wie "Times New Roman" oder "Georgia, serif".\nfunction immoSchriftStapel(wert) {\n  let name = String(wert || "").replace(/["\']/g, "").trim();\n  if (!name) return null;\n  if (name.includes(",")) return name;\n  // "TimesNewRoman" loest kein Browser auf. Ohne Leerzeichen, aber mit\n  // Grossbuchstaben im Wort: auseinanderziehen.\n  if (name.indexOf(" ") < 0 && /[a-z0-9][A-Z]/.test(name)) {\n    name = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");\n  }\n  const klein = name.toLowerCase();\n  const serif = /times|georgia|garamond|palatino|roman|book|serif|playfair|merriweather|lora/.test(klein);\n  // Der Rueckfall nennt die Familie nicht ein zweites Mal.\n  const rueckfall = (serif ? ["Georgia", "\'Times New Roman\'", "serif"] : ["system-ui", "sans-serif"])\n    .filter(f => f.replace(/[\'"]/g, "").toLowerCase() !== klein);\n  return "\'" + name + "\', " + rueckfall.join(", ");\n}\n\n// Eine Schrift, die nicht auf dem Geraet liegt, kommt von Google Fonts —\n// derselbe Weg, den die Plattformschrift oben schon nimmt. Liegt sie dort\n// nicht, greift der Rueckfall im Stapel; die Seite bleibt lesbar.\nfunction immoSchriftLaden(name) {\n  if (typeof document === "undefined" || !name) return;\n  if (IMMO_SCHRIFT_SYSTEM.indexOf(name.toLowerCase()) >= 0) return;\n  if (document.querySelector(\'link[data-immo-schrift="\' + name + \'"]\')) return;\n  const l = document.createElement("link");\n  l.rel = "stylesheet";\n  l.href = "https://fonts.googleapis.com/css2?family=" +\n    encodeURIComponent(name).replace(/%20/g, "+") +\n    ":wght@300;400;500;600;700&display=swap";\n  l.setAttribute("data-immo-schrift", name);\n  document.head.appendChild(l);\n}',
     'Die Schrift des Mandanten: Stapel bauen, bei Bedarf nachladen.'),
    ('FORK',
     '\\ \\ Object\\.assign\\(CI,\\ IMMO_CI_PLATTFORM\\);',
     '  Object.assign(CI, IMMO_CI_PLATTFORM);\n  // Wie bei den Farben: immer von der Plattform aus, sonst bliebe beim\n  // Abmelden die Schrift des vorigen Mandanten stehen.\n  FONT = IMMO_FONT_PLATTFORM;\n  const immoStapel = immoSchriftStapel(stamm && stamm.ci_font);\n  if (immoStapel) {\n    FONT = immoStapel;\n    immoSchriftLaden(immoStapel.split(",")[0].replace(/[\'"]/g, "").trim());\n  }',
     'Die Schrift des Mandanten wird gesetzt, nicht nur in eine Variable geschrieben.'),
    ('FORK',
     '\\ \\ Object\\.assign\\(inputStyle,\\ \\{\\ border:\\ `1px\\ solid\\ \\$\\{CI\\.border\\}`,\\ background:\\ CI\\.card,\\ color:\\ CI\\.ink\\ \\}\\);\\\n\\ \\ Object\\.assign\\(labelStyle,\\ \\{\\ color:\\ CI\\.muted\\ \\}\\);\\\n\\ \\ Object\\.assign\\(primaryBtn,\\ \\{\\ background:\\ CI\\.blau,\\ color:\\ "\\#fff"\\ \\}\\);',
     '  // Diese drei tragen fontFamily seit der Ladezeit in sich — sie werden\n  // nicht bei jedem Rendern neu gebaut. Also mit austauschen.\n  Object.assign(inputStyle, { border: `1px solid ${CI.border}`, background: CI.card, color: CI.ink, fontFamily: FONT });\n  Object.assign(labelStyle, { color: CI.muted, fontFamily: FONT });\n  Object.assign(primaryBtn, { background: CI.blau, color: "#fff", fontFamily: FONT });',
     'Auch die eingebackenen Stile bekommen die Schrift.'),
    ('FORK',
     '\\ \\ \\ \\ if\\ \\(stamm\\ \\&\\&\\ stamm\\.ci_font\\)\\ s\\.setProperty\\("\\-\\-immo\\-font",\\ stamm\\.ci_font\\);',
     '    // Die Variable bleibt — fuer Stellen, die spaeter ueber CSS gestaltet\n    // werden. Sie traegt jetzt den fertigen Stapel statt der Roheingabe.\n    s.setProperty("--immo-font", FONT);',
     'Die CSS-Variable traegt den fertigen Schriftstapel.'),

    # =====================================================================
    # FORK — die sichtbaren Reste von onOffice
    #
    # Am 28.09.2026 wurde onOffice ausgebaut: 21 Edge Functions, 14
    # Cron-Jobs, die Kachel, der Reiter. Die rund 190 Fundstellen in der
    # Oberflaeche blieben stehen — mit der Begruendung, sie seien "ohne
    # Einstieg nicht erreichbar".
    #
    # Diese Annahme war falsch. Gemeldet am 29.09.2026: "an vielen Ecken
    # sind immer noch Verknuepfungen zu OnOffice sichtbar". Sie stehen in
    # Bildschirmen, die taeglich benutzt werden — im Termin, am Kontakt, am
    # Preis, in den Hinweistexten.
    #
    # Hier die TEXTE. Wo onOffice nur eine Nebenbemerkung war, faellt sie
    # weg; wo der Satz ohne sie keinen Sinn ergaebe, beschreibt er jetzt,
    # was wirklich passiert. Kein Satz behauptet mehr eine Uebertragung, die
    # es nicht gibt.
    # =====================================================================
    ('MARKE',
     '\\"Beim\\ Speichern\\ wird\\ der\\ Termin\\ auch\\ in\\ onOffice\\ eingetragen\\.\\"',
     '"Beim Speichern wird der Termin im Kalender eingetragen."',
     'onOffice aus einem sichtbaren Text entfernt: Beim Speichern wird der Termin auch in onOffice '),
    ('MARKE',
     '\\"Der\\ Termin\\ wird\\ automatisch\\ auch\\ in\\ onOffice\\ eingetragen\\.\\"',
     '"Der Termin wird im Kalender eingetragen."',
     'onOffice aus einem sichtbaren Text entfernt: Der Termin wird automatisch auch in onOffice ein'),
    ('MARKE',
     '\\"Der\\ Termin\\ erscheint\\ im\\ Kalender,\\ beim\\ Kontakt\\ und\\ wird\\ wie\\ gewohnt\\ nach\\ onOffice\\ übertragen\\.\\"',
     '"Der Termin erscheint im Kalender und beim Kontakt."',
     'onOffice aus einem sichtbaren Text entfernt: Der Termin erscheint im Kalender, beim Kontakt u'),
    ('MARKE',
     '\\"Diesen\\ Termin\\ wirklich\\ löschen\\?\\ Er\\ wird\\ auch\\ in\\ onOffice\\ abgesagt\\.\\"',
     '"Diesen Termin wirklich löschen?"',
     'onOffice aus einem sichtbaren Text entfernt: Diesen Termin wirklich löschen? Er wird auch in '),
    ('MARKE',
     '\\"Alle\\ folgenden\\ Termine\\ der\\ Serie\\ werden\\ gelöscht\\ und\\ in\\ onOffice\\ abgesagt\\.\\ Fortfahren\\?\\"',
     '"Alle folgenden Termine der Serie werden gelöscht. Fortfahren?"',
     'onOffice aus einem sichtbaren Text entfernt: Alle folgenden Termine der Serie werden gelöscht'),
    ('MARKE',
     '\\"Jeder\\ Termin\\ entsteht\\ einzeln\\ —\\ mit\\ eigener\\ Fahrzeit\\ und\\ eigenem\\ Eintrag\\ in\\ onOffice\\.\\"',
     '"Jeder Termin entsteht einzeln — mit eigener Fahrzeit."',
     'onOffice aus einem sichtbaren Text entfernt: Jeder Termin entsteht einzeln — mit eigener Fahr'),
    ('MARKE',
     '\\"Termine\\ werden\\ zusätzlich\\ im\\ Kalender\\ angelegt\\ —\\ damit\\ greift\\ der\\ bestehende\\ onOffice\\-Sync\\.\\"',
     '"Termine werden zusätzlich im Kalender angelegt."',
     'onOffice aus einem sichtbaren Text entfernt: Termine werden zusätzlich im Kalender angelegt —'),
    ('MARKE',
     '\\"Der\\ Urlaub\\ wird\\ die\\ Geschaeftsfuehrung\\ im\\ Dashboard\\ zur\\ Genehmigung\\ vorgelegt\\ und\\ erst\\ danach\\ nach\\ onOffice\\ übertragen\\.\\"',
     '"Der Urlaub wird der Geschäftsführung im Dashboard zur Genehmigung vorgelegt."',
     'onOffice aus einem sichtbaren Text entfernt: Der Urlaub wird die Geschaeftsfuehrung im Dashbo'),
    ('MARKE',
     '\\"Dieser\\ Termin\\ wird\\ automatisch\\ alle\\ 10\\ Minuten\\ aus\\ onOffice\\ übernommen\\.\\"',
     '"Dieser Termin stammt aus einem Abgleich und wird laufend aktualisiert."',
     'onOffice aus einem sichtbaren Text entfernt: Dieser Termin wird automatisch alle 10 Minuten a'),
    ('MARKE',
     '\\"Privater\\ Termin\\ aus\\ onOffice\\ –\\ Details\\ und\\ Bearbeitung\\ sind\\ nur\\ in\\ onOffice\\ möglich\\.\\"',
     '"Privater Termin – Details sind nicht einsehbar."',
     'onOffice aus einem sichtbaren Text entfernt: Privater Termin aus onOffice – Details und Bearb'),
    ('MARKE',
     '\\"Serientermin\\ aus\\ onOffice\\ –\\ Serien\\ können\\ nur\\ direkt\\ in\\ onOffice\\ bearbeitet\\ werden\\.\\ Der\\ Abgleich\\ läuft\\ alle\\ 10\\ Minuten\\.\\"',
     '"Serientermin – Serien werden an der Serie selbst bearbeitet."',
     'onOffice aus einem sichtbaren Text entfernt: Serientermin aus onOffice – Serien können nur di'),
    ('MARKE',
     '\\"onOffice\\-Termin\\ –\\ Änderungen\\ werden\\ direkt\\ in\\ onOffice\\ übernommen\\.\\"',
     '"Übernommener Termin – Änderungen wirken nur hier."',
     'onOffice aus einem sichtbaren Text entfernt: onOffice-Termin – Änderungen werden direkt in on'),
    ('MARKE',
     '\\"Termin\\ absagen\\ \\(auch\\ in\\ onOffice\\)\\"',
     '"Termin löschen"',
     'onOffice aus einem sichtbaren Text entfernt: Termin absagen (auch in onOffice)'),
    ('MARKE',
     '\\"Termin\\ aus\\ onOffice\\"',
     '"Übernommener Termin"',
     'onOffice aus einem sichtbaren Text entfernt: Termin aus onOffice'),
    ('MARKE',
     '\\"auch\\ nach\\ onOffice\\"',
     '""',
     'onOffice aus einem sichtbaren Text entfernt: auch nach onOffice'),
    ('MARKE',
     '\\"\\ onOffice\\-Übertragung\\ fehlgeschlagen\\ —\\ der\\ Termin\\ steht\\ trotzdem\\ im\\ Kalender\\.\\"',
     '" Der Termin steht im Kalender."',
     'onOffice aus einem sichtbaren Text entfernt:  onOffice-Übertragung fehlgeschlagen — der Termi'),
    ('MARKE',
     '\\"Der\\ Termin\\ ist\\ im\\ Portal\\ gespeichert\\ und\\ steht\\ im\\ Kalender\\ —\\ nur\\ die\\ Übertragung\\ nach\\ onOffice\\ hat\\ nicht\\ geklappt:\\ \\"',
     '"Der Termin ist gespeichert und steht im Kalender."',
     'onOffice aus einem sichtbaren Text entfernt: Der Termin ist im Portal gespeichert und steht i'),
    ('MARKE',
     '\\"Der\\ Termin\\ ist\\ im\\ Portal\\ verschoben\\ —\\ nur\\ die\\ Übertragung\\ nach\\ onOffice\\ hat\\ nicht\\ geklappt:\\ \\"',
     '"Der Termin ist verschoben."',
     'onOffice aus einem sichtbaren Text entfernt: Der Termin ist im Portal verschoben — nur die Üb'),
    ('MARKE',
     '\\"Der\\ Termin\\ ist\\ im\\ Portal\\ verschoben,\\ aber\\ die\\ Änderung\\ konnte\\ nicht\\ nach\\ onOffice\\ übertragen\\ werden:\\ \\"',
     '"Der Termin ist verschoben."',
     'onOffice aus einem sichtbaren Text entfernt: Der Termin ist im Portal verschoben, aber die Än'),
    ('MARKE',
     '\\"Der\\ Termin\\ konnte\\ in\\ onOffice\\ nicht\\ abgesagt\\ werden:\\ \\"',
     '"Der Termin konnte nicht gelöscht werden: "',
     'onOffice aus einem sichtbaren Text entfernt: Der Termin konnte in onOffice nicht abgesagt wer'),
    ('MARKE',
     '\\"Die\\ Änderung\\ konnte\\ nicht\\ nach\\ onOffice\\ übertragen\\ werden:\\ \\"',
     '"Die Änderung konnte nicht gespeichert werden: "',
     'onOffice aus einem sichtbaren Text entfernt: Die Änderung konnte nicht nach onOffice übertrag'),
    ('MARKE',
     '\\"\\ Übertragung\\ nach\\ onOffice\\ angestoßen\\.\\"',
     '""',
     'onOffice aus einem sichtbaren Text entfernt:  Übertragung nach onOffice angestoßen.'),
    ('MARKE',
     '\\"\\\\nDer\\ nächste\\ Abgleich\\ \\(alle\\ 10\\ Min\\.\\)\\ stellt\\ im\\ Portal\\ dann\\ wieder\\ den\\ onOffice\\-Stand\\ her\\.\\"',
     '""',
     'onOffice aus einem sichtbaren Text entfernt: \\nDer nächste Abgleich (alle 10 Min.) stellt im '),
    ('MARKE',
     '\\"onOffice\\-Übertragung:\\"',
     '"Übertragung:"',
     'onOffice aus einem sichtbaren Text entfernt: onOffice-Übertragung:'),
    ('MARKE',
     '\\"\\\\nBitte\\ erneut\\ versuchen\\ oder\\ direkt\\ in\\ onOffice\\ prüfen\\.\\"',
     '"\\\\nBitte erneut versuchen."',
     'onOffice aus einem sichtbaren Text entfernt: \\nBitte erneut versuchen oder direkt in onOffice'),
    ('MARKE',
     '\\"Dieser\\ Kontakt\\ stammt\\ aus\\ onOffice\\.\\ Dort\\ bleibt\\ er\\ bestehen\\ und\\ kann\\ beim\\ nächsten\\ Abgleich\\ wieder\\ erscheinen\\ —\\ zum\\ endgültigen\\ Löschen\\ bitte\\ auch\\ in\\ onOffice\\ löschen\\.\\"',
     '"Dieser Kontakt stammt aus einer Übernahme und kann bei einem erneuten Abgleich wieder erscheinen."',
     'onOffice aus einem sichtbaren Text entfernt: Dieser Kontakt stammt aus onOffice. Dort bleibt '),
    ('MARKE',
     '\\"\\ Herkunft\\ laut\\ onOffice:\\ \\"',
     '" Herkunft: "',
     'onOffice aus einem sichtbaren Text entfernt:  Herkunft laut onOffice: '),
    ('MARKE',
     '\\"Bitte\\ hier\\ den\\ Kaufpreis\\ eintragen\\ –\\ er\\ erscheint\\ im\\ Exposé\\ und\\ wird\\ vom\\ onOffice\\-Abgleich\\ nicht\\ überschrieben\\.\\ Ohne\\ Eintrag\\ druckt\\ das\\ Exposé\\ „Auf\\ Anfrage“\\.\\"',
     '"Bitte hier den Kaufpreis eintragen – er erscheint im Exposé. Ohne Eintrag druckt das Exposé „Auf Anfrage“."',
     'onOffice aus einem sichtbaren Text entfernt: Bitte hier den Kaufpreis eintragen – er erschein'),
    ('MARKE',
     '\\"Dieser\\ Angebotspreis\\ ist\\ der\\ interne\\ Kaufpreis:\\ Er\\ steht\\ im\\ Exposé\\ und\\ bleibt\\ beim\\ onOffice\\-Abgleich\\ erhalten\\.\\ Die\\ Portale\\ zeigen\\ weiter\\ „auf\\ Anfrage“\\.\\"',
     '"Dieser Angebotspreis ist der interne Kaufpreis: Er steht im Exposé. Die Portale zeigen weiter „auf Anfrage“."',
     'onOffice aus einem sichtbaren Text entfernt: Dieser Angebotspreis ist der interne Kaufpreis: '),
    ('MARKE',
     '\\"Gepflegt\\ in\\ onOffice\\ —\\ dort\\ eingetragene\\ Werte\\ kommen\\ mit\\ dem\\ nächsten\\ Abgleich\\ hierher\\.\\ Hier\\ eingetragene\\ Werte\\ gelten\\ nur,\\ solange\\ das\\ Feld\\ in\\ onOffice\\ leer\\ ist\\.\\"',
     '"Wird bei einem Abgleich aus dem führenden System übernommen. Hier eingetragene Werte gelten, solange dort nichts steht."',
     'onOffice aus einem sichtbaren Text entfernt: Gepflegt in onOffice — dort eingetragene Werte k'),
    ('MARKE',
     '\\"Wird\\ beim\\ Abgleich\\ aus\\ onOffice\\ übernommen,\\ solange\\ hier\\ nichts\\ eingetragen\\ ist\\.\\"',
     '"Wird bei einem Abgleich aus dem führenden System übernommen, solange hier nichts eingetragen ist."',
     'onOffice aus einem sichtbaren Text entfernt: Wird beim Abgleich aus onOffice übernommen, sola'),
    ('MARKE',
     '\\"Ausgeblendete\\ Objekte\\ —\\ Testobjekte\\ und\\ Altlasten,\\ die\\ aus\\ onOffice\\ kommen\\ und\\ dort\\ nicht\\ gelöscht\\ sind\\"',
     '"Ausgeblendete Objekte — Testobjekte und Altlasten, die nicht gelöscht werden sollen"',
     'onOffice aus einem sichtbaren Text entfernt: Ausgeblendete Objekte — Testobjekte und Altlaste'),
    ('MARKE',
     '\\"Objekt\\-Nr\\.,\\ onOffice\\-Verknüpfung,\\ Status\\ und\\ Verkaufsdatum\\ nicht\\ —\\ die\\ Kopie\\ startet\\ in\\ der\\ Akquise\\.\\"',
     '"Objekt-Nr., Status und Verkaufsdatum nicht — die Kopie startet in der Akquise."',
     'onOffice aus einem sichtbaren Text entfernt: Objekt-Nr., onOffice-Verknüpfung, Status und Ver'),
    ('MARKE',
     '\\"Das\\ Objekt\\ erscheint\\ auf\\ der\\ öffentlichen\\ Objektseite\\ \\(immobilien\\.html\\)\\ —\\ direkt\\ aus\\ dem\\ eigenen\\ Bestand,\\ ohne\\ onOffice\\.\\"',
     '"Das Objekt erscheint auf der öffentlichen Objektseite (immobilien.html) — direkt aus dem eigenen Bestand."',
     'onOffice aus einem sichtbaren Text entfernt: Das Objekt erscheint auf der öffentlichen Objekt'),
    ('MARKE',
     '\\"onOffice:\\ Kaufpreis\\ auf\\ Anfrage\\.\\ \\"',
     '"Kaufpreis auf Anfrage. "',
     'onOffice aus einem sichtbaren Text entfernt: onOffice: Kaufpreis auf Anfrage. '),
    ('MARKE',
     '\\"onOffice\\-Nr\\.\\ \\"',
     '"Fremd-Nr. "',
     'onOffice aus einem sichtbaren Text entfernt: onOffice-Nr. '),
    ('MARKE',
     '\\"onOffice\\-Objekt\\"',
     '"Fremdobjekt"',
     'onOffice aus einem sichtbaren Text entfernt: onOffice-Objekt'),
    ('MARKE',
     '\\"onOffice\\ ·\\ nicht\\ bestätigt\\"',
     '"Fremdsystem · nicht bestätigt"',
     'onOffice aus einem sichtbaren Text entfernt: onOffice · nicht bestätigt'),
    ('MARKE',
     '\\"onOffice\\-Versände:\\"',
     '"Fremdversände:"',
     'onOffice aus einem sichtbaren Text entfernt: onOffice-Versände:'),
    ('MARKE',
     '\\"via\\ onOffice\\"',
     '"übernommen"',
     'onOffice aus einem sichtbaren Text entfernt: via onOffice'),
    ('MARKE',
     '\\"roh\\ aus\\ onOffice\\ geholt\\"',
     '"unverändert übernommen"',
     'onOffice aus einem sichtbaren Text entfernt: roh aus onOffice geholt'),
    ('MARKE',
     '\\"Wochen\\-,\\ Monats\\-\\ und\\ Tagesansicht\\ im\\ onOffice\\-Stil,\\ farbig\\ nach\\ Mitarbeiter\\.\\ Termine\\ gleichen\\ sich\\ in\\ beide\\ Richtungen\\ mit\\ onOffice\\ ab\\.\\ Enthalten\\ sind\\ außerdem\\ Terminbestätigung\\ per\\ Mail\\ mit\\ Kalenderdatei,\\ automatische\\ Erinnerung\\ sechs\\ Stunden\\ vorher,\\ Fahrzeitberechnung\\ und\\ die\\ Urlaubsplanung\\ mit\\ Antrag\\ und\\ Genehmigung\\.\\"',
     '"Wochen-, Monats- und Tagesansicht, farbig nach Mitarbeiter. Enthalten sind außerdem Terminbestätigung per Mail mit Kalenderdatei, automatische Erinnerung sechs Stunden vorher, Fahrzeitberechnung und die Urlaubsplanung mit Antrag und Genehmigung."',
     'onOffice aus einem sichtbaren Text entfernt: Wochen-, Monats- und Tagesansicht im onOffice-St'),
    ('MARKE',
     '\\"Mitarbeiter\\ einladen,\\ Stufen\\ und\\ Rechte\\ je\\ Modul\\ setzen,\\ Firmen\\-Stammdaten\\ pflegen\\ und\\ den\\ onOffice\\-Import\\ steuern\\.\\ Die\\ Stufen\\ sind\\ nur\\ Vorlagen\\ —\\ jedes\\ Häkchen\\ lässt\\ sich\\ einzeln\\ überschreiben\\.\\"',
     '"Mitarbeiter einladen, Stufen und Rechte je Modul setzen und Firmen-Stammdaten pflegen. Die Stufen sind nur Vorlagen — jedes Recht lässt sich einzeln setzen."',
     'onOffice aus einem sichtbaren Text entfernt: Mitarbeiter einladen, Stufen und Rechte je Modul'),
    ('MARKE',
     '\\"\\ —\\ aus\\ dem\\ Posteingang,\\ dem\\ Portal\\-Versand\\ und\\ dem\\ Gesendet\\-Ordner\\ des\\ Postfachs\\ \\(Outlook,\\ onOffice\\)\\.\\"',
     '" — aus dem Posteingang, dem Portal-Versand und dem Gesendet-Ordner des Postfachs."',
     'onOffice aus einem sichtbaren Text entfernt:  — aus dem Posteingang, dem Portal-Versand und d'),

    # --- Und die Knoepfe. Sie rufen Edge Functions, die es seit dem
    # 28.09.2026 nicht mehr gibt: ein Klick darauf endet im Fehler. Sie
    # werden abgeschaltet wie der Reiter in der Objektliste, der schon so
    # abgeschaltet ist — mit einem vorangestellten false. Das ist ein
    # Zeichen Aenderung statt eines Eingriffs in fremde Klammern, und es
    # laesst sich zurueckdrehen, wenn onOffice als Adapter wiederkommt.
    ('MARKE',
     '\\},\\ "●\\ Ungespeichert"\\),\\ !s\\ \\&\\&\\ t\\ \\&\\&\\ "onoffice"\\ !==\\ t\\.quelle\\ \\&\\&\\ !t\\.onoffice_id\\ \\&\\&\\ React\\.createElement\\("button",\\ \\{',
     '}, "● Ungespeichert"), false && !s && t && "onoffice" !== t.quelle && !t.onoffice_id && React.createElement("button", {',
     'Objektkopf: der Knopf "in onOffice anlegen" erscheint nicht mehr.'),
    ('MARKE',
     '\\ \\ \\},\\ "in\\ onOffice"\\),\\ "onoffice"\\ !==\\ t\\.quelle\\ \\&\\&\\ React\\.createElement\\("button",\\ \\{',
     '  }, "in onOffice"), false && "onoffice" !== t.quelle && React.createElement("button", {',
     'Objektkopf: der Knopf "An onOffice uebertragen" erscheint nicht mehr.'),
    ('MARKE',
     '\\),\\ !s\\ \\&\\&\\ t\\ \\&\\&\\ t\\.onoffice_id\\ \\&\\&\\ React\\.createElement\\(React\\.Fragment,\\ null,\\ React\\.createElement\\("span",\\ \\{',
     '), false && !s && t && t.onoffice_id && React.createElement(React.Fragment, null, React.createElement("span", {',
     'Objektkopf: das Abzeichen "in onOffice" und der Aktualisieren-Knopf erscheinen nicht mehr.'),
    ('MARKE',
     '\\ \\ \\},\\ "Finanzierung"\\),\\ React\\.createElement\\("button",\\ \\{\\\n\\ \\ \\ \\ onClick:\\ \\(\\)\\ =>\\ n\\("onoffice"\\),\\\n\\ \\ \\ \\ style:\\ a\\("onoffice"\\ ===\\ t\\)\\\n\\ \\ \\},\\ "onOffice\\-Import"\\),\\ React\\.createElement\\("button",\\ \\{\\\n\\ \\ \\ \\ onClick:\\ \\(\\)\\ =>\\ n\\("urlaub"\\),',
     '  }, "Finanzierung"), React.createElement("button", {\n    onClick: () => n("urlaub"),',
     'Admin: der Reiter "onOffice-Import" ist weg.'),
    ('MARKE',
     '"onoffice"\\ ===\\ u\\.quelle\\ \\?\\ "Übernommener\\ Termin\\ –\\ Änderungen\\ wirken\\ nur\\ hier\\."\\ :\\ u\\.onoffice_id\\ \\?\\ "✓\\ In\\ onOffice\\ übertragen\\ –\\ Änderungen\\ werden\\ dort\\ aktualisiert,\\ Löschen\\ sagt\\ den\\ Termin\\ in\\ onOffice\\ ab\\."\\ :\\ "Beim\\ Speichern\\ wird\\ der\\ Termin\\ im\\ Kalender\\ eingetragen\\."',
     '"Beim Speichern wird der Termin im Kalender eingetragen."',
     'Termin: der Hinweis nennt keine Uebertragung mehr, die es nicht gibt.'),
    ('MARKE',
     '\\ \\ \\},\\ "⟳\\ Neue\\ Vorlagen\\ aus\\ onOffice\\ holen"\\),\\ "Ordner',
     '  }, "⟳ Vorlagen neu einlesen"), "Ordner',
     'Vorlagen: der Knopf nennt kein Fremdsystem mehr.'),

    # --- Der Rest der sichtbaren Texte. Wo onOffice als Beispiel oder
    # Nebenbemerkung stand, faellt es weg; wo es die einzige Erklaerung war,
    # steht jetzt, was ohne Fremdsystem gilt.
    ('MARKE',
     '\\"Fertiges\\ Exposé\\-PDF\\ \\(z\\.\\ B\\.\\ Miet\\-Exposé\\ aus\\ onOffice\\ oder\\ extern\\ gesetztes\\ Exposé\\)\\ direkt\\ am\\ Objekt\\ ablegen\\.\\ Das\\ als\\ FINAL\\ markierte\\ PDF\\ wird\\ bei\\ Exposé\\-Anfragen\\ versendet\\ bzw\\.\\ über\\ den\\ Freigabelink\\ ausgeliefert\\ —\\ auch\\ ohne\\ Erzeugung\\ über\\ die\\ World\\.\\"',
     '"Fertiges Exposé-PDF (zum Beispiel ein extern gesetztes Exposé) direkt am Objekt ablegen. Das als FINAL markierte PDF wird bei Exposé-Anfragen versendet bzw. über den Freigabelink ausgeliefert — auch ohne Erzeugung über die World."',
     'onOffice aus einem sichtbaren Text entfernt: Fertiges Exposé-PDF (z. B. Miet-Exposé aus onOff'),
    ('MARKE',
     '\\"Homepage,\\ Immowelt\\ und\\ Kleinanzeigen:\\ erzeugt\\ ein\\ OpenImmo\\-1\\.27\\-ZIP\\ \\(XML\\ \\+\\ externe\\ Bilder,\\ max\\.\\ 20\\)\\ und\\ lädt\\ es\\ per\\ FTP\\ zum\\ Portal\\.\\ Der\\ Inserat\\-Status\\ \\(grün\\)\\ kommt\\ danach\\ automatisch\\ aus\\ dem\\ Importbericht\\ des\\ Portals;\\ Objekte,\\ die\\ noch\\ über\\ onOffice\\ laufen,\\ werden\\ über\\ die\\ Importberichte\\ und\\ Portalanfragen\\ erkannt\\ oder\\ können\\ manuell\\ gesetzt\\ werden\\.\\"',
     '"Homepage, Immowelt und Kleinanzeigen: erzeugt ein OpenImmo-1.27-ZIP (XML + externe Bilder, max. 20) und lädt es per FTP zum Portal. Der Inserat-Status (grün) kommt danach automatisch aus dem Importbericht des Portals; Er kann auch manuell gesetzt werden."',
     'onOffice aus einem sichtbaren Text entfernt: Homepage, Immowelt und Kleinanzeigen: erzeugt ei'),
    ('MARKE',
     '\\"Interessenten,\\ deren\\ Exposé\\-Link\\ \\(ImmoOffice\\ oder\\ onOffice\\-Agreementlink\\)\\ noch\\ nicht\\ bestätigt/geladen\\ wurde\\.\\ Wer\\ das\\ Exposé\\ bereits\\ bestätigt\\ oder\\ geladen\\ hat\\ –\\ auch\\ über\\ einen\\ zweiten\\ Link\\ zum\\ selben\\ Objekt\\ –\\ erscheint\\ hier\\ nicht\\.\\ Portal\\-Links:\\ automatische\\ Erinnerung\\ nach\\ 48\\ h\\.\\ Alle:\\ Nachfass\\-Aufgabe\\ nach\\ 2\\ Tagen\\.\\ „Erinnern“\\ bei\\ onOffice\\-Einträgen\\ erzeugt\\ einen\\ ImmoOffice\\-Link\\.\\"',
     '"Interessenten, deren Exposé-Link noch nicht bestätigt/geladen wurde. Wer das Exposé bereits bestätigt oder geladen hat – auch über einen zweiten Link zum selben Objekt – erscheint hier nicht. Portal-Links: automatische Erinnerung nach 48 h. Alle: Nachfass-Aufgabe nach 2 Tagen."',
     'onOffice aus einem sichtbaren Text entfernt: Interessenten, deren Exposé-Link (ImmoOffice ode'),
    ('MARKE',
     '\\"Keine\\ Ausweispflicht\\ nach\\ GEG\\ –\\ Kennwert,\\ Klasse,\\ Energieträger\\ und\\ Gültigkeit\\ entfallen;\\ der\\ Grund\\ wird\\ im\\ Exposé,\\ auf\\ der\\ Objektseite\\ und\\ in\\ onOffice\\ \\(„es\\ besteht\\ keine\\ Pflicht!“\\)\\ genannt\\.\\ Ein\\ geplanter\\ Abriss\\ ist\\ keine\\ Ausnahme\\.\\"',
     '"Keine Ausweispflicht nach GEG – Kennwert, Klasse, Energieträger und Gültigkeit entfallen; der Grund wird im Exposé. Ein geplanter Abriss ist keine Ausnahme."',
     'onOffice aus einem sichtbaren Text entfernt: Keine Ausweispflicht nach GEG – Kennwert, Klasse'),
    ('MARKE',
     '\\"Objekt\\ aus\\ allen\\ Listen\\ ausblenden\\?\\\\n\\\\nEs\\ bleibt\\ erhalten\\ und\\ lässt\\ sich\\ über\\ „Ausgeblendete“\\ in\\ der\\ Objektliste\\ jederzeit\\ zurückholen\\.\\ Gedacht\\ für\\ Testobjekte\\ aus\\ onOffice,\\ die\\ dort\\ nicht\\ gelöscht\\ werden\\.\\"',
     '"Objekt aus allen Listen ausblenden?\\\\n\\\\nEs bleibt erhalten und lässt sich über „Ausgeblendete“ in der Objektliste jederzeit zurückholen."',
     'onOffice aus einem sichtbaren Text entfernt: Objekt aus allen Listen ausblenden?\\n\\nEs bleibt'),
    ('MARKE',
     '\\"Wird\\ beim\\ Speichern\\ am\\ Termin\\ hinterlegt,\\ hier\\ im\\ Kalender\\ als\\ Schraffur\\ vor\\ und\\ nach\\ dem\\ Termin\\ gezeichnet\\ und\\ in\\ onOffice\\ in\\ die\\ Wegzeit\\-Felder\\ \\(Hinweg\\ /\\ Rückweg\\)\\ geschrieben\\.\\"',
     '"Wird beim Speichern am Termin hinterlegt, hier im Kalender als Schraffur vor und nach dem Termin gezeichnet."',
     'onOffice aus einem sichtbaren Text entfernt: Wird beim Speichern am Termin hinterlegt, hier i'),
    ('MARKE',
     '\\"Titel/Preis\\ werden\\ direkt\\ in\\ onOffice\\ gespeichert\\ und\\ sind\\ danach\\ auch\\ in\\ den\\ Portalen\\ und\\ auf\\ der\\ Webseite\\ sichtbar\\.\\ Fortfahren\\?\\"',
     '"Titel und Preis werden gespeichert und sind danach auch in den Portalen und auf der Webseite sichtbar. Fortfahren?"',
     'onOffice aus einem sichtbaren Text entfernt: Titel/Preis werden direkt in onOffice gespeicher'),
    ('MARKE',
     '\\"Keine\\ onOffice\\-Objekte\\ gefunden\\.\\ Ggf\\.\\ erst\\ unter\\ Werkzeuge\\ →\\ onOffice\\ synchronisieren\\.\\"',
     '"Keine Fremdobjekte gefunden."',
     'onOffice aus einem sichtbaren Text entfernt: Keine Fremdobjekte gefunden. Ggf. erst unter Wer'),
    ('MARKE',
     '\\"onOffice\\-Verbindung\\"',
     '"Fremdsystem-Verbindung"',
     'onOffice aus einem sichtbaren Text entfernt: onOffice-Verbindung'),
    ('MARKE',
     '\\"onOffice\\ laden\\ fehlgeschlagen:\\"',
     '"Laden fehlgeschlagen:"',
     'onOffice aus einem sichtbaren Text entfernt: onOffice laden fehlgeschlagen:'),
    ('MARKE',
     '\\"Fehler\\ beim\\ onOffice\\-Import:\\ \\"',
     '"Fehler beim Import: "',
     'onOffice aus einem sichtbaren Text entfernt: Fehler beim onOffice-Import: '),
    ('MARKE',
     '\\"Hole\\ Objektdaten\\ aus\\ onOffice\\ …\\"',
     '"Hole Objektdaten …"',
     'onOffice aus einem sichtbaren Text entfernt: Hole Objektdaten aus onOffice …'),
    ('MARKE',
     '\\"AUS\\ ONOFFICE\\"',
     '"ÜBERNOMMEN"',
     'onOffice aus einem sichtbaren Text entfernt: AUS ONOFFICE'),
    ('MARKE',
     '\\"Alle\\ onOffice\\-Rohdaten\\ anzeigen\\"',
     '"Alle Rohdaten anzeigen"',
     'onOffice aus einem sichtbaren Text entfernt: Alle onOffice-Rohdaten anzeigen'),
    ('MARKE',
     '\\"in\\ onOffice\\"',
     '"übernommen"',
     'onOffice aus einem sichtbaren Text entfernt: in onOffice'),
    ('MARKE',
     '\\"direkt\\ in\\ onOffice\\"',
     '"im führenden System"',
     'onOffice aus einem sichtbaren Text entfernt: direkt in onOffice'),
    ('MARKE',
     '\\"Das\\ onOffice\\-Objekt\\ ist\\ nicht\\ in\\ der\\ ImmoOffice\\ angelegt\\ –\\ Exposé\\-Link\\ kann\\ nicht\\ erzeugt\\ werden\\.\\"',
     '"Zu diesem Eintrag gibt es kein Objekt – Exposé-Link kann nicht erzeugt werden."',
     'onOffice aus einem sichtbaren Text entfernt: Expose-Link ohne Objekt'),

    # --- Vorlage vom 02.10.2026: drei neue Fundstellen aus den Stufen 112,
    # 120 und 121. Der Rauchtest hat sie beim ersten Lauf gemeldet — die
    # Schranke vom 29.09. tut also, was sie soll.
    ('MARKE',
     '"Retusche\\ übernommen\\.\\ Hinweis:\\ In\\ onOffice\\ liegt\\ noch\\ das\\ bisherige\\ Bild\\ –\\ bitte\\ dort\\ austauschen\\."',
     '"Retusche übernommen. Hinweis: Im Fremdsystem liegt noch das bisherige Bild – bitte dort austauschen."',
     'Private-Details-Retusche: Hinweis ohne Fremdmarke (Stufe 112).'),
    ('MARKE',
     '"\\ –\\ nicht\\ direkt\\ an\\ World\\ angebunden\\.\\ Inserate\\ laufen\\ über\\ onOffice;\\ der\\ Status\\ kommt\\ über\\ die\\ Importberichte\\."',
     '" – nicht direkt angebunden. Inserate laufen über das Fremdsystem; der Status kommt über die Importberichte."',
     'Admin/Portale: Statushinweis ohne Fremdmarke (Stufe 120).'),
    ('MARKE',
     '"Nicht\\ enthalten:\\ onOffice\\-Lizenz,\\ Microsoft\\ 365,\\ Mail\\-Hosting\\.',
     '"Nicht enthalten: CRM-Lizenz, Microsoft 365, Mail-Hosting.',
     'Admin/Kosten: die Aufzaehlung nennt kein Fremdprodukt beim Namen (Stufe 121).'),
    ('FORK',
     'async\\ function\\ epTrHochladenStandard\\(pfad,\\ datei,\\ fortschritt\\)\\ \\{\\\n\\ \\ const\\ \\{\\ data\\ \\}\\ =\\ await\\ window\\._sb\\.auth\\.getSession\\(\\);',
     'async function epTrHochladenStandard(pfad, datei, fortschritt) {\n  // Dieser Upload geht als nackter XHR an die Storage-API und laeuft\n  // damit NEBEN der Storage-Huelle vorbei, die sonst jedem Pfad den\n  // Mandanten voranstellt. Ohne diese Zeilen fehlte das erste\n  // Pfadsegment, und die restriktive Richtlinie aus fork_09\n  // (foldername[1] = Mandant) wuerde den Upload abweisen — die\n  // Oberflaeche zeigte einen Fehler, den niemand einem Pfad zuordnet.\n  const immoM = window.IMMO_MANDANT_ID;\n  if (!immoM) throw new Error("Kein Mandant am Konto - bitte neu anmelden.");\n  if (!String(pfad).startsWith(immoM + "/")) pfad = immoM + "/" + pfad;\n  const { data } = await window._sb.auth.getSession();',
     'Transfer: der XHR-Upload stellt den Mandanten voran (Stufe 117).'),

    # Zweiter Durchgang (29.09.2026). Die Annahme vom 28.09., die restlichen
    # Fundstellen seien "ohne Einstieg nicht erreichbar", war falsch — der
    # Auftraggeber hat sie in der Oberflaeche gesehen. Deshalb hier jeder
    # noch sichtbare Text. Die technischen Bezeichner (Spalten wie
    # onoffice_id, Funktionsnamen, Schluessel der Funktionsschalter) bleiben:
    # der CRM-Sync bleibt laut CLAUDE.md bis Phase 2b im Code.
    ('MARKE',
     '"Prüft\\ den\\ onOffice\\-API\\-Zugang\\ und\\ liest\\ testweise\\ die\\ ersten\\ fünf\\ Objekte\\.',
     '"Prüft den API-Zugang des Fremdsystems und liest testweise die ersten fünf Objekte.',
     'Verbindungstest: Beschreibung ohne Fremdmarke.'),
    ('MARKE',
     '`\\$\\{n\\.gesamt\\}\\ Objekte\\ in\\ onOffice`',
     '`${n.gesamt} Objekte im Fremdsystem`',
     'Verbindungstest: Ergebniszeile ohne Fremdmarke.'),
    ('MARKE',
     '"Lade\\ onOffice\\-Objekte…"',
     '"Lade Objekte aus dem Fremdsystem…"',
     'Objektauswahl: Ladehinweis ohne Fremdmarke.'),
    ('MARKE',
     '\\},\\ "onOffice\\ \\(",\\ R\\.length\\ \\|\\|\\ "…",\\ "\\)"\\)',
     '}, "Fremdsystem (", R.length || "…", ")")',
     'Reiter ueber der Objektliste ohne Fremdmarke.'),
    ('MARKE',
     '\\},\\ "onOffice"\\)\\)\\)\\)\\)',
     '}, "Extern")))))',
     'Kalender: Herkunfts-Kennzeichen am Termin ohne Fremdmarke.'),
    ('MARKE',
     '`✓\\ onOffice:\\ \\$\\{e\\.neu\\}\\ neue\\ Vorlage\\$\\{1===e\\.neu\\?"":"n"\\}\\ übernommen',
     '`✓ ${e.neu} neue Vorlage${1===e.neu?"":"n"} übernommen',
     'Vorlagen-Import: Erfolgsmeldung ohne Fremdmarke.'),
    ('MARKE',
     '\\(meist\\ nur\\ Kauf/Miete\\ aus\\ onOffice\\)',
     '(meist nur Kauf/Miete aus dem Import)',
     'Suchkriterien-Abgleich: Hinweis ohne Fremdmarke.'),
    ('MARKE',
     'verlieren\\ aber\\ die\\ Verknüpfung\\.\\ In\\ onOffice\\ bleibt\\ das\\ Objekt\\ bestehen\\.`',
     'verlieren aber die Verknüpfung.`',
     'Objekt loeschen: Hinweis auf das Fremdsystem entfaellt.'),
    ('MARKE',
     'Hinweis:\\ Solange\\ onOffice\\ dasselbe\\ Objekt\\ an\\ \\$\\{a\\}\\ liefert,',
     'Hinweis: Solange ein Fremdsystem dasselbe Objekt an ${a} liefert,',
     'Portaluebertragung: Warnhinweis ohne Fremdmarke.'),
    ('MARKE',
     '"Dieses\\ Objekt\\ jetzt\\ in\\ onOffice\\ anlegen\\?\\ Es\\ wird\\ dort\\ als\\ NEUES\\ Objekt\\ erstellt\\ und\\ danach\\ mit\\ dem\\ Portal\\ verknüpft\\.\\ Der\\ onOffice\\-Sync\\ fasst\\ es\\ anschließend\\ nicht\\ mehr\\ an\\."',
     '"Dieses Objekt jetzt im Fremdsystem anlegen? Es wird dort als NEUES Objekt erstellt und danach mit dem Portal verknüpft. Der Sync fasst es anschließend nicht mehr an."',
     'Portalobjekt anlegen: Rueckfrage ohne Fremdmarke.'),
    ('MARKE',
     'title:\\ "Dieses\\ Portal\\-Objekt\\ als\\ neues\\ Objekt\\ in\\ onOffice\\ anlegen",',
     'title: "Dieses Portal-Objekt als neues Objekt im Fremdsystem anlegen",',
     'Portalobjekt anlegen: Knopf-Titel ohne Fremdmarke.'),
    ('MARKE',
     '"↻\\ onOffice\\ aktualisieren"',
     '"↻ Fremdsystem aktualisieren"',
     'Portalobjekt: Knopf ohne Fremdmarke.'),
    ('MARKE',
     'Der\\ Termin\\ steht\\ im\\ Kalender\\ und\\ in\\ onOffice\\.',
     'Der Termin steht im Kalender.',
     'Urlaubsmail: Hinweis auf das Fremdsystem entfaellt.'),
    ('MARKE',
     '`Serie:\\ \\$\\{i\\}/\\$\\{l\\}\\ nach\\ onOffice\\ übertragen\\ …`',
     '`Serie: ${i}/${l} ins Fremdsystem übertragen …`',
     'Terminserie: Fortschritt ohne Fremdmarke.'),
    ('MARKE',
     '`Serie:\\ \\$\\{i\\}/\\$\\{r\\.geaendert\\}\\ in\\ onOffice\\ aktualisiert\\ …`',
     '`Serie: ${i}/${r.geaendert} im Fremdsystem aktualisiert …`',
     'Terminserie: Fortschritt beim Aendern ohne Fremdmarke.'),
    ('MARKE',
     '`\\$\\{e\\}\\ Termine\\ der\\ Serie\\ geändert\\ —\\ in\\ onOffice\\ ebenfalls\\.`',
     '`${e} Termine der Serie geändert — im Fremdsystem ebenfalls.`',
     'Terminserie: Abschlussmeldung ohne Fremdmarke.'),
    ('MARKE',
     '\\$\\{t\\.uebertragen\\}\\ davon\\ sind\\ schon\\ in\\ onOffice\\.',
     '${t.uebertragen} davon sind schon im Fremdsystem.',
     'Terminserie: Anlagemeldung ohne Fremdmarke.'),
    ('MARKE',
     '"\\ onOffice\\ bricht\\ eine\\ Abfrage\\ komplett\\ ab,\\ sobald\\ ein\\ Feldname\\ unbekannt\\ ist\\.',
     '" Das Fremdsystem bricht eine Abfrage komplett ab, sobald ein Feldname unbekannt ist.',
     'Sync-Assistent: Reihenfolge-Hinweis ohne Fremdmarke.'),
    ('MARKE',
     '"Prüfe\\ Feldnamen\\ einzeln\\ gegen\\ die\\ onOffice\\-API\\ —\\ das\\ dauert\\ 1–2\\ Minuten\\ …"',
     '"Prüfe Feldnamen einzeln gegen die API des Fremdsystems — das dauert 1–2 Minuten …"',
     'Sync-Assistent: Schritt 1 ohne Fremdmarke.'),
    ('MARKE',
     '"Vollsync\\ aller\\ Objekte\\ aus\\ onOffice\\ in\\ den\\ Spiegel',
     '"Vollsync aller Objekte aus dem Fremdsystem in den Spiegel',
     'Sync-Assistent: Schritt 2 ohne Fremdmarke.'),
    ('MARKE',
     '\\$\\{e\\.deaktiviert\\}\\ nicht\\ mehr\\ in\\ onOffice`',
     '${e.deaktiviert} nicht mehr im Fremdsystem`',
     'Sync-Assistent: Ergebniszeile ohne Fremdmarke.'),
    ('MARKE',
     '\\$\\{n\\}\\ Objekte\\ ohne\\ Bild\\ in\\ onOffice\\.`',
     '${n} Objekte ohne Bild im Fremdsystem.`',
     'Sync-Assistent: Bilder-Ergebnis ohne Fremdmarke.'),
    ('MARKE',
     '\\(z\\.\\ B\\.\\ ein\\ altes\\ onOffice\\-\\ oder\\ ein\\ externes\\ Exposé\\)',
     '(zum Beispiel ein älteres oder ein extern gesetztes Exposé)',
     'Exposé-Endkontrolle: Beispiel ohne Fremdmarke.'),
    ('MARKE',
     '"Exposé",\\ "Exposés",\\ "onOffice",\\ "ImmoScout24"',
     '"Exposé", "Exposés", "ImmoScout24"',
     'Rechtschreibpruefung: Fremdmarke aus dem eigenen Woerterbuch.'),

    # Auch die Texte hinter den abgeschalteten Knoepfen (false &&) werden
    # neutralisiert: die Annahme "wird nicht angezeigt, also egal" hat sich
    # einmal als falsch erwiesen, sie wird nicht ein zweites Mal gemacht.
    ('MARKE',
     '`In\\ onOffice\\ angelegt\\ \\(Objekt\\-Nr\\.\\ \\$\\{e\\.onoffice_id\\}\\)',
     '`Im Fremdsystem angelegt (Objekt-Nr. ${e.onoffice_id})',
     'Portalobjekt anlegen: Erfolgsmeldung ohne Fremdmarke.'),
    ('MARKE',
     '`\\ Von\\ onOffice\\ abgelehnt:\\ \\$\\{a\\.join\\(",\\ "\\)\\}\\.`',
     '` Vom Fremdsystem abgelehnt: ${a.join(", ")}.`',
     'Portaluebertragung: Fehlerzusatz ohne Fremdmarke (zweimal).'),
    ('MARKE',
     'ze\\ \\?\\ "Überträgt…"\\ :\\ "An\\ onOffice\\ übertragen"',
     'ze ? "Überträgt…" : "Ans Fremdsystem übertragen"',
     'Portaluebertragung: Knopf ohne Fremdmarke.'),
    ('MARKE',
     '`Die\\ Objektdaten\\ jetzt\\ nach\\ onOffice\\ übertragen\\?\\ Das\\ verknüpfte\\ onOffice\\-Objekt\\ \\(Nr\\.\\ \\$\\{t\\.onoffice_id\\}\\)\\ wird\\ mit\\ dem\\ aktuellen\\ Portal\\-Stand\\ überschrieben\\.`',
     '`Die Objektdaten jetzt ans Fremdsystem übertragen? Das verknüpfte Objekt (Nr. ${t.onoffice_id}) wird mit dem aktuellen Portal-Stand überschrieben.`',
     'Portaluebertragung: Rueckfrage ohne Fremdmarke.'),
    ('MARKE',
     '`onOffice\\ aktualisiert\\ \\(Objekt\\-Nr\\.\\ \\$\\{e\\.onoffice_id\\}\\)',
     '`Fremdsystem aktualisiert (Objekt-Nr. ${e.onoffice_id})',
     'Portaluebertragung: Erfolgsmeldung beim Aktualisieren ohne Fremdmarke.'),
    ('MARKE',
     'title:\\ "Aktuellen\\ Portal\\-Stand\\ in\\ das\\ verknüpfte\\ onOffice\\-Objekt\\ \\(Nr\\.\\ "',
     'title: "Aktuellen Portal-Stand in das verknüpfte Objekt des Fremdsystems (Nr. "',
     'Portaluebertragung: Knopf-Titel ohne Fremdmarke.'),
    ('MARKE',
     'marginLeft:\\ 8\\ \\}\\ \\},\\ "onOffice"\\)\\ :\\ null\\)',
     'marginLeft: 8 } }, "Extern") : null)',
     'Suchkriterien-Abgleich: Herkunfts-Kennzeichen ohne Fremdmarke.'),
    ('MARKE',
     'Der\\ onOffice\\-Agreementlink\\ bleibt\\ bestehen;',
     'Der Agreementlink des Fremdsystems bleibt bestehen;',
     'Exposé-Karte: Rueckfrage ohne Fremdmarke.'),
    ('MARKE',
     'console\\.warn\\("onOffice:",\\ e\\)',
     'console.warn("Fremdsystem:", e)',
     'Protokollzeile in der Browserkonsole ohne Fremdmarke.'),
    ('MARKE',
     'Exposé\\-nicht\\-abgerufen\\-Karte\\ inkl\\.\\ onOffice\\-Agreementlinks',
     'Exposé-nicht-abgerufen-Karte inkl. Agreementlinks',
     'Kopfkommentar der Oberflaeche ohne Fremdmarke.'),

    # --- Der Name des Mandanten in Ausgaben (Phase 2.4) ------------------
    # Das Gegenstueck zu immoFirmenName in den Edge Functions, und mit
    # derselben Regel: ohne Eintrag LEER, nie ein Beispielname.
    # immoCiAnwenden setzt window.IMMO_MARKE beim Anmelden und leert es beim
    # Abmelden — der Helfer steht deshalb direkt davor.
    ('FORK',
     r'async function immoCiAnwenden\(stamm\) \{',
     '// Der Name des Mandanten, wie er nach aussen auftritt. Leer, wenn\n'
     '// keine Stammdaten hinterlegt sind oder niemand angemeldet ist.\n'
     '// Eine fehlende Grussformel faellt auf; eine falsche nicht.\n'
     'function immoMarke() {\n'
     '  const n = typeof window !== "undefined" ? window.IMMO_MARKE : null;\n'
     '  return (typeof n === "string" && n.trim()) ? n.trim() : "";\n'
     '}\n'
     '// Mit Trenner davor und dahinter — oder gar nichts. Ein Gedankenstrich\n'
     '// ohne Namen dahinter faellt auf, eine fehlende Zeile nicht.\n'
     'function immoMarkeMit(vorne, hinten) {\n'
     '  const n = immoMarke();\n'
     '  return n ? (vorne || "") + n + (hinten || "") : "";\n'
     '}\n'
     '// Ein einzelnes Feld der Stammdaten des Mandanten. Dieselbe Regel:\n'
     '// ohne Eintrag LEER. Die Vorlage hatte Anschrift und Telefonnummer\n'
     '// verdrahtet — in Platzhaltern, die in Vertragsvorlagen eingesetzt\n'
     '// werden, also in Dokumenten, die der Eigentuemer bekommt.\n'
     'function immoFirma(feld) {\n'
     '  const f = typeof window !== "undefined" ? window.IMMO_FIRMA : null;\n'
     '  const w = f && f[feld];\n'
     '  return (typeof w === "string" && w.trim()) ? w.trim() : "";\n'
     '}\n'
     'window.immoMarke = immoMarke; window.immoMarkeMit = immoMarkeMit;\n'
     'window.immoFirma = immoFirma;\n'
     'async function immoCiAnwenden(stamm) {',
     'Helfer immoMarke/immoMarkeMit eingezogen (Firmenname je Mandant).'),

    # --- Die Bewerbertest-Seite ist oeffentlich ---------------------------
    # Wie SignaturPublicPage: kein angemeldeter Nutzer, also kein
    # window.IMMO_MARKE. Der Name kommt aus der Antwort von
    # bewerbertest-abrufen, die seit heute firma.name mitschickt.
    # Ein Bewerber, der sich bei Makler A bewirbt, hat auf der Testseite den
    # Namen des Demo-Mandanten gelesen — dreimal, einmal als Begruessung.
    ('FORK',
     r'function BewerbertestPublicPage\(\{',
     '// Bei wem bewirbt sich der Kandidat? Aus der Antwort von\n'
     '// bewerbertest-abrufen, ohne Eintrag LEER.\n'
     'function immoBwFirma(k) {\n'
     '  const n = k && k.firma && k.firma.name;\n'
     '  return (typeof n === "string" && n.trim()) ? n.trim() : "";\n'
     '}\n'
     'function BewerbertestPublicPage({',
     'Bewerbertest: Helfer fuer den Firmennamen aus der Antwort.'),

    # =====================================================================
    # Die Signaturseite: drei Rechtstexte nannten den falschen Namen
    # =====================================================================
    # SignaturPublicPage ist OEFFENTLICH — kein angemeldeter Nutzer, also
    # kein window.IMMO_MARKE. Der Name kommt aus der Antwort von
    # signatur-token-validieren, die seit heute firma.name mitschickt
    # (scripts/neutralisieren-funktionen.py).
    #
    # Betroffen waren: die Erklaerung zum vorzeitigen Taetigkeitsbeginn
    # (sie nennt das Unternehmen, auf dessen Widerrufsfrist der
    # Unterzeichner verzichtet — zweimal, einmal als angezeigter Text und
    # einmal als gespeicherter Wortlaut) und der Datenschutzhinweis (er
    # nennt den Verantwortlichen nach Art. 6 DSGVO). Ein falscher Name ist
    # dort schlechter als keiner.
    ('FORK',
     r'function SignaturPublicPage\(\{',
     '// Wer laesst hier unterschreiben? Der Name kommt mit der Antwort von\n'
     '// signatur-token-validieren (firma.name) und ist ohne Eintrag in\n'
     '// firma_stammdaten LEER — wie immoFirmenName in den Edge Functions.\n'
     '// Der Rueckfall benennt keine Firma, sondern die Rolle: der\n'
     '// Maklervertrag selbst nennt das Unternehmen, und ohne Stammdaten\n'
     '// entsteht er ohnehin nicht (docs/ENTSCHEIDUNGEN.md).\n'
     'function immoSigFirma(antwort) {\n'
     '  const n = antwort && antwort.firma && antwort.firma.name;\n'
     '  return (typeof n === "string" && n.trim()) ? n.trim() : "das Maklerunternehmen";\n'
     '}\n'
     'function SignaturPublicPage({',
     'Signaturseite: Helfer fuer den Firmennamen aus der Antwort.'),
    ('MARKE', r'onChange:\ e\ =>\ v\("taetigkeit_vorzeitig",\ "Ich\ verlange\ ausdrücklich,\ dass\ Musterhaus\ Immobilien\ GmbH\ bereits\ vor\ Ablauf\ der\ 14\-tägigen\ Widerrufsfrist\ mit\ der\ Maklertätigkeit\ beginnt\.",\ e\.target\.checked,\ g\),', 'onChange: e => v("taetigkeit_vorzeitig", `Ich verlange ausdrücklich, dass ${immoSigFirma(i)} bereits vor Ablauf der 14-tägigen Widerrufsfrist mit der Maklertätigkeit beginnt.`, e.target.checked, g),',
     'Signaturseite: der gespeicherte Wortlaut der Erklaerung zum '
     'vorzeitigen Taetigkeitsbeginn nennt den Mandanten.'),
    ('MARKE', r'",\ dass\ Musterhaus\ Immobilien\ GmbH\ bereits\ vor\ Ablauf\ der\ 14\-tägigen\ Widerrufsfrist\ mit\ der\ Maklertätigkeit\ beginnt\."\)\)', '`, dass ${immoSigFirma(i)} bereits vor Ablauf der 14-tägigen Widerrufsfrist mit der Maklertätigkeit beginnt.`))',
     'Signaturseite: der angezeigte Text derselben Erklaerung.'),
    ('MARKE', r'"\ Zur\ rechtssicheren\ Dokumentation\ des\ Vertragsschlusses\ verarbeitet\ die\ Musterhaus\ Immobilien\ GmbH\ Ihren\ Namen', '` Zur rechtssicheren Dokumentation des Vertragsschlusses verarbeitet ${immoSigFirma(i)} Ihren Namen',
     'Signaturseite: der Datenschutzhinweis nennt den Verantwortlichen. Die '
     'ganze Zeichenkette wird zur Schablone — in einem Anfuehrungsstrich-'
     'Literal stuende ${...} als Text da.'),
    ('MARKE', r'Weitere\ Informationen:\ immooffice\.example/datenschutz"\)', 'Weitere Informationen: immooffice.example/datenschutz`)',
     'Signaturseite: und ihr Ende, damit die Schablone geschlossen wird.'),
]


# ===========================================================================
# Regeln NUR fuer die Nebenseiten (src/seiten/), angewendet nach
# ERSETZUNGEN von scripts/nebenseiten.py.
#
# Warum eine zweite Liste: freigabe.html, objekt.html und unterlagen.html
# sind eigene Dateien mit eigenem Aufbau. Eine Regel, die nur dort greift,
# stuende in ERSETZUNGEN unter "Regeln ohne Treffer" — und eine Liste, in der
# die Haelfte der Eintraege planmaessig nicht trifft, taugt nicht mehr als
# Warnung.
#
# Alle Regeln hier drehen sich um dasselbe: diese Seiten liest der KUNDE DES
# MAKLERS. Was dort steht, muss aus den Stammdaten seines Mandanten kommen —
# nicht aus dem Quelltext und schon gar nicht vom Demo-Mandanten.
# ===========================================================================
# Der Briefkopf der Kundenseiten, als eigener Text statt als Einzeiler in
# der Regel. Er steht in freigabe.html, objekt.html und unterlagen.html an
# derselben Stelle und sieht dort gleich aus.
KOPF_SCRIPT = """<div class="kopf" id="kopf" style="display:none"><div class="n" id="kopfname"></div></div>
<script>
// Der Briefkopf kommt aus den Stammdaten DES MANDANTEN, nicht aus dem
// Quelltext: diese Seite bedient jeden Makler der Plattform. Die Vorlage
// hatte hier ihren eigenen Namen in Versalien stehen; die Neutralisierung
// hat daraus den des Demo-Mandanten gemacht, und der ist bei jedem anderen
// falsch - auf einer Seite, die der Kunde des Maklers liest.
// Bis die Daten da sind, bleibt das Band AUS. Ein leeres blaues Band waere
// schlechter als keines, und ein Beispielname waere falsch.
function kopfSetzen(f){
  var k=document.getElementById("kopf"),n=document.getElementById("kopfname");
  var t=(f&&(f.marken_name||f.firma_name))||"";
  if(n)n.textContent=t;
  if(k)k.style.display=t?"":"none";
  if(t&&document.title.indexOf(t)<0)document.title=document.title+" \u2013 "+t;
}
// Impressum, Datenschutz und AGB des Mandanten (fork_32). Was nicht
// hinterlegt ist, wird weggelassen - ein Pflichtlink, der ins Nichts
// fuehrt, ist schlechter als keiner.
function rechtLinks(f){
  var raus=[];
  [[f&&f.url_impressum,"Impressum"],[f&&f.url_datenschutz,"Datenschutz"],[f&&f.url_agb,"AGB"]]
    .forEach(function(p){ if(p[0]) raus.push('<a href="'+esc(p[0])+'">'+p[1]+'</a>'); });
  return raus.length?" \u00b7 "+raus.join(" \u00b7 "):"";
}
</script>"""

SEITEN_ERSETZUNGEN = [
    ('MARKE', r' \u2013 Musterhaus Immobilien GmbH</title>', '</title>',
     'Seitentitel der Kundenseiten. Der Firmenname wird jetzt aus den '
     'Stammdaten nachgetragen (kopfSetzen), statt im Quelltext zu stehen.'),
    ('FORK',
     r'<div class="kopf"><div class="n">[^<]*<span>&amp;</span>[^<]*</div>'
     r'<div class="u">IMMOBILIEN</div></div>',
     KOPF_SCRIPT,
     'Briefkopf der Kundenseiten: Firmenname aus dem Mandanten statt aus dem '
     'Quelltext. Das Band bleibt aus, solange kein Name da ist.'),
    ('FORK',
     r'function fussSetzen\(f,a\)\{\n  if\(!f\)return;',
     'function fussSetzen(f,a){\n  kopfSetzen(f);\n  if(!f)return;',
     'unterlagen.html: der Briefkopf wird mit dem Fuss gesetzt.'),
    ('FORK',
     r'  box\.innerHTML=h;\n  fuss\.innerHTML=esc\(firma\.firma_name\)',
     '  box.innerHTML=h;\n  kopfSetzen(firma);\n  fuss.innerHTML=esc(firma.firma_name)',
     'freigabe.html: der Briefkopf wird mit dem Fuss gesetzt.'),
    ('FORK',
     r'function fussZeile\(firma\)\{if\(!firma\)return;',
     'function fussZeile(firma){kopfSetzen(firma);if(!firma)return;',
     'objekt.html: der Briefkopf wird mit dem Fuss gesetzt.'),
    ('FORK',
     r"' \u00b7 <a href=\"https://immooffice\.example/impressum\">Impressum</a> \u00b7 <a href=\"https://immooffice\.example/datenschutz\">Datenschutz</a> \u00b7 <a href=\"https://immooffice\.example/agb\">AGB</a>'",
     'rechtLinks(firma)',
     'objekt.html: Impressum, Datenschutz und AGB aus den Stammdaten des '
     'Mandanten statt aus dem Quelltext (fork_32).'),
    # Drei Meldungen derselben Seite nennen eine Mailadresse, die niemandem
    # gehoert. Alle drei stehen in FEHLERPFADEN, also bevor die Stammdaten
    # geladen sind - dort gibt es keine Mandanten-Adresse und kann es keine
    # geben. Wie im Eigentuemerportal: wer die Meldung liest, kennt seinen
    # Makler.
    ('MARKE',
     r' Bitte wenden Sie sich an info@immooffice\.example \u2013 wir senden Ihnen gern einen neuen Link\.',
     ' Bitte wenden Sie sich an Ihren Ansprechpartner \u2013 wir senden Ihnen gern einen neuen Link.',
     'Objektseite: ungueltiger Link, ohne feste Mailadresse.'),
    # --- Dezenter Produkthinweis auf den Kundenseiten (06.10.2026) ------
    # Die Seiten tragen den Briefkopf des Mandanten. Dass die Software
    # darunter immoOffice.ai ist, steht in einer leisen Zeile unter der
    # Fusszeile — ohne Verweis: eine Adresse, die ins Nichts fuehrt, ist
    # schlechter als keine.
    ('FORK',
     re.escape('<div class="fuss" id="fuss"></div>'),
     '<div class="fuss" id="fuss"></div>\n'
     '<div class="fuss mitmarke">erstellt mit immoOffice.ai</div>',
     'Kundenseiten: leiser Produkthinweis unter der Fusszeile.'),
    ('FORK',
     re.escape('\n</style></head>'),
     '\n.mitmarke{margin-top:8px;font-size:10.5px;color:#9aa1ab;'
     'letter-spacing:.06em}\n</style></head>',
     'Kundenseiten: Stil fuer den Produkthinweis.'),
    ('MARKE',
     r'Gern informieren wir Sie \u00fcber vergleichbare Objekte: info@immooffice\.example',
     'Gern informieren wir Sie ueber vergleichbare Objekte \u2013 sprechen Sie '
     'Ihren Ansprechpartner an.',
     'Objektseite: Hinweis auf vergleichbare Objekte, ohne feste Adresse.'),
    ('MARKE',
     r'melden Sie sich gern: info@immooffice\.example',
     'melden Sie sich gern bei Ihrem Ansprechpartner',
     'Objektseite: Hinweis nach Widerruf, ohne feste Adresse.'),
    ('MARKE',
     r'Bitte wenden Sie sich an info@immooffice\.example',
     'Bitte wenden Sie sich an Ihren Ansprechpartner',
     'Objektseite: ungueltiger Link, ohne feste Mailadresse.'),
    ('MARKE',
     r'schreiben Sie uns an <a href="mailto:info@immooffice\.example">info@immooffice\.example</a>',
     'wenden Sie sich bitte an Ihren Ansprechpartner',
     'Freigabeseite: Expose auf Anfrage, ohne feste Mailadresse.'),
    ('MARKE',
     r'Klappt es weiterhin nicht, schreiben Sie uns an info@immooffice\.example\.',
     'Klappt es weiterhin nicht, wenden Sie sich bitte an Ihren Ansprechpartner.',
     'Freigabeseite: Verbindungsfehler, ohne feste Mailadresse.'),
    # --- sonnenverlauf.html -------------------------------------------------
    ('FORK',
     r"[ ]*'<div class=\"marke\">[^<]*<span>Immobilien</span></div>' \+\n",
     '',
     'sonnenverlauf.html: die Markenzeile entfaellt. Sie trug den Namen der '
     'Vorlage, nach der Neutralisierung den des Demo-Mandanten — auf einer '
     'Seite, die der Kunde des Maklers sieht. Ein Briefkopf aus den '
     'Stammdaten ginge hier nicht: die Seite laeuft als Rahmen im Expose und '
     'bekommt nur eine Adresse mitgegeben, keinen Mandanten. Also kein '
     'Briefkopf — "Sonnenverlauf 3D" darunter bleibt stehen und benennt die '
     'Seite ausreichend.'),
    ('MARKE', r'z\. B\. Am  26, 12345 Musterstadt',
     'z. B. Musterstrasse 26, 12345 Musterstadt',
     'sonnenverlauf.html: der Platzhalter der Adresssuche. Die Strassen-Regel '
     'hat den Namen der Referenz entfernt und "Am  26" stehen lassen — zwei '
     'Leerzeichen und eine Hausnummer ohne Strasse. Das liest der Kunde.'),

    # --- unterlagen.html: der anon-Schluessel gehoert nicht in die Seite ---
    # Die Vorlage schreibt ihn als JSON-Web-Token in den Quelltext. Er ist
    # kein Geheimnis, aber er ist auch nicht noetig: die Funktion laeuft ohne
    # JWT-Pruefung (supabase/config.toml), und freigabe.html ruft ihre
    # Funktion seit immer ohne apikey-Kopf auf. Ein Schluessel im Quelltext
    # bindet die Seite ausserdem an genau ein Projekt — und scripts/neutral.sh
    # verbietet ihn.
    ('FORK', r'\nconst ANON="[^"]*";', '',
     'unterlagen.html: der anon-Schluessel im Quelltext entfaellt.'),
    ('FORK',
     r'headers:\{"Content-Type":"application/json",apikey:ANON,'
     r'Authorization:"Bearer "\+ANON\}',
     'headers:{"Content-Type":"application/json"}',
     'unterlagen.html: Aufruf ohne apikey-Kopf, wie in freigabe.html.'),
]


# ===========================================================================
# WOERTLICH — Suchtext ist Suchtext, Ersatz ist Ersatz
#
# Warum eine zweite Liste neben ERSETZUNGEN: dort ist der Suchtext ein
# regulaerer Ausdruck. Das hat zweimal Schaden angerichtet — einmal hat eine
# Regel mitten in einem Wort getroffen, einmal stand ein \n im Ersatz und
# wurde als Rueckverweis gelesen. Beides kann hier nicht passieren:
# str.replace kennt keine Sonderzeichen.
#
# Angewendet NACH ERSETZUNGEN, also auf das Ergebnis der regulaeren Regeln.
# Die Notbremse gegen zu breite Regeln gilt genauso.
#
# Fast alles hier dreht sich um EINE Sache: den Firmennamen in einer Ausgabe.
# Die Vorlage hatte ihren eigenen verdrahtet, die Neutralisierung hat daraus
# den des Demo-Mandanten gemacht — und der ist bei jedem anderen Makler
# falsch. In Kalendereinladungen, PDF-Fusszeilen, Grussformeln unter Mails
# und Portaltexten, die seine Kunden lesen. Der Weg ist immoMarke(), und der
# liefert ohne Eintrag LEER, nie einen Beispielnamen.
# ===========================================================================
# Suchtexte, die selbst ein Kennzeichen enthalten, stehen kodiert da —
# genauso wie die Muster in scripts/neutral.sh und aus demselben Grund: ein
# Gate, das die Fundstelle im Klartext mitbringt, ist selbst eine Fundstelle.
def B64(s):
    import base64
    return base64.b64decode(s).decode('utf-8')


WOERTLICH = [

    # --- FORK fork_46: die Absicht geht in den Aufruf ---------------------
    ('FORK',
     '  const ca = async e => {\n'
     '    ia(e), Je(!0);',
     '  // fork_46: zweites Argument ist die gewaehlte Antwort-Absicht\n'
     '  // (Zusage, Absage, Termin …). Ohne Angabe bleibt es beim bisherigen\n'
     '  // Verhalten: offen antworten.\n'
     '  const ca = async (e, absicht) => {\n'
     '    ia(e), Je(!0);',
     'Der KI-Entwurf nimmt eine Antwort-Absicht entgegen.'),
    ('FORK',
     '        body: {\n'
     '          mail_eingang_id: e.id,\n'
     '          immobilie_id: e.immobilie_id || null\n'
     '        }\n'
     '      });',
     '        body: {\n'
     '          mail_eingang_id: e.id,\n'
     '          immobilie_id: e.immobilie_id || null,\n'
     '          absicht: absicht || "frei"\n'
     '        }\n'
     '      });',
     'Die Absicht wird an mail-ki-vorschlag mitgegeben.'),
    ('FORK',
     '    onClick: () => ca(v),\n'
     '    disabled: Ye,\n'
     '    title: "Öffnet die Antwort und lässt die KI direkt einen Entwurf in deinem Schreibstil schreiben",',
     '    // fork_46: erst fragen, was die Antwort erreichen soll — dann\n'
     '    // schreiben lassen. Ist die Auswahl nicht geladen, laeuft es wie\n'
     '    // vorher: ein Werkzeug, das wegen einer fehlenden Nebenabfrage\n'
     '    // gar nicht mehr arbeitet, ist schlimmer als eines ohne Auswahl.\n'
     '    onClick: () => window.ImmoAbsichtWaehlen\n'
     '      ? window.ImmoAbsichtWaehlen(a => ca(v, a))\n'
     '      : ca(v),\n'
     '    disabled: Ye,\n'
     '    title: "Fragt erst, was die Antwort erreichen soll — Zusage, Absage, Termin — und schreibt dann einen Entwurf in deinem Schreibstil",',
     'Vor dem KI-Entwurf wird die Antwort-Absicht gewaehlt.'),
    # --- Die Marke des Produkts ------------------------------------------
    # In der Vorlage standen hier vier Logos der Referenz als Base64; die
    # MARKE-Regel oben hat sie geleert, und seitdem gab Logo() eine
    # Wortmarke aus und ExposeKachelLogo ein <img src=""> — also ein
    # kaputtes Bild. Seit dem 06.10.2026 gibt es eigene Logos
    # (assets/marke/, aus der Lieferung des Auftraggebers, auf die
    # Plattform-CI umgefaerbt).
    #
    # Als Datei neben der Anwendung, nicht als Daten-URL im Skript: vier
    # Logos als Base64 waeren rund 90 KB in JEDER index.html, und eine
    # Datei kann der Browser zwischenspeichern. scripts/bauen.py legt sie
    # nach dist/marke/.
    ('FORK',
     'const LOGO_BLAU = "",\n'
     '  LOGO_DUNKEL = "",\n'
     '  LOGO_ECHT = "",\n'
     '  LOGO_HELL = "",',
     'const LOGO_BLAU = "/marke/immooffice-logo.svg",\n'
     '  LOGO_DUNKEL = "/marke/immooffice-logo-invers.svg",\n'
     '  LOGO_ECHT = "/marke/immooffice-logo.svg",\n'
     '  LOGO_HELL = "/marke/immooffice-logo-weiss.svg",',
     'Die eigenen Logos statt der geleerten Konstanten.'),
    ('FORK',
     'if ("undefined" != typeof document && !document.querySelector(`link[href="${fontLink}"]`)) {\n  const e = document.createElement("link");\n  e.rel = "stylesheet", e.href = fontLink, document.head.appendChild(e)\n}',
     'if ("undefined" != typeof document && !document.querySelector(`link[href="${fontLink}"]`)) {\n  const e = document.createElement("link");\n  e.rel = "stylesheet", e.href = fontLink, document.head.appendChild(e)\n}\n\n// FORK: die eigenen Teile des Forks (src/eigene/) stehen in einem eigenen\n// <script> und sehen die Konstanten dieses Skripts nicht. Statt die Farben\n// dort ein zweites Mal zu schreiben — und beim naechsten Branding zu\n// vergessen — werden sie hier einmal nach aussen gegeben.\nwindow.IMMO_CI = CI;\nwindow.IMMO_FONT_SERIF = FONT_SERIF;',
     'Farben und Schriftstapel der Anwendung fuer die eigenen Teile. '
     'Sonst stuenden sie zweimal im Haus.'),
    # --- Der Exposé-Editor als eigener Bereich (Etappe 3) -----------------
    # Die Ansicht selbst steht in src/eigene/expose-vorlagen.js und wird von
    # scripts/bauen.py eingesetzt; hier wird sie nur angemeldet. Drei
    # Stellen gehoeren dazu: die Ansichtentafel, die Kachel auf der
    # Startseite und das Recht, das beide gated.
    ('FORK',
     '      marketing: {\n'
     '        title: "Marketingmaterialien",\n'
     '        subtitle: "Bereich 01",\n'
     '        comp: React.createElement(MarketingPage, {\n'
     '          user: k\n'
     '        })\n'
     '      },',
     '      marketing: {\n'
     '        title: "Marketingmaterialien",\n'
     '        subtitle: "Bereich 01",\n'
     '        comp: React.createElement(MarketingPage, {\n'
     '          user: k\n'
     '        })\n'
     '      },\n'
     '      expose_vorlagen: {\n'
     '        title: "Exposé-Vorlagen",\n'
     '        subtitle: "Bereich 01 – Gestaltung der Exposés",\n'
     '        breit: !0,\n'
     '        comp: window.ImmoExposeVorlagen\n'
     '          ? React.createElement(window.ImmoExposeVorlagen, {\n'
     '              user: k\n'
     '            })\n'
     '          : React.createElement("div", null, "Der Vorlagen-Editor ist nicht geladen.")\n'
     '      },',
     'Die Ansicht "Exposé-Vorlagen" in der Ansichtentafel. Die Abfrage auf '
     'window.ImmoExposeVorlagen ist kein Zierrat: faellt der eigene Teil '
     'beim Bauen aus, soll der Bereich eine Meldung zeigen und nicht die '
     'ganze Anwendung mitnehmen.'),
    ('FORK',
     '    immoEinstellungenKachel = {\n'
     '      id: "einstellungen",',
     '    immoExposeVorlagenKachel = {\n'
     '      id: "expose_vorlagen",\n'
     '      title: "Exposé-Vorlagen",\n'
     '      subtitle: "Gestaltung der Exposés",\n'
     '      icon: ImageIcon,\n'
     '      num: "★"\n'
     '    },\n'
     '    immoEinstellungenKachel = {\n'
     '      id: "einstellungen",',
     'Die Kachel zum neuen Bereich. Sie steht neben der Einstellungskachel, '
     'weil beide Verwaltung sind und nicht Tagesgeschaeft.'),
    ('FORK',
     'hatRecht(e, "admin") && c.push(r), e && "chef" === e.role && c.push(immoEinstellungenKachel)',
     'hatRecht(e, "expose_vorlagen_bearbeiten") && c.push(immoExposeVorlagenKachel), '
     'hatRecht(e, "admin") && c.push(r), e && "chef" === e.role && c.push(immoEinstellungenKachel)',
     'Die Kachel erscheint nur mit dem Recht expose_vorlagen_bearbeiten — '
     'in der Voreinstellung also nur beim Chef, wie die SQL-Fassung in '
     'fork_37 es auch sieht.'),
    # --- fontkit fuer den Exposé-Editor (Etappe 3) ------------------------
    # pdf-lib kann eigene Schriften nur mit fontkit einbetten, und der
    # Editor zeichnet seine Vorschau mit demselben Renderer wie die Edge
    # Function — also mit denselben zwanzig Schnitten. Ohne fontkit bliebe
    # die Vorschau ohne Schrift.
    #
    # Fest gepinnt wie alle uebrigen: eine ungepinnte CDN-Fassung hat die
    # Vorlage am 17.06.2026 vollstaendig lahmgelegt.
    ('FORK',
     '<script src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>',
     '<script src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>\n'
     '<script src="https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"></script>',
     'fontkit fuer die Exposé-Vorschau im Browser.'),
    # --- Recht fuer die Expose-Vorlagen (fork_37) -------------------------
    ('FORK',
     '    id: "marketing",\n    label: "Marketing",\n    hinweis: "Logos & Vorlagen"\n  }, {',
     '    id: "marketing",\n    label: "Marketing",\n    hinweis: "Logos & Vorlagen"\n'
     '  }, {\n'
     '    id: "expose_vorlagen_bearbeiten",\n'
     '    label: "Exposé-Vorlagen",\n'
     '    hinweis: "Vorlagen gestalten — wirkt auf alle künftigen Exposés"\n'
     '  }, {',
     'Die Rechte-Matrix im Admin bietet das neue Recht an. Ohne den '
     'Eintrag gaebe es ein Recht, das niemand vergeben kann.'),
    # --- Kalendereinladungen (ICS) ---------------------------------------
    ('MARKE', '"PRODID:-//Musterhaus Immobilien GmbH//ImmoOffice//DE"',
     '"PRODID:-//ImmoOffice//DE"',
     'ICS-Kennung des erzeugenden Programms. Sie ist technisch, nicht '
     'fachlich — dort gehoert das Produkt hin, nicht der Mandant.'),
    ('MARKE', 'l.organizerName||"Musterhaus Immobilien GmbH"',
     'l.organizerName||immoMarke()',
     'ICS: der Einladende, wenn kein Name mitkommt.'),
    ('MARKE', 'o.organizerName || "Musterhaus Immobilien GmbH"',
     'o.organizerName || immoMarke()',
     'ICS der Termineinladung: derselbe Rueckfall.'),
    ('MARKE', '`${s} – Musterhaus Immobilien GmbH`',
     '`${s}${immoMarkeMit(" – ")}`',
     'ICS-Betreff im Kalender des Kunden (Adressbuch).'),
    ('MARKE', '`${o} – Musterhaus Immobilien GmbH`',
     '`${o}${immoMarkeMit(" – ")}`',
     'ICS-Betreff im Kalender des Kunden (Kontakt).'),
    ('MARKE', '`${i} – Musterhaus Immobilien GmbH`',
     '`${i}${immoMarkeMit(" – ")}`',
     'ICS-Betreff im Kalender des Kunden (Termin).'),
    ('MARKE',
     '(termin.titel || termin.art || "Termin") + " – Musterhaus Immobilien GmbH"',
     '(termin.titel || termin.art || "Termin") + immoMarkeMit(" – ")',
     'ICS-Betreff der Einladung aus dem Kalender.'),
    ('MARKE', '"Besichtigung Ihrer Immobilie – Musterhaus Immobilien GmbH"',
     '"Besichtigung Ihrer Immobilie" + immoMarkeMit(" – ")',
     'ICS-Betreff der Besichtigung beim Eigentuemer.'),
    ('MARKE',
     '"Mit freundlichen Grüßen", o.absender, "Musterhaus Immobilien GmbH",',
     '"Mit freundlichen Grüßen", o.absender, immoMarke(),',
     'Grussformel im Beschreibungstext der Einladung.'),

    # --- Grussformeln unter Mails ----------------------------------------
    ('MARKE', '\\nMusterhaus Immobilien GmbH`', '${immoMarkeMit("\\n")}`',
     'Grussformel unter Mails an Kunden und Eigentuemer.'),
    ('MARKE', '\\nMusterhaus Immobilien`', '${immoMarkeMit("\\n")}`',
     'Dieselbe Grussformel ohne Rechtsform (Rechnungsmails).'),
    ('MARKE', '${a||"Ihr Musterhaus Immobilien Team"}', '${a||immoMarke()}',
     'Terminmails: der Absender, wenn kein Name mitkommt.'),
    ('MARKE', '${r||"Ihr Musterhaus Immobilien Team"}', '${r||immoMarke()}',
     'Terminverschiebung: derselbe Rueckfall.'),
    ('MARKE', '${name || "Ihr Musterhaus Immobilien Team"}', '${name || immoMarke()}',
     'Besichtigungsmails an den Eigentuemer: derselbe Rueckfall.'),
    ('MARKE', 'makler && makler.name || "Ihr Musterhaus Immobilien Team"',
     'makler && makler.name || immoMarke()',
     'Platzhalter {{makler_name}} in den Mailvorlagen.'),
    ('MARKE', 'p.push("Musterhaus Immobilien"), {', 'p.push(immoMarke()), {',
     'Notarmail: die Grussformel.'),
    ('MARKE', '"{{absender_firma}}": "Musterhaus Immobilien GmbH",',
     '"{{absender_firma}}": immoMarke(),',
     'Der Platzhalter {{absender_firma}} selbst — er stand auf dem '
     'Demo-Mandanten, also setzte jede Vorlage dessen Namen ein.'),
    ('MARKE',
     'e.abwesend_betreff || "Abwesenheitsnotiz — Musterhaus Immobilien GmbH"',
     'e.abwesend_betreff || ("Abwesenheitsnotiz" + immoMarkeMit(" — "))',
     'Betreff der Abwesenheitsnotiz, die an jeden Absender zurueckgeht.'),
    ('MARKE', 'f.firma_name || "Musterhaus Immobilien GmbH"',
     'f.firma_name || immoMarke()',
     'Newsletter: Briefkopf und Fusszeile, wenn die Stammdaten fehlen.'),

    # --- PDF, Word, SVG ---------------------------------------------------
    ('MARKE', 'n.text("Musterhaus Immobilien GmbH · immooffice.example", l, o)',
     'n.text(immoMarkeMit("", " · immooffice.example"), l, o)',
     'Fusszeile des Uebergabeprotokolls.'),
    ('MARKE', 'n.text("Musterhaus Immobilien GmbH · immooffice.example", l, r - 9)',
     'n.text(immoMarkeMit("", " · immooffice.example"), l, r - 9)',
     'Fusszeile eines weiteren PDF.'),
    ('MARKE', 'a("Musterhaus Immobilien GmbH — Notar-Laufzettel")',
     'a(immoMarkeMit("", " — ") + "Notar-Laufzettel")',
     'Fusszeile des Notar-Laufzettels.'),
    ('MARKE', '  -  Musterhaus Immobilien GmbH`', '${immoMarkeMit("  -  ")}`',
     'Kopfzeile des Notar-Laufzettels.'),
    ('MARKE', '— Musterhaus Immobilien GmbH</w:t>', '${immoMarkeMit(" — ")}</w:t>',
     'Kopfzeile des Word-Dokuments zum Kaufvertrag.'),
    ('MARKE', 'text("Musterhaus Immobilien GmbH · Zins & Preis", rand, y)',
     'text(immoMarkeMit("", " · ") + "Zins & Preis", rand, y)',
     'Kopfzeile des Zins-und-Preis-PDF.'),
    ('MARKE', 'text("Musterhaus Immobilien GmbH · Musterstadt · Berlin", rand, H - 12)',
     'text(immoMarke(), rand, H - 12)',
     'Dessen Fusszeile — sie trug dazu zwei Standorte des Demo-Mandanten.'),
    ('MARKE', 'n("Musterhaus Immobilien GmbH · Energieberatung")',
     'n(immoMarkeMit("", " · ") + "Energieberatung")',
     'Kopfzeile des Energieausweis-PDF.'),
    ('MARKE', 'p = r.firma || "Musterhaus Immobilien GmbH",',
     'p = r.firma || immoMarke(),',
     'Briefkopf eines PDF, wenn die Stammdaten fehlen.'),
    ('MARKE', 'h = r.fusszeile || "Musterhaus Immobilien GmbH · Musterstadt · Berlin";',
     'h = r.fusszeile || immoMarke();',
     'Dessen Fusszeile, ebenfalls mit zwei Standorten.'),
    ('MARKE', '>Musterhaus Immobilien GmbH</text></svg>`',
     '>${immoMarke()}</text></svg>`',
     'Erzeugtes Vorschaubild: der Name stand als Text im SVG.'),

    # --- Eigentuemerportal und Meldungen ----------------------------------
    ('MARKE', '"Bitte wenden Sie sich an Musterhaus Immobilien."',
     '"Bitte wenden Sie sich an Ihren Ansprechpartner."',
     'Fehlermeldung im Eigentuemerportal. Der Firmenname half dort nicht — '
     'wer die Meldung liest, kennt seinen Makler.'),
    ('MARKE', 'e.absender_name || "Musterhaus Immobilien"',
     'e.absender_name || immoMarke()',
     'Neubauportal: der Absender einer Nachricht an den Kunden.'),
    ('MARKE', 'n.absender_name || "Musterhaus Immobilien"',
     'n.absender_name || immoMarke()',
     'Dieselbe Nachrichtenliste an anderer Stelle.'),
    ('MARKE', 'Wir bei Musterhaus Immobilien stellen Ihnen',
     'Wir stellen Ihnen',
     'Hilfetext im Eigentuemerportal.'),
    ('MARKE', 'Ansprechpartner bei Musterhaus Immobilien mit Telefon',
     'Ansprechpartner mit Telefon',
     'Zweiter Hilfetext im Eigentuemerportal.'),
    ('MARKE', 'Ansprechpartner bei Musterhaus Immobilien GmbH."',
     'Ansprechpartner."',
     'Hinweis, wenn das Konto keinem Eigentuemer zugeordnet ist.'),
    ('MARKE', '${d.vomMakler} von Musterhaus', '${d.vomMakler} vom Makler',
     'Zaehler der hochgeladenen Unterlagen im Eigentuemerportal.'),
    ('MARKE', '"Neues Dokument von Musterhaus Immobilien"',
     '"Neues Dokument von " + (immoMarke() || "Ihrem Makler")',
     'Titel einer Meldung an den Eigentuemer.'),
    ('MARKE', '"Musterhaus hat auf Ihre Anmerkungen geantwortet"',
     '(immoMarke() || "Ihr Makler") + " hat auf Ihre Anmerkungen geantwortet"',
     'Titel der zweiten Meldung an den Eigentuemer.'),
    ('MARKE', '"· Von Musterhaus hinterlegt"', '"· Vom Makler hinterlegt"',
     'Herkunftsvermerk an einer Datei im Eigentuemerportal.'),

    # --- Ein namentlich genannter Dritter ---------------------------------
    # „Joern Musterhaus" ist kein Firmenname, sondern eine PERSON: der
    # Energieberater, mit dem die Vorlage zusammenarbeitet. Die
    # Neutralisierung hat den Nachnamen ersetzt und den Vornamen stehen
    # gelassen. In einem mandantenfaehigen Produkt hat der Name des
    # Dienstleisters EINES Maklers in den Texten aller anderen nichts zu
    # suchen — und vier dieser Texte lesen Eigentuemer.
    ('MARKE', 'unser Energieberater Jörn Musterhaus erstellt daraus',
     'unser Energieberater erstellt daraus',
     'Energieausweis: der namentlich genannte Energieberater.'),
    ('MARKE', 'Unser Energieberater Jörn Musterhaus erstellt daraus',
     'Unser Energieberater erstellt daraus',
     'Derselbe Satz am Satzanfang.'),
    ('MARKE', 'unseren Energieberater Jörn Musterhaus weiter',
     'unseren Energieberater weiter',
     'Derselbe Name im Hinweis zum Weiterleiten.'),

    # --- Reste -------------------------------------------------------------
    ('MARKE', '}, "Musterhaus Immobilien GmbH")))), React.createElement("nav", {',
     '}, immoMarke())))), React.createElement("nav", {',
     'Firmenname in der Kopfzeile der Anwendung.'),
    ('MARKE', '}, "Musterhaus Immobilien GmbH"), React.createElement("h1",',
     '}, immoMarke()), React.createElement("h1",',
     'Firmenname ueber einer Ueberschrift.'),
    ('MARKE', '}, "Musterhaus Immobilien GmbH"), t.email &&',
     '}, immoMarke()), t.email &&',
     'Firmenname im Kontaktblock des Energieausweis-Formulars.'),
    ('MARKE', 'Texte für Exposes im Musterhaus-Stil',
     'Texte für Exposes im Stil des Hauses',
     'Beschreibung der Expose-Schmiede im Admin.'),
    # In der Anwendung ist der Sonnenverlauf eine Zeichenkette, also sind
    # ihre Anfuehrungszeichen und Zeilenumbrueche maskiert: \\' und \\n
    # stehen woertlich im Quelltext.
    ('MARKE',
     "\\'<div class=\"marke\">Musterhaus Immobilien <span>Immobilien</span></div>\\' +\\n      ",
     '',
     'Die Markenzeile im eingebetteten Sonnenverlauf. Dieselbe Stelle wie '
     'in src/seiten/sonnenverlauf.html, nur liegt sie hier als Zeichenkette '
     'in der Anwendung.'),

    # --- Die oeffentliche Bewerbertest-Seite ------------------------------
    ('FORK', 'd(e.katalog), m(e.kandidat), r("start")',
     'd(e.katalog), m(Object.assign({}, e.kandidat, { firma: e.firma })), r("start")',
     'Bewerbertest: der Firmenname aus der Antwort haengt am Kandidaten, '
     'damit immoBwFirma ihn findet.'),
    ('MARKE', '}, "Musterhaus Immobilien"), React.createElement("div", {',
     '}, immoBwFirma(u)), React.createElement("div", {',
     'Bewerbertest: der Briefkopf der Seite.'),
    ('MARKE', '}, "Musterhaus Immobilien GmbH ", React.createElement("span", {',
     '}, immoBwFirma(u) + " ", React.createElement("span", {',
     'Bewerbertest: der Firmenname in der Fusszeile.'),
    ('MARKE', '}, "\u25c6"), " Musterstadt \u00b7 Beispielstadt \u00b7 Berlin");',
     '}, ""), "");',
     'Bewerbertest: drei Standorte des Demo-Mandanten in derselben '
     'Fusszeile. Ohne Namen daneben hat auch das Trennzeichen keinen Sinn.'),
    ('MARKE',
     '" \u2014 sch\u00f6n, dass Sie sich f\u00fcr Musterhaus Immobilien interessieren.',
     '" \u2014 sch\u00f6n, dass Sie sich f\u00fcr ", (immoBwFirma(u) || "uns"), " interessieren.',
     'Bewerbertest: die Begruessung des Kandidaten.'),

    # --- Logos: der Alternativtext ist Ausgabe ---------------------------
    # Er steht im Vorlesewerkzeug, er steht da, wenn das Bild nicht laedt,
    # und er landet in Exporten.
    ('MARKE', 'alt: "Musterhaus Immobilien GmbH",', 'alt: immoMarke(),',
     'Alternativtext der Logos.'),

    # --- Die Vorgabe eines Feldes, das auf Visitenkarten gedruckt wird ---
    # PRINT_FELDER steht auf Modulebene, also VOR dem Anmelden. Ein Aufruf
    # von immoMarke() waere dort immer leer. Ein Getter wird erst beim Lesen
    # ausgewertet — und gelesen wird nach dem Anmelden.
    ('MARKE', 'value: "Musterhaus Immobilien GmbH"',
     'get value() { return immoMarke(); }',
     'Vorgabewert des Feldes "Firma (statisch)" in den Druckvorlagen.'),

    # --- Die eigene Projektadresse gehoert in die Konfiguration -----------
    # Drei Stellen bauen die Adresse selbst zusammen, statt
    # window.IMMO_SUPABASE_URL zu nehmen, das huelle/01-kopf.html setzt. Die
    # Neutralisierung hat sie auf das eigene Projekt gezogen, also faellt es
    # keinem Gate auf — aber derselbe Quellstand liesse sich damit nicht
    # gegen ein zweites Projekt ausliefern.
    ('FREMD', '"https://usguiggfciavwzkdfjgt.supabase.co/functions/v1"',
     '(window.IMMO_SUPABASE_URL + "/functions/v1")',
     'Bewerbertest-Seite: Funktionsadresse aus der Konfiguration.'),
    ('FREMD',
     '"https://usguiggfciavwzkdfjgt.supabase.co/storage/v1/object/public/web-assets/logo-weiss.png"',
     '(window.IMMO_SUPABASE_URL + "/storage/v1/object/public/web-assets/logo-weiss.png")',
     'Newsletter-Logo: Adresse aus der Konfiguration.'),
    ('FREMD', '"https://usguiggfciavwzkdfjgt.supabase.co"',
     'window.IMMO_SUPABASE_URL',
     'Transfer-Werkzeug: Projektadresse aus der Konfiguration.'),

    # --- Huelle und Startskripte -----------------------------------------
    # Hier stand der Name nicht in einer Komponente, sondern in der
    # Verpackung: im Seitentitel des Browserfensters, im Ladebildschirm, in
    # zwei eingebetteten Ersatzseiten und in zwei Protokollzeilen.
    ('MARKE', '<title>ImmoOffice – Musterhaus Immobilien GmbH</title>',
     '<title>ImmoOffice</title>',
     'Seitentitel des Browserfensters. Den Namen des Mandanten traegt jetzt '
     'immoCiAnwenden nach, sobald er bekannt ist.'),
    ('MARKE', '<div class="text">Lade Musterhaus Immobilien Portal</div>',
     '<div class="text">Lade ImmoOffice</div>',
     'Ladebildschirm, bevor irgendetwas geladen ist — zu diesem Zeitpunkt '
     'kann niemand wissen, welcher Mandant kommt.'),
    ('MARKE', 'Expos\\u00e9-Freigabe \\u2013 Musterhaus Immobilien GmbH',
     'Expos\\u00e9-Freigabe',
     'Titel der eingebetteten Ersatzseite fuer die Expose-Freigabe.'),
    ('MARKE', '360\\u00b0-Rundgang \\u2013 Musterhaus Immobilien GmbH',
     '360\\u00b0-Rundgang',
     'Titel der eingebetteten Rundgang-Seite.'),
    ('MARKE',
     '      <div class=\\"n\\">Musterhaus Immobilien <span>Immobilien</span></div>\\n',
     '',
     'Briefkopf der eingebetteten Rundgang-Seite. Sie ist oeffentlich und '
     'bekommt nur eine Rundgang-Kennung mitgegeben, keinen Mandanten — ein '
     'Briefkopf aus den Stammdaten geht hier nicht, also keiner.'),
    ('MARKE', '\\" \\u2013 360\\u00b0-Rundgang | Musterhaus Immobilien GmbH\\"',
     '\\" \\u2013 360\\u00b0-Rundgang\\"',
     'Dessen Fenstertitel.'),
    ("MARKE", "'[Musterhaus] pdf.js geladen", "'[ImmoOffice] pdf.js geladen",
     'Protokollzeile in der Browserkonsole.'),
    ("MARKE", "'[Musterhaus] pdf.js nicht", "'[ImmoOffice] pdf.js nicht",
     'Dieselbe Zeile im Fehlerfall.'),
    ('FORK',
     'window.IMMO_MARKE = (stamm && (stamm.marken_name || stamm.firma_name)) || null;',
     'window.IMMO_MARKE = (stamm && (stamm.marken_name || stamm.firma_name)) || null;\n'
     '  // Die Kontaktfelder des Mandanten. Sie ersetzen verdrahtete\n'
     '  // Anschriften und Telefonnummern; immoFirma(feld) liest sie.\n'
     '  window.IMMO_FIRMA = stamm ? {\n'
     '    strasse: stamm.strasse || "", plz: stamm.plz || "", ort: stamm.ort || "",\n'
     '    telefon: stamm.telefon || "", email: stamm.email || "", web: stamm.web || "",\n'
     '  } : null;\n'
     '  // Der Fenstertitel traegt den Mandanten nach, sobald er bekannt ist.\n'
     '  // Vorher steht dort nur "ImmoOffice" — der Titel entsteht, bevor\n'
     '  // irgendetwas geladen ist.\n'
     '  if (typeof document !== "undefined") {\n'
     '    document.title = "ImmoOffice" + (window.IMMO_MARKE ? " – " + window.IMMO_MARKE : "");\n'
     '  }',
     'Fenstertitel mit dem Namen des Mandanten, nach dem Anmelden.'),

    # =====================================================================
    # Verdrahtete Kontaktdaten (03.10.2026)
    #
    # Die Suchtexte stehen hier NICHT im Klartext: sie enthalten eine echte
    # Anschrift und echte Telefonnummern. Sie werden aus dem Ergebnis der
    # vorigen Regeln gelesen — base64, wie scripts/neutral.sh es mit seinen
    # Mustern tut: nichts lesbar im Repository, und die Regel greift
    # trotzdem.
    #
    # Was sie waren: die Platzhalter {{absender_strasse}},
    # {{absender_plz_ort}} und {{absender_telefon}} der Vertragsvorlagen —
    # also Werte, die in Dokumenten landen, die der Eigentuemer bekommt.
    # Dazu eine Karte mit Telefon und Mail dreier Standorte, die die
    # Widerrufsbelehrung nach § 356 BGB fuellen sollte.
    # =====================================================================
    ('MARKE', B64('Int7YWJzZW5kZXJfc3RyYXNzZX19IjogIkRvYmVyYW5lciBTdHJhc3NlIDE2Ig=='),
     '"{{absender_strasse}}": immoFirma("strasse")',
     'Absenderanschrift der Vertragsvorlagen: Strasse aus den Stammdaten.'),
    ('MARKE', B64('Int7YWJzZW5kZXJfcGx6X29ydH19IjogIjEyMzQ1IE11c3RlcnN0YWR0Ig=='),
     '"{{absender_plz_ort}}": [immoFirma("plz"), immoFirma("ort")].filter(Boolean).join(" ")',
     'Dieselbe Anschrift: Postleitzahl und Ort aus den Stammdaten.'),
    ('MARKE', B64('Int7YWJzZW5kZXJfdGVsZWZvbn19IjogIjAzODEgLyA2NjYgMzggMzgi'),
     '"{{absender_telefon}}": immoFirma("telefon")',
     'Dieselbe Anschrift: Telefonnummer aus den Stammdaten. Sie war eine '
     'echte Nummer und stand in keinem Muster des Neutralitaets-Gates.'),
    ('MARKE', B64('cGxhY2Vob2xkZXI6ICJ6LiBCLiAwMzgxIDEyMzQ1NiI='),
     'placeholder: "Telefonnummer"',
     'Platzhalter eines Telefonfeldes. Er stand auf einer echten Nummer — '
     'ein Platzhalter braucht kein Beispiel, das jemandem gehoert.'),
    ('MARKE', B64('Y29uc3QgV0lERVJSVUZfMzU2X0tPTlRBS1Q9e211c3RlcnN0YWR0Ont0ZWxlZm9uOiIwMzgxIC8gMzY3Nzk5ODgiLGVtYWlsOiJpbmZvQGltbW9vZmZpY2UuZXhhbXBsZSJ9LGJlaXNwaWVsc3RhZHQ6e3RlbGVmb246IjAzODEgLyAzNjc3OTk4OCIsZW1haWw6ImJlaXNwaWVsc3RhZHRAaW1tb29mZmljZS5leGFtcGxlIn0sYmVybGluOnt0ZWxlZm9uOiIwMzAgNzUgNDMgNTYgNzEiLGVtYWlsOiJiZXJsaW5AaW1tb29mZmljZS5leGFtcGxlIn19Ow=='),
     '',
     'Die Karte WIDERRUF_356_KONTAKT: Telefon und Mail dreier Standorte, '
     'verdrahtet. Ihr eigener Kommentar sagt, woher die Werte kommen '
     'sollten — "je Standort (firma_stammdaten)". Sie entfaellt; die '
     'Funktion darunter bekommt den Kontakt uebergeben.'),
    ('MARKE', B64('ZnVuY3Rpb24gd2lkZXJydWZLb250YWt0U2V0emVuKHhtbCxzdGFuZG9ydCl7Y29uc3Qgaz1XSURFUlJVRl8zNTZfS09OVEFLVFtzdGFuZG9ydHx8Im11c3RlcnN0YWR0Il18fFdJREVSUlVGXzM1Nl9LT05UQUtULm11c3RlcnN0YWR0O3JldHVybiB4bWwuc3BsaXQoIjAzODEgLyAzNjc3OTk4OCIpLmpvaW4oZXNjYXBlWG1sKGsudGVsZWZvbikpLnNwbGl0KCJpbmZvQGltbW9vZmZpY2UuZXhhbXBsZSIpLmpvaW4oZXNjYXBlWG1sKGsuZW1haWwpKX0K'),
     'function widerrufKontaktSetzen(xml, kontakt) {\n'
     '  // Telefon und Mail der Widerrufsbelehrung nach § 356 BGB. Sie\n'
     '  // kommen vom Aufrufer aus firma_stammdaten DES STANDORTS — vorher\n'
     '  // stand hier eine Karte mit drei verdrahteten Nummern.\n'
     '  // Ohne Angabe bleibt der Platzhalter stehen: eine Belehrung mit\n'
     '  // fremder Telefonnummer ist schlechter als eine mit sichtbarer\n'
     '  // Luecke.\n'
     '  const tel = (kontakt && kontakt.telefon) || "";\n'
     '  const mail = (kontakt && kontakt.email) || "";\n'
     '  let raus = xml;\n'
     '  if (tel) raus = raus.split("{{widerruf_telefon}}").join(escapeXml(tel));\n'
     '  if (mail) raus = raus.split("{{widerruf_email}}").join(escapeXml(mail));\n'
     '  return raus;\n'
     '}\n',
     'widerrufKontaktSetzen nimmt den Kontakt entgegen, statt ihn zu kennen. '
     'Die Funktion wird in der Vorlage nirgends aufgerufen — sie bleibt '
     'trotzdem stehen (Phase 9: nichts entfernen), nur ohne eigene Daten.'),
    ('MARKE', B64('dW5zZXIgQsO8cm8gdW50ZXIgMDM4MSDigKY='),
     'unser B\u00fcro unter {telefon}',
     'Platzhaltertext der Abwesenheitsnotiz. Auch hier eine echte Nummer, '
     'und zwar dieselbe, die die Regel oben schon als {telefon} ersetzt — '
     'nur mit anderen Trennzeichen geschrieben, weshalb sie durchfiel. Die '
     'Vorlage setzt {telefon} beim Speichern ein.'),

    # --- Ein Recht an einer einzelnen Mailadresse ------------------------
    # hatRecht() liess "posteingang" bei leeren Rechten fuer GENAU EINE
    # Adresse durch — die eines Mitarbeiters der Referenz. Im Fork gehoert
    # sie niemandem, die Ausnahme greift also nie; sie steht nur noch als
    # fremde Mailadresse im Quelltext.
    #
    # fork_11 hat die Regel serverseitig schon ohne diese Ausnahme gebaut
    # und im Kommentar festgehalten, sie sei "Zeile fuer Zeile dieselbe
    # Regel wie hatRecht() in der Oberflaeche". Das war ab heute erst wahr:
    # vorher war die Oberflaeche weiter als die Datenbank. Beide sagen jetzt
    # dasselbe — und die Datenbank bleibt die, die es erzwingt.
    ('MARKE',
     '("posteingang" !== t || "ag@immooffice.example" === (e.email || "").toLowerCase())',
     '"posteingang" !== t',
     'hatRecht(): die Ausnahme fuer eine feste Mailadresse entfaellt, '
     'Oberflaeche und hat_recht() in der Datenbank sagen dasselbe.'),

    # =====================================================================
    # Die oeffentliche Rundgang-Seite zeigte ihre Platzhalter (04.10.2026)
    #
    # Im Fuss stehen Telefon, Mailadresse, Impressum und Datenschutz. Alle
    # vier standen im Quelltext. Die Neutralisierung hat die Rufnummer gegen
    # die Marke "{telefon}" getauscht — in der Annahme, irgendwer ersetze
    # sie. Tut aber niemand: die Seite wird als Zeichenkette geparst und
    # unveraendert eingesetzt. Dem Kunden stand woertlich "{telefon}" als
    # Rufnummer da, daneben eine Mailadresse, die niemandem gehoert.
    #
    # Die Daten koennen nur aus der Antwort von rundgang-oeffentlich kommen:
    # die Seite kennt weder Konto noch Objektkennung, nur den Token. Die
    # Funktion liefert sie seit heute mit (firma.*). Was fehlt, wird
    # ausgeblendet — eine fehlende Rufnummer faellt auf, eine fremde nicht.
    # =====================================================================
    ('MARKE',
     '<a class=\\"knopf\\" href=\\"tel:{telefon}\\">\\u260e {telefon}</a>',
     '<a class=\\"knopf\\" id=\\"knopfTelefon\\" href=\\"#\\" hidden></a>',
     'Rundgang-Seite: der Telefonknopf wird aus den Daten gefuellt.'),
    ('MARKE',
     '<a href=\\"tel:{telefon}\\">{telefon}</a> oder\\n          <a href=\\"mailto:info@immooffice.example\\">info@immooffice.example</a>.',
     '<span id=\\"meldungKontakt\\"></span>',
     'Rundgang-Seite: der Kontakt in der Fehlermeldung ebenso.'),
    ('MARKE',
     '<a class=\\"recht\\" href=\\"https://immooffice.example/impressum\\" target=\\"_blank\\" rel=\\"noopener\\">Impressum</a> \\u00b7\\n      <a class=\\"recht\\" href=\\"https://immooffice.example/datenschutz\\" target=\\"_blank\\" rel=\\"noopener\\">Datenschutz</a>',
     '<span id=\\"rechtLinks\\"></span>',
     'Rundgang-Seite: Impressum und Datenschutz aus den Stammdaten.'),
    ('MARKE',
     'el(\\"knopfAnfrage\\").href = \\"mailto:info@immooffice.example?subject=\\" +',
     'el(\\"knopfAnfrage\\").href = \\"mailto:\\" + ((daten.firma && daten.firma.email) || \\"\\") + \\"?subject=\\" +',
     'Rundgang-Seite: die Besichtigungsanfrage geht an den Makler.'),
    ('FORK',
     '        anfrageVorbereiten();\\n',
     '        kontaktVorbereiten();\\n        anfrageVorbereiten();\\n',
     'Rundgang-Seite: den Fuss fuellen, sobald die Daten da sind.'),
    ('FORK',
     '  /* ---------- Anfrage-Mailto ---------- */\\n',
     '  /* ---------- Kontakt und Rechtstexte aus den Stammdaten ---------- */\\n'
     '  function kontaktVorbereiten() {\\n'
     '    var f = (daten && daten.firma) || {};\\n'
     '    var tel = el(\\"knopfTelefon\\");\\n'
     '    if (tel) {\\n'
     '      if (f.telefon) { tel.href = \\"tel:\\" + f.telefon; tel.textContent = \\"\\u260e \\" + f.telefon; tel.hidden = false; }\\n'
     '      else { tel.hidden = true; }\\n'
     '    }\\n'
     '    var mk = el(\\"meldungKontakt\\");\\n'
     '    if (mk) {\\n'
     '      mk.textContent = \\"\\";\\n'
     '      if (f.telefon) mk.appendChild(document.createTextNode(f.telefon));\\n'
     '      if (f.telefon && f.email) mk.appendChild(document.createTextNode(\\" oder \\"));\\n'
     '      if (f.email) {\\n'
     '        var a = document.createElement(\\"a\\");\\n'
     '        a.href = \\"mailto:\\" + f.email; a.textContent = f.email;\\n'
     '        mk.appendChild(a);\\n'
     '      }\\n'
     '      if (f.telefon || f.email) mk.appendChild(document.createTextNode(\\".\\"));\\n'
     '    }\\n'
     '    var rl = el(\\"rechtLinks\\");\\n'
     '    if (rl) {\\n'
     '      rl.textContent = \\"\\";\\n'
     '      [[f.impressum, \\"Impressum\\"], [f.datenschutz, \\"Datenschutz\\"]].forEach(function (p, i) {\\n'
     '        if (!p[0]) return;\\n'
     '        if (rl.childNodes.length) rl.appendChild(document.createTextNode(\\" \\u00b7 \\"));\\n'
     '        var a = document.createElement(\\"a\\");\\n'
     '        a.className = \\"recht\\"; a.href = p[0]; a.target = \\"_blank\\";\\n'
     '        a.rel = \\"noopener\\"; a.textContent = p[1];\\n'
     '        rl.appendChild(a);\\n'
     '      });\\n'
     '    }\\n'
     '  }\\n\\n'
     '  /* ---------- Anfrage-Mailto ---------- */\\n',
     'Rundgang-Seite: der Helfer, der Fuss und Fehlermeldung fuellt.'),

    # --- Die Ersatzseiten nennen eine Adresse, die niemandem gehoert -----
    # Vier Texte der eingebetteten Expose-Ersatzseite. Alle vier stehen in
    # FEHLERPFADEN, also bevor irgendwelche Daten geladen sind — eine
    # Mandanten-Mailadresse gibt es dort nicht und kann es nicht geben.
    # Dieselbe Entscheidung wie im Eigentuemerportal: wer die Meldung liest,
    # kennt seinen Makler. Die Adresse half ihm nicht, sie war nur falsch.
    ('MARKE',
     'Wir senden Ihnen das Expos\\u00e9 gern pers\\u00f6nlich zu \\u2013 schreiben Sie uns an <a href=\\"mailto:info@immooffice.example\\">info@immooffice.example<\\/a>.',
     'Wir senden Ihnen das Expos\\u00e9 gern pers\\u00f6nlich zu \\u2013 bitte wenden Sie sich an Ihren Ansprechpartner.',
     'Ersatzseite: Expose auf Anfrage, ohne feste Mailadresse.'),
    ('MARKE',
     ' Bitte wenden Sie sich an info@immooffice.example \\u2013 wir senden Ihnen gern einen neuen Link.',
     ' Bitte wenden Sie sich an Ihren Ansprechpartner \\u2013 wir senden Ihnen gern einen neuen Link.',
     'Ersatzseite: ungueltiger Link, ohne feste Mailadresse.'),
    ('MARKE',
     'Klappt es weiterhin nicht, schreiben Sie uns an info@immooffice.example.',
     'Klappt es weiterhin nicht, wenden Sie sich bitte an Ihren Ansprechpartner.',
     'Ersatzseite: Verbindungsfehler, ohne feste Mailadresse.'),
    ('MARKE',
     '<p>Bitte wenden Sie sich an <a style="color:#D4A567" href="mailto:info@immooffice.example">info@immooffice.example</a>.</p>',
     '<p>Bitte wenden Sie sich an Ihren Ansprechpartner.</p>',
     'Rundgang-Ersatzseite: dieselbe Meldung.'),

    # --- Der Newsletter-Fuss: Impressum und Datenschutz (fork_32) --------
    # Beide Links standen im Quelltext. Der Newsletter geht an Empfaenger,
    # die ihn bestellt haben; ein Impressumslink, der ins Nichts fuehrt, ist
    # dort nicht nur haesslich. f ist die Stammdatenzeile des Mandanten.
    ('MARKE',
     '<a href="https://immooffice.example/impressum" style="color:#6b7280">Impressum</a> · <a href="https://immooffice.example/datenschutz" style="color:#6b7280">Datenschutz</a>',
     '${[f.url_impressum && `<a href="${nlEsc(f.url_impressum)}" style="color:#6b7280">Impressum</a>`, f.url_datenschutz && `<a href="${nlEsc(f.url_datenschutz)}" style="color:#6b7280">Datenschutz</a>`].filter(Boolean).join(" · ")}',
     'Newsletter-Fuss: Impressum und Datenschutz aus den Stammdaten; was '
     'fehlt, wird weggelassen.'),

    # --- Die drei Rechtsadressen gehoeren ins Formular (fork_32) ---------
    # Sie standen seit fork_32 in der Datenbank und waren nicht pflegbar:
    # vorhanden und unbenutzbar. Der Platz ist der richtige — dieselbe
    # Maske fuehrt schon Berufsaufsichtsbehoerde, Kammer und
    # Rechtshinweis, also genau die uebrigen Pflichtangaben.
    ('FORK', '}, "Kammer"), React.createElement("input", {\n    style: d,\n    value: e.kammer || "",\n    onChange: t => c(e.id, "kammer", t.target.value),\n    placeholder: "z. B. IHK zu Musterstadt"\n  })), ', '}, "Kammer"), React.createElement("input", {\n    style: d,\n    value: e.kammer || "",\n    onChange: t => c(e.id, "kammer", t.target.value),\n    placeholder: "z. B. IHK zu Musterstadt"\n  })), React.createElement("div", null, React.createElement("label", {\n    style: u\n  }, "Impressum (vollstaendige Adresse)"), React.createElement("input", {\n    style: d,\n    value: e.url_impressum || "",\n    onChange: t => c(e.id, "url_impressum", t.target.value),\n    placeholder: "https://..."\n  })), React.createElement("div", null, React.createElement("label", {\n    style: u\n  }, "Datenschutzhinweise (vollstaendige Adresse)"), React.createElement("input", {\n    style: d,\n    value: e.url_datenschutz || "",\n    onChange: t => c(e.id, "url_datenschutz", t.target.value),\n    placeholder: "https://..."\n  })), React.createElement("div", null, React.createElement("label", {\n    style: u\n  }, "AGB (vollstaendige Adresse)"), React.createElement("input", {\n    style: d,\n    value: e.url_agb || "",\n    onChange: t => c(e.id, "url_agb", t.target.value),\n    placeholder: "https://..."\n  })), ',
     'Admin, Firmenstammdaten: Eingabefelder fuer Impressum, '
     'Datenschutzhinweise und AGB.'),
    ('FORK',
     '        web: e.web,\n        fax: e.fax,',
     '        web: e.web,\n'
     '        url_impressum: e.url_impressum || null,\n'
     '        url_datenschutz: e.url_datenschutz || null,\n'
     '        url_agb: e.url_agb || null,\n'
     '        fax: e.fax,',
     'Admin, Firmenstammdaten: die drei Adressen werden mitgespeichert.'),

    # --- Der Datenschutzhinweis der Signaturseite (fork_32) --------------
    # Er endete auf eine verdrahtete Adresse. signatur-token-validieren
    # liefert sie seit heute mit; fehlt sie, entfaellt der Verweis. Ein
    # Hinweis auf eine tote Adresse ist schlechter als keiner.
    ('MARKE',
     ' Weitere Informationen: immooffice.example/datenschutz`',
     '${(i && i.firma && i.firma.datenschutz) ? " Weitere Informationen: " + i.firma.datenschutz : ""}`',
     'Signaturseite: der Datenschutzhinweis verweist auf die Hinweise des '
     'Mandanten — oder auf nichts.'),

    # --- Die KI braucht die Kontaktdaten des Mandanten -------------------
    # generate-text hatte Mailadresse und Rufnummer im Quelltext und wies
    # die KI an, genau diese in Werbetexte zu schreiben. Die Funktion hat
    # keinen Datenbankzugang; sie bekommt die Daten jetzt im Anfragekoerper.
    # Hier ist die Stelle, die sie kennt — immoFirma(feld) seit dem 03.10.
    # Nur dieser Aufruf erzeugt die Texte mit Kontaktzeile; die uebrigen
    # vier holen Kernpunkte zu Nachrichten und brauchen keine.
    ('FORK',
     'invoke("generate-text", {\n            body: {\n              textart: l,',
     'invoke("generate-text", {\n            body: {\n              textart: l,\n'
     '              kontakt: { email: immoFirma("email"), telefon: immoFirma("telefon") },',
     'Textwerkstatt: die Kontaktdaten des Mandanten gehen an generate-text.'),
    # --- Recht fuer die Expose-Vorlagen (fork_37) -------------------------
    # Diese Regel steht ABSICHTLICH am Ende: sie setzt auf dem Ergebnis
    # einer frueheren Regel auf. Die Vorlage schreibt dort
    # `("posteingang"!==t||"…@…"===…)` — eine Ausnahme fuer eine feste
    # Mailadresse der Referenz. Erst nachdem die entfernt ist, steht da
    # `"posteingang" !== t`, worauf diese Regel trifft.
    ('FORK',
     '"finanzen" !== t && "admin" !== t && "rechnungen" !== t && "posteingang" !== t',
     '"finanzen" !== t && "admin" !== t && "rechnungen" !== t && "posteingang" !== t'
     ' && "expose_vorlagen_bearbeiten" !== t',
     'hatRecht: das neue Recht gehoert in die Sperrliste. Ein Mitarbeiter '
     'ohne ausdrueckliche Rechte bekommt sonst alles, was nicht gesperrt '
     'ist — und wer die Hausvorlage aendert, aendert sie fuer jedes '
     'kuenftige Expose des Hauses. Die SQL-Fassung in fork_37 fuehrt '
     'dieselbe Liste; tests/rechte.sql haelt beide zusammen.'),

    # --- Versandfehler lesbar machen (06.10.2026) ------------------------
    # supabase-js wirft bei einer Antwort ausserhalb 2xx einen Fehler, dessen
    # message nur "Edge Function returned a non-2xx status code" lautet. Der
    # Satz, den die Funktion geschrieben hat, steht im Rumpf. Beim Expose
    # liest die Oberflaeche ihn schon so; beim Mailversand jetzt auch.
    ('FORK',
     '      } catch (e) {\n        alert("Fehler beim Versenden: " + (e.message || e))\n      }\n      N(!1)',
     '      } catch (e) {\n        // Den Grund aus der Antwort holen: "non-2xx status code" sagt dem\n        // Makler nichts, der Satz darunter schon.\n        let m = (e && e.message) || String(e);\n        try { const b = await e.context.json(); b && b.error && (m = b.error) } catch (f) {}\n        alert("Fehler beim Versenden: " + m)\n      }\n      N(!1)',
     'Posteingang: beim Versandfehler den Grund aus der Antwort zeigen.'),
    ('FORK',
     '          } catch (e) {\n            alert("Fehler beim Versenden: " + (e.message || e))\n          }\n          T(!1)',
     '          } catch (e) {\n            let m = (e && e.message) || String(e);\n            try { const b = await e.context.json(); b && b.error && (m = b.error) } catch (f) {}\n            alert("Fehler beim Versenden: " + m)\n          }\n          T(!1)',
     'Kontakt-Mail: derselbe Grund aus der Antwort.'),

    # --- Postfaecher verbinden: Microsoft, Google (06.10.2026) ------------
    # Mehrere Postfaecher konnte die Vorlage schon; was fehlte, war die
    # Anmeldung ohne Passwort. Die Knoepfe stehen in
    # src/eigene/postfach-anbieter.js, das Formular der Vorlage bleibt
    # darunter fuer jedes andere Postfach.
    ('FORK',
     '  }, "📧 E-Mail-Postfächer"), l && React.createElement("div", {',
     '  }, "📧 E-Mail-Postfächer"),\n  // Microsoft und Google verbinden sich ueber OAuth, nicht mit Passwort\n  // (fork_44). Die Ansicht dazu steht in src/eigene/postfach-anbieter.js;\n  // das Formular fuer jedes andere Postfach bleibt darunter.\n  window.ImmoPostfachAnbieter && React.createElement(window.ImmoPostfachAnbieter, {\n    user: e\n  }), l && React.createElement("div", {',
     'Postfaecher: Microsoft und Google verbinden sich ueber OAuth (fork_44).'),

    # --- Vorlagenwahl, Logo freistellen, Produkthinweis (06.10.2026) ------
    # Drei Aenderungen aus derselben Ansage des Betreibers. Sie stehen hier
    # als Regel und nicht von Hand in src/: dieses Skript schreibt
    # src/app/anwendung.js bei jedem Lauf neu, und was nicht als Regel
    # angemeldet ist, waere beim naechsten Abgleich mit der Vorlage weg.
    ('FORK',
     '    let n = !1;\n    "pdf" === e && (n = confirm("Ist dieses Exposé FINAL',
     '    // Die gewaehlte Vorlage. Ohne Wahl wird kein Expose erzeugt: eine\n    // stille Standardvorlage hat am 06.10.2026 Exposes im falschen Design\n    // erzeugt, ohne dass es jemand sehen konnte.\n    const exposeVorlageId = window.ImmoExposeVorlagenwahl\n      ? window.ImmoExposeVorlagenwahl.gewaehlt(t.id) : null;\n    if ("pdf" === e && !exposeVorlageId) return void Me({\n      typ: "fehler",\n      text: "Bitte oben die Exposé-Vorlage wählen — es gibt keine stille Standardvorlage mehr."\n    });\n    let n = !1;\n    "pdf" === e && (n = confirm("Ist dieses Exposé FINAL',
     'Expose erzeugen: ohne gewaehlte Vorlage wird keines erzeugt. Die Vorlagenwahl steht in src/eigene/expose-vorlagenwahl.js.'),
    ('FORK',
     '        body: {\n          immobilie_id: t.id,\n          modus: e\n        }',
     '        body: {\n          immobilie_id: t.id,\n          modus: e,\n          vorlage_id: exposeVorlageId || null\n        }',
     'Die gewaehlte Vorlage geht an expose-pdf-erzeugen mit.'),
    ('FORK',
     '}, "pdf" === Te ? "Exposé wird erstellt… (kann bis zu 1 Minute dauern)" : "📄 Exposé-PDF erstellen")), React.createElement("div", {\n      style: {\n        fontSize: 12,\n        color: CI.muted,\n        marginBottom: 10\n      }\n    }, "Erstellt das mehrseitige Verkaufs-Exposé',
     '}, "pdf" === Te ? "Exposé wird erstellt… (kann bis zu 1 Minute dauern)" : "📄 Exposé-PDF erstellen")),\n    // Welche Vorlage? Das entscheidet ab fork_43 der Nutzer, hier, vor dem\n    // Erzeugen — nicht mehr eine stille Standardvorlage.\n    // src/eigene/expose-vorlagenwahl.js schreibt die Wahl an das Objekt.\n    window.ImmoExposeVorlagenwahl && React.createElement(window.ImmoExposeVorlagenwahl, {\n      immobilieId: t.id,\n      vorlageId: t.expose_vorlage_id || ""\n    }), React.createElement("div", {\n      style: {\n        fontSize: 12,\n        color: CI.muted,\n        marginBottom: 10\n      }\n    }, "Erstellt das mehrseitige Verkaufs-Exposé',
     'Die Vorlagenwahl steht im Expose-Kasten des Objekts, ueber der Beschreibung und unter dem Knopf.'),
    ('FORK',
     '        const endung = (datei.name.split(".").pop() || "png").toLowerCase();\n        // Mandantenrelativ — die Speicher-Huelle stellt die\n        // Mandantenkennung voran, die Richtlinie aus fork_09 prueft sie.\n        const pfad = "logos/" + e.id + "-" + Date.now() + "." + endung;\n        const { error: uErr } = await window._sb.storage.from("branding-assets")\n          .upload(pfad, datei, { upsert: false, contentType: datei.type || undefined });',
     '        // Freistellen anbieten: ein Logo mit weisser Flaeche steht auf den\n        // farbigen und dunklen Expose-Seiten sonst als Kasten.\n        // src/eigene/logo-freistellen.js rechnet im Browser, das Original\n        // verlaesst das Haus nicht. "abbruch" heisst: nichts hochladen.\n        let hochzuladen = datei, endung = (datei.name.split(".").pop() || "png").toLowerCase();\n        if (window.ImmoLogoFreistellen && !/svg/i.test(datei.type || endung)) {\n          const frei = await window.ImmoLogoFreistellen.oeffnen(datei);\n          if (frei === "abbruch") return;\n          if (frei && frei.blob) { hochzuladen = frei.blob; endung = frei.endung || "png"; }\n        }\n        // Mandantenrelativ — die Speicher-Huelle stellt die\n        // Mandantenkennung voran, die Richtlinie aus fork_09 prueft sie.\n        const pfad = "logos/" + e.id + "-" + Date.now() + "." + endung;\n        const { error: uErr } = await window._sb.storage.from("branding-assets")\n          .upload(pfad, hochzuladen, { upsert: false,\n            contentType: hochzuladen === datei ? (datei.type || undefined) : "image/png" });',
     'Logo freistellen, bevor es hochgeladen wird (src/eigene/logo-freistellen.js).'),
    ('FORK',
     '  }, "v", "5.34.0"), React.createElement("div", {\n    style: {\n      height: "env(safe-area-inset-bottom, 0)"\n    }\n  }))))',
     '  }, "v", "5.34.0"), React.createElement("div", {\n    // Der dezente Produkthinweis. Die Oberflaeche traegt das CI des\n    // Mandanten (so entschieden am 06.10.2026); damit das Produkt dabei\n    // nicht unsichtbar wird, steht sein Name hier, in der Fusszeile, in\n    // der Anmeldung und auf den Freigabeseiten — und nur dort.\n    style: {\n      fontSize: 9.5,\n      color: "rgba(255,255,255,0.32)",\n      marginTop: 2,\n      textAlign: "center",\n      letterSpacing: "0.08em"\n    }\n  }, "mit immoOffice.ai"), React.createElement("div", {\n    style: {\n      height: "env(safe-area-inset-bottom, 0)"\n    }\n  }))))',
     'Dezenter Produkthinweis am Fuss der Seitenleiste.'),
    ('FORK',
     '  }, "Noch kein Konto? ", React.createElement("a", {\n    href: "#",\n    onClick: ev => { ev.preventDefault(); immoSetzeModus("registrieren"); },\n    style: { color: CI.blau, fontWeight: 600 }\n  }, "Firma registrieren")), React.createElement(ZugangLinkAnfordern, null), "Mitarbeiter: Passwort vergessen?", React.createElement("br", null), "Bitte wenden Sie sich an Ihren Ansprechpartner."))))',
     '  }, "Noch kein Konto? ", React.createElement("a", {\n    href: "#",\n    onClick: ev => { ev.preventDefault(); immoSetzeModus("registrieren"); },\n    style: { color: CI.blau, fontWeight: 600 }\n  }, "Firma registrieren")), React.createElement(ZugangLinkAnfordern, null), "Mitarbeiter: Passwort vergessen?", React.createElement("br", null), "Bitte wenden Sie sich an Ihren Ansprechpartner.", React.createElement("div", {\n    style: { marginTop: 14, fontSize: 10.5, color: CI.muted, letterSpacing: "0.08em" }\n  }, "Immobiliensoftware mit immoOffice.ai")))))',
     'Dezenter Produkthinweis unter der Anmeldung.'),
    # --- FORK fork_45/46: die beiden Tafeln unter den Postfaechern --------
    # ANS ENDE DER LISTE, mit Absicht: die Postfach-Tafel, an die sich
    # diese beiden haengen, wird selbst von einer Regel weiter oben erst
    # eingesetzt. Stuende der Block vorne, faende er seinen Anker nicht.
    # Beide gehoeren genau dorthin. Der Sofortversand braucht eine
    # Absenderadresse — wer sie nicht findet, hat sie eine Zeile hoeher
    # noch nicht eingerichtet. Und der Schreibstil wird aus den Mails
    # DIESES Postfachs gelernt.
    ('FORK',
     '  window.ImmoPostfachAnbieter && React.createElement(window.ImmoPostfachAnbieter, {\n'
     '    user: e\n'
     '  }),',
     '  window.ImmoPostfachAnbieter && React.createElement(window.ImmoPostfachAnbieter, {\n'
     '    user: e\n'
     '  }),\n'
     '  // fork_45: Exposé-Sofortversand. Steht unter den Postfaechern, weil\n'
     '  // die Absenderadresse seine Bedingung ist.\n'
     '  window.ImmoSofortversand && React.createElement(window.ImmoSofortversand, {\n'
     '    user: e\n'
     '  }),\n'
     '  // fork_46: der eigene Schreibstil fuer die KI-Entwuerfe. Die\n'
     '  // Einwilligung gehoert der Person, nicht dem Haus — deshalb hier\n'
     '  // bei den eigenen Postfaechern und nicht in den Firmenvorgaben.\n'
     '  window.ImmoMailStil && React.createElement(window.ImmoMailStil, null),',
     'Sofortversand und Schreibstil unter den E-Mail-Postfaechern.'),

    # =====================================================================
    # fork_49 — die Credit-Antwort der Edge Functions wird lesbar
    # ---------------------------------------------------------------------
    # Die Regel haengt sich an das ENDE der Storage-Huelle. Sie steht am
    # Schluss dieser Liste, weil ihr Anker von einer frueheren Regel
    # gesetzt wird — eine Regel davor fuende ihn nicht.
    # =====================================================================
    ('FORK',
     '    return huelle;\n  };\n})();',
     '    return huelle;\n  };\n})();\n\n// --- Credits: „nicht genug“ wird lesbar ------------------------------\n//\n// supabase-js meldet jeden Nicht-2xx-Status als "Edge Function returned a\n// non-2xx status code" und wirft den Koerper weg. Genau darin steht aber,\n// WORAN es lag — zu wenig Credits, beendetes Abo, fehlende Anmeldung — und\n// das ist die einzige Fehlermeldung dieser Art, die der Makler selbst\n// beheben kann.\n//\n// Hier und nicht an den Aufrufstellen: es sind ueber achtzig, jede mit\n// eigener Fehlerbehandlung. Eine Huelle am Aufruf trifft alle, auch die,\n// die spaeter dazukommen.\n(function () {\n  const echt = window._sb.functions.invoke.bind(window._sb.functions);\n  window._sb.functions.invoke = async function (name, optionen) {\n    const antwort = await echt(name, optionen);\n    const f = antwort && antwort.error;\n    const r = f && f.context;\n    // `context` ist die Antwort selbst. Gelesen wird eine KOPIE: wer sie\n    // auswertet, soll sie danach noch lesen koennen.\n    if (!r || typeof r.clone !== "function") return antwort;\n    let koerper = null;\n    try { koerper = await r.clone().json(); } catch (e) { return antwort; }\n    if (!koerper || !koerper.credits_grund) return antwort;\n    let satz = String(koerper.error || "");\n    if (koerper.credits_grund === "credits") {\n      satz += " Credits lassen sich unter „Abo & Abrechnung“ nachkaufen.";\n    }\n    f.message = satz;\n    f.credits = koerper;\n    // Damit die Kopfzeile ihren Stand auffrischen kann, ohne dass jede\n    // Aufrufstelle davon wissen muss.\n    try {\n      window.dispatchEvent(new CustomEvent("immo-credits", { detail: koerper }));\n    } catch (e) { /* aeltere Browser: dann eben ohne */ }\n    return antwort;\n  };\n})();',
     'Credits: die Antwort "nicht genug" wird eine lesbare Meldung.'),
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

    # --- Stufe 120/121 (Vorlage vom 02.10.2026): der neue Admin-Bereich
    # "Portale" fuehrt zwei feste Listen, und in beiden steht shoptv als
    # Portalkanal. Das Neutralitaets-Gate hat sie beim ersten Lauf gegen die
    # neue Vorlage gemeldet — genau dafuer ist es da. Ein reservierter
    # Kurzname, den es nicht mehr gibt, sperrt sonst ein Kuerzel, das ein
    # Mandant fuer ein echtes Portal braeuchte.
    inhalt = inhalt.replace(
        'const EP_PS_RESERVIERT = ["homepage", "website", "shoptv", "immoscout24"];',
        'const EP_PS_RESERVIERT = ["homepage", "website", "immoscout24"];')
    schritte.append('shoptv aus den reservierten Portal-Kurznamen')
    inhalt = inhalt.replace(
        'const EP_PORTALE_FEST = ["homepage", "website", "shoptv", "immowelt", "kleinanzeigen", "immoscout24"];',
        'const EP_PORTALE_FEST = ["homepage", "website", "immowelt", "kleinanzeigen", "immoscout24"];')
    schritte.append('shoptv aus der festen Portalliste des Admin-Bereichs')

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


def funktion_ersetzen(inhalt, name, neu):
    """Ersetzt eine Funktion der obersten Ebene durch neuen Text.

    Gegenstueck zu funktion_entfernen, gleiche Grenzen und gleiche Kontrolle:
    zwischen Anfang und Ende darf keine weitere Funktion der obersten Ebene
    liegen. Trifft der Name nicht, wird abgebrochen — eine Erweiterung, die
    still ins Leere greift, ist schlimmer als keine.
    """
    zeilen = inhalt.split('\n')
    koepfe = (f'function {name}(', f'async function {name}(')
    anfang = None
    for i, l in enumerate(zeilen):
        if l.startswith(koepfe):
            anfang = i
            break
    if anfang is None:
        sys.exit(f'ABBRUCH: Funktion {name} nicht gefunden. Die Vorlage hat '
                 f'sich geaendert.')
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
    return '\n'.join(zeilen[:anfang] + neu.split('\n') + zeilen[ende + 1:])


# Die Feiertage der Vorlage gelten nur fuer Mecklenburg-Vorpommern. Der Fork
# rechnet fuer alle sechzehn Laender; welches gilt, sagt der Standort.
FEIERTAGE_ALLE_LAENDER = """function feiertage(jahr, land) {
  // Gesetzliche Feiertage eines Bundeslandes.
  //
  // Ohne Angabe gilt das Bundesland des Standorts (window.IMMO_BUNDESLAND,
  // gesetzt aus firma_stammdaten.bundesland). Ist keines hinterlegt, bleiben
  // die neun bundesweiten Feiertage stehen — lieber zu wenige als falsche,
  // und die Urlaubsansicht weist darauf hin.
  //
  // Nicht enthalten, weil nicht landesweit gesetzlich: Fronleichnam in
  // Sachsen und Thueringen (nur in bestimmten Gemeinden), Mariae Himmelfahrt
  // in Bayern (nur in ueberwiegend katholischen Gemeinden) und das
  // Augsburger Friedensfest (nur im Stadtgebiet Augsburg).
  const code = String(land || window.IMMO_BUNDESLAND || "").toUpperCase();
  const iso = (d) => d.toISOString().slice(0, 10);
  const plus = (d, n) => { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; };
  const o = osterSonntag(jahr);
  const tage = [
    `${jahr}-01-01`, `${jahr}-05-01`, `${jahr}-10-03`, `${jahr}-12-25`, `${jahr}-12-26`,
    iso(plus(o, -2)), iso(plus(o, 1)), iso(plus(o, 39)), iso(plus(o, 50))
  ];
  const wenn = (laender, wert) => { if (laender.indexOf(code) >= 0) tage.push(wert); };
  wenn(["BW", "BY", "ST"], `${jahr}-01-06`);
  wenn(["BE", "MV"], `${jahr}-03-08`);
  wenn(["BB"], iso(o));
  wenn(["BB"], iso(plus(o, 49)));
  wenn(["BW", "BY", "HE", "NW", "RP", "SL"], iso(plus(o, 60)));
  wenn(["SL"], `${jahr}-08-15`);
  wenn(["TH"], `${jahr}-09-20`);
  wenn(["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH"], `${jahr}-10-31`);
  wenn(["BW", "BY", "NW", "RP", "SL"], `${jahr}-11-01`);
  if (code === "SN") tage.push(bussUndBettag(jahr));
  return new Set(tage);
}

function bussUndBettag(jahr) {
  // Der Mittwoch vor dem 23. November, also der Mittwoch im Fenster 16. bis 22.
  for (let tag = 16; tag <= 22; tag++) {
    const d = new Date(Date.UTC(jahr, 10, tag));
    if (d.getUTCDay() === 3) return d.toISOString().slice(0, 10);
  }
  return "";
}

function feiertageMV(jahr) {
  // Alter Name, damit die sechs Aufrufstellen unveraendert bleiben.
  return feiertage(jahr);
}"""


def feiertage_alle_laender(inhalt):
    return funktion_ersetzen(inhalt, 'feiertageMV', FEIERTAGE_ALLE_LAENDER)


# Der Mandantenkontext gehoert in getProfile: die einzige Stelle, an der die
# Oberflaeche das Profil des Angemeldeten laedt.
MANDANTENKONTEXT = """async function getProfile(e) {
  const {
    data: t,
    error: n
  } = await window._sb.from("profiles").select("*").eq("id", e).single();
  if (n) throw n;

  // Mandantenkontext einmal global ablegen.
  //
  // Die Vorlage war einmandantig und brauchte das nicht. Der Fork braucht es
  // an vielen Stellen — Feiertage, Storage-Pfade, Branding, Auswahl von
  // Gesellschaft und Standort —, und jede davon soll es nicht selbst laden.
  // getProfile ist die einzige Stelle, an der das Profil des Angemeldeten
  // geholt wird; hier steht es genau einmal.
  //
  // Faellt eine der Abfragen aus, bleibt der Wert null. Die Aufrufer sind
  // darauf eingerichtet: die Feiertagsrechnung nimmt dann die neun
  // bundesweiten, und das ist besser als falsche.
  window.IMMO_MANDANT_ID = (t && t.mandant_id) || null;
  try {
    const {
      data: s
    } = await window._sb.from("firma_stammdaten")
      .select("id, bundesland, gesellschaft_id")
      .order("sortierung")
      .limit(1)
      .maybeSingle();
    window.IMMO_STANDORT_ID = (s && s.id) || null;
    window.IMMO_GESELLSCHAFT_ID = (s && s.gesellschaft_id) || null;
    window.IMMO_BUNDESLAND = (s && s.bundesland) || null;
  } catch (f) {
    window.IMMO_STANDORT_ID = null;
    window.IMMO_GESELLSCHAFT_ID = null;
    window.IMMO_BUNDESLAND = null;
  }
  return t
}"""


def mandantenkontext(inhalt):
    return funktion_ersetzen(inhalt, 'getProfile', MANDANTENKONTEXT)


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

    # Der Zuschnitt kommt aus der Vorlage selbst (siehe AUFBAU oben).
    STUECKE = zuschnitt(z)

    # Zuschnitt gegen die Vorlage pruefen, bevor irgendetwas geschrieben wird.
    for datei, (auf, zu) in TAGS.items():
        a, b = STUECKE[datei]
        if z[a - 2].strip() != auf or z[b].strip() != zu:
            sys.exit(f'ABBRUCH: {datei} soll von {auf}/{zu} umschlossen sein, '
                     f'Zeile {a-1} ist {z[a-2].strip()[:40]!r} und '
                     f'Zeile {b+1} ist {z[b].strip()[:40]!r}.\n'
                     'Die Vorlage hat einen anderen Aufbau als AUFBAU beschreibt.')

    # src/ wird geleert, damit ein entferntes Stueck nicht liegen bleibt —
    # ABER src/seiten/ gehoert nicht diesem Skript. Die Nebenseiten (sw.js,
    # freigabe.html, objekt.html, sonnenverlauf.html, _redirects) erzeugt
    # scripts/nebenseiten.py aus eigenen Quellen. Am 28.09.2026 hat dieses
    # Skript sie mitgeloescht, und der Commit danach hat die Loeschung
    # mitgenommen: die Auslieferung haette nur noch aus index.html bestanden.
    #
    # Dasselbe gilt fuer src/eigene/: dort steht Oberflaeche, die der Fork
    # SELBST schreibt und die es in der Vorlage nicht gibt (der
    # Exposé-Editor). Sie ist Handarbeit, versioniert, und dieses Skript
    # hat zu ihr nichts zu sagen.
    gerettet = {}
    for name in ('seiten', 'eigene'):
        fremd = ziel / name
        if not fremd.exists():
            continue
        beiseite = ziel.parent / ('.umzug-' + name)
        if beiseite.exists():
            shutil.rmtree(beiseite)
        shutil.move(str(fremd), str(beiseite))
        gerettet[name] = beiseite
    if ziel.exists():
        shutil.rmtree(ziel)
    if gerettet:
        ziel.mkdir(parents=True, exist_ok=True)
        for name, beiseite in gerettet.items():
            shutil.move(str(beiseite), str(ziel / name))

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
                inhalt = feiertage_alle_laender(inhalt)
                print('  [FORK]        Feiertage: alle sechzehn Bundeslaender '
                      'statt nur Mecklenburg-Vorpommern.')
                inhalt = mandantenkontext(inhalt)
                print('  [FORK]        Mandantenkontext in getProfile '
                      '(Mandant, Standort, Gesellschaft, Bundesland).')
            for grund, muster, ersatz, bemerkung in ERSETZUNGEN:
                inhalt, n = re.subn(muster, ersatz, inhalt)
                pruefe_haeufigkeit(n, bemerkung, datei)
                if n:
                    zaehler[(grund, muster)] = zaehler.get((grund, muster), 0) + n
            # Woertlich, nach den regulaeren Ausdruecken: hier ist der
            # Suchtext der Suchtext, und der Ersatz ist der Ersatz.
            for grund, suche, ersatz, bemerkung in WOERTLICH:
                n = inhalt.count(suche)
                pruefe_haeufigkeit(n, bemerkung, datei)
                if n:
                    inhalt = inhalt.replace(suche, ersatz)
                    zaehler[(grund, suche)] = zaehler.get((grund, suche), 0) + n
            if datei == 'huelle/01-kopf.html':
                inhalt += KONFIGURATION
        p = ziel / datei
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(inhalt, encoding='utf-8')

    if roh:
        print(f'{len(STUECKE)} Stuecke unveraendert nach {ziel}')
        return 0

    print('Neutralisierung der Oberflaeche:')
    for grund, muster, _, bemerkung in ERSETZUNGEN + WOERTLICH:
        n = zaehler.get((grund, muster), 0)
        if n:
            print(f'  [{grund:5s}] {n:4d}x  {bemerkung}')
    nie = [b for g, m, _, b in ERSETZUNGEN + WOERTLICH if not zaehler.get((g, m))]
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
