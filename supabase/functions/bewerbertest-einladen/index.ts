// ============================================================================
// Edge Function: bewerbertest-einladen  (v2)
// Legt eine Test-Einladung fuer einen Makler-Bewerber an und liefert den Link.
// v2: Der Test laeuft jetzt IM Portal (index.html) unter ?bewerbertest=TOKEN
//     (gleiches Muster wie die Signatur-Seite) statt auf bewerbertest.html.
// Berechtigung: nur Chef-Rolle. Versand des Links erfolgt manuell (Kopieren).
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonErr(status: number, msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function tokenErzeugen(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const vorname = (body.vorname || "").trim();
    const nachname = (body.nachname || "").trim();
    const email = (body.email || "").trim() || null;
    const quereinsteiger = !!body.quereinsteiger;
    const notiz = (body.notiz || "").trim() || null;

    if (!vorname || !nachname) return jsonErr(400, "vorname und nachname sind Pflicht");

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonErr(401, "Kein Auth-Token");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonErr(401, "Nicht authentifiziert");

    const { data: profile } = await admin
      .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (profile?.role !== "chef") return jsonErr(403, "Bewerber-Tests sind nur fuer die Chef-Rolle verfuegbar");

    const token = tokenErzeugen();
    const { data: einladung, error: insErr } = await admin
      .from("bewerber_einladungen")
      .insert({
        erstellt_von: userData.user.id,
        vorname, nachname, email, quereinsteiger, notiz, token,
      })
      .select()
      .single();
    if (insErr) return jsonErr(500, "Einladung konnte nicht angelegt werden: " + insErr.message);

    const base = (body.base_url || "https://immooffice.example/").replace(/[?#].*$/, "");
    const link = `${base}?bewerbertest=${token}`;

    return new Response(JSON.stringify({ ok: true, einladung, link }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("bewerbertest-einladen Fehler:", e);
    return jsonErr(500, e instanceof Error ? e.message : String(e));
  }
});
