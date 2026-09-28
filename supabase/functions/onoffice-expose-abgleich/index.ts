// ============================================================================
// onoffice-expose-abgleich v2 (Cron, alle 2 h)
//   Liest je Interessent (kontakte.onoffice_id, neu in den letzten `tage` Tagen
//   oder mit offenem Versand) das onOffice-Maklerbuch (agentslog, addressid) und
//   erkennt:
//     - Email/Ausgang mit Beratungsebene "E Dokumentation erhalten" = Exposé/
//       Agreementlink versendet  -> onoffice_expose_versand (gesendet_am)
//     - Bestätigung/Eingang "Agreement-Link durchgeführt" -> bestaetigt_am
//     - Download/Download -> heruntergeladen_am
//   v2: Pruefzeitpunkt je Adresse (onoffice_expose_pruefung) -> laengst nicht
//       geprueft zuerst, 120-s-Laufzeitgrenze wird so ueber mehrere Laeufe verteilt.
//   Body: { tage?: 21, limit?: 250, adressen?: number[] }
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const URL_OO = "https://api.onoffice.de/api/stable/api.php";
const READ = "urn:onoffice-de-ns:smart:2.5:smartml:action:read";
async function sig(msg: string, secret: string) { const enc = new TextEncoder(); const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const s = await crypto.subtle.sign("HMAC", key, enc.encode(msg)); return btoa(String.fromCharCode(...new Uint8Array(s))); }
async function ruf(token: string, secret: string, resourcetype: string, parameters: unknown) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = await sig(timestamp + token + resourcetype + READ, secret);
  const body = { token, request: { actions: [{ actionid: READ, resourceid: "", resourcetype, identifier: "", timestamp, hmac, hmac_version: "2", parameters }] } };
  const resp = await fetch(URL_OO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await resp.json(); const a0 = json?.response?.results?.[0];
  if (String(a0?.status?.errorcode ?? "1") !== "0") throw new Error(`onOffice ${a0?.status?.errorcode}: ${a0?.status?.message || json?.status?.message || "?"}`);
  return (a0?.data?.records ?? []) as any[];
}
const tsBerlin = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s || ""); if (!m) return null;
  const utcGuess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const berlin = new Date(new Date(utcGuess).toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const offset = berlin.getTime() - new Date(new Date(utcGuess).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(utcGuess - offset).toISOString();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  const start = Date.now();
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const tage = Number(body.tage) || 21, limit = Number(body.limit) || 250;
    const token = Deno.env.get("ONOFFICE_TOKEN")!, secret = Deno.env.get("ONOFFICE_SECRET")!;
    const seit = new Date(Date.now() - tage * 864e5).toISOString();
    const { data: neu } = await db.from("kontakte").select("id, onoffice_id, email, vorname, nachname, firma").not("onoffice_id", "is", null).gte("created_at", seit).order("created_at", { ascending: false }).limit(limit);
    const { data: offen } = await db.from("onoffice_expose_versand").select("onoffice_adresse_id").is("bestaetigt_am", null).eq("ignoriert", false).gte("gesendet_am", new Date(Date.now() - 45 * 864e5).toISOString());
    const kontakteMap = new Map<number, any>();
    for (const k of neu || []) kontakteMap.set(Number(k.onoffice_id), k);
    const idsAlle = [...new Set<number>([...(neu || []).map((k: any) => Number(k.onoffice_id)), ...(offen || []).map((o: any) => Number(o.onoffice_adresse_id)), ...((body.adressen || []) as number[]).map(Number)])].filter((n) => n > 0);
    const fehlend = idsAlle.filter((id) => !kontakteMap.has(id));
    if (fehlend.length) { const { data: kx } = await db.from("kontakte").select("id, onoffice_id, email, vorname, nachname, firma").in("onoffice_id", fehlend); for (const k of kx || []) kontakteMap.set(Number(k.onoffice_id), k); }
    // Reihenfolge: nie geprueft zuerst, dann am laengsten her
    const { data: pr } = await db.from("onoffice_expose_pruefung").select("onoffice_adresse_id, geprueft_am").in("onoffice_adresse_id", idsAlle);
    const geprMap = new Map((pr || []).map((p: any) => [Number(p.onoffice_adresse_id), new Date(p.geprueft_am).getTime()]));
    const ids = idsAlle.sort((a, b) => (geprMap.get(a) || 0) - (geprMap.get(b) || 0));
    const { data: immos } = await db.from("immobilien").select("id, onoffice_id").not("onoffice_id", "is", null);
    const immoMap = new Map((immos || []).map((i: any) => [String(i.onoffice_id), i.id]));

    let geprueft = 0, neueVersaende = 0, bestaetigt = 0, fehler = 0;
    for (const adr of ids) {
      if (Date.now() - start > 120000) break;
      try {
        const recs = await ruf(token, secret, "agentslog", { addressid: adr, data: ["Objekt_nr", "Aktionsart", "Aktionstyp", "Datum", "Bemerkung", "Benutzer", "Beratungsebene"], listlimit: 200, sortby: "Datum", sortorder: "ASC" });
        geprueft++;
        await db.from("onoffice_expose_pruefung").upsert({ onoffice_adresse_id: adr, geprueft_am: new Date().toISOString() });
        const k = kontakteMap.get(adr);
        const versaende: any[] = [], bestaetigungen: any[] = [], downloads: any[] = [];
        for (const r of recs) {
          const e = r.elements || {}; const objs: string[] = (Array.isArray(e.Objekt_nr) ? e.Objekt_nr : [e.Objekt_nr]).filter(Boolean).map(String);
          const t = tsBerlin(e.Datum); if (!t) continue;
          if (e.Aktionsart === "Email" && e.Aktionstyp === "Ausgang" && /Dokumentation erhalten/i.test(String(e.Beratungsebene || "")) && objs.length) versaende.push({ id: r.id, t, objs, benutzer: e.Benutzer });
          else if (e.Aktionsart === "Bestätigung" && e.Aktionstyp === "Eingang" && /Agreement-?Link/i.test(String(e.Bemerkung || ""))) bestaetigungen.push({ t, objs });
          else if (e.Aktionsart === "Download") downloads.push({ t, objs });
        }
        if (!versaende.length) continue;
        const letzter = new Map<string, any>();
        for (const v of versaende) for (const o of v.objs) letzter.set(o, v);
        for (const [obj, v] of letzter) {
          const best = bestaetigungen.filter((b) => b.objs.includes(obj)).map((b) => b.t).sort().pop() || null;
          const dl = downloads.filter((b) => b.objs.includes(obj)).map((b) => b.t).sort().pop() || null;
          const zeile = {
            agentslog_id: Number(v.id), onoffice_adresse_id: adr, onoffice_objekt_id: Number(obj) || null,
            kontakt_id: k?.id || null, immobilie_id: immoMap.get(obj) || null,
            email: k?.email || null, name: k ? [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || null : null,
            gesendet_am: v.t, bestaetigt_am: best, heruntergeladen_am: dl, benutzer: v.benutzer || null, zuletzt_geprueft: new Date().toISOString(),
          };
          await db.from("onoffice_expose_versand").update({ ignoriert: true }).eq("onoffice_adresse_id", adr).eq("onoffice_objekt_id", Number(obj)).neq("agentslog_id", Number(v.id)).is("bestaetigt_am", null);
          const { data: vorher } = await db.from("onoffice_expose_versand").select("id, bestaetigt_am").eq("agentslog_id", Number(v.id)).maybeSingle();
          if (!vorher) { const { error } = await db.from("onoffice_expose_versand").insert(zeile); if (!error) neueVersaende++; }
          else {
            await db.from("onoffice_expose_versand").update({ bestaetigt_am: best, heruntergeladen_am: dl, zuletzt_geprueft: zeile.zuletzt_geprueft, kontakt_id: zeile.kontakt_id, immobilie_id: zeile.immobilie_id, email: zeile.email, name: zeile.name }).eq("id", vorher.id);
            if (best && !vorher.bestaetigt_am) bestaetigt++;
          }
        }
      } catch (e) { fehler++; console.warn("Adresse", adr, e instanceof Error ? e.message : e); }
    }
    return antwort({ ok: true, kandidaten: ids.length, geprueft, neue_versaende: neueVersaende, neu_bestaetigt: bestaetigt, fehler, sekunden: Math.round((Date.now() - start) / 1000) });
  } catch (e) { return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }); }
});
