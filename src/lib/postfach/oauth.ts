import { createHmac, timingSafeEqual } from "node:crypto";

import { schluesselLaden } from "@/integrationen/kern/zugangsdaten";

/**
 * OAuth2 fuer Microsoft 365 und Google (P2). Die Anwendung bekommt nur ein
 * Aktualisierungstoken; Zugriffstoken werden bei Bedarf erneuert. Client-ID
 * und -Geheimnis kommen aus der Umgebung (docs/ANLEITUNG.md), nie aus dem Code.
 */

export type OAuthArt = "microsoft" | "google";

export interface OAuthKonfig {
  art: OAuthArt;
  clientId: string;
  clientSecret: string;
  tenant: string;
}

export const MICROSOFT_SCOPES = ["offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"];
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/userinfo.email"];

export type Umgebung = Record<string, string | undefined>;

export function oauthKonfig(art: OAuthArt, umgebung: Umgebung = process.env): OAuthKonfig | null {
  if (art === "microsoft") {
    const clientId = umgebung["MICROSOFT_CLIENT_ID"];
    const clientSecret = umgebung["MICROSOFT_CLIENT_SECRET"];
    if (!clientId || !clientSecret) return null;
    return { art, clientId, clientSecret, tenant: umgebung["MICROSOFT_TENANT_ID"] || "common" };
  }
  const clientId = umgebung["GOOGLE_CLIENT_ID"];
  const clientSecret = umgebung["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  return { art, clientId, clientSecret, tenant: "" };
}

export function oauthVerfuegbar(art: OAuthArt, umgebung: Umgebung = process.env): boolean {
  return oauthKonfig(art, umgebung) !== null;
}

function tokenUrl(k: OAuthKonfig): string {
  return k.art === "microsoft"
    ? `https://login.microsoftonline.com/${encodeURIComponent(k.tenant)}/oauth2/v2.0/token`
    : "https://oauth2.googleapis.com/token";
}

export function autorisierungsUrl(k: OAuthKonfig, redirectUri: string, state: string): string {
  if (k.art === "microsoft") {
    const p = new URLSearchParams({
      client_id: k.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: MICROSOFT_SCOPES.join(" "),
      state,
      prompt: "select_account",
    });
    return `https://login.microsoftonline.com/${encodeURIComponent(k.tenant)}/oauth2/v2.0/authorize?${p.toString()}`;
  }
  const p = new URLSearchParams({
    client_id: k.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export interface TokenErgebnis {
  accessToken: string;
  /** ISO-Zeitpunkt, bis zu dem das Zugriffstoken gilt. */
  gueltigBis: string;
  refreshToken: string | null;
}

interface TokenAntwort {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenAnfrage(
  k: OAuthKonfig,
  felder: Record<string, string>,
  fetchFn: typeof globalThis.fetch,
): Promise<TokenErgebnis> {
  const antwort = await fetchFn(tokenUrl(k), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: k.clientId, client_secret: k.clientSecret, ...felder }).toString(),
  });
  const daten = (await antwort.json().catch(() => ({}))) as TokenAntwort;
  if (!antwort.ok || !daten.access_token) {
    // Der Fehlertext des Anbieters ist knapp und enthaelt keine Geheimnisse.
    throw new Error(`Anmeldung beim Anbieter fehlgeschlagen (${daten.error ?? `HTTP ${antwort.status}`}).`);
  }
  const sekunden = typeof daten.expires_in === "number" ? daten.expires_in : 3600;
  return {
    accessToken: daten.access_token,
    gueltigBis: new Date(Date.now() + Math.max(60, sekunden - 60) * 1000).toISOString(),
    refreshToken: daten.refresh_token ?? null,
  };
}

/** Autorisierungscode gegen Tokens tauschen (Rueckruf nach der Anmeldung). */
export async function codeEintauschen(
  k: OAuthKonfig,
  code: string,
  redirectUri: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<TokenErgebnis> {
  const felder: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: redirectUri };
  if (k.art === "microsoft") felder["scope"] = MICROSOFT_SCOPES.join(" ");
  return tokenAnfrage(k, felder, fetchFn);
}

export async function tokenAuffrischen(
  k: OAuthKonfig,
  refreshToken: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<TokenErgebnis> {
  const felder: Record<string, string> = { grant_type: "refresh_token", refresh_token: refreshToken };
  if (k.art === "microsoft") felder["scope"] = MICROSOFT_SCOPES.join(" ");
  return tokenAnfrage(k, felder, fetchFn);
}

/** Adresse des angemeldeten Kontos — fuer die Anzeige und die Eindeutigkeit je Benutzer. */
export async function kontoAdresse(
  art: OAuthArt,
  accessToken: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string | null> {
  const url =
    art === "microsoft"
      ? "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName"
      : "https://www.googleapis.com/oauth2/v3/userinfo";
  const antwort = await fetchFn(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!antwort.ok) return null;
  const daten = (await antwort.json().catch(() => ({}))) as { mail?: string; userPrincipalName?: string; email?: string };
  return daten.mail ?? daten.email ?? daten.userPrincipalName ?? null;
}

// ---------------------------------------------------------------------------
// Signierter Zustand (state): bindet den Rueckruf an Benutzer, Mandant und
// Absicht, damit niemand ein fremdes Konto in einen fremden Mandanten haengt.
// ---------------------------------------------------------------------------

export interface OAuthAbsicht {
  benutzerId: string;
  mandantId: string;
  art: OAuthArt;
  /** true = Unternehmenspostfach (nur Verwaltung) */
  unternehmen: boolean;
  /** Ablauf als Unix-Sekunden */
  bis: number;
}

const STATE_GUELTIG_SEKUNDEN = 15 * 60;

function b64url(daten: Buffer): string {
  return daten.toString("base64url");
}

function signatur(nutzlast: string, schluessel: Buffer): string {
  return b64url(createHmac("sha256", schluessel).update(nutzlast).digest());
}

export function stateErzeugen(absicht: Omit<OAuthAbsicht, "bis">, schluessel: Buffer = schluesselLaden(), jetzt = Date.now()): string {
  const nutzlast = b64url(Buffer.from(JSON.stringify({ ...absicht, bis: Math.floor(jetzt / 1000) + STATE_GUELTIG_SEKUNDEN })));
  return `${nutzlast}.${signatur(nutzlast, schluessel)}`;
}

export function statePruefen(state: string, schluessel: Buffer = schluesselLaden(), jetzt = Date.now()): OAuthAbsicht | null {
  const teile = state.split(".");
  if (teile.length !== 2) return null;
  const [nutzlast, unterschrift] = teile as [string, string];
  const erwartet = signatur(nutzlast, schluessel);
  const a = Buffer.from(unterschrift);
  const b = Buffer.from(erwartet);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const absicht = JSON.parse(Buffer.from(nutzlast, "base64url").toString("utf8")) as OAuthAbsicht;
    if (typeof absicht.bis !== "number" || absicht.bis * 1000 < jetzt) return null;
    if (absicht.art !== "microsoft" && absicht.art !== "google") return null;
    if (typeof absicht.benutzerId !== "string" || typeof absicht.mandantId !== "string") return null;
    return { ...absicht, unternehmen: Boolean(absicht.unternehmen) };
  } catch {
    return null;
  }
}

/** Gemeinsame Fehlerform fuer Netzfehler der Anbieter — ohne Geheimnisse. */
export function fehlerText(e: unknown): string {
  if (e instanceof Error) return e.message.replace(/Bearer\s+\S+/g, "Bearer …").slice(0, 300);
  return String(e).slice(0, 300);
}
