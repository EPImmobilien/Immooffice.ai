import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { ExposeKlassisch, type ExposeBranding, type ExposeObjekt } from "./vorlage-klassisch";

const branding: ExposeBranding = {
  firmenname: "Nordlicht Immobilien",
  farbePrimaer: "#1B2A47",
  farbeAkzent: "#B5934F",
  strasse: "Hafenstraße 4",
  plz: "24103",
  ort: "Kiel",
  telefon: "0431 1234567",
  email: "info@nordlicht-immobilien.example",
  web: "www.nordlicht-immobilien.example",
  impressum: null,
};

const objekt: ExposeObjekt = {
  objektnummer: "0001",
  bezeichnung: "ETW Rosenweg 12",
  titel: "Helle 3-Zimmer-Wohnung mit Südbalkon",
  objektkategorie: "wohnung",
  objektart: "Etagenwohnung",
  vermarktungsart: "kauf",
  strasse: "Rosenweg",
  hausnummer: "12",
  plz: "24103",
  ort: "Kiel",
  adresse_veroeffentlichen: true,
  wohnflaeche: 78.5,
  nutzflaeche: null,
  grundstuecksflaeche: null,
  zimmer: 3,
  baujahr: 1998,
  kaufpreis: 349000,
  kaltmiete: null,
  nebenkosten: 210,
  hausgeld: 285,
  provision_kaeufer: "3,57 % inkl. MwSt.",
  energieausweis_typ: "verbrauch",
  energie_kennwert: 94.5,
  energie_klasse: "C",
  beschreibung_objekt: "Die Wohnung liegt im dritten Obergeschoss.",
  beschreibung_ausstattung: "Südbalkon, Einbauküche, Kellerabteil.",
  beschreibung_lage: "Ruhige Wohnlage in Düsternbrook.",
  texte_ki_erzeugt: true,
};

describe("Exposé-PDF", () => {
  it("erzeugt eine gültige PDF-Datei", async () => {
    const puffer = await renderToBuffer(
      <ExposeKlassisch objekt={objekt} branding={branding} />,
    );

    // %PDF- als Dateikennung
    expect(puffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(puffer.length).toBeGreaterThan(2000);
  }, 30_000);

  it("kommt ohne optionale Angaben aus", async () => {
    const puffer = await renderToBuffer(
      <ExposeKlassisch
        objekt={{
          ...objekt,
          titel: null,
          beschreibung_objekt: null,
          beschreibung_ausstattung: null,
          beschreibung_lage: null,
          energieausweis_typ: null,
          energie_kennwert: null,
          energie_klasse: null,
          provision_kaeufer: null,
          texte_ki_erzeugt: false,
        }}
        branding={branding}
      />,
    );
    expect(puffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});
