// Edge Function: notiz-analysieren
// Claude analysiert eine Notiz und schlaegt Prio + Tags vor

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis
  // im Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne
  // gueltiges Abo kommt trotzdem nicht daran. Die Schranke liegt in
  // der Beilage abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, corsHeaders);
  if (immoAboSperre) return immoAboSperre;

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY nicht gesetzt" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const text = (body?.text || "").trim();
    const verfuegbareTags = Array.isArray(body?.verfuegbare_tags) ? body.verfuegbare_tags : [];

    if (!text) {
      return new Response(JSON.stringify({ error: "text fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // System-Prompt fuer Claude
    const systemPrompt = `Du bist ein Assistent fuer ein Makler-Tool. Du analysierst kurze Notizen/Aufgaben und schlaegst Metadaten vor.

Du bekommst eine Notiz und gibst zurueck:
1. Eine Prioritaet (normal | wichtig | dringend)
2. Bis zu 3 passende Tags

Prio-Regeln:
- "dringend" nur wenn explizit dringend, Frist heute/morgen, Notfall, krank, sofort
- "wichtig" bei Kunden-Themen, Verkaufschance, Vertragsdetails, Vorgesetzten-Themen
- "normal" bei Routine, allgemeinen Erinnerungen, internen Notizen

Tag-Regeln:
- Bevorzuge Tags aus der Liste der verfuegbaren Tags (wenn passend)
- Schlage maximal 1 neuen Tag vor wenn nichts passt
- Tags sind kurz (1-2 Worte), Kleinbuchstaben, ohne Umlaute (ae/oe/ue/ss), ohne Sonderzeichen
- Typische Tags fuer Makler: anrufe, vermietung, verkauf, buchhaltung, akquise, besichtigung, eigentuemer, marketing, intern, privat

Antworte AUSSCHLIESSLICH als JSON ohne Markdown-Codeblock im Format:
{"prio": "normal", "tags": ["tag1", "tag2"], "begruendung": "kurzer Satz warum"}`;

    const userPrompt = `Notiz: "${text}"

${verfuegbareTags.length > 0
  ? `Verfuegbare Tags (bevorzugt nutzen wenn passend): ${verfuegbareTags.join(", ")}`
  : "Es gibt noch keine Tags. Schlag passende vor."}

Gib JSON zurueck.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic-API-Fehler:", response.status, errText);
      return new Response(JSON.stringify({ error: `API: ${response.status}`, detail: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const claudeText = result?.content?.[0]?.text || "";

    // JSON aus Antwort parsen (Claude liefert manchmal ```json drum herum)
    let analyse;
    try {
      const cleaned = claudeText.replace(/```json|```/g, "").trim();
      analyse = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON-Parse fehlgeschlagen, raw:", claudeText);
      return new Response(JSON.stringify({ error: "Antwort nicht parsbar", raw: claudeText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validieren
    const prio = ["normal", "wichtig", "dringend"].includes(analyse?.prio) ? analyse.prio : "normal";
    const tags = Array.isArray(analyse?.tags) ? analyse.tags.slice(0, 3).map((t) => String(t).toLowerCase().trim()).filter(Boolean) : [];
    const begruendung = String(analyse?.begruendung || "").substring(0, 200);

    return new Response(JSON.stringify({ ok: true, prio, tags, begruendung }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Fehler:", e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});