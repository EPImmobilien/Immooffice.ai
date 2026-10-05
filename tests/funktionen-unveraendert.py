#!/usr/bin/env python3
"""Prueft, dass die Neutralisierung der Edge Functions nur Kennzeichen trifft.

Hintergrund: die Neutralisierung ist eine Reihe von Ersetzungen ueber 2,7 MB
Quelltext. Eine zu breit geratene Regel aendert dabei Dinge, die niemand
angefasst haben wollte — beim Schreiben des Skripts ist genau das passiert
(ein Muster mit eckigen Klammern wurde als Zeichenklasse ausgewertet und hat
quer durch alle Dateien einzelne Buchstaben ersetzt).

Die Pruefung stellt eine einfache Frage: Enthielt jede geaenderte Zeile
vorher ein Kennzeichen, das entfernt werden sollte? Wenn nicht, hat eine
Regel etwas getroffen, das sie nichts angeht.

Laeuft nur, wenn reference/functions vorhanden ist — ohne die Vorlage gibt es
nichts zu vergleichen. Auf einem Rechner ohne Referenzmaterial meldet sie das
und ist zufrieden; sie ist eine Pruefung der Uebersetzung, nicht des Ergebnisses.
"""
import base64, difflib, pathlib, re, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
VORLAGE = WURZEL / 'reference' / 'functions'
FORK = WURZEL / 'supabase' / 'functions'
EIGENE = WURZEL / 'supabase' / 'eigene'

# Was eine Zeile enthalten haben muss, damit ihre Aenderung erklaert ist.
#
# BASE64, nicht im Klartext: eine Datei, die Kennzeichen des
# Referenzunternehmens sucht, darf sie nicht selbst lesbar enthalten
# (CLAUDE.md, Abschnitt Abgrenzung). scripts/neutral.sh macht es seit dem
# 28.09.2026 genauso und aus demselben Grund. Wer die Liste lesen will:
#   python3 -c "import base64;print(base64.b64decode('...').decode())"
KENNZEICHEN = re.compile(
    base64.b64decode('ZW5nZmVyfGVwd29ybGR8ZXBbLV8gXT9pbW1vYmlsaWVufGVwLXdvcmxkfEVQIFdvcmxkfEUmUHxFJmFtcDtQfEVOR0ZFUnxWKMO2fG9lfFxcdTAwZjYpZ2VudGVpY2h8Vm9lZ2VudGVpY2h8Um9zdG9ja3xTY2h3ZXJpbnxCZXJsaW58SGFtYnVyZ3xXYXJuZW0ow7x8dWUpbmRlfE1hcmtncmFmZW5oZWlkZXwxODA1NXwxODA1N3wxOTA1NXxQdXNjaGtpbnwwMzgxWyAvLi1dPzM2WyAvLi1dPzc3WyAvLi1dPzk5WyAvLi1dPzg4fHNwcmVuZ25ldHRlcnxTUFJFTkdORVRURVJ8am90Zm9ybXxzaXBnYXRlfHlvZGVja3xzaG9wLT90dnx5YXp3a3p6amlxdXBydGpwdXJ1cnxTVEFORE9SVEVcW3xTVEFORE9SVEVcLnxEb2JiZXJ0aW58THVkd2lnc2x1c3Q=').decode(),
    re.IGNORECASE)

# Zeilen, die nur verschwinden, weil sie zu einem Block gehoeren, dessen
# uebrige Zeilen ein Kennzeichen tragen. Bisher genau einer: die
# Standortkarte in mpe-pdf-erzeugen. Ihre vier Kartenpunkte markieren die
# Bueros der Referenz; die beiden Klammerzeilen tragen selbst kein
# Kennzeichen, koennen aber nicht stehen bleiben, wenn die Punkte gehen.
# Funktionen, die der Fork nicht nur neutralisiert, sondern ERWEITERT. Bei
# ihnen traegt nicht jede geaenderte Zeile ein Kennzeichen — das ist der Sinn
# einer Erweiterung. Sie werden trotzdem gezaehlt und benannt, damit die Liste
# kurz bleibt und niemand hier heimlich Verhalten aendert.
ERWEITERT = {
    'urlaub-hinweise': 'Feiertage aller sechzehn Bundeslaender statt nur '
                       'Mecklenburg-Vorpommern (Auftrag 28.09.2026)',
    # Die Funktion hatte Mailadresse und Rufnummer im Quelltext und wies die
    # KI an, genau diese in Werbetexte zu schreiben. Sie bekommt sie jetzt
    # im Anfragekoerper (body.kontakt) — eine Erweiterung, nicht blosse
    # Neutralisierung: die geaenderten Zeilen tragen deshalb kein
    # Kennzeichen der Referenz mehr, sondern den neuen Weg.
    'generate-text': 'Kontaktdaten kommen aus dem Anfragekoerper statt aus '
                     'dem Quelltext; ohne Angabe nennt die KI keine '
                     '(Phase 2.4, 05.10.2026)',
}
# Die sechzehn Funktionen, die Dateien anfassen, bekommen die Storage-Huelle.
# Beim Schreiben stellt sie den Mandanten voran, sobald immoSetzeMandant()
# ihn kennt. Beim Lesen faellt sie auf das Wurzelverzeichnis zurueck, wo die
# Schriften der Plattform liegen, und holt eine fehlende Schrift einmal von
# ihrer Quelle. Ohne diesen Rueckfall brach expose-pdf-erzeugen mit
# "Basis-Fonts fehlen in branding-assets" ab (gemeldet 28.09.2026).
for _f in ('expose-pdf-erzeugen', 'mpe-pdf-erzeugen', 'energieausweis-anfrage',
           'eigentuemer-dokument-uebernehmen', 'signatur-unterschreiben',
           'mail-anhaenge-diagnose', 'brief-pdf-erzeugen', 'web-asset-kopieren',
           'bild-empfang', 'eigentuemer-report-pdf', 'signatur-vorgang-starten',
           'vertrag-pdf', 'mietvertrag-pdf'):
    ERWEITERT[_f] = ('Storage-Huelle: Mandantenpfad, Rueckfall auf die '
                     'Plattform, Selbstheilung der Schriften (Phase 2)')

