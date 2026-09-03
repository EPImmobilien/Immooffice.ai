import { describe, expect, it } from "vitest";

import { mimeParsen } from "./mime";

const QUELLE = [
  "From: Maria Muster <maria@beispiel.invalid>",
  "To: info@makler.invalid",
  "Cc: Kollege <k@makler.invalid>",
  "Subject: =?UTF-8?Q?Anfrage_Objekt_0042_=E2=80=93_R=C3=BCckruf?=",
  "Date: Tue, 01 Sep 2026 10:12:00 +0200",
  "Message-ID: <abc@beispiel.invalid>",
  "In-Reply-To: <xyz@makler.invalid>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="grenze"',
  "",
  "--grenze",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>Guten Tag,<br>bitte um R&uuml;ckruf.</p>",
  "--grenze",
  'Content-Type: application/pdf; name="Ausweis.pdf"',
  'Content-Disposition: attachment; filename="Ausweis.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERi0xLjQK",
  "--grenze",
  'Content-Type: image/png; name="logo.png"',
  "Content-Disposition: inline",
  "Content-ID: <logo@signatur>",
  "Content-Transfer-Encoding: base64",
  "",
  "iVBORw0KGgo=",
  "--grenze--",
  "",
].join("\r\n");

describe("mimeParsen", () => {
  it("liest Kopfdaten, macht aus HTML Text und listet nur echte Anhaenge", async () => {
    const { nachricht, anhaenge } = await mimeParsen(QUELLE);
    expect(nachricht.von).toEqual({ adresse: "maria@beispiel.invalid", name: "Maria Muster" });
    expect(nachricht.an).toEqual([{ adresse: "info@makler.invalid" }]);
    expect(nachricht.cc).toEqual([{ adresse: "k@makler.invalid", name: "Kollege" }]);
    expect(nachricht.betreff).toBe("Anfrage Objekt 0042 – Rückruf");
    expect(nachricht.messageId).toBe("<abc@beispiel.invalid>");
    expect(nachricht.inReplyTo).toBe("<xyz@makler.invalid>");
    expect(nachricht.gesendetAm).toBe("2026-09-01T08:12:00.000Z");
    expect(nachricht.text).toContain("Rückruf");
    expect(nachricht.text).not.toContain("<p>");
    expect(anhaenge).toHaveLength(1);
    expect(anhaenge[0]?.dateiname).toBe("Ausweis.pdf");
    expect(anhaenge[0]?.mime).toBe("application/pdf");
    expect(Buffer.from(anhaenge[0]!.inhalt).toString("utf8")).toBe("%PDF-1.4\n");
    expect(nachricht.anhaenge[0]).toMatchObject({ dateiname: "Ausweis.pdf", externId: anhaenge[0]?.externId });
  });

  it("kommt mit einer reinen Textnachricht ohne Anhaenge zurecht", async () => {
    const { nachricht, anhaenge } = await mimeParsen("From: a@b.invalid\r\nSubject: Hallo\r\n\r\nNur Text.\r\n");
    expect(nachricht.text).toBe("Nur Text.");
    expect(nachricht.betreff).toBe("Hallo");
    expect(anhaenge).toEqual([]);
    expect(nachricht.gesendetAm).toMatch(/^\d{4}-/);
  });
});
