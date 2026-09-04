import { describe, expect, it } from "vitest";

import { monatsbilanz, soll, stundenAusStempeln, stundenText, type Stempel, type Wochenmodell } from "./arbeitszeit";
import { antwortenAusFormular, auswerten, FRAGEN, MAX_PUNKTE } from "./bewerber";
import { arbeitstage, feiertage, ostersonntag } from "./feiertage";
import { anspruchJahr, bilanz, ueberschneidungen, type UrlaubAntrag, type UrlaubProfil } from "./urlaub";

describe("Feiertage", () => {
  it("berechnet Ostern und bewegliche Feiertage", () => {
    expect(ostersonntag(2026)).toBe("2026-04-05");
    expect(ostersonntag(2027)).toBe("2027-03-28");
    const f = feiertage(2026, "HE");
    expect(f.get("2026-04-03")).toBe("Karfreitag");
    expect(f.get("2026-05-14")).toBe("Christi Himmelfahrt");
    expect(f.get("2026-06-04")).toBe("Fronleichnam");
    expect(feiertage(2026, "BE").has("2026-06-04")).toBe(false);
    expect(feiertage(2026, "SN").get("2026-11-18")).toBe("Buß- und Bettag");
  });
  it("zaehlt Arbeitstage ohne Wochenende und Feiertage", () => {
    // 29.12.2025 (Mo) bis 02.01.2026 (Fr): Neujahr faellt raus
    expect(arbeitstage("2025-12-29", "2026-01-02")).toHaveLength(4);
    expect(arbeitstage("2026-04-03", "2026-04-06", "HE")).toEqual([]);
    expect(arbeitstage("2026-05-04", "2026-05-01")).toEqual([]);
  });
});

describe("Urlaub", () => {
  const p: UrlaubProfil = { id: "u1", name: "Anna", eintritt: "2024-03-15", urlaubstage_jahr: 30, urlaub_uebertrag: 2, urlaub_staffel: { "2027": 32 } };
  it("berechnet den Anspruch: anteilig im Eintrittsjahr, Staffel je Jahr", () => {
    expect(anspruchJahr(p, 2024)).toMatchObject({ anspruch: 23, anteilig: true, monate: 9 }); // 30*9/12 = 22,5 → 23
    expect(anspruchJahr({ ...p, eintritt: "2024-03-01" }, 2024).anspruch).toBe(25); // Eintritt am 1. zaehlt den Monat
    expect(anspruchJahr(p, 2026).anspruch).toBe(30);
    expect(anspruchJahr(p, 2027).anspruch).toBe(32);
  });
  it("bildet die Bilanz mit Uebertrag und Verfall am 31. Maerz", () => {
    const antraege: UrlaubAntrag[] = [
      { id: "a", benutzer_id: "u1", von: "2025-08-04", bis: "2025-08-15", arbeitstage: 10, status: "genehmigt" },
      { id: "b", benutzer_id: "u1", von: "2026-02-02", bis: "2026-02-06", arbeitstage: 5, status: "genehmigt" },
      { id: "c", benutzer_id: "u1", von: "2026-07-20", bis: "2026-07-24", arbeitstage: 5, status: "beantragt" },
      { id: "d", benutzer_id: "u2", von: "2026-07-22", bis: "2026-07-28", arbeitstage: 5, status: "genehmigt" },
    ];
    const vorFrist = bilanz(p, antraege, 2026, "2026-03-01");
    expect(vorFrist.uebertragAuto).toBe(20); // 30 − 10 aus 2025
    expect(vorFrist.uebertrag).toBe(22);
    expect(vorFrist.anspruch).toBe(52);
    expect(vorFrist.rest).toBe(47);
    const nachFrist = bilanz(p, antraege, 2026, "2026-06-01");
    expect(nachFrist.uebertragGenutzt).toBe(5);
    expect(nachFrist.uebertragVerfallen).toBe(17);
    expect(nachFrist.anspruch).toBe(35);
    expect(nachFrist.restNachBeantragt).toBe(25);
    expect(ueberschneidungen({ von: "2026-07-20", bis: "2026-07-24", benutzer_id: "u1" }, antraege).map((a) => a.id)).toEqual(["d"]);
  });
});

