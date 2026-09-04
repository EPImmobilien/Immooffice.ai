/**
 * Grundriss-Datenmodell (Editor, Aufbereiter, Raumscan-Import). Alle Masse
 * in Zentimetern, Ursprung oben links, y nach unten. Das Modell ist bewusst
 * einfach: Waende als Strecken, Tueren/Fenster auf Waenden, Raeume als
 * Polygone mit Namen, Moebel als Rechtecke, Masslinien, Texte.
 */

export interface Punkt { x: number; y: number }

export interface Wand { id: string; a: Punkt; b: Punkt; staerke: number }
export interface Oeffnung { id: string; art: "tuer" | "fenster"; wand_id: string; /** 0..1 entlang der Wand */ position: number; breite: number; anschlag?: "links" | "rechts" }
export interface Raum { id: string; name: string; polygon: Punkt[] }
export interface Moebel { id: string; art: MoebelArt; x: number; y: number; breite: number; tiefe: number; drehung: number }
export interface Mass { id: string; a: Punkt; b: Punkt }
export interface Text { id: string; x: number; y: number; text: string; groesse: number }

export const MOEBEL = {
  bett: { bezeichnung: "Bett", breite: 180, tiefe: 200 },
  einzelbett: { bezeichnung: "Einzelbett", breite: 90, tiefe: 200 },
  sofa: { bezeichnung: "Sofa", breite: 220, tiefe: 90 },
  tisch: { bezeichnung: "Tisch", breite: 160, tiefe: 90 },
  schrank: { bezeichnung: "Schrank", breite: 200, tiefe: 60 },
  kueche: { bezeichnung: "Küchenzeile", breite: 300, tiefe: 60 },
  badewanne: { bezeichnung: "Badewanne", breite: 170, tiefe: 75 },
  dusche: { bezeichnung: "Dusche", breite: 90, tiefe: 90 },
  wc: { bezeichnung: "WC", breite: 40, tiefe: 60 },
  waschbecken: { bezeichnung: "Waschbecken", breite: 60, tiefe: 45 },
  treppe: { bezeichnung: "Treppe", breite: 100, tiefe: 300 },
  schreibtisch: { bezeichnung: "Schreibtisch", breite: 140, tiefe: 70 },
} as const;
export type MoebelArt = keyof typeof MOEBEL;

export interface Grundriss {
  titel: string;
  /** Rastermass in cm */
  raster: number;
  waende: Wand[];
  oeffnungen: Oeffnung[];
  raeume: Raum[];
  moebel: Moebel[];
  masse: Mass[];
  texte: Text[];
  /** Hinterlegter Plan (Aufbereiter): Data-URL oder Speicherpfad, Skalierung cm je Pixel, Versatz */
  vorlage?: { quelle: string; cmJePixel: number; x: number; y: number; deckkraft: number; breitePx: number; hoehePx: number } | null;
}

let zaehler = 0;
export function neueId(praefix: string): string {
  zaehler += 1;
  return `${praefix}${Date.now().toString(36)}${zaehler}`;
}

export function leererGrundriss(titel = "Grundriss"): Grundriss {
  return { titel, raster: 10, waende: [], oeffnungen: [], raeume: [], moebel: [], masse: [], texte: [], vorlage: null };
}

/** Flaeche eines Polygons in m² (Gauss'sche Trapezformel), Masse in cm. */
export function polygonFlaecheM2(p: Punkt[]): number {
  if (p.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.round((Math.abs(s) / 2 / 10_000) * 100) / 100;
}

export function wandLaenge(w: Wand): number {
  return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
}

export function punktAufWand(w: Wand, position: number): Punkt {
  return { x: w.a.x + (w.b.x - w.a.x) * position, y: w.a.y + (w.b.y - w.a.y) * position };
}

export function amRaster(wert: number, raster: number): number {
  return Math.round(wert / raster) * raster;
}

/** Bounding-Box aller Elemente (fuer Export und Ansicht), mit Rand. */
export function ausdehnung(g: Grundriss, rand = 100): { x: number; y: number; breite: number; hoehe: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of g.waende) { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); }
  for (const r of g.raeume) for (const p of r.polygon) { xs.push(p.x); ys.push(p.y); }
  for (const m of g.moebel) { xs.push(m.x, m.x + m.breite); ys.push(m.y, m.y + m.tiefe); }
  for (const m of g.masse) { xs.push(m.a.x, m.b.x); ys.push(m.a.y, m.b.y); }
  for (const t of g.texte) { xs.push(t.x); ys.push(t.y); }
  if (xs.length === 0) return { x: 0, y: 0, breite: 1000, hoehe: 800 };
  const minX = Math.min(...xs) - rand;
  const minY = Math.min(...ys) - rand;
  return { x: minX, y: minY, breite: Math.max(...xs) + rand - minX, hoehe: Math.max(...ys) + rand - minY };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** SVG-Zeichnung (auch Grundlage fuer PNG/PDF-Export). */
