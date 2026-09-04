import type { Dokumentart } from "@/lib/dokumente";

/**
 * Checklisten (docs/FUNKTIONSABGLEICH.md N1, Referenz „Arbeitsketten mit
 * Checklisten-Vorlagen"): Vorlagen mit Punkten, laufende Checklisten an
 * Objekt, Kontakt, Lead oder Vertrag. Ein Punkt mit Unterlagenart gilt als
 * erledigt, sobald die Unterlage am Objekt liegt (Datenbank-Trigger).
 */

export const BEREICHE = { verkauf: "Verkauf", vermietung: "Vermietung", akquise: "Akquise", allgemein: "Allgemein" } as const;
export type Bereich = keyof typeof BEREICHE;

export const PUNKT_STATUS = { offen: "Offen", erledigt: "Erledigt", nicht_noetig: "Nicht nötig" } as const;
export type PunktStatus = keyof typeof PUNKT_STATUS;

export interface Vorlage { id: string; name: string; bereich: Bereich; beschreibung: string | null; ist_standard: boolean; aktiv: boolean }
export interface VorlagenPunkt { id: string; vorlage_id: string; titel: string; beschreibung: string | null; pflicht: boolean; dokumentart: Dokumentart | null; frist_tage: number | null; sortierung: number }

export interface Checkliste {
  id: string;
  name: string;
  bereich: Bereich;
  vorlage_id: string | null;
  objekt_id: string | null;
  kontakt_id: string | null;
  lead_id: string | null;
  vertrag_id: string | null;
  zustaendig_id: string | null;
  abgeschlossen_am: string | null;
  erstellt_am: string;
}

export interface Punkt {
  id: string;
  checkliste_id: string;
  titel: string;
  beschreibung: string | null;
  pflicht: boolean;
  dokumentart: Dokumentart | null;
  faellig_am: string | null;
  status: PunktStatus;
  erledigt_am: string | null;
  dokument_id: string | null;
  aufgabe_id: string | null;
  notiz: string | null;
  sortierung: number;
}

export interface Fortschritt { gesamt: number; erledigt: number; pflichtOffen: number; ueberfaellig: number; prozent: number }

/** Fortschritt einer Checkliste: erledigte und nicht noetige Punkte zaehlen, Pflicht offen und ueberfaellig getrennt. */
export function fortschritt(punkte: Pick<Punkt, "status" | "pflicht" | "faellig_am">[], heute: string): Fortschritt {
  const gesamt = punkte.length;
  const erledigt = punkte.filter((p) => p.status !== "offen").length;
  const pflichtOffen = punkte.filter((p) => p.pflicht && p.status === "offen").length;
  const ueberfaellig = punkte.filter((p) => p.status === "offen" && p.faellig_am && p.faellig_am < heute).length;
  return { gesamt, erledigt, pflichtOffen, ueberfaellig, prozent: gesamt === 0 ? 0 : Math.round((erledigt / gesamt) * 100) };
}
