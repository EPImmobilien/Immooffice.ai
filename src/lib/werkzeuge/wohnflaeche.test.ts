import { describe, expect, it } from "vitest";

import { ausGrundriss, berechnen, blattLesen, leeresBlatt, teilAnrechenbar, teilGrundflaeche } from "./wohnflaeche";

describe("Wohnflaeche nach WoFlV", () => {
  it("rechnet Teilflaechen mit Anrechnungsfaktoren", () => {
    expect(teilGrundflaeche({ laenge: 4.5, breite: 3.2, flaeche: null })).toBe(14.4);
    expect(teilGrundflaeche({ laenge: null, breite: null, flaeche: 7.777 })).toBe(7.78);
    expect(teilAnrechenbar({ id: "a", bezeichnung: "", laenge: 4, breite: 3, flaeche: null, art: "halb", abzug: false })).toBe(6);
    expect(teilAnrechenbar({ id: "a", bezeichnung: "", laenge: 4, breite: 3, flaeche: null, art: "balkon", abzug: false })).toBe(3);
    expect(teilAnrechenbar({ id: "a", bezeichnung: "", laenge: 4, breite: 3, flaeche: null, art: "zubehoer", abzug: false })).toBe(0);
    expect(teilAnrechenbar({ id: "a", bezeichnung: "Schornstein", laenge: 0.5, breite: 0.5, flaeche: null, art: "voll", abzug: true })).toBe(-0.25);
  });
  it("summiert Raeume und Geschosse", () => {
    const blatt = leeresBlatt();
    const g = blatt.geschosse[0]!;
    g.raeume = [
      { id: "r1", name: "Wohnen", teile: [{ id: "t1", bezeichnung: "", laenge: 5, breite: 4, flaeche: null, art: "voll", abzug: false }, { id: "t2", bezeichnung: "Kamin", laenge: 0.6, breite: 0.5, flaeche: null, art: "voll", abzug: true }] },
      { id: "r2", name: "Dachzimmer", teile: [{ id: "t3", bezeichnung: "", laenge: 4, breite: 3, flaeche: null, art: "voll", abzug: false }, { id: "t4", bezeichnung: "Schräge", laenge: 4, breite: 1.2, flaeche: null, art: "halb", abzug: false }, { id: "t5", bezeichnung: "Drempel", laenge: 4, breite: 0.8, flaeche: null, art: "null", abzug: false }] },
      { id: "r3", name: "Balkon", teile: [{ id: "t6", bezeichnung: "", laenge: null, breite: null, flaeche: 8, art: "balkon", abzug: false }] },
    ];
    const e = berechnen(blatt);
    expect(e.geschosse[0]?.raeume.map((r) => r.wohnflaeche)).toEqual([19.7, 14.4, 2]);
    expect(e.wohnflaeche).toBe(36.1);
    expect(e.grundflaeche).toBe(47.7);
  });
  it("liest gespeicherte Blaetter tolerant und uebernimmt Grundrissraeume", () => {
    const b = blattLesen({ bezeichnung: "Whg 3", geschosse: [{ name: "EG", raeume: [{ name: "Küche", teile: [{ laenge: "3,5".replace(",", "."), breite: 2, art: "kaputt" }] }] }] });
    expect(b.geschosse[0]?.raeume[0]?.teile[0]).toMatchObject({ laenge: 3.5, breite: 2, art: "voll" });
    const mit = ausGrundriss([{ name: "Bad", flaecheM2: 6.123 }], b);
    expect(mit.geschosse[0]?.raeume.map((r) => r.name)).toEqual(["Küche", "Bad"]);
    expect(berechnen(mit).wohnflaeche).toBe(13.12);
  });
});
