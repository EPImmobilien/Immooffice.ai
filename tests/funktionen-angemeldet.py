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

ZUM UMFANG (29.09.2026, nachgeschaerft): Die erste Fassung hat nur die
Funktionen gefuehrt, in denen eine Kennung als body.irgendwas_id im
Quelltext steht. Das waren 40 — aber es ist ein Muster, kein Kriterium:
const { brief_id } = body faellt durch, und ein .from("x").select("*") ohne
jede Kennung liefert unter dem service_role gleich ALLE Mandanten.
Gefuehrt wird deshalb jede Funktion mit JWT-Pruefung, die den service_role
benutzt — 63 statt 40. Was geprueft und harmlos ist, steht unter
UNBEDENKLICH, nicht ausserhalb der Liste.
"""
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
    'expose-sofortversand': ('mandant_sichern',
        'Sendet das Exposé an eine Adresse aus dem Anfragekoerper. Ohne '
        'Pruefung haette ein angemeldeter Makler das Exposé eines fremden '
        'Mandanten an eine beliebige Adresse geschickt — und die Mail waere '
        'ueber dessen Postfach hinausgegangen. Geprueft wird die '
        'immobilie_id; Postfach, Freigabe und Protokoll haengen danach alle '
        'am Mandanten DES OBJEKTS, nicht an einer zweiten Angabe aus dem '
        'Koerper. Der Dienstschluessel-Weg (mail-anfrage-verarbeiten) hat '
        'keinen Mandanten und arbeitet ebenfalls auf dem des Objekts.'),
    'postfach-anbieter-start': ('benutzer_id !== u.user.id',
        'Startet die Verbindung eines Postfachs bei Microsoft oder Google. '
        'Die einzige Kennung aus dem Koerper ist postfach_id (ein '
        'bestehendes Postfach neu verbinden) — und die wird gegen den '
        'ANGEMELDETEN NUTZER geprueft, nicht nur gegen den Mandanten: ein '
        'Postfach gehoert einem Menschen, nicht einem Haus. Mit der Pruefung '
        'auf den Mandanten allein haette ein Kollege das Token eines anderen '
        'ueberschreiben koennen.'),
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
    'expose-pdf-erzeugen': ('immoMandantSichern',
        'Das Expose eines fremden Objekts als PDF — mit Adresse, Preis und '
        'allen Bildern.'),
    'expose-pruefen': ('immoMandantDesAufrufers',
        'Der schwerste Fall des zweiten Blocks: Eimer UND Pfad kamen aus dem '
        'Anfragekoerper und wurden mit dem service_role gelesen. Das war ein '
        'Lesezugriff auf JEDE Datei JEDES Mandanten — nicht nur Exposes. '
        'Gemessen wird jetzt am ersten Pfadsegment (fork_09).'),
    'mietvertrag-pdf': ('immoMandantSichern',
        'Der Mietvertrag eines fremden Mandanten — mit Mieter, Miete und '
        'Anschrift.'),
    'vertrag-pdf': ('immoMandantSichern',
        'Der Maklervertrag eines fremden Mandanten.'),
    'mpe-pdf-erzeugen': ('immoMandantSichern',
        'Die Wertermittlung eines fremden Mandanten.'),
    'eigentuemer-report-pdf': ('immoMandantSichern',
        'Der Eigentuemerbericht zu einem fremden Objekt.'),
    'portal-export': ('immoMandantSichern',
        'Ein fremdes Objekt an ein Portal uebertragen — oder dort loeschen.'),
    'portal-export-homepage': ('immoMandantSichern',
        'Dasselbe fuer die Homepage.'),
    'signatur-vorgang-starten': ('immoMandantSichern',
        'Einen Signaturvorgang zu einem fremden Vertrag starten und damit '
        'Einladungen an dessen Beteiligte verschicken.'),
    'signatur-vorgang-widerrufen': ('immoMandantSichern',
        'Einen fremden Signaturvorgang widerrufen.'),
    'akq-automation-lauf': ('immoMandantSichern',
        'Die Automation eines fremden Leads planen und ausfuehren.'),
    'akq-mail-leads': ('immoMandantSichern',
        'Eine fremde Mail als Akquise-Lead auswerten.'),
    'akq-wertindikation-pdf': ('immoMandantSichern',
        'Die Wertindikation zu einem fremden Lead.'),
    'bild-beschriften': ('immoMandantSichern',
        'Die Bilder eines fremden Objekts beschriften lassen.'),
    'bild-web-variante': ('immoMandantSichern',
        'Web-Varianten fremder Bilder erzeugen.'),
    'eigentuemer-dokument-onedrive-push': ('immoMandantSichern',
        'Ein fremdes Eigentuemerdokument in ein OneDrive schieben — Ziel-Drive und Ziel-Ordner kommen ebenfalls aus dem Koerper.'),
    'eigentuemer-dokument-uebernehmen': ('immoMandantSichern',
        'Ein fremdes Eigentuemerdokument uebernehmen.'),
    'eigentuemer-einladen': ('immoMandantSichern',
        'Eine Einladung zu einem fremden Maklervertrag, mit einem fremden Ansprechpartner als Absender.'),
    'mail-anfrage-verarbeiten': ('immoMandantSichern',
        'Eine fremde Mail als Anfrage verarbeiten — die Antwort enthaelt den ausgelesenen Inhalt.'),
    'mail-ki-vorschlag': ('immoMandantSichern',
        'Ein KI-Antwortvorschlag zu einer fremden Mail, mit einem fremden Objekt als Bezug.'),
    'mail-postfach-backfill': ('immoMandantSichern',
        'Ein fremdes Postfach nachtragen.'),
    'mail-rechnung-weiterleiten': ('immoMandantSichern',
        'Eine Rechnung aus einer fremden Mail weiterleiten.'),
    'mail-zu-todo': ('immoMandantSichern',
        'Aus einer fremden Mail eine Aufgabe machen — und sie einem Kollegen eines anderen Hauses zuweisen.'),
    'mitarbeiter-anlegen': ('immoMandantSichern',
        'Einen Mitarbeiter an einem fremden Standort anlegen.'),
    'newsletter-senden': ('immoMandantSichern',
        'Die Newsletter-Kampagne eines fremden Maklers verschicken.'),
    'projekt-nachricht-antwort': ('immoMandantSichern',
        'Im Kundenbereich eines fremden Bautraegers antworten.'),
    'termin-fahrzeit': ('immoMandantSichern',
        'Fahrzeit und Entfernung zu einem fremden Termin.'),
    'besichtigung-nachfassen': ('t.mandant_id',
        'Dasselbe Zeitfenster. Ob nachgefasst wird, entschied der Posteingang ALLER Mandanten — gesucht wurde ueber die E-Mail-Adresse —, und der Betreff der fremden Mail stand im Protokoll der Antwort.'),
    'eigentuemer-einladung-nachfassen': ('firmaFuer',
        'Der Briefkopf kam aus der ERSTEN aktiven Zeile in firma_stammdaten — fuer alle Mandanten derselbe Firmenname und dieselbe Absenderadresse. Jetzt je Mandant, dazu der Ansprechpartner und der Waechter fuer body.eigentuemer_id.'),
    'termin-erinnerung': ('t.mandant_id',
        'Laeuft ueber ein Zeitfenster, also ueber alle Mandanten — das darf sie. Der Absender wurde aber ueber den NAMEN des Teilnehmers gesucht, und der Rueckfall nahm irgendeinen Chef: die Erinnerung waere ueber ein fremdes Postfach hinausgegangen. Dazu der Waechter fuer body.termin_id.'),
    'termin-serie': ('aufruferMandant',
        'serie_id ist keine Kennung einer Zeile, sondern eine Gruppierung ueber termine.serie_id; ein Waechter greift dort ins Leere. Der einzige Fall in beiden Bloecken, in dem LOESCHEN moeglich war: die Terminserie eines fremden Maklers, Termin fuer Termin. Jede Abfrage haengt jetzt am Mandanten des Aufrufers.'),
    'brief-pdf-erzeugen': ('immoMandantSichern',
        'Der Brief eines fremden Mandanten als PDF.'),
    'credentials-speichern': ('profil.mandant_id',
        'Der Dienstname ist seit fork_17 nur je Mandant eindeutig; ohne Grenze haette der eine Makler die Zugangsdaten des anderen ueberschrieben.'),
    'ea-mailtest': ('immoMandantDesAufrufers',
        'Nahm das erste aktive Postfach der Plattform und verschickte damit an eine Adresse aus dem Anfragekoerper — ein Versandweg ueber das Postfach eines fremden Maklers.'),
    'eigentuemer-link-erneut-senden': ('immoMandantSichern',
        'Einen Anmeldelink an den Eigentuemer eines fremden Maklers schicken.'),
    'eigentuemer-loeschen': ('immoMandantSichern',
        'Den Eigentuemer eines fremden Maklers loeschen — samt Konto und Dateien. Der zweite Loeschfall.'),
    'energieausweis-auslesen': ('immoMandantDesAufrufers',
        'storage_path kam aus dem Anfragekoerper und wurde mit dem service_role gelesen — wie bei expose-pruefen.'),
    'expose-erinnerung': ('im?.mandant_id',
        'Der Briefkopf kam ueber den Slug "standard" — seit fork_17 nur je Mandant eindeutig.'),
    'expose-rueckmeldung-melden': ('eigDaten?.mandant_id',
        'Dasselbe fuer die Rueckmeldung zum Expose.'),
    'mail-postfach-speichern': ('immoMandantSichern',
        'Die Rolle "chef" hob die Eigentuemerpruefung auf. Ohne Mandantengrenze davor haette ein Chef die Postfaecher fremder Haeuser aendern koennen — samt SMTP-Server, Benutzer und Passwort.'),
    'mail-zu-mietanfrage': ('immoMandantSichern',
        'Aus einer fremden Mail eine Mietanfrage machen.'),
    'makler-nachricht-senden': ('eigDaten?.mandant_id',
        'Der Rundruf an "alle Chefs" traf die ganze Plattform: die Nachricht eines Eigentuemers an SEINEN Makler landete in jedem Buero.'),
    'objekt-wissen-auslesen': ('immoMandantSichern',
        'Objektwissen zu einem fremden Objekt anlegen und auslesen.'),
    'projekt-datei-benachrichtigung': ('projekt?.mandant_id',
        'Die Rueckfallkette der Postfaecher endete mit "irgendein Postfach".'),
    'reservierung-pdf-erzeugen': ('immoMandantSichern',
        'Die Reservierung eines fremden Bautraegers als PDF.'),
    'reservierung-word-erzeugen': ('immoMandantSichern',
        'Dasselbe als Word.'),
    'upload_benachrichtigung_planen': ('ben.mandant_id',
        'Der Rueckfall nahm das Standard-Postfach irgendeines Maklers.'),
    'web-asset-kopieren': ('eigenerMandant',
        'Eimer und Pfad kamen aus dem Anfragekoerper. Der Rueckfall der Storage-Huelle auf das Wurzelverzeichnis haette einen fremden Mandantenpfad durchgelassen.'),
    'bewerbertest-einladen': ('profile.mandant_id',
        'Die Einladung wurde ohne Mandanten geschrieben — unter dem service_role ist aktuelle_mandant_id() null, die Zeile waere fuer jeden unsichtbar gewesen.'),
    'mail-abwesenheit-verarbeiten': ('pf.mandant_id',
        'Cron ueber alle Postfaecher. Ob der Absender ein Mensch ist, entschied aber der Kontaktbestand und der Gesendet-Ordner ALLER Mandanten.'),
    'mail-postfach-pull': ('immoMandantSichern',
        'Ohne postfach_id der Cron ueber alle Postfaecher, der darf das. Mit einer Kennung aus dem Anfragekoerper war es ein IMAP-Abruf eines fremden Postfachs.'),
    'mail-senden': ('immoMandantSichern',
        'Die Rolle "chef" hob die Eigentuemerpruefung des Postfachs auf. Ohne Mandantengrenze davor haette ein Chef Post ueber das Postfach eines fremden Maklers verschickt — mit dessen Absenderadresse.'),
    'urlaub-hinweise': ('aufruferMandant',
        'Wertete die Profile und Urlaubstermine der ganzen Plattform aus. Die angelegte Aufgabe nannte die Mitarbeiter fremder Bueros mit Namen und Resttagen, und die Antwort gab dem Aufrufer dieselbe Liste samt E-Mail-Adressen zurueck.'),
    'fahrt-ermitteln': ('aufruferMandant',
        'Der erste Fund dieser Art (29.09.2026). Prueft jetzt erst das '
        'Objekt und den Mandanten, dann den Zwischenspeicher.'),
    'bild-privat-retusche': ('immoMandantDesAufrufers',
        'Eigene Funktion des Forks (supabase/eigene/). Schickt Objektfotos '
        'an eine KI — eine ungepruefte immobilie_id haette die Fotos eines '
        'fremden Maklers dorthin gegeben und seine Bilder ueberschreibbar '
        'gemacht. Geprueft werden beide Wege: das Objekt bei "pruefen", die '
        'Datei bei den drei Einzelaktionen, jeweils gegen den Mandanten des '
        'Kontos. Jede Abfrage, jedes Update und jeder Speicherpfad tragen '
        'ihn ebenfalls — der Pfad als erstes Segment (immoVorne), wie die '
        'Storage-Huelle der Vorlage es tut.'),
    'grundriss-ki-lesen': ('immoMandantDesAufrufers',
        'Eigene Funktion des Forks (supabase/eigene/). Der Mandant kommt aus '
        'dem Konto, nie aus dem Anfragekoerper. Die mitgeschickte '
        'immobilie_id wird dagegen gehalten, bevor sie am Auftrag landet — '
        'ohne das haette ein Angemeldeter seinen KI-Auftrag an ein Objekt '
        'eines fremden Maklers haengen koennen, und dessen Chef haette '
        'danach einen Grundriss in seinen Kosten gefunden, den er nie '
        'bestellt hat. Die Auftragszeile selbst wird bei jedem Schreiben '
        'zusaetzlich auf den Mandanten begrenzt.'),
}

# --- Gelesen und fuer unbedenklich befunden ---------------------------------
UNBEDENKLICH = {
    'akq-ki-vorlage':
        'Erzeugt aus den Textbausteinen des Anfragekoerpers einen Vorschlag. '
        'Liest aus der Datenbank nur die Rolle des Aufrufers und schreibt '
        'nichts. Es gibt hier keine Kennung, die auf einen fremden Satz '
        'zeigen koennte.',
}

# --- Gelesen oder erkannt, Befund offen ------------------------------------
# Diese Liste darf kuerzer werden, nie laenger.
NOCH_OFFEN = {
}



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

    print(f'{len(betroffen)} Funktionen mit JWT-Pruefung, die den '
          f'service_role benutzen:')
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
