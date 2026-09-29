#!/usr/bin/env python3
"""Rauchtest der gebauten Oberflaeche.

Prueft an dist/index.html die Annahmen, auf denen der Aufbau ruht. Keine davon
ist klug; jede einzelne ist schon einmal irgendwo gebrochen worden, und jede
bricht die Anwendung vollstaendig, nicht ein wenig.

Was hier NICHT geprueft wird: ob die Anwendung laeuft. Dafuer muesste sie
starten, und dazu braucht es die Bibliotheken von den CDNs — die der
Egress-Proxy dieser Umgebung sperrt. Der Test prueft Struktur, nicht Verhalten,
und sagt das lieber deutlich, als Sicherheit vorzutaeuschen.
"""
import pathlib, re, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
ZIEL = WURZEL / 'dist' / 'index.html'

# Die Vorlage laedt die Anwendung als klassisches Skript, nicht als Modul.
# Ein `import` im Anwendungsskript wirft "Cannot use import statement outside a
# module" und die GESAMTE Anwendung startet nicht — genau dieser Ausfall ist
# der Vorlage am 17.06.2026 passiert, ausgeloest durch eine ungepinnte
# CDN-Version. Deshalb beides hier: keine Module, alle Versionen fest.
GROESSE_MAX = 8 * 1024 * 1024


def pruefungen(html):
    skripte = re.findall(r'<script\b[^>]*>', html)
    fremd = re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', html)
    eigen = [s for s in skripte if 'src=' not in s]

    ja = []
    nein = []

    def pruefe(bedingung, text, hinweis=''):
        (ja if bedingung else nein).append((text, hinweis))

    pruefe(html.startswith('<!DOCTYPE html>'), 'Beginnt mit einer Doctype-Angabe')

    # Ein leergefallener Suchtext. Die Neutralisierung ersetzt Kennzeichen der
    # Referenz durch "" — steht so eines als SUCHTEXT in einem split(), bleibt
    # split("") stehen, und das zerlegt die Zeichenkette in Einzelzeichen:
    # "abc".split("").join("X") ergibt "aXbXc". Am 28.09.2026 stand genau das
    # in fillMaklervertrag und fillObjektnachweis und haette aus jedem Vertrag
    # Buchstabensalat gemacht — ohne Fehlermeldung.
    #
    # Eine Fundstelle ist erlaubt und gewollt: das Alphabet der
    # Buchstabenhaeufigkeit, das absichtlich in Einzelzeichen zerfaellt.
    leere_anker = len(re.findall(r'\.split\(""\)', html))
    pruefe(leere_anker <= 1,
           'Kein leergefallener Suchtext in einem split()',
           f'gefunden: {leere_anker} (erlaubt: 1, die Buchstabenhaeufigkeit)')
    # Die Selbstregistrierung (fork_30) haengt an drei Stellen, und jede
    # einzelne davon macht sie fuer sich genommen wirkungslos: ohne
    # Formular kommt niemand hinein, ohne den Umschalter findet es niemand,
    # und ohne den Aufruf nach dem ersten Anmelden entsteht kein Mandant.
    pruefe('function Registrieren(' in html,
           'Das Registrierungsformular ist da')
    pruefe('registrierung_abschliessen' in html,
           'Der Mandant wird beim ersten Anmelden angelegt')
    pruefe('Firma registrieren' in html,
           'Von der Anmeldung fuehrt ein Weg zur Registrierung')
    # Supabase meldet eine Anmeldung mit vorhandener Adresse NICHT als
    # Fehler. Ohne diese Abfrage sagt die Maske "wir haben Ihnen eine
    # E-Mail geschickt", und es kommt nie eine.
    pruefe('identities.length === 0' in html,
           'Eine bereits vorhandene Adresse wird erkannt')
    # Die Einstellungen waren am Schreibtisch nur ueber die Adresszeile
    # erreichbar: einen Eintrag hatte nur das Burger-Menue, und das gibt es
    # erst unter 768 Pixeln.
    pruefe('immoEinstellungenKachel' in html,
           'Die Einstellungen haben eine Kachel auf dem Dashboard')
    pruefe(html.count('function Registrieren(') == 1,
           'Das Registrierungsformular steht genau einmal',
           f"gefunden: {html.count('function Registrieren(')}")

    pruefe(html.count('<div id="root">') == 1,
           'Genau ein Wurzelelement fuer React',
           f'gefunden: {html.count(chr(60) + "div id=" + chr(34) + "root" + chr(34) + chr(62))}')
    treffer = len(re.findall(r'ReactDOM\.createRoot\(|ReactDOM\.render\(', html))
    pruefe(treffer >= 1, 'Die Anwendung wird an das Wurzelelement gehaengt',
           f'createRoot/render gefunden: {treffer}')
    pruefe(not any('type="module"' in s for s in skripte),
           'Kein Skript als Modul eingebunden',
           'klassische Laufzeit ist Vorgabe des Auftrags')
    pruefe(not re.search(r'^\s*import\s+[\w{*]', html, re.M),
           'Keine import-Anweisung auf oberster Ebene')

    ohne_pin = [u for u in fremd
                if not re.search(r'@\d+\.\d+\.\d+', u) and 'fonts.googleapis' not in u]
    pruefe(not ohne_pin, f'Alle {len(fremd)} Fremdbibliotheken auf eine feste Version gepinnt',
           'ohne feste Version: ' + ', '.join(ohne_pin) if ohne_pin else '')

    pruefe(len(html.encode()) <= GROESSE_MAX,
           f'Unter {GROESSE_MAX // 1024 // 1024} MB',
           f'tatsaechlich {len(html.encode()) / 1024 / 1024:.1f} MB')

    for name in ('IMMO_SUPABASE_URL', 'IMMO_SUPABASE_KEY'):
        pruefe(f'window.{name} =' in html, f'Platzhalter {name} vorhanden')

    # Ein leerer Zugang ist kein Fehler des Baus — nur eine Warnung fuer den,
    # der die Datei ausrollen will.
    leer = [n for n in ('IMMO_SUPABASE_URL', 'IMMO_SUPABASE_KEY')
            if f'window.{n} = "";' in html]

    return ja, nein, leer, len(eigen), len(fremd)


def main():
    if not ZIEL.exists():
        print(f'{ZIEL.relative_to(WURZEL)} fehlt — erst `npm run bauen`.')
        return 1
    html = ZIEL.read_text(encoding='utf-8')
    ja, nein, leer, eigen, fremd = pruefungen(html)

    for text, _ in ja:
        print(f'  [ok]     {text}')
    for text, hinweis in nein:
        print(f'  [FEHLER] {text}' + (f' — {hinweis}' if hinweis else ''))

    print(f'\n  {eigen} eigene Skriptbloecke, {fremd} Fremdbibliotheken, '
          f'{len(html.encode()) / 1024 / 1024:.1f} MB')
    if leer:
        print('  HINWEIS: ' + ', '.join(leer) + ' ist leer — die Datei kann sich '
              'nicht anmelden. Zum Ausrollen beim Bauen setzen.')
    print('  NICHT geprueft: ob die Anwendung startet. Dafuer muessten die '
          'CDNs erreichbar sein.')
    return 1 if nein else 0


if __name__ == '__main__':
    sys.exit(main())
