import "server-only";

import type { AusleseAuftrag, AusleseErgebnis, BildAusleseAuftrag, BildAusleseErgebnis } from "./typen";

/**
 * Auslesen von Dokumenten und Fotos (docs/FUNKTIONSABGLEICH.md V1/V2):
 * Vertragsimport, Anhaenge des Notar-Laufzettels, Zaehlerstaende.
 *
 * Wie bei den Texten gilt: Ohne Modellzugang faellt die Anwendung auf
 * einfache Heuristiken zurueck (Regeln ueber den Text) — gekennzeichnet als
 * „ohne KI", ohne Credits. Das Ergebnis geht IMMER in ein editierbares
 * Formular; die Anwendung uebernimmt nichts ungeprueft.
 */

const PREIS_EINGABE_JE_MIO = 125; // Cent, Annahme fuer die Deckungsbeitragsrechnung
const PREIS_AUSGABE_JE_MIO = 1000;

function openAi(): { schluessel: string; modell: string; basisUrl: string } | null {
  const schluessel = process.env["OPENAI_API_KEY"];
  if (!schluessel || schluessel.trim() === "") return null;
  return {
    schluessel,
    modell: process.env["OPENAI_TEXTMODELL"] ?? "gpt-5",
    basisUrl: process.env["OPENAI_BASIS_URL"] ?? "https://api.openai.com/v1",
  };
}

/** Heuristik ohne Modell: bekannte Muster im Text. */
export function heuristischAuslesen(text: string, felder: AusleseAuftrag["felder"]): Record<string, string | null> {
  const werte: Record<string, string | null> = {};
  const t = text.replace(/\s+/g, " ");
  const suche = (re: RegExp): string | null => {
    const m = re.exec(t);
    return m?.[1]?.trim() ?? null;
  };
  for (const f of felder) {
    switch (f.schluessel) {
      case "provision_prozent":
        werte[f.schluessel] = suche(/(\d{1,2}[,.]\d{1,2})\s?%/);
        break;
      case "angebotspreis":
      case "kaufpreis":
        werte[f.schluessel] = suche(/(?:Angebotspreis|Kaufpreis)[^0-9]{0,40}([\d.]{4,}(?:,\d{2})?)\s?(?:€|EUR)/i);
        break;
      case "laufzeit_monate":
        werte[f.schluessel] = suche(/(\d{1,2})\s?Monate/i);
        break;
      case "objekt_plz":
      case "verkaeufer_plz":
        werte[f.schluessel] = suche(/\b(\d{5})\s+[A-ZÄÖÜ][a-zäöüß]+/);
        break;
      case "objekt_ort":
      case "verkaeufer_ort":
        werte[f.schluessel] = suche(/\b\d{5}\s+([A-ZÄÖÜ][a-zäöüß.-]+(?:\s[A-ZÄÖÜ][a-zäöüß.-]+)?)/);
        break;
      case "geschlossen_am": {
        const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(t);
        werte[f.schluessel] = m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
        break;
      }
      case "vertragsart":
        werte[f.schluessel] = /vermiet|miete/i.test(t) && !/verkauf|kaufvertrag/i.test(t) ? "vermietung" : "verkauf";
        break;
      case "provisionsmodell":
        werte[f.schluessel] = /je zur Hälfte|geteilt|Teilung/i.test(t) ? "teilung" : /provisionsfrei für den Käufer|Innenprovision/i.test(t) ? "verkaeufer" : null;
        break;
      case "zaehlernummer":
        werte[f.schluessel] = suche(/(?:Nr\.?|Nummer)[:\s]*([A-Z0-9-]{6,})/i);
        break;
      default:
        werte[f.schluessel] = null;
    }
  }
  return werte;
}

