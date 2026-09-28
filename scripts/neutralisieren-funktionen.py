#!/usr/bin/env python3
"""Erzeugt aus den Edge Functions der Vorlage die Edge Functions des Forks.

Gegenstueck zu scripts/neutralisieren.py, das dasselbe fuer das Schema tut.
Warum ein Skript und nicht Handarbeit: die Ersetzungen sind damit vollstaendig
nachlesbar, wiederholbar und einzeln begruendet. Wer wissen will, was der Fork
gegenueber der Vorlage aendert, liest diese Datei — nicht einen Diff von 2,8 MB.

Eingabe:  reference/functions/<name>/*        (nicht versioniert)
Ausgabe:  supabase/functions/<name>/*         (versioniert)

Jede Ersetzung fuellt genau einen der drei Gruende:
  MARKE    Kennzeichen des Referenzunternehmens — darf nirgends erscheinen.
  FREMD    Verweis auf das fremde Supabase-Projekt — muss auf das eigene zeigen.
  PHASE14  in Phase 1.4 des Auftrags ersatzlos gestrichen.
Alles andere bleibt, wie es ist (Phase 9: keine Verhaltensaenderung).

Was dieses Skript NICHT leistet: die Funktionen bleiben einmandantig. Sie lesen
Absender, Firmenname und Portal-Adresse weiterhin aus Umgebungsvariablen und
festen Vorgabewerten statt aus firma_stammdaten des jeweiligen Mandanten. Das
ist Aufgabe von Phase 2.4 und in docs/OFFEN.md vermerkt. Hier wird die Marke
entfernt, nicht die Architektur geaendert.
"""
import pathlib, re, shutil, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
QUELLE = WURZEL / 'reference' / 'functions'
ZIEL = WURZEL / 'supabase' / 'functions'

# --------------------------------------------------------------- Phase 1.4
# Vier Funktionen entfallen ersatzlos. jotform-* ist der Formular-Sync des
# Referenzunternehmens, yodeck-* ist Digital Signage / Shop-TV. Beides steht
# im Auftrag unter „entfaellt" und hat im Fork keinen Platz.
ENTFAELLT = {'jotform-poll', 'jotform-webhook', 'yodeck-api', 'yodeck-test'}

# Ein Platzhalter-Host nach RFC 2606: die Endung .example ist reserviert und
# kann keinem echten Unternehmen gehoeren. Besser als eine erfundene Domain,
# die es morgen geben koennte.
HOST = 'immooffice.example'

