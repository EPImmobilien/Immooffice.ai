import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import type { ExposeBild, ExposeBranding, ExposeObjekt } from "./typen";
import { VORLAGEN, vorlageFinden } from "./vorlagen";

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

/**
 * Drei gueltige, jeweils andersfarbige PNG-Dateien (48×32).
 *
 * Sie muessen echt sein: Die PDF-Erzeugung verwirft ein unlesbares Bild
 * wortlos, ohne einen Fehler zu werfen. Mit einem kaputten Platzhalter waere
 * jede Bildpruefung hier gruen und trotzdem wertlos — genau das ist beim
 * Schreiben dieser Tests einmal passiert. Unterschiedliche Farben verhindern
 * ausserdem, dass identische Bilder zu einem einzigen Objekt zusammenfallen
 * und die Zaehlung verfaelschen.
 */
const PNGS = [
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAIAAADbtmxLAAAAMUlEQVR42u3OQQ0AAAgEoEtiEhOb0hbOBxsBSPW8EiEhISEhISEhISEhISEhISGhSwuGdxhbW+RwjQAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAIAAADbtmxLAAAAMElEQVR42u3OMQ0AAAgDsAmbRETjgnA0qYCmnVciJCQkJCQkJCQkJCQkJCQkJHRpAe6GGFt/53WLAAAAAElFTkSuQmCC",
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAIAAADbtmxLAAAAMklEQVR42u3OMQ0AAAgDsAlDCSLwf+KCcDSpgKZrXomQkJCQkJCQkJCQkJCQkJCQ0KUFVqQYWz2Pgi8AAAAASUVORK5CYII=",
].map((b64) => Buffer.from(b64, "base64"));

function bild(nr: number, kiBearbeitet = false): ExposeBild {
  return {
    // Vier Bilder reichen fuer jede Vorlage; die Farbe wechselt reihum.
    daten: PNGS[nr % PNGS.length]!,
    format: "png",
    titel: `Ansicht ${nr}`,
    art: "foto",
    kiBearbeitet,
  };
}

const bilder = [bild(1), bild(2, true), bild(3), bild(4), bild(5), bild(6), bild(7)];

