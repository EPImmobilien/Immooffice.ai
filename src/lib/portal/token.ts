import { createHash, randomBytes } from "node:crypto";

/**
 * Zugangslinks des Kundenbereichs: Der Token geht nur per Link an den Kunden,
 * in der Datenbank liegt ausschliesslich der SHA-256-Hash (portal_kunden.
 * token_hash, projekte.token bleibt im Klartext, weil die Projektseite
 * oeffentlich ist und der Token dort nur die Adresse unerratbar macht).
 */
export function tokenErzeugen(): { token: string; hash: string } {
  const token = randomBytes(24).toString("hex"); // 48 Zeichen [a-f0-9]
  return { token, hash: tokenHash(token) };
}

/** Gleiche Rechnung wie intern.portal_token_hash in der Datenbank. */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function istToken(wert: unknown): wert is string {
  return typeof wert === "string" && /^[a-z0-9]{16,64}$/.test(wert);
}
