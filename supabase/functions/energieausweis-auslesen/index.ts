// ============================================================================
// Edge Function: energieausweis-auslesen
// ============================================================================
// Nimmt den Storage-Pfad eines hochgeladenen Energieausweises (PDF oder Foto)
// aus dem Bucket "immobilie-dateien" und liest per Claude die relevanten
// Felder aus (Ausweistyp, Kennwert, Klasse, Energieträger, Baujahr Anlage,
// Warmwasser-Flag, Gebäude-Baujahr, Gültigkeit).
//
// Berechtigung: alle authentifizierten Teammitglieder (profiles-Eintrag).
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTRAKTIONS_PROMPT = `
Du bekommst einen deutschen Energieausweis (Wohn- oder Nichtwohngebäude) als Dokument.
Extrahiere die folgenden Felder und antworte AUSSCHLIESSLICH mit einem JSON-Objekt,
ohne Markdown, ohne Erklärungen, ohne Codeblöcke:

{
  "energieausweis_typ": "Bedarfsausweis" | "Verbrauchsausweis" | null,
  "energie_kennwert": Zahl | null,
  "energie_klasse": "A+" | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | null,
  "energie_traeger": Text | null,
  "energie_baujahr_anlage": Zahl | null,
  "energie_warmwasser": true | false | null,
  "baujahr_gebaeude": Zahl | null,
  "gueltig_bis": "YYYY-MM-DD" | null
}

Regeln:
- energie_kennwert = ENDenergie in kWh/(m²·a): beim Bedarfsausweis der Endenergiebedarf,
  beim Verbrauchsausweis der Endenergieverbrauch. NICHT die Primärenergie verwenden.
- energie_klasse: die im Ausweis angegebene Effizienzklasse. Falls keine Klasse angegeben
  ist (ältere Ausweise), leite sie aus dem Endenergie-Kennwert ab:
  A+ ≤30, A ≤50, B ≤75, C ≤100, D ≤130, E ≤160, F ≤200, G ≤250, H >250.
- energie_traeger: wesentlicher Energieträger der Heizung (z.B. "Gas", "Erdgas", "Fernwärme", "Öl", "Wärmepumpe (Strom)", "Pellets").
- energie_baujahr_anlage: Baujahr des Wärmeerzeugers / der Anlagentechnik (nicht des Gebäudes).
- energie_warmwasser: true, wenn Warmwasser im Kennwert enthalten ist; false, wenn ausdrücklich nicht; sonst null.
- baujahr_gebaeude: Baujahr des Gebäudes laut Ausweis.
- gueltig_bis: Gültigkeitsdatum des Ausweises, falls angegeben.
- Wenn du dir bei einem Wert nicht sicher bist oder er nicht lesbar ist: null.
- Erfinde NICHTS.
`.trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { storage_path } = body;
    if (!storage_path || typeof storage_path !== "string") {
      return jsonErr(400, "Fehlende Parameter: storage_path");
    }

    // ---- Auth ----
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonErr(401, "Kein Auth-Token");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return jsonErr(500, "ANTHROPIC_API_KEY nicht gesetzt — bitte in Supabase Secrets eintragen");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonErr(401, "Nicht authentifiziert");

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile) return jsonErr(403, "Kein Teamzugang");

    // ---- Datei aus Storage laden ----
    const { data: blob, error: dlErr } = await admin.storage
      .from("immobilie-dateien")
      .download(storage_path);
    if (dlErr || !blob) return jsonErr(404, "Datei nicht gefunden: " + (dlErr?.message || storage_path));

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) {
      return jsonErr(400, "Datei zu groß (max. 20 MB)");
    }

    // Base64 in Stücken (Stack-Schutz bei großen Dateien)
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const b64 = btoa(bin);

    const pfad = storage_path.toLowerCase();
    const istPdf = pfad.endsWith(".pdf") || blob.type === "application/pdf";
    let contentBlock;
    if (istPdf) {
      contentBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } };
    } else {
      let mediaType = blob.type;
      if (!mediaType || !mediaType.startsWith("image/")) {
        mediaType = pfad.endsWith(".png") ? "image/png" : pfad.endsWith(".webp") ? "image/webp" : "image/jpeg";
      }
      contentBlock = { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };
    }

    // ---- Anthropic API ----
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [
          { role: "user", content: [contentBlock, { type: "text", text: EXTRAKTIONS_PROMPT }] },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error("Anthropic API Fehler:", anthropicResponse.status, errText);
      return jsonErr(500, `KI-Anfrage fehlgeschlagen (${anthropicResponse.status}): ${errText.slice(0, 300)}`);
    }

    const anthropicData = await anthropicResponse.json();
    const text = (anthropicData?.content || [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("\n");

    let felder;
    try {
      felder = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch (_e) {
      console.error("JSON-Parse fehlgeschlagen. Rohtext:", text.slice(0, 500));
      return jsonErr(500, "KI-Antwort konnte nicht gelesen werden");
    }

    return new Response(JSON.stringify({
      ok: true,
      felder,
      usage: anthropicData?.usage || null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Unerwarteter Fehler:", e);
    return jsonErr(500, e instanceof Error ? e.message : String(e));
  }
});

function jsonErr(status: number, msg: string) {
  return new Response(JSON.stringify({ ok: false, fehler: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
