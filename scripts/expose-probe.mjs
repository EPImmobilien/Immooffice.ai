// Erzeugt ein Expose aus NACHGEBAUTEN Objektdaten — zum Nachsehen, was bei
// einem duenn gepflegten Objekt wirklich auf dem Papier landet.
//
//   node scripts/expose-probe.mjs                 alle Vorlagen, mageres Objekt
//   node scripts/expose-probe.mjs studio          nur eine
//   node scripts/expose-probe.mjs studio --voll   mit allem, was es gibt
//   node scripts/expose-probe.mjs studio --ohne-logo
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
  geschaeftsfuehrer: 'Alex Muster', ci_primaer: '#980101', ci_akzent: '#C2C2BD',
  logo_pfad: 'logos/muster.png',
};
const ansprechpartner = {
  id: 'p1', mandant_id: MANDANT, name: 'Alex Muster', funktion: 'Immobilienmakler/in',
  telefon: '040 1234561', mobil: voll ? '0170 1234567' : null,
  email: 'alex.muster@musterhaus.example', firma_id: 'f1',
};
const immobilie = {
  id: 'o1', mandant_id: MANDANT, immo_nr: '1', objektart: 'Haus', vertragsart: 'verkauf',
  objekttitel: 'Freistehendes Haus mit Garten',
  bezeichnung: 'Freistehendes Haus mit Garten',
  strasse: 'Musterweg', hausnummer: '12', plz: '17166', ort: 'Musterstadt',
  ortsteil: voll ? 'Seeviertel' : null,
  wohnflaeche: 123, nutzflaeche: 45, grundstueck: 654, zimmer: 5, schlafzimmer: 4,
  badezimmer: 3, baujahr: 2016, angebotspreis: 1325000, provision_aussen: '3,57',
  energieausweis_typ: 'Verbrauchsausweis', energie_kennwert: '46', energie_klasse: 'C',
  energie_warmwasser: false, heizungsart: voll ? 'Waermepumpe' : null,
  energie_traeger: voll ? 'Strom' : null,
  zustand: voll ? 'gepflegt' : null, verfuegbar_ab: voll ? 'nach Vereinbarung' : null,
  beschreibung_objekt: voll
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
  raumaufteilung: voll ? [{ name: 'Wohnen', flaeche: 38 }] : null,
  laufende_kosten: voll ? [{ bezeichnung: 'Hausgeld', betrag: 95 }] : null,
  expose_ausstattung_gruppen: voll
    ? [{ gruppe: 'Innen', punkte: ['Parkett', 'Fussbodenheizung'] }] : null,
};

const bildWerte = {};
const bilder = new Map();
bilder.set('foto', new Uint8Array(JPEG));
for (let i = 1; i <= 13; i++) bildWerte['bild.foto.' + i] = 'foto';
bildWerte['objekt.hauptbild_url'] = 'foto';
bildWerte['bild.lageplan'] = 'foto';
if (voll) { bildWerte['bild.grundriss.1'] = 'foto'; bildWerte['bild.grundriss.2'] = 'foto'; }
if (voll) bildWerte['ansprechpartner.foto'] = 'foto';
if (!ohneLogo) {
  bildWerte['firma.logo.hell'] = 'foto';
  bildWerte['firma.logo.dunkel'] = 'foto';
}

const daten = aufbereiten({
  immobilie, firma, ansprechpartner,
  annahmen: { notar_prozent: 2.0, zinssatz: 3.9, tilgung: 2.0, eigenkapital_prozent: 20 },
  bilder: bildWerte,
  ki_bilder: [],
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
