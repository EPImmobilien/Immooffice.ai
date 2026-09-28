import { describe, expect, it } from "vitest";

import {
  bodenwert,
  ertragswert,
  sachwert,
  spanne,
  vergleichswert,
  vervielfaeltiger,
} from "./wertermittlung";

describe("Vervielfältiger nach § 20 ImmoWertV", () => {
  it("rechnet das Lehrbuchbeispiel", () => {
    // 5 % über 30 Jahre ergibt rund 15,37 — nachgerechnet mit
    // ((1,05^30 − 1) / (1,05^30 × 0,05)).
    expect(vervielfaeltiger(5, 30)).toBeCloseTo(15.372, 2);
  });

  it("wächst mit der Restnutzungsdauer und fällt mit dem Zins", () => {
    expect(vervielfaeltiger(5, 50)).toBeGreaterThan(vervielfaeltiger(5, 30));
    expect(vervielfaeltiger(7, 30)).toBeLessThan(vervielfaeltiger(5, 30));
  });

  it("fällt bei Zins null auf die Restnutzungsdauer zurück", () => {
    // Die Formel ist bei p = 0 nicht definiert. Ohne Verzinsung werden schlicht
    // n Jahreserträge summiert — eine Division durch null wäre NaN und würde
    // als Ergebnis durchgereicht.
    expect(vervielfaeltiger(0, 40)).toBe(40);
  });
});

describe("Ertragswertverfahren", () => {
  const vollstaendig = {
    jahresrohertrag: 24_000,
    bewirtschaftungsquote: 20,
    bodenwert: 150_000,
    liegenschaftszins: 4,
    restnutzungsdauer: 45,
  };

  it("rechnet die Kette bis zum Ertragswert", () => {
    const e = ertragswert(vollstaendig);
    // Reinertrag 19.200, Bodenverzinsung 6.000, Gebäudereinertrag 13.200,
    // Vervielfältiger bei 4 % / 45 Jahre rund 20,72 → rund 273.500 + 150.000.
    expect(e.wert).toBeGreaterThan(400_000);
    expect(e.wert).toBeLessThan(440_000);
  });

  it("legt jeden Zwischenschritt offen", () => {
    // Der Kern der Vorgabe „keine Blackbox": Wer das Ergebnis nicht
    // nachvollziehen kann, kann es nicht vertreten.
    const e = ertragswert(vollstaendig);
    const namen = e.schritte.map((s) => s.bezeichnung);
    expect(namen.some((n) => n.startsWith("Reinertrag"))).toBe(true);
    expect(namen.some((n) => n.startsWith("Gebäudereinertrag"))).toBe(true);
    expect(namen.some((n) => n.startsWith("Vervielfältiger"))).toBe(true);
  });

  it("nennt fehlende Angaben statt zu raten", () => {
    const e = ertragswert({ ...vollstaendig, liegenschaftszins: null });
    expect(e.wert).toBeNull();
    expect(e.fehlend).toContain("Liegenschaftszinssatz");
  });

  it("erklärt einen negativen Gebäudereinertrag", () => {
    // Hoher Bodenwert, geringer Ertrag: Rechnerisch trägt das Gebäude nichts
    // bei. Das ist ein zulässiges Ergebnis und muss erklärt werden, nicht
    // versteckt.
    const e = ertragswert({
      ...vollstaendig,
      jahresrohertrag: 6_000,
      bodenwert: 400_000,
    });
    const schritt = e.schritte.find((s) =>
      s.bezeichnung.startsWith("Gebäudereinertrag"),
    );
    expect(schritt?.wert).toBeLessThan(0);
    expect(schritt?.erlaeuterung).toContain("deckt die Bodenwertverzinsung nicht");
  });

  it("behandelt eine Bewirtschaftungsquote von null als Angabe", () => {
    // 0 % ist eine getroffene Aussage, kein fehlender Wert. Mit einer
    // Wahrheitsprüfung wäre sie als „fehlt" durchgegangen.
    const e = ertragswert({ ...vollstaendig, bewirtschaftungsquote: 0 });
    expect(e.fehlend).toEqual([]);
    expect(e.wert).not.toBeNull();
  });
});

