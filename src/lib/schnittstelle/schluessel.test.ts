import { describe, expect, it } from "vitest";

import { rechteParsen, rechtReicht, schluesselAusKopf, schluesselErzeugen, schluesselHash } from "./schluessel";

describe("schluesselErzeugen", () => {
  it("liefert Klartext, Hash und sichtbaren Anfang", () => {
    const s = schluesselErzeugen();
    expect(s.schluessel).toMatch(/^io_[A-Za-z0-9_-]{32}$/);
    expect(s.hash).toBe(schluesselHash(s.schluessel));
    expect(s.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.praefix).toBe(s.schluessel.slice(0, 11));
    expect(schluesselErzeugen().schluessel).not.toBe(s.schluessel);
  });
});

describe("schluesselAusKopf", () => {
  it("nimmt nur Bearer-Schluessel mit dem Praefix", () => {
    const s = schluesselErzeugen().schluessel;
    expect(schluesselAusKopf(`Bearer ${s}`)).toBe(s);
    expect(schluesselAusKopf(`bearer ${s}`)).toBe(s);
    expect(schluesselAusKopf("Basic abc")).toBeNull();
    expect(schluesselAusKopf("Bearer sk_test_123456789012345678")).toBeNull();
    expect(schluesselAusKopf(null)).toBeNull();
    expect(schluesselAusKopf("Bearer io_kurz")).toBeNull();
  });
});

describe("Rechte", () => {
  it("stuft schreiben ueber lesen ueber keine", () => {
    expect(rechtReicht("schreiben", "lesen")).toBe(true);
    expect(rechtReicht("schreiben", "schreiben")).toBe(true);
    expect(rechtReicht("lesen", "lesen")).toBe(true);
    expect(rechtReicht("lesen", "schreiben")).toBe(false);
    expect(rechtReicht("keine", "lesen")).toBe(false);
    expect(rechtReicht(undefined, "lesen")).toBe(false);
  });

  it("liest Rechte tolerant und faellt auf keine zurueck", () => {
    expect(rechteParsen({ objekte: "schreiben", kontakte: "lesen", termine: "alles" })).toEqual({ objekte: "schreiben", kontakte: "lesen", termine: "keine" });
    expect(rechteParsen(null)).toEqual({ objekte: "keine", kontakte: "keine", termine: "keine" });
  });
});
