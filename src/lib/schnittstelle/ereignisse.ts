/**
 * Ereignisse der Rueckrufe — ohne Serverabhaengigkeiten, damit auch
 * Client-Komponenten sie einbinden koennen.
 */
export const RUECKRUF_EREIGNISSE = ["objekt.angelegt", "kontakt.angelegt", "termin.angelegt"] as const;
export type RueckrufEreignis = (typeof RUECKRUF_EREIGNISSE)[number];
export const EREIGNIS_BEZEICHNUNG: Record<RueckrufEreignis, string> = {
  "objekt.angelegt": "Objekt angelegt",
  "kontakt.angelegt": "Kontakt angelegt",
  "termin.angelegt": "Termin angelegt",
};
