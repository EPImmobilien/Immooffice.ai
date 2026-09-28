#!/usr/bin/env python3
"""Welche Edge Function ist ohne Anmeldung erreichbar — und kennt sie ihren Mandanten?

30 der 139 Funktionen sind ohne JWT erreichbar UND benutzen den service_role.
Fuer den gilt RLS nicht; sie muessen die Mandantengrenze also selbst ziehen.
oeffentliche-objekte tat es nicht und lieferte die Objekte aller Mandanten an
jeden — siehe docs/ENTSCHEIDUNGEN.md.

Dieses Skript ist ein BUCH, kein Urteil. Es kann nicht entscheiden, ob eine
Funktion die Grenze richtig zieht; das muss ein Mensch lesen. Was es kann:
festhalten, welche gelesen worden sind, und Alarm schlagen, wenn eine neue
dazukommt oder eine gepruefte ihre Absicherung wieder verliert.

Rot wird es nur bei einer Verschlechterung:
  - eine Funktion ohne JWT, die weder geprueft noch als offen vermerkt ist
  - eine als abgesichert gefuehrte Funktion ohne ihr Kennzeichen im Quelltext

Die offene Liste darf nur kuerzer werden, nie laenger.
"""
import pathlib, sys, tomllib

WURZEL = pathlib.Path(__file__).resolve().parent.parent
FUNKTIONEN = WURZEL / 'supabase' / 'functions'

# --- Gelesen und abgesichert: der Quelltext muss das Kennzeichen enthalten ---
ABGESICHERT = {
    'oeffentliche-objekte': ('immoMandantAusAnfrage',
        'Liefert die Objektliste. Filtert beide Quellen auf den Mandanten aus '
        'der Anfrage; ohne eindeutigen Mandanten antwortet sie mit 400.'),
    'energieausweis-anfrage': ('mandanten',
        'Oeffentliches Formular. Nimmt den Mandanten aus dem Formularfeld und '
        'faellt nur bei genau einem Mandanten zurueck.'),
    'bild-empfang': ('immoSetzeMandant',
        'Schreibt Bilder; Mandant aus der Ziel-Immobilie.'),
    'mail-anhaenge-diagnose': ('immoSetzeMandant',
        'Schreibt Dateien; Mandant aus Immobilie beziehungsweise Dateisatz.'),
    'signatur-unterschreiben': ('immoSetzeMandant',
        'Mandant aus dem Signaturvorgang, den der Token benennt.'),
    'objekt-landing': ('immoStandortDesObjekts',
        'Oeffentliche Objektseite. Impressum, Absenderadresse und neue '
        'Interessentenkontakte kommen aus dem Mandanten DES OBJEKTS, nicht '
        'ueber einen festen Slug.'),
    'akq-lead-eingang': ('immoMandantAusAnfrage',
        'Eingang der Akquise. Postfach, Quelle, Pipeline, zustaendiger Makler '
        'und beide inserts sind auf den Mandanten aus der Anfrage begrenzt.'),
    'expose-freigabe': ('im?.mandant_id',
        'Alles haengt am Objekt der Freigabe: Impressum, die Vorgabe der '
        'Objektseite, die Suche nach dem Kontakt, die Newsletter-Anmeldung '
        'und die Zustimmung am Kontakt. Vorher liefen fuenf davon ueber den '
        'Slug "standard" oder ueber die E-Mail-Adresse — beides gibt es bei '
        'mehreren Maklern.'),
    'web-lead': ('immoMandantAusAnfrage',
        'Eingang fuer Bewertungsanfragen. Mandant aus der Anfrage, Chef und '
        'Empfaenger aus dem Mandanten; Kontaktsuche und beide inserts sind '
        'auf ihn begrenzt. Die fest eingebaute Benutzerkennung der Referenz '
        'ist entfallen.'),
}

# --- Gelesen und fuer unbedenklich befunden, ohne Aenderung ---
UNBEDENKLICH = {
    'newsletter-abmelden':
        'Arbeitet allein ueber den Abmelde-Token. Der Token IST der Nachweis; '
        'er benennt genau eine Anmeldung, und mehr passiert nicht.',
    'rundgang-oeffentlich':
        'Laedt den Rundgang ueber share_token; alles Weitere haengt an dieser '
        'einen Zeile. Der Token IST der Nachweis, und er benennt genau einen '
        'Rundgang.',
    'bewerbertest-abrufen':
        'Laedt die Einladung ueber ihren Token und liefert den Namen des '
        'Kandidaten plus einen festen Fragenkatalog. Keine Abfrage, die ueber '
        'diese eine Zeile hinausgeht.',
}

