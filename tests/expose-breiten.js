// Rechnet der Renderer Zeilenbreiten wie die Prototypen?
//
// Die Prototypen setzen jede Zeile mit pdfmetrics.stringWidth. Danach
// richtet sich jeder Umbruch, jede Zentrierung, jede rechts ausgerichtete
// Zahl und jeder Blocksatz-Zwischenraum. Weicht der Renderer ab, sieht das
// Expose nicht mehr aus wie die verbindliche Vorlage — und zwar wachsend
// mit der Zeilenlaenge, also an langen Absaetzen am meisten.
//
// packages/expose-renderer/src/schrift.ts liest cmap, hmtx und head selbst,
// statt fontkit zu fragen. Dieser Test stellt das gegen ReportLab:
// 18 Schnitte x 20 Proben x 14 Groessen x 7 Sperrungen.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const SCHRIFTEN = path.join(WURZEL, 'assets', 'fonts', 'expose');
const QUELLE = path.join(WURZEL, 'packages', 'expose-renderer', 'src', 'schrift.ts');

const soll = JSON.parse(execFileSync(
  'python3', [path.join(__dirname, 'expose-breiten-soll.py')],
  { encoding: 'utf-8', maxBuffer: 64 << 20 }));

if (soll.uebersprungen) {
  console.log(`  ${soll.uebersprungen} — uebersprungen.`);
  process.exit(0);
}

// cwd ausserhalb des Projekts: nennt man tsc eine Datei auf der
// Kommandozeile UND liegt eine tsconfig.json daneben, bricht es mit TS5112 ab.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-breiten-'));
execFileSync('tsc', [QUELLE, '--outDir', tmp, '--module', 'commonjs',
                     '--target', 'es2020', '--skipLibCheck'],
             { stdio: 'pipe', cwd: os.tmpdir() });
const S = require(path.join(tmp, 'schrift.js'));

let fehler = 0, geprueft = 0;
const abweichungen = [];

for (const datei of soll.schnitte) {
  const name = datei.replace(/\.ttf$/, '');
  const m = S.metrikLesen(new Uint8Array(fs.readFileSync(path.join(SCHRIFTEN, datei))), name);
  for (const [schluessel, wert] of Object.entries(soll.werte)) {
    const [schnitt, nr, groesse, sperrung] = schluessel.split('|');
    if (schnitt !== name) continue;
    geprueft++;
    const ist = S.breite(m, soll.proben[Number(nr)], Number(groesse), Number(sperrung));
    // ReportLab rechnet in doppelter Genauigkeit wie wir; 1e-9 ist
    // Rundungsrauschen, alles darueber ist ein Fehler im Leser.
    if (Math.abs(ist - wert) > 1e-9) {
      fehler++;
      if (abweichungen.length < 8) {
        abweichungen.push(`${name} ${groesse}pt cs=${sperrung} ` +
          `${JSON.stringify(soll.proben[Number(nr)]).slice(0, 44)}: ` +
          `soll ${wert.toFixed(6)}, ist ${ist.toFixed(6)}`);
      }
    }
  }
}

// Fehlende Zeichen muessen auffallen, nicht still ein Rechteck werden.
const m = S.metrikLesen(
  new Uint8Array(fs.readFileSync(path.join(SCHRIFTEN, 'Jak-Regular.ttf'))), 'Jak-Regular');
geprueft += 2;
if (S.fehlendeZeichen(m, 'Wohnfläche 148 m²').length !== 0) {
  fehler++; console.log('  [FEHLER] Deutsche Umlaute und m² muessen in Jak-Regular vorkommen.');
}
const fehlt = S.fehlendeZeichen(m, 'Преимущество');
if (fehlt.length === 0) {
  fehler++; console.log('  [FEHLER] Kyrillisch ist nicht im Zeichensatz — das muss gemeldet werden.');
}

fs.rmSync(tmp, { recursive: true, force: true });
if (fehler) {
  for (const z of abweichungen) console.log('  [FEHLER]', z);
  console.log(`\n  ${fehler} von ${geprueft} Breiten weichen von ReportLab ab.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Zeilenbreiten stimmen mit pdfmetrics.stringWidth ueberein`);
console.log(`       (${soll.schnitte.length} Schnitte, ${soll.proben.length} Proben, Groessen und Sperrungen).`);
