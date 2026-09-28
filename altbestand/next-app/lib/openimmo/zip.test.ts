import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { zipPacken } from "./zip";

const ZEITPUNKT = new Date("2026-08-17T09:30:00Z");

/**
 * Prueft das Archiv mit einem echten Entpacker.
 *
 * Ein selbst geschriebener ZIP-Schreiber, der nur gegen die eigenen
 * Annahmen geprueft wird, beweist nichts: Genau die Stelle, an der das Format
 * falsch verstanden wurde, waere im Test genauso falsch. Steht `unzip` nicht
 * zur Verfuegung, faellt die Pruefung sichtbar aus, statt still zu bestehen.
 */
function entpacken(archiv: Buffer): Map<string, Buffer> | null {
  const ordner = mkdtempSync(join(tmpdir(), "openimmo-zip-"));
  try {
    const datei = join(ordner, "paket.zip");
    writeFileSync(datei, archiv);
    // -t prueft die Pruefsummen aller Eintraege und schlaegt bei Fehlern fehl.
    execFileSync("unzip", ["-t", datei], { stdio: "pipe" });
    const namen = execFileSync("unzip", ["-Z1", datei], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    execFileSync("unzip", ["-o", "-q", datei, "-d", ordner], { stdio: "pipe" });
    return new Map(namen.map((n) => [n, readFileSync(join(ordner, n))]));
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw fehler;
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
}

const xml = Buffer.from('<?xml version="1.0"?><openimmo/>', "utf8");
const bild = Buffer.from(Array.from({ length: 400 }, (_, i) => i % 251));

describe("Übertragungspaket", () => {
  it("erzeugt ein Archiv mit der richtigen Kennung", () => {
    const archiv = zipPacken([{ name: "a.xml", daten: xml }], ZEITPUNKT);
    expect(archiv.subarray(0, 4).toString("latin1")).toBe("PK");
    expect(archiv.readUInt32LE(archiv.length - 22)).toBe(0x06054b50);
  });

  it("liefert bei gleicher Eingabe dasselbe Ergebnis", () => {
    const eingabe = [
      { name: "openimmo.xml", daten: xml },
      { name: "0001-01.jpg", daten: bild },
    ];
    expect(zipPacken(eingabe, ZEITPUNKT).equals(zipPacken(eingabe, ZEITPUNKT))).toBe(
      true,
    );
  });

  it("wird von einem echten Entpacker gelesen", () => {
    const archiv = zipPacken(
      [
        { name: "openimmo-0001.xml", daten: xml },
        { name: "0001-01.jpg", daten: bild },
        { name: "0001-02.png", daten: Buffer.from("zweites Bild") },
      ],
      ZEITPUNKT,
    );

    const inhalt = entpacken(archiv);
    expect(inhalt, "unzip steht nicht zur Verfügung").not.toBeNull();

    expect([...inhalt!.keys()].sort()).toEqual([
      "0001-01.jpg",
      "0001-02.png",
      "openimmo-0001.xml",
    ]);
    expect(inhalt!.get("openimmo-0001.xml")!.equals(xml)).toBe(true);
    expect(inhalt!.get("0001-01.jpg")!.equals(bild)).toBe(true);
  });

  it("überträgt Umlaute im Dateinamen unverfälscht", () => {
    const archiv = zipPacken(
      [{ name: "Grundriss-Dachgeschoß.pdf", daten: xml }],
      ZEITPUNKT,
    );
    const inhalt = entpacken(archiv);
    expect(inhalt, "unzip steht nicht zur Verfügung").not.toBeNull();
    expect([...inhalt!.keys()]).toEqual(["Grundriss-Dachgeschoß.pdf"]);
  });

  it("weist ein Paket mit zu vielen Dateien ab, statt es falsch zu schreiben", () => {
    const zuViele = Array.from({ length: 65_536 }, (_, i) => ({
      name: `${i}.bin`,
      daten: Buffer.alloc(0),
    }));
    expect(() => zipPacken(zuViele, ZEITPUNKT)).toThrow(/zu viele/i);
  });

  it("kommt mit einem leeren Paket zurecht", () => {
    const archiv = zipPacken([], ZEITPUNKT);
    expect(archiv.length).toBe(22);
    expect(archiv.readUInt16LE(8)).toBe(0);
  });
});
