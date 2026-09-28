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
}

# --- Gelesen und fuer unbedenklich befunden, ohne Aenderung ---
UNBEDENKLICH = {
    'newsletter-abmelden':
        'Arbeitet allein ueber den Abmelde-Token. Der Token IST der Nachweis; '
        'er benennt genau eine Anmeldung, und mehr passiert nicht.',
}

# --- Gelesen, Befund offen, noch nicht abgesichert -------------------------
# Diese Liste darf kuerzer werden, nie laenger. Wer eine Funktion absichert,
# traegt sie oben ein und streicht sie hier.
NOCH_OFFEN = {
    'akq-lead-eingang': 'Nimmt Leads entgegen — welchem Mandanten gehoeren sie?',
    'bewerbertest-abgeben': 'Bewerbertest, Zuordnung ungeprueft.',
    'bewerbertest-abrufen': 'Bewerbertest, Zuordnung ungeprueft.',
    'eigentuemer-benachrichtigungen-versenden': 'Versendet aus einer Warteschlange ohne mandant_id.',
    'eigentuemer-zugang-anfordern': 'Legt Zugaenge an.',
    'expose-freigabe': 'Gibt Exposes frei; Token-gebunden, aber ungelesen.',
    'ki-bildbearbeitung': 'Schreibt Bilder, 44 kB, ungelesen.',
    'news-briefing-erstellen': 'Erzeugt Briefings.',
    'objekt-landing': 'Oeffentliche Objektseite, 54 kB, ungelesen.',
    'onoffice-expose-abgleich': 'Fremdanbindung.',
    'onoffice-suchkriterien': 'Fremdanbindung.',
    'portal-ftp-diagnose': 'Diagnose.',
    'projekt-daten': 'Neubauportal.',
    'projekt-interaktion': 'Neubauportal.',
    'projekt-login': 'Neubauportal, Anmeldung.',
    'projekt-upload': 'Neubauportal, Dateien.',
    'projekt-wohnungen': 'Neubauportal.',
    'push-antworten': 'Push.',
    'push-senden': 'Push — verschickt an Geraete.',
    'rundgang-oeffentlich': 'Oeffentlicher Rundgang.',
    'signatur-token-validieren': 'Token-gebunden, aber ungelesen.',
    'suchkriterien-newsletter': 'Verschickt Newsletter — nach fork_16 gepruefte '
                                'Quelle, der Versandweg selbst aber ungelesen.',
    'upload-benachrichtigung-versenden': 'Versendet Benachrichtigungen.',
    'web-lead': 'Nimmt Leads von der Webseite entgegen.',
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