function istPdf(puffer: Buffer): boolean {
  return puffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Zahl der tatsaechlich eingebetteten Bilder im fertigen PDF. */
function eingebetteteBilder(puffer: Buffer): number {
  return (puffer.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
}

/** Seitenzahl. `/Type /Pages` ist der Baum und zaehlt nicht mit. */
function seiten(puffer: Buffer): number {
  return (puffer.toString("latin1").match(/\/Type\s*\/Page(?![s/\w])/g) ?? [])
    .length;
}

describe("Exposé-Vorlagen", () => {
  it("stellt genau die fünf Vorlagen aus Abschnitt 8 bereit", () => {
    // Der Aushang zaehlt als eine Vorlage in zwei Formaten.
    const grundformen = new Set(
      VORLAGEN.map((v) => v.schluessel.replace(/_a[34]$/, "")),
    );
    expect(grundformen).toEqual(
      new Set(["klassisch", "modern", "premium", "factsheet", "aushang"]),
    );
  });

  it("kennt keine erfundenen Vorlagen", () => {
    expect(vorlageFinden("gibt-es-nicht")).toBeUndefined();
  });

  /**
   * Erwartete Seitenzahl bei sieben Bildern und vollstaendigen Angaben.
   *
   * Dieser Test ist aus einem echten Fehler entstanden: Die Premium-Vorlage
   * legte Bild und Titelband absolut uebereinander, die PDF-Erzeugung nahm
   * beide trotzdem in den Seitenfluss auf — das Bild fuellte Seite eins
   * allein, der Titel landete auf einer zweiten, sonst leeren Seite. Vier
   * Seiten statt drei, und keine Pruefung hat es bemerkt.
   */
  const SEITEN: Record<string, number> = {
    klassisch: 3,
    modern: 2,
    premium: 3,
    factsheet: 1,
    aushang_a4: 1,
    aushang_a3: 1,
  };

  for (const vorlage of VORLAGEN) {
    it(`${vorlage.name}: hat genau ${SEITEN[vorlage.schluessel]} Seiten`, async () => {
      const puffer = await renderToBuffer(
        vorlage.bauen({ objekt, branding, bilder: bilder.slice(0, vorlage.bilder) }),
      );
      expect(seiten(puffer)).toBe(SEITEN[vorlage.schluessel]);
    }, 40_000);
  }

  it("Kurzexposé bleibt auch mit langen Texten einseitig", async () => {
    const lang = "Ein ausgesprochen ausführlicher Beschreibungstext. ".repeat(60);
    const puffer = await renderToBuffer(
      vorlageFinden("factsheet")!.bauen({
        objekt: {
          ...objekt,
          beschreibung_objekt: lang,
          beschreibung_ausstattung: lang,
          beschreibung_lage: lang,
        },
        branding,
        bilder: [bild(1)],
      }),
    );

    // Der Sinn dieser Vorlage ist die eine Seite. Waechst sie auf zwei, ist sie
    // kein Kurzexposé mehr — deshalb kuerzt die Vorlage die Texte hart.
    expect(seiten(puffer)).toBe(1);
  }, 40_000);

  it("Aushang bleibt auch mit langen Texten einseitig", async () => {
    const lang = "Sehr langer Titel für ein Objekt in bevorzugter Lage ".repeat(6);
    for (const schluessel of ["aushang_a4", "aushang_a3"]) {
      const puffer = await renderToBuffer(
        vorlageFinden(schluessel)!.bauen({
          objekt: { ...objekt, titel: lang },
          branding,
          bilder: [bild(1)],
        }),
      );
      expect(seiten(puffer), schluessel).toBe(1);
    }
  }, 60_000);

  for (const vorlage of VORLAGEN) {
    it(`${vorlage.name}: erzeugt eine gültige PDF-Datei`, async () => {
      const puffer = await renderToBuffer(
        vorlage.bauen({ objekt, branding, bilder: bilder.slice(0, vorlage.bilder) }),
      );
      expect(istPdf(puffer)).toBe(true);
      expect(puffer.length).toBeGreaterThan(1500);
    }, 40_000);

    it(`${vorlage.name}: bettet die angekündigten Bilder wirklich ein`, async () => {
      const puffer = await renderToBuffer(
        vorlage.bauen({ objekt, branding, bilder: bilder.slice(0, vorlage.bilder) }),
      );

      // `bilder` ist die Zusage der Vorlage, wie viele Aufnahmen sie verwendet.
      // Wird sie nicht eingehalten, laedt die PDF-Route Bilder, die niemand
      // sieht — oder die Vorlage bleibt leer, ohne dass es auffaellt.
      expect(eingebetteteBilder(puffer)).toBe(
        Math.min(vorlage.bilder, PNGS.length),
      );
    }, 40_000);

    it(`${vorlage.name}: kommt ohne Bilder aus`, async () => {
      const puffer = await renderToBuffer(
        vorlage.bauen({ objekt, branding, bilder: [] }),
      );
      expect(istPdf(puffer)).toBe(true);
    }, 40_000);

    it(`${vorlage.name}: kommt ohne optionale Angaben aus`, async () => {
      const puffer = await renderToBuffer(
        vorlage.bauen({
          objekt: {
            ...objekt,
            titel: null,
            beschreibung_objekt: null,
            beschreibung_ausstattung: null,
            beschreibung_lage: null,
            energieausweis_typ: null,
            energie_kennwert: null,
            energie_klasse: null,
            provision_kaeufer: null,
            nebenkosten: null,
            hausgeld: null,
            wohnflaeche: null,
            zimmer: null,
            baujahr: null,
            texte_ki_erzeugt: false,
          },
          branding,
          bilder: [],
        }),
      );
      expect(istPdf(puffer)).toBe(true);
    }, 40_000);
  }
});
