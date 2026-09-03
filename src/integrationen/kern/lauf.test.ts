import { describe, expect, it } from "vitest";

import { z } from "zod";

import { kontextErzeugen, type Connector, type HolErgebnis, type SendeErgebnis } from "./connector";
import { objektZeile, syncAusfuehren } from "./lauf";
import type { KanonischerKontakt, KanonischesBild, KanonischesObjekt } from "./modell";
import type { KontaktZeile, Mapping, MappingTyp, ObjektZeile, Speicher } from "./speicher";
import { leerenKontakt, leeresObjektMit } from "./testhelfer";

/** Speicher im Arbeitsspeicher: genug, um den Lauf vollstaendig zu pruefen. */
class Gedaechtnis implements Speicher {
  mappings = new Map<string, Mapping>();
  objekte = new Map<string, { zeile: ObjektZeile; geaendert_am: string }>();
  kontakte = new Map<string, { zeile: KontaktZeile; geaendert_am: string }>();
  bilder = new Map<string, KanonischesBild[]>();
  uhr = 0;
  private naechsteId = 1;

  private jetzt(): string {
    this.uhr += 1;
    return `2026-09-03T10:00:${String(this.uhr).padStart(2, "0")}Z`;
  }

  private schluessel(typ: MappingTyp, id: string): string {
    return `${typ}|${id}`;
  }

  async mappingFinden(typ: MappingTyp, fremdOderLokalId: string): Promise<Mapping | null> {
    return (
      this.mappings.get(this.schluessel(typ, fremdOderLokalId)) ??
      [...this.mappings.values()].find((m) => m.lokal_id === fremdOderLokalId && this.mappings.has(this.schluessel(typ, m.fremd_id))) ??
      null
    );
  }

  async mappingSchreiben(typ: MappingTyp, mapping: Mapping): Promise<void> {
    this.mappings.set(this.schluessel(typ, mapping.fremd_id), mapping);
  }

  async objektAnlegen(zeile: ObjektZeile): Promise<string> {
    const id = `L${this.naechsteId++}`;
    this.objekte.set(id, { zeile, geaendert_am: this.jetzt() });
    return id;
  }

  async objektAktualisieren(lokalId: string, zeile: ObjektZeile): Promise<void> {
    this.objekte.set(lokalId, { zeile, geaendert_am: this.jetzt() });
  }

  async objektGeaendertAm(lokalId: string): Promise<string | null> {
    return this.objekte.get(lokalId)?.geaendert_am ?? null;
  }

  async objekteZumSenden(seit: string | null) {
    return [...this.objekte.entries()]
      .filter(([, o]) => !seit || o.geaendert_am > seit)
      .map(([lokal_id, o]) => ({
        lokal_id,
        geaendert_am: o.geaendert_am,
        objekt: { ...o.zeile, fremd_id: lokal_id, geaendert_am_fremd: null, bilder: [] } as KanonischesObjekt,
      }));
  }

  async kontaktAnlegen(zeile: KontaktZeile): Promise<string> {
    const id = `K${this.naechsteId++}`;
    this.kontakte.set(id, { zeile, geaendert_am: this.jetzt() });
    return id;
  }

  async kontaktAktualisieren(lokalId: string, zeile: KontaktZeile): Promise<void> {
    this.kontakte.set(lokalId, { zeile, geaendert_am: this.jetzt() });
  }

  async kontaktGeaendertAm(lokalId: string): Promise<string | null> {
    return this.kontakte.get(lokalId)?.geaendert_am ?? null;
  }

  async kontakteZumSenden() {
    return [...this.kontakte.entries()].map(([lokal_id, k]) => ({
      lokal_id,
      geaendert_am: k.geaendert_am,
      kontakt: { ...k.zeile, fremd_id: lokal_id, geaendert_am_fremd: null } as KanonischerKontakt,
    }));
  }

  async bildSpeichern(objektLokalId: string, bild: KanonischesBild): Promise<void> {
    if (bild.titel === "kaputt") throw new Error("Bild nicht ladbar");
    const liste = this.bilder.get(objektLokalId) ?? [];
    liste.push(bild);
    this.bilder.set(objektLokalId, liste);
  }

  async bilderAnzahl(objektLokalId: string): Promise<number> {
    return this.bilder.get(objektLokalId)?.length ?? 0;
  }
}

