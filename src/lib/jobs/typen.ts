/**
 * Auftragswarteschlange — Typen (ARCHITECTURE.md Abschnitt 3).
 *
 * Die Arten spiegeln den Check-Constraint von `jobs.art`. Jede Art hat
 * genau einen Arbeiter in `src/lib/jobs/worker.ts`.
 */

export const JOB_ARTEN = ["sync", "ki_text", "ki_bild", "mail", "export", "postfach"] as const;
export type JobArt = (typeof JOB_ARTEN)[number];

export type JobStatus = "offen" | "laeuft" | "fertig" | "fehler" | "abgebrochen";

export interface JobZeile {
  id: string;
  mandant_id: string;
  art: JobArt;
  nutzlast: Record<string, unknown>;
  status: JobStatus;
  prioritaet: number;
  versuche: number;
  max_versuche: number;
  naechster_versuch_am: string;
  sperre_bis: string | null;
  arbeiter: string | null;
  gestartet_am: string | null;
  beendet_am: string | null;
  ergebnis: Record<string, unknown> | null;
  fehler_text: string | null;
  fehler_verlauf: Array<{ versuch: number; zeit: string; fehler: string }>;
  credit_vorgang_id: string | null;
  erstellt_von: string | null;
  erstellt_am: string;
}

/** Nutzlast eines Abgleichs (`art = 'sync'`). */
export interface SyncNutzlast {
  integration_id: string;
  richtung: "holen" | "senden" | "beide";
  ausloeser: "manuell" | "zeitplan" | "rueckruf";
  /** Pfad im Bucket `importe`, nur bei Datei-Connectoren (OpenImmo). */
  datei_pfad?: string;
}

export function istSyncNutzlast(wert: unknown): wert is SyncNutzlast {
  if (!wert || typeof wert !== "object") return false;
  const n = wert as Record<string, unknown>;
  return (
    typeof n["integration_id"] === "string" &&
    (n["richtung"] === "holen" || n["richtung"] === "senden" || n["richtung"] === "beide") &&
    (n["ausloeser"] === "manuell" || n["ausloeser"] === "zeitplan" || n["ausloeser"] === "rueckruf") &&
    (n["datei_pfad"] === undefined || typeof n["datei_pfad"] === "string")
  );
}

export const JOB_STATUS_BEZEICHNUNG: Record<JobStatus, string> = {
  offen: "Wartet",
  laeuft: "Läuft",
  fertig: "Erledigt",
  fehler: "Gescheitert",
  abgebrochen: "Abgebrochen",
};
