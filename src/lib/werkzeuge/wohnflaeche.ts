/**
 * Wohnflaechenberechnung nach der Wohnflaechenverordnung (WoFlV):
 * Grundflaechen nach lichten Massen (§ 3 Abs. 4); Anrechnung (§ 4): lichte
 * Hoehe ab 2 m voll, 1 m bis unter 2 m zur Haelfte, unter 1 m nicht;
 * unbeheizte Wintergaerten, Schwimmbaeder und aehnliche geschlossene Raeume
 * zur Haelfte; Balkone, Loggien, Dachgaerten und Terrassen in der Regel zu
 * einem Viertel, hoechstens zur Haelfte. Nicht zur Wohnflaeche gehoeren
 * Zubehoerraeume (Keller, Abstellraeume ausserhalb der Wohnung, Waschkueche,
 * Garage …) und Geschaeftsraeume (§ 2 Abs. 3).
 */

export const TEILART = {
  voll: { bezeichnung: "Voll (lichte Höhe ab 2 m)", faktor: 1 },
  halb: { bezeichnung: "Halb (Dachschräge 1 m bis unter 2 m)", faktor: 0.5 },
  null: { bezeichnung: "Nicht anrechenbar (unter 1 m)", faktor: 0 },
  wintergarten: { bezeichnung: "Unbeheizter Wintergarten / Schwimmbad (½)", faktor: 0.5 },
  balkon: { bezeichnung: "Balkon, Loggia, Terrasse (¼)", faktor: 0.25 },
  balkon_halb: { bezeichnung: "Balkon/Terrasse hochwertig (½)", faktor: 0.5 },
  zubehoer: { bezeichnung: "Zubehörraum (Keller, Garage …) — keine Wohnfläche", faktor: 0 },
} as const;
export type Teilart = keyof typeof TEILART;

export interface Teilflaeche {
  id: string;
  bezeichnung: string;
  /** Laenge und Breite in Metern — oder direkt die Flaeche */
  laenge: number | null;
  breite: number | null;
  flaeche: number | null;
  art: Teilart;
  /** Abzug (z. B. Schornstein, Pfeiler ueber 0,1 m² und ueber 1,5 m Hoehe, § 3 Abs. 3) */
  abzug: boolean;
}

export interface Raum {
  id: string;
  name: string;
  teile: Teilflaeche[];
}

export interface Geschoss {
  id: string;
  name: string;
  raeume: Raum[];
}

export interface Wohnflaechenblatt {
  bezeichnung: string;
  adresse: string;
  hinweis: string;
  geschosse: Geschoss[];
}

let zaehler = 0;
export function neueId(praefix = "w"): string {
  zaehler += 1;
  return `${praefix}${Date.now().toString(36)}${zaehler}`;
}

export function neuesTeil(art: Teilart = "voll", bezeichnung = ""): Teilflaeche {
  return { id: neueId("t"), bezeichnung, laenge: null, breite: null, flaeche: null, art, abzug: false };
}
export function neuerRaum(name = "Raum"): Raum {
  return { id: neueId("r"), name, teile: [neuesTeil("voll")] };
}
export function neuesGeschoss(name = "Erdgeschoss"): Geschoss {
  return { id: neueId("g"), name, raeume: [neuerRaum("Wohnzimmer")] };
}
export function leeresBlatt(): Wohnflaechenblatt {
  return { bezeichnung: "", adresse: "", hinweis: "", geschosse: [neuesGeschoss()] };
}

/** Grundflaeche eines Teils (m², zwei Nachkommastellen). */
export function teilGrundflaeche(t: Pick<Teilflaeche, "laenge" | "breite" | "flaeche">): number {
  const f = t.flaeche !== null && t.flaeche !== undefined ? t.flaeche : t.laenge !== null && t.breite !== null ? t.laenge * t.breite : 0;
  return Math.round(Math.max(0, f) * 100) / 100;
}

export function teilAnrechenbar(t: Teilflaeche): number {
  const g = teilGrundflaeche(t);
  const a = Math.round(g * TEILART[t.art].faktor * 100) / 100;
  return t.abzug ? -a : a;
}

