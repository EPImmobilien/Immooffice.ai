import { describe, expect, it } from "vitest";

import { ausRaumscan, grundrissLesen, grundrissSvg, leererGrundriss, polygonFlaecheM2 } from "./grundriss";
import { entfernungText, infrastrukturSatz, kategorieVon, naechsteJeKategorie, overpassAbfrage } from "./infrastruktur";
import { eingebetteteJpegs, istRawDatei, rawVorschau } from "./raw";
import { crc32, zipErzeugen } from "./zip";

describe("Infrastruktur", () => {
  it("baut eine Overpass-Abfrage und ordnet Elemente zu", () => {
    const q = overpassAbfrage({ lat: 50.11, lon: 8.68 }, ["supermarkt", "haltestelle"]);
    expect(q).toContain('nwr["shop"="supermarket"](around:3000,50.11,8.68);');
    expect(q).toContain('node["highway"="bus_stop"](around:2000,50.11,8.68);');
    expect(kategorieVon({ amenity: "school" })).toBe("grundschule");
    expect(kategorieVon({ shop: "bakery" })).toBe("baecker");
    expect(kategorieVon({ leisure: "golf" })).toBeNull();
  });
  it("findet die naechste Einrichtung je Kategorie", () => {
    const st = { lat: 50.11, lon: 8.68 };
    const e = naechsteJeKategorie(st, [
      { type: "node", id: 1, lat: 50.111, lon: 8.681, tags: { shop: "supermarket", name: "Nahkauf" } },
      { type: "node", id: 2, lat: 50.12, lon: 8.69, tags: { shop: "supermarket", name: "Weit weg" } },
      { type: "way", id: 3, center: { lat: 50.108, lon: 8.679 }, tags: { amenity: "school", name: "Grundschule Nord" } },
      { type: "node", id: 4, tags: { amenity: "pharmacy" } },
    ]);
    expect(e.map((x) => [x.kategorie, x.name])).toEqual([["grundschule", "Grundschule Nord"], ["supermarkt", "Nahkauf"]]);
    expect(e[1]?.entfernung_m).toBeLessThan(200);
    expect(entfernungText(340)).toBe("340 m");
    expect(entfernungText(2400)).toBe("2,4 km");
    expect(infrastrukturSatz({ standort: st, adresse: "", ermittelt_am: "", einrichtungen: e })).toBe("Grundschule 230 m, Supermarkt 130 m");
  });
});

