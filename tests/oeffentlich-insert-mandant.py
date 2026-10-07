#!/usr/bin/env python3
"""Schreiben die oeffentlichen Endpunkte Zeilen ohne Mandanten?

Achtundzwanzig Edge Functions sind ohne Anmeldung erreichbar UND benutzen den
service_role. Fuer den gilt RLS nicht — sie muessen die Mandantengrenze also
selbst ziehen. tests/funktionen-oeffentlich.py fragt, ob sie beim LESEN
richtig begrenzen. Diese Pruefung fragt das Gegenstueck: ob sie beim
SCHREIBEN sagen, fuer wen.

WARUM DAS EIN FEHLER IST, DER SICH VERSTECKT: mandant_id traegt in fast jeder
fachlichen Tabelle den Standardwert aktuelle_mandant_id(). Der liest den
Mandanten aus dem Anmelde-Token. Ein Aufruf ohne Token hat keinen — der
Standard ist dann NULL, und die Zeile entsteht ohne Mandanten. Die
restriktive Richtlinie aus fork_07 vergleicht mandant_id mit dem Mandanten
des Lesers; NULL ist mit nichts gleich. Die Zeile ist damit fuer JEDEN
unsichtbar.

Es gibt keine Fehlermeldung. Der Interessent stellt seine Frage auf der
Objektseite, die Zeile entsteht, und kein Makler sieht sie je. Genau so ein
Befund war am 28.09.2026 der Anlass: 47 Einfuegungen in 18 Funktionen, alle
in Tabellen der Gruppe MANDANT, keine einzige mit mandant_id.

Rot wird es nur bei einer Verschlechterung: eine Fundstelle, die nicht im
Buch steht. Die Liste darf nur kuerzer werden.

NICHT GEPRUEFT: ob der gesetzte Mandant auch der richtige ist. Dass eine
Funktion mandant_id mitgibt, heisst hier nur, dass sie es tut — ob sie ihn
aus der richtigen Quelle nimmt, sagt nur das Lesen des Quelltextes.
"""
import pathlib, re, sys, tomllib

WURZEL = pathlib.Path(__file__).resolve().parent.parent
FUNKTIONEN = WURZEL / 'supabase' / 'functions'

# Tabellen der Gruppe DIENST: sie tragen keinen Mandanten und sollen keinen
# tragen. Wer eine hinzufuegt, traegt sie hier ein UND in
# public.mandanten_einstufung — die Datenbank ist die Wahrheit, diese Liste
# nur die Abschrift fuer eine Pruefung, die ohne Datenbank laeuft.
OHNE_MANDANT = {
    'storage_umzug_token', 'mandanten', 'mandanten_einstufung',
    'schema_migrations', 'fehler_protokoll',
    # fork_47: ein Stripe-Ereignis gehoert keinem Mandanten. Es KANN mehrere
    # betreffen, und seine Kennung ist der Primaerschluessel — genau das ist
    # die Sperre gegen Doppelverarbeitung. Eine Mandantenspalte waere hier
    # nicht nur ueberfluessig, sondern irrefuehrend: sie saehe aus wie eine
    # Grenze und waere keine. Die Tabelle ist als DIENST eingestuft und hat
    # fuer Angemeldete keine einzige Richtlinie.
    'stripe_ereignisse',
    # fork_74: Summen des Stripe-Abgleichs ueber ALLE Mandanten; GLOBAL, nur Betreiber lesen.
    'stripe_abgleich',
}

# Tabellen, deren Mandant seit fork_22 aus dem Elternsatz kommt: ein
# BEFORE-INSERT-Wachposten fuellt mandant_id, wenn sie leer ist. Fuer sie ist
# eine Einfuegung ohne mandant_id kein Fehler mehr — die Angabe steht schon
# im Elternsatz, und der Trigger kann sie nicht vergessen, ein Aufrufer
# schon.
#
# Dass er wirklich haengt und wirklich fuellt, prueft tests/
# mandant-aus-eltern.sql gegen eine echte Datenbank. Diese Liste hier ist nur
# die Abschrift, damit die Dateiprueefung ohne Datenbank auskommt — laufen
# beide auseinander, faellt es dort auf, wo es zaehlt.
DURCH_TRIGGER = {
    'projekt_zugaenge', 'projekt_aktivitaeten', 'projekt_anfragen',
    'projekt_maengel', 'projekt_nachrichten', 'projekt_merkliste',
    'projekt_kunden_dateien',
    'expose_freigaben', 'landing_fragen', 'landing_besichtigungswuensche',
    'landing_faq',
    'newsletter_anmeldungen', 'ki_bildbearbeitung_log', 'push_log',
    'vermerke', 'mail_versendet',
    # fork_27 nachgezogen: die Aktivitaet ueber Eigentuemer, Vertrag oder
    # Empfaenger (in dieser Reihenfolge), die Datei ueber ihre Immobilie.
    'aktivitaeten', 'immobilie_datei',
}

