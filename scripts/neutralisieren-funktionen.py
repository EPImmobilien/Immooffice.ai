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
# Funktionen, die es in der Vorlage nicht gibt. Sie koennen nicht aus
# reference/functions entstehen und ueberleben den rmtree unten nur, weil
# sie woanders liegen und danach hereinkopiert werden. Siehe
# supabase/eigene/README.md.
EIGENE = WURZEL / 'supabase' / 'eigene'
# Dateien, die NEBEN eine uebernommene Funktion gehoeren — gemeinsamer
# Quelltext, den mehrere brauchen (siehe supabase/eigene-beilagen/README.md).
BEILAGEN = WURZEL / 'supabase' / 'eigene-beilagen'

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
      'reservierung-pdf-erzeugen', 'reservierung-word-erzeugen',
      'signatur-token-validieren'}),

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

    # =====================================================================
    # FORK — das Expose zeigte moeglicherweise ein fremdes Impressum
    #
    # expose-freigabe holt die Firmendaten fuer das Expose ueber
    # firma_stammdaten.slug — "standard", wenn an der Freigabe nichts steht.
    # Seit fork_17 ist der Slug nur noch JE MANDANT eindeutig. Zwei Mandanten
    # haben beide einen Standort "standard", und maybeSingle() traf bis dahin
    # genau einen — welchen, entschied die Reihenfolge der Datenbank.
    #
    # Was da falsch stehen konnte, ist nicht irgendein Feld: Firmenname,
    # Anschrift, Registergericht, HRB, Geschaeftsfuehrer, USt-ID. Das
    # Impressum des Exposes, das ein Interessent zu sehen bekommt, und der
    # Absender, unter dem er angeschrieben wird.
    #
    # Der Mandant steht am OBJEKT — das ist die verlaessliche Quelle: wessen
    # Expose es ist, entscheidet, wem das Objekt gehoert.
    # =====================================================================
    ('FORK',
     r'\.select\("id, immo_nr, objekttitel, bezeichnung, strasse, hausnummer, plz, ort, vertragsart, angebotspreis, kaltmiete, wohnflaeche, zimmer, hauptbild_url, adresse_freigeben, zustaendig_id"\)',
     '.select("id, immo_nr, objekttitel, bezeichnung, strasse, hausnummer, plz, ort, vertragsart, angebotspreis, kaltmiete, wohnflaeche, zimmer, hauptbild_url, adresse_freigeben, zustaendig_id, mandant_id")',
     'Expose-Freigabe: das Objekt bringt seinen Mandanten mit.',
     {'expose-freigabe'}),
    # Die Objektseite laedt eine andere Spaltenliste — ohne diese zweite
    # Regel waere im.mandant_id dort undefined, und die Ersatzkennung
    # daneben haette still gar nichts gefunden.
    ('FORK',
     r'\.select\("id, immo_nr, objekttitel, bezeichnung, strasse, hausnummer, plz, ort, vertragsart, angebotspreis, kaltmiete, wohnflaeche, zimmer, hauptbild_url, adresse_freigeben, provision_aussen, provisionsfrei, zustaendig_id, status"\)',
     '.select("id, immo_nr, objekttitel, bezeichnung, strasse, hausnummer, plz, ort, vertragsart, angebotspreis, kaltmiete, wohnflaeche, zimmer, hauptbild_url, adresse_freigeben, provision_aussen, provisionsfrei, zustaendig_id, status, mandant_id")',
     'Expose-Freigabe: auch die Objektseite bringt den Mandanten mit.',
     {'expose-freigabe'}),
    ('FORK',
     r'\.select\("firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon"\)\.eq\("slug", f\.firma_slug \|\| "standard"\)',
     '.select("firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon").eq("mandant_id", im?.mandant_id ?? "00000000-0000-0000-0000-000000000000").eq("slug", f.firma_slug || "standard")',
     'Expose-Freigabe: das Impressum kommt vom Mandanten des Objekts.',
     {'expose-freigabe'}),
    ('FORK',
     r'\.select\("firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon"\)\.eq\("slug", firmaSlug\)',
     '.select("firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon").eq("mandant_id", im?.mandant_id ?? "00000000-0000-0000-0000-000000000000").eq("slug", firmaSlug)',
     'Expose-Freigabe: dasselbe auf der Objektseite.',
     {'expose-freigabe'}),
    # Auch der Slug des zustaendigen Maklers gehoert in seinen Mandanten.
    ('FORK',
     r'\{ const \{ data: fs \} = await db\.from\("firma_stammdaten"\)\.select\("slug"\)\.eq\("id", makler\.firma_id\)\.maybeSingle\(\);',
     '{ const { data: fs } = await db.from("firma_stammdaten").select("slug").eq("mandant_id", im?.mandant_id ?? "00000000-0000-0000-0000-000000000000").eq("id", makler.firma_id).maybeSingle();',
     'Expose-Freigabe: auch der Standort des Maklers nur im eigenen Mandanten.',
     {'expose-freigabe'}),

    # Die Vorgabe "Objektseite an" ist seit fork_23 je Mandant eingestellt.
    # Ohne Mandanten traf die Abfrage die Einstellung irgendeines anderen —
    # oder, ab dem zweiten, gar keine mehr: maybeSingle() bricht bei zwei
    # Zeilen ab.
    ('FORK',
     r'async function landingStandard\(db: any\): Promise<boolean> \{\n  try \{ const \{ data \} = await db\.from\("portal_einstellungen"\)\.select\("wert"\)\.eq\("schluessel", "landing_standard"\)\.maybeSingle\(\);',
     'async function landingStandard(db: any, mandant: string | null): Promise<boolean> {\n'
     '  if (!mandant) return true;\n'
     '  try { const { data } = await db.from("portal_einstellungen").select("wert").eq("mandant_id", mandant).eq("schluessel", "landing_standard").maybeSingle();',
     'Expose-Freigabe: die Vorgabe der Objektseite je Mandant.',
     {'expose-freigabe'}),
    ('FORK',
     r'if \(!f\.landing && await landingStandard\(db\)\)',
     'if (!f.landing && await landingStandard(db, im?.mandant_id ?? null))',
     'Expose-Freigabe: die Vorgabe wird fuer den Mandanten des Objekts gelesen.',
     {'expose-freigabe'}),

    # Die Pruefung auf eine vorhandene Anmeldung suchte ueber die
    # E-Mail-Adresse — quer durch alle Mandanten. Wer beim einen Makler
    # angemeldet ist, waere beim anderen stillschweigend uebersprungen
    # worden.
    ('FORK',
     r'\.from\("newsletter_anmeldungen"\)\.select\("id"\)\.or\(`freigabe_id\.eq\.\$\{f\.id\},and\(email\.ilike\.\$\{mail\},widerrufen_am\.is\.null\)`\)\.limit\(1\);',
     '.from("newsletter_anmeldungen").select("id").eq("mandant_id", im?.mandant_id ?? "00000000-0000-0000-0000-000000000000").or(`freigabe_id.eq.${f.id},and(email.ilike.${mail},widerrufen_am.is.null)`).limit(1);',
     'Expose-Freigabe: eine vorhandene Anmeldung nur im eigenen Mandanten.',
     {'expose-freigabe'}),

    # --- FORK: der Kontakt wurde ueber die E-Mail-Adresse gesucht — und die
    # gibt es bei mehreren Maklern. Drei Stellen, und die dritte ist die
    # schlimmste: sie SCHREIBT. Ein Interessent, der bei Makler A ein Expose
    # herunterlaedt, haette bei Makler B die Newsletter-Zustimmung gesetzt
    # bekommen, ohne dass dort jemand etwas davon merkt.
    ('FORK',
     r'\.from\("kontakte"\)\.select\("id"\)\.ilike\("email", email\)\.eq\("aktiv", true\)\.limit\(1\)',
     '.from("kontakte").select("id").eq("mandant_id", im?.mandant_id ?? "00000000-0000-0000-0000-000000000000").ilike("email", email).eq("aktiv", true).limit(1)',
     'Expose-Freigabe: den Kontakt nur im eigenen Mandanten suchen.',
     {'expose-freigabe'}),
    ('FORK',
     r'\.from\("kontakte"\)\.select\("id"\)\.ilike\("email", mail\)\.eq\("aktiv", true\)\.limit\(1\)',
     '.from("kontakte").select("id").eq("mandant_id", im?.mandant_id ?? "00000000-0000-0000-0000-000000000000").ilike("email", mail).eq("aktiv", true).limit(1)',
     'Expose-Freigabe: dasselbe beim Bestaetigen.',
     {'expose-freigabe'}),
    ('FORK',
     r'\.from\("kontakte"\)\.update\(\{ newsletter_opt_in: true, newsletter_opt_in_am: jetzt, newsletter_quelle: quelle \}\)\.ilike\("email", mail\)',
     '.from("kontakte").update({ newsletter_opt_in: true, newsletter_opt_in_am: jetzt, newsletter_quelle: quelle }).eq("mandant_id", im?.mandant_id ?? "00000000-0000-0000-0000-000000000000").ilike("email", mail)',
     'Expose-Freigabe: die Newsletter-Zustimmung nur am eigenen Kontakt setzen.',
     {'expose-freigabe'}),

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
    # vertrag-pdf trug die drei Standorte der Referenz als Tabelle im
    # Quelltext. Bis zum 30.09.2026 blieb davon ein leerer Eintrag, und der
    # Maklervertrag entstand ohne Firmenkopf (docs/OFFEN.md, Punkt 3). Seit
    # Phase 2.4 kommen die Werte aus firma_stammdaten — siehe den Block
    # "Der Maklervertrag" weiter unten.
    #
    # Die beiden Regeln, die hier standen (STANDORTE["rostock"] und der
    # Zugriff darauf), sind am 30.09.2026 entfernt worden: die Regex-Regel
    # '"rostock"' -> '"standard"' oben erledigt das laengst, und beide waren
    # seit Wochen ohne Treffer. Aufgefallen ist es erst, nachdem der
    # Trefferzaehler je Bemerkung schluesselt.

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

    # =====================================================================
    # FORK — der Anmeldelink des Eigentuemers kannte seinen Mandanten nicht
    #
    # eigentuemer-zugang-anfordern beginnt mit einer E-Mail-Adresse, und die
    # gilt quer durch alle Mandanten. Gesucht wurde damit alles: der
    # Eigentuemersatz, die Person, der Ansprechpartner — und als Rueckfall
    # "irgendein Chef", .eq("role","chef").limit(1), ueber die ganze
    # Plattform. Dessen Name, Adresse und Telefonnummer standen dann in der
    # Mail an einen Eigentuemer, der ihn nie beauftragt hat.
    #
    # Eindeutig ist genau eine Sache: das KONTO. Eine Adresse, ein Login.
    # Also wird zuerst das Konto gesucht, daraus der Mandant gelesen, und
    # alles Weitere bleibt darin. Findet sich kein Mandant, wird nichts
    # versendet — die Antwort ist ohnehin immer { ok: true }, der Anfragende
    # merkt keinen Unterschied.
    # =====================================================================
    ('FORK',
     '    const seitStunde = new Date(Date.now() - 3600e3).toISOString();\n    const { count: nGesamt } = await admin.from("mail_versendet").select("id", { count: "exact", head: true })\n      .ilike("betreff", BETREFF_MUSTER).eq("status", "gesendet").gte("gesendet_am", seitStunde);\n    if ((nGesamt || 0) >= JE_STUNDE_GESAMT) return still("Stundenkontingent erschöpft");',
     '    // Das Stundenkontingent steht weiter unten — es wird je Mandant gezaehlt,\n    // und der steht erst fest, wenn das Konto gefunden ist.',
     'Zugang anfordern: das Stundenkontingent wandert hinter die Mandantenbestimmung.',
     {'eigentuemer-zugang-anfordern'}),
    ('FORK',
     '    // Konto finden: Profil mit Rolle eigentuemer, sonst Eigentuemer/Person mit verknuepftem Konto\n    let userId: string | null = null;\n    const { data: prof } = await admin.from("profiles").select("id, role").eq("email", email).eq("role", "eigentuemer").limit(1).maybeSingle();\n    if (prof?.id) userId = prof.id;\n    const { data: eig } = await admin.from("eigentuemer").select("id, anrede, titel, vorname, nachname, user_id, aktiv").eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();\n    const { data: pers } = await admin.from("eigentuemer_personen").select("id, anrede, vorname, nachname, user_id, eigentuemer_id").eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();\n    if (!userId) userId = eig?.user_id || pers?.user_id || null;\n    if (!userId) return still("kein Eigentümer-Zugang zu dieser Adresse");\n    if (eig && eig.aktiv === false && !pers) return still("Eigentümer inaktiv");\n    const { data: profRolle } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();\n    if (profRolle && profRolle.role !== "eigentuemer") return still("Konto ist kein Eigentümer-Konto");',
     '    // Konto finden: Profil mit Rolle eigentuemer, sonst Eigentuemer/Person mit verknuepftem Konto.\n    // Die Adresse ist der einzige Anhaltspunkt, und sie gilt mandantenuebergreifend. Deshalb wird\n    // zuerst das KONTO gesucht — das gibt es je Adresse nur einmal — und aus ihm der Mandant\n    // bestimmt. Alles Weitere bleibt in diesem Mandanten.\n    let userId: string | null = null;\n    const { data: prof } = await admin.from("profiles").select("id, role").eq("email", email).eq("role", "eigentuemer").limit(1).maybeSingle();\n    if (prof?.id) userId = prof.id;\n    if (!userId) {\n      const { data: eigKonto } = await admin.from("eigentuemer").select("user_id").eq("email", email).not("user_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();\n      const { data: persKonto } = await admin.from("eigentuemer_personen").select("user_id").eq("email", email).not("user_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();\n      userId = eigKonto?.user_id || persKonto?.user_id || null;\n    }\n    if (!userId) return still("kein Eigentümer-Zugang zu dieser Adresse");\n    const { data: profRolle } = await admin.from("profiles").select("role, mandant_id").eq("id", userId).maybeSingle();\n    if (profRolle && profRolle.role !== "eigentuemer") return still("Konto ist kein Eigentümer-Konto");\n    const mandant = profRolle?.mandant_id || null;\n    if (!mandant) return still("Konto ohne Mandanten");\n\n    // Stundenkontingent je Mandant. Global waere es eine Sperre, die ein\n    // Mandant dem anderen zuziehen kann, ohne es zu merken.\n    const seitStunde = new Date(Date.now() - 3600e3).toISOString();\n    const { count: nGesamt } = await admin.from("mail_versendet").select("id", { count: "exact", head: true })\n      .eq("mandant_id", mandant).ilike("betreff", BETREFF_MUSTER).eq("status", "gesendet").gte("gesendet_am", seitStunde);\n    if ((nGesamt || 0) >= JE_STUNDE_GESAMT) return still("Stundenkontingent erschöpft");\n\n    // Ab hier nur noch der Mandant des Kontos: Anrede, Ansprechpartner,\n    // Aktivitaet und Einladung gehoeren dorthin, wo das Konto zu Hause ist.\n    const { data: eig } = await admin.from("eigentuemer").select("id, anrede, titel, vorname, nachname, user_id, aktiv").eq("mandant_id", mandant).eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();\n    const { data: pers } = await admin.from("eigentuemer_personen").select("id, anrede, vorname, nachname, user_id, eigentuemer_id").eq("mandant_id", mandant).eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();\n    if (eig && eig.aktiv === false && !pers) return still("Eigentümer inaktiv");',
     'Zugang anfordern: erst das Konto, daraus der Mandant, dann alles Weitere darin.',
     {'eigentuemer-zugang-anfordern'}),
    ('FORK',
     '      const { data: eigA } = await admin.from("eigentuemer").select("anrede, titel").eq("id", pers.eigentuemer_id).maybeSingle();',
     '      const { data: eigA } = await admin.from("eigentuemer").select("anrede, titel").eq("mandant_id", mandant).eq("id", pers.eigentuemer_id).maybeSingle();',
     'Zugang anfordern: die Anrede aus dem eigenen Mandanten.',
     {'eigentuemer-zugang-anfordern'}),
    ('FORK',
     'await admin.from("eigentuemer_objekte").select("ansprechpartner_id").eq("eigentuemer_id", eigentuemerId)',
     'await admin.from("eigentuemer_objekte").select("ansprechpartner_id").eq("mandant_id", mandant).eq("eigentuemer_id", eigentuemerId)',
     'Zugang anfordern: der Ansprechpartner kommt aus dem eigenen Mandanten.',
     {'eigentuemer-zugang-anfordern'}),
    ('FORK',
     'const { data: ap } = await admin.from("profiles").select("id, name, email, telefon").eq("id", eo.ansprechpartner_id).maybeSingle();',
     'const { data: ap } = await admin.from("profiles").select("id, name, email, telefon").eq("mandant_id", mandant).eq("id", eo.ansprechpartner_id).maybeSingle();',
     'Zugang anfordern: auch sein Profil nur im eigenen Mandanten.',
     {'eigentuemer-zugang-anfordern'}),
    ('FORK',
     'const { data: chef } = await admin.from("profiles").select("id, name, email, telefon").eq("role", "chef").limit(1).maybeSingle();',
     'const { data: chef } = await admin.from("profiles").select("id, name, email, telefon").eq("mandant_id", mandant).eq("role", "chef").limit(1).maybeSingle();',
     'Zugang anfordern: der Rueckfall auf den Chef bleibt im eigenen Mandanten.',
     {'eigentuemer-zugang-anfordern'}),
    ('FORK',
     'await admin.from("eigentuemer_einladungen").update({ erinnert_am: new Date().toISOString(), versandweg: erg.versandweg, letzter_fehler: null }).eq("eigentuemer_id", eigentuemerId).eq("status", "offen")',
     'await admin.from("eigentuemer_einladungen").update({ erinnert_am: new Date().toISOString(), versandweg: erg.versandweg, letzter_fehler: null }).eq("mandant_id", mandant).eq("eigentuemer_id", eigentuemerId).eq("status", "offen")',
     'Zugang anfordern: die Einladung des eigenen Mandanten nachfuehren.',
     {'eigentuemer-zugang-anfordern'}),

    # =====================================================================
    # FORK — der Signaturlink las am Mandanten vorbei
    #
    # Zwei Dinge. Erstens: das PDF. Geschrieben wird es von
    # signatur-vorgang-starten und signatur-unterschreiben, beide mit der
    # Storage-Huelle — also unter {mandant}/…. Gelesen wurde es hier ohne,
    # also unter dem nackten Pfad. Der signierte Link zeigte damit auf eine
    # Datei, die es an dieser Stelle nicht gibt.
    #
    # Zweitens: der Vertrag haengt am Vorgang ueber eine blosse Kennung. Ein
    # Vorgang, der auf ein fremdes Dokument zeigt, haette dessen Adresse und
    # Bezeichnung an jeden mit dem Token herausgegeben. Die Kennung allein
    # ist kein Nachweis; der Mandant muss uebereinstimmen.
    # =====================================================================
    ('FORK',
     '    if (!vorgang) throw new Error("Signatur-Vorgang nicht gefunden.");',
     '    if (!vorgang) throw new Error("Signatur-Vorgang nicht gefunden.");\n    immoSetzeMandant(vorgang.mandant_id);',
     'Mandant aus dem Signaturvorgang: signatur-token-validieren.',
     {'signatur-token-validieren'}),
    ('FORK',
     'const { data } = await admin.from(quelltabelle).select("*").eq("id", vorgang.vertrag_id).maybeSingle();',
     'const { data } = await admin.from(quelltabelle).select("*").eq("id", vorgang.vertrag_id).eq("mandant_id", vorgang.mandant_id).maybeSingle();',
     'Signaturlink: das Dokument muss demselben Mandanten gehoeren wie der Vorgang.',
     {'signatur-token-validieren'}),

    # =====================================================================
    # FORK — die Upload-Meldung ging an die Chefs ALLER Mandanten
    #
    # upload-benachrichtigung-versenden laedt die Empfaenger einmal vor der
    # Schleife: .eq("role", "chef"), sonst nichts. Bei einem Mandanten ist
    # das die Bueroleitung. Bei zehn sind es zehn Bueroleitungen, und jede
    # bekommt jede Meldung — mit dem Namen des Eigentuemers, der Zahl der
    # Dokumente und deren Titeln ("Grundbuch", "Mieterliste"). Das ist kein
    # Zugriffsfehler an einer Schnittstelle, das ist eine Mail, die im
    # falschen Postfach liegt und dort bleibt.
    #
    # Die Chefs werden jetzt je Mandant geladen und gemerkt, damit die
    # Schleife nicht fuer jeden Eintrag neu fragt.
    # =====================================================================
    ('FORK', '    const { data: chefs } = await supabase\n      .from("profiles")\n      .select("name, email")\n      .eq("role", "chef");', '    // Die Chefs gehoeren zum Mandanten des Eintrags, nicht zur Plattform.\n    // Vorher wurden sie EINMAL geladen, ueber alle Mandanten, und jede\n    // Meldung ging an jeden von ihnen: der eine Makler las den Namen des\n    // Eigentuemers und die Titel der Dokumente des anderen mit.\n    const chefsJeMandant = new Map<string, Array<{ name: string; email: string }>>();\n    const holeChefs = async (mandant: string | null): Promise<Array<{ name: string; email: string }>> => {\n      if (!mandant) return [];\n      if (!chefsJeMandant.has(mandant)) {\n        const { data } = await supabase.from("profiles").select("name, email")\n          .eq("mandant_id", mandant).eq("role", "chef");\n        chefsJeMandant.set(mandant, (data || []) as Array<{ name: string; email: string }>);\n      }\n      return chefsJeMandant.get(mandant) || [];\n    };',
     'Upload-Meldung: die Chefs je Mandant statt einmal fuer alle.',
     {'upload-benachrichtigung-versenden'}),
    ('FORK', '    for (const eintrag of queue) {\n      try {\n        const { data: eig } = await supabase\n          .from("eigentuemer")\n          .select("anrede, vorname, nachname, firma")\n          .eq("id", eintrag.eigentuemer_id)\n          .maybeSingle();', '    for (const eintrag of queue) {\n      try {\n        const mandant = eintrag.mandant_id || null;\n        if (!mandant) throw new Error("Eintrag ohne Mandanten \\u2013 kein Versand.");\n        const { data: eig } = await supabase\n          .from("eigentuemer")\n          .select("anrede, vorname, nachname, firma")\n          .eq("mandant_id", mandant)\n          .eq("id", eintrag.eigentuemer_id)\n          .maybeSingle();',
     'Upload-Meldung: ohne Mandanten kein Versand; der Eigentuemer aus ihm.',
     {'upload-benachrichtigung-versenden'}),
    ('FORK', '          const { data: ap } = await supabase\n            .from("profiles")\n            .select("name, email")\n            .eq("id", eintrag.ansprechpartner_id)\n            .maybeSingle();', '          const { data: ap } = await supabase\n            .from("profiles")\n            .select("name, email")\n            .eq("mandant_id", mandant)\n            .eq("id", eintrag.ansprechpartner_id)\n            .maybeSingle();',
     'Upload-Meldung: der Ansprechpartner aus dem eigenen Mandanten.',
     {'upload-benachrichtigung-versenden'}),
    ('FORK', '        for (const c of chefs || []) {', '        for (const c of await holeChefs(mandant)) {',
     'Upload-Meldung: die Chefs des eigenen Mandanten.',
     {'upload-benachrichtigung-versenden'}),
    ('FORK', '        const { data: dokumente } = await supabase\n          .from("eigentuemer_dokumente")\n          .select("name, kategorie, created_at")\n          .eq("eigentuemer_id", eintrag.eigentuemer_id)', '        const { data: dokumente } = await supabase\n          .from("eigentuemer_dokumente")\n          .select("name, kategorie, created_at")\n          .eq("mandant_id", mandant)\n          .eq("eigentuemer_id", eintrag.eigentuemer_id)',
     'Upload-Meldung: die Dokumente aus dem eigenen Mandanten.',
     {'upload-benachrichtigung-versenden'}),

    # =====================================================================
    # FORK — der Push-Schalter galt fuer alle, und niemand pruefte, ob
    #        Anlass und Empfaenger zusammengehoeren
    #
    # push_einstellungen hatte bis fork_28 EINE Zeile fuer die ganze
    # Plattform (check id = 1). Wer den Push ausschaltete, schaltete ihn fuer
    # alle aus. Jetzt gibt es die Zeile je Mandant — gelesen wird sie erst,
    # wenn der Empfaenger feststeht, denn vorher ist nicht klar, wessen
    # Schalter gilt.
    #
    # Dazu die zweite Haelfte: die Funktion nahm termin_id und profile_id
    # getrennt aus dem Koerper entgegen und pruefte nie, ob beide demselben
    # Mandanten gehoeren. Die aufrufende Datenbankfunktion verbindet sie
    # richtig — aber eine Mitteilung mit Absender, Betreff und Textanfang im
    # Sperrbildschirm eines fremden Maklers darf nicht daran haengen, dass
    # der Aufrufer es gut meint.
    # =====================================================================
    ('FORK', '    const { data: global } = await db.from("push_einstellungen").select("aktiv").eq("id", 1).maybeSingle();\n    if (global && global.aktiv === false && !body.test) return antwort({ ok: true, uebersprungen: "global aus" });', '    // Der Push-Schalter gehoert seit fork_28 dem Mandanten, nicht der\n    // Plattform. Er wird deshalb weiter unten gelesen — vorher steht der\n    // Empfaenger und damit sein Mandant nicht fest.',
     'Push: der Schalter wird erst gelesen, wenn der Empfaenger feststeht.',
     {'push-senden'}),
    ('FORK', '    let refId: string | null = null, url: string | null = null, collapse: string, kategorie: string, thread: string;', '    let refId: string | null = null, url: string | null = null, collapse: string, kategorie: string, thread: string;\n    // Woher der Anlass kommt. Empfaenger und Anlass muessen demselben\n    // Mandanten gehoeren; bei test und hinweis gibt es keinen Quellsatz.\n    let quellMandant: string | null = null;',
     'Push: der Mandant des Anlasses wird mitgefuehrt.',
     {'push-senden'}),
    ('FORK', '      const { data: t } = await db.from("termine")\n        .select("id, titel, art, datum, uhrzeit, ende, ort, immobilie_id, status, ganztags")\n        .eq("id", String(body.termin_id)).maybeSingle();\n      if (!t) return antwort({ ok: false, fehler: "Termin nicht gefunden." }, 404);', '      const { data: t } = await db.from("termine")\n        .select("id, titel, art, datum, uhrzeit, ende, ort, immobilie_id, status, ganztags, mandant_id")\n        .eq("id", String(body.termin_id)).maybeSingle();\n      if (!t) return antwort({ ok: false, fehler: "Termin nicht gefunden." }, 404);\n      quellMandant = t.mandant_id || null;',
     'Push: der Termin bringt seinen Mandanten mit.',
     {'push-senden'}),
    ('FORK', '        const { data: o } = await db.from("immobilien").select("strasse, hausnummer, plz, ort").eq("id", t.immobilie_id).maybeSingle();', '        const { data: o } = await db.from("immobilien").select("strasse, hausnummer, plz, ort").eq("mandant_id", t.mandant_id).eq("id", t.immobilie_id).maybeSingle();',
     'Push: die Adresse zum Termin nur aus dessen Mandanten.',
     {'push-senden'}),
    ('FORK', '      const { data: pf } = await db.from("mail_postfaecher").select("benutzer_id, email_adresse").eq("id", mail.postfach_id).maybeSingle();\n      if (!pf?.benutzer_id) return antwort({ ok: true, uebersprungen: "Postfach ohne Benutzer" });', '      const { data: pf } = await db.from("mail_postfaecher").select("benutzer_id, email_adresse, mandant_id").eq("id", mail.postfach_id).maybeSingle();\n      if (!pf?.benutzer_id) return antwort({ ok: true, uebersprungen: "Postfach ohne Benutzer" });\n      quellMandant = pf.mandant_id || null;',
     'Push: das Postfach bringt seinen Mandanten mit.',
     {'push-senden'}),
    ('FORK', '    const { data: profil } = await db.from("profiles").select("push_mails, push_termine, push_treffer, push_stumm_von, push_stumm_bis").eq("id", profilId).maybeSingle();\n    if (typ !== "test") {', '    const { data: profil } = await db.from("profiles").select("push_mails, push_termine, push_treffer, push_stumm_von, push_stumm_bis, mandant_id").eq("id", profilId).maybeSingle();\n    if (!profil?.mandant_id) return antwort({ ok: true, uebersprungen: "Profil ohne Mandanten" });\n    // Eine Mail des einen Maklers darf nicht auf dem Telefon des anderen\n    // aufleuchten — mit Absender, Betreff und Textanfang im Sperrbildschirm.\n    if (quellMandant && quellMandant !== profil.mandant_id) {\n      return antwort({ ok: true, uebersprungen: "Anlass und Empfaenger sind verschiedene Mandanten" });\n    }\n    const { data: schalter } = await db.from("push_einstellungen").select("aktiv")\n      .eq("mandant_id", profil.mandant_id).eq("id", 1).maybeSingle();\n    if (schalter && schalter.aktiv === false && !body.test) {\n      return antwort({ ok: true, uebersprungen: "fuer diesen Mandanten aus" });\n    }\n    if (typ !== "test") {',
     'Push: Schalter je Mandant, und Anlass und Empfaenger muessen zusammenpassen.',
     {'push-senden'}),

    # akq_einstellungen: seit fork_28 je Mandant eine Zeile. Die Spanne, der
    # Startpreisfaktor und der Provisionssatz, mit denen die Schaetzung an
    # den Interessenten geht, sind die des Maklers, an den die Anfrage ging.
    ('FORK', 'const { data: einst } = await db.from("akq_einstellungen").select("*").eq("id", true).maybeSingle();', 'const { data: einst } = await db.from("akq_einstellungen").select("*").eq("mandant_id", mandant).eq("id", true).maybeSingle();',
     'Akquise: die Rechenwerte des eigenen Mandanten.',
     {'akq-lead-eingang'}),

    # =====================================================================
    # FORK — fahrt-ermitteln rechnete vom Firmensitz der Plattform
    #
    # Die Funktion ist zwar angemeldet aufrufbar, benutzt aber den
    # service_role. Sie nahm eine immobilie_id aus dem Koerper und gab
    # Entfernung, Fahrzeit und Koordinaten zurueck, ohne zu fragen, wem das
    # Objekt gehoert — der Blick in den Zwischenspeicher kam sogar VOR dem
    # Blick auf das Objekt. Und der Firmensitz, von dem aus gerechnet wurde,
    # stand in kosten_saetze, das es bis fork_28 nur einmal gab.
    #
    # Die Reihenfolge ist deshalb umgedreht: erst das Objekt, dann die
    # Mandantenpruefung, dann alles Weitere.
    # =====================================================================
    ('FORK', '  try {\n    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "");', '  try {\n    // Wer fragt. Beim Aufruf mit dem Dienstschluessel (Cron) bleibt es leer;\n    // dann entscheidet allein der Mandant des Objekts.\n    let aufruferMandant: string | null = null;\n    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "");',
     'Fahrtzeit: der Mandant des Aufrufers wird gemerkt.',
     {'fahrt-ermitteln'}),
    ('FORK', '      const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();\n      if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);\n    }', '      const { data: p } = await db.from("profiles").select("role, mandant_id").eq("id", u.user.id).maybeSingle();\n      if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);\n      aufruferMandant = p.mandant_id || null;\n    }',
     'Fahrtzeit: das Profil bringt den Mandanten mit.',
     {'fahrt-ermitteln'}),
    ('FORK', '    const { data: immo } = await db.from("immobilien")\n      .select("id, strasse, hausnummer, plz, ort, lage_koordinaten").eq("id", immobilieId).maybeSingle();\n    if (!immo) return antwort({ ok: false, fehler: "Objekt nicht gefunden." }, 404);\n\n    const { data: saetze } = await db.from("kosten_saetze").select("firmen_adresse, firmen_koordinaten").eq("id", 1).maybeSingle();', '    // Der Firmensitz, von dem aus gerechnet wird, gehoert dem Mandanten des\n    // Objekts. Bis fork_28 gab es ihn einmal fuer die ganze Plattform.\n    const { data: saetze } = await db.from("kosten_saetze").select("firmen_adresse, firmen_koordinaten").eq("mandant_id", immo.mandant_id).eq("id", 1).maybeSingle();',
     'Fahrtzeit: der Firmensitz des eigenen Mandanten.',
     {'fahrt-ermitteln'}),
    ('FORK', '    // Ein manuell gesetzter Wert wird nie ueberschrieben.\n    const { data: vorhanden } = await db.from("immobilie_fahrt_cache").select("*").eq("immobilie_id", immobilieId).maybeSingle();', '    // Erst das Objekt, dann alles Weitere. Ohne es steht der Mandant nicht\n    // fest — und ohne den waere schon der Blick in den Zwischenspeicher eine\n    // Auskunft ueber ein fremdes Objekt: Entfernung, Fahrzeit, Koordinaten.\n    const { data: immo } = await db.from("immobilien")\n      .select("id, strasse, hausnummer, plz, ort, lage_koordinaten, mandant_id").eq("id", immobilieId).maybeSingle();\n    if (!immo) return antwort({ ok: false, fehler: "Objekt nicht gefunden." }, 404);\n    if (aufruferMandant && immo.mandant_id !== aufruferMandant) {\n      return antwort({ ok: false, fehler: "Objekt nicht gefunden." }, 404);\n    }\n\n    // Ein manuell gesetzter Wert wird nie ueberschrieben.\n    const { data: vorhanden } = await db.from("immobilie_fahrt_cache").select("*").eq("mandant_id", immo.mandant_id).eq("immobilie_id", immobilieId).maybeSingle();',
     'Fahrtzeit: erst das Objekt und die Mandantenpruefung, dann der Zwischenspeicher.',
     {'fahrt-ermitteln'}),
    ('FORK', '    const satz = {\n      immobilie_id: immobilieId,', '    const satz = {\n      immobilie_id: immobilieId,\n      mandant_id: immo.mandant_id,',
     'Fahrtzeit: der Zwischenspeicher wird mit Mandanten geschrieben.',
     {'fahrt-ermitteln'}),

    # =====================================================================
    # FORK — mit der Rolle "chef" liess sich jede Mail jedes Maklers
    #        beantworten
    #
    # push-antworten weist sich ueber den APNs-Geraetetoken aus. Das ist in
    # Ordnung. Danach aber stand:
    #
    #   if (pf.benutzer_id !== profil.id && profil.role !== "chef") ...
    #
    # Ein Chef darf jedes Postfach SEINES Hauses bedienen — dass daneben
    # noch andere Haeuser stehen koennten, war beim Schreiben kein Gedanke.
    # Damit haette ein Chef mit gueltigem Geraet zu jeder mail_id antworten
    # koennen: die Antwort ginge ueber das fremde Postfach hinaus, mit
    # fremder Absenderadresse, und der zitierte Ursprungstext der fremden
    # Mail stuende darin. Die fremde Mail waere danach als gelesen markiert
    # und der Beleg laege im fremden Gesendet-Ordner.
    #
    # Die Mandantengrenze wird jetzt VOR der Rollenpruefung gezogen; die
    # Rolle entscheidet nur noch innerhalb des eigenen Hauses.
    # =====================================================================
    ('FORK', '    const { data: profil } = await db.from("profiles").select("id, name, role").eq("id", geraet.profile_id).maybeSingle();\n    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);\n\n    const { data: mail } = await db.from("mail_eingang")\n      .select("id, postfach_id, absender_email, absender_name, betreff, message_id, text, html, gesendet_am")\n      .eq("id", mailId).maybeSingle();', '    const { data: profil } = await db.from("profiles").select("id, name, role, mandant_id").eq("id", geraet.profile_id).maybeSingle();\n    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);\n    if (!profil.mandant_id) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);\n\n    // Die Mail muss dem Mandanten des Geraets gehoeren. Ohne diese Zeile\n    // reichte die Rolle "chef", um jede Mail jedes Maklers zu beantworten —\n    // ueber dessen Postfach, mit dessen Absenderadresse, und der zitierte\n    // Ursprungstext ging dabei gleich mit hinaus.\n    const { data: mail } = await db.from("mail_eingang")\n      .select("id, postfach_id, absender_email, absender_name, betreff, message_id, text, html, gesendet_am")\n      .eq("mandant_id", profil.mandant_id).eq("id", mailId).maybeSingle();',
     'Push-Antwort: die Mail muss dem Mandanten des Geraets gehoeren.',
     {'push-antworten'}),
    ('FORK', '    const { data: pf } = await db.from("mail_postfaecher").select("*").eq("id", mail.postfach_id).maybeSingle();', '    const { data: pf } = await db.from("mail_postfaecher").select("*").eq("mandant_id", profil.mandant_id).eq("id", mail.postfach_id).maybeSingle();',
     'Push-Antwort: auch das Postfach nur aus dem eigenen Mandanten.',
     {'push-antworten'}),
    ('FORK', '    const { data: log } = await db.from("mail_versendet").insert({\n      postfach_id: pf.id, versendet_von_user_id: profil.id,', '    const { data: log } = await db.from("mail_versendet").insert({\n      mandant_id: profil.mandant_id, postfach_id: pf.id, versendet_von_user_id: profil.id,',
     'Push-Antwort: der Beleg traegt den Mandanten.',
     {'push-antworten'}),
    ('FORK', '    await db.from("mail_eingang").update({ gelesen: true }).eq("id", mail.id);', '    await db.from("mail_eingang").update({ gelesen: true }).eq("mandant_id", profil.mandant_id).eq("id", mail.id);',
     'Push-Antwort: gelesen wird nur die eigene Mail gesetzt.',
     {'push-antworten'}),

    # portal-ftp-diagnose laeuft gegen das Vault-Geheimnis der Plattform —
    # ein Werkzeug des Betreibers, das absichtlich in jeden Mandanten sehen
    # darf. Nur: .eq("portal", portal).maybeSingle() sucht sich den Zugang
    # nicht aus, es bricht ab dem zweiten Mandanten ab. Der Mandant wird
    # deshalb benannt, nicht geraten.
    ('FORK', '  const { data: z } = await db.from("portal_zugaenge").select("*").eq("portal", portal).maybeSingle();\n  if (!z) {\n    return new Response(JSON.stringify({ ok: false, fehler: "kein Zugang" }), {\n      status: 404, headers: { ...cors, "Content-Type": "application/json" },\n    });\n  }', '  const mandantWunsch = url.searchParams.get("mandant") || "";\n  let zFrage = db.from("portal_zugaenge").select("*").eq("portal", portal);\n  if (/^[0-9a-f-]{36}$/i.test(mandantWunsch)) zFrage = zFrage.eq("mandant_id", mandantWunsch);\n  const { data: zZeilen } = await zFrage.limit(2);\n  const z = (zZeilen || [])[0];\n  if (!z) {\n    return new Response(JSON.stringify({ ok: false, fehler: "kein Zugang" }), {\n      status: 404, headers: { ...cors, "Content-Type": "application/json" },\n    });\n  }\n  if ((zZeilen || []).length > 1) {\n    return new Response(JSON.stringify({ ok: false, fehler: "Mehrere Mandanten haben einen Zugang zu diesem Portal. Bitte mit ?mandant=... genau einen benennen." }), {\n      status: 409, headers: { ...cors, "Content-Type": "application/json" },\n    });\n  }',
     'Portal-Diagnose: der Mandant wird benannt, nicht geraten.',
     {'portal-ftp-diagnose'}),

    # =====================================================================
    # FORK — der Objekt-Newsletter lief ueber alle Mandanten auf einmal
    #
    # suchkriterien-newsletter kennt zwei Wege hinein: den Cron mit dem
    # Vault-Geheimnis und den Chef mit seinem JWT. Beide endeten in
    # DERSELBEN Abfrage: alle Kontakte mit newsletter_opt_in, ohne
    # Mandantengrenze.
    #
    # Der Chef-Weg ist der schlimmere, weil ihn ein Mensch ausloest: ein
    # Klick auf "Objektvorschlaege senden", und die Kunden der anderen
    # Makler bekommen Post — mit deren Objekten, ueber deren Postfaecher —
    # und die Antwort legt dem Klickenden deren Empfaengerlisten mit Namen
    # und E-Mail-Adressen vor.
    #
    # Der Lauf ist deshalb je Mandant: einer beim Chef, alle nacheinander
    # beim Cron. Auch der Schalter "automatischer Versand" gehoert seit
    # fork_23 dem Mandanten — er wurde global gelesen, und maybeSingle()
    # waere ab dem zweiten Mandanten ohnehin abgebrochen.
    # =====================================================================
    ('FORK', '    const vomCron = !nutzerId; // per Geheimnis, nicht per Chef-JWT\n    if (vomCron && !trocken) {\n      const { data: e } = await db.from("portal_einstellungen").select("wert").eq("schluessel", "newsletter_automatisch").maybeSingle();\n      const schalter = e?.wert === true || String(e?.wert ?? "").toLowerCase() === "ja";\n      if (!schalter) return antwort({ ok: true, gesendet: 0, uebersprungen: true, grund: "Automatischer Versand ist ausgeschaltet (Einstellungen -> Vorgaben -> Objekt-Newsletter). Nichts gesendet." });\n    }\n    const resendKey = Deno.env.get("RESEND_API_KEY");\n    if (!resendKey && !trocken) throw new Error("RESEND_API_KEY nicht gesetzt");\n\n    // Empfaenger\n    let q = db.from("kontakte").select("id, anrede, titel, vorname, nachname, firma, email, zustaendig_id, ersteller_id, such_profil")\n      .eq("aktiv", true).eq("newsletter_opt_in", true).eq("werbung_opt_out", false).not("email", "is", null).not("such_profil", "is", null);\n    if (body.kontakt_id) q = q.eq("id", body.kontakt_id);\n    const { data: kontakte, error: kErr } = await q.limit(500);\n    if (kErr) throw kErr;\n    const empfaenger = (kontakte || []).filter((k: any) => !k.such_profil?.status || k.such_profil.status === "aktiv");\n\n    // Chef-Postfach als Rueckfall\n    const { data: chefPf } = await db.from("mail_postfaecher").select("*, profiles!inner(role)").eq("aktiv", true).eq("profiles.role", "chef").order("standard_zum_senden", { ascending: false }).limit(1);\n    const rueckfall = chefPf && chefPf[0] || null;\n    const pfCache = new Map<string, any>();\n    const postfachFuer = async (profilId: string | null) => {\n      if (!profilId) return rueckfall;\n      if (pfCache.has(profilId)) return pfCache.get(profilId);\n      const { data } = await db.from("mail_postfaecher").select("*").eq("benutzer_id", profilId).eq("aktiv", true).order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);\n      const pf = data && data[0] || rueckfall; pfCache.set(profilId, pf); return pf;\n    };\n\n    const log: any[] = []; let gesendet = 0, ohneTreffer = 0;\n    for (const k of empfaenger) {', '    const vomCron = !nutzerId; // per Geheimnis, nicht per Chef-JWT\n    const resendKey = Deno.env.get("RESEND_API_KEY");\n    if (!resendKey && !trocken) throw new Error("RESEND_API_KEY nicht gesetzt");\n\n    // Ein Lauf gehoert einem Mandanten. Der Chef-Weg: seinem eigenen. Der\n    // Cron-Weg: allen, aber jedem fuer sich — Schalter, Empfaenger,\n    // Postfaecher und Protokoll bleiben getrennt.\n    //\n    // Vorher lief beides ueber ALLE Kontakte ALLER Mandanten. Ein Chef, der\n    // auf "Objektvorschlaege senden" klickt, haette damit die Newsletter der\n    // anderen Makler verschickt — mit deren Objekten, ueber deren\n    // Postfaecher — und die Antwort haette ihm deren Empfaengerlisten mit\n    // Namen und E-Mail-Adressen zurueckgegeben.\n    let mandanten: string[] = [];\n    if (nutzerId) {\n      const { data: mp } = await db.from("profiles").select("mandant_id").eq("id", nutzerId).maybeSingle();\n      if (!mp?.mandant_id) return antwort({ ok: false, fehler: "Konto ohne Mandanten." });\n      mandanten = [String(mp.mandant_id)];\n    } else {\n      const { data: alle } = await db.from("mandanten").select("id").order("erstellt_am");\n      mandanten = (alle || []).map((m: any) => String(m.id));\n    }\n\n    const log: any[] = []; let gesendet = 0, ohneTreffer = 0, empfaengerGesamt = 0, ohneSchalter = 0;\n    // Die Schleife laesst die Einrueckung darunter, wie sie war — so bleibt\n    // der Unterschied zur Vorlage lesbar und beschraenkt sich auf das, was\n    // sich wirklich aendert.\n    for (const mandant of mandanten) {\n    if (vomCron && !trocken) {\n      const { data: e } = await db.from("portal_einstellungen").select("wert").eq("mandant_id", mandant).eq("schluessel", "newsletter_automatisch").maybeSingle();\n      const schalter = e?.wert === true || String(e?.wert ?? "").toLowerCase() === "ja";\n      if (!schalter) { ohneSchalter++; continue; }\n    }\n\n    // Empfaenger\n    let q = db.from("kontakte").select("id, anrede, titel, vorname, nachname, firma, email, zustaendig_id, ersteller_id, such_profil")\n      .eq("mandant_id", mandant)\n      .eq("aktiv", true).eq("newsletter_opt_in", true).eq("werbung_opt_out", false).not("email", "is", null).not("such_profil", "is", null);\n    if (body.kontakt_id) q = q.eq("id", body.kontakt_id);\n    const { data: kontakte, error: kErr } = await q.limit(500);\n    if (kErr) throw kErr;\n    const empfaenger = (kontakte || []).filter((k: any) => !k.such_profil?.status || k.such_profil.status === "aktiv");\n    empfaengerGesamt += empfaenger.length;\n\n    // Chef-Postfach als Rueckfall\n    const { data: chefPf } = await db.from("mail_postfaecher").select("*, profiles!inner(role)").eq("mandant_id", mandant).eq("aktiv", true).eq("profiles.role", "chef").order("standard_zum_senden", { ascending: false }).limit(1);\n    const rueckfall = chefPf && chefPf[0] || null;\n    const pfCache = new Map<string, any>();\n    const postfachFuer = async (profilId: string | null) => {\n      if (!profilId) return rueckfall;\n      if (pfCache.has(profilId)) return pfCache.get(profilId);\n      const { data } = await db.from("mail_postfaecher").select("*").eq("mandant_id", mandant).eq("benutzer_id", profilId).eq("aktiv", true).order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);\n      const pf = data && data[0] || rueckfall; pfCache.set(profilId, pf); return pf;\n    };\n\n    for (const k of empfaenger) {',
     'Objekt-Newsletter: ein Lauf je Mandant statt einer ueber alle.',
     {'suchkriterien-newsletter'}),
    ('FORK', '          const { data: an } = await db.from("newsletter_anmeldungen").select("abmelde_token").ilike("email", String(k.email).trim()).is("widerrufen_am", null).order("angemeldet_am", { ascending: false }).limit(1);', '          const { data: an } = await db.from("newsletter_anmeldungen").select("abmelde_token").eq("mandant_id", mandant).ilike("email", String(k.email).trim()).is("widerrufen_am", null).order("angemeldet_am", { ascending: false }).limit(1);',
     'Objekt-Newsletter: der Abmelde-Token des eigenen Mandanten.',
     {'suchkriterien-newsletter'}),
    ('FORK', 'const { data: f } = await db.from("firma_stammdaten").select("slug").eq("id", zp.firma_id).maybeSingle(); if (f?.slug) firmaSlug = f.slug;', 'const { data: f } = await db.from("firma_stammdaten").select("slug").eq("mandant_id", mandant).eq("id", zp.firma_id).maybeSingle(); if (f?.slug) firmaSlug = f.slug;',
     'Objekt-Newsletter: der Standort des eigenen Mandanten.',
     {'suchkriterien-newsletter'}),
    ('FORK', '      log.push(eintrag);\n    }\n    return antwort({ ok: true, empfaenger: empfaenger.length, gesendet, ohne_treffer: ohneTreffer, trocken, log: log.slice(0, 200) });', '      log.push(eintrag);\n    }\n    }\n    return antwort({ ok: true, mandanten: mandanten.length, empfaenger: empfaengerGesamt, gesendet, ohne_treffer: ohneTreffer, ohne_schalter: ohneSchalter, trocken, log: log.slice(0, 200) });',
     'Objekt-Newsletter: die Schleife wird geschlossen, gezaehlt wird ueber alle.',
     {'suchkriterien-newsletter'}),

    # =====================================================================
    # FORK — das News-Briefing brach ab dem zweiten Mandanten ab
    #
    # Der Inhalt ist oeffentliche Presse und fuer alle derselbe; das ist
    # keine Mandantenfrage. Die Buchfuehrung darum schon: fork_16 schreibt
    # eine Zeile je Mandant, aber die Funktion las die Idempotenz noch mit
    # .limit(1).maybeSingle() und schloss das Schreiben mit .select().single()
    # ab. Bei einem Mandanten geht das auf. Bei zwei liefert der upsert zwei
    # Zeilen — und .single() bricht ab. Der Cron waere also ab dem zweiten
    # Mandanten jeden Morgen mit einem Fehler zurueckgekommen.
    # =====================================================================
    ('FORK', '    if (!force) {\n      const { data: existing } = await admin\n        .from("news_briefings").select("id").eq("briefing_datum", heute).limit(1).maybeSingle();\n      if (existing?.id) {\n        return jsonResponse({\n          ok: true,\n          briefing_id: existing.id,\n          info: "Briefing fuer heute existiert bereits. Nutze {force: true} zum Ueberschreiben.",\n        });\n      }\n    }', '    if (!force) {\n      // Gezaehlt statt geschaut: eine einzelne Zeile hiesse frueher "fuer\n      // alle erledigt". Ein Mandant, der heute dazugekommen ist, haette\n      // dann bis morgen kein Briefing.\n      const { count: schon } = await admin\n        .from("news_briefings").select("id", { count: "exact", head: true }).eq("briefing_datum", heute);\n      const { count: wieViele } = await admin\n        .from("mandanten").select("id", { count: "exact", head: true });\n      if ((wieViele || 0) > 0 && (schon || 0) >= (wieViele || 0)) {\n        return jsonResponse({\n          ok: true,\n          mandanten: wieViele || 0,\n          info: "Briefing fuer heute existiert bereits. Nutze {force: true} zum Ueberschreiben.",\n        });\n      }\n    }',
     'News-Briefing: erledigt ist es erst, wenn jeder Mandant seine Zeile hat.',
     {'news-briefing-erstellen'}),
    ('FORK', '    const { data: briefing, error: insErr } = await admin\n      .from("news_briefings")', '    // Eine Zeile je Mandant — .single() hat ab dem zweiten abgebrochen.\n    const { data: briefingZeilen, error: insErr } = await admin\n      .from("news_briefings")',
     'News-Briefing: die Antwort erwartet nicht mehr genau eine Zeile.',
     {'news-briefing-erstellen'}),
    ('FORK', '      })), { onConflict: "mandant_id,briefing_datum" })\n      .select()\n      .single();\n\n    if (insErr) throw insErr;\n\n    return jsonResponse({\n      ok: true,\n      briefing_id: briefing.id,', '      })), { onConflict: "mandant_id,briefing_datum" })\n      .select("id");\n\n    if (insErr) throw insErr;\n\n    return jsonResponse({\n      ok: true,\n      mandanten: (briefingZeilen || []).length,\n      briefing_id: (briefingZeilen || [])[0]?.id ?? null,',
     'News-Briefing: gezaehlt wird, was geschrieben wurde.',
     {'news-briefing-erstellen'}),

    # =====================================================================
    # FORK/MARKE — projekt-wohnungen trug ein Kundenprojekt im Quelltext
    #
    # Die Funktion beliefert die Wohnungsuebersicht einer Neubau-Microsite.
    # In der Vorlage stand das Projekt FEST EINGEBAUT: ein Name, eine
    # Strasse, ein Ort, eine Liste von Haeusern. Zwei Dinge sind daran
    # falsch. Erstens sind das die Daten eines einzelnen Kunden, und
    # CLAUDE.md nennt Beispieldaten und Standardwerte ausdruecklich.
    # Zweitens kann die Seite so nie ein zweites Projekt zeigen.
    #
    # Gesucht wurden die Wohnungen ueber Strasse und Ort — ohne Mandanten.
    # Zwei Makler mit Objekten in derselben Strasse haetten sie vermischt,
    # und die Microsite des einen haette die Mieten des anderen angezeigt.
    #
    # Jetzt kommt das Projekt aus der Tabelle projekte (der Slug ist seit
    # fork_29 plattformweit eindeutig, weil er die oeffentliche Adresse
    # ist), und die Wohnungen kommen aus seinem Mandanten.
    # =====================================================================
    ('FORK', '// ---------------------------------------------------------------------------\n// Bekannte Projekte. Schluessel = ?projekt=<slug>\n// ---------------------------------------------------------------------------\ntype Projekt = {\n  name: string;\n  strasse: string;\n  ort: string;\n  // Reihenfolge der Haeuser auf der Seite. Haeuser ausserhalb dieser Liste\n  // werden hinten angehaengt, damit ein neues Haus nicht unsichtbar bleibt.\n  haeuser: string[];\n};', '// ---------------------------------------------------------------------------\n// Das Projekt kommt aus der Tabelle projekte, nicht aus dem Quelltext.\n//\n// Die Vorlage trug hier EIN Projekt fest eingebaut: Name, Strasse, Ort und\n// die Reihenfolge der Haeuser. Das ist im Fork aus zwei Gruenden nichts:\n// es sind Daten eines einzelnen Kunden im Produkt, und mehr als dieses eine\n// Projekt kann die Seite damit nie zeigen.\n//\n// Die Reihenfolge der Haeuser steht damit nicht mehr im Quelltext. Sie\n// ergibt sich aus den Hausnummern, natuerlich sortiert — "6-8" vor "10-12".\n// ---------------------------------------------------------------------------\ntype Projekt = {\n  name: string;\n  strasse: string;\n  ort: string;\n  mandant_id: string | null;\n};\n\nconst hausWert = (h: string): number => {\n  const m = String(h || "").match(/(\\d+)/);\n  return m ? Number(m[1]) : 99999;\n};',
     'Neubau-Wohnungen: das Projekt kommt aus der Tabelle, nicht aus dem Quelltext.',
     {'projekt-wohnungen'}),
    ('FORK', '    const slug = url.searchParams.get("projekt") || "";\n    const projekt = PROJEKTE[slug];\n    if (!projekt) {\n      return json({ ok: false, error: "Unbekanntes Projekt", bekannt: Object.keys(PROJEKTE) }, 404);\n    }\n\n    const db = createClient(\n      Deno.env.get("SUPABASE_URL")!,\n      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,\n      { auth: { persistSession: false } },\n    );\n', '    const slug = url.searchParams.get("projekt") || "";\n    if (!slug) return json({ ok: false, error: "Unbekanntes Projekt" }, 404);\n\n    const db = createClient(\n      Deno.env.get("SUPABASE_URL")!,\n      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,\n      { auth: { persistSession: false } },\n    );\n\n    // Der Slug ist seit fork_29 plattformweit eindeutig — er ist die\n    // oeffentliche Adresse dieser Seite.\n    const { data: projektZeile } = await db.from("projekte")\n      .select("name, strasse, ort, mandant_id").eq("slug", slug).eq("status", "aktiv").maybeSingle();\n    if (!projektZeile || !projektZeile.mandant_id) {\n      return json({ ok: false, error: "Unbekanntes Projekt" }, 404);\n    }\n    const projekt: Projekt = {\n      name: String(projektZeile.name || ""),\n      strasse: String(projektZeile.strasse || ""),\n      ort: String(projektZeile.ort || ""),\n      mandant_id: String(projektZeile.mandant_id),\n    };\n    if (!projekt.strasse || !projekt.ort) {\n      return json({ ok: false, error: "Dem Projekt fehlt die Adresse; ohne sie lassen sich die Wohnungen nicht zuordnen." }, 409);\n    }\n',
     'Neubau-Wohnungen: der Slug schlaegt das Projekt nach.',
     {'projekt-wohnungen'}),
    ('FORK', '      .in("status", ["vermarktung", "reserviert", "archiviert"])\n      .ilike("strasse", projekt.strasse)', '      .in("status", ["vermarktung", "reserviert", "archiviert"])\n      // Strasse und Ort allein reichen nicht: zwei Makler koennen Objekte in\n      // derselben Strasse fuehren, und die Seite haette sie vermischt.\n      .eq("mandant_id", projekt.mandant_id)\n      .ilike("strasse", projekt.strasse)',
     'Neubau-Wohnungen: nur Objekte des eigenen Mandanten.',
     {'projekt-wohnungen'}),
    ('FORK', '    // Reihenfolge festlegen, damit die Seite die Haeuser stabil anzeigt.\n    const reihenfolge = [...projekt.haeuser];\n    for (const i of data || []) {\n      const h = String(i.hausnummer || "").trim();\n      if (h && !reihenfolge.includes(h)) reihenfolge.push(h);\n    }', '    // Reihenfolge festlegen, damit die Seite die Haeuser stabil anzeigt.\n    // Ohne Liste im Quelltext: nach der ersten Zahl der Hausnummer.\n    const reihenfolge: string[] = [];\n    for (const i of data || []) {\n      const h = String(i.hausnummer || "").trim();\n      if (h && !reihenfolge.includes(h)) reihenfolge.push(h);\n    }\n    reihenfolge.sort((x, y) => hausWert(x) - hausWert(y) || x.localeCompare(y, "de"));',
     'Neubau-Wohnungen: die Reihenfolge ergibt sich aus den Hausnummern.',
     {'projekt-wohnungen'}),
    # Und die Liste selbst: ein einzelnes Kundenprojekt mit Name, Strasse
    # und Ort im Quelltext eines Produkts, das an andere verkauft wird.
    ('MARKE', 'const PROJEKTE: Record<string, Projekt> = {\n  "muehlenblick-teterow": {\n    name: "Wohnquartier Mühlenblick",\n    strasse: "Mühlenblick",\n    ort: "Teterow",\n    haeuser: ["6-8", "10-12", "14-16"],\n  },\n};\n\n', '',
     'Fest eingebautes Kundenprojekt in projekt-wohnungen entfernt.',
     {'projekt-wohnungen'}),

    # =====================================================================
    # FORK — die KI-Bilder landeten ausserhalb des Mandantenordners
    #
    # ki-bildbearbeitung prueft das JWT selbst und arbeitet danach mit dem
    # service_role, fuer den RLS nicht gilt. Die Pfade waren
    # {userId}/… und _temp/{userId}/… — ohne Mandanten.
    #
    # Zu erraten ist da nichts, userId ist eine uuid. Aber die restriktive
    # Richtlinie aus fork_09 prueft das ERSTE Pfadsegment: eine Datei
    # ausserhalb des Mandantenordners ist fuer die Anwendung unsichtbar und
    # von dort auch nicht mehr zu loeschen. Sie liegt im oeffentlichen Eimer
    # und bleibt liegen — genau der Zustand, den storage_ohne_mandant()
    # meldet.
    #
    # Der Mandant kommt aus dem Profil des Aufrufers und wird durchgereicht.
    # Ohne Mandanten wird nichts abgelegt.
    # =====================================================================
    ('FORK', '      const { data: profil } = await userClient\n        .from("profiles").select("name").eq("id", userId).single();\n      if (profil?.name) userName = profil.name;\n    } catch (_) { /* egal */ }', '      const { data: profil } = await userClient\n        .from("profiles").select("name, mandant_id").eq("id", userId).single();\n      if (profil?.name) userName = profil.name;\n      if (profil?.mandant_id) mandant = String(profil.mandant_id);\n    } catch (_) { /* egal */ }\n    // Ohne Mandanten wird nichts abgelegt. Der Eimer ki-bilder ist\n    // oeffentlich, die restriktive Richtlinie aus fork_09 prueft das erste\n    // Pfadsegment — eine Datei ausserhalb des Mandantenordners waere fuer\n    // die Anwendung unsichtbar und liesse sich von dort auch nicht mehr\n    // loeschen.\n    if (!mandant) {\n      return new Response(\n        JSON.stringify({ error: "Konto ohne Mandanten." }),\n        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },\n      );\n    }',
     'KI-Bildbearbeitung: der Mandant kommt aus dem Profil des Aufrufers.',
     {'ki-bildbearbeitung'}),
    ('FORK', '    const userId = userData.user.id;\n\n    // Anzeigename aus profiles holen (optional, faellt auf E-Mail zurueck)\n    let userName = userData.user.email || "";', '    const userId = userData.user.id;\n\n    // Anzeigename aus profiles holen (optional, faellt auf E-Mail zurueck)\n    let userName = userData.user.email || "";\n    let mandant = "";',
     'KI-Bildbearbeitung: Platz fuer den Mandanten.',
     {'ki-bildbearbeitung'}),
    ('FORK', 'async function bildUrlAuflösen(\n  supabase: ReturnType<typeof createClient>,\n  bild: BildEingabe,\n  userId: string,\n  rolle: "input" | "maske",\n): Promise<string> {', 'async function bildUrlAuflösen(\n  supabase: ReturnType<typeof createClient>,\n  bild: BildEingabe,\n  userId: string,\n  mandant: string,\n  rolle: "input" | "maske",\n): Promise<string> {',
     'KI-Bildbearbeitung: der Zwischenpfad kennt den Mandanten.',
     {'ki-bildbearbeitung'}),
    ('FORK', '  const pfad = `_temp/${userId}/${Date.now()}_${crypto.randomUUID()}_${rolle}.${ext}`;', '  const pfad = `${mandant}/_temp/${userId}/${Date.now()}_${crypto.randomUUID()}_${rolle}.${ext}`;',
     'KI-Bildbearbeitung: Zwischenablage im Mandantenordner.',
     {'ki-bildbearbeitung'}),
    ('FORK', 'async function ladeNachStorage(\n  bildUrl: string,\n  funktion: Funktion,\n  userId: string,\n  dateiname: string,\n): Promise<{ path: string; publicUrl: string }> {', 'async function ladeNachStorage(\n  bildUrl: string,\n  funktion: Funktion,\n  userId: string,\n  mandant: string,\n  dateiname: string,\n): Promise<{ path: string; publicUrl: string }> {',
     'KI-Bildbearbeitung: auch das Ergebnis kennt den Mandanten.',
     {'ki-bildbearbeitung'}),
    ('FORK', '  // Pfad: ki-bilder/{userId}/{funktion}/{timestamp}_{slug}.ext', '  // Pfad: ki-bilder/{mandant}/{userId}/{funktion}/{timestamp}_{slug}.ext',
     'KI-Bildbearbeitung: der Kommentar nennt den Mandanten mit.',
     {'ki-bildbearbeitung'}),
    ('FORK', '  const path = `${userId}/${funktion}/${Date.now()}_${slug || "bild"}.${extension}`;', '  const path = `${mandant}/${userId}/${funktion}/${Date.now()}_${slug || "bild"}.${extension}`;',
     'KI-Bildbearbeitung: das Ergebnis liegt im Mandantenordner.',
     {'ki-bildbearbeitung'}),
    ('FORK', 'async function buildInput(\n  body: RequestBody,\n  supabase: ReturnType<typeof createClient>,\n  userId: string,\n): Promise', 'async function buildInput(\n  body: RequestBody,\n  supabase: ReturnType<typeof createClient>,\n  userId: string,\n  mandant: string,\n): Promise',
     'KI-Bildbearbeitung: der Mandant wird durchgereicht.',
     {'ki-bildbearbeitung'}),
    ('FORK', '  const bildUrl = await bildUrlAuflösen(supabase, body.bild, userId, "input");', '  const bildUrl = await bildUrlAuflösen(supabase, body.bild, userId, mandant, "input");',
     'KI-Bildbearbeitung: Aufruf mit Mandant.',
     {'ki-bildbearbeitung'}),
    ('FORK', '      const built = await buildInput(body, supabaseAdmin, userId);', '      const built = await buildInput(body, supabaseAdmin, userId, mandant);',
     'KI-Bildbearbeitung: Aufruf mit Mandant (buildInput).',
     {'ki-bildbearbeitung'}),
    ('FORK', '    const { path, publicUrl } = await ladeNachStorage(\n      bildUrl,\n      body.funktion,\n      userId,\n      body.dateiname || "bild",\n    );', '    const { path, publicUrl } = await ladeNachStorage(\n      bildUrl,\n      body.funktion,\n      userId,\n      mandant,\n      body.dateiname || "bild",\n    );',
     'KI-Bildbearbeitung: Aufruf mit Mandant (ladeNachStorage).',
     {'ki-bildbearbeitung'}),

    # =====================================================================
    # FORK — JWT geprueft, service_role benutzt, Kennung aus dem Koerper
    #        geglaubt
    #
    # Die 28 Funktionen ohne JWT-Pruefung sind durch. Die andere Haelfte hat
    # dasselbe Muster: das JWT wird geprueft, danach arbeitet die Funktion
    # mit dem service_role — und nimmt eine Kennung aus dem Anfragekoerper,
    # ohne zu fragen, wem der Satz gehoert. Ein angemeldeter Nutzer des einen
    # Maklers erreicht damit die Daten des anderen.
    #
    # 63 der 90 JWT-gepruefen Funktionen benutzen den service_role, 40 davon
    # nehmen eine Kennung entgegen. Diese Runde nimmt sich die acht vor, bei
    # denen am meisten daran haengt. tests/funktionen-angemeldet.py fuehrt
    # Buch; die Liste darf nur kuerzer werden.
    #
    # Der Weg ist der von fork_14: nicht die Koerper neu schreiben, sondern
    # EINE Zeile vorne einziehen. Die Pruefung selbst steht schon in der
    # Datenbank.
    # =====================================================================
    ('FORK',
     'import { createClient } from "jsr:@supabase/supabase-js@2";',
     'import { createClient } from "jsr:@supabase/supabase-js@2";\n\n// --- Mandantengrenze fuer Kennungen aus dem Anfragekoerper -----------------\n// Diese Funktion prueft das JWT, arbeitet danach aber mit dem service_role —\n// und fuer den gilt RLS nicht. Eine Kennung, die der Aufrufer mitschickt, ist\n// damit ungeprueft: sie kann auf einen Satz eines anderen Mandanten zeigen.\n//\n// public.mandant_sichern() aus fork_14 zieht genau diese Grenze. Sie muss\n// aber MIT DEM TOKEN DES AUFRUFERS gerufen werden — unter dem service_role\n// laesst sie jeden durch (mandant_grenze_gilt() ist dort false, mit Absicht:\n// Cron und Wartung haben keinen Mandanten). Deshalb ein zweiter Client, der\n// nur den mitgebrachten Kopf weiterreicht.\n//\n// Ohne Anmeldekopf oder mit dem Dienstschluessel passiert nichts — das sind\n// die internen Wege, und die sind nicht die Grenze, die hier gezogen wird.\nasync function immoMandantSichern(req: Request, paare: Array<[string, unknown]>): Promise<void> {\n  const kopf = req.headers.get("Authorization") || "";\n  if (!/^Bearer\\s+/i.test(kopf)) return;\n  const zuPruefen = paare.filter(([, id]) =>\n    typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));\n  if (!zuPruefen.length) return;\n  const nutzer = createClient(\n    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,\n    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });\n  for (const [tabelle, id] of zuPruefen) {\n    const { error } = await nutzer.rpc("mandant_sichern", { p_tabelle: tabelle, p_id: id });\n    if (error) throw new Error("Kein Zugriff auf Daten eines anderen Mandanten.");\n  }\n}\n\n// Wessen Mandant ist der Aufrufer? Fuer die Faelle, in denen nicht eine\n// Kennung, sondern ein PFAD aus dem Anfragekoerper kommt — das erste\n// Pfadsegment im Dateispeicher ist seit fork_09 die Mandantenkennung.\nasync function immoMandantDesAufrufers(req: Request): Promise<string | null> {\n  const kopf = req.headers.get("Authorization") || "";\n  if (!/^Bearer\\s+/i.test(kopf)) return null;\n  const nutzer = createClient(\n    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,\n    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });\n  const { data: u } = await nutzer.auth.getUser(kopf.replace(/^Bearer\\s+/i, ""));\n  if (!u?.user) return null;\n  const { data: prof } = await nutzer.from("profiles").select("mandant_id").eq("id", u.user.id).maybeSingle();\n  return prof?.mandant_id ? String(prof.mandant_id) : null;\n}',
     'Waechter fuer Kennungen aus dem Anfragekoerper eingezogen.',
     {'eigentuemer-nachricht-senden', 'signatur-vorgang-widerrufen', 'ea-mailtest', 'web-asset-kopieren', 'rechnung-pdf-erzeugen', 'termin-fahrzeit', 'eigentuemer-einladen', 'reservierung-pdf-erzeugen', 'newsletter-senden', 'mail-postfach-pull', 'expose-pdf-erzeugen', 'credentials-anzeigen', 'akq-automation-lauf', 'bewerbertest-einladen', 'eigentuemer-loeschen', 'mail-ki-vorschlag', 'projekt-nachricht-antwort', 'portal-export-homepage', 'mail-gelesen-setzen', 'akq-mail-leads', 'mail-zu-todo', 'besichtigung-nachfassen', 'upload_benachrichtigung_planen', 'brief-pdf-erzeugen', 'mail-postfach-backfill', 'eigentuemer-dokument-uebernehmen', 'eigentuemer-link-erneut-senden', 'mail-rechnung-weiterleiten', 'eigentuemer-einladung-nachfassen', 'objekt-wissen-auslesen', 'eigentuemer-person-hinzufuegen', 'mail-anfrage-verarbeiten', 'urlaub-hinweise', 'bild-beschriften', 'mail-anhaenge-extrahieren', 'reservierung-word-erzeugen', 'eigentuemer-dokument-onedrive-push', 'termin-erinnerung', 'mietvertrag-pdf', 'portal-export', 'termin-serie', 'vertrag-pdf', 'credentials-speichern', 'expose-freigabe-erstellen', 'mail-senden', 'akq-wertindikation-pdf', 'signatur-vorgang-starten', 'mitarbeiter-loeschen', 'mpe-pdf-erzeugen', 'mail-postfach-speichern', 'mitarbeiter-anlegen', 'mail-zu-mietanfrage', 'bild-web-variante', 'energieausweis-auslesen', 'eigentuemer-report-pdf'}),
    ('FORK', '    const query = admin.from("external_credentials").select("*").eq("aktiv", true);', '    // Der schwerste Fall dieser Runde: die Antwort enthaelt das\n    // ENTSCHLUESSELTE Passwort. Mit einer credential_id aus dem Koerper waere\n    // das der FTP- oder Portalzugang eines fremden Maklers im Klartext.\n    await immoMandantSichern(req, [["external_credentials", credentialId]]);\n\n    const query = admin.from("external_credentials").select("*").eq("mandant_id", profil.mandant_id).eq("aktiv", true);',
     'Zugangsdaten: nur die des eigenen Mandanten.',
     {'credentials-anzeigen'}),
    ('FORK', '      .from("profiles").select("role, name").eq("id", userData.user.id).maybeSingle();', '      .from("profiles").select("role, name, mandant_id").eq("id", userData.user.id).maybeSingle();',
     'Zugangsdaten: der Mandant des Aufrufers.',
     {'credentials-anzeigen'}),
    ('FORK', '      .from("profiles").select("id, name, role").eq("id", mitarbeiterId).maybeSingle();', '      .from("profiles").select("id, name, role").eq("id", mitarbeiterId).maybeSingle();\n    // Ein Chef darf seine Leute loeschen — nicht die eines anderen Hauses.\n    await immoMandantSichern(req, [["profiles", mitarbeiterId],\n                                   ["profiles", neuerVerantwortlicherId]]);',
     'Mitarbeiter loeschen: nur im eigenen Haus.',
     {'mitarbeiter-loeschen'}),
    ('FORK', '    const rechnungId = (body.rechnung_id || "").toString().trim();', '    const rechnungId = (body.rechnung_id || "").toString().trim();\n    await immoMandantSichern(req, [["rechnungen", rechnungId]]);',
     'Rechnungs-PDF: nur eigene Rechnungen.',
     {'rechnung-pdf-erzeugen'}),
    ('FORK', '    const mailId = String(body?.mail_id || "").trim();', '    const mailId = String(body?.mail_id || "").trim();\n    await immoMandantSichern(req, [["mail_eingang", mailId]]);',
     'Mail als gelesen: nur eigene Mails.',
     {'mail-gelesen-setzen'}),
    ('FORK', '    const mail_id = body?.mail_id;', '    const mail_id = body?.mail_id;\n    await immoMandantSichern(req, [["mail_eingang", mail_id]]);',
     'Anhaenge auslesen: nur aus eigenen Mails.',
     {'mail-anhaenge-extrahieren'}),
    ('FORK', '    const eigentuemer_id = body.eigentuemer_id;', '    const eigentuemer_id = body.eigentuemer_id;\n    await immoMandantSichern(req, [["eigentuemer", eigentuemer_id]]);',
     'Nachricht an den Eigentuemer: nur an den eigenen.',
     {'eigentuemer-nachricht-senden'}),
    ('FORK', '    const eigentuemerId = (body.eigentuemer_id || "").toString().trim();', '    const eigentuemerId = (body.eigentuemer_id || "").toString().trim();\n    await immoMandantSichern(req, [["eigentuemer", eigentuemerId]]);',
     'Person hinzufuegen: nur an einem eigenen Eigentuemer.',
     {'eigentuemer-person-hinzufuegen'}),
    ('FORK', '    const immobilieId = String(body.immobilie_id || "").trim();', '    const immobilieId = String(body.immobilie_id || "").trim();\n    await immoMandantSichern(req, [["immobilien", immobilieId],\n                                   ["kontakte", String(body.kontakt_id || "")]]);',
     'Expose-Freigabe: nur zu eigenen Objekten und Kontakten.',
     {'expose-freigabe-erstellen'}),

    # --- Runde 2: die Dokumente. Ein PDF ist die vollstaendige Auskunft ueber
    # einen Vorgang — Vertrag, Rechnung, Bewertung, Expose. Wer eine Kennung
    # raten oder abschreiben kann, haelt es in der Hand.
    ('FORK', 'const immobilie_id = body.immobilie_id;', 'const immobilie_id = body.immobilie_id;\n    await immoMandantSichern(req, [["immobilien", immobilie_id]]);',
     'Expose-PDF: nur zu eigenen Objekten.',
     {'expose-pdf-erzeugen'}),
    ('FORK', '    const mietvertragId = (body.mietvertrag_id || "").toString().trim();', '    const mietvertragId = (body.mietvertrag_id || "").toString().trim();\n    await immoMandantSichern(req, [["mietvertraege", mietvertragId]]);',
     'Mietvertrags-PDF: nur eigene Vertraege.',
     {'mietvertrag-pdf'}),
    ('FORK', '    const vertragId = (body.vertrag_id || "").toString().trim();', '    const vertragId = (body.vertrag_id || "").toString().trim();\n    await immoMandantSichern(req, [["vertraege", vertragId]]);',
     'Vertrags-PDF: nur eigene Vertraege.',
     {'vertrag-pdf'}),
    ('FORK', 'const bewertung_id = body.bewertung_id;', 'const bewertung_id = body.bewertung_id;\n    await immoMandantSichern(req, [["bewertungen", bewertung_id]]);',
     'Bewertungs-PDF: nur eigene Bewertungen.',
     {'mpe-pdf-erzeugen'}),
    ('FORK', '    const immobilieId = String(body.immobilie_id || ""); if (!immobilieId) throw new Error("immobilie_id fehlt.");', '    const immobilieId = String(body.immobilie_id || ""); if (!immobilieId) throw new Error("immobilie_id fehlt.");\n    await immoMandantSichern(req, [["immobilien", immobilieId]]);',
     'Eigentuemer-Bericht: nur zu eigenen Objekten.',
     {'eigentuemer-report-pdf'}),
    ('FORK', '    portal = String(body?.portal || "").trim().toLowerCase();', '    portal = String(body?.portal || "").trim().toLowerCase();\n    await immoMandantSichern(req, [["immobilien", immobilieId]]);',
     'Portalexport: nur eigene Objekte uebertragen.',
     {'portal-export'}),
    ('FORK', '    immobilieId = body?.immobilie_id || null;\n    const aktion: string = body?.aktion === "loeschen" ? "loeschen" : "uebertragen";', '    immobilieId = body?.immobilie_id || null;\n    await immoMandantSichern(req, [["immobilien", immobilieId]]);\n    const aktion: string = body?.aktion === "loeschen" ? "loeschen" : "uebertragen";',
     'Homepage-Export: nur eigene Objekte.',
     {'portal-export-homepage'}),
    ('FORK', '    const vertragId = (body.vertrag_id || "").toString().trim();', '    const vertragId = (body.vertrag_id || "").toString().trim();\n    await immoMandantSichern(req, [["vertraege", vertragId], ["objektnachweise", vertragId]]);',
     'Signaturvorgang: nur zu eigenen Dokumenten.',
     {'signatur-vorgang-starten'}),
    ('FORK', '    const vorgangId = body.vorgang_id;', '    const vorgangId = body.vorgang_id;\n    await immoMandantSichern(req, [["signatur_vorgaenge", vorgangId]]);',
     'Signatur widerrufen: nur eigene Vorgaenge.',
     {'signatur-vorgang-widerrufen'}),

    # =====================================================================
    # FORK — expose-pruefen las jede Datei jedes Mandanten
    #
    # Die Funktion nimmt pdf_base64 ODER ein Paar aus Eimer und Pfad
    # entgegen und laedt damit mit dem service_role aus dem Dateispeicher.
    # Beides kommt aus dem Anfragekoerper. Das ist nicht "eine Kennung
    # geglaubt", das ist ein Lesezugriff auf jede Datei jedes Mandanten —
    # nicht nur Exposes, sondern jeder Eimer und jeder Pfad, den ein
    # Angemeldeter benennen kann.
    #
    # Gemessen wird am ersten Pfadsegment: seit fork_09 ist das die
    # Mandantenkennung.
    # =====================================================================
    ('FORK', 'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";', 'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";\n\n// Wessen Mandant ist der Aufrufer? Hier kommt keine Kennung aus dem\n// Anfragekoerper, sondern ein PFAD — und der wird mit dem service_role\n// gelesen, fuer den RLS nicht gilt. Das erste Pfadsegment ist seit fork_09\n// die Mandantenkennung; daran wird gemessen.\nasync function immoMandantDesAufrufers(req: Request): Promise<string | null> {\n  const kopf = req.headers.get("Authorization") || "";\n  if (!/^Bearer\\s+/i.test(kopf)) return null;\n  const nutzer = createClient(\n    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,\n    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });\n  const { data: u } = await nutzer.auth.getUser(kopf.replace(/^Bearer\\s+/i, ""));\n  if (!u?.user) return null;\n  const { data: prof } = await nutzer.from("profiles").select("mandant_id").eq("id", u.user.id).maybeSingle();\n  return prof?.mandant_id ? String(prof.mandant_id) : null;\n}',
     'Waechter fuer Pfade aus dem Anfragekoerper eingezogen.',
     {'expose-pruefen'}),
    ('FORK', '    if (!pdfBase64 && body.bucket && body.pfad) {\n      const { data, error } = await admin.storage.from(body.bucket).download(body.pfad);', '    if (!pdfBase64 && body.bucket && body.pfad) {\n      // Eimer UND Pfad kommen aus dem Anfragekoerper, gelesen wird mit dem\n      // service_role. Ohne Grenze waere das ein Lesezugriff auf jede Datei\n      // jedes Mandanten — nicht nur Exposes: jeder Eimer, jeder Pfad.\n      const eigenerMandant = await immoMandantDesAufrufers(req);\n      if (!eigenerMandant || !String(body.pfad).startsWith(eigenerMandant + "/")) {\n        return new Response(JSON.stringify({ error: "Kein Zugriff auf diese Datei." }),\n          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });\n      }\n      const { data, error } = await admin.storage.from(body.bucket).download(body.pfad);',
     'Expose-Pruefung: nur Dateien des eigenen Mandanten.',
     {'expose-pruefen'}),

    # --- Runde 3: der Rest der geraden Faelle. Eine Kennung, eine Tabelle,
    # eine Zeile davor. Was bleibt, sind fuenf Funktionen, die ueber ein
    # Zeitfenster ODER eine Kennung arbeiten — die brauchen keinen Waechter,
    # sondern einen Lauf je Mandant, wie der Objekt-Newsletter.
    ('FORK', '      if (!body.lead_id) throw new Error("lead_id fehlt.");', '      if (!body.lead_id) throw new Error("lead_id fehlt.");\n      await immoMandantSichern(req, [["akq_leads", String(body.lead_id)]]);',
     'Akquise-Automation: nur eigene Leads planen.',
     {'akq-automation-lauf'}),
    ('FORK', '    if (!body.lead_id) return antwort({ ok: false, fehler: "lead_id fehlt." }, 400);', '    if (!body.lead_id) return antwort({ ok: false, fehler: "lead_id fehlt." }, 400);\n    await immoMandantSichern(req, [["akq_leads", String(body.lead_id)]]);',
     'Wertindikation: nur zu eigenen Leads.',
     {'akq-wertindikation-pdf'}),
    ('FORK', '    if (body.mail_id) {', '    if (body.mail_id) {\n      await immoMandantSichern(req, [["mail_eingang", String(body.mail_id)]]);',
     'Akquise aus Mail: nur eigene Mails.',
     {'akq-mail-leads'}),
    ('FORK', '    const immobilieId = String(body.immobilie_id || "").trim();', '    const immobilieId = String(body.immobilie_id || "").trim();\n    await immoMandantSichern(req, [["immobilien", immobilieId]]);',
     'Bilder beschriften: nur eigene Objekte.',
     {'bild-beschriften'}),
    ('FORK', '    if (body.datei_id) {', '    await immoMandantSichern(req, [["immobilie_datei", String(body.datei_id || "")],\n                                   ["immobilien", String(body.immobilie_id || "")]]);\n    if (body.datei_id) {',
     'Web-Variante: nur eigene Dateien und Objekte.',
     {'bild-web-variante'}),
    ('FORK', '    const dokumentId  = body.dokument_id;', '    const dokumentId  = body.dokument_id;\n    await immoMandantSichern(req, [["eigentuemer_dokumente", String(dokumentId || "")]]);',
     'OneDrive-Ablage: nur eigene Dokumente.',
     {'eigentuemer-dokument-onedrive-push'}),
    ('FORK', '    if (body.dokument_id) {', '    await immoMandantSichern(req, [["eigentuemer_dokumente", String(body.dokument_id || "")],\n                                   ["eigentuemer", String(body.eigentuemer_id || "")]]);\n    if (body.dokument_id) {',
     'Dokument uebernehmen: nur eigene.',
     {'eigentuemer-dokument-uebernehmen'}),
    ('FORK', '    const ansprechpartnerId = body.ansprechpartner_id || aktuellerUserId;', '    const ansprechpartnerId = body.ansprechpartner_id || aktuellerUserId;\n    await immoMandantSichern(req, [["vertraege", String(maklervertragId || "")],\n                                   ["profiles", String(ansprechpartnerId || "")]]);',
     'Eigentuemer einladen: nur eigener Vertrag, nur eigener Ansprechpartner.',
     {'eigentuemer-einladen'}),
    ('FORK', '    const id = String(body.mail_eingang_id || "").replace(/^versendet:/, "");', '    const id = String(body.mail_eingang_id || "").replace(/^versendet:/, "");\n    await immoMandantSichern(req, [["mail_eingang", id]]);',
     'Anfrage verarbeiten: nur eigene Mails.',
     {'mail-anfrage-verarbeiten'}),
    ('FORK', '    const { mail_eingang_id } = body;', '    const { mail_eingang_id } = body;\n    await immoMandantSichern(req, [["mail_eingang", String(mail_eingang_id || "")],\n                                   ["immobilien", String(body.immobilie_id || "")]]);',
     'KI-Vorschlag zur Mail: nur eigene Mails und Objekte.',
     {'mail-ki-vorschlag'}),
    ('FORK', '    const { data: pf } = await admin.from("mail_postfaecher").select("*").eq("id", body.postfach_id).maybeSingle();', '    await immoMandantSichern(req, [["mail_postfaecher", String(body.postfach_id || "")]]);\n    const { data: pf } = await admin.from("mail_postfaecher").select("*").eq("id", body.postfach_id).maybeSingle();',
     'Postfach nachtragen: nur eigene Postfaecher.',
     {'mail-postfach-backfill'}),
    ('FORK', '    const id = String(body.mail_eingang_id || ""); if (!id) throw new Error("mail_eingang_id fehlt.");', '    const id = String(body.mail_eingang_id || ""); if (!id) throw new Error("mail_eingang_id fehlt.");\n    await immoMandantSichern(req, [["mail_eingang", id]]);',
     'Rechnung weiterleiten: nur eigene Mails.',
     {'mail-rechnung-weiterleiten'}),
    ('FORK', '    const roheId = String(body.mail_id || "").trim();', '    const roheId = String(body.mail_id || "").trim();\n    await immoMandantSichern(req, [["mail_eingang", roheId],\n                                   ["profiles", String(body.zustaendig_id || "")]]);',
     'Mail zu Aufgabe: nur eigene Mails, nur eigene Kollegen.',
     {'mail-zu-todo'}),
    ('FORK', '    const firmaId = body.firma_id || null;', '    const firmaId = body.firma_id || null;\n    await immoMandantSichern(req, [["firma_stammdaten", String(firmaId || "")]]);',
     'Mitarbeiter anlegen: nur am eigenen Standort.',
     {'mitarbeiter-anlegen'}),
    ('FORK', '    const kampagneId = String(body.kampagne_id || "");', '    const kampagneId = String(body.kampagne_id || "");\n    await immoMandantSichern(req, [["newsletter_kampagnen", kampagneId]]);',
     'Newsletter senden: nur eigene Kampagnen.',
     {'newsletter-senden'}),
    ('FORK', '    const zugangId = (body.zugang_id || "").toString().trim();', '    const zugangId = (body.zugang_id || "").toString().trim();\n    await immoMandantSichern(req, [["projekt_zugaenge", zugangId]]);',
     'Antwort im Kundenbereich: nur eigene Zugaenge.',
     {'projekt-nachricht-antwort'}),
    ('FORK', '    const speichern = body.speichern !== false && !!body.termin_id;', '    await immoMandantSichern(req, [["termine", String(body.termin_id || "")],\n                                   ["immobilien", String(body.immobilie_id || "")]]);\n    const speichern = body.speichern !== false && !!body.termin_id;',
     'Fahrzeit zum Termin: nur eigene Termine und Objekte.',
     {'termin-fahrzeit'}),

    # --- Runde 4: die vier Funktionen anderer Bauart.
    #
    # Sie arbeiten ueber ein ZEITFENSTER (alle Termine der naechsten Tage,
    # ueber alle Mandanten) oder ueber eine Kennung, die gar keine Zeile
    # benennt: termin-serie gruppiert ueber termine.serie_id, und dazu gibt
    # es keine Tabelle. Ein Waechter, der eine Kennung prueft, greift dort
    # ins Leere — hier muss jede Abfrage selbst begrenzt werden.
    #
    # termin-serie ist der einzige Fall in beiden Bloecken, in dem LOESCHEN
    # moeglich war: die Serie eines fremden Maklers, Termin fuer Termin.
    ('FORK', '    let q = db.from("termine").select("id, titel, art, datum, uhrzeit, ende, ganztags, ort, privat, ersteller_id, ersteller_name, teilnehmer, kontakt_id, immobilie_id, status, created_at, erinnerung, erinnerung_status")', '    await immoMandantSichern(req, [["termine", String(body.termin_id || "")]]);\n    let q = db.from("termine").select("id, titel, art, datum, uhrzeit, ende, ganztags, ort, privat, ersteller_id, ersteller_name, teilnehmer, kontakt_id, immobilie_id, status, created_at, erinnerung, erinnerung_status, mandant_id")',
     'Terminerinnerung: der Termin bringt seinen Mandanten mit.',
     {'termin-erinnerung'}),
    ('FORK', '            const { data } = await db.from("profiles").select("id").in("role", ["chef", "mitarbeiter"]).ilike("name", String(n).trim()).limit(1);', '            // Der Teilnehmer wird ueber seinen NAMEN gesucht. Zwei Makler\n            // koennen einen Mitarbeiter gleichen Namens haben — ohne\n            // Mandanten ginge die Erinnerung ueber ein fremdes Postfach.\n            const { data } = await db.from("profiles").select("id").eq("mandant_id", t.mandant_id).in("role", ["chef", "mitarbeiter"]).ilike("name", String(n).trim()).limit(1);',
     'Terminerinnerung: der Teilnehmer wird im eigenen Mandanten gesucht.',
     {'termin-erinnerung'}),
    ('FORK', '        if (benutzerId) { const { data } = await db.from("mail_postfaecher").select("*").eq("benutzer_id", benutzerId).eq("aktiv", true).order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1); postfach = data && data[0] || null; }', '        if (benutzerId) { const { data } = await db.from("mail_postfaecher").select("*").eq("mandant_id", t.mandant_id).eq("benutzer_id", benutzerId).eq("aktiv", true).order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1); postfach = data && data[0] || null; }',
     'Terminerinnerung: das Postfach aus dem eigenen Mandanten.',
     {'termin-erinnerung'}),
    ('FORK', '          const { data: chefs } = await db.from("profiles").select("id").eq("role", "chef").limit(5);\n          const chefIds = (chefs || []).map((c: any) => c.id);\n          if (chefIds.length) { const { data } = await db.from("mail_postfaecher").select("*").in("benutzer_id", chefIds).eq("aktiv", true)', '          const { data: chefs } = await db.from("profiles").select("id").eq("mandant_id", t.mandant_id).eq("role", "chef").limit(5);\n          const chefIds = (chefs || []).map((c: any) => c.id);\n          if (chefIds.length) { const { data } = await db.from("mail_postfaecher").select("*").eq("mandant_id", t.mandant_id).in("benutzer_id", chefIds).eq("aktiv", true)',
     'Terminerinnerung: der Rueckfall auf den Chef bleibt im eigenen Mandanten.',
     {'termin-erinnerung'}),
    ('FORK', '    let q = db.from("termine")\n      .select("id, titel, art, datum, uhrzeit, ende, ersteller_id, ersteller_name, teilnehmer, kontakt_id, immobilie_id, status, nachfassen, nachfass_status, quelle")', '    await immoMandantSichern(req, [["termine", String(body.termin_id || "")]]);\n    let q = db.from("termine")\n      .select("id, titel, art, datum, uhrzeit, ende, ersteller_id, ersteller_name, teilnehmer, kontakt_id, immobilie_id, status, nachfassen, nachfass_status, quelle, mandant_id")',
     'Besichtigung nachfassen: der Termin bringt seinen Mandanten mit.',
     {'besichtigung-nachfassen'}),
    ('FORK', '        const { data: vonKunde } = await db.from("mail_eingang").select("id, betreff, gesendet_am").ilike("absender_email", mail)', '        // Gesucht wird ueber die E-Mail-Adresse — die gibt es bei mehreren\n        // Maklern. Ohne Mandanten haette der Posteingang des einen\n        // entschieden, ob der andere nachfasst, und der Betreff der fremden\n        // Mail stuende im Protokoll der Antwort.\n        const { data: vonKunde } = await db.from("mail_eingang").select("id, betreff, gesendet_am").eq("mandant_id", t.mandant_id).ilike("absender_email", mail)',
     'Besichtigung nachfassen: der Posteingang des eigenen Mandanten.',
     {'besichtigung-nachfassen'}),
    ('FORK', '          db.from("mail_versendet").select("id, betreff, gesendet_am").eq("status", "gesendet").ilike("empfaenger_email", `%${mail}%`).gt("gesendet_am", besichtigungIso).limit(1),\n          db.from("mail_eingang").select("id, betreff, gesendet_am").eq("ordner", "gesendet").ilike("empfaenger_email", `%${mail}%`).gt("gesendet_am", besichtigungIso).limit(1)]);', '          db.from("mail_versendet").select("id, betreff, gesendet_am").eq("mandant_id", t.mandant_id).eq("status", "gesendet").ilike("empfaenger_email", `%${mail}%`).gt("gesendet_am", besichtigungIso).limit(1),\n          db.from("mail_eingang").select("id, betreff, gesendet_am").eq("mandant_id", t.mandant_id).eq("ordner", "gesendet").ilike("empfaenger_email", `%${mail}%`).gt("gesendet_am", besichtigungIso).limit(1)]);',
     'Besichtigung nachfassen: auch der Gesendet-Ordner je Mandant.',
     {'besichtigung-nachfassen'}),
    ('FORK', '      const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();\n      if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);\n    }', '      const { data: p } = await db.from("profiles").select("role, mandant_id").eq("id", u.user.id).maybeSingle();\n      if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);\n      aufruferMandant = p.mandant_id || null;\n      if (!aufruferMandant) return antwort({ ok: false, fehler: "Konto ohne Mandanten." }, 403);\n    }',
     'Terminserie: der Mandant des Aufrufers.',
     {'termin-serie'}),
    ('FORK', '    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "");\n    let nutzerId: string | null = null;', '    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "");\n    let nutzerId: string | null = null;\n    // serie_id ist KEINE Kennung einer Zeile, sondern eine Gruppierung ueber\n    // termine.serie_id. mandant_sichern() greift dort ins Leere — hier muss\n    // jede Abfrage selbst begrenzt werden. Ohne diese Grenze liess sich die\n    // Serie eines fremden Maklers aendern und LOESCHEN.\n    let aufruferMandant: string | null = null;\n    const nurEigene = (q: any) => aufruferMandant ? q.eq("mandant_id", aufruferMandant) : q;',
     'Terminserie: Platz fuer den Mandanten und die Begrenzung.',
     {'termin-serie'}),
    ('FORK', '      let q = db.from("termine").select("id, datum, onoffice_id, immobilie_id, ort, ganztags, uhrzeit")\n        .eq("serie_id", serieId).neq("status", "storniert").order("datum");', '      let q = nurEigene(db.from("termine").select("id, datum, onoffice_id, immobilie_id, ort, ganztags, uhrzeit"))\n        .eq("serie_id", serieId).neq("status", "storniert").order("datum");',
     'Terminserie: uebertragen nur aus der eigenen Serie.',
     {'termin-serie'}),
    ('FORK', '      const { data: betroffen, error } = await db.from("termine").update(patch)\n        .eq("serie_id", serieId)', '      const { data: betroffen, error } = await nurEigene(db.from("termine").update(patch))\n        .eq("serie_id", serieId)',
     'Terminserie: aendern nur an der eigenen Serie.',
     {'termin-serie'}),
    ('FORK', '      let q = db.from("termine").select("id, onoffice_id, datum").eq("serie_id", serieId).order("datum");', '      let q = nurEigene(db.from("termine").select("id, onoffice_id, datum")).eq("serie_id", serieId).order("datum");',
     'Terminserie: loeschen nur aus der eigenen Serie.',
     {'termin-serie'}),
    ('FORK', '    const gezielt: string | null = body.eigentuemer_id || null;', '    const gezielt: string | null = body.eigentuemer_id || null;\n    await immoMandantSichern(req, [["eigentuemer", String(gezielt || "")]]);',
     'Einladung nachfassen: nur zu eigenen Eigentuemern.',
     {'eigentuemer-einladung-nachfassen'}),
    ('FORK', '    const { data: firmaRow } = await admin.from("firma_stammdaten").select("firma_name, email, web").eq("aktiv", true).order("sortierung").limit(1).maybeSingle();\n    const firma = firmaRow?.firma_name || "Musterhaus Immobilien GmbH";\n    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || firmaRow?.email || "info@immooffice.example";', '    // Der Briefkopf gehoert dem Mandanten der Einladung, nicht der ersten\n    // Firma in der Tabelle. Er wird deshalb je Mandant geholt und gemerkt.\n    const firmenCache = new Map<string, any>();\n    const firmaFuer = async (mandant: string | null) => {\n      if (!mandant) return null;\n      if (!firmenCache.has(mandant)) {\n        const { data } = await admin.from("firma_stammdaten").select("firma_name, email, web")\n          .eq("mandant_id", mandant).eq("aktiv", true).order("sortierung").limit(1).maybeSingle();\n        firmenCache.set(mandant, data || null);\n      }\n      return firmenCache.get(mandant) || null;\n    };',
     'Einladung nachfassen: der Briefkopf je Mandant statt der ersten Firma.',
     {'eigentuemer-einladung-nachfassen'}),
    ('FORK', '      const info: any = { eigentuemer_id: einl.eigentuemer_id, email: einl.email };\n      try {', '      const info: any = { eigentuemer_id: einl.eigentuemer_id, email: einl.email };\n      const firmaRow = await firmaFuer(einl.mandant_id || null);\n      const firma = firmaRow?.firma_name || "Musterhaus Immobilien GmbH";\n      const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || firmaRow?.email || "info@immooffice.example";\n      try {',
     'Einladung nachfassen: Briefkopf und Absender je Eintrag.',
     {'eigentuemer-einladung-nachfassen'}),
    ('FORK', '        const { data: eo } = await admin.from("eigentuemer_objekte").select("ansprechpartner_id").eq("eigentuemer_id", eig.id)', '        const { data: eo } = await admin.from("eigentuemer_objekte").select("ansprechpartner_id").eq("mandant_id", einl.mandant_id).eq("eigentuemer_id", eig.id)',
     'Einladung nachfassen: der Ansprechpartner aus dem eigenen Mandanten.',
     {'eigentuemer-einladung-nachfassen'}),

    # --- Runde 5: die Faelle, die das erste Kriterium nicht gesehen hat.
    #
    # Kein body.irgendwas_id im Quelltext — aber dieselbe Luecke: ein Pfad
    # aus dem Anfragekoerper, eine destrukturierte Kennung, oder gar keine
    # Kennung und dafuer "das erste aktive Postfach" der ganzen Plattform.
    ('FORK', '    const { immobilie_id, quelle_typ, quelle_name, quelle_ref, datei_base64, content_type, text } = body || {};', '    const { immobilie_id, quelle_typ, quelle_name, quelle_ref, datei_base64, content_type, text } = body || {};\n    await immoMandantSichern(req, [["immobilien", String(immobilie_id || "")]]);',
     'Objektwissen: nur zu eigenen Objekten.',
     {'objekt-wissen-auslesen'}),
    ('FORK', '    const { mail_eingang_id } = body;', '    const { mail_eingang_id } = body;\n    await immoMandantSichern(req, [["mail_eingang", String(mail_eingang_id || "")]]);',
     'Mail zu Mietanfrage: nur eigene Mails.',
     {'mail-zu-mietanfrage'}),
    ('FORK', '      const { data: vorhanden } = await admin.from("mail_postfaecher").select("benutzer_id").eq("id", id).maybeSingle();', '      // Die Rolle "chef" hebt gleich darunter die Eigentuemerpruefung auf.\n      // Ohne Mandantengrenze davor haette ein Chef die Postfaecher fremder\n      // Haeuser aendern koennen — samt SMTP-Server, Benutzer und Passwort.\n      await immoMandantSichern(req, [["mail_postfaecher", String(id || "")]]);\n      const { data: vorhanden } = await admin.from("mail_postfaecher").select("benutzer_id").eq("id", id).maybeSingle();',
     'Postfach speichern: die Mandantengrenze vor der Rolle.',
     {'mail-postfach-speichern'}),
    ('FORK', '    const { data: profil } = await userClient\n      .from("profiles").select("role, name").eq("id", userData.user.id).maybeSingle();', '    const { data: profil } = await userClient\n      .from("profiles").select("role, name, mandant_id").eq("id", userData.user.id).maybeSingle();',
     'Zugangsdaten schreiben: der Mandant des Aufrufers.',
     {'credentials-speichern'}),
    ('FORK', '    const { data: existing } = await admin\n      .from("external_credentials").select("id").eq("service", service).maybeSingle();', '    // Seit fork_17 ist der Dienstname nur noch JE MANDANT eindeutig. Ohne\n    // Grenze traf maybeSingle() ab dem zweiten Mandanten mehrere Zeilen —\n    // und davor die falsche: der eine Makler haette die Zugangsdaten des\n    // anderen ueberschrieben.\n    const { data: existing } = await admin\n      .from("external_credentials").select("id").eq("mandant_id", profil.mandant_id).eq("service", service).maybeSingle();',
     'Zugangsdaten schreiben: nur die eigenen ueberschreiben.',
     {'credentials-speichern'}),
    ('FORK', '    const { data: pfs } = await db.from("mail_postfaecher").select("*").eq("aktiv", true)\n      .order("ist_standard", { ascending: false }).limit(1);', '    // Nahm das erste aktive Postfach der ganzen Plattform und verschickte\n    // damit an eine Adresse aus dem Anfragekoerper — ein Versandweg ueber\n    // das Postfach eines fremden Maklers, mit dessen Absenderadresse.\n    const eigenerMandant = await immoMandantDesAufrufers(req);\n    if (!eigenerMandant) {\n      return new Response(JSON.stringify({ ok: false, fehler: "Nicht angemeldet." }),\n        { status: 401, headers: { "Content-Type": "application/json" } });\n    }\n    const { data: pfs } = await db.from("mail_postfaecher").select("*").eq("mandant_id", eigenerMandant).eq("aktiv", true)\n      .order("ist_standard", { ascending: false }).limit(1);',
     'Postfachtest: nur das eigene Postfach.',
     {'ea-mailtest'}),
    ('FORK', '    const { data: blob, error: dlErr } = await admin.storage\n      .from("immobilie-dateien")', '    // storage_path kommt aus dem Anfragekoerper und wird mit dem\n    // service_role gelesen. Das erste Pfadsegment ist seit fork_09 die\n    // Mandantenkennung.\n    const eigenerMandant = await immoMandantDesAufrufers(req);\n    if (!eigenerMandant || !String(storage_path).startsWith(eigenerMandant + "/")) {\n      return jsonErr(403, "Kein Zugriff auf diese Datei.");\n    }\n    const { data: blob, error: dlErr } = await admin.storage\n      .from("immobilie-dateien")',
     'Energieausweis auslesen: nur eigene Dateien.',
     {'energieausweis-auslesen'}),
    ('FORK', '          const { data: pf } = await admin\n            .from("mail_postfaecher")\n            .select("*")\n            .eq("benutzer_id", ben.ansprechpartner_id)', '          const { data: pf } = await admin\n            .from("mail_postfaecher")\n            .select("*")\n            .eq("mandant_id", ben.mandant_id)\n            .eq("benutzer_id", ben.ansprechpartner_id)',
     'Upload-Meldung planen: das Postfach aus dem eigenen Mandanten.',
     {'upload_benachrichtigung_planen'}),

    # --- Runde 6: Dokumente mit destrukturierter Kennung, Rundrufe an "alle
    # Chefs" und zwei Rueckfallketten, die mit "irgendein Postfach" enden.
    ('FORK', '    const { brief_id } = await req.json();', '    const { brief_id } = await req.json();\n    await immoMandantSichern(req, [["briefe", String(brief_id || "")]]);',
     'Brief-PDF: nur eigene Briefe.',
     {'brief-pdf-erzeugen'}),
    ('FORK', '    const { reservierung_id } = body;', '    const { reservierung_id } = body;\n    await immoMandantSichern(req, [["reservierungen_neubau", String(reservierung_id || "")]]);',
     'Reservierungs-PDF: nur eigene Reservierungen.',
     {'reservierung-pdf-erzeugen'}),
    ('FORK', '    const { reservierung_id } = await req.json();', '    const { reservierung_id } = await req.json();\n    await immoMandantSichern(req, [["reservierungen_neubau", String(reservierung_id || "")]]);',
     'Reservierung als Word: nur eigene Reservierungen.',
     {'reservierung-word-erzeugen'}),
    ('FORK', '    const { eigentuemer_id, person_id, redirect_to } = await req.json();', '    const { eigentuemer_id, person_id, redirect_to } = await req.json();\n    await immoMandantSichern(req, [["eigentuemer", String(eigentuemer_id || "")],\n                                   ["eigentuemer_personen", String(person_id || "")]]);',
     'Anmeldelink erneut: nur zu eigenen Eigentuemern und Personen.',
     {'eigentuemer-link-erneut-senden'}),
    ('FORK', '    const { eigentuemer_id, chef_passwort, confirm_email } = await req.json();', '    const { eigentuemer_id, chef_passwort, confirm_email } = await req.json();\n    // Loeschen mit dem service_role: ohne diese Zeile haette ein Chef den\n    // Eigentuemer eines fremden Maklers entfernen koennen, samt Konto und\n    // Dateien.\n    await immoMandantSichern(req, [["eigentuemer", String(eigentuemer_id || "")]]);',
     'Eigentuemer loeschen: nur die eigenen.',
     {'eigentuemer-loeschen'}),
    ('FORK', '    const dl = await db.storage.from(quelleBucket).download(quellePfad);', '    // Eimer und Pfad kommen aus dem Anfragekoerper. Die Storage-Huelle\n    // faellt beim Lesen absichtlich auf das Wurzelverzeichnis zurueck (dort\n    // liegen die Schriften der Plattform) — genau dieser Rueckfall wuerde\n    // hier einen fremden Mandantenpfad durchlassen. Deshalb ausdruecklich:\n    // die Quelle muss im eigenen Ordner liegen.\n    const eigenerMandant = (await db.from("profiles").select("mandant_id")\n      .eq("id", u.user.id).maybeSingle()).data?.mandant_id;\n    if (!eigenerMandant || !quellePfad.startsWith(String(eigenerMandant) + "/")) {\n      return new Response(JSON.stringify({ ok: false, fehler: "Kein Zugriff auf diese Datei" }),\n        { status: 403, headers: { "Content-Type": "application/json" } });\n    }\n    const dl = await db.storage.from(quelleBucket).download(quellePfad);',
     'Web-Dateien kopieren: die Quelle muss im eigenen Ordner liegen.',
     {'web-asset-kopieren'}),
    ('FORK', '    const { data: eigDaten } = await supabase.from("eigentuemer").select("vorname, nachname, firma").eq("id", eigentuemerId).maybeSingle();', '    const { data: eigDaten } = await supabase.from("eigentuemer").select("vorname, nachname, firma, mandant_id").eq("id", eigentuemerId).maybeSingle();',
     'Nachricht an den Makler: der Eigentuemer bringt seinen Mandanten mit.',
     {'makler-nachricht-senden'}),
    ('FORK', '    const { data: chefs } = await supabase.from("profiles").select("id, name, email").eq("role", "chef");', '    // Der Rundruf an "alle Chefs" traf die ganze Plattform: die Nachricht\n    // eines Eigentuemers an SEINEN Makler landete in jedem Buero.\n    const { data: chefs } = await supabase.from("profiles").select("id, name, email").eq("mandant_id", eigDaten?.mandant_id ?? "00000000-0000-0000-0000-000000000000").eq("role", "chef");',
     'Nachricht an den Makler: nur die Chefs des eigenen Hauses.',
     {'makler-nachricht-senden'}),
    ('FORK', '    const { data: eigDaten } = await supabase\n      .from("eigentuemer").select("vorname, nachname, firma").eq("id", eigentuemerId).maybeSingle();', '    const { data: eigDaten } = await supabase\n      .from("eigentuemer").select("vorname, nachname, firma, mandant_id").eq("id", eigentuemerId).maybeSingle();',
     'Expose-Rueckmeldung: der Eigentuemer bringt seinen Mandanten mit.',
     {'expose-rueckmeldung-melden'}),
    ('FORK', '    const { data: chefs } = await supabase.from("profiles").select("name, email").eq("role", "chef");', '    const { data: chefs } = await supabase.from("profiles").select("name, email").eq("mandant_id", eigDaten?.mandant_id ?? "00000000-0000-0000-0000-000000000000").eq("role", "chef");',
     'Expose-Rueckmeldung: nur die Chefs des eigenen Hauses.',
     {'expose-rueckmeldung-melden'}),
    ('FORK', '        const { data: im } = await db.from("immobilien").select("immo_nr, objekttitel, bezeichnung, plz, ort, zustaendig_id").eq("id", f.immobilie_id).maybeSingle();\n        const { data: firma } = await db.from("firma_stammdaten").select("firma_name, email, strasse, plz, ort").eq("slug", f.firma_slug || "standard").maybeSingle();', '        const { data: im } = await db.from("immobilien").select("immo_nr, objekttitel, bezeichnung, plz, ort, zustaendig_id, mandant_id").eq("id", f.immobilie_id).maybeSingle();\n        // Wie in expose-freigabe: der Slug "standard" ist seit fork_17 nur\n        // noch je Mandant eindeutig. Ohne Grenze stuende ein fremder\n        // Firmenname unter der Erinnerung.\n        const { data: firma } = await db.from("firma_stammdaten").select("firma_name, email, strasse, plz, ort").eq("mandant_id", im?.mandant_id ?? "00000000-0000-0000-0000-000000000000").eq("slug", f.firma_slug || "standard").maybeSingle();',
     'Expose-Erinnerung: der Briefkopf vom Mandanten des Objekts.',
     {'expose-erinnerung'}),
    ('FORK', '    const { data: projekte } = await admin.from("projekte").select("id, name, oeffentliche_url").in("id", projektIds);', '    const { data: projekte } = await admin.from("projekte").select("id, name, oeffentliche_url, mandant_id").in("id", projektIds);',
     'Neubau-Dateimeldung: das Projekt bringt seinen Mandanten mit.',
     {'projekt-datei-benachrichtigung'}),
    ('FORK', '    const { data: postfaecher } = await admin.from("mail_postfaecher")\n      .select("*").eq("aktiv", true)\n      .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false });\n\n    const postfachFuerEmpfaenger = (ansprechpartnerId: string | null, uploaderId: string | null) =>\n      (postfaecher || []).find((p: any) => ansprechpartnerId && p.benutzer_id === ansprechpartnerId && p.standard_zum_senden)\n      || (postfaecher || []).find((p: any) => ansprechpartnerId && p.benutzer_id === ansprechpartnerId)\n      || (postfaecher || []).find((p: any) => (p.email_adresse || "").toLowerCase() === STANDARD_MAIL)\n      || (postfaecher || []).find((p: any) => uploaderId && p.benutzer_id === uploaderId && p.standard_zum_senden)\n      || (postfaecher || []).find((p: any) => uploaderId && p.benutzer_id === uploaderId)\n      || (postfaecher || [])[0] || null;', '    const { data: postfaecher } = await admin.from("mail_postfaecher")\n      .select("*").eq("aktiv", true)\n      .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false });\n\n    // Die Rueckfallkette endete mit "irgendein Postfach". Ueber mehrere\n    // Mandanten hinweg heisst das: die Meldung des einen Bautraegers geht\n    // ueber den SMTP-Zugang des anderen hinaus. Gewaehlt wird deshalb nur\n    // aus den Postfaechern des Mandanten, dem das Projekt gehoert — und\n    // ohne Mandanten gar keines.\n    const postfachFuerEmpfaenger = (ansprechpartnerId: string | null, uploaderId: string | null, mandant: string | null) => {\n      if (!mandant) return null;\n      const eigene = (postfaecher || []).filter((p: any) => p.mandant_id === mandant);\n      return eigene.find((p: any) => ansprechpartnerId && p.benutzer_id === ansprechpartnerId && p.standard_zum_senden)\n        || eigene.find((p: any) => ansprechpartnerId && p.benutzer_id === ansprechpartnerId)\n        || eigene.find((p: any) => (p.email_adresse || "").toLowerCase() === STANDARD_MAIL)\n        || eigene.find((p: any) => uploaderId && p.benutzer_id === uploaderId && p.standard_zum_senden)\n        || eigene.find((p: any) => uploaderId && p.benutzer_id === uploaderId)\n        || eigene[0] || null;\n    };',
     'Neubau-Dateimeldung: das Postfach nur aus dem Mandanten des Projekts.',
     {'projekt-datei-benachrichtigung'}),
    ('FORK', '      const postfach = postfachFuerEmpfaenger(zugang.ansprechpartner_id || null, uploader);', '      const postfach = postfachFuerEmpfaenger(zugang.ansprechpartner_id || null, uploader, projekt?.mandant_id ?? null);',
     'Neubau-Dateimeldung: die Aufrufstelle reicht den Mandanten durch.',
     {'projekt-datei-benachrichtigung'}),

    # --- Runde 7: der Rest. Zweimal hebt die Rolle "chef" eine
    # Eigentuemerpruefung auf, ohne dass ein Mandant dabei waere — bei
    # mail-senden heisst das: Post ueber das Postfach eines fremden Maklers.
    # Und urlaub-hinweise wertete die Profile und Urlaubstermine der ganzen
    # Plattform aus und gab die Namen samt Resttagen zurueck.
    ('FORK', '    const { data: postfach, error: pfErr } = await admin\n      .from("mail_postfaecher").select("*").eq("id", postfach_id).maybeSingle();', '    // Gleich darunter hebt die Rolle "chef" die Eigentuemerpruefung auf.\n    // Ohne Mandantengrenze davor haette ein Chef Post ueber das Postfach\n    // eines fremden Maklers verschickt — mit dessen Absenderadresse.\n    await immoMandantSichern(req, [["mail_postfaecher", String(postfach_id || "")]]);\n    const { data: postfach, error: pfErr } = await admin\n      .from("mail_postfaecher").select("*").eq("id", postfach_id).maybeSingle();',
     'Mailversand: die Mandantengrenze vor der Rolle.',
     {'mail-senden'}),
    ('FORK', '    let query = admin.from("mail_postfaecher").select("*").eq("imap_aktiv", true).eq("aktiv", true);', '    // Ohne postfach_id ist das der Cron ueber alle Postfaecher — der darf\n    // das. MIT einer Kennung aus dem Anfragekoerper ist es ein Abruf, und\n    // der gehoert nur dem eigenen Mandanten.\n    await immoMandantSichern(req, [["mail_postfaecher", String(postfachId || "")]]);\n    let query = admin.from("mail_postfaecher").select("*").eq("imap_aktiv", true).eq("aktiv", true);',
     'IMAP-Abruf: ein benanntes Postfach nur aus dem eigenen Mandanten.',
     {'mail-postfach-pull'}),
    ('FORK', '          const { data: k } = await admin.from("kontakte").select("id").ilike("email", abs).limit(1);', '          const { data: k } = await admin.from("kontakte").select("id").eq("mandant_id", pf.mandant_id).ilike("email", abs).limit(1);',
     'Abwesenheitsnotiz: der Kontakt aus dem eigenen Mandanten.',
     {'mail-abwesenheit-verarbeiten'}),
    ('FORK', '          if (!mensch) { const { data: v } = await admin.from("mail_versendet").select("id").ilike("empfaenger_email", `%${abs}%`).eq("status", "gesendet").limit(1); mensch = !!(v && v.length); }', '          if (!mensch) { const { data: v } = await admin.from("mail_versendet").select("id").eq("mandant_id", pf.mandant_id).ilike("empfaenger_email", `%${abs}%`).eq("status", "gesendet").limit(1); mensch = !!(v && v.length); }',
     'Abwesenheitsnotiz: auch der Gesendet-Nachweis je Mandant.',
     {'mail-abwesenheit-verarbeiten'}),
    ('FORK', '    const { data: postfaecher, error: pfErr } = await admin.from("mail_postfaecher").select("id, benutzer_id, absender_name, email_adresse, signatur, abwesend_aktiv, abwesend_von, abwesend_bis, abwesend_betreff, abwesend_text").eq("aktiv", true).eq("abwesend_aktiv", true);', '    const { data: postfaecher, error: pfErr } = await admin.from("mail_postfaecher").select("id, benutzer_id, absender_name, email_adresse, signatur, abwesend_aktiv, abwesend_von, abwesend_bis, abwesend_betreff, abwesend_text, mandant_id").eq("aktiv", true).eq("abwesend_aktiv", true);',
     'Abwesenheitsnotiz: das Postfach bringt seinen Mandanten mit.',
     {'mail-abwesenheit-verarbeiten'}),
    ('FORK', '    const { data: profile } = await admin\n      .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();', '    const { data: profile } = await admin\n      .from("profiles").select("role, mandant_id").eq("id", userData.user.id).maybeSingle();',
     'Bewerbereinladung: der Mandant des Aufrufers.',
     {'bewerbertest-einladen'}),
    ('FORK', '      .insert({\n        erstellt_von: userData.user.id,\n        vorname, nachname, email, quereinsteiger, notiz, token,\n      })', '      .insert({\n        mandant_id: profile.mandant_id,\n        erstellt_von: userData.user.id,\n        vorname, nachname, email, quereinsteiger, notiz, token,\n      })',
     'Bewerbereinladung traegt den Mandanten des Aufrufers.',
     {'bewerbertest-einladen'}),
    ('FORK', '    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "");\n    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {', '    let aufruferMandant: string | null = null;\n    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "");\n    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {',
     'Urlaubshinweise: Platz fuer den Mandanten des Aufrufers.',
     {'urlaub-hinweise'}),
    ('FORK', '      if (u?.user) { const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle(); if (!p || !["chef", "mitarbeiter"].includes(p.role)) throw new Error("Keine Berechtigung."); }', '      if (u?.user) { const { data: p } = await db.from("profiles").select("role, mandant_id").eq("id", u.user.id).maybeSingle(); if (!p || !["chef", "mitarbeiter"].includes(p.role)) throw new Error("Keine Berechtigung."); aufruferMandant = p.mandant_id || null; if (!aufruferMandant) throw new Error("Konto ohne Mandanten."); }',
     'Urlaubshinweise: der Mandant des Aufrufers.',
     {'urlaub-hinweise'}),
    ('FORK', '    urlaubBundesland = (await db.from("firma_stammdaten").select("bundesland").not("bundesland", "is", null).order("sortierung").limit(1).maybeSingle()).data?.bundesland ?? null;\n    const jahr = Number(body.jahr) || parseInt(heute.slice(0, 4), 10);\n    const frist = modus === "jahresende" ? `${jahr}-12-31` : `${jahr}-03-31`;\n\n    const { data: profile } = await db.from("profiles").select("id, name, email, role, urlaubstage_jahr, urlaub_uebertrag, eintritt, urlaub_staffel").in("role", ["chef", "mitarbeiter"]);\n    const { data: termine } = await db.from("termine").select("id, art, datum, datum_ende, status, quelle, ersteller_id, ersteller_name, teilnehmer, urlaub_status, urlaub_arbeitstage").ilike("art", "%urlaub%").gte("datum", `${jahr - 1}-01-01`).lte("datum", `${jahr}-12-31`);', '    const jahr = Number(body.jahr) || parseInt(heute.slice(0, 4), 10);\n    const frist = modus === "jahresende" ? `${jahr}-12-31` : `${jahr}-03-31`;\n\n    // Ein Lauf je Mandant. Vorher lief die Auswertung ueber ALLE Profile und\n    // ALLE Urlaubstermine der Plattform: die Aufgabe nannte die Mitarbeiter\n    // fremder Buerros mit Namen und Resttagen, und die Antwort gab dem\n    // Aufrufer dieselbe Liste samt E-Mail-Adressen zurueck.\n    let mandanten: string[] = [];\n    if (aufruferMandant) {\n      mandanten = [aufruferMandant];\n    } else {\n      const { data: alle } = await db.from("mandanten").select("id").order("erstellt_am");\n      mandanten = (alle || []).map((m: any) => String(m.id));\n    }\n    const ergebnisse: any[] = [];\n    for (const mandant of mandanten) {\n    urlaubBundesland = (await db.from("firma_stammdaten").select("bundesland").eq("mandant_id", mandant).not("bundesland", "is", null).order("sortierung").limit(1).maybeSingle()).data?.bundesland ?? null;\n\n    const { data: profile } = await db.from("profiles").select("id, name, email, role, urlaubstage_jahr, urlaub_uebertrag, eintritt, urlaub_staffel").eq("mandant_id", mandant).in("role", ["chef", "mitarbeiter"]);\n    const { data: termine } = await db.from("termine").select("id, art, datum, datum_ende, status, quelle, ersteller_id, ersteller_name, teilnehmer, urlaub_status, urlaub_arbeitstage").eq("mandant_id", mandant).ilike("art", "%urlaub%").gte("datum", `${jahr - 1}-01-01`).lte("datum", `${jahr}-12-31`);',
     'Urlaubshinweise: ein Lauf je Mandant.',
     {'urlaub-hinweise'}),
    ('FORK', '      const { data: vorhanden } = await db.from("aufgaben").select("id").eq("typ", "urlaub_hinweis").eq("status", "offen").contains("daten", { modus, jahr }).limit(1);', '      const { data: vorhanden } = await db.from("aufgaben").select("id").eq("mandant_id", mandant).eq("typ", "urlaub_hinweis").eq("status", "offen").contains("daten", { modus, jahr }).limit(1);',
     'Urlaubshinweise: die vorhandene Aufgabe im eigenen Mandanten.',
     {'urlaub-hinweise'}),
    ('FORK', '        const { data: neu, error } = await db.from("aufgaben").insert({ typ: "urlaub_hinweis", status: "offen", titel, beschreibung, zustaendig_id: chef ? chef.id : null, faellig_am: heute, daten: { modus, jahr, frist, liste } }).select("id").single();\n        if (error) throw error; aufgabeId = neu?.id || null;\n      }\n    }\n    return antwort({ ok: true, modus, jahr, frist, betroffene: liste.length, aufgabe_id: aufgabeId, liste });', '        const { data: neu, error } = await db.from("aufgaben").insert({ mandant_id: mandant, typ: "urlaub_hinweis", status: "offen", titel, beschreibung, zustaendig_id: chef ? chef.id : null, faellig_am: heute, daten: { modus, jahr, frist, liste } }).select("id").single();\n        if (error) throw error; aufgabeId = neu?.id || null;\n      }\n    }\n    ergebnisse.push({ mandant, betroffene: liste.length, aufgabe_id: aufgabeId, liste });\n    }\n    const eigenes = ergebnisse[0] || { betroffene: 0, aufgabe_id: null, liste: [] };\n    return antwort({ ok: true, modus, jahr, frist, mandanten: ergebnisse.length,\n                     betroffene: eigenes.betroffene, aufgabe_id: eigenes.aufgabe_id,\n                     liste: aufruferMandant ? eigenes.liste : [] });',
     'Urlaubshinweise: die Aufgabe traegt den Mandanten, die Antwort nur die eigene Liste.',
     {'urlaub-hinweise'}),

    # ======================================================================
    # Phase 2.4, erster Block (30.09.2026): das fremde Postfach
    # ======================================================================
    # Gefunden mit tests/dienstschluessel-mandant.py. Die Edge Functions
    # arbeiten mit dem Dienstschluessel, und fuer den gilt RLS nicht — jede
    # Abfrage sieht die Tabelle ueber alle Mandanten. Wo die Vorlage "das
    # erste aktive Postfach" nahm, war das bei einem Mandanten DAS Postfach.
    # Bei mehreren ist es das eines fremden Maklers: mit dessen Absender,
    # dessen entschluesseltem SMTP-Passwort und dessen Gesendet-Ordner.
    #
    # Nichts davon schlaegt fehl, wenn es passiert. Deshalb war es nicht zu
    # sehen, und deshalb haelt die Pruefung den Stand jetzt fest.
    ('FORK',
     'async function postfachFuer(db: any, userId: string | null) {\n  if (userId) {\n    const { data } = await db.from("mail_postfaecher").select("*").eq("benutzer_id", userId).eq("aktiv", true)\n      .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);\n    if (data && data.length) return data[0];\n  }\n  const { data } = await db.from("mail_postfaecher").select("*").eq("aktiv", true)\n    .order("ist_standard", { ascending: false }).limit(1);\n  return (data && data[0]) || null;\n}',
     'async function postfachFuer(db: any, userId: string | null, mandant: string | null) {\n  if (userId) {\n    const { data } = await db.from("mail_postfaecher").select("*").eq("benutzer_id", userId).eq("aktiv", true)\n      .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);\n    if (data && data.length) return data[0];\n  }\n  // Der Rueckfall hiess "irgendein aktives Postfach". Mit einem Mandanten\n  // war das DAS Postfach; mit mehreren ist es der SMTP-Zugang eines fremden\n  // Maklers — die Mail ginge unter dessen Absender hinaus und laege in\n  // dessen Gesendet-Ordner. Ohne Mandanten deshalb gar keines: kein Versand\n  // ist besser als der falsche.\n  if (!mandant) return null;\n  const { data } = await db.from("mail_postfaecher").select("*")\n    .eq("mandant_id", mandant).eq("aktiv", true)\n    .order("ist_standard", { ascending: false }).limit(1);\n  return (data && data[0]) || null;\n}',
     'Postfach-Rueckfall bleibt im Mandanten des Leads.',
     {'akq-automation-lauf'}),
    ('FORK',
     'await postfachFuer(db, lead.zustaendig_id);',
     'await postfachFuer(db, lead.zustaendig_id, lead.mandant_id || null);',
     'Der Mandant des Leads wird durchgereicht.',
     {'akq-automation-lauf'}),
    ('FORK',
     'async function postfach(db: any) {\n  const { data: genau } = await db.from("mail_postfaecher").select("*").eq("email_adresse", ABSENDER).limit(1);\n  if (genau && genau[0]) return genau[0];\n  const { data: rest } = await db.from("mail_postfaecher").select("*").eq("aktiv", true)\n    .order("ist_standard", { ascending: false }).limit(1);\n  return rest && rest[0];\n}',
     '// Das Postfach gehoert dem Mandanten, dem das Formular zugeordnet ist. Die\n// Vorlage nahm "das Postfach mit DIESER Adresse, sonst irgendeines" — die\n// Adresse war die des einen Hauses, und "irgendeines" ist mit mehreren\n// Mandanten das eines fremden Maklers.\nasync function postfach(db: any, mandant: string | null) {\n  if (!mandant) return null;\n  const { data: genau } = await db.from("mail_postfaecher").select("*")\n    .eq("mandant_id", mandant).eq("email_adresse", ABSENDER).limit(1);\n  if (genau && genau[0]) return genau[0];\n  const { data: rest } = await db.from("mail_postfaecher").select("*")\n    .eq("mandant_id", mandant).eq("aktiv", true)\n    .order("ist_standard", { ascending: false }).limit(1);\n  return rest && rest[0];\n}',
     'Energieausweis: Postfach nur aus dem eigenen Mandanten.',
     {'energieausweis-anfrage'}),
    ('FORK',
     'async function sendeMail(db: any, opt: { an: string;',
     'async function sendeMail(db: any, mandant: string | null, opt: { an: string;',
     'Energieausweis: sendeMail bekommt den Mandanten.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '  const pf = await postfach(db);',
     '  const pf = await postfach(db, mandant);',
     'Energieausweis: das Postfach wird je Mandant geholt.',
     {'energieausweis-anfrage'}),
    ('FORK',
     'await sendeMail(db, {',
     'await sendeMail(db, mandant, {',
     'Energieausweis: beide Aufrufe reichen den Mandanten durch (2x).',
     {'energieausweis-anfrage'}),
    ('FORK',
     '    const { data: z } = await admin.from("projekt_zugaenge")\n      .select("id, projekt_id, anzeigename, email, aktiv, ansprechpartner_id")\n      .eq("id", zugangId).maybeSingle();',
     '    const { data: z } = await admin.from("projekt_zugaenge")\n      .select("id, projekt_id, anzeigename, email, aktiv, ansprechpartner_id, mandant_id")\n      .eq("id", zugangId).maybeSingle();',
     'Projekt-Antwort: der Zugang gibt seinen Mandanten mit.',
     {'projekt-nachricht-antwort'}),
    ('FORK',
     '      const { data: postfaecher } = await admin.from("mail_postfaecher")\n        .select("*").eq("aktiv", true)\n        .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false });\n      const postfach = (postfaecher || []).find((p: any) => p.benutzer_id === user.id && p.standard_zum_senden)\n        || (postfaecher || []).find((p: any) => p.benutzer_id === user.id)\n        || (postfaecher || []).find((p: any) => z.ansprechpartner_id && p.benutzer_id === z.ansprechpartner_id)\n        || (postfaecher || []).find((p: any) => (p.email_adresse || "").toLowerCase() === STANDARD_MAIL)\n        || (postfaecher || [])[0] || null;',
     '      const { data: postfaecher } = await admin.from("mail_postfaecher")\n        .select("*").eq("mandant_id", z.mandant_id).eq("aktiv", true)\n        .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false });\n      // Die Kette endete auf (postfaecher || [])[0] — "irgendeines". Mit der\n      // Einschraenkung oben ist "irgendeines" jetzt wenigstens eines des\n      // eigenen Mandanten. Der Griff nach STANDARD_MAIL entfaellt: das war\n      // die feste Adresse des einen Hauses und gehoert keinem Mandanten.\n      const postfach = (postfaecher || []).find((p: any) => p.benutzer_id === user.id && p.standard_zum_senden)\n        || (postfaecher || []).find((p: any) => p.benutzer_id === user.id)\n        || (postfaecher || []).find((p: any) => z.ansprechpartner_id && p.benutzer_id === z.ansprechpartner_id)\n        || (postfaecher || []).find((p: any) => p.standard_zum_senden)\n        || (postfaecher || [])[0] || null;',
     'Projekt-Antwort: Postfach nur aus dem eigenen Mandanten.',
     {'projekt-nachricht-antwort'}),
    ('FORK',
     '        // Fallback: erstes aktives Standard-Postfach irgendeines Maklers\n        if (!postfach) {\n          const { data: pf } = await admin\n            .from("mail_postfaecher")\n            .select("*")\n            .eq("ist_standard", true)\n            .eq("aktiv", true)\n            .limit(1)\n            .maybeSingle();',
     '        // Rueckfall: Standard-Postfach DIESES Mandanten. Vorher stand hier\n        // "irgendeines Maklers" — im Quelltext genau so benannt. Mit einem\n        // Mandanten war das harmlos, mit mehreren geht die Meldung des einen\n        // Maklers ueber den Zugang des anderen hinaus.\n        if (!postfach && ben.mandant_id) {\n          const { data: pf } = await admin\n            .from("mail_postfaecher")\n            .select("*")\n            .eq("mandant_id", ben.mandant_id)\n            .eq("ist_standard", true)\n            .eq("aktiv", true)\n            .limit(1)\n            .maybeSingle();',
     'Upload-Planer: Postfach-Rueckfall bleibt im Mandanten.',
     {'upload_benachrichtigung_planen'}),
    ('FORK',
     '    const { data: postfaecher } = await admin.from("mail_postfaecher")\n      .select("*").eq("aktiv", true)\n      .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false });',
     '    // Die Auswahl darunter filtert schon auf den Mandanten des Projekts. Die\n    // ABFRAGE tat es nicht: sie holte die Postfaecher aller Mandanten samt\n    // verschluesselter SMTP-Passwoerter in den Speicher. Was nicht geholt\n    // wird, kann auch kein spaeterer Umbau versehentlich verwenden.\n    const mandantenDerProjekte = [...new Set((projekte || [])\n      .map((p: any) => p.mandant_id).filter(Boolean))];\n    const { data: postfaecher } = mandantenDerProjekte.length\n      ? await admin.from("mail_postfaecher")\n          .select("*").in("mandant_id", mandantenDerProjekte).eq("aktiv", true)\n          .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false })\n      : { data: [] as any[] };',
     'Projekt-Dateimeldung: nur die Postfaecher der beteiligten Mandanten.',
     {'projekt-datei-benachrichtigung'}),

    # --- Phase 2.4, zweiter Block: fremde Zugangsdaten und fremder Briefkopf
    # portal_zugaenge traegt FTP-Server, Benutzer und Passwort. firma_stammdaten
    # traegt Briefkopf, Kontaktadresse und Rufnummer. Beide wurden ohne
    # Mandantenbezug gelesen — das Ergebnis geht in ein Portal-Inserat oder auf
    # ein Dokument, das ein Kunde bekommt.
    ('FORK',
     'const { data: profile } = await admin.from("profiles").select("id, role").eq("id", userData.user.id).maybeSingle();\n    if (!profile || !["chef", "mitarbeiter"].includes(profile.role)) return jsonErr(403, "Kein Teamzugang");\n\n    const { data: zugang } = await admin.from("portal_zugaenge").select("*").eq("portal", portal).eq("aktiv", true).maybeSingle();',
     'const { data: profile } = await admin.from("profiles").select("id, role, mandant_id").eq("id", userData.user.id).maybeSingle();\n    if (!profile || !["chef", "mitarbeiter"].includes(profile.role)) return jsonErr(403, "Kein Teamzugang");\n    if (!profile.mandant_id) return jsonErr(403, "Kein Mandant am Profil — ohne den keine Portaluebertragung.");\n\n    // Der Zugang traegt FTP-Server, Benutzer und Passwort des Maklers. Ohne\n    // Mandantenfilter liefert .maybeSingle() den erstbesten aktiven Zugang\n    // fuer dieses Portal — unter mehreren Mandanten also die Zugangsdaten\n    // eines fremden Maklers, und das Objekt landete in dessen Portalkonto.\n    const { data: zugang } = await admin.from("portal_zugaenge").select("*")\n      .eq("mandant_id", profile.mandant_id).eq("portal", portal).eq("aktiv", true).maybeSingle();',
     'Portalexport: der FTP-Zugang gehoert dem Mandanten des Aufrufers.',
     {'portal-export'}),
    ('FORK',
     'const { data: profile } = await admin.from("profiles").select("*").eq("id", userData.user.id).maybeSingle();\n    if (!profile) return jsonErr(403, "Kein Teamzugang");\n\n    const { data: zugang } = await admin.from("portal_zugaenge")\n      .select("*").eq("portal", "homepage").eq("aktiv", true).maybeSingle();',
     'const { data: profile } = await admin.from("profiles").select("*").eq("id", userData.user.id).maybeSingle();\n    if (!profile) return jsonErr(403, "Kein Teamzugang");\n    if (!profile.mandant_id) return jsonErr(403, "Kein Mandant am Profil — ohne den kein Homepage-Export.");\n\n    // Wie im Portalexport: der Zugang traegt fremde FTP-Zugangsdaten,\n    // wenn niemand sagt, wessen Zugang gemeint ist.\n    const { data: zugang } = await admin.from("portal_zugaenge")\n      .select("*").eq("mandant_id", profile.mandant_id).eq("portal", "homepage").eq("aktiv", true).maybeSingle();',
     'Homepage-Export: der FTP-Zugang gehoert dem Mandanten des Aufrufers.',
     {'portal-export-homepage'}),
    ('FORK',
     '  const mandantWunsch = url.searchParams.get("mandant") || "";\n  let zFrage = db.from("portal_zugaenge").select("*").eq("portal", portal);\n  if (/^[0-9a-f-]{36}$/i.test(mandantWunsch)) zFrage = zFrage.eq("mandant_id", mandantWunsch);\n  const { data: zZeilen } = await zFrage.limit(2);',
     '  // Die Diagnose zeigt Server, Benutzer und Ordner eines Portalzugangs.\n  // Der Mandant war ein WUNSCH aus der Abfrage: ohne ihn nahm sie den\n  // erstbesten Zugang, mit ihm jeden beliebigen. Jetzt gilt der Mandant\n  // des Aufrufers; ein Wunsch darf ihn nur bestaetigen, nicht ersetzen.\n  const mandantWunsch = url.searchParams.get("mandant") || "";\n  const mandantDesAufrufers = await immoMandantDesAufrufers(req);\n  if (!mandantDesAufrufers) {\n    return new Response(JSON.stringify({ ok: false, fehler: "kein Mandant" }), {\n      status: 403, headers: { ...cors, "Content-Type": "application/json" },\n    });\n  }\n  if (/^[0-9a-f-]{36}$/i.test(mandantWunsch) && mandantWunsch !== mandantDesAufrufers) {\n    return new Response(JSON.stringify({ ok: false, fehler: "fremder Mandant" }), {\n      status: 403, headers: { ...cors, "Content-Type": "application/json" },\n    });\n  }\n  const zFrage = db.from("portal_zugaenge").select("*")\n    .eq("mandant_id", mandantDesAufrufers).eq("portal", portal);\n  const { data: zZeilen } = await zFrage.limit(2);',
     'FTP-Diagnose: nur der Portalzugang des eigenen Mandanten.',
     {'portal-ftp-diagnose'}),
    ('FORK',
     'const { data: firma } = await admin.from("firma_stammdaten").select("email, telefon").not("email", "is", null).limit(1).maybeSingle();',
     '// Diese Adresse und Rufnummer gehen als Kontakt in das OpenImmo-ZIP und\n    // damit in das Portal-Inserat. Ohne Mandantenfilter war es die des\n    // erstbesten Maklers mit einer Adresse — im Inserat eines anderen.\n    const { data: firma } = await admin.from("firma_stammdaten").select("email, telefon")\n      .eq("mandant_id", profile.mandant_id).not("email", "is", null).limit(1).maybeSingle();',
     'Portalexport: Kontaktdaten aus dem eigenen Mandanten.',
     {'portal-export'}),
    ('FORK',
     'const { data: firma } = await admin.from("firma_stammdaten")\n      .select("email, telefon").not("email", "is", null).limit(1).maybeSingle();',
     '// Wie im Portalexport: der Kontakt im Inserat war der des erstbesten\n    // Maklers, nicht der des eigenen.\n    const { data: firma } = await admin.from("firma_stammdaten")\n      .select("email, telefon").eq("mandant_id", profile.mandant_id)\n      .not("email", "is", null).limit(1).maybeSingle();',
     'Homepage-Export: Kontaktdaten aus dem eigenen Mandanten.',
     {'portal-export-homepage'}),
    ('FORK',
     '    const { data: firmen } = await db.from("firma_stammdaten").select("*")\n      .eq("typ", "standort").eq("aktiv", true).order("sortierung").limit(1);\n    const stamm = (firmen && firmen[0]) || (await db.from("firma_stammdaten").select("*").order("sortierung").limit(1).maybeSingle()).data;',
     '    // Briefkopf der Wertindikation. Der zweite Griff war ein Rueckfall ohne\n    // jede Bedingung — der erste Satz der ganzen Tabelle, also unter mehreren\n    // Mandanten der Briefkopf eines fremden Maklers auf dem eigenen\n    // Dokument. Er entfaellt: ohne Stammdaten kein Dokument.\n    const { data: firmen } = await db.from("firma_stammdaten").select("*")\n      .eq("mandant_id", lead.mandant_id).eq("typ", "standort").eq("aktiv", true)\n      .order("sortierung").limit(1);\n    const stamm = (firmen && firmen[0]) || null;\n    if (!stamm) return antwort({ ok: false, fehler: "Fuer diesen Mandanten sind keine Firmenstammdaten hinterlegt — ohne Briefkopf wird kein Dokument erzeugt." }, 400);',
     'Wertindikation: Briefkopf nur aus dem eigenen Mandanten, kein blinder Rueckfall.',
     {'akq-wertindikation-pdf'}),
    ('FORK',
     '      const { data: firmen } = await db.from("firma_stammdaten").select("strasse, plz, ort")\n        .eq("typ", "standort").eq("aktiv", true).order("sortierung").limit(1);',
     '      // Startadresse fuer die Fahrzeit, wenn der Mitarbeiter keine eigene hat:\n      // der Standort SEINES Hauses, nicht der erstbeste in der Tabelle.\n      const { data: firmen } = await db.from("firma_stammdaten").select("strasse, plz, ort")\n        .eq("mandant_id", profil?.mandant_id ?? "00000000-0000-0000-0000-000000000000")\n        .eq("typ", "standort").eq("aktiv", true).order("sortierung").limit(1);',
     'Fahrzeit: der Standort des eigenen Mandanten als Startpunkt.',
     {'termin-fahrzeit'}),
    ('FORK',
     'const { data } = await db.from("profiles").select("id, name, start_adresse, fahrzeit_aktiv, fahrzeit_puffer_min").eq("id", userId).maybeSingle();',
     'const { data } = await db.from("profiles").select("id, name, start_adresse, fahrzeit_aktiv, fahrzeit_puffer_min, mandant_id").eq("id", userId).maybeSingle();',
     'Fahrzeit: das Profil gibt seinen Mandanten mit.',
     {'termin-fahrzeit'}),

    # --- Phase 2.4, dritter Block: der Briefkopf auf Dokumenten -----------
    # Expose, Praesentation und Rechnung holen Briefkopf, Standortliste,
    # Finanzierungsannahmen, Kennzahlen und Textbausteine. Jede dieser
    # Ketten endete auf einem Rueckfall ohne Mandantenbezug — und zwar genau
    # dann, wenn der eigene Mandant nichts hinterlegt hat. Aus "das Dokument
    # bleibt leer" wurde so "das Dokument traegt die Angaben eines fremden
    # Maklers": Anschrift, Steuernummer, Bankverbindung, Umsatzzahlen.
    #
    # Der Rueckfall ist gestrichen, nicht umgebogen. Ein Dokument ohne
    # Briefkopf faellt auf; eines mit dem falschen nicht.
    ('FORK',
     '{ const { data } = await admin.from("firma_stammdaten").select("firma_name,strasse,plz,ort,sortierung").eq("aktiv", true).order("sortierung"); standorte = data || []; }',
     '// Die Standortliste steht im Fuss des Exposes. Ohne Mandantenfilter war\n// das die Liste ALLER Standorte ALLER Makler auf der Plattform — im\n// Expose eines einzelnen.\n{ const { data } = await admin.from("firma_stammdaten").select("firma_name,strasse,plz,ort,sortierung").eq("mandant_id", immoMandant).eq("aktiv", true).order("sortierung"); standorte = data || []; }',
     'Expose: die Standortliste im Fuss nur aus dem eigenen Mandanten.',
     {'expose-pdf-erzeugen'}),
    ('FORK',
     '{ const { data } = await admin.from("finanzierungs_annahmen").select("*").eq("aktiv", true).limit(1).maybeSingle(); finAnn = data; }',
     '// Zins und Tilgung fuer die Finanzierungsrechnung im Expose. Die Annahmen\n// eines fremden Maklers sind hier keine Annaeherung, sondern eine falsche\n// Zahl in einem Dokument, das ein Kaufinteressent bekommt.\n{ const { data } = await admin.from("finanzierungs_annahmen").select("*").eq("mandant_id", immoMandant).eq("aktiv", true).limit(1).maybeSingle(); finAnn = data; }',
     'Expose: Finanzierungsannahmen nur aus dem eigenen Mandanten.',
     {'expose-pdf-erzeugen'}),
    ('FORK',
     'if (ap.firma_id) { const { data } = await admin.from("firma_stammdaten").select("*").eq("id", ap.firma_id).maybeSingle(); if (data && data.aktiv !== false) firma = data; }\nif (!firma) { const { data } = await admin.from("firma_stammdaten").select("*").eq("mandant_id", immoMandant).order("sortierung").limit(1).maybeSingle(); firma = data; }\nif (!firma) { const { data } = await admin.from("firma_stammdaten").select("*").eq("aktiv", true).order("sortierung").limit(1).maybeSingle(); firma = data; }',
     '// Briefkopf: erst der Standort des Ansprechpartners, dann ein Standort des\n// Mandanten. Der dritte Griff war "der erste aktive Standort ueberhaupt" —\n// ein Rueckfall ueber die Mandantengrenze, und zwar ausgerechnet dann,\n// wenn der eigene Mandant keine Stammdaten hat. Er ist gestrichen; auch\n// der erste Griff bleibt jetzt im Mandanten, damit eine geerbte oder\n// falsch gesetzte firma_id keinen fremden Briefkopf holt.\nif (ap.firma_id) { const { data } = await admin.from("firma_stammdaten").select("*").eq("id", ap.firma_id).eq("mandant_id", immoMandant).maybeSingle(); if (data && data.aktiv !== false) firma = data; }\nif (!firma) { const { data } = await admin.from("firma_stammdaten").select("*").eq("mandant_id", immoMandant).order("sortierung").limit(1).maybeSingle(); firma = data; }',
     'Expose: der Briefkopf-Rueckfall ueber die Mandantengrenze ist gestrichen.',
     {'expose-pdf-erzeugen'}),
    ('FORK',
     'if (!pid) { const { data: chef } = await admin.from("profiles").select("id").eq("role", "chef").limit(1).maybeSingle(); pid = chef?.id || null; }',
     'if (!pid) { const { data: chef } = await admin.from("profiles").select("id").eq("mandant_id", immoMandant).eq("role", "chef").limit(1).maybeSingle(); pid = chef?.id || null; }',
     'Expose: "der Chef" ist der des eigenen Mandanten.',
     {'expose-pdf-erzeugen'}),
    ('FORK',
     'if (ap.firma_id) { const { data } = await admin.from("firma_stammdaten").select("*").eq("id", ap.firma_id).eq("aktiv", true).maybeSingle(); firma = data; }\nif (!firma) { const { data } = await admin.from("firma_stammdaten").select("*").eq("aktiv", true).order("sortierung").limit(1).maybeSingle(); firma = data; }',
     '// Wie im Expose: Briefkopf nur aus dem eigenen Mandanten, und der\n// Rueckfall "erster aktiver Standort ueberhaupt" faellt weg.\nif (ap.firma_id) { const { data } = await admin.from("firma_stammdaten").select("*").eq("id", ap.firma_id).eq("mandant_id", immoMandant).eq("aktiv", true).maybeSingle(); firma = data; }\nif (!firma) { const { data } = await admin.from("firma_stammdaten").select("*").eq("mandant_id", immoMandant).eq("aktiv", true).order("sortierung").limit(1).maybeSingle(); firma = data; }',
     'Praesentation: Briefkopf nur aus dem eigenen Mandanten.',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     '{ const { data } = await admin.from("firma_stammdaten").select("firma_name,strasse,plz,ort,sortierung").eq("aktiv", true).order("sortierung"); standorte = data || []; }',
     '{ const { data } = await admin.from("firma_stammdaten").select("firma_name,strasse,plz,ort,sortierung").eq("mandant_id", immoMandant).eq("aktiv", true).order("sortierung"); standorte = data || []; }',
     'Praesentation: die Standortliste nur aus dem eigenen Mandanten.',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     '{ const { data } = await admin.from("firma_kennzahlen").select("*").eq("aktiv", true).order("jahr", { ascending: false }).limit(1).maybeSingle(); kz = data; }',
     '// Umsatz, Objektzahl, Mitarbeiter — die Zahlen, mit denen sich der Makler\n// beim Eigentuemer vorstellt. Die eines fremden Hauses waeren hier eine\n// falsche Angabe im Akquisegespraech.\n{ const { data } = await admin.from("firma_kennzahlen").select("*").eq("mandant_id", immoMandant).eq("aktiv", true).order("jahr", { ascending: false }).limit(1).maybeSingle(); kz = data; }',
     'Praesentation: Kennzahlen nur aus dem eigenen Mandanten.',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     '{ const { data } = await admin.from("mpe_bausteine").select("*").eq("aktiv", true).order("sortierung"); ',
     '{ const { data } = await admin.from("mpe_bausteine").select("*").eq("mandant_id", immoMandant).eq("aktiv", true).order("sortierung"); ',
     'Praesentation: Textbausteine nur aus dem eigenen Mandanten.',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     '    let firma: any = null;\n    if (rechnung.absender_firma_id) {\n      const { data } = await admin.from("firma_stammdaten").select("*").eq("id", rechnung.absender_firma_id).maybeSingle();\n      firma = data;\n    }\n    if (!firma) {\n      // Fallback: Musterhaus Immobilien GmbH oder erste aktive Firma\n      const { data } = await admin.from("firma_stammdaten").select("*")\n        .eq("aktiv", true).order("sortierung", { ascending: true }).limit(1).maybeSingle();\n      firma = data;\n    }\n    if (!firma) throw new Error("Firmen-Stammdaten nicht gefunden.");\n    immoSetzeMandant(firma.mandant_id);',
     '    // Die Reihenfolge stand auf dem Kopf: erst wurde der Briefkopf geholt,\n    // DANN der Mandant aus dem Briefkopf gesetzt. Damit bestimmte der\n    // Briefkopf den Mandanten statt umgekehrt — und der Rueckfall "erste\n    // aktive Firma" konnte eine fremde sein, auf einer Rechnung mit\n    // fremdem Absender, fremder Steuernummer und fremder Bankverbindung.\n    immoSetzeMandant(rechnung.mandant_id);\n    if (!immoMandant) throw new Error("Die Rechnung hat keinen Mandanten.");\n    let firma: any = null;\n    if (rechnung.absender_firma_id) {\n      const { data } = await admin.from("firma_stammdaten").select("*")\n        .eq("id", rechnung.absender_firma_id).eq("mandant_id", immoMandant).maybeSingle();\n      firma = data;\n    }\n    if (!firma) {\n      const { data } = await admin.from("firma_stammdaten").select("*")\n        .eq("mandant_id", immoMandant)\n        .eq("aktiv", true).order("sortierung", { ascending: true }).limit(1).maybeSingle();\n      firma = data;\n    }\n    if (!firma) throw new Error("Fuer diesen Mandanten sind keine Firmen-Stammdaten hinterlegt.");',
     'Rechnung: der Mandant der Rechnung bestimmt den Briefkopf, nicht umgekehrt.',
     {'rechnung-pdf-erzeugen'}),
    ('FORK',
     '"ep-" + i.id',
     '"obj-" + i.id',
     'OpenImmo-OBID: neutrale Vorsilbe statt der Abkuerzung der Referenz (2x).',
     {'portal-export-homepage', 'portal-export'}),
    ('FORK',
     '("EP-" + String(i.id).slice(0, 8))',
     '("OBJ-" + String(i.id).slice(0, 8))',
     'OpenImmo-Objektnummer: neutrale Vorsilbe (2x).',
     {'portal-export-homepage', 'portal-export'}),
    ('FORK',
     '("EP-" + String(immo.id).slice(0, 8))',
     '("OBJ-" + String(immo.id).slice(0, 8))',
     'OpenImmo-Objektnummer in der Antwort: neutrale Vorsilbe (2x).',
     {'portal-export-homepage', 'portal-export'}),
    ('FORK',
     'immo.onoffice_id ? String(immo.onoffice_id) : "ep-" + immo.id',
     'immo.onoffice_id ? String(immo.onoffice_id) : "obj-" + immo.id',
     'OpenImmo-OBID in der Antwort: neutrale Vorsilbe.',
     {'portal-export'}),

    # --- Phase 2.4, vierter Block: Zuordnung ueber Adresse und Bestand ----
    # Eine E-Mail-Adresse sieht aus wie ein Schluessel, ist aber keiner:
    # zwei Makler koennen denselben Interessenten haben. Jede Suche "Kontakt
    # mit dieser Adresse" fand deshalb auch den des anderen Hauses.
    #
    # Am schwersten wog die Wertindikation: sie zog Vergleichsobjekte aus den
    # Bestaenden ALLER Makler, obwohl ihr eigener Kommentar "eigener Objekte"
    # sagt. Erzielte Preise sind Geschaeftsdaten.
    ('FORK',
     'async function schaetzeWert(db: any, p: { plz: string; ort: string;',
     'async function schaetzeWert(db: any, mandant: string, p: { plz: string; ort: string;',
     'Wertindikation: die Schaetzung bekommt den Mandanten.',
     {'akq-lead-eingang'}),
    ('FORK',
     '    const { data } = await db.from("immobilien").select(spalten).eq("plz", p.plz).gt("wohnflaeche", 15).limit(400);',
     '    const { data } = await db.from("immobilien").select(spalten).eq("mandant_id", mandant).eq("plz", p.plz).gt("wohnflaeche", 15).limit(400);',
     'Wertindikation: Vergleich nach PLZ nur im eigenen Bestand.',
     {'akq-lead-eingang'}),
    ('FORK',
     '      const { data } = await db.from("immobilien").select(spalten).ilike("ort", p.ort).gt("wohnflaeche", 15).limit(600);',
     '      const { data } = await db.from("immobilien").select(spalten).eq("mandant_id", mandant).ilike("ort", p.ort).gt("wohnflaeche", 15).limit(600);',
     'Wertindikation: Vergleich nach Ort nur im eigenen Bestand.',
     {'akq-lead-eingang'}),
    ('FORK',
     '  if (!qm) {\n    const { data } = await db.from("immobilien").select(spalten).gt("wohnflaeche", 15).limit(1000);\n    qm = median(auswerten(data || []));\n    basis = "gesamtbestand";\n  }',
     '  if (!qm) {\n    // "gesamtbestand" hiess bis zum 30.09.2026 der Bestand ALLER Makler auf\n    // der Plattform. Der Kommentar oben sagt "vergleichbarer eigener\n    // Objekte" — bei einem Mandanten stimmte das. Die Schaetzung eines\n    // Maklers stuetzte sich damit auf die erzielten Preise seiner\n    // Mitbewerber, und das sind deren Geschaeftsdaten.\n    //\n    // Hat der eigene Bestand zu wenige Vergleichsobjekte, liefert die\n    // Funktion jetzt "keine_vergleichsdaten". Keine Zahl ist besser als\n    // eine aus fremden Buechern — CLAUDE.md: keine erfundenen Objektdaten.\n    const { data } = await db.from("immobilien").select(spalten).eq("mandant_id", mandant).gt("wohnflaeche", 15).limit(1000);\n    qm = median(auswerten(data || []));\n    basis = "eigener_gesamtbestand";\n  }',
     'Wertindikation: der Rueckfall bleibt im eigenen Bestand.',
     {'akq-lead-eingang'}),
    ('FORK',
     '    const schaetzung = await schaetzeWert(db, {',
     '    const schaetzung = await schaetzeWert(db, mandant, {',
     'Wertindikation: der Mandant wird durchgereicht.',
     {'akq-lead-eingang'}),
    ('FORK',
     '    const { data: regeln } = await db.from("akq_mail_regeln").select("*").eq("aktiv", true).order("sortierung");',
     '    // Die Regeln gehoeren je einem Mandanten. Ohne mandant_id im Ergebnis\n    // wurden die Erkennungsregeln JEDES Hauses auf JEDE Mail angewandt —\n    // der Lead des einen entstand nach der Regel des anderen. Gelesen\n    // werden sie weiter in einem Zug (ein Cron hat keinen Mandanten),\n    // zugeordnet wird unten je Mail.\n    const { data: regeln } = await db.from("akq_mail_regeln").select("*").eq("aktiv", true).order("sortierung");',
     'Mail-Leads: Hinweis auf die Zuordnung je Mail.',
     {'akq-mail-leads'}),
    ('FORK',
     '        .select("id, absender_email, absender_name, betreff, gesendet_am")\n        .neq("ordner", "gesendet").gte("gesendet_am", ab)',
     '        .select("id, absender_email, absender_name, betreff, gesendet_am, mandant_id")\n        .neq("ordner", "gesendet").gte("gesendet_am", ab)',
     'Mail-Leads: die Kandidaten bringen ihren Mandanten mit.',
     {'akq-mail-leads'}),
    ('FORK',
     '      const regel = regeln.find((r: any) =>\n        (r.absender_muster || r.betreff_muster) &&\n        passt(r.absender_muster, absender) && passt(r.betreff_muster, String(m.betreff || "")));',
     '      const regel = regeln.find((r: any) =>\n        r.mandant_id === m.mandant_id &&\n        (r.absender_muster || r.betreff_muster) &&\n        passt(r.absender_muster, absender) && passt(r.betreff_muster, String(m.betreff || "")));',
     'Mail-Leads: nur die Regeln des Mandanten, dem die Mail gehoert.',
     {'akq-mail-leads'}),
    ('FORK',
     '          const { data: k } = await db.from("kontakte").select("id").ilike("email", daten.email).limit(1);',
     '          // Die Dublettenpruefung ueber die Adresse fand auch den Kontakt eines\n          // fremden Maklers — und haengte den neuen Lead an dessen Datensatz.\n          const { data: k } = await db.from("kontakte").select("id").eq("mandant_id", t.mail.mandant_id).ilike("email", daten.email).limit(1);',
     'Mail-Leads: Dublettenpruefung im eigenen Mandanten.',
     {'akq-mail-leads'}),
    ('FORK',
     '      const { data: k } = await db.from("kontakte")\n        .select("id, vorname, nachname, firma, email").ilike("email", gegenueber).limit(1);',
     '      const { data: k } = await db.from("kontakte")\n        .select("id, vorname, nachname, firma, email")\n        .eq("mandant_id", mail.mandant_id).ilike("email", gegenueber).limit(1);',
     'Mail zu ToDo: der Kontakt gehoert dem Mandanten der Mail.',
     {'mail-zu-todo'}),
    ('FORK',
     '            const { data } = await db.from("profiles").select("id, name").in("role", ["chef", "mitarbeiter"]).ilike("name", String(n).trim()).limit(1);',
     '            const { data } = await db.from("profiles").select("id, name").eq("mandant_id", t.mandant_id).in("role", ["chef", "mitarbeiter"]).ilike("name", String(n).trim()).limit(1);',
     'Nachfassen: der Makler wird im eigenen Mandanten gesucht.',
     {'besichtigung-nachfassen'}),
    ('FORK',
     '    const { data: bestehend } = await adminClient\n      .from("eigentuemer")\n      .select("id, user_id, anrede, titel, vorname, nachname")\n      .ilike("email", email)\n      .maybeSingle();',
     '    const mandantDesAufrufers = await immoMandantDesAufrufers(req);\n    if (!mandantDesAufrufers) throw new Error("Kein Mandant am Konto — ohne den keine Einladung.");\n\n    // Ueber die Adresse allein faellt die Suche ueber die Mandantengrenze:\n    // derselbe Eigentuemer kann bei zwei Maklern liegen, und die Einladung\n    // haette sich an den Datensatz des anderen gehaengt.\n    const { data: bestehend } = await adminClient\n      .from("eigentuemer")\n      .select("id, user_id, anrede, titel, vorname, nachname")\n      .eq("mandant_id", mandantDesAufrufers)\n      .ilike("email", email)\n      .maybeSingle();',
     'Eigentuemer einladen: der bestehende Satz muss dem eigenen Mandanten gehoeren.',
     {'eigentuemer-einladen'}),
    ('FORK',
     '    const { data: existsPerson } = await adminClient\n      .from("eigentuemer_personen")\n      .select("id, eigentuemer_id")\n      .ilike("email", email)\n      .maybeSingle();',
     '    // "irgendwo" hiess bis zum 30.09.2026 auch "bei einem anderen Makler".\n    // Die Fehlermeldung darunter haette damit verraten, dass diese Adresse\n    // beim Mitbewerber als Eigentuemer gefuehrt wird.\n    const { data: existsPerson } = await adminClient\n      .from("eigentuemer_personen")\n      .select("id, eigentuemer_id")\n      .eq("mandant_id", eig.mandant_id)\n      .ilike("email", email)\n      .maybeSingle();',
     'Eigentuemer-Person: die Dublettenpruefung bleibt im eigenen Mandanten.',
     {'eigentuemer-person-hinzufuegen'}),
    ('FORK',
     '      .from("eigentuemer").select("id, firma").eq("id", eigentuemerId).maybeSingle();',
     '      .from("eigentuemer").select("id, firma, mandant_id").eq("id", eigentuemerId).maybeSingle();',
     'Eigentuemer-Person: der Eigentuemer gibt seinen Mandanten mit.',
     {'eigentuemer-person-hinzufuegen'}),

    # --- Phase 2.4, fuenfter Block: Indizes, Regeln und Einstellungen -----
    # Was hier zugeordnet wird, entscheidet, an wen etwas geht: die Anfrage
    # an ein Objekt, die Rechnungsmail an eine Buchhaltung, die Frage auf der
    # Objektseite an eine FAQ. Jede dieser Zuordnungen lief bisher gegen den
    # Bestand der ganzen Plattform.
    ('FORK',
     '    const felder = "id, absender_email, absender_name, betreff, text, html, gesendet_am, immobilie_id, postfach_id";',
     '    const felder = "id, absender_email, absender_name, betreff, text, html, gesendet_am, immobilie_id, postfach_id, mandant_id";',
     'Anfragen: die Mail bringt ihren Mandanten mit.',
     {'mail-anfrage-verarbeiten'}),
    ('FORK',
     '    const { data: objekte } = await db.from("immobilien").select("id, immo_nr, objekttitel, bezeichnung, plz, ort, status, stammobjekt_id").neq("versteckt", true).limit(2000);',
     '    // Der Objektindex, gegen den die Anfrage zugeordnet wird. Ohne\n    // Mandantenfilter standen darin die Objekte aller Makler: die Anfrage\n    // des einen konnte am Objekt des anderen landen, samt Objektnummer und\n    // Titel in der Antwort.\n    const { data: objekte } = await db.from("immobilien").select("id, immo_nr, objekttitel, bezeichnung, plz, ort, status, stammobjekt_id").eq("mandant_id", mail.mandant_id).neq("versteckt", true).limit(2000);',
     'Anfragen: die Objektzuordnung bleibt im eigenen Bestand.',
     {'mail-anfrage-verarbeiten'}),
    ('FORK',
     '    const { data } = await db.from("kontakte").select("id, anrede, vorname, nachname, email, telefon, plz, rollen, notiz, aktiv").ilike("email", email).order("aktiv", { ascending: false }).limit(1).maybeSingle();',
     '    const { data } = await db.from("kontakte").select("id, anrede, vorname, nachname, email, telefon, plz, rollen, notiz, aktiv").eq("mandant_id", mail.mandant_id).ilike("email", email).order("aktiv", { ascending: false }).limit(1).maybeSingle();',
     'Anfragen: der Kontakt ueber die Adresse nur im eigenen Mandanten.',
     {'mail-anfrage-verarbeiten'}),
    ('FORK',
     '    let q = db.from("kontakte").select("id, anrede, vorname, nachname, email, telefon, plz, rollen, notiz, aktiv").ilike("nachname", nach).eq("aktiv", true).limit(20);',
     '    let q = db.from("kontakte").select("id, anrede, vorname, nachname, email, telefon, plz, rollen, notiz, aktiv").eq("mandant_id", mail.mandant_id).ilike("nachname", nach).eq("aktiv", true).limit(20);',
     'Anfragen: auch die Namenssuche bleibt im eigenen Mandanten.',
     {'mail-anfrage-verarbeiten'}),
    ('FORK',
     '    const felder = "id, postfach_id, absender_email, absender_name, empfaenger_email, betreff, text, html, anhaenge, gesendet_am, imap_uid, imap_folder";',
     '    const felder = "id, postfach_id, absender_email, absender_name, empfaenger_email, betreff, text, html, anhaenge, gesendet_am, imap_uid, imap_folder, mandant_id";',
     'Rechnungsmails: die Mail bringt ihren Mandanten mit.',
     {'mail-rechnung-weiterleiten'}),
    ('FORK',
     'async function zielFuer(db: any, absender: string, absenderName: string): Promise<Ziel> {',
     'async function zielFuer(db: any, mandant: string | null, absender: string, absenderName: string): Promise<Ziel> {',
     'Rechnungsmails: die Zielsuche bekommt den Mandanten.',
     {'mail-rechnung-weiterleiten'}),
    ('FORK',
     '    const { data } = await db.from("mail_rechnung_ziele").select("absender_muster, name_muster, ziel_email, bezeichnung").eq("aktiv", true).order("reihenfolge")',
     '    // Die Weiterleitungsregeln gehoeren je einem Haus. Ohne Mandantenfilter\n    // galt die Regel des einen fuer die Rechnungsmail des anderen — und die\n    // Rechnung ginge an dessen Buchhaltung.\n    const { data } = await db.from("mail_rechnung_ziele").select("absender_muster, name_muster, ziel_email, bezeichnung").eq("mandant_id", mandant).eq("aktiv", true).order("reihenfolge")',
     'Rechnungsmails: Weiterleitungsziele nur aus dem eigenen Mandanten.',
     {'mail-rechnung-weiterleiten'}),
    ('FORK',
     '  const ziel = await zielFuer(db, absender, mail.absender_name || "");',
     '  const ziel = await zielFuer(db, mail.mandant_id || null, absender, mail.absender_name || "");',
     'Rechnungsmails: der Mandant wird durchgereicht.',
     {'mail-rechnung-weiterleiten'}),
    ('FORK',
     'async function faqKatalog(db: any): Promise<Katalogfrage[]> {\n  const { data } = await db.from("portal_einstellungen").select("wert").eq("schluessel", "landing_faq_katalog").maybeSingle();',
     'async function faqKatalog(db: any, mandant: string | null): Promise<Katalogfrage[]> {\n  const { data } = await db.from("portal_einstellungen").select("wert").eq("mandant_id", mandant).eq("schluessel", "landing_faq_katalog").maybeSingle();',
     'Objektseite: der Fragenkatalog gehoert dem Mandanten des Objekts.',
     {'objekt-landing'}),
    ('FORK',
     '  const katalogAlle = await faqKatalog(db);',
     '  const katalogAlle = await faqKatalog(db, im.mandant_id);',
     'Objektseite: der Mandant des Objekts wird durchgereicht.',
     {'objekt-landing'}),
    ('FORK',
     '  const { data: faq } = await db.from("landing_faq").select("id, frage, antwort, sortierung, kategorie, quelle, quellen, geprueft_am").eq("aktiv", true).or(',
     '  // Der Zweig immobilie_id.is.null holt die allgemeinen Fragen. Ohne\n  // Mandantenfilter waren das die allgemeinen Fragen ALLER Makler — auf der\n  // oeffentlichen Objektseite eines einzelnen.\n  const { data: faq } = await db.from("landing_faq").select("id, frage, antwort, sortierung, kategorie, quelle, quellen, geprueft_am").eq("mandant_id", im.mandant_id).eq("aktiv", true).or(',
     'Objektseite: die FAQ gehoeren dem Mandanten des Objekts.',
     {'objekt-landing'}),
    ('FORK',
     '      const { data: faq } = await db.from("landing_faq").select("frage, antwort").eq("aktiv", true).or(',
     '      const { data: faq } = await db.from("landing_faq").select("frage, antwort").eq("mandant_id", im.mandant_id).eq("aktiv", true).or(',
     'Objektseite: auch die KI-Antwort liest nur eigene FAQ.',
     {'objekt-landing'}),
    ('FORK',
     '    if (firmaId) { const { data: f } = await db.from("firma_stammdaten").select("slug").eq("id", firmaId).maybeSingle(); firmaSlug = f?.slug || null; }',
     '    if (firmaId) { const { data: f } = await db.from("firma_stammdaten").select("slug").eq("id", firmaId).eq("mandant_id", im.mandant_id).maybeSingle(); firmaSlug = f?.slug || null; }',
     'Exposé-Freigabe: der Standort muss zum Objekt gehoeren.',
     {'expose-freigabe-erstellen'}),
    ('FORK',
     '    else { const { data: e } = await db.from("portal_einstellungen").select("wert").eq("schluessel", "landing_standard").maybeSingle();',
     '    else { const { data: e } = await db.from("portal_einstellungen").select("wert").eq("mandant_id", im.mandant_id).eq("schluessel", "landing_standard").maybeSingle();',
     'Exposé-Freigabe: die Vorgabe kommt aus dem eigenen Mandanten.',
     {'expose-freigabe-erstellen'}),
    ('FORK',
     '.from("onoffice_feld_werte").select("feld, oo_key, label").in("feld", ',
     '.from("onoffice_feld_werte").select("feld, oo_key, label").eq("mandant_id", immoMandant).in("feld", ',
     'Expose: die Feldbezeichnungen aus der eigenen Zuordnungstabelle.',
     {'expose-pdf-erzeugen'}),
    ('FORK',
     '      const { data: oi } = await admin.from("immobilien").select("id, immo_nr, strasse, hausnummer, plz, ort, status").range(0, 1999);',
     '      // Der Index, gegen den eingehende Mails einem Objekt zugeordnet werden.\n      // Ohne Mandantenfilter standen darin die Objekte aller Makler; die\n      // Zuordnung unten prueft ihn deshalb zusaetzlich je Postfach.\n      const mandantenDerPostfaecher = [...new Set((postfaecher || [])\n        .map((p: any) => p.mandant_id).filter(Boolean))];\n      const { data: oi } = mandantenDerPostfaecher.length\n        ? await admin.from("immobilien").select("id, mandant_id, immo_nr, strasse, hausnummer, plz, ort, status")\n            .in("mandant_id", mandantenDerPostfaecher).range(0, 1999)\n        : { data: [] as any[] };',
     'Postfach abholen: der Objektindex nur aus den Mandanten der Postfaecher.',
     {'mail-postfach-pull'}),
    ('FORK',
     'const { data: antwortV } = await db.from("mail_eingang").select("id")\n            .ilike("absender_email", mail).neq("ordner", "gesendet")',
     'const { data: antwortV } = await db.from("mail_eingang").select("id")\n            .eq("mandant_id", lead.mandant_id)\n            .ilike("absender_email", mail).neq("ordner", "gesendet")',
     'Automation: die Antwortsuche liest nur das eigene Postfach.',
     {'akq-automation-lauf'}),
    ('FORK',
     'const { data: antwort } = await db.from("mail_eingang").select("id, betreff, gesendet_am")\n        .ilike("absender_email", an).neq("ordner", "gesendet")',
     'const { data: antwort } = await db.from("mail_eingang").select("id, betreff, gesendet_am")\n        .eq("mandant_id", lead.mandant_id)\n        .ilike("absender_email", an).neq("ordner", "gesendet")',
     'Automation: auch die zweite Antwortsuche bleibt im eigenen Mandanten.',
     {'akq-automation-lauf'}),

    ('FORK',
     '        if (!makler) { const { data } = await db.from("profiles").select("id, name").eq("role", "chef").limit(1); makler = (data && data[0]) || { id: null, name: "Ihr Musterhaus Immobilien Team" }; }',
     '        // Letzter Rueckfall: der Chef DIESES Hauses. Ohne Mandantenfilter war\n        // es der erstbeste Chef der Plattform — und sein Name stand dann\n        // unter der Nachfass-Mail eines fremden Maklers. Der Name-Rueckfall\n        // nannte den Demo-Mandanten; jetzt steht dort eine neutrale Anrede.\n        if (!makler) { const { data } = await db.from("profiles").select("id, name").eq("mandant_id", t.mandant_id).eq("role", "chef").limit(1); makler = (data && data[0]) || { id: null, name: "Ihr Team" }; }',
     'Nachfassen: der Chef als Rueckfall aus dem eigenen Mandanten.',
     {'besichtigung-nachfassen'}),
    ('FORK',
     '    const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();',
     '    const { data: profile } = await admin.from("profiles").select("role, mandant_id").eq("id", userId).maybeSingle();',
     'Mail senden: das Profil gibt seinen Mandanten mit.',
     {'mail-senden'}),
    ('FORK',
     '        const { data: mitEmpf } = await admin.from("todos")\n          .select("id, titel, empfaenger_email")\n          .eq("status", "offen").not("empfaenger_email", "is", null);',
     '        // Diese ToDos werden gleich auf "erledigt" gesetzt. Ohne\n        // Mandantenfilter haette eine Mail an eine Adresse, die in zwei\n        // Haeusern als Empfaenger steht, das ToDo des fremden Hauses\n        // mit abgehakt — ein Schreibzugriff ueber die Mandantengrenze.\n        const { data: mitEmpf } = await admin.from("todos")\n          .select("id, titel, empfaenger_email")\n          .eq("mandant_id", profile?.mandant_id ?? "00000000-0000-0000-0000-000000000000")\n          .eq("status", "offen").not("empfaenger_email", "is", null);',
     'Mail senden: nur eigene ToDos werden mit erledigt.',
     {'mail-senden'}),
    ('FORK',
     '          ? await admin.from("kontakte").select("id, email").or(sicher.map((z) => `email.ilike.${z}`).join(",")).limit(200)',
     '          ? await admin.from("kontakte").select("id, email").eq("mandant_id", profile?.mandant_id ?? "00000000-0000-0000-0000-000000000000").or(sicher.map((z) => `email.ilike.${z}`).join(",")).limit(200)',
     'Mail senden: die Kontaktzuordnung bleibt im eigenen Mandanten.',
     {'mail-senden'}),

    # --- Phase 2.4, sechster Block: die vier Kopien von einladung-mail.ts -
    # Vier Dateien mit demselben Inhalt, und in allen vieren derselbe Fehler:
    # der Briefkopf der Einladungsmail kam aus dem erstbesten aktiven Standort
    # der Plattform. Der Eigentuemer des einen Maklers las Namen, Adresse und
    # Netzauftritt des anderen.
    ('FORK',
     'export async function einladungVersenden(admin: SupabaseClient, o: {',
     'export async function einladungVersenden(admin: SupabaseClient, mandant: string, o: {',
     'Einladungsmail: die Versandfunktion bekommt den Mandanten (4 Kopien).',
     {'eigentuemer-einladung-nachfassen', 'eigentuemer-zugang-anfordern', 'eigentuemer-link-erneut-senden', 'eigentuemer-einladen'}),
    ('FORK',
     '  const { data: firmaRow } = await admin.from("firma_stammdaten").select("firma_name, email, web").eq("aktiv", true).order("sortierung").limit(1).maybeSingle();\n  const firma = firmaRow?.firma_name || "Musterhaus Immobilien GmbH";\n  const fromEmail = (Deno.env.get("SMTP_FROM_EMAIL") || firmaRow?.email || "info@immooffice.example").trim();',
     '  // Diese Zeile bestimmt, welcher Firmenname unter der Einladung steht und\n  // an wen der Eigentuemer antwortet. Ohne Mandantenfilter war es der\n  // erstbeste aktive Standort der ganzen Plattform — die Einladung des\n  // einen Maklers trug Namen, Adresse und Netzauftritt des anderen.\n  //\n  // Die Pruefung hat diese vier Kopien lange nicht gesehen: sie nennen\n  // SERVICE_ROLE nirgends, sondern bekommen den fertigen Client als\n  // Parameter. Seit dem 30.09.2026 sucht sie auch danach.\n  const { data: firmaRow } = await admin.from("firma_stammdaten").select("firma_name, email, web")\n    .eq("mandant_id", mandant).eq("aktiv", true).order("sortierung").limit(1).maybeSingle();\n  const firma = firmaRow?.firma_name || (Deno.env.get("SMTP_FROM_NAME") || "ImmoOffice");\n  const fromEmail = (Deno.env.get("SMTP_FROM_EMAIL") || "").trim();',
     'Einladungsmail: Briefkopf und Absender aus dem eigenen Mandanten (4 Kopien).',
     {'eigentuemer-einladung-nachfassen', 'eigentuemer-zugang-anfordern', 'eigentuemer-link-erneut-senden', 'eigentuemer-einladen'}),
    ('FORK',
     '    const replyTo = o.makler?.email && /@immooffice.example\\.de$/i.test(o.makler.email) ? o.makler.email : fromEmail;',
     '    // Die Absenderadresse bleibt die der Plattform: ein Mailanbieter\n    // verschickt nur von einer Domain, die ihm nachgewiesen ist (SPF/DKIM).\n    // Die ANTWORT soll aber beim Makler landen, nicht bei der Plattform.\n    // Die alte Bedingung prüfte auf die Platzhalterdomain und traf deshalb\n    // nie zu — jede Antwort ging ins Leere. Jetzt: der Makler, sonst die\n    // Adresse seines Hauses, sonst die Plattform.\n    const replyTo = (o.makler?.email || firmaRow?.email || fromEmail || "").trim();',
     'Einladungsmail: die Antwort geht an den Makler, nicht an die Plattform (4 Kopien).',
     {'eigentuemer-einladung-nachfassen', 'eigentuemer-zugang-anfordern', 'eigentuemer-link-erneut-senden', 'eigentuemer-einladen'}),
    ('FORK',
     '      const erg = await einladungVersenden(adminClient, {\n        email, userId: authUserId,',
     '      const erg = await einladungVersenden(adminClient, mandantDesAufrufers, {\n        email, userId: authUserId,',
     'Eigentuemer einladen: der Mandant wird an die Versandfunktion gereicht.',
     {'eigentuemer-einladen'}),
    ('FORK',
     '      const erg = await einladungVersenden(adminClient, {\n        email, userId: userIdGefunden, vorname, nachname, anrede, titel, redirectTo: redirect, makler, erneut: !!userIdGefunden,\n      });',
     '      const mandantDesAufrufers = await immoMandantDesAufrufers(req);\n      if (!mandantDesAufrufers) throw new Error("Kein Mandant am Konto — ohne den kein Anmeldelink.");\n      const erg = await einladungVersenden(adminClient, mandantDesAufrufers, {\n        email, userId: userIdGefunden, vorname, nachname, anrede, titel, redirectTo: redirect, makler, erneut: !!userIdGefunden,\n      });',
     'Anmeldelink erneut: der Mandant des Aufrufers geht mit.',
     {'eigentuemer-link-erneut-senden'}),
    ('FORK',
     '      const erg = await einladungVersenden(admin, { email, userId, vorname, nachname, anrede, titel, redirectTo: portalUrl, makler, erneut: true })',
     '      const erg = await einladungVersenden(admin, mandant, { email, userId, vorname, nachname, anrede, titel, redirectTo: portalUrl, makler, erneut: true })',
     'Zugang anfordern: der Mandant des Kontos geht mit.',
     {'eigentuemer-zugang-anfordern'}),

    # ======================================================================
    # Phase 2.4, siebter Block: der Name des Demo-Mandanten im Quelltext
    # ======================================================================
    # Die Neutralisierung hat den Namen des Referenzunternehmens ueberall
    # durch den des Demo-Mandanten ersetzt. Fuer das Neutralitaets-Gate war
    # das richtig — die Referenz ist weg. Fuer ein mandantenfaehiges Produkt
    # ist es derselbe Fehler in neuer Farbe: ein fest verdrahteter
    # Firmenname ist bei jedem Mandanten ausser einem falsch.
    #
    # 107 Vorkommen in 41 Funktionen. Dieser Block nimmt die schwersten:
    # das Feld <firma> im OpenImmo-ZIP, das jedes Portal anzeigt.
    ('FORK',
     '  kontakt: { name: string; email: string; telefon: string | null },\n): string {',
     '  // firma: der Name, der als <anbieter><firma> im OpenImmo-ZIP steht. Er\n  // war fest verdrahtet — jedes Inserat JEDES Mandanten trug damit den\n  // Namen des Demo-Mandanten, und zwar sichtbar im Portal.\n  kontakt: { name: string; email: string; telefon: string | null; firma: string },\n): string {',
     'OpenImmo: der Anbietername kommt aus den Stammdaten (Homepage).',
     {'portal-export-homepage'}),
    ('FORK',
     'kontakt: { name: string; email: string; telefon: string | null }): string {',
     'kontakt: { name: string; email: string; telefon: string | null; firma: string }): string {',
     'OpenImmo: der Anbietername kommt aus den Stammdaten (Portalexport).',
     {'portal-export'}),
    ('FORK',
     '    <firma>Musterhaus Immobilien GmbH</firma>',
     '    <firma>${esc(kontakt.firma)}</firma>',
     'OpenImmo: <firma> traegt den Namen des eigenen Mandanten (2x).',
     {'portal-export', 'portal-export-homepage'}),
    ('FORK',
     '    let kontaktName = "Musterhaus Immobilien GmbH"; let kontaktEmail: string | null = null; let kontaktTelefon: string | null = null;',
     '    let kontaktName = ""; let kontaktEmail: string | null = null; let kontaktTelefon: string | null = null;',
     'Portalexport: kein verdrahteter Kontaktname mehr.',
     {'portal-export'}),
    ('FORK',
     '    const { data: firma } = await admin.from("firma_stammdaten").select("email, telefon")\n      .eq("mandant_id", profile.mandant_id).not("email", "is", null).limit(1).maybeSingle();',
     '    const { data: firma } = await admin.from("firma_stammdaten").select("firma_name, email, telefon")\n      .eq("mandant_id", profile.mandant_id).not("email", "is", null).limit(1).maybeSingle();\n    const firmaName = String(firma?.firma_name || "").trim();\n    if (!firmaName) return jsonErr(500, "Fuer diesen Mandanten ist kein Firmenname hinterlegt — OpenImmo verlangt einen Anbieter.");\n    if (!kontaktName) kontaktName = firmaName;',
     'Portalexport: Name und Kontakt aus den eigenen Stammdaten.',
     {'portal-export'}),
    ('FORK',
     'aktion === "loeschen" ? "DELETE" : "CHANGE", anhaenge, { name: kontaktName, email: kontaktEmail, telefon: kontaktTelefon })',
     'aktion === "loeschen" ? "DELETE" : "CHANGE", anhaenge, { name: kontaktName, email: kontaktEmail, telefon: kontaktTelefon, firma: firmaName })',
     'Portalexport: der Firmenname geht in den XML-Bau.',
     {'portal-export'}),
    ('FORK',
     '    let kontaktName = "Musterhaus Immobilien GmbH";\n    let kontaktEmail: string | null = null;',
     '    let kontaktName = "";\n    let kontaktEmail: string | null = null;',
     'Homepage-Export: kein verdrahteter Kontaktname mehr.',
     {'portal-export-homepage'}),
    ('FORK',
     '    const { data: firma } = await admin.from("firma_stammdaten")\n      .select("email, telefon").eq("mandant_id", profile.mandant_id)\n      .not("email", "is", null).limit(1).maybeSingle();',
     '    const { data: firma } = await admin.from("firma_stammdaten")\n      .select("firma_name, email, telefon").eq("mandant_id", profile.mandant_id)\n      .not("email", "is", null).limit(1).maybeSingle();\n    const firmaName = String(firma?.firma_name || "").trim();\n    if (!firmaName) return jsonErr(500, "Fuer diesen Mandanten ist kein Firmenname hinterlegt — OpenImmo verlangt einen Anbieter.");\n    if (!kontaktName) kontaktName = firmaName;',
     'Homepage-Export: Name und Kontakt aus den eigenen Stammdaten.',
     {'portal-export-homepage'}),
    ('FORK',
     '      { name: kontaktName, email: kontaktEmail, telefon: kontaktTelefon },\n    );',
     '      { name: kontaktName, email: kontaktEmail, telefon: kontaktTelefon, firma: firmaName },\n    );',
     'Homepage-Export: der Firmenname geht in den XML-Bau.',
     {'portal-export-homepage'}),

    # --- Der Energieausweis-Fragebogen: Briefkopf und Widerrufsbelehrung --
    # Ein oeffentliches Formular, dessen Bestaetigungsmail eine gesetzliche
    # Widerrufsbelehrung traegt. Das Muster-Widerrufsformular darin nennt den
    # Unternehmer, gegenueber dem widerrufen wird — mit einem verdrahteten
    # Namen ist die Belehrung fuer jeden Mandanten ausser einem unrichtig,
    # und eine unrichtige Belehrung setzt die Frist nicht in Lauf.
    #
    # Dazu stand im Hinweiskasten ein erfundener Ansprechpartner mit
    # erfundener Rufnummer. CLAUDE.md: keine erfundenen Daten.
    ('FORK',
     'const ABSENDER = "info@immooffice.example";\nconst ABSENDER_NAME = "Musterhaus Immobilien GmbH";',
     '// Absender und Briefkopf gehoeren dem Mandanten, dem das Formular zugeordnet\n// ist — nicht dem Demo-Mandanten, dessen Name hier verdrahtet stand. Die\n// ABSENDERADRESSE bleibt die der Plattform (SPF/DKIM), Anzeigename und\n// Antwortadresse wechseln je Mandant.\nconst ABSENDER = (Deno.env.get("SMTP_FROM_EMAIL") || "").trim();\ntype ImmoFirma = { name: string; email: string; telefon: string; web: string };\nconst IMMO_FIRMA_LEER: ImmoFirma = { name: "", email: "", telefon: "", web: "" };\nasync function immoFirma(db: any, mandant: string | null): Promise<ImmoFirma> {\n  if (!mandant) return IMMO_FIRMA_LEER;\n  const { data } = await db.from("firma_stammdaten").select("firma_name, marken_name, email, telefon, web")\n    .eq("mandant_id", mandant).eq("aktiv", true).order("sortierung").limit(1).maybeSingle();\n  if (!data) return IMMO_FIRMA_LEER;\n  return {\n    name: String(data.marken_name || data.firma_name || "").trim(),\n    email: String(data.email || "").trim(),\n    telefon: String(data.telefon || "").trim(),\n    web: String(data.web || "").trim(),\n  };\n}',
     'Energieausweis: Firmendaten des Mandanten statt verdrahteter Werte.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '  const pf = await postfach(db, mandant);',
     '  const pf = await postfach(db, mandant);\n  const firma = await immoFirma(db, mandant);\n  const absenderName = firma.name || Deno.env.get("SMTP_FROM_NAME") || "ImmoOffice";',
     'Energieausweis: der Anzeigename kommt aus den Stammdaten.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '        from: `${ABSENDER_NAME} <${ABSENDER}>`,',
     '        from: `${absenderName} <${ABSENDER}>`,',
     'Energieausweis: Resend-Absender mit dem Namen des Mandanten.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '      from: `"${ABSENDER_NAME}" <${pf.email_adresse}>`,',
     '      from: `"${absenderName}" <${pf.email_adresse}>`,',
     'Energieausweis: SMTP-Absender mit dem Namen des Mandanten.',
     {'energieausweis-anfrage'}),
    ('FORK',
     'function rahmen(opt: { kopfzeile: string; anrede: string; einleitung: string; d: any; fuss: string; hinweisKasten?: string }): string {',
     'function rahmen(opt: { kopfzeile: string; anrede: string; einleitung: string; d: any; fuss: string; hinweisKasten?: string; firma: ImmoFirma }): string {',
     'Energieausweis: der Mailrahmen bekommt die Firmendaten uebergeben.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '      Musterhaus Immobilien GmbH <br>\n      <a href="mailto:info@immooffice.example" style="color:${GOLD};text-decoration:none">info@immooffice.example</a> &nbsp;\\u00b7&nbsp; <a href="https://immooffice.example" style="color:${GOLD};text-decoration:none">immooffice.example</a>',
     '      ${esc(opt.firma.name)}${opt.firma.name ? "<br>" : ""}\n      ${opt.firma.email ? `<a href="mailto:${esc(opt.firma.email)}" style="color:${GOLD};text-decoration:none">${esc(opt.firma.email)}</a>` : ""}${opt.firma.email && opt.firma.web ? " &nbsp;\\u00b7&nbsp; " : ""}${opt.firma.web ? `<a href="${esc(opt.firma.web)}" style="color:${GOLD};text-decoration:none">${esc(opt.firma.web.replace(/^https?:\\/\\//, ""))}</a>` : ""}',
     'Energieausweis: der Mailfuss traegt die Daten des Mandanten.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '  "An Musterhaus Immobilien GmbH, E-Mail: info@immooffice.example:",',
     '  `An ${firma.name || "den Anbieter"}${firma.email ? `, E-Mail: ${firma.email}` : ""}:`,',
     'Energieausweis: das Widerrufsformular nennt den richtigen Empfaenger.',
     {'energieausweis-anfrage'}),
    ('FORK',
     'const WIDERRUF_TEXT = [',
     '// Die Belehrung nennt den Unternehmer, gegenueber dem widerrufen wird. Mit\n// einem verdrahteten Namen war sie fuer jeden Mandanten ausser einem\n// unrichtig — und eine unrichtige Belehrung setzt die Frist nicht in Lauf.\n// Deshalb eine Funktion, nicht mehr eine Konstante.\n// HINWEIS: Der Text ist das gesetzliche Muster. Er ersetzt keine\n// anwaltliche Pruefung des konkreten Vertrags (siehe docs/OFFEN.md).\nconst widerrufText = (firma: ImmoFirma) => [',
     'Energieausweis: die Widerrufsbelehrung wird je Mandant gebaut.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '].join("\\n");\n\nconst WIDERRUF_HTML = WIDERRUF_TEXT.split("\\n").map((z) => {',
     '].join("\\n");\n\nconst widerrufHtml = (firma: ImmoFirma) => widerrufText(firma).split("\\n").map((z) => {',
     'Energieausweis: auch die HTML-Fassung je Mandant.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '    immoSetzeMandant(mandant);',
     '    immoSetzeMandant(mandant);\n    const firma = await immoFirma(db, mandant);',
     'Energieausweis: die Firmendaten stehen im Handler bereit.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '        hinweisKasten: dateiListeHtml,',
     '        firma,\n        hinweisKasten: dateiListeHtml,',
     'Energieausweis: die interne Mail bekommt die Firmendaten.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '        hinweisKasten: `Ihr Ansprechpartner: <b style="color:${NAVY}">J\\u00f6rn Musterhaus</b>, Energieberatung \\u00b7 <a href="tel:01639774328" style="color:${NAVY}">0163 9774328</a>`,\n        fuss: WIDERRUF_HTML,',
     '        firma,\n        // Hier stand ein erfundener Ansprechpartner mit erfundener\n        // Rufnummer. Beides ist weg: genannt wird, was in den Stammdaten\n        // des Mandanten steht, und sonst nichts.\n        hinweisKasten: firma.telefon\n          ? `Ihr Ansprechpartner: <b style="color:${NAVY}">${esc(firma.name)}</b> \\u00b7 <a href="tel:${esc(firma.telefon.replace(/[^+0-9]/g, ""))}" style="color:${NAVY}">${esc(firma.telefon)}</a>`\n          : undefined,\n        fuss: widerrufHtml(firma),',
     'Energieausweis: kein erfundener Ansprechpartner mehr.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '        alsText(d, ""), "", WIDERRUF_TEXT, "",\n        "Mit freundlichen Gr\\u00fc\\u00dfen", "Musterhaus Immobilien GmbH",',
     '        alsText(d, ""), "", widerrufText(firma), "",\n        "Mit freundlichen Gr\\u00fc\\u00dfen", firma.name,',
     'Energieausweis: Grussformel mit dem Namen des Mandanten.',
     {'energieausweis-anfrage'}),
    ('FORK',
     'm\\u00fcssen Sie uns (Musterhaus Immobilien GmbH, E-Mail: info@immooffice.example) mittels',
     'm\\u00fcssen Sie uns (${firma.name || "dem Anbieter"}${firma.email ? `, E-Mail: ${firma.email}` : ""}${firma.telefon ? `, Tel.: ${firma.telefon}` : ""}) mittels',
     'Energieausweis: auch der Belehrungstext nennt den richtigen Unternehmer.',
     {'energieausweis-anfrage'}),
    ('FORK',
     '"Sie haben das Recht, binnen 14 Tagen',
     '`Sie haben das Recht, binnen 14 Tagen',
     'Energieausweis: die Belehrungszeile wird zur Schablone (Anfang).',
     {'energieausweis-anfrage'}),
    ('FORK',
     'Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.",',
     'Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.`,',
     'Energieausweis: die Belehrungszeile wird zur Schablone (Ende).',
     {'energieausweis-anfrage'}),
    ('FORK',
     'alt="Musterhaus Immobilien GmbH"',
     'alt="${esc(opt.firma.name)}"',
     'Energieausweis: das Logo tragt den Namen des Mandanten als Alternativtext.',
     {'energieausweis-anfrage'}),

    # --- Eine echte Anschrift als Beispiel in einer KI-Vorgabe -----------
    # mail-anhaenge-extrahieren zeigt der KI, wie ein Dateiname aussehen
    # soll — und nimmt dafuer eine Strasse mit Hausnummer, die es wirklich
    # gibt. Das Neutralitaets-Gate hat sie nicht gefunden, weil der
    # Strassenname in keinem seiner Muster steht (03.10.2026). Ein Beispiel
    # braucht keine echte Adresse.
    ('MARKE', 'Beispiel: 2026-05-26_Doberaner-Str-16_Energieausweis.',
     'Beispiel: 2026-05-26_Musterstr-1_Energieausweis.',
     'Beispieldateiname in der KI-Vorgabe ohne echte Anschrift.',
     {'mail-anhaenge-extrahieren'}),

    # --- Und die Bewerbertest-Seite auch --------------------------------
    # Dieselbe Lage: oeffentliche Seite, kein angemeldeter Nutzer, drei
    # Stellen mit dem Namen aus dem Quelltext. Ein Bewerber, der sich bei
    # Makler A bewirbt, hat den Namen des Demo-Mandanten gelesen — in der
    # Begruessung, im Briefkopf und in der Fusszeile.
    ('FORK',
     '      kandidat: { vorname: einladung.vorname, nachname: einladung.nachname },',
     '      kandidat: { vorname: einladung.vorname, nachname: einladung.nachname },\n'
     '      firma: { name: await immoFirmenName(admin, einladung.mandant_id) },',
     'Bewerbertest: der Firmenname des Mandanten kommt mit der Antwort '
     '(als Geschwister, damit die Zeile der Vorlage unberuehrt bleibt).',
     {'bewerbertest-abrufen'}),

    # --- Die Signaturseite muss sagen, WER unterschreiben laesst ---------
    # SignaturPublicPage zeigt die Widerrufsbelehrung nach § 356 BGB, die
    # Erklaerung zum vorzeitigen Taetigkeitsbeginn und den
    # Datenschutzhinweis nach Art. 6 DSGVO. In allen drei stand der Name aus
    # dem Quelltext — nach der Neutralisierung der des Demo-Mandanten.
    #
    # Das ist nicht Kosmetik: die Erklaerung zum vorzeitigen Beginn nennt
    # das Unternehmen, auf das der Unterzeichner verzichtet, und der
    # Datenschutzhinweis nennt den Verantwortlichen. Beides falsch
    # benannt ist schlimmer als gar nicht benannt.
    #
    # Die Seite ist oeffentlich, hat also keinen angemeldeten Nutzer und
    # kein window.IMMO_MARKE. Der Name muss deshalb aus der Antwort dieser
    # Funktion kommen — sie kennt den Mandanten des Vorgangs.
    ('FORK',
     '      pdf_signed_url: pdfSignedUrl,',
     '      firma: {\n'
     '        name: await immoFirmenName(admin, vorgang.mandant_id),\n'
     '        // Der Datenschutzhinweis der Seite verweist auf die Hinweise des\n'
     '        // Maklers. Ohne Eintrag entfaellt der Verweis — ein Hinweis auf\n'
     '        // eine tote Adresse ist schlechter als keiner (fork_32).\n'
     '        datenschutz: String((await admin.from("firma_stammdaten")\n'
     '          .select("url_datenschutz").eq("mandant_id", vorgang.mandant_id)\n'
     '          .eq("aktiv", true).order("sortierung", { ascending: true })\n'
     '          .limit(1).maybeSingle()).data?.url_datenschutz || "").trim(),\n'
     '      },\n'
     '      pdf_signed_url: pdfSignedUrl,',
     'Signaturseite: der Firmenname des Mandanten kommt mit der Antwort.',
     {'signatur-token-validieren'}),

    # --- Eine Domain, die es nicht gibt, als Pruefung --------------------
    # Fuenf Funktionen fragten "kommt diese Adresse von uns?" gegen eine
    # verdrahtete Domain. Siehe den Kommentar des eingezogenen Helfers.
    ('FORK',
     'import { createClient } from "jsr:@supabase/supabase-js@2";',
     'import { createClient } from "jsr:@supabase/supabase-js@2";\n\n// --- Gehoert diese Adresse zum Mandanten selbst? (Phase 2.4) ------------\n// Hier stand die Mail-Domain der Referenz im Quelltext. Die\n// Neutralisierung hat daraus eine Domain gemacht, die es nicht gibt\n// (die Platzhalter-Domain mit angehaengtem ".de") - die Pruefung konnte\n// seither NIE zutreffen, und jede dieser Funktionen hat immer als Firma\n// gesendet statt als zustaendiger Makler. Ein stiller Verhaltenswechsel,\n// den kein Gate sieht: die Zeile ist syntaktisch in Ordnung, sie ist nur\n// immer falsch.\n//\n// Verglichen wird jetzt die Domain, nicht die Zeichenkette. Welche die\n// eigene ist, sagt der Mandant selbst - ueber die Absenderadresse oder\n// die Mailadresse seiner Stammdaten. Ohne eine von beiden ist die\n// Antwort false, und es wird wie bisher als Firma gesendet.\nfunction immoEigeneAdresse(adresse: unknown, eigene: unknown): boolean {\n  const domain = (x: unknown) =>\n    String(x || "").trim().toLowerCase().split("@")[1] || "";\n  const a = domain(adresse), e = domain(eigene);\n  return !!a && !!e && a === e;\n}',
     'Helfer immoEigeneAdresse eingezogen (eigene Mail-Domain je Mandant).',
     {'expose-erinnerung', 'eigentuemer-report-pdf', 'expose-freigabe',
      'eigentuemer-einladung-nachfassen'}),
    ('FORK',
     'makler?.email && /@immooffice.example\\.de$/i.test(makler.email)',
     'makler?.email && immoEigeneAdresse(makler.email, firma?.email)',
     'Absender: der Makler, wenn seine Adresse zum Mandanten gehoert.',
     {'expose-erinnerung', 'eigentuemer-report-pdf'}),
    ('FORK',
     'const absender = makler?.email && /@immooffice.example\\.de$/i.test(makler.email) ? `${makler.name} <${makler.email}>` : `${firma.firma_name} <${firma.email}>`;',
     'const absender = makler?.email && immoEigeneAdresse(makler.email, firma.email) ? `${makler.name} <${makler.email}>` : `${firma.firma_name} <${firma.email}>`;',
     'Expose-Freigabe: derselbe Absender-Rueckfall.',
     {'expose-freigabe'}),
    ('FORK',
     'reply_to: makler?.email && /@immooffice.example\\.de$/i.test(makler.email) ? makler.email : fromEmail',
     'reply_to: makler?.email && immoEigeneAdresse(makler.email, fromEmail) ? makler.email : fromEmail',
     'Einladung nachfassen: die Antwortadresse. Verglichen wird gegen die '
     'Absenderadresse des Mandanten, denn die ist hier die eigene.',
     {'eigentuemer-einladung-nachfassen'}),
    ('FORK',
     '/buchhaltung@immooffice.example\\.de/.test(empf)',
     '/(^|\\.)buchhaltung@/.test(empf)',
     'Schleifenschutz beim Weiterleiten an die Buchhaltung. Die Zeile '
     'darueber prueft die Absenderseite genau so; die Empfaengerseite lief '
     'gegen eine Domain, die es nicht gibt, und griff deshalb nie. Ein '
     'Schleifenschutz darf lieber einmal zu viel greifen als einmal zu '
     'wenig.',
     {'mail-rechnung-weiterleiten'}),

    # --- Impressum, Datenschutz und AGB je Mandant (fork_32) -------------
    # Zwei Funktionen trugen die drei Adressen als Konstanten. Nach der
    # Neutralisierung zeigen sie auf eine Domain, die niemandem gehoert -
    # und die Expose-Freigabe laesst den Interessenten die AGB
    # BESTAETIGEN und verlinkt sie dabei. Ein Haken auf nicht lesbare AGB
    # ist nichts wert.
    ('FORK',
     'const AGB_URL = "https://immooffice.example/agb";\nconst DATENSCHUTZ_URL = "https://immooffice.example/datenschutz";',
     '// Die drei Rechtsadressen stehen in firma_stammdaten (fork_32), nicht\n'
     '// hier: sie gehoeren dem Mandanten, nicht der Plattform. Ohne Eintrag\n'
     '// bleibt der Wert leer und die Oberflaeche laesst den Link weg.',
     'Die Konstanten fuer AGB und Datenschutz entfallen.',
     {'expose-freigabe', 'objekt-landing'}),
    ('FORK',
     'agb_url: AGB_URL, datenschutz_url: DATENSCHUTZ_URL',
     'agb_url: firma?.url_agb || "", datenschutz_url: firma?.url_datenschutz || ""',
     'AGB- und Datenschutzadresse aus den Stammdaten des Mandanten.',
     {'expose-freigabe', 'objekt-landing'}),
    ('FORK',
     '.select("firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon")',
     '.select("firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon, url_impressum, url_datenschutz, url_agb")',
     'Die Stammdaten-Abfrage holt die drei Rechtsadressen mit.',
     {'expose-freigabe', 'objekt-landing'}),

    # --- Der 360-Grad-Rundgang kennt seinen Makler nicht -----------------
    # Die oeffentliche Rundgang-Seite (src/start/01-fruehstart.js, Pflegequelle
    # rundgang.html) zeigt im Fuss Telefon, Mailadresse, Impressum und
    # Datenschutz. Alle vier standen im Quelltext. Nach der Neutralisierung
    # zeigt die Seite dem Kunden woertlich "{telefon}" als Rufnummer und eine
    # Mailadresse, die niemandem gehoert — die Seite hat naemlich gar keine
    # Ersetzung fuer diese Marken. Nachgeprueft am 04.10.2026.
    #
    # Die Daten koennen nur von hier kommen: die Seite kennt weder Konto noch
    # Objektkennung, nur den Rundgang-Token. Also liefert diese Funktion sie
    # mit — aus dem Mandanten DES RUNDGANGS, und nur das, was ohnehin im
    # Impressum steht.
    ('FORK',
     '    const startSzene =',
     '    // Briefkopf und Kontakt des Maklers, zu dem der Rundgang gehoert.\n'
     '    // Ohne Eintrag bleibt das Feld leer, und die Seite laesst die Zeile\n'
     '    // weg — eine fehlende Rufnummer faellt auf, eine fremde nicht.\n'
     '    // Den Mandanten holt dieser Block selbst: die Abfrage der Vorlage\n'
     '      // darueber bleibt unberuehrt, damit der Vergleich mit der Vorlage\n'
     '      // sie weiter Zeile fuer Zeile wiedererkennt.\n'
     '    const { data: imM } = rundgang.immobilie_id\n'
     '      ? await supabase.from("immobilien").select("mandant_id")\n'
     '          .eq("id", rundgang.immobilie_id).maybeSingle()\n'
     '      : { data: null };\n'
     '    const { data: fs } = imM?.mandant_id\n'
     '      ? await supabase.from("firma_stammdaten")\n'
     '          .select("firma_name, marken_name, telefon, email, url_impressum, url_datenschutz")\n'
     '          .eq("mandant_id", imM.mandant_id).eq("aktiv", true)\n'
     '          .order("sortierung", { ascending: true }).limit(1).maybeSingle()\n'
     '      : { data: null };\n'
     '    const firma = {\n'
     '      name: String(fs?.marken_name || fs?.firma_name || "").trim(),\n'
     '      telefon: String(fs?.telefon || "").trim(),\n'
     '      email: String(fs?.email || "").trim(),\n'
     '      impressum: String(fs?.url_impressum || "").trim(),\n'
     '      datenschutz: String(fs?.url_datenschutz || "").trim(),\n'
     '    };\n\n'
     '    const startSzene =',
     'Rundgang: Kontaktdaten des Maklers aus den Stammdaten seines Mandanten.',
     {'rundgang-oeffentlich'}),
    ('FORK',
     '        objekt,\n        szenen: szenen.map((s) => ({',
     '        objekt,\n        firma,\n        szenen: szenen.map((s) => ({',
     'Rundgang: die Antwort traegt firma.',
     {'rundgang-oeffentlich'}),

    # --- Die KI wurde angewiesen, eine tote Adresse zu nennen -----------
    # generate-text baut die Systemvorgabe fuer Beitraege in den sozialen
    # Netzen. Darin stand:
    #
    #   10. Kontakt: 📩 ${KONTAKT_EMAIL}  📞 ${KONTAKT_TELEFON}
    #   - Kontaktdaten NIEMALS erfinden ... AUSSCHLIESSLICH: <Mail> bzw. <Tel>
    #
    # Beide Werte standen im Quelltext. Nach der Neutralisierung ist die
    # Mailadresse eine, die niemandem gehoert, und die Rufnummer LEER. Die
    # KI wurde also ausdruecklich angewiesen, in Werbetexte eine tote
    # Adresse und ein leeres Telefonfeld zu schreiben — an drei Stellen
    # der Systemvorgaben.
    #
    # Die Funktion hat keinen Datenbankzugang und keinen Mandanten; sie ist
    # ein reiner Textbauer. Die Kontaktdaten kommen deshalb aus dem
    # Anfragekoerper — die Oberflaeche kennt sie seit dem 03.10. ueber
    # immoFirma(feld). Ohne Angabe entfallen Kontaktzeile UND Regel: dann
    # schreibt die KI keine Kontaktdaten, was die Regel darueber ohnehin
    # verlangt.
    ('FORK',
     'const KONTAKT_EMAIL = "info@immooffice.example";\nconst KONTAKT_TELEFON = "";',
     '// Kontaktdaten kommen aus dem Anfragekoerper (body.kontakt), nicht aus\n'
     '// dem Quelltext: diese Funktion bedient jeden Mandanten. Ohne Angabe\n'
     '// entfaellt die Kontaktzeile.\n'
     'function immoKontaktZeilen(k: { email?: string; telefon?: string } | undefined | null) {\n'
     '  const mail = String(k?.email || "").trim();\n'
     '  const tel = String(k?.telefon || "").trim();\n'
     '  const teile = [mail ? `\\u{1F4E9} ${mail}` : "", tel ? `\\u{1F4DE} ${tel}` : ""].filter(Boolean);\n'
     '  return {\n'
     '    // Punkt 10 der Struktur. Ohne Kontaktdaten gibt es ihn nicht.\n'
     '    zeile: teile.length ? `10. Kontakt: ${teile.join("  ")}` : "",\n'
     '    // Dieselbe Angabe mehrzeilig, so steht sie in zwei der Vorgaben.\n'
     '    block: teile.length ? `Kontakt:\\n   ${teile.join("\\n   ")}` : "",\n'
     '    // Die Regel, auf welche Daten sich die KI beschraenken soll.\n'
     '    regel: teile.length\n'
     '      ? `- Kontaktdaten NIEMALS erfinden (keine Telefonnummern, E-Mail- oder Webadressen ausdenken). Falls Kontaktdaten genannt werden, AUSSCHLIESSLICH: ${teile.join(" bzw. ")}`\n'
     '      : "- Kontaktdaten NIEMALS erfinden und auch keine nennen: es liegen keine vor.",\n'
     '  };\n'
     '}',
     'generate-text: Kontaktdaten aus dem Anfragekoerper statt aus dem '
     'Quelltext.',
     {'generate-text'}),
    ('FORK',
     '  const { textart, daten, kuerzer } = body;',
     '  const { textart, daten, kuerzer } = body;\n'
     '  const kontakt = immoKontaktZeilen((body as any).kontakt);',
     'generate-text: die Kontaktzeilen einmal bauen.',
     {'generate-text'}),
    ('FORK',
     '10. Kontakt: \U0001F4E9 ${KONTAKT_EMAIL}  \U0001F4DE ${KONTAKT_TELEFON}${hashtagsBlock}',
     '${kontakt.zeile}${hashtagsBlock}',
     'generate-text: Punkt 10 der Struktur, oder gar nichts.',
     {'generate-text'}),
    ('FORK',
     'Kontakt:\\n   \U0001F4E9 ${KONTAKT_EMAIL}\\n   \U0001F4DE ${KONTAKT_TELEFON}${hashtagsBlock}',
     '${kontakt.block}${hashtagsBlock}',
     'generate-text: derselbe Block mehrzeilig, in einer weiteren Vorgabe.',
     {'generate-text'}),
    ('FORK',
     '- Kontaktdaten NIEMALS erfinden (keine Telefonnummern, E-Mail- oder Webadressen ausdenken). Falls Kontaktdaten genannt werden, AUSSCHLIESSLICH: \U0001F4E9 ${KONTAKT_EMAIL} bzw. \U0001F4DE ${KONTAKT_TELEFON}',
     '${kontakt.regel}',
     'generate-text: die Regel dazu.',
     {'generate-text'}),

    # --- Die Anschrift der Widerrufsbelehrung ----------------------------
    # § 356 BGB: der Verbraucher muss wissen, WOHIN er widerruft. Der Block
    # nennt Name, Firma, Strasse und Ort — alles aus den Stammdaten des
    # Mandanten — und dann eine Mailadresse aus dem Quelltext, die es nicht
    # gibt. Die Belehrung nennt damit eine Anschrift, an die ein Widerruf
    # nicht zugestellt werden kann.
    #
    # Dasselbe im Muster-Widerrufsformular, das der Verbraucher ausfuellt
    # und zurueckschickt.
    #
    # Ohne Eintrag entfaellt die Zeile: die postalische Anschrift darueber
    # steht vollstaendig da, und ein Widerruf per Brief ist nach § 355 BGB
    # genauso wirksam. Eine Adresse, an die nichts ankommt, waere schlechter.
    ('FORK',
     'a.push({ text: "info@immooffice.example", noJustify: true });',
     'if (standort.email) a.push({ text: standort.email, noJustify: true });',
     'Widerrufsbelehrung im Maklervertrag: die Mailadresse des Mandanten.',
     {'vertrag-pdf'}),
    ('FORK',
     'a.push({ text: "info@immooffice.example" });',
     'if (standort.email) a.push({ text: standort.email });',
     'Widerrufsbelehrung und Muster-Widerrufsformular im Signaturvorgang: '
     'dieselbe Adresse, vier Stellen.',
     {'signatur-vorgang-starten'}),

    # --- Die Datenschutzadresse in den Vertrags-PDF (fork_32) ------------
    # vertrag-pdf und signatur-vorgang-starten schreiben in die AGB des
    # Maklervertrags: "Weitere Informationen ... abrufbar unter: <Adresse>".
    # Die Adresse war verdrahtet und zeigt nach der Neutralisierung ins
    # Nichts. Ein Satz, der Auskunft an einer toten Adresse verspricht, ist
    # schlechter als kein Satz - deshalb entfaellt er ohne Eintrag ganz.
    # Das Feld traegt immoStandort; erweitert wird er dort, wo er entsteht.
    ('FORK',
     'a.push({ text: "Weitere Informationen zur Datenverarbeitung sind in den Datenschutzhinweisen des Maklers abrufbar unter: https://immooffice.example/unternehmen/datenschutz/", spaceAfter: 8 });',
     'if (standort.datenschutz) a.push({ text: `Weitere Informationen zur Datenverarbeitung sind in den Datenschutzhinweisen des Maklers abrufbar unter: ${standort.datenschutz}`, spaceAfter: 8 });',
     'Maklervertrag-PDF: der Satz nennt die Adresse des Mandanten - oder '
     'entfaellt.',
     {'vertrag-pdf'}),
    ('FORK',
     'a.push({ text: "Weitere Informationen zur Datenverarbeitung sind in den Datenschutzhinweisen des Maklers abrufbar unter: https://immooffice.example/unternehmen/datenschutz/" });',
     'if (standort.datenschutz) a.push({ text: `Weitere Informationen zur Datenverarbeitung sind in den Datenschutzhinweisen des Maklers abrufbar unter: ${standort.datenschutz}` });',
     'Signaturvorgang: derselbe Satz in denselben AGB.',
     {'signatur-vorgang-starten'}),

    # --- Das Neubauportal: Absendername und Grussformeln ------------------
    # Vier Funktionen schicken Mail an Kunden eines Bautraegers. Der
    # Absendername fiel auf den Namen des Demo-Mandanten zurueck, und unter
    # jeder Mail stand er als Grussformel.
    ('FORK',
     'import { createClient } from "jsr:@supabase/supabase-js@2";',
     'import { createClient } from "jsr:@supabase/supabase-js@2";\n\n// --- Firmenname des Mandanten (Phase 2.4) ---------------------------------\n// Die Neutralisierung hat den Namen der Referenz ueberall durch den des\n// Demo-Mandanten ersetzt. Fuer das Neutralitaets-Gate war das richtig; fuer\n// ein mandantenfaehiges Produkt ist ein verdrahteter Firmenname bei jedem\n// Mandanten ausser einem falsch — und er stand in Grussformeln, Briefkoepfen\n// und im OpenImmo-Feld <firma>, das jedes Portal anzeigt.\n//\n// Ohne Eintrag liefert diese Funktion einen LEEREN Text, keinen Beispielnamen.\n// Die aufrufende Stelle laesst die Zeile dann weg. Eine fehlende Grussformel\n// faellt auf; eine falsche nicht.\nasync function immoFirmenName(db: any, mandant: unknown): Promise<string> {\n  if (typeof mandant !== "string" || !mandant) return "";\n  const { data } = await db.from("firma_stammdaten")\n    .select("firma_name, marken_name")\n    .eq("mandant_id", mandant).eq("aktiv", true)\n    .order("sortierung", { ascending: true }).limit(1).maybeSingle();\n  return String(data?.marken_name || data?.firma_name || "").trim();\n}',
     'Helfer immoFirmenName eingezogen (Firmenname je Mandant).',
     {'projekt-interaktion', 'projekt-datei-benachrichtigung', 'projekt-login', 'projekt-nachricht-antwort', 'objekt-landing', 'eigentuemer-nachricht-senden', 'newsletter-senden', 'besichtigung-nachfassen', 'eigentuemer-benachrichtigungen-versenden', 'signatur-unterschreiben', 'signatur-token-validieren', 'bewerbertest-abrufen', 'upload_benachrichtigung_planen', 'web-lead', 'expose-erinnerung', 'mail-ki-vorschlag', 'akq-ki-vorlage'}),
    ('FORK',
     '  const { data: alle } = await admin.from("mail_postfaecher")\n    .select("*").eq("mandant_id", mandant).eq("aktiv", true)\n    .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);\n  return (alle || [])[0] || null;\n}',
     '  const { data: alle } = await admin.from("mail_postfaecher")\n    .select("*").eq("mandant_id", mandant).eq("aktiv", true)\n    .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);\n  const gewaehlt = (alle || [])[0] || null;\n  return gewaehlt ? { ...gewaehlt, firma_name: await immoFirmenName(admin, mandant) } : null;\n}',
     'Neubauportal: das Postfach bringt den Firmennamen seines Mandanten mit.',
     {'projekt-interaktion', 'projekt-login'}),
    ('FORK',
     '  if (pf) return pf;',
     '  if (pf) return { ...pf, firma_name: await immoFirmenName(admin, mandant) };',
     'Neubauportal: auch das genannte Postfach bringt den Firmennamen mit.',
     {'projekt-interaktion', 'projekt-login'}),
    ('FORK',
     '  const absName = postfach?.absender_name || "Musterhaus Immobilien GmbH";',
     '  // Der Anzeigename im Absender: erst der des Postfachs, dann der\n  // Firmenname des Mandanten. Ein verdrahteter Name waere bei jedem\n  // Mandanten ausser einem falsch.\n  const absName = postfach?.absender_name || postfach?.firma_name || "";',
     'Neubauportal: der Absendername kommt aus dem Mandanten (4x).',
     {'projekt-interaktion', 'projekt-datei-benachrichtigung', 'projekt-login', 'projekt-nachricht-antwort'}),
    ('FORK',
     '          + `Für Rückfragen stehen wir Ihnen gerne zur Verfügung!\\n\\nMit freundlichen Grüßen\\nMusterhaus Immobilien GmbH`);',
     '          + `Für Rückfragen stehen wir Ihnen gerne zur Verfügung!\\n\\nMit freundlichen Grüßen\\n${postfach?.firma_name || ""}`);',
     'Neubauportal: Grussformel mit dem Namen des Mandanten (Anmeldung).',
     {'projekt-login'}),
    ('FORK',
     '    + `F\\u00fcr R\\u00fcckfragen stehen wir Ihnen gerne zur Verf\\u00fcgung!\\n\\nMit freundlichen Gr\\u00fc\\u00dfen\\nMusterhaus Immobilien GmbH`;',
     '    + `F\\u00fcr R\\u00fcckfragen stehen wir Ihnen gerne zur Verf\\u00fcgung!\\n\\nMit freundlichen Gr\\u00fc\\u00dfen\\n${postfach?.firma_name || ""}`;',
     'Neubauportal: Grussformel mit dem Namen des Mandanten (Interaktion).',
     {'projekt-interaktion'}),
    ('FORK',
     '        + `Für Rückfragen stehen wir Ihnen gerne zur Verfügung.\\n\\nMit freundlichen Grüßen\\nMusterhaus Immobilien GmbH`;',
     '        + `Für Rückfragen stehen wir Ihnen gerne zur Verfügung.\\n\\nMit freundlichen Grüßen\\n${postfach?.firma_name || ""}`;',
     'Neubauportal: Grussformel mit dem Namen des Mandanten (Dateimeldung).',
     {'projekt-datei-benachrichtigung'}),
    ('FORK',
     '          + `Für Rückfragen stehen wir Ihnen gerne zur Verfügung.\\n\\nMit freundlichen Grüßen\\n${absenderName}\\nMusterhaus Immobilien GmbH`);',
     '          + `Für Rückfragen stehen wir Ihnen gerne zur Verfügung.\\n\\nMit freundlichen Grüßen\\n${absenderName}${firmaName ? "\\n" + firmaName : ""}`);',
     'Neubauportal: Grussformel mit dem Namen des Mandanten (Antwort).',
     {'projekt-nachricht-antwort'}),
    ('FORK',
     '    const absenderName = (body.absender_name || "").toString().trim().slice(0, 120) || profil?.name || "Musterhaus Immobilien";',
     '    const firmaName = await immoFirmenName(admin, z.mandant_id);\n    const absenderName = (body.absender_name || "").toString().trim().slice(0, 120) || profil?.name || firmaName;',
     'Neubauportal: der Absendername faellt auf den Firmennamen zurueck.',
     {'projekt-nachricht-antwort'}),
    ('FORK',
     '      const postfach = (postfaecher || []).find((p: any) => p.benutzer_id === user.id && p.standard_zum_senden)',
     '      const postfachRoh = (postfaecher || []).find((p: any) => p.benutzer_id === user.id && p.standard_zum_senden)',
     'Neubauportal: das Rohpostfach bekommt den Firmennamen angehaengt (1).',
     {'projekt-nachricht-antwort'}),
    ('FORK',
     '        || (postfaecher || [])[0] || null;\n      if (z.aktiv && z.email) {',
     '        || (postfaecher || [])[0] || null;\n      const postfach = postfachRoh ? { ...postfachRoh, firma_name: firmaName } : null;\n      if (z.aktiv && z.email) {',
     'Neubauportal: das Rohpostfach bekommt den Firmennamen angehaengt (2).',
     {'projekt-nachricht-antwort'}),
    ('FORK',
     '      const postfach = postfachFuerEmpfaenger(zugang.ansprechpartner_id || null, uploader, projekt?.mandant_id ?? null);',
     '      const postfachRoh = postfachFuerEmpfaenger(zugang.ansprechpartner_id || null, uploader, projekt?.mandant_id ?? null);\n      const postfach = postfachRoh\n        ? { ...postfachRoh, firma_name: await immoFirmenName(admin, projekt?.mandant_id ?? null) }\n        : null;',
     'Neubauportal: das Postfach der Dateimeldung bekommt den Firmennamen.',
     {'projekt-datei-benachrichtigung'}),
    ('FORK',
     'im Login-Fenster.\\n\\nMit freundlichen Gr\\u00fc\\u00dfen\\nMusterhaus Immobilien GmbH`);',
     'im Login-Fenster.\\n\\nMit freundlichen Gr\\u00fc\\u00dfen\\n${postfach?.firma_name || ""}`);',
     'Neubauportal: Grussformel der Hinweismail mit dem Namen des Mandanten.',
     {'projekt-interaktion'}),

    # --- Die Akquise-Praesentation: neun Ueberschriften -------------------
    # Die Unterlage, mit der sich der Makler beim Eigentuemer vorstellt. Der
    # Briefkopf stand als firma schon bereit — die Ueberschriften kannten ihn
    # nur nicht und trugen den Namen des Demo-Mandanten. Darunter auch der
    # Haftungshinweis und die Kostenzusage, also die Saetze, auf die sich der
    # Eigentuemer berufen wuerde.
    ('FORK',
     'toc.push(["01", "Musterhaus Immobilien GmbH", "Daten & Fakten',
     'toc.push(["01", firma.firma_name, "Daten & Fakten',
     'Praesentation: Inhaltsverzeichnis mit dem eigenen Namen.',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     'await divider("01", "Musterhaus Immobilien", "Immobilien.", ["Daten & Fakten", "Vertriebsgebiet"]);',
     'await divider("01", firma.firma_name, "Immobilien.", ["Daten & Fakten", "Vertriebsgebiet"]);',
     'Praesentation: Trennseite mit dem eigenen Namen.',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     'kopf("Musterhaus Immobilien GmbH", "Unser Immobilienbüro.");',
     'kopf(firma.firma_name, "Unser Immobilienbüro.");',
     'Praesentation: Seitenkopf "Unser Immobilienbuero".',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     'kopf("Musterhaus Immobilien GmbH", "Unser Vertriebsgebiet.", true);',
     'kopf(firma.firma_name, "Unser Vertriebsgebiet.", true);',
     'Praesentation: Seitenkopf "Unser Vertriebsgebiet".',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     'kopf("Musterhaus Immobilien GmbH", "Warum der Verkauf mit uns den Unterschied macht.", true);',
     'kopf(firma.firma_name, "Warum der Verkauf mit uns den Unterschied macht.", true);',
     'Praesentation: Seitenkopf "Warum der Verkauf mit uns".',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     '["Fotografien", "Professionelle & hochwertige Fotografien nach Musterhaus Immobilien Richtlinien."],',
     '["Fotografien", "Professionelle & hochwertige Fotografien nach unseren Richtlinien."],',
     'Praesentation: Leistungszeile ohne Firmennamen — "unseren" sagt dasselbe.',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     'para("Eigentümern entstehen während der gesamten Vermarktung durch Musterhaus Immobilien keinerlei Kosten',
     'para("Eigentümern entstehen während der gesamten Vermarktung durch " + firma.firma_name + " keinerlei Kosten',
     'Praesentation: Kostenhinweis mit dem eigenen Namen.',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     'Die Unterlage wurde von Musterhaus Immobilien GmbH sorgfältig erstellt',
     'Die Unterlage wurde von " + firma.firma_name + " sorgfältig erstellt',
     'Praesentation: Haftungshinweis mit dem eigenen Namen.',
     {'mpe-pdf-erzeugen'}),
    ('FORK',
     'Drittanbieterquellen übernimmt Musterhaus Immobilien GmbH keine Haftung.',
     'Drittanbieterquellen übernimmt " + firma.firma_name + " keine Haftung.',
     'Praesentation: Haftungsausschluss fuer Drittdaten mit dem eigenen Namen.',
     {'mpe-pdf-erzeugen'}),

    # --- Der Maklervertrag: Briefkopf und zeichnender Vertreter -----------
    # Zwei Dinge an einer Stelle. docs/OFFEN.md, Punkt 3 hielt fest, dass der
    # Maklervertrag ohne Firmenkopf entsteht, weil die Standorttabelle beim
    # Neutralisieren geleert wurde. Und im Vertrag stand ein ERFUNDENER
    # Geschaeftsfuehrer — in der Zustimmungsklausel ("vertreten durch ..."),
    # unter der Unterschrift und im Widerrufsformular.
    #
    # Ein Vertrag mit erfundenem Aussteller ist schlimmer als keiner. Fehlen
    # Firmenname oder Geschaeftsfuehrer, wird deshalb keiner erzeugt.
    ('FORK',
     'const STANDORTE: Record<string, { name: string; firma: string; strasse: string; plzOrt: string; stadt: string }> = {\n  standard: { name: "", firma: "", strasse: "", plzOrt: "", stadt: "" },',
     '// Die Vorlage trug die drei Standorte der Referenz hier als Tabelle. Sie ist\n// beim Neutralisieren geleert worden, und damit entstand der Maklervertrag\n// OHNE Briefkopf (docs/OFFEN.md, Punkt 3). Jetzt kommen die Werte aus\n// firma_stammdaten des Mandanten, dem der Vertrag gehoert.\n//\n// vertreter: der gesetzliche Vertreter, der den Vertrag zeichnet. Hier stand\n// ein ERFUNDENER Name — in einem Maklervertrag, in der Zustimmungsklausel\n// ("vertreten durch ...") und unter der Unterschrift. CLAUDE.md verbietet\n// erfundene Daten; ein erfundener Vertreter in einem Vertrag ist davon der\n// schwerste Fall.\ntype ImmoStandort = { name: string; firma: string; strasse: string; plzOrt: string; stadt: string; vertreter: string; email: string; datenschutz: string };\nconst STANDORT_LEER: ImmoStandort = { name: "", firma: "", strasse: "", plzOrt: "", stadt: "", vertreter: "", email: "", datenschutz: "" };\nasync function immoStandort(db: any, mandant: unknown, slug: unknown): Promise<ImmoStandort> {\n  if (typeof mandant !== "string" || !mandant) return STANDORT_LEER;\n  let frage = db.from("firma_stammdaten")\n    .select("firma_name, marken_name, strasse, plz, ort, email, geschaeftsfuehrer, slug, url_datenschutz")\n    .eq("mandant_id", mandant).eq("aktiv", true);\n  if (typeof slug === "string" && slug && slug !== "standard") frage = frage.eq("slug", slug);\n  const { data } = await frage.order("sortierung", { ascending: true }).limit(1).maybeSingle();\n  if (!data) return STANDORT_LEER;\n  return {\n    name: String(data.marken_name || data.firma_name || "").trim(),\n    firma: String(data.firma_name || "").trim(),\n    strasse: String(data.strasse || "").trim(),\n    plzOrt: `${data.plz || ""} ${data.ort || ""}`.trim(),\n    stadt: String(data.ort || "").trim(),\n    vertreter: String(data.geschaeftsfuehrer || "").trim(),\n    email: String(data.email || "").trim(),\n    datenschutz: String(data.url_datenschutz || "").trim(),\n  };\n}\nconst STANDORTE: Record<string, ImmoStandort> = {\n  standard: STANDORT_LEER,',
     'Maklervertrag: der Briefkopf kommt aus den Stammdaten des Mandanten.',
     {'vertrag-pdf'}),
    ('FORK',
     '    const standort = STANDORTE[vertrag.standort || "standard"] || STANDORTE.standard;',
     '    const standort = await immoStandort(admin, vertrag.mandant_id, vertrag.standort);\n    // Ein Maklervertrag ohne Briefkopf und ohne zeichnenden Vertreter darf\n    // nicht zu einem Kunden. Lieber eine klare Meldung als ein Dokument,\n    // das im Streitfall keinen Aussteller hat.\n    if (!standort.firma || !standort.vertreter) {\n      return antwort({ ok: false, fehler: "Fuer diesen Mandanten fehlen Firmenname oder Geschaeftsfuehrer in den Stammdaten. Ohne beides wird kein Maklervertrag erzeugt." }, 400);\n    }',
     'Maklervertrag: ohne Briefkopf und Vertreter kein Dokument.',
     {'vertrag-pdf'}),
    ('FORK',
     'function buildAgbAbsaetze(standort: typeof STANDORTE["standard"], mitSalvatorischerKlausel: boolean): Absatz[] {',
     'function buildAgbAbsaetze(standort: ImmoStandort, mitSalvatorischerKlausel: boolean): Absatz[] {',
     'Maklervertrag: Typverweis der AGB.',
     {'vertrag-pdf'}),
    ('FORK',
     'function buildMaklervertragAbsaetze(vertrag: any, standort: typeof STANDORTE["standard"]): Absatz[] {',
     'function buildMaklervertragAbsaetze(vertrag: any, standort: ImmoStandort): Absatz[] {',
     'Maklervertrag: Typverweis des Vertrags.',
     {'vertrag-pdf'}),
    ('FORK',
     'function buildWiderrufAbsaetze(standort: typeof STANDORTE["standard"]): Absatz[] {',
     'function buildWiderrufAbsaetze(standort: ImmoStandort): Absatz[] {',
     'Maklervertrag: Typverweis der Widerrufsbelehrung.',
     {'vertrag-pdf'}),
    ('FORK',
     'function buildMusterWiderrufAbsaetze(standort: typeof STANDORTE["standard"]): Absatz[] {',
     'function buildMusterWiderrufAbsaetze(standort: ImmoStandort): Absatz[] {',
     'Maklervertrag: Typverweis des Widerrufsformulars.',
     {'vertrag-pdf'}),
    ('FORK',
     'function buildVollmachtAbsaetze(vertrag: any, standort: typeof STANDORTE["standard"]): Absatz[] {',
     'function buildVollmachtAbsaetze(vertrag: any, standort: ImmoStandort): Absatz[] {',
     'Maklervertrag: Typverweis der Vollmacht.',
     {'vertrag-pdf'}),
    ('FORK',
     'vertreten durch Lasse Musterhaus, ${standort.strasse}',
     'vertreten durch ${standort.vertreter}, ${standort.strasse}',
     'Maklervertrag: die Zustimmungsklausel nennt den wirklichen Vertreter.',
     {'vertrag-pdf'}),
    ('FORK',
     '  a.push({ text: "Lasse Musterhaus", noJustify: true, spaceAfter: 10 });',
     '  a.push({ text: standort.vertreter, noJustify: true, spaceAfter: 10 });',
     'Maklervertrag: die Unterschrift traegt den wirklichen Vertreter.',
     {'vertrag-pdf'}),
    ('FORK',
     '  a.push({ text: "Lasse Musterhaus", noJustify: true });',
     '  a.push({ text: standort.vertreter, noJustify: true });',
     'Maklervertrag: Vertreter im Widerrufsformular und in der Vollmacht (2x).',
     {'vertrag-pdf'}),
    ('FORK',
     '  a.push({ text: "info@immooffice.example", noJustify: true, spaceAfter: 8 });',
     '  a.push({ text: standort.email, noJustify: true, spaceAfter: 8 });',
     'Maklervertrag: die Adresse im Widerrufsformular ist die des Mandanten.',
     {'vertrag-pdf'}),
    ('FORK',
     '        [standort.name, standort.firma, "Lasse Musterhaus"],',
     '        [standort.name, standort.firma, standort.vertreter],',
     'Maklervertrag: der Unterschriftenblock nennt den wirklichen Vertreter.',
     {'vertrag-pdf'}),

    ('FORK',
     'const STANDORTE: Record<string, { name: string; firma: string; strasse: string; plzOrt: string; stadt: string }> = {\n  standard: { name: "", firma: "", strasse: "", plzOrt: "", stadt: "" },\n};',
     '// Wie in vertrag-pdf: der Briefkopf kommt aus firma_stammdaten des\n// Mandanten, und vertreter ist der wirkliche Geschaeftsfuehrer statt eines\n// erfundenen Namens. Hier wiegt es doppelt: diese Funktion startet den\n// SIGNATURVORGANG — was hier steht, unterschreibt der Kunde.\ntype ImmoStandort = { name: string; firma: string; strasse: string; plzOrt: string; stadt: string; vertreter: string; email: string; datenschutz: string };\nconst STANDORT_LEER: ImmoStandort = { name: "", firma: "", strasse: "", plzOrt: "", stadt: "", vertreter: "", email: "", datenschutz: "" };\nasync function immoStandort(db: any, mandant: unknown, slug: unknown): Promise<ImmoStandort> {\n  if (typeof mandant !== "string" || !mandant) return STANDORT_LEER;\n  let frage = db.from("firma_stammdaten")\n    .select("firma_name, marken_name, strasse, plz, ort, email, geschaeftsfuehrer, slug, url_datenschutz")\n    .eq("mandant_id", mandant).eq("aktiv", true);\n  if (typeof slug === "string" && slug && slug !== "standard") frage = frage.eq("slug", slug);\n  const { data } = await frage.order("sortierung", { ascending: true }).limit(1).maybeSingle();\n  if (!data) return STANDORT_LEER;\n  return {\n    name: String(data.marken_name || data.firma_name || "").trim(),\n    firma: String(data.firma_name || "").trim(),\n    strasse: String(data.strasse || "").trim(),\n    plzOrt: `${data.plz || ""} ${data.ort || ""}`.trim(),\n    stadt: String(data.ort || "").trim(),\n    vertreter: String(data.geschaeftsfuehrer || "").trim(),\n    email: String(data.email || "").trim(),\n    datenschutz: String(data.url_datenschutz || "").trim(),\n  };\n}\nconst STANDORTE: Record<string, ImmoStandort> = {\n  standard: STANDORT_LEER,\n};',
     'Signaturvorgang: der Briefkopf kommt aus den Stammdaten des Mandanten.',
     {'signatur-vorgang-starten'}),
    ('FORK',
     '    const standort = STANDORTE[vertrag.standort || "standard"] || STANDORTE.standard;',
     '    const standort = await immoStandort(admin, vertrag.mandant_id, vertrag.standort);\n    // Ein Dokument, das unterschrieben werden soll, braucht einen\n    // Aussteller. Fehlt er, entsteht kein Vorgang.\n    if (!standort.firma || !standort.vertreter) {\n      return antwort({ ok: false, fehler: "Fuer diesen Mandanten fehlen Firmenname oder Geschaeftsfuehrer in den Stammdaten. Ohne beides wird kein Signaturvorgang gestartet." }, 400);\n    }',
     'Signaturvorgang: ohne Aussteller kein Vorgang.',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'function buildAgbAbsaetze(standort: typeof STANDORTE["standard"], mitSalvatorischerKlausel: boolean): Absatz[] {',
     'function buildAgbAbsaetze(standort: ImmoStandort, mitSalvatorischerKlausel: boolean): Absatz[] {',
     'Signaturvorgang: Typverweis AgbAbsaetze',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'function buildMaklervertragAbsaetze(vertrag: any, standort: typeof STANDORTE["standard"]): Absatz[] {',
     'function buildMaklervertragAbsaetze(vertrag: any, standort: ImmoStandort): Absatz[] {',
     'Signaturvorgang: Typverweis MaklervertragAbsaetze',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'function buildVollmachtAbsaetze(vertrag: any, standort: typeof STANDORTE["standard"]): Absatz[] {',
     'function buildVollmachtAbsaetze(vertrag: any, standort: ImmoStandort): Absatz[] {',
     'Signaturvorgang: Typverweis VollmachtAbsaetze',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'function buildObjektnachweisHauptteil(objektnachweis: any, standort: typeof STANDORTE["standard"], verkaeuferNamen: string[]): Absatz[] {',
     'function buildObjektnachweisHauptteil(objektnachweis: any, standort: ImmoStandort, verkaeuferNamen: string[]): Absatz[] {',
     'Signaturvorgang: Typverweis ObjektnachweisHauptteil',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'function buildObjektnachweisWiderruf(standort: typeof STANDORTE["standard"]): Absatz[] {',
     'function buildObjektnachweisWiderruf(standort: ImmoStandort): Absatz[] {',
     'Signaturvorgang: Typverweis ObjektnachweisWiderruf',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'function buildObjektnachweisAgb(standort: typeof STANDORTE["standard"]): Absatz[] {',
     'function buildObjektnachweisAgb(standort: ImmoStandort): Absatz[] {',
     'Signaturvorgang: Typverweis ObjektnachweisAgb',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'const MAKLER_NAME             = "Lasse Musterhaus";',
     '// Der erfundene Name ist weg. Wer zeichnet, steht in den Stammdaten des\n// Mandanten; die Bausteine unten bekommen ihn ueber standort.vertreter.\nconst MAKLER_NAME             = "";',
     'Signaturvorgang: kein erfundener Maklername mehr.',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'vertreten durch Lasse Musterhaus, ${standort.strasse}',
     'vertreten durch ${standort.vertreter}, ${standort.strasse}',
     'Signaturvorgang: die Zustimmungsklausel nennt den wirklichen Vertreter.',
     {'signatur-vorgang-starten'}),
    ('FORK',
     '  a.push({ text: "Lasse Musterhaus", spaceAfter: 10 });',
     '  a.push({ text: standort.vertreter, spaceAfter: 10 });',
     'Signaturvorgang: die Unterschrift traegt den wirklichen Vertreter.',
     {'signatur-vorgang-starten'}),
    ('FORK',
     '  a.push({ text: "Lasse Musterhaus" });',
     '  a.push({ text: standort.vertreter });',
     'Signaturvorgang: Vertreter im Widerrufsformular und in der Vollmacht (2x).',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'vertreten durch ${MAKLER_NAME}, ${standort.strasse}',
     'vertreten durch ${standort.vertreter}, ${standort.strasse}',
     'Signaturvorgang: Objektnachweis-Zustimmung nennt den wirklichen Vertreter.',
     {'signatur-vorgang-starten'}),
    ('FORK',
     '  a.push({ text: MAKLER_NAME });',
     '  a.push({ text: standort.vertreter });',
     'Signaturvorgang: Objektnachweis-Unterschrift mit dem wirklichen Vertreter.',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'while (sigSize > 14 && sicherBreite(sigFont, MAKLER_NAME, sigSize) > feldBreite - 16) sigSize -= 1;\n'
     '        drawSicher(MAKLER_NAME, {',
     'while (sigSize > 14 && sicherBreite(sigFont, standort.vertreter, sigSize) > feldBreite - 16) sigSize -= 1;\n'
     '        drawSicher(standort.vertreter, {',
     'Signaturvorgang: die vorgesetzte Unterschrift traegt den wirklichen Namen.',
     {'signatur-vorgang-starten'}),
    ('FORK',
     'drawSicher(fix(`${MAKLER_NAME} (Makler)`), {',
     'drawSicher(fix(`${standort.vertreter} (Makler)`), {',
     'Signaturvorgang: die Zeile unter der Unterschrift ebenso.',
     {'signatur-vorgang-starten'}),
    ('FORK',
     '// Der erfundene Name ist weg. Wer zeichnet, steht in den Stammdaten des\n'
     '// Mandanten; die Bausteine unten bekommen ihn ueber standort.vertreter.\n'
     'const MAKLER_NAME             = "";\n',
     '',
     'Signaturvorgang: die Konstante MAKLER_NAME entfaellt ganz.',
     {'signatur-vorgang-starten'}),

    # --- Nachricht an den Eigentuemer und die oeffentliche Objektseite ----
    ('FORK',
     '    const { data: profil } = await supabase.from("profiles").select("role, name").eq("id", userData.user.id).maybeSingle();',
     '    const { data: profil } = await supabase.from("profiles").select("role, name, mandant_id").eq("id", userData.user.id).maybeSingle();',
     'Eigentuemer-Nachricht: das Profil gibt seinen Mandanten mit.',
     {'eigentuemer-nachricht-senden'}),
    ('FORK',
     '    const absender = profil.name || "Musterhaus Immobilien GmbH";',
     '    const firmaName = await immoFirmenName(supabase, profil.mandant_id);\n    const absender = profil.name || firmaName;',
     'Eigentuemer-Nachricht: der Absender faellt auf den Firmennamen zurueck.',
     {'eigentuemer-nachricht-senden'}),
    ('FORK',
     '    const fromName = gewaehlt?.absender_name || absender || Deno.env.get("SMTP_FROM_NAME") || "Musterhaus Immobilien GmbH";',
     '    const fromName = gewaehlt?.absender_name || absender || firmaName || Deno.env.get("SMTP_FROM_NAME") || "";',
     'Eigentuemer-Nachricht: der Anzeigename ohne verdrahteten Namen.',
     {'eigentuemer-nachricht-senden'}),
    ('FORK',
     '        await sende(e.email, "Eine Nachricht von Musterhaus Immobilien", textBody, htmlBody);',
     '        await sende(e.email, firmaName ? `Eine Nachricht von ${firmaName}` : "Eine Nachricht von Ihrem Makler", textBody, htmlBody);',
     'Eigentuemer-Nachricht: der Betreff nennt den eigenen Mandanten.',
     {'eigentuemer-nachricht-senden'}),
    ('FORK',
     '      const { htmlBody, textBody } = buildMail({ begruessung, text, absender, portalUrl, anhaenge });',
     '      const { htmlBody, textBody } = buildMail({ begruessung, text, absender, firmaName, portalUrl, anhaenge });',
     'Eigentuemer-Nachricht: der Firmenname geht in den Mailbau.',
     {'eigentuemer-nachricht-senden'}),
    ('FORK',
     'function buildMail(opts: { begruessung: string; text: string; absender: string; portalUrl: string; anhaenge: Array<{ name: string }> })',
     'function buildMail(opts: { begruessung: string; text: string; absender: string; firmaName: string; portalUrl: string; anhaenge: Array<{ name: string }> })',
     'Eigentuemer-Nachricht: der Mailbau kennt den Firmennamen.',
     {'eigentuemer-nachricht-senden'}),
    ('FORK',
     '\\u2014 ${escapeHtml(opts.absender)}, Musterhaus Immobilien GmbH</p>',
     '\\u2014 ${escapeHtml(opts.absender)}${opts.firmaName ? ", " + escapeHtml(opts.firmaName) : ""}</p>',
     'Eigentuemer-Nachricht: der Fuss nennt den eigenen Mandanten.',
     {'eigentuemer-nachricht-senden'}),
    ('FORK',
     '  const firma = firmaRow || { firma_name: "Musterhaus Immobilien GmbH", strasse: "", plz: "", ort: "", email: "info@immooffice.example" };',
     '  // Ohne Stammdaten bleiben die Felder leer. Der Rueckfall trug bisher den\n  // Namen und die Platzhalteradresse des Demo-Mandanten — auf der\n  // oeffentlichen Objektseite eines fremden Maklers.\n  const firma = firmaRow || { firma_name: "", strasse: "", plz: "", ort: "", email: "" };',
     'Objektseite: kein verdrahteter Rueckfall fuer die Firma (2x).',
     {'objekt-landing'}),
    ('FORK',
     '  const quellen = await quellenPaket(db, im, faq);',
     '  const quellen = await quellenPaket(db, im, faq);\n  const firmaName = await immoFirmenName(db, im.mandant_id);',
     'Objektseite: der Firmenname fuer die Antwort-KI.',
     {'objekt-landing'}),
    ('FORK',
     '  const system = `Du bist der Objekt-Assistent von Musterhaus Immobilien GmbH auf der persönlichen Objektseite',
     '  const system = `Du bist der Objekt-Assistent von ${firmaName || "einem Immobilienmakler"} auf der persönlichen Objektseite',
     'Objektseite: die Systemvorgabe nennt den eigenen Mandanten.',
     {'objekt-landing'}),
    ('FORK',
     '  const quellen = await quellenPaket(db, im, teamFaq || []);',
     '  const quellen = await quellenPaket(db, im, teamFaq || []);\n  const firmaName = await immoFirmenName(db, im.mandant_id);',
     'Objektseite: der Firmenname fuer die FAQ-KI.',
     {'objekt-landing'}),
    ('FORK',
     'zu einer Immobilie von Musterhaus Immobilien GmbH (${artText}',
     'zu einer Immobilie von ${firmaName || "einem Immobilienmakler"} (${artText}',
     'Objektseite: auch die zweite Systemvorgabe.',
     {'objekt-landing'}),

    # --- Die letzten Rueckfaelle: Grussformeln und Briefkoepfe ------------
    # Fast alle haben schon eine richtige Quelle (Makler, Postfach, firma)
    # und fallen nur am Ende der Kette auf den verdrahteten Namen zurueck.
    # Dort steht jetzt entweder der Wert aus den Stammdaten oder eine
    # neutrale Wendung — "Ihr Maklerteam" ist bei jedem Mandanten richtig.
    ('FORK',
     '      const firmenZeile = firma.firma_name === "Musterhaus Immobilien GmbH Berlin GmbH"\n        ? "Musterhaus Immobilien GmbH Berlin GmbH"\n        : "Musterhaus Immobilien GmbH";',
     '      // Diese drei Zeilen verglichen den Firmennamen mit einem festen Wert\n      // und schrieben danach SO ODER SO einen festen Namen — die Firma aus\n      // den Stammdaten kam in der Schlussformel der Rechnung nie vor.\n      const firmenZeile = firma.firma_name || "";',
     'Rechnung: die Schlussformel nennt die wirkliche Firma.',
     {'rechnung-pdf-erzeugen'}),
    ('FORK',
     '      stamm?.firma_name || "Musterhaus Immobilien GmbH",',
     '      stamm?.firma_name || "",',
     'Wertindikation: kein verdrahteter Briefkopf-Rueckfall.',
     {'akq-wertindikation-pdf'}),
    ('FORK',
     '      "Grundlage dieser Indikation sind Vergleichswerte aus dem eigenen Objektbestand von Musterhaus &",',
     '      "Grundlage dieser Indikation sind Vergleichswerte aus dem eigenen Objektbestand von",',
     'Wertindikation: der Quellenhinweis ohne Firmennamen.',
     {'akq-wertindikation-pdf'}),
    ('FORK',
     '      const firma = firmaRow?.firma_name || "Musterhaus Immobilien GmbH";',
     '      const firma = firmaRow?.firma_name || "";',
     'Einladung nachfassen: kein verdrahteter Briefkopf-Rueckfall.',
     {'eigentuemer-einladung-nachfassen'}),
    ('FORK',
     '      creator: firma.firma_name || "Musterhaus Immobilien",',
     '      creator: firma.firma_name || "",',
     'Reservierung: der Dokument-Urheber ist die wirkliche Firma.',
     {'reservierung-word-erzeugen'}),
    ('FORK',
     '    const von = `${pf.absender_name || "Musterhaus Immobilien GmbH"} <${pf.email_adresse}>`;',
     '    const von = `${pf.absender_name || await immoFirmenName(db, pf.mandant_id)} <${pf.email_adresse}>`;',
     'Newsletter: der Absendername kommt aus dem Mandanten.',
     {'newsletter-senden'}),
    ('FORK',
     '${makler?.name || pf.absender_name || "Ihr Musterhaus Immobilien Team"}`;',
     '${makler?.name || pf.absender_name || "Ihr Maklerteam"}`;',
     'Suchkriterien-Newsletter: neutrale Grussformel als letzter Rueckfall.',
     {'suchkriterien-newsletter'}),
    ('FORK',
     '${(makler && makler.name) || postfach.absender_name || "Ihr Musterhaus Immobilien Team"}`;',
     '${(makler && makler.name) || postfach.absender_name || "Ihr Maklerteam"}`;',
     'Terminerinnerung: neutrale Grussformel als letzter Rueckfall.',
     {'termin-erinnerung'}),
    ('FORK',
     'makler: makler.name || "Ihr Musterhaus Immobilien Team"',
     'makler: makler.name || "Ihr Maklerteam"',
     'Nachfassen: neutrale Grussformel als letzter Rueckfall.',
     {'besichtigung-nachfassen'}),
    ('FORK',
     '${makler?.name || firma?.firma_name || "Musterhaus Immobilien GmbH"}',
     '${makler?.name || firma?.firma_name || "Ihr Maklerteam"}',
     'Exposé-Erinnerung: neutrale Grussformel als letzter Rueckfall.',
     {'expose-erinnerung'}),
    ('FORK',
     '`${firma?.firma_name || "Musterhaus Immobilien GmbH"}',
     '`${firma?.firma_name || "Ihr Makler"}',
     'Absenderzeile ohne verdrahteten Namen (Expose-Erinnerung, Eigentuemer-Bericht).',
     {'expose-erinnerung', 'eigentuemer-report-pdf'}),
    ('FORK',
     '  const firmaFertig = firma || { firma_name: "Musterhaus Immobilien GmbH", strasse: "", plz: "", ort: "", email: "info@immooffice.example", telefon: null };',
     '  const firmaFertig = firma || { firma_name: "", strasse: "", plz: "", ort: "", email: "", telefon: null };',
     'Exposé-Freigabe: kein verdrahteter Rueckfall (Seite).',
     {'expose-freigabe'}),
    ('FORK',
     '      const firma = firmaRow || { firma_name: "Musterhaus Immobilien GmbH", strasse: "", plz: "", ort: "", email: "info@immooffice.example", telefon: null };',
     '      const firma = firmaRow || { firma_name: "", strasse: "", plz: "", ort: "", email: "", telefon: null };',
     'Exposé-Freigabe: kein verdrahteter Rueckfall (Antwort).',
     {'expose-freigabe'}),
    ('FORK',
     '"Dieser Link wurde zurückgezogen. Bitte wenden Sie sich an Musterhaus Immobilien."',
     '"Dieser Link wurde zurückgezogen. Bitte wenden Sie sich an Ihren Ansprechpartner."',
     'Bewerbertest: Meldung ohne Firmennamen (zurueckgezogen).',
     {'bewerbertest-abrufen'}),
    ('FORK',
     '"Dieser Link ist abgelaufen. Bitte wenden Sie sich an Musterhaus Immobilien."',
     '"Dieser Link ist abgelaufen. Bitte wenden Sie sich an Ihren Ansprechpartner."',
     'Bewerbertest: Meldung ohne Firmennamen (abgelaufen).',
     {'bewerbertest-abrufen'}),

    ('FORK',
     '\\u2014 ${opts.absender}, Musterhaus Immobilien GmbH\\n\\nIhr Portal:',
     '\\u2014 ${opts.absender}${opts.firmaName ? ", " + opts.firmaName : ""}\\n\\nIhr Portal:',
     'Eigentuemer-Nachricht: auch die Textfassung nennt den eigenen Mandanten.',
     {'eigentuemer-nachricht-senden'}),
    ('FORK',
     '\\n${firma?.firma_name || "Musterhaus Immobilien GmbH"}${firma ?',
     '\\n${firma?.firma_name || ""}${firma ?',
     'Exposé-Erinnerung: kein verdrahteter Firmenname im Fuss.',
     {'expose-erinnerung'}),
    ('FORK',
     'Mit freundlichen Gr\\u00fc\\u00dfen\\nMusterhaus Immobilien GmbH\n`;',
     'Mit freundlichen Gr\\u00fc\\u00dfen\\n${opts.firmaName || ""}\n`;',
     'Eigentuemer-Sammelmail: Grussformel aus dem Mandanten.',
     {'eigentuemer-benachrichtigungen-versenden'}),
    ('FORK',
     'Musterhaus Immobilien Tool`;',
     '${firmaName || "Ihr Maklerbuero"}`;',
     'Upload-Planer: der Fuss nennt den eigenen Mandanten.',
     {'upload_benachrichtigung_planen'}),
    ('FORK',
     'const ABSENDER = "Musterhaus Immobilien Website <info@immooffice.example>";',
     '// Der Absendername des Webformulars: der Mandant, dem das Formular\n// gehoert, plus die Absenderadresse der Plattform (SPF/DKIM).\nconst ABSENDER_ADRESSE = (Deno.env.get("SMTP_FROM_EMAIL") || "").trim();',
     'Weblead: kein verdrahteter Absendername mehr.',
     {'web-lead'}),
    ('FORK',
     '      body: JSON.stringify({ from: ABSENDER, to: empfaenger, reply_to: l.email || undefined,',
     '      body: JSON.stringify({ from: `${(await immoFirmenName(db, l.mandant_id)) || "Website"} <${ABSENDER_ADRESSE}>`, to: empfaenger, reply_to: l.email || undefined,',
     'Weblead: der Absender traegt den Namen des Mandanten.',
     {'web-lead'}),
    ('FORK',
     '  const system = `Du schreibst für ${p.makler} von Musterhaus Immobilien GmbH  eine kurze persönliche Nachfass-E-Mail',
     '  const system = `Du schreibst für ${p.makler}${p.firmaName ? ` von ${p.firmaName}` : ""} eine kurze persönliche Nachfass-E-Mail',
     'Nachfassen: die Systemvorgabe nennt den eigenen Mandanten.',
     {'besichtigung-nachfassen'}),
    ('FORK',
     '              + `Mit freundlichen Gr\\u00fc\\u00dfen\\nMusterhaus Immobilien GmbH`',
     '              + `Mit freundlichen Gr\\u00fc\\u00dfen\\n${firmaName || ""}`',
     'Signatur: Grussformel der Erinnerungsmail aus dem Mandanten.',
     {'signatur-unterschreiben'}),
    ('FORK',
     '            + `Mit freundlichen Gr\\u00fc\\u00dfen\\nMusterhaus Immobilien GmbH`,',
     '            + `Mit freundlichen Gr\\u00fc\\u00dfen\\n${firmaName || ""}`,',
     'Signatur: Grussformel der Abschlussmail aus dem Mandanten.',
     {'signatur-unterschreiben'}),
    ('FORK',
     'async function entwurfSchreiben(p: { anrede: string; kunde: string; objekt: string; adresse: string; vermarktung: string; besichtigung: string; makler: string }):',
     'async function entwurfSchreiben(p: { anrede: string; kunde: string; objekt: string; adresse: string; vermarktung: string; besichtigung: string; makler: string; firmaName: string }):',
     'Nachfassen: die Entwurfsfunktion kennt den Firmennamen.',
     {'besichtigung-nachfassen'}),
    ('FORK',
     'makler: makler.name || "Ihr Maklerteam"',
     'makler: makler.name || "Ihr Maklerteam", firmaName: await immoFirmenName(db, t.mandant_id)',
     'Nachfassen: der Firmenname wird durchgereicht.',
     {'besichtigung-nachfassen'}),
    ('FORK',
     '  dokumente: Array<{ name: string; kategorie: string; nachricht?: string | null }>;\n  portalUrl: string;\n}): { betreff: string; htmlBody: string; textBody: string } {',
     '  dokumente: Array<{ name: string; kategorie: string; nachricht?: string | null }>;\n  portalUrl: string;\n  firmaName: string;\n}): { betreff: string; htmlBody: string; textBody: string } {',
     'Eigentuemer-Sammelmail: der Mailbau kennt den Firmennamen.',
     {'eigentuemer-benachrichtigungen-versenden'}),
    ('FORK',
     '            dokumente: dokumente || [],\n            portalUrl,\n          });',
     '            dokumente: dokumente || [],\n            portalUrl,\n            firmaName: await immoFirmenName(supabase, mandantDesEintrags),\n          });',
     'Eigentuemer-Sammelmail: der Firmenname wird durchgereicht.',
     {'eigentuemer-benachrichtigungen-versenden'}),
    ('FORK',
     '        const anzahl = dokumente?.length ?? eintrag.anzahl_dokumente;',
     '        // Die Warteschlange traegt keinen Mandanten; er haengt am\n        // Eigentuemer, fuer den die Sammelmail entsteht.\n        const mandantDesEintrags = (await supabase.from("eigentuemer")\n          .select("mandant_id").eq("id", eintrag.eigentuemer_id).maybeSingle()).data?.mandant_id ?? null;\n        const anzahl = dokumente?.length ?? eintrag.anzahl_dokumente;',
     'Eigentuemer-Sammelmail: der Mandant kommt vom Eigentuemer.',
     {'eigentuemer-benachrichtigungen-versenden'}),
    ('FORK',
     '    if (!vorgang) throw new Error("Signatur-Vorgang nicht gefunden.");',
     '    if (!vorgang) throw new Error("Signatur-Vorgang nicht gefunden.");\n    const firmaName = await immoFirmenName(admin, vorgang.mandant_id);',
     'Signatur: der Firmenname des Vorgangs steht bereit.',
     {'signatur-unterschreiben'}),
    ('FORK',
     '    for (const ben of offene) {\n      try {',
     '    for (const ben of offene) {\n      try {\n        const firmaName = await immoFirmenName(admin, ben.mandant_id);',
     'Upload-Planer: der Firmenname des Eintrags steht bereit.',
     {'upload_benachrichtigung_planen'}),

    # --- Die Systemvorgaben der KI ---------------------------------------
    # Zwei Faelle, und sie brauchen verschiedene Antworten.
    #
    # Wo der Name die AUFGABE nicht formt — JSON aus einer Mail ziehen, einen
    # Test bewerten, eine Bildunterschrift schreiben —, faellt er ersatzlos
    # weg. Ein Name, der nichts bewirkt, ist nur eine Stelle, an der der
    # falsche stehen kann.
    #
    # Wo er die AUSGABE formt, muss der des Mandanten hinein. Das betrifft
    # claude-chat (der Assistent spricht die Mitarbeiter an), akq-ki-vorlage
    # (Akquisevorlagen tragen den Absender) und mail-ki-vorschlag — dort am
    # schwersten: die Vorgabe laesst die KI als erfundener Geschaeftsfuehrer
    # schreiben und unter dessen Namen unterzeichnen.
    ('FORK',
     'const SYSTEM = `Du liest E-Mails eines Immobilienmaklerbüros (Musterhaus Immobilien)',
     'const SYSTEM = `Du liest E-Mails eines Immobilienmaklerbüros',
     'Lead-Erkennung: die Vorgabe braucht keinen Firmennamen.',
     {'akq-mail-leads'}),
    ('FORK',
     'const SYSTEM = `Du liest Unterlagen zu einer Immobilie für ein Maklerbüro (Musterhaus Immobilien GmbH) aus.',
     'const SYSTEM = `Du liest Unterlagen zu einer Immobilie für ein Maklerbüro aus.',
     'Unterlagen-Auslese: die Vorgabe braucht keinen Firmennamen.',
     {'objekt-wissen-auslesen'}),
    ('FORK',
     'const SYSTEM_PROMPT = `Du bist Spezialist fuer Immobilien-Bewertungen bei Musterhaus Immobilien.',
     'const SYSTEM_PROMPT = `Du bist Spezialist fuer Immobilien-Bewertungen.',
     'Bewertung: die Vorgabe braucht keinen Firmennamen.',
     {'bewertung-aus-aufnahme'}),
    ('FORK',
     'const KI_SYSTEM = `Du bist Pruefer bei Musterhaus Immobilien GmbH  und bewertest den Einstellungstest',
     'const KI_SYSTEM = `Du bewertest den Einstellungstest',
     'Einstellungstest: die Vorgabe braucht keinen Firmennamen.',
     {'bewerbertest-abgeben'}),
    ('FORK',
     '  const prompt = `Du bekommst eine E-Mail an einen Immobilienmakler (Musterhaus Immobilien GmbH). Extrahiere',
     '  const prompt = `Du bekommst eine E-Mail an einen Immobilienmakler. Extrahiere',
     'Anfrage-Auslese: die Vorgabe braucht keinen Firmennamen.',
     {'mail-anfrage-verarbeiten'}),
    ('FORK',
     'Du bist der interne Exposé-Prüfer von Musterhaus Immobilien GmbH . Du machst',
     'Du bist ein interner Exposé-Prüfer. Du machst',
     'Exposé-Endkontrolle: die Vorgabe braucht keinen Firmennamen.',
     {'expose-pruefen'}),
    ('FORK',
     '    const system = `Du beschriftest Fotos und Grundrisse für ein Immobilien-Exposé von Musterhaus Immobilien GmbH. Je Bild',
     '    const system = `Du beschriftest Fotos und Grundrisse für ein Immobilien-Exposé. Je Bild',
     'Bildunterschriften: die Vorgabe braucht keinen Firmennamen.',
     {'bild-beschriften'}),
    ('FORK',
     '// Erzeugt Exposé-Texte mit Claude (Anthropic) im Stil von Musterhaus Immobilien.',
     '// Erzeugt Exposé-Texte mit Claude (Anthropic) nach den Stilregeln des Hauses.',
     'Texterzeugung: Kopfkommentar ohne Firmennamen.',
     {'generate-text'}),
    ('FORK',
     'const STIL_REGELN = `Musterhaus-Stilrichtlinien (immer einhalten):',
     'const STIL_REGELN = `Stilrichtlinien (immer einhalten):',
     'Texterzeugung: die Stilregeln heissen nicht mehr nach einer Firma.',
     {'generate-text'}),
    ('FORK',
     '      system: `Du bist Redakteur für Musterhaus Immobilien GmbH. Aus einer Branchen-Nachricht',
     '      system: `Du bist Redakteur für ein Immobilienbüro. Aus einer Branchen-Nachricht',
     'Texterzeugung: Redakteur ohne Firmennamen.',
     {'generate-text'}),
    ('FORK',
     '      system: `Du bist Social-Media-Texter für Musterhaus Immobilien GmbH.',
     '      system: `Du bist Social-Media-Texter für ein Immobilienbüro.',
     'Texterzeugung: Social-Media-Texter ohne Firmennamen (3x).',
     {'generate-text'}),
    ('FORK',
     'Erstelle EINEN Objekttitel im Musterhaus-Stil.',
     'Erstelle EINEN Objekttitel im Hausstil.',
     'Texterzeugung: Objekttitel im Hausstil (2x).',
     {'generate-text'}),
    ('FORK',
     '      system: `Du bist Texter für Musterhaus Immobilien in Mecklenburg-Vorpommern.',
     '      system: `Du bist Texter für ein Immobilienbüro.',
     'Texterzeugung: Texter ohne Firmennamen und ohne fremde Region.',
     {'generate-text'}),
    ('FORK',
     '      system: `Du bist Texter für Musterhaus Immobilien. Kurze, einprägsame Schlagzeilen.',
     '      system: `Du bist Texter für ein Immobilienbüro. Kurze, einprägsame Schlagzeilen.',
     'Texterzeugung: Schlagzeilen ohne Firmennamen.',
     {'generate-text'}),
    ('FORK',
     '      system: `Du bist Texter für Musterhaus Immobilien. Kompakte Ausstattungs-Bulletpoints.',
     '      system: `Du bist Texter für ein Immobilienbüro. Kompakte Ausstattungs-Bulletpoints.',
     'Texterzeugung: Ausstattungspunkte ohne Firmennamen.',
     {'generate-text'}),
    ('FORK',
     '    system: `Du bist Texter für Musterhaus Immobilien in Mecklenburg-Vorpommern.',
     '    system: `Du bist Texter für ein Immobilienbüro.',
     'Texterzeugung: Exposétext ohne Firmennamen und ohne fremde Region.',
     {'generate-text'}),

    ('FORK',
     'const STIL_PROFIL_LASSE = `\nDu bist Lasse Musterhaus, Geschäftsführer von Musterhaus Immobilien GmbH,\nSachverständiger für Immobilienbewertung (Bewertungsdienst) und Makler.',
     '// Die Vorgabe liess die KI als erfundener Geschaeftsfuehrer schreiben und\n// unter dessen Namen unterzeichnen — in einem Antwortentwurf, der an einen\n// Kunden geht. Wer schreibt, ist jetzt der angemeldete Nutzer; die Firma\n// kommt aus seinen Stammdaten. Beides wird beim Aufruf eingesetzt.\nconst stilProfil = (wer: string, firma: string) => `\nDu bist ${wer}${firma ? `, tätig für ${firma}` : ""},\nImmobilienmakler.',
     'Mail-Vorschlag: die KI schreibt als der angemeldete Nutzer.',
     {'mail-ki-vorschlag'}),
    ('FORK',
     'Mit freundlichen Grüßen\n\nLasse Musterhaus\n',
     'Mit freundlichen Grüßen\n\n${wer}\n',
     'Mail-Vorschlag: die Unterschrift ist die des Nutzers.',
     {'mail-ki-vorschlag'}),
    ('FORK',
     'mit "Lasse Musterhaus" enden.',
     'mit "${wer}" enden.',
     'Mail-Vorschlag: auch der Schlusshinweis nennt den Nutzer.',
     {'mail-ki-vorschlag'}),
    ('FORK',
     '    const { data: profile } = await admin.from("profiles").select("role, email").eq("id", userId).maybeSingle();',
     '    const { data: profile } = await admin.from("profiles").select("role, email, name, mandant_id").eq("id", userId).maybeSingle();',
     'Mail-Vorschlag: das Profil gibt Name und Mandant mit.',
     {'mail-ki-vorschlag'}),
    ('FORK',
     'system: STIL_PROFIL_LASSE, messages: [{ role: "user", content: userPrompt }] })',
     'system: stilProfil(wer, firmaDesNutzers), messages: [{ role: "user", content: userPrompt }] })',
     'Mail-Vorschlag: die Vorgabe wird mit Nutzer und Firma gebaut.',
     {'mail-ki-vorschlag'}),
    ('FORK',
     'system: STIL_PROFIL_LASSE, messages: [{ role: "user", content: userPrompt }, { role: "assistant", content: antwortText }',
     'system: stilProfil(wer, firmaDesNutzers), messages: [{ role: "user", content: userPrompt }, { role: "assistant", content: antwortText }',
     'Mail-Vorschlag: auch die Fortsetzung.',
     {'mail-ki-vorschlag'}),
    ('FORK',
     'regulär mit \\"Mit freundlichen Grüßen\\" und \\"Lasse Musterhaus\\" endet."',
     'regulär mit \\"Mit freundlichen Grüßen\\" und dem Namen des Absenders endet."',
     'Mail-Vorschlag: der Fortsetzungshinweis ohne erfundenen Namen.',
     {'mail-ki-vorschlag'}),
    ('FORK',
     '    const absender = mail.absender_name ? `${mail.absender_name} <${mail.absender_email}>` : (mail.absender_email || "unbekannt");',
     '    const wer = String(profile?.name || "").trim() || "der Makler";\n    const firmaDesNutzers = await immoFirmenName(admin, profile?.mandant_id);\n    const absender = mail.absender_name ? `${mail.absender_name} <${mail.absender_email}>` : (mail.absender_email || "unbekannt");',
     'Mail-Vorschlag: Nutzername und Firma stehen bereit.',
     {'mail-ki-vorschlag'}),
    ('FORK',
     'const BASIS_SYSTEM_PROMPT = `Du bist der KI-Assistent fuer das interne Tool von Musterhaus Immobilien GmbH\nDu hilfst den Mitarbeitern (Lasse Musterhaus und Team) bei taeglichen',
     '// Der Assistent gehoert dem Haus, das ihn benutzt. Der Firmenname kommt\n// beim Aufruf dazu; der erfundene Geschaeftsfuehrer ist ersatzlos weg.\nconst BASIS_SYSTEM_PROMPT = `Du bist der KI-Assistent fuer das interne Tool eines Immobilienbueros.\nDu hilfst den Mitarbeitern bei taeglichen',
     'Assistent: kein Firmenname und kein erfundener Geschaeftsfuehrer.',
     {'claude-chat'}),
    ('FORK',
     '    if (jwt) {\n      const { data: u } = await db.auth.getUser(jwt);\n      if (u?.user) {\n'
     '        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();\n'
     '        if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);\n'
     '      }\n    }',
     '    // firmaDesNutzers steht ausserhalb des Blocks: die Systemvorgabe weiter\n'
     '    // unten braucht sie, und p lebt nur hier drin.\n'
     '    let firmaDesNutzers = "";\n'
     '    if (jwt) {\n      const { data: u } = await db.auth.getUser(jwt);\n      if (u?.user) {\n'
     '        const { data: p } = await db.from("profiles").select("role, mandant_id").eq("id", u.user.id).maybeSingle();\n'
     '        if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);\n'
     '        firmaDesNutzers = await immoFirmenName(db, p.mandant_id);\n'
     '      }\n    }',
     'Akquisevorlage: der Firmenname des Nutzers steht der Vorgabe zur Verfuegung.',
     {'akq-ki-vorlage'}),
    ('FORK',
     '    const system = `Du schreibst Vorlagen fuer die Verkaeufer-Akquise von Musterhaus Immobilien GmbH .',
     '    const system = `Du schreibst Vorlagen fuer die Verkaeufer-Akquise${firmaDesNutzers ? ` von ${firmaDesNutzers}` : ""}.',
     'Akquisevorlage: die Vorgabe nennt das eigene Haus.',
     {'akq-ki-vorlage'}),
    ('FORK',
     '  const hatSig = sig && (p.text.includes(sig.slice(0, 40).trim()) || p.text.includes("Musterhaus Immobilien GmbH"));',
     '  // Die zweite Bedingung suchte einen festen Firmennamen im Text — bei\n  // jedem Mandanten ausser einem den falschen. Die Signatur des eigenen\n  // Postfachs reicht; sie steht in sig.\n  const hatSig = sig && p.text.includes(sig.slice(0, 40).trim());',
     'Automation: die Signaturerkennung ohne verdrahteten Firmennamen.',
     {'akq-automation-lauf'}),
    ('FORK',
     '        makler_name: makler?.name || "Ihr Musterhaus Immobilien Team",',
     '        makler_name: makler?.name || "Ihr Maklerteam",',
     'Automation: neutraler Team-Name als Rueckfall.',
     {'akq-automation-lauf'}),
    ('FORK',
     'Texte mit "Musterhaus Immobilien',
     'Texte mit dem Firmennamen im',
     'Mail senden: der Vermerk nennt keinen festen Firmennamen mehr.',
     {'mail-senden'}),
    ('FORK',
     'Musterhaus Immobilien positioniert sich als kompetenter, zugänglicher',
     'Das Büro positioniert sich als kompetenter, zugänglicher',
     'Texterzeugung: die Positionierung ohne Firmennamen.',
     {'generate-text'}),
    ('FORK',
     'Objekttitel im Musterhaus-Stil: energisch, konkret.',
     'Objekttitel im Hausstil: energisch, konkret.',
     'Texterzeugung: der letzte Stilverweis ohne Firmennamen.',
     {'generate-text'}),

    # =====================================================================
    # FORK — Postfaecher je Anbieter (06.10.2026)
    #
    # Ansage des Betreibers: "dass die Kunden mehrere Postfaecher anbinden
    # koennen, sei es jetzt Microsoft oder Gmail oder whatever". Mehrere
    # Postfaecher konnte die Vorlage schon; was fehlte, war die Anmeldung —
    # Microsoft hat Basic Auth fuer IMAP/SMTP abgeschaltet, Google baut die
    # App-Passwoerter ab. Beide nehmen OAuth2 mit XOAUTH2.
    #
    # Abruf und Versand bleiben IMAP und SMTP, fuer alle drei Anbieter. Nur
    # die Anmeldung wechselt. Die Anbieter-Schicht selbst liegt in
    # supabase/eigene-beilagen/<funktion>/anbieter.ts und wird nach dem
    # Neuaufbau dazugelegt (siehe die Beilagen am Ende dieses Skripts).
    # =====================================================================
    ('FORK',
     'import { createClient } from "jsr:@supabase/supabase-js@2";',
     'import { createClient } from "jsr:@supabase/supabase-js@2";\n// Die Anbieter-Schicht der Postfaecher (Microsoft, Google, IMAP). Sie\n// liegt als Beilage im Ordner dieser Funktion; die Quelle steht in\n// supabase/eigene-beilagen/mail-postfach-pull/anbieter.ts.\nimport { xoauth2, zugriffstoken } from "./anbieter.ts";',
     'Postfach-Anbieter: die Anbieter-Schicht wird eingebunden.',
     {'mail-postfach-pull'}),
    ('FORK',
     '  constructor(private host: string, private port: number, private user: string, private pass: string) {}',
     '  // Bei einem OAuth2-Postfach steht hier die fertige XOAUTH2-Zeichenkette\n  // statt eines Passworts. Microsoft nimmt LOGIN nicht mehr an, Google\n  // nur noch mit App-Passwort — der Abruf selbst bleibt derselbe.\n  constructor(private host: string, private port: number, private user: string,\n              private pass: string, private xoauth: string | null = null) {}',
     'Postfach-Anbieter: SimpleImap nimmt eine XOAUTH2-Zeichenkette.',
     {'mail-postfach-pull'}),
    ('FORK',
     '  async login(): Promise<void> {\n    const escUser = this.user.replace(/"/g, \'\\\\"\');\n    const escPass = this.pass.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, \'\\\\"\');\n    await this.cmd(`LOGIN "${escUser}" "${escPass}"`);\n  }',
     '  async login(): Promise<void> {\n    if (this.xoauth) {\n      // AUTHENTICATE XOAUTH2 laeuft anders als LOGIN: lehnt der Server ab,\n      // schickt er "+" und eine base64-kodierte Begruendung und wartet\n      // dann auf eine LEERE Zeile. Ohne sie bleibt die Verbindung haengen,\n      // bis der Zeitgeber zuschlaegt — und die Begruendung waere verloren.\n      const tag = this.nextTag();\n      await this.send(`${tag} AUTHENTICATE XOAUTH2 ${this.xoauth}`);\n      const fertig = new RegExp(`^${tag} (OK|NO|BAD)`, "m");\n      let antwort = await this.readUntil(new RegExp(`(^${tag} (OK|NO|BAD))|(^\\\\+)`, "m"), 20000);\n      if (!fertig.test(antwort)) {\n        await this.send("");\n        antwort += await this.readUntil(fertig, 20000);\n      }\n      if (new RegExp(`^${tag} (NO|BAD)`, "m").test(antwort)) {\n        throw new Error(`XOAUTH2 abgelehnt: ${antwort.substring(0, 300)}`);\n      }\n      return;\n    }\n    const escUser = this.user.replace(/"/g, \'\\\\"\');\n    const escPass = this.pass.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, \'\\\\"\');\n    await this.cmd(`LOGIN "${escUser}" "${escPass}"`);\n  }',
     'Postfach-Anbieter: Anmeldung per XOAUTH2, wenn ein Token da ist.',
     {'mail-postfach-pull'}),
    ('FORK',
     '        if (!pf.imap_server || !pf.imap_passwort_verschluesselt) {\n          log.fehler_text = "imap_server oder Passwort fehlt";\n          ergebnisse.push(log);\n          continue;\n        }\n\n        const passwort = await entschluessele(pf.imap_passwort_verschluesselt);',
     '        // Drei Anbieter, ein Abruf. "imap" meldet sich mit Passwort an,\n        // "microsoft" und "google" mit einem Token, das hier bei Bedarf\n        // erneuert wird. Scheitert das, bleibt der Grund am Postfach\n        // stehen (oauth_fehler) — die Oberflaeche bietet dann "Verbindung\n        // erneuern" an, statt den Nutzer raten zu lassen.\n        const perOauth = pf.anbieter && pf.anbieter !== "imap";\n        if (!pf.imap_server || (!perOauth && !pf.imap_passwort_verschluesselt)) {\n          log.fehler_text = "imap_server oder Passwort fehlt";\n          ergebnisse.push(log);\n          continue;\n        }\n\n        let passwort = "";\n        let xoauthZeile: string | null = null;\n        if (perOauth) {\n          try {\n            const t = await zugriffstoken(pf);\n            if (t.neu) await admin.from("mail_postfaecher").update(t.neu).eq("id", pf.id);\n            xoauthZeile = xoauth2(t.adresse, t.token);\n          } catch (e) {\n            const grund = e instanceof Error ? e.message : String(e);\n            await admin.from("mail_postfaecher")\n              .update({ oauth_fehler: grund.slice(0, 500) }).eq("id", pf.id);\n            log.fehler_text = grund;\n            ergebnisse.push(log);\n            continue;\n          }\n        } else {\n          passwort = await entschluessele(pf.imap_passwort_verschluesselt);\n        }',
     'Postfach-Anbieter: Zugangsdaten je Anbieter, Token wird erneuert.',
     {'mail-postfach-pull'}),
    ('FORK',
     '          imap = new SimpleImap(pf.imap_server, Number(pf.imap_port || 993), pf.imap_user || pf.email_adresse, passwort);',
     '          imap = new SimpleImap(pf.imap_server, Number(pf.imap_port || 993),\n                                pf.imap_user || pf.email_adresse, passwort, xoauthZeile);',
     'Postfach-Anbieter: die IMAP-Verbindung bekommt das Token.',
     {'mail-postfach-pull'}),
    ('FORK',
     'import { createClient } from "jsr:@supabase/supabase-js@2";',
     'import { createClient } from "jsr:@supabase/supabase-js@2";\n// Die Anbieter-Schicht der Postfaecher. Quelle:\n// supabase/eigene-beilagen/mail-senden/anbieter.ts.\nimport { zugriffstoken } from "./anbieter.ts";',
     'Postfach-Anbieter: die Anbieter-Schicht wird eingebunden (Versand).',
     {'mail-senden'}),
    ('FORK',
     '    const perSmtp = async () => {\n      if (!postfach.smtp_passwort_verschluesselt) throw new Error("Postfach hat kein SMTP-Passwort hinterlegt");\n      let passwort: string;\n      try { passwort = await entschluessele(postfach.smtp_passwort_verschluesselt); }\n      catch (e) { throw new Error("Passwort konnte nicht entschluesselt werden"); }\n      const istSslDirekt = Number(postfach.smtp_port) === 465 || postfach.smtp_security === "ssl";\n      const transporter = nodemailer.createTransport({\n        host: postfach.smtp_server,\n        port: Number(postfach.smtp_port),\n        secure: istSslDirekt,\n        auth: { user: postfach.smtp_user, pass: passwort },',
     '    const perSmtp = async () => {\n      // Drei Anbieter, ein Versand. Microsoft und Google nehmen kein\n      // Passwort mehr an; dort wird ein Zugriffs-Token geholt (und bei\n      // Bedarf erneuert) und per XOAUTH2 angemeldet. nodemailer kann das\n      // selbst, wenn man ihm Typ und Token gibt.\n      const perOauth = postfach.anbieter && postfach.anbieter !== "imap";\n      let anmeldung: Record<string, unknown>;\n      if (perOauth) {\n        const t = await zugriffstoken(postfach);\n        if (t.neu) await admin.from("mail_postfaecher").update(t.neu).eq("id", postfach.id);\n        anmeldung = { type: "OAuth2", user: t.adresse, accessToken: t.token };\n      } else {\n        if (!postfach.smtp_passwort_verschluesselt) throw new Error("Postfach hat kein SMTP-Passwort hinterlegt");\n        let passwort: string;\n        try { passwort = await entschluessele(postfach.smtp_passwort_verschluesselt); }\n        catch (e) { throw new Error("Passwort konnte nicht entschluesselt werden"); }\n        anmeldung = { user: postfach.smtp_user, pass: passwort };\n      }\n      const istSslDirekt = Number(postfach.smtp_port) === 465 || postfach.smtp_security === "ssl";\n      const transporter = nodemailer.createTransport({\n        host: postfach.smtp_server,\n        port: Number(postfach.smtp_port),\n        secure: istSslDirekt,\n        auth: anmeldung,',
     'Postfach-Anbieter: SMTP meldet sich per XOAUTH2 an, wenn kein Passwort da ist.',
     {'mail-senden'}),
    ('FORK',
     '    const reihenfolge = ics && postfach.smtp_passwort_verschluesselt ? [perSmtp, perResend] : [perResend, perSmtp];',
     '    // Ein eigenes Postfach ist immer der bessere Absender: die Mail steht\n    // danach im Gesendet-Ordner des Nutzers und kommt von seiner Adresse.\n    // "Hat ein Passwort" war dafuer das Kennzeichen — ein OAuth-Postfach\n    // hat keines und waere damit aussortiert worden.\n    const eigenerVersand = !!postfach.smtp_passwort_verschluesselt\n      || (postfach.anbieter && postfach.anbieter !== "imap");\n    const reihenfolge = ics && eigenerVersand ? [perSmtp, perResend] : [perResend, perSmtp];',
     'Postfach-Anbieter: auch ein OAuth-Postfach sendet zuerst selbst.',
     {'mail-senden'}),
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
                    schluessel = (grund, muster, bemerkung)
                    zaehler[schluessel] = zaehler.get(schluessel, 0) + n
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
                    schluessel = (grund, muster, bemerkung)
                    zaehler[schluessel] = zaehler.get(schluessel, 0) + n
                    # Auch eine NACHBESSERN-Regel darf die Vorlage erweitern.
                    # Das stand bisher nur an der Schleife darueber — solange
                    # jede betroffene Funktion ohnehin eine FORK-Regel aus
                    # ERSETZUNGEN abbekam, fiel es nicht auf.
                    if grund == 'FORK':
                        erweitert = True
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
            #
            # 30.09.2026 von 140 auf 170: Phase 2.4 zieht in rechnung-pdf-
            # erzeugen den Mandanten VOR den Briefkopf. Die Bremse hat bei
            # +144 angehalten und damit genau getan, wozu sie da ist — die
            # Zahl war gewollt, also steigt die Grenze, nicht die Toleranz.
            zeilen_delta = inhalt.count('\n') - zeilen_vorher
            unten, oben = (-2, 170) if erweitert else (-2, 0)
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
    # 30.09.2026: der Schluessel traegt die Bemerkung mit. Vorher stand nur
    # (grund, muster) darin — und zwei Regeln mit demselben Muster (etwa zwei
    # Helfer, die beide hinter die supabase-js-Zeile gespleisst werden)
    # teilten sich einen Zaehler. Die Ausgabe zeigte dann 59x statt 4x, und
    # schlimmer: eine Regel, die NIE greift, fiel nicht in die Liste
    # "ohne Treffer", weil die andere den Zaehler schon gefuellt hatte.
    for grund, muster, _, bemerkung in alle_regeln:
        n = zaehler.get((grund, muster, bemerkung), 0)
        if n:
            print(f'  [{grund:7s}] {n:4d}x  {bemerkung}')
    nie = [b for g, m, _, b in alle_regeln if not zaehler.get((g, m, b))]
    if nie:
        print(f'\n  {len(nie)} Regel(n) ohne Treffer — Vorlage hat sich geaendert '
              f'oder die Regel ist ueberholt:')
        for b in nie:
            print(f'    - {b}')
    print(f'\n[PHASE14] {len(gestrichen)} Funktionen gestrichen: {", ".join(gestrichen)}')
    # --- Eigene Funktionen des Forks dazu -------------------------------
    # Nach dem Neuaufbau, nicht davor: rmtree raeumt oben alles weg.
    eigene = []
    if EIGENE.is_dir():
        for ordner in sorted(EIGENE.iterdir()):
            if not ordner.is_dir():
                continue
            ziel_ordner = ZIEL / ordner.name
            if ziel_ordner.exists():
                sys.exit(f'ABBRUCH: {ordner.name} gibt es in supabase/eigene UND in '
                         'der Vorlage. Eine geaenderte Fassung einer Funktion der '
                         'Vorlage gehoert als Regel in dieses Skript, nicht nach '
                         'supabase/eigene (siehe dortige README).')
            shutil.copytree(ordner, ziel_ordner)
            eigene.append(ordner.name)
    if eigene:
        print(f'\n[EIGEN] {len(eigene)} Funktion(en) aus supabase/eigene/ '
              f'uebernommen: {", ".join(eigene)}')
        print('        Sie haben keine Entsprechung in der Vorlage und werden '
              'deshalb\n        nicht gegen sie verglichen.')

    # --- Beilagen zu uebernommenen Funktionen ---------------------------
    # Gemeinsamer Quelltext, der in den Ordner einer Funktion der Vorlage
    # gehoert. Jede Datei wird genannt: eine Beilage, die stillschweigend
    # dazukommt, ist eine Aenderung an einer fremden Funktion, von der
    # niemand weiss.
    beilagen = []
    if BEILAGEN.is_dir():
        for ordner in sorted(BEILAGEN.iterdir()):
            if not ordner.is_dir():
                continue
            ziel_ordner = ZIEL / ordner.name
            if not ziel_ordner.is_dir():
                sys.exit(f'ABBRUCH: Beilage fuer {ordner.name}, aber diese '
                         'Funktion gibt es nicht. Entweder ist der Name falsch '
                         'oder die Funktion ist gestrichen (ENTFAELLT).')
            for datei in sorted(ordner.rglob('*')):
                if datei.is_dir():
                    continue
                ziel = ziel_ordner / datei.relative_to(ordner)
                ziel.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(datei, ziel)
                beilagen.append(f'{ordner.name}/{datei.relative_to(ordner)}')
    if beilagen:
        print(f'\n[BEILAGE] {len(beilagen)} Datei(en) zu Funktionen der Vorlage '
              f'gelegt:')
        for b in beilagen:
            print(f'          {b}')

    print(f'{uebernommen} Funktionen aus der Vorlage und {len(eigene)} eigene '
          f'geschrieben nach {ZIEL}')


if __name__ == '__main__':
    main()
