import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// `server-only` wirft ausserhalb von Next. Fuer den Test ist es ein Leermodul.
vi.mock("server-only", () => ({}));

const {
  FORMAT,
  entschluesseln,
  objektEntschluesseln,
  objektVerschluesseln,
  schluesselLaden,
  verschluesseln,
} = await import("./zugangsdaten");

const SCHLUESSEL = randomBytes(32);
const ANDERER = randomBytes(32);
const MANDANT = "aaaaaaaa-0000-0000-0000-000000000001";
const FREMD = "bbbbbbbb-0000-0000-0000-000000000002";

describe("Schluessel laden", () => {
  it("verlangt genau 32 Byte Base64", () => {
    expect(() => schluesselLaden(undefined)).toThrow(/fehlt/);
    expect(() => schluesselLaden("")).toThrow(/fehlt/);
    expect(() => schluesselLaden(randomBytes(16).toString("base64"))).toThrow(/32 Byte/);
    expect(schluesselLaden(SCHLUESSEL.toString("base64"))).toEqual(SCHLUESSEL);
  });
});

describe("Verschluesseln und Entschluesseln", () => {
  it("ist umkehrbar und haelt das Format ein", () => {
    const text = verschluesseln('{"token":"abc","geheimnis":"xyz"}', MANDANT, SCHLUESSEL);
    expect(text).toMatch(FORMAT);
    expect(text.startsWith("v1.")).toBe(true);
    expect(entschluesseln(text, MANDANT, SCHLUESSEL)).toBe('{"token":"abc","geheimnis":"xyz"}');
  });

  it("erzeugt fuer denselben Klartext jedes Mal einen anderen Geheimtext", () => {
    const a = verschluesseln("gleich", MANDANT, SCHLUESSEL);
    const b = verschluesseln("gleich", MANDANT, SCHLUESSEL);
    expect(a).not.toBe(b);
  });

  it("laesst sich NICHT fuer einen anderen Mandanten entschluesseln", () => {
    const text = verschluesseln("geheim", MANDANT, SCHLUESSEL);
    expect(() => entschluesseln(text, FREMD, SCHLUESSEL)).toThrow(/nicht entschluesselt/);
  });

  it("scheitert bei falschem Schluessel und bei Verfaelschung — mit derselben Meldung", () => {
    const text = verschluesseln("geheim", MANDANT, SCHLUESSEL);
    expect(() => entschluesseln(text, MANDANT, ANDERER)).toThrow("Die Zugangsdaten konnten nicht entschluesselt werden.");

    const teile = text.split(".");
    const letztes = teile[3]!;
    // Ein Zeichen im Geheimtext kippen.
    teile[3] = (letztes[0] === "A" ? "B" : "A") + letztes.slice(1);
    expect(() => entschluesseln(teile.join("."), MANDANT, SCHLUESSEL)).toThrow(
      "Die Zugangsdaten konnten nicht entschluesselt werden.",
    );
  });

  it("weist fremde Formate ab", () => {
    expect(() => entschluesseln("klartext", MANDANT, SCHLUESSEL)).toThrow(/kein bekanntes Format/);
    expect(() => entschluesseln("v2.a.b.c", MANDANT, SCHLUESSEL)).toThrow(/kein bekanntes Format/);
  });

  it("verpackt Objekte", () => {
    const text = objektVerschluesseln({ token: "t", geheimnis: "g" }, MANDANT, SCHLUESSEL);
    expect(objektEntschluesseln(text, MANDANT, SCHLUESSEL)).toEqual({ token: "t", geheimnis: "g" });
  });

  it("weist entschluesselte Nicht-Objekte ab", () => {
    const text = verschluesseln("[1,2]", MANDANT, SCHLUESSEL);
    expect(() => objektEntschluesseln(text, MANDANT, SCHLUESSEL)).toThrow(/nicht entschluesselt/);
  });
});
