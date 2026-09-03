import { describe, expect, it } from "vitest";

import { nachrichtZeile, verlaufsEintrag } from "./abgleich";
import type { EingangsNachricht } from "./typen";

const postfach = { id: "pf1", mandant_id: "m1" };
const nachricht: EingangsNachricht = {
  externId: "x1",
  messageId: "<x1@beispiel.invalid>",
  inReplyTo: null,
  threadId: null,
  von: { adresse: "kunde@beispiel.invalid", name: "Kunde" },
  an: [{ adresse: "info@makler.invalid" }],
  cc: [],
  betreff: "Objekt 0042",
  text: "Hallo,\n\nwann ist Besichtigung?",
  gesendetAm: "2026-09-01T08:00:00.000Z",
  gelesen: false,
  anhaenge: [{ externId: "a1", dateiname: "x.pdf", mime: "application/pdf", bytes: 10 }],
};

describe("nachrichtZeile", () => {
  it("bildet die Zeile mit Vorschau, Adressen und Zuordnung", () => {
    const zeile = nachrichtZeile(postfach, nachricht, {
      kontaktId: "k1",
      objektId: "o1",
      zuordnungArt: "automatisch",
      vorschlag: { objektId: "o1", konfidenz: 96, grund: "Objektnummer 0042 im Text" },
    });
    expect(zeile).toMatchObject({
      mandant_id: "m1",
      postfach_id: "pf1",
      ordner: "eingang",
      extern_id: "x1",
      von_adresse: "kunde@beispiel.invalid",
      von_name: "Kunde",
      an: [{ adresse: "info@makler.invalid" }],
      vorschau: "Hallo, wann ist Besichtigung?",
      hat_anhaenge: true,
      kontakt_id: "k1",
      objekt_id: "o1",
      zuordnung_art: "automatisch",
      objekt_vorschlag_konfidenz: 96,
    });
  });

  it("laesst Zuordnungsfelder leer, wenn nichts erkannt wurde", () => {
    const zeile = nachrichtZeile(postfach, { ...nachricht, von: null, text: null, anhaenge: [] }, { kontaktId: null, objektId: null, zuordnungArt: null, vorschlag: null });
    expect(zeile).toMatchObject({ von_adresse: null, vorschau: null, hat_anhaenge: false, objekt_id: null, objekt_vorschlag_id: null });
  });
});

describe("verlaufsEintrag", () => {
  it("schreibt einen E-Mail-Eintrag mit Bezug und Herkunft", () => {
    const e = verlaufsEintrag(postfach, nachricht, { kontaktId: "k1", objektId: "o1", zuordnungArt: "automatisch", vorschlag: { objektId: "o1", konfidenz: 96, grund: "g" } }, "n1");
    expect(e).toMatchObject({ typ: "email", objekt_id: "o1", kontakt_id: "k1", beschreibung: "E-Mail von kunde@beispiel.invalid: Objekt 0042" });
    expect(e["metadaten"]).toMatchObject({ nachricht_id: "n1", zuordnung: "automatisch", konfidenz: 96 });
  });
});
