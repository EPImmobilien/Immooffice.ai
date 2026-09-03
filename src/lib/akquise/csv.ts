/**
 * CSV-Import von Leads (Referenz „Aus CSV"): Trennzeichen wird erkannt,
 * Spalten werden ueber die Kopfzeile zugeordnet. Unbekannte Spalten werden
 * ignoriert; jede Zeile bleibt nach dem Import editierbar.
 */
export interface CsvLead {
  titel: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  objektart: string;
  wohnflaeche: number | null;
  baujahr: number | null;
  anrede: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  notiz: string;
}

const SPALTEN: Record<keyof CsvLead, string[]> = {
  titel: ["titel", "bezeichnung", "lead"],
  strasse: ["strasse", "straße", "street"],
  hausnummer: ["hausnummer", "hausnr", "nr"],
  plz: ["plz", "postleitzahl", "zip"],
  ort: ["ort", "stadt", "city"],
  objektart: ["objektart", "immobilienart", "art"],
  wohnflaeche: ["wohnflaeche", "wohnfläche", "flaeche", "fläche", "qm"],
  baujahr: ["baujahr"],
  anrede: ["anrede"],
  vorname: ["vorname", "firstname"],
  nachname: ["nachname", "name", "lastname"],
  email: ["email", "e-mail", "mail"],
  telefon: ["telefon", "tel", "mobil", "phone"],
  notiz: ["notiz", "bemerkung", "kommentar", "notes"],
};

function zeileTeilen(zeile: string, trenner: string): string[] {
  const felder: string[] = [];
  let aktuell = "";
  let inAnfuehrung = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') {
      if (inAnfuehrung && zeile[i + 1] === '"') { aktuell += '"'; i++; }
      else inAnfuehrung = !inAnfuehrung;
    } else if (c === trenner && !inAnfuehrung) {
      felder.push(aktuell); aktuell = "";
    } else aktuell += c;
  }
  felder.push(aktuell);
  return felder.map((f) => f.trim());
}

function zahl(s: string): number | null {
  const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

export function leadsAusCsv(inhalt: string): { leads: CsvLead[]; fehler: string[]; spalten: string[] } {
  const zeilen = inhalt.replace(/^﻿/, "").replace(/\r/g, "").split("\n").filter((z) => z.trim());
  const kopfZeile = zeilen[0];
  if (!kopfZeile) return { leads: [], fehler: ["Die Datei ist leer."], spalten: [] };
  const trenner = (kopfZeile.match(/;/g)?.length ?? 0) >= (kopfZeile.match(/,/g)?.length ?? 0) ? ";" : ",";
  const kopf = zeileTeilen(kopfZeile, trenner).map((k) => k.toLowerCase().replace(/"/g, "").trim());
  const index: Partial<Record<keyof CsvLead, number>> = {};
  for (const [feld, namen] of Object.entries(SPALTEN) as Array<[keyof CsvLead, string[]]>) {
    const i = kopf.findIndex((k) => namen.includes(k));
    if (i >= 0) index[feld] = i;
  }
  const fehler: string[] = [];
  if (index.strasse === undefined && index.titel === undefined && index.nachname === undefined) fehler.push("Keine passende Spalte gefunden (mindestens Straße, Titel oder Nachname).");
  const leads: CsvLead[] = [];
  zeilen.slice(1).forEach((z, nr) => {
    const f = zeileTeilen(z, trenner);
    const w = (k: keyof CsvLead) => (index[k] !== undefined ? (f[index[k] as number] ?? "") : "");
    const lead: CsvLead = {
      titel: w("titel"), strasse: w("strasse"), hausnummer: w("hausnummer"), plz: w("plz"), ort: w("ort"), objektart: w("objektart"),
      wohnflaeche: zahl(w("wohnflaeche")), baujahr: zahl(w("baujahr")), anrede: w("anrede"), vorname: w("vorname"), nachname: w("nachname"), email: w("email"), telefon: w("telefon"), notiz: w("notiz"),
    };
    if (!lead.hausnummer && lead.strasse) {
      const hn = /^(.*?)\s+(\d{1,4}\s?[a-zA-Z]?)$/.exec(lead.strasse);
      if (hn?.[1] && hn[2]) { lead.strasse = hn[1]; lead.hausnummer = hn[2].replace(/\s+/g, ""); }
    }
    if (!lead.titel) lead.titel = [lead.objektart, [lead.strasse, lead.hausnummer].filter(Boolean).join(" "), lead.ort].filter(Boolean).join(" · ") || [lead.vorname, lead.nachname].filter(Boolean).join(" ");
    if (!lead.titel) { fehler.push(`Zeile ${nr + 2}: weder Adresse noch Name — übersprungen.`); return; }
    leads.push(lead);
  });
  return { leads, fehler, spalten: kopf };
}