# Wie weit hinter dem .insert( noch nach mandant_id gesucht wird. Grosszuegig
# genug fuer die langen Objektliterale der Vorlage, eng genug, dass nicht das
# mandant_id des naechsten Aufrufs mitgezaehlt wird.
FENSTER = 400

# insert UND upsert. Der zweite war in der ersten Fassung nicht dabei — und
# genau so eine Stelle stand in projekt-interaktion: die Merkliste legt ihre
# Zeile per upsert an, also ebenso ohne Mandanten.
MUSTER = re.compile(r'\.from\(\s*"([a-z0-9_]+)"\s*\)\s*(?:\.[a-z]+\([^)]*\)\s*)*?\.(?:insert|upsert)\(', re.S)

# --- Gelesen, Befund offen. Die Liste darf nur kuerzer werden. -------------
# Schluessel ist Funktion -> Menge der Tabellen, in die sie ohne Mandanten
# schreibt. Wer eine Fundstelle schliesst, streicht sie hier.
# Leer — und das soll so bleiben. Am 28.09.2026 standen hier siebenundvierzig
# Fundstellen; sechzehn hat der Wachposten aus fork_22 uebernommen, zwei mehr
# fork_27, der Rest steht im Quelltext. Jede neue Fundstelle macht das Gate
# jetzt rot, nicht nur die Liste laenger.
NOCH_OFFEN = {}


def fundstellen():
    with open(WURZEL / 'supabase' / 'config.toml', 'rb') as f:
        cfg = tomllib.load(f)['functions']
    offen, gut = {}, 0
    for d in sorted(FUNKTIONEN.iterdir()):
        if not d.is_dir():
            continue
        if cfg.get(d.name, {}).get('verify_jwt', True):
            continue
        quelle = (d / 'index.ts').read_text(encoding='utf-8')
        if 'SERVICE_ROLE_KEY' not in quelle:
            continue
        for m in MUSTER.finditer(quelle):
            tabelle = m.group(1)
            if tabelle in OHNE_MANDANT or tabelle in DURCH_TRIGGER:
                continue
            if 'mandant_id' in quelle[m.end():m.end() + FENSTER]:
                gut += 1
            else:
                offen.setdefault(d.name, set()).add(tabelle)
    return offen, gut


def main():
    offen, gut = fundstellen()
    gesamt_offen = sum(len(t) for t in offen.values())
    print(f'Einfuegungen in oeffentlichen Endpunkten: {gut} mit Mandant, '
          f'{gesamt_offen} ohne (in {len(offen)} Funktionen).')

    neu = []
    for fn, tabellen in sorted(offen.items()):
        for t in sorted(tabellen - NOCH_OFFEN.get(fn, set())):
            neu.append(f'{fn} -> {t}')
    weg = []
    for fn, tabellen in sorted(NOCH_OFFEN.items()):
        for t in sorted(tabellen - offen.get(fn, set())):
            weg.append(f'{fn} -> {t}')

    if weg:
        print('\n  Geschlossen seit dem letzten Stand — bitte aus NOCH_OFFEN streichen:')
        for z in weg:
            print(f'    {z}')

    if neu:
        print(f'\n[FEHLER] {len(neu)} neue Stelle(n) schreiben ohne Mandanten:')
        for z in neu:
            print(f'    {z}')
        print('\n  Eine Zeile ohne mandant_id ist fuer jeden unsichtbar — die')
        print('  restriktive Richtlinie vergleicht, und NULL ist mit nichts gleich.')
        print('  Den Mandanten aus der Quelle des Vorgangs setzen (Objekt, Token,')
        print('  Einladung, Projekt), nicht aus dem Standardwert der Spalte.')
        return 1

    if gesamt_offen:
        print(f'\n  NOCH OHNE MANDANTEN sind {gesamt_offen} Einfuegungen. Das Gate ist')
        print('  deshalb nicht rot — die Liste ist bekannt und begrenzt —, aber vor')
        print('  Gate 2 muss sie leer sein.')
    else:
        print('\n  Keine einzige Einfuegung ohne Mandanten. Fuer Gate 2 ist dieser')
        print('  Punkt damit erfuellt.')
    print('\n[ok] Keine neue Einfuegung ohne Mandanten.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
