/**
 * Propstack-API (docs/AUTONOMIE.md 5.2): REST mit API-Schluessel im Kopf.
 *
 * Grundlage ist die oeffentliche Dokumentation (api.propstack.de/v1). Ohne
 * Testzugang sind Pfade und Feldnamen ANNAHMEN — deshalb stehen sie hier an
 * einer Stelle und die Verbindungspruefung meldet, welche erwarteten Felder
 * das Konto tatsaechlich liefert (docs/ZUGAENGE_FEHLEND.md).
 */

export const PROPSTACK_BASIS = "https://api.propstack.de/v1";

export const PFAD = {
  objekte: "/units",
  kontakte: "/contacts",
} as const;

export class PropstackFehler extends Error {
  constructor(
    meldung: string,
    readonly status: number,
  ) {
    super(meldung);
    this.name = "PropstackFehler";
  }
}

export interface Abhaengigkeiten {
  fetch: typeof globalThis.fetch;
  basis?: string;
}

export interface Anfrage {
  methode?: "GET" | "POST" | "PUT" | "DELETE";
  abfrage?: Record<string, string | number | boolean>;
  koerper?: unknown;
}

function meldungFuer(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return "Propstack akzeptiert den API-Schlüssel nicht.";
    case 404:
      return "Propstack kennt diese Ressource nicht.";
    case 422:
      return "Propstack hat die Daten abgelehnt (ungültige oder fehlende Felder).";
    case 429:
      return "Propstack bremst: zu viele Anfragen. Bitte später erneut.";
    default:
      return `Propstack antwortet mit HTTP ${status}.`;
  }
}

/** Ein Aufruf. Antwortkoerper landen nie in Fehlermeldungen (koennen Daten enthalten). */
export async function anfrage<T>(
  zugang: { api_schluessel: string },
  pfad: string,
  a: Anfrage,
  abh: Abhaengigkeiten,
): Promise<T> {
  const url = new URL(`${abh.basis ?? PROPSTACK_BASIS}${pfad}`);
  for (const [k, v] of Object.entries(a.abfrage ?? {})) url.searchParams.set(k, String(v));

  let antwort: Response;
  try {
    antwort = await abh.fetch(url.toString(), {
      method: a.methode ?? "GET",
      headers: {
        "X-API-KEY": zugang.api_schluessel,
        Accept: "application/json",
        ...(a.koerper !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(a.koerper !== undefined ? { body: JSON.stringify(a.koerper) } : {}),
    });
  } catch {
    throw new PropstackFehler("Propstack ist nicht erreichbar.", 0);
  }
  if (!antwort.ok) throw new PropstackFehler(meldungFuer(antwort.status), antwort.status);
  if (antwort.status === 204) return undefined as T;
  const text = await antwort.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PropstackFehler("Die Antwort von Propstack war nicht lesbar.", antwort.status);
  }
}
