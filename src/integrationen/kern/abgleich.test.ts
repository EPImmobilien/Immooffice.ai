import { describe, expect, it } from "vitest";

import {
  abgleichEntscheiden,
  anschriftSchluessel,
  kontaktDubletten,
  kontaktSchluessel,
  normalisieren,
  objektDubletten,
} from "./abgleich";
import { leerenKontakt, leeresObjektMit } from "./testhelfer";

describe("Normalisierung", () => {
  it("macht Umlaute, Abkuerzungen und Leerraum vergleichbar", () => {
    expect(normalisieren("Königstr. 12")).toBe("koenigstrasse 12");
    expect(normalisieren("  Große   Straße ")).toBe("grosse strasse");
    expect(normalisieren(null)).toBe("");
  });

  it("Anschrift-Schluessel braucht Strasse und Hausnummer", () => {
    expect(anschriftSchluessel({ plz: "24103", strasse: "Holstenstraße", hausnummer: "1a" })).toBe(
      "24103|holstenstrasse|1a",
    );
    expect(anschriftSchluessel({ plz: "24103", strasse: null, hausnummer: "1" })).toBeNull();
    // Ohne PLZ hilft der Ort.
    expect(anschriftSchluessel({ plz: null, strasse: "Am Markt", hausnummer: "3", ort: "Kiel" })).toBe(
      "kiel|am markt|3",
    );
  });

  it("Kontakt-Schluessel bevorzugt die E-Mail", () => {
    expect(kontaktSchluessel({ email: "A@B.de", vorname: "X", nachname: "Y", firma: null })).toBe("email|a b de");
    expect(kontaktSchluessel({ email: null, vorname: "Erika", nachname: "Muster", firma: null })).toBe(
      "name|muster|erika",
    );
    expect(kontaktSchluessel({ email: null, vorname: null, nachname: null, firma: "Muster GmbH" })).toBe(
      "firma|muster gmbh",
    );
    expect(kontaktSchluessel({ email: null, vorname: null, nachname: null, firma: null })).toBeNull();
  });
});

describe("Dubletten", () => {
  it("findet Objekte ueber die Anschrift, auch bei anderer Schreibweise", () => {
    const neu = leeresObjektMit("F1", { plz: "24103", strasse: "Holstenstr.", hausnummer: "1" });
    const bestand = [
      { id: "L1", bezeichnung: "Altbau", plz: "24103", strasse: "Holstenstraße", hausnummer: "1", ort: "Kiel" },
      { id: "L2", bezeichnung: "Neubau", plz: "24103", strasse: "Holstenstraße", hausnummer: "2", ort: "Kiel" },
    ];
    const treffer = objektDubletten([neu], bestand);
    expect(treffer).toHaveLength(1);
    expect(treffer[0]!.bestand.id).toBe("L1");
    expect(treffer[0]!.grund).toBe("anschrift");
  });

  it("meldet keine Dublette ohne Hausnummer", () => {
    const neu = leeresObjektMit("F1", { plz: "24103", strasse: "Holstenstraße", hausnummer: null });
    expect(
      objektDubletten([neu], [
        { id: "L1", bezeichnung: "x", plz: "24103", strasse: "Holstenstraße", hausnummer: null, ort: null },
      ]),
    ).toEqual([]);
  });

  it("findet Kontakte ueber E-Mail vor Name", () => {
    const perMail = leerenKontakt("K1", { email: "erika@example.org", nachname: "Anders" });
    const perName = leerenKontakt("K2", { vorname: "Max", nachname: "Muster" });
    const bestand = [
      { id: "B1", email: "ERIKA@example.org", vorname: "Erika", nachname: "Muster", firma: null },
      { id: "B2", email: null, vorname: "Max", nachname: "Muster", firma: null },
    ];
    const treffer = kontaktDubletten([perMail, perName], bestand);
    expect(treffer.map((t) => [t.bestand.id, t.grund])).toEqual([
      ["B1", "email"],
      ["B2", "name"],
    ]);
  });
});

describe("Konfliktentscheid", () => {
  const t1 = "2026-09-01T10:00:00Z";
  const t2 = "2026-09-02T10:00:00Z";
  const t3 = "2026-09-03T10:00:00Z";

  it("nichts geaendert → unveraendert", () => {
    expect(abgleichEntscheiden({ lokal_geaendert: t1, fremd_geaendert: t1, zuletzt_lokal: t1, zuletzt_fremd: t1 }))
      .toEqual({ entscheid: "unveraendert", konflikt: false });
  });

  it("nur eine Seite geaendert → diese gewinnt, kein Konflikt", () => {
    expect(abgleichEntscheiden({ lokal_geaendert: t2, fremd_geaendert: t1, zuletzt_lokal: t1, zuletzt_fremd: t1 }))
      .toEqual({ entscheid: "lokal_gewinnt", konflikt: false });
    expect(abgleichEntscheiden({ lokal_geaendert: t1, fremd_geaendert: t2, zuletzt_lokal: t1, zuletzt_fremd: t1 }))
      .toEqual({ entscheid: "fremd_gewinnt", konflikt: false });
  });

  it("beide geaendert → die juengere gewinnt UND es ist ein Konflikt", () => {
    expect(abgleichEntscheiden({ lokal_geaendert: t2, fremd_geaendert: t3, zuletzt_lokal: t1, zuletzt_fremd: t1 }))
      .toEqual({ entscheid: "fremd_gewinnt", konflikt: true });
    expect(abgleichEntscheiden({ lokal_geaendert: t3, fremd_geaendert: t2, zuletzt_lokal: t1, zuletzt_fremd: t1 }))
      .toEqual({ entscheid: "lokal_gewinnt", konflikt: true });
  });

  it("erster Lauf ohne bekannte Zeitstempel: das Fremdsystem gilt als geaendert", () => {
    expect(abgleichEntscheiden({ lokal_geaendert: null, fremd_geaendert: t1, zuletzt_lokal: null, zuletzt_fremd: null }))
      .toEqual({ entscheid: "fremd_gewinnt", konflikt: false });
  });

  it("unlesbare Zeitstempel bei beidseitiger Aenderung → Konflikt ohne Entscheid", () => {
    expect(abgleichEntscheiden({ lokal_geaendert: "gestern", fremd_geaendert: t2, zuletzt_lokal: t1, zuletzt_fremd: t1 }))
      .toEqual({ entscheid: "konflikt", konflikt: true });
  });
});
