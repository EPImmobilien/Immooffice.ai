// Stimmt die Farbableitung der Vorlagen mit den Prototypen ueberein?
//
// Die drei theme()-Funktionen in reference/expose-vorlagen/ sind laut Auftrag
// verbindlich: sie entscheiden, wie aus zwei gewaehlten Farben die ganze
// Palette einer Vorlage entsteht. packages/expose-renderer/src/farben.ts ist
// ihre Portierung.
//
// Geprueft wird NICHT gegen abgeschriebene Zahlen. Die erwarteten Werte
// rechnet ein kleines Python-Programm aus den Prototypen selbst — mit
// derselben Mischfunktion und denselben Faktoren, direkt aus der Quelle
// gelesen. Weicht eine Farbe ab, ist die Portierung falsch, nicht der Test.
//
// Ohne reference/ wird uebersprungen: die Prototypen sind nicht versioniert.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const REF = path.join(WURZEL, 'reference', 'expose-vorlagen');
const QUELLE = path.join(WURZEL, 'packages', 'expose-renderer', 'src', 'farben.ts');

if (!fs.existsSync(REF)) {
  console.log('  reference/expose-vorlagen fehlt — uebersprungen. Die Prototypen');
  console.log('  sind nicht versioniert; ohne sie gibt es nichts zu vergleichen.');
  process.exit(0);
}

// --- Die Portierung uebersetzen und laden --------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-farben-'));
// cwd absichtlich ausserhalb des Projekts: nennt man tsc eine Datei auf der
// Kommandozeile UND liegt eine tsconfig.json daneben, bricht es mit TS5112 ab.
execFileSync('tsc', [QUELLE, '--outDir', tmp, '--module', 'commonjs',
                     '--target', 'es2020', '--skipLibCheck'],
             { stdio: 'pipe', cwd: os.tmpdir() });
const F = require(path.join(tmp, 'farben.js'));

// --- Die Prototypen rechnen lassen ---------------------------------------
// Nur die Farbteile, ohne ReportLab: hx/mix nachgebaut, die FAKTOREN aber
// aus den Prototypen gelesen. So kann der Test nicht auseinanderlaufen,
// ohne dass die Quelle sich aendert.

// Die vier Farbvarianten jeder Vorlage, wie die Prototypen sie selbst
// durchrechnen, dazu zwei bewusst helle Signalfarben fuer die
// Kontrastautomatik von Studio.
const PAARE = {
  raster: [['#0F4C5C', '#E8915A'], ['#5A1E2C', '#C9A46A'], ['#23262B', '#3B82F6'], ['#26402F', '#9AA537']],
  signature: [['#2B221D', '#B08A5E'], ['#1F2B26', '#A99C6E'], ['#341A20', '#C29A8C'], ['#232529', '#A6ACB3']],
  studio: [['#2F4BFF', '#111318'], ['#E0512F', '#1C1A24'], ['#C9E04A', '#16201A'], ['#E9668F', '#2B1631'],
           ['#F2F2F2', '#111318'], ['#FFE066', '#16201A']],
};

// Die Soll-Werte rechnet tests/expose-farben-soll.py, indem es die
// theme()-Funktionen der Prototypen ausfuehrt. Eigene Datei, weil Python in
// einer JavaScript-Schablone zu einem Maskierungsproblem wird.
const erwartet = JSON.parse(execFileSync(
  'python3', [path.join(__dirname, 'expose-farben-soll.py'), REF, JSON.stringify(PAARE)],
  { encoding: 'utf-8', maxBuffer: 8 << 20 }));

// --- Vergleichen ----------------------------------------------------------
let fehler = 0, geprueft = 0;
const nah = (a, b) => Math.abs(a - b) < 1e-9;

for (const [art, faelle] of Object.entries(erwartet)) {
  for (const [paar, soll] of Object.entries(faelle)) {
    const [f1, f2] = paar.split('/');
    const ist = F.palette(art, f1, f2);
    for (const [name, wert] of Object.entries(soll)) {
      geprueft++;
      const c = ist[name];
      if (!c || !nah(c.r, wert[0]) || !nah(c.g, wert[1]) || !nah(c.b, wert[2])) {
        fehler++;
        const sollHex = F.hex({ r: wert[0], g: wert[1], b: wert[2] });
        console.log(`  [FEHLER] ${art} ${paar} ${name}: soll ${sollHex}, ist ${c ? F.hex(c) : 'fehlt'}`);
      }
    }
  }
}

// Die Automatik von Studio ausdruecklich: hell -> dunkler Text, dunkel -> weiss.
const hellStudio = F.palette('studio', '#F2F2F2', '#111318');
const dunkelStudio = F.palette('studio', '#2F4BFF', '#111318');
geprueft += 2;
if (F.hex(hellStudio.on_s) !== F.hex(hellStudio.d)) {
  fehler++; console.log('  [FEHLER] Studio: auf heller Signalflaeche muss der Text dunkel sein.');
}
if (F.hex(dunkelStudio.on_s) !== '#ffffff') {
  fehler++; console.log('  [FEHLER] Studio: auf dunkler Signalflaeche muss der Text weiss sein.');
}

fs.rmSync(tmp, { recursive: true, force: true });
if (fehler) {
  console.log(`\n  ${fehler} von ${geprueft} Farben weichen von den Prototypen ab.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} abgeleitete Farben stimmen mit den Prototypen ueberein`);
console.log('       (3 Vorlagen, 14 Farbpaare, Kontrastautomatik von Studio).');
