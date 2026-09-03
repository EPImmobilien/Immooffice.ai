import { describe, expect, it } from "vitest";

import { befundBewerten, befundHash, befundText, mailEntscheiden, pruefungFaellig } from "./waechter";

const jetzt = new Date("2026-09-03T12:00:00Z");

describe("befundBewerten", () => {
  it("trennt Stoerungen von Hinweisen", () => {
    const b = befundBewerten({ auftraege_fehler_24h: 2, mandanten_lesemodus: 1, postfaecher_fehler: 0, abos_zahlung_offen: 3 });
    expect(b.rot).toBe(true);
    expect(b.probleme).toEqual([{ schluessel: "auftraege_fehler_24h", anzahl: 2 }]);
    expect(b.hinweise.map((h) => h.schluessel)).toEqual(["abos_zahlung_offen", "mandanten_lesemodus"]);
    expect(befundBewerten({ mandanten_lesemodus: 4 }).rot).toBe(false);
  });
});

describe("mailEntscheiden", () => {
  it("meldet eine neue Lage sofort, dieselbe erst nach 24 Stunden", () => {
    const b = befundBewerten({ postfaecher_fehler: 1 });
    const hash = befundHash(b);
    expect(mailEntscheiden({}, b, hash, jetzt)).toBe("befund");
    expect(mailEntscheiden({ hash, rot: true, mail_am: "2026-09-03T02:00:00Z" }, b, hash, jetzt)).toBeNull();
    expect(mailEntscheiden({ hash, rot: true, mail_am: "2026-09-02T11:00:00Z" }, b, hash, jetzt)).toBe("befund");
    expect(mailEntscheiden({ hash: "anders", rot: true, mail_am: "2026-09-03T11:00:00Z" }, b, hash, jetzt)).toBe("befund");
  });

  it("gibt Entwarnung genau einmal, wenn es wieder gruen ist", () => {
    const gruen = befundBewerten({ postfaecher_fehler: 0, mandanten_lesemodus: 2 });
    expect(mailEntscheiden({ hash: "x", rot: true }, gruen, befundHash(gruen), jetzt)).toBe("entwarnung");
    expect(mailEntscheiden({ hash: "", rot: false }, gruen, befundHash(gruen), jetzt)).toBeNull();
  });

  it("Hinweise aendern den Hash nicht", () => {
    const a = befundHash(befundBewerten({ postfaecher_fehler: 1, mandanten_lesemodus: 1 }));
    const b = befundHash(befundBewerten({ postfaecher_fehler: 1, mandanten_lesemodus: 7 }));
    expect(a).toBe(b);
  });
});

describe("pruefungFaellig / befundText", () => {
  it("prueft stuendlich", () => {
    expect(pruefungFaellig({}, jetzt)).toBe(true);
    expect(pruefungFaellig({ geprueft_am: "2026-09-03T11:30:00Z" }, jetzt)).toBe(false);
    expect(pruefungFaellig({ geprueft_am: "2026-09-03T10:59:00Z" }, jetzt)).toBe(true);
  });

  it("formuliert Befund und Entwarnung auf Deutsch", () => {
    const b = befundBewerten({ auftraege_fehler_24h: 3, mandanten_lesemodus: 1 });
    const mail = befundText(b, "befund", jetzt);
    expect(mail.betreff).toContain("1 Befund ");
    expect(mail.text).toContain("Gescheiterte Aufträge (24 h): 3");
    expect(mail.text).toContain("Hinweise");
    expect(befundText(b, "entwarnung", jetzt).betreff).toContain("Entwarnung");
  });
});