export function grundrissSvg(g: Grundriss, optionen: { masse?: boolean; raumnamen?: boolean; moebel?: boolean; hintergrund?: boolean } = {}): string {
  const o = { masse: true, raumnamen: true, moebel: true, hintergrund: true, ...optionen };
  const box = ausdehnung(g);
  const teile: string[] = [];
  if (o.hintergrund) teile.push(`<rect x="${box.x}" y="${box.y}" width="${box.breite}" height="${box.hoehe}" fill="#ffffff"/>`);
  for (const r of g.raeume) {
    if (r.polygon.length < 3) continue;
    const pts = r.polygon.map((p) => `${p.x},${p.y}`).join(" ");
    teile.push(`<polygon points="${pts}" fill="#f5f2ea" stroke="none"/>`);
    if (o.raumnamen) {
      const cx = r.polygon.reduce((s, p) => s + p.x, 0) / r.polygon.length;
      const cy = r.polygon.reduce((s, p) => s + p.y, 0) / r.polygon.length;
      teile.push(`<text x="${cx}" y="${cy - 8}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#1B2A47">${esc(r.name)}</text>`);
      teile.push(`<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#7A828C">${polygonFlaecheM2(r.polygon).toLocaleString("de-DE", { minimumFractionDigits: 2 })} m²</text>`);
    }
  }
  if (o.moebel) {
    for (const m of g.moebel) {
      teile.push(`<g transform="rotate(${m.drehung} ${m.x + m.breite / 2} ${m.y + m.tiefe / 2})"><rect x="${m.x}" y="${m.y}" width="${m.breite}" height="${m.tiefe}" fill="#ffffff" stroke="#7A828C" stroke-width="2" rx="4"/><text x="${m.x + m.breite / 2}" y="${m.y + m.tiefe / 2 + 5}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#7A828C">${esc(MOEBEL[m.art].bezeichnung)}</text></g>`);
    }
  }
  for (const w of g.waende) {
    teile.push(`<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="#1B2A47" stroke-width="${w.staerke}" stroke-linecap="square"/>`);
  }
  for (const oe of g.oeffnungen) {
    const w = g.waende.find((x) => x.id === oe.wand_id);
    if (!w) continue;
    const l = wandLaenge(w) || 1;
    const m = punktAufWand(w, oe.position);
    const dx = (w.b.x - w.a.x) / l;
    const dy = (w.b.y - w.a.y) / l;
    const h = oe.breite / 2;
    const p1 = { x: m.x - dx * h, y: m.y - dy * h };
    const p2 = { x: m.x + dx * h, y: m.y + dy * h };
    if (oe.art === "tuer") {
      teile.push(`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#ffffff" stroke-width="${w.staerke + 2}"/>`);
      const s = oe.anschlag === "rechts" ? -1 : 1;
      const nx = -dy * s;
      const ny = dx * s;
      teile.push(`<path d="M ${p1.x} ${p1.y} L ${p1.x + nx * oe.breite} ${p1.y + ny * oe.breite} A ${oe.breite} ${oe.breite} 0 0 ${s === 1 ? 1 : 0} ${p2.x} ${p2.y}" fill="none" stroke="#B5934F" stroke-width="2"/>`);
    } else {
      teile.push(`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#ffffff" stroke-width="${w.staerke + 2}"/>`);
      teile.push(`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#3E6E8E" stroke-width="4"/>`);
    }
  }
  if (o.masse) {
    for (const ms of g.masse) {
      const l = Math.hypot(ms.b.x - ms.a.x, ms.b.y - ms.a.y);
      const cx = (ms.a.x + ms.b.x) / 2;
      const cy = (ms.a.y + ms.b.y) / 2;
      teile.push(`<line x1="${ms.a.x}" y1="${ms.a.y}" x2="${ms.b.x}" y2="${ms.b.y}" stroke="#7A828C" stroke-width="1.5" marker-start="url(#s)" marker-end="url(#e)"/>`);
      teile.push(`<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#7A828C">${(l / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</text>`);
    }
  }
  for (const t of g.texte) teile.push(`<text x="${t.x}" y="${t.y}" font-family="Helvetica, Arial, sans-serif" font-size="${t.groesse}" fill="#1B2A47">${esc(t.text)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.breite} ${box.hoehe}" width="${box.breite}" height="${box.hoehe}"><defs><marker id="s" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,8 M0,8 L8,0" stroke="#7A828C" stroke-width="1"/></marker><marker id="e" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,8 M0,8 L8,0" stroke="#7A828C" stroke-width="1"/></marker></defs>${teile.join("")}</svg>`;
}

/** Gespeichertes JSON tolerant lesen. */
export function grundrissLesen(roh: unknown): Grundriss {
  const g = (roh && typeof roh === "object" ? roh : {}) as Partial<Grundriss>;
  const punkt = (p: unknown): Punkt => { const q = (p ?? {}) as Partial<Punkt>; return { x: Number(q.x) || 0, y: Number(q.y) || 0 }; };
  const liste = <T,>(l: unknown, f: (x: Record<string, unknown>, i: number) => T | null): T[] => (Array.isArray(l) ? l.map((x, i) => f((x ?? {}) as Record<string, unknown>, i)).filter((x): x is T => x !== null) : []);
  return {
    titel: typeof g.titel === "string" ? g.titel : "Grundriss",
    raster: [5, 10, 25, 50].includes(Number(g.raster)) ? Number(g.raster) : 10,
    waende: liste(g.waende, (w, i) => ({ id: typeof w["id"] === "string" ? w["id"] : `w${i}`, a: punkt(w["a"]), b: punkt(w["b"]), staerke: Math.max(4, Math.min(60, Number(w["staerke"]) || 20)) })),
    oeffnungen: liste(g.oeffnungen, (o, i) => (o["art"] === "tuer" || o["art"] === "fenster" ? { id: typeof o["id"] === "string" ? o["id"] : `o${i}`, art: o["art"], wand_id: String(o["wand_id"] ?? ""), position: Math.max(0, Math.min(1, Number(o["position"]) || 0.5)), breite: Math.max(30, Math.min(400, Number(o["breite"]) || 90)), ...(o["anschlag"] === "rechts" ? { anschlag: "rechts" as const } : { anschlag: "links" as const }) } : null)),
    raeume: liste(g.raeume, (r, i) => ({ id: typeof r["id"] === "string" ? r["id"] : `r${i}`, name: typeof r["name"] === "string" ? r["name"] : "Raum", polygon: Array.isArray(r["polygon"]) ? (r["polygon"] as unknown[]).map(punkt) : [] })),
    moebel: liste(g.moebel, (m, i) => (typeof m["art"] === "string" && m["art"] in MOEBEL ? { id: typeof m["id"] === "string" ? m["id"] : `m${i}`, art: m["art"] as MoebelArt, x: Number(m["x"]) || 0, y: Number(m["y"]) || 0, breite: Number(m["breite"]) || MOEBEL[m["art"] as MoebelArt].breite, tiefe: Number(m["tiefe"]) || MOEBEL[m["art"] as MoebelArt].tiefe, drehung: Number(m["drehung"]) || 0 } : null)),
    masse: liste(g.masse, (m, i) => ({ id: typeof m["id"] === "string" ? m["id"] : `d${i}`, a: punkt(m["a"]), b: punkt(m["b"]) })),
    texte: liste(g.texte, (t, i) => ({ id: typeof t["id"] === "string" ? t["id"] : `t${i}`, x: Number(t["x"]) || 0, y: Number(t["y"]) || 0, text: String(t["text"] ?? ""), groesse: Number(t["groesse"]) || 20 })),
    vorlage: g.vorlage && typeof g.vorlage === "object" && typeof (g.vorlage as { quelle?: unknown }).quelle === "string"
      ? (() => { const v = g.vorlage as Record<string, unknown>; return { quelle: String(v["quelle"]), cmJePixel: Number(v["cmJePixel"]) || 1, x: Number(v["x"]) || 0, y: Number(v["y"]) || 0, deckkraft: Number(v["deckkraft"]) || 0.4, breitePx: Number(v["breitePx"]) || 1000, hoehePx: Number(v["hoehePx"]) || 700 }; })()
      : null,
  };
}

// ---------------------------------------------------------------------------
// Raumscan-Import (Apple RoomPlan „CapturedRoom"-JSON und aehnliche Exporte)
// ---------------------------------------------------------------------------

interface ScanElement { dimensions?: number[]; transform?: number[]; category?: string | Record<string, unknown>; identifier?: string }
interface ScanDatei { walls?: ScanElement[]; doors?: ScanElement[]; windows?: ScanElement[]; objects?: ScanElement[]; rooms?: Array<{ name?: string; polygon?: Array<{ x: number; y: number }> }>; titel?: string }

const SCAN_OBJEKTE: Record<string, MoebelArt> = { bathtub: "badewanne", bed: "bett", sofa: "sofa", table: "tisch", storage: "schrank", stove: "kueche", oven: "kueche", refrigerator: "schrank", toilet: "wc", sink: "waschbecken", stairs: "treppe", chair: "schreibtisch" };

/** 4x4-Matrix (spaltenweise, wie RoomPlan) → Mittelpunkt in cm (x, z-Ebene) und Drehwinkel um die Hochachse. */
function lage(transform: number[] | undefined): { x: number; y: number; winkel: number } | null {
  if (!transform || transform.length < 16) return null;
  const x = (transform[12] ?? 0) * 100;
  const y = (transform[14] ?? 0) * 100;
  const winkel = (Math.atan2(transform[2] ?? 0, transform[0] ?? 1) * 180) / Math.PI;
  return { x, y, winkel };
}

/** Scan → Grundriss: Waende als Strecken aus Mittelpunkt, Laenge und Drehung; Tueren/Fenster an der naechsten Wand; Moebel als Rechtecke. */
export function ausRaumscan(roh: unknown, titel = "Raumscan"): { grundriss: Grundriss; hinweis: string } {
  const s = (roh && typeof roh === "object" ? roh : {}) as ScanDatei;
  const g = leererGrundriss(s.titel ?? titel);
  let minX = Infinity;
  let minY = Infinity;
  const roh_waende: Array<{ a: Punkt; b: Punkt }> = [];
  for (const w of s.walls ?? []) {
    const l = lage(w.transform);
    const laenge = (w.dimensions?.[0] ?? 0) * 100;
    if (!l || laenge < 10) continue;
    const rad = (l.winkel * Math.PI) / 180;
    const dx = (Math.cos(rad) * laenge) / 2;
    const dy = (Math.sin(rad) * laenge) / 2;
    roh_waende.push({ a: { x: l.x - dx, y: l.y - dy }, b: { x: l.x + dx, y: l.y + dy } });
  }
  for (const w of roh_waende) { minX = Math.min(minX, w.a.x, w.b.x); minY = Math.min(minY, w.a.y, w.b.y); }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; }
  const versatz = { x: 100 - minX, y: 100 - minY };
  const rund = (p: Punkt): Punkt => ({ x: Math.round(p.x + versatz.x), y: Math.round(p.y + versatz.y) });
  g.waende = roh_waende.map((w, i) => ({ id: `w${i + 1}`, a: rund(w.a), b: rund(w.b), staerke: 20 }));
  const oeffnung = (e: ScanElement, art: "tuer" | "fenster", i: number): Oeffnung | null => {
    const l = lage(e.transform);
    const breite = Math.round((e.dimensions?.[0] ?? 0.9) * 100);
    if (!l) return null;
    const p = rund({ x: l.x, y: l.y });
    let beste: { wand: Wand; position: number; abstand: number } | null = null;
    for (const w of g.waende) {
      const L = wandLaenge(w) || 1;
      const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / (L * L)));
      const q = punktAufWand(w, t);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (!beste || d < beste.abstand) beste = { wand: w, position: t, abstand: d };
    }
    if (!beste || beste.abstand > 60) return null;
    return { id: `${art[0]}${i + 1}`, art, wand_id: beste.wand.id, position: Math.round(beste.position * 100) / 100, breite: Math.max(30, breite), anschlag: "links" };
  };
  g.oeffnungen = [...(s.doors ?? []).map((d, i) => oeffnung(d, "tuer", i)), ...(s.windows ?? []).map((f, i) => oeffnung(f, "fenster", i))].filter((o): o is Oeffnung => o !== null);
  g.moebel = (s.objects ?? []).flatMap((o, i) => {
    const kat = typeof o.category === "string" ? o.category : Object.keys(o.category ?? {})[0] ?? "";
    const art = SCAN_OBJEKTE[kat];
    const l = lage(o.transform);
    if (!art || !l) return [];
    const breite = Math.round((o.dimensions?.[0] ?? MOEBEL[art].breite / 100) * 100);
    const tiefe = Math.round((o.dimensions?.[2] ?? MOEBEL[art].tiefe / 100) * 100);
    const m = rund({ x: l.x, y: l.y });
    return [{ id: `m${i + 1}`, art, x: m.x - breite / 2, y: m.y - tiefe / 2, breite, tiefe, drehung: Math.round(l.winkel) }];
  });
  g.raeume = (s.rooms ?? []).filter((r) => Array.isArray(r.polygon) && r.polygon.length >= 3).map((r, i) => ({ id: `r${i + 1}`, name: r.name ?? `Raum ${i + 1}`, polygon: (r.polygon ?? []).map((p) => rund({ x: p.x * 100, y: p.y * 100 })) }));
  const hinweis = `${g.waende.length} Wände, ${g.oeffnungen.filter((o) => o.art === "tuer").length} Türen, ${g.oeffnungen.filter((o) => o.art === "fenster").length} Fenster, ${g.moebel.length} Möbel${g.raeume.length ? `, ${g.raeume.length} Räume` : ""}`;
  return { grundriss: g, hinweis };
}
