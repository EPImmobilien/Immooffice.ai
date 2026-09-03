import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { kontextErzeugen } from "../kern/connector";
import { AKTION, FEHLER_UNBEKANNTES_FELD, anfrageBauen, aufrufen, signatur, type Aktionsergebnis } from "./api";
import { felderPruefen, onOfficeConnector } from "./connector";
import { OBJEKT_KANDIDATENFELDER, OBJEKT_PFLICHTFELDER, kontaktAusOnOffice, objektAusOnOffice, objektNachOnOffice } from "./mapping";

const ZUGANG = { token: "token-0123456789abcdef", geheimnis: "geheimnis-0123456789abcdef" };
const JETZT = new Date("2026-09-03T12:00:00Z");

/** Baut eine fetch-Attrappe, die je Aktion antwortet und alle Anfragen mitschreibt. */
function fetchAttrappe(
  antwort: (aktion: { actionid: string; resourcetype: string; parameters: Record<string, unknown>; resourceid: string }) => Aktionsergebnis,
) {
  const anfragen: unknown[] = [];
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const koerper = JSON.parse(String(init?.body)) as {
      request: { actions: Array<{ actionid: string; resourcetype: string; parameters: Record<string, unknown>; resourceid: string }> };
    };
    anfragen.push(koerper);
    const results = koerper.request.actions.map(antwort);
    return new Response(JSON.stringify({ status: { code: 200, errorcode: 0 }, response: { results } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, anfragen };
}

function ok(actionid: string, resourcetype: string, records: Aktionsergebnis["data"]["records"], gesamt?: number): Aktionsergebnis {
  return { actionid, resourcetype, status: { errorcode: 0 }, data: { meta: { cntabsolute: gesamt ?? records.length }, records } };
}

describe("Signatur", () => {
  it("entspricht HMAC-Version 2: sha256(zeit+token+resourcetype+actionid), Base64", () => {
    const erwartet = createHmac("sha256", ZUGANG.geheimnis)
      .update(`1756900800${ZUGANG.token}estate${AKTION.lesen}`)
      .digest("base64");
    expect(signatur(ZUGANG, 1756900800, "estate", AKTION.lesen)).toBe(erwartet);
  });

  it("der Anfragekoerper traegt Token und Signatur, aber nie das Geheimnis", () => {
    const koerper = anfrageBauen(ZUGANG, [{ actionid: AKTION.lesen, resourcetype: "estate" }], 1756900800);
    const text = JSON.stringify(koerper);
    expect(text).toContain(ZUGANG.token);
    expect(text).not.toContain(ZUGANG.geheimnis);
    expect(koerper).toMatchObject({
      request: { actions: [{ hmac_version: 2, timestamp: 1756900800, resourcetype: "estate", identifier: "", resourceid: "" }] },
    });
  });

  it("uebersetzt Fehler der Schnittstelle in Nutzersprache ohne Rohdaten", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: { code: 500, errorcode: 11, message: "token XYZ invalid, user 4711" } }), { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
    await expect(aufrufen(ZUGANG, [{ actionid: AKTION.lesen, resourcetype: "estate" }], { fetch, jetzt: () => JETZT })).rejects.toThrow(
      /Token oder Geheimnis/,
    );
    await expect(aufrufen(ZUGANG, [{ actionid: AKTION.lesen, resourcetype: "estate" }], { fetch, jetzt: () => JETZT })).rejects.not.toThrow(
      /4711/,
    );
  });
});

