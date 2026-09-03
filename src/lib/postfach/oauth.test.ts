import { describe, expect, it, vi } from "vitest";

// `server-only` wirft ausserhalb von Next. Fuer den Test ist es ein Leermodul.
vi.mock("server-only", () => ({}));

import {
  autorisierungsUrl,
  codeEintauschen,
  kontoAdresse,
  oauthKonfig,
  stateErzeugen,
  statePruefen,
  tokenAuffrischen,
  type OAuthKonfig,
} from "./oauth";

const schluessel = Buffer.alloc(32, 7);
const ms: OAuthKonfig = { art: "microsoft", clientId: "cid", clientSecret: "geheim", tenant: "common" };
const gg: OAuthKonfig = { art: "google", clientId: "gid", clientSecret: "ggeheim", tenant: "" };

function antwort(status: number, json: unknown): Response {
  return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
}

describe("oauthKonfig", () => {
  it("liest die Umgebung und meldet fehlende Werte als nicht verfuegbar", () => {
    expect(oauthKonfig("microsoft", {})).toBeNull();
    expect(oauthKonfig("google", { GOOGLE_CLIENT_ID: "a" })).toBeNull();
    expect(oauthKonfig("microsoft", { MICROSOFT_CLIENT_ID: "a", MICROSOFT_CLIENT_SECRET: "b" })?.tenant).toBe("common");
    expect(oauthKonfig("microsoft", { MICROSOFT_CLIENT_ID: "a", MICROSOFT_CLIENT_SECRET: "b", MICROSOFT_TENANT_ID: "t1" })?.tenant).toBe("t1");
  });
});

describe("autorisierungsUrl", () => {
  it("baut die Anmeldeadressen mit Offline-Zugriff", () => {
    const m = new URL(autorisierungsUrl(ms, "https://app.invalid/rueckruf", "s1"));
    expect(m.hostname).toBe("login.microsoftonline.com");
    expect(m.searchParams.get("scope")).toContain("offline_access");
    expect(m.searchParams.get("state")).toBe("s1");
    const g = new URL(autorisierungsUrl(gg, "https://app.invalid/rueckruf", "s2"));
    expect(g.searchParams.get("access_type")).toBe("offline");
    expect(g.searchParams.get("prompt")).toBe("consent");
  });
});

describe("Token", () => {
  it("tauscht den Code und berechnet den Ablauf mit Sicherheitsabstand", async () => {
    const aufrufe: string[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      aufrufe.push(`${String(url)} ${String(init?.body)}`);
      return antwort(200, { access_token: "zt", refresh_token: "rt", expires_in: 3600 });
    }) as unknown as typeof fetch;
    const t = await codeEintauschen(gg, "code123", "https://app.invalid/r", fetchFn);
    expect(t).toMatchObject({ accessToken: "zt", refreshToken: "rt" });
    expect(new Date(t.gueltigBis).getTime()).toBeGreaterThan(Date.now() + 3000 * 1000);
    expect(aufrufe[0]).toContain("oauth2.googleapis.com/token");
    expect(aufrufe[0]).toContain("grant_type=authorization_code");
  });

  it("meldet einen abgelehnten Auffrischversuch ohne Geheimnisse", async () => {
    const fetchFn = (async () => antwort(400, { error: "invalid_grant" })) as unknown as typeof fetch;
    await expect(tokenAuffrischen(ms, "alt", fetchFn)).rejects.toThrow("invalid_grant");
  });

  it("liest die Kontoadresse beider Anbieter", async () => {
    const fetchFn = (async (url: string | URL | Request) =>
      String(url).includes("graph.microsoft.com")
        ? antwort(200, { userPrincipalName: "m@firma.invalid" })
        : antwort(200, { email: "g@firma.invalid" })) as unknown as typeof fetch;
    expect(await kontoAdresse("microsoft", "t", fetchFn)).toBe("m@firma.invalid");
    expect(await kontoAdresse("google", "t", fetchFn)).toBe("g@firma.invalid");
  });
});

describe("state", () => {
  it("bindet den Rueckruf an Benutzer und Mandant und laeuft ab", () => {
    const state = stateErzeugen({ benutzerId: "b1", mandantId: "m1", art: "google", unternehmen: false }, schluessel, 1_000_000_000_000);
    expect(statePruefen(state, schluessel, 1_000_000_000_000 + 60_000)).toMatchObject({ benutzerId: "b1", mandantId: "m1", art: "google" });
    expect(statePruefen(state, schluessel, 1_000_000_000_000 + 16 * 60_000)).toBeNull();
    expect(statePruefen(state, Buffer.alloc(32, 9), 1_000_000_000_000)).toBeNull();
    expect(statePruefen(`${state}x`, schluessel, 1_000_000_000_000)).toBeNull();
    expect(statePruefen("kaputt", schluessel)).toBeNull();
  });
});
