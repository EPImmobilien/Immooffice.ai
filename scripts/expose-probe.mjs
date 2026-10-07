// Erzeugt ein Expose aus NACHGEBAUTEN Objektdaten — zum Nachsehen, was bei
// einem duenn gepflegten Objekt wirklich auf dem Papier landet.
//
//   node scripts/expose-probe.mjs                 alle Vorlagen, mageres Objekt
//   node scripts/expose-probe.mjs studio          nur eine
//   node scripts/expose-probe.mjs studio --voll   mit allem, was es gibt
//   node scripts/expose-probe.mjs studio --ohne-logo
//   node scripts/expose-probe.mjs buehne --farben=#2D2A4A,#F08A5D
//
// Unterschied zu scripts/expose-vorschau.mjs: die Vorschau nimmt die
// Demodaten der Prototypen und vergleicht mit den Referenz-PDFs. Die liefern
// jedes Feld, jedes Bild, jeden Grundriss. Der Alltag tut das nicht — am
// 06.10.2026 kam ein Expose zurueck, in dem die Grundriss-Seite leer war,
// der Markenname ueber seinen Rahmen lief und die Bildunterschriften etwas
// anderes behaupteten als das Bild zeigte. Nichts davon konnte die Vorschau
// zeigen, weil in ihren Daten alles steht.
//
// Darum geht dieses Werkzeug durch aufbereiten() — denselben Weg wie die
// Edge Function — und fuettert es mit Zeilen, wie sie aus einer frisch
// angelegten Immobilie kommen. Die Daten sind erfunden und neutral; ein
// echtes Objekt oder ein echter Mandant steht hier nicht.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WURZEL = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const SCHRIFTEN = path.join(WURZEL, 'assets', 'fonts', 'expose');
const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');

const argumente = process.argv.slice(2);
const schalter = new Set(argumente.filter((a) => a.startsWith('--')));
const gewuenscht = argumente.filter((a) => !a.startsWith('--'));
const voll = schalter.has('--voll');
const ohneLogo = schalter.has('--ohne-logo');
// Ein langer Titel und eine lange Beschreibung — so, wie ein gepflegtes
// Objekt im Betrieb aussieht. Die Vorlagen sind gegen die kurzen Demodaten
// der Prototypen vermessen; am 06.10.2026 lief damit der Titel ueber die
// halbe Titelseite und die Beschreibung ueber die Fusszeile.
const lang = schalter.has('--lang');
// Ein Logo als WORTZEICHEN statt als Bildzeichen. Viele Makler haben kein
// quadratisches Signet, sondern einen Schriftzug — in einem quadratischen
// Rahmen wird der zu einem Streifen von wenigen Punkten Hoehe. Mit diesem
// Schalter traegt die Probe ein breites Logo und sagt den Vorlagen auch,
// dass es breit ist.
const wortmarke = schalter.has('--wortmarke');
// Wie viele Fotos und Grundrisse das Objekt hat (fork_64). Ein Makler
// laedt dreissig Bilder hoch, nicht sieben; die festen Seiten der Vorlagen
// halten fuenf bis sieben, den Rest tragen die wiederholten Seiten. Ohne
// Angabe bleibt es bei dem, was die Probe vorher lieferte.
const zahlAus = (vorsatz, vorgabe) => {
  const a = argumente.find((x) => x.startsWith(vorsatz + '='));
  const n = a ? Number(a.slice(vorsatz.length + 1)) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : vorgabe;
};
const anzahlFotos = zahlAus('--fotos', 13);
// Die beiden Markenfarben des Mandanten (--farben=#2D2A4A,#F08A5D). Ohne
// Angabe ein dunkles Rot und ein Grau — mit Absicht nicht die Farben eines
// Prototyps, damit die Ableitung geprueft wird und nicht der Zufall. Fuer
// den Vergleich mit einem Referenz-PDF braucht man aber dessen Farben.
const farbenArg = argumente.find((x) => x.startsWith('--farben='));
const [ciPrimaer, ciAkzent] = farbenArg
  ? farbenArg.slice('--farben='.length).split(',').map((f) => f.trim())
  : ['#980101', '#C2C2BD'];
const anzahlGrundrisse = zahlAus('--grundrisse', voll ? 2 : 0);
const zielOrdner = process.env.PROBE_ZIEL || path.join(os.tmpdir(), 'expose-probe');

const namen = (gewuenscht.length ? gewuenscht : fs.readdirSync(VORLAGEN)
  .filter((f) => f.endsWith('.json') && f !== 'schema.json')
  .map((f) => f.replace(/\.json$/, '')));