describe("Mapping", () => {
  it("bildet einen onOffice-Datensatz auf das kanonische Objekt ab", () => {
    const o = objektAusOnOffice(4711, {
      objektnr_extern: "K-2026-17",
      objekttitel: "Reihenhaus mit Garten",
      objektart: "haus",
      objekttyp: "Reihenmittelhaus",
      vermarktungsart: "kauf",
      nutzungsart: "wohnen",
      strasse: "Gartenweg",
      hausnummer: "4",
      plz: "24118",
      ort: "Kiel",
      land: "DEU",
      kaufpreis: "425000.00",
      kaltmiete: "",
      wohnflaeche: "118,5",
      anzahl_zimmer: "4.5",
      baujahr: "1998",
      energieausweistyp: "Bedarfsausweis",
      endenergiebedarf: "87",
      energyClass: "b",
      objektbeschreibung: "Schön.",
      Aenderung: "2026-09-02 08:15:00",
    });
    expect(o.fremd_id).toBe("4711");
    expect(o.objektnummer).toBe("K-2026-17");
    expect(o.objektkategorie).toBe("haus");
    expect(o.objektart).toBe("reihenmittelhaus");
    expect(o.vermarktungsart).toBe("kauf");
    expect(o.land).toBe("DE");
    expect(o.kaufpreis).toBe(425000);
    expect(o.kaltmiete).toBeNull();
    expect(o.wohnflaeche).toBe(118.5);
    expect(o.zimmer).toBe(4.5);
    expect(o.baujahr).toBe(1998);
    expect(o.energieausweis_typ).toBe("bedarf");
    expect(o.energie_kennwert).toBe(87);
    expect(o.energie_klasse).toBe("B");
    expect(o.geaendert_am_fremd).toBe("2026-09-02T08:15:00");
  });

  it("sendet keine leeren Felder, damit onOffice nichts loescht", () => {
    const o = objektAusOnOffice(1, { objekttitel: "Nur Titel", vermarktungsart: "miete" });
    const d = objektNachOnOffice(o);
    expect(d).toEqual({ objekttitel: "Nur Titel", vermarktungsart: "miete", nutzungsart: "wohnen", objektart: "sonstige", land: "DE" });
  });

  it("trennt Strasse und Hausnummer einer Adresse", () => {
    const k = kontaktAusOnOffice(9, { Vorname: "Erika", Name: "Muster", Email: "Erika@Example.org", Strasse: "Am Markt 12a", Plz: "24103", Ort: "Kiel" });
    expect(k).toMatchObject({ vorname: "Erika", nachname: "Muster", email: "erika@example.org", strasse: "Am Markt", hausnummer: "12a" });
  });

  it("Pflicht- und Kandidatenfelder ueberschneiden sich nicht", () => {
    const pflicht = new Set<string>(OBJEKT_PFLICHTFELDER);
    for (const f of OBJEKT_KANDIDATENFELDER) expect(pflicht.has(f)).toBe(false);
  });
});

describe("Feldpruefung (Verhalten aus der Referenz: Fehler 141 je unbekanntem Feld)", () => {
  it("prueft jedes Kandidatenfeld einzeln und merkt sich nur die gueltigen", async () => {
    const unbekannt = new Set(["energyClass", "kaufpreis_auf_anfrage"]);
    const { fetch, anfragen } = fetchAttrappe((a) => {
      const feld = (a.parameters["data"] as string[])[0]!;
      if (unbekannt.has(feld)) {
        return { actionid: a.actionid, resourcetype: a.resourcetype, status: { errorcode: FEHLER_UNBEKANNTES_FELD }, data: { records: [] } };
      }
      return ok(a.actionid, a.resourcetype, [{ id: 1, type: "estate", elements: { [feld]: "x" } }]);
    });
    const kontext = kontextErzeugen({ mandantId: "m", integrationId: "i", zugangsdaten: ZUGANG, fetch, jetzt: () => JETZT });

    const felder = await felderPruefen(kontext);
    expect(anfragen).toHaveLength(OBJEKT_KANDIDATENFELDER.length);
    expect(felder).toHaveLength(OBJEKT_KANDIDATENFELDER.length - unbekannt.size);
    expect(felder).not.toContain("energyClass");
    expect(kontext.konfig["felder"]).toEqual(felder);
    expect(kontext.konfig["felder_geprueft_am"]).toBe(JETZT.toISOString());
  });

  it("bricht bei Anmeldefehlern ab, statt alle Felder als unbekannt zu werten", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: { code: 500, errorcode: 11 } }), { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
    const kontext = kontextErzeugen({ mandantId: "m", integrationId: "i", zugangsdaten: ZUGANG, fetch, jetzt: () => JETZT });
    await expect(felderPruefen(kontext)).rejects.toThrow(/Token oder Geheimnis/);
  });
});

