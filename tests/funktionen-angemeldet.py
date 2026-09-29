#!/usr/bin/env python3
"""Buch ueber die Edge Functions MIT JWT-Pruefung, die den service_role benutzen.

tests/funktionen-oeffentlich.py fuehrt Buch ueber die 28 Funktionen ohne
JWT-Pruefung. Das ist die halbe Frage. Die andere Haelfte hat dasselbe
Muster in anderer Verkleidung:

    JWT geprueft  ->  service_role benutzt  ->  Kennung aus dem Koerper
                                                geglaubt

Der service_role umgeht RLS. Eine uuid, die der Aufrufer mitschickt, ist
damit ungeprueft — sie kann auf einen Satz eines anderen Mandanten zeigen.
Aufgefallen ist das am 29.09.2026 an fahrt-ermitteln: Entfernung, Fahrzeit
und Koordinaten zu jedem Objekt jedes Maklers, fuer jeden Angemeldeten.

Diese Datei zaehlt, findet neue Faelle und haelt fest, was geprueft ist.
Die Liste NOCH_OFFEN darf nur kuerzer werden.
"""
import re
import sys
import tomllib
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
FUNKTIONEN = WURZEL / 'supabase' / 'functions'

# --- Abgesichert: die Kennung wird gegen den Mandanten des Aufrufers
# geprueft. Der Wert ist das Kennzeichen, an dem sich das im Quelltext
# nachsehen laesst.
ABGESICHERT = {
    'credentials-anzeigen': ('immoMandantSichern',
        'Gibt das ENTSCHLUESSELTE Passwort heraus. Mit einer credential_id '
        'aus dem Koerper waere das der FTP- oder Portalzugang eines fremden '
        'Maklers im Klartext gewesen. Jetzt geprueft, und die Suche ueber '
        'den Dienstnamen haengt am Mandanten des Aufrufers.'),
    'mitarbeiter-loeschen': ('immoMandantSichern',
        'Ein Chef darf seine Leute loeschen — nicht die eines anderen '
        'Hauses. Geprueft werden beide Kennungen: der Geloeschte und der '
        'neue Verantwortliche.'),
    'rechnung-pdf-erzeugen': ('immoMandantSichern',
        'Die Rechnung eines fremden Mandanten als PDF — mit Empfaenger, '
        'Positionen und Betraegen.'),
    'mail-gelesen-setzen': ('immoMandantSichern',
        'Fremde Mails als gelesen markieren.'),
    'mail-anhaenge-extrahieren': ('immoMandantSichern',
        'Anhaenge aus einer fremden Mail auslesen und ablegen.'),
    'eigentuemer-nachricht-senden': ('immoMandantSichern',
        'Eine Nachricht an den Eigentuemer eines fremden Maklers.'),
    'eigentuemer-person-hinzufuegen': ('immoMandantSichern',
        'Eine Person an einem fremden Eigentuemer anlegen — mit Zugang zum '
        'Portal.'),
    'expose-freigabe-erstellen': ('immoMandantSichern',
        'Eine Expose-Freigabe zu einem fremden Objekt, auf einen fremden '
        'Kontakt ausgestellt.'),
    'fahrt-ermitteln': ('aufruferMandant',
        'Der erste Fund dieser Art (29.09.2026). Prueft jetzt erst das '
        'Objekt und den Mandanten, dann den Zwischenspeicher.'),
}

# --- Gelesen und fuer unbedenklich befunden ---------------------------------
UNBEDENKLICH = {}

