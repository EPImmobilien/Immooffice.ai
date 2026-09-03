import { describe, expect, it } from "vitest";

import { marketingReport, pipelinePrognose } from "./auswertung";
import { leadsAusCsv } from "./csv";
import { eigentuemerAnfrageErkennen } from "./mail-parser";
import { kategorieAusObjektart, preisRechnen, provisionsErwartung, wertindikation } from "./preisfinder";
import { leadAdresse, leadTitel, nachfassLage, STANDARD_EINSTELLUNGEN, vorlageAusfuellen, type Kampagne, type LeadZeile, type Quelle, type Stufe } from "./stammdaten";

function lead(teil: Partial<LeadZeile>): LeadZeile {
  return {
    id: "l", titel: "Lead", strasse: null, hausnummer: null, plz: null, ort: null, objektart: null, wohnflaeche: null, grundstueck: null, baujahr: null, zustand: null, verkaufszeitraum: null,
    kontakt_id: null, tippgeber_kontakt_id: null, objekt_id: null, wertermittlung_id: null, aufnahme_id: null, radar_id: null, pipeline_id: "p", stufe_id: "s1", quelle_id: null, kampagne_id: null, zustaendig_id: null,
    status: "offen", verlustgrund: null, gewonnen_am: null, verloren_am: null, wert_indikation: null, angebotspreis: null, provision_satz: null, provision_erwartet: null, nachfassen: true, nachfassen_am: null, notiz: null, erstellt_am: "2026-09-01T10:00:00Z",
    ...teil,
  };
}

describe("Preis-Finder", () => {
  it("rechnet Spanne, Startpreis und Provision auf Tausend gerundet", () => {
    const r = preisRechnen(487_600, STANDARD_EINSTELLUNGEN);
    expect(r).toEqual({ wert: 488_000, min: 439_000, max: 536_000, startpreis: 414_000, provision: 17_407, satz: 3.57 });
    expect(preisRechnen(null)).toBeNull();
    expect(preisRechnen(0)).toBeNull();
  });
  it("bildet die Wertindikation aus dem Median der €/m² passender Vergleichswerte", () => {
    const bestand = [
      { bezeichnung: "A", plz: "60311", ort: "Frankfurt", objektkategorie: "haus", kaufpreis: 500_000, wohnflaeche: 100, verkauft_am: null },
      { bezeichnung: "B", plz: "60311", ort: "Frankfurt", objektkategorie: "haus", kaufpreis: 660_000, wohnflaeche: 120, verkauft_am: null },
      { bezeichnung: "C", plz: "60311", ort: "Frankfurt", objektkategorie: "haus", kaufpreis: 360_000, wohnflaeche: 60, verkauft_am: null },
      { bezeichnung: "D", plz: "60385", ort: "Frankfurt", objektkategorie: "wohnung", kaufpreis: 900_000, wohnflaeche: 100, verkauft_am: null },
      { bezeichnung: "Ohne", plz: "60311", ort: "Frankfurt", objektkategorie: "haus", kaufpreis: null, wohnflaeche: 100, verkauft_am: null },
    ];
    const w = wertindikation({ plz: "60311", ort: "Frankfurt", objektart: "Einfamilienhaus", wohnflaeche: 140 }, bestand);
    // Median von 5000, 5500, 6000 = 5500 €/m² × 140 = 770.000
    expect(w.eurQm).toBe(5500);
    expect(w.wert).toBe(770_000);
    expect(w.vergleiche.map((v) => v.bezeichnung)).toEqual(["A", "B", "C"]);
    expect(w.vergleiche[0]?.gewichtung).toBe("plz");
    expect(w.fehlend).toEqual([]);
  });
  it("lockert die Eingrenzung sichtbar, wenn zu wenige Werte da sind", () => {
    const bestand = [
      { bezeichnung: "A", plz: "10115", ort: "Berlin", objektkategorie: "wohnung", kaufpreis: 400_000, wohnflaeche: 80, verkauft_am: null },
      { bezeichnung: "B", plz: "20095", ort: "Hamburg", objektkategorie: "haus", kaufpreis: 600_000, wohnflaeche: 100, verkauft_am: null },
    ];
    const w = wertindikation({ plz: "60311", ort: "Frankfurt", objektart: "Eigentumswohnung", wohnflaeche: 70 }, bestand);
    expect(w.vergleiche).toHaveLength(2);
    expect(w.vergleiche[0]?.gewichtung).toBe("bestand");
    expect(w.schritte[0]?.wert).toContain("zu wenige Werte");
    expect(w.eurQm).toBe(5500);
    expect(w.wert).toBe(385_000);
  });
  it("nennt fehlende Angaben statt zu raten", () => {
    const w = wertindikation({ plz: null, ort: null, objektart: null, wohnflaeche: null }, []);
    expect(w.wert).toBeNull();
    expect(w.fehlend).toContain("Wohnfläche des Leads");
    expect(w.fehlend).toContain("Verkaufte Objekte mit Kaufpreis und Wohnfläche im Bestand");
  });
  it("ordnet Objektarten der Bestandskategorie zu", () => {
    expect(kategorieAusObjektart("Doppelhaushälfte")).toBe("haus");
    expect(kategorieAusObjektart("Eigentumswohnung")).toBe("wohnung");
    expect(kategorieAusObjektart("Mehrfamilienhaus")).toBe("anlage");
    expect(kategorieAusObjektart(null)).toBeNull();
  });
  it("berechnet die Provisionserwartung je Provisionsart mit Abschlag und warnt bei doppelter Courtage", () => {
    const t = provisionsErwartung(500_000, "teilung", 3.57, 3.57);
    expect(t).toEqual({ satz: 7.14, nachlass: 10, basis: 450_000, brutto: 32_130, netto: 27_000, verdacht: false });
    expect(provisionsErwartung(500_000, "innen", 3.57, 3.57)?.brutto).toBe(16_065);
    expect(provisionsErwartung(500_000, "keine", 3.57, 3.57)?.brutto).toBe(0);
    expect(provisionsErwartung(500_000, "teilung", 7, 5)?.verdacht).toBe(true);
    expect(provisionsErwartung(null, "teilung", 3.57, 3.57)).toBeNull();
  });
});

