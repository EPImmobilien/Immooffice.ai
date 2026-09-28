import { describe, expect, it } from "vitest";

import { ZUSTANDSFELDER, notenTon, vollstaendigkeit } from "./aufnahme";

describe("Zustandsnoten", () => {
  it("stellt „unbekannt“ neutral dar und nicht als Mangel", () => {
    // Nicht beurteilt zu haben ist kein Mangel, sondern eine offene Frage.
    // Als Warnung dargestellt wuerde jede frische Aufnahme alarmierend aussehen.
    expect(notenTon("unbekannt")).toBe("neutral");
  });

  it("steigert von gut über mittel zu schlecht", () => {
    expect(notenTon("gut")).toBe("erfolg");
    expect(notenTon("mittel")).toBe("warnung");
    expect(notenTon("schlecht")).toBe("fehler");
  });
});

describe("Zustandsfelder", () => {
  it("führt genau die sechs vor Ort beurteilbaren Bauteile", () => {
    expect(ZUSTANDSFELDER.map((z) => z.feld)).toEqual([
      "zustand_dach",
      "zustand_fassade",
      "zustand_fenster",
      "zustand_heizung",
      "zustand_baeder",
      "zustand_elektrik",
    ]);
  });

  it("geht von außen nach innen", () => {
    // Die Reihenfolge folgt dem Weg durch das Haus, nicht dem Alphabet: Wer
    // eine Aufnahme abarbeitet, geht ums Haus und dann hinein.
    const felder = ZUSTANDSFELDER.map((z) => z.feld);
    expect(felder.indexOf("zustand_dach")).toBeLessThan(
      felder.indexOf("zustand_baeder"),
    );
  });
});

describe("Vollständigkeit", () => {
  const leer = {
    wohnflaeche: null,
    zimmer: null,
    baujahr: null,
    objektkategorie: null,
    kontakt_id: null,
  };

  it("ist bei einer leeren Aufnahme null", () => {
    expect(vollstaendigkeit(leer)).toBe(0);
  });

  it("ist bei vollständigen Angaben hundert", () => {
    expect(
      vollstaendigkeit({
        wohnflaeche: 78.5,
        zimmer: 3,
        baujahr: 1998,
        objektkategorie: "wohnung",
        kontakt_id: "11111111-1111-1111-1111-111111111111",
      }),
    ).toBe(100);
  });

  it("zählt eine Fläche von null als Angabe", () => {
    // Ein Grundstueck mit 0 m² Wohnflaeche ist eine getroffene Aussage, kein
    // fehlender Wert. Mit einer Wahrheitsprüfung waere sie verschwunden.
    expect(vollstaendigkeit({ ...leer, wohnflaeche: 0 })).toBe(20);
  });

  it("wächst mit jeder Angabe", () => {
    expect(vollstaendigkeit({ ...leer, zimmer: 3 })).toBe(20);
    expect(vollstaendigkeit({ ...leer, zimmer: 3, baujahr: 1998 })).toBe(40);
  });
});
