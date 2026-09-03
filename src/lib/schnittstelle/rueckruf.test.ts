import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/integrationen/kern/zugangsdaten", () => ({ entschluesseln: () => "whsec_test" }));

import type { SupabaseClient } from "@supabase/supabase-js";

import { geheimnisErzeugen, lieferungBauen, rueckrufeZustellen, signaturKopf, signaturPruefen } from "./rueckruf";

describe("Signatur", () => {
  it("laesst sich mit dem Geheimnis pruefen — und nur damit, nur im Zeitfenster", () => {
    const geheimnis = geheimnisErzeugen();
    expect(geheimnis).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    const koerper = JSON.stringify({ id: "x", ereignis: "objekt.angelegt" });
    const kopf = signaturKopf(geheimnis, 1_756_900_800, koerper);
    expect(kopf).toMatch(/^t=1756900800,v1=[0-9a-f]{64}$/);
    expect(signaturPruefen(geheimnis, kopf, koerper, 1_756_900_900)).toBe(true);
    expect(signaturPruefen("whsec_anders", kopf, koerper, 1_756_900_900)).toBe(false);
    expect(signaturPruefen(geheimnis, kopf, `${koerper} `, 1_756_900_900)).toBe(false);
    expect(signaturPruefen(geheimnis, kopf, koerper, 1_756_901_200)).toBe(false);
    expect(signaturPruefen(geheimnis, "kaputt", koerper)).toBe(false);
  });

  it("baut die Lieferung aus der Zeile", () => {
    expect(lieferungBauen({ id: "l1", ereignis: "kontakt.angelegt", erstellt_am: "2026-09-03T12:00:00Z", nutzlast: { id: "k1" } })).toEqual({
      id: "l1",
      ereignis: "kontakt.angelegt",
      zeitpunkt: "2026-09-03T12:00:00Z",
      daten: { id: "k1" },
    });
  });
});

describe("rueckrufeZustellen", () => {
  function fakeSupabase(zeilen: unknown[], ziele: unknown[]) {
    const rpc = vi.fn(async (name: string, _args?: unknown) => {
      if (name === "rueckrufe_beanspruchen") return { data: zeilen, error: null };
      return { data: null, error: null };
    });
    const supabase = {
      rpc,
      from: () => ({ select: () => ({ in: async () => ({ data: ziele }) }) }),
    } as unknown as SupabaseClient;
    return { supabase, rpc };
  }

  it("signiert, liefert aus und meldet das Ergebnis zurueck", async () => {
    const zeile = { id: "r1", mandant_id: "m", ziel_id: "z1", ereignis: "objekt.angelegt", nutzlast: { id: "o1" }, erstellt_am: "2026-09-03T12:00:00Z", versuche: 1 };
    const { supabase, rpc } = fakeSupabase([zeile], [{ id: "z1", mandant_id: "m", url: "https://ziel.invalid/hook", geheimnis_verschluesselt: "v1.x", aktiv: true }]);
    const aufrufe: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      aufrufe.push({ url: String(url), init });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const erg = await rueckrufeZustellen(supabase, fetchFn, { jetzt: () => new Date(1_756_900_800_000) });
    expect(erg).toEqual({ zugestellt: 1, gescheitert: 0 });
    const kopf = aufrufe[0]?.init?.headers as Record<string, string>;
    expect(kopf["X-ImmoOffice-Ereignis"]).toBe("objekt.angelegt");
    expect(kopf["X-ImmoOffice-Lieferung"]).toBe("r1");
    expect(signaturPruefen("whsec_test", kopf["X-ImmoOffice-Signatur"]!, String(aufrufe[0]?.init?.body), 1_756_900_800)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("rueckruf_ergebnis", { p_id: "r1", p_ok: true, p_status: 200, p_fehler: null });
  });

  it("meldet Fehlschlaege mit Status und inaktive Ziele ohne Versand", async () => {
    const zeilen = [
      { id: "r1", mandant_id: "m", ziel_id: "z1", ereignis: "objekt.angelegt", nutzlast: {}, erstellt_am: "2026-09-03T12:00:00Z", versuche: 1 },
      { id: "r2", mandant_id: "m", ziel_id: "z2", ereignis: "objekt.angelegt", nutzlast: {}, erstellt_am: "2026-09-03T12:00:00Z", versuche: 1 },
    ];
    const { supabase, rpc } = fakeSupabase(zeilen, [
      { id: "z1", mandant_id: "m", url: "https://ziel.invalid/hook", geheimnis_verschluesselt: "v1.x", aktiv: true },
      { id: "z2", mandant_id: "m", url: "https://ziel.invalid/aus", geheimnis_verschluesselt: "v1.x", aktiv: false },
    ]);
    const fetchFn = (async () => new Response("kaputt", { status: 503 })) as unknown as typeof fetch;
    const erg = await rueckrufeZustellen(supabase, fetchFn);
    expect(erg).toEqual({ zugestellt: 0, gescheitert: 2 });
    expect(rpc).toHaveBeenCalledWith("rueckruf_ergebnis", { p_id: "r1", p_ok: false, p_status: 503, p_fehler: "HTTP 503" });
    expect(rpc).toHaveBeenCalledWith("rueckruf_ergebnis", expect.objectContaining({ p_id: "r2", p_ok: false, p_fehler: "Ziel ist inaktiv oder geloescht." }));
  });
});
