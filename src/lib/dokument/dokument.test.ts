import { describe, expect, it } from "vitest";

import { textZuDokument } from "./struktur";
import { dokumentAlsWord } from "./word";

describe("Dokumentstruktur", () => {
  it("teilt Vertragstext an § und Grossbuchstaben-Titeln", () => {
    const d = textZuDokument("Vertrag", "Hinweis: Muster.\n\nMAKLERVERTRAG (Verkauf)\n\nzwischen\nA\n\n§ 1 Gegenstand\nText eins.\nText zwei.\n\n§ 2 Laufzeit\nSechs Monate.");
    expect(d.abschnitte.map((a) => a.ueberschrift)).toEqual([undefined, "MAKLERVERTRAG (Verkauf)", "§ 1 Gegenstand", "§ 2 Laufzeit"]);
    expect(d.abschnitte[2]?.absaetze).toEqual(["Text eins.", "Text zwei."]);
    expect(d.abschnitte[1]?.absaetze).toEqual(["zwischen", "A"]);
  });

  it("erzeugt eine Word-Datei mit Tabelle und Unterschrift", async () => {
    const puffer = await dokumentAlsWord(
      { titel: "Test", abschnitte: [{ ueberschrift: "A", absaetze: ["x"], tabelle: { spalten: ["a", "b"], zeilen: [["1", "2"]] } }, { unterschriften: [{ bezeichnung: "Käufer", name: "B", bild: null, zeit: null }] }], fussnote: "Fuss" },
      { firmenname: "Demo", zeile2: "Straße 1", zeile3: "", logo: null, farbePrimaer: "#1B2A47", farbeAkzent: "#B5934F" },
    );
    expect(puffer.length).toBeGreaterThan(2000);
    expect(puffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