describe("Connector", () => {
  it("verlangt Token und Geheimnis", () => {
    expect(onOfficeConnector.zugangsdatenSchema.safeParse({}).success).toBe(false);
    expect(onOfficeConnector.zugangsdatenSchema.safeParse({ token: "kurz", geheimnis: "kurz" }).success).toBe(false);
    expect(onOfficeConnector.zugangsdatenSchema.safeParse(ZUGANG).success).toBe(true);
  });

  it("Verbindung pruefen liest je ein Objekt und eine Adresse und zaehlt", async () => {
    const { fetch } = fetchAttrappe((a) =>
      ok(a.actionid, a.resourcetype, [{ id: 1, type: a.resourcetype, elements: {} }], a.resourcetype === "estate" ? 412 : 1380),
    );
    const kontext = kontextErzeugen({ mandantId: "m", integrationId: "i", zugangsdaten: ZUGANG, fetch, jetzt: () => JETZT });
    const ergebnis = await onOfficeConnector.verbindungPruefen(kontext);
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.meldung).toContain("412 Objekte");
    expect(ergebnis.details).toEqual({ objekte: 412, adressen: 1380 });
  });

  it("Objekte holen nutzt geprueften Feldsatz, seitet und ergaenzt Bilder", async () => {
    const { fetch, anfragen } = fetchAttrappe((a) => {
      if (a.resourcetype === "estate") {
        return ok(a.actionid, "estate", [
          { id: 10, type: "estate", elements: { objekttitel: "A", vermarktungsart: "kauf", objektart: "wohnung", kaufpreis: "1" } },
          { id: 11, type: "estate", elements: { objekttitel: "B", vermarktungsart: "miete", objektart: "haus", kaltmiete: "2" } },
        ], 250);
      }
      return ok(a.actionid, "estatepictures", [
        { id: 900, type: "estatepictures", elements: { estateid: 10, url: "https://bilder.example/10-2.jpg", type: "Foto", position: 2 } },
        { id: 901, type: "estatepictures", elements: { estateid: 10, url: "https://bilder.example/10-1.jpg", type: "Titelbild", position: 1 } },
      ]);
    });
    const kontext = kontextErzeugen({
      mandantId: "m",
      integrationId: "i",
      zugangsdaten: ZUGANG,
      konfig: { felder: ["objektbeschreibung", "lage"] },
      fetch,
      jetzt: () => JETZT,
    });

    const ergebnis = await onOfficeConnector.objekteHolen!(kontext, { seite: 1, seitengroesse: 100 });
    expect(ergebnis.datensaetze.map((o) => o.fremd_id)).toEqual(["10", "11"]);
    expect(ergebnis.weitere).toBe(true);
    expect(ergebnis.fehler).toEqual([]);

    // Keine Feldpruefung, weil konfig.felder vorhanden: erste Anfrage ist der Lesezugriff.
    const erste = (anfragen[0] as { request: { actions: Array<{ parameters: Record<string, unknown> }> } }).request.actions[0]!.parameters;
    expect(erste["data"]).toEqual([...OBJEKT_PFLICHTFELDER, "objektbeschreibung", "lage"]);
    expect(erste["listoffset"]).toBe(100);

    const bilder = ergebnis.datensaetze[0]!.bilder;
    expect(bilder.map((b) => b.url)).toEqual(["https://bilder.example/10-1.jpg", "https://bilder.example/10-2.jpg"]);
    expect(bilder[0]!.gruppe).toBe("Titelbild");
    expect(ergebnis.datensaetze[1]!.bilder).toEqual([]);
  });

  it("Senden: neu anlegen und aendern, ein Fehler stoppt den Lauf nicht", async () => {
    const { fetch } = fetchAttrappe((a) => {
      if (a.actionid === AKTION.anlegen) return ok(a.actionid, a.resourcetype, [{ id: 777, type: "estate", elements: {} }]);
      if (a.resourceid === "kaputt") {
        return { actionid: a.actionid, resourcetype: a.resourcetype, status: { errorcode: 143 }, data: { records: [] } };
      }
      return ok(a.actionid, a.resourcetype, []);
    });
    const kontext = kontextErzeugen({ mandantId: "m", integrationId: "i", zugangsdaten: ZUGANG, fetch, jetzt: () => JETZT });

    const basis = objektAusOnOffice("x", { objekttitel: "T", vermarktungsart: "kauf" });
    const ergebnis = await onOfficeConnector.objekteSenden!(kontext, [
      { ...basis, fremd_id: "L1", lokal_id: "L1" }, // neu: fremd_id == lokal_id
      { ...basis, fremd_id: "55", lokal_id: "L2" }, // vorhanden
      { ...basis, fremd_id: "kaputt", lokal_id: "L3" },
    ]);
    expect(ergebnis.angelegt).toEqual([{ lokal_id: "L1", fremd_id: "777" }]);
    expect(ergebnis.geaendert).toEqual(["L2"]);
    expect(ergebnis.fehler).toHaveLength(1);
    expect(ergebnis.fehler[0]).toMatchObject({ fremd_id: "kaputt" });
    expect(ergebnis.fehler[0]!.meldung).toMatch(/143/);
  });

  it("Adressen ohne Nachname und Firma werden gemeldet, nicht uebernommen", async () => {
    const { fetch } = fetchAttrappe((a) =>
      ok(a.actionid, a.resourcetype, [
        { id: 1, type: "address", elements: { Vorname: "Nur", Name: "", Firma: "" } },
        { id: 2, type: "address", elements: { Name: "Muster", Email: "m@example.org" } },
      ]),
    );
    const kontext = kontextErzeugen({ mandantId: "m", integrationId: "i", zugangsdaten: ZUGANG, fetch, jetzt: () => JETZT });
    const ergebnis = await onOfficeConnector.kontakteHolen!(kontext, {});
    expect(ergebnis.datensaetze.map((k) => k.fremd_id)).toEqual(["2"]);
    expect(ergebnis.fehler[0]).toMatchObject({ typ: "kontakt", fremd_id: "1" });
  });
});
