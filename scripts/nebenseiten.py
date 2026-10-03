#!/usr/bin/env python3
"""Neutralisiert die vier Nebenseiten der Vorlage.

Die Anwendung ist nicht nur index.html. Sie registriert sw.js, die
Netlify-Umschreibung zeigt auf freigabe.html, und aus Exposés wird
objekt.html und sonnenverlauf.html verlinkt. Fehlt eine davon, laeuft das
Portal zwar, aber die Offline-Huelle und die Kundenseiten fehlen.

Die Ersetzungsregeln kommen aus scripts/oberflaeche-zerlegen.py — dieselben,
die die index.html neutralisieren. Zwei Regelsaetze fuer dasselbe Ziel waeren
ein Regelsatz zu viel: window.IMMO_TOKEN wird in index.html gesetzt und in
freigabe.html gelesen, und die CDN-Liste im Service Worker muss zu den
gepinnten Versionen der index.html passen. Laufen die Saetze auseinander,
bricht genau das.

Eingabe:  reference/epworld-*.{html,js}      (nicht versioniert)
Ausgabe:  src/seiten/                        (versioniert)
"""
import hashlib, importlib.util, pathlib, re, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
QUELLE = WURZEL / 'reference'
ZIEL = WURZEL / 'src' / 'seiten'

# (Quelldatei, Zieldatei). Die Namen ohne Vorsatz sind die, unter denen die
# Anwendung sie sucht — sw.js steht so in der Registrierung, freigabe.html so
# in der Umschreibung.
SEITEN = [
    ('epworld-sw.js', 'sw.js'),
    ('epworld-freigabe.html', 'freigabe.html'),
    ('epworld-objekt.html', 'objekt.html'),
    ('epworld-sonnenverlauf.html', 'sonnenverlauf.html'),
    # Stufe 114/117 der Vorlage: die oeffentliche Download-Seite. Sie ist der
    # Gegenpart zur Edge Function unterlagen-link (supabase/eigene/) und wird
    # aus der Mail verschickt, die der Makler dem Kunden schreibt.
    ('epworld-unterlagen.html', 'unterlagen.html'),
    ('epworld-_redirects', '_redirects'),
]

# Zwei Werte setzt erst die Auslieferung, nicht der Quellstand — genauso wie
# bei index.html. Die Marken sind absichtlich haesslich: ein Platzhalter, der
# es in eine ausgelieferte Datei schafft, soll auffallen.
PLATZHALTER_URL = '__IMMO_SUPABASE_URL__'
PLATZHALTER_STAND = '__IMMO_STAND__'
PLATZHALTER_REF = '__IMMO_PROJEKT_REF__'

EIGENE_REF = 'usguiggfciavwzkdfjgt'
EIGENES_PROJEKT = f'https://{EIGENE_REF}.supabase.co'


def regeln():
    """Laedt die Regeln aus dem Zerleger. Der Bindestrich im Dateinamen
    verhindert ein gewoehnliches import, deshalb der Umweg.

    Zwei Listen: ERSETZUNGEN gilt fuer die Oberflaeche UND die Nebenseiten,
    SEITEN_ERSETZUNGEN nur hier. Die zweite laeuft danach — sie greift
    teilweise auf das Ergebnis der ersten zu (etwa den Seitentitel, in dem
    der Firmenname der Vorlage schon ersetzt ist)."""
    pfad = WURZEL / 'scripts' / 'oberflaeche-zerlegen.py'
    spec = importlib.util.spec_from_file_location('zerleger', pfad)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return (modul.ERSETZUNGEN + modul.SEITEN_ERSETZUNGEN,
            modul.pruefe_haeufigkeit)


def main():
    if not (QUELLE / 'epworld-sw.js').exists():
        print('reference/ fehlt — nichts zu tun. Das ist in Ordnung: die '
              'Vorlage ist nicht versioniert.')
        return 0
    ERSETZUNGEN, pruefe_haeufigkeit = regeln()
    ZIEL.mkdir(parents=True, exist_ok=True)

    zaehler = {}
    for quelle, ziel in SEITEN:
        p = QUELLE / quelle
        if not p.exists():
            sys.exit(f'Fehlt: {p}')
        inhalt = p.read_text(encoding='utf-8')
        for grund, muster, ersatz, bemerkung in ERSETZUNGEN:
            inhalt, n = re.subn(muster, ersatz, inhalt)
            pruefe_haeufigkeit(n, bemerkung, ziel)
            if n:
                zaehler[bemerkung] = zaehler.get(bemerkung, 0) + n
        # Erst nach den Regeln: die FREMD-Regel hat die Projektkennung der
        # Vorlage gerade durch die eigene ersetzt. Aus der eigenen wird hier
        # ein Platzhalter — sonst baut derselbe Quellstand nur fuer ein Projekt.
        inhalt, n = re.subn(re.escape(EIGENES_PROJEKT), PLATZHALTER_URL, inhalt)
        if n:
            zaehler['Projekt-Adresse als Platzhalter'] = \
                zaehler.get('Projekt-Adresse als Platzhalter', 0) + n
        # Die blosse Kennung steckt ausserdem im Schluessel, unter dem
        # supabase-js die Sitzung im Browser ablegt
        # (sb-<ref>-auth-token). Zeigt er auf ein anderes Projekt als die
        # Anwendung, findet die Seite die Anmeldung des Nutzers nicht.
        inhalt, n = re.subn(re.escape(EIGENE_REF), PLATZHALTER_REF, inhalt)
        if n:
            zaehler['Projektkennung als Platzhalter'] = \
                zaehler.get('Projektkennung als Platzhalter', 0) + n
        inhalt, n = re.subn(r'const STAND = "[0-9-]+";',
                            f'const STAND = "{PLATZHALTER_STAND}";', inhalt)
        if n:
            zaehler['Stand des Zwischenspeichers als Platzhalter'] = n
        (ZIEL / ziel).write_text(inhalt, encoding='utf-8')
        print(f'  {ziel:22s} {len(inhalt.encode()):>7,} B  '
              f'{hashlib.sha256(inhalt.encode()).hexdigest()[:12]}')

    print('\nNeutralisierung der Nebenseiten:')
    for bemerkung, n in sorted(zaehler.items(), key=lambda x: -x[1]):
        print(f'  {n:4d}x  {bemerkung}')
    print(f'\n{len(SEITEN)} Dateien geschrieben nach {ZIEL.relative_to(WURZEL)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
