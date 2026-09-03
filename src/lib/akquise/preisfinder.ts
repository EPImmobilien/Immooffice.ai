import { type Einstellungen, type Provisionsart, STANDARD_EINSTELLUNGEN } from "@/lib/akquise/stammdaten";

/**
 * Preis-Finder (Referenz „Preis-Finder" und „MPE"): Wertindikation aus den
 * eigenen Vergleichswerten (verkaufte Objekte des Mandanten), daraus Spanne,
 * Startpreis und Provisionserwartung. Kein Gutachten, keine Blackbox: jede
 * Zahl hat einen sichtbaren Rechenschritt, und der Nutzer ueberschreibt sie.
 */

export const WERTINDIKATION_HINWEIS =
  "Marktpreiseinschätzung auf Grundlage eigener Vergleichswerte. Keine gutachterliche Aussage; ersetzt kein Verkehrswertgutachten nach § 194 BauGB. Die Ansätze verantwortet der Nutzer.";

export interface Vergleichswert {
  bezeichnung: string;
  plz: string | null;
  ort: string | null;
  objektkategorie: string | null;
  kaufpreis: number | null;
  wohnflaeche: number | null;
  verkauft_am: string | null;
}

export interface IndikationsSchritt { bezeichnung: string; wert: string }

export interface Wertindikation {
  wert: number | null;
  eurQm: number | null;
  /** Herangezogene Vergleichswerte mit €/m² */
  vergleiche: Array<Vergleichswert & { eurQm: number; gewichtung: "plz" | "ort" | "bestand" }>;
  schritte: IndikationsSchritt[];
  fehlend: string[];
}

