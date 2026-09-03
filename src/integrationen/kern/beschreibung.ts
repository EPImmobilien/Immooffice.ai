/**
 * Serialisierbare Beschreibung der Connectoren fuer Client-Komponenten.
 *
 * Client-Komponenten koennen keine Funktionen oder Zod-Schemata empfangen;
 * sie brauchen nur Namen, Anmeldefelder und Faehigkeiten.
 */

import type { Anmeldeart, Anmeldefeld, AnbieterId, Faehigkeit } from "./connector";
import { CONNECTOREN, faehigkeitenVon } from "./registry";

export interface ConnectorBeschreibung {
  id: AnbieterId;
  name: string;
  beschreibung: string;
  anmeldung: Anmeldeart;
  anmeldefelder: Anmeldefeld[];
  faehigkeiten: Faehigkeit[];
  /** Wahr, wenn der Connector schon etwas kann — sonst nur angekuendigt. */
  verfuegbar: boolean;
}

export function connectorBeschreibungen(): ConnectorBeschreibung[] {
  return CONNECTOREN.map((c) => {
    const faehigkeiten = faehigkeitenVon(c.id);
    return {
      id: c.id,
      name: c.name,
      beschreibung: c.beschreibung,
      anmeldung: c.anmeldung,
      anmeldefelder: c.anmeldefelder.map((f) => ({ ...f })),
      faehigkeiten,
      verfuegbar: faehigkeiten.length > 0,
    };
  });
}