/** Connector-Attrappe mit steuerbaren Antworten. */
function attrappe(antworten: {
  objekte?: KanonischesObjekt[][];
  kontakte?: KanonischerKontakt[];
  senden?: (objekte: Array<KanonischesObjekt & { lokal_id: string }>) => SendeErgebnis;
}): Connector<unknown> & { gesendet: Array<KanonischesObjekt & { lokal_id: string }> } {
  const c = {
    id: "onoffice" as const,
    name: "Attrappe",
    beschreibung: "",
    anmeldung: "keine" as const,
    anmeldefelder: [],
    faehigkeiten: ["objekte_holen", "objekte_senden", "kontakte_holen"] as const,
    zugangsdatenSchema: z.unknown(),
    gesendet: [] as Array<KanonischesObjekt & { lokal_id: string }>,
    async verbindungPruefen() {
      return { ok: true, meldung: "ok" };
    },
    async objekteHolen(_k: unknown, eingabe: { seite?: number }): Promise<HolErgebnis<KanonischesObjekt>> {
      const seiten = antworten.objekte ?? [];
      const seite = eingabe.seite ?? 0;
      return { datensaetze: seiten[seite] ?? [], fehler: [], weitere: seite + 1 < seiten.length };
    },
    async kontakteHolen(): Promise<HolErgebnis<KanonischerKontakt>> {
      return { datensaetze: antworten.kontakte ?? [], fehler: [], weitere: false };
    },
    async objekteSenden(_k: unknown, objekte: Array<KanonischesObjekt & { lokal_id: string }>): Promise<SendeErgebnis> {
      c.gesendet.push(...objekte);
      return antworten.senden ? antworten.senden(objekte) : { angelegt: [], geaendert: [], fehler: [] };
    },
  };
  return c as unknown as Connector<unknown> & { gesendet: Array<KanonischesObjekt & { lokal_id: string }> };
}

const kontext = kontextErzeugen<unknown>({ mandantId: "m", integrationId: "i", zugangsdaten: {} });

describe("objektZeile", () => {
  it("laesst Feldwerte weg, die die Datenbank abweisen wuerde", () => {
    const z = objektZeile(
      leeresObjektMit("F", { bezeichnung: "  ", plz: "ABC", energie_klasse: "X", land: "Deutschland", baujahr: 12 }),
    );
    expect(z.bezeichnung).toBe("F");
    expect(z.plz).toBeNull();
    expect(z.energie_klasse).toBeNull();
    expect(z.land).toBe("DE");
    expect(z.baujahr).toBeNull();
    expect("fremd_id" in z).toBe(false);
    expect("bilder" in z).toBe(false);
  });
});

describe("Lauf: holen", () => {
  it("legt neue Objekte samt Bildern an, seitet, und schreibt Zuordnungen", async () => {
    const bild: KanonischesBild = { fremd_id: "b1", url: "https://x/1.jpg", daten: null, dateiname: "1.jpg", mime: null, titel: null, gruppe: "TITELBILD", reihenfolge: 0 };
    const c = attrappe({
      objekte: [
        [leeresObjektMit("F1", { bezeichnung: "Eins", geaendert_am_fremd: "2026-09-01T00:00:00Z", bilder: [bild] })],
        [leeresObjektMit("F2", { bezeichnung: "Zwei" })],
      ],
    });
    const s = new Gedaechtnis();
    const e = await syncAusfuehren(c, kontext, s, { richtung: "holen", seit: null });

    expect(e).toMatchObject({ angelegt: 2, geaendert: 0, uebersprungen: 0, fehler: [], konflikte: [] });
    expect(s.objekte.size).toBe(2);
    expect(s.mappings.get("objekt|F1")).toMatchObject({ lokal_id: "L1", letzte_aenderung_fremd: "2026-09-01T00:00:00Z" });
    expect(s.bilder.get("L1")).toHaveLength(1);
  });

  it("aktualisiert nur, was sich im Fremdsystem seit dem letzten Lauf geaendert hat", async () => {
    const s = new Gedaechtnis();
    const erst = attrappe({ objekte: [[leeresObjektMit("F1", { bezeichnung: "Alt", geaendert_am_fremd: "2026-09-01T00:00:00Z" })]] });
    await syncAusfuehren(erst, kontext, s, { richtung: "holen", seit: null });

    // Unveraendert → uebersprungen
    const gleich = attrappe({ objekte: [[leeresObjektMit("F1", { bezeichnung: "Alt", geaendert_am_fremd: "2026-09-01T00:00:00Z" })]] });
    const e1 = await syncAusfuehren(gleich, kontext, s, { richtung: "holen", seit: "2026-09-02T00:00:00Z" });
    expect(e1).toMatchObject({ angelegt: 0, geaendert: 0, uebersprungen: 1 });

    // Geaendert → aktualisiert, ohne Konflikt (nur holen)
    const neu = attrappe({ objekte: [[leeresObjektMit("F1", { bezeichnung: "Neu", geaendert_am_fremd: "2026-09-03T00:00:00Z" })]] });
    const e2 = await syncAusfuehren(neu, kontext, s, { richtung: "holen", seit: "2026-09-02T00:00:00Z" });
    expect(e2).toMatchObject({ angelegt: 0, geaendert: 1, konflikte: [] });
    expect(s.objekte.get("L1")!.zeile.bezeichnung).toBe("Neu");
  });

  it("ein fehlerhaftes Bild stoppt weder Objekt noch Lauf", async () => {
    const kaputt: KanonischesBild = { fremd_id: "b", url: "https://x/k.jpg", daten: null, dateiname: null, mime: null, titel: "kaputt", gruppe: null, reihenfolge: 0 };
    const c = attrappe({ objekte: [[leeresObjektMit("F1", { bezeichnung: "Eins", bilder: [kaputt] }), leeresObjektMit("F2", { bezeichnung: "Zwei" })]] });
    const s = new Gedaechtnis();
    const e = await syncAusfuehren(c, kontext, s, { richtung: "holen", seit: null });
    expect(e.angelegt).toBe(2);
    expect(e.fehler).toEqual([{ typ: "bild", fremd_id: "b", meldung: "Bild nicht ladbar" }]);
  });

  it("holt auch Kontakte", async () => {
    const c = attrappe({ objekte: [], kontakte: [leerenKontakt("K1", { nachname: "Muster" })] });
    const s = new Gedaechtnis();
    const e = await syncAusfuehren(c, kontext, s, { richtung: "holen", seit: null });
    expect(e.angelegt).toBe(1);
    expect(s.kontakte.size).toBe(1);
    expect(s.mappings.get("kontakt|K1")?.lokal_id).toBe("K1".replace("K1", [...s.kontakte.keys()][0]!));
  });
});