describe("Auswertung", () => {
  const quellen: Quelle[] = [
    { id: "q1", name: "Website", art: "online", kampagne_id: "k1", pipeline_id: null, sortierung: 1, aktiv: true },
    { id: "q2", name: "Empfehlung", art: "netzwerk", kampagne_id: null, pipeline_id: null, sortierung: 2, aktiv: true },
  ];
  const kampagnen: Kampagne[] = [
    { id: "k1", name: "Google", art: "online", kanal: null, budget: 2000, ausgaben: 1000, beginn: "2026-08-01", ende: "2026-09-30", notiz: null, aktiv: true },
    { id: "k2", name: "Alt", art: "offline", kanal: null, budget: null, ausgaben: 999, beginn: "2025-01-01", ende: "2025-02-01", notiz: null, aktiv: false },
  ];
  const leads = [
    lead({ id: "1", quelle_id: "q1", status: "gewonnen", provision_erwartet: 15_000, erstellt_am: "2026-09-02T00:00:00Z" }),
    lead({ id: "2", quelle_id: "q1", status: "verloren", verlustgrund: "Privat verkauft", erstellt_am: "2026-09-03T00:00:00Z" }),
    lead({ id: "3", quelle_id: "q2", status: "offen", erstellt_am: "2026-09-04T00:00:00Z" }),
    lead({ id: "4", quelle_id: "q2", status: "gewonnen", provision_erwartet: 5_000, erstellt_am: "2026-07-01T00:00:00Z" }),
  ];
  it("zaehlt Leads, Gewinne, Ausgaben und Kennzahlen im Zeitraum", () => {
    const r = marketingReport(leads, kampagnen, quellen, "2026-09-01", "2026-09-30");
    expect(r.leads).toBe(3);
    expect(r.online).toBe(2);
    expect(r.netzwerk).toBe(1);
    expect(r.gewonnen).toBe(1);
    expect(r.umsatz).toBe(15_000);
    expect(r.ausgaben).toBe(1000);
    expect(r.kampagnen).toBe(1);
    expect(r.cpl).toBeCloseTo(333.33, 1);
    expect(r.cpa).toBe(1000);
    expect(r.roas).toBe(15);
    expect(r.conversion).toBe(50);
    expect(r.verlustgruende).toEqual([{ grund: "Privat verkauft", anzahl: 1 }]);
    expect(r.quellen[0]).toEqual({ name: "Website", anzahl: 2, gewonnen: 1 });
  });
  it("gewichtet die Prognose nach Stufen-Wahrscheinlichkeit", () => {
    const stufen: Stufe[] = [
      { id: "s1", pipeline_id: "p", name: "Neu", zusatz: null, sortierung: 1, wahrscheinlichkeit: 10, ist_gewonnen: false, ist_verloren: false },
      { id: "s2", pipeline_id: "p", name: "Angebot", zusatz: null, sortierung: 2, wahrscheinlichkeit: 75, ist_gewonnen: false, ist_verloren: false },
    ];
    const p = pipelinePrognose([lead({ provision_erwartet: 10_000, stufe_id: "s1" }), lead({ id: "b", provision_erwartet: 20_000, stufe_id: "s2" }), lead({ id: "c", status: "gewonnen", provision_erwartet: 99_999 })], stufen);
    expect(p.offen).toBe(2);
    expect(p.roh).toBe(30_000);
    expect(p.gewichtet).toBe(16_000);
    expect(p.jeStufe.map((s) => s.stufe)).toEqual(["Neu", "Angebot"]);
  });
});

