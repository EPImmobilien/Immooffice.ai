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
