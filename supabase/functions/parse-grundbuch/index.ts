// ============================================================
// parse-grundbuch
//
// Scannt Grundbuchauszuege per Claude Vision API und extrahiert
// strukturierte Daten:
//   - Amtsgericht, Grundbuch von, Blatt
//   - Bestandsverzeichnis: Gemarkung, Flur, Flurstueck, Groesse, Wirtschaftsart
//   - Abteilung I: Eigentuemer
//   - Abteilung II: Lasten / Beschraenkungen
//   - Abteilung III: Grundschulden / Hypotheken
//
// Input:  { image_base64: "...", mime_type: "image/jpeg" }
//   ODER  { images_base64: ["...", "..."], mime_type: "image/jpeg" }  (mehrseitig)
// Output: { ok: true, data: {...} } oder { ok: false, error: "..." }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const SYSTEM_PROMPT = `Du analysierst einen deutschen Grundbuchauszug und extrahierst die strukturierten Daten daraus. Antworte ausschliesslich mit gueltigem JSON, ohne Markdown-Codeblock-Markierungen, ohne erklaerenden Text drumherum.

Struktur des erwarteten JSON:
{
  "amtsgericht": string | null,
  "grundbuch_von": string | null,
  "blatt": string | null,
  "bestandsverzeichnis": [
    {
      "lfd_nr": string | null,
      "gemarkung": string | null,
      "flur": string | null,
      "flurstueck": string | null,
      "wirtschaftsart": string | null,
      "lage": string | null,
      "groesse_qm": string | null
    }
  ],
  "eigentuemer": [
    {
      "lfd_nr": string | null,
      "name": string | null,
      "anteil": string | null,
      "grundlage_eintragung": string | null
    }
  ],
  "abteilung_ii": [
    {
      "lfd_nr": string | null,
      "beschreibung": string | null
    }
  ],
  "abteilung_iii": [
    {
      "lfd_nr": string | null,
      "betrag": string | null,
      "waehrung": string | null,
      "glaeubiger": string | null,
      "beschreibung": string | null
    }
  ],
  "zusammenfassung": string,
  "warnhinweise": string[]
}

Wichtig:
- Wenn ein Feld unklar ist, gib null zurueck. Erfinde keine Werte.
- Betraege als String mit deutschem Format (z.B. "150.000,00").
- Bei zusammenfassung: ein 2-3 Saetze langer Ueberblick fuer den Makler.
- Bei warnhinweise: Auffaelligkeiten wie "Insolvenzvermerk", "Zwangsversteigerungsvermerk", offene Grundschulden mit Betrag, Wegerechte etc.
- Wenn das Bild kein Grundbuchauszug ist, antworte mit:
  {"amtsgericht":null,"grundbuch_von":null,"blatt":null,"bestandsverzeichnis":[],"eigentuemer":[],"abteilung_ii":[],"abteilung_iii":[],"zusammenfassung":"Das Dokument scheint kein Grundbuchauszug zu sein.","warnhinweise":[]}`;

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY fehlt in Edge Function Secrets.");

    const body = await req.json();
    const images = body.images_base64 || (body.image_base64 ? [body.image_base64] : []);
    const mimeType = body.mime_type || "image/jpeg";
    if (!images.length) throw new Error("Kein Bild uebergeben (images_base64 oder image_base64).");

    const content = images.map(b64 => ({
      type: "image",
      source: { type: "base64", media_type: mimeType, data: b64 },
    }));
    content.push({
      type: "text",
      text: "Bitte extrahiere die strukturierten Daten aus diesem Grundbuchauszug.",
    });

    const apiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });

    if (!apiResp.ok) {
      const err = await apiResp.text();
      throw new Error(`Anthropic-API-Fehler (${apiResp.status}): ${err.slice(0, 500)}`);
    }

    const apiJson = await apiResp.json();
    const text = apiJson.content?.[0]?.text || "";

    // JSON aus Antwort schaelen
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const startIdx = cleaned.indexOf("{");
    const endIdx = cleaned.lastIndexOf("}");
    if (startIdx >= 0 && endIdx > startIdx) cleaned = cleaned.slice(startIdx, endIdx + 1);

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) {
      throw new Error("Konnte JSON-Antwort nicht parsen: " + e.message + " — Antwort war: " + text.slice(0, 400));
    }

    return new Response(JSON.stringify({ ok: true, data: parsed }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});