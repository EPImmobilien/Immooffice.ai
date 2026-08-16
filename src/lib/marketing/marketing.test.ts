import { describe, expect, it } from "vitest";

import { umbrechen, zeichenProZeile } from "./layout";
import { FORMATE, motivSvg, type MarketingInhalt } from "./vorlagen";

const inhalt: MarketingInhalt = {
  kopfzeile: "Zu verkaufen",
  titel: "Helle 3-Zimmer-Wohnung mit Südbalkon in ruhiger Lage",
  ort: "24103 Kiel · Düsternbrook",
  eckdaten: [
    { bezeichnung: "Wohnfläche", wert: "78,5 m²" },
    { bezeichnung: "Zimmer", wert: "3" },
    { bezeichnung: "Baujahr", wert: "1998" },
  ],
  preis: "349.000 €",
  preisLabel: "Kaufpreis",
  firmenname: "Nordlicht Immobilien",
  kontakt: "0431 1234567",
  farbePrimaer: "#1B2A47",
  farbeAkzent: "#B5934F",
};

/** Grundlinie des Textelements mit genau diesem Inhalt. */
function yVonText(svg: string, inhalt: string): number | null {
  const treffer = [...svg.matchAll(/<text[^>]*\sy="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].find(
    (t) => t[2]?.trim() === inhalt,
  );
  return treffer ? Number(treffer[1]) : null;
}

/** Grundlinien aller Textelemente aus dem SVG lesen. */
function textPositionen(svg: string): number[] {
  return [...svg.matchAll(/<text[^>]*\sy="([\d.]+)"/g)].map((t) =>
    Number(t[1]),
  );
}

describe("Zeilenumbruch", () => {
  it("bricht an Wortgrenzen und haelt die Zeilenzahl ein", () => {
    const zeilen = umbrechen("Helle 3-Zimmer-Wohnung mit Südbalkon", 400, 30, 2);
    expect(zeilen.length).toBeLessThanOrEqual(2);
    expect(zeilen.join(" ")).not.toContain("  ");
    // Kein Wort darf zerrissen werden.
    for (const zeile of zeilen) {
      expect(zeile.startsWith("-")).toBe(false);
    }
  });

  it("kennzeichnet gekuerzten Text statt ihn wortlos abzuschneiden", () => {
    const zeilen = umbrechen(
      "Ein ausgesprochen langer Titel der beim besten Willen nicht hineinpasst",
      200,
      30,
      1,
    );
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatch(/…$/);
  });

  it("kommt mit einem einzelnen ueberlangen Wort zurecht", () => {
    const zeilen = umbrechen("Donaudampfschifffahrtsgesellschaftskapitaen", 120, 30, 2);
    expect(zeilen.length).toBeGreaterThan(0);
    expect(zeilen[0]!.length).toBeLessThanOrEqual(
      zeichenProZeile(120, 30) + 1,
    );
  });
});

describe("Marketingmotive", () => {
  for (const format of FORMATE) {
    it(`${format.name}: alle Texte liegen innerhalb der Flaeche`, () => {
      const svg = motivSvg(format, inhalt);
      const positionen = textPositionen(svg);

      expect(positionen.length).toBeGreaterThan(4);
      for (const y of positionen) {
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThanOrEqual(format.hoehe);
      }
    });

    it(`${format.name}: Preisband ueberlagert den Textblock nicht`, () => {
      const svg = motivSvg(format, inhalt);

      const bandOben = Number(
        /<rect x="[\d.]+" y="([\d.]+)"[^>]*opacity="0\.1"/.exec(svg)?.[1] ?? "0",
      );
      expect(bandOben).toBeGreaterThan(0);

      // Der unterste Eintrag des Textblocks ist der letzte Eckdatenwert.
      // Genau hier lag der Fehler: bei langen Titeln wuchs der Block in das
      // Preisband hinein. Geprueft wird deshalb die konkrete Grundlinie,
      // nicht eine Auswahl, die sich selbst bestaetigt.
      const letzterWert = inhalt.eckdaten.at(-1)!.wert;
      const y = yVonText(svg, letzterWert);

      expect(y, `Eckdatenwert "${letzterWert}" nicht gefunden`).not.toBeNull();
      expect(y!).toBeLessThan(bandOben);
    });
  }

  it("maskiert Sonderzeichen aus Objektdaten", () => {
    const svg = motivSvg(FORMATE[0]!, {
      ...inhalt,
      titel: 'Wohnung < 100 m² & "hell"',
      firmenname: "Meier & Söhne",
    });
    expect(svg).toContain("&lt;");
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain('& "');
  });

  it("uebernimmt das Mandanten-Branding", () => {
    const svg = motivSvg(FORMATE[0]!, {
      ...inhalt,
      farbePrimaer: "#123456",
      farbeAkzent: "#ABCDEF",
    });
    expect(svg).toContain("#123456");
    expect(svg).toContain("#ABCDEF");
  });

  it("zeigt den KI-Hinweis nur, wenn KI beteiligt war", () => {
    const ohne = motivSvg(FORMATE[0]!, inhalt);
    expect(ohne).not.toContain("KI-erzeugt");

    const mit = motivSvg(FORMATE[0]!, { ...inhalt, kiHinweis: "Text KI-erzeugt" });
    expect(mit).toContain("Text KI-erzeugt");
  });
});