describe("Arbeitszeit", () => {
  const modell: Wochenmodell = { id: "m", benutzer_id: "u1", gueltig_ab: "2026-01-01", stunden_mo: 8, stunden_di: 8, stunden_mi: 8, stunden_do: 8, stunden_fr: 6, stunden_sa: 0, stunden_so: 0 };
  it("liest Soll aus dem Wochenmodell und rechnet Stempelpaare", () => {
    expect(soll([modell], "2026-09-04")).toBe(6); // Freitag
    expect(soll([modell], "2026-09-06")).toBe(0);
    expect(soll([modell], "2025-12-31")).toBe(0); // vor Gueltigkeit
    const st: Stempel[] = [
      { id: "1", benutzer_id: "u1", datum: "2026-09-03", richtung: "kommen", zeitpunkt: "2026-09-03T06:00:00Z", quelle: "uhr" },
      { id: "2", benutzer_id: "u1", datum: "2026-09-03", richtung: "gehen", zeitpunkt: "2026-09-03T10:00:00Z", quelle: "uhr" },
      { id: "3", benutzer_id: "u1", datum: "2026-09-03", richtung: "kommen", zeitpunkt: "2026-09-03T10:30:00Z", quelle: "uhr" },
      { id: "4", benutzer_id: "u1", datum: "2026-09-03", richtung: "gehen", zeitpunkt: "2026-09-03T15:00:00Z", quelle: "uhr" },
    ];
    expect(stundenAusStempeln(st)).toMatchObject({ stunden: 8.5, offen: null });
    expect(stundenAusStempeln(st.slice(0, 3)).offen).toBe("2026-09-03T10:30:00Z");
    expect(stundenText(-1.5)).toBe("−1:30 h");
  });
  it("bildet die Monatsbilanz mit Urlaub, Feiertag und offenen Tagen", () => {
    const st: Stempel[] = [
      { id: "1", benutzer_id: "u1", datum: "2026-09-01", richtung: "kommen", zeitpunkt: "2026-09-01T06:00:00Z", quelle: "uhr" },
      { id: "2", benutzer_id: "u1", datum: "2026-09-01", richtung: "gehen", zeitpunkt: "2026-09-01T15:00:00Z", quelle: "uhr" },
      { id: "3", benutzer_id: "u1", datum: "2026-09-02", richtung: "kommen", zeitpunkt: "2026-09-02T06:00:00Z", quelle: "uhr" },
    ];
    const b = monatsbilanz(2026, 9, [modell], st, [{ id: "t", benutzer_id: "u1", datum: "2026-09-03", art: "urlaub", stunden: null, von: null, bis: null, bemerkung: null }], "HE", "2026-09-04");
    expect(b.zeilen).toHaveLength(30);
    expect(b.zeilen[0]).toMatchObject({ datum: "2026-09-01", soll: 8, ist: 9 });
    expect(b.zeilen[1]?.offen).toBe("2026-09-02T06:00:00Z");
    expect(b.zeilen[2]).toMatchObject({ art: "urlaub", ist: 8 });
    expect(b.offene).toBe(1);
    expect(b.urlaubstage).toBe(1);
    expect(b.soll).toBe(30); // 1.–4.9.: 8+8+8+6
    expect(b.ist).toBe(17); // 9 + 0 (offen) + 8 (Urlaub) + 0
    const okt = monatsbilanz(2026, 10, [modell], [], [], "HE", "2026-10-31");
    expect(okt.zeilen.find((z) => z.datum === "2026-10-03")?.feiertag).toBe("Tag der Deutschen Einheit");
  });
});

describe("Bewerber-Test", () => {
  it("wertet Antworten aus und leitet die Empfehlung ab", () => {
    const alleRichtig = Object.fromEntries(FRAGEN.map((f) => [f.id, f.richtig]));
    const a = auswerten(alleRichtig);
    expect(a.punkte).toBe(MAX_PUNKTE);
    expect(a.empfehlung).toBe("sehr_gut");
    const halb = auswerten(Object.fromEntries(FRAGEN.map((f, i) => [f.id, i % 2 === 0 ? f.richtig : (f.richtig + 1) % f.antworten.length])));
    expect(halb.punkte).toBeLessThan(MAX_PUNKTE);
    expect(["gespraech", "kein_match"]).toContain(halb.empfehlung);
    expect(auswerten({}).empfehlung).toBe("kein_match");
    const form = antwortenAusFormular({ f_r1: "1", f_f1: "x", f_k1: "" });
    expect(form["r1"]).toBe(1);
    expect(form["f1"]).toBeNull();
    expect(auswerten(form).details["r1"]?.punkte).toBe(2);
  });
});
