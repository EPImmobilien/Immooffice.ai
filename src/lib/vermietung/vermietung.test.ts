import { describe, expect, it } from "vitest";

import { anredeText, bewertungVorschlag, STANDARD_VORLAGEN, terminText, vorlageAusfuellen } from "./anfragen";
import { portalAnfrageErkennen } from "./mail-parser";
import { fehlendeAngaben, gesamtmiete, kautionVorschlag, leererMietvertrag, mietvertragAusZeile, mietvertragText } from "./mietvertrag";

describe("Mietvertrag", () => {
  it("rechnet Gesamtmiete und Kautionsvorschlag", () => {
    expect(gesamtmiete({ grundmiete: 900, bk_kalt: 150, bk_warm: 100, stellplatz: 50 })).toBe(1200);
    expect(kautionVorschlag(900)).toBe(2700);
  });

  it("nennt fehlende Angaben und warnt bei zu hoher Kaution", () => {
    const d = leererMietvertrag();
    expect(fehlendeAngaben(d)).toContain("Vermieter");
    expect(fehlendeAngaben(d)).toContain("Grundmiete");
    d.grundmiete = 900; d.kaution = 3000;
    expect(fehlendeAngaben(d)).toContain("Kaution über drei Grundmieten (§ 551 BGB)");
  });

  it("erzeugt den Vertragstext mit Parteien, Miete, Kaution und Neubau-Klausel", () => {
    const d = mietvertragAusZeile({
      vermieter: { typ: "firma", firma: "Haus GmbH", vertreter: "Frau Chef" },
      mieter: { typ: "eheleute", personen: [{ name: "Max Muster" }, { name: "Eva Muster" }] },
      objekt: { strasse: "Berger Straße 210", plz: "60385", ort: "Frankfurt", lage: "2. OG links", raeume: "2 Zimmer, Küche, Bad", wohnflaeche: "58" },
      mietbeginn: "2026-11-01", grundmiete: "1150", bk_kalt: "220", bk_warm: "0", stellplatz: 0, kaution: 3450, kuendigungsausschluss_monate: 12, neubau_klausel: true,
      bank: { iban: "DE00 1234", kontoinhaber: "Haus GmbH" },
    });
    const t = mietvertragText(d);
    expect(t).toContain("Haus GmbH, vertreten durch Frau Chef");
    expect(t).toContain("Max Muster");
    expect(t).toContain("1.150");
    expect(t).toContain("1.370"); // Gesamtmiete
    expect(t).toContain("3.450");
    expect(t).toContain("§ 7 Neubau");
    expect(t).toContain("12 Monate");
    expect(t).toContain("IBAN DE00 1234");
    expect(t).toContain("Muster und keine Rechtsberatung");
  });
});

describe("Mietanfragen", () => {
  it("bewertet nach Einkommen, Bonitaet und Kaution", () => {
    const gut = bewertungVorschlag({ einkommen_netto: 3600, schufa_vorhanden: true, kann_kaution_leisten: true, angaben_bestaetigt: true, einzug_ab: null }, 1000);
    expect(gut.punkte).toBe(5);
    const schwach = bewertungVorschlag({ einkommen_netto: 1500, schufa_vorhanden: false, kann_kaution_leisten: false, angaben_bestaetigt: false, einzug_ab: null }, 1000);
    expect(schwach.punkte).toBe(1);
    expect(schwach.gruende).toContain("Angaben nicht bestätigt");
  });

  it("fuellt Vorlagen mit Anrede, Objekt und Termin", () => {
    const v = STANDARD_VORLAGEN.find((x) => x.schluessel === "besichtigung")!;
    const e = vorlageAusfuellen(v, { anrede: anredeText("Frau", "Muster"), name: "Sabine Muster", objekt: "2-Zimmer-Wohnung, Berger Straße", termin: terminText("2026-09-10T15:30:00Z"), absender: "Maria Demo", firma: "Demo Immobilien", link: "" });
    expect(e.betreff).toBe("Besichtigungstermin: 2-Zimmer-Wohnung, Berger Straße");
    expect(e.text).toContain("Sehr geehrte Frau Muster,");
    expect(e.text).toMatch(/Termin: .*10\.09\.2026/);
    expect(e.text).toContain("Maria Demo\nDemo Immobilien");
  });
});

describe("Portalanfragen erkennen", () => {
  it("liest eine strukturierte Portalmail", () => {
    const e = portalAnfrageErkennen({
      betreff: "Neue Anfrage zu Ihrem Objekt DEMO-003 (Scout-ID 12345)",
      text: "Sie haben eine Anfrage über ImmobilienScout24 erhalten.\n\nName: Herr Jonas Schneider\nE-Mail: jonas@example.com\nTelefon: 0170 1234567\nObjekt-Nr: DEMO-003\nEinzug ab: 01.11.2026\nPersonen: 2\n\nNachricht:\nIch interessiere mich für die Wohnung und bitte um einen Besichtigungstermin.",
      vonAdresse: "anfragen@portal-weiterleitung.invalid", vonName: "Portal",
    });
    expect(e.erkannt).toBe(true);
    expect(e.portal).toBe("immoscout");
    expect(e.anrede).toBe("Herr");
    expect(e.vorname).toBe("Jonas");
    expect(e.nachname).toBe("Schneider");
    expect(e.email).toBe("jonas@example.com");
    expect(e.telefon).toBe("0170 1234567");
    expect(e.objektnummer).toBe("DEMO-003");
    expect(e.personen).toBe(2);
    expect(e.nachricht).toContain("Besichtigungstermin");
  });

  it("nimmt bei einer normalen Mail den Absender", () => {
    const e = portalAnfrageErkennen({ betreff: "Interesse an Ihrer Wohnung", text: "Hallo, ist die Wohnung noch frei? Viele Grüße", vonAdresse: "sabine@example.com", vonName: "Sabine Muster" });
    expect(e.erkannt).toBe(true);
    expect(e.portal).toBe("web");
    expect(e.email).toBe("sabine@example.com");
    expect(e.nachname).toBe("Muster");
    expect(e.vorname).toBe("Sabine");
  });

  it("erkennt eine Rechnung nicht als Anfrage", () => {
    const e = portalAnfrageErkennen({ betreff: "Rechnung 2026-09", text: "Anbei die Rechnung.", vonAdresse: "buchhaltung@example.com", vonName: "Buchhaltung" });
    expect(e.erkannt).toBe(false);
  });
});
