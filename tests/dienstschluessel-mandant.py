#!/usr/bin/env python3
"""Liest eine Edge Function unter dem Dienstschluessel irgendwo "die erste
Zeile" einer Mandantentabelle, ohne zu sagen, welchem Mandanten sie gehoeren
soll?

WARUM ES DIESE PRUEFUNG GIBT — und warum die bisherigen sie nicht ersetzen:

`tests/mandant-rundumschlag.sql` weist die Trennung in der DATENBANK nach: 159
Tabellen, kein fremder Satz sichtbar. Dieser Nachweis gilt fuer RLS — also
fuer jeden Weg, der mit dem Token eines angemeldeten Nutzers laeuft.

Die Edge Functions laufen nicht so. Sie arbeiten mit
`SUPABASE_SERVICE_ROLE_KEY`, und fuer den gilt RLS *nicht*. Jede Abfrage einer
Edge Function sieht die Tabelle vollstaendig, ueber alle Mandanten. Was den
Mandanten dort zieht, ist nicht die Datenbank, sondern die Bedingung in der
Abfrage — und wenn keine dort steht, liefert `.limit(1)` einfach die erste
Zeile, die die Datenbank findet.

In der Vorlage war das richtig: es gab genau einen Mandanten, "das erste
aktive Postfach" war *das* Postfach. Im Fork ist derselbe Satz Quelltext ein
Mandantenwechsel — und zwar einer, den niemand bemerkt, weil nichts
fehlschlaegt. Die Mail geht raus, nur eben ueber das Postfach eines fremden
Maklers, mit dessen Absender und dessen entschluesseltem SMTP-Passwort.

Diese Pruefung findet solche Stellen und haelt sie fest. Sie ist eine
Buchfuehrung, keine Schranke: manche dieser Abfragen SOLLEN ueber alle
Mandanten gehen — ein Cron-Lauf hat keinen Mandanten, und ein oeffentlicher
Endpunkt mit einem unerratbaren Token identifiziert seine Zeile ueber genau
dieses Token. Jeder solche Fall steht unten namentlich, mit Grund. Kommt eine
Stelle hinzu, die dort nicht steht, schlaegt die Pruefung an.

WAS ALS EINSCHRAENKUNG ZAEHLT: eine Bedingung auf `mandant_id` (direkt), oder
eine auf einen Schluessel, der selbst an einem Mandanten haengt — `id`,
`*_id`, `slug`, `*_token`. Ueber einen solchen Schluessel ist die Grenze
mittelbar gezogen, sofern der Satz, aus dem er kommt, schon geprueft ist.

Eine E-MAIL-ADRESSE zaehlt ausdruecklich NICHT dazu, obwohl sie aussieht wie
ein Schluessel. Zwei Makler koennen denselben Interessenten haben; eine
Zuordnung "Kontakt mit dieser Adresse" findet dann den des anderen. Genau
dieser Fall ist im Buch unten mehrfach als OFFEN verzeichnet.

Bedingungen auf `aktiv`, `typ`, `status` und dergleichen zaehlen ebenfalls
nicht: sie schraenken die Auswahl ein, aber nicht auf einen Mandanten.
"""
import re
import sys
from collections import Counter
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
FUNKTIONEN = WURZEL / 'supabase' / 'functions'

# Wie weit eine Abfragekette hoechstens reicht. Die laengste in der Vorlage
# (suchkriterien-newsletter) braucht rund 700 Zeichen.
FENSTER = 900

# Spalten, ueber die die Mandantengrenze mittelbar gezogen ist.
SCHLUESSEL = re.compile(r'^(id|slug|token|.*_id|.*_token)$')

# Bedingungen, die nur die Auswahl verkleinern, nicht den Mandanten bestimmen.
# Nur zur Ausgabe — die Entscheidung faellt ueber SCHLUESSEL.
BEIWERK = {'aktiv', 'typ', 'status', 'rolle', 'role', 'portal', 'schluessel',
           'ordner', 'ganztags', 'sortierung', 'reihenfolge', 'ist_standard'}