# --- Gelesen oder erkannt, Befund offen ------------------------------------
# Diese Liste darf kuerzer werden, nie laenger.
NOCH_OFFEN = {
    'akq-automation-lauf': 'lead_id',
    'akq-mail-leads': 'mail_id',
    'akq-wertindikation-pdf': 'lead_id',
    'besichtigung-nachfassen': 'termin_id',
    'bild-beschriften': 'immobilie_id',
    'bild-web-variante': 'immobilie_id, datei_id',
    'eigentuemer-dokument-onedrive-push': 'dokument_id',
    'eigentuemer-dokument-uebernehmen': 'dokument_id, eigentuemer_id',
    'eigentuemer-einladen': 'ansprechpartner_id, maklervertrag_id',
    'eigentuemer-einladung-nachfassen': 'eigentuemer_id',
    'eigentuemer-report-pdf': 'immobilie_id',
    'expose-pdf-erzeugen': 'immobilie_id',
    'expose-pruefen': 'immobilie_id',
    'mail-anfrage-verarbeiten': 'mail_eingang_id',
    'mail-ki-vorschlag': 'immobilie_id',
    'mail-postfach-backfill': 'postfach_id',
    'mail-rechnung-weiterleiten': 'mail_eingang_id',
    'mail-zu-todo': 'mail_id, zustaendig_id',
    'mietvertrag-pdf': 'mietvertrag_id',
    'mitarbeiter-anlegen': 'firma_id',
    'mpe-pdf-erzeugen': 'bewertung_id',
    'newsletter-senden': 'kampagne_id',
    'portal-export': 'immobilie_id',
    'portal-export-homepage': 'immobilie_id',
    'projekt-nachricht-antwort': 'zugang_id',
    'signatur-vorgang-starten': 'vertrag_id',
    'signatur-vorgang-widerrufen': 'vorgang_id',
    'termin-erinnerung': 'termin_id',
    'termin-fahrzeit': 'termin_id, immobilie_id',
    'termin-serie': 'serie_id',
    'vertrag-pdf': 'vertrag_id',
}

# Kennung aus dem Anfragekoerper: body.x_id, body?.x_id, const xId = body...
KENNUNG = re.compile(r'body[\.\?]{1,2}(?:[a-z_]*_)?id\b|body\??\.[a-z_]*_id\b')


def main():
    with open(WURZEL / 'supabase' / 'config.toml', 'rb') as f:
        cfg = tomllib.load(f)['functions']

    betroffen = []
    for name in sorted(cfg):
        if cfg[name].get('verify_jwt') is False:
            continue
        datei = FUNKTIONEN / name / 'index.ts'
        if not datei.is_file():
            continue
        text = datei.read_text(encoding='utf-8')
        if 'SUPABASE_SERVICE_ROLE_KEY' not in text:
            continue
        if not KENNUNG.search(text):
            continue
        betroffen.append(name)

    gefuehrt = set(ABGESICHERT) | set(UNBEDENKLICH) | set(NOCH_OFFEN)
    unbekannt = [n for n in betroffen if n not in gefuehrt]
    verschwunden = [n for n in sorted(gefuehrt) if n not in betroffen]

    # Das Kennzeichen muss wirklich dastehen. Eine Funktion, die als
    # abgesichert gefuehrt wird, ohne dass der Waechter drinsteht, ist die
    # gefaehrlichste Zeile in dieser Datei.
    ohne_kennzeichen = []
    for name, (marke, _) in sorted(ABGESICHERT.items()):
        datei = FUNKTIONEN / name / 'index.ts'
        if not datei.is_file() or marke not in datei.read_text(encoding='utf-8'):
            ohne_kennzeichen.append(f'{name} (erwartet: {marke})')

    print(f'{len(betroffen)} Funktionen mit JWT-Pruefung, service_role '
          f'und einer Kennung aus dem Anfragekoerper:')
    print(f'  abgesichert  {len(ABGESICHERT):4d}')
    print(f'  unbedenklich {len(UNBEDENKLICH):4d}')
    print(f'  noch offen   {len(NOCH_OFFEN):4d}')

    fehler = 0
    if unbekannt:
        print('\n[FEHLER] Nicht gefuehrt — neu dazugekommen oder uebersehen:')
        for n in unbekannt:
            print(f'  {n}')
        fehler = 1
    if verschwunden:
        print('\n[FEHLER] Gefuehrt, aber nicht mehr betroffen. Wurde die '
              'Funktion umgebaut? Dann gehoert der Eintrag hier weg:')
        for n in verschwunden:
            print(f'  {n}')
        fehler = 1
    if ohne_kennzeichen:
        print('\n[FEHLER] Abgesichert gefuehrt, aber das Kennzeichen fehlt:')
        for n in ohne_kennzeichen:
            print(f'  {n}')
        fehler = 1

    if fehler:
        return 1

    if NOCH_OFFEN:
        print(f'\n  NOCH NICHT GEPRUEFT sind {len(NOCH_OFFEN)} angemeldete '
              'Endpunkte. Bekannt und begrenzt — aber vor einem echten '
              'zweiten Mandanten muss die Liste leer sein.')
    print('\n[ok] Kein unbekannter angemeldeter Endpunkt, keine verlorene '
          'Absicherung.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
