import { describe, expect, it, vi } from "vitest";

import { kontextErzeugen } from "../kern/connector";
import { leeresObjektMit } from "../kern/testhelfer";
import { PROPSTACK_BASIS, anfrage } from "./api";
import { propstackConnector } from "./connector";
import { kontaktAusPropstack, objektAusPropstack, objektNachPropstack } from "./mapping";

const ZUGANG = { api_schluessel: "ps_test_0123456789" };

const EINHEIT = {
  id: 4711,
  updated_at: "2026-09-01T10:00:00Z",
  unit_id: "PS-0042",
  name: "Musterstraße 12, 2. OG",
  title: "Helle 3-Zimmer-Wohnung mit Balkon",
  marketing_type: "RENT",
  rs_type: "APARTMENT",
  rs_category: "PENTHOUSE",
  street: "Musterstraße",
  house_number: "12",
  zip_code: "20095",
  city: "Hamburg",
  country: "DE",
  hide_address: true,
  floor: "2",
  living_space: 84.5,
  number_of_rooms: 3,
  number_of_bed_rooms: 2,
  base_rent: "1.250,00",
  total_rent: 1490,
  service_charge: 240,
  construction_year: 1998,
  building_energy_rating_type: "DEMAND",
  thermal_characteristic: 78.4,
  energy_efficiency_class: "c",
  firing_types: ["GAS", "SOLAR"],
  description_note: "Beschreibung",
  location_note: "Lage",
  images: [
    { id: 2, url: "https://bilder.invalid/2.jpg", big_url: "https://bilder.invalid/2-gross.jpg", position: 1, is_floorplan: true, title: "Grundriss" },
    { id: 1, url: "https://bilder.invalid/1.jpg", position: 0, is_title_image: true },
  ],
};

