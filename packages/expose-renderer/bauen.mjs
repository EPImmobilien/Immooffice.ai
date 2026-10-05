// Buendelt den Renderer — einmal fuer den Browser, einmal fuer Deno.
//
// Der Auftrag verlangt EINEN Renderer, der die Live-Vorschau im Browser
// und das endgueltige PDF in der Edge Function erzeugt: "So sehen
// Vorschau und Ergebnis garantiert gleich aus." CLAUDE.md verlangt fuer
// die Oberflaeche die klassische Runtime — kein `import`, kein
// `type="module"`. Das ist kein Widerspruch, sondern eine Lieferfrage:
//
//   buendel/immo-expose.js    IIFE, setzt window.ImmoExpose. Die
//                             Oberflaeche laedt es mit einem gewoehnlichen
//                             <script>, wie supabase-js auch.
//   buendel/immo-expose.mjs   ESM fuer Deno, von der Edge Function
//                             importiert.
//
// Beide entstehen aus derselben Quelle. Wer eines von beiden von Hand
// anfasst, bekommt es beim naechsten `npm run check` gesagt:
// tests/expose-buendel.js baut neu und vergleicht.
//
//   node packages/expose-renderer/bauen.mjs            erzeugen
//   node packages/expose-renderer/bauen.mjs --pruefen  nur vergleichen
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const QUELLE = path.join(HIER, 'src', 'index.ts');
const ZIEL = path.join(HIER, 'buendel');
// Die Edge Function bekommt eine Kopie des ESM-Buendels IN ihr Verzeichnis.
// Grund: ausgerollt wird mit `supabase functions deploy --use-api`, und was
// dabei mitgeht, ist der Ordner der Funktion. Ein Import aus
// ../../../packages/ waere eine Wette darauf, wie weit die CLI die
// Abhaengigkeiten verfolgt. Die Kopie ist Erzeugnis wie das Buendel selbst;
// --pruefen vergleicht sie mit.
const FUNKTION = path.join(HIER, '..', '..', 'supabase', 'functions',
                           'expose-pdf-erzeugen', 'immo-expose.mjs');

const GEMEINSAM = {
  entryPoints: [QUELLE],
  bundle: true,
  minify: false,          // lesbar halten: das Buendel ist versioniert
  sourcemap: false,
  target: ['es2020'],
  charset: 'utf8',
  legalComments: 'none',
  // pdf-lib und fontkit kommen NICHT ins Buendel. Im Browser sind sie
  // ueber <script> schon da, in Deno werden sie importiert — sie
  // mitzubuendeln hiesse, zwei Megabyte doppelt auszuliefern.
  external: ['pdf-lib', '@pdf-lib/fontkit'],
};

const FASSUNGEN = [
  { ...GEMEINSAM, format: 'iife', globalName: 'ImmoExpose',
    outfile: path.join(ZIEL, 'immo-expose.js'),
    banner: { js: '// Erzeugt von packages/expose-renderer/bauen.mjs — nicht von Hand aendern.' } },
  { ...GEMEINSAM, format: 'esm',
    outfile: path.join(ZIEL, 'immo-expose.mjs'),
    banner: { js: '// Erzeugt von packages/expose-renderer/bauen.mjs — nicht von Hand aendern.' } },
];

const pruefen = process.argv.includes('--pruefen');
fs.mkdirSync(ZIEL, { recursive: true });

let abweichend = [];
for (const fassung of FASSUNGEN) {
  const ziel = fassung.outfile;
  const vorher = fs.existsSync(ziel) ? fs.readFileSync(ziel, 'utf-8') : null;
  await build(pruefen ? { ...fassung, outfile: undefined, write: false } : fassung)
    .then((ergebnis) => {
      if (!pruefen) return;
      const neu = ergebnis.outputFiles[0].text;
      if (vorher !== neu) abweichend.push(path.basename(ziel));
    });
}

// Die Kopie fuer die Edge Function.
{
  const esm = fs.readFileSync(path.join(ZIEL, 'immo-expose.mjs'), 'utf-8');
  const vorher = fs.existsSync(FUNKTION) ? fs.readFileSync(FUNKTION, 'utf-8') : null;
  if (pruefen) {
    if (vorher !== esm) abweichend.push('supabase/functions/expose-pdf-erzeugen/immo-expose.mjs');
  } else if (vorher !== esm) {
    fs.mkdirSync(path.dirname(FUNKTION), { recursive: true });
    fs.writeFileSync(FUNKTION, esm);
  }
}

if (pruefen) {
  if (abweichend.length) {
    console.log(`  [FEHLER] ${abweichend.join(', ')} weicht von der Quelle ab.`);
    console.log('  `node packages/expose-renderer/bauen.mjs` ausfuehren.');
    process.exit(1);
  }
  console.log('  [ok] Beide Buendel und die Kopie der Edge Function entsprechen der Quelle.');
} else {
  for (const f of FASSUNGEN) {
    const groesse = fs.statSync(f.outfile).size;
    console.log(`${path.relative(process.cwd(), f.outfile)} — ${(groesse / 1024).toFixed(0)} KiB`);
  }
}
