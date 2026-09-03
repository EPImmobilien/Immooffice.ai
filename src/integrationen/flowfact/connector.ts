/**
 * FlowFact — angekuendigt fuer Phase 4 (docs/SCOPE.md, Abschnitt G).
 *
 * Registriert, ohne Faehigkeiten — siehe Begruendung im Propstack-Connector.
 * Anmeldung per OAuth2 Client Credentials; Client-ID und -Geheimnis stellt
 * der Mandant aus seinem FlowFact-Konto bereit.
 */

import { z } from "zod";

import type { Connector, Kontext } from "../kern/connector";

const schema = z.object({
  client_id: z.string().trim().min(1, "Die Client-ID fehlt."),
  client_geheimnis: z.string().trim().min(1, "Das Client-Geheimnis fehlt."),
});

export type FlowfactZugangsdaten = z.infer<typeof schema>;

export const flowfactConnector: Connector<FlowfactZugangsdaten> = {
  id: "flowfact",
  name: "FlowFact",
  beschreibung: "Objekte und Kontakte holen, Objekte senden. Verfügbar ab Phase 4.",
  anmeldung: "oauth2_client_credentials",
  anmeldefelder: [
    { schluessel: "client_id", beschriftung: "Client-ID", geheim: false },
    { schluessel: "client_geheimnis", beschriftung: "Client-Geheimnis", geheim: true },
  ],
  faehigkeiten: [],
  zugangsdatenSchema: schema,

  async verbindungPruefen(_kontext: Kontext<FlowfactZugangsdaten>) {
    return { ok: false, meldung: "Die FlowFact-Anbindung ist für Phase 4 vorgesehen und noch nicht verfügbar." };
  },
};
