// Syntaxpruefung der Edge Functions.
//
// Bis heute stand im Pruefbericht: "kein Deno und kein TypeScript in dieser
// Umgebung". Das erste stimmt, das zweite nicht — TypeScript liegt als
// Entwicklungsabhaengigkeit im Baum, und sein Parser braucht weder Deno noch
// aufloesbare Importe. Er liest die Datei und sagt, ob sie ueberhaupt eine
// gueltige Datei ist.
//
// WAS DIESE PRUEFUNG LEISTET: sie faengt den Fehler, den ein Generator macht
// — eine Regel, die eine Klammer zerschneidet oder eine Ersetzung an der
// falschen Stelle einhaengt. Genau der Fehler, der sonst erst beim Ausrollen
// auffaellt, also nach dem Commit.
//
// WAS SIE NICHT LEISTET: Typen. Dafuer muessten die Importe aufloesbar sein
// (jsr:, npm:, https:) — das kann nur Deno mit Netz. Ein Tippfehler in einem
// Feldnamen faellt hier nicht auf.

const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const wurzel = path.join(__dirname, "..", "supabase", "functions");
if (!fs.existsSync(wurzel)) {
  console.log("supabase/functions fehlt — nichts zu pruefen.");
  process.exit(0);
}

let geprueft = 0;
const kaputt = [];

for (const eintrag of fs.readdirSync(wurzel).sort()) {
  const datei = path.join(wurzel, eintrag, "index.ts");
  if (!fs.existsSync(datei)) continue;
  geprueft++;
  const quelle = fs.readFileSync(datei, "utf8");
  const sf = ts.createSourceFile(datei, quelle, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const diag = sf.parseDiagnostics || [];
  if (diag.length) {
    const erste = diag.slice(0, 3).map((d) => {
      const p = sf.getLineAndCharacterOfPosition(d.start);
      return `Zeile ${p.line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
    });
    kaputt.push({ eintrag, erste, gesamt: diag.length });
  }
}

if (kaputt.length) {
  console.log(`[FEHLER] ${kaputt.length} von ${geprueft} Funktionen sind syntaktisch kaputt:`);
  for (const k of kaputt) {
    console.log(`\n  ${k.eintrag}/index.ts (${k.gesamt} Meldung(en))`);
    for (const z of k.erste) console.log(`    ${z}`);
  }
  console.log("\n  Sehr wahrscheinlich greift eine Regel in");
  console.log("  scripts/neutralisieren-funktionen.py anders als gedacht.");
  process.exit(1);
}

console.log(`[ok] ${geprueft} Funktionen, jede syntaktisch gueltig.`);
console.log("     NICHT geprueft: Typen und Importe — dafuer braeuchte es Deno mit Netz.");
