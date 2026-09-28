// ============================================================================
// credentials-speichern
// ============================================================================
// Setzt oder aktualisiert Login-Credentials zu einem externen Dienst.
// Nur Chef darf aufrufen. Passwort wird XOR-obfuscated gespeichert.
//
// Input: {
//   service: string,       // z.B. "bewertungsdienst"
//   label: string,
//   url: string,
//   username: string,
//   password: string,
//   hinweis?: string,
// }
// Output: { ok: true, id }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// XOR-Obfuscation mit Server-Secret + Base64
function obfuscate(plaintext: string, secret: string): string {
  if (!plaintext) return "";
  const text = new TextEncoder().encode(plaintext);
  const key = new TextEncoder().encode(secret);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text[i] ^ key[i % key.length];
  }
  return btoa(String.fromCharCode(...out));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const obfSecret  = Deno.env.get("CREDENTIALS_OBF_SECRET");
    if (!obfSecret) throw new Error("CREDENTIALS_OBF_SECRET fehlt in Edge Function Secrets.");

    // Auth-Check
    const authHeader = req.headers.get("Authorization") || "";
    const userJwt = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser(userJwt);
    if (uErr || !userData?.user) throw new Error("Nicht authentifiziert.");

    const { data: profil } = await userClient
      .from("profiles").select("role, name").eq("id", userData.user.id).maybeSingle();
    if (!profil || profil.role !== "chef") throw new Error("Nur der Chef darf Credentials setzen.");

    // Body
    const body = await req.json();
    const service  = (body.service  || "").toString().trim().toLowerCase();
    const label    = (body.label    || "").toString().trim();
    const url      = (body.url      || "").toString().trim();
    const username = (body.username || "").toString().trim();
    const password = (body.password || "").toString();
    const hinweis  = (body.hinweis  || "").toString().trim() || null;

    if (!service || !label || !url || !username || !password) {
      throw new Error("Service, label, url, username und password sind Pflicht.");
    }

    const password_obfuscated = obfuscate(password, obfSecret);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Upsert auf service (unique)
    const { data: existing } = await admin
      .from("external_credentials").select("id").eq("service", service).maybeSingle();

    let row;
    let aktion: "create" | "update" = "create";

    if (existing?.id) {
      aktion = "update";
      const { data, error } = await admin
        .from("external_credentials")
        .update({
          label, url, username, password_obfuscated, hinweis,
          updated_by: userData.user.id,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      row = data;
    } else {
      const { data, error } = await admin
        .from("external_credentials")
        .insert({
          service, label, url, username, password_obfuscated, hinweis,
          updated_by: userData.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      row = data;
    }

    // Audit-Log
    await admin.from("external_credentials_audit").insert({
      credential_id: row.id,
      user_id: userData.user.id,
      user_name: profil.name || null,
      aktion,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    return jsonResponse({ ok: true, id: row.id, aktion });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("credentials-speichern:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 400);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}