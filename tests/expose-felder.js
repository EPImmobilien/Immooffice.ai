// Deckt der Feldkatalog das tatsaechliche Schema ab?
//
// packages/expose-renderer/src/felder.ts sagt, welche Platzhalter eine
// Exposé-Vorlage benutzen darf. Die Spalten dahinter stehen in der
// Datenbank, die Anzeigenamen von Hand im Katalog. Beides laeuft
// auseinander, sobald eine Migration eine Spalte hinzufuegt — und zwar
// still: der Editor bietet sie einfach nicht an, und niemand merkt es.
//
// Darum diese Wache: jede Spalte von immobilien, profiles und
// firma_stammdaten ist entweder im Katalog oder in AUSGENOMMEN mit Grund.
// Eine neue Spalte faellt hier auf und muss entschieden werden. Umgekehrt
// darf kein Platzhalter auf eine Spalte zeigen, die es nicht gibt.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'packages', 'expose-renderer', 'src', 'felder.ts');
const TABELLEN = ['immobilien', 'profiles', 'firma_stammdaten'];

let zeilen;
try {
  zeilen = execFileSync(path.join(WURZEL, 'scripts', 'lokale-db.sh'),
    ['psql', '-At', '-F', '.', '-c',
     `select table_name, column_name from information_schema.columns
      where table_schema = 'public'
        and table_name in (${TABELLEN.map((t) => `'${t}'`).join(', ')})
      order by table_name, column_name`],
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (grund) {
  console.log('  Die lokale Datenbank antwortet nicht — nicht pruefbar.');
  console.log('  `scripts/lokale-db.sh neu && scripts/lokale-db.sh migrieren` ausfuehren.');
  process.exit(0);
}

const spalten = new Set(zeilen.trim().split('\n').filter(Boolean));
if (spalten.size === 0) {
  console.log('  [FEHLER] Die drei Tabellen haben keine Spalten — ist migriert worden?');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-felder-'));
execFileSync('tsc', [QUELLE, '--outDir', tmp, '--module', 'commonjs',
                     '--target', 'es2020', '--skipLibCheck'],
             { stdio: 'pipe', cwd: os.tmpdir() });
const K = require(path.join(tmp, 'felder.js'));
fs.rmSync(tmp, { recursive: true, force: true });

const fehler = [];

// 1. Jeder Platzhalter mit Quelle zeigt auf eine Spalte, die es gibt.
const belegt = new Set();
for (const f of K.KATALOG) {
  if (f.quelle.gerechnet) continue;
  const s = `${f.quelle.tabelle}.${f.quelle.spalte}`;
  belegt.add(s);
  if (!spalten.has(s)) {
    fehler.push(`${f.schluessel} zeigt auf ${s} — diese Spalte gibt es nicht.`);
  }
}

// 2. Jede Spalte ist entweder belegt oder mit Grund ausgenommen.
for (const s of [...spalten].sort()) {
  if (belegt.has(s)) continue;
  if (K.AUSGENOMMEN[s]) continue;
  fehler.push(`${s} ist weder Platzhalter noch in AUSGENOMMEN. Neue Spalte? ` +
              `Entweder in den Katalog aufnehmen oder mit Grund ausnehmen.`);
}

// 3. Keine Ausnahme fuer eine Spalte, die es nicht mehr gibt — sonst
//    verwaltet der Katalog Altlasten.
for (const s of Object.keys(K.AUSGENOMMEN).sort()) {
  if (!spalten.has(s)) {
    fehler.push(`AUSGENOMMEN nennt ${s}, aber die Spalte gibt es nicht mehr.`);
  }
}

// 4. Keine zwei Felder mit demselben Platzhalter.
const gesehen = new Set();
for (const f of K.KATALOG) {
  if (gesehen.has(f.schluessel)) fehler.push(`Platzhalter ${f.schluessel} steht doppelt im Katalog.`);
  gesehen.add(f.schluessel);
}

if (fehler.length) {
  for (const z of fehler.slice(0, 25)) console.log('  [FEHLER]', z);
  if (fehler.length > 25) console.log(`  … und ${fehler.length - 25} weitere.`);
  process.exit(1);
}
console.log(`  [ok] ${K.KATALOG.length} Platzhalter, ${spalten.size} Spalten in drei Tabellen —`);
console.log(`       jede Spalte ist belegt oder mit Grund ausgenommen, keine Ausnahme verwaist.`);
