// ============================================================================
// onoffice-suchkriterien v2 — Suchkriterien aus onOffice ins Adressbuch
// ----------------------------------------------------------------------------
// BELEGT durch Sonde (14.09.2026):
//   - searchcriterias/get mit { mode: "internal", ids: [<Adress-IDs>] } liefert je
//     Adresse das Kriterium: vermarktungsart[], objektart[], objekttyp[],
//     range_kaufpreis [von,bis], range_kaltmiete, range_wohnflaeche,
//     range_anzahl_zimmer, Umkreis {range (km), range_ort, range_plz,
//     range_breitengrad, range_laengengrad}, _meta {status, editdate,
//     internaladdressid}. Adressen ohne Kriterium liefern nichts.
//   - search/get "searchcriteria" listet zwar 542 Kriterien, ignoriert aber
//     listlimit (immer 10) — deshalb v2: alle Kontakte mit onoffice_id in
//     Bloecken von 50 abfragen (ca. 80 Aufrufe, naechtlich).
// Modus "import" (Standard, Cron 03:40 UTC): schreibt kontakte.such_profil.
// onOffice fuehrt bei den Kriterienfeldern; lokal gepflegte Werte (quelle_sk =
// portal) bleiben, wenn sie juenger als die onOffice-Aenderung sind. Status,
// Notiz und Pruefdatum bleiben lokal. Modus "sonde": beliebige Aufrufe.
// Auth: Header x-diagnose-secret (Vault) oder Nutzer-JWT (chef/mitarbeiter).
// Quelle im Repo: portal/suchkriterien/onoffice-suchkriterien.ts
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diagnose-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const URL_OO = "https://api.onoffice.de/api/stable/api.php";
const OBJEKTART: Record<string, string> = {
  haus: "Haus", wohnung: "Wohnung", zimmer: "Wohnung", grundstueck: "Grundstück", buero_praxen: "Gewerbe", einzelhandel: "Gewerbe",
  gastgewerbe: "Gewerbe", hallen_lager_prod: "Gewerbe", freizeitimmbilien_gewerblich: "Gewerbe", land_und_forstwirtschaft: "Sonstiges", sonstige: "Sonstiges",
};
const MFH_TYPEN = ["mehrfamilienhaus", "hausbau_mehrfamilienhaus", "wohn_und_geschaeftshaus", "wohnanlage", "wohnanlagen", "geschaeftshaus"];
const DB_SEITE = 1000;

