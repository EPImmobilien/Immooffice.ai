/**
 * Begriffe und Hilfen rund um Objektbilder (Abschnitt 7 und 11).
 */

export const BILDARTEN = {
  foto: "Foto",
  grundriss: "Grundriss",
  lageplan: "Lageplan",
  energieausweis: "Energieausweis",
  sonstiges: "Sonstiges",
} as const;

export type Bildart = keyof typeof BILDARTEN;

export const BILD_BUCKET = "objektbilder";

/** Zulaessige Dateitypen. Deckungsgleich mit den Vorgaben des Buckets. */
export const BILD_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/** 20 MB — dieselbe Grenze wie im Bucket, damit der Fehler frueh sichtbar wird. */
export const BILD_MAX_BYTES = 20 * 1024 * 1024;

export interface ObjektBild {
  id: string;
  pfad: string;
  art: Bildart;
  titel: string | null;
  reihenfolge: number;
  ist_titelbild: boolean;
  original_id: string | null;
  bearbeitung: string | null;
  ki_bearbeitet: boolean;
  mime: string | null;
}

/**
 * Baut den Speicherpfad.
 *
 * Das erste Segment ist immer die Mandanten-ID — darauf stuetzen sich die
 * Storage-Policies. Der Pfad wird deshalb serverseitig gebildet und nie aus
 * einer Formulareingabe uebernommen.
 */
export function bildPfad(
  mandantId: string,
  objektId: string,
  dateiname: string,
): string {
  const endung = dateiname.split(".").pop()?.toLowerCase() ?? "jpg";
  const sicher = /^[a-z0-9]{1,5}$/.test(endung) ? endung : "jpg";
  return `${mandantId}/${objektId}/${crypto.randomUUID()}.${sicher}`;
}

/** Titelbild zuerst, danach nach Reihenfolge. */
export function bilderSortieren<T extends { ist_titelbild: boolean; reihenfolge: number }>(
  bilder: T[],
): T[] {
  return [...bilder].sort((a, b) => {
    if (a.ist_titelbild !== b.ist_titelbild) return a.ist_titelbild ? -1 : 1;
    return a.reihenfolge - b.reihenfolge;
  });
}