describe("Grundriss", () => {
  it("rechnet Flaechen und zeichnet SVG", () => {
    const g = leererGrundriss("Test");
    g.waende = [{ id: "w1", a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, staerke: 20 }, { id: "w2", a: { x: 500, y: 0 }, b: { x: 500, y: 400 }, staerke: 20 }];
    g.oeffnungen = [{ id: "t1", art: "tuer", wand_id: "w1", position: 0.5, breite: 90, anschlag: "links" }, { id: "f1", art: "fenster", wand_id: "w2", position: 0.5, breite: 120, anschlag: "links" }];
    g.raeume = [{ id: "r1", name: "Wohnen", polygon: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }] }];
    g.moebel = [{ id: "m1", art: "sofa", x: 50, y: 50, breite: 220, tiefe: 90, drehung: 0 }];
    g.masse = [{ id: "d1", a: { x: 0, y: 450 }, b: { x: 500, y: 450 } }];
    expect(polygonFlaecheM2(g.raeume[0]!.polygon)).toBe(20);
    const svg = grundrissSvg(g);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Wohnen");
    expect(svg).toContain("20,00 m²");
    expect(svg).toContain("5,00 m");
    expect(svg).toContain("Sofa");
    expect(svg.match(/<path/g)?.length).toBe(3); // Tuerbogen + 2 Marker
  });
  it("liest gespeicherte Grundrisse tolerant", () => {
    const g = grundrissLesen({ titel: 7, raster: 3, waende: [{ a: { x: "1" }, b: { x: 100, y: 0 } }], oeffnungen: [{ art: "loch" }, { art: "tuer", wand_id: "w0", position: 2 }], moebel: [{ art: "bett" }, { art: "unbekannt" }] });
    expect(g.titel).toBe("Grundriss");
    expect(g.raster).toBe(10);
    expect(g.waende[0]).toMatchObject({ id: "w0", a: { x: 1, y: 0 }, staerke: 20 });
    expect(g.oeffnungen).toHaveLength(1);
    expect(g.oeffnungen[0]?.position).toBe(1);
    expect(g.moebel).toHaveLength(1);
    expect(g.moebel[0]).toMatchObject({ breite: 180, tiefe: 200 });
  });
  it("uebernimmt einen Raumscan (RoomPlan-Export)", () => {
    const einheit = (x: number, z: number, winkelGrad: number) => { const r = (winkelGrad * Math.PI) / 180; return [Math.cos(r), 0, Math.sin(r), 0, 0, 1, 0, 0, -Math.sin(r), 0, Math.cos(r), 0, x, 0, z, 1]; };
    const scan = {
      walls: [{ dimensions: [4, 2.5, 0.2], transform: einheit(2, 0, 0) }, { dimensions: [3, 2.5, 0.2], transform: einheit(4, 1.5, 90) }],
      doors: [{ dimensions: [0.9, 2, 0.1], transform: einheit(1, 0, 0) }],
      windows: [{ dimensions: [1.2, 1.2, 0.1], transform: einheit(4, 1.5, 90) }],
      objects: [{ category: "sofa", dimensions: [2.2, 0.8, 0.9], transform: einheit(2, 1, 0) }, { category: "unknownThing", dimensions: [1, 1, 1], transform: einheit(0, 0, 0) }],
    };
    const { grundriss, hinweis } = ausRaumscan(scan);
    expect(grundriss.waende).toHaveLength(2);
    expect(Math.round(Math.hypot(grundriss.waende[0]!.b.x - grundriss.waende[0]!.a.x, grundriss.waende[0]!.b.y - grundriss.waende[0]!.a.y))).toBe(400);
    expect(grundriss.oeffnungen.map((o) => o.art)).toEqual(["tuer", "fenster"]);
    expect(grundriss.oeffnungen[0]?.wand_id).toBe("w1");
    expect(grundriss.moebel).toHaveLength(1);
    expect(grundriss.moebel[0]).toMatchObject({ art: "sofa", breite: 220, tiefe: 90 });
    expect(hinweis).toBe("2 Wände, 1 Türen, 1 Fenster, 1 Möbel");
  });
});

describe("RAW-Vorschau", () => {
  it("erkennt RAW-Dateien und findet das groesste eingebettete JPEG", () => {
    expect(istRawDatei("DSC01234.ARW")).toBe(true);
    expect(istRawDatei("foto.jpg")).toBe(false);
    // Zwei kuenstliche JPEGs: SOI, APP0-Segment (Laenge 16), SOS, Nutzdaten, EOI
    const jpeg = (nutz: number) => [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0x11), 0xff, 0xda, 0x00, 0x08, ...new Array(6).fill(0x22), ...new Array(nutz).fill(0x33), 0xff, 0xd9];
    const daten = new Uint8Array([...new Array(50).fill(0), ...jpeg(2500), ...new Array(20).fill(0), ...jpeg(6000), 0, 0]);
    const gefunden = eingebetteteJpegs(daten);
    expect(gefunden).toHaveLength(2);
    const v = rawVorschau(daten)!;
    expect(v.length).toBe(jpeg(6000).length);
    expect(v[0]).toBe(0xff);
    expect(v[v.length - 1]).toBe(0xd9);
    expect(rawVorschau(new Uint8Array(100))).toBeNull();
  });
});

describe("ZIP", () => {
  it("schreibt ein gueltiges Archiv mit korrekter Pruefsumme", () => {
    const daten = new TextEncoder().encode("The quick brown fox jumps over the lazy dog");
    expect(crc32(daten).toString(16)).toBe("414fa339");
    const zip = zipErzeugen([{ name: "a.txt", daten }, { name: "b.txt", daten: new Uint8Array([1, 2, 3]) }], new Date(2026, 8, 4, 12, 0, 0));
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect([...zip.slice(zip.length - 22, zip.length - 18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
    expect(zip[zip.length - 12]).toBe(2); // Anzahl Eintraege
    expect(new TextDecoder().decode(zip).includes("a.txt")).toBe(true);
  });
});
