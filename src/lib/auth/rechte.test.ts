import { describe, expect, it } from "vitest";

import {
  AKTIONEN,
  MODULE,
  hatRecht,
  rechtSchluessel,
  rollenVorgabe,
  uebersteuerungAusAuswahl,
  uebersteuerungLesen,
  type Rolle,
} from "./rechte";

/** Alle Rechte, die eine Rolle von sich aus mitbringt. */
function vorgabeAuswahl(rolle: Rolle): string[] {
  return MODULE.flatMap((modul) =>
    AKTIONEN.filter((aktion) => rollenVorgabe(rolle, modul, aktion)).map((aktion) =>
      rechtSchluessel(modul, aktion),
    ),
  );
}

describe("uebersteuerungAusAuswahl", () => {
  it("speichert nichts, solange die Auswahl der Rolle entspricht", () => {
    for (const rolle of ["inhaber", "makler", "nur_lesen"] as const) {
      expect(uebersteuerungAusAuswahl(rolle, vorgabeAuswahl(rolle))).toEqual({});
    }
  });

  it("hält ein entzogenes Recht als ausdrückliches Nein fest", () => {
    const auswahl = vorgabeAuswahl("makler").filter((s) => s !== "objekte:anlegen");

    expect(uebersteuerungAusAuswahl("makler", auswahl)).toEqual({
      objekte: { anlegen: false },
    });
  });

  it("hält ein zusätzliches Recht als ausdrückliches Ja fest", () => {
    const auswahl = [...vorgabeAuswahl("marketing"), "objekte:aendern"];

    expect(uebersteuerungAusAuswahl("marketing", auswahl)).toEqual({
      objekte: { aendern: true },
    });
  });

  it("gibt jede Auswahl unverändert zurück, wenn man sie wieder auswertet", () => {
    // Der eigentliche Zweck: Was in der Oberfläche angehakt ist, muss nach dem
    // Speichern genau so gelten. Ein Rundlauf über alle Rollen und alle Felder
    // ist die einzige Prüfung, die das wirklich zusichert.
    const gewaehlt = ["objekte:lesen", "objekte:loeschen", "abrechnung:lesen"];

    for (const rolle of ["inhaber", "administrator", "makler", "assistenz", "marketing", "nur_lesen"] as const) {
      const uebersteuerung = uebersteuerungAusAuswahl(rolle, gewaehlt);

      for (const modul of MODULE) {
        for (const aktion of AKTIONEN) {
          expect(hatRecht({ rolle, uebersteuerung }, modul, aktion)).toBe(
            gewaehlt.includes(rechtSchluessel(modul, aktion)),
          );
        }
      }
    }
  });

  it("entzieht bei leerer Auswahl wirklich alles", () => {
    // Ohne die ausdrücklichen Neins bliebe die Rollenvorbelegung stehen — ein
    // Benutzer, dem jemand alle Häkchen entfernt hat, hätte weiterhin Rechte.
    const uebersteuerung = uebersteuerungAusAuswahl("inhaber", []);

    for (const modul of MODULE) {
      for (const aktion of AKTIONEN) {
        expect(hatRecht({ rolle: "inhaber", uebersteuerung }, modul, aktion)).toBe(false);
      }
    }
  });
});

describe("uebersteuerungLesen", () => {
  it("übernimmt gültige Angaben", () => {
    expect(uebersteuerungLesen({ objekte: { loeschen: true, lesen: false } })).toEqual({
      objekte: { loeschen: true, lesen: false },
    });
  });

  it("verwirft unbekannte Module, unbekannte Aktionen und fremde Werte", () => {
    // Solche Reste entstehen bei Umbenennungen. Sie durchzulassen wäre
    // gefährlicher als sie zu verwerfen: `hatRecht` ignoriert sie ohnehin, die
    // Oberfläche zeigte aber ein Häkchen ohne Wirkung.
    expect(
      uebersteuerungLesen({
        objekte: { loeschen: true, drucken: true },
        buchhaltung: { lesen: true },
        kontakte: { lesen: "ja" },
      }),
    ).toEqual({ objekte: { loeschen: true } });
  });

  it("liefert für alles, was keine Abbildung ist, eine leere Übersteuerung", () => {
    expect(uebersteuerungLesen(null)).toEqual({});
    expect(uebersteuerungLesen(undefined)).toEqual({});
    expect(uebersteuerungLesen("{}")).toEqual({});
    expect(uebersteuerungLesen([{ objekte: { lesen: true } }])).toEqual({});
  });
});

describe("hatRecht", () => {
  it("lässt die Übersteuerung vor der Rolle gelten — in beide Richtungen", () => {
    expect(hatRecht({ rolle: "nur_lesen" }, "objekte", "loeschen")).toBe(false);
    expect(
      hatRecht(
        { rolle: "nur_lesen", uebersteuerung: { objekte: { loeschen: true } } },
        "objekte",
        "loeschen",
      ),
    ).toBe(true);

    expect(hatRecht({ rolle: "inhaber" }, "objekte", "loeschen")).toBe(true);
    expect(
      hatRecht(
        { rolle: "inhaber", uebersteuerung: { objekte: { loeschen: false } } },
        "objekte",
        "loeschen",
      ),
    ).toBe(false);
  });
});
