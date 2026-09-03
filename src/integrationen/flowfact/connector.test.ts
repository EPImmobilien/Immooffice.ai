import { beforeEach, describe, expect, it, vi } from "vitest";

import { kontextErzeugen } from "../kern/connector";
import { leeresObjektMit } from "../kern/testhelfer";
import { FLOWFACT_VORGABEN, anfrage, tokenHolen, tokenSpeicherLeeren } from "./api";
import { flowfactConnector } from "./connector";
import { kontaktAusFlowfact, objektAusFlowfact, wert } from "./mapping";

const ZUGANG = { client_id: "kunde-1", client_geheimnis: "sehr-geheim" };
const JETZT = () => new Date("2026-09-03T12:00:00Z");

const ENTITAET = {
  id: "est-1",
  _metadata: { modifiedAt: "2026-09-01T09:00:00Z" },
  headline: { values: ["Reihenhaus mit Garten"] },
  identifier: { values: ["FF-77"] },
  marketingType: { values: ["SALE"] },
  estateType: { values: ["HOUSE"] },
  street: { values: ["Gartenweg"] },
  houseNumber: { values: ["3"] },
  zip: { values: ["22359"] },
  city: { values: ["Hamburg"] },
  livingArea: { values: [128] },
  rooms: { values: ["4,5"] },
  purchasePrice: { values: [649000] },
  energyCertificateType: { values: ["DEMAND"] },
  descriptionNote: { values: ["Schönes Haus"] },
  images: [{ id: "b1", url: "https://bilder.invalid/b1.jpg", category: "TITLE" }],
};

