#!/usr/bin/env node
/**
 * Erzeugt src/lib/expose/schriften-daten.ts aus den @fontsource-Paketen.
 *
 * Warum eingebettet und nicht zur Laufzeit geladen: Die PDF-Erzeugung lief
 * lokal und im Test fehlerfrei, in der Produktion liess sich kein Exposé
 * erzeugen — die .woff-Dateien fehlten im Funktionsbuendel. Ein
 * `require.resolve` auf eine Schriftdatei ist fuer den Bundler nicht
 * nachvollziehbar, und `outputFileTracingIncludes` greift unter Turbopack
 * nicht (Next wendet die Liste nur auf webpack-Eintraege an).
 *
 * Als Zeichenkette im Quelltext ist die Schrift Teil des Moduls. Damit gibt es
 * keinen Pfad, der ins Leere zeigen kann, und das Verhalten ist in
 * Entwicklung, Test und Produktion dasselbe. Preis: rund 200 KB erzeugter
 * Quelltext — weniger als ein einzelnes Objektfoto.
 *
 * Aufruf: node scripts/schriften-einbetten.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aufloesen = createRequire(import.meta.url);
const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Bezeichner im erzeugten Modul → Paketpfad der Schriftdatei. */
const SCHNITTE = {
  POPPINS_500: "@fontsource/poppins/files/poppins-latin-500-normal.woff",
  POPPINS_600: "@fontsource/poppins/files/poppins-latin-600-normal.woff",
  POPPINS_700: "@fontsource/poppins/files/poppins-latin-700-normal.woff",
  INTER_400: "@fontsource/inter/files/inter-latin-400-normal.woff",
  INTER_500: "@fontsource/inter/files/inter-latin-500-normal.woff",
  INTER_600: "@fontsource/inter/files/inter-latin-600-normal.woff",
};

const teile = [];
let gesamt = 0;

for (const [name, paket] of Object.entries(SCHNITTE)) {
  const pfad = aufloesen.resolve(paket);
  const bytes = await readFile(pfad);

  // Ohne diese Pruefung koennte eine kaputte Datei unbemerkt eingebettet
  // werden — die PDF-Erzeugung wuerde erst beim Rendern scheitern.
  if (bytes.subarray(0, 4).toString("latin1") !== "wOFF") {
    throw new Error(`${paket} ist keine WOFF-Datei.`);
  }

  gesamt += bytes.length;
  teile.push(
    `/** ${paket} */\nexport const ${name} =\n  "${bytes.toString("base64")}";`,
  );
}

const kopf = `// ERZEUGTE DATEI — NICHT VON HAND BEARBEITEN.
// Neu erzeugen mit: node scripts/schriften-einbetten.mjs
//
// Hausschriften als Base64, damit die PDF-Erzeugung ohne Dateizugriff
// auskommt. Begruendung und Hintergrund: scripts/schriften-einbetten.mjs
// sowie src/lib/expose/schriften.ts.
//
// Poppins und Inter stehen unter der SIL Open Font License 1.1; die
// Lizenztexte liegen in src/lib/expose/schriften-lizenzen/.

`;

const ziel = join(wurzel, "src/lib/expose/schriften-daten.ts");
await writeFile(ziel, kopf + teile.join("\n\n") + "\n");

console.log(
  `${Object.keys(SCHNITTE).length} Schnitte eingebettet (${Math.round(gesamt / 1024)} KB Schriftdaten) → ${ziel}`,
);