# ---------------------------------------------------------------- Ersetzungen
# (Grund, Muster, Ersatz, Bemerkung) — Muster ist ein regulaerer Ausdruck.
ERSETZUNGEN = [
    # --- MARKE: vertrag-pdf traegt die drei Standorte der Referenz als Tabelle
    # im Quelltext — mit den Ortsnamen als Schluessel. Ein Block, eine Regel:
    # ein leerer Eintrag 'standard'. Die Werte gehoeren nach firma_stammdaten
    # (typ = 'standort'); das ist Phase 2.4 und steht in docs/OFFEN.md.
    ('MARKE',
     r'  rostock: \{ name: "Engfer & Partner Immobilien".*\n'
     r'  schwerin: \{ name: "Engfer & Partner Immobilien Schwerin".*\n'
     r'  berlin: \{ name: "Engfer & Partner Immobilien Berlin".*\n',
     '  standard: { name: "", firma: "", strasse: "", plzOrt: "", stadt: "" },\n',
     'Standorttabelle der Referenz in vertrag-pdf.'),
    # --- MARKE: muss VOR den Produktnamen-Regeln stehen, sonst bleibt die
    # Herkunft in der Mitte der Kennung stehen.
    ('MARKE', r'de\.engferundpartner\.epworld', 'de.immooffice.app',
     'Bundle-Kennung der iOS-App; sie gehoert zum Entwicklerkonto der Referenz.'),
    # --- MARKE: Adressen und Domains der Referenz
    ('MARKE', r'https://epworld\.netlify\.app', f'https://{HOST}',
     'Portal-Adresse der Referenz. Steht ueberall als Rueckfallwert hinter '
     'PORTAL_URL bzw. EXPOSE_FREIGABE_BASIS; der Platzhalter macht sichtbar, '
     'dass die Variable gesetzt werden muss.'),
    ('MARKE', r'https://(www\.)?engferundpartner\.(de|com)', f'https://{HOST}',
     'Webauftritt der Referenz (Datenschutz, AGB, Impressum).'),
    ('MARKE', r'@engferundpartner\.(de|com)\b', f'@{HOST}',
     'Maildomain der Referenz in Absender- und Empfaengervorgaben.'),
    ('MARKE', r'@engferundpartner\b', f'@{HOST}',
     'wie oben, ohne Endung geschrieben'),
    ('MARKE', r'engferundpartner\.(de|com)', HOST, 'Domain der Referenz im Fliesstext'),

    # --- MARKE: Firmenname in allen Schreibweisen
    ('MARKE', r'ENGFER\s*&(amp;)?\s*PARTNER\s+IMMOBILIEN', 'MUSTERHAUS IMMOBILIEN',
     'Firmenname in Versalien, im Kopf von HTML-Mails.'),
    ('MARKE', r'Engfer\s*&amp;\s*Partner\s+Immobilien', 'Musterhaus Immobilien GmbH',
     'Firmenname HTML-maskiert.'),
    ('MARKE', r'Engfer\s*&\s*Partner\s+Immobilien', 'Musterhaus Immobilien GmbH',
     'Firmenname im Klartext.'),
    ('MARKE', r'Engfer\s*&amp;\s*Partner', 'Musterhaus Immobilien',
     'Firmenname ohne Zusatz, HTML-maskiert.'),
    ('MARKE', r'Engfer\s*&\s*Partner', 'Musterhaus Immobilien',
     'Firmenname ohne Zusatz.'),
    ('MARKE', r'\bENGFER\b', 'MUSTERHAUS', 'Wortmarke in Versalien.'),
    ('MARKE', r'EngferPortal', 'ImmoOffice',
     'Kennung im User-Agent beim Abruf fremder Seiten.'),
    ('MARKE', r'engferportal', 'immooffice', 'wie oben, klein geschrieben'),
    ('MARKE', r'EngferPartnerIntranet|engferpartnerintranet', 'ImmoOffice',
     'Kennung der Referenz in Fremdsystem-Aufrufen.'),
    ('MARKE', r'engfer-partner-logo\.png', 'logo.png',
     'Dateiname des Logos im Bucket branding-assets.'),
    ('MARKE', r'Engfer-Blau', 'Markenblau', 'Farbbezeichnung in einem Kommentar.'),
    ('MARKE', r'\bE&P\s*World\b', 'ImmoOffice', 'Produktname der Referenz.'),
    ('MARKE', r'\bE&amp;P\s*World\b', 'ImmoOffice', 'Produktname HTML-maskiert.'),
    ('MARKE', r'\bepworld\b', 'immooffice', 'Produktname klein geschrieben.'),
    ('MARKE', r'\bep-world\b', 'immooffice', 'Produktname mit Bindestrich.'),
    ('MARKE', r'\bEP[- ]?World\b', 'ImmoOffice',
     'Produktname ohne kaufmaennisches Und — steht als sendersoftware im '
     'OpenImmo-Export und in einem User-Agent.'),
    ('MARKE', r'\bE&P\s*Immobilien\b', 'Musterhaus Immobilien GmbH', 'Firmenname kurz.'),
    # Was nach den Regeln oben noch uebrig bleibt, ist der blosse Nachname.
    ('MARKE', r'\bEngfer\b', 'Musterhaus', 'Nachname der Referenz, Restfaelle.'),
    ('MARKE', r'\bengfer\b', 'musterhaus', 'wie oben, klein geschrieben'),

    # --- MARKE: Bezeichner im Quelltext. Der Unterstrich ist ein Wortzeichen,
    # deshalb greift die Regel fuer die blosse Wortmarke hier nicht.
    ('MARKE', r'\bENGFER_', 'STIL_',
     'Konstantennamen der Stilvorgaben in generate-text.'),

    # --- MARKE: Anschriften der Referenz als fest verdrahtete Rueckfallwerte.
    # Ersatzlos: eine erfundene Anschrift waere schlimmer als gar keine, und
    # die richtige Quelle ist firma_stammdaten (Phase 2.4).
    ('MARKE', r'"Am V(ö|oe)genteich 26 ?[rR], 18055 Rostock"', '""',
     'Bueroanschrift der Referenz, einzeilig.'),
    ('MARKE', r'(strasse: )"Am V(ö|oe)genteich 26 ?[rR]"', r'\1""',
     'Bueroanschrift der Referenz, Strassenfeld.'),
    ('MARKE', r'(plz: )"18055"', r'\1""', 'Postleitzahl der Referenz.'),
    ('MARKE', r'(ort: )"Rostock"', r'\1""', 'Ort der Referenz.'),
    ('MARKE', r'\.replace\("Voegenteich", "V(ö|oe)genteich"\)', '',
     'Umlaut-Reparatur fuer den Strassennamen der Referenz — ohne die Strasse '
     'gegenstandslos.'),

    # --- MARKE: Standorte der Referenz in KI-Anweisungen
    ('MARKE', r'\(Rostock, Schwerin, Berlin\)', '', 'Standortliste der Referenz.'),
    ('MARKE', r'\(Rostock\)', '', 'Standort der Referenz.'),

    # --- PHASE14: gestrichene Dienste in Absenderlisten
    # Die Namen stehen in Listen von Absendern, die kein Lead und keine
    # Abwesenheitsantwort sind. Kein Aufruf des Dienstes, nur eine Zeichenkette.
    # Sie fallen trotzdem heraus: der Fork bindet diese Dienste nicht an, also
    # gehoeren ihre Domains auch nicht in eine Ausnahmeliste.
    ('PHASE14', r'"sipgate\.de", ', '', 'Absenderliste akq-mail-leads'),
    ('PHASE14', r'"jotform\.com", ', '', 'Absenderliste akq-mail-leads'),
    ('PHASE14', r'\|jotform', '', 'Absenderfilter mail-abwesenheit-verarbeiten'),
    ('PHASE14', r'\|sipgate', '', 'Absenderfilter mail-abwesenheit-verarbeiten'),
    ('PHASE14', r'\|yodeck', '', 'Absenderfilter mail-abwesenheit-verarbeiten'),
    ('PHASE14', r'\(SPRENGNETTER\)', '(Bewertungsdienst)',
     'Anbietername in einer KI-Anweisung; die Anweisung bleibt verstaendlich.'),
    ('PHASE14', r'z\. B\. von Sprengnetter', 'z. B. von einem Bewertungsdienst',
     'wie oben'),
    ('PHASE14', r'z\.B\. "sprengnetter"', 'z.B. "bewertungsdienst"',
     'Beispiel in einem Kommentar'),

    # ------------------------------------------------------------------
    # Nachtrag 28.09.2026. Die Regeln oben haben die Marke getroffen, aber
    # drei Klassen von Kennzeichen uebersehen — gefunden erst, als das
    # Neutralitaets-Gate selbst repariert war (siehe scripts/neutral.sh):
    #   1. Umlaute in \uXXXX-Schreibweise. Die Bueroanschrift der Referenz
    #      steht in energieausweis-anfrage als "Vögenteich"; das Muster
    #      V(oe|ö)genteich geht daran vorbei.
    #   2. Die Rufnummer der Referenz. Sie stand in keiner Regel.
    #   3. Die Standorte der Referenz — als Rueckfallwert, als Schluessel
    #      einer Standorttabelle, als Hashtag und als Beispiel in
    #      KI-Anweisungen.
    # ------------------------------------------------------------------

    # --- MARKE: Rufnummer der Referenz. Ueberall ein Rueckfallwert hinter
    # firma_stammdaten.telefon. Ersatzlos, aus demselben Grund wie bei der
    # Anschrift: eine erfundene Nummer waere schlimmer als keine.
    ('MARKE', r'"0381 36 77 99 88"', '""',
     'Rufnummer der Referenz als Rueckfallwert.'),
    ('MARKE', r'korrekte Telefonnummer 0381 36 77 99 88 \(', 'korrekte Telefonnummer (',
     'Rufnummer der Referenz in einem Aenderungsvermerk.'),
    ('MARKE', r'Telefon 0381 36 77 99 88 &nbsp;\\u00b7&nbsp; ', '',
     'Rufnummer im Fuss der HTML-Mail des Energieausweis-Fragebogens.'),

    # --- MARKE: Bueroanschrift der Referenz in \uXXXX-Schreibweise.
    ('MARKE', r'&nbsp;\\u00b7&nbsp; Am V\\u00f6genteich 26 R, 18055 Rostock', '',
     'Anschrift im Fuss der HTML-Mail.'),
    ('MARKE', r' "Am V\\u00f6genteich 26 R, 18055 Rostock", "Tel\.: 0381 36 77 99 88",', '',
     'Anschrift und Rufnummer im Signaturblock der Bestaetigungsmail.'),
    ('MARKE', r', Am V\\u00f6genteich 26 R, 18055 Rostock, Tel\.: 0381 36 77 99 88,', ',',
     'Anschrift und Rufnummer in der Widerrufsbelehrung. Der gesetzliche '
     'Mustertext bleibt, die Angaben des Betreibers fallen heraus — sie '
     'gehoeren nach firma_stammdaten (Phase 2.4).'),
    ('MARKE', r', Am V\\u00f6genteich 26 R, 18055 Rostock', '',
     'Anschrift in der Anschrift-Zeile des Muster-Widerrufsformulars.'),

    # --- MARKE: Marken- und Regional-Hashtags der Referenz in den
    # Anweisungen fuer die Social-Media-Texte.
    ('MARKE', r'#engferundpartner #rostock #mecklenburgvorpommern', '#immobilienmakler',
     'Marken-Hashtag der Referenz und ihre Regional-Hashtags.'),
    ('MARKE', r' aus Rostock\.', '.',
     'Sitz der Referenz in den Rollenbeschreibungen der Social-Media-Texte.'),

    # --- MARKE: Sitz der Referenz in KI-Anweisungen. Je Stelle eine Regel,
    # weil der Satzbau jedes Mal anders ist und ein allgemeines Muster fuer
    # "Rostock" auch echte Objektdaten treffen wuerde.
    ('MARKE', r'\nin Rostock\. Du hilfst', '\nDu hilfst', 'Sitz in claude-chat.'),
    ('MARKE', r'GmbH in Rostock,', 'GmbH,', 'Sitz in mail-ki-vorschlag.'),
    ('MARKE', r' GmbH, Rostock\)', ' GmbH)', 'Sitz in objekt-wissen-auslesen.'),
    ('MARKE', r', Rostock/Schwerin/Berlin\)', ')', 'Standortliste in akq-mail-leads.'),

    # --- MARKE: Standorte als Rueckfallwerte und Schluessel.
    ('MARKE', r'ort_unterzeichnung \|\| "Rostock"', 'ort_unterzeichnung || ""',
     'Unterzeichnungsort in Reservierung und Signaturvorgang.'),
    ('MARKE', r'\|\| "ROSTOCK"', '|| ""',
     'Standortzeile im Fuss der Expose- und MPE-PDFs.'),
    ('MARKE', r'"rostock"', '"standard"',
     'Slug des Hauptstandorts der Referenz — Rueckfall bei firma_stammdaten.'),
    ('MARKE', r'gesperrt\("ROSTOCK   -   SCHWERIN   -   BERLIN"', 'gesperrt(""',
     'Standortzeile im Briefkopf von brief-pdf-erzeugen.'),

    # --- MARKE: Standorte in Beispielen fuer die KI-Auslese.
    ('MARKE', r'\(z\. B\. 18055 ROSTOCK\)', '(z. B. 12345 MUSTERSTADT)',
     'Beispiel-Postleitzahl in parse-expose.'),
    ('MARKE', r'"Stra(ß|ss)e 12, 18055 Rostock"', '"Musterstrasse 12, 12345 Musterstadt"',
     'Beispiel-Anschrift im Kopfkommentar von entfernungen-berechnen.'),
    ('MARKE', r'"(plz|objekt_plz)": "1805[57]"', r'"\1": "12345"',
     'Beispiel-Postleitzahl in parse-objektnachweis.'),
    ('MARKE', r'"(ort|geburtsort|objekt_ort)": "Rostock"', r'"\1": "Musterstadt"',
     'Beispiel-Ort in parse-objektnachweis.'),
    ('MARKE', r'Schwerin liegt rund 55 km entfernt, die Hansestadt Rostock etwa 70 km\.',
     'Die naechste Kreisstadt liegt rund 25 km entfernt, die naechste '
     'Grossstadt etwa 70 km.',
     'Beispiel-Lagetext in generate-text; er nennt die Sitze der Referenz.'),
    ('MARKE', r'Wohnung in Warnem(ü|ue)nde', 'Wohnung in Musterstadt',
     'Beispiel-Expose im Bewerbertest.'),
    ('MARKE', r'im Rostocker Ortsteil Markgrafenheide', 'im Ortsteil Musterdorf',
     'wie oben'),
    ('MARKE', r'Titel "Warnemuende" vs\. Text "Markgrafenheide"',
     'Titel "Musterstadt" vs. Text "Musterdorf"',
     'Loesungsschluessel zum Beispiel-Expose; er muss zum Text oben passen.'),
    ('MARKE', r'STANDORTE\.rostock', 'STANDORTE.standard',
     'Schluessel der Standorttabelle ohne Anfuehrungszeichen — der Zugriff '
     'auf den Hauptstandort in vertrag-pdf und signatur-vorgang-starten.'),

    # --- MARKE: Standorte in Kommentaren. Das Gate laesst Kommentarzeilen
    # durch — ein Kommentar ruft nichts auf. Hier stehen sie trotzdem, weil
    # sie den Sitz der Referenz nennen.
    ('MARKE', r'R(ü|ue)ckfall Rostock', 'Rueckfall leer',
     'Kommentar in expose-freigabe und objekt-landing.'),
    ('MARKE', r'const BUERO_TELEFON = "";   // R(ü|ue)ckfall, wenn die '
              r'Gesellschaft keine B(ü|ue)ronummer hinterlegt hat',
     'const BUERO_TELEFON = "";   // Rueckfall, wenn die Gesellschaft keine '
     'Bueronummer hinterlegt hat',
     'Umlaute im Kommentar daneben — nur Kosmetik, damit die Zeile lesbar bleibt.'),

    # --- FREMD: Verweise auf das Supabase-Projekt der Vorlage
    ('FREMD', r'yazwkzzjiquprtjpurur', 'usguiggfciavwzkdfjgt',
     'Projektkennung der Vorlage durch die eigene ersetzt.'),
]

