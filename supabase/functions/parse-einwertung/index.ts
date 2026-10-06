// ============================================================
// Edge Function: parse-einwertung
//
// Nimmt eine PDF einer Objekt-Einwertung/Bewertung entgegen und
// extrahiert die fuer die Exposé-Schmiede relevanten Daten:
//  - Adresse, Ort, PLZ, Strasse
//  - Objektart, Baujahr, Wohnflaeche, Grundstueck, Zimmer
//  - Heizung (Art, Baujahr, Energietraeger)
//  - Fenster (Material, Verglasung, Baujahr)
//  - Ausstattung (Liste)
//  - Energieausweis (Kennwert, Klasse, Art, Traeger)
//  - Marktwert / Kaufpreis
//  - Besonderheiten (Freitext)
//
// Verwendet Anthropic Claude mit document-Block (PDF direkt).
//
// Deployment:
//   1. Datei nach supabase/functions/parse-einwertung/index.ts
//   2. ANTHROPIC_API_KEY in Supabase Edge Function Secrets
//   3. supabase functions deploy parse-einwertung --no-verify-jwt
//
// Input:  { pdf_base64: "...", filename: "..." }
// Output: { ok: true, daten: { objektart, ort, plz, ... }, hinweis: "..." }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist Spezialist im Extrahieren von Daten aus deutschen
Immobilien-Einwertungen / Marktwert-Gutachten / Objektbewertungen.

Deine Aufgabe: Aus der vorgelegten PDF die folgenden Felder extrahieren — alle
in der genauen JSON-Struktur unten. Nur Felder setzen die du im Dokument klar
erkennen kannst, alle anderen weglassen oder auf null setzen.

Antworte AUSSCHLIESSLICH mit gültigem JSON in genau dieser Struktur:
{
  "objektart": "Einfamilienhaus" | "Doppelhaushälfte" | "Reihenhaus" | "Eigentumswohnung" | "Mehrfamilienhaus" | "Grundstück" | "Gewerbeobjekt" | null,
  "ort": "string" | null,
  "plz": "string" | null,
  "strasse": "string" | null,
  "wohnflaeche": <Zahl in m²> | null,
  "grundstueck": <Zahl in m²> | null,
  "zimmer": <Zahl> | null,
  "baujahr": <Zahl 4-stellig> | null,
  "kaufpreis": <Zahl in Euro> | null,
  "heizungsart": "Gas" | "Öl" | "Wärmepumpe" | "Fernwärme" | "Elektro" | "Holzpellets" | "Sonstige" | null,
  "heizungsbaujahr": <Zahl 4-stellig> | null,
  "fensterart_verglasung": "Doppelverglasung" | "Dreifachverglasung" | null,
  "fensterart_material": "Holz" | "Kunststoff" | "Aluminium" | null,
  "fensterbaujahr": <Zahl 4-stellig> | null,
  "ausstattungsliste": ["string", ...] | null,
  "ausstattung_freitext": "string" | null,
  "besonderheiten": "string" | null,
  "energieart": "Verbrauchsausweis" | "Bedarfsausweis" | null,
  "energiekennwert": <Zahl in kWh/(m²·a)> | null,
  "energietraeger": "string" | null,
  "energieklasse": "A+" | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | null,
  "energieausweisGueltig": "string YYYY-MM-DD" | null,
  "hinweis": "string mit Auffälligkeiten oder leer" | null
}

Wichtig:
- "ausstattungsliste" als Array von kurzen Begriffen, z.B. ["Kamin", "Fußbodenheizung", "Einbauküche", "Sauna"]
- "ausstattung_freitext" für längere Ausstattungs-Beschreibungen
- "besonderheiten" für alles Außergewöhnliche (Lage, Aussicht, Geschichte, Materialien)
- Bei Zahlen: nur Zahl, keine Einheit (m², €, kWh)
- Wenn du dir bei einem Wert sehr unsicher bist, setze ihn auf null
- Keine Anführungszeichen außerhalb des JSON`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis
  // im Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne
  // gueltiges Abo kommt trotzdem nicht daran. Die Schranke liegt in
  // der Beilage abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, corsHeaders);
  if (immoAboSperre) return immoAboSperre;
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Nur POST" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY nicht gesetzt");

    const { pdf_base64, filename } = await req.json();
    if (!pdf_base64 || typeof pdf_base64 !== "string") {
      throw new Error("Feld 'pdf_base64' fehlt");
    }

    const apiResp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdf_base64,
              },
            },
            {
              type: "text",
              text: `Bitte extrahiere aus dieser ${filename ? "Datei '" + filename + "'" : "Einwertung"} alle erkennbaren Daten im vorgegebenen JSON-Format.`,
            },
          ],
        }],
      }),
    });

    if (!apiResp.ok) {
      const fehler = await apiResp.text();
      throw new Error(`Anthropic API Fehler ${apiResp.status}: ${fehler.slice(0, 500)}`);
    }

    const result = await apiResp.json();
    const rawText = result.content?.[0]?.text || "";
    if (!rawText.trim()) throw new Error("Leere KI-Antwort");

    // JSON aus möglichen Code-Blöcken extrahieren
    let jsonText = rawText.trim();
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) jsonText = codeBlockMatch[1];

    let daten;
    try {
      daten = JSON.parse(jsonText);
    } catch (_e) {
      throw new Error("KI-Antwort ist kein gültiges JSON: " + jsonText.slice(0, 200));
    }

    return new Response(
      JSON.stringify({ ok: true, daten }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});