// ============================================================================
// credentials-anzeigen
// ============================================================================
// Holt das Klartext-Passwort fuer einen externen Dienst.
// Nur Chef + Mitarbeiter duerfen aufrufen.
// Jede Anfrage wird in external_credentials_audit geloggt.
//
// Input: { service: string }   oder   { credential_id: uuid }
// Output: { ok: true, label, url, username, password, hinweis }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function deobfuscate(obfuscatedBase64: string, secret: string): string {
  if (!obfuscatedBase64) return "";
  const raw = atob(obfuscatedBase64);
  const data = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
  const key = new TextEncoder().encode(secret);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length];
  }
  return new TextDecoder().decode(out);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const obfSecret  = Deno.env.get("CREDENTIALS_OBF_SECRET");
    if (!obfSecret) throw new Error("CREDENTIALS_OBF_SECRET fehlt in Edge Function Secrets.");

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
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) {
      throw new Error("Nur Makler duerfen Credentials anzeigen.");
    }

    const body = await req.json();
    const service = (body.service || "").toString().trim().toLowerCase();
    const credentialId = (body.credential_id || "").toString().trim();

    if (!service && !credentialId) throw new Error("service oder credential_id ist Pflicht.");

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const query = admin.from("external_credentials").select("*").eq("aktiv", true);
    const { data: row, error } = credentialId
      ? await query.eq("id", credentialId).maybeSingle()
      : await query.eq("service", service).maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Credentials nicht gefunden.");

    const passwordPlain = deobfuscate(row.password_obfuscated, obfSecret);

    // Audit-Log
    await admin.from("external_credentials_audit").insert({
      credential_id: row.id,
      user_id: userData.user.id,
      user_name: profil.name || null,
      aktion: "show",
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    return jsonResponse({
      ok: true,
      id: row.id,
      service: row.service,
      label: row.label,
      url: row.url,
      username: row.username,
      password: passwordPlain,
      hinweis: row.hinweis,
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("credentials-anzeigen:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 400);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}