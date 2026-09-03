import { describe, expect, it } from "vitest";

import { fehlendeAngaben, leeresProtokoll, protokollAlsDokument, protokollAusZeile, rollen } from "./uebergabe";

describe("Uebergabeprotokoll", () => {
  it("Rollen je Kontext und Typ", () => {
    expect(rollen({ kontext: "verkauf", typ: "uebergabe" })).toEqual({ uebergeber: "Verkäufer", uebernehmer: "Käufer" });
    expect(rollen({ kontext: "vermietung", typ: "auszug" })).toEqual({ uebergeber: "Mieter", uebernehmer: "Vermieter" });
  });

  it("listet fehlende Angaben und wird mit vollstaendigen Daten leer", () => {
    const p = leeresProtokoll("verkauf", "uebergabe");
    expect(fehlendeAngaben(p)).toContain("Datum der Übergabe");
    expect(fehlendeAngaben(p)).toContain("Unterschrift Käufer");
    p.datum = "2026-09-04"; p.objekt.adresse = "Lindenallee 12"; p.uebergeber.name = "A"; p.uebernehmer.name = "B";
    p.schluessel.push({ id: "1", art: "haustuer", anzahl: 2, bemerkung: "" });
    p.zaehler.push({ id: "1", art: "strom", nummer: "123", stand: "4567", einheit: "kWh", foto_pfad: null, ki_gelesen: false });
    p.raeume.push({ id: "1", name: "Küche", zustand: "gut", maengel: "", foto_pfade: [] });
    p.unterschriften = { uebergeber: { name: "A", bild: "data:image/png;base64,AAAA", zeit: "2026-09-04T10:00:00Z" }, uebernehmer: { name: "B", bild: "data:image/png;base64,AAAA", zeit: null } };
    expect(fehlendeAngaben(p)).toEqual([]);
    const d = protokollAlsDokument(p);
    expect(d.titel).toContain("Übergabe an Käufer");
    expect(d.abschnitte.find((a) => a.ueberschrift === "Zählerstände")?.tabelle?.zeilen[0]).toEqual(["Strom", "123", "4567 kWh", "manuell"]);
    expect(d.abschnitte.at(-1)?.unterschriften?.[0]?.bezeichnung).toBe("Verkäufer");
  });

  it("liest eine Datenbankzeile tolerant", () => {
    const p = protokollAusZeile({ kontext: "vermietung", typ: "einzug", bezeichnung: "x", schluessel: [{ id: "a", art: "keller", anzahl: 1, bemerkung: "" }], unterschriften: {}, sonstiges: { schimmel: "ja" } });
    expect(p.typ).toBe("einzug");
    expect(p.schluessel).toHaveLength(1);
    expect(p.sonstiges.schimmel).toBe("ja");
    expect(p.sonstiges.rauchmelder_funktion).toBe("nicht_geprueft");
    expect(p.unterschriften.uebergeber).toBeNull();
  });
});
