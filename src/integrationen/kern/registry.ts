/**
 * Alle bekannten Connectoren. Die Oberflaeche liest ausschliesslich hieraus:
 * Anbieterliste, Anmeldefelder, Faehigkeiten.
 *
 * Ein neuer Anbieter ist eine Zeile hier, eine Datei unter
 * `src/integrationen/<anbieter>/` und ein Wert im Check-Constraint von
 * `integrationen.anbieter`.
 */

import { flowfactConnector } from "../flowfact/connector";
import { onOfficeConnector } from "../onoffice/connector";
import { openImmoConnector } from "../openimmo/connector";
import { propstackConnector } from "../propstack/connector";
import { kann, type AnbieterId, type Connector, type Faehigkeit } from "./connector";

// Die Reihenfolge ist die Anzeigereihenfolge: Erst, was ohne Vertrag geht.
//
// `Connector<never>` ist der gemeinsame Nenner: Die Zugangsdaten sind je
// Anbieter anders typisiert, und wer einen Connector aus der Liste holt, muss
// die Eingabe ohnehin ueber `zugangsdatenSchema` pruefen, bevor er ihn aufruft.
export const CONNECTOREN: readonly Connector<never>[] = [
  openImmoConnector as unknown as Connector<never>,
  onOfficeConnector as unknown as Connector<never>,
  propstackConnector as unknown as Connector<never>,
  flowfactConnector as unknown as Connector<never>,
];

export function connectorFinden(id: string): Connector<never> | null {
  return CONNECTOREN.find((c) => c.id === id) ?? null;
}

export function istAnbieter(id: string): id is AnbieterId {
  return CONNECTOREN.some((c) => c.id === id);
}

/** Faehigkeiten, die der Connector wirklich erfuellt — fuer die Oberflaeche. */
export function faehigkeitenVon(id: string): Faehigkeit[] {
  const c = connectorFinden(id);
  if (!c) return [];
  return c.faehigkeiten.filter((f) => kann(c, f));
}

export const FAEHIGKEIT_BEZEICHNUNG: Record<Faehigkeit, string> = {
  objekte_holen: "Objekte holen",
  objekte_senden: "Objekte senden",
  kontakte_holen: "Kontakte holen",
  kontakte_senden: "Kontakte senden",
  termine: "Termine",
  bilder: "Bilder",
  dokumente: "Dokumente",
  rueckruf: "Rückruf (Webhook)",
};