// --- Renderer uebersetzen --------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-probe-'));
for (const datei of ['rendern.ts', 'pdf.ts', 'aufbereiten.ts']) {
  execFileSync('tsc', [path.join(WURZEL, 'packages', 'expose-renderer', 'src', datei),
                       '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020',
                       '--skipLibCheck', '--esModuleInterop'],
               { stdio: 'pipe', cwd: os.tmpdir() });
}
const { rendern } = require(path.join(tmp, 'rendern.js'));
const { zuPdf } = require(path.join(tmp, 'pdf.js'));
const { aufbereiten } = require(path.join(tmp, 'aufbereiten.js'));
const { metrikLesen } = require(path.join(tmp, 'schrift.js'));

const schriften = new Map();
for (const datei of fs.readdirSync(SCHRIFTEN).filter((f) => f.endsWith('.ttf'))) {
  const schnitt = datei.replace(/\.ttf$/, '');
  schriften.set(schnitt,
    metrikLesen(new Uint8Array(fs.readFileSync(path.join(SCHRIFTEN, datei))), schnitt));
}

// --- Ein winziges, gueltiges JPEG (8x8) ------------------------------------
// Dasselbe wie in tests/expose-funktion.js: ein echtes Objektfoto im
// Repository waere Referenzmaterial.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIf'
  + 'IiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7'
  + 'Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAIAAgDASIA'
  + 'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA'
  + 'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3'
  + 'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm'
  + 'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA'
  + 'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx'
  + 'BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK'
  + 'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3'
  + 'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1aiii'
  + 'gD//2Q==', 'base64');

