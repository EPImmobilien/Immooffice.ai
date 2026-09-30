// ============================================================
// Edge Function: claude-chat
//
// Chat-Endpoint fuer den KI-Assistenten im Mitarbeiterbereich.
// Nimmt Konversations-History entgegen und gibt Claude-Antwort zurueck.
//
// Input:  { messages: [{role, content}, ...], system_context?: string }
// Output: { ok: true, antwort: "..." }
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

// Der Assistent gehoert dem Haus, das ihn benutzt. Der Firmenname kommt
// beim Aufruf dazu; der erfundene Geschaeftsfuehrer ist ersatzlos weg.
const BASIS_SYSTEM_PROMPT = `Du bist der KI-Assistent fuer das interne Tool eines Immobilienbueros.
Du hilfst den Mitarbeitern bei taeglichen
Aufgaben rund um Immobilienmakler-Geschaeft.

Du kannst helfen bei:
- Fragen zum Tool ("wo finde ich X", "wie lege ich Y an")
- Immobilien-Texte verfassen (Exposé-Texte, E-Mails, WhatsApp-Nachrichten an Kunden)
- Rechtsfragen rund um Maklergeschaeft (mit Hinweis dass das keine Rechtsberatung ersetzt)
- Berechnungen (Provision, Wohnflaeche, Kaufnebenkosten)
- Generelle Recherche und Beratung

Wichtig:
- Sprache: Deutsch, freundlich und kollegial (du-form ist ok wenn der User dich duzt)
- Knapp und praezise. Keine Romane. Keine ueberfluessigen Floskeln.
- Bei Rechtsfragen: konkret antworten, aber immer am Ende: "Im Zweifel: Anwalt fragen."
- Bei Texten fuer Kunden: professioneller Ton, kurze Saetze, klar.
- Bei E-Mails: Anrede und Schluss kommen extra, du schreibst nur den Hauptteil wenn nicht anders gewuenscht.

Du hast aktuell noch keinen Zugriff auf die DB des Tools — falls jemand nach
konkreten Objekt- oder Kundendaten fragt, sag freundlich dass diese Funktion
gerade entwickelt wird und der User die Daten am besten direkt nennt.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY fehlt." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { messages, system_context, user_info } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "messages-Array fehlt." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // System-Prompt zusammenbauen
    let systemPrompt = BASIS_SYSTEM_PROMPT;
    if (user_info) {
      systemPrompt += `\n\n## Aktueller Nutzer\nName: ${user_info.name || "Unbekannt"}\nRolle: ${user_info.role || "Mitarbeiter"}`;
    }
    if (system_context) {
      systemPrompt += `\n\n## Aktueller Kontext im Tool\n${system_context}`;
    }

    const anthRequest = {
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: String(m.content || "").trim(),
      })).filter(m => m.content.length > 0),
    };

    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthRequest),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic-Fehler:", resp.status, errText);
      return new Response(JSON.stringify({ ok: false, error: `Anthropic-API ${resp.status}: ${errText.substring(0, 500)}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const antwort = data?.content?.[0]?.text || "(Keine Antwort)";

    return new Response(JSON.stringify({
      ok: true,
      antwort,
      usage: data.usage,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Unerwarteter Fehler:", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});