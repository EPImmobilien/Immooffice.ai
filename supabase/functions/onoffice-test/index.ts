// onoffice-test v8 — Verbindungstest + Feld-Erkundung (modus:"felder")
// Holt ein echtes Objekt mit ALLEN Feldern und zusaetzlich die Status-Auswahlliste.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ONOFFICE_URL = "https://api.onoffice.de/api/stable/api.php";

async function hmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
async function call(token: string, secret: string, resourcetype: string, actionType: string, parameters: Record<string, unknown>) {
  const actionid = `urn:onoffice-de-ns:smart:2.5:smartml:action:${actionType}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const h = await hmac(timestamp + token + resourcetype + actionid, secret);
  const payload = { token, request: { actions: [{ actionid, resourceid: "", resourcetype, identifier: "", timestamp, hmac: h, hmac_version: "2", parameters }] } };
  const resp = await fetch(ONOFFICE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = await resp.json();
  return json?.response?.results?.[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) throw new Error("Nicht angemeldet.");
    const { data: profil } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) throw new Error("Keine Berechtigung.");

    const token = Deno.env.get("ONOFFICE_TOKEN");
    const secret = Deno.env.get("ONOFFICE_SECRET");
    if (!token || !secret) throw new Error("ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.");

    let body: any = {}; try { body = await req.json(); } catch { /* */ }
    const modus = body.modus || "test";

    if (modus === "felder") {
      // 1) Ein echtes Objekt OHNE data-Filter -> onOffice liefert den vollen Standard-Feldsatz
      const probe = await call(token, secret, "estate", "read", { listlimit: 1, listoffset: 0 });
      const rec = probe?.data?.records?.[0];
      const alleFelder = rec?.elements ?? {};
      // Nach Schluesselwoertern filtern, die mit Status/Verkauf/Veroeffentlichung zu tun haben
      const interessant: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(alleFelder)) {
        if (/status|verkauf|reserv|vermarkt|veroeffent|aktiv|verfueg|published|archiv/i.test(k)) interessant[k] = v;
      }

      // 2) Auswahllisten zu 'status' und 'vermarktungsart' (fields-API mit listboxes)
      let auswahllisten: any = null;
      try {
        const f = await call(token, secret, "fields", "get", { labels: true, language: "DEU", modules: ["estate"], listlimit: 500 });
        const felder = f?.data?.records?.[0]?.elements ?? {};
        const pick: Record<string, unknown> = {};
        for (const name of ["status","vermarktungsart","objektstatus","verkauft","reserviert"]) {
          if (felder[name]) pick[name] = felder[name];
        }
        auswahllisten = pick;
      } catch (e) { auswahllisten = { fehler: String(e) }; }

      return new Response(JSON.stringify({ ok: true, modus: "felder",
        anzahl_felder: Object.keys(alleFelder).length,
        status_relevante_felder: interessant,
        alle_feldnamen: Object.keys(alleFelder).sort(),
        auswahllisten,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Standard-Test
    const a0 = await call(token, secret, "estate", "read", { data: ["Id","objekttitel","ort","vermarktungsart","kaufpreis","kaltmiete","status"], listlimit: 10, listoffset: 0 });
    const code = a0?.status?.errorcode;
    if (code && code !== 0 && code !== 200) return new Response(JSON.stringify({ ok: false, fehler: `onOffice-Fehler ${code}: ${a0?.status?.message ?? ""}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const objekte = (a0?.data?.records ?? []).map((r: any) => ({ id: r.id, ...r.elements }));
    return new Response(JSON.stringify({ ok: true, anzahl: objekte.length, gesamt: a0?.data?.meta?.cntabsolute ?? null, objekte }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, fehler: e instanceof Error ? e.message : String(e) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});