export interface Ergebnis {
  wohnflaeche: number;
  grundflaeche: number;
  geschosse: Array<{ id: string; name: string; wohnflaeche: number; raeume: Array<{ id: string; name: string; grundflaeche: number; wohnflaeche: number }> }>;
}

export function berechnen(blatt: Wohnflaechenblatt): Ergebnis {
  let gesamt = 0;
  let grund = 0;
  const geschosse = blatt.geschosse.map((g) => {
    let gWohn = 0;
    const raeume = g.raeume.map((r) => {
      let rGrund = 0;
      let rWohn = 0;
      for (const t of r.teile) {
        const gf = teilGrundflaeche(t);
        rGrund += t.abzug ? -gf : gf;
        rWohn += teilAnrechenbar(t);
      }
      rGrund = Math.round(rGrund * 100) / 100;
      rWohn = Math.round(rWohn * 100) / 100;
      gWohn += rWohn;
      grund += rGrund;
      return { id: r.id, name: r.name, grundflaeche: rGrund, wohnflaeche: rWohn };
    });
    gWohn = Math.round(gWohn * 100) / 100;
    gesamt += gWohn;
    return { id: g.id, name: g.name, wohnflaeche: gWohn, raeume };
  });
  return { wohnflaeche: Math.round(gesamt * 100) / 100, grundflaeche: Math.round(grund * 100) / 100, geschosse };
}

export function m2(n: number): string {
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

/** Gespeichertes JSON tolerant lesen. */
export function blattLesen(roh: unknown): Wohnflaechenblatt {
  const b = (roh && typeof roh === "object" ? roh : {}) as Partial<Wohnflaechenblatt>;
  const arten = Object.keys(TEILART) as Teilart[];
  const zahl = (w: unknown): number | null => (w === null || w === undefined || w === "" ? null : Number.isFinite(Number(w)) ? Number(w) : null);
  return {
    bezeichnung: typeof b.bezeichnung === "string" ? b.bezeichnung : "",
    adresse: typeof b.adresse === "string" ? b.adresse : "",
    hinweis: typeof b.hinweis === "string" ? b.hinweis : "",
    geschosse: Array.isArray(b.geschosse) && b.geschosse.length > 0
      ? b.geschosse.map((g, gi) => ({
          id: typeof g.id === "string" ? g.id : `g${gi}`,
          name: typeof g.name === "string" ? g.name : "Geschoss",
          raeume: Array.isArray(g.raeume) ? g.raeume.map((r, ri) => ({
            id: typeof r.id === "string" ? r.id : `r${gi}-${ri}`,
            name: typeof r.name === "string" ? r.name : "Raum",
            teile: Array.isArray(r.teile) ? r.teile.map((t, ti) => ({
              id: typeof t.id === "string" ? t.id : `t${gi}-${ri}-${ti}`,
              bezeichnung: typeof t.bezeichnung === "string" ? t.bezeichnung : "",
              laenge: zahl(t.laenge), breite: zahl(t.breite), flaeche: zahl(t.flaeche),
              art: arten.includes(t.art as Teilart) ? (t.art as Teilart) : "voll",
              abzug: Boolean(t.abzug),
            })) : [],
          })) : [],
        }))
      : [neuesGeschoss()],
  };
}

/** Raeume aus einem Grundriss (Polygone in cm) uebernehmen. */
export function ausGrundriss(raeume: Array<{ name: string; flaecheM2: number }>, blatt: Wohnflaechenblatt): Wohnflaechenblatt {
  const geschoss = blatt.geschosse[0] ?? neuesGeschoss();
  const neue: Raum[] = raeume.map((r) => ({ id: neueId("r"), name: r.name, teile: [{ ...neuesTeil("voll"), flaeche: Math.round(r.flaecheM2 * 100) / 100, bezeichnung: "aus Grundriss" }] }));
  return { ...blatt, geschosse: [{ ...geschoss, raeume: [...geschoss.raeume.filter((r) => r.teile.some((t) => teilGrundflaeche(t) > 0)), ...neue] }, ...blatt.geschosse.slice(1)] };
}
