import { describe, expect, it } from "vitest";

import { sicheresZiel } from "./ziel";

describe("Weiterleitungsziel", () => {
  it("lässt eigene Pfade durch", () => {
    expect(sicheresZiel("/objekte")).toBe("/objekte");
    expect(sicheresZiel("/objekte/123?tab=bilder")).toBe("/objekte/123?tab=bilder");
  });

  it("weist vollständige Adressen ab", () => {
    expect(sicheresZiel("https://fremde.example")).toBe("/dashboard");
    expect(sicheresZiel("http://fremde.example")).toBe("/dashboard");
  });

  it("weist schemalose Adressen ab", () => {
    // `//host` ist kein relativer Pfad: Der Browser ergänzt das Schema der
    // aktuellen Seite und landet auf einem fremden Host. Eine Prüfung, die nur
    // auf einen führenden Schrägstrich schaut, lässt genau das durch.
    expect(sicheresZiel("//fremde.example")).toBe("/dashboard");
    expect(sicheresZiel("//fremde.example/anmelden")).toBe("/dashboard");
  });

  it("weist den Rückstrich ab", () => {
    // Browser behandeln `\` in der Hostposition wie `/`. `/\fremde.example`
    // beginnt mit einem Schrägstrich und ist trotzdem eine fremde Adresse.
    expect(sicheresZiel("/\\fremde.example")).toBe("/dashboard");
  });

  it("weist Leeres und Fehlendes ab", () => {
    expect(sicheresZiel(null)).toBe("/dashboard");
    expect(sicheresZiel(undefined)).toBe("/dashboard");
    expect(sicheresZiel("")).toBe("/dashboard");
    expect(sicheresZiel("   ")).toBe("/dashboard");
  });

  it("weist Pfade ohne führenden Schrägstrich ab", () => {
    // Ein relativer Pfad ohne Schrägstrich wird an die aktuelle Adresse
    // angehängt und ist damit nicht das, was der Aufrufer meinte.
    expect(sicheresZiel("objekte")).toBe("/dashboard");
  });

  it("erlaubt ein eigenes Rückfallziel", () => {
    expect(sicheresZiel("https://fremde.example", "/anmelden")).toBe("/anmelden");
  });
});
