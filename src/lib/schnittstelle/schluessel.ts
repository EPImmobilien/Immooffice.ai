import { createHash, randomBytes } from "node:crypto";

/**
 * API-Schluessel (docs/AUTONOMIE.md 5.4): ein Schluessel je Anbindung und
 * Mandant, gespeichert nur als SHA-256-Hash. Der Klartext wird genau einmal
 * angezeigt — beim Anlegen.
 */

export const SCHLUESSEL_PRAEFIX = "io_";

export type Bereich = "objekte" | "kontakte" | "termine";
export type Recht = "keine" | "lesen" | "schreiben";
export type Rechte = Record<Bereich, Recht>;

export const BEREICHE: readonly Bereich[] = ["objekte", "kontakte", "termine"];
export const BEREICH_BEZEICHNUNG: Record<Bereich, string> = { objekte: "Objekte", kontakte: "Kontakte", termine: "Termine" };
export const RECHT_BEZEICHNUNG: Record<Recht, string> = { keine: "kein Zugriff", lesen: "nur lesen", schreiben: "lesen und schreiben" };

export function schluesselHash(schluessel: string): string {
  return createHash("sha256").update(schluessel).digest("hex");
}

export function schluesselErzeugen(): { schluessel: string; hash: string; praefix: string } {
  const schluessel = `${SCHLUESSEL_PRAEFIX}${randomBytes(24).toString("base64url")}`;
  return { schluessel, hash: schluesselHash(schluessel), praefix: schluessel.slice(0, 11) };
}

/** Liest den Schluessel aus `Authorization: Bearer io_…`; sonst null. */
export function schluesselAusKopf(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  const wert = m?.[1];
  if (!wert || !wert.startsWith(SCHLUESSEL_PRAEFIX) || wert.length < 20 || wert.length > 120) return null;
  return wert;
}

export function rechtReicht(vorhanden: Recht | string | undefined, benoetigt: "lesen" | "schreiben"): boolean {
  if (vorhanden === "schreiben") return true;
  if (vorhanden === "lesen") return benoetigt === "lesen";
  return false;
}

export function rechteParsen(wert: unknown): Rechte {
  const roh = (wert && typeof wert === "object" ? wert : {}) as Record<string, unknown>;
  const lesen = (b: Bereich): Recht => {
    const r = roh[b];
    return r === "lesen" || r === "schreiben" ? r : "keine";
  };
  return { objekte: lesen("objekte"), kontakte: lesen("kontakte"), termine: lesen("termine") };
}
