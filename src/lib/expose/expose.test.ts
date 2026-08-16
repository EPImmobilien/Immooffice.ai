import { describe, expect, it } from "vitest";

import { lueckenErmitteln } from "@/lib/ki/luecken";
import { OhneKiAnbieter } from "@/lib/ki/ohne-ki";
import type { ObjektKontext } from "@/lib/ki/typen";

const vollstaendig: ObjektKontext = {
  objektkategorie: "wohnung",
  objektart: "Etagenwohnung",
  vermarktungsart: "kauf",
  nutzungsart: "wohnen",
  ort: "Kiel",
  ortsteil: "Düsternbrook",
  wohnflaeche: 78.5,
  nutzflaeche: null,
  grundstuecksflaeche: null,
  zimmer: 3,
  baujahr: 1998,
  kaufpreis: 349000,
  kaltmiete: null,
  energie_klasse: "C",
  energie_kennwert: 94.5,
  stichpunkte: "Südbalkon, Einbauküche",
};

describe("Lückenerkennung", () => {
  it("meldet keine Lücken, wenn alle Angaben vorliegen", () => {
    const luecken = lueckenErmitteln(vollstaendig, [
      "titel",
      "objektbeschreibung",
      "ausstattung",
      "lage",
    ]);
    expect(luecken).toEqual([]);
  });

  it("meldet fehlende Pflichtangaben statt sie zu ergänzen", () => {
    const luecken = lueckenErmitteln(
      { ...vollstaendig, wohnflaeche: null, baujahr: null },
      ["objektbeschreibung"],
    );
    const felder = luecken.map((l) => l.feld);
    expect(felder).toContain("wohnflaeche");
    expect(felder).toContain("baujahr");
  });

  it("prüft grundstücksbezogene Regeln nur bei Grundstücken", () => {
    const wohnung = lueckenErmitteln(
      { ...vollstaendig, grundstuecksflaeche: null },
      ["objektbeschreibung"],
    );
    expect(wohnung.map((l) => l.feld)).not.toContain("grundstuecksflaeche");

    const grundstueck = lueckenErmitteln(
      {
        ...vollstaendig,
        objektkategorie: "grundstueck",
        grundstuecksflaeche: null,
      },
      ["objektbeschreibung"],
    );
    expect(grundstueck.map((l) => l.feld)).toContain("grundstuecksflaeche");
  });

  it("meldet fehlende Ausstattungsangaben für den Ausstattungstext", () => {
    const luecken = lueckenErmitteln({ ...vollstaendig, stichpunkte: null }, [
      "ausstattung",
    ]);
    expect(luecken.map((l) => l.feld)).toContain("stichpunkte");
  });
});

describe("Entwurfstexte ohne KI", () => {
  const anbieter = new OhneKiAnbieter();

  it("wird nicht als KI-Text gekennzeichnet und kostet keine Credits", async () => {
    const ergebnis = await anbieter.texteErzeugen({
      objekt: vollstaendig,
      stil: "sachlich",
      arten: ["titel", "objektbeschreibung"],
    });

    // Zentral: Ohne beteiligtes Modell darf nichts als KI-Inhalt gelten
    // (Abschnitt 8 und 10).
    expect(ergebnis.kiVerwendet).toBe(false);
    expect(ergebnis.credits).toBe(0);
    expect(ergebnis.kostenCent).toBe(0);
  });

  it("verwendet ausschließlich erfasste Werte", async () => {
    const ergebnis = await anbieter.texteErzeugen({
      objekt: vollstaendig,
      stil: "sachlich",
      arten: ["titel", "objektbeschreibung"],
    });

    expect(ergebnis.texte.titel).toContain("Kiel");
    expect(ergebnis.texte.titel).toContain("3");
    expect(ergebnis.texte.objektbeschreibung).toContain("1998");
  });

  it("erfindet nichts, wenn Angaben fehlen", async () => {
    const ergebnis = await anbieter.texteErzeugen({
      objekt: { ...vollstaendig, baujahr: null, ort: null },
      stil: "sachlich",
      arten: ["objektbeschreibung", "lage"],
    });

    const text = ergebnis.texte.objektbeschreibung ?? "";
    expect(text).not.toMatch(/\b(19|20)\d{2}\b/); // kein erfundenes Baujahr
    expect(ergebnis.texte.lage).toBe(""); // ohne Ort keine Lagebeschreibung
    expect(ergebnis.luecken.length).toBeGreaterThan(0);
  });
});