// --- Die nachgebauten Zeilen -----------------------------------------------
// Ein Haus, wie es nach einer halben Stunde Pflege in der Maske steht:
// Eckdaten ja, Beschreibung ein Satz, keine Grundrisse, keine Highlights,
// keine Entfernungen. Der Markenname ist absichtlich lang — kurze Namen
// passen in jeden Rahmen, lange zeigen, wo einer zu klein ist.
const MANDANT = '11111111-2222-3333-4444-555555555555';
const firma = {
  id: 'f1', mandant_id: MANDANT, firma_name: 'Musterhaus Projektgesellschaft mbH',
  marken_name: 'MUSTERHAUS PROJEKTE', marken_linie: voll ? 'Haeuser mit Haltung' : null,
  strasse: 'Musterweg 1', plz: '20095', ort: 'Hamburg',
  telefon: '040 1234560', email: 'info@musterhaus.example', web: 'musterhaus.example',
  registergericht: 'AG Hamburg', hrb: 'HRB 12345', ust_id: 'DE123456789',
  geschaeftsfuehrer: 'Alex Muster', ci_primaer: ciPrimaer, ci_akzent: ciAkzent,
  logo_pfad: 'logos/muster.png',
};
const ansprechpartner = {
  id: 'p1', mandant_id: MANDANT, name: 'Alex Muster', funktion: 'Immobilienmakler/in',
  telefon: '040 1234561', mobil: voll ? '0170 1234567' : null,
  email: 'alex.muster@musterhaus.example', firma_id: 'f1',
};
const immobilie = {
  id: 'o1', mandant_id: MANDANT, immo_nr: '1', objektart: 'Haus', vertragsart: 'verkauf',
  objekttitel: lang
    ? 'Modernisiert und bezugsfertig – Bungalow mit Fussbodenheizung in ruhiger Lage'
    : 'Freistehendes Haus mit Garten',
  bezeichnung: 'Freistehendes Haus mit Garten',
  strasse: 'Musterweg', hausnummer: '12', plz: '17166', ort: 'Musterstadt',
  ortsteil: voll ? 'Seeviertel' : null,
  wohnflaeche: 123, nutzflaeche: 45, grundstueck: 654, zimmer: 5, schlafzimmer: 4,
  badezimmer: 3, baujahr: 2016, angebotspreis: 1325000, provision_aussen: '3,57',
  // Kennwert 46 und Klasse C passen ABSICHTLICH nicht zusammen: 46 kWh/(m2*a)
  // ist Klasse A. Ein vertippter Energieausweis ist der Alltag, und der
  // Renderer soll es melden statt stillschweigend das eine oder das andere
  // zu zeichnen. tests/expose-probe.js kennt diese beiden Warnungen und
  // laesst sie durch; jede WEITERE Kuerzung ist ein Befund.
  energieausweis_typ: 'Verbrauchsausweis', energie_kennwert: '46', energie_klasse: 'C',
  energie_warmwasser: false, heizungsart: voll ? 'Waermepumpe' : null,
  energie_traeger: voll ? 'Strom' : null,
  zustand: voll ? 'gepflegt' : null, verfuegbar_ab: voll ? 'nach Vereinbarung' : null,
  beschreibung_objekt: lang
    ? ('Dieses gepflegte Einfamilienhaus liegt in einer ruhigen Sackgasse am '
       + 'Stadtrand und ueberzeugt durch seine naturnahe Umgebung sowie den '
       + 'freien Blick ins Gruene. Das in massiver Bauweise errichtete '
       + 'Wohnhaus steht auf einem grosszuegigen Grundstueck mit gepflegtem '
       + 'Garten. Eine ueberdachte Terrasse mit hochwertigem Plattenbelag '
       + 'erweitert den Wohnbereich nach aussen.\n\n'
       + 'Die Wohnflaeche verteilt sich komfortabel auf einer Ebene. Ein '
       + 'zentraler Flur erschliesst saemtliche Raeume. Das grosszuegige '
       + 'Wohnzimmer ueberzeugt mit bodentiefen Terrassentueren und einem '
       + 'angenehmen Lichteinfall; die hochwertige Einbaukueche wurde erst '
       + 'kuerzlich neu eingebaut und verfuegt ueber moderne Markengeraete.\n\n'
       + 'Ein besonderes Highlight ist das vollstaendig sanierte Badezimmer. '
       + 'Im Zuge der Modernisierung wurden saemtliche Wasserleitungen und '
       + 'Anschluesse erneuert. Das moderne Duschbad verfuegt ueber eine '
       + 'bodengleiche Glasdusche, ein wandhaengendes WC, einen '
       + 'grosszuegigen Waschtisch sowie einen Handtuchheizkoerper. Fuer '
       + 'hohen Wohnkomfort sorgt die im gesamten Haus vorhandene '
       + 'Fussbodenheizung.')
    : voll
    ? 'Das Haus liegt am Ende einer ruhigen Strasse.\n\nIm Erdgeschoss liegen '
      + 'Wohnen, Kochen und Essen in einem Raum; nach Sueden oeffnet sich die '
      + 'Terrasse zum Garten. Das Obergeschoss nimmt vier Zimmer auf.'
    : 'Das Haus liegt am Ende einer ruhigen Strasse.',
  beschreibung_lage: voll ? 'Musterstadt liegt an der Bahnstrecke nach Rostock.' : null,
  beschreibung_ausstattung: voll ? 'Parkett, Fussbodenheizung, Markise.' : null,
  // Die Listen sind jsonb-Spalten der Immobilie, keine eigenen Tabellen im
  // Sinne von aufbereiten(): dort stehen sie genau so.
  expose_highlights: voll
    ? [{ zeile1: 'Ruhige Lage', zeile2: 'Sackgasse ohne Durchgangsverkehr' },
       { zeile1: 'Garten nach Sueden', zeile2: '654 m2 mit altem Baumbestand' }] : null,
  lage_distanzen: voll ? [{ label: 'Bahnhof', wert: '2,4' }] : null,
  expose_wege: voll ? [{ ziel: 'Schule', minuten: 6 }] : null,
  raumaufteilung: voll ? [{ name: 'Wohnen', flaeche: 38, geschoss: 'Erdgeschoss' },
                          { name: 'Kueche', flaeche: 12.5, geschoss: 'Erdgeschoss' },
                          { name: 'Schlafen', flaeche: 16, geschoss: '1. OG' },
                          { name: 'Flur', flaeche: 6 }] : null,
  laufende_kosten: voll ? [{ bezeichnung: 'Hausgeld', betrag: 95 }] : null,
  expose_ausstattung_gruppen: voll
    ? [{ titel: 'Innen', punkte: ['Parkett', 'Fussbodenheizung'] },
       { titel: 'Aussen', punkte: ['Terrasse', 'Garten nach Sueden', 'Carport'] }] : null,
};