describe("Lead-Mails erkennen", () => {
  it("liest ein Website-Formular mit Feldern aus", () => {
    const e = eigentuemerAnfrageErkennen({
      betreff: "Anfrage Immobilienbewertung",
      text: "Name: Frau Erika Beispiel\nE-Mail: erika@example.org\nTelefon: 069 123456\nAdresse: Musterstraße 12, 60311 Frankfurt am Main\nObjektart: Einfamilienhaus\nWohnfläche: 145 m²\nBaujahr: 1978\nNachricht: Wir möchten unser Haus im Frühjahr verkaufen.",
      vonAdresse: "formular@example.org",
      vonName: "Website",
    });
    expect(e.erkannt).toBe(true);
    expect(e).toMatchObject({ anrede: "Frau", vorname: "Erika", nachname: "Beispiel", email: "erika@example.org", telefon: "069 123456", strasse: "Musterstraße", hausnummer: "12", plz: "60311", ort: "Frankfurt am Main", objektart: "Einfamilienhaus", wohnflaeche: 145, baujahr: 1978 });
    expect(e.nachricht).toContain("verkaufen");
  });
  it("erkennt eine frei geschriebene Mail mit Verkaufsabsicht", () => {
    const e = eigentuemerAnfrageErkennen({ betreff: "Wohnung verkaufen", text: "Guten Tag, ich möchte meine Wohnung (78 qm, Baujahr 1995) in 60385 Frankfurt verkaufen. Rufen Sie mich an: 0170 1234567.", vonAdresse: "max@example.org", vonName: "Max Muster" });
    expect(e.erkannt).toBe(true);
    expect(e.vorname).toBe("Max");
    expect(e.nachname).toBe("Muster");
    expect(e.objektart).toBe("Eigentumswohnung");
    expect(e.wohnflaeche).toBe(78);
    expect(e.baujahr).toBe(1995);
    expect(e.plz).toBe("60385");
    expect(e.telefon).toContain("0170");
  });
  it("meldet Mails ohne Verkaufsbezug als nicht erkannt", () => {
    const e = eigentuemerAnfrageErkennen({ betreff: "Rechnung", text: "Anbei die Rechnung.", vonAdresse: "buchhaltung@example.org", vonName: null });
    expect(e.erkannt).toBe(false);
  });
});

describe("CSV-Import", () => {
  it("ordnet Spalten ueber die Kopfzeile zu und trennt Hausnummern", () => {
    const { leads, fehler } = leadsAusCsv('Straße;PLZ;Ort;Objektart;Wohnfläche;Nachname;E-Mail\n"Lindenallee 7a";60322;Frankfurt;Reihenhaus;"120,5";Beispiel;b@example.org\n;;;;;;\n');
    expect(fehler).toEqual(["Zeile 3: weder Adresse noch Name — übersprungen."]);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ strasse: "Lindenallee", hausnummer: "7a", plz: "60322", ort: "Frankfurt", objektart: "Reihenhaus", wohnflaeche: 120.5, nachname: "Beispiel", email: "b@example.org", titel: "Reihenhaus · Lindenallee 7a · Frankfurt" });
  });
  it("erkennt Komma als Trennzeichen und meldet fehlende Spalten", () => {
    expect(leadsAusCsv("name,email\nMuster,m@example.org").leads[0]?.titel).toBe("Muster");
    expect(leadsAusCsv("a,b\n1,2").fehler[0]).toContain("Keine passende Spalte");
    expect(leadsAusCsv("").fehler).toEqual(["Die Datei ist leer."]);
  });
});

describe("Helfer", () => {
  it("bildet Adresse, Titel, Nachfasslage und Platzhalter", () => {
    expect(leadAdresse({ titel: "T", strasse: "Weg", hausnummer: "1", plz: "60311", ort: "Frankfurt" })).toBe("Weg 1, 60311 Frankfurt");
    expect(leadAdresse({ titel: "T", strasse: null, hausnummer: null, plz: null, ort: null })).toBe("T");
    expect(leadTitel({ objektart: "Reihenhaus", strasse: "Weg", hausnummer: "1", ort: "Frankfurt" })).toBe("Reihenhaus · Weg 1 · Frankfurt");
    expect(leadTitel({})).toBe("Neuer Lead");
    expect(nachfassLage({ status: "offen", nachfassen: true, nachfassen_am: "2026-09-01" }, "2026-09-03")).toBe("ueberfaellig");
    expect(nachfassLage({ status: "offen", nachfassen: true, nachfassen_am: "2026-09-03" }, "2026-09-03")).toBe("heute");
    expect(nachfassLage({ status: "gewonnen", nachfassen: true, nachfassen_am: "2026-09-01" }, "2026-09-03")).toBeNull();
    expect(vorlageAusfuellen({ betreff: "Zu {adresse}", text: "{anrede},\n\n\n\n{name} — {firma}" }, { adresse: "Weg 1", anrede: "Guten Tag", name: "Erika", firma: "Makler GmbH" })).toEqual({ betreff: "Zu Weg 1", text: "Guten Tag,\n\nErika — Makler GmbH" });
  });
});