def mandantentabellen():
    """Jede Tabelle mit mandant_id — aus den Migrationen, nicht aus dem Netz.

    Die Pruefung muss ohne Datenbankzugang laufen; `npm run check` hat keinen.
    """
    namen = set()
    muster = re.compile(
        r'alter table (?:only )?(?:public\.)?(\w+)\s+add column if not exists mandant_id'
        r'|alter table (?:only )?(?:public\.)?(\w+)\s+add mandant_id'
        r"\('(\w+)','(?:GRENZE|KIND)'")
    for p in sorted((WURZEL / 'supabase' / 'migrations').glob('*.sql')):
        t = p.read_text(encoding='utf-8')
        for m in muster.finditer(t):
            namen.add(next(g for g in m.groups() if g))
        # fork_05 zieht mandant_id in einem Rutsch nach: "for t in (…)"
        for m in re.finditer(r"add column if not exists mandant_id", t):
            pass
    return namen


def tabellen_aus_liste():
    """Rueckfall und Wahrheit: die Liste liegt im Repository.

    Sie entstand am 30.09.2026 aus `information_schema.columns` des eigenen
    Projekts (179 Tabellen mit mandant_id). Sie liegt als Datei bei, damit die
    Pruefung ohne Netz laeuft; `tests/mandant-nachzug.py` haelt sie aktuell.
    """
    p = WURZEL / 'tests' / 'mandantentabellen.txt'
    if not p.exists():
        return set()
    return {z.strip() for z in p.read_text(encoding='utf-8').splitlines()
            if z.strip() and not z.startswith('#')}


def kette(text, start):
    """Die Abfragekette ab `.from(` bis zum abschliessenden Semikolon."""
    tief = 0
    for i in range(start, min(len(text), start + FENSTER)):
        c = text[i]
        if c in '([{':
            tief += 1
        elif c in ')]}':
            tief -= 1
        elif c == ';' and tief <= 0:
            return text[start:i]
    return text[start:start + FENSTER]


def finde(tabellen):
    """Jede Leseabfrage auf eine Mandantentabelle ohne Mandantenbezug."""
    treffer = []
    for p in sorted(FUNKTIONEN.rglob('*.ts')):
        t = p.read_text(encoding='utf-8')
        # Nur Funktionen, die ueberhaupt mit dem Dienstschluessel arbeiten.
        if 'SERVICE_ROLE' not in t:
            continue
        for m in re.finditer(r'\.from\("([a-z_]+)"\)', t):
            tab = m.group(1)
            if tab not in tabellen:
                continue
            k = ' '.join(kette(t, m.start()).split())
            if re.search(r'\.insert\(|\.update\(|\.upsert\(|\.delete\(', k):
                continue          # Schreiben prueft tests/oeffentlich-insert-mandant.py
            # storage.from("eimer") heisst genauso wie from("tabelle"). Die
            # Storage-Pfade regelt die Huelle aus fork_09, geprueft in
            # tests/storage-huelle.js — hier waeren sie Fehlalarm.
            if re.search(r'\.download\(|\.upload\(|\.createSignedUrl\(|'
                         r'\.getPublicUrl\(|\.remove\(|\.copy\(|\.move\(', k):
                continue
            if 'mandant_id' in k:
                continue
            spalten = re.findall(
                r'\.(?:eq|in|is|not|filter|match|contains|ilike|like|or)\("([a-z_]+)"', k)
            if any(SCHLUESSEL.match(c) for c in spalten):
                continue          # mittelbar ueber einen mandantengebundenen Schluessel
            treffer.append({
                'datei': str(p.relative_to(FUNKTIONEN)),
                'funktion': p.parent.name,
                'zeile': t.count('\n', 0, m.start()) + 1,
                'tabelle': tab,
                'filter': sorted(set(spalten)),
                'kette': k[:120],
            })
    return treffer


