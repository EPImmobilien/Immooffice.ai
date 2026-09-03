"use server";

import { serverClient } from "@/lib/supabase/server";

/**
 * Oeffentliche Mieterselbstauskunft (docs/FUNKTIONSABGLEICH.md M1). Die
 * Datenbankfunktion prueft Token, Pflichtfelder, Einwilligung und Menge; hier
 * werden nur Formularfelder eingesammelt. Keine Anmeldung noetig.
 */
export interface SelbstauskunftErgebnis {
  fehler?: string;
  erfolg?: boolean;
}

const FEHLER: Record<string, string> = {
  unbekannt: "Dieses Formular ist nicht mehr gültig.",
  eingabe: "Bitte Name und eine gültige E-Mail-Adresse angeben.",
  datenschutz: "Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.",
  zu_viele: "Es sind heute bereits sehr viele Anfragen eingegangen. Bitte versuchen Sie es morgen erneut.",
};

export async function selbstauskunftEinreichen(_vorher: SelbstauskunftErgebnis, formular: FormData): Promise<SelbstauskunftErgebnis> {
  // Honigtopf gegen Skripte: unsichtbares Feld, das Menschen nicht fuellen.
  if (String(formular.get("website") ?? "").trim() !== "") return { erfolg: true };
  const token = String(formular.get("token") ?? "").trim();
  const felder = ["anrede", "vorname", "nachname", "email", "telefon", "personen_anzahl", "einzug_ab", "beruf", "arbeitgeber", "einkommen_netto", "haustiere", "derzeitiger_vermieter", "mietverhaeltnis_seit", "mitteilung"] as const;
  const daten: Record<string, string | boolean> = {};
  for (const f of felder) {
    const w = String(formular.get(f) ?? "").trim();
    if (w) daten[f] = w;
  }
  for (const f of ["schufa_vorhanden", "kann_kaution_leisten", "raucher"] as const) {
    const w = String(formular.get(f) ?? "");
    if (w === "ja" || w === "nein") daten[f] = w === "ja";
  }
  daten["datenschutz"] = formular.get("datenschutz") === "1";
  daten["angaben_bestaetigt"] = formular.get("angaben_bestaetigt") === "1";

  const supabase = await serverClient();
  const { data, error } = await supabase.rpc("selbstauskunft_einreichen", { p_token: token, p_daten: daten });
  if (error) return { fehler: "Die Angaben konnten nicht übermittelt werden. Bitte später erneut versuchen." };
  const antwort = (data ?? {}) as { ok?: boolean; grund?: string };
  if (!antwort.ok) return { fehler: FEHLER[antwort.grund ?? ""] ?? "Die Angaben konnten nicht übermittelt werden." };
  return { erfolg: true };
}
