#!/usr/bin/env python3
"""Suchen die Edge Functions noch ueber Namen, die nur global eindeutig waren?

fork_17 hat zehn Eindeutigkeitsregeln von global auf "je Mandant" umgestellt.
Richtig so — sonst kann der zweite Mandant keinen Standort "standard", keine
Quelle "website" und keine Rechnungsnummer "RE-2026-001" haben.

Die Folge: Jede Abfrage, die sich auf die GLOBALE Eindeutigkeit verlassen hat,
ist seitdem zweideutig. `.eq("slug", s).maybeSingle()` traf vorher genau eine
Zeile; ab dem zweiten Mandanten trifft sie zwei, und maybeSingle() bricht ab.

Mit EINEM Mandanten merkt man davon nichts — deshalb dieses Buch. Es faengt
den Fall ab, der sonst erst beim zweiten Mandanten auffaellt, und zwar als
Fehlermeldung, die nichts erklaert.

Rot wird es nur bei einer Verschlechterung: eine neue Fundstelle, die nicht
im Buch steht. Die Liste darf nur kuerzer werden.
"""
import pathlib, re, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
FUNKTIONEN = WURZEL / 'supabase' / 'functions'

# Tabelle -> Spalten, die seit fork_17 nur noch je Mandant eindeutig sind.
BETROFFEN = {
    'projekte': ['slug'],
    'firma_stammdaten': ['slug'],
    'akq_quellen': ['slug'],
    'checkliste_vorlagen': ['name'],
    'portal_zugaenge': ['portal'],
    'external_credentials': ['service'],
    'firma_kennzahlen': ['jahr'],
    'news_briefings': ['briefing_datum'],
    'liquid_kategorisierung': ['match_key'],
    'rechnungen': ['rechnungsnummer'],
}

# Eine Fundstelle gilt als abgesichert, wenn im selben Aufruf eine
# Mandantenbedingung steht.
ABSICHERUNG = re.compile(r'\.eq\("mandant_id"|mandant_id:|immoStandortDesObjekts')

# Gelesen, Befund offen. Die Liste darf nur kuerzer werden.
NOCH_OFFEN = {
    'brief-pdf-erzeugen', 'credentials-speichern',
    'expose-erinnerung', 'expose-freigabe', 'expose-pdf-erzeugen',
    'news-briefing-erstellen', 'portal-export', 'portal-export-homepage',
    'portal-ftp-diagnose', 'projekt-daten', 'projekt-interaktion',
    'projekt-login', 'reservierung-pdf-erzeugen', 'reservierung-word-erzeugen',
    'signatur-vorgang-starten',
}


def fundstellen():
    """Alle Aufrufe, die ueber eine der betroffenen Spalten suchen."""
    treffer = {}
    for d in sorted(FUNKTIONEN.iterdir()):
        if not d.is_dir():
            continue
        quelle = (d / 'index.ts').read_text(encoding='utf-8')
        for tabelle, spalten in BETROFFEN.items():
            for spalte in spalten:
                # Der Aufruf reicht von .from("tabelle") bis zum naechsten
                # Semikolon; darin muss die Spalte und darf keine
                # Mandantenbedingung fehlen.
                for m in re.finditer(r'\.from\("' + tabelle + r'"\)((?:[^;]|\n){0,400}?);', quelle):
                    rest = m.group(1)
                    if f'.eq("{spalte}"' not in rest:
                        continue
                    if ABSICHERUNG.search(rest):
                        continue
                    treffer.setdefault(d.name, []).append(f'{tabelle}.{spalte}')
    return treffer


def main():
    treffer = fundstellen()
    neu = sorted(set(treffer) - NOCH_OFFEN)
    weg = sorted(NOCH_OFFEN - set(treffer))

    print(f'{len(treffer)} Funktion(en) suchen ueber einen Namen, der seit fork_17 '
          f'nur je Mandant eindeutig ist:')
    for name in sorted(treffer):
        marke = ' ' if name in NOCH_OFFEN else '!'
        print(f'  {marke} {name:34s} {", ".join(sorted(set(treffer[name])))}')

    if neu:
        print(f'\n[FEHLER] {len(neu)} Fundstelle(n) stehen nicht im Buch. '
              f'Erst lesen, dann eintragen oder absichern: {", ".join(neu)}')
        return 1
    if weg:
        print(f'\n  Erledigt seit dem letzten Stand: {", ".join(weg)} — '
              f'bitte aus NOCH_OFFEN streichen.')
    print(f'\n  Mit EINEM Mandanten faellt davon nichts auf. Vor Gate 2 muss '
          f'die Liste leer sein.')
    print('\n[ok] Keine unbekannte Fundstelle.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
