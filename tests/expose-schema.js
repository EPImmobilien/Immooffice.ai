// Halten die Vorlagen ihr eigenes Schema ein?
//
// Der Auftrag verlangt, die Vorlage beim Laden gegen das JSON-Schema zu
// validieren. Das Schema prueft die FORM: gibt es die Pflichtfelder, ist
// ein Rahmen eine Zahl, kennt es diesen Elementtyp. Was es nicht wissen
// kann — ob ein Platzhalter im Feldkatalog steht, ob ein Textstil in
// dieser Vorlage vorkommt —, prueft
// packages/expose-renderer/src/pruefen.ts beim Rendern.
//
// Beide muessen dieselbe Liste von Elementtypen fuehren. Laufen sie
// auseinander, gilt im Editor etwas anderes als im Renderer, und der
// Fehler zeigt sich erst im fertigen PDF.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
// Draft 2020-12 liegt bei ajv in einer eigenen Einstiegsdatei; der
// Standardeinstieg kennt nur Draft-07 und bricht mit "no schema with key
// or ref" ab.
const Ajv = require('ajv/dist/2020');

const WURZEL = path.join(__dirname, '..');
const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');
const SCHEMA = path.join(VORLAGEN, 'schema.json');

const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf-8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const pruefe = ajv.compile(schema);

let fehler = 0;
const namen = fs.readdirSync(VORLAGEN)
  .filter((f) => f.endsWith('.json') && f !== 'schema.json')
  .map((f) => f.replace(/\.json$/, ''));

for (const name of namen) {
  const vorlage = JSON.parse(fs.readFileSync(path.join(VORLAGEN, `${name}.json`), 'utf-8'));
  if (pruefe(vorlage)) continue;
  fehler++;
  console.log(`  [FEHLER] ${name} haelt das Schema nicht ein:`);
  for (const e of pruefe.errors.slice(0, 8)) {
    console.log(`    ${e.instancePath || '/'}: ${e.message}`);
  }
  if (pruefe.errors.length > 8) {
    console.log(`    … und ${pruefe.errors.length - 8} weitere.`);
  }
}

// Elementtypen: Schema gegen Renderer.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-schema-'));
execFileSync('tsc', [path.join(WURZEL, 'packages', 'expose-renderer', 'src', 'elemente.ts'),
                     '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020',
                     '--skipLibCheck', '--esModuleInterop'],
             { stdio: 'pipe', cwd: os.tmpdir() });
const { ELEMENTE } = require(path.join(tmp, 'elemente.js'));
fs.rmSync(tmp, { recursive: true, force: true });

const imSchema = new Set(schema.$defs.elementTyp.enum);
const imRenderer = new Set(Object.keys(ELEMENTE));
for (const t of imSchema) {
  if (!imRenderer.has(t)) {
    fehler++;
    console.log(`  [FEHLER] Das Schema erlaubt den Typ "${t}", der Renderer kennt ihn nicht.`);
  }
}
for (const t of imRenderer) {
  if (!imSchema.has(t)) {
    fehler++;
    console.log(`  [FEHLER] Der Renderer kennt den Typ "${t}", das Schema erlaubt ihn nicht.`);
  }
}

if (fehler) {
  console.log(`\n  ${fehler} Beanstandungen.`);
  process.exit(1);
}
console.log(`  [ok] ${namen.length} Vorlagen halten das Schema ein,`);
console.log(`       ${imSchema.size} Elementtypen in Schema und Renderer gleich.`);
