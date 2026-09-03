import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GoogleAnbieter } from "./google";
import type { OAuthZugang } from "./typen";

function antwort(status: number, json?: unknown): Response {
  return new Response(json === undefined ? null : JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
}

const konfig = { art: "google" as const, clientId: "gid", clientSecret: "geheim", tenant: "" };
const gueltig: OAuthZugang = { art: "google", refreshToken: "rt", accessToken: "zt", gueltigBis: "2999-01-01T00:00:00.000Z" };
const absender = { adresse: "info@makler.invalid", name: "Makler" };

function b64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

const nachricht1 = {
  id: "g1",
  threadId: "t1",
  labelIds: ["INBOX", "UNREAD"],
  internalDate: "1756713600000",
  payload: {
    mimeType: "multipart/mixed",
    headers: [
      { name: "From", value: "Kunde <kunde@beispiel.invalid>" },
      { name: "To", value: "info@makler.invalid, Kollege <k@makler.invalid>" },
      { name: "Subject", value: "Objekt 0042" },
      { name: "Date", value: "Tue, 01 Sep 2026 10:00:00 +0200" },
      { name: "Message-ID", value: "<g1@beispiel.invalid>" },
    ],
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64url("Hallo,\nist das Objekt noch frei?") } },
          { mimeType: "text/html", body: { data: b64url("<p>Hallo</p>") } },
        ],
      },
      { mimeType: "application/pdf", filename: "Finanzierung.pdf", body: { attachmentId: "att1", size: 4321 } },
    ],
  },
};

function fakeFetch(handler: (url: string, init: RequestInit | undefined) => Response | undefined) {
  const aufrufe: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    aufrufe.push({ url: u, init });
    return handler(u, init) ?? antwort(404, { error: "unbekannt" });
  }) as unknown as typeof fetch;
  return { fn, aufrufe };
}

describe("GoogleAnbieter.abrufen", () => {
  it("liest beim ersten Mal die Liste und merkt sich die historyId", async () => {
    const { fn, aufrufe } = fakeFetch((url) => {
      if (url.includes("/messages?")) return antwort(200, { messages: [{ id: "g1" }] });
      if (url.endsWith("/profile")) return antwort(200, { emailAddress: "info@makler.invalid", historyId: "500" });
      if (url.includes("/messages/g1?")) return antwort(200, nachricht1);
      return undefined;
    });
    const anbieter = new GoogleAnbieter(gueltig, absender, fn, konfig);
    const erg = await anbieter.abrufen({});
    expect(erg.vollstaendig).toBe(true);
    expect(erg.zustand).toEqual({ historyId: "500" });
    expect(erg.nachrichten).toHaveLength(1);
    expect(erg.nachrichten[0]).toMatchObject({
      externId: "g1",
      threadId: "t1",
      gelesen: false,
      von: { adresse: "kunde@beispiel.invalid", name: "Kunde" },
      betreff: "Objekt 0042",
      text: "Hallo,\nist das Objekt noch frei?",
      messageId: "<g1@beispiel.invalid>",
      gesendetAm: "2026-09-01T08:00:00.000Z",
    });
    expect(erg.nachrichten[0]?.an).toEqual([{ adresse: "info@makler.invalid" }, { adresse: "k@makler.invalid", name: "Kollege" }]);
    expect(erg.nachrichten[0]?.anhaenge).toEqual([{ externId: "att1", dateiname: "Finanzierung.pdf", mime: "application/pdf", bytes: 4321 }]);
    expect(aufrufe[0]?.url).toContain("labelIds=INBOX");
    expect(aufrufe[0]?.url).toContain("q=after%3A");
  });

  it("holt danach nur die Historie und setzt bei abgelaufener Historie neu auf", async () => {
    const { fn } = fakeFetch((url) => {
      if (url.includes("/history?") && url.includes("startHistoryId=500")) {
        return antwort(200, { history: [{ messagesAdded: [{ message: { id: "g1" } }, { message: { id: "g1" } }] }], historyId: "510" });
      }
      if (url.includes("/history?") && url.includes("startHistoryId=1")) return antwort(404, { error: "expired" });
      if (url.includes("/messages?")) return antwort(200, { messages: [] });
      if (url.endsWith("/profile")) return antwort(200, { historyId: "600" });
      if (url.includes("/messages/g1?")) return antwort(200, nachricht1);
      return undefined;
    });
    const anbieter = new GoogleAnbieter(gueltig, absender, fn, konfig);
    const delta = await anbieter.abrufen({ historyId: "500" });
    expect(delta.vollstaendig).toBe(false);
    expect(delta.nachrichten.map((n) => n.externId)).toEqual(["g1"]);
    expect(delta.zustand).toEqual({ historyId: "510" });

    const neu = await anbieter.abrufen({ historyId: "1" });
    expect(neu.vollstaendig).toBe(true);
    expect(neu.zustand).toEqual({ historyId: "600" });
  });
});

describe("GoogleAnbieter.senden / anhangLaden", () => {
  it("sendet als Quelltext im selben Thread und liefert die Message-ID", async () => {
    const { fn, aufrufe } = fakeFetch((url) => (url.endsWith("/messages/send") ? antwort(200, { id: "gs1", threadId: "t1" }) : undefined));
    const anbieter = new GoogleAnbieter(gueltig, absender, fn, konfig);
    const erg = await anbieter.senden({ an: [{ adresse: "kunde@beispiel.invalid" }], betreff: "Re: Objekt 0042", text: "Ja, noch frei.", threadId: "t1", inReplyTo: "<g1@beispiel.invalid>" });
    expect(erg.externId).toBe("gs1");
    expect(erg.messageId).toMatch(/^<.+>$/);
    const koerper = JSON.parse(String(aufrufe[0]?.init?.body)) as { raw: string; threadId?: string };
    expect(koerper.threadId).toBe("t1");
    const roh = Buffer.from(koerper.raw, "base64url").toString("utf8");
    expect(roh).toMatch(/From: "?Makler"? <info@makler\.invalid>/);
    expect(roh).toMatch(/In-Reply-To: <g1@beispiel\.invalid>/);
    expect(roh).toContain("Ja, noch frei.");
  });

  it("laedt Anhaenge und uebernimmt Name und Typ aus dem Hinweis", async () => {
    const { fn } = fakeFetch((url) => (url.endsWith("/attachments/att1") ? antwort(200, { data: b64url("%PDF") }) : undefined));
    const anbieter = new GoogleAnbieter(gueltig, absender, fn, konfig);
    const a = await anbieter.anhangLaden("g1", "att1", { dateiname: "Finanzierung.pdf", mime: "application/pdf" });
    expect(a).toMatchObject({ dateiname: "Finanzierung.pdf", mime: "application/pdf" });
    expect(Buffer.from(a.inhalt).toString()).toBe("%PDF");
  });
});
