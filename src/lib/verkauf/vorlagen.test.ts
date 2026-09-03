import { describe, expect, it } from "vitest";

import { maklervertragSchema, maklervertragText, objektnachweisSchema, objektnachweisText, provisionsWarnung, vollmachtText, type Auftraggeberfirma } from "./vorlagen";

const firma: Auftraggeberfirma = { firmenname: "Muster Immobilien GmbH", strasse: "Hauptstraße", hausnummer: "1", plz: "60311", ort: "Frankfurt", vertreter: "Erika Muster" };

describe("Maklervertrag-Vorlage", () => {
  const daten = maklervertragSchema.parse({
    verkaeufer_typ: "eheleute",
    personen: [{ anrede: "Herr", name: "Max Beispiel", strasse: "Weg 2", plz: "60322", ort: "Frankfurt" }, { anrede: "Frau", name: "Eva Beispiel" }],
    objekt: { strasse: "Lindenallee 12", plz: "60322", ort: "Frankfurt", bezeichnung: "3-Zimmer-Wohnung" },
    angebotspreis: 389000,
    provision_prozent: 3.57,
    provisionsmodell: "teilung",
    vollmacht_mitgenerieren: true,
  });

  it("nennt Parteien, Objekt, Preis, Provision und Musterhinweis", () => {
    const t = maklervertragText(daten, firma);
    expect(t).toContain("Muster und keine Rechtsberatung");
    expect(t).toContain("Max Beispiel");
    expect(t).toContain("Muster Immobilien GmbH");
    expect(t).toContain("Lindenallee 12");
    expect(t).toContain("389.000");
    expect(t).toContain("3,57 %");
    expect(t).toContain("je zur Hälfte");
    expect(t).toContain("§ 8 Widerrufsrecht");
    expect(t).toContain("Anlage: Vollmacht");
  });

  it("unterscheidet Verbraucher und Unternehmer beim Widerruf", () => {
    const u = maklervertragText({ ...daten, verbraucher: false }, firma);
    expect(u).toContain("Kein Widerrufsrecht");
    expect(u).not.toContain("§ 8 Widerrufsrecht");
  });

  it("warnt bei Kaeuferprovision fuer Wohnung/EFH nach § 656d", () => {
    expect(provisionsWarnung({ ...daten, provisionsmodell: "kaeufer" })).toMatch(/656d/);
    expect(provisionsWarnung({ ...daten, provisionsmodell: "kaeufer", objekt: { ...daten.objekt, wohnung_oder_efh: false } })).toBeNull();
    expect(provisionsWarnung(daten)).toBeNull();
  });

  it("Vollmacht nennt Vollmachtgeber, Zwecke und Untervollmacht", () => {
    const v = vollmachtText(daten, firma);
    expect(v).toContain("VOLLMACHT");
    expect(v).toContain("Grundbuch");
    expect(v).toContain("keine Untervollmacht");
    expect(vollmachtText({ ...daten, untervollmacht: true }, firma)).toContain("darf Untervollmacht");
  });

  it("Firma als Auftraggeber", () => {
    const f = maklervertragText({ ...daten, verkaeufer_typ: "firma", firma: { name: "Bau GmbH", register: "HRB 1", vertreter: "Herr Chef" } }, firma);
    expect(f).toContain("Bau GmbH (HRB 1), vertreten durch Herr Chef");
  });
});

describe("Objektnachweis-Vorlage", () => {
  it("nennt Interessent, Objekt, Provision und § 656c", () => {
    const d = objektnachweisSchema.parse({ kaeufer: [{ name: "Jonas Schneider" }], objekt: { strasse: "Berger Str. 1", plz: "60385", ort: "Frankfurt" }, angebotspreis: 250000, besichtigt_am: "04.09.2026" });
    const t = objektnachweisText(d, firma);
    expect(t).toContain("Jonas Schneider");
    expect(t).toContain("250.000");
    expect(t).toContain("§ 656c");
    expect(t).toContain("04.09.2026");
    expect(t).toContain("Textform");
  });
});
