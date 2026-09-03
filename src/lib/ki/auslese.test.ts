import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { heuristischAuslesen } from "./auslese";
import { importZuFormular, MAKLERVERTRAG_FELDER } from "@/lib/verkauf/import";

describe("Auslesung ohne KI", () => {
  it("erkennt Provision, Preis, Laufzeit, PLZ/Ort, Datum", () => {
    const text = "Maklervertrag vom 12.03.2026 zwischen Max Beispiel, Weg 2, 60322 Frankfurt und ... Angebotspreis: 389.000,00 € ... Provision 3,57 % ... Laufzeit 6 Monate ... je zur Hälfte";
    const w = heuristischAuslesen(text, MAKLERVERTRAG_FELDER);
    expect(w["provision_prozent"]).toBe("3,57");
    expect(w["angebotspreis"]).toBe("389.000,00");
    expect(w["laufzeit_monate"]).toBe("6");
    expect(w["objekt_plz"]).toBe("60322");
    expect(w["objekt_ort"]).toBe("Frankfurt");
    expect(w["geschlossen_am"]).toBe("2026-03-12");
    expect(w["provisionsmodell"]).toBe("teilung");
    expect(w["verkaeufer_name"]).toBeNull();
  });

  it("ueberfuehrt Werte in Formulardaten", () => {
    const f = importZuFormular({ verkaeufer_name: "Max Beispiel; Eva Beispiel", verkaeufer_typ: "eheleute", provision_prozent: "3,57", angebotspreis: "389.000,00", laufzeit_monate: "6", objekt_ort: "Frankfurt", provisionsmodell: "teilung", vertragsart: null });
    expect(f.verkaeufer_typ).toBe("eheleute");
    expect(f.personen.map((p) => p.name)).toEqual(["Max Beispiel", "Eva Beispiel"]);
    expect(f.provision_prozent).toBe(3.57);
    expect(f.angebotspreis).toBe(389000);
    expect(f.laufzeit_monate).toBe(6);
    expect(f.objekt.ort).toBe("Frankfurt");
  });
});