// Ein einfarbiges PNG beliebiger Groesse, zur Laufzeit gebaut. So kann die
// Probe ein breites Logo mitbringen, ohne eine Bilddatei im Repository.
function pngFlaeche(breite, hoehe, r, g, b) {
  const zlib = require('node:zlib');
  const roh = Buffer.alloc((breite * 3 + 1) * hoehe);
  for (let y = 0; y < hoehe; y++) {
    const zeile = y * (breite * 3 + 1);
    roh[zeile] = 0;                        // Filter "keiner"
    for (let x = 0; x < breite; x++) {
      roh[zeile + 1 + x * 3] = r;
      roh[zeile + 2 + x * 3] = g;
      roh[zeile + 3 + x * 3] = b;
    }
  }
  const crcTabelle = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTabelle.push(c >>> 0);
  }
  const crc = (puffer) => {
    let c = 0xffffffff;
    for (const byte of puffer) c = crcTabelle[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const block = (art, inhalt) => {
    const kopf = Buffer.alloc(4);
    kopf.writeUInt32BE(inhalt.length, 0);
    const mitte = Buffer.concat([Buffer.from(art, 'latin1'), inhalt]);
    const schluss = Buffer.alloc(4);
    schluss.writeUInt32BE(crc(mitte), 0);
    return Buffer.concat([kopf, mitte, schluss]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8; ihdr[9] = 2;                // 8 Bit je Kanal, Farbtyp RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block('IHDR', ihdr),
    block('IDAT', zlib.deflateSync(roh)),
    block('IEND', Buffer.alloc(0)),
  ]);
}

const bildWerte = {};
const bilder = new Map();
bilder.set('foto', new Uint8Array(JPEG));
bilder.set('wortmarke', new Uint8Array(pngFlaeche(360, 60, 110, 20, 20)));
// JEDES Foto bekommt eine eigene Quelle (fork_64) — dieselben Bytes, aber
// ein eigener Name. Nur so laesst sich hinterher nachzaehlen, WELCHES Foto
// auf welcher Seite steht. Mit einer gemeinsamen Quelle sah ein Expose,
// das dreimal Foto 7 zeigt, genauso aus wie eines mit 7, 8 und 9.
for (let i = 1; i <= anzahlFotos; i++) {
  const q = 'foto-' + i;
  bilder.set(q, new Uint8Array(JPEG));
  bildWerte['bild.foto.' + i] = q;
}
bildWerte['objekt.hauptbild_url'] = 'foto';
bildWerte['bild.lageplan'] = 'foto';
for (let i = 1; i <= anzahlGrundrisse; i++) {
  const q = 'grundriss-' + i;
  bilder.set(q, new Uint8Array(JPEG));
  bildWerte['bild.grundriss.' + i] = q;
}
if (voll) bildWerte['ansprechpartner.foto'] = 'foto';
if (!ohneLogo) {
  const logo = wortmarke ? 'wortmarke' : 'foto';
  bildWerte['firma.logo.hell'] = logo;
  bildWerte['firma.logo.dunkel'] = logo;
}

const daten = aufbereiten({
  immobilie, firma, ansprechpartner,
  annahmen: { notar_prozent: 2.0, zinssatz: 3.9, tilgung: 2.0, eigenkapital_prozent: 20 },
  bilder: bildWerte,
  ki_bilder: [],
  logo_form: ohneLogo ? undefined : (wortmarke ? 'breit' : 'quadratisch'),
});

// --- Rendern ----------------------------------------------------------------
const qrErzeuger = require('qrcode-generator');
const qr = (inhalt) => {
  const q = qrErzeuger(0, 'M');
  q.addData(inhalt); q.make();
  const n = q.getModuleCount();
  const raus = [];
  for (let z = 0; z < n; z++) {
    const zeile = [];
    for (let s = 0; s < n; s++) zeile.push(q.isDark(z, s));
    raus.push(zeile);
  }
  return raus;
};
const PDFLib = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

fs.mkdirSync(zielOrdner, { recursive: true });
let summe = 0;
for (const name of namen) {
  const pfad = path.join(VORLAGEN, `${name}.json`);
  if (!fs.existsSync(pfad)) { console.log(`Keine Vorlage "${name}".`); continue; }
  const vorlage = JSON.parse(fs.readFileSync(pfad, 'utf-8'));
  const ergebnis = rendern({
    vorlage, daten, schriften,
    marke: { primaer: firma.ci_primaer, akzent: firma.ci_akzent },
  });
  const ziel = path.join(zielOrdner, `${name}.pdf`);
  const bytes = await zuPdf({ seiten: ergebnis.seiten, schriften, bilder,
                              titel: `Probe ${vorlage.name}`, qr }, { PDFLib, fontkit });
  fs.writeFileSync(ziel, bytes);
  console.log(`\n===== ${name}: ${ergebnis.seiten.length} Seiten, `
    + `${(bytes.length / 1024).toFixed(0)} KiB -> ${ziel}`);
  const nachArt = new Map();
  for (const w of ergebnis.warnungen) nachArt.set(w.art, (nachArt.get(w.art) ?? 0) + 1);
  if (nachArt.size) {
    console.log('  ' + [...nachArt].map(([a, n]) => `${n}x ${a}`).join(', '));
    for (const w of ergebnis.warnungen) {
      console.log(`   ${w.art.padEnd(18)} ${String(w.seite ?? '').padEnd(14)}`
        + `${String(w.element ?? '').padEnd(28)} ${w.text}`);
    }
  }
  summe += ergebnis.warnungen.length;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${summe} Warnungen insgesamt.`);