describe("Lauf: beide Richtungen", () => {
  it("beidseitige Aenderung: die juengere gewinnt, der Fall steht in der Konfliktliste", async () => {
    const s = new Gedaechtnis();
    await syncAusfuehren(
      attrappe({ objekte: [[leeresObjektMit("F1", { bezeichnung: "Start", geaendert_am_fremd: "2026-09-01T00:00:00Z" })]] }),
      kontext,
      s,
      { richtung: "holen", seit: null },
    );
    // Lokal geaendert (Uhr laeuft weiter) …
    await s.objektAktualisieren("L1", { ...s.objekte.get("L1")!.zeile, bezeichnung: "Lokal" });
    // … und fremd geaendert, mit einem Zeitpunkt in ferner Zukunft → fremd gewinnt.
    const c = attrappe({
      objekte: [[leeresObjektMit("F1", { bezeichnung: "Fremd", geaendert_am_fremd: "2030-01-01T00:00:00Z" })]],
      senden: () => ({ angelegt: [], geaendert: [], fehler: [] }),
    });
    const e = await syncAusfuehren(c, kontext, s, { richtung: "beide", seit: "2026-09-02T00:00:00Z" });

    expect(e.geaendert).toBe(1);
    expect(e.konflikte).toHaveLength(1);
    expect(e.konflikte[0]).toMatchObject({ typ: "objekt", lokal_id: "L1", fremd_id: "F1" });
    expect(s.objekte.get("L1")!.zeile.bezeichnung).toBe("Fremd");
    // Der Konfliktfall wird nicht zurueckgesendet.
    expect(c.gesendet.map((o) => o.lokal_id)).not.toContain("L1");
  });

  it("sendet lokale Objekte ohne Zuordnung als neu und merkt sich die Fremd-ID", async () => {
    const s = new Gedaechtnis();
    await s.objektAnlegen(objektZeile(leeresObjektMit("egal", { bezeichnung: "Lokal angelegt" })));
    const c = attrappe({
      objekte: [],
      senden: (objekte) => ({ angelegt: objekte.map((o) => ({ lokal_id: o.lokal_id, fremd_id: `X-${o.lokal_id}` })), geaendert: [], fehler: [] }),
    });
    const e = await syncAusfuehren(c, kontext, s, { richtung: "senden", seit: null });
    expect(e.angelegt).toBe(1);
    expect(c.gesendet[0]!.fremd_id).toBe(c.gesendet[0]!.lokal_id);
    expect(s.mappings.get("objekt|X-L1")).toMatchObject({ lokal_id: "L1" });
  });
});
