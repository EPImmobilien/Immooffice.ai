// ============================================================================
// onoffice-bilder — holt Titelbilder zu allen aktiven Spiegel-Objekten
// ============================================================================
// Liest per estatepictures-GET (HMAC v2) batchweise die Bild-URLs und
// schreibt das Titelbild (bzw. das erste Foto) in onoffice_objekte.hauptbild_url.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ONOFFICE_URL = "https://api.onoffice.de/api/stable/api.php";
const BATCH = 40;

async function hmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function getPictures(token: string, secret: string, estateIds: string[]) {
  const actionid = "urn:onoffice-de-ns:smart:2.5:smartml:action:get";
  const resourcetype = "estatepictures";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const h = await hmac(timestamp + token + resourcetype + actionid, secret);
  const payload = {
    token,
    request: { actions: [{
      actionid, resourceid: "", resourcetype, identifier: "", timestamp, hmac: h, hmac_version: "2",
      parameters: {
        estateids: estateIds,
        categories: ["Titelbild", "Foto"],
        size: "1024x768",
        language: "DEU",
      },
    }] },
  };
  const resp = await fetch(ONOFFICE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = await resp.json();
  const a0 = json?.response?.results?.[0];
  const code = a0?.status?.errorcode ?? json?.status?.code;
  if (code && code !== 0 && code !== 200) throw new Error(`onOffice-Fehler ${code}: ${a0?.status?.message ?? json?.status?.message ?? ""}`);
  return a0?.data?.records ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: userData } = await supabase.auth.getUser(jwt);
      if (userData?.user) {
        const { data: profil } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
        if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) throw new Error("Keine Berechtigung.");
      }
    }
    const token = Deno.env.get("ONOFFICE_TOKEN");
    const secret = Deno.env.get("ONOFFICE_SECRET");
    if (!token || !secret) throw new Error("ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.");

    const { data: objekte } = await supabase.from("onoffice_objekte").select("onoffice_id").eq("aktiv", true);
    const ids = (objekte || []).map(o => o.onoffice_id);
    if (ids.length === 0) return new Response(JSON.stringify({ ok: true, aktualisiert: 0, info: "Keine Objekte." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let aktualisiert = 0, ohneBild = 0;
    let probeRecord: any = null;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      let records: any[] = [];
      try { records = await getPictures(token, secret, batch); }
      catch (e) { console.warn("Bild-Batch fehlgeschlagen:", e); continue; }
      if (!probeRecord && records.length) probeRecord = records[0];

      // estateid -> beste Bild-URL (Titelbild bevorzugt)
      const byEstate = new Map<string, { url: string; titel: boolean }>();
      for (const r of records) {
        const el = r.elements || {};
        const eid = String(el.estateid ?? el.estateId ?? "");
        const url = el.url ?? el.originalurl ?? "";
        if (!eid || !url) continue;
        const istTitel = /titel/i.test(String(el.type ?? el.imagetype ?? ""));
        const vorhanden = byEstate.get(eid);
        if (!vorhanden || (istTitel && !vorhanden.titel)) byEstate.set(eid, { url, titel: istTitel });
      }

      for (const [eid, info] of byEstate) {
        const { error } = await supabase.from("onoffice_objekte").update({ hauptbild_url: info.url, updated_at: new Date().toISOString() }).eq("onoffice_id", eid);
        if (!error) aktualisiert++;
      }
      ohneBild += batch.length - byEstate.size;
    }

    return new Response(JSON.stringify({ ok: true, aktualisiert, ohne_bild: ohneBild,
      probe_felder: probeRecord ? Object.keys(probeRecord.elements || {}) : null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, fehler: e instanceof Error ? e.message : String(e) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});