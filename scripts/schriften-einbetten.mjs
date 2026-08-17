#!/usr/bin/env node
/**
 * Erzeugt src/lib/expose/schriften-daten.ts aus den Schriftdateien in
 * node_modules.
 *
 * Warum eingebettet und nicht zur Laufzeit gelesen:
 *
 * Die PDF-Erzeugung loeste die Dateien bisher ueber `require.resolve` auf.
 * Das funktioniert lokal, weil `node_modules` daneben liegt — im
 * Auslieferungspaket der Serverfunktion liegen die .woff-Dateien aber nicht.
 * Die Abhaengigkeitsanalyse sieht sie nicht: Sie stehen in keinem `import`,
 * sondern in einem Aufruf. Auf Netlify warf `require.resolve` deshalb, und
 * mit ihm die gesamte Route.
 *
 * Beide naheliegenden Auswege sind geprueft und taugen nicht:
 * `outputFileTracingIncludes` wird beim Bauen mit Turbopack nicht
 * beruecksichtigt, und ein literales `require.resolve("....woff")` laesst
 * Turbopack den Build mit "Unknown module type" abbrechen.
 *
 * Als Daten-URL braucht die Schrift zur Laufzeit weder Dateisystem noch
 * Aufloesung — sie steht im Modul. @react-pdf/renderer nimmt Daten-URLs
 * unmittelbar entgegen.
 *
 * Aufruf:  npm run schriften-einbetten
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aufloesen = createRequire(import.meta.url);
const hier = dirname(fileURLToPath(import.meta.url));
const ziel = join(hier, "..", "src", "lib", "expose", "schriften-daten.ts");

/** Genau die Schnitte, die die Vorlagen verwenden — nicht mehr. */
const SCHNITTE = [
  ["POPPINS_500", "@fontsource/poppins/files/poppins-latin-500-normal.woff"],
  ["POPPINS_600", "@fontsource/poppins/files/poppins-latin-600-normal.woff"],
  ["POPPINS_700", "@fontsource/poppins/files/poppins-latin-700-normal.woff"],
  ["INTER_400", "@fontsource/inter/files/inter-latin-400-normal.woff"],
  ["INTER_500", "@fontsource/inter/files/inter-latin-500-normal.woff"],
  ["INTER_600", "@fontsource/inter/files/inter-latin-600-normal.woff"],
];

const zeilen = [
  "/**",
  " * ERZEUGTE DATEI — nicht von Hand bearbeiten.",
  " *",
  " * Quelle: @fontsource/poppins und @fontsource/inter (SIL Open Font License).",
  " * Neu erzeugen mit: npm run schriften-einbetten",
  " *",
  " * Die Hausschriften stehen hier als Daten-URL, damit die PDF-Erzeugung zur",
  " * Laufzeit keine Datei suchen muss. Begruendung im Kopf von",
  " * scripts/schriften-einbetten.mjs.",
  " */",
  "",
];

for (const [name, paket] of SCHNITTE) {
  const roh = readFileSync(aufloesen.resolve(paket));
  zeilen.push(
    `/** ${paket} — ${roh.length} Bytes */`,
    `export const ${name} =`,
    `  "data:font/woff;base64,${roh.toString("base64")}";`,
    "",
  );
}

writeFileSync(ziel, zeilen.join("\n"), "utf8");

const gesamt = SCHNITTE.reduce(
  (summe, [, paket]) => summe + readFileSync(aufloesen.resolve(paket)).length,
  0,
);
console.log(
  `schriften-daten.ts geschrieben: ${SCHNITTE.length} Schnitte, ${gesamt} Bytes Schriftdaten.`,
);
