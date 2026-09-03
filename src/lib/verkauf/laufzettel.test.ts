import { describe, expect, it } from "vitest";

import { fehlendeAngaben, laufzettelAlsDokument, laufzettelAusDaten, leererLaufzettel, notarAnschreiben, parteiName } from "./laufzettel";

describe("Notar-Laufzettel", () => {
  it("liest Daten tolerant und ergaenzt Vorgaben", () => {
    const l = laufzettelAusDaten({ immobilie: { anschrift: "Lindenallee 12" }, verkaeufer: [{ vorname: "Max", nachname: "Beispiel" }], kaufpreis: { gesamt: "389000" } });
    expect(l.immobilie.anschrift).toBe("Lindenallee 12");
    expect(l.immobilie.bebaut).toBe("bebaut");
    expect(parteiName(l.verkaeufer[0]!)).toBe("Max Beispiel");
    expect(l.kaeufer).toHaveLength(1);
    expect(l.beauftragung.entwurf_an.makler).toBe(true);
  });

  it("nennt fehlende Pflichtangaben", () => {
    const f = fehlendeAngaben(leererLaufzettel());
    expect(f).toContain("Kaufpreis");
    expect(f).toContain("Notariat");
    expect(f).toContain("Mindestens ein Käufer");
  });

  it("Anschreiben und Dokument enthalten die Kernangaben", () => {
    const l = laufzettelAusDaten({ immobilie: { anschrift: "Lindenallee 12", plz: "60322", ort: "Frankfurt" }, verkaeufer: [{ vorname: "Max", nachname: "Beispiel" }], kaeufer: [{ art: "gesellschaft", gesellschaft_name: "Kauf GmbH" }], kaufpreis: { gesamt: "389000", finanzierung: "bank", bank_name: "Musterbank" }, sonstiges: { notar_kanzlei: "Notariat Weber" } });
    const a = notarAnschreiben(l, { name: "Maria Demo", firma: "Demo Immobilien", telefon: "069 1", email: "m@example.com" });
    expect(a.betreff).toContain("Lindenallee 12");
    expect(a.text).toContain("Kanzlei Notariat Weber");
    expect(a.text).toContain("389.000,00 €");
    expect(a.text).toContain("Kauf GmbH");
    expect(a.text).toContain("Kaufvertragsentwurf vorzubereiten");
    const d = laufzettelAlsDokument(l, [{ id: "1", name: "grundbuch.pdf", pfad: "x", mime: "application/pdf", bytes: 10, kategorie: "grundbuchauszug", ki_auswertung: null, hochgeladen_am: "2026-09-04" }]);
    expect(d.abschnitte.map((x) => x.ueberschrift)).toEqual(["I. Immobilie", "II. Verkäufer", "III. Käufer", "IV. Kaufpreis und Finanzierung", "V. Sonstiges", "VI. Anhänge", "VII. Beauftragung"]);
    expect(d.abschnitte[5]?.tabelle?.zeilen[0]?.[0]).toBe("Grundbuchauszug");
  });
});
