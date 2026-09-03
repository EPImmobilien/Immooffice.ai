import type { AusleseFeld } from "@/lib/ki/typen";

import { maklervertragSchema, type MaklervertragDaten } from "./vorlagen";

/**
 * KI-Import eines bestehenden Maklervertrags (docs/FUNKTIONSABGLEICH.md V1):
 * Aus dem PDF-Text werden Felder vorgeschlagen — die Uebernahme laeuft immer
 * ueber das editierbare Formular (Funktionsprompt, Grundprinzip 3).
 */
export const MAKLERVERTRAG_FELDER: AusleseFeld[] = [
  { schluessel: "verkaeufer_name", beschreibung: "Vollständiger Name des Auftraggebers / Verkäufers (bei mehreren: durch Semikolon getrennt)" },
  { schluessel: "verkaeufer_typ", beschreibung: "einzelperson, eheleute, mehrere, erbengemeinschaft oder firma" },
  { schluessel: "verkaeufer_strasse", beschreibung: "Straße und Hausnummer des Auftraggebers" },
  { schluessel: "verkaeufer_plz", beschreibung: "Postleitzahl des Auftraggebers" },
  { schluessel: "verkaeufer_ort", beschreibung: "Ort des Auftraggebers" },
  { schluessel: "objekt_strasse", beschreibung: "Straße und Hausnummer des Objekts" },
  { schluessel: "objekt_plz", beschreibung: "Postleitzahl des Objekts" },
  { schluessel: "objekt_ort", beschreibung: "Ort des Objekts" },
  { schluessel: "angebotspreis", beschreibung: "Angebotspreis in Euro als Zahl ohne Tausenderpunkte" },
  { schluessel: "provision_prozent", beschreibung: "Provision in Prozent als Zahl, z. B. 3.57" },
  { schluessel: "provisionsmodell", beschreibung: "teilung, verkaeufer oder kaeufer" },
  { schluessel: "laufzeit_monate", beschreibung: "Laufzeit in Monaten als Zahl" },
  { schluessel: "vertragsart", beschreibung: "verkauf oder vermietung" },
  { schluessel: "geschlossen_am", beschreibung: "Datum der Unterzeichnung als JJJJ-MM-TT" },
];

function zahl(w: string | null | undefined): number | null {
  if (!w) return null;
  const n = Number(String(w).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Ausgelesene Werte → Formulardaten (fehlende Felder bleiben Vorgabe). */
export function importZuFormular(werte: Record<string, string | null>): MaklervertragDaten {
  const namen = (werte["verkaeufer_name"] ?? "").split(/;|\bund\b/).map((n) => n.trim()).filter(Boolean);
  const typRoh = (werte["verkaeufer_typ"] ?? "").toLowerCase();
  const typ = ["einzelperson", "eheleute", "mehrere", "erbengemeinschaft", "firma"].includes(typRoh)
    ? typRoh
    : namen.length > 1 ? "mehrere" : "einzelperson";
  const modellRoh = (werte["provisionsmodell"] ?? "").toLowerCase();
  const provision = zahl(werte["provision_prozent"]);
  const laufzeit = zahl(werte["laufzeit_monate"]);
  return maklervertragSchema.parse({
    vertragsart: (werte["vertragsart"] ?? "").toLowerCase() === "vermietung" ? "vermietung" : "verkauf",
    verkaeufer_typ: typ,
    personen: (namen.length > 0 ? namen : ["—"]).map((name, i) => ({
      name,
      strasse: i === 0 ? werte["verkaeufer_strasse"] ?? "" : "",
      plz: i === 0 ? werte["verkaeufer_plz"] ?? "" : "",
      ort: i === 0 ? werte["verkaeufer_ort"] ?? "" : "",
    })),
    firma: typ === "firma" ? { name: namen[0] ?? "" } : {},
    objekt: { strasse: werte["objekt_strasse"] ?? "", plz: werte["objekt_plz"] ?? "", ort: werte["objekt_ort"] ?? "" },
    angebotspreis: zahl(werte["angebotspreis"]),
    ...(provision !== null && provision >= 0 && provision <= 20 ? { provision_prozent: provision } : {}),
    ...(laufzeit !== null && laufzeit >= 1 && laufzeit <= 36 ? { laufzeit_monate: Math.round(laufzeit) } : {}),
    provisionsmodell: ["teilung", "verkaeufer", "kaeufer"].includes(modellRoh) ? modellRoh : "teilung",
  });
}
