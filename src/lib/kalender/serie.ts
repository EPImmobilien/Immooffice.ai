import { monatPlus, tagPlus, wochenstart } from "./zeit";

/**
 * Serientermine: Eine Serie wird ausgeschrieben — jeder Termin ist eine
 * eigene Zeile in `termine`, zusammengehalten durch `serie_id`. Die Regel
 * liegt als JSON an jedem Termin, damit der Dialog sie im Klartext zeigt.
 */

export const SERIE_MAX = 200;
/** Drei Jahre — danach ist es keine Planung mehr. */
export const SERIE_TAGE_MAX = 1095;

export const SERIE_WAHL = {
  keine: "Einmalig",
  tag: "Täglich",
  woche: "Wöchentlich",
  woche2: "Alle 2 Wochen",
  monat: "Monatlich",
  monat3: "Vierteljährlich",
  jahr: "Jährlich",
  eigen: "Eigener Turnus …",
} as const;
export type SerieWahl = keyof typeof SERIE_WAHL;

export const SERIE_EINHEIT = { tag: "Tage", woche: "Wochen", monat: "Monate", jahr: "Jahre" } as const;
export type SerieTakt = keyof typeof SERIE_EINHEIT;

export const WOCHENTAGE: ReadonlyArray<readonly [string, number]> = [["Mo", 1], ["Di", 2], ["Mi", 3], ["Do", 4], ["Fr", 5], ["Sa", 6], ["So", 7]];

export interface SerienRegel {
  takt: SerieTakt;
  intervall: number;
  /** Nur bei takt = woche: 1 = Montag … 7 = Sonntag; leer = Wochentag des Starts */
  wochentage: number[];
  ende_art: "anzahl" | "datum";
  anzahl: number;
  bis: string | null;
}

export function serieStandard(): SerienRegel {
  return { takt: "woche", intervall: 1, wochentage: [], ende_art: "anzahl", anzahl: 10, bis: null };
}

/** Schnellwahl → Regel (eigen behaelt die uebergebene Regel). */
export function regelAusWahl(wahl: SerieWahl, eigen: SerienRegel): SerienRegel | null {
  switch (wahl) {
    case "keine": return null;
    case "tag": return { ...eigen, takt: "tag", intervall: 1, wochentage: [] };
    case "woche": return { ...eigen, takt: "woche", intervall: 1 };
    case "woche2": return { ...eigen, takt: "woche", intervall: 2 };
    case "monat": return { ...eigen, takt: "monat", intervall: 1, wochentage: [] };
    case "monat3": return { ...eigen, takt: "monat", intervall: 3, wochentage: [] };
    case "jahr": return { ...eigen, takt: "jahr", intervall: 1, wochentage: [] };
    case "eigen": return eigen;
  }
}

/** Alle Kalendertage der Serie ab dem Starttag (einschliesslich). */
export function serienDaten(start: string, regel: SerienRegel): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const intervall = Math.min(Math.max(Math.round(Number(regel.intervall) || 1), 1), 52);
  const grenze = tagPlus(start, SERIE_TAGE_MAX);
  const bis = regel.ende_art === "datum" && regel.bis ? (regel.bis < grenze ? regel.bis : grenze) : grenze;
  const anzahl = regel.ende_art === "anzahl" ? Math.min(Math.max(Math.round(Number(regel.anzahl) || 1), 1), SERIE_MAX) : SERIE_MAX;
  const wochentage = [...new Set((regel.wochentage ?? []).map(Number).filter((n) => n >= 1 && n <= 7))].sort((a, b) => a - b);
  const aus: string[] = [];
  if (regel.takt === "woche" && wochentage.length > 0) {
    const montag = wochenstart(start);
    for (let w = 0; w < 300 && aus.length < anzahl; w += intervall) {
      let fertig = false;
      for (const wt of wochentage) {
        const d = tagPlus(montag, w * 7 + (wt - 1));
        if (d < start) continue;
        if (d > bis) { fertig = true; break; }
        aus.push(d);
        if (aus.length >= anzahl) break;
      }
      if (fertig) break;
    }
    return aus;
  }
  // Immer vom Start aus rechnen: der 31. bleibt der 31., wo es ihn gibt.
  for (let i = 0; i < SERIE_MAX && aus.length < anzahl; i++) {
    const d = regel.takt === "tag" ? tagPlus(start, i * intervall) : regel.takt === "woche" ? tagPlus(start, 7 * i * intervall) : regel.takt === "monat" ? monatPlus(start, i * intervall) : monatPlus(start, 12 * i * intervall);
    if (d > bis) break;
    aus.push(d);
  }
  return aus;
}

/** Klartext einer Regel — steht im Dialog eines Serientermins. */
export function serieText(regel: SerienRegel | null | undefined): string {
  if (!regel) return "";
  const n = Math.max(1, Number(regel.intervall) || 1);
  const takt = regel.takt === "tag" ? (n === 1 ? "täglich" : `alle ${n} Tage`)
    : regel.takt === "woche" ? (n === 1 ? "wöchentlich" : `alle ${n} Wochen`)
    : regel.takt === "monat" ? (n === 1 ? "monatlich" : `alle ${n} Monate`)
    : n === 1 ? "jährlich" : `alle ${n} Jahre`;
  const tage = regel.wochentage?.length ? ` (${regel.wochentage.map((w) => WOCHENTAGE.find((x) => x[1] === Number(w))?.[0] ?? "?").join(", ")})` : "";
  const ende = regel.ende_art === "datum" && regel.bis ? `, bis ${regel.bis.split("-").reverse().join(".")}` : regel.ende_art === "anzahl" ? `, ${regel.anzahl}-mal` : "";
  return `${takt}${tage}${ende}`;
}

/** Regel aus gespeichertem JSON lesen (tolerant gegen fehlende Felder). */
export function regelLesen(roh: unknown): SerienRegel | null {
  if (!roh || typeof roh !== "object") return null;
  const r = roh as Partial<SerienRegel>;
  const takt = (["tag", "woche", "monat", "jahr"] as const).includes(r.takt as SerieTakt) ? (r.takt as SerieTakt) : "woche";
  return {
    takt,
    intervall: Math.max(1, Number(r.intervall) || 1),
    wochentage: Array.isArray(r.wochentage) ? r.wochentage.map(Number).filter((n) => n >= 1 && n <= 7) : [],
    ende_art: r.ende_art === "datum" ? "datum" : "anzahl",
    anzahl: Math.max(1, Number(r.anzahl) || 1),
    bis: typeof r.bis === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.bis) ? r.bis : null,
  };
}
