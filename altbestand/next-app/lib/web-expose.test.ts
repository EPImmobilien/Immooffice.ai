import { describe, expect, it } from "vitest";

import { basisUrlErmitteln, tokenErzeugen, webExposeAdresse } from "./web-expose";

describe("Token des Web-Exposes", () => {
  it("hat die verlangte Länge und Zeichenmenge", () => {
    for (const laenge of [16, 24, 40]) {
      const token = tokenErzeugen(laenge);
      expect(token).toHaveLength(laenge);
      // Dieselbe Bedingung prüft die Datenbank. Weicht sie hier ab, scheitert
      // das Anlegen erst zur Laufzeit.
      expect(token).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("liefert bei jedem Aufruf einen anderen Wert", () => {
    const menge = new Set(Array.from({ length: 2000 }, () => tokenErzeugen()));
    expect(menge.size).toBe(2000);
  });

  it("verteilt die Zeichen gleichmäßig", () => {
    // Der Link ist ohne Passwort der einzige Zugangsschutz. Eine Häufung
    // einzelner Zeichen würde den Raum verkleinern, ohne dass es auffällt —
    // genau das passiert bei einem naiven `zufall % 36`.
    const haeufigkeit = new Map<string, number>();
    const gesamt = 36 * 400;
    for (const zeichen of tokenErzeugen(gesamt)) {
      haeufigkeit.set(zeichen, (haeufigkeit.get(zeichen) ?? 0) + 1);
    }

    expect(haeufigkeit.size).toBe(36);
    const erwartet = gesamt / 36;
    for (const [zeichen, anzahl] of haeufigkeit) {
      expect(anzahl, `Zeichen ${zeichen}`).toBeGreaterThan(erwartet * 0.7);
      expect(anzahl, `Zeichen ${zeichen}`).toBeLessThan(erwartet * 1.3);
    }
  });
});

describe("Adresse des Web-Exposes", () => {
  it("setzt Basis und Token zusammen", () => {
    expect(webExposeAdresse("abcdefghijklmnop", "https://beispiel.test")).toBe(
      "https://beispiel.test/expose/abcdefghijklmnop",
    );
  });

  it("verträgt einen abschließenden Schrägstrich", () => {
    expect(webExposeAdresse("abcdefghijklmnop", "https://beispiel.test/")).toBe(
      "https://beispiel.test/expose/abcdefghijklmnop",
    );
  });

  it("verwendet den weitergeleiteten Host und das weitergeleitete Schema", () => {
    const kopf = new Headers({
      host: "intern:3000",
      "x-forwarded-host": "www.beispiel.test",
      "x-forwarded-proto": "https",
    });
    expect(basisUrlErmitteln(kopf)).toBe("https://www.beispiel.test");
  });

  it("bleibt lokal bei http", () => {
    expect(basisUrlErmitteln(new Headers({ host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
  });
});
