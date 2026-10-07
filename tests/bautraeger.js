// Bautraeger-Paket v2 (fork_84–86): halten Functions, Oberflaeche und Regeln,
// was der Auftrag verlangt? Statische Pruefungen — die Datenbank prueft
// tests/bautraeger.sql.
//
//   * Mails an Kaeufer nie automatisch; Handwerker-Mails automatisch, Mahnung
//     je Projekteinstellung; Zahlungsanforderung per Klick.
//   * Erledigung nur mit Foto; der Handwerker sieht keine Kaeuferdaten; der
//     QR-Code ohne Anmeldung nur Projekt und Einheit.
//   * Der Mandant kommt aus dem JWT, die Kennung wird dagegen geprueft.
//   * KI nur fuer Diktat -> Mangeltext, Gewerk nur aus der Liste, abgerechnet
//     ueber die Beilage.
//   * Kein neues Protokoll-Modul: die Haken sitzen in den Schritten der Vorlage.
const fs = require('fs');
let fehler = 0, n = 0;
function melde(name, ok, bem) { n++; if (!ok) { fehler++; console.log('  [FEHLER] ' + name + (bem ? ' — ' + bem : '')); } }
const lies = (p) => fs.readFileSync(p, 'utf8');
const ab = lies('supabase/eigene/abnahme-abschliessen/index.ts');
const hw = lies('supabase/eigene/handwerker-portal/index.ts');
const fr = lies('supabase/eigene/maengel-fristen/index.ts');
const mt = lies('supabase/eigene/mangel-text/index.ts');
const qr = lies('supabase/eigene/einheit-qr/index.ts');
const bl = lies('supabase/eigene-beilagen/_bautraeger/bautraeger.ts');

