import { describe, expect, it } from "vitest";

import {
  AA_GROSS,
  AA_TEXT,
  cssVariablen,
  hexNormalisieren,
  hexZuOklch,
  istHexfarbe,
  kontrast,
  kontrastKorrigieren,
  kontrastPruefen,
  oklchZuHex,
  paletteAbleiten,
  textfarbeAuf,
} from "./farben";

const MARINE = "#1B2A47";
const GOLD = "#B5934F";

describe("Hexfarben", () => {
  it("erkennt und normalisiert", () => {
    expect(istHexfarbe("#1b2a47")).toBe(true);
    expect(istHexfarbe("1B2A47")).toBe(true);
    expect(istHexfarbe("#fff")).toBe(false);
    expect(hexNormalisieren(" 1b2a47 ")).toBe("#1B2A47");
    expect(() => hexNormalisieren("blau")).toThrow();
  });
});

describe("OKLCH-Umrechnung", () => {
  it("ist in beide Richtungen stabil", () => {
    for (const hex of [MARINE, GOLD, "#FFFFFF", "#000000", "#FF0000", "#7A828C"]) {
      expect(oklchZuHex(hexZuOklch(hex))).toBe(hex);
    }
  });

  it("liefert bekannte Helligkeiten", () => {
    expect(hexZuOklch("#FFFFFF").l).toBeCloseTo(1, 2);
    expect(hexZuOklch("#000000").l).toBeCloseTo(0, 2);
    expect(hexZuOklch("#808080").c).toBeCloseTo(0, 3);
  });

  it("holt Farben ausserhalb des sRGB-Raums zurueck, statt zu clippen", () => {
    // Uebertriebenes Chroma bei mittlerer Helligkeit: kein Fehler, gueltiges Hex.
    const hex = oklchZuHex({ l: 0.6, c: 0.5, h: 250 });
    expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("Kontrast nach WCAG", () => {
  it("rechnet die Grenzfaelle richtig", () => {
    expect(kontrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(kontrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 3);
    // Reihenfolge egal
    expect(kontrast(MARINE, GOLD)).toBeCloseTo(kontrast(GOLD, MARINE), 6);
  });

  it("Plattformfarben bestehen AA", () => {
    expect(kontrast(MARINE, "#FFFFFF")).toBeGreaterThan(AA_TEXT);
    expect(kontrast(MARINE, GOLD)).toBeGreaterThan(AA_GROSS);
    expect(textfarbeAuf(MARINE)).toBe("#FFFFFF");
    expect(textfarbeAuf("#F5E6B8")).toBe("#111111");
  });

  it("die Plattformfarben: genau ein Befund, und zwar Gold auf Weiss", () => {
    // Ein echter Befund, den die Pruefung beim ersten Lauf geliefert hat: Das
    // feste Plattform-Gold erreicht auf Weiss nur 2,9 statt 3,0. Die Marke ist
    // fixiert (CLAUDE.md), also bleibt der Wert — aber die Pruefung darf ihn
    // nicht verschweigen. Der Vorschlag ist ein leicht dunkleres Gold.
    const befunde = kontrastPruefen(MARINE, GOLD);
    expect(befunde).toHaveLength(1);
    expect(befunde[0]!.stelle).toContain("auf Weiss");
    expect(befunde[0]!.verhaeltnis).toBeCloseTo(2.9, 1);
    expect(befunde[0]!.vorschlag).not.toBeNull();
    expect(kontrast(befunde[0]!.vorschlag!, "#FFFFFF")).toBeGreaterThanOrEqual(AA_GROSS);
  });

  it("warnt bei zu wenig Kontrast und schlaegt eine Korrektur vor", () => {
    // Mittleres Grau als Hauptfarbe, fast gleiches Grau als Akzent.
    const befunde = kontrastPruefen("#8A8A8A", "#9A9A9A");
    expect(befunde.length).toBeGreaterThan(0);

    for (const befund of befunde) {
      expect(befund.verhaeltnis).toBeLessThan(befund.mindestens);
      expect(befund.vorschlag).not.toBeNull();
    }

    const akzentBefund = befunde.find(
      (b) => b.ersetzt === "akzent" && b.stelle.includes("auf der Hauptfarbe"),
    );
    expect(akzentBefund).toBeDefined();
    expect(kontrast(akzentBefund!.vorschlag!, "#8A8A8A")).toBeGreaterThanOrEqual(AA_GROSS);
  });

  it("die Korrektur bewahrt den Farbton", () => {
    const vorschlag = kontrastKorrigieren("#C9AE72", "#FFFFFF", AA_TEXT);
    expect(vorschlag).not.toBeNull();
    const vorher = hexZuOklch("#C9AE72");
    const nachher = hexZuOklch(vorschlag!);
    expect(Math.abs(vorher.h - nachher.h)).toBeLessThan(6);
    expect(nachher.l).toBeLessThan(vorher.l);
    expect(kontrast(vorschlag!, "#FFFFFF")).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("gibt null zurueck, wenn keine Korrektur moeglich ist", () => {
    // Von Weiss aus laesst sich kein Kontrast 21 gegen Weiss erzeugen —
    // nur Schwarz erreicht ihn, und das ist keine Verschiebung mehr.
    expect(kontrastKorrigieren("#FFFFFF", "#FFFFFF", 22)).toBeNull();
  });
});

describe("Paletteableitung", () => {
  const p = paletteAbleiten("1b2a47", GOLD);

  it("normalisiert die Eingaben", () => {
    expect(p.primaer).toBe(MARINE);
    expect(p.akzent).toBe(GOLD);
  });

  it("dunkle Hauptfarbe: Hover hellt auf, Dunkel dunkelt ab", () => {
    expect(hexZuOklch(p.primaerHover).l).toBeGreaterThan(hexZuOklch(p.primaer).l);
    expect(hexZuOklch(p.primaerDunkel).l).toBeLessThan(hexZuOklch(p.primaer).l);
  });

  it("helle Hauptfarbe: Hover dunkelt ab", () => {
    const hell = paletteAbleiten("#E8D9B5", MARINE);
    expect(hexZuOklch(hell.primaerHover).l).toBeLessThan(hexZuOklch(hell.primaer).l);
    expect(hell.textAufPrimaer).toBe("#111111");
  });

  it("Grund, Linie und Flaeche sind sehr hell", () => {
    expect(hexZuOklch(p.grund).l).toBeGreaterThan(0.97);
    expect(hexZuOklch(p.linie).l).toBeGreaterThan(0.88);
    expect(p.flaeche).toBe("#FFFFFF");
    expect(kontrast(p.gedaempft, p.flaeche)).toBeGreaterThan(AA_GROSS);
  });

  it("liefert alle CSS-Variablen als Hex", () => {
    const css = cssVariablen(p);
    expect(Object.keys(css)).toHaveLength(13);
    for (const [name, wert] of Object.entries(css)) {
      expect(name.startsWith("--marke-")).toBe(true);
      expect(wert).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