# Oeffentliche Endpunkte, die ihren Mandanten selbst bestimmen muessen. Sie
# benutzen den service_role, fuer den RLS nicht gilt — die Grenze ziehen sie
# also im Quelltext. Buch darueber fuehrt tests/funktionen-oeffentlich.py.
for _f in ('oeffentliche-objekte', 'web-lead', 'objekt-landing', 'akq-lead-eingang'):
    ERWEITERT[_f] = ('Oeffentlicher Endpunkt: bestimmt seinen Mandanten '
                     'selbst (Phase 2)')

# Dokumente: Farben und Briefkopf kommen aus dem Mandanten statt aus einer
# festen Palette beziehungsweise einem festen Slug (Phase 2, gemeldet
# 28.09.2026).
for _f in ('rechnung-pdf-erzeugen', 'reservierung-pdf-erzeugen',
           'reservierung-word-erzeugen'):
    ERWEITERT[_f] = ('CI, Briefkopf und Schriften aus dem Mandanten, '
                     'Storage-Huelle (Phase 2)')

# Oeffentliche Endpunkte, die ihre Zeilen jetzt mit Mandanten schreiben.
# Ohne mandant_id greift der Standardwert aktuelle_mandant_id(), und der ist
# ohne Anmelde-Token NULL — die Zeile waere fuer jeden unsichtbar.
# Buch darueber fuehrt tests/oeffentlich-insert-mandant.py.
for _f in ('signatur-token-validieren', 'bewerbertest-abgeben',
           'expose-freigabe', 'news-briefing-erstellen', 'portal-ftp-diagnose'):
    ERWEITERT[_f] = ('Schreibt mit Mandanten statt ohne (Phase 2)')

# Neubauportal: das Postfach gehoert dem Mandanten des Projekts, nicht dem
# erstbesten aktiven. Sonst ginge die Einladung des einen Bautraegers ueber
# den SMTP-Zugang des anderen hinaus.
for _f in ('projekt-interaktion', 'projekt-login', 'projekt-upload'):
    ERWEITERT[_f] = 'Versendet ueber das Postfach des eigenen Mandanten (Phase 2)'

# Alles in der Expose-Freigabe haengt am Mandanten des Objekts — Impressum,
# Kontaktsuche, Newsletter. Vorher lief das ueber den Slug "standard" und
# ueber die E-Mail-Adresse; beides gibt es bei mehreren Maklern.
ERWEITERT['expose-freigabe'] = ('Alles am Mandanten des Objekts (Phase 2)')

# Der Anmeldelink des Eigentuemers: die E-Mail-Adresse gilt quer durch alle
# Mandanten, das Konto nicht. Also erst das Konto, daraus der Mandant, und
# Anrede, Ansprechpartner, Aktivitaet und Einladung bleiben darin. Der
# Rueckfall "irgendein Chef" traf vorher die ganze Plattform.
ERWEITERT['eigentuemer-zugang-anfordern'] = (
    'Mandant aus dem Konto, alles Weitere darin (Phase 2)')

# Der Signaturlink las das PDF ohne Mandantenpfad — geschrieben wird es mit —
# und nahm das Dokument allein ueber seine Kennung.
ERWEITERT['signatur-token-validieren'] = (
    'Storage-Huelle und Dokument nur aus demselben Mandanten (Phase 2)')