async function hmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)))));
}
async function call(token: string, secret: string, resourcetype: string, actionType: string, parameters: Record<string, unknown>, resourceid = "") {
  const actionid = `urn:onoffice-de-ns:smart:2.5:smartml:action:${actionType}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const h = await hmac(timestamp + token + resourcetype + actionid, secret);
  const payload = { token, request: { actions: [{ actionid, resourceid, resourcetype, identifier: "", timestamp, hmac: h, hmac_version: "2", parameters }] } };
  const resp = await fetch(URL_OO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = await resp.json();
  const r = json?.response?.results?.[0];
  const code = r?.status?.errorcode ?? json?.status?.code;
  if (code && String(code) !== "0" && String(code) !== "200") throw new Error(`onOffice ${code}: ${r?.status?.message ?? json?.status?.message ?? ""}`);
  return { status: r?.status, meta: r?.data?.meta, records: r?.data?.records ?? [] };
}
const num = (v: unknown): number | null => { const n = Number(String(v ?? "").replace(",", ".")); return isFinite(n) && n > 0 ? n : null; };
const arr = (v: unknown): string[] => Array.isArray(v) ? v.map(String).filter(Boolean) : (v ? [String(v)] : []);

function abbilden(e: any) {
  const verm = arr(e.vermarktungsart).map((v) => v === "kauf" || v === "erbpacht" ? "kauf" : v === "miete" || v === "pacht" ? "miete" : "").filter(Boolean);
  const arten = new Set<string>();
  for (const a of arr(e.objektart)) if (OBJEKTART[a]) arten.add(OBJEKTART[a]);
  if (arr(e.objekttyp).some((t) => MFH_TYPEN.includes(t))) arten.add("Mehrfamilienhaus");
  const miete = verm.includes("miete") && !verm.includes("kauf");
  const preis = miete ? arr(e.range_kaltmiete) : arr(e.range_kaufpreis);
  const zi = arr(e.range_anzahl_zimmer), fl = arr(e.range_wohnflaeche);
  const u = e.Umkreis || {};
  const ortRoh = String(u.range_ort || "").split("/")[0].trim();
  const umkreis = num(u.range_breitengrad) && num(u.range_laengengrad)
    ? { label: [u.range_plz, ortRoh].filter(Boolean).join(" ") || "Umkreis", lat: Number(u.range_breitengrad), lon: Number(u.range_laengengrad), km: num(u.range) || 20 }
    : null;
  return {
    vermarktungsart: [...new Set(verm)], objektarten: [...arten],
    orte: ortRoh || null, plz: u.range_plz ? String(u.range_plz).trim() : null, umkreis,
    preis_von: num(preis[0]), preis_bis: num(preis[1]), zimmer_von: num(zi[0]), flaeche_von: num(fl[0]),
    onoffice_sk_id: e._meta?.id ?? null, onoffice_sk_am: e._meta?.editdate || e._meta?.creationdate || null,
    onoffice_sk_status: String(e._meta?.status ?? ""),
  };
}
const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const geheim = req.headers.get("x-diagnose-secret") || "";
    let ok = false;
    if (geheim) { const { data } = await db.rpc("diagnose_secret_pruefen", { p: geheim }); ok = data === true; }
    if (!ok) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null as any };
      if (u?.user) { const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle(); ok = !!p && ["chef", "mitarbeiter"].includes(p.role); }
    }
    if (!ok) return antwort({ ok: false, fehler: "Keine Berechtigung." });
    const token = Deno.env.get("ONOFFICE_TOKEN")!, secret = Deno.env.get("ONOFFICE_SECRET")!;
    if (!token || !secret) throw new Error("ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.");
    const body = await req.json().catch(() => ({}));
    const modus = String(body.modus || "import");

    if (modus === "sonde") {
      const versuche: Record<string, unknown> = {};
      for (const v of Array.isArray(body.versuche) ? body.versuche : []) {
        try { versuche[v.name || v.rt] = await call(token, secret, v.rt, v.action || "get", v.params || {}, v.rid || ""); }
        catch (e) { versuche[v.name || v.rt] = { fehler: String(e) }; }
      }
      return antwort({ ok: true, versuche });
    }

    // ---------- 1) Alle Kontakte mit onoffice_id (seitenweise)
    const kontakte = new Map<string, any>();
    for (let von = 0; ; von += DB_SEITE) {
      let q = db.from("kontakte").select("id, onoffice_id, such_profil").not("onoffice_id", "is", null).order("onoffice_id").range(von, von + DB_SEITE - 1);
      if (body.kontakt_id) q = q.eq("id", body.kontakt_id);
      const { data, error } = await q;
      if (error) throw error;
      for (const k of data || []) if (/^\d+$/.test(String(k.onoffice_id))) kontakte.set(String(k.onoffice_id), k);
      if (!data || data.length < DB_SEITE) break;
    }
    const ids = [...kontakte.keys()];
    const maxBloecke = Math.min(Math.max(Number(body.bloecke) || 200, 1), 200);

    // ---------- 2) Kriterien je Adresse holen und abbilden
    let gelesen = 0, aktualisiert = 0, unveraendert = 0, lokalBehalten = 0, bloecke = 0;
    const fehler: string[] = []; const beispiele: any[] = [];
    const trocken = body.trocken === true;
    for (let i = 0; i < ids.length && bloecke < maxBloecke; i += 50) {
      const block = ids.slice(i, i + 50).map((x) => Number(x));
      bloecke++;
      let r;
      try { r = await call(token, secret, "searchcriterias", "get", { mode: "internal", ids: block }); }
      catch (e) { fehler.push(`Block ${i}: ${String(e)}`); continue; }
      for (const rec of r.records) {
        const e = rec?.elements || {}; gelesen++;
        const adr = String(e._meta?.internaladdressid ?? "");
        const k = kontakte.get(adr); if (!k) continue;
        const neu = abbilden({ ...e, _meta: { ...(e._meta || {}), id: rec.id } });
        const alt = (k.such_profil && typeof k.such_profil === "object") ? k.such_profil : {};
        const lokalAm = alt.quelle_sk === "portal" && alt.geaendert_am ? new Date(alt.geaendert_am).getTime() : 0;
        const ooAm = neu.onoffice_sk_am ? new Date(String(neu.onoffice_sk_am).replace(" ", "T") + "+02:00").getTime() : 0;
        if (lokalAm && lokalAm > ooAm) { lokalBehalten++; continue; }
        const felder = ["vermarktungsart", "objektarten", "orte", "plz", "umkreis", "preis_von", "preis_bis", "zimmer_von", "flaeche_von"];
        const geaendert = felder.some((f) => !gleich((alt as any)[f], (neu as any)[f]));
        if (!geaendert && alt.onoffice_sk_id) { unveraendert++; continue; }
        const status = alt.status && alt.status !== "aktiv" ? alt.status : (neu.onoffice_sk_status === "0" ? "pausiert" : (alt.status || "aktiv"));
        const profil = { ...alt, ...neu, status, quelle_sk: "onoffice", geaendert_am: new Date().toISOString() };
        if (!trocken) {
          const { error } = await db.from("kontakte").update({ such_profil: profil }).eq("id", k.id);
          if (error) { fehler.push(`${adr}: ${error.message}`); continue; }
        }
        aktualisiert++;
        if (beispiele.length < 5) beispiele.push({ onoffice_id: adr, profil });
      }
    }
    return antwort({ ok: fehler.length === 0, modus, trocken, kontakte_mit_onoffice_id: ids.length, bloecke, kriterien_gelesen: gelesen, aktualisiert, unveraendert, lokal_behalten: lokalBehalten, fehler: fehler.slice(0, 5), beispiele });
  } catch (e) { return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }); }
});
