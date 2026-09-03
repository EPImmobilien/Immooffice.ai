import { describe, expect, it } from "vitest";

import { openapiDokument } from "./openapi";
import { kontaktSchema, objektAenderungSchema, objektSchema, problemeAuflisten, terminEnde, terminSchema } from "./schemata";

describe("objektSchema", () => {
  it("verlangt eine Bezeichnung, prueft die Postleitzahl und setzt Vorgaben", () => {
    const ok = objektSchema.safeParse({ bezeichnung: "Wohnung", plz: "20095", kaufpreis: 250000 });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toMatchObject({ vermarktungsart: "kauf", objektkategorie: "wohnung", status: "akquise", land: "DE" });
    const fehl = objektSchema.safeParse({ plz: "1" });
    expect(fehl.success).toBe(false);
    if (!fehl.success) {
      const probleme = problemeAuflisten(fehl.error);
      expect(probleme.map((p) => p.feld)).toEqual(expect.arrayContaining(["bezeichnung", "plz"]));
    }
    expect(objektAenderungSchema.safeParse({ kaltmiete: 900 }).success).toBe(true);
    expect(objektAenderungSchema.safeParse({ kaltmiete: -1 }).success).toBe(false);
  });
});

describe("kontaktSchema / terminSchema", () => {
  it("braucht Nachname oder Firma und eine gueltige Adresse", () => {
    expect(kontaktSchema.safeParse({ firma: "Muster GmbH", email: "Info@Muster.invalid" }).success).toBe(true);
    expect(kontaktSchema.safeParse({ vorname: "Max" }).success).toBe(false);
    expect(kontaktSchema.safeParse({ nachname: "Muster", email: "kaputt" }).success).toBe(false);
  });

  it("prueft Zeitpunkte und ergaenzt das Ende", () => {
    expect(terminSchema.safeParse({ titel: "Besichtigung", beginnt_am: "2026-09-10T10:00:00+02:00" }).success).toBe(true);
    expect(terminSchema.safeParse({ titel: "Besichtigung", beginnt_am: "morgen" }).success).toBe(false);
    expect(terminSchema.safeParse({ titel: "X", beginnt_am: "2026-09-10T10:00:00Z", endet_am: "2026-09-10T09:00:00Z" }).success).toBe(false);
    expect(terminEnde("2026-09-10T10:00:00Z", undefined)).toBe("2026-09-10T11:00:00.000Z");
    expect(terminEnde("2026-09-10T10:00:00Z", "2026-09-10T12:30:00Z")).toBe("2026-09-10T12:30:00.000Z");
  });
});

describe("openapiDokument", () => {
  it("beschreibt alle Ressourcen, die Anmeldung und die Rueckrufe", () => {
    const dok = openapiDokument("https://app.invalid") as { openapi: string; servers: Array<{ url: string }>; paths: Record<string, unknown>; webhooks: Record<string, unknown>; components: { schemas: Record<string, { properties?: Record<string, unknown> }> } };
    expect(dok.openapi).toBe("3.1.0");
    expect(dok.servers[0]?.url).toBe("https://app.invalid/api/v1");
    expect(Object.keys(dok.paths).sort()).toEqual(["/kontakte", "/kontakte/{id}", "/objekte", "/objekte/{id}", "/termine", "/termine/{id}"]);
    expect(Object.keys(dok.webhooks)).toEqual(["objekt.angelegt", "kontakt.angelegt", "termin.angelegt"]);
    // Jedes Eingabefeld des Zod-Schemas ist auch beschrieben.
    const beschrieben = Object.keys(dok.components.schemas["ObjektEingabe"]?.properties ?? {});
    for (const feld of Object.keys(objektSchema.shape)) expect(beschrieben).toContain(feld);
  });
});