# Die Upload-Meldung ging an die Chefs aller Mandanten — einmal geladen,
# ohne Grenze, und jede Meldung an jeden.
ERWEITERT['upload-benachrichtigung-versenden'] = (
    'Empfaenger je Mandant statt einmal fuer alle (Phase 2)')

# Phase 2.4 (30.09.2026): die Systemvorgabe fuer Akquisevorlagen nannte einen
# festen Firmennamen. Damit sie den des Mandanten nennen kann, muss das
# Profil seine mandant_id mitgeben — eine Zeile ohne Kennzeichen, deshalb
# hier.
ERWEITERT['akq-ki-vorlage'] = (
    'Firmenname des Mandanten statt eines festen in der KI-Vorgabe (Phase 2.4)')

# fork_28: push_einstellungen, kosten_saetze, liquid_settings und
# akq_einstellungen hatten EINE Zeile fuer die ganze Plattform. Die drei
# Funktionen, die sie mit dem service_role lesen, brauchen jetzt den
# Mandanten dazu — und pruefen bei der Gelegenheit, wem der Anlass gehoert.
for _f in ('push-senden', 'fahrt-ermitteln'):
    ERWEITERT[_f] = ('Einstellungen und Anlass aus dem eigenen Mandanten '
                     '(Phase 2, fork_28)')

# Vier weitere oeffentliche Endpunkte, die ueber alle Mandanten hinweg
# gelesen oder verschickt haben.
ERWEITERT['push-antworten'] = (
    'Die Mail muss dem Mandanten des Geraets gehoeren (Phase 2)')
ERWEITERT['suchkriterien-newsletter'] = (
    'Ein Lauf je Mandant statt einer ueber alle (Phase 2)')
ERWEITERT['news-briefing-erstellen'] = (
    'Vertraegt mehrere Mandanten (Phase 2)')
ERWEITERT['portal-ftp-diagnose'] = (
    'Der Mandant wird benannt, nicht geraten (Phase 2)')

# projekt-wohnungen trug ein einzelnes Kundenprojekt im Quelltext — Name,
# Strasse, Ort, Hausliste — und suchte die Wohnungen ueber Strasse und Ort
# ohne Mandanten.
ERWEITERT['projekt-wohnungen'] = (
    'Projekt aus der Tabelle, Wohnungen aus dessen Mandanten (Phase 2)')

# Die KI-Bilder lagen ausserhalb des Mandantenordners — im oeffentlichen
# Eimer, fuer die Anwendung unsichtbar und nicht mehr loeschbar.
ERWEITERT['ki-bildbearbeitung'] = (
    'Storage-Pfade mit Mandanten davor (Phase 2)')

# Angemeldete Endpunkte, die den service_role benutzen und eine Kennung aus
# dem Anfragekoerper entgegennehmen. Sie bekommen den Waechter
# immoMandantSichern() vorne eingezogen — die Pruefung selbst steht seit
# fork_14 in der Datenbank. Buch darueber fuehrt
# tests/funktionen-angemeldet.py.
for _f in ('credentials-anzeigen', 'mitarbeiter-loeschen',
           'rechnung-pdf-erzeugen', 'mail-gelesen-setzen',
           'mail-anhaenge-extrahieren', 'eigentuemer-nachricht-senden',
           'eigentuemer-person-hinzufuegen', 'expose-freigabe-erstellen',
           # Runde 2: die Dokumente. Ein PDF ist die vollstaendige Auskunft
           # ueber einen Vorgang; expose-pruefen las sogar jeden Pfad in
           # jedem Eimer.
           'expose-pdf-erzeugen', 'expose-pruefen', 'mietvertrag-pdf',
           'vertrag-pdf', 'mpe-pdf-erzeugen', 'eigentuemer-report-pdf',
           'portal-export', 'portal-export-homepage',
           'signatur-vorgang-starten', 'signatur-vorgang-widerrufen',
           # Runde 3: der Rest der geraden Faelle.
           'akq-automation-lauf', 'akq-mail-leads', 'akq-wertindikation-pdf',
           'bild-beschriften', 'bild-web-variante',
           'eigentuemer-dokument-onedrive-push',
           'eigentuemer-dokument-uebernehmen', 'eigentuemer-einladen',
           'mail-anfrage-verarbeiten', 'mail-ki-vorschlag',
           'mail-postfach-backfill', 'mail-rechnung-weiterleiten',
           'mail-zu-todo', 'mitarbeiter-anlegen', 'newsletter-senden',
           'projekt-nachricht-antwort', 'termin-fahrzeit',
           # Runde 4: die vier anderer Bauart — Zeitfenster statt Kennung,
           # und termin-serie konnte sogar fremde Termine loeschen.
           'termin-erinnerung', 'besichtigung-nachfassen', 'termin-serie',
           'eigentuemer-einladung-nachfassen',
           # Runde 5 und 6: die Faelle, die das erste, zu enge Kriterium
           # nicht gesehen hat — ein Pfad statt einer Kennung, eine
           # destrukturierte Kennung, ein Rundruf an "alle Chefs" oder eine
           # Rueckfallkette, die mit "irgendein Postfach" endet.
           'objekt-wissen-auslesen', 'mail-zu-mietanfrage',
           'mail-postfach-speichern', 'credentials-speichern', 'ea-mailtest',
           'energieausweis-auslesen', 'upload_benachrichtigung_planen',
           'brief-pdf-erzeugen', 'reservierung-pdf-erzeugen',
           'reservierung-word-erzeugen', 'eigentuemer-link-erneut-senden',
           'eigentuemer-loeschen', 'web-asset-kopieren',
           'makler-nachricht-senden', 'expose-rueckmeldung-melden',
           'expose-erinnerung', 'projekt-datei-benachrichtigung',
           # Runde 7: der Rest.
           'mail-senden', 'mail-postfach-pull',
           'mail-abwesenheit-verarbeiten', 'bewerbertest-einladen',
           'urlaub-hinweise'):
    ERWEITERT[_f] = ('Prueft Kennungen aus dem Anfragekoerper gegen den '
                     'Mandanten des Aufrufers (Phase 2)')

