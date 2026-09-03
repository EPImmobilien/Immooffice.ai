/**
 * Helfer fuer Connector-Tests: kanonische Datensaetze mit wenigen gesetzten
 * Feldern. Nur aus Tests importieren.
 */

import { leererKontakt as leerKontakt, leeresObjekt, type KanonischerKontakt, type KanonischesObjekt } from "./modell";

export function leeresObjektMit(fremdId: string, felder: Partial<KanonischesObjekt>): KanonischesObjekt {
  return { ...leeresObjekt(fremdId), ...felder };
}

export function leerenKontakt(fremdId: string, felder: Partial<KanonischerKontakt>): KanonischerKontakt {
  return { ...leerKontakt(fremdId), ...felder };
}
