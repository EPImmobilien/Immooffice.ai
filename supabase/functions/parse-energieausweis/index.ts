// Supabase Edge Function: parse-energieausweis
//
// Deployment:
//   1. Diese Datei nach: supabase/functions/parse-energieausweis/index.ts
//   2. Im Supabase Dashboard unter "Edge Functions Secrets" sicherstellen,
//      dass ANTHROPIC_API_KEY gesetzt ist (gleicher Key wie fuer
//      "generate-text"-Function).
//   3. Deployen mit:  supabase functions deploy parse-energieausweis --no-verify-jwt
//      (oder mit JWT, falls die anderen Functions auch JWT brauchen)
//
// Was sie tut:
//   - Empfaengt ein Array von JPEG-Base64-Bildern (PDF-Seiten als Bilder)
//   - Schickt sie an Claude Vision (claude-sonnet-4-5) mit strukturiertem Prompt
//   - Parst die JSON-Antwort und gibt die Pflichtangaben strukturiert zurueck
//
// Eingabe-Format (request body):
//   { "bilder": [ { "data": "<base64>", "media_type": "image/jpeg" }, ... ] }
//
// Ausgabe-Format (response body):
//   {
//     "ausweisArt": "Bedarf" | "Verbrauch" | null,
//     "endenergie": "120" | "90,2" | null,        // String, deutsches Format
//     "baujahr":    "1995" | null,                 // String mit 4 Ziffern
//     "energietraeger": "Erdgas" | "Heizoel" | "Fernwaerme" | ... | null
//   }
// Bei Fehlern:
//   { "error": "<Beschreibung>" }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

// CORS-Header fuer Browser-Aufrufe aus claude.immooffice.example o.ae.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist ein Assistent, der deutsche Energieausweise nach GEG (Gebaeudeenergiegesetz) ausliest. Du bekommst Bilder eines Energieausweises (typischerweise dena-Standard) und musst die Pflichtangaben fuer Immobilienanzeigen nach § 87 GEG extrahieren.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau diesem Format - kein Markdown, kein Erklaerungstext, nur JSON:

{
  "ausweisArt": "Bedarf" oder "Verbrauch" oder null,
  "endenergie": "<Zahl als String mit Komma als Dezimaltrenner>" oder null,
  "baujahr": "<4-stellige Zahl als String>" oder null,
  "energietraeger": "<einer der erlaubten Werte unten>" oder null
}

Regeln fuer die Felder:

1. ausweisArt: Schau auf Seite 1 nach dem Ankreuzfeld (X-Kasten). Dort ist entweder "Energiebedarfsausweis" oder "Energieverbrauchsausweis" angekreuzt. WICHTIG: Beide Beschriftungen stehen im PDF, aber nur eine ist angekreuzt. Wenn unsicher: schau auf Seite 2 (Bedarf) und Seite 3 (Verbrauch) - die Seite mit dem ausgefuellten "Endenergie...-Wert dieses Gebaeudes" zeigt die Art an.

2. endenergie: Die Zahl in der Box "Endenergiebedarf dieses Gebaeudes" (Seite 2) oder "Endenergieverbrauch dieses Gebaeudes" (Seite 3) mit dem Vermerk "[Pflichtangabe in Immobilienanzeigen]". Format: deutsche Schreibweise mit Komma. Einheit kWh/(m²·a) NICHT mit ausgeben - nur die Zahl. Beispiele: "90,2" "125" "156,7"

3. baujahr: Aus der Tabelle auf Seite 1, Zeile "Baujahr Gebaeude". NICHT "Baujahr Waermeerzeuger"! Format: 4-stellige Jahreszahl als String.

4. energietraeger: Aus der Zeile "Wesentliche Energietraeger fuer Heizung". Ordne den gefundenen Wert auf genau einen dieser Standard-Werte zu:
   - "Erdgas" (auch fuer "Gas H", "Gas L", "Methan", "Erdgas E")
   - "Heizoel" (auch fuer Brennwertoel)
   - "Fernwaerme" (auch fuer Nahwaerme)
   - "Waermepumpe (Strom)" (auch fuer Erdwaerme, Luft-Wasser, Sole-Wasser)
   - "Holz/Pellets" (auch fuer Biomasse, Scheitholz)
   - "Strom (direkt)" (Elektroheizung, Nachtspeicher)
   - "Fluessiggas" (Propan, LPG)
   - "Sonstige" (wenn nichts davon passt)