function median(werte: number[]): number {
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/** Referenz-Objektart → Objektkategorie des Bestands. */
export function kategorieAusObjektart(objektart: string | null): string | null {
  if (!objektart) return null;
  const o = objektart.toLowerCase();
  if (/wohnung/.test(o)) return "wohnung";
  if (/mehrfamilien/.test(o)) return "anlage";
  if (/haus|hälfte|haelfte/.test(o)) return "haus";
  if (/grundstück|grundstueck/.test(o)) return "grundstueck";
  if (/gewerbe/.test(o)) return "gewerbe";
  return null;
}

/**
 * Wertindikation: Median der €/m² passender Vergleichswerte mal Wohnflaeche.
 * Reihenfolge der Eingrenzung: gleiche PLZ → gleicher Ort → ganzer Bestand,
 * jeweils nur mit gleicher Objektkategorie, wenn sich dadurch noch mindestens
 * drei Werte ergeben; sonst wird die Eingrenzung sichtbar gelockert.
 */
export function wertindikation(lead: { plz: string | null; ort: string | null; objektart: string | null; wohnflaeche: number | null }, bestand: Vergleichswert[]): Wertindikation {
  const fehlend: string[] = [];
  if (!lead.wohnflaeche || lead.wohnflaeche <= 0) fehlend.push("Wohnfläche des Leads");
  const brauchbar = bestand
    .filter((v) => v.kaufpreis && v.kaufpreis > 0 && v.wohnflaeche && v.wohnflaeche > 0)
    .map((v) => ({ ...v, eurQm: Math.round((v.kaufpreis as number) / (v.wohnflaeche as number)) }));
  if (brauchbar.length === 0) fehlend.push("Verkaufte Objekte mit Kaufpreis und Wohnfläche im Bestand");
  const kategorie = kategorieAusObjektart(lead.objektart);
  const mitKategorie = kategorie ? brauchbar.filter((v) => v.objektkategorie === kategorie) : brauchbar;
  const basis = mitKategorie.length >= 3 ? mitKategorie : brauchbar;
  const schritte: IndikationsSchritt[] = [];
  if (kategorie) schritte.push({ bezeichnung: "Objektkategorie", wert: mitKategorie.length >= 3 ? `${kategorie} (${mitKategorie.length} Vergleichswerte)` : `${kategorie} — zu wenige Werte, gesamter Bestand (${brauchbar.length})` });
  let gewichtung: "plz" | "ort" | "bestand" = "bestand";
  let auswahl = basis;
  const plzTreffer = lead.plz ? basis.filter((v) => v.plz === lead.plz) : [];
  const ortTreffer = lead.ort ? basis.filter((v) => (v.ort ?? "").toLowerCase() === lead.ort?.toLowerCase()) : [];
  if (plzTreffer.length >= 3) { auswahl = plzTreffer; gewichtung = "plz"; }
  else if (ortTreffer.length >= 3) { auswahl = ortTreffer; gewichtung = "ort"; }
  schritte.push({ bezeichnung: "Räumliche Eingrenzung", wert: gewichtung === "plz" ? `gleiche PLZ ${lead.plz} (${auswahl.length})` : gewichtung === "ort" ? `gleicher Ort ${lead.ort} (${auswahl.length})` : `gesamter Bestand (${auswahl.length})` });
  if (auswahl.length === 0 || fehlend.length > 0) {
    return { wert: null, eurQm: null, vergleiche: auswahl.map((v) => ({ ...v, gewichtung })), schritte, fehlend };
  }
  const eurQm = Math.round(median(auswahl.map((v) => v.eurQm)));
  schritte.push({ bezeichnung: "Median €/m² der Vergleichswerte", wert: `${eurQm.toLocaleString("de-DE")} €/m²` });
  const wert = Math.round((eurQm * (lead.wohnflaeche as number)) / 1000) * 1000;
  schritte.push({ bezeichnung: "× Wohnfläche", wert: `${(lead.wohnflaeche as number).toLocaleString("de-DE")} m² → ${wert.toLocaleString("de-DE")} € (auf Tausend gerundet)` });
  return { wert, eurQm, vergleiche: auswahl.map((v) => ({ ...v, gewichtung })), schritte, fehlend };
}

export interface Preisrahmen { wert: number; min: number; max: number; startpreis: number; provision: number; satz: number }

/** Aus dem Punktwert: Spanne, Startpreis (Verhandlungsbasis) und Provision, auf Tausend gerundet. */
export function preisRechnen(wert: number | null, einst: Pick<Einstellungen, "spanne_prozent" | "startpreis_faktor" | "provision_satz"> = STANDARD_EINSTELLUNGEN): Preisrahmen | null {
  if (!wert || !Number.isFinite(wert) || wert <= 0) return null;
  const runde = (x: number) => Math.round(x / 1000) * 1000;
  const spanne = einst.spanne_prozent / 100;
  return {
    wert: runde(wert),
    min: runde(wert * (1 - spanne)),
    max: runde(wert * (1 + spanne)),
    startpreis: runde(wert * einst.startpreis_faktor),
    provision: Math.round((wert * einst.provision_satz) / 100),
    satz: einst.provision_satz,
  };
}

/** Ab diesem Gesamtsatz (Teilung) ist von einer doppelt erfassten Courtage auszugehen. */
export const SATZ_WARNUNG = 10;
export const STANDARD_ABSCHLAG = 10;

export interface Provisionserwartung { satz: number; nachlass: number; basis: number; brutto: number; netto: number; verdacht: boolean }

/**
 * Provisionserwartung (Referenz „MPE"): Satz je Provisionsart, realistischer
 * Preis abzueglich eines Verhandlungsabschlags, daraus Brutto und Netto (19 %).
 */
export function provisionsErwartung(angebotspreis: number | null, art: Provisionsart, satzVerkaeufer: number, satzKaeufer: number, abschlagProzent = STANDARD_ABSCHLAG): Provisionserwartung | null {
  if (!angebotspreis || angebotspreis <= 0) return null;
  const satz = Math.round((art === "teilung" ? satzVerkaeufer + satzKaeufer : art === "aussen" ? satzKaeufer : art === "innen" ? satzVerkaeufer : 0) * 100) / 100;
  const nachlass = Number.isFinite(abschlagProzent) ? Math.max(0, Math.min(90, abschlagProzent)) : STANDARD_ABSCHLAG;
  const basis = Math.round((angebotspreis * (100 - nachlass)) / 100);
  const brutto = Math.round((basis * satz) / 100);
  return { satz, nachlass, basis, brutto, netto: Math.round(brutto / 1.19), verdacht: art === "teilung" && satz > SATZ_WARNUNG };
}
