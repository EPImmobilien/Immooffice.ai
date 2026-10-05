// Erzeugt aus einer Vorlage ein PDF — zum Ansehen und zum Pruefen.
//
//   node scripts/expose-vorschau.mjs raster  [ziel.pdf]
//
// Die Daten kommen aus den Demodaten der Prototypen (reference/), damit
// das Ergebnis mit den Referenz-PDFs vergleichbar ist. Ohne reference/
// bricht das Skript ab und sagt es.
//
// Das ist bewusst ein Werkzeug und kein Teil des Produkts: im Betrieb
// ruft die Edge Function denselben Renderer mit echten Objektdaten.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WURZEL = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const SCHRIFTEN = path.join(WURZEL, 'assets', 'fonts', 'expose');
const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');

const name = process.argv[2] ?? 'raster';
const ziel = process.argv[3] ?? path.join(os.tmpdir(), `expose-${name}.pdf`);

const vorlagePfad = path.join(VORLAGEN, `${name}.json`);
if (!fs.existsSync(vorlagePfad)) {
  console.error(`Keine Vorlage "${name}" in packages/expose-renderer/vorlagen/.`);
  process.exit(1);
}

// Den Renderer uebersetzen. Im Betrieb liegt dafuer das Buendel bereit;
// hier wird aus der Quelle uebersetzt, damit das Werkzeug ohne Bauschritt
// funktioniert.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-vorschau-'));
for (const datei of ['rendern.ts', 'pdf.ts']) {
  execFileSync('tsc', [path.join(WURZEL, 'packages', 'expose-renderer', 'src', datei),
                       '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020',
                       '--skipLibCheck', '--esModuleInterop'],
               { stdio: 'pipe', cwd: os.tmpdir() });
}
const { rendern } = require(path.join(tmp, 'rendern.js'));
const { zuPdf } = require(path.join(tmp, 'pdf.js'));
const { metrikLesen } = require(path.join(tmp, 'schrift.js'));
const { hex } = require(path.join(tmp, 'farben.js'));

const schriften = new Map();
for (const datei of fs.readdirSync(SCHRIFTEN).filter((f) => f.endsWith('.ttf'))) {
  const schnitt = datei.replace(/\.ttf$/, '');
  schriften.set(schnitt,
    metrikLesen(new Uint8Array(fs.readFileSync(path.join(SCHRIFTEN, datei))), schnitt));
}

const ref = path.join(WURZEL, 'reference', 'expose-vorlagen');
if (!fs.existsSync(ref)) {
  console.error('reference/expose-vorlagen/ fehlt — ohne die Demodaten der');
  console.error('Prototypen gibt es nichts zu zeigen.');
  process.exit(1);
}
const aufzeichnung = JSON.parse(execFileSync(
  'python3', [path.join(WURZEL, 'tests', 'expose-aufzeichnung.py'), name],
  { encoding: 'utf-8', maxBuffer: 256 << 20 }))[name];
const { daten } = require(path.join(WURZEL, 'tests', 'expose-vorlagen-daten.js'));

const vorlage = JSON.parse(fs.readFileSync(vorlagePfad, 'utf-8'));
const farbe = (c) => (c ? hex({ r: c[0], g: c[1], b: c[2] }) : undefined);
const ergebnis = rendern({
  vorlage,
  daten: daten(name, aufzeichnung.daten),
  schriften,
  marke: { primaer: farbe(aufzeichnung.farben.p ?? aufzeichnung.farben.d ?? aufzeichnung.farben.s),
           akzent: farbe(aufzeichnung.farben.a ?? aufzeichnung.farben.d) },
});

const qrErzeuger = require('qrcode-generator');
const qr = (inhalt) => {
  const q = qrErzeuger(0, 'M');
  q.addData(inhalt);
  q.make();
  const n = q.getModuleCount();
  const raus = [];
  for (let zeile = 0; zeile < n; zeile++) {
    const z = [];
    for (let spalte = 0; spalte < n; spalte++) z.push(q.isDark(zeile, spalte));
    raus.push(z);
  }
  return raus;
};

const PDFLib = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const bytes = await zuPdf(
  { seiten: ergebnis.seiten, schriften, titel: `Exposé ${vorlage.name}`, qr },
  { PDFLib, fontkit });
fs.writeFileSync(ziel, bytes);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`${ziel} — ${ergebnis.seiten.length} Seiten, ${(bytes.length / 1024).toFixed(0)} KiB`);
const nachArt = new Map();
for (const w of ergebnis.warnungen) nachArt.set(w.art, (nachArt.get(w.art) ?? 0) + 1);
if (nachArt.size) {
  console.log('Warnungen: ' + [...nachArt].map(([a, n]) => `${n}x ${a}`).join(', '));
  for (const w of ergebnis.warnungen.filter((w) => w.art === 'unbekannt')) {
    console.log(`  [FEHLER] ${w.seite}/${w.element}: ${w.text}`);
  }
}
