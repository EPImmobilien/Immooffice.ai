import { describe, expect, it } from "vitest";

import { exportMoeglich, exportPruefen } from "./pruefung";
import type { OpenImmoAnbieter, OpenImmoObjekt } from "./typen";
import { openImmoXml } from "./xml";

const anbieter: OpenImmoAnbieter = {
  firmenname: "Nordlicht Immobilien",
  anbieternummer: "12345",
  openimmoAnid: "nordlicht-anid",
  email: "portal@nordlicht.example",
  telefon: "0431 1234567",
  ansprechpartner: "Maria Berger",
};

const vollstaendig: OpenImmoObjekt = {
  id: "8f1c2a3e-0000-4000-8000-000000000001",
  objektnummer: "0001",
  bezeichnung: "ETW Rosenweg 12",
  titel: "Helle 3-Zimmer-Wohnung mit Südbalkon",
  vermarktungsart: "kauf",
  objektkategorie: "wohnung",
  objektart: "Etagenwohnung",
  nutzungsart: "wohnen",
  strasse: "Rosenweg",
  hausnummer: "12",
  plz: "24103",
  ort: "Kiel",
  ortsteil: "Düsternbrook",
  land: "DE",
  etage: "3",
  etagen_gesamt: 4,
  wohnungsnummer: "3a",
  lat: 54.3233,
  lon: 10.1394,
  adresse_veroeffentlichen: true,
  wohnflaeche: 78.5,
  nutzflaeche: null,
  gesamtflaeche: null,
  grundstuecksflaeche: null,
  zimmer: 3,
  schlafzimmer: 2,
  badezimmer: 1,
  anzahl_balkone: 1,
  anzahl_terrassen: null,
  stellplatz_anzahl: 1,
  baujahr: 1998,
  letzte_modernisierung: 2019,
  zustand: "Gepflegt",
  verfuegbar_ab: "sofort",
  kaufpreis: 349000,
  kaufpreis_auf_anfrage: false,
  kaltmiete: null,
  warmmiete: null,
  nebenkosten: 210,
  heizkosten: null,
  kaution: null,
  hausgeld: 285,
  miete_ist: null,
  provision_kaeufer: "3,57 % inkl. MwSt.",
  provision_hinweis: null,
  courtage_frei: false,
  energieausweis_typ: "verbrauch",
  energie_kennwert: 94.5,
  energie_klasse: "C",
  energie_traeger: "Gas",
  energie_baujahr_anlage: 2012,
  energie_warmwasser_enthalten: true,
  energie_gueltig_bis: "2031-05-01",
  beschreibung_objekt: "Die Wohnung liegt im dritten Obergeschoss.",
  beschreibung_ausstattung: "Südbalkon, Einbauküche.",
  beschreibung_lage: "Ruhige Wohnlage.",
  beschreibung_sonstiges: null,
  texte_freigegeben_am: "2026-08-16T10:00:00Z",
  geaendert_am: "2026-08-16T12:30:00Z",
};

function xmlVon(objekt: OpenImmoObjekt): string {
  return openImmoXml({
    objekte: [{ objekt, ausstattung: [], modus: "NEU" }],
    anbieter,
    zeitstempel: "2026-08-16T12:30:00",
  });
}

describe("Vollständigkeitsprüfung", () => {
  it("lässt ein vollständiges Objekt durch", () => {
    const befunde = exportPruefen(vollstaendig);
    expect(befunde.filter((b) => b.schwere === "fehler")).toEqual([]);
    expect(exportMoeglich(befunde)).toBe(true);
  });

  it("blockiert ohne freigegebene Texte", () => {
    const befunde = exportPruefen({ ...vollstaendig, texte_freigegeben_am: null });
    expect(exportMoeglich(befunde)).toBe(false);
    expect(befunde.map((b) => b.feld)).toContain("texte_freigegeben_am");
  });

  it("blockiert ohne Energieangaben", () => {
    const ohneTyp = exportPruefen({ ...vollstaendig, energieausweis_typ: null });
    expect(exportMoeglich(ohneTyp)).toBe(false);

    const ohneKennwert = exportPruefen({ ...vollstaendig, energie_kennwert: null });
    expect(exportMoeglich(ohneKennwert)).toBe(false);
  });

  it("verlangt bei Grundstücken keine Energieangaben", () => {
    const befunde = exportPruefen({
      ...vollstaendig,
      objektkategorie: "grundstueck",
      energieausweis_typ: null,
      energie_kennwert: null,
      wohnflaeche: null,
      zimmer: null,
      grundstuecksflaeche: 640,
    });
    expect(exportMoeglich(befunde)).toBe(true);
  });

  it("verlangt bei Mietobjekten die Kaltmiete", () => {
    const befunde = exportPruefen({
      ...vollstaendig,
      vermarktungsart: "miete",
      kaufpreis: null,
      kaltmiete: null,
    });
    expect(befunde.map((b) => b.feld)).toContain("kaltmiete");
  });

  it("akzeptiert Kaufpreis auf Anfrage", () => {
    const befunde = exportPruefen({
      ...vollstaendig,
      kaufpreis: null,
      kaufpreis_auf_anfrage: true,
    });
    expect(exportMoeglich(befunde)).toBe(true);
  });
});

