/**
 * FlowFact-API (docs/AUTONOMIE.md 5.2): OAuth2 Client Credentials, danach
 * Bearer-Token.
 *
 * ANNAHME ohne Testzugang: Token-Adresse, Basisadresse und Pfade folgen der
 * oeffentlichen Beschreibung der FLOWFACT-Schnittstelle. Sie sind je
 * Integration ueberschreibbar (Anmeldefelder token_url/basis_url) und stehen
 * hier an EINER Stelle, damit die Anpassung nach dem ersten Lauf gegen ein
 * echtes Konto eine Sache von Minuten ist (docs/ZUGAENGE_FEHLEND.md).
 */

export const FLOWFACT_VORGABEN = {
  token_url: "https://api.flowfact.de/oauth/token",
  basis_url: "https://api.flowfact.de/cloud-entity-service/api/v1",
} as const;

export const PFAD = {
  objekte: "/entities/estates",
  kontakte: "/entities/contacts",
} as const;

export interface FlowfactZugang {
  client_id: string;
  client_geheimnis: string;
  token_url?: string | undefined;
  basis_url?: string | undefined;
}

export class FlowfactFehler extends Error {
  constructor(
    meldung: string,
    readonly status: number,
  ) {
    super(meldung);
    this.name = "FlowfactFehler";
  }
}

export interface Abhaengigkeiten {
  fetch: typeof globalThis.fetch;
  jetzt: () => Date;
  /** Schluessel fuer den Token-Zwischenspeicher, etwa die Integrations-ID. */
  zwischenspeicher?: string;
}

function adresse(wert: string | undefined, vorgabe: string): string {
  const t = (wert ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(t) ? t : vorgabe;
}

export function tokenUrl(z: FlowfactZugang): string {
  return adresse(z.token_url, FLOWFACT_VORGABEN.token_url);
}

export function basisUrl(z: FlowfactZugang): string {
  return adresse(z.basis_url, FLOWFACT_VORGABEN.basis_url);
}

// Zugriffstoken leben kurz und gehoeren nicht in die Datenbank: Sie bleiben
// im Speicher des Arbeiters, je Integration, bis kurz vor Ablauf.
const tokens = new Map<string, { token: string; bis: number }>();

export function tokenSpeicherLeeren(): void {
  tokens.clear();
}

export async function tokenHolen(z: FlowfactZugang, abh: Abhaengigkeiten): Promise<string> {
  const schluessel = abh.zwischenspeicher ?? z.client_id;
  const vorhanden = tokens.get(schluessel);
  const jetzt = abh.jetzt().getTime();
  if (vorhanden && vorhanden.bis > jetzt + 30_000) return vorhanden.token;

  let antwort: Response;
  try {
    antwort = await abh.fetch(tokenUrl(z), {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${z.client_id}:${z.client_geheimnis}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    });
  } catch {
    throw new FlowfactFehler("FlowFact ist nicht erreichbar.", 0);
  }
  if (antwort.status === 401 || antwort.status === 403 || antwort.status === 400) {
    throw new FlowfactFehler("FlowFact akzeptiert Client-ID oder Client-Geheimnis nicht.", antwort.status);
  }
  if (!antwort.ok) throw new FlowfactFehler(`FlowFact antwortet bei der Anmeldung mit HTTP ${antwort.status}.`, antwort.status);
  const daten = (await antwort.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!daten.access_token) throw new FlowfactFehler("FlowFact hat kein Zugriffstoken geliefert.", antwort.status);
  const sekunden = typeof daten.expires_in === "number" ? daten.expires_in : 3600;
  tokens.set(schluessel, { token: daten.access_token, bis: jetzt + sekunden * 1000 });
  return daten.access_token;
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
      return "FlowFact lehnt den Zugriff ab (Token abgelaufen oder Berechtigung fehlt).";
    case 404:
      return "FlowFact kennt diese Ressource nicht — Basisadresse oder Pfad prüfen.";
    case 422:
    case 400:
      return "FlowFact hat die Daten abgelehnt (ungültige oder fehlende Felder).";
    case 429:
      return "FlowFact bremst: zu viele Anfragen. Bitte später erneut.";
    default:
      return `FlowFact antwortet mit HTTP ${status}.`;
  }
}

/** Ein Aufruf mit Token; bei 401 wird das Token einmal erneuert. */
export async function anfrage<T>(z: FlowfactZugang, pfad: string, a: Anfrage, abh: Abhaengigkeiten): Promise<T> {
  const url = new URL(`${basisUrl(z)}${pfad}`);
  for (const [k, v] of Object.entries(a.abfrage ?? {})) url.searchParams.set(k, String(v));

  const senden = async (token: string): Promise<Response> => {
    try {
      return await abh.fetch(url.toString(), {
        method: a.methode ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(a.koerper !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(a.koerper !== undefined ? { body: JSON.stringify(a.koerper) } : {}),
      });
    } catch {
      throw new FlowfactFehler("FlowFact ist nicht erreichbar.", 0);
    }
  };

  let antwort = await senden(await tokenHolen(z, abh));
  if (antwort.status === 401) {
    tokens.delete(abh.zwischenspeicher ?? z.client_id);
    antwort = await senden(await tokenHolen(z, abh));
  }
  if (!antwort.ok) throw new FlowfactFehler(meldungFuer(antwort.status), antwort.status);
  if (antwort.status === 204) return undefined as T;
  const text = await antwort.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new FlowfactFehler("Die Antwort von FlowFact war nicht lesbar.", antwort.status);
  }
}
