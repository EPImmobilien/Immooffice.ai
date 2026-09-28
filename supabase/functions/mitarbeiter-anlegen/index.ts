// ============================================================================
// mitarbeiter-anlegen (v1, 22.09.2026)
// ============================================================================
// Vorfall: Katja von Wedel konnte sich nicht anmelden - "Anmeldedaten falsch".
// Befund: Das Portal legte Mitarbeiter per auth.signUp() an. Damit bleibt das
// Konto unbestaetigt (email_confirmed_at = null), bis die Person den Link aus
// der Bestaetigungsmail klickt. Kommt die Mail nicht an (Spamfilter, Limit des
// Mailversands), ist die Person ausgesperrt - und die Fehlermeldung nennt nur
// falsche Anmeldedaten. Zusaetzlich ersetzt signUp() im Browser die Sitzung des
// Chefs durch die des neuen Kontos.
//
// Diese Funktion legt das Konto ueber die Admin-API an: sofort bestaetigt, ohne
// Mailversand, ohne die Sitzung des Chefs anzufassen. Das Profil entsteht wie
// bisher ueber den Trigger handle_new_user; Titel, Firma, Stufe und Rechte
// werden danach nachgetragen.
//
// Input:  { email, passwort, name, titel?, firma_id?, stufe?, rechte? }
// Output: { ok, user_id, name }
// Nur der Chef darf aufrufen.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ---- Auth: nur Chef ----
    const authHeader = req.headers.get("Authorization") || "";
    const userJwt = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(userJwt);
    if (userErr || !userData?.user) throw new Error("Nicht authentifiziert.");

    const { data: profil } = await userClient
      .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (!profil || profil.role !== "chef") {
      throw new Error("Nur der Chef darf Mitarbeiter anlegen.");
    }

    // ---- Eingaben ----
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const passwort = String(body.passwort || body.password || "");
    const name = String(body.name || "").trim();
    const titel = String(body.titel || "").trim();
    const firmaId = body.firma_id || null;
    const stufe = body.stufe || null;
    const rechte = body.rechte || null;

    if (!email || !email.includes("@")) throw new Error("Bitte eine gueltige E-Mail-Adresse angeben.");
    if (passwort.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen haben.");
    if (!name) throw new Error("Bitte einen Namen angeben.");

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // ---- Konto anlegen: sofort bestaetigt ----
    const { data: neu, error: anlegeFehler } = await admin.auth.admin.createUser({
      email,
      password: passwort,
      email_confirm: true,
      user_metadata: { name, role: "mitarbeiter", must_change_password: true },
    });
    if (anlegeFehler) {
      const text = String(anlegeFehler.message || "");
      if (/already|registered|exists/i.test(text)) {
        throw new Error("Diese E-Mail-Adresse hat bereits ein Konto.");
      }
      throw anlegeFehler;
    }
    const userId = neu?.user?.id;
    if (!userId) throw new Error("Konto konnte nicht angelegt werden.");

    // ---- Zusatzfelder am Profil (der Trigger hat es bereits erzeugt) ----
    const patch: Record<string, unknown> = {};
    if (titel) patch.titel = titel;
    if (firmaId) patch.firma_id = firmaId;
    if (stufe) patch.stufe = stufe;
    if (rechte) patch.rechte = rechte;
    if (Object.keys(patch).length) {
      const { error: patchFehler } = await admin.from("profiles").update(patch).eq("id", userId);
      if (patchFehler) console.warn("Profil-Zusatzfelder:", patchFehler.message);
    }

    return jsonResponse({ ok: true, user_id: userId, name });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("mitarbeiter-anlegen:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 400);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