function fetchAttrappe(handler: (url: URL, init: RequestInit | undefined) => Response | undefined) {
  const aufrufe: Array<{ url: URL; init: RequestInit | undefined }> = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    aufrufe.push({ url: u, init });
    return handler(u, init) ?? new Response("{}", { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, aufrufe };
}

const json = (daten: unknown, status = 200) => new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json" } });
const token = () => json({ access_token: "tok-1", expires_in: 3600 });

beforeEach(() => tokenSpeicherLeeren());

describe("Token", () => {
  it("holt das Token per Client Credentials mit Basic-Auth und merkt es sich", async () => {
    const { fetch, aufrufe } = fetchAttrappe((u) => (u.toString() === FLOWFACT_VORGABEN.token_url ? token() : undefined));
    const abh = { fetch, jetzt: JETZT, zwischenspeicher: "int-1" };
    expect(await tokenHolen(ZUGANG, abh)).toBe("tok-1");
    expect(await tokenHolen(ZUGANG, abh)).toBe("tok-1");
    expect(aufrufe).toHaveLength(1);
    const kopf = aufrufe[0]?.init?.headers as Record<string, string>;
    expect(kopf["Authorization"]).toBe(`Basic ${Buffer.from("kunde-1:sehr-geheim").toString("base64")}`);
    expect(String(aufrufe[0]?.init?.body)).toBe("grant_type=client_credentials");
  });

  it("meldet abgelehnte Zugangsdaten verstaendlich und ohne Geheimnis", async () => {
    const { fetch } = fetchAttrappe(() => json({ error: "invalid_client sehr-geheim" }, 401));
    await expect(tokenHolen(ZUGANG, { fetch, jetzt: JETZT })).rejects.toThrow(/Client-ID oder Client-Geheimnis/);
    await expect(tokenHolen(ZUGANG, { fetch, jetzt: JETZT })).rejects.not.toThrow(/sehr-geheim/);
  });

  it("nutzt ueberschriebene Adressen und erneuert das Token nach 401 einmal", async () => {
    let ausgegeben = 0;
    const { fetch, aufrufe } = fetchAttrappe((u, init) => {
      if (u.toString() === "https://mein.flowfact.invalid/token") {
        ausgegeben += 1;
        return json({ access_token: `tok-${ausgegeben}`, expires_in: 60 });
      }
      const auth = (init?.headers as Record<string, string>)["Authorization"];
      return auth === "Bearer tok-2" ? json({ content: [] }) : json({}, 401);
    });
    const zugang = { ...ZUGANG, token_url: "https://mein.flowfact.invalid/token", basis_url: "https://mein.flowfact.invalid/api/" };
    const erg = await anfrage<{ content: unknown[] }>(zugang, "/entities/estates", { abfrage: { page: 0 } }, { fetch, jetzt: JETZT, zwischenspeicher: "int-2" });
    expect(erg).toEqual({ content: [] });
    expect(ausgegeben).toBe(2);
    expect(aufrufe.some((a) => a.url.toString() === "https://mein.flowfact.invalid/api/entities/estates?page=0")).toBe(true);
  });
});

describe("Mapping", () => {
  it("liest Werte direkt oder aus values-Listen", () => {
    expect(wert({ a: { values: ["x"] } }, "a")).toBe("x");
    expect(wert({ b: 5 }, "a", "b")).toBe(5);
    expect(wert({ a: { values: [] } }, "a")).toBeUndefined();
    expect(wert({ City: "Kiel" }, "city")).toBe("Kiel");
  });

  it("uebersetzt eine FlowFact-Entitaet in das kanonische Modell", () => {
    const o = objektAusFlowfact(ENTITAET);
    expect(o).toMatchObject({
      fremd_id: "est-1",
      geaendert_am_fremd: "2026-09-01T09:00:00Z",
      objektnummer: "FF-77",
      titel: "Reihenhaus mit Garten",
      bezeichnung: "Reihenhaus mit Garten",
      vermarktungsart: "kauf",
      objektkategorie: "haus",
      nutzungsart: "wohnen",
      strasse: "Gartenweg",
      hausnummer: "3",
      plz: "22359",
      ort: "Hamburg",
      wohnflaeche: 128,
      zimmer: 4.5,
      kaufpreis: 649000,
      energieausweis_typ: "bedarf",
      beschreibung_objekt: "Schönes Haus",
      kaltmiete: null,
    });
    expect(o.bilder).toEqual([
      { fremd_id: "b1", url: "https://bilder.invalid/b1.jpg", daten: null, dateiname: null, mime: null, titel: null, gruppe: "Titelbild", reihenfolge: 0 },
    ]);
  });

  it("uebersetzt Kontakte mit Mehrfachwerten und Fallbacks", () => {
    const k = kontaktAusFlowfact({ id: "c1", salutation: { values: ["MALE"] }, firstname: { values: ["Max"] }, lastname: { values: ["Muster"] }, emails: { values: ["Max@Beispiel.invalid", "zweite@beispiel.invalid"] }, phones: { values: ["040 1"] } });
    expect(k).toMatchObject({ fremd_id: "c1", anrede: "Herr", vorname: "Max", nachname: "Muster", email: "max@beispiel.invalid", telefon: "040 1" });
    expect(() => objektAusFlowfact({ headline: "ohne id" })).toThrow(/ID/);
  });
});

describe("flowfactConnector", () => {
  it("prueft die Verbindung und meldet Kandidatenfelder ohne Treffer", async () => {
    const { fetch } = fetchAttrappe((u) => {
      if (u.toString() === FLOWFACT_VORGABEN.token_url) return token();
      if (u.pathname.endsWith("/entities/estates")) return json({ content: [{ id: "e1", headline: { values: ["H"] } }] });
      if (u.pathname.endsWith("/entities/contacts")) return json({ content: [{ id: "c1", lastname: { values: ["N"] }, emails: { values: ["a@b.invalid"] } }] });
      return undefined;
    });
    const protokoll: string[] = [];
    const kontext = kontextErzeugen({ mandantId: "m", integrationId: "int-3", zugangsdaten: ZUGANG, fetch, jetzt: JETZT, protokoll: (z) => protokoll.push(z) });
    const p = await flowfactConnector.verbindungPruefen(kontext);
    expect(p.ok).toBe(true);
    expect(kontext.konfig["felder_fehlend"]).toContain("Objekt.strasse");
    expect(kontext.konfig["felder_fehlend"]).not.toContain("Objekt.titel");
    expect(kontext.konfig["felder_fehlend"]).toContain("Kontakt.telefon");
    expect(protokoll[0]).toContain("Feldpruefung");
  });

  it("holt Objekte seitenweise und sendet neue per POST", async () => {
    const { fetch, aufrufe } = fetchAttrappe((u, init) => {
      if (u.toString() === FLOWFACT_VORGABEN.token_url) return token();
      if (init?.method === "POST") return json({ id: "neu-1" });
      if (u.searchParams.get("page") === "0") return json({ content: [ENTITAET] });
      return json({ content: [] });
    });
    const kontext = kontextErzeugen({ mandantId: "m", integrationId: "int-4", zugangsdaten: ZUGANG, fetch, jetzt: JETZT });
    const erg = await flowfactConnector.objekteHolen!(kontext, { seite: 0, seitengroesse: 1, seit: new Date("2026-08-01T00:00:00Z") });
    expect(erg.datensaetze).toHaveLength(1);
    expect(erg.weitere).toBe(true);
    expect(aufrufe.find((a) => a.url.pathname.endsWith("/entities/estates"))?.url.searchParams.get("modifiedAfter")).toBe("2026-08-01T00:00:00.000Z");

    const gesendet = await flowfactConnector.objekteSenden!(kontext, [{ ...leeresObjektMit("l1", { bezeichnung: "Neu", objektkategorie: "wohnung", kaufpreis: 1 }), lokal_id: "l1" }]);
    expect(gesendet.angelegt).toEqual([{ lokal_id: "l1", fremd_id: "neu-1" }]);
    const post = aufrufe.find((a) => a.init?.method === "POST" && a.url.pathname.endsWith("/entities/estates"));
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({ headline: "Neu", estateType: "APARTMENT", marketingType: "SALE", purchasePrice: 1 });
  });
});