// --- Functions -------------------------------------------------------------
melde('abnahme-abschliessen: Mandant aus dem JWT, Protokoll dagegen geprueft', /immoMandantSichern/.test(ab) && /pr\.mandant_id !== wer\.mandant/.test(ab));
melde('abnahme-abschliessen: nur Neubau-Typen', /startsWith\("neubau_"\)/.test(ab));
melde('abnahme-abschliessen: PDF am Kaeufer, aber NICHT freigegeben', /zugang_id: pr\.zugang_id \|\| null,[\s\S]{0,300}freigegeben: false/.test(ab));
melde('abnahme-abschliessen: Maengel nur einmal (db_id)', /if \(m\.db_id\) continue;/.test(ab));
melde('abnahme-abschliessen: Fotos ins Storage, nicht mehr im Protokoll', /delete m\.foto_data_urls/.test(ab));
melde('abnahme-abschliessen: je Handwerker EINE Sammelmail', /jeHandwerker/.test(ab) && /Sammelmail/.test(ab));
melde('abnahme-abschliessen: Token-Link ohne Anmeldung', /\?handwerker=\$\{portalToken\}/.test(ab));
melde('abnahme-abschliessen: keine Mail an den Kaeufer', !/zugang\.email/.test(ab.replace(/\/\/.*$/gm, '')) || !/mailen\([^)]*zugang\.email/.test(ab));
melde('abnahme-abschliessen: Glocke, Push, interne Mail an die Verwaltung', /glocke\(db, mandant, "abnahme_abgeschlossen"/.test(ab) && /await push\(p\.id/.test(ab) && /verwaltung\(db, mandant/.test(ab));
melde('abnahme-abschliessen: To-do aus der Vorlage mit Verknuepfung auf Mangel, Protokoll, Einheit', /maengel_vorlage_sicherstellen/.test(ab) && /objekt_typ: "mangel"/.test(ab) && /objekt_typ: "protokoll"/.test(ab) && /objekt_typ: "einheit"/.test(ab));
melde('abnahme-abschliessen: Vermerke am Objekt und an den Kontakten', /vermerk\(db, mandant, \{ immobilie_id/.test(ab) && /vermerk\(db, mandant, \{ kontakt_id: k/.test(ab));
melde('abnahme-abschliessen: Kundenmeldung beauftragen laeuft denselben Weg', /aktion === "mangel_beauftragen"/.test(ab) && /mangel_zurueck/.test(ab));
melde('handwerker-portal: Token benennt die Zeile, Mandant aus der Zeile', /portal_token/.test(hw) && /handwerker_token/.test(hw) && /mandant: String\(hk\.mandant_id\)/.test(hw));
melde('handwerker-portal: nur eigene Maengel', /m\.projekt_kontakt_id !== g\.kontakt\.id/.test(hw));
melde('handwerker-portal: Erledigung nur mit Foto', /Zur Erledigung gehört mindestens ein Foto/.test(hw));
melde('handwerker-portal: Erledigt und Rueckfrage legen ein To-do fuer die Bauleitung an', /todoAn\(`Erledigung prüfen/.test(hw) && /todoAn\(`Rückfrage/.test(hw));
melde('handwerker-portal: keine Kaeuferdaten in der Antwort', !/anzeigename|zugaenge\)\.select|kontakte"\)\.select\("[^"]*email/.test(hw));
melde('handwerker-portal: Verlauf gefiltert, keine internen Notizen', /filter\(\(v: any\) => \[/.test(hw));
melde('maengel-fristen: drei Tage vorher Erinnerung, einmal', /tageDazu\(stichtag, 3\)/.test(fr) && /!m\.erinnert_am/.test(fr));
melde('maengel-fristen: Mahnung als Entwurf im To-do, automatisch nur je Projekt', /projekt\.mahnung_automatisch && mail/.test(fr) && /entwurf_betreff: gesendet \? null : betreff/.test(fr));
melde('maengel-fristen: Mahnung nur einmal', /!m\.mahnung_am/.test(fr) && /mahnung_am: new Date\(\)/.test(fr));
melde('maengel-fristen: je Zeile im Mandanten der Zeile', /eq\("mandant_id", mandant\)/.test(fr));
melde('mangel-text: rechnet ueber die Beilage ab', /kiAbrechnen\(req, "mangel_text"/.test(mt) && /let credits: Abrechnung \| null = null;/.test(mt));
melde('mangel-text: Gewerk nur aus der Liste', /gewerke\.includes\(String\(roh\.gewerk\)\)/.test(mt));
melde('mangel-text: Systemprompt verbietet Erfinden', /Keine Masse, Ursachen, Bewertungen oder Fristen dazuerfinden/.test(mt));
melde('mangel-text: Modell aus der KI-Steuerung, claude-sonnet-4-6 als Vorgabe', /abr\.modell\(MODELL\)/.test(mt) && /claude-sonnet-4-6/.test(mt));
melde('einheit-qr: nur Projekt, Ort, Einheit, Geschoss, Bautraeger', /we_nr, geschoss, projekt_id, mandant_id/.test(qr) && !/anzeigename|kaufpreis|zugaenge/.test(qr));
melde('Beilage: ohne Absender keine Mail, kein Platzhalter-Rueckfall', /kein Absender/.test(bl) && !/immooffice\.example/.test(bl));
melde('Beilage: Vermerk ohne Bezug steht nirgends', /if \(!v\.immobilie_id && !v\.kontakt_id\) return;/.test(bl));

// --- Oberflaeche -----------------------------------------------------------
const basis = lies('src/eigene/bautraeger-0-basis.js'), prot = lies('src/eigene/bautraeger-protokoll.js'), cock = lies('src/eigene/bautraeger-cockpit.js'), port = lies('src/eigene/bautraeger-portal.js');
melde('13 MaBV-Abschnitte, Summe der Hoechstsaetze 100 %', (() => { const m = basis.match(/prozent: ([\d.]+)/g) || []; return m.length === 13 && Math.abs(m.reduce((s, x) => s + Number(x.replace('prozent: ', '')), 0) - 100) < 0.01; })());
melde('Vorbelegung wird einmal gelesen und dann geloescht', /window\._immoProtokollVorbelegung = null; return v \|\| \{\}/.test(basis));
melde('Protokoll: Adressabgleich ist Vorschlag, nicht Zuordnung', /objekte_zu_adresse/.test(prot) && /Übernehmen/.test(prot));
melde('Protokoll: Raeume aus der Einheit, nur wenn noch keine da sind', /\(!d\.raeume \|\| !d\.raeume\.length\) && e\.raeume/.test(prot));
melde('Protokoll: Handwerker folgt dem Gewerk, bleibt aenderbar', /kontakte\.find\(function \(k\) \{ return k\.gewerk === g; \}\)/.test(prot));
melde('Protokoll: Diktat ueber notiz-transkribieren, dann mangel-text', /notiz-transkribieren/.test(basis) && /rufen\("mangel-text"/.test(prot));
melde('Protokoll: Abschluss speichert, erzeugt das PDF der Vorlage und ruft abnahme-abschliessen', /p\.speichern\(true\)/.test(prot) && /p\.pdfErzeugen\(satz\)/.test(prot) && /rufen\("abnahme-abschliessen", \{ protokoll_id/.test(prot));
melde('Protokoll: An Kaeufer senden = Composer-Entwurf, Datei wird erst dann freigegeben', /window\._epMailAn = \{ an: zugang\.email/.test(prot) && /freigegeben: true/.test(prot) && /setView\("posteingang"\)/.test(prot));
melde('Cockpit: Zahlungsanforderung per Klick, als Entwurf, angefordert_am', /zahlungsanforderung\(r\)/.test(cock) && /angefordert_am: B\.heute\(\)/.test(cock) && /Entwurf/.test(cock));
melde('Cockpit: hoechstens sieben Raten', /zahlungsplan\.length >= 7/.test(cock));
melde('Cockpit: Bautenstand -> Baufortschritt nur per Klick', /alsUpdate\(bautenstandForm\)/.test(cock) && /Nicht veröffentlichen/.test(cock));
melde('Cockpit: Abnahmetermin art „Abnahme“, Protokoll vorbelegt vom Termin', /art: "Abnahme"/.test(cock) && /protokollStarten\("neubau_abnahme", t\)/.test(cock));
melde('Cockpit: QR-Druck A6 mit Token-Link', /format: "a6"/.test(cock) && /\?qr=/.test(cock));
melde('Cockpit: bettet den Protokoll-Editor der Vorlage ein (kein neues Modul)', /E\(UebergabeprotokollEditor, \{ user: p\.user/.test(cock));
melde('Cockpit: Einstellungen Gewerke, Standardfrist, Mahnung automatisch', /mahnung_automatisch/.test(cock) && /frist_standard_tage/.test(cock) && /gewerke/.test(cock));
melde('Portal: Handwerker-Seite ersetzt die Anwendung bei ?handwerker=', /handwerker=/.test(port) && /immo-handwerker/.test(port));
melde('Portal: QR ohne Anmeldung zeigt nur Hinweis, danach Wohnungsakte', /einheit-qr/.test(port) && /_immoNeubauStart = \{ projekt_id/.test(port));
melde('Portal: Erledigung ohne Foto nicht absendbar', /aktion === "erledigt" && !w\.fotos\.length/.test(port));

// --- Regeln, Erzeuger, Konfiguration ---------------------------------------------
const zer = lies('scripts/oberflaeche-zerlegen.py');
for (const r of ['Protokoll: Vorbelegung aus der Wohnungsakte.', 'Protokoll: Verknuepfung mit Objekt, Einheit und Kontakten.', 'Protokoll: Vorabnahme, Abnahme, Nachabnahme.', 'Protokoll: „+ Mangel“ je Raum.', 'Protokoll: Abnahme abschliessen statt Eigentuemerportal.', 'Protokoll-PDF: Maengel je Raum.', 'Neubau: Reiter Cockpit.', 'Neubau: „Akte“ an jeder Einheit.', 'Neubau: Start aus QR-Code oder Benachrichtigung.']) {
  melde('Regel vorhanden: ' + r, zer.includes(r));
}
const app = fs.existsSync('src/app/anwendung.js') ? lies('src/app/anwendung.js') : '';
if (app) {
  melde('anwendung.js: Haken sind drin (zerlegen gelaufen)', /window\.ImmoRaumMaengel && React\.createElement/.test(app) && /window\.ImmoNeubauCockpit/.test(app) && /window\.ImmoAbnahmeAbschluss/.test(app) && /window\.ImmoProtokollVerknuepfung/.test(app) && /window\.ImmoMaengelInsPdf/.test(app));
}
const erz = lies('scripts/neutralisieren-funktionen.py');
melde('Erzeuger: Beilage bautraeger.ts an drei Functions, credits.ts an mangel-text', /'_bautraeger\/bautraeger\.ts'\] = \{[\s\S]*?'abnahme-abschliessen',[\s\S]*?'handwerker-portal',[\s\S]*?'maengel-fristen'/.test(erz) && /'mangel-text',\s*#/.test(erz));
melde('Erzeuger: projekt-daten liefert Maengel und Protokolle des Kaeufers (additiv)', /maengel: immoMaengel,/.test(erz) && /protokolle: immoProtokolle,/.test(erz));
const cfg = lies('supabase/config.toml');
melde('config: verify_jwt true fuer abnahme-abschliessen, mangel-text, maengel-fristen', /\[functions\.abnahme-abschliessen\]\nverify_jwt = true/.test(cfg) && /\[functions\.mangel-text\]\nverify_jwt = true/.test(cfg) && /\[functions\.maengel-fristen\]\nverify_jwt = true/.test(cfg));
melde('config: verify_jwt false nur fuer handwerker-portal und einheit-qr', /\[functions\.handwerker-portal\]\nverify_jwt = false/.test(cfg) && /\[functions\.einheit-qr\]\nverify_jwt = false/.test(cfg));
melde('Gates kennen die oeffentlichen und angemeldeten Endpunkte', /'handwerker-portal': \('portal_token'/.test(lies('tests/funktionen-oeffentlich.py')) && /'einheit-qr': \('qr_token'/.test(lies('tests/funktionen-oeffentlich.py')) && /'abnahme-abschliessen': \('immoMandantSichern'/.test(lies('tests/funktionen-angemeldet.py')));
const mig = lies('supabase/migrations/20261007300000_fork_84_bautraeger_verknuepfungen.sql') + lies('supabase/migrations/20261007310000_fork_85_bautraeger_maengel_workflow.sql') + lies('supabase/migrations/20261007320000_fork_86_bautraeger_qr_bautenstand.sql');
melde('Migrationen additiv: kein drop table, kein drop column', !/drop table(?! if exists public\.projekt_bautenstand)|drop column/i.test(mig.replace(/^--.*$/gm, '')));
melde('Migrationen: Cron maengel-fristen taeglich mit anon-Bearer wie die Vorlage', /cron\.schedule\('maengel-fristen-taeglich', '20 6 \* \* \*'/.test(mig) && /name = 'anon_key'/.test(mig));

if (fehler) { console.log(`  ${fehler} von ${n} Pruefungen gescheitert.`); process.exit(1); }
console.log(`  [ok] ${n} Pruefungen: Abnahme, Maengel-Workflow, Handwerker-Link, Cockpit, QR und MaBV\n       halten die Regeln des Auftrags — Kaeufer-Mails nie automatisch, Geld per Klick.`);