# Drei Funktionen verdrahten die Portal-Adresse fest, statt sie wie alle
# uebrigen aus PORTAL_URL zu lesen. Nach der Ersetzung oben stuende dort der
# Platzhalter-Host als einzige Quelle — die Links gingen ins Leere. Deshalb
# bekommen sie denselben Rueckfall wie der Rest der Funktionen.
# NACHBESSERN wird WOERTLICH ersetzt, nicht als regulaerer Ausdruck. Grund:
# hier stehen Code-Schnipsel mit Klammern und Punkten, und ein Muster wie
# STANDORTE["rostock"] ist als Ausdruck eine Zeichenklasse — es wuerde quer
# durch die Datei einzelne Buchstaben treffen. Genau das ist beim Schreiben
# dieses Skripts passiert.
NACHBESSERN = [
    # Die kurze Namensregel greift auch dort, wo im Original schon ein GmbH
    # stand. Einmal geradeziehen ist billiger als eine Regel je Schreibweise.
    ('MARKE', 'Musterhaus Immobilien GmbH GmbH', 'Musterhaus Immobilien GmbH',
     'doppeltes GmbH nach der Namensersetzung.'),
    # vertrag-pdf traegt die drei Standorte der Referenz als Tabelle im
    # Quelltext. Der Fork behaelt die Struktur, aber nur einen leeren Eintrag:
    # die Werte gehoeren nach firma_stammdaten (typ = 'standort'), und das ist
    # Phase 2.4. Bis dahin erzeugt vertrag-pdf Vertraege ohne Firmenkopf —
    # vermerkt in docs/OFFEN.md.
    ('MARKE', 'STANDORTE["rostock"]', 'STANDORTE["standard"]',
     'Schluessel der Standorttabelle in vertrag-pdf (Typverweise).'),
    ('MARKE', 'STANDORTE[vertrag.standort || "rostock"] || STANDORTE.rostock',
     'STANDORTE[vertrag.standort || "standard"] || STANDORTE.standard',
     'Schluessel der Standorttabelle in vertrag-pdf (Zugriff).'),

    # --- Nachtrag 28.09.2026: die Standorte der Referenz in der KI-Anweisung
    # von parse-maklervertrag. Woertlich, weil der Text erst nach den
    # Namensregeln oben diese Gestalt hat: die Regel fuer den Firmennamen
    # zieht die zuvor umgebrochene Zeile zusammen.
    ('MARKE', '"standort": "standard" | "schwerin" | null,',
     '"standort": "standard" | "zweigstelle" | null,',
     'Standort-Aufzaehlung im JSON-Schema der Vertragsauslese.'),
    ('MARKE',
     '- STANDORT erkennst du am Briefkopf des Vertrags: erwaehnt das die '
     '"Musterhaus Immobilien GmbH Rostock" -> rostock, "Schwerin" -> schwerin. '
     'Wenn nicht eindeutig -> null.',
     '- STANDORT erkennst du am Briefkopf des Vertrags: nennt er den Hauptsitz '
     '-> standard, eine Zweigstelle -> zweigstelle. Wenn nicht eindeutig -> null.',
     'Erklaerung dazu; sie nannte die beiden Bueros der Referenz.'),

    # --- Nachtrag 28.09.2026: die Bueros der Referenz in mpe-pdf-erzeugen.
    # Woertlich ersetzt, weil hier Klammern und Punkte im Muster stehen.
    ('MARKE',
     'const dateien = ["mpe/buero-rostock.jpg", "mpe/buero-schwerin.jpg", "mpe/buero-berlin.jpg"];\n'
     'const namen = ["Rostock", "Schwerin", "Berlin"];',
     'const dateien = ["mpe/buero-1.jpg", "mpe/buero-2.jpg", "mpe/buero-3.jpg"];\n'
     'const namen = ["", "", ""];',
     'Buerofotos und Bueronamen der Referenz in der MPE-Seitenleiste. Die '
     'Schleife laeuft weiter ueber drei Plaetze — fehlt das Bild, vermerkt '
     'die Funktion das wie bisher als Warnung.'),
    ('MARKE',
     'const pins: Array<[number, number, string, string, string]> = [\n'
     '[12.140, 54.089, "Rostock", "r", ""],\n'
     '[11.415, 53.630, "Schwerin", "u", ""],\n'
     '[9.993, 53.551, "Hamburg", "l", "Vertriebspartner"],\n'
     '[13.413, 52.523, "Berlin", "r", ""],\n'
     '];',
     'const pins: Array<[number, number, string, string, string]> = [];\n'
     '// Die vier Kartenpunkte der Vorlage sind entfallen: sie markieren die\n'
     '// Bueros des Referenzunternehmens und seinen Vertriebspartner.\n'
     '// Ab Phase 2.4 kommen sie aus firma_standorte des Mandanten; bis dahin\n'
     '// zeichnet die Karte keine Punkte (docs/OFFEN.md).\n'
     '//',
     'Standortkarte im MPE-PDF. Gleich viele Zeilen wie zuvor, damit die '
     'Zeilenbremse im Skript greift, wenn eine andere Regel danebengeht.'),

    ('MARKE', f'const PORTAL_URL = "https://{HOST}";',
     f'const PORTAL_URL = Deno.env.get("PORTAL_URL") || "https://{HOST}";',
     'Feste Portal-Adresse aus PORTAL_URL lesen, wie in den uebrigen Funktionen.'),
    ('MARKE', f'const OBJEKT_BASIS = "https://{HOST}/objekt.html?t=";',
     f'const OBJEKT_BASIS = (Deno.env.get("PORTAL_URL") || "https://{HOST}")'
     f'.replace(/\\/?$/, "") + "/objekt.html?t=";',
     'wie oben'),
]


