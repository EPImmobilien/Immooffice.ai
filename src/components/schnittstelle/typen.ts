import type { Rechte } from "@/lib/schnittstelle/schluessel";

export interface SchluesselZeile {
  id: string;
  bezeichnung: string;
  praefix: string;
  rechte: Rechte;
  ratenlimit_pro_minute: number;
  erstellt_am: string;
  zuletzt_verwendet_am: string | null;
  widerrufen_am: string | null;
}

export interface ZielZeile {
  id: string;
  bezeichnung: string;
  url: string;
  ereignisse: string[];
  aktiv: boolean;
  fehler_zaehler: number;
  letzter_fehler: string | null;
  erstellt_am: string;
}

export interface RueckrufZeile {
  id: string;
  ziel_id: string;
  ereignis: string;
  status: "offen" | "zugestellt" | "fehler";
  versuche: number;
  naechster_versuch_am: string;
  antwort_status: number | null;
  fehler_text: string | null;
  erstellt_am: string;
  zugestellt_am: string | null;
}
