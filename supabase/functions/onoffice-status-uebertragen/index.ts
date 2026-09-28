// ============================================================================
// onoffice-status-uebertragen v1 — Objektstatus der World nach onOffice schreiben
// ----------------------------------------------------------------------------
// Eigenständige Function; der Sync (onoffice-sync / onoffice-import) bleibt unberührt.
//   POST { modus: "werte" }
//        -> erlaubte Auswahlwerte der onOffice-Felder status und status2 (fields/get)
//   POST { modus: "vorschau", zuordnung, quelle }
//        -> was geschrieben würde, ohne zu schreiben
//   POST { modus: "uebertragen", zuordnung, quelle, lauf, offset, limit, bestaetigt: true }
//        -> estate/modify je Objekt, Protokoll in onoffice_status_log, Spiegel onoffice_objekte
// zuordnung: { "<world_status>": { status: "1"|"0"|"2", status2: "<oo_key>" } }
// quelle: "vorschlag" (objekt_status_vorschlag.vorschlag) | "immobilien" (immobilien.status)
// Zugriff: Header x-diagnose-secret (RPC diagnose_secret_pruefen) oder JWT eines Chefs.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diagnose-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const URL_OO = "https://api.onoffice.de/api/stable/api.php";

async function sig(msg: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(s)));
}

async function aktion(token: string, secret: string, actionid: string, resourcetype: string, resourceid: string, parameters: unknown) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const h = await sig(ts + token + resourcetype + actionid, secret);
  const body = { token, request: { actions: [{ actionid, resourceid, resourcetype, identifier: "", timestamp: ts, hmac: h, hmac_version: "2", parameters }] } };
  const resp = await fetch(URL_OO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await resp.json();
  const a0 = json?.response?.results?.[0];
  const code = a0?.status?.errorcode ?? json?.status?.code;
  if (code && code !== 0 && code !== 200) throw new Error(`onOffice ${code}: ${a0?.status?.message ?? json?.status?.message ?? ""}`);
  return a0;
}
const GET = "urn:onoffice-de-ns:smart:2.5:smartml:action:get";
const MODIFY = "urn:onoffice-de-ns:smart:2.5:smartml:action:modify";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    // Zugriff
    let erlaubt = false;
    const geheim = req.headers.get("x-diagnose-secret");
    if (geheim) { const { data } = await db.rpc("diagnose_secret_pruefen", { p: geheim }); erlaubt = data === true; }
    if (!erlaubt) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (jwt) { const { data: u } = await db.auth.getUser(jwt); if (u?.user) { const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle(); erlaubt = p?.role === "chef"; } }
    }
    if (!erlaubt) return antwort({ ok: false, fehler: "Kein Zugriff." }, 401);

    const token = Deno.env.get("ONOFFICE_TOKEN"), secret = Deno.env.get("ONOFFICE_SECRET");
    if (!token || !secret) throw new Error("ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.");
    const body = await req.json().catch(() => ({}));
    const modus = String(body.modus || "vorschau");

    if (modus === "werte") {
      const r = await aktion(token, secret, GET, "fields", "", { labels: true, modules: ["estate"] });
      const felder: Record<string, any> = {};
      for (const rec of r?.data?.records ?? []) { const el = rec?.elements; if (el && typeof el === "object") Object.assign(felder, el); }
      const aus = (k: string) => { const m = felder[k]; return m ? { label: m.label, type: m.type, werte: m.permittedvalues ?? m.permittedValues ?? null } : null; };
      return antwort({ ok: true, status: aus("status"), status2: aus("status2"), vermarktungsart: aus("vermarktungsart") });
    }

    const zuordnung: Record<string, { status?: string; status2?: string }> = body.zuordnung || {};
    if (!Object.keys(zuordnung).length) throw new Error("zuordnung fehlt.");
    const quelle = String(body.quelle || "vorschlag");
    const offset = Number(body.offset) || 0, limit = Math.min(Number(body.limit) || 60, 200);
    const nurImmoNr: string[] | null = Array.isArray(body.nur_immo_nr) ? body.nur_immo_nr.map(String) : null;

    // Objekte mit Ziel-Status
    let liste: { immobilie_id: string; onoffice_id: string; immo_nr: string | null; world_status: string }[] = [];
    if (quelle === "vorschlag") {
      const { data, error } = await db.from("objekt_status_vorschlag").select("immobilie_id, immo_nr, vorschlag, immobilien!inner(onoffice_id)").order("immo_nr");
      if (error) throw error;
      liste = (data || []).filter((z: any) => z.immobilien?.onoffice_id).map((z: any) => ({ immobilie_id: z.immobilie_id, onoffice_id: String(z.immobilien.onoffice_id), immo_nr: z.immo_nr, world_status: z.vorschlag }));
    } else {
      const { data, error } = await db.from("immobilien").select("id, immo_nr, status, onoffice_id").not("onoffice_id", "is", null).order("immo_nr");
      if (error) throw error;
      liste = (data || []).map((z: any) => ({ immobilie_id: z.id, onoffice_id: String(z.onoffice_id), immo_nr: z.immo_nr, world_status: z.status }));
    }
    if (nurImmoNr) liste = liste.filter((z) => nurImmoNr.includes(String(z.immo_nr)));
    liste = liste.filter((z) => zuordnung[z.world_status]);
    const gesamt = liste.length;
    const teil = liste.slice(offset, offset + limit);

    if (modus === "vorschau") {
      const je: Record<string, number> = {};
      for (const z of liste) je[z.world_status] = (je[z.world_status] || 0) + 1;
      return antwort({ ok: true, gesamt, je_status: je, zuordnung, beispiele: teil.slice(0, 10) });
    }

    if (modus !== "uebertragen") throw new Error("Unbekannter Modus.");
    if (body.bestaetigt !== true) throw new Error("uebertragen braucht bestaetigt: true.");
    const lauf = String(body.lauf || new Date().toISOString().slice(0, 16));
    let ok = 0, fehl = 0;
    const protokoll: any[] = [];
    for (const z of teil) {
      const ziel = zuordnung[z.world_status];
      const daten: Record<string, unknown> = {};
      if (ziel.status !== undefined && ziel.status !== null && ziel.status !== "") daten.status = String(ziel.status);
      if (ziel.status2) daten.status2 = ziel.status2;
      let erfolg = true, meldung = "geschrieben " + JSON.stringify(daten);
      try {
        await aktion(token, secret, MODIFY, "estate", z.onoffice_id, { data: daten });
        // Spiegel nachziehen, damit der nächste Sync nichts Altes anzeigt
        const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (daten.status !== undefined) upd.status_code = daten.status;
        await db.from("onoffice_objekte").update(upd).eq("onoffice_id", z.onoffice_id);
        ok++;
      } catch (e) { erfolg = false; meldung = e instanceof Error ? e.message : String(e); fehl++; }
      protokoll.push({ lauf, immobilie_id: z.immobilie_id, onoffice_id: z.onoffice_id, immo_nr: z.immo_nr, world_status: z.world_status, oo_status: daten.status ?? null, oo_status2: daten.status2 ?? null, ok: erfolg, meldung: meldung.slice(0, 500) });
      await new Promise((r) => setTimeout(r, 150));
    }
    if (protokoll.length) await db.from("onoffice_status_log").insert(protokoll);
    return antwort({ ok: true, lauf, gesamt, offset, verarbeitet: teil.length, geschrieben: ok, fehler: fehl, weiter: offset + teil.length < gesamt ? offset + teil.length : null });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
