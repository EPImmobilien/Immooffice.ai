import { describe, expect, it } from "vitest";

import { entitaetenAufloesen, htmlZuText, nameAusAdresse, vorschau, zitatAbschneiden } from "./text";

describe("htmlZuText", () => {
  it("macht aus Absaetzen, Umbruechen und Listen lesbaren Text", () => {
    const html = `<html><head><style>p{color:red}</style></head><body>
      <p>Guten Tag,<br>wir haben Interesse.</p>
      <ul><li>Besichtigung am Samstag</li><li>Finanzierung steht</li></ul>
      <div>Viele Gr&uuml;&szlig;e</div></body></html>`;
    expect(htmlZuText(html)).toBe(
      "Guten Tag,\nwir haben Interesse.\n\n- Besichtigung am Samstag\n- Finanzierung steht\n\nViele Grüße",
    );
  });

  it("behaelt Linkziele und laesst Skripte weg", () => {
    const html = `<script>alert(1)</script><p>Expos&eacute;: <a href="https://beispiel.invalid/e/1">hier</a></p>`;
    expect(htmlZuText(html)).toBe("Exposé: hier (https://beispiel.invalid/e/1)");
  });

  it("loest numerische Entitaeten auf", () => {
    expect(entitaetenAufloesen("5&#8239;m&#xB2; &amp; mehr")).toBe("5\u202Fm² & mehr");
  });
});

describe("vorschau", () => {
  it("kuerzt auf eine Zeile mit Auslassungszeichen", () => {
    expect(vorschau("Erste Zeile\n\nZweite   Zeile", 18)).toBe("Erste Zeile Zweit…");
    expect(vorschau("kurz")).toBe("kurz");
    expect(vorschau("   ")).toBeNull();
    expect(vorschau(null)).toBeNull();
  });
});

describe("zitatAbschneiden", () => {
  it("schneidet die zitierte Ursprungsnachricht ab", () => {
    const text = "Gern am Samstag.\n\nAm 01.09.2026 um 10:12 schrieb Max Muster:\n> Wann passt es?";
    expect(zitatAbschneiden(text)).toBe("Gern am Samstag.");
    expect(zitatAbschneiden("Ja.\n-----Original Message-----\nFrom: x")).toBe("Ja.");
    expect(zitatAbschneiden("Ohne Zitat")).toBe("Ohne Zitat");
  });
});

describe("nameAusAdresse", () => {
  it("bildet einen Anzeigenamen aus dem lokalen Teil", () => {
    expect(nameAusAdresse("maria.musterfrau@beispiel.invalid")).toBe("Maria Musterfrau");
    expect(nameAusAdresse("info@beispiel.invalid")).toBe("Info");
  });
});
