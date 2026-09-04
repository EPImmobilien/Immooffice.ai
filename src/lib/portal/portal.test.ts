import { describe, expect, it } from "vitest";

import { istToken, tokenErzeugen, tokenHash } from "./token";
import { einheitPreis, kundenLink, naechsterEinheitStatus, sichtbarFuer, slugAus } from "./typen";
import { antragAusFormular, antragPruefen, antragZeilen } from "./verbrauchsausweis";

describe("Kundenbereich: Token", () => {
  it("erzeugt 48-stellige Token und den passenden SHA-256-Hash", () => {
    const { token, hash } = tokenErzeugen();
    expect(token).toMatch(/^[a-f0-9]{48}$/);
    expect(hash).toBe(tokenHash(token));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(istToken(token)).toBe(true);
    expect(istToken("zu-kurz")).toBe(false);
    expect(kundenLink("https://app.example/", token)).toBe(`https://app.example/kunde/${token}`);
  });
});

describe("Projekte", () => {
  it("bildet Slugs und schaltet den Einheitenstatus", () => {
    expect(slugAus("Quartier Süd — Bauabschnitt 2")).toBe("quartier-sued-bauabschnitt-2");
    expect(slugAus("Ä")).toBe("ae");
    expect(slugAus("!")).toBe("projekt-");
    expect(naechsterEinheitStatus("verfuegbar", "kauf")).toBe("reserviert");
    expect(naechsterEinheitStatus("reserviert", "kauf")).toBe("verkauft");
    expect(naechsterEinheitStatus("verkauft", "kauf")).toBe("verfuegbar");
    expect(naechsterEinheitStatus("reserviert", "miete")).toBe("vermietet");
    expect(sichtbarFuer("interessent")).toEqual(["oeffentlich", "interessent"]);
    expect(sichtbarFuer("kaeufer")).toContain("kaeufer");
    const euro = (n: number) => `${n} €`;
    expect(einheitPreis({ kaufpreis: 389000 }, "kauf", euro)).toBe("389000 €");
    expect(einheitPreis({ miete: 1200 }, "miete", euro)).toBe("1200 € / Monat");
    expect(einheitPreis({}, "kauf", euro)).toBe("auf Anfrage");
  });
});

describe("Verbrauchsausweis-Antrag", () => {
  it("wandelt Formularwerte, prueft Pflichtfelder und fasst zusammen", () => {
    const d = antragAusFormular({ antragsteller_nachname: "Muster", baujahr_gebaeude: "1978", wohnflaeche: "142,5", solarthermie: "ja", sanierung_freitext: " Dach 2010 " });
    expect(d["baujahr_gebaeude"]).toBe(1978);
    expect(d["wohnflaeche"]).toBe(142.5);
    expect(d["solarthermie"]).toBe(true);
    expect(d["sanierung_dach"]).toBe(false);
    expect(d["sanierung_freitext"]).toBe("Dach 2010");
    expect(d["antragsteller_vorname"]).toBeNull();
    const fehlt = antragPruefen(d);
    expect(fehlt).toContain("Straße und Hausnummer");
    expect(fehlt).toContain("Energieträger Heizung");
    expect(fehlt).not.toContain("Nachname / Firma");
    const zeilen = antragZeilen(d);
    expect(zeilen.find((z) => z.beschriftung === "Wohnfläche gesamt")?.wert).toBe("142,5 m²");
    expect(zeilen.find((z) => z.beschriftung === "Solarthermie vorhanden")?.wert).toBe("Ja");
    expect(zeilen.some((z) => z.beschriftung === "Dach / oberste Geschossdecke gedämmt")).toBe(false);
  });
});
