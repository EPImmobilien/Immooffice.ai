import { describe, expect, it } from "vitest";

import { VORLAGEN, istVorlage, vorlage } from "./vorlagen";

const kontext = {
  unternehmen: "Muster Immobilien",
  testphaseBis: "2026-09-10T12:00:00Z",
  loeschungAm: "2026-10-10T12:00:00Z",
  aboAdresse: "https://immooffice.example/credits",
};

describe("Mailvorlagen", () => {
  it("kennt genau die vier Erinnerungen aus S2 und S3", () => {
    expect(VORLAGEN).toEqual(["testphase_tag5", "testphase_tag7", "loeschung_tag23", "loeschung_tag29"]);
    expect(istVorlage("testphase_tag5")).toBe(true);
    expect(istVorlage("werbung")).toBe(false);
  });

  it("jede Vorlage nennt das Unternehmen, den Weg zum Tarif und den Netto-Hinweis oder die Loeschfrist", () => {
    for (const s of VORLAGEN) {
      const m = vorlage(s, kontext);
      expect(m.betreff.length).toBeGreaterThan(10);
      expect(m.text).toContain("Muster Immobilien");
      expect(m.text).toContain(kontext.aboAdresse);
    }
    expect(vorlage("testphase_tag5", kontext).text).toContain("netto");
    expect(vorlage("testphase_tag5", kontext).text).toContain("10.09.2026");
    expect(vorlage("loeschung_tag23", kontext).text).toContain("10.10.2026");
  });

  it("verspricht ohne Loeschtermin keine Loeschung", () => {
    const m = vorlage("testphase_tag7", { ...kontext, loeschungAm: null });
    expect(m.text).not.toContain("gelöscht");
  });
});
