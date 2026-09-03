/**
 * Propstack — angekuendigt fuer Phase 4 (docs/SCOPE.md, Abschnitt G).
 *
 * Der Connector ist registriert, damit die Oberflaeche ihn als „bald" zeigen
 * kann und das Anmeldeformular schon feststeht. Er erklaert noch KEINE
 * Faehigkeiten: Eine Schaltflaeche, hinter der nichts passiert, ist schlimmer
 * als keine.
 */

import { z } from "zod";

import type { Connector, Kontext } from "../kern/connector";

const schema = z.object({
  api_schluessel: z.string().trim().min(10, "Der API-Schlüssel fehlt oder ist zu kurz."),
});

export type PropstackZugangsdaten = z.infer<typeof schema>;

export const propstackConnector: Connector<PropstackZugangsdaten> = {
  id: "propstack",
  name: "Propstack",
  beschreibung: "Objekte, Kontakte, Aufgaben und Bilder in beide Richtungen. Verfügbar ab Phase 4.",
  anmeldung: "api_schluessel",
  anmeldefelder: [
    { schluessel: "api_schluessel", beschriftung: "API-Schlüssel", geheim: true, hinweis: "Propstack → Einstellungen → API" },
  ],
  faehigkeiten: [],
  zugangsdatenSchema: schema,

  async verbindungPruefen(_kontext: Kontext<PropstackZugangsdaten>) {
    return { ok: false, meldung: "Die Propstack-Anbindung ist für Phase 4 vorgesehen und noch nicht verfügbar." };
  },
};
