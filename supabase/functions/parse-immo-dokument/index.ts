// ============================================================
// parse-immo-dokument
//
// Universal-Scanner fuer Behoerden-Dokumente rund um Immobilien:
//   - Baulastenverzeichnis-Auszuege
//   - Altlasten-Auskuenfte
//   - Erschliessungs-Bescheide
//   - Sonstige Dokumente
//
// Da diese Dokumente regional sehr unterschiedlich formatiert sind,
// liefern wir KEINE feste Struktur sondern eine vom Makler nutzbare
// Zusammenfassung mit Auflistung der gefundenen Eintraege.
//
// Input:  { image_base64 | images_base64, mime_type, dokument_typ }
//   dokument_typ: "baulasten" | "altlasten" | "erschliessung" | "sonstiges"
// Output: { ok: true, data: {
//   ist_relevant: bool,
//   zusammenfassung: string,
//   eintraege: [{ titel, beschreibung, schwere? "info"|"hinweis"|"warnung" }],
//   warnhinweise: string[]
// }}
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

function buildSystemPrompt(dokumentTyp) {
  const labels = {
    baulasten: "Baulastenverzeichnis-Auszug",
    altlasten: "Altlasten-Auskunft / Bodenbelastungs-Information",
    erschliessung: "Erschliessungs-Bescheid oder Erschliessungs-Auskunft",
    sonstiges: "Behoerden-Dokument zu einer Immobilie",
  };
  const label = labels[dokumentTyp] || labels.sonstiges;

  return `Du analysierst ein deutsches Dokument vom Typ "${label}". Du extrahierst die wichtigsten Eintraege und gibst eine klare Zusammenfassung fuer einen Immobilienmakler aus, der die Information an einen Notar weitergibt.

Antworte ausschliesslich mit gueltigem JSON. Kein Markdown, kein Begleittext.

Struktur:
{
  "ist_relevant": boolean,
  "dokument_titel": string,
  "zusammenfassung": string,
  "eintraege": [
    { "titel": string, "beschreibung": string, "schwere": "info" | "hinweis" | "warnung" }
  ],
  "warnhinweise": string[]
}

Wichtig:
- ist_relevant: false wenn das Dokument kein "${label}" ist (z.B. ein Grundbuchauszug stattdessen)
- zusammenfassung: 3-5 Saetze die den wesentlichen Inhalt erfassen
- eintraege: jeder konkrete Eintrag bekommt einen eigenen Listenpunkt
  - Beispiele Baulasten: "Geh- und Fahrtrecht zugunsten Flurstueck X", "Abstandsflaechen-Uebernahme"
  - Beispiele Altlasten: "Eintrag im Altlastenkataster Nr. XXX", "Verdachtsflaeche fuer Bodenbelastung"
  - Beispiele Erschliessung: "Strassenausbaubeitrag noch nicht entrichtet"
- schwere:
  - "info": Sachverhalt, der einfach festgehalten wird
  - "hinweis": Sollte der Notar wissen
  - "warnung": Kaufrelevante Risiken (z.B. eingetragene Altlasten, hohe ausstehende Erschliessungsbeitraege)
- warnhinweise: kurze stichwortartige Liste der wichtigsten Warnungen

Wenn das Dokument leer/keine Eintraege hat (z.B. "keine Baulasten eingetragen"):
- ist_relevant: true
- zusammenfassung: "Es sind keine ${label.toLowerCase()} eingetragen."
- eintraege: []
- warnhinweise: []

Wenn das Dokument nicht erkennbar ist:
- ist_relevant: false
- zusammenfassung: "Das Dokument konnte nicht als ${label.toLowerCase()} identifiziert werden."`;
}

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
    const dokumentTyp = body.dokument_typ || "sonstiges";
    if (!images.length) throw new Error("Kein Bild uebergeben.");

    const content = images.map(b64 => ({
      type: "image",
      source: { type: "base64", media_type: mimeType, data: b64 },
    }));
    content.push({
      type: "text",
      text: `Bitte analysiere dieses Dokument vom Typ "${dokumentTyp}" und extrahiere die strukturierten Informationen.`,
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
        max_tokens: 2500,
        system: buildSystemPrompt(dokumentTyp),
        messages: [{ role: "user", content }],
      }),
    });

    if (!apiResp.ok) {
      const err = await apiResp.text();
      throw new Error(`Anthropic-API-Fehler (${apiResp.status}): ${err.slice(0, 500)}`);
    }

    const apiJson = await apiResp.json();
    const text = apiJson.content?.[0]?.text || "";

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