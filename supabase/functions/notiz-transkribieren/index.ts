// Edge Function: notiz-transkribieren
// Nimmt Audio (Base64) entgegen, schickt an Replicate Whisper, gibt Transkript zurueck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
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

  try {
    const apiToken = Deno.env.get("REPLICATE_API_TOKEN");
    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_TOKEN nicht gesetzt" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const audioBase64 = body?.audio_base64;
    const mimeType = body?.mime_type || "audio/webm";
    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: "audio_base64 fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioDataUrl = `data:${mimeType};base64,${audioBase64}`;

    // Replicate: openai/whisper large-v3 (sehr gut fuer Deutsch)
    const replicateResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e",
        input: {
          audio: audioDataUrl,
          language: "de",
          model: "large-v3",
          transcription: "plain text",
        },
      }),
    });

    if (!replicateResponse.ok) {
      const errText = await replicateResponse.text();
      console.error("Replicate API error:", replicateResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `Replicate: ${replicateResponse.status}`, detail: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prediction = await replicateResponse.json();
    const predictionId = prediction.id;

    // Polling bis fertig
    let result = prediction;
    const maxWait = 60000;
    const startTime = Date.now();

    while ((result.status === "starting" || result.status === "processing") && (Date.now() - startTime) < maxWait) {
      await new Promise(r => setTimeout(r, 1000));
      const statusResp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { "Authorization": `Token ${apiToken}` },
      });
      result = await statusResp.json();
    }

    if (result.status !== "succeeded") {
      return new Response(
        JSON.stringify({ error: `Transkription Status: ${result.status}`, detail: result.error || "" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let text = "";
    if (typeof result.output === "string") {
      text = result.output;
    } else if (result.output?.transcription) {
      text = result.output.transcription;
    } else if (result.output?.text) {
      text = result.output.text;
    } else {
      text = JSON.stringify(result.output);
    }

    return new Response(
      JSON.stringify({ ok: true, text: text.trim() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Fehler:", e instanceof Error ? e.message : String(e));
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});