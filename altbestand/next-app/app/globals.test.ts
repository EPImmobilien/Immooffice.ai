import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Der Dunkelmodus wird an zwei Stellen aktiviert: einmal ueber die
 * Systemeinstellung (@media prefers-color-scheme) und einmal ueber die
 * ausdrueckliche Wahl (:root[data-modus="dunkel"]). Beide Bloecke muessen
 * dieselben Tokens setzen.
 *
 * Genau das ist die Schwachstelle der Loesung: Wer einen Token nur in einem
 * Block ergaenzt, erzeugt einen Fehler, der ausschliesslich bei einer der
 * beiden Aktivierungsarten auftritt — und damit leicht durchrutscht. Dieser
 * Test schliesst die Luecke.
 */

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Liefert die in einem CSS-Block zugewiesenen --f-* und --schatten-* Tokens. */
function tokensAus(block: string): string[] {
  return [...block.matchAll(/(--(?:f|schatten)-[a-z-]+)\s*:/g)]
    .map((treffer) => treffer[1]!)
    .sort();
}

function blockNach(marker: string): string {
  const start = css.indexOf(marker);
  expect(start, `Marker nicht gefunden: ${marker}`).toBeGreaterThan(-1);
  const oeffnend = css.indexOf("{", start);
  let tiefe = 0;
  for (let i = oeffnend; i < css.length; i++) {
    if (css[i] === "{") tiefe++;
    if (css[i] === "}") {
      tiefe--;
      if (tiefe === 0) return css.slice(oeffnend + 1, i);
    }
  }
  throw new Error(`Block nicht geschlossen: ${marker}`);
}

describe("Design-Tokens", () => {
  it("aktiviert im Dunkelmodus ueber beide Wege dieselben Tokens", () => {
    const ueberSystem = tokensAus(blockNach(':root:not([data-modus="hell"])'));
    const ueberWahl = tokensAus(blockNach(':root[data-modus="dunkel"]'));

    expect(ueberSystem.length).toBeGreaterThan(20);
    expect(ueberWahl).toEqual(ueberSystem);
  });

  it("definiert jeden im Dunkelmodus verwendeten Token auch im Hellmodus", () => {
    const hell = new Set(tokensAus(blockNach(":root {")));
    const dunkel = tokensAus(blockNach(':root[data-modus="dunkel"]'));

    const fehlend = dunkel.filter((token) => !hell.has(token));
    expect(fehlend, `Ohne Entsprechung im Hellmodus: ${fehlend.join(", ")}`).toEqual(
      [],
    );
  });

  it("haelt die fixierten Markenfarben aus Abschnitt 3 unveraendert", () => {
    // Diese Werte sind laut Master-Prompt gesetzt und nicht verhandelbar.
    expect(css).toContain("--marke-marine: #1b2a47");
    expect(css).toContain("--marke-marine-dunkel: #12203b");
    expect(css).toContain("--marke-gold: #b5934f");
    expect(css).toContain("--marke-gold-hell: #c9ae72");
  });
});