# --- Gelesen, Befund offen, noch nicht abgesichert -------------------------
# Diese Liste darf kuerzer werden, nie laenger. Wer eine Funktion absichert,
# traegt sie oben ein und streicht sie hier.
NOCH_OFFEN = {
    # Gelesen: laedt die Einladung ueber ihren Token, schreibt die Antworten
    # mit deren Mandanten. Was noch fehlt, ist die Gegenprobe, dass die
    # KI-Auswertung keine fremden Daten mitschickt.
    'bewerbertest-abgeben': 'Token-gebunden; KI-Auswertung ungelesen.',
    'eigentuemer-benachrichtigungen-versenden': 'Versendet aus einer Warteschlange ohne mandant_id.',
    'eigentuemer-zugang-anfordern': 'Legt Zugaenge an.',
    'ki-bildbearbeitung': 'Schreibt Bilder, 44 kB, ungelesen.',
    'news-briefing-erstellen': 'Erzeugt Briefings.',
    'portal-ftp-diagnose': 'Diagnose.',
    # Neubauportal. Der Postfach-Griff ist geschlossen (28.09.2026): die
    # drei versendenden Funktionen nehmen das Postfach des eigenen
    # Mandanten oder gar keines. Offen bleibt der Zugang ueber den Slug —
    # seit fork_17 ist er nur noch JE MANDANT eindeutig, und die
    # oeffentliche Projektadresse traegt nichts Mandantenspezifisches.
    # Zwei Bautraeger mit einem Projekt "am-park" waeren nicht zu
    # unterscheiden. Steht in tests/mandant-nachzug.py.
    'projekt-daten': 'Neubauportal; Zugang ueber den Slug ungeklaert.',
    'projekt-interaktion': 'Neubauportal; Zugang ueber den Slug ungeklaert.',
    'projekt-login': 'Neubauportal, Anmeldung; Zugang ueber den Slug ungeklaert.',
    'projekt-upload': 'Neubauportal, Dateien; Postfach begrenzt.',
    'projekt-wohnungen': 'Neubauportal.',
    'push-antworten': 'Push.',
    'push-senden': 'Push — verschickt an Geraete.',
    'signatur-token-validieren': 'Token-gebunden, aber ungelesen.',
    'suchkriterien-newsletter': 'Verschickt Newsletter — nach fork_16 gepruefte '
                                'Quelle, der Versandweg selbst aber ungelesen.',
    'upload-benachrichtigung-versenden': 'Versendet Benachrichtigungen.',
}


def main():
    with open(WURZEL / 'supabase' / 'config.toml', 'rb') as f:
        cfg = tomllib.load(f)['functions']

    ohne_jwt = []
    for d in sorted(FUNKTIONEN.iterdir()):
        if not d.is_dir():
            continue
        quelle = (d / 'index.ts').read_text(encoding='utf-8')
        if cfg.get(d.name, {}).get('verify_jwt', True):
            continue
        if 'SERVICE_ROLE_KEY' not in quelle:
            continue
        ohne_jwt.append((d.name, quelle))

    bekannt = set(ABGESICHERT) | set(UNBEDENKLICH) | set(NOCH_OFFEN)
    neu = sorted(n for n, _ in ohne_jwt if n not in bekannt)
    verschwunden = sorted(bekannt - {n for n, _ in ohne_jwt})

    verloren = []
    for name, quelle in ohne_jwt:
        if name in ABGESICHERT and ABGESICHERT[name][0] not in quelle:
            verloren.append(f'{name} (erwartet: {ABGESICHERT[name][0]})')

    print(f'{len(ohne_jwt)} Funktionen ohne JWT-Pruefung und mit service_role:')
    print(f'  abgesichert   {len(ABGESICHERT):3d}')
    print(f'  unbedenklich  {len(UNBEDENKLICH):3d}')
    print(f'  noch offen    {len(NOCH_OFFEN):3d}')

    schlecht = False
    if neu:
        print(f'\n[FEHLER] {len(neu)} Funktion(en) ohne JWT sind in keiner Liste. '
              f'Erst lesen, dann eintragen: {", ".join(neu)}')
        schlecht = True
    if verloren:
        print(f'\n[FEHLER] Abgesichert gefuehrt, aber das Kennzeichen fehlt: '
              f'{", ".join(verloren)}')
        schlecht = True
    if verschwunden:
        print(f'\n  Hinweis: in keiner Funktion mehr gefunden — Eintrag veraltet? '
              f'{", ".join(verschwunden)}')

    if schlecht:
        return 1
    if NOCH_OFFEN:
        print(f'\n  NOCH NICHT ABGESICHERT sind {len(NOCH_OFFEN)} oeffentliche '
              f'Endpunkte. Das Gate ist deshalb nicht rot — die Liste ist '
              f'bekannt und begrenzt —, aber vor Gate 2 muss sie leer sein.')
    print('\n[ok] Kein unbekannter oeffentlicher Endpunkt, keine verlorene Absicherung.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
