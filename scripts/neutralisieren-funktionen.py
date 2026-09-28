#!/usr/bin/env python3
"""Erzeugt aus den Edge Functions der Vorlage die Edge Functions des Forks.

Gegenstueck zu scripts/neutralisieren.py, das dasselbe fuer das Schema tut.
Warum ein Skript und nicht Handarbeit: die Ersetzungen sind damit vollstaendig
nachlesbar, wiederholbar und einzeln begruendet. Wer wissen will, was der Fork
gegenueber der Vorlage aendert, liest diese Datei — nicht einen Diff von 2,8 MB.

Eingabe:  reference/functions/<name>/*        (nicht versioniert)
Ausgabe:  supabase/functions/<name>/*         (versioniert)

Jede Ersetzung fuellt genau einen der drei Gruende:
  MARKE    Kennzeichen des Referenzunternehmens — darf nirgends erscheinen.
  FREMD    Verweis auf das fremde Supabase-Projekt — muss auf das eigene zeigen.
  PHASE14  in Phase 1.4 des Auftrags ersatzlos gestrichen.
Alles andere bleibt, wie es ist (Phase 9: keine Verhaltensaenderung).

Was dieses Skript NICHT leistet: die Funktionen bleiben einmandantig. Sie lesen
Absender, Firmenname und Portal-Adresse weiterhin aus Umgebungsvariablen und
festen Vorgabewerten statt aus firma_stammdaten des jeweiligen Mandanten. Das
ist Aufgabe von Phase 2.4 und in docs/OFFEN.md vermerkt. Hier wird die Marke
entfernt, nicht die Architektur geaendert.
"""
import pathlib, re, shutil, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
QUELLE = WURZEL / 'reference' / 'functions'
ZIEL = WURZEL / 'supabase' / 'functions'

# --------------------------------------------------------------- Phase 1.4
# Vier Funktionen entfallen ersatzlos. jotform-* ist der Formular-Sync des
# Referenzunternehmens, yodeck-* ist Digital Signage / Shop-TV. Beides steht
# im Auftrag unter „entfaellt" und hat im Fork keinen Platz.
ENTFAELLT = {'jotform-poll', 'jotform-webhook', 'yodeck-api', 'yodeck-test'}

# --------------------------------------------------------------- 28.09.2026
# onOffice entfaellt ebenfalls. Anweisung des Auftraggebers: "Bitte loese
# onoffice erstmal komplett raus, wir wissen ja nicht, mit welcher
# urspruenglichen Software die neuen Kunden arbeiten."
#
# Der Punkt trifft: onOffice war in der Vorlage DIE Anbindung, nicht EINE. Ein
# Mandant mit einer anderen Software sieht davon nur tote Knoepfe, und die
# Cron-Jobs liefen alle zehn Minuten in "ONOFFICE_TOKEN nicht gesetzt".
#
# CLAUDE.md sagte bisher "bleibt im Code, hinter Funktionsschalter aus". Die
# Anweisung ist juenger und gilt; begruendet in docs/ENTSCHEIDUNGEN.md. Die
# 13 Tabellen bleiben stehen — sie sind leer, und "erstmal" heisst nicht
# "endgueltig".
ONOFFICE_ENTFAELLT = {
    'onoffice-adress-diagnose', 'onoffice-adressen', 'onoffice-agreement-diagnose',
    'onoffice-bild-diagnose', 'onoffice-bilder', 'onoffice-expose-abgleich',
    'onoffice-felder-werte-diagnose', 'onoffice-import', 'onoffice-nachtrag-test',
    'onoffice-objekt-anlegen', 'onoffice-objekt-speichern', 'onoffice-portal-diagnose',
    'onoffice-status-uebertragen', 'onoffice-suchkriterien', 'onoffice-sync',
    'onoffice-termin-schreiben', 'onoffice-termine-sync', 'onoffice-test',
    'onoffice-upload-diagnose', 'onoffice-vorlagen-import', 'onoffice-waechter',
}
ENTFAELLT = ENTFAELLT | ONOFFICE_ENTFAELLT

# Ein Platzhalter-Host nach RFC 2606: die Endung .example ist reserviert und
# kann keinem echten Unternehmen gehoeren. Besser als eine erfundene Domain,
# die es morgen geben koennte.
HOST = 'immooffice.example'

# ---------------------------------------------------------------- Ersetzungen
# (Grund, Muster, Ersatz, Bemerkung) — Muster ist ein regulaerer Ausdruck.
# ===========================================================================
# Die Storage-Huelle, als eigener Text statt als Einzeiler in der Regel:
# sie ist inzwischen zu lang, um in einer Zeile noch lesbar zu sein.
#
# \1 ist die Einrueckung der Fundstelle, \2 die Zeile selbst, \3 der Name des
# Clients (admin oder db).
# ===========================================================================
SPEICHER_HUELLE = r"""\1\2
\1// --- Storage: Pfade tragen den Mandanten als erstes Segment -----------
\1// Gleiche Bauart wie die Huelle der Oberflaeche. Sie steht IM Handler und
\1// nicht auf Modulebene: eine Mandantenvariable auf Modulebene ueberlebt in
\1// Deno die Anfrage und traegt den Mandanten des einen Aufrufers in den
\1// naechsten. Genau das waere ein Leck statt einer Trennung.
\1// Solange immoMandant null ist, bleibt jeder Pfad unveraendert — die
\1// Funktion verhaelt sich dann wie bisher.
\1let immoMandant: string | null = null;
\1const immoSetzeMandant = (m: unknown) => { immoMandant = (typeof m === "string" && m) ? m : null; };
\1// Schriften sind Plattform-Gut, kein Mandanten-Branding. Sie liegen im
\1// Wurzelverzeichnis des Eimers unter fonts/. Fehlt eine, wird sie beim
\1// ersten Bedarf von ihrer Quelle geholt und dort abgelegt — danach nie
\1// wieder. Ein Mandant, der eine eigene Hausschrift hochlaedt, legt sie
\1// unter {mandant}/fonts/… und uebersteuert damit die der Plattform.
\1const IMMO_SCHRIFTEN: Record<string, string> = {
\1  "fonts/Montserrat-Regular.ttf":        "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Regular.ttf",
\1  "fonts/Montserrat-Bold.ttf":           "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Bold.ttf",
\1  "fonts/Montserrat-Light.ttf":          "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Light.ttf",
\1  "fonts/Montserrat-Medium.ttf":         "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Medium.ttf",
\1  "fonts/Montserrat-SemiBold.ttf":       "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBold.ttf",
\1  "fonts/Montserrat-Italic.ttf":         "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Italic.ttf",
\1  "fonts/Montserrat-SemiBoldItalic.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBoldItalic.ttf",
\1  "fonts/Marcellus-Regular.ttf":         "https://raw.githubusercontent.com/google/fonts/main/ofl/marcellus/Marcellus-Regular.ttf",
\1  "fonts/GreatVibes-Regular.ttf":        "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf",
\1};
\1{
\1  const immoEcht = \3.storage.from.bind(\3.storage);
\1  const immoVorne = (pf: unknown): unknown =>
\1    (typeof pf !== "string" || !pf || !immoMandant) ? pf
\1      : (pf === immoMandant || pf.startsWith(immoMandant + "/") ? pf : immoMandant + "/" + pf);
\1  const immoViele = (pf: unknown): unknown => Array.isArray(pf) ? pf.map(immoVorne) : immoVorne(pf);
\1  (\3.storage as any).from = (eimer: string) => {
\1    const api: any = immoEcht(eimer);
\1    const h: any = Object.create(api);
\1    for (const n of ["upload", "remove", "createSignedUrl",
\1                     "createSignedUrls", "getPublicUrl", "info", "exists"]) {
\1      if (typeof api[n] === "function") h[n] = (pf: unknown, ...r: unknown[]) => api[n](immoViele(pf), ...r);
\1    }
\1    // Lesen in drei Stufen: die Datei des Mandanten, sonst die der
\1    // Plattform, sonst — bei einer Schrift — einmal von der Quelle.
\1    // Geschrieben wird dabei nur ins Wurzelverzeichnis und nur eine
\1    // Schrift; Mandantendateien kann diese Stufe nicht anfassen.
\1    if (typeof api.download === "function") h.download = async (pf: unknown, ...r: unknown[]) => {
\1      const hole = async (p: unknown) => {
\1        try { return await api.download(p, ...r); } catch (e) { return { data: null, error: e }; }
\1      };
\1      const erst = await hole(immoViele(pf));
\1      if (erst?.data) return erst;
\1      if (typeof pf === "string" && immoMandant) {
\1        const zweit = await hole(pf);
\1        if (zweit?.data) return zweit;
\1      }
\1      if (eimer === "branding-assets" && typeof pf === "string" && IMMO_SCHRIFTEN[pf]) {
\1        try {
\1          const a = await fetch(IMMO_SCHRIFTEN[pf]);
\1          if (a.ok) {
\1            const roh = new Uint8Array(await a.arrayBuffer());
\1            try { await api.upload(pf, roh, { contentType: "font/ttf", upsert: true }); }
\1            catch (_e) { /* beim naechsten Mal wieder */ }
\1            console.log("Schrift nachgeladen:", pf, roh.byteLength);
\1            return { data: new Blob([roh]), error: null };
\1          }
\1        } catch (e) { console.warn("Schrift nicht erreichbar:", pf, String(e)); }
\1      }
\1      return erst;
\1    };
\1    if (typeof api.list === "function") {
\1      h.list = (pf?: string, ...r: unknown[]) => api.list(pf ? (immoVorne(pf) as string) : (immoMandant ?? pf), ...r);
\1    }
\1    for (const n of ["move", "copy"]) {
\1      if (typeof api[n] === "function") h[n] = (a: unknown, b: unknown, ...r: unknown[]) => api[n](immoVorne(a), immoVorne(b), ...r);
\1    }
\1    return h;
\1  };
\1}"""