export async function strukturAuslesen(auftrag: AusleseAuftrag): Promise<AusleseErgebnis> {
  const konfig = openAi();
  if (!konfig) {
    return {
      werte: heuristischAuslesen(auftrag.text, auftrag.felder),
      hinweis: "Ohne Modellzugang wurden nur einfache Muster erkannt. Bitte alle Felder prüfen.",
      kiVerwendet: false,
      quelle: "Mustererkennung ohne KI",
      credits: 0,
      kostenCent: 0,
    };
  }

  const anweisung = [
    "Du liest Felder aus einem deutschen Immobilien-Dokument aus.",
    "Regeln: Nur Werte übernehmen, die wörtlich oder eindeutig im Text stehen. Nichts raten. Fehlt ein Wert, gib null zurück.",
    "Antworte ausschließlich mit einem JSON-Objekt mit genau den angeforderten Schlüsseln (Werte als Zeichenkette oder null)",
    "und zusätzlich dem Schlüssel \"hinweis\" (eine kurze Bemerkung zu Unsicherheiten, sonst leer).",
  ].join("\n");
  const felder = auftrag.felder.map((f) => `- ${f.schluessel}: ${f.beschreibung}`).join("\n");

  const antwort = await fetch(`${konfig.basisUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${konfig.schluessel}` },
    body: JSON.stringify({
      model: konfig.modell,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: anweisung },
        { role: "user", content: `Zweck: ${auftrag.zweck}\n\nFelder:\n${felder}\n\nDokumenttext:\n${auftrag.text.slice(0, 40_000)}` },
      ],
    }),
  });
  if (!antwort.ok) {
    const text = await antwort.text().catch(() => "");
    throw new Error(`Die Auslesung ist fehlgeschlagen (${antwort.status}). ${text.slice(0, 200)}`);
  }
  const ergebnis = (await antwort.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  let roh: Record<string, unknown> = {};
  try {
    roh = JSON.parse(ergebnis.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
  } catch {
    throw new Error("Die Antwort des Modells war nicht lesbar.");
  }
  const werte: Record<string, string | null> = {};
  for (const f of auftrag.felder) {
    const w = roh[f.schluessel];
    werte[f.schluessel] = w === null || w === undefined || w === "" ? null : String(w);
  }
  const eingabe = ergebnis.usage?.prompt_tokens ?? 0;
  const ausgabe = ergebnis.usage?.completion_tokens ?? 0;
  return {
    werte,
    hinweis: typeof roh["hinweis"] === "string" ? (roh["hinweis"] as string) : "",
    kiVerwendet: true,
    quelle: `OpenAI ${konfig.modell}`,
    credits: auftrag.credits,
    kostenCent: (eingabe / 1_000_000) * PREIS_EINGABE_JE_MIO + (ausgabe / 1_000_000) * PREIS_AUSGABE_JE_MIO,
  };
}

export async function bildAuslesen(auftrag: BildAusleseAuftrag): Promise<BildAusleseErgebnis> {
  const konfig = openAi();
  if (!konfig) {
    return { werte: {}, hinweis: "Ohne Modellzugang kann ein Foto nicht ausgelesen werden — bitte die Werte von Hand eintragen.", kiVerwendet: false, quelle: "ohne KI", credits: 0, kostenCent: 0 };
  }
  const anweisung = auftrag.zweck === "zaehlerstand"
    ? "Auf dem Foto ist ein Zähler (Strom, Gas, Wasser oder Wärme). Lies Zählernummer, Zählerstand (nur die Vorkommastellen plus Nachkommastellen, wie abgebildet) und die Einheit ab. Antworte nur mit JSON: {\"zaehlernummer\": string|null, \"stand\": string|null, \"einheit\": string|null, \"art\": \"strom\"|\"gas\"|\"kaltwasser\"|\"warmwasser\"|\"heizung\"|null, \"hinweis\": string}. Nichts raten; unleserlich = null."
    : "Lies die sichtbaren Angaben des Belegs aus. Antworte nur mit JSON mit den Schlüsseln der Felder und \"hinweis\".";
  const antwort = await fetch(`${konfig.basisUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${konfig.schluessel}` },
    body: JSON.stringify({
      model: konfig.modell,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: anweisung },
        { role: "user", content: [{ type: "image_url", image_url: { url: `data:${auftrag.mime};base64,${auftrag.bildBase64}` } }] },
      ],
    }),
  });
  if (!antwort.ok) {
    const text = await antwort.text().catch(() => "");
    throw new Error(`Die Bildauslesung ist fehlgeschlagen (${antwort.status}). ${text.slice(0, 200)}`);
  }
  const ergebnis = (await antwort.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  let roh: Record<string, unknown> = {};
  try {
    roh = JSON.parse(ergebnis.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
  } catch {
    throw new Error("Die Antwort des Modells war nicht lesbar.");
  }
  const werte: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(roh)) {
    if (k === "hinweis") continue;
    werte[k] = v === null || v === undefined || v === "" ? null : String(v);
  }
  const eingabe = ergebnis.usage?.prompt_tokens ?? 0;
  const ausgabe = ergebnis.usage?.completion_tokens ?? 0;
  return {
    werte,
    hinweis: typeof roh["hinweis"] === "string" ? (roh["hinweis"] as string) : "",
    kiVerwendet: true,
    quelle: `OpenAI ${konfig.modell}`,
    credits: auftrag.credits,
    kostenCent: (eingabe / 1_000_000) * PREIS_EINGABE_JE_MIO + (ausgabe / 1_000_000) * PREIS_AUSGABE_JE_MIO,
  };
}