# ---------------------------------------------------------------------------
# Das Buch. Jede Zeile: (Funktion, Tabelle) -> (Anzahl, Einstufung, Grund).
#
# BEABSICHTIGT  Die Abfrage soll ueber alle Mandanten gehen. Ein Cron-Lauf hat
#               keinen Mandanten; er liest die Warteschlange und arbeitet
#               danach je Zeile im Mandanten dieser Zeile weiter.
# TOKEN         Ein oeffentlicher Endpunkt bestimmt seine Zeile ueber ein
#               unerratbares Token. Das Token IST die Grenze.
# OFFEN         Echte Fundstelle, noch nicht behoben. Mit Wirkung.
#
# Stand 30.09.2026.
BUCH = {
    # --- BEABSICHTIGT: Cron-Laeufe und Warteschlangen ---------------------
    # Ein Cron hat keinen Mandanten. Er liest die Warteschlange ueber alle
    # Mandanten und arbeitet danach je Zeile im Mandanten DIESER Zeile
    # weiter — die Bauform aus Phase 2 ("ein Lauf je Mandant").
    ('akq-automation-lauf', 'akq_automation_lauf'):
        (1, 'BEABSICHTIGT', 'faellige Schritte aller Mandanten, danach je Lead weiter'),
    ('akq-mail-leads', 'akq_mail_leads'):
        (1, 'BEABSICHTIGT', 'Liste der schon verarbeiteten Mails, nur zum Ausschliessen'),
    ('akq-mail-leads', 'akq_mail_regeln'):
        (1, 'BEABSICHTIGT', 'in einem Zug gelesen, aber je Mail auf r.mandant_id === m.mandant_id '
                            'eingeschraenkt — nachgezogen am 30.09.2026'),
    ('bild-web-variante', 'immobilien'):
        (1, 'BEABSICHTIGT', 'Nachtlauf: Web-Varianten fuer die Bilder aller Mandanten'),
    ('bild-web-variante', 'immobilie_datei'):
        (2, 'BEABSICHTIGT', 'wie oben, die Dateien dazu'),
    ('expose-erinnerung', 'expose_freigaben'):
        (1, 'BEABSICHTIGT', 'faellige Erinnerungen aller Mandanten'),
    ('mail-anfrage-verarbeiten', 'mail_eingang'):
        (1, 'BEABSICHTIGT', 'unbearbeitete Mails aller Postfaecher; die Mail traegt ihren Mandanten'),
    ('mail-postfach-pull', 'mail_postfaecher'):
        (1, 'BEABSICHTIGT', 'holt je Postfach ab; die Liste MUSS alle umfassen'),
    ('mail-rechnung-weiterleiten', 'mail_eingang'):
        (1, 'BEABSICHTIGT', 'wie oben, fuer Rechnungsmails'),
    ('objekt-landing', 'landing_fragen'):
        (1, 'BEABSICHTIGT', 'offene Fragen aller Mandanten, Weiterleitung je Frage'),
    ('projekt-datei-benachrichtigung', 'projekt_dateien'):
        (1, 'BEABSICHTIGT', 'freigegebene Dateien aller Mandanten, Versand je Projekt'),
    ('projekt-datei-benachrichtigung', 'projekt_updates'):
        (1, 'BEABSICHTIGT', 'wie oben, fuer Bauupdates'),
    ('upload-benachrichtigung-versenden', 'upload_benachrichtigungen'):
        (1, 'BEABSICHTIGT', 'Warteschlange aller Mandanten; die Zeile traegt mandant_id'),
    ('upload_benachrichtigung_planen', 'upload_benachrichtigungen'):
        (1, 'BEABSICHTIGT', 'wie oben'),

    # --- MISSBRAUCH: die Sperre muss ueber alle Mandanten gelten ----------
    # Eine Sperre je Mandant waere keine: wer sie umgehen will, nimmt den
    # naechsten Mandanten. Diese Abfragen zaehlen deshalb absichtlich
    # plattformweit — und lesen nur eine Anzahl, keine Inhalte.
    ('akq-lead-eingang', 'akq_eingang_log'):
        (2, 'MISSBRAUCH', 'Drosselung nach IP und Adresse, plattformweit gezaehlt'),
    ('energieausweis-anfrage', 'energieausweis_anfragen'):
        (1, 'MISSBRAUCH', 'wie oben, fuer das Energieausweis-Formular'),
    ('eigentuemer-zugang-anfordern', 'mail_versendet'):
        (1, 'MISSBRAUCH', 'verhindert, dieselbe Mail mehrfach anzufordern'),

    # --- KONTO: die Adresse fuehrt zum Konto, das Konto zum Mandanten -----
    ('eigentuemer-zugang-anfordern', 'profiles'):
        (1, 'KONTO', 'oeffentlicher Endpunkt: ein Konto gibt es je Adresse genau einmal. '
                     'Gesucht wird deshalb erst das KONTO, und aus ihm folgt der Mandant — '
                     'so steht es seit Phase 2 im Quelltext, und so ist es richtig'),
    ('news-briefing-erstellen', 'news_briefings'):
        (1, 'KONTO', 'zaehlt die Briefings des Tages und vergleicht mit der Zahl der '
                     'Mandanten. Der Vergleich MUSS plattformweit sein, sonst laeuft '
                     'der Cron je Mandant erneut durch'),
}


