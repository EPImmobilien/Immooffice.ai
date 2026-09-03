import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GRAPH_BASIS, MicrosoftAnbieter } from "./microsoft";
import type { OAuthZugang } from "./typen";

type Aufruf = { url: string; init: RequestInit | undefined };

function antwort(status: number, json?: unknown): Response {
  return new Response(json === undefined ? null : JSON.stringify(json), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const konfig = { art: "microsoft" as const, clientId: "cid", clientSecret: "geheim", tenant: "common" };
const gueltig: OAuthZugang = { art: "microsoft", refreshToken: "rt", accessToken: "zt", gueltigBis: "2999-01-01T00:00:00.000Z" };

function fakeFetch(handler: (url: string, init: RequestInit | undefined) => Response | undefined) {
  const aufrufe: Aufruf[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    aufrufe.push({ url: u, init });
    return handler(u, init) ?? antwort(404, { error: "unbekannt" });
  }) as unknown as typeof fetch;
  return { fn, aufrufe };
}

describe("MicrosoftAnbieter.abrufen", () => {
  it("liest den Posteingang per Delta, folgt nextLink und merkt sich den deltaLink", async () => {
    const { fn, aufrufe } = fakeFetch((url) => {
      if (url.includes("/messages/delta?") && !url.includes("$skiptoken")) {
        return antwort(200, {
          value: [
            {
              id: "m1",
              subject: "Anfrage",
              from: { emailAddress: { address: "kunde@beispiel.invalid", name: "Kunde" } },
              toRecipients: [{ emailAddress: { address: "info@makler.invalid" } }],
              receivedDateTime: "2026-09-01T08:00:00Z",
              sentDateTime: "2026-09-01T07:59:00Z",
              isRead: false,
              hasAttachments: true,
              internetMessageId: "<m1@beispiel.invalid>",
              conversationId: "conv1",
              body: { contentType: "text", content: "Wann ist Besichtigung?" },
            },
          ],
          "@odata.nextLink": `${GRAPH_BASIS}/me/mailFolders/inbox/messages/delta?$skiptoken=2`,
        });
      }
      if (url.includes("$skiptoken=2")) {
        return antwort(200, {
          value: [
            { id: "m2", "@removed": { reason: "deleted" } },
            {
              id: "m3",
              subject: "HTML",
              from: { emailAddress: { address: "x@beispiel.invalid" } },
              isRead: true,
              body: { contentType: "html", content: "<p>Hallo<br>Welt</p>" },
            },
          ],
          "@odata.deltaLink": `${GRAPH_BASIS}/me/mailFolders/inbox/messages/delta?$deltatoken=abc`,
        });
      }
      if (url.includes("/messages/m1/attachments")) {
        return antwort(200, {
          value: [
            { id: "a1", name: "Ausweis.pdf", contentType: "application/pdf", size: 1200, isInline: false },
            { id: "a2", name: "logo.png", contentType: "image/png", size: 300, isInline: true },
          ],
        });
      }
      return undefined;
    });

    const anbieter = new MicrosoftAnbieter(gueltig, fn, konfig);
    const erg = await anbieter.abrufen({}, { maxAnzahl: 50 });
    expect(erg.vollstaendig).toBe(true);
    expect(erg.nachrichten).toHaveLength(2);
    expect(erg.nachrichten[0]).toMatchObject({
      externId: "m1",
      von: { adresse: "kunde@beispiel.invalid", name: "Kunde" },
      messageId: "<m1@beispiel.invalid>",
      threadId: "conv1",
      gelesen: false,
      gesendetAm: "2026-09-01T07:59:00Z",
      text: "Wann ist Besichtigung?",
    });
    expect(erg.nachrichten[0]?.anhaenge).toEqual([{ externId: "a1", dateiname: "Ausweis.pdf", mime: "application/pdf", bytes: 1200 }]);
    expect(erg.nachrichten[1]?.text).toBe("Hallo\nWelt");
    expect(erg.zustand).toEqual({ deltaLink: `${GRAPH_BASIS}/me/mailFolders/inbox/messages/delta?$deltatoken=abc` });
    // Erstabruf filtert nach Empfangsdatum und verlangt Text statt HTML.
    const erster = aufrufe.find((a) => a.url.includes("/messages/delta?") && !a.url.includes("$skiptoken"));
    expect(erster?.url).toContain("receivedDateTime+ge+");
    expect((erster?.init?.headers as Record<string, string>)["Prefer"]).toContain("text");
    expect(anbieter.aktualisierterZugang()).toBeNull();
  });

  it("setzt beim Folgelauf am deltaLink an und erneuert ein abgelaufenes Token", async () => {
    let tokenAusgegeben = 0;
    const { fn, aufrufe } = fakeFetch((url, init) => {
      if (url.includes("/oauth2/v2.0/token")) {
        tokenAusgegeben += 1;
        return antwort(200, { access_token: "neu", refresh_token: "rt2", expires_in: 3600 });
      }
      if (url.includes("$deltatoken=abc")) {
        const auth = (init?.headers as Record<string, string>)["Authorization"];
        if (auth !== "Bearer neu") return antwort(401, { error: "abgelaufen" });
        return antwort(200, { value: [], "@odata.deltaLink": "https://graph.microsoft.com/delta?$deltatoken=def" });
      }
      return undefined;
    });
    const abgelaufen: OAuthZugang = { art: "microsoft", refreshToken: "rt", accessToken: "alt", gueltigBis: "2000-01-01T00:00:00.000Z" };
    const anbieter = new MicrosoftAnbieter(abgelaufen, fn, konfig);
    const erg = await anbieter.abrufen({ deltaLink: "https://graph.microsoft.com/delta?$deltatoken=abc" });
    expect(erg.nachrichten).toEqual([]);
    expect(erg.vollstaendig).toBe(false);
    expect(erg.zustand).toEqual({ deltaLink: "https://graph.microsoft.com/delta?$deltatoken=def" });
    expect(tokenAusgegeben).toBe(1);
    expect(anbieter.aktualisierterZugang()).toMatchObject({ accessToken: "neu", refreshToken: "rt2" });
    expect(aufrufe.filter((a) => a.url.includes("$deltatoken=abc"))).toHaveLength(1);
  });
});

describe("MicrosoftAnbieter.senden", () => {
  it("sendet neue Nachrichten ueber sendMail und legt sie in Gesendet ab", async () => {
    const { fn, aufrufe } = fakeFetch((url) => (url.endsWith("/me/sendMail") ? antwort(202) : undefined));
    const anbieter = new MicrosoftAnbieter(gueltig, fn, konfig);
    const erg = await anbieter.senden({ an: [{ adresse: "k@beispiel.invalid", name: "K" }], betreff: "Hallo", text: "Text" });
    expect(erg).toEqual({ externId: null, messageId: null });
    const koerper = JSON.parse(String(aufrufe[0]?.init?.body)) as { message: { toRecipients: unknown[]; body: { contentType: string } }; saveToSentItems: boolean };
    expect(koerper.saveToSentItems).toBe(true);
    expect(koerper.message.body.contentType).toBe("Text");
    expect(koerper.message.toRecipients).toEqual([{ emailAddress: { address: "k@beispiel.invalid", name: "K" } }]);
  });

  it("beantwortet ueber createReply, setzt den Text und sendet den Entwurf", async () => {
    const { fn, aufrufe } = fakeFetch((url, init) => {
      if (url.endsWith("/messages/m1/createReply")) return antwort(201, { id: "entwurf1" });
      if (url.endsWith("/messages/entwurf1") && init?.method === "PATCH") return antwort(200, { id: "entwurf1" });
      if (url.endsWith("/messages/entwurf1/send")) return antwort(202);
      return undefined;
    });
    const anbieter = new MicrosoftAnbieter(gueltig, fn, konfig);
    const erg = await anbieter.senden({ an: [{ adresse: "k@beispiel.invalid" }], betreff: "Re: Anfrage", text: "Gern.", antwortAufExternId: "m1" });
    expect(erg.externId).toBe("entwurf1");
    expect(aufrufe.map((a) => `${a.init?.method ?? "GET"} ${a.url.replace(GRAPH_BASIS, "")}`)).toEqual([
      "POST /me/messages/m1/createReply",
      "PATCH /me/messages/entwurf1",
      "POST /me/messages/entwurf1/send",
    ]);
  });
});

describe("MicrosoftAnbieter.anhangLaden / pruefen", () => {
  it("laedt Dateianhaenge und liest die Kontoadresse", async () => {
    const { fn } = fakeFetch((url) => {
      if (url.endsWith("/attachments/a1")) return antwort(200, { name: "x.pdf", contentType: "application/pdf", contentBytes: Buffer.from("%PDF").toString("base64") });
      if (url.includes("/me?$select")) return antwort(200, { mail: "info@makler.invalid" });
      return undefined;
    });
    const anbieter = new MicrosoftAnbieter(gueltig, fn, konfig);
    const a = await anbieter.anhangLaden("m1", "a1");
    expect(a.dateiname).toBe("x.pdf");
    expect(Buffer.from(a.inhalt).toString()).toBe("%PDF");
    expect(await anbieter.pruefen()).toEqual({ ok: true, adresse: "info@makler.invalid" });
  });

  it("meldet eine fehlende Einrichtung verstaendlich", async () => {
    const { fn } = fakeFetch(() => antwort(401));
    const ohne = new MicrosoftAnbieter({ art: "microsoft", refreshToken: "rt" }, fn, null);
    const p = await ohne.pruefen();
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.fehler).toContain("nicht eingerichtet");
  });
});