describe("Sachwertverfahren", () => {
  const vollstaendig = {
    bruttogrundflaeche: 200,
    herstellungskostenProQm: 2_000,
    gesamtnutzungsdauer: 80,
    alter: 20,
    bodenwert: 120_000,
    aussenanlagen: 15_000,
    sachwertfaktor: 1,
  };

  it("rechnet Herstellungskosten, Alterung und Bodenwert zusammen", () => {
    const e = sachwert(vollstaendig);
    // 400.000 − 25 % = 300.000, plus 15.000 plus 120.000 = 435.000.
    expect(e.wert).toBe(435_000);
  });

  it("wendet den Sachwertfaktor an", () => {
    const e = sachwert({ ...vollstaendig, sachwertfaktor: 1.2 });
    expect(e.wert).toBe(522_000);
  });

  it("begrenzt die Alterswertminderung auf hundert Prozent", () => {
    // Ohne Grenze ergäbe ein 120 Jahre altes Haus bei 80 Jahren
    // Gesamtnutzungsdauer einen NEGATIVEN Gebäudewert — der Sachwert läge dann
    // unter dem Bodenwert, was fachlich unsinnig ist.
    const e = sachwert({ ...vollstaendig, alter: 120 });
    expect(e.wert).toBe(135_000); // nur Außenanlagen und Bodenwert
    const minderung = e.schritte.find((s) =>
      s.bezeichnung.startsWith("Alterswertminderung"),
    );
    expect(minderung?.erlaeuterung).toContain("Auf 100 % begrenzt");
  });

  it("kommt ohne Außenanlagen und ohne Faktor aus", () => {
    const e = sachwert({
      ...vollstaendig,
      aussenanlagen: null,
      sachwertfaktor: null,
    });
    expect(e.wert).toBe(420_000);
  });

  it("nennt fehlende Angaben", () => {
    const e = sachwert({ ...vollstaendig, bruttogrundflaeche: null });
    expect(e.wert).toBeNull();
    expect(e.fehlend).toContain("Bruttogrundfläche");
  });
});

describe("Vergleichswertverfahren", () => {
  it("rechnet über den Median der Quadratmeterpreise", () => {
    const e = vergleichswert({
      wohnflaeche: 100,
      objekte: [
        { bezeichnung: "A", kaufpreis: 300_000, wohnflaeche: 100, anpassung: 0 },
        { bezeichnung: "B", kaufpreis: 320_000, wohnflaeche: 100, anpassung: 0 },
        { bezeichnung: "C", kaufpreis: 340_000, wohnflaeche: 100, anpassung: 0 },
      ],
    });
    expect(e.wert).toBe(320_000);
  });

  it("lässt sich von einem Ausreißer nicht verziehen", () => {
    // Der Mittelwert läge hier bei 5.000 €/m² und damit 25 Prozent über dem
    // Median — bei drei Vergleichen ein realistischer Fall.
    const e = vergleichswert({
      wohnflaeche: 100,
      objekte: [
        { bezeichnung: "A", kaufpreis: 300_000, wohnflaeche: 100, anpassung: 0 },
        { bezeichnung: "B", kaufpreis: 400_000, wohnflaeche: 100, anpassung: 0 },
        { bezeichnung: "C", kaufpreis: 800_000, wohnflaeche: 100, anpassung: 0 },
      ],
    });
    expect(e.wert).toBe(400_000);
  });

  it("wendet Zu- und Abschläge je Objekt an", () => {
    const e = vergleichswert({
      wohnflaeche: 100,
      objekte: [
        { bezeichnung: "A", kaufpreis: 300_000, wohnflaeche: 100, anpassung: 10 },
      ],
    });
    expect(e.wert).toBe(330_000);
  });

  it("übergeht unvollständige Vergleichsobjekte", () => {
    const e = vergleichswert({
      wohnflaeche: 100,
      objekte: [
        { bezeichnung: "A", kaufpreis: 300_000, wohnflaeche: 100, anpassung: 0 },
        { bezeichnung: "Ohne Preis", kaufpreis: null, wohnflaeche: 90, anpassung: 0 },
        { bezeichnung: "Ohne Fläche", kaufpreis: 250_000, wohnflaeche: null, anpassung: 0 },
      ],
    });
    expect(e.wert).toBe(300_000);
    const anzahl = e.schritte.find((s) =>
      s.bezeichnung.startsWith("Verwertbare"),
    );
    expect(anzahl?.wert).toBe(1);
  });

  it("verlangt mindestens ein verwertbares Vergleichsobjekt", () => {
    const e = vergleichswert({ wohnflaeche: 100, objekte: [] });
    expect(e.wert).toBeNull();
    expect(e.fehlend.join(" ")).toContain("Vergleichsobjekt");
  });
});

describe("Bodenwert", () => {
  it("rechnet Richtwert mal Fläche", () => {
    expect(bodenwert(400, 500)).toBe(200_000);
  });

  it("liefert ohne Angaben nichts statt null Euro", () => {
    expect(bodenwert(null, 500)).toBeNull();
    expect(bodenwert(400, null)).toBeNull();
    expect(bodenwert(400, 0)).toBeNull();
  });
});

describe("Spanne", () => {
  it("liefert die Bandbreite der gerechneten Verfahren", () => {
    expect(spanne([400_000, 435_000, null])).toEqual({
      von: 400_000,
      bis: 435_000,
    });
  });

  it("liefert nichts, wenn kein Verfahren gerechnet werden konnte", () => {
    expect(spanne([null, null])).toBeNull();
  });
});
