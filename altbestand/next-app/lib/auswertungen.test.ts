import { describe, expect, it } from "vitest";

import { fristlage } from "./arbeitsmittel";
import {
  MINDESTZAHL,
  anteil,
  aufgabenlage,
  bestandsuebersicht,
  trichter,
  vermarktungsdauer,
  type BestandZeile,
  type Statuswechsel,
} from "./auswertungen";

function objekt(
  status: BestandZeile["status"],
  kaufpreis: number | null = null,
): BestandZeile {
  return { status, kaufpreis, kaltmiete: null, erstellt_am: "2026-01-01" };
}

describe("Bestandsübersicht", () => {
  it("zählt je Status und sortiert absteigend", () => {
    const u = bestandsuebersicht([
      objekt("aktiv"),
      objekt("aktiv"),
      objekt("akquise"),
    ]);
    expect(u.gesamt).toBe(3);
    expect(u.jeStatus[0]).toEqual({ status: "aktiv", anzahl: 2 });
  });

  it("zählt nur vermarktete Objekte zum Volumen", () => {
    // Was in der Akquise steckt, ist kein Bestand; was verkauft ist, keiner
    // mehr. Eine Gesamtsumme über alle Status wäre unbrauchbar.
    const u = bestandsuebersicht([
      objekt("aktiv", 300_000),
      objekt("reserviert", 200_000),
      objekt("akquise", 900_000),
      objekt("verkauft", 900_000),
    ]);
    expect(u.volumenAktiv).toBe(500_000);
  });

  it("kommt mit fehlenden Preisen aus", () => {
    const u = bestandsuebersicht([objekt("aktiv", null), objekt("aktiv", 100)]);
    expect(u.volumenAktiv).toBe(100);
  });

  it("liefert bei leerem Bestand keine erfundenen Zahlen", () => {
    const u = bestandsuebersicht([]);
    expect(u).toEqual({ jeStatus: [], gesamt: 0, volumenAktiv: 0 });
  });
});