ERSETZUNGEN = [
    # --- MARKE: vertrag-pdf traegt die drei Standorte der Referenz als Tabelle
    # im Quelltext — mit den Ortsnamen als Schluessel. Ein Block, eine Regel:
    # ein leerer Eintrag 'standard'. Die Werte gehoeren nach firma_stammdaten
    # (typ = 'standort'); das ist Phase 2.4 und steht in docs/OFFEN.md.
    ('MARKE',
     r'  rostock: \{ name: "Engfer & Partner Immobilien".*\n'
     r'  schwerin: \{ name: "Engfer & Partner Immobilien Schwerin".*\n'
     r'  berlin: \{ name: "Engfer & Partner Immobilien Berlin".*\n',
     '  standard: { name: "", firma: "", strasse: "", plzOrt: "", stadt: "" },\n',
     'Standorttabelle der Referenz in vertrag-pdf.'),
    # --- MARKE: muss VOR den Produktnamen-Regeln stehen, sonst bleibt die
    # Herkunft in der Mitte der Kennung stehen.
    ('MARKE', r'de\.engferundpartner\.epworld', 'de.immooffice.app',
     'Bundle-Kennung der iOS-App; sie gehoert zum Entwicklerkonto der Referenz.'),
    # --- MARKE: Adressen und Domains der Referenz
    ('MARKE', r'https://epworld\.netlify\.app', f'https://{HOST}',
     'Portal-Adresse der Referenz. Steht ueberall als Rueckfallwert hinter '
     'PORTAL_URL bzw. EXPOSE_FREIGABE_BASIS; der Platzhalter macht sichtbar, '
     'dass die Variable gesetzt werden muss.'),
    ('MARKE', r'https://(www\.)?engferundpartner\.(de|com)', f'https://{HOST}',
     'Webauftritt der Referenz (Datenschutz, AGB, Impressum).'),
    ('MARKE', r'@engferundpartner\.(de|com)\b', f'@{HOST}',
     'Maildomain der Referenz in Absender- und Empfaengervorgaben.'),
    ('MARKE', r'@engferundpartner\b', f'@{HOST}',
     'wie oben, ohne Endung geschrieben'),
    ('MARKE', r'engferundpartner\.(de|com)', HOST, 'Domain der Referenz im Fliesstext'),

    # --- MARKE: Firmenname in allen Schreibweisen
    ('MARKE', r'ENGFER\s*&(amp;)?\s*PARTNER\s+IMMOBILIEN', 'MUSTERHAUS IMMOBILIEN',
     'Firmenname in Versalien, im Kopf von HTML-Mails.'),
    ('MARKE', r'Engfer\s*&amp;\s*Partner\s+Immobilien', 'Musterhaus Immobilien GmbH',
     'Firmenname HTML-maskiert.'),
    ('MARKE', r'Engfer\s*&\s*Partner\s+Immobilien', 'Musterhaus Immobilien GmbH',
     'Firmenname im Klartext.'),
    ('MARKE', r'Engfer\s*&amp;\s*Partner', 'Musterhaus Immobilien',
     'Firmenname ohne Zusatz, HTML-maskiert.'),
    ('MARKE', r'Engfer\s*&\s*Partner', 'Musterhaus Immobilien',
     'Firmenname ohne Zusatz.'),
    ('MARKE', r'\bENGFER\b', 'MUSTERHAUS', 'Wortmarke in Versalien.'),
    ('MARKE', r'EngferPortal', 'ImmoOffice',
     'Kennung im User-Agent beim Abruf fremder Seiten.'),
    ('MARKE', r'engferportal', 'immooffice', 'wie oben, klein geschrieben'),
    ('MARKE', r'EngferPartnerIntranet|engferpartnerintranet', 'ImmoOffice',
     'Kennung der Referenz in Fremdsystem-Aufrufen.'),
    ('MARKE', r'engfer-partner-logo\.png', 'logo.png',
     'Dateiname des Logos im Bucket branding-assets.'),
    ('MARKE', r'Engfer-Blau', 'Markenblau', 'Farbbezeichnung in einem Kommentar.'),
    ('MARKE', r'\bE&P\s*World\b', 'ImmoOffice', 'Produktname der Referenz.'),
    ('MARKE', r'\bE&amp;P\s*World\b', 'ImmoOffice', 'Produktname HTML-maskiert.'),
    ('MARKE', r'\bepworld\b', 'immooffice', 'Produktname klein geschrieben.'),
    ('MARKE', r'\bep-world\b', 'immooffice', 'Produktname mit Bindestrich.'),
    ('MARKE', r'\bEP[- ]?World\b', 'ImmoOffice',
     'Produktname ohne kaufmaennisches Und — steht als sendersoftware im '
     'OpenImmo-Export und in einem User-Agent.'),
    ('MARKE', r'\bE&P\s*Immobilien\b', 'Musterhaus Immobilien GmbH', 'Firmenname kurz.'),

    # --- MARKE: das Kuerzel allein.
    #
    # Gefunden am 28.09.2026 beim Lesen der oeffentlichen Endpunkte. Vier
    # Stellen tragen "E&P" ohne "World" und ohne "Immobilien" dahinter — zwei
    # Kommentare, eine Regel in einem KI-Auftrag und, am schlimmsten, eine
    # Testfrage im Bewerberfragebogen, die einem Bewerber unter die Augen
    # kommt: "Frau Peters beauftragt E&P, einen Nachmieter zu finden."
    #
    # docs/NEUTRALITAET.md fuehrt "E&P" seit jeher als eigenes Kennzeichen.
    # Das Gate hat es trotzdem durchgelassen: sein Muster verlangte hinter
    # dem Kuerzel entweder "World" oder "Immobilien". scripts/neutral.sh
    # prueft es jetzt fuer sich allein.
    #
    # Die vier Ersetzungen stehen einzeln statt als eine Regel auf "E&P",
    # weil jede etwas anderes an die Stelle setzen muss. Eine pauschale
    # Ersetzung haette aus "die E&P-Regel" "die ImmoOffice-Regel" gemacht —
    # ein Produktname, wo eine Hausregel gemeint ist.
    ('MARKE', r'HTML-Mails im E&P-Design', 'HTML-Mails im Design des Mandanten',
     'Kuerzel der Referenz im Kommentar zum Mail-Entwurf.'),
    ('MARKE', r'Frau Peters beauftragt E&P, einen Nachmieter',
     'Frau Peters beauftragt ein Maklerbüro, einen Nachmieter',
     'Kuerzel der Referenz in einer Frage des Bewerbertests.'),
    ('MARKE', r'gegen die E&P-Regel je Objektart',
     'gegen die Provisionsregel des Hauses je Objektart',
     'Kuerzel der Referenz in der Anweisung an die Expose-Pruefung.'),
    ('MARKE', r'explizite Freigabe im\n//   E&P-World-Portal', 'explizite Freigabe im\n//   Neubauportal',
     'Kuerzel der Referenz im Kommentar des Neubauportals.'),
    # Was nach den Regeln oben noch uebrig bleibt, ist der blosse Nachname.
    ('MARKE', r'\bEngfer\b', 'Musterhaus', 'Nachname der Referenz, Restfaelle.'),
    ('MARKE', r'\bengfer\b', 'musterhaus', 'wie oben, klein geschrieben'),

    # --- MARKE: Bezeichner im Quelltext. Der Unterstrich ist ein Wortzeichen,
    # deshalb greift die Regel fuer die blosse Wortmarke hier nicht.
    ('MARKE', r'\bENGFER_', 'STIL_',
     'Konstantennamen der Stilvorgaben in generate-text.'),

    # --- MARKE: Anschriften der Referenz als fest verdrahtete Rueckfallwerte.
    # Ersatzlos: eine erfundene Anschrift waere schlimmer als gar keine, und
    # die richtige Quelle ist firma_stammdaten (Phase 2.4).
    ('MARKE', r'"Am V(ö|oe)genteich 26 ?[rR], 18055 Rostock"', '""',
     'Bueroanschrift der Referenz, einzeilig.'),
    ('MARKE', r'(strasse: )"Am V(ö|oe)genteich 26 ?[rR]"', r'\1""',
     'Bueroanschrift der Referenz, Strassenfeld.'),
    ('MARKE', r'(plz: )"18055"', r'\1""', 'Postleitzahl der Referenz.'),
    ('MARKE', r'(ort: )"Rostock"', r'\1""', 'Ort der Referenz.'),
    ('MARKE', r'\.replace\("Voegenteich", "V(ö|oe)genteich"\)', '',
     'Umlaut-Reparatur fuer den Strassennamen der Referenz — ohne die Strasse '
     'gegenstandslos.'),

    # --- MARKE: Standorte der Referenz in KI-Anweisungen
    ('MARKE', r'\(Rostock, Schwerin, Berlin\)', '', 'Standortliste der Referenz.'),
    ('MARKE', r'\(Rostock\)', '', 'Standort der Referenz.'),

    # --- PHASE14: gestrichene Dienste in Absenderlisten
    # Die Namen stehen in Listen von Absendern, die kein Lead und keine
    # Abwesenheitsantwort sind. Kein Aufruf des Dienstes, nur eine Zeichenkette.
    # Sie fallen trotzdem heraus: der Fork bindet diese Dienste nicht an, also
    # gehoeren ihre Domains auch nicht in eine Ausnahmeliste.
    ('PHASE14', r'"sipgate\.de", ', '', 'Absenderliste akq-mail-leads'),
    ('PHASE14', r'"jotform\.com", ', '', 'Absenderliste akq-mail-leads'),
    ('PHASE14', r'\|jotform', '', 'Absenderfilter mail-abwesenheit-verarbeiten'),
    ('PHASE14', r'\|sipgate', '', 'Absenderfilter mail-abwesenheit-verarbeiten'),
    ('PHASE14', r'\|yodeck', '', 'Absenderfilter mail-abwesenheit-verarbeiten'),
    ('PHASE14', r'\(SPRENGNETTER\)', '(Bewertungsdienst)',
     'Anbietername in einer KI-Anweisung; die Anweisung bleibt verstaendlich.'),
    ('PHASE14', r'z\. B\. von Sprengnetter', 'z. B. von einem Bewertungsdienst',
     'wie oben'),
    ('PHASE14', r'z\.B\. "sprengnetter"', 'z.B. "bewertungsdienst"',
     'Beispiel in einem Kommentar'),

    # ------------------------------------------------------------------
    # Nachtrag 28.09.2026. Die Regeln oben haben die Marke getroffen, aber
    # drei Klassen von Kennzeichen uebersehen — gefunden erst, als das
    # Neutralitaets-Gate selbst repariert war (siehe scripts/neutral.sh):
    #   1. Umlaute in \uXXXX-Schreibweise. Die Bueroanschrift der Referenz
    #      steht in energieausweis-anfrage als "Vögenteich"; das Muster
    #      V(oe|ö)genteich geht daran vorbei.
    #   2. Die Rufnummer der Referenz. Sie stand in keiner Regel.
    #   3. Die Standorte der Referenz — als Rueckfallwert, als Schluessel
    #      einer Standorttabelle, als Hashtag und als Beispiel in
    #      KI-Anweisungen.
    # ------------------------------------------------------------------

    # --- MARKE: Rufnummer der Referenz. Ueberall ein Rueckfallwert hinter
    # firma_stammdaten.telefon. Ersatzlos, aus demselben Grund wie bei der
    # Anschrift: eine erfundene Nummer waere schlimmer als keine.
    ('MARKE', r'"0381 36 77 99 88"', '""',
     'Rufnummer der Referenz als Rueckfallwert.'),
    ('MARKE', r'korrekte Telefonnummer 0381 36 77 99 88 \(', 'korrekte Telefonnummer (',
     'Rufnummer der Referenz in einem Aenderungsvermerk.'),
    ('MARKE', r'Telefon 0381 36 77 99 88 &nbsp;\\u00b7&nbsp; ', '',
     'Rufnummer im Fuss der HTML-Mail des Energieausweis-Fragebogens.'),

    # --- MARKE: Bueroanschrift der Referenz in \uXXXX-Schreibweise.
    ('MARKE', r'&nbsp;\\u00b7&nbsp; Am V\\u00f6genteich 26 R, 18055 Rostock', '',
     'Anschrift im Fuss der HTML-Mail.'),
    ('MARKE', r' "Am V\\u00f6genteich 26 R, 18055 Rostock", "Tel\.: 0381 36 77 99 88",', '',
     'Anschrift und Rufnummer im Signaturblock der Bestaetigungsmail.'),
    ('MARKE', r', Am V\\u00f6genteich 26 R, 18055 Rostock, Tel\.: 0381 36 77 99 88,', ',',
     'Anschrift und Rufnummer in der Widerrufsbelehrung. Der gesetzliche '
     'Mustertext bleibt, die Angaben des Betreibers fallen heraus — sie '
     'gehoeren nach firma_stammdaten (Phase 2.4).'),
    ('MARKE', r', Am V\\u00f6genteich 26 R, 18055 Rostock', '',
     'Anschrift in der Anschrift-Zeile des Muster-Widerrufsformulars.'),

    # --- MARKE: Marken- und Regional-Hashtags der Referenz in den
    # Anweisungen fuer die Social-Media-Texte.
    ('MARKE', r'#engferundpartner #rostock #mecklenburgvorpommern', '#immobilienmakler',
     'Marken-Hashtag der Referenz und ihre Regional-Hashtags.'),
    ('MARKE', r' aus Rostock\.', '.',
     'Sitz der Referenz in den Rollenbeschreibungen der Social-Media-Texte.'),

    # --- MARKE: Sitz der Referenz in KI-Anweisungen. Je Stelle eine Regel,
    # weil der Satzbau jedes Mal anders ist und ein allgemeines Muster fuer
    # "Rostock" auch echte Objektdaten treffen wuerde.
    ('MARKE', r'\nin Rostock\. Du hilfst', '\nDu hilfst', 'Sitz in claude-chat.'),
    ('MARKE', r'GmbH in Rostock,', 'GmbH,', 'Sitz in mail-ki-vorschlag.'),
    ('MARKE', r' GmbH, Rostock\)', ' GmbH)', 'Sitz in objekt-wissen-auslesen.'),
    ('MARKE', r', Rostock/Schwerin/Berlin\)', ')', 'Standortliste in akq-mail-leads.'),

    # --- MARKE: Standorte als Rueckfallwerte und Schluessel.
    ('MARKE', r'ort_unterzeichnung \|\| "Rostock"', 'ort_unterzeichnung || ""',
     'Unterzeichnungsort in Reservierung und Signaturvorgang.'),
    ('MARKE', r'\|\| "ROSTOCK"', '|| ""',
     'Standortzeile im Fuss der Expose- und MPE-PDFs.'),
    ('MARKE', r'"rostock"', '"standard"',
     'Slug des Hauptstandorts der Referenz — Rueckfall bei firma_stammdaten.'),
    ('MARKE', r'"ep-immobilien"', '"standard"',
     'Derselbe Standort unter seinem zweiten Slug. Das Gate hat ihn bis zum '
     '28.09.2026 nicht gesehen: sein Muster verlangte ein kaufmaennisches Und '
     'oder gar kein Trennzeichen.'),
    ('MARKE', r'gesperrt\("ROSTOCK   -   SCHWERIN   -   BERLIN"', 'gesperrt(""',
     'Standortzeile im Briefkopf von brief-pdf-erzeugen.'),

    # --- MARKE: Standorte in Beispielen fuer die KI-Auslese.
    ('MARKE', r'\(z\. B\. 18055 ROSTOCK\)', '(z. B. 12345 MUSTERSTADT)',
     'Beispiel-Postleitzahl in parse-expose.'),
    ('MARKE', r'"Stra(ß|ss)e 12, 18055 Rostock"', '"Musterstrasse 12, 12345 Musterstadt"',
     'Beispiel-Anschrift im Kopfkommentar von entfernungen-berechnen.'),
    ('MARKE', r'"(plz|objekt_plz)": "1805[57]"', r'"\1": "12345"',
     'Beispiel-Postleitzahl in parse-objektnachweis.'),
    ('MARKE', r'"(ort|geburtsort|objekt_ort)": "Rostock"', r'"\1": "Musterstadt"',
     'Beispiel-Ort in parse-objektnachweis.'),
    ('MARKE', r'Schwerin liegt rund 55 km entfernt, die Hansestadt Rostock etwa 70 km\.',
     'Die naechste Kreisstadt liegt rund 25 km entfernt, die naechste '
     'Grossstadt etwa 70 km.',
     'Beispiel-Lagetext in generate-text; er nennt die Sitze der Referenz.'),
    ('MARKE', r'Wohnung in Warnem(ü|ue)nde', 'Wohnung in Musterstadt',
     'Beispiel-Expose im Bewerbertest.'),
    ('MARKE', r'im Rostocker Ortsteil Markgrafenheide', 'im Ortsteil Musterdorf',
     'wie oben'),
    ('MARKE', r'Titel "Warnemuende" vs\. Text "Markgrafenheide"',
     'Titel "Musterstadt" vs. Text "Musterdorf"',
     'Loesungsschluessel zum Beispiel-Expose; er muss zum Text oben passen.'),
    ('MARKE', r'STANDORTE\.rostock', 'STANDORTE.standard',
     'Schluessel der Standorttabelle ohne Anfuehrungszeichen — der Zugriff '
     'auf den Hauptstandort in vertrag-pdf und signatur-vorgang-starten.'),

    # --- MARKE: Standorte in Kommentaren. Das Gate laesst Kommentarzeilen
    # durch — ein Kommentar ruft nichts auf. Hier stehen sie trotzdem, weil
    # sie den Sitz der Referenz nennen.
    ('MARKE', r'R(ü|ue)ckfall Rostock', 'Rueckfall leer',
     'Kommentar in expose-freigabe und objekt-landing.'),
    ('MARKE', r'const BUERO_TELEFON = "";   // R(ü|ue)ckfall, wenn die '
              r'Gesellschaft keine B(ü|ue)ronummer hinterlegt hat',
     'const BUERO_TELEFON = "";   // Rueckfall, wenn die Gesellschaft keine '
     'Bueronummer hinterlegt hat',
     'Umlaute im Kommentar daneben — nur Kosmetik, damit die Zeile lesbar bleibt.'),

    # --- FORK: Feiertage fuer alle sechzehn Bundeslaender.
    # Die Vorlage rechnet nur mit Mecklenburg-Vorpommern — dem Sitz der
    # Referenz. Ein Mandant in Bayern bekaeme damit zwei Feiertage zu
    # wenig und einen zu viel, und niemand saehe es: die Zahl sieht
    # plausibel aus. Dieselbe Rechnung steht in der Oberflaeche
    # (scripts/oberflaeche-zerlegen.py, feiertage_alle_laender).
    ('FORK',
     r'(?s)function feiertageMV\(jahr: number\): Set<string> \{.*?\n\}',
     'function feiertage(jahr: number, land?: string | null): Set<string> {\n  // Gesetzliche Feiertage eines Bundeslandes. Gleiche Rechnung wie in der\n  // Oberflaeche (src/app/anwendung.js) — laufen die beiden auseinander,\n  // widerspricht die Erinnerung des Chefs dem, was der Mitarbeiter sieht.\n  //\n  // Ohne Land bleiben die neun bundesweiten Feiertage stehen: lieber zu\n  // wenige als falsche. Das Land kommt aus firma_stammdaten.bundesland des\n  // Standorts.\n  //\n  // Nicht enthalten, weil nicht landesweit gesetzlich: Fronleichnam in\n  // Sachsen und Thueringen, Mariae Himmelfahrt in Bayern (je nur in\n  // bestimmten Gemeinden) und das Augsburger Friedensfest.\n  const code = String(land || "").toUpperCase();\n  const iso = (d: Date) => d.toISOString().slice(0, 10);\n  const plus = (d: Date, n: number) => { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; };\n  const o = osterSonntag(jahr);\n  const tage = [`${jahr}-01-01`, `${jahr}-05-01`, `${jahr}-10-03`, `${jahr}-12-25`, `${jahr}-12-26`,\n                iso(plus(o, -2)), iso(plus(o, 1)), iso(plus(o, 39)), iso(plus(o, 50))];\n  const wenn = (laender: string[], wert: string) => { if (laender.indexOf(code) >= 0) tage.push(wert); };\n  wenn(["BW", "BY", "ST"], `${jahr}-01-06`);\n  wenn(["BE", "MV"], `${jahr}-03-08`);\n  wenn(["BB"], iso(o));\n  wenn(["BB"], iso(plus(o, 49)));\n  wenn(["BW", "BY", "HE", "NW", "RP", "SL"], iso(plus(o, 60)));\n  wenn(["SL"], `${jahr}-08-15`);\n  wenn(["TH"], `${jahr}-09-20`);\n  wenn(["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH"], `${jahr}-10-31`);\n  wenn(["BW", "BY", "NW", "RP", "SL"], `${jahr}-11-01`);\n  if (code === "SN") {\n    for (let tag = 16; tag <= 22; tag++) {\n      const d = new Date(Date.UTC(jahr, 10, tag));\n      if (d.getUTCDay() === 3) { tage.push(d.toISOString().slice(0, 10)); break; }\n    }\n  }\n  return new Set(tage);\n}\nfunction feiertageMV(jahr: number): Set<string> {\n  // Alter Name, damit die Aufrufstellen unveraendert bleiben. Das Land setzt\n  // urlaubBundesland, einmal je Lauf aus firma_stammdaten gelesen.\n  return feiertage(jahr, urlaubBundesland);\n}\nlet urlaubBundesland: string | null = null;',
     'Feiertage: alle sechzehn Bundeslaender statt nur Mecklenburg-Vorpommern.'),

    # --- FORK: das Bundesland einmal je Lauf laden.
    # Ohne diese Zeile bliebe urlaubBundesland null, und die Funktion rechnete
    # mit den neun bundesweiten Feiertagen — richtig, aber unvollstaendig.
    #
    # Der Anker ist mit Bedacht gewaehlt: "jahresende" steht in genau dieser
    # einen Funktion. Der erste Versuch haengte die Zeile hinter die
    # antwort-Hilfsfunktion — die steht wortgleich in siebzehn Funktionen, und
    # sechzehn davon kennen urlaubBundesland nicht. Die Haeufigkeitsbremse
    # greift dort nicht, weil es je Datei nur ein Treffer ist.
    #
    # Solange ein Konto nur einen Standort hat, ist firma_stammdaten die
    # richtige Quelle; sobald Mitarbeiter einem Standort zugeordnet sind
    # (Auftrag 1b), gehoert das Land an den Mitarbeiter. Steht in docs/OFFEN.md.
    ('FORK',
     r'(const modus = body\.modus \|\| \(monat >= 9 \? "jahresende" : "uebertrag"\);)',
     r'\1\n    urlaubBundesland = (await db.from("firma_stammdaten")'
     r'.select("bundesland").not("bundesland", "is", null)'
     r'.order("sortierung").limit(1).maybeSingle()).data?.bundesland ?? null;',
     'Bundesland des Standorts einmal je Lauf laden.'),

    # --- FORK: Storage-Huelle in jeder Funktion, die Dateien anfasst.
    # Die Huelle stellt jedem Pfad den Mandanten voran, sobald
    # immoSetzeMandant() ihn kennt. Vorher bleibt alles wie bisher — eine
    # Funktion, die ihren Mandanten noch nicht ermittelt, schreibt weiter
    # an den alten Ort und geht nicht kaputt.
    #
    # SEIT DEM 28.09.2026 kann sie auch LESEN, und das ist der Grund, warum
    # die Liste unten laenger geworden ist. Gemeldet war: "man kann keine
    # Exposes generieren, keine PDFs, keine Rechnungen". Die Ursache stand im
    # Protokoll: expose-pdf-erzeugen bricht mit 500 "Basis-Fonts fehlen in
    # branding-assets" ab, weil Montserrat-Regular, Montserrat-Bold und
    # Marcellus im Eimer schlicht nicht liegen — die Vorlage hatte sie, der
    # Fork hat sie nie bekommen. Dazu kam mein eigener Fehler aus fork_08:
    # der Umzug ins Mandantenverzeichnis, ohne dass die lesenden Funktionen
    # davon wussten.
    #
    # Beides loest die Huelle an einer Stelle statt in zehn:
    #
    #   1. LESEN faellt auf das Wurzelverzeichnis zurueck. Schriften sind
    #      Plattform-Gut, kein Mandanten-Branding — sie 450 KB weise fuer
    #      jeden neuen Mandanten zu kopieren waere Unfug. Sie liegen unter
    #      fonts/, ein Mandant uebersteuert sie spaeter mit einer eigenen
    #      Datei unter {mandant}/fonts/… (Abschnitt 2a des Auftrags).
    #      Kein Leck: unter der Wurzel liegt seit fork_08 nichts
    #      Mandantenbezogenes mehr, und SCHREIBEN bleibt praefixiert.
    #
    #   2. Fehlt eine Plattform-Schrift ganz, wird sie einmal von ihrer
    #      Quelle geholt und abgelegt. Das ist nicht neu erfunden: genau so
    #      heilen sich expose-pdf-erzeugen und mpe-pdf-erzeugen in der
    #      Vorlage schon selbst (FONT_QUELLEN). Neu ist nur, dass es fuer
    #      alle Schnitte gilt und in jeder Funktion.
    ('FORK',
     r'(?m)^([ \t]*)(const (admin|db) = createClient\(.*\);)$',
     SPEICHER_HUELLE,
     'Storage-Huelle: Mandantenpfad, Rueckfall auf die Plattform, Selbstheilung der Schriften.',
     {'expose-pdf-erzeugen', 'mpe-pdf-erzeugen', 'energieausweis-anfrage',
      'eigentuemer-dokument-uebernehmen', 'signatur-unterschreiben',
      'mail-anhaenge-diagnose', 'brief-pdf-erzeugen', 'web-asset-kopieren',
      'bild-empfang', 'eigentuemer-report-pdf', 'signatur-vorgang-starten',
      'rechnung-pdf-erzeugen', 'vertrag-pdf', 'mietvertrag-pdf',
      'reservierung-pdf-erzeugen', 'reservierung-word-erzeugen'}),

    # =====================================================================
    # FORK — oeffentliche Endpunkte schrieben Zeilen ohne Mandanten
    #
    # GEFUNDEN am 28.09.2026 beim Lesen der oeffentlichen Endpunkte: 47
    # Einfuegungen in 18 Funktionen, alle in Tabellen der Gruppe MANDANT,
    # keine einzige mit mandant_id.
    #
    # WARUM DAS EIN FEHLER IST, DER SICH VERSTECKT: mandant_id traegt den
    # Standardwert aktuelle_mandant_id(). Der liest den Mandanten aus dem
    # Anmelde-Token. Ein Aufruf ohne Token hat keinen — der Standard ist dann
    # NULL, und die Zeile entsteht ohne Mandanten. Die restriktive Richtlinie
    # aus fork_07 vergleicht mandant_id mit dem Mandanten des Lesers, und
    # NULL ist mit nichts gleich. Die Zeile ist fuer JEDEN unsichtbar.
    #
    # Es gibt keine Fehlermeldung. Der Interessent stellt seine Frage auf der
    # Objektseite, die Zeile entsteht, und kein Makler sieht sie je.
    #
    # Buch darueber fuehrt tests/oeffentlich-insert-mandant.py. Hier die
    # erste Haelfte: die Stellen, an denen der Mandant schon in Reichweite
    # liegt — am Vorgang, an der Einladung, in der Storage-Huelle.
    # =====================================================================

    # Signatur: jedes Ereignis gehoert dem Mandanten seines Vorgangs. Acht
    # Fundstellen in der einen Funktion, zwei in der anderen — alle beginnen
    # mit vorgang_id, deshalb reicht ein Muster.
    ('FORK',
     r'\.from\("signatur_events"\)\.insert\(\{(\s*)vorgang_id: vorgang\.id,',
     r'.from("signatur_events").insert({\1mandant_id: vorgang.mandant_id, vorgang_id: vorgang.id,',
     'Signatur-Ereignisse tragen den Mandanten ihres Vorgangs.',
     {'signatur-unterschreiben', 'signatur-token-validieren'}),

    ('FORK',
     r'\.from\("eigentuemer_dokumente"\)\.insert\(\{\n(\s*)eigentuemer_id: eigentuemerId,',
     r'.from("eigentuemer_dokumente").insert({\n\1mandant_id: vorgang.mandant_id,\n\1eigentuemer_id: eigentuemerId,',
     'Die abgelegte Vertragskopie traegt den Mandanten des Vorgangs.',
     {'signatur-unterschreiben'}),

    # Bewerbertest: die Antworten gehoeren dem Mandanten, der eingeladen hat.
    # Ohne das haette der Bewerber den Test ausgefuellt und niemand haette
    # das Ergebnis je gesehen.
    ('FORK',
     r'\.from\("bewerber_antworten"\)\.insert\(\{\n(\s*)einladung_id: einladung\.id,',
     r'.from("bewerber_antworten").insert({\n\1mandant_id: einladung.mandant_id,\n\1einladung_id: einladung.id,',
     'Die Testantworten tragen den Mandanten der Einladung.',
     {'bewerbertest-abgeben'}),

    # Bilder: der Mandant steht schon in der Storage-Huelle, gesetzt aus der
    # Ziel-Immobilie. Die Datei-Zeile bekommt ihn jetzt auch.
    ('FORK',
     r'\.from\("immobilie_datei"\)\.insert\(\{\n(\s*)immobilie_id: (meta|z)\.immobilie_id,',
     r'.from("immobilie_datei").insert({\n\1mandant_id: immoMandant,\n\1immobilie_id: \2.immobilie_id,',
     'Die Datei-Zeile traegt den Mandanten der Immobilie.',
     {'bild-empfang', 'mail-anhaenge-diagnose'}),

    # Energieausweis: immoSetzeMandant(mandant) steht ein paar Zeilen davor.
    ('FORK',
     r'\.from\("energieausweis_anfragen"\)\.insert\(\{\n(\s*)id: vorgang,',
     r'.from("energieausweis_anfragen").insert({\n\1mandant_id: immoMandant,\n\1id: vorgang,',
     'Die Anfrage traegt den Mandanten, den die Funktion ermittelt hat.',
     {'energieausweis-anfrage'}),

    # Akquise: das Eingangsprotokoll gehoert dem Mandanten der Anfrage.
    # Die Hilfsfunktion darueber bestimmt ihn bereits; hier wird er nur
    # weitergereicht. Bleibt er unbekannt, bleibt die Zeile ohne — ein
    # Protokolleintrag ohne Mandanten ist besser als kein Protokoll.
    # Der Protokolleintrag entsteht an Stellen, an denen der Mandant noch
    # nicht feststeht (Rate-Limit, fehlerhafte Anfrage). Deshalb eine
    # Veraenderliche neben ipHash und email statt eines weiteren Parameters:
    # sobald der Mandant bekannt ist, traegt jeder folgende Eintrag ihn.
    # Vorher bleibt er leer — ein Protokolleintrag ohne Mandanten ist besser
    # als kein Protokoll, und abgewiesen wurde die Anfrage ja gerade, WEIL
    # kein Mandant zu ihr gehoerte.
    ('FORK',
     r'(  let ipHash = "";\n  let email = "";)',
     r'\1\n  let mandantLog: string | null = null;',
     'Akquise-Protokoll: Platz fuer den Mandanten.',
     {'akq-lead-eingang'}),
    ('FORK',
     r'\.from\("akq_eingang_log"\)\.insert\(\{ ip_hash: ipHash, email, ergebnis \}\)',
     '.from("akq_eingang_log").insert({ mandant_id: mandantLog, ip_hash: ipHash, email, ergebnis })',
     'Akquise-Protokoll traegt den Mandanten der Anfrage.',
     {'akq-lead-eingang'}),

    # --- MARKE: die Stilbeispiele fuer die KI beschreiben ein echtes Objekt
    # der Referenz — Ort, Landkreis, Naturpark, Grundstuecksgroesse,
    # Baujahr. Sie stehen im Auftrag an das Sprachmodell und praegen jeden
    # erzeugten Text. Der STIL ist das Gewollte, nicht das Objekt; deshalb
    # dieselbe Machart mit erfundenen Angaben.
    ('MARKE',
     r'`Dieser liebevoll gepflegte und vollständig möblierte Bungalow befindet sich in idyllischer Naturlage in Dobbertin, nur wenige Gehminuten vom Dobbertiner See entfernt\. Das ca\. 354 m² große Eigentumsgrundstück liegt ruhig am Ende einer kleinen Sackgasse innerhalb einer gewachsenen Bungalowsiedlung und bietet ein hohes Maß an Privatsphäre\. Der Bungalow verfügt über ca\. 39 m² Wohnfläche, verteilt auf zwei Zimmer und wird durch eine sonnige, teilweise überdachte Terrasse in Südlage ergänzt\. Das ursprünglich ca\. 1974 errichtete Gebäude wurde ab 2015 umfassend energetisch saniert und in den Folgejahren fortlaufend modernisiert\.`',
     '`Dieser liebevoll gepflegte und vollständig möblierte Bungalow befindet '
     'sich in idyllischer Naturlage in Musterdorf, nur wenige Gehminuten vom '
     'Mustersee entfernt. Das ca. 354 m² große Eigentumsgrundstück liegt ruhig '
     'am Ende einer kleinen Sackgasse innerhalb einer gewachsenen '
     'Bungalowsiedlung und bietet ein hohes Maß an Privatsphäre. Der Bungalow '
     'verfügt über ca. 39 m² Wohnfläche, verteilt auf zwei Zimmer und wird '
     'durch eine sonnige, teilweise überdachte Terrasse in Südlage ergänzt. '
     'Das ursprünglich ca. 1974 errichtete Gebäude wurde ab 2015 umfassend '
     'energetisch saniert und in den Folgejahren fortlaufend modernisiert.`',
     'Stilbeispiel der KI: ein echtes Objekt der Referenz.'),
    ('MARKE',
     r'`Die Immobilie befindet sich in ruhiger und naturnaher Lage in Dobbertin im Landkreis Ludwigslust-Parchim\. Der Ort liegt mitten im Naturpark Nossentiner/Schwinzer Heide\. Die naechste Kreisstadt liegt rund 25 km entfernt, die naechste Grossstadt etwa 70 km\.`',
     '`Die Immobilie befindet sich in ruhiger und naturnaher Lage in Musterdorf '
     'im Landkreis Musterkreis. Der Ort liegt mitten in einem Naturpark. Die '
     'naechste Kreisstadt liegt rund 25 km entfernt, die naechste Grossstadt '
     'etwa 70 km.`',
     'Stilbeispiel der KI: die Lagebeschreibung desselben Objekts.'),

    # =====================================================================
    # FORK — die letzten drei Einfuegungen ohne Mandanten
    #
    # Nach fork_22 und fork_27 blieben drei uebrig, bei denen kein
    # Elternsatz half. Jede hat ihre eigene Quelle, und die steht hier.
    # =====================================================================

    # Der Interessent, der sich ein Expose herunterlaedt, gehoert dem
    # Mandanten des OBJEKTS — nicht dem des Ersten, der zufaellig passt. Ein
    # Kontakt hat keinen Elternsatz, er ist selbst einer.
    ('FORK',
     r'\.from\("kontakte"\)\.insert\(\{ vorname, nachname, email, rollen: \["interessent"\], quelle: "newsletter", aktiv: true,',
     '.from("kontakte").insert({ mandant_id: im.mandant_id, vorname, nachname, email, rollen: ["interessent"], quelle: "newsletter", aktiv: true,',
     'Expose-Freigabe: der neue Interessent traegt den Mandanten des Objekts.',
     {'expose-freigabe'}),

    # Das Briefing ist fuer alle Mandanten dasselbe — Branchennachrichten
    # sind es ja auch. Erzeugt wird es EINMAL, ein KI-Aufruf; gespeichert je
    # Mandant, weil die Tabelle seit fork_05 eine Mandantenzuordnung traegt
    # und die Zeile ohne sie fuer jeden unsichtbar waere.
    #
    # Der Konfliktschluessel muss mitziehen: fork_17 hat die Eindeutigkeit
    # von briefing_datum auf (mandant_id, briefing_datum) umgestellt. Ein
    # upsert auf den alten Schluessel faende gar keine Regel mehr und
    # brueche ab.
    ('FORK',
     r'      \.upsert\(\{\n        briefing_datum: heute,\n        zusammenfassung: briefingText,\n        themen,\n        quellen: alleArtikel\.map\(a => \(\{\n          quelle: a\.quelle,\n          titel: a\.titel,\n          link: a\.link,\n          pub_datum: a\.pub_datum,\n        \}\)\),\n        anzahl_artikel: alleArtikel\.length,\n        modell,\n      \}, \{ onConflict: "briefing_datum" \}\)',
     '      .upsert(((await admin.from("mandanten").select("id")).data || []).map((m: any) => ({\n'
     '        mandant_id: m.id,\n'
     '        briefing_datum: heute,\n'
     '        zusammenfassung: briefingText,\n'
     '        themen,\n'
     '        quellen: alleArtikel.map(a => ({\n'
     '          quelle: a.quelle,\n'
     '          titel: a.titel,\n'
     '          link: a.link,\n'
     '          pub_datum: a.pub_datum,\n'
     '        })),\n'
     '        anzahl_artikel: alleArtikel.length,\n'
     '        modell,\n'
     '      })), { onConflict: "mandant_id,briefing_datum" })',
     'News-Briefing: je Mandant eine Zeile, aus einem Lauf.',
     {'news-briefing-erstellen'}),

    # Die Idempotenzpruefung traf vorher genau eine Zeile. Ab dem zweiten
    # Mandanten trifft sie mehrere, und maybeSingle() bricht ab.
    ('FORK',
     r'\.from\("news_briefings"\)\.select\("id"\)\.eq\("briefing_datum", heute\)\.maybeSingle\(\);',
     '.from("news_briefings").select("id").eq("briefing_datum", heute).limit(1).maybeSingle();',
     'News-Briefing: die Idempotenzpruefung vertraegt mehrere Mandanten.',
     {'news-briefing-erstellen'}),

    # Der Diagnose-Eintrag gehoert dem Mandanten, dessen Portalzugang
    # geprueft wurde.
    ('FORK',
     r'  await db\.from\("onoffice_diagnose"\)\.insert\(\{\n    test: ',
     '  await db.from("onoffice_diagnose").insert({\n    mandant_id: z?.mandant_id ?? null,\n    test: ',
     'Portal-Diagnose: der Eintrag traegt den Mandanten des Zugangs.',
     {'portal-ftp-diagnose'}),

    # =====================================================================
    # FORK — das Neubauportal verschickte Post ueber ein fremdes Postfach
    #
    # holePostfach() nahm "das erste aktive Postfach". Mit einem Mandanten
    # faellt das nicht auf; ab dem zweiten geht die Einladung zum
    # Kundenbereich des einen Bautraegers ueber den SMTP-Zugang des anderen
    # hinaus — mit dessen Absenderadresse im Von. Das ist kein
    # Schoenheitsfehler: der Empfaenger sieht einen fremden Absender, und der
    # fremde Mandant sieht den Versand in seinem Postfach.
    #
    # Ohne Mandanten lieber GAR KEIN Postfach. Eine Mail, die nicht rausgeht
    # und im Protokoll steht, ist besser als eine mit falschem Absender.
    # =====================================================================
    ('FORK',
     r'async function holePostfach\(admin: ReturnType<typeof createClient>\) \{\n'
     r'  const \{ data: pf \} = await admin\.from\("mail_postfaecher"\)\n'
     r'    \.select\("\*"\)\.eq\("email_adresse", STANDARD_MAIL\)\.eq\("aktiv", true\)\.limit\(1\)\.maybeSingle\(\);\n'
     r'  if \(pf\) return pf;\n'
     r'  const \{ data: alle \} = await admin\.from\("mail_postfaecher"\)\n'
     r'    \.select\("\*"\)\.eq\("aktiv", true\)\n',
     'async function holePostfach(admin: ReturnType<typeof createClient>, mandant: string | null) {\n'
     '  // Das Postfach muss dem Mandanten des Projekts gehoeren.\n'
     '  if (!mandant) { console.warn("Postfach: kein Mandant angegeben, kein Versand."); return null; }\n'
     '  const { data: pf } = await admin.from("mail_postfaecher")\n'
     '    .select("*").eq("mandant_id", mandant).eq("email_adresse", STANDARD_MAIL).eq("aktiv", true).limit(1).maybeSingle();\n'
     '  if (pf) return pf;\n'
     '  const { data: alle } = await admin.from("mail_postfaecher")\n'
     '    .select("*").eq("mandant_id", mandant).eq("aktiv", true)\n',
     'Neubauportal: das Postfach gehoert dem Mandanten des Projekts.',
     {'projekt-interaktion', 'projekt-login'}),

    # Damit die Aufrufer den Mandanten weiterreichen koennen, muss er in den
    # geladenen Zeilen stehen.
    ('FORK',
     r'\.select\("id, name, oeffentliche_url"\)\.eq\("slug", slug\)',
     '.select("id, name, oeffentliche_url, mandant_id").eq("slug", slug)',
     'Neubauportal: das Projekt bringt seinen Mandanten mit.',
     {'projekt-interaktion', 'projekt-login'}),
    ('FORK',
     r'\.select\("id, projekt_id, anzeigename, email, rolle, einheit_id, aktiv, session_gueltig_bis, ansprechpartner_id"\)',
     '.select("id, projekt_id, anzeigename, email, rolle, einheit_id, aktiv, session_gueltig_bis, ansprechpartner_id, mandant_id")',
     'Neubauportal: der Zugang bringt seinen Mandanten mit.',
     {'projekt-interaktion'}),
    # projekt-upload laedt eine kuerzere Spaltenliste.
    ('FORK',
     r'\.select\("id, projekt_id, anzeigename, email, aktiv, session_gueltig_bis, ansprechpartner_id"\)',
     '.select("id, projekt_id, anzeigename, email, aktiv, session_gueltig_bis, ansprechpartner_id, mandant_id")',
     'Neubauportal: der Zugang beim Hochladen bringt seinen Mandanten mit.',
     {'projekt-upload'}),
    # Die Nachricht an den Ansprechpartner: hier steht kein "projekt"-Laden
    # davor, deshalb eine eigene Regel.
    ('FORK',
     r'        const postfach = await holePostfach\(admin\);\n        await sendeMail\(postfach, empfaenger, "",',
     '        const postfach = await holePostfach(admin, z.mandant_id);\n        await sendeMail(postfach, empfaenger, "",',
     'Neubauportal: die Nachricht an den Ansprechpartner ebenso.',
     {'projekt-interaktion'}),
    ('FORK',
     r'\.select\("id, anzeigename, aktiv, reset_gueltig_bis"\)',
     '.select("id, anzeigename, aktiv, reset_gueltig_bis, mandant_id")',
     'Neubauportal: der Zugang beim Passwort-Reset bringt seinen Mandanten mit.',
     {'projekt-login'}),

    # Die Registrierung kennt das Projekt, alles Weitere kennt den Zugang.
    ('FORK',
     r'      const postfach = await holePostfach\(admin\);\n\n      const \{ data: vorhanden \}',
     '      const postfach = await holePostfach(admin, projekt.mandant_id);\n\n      const { data: vorhanden }',
     'Neubauportal: die Selbstregistrierung nimmt das Postfach des Projekts.',
     {'projekt-interaktion'}),
    ('FORK',
     r'(const \{ data: projekt \} = await admin\.from\("projekte"\)\.select\(")name("\)\.eq\("id", z\.projekt_id\)\.maybeSingle\(\);\n(\s*)const postfach = await holePostfach\(admin)\);',
     r'\1name, mandant_id\2, z.mandant_id);',
     'Neubauportal: die uebrigen Mails nehmen das Postfach des Zugangs.',
     {'projekt-interaktion'}),
    ('FORK',
     r'        const postfach = await holePostfach\(admin\);\n        const basis = \(projekt\.oeffentliche_url',
     '        const postfach = await holePostfach(admin, projekt.mandant_id);\n        const basis = (projekt.oeffentliche_url',
     'Neubauportal: auch die Passwort-Mail nimmt das Postfach des Projekts.',
     {'projekt-login'}),

    # projekt-upload hat dieselbe Auswahl inline.
    ('FORK',
     r'async function sendeTeamMail\(admin: ReturnType<typeof createClient>, an: string, betreff: string, text: string\) \{\n'
     r'  try \{\n'
     r'    let \{ data: postfach \} = await admin\.from\("mail_postfaecher"\)\n'
     r'      \.select\("\*"\)\.eq\("email_adresse", STANDARD_MAIL\)\.eq\("aktiv", true\)\.limit\(1\)\.maybeSingle\(\);\n'
     r'    if \(!postfach\) \{\n'
     r'      const \{ data: alle \} = await admin\.from\("mail_postfaecher"\)\n'
     r'        \.select\("\*"\)\.eq\("aktiv", true\)\n',
     'async function sendeTeamMail(admin: ReturnType<typeof createClient>, mandant: string | null, an: string, betreff: string, text: string) {\n'
     '  try {\n'
     '    // Wie im uebrigen Neubauportal: das Postfach des eigenen Mandanten\n'
     '    // oder keines.\n'
     '    if (!mandant) { console.warn("Team-Mail: kein Mandant angegeben, kein Versand."); return; }\n'
     '    let { data: postfach } = await admin.from("mail_postfaecher")\n'
     '      .select("*").eq("mandant_id", mandant).eq("email_adresse", STANDARD_MAIL).eq("aktiv", true).limit(1).maybeSingle();\n'
     '    if (!postfach) {\n'
     '      const { data: alle } = await admin.from("mail_postfaecher")\n'
     '        .select("*").eq("mandant_id", mandant).eq("aktiv", true)\n',
     'Neubauportal: die Team-Mail beim Hochladen nimmt das eigene Postfach.',
     {'projekt-upload'}),
    ('FORK',
     r'      await sendeTeamMail\(admin, an,',
     '      await sendeTeamMail(admin, z.mandant_id, an,',
     'Neubauportal: die Team-Mail bekommt den Mandanten des Zugangs.',
     {'projekt-upload'}),

    # --- FREMD: Verweise auf das Supabase-Projekt der Vorlage
    ('FREMD', r'yazwkzzjiquprtjpurur', 'usguiggfciavwzkdfjgt',
     'Projektkennung der Vorlage durch die eigene ersetzt.'),
    # =====================================================================
    # FORK — oeffentliche Endpunkte muessen ihren Mandanten kennen
    #
    # 30 der 139 Funktionen sind ohne Anmeldung erreichbar UND benutzen den
    # service_role — fuer den RLS nicht gilt. Sie muessen die Mandantengrenze
    # also selbst ziehen. oeffentliche-objekte tat es nicht: sie lieferte ALLE
    # veroeffentlichten Objekte ALLER Mandanten an jeden, mit
    # Access-Control-Allow-Origin: *. Jede Makler-Webseite haette die Objekte
    # aller anderen gezeigt.
    #
    # Das Muster dafuer steht einmal hier und wird durchgetragen, dieselbe
    # Reihenfolge wie in energieausweis-anfrage:
    #   1. ?mandant=<Kennung oder Kuerzel> aus der Anfrage
    #   2. sonst: gibt es genau einen Mandanten, ist er gemeint
    #   3. sonst: ablehnen statt raten
    #
    # Zu 2: Solange eine Anwendung einen Mandanten hat, ist die Zuordnung
    # eindeutig und die Seiten brauchen nichts zu aendern. Ab dem zweiten muss
    # die einbettende Seite sagen, wen sie meint — und bis dahin liefert der
    # Endpunkt lieber nichts als das Falsche.
    # =====================================================================
    ('FORK',
     r'Deno\.serve\(async \(req\) => \{\n  if \(req\.method === "OPTIONS"\) return new Response\("ok", \{ headers: corsHeaders \}\);\n  try \{\n    const supabase = createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)!, \{ auth: \{ persistSession: false \} \}\);',
     '// Welcher Mandant ist gemeint? Fuer jeden oeffentlichen Endpunkt\n'
     '// dieselbe Reihenfolge: ausdrueckliche Angabe, sonst der einzige, sonst\n'
     '// gar nichts. Rueckgabe null heisst "nicht entscheidbar" — der Aufrufer\n'
     '// lehnt dann ab, statt zu raten.\n'
     'async function immoMandantAusAnfrage(req: Request, db: any): Promise<string | null> {\n'
     '  let wunsch = "";\n'
     '  try {\n'
     '    const url = new URL(req.url);\n'
     '    wunsch = (url.searchParams.get("mandant") || "").trim();\n'
     '  } catch (_) { /* keine brauchbare Adresse */ }\n'
     '  if (!wunsch) wunsch = (req.headers.get("x-immo-mandant") || "").trim();\n'
     '  if (wunsch) {\n'
     '    const spalte = /^[0-9a-f-]{36}$/i.test(wunsch) ? "id" : "slug";\n'
     '    const { data } = await db.from("mandanten").select("id").eq(spalte, wunsch).maybeSingle();\n'
     '    return data?.id ?? null;\n'
     '  }\n'
     '  const { data: alle } = await db.from("mandanten").select("id").limit(2);\n'
     '  return (alle || []).length === 1 ? alle[0].id : null;\n'
     '}\n'
     '\n'
     'Deno.serve(async (req) => {\n'
     '  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });\n'
     '  try {\n'
     '    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });\n'
     '    const mandant = await immoMandantAusAnfrage(req, supabase);\n'
     '    if (!mandant) {\n'
     '      return new Response(JSON.stringify({ ok: false, anzahl: 0, objekte: [],\n'
     '        fehler: "Die Anfrage ist keinem Anbieter zugeordnet. Bitte ?mandant=<Kuerzel> mitgeben." }), {\n'
     '        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });\n'
     '    }',
     'oeffentliche-objekte: der Endpunkt muss wissen, fuer wen er antwortet.',
     {'oeffentliche-objekte'}),

    ('FORK',
     r'        \.eq\("aktiv", true\)\.eq\("auf_webseite", true\);',
     '        .eq("mandant_id", mandant)\n'
     '        .eq("aktiv", true).eq("auf_webseite", true);',
     'oeffentliche-objekte: der onOffice-Spiegel nur vom eigenen Mandanten.',
     {'oeffentliche-objekte'}),

    ('FORK',
     r'        \.eq\("website_veroeffentlichen", true\)\n        \.in\("status", \["vermarktung", "reserviert"\]\);',
     '        .eq("mandant_id", mandant)\n'
     '        .eq("website_veroeffentlichen", true)\n'
     '        .in("status", ["vermarktung", "reserviert"]);',
     'oeffentliche-objekte: die eigenen Objekte nur vom eigenen Mandanten.',
     {'oeffentliche-objekte'}),

    # =====================================================================
    # FORK — web-lead: der Eingang fuer Bewertungsanfragen von der Webseite
    #
    # Vier Befunde in einer Datei:
    #
    # 1) CHEF_ID = "8e0529f2-…" — eine fest eingebaute Benutzerkennung DES
    #    REFERENZUNTERNEHMENS. Das Neutralitaets-Gate hat sie nicht gesehen,
    #    weil eine UUID keinen Markennamen enthaelt. Sie ist im Fork auch
    #    funktionslos: diesen Benutzer gibt es nicht, der Fremdschluessel
    #    scheitert, und weil der Aufruf in einem try steht, wird der Kontakt
    #    still gar nicht erst angelegt.
    #
    # 2) Die Kontaktsuche lief ueber ALLE Mandanten. Eine Anfrage an Makler A
    #    von jemandem, der bei Makler B schon Kontakt ist, haette B's Datensatz
    #    geaendert: Rolle "eigentuemer" gesetzt und eine Notiz mit Adresse und
    #    Nachricht angehaengt.
    #
    # 3) Die beiden inserts trugen keinen Mandanten. Der Standardwert
    #    aktuelle_mandant_id() hilft nicht: die Funktion laeuft mit dem
    #    service_role, dort ist auth.uid() leer und der Lead landete ohne
    #    Mandanten.
    #
    # 4) Die Empfaengerliste stand fest im Quelltext. Jetzt kommt sie vom
    #    Standort des Mandanten. Der ABSENDER bleibt die Plattform — die
    #    Absenderdomaene muss beim Mailversand hinterlegt sein, und das ist
    #    eine Sache des Betreibers, nicht des Mandanten.
    # =====================================================================
    ('FORK',
     r'const sb = \(\) => createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)!\);',
     'const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);\n'
     '\n'
     '// Welcher Mandant ist gemeint? Ausdrueckliche Angabe, sonst der einzige,\n'
     '// sonst gar nichts. Dieselbe Reihenfolge wie in oeffentliche-objekte.\n'
     'async function immoMandantAusAnfrage(req: Request, db: any, koerper: any): Promise<string | null> {\n'
     '  let wunsch = "";\n'
     '  try { wunsch = (new URL(req.url).searchParams.get("mandant") || "").trim(); } catch (_) { /* egal */ }\n'
     '  if (!wunsch) wunsch = String(koerper?.mandant ?? "").trim();\n'
     '  if (!wunsch) wunsch = (req.headers.get("x-immo-mandant") || "").trim();\n'
     '  if (wunsch) {\n'
     '    const spalte = /^[0-9a-f-]{36}$/i.test(wunsch) ? "id" : "slug";\n'
     '    const { data } = await db.from("mandanten").select("id").eq(spalte, wunsch).maybeSingle();\n'
     '    return data?.id ?? null;\n'
     '  }\n'
     '  const { data: alle } = await db.from("mandanten").select("id").limit(2);\n'
     '  return (alle || []).length === 1 ? alle[0].id : null;\n'
     '}\n'
     '\n'
     '// Der Chef des Mandanten. Ersetzt die fest eingebaute Kennung.\n'
     'async function immoChefDesMandanten(db: any, mandant: string): Promise<string | null> {\n'
     '  const { data } = await db.from("profiles").select("id")\n'
     '    .eq("mandant_id", mandant).eq("role", "chef").order("created_at").limit(1).maybeSingle();\n'
     '  return data?.id ?? null;\n'
     '}',
     'web-lead: Mandant aus der Anfrage, Chef aus dem Mandanten.',
     {'web-lead'}),

    # Die fest eingebaute Kennung faellt weg. Gleich viele Zeilen, damit die
    # Zeilenbremse greift, wenn eine andere Regel danebengeht.
    ('FORK',
     r'const CHEF_ID = "8e0529f2-51ac-4fa4-af66-eda473122053";',
     '// Die Vorlage hatte hier die Benutzerkennung ihres Chefs fest im\n'
     '// Quelltext. Sie kommt jetzt je Anfrage aus dem Mandanten.\n'
     '// Dasselbe gilt fuer die Empfaengerliste: sie steht am Standort.',
     'web-lead: fest eingebaute Benutzerkennung der Referenz entfernt.',
     {'web-lead'}),

    # Die Liste wird nicht mehr gelesen — sie wuerde nur vortaeuschen, dass
    # Post dorthin geht.
    ('FORK',
     r'const EMPFAENGER = \["[^"]*", "[^"]*"\];',
     '// EMPFAENGER entfaellt: die Adressen kommen aus firma_stammdaten.',
     'web-lead: tote Empfaengerliste entfernt.',
     {'web-lead'}),

    # Empfaenger vom Standort des Mandanten statt aus dem Quelltext.
    ('FORK',
     r'  const \{ data: l \} = await db\.from\("web_leads"\)\.select\("\*"\)\.eq\("id", leadId\)\.single\(\);\n  if \(!l \|\| l\.mail_am\) return;',
     '  const { data: l } = await db.from("web_leads").select("*").eq("id", leadId).single();\n'
     '  if (!l || l.mail_am) return;\n'
     '  // Die Empfaenger stehen nicht mehr im Quelltext, sondern am Standort\n'
     '  // des Mandanten, zu dem der Lead gehoert.\n'
     '  const { data: stamm } = await db.from("firma_stammdaten").select("email")\n'
     '    .eq("mandant_id", l.mandant_id).not("email", "is", null)\n'
     '    .order("sortierung").limit(1).maybeSingle();\n'
     '  const empfaenger = stamm?.email ? [stamm.email] : [];\n'
     '  if (!empfaenger.length) {\n'
     '    console.error("web-lead: kein Empfaenger fuer Mandant", l.mandant_id);\n'
     '    return;\n'
     '  }',
     'web-lead: Empfaenger vom Standort des Mandanten.',
     {'web-lead'}),

    ('FORK',
     r'      body: JSON\.stringify\(\{ from: ABSENDER, to: EMPFAENGER, reply_to: l\.email \|\| undefined,',
     '      body: JSON.stringify({ from: ABSENDER, to: empfaenger, reply_to: l.email || undefined,',
     'web-lead: an die Empfaenger des Mandanten senden.',
     {'web-lead'}),

    # Mandant im Handler bestimmen, bevor irgendetwas geschrieben wird.
    ('FORK',
     r'  if \(clean\(b\.website\)\) return json\(\{ ok: true \}\);\n  const db = sb\(\);',
     '  if (clean(b.website)) return json({ ok: true });\n'
     '  const db = sb();\n'
     '  const mandant = await immoMandantAusAnfrage(req, db, b);\n'
     '  if (!mandant) {\n'
     '    return json({ ok: false, fehler: "Das Formular ist keinem Anbieter zugeordnet. '
     'Bitte mandant mitgeben." }, 400);\n'
     '  }\n'
     '  const chefId = await immoChefDesMandanten(db, mandant);',
     'web-lead: Mandant und Chef stehen fest, bevor etwas geschrieben wird.',
     {'web-lead'}),

    # Die Kontaktsuche bleibt im Mandanten.
    ('FORK',
     r'    let q = db\.from\("kontakte"\)\.select\("id, rollen, notiz"\)\.limit\(1\);',
     '    let q = db.from("kontakte").select("id, rollen, notiz").eq("mandant_id", mandant).limit(1);',
     'web-lead: Kontaktsuche nur im eigenen Mandanten.',
     {'web-lead'}),

    ('FORK',
     r'        rollen: \["eigentuemer"\], quelle: "website", aktiv: true, notiz: notizZeile, zustaendig_id: CHEF_ID, ersteller_id: CHEF_ID,',
     '        rollen: ["eigentuemer"], quelle: "website", aktiv: true, notiz: notizZeile,\n'
     '        mandant_id: mandant, zustaendig_id: chefId, ersteller_id: chefId,',
     'web-lead: neuer Kontakt traegt Mandant und Chef des Mandanten.',
     {'web-lead'}),

    ('FORK',
     r'    user_agent: req\.headers\.get\("user-agent"\)\?\.slice\(0, 300\) \?\? null, ip: ip \|\| null, kontakt_id: kontaktId,',
     '    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null, ip: ip || null, kontakt_id: kontaktId,\n'
     '    mandant_id: mandant,',
     'web-lead: der Lead traegt seinen Mandanten.',
     {'web-lead'}),

    ('FORK',
     r'    zielgruppe: "makler", empfaenger_user_id: CHEF_ID, typ: "web_lead",',
     '    zielgruppe: "makler", empfaenger_user_id: chefId, mandant_id: mandant, typ: "web_lead",',
     'web-lead: die Aktivitaet geht an den Chef des Mandanten.',
     {'web-lead'}),

    # =====================================================================
    # FORK — objekt-landing: das Impressum kam vom falschen Mandanten
    #
    # Die oeffentliche Objektseite holt Firmenname, Anschrift, Registergericht,
    # Geschaeftsfuehrer und USt-IdNr. ueber einen SLUG:
    #     .eq("slug", f.firma_slug || "standard")
    # firma_stammdaten.slug war bis fork_17 global eindeutig, also traf das
    # immer genau einen Standort — irgendeinen. Die Landingpage fuer das Objekt
    # von Makler A haette die Rechtsangaben von Makler B gezeigt. Das ist nicht
    # nur falsch, es ist die Impressumspflicht verfehlt.
    #
    # Ab fork_17 ist der Slug je Mandant eindeutig, ein Slug allein also gar
    # nicht mehr aussagekraeftig. Der Standort kommt jetzt aus dem Mandanten
    # DES OBJEKTS: erst der Standort mit passendem Slug, sonst der erste nach
    # Sortierung. Das Objekt ist die einzige verlaessliche Quelle — die Seite
    # zeigt schliesslich genau dieses Objekt.
    # =====================================================================
    ('FORK',
     r'const IM_FELDER = "id, immo_nr,',
     'const IM_FELDER = "id, mandant_id, immo_nr,',
     'objekt-landing: das Objekt bringt seinen Mandanten mit.',
     {'objekt-landing'}),

    ('FORK',
     r'async function kontext\(db: any, t: string\) \{',
     '// Der Standort, dessen Angaben ins Impressum gehoeren: der des Objekts.\n'
     '// Erst der mit passendem Slug, sonst der erste nach Sortierung.\n'
     'async function immoStandortDesObjekts(db: any, mandant: string | null, slug: string | null) {\n'
     '  const felder = "firma_name, strasse, plz, ort, email, web, hrb, registergericht, '
     'geschaeftsfuehrer, ust_id, telefon";\n'
     '  if (!mandant) return null;\n'
     '  if (slug) {\n'
     '    const { data } = await db.from("firma_stammdaten").select(felder)\n'
     '      .eq("mandant_id", mandant).eq("slug", slug).maybeSingle();\n'
     '    if (data) return data;\n'
     '  }\n'
     '  const { data } = await db.from("firma_stammdaten").select(felder)\n'
     '    .eq("mandant_id", mandant).order("sortierung").limit(1).maybeSingle();\n'
     '  return data;\n'
     '}\n'
     '\n'
     'async function kontext(db: any, t: string) {',
     'objekt-landing: Standort aus dem Mandanten des Objekts.',
     {'objekt-landing'}),

    ('FORK',
     r'  const \{ data: firmaRow \} = await db\.from\("firma_stammdaten"\)\.select\("firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon"\)\.eq\("slug", f\.firma_slug \|\| "standard"\)\.maybeSingle\(\);',
     '  const firmaRow = await immoStandortDesObjekts(db, im.mandant_id, f.firma_slug || null);',
     'objekt-landing: Impressum der Exposeseite vom Mandanten des Objekts.',
     {'objekt-landing'}),

    ('FORK',
     r'  const \{ data: firmaRow \} = await db\.from\("firma_stammdaten"\)\.select\("firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon"\)\.eq\("slug", "standard"\)\.maybeSingle\(\);',
     '  const firmaRow = await immoStandortDesObjekts(db, im.mandant_id, null);',
     'objekt-landing: Impressum der Vorschau vom Mandanten des Objekts.',
     {'objekt-landing'}),

    # Die Sammelmail an den Makler: auch dort der Standort des Objekts.
    ('FORK',
     r'        const \{ data: imr \} = fr \? await db\.from\("immobilien"\)\.select\("id, immo_nr, objekttitel, bezeichnung, zustaendig_id"\)',
     '        const { data: imr } = fr ? await db.from("immobilien").select("id, mandant_id, immo_nr, objekttitel, bezeichnung, zustaendig_id")',
     'objekt-landing: auch die Sammelmail kennt den Mandanten des Objekts.',
     {'objekt-landing'}),

    ('FORK',
     r'        const \{ data: fi \} = await db\.from\("firma_stammdaten"\)\.select\("firma_name, email"\)\.eq\("slug", fr\.firma_slug \|\| "standard"\)\.maybeSingle\(\);',
     '        const fi = await immoStandortDesObjekts(db, imr.mandant_id, fr.firma_slug || null);',
     'objekt-landing: Absenderadresse der Sammelmail vom Mandanten des Objekts.',
     {'objekt-landing'}),

    # Der Interessentenkontakt, den die Seite anlegt, gehoert dem Mandanten des
    # Objekts — nicht irgendeinem.
    ('FORK',
     r'  const \{ data: kk \} = await db\.from\("kontakte"\)\.select\("id"\)\.ilike\("email", mail\)\.eq\("aktiv", true\)\.limit\(1\);',
     '  const { data: kk } = await db.from("kontakte").select("id").eq("mandant_id", im.mandant_id)'
     '.ilike("email", mail).eq("aktiv", true).limit(1);',
     'objekt-landing: Kontaktsuche nur im Mandanten des Objekts.',
     {'objekt-landing'}),

    ('FORK',
     r'    const \{ data: kn \} = await db\.from\("kontakte"\)\.insert\(\{ vorname, nachname, email: mail, rollen: \["interessent"\], quelle: "landingpage", aktiv: true, zustaendig_id: im\.zustaendig_id \|\| null \}\)',
     '    const { data: kn } = await db.from("kontakte").insert({ vorname, nachname, email: mail, '
     'rollen: ["interessent"], quelle: "landingpage", aktiv: true, '
     'mandant_id: im.mandant_id, zustaendig_id: im.zustaendig_id || null })',
     'objekt-landing: neuer Interessent traegt den Mandanten des Objekts.',
     {'objekt-landing'}),

    # =====================================================================
    # FORK — akq-lead-eingang: fuenf mandantenlose Auswahlen
    #
    # Der oeffentliche Eingang fuer Bewertungsanfragen der Akquise. Ohne
    # Anmeldung erreichbar, mit service_role — RLS gilt nicht. Er waehlte
    # durchweg "den ersten, den er findet":
    #
    #   mail_postfaecher  das erste aktive Postfach ueberhaupt. Die
    #                     Benachrichtigung ueber einen Lead von Makler A waere
    #                     aus dem Postfach von Makler B gegangen.
    #   profiles          der Makler mit den wenigsten offenen Leads — ueber
    #                     ALLE Mandanten. Ein Lead von A haette bei B gelegen,
    #                     mit Name, E-Mail und Anschrift des Interessenten.
    #   akq_pipelines     die erste aktive Pipeline, gleich welchen Mandanten.
    #   akq_quellen       die Quelle "website" irgendeines Mandanten.
    #   kontakte          Suche ueber die E-Mail-Adresse, mandantenuebergreifend,
    #                     danach wurde der gefundene Kontakt GEAENDERT.
    #
    # Dazu trugen akq_leads und akq_lead_historie keinen Mandanten.
    #
    # Derselbe Weg wie bei oeffentliche-objekte und web-lead: der Mandant kommt
    # aus der Anfrage, sonst ist er der einzige, sonst wird abgelehnt.
    # =====================================================================
    ('FORK',
     r'async function benachrichtige\(db: any, an: string, betreff: string, text: string\) \{\n  const \{ data: pfs \} = await db\.from\("mail_postfaecher"\)\.select\("\*"\)\.eq\("aktiv", true\)\n    \.order\("ist_standard", \{ ascending: false \}\)\.limit\(1\);',
     '// Welcher Mandant ist gemeint? Ausdrueckliche Angabe, sonst der einzige,\n'
     '// sonst gar nichts. Dieselbe Reihenfolge wie in oeffentliche-objekte.\n'
     'async function immoMandantAusAnfrage(req: Request, db: any, koerper: any): Promise<string | null> {\n'
     '  let wunsch = "";\n'
     '  try { wunsch = (new URL(req.url).searchParams.get("mandant") || "").trim(); } catch (_) { /* egal */ }\n'
     '  if (!wunsch) wunsch = String(koerper?.mandant ?? "").trim();\n'
     '  if (!wunsch) wunsch = (req.headers.get("x-immo-mandant") || "").trim();\n'
     '  if (wunsch) {\n'
     '    const spalte = /^[0-9a-f-]{36}$/i.test(wunsch) ? "id" : "slug";\n'
     '    const { data } = await db.from("mandanten").select("id").eq(spalte, wunsch).maybeSingle();\n'
     '    return data?.id ?? null;\n'
     '  }\n'
     '  const { data: alle } = await db.from("mandanten").select("id").limit(2);\n'
     '  return (alle || []).length === 1 ? alle[0].id : null;\n'
     '}\n'
     '\n'
     'async function benachrichtige(db: any, mandant: string, an: string, betreff: string, text: string) {\n'
     '  // Das Postfach des Mandanten, nicht das erste ueberhaupt.\n'
     '  const { data: pfs } = await db.from("mail_postfaecher").select("*")\n'
     '    .eq("mandant_id", mandant).eq("aktiv", true)\n'
     '    .order("ist_standard", { ascending: false }).limit(1);',
     'akq-lead-eingang: Postfach des Mandanten statt des ersten aktiven.',
     {'akq-lead-eingang'}),

    # Mandant bestimmen, bevor irgendetwas ausgewaehlt oder geschrieben wird.
    ('FORK',
     r'    // --- Quelle ---\n    const quelleSlug = txt\(body\.quelle, 40\)\.toLowerCase\(\) \|\| "website";\n    const \{ data: quelle \} = await db\.from\("akq_quellen"\)\.select\("id, name"\)\.eq\("slug", quelleSlug\)\.maybeSingle\(\);\n    const \{ data: quelleFallback \} = quelle \? \{ data: null \} : await db\.from\("akq_quellen"\)\.select\("id, name"\)\.eq\("slug", "website"\)\.maybeSingle\(\);',
     '    // --- Mandant ---\n'
     '    const mandant = await immoMandantAusAnfrage(req, db, body);\n'
     '    if (!mandant) {\n'
     '      await merke("kein_mandant");\n'
     '      return antwort({ ok: false, fehler: "Das Formular ist keinem Anbieter zugeordnet. '
     'Bitte wenden Sie sich direkt an Ihren Ansprechpartner." }, 400);\n'
     '    }\n'
     '\n'
     '    // --- Quelle ---\n'
     '    const quelleSlug = txt(body.quelle, 40).toLowerCase() || "website";\n'
     '    const { data: quelle } = await db.from("akq_quellen").select("id, name")'
     '.eq("mandant_id", mandant).eq("slug", quelleSlug).maybeSingle();\n'
     '    const { data: quelleFallback } = quelle ? { data: null } : await db.from("akq_quellen")'
     '.select("id, name").eq("mandant_id", mandant).eq("slug", "website").maybeSingle();',
     'akq-lead-eingang: Mandant steht fest, bevor etwas ausgewaehlt wird.',
     {'akq-lead-eingang'}),

    ('FORK',
     r'    const \{ data: vorhanden \} = await db\.from\("kontakte"\)\.select\("\*"\)\.ilike\("email", email\)\.limit\(1\);',
     '    const { data: vorhanden } = await db.from("kontakte").select("*")'
     '.eq("mandant_id", mandant).ilike("email", email).limit(1);',
     'akq-lead-eingang: Kontaktsuche nur im eigenen Mandanten.',
     {'akq-lead-eingang'}),

    ('FORK',
     r'    const \{ data: pipeline \} = await db\.from\("akq_pipelines"\)\.select\("id"\)\.eq\("art", "setting"\)\.eq\("aktiv", true\)\n      \.order\("sortierung"\)\.limit\(1\)\.maybeSingle\(\);',
     '    const { data: pipeline } = await db.from("akq_pipelines").select("id")'
     '.eq("mandant_id", mandant).eq("art", "setting").eq("aktiv", true)\n'
     '      .order("sortierung").limit(1).maybeSingle();',
     'akq-lead-eingang: Pipeline des eigenen Mandanten.',
     {'akq-lead-eingang'}),

    ('FORK',
     r'    const \{ data: makler \} = await db\.from\("profiles"\)\.select\("id, name, email"\)\n      \.in\("role", \["chef", "mitarbeiter"\]\)\.eq\("rechte->>akquise", "true"\);',
     '    const { data: makler } = await db.from("profiles").select("id, name, email")\n'
     '      .eq("mandant_id", mandant)\n'
     '      .in("role", ["chef", "mitarbeiter"]).eq("rechte->>akquise", "true");',
     'akq-lead-eingang: zustaendig wird nur, wer zum Mandanten gehoert.',
     {'akq-lead-eingang'}),

    ('FORK',
     r'    const \{ data: lead, error: leadErr \} = await db\.from\("akq_leads"\)\.insert\(\{\n      kontakt_id: kontakt\.id,',
     '    const { data: lead, error: leadErr } = await db.from("akq_leads").insert({\n'
     '      mandant_id: mandant,\n'
     '      kontakt_id: kontakt.id,',
     'akq-lead-eingang: der Lead traegt seinen Mandanten.',
     {'akq-lead-eingang'}),

    ('FORK',
     r'    await db\.from\("akq_lead_historie"\)\.insert\(\{\n      lead_id: lead\.id, feld: "angelegt", alt: null,',
     '    await db.from("akq_lead_historie").insert({\n'
     '      mandant_id: mandant,\n'
     '      lead_id: lead.id, feld: "angelegt", alt: null,',
     'akq-lead-eingang: die Historie traegt ihren Mandanten.',
     {'akq-lead-eingang'}),

    # Die Aufrufstelle muss die geaenderte Signatur mitnehmen — sonst stuende
    # die E-Mail-Adresse an der Stelle des Mandanten und die Benachrichtigung
    # ginge gar nicht mehr raus. Beim ersten Durchlauf genau so passiert.
    ('FORK',
     r'      await benachrichtige\(db, zustaendig\.email,',
     '      await benachrichtige(db, mandant, zustaendig.email,',
     'akq-lead-eingang: die Aufrufstelle kennt die neue Signatur.',
     {'akq-lead-eingang'}),

    # =====================================================================
    # FORK — der Briefkopf kam ueber einen festen Slug
    #
    # Fuenf Funktionen erzeugen ein Dokument mit Briefkopf und holten den
    # Standort dafuer so:
    #     .from("firma_stammdaten").select("*").eq("slug", "standard")
    # In der Vorlage stand dort der Slug der Referenz; die Neutralisierung hat
    # ihn auf "standard" gesetzt. Beides ist eine feste Zeichenkette.
    #
    # Bis fork_17 war firma_stammdaten.slug global eindeutig, die Abfrage traf
    # also genau einen Standort — irgendeinen. Seit fork_17 ist er je Mandant
    # eindeutig; ab dem zweiten Mandanten traefe maybeSingle() zwei Zeilen und
    # braeche ab. Mit einem Mandanten faellt davon nichts auf, deshalb steht
    # die Sache in tests/mandant-nachzug.py.
    #
    # Der Standort kommt jetzt aus dem Mandanten des Datensatzes, den die
    # Funktion ohnehin geladen hat. Es bleibt eine Rueckfallebene: der Weg
    # darueber (absender_firma_id beziehungsweise firma_id) hat Vorrang und
    # ist unveraendert.
    #
    # Diese Regel MUSS nach den MARKE-Regeln stehen, die den Slug der Referenz
    # auf "standard" setzen — sonst findet sie ihre Stelle nicht.
    # =====================================================================

    # Drei Funktionen fuehren seit Phase 2 immoMandant (Storage-Huelle).
    ('FORK',
     r'      const \{ data \} = await admin\.from\("firma_stammdaten"\)\.select\("\*"\)\.eq\("slug", "standard"\)\.maybeSingle\(\);\n        firma = data;',
     '      const { data } = await admin.from("firma_stammdaten").select("*")\n'
     '          .eq("mandant_id", immoMandant).order("sortierung").limit(1).maybeSingle();\n'
     '        firma = data;',
     'Briefkopf: Standort aus dem Mandanten statt ueber einen festen Slug '
     '(mit immoMandant).',
     {'signatur-vorgang-starten'}),

    ('FORK',
     r'if \(!firma\) \{ const \{ data \} = await admin\.from\("firma_stammdaten"\)\.select\("\*"\)\.eq\("slug", "standard"\)\.maybeSingle\(\); firma = data; \}',
     'if (!firma) { const { data } = await admin.from("firma_stammdaten").select("*")'
     '.eq("mandant_id", immoMandant).order("sortierung").limit(1).maybeSingle(); firma = data; }',
     'Briefkopf: dasselbe in expose-pdf-erzeugen.',
     {'expose-pdf-erzeugen'}),

    ('FORK',
     r'      const \{ data \} = await admin\.from\("firma_stammdaten"\)\.select\("\*"\)\.eq\("slug", "standard"\)\.maybeSingle\(\);\n      firma = data;\n    \}\n    if \(!firma\) throw new Error\("Firma-Stammdaten fehlen\."\);',
     '      const { data } = await admin.from("firma_stammdaten").select("*")\n'
     '        .eq("mandant_id", res.mandant_id).order("sortierung").limit(1).maybeSingle();\n'
     '      firma = data;\n'
     '    }\n'
     '    if (!firma) throw new Error("Firma-Stammdaten fehlen.");',
     'Briefkopf: Standort aus dem Mandanten der Reservierung.',
     {'reservierung-pdf-erzeugen', 'reservierung-word-erzeugen'}),

    ('FORK',
     r'      const \{ data \} = await admin\.from\("firma_stammdaten"\)\.select\("\*"\)\.eq\("slug", "standard"\)\.maybeSingle\(\);',
     '      const { data } = await admin.from("firma_stammdaten").select("*")\n'
     '        .eq("mandant_id", immoMandant).order("sortierung").limit(1).maybeSingle();',
     'Briefkopf: dasselbe in brief-pdf-erzeugen.',
     {'brief-pdf-erzeugen'}),

    # =====================================================================
    # FORK — die Dokumente trugen nicht die CI des Mandanten
    #
    # Gemeldet am 28.09.2026: "die ci farben werden nicht in die rechnungen
    # uebernommen". Stimmt. fork_13 hat ci_primaer und ci_akzent an
    # firma_stammdaten gelegt und die OBERFLAECHE liest sie. Die Dokumente
    # nicht: jede PDF-Funktion fuehrt ihre eigene Palette im Quelltext.
    #
    # Dabei kam noch etwas heraus. Drei Paletten, keine davon die Plattform-CI:
    #   signatur-vorgang-starten  rgb(0.149, 0.192, 0.349) = #263159
    #                             rgb(0.831, 0.647, 0.404) = #D4A567
    #                             -> das sind die Farben DER REFERENZ, noch im
    #                                Fork. In Fliesskomma-Schreibweise, deshalb
    #                                hat das Neutralitaets-Gate sie nie gesehen.
    #   rechnung-pdf-erzeugen     #0A2A4D / #C7A455
    #   reservierung-pdf-erzeugen dieselben
    #
    # Ab hier: Vorgabe ist die Plattform-CI aus CLAUDE.md, und wenn der Standort
    # eigene Farben hat, gelten seine. Die firma-Zeile wird ohnehin mit
    # select("*") geladen, die Spalten sind also schon da.
    #
    # Bewusst LOKALE Variablen, keine Aenderung am modulweiten CI-Objekt: eine
    # Edge Function kann mehrere Anfragen gleichzeitig bedienen, und ein
    # geteilter Zustand haette die Farben des einen Mandanten in das Dokument
    # des anderen getragen.
    # =====================================================================

    # Der Umrechner, einmal je Datei. Haengt an der Palette, die es ueberall
    # schon gibt.
    ('FORK',
     r'const CI = \{\n  blau: rgb\(0\.039, 0\.165, 0\.30\),  // ca\. #0A2A4D\n  gold: rgb\(0\.78, 0\.64, 0\.33\),    // ca\. #C7A455',
     '// #rrggbb in rgb() von pdf-lib. Unbrauchbares faellt auf den Ersatz\n'
     '// zurueck — ein Dokument in unlesbaren Farben waere schlimmer als eines\n'
     '// in den Plattformfarben.\n'
     'function immoCiFarbe(hex: unknown, ersatz: any) {\n'
     '  if (typeof hex !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return ersatz;\n'
     '  return rgb(parseInt(hex.slice(1, 3), 16) / 255,\n'
     '             parseInt(hex.slice(3, 5), 16) / 255,\n'
     '             parseInt(hex.slice(5, 7), 16) / 255);\n'
     '}\n'
     '\n'
     'const CI = {\n'
     '  blau: rgb(0.106, 0.165, 0.278),  // #1B2A47, Plattform-CI aus CLAUDE.md\n'
     '  gold: rgb(0.710, 0.576, 0.310),  // #B5934F, dito',
     'PDF: Plattform-CI statt dritter Palette, dazu der Farbumrechner '
     '(Rechnung).',
     {'rechnung-pdf-erzeugen'}),

    # Dieselben Werte, aber ohne die Kommentare — deshalb ein eigenes Muster.
    ('FORK',
     r'const CI = \{\n  blau: rgb\(0\.039, 0\.165, 0\.30\),\n  gold: rgb\(0\.78, 0\.64, 0\.33\),',
     '// #rrggbb in rgb() von pdf-lib. Unbrauchbares faellt auf den Ersatz\n'
     '// zurueck — ein Dokument in unlesbaren Farben waere schlimmer als eines\n'
     '// in den Plattformfarben.\n'
     'function immoCiFarbe(hex: unknown, ersatz: any) {\n'
     '  if (typeof hex !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return ersatz;\n'
     '  return rgb(parseInt(hex.slice(1, 3), 16) / 255,\n'
     '             parseInt(hex.slice(3, 5), 16) / 255,\n'
     '             parseInt(hex.slice(5, 7), 16) / 255);\n'
     '}\n'
     '\n'
     'const CI = {\n'
     '  blau: rgb(0.106, 0.165, 0.278),  // #1B2A47, Plattform-CI aus CLAUDE.md\n'
     '  gold: rgb(0.710, 0.576, 0.310),  // #B5934F, dito',
     'PDF: Plattform-CI statt dritter Palette (Reservierung).',
     {'reservierung-pdf-erzeugen'}),

    ('FORK',
     r'  blau: rgb\(0\.149, 0\.192, 0\.349\),\n  gold: rgb\(0\.831, 0\.647, 0\.404\),',
     '  // Hier standen bis zum 28.09.2026 rgb(0.149, 0.192, 0.349) und\n'
     '  // rgb(0.831, 0.647, 0.404) — das sind #263159 und #D4A567, die Farben\n'
     '  // der Referenz. In Fliesskomma-Schreibweise hat das Neutralitaets-Gate\n'
     '  // sie nicht gefunden.\n'
     '  blau: rgb(0.106, 0.165, 0.278),  // #1B2A47, Plattform-CI aus CLAUDE.md\n'
     '  gold: rgb(0.710, 0.576, 0.310),  // #B5934F, dito',
     'PDF: die Farben der Referenz in signatur-vorgang-starten ersetzt.',
     {'signatur-vorgang-starten'}),

    ('FORK',
     r'function buildReservierungAbsaetze\(res: any, firma',
     'function immoCiFarbe(hex: unknown, ersatz: any) {\n'
     '  if (typeof hex !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return ersatz;\n'
     '  return rgb(parseInt(hex.slice(1, 3), 16) / 255,\n'
     '             parseInt(hex.slice(3, 5), 16) / 255,\n'
     '             parseInt(hex.slice(5, 7), 16) / 255);\n'
     '}\n'
     '\n'
     'function buildReservierungAbsaetze(res: any, firma',
     'PDF: der Farbumrechner in signatur-vorgang-starten.',
     {'signatur-vorgang-starten'}),

    # ZUERST die Verwendungsstellen umstellen, DANN die Zuweisung einfuegen.
    # Andersherum trifft die Ersetzung die Zeile, die sie selbst erzeugt hat:
    # `const ciBlau = immoCiFarbe(firma.ci_primaer, ciBlau)` — ein Verweis auf
    # sich selbst. Genau so beim ersten Durchlauf passiert.
    ('FORK', r'\bCI\.blau\b', 'ciBlau',
     'PDF: die Ueberschriften nehmen die Mandantenfarbe.',
     {'rechnung-pdf-erzeugen', 'reservierung-pdf-erzeugen', 'signatur-vorgang-starten'}),
    ('FORK', r'\bCI\.gold\b', 'ciGold',
     'PDF: die Akzente nehmen die Mandantenfarbe.',
     {'signatur-vorgang-starten'}),

    # Je Anfrage die Farben des Standorts bestimmen, direkt hinter der Stelle,
    # an der feststeht, welcher Standort es ist.
    ('FORK',
     r'    if \(!firma\) throw new Error\("Firmen-Stammdaten nicht gefunden\."\);',
     '    if (!firma) throw new Error("Firmen-Stammdaten nicht gefunden.");\n'
     '\n'
     '    // Die CI des Mandanten, sonst die der Plattform.\n'
     '    const ciBlau = immoCiFarbe(firma.ci_primaer, CI.blau);\n'
     '    const ciGold = immoCiFarbe(firma.ci_akzent, CI.gold);',
     'Rechnung: die Farben des Standorts gelten fuer dieses Dokument.',
     {'rechnung-pdf-erzeugen'}),

    ('FORK',
     r'    if \(!firma\) throw new Error\("Firma-Stammdaten fehlen\."\);',
     '    if (!firma) throw new Error("Firma-Stammdaten fehlen.");\n'
     '\n'
     '    // Die CI des Mandanten, sonst die der Plattform.\n'
     '    const ciBlau = immoCiFarbe(firma.ci_primaer, CI.blau);\n'
     '    const ciGold = immoCiFarbe(firma.ci_akzent, CI.gold);',
     'Reservierung: die Farben des Standorts gelten fuer dieses Dokument.',
     {'reservierung-pdf-erzeugen'}),

    ('FORK',
     r'      if \(!firma\) throw new Error\("Firma-Stammdaten fehlen\."\);',
     '      if (!firma) throw new Error("Firma-Stammdaten fehlen.");\n'
     '\n'
     '      // Die CI des Mandanten, sonst die der Plattform.\n'
     '      const ciBlau = immoCiFarbe(firma.ci_primaer, CI.blau);\n'
     '      const ciGold = immoCiFarbe(firma.ci_akzent, CI.gold);',
     'Signaturvorgang: die Farben des Standorts gelten fuer dieses Dokument.',
     {'signatur-vorgang-starten'}),


    # =====================================================================
    # FORK — die Funktionen, die Dokumente bauen, muessen ihren Mandanten
    # kennen, sonst greift die Storage-Huelle ins Leere.
    #
    # Fuenf von ihnen hatten die Huelle bisher nicht, weil sie nur LESEN und
    # die Huelle fuers Schreiben gedacht war. Seit sie auch das Lesen regelt
    # (Kommentar an der Regel oben), brauchen sie sie — und damit die eine
    # Zeile, die ihr sagt, fuer wen gearbeitet wird.
    #
    # Der Stand vom 28.09.2026 davor: rechnung-pdf-erzeugen hatte eigene
    # Hilfsfunktionen fuer denselben Zweck (immoBrandingDatei, immoSchrift,
    # ein Zwischenspeicher je Mandant). Sie sind hier entfallen. Zwei Wege
    # zum selben Ziel sind einer zu viel — und der zweite ist der, den man
    # beim naechsten Mal vergisst.
    # =====================================================================

    # Rechnung: die Firma traegt den Mandanten. Vor dem Laden der Schriften.
    ('FORK',
     r'(    if \(!firma\) throw new Error\("Firmen-Stammdaten nicht gefunden\."\);)',
     r'\1\n    immoSetzeMandant(firma.mandant_id);',
     'Rechnung: den Mandanten aus der Absenderfirma setzen.',
     {'rechnung-pdf-erzeugen'}),

    # Maklervertrag und Mietvertrag: der Mandant steht im Profil des
    # Anmeldenden. Beide Dateien haben die Zeile wortgleich.
    ('FORK',
     r'(const \{ data: profil \} = await admin\.from\("profiles"\)\.select\("\*"\)\.eq\("id", userData\.user\.id\)\.maybeSingle\(\);)',
     r'\1 immoSetzeMandant(profil?.mandant_id);',
     'Vertrags-PDF: den Mandanten aus dem Profil setzen.',
     {'vertrag-pdf', 'mietvertrag-pdf'}),

    # Der Zwischenspeicher der Schriften haelt je Mandant einen Satz.
    #
    # In der Vorlage steht er auf Modulebene, und heute faellt das niemandem
    # auf: die Schriften kommen fuer alle aus demselben Wurzelverzeichnis.
    # Sobald ein Mandant eine eigene Hausschrift hochlaedt (Abschnitt 2a),
    # waere die Schrift des einen in der Rechnung des naechsten — sobald
    # dieselbe Instanz zwei Anfragen bedient. Das ist keine Sichtbarkeits-
    # frage, die man spaeter nachzieht, sondern ein Leck; deshalb jetzt.
    ('FORK',
     r'let cachedFonts: \{\n  montserratRegular\?: ArrayBuffer;\n  montserratBold\?: ArrayBuffer;\n  marcellus\?: ArrayBuffer;\n\} = \{\};',
     'const immoSchriftCache = new Map<string, {\n'
     '  montserratRegular?: ArrayBuffer;\n'
     '  montserratBold?: ArrayBuffer;\n'
     '  marcellus?: ArrayBuffer;\n'
     '}>();',
     'Schriften-Zwischenspeicher je Mandant statt modulweit.',
     {'rechnung-pdf-erzeugen', 'reservierung-pdf-erzeugen'}),

    ('FORK',
     r'(    if \(fontkit && !cachedFonts\.montserratRegular\) \{)',
     '    const immoSchriftSchluessel = String(immoMandant || "plattform");\n'
     '    let cachedFonts = immoSchriftCache.get(immoSchriftSchluessel);\n'
     '    if (!cachedFonts) { cachedFonts = {}; immoSchriftCache.set(immoSchriftSchluessel, cachedFonts); }\n'
     r'\1',
     'Den Satz des eigenen Mandanten aus dem Zwischenspeicher holen.',
     {'rechnung-pdf-erzeugen', 'reservierung-pdf-erzeugen'}),

    # Reservierung: der Mandant steht am Vorgang. Beide Dateien, Wort fuer
    # Wort dieselbe Stelle.
    ('FORK',
     r'(if \(!res\) throw new Error\("Reservierung nicht gefunden\."\);)',
     r'\1\n    immoSetzeMandant(res.mandant_id);',
     'Reservierung: den Mandanten aus dem Vorgang setzen.',
     {'reservierung-pdf-erzeugen', 'reservierung-word-erzeugen'}),



    # Diese Regel steht ganz am Ende der Liste, und das ist kein Zufall: die
    # Zeile, an der sie ansetzt, entsteht selbst erst durch eine Regel weiter
    # oben. Weiter vorne eingehaengt lief sie ins Leere — die Zaehlung der
    # Treffer hat es gemeldet, sonst waere mandantLog stumm null geblieben
    # und das Protokoll haette weiter ohne Mandanten geschrieben.
    ('FORK',
     r'(    const mandant = await immoMandantAusAnfrage\(req, db, body\);)',
     r'\1\n    mandantLog = mandant;',
     'Akquise-Protokoll: den Mandanten merken, sobald er feststeht.',
     {'akq-lead-eingang'}),

]