describe("OpenImmo-XML", () => {
  it("erzeugt ein wohlgeformtes Dokument mit Rahmenelementen", () => {
    const xml = xmlVon(vollstaendig);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<openimmo xmlns="http://www.openimmo.de">');
    expect(xml).toContain("</openimmo>");
    expect(xml).toContain("<anbieternr>12345</anbieternr>");
    expect(xml).toContain("<firma>Nordlicht Immobilien</firma>");
  });

  it("bildet Vermarktungs- und Nutzungsart als Attribute ab", () => {
    const xml = xmlVon(vollstaendig);
    expect(xml).toContain('<vermarktungsart KAUF="true" MIETE_PACHT="false"');
    expect(xml).toContain('WOHNEN="true" GEWERBE="false"');
    expect(xml).toContain('<wohnung wohnungtyp="ETAGENWOHNUNG"/>');
  });

  it("schreibt den Kennwert beim Verbrauchsausweis in das Verbrauchselement", () => {
    const xml = xmlVon(vollstaendig);
    expect(xml).toContain("<epart>VERBRAUCH</epart>");
    expect(xml).toContain("<energieverbrauchkennwert>94.5</energieverbrauchkennwert>");
    // Der Bedarfswert darf NICHT gesetzt sein — Portale weisen sonst ab.
    expect(xml).not.toContain("<endenergiebedarf>");
  });

  it("schreibt den Kennwert beim Bedarfsausweis in das Bedarfselement", () => {
    const xml = xmlVon({ ...vollstaendig, energieausweis_typ: "bedarf" });
    expect(xml).toContain("<epart>BEDARF</epart>");
    expect(xml).toContain("<endenergiebedarf>94.5</endenergiebedarf>");
    expect(xml).not.toContain("<energieverbrauchkennwert>");
  });

  it("überträgt die Straße nur bei freigegebener Adresse", () => {
    const mit = xmlVon(vollstaendig);
    expect(mit).toContain("<strasse>Rosenweg</strasse>");
    expect(mit).toContain("<objektadresse_freigeben>true</objektadresse_freigeben>");

    const ohne = xmlVon({ ...vollstaendig, adresse_veroeffentlichen: false });
    expect(ohne).not.toContain("<strasse>");
    expect(ohne).not.toContain("<hausnummer>");
    // Ort und PLZ bleiben, sonst ist das Objekt nicht auffindbar.
    expect(ohne).toContain("<plz>24103</plz>");
    expect(ohne).toContain("<ort>Kiel</ort>");
  });

  it("unterdrückt den Kaufpreis bei Preis auf Anfrage", () => {
    const xml = xmlVon({ ...vollstaendig, kaufpreis_auf_anfrage: true });
    expect(xml).not.toContain("<kaufpreis>");
  });

  it("maskiert Sonderzeichen in Freitexten", () => {
    const xml = xmlVon({
      ...vollstaendig,
      beschreibung_objekt: 'Wohnung < 100 m² & "hell" mit <b>Balkon</b>',
    });
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
    // Kein unmaskiertes Markup aus Nutzereingaben im Dokument.
    expect(xml).not.toContain("<b>Balkon</b>");
  });

  it("verwendet den Punkt als Dezimaltrenner", () => {
    const xml = xmlVon(vollstaendig);
    expect(xml).toContain("<kaufpreis>349000.00</kaufpreis>");
    expect(xml).toContain("<wohnflaeche>78.50</wohnflaeche>");
    expect(xml).not.toContain("349.000,00");
  });

  it("setzt die Übertragungsart je nach Modus", () => {
    const neu = xmlVon(vollstaendig);
    expect(neu).toContain('<aktion aktionart="NEU"/>');

    const geaendert = openImmoXml({
      objekte: [{ objekt: vollstaendig, ausstattung: [], modus: "CHANGE" }],
      anbieter,
      zeitstempel: "2026-08-16T12:30:00",
    });
    expect(geaendert).toContain('<aktion aktionart="CHANGE"/>');
  });

  it("überträgt Geokoordinaten nur, wenn beide vorliegen", () => {
    expect(xmlVon(vollstaendig)).toContain('breitengrad="54.323300"');
    expect(xmlVon({ ...vollstaendig, lat: null })).not.toContain("<geokoordinaten");
  });

  it("nimmt mehrere Objekte in eine Übertragung auf", () => {
    const xml = openImmoXml({
      objekte: [
        { objekt: vollstaendig, ausstattung: [], modus: "NEU" },
        {
          objekt: { ...vollstaendig, id: "zweite", objektnummer: "0002" },
          ausstattung: [{ merkmal: "kamin", wert: null }],
          modus: "CHANGE",
        },
      ],
      anbieter,
      zeitstempel: "2026-08-16T12:30:00",
    });
    expect(xml.match(/<immobilie>/g)).toHaveLength(2);
    expect(xml).toContain("<ausstattung><kamin/></ausstattung>");
  });
});

describe("Robustheit der Maskierung", () => {
  it("entfernt in XML unzulässige Steuerzeichen", () => {
    // Steuerzeichen werden bewusst über Escapes erzeugt, damit die Testdatei
    // selbst lesbar bleibt.
    const mitSteuerzeichen =
      "Zeile eins" + String.fromCharCode(7) + " Zeile zwei\nmit Umbruch";
    const xml = xmlVon({ ...vollstaendig, beschreibung_objekt: mitSteuerzeichen });

    expect(xml).not.toContain(String.fromCharCode(7));
    // Zeilenumbrüche sind in XML zulässig und bleiben erhalten.
    expect(xml).toContain("Zeile zwei\nmit Umbruch");
  });
});
