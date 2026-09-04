import type { Terminart } from "@/lib/arbeitsmittel";

import type { Fahrzeiten } from "./fahrzeit";
import type { SerienRegel } from "./serie";

/** Termin, wie ihn Kalender und Detailseite laden. */
export interface KalenderTermin {
  id: string;
  titel: string;
  art: Terminart;
  notiz: string | null;
  beginnt_am: string;
  endet_am: string;
  ganztags: boolean;
  ort: string | null;
  abgesagt_am: string | null;
  objekt_id: string | null;
  kontakt_id: string | null;
  zustaendig_id: string | null;
  teilnehmer: string[];
  privat: boolean;
  serie_id: string | null;
  serie_regel: SerienRegel | null;
  erinnerung_minuten: number | null;
  erinnert_am: string | null;
  nachfassen: boolean;
  nachgefasst_am: string | null;
  fahrzeit: Fahrzeiten | null;
  bestaetigt_am: string | null;
  extern_quelle: "google" | "microsoft" | null;
  objekt?: { objektnummer: string; bezeichnung: string; strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null } | null;
  kontakt?: { vorname: string | null; nachname: string; email?: string | null } | null;
}

export interface Mitarbeiter { id: string; name: string; farbe: string | null }

export const ERINNERUNGEN: ReadonlyArray<readonly [string, string]> = [
  ["", "Keine Erinnerung"],
  ["30", "30 Minuten vorher"],
  ["60", "1 Stunde vorher"],
  ["120", "2 Stunden vorher"],
  ["360", "6 Stunden vorher"],
  ["1440", "1 Tag vorher"],
  ["2880", "2 Tage vorher"],
];

/** Farbpalette fuer Mitarbeiter ohne eigene Farbe (dezent, zum Branding passend). */
export const PALETTE = ["#1B2A47", "#B5934F", "#3E6E8E", "#7A6C5D", "#4F7A5A", "#8E4F5C", "#5C5F8E", "#8E7A3E"];

export function mitarbeiterFarbe(m: Mitarbeiter | undefined, index: number): string {
  return m?.farbe ?? PALETTE[index % PALETTE.length] ?? "#1B2A47";
}

/** Spalten, die Kalender und Detailseite laden. */
export const TERMIN_FELDER =
  "id, titel, art, notiz, beginnt_am, endet_am, ganztags, ort, abgesagt_am, objekt_id, kontakt_id, zustaendig_id, teilnehmer, privat, serie_id, serie_regel, erinnerung_minuten, erinnert_am, nachfassen, nachgefasst_am, fahrzeit, bestaetigt_am, extern_quelle, " +
  "objekt:objekte(objektnummer, bezeichnung, strasse, hausnummer, plz, ort), kontakt:kontakte(vorname, nachname, email)";