describe("Vermarktungsdauer", () => {
  function wechsel(id: string, nachher: string, tag: string): Statuswechsel {
    return { objekt_id: id, nachher, erstellt_am: `${tag}T12:00:00Z` };
  }

  it("verweigert eine Aussage bei zu wenigen Fällen", () => {
    // Ein Durchschnitt aus einem Verkauf ist ein Einzelfall mit
    // Nachkommastelle, keine Kennzahl.
    const zuWenig = [
      wechsel("a", "aktiv", "2026-01-01"),
      wechsel("a", "verkauft", "2026-02-01"),
    ];
    expect(vermarktungsdauer(zuWenig)).toBeNull();
  });

  it("rechnet den Median über genügend Fälle", () => {
    const daten = [
      wechsel("a", "aktiv", "2026-01-01"),
      wechsel("a", "verkauft", "2026-01-11"), // 10 Tage
      wechsel("b", "aktiv", "2026-01-01"),
      wechsel("b", "verkauft", "2026-01-21"), // 20 Tage
      wechsel("c", "aktiv", "2026-01-01"),
      wechsel("c", "verkauft", "2026-01-31"), // 30 Tage
    ];
    const e = vermarktungsdauer(daten);
    expect(e).toEqual({ medianTage: 20, faelle: 3 });
  });

  it("lässt sich von einem Ausreißer nicht verziehen", () => {
    // Genau deshalb Median und nicht Mittelwert: Der Mittelwert läge hier bei
    // rund 253 Tagen und beschriebe keinen einzigen der vier Fälle.
    const daten = [
      wechsel("a", "aktiv", "2026-01-01"),
      wechsel("a", "verkauft", "2026-01-11"), // 10
      wechsel("b", "aktiv", "2026-01-01"),
      wechsel("b", "verkauft", "2026-01-21"), // 20
      wechsel("c", "aktiv", "2026-01-01"),
      wechsel("c", "verkauft", "2026-01-31"), // 30
      wechsel("d", "aktiv", "2026-01-01"),
      wechsel("d", "verkauft", "2028-01-01"), // 730
    ];
    const e = vermarktungsdauer(daten);
    expect(e?.medianTage).toBe(25);
    expect(e?.faelle).toBe(4);
  });

  it("nimmt den frühesten Start und den spätesten Abschluss", () => {
    // Ein Objekt kann zurückgezogen und erneut angeboten worden sein.
    const daten = [
      wechsel("a", "aktiv", "2026-01-01"),
      wechsel("a", "aktiv", "2026-03-01"),
      wechsel("a", "verkauft", "2026-01-21"),
      wechsel("a", "verkauft", "2026-01-31"),
      wechsel("b", "aktiv", "2026-01-01"),
      wechsel("b", "verkauft", "2026-01-31"),
      wechsel("c", "aktiv", "2026-01-01"),
      wechsel("c", "verkauft", "2026-01-31"),
    ];
    const e = vermarktungsdauer(daten);
    expect(e?.medianTage).toBe(30);
  });

  it("zählt Vermietungen mit", () => {
    const daten = [
      wechsel("a", "aktiv", "2026-01-01"),
      wechsel("a", "vermietet", "2026-01-11"),
      wechsel("b", "aktiv", "2026-01-01"),
      wechsel("b", "vermietet", "2026-01-11"),
      wechsel("c", "aktiv", "2026-01-01"),
      wechsel("c", "vermietet", "2026-01-11"),
    ];
    expect(vermarktungsdauer(daten)?.faelle).toBe(3);
  });

  it("überspringt Objekte ohne Abschluss und mit verdrehter Reihenfolge", () => {
    const daten = [
      wechsel("offen", "aktiv", "2026-01-01"),
      wechsel("verdreht", "verkauft", "2026-01-01"),
      wechsel("verdreht", "aktiv", "2026-02-01"),
      wechsel("a", "aktiv", "2026-01-01"),
      wechsel("a", "verkauft", "2026-01-11"),
    ];
    // Nur ein verwertbarer Fall — unter der Mindestzahl.
    expect(vermarktungsdauer(daten)).toBeNull();
  });

  it("hält die Mindestzahl bei drei", () => {
    expect(MINDESTZAHL).toBe(3);
  });
});

describe("Trichter", () => {
  it("bezieht den Anteil auf die vorherige Stufe", () => {
    const t = trichter([
      { bezeichnung: "Aufnahmen", anzahl: 20 },
      { bezeichnung: "Übernommen", anzahl: 10 },
      { bezeichnung: "Verkauft", anzahl: 5 },
    ]);
    expect(t[0]?.anteil).toBeNull();
    expect(t[1]?.anteil).toBe(50);
    // 5 von 10, nicht 5 von 20: „Von den Übernommenen wurde die Hälfte
    // verkauft" ist die Frage, die man stellt.
    expect(t[2]?.anteil).toBe(50);
  });

  it("erfindet bei leerer Vorstufe keinen Anteil", () => {
    const t = trichter([
      { bezeichnung: "Aufnahmen", anzahl: 0 },
      { bezeichnung: "Übernommen", anzahl: 0 },
    ]);
    expect(t[1]?.anteil).toBeNull();
  });
});

describe("Aufgabenlage", () => {
  const heute = new Date("2026-08-17T10:00:00Z");

  it("verteilt auf die Fristlagen", () => {
    const lage = aufgabenlage(
      [
        { faellig_am: "2026-08-10" },
        { faellig_am: "2026-08-17" },
        { faellig_am: "2026-08-19" },
        { faellig_am: "2026-12-01" },
        { faellig_am: null },
      ],
      heute,
      fristlage,
    );
    expect(lage).toEqual({
      ueberfaellig: 1,
      heute: 1,
      dieseWoche: 1,
      spaeter: 1,
      ohneFrist: 1,
    });
  });
});

describe("Anteil", () => {
  it("rechnet in ganzen Prozent", () => {
    expect(anteil(1, 3)).toBe(33);
  });

  it("unterscheidet „null Prozent“ von „keine Grundlage“", () => {
    expect(anteil(0, 10)).toBe(0);
    expect(anteil(0, 0)).toBeNull();
  });
});