function fetchAttrappe(handler: (url: URL, init: RequestInit | undefined) => Response | undefined) {
  const aufrufe: Array<{ url: URL; init: RequestInit | undefined }> = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    aufrufe.push({ url: u, init });
    return handler(u, init) ?? new Response(JSON.stringify({ error: "unbekannt" }), { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, aufrufe };
}

const json = (daten: unknown, status = 200) => new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json" } });

describe("anfrage", () => {
  it("schickt den Schluessel im Kopf und uebersetzt Fehler ohne Rohantwort", async () => {
    const { fetch, aufrufe } = fetchAttrappe((u) => (u.pathname.endsWith("/units") ? json([]) : json({ error: "key abc123 invalid" }, 401)));
    await anfrage(ZUGANG, "/units", { abfrage: { page: 1 } }, { fetch });
    expect((aufrufe[0]?.init?.headers as Record<string, string>)["X-API-KEY"]).toBe(ZUGANG.api_schluessel);
    expect(aufrufe[0]?.url.toString()).toBe(`${PROPSTACK_BASIS}/units?page=1`);
    await expect(anfrage(ZUGANG, "/contacts", {}, { fetch })).rejects.toThrow(/API-Schlüssel/);
    await expect(anfrage(ZUGANG, "/contacts", {}, { fetch })).rejects.not.toThrow(/abc123/);
  });
});

describe("Mapping", () => {
  it("uebersetzt ein Propstack-Objekt in das kanonische Modell", () => {
    const o = objektAusPropstack(EINHEIT);
    expect(o).toMatchObject({
      fremd_id: "4711",
      geaendert_am_fremd: "2026-09-01T10:00:00Z",
      objektnummer: "PS-0042",
      bezeichnung: "Musterstraße 12, 2. OG",
      titel: "Helle 3-Zimmer-Wohnung mit Balkon",
      vermarktungsart: "miete",
      objektkategorie: "wohnung",
      objektart: "penthouse",
      nutzungsart: "wohnen",
      strasse: "Musterstraße",
      hausnummer: "12",
      plz: "20095",
      ort: "Hamburg",
      land: "DE",
      etage: "2",
      adresse_veroeffentlichen: false,
      wohnflaeche: 84.5,
      zimmer: 3,
      schlafzimmer: 2,
      kaltmiete: 1250,
      warmmiete: 1490,
      nebenkosten: 240,
      baujahr: 1998,
      energieausweis_typ: "bedarf",
      energie_kennwert: 78.4,
      energie_klasse: "C",
      energie_traeger: "GAS, SOLAR",
      beschreibung_objekt: "Beschreibung",
      beschreibung_lage: "Lage",
      kaufpreis: null,
    });
    expect(o.bilder.map((b) => [b.fremd_id, b.gruppe, b.url])).toEqual([
      ["1", "Titelbild", "https://bilder.invalid/1.jpg"],
      ["2", "Grundriss", "https://bilder.invalid/2-gross.jpg"],
    ]);
  });

  it("erfindet nichts: fehlende Felder bleiben null, ohne ID scheitert der Datensatz", () => {
    const o = objektAusPropstack({ id: 1, title: "Nur Titel" });
    expect(o.bezeichnung).toBe("Nur Titel");
    expect(o.strasse).toBeNull();
    expect(o.objektkategorie).toBe("sonstige");
    expect(o.bilder).toEqual([]);
    expect(() => objektAusPropstack({ title: "ohne id" })).toThrow(/ID/);
  });

  it("uebersetzt zurueck nur belegte Werte", () => {
    const zurueck = objektNachPropstack(leeresObjektMit("x", { bezeichnung: "Haus am See", objektkategorie: "haus", kaufpreis: 450000, adresse_veroeffentlichen: true }));
    expect(zurueck).toMatchObject({ name: "Haus am See", rs_type: "HOUSE", marketing_type: "BUY", price: 450000, hide_address: false });
    expect("title" in zurueck).toBe(false);
    expect("street" in zurueck).toBe(false);
  });

  it("uebersetzt Kontakte samt Anrede und Fallback fuer den Namen", () => {
    const k = kontaktAusPropstack({ id: 9, salutation: "ms", first_name: "Maria", last_name: "Muster", email: "Maria@Beispiel.invalid", home_cell: "+49 170 1", description: "Interessentin" });
    expect(k).toMatchObject({ fremd_id: "9", anrede: "Frau", vorname: "Maria", nachname: "Muster", email: "maria@beispiel.invalid", mobil: "+49 170 1", notizen: "Interessentin", land: "DE" });
    expect(kontaktAusPropstack({ id: 10, email: "nur@mail.invalid" }).nachname).toBe("nur@mail.invalid");
  });
});

describe("propstackConnector", () => {
  it("prueft die Verbindung und protokolliert fehlende Felder", async () => {
    const { fetch } = fetchAttrappe((u) => {
      if (u.pathname.endsWith("/units")) return json([{ id: 1, title: "T" }]);
      if (u.pathname.endsWith("/contacts")) return json({ data: [{ id: 2, last_name: "X", email: "x@y.invalid", phone: "1", updated_at: "2026-01-01", first_name: "A" }] });
      return undefined;
    });
    const protokoll: string[] = [];
    const kontext = kontextErzeugen({ mandantId: "m", integrationId: "i", zugangsdaten: ZUGANG, fetch, protokoll: (z) => protokoll.push(z), jetzt: () => new Date("2026-09-03T12:00:00Z") });
    const p = await propstackConnector.verbindungPruefen(kontext);
    expect(p.ok).toBe(true);
    expect(p.meldung).toContain("Feld");
    expect(kontext.konfig["felder_fehlend"]).toContain("Objekt.street");
    expect(kontext.konfig["felder_fehlend"]).not.toContain("Kontakt.email");
    expect(protokoll[0]).toContain("Feldpruefung");
  });

  it("holt Objekte seitenweise und filtert nach Aenderungsdatum", async () => {
    const { fetch, aufrufe } = fetchAttrappe((u) => {
      const seite = u.searchParams.get("page");
      if (seite === "1") return json([EINHEIT, { ...EINHEIT, id: 4712, updated_at: "2026-01-01T00:00:00Z" }]);
      return json([]);
    });
    const kontext = kontextErzeugen({ mandantId: "m", integrationId: "i", zugangsdaten: ZUGANG, fetch });
    const erg = await propstackConnector.objekteHolen!(kontext, { seite: 0, seitengroesse: 2, seit: new Date("2026-06-01T00:00:00Z") });
    expect(erg.datensaetze.map((d) => d.fremd_id)).toEqual(["4711"]);
    expect(erg.weitere).toBe(true);
    expect(aufrufe[0]?.url.searchParams.get("per")).toBe("2");
    expect(aufrufe[0]?.url.searchParams.get("updated_after")).toBe("2026-06-01T00:00:00.000Z");
    const letzte = await propstackConnector.objekteHolen!(kontext, { seite: 1, seitengroesse: 2 });
    expect(letzte.weitere).toBe(false);
  });

  it("legt neue Objekte per POST an und aendert bekannte per PUT — Fehler stoppen den Lauf nicht", async () => {
    const { fetch, aufrufe } = fetchAttrappe((u, init) => {
      if (init?.method === "POST") return json({ id: 99 });
      if (init?.method === "PUT" && u.pathname.endsWith("/units/5")) return json({ id: 5 });
      if (init?.method === "PUT") return json({ error: "x" }, 422);
      return undefined;
    });
    const kontext = kontextErzeugen({ mandantId: "m", integrationId: "i", zugangsdaten: ZUGANG, fetch });
    const erg = await propstackConnector.objekteSenden!(kontext, [
      { ...leeresObjektMit("l1", { bezeichnung: "Neu" }), lokal_id: "l1" },
      { ...leeresObjektMit("5", { bezeichnung: "Bekannt" }), lokal_id: "l2" },
      { ...leeresObjektMit("6", { bezeichnung: "Kaputt" }), lokal_id: "l3" },
    ]);
    expect(erg.angelegt).toEqual([{ lokal_id: "l1", fremd_id: "99" }]);
    expect(erg.geaendert).toEqual(["l2"]);
    expect(erg.fehler).toHaveLength(1);
    expect(erg.fehler[0]?.meldung).toContain("abgelehnt");
    const post = aufrufe.find((a) => a.init?.method === "POST");
    expect(JSON.parse(String(post?.init?.body))).toEqual({ property: { name: "Neu", marketing_type: "BUY", rs_type: "OTHER", country: "DE", hide_address: true, price_on_inquiry: false } });
  });
});
