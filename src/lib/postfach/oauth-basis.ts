import { tokenAuffrischen, type OAuthKonfig } from "./oauth";
import type { OAuthZugang, PostfachZugang } from "./typen";

/**
 * Gemeinsamer Unterbau der OAuth-Anbieter: Zugriffstoken bei Bedarf erneuern,
 * eine abgelaufene Sitzung (401) genau einmal wiederholen, erneuerte Tokens
 * fuer den Aufrufer bereithalten (der sie verschluesselt zurueckschreibt).
 */

export class HttpFehler extends Error {
  constructor(
    readonly status: number,
    meldung: string,
  ) {
    super(meldung);
    this.name = "HttpFehler";
  }
}

export function istHttpFehler(e: unknown, status: number): boolean {
  return e instanceof HttpFehler && e.status === status;
}

function mitToken(init: RequestInit, token: string): RequestInit {
  return {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
  };
}

export abstract class OAuthAnbieterBasis {
  protected zugang: OAuthZugang;
  private geaendert = false;

  constructor(
    zugang: OAuthZugang,
    protected readonly fetchFn: typeof globalThis.fetch,
    protected readonly konfig: OAuthKonfig | null,
    private readonly anbieterName: string,
  ) {
    this.zugang = zugang;
  }

  aktualisierterZugang(): PostfachZugang | null {
    return this.geaendert ? this.zugang : null;
  }

  protected async token(erzwingen = false): Promise<string> {
    if (
      !erzwingen &&
      this.zugang.accessToken &&
      this.zugang.gueltigBis &&
      new Date(this.zugang.gueltigBis).getTime() > Date.now() + 30_000
    ) {
      return this.zugang.accessToken;
    }
    if (!this.konfig) {
      throw new Error(
        `${this.anbieterName}: Die Anmeldung ist nicht eingerichtet (Client-ID und -Geheimnis fehlen, siehe docs/ANLEITUNG.md).`,
      );
    }
    const t = await tokenAuffrischen(this.konfig, this.zugang.refreshToken, this.fetchFn);
    this.zugang = {
      ...this.zugang,
      accessToken: t.accessToken,
      gueltigBis: t.gueltigBis,
      ...(t.refreshToken ? { refreshToken: t.refreshToken } : {}),
    };
    this.geaendert = true;
    return t.accessToken;
  }

  /** JSON-Anfrage mit Token; leere Antworten (202/204) liefern undefined. */
  protected async anfrage<T>(url: string, init: RequestInit = {}): Promise<T> {
    let antwort = await this.fetchFn(url, mitToken(init, await this.token()));
    if (antwort.status === 401) {
      antwort = await this.fetchFn(url, mitToken(init, await this.token(true)));
    }
    if (!antwort.ok) {
      throw new HttpFehler(antwort.status, `${this.anbieterName} antwortet mit HTTP ${antwort.status}.`);
    }
    if (antwort.status === 202 || antwort.status === 204) return undefined as T;
    const text = await antwort.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
