import "server-only";

import { OhneKiAnbieter } from "./ohne-ki";
import { OpenAiAnbieter } from "./openai";
import type { TextAnbieter } from "./typen";

export * from "./typen";

/**
 * Waehlt den Textanbieter anhand der Umgebung.
 *
 * Ohne hinterlegten Schluessel faellt die Anwendung auf reine Entwurfstexte aus
 * den Objektdaten zurueck — sie bleibt benutzbar, kennzeichnet das Ergebnis
 * aber ausdruecklich NICHT als KI-Text und berechnet keine Credits.
 *
 * Einzutragen fuer den KI-Betrieb (siehe .env.example):
 *   OPENAI_API_KEY     Schluessel des API-Kontos
 *   OPENAI_TEXTMODELL  Modellbezeichnung, Vorgabe gpt-5
 *   OPENAI_BASIS_URL   optional; auf einen EU-Endpunkt umstellbar
 */
export function textAnbieter(): TextAnbieter {
  const schluessel = process.env["OPENAI_API_KEY"];

  if (!schluessel || schluessel.trim() === "") {
    return new OhneKiAnbieter();
  }

  return new OpenAiAnbieter(
    schluessel,
    process.env["OPENAI_TEXTMODELL"] ?? "gpt-5",
    process.env["OPENAI_BASIS_URL"] ?? "https://api.openai.com/v1",
  );
}

/** Steht ein echtes Modell zur Verfuegung? Steuert Hinweise in der Oberflaeche. */
export function kiVerfuegbar(): boolean {
  const schluessel = process.env["OPENAI_API_KEY"];
  return Boolean(schluessel && schluessel.trim() !== "");
}
