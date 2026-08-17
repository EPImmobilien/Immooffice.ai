import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import * as daten from "./schriften-daten";
import type { ExposeBranding, ExposeObjekt } from "./typen";
import { VORLAGEN } from "./vorlagen";

const SCHNITTE: Record<string, string> = {
  POPPINS_500: "@fontsource/poppins/files/poppins-latin-500-normal.woff",
  POPPINS_600: "@fontsource/poppins/files/poppins-latin-600-normal.woff",
  POPPINS_700: "@fontsource/poppins/files/poppins-latin-700-normal.woff",
  INTER_400: "@fontsource/inter/files/inter-latin-400-normal.woff",
  INTER_500: "@fontsource/inter/files/inter-latin-500-normal.woff",
  INTER_600: "@fontsource/inter/files/inter-latin-600-normal.woff",
};

const aufloesen = createRequire(import.meta.url);

function bytes(datenUrl: string): Buffer {
  return Buffer.from(datenUrl.split(",")[1] ?? "", "base64");
}

/**
 * Diese Datei prueft die eingebetteten Schriften.
 *
 * Anlass ist ein Fehler, der ausschliesslich in der Auslieferung auftrat: Die
 * Schriften wurden zur Laufzeit aus `node_modules` geholt, was lokal immer
 * gelang und im Auslieferungspaket nie. Die Route warf, und der Browser legte
 * eine Datei namens `pdf.txt` ab.
 *
 * Ein Test, der nur "es entsteht ein PDF" prueft, haette das nie gefunden —
 * er lief ja lokal. Deshalb prueft dieser Test die Voraussetzung selbst: dass
 * die Schriftdaten im Modul stehen und nicht irgendwo daneben.
 */
describe("eingebettete Schriften", () => {
  it("enthält alle sechs registrierten Schnitte", () => {
    for (const name of Object.keys(SCHNITTE)) {
      expect(daten, `${name} fehlt in schriften-daten.ts`).toHaveProperty(name);
    }
  });

  it("liefert gültige Daten-URLs mit echten WOFF-Daten", () => {
    for (const name of Object.keys(SCHNITTE)) {
      const wert = (daten as unknown as Record<string, string>)[name]!;

      expect(wert.startsWith("data:font/woff;base64,"), `${name} ist keine Daten-URL`).toBe(true);

      // `wOFF` ist die Kennung am Dateianfang. Ohne diese Prüfung wäre auch
      // eine leere oder abgeschnittene Zeichenkette „gültig“.
      const roh = bytes(wert);
      expect(roh.subarray(0, 4).toString("latin1"), `${name} ist keine WOFF-Datei`).toBe("wOFF");
      expect(roh.length, `${name} ist verdächtig klein`).toBeGreaterThan(4000);
    }
  });

  it("stimmt mit den Dateien in node_modules überein", () => {
    // Fängt Abweichungen nach einem Paketwechsel: Wer @fontsource aktualisiert
    // und `npm run schriften-einbetten` vergisst, liefert sonst stillschweigend
    // weiter die alten Schnitte aus.
    for (const [name, paket] of Object.entries(SCHNITTE)) {
      const pfad = aufloesen.resolve(paket);
      if (!existsSync(pfad)) continue;

      const wert = (daten as unknown as Record<string, string>)[name]!;
      expect(
        bytes(wert).equals(readFileSync(pfad)),
        `${name} weicht von ${paket} ab — bitte "npm run schriften-einbetten" ausführen`,
      ).toBe(true);
    }
  });

  it("kommt ohne Zugriff auf node_modules aus", () => {
    // Der Kern der Sache: Im Quelltext darf kein Weg mehr zu einer
    // Schriftdatei führen, den erst die Laufzeit auflöst.
    const quelle = readFileSync(new URL("./schriften.ts", import.meta.url), "utf8");

    // Ohne Kommentare: Der Kopf der Datei erklärt genau diesen Fehler und
    // nennt dabei zwangsläufig die Aufrufe, die dort nicht mehr stehen dürfen.
    const code = quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(code).not.toMatch(/require\.resolve|createRequire|readFileSync/);
    expect(code).toContain("./schriften-daten");
  });
});

const objekt = {
  objektnummer: "0001",
  bezeichnung: "Prüfobjekt",
  titel: "Helle Wohnung mit Balkon",
  objektkategorie: "wohnung",
  objektart: null,
  vermarktungsart: "kauf",
  strasse: null,
  hausnummer: null,
  plz: null,
  ort: "Kiel",
  adresse_veroeffentlichen: false,
  wohnflaeche: 78.5,
  nutzflaeche: null,
  grundstuecksflaeche: null,
  zimmer: 3,
  baujahr: null,
  kaufpreis: 349000,
  kaltmiete: null,
  nebenkosten: null,
  hausgeld: null,
  provision_kaeufer: null,
  energieausweis_typ: null,
  energie_kennwert: null,
  energie_klasse: null,
  beschreibung_objekt: "Ein Satz zur Wohnung.",
  beschreibung_ausstattung: null,
  beschreibung_lage: null,
  texte_ki_erzeugt: false,
} as ExposeObjekt;

const branding = {
  firmenname: "Prüf Immobilien",
  farbePrimaer: "#1B2A47",
  farbeAkzent: "#B5934F",
  strasse: null,
  plz: null,
  ort: null,
  telefon: null,
  email: null,
  web: null,
  impressum: null,
} as ExposeBranding;

describe("Hausschrift im fertigen Dokument", () => {
  // Die eigentliche Wirkungsprüfung. Ohne sie wäre ein fehlgeschlagenes
  // Registrieren unsichtbar: Die PDF-Erzeugung fällt dann stillschweigend auf
  // Helvetica zurück, erzeugt eine gültige Datei und meldet keinen Fehler.
  // Genau dieser Rückfall ist beim Bau der Vorlagen schon einmal unbemerkt
  // durchgegangen und erst beim Ansehen der Seiten aufgefallen.
  it.each(VORLAGEN.map((v) => v.schluessel))(
    "Vorlage %s bettet Poppins und Inter ein, nicht Helvetica",
    async (schluessel) => {
      const vorlage = VORLAGEN.find((v) => v.schluessel === schluessel)!;
      const puffer = await renderToBuffer(vorlage.bauen({ objekt, branding, bilder: [] }));

      const schriften = [
        ...puffer.toString("latin1").matchAll(/\/BaseFont\s*\/([A-Za-z0-9+-]+)/g),
      ].map((treffer) => treffer[1]!);

      expect(schriften.length).toBeGreaterThan(0);
      expect(schriften.some((s) => s.includes("Poppins"))).toBe(true);
      expect(schriften.some((s) => s.includes("Inter"))).toBe(true);
      expect(schriften.some((s) => s.includes("Helvetica"))).toBe(false);
    },
  );
});
