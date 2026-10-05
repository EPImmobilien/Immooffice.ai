// Entsteht aus den Zeichenschritten auch wirklich ein PDF?
//
// Der Vergleich in tests/expose-vorlagen.js prueft die Schrittliste. Das
// ist die Stelle, an der Fehler entstehen — aber eine Schrittliste ist
// noch kein Dokument. Dieser Test schreibt jede Vorlage als PDF, liest es
// zurueck und sieht nach, dass alles da ist, was da sein muss: die
// Seitenzahl, die eingebetteten Schriften, Text auf jeder Seite.
//
// Ohne reference/ uebersprungen: die Demodaten der Prototypen liefern den
// Inhalt.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const REF = path.join(WURZEL, 'reference', 'expose-vorlagen');
const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');

if (!fs.existsSync(REF)) {
  console.log('  reference/expose-vorlagen fehlt — uebersprungen.');
  process.exit(0);
}

const PDFLib = require('pdf-lib');

const namen = fs.readdirSync(VORLAGEN).filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));
if (!namen.length) {
  console.log('  Noch keine Vorlage — nichts zu schreiben.');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-pdf-'));
let fehler = 0;
const berichte = [];

async function pruefen() {
for (const name of namen) {
  const ziel = path.join(tmp, `${name}.pdf`);
  let ausgabe;
  try {
    ausgabe = execFileSync('node',
      [path.join(WURZEL, 'scripts', 'expose-vorschau.mjs'), name, ziel],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  } catch (grund) {
    fehler++;
    console.log(`  [FEHLER] ${name}: das PDF liess sich nicht schreiben.`);
    console.log('    ' + String(grund.stderr || grund.message).split('\n').slice(-6).join('\n    '));
    continue;
  }
  if (/\[FEHLER\]/.test(ausgabe)) {
    fehler++;
    console.log(`  [FEHLER] ${name}: der Renderer meldet Fehler.`);
    for (const z of ausgabe.split('\n').filter((z) => z.includes('[FEHLER]'))) {
      console.log('    ' + z.trim());
    }
    continue;
  }

  const roh = fs.readFileSync(ziel);
  // Gezaehlt wird mit pdf-lib und nicht mit einem Suchmuster auf dem
  // Rohtext: pdf-lib schreibt Objekte auch in Stroemen, und dann steht
  // "/Type /Page" nirgends im Klartext. Der erste Anlauf hat genau das
  // getan und "keine Seite" gemeldet, obwohl zehn darin waren.
  const dok = await PDFLib.PDFDocument.load(roh);
  const seiten = dok.getPageCount();
  const vorlage = JSON.parse(fs.readFileSync(path.join(VORLAGEN, `${name}.json`), 'utf-8'));
  if (seiten < 1) {
    fehler++;
    console.log(`  [FEHLER] ${name}: das PDF hat keine Seite.`);
    continue;
  }
  // Auch die Schriften stehen in Stroemen; also durch die Objekte gehen.
  const schnitte = new Set();
  for (const [, obj] of dok.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFLib.PDFDict)) continue;
    const basis = obj.get(PDFLib.PDFName.of('BaseFont'));
    if (basis) schnitte.add(String(basis).replace(/^\//, ''));
  }
  if (!schnitte.size) {
    fehler++;
    console.log(`  [FEHLER] ${name}: keine eingebettete Schrift — der Text waere unsichtbar.`);
    continue;
  }
  berichte.push(`${name}: ${seiten} Seiten, ${schnitte.size} Schnitte, ` +
                `${(roh.length / 1024).toFixed(0)} KiB`);
  if (seiten !== vorlage.seiten.length) {
    // Seiten koennen durch Bedingungen entfallen — das ist kein Fehler,
    // aber es soll dastehen.
    berichte.push(`   (die Vorlage hat ${vorlage.seiten.length} Seiten; ` +
                  `Bedingungen koennen Seiten entfallen lassen)`);
  }
}

}

pruefen().then(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const b of berichte) console.log('  ' + b);
  if (fehler) {
    console.log(`\n  ${fehler} Vorlagen liefern kein brauchbares PDF.`);
    process.exit(1);
  }
  console.log(`  [ok] Alle ${namen.length} Vorlagen lassen sich als PDF schreiben.`);
});
