// supabase/functions/parse-objektnachweis/index.ts
// Liest einen Objektnachweis-PDF und extrahiert Käufer, Objekt, Kaufpreis,
// Provision und Notar via Claude.
//
// Deploy: supabase functions deploy parse-objektnachweis

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { pdf_base64 } = await req.json();
    if (!pdf_base64) throw new Error("pdf_base64 fehlt");

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt");

    const prompt = `Du bist ein Datenextraktions-Assistent für ein Immobilienmakler-System.
Analysiere das beigefügte PDF (einen Objektnachweis / eine Reservierungsbestätigung / einen
Kaufinteressenten-Nachweis) und extrahiere alle verfügbaren Daten.

Gib NUR ein JSON-Objekt zurück, ohne Markdown-Backticks, ohne Erklärungen:

{
  "angebotsdatum": "2026-05-20",
  "kaeufer": [
    {
      "anrede": "Herr",
      "vorname": "Max",
      "nachname": "Mustermann",
      "strasse": "Beispielweg 3",
      "plz": "18055",
      "ort": "Rostock",
      "geburtsdatum": "1980-04-12",
      "geburtsort": "Rostock",
      "geburt": "1980-04-12",
      "staat": "Deutsch",
      "ausweis": "",
      "ausweis_gueltig": ""
    }
  ],
  "objekt_bezeichnung": "Einfamilienhaus",
  "objekt_strasse": "Musterstraße 12",
  "objekt_plz": "18057",
  "objekt_ort": "Rostock",
  "kaufpreis": "450000",
  "provision": "3,57",
  "notar_name": "",
  "notar_adresse": "",
  "hinweis": "Kurze Anmerkung falls etwas unklar ist oder fehlt"
}

Regeln:
- Felder die nicht im Dokument stehen: leerer String ""
- kaeufer ist ein Array — bei mehreren Käufern alle erfassen, sonst genau ein Objekt
- anrede: "Herr" oder "Frau"
- Datumsangaben im Format YYYY-MM-DD falls möglich
- kaufpreis: nur Ziffern als String (z.B. "450000" nicht "450.000 €")
- provision: als String mit Komma (z.B. "3,57")
- geburt: gleich wie geburtsdatum`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: pdf_base64 },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API Fehler: ${response.status} ${err}`);
    }

    const claudeData = await response.json();
    const text = claudeData.content?.[0]?.text || "";

    let daten: Record<string, unknown> = {};
    try {
      const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
      daten = JSON.parse(cleaned);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        daten = JSON.parse(match[0]);
      } else {
        throw new Error("KI-Antwort konnte nicht als JSON geparst werden: " + text.substring(0, 200));
      }
    }

    return new Response(
      JSON.stringify({ ok: true, daten }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-objektnachweis Fehler:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});