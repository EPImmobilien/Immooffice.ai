// Supabase Edge Function: parse-zaehler
//
// Liest aus einem Foto eines Strom-/Gas-/Wasser-/Heizungszaehlers die Werte aus.
//
// Deployment:
//   1. Im Supabase-Dashboard -> Edge Functions -> "Deploy a new function"
//      -> "Via Editor"
//   2. Name: parse-zaehler   (exakt so geschrieben!)
//   3. Diesen kompletten Inhalt einfuegen.
//   4. Deploy.
//   5. Im Tab "Settings": "Verify JWT with legacy secret" -> AN (wie bei den anderen).
//
// Eingabe (request body):
//   { "bild": { "data": "<base64>", "media_type": "image/jpeg" } }
//
// Ausgabe (response body):
//   {
//     "art":    "Strom" | "Gas" | "Wasser (kalt)" | "Wasser (warm)" | "Heizung" | "Sonstiges" | null,
//     "nummer": "<Zaehlernummer>" | null,
//     "stand":  "<Zaehlerstand>"  | null
//   }
// Bei Fehlern:
//   { "error": "<Beschreibung>" }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist ein Assistent, der aus Fotos von Versorgungszaehlern die wichtigsten Werte ausliest. Du bekommst ein Foto und musst Zaehlerart, Zaehlernummer und aktuellen Stand erkennen.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format - kein Markdown, kein Erklaerungstext, nur JSON:

{
  "art":    "<einer der erlaubten Werte>" oder null,
  "nummer": "<Zaehlernummer als String>" oder null,
  "stand":  "<Zaehlerstand als String>" oder null
}

Regeln:

1. art: Ordne den Zaehler einer dieser Kategorien zu (Aufschriften wie "kWh"/"m³"/"MWh" sind Hinweise):
   - "Strom" (Stromzaehler, kWh, oft mit "L1/L2/L3" oder Drehscheibe)
   - "Gas" (Gaszaehler, m³ oder Nm³)
   - "Wasser (kalt)" (Wasseruhr, m³ oder Liter, oft mit blauem Streifen)
   - "Wasser (warm)" (Warmwasseruhr, m³ oder Liter, oft mit rotem Streifen)
   - "Heizung" (Waermemengenzaehler, MWh oder kWh, oft mit "MWh" oder "GJ")
   - "Sonstiges" (wenn unklar)

2. nummer: Die Zaehler-/Geraetenummer. Steht meist klein auf dem Zaehler, oft mit Strichcode oder als "Nr.: ..."-Aufschrift. Manchmal mehrere Zeichen lang. NICHT mit dem Stand verwechseln.

3. stand: Der aktuelle Zaehlerstand als String. WICHTIG:
   - Lies ALLE sichtbaren Ziffern ab - sowohl die schwarzen/weissen Hauptstellen als auch die roten/farbigen Nachkommastellen
   - Format: deutsches Komma als Dezimaltrenner
   - Bei Wasserzaehlern: die 4-5 schwarzen Stellen sind m³, die roten Stellen sind Liter (= Nachkommastellen). Beispiel: schwarze "00021" + rote "112" = "21,112" m³
   - Bei Stromzaehlern: meist 5-6 schwarze Stellen (kWh) + 1 rote Nachkommastelle (= 0,1 kWh). Beispiel: "12345,6"
   - Bei Gaszaehlern: meist 5 schwarze Stellen (m³) + 3 rote Nachkommastellen. Beispiel: "1234,567"
   - Bei digitalen LCD-Zaehlern: einfach die komplette angezeigte Zahl uebernehmen
   - Fuehrende Nullen kuerzen (also "21,112" statt "00021,112")
   - Erfinde nichts. Wenn unklar: lieber null zurueckgeben.

4. Wenn ein Feld nicht eindeutig erkennbar ist, gib null zurueck. Erfinde keine Werte. Antworte NUR mit dem JSON-Objekt.`;

interface ParseRequest {
  bild?: { data: string; media_type: string };
}

interface AnthropicResponse {
  content: { type: string; text?: string }[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Nur POST erlaubt" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY ist nicht konfiguriert." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ParseRequest;
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Body ist kein gueltiges JSON." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.bild || !body.bild.data) {
    return new Response(JSON.stringify({ error: "Es muss ein Bild ('bild')-Objekt mit Base64-Daten uebergeben werden." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Anthropic-Messages-Body bauen
  const messagesContent: Array<Record<string, unknown>> = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: body.bild.media_type || "image/jpeg",
        data: body.bild.data,
      },
    },
    {
      type: "text",
      text: "Bitte lies aus diesem Zaehler-Foto die Werte aus. Antworte nur mit dem JSON-Objekt.",
    },
  ];

  // API-Call
  let anthropicResponse: AnthropicResponse;
  try {
    const r = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: messagesContent }],
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error("[parse-zaehler] Anthropic-Fehler:", r.status, txt);
      return new Response(JSON.stringify({
        error: "Anthropic-API antwortete mit Status " + r.status + ": " + txt.substring(0, 300),
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    anthropicResponse = await r.json();
  } catch (e) {
    console.error("[parse-zaehler] Fetch-Fehler:", e);
    return new Response(JSON.stringify({ error: "Anthropic konnte nicht erreicht werden: " + (e instanceof Error ? e.message : String(e)) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Antwort-Text extrahieren
  const textBlock = anthropicResponse.content?.find((c) => c.type === "text");
  if (!textBlock || !textBlock.text) {
    return new Response(JSON.stringify({ error: "Anthropic lieferte keine Text-Antwort." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // JSON aus der Antwort extrahieren
  let raw = textBlock.text.trim();
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) raw = codeBlockMatch[1].trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    console.error("[parse-zaehler] JSON-Parse-Fehler. Raw:", raw);
    return new Response(JSON.stringify({
      error: "Anthropic-Antwort war kein gueltiges JSON: " + raw.substring(0, 200),
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validieren & normalisieren
  const erlaubteArten = ["Strom", "Gas", "Wasser (kalt)", "Wasser (warm)", "Heizung", "Sonstiges"];
  const result: Record<string, string | null> = {
    art: null,
    nummer: null,
    stand: null,
  };

  if (typeof parsed.art === "string" && erlaubteArten.includes(parsed.art)) {
    result.art = parsed.art;
  } else if (typeof parsed.art === "string" && parsed.art.trim()) {
    // Fuzzy-Mapping: Falls die KI z.B. "Stromzähler" statt "Strom" zurueckgibt
    const lc = parsed.art.toLowerCase();
    if (lc.includes("strom")) result.art = "Strom";
    else if (lc.includes("gas")) result.art = "Gas";
    else if (lc.includes("warm") && lc.includes("wasser")) result.art = "Wasser (warm)";
    else if (lc.includes("kalt") && lc.includes("wasser")) result.art = "Wasser (kalt)";
    else if (lc.includes("wasser")) result.art = "Wasser (kalt)"; // Fallback
    else if (lc.includes("heiz") || lc.includes("waerme") || lc.includes("wärme")) result.art = "Heizung";
    else result.art = "Sonstiges";
  }

  if (typeof parsed.nummer === "string" && parsed.nummer.trim()) {
    result.nummer = parsed.nummer.trim();
  } else if (typeof parsed.nummer === "number") {
    result.nummer = String(parsed.nummer);
  }

  if (parsed.stand != null && String(parsed.stand).trim()) {
    // Normalisieren: Punkt zu Komma (deutsches Format)
    result.stand = String(parsed.stand).trim().replace(/\./g, ",");
  }

  console.log("[parse-zaehler] Erfolgreich:", result);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});