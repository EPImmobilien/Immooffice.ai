import { describe, expect, it } from "vitest";

import { zipPacken } from "@/lib/openimmo/zip";

import { kontextErzeugen } from "../kern/connector";
import { openImmoConnector, paketOeffnen } from "./connector";
import { openImmoLesen } from "./lesen";
import { zipEntpacken } from "./zip-lesen";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<openimmo xmlns="http://www.openimmo.de">
  <uebertragung art="OFFLINE" umfang="VOLL" modus="NEU" version="1.2.7" sendersoftware="Fremd" senderversion="1" techn_email="t@example.org" timestamp="2026-09-01T10:00:00"/>
  <anbieter>
    <anbieternr>A-1</anbieternr>
    <firma>Beispiel Immobilien</firma>
    <openimmo_anid>ANID-1</openimmo_anid>
    <immobilie>
      <objektkategorie>
        <nutzungsart WOHNEN="true" GEWERBE="false" ANLAGE="false"/>
        <vermarktungsart KAUF="true" MIETE_PACHT="false"/>
        <objektart><wohnung wohnungtyp="ETAGE"/></objektart>
      </objektkategorie>
      <geo>
        <plz>24103</plz><ort>Kiel</ort><strasse>Holstenstraße</strasse><hausnummer>12</hausnummer>
        <land iso_land="DEU"/><etage>3</etage><anzahl_etagen>5</anzahl_etagen>
        <geokoordinaten breitengrad="54.32" laengengrad="10.13"/>
      </geo>
      <preise>
        <kaufpreis auf_anfrage="false">349000</kaufpreis>
        <hausgeld>245.50</hausgeld>
        <aussen_courtage mit_mwst="true">3,57 % inkl. MwSt.</aussen_courtage>
        <provisionspflichtig>true</provisionspflichtig>
      </preise>
      <flaechen>
        <wohnflaeche>84,5</wohnflaeche><anzahl_zimmer>3</anzahl_zimmer>
        <anzahl_schlafzimmer>2</anzahl_schlafzimmer><anzahl_balkone>1</anzahl_balkone>
      </flaechen>
      <zustand_angaben>
        <baujahr>1962</baujahr>
        <zustand zustand_art="GEPFLEGT"/>
        <letztemodernisierung>2019</letztemodernisierung>
        <energiepass>
          <epart>VERBRAUCH</epart>
          <energieverbrauchkennwert>98.4</energieverbrauchkennwert>
          <primaerenergietraeger>Gas</primaerenergietraeger>
          <wertklasse>C</wertklasse>
          <mitwarmwasser>true</mitwarmwasser>
          <gueltig_bis>2031-05-01</gueltig_bis>
        </energiepass>
      </zustand_angaben>
      <freitexte>
        <objekttitel>Helle 3-Zimmer-Wohnung mit Südbalkon</objekttitel>
        <objektbeschreibung>Text &amp; mehr.</objektbeschreibung>
        <lage>Zentral.</lage>
      </freitexte>
      <anhaenge>
        <anhang location="EXTERN" gruppe="TITELBILD">
          <anhangtitel>Ansicht</anhangtitel><format>jpg</format>
          <daten><pfad>bilder/titel.jpg</pfad></daten>
        </anhang>
        <anhang location="REMOTE" gruppe="BILD">
          <anhangtitel>Netz</anhangtitel><format>jpg</format>
          <daten><pfad>https://example.org/bild.jpg</pfad></daten>
        </anhang>
        <anhang location="EXTERN" gruppe="DOKUMENTE">
          <anhangtitel>Exposé</anhangtitel><format>pdf</format>
          <daten><pfad>expose.pdf</pfad></daten>
        </anhang>
      </anhaenge>
      <verwaltung_techn>
        <objektnr_intern>WHG-0042</objektnr_intern>
        <objektnr_extern>ext-1</objektnr_extern>
        <aktion aktionart="CHANGE"/>
        <stand_vom>2026-08-30</stand_vom>
      </verwaltung_techn>
    </immobilie>
    <immobilie>
      <objektkategorie>
        <nutzungsart WOHNEN="true" GEWERBE="false"/>
        <vermarktungsart KAUF="false" MIETE_PACHT="true"/>
        <objektart><haus haustyp="REIHENHAUS"/></objektart>
      </objektkategorie>
      <geo><plz>24106</plz><ort>Kiel</ort></geo>
      <preise><kaltmiete>1.250,00</kaltmiete><warmmiete>1.480,00</warmmiete></preise>
      <verwaltung_techn>
        <objektnr_intern>RH-7</objektnr_intern>
        <aktion aktionart="DELETE"/>
      </verwaltung_techn>
    </immobilie>
  </anbieter>
</openimmo>`;

describe("OpenImmo lesen", () => {
  const ergebnis = openImmoLesen(XML, new Map([["titel.jpg", new Uint8Array([1, 2, 3])]]));

  it("liest Anbieter und Uebertragung", () => {
    expect(ergebnis.anbieter).toEqual({ firmenname: "Beispiel Immobilien", anid: "ANID-1" });
    expect(ergebnis.uebertragung.version).toBe("1.2.7");
    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.objekte).toHaveLength(2);
  });

  it("bildet ein vollstaendiges Objekt ab", () => {
    const o = ergebnis.objekte[0]!;
    expect(o.fremd_id).toBe("WHG-0042");
    expect(o.objektnummer).toBe("ext-1");
    expect(o.aktion).toBe("CHANGE");
    expect(o.titel).toBe("Helle 3-Zimmer-Wohnung mit Südbalkon");
    expect(o.bezeichnung).toBe(o.titel);
    expect(o.vermarktungsart).toBe("kauf");
    expect(o.nutzungsart).toBe("wohnen");
    expect(o.objektkategorie).toBe("wohnung");
    expect(o.objektart).toBe("etage");
    expect(o.plz).toBe("24103");
    expect(o.strasse).toBe("Holstenstraße");
    expect(o.land).toBe("DE");
    expect(o.etage).toBe("3");
    expect(o.etagen_gesamt).toBe(5);
    expect(o.lat).toBe(54.32);
    expect(o.lon).toBe(10.13);
    expect(o.kaufpreis).toBe(349000);
    expect(o.kaufpreis_auf_anfrage).toBe(false);
    expect(o.hausgeld).toBe(245.5);
    expect(o.provision_kaeufer).toBe("3,57 % inkl. MwSt.");
    expect(o.courtage_frei).toBe(false);
    expect(o.wohnflaeche).toBe(84.5);
    expect(o.zimmer).toBe(3);
    expect(o.schlafzimmer).toBe(2);
    expect(o.anzahl_balkone).toBe(1);
    expect(o.baujahr).toBe(1962);
    expect(o.letzte_modernisierung).toBe(2019);
    expect(o.zustand).toBe("gepflegt");
    expect(o.energieausweis_typ).toBe("verbrauch");
    expect(o.energie_kennwert).toBe(98.4);
    expect(o.energie_traeger).toBe("Gas");
    expect(o.energie_klasse).toBe("C");
    expect(o.energie_warmwasser_enthalten).toBe(true);
    expect(o.energie_gueltig_bis).toBe("2031-05-01");
    expect(o.beschreibung_objekt).toBe("Text & mehr.");
    expect(o.beschreibung_lage).toBe("Zentral.");
    expect(o.beschreibung_ausstattung).toBeNull();
    expect(o.geaendert_am_fremd).toBe("2026-08-30");
  });

  it("uebernimmt Bilder aus dem Paket und aus dem Netz, keine Dokumente", () => {
    const bilder = ergebnis.objekte[0]!.bilder;
    expect(bilder).toHaveLength(2);
    expect(bilder[0]).toMatchObject({ gruppe: "TITELBILD", dateiname: "titel.jpg", mime: "image/jpeg", url: null });
    expect(bilder[0]!.daten).toEqual(new Uint8Array([1, 2, 3]));
    expect(bilder[1]).toMatchObject({ gruppe: "BILD", url: "https://example.org/bild.jpg", daten: null });
  });

  it("laesst ein Bild weg, dessen Datei im Paket fehlt", () => {
    const ohne = openImmoLesen(XML);
    expect(ohne.objekte[0]!.bilder).toHaveLength(1);
    expect(ohne.objekte[0]!.bilder[0]!.url).toBe("https://example.org/bild.jpg");
  });

  it("liest deutsche Zahlen und Mietobjekte", () => {
    const o = ergebnis.objekte[1]!;
    expect(o.vermarktungsart).toBe("miete");
    expect(o.objektkategorie).toBe("haus");
    expect(o.objektart).toBe("reihenhaus");
    expect(o.kaltmiete).toBe(1250);
    expect(o.warmmiete).toBe(1480);
    expect(o.aktion).toBe("DELETE");
    // Ohne Titel und Strasse bleibt die Fremd-ID als Bezeichnung.
    expect(o.bezeichnung).toBe("RH-7");
  });

  it("weist Nicht-XML und XML ohne openimmo ab", () => {
    expect(() => openImmoLesen("<<<")).toThrow(/kein lesbares XML|kein <openimmo>/);
    expect(() => openImmoLesen("<foo/>")).toThrow(/kein <openimmo>/);
  });
});

describe("ZIP lesen", () => {
  it("liest, was der eigene Packer schreibt", () => {
    const zip = zipPacken(
      [
        { name: "export.xml", daten: Buffer.from(XML, "utf8") },
        { name: "bilder/titel.jpg", daten: Buffer.from([1, 2, 3]) },
      ],
      new Date("2026-09-01T00:00:00Z"),
    );
    const eintraege = zipEntpacken(zip);
    expect(eintraege.map((e) => e.name)).toEqual(["export.xml", "bilder/titel.jpg"]);
    expect(Buffer.from(eintraege[1]!.inhalt)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("weist Nicht-ZIP ab", () => {
    expect(() => zipEntpacken(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/kein ZIP/);
  });

  it("paketOeffnen erkennt ZIP am Inhalt, nicht nur am Namen", () => {
    const zip = zipPacken(
      [
        { name: "a.xml", daten: Buffer.from(XML, "utf8") },
        { name: "titel.jpg", daten: Buffer.from([9]) },
        { name: "notiz.txt", daten: Buffer.from("x") },
      ],
      new Date("2026-09-01T00:00:00Z"),
    );
    const { xml, dateien } = paketOeffnen({ name: "upload.bin", inhalt: zip });
    expect(xml).toContain("<openimmo");
    expect([...dateien.keys()]).toEqual(["titel.jpg"]);
  });
});

describe("OpenImmo-Connector", () => {
  const kontext = kontextErzeugen<Record<string, never>>({
    mandantId: "m1",
    integrationId: "i1",
    zugangsdaten: {},
    konfig: { firmenname: "Muster Immobilien", email: "info@example.org" },
    jetzt: () => new Date("2026-09-03T12:00:00Z"),
  });

  it("holen: uebernimmt NEU/CHANGE, meldet DELETE und Positionsnummern als Hinweis", async () => {
    const ergebnis = await openImmoConnector.objekteHolen!(kontext, {
      datei: { name: "export.xml", inhalt: Buffer.from(XML, "utf8") },
    });
    expect(ergebnis.datensaetze.map((o) => o.fremd_id)).toEqual(["WHG-0042"]);
    expect(ergebnis.fehler).toHaveLength(1);
    expect(ergebnis.fehler[0]).toMatchObject({ fremd_id: "RH-7" });
    expect(ergebnis.weitere).toBe(false);
  });

  it("holen ohne Datei ist ein Fehler in Nutzersprache", async () => {
    const ergebnis = await openImmoConnector.objekteHolen!(kontext, {});
    expect(ergebnis.datensaetze).toEqual([]);
    expect(ergebnis.fehler[0]!.meldung).toMatch(/Datei/);
  });

  it("Rundreise: holen → senden ergibt wieder lesbares OpenImmo", async () => {
    const geholt = await openImmoConnector.objekteHolen!(kontext, {
      datei: { name: "export.xml", inhalt: Buffer.from(XML, "utf8") },
    });
    const objekte = geholt.datensaetze.map((o) => ({ ...o, lokal_id: "11111111-1111-1111-1111-111111111111" }));
    const xml = openImmoConnector.xmlErzeugen(kontext, objekte);

    expect(xml).toContain("<firma>Muster Immobilien</firma>");
    expect(xml).toContain('sendersoftware="ImmoOffice.ai"');

    const zurueck = openImmoLesen(xml);
    expect(zurueck.objekte).toHaveLength(1);
    const o = zurueck.objekte[0]!;
    expect(o.titel).toBe("Helle 3-Zimmer-Wohnung mit Südbalkon");
    expect(o.kaufpreis).toBe(349000);
    expect(o.wohnflaeche).toBe(84.5);
    expect(o.energie_klasse).toBe("C");

    const gesendet = await openImmoConnector.objekteSenden!(kontext, objekte);
    expect(gesendet.angelegt).toEqual([{ lokal_id: objekte[0]!.lokal_id, fremd_id: "ext-1" }]);
    expect(kontext.konfig["letztes_xml_bytes"]).toBeGreaterThan(500);
  });
});
