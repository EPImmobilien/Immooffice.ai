/**
 * Verschluesselung gespeicherter Fremd-Zugangsdaten (E-2026-09-03-10).
 *
 * AES-256-GCM, Schluessel aus VERSCHLUESSELUNG_SCHLUESSEL (32 Byte, Base64),
 * je Datensatz ein zufaelliger 12-Byte-Vektor. Die Mandanten-ID geht als
 * Zusatzdaten (AAD) in die Authentisierung ein: Ein Geheimtext, der in die
 * Zeile eines anderen Mandanten kopiert wird, laesst sich dort nicht mehr
 * entschluesseln — eine zweite Grenze neben der Row-Level-Security.
 *
 * Format:  v1.<iv>.<tag>.<geheimtext>   (alle Teile Base64-URL)
 * Die Versionsnummer erlaubt spaeter einen Schluesselwechsel ohne Bruch.
 *
 * Diese Datei ist serverseitig — `server-only` verhindert, dass sie je in ein
 * Client-Bundle geraet und den Schluessel ausliefert.
 */

import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHMUS = "aes-256-gcm";
const IV_BYTES = 12;

export const FORMAT = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function vonB64url(text: string): Buffer {
  return Buffer.from(text, "base64url");
}

/**
 * Liest den Schluessel aus der Umgebung. Wirft mit klarer Meldung, wenn er
 * fehlt oder die falsche Laenge hat — eine stille Vorgabe waere ein
 * Schluessel, den jeder kennt.
 */
export function schluesselLaden(quelle: string | undefined = process.env["VERSCHLUESSELUNG_SCHLUESSEL"]): Buffer {
  if (!quelle || quelle.trim() === "") {
    throw new Error(
      "VERSCHLUESSELUNG_SCHLUESSEL fehlt. Erzeugen mit `openssl rand -base64 32` — siehe .env.example.",
    );
  }
  const schluessel = Buffer.from(quelle.trim(), "base64");
  if (schluessel.length !== 32) {
    throw new Error(
      "VERSCHLUESSELUNG_SCHLUESSEL muss 32 Byte lang sein (Base64 von `openssl rand -base64 32`).",
    );
  }
  return schluessel;
}

/**
 * Verschluesselt einen Klartext fuer genau diesen Mandanten.
 *
 * Der Klartext ist ueblicherweise ein JSON-Objekt mit den Anmeldefeldern des
 * Connectors; die Funktion selbst ist formatneutral.
 */
export function verschluesseln(klartext: string, mandantId: string, schluessel: Buffer = schluesselLaden()): string {
  const iv = randomBytes(IV_BYTES);
  const chiffre = createCipheriv(ALGORITHMUS, schluessel, iv);
  chiffre.setAAD(Buffer.from(mandantId, "utf8"));
  const geheim = Buffer.concat([chiffre.update(klartext, "utf8"), chiffre.final()]);
  const tag = chiffre.getAuthTag();
  return `${VERSION}.${b64url(iv)}.${b64url(tag)}.${b64url(geheim)}`;
}

/**
 * Entschluesselt fuer diesen Mandanten. Wirft bei falschem Mandanten,
 * verfaelschtem Text oder falschem Schluessel — in allen Faellen dieselbe
 * Meldung, damit ein Angreifer nicht unterscheiden kann, was fehlschlug.
 */
export function entschluesseln(text: string, mandantId: string, schluessel: Buffer = schluesselLaden()): string {
  if (!FORMAT.test(text)) {
    throw new Error("Die gespeicherten Zugangsdaten haben kein bekanntes Format.");
  }
  const [, iv, tag, geheim] = text.split(".") as [string, string, string, string];
  try {
    const dechiffre = createDecipheriv(ALGORITHMUS, schluessel, vonB64url(iv));
    dechiffre.setAAD(Buffer.from(mandantId, "utf8"));
    dechiffre.setAuthTag(vonB64url(tag));
    return Buffer.concat([dechiffre.update(vonB64url(geheim)), dechiffre.final()]).toString("utf8");
  } catch {
    throw new Error("Die Zugangsdaten konnten nicht entschluesselt werden.");
  }
}

/** Bequemlichkeit fuer den ueblichen Fall: Objekt rein, Objekt raus. */
export function objektVerschluesseln(
  zugangsdaten: Record<string, unknown>,
  mandantId: string,
  schluessel?: Buffer,
): string {
  return verschluesseln(JSON.stringify(zugangsdaten), mandantId, schluessel);
}

export function objektEntschluesseln(
  text: string,
  mandantId: string,
  schluessel?: Buffer,
): Record<string, unknown> {
  const roh: unknown = JSON.parse(entschluesseln(text, mandantId, schluessel));
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) {
    throw new Error("Die Zugangsdaten konnten nicht entschluesselt werden.");
  }
  return roh as Record<string, unknown>;
}