def main():
    tabellen = tabellen_aus_liste()
    if not tabellen:
        print('  [FEHLER] tests/mandantentabellen.txt fehlt — ohne die Liste '
              'weiss die Pruefung nicht, welche Tabelle mandantenpflichtig ist.')
        return 1

    treffer = finde(tabellen)
    gezaehlt = Counter((t['funktion'], t['tabelle']) for t in treffer)

    neu, gewachsen, verschwunden = [], [], []
    for schluessel, n in sorted(gezaehlt.items()):
        if schluessel not in BUCH:
            neu.append((schluessel, n))
        elif n > BUCH[schluessel][0]:
            gewachsen.append((schluessel, BUCH[schluessel][0], n))
    for schluessel in sorted(BUCH):
        if schluessel not in gezaehlt:
            verschwunden.append(schluessel)

    nach_art = Counter(BUCH[s][1] for s in gezaehlt if s in BUCH)
    print(f'  {len(treffer)} Leseabfragen auf Mandantentabellen ohne Mandantenbezug, '
          f'in {len(gezaehlt)} Funktion/Tabelle-Paaren:')
    for art in sorted({BUCH[s][1] for s in gezaehlt if s in BUCH}):
        anzahl = sum(n for s, n in gezaehlt.items()
                     if s in BUCH and BUCH[s][1] == art)
        print(f'    {art:13s} {anzahl:3d}')

    if verschwunden:
        print(f'\n  {len(verschwunden)} Eintrag/Eintraege im Buch ohne Fundstelle '
              f'— behoben, also aus dem Buch nehmen:')
        for f, tab in verschwunden:
            print(f'    - {f} / {tab}')

    fehler = False
    if neu:
        fehler = True
        print(f'\n  [FEHLER] {len(neu)} Fundstelle(n) stehen nicht im Buch:')
        for (f, tab), n in neu:
            print(f'    - {f} / {tab} ({n}x)')
        print('    Entweder ist die Abfrage falsch und braucht einen '
              'Mandantenfilter,\n    oder sie ist richtig und braucht einen '
              'Eintrag mit Grund in BUCH.')
    if gewachsen:
        fehler = True
        print(f'\n  [FEHLER] {len(gewachsen)} Paar(e) haben mehr Fundstellen als verbucht:')
        for (f, tab), war, ist in gewachsen:
            print(f'    - {f} / {tab}: verbucht {war}, gefunden {ist}')

    offen = [(s, BUCH[s]) for s in sorted(gezaehlt) if s in BUCH and BUCH[s][1] == 'OFFEN']
    if offen:
        print(f'\n  NOCH OFFEN — {sum(b[0] for _, b in offen)} Fundstelle(n) in '
              f'{len(offen)} Funktion(en), jede mit Wirkung:')
        for (f, tab), (n, _, grund) in offen:
            print(f'    {f} / {tab}: {grund}')

    if not fehler and not offen:
        print('\n  [ok] Keine unverbuchte und keine offene Stelle. Jede Abfrage '
              'ohne Mandantenbezug\n       ist benannt und begruendet: Cron-Laeufe, '
              'Missbrauchssperren, Kontosuche.')
    elif not fehler:
        print('\n  [ok] Keine unverbuchte Stelle. Jede Abfrage ohne '
              'Mandantenbezug ist benannt und begruendet.')
    return 1 if fehler else 0


if __name__ == '__main__':
    sys.exit(main())