BLOCKZEILEN = {
    'mpe-pdf-erzeugen': {
        'const pins: Array<[number, number, string, string, string]> = [',
        '];',
    },
}


def main():
    if not VORLAGE.is_dir():
        print('reference/functions fehlt — nichts zu vergleichen. Das ist in '
              'Ordnung: die Vorlage ist nicht versioniert.')
        return 0

    beanstandet = []
    erweitert = []
    eigen = set()
    geprueft = 0
    for ordner in sorted(FORK.iterdir()):
        if not ordner.is_dir():
            continue
        for neu in sorted(ordner.rglob('*')):
            if neu.is_dir():
                continue
            alt = VORLAGE / ordner.name / neu.relative_to(ordner)
            if not alt.exists():
                # Eigene Funktionen des Forks haben keine Entsprechung in der
                # Vorlage — das ist ihr Wesen, kein Befund. Sie liegen
                # versioniert in supabase/eigene/ und werden vom Erzeuger
                # dazukopiert; dieser Test prueft die UEBERSETZUNG der Vorlage
                # und hat zu ihnen nichts zu sagen.
                if (EIGENE / ordner.name).is_dir():
                    eigen.add(ordner.name)
                    continue
                beanstandet.append((str(neu), 0, 'hat keine Entsprechung in der Vorlage'))
                continue
            if ordner.name in ERWEITERT:
                erweitert.append(ordner.name)
                continue
            geprueft += 1
            a = alt.read_text(encoding='utf-8').splitlines()
            b = neu.read_text(encoding='utf-8').splitlines()
            # difflib fasst benachbarte Zeilen gelegentlich zu einem Block
            # zusammen und meldet dann auch unveraenderte Zeilen als ersetzt.
            # Deshalb zaehlt nur, was auf der neuen Seite nicht wortgleich
            # wieder auftaucht.
            weg, dazu = [], set()
            for zeile in difflib.unified_diff(a, b, n=0, lineterm=''):
                if zeile.startswith('---') or zeile.startswith('+++'):
                    continue
                if zeile.startswith('-'):
                    weg.append(zeile[1:])
                elif zeile.startswith('+'):
                    dazu.add(zeile[1:])
            for zeile in weg:
                if zeile in dazu:
                    continue
                if zeile in BLOCKZEILEN.get(ordner.name, ()):
                    continue
                if not KENNZEICHEN.search(zeile):
                    beanstandet.append(
                        (str(neu.relative_to(WURZEL)), 0, zeile.strip()[:120]))

    if beanstandet:
        print(f'[FEHLER] {len(beanstandet)} Zeile(n) wurden geaendert, ohne ein '
              f'Kennzeichen zu enthalten:\n')
        for datei, _, text in beanstandet[:20]:
            print(f'  {datei}\n    {text}')
        if len(beanstandet) > 20:
            print(f'  … und {len(beanstandet) - 20} weitere')
        return 1

    print(f'[ok] {geprueft} Dateien verglichen — jede Aenderung entfernt ein '
          f'Kennzeichen der Vorlage.')
    if eigen:
        print(f'     {len(eigen)} eigene Funktion(en) des Forks, ohne Entsprechung '
              f'in der Vorlage: {", ".join(sorted(eigen))}')
    for name in sorted(set(erweitert)):
        print(f'     erweitert, deshalb nicht Zeile fuer Zeile geprueft: '
              f'{name} — {ERWEITERT[name]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