# Drei Funktionen verdrahten die Portal-Adresse fest, statt sie wie alle
# uebrigen aus PORTAL_URL zu lesen. Nach der Ersetzung oben stuende dort der
# Platzhalter-Host als einzige Quelle — die Links gingen ins Leere. Deshalb
# bekommen sie denselben Rueckfall wie der Rest der Funktionen.
# NACHBESSERN wird WOERTLICH ersetzt, nicht als regulaerer Ausdruck. Grund:
# hier stehen Code-Schnipsel mit Klammern und Punkten, und ein Muster wie
# STANDORTE["rostock"] ist als Ausdruck eine Zeichenklasse — es wuerde quer
# durch die Datei einzelne Buchstaben treffen. Genau das ist beim Schreiben
# dieses Skripts passiert.
NACHBESSERN = [
    # --- FORK: die letzten Schreibstellen.
    ('FORK',
     '      const pfad = "immobilien/" + z.immobilie_id + "/" + Date.now() + "_" + name.replace(/[^A-Za-z0-9._-]+/g, "_");',
     '      immoSetzeMandant((await admin.from("immobilien").select("mandant_id").eq("id", z.immobilie_id).maybeSingle()).data?.mandant_id);\n      const pfad = "immobilien/" + z.immobilie_id + "/" + Date.now() + "_" + name.replace(/[^A-Za-z0-9._-]+/g, "_");',
     'Mandant aus der Ziel-Immobilie (Bild-Zusammensetzen): mail-anhaenge-diagnose.',
     {'mail-anhaenge-diagnose'}),
    ('FORK',
     '          if (dErr || !d) throw new Error("Datei nicht gefunden");',
     '          if (dErr || !d) throw new Error("Datei nicht gefunden");\n          immoSetzeMandant(d.mandant_id);',
     'Mandant aus dem Dateisatz (Zuschnitt): mail-anhaenge-diagnose.',
     {'mail-anhaenge-diagnose'}),
    # energieausweis-anfrage ist ein oeffentliches Formular ohne Anmeldung. Es
    # kann seinen Mandanten nicht aus einem Token ableiten — also muss die
    # einbettende Seite ihn mitschicken. Tut sie das nicht, greift der einzige
    # Fall, in dem Raten kein Raten ist: es gibt genau einen Mandanten. Bei
    # mehreren wird abgelehnt statt zugeordnet. Eine Anfrage, die im falschen
    # Postfach landet, ist schlimmer als eine, die gar nicht ankommt: der
    # Absender sieht den Fehler, der fremde Makler sieht fremde Kontaktdaten.
    ('FORK',
     '    const { count } = await db.from("energieausweis_anfragen").select("id", { count: "exact", head: true })',
     '    const mandantWunsch = txt(form ? form.get("mandant") : (d?.mandant ?? null), 60);\n'
     '    let mandant: string | null = null;\n'
     '    if (/^[0-9a-f-]{36}$/i.test(mandantWunsch)) {\n'
     '      const { data: m } = await db.from("mandanten").select("id").eq("id", mandantWunsch).maybeSingle();\n'
     '      mandant = m?.id ?? null;\n'
     '    } else {\n'
     '      const { data: alle } = await db.from("mandanten").select("id").limit(2);\n'
     '      if ((alle || []).length === 1) mandant = alle![0].id;\n'
     '    }\n'
     '    if (!mandant) return antwort({ ok: false, fehler: "Das Formular ist keinem Anbieter zugeordnet. Bitte wenden Sie sich direkt an Ihren Ansprechpartner." }, 400);\n'
     '    immoSetzeMandant(mandant);\n'
     '    const { count } = await db.from("energieausweis_anfragen").select("id", { count: "exact", head: true })',
     'Mandant aus dem Formularfeld, sonst nur bei genau einem Mandanten: energieausweis-anfrage.',
     {'energieausweis-anfrage'}),

    # --- FORK: Mandant fuer die uebrigen Funktionen, die Dateien schreiben.
    ('FORK',
     'const { data: brief, error: bErr } = await admin.from("briefe").select("*").eq("id", brief_id).maybeSingle();',
     'const { data: brief, error: bErr } = await admin.from("briefe").select("*").eq("id", brief_id).maybeSingle(); immoSetzeMandant(brief?.mandant_id);',
     'Mandant aus dem Brief: brief-pdf-erzeugen.',
     {'brief-pdf-erzeugen'}),
    ('FORK',
     'const { data: vorgang, error: vgErr } = await admin.from("signatur_vorgaenge").select("*").eq("id", empfaenger.vorgang_id).maybeSingle();',
     'const { data: vorgang, error: vgErr } = await admin.from("signatur_vorgaenge").select("*").eq("id", empfaenger.vorgang_id).maybeSingle(); immoSetzeMandant(vorgang?.mandant_id);',
     'Mandant aus dem Signaturvorgang: signatur-unterschreiben.',
     {'signatur-unterschreiben'}),
    ('FORK',
     '    const pfad = "immobilien/" + meta.immobilie_id + "/"',
     '    immoSetzeMandant((await admin.from("immobilien").select("mandant_id").eq("id", meta.immobilie_id).maybeSingle()).data?.mandant_id);\n    const pfad = "immobilien/" + meta.immobilie_id + "/"',
     'Mandant aus der Ziel-Immobilie: bild-empfang.',
     {'bild-empfang'}),
    ('FORK',
     '    const b = await req.json().catch(() => ({}));',
     '    const { data: u } = await db.auth.getUser(\n      (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, ""));\n    if (!u?.user) return new Response(JSON.stringify({ ok: false, fehler: "Nicht angemeldet" }),\n      { status: 401, headers: { "Content-Type": "application/json" } });\n    immoSetzeMandant((await db.from("profiles").select("mandant_id")\n      .eq("id", u.user.id).maybeSingle()).data?.mandant_id);\n    const b = await req.json().catch(() => ({}));',
     'Mandant aus dem Profil des Aufrufers: web-asset-kopieren.',
     {'web-asset-kopieren'}),

    # --- FORK: den Mandanten setzen, damit die Storage-Huelle greift.
    # Diese vier laden ohnehin direkt danach das Profil des Aufrufers.
    # Die Abfrage wird um mandant_id erweitert, statt eine zweite zu
    # stellen. Der Aufruf haengt an derselben Zeile — so bleibt die
    # Einrichtung des Quelltexts unberuehrt und die Zeilenzahl gleich.
    ('FORK',
     'const { data: profil } = await admin.from("profiles").select("id,name,titel,firma_id,funktion,telefon,email,foto_url").eq("id", userData.user.id).maybeSingle();',
     'const { data: profil } = await admin.from("profiles").select("id,name,titel,firma_id,funktion,telefon,email,foto_url,mandant_id").eq("id", userData.user.id).maybeSingle(); immoSetzeMandant(profil?.mandant_id);',
     'Mandant aus dem Profil des Aufrufers: expose-pdf-erzeugen.',
     {'expose-pdf-erzeugen'}),
    ('FORK',
     'const { data: profil } = await admin.from("profiles").select("id,name,funktion,telefon,email,foto_url,role,firma_id").eq("id", userData.user.id).maybeSingle();',
     'const { data: profil } = await admin.from("profiles").select("id,name,funktion,telefon,email,foto_url,role,firma_id,mandant_id").eq("id", userData.user.id).maybeSingle(); immoSetzeMandant(profil?.mandant_id);',
     'Mandant aus dem Profil des Aufrufers: mpe-pdf-erzeugen.',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     'const { data: profil } = await admin.from("profiles").select("role").eq("id", uid).maybeSingle();',
     'const { data: profil } = await admin.from("profiles").select("role, mandant_id").eq("id", uid).maybeSingle(); immoSetzeMandant(profil?.mandant_id);',
     'Mandant aus dem Profil des Aufrufers: eigentuemer-dokument-uebernehmen.',
     {'eigentuemer-dokument-uebernehmen'}),
    # signatur-vorgang-starten erzeugt ihren Client ERST NACH getUser. Die
    # Huelle und damit immoSetzeMandant stehen also hinter aktuellerUserId;
    # gesetzt wird der Mandant deshalb an der naechsten Stelle danach, an der
    # der Handler ohnehin weiterliest.
    ('FORK',
     'const body = await req.json();\n    const vertragId = (body.vertrag_id || "").toString().trim();',
     'const body = await req.json();\n'
     '    immoSetzeMandant((await admin.from("profiles").select("mandant_id")'
     '.eq("id", aktuellerUserId).maybeSingle()).data?.mandant_id);\n'
     '    const vertragId = (body.vertrag_id || "").toString().trim();',
     'Mandant aus dem Profil des Aufrufers: signatur-vorgang-starten.',
     {'signatur-vorgang-starten'}),

    ('FORK',
     'const { data: prof } = await db.from("profiles").select("role, name, email, telefon, titel, firma_id").eq("id", u.user.id).maybeSingle();',
     'const { data: prof } = await db.from("profiles").select("role, name, email, telefon, titel, firma_id, mandant_id").eq("id", u.user.id).maybeSingle(); immoSetzeMandant(prof?.mandant_id);',
     'Mandant aus dem Profil des Aufrufers: eigentuemer-report-pdf.',
     {'eigentuemer-report-pdf'}),

    # Die kurze Namensregel greift auch dort, wo im Original schon ein GmbH
    # stand. Einmal geradeziehen ist billiger als eine Regel je Schreibweise.
    ('MARKE', 'Musterhaus Immobilien GmbH GmbH', 'Musterhaus Immobilien GmbH',
     'doppeltes GmbH nach der Namensersetzung.'),
    # vertrag-pdf traegt die drei Standorte der Referenz als Tabelle im
    # Quelltext. Der Fork behaelt die Struktur, aber nur einen leeren Eintrag:
    # die Werte gehoeren nach firma_stammdaten (typ = 'standort'), und das ist
    # Phase 2.4. Bis dahin erzeugt vertrag-pdf Vertraege ohne Firmenkopf —
    # vermerkt in docs/OFFEN.md.
    ('MARKE', 'STANDORTE["rostock"]', 'STANDORTE["standard"]',
     'Schluessel der Standorttabelle in vertrag-pdf (Typverweise).'),
    ('MARKE', 'STANDORTE[vertrag.standort || "rostock"] || STANDORTE.rostock',
     'STANDORTE[vertrag.standort || "standard"] || STANDORTE.standard',
     'Schluessel der Standorttabelle in vertrag-pdf (Zugriff).'),

    # --- Nachtrag 28.09.2026: die Standorte der Referenz in der KI-Anweisung
    # von parse-maklervertrag. Woertlich, weil der Text erst nach den
    # Namensregeln oben diese Gestalt hat: die Regel fuer den Firmennamen
    # zieht die zuvor umgebrochene Zeile zusammen.
    ('MARKE', '"standort": "standard" | "schwerin" | null,',
     '"standort": "standard" | "zweigstelle" | null,',
     'Standort-Aufzaehlung im JSON-Schema der Vertragsauslese.'),
    ('MARKE',
     '- STANDORT erkennst du am Briefkopf des Vertrags: erwaehnt das die '
     '"Musterhaus Immobilien GmbH Rostock" -> rostock, "Schwerin" -> schwerin. '
     'Wenn nicht eindeutig -> null.',
     '- STANDORT erkennst du am Briefkopf des Vertrags: nennt er den Hauptsitz '
     '-> standard, eine Zweigstelle -> zweigstelle. Wenn nicht eindeutig -> null.',
     'Erklaerung dazu; sie nannte die beiden Bueros der Referenz.'),

    # --- Nachtrag 28.09.2026: die Bueros der Referenz in mpe-pdf-erzeugen.
    # Woertlich ersetzt, weil hier Klammern und Punkte im Muster stehen.
    ('MARKE',
     'const dateien = ["mpe/buero-rostock.jpg", "mpe/buero-schwerin.jpg", "mpe/buero-berlin.jpg"];\n'
     'const namen = ["Rostock", "Schwerin", "Berlin"];',
     'const dateien = ["mpe/buero-1.jpg", "mpe/buero-2.jpg", "mpe/buero-3.jpg"];\n'
     'const namen = ["", "", ""];',
     'Buerofotos und Bueronamen der Referenz in der MPE-Seitenleiste. Die '
     'Schleife laeuft weiter ueber drei Plaetze — fehlt das Bild, vermerkt '
     'die Funktion das wie bisher als Warnung.'),
    ('MARKE',
     'const pins: Array<[number, number, string, string, string]> = [\n'
     '[12.140, 54.089, "Rostock", "r", ""],\n'
     '[11.415, 53.630, "Schwerin", "u", ""],\n'
     '[9.993, 53.551, "Hamburg", "l", "Vertriebspartner"],\n'
     '[13.413, 52.523, "Berlin", "r", ""],\n'
     '];',
     'const pins: Array<[number, number, string, string, string]> = [];\n'
     '// Die vier Kartenpunkte der Vorlage sind entfallen: sie markieren die\n'
     '// Bueros des Referenzunternehmens und seinen Vertriebspartner.\n'
     '// Ab Phase 2.4 kommen sie aus firma_standorte des Mandanten; bis dahin\n'
     '// zeichnet die Karte keine Punkte (docs/OFFEN.md).\n'
     '//',
     'Standortkarte im MPE-PDF. Gleich viele Zeilen wie zuvor, damit die '
     'Zeilenbremse im Skript greift, wenn eine andere Regel danebengeht.'),

    ('MARKE', f'const PORTAL_URL = "https://{HOST}";',
     f'const PORTAL_URL = Deno.env.get("PORTAL_URL") || "https://{HOST}";',

     'Feste Portal-Adresse aus PORTAL_URL lesen, wie in den uebrigen Funktionen.'),
    ('MARKE', f'const OBJEKT_BASIS = "https://{HOST}/objekt.html?t=";',
     f'const OBJEKT_BASIS = (Deno.env.get("PORTAL_URL") || "https://{HOST}")'
     f'.replace(/\\/?$/, "") + "/objekt.html?t=";',
     'wie oben'),
]


