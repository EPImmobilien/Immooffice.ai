import { describe, expect, it } from "vitest";

import { terminBestaetigungBetreff, terminBestaetigungText, terminOrtText } from "./bestaetigung";
import { fahrtenPlanen, fahrtSchaetzen, fahrzeitText, luftlinieKm, route } from "./fahrzeit";
import { icsKalender } from "./ics";
import { regelAusWahl, regelLesen, serieStandard, serienDaten, serieText } from "./serie";
import { ausBerlin, berlin, monatPlus, tagPlus, wochenstart } from "./zeit";

describe("Kalender: Zeit", () => {
  it("rechnet Berliner Zeit in Sommer und Winter", () => {
    expect(berlin("2026-07-01T08:30:00Z")).toMatchObject({ datum: "2026-07-01", zeit: "10:30", minuten: 630, wochentag: 3 });
    expect(berlin("2026-01-15T08:30:00Z")).toMatchObject({ datum: "2026-01-15", zeit: "09:30" });
    expect(ausBerlin("2026-07-01", "10:30").toISOString()).toBe("2026-07-01T08:30:00.000Z");
    expect(ausBerlin("2026-01-15", "09:30").toISOString()).toBe("2026-01-15T08:30:00.000Z");
    // Umstellungstag: 29.03.2026, 02:00 gibt es nicht — 03:00 ist bereits Sommerzeit
    expect(ausBerlin("2026-03-29", "03:00").toISOString()).toBe("2026-03-29T01:00:00.000Z");
  });
  it("rechnet Kalendertage, Monate und Wochenstart", () => {
    expect(tagPlus("2026-02-27", 3)).toBe("2026-03-02");
    expect(monatPlus("2026-01-31", 1)).toBe("2026-02-28");
    expect(monatPlus("2026-01-31", 3)).toBe("2026-04-30");
    expect(wochenstart("2026-09-06")).toBe("2026-08-31");
    expect(wochenstart("2026-08-31")).toBe("2026-08-31");
  });
});

describe("Kalender: Serien", () => {
  it("schreibt woechentliche Serien mit Wochentagen aus", () => {
    const d = serienDaten("2026-09-02", { takt: "woche", intervall: 1, wochentage: [1, 3], ende_art: "anzahl", anzahl: 4, bis: null });
    expect(d).toEqual(["2026-09-02", "2026-09-07", "2026-09-09", "2026-09-14"]);
  });
  it("beachtet Intervall, Enddatum und Obergrenzen", () => {
    expect(serienDaten("2026-09-01", { takt: "woche", intervall: 2, wochentage: [], ende_art: "datum", anzahl: 1, bis: "2026-10-15" })).toEqual(["2026-09-01", "2026-09-15", "2026-09-29", "2026-10-13"]);
    expect(serienDaten("2026-01-31", { takt: "monat", intervall: 1, wochentage: [], ende_art: "anzahl", anzahl: 3, bis: null })).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(serienDaten("2026-09-01", { takt: "tag", intervall: 1, wochentage: [], ende_art: "anzahl", anzahl: 999, bis: null })).toHaveLength(200);
    expect(serienDaten("2026-09-01", { takt: "jahr", intervall: 1, wochentage: [], ende_art: "anzahl", anzahl: 10, bis: null })).toHaveLength(3); // drei Jahre Grenze (2026–2028)
    expect(serienDaten("kaputt", serieStandard())).toEqual([]);
  });
  it("bildet Regeln aus der Schnellwahl und Klartext", () => {
    expect(regelAusWahl("keine", serieStandard())).toBeNull();
    expect(regelAusWahl("woche2", serieStandard())).toMatchObject({ takt: "woche", intervall: 2 });
    expect(serieText({ takt: "woche", intervall: 1, wochentage: [2, 4], ende_art: "datum", anzahl: 1, bis: "2026-12-31" })).toBe("wöchentlich (Di, Do), bis 31.12.2026");
    expect(serieText({ takt: "monat", intervall: 3, wochentage: [], ende_art: "anzahl", anzahl: 4, bis: null })).toBe("alle 3 Monate, 4-mal");
    expect(regelLesen({ takt: "unsinn", intervall: "2", wochentage: ["1", 9], ende_art: "datum", bis: "2026-01-01" })).toEqual({ takt: "woche", intervall: 2, wochentage: [1], ende_art: "datum", anzahl: 1, bis: "2026-01-01" });
  });
});

