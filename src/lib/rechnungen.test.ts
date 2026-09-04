import { describe, expect, it } from "vitest";

import { anredeZeile, briefAusfuellen, BRIEF_VORLAGEN, nettoAusBrutto, nummerVorschau, rechnungAlsDokument, rechnungMail, summen, type Rechnung } from "./rechnungen";

describe("Rechnungen", () => {
  it("rechnet Summen je Position gerundet und je Steuersatz", () => {
    const s = summen([
      { menge: 1, einzelpreis_netto: 10000, mwst_satz: 19 },
      { menge: 2, einzelpreis_netto: 50, mwst_satz: 7 },
      { menge: 3, einzelpreis_netto: 0.335, mwst_satz: 19 },
    ]);
    expect(s.netto).toBe(10101.01);
    expect(s.mwst).toBe(1907.19);
    expect(s.brutto).toBe(12008.2);
    expect(s.jeSatz).toEqual([{ satz: 19, netto: 10001.01, mwst: 1900.19 }, { satz: 7, netto: 100, mwst: 7 }]);
  });
  it("rechnet Brutto in Netto um und bildet die Nummernvorschau", () => {
    expect(nettoAusBrutto(119, 19)).toBe(100);
    expect(nettoAusBrutto(107, 7)).toBe(100);
    expect(nettoAusBrutto(1000, 19)).toBe(840.34);
    expect(nummerVorschau({ praefix: "RE", mit_jahr: true, naechste_nummer: 41 }, 2026)).toBe("RE-2026-041");
    expect(nummerVorschau({ praefix: "MM", mit_jahr: false, naechste_nummer: 7 })).toBe("MM-007");
  });
  it("bildet Anreden und Mailtexte", () => {
    expect(anredeZeile("Frau", "Erika Beispiel")).toBe("Sehr geehrte Frau Beispiel,");
    expect(anredeZeile("Herr", "Max Muster")).toBe("Sehr geehrter Herr Muster,");
    expect(anredeZeile(null, "Firma GmbH")).toBe("Sehr geehrte Damen und Herren,");
    const m = rechnungMail("erinnerung", { rechnungsnummer: "RE-2026-041", empfaenger_anrede: "Herr", empfaenger_name: "Max Muster" }, "Anna Makler", "Makler GmbH");
    expect(m.betreff).toBe("Erinnerung: Rechnung RE-2026-041");
    expect(m.text).toContain("Sehr geehrter Herr Muster,");
    expect(m.text).toContain("noch offen");
    expect(m.text.endsWith("Anna Makler\nMakler GmbH")).toBe(true);
  });
  it("erzeugt das Rechnungsdokument mit Positionen, Summen und Zahlungsangaben", () => {
    const r: Rechnung = {
      id: "r", absender_id: "a", kunde_id: null, kontakt_id: null, objekt_id: null, vertrag_id: null, typ: "rechnung", storno_von_id: null, storniert_durch_id: null,
      rechnungsnummer: "RE-2026-001", status: "gestellt", ist_test: false, empfaenger_anrede: "Frau", empfaenger_name: "Erika Beispiel", empfaenger_zusatz: null, empfaenger_strasse: "Musterweg 5", empfaenger_plz: "60322", empfaenger_ort: "Frankfurt", empfaenger_land: "Deutschland", empfaenger_email: null, empfaenger_ust_id: null,
      ausstellungsdatum: "2026-09-04", leistung_von: "2026-09-01", leistung_bis: null, zahlungsziel_tage: 14, faellig_am: "2026-09-18", einleitung: null, schluss: "Vielen Dank.", netto: 10000, mwst: 1900, brutto: 11900, bezahlt_am: null, bezahlt_betrag: null, gestellt_am: "2026-09-04T10:00:00Z", storno_grund: null,
      absender_snapshot: { name: "Makler GmbH", strasse: "Weg", hausnummer: "1", plz: "60311", ort: "Frankfurt", iban: "DE00 1234", bank_name: "Sparkasse", ust_id: "DE123456789", kleinunternehmer: false }, pdf_pfad: null, notiz: null, erstellt_am: "2026-09-04T09:00:00Z",
    };
    const d = rechnungAlsDokument(r, [{ id: "p", position: 1, beschreibung: "Provision", menge: 1, einheit: null, einzelpreis_netto: 10000, mwst_satz: 19, netto: 10000 }], null);
    expect(d.titel).toBe("Rechnung");
    expect(d.untertitel).toBe("RE-2026-001");
    const text = JSON.stringify(d);
    expect(text).toContain("Frau Erika Beispiel");
    expect(text).toContain("11.900,00");
    expect(text).toContain("18.09.2026");
    expect(text).toContain("IBAN DE00 1234");
    expect(text).toContain("USt 19 %");
    const k = rechnungAlsDokument({ ...r, absender_snapshot: { ...r.absender_snapshot, kleinunternehmer: true } }, [{ id: "p", position: 1, beschreibung: "Provision", menge: 1, einheit: null, einzelpreis_netto: 100, mwst_satz: 0, netto: 100 }], null);
    expect(JSON.stringify(k)).toContain("§ 19 UStG");
  });
  it("fuellt Briefvorlagen mit Platzhaltern", () => {
    const v = BRIEF_VORLAGEN["flurkarte"];
    expect(v).toBeDefined();
    const b = briefAusfuellen(v as NonNullable<typeof v>, { adresse: "Musterweg 5, 60322 Frankfurt", eigentuemer: "Erika Beispiel", gemarkung: "Bornheim", flurstueck: "12/3" });
    expect(b.betreff).toBe("Antrag auf Auszug aus der Liegenschaftskarte — Musterweg 5, 60322 Frankfurt");
    expect(b.text).toContain("Gemarkung Bornheim, Flurstück 12/3");
    expect(b.text).toContain("(Erika Beispiel)");
  });
});