def pruefe_haeufigkeit(n, bemerkung, datei):
    """Notbremse gegen Regeln, die versehentlich zu breit greifen.

    Keine der Ersetzungen hat in einer einzelnen Datei einen dreistelligen
    Grund. Wer eine Regel schreibt, die 400 Mal zutrifft, hat sich vertan —
    und ohne diese Pruefung faellt es erst beim Lesen des Ergebnisses auf.
    """
    if n > 60:
        sys.exit(f'ABBRUCH: Regel "{bemerkung}" trifft in {datei} {n}-mal zu. '
                 'Das ist zu oft, um beabsichtigt zu sein.')


def main():
    if not QUELLE.is_dir():
        sys.exit(f'Nicht gefunden: {QUELLE}\n'
                 'Die Funktionen der Vorlage gehoeren unversioniert nach reference/functions.')

    zaehler = {}
    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    ZIEL.mkdir(parents=True)

    uebernommen = 0
    gestrichen = []
    for ordner in sorted(QUELLE.iterdir()):
        if not ordner.is_dir():
            continue
        if ordner.name in ENTFAELLT:
            gestrichen.append(ordner.name)
            continue
        ziel_ordner = ZIEL / ordner.name
        ziel_ordner.mkdir()
        for datei in sorted(ordner.rglob('*')):
            if datei.is_dir():
                continue
            rel = datei.relative_to(ordner)
            inhalt = datei.read_text(encoding='utf-8')
            zeilen_vorher = inhalt.count('\n')
            for grund, muster, ersatz, bemerkung in ERSETZUNGEN:
                inhalt, n = re.subn(muster, ersatz, inhalt)
                pruefe_haeufigkeit(n, bemerkung, datei)
                if n:
                    zaehler[(grund, muster)] = zaehler.get((grund, muster), 0) + n
            for grund, muster, ersatz, bemerkung in NACHBESSERN:
                n = inhalt.count(muster)
                pruefe_haeufigkeit(n, bemerkung, datei)
                if n:
                    inhalt = inhalt.replace(muster, ersatz)
                    zaehler[(grund, muster)] = zaehler.get((grund, muster), 0) + n
            # Zweite Notbremse: eine Neutralisierung fuegt keine Zeilen hinzu
            # und entfernt hoechstens die beiden Standortzeilen.
            zeilen_delta = inhalt.count('\n') - zeilen_vorher
            if not -2 <= zeilen_delta <= 0:
                sys.exit(f'ABBRUCH: {datei} hat {zeilen_delta:+d} Zeilen. '
                         'Eine Regel greift anders als gedacht.')
            ziel = ziel_ordner / rel
            ziel.parent.mkdir(parents=True, exist_ok=True)
            ziel.write_text(inhalt, encoding='utf-8')
        uebernommen += 1

    print('Neutralisierung der Edge Functions:')
    for grund, muster, _, bemerkung in ERSETZUNGEN + NACHBESSERN:
        n = zaehler.get((grund, muster), 0)
        if n:
            print(f'  [{grund:7s}] {n:4d}x  {bemerkung}')
    nie = [b for g, m, _, b in ERSETZUNGEN + NACHBESSERN if not zaehler.get((g, m))]
    if nie:
        print(f'\n  {len(nie)} Regel(n) ohne Treffer — Vorlage hat sich geaendert '
              f'oder die Regel ist ueberholt:')
        for b in nie:
            print(f'    - {b}')
    print(f'\n[PHASE14] {len(gestrichen)} Funktionen gestrichen: {", ".join(gestrichen)}')
    print(f'{uebernommen} Funktionen geschrieben nach {ZIEL}')


if __name__ == '__main__':
    main()
