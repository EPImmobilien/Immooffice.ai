import { describe, expect, it } from "vitest";

import { AUTO_SCHWELLE, kontaktErkennen, normalisieren, objektErkennen, zuordnen, type ObjektIndexEintrag } from "./zuordnung";

const objekte: ObjektIndexEintrag[] = [
  { id: "o1", objektnummer: "0042", strasse: "Musterstraße", hausnummer: "12", plz: "20095", ort: "Hamburg", status: "aktiv" },
  { id: "o2", objektnummer: "0043", strasse: "Musterstraße", hausnummer: "14a", plz: "20095", ort: "Hamburg", status: "aktiv" },
  { id: "o3", objektnummer: "HH-2026-07", strasse: "Elbchaussee", hausnummer: "1", plz: "22763", ort: "Hamburg", status: "verkauft" },
  { id: "o4", objektnummer: "0099", strasse: "Weg", hausnummer: null, plz: null, ort: null, status: "akquise" },
];

describe("normalisieren", () => {
  it("loest Umlaute auf und vereinheitlicht Strassenkuerzel", () => {
    expect(normalisieren("Musterstraße 12")).toBe("musterstrasse 12");
    expect(normalisieren("Muster-Str. 12")).toBe("muster strasse 12");
    expect(normalisieren("Musterstr. 12")).toBe("musterstrasse 12");
    expect(normalisieren("Große Bäckerstr.")).toBe("grosse baeckerstrasse");
  });
});

describe("objektErkennen", () => {
  it("findet eine ausdrueckliche Objektnummer mit hoher Sicherheit", () => {
    const t = objektErkennen("Guten Tag, ich interessiere mich für Objekt-Nr. 0042.", objekte);
    expect(t?.objektId).toBe("o1");
    expect(t?.konfidenz).toBeGreaterThanOrEqual(AUTO_SCHWELLE);
    expect(objektErkennen("Betreff: Anfrage #0043", objekte)?.objektId).toBe("o2");
  });

  it("nimmt eine rein numerische Nummer nicht als freies Wort", () => {
    expect(objektErkennen("Meine Kundennummer lautet 0042, bitte melden.", objekte)).toBeNull();
  });

  it("erkennt eine nicht-numerische Objektnummer auch ohne Schluesselwort", () => {
    const t = objektErkennen("Ist HH-2026-07 noch zu haben?", objekte);
    expect(t?.objektId).toBe("o3");
    // verkauft: Abschlag, aber weiterhin ueber der Schwelle fuer die Nennung
    expect(t?.konfidenz).toBe(82);
  });

  it("ordnet ueber Strasse und Hausnummer zu, nicht ueber die Strasse allein", () => {
    const genau = objektErkennen("Wir waren gestern in der Musterstraße 14a in Hamburg.", objekte);
    expect(genau?.objektId).toBe("o2");
    expect(genau?.konfidenz).toBeGreaterThanOrEqual(AUTO_SCHWELLE);

    const unklar = objektErkennen("Die Wohnung in der Musterstraße gefällt uns.", objekte);
    expect(unklar).not.toBeNull();
    expect(unklar?.konfidenz).toBeLessThanOrEqual(50);
    expect(unklar?.grund).toContain("mehrere Objekte");
  });

  it("wertet eine andere Hausnummer als anderes Objekt", () => {
    const t = objektErkennen("Musterstraße 99, Hamburg — ist das Ihres?", objekte);
    expect(t).toBeNull();
  });

  it("ignoriert generische Strassennamen und leeren Text", () => {
    expect(objektErkennen("Wir gehen den Weg entlang.", objekte)).toBeNull();
    expect(objektErkennen("   ", objekte)).toBeNull();
    expect(objektErkennen("Objekt 0042", [])).toBeNull();
  });
});

describe("kontaktErkennen", () => {
  it("vergleicht Adressen ohne Gross-/Kleinschreibung", () => {
    const kontakte = [
      { id: "k1", email: "Maria.Muster@beispiel.invalid" },
      { id: "k2", email: null },
    ];
    expect(kontaktErkennen("maria.muster@beispiel.invalid", kontakte)).toBe("k1");
    expect(kontaktErkennen("unbekannt@beispiel.invalid", kontakte)).toBeNull();
    expect(kontaktErkennen(null, kontakte)).toBeNull();
  });
});

describe("zuordnen", () => {
  it("ordnet ab der Schwelle automatisch zu und kennzeichnet das", () => {
    const z = zuordnen("maria.muster@beispiel.invalid", "Objekt 0042", "Wann können wir besichtigen?", objekte, [
      { id: "k1", email: "maria.muster@beispiel.invalid" },
    ]);
    expect(z).toMatchObject({ kontaktId: "k1", objektId: "o1", zuordnungArt: "automatisch" });
  });

  it("macht unter der Schwelle nur einen Vorschlag", () => {
    const z = zuordnen("x@beispiel.invalid", "Musterstraße", "Frage zur Wohnung", objekte, []);
    expect(z.objektId).toBeNull();
    expect(z.zuordnungArt).toBeNull();
    expect(z.vorschlag?.objektId).toBe("o1");
  });
});