def pruefe_haeufigkeit(n, bemerkung, datei):
    """Notbremse gegen Regeln, die versehentlich zu breit greifen.

    Keine der Ersetzungen hat in einer einzelnen Datei einen dreistelligen
    Grund. Wer eine Regel schreibt, die 400 Mal zutrifft, hat sich vertan —
    und ohne diese Pruefung faellt es erst beim Lesen des Ergebnisses auf.
    """
    if n > 60:
        sys.exit(f'ABBRUCH: Regel "{bemerkung}" trifft in {datei} {n}-mal zu. '
                 'Das ist zu oft, um beabsichtigt zu sein.')


def main():
    if not QUELLE.is_dir():
        sys.exit(f'Nicht gefunden: {QUELLE}\n'
                 'Die Funktionen der Vorlage gehoeren unversioniert nach reference/functions.')

    zaehler = {}
    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    ZIEL.mkdir(parents=True)

    uebernommen = 0
    gestrichen = []
    for ordner in sorted(QUELLE.iterdir()):
        if not ordner.is_dir():
            continue
        if ordner.name in ENTFAELLT:
            gestrichen.append(ordner.name)
            continue
        ziel_ordner = ZIEL / ordner.name
        ziel_ordner.mkdir()
        for datei in sorted(ordner.rglob('*')):
            if datei.is_dir():
                continue
            rel = datei.relative_to(ordner)
            inhalt = datei.read_text(encoding='utf-8')
            zeilen_vorher = inhalt.count('\n')
            erweitert = False
            for regel in ERSETZUNGEN:
                grund, muster, ersatz, bemerkung = regel[:4]
                # Fuenftes Element: nur diese Funktionen. Zweimal ist eine
                # Regel breiter geraten als gedacht — einmal in siebzehn
                # Dateien, einmal in sechsundachtzig. Die Haeufigkeitsbremse
                # greift dort nicht, weil es je Datei nur ein Treffer ist.
                if len(regel) > 4 and ordner.name not in regel[4]:
                    continue
                inhalt, n = re.subn(muster, ersatz, inhalt)
                pruefe_haeufigkeit(n, bemerkung, datei)
                if n:
                    zaehler[(grund, muster)] = zaehler.get((grund, muster), 0) + n
                    if grund == 'FORK':
                        erweitert = True
            for regel in NACHBESSERN:
                grund, muster, ersatz, bemerkung = regel[:4]
                if len(regel) > 4 and ordner.name not in regel[4]:
                    continue
                n = inhalt.count(muster)
                pruefe_haeufigkeit(n, bemerkung, datei)
                if n:
                    inhalt = inhalt.replace(muster, ersatz)
                    zaehler[(grund, muster)] = zaehler.get((grund, muster), 0) + n
            # Zweite Notbremse: eine NEUTRALISIERUNG fuegt keine Zeilen hinzu
            # und entfernt hoechstens die beiden Standortzeilen. Eine
            # FORK-Regel erweitert die Vorlage und darf das sehr wohl —
            # deshalb nur fuer sie ein weiterer Rahmen, und die Zahl wird
            # ausgegeben, damit sie nicht unbemerkt waechst.
            #
            # 28.09.2026 von 80 auf 140 angehoben: die Storage-Huelle regelt
            # jetzt auch das Lesen und bringt die Liste der Plattform-
            # Schriften mit. Sie allein sind 75 Zeilen. Die Grenze soll
            # unbemerktes Wachstum melden, nicht bewusstes verhindern.
            zeilen_delta = inhalt.count('\n') - zeilen_vorher
            unten, oben = (-2, 140) if erweitert else (-2, 0)
            if not unten <= zeilen_delta <= oben:
                sys.exit(f'ABBRUCH: {datei} hat {zeilen_delta:+d} Zeilen '
                         f'(erlaubt: {unten} bis {oben}). '
                         'Eine Regel greift anders als gedacht.')
            if erweitert:
                print(f'  [FORK]     {zeilen_delta:+d} Zeilen in '
                      f'{datei.parent.name}/{datei.name}')
            ziel = ziel_ordner / rel
            ziel.parent.mkdir(parents=True, exist_ok=True)
            ziel.write_text(inhalt, encoding='utf-8')
        uebernommen += 1

    print('Neutralisierung der Edge Functions:')
    # Regeln sind Vierer- oder Fuenfertupel; das fuenfte Element grenzt eine
    # Regel auf bestimmte Funktionen ein. Fuer den Bericht zaehlt nur, was in
    # den ersten vier steht.
    alle_regeln = [r[:4] for r in ERSETZUNGEN + NACHBESSERN]
    for grund, muster, _, bemerkung in alle_regeln:
        n = zaehler.get((grund, muster), 0)
        if n:
            print(f'  [{grund:7s}] {n:4d}x  {bemerkung}')
    nie = [b for g, m, _, b in alle_regeln if not zaehler.get((g, m))]
    if nie:
        print(f'\n  {len(nie)} Regel(n) ohne Treffer — Vorlage hat sich geaendert '
              f'oder die Regel ist ueberholt:')
        for b in nie:
            print(f'    - {b}')
    print(f'\n[PHASE14] {len(gestrichen)} Funktionen gestrichen: {", ".join(gestrichen)}')
    print(f'{uebernommen} Funktionen geschrieben nach {ZIEL}')


if __name__ == '__main__':
    main()
