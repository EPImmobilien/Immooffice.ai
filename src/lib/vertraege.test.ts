import { describe, expect, it } from "vitest";

import {
  MUSTER_HINWEIS,
  SIGNATUR_EINORDNUNG,
  dokumentHash,
  textUnveraendert,
  widerrufMoeglich,
  widerrufsfrist,
} from "./vertraege";

describe("Widerrufsfrist", () => {
  it("läuft vierzehn Tage ab ordnungsgemäßer Belehrung", () => {
    const f = widerrufsfrist("2026-03-01", true, "2026-03-01");
    expect(f?.regulaer).toBe(true);
    expect(f?.endet.toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  it("beginnt bei späterer Belehrung erst mit dieser", () => {
    const f = widerrufsfrist("2026-03-01", true, "2026-03-10");
    expect(f?.endet.toISOString().slice(0, 10)).toBe("2026-03-24");
  });

  it("erlischt ohne Belehrung erst nach zwölf Monaten und vierzehn Tagen", () => {
    // Der eigentliche Zweck dieser Funktion. Eine Anwendung, die pauschal
    // vierzehn Tage anzeigt, wiegt einen Makler in Sicherheit, der seine
    // Provision noch ein Jahr lang verlieren kann (§ 356 Abs. 3 Satz 2 BGB).
    const f = widerrufsfrist("2026-03-01", true, null);
    expect(f?.regulaer).toBe(false);
    expect(f?.endet.toISOString().slice(0, 10)).toBe("2027-03-15");
  });

  it("kennt kein Widerrufsrecht gegenüber Unternehmern", () => {
    expect(widerrufsfrist("2026-03-01", false, "2026-03-01")).toBeNull();
  });

  it("behandelt eine unbrauchbare Belehrungsangabe wie eine fehlende", () => {
    // Sicherer Fehlschlag: Bei unlesbarem Datum gilt die LANGE Frist, nicht die
    // kurze. Andersherum wäre der Fehler zum Nachteil des Maklers.
    const f = widerrufsfrist("2026-03-01", true, "kein Datum");
    expect(f?.regulaer).toBe(false);
  });

  it("liefert bei unbrauchbarem Vertragsdatum nichts", () => {
    expect(widerrufsfrist("unsinn", true, null)).toBeNull();
  });
});

describe("Widerruf möglich", () => {
  const frist = widerrufsfrist("2026-03-01", true, "2026-03-01");

  it("ist innerhalb der Frist möglich", () => {
    expect(widerrufMoeglich(frist, new Date("2026-03-10"))).toBe(true);
  });

  it("ist nach der Frist nicht mehr möglich", () => {
    expect(widerrufMoeglich(frist, new Date("2026-03-20"))).toBe(false);
  });

  it("ist ohne Widerrufsrecht nie möglich", () => {
    expect(widerrufMoeglich(null, new Date("2026-03-02"))).toBe(false);
  });
});

describe("Dokumentfingerabdruck", () => {
  it("ist für denselben Text gleich", async () => {
    expect(await dokumentHash("Maklervertrag")).toBe(
      await dokumentHash("Maklervertrag"),
    );
  });

  it("ändert sich bei geändertem Text", async () => {
    // Auf diese Eigenschaft stützt sich die Anzeige „Text nach der Unterschrift
    // geändert". Ohne sie stünde eine Unterschrift unter einem anderen Text,
    // als der Unterzeichner gesehen hat.
    expect(await dokumentHash("Provision 3,57 %")).not.toBe(
      await dokumentHash("Provision 5,95 %"),
    );
  });

  it("übergeht Leerraum am Rand", async () => {
    expect(await dokumentHash("  Text  ")).toBe(await dokumentHash("Text"));
  });
});

describe("Textprüfung nach der Unterschrift", () => {
  it("erkennt einen unveränderten Text", async () => {
    const text = "Maklervertrag über die Wohnung Rosenweg 12.";
    const hash = await dokumentHash(text);
    expect(
      await textUnveraendert(text, [
        {
          name: "A. Sommer",
          email: "a@example.invalid",
          unterzeichnet_am: "2026-03-01T10:00:00Z",
          dokument_hash: hash,
        },
      ]),
    ).toBe(true);
  });

  it("erkennt eine nachträgliche Änderung", async () => {
    const hash = await dokumentHash("Provision 3,57 %");
    expect(
      await textUnveraendert("Provision 5,95 %", [
        {
          name: "A. Sommer",
          email: "a@example.invalid",
          unterzeichnet_am: "2026-03-01T10:00:00Z",
          dokument_hash: hash,
        },
      ]),
    ).toBe(false);
  });

  it("unterscheidet „nicht unterschrieben“ von „verändert“", async () => {
    // null statt false: Ohne Unterschrift gibt es nichts zu vergleichen. Als
    // `false` gemeldet, sähe jeder Entwurf nach Manipulation aus.
    expect(await textUnveraendert("Irgendein Text", [])).toBeNull();
  });
});

describe("Gleichlauf mit der Datenbank", () => {
  it("bildet denselben Fingerabdruck wie die Signaturfunktion in Postgres", async () => {
    // Die Unterschrift entsteht in der Datenbank
    // (`encode(digest(btrim(inhalt), 'sha256'), 'hex')`), der Abgleich später
    // hier. Weichen beide Rechnungen ab, meldet die Anwendung bei JEDEM
    // unterzeichneten Vertrag fälschlich eine nachträgliche Änderung — der
    // Hinweis wäre damit wertlos, weil er immer erscheint.
    //
    // Der erwartete Wert stammt aus einem echten Aufruf von
    // `vertrag_unterzeichnen` gegen die Datenbank.
    expect(await dokumentHash("Provision 3,57 % inkl. MwSt.")).toBe(
      "cc20a4b1763da37542f424de07e74602be9674cf4a71cf67ff2f442ff7955841",
    );
  });
});

describe("Rechtliche Einordnungstexte", () => {
  it("nennt die Signatur ausdrücklich einfach und grenzt sie ab", () => {
    expect(SIGNATUR_EINORDNUNG).toContain("Einfache elektronische Signatur");
    expect(SIGNATUR_EINORDNUNG).toContain("keine qualifizierte");
    expect(SIGNATUR_EINORDNUNG).toContain("Schriftform");
  });

  it("behauptet beim Muster keine Rechtssicherheit", () => {
    expect(MUSTER_HINWEIS).toContain("keine Rechtsberatung");
    expect(MUSTER_HINWEIS).toContain("anwaltlich prüfen");
    expect(MUSTER_HINWEIS.toLowerCase()).not.toContain("rechtssicher");
  });
});
