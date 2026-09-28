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
     '      .select("id, bundesland, gesellschaft_id, ci_primaer, ci_akzent, ci_font, logo_pfad, marken_name, firma_name")',
     'getProfile laedt auch die CI des Standorts.'),
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

    ('MARKE', r'\bEP_', 'IMMO_', 'Vorsatz EP_ in Bezeichnern der Oberflaeche.'),
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

    # Zuschnitt gegen die Vorlage pruefen, bevor irgendetwas geschrieben wird.
    for datei, (auf, zu) in TAGS.items():
        a, b = STUECKE[datei]
        if z[a - 2].strip() != auf or z[b].strip() != zu:
            sys.exit(f'ABBRUCH: {datei} soll von {auf}/{zu} umschlossen sein, '
                     f'Zeile {a-1} ist {z[a-2].strip()[:40]!r} und '
                     f'Zeile {b+1} ist {z[b].strip()[:40]!r}.\n'
                     'Die Vorlage hat einen anderen Aufbau als STUECKE beschreibt.')

    # src/ wird geleert, damit ein entferntes Stueck nicht liegen bleibt —
    # ABER src/seiten/ gehoert nicht diesem Skript. Die Nebenseiten (sw.js,
    # freigabe.html, objekt.html, sonnenverlauf.html, _redirects) erzeugt
    # scripts/nebenseiten.py aus eigenen Quellen. Am 28.09.2026 hat dieses
    # Skript sie mitgeloescht, und der Commit danach hat die Loeschung
    # mitgenommen: die Auslieferung haette nur noch aus index.html bestanden.
    fremd = ziel / 'seiten'
    gerettet = None
    if fremd.exists():
        gerettet = ziel.parent / '.seiten-umzug'
        if gerettet.exists():
            shutil.rmtree(gerettet)
        shutil.move(str(fremd), str(gerettet))
    if ziel.exists():
        shutil.rmtree(ziel)
    if gerettet is not None:
        ziel.mkdir(parents=True, exist_ok=True)
        shutil.move(str(gerettet), str(fremd))

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
