// ============================================================
// Edge Function: parse-schmiede-notizen
//
// Nimmt freie Notizen entgegen (PDF, Bild eines handschriftlichen
// Notizzettels, oder Word-Dokument als Text-Inhalt) und extrahiert
// die für die Exposé-Schmiede relevanten Daten.
//
// Im Gegensatz zu "parse-einwertung":
//  - Akzeptiert handschriftliche Notizen (Bilder)
//  - Akzeptiert Word-Dokument als plain text
//  - Akzeptiert PDF
//  - Strukturierte Felder werden erkannt, der Rest landet in "besonderheiten"
//
// Deployment:
//   1. Datei nach supabase/functions/parse-schmiede-notizen/index.ts
//   2. ANTHROPIC_API_KEY in Supabase Edge Function Secrets
//   3. supabase functions deploy parse-schmiede-notizen --no-verify-jwt
//
// Input:  { typ: "pdf"|"image"|"text", data: "...", filename?, mime_type? }
//   - typ=pdf:   data ist base64 PDF
//   - typ=image: data ist base64 Bild (jpeg/png/webp)
//   - typ=text:  data ist plain text (z.B. aus Word extrahiert)
//
// Output: { ok: true, daten: { ... } }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist Spezialist im Extrahieren von Daten aus Notizen
deutscher Immobilienmakler. Die Notizen können handschriftlich, getippt oder
aus Word-Dokumenten kopiert sein. Sie beschreiben oft ein Objekt das vermarktet
werden soll.

Deine Aufgabe: Erkennbare strukturierte Daten extrahieren UND den Rest (alles
was nicht in ein strukturiertes Feld passt — Lagevorteile, Geschichte des Hauses,
besondere Atmosphäre, persönliche Eindrücke des Maklers) in das Feld
"besonderheiten" als Freitext-Zusammenfassung packen.

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
  "hinweis": "string mit Unsicherheiten oder Bemerkungen, oder null"
}

Wichtig:
- "besonderheiten" sollte alles enthalten, was die Atmosphäre und Eigenheiten
  des Objekts beschreibt — perfekte Grundlage für eine spätere Objektbeschreibung
- "ausstattungsliste" als Array kurzer Begriffe (Kamin, Fußbodenheizung, etc.)
- Bei handschriftlichen Notizen: lieber konservativ extrahieren als raten
- Wenn unklar: lieber weglassen oder in "besonderheiten" packen
- Keine Anführungszeichen außerhalb des JSON`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Nur POST" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY nicht gesetzt");

    const body = await req.json();
    const typ = body.typ;
    const data = body.data;
    const filename = body.filename || "datei";
    const mimeType = body.mime_type;

    if (!typ || !data) throw new Error("Felder 'typ' und 'data' erforderlich");

    // Content für Claude zusammenbauen
    let content;
    if (typ === "pdf") {
      content = [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        },
        {
          type: "text",
          text: `Extrahiere aus diesem PDF '${filename}' alle erkennbaren Schmiede-Daten als JSON.`,
        },
      ];
    } else if (typ === "image") {
      content = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType || "image/jpeg",
            data,
          },
        },
        {
          type: "text",
          text: `Extrahiere aus diesem Bild '${filename}' (vermutlich handschriftliche oder fotografierte Notizen) alle erkennbaren Schmiede-Daten als JSON.`,
        },
      ];
    } else if (typ === "text") {
      content = [
        {
          type: "text",
          text: `Hier sind die Notizen als Text:\n\n"""\n${data}\n"""\n\nExtrahiere alle erkennbaren Schmiede-Daten als JSON.`,
        },
      ];
    } else {
      throw new Error(`Unbekannter Typ: ${typ}`);
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
        messages: [{ role: "user", content }],
      }),
    });

    if (!apiResp.ok) {
      const fehler = await apiResp.text();
      throw new Error(`Anthropic API Fehler ${apiResp.status}: ${fehler.slice(0, 500)}`);
    }

    const result = await apiResp.json();
    const rawText = result.content?.[0]?.text || "";
    if (!rawText.trim()) throw new Error("Leere KI-Antwort");

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