describe("Kalender: ICS", () => {
  it("erzeugt eine gueltige Kalenderdatei mit Zeit- und Ganztagsterminen", () => {
    const ics = icsKalender([
      { id: "a", titel: "Besichtigung; Familie Muster", beginnt_am: "2026-09-10T08:00:00Z", endet_am: "2026-09-10T09:00:00Z", ort: "Musterweg 1, Frankfurt", beschreibung: "Zeile 1\nZeile 2" },
      { id: "b", titel: "Messe", beginnt_am: "2026-09-11T22:00:00Z", endet_am: "2026-09-13T22:00:00Z", ganztags: true, abgesagt: true },
    ], "Demo", new Date("2026-09-04T10:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("UID:a@immooffice.ai");
    expect(ics).toContain("DTSTART:20260910T080000Z");
    expect(ics).toContain("SUMMARY:Besichtigung\\; Familie Muster");
    expect(ics).toContain("DESCRIPTION:Zeile 1\\nZeile 2");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260912");
    expect(ics).toContain("DTEND;VALUE=DATE:20260914");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics.split("\r\n").every((z) => z.length <= 75)).toBe(true);
  });
});

describe("Kalender: Fahrzeit", () => {
  it("schaetzt Fahrten aus der Luftlinie und formatiert", () => {
    const ffm = { lat: 50.1109, lon: 8.6821 };
    const of = { lat: 50.0955, lon: 8.7761 };
    expect(Math.round(luftlinieKm(ffm, of))).toBe(7);
    const s = fahrtSchaetzen(ffm, of);
    expect(s.km).toBeGreaterThan(8);
    expect(s.min).toBeGreaterThan(10);
    expect(fahrtSchaetzen(ffm, ffm)).toEqual({ min: 0, km: 0 });
    expect(fahrzeitText(0)).toBe("keine Fahrt");
    expect(fahrzeitText(45)).toBe("45 Min");
    expect(fahrzeitText(125)).toBe("2 Std 5 Min");
  });
  it("nutzt den Routendienst nur mit Schluessel", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ features: [{ properties: { summary: { distance: 12345, duration: 1140 } } }] }), { status: 200 })) as unknown as typeof fetch;
    expect(await route({ lat: 50, lon: 8 }, { lat: 50.1, lon: 8.1 }, fetchFn, "schluessel")).toEqual({ min: 19, km: 12.3, quelle: "route" });
    expect((await route({ lat: 50, lon: 8 }, { lat: 50.1, lon: 8.1 }, fetchFn, undefined)).quelle).toBe("schaetzung");
  });
  it("waehlt Nachbartermine innerhalb von vier Stunden, sonst die Startadresse", () => {
    const t = { beginnt_am: "2026-09-10T10:00:00Z", endet_am: "2026-09-10T11:00:00Z", adresse: "Ziel 1" };
    const vorher = { titel: "A", adresse: "Start A", beginnt_am: "2026-09-10T07:00:00Z", endet_am: "2026-09-10T08:00:00Z" };
    const nachher = { titel: "B", adresse: "Ziel B", beginnt_am: "2026-09-10T18:00:00Z", endet_am: "2026-09-10T19:00:00Z" };
    expect(fahrtenPlanen(t, vorher, nachher, "Büro")).toEqual({ hin: { von: "Start A", aus_termin: "A" }, rueck: { nach: "Büro", zu_termin: null } });
    expect(fahrtenPlanen(t, null, null, "")).toEqual({ hin: null, rueck: null });
    expect(fahrtenPlanen({ ...t, adresse: "" }, vorher, nachher, "Büro")).toEqual({ hin: null, rueck: null });
  });
});

describe("Kalender: Bestaetigung", () => {
  it("formuliert Bestaetigung und Betreff", () => {
    const t = { art: "besichtigung", beginnt_am: "2026-09-10T08:00:00Z", ganztags: false, ort: null };
    const text = terminBestaetigungText(t, { anrede: "Frau", nachname: "Beispiel" }, { objektnummer: "O-1", bezeichnung: "Wohnung", strasse: "Musterweg", hausnummer: "1", plz: "60311", ort: "Frankfurt" }, "Anna Makler", "Makler GmbH");
    expect(text).toContain("Sehr geehrte Frau Beispiel,");
    expect(text).toContain("Besichtigung (O-1 · Wohnung)");
    expect(text).toContain("am Donnerstag, 10. September 2026 um 10:00 Uhr");
    expect(text).toContain("Ort: Musterweg 1, 60311 Frankfurt");
    expect(terminBestaetigungBetreff(t)).toBe("Terminbestätigung: Besichtigung am 10.09.2026 um 10:00 Uhr");
    expect(terminOrtText({ ort: "Vor Ort" }, null)).toBe("Vor Ort");
  });
});