Wenn ein Feld nicht eindeutig erkennbar ist, gib null zurueck. Erfinde keine Werte. Antworte NUR mit dem JSON-Objekt.`;

interface ParseRequest {
  bilder: { data: string; media_type: string }[];
}

interface AnthropicResponse {
  content: { type: string; text?: string }[];
  stop_reason?: string;
}

serve(async (req: Request) => {
  // CORS-Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis
  // im Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne
  // gueltiges Abo kommt trotzdem nicht daran. Die Schranke liegt in
  // der Beilage abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, corsHeaders);
  if (immoAboSperre) return immoAboSperre;
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Nur POST erlaubt" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // API-Key pruefen
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY ist nicht konfiguriert." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Body parsen
  let body: ParseRequest;
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Body ist kein gueltiges JSON." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.bilder || !Array.isArray(body.bilder) || body.bilder.length === 0) {
    return new Response(JSON.stringify({ error: "Es muss mindestens ein Bild ('bilder'-Array) uebergeben werden." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Sicherheitslimit: max 5 Bilder (= 5 Seiten)
  const bilder = body.bilder.slice(0, 5);

  // Anthropic-Messages-Body zusammenbauen.
  // image-Bloecke zuerst (damit die KI sie als Kontext nimmt), dann der User-Prompt.
  const messagesContent: Array<Record<string, unknown>> = [];
  for (const bild of bilder) {
    messagesContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: bild.media_type || "image/jpeg",
        data: bild.data,
      },
    });
  }
  messagesContent.push({
    type: "text",
    text: "Bitte extrahiere die Pflichtangaben aus diesem Energieausweis. Antworte nur mit dem JSON-Objekt.",
  });

  // Anthropic API aufrufen
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
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: messagesContent }],
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error("[parse-energieausweis] Anthropic-Fehler:", r.status, txt);
      return new Response(JSON.stringify({
        error: "Anthropic-API antwortete mit Status " + r.status + ": " + txt.substring(0, 300),
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    anthropicResponse = await r.json();
  } catch (e) {
    console.error("[parse-energieausweis] Fetch-Fehler:", e);
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

  // JSON aus der Antwort extrahieren. Claude haelt sich i.d.R. an die Vorgabe,
  // aber zur Sicherheit erlauben wir Markdown-Codeblock-Umrahmung.
  let raw = textBlock.text.trim();
  // ```json ... ``` Wrapper entfernen
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) raw = codeBlockMatch[1].trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("[parse-energieausweis] JSON-Parse-Fehler. Raw:", raw);
    return new Response(JSON.stringify({
      error: "Anthropic-Antwort war kein gueltiges JSON: " + raw.substring(0, 200),
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Felder validieren & normalisieren
  const result: Record<string, string | null> = {
    ausweisArt: null,
    endenergie: null,
    baujahr: null,
    energietraeger: null,
  };

  if (parsed.ausweisArt === "Bedarf" || parsed.ausweisArt === "Verbrauch") {
    result.ausweisArt = parsed.ausweisArt;
  }
  if (parsed.endenergie != null && parsed.endenergie !== "") {
    // Zahl extrahieren, falls Einheit fälschlich mitgegeben
    const s = String(parsed.endenergie).match(/[\d]{1,4}(?:[,.][\d]{1,2})?/);
    if (s) result.endenergie = s[0].replace(".", ",");
  }
  if (parsed.baujahr != null) {
    const j = String(parsed.baujahr).match(/\d{4}/);
    if (j) {
      const jahr = parseInt(j[0], 10);
      if (jahr >= 1800 && jahr <= new Date().getFullYear()) {
        result.baujahr = String(jahr);
      }
    }
  }
  if (typeof parsed.energietraeger === "string" && parsed.energietraeger.trim()) {
    // Mapping fuer die deutschen Umlaute, die Claude evtl. anders schreibt
    let t = parsed.energietraeger.trim();
    t = t.replace(/Heizoel/i, "Heizöl")
         .replace(/Fernwaerme/i, "Fernwärme")
         .replace(/Waermepumpe/i, "Wärmepumpe")
         .replace(/Fluessiggas/i, "Flüssiggas");
    result.energietraeger = t;
  }

  console.log("[parse-energieausweis] Erfolgreich:", result);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});