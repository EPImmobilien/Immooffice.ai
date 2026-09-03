/**
 * Aufrufe gegen die onOffice-Schnittstelle: Signatur, Versand, Fehlerbild.
 *
 * Oeffentlich dokumentiertes Verfahren (HMAC-Version 2): Jede Aktion traegt
 * Zeitstempel, Token und eine HMAC-SHA256-Signatur ueber
 * `zeitstempel + token + resourcetype + actionid`, geschluesselt mit dem
 * Geheimnis. Das Geheimnis verlaesst den Server nie.
 *
 * Aus der Referenz uebernommen ist ausschliesslich eine Erkenntnis ueber das
 * Verhalten der Schnittstelle: Sie weist einen GESAMTEN Leseaufruf mit
 * Fehler 141 ab, sobald ein einziger angeforderter Feldname unbekannt ist.
 * Deshalb werden Feldnamen einzeln geprueft (connector.ts), bevor sie
 * gebuendelt angefordert werden.
 */

import { createHmac } from "node:crypto";

export const ONOFFICE_ENDPUNKT = "https://api.onoffice.de/api/stable/api.php/";

export const AKTION = {
  lesen: "urn:onoffice-de-ns:smart:2.5:smartml:action:read",
  anlegen: "urn:onoffice-de-ns:smart:2.5:smartml:action:create",
  aendern: "urn:onoffice-de-ns:smart:2.5:smartml:action:modify",
  holen: "urn:onoffice-de-ns:smart:2.5:smartml:action:get",
} as const;

export type AktionsId = (typeof AKTION)[keyof typeof AKTION];

/** Fehlercode der Schnittstelle fuer unbekannte Feldnamen. */
export const FEHLER_UNBEKANNTES_FELD = 141;

export interface OnOfficeZugang {
  token: string;
  geheimnis: string;
}

export interface Aktion {
  actionid: AktionsId;
  resourcetype: string;
  resourceid?: string;
  parameters?: Record<string, unknown>;
}

export interface Datensatz {
  id: string | number;
  type: string;
  elements: Record<string, unknown>;
}

export interface Aktionsergebnis {
  actionid: string;
  resourcetype: string;
  resourceid?: string;
  status: { errorcode: number; message?: string };
  data: { meta?: { cntabsolute?: number }; records: Datensatz[] };
}

interface Antwort {
  status: { code: number; errorcode: number; message?: string };
  response?: { results?: Aktionsergebnis[] };
}

/** Signatur nach HMAC-Version 2. Oeffentlich, damit sie einzeln testbar ist. */
export function signatur(zugang: OnOfficeZugang, zeitstempel: number, resourcetype: string, actionid: string): string {
  return createHmac("sha256", zugang.geheimnis)
    .update(`${zeitstempel}${zugang.token}${resourcetype}${actionid}`)
    .digest("base64");
}

/** Baut den Anfragekoerper. Oeffentlich fuer Tests; enthaelt das Geheimnis NICHT. */
export function anfrageBauen(zugang: OnOfficeZugang, aktionen: Aktion[], zeitstempel: number): Record<string, unknown> {
  return {
    token: zugang.token,
    request: {
      actions: aktionen.map((a) => ({
        actionid: a.actionid,
        resourceid: a.resourceid ?? "",
        identifier: "",
        resourcetype: a.resourcetype,
        timestamp: zeitstempel,
        hmac: signatur(zugang, zeitstempel, a.resourcetype, a.actionid),
        hmac_version: 2,
        parameters: a.parameters ?? {},
      })),
    },
  };
}

export class OnOfficeFehler extends Error {
  constructor(
    meldung: string,
    public readonly code: number,
  ) {
    super(meldung);
    this.name = "OnOfficeFehler";
  }
}

/**
 * Fuehrt Aktionen aus und liefert je Aktion das Ergebnis.
 *
 * Fehler werden in Nutzersprache uebersetzt; die Rohantwort landet nie in
 * einer Meldung, weil sie Datensaetze anderer Personen enthalten kann.
 */
export async function aufrufen(
  zugang: OnOfficeZugang,
  aktionen: Aktion[],
  abhaengigkeiten: { fetch: typeof globalThis.fetch; jetzt: () => Date; endpunkt?: string },
): Promise<Aktionsergebnis[]> {
  const zeitstempel = Math.floor(abhaengigkeiten.jetzt().getTime() / 1000);
  const koerper = anfrageBauen(zugang, aktionen, zeitstempel);

  let antwort: Response;
  try {
    antwort = await abhaengigkeiten.fetch(abhaengigkeiten.endpunkt ?? ONOFFICE_ENDPUNKT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(koerper),
    });
  } catch {
    throw new OnOfficeFehler("Die onOffice-Schnittstelle ist nicht erreichbar.", 0);
  }

  if (!antwort.ok) {
    throw new OnOfficeFehler(`Die onOffice-Schnittstelle antwortet mit HTTP ${antwort.status}.`, antwort.status);
  }

  let daten: Antwort;
  try {
    daten = (await antwort.json()) as Antwort;
  } catch {
    throw new OnOfficeFehler("Die Antwort der onOffice-Schnittstelle ist nicht lesbar.", 0);
  }

  if (daten.status?.errorcode) {
    throw new OnOfficeFehler(fehlerText(daten.status.errorcode), daten.status.errorcode);
  }

  return daten.response?.results ?? [];
}

/** Fehlercodes der Schnittstelle in Nutzersprache. */
export function fehlerText(code: number): string {
  switch (code) {
    case 1:
    case 11:
    case 12:
    case 13:
      return "Token oder Geheimnis werden von onOffice nicht angenommen.";
    case 14:
    case 15:
      return "Die Signatur ist ungueltig — bitte Zeit des Servers und Geheimnis pruefen.";
    case FEHLER_UNBEKANNTES_FELD:
      return "Ein angefordertes Feld ist in diesem onOffice-Konto unbekannt.";
    case 143:
      return "Der onOffice-Benutzer hat keine Rechte fuer diese Aktion.";
    case 200:
    case 201:
      return "onOffice hat die Anfrage aufgrund eines Limits abgewiesen. Bitte spaeter erneut versuchen.";
    default:
      return `onOffice meldet Fehler ${code}.`;
  }
}
