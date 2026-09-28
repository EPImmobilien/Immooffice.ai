import { describe, expect, it } from "vitest";

import {
  hatRecht,
  rechtErzwingen,
  sichtbareModule,
  type Uebersteuerung,
} from "./rechte";

describe("Rollenvorbelegung", () => {
  it("gibt dem Inhaber alles", () => {
    expect(hatRecht("inhaber", "abrechnung", "loeschen")).toBe(true);
  });

  it("lässt Nur-Lese-Zugriff nichts verändern", () => {
    expect(hatRecht("nur_lesen", "objekte", "lesen")).toBe(true);
    expect(hatRecht("nur_lesen", "objekte", "aendern")).toBe(false);
    expect(hatRecht("nur_lesen", "objekte", "loeschen")).toBe(false);
  });

  it("verweigert ein Modul, das die Rolle gar nicht hat", () => {
    // Marketing hat keine Wertermittlung — nicht „nur lesen", sondern gar nicht.
    expect(hatRecht("marketing", "wertermittlung", "lesen")).toBe(false);
  });
});

describe("Übersteuerung je Benutzer", () => {
  it("gewährt ein Recht, das die Rolle nicht vorsieht", () => {
    const u: Uebersteuerung = { wertermittlung: { lesen: true } };
    expect(hatRecht("marketing", "wertermittlung", "lesen")).toBe(false);
    expect(hatRecht("marketing", "wertermittlung", "lesen", u)).toBe(true);
  });

  it("entzieht ein Recht, das die Rolle vorsieht", () => {
    // Der wichtigere Fall: Ein Entzug muss wirken. Greift er nicht, bleibt ein
    // vermeintlich entzogenes Recht bestehen, ohne dass es auffällt.
    const u: Uebersteuerung = { objekte: { loeschen: false } };
    expect(hatRecht("inhaber", "objekte", "loeschen")).toBe(true);
    expect(hatRecht("inhaber", "objekte", "loeschen", u)).toBe(false);
  });

  it("wirkt nur auf die genannte Aktion", () => {
    const u: Uebersteuerung = { objekte: { loeschen: false } };
    expect(hatRecht("inhaber", "objekte", "aendern", u)).toBe(true);
  });

  it("wirkt nur auf das genannte Modul", () => {
    const u: Uebersteuerung = { objekte: { loeschen: false } };
    expect(hatRecht("inhaber", "kontakte", "loeschen", u)).toBe(true);
  });

  it("lässt eine leere Übersteuerung die Rolle unberührt", () => {
    expect(hatRecht("makler", "objekte", "aendern", {})).toBe(true);
    expect(hatRecht("makler", "objekte", "loeschen", {})).toBe(false);
  });
});

describe("Sichtbare Module", () => {
  it("blendet ein entzogenes Modul aus der Navigation aus", () => {
    const u: Uebersteuerung = { marketing: { lesen: false } };
    expect(sichtbareModule("makler")).toContain("marketing");
    expect(sichtbareModule("makler", u)).not.toContain("marketing");
  });

  it("blendet ein zusätzlich gewährtes Modul ein", () => {
    const u: Uebersteuerung = { auswertungen: { lesen: true } };
    expect(sichtbareModule("marketing")).not.toContain("auswertungen");
    expect(sichtbareModule("marketing", u)).toContain("auswertungen");
  });
});

describe("Rechteerzwingung", () => {
  it("wirft ohne Recht", () => {
    expect(() => rechtErzwingen("nur_lesen", "objekte", "loeschen")).toThrow();
  });

  it("wirft nicht mit Recht", () => {
    expect(() => rechtErzwingen("inhaber", "objekte", "loeschen")).not.toThrow();
  });

  it("berücksichtigt den Entzug", () => {
    // Der Grund, warum die Übersteuerung an JEDER Prüfstelle mitgegeben werden
    // muss: Wird sie vergessen, wirft diese Funktion nicht — und der Entzug ist
    // wirkungslos, ohne dass irgendetwas fehlschlägt.
    const u: Uebersteuerung = { objekte: { loeschen: false } };
    expect(() => rechtErzwingen("inhaber", "objekte", "loeschen", u)).toThrow();
  });
});
