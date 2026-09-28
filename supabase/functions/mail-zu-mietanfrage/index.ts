// ============================================================================
// Edge Function: mail-zu-mietanfrage
// ============================================================================
// Konvertiert eine Mail aus mail_eingang manuell zu einer Mietanfrage.
// Nutzt Claude um Daten aus dem Mail-Text zu extrahieren.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `Du bist Spezialist fuer Immobilien-Mietanfragen.
Aus dem Text einer eingegangenen E-Mail sollst du strukturierte Daten extrahieren.

Antworte AUSSCHLIESSLICH mit gueltigem JSON in genau dieser Struktur:

{
  "vorname": "string oder null",
  "nachname": "string oder null",
  "anrede": "Herr / Frau / Familie / Eheleute / null",
  "email": "string oder null",
  "telefon": "string oder null",
  "objekt_strasse": "string oder null",
  "objekt_plz": "string oder null",
  "objekt_ort": "string oder null",
  "objekt_kaltmiete": "Zahl oder null",
  "einzug_ab": "YYYY-MM-DD oder null",
  "haushaltsgroesse": "Zahl oder null",
  "haustier": "string oder null",
  "beruf": "string oder null",
  "einkommen_netto": "Zahl oder null",
  "nachricht": "string oder null"
}

Antworte NUR mit dem JSON, ohne weitere Erklaerung.`;

async function parseWithClaude(absender: string, betreff: string, body: string): Promise<Record<string, any>> {
  if (!ANTHROPIC_API_KEY) return {};
  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Absender: ${absender}\nBetreff: ${betreff}\n\nMail-Inhalt:\n\n${body.substring(0, 6000)}`,
        }],
      }),
    });
    if (!resp.ok) {
      console.error("Claude-API-Fehler:", resp.status);
      return {};
    }
    const data = await resp.json();
    let text = data?.content?.[0]?.text || "";
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) text = codeBlock[1].trim();
    return JSON.parse(text);
  } catch (e) {
    console.error("Claude-Parsing-Fehler:", e);
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mail_eingang_id } = body;

    if (!mail_eingang_id) {
      return new Response(JSON.stringify({ ok: false, error: "mail_eingang_id fehlt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Mail laden
    const { data: mail, error: mErr } = await admin
      .from("mail_eingang")
      .select("*")
      .eq("id", mail_eingang_id)
      .maybeSingle();

    if (mErr || !mail) {
      return new Response(JSON.stringify({ ok: false, error: "Mail nicht gefunden" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Wenn schon eine Mietanfrage existiert: zurueck mit ID
    if (mail.mietanfrage_id) {
      return new Response(JSON.stringify({ ok: true, id: mail.mietanfrage_id, schon_vorhanden: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // KI-Parsing
    const extrahiert = await parseWithClaude(mail.absender_email || "", mail.betreff || "", mail.text || "");

    const mietanfrage = {
      quelle: mail.quelle || "mail",
      status: "neu",
      eingegangen_am: mail.gesendet_am || mail.abgerufen_am,
      email_message_id: mail.message_id,
      email_eingang_postfach: mail.empfaenger_email,
      email_eingang_absender: mail.absender_email,
      email_eingang_betreff: mail.betreff,
      email_eingang_text: mail.text,
      email_eingang_html: mail.html,
      email_eingang_datum: mail.gesendet_am,
      email_imap_uid: mail.imap_uid,
      anrede: extrahiert.anrede || null,
      vorname: extrahiert.vorname || null,
      nachname: extrahiert.nachname || (mail.absender_name && !extrahiert.vorname ? mail.absender_name : null),
      email: extrahiert.email || mail.absender_email || null,
      telefon: extrahiert.telefon || null,
      beruf: extrahiert.beruf || null,
      einkommen_netto: extrahiert.einkommen_netto || null,
      haushaltsgroesse: extrahiert.haushaltsgroesse || null,
      haustier: extrahiert.haustier || null,
      einzug_ab: extrahiert.einzug_ab || null,
      objekt_strasse: extrahiert.objekt_strasse || null,
      objekt_plz: extrahiert.objekt_plz || null,
      objekt_ort: extrahiert.objekt_ort || null,
      objekt_kaltmiete: extrahiert.objekt_kaltmiete || null,
      mitteilung_text: extrahiert.nachricht || null,
    };

    const { data: neu, error: insErr } = await admin
      .from("mietanfragen")
      .insert(mietanfrage)
      .select()
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verknuepfung in mail_eingang aktualisieren
    await admin.from("mail_eingang").update({ mietanfrage_id: neu.id }).eq("id", mail.id);

    return new Response(JSON.stringify({ ok: true, id: neu.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Unerwarteter Fehler:", e);
    return new Response(JSON.stringify({
      ok: false, error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});