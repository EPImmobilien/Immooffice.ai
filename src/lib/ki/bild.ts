import "server-only";

/**
 * KI-Bildbearbeitung ueber den Provider-Layer (Masterprompt: Originale
 * bleiben unveraendert, jede Bearbeitung ist eine Version, sichtbar
 * gekennzeichnet). Aktuell OpenAI Images (gpt-image-1) ueber /images/edits;
 * der Endpunkt ist ueber OPENAI_BASIS_URL auf einen EU-Anbieter umstellbar.
 * Ohne Schluessel gibt es kein Ergebnis — die Oberflaeche sagt das.
 */

import { BILD_ZWECKE, type BildZweck } from "./bild-zwecke";

export { BILD_ZWECKE, type BildZweck };

export interface BildBearbeitungAuftrag {
  zweck: BildZweck;
  bildBase64: string;
  mime: string;
  /** Optionale Zusatzanweisung des Nutzers (kurz, deutsch) */
  hinweis?: string | undefined;
}

export interface BildBearbeitungErgebnis {
  bildBase64: string;
  mime: "image/png";
  kiVerwendet: boolean;
  quelle: string;
  kostenCent: number;
}

export function bildKiVerfuegbar(): boolean {
  const s = process.env["OPENAI_API_KEY"];
  return Boolean(s && s.trim() !== "");
}

/** Geschaetzter Anbieterpreis je Bild (mittlere Qualitaet) in Cent — fuer das Ledger. */
const PREIS_JE_BILD_CENT = 6;

export async function bildBearbeiten(auftrag: BildBearbeitungAuftrag, fetchFn: typeof globalThis.fetch = globalThis.fetch): Promise<BildBearbeitungErgebnis> {
  const schluessel = process.env["OPENAI_API_KEY"];
  if (!schluessel) throw new Error("Ohne Modellzugang (OPENAI_API_KEY) ist keine KI-Bildbearbeitung möglich.");
  const basis = (process.env["OPENAI_BASIS_URL"] ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const modell = process.env["OPENAI_BILDMODELL"] ?? "gpt-image-1";
  const z = BILD_ZWECKE[auftrag.zweck];
  const anweisung = `${z.anweisung}${auftrag.hinweis ? ` Zusätzlich: ${auftrag.hinweis.slice(0, 300)}` : ""} Keine Texte, Logos oder Wasserzeichen einfügen.`;
  const form = new FormData();
  form.append("model", modell);
  form.append("prompt", anweisung);
  form.append("quality", "medium");
  form.append("size", "auto");
  form.append("image", new Blob([Buffer.from(auftrag.bildBase64, "base64")], { type: auftrag.mime }), `bild.${auftrag.mime.includes("png") ? "png" : "jpg"}`);
  const antwort = await fetchFn(`${basis}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${schluessel}` }, body: form });
  if (!antwort.ok) {
    const text = await antwort.text().catch(() => "");
    throw new Error(`Die Bildbearbeitung ist fehlgeschlagen (${antwort.status}). ${text.slice(0, 200)}`);
  }
  const daten = (await antwort.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = daten.data?.[0]?.b64_json;
  if (!b64) throw new Error("Das Modell hat kein Bild geliefert.");
  return { bildBase64: b64, mime: "image/png", kiVerwendet: true, quelle: `OpenAI ${modell}`, kostenCent: PREIS_JE_BILD_CENT };
}
