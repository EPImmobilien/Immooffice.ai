// onoffice-objekt-speichern v2 — onOffice-Felder live + interne Notiz + Webseiten-Freigabe
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ONOFFICE_URL = "https://api.onoffice.de/api/stable/api.php";
const ERLAUBTE_FELDER = ["objekttitel", "kaufpreis", "kaltmiete"];

async function hmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
async function modifyEstate(token: string, secret: string, estateId: string, daten: Record<string, unknown>) {
  const actionid = "urn:onoffice-de-ns:smart:2.5:smartml:action:modify";
  const resourcetype = "estate";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const h = await hmac(timestamp + token + resourcetype + actionid, secret);
  const payload = { token, request: { actions: [{ actionid, resourceid: estateId, resourcetype, identifier: "", timestamp, hmac: h, hmac_version: "2", parameters: { data: daten } }] } };
  const resp = await fetch(ONOFFICE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = await resp.json();
  const a0 = json?.response?.results?.[0];
  const code = a0?.status?.errorcode ?? json?.status?.code;
  if (code && code !== 0 && code !== 200) throw new Error(`onOffice-Fehler ${code}: ${a0?.status?.message ?? json?.status?.message ?? ""}`);
  return a0;
}
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) throw new Error("Nicht angemeldet.");
    const { data: profil } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) throw new Error("Keine Berechtigung.");

    const { onoffice_id, felder, intern_notiz, auf_webseite } = await req.json();
    if (!onoffice_id) throw new Error("onoffice_id fehlt.");

    const onofficeDaten: Record<string, unknown> = {};
    if (felder && typeof felder === "object") {
      for (const k of ERLAUBTE_FELDER) {
        if (felder[k] !== undefined && felder[k] !== null && felder[k] !== "") onofficeDaten[k] = felder[k];
      }
    }

    let onofficeGeschrieben = false;
    if (Object.keys(onofficeDaten).length > 0) {
      const token = Deno.env.get("ONOFFICE_TOKEN");
      const secret = Deno.env.get("ONOFFICE_SECRET");
      if (!token || !secret) throw new Error("ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.");
      await modifyEstate(token, secret, String(onoffice_id), onofficeDaten);
      onofficeGeschrieben = true;
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (onofficeDaten.objekttitel !== undefined) update.titel = onofficeDaten.objekttitel;
    if (onofficeDaten.kaufpreis !== undefined) update.kaufpreis = num(onofficeDaten.kaufpreis);
    if (onofficeDaten.kaltmiete !== undefined) update.kaltmiete = num(onofficeDaten.kaltmiete);
    if (intern_notiz !== undefined) {
      update.intern_notiz = intern_notiz || null;
      update.intern_aktualisiert_am = new Date().toISOString();
      update.intern_aktualisiert_von = userData.user.id;
    }
    if (auf_webseite !== undefined) update.auf_webseite = !!auf_webseite;

    const { error: upErr } = await supabase.from("onoffice_objekte").update(update).eq("onoffice_id", String(onoffice_id));
    if (upErr) throw new Error("Spiegel-Update fehlgeschlagen: " + upErr.message);

    return new Response(JSON.stringify({ ok: true, onoffice_geschrieben: onofficeGeschrieben }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, fehler: e instanceof Error ? e.message : String(e) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});