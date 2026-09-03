import type { Kampagne, LeadZeile, Quelle, Stufe } from "@/lib/akquise/stammdaten";

/**
 * Marketing-Report und Pipeline-Prognose (Referenz „Auswertung"): Leads im
 * Zeitraum nach Quellenart, Gewinne, erwartete Provision, Ausgaben der
 * Kampagnen, Kosten je Lead und je Abschluss, ROAS, Conversion.
 */

export interface Report {
  leads: number;
  online: number;
  offline: number;
  netzwerk: number;
  tippgeber: number;
  gewonnen: number;
  verloren: number;
  umsatz: number;
  ausgaben: number;
  kampagnen: number;
  cpl: number | null;
  cpa: number | null;
  provisionJeAbschluss: number | null;
  roas: number | null;
  conversion: number | null;
  verlustgruende: Array<{ grund: string; anzahl: number }>;
  quellen: Array<{ name: string; anzahl: number; gewonnen: number }>;
}

function imZeitraum(datum: string | null, von: string, bis: string): boolean {
  if (!datum) return false;
  const t = datum.slice(0, 10);
  return t >= von && t <= bis;
}

export function marketingReport(leads: LeadZeile[], kampagnen: Kampagne[], quellen: Quelle[], von: string, bis: string): Report {
  const drin = leads.filter((l) => imZeitraum(l.erstellt_am, von, bis));
  const quelleVon = (id: string | null) => quellen.find((q) => q.id === id);
  const art = (l: LeadZeile) => quelleVon(l.quelle_id)?.art ?? "offline";
  const gewonnen = drin.filter((l) => l.status === "gewonnen");
  const verloren = drin.filter((l) => l.status === "verloren");
  const umsatz = gewonnen.reduce((s, l) => s + (l.provision_erwartet ?? 0), 0);
  const aktiveKampagnen = kampagnen.filter((k) => (!k.beginn || k.beginn <= bis) && (!k.ende || k.ende >= von));
  const ausgaben = aktiveKampagnen.reduce((s, k) => s + (k.ausgaben || 0), 0);
  const abgeschlossen = drin.filter((l) => l.status !== "offen");
  const gruende = new Map<string, number>();
  for (const l of verloren) gruende.set(l.verlustgrund ?? "Ohne Angabe", (gruende.get(l.verlustgrund ?? "Ohne Angabe") ?? 0) + 1);
  const jeQuelle = new Map<string, { anzahl: number; gewonnen: number }>();
  for (const l of drin) {
    const name = quelleVon(l.quelle_id)?.name ?? "Ohne Quelle";
    const e = jeQuelle.get(name) ?? { anzahl: 0, gewonnen: 0 };
    e.anzahl += 1;
    if (l.status === "gewonnen") e.gewonnen += 1;
    jeQuelle.set(name, e);
  }
  return {
    leads: drin.length,
    online: drin.filter((l) => art(l) === "online").length,
    offline: drin.filter((l) => art(l) === "offline").length,
    netzwerk: drin.filter((l) => art(l) === "netzwerk").length,
    tippgeber: drin.filter((l) => art(l) === "tippgeber").length,
    gewonnen: gewonnen.length,
    verloren: verloren.length,
    umsatz,
    ausgaben,
    kampagnen: aktiveKampagnen.length,
    cpl: drin.length ? ausgaben / drin.length : null,
    cpa: gewonnen.length ? ausgaben / gewonnen.length : null,
    provisionJeAbschluss: gewonnen.length ? umsatz / gewonnen.length : null,
    roas: ausgaben > 0 ? umsatz / ausgaben : null,
    conversion: abgeschlossen.length ? (gewonnen.length / abgeschlossen.length) * 100 : null,
    verlustgruende: [...gruende.entries()].map(([grund, anzahl]) => ({ grund, anzahl })).sort((a, b) => b.anzahl - a.anzahl),
    quellen: [...jeQuelle.entries()].map(([name, e]) => ({ name, ...e })).sort((a, b) => b.anzahl - a.anzahl),
  };
}

export interface Prognose { roh: number; gewichtet: number; offen: number; jeStufe: Array<{ stufe: string; anzahl: number; roh: number; gewichtet: number }> }

/** Erwartete Provision der offenen Leads, roh und gewichtet nach Stufen-Wahrscheinlichkeit. */
export function pipelinePrognose(leads: LeadZeile[], stufen: Stufe[]): Prognose {
  const offen = leads.filter((l) => l.status === "offen");
  const jeStufe = new Map<string, { stufe: string; anzahl: number; roh: number; gewichtet: number; sortierung: number }>();
  let roh = 0;
  let gewichtet = 0;
  for (const l of offen) {
    const s = stufen.find((x) => x.id === l.stufe_id);
    const p = l.provision_erwartet ?? 0;
    const w = (s?.wahrscheinlichkeit ?? 0) / 100;
    roh += p;
    gewichtet += p * w;
    const e = jeStufe.get(l.stufe_id) ?? { stufe: s?.name ?? "?", anzahl: 0, roh: 0, gewichtet: 0, sortierung: s?.sortierung ?? 99 };
    e.anzahl += 1;
    e.roh += p;
    e.gewichtet += p * w;
    jeStufe.set(l.stufe_id, e);
  }
  return { roh: Math.round(roh), gewichtet: Math.round(gewichtet), offen: offen.length, jeStufe: [...jeStufe.values()].sort((a, b) => a.sortierung - b.sortierung).map(({ sortierung: _s, ...r }) => ({ ...r, roh: Math.round(r.roh), gewichtet: Math.round(r.gewichtet) })) };
}
