import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { kann } from "./connector";
import { CONNECTOREN, connectorFinden, faehigkeitenVon, istAnbieter } from "./registry";

describe("Registry", () => {
  it("kennt die vier Anbieter der Stufe 1 in Anzeigereihenfolge", () => {
    expect(CONNECTOREN.map((c) => c.id)).toEqual(["openimmo", "onoffice", "propstack", "flowfact"]);
    expect(istAnbieter("onoffice")).toBe(true);
    expect(istAnbieter("immoscout24")).toBe(false);
    expect(connectorFinden("nichts")).toBeNull();
  });

  it("die Anbieter stimmen mit dem Check-Constraint der Migration ueberein", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20260903120100_integrationen.sql", import.meta.url),
      "utf8",
    );
    for (const c of CONNECTOREN) expect(sql).toContain(`'${c.id}'`);
  });

  it("kein Connector bringt Standardzugangsdaten mit", () => {
    for (const c of CONNECTOREN) {
      for (const feld of c.anmeldefelder) {
        expect("vorgabe" in feld).toBe(false);
      }
      // Ein leeres Formular darf bei Anmeldung ≠ keine nie durchgehen.
      if (c.anmeldung !== "keine") {
        expect(c.zugangsdatenSchema.safeParse({}).success).toBe(false);
      }
    }
  });

  it("erklaerte Faehigkeiten sind auch umgesetzt — oder ausdruecklich nicht", () => {
    // OpenImmo und onOffice sind Stufe 1 und muessen alles liefern, was sie
    // erklaeren. Propstack und FlowFact sind angekuendigt (Phase 4) und
    // duerfen noch keine Faehigkeit erklaeren, die sie nicht erfuellen.
    for (const c of CONNECTOREN) {
      for (const f of c.faehigkeiten) {
        expect(kann(c, f), `${c.id}: ${f}`).toBe(true);
      }
    }
    expect(faehigkeitenVon("openimmo")).toContain("objekte_holen");
    expect(faehigkeitenVon("openimmo")).toContain("objekte_senden");
    expect(faehigkeitenVon("onoffice")).toEqual(
      expect.arrayContaining(["objekte_holen", "objekte_senden", "kontakte_holen", "kontakte_senden", "bilder"]),
    );
  });
});
