import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createElement } from "react";

import { Document, Font, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { SCHNITTE, schriftplan } from "./schriften";

/**
 * Diese Tests sind aus einem Produktionsausfall entstanden.
 *
 * Die Schriftdateien wurden zur Laufzeit ueber `require.resolve` gesucht. Der
 * Bundler kann das nicht nachvollziehen und nahm sie nicht in das
 * Funktionsbuendel auf: Lokal und im Test lief die PDF-Erzeugung, in der
 * Produktion liess sich kein einziges Exposé mehr erzeugen — und kein Test hat
 * es bemerkt, weil hier `node_modules` immer vorhanden ist.
 *
 * Deshalb pruefen diese Tests nicht mehr, ob Dateien gefunden werden, sondern
 * ob die Schriftdaten Teil des Moduls sind. Genau das ist die Eigenschaft, die
 * in der Produktion getragen haette.
 */
describe("Hausschriften", () => {
  it("hat alle sechs Schnitte eingebettet", () => {
    const plan = schriftplan();
    expect(plan.vollstaendig).toBe(true);
    expect(plan.poppins).toHaveLength(3);
    expect(plan.inter).toHaveLength(3);
  });

  it("liefert Datenquellen statt Dateipfaden", () => {
    const plan = schriftplan();
    for (const schnitt of [...plan.poppins, ...plan.inter]) {
      // Ein Pfad waere der Rueckfall in genau den Fehler, der behoben wurde.
      expect(schnitt.src).toMatch(/^data:font\/woff;base64,/);
      expect(schnitt.src.length).toBeGreaterThan(5000);
    }
  });

  it("enthält echte WOFF-Daten", () => {
    for (const schnitt of [...SCHNITTE.poppins, ...SCHNITTE.inter]) {
      const bytes = Buffer.from(schnitt.daten, "base64");
      // "wOFF" ist die Kennung am Dateianfang. Ohne diese Pruefung koennte
      // eine verstuemmelte Zeichenkette unbemerkt eingebettet sein — auffallen
      // wuerde es erst beim Erzeugen eines Exposés.
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOFF");
    }
  });

  it("stimmt mit den Dateien in @fontsource überein", async () => {
    // Sichert die erzeugte Datei gegen ein stilles Auseinanderlaufen ab: Nach
    // einer Aktualisierung von @fontsource muss
    // `node scripts/schriften-einbetten.mjs` erneut laufen.
    const aufloesen = createRequire(import.meta.url);
    const paare: [string, string][] = [
      ["@fontsource/poppins/files/poppins-latin-500-normal.woff", SCHNITTE.poppins[0]!.daten],
      ["@fontsource/poppins/files/poppins-latin-600-normal.woff", SCHNITTE.poppins[1]!.daten],
      ["@fontsource/poppins/files/poppins-latin-700-normal.woff", SCHNITTE.poppins[2]!.daten],
      ["@fontsource/inter/files/inter-latin-400-normal.woff", SCHNITTE.inter[0]!.daten],
      ["@fontsource/inter/files/inter-latin-500-normal.woff", SCHNITTE.inter[1]!.daten],
      ["@fontsource/inter/files/inter-latin-600-normal.woff", SCHNITTE.inter[2]!.daten],
    ];

    for (const [paket, eingebettet] of paare) {
      const bytes = await readFile(aufloesen.resolve(paket));
      expect(bytes.toString("base64"), paket).toBe(eingebettet);
    }
  });

  it("weicht bei fehlenden Daten auf Standardschriften aus", () => {
    const leer = (liste: typeof SCHNITTE.poppins) =>
      liste.map((s) => ({ ...s, daten: "" }));
    const plan = schriftplan({
      poppins: leer(SCHNITTE.poppins),
      inter: leer(SCHNITTE.inter),
    });

    expect(plan.vollstaendig).toBe(false);
    // Entscheidend ist, dass beide Familien trotzdem Schnitte bekommen: Die
    // Vorlagen verlangen die Familiennamen „Poppins" und „Inter", und eine
    // unbekannte Familie laesst die PDF-Erzeugung mit einer Ausnahme abbrechen.
    expect(plan.poppins.map((s) => s.src)).toEqual([
      "Helvetica",
      "Helvetica-Bold",
      "Helvetica-Bold",
    ]);
    expect(plan.inter.map((s) => s.src)).toEqual([
      "Helvetica",
      "Helvetica",
      "Helvetica-Bold",
    ]);
    // Die Gewichte muessen erhalten bleiben, sonst waehlt die PDF-Erzeugung
    // den falschen Schnitt.
    expect(plan.poppins.map((s) => s.fontWeight)).toEqual([500, 600, 700]);
  });

  it("erzeugt mit dem Rückfall ein gültiges PDF", async () => {
    // Der Rueckfall beruht auf einer Annahme, die geprueft gehoert: dass sich
    // eine eigene Familie mit einer Standardschrift als Quelle registrieren
    // laesst. Traegt sie nicht, waere der Rueckfall wertlos — die Erzeugung
    // wuerde statt an den fehlenden Daten an der fehlenden Familie scheitern.
    const plan = schriftplan({
      poppins: SCHNITTE.poppins.map((s) => ({ ...s, daten: "" })),
      inter: SCHNITTE.inter.map((s) => ({ ...s, daten: "" })),
    });
    Font.register({ family: "Rückfallprobe", fonts: plan.poppins });

    const puffer = await renderToBuffer(
      createElement(
        Document,
        null,
        createElement(
          Page,
          { size: "A4" },
          createElement(
            Text,
            { style: { fontFamily: "Rückfallprobe", fontWeight: 600 } },
            "Mehrfamilienhaus in bevorzugter Lage",
          ),
        ),
      ),
    );

    expect(puffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});
