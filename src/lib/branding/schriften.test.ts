import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SCHRIFTEN,
  SCHRIFT_VORGABE_SERIFEN,
  SCHRIFT_VORGABE_SERIFENLOS,
  istSchrift,
  schrift,
  schriftenNachKategorie,
} from "./schriften";

describe("Schriftenliste", () => {
  it("enthaelt genau die zwoelf Schriften aus B2, sechs je Kategorie", () => {
    expect(SCHRIFTEN).toHaveLength(12);
    expect(schriftenNachKategorie("serifenlos").map((s) => s.name)).toEqual([
      "Inter",
      "Montserrat",
      "Poppins",
      "Work Sans",
      "Source Sans 3",
      "Nunito Sans",
    ]);
    expect(schriftenNachKategorie("serifen").map((s) => s.name)).toEqual([
      "Marcellus",
      "Cormorant Garamond",
      "Playfair Display",
      "Lora",
      "EB Garamond",
      "Libre Baskerville",
    ]);
  });

  it("Schluessel sind eindeutig und datenbanktauglich", () => {
    const schluessel = SCHRIFTEN.map((s) => s.schluessel);
    expect(new Set(schluessel).size).toBe(schluessel.length);
    for (const s of schluessel) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it("die Schluessel stimmen mit den Check-Constraints der Migration ueberein", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20260903120000_onboarding_team_audit.sql", import.meta.url),
      "utf8",
    );
    for (const s of SCHRIFTEN) {
      expect(sql).toContain(`'${s.schluessel}'`);
    }
  });

  it("jedes Paket ist installiert — sonst laedt die Schrift nie", () => {
    const paket = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { dependencies: Record<string, string> };
    for (const s of SCHRIFTEN) {
      expect(paket.dependencies[s.paket], `${s.paket} fehlt in package.json`).toBeDefined();
    }
  });

  it("faellt bei unbekannten oder falsch kategorisierten Schluesseln auf die Vorgabe zurueck", () => {
    expect(schrift("comic", "serifenlos").schluessel).toBe(SCHRIFT_VORGABE_SERIFENLOS);
    expect(schrift(null, "serifen").schluessel).toBe(SCHRIFT_VORGABE_SERIFEN);
    // Eine Serifenschrift ist in der serifenlosen Kategorie nicht gueltig.
    expect(schrift("lora", "serifenlos").schluessel).toBe(SCHRIFT_VORGABE_SERIFENLOS);
    expect(istSchrift("lora", "serifen")).toBe(true);
    expect(istSchrift("lora", "serifenlos")).toBe(false);
  });
});
