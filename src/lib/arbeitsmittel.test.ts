import { describe, expect, it } from "vitest";

import { aufgabenSortieren, fristlage, kontaktname, naechsteFaelligkeit, schnelleingabeParsen } from "./arbeitsmittel";

const HEUTE = new Date("2026-08-17T10:30:00Z");

describe("Fristlage", () => {
  it("erkennt eine überfällige Frist", () => {
    expect(fristlage("2026-08-16", HEUTE)).toBe("ueberfaellig");
  });

  it("behandelt den heutigen Tag nicht als überfällig", () => {
    // Auf Tagesgrenzen rechnen: Eine Aufgabe, die heute faellig ist, bleibt den
    // ganzen Tag „heute" — auch nachmittags. Mit Uhrzeitvergleich waere sie ab
    // 00:01 Uhr ueberfaellig gewesen.
    expect(fristlage("2026-08-17", HEUTE)).toBe("heute");
  });

  it("zählt die kommenden sieben Tage zur Woche", () => {
    expect(fristlage("2026-08-18", HEUTE)).toBe("diese_woche");
    expect(fristlage("2026-08-24", HEUTE)).toBe("diese_woche");
    expect(fristlage("2026-08-25", HEUTE)).toBe("spaeter");
  });

  it("kennt Aufgaben ohne Frist", () => {
    expect(fristlage(null, HEUTE)).toBe("ohne");
  });
});

describe("Aufgabensortierung", () => {
  it("stellt die früheste Frist voran und Fristlose ans Ende", () => {
    const sortiert = aufgabenSortieren([
      { titel: "ohne", faellig_am: null, prioritaet: "hoch" as const },
      { titel: "spaet", faellig_am: "2026-09-01", prioritaet: "hoch" as const },
      { titel: "frueh", faellig_am: "2026-08-18", prioritaet: "niedrig" as const },
    ]);

    // Auch eine fristlose Aufgabe mit hoher Priorität steht hinten: Sonst
    // verdeckt sie genau das, was heute ansteht.
    expect(sortiert.map((a) => a.titel)).toEqual(["frueh", "spaet", "ohne"]);
  });

  it("entscheidet bei gleicher Frist nach Priorität", () => {
    const sortiert = aufgabenSortieren([
      { titel: "mittel", faellig_am: "2026-08-18", prioritaet: "mittel" as const },
      { titel: "hoch", faellig_am: "2026-08-18", prioritaet: "hoch" as const },
      { titel: "niedrig", faellig_am: "2026-08-18", prioritaet: "niedrig" as const },
    ]);
    expect(sortiert.map((a) => a.titel)).toEqual(["hoch", "mittel", "niedrig"]);
  });

  it("verändert die übergebene Liste nicht", () => {
    const liste = [
      { titel: "b", faellig_am: "2026-09-01", prioritaet: "hoch" as const },
      { titel: "a", faellig_am: "2026-08-18", prioritaet: "hoch" as const },
    ];
    aufgabenSortieren(liste);
    expect(liste.map((a) => a.titel)).toEqual(["b", "a"]);
  });
});

describe("Kontaktname", () => {
  it("setzt Vor- und Nachnamen zusammen", () => {
    expect(kontaktname({ vorname: "Anna", nachname: "Sommer" })).toBe("Anna Sommer");
  });

  it("kommt ohne Vornamen aus", () => {
    // Bei Firmen als Kontakt gibt es keinen Vornamen. Ein fuehrendes
    // Leerzeichen waere in jeder Liste sichtbar.
    expect(kontaktname({ vorname: null, nachname: "Sommer GmbH" })).toBe("Sommer GmbH");
  });

  it("liefert null ohne Kontakt", () => {
    expect(kontaktname(null)).toBeNull();
    expect(kontaktname(undefined)).toBeNull();
  });
});

describe("Schnelleingabe", () => {
  const heute = new Date("2026-09-03T09:00:00Z"); // Donnerstag
  it("liest Frist, Priorität, Tags und Wiederholung aus einem Satz", () => {
    const e = schnelleingabeParsen("Energieausweis anfordern morgen !! #unterlagen #eigentümer wöchentlich", heute);
    expect(e).toEqual({ titel: "Energieausweis anfordern", faellig_am: "2026-09-04", prioritaet: "hoch", tags: ["unterlagen", "eigentümer"], wiederholung: "woechentlich", typ: "aufgabe" });
  });
  it("versteht Wochentage, relative Angaben und Daten", () => {
    expect(schnelleingabeParsen("Rückruf Familie Sommer am Montag", heute).faellig_am).toBe("2026-09-07");
    expect(schnelleingabeParsen("Grundbuch bestellen in 2 Wochen", heute).faellig_am).toBe("2026-09-17");
    expect(schnelleingabeParsen("Notartermin 12.10.", heute).faellig_am).toBe("2026-10-12");
    expect(schnelleingabeParsen("Rückblick 01.02.", heute).faellig_am).toBe("2027-02-01");
    expect(schnelleingabeParsen("Exposé prüfen heute", heute)).toMatchObject({ titel: "Exposé prüfen", faellig_am: "2026-09-03" });
  });
  it("erkennt Notizen und lässt Text ohne Marker unverändert", () => {
    expect(schnelleingabeParsen("Notiz: Flyer-Idee für Nordend", heute)).toMatchObject({ typ: "notiz", titel: "Flyer-Idee für Nordend", faellig_am: null });
    expect(schnelleingabeParsen("Einfach nur ein Titel", heute)).toMatchObject({ titel: "Einfach nur ein Titel", faellig_am: null, prioritaet: "mittel", tags: [], wiederholung: null });
  });
  it("rechnet die nächste Fälligkeit einer Wiederholung", () => {
    expect(naechsteFaelligkeit("2026-01-31", "monatlich")).toBe("2026-03-03");
    expect(naechsteFaelligkeit("2026-09-03", "woechentlich")).toBe("2026-09-10");
    expect(naechsteFaelligkeit("2026-02-28", "jaehrlich")).toBe("2027-02-28");
  });
});
