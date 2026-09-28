// ============================================================================
// onoffice-sync v5 — zurueck auf den SICHEREN Stand
// ----------------------------------------------------------------------------
// v4 enthielt eine Feldliste, die NICHT durch eine echte onOffice-Antwort
// belegt war. Da unbekannte Feldnamen den gesamten Request mit Fehler 141
// abbrechen lassen, ist das hier wieder die belastbare Variante:
//   BASIS  = die 18 Felder, die nachweislich laufen (445 Objekte gelesen)
//   EXTRA  = nur Felder, die der Modus "felder-pruefen" EINZELN getestet und
//            in public.onoffice_felder als gueltig hinterlegt hat
// Nichts wird geraten.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const URL_OO = "https://api.onoffice.de/api/stable/api.php";
const SEITE = 100;

// Nachweislich funktionierend (Stand: Sync mit 445 gelesenen Objekten)
const BASIS = ["Id", "objektnr_extern", "objekttitel", "objektart", "objekttyp", "vermarktungsart",
  "strasse", "hausnummer", "plz", "ort", "kaufpreis", "kaltmiete", "wohnflaeche",
  "grundstuecksflaeche", "anzahl_zimmer", "baujahr", "status", "veroeffentlichen"];

// Kandidaten — werden im Modus "felder-pruefen" EINZELN gegen die API getestet
const KANDIDATEN = [
  "objektnr_intern", "objektbeschreibung", "lage", "ausstatt_beschr", "sonstige_angaben",
  "nutzflaeche", "gesamtflaeche", "anzahl_badezimmer", "anzahl_schlafzimmer",
  "anzahl_balkone", "anzahl_terrassen", "etage", "etagen_zahl", "anzahl_etagen", "wohnungsnr",
  "status2", "verkauft_am", "auftragsart", "auftragbis", "nutzungsart", "stammobjekt",
  "nettokaltmiete", "warmmiete", "nebenkosten", "heizkosten", "kaution", "hausgeld",
  "provision", "innencourtage", "innen_courtage", "aussen_courtage", "provisionsfrei",
  "verfuegbar_ab", "abdatum", "vermietet", "mieteinnahmen_ist", "mieteinnahmen_soll",
  "energieausweistyp", "energieausweis_gueltig_bis", "energieausweisBaujahr",
  "energieklasse", "energyClass", "endenergiebedarf", "energieverbrauchskennwert",
  "energietraeger", "befeuerung", "heizungsart", "warmwasserEnthalten",
  "zustand", "unterkellert", "denkmalgeschuetzt", "balkon", "terrasse",
  "anzahl_stellplaetze", "stellplatzart", "multiParkingLot", "MPPricehubblePrice",
  "laengengrad", "breitengrad", "land",
];

async function sig(msg: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(s)));
}

async function lesen(token: string, secret: string, felder: string[], offset: number, limit: number) {
  const actionid = "urn:onoffice-de-ns:smart:2.5:smartml:action:read";
  const resourcetype = "estate";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = await sig(timestamp + token + resourcetype + actionid, secret);
  const body = {
    token,
    request: { actions: [{ actionid, resourceid: "", resourcetype, identifier: "", timestamp, hmac, hmac_version: "2",
      parameters: { data: felder, listlimit: limit, listoffset: offset } }] },
  };
  const resp = await fetch(URL_OO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await resp.json();
  const a0 = json?.response?.results?.[0];
  const code = a0?.status?.errorcode ?? json?.status?.code;
  if (code && code !== 0 && code !== 200) throw new Error(`onOffice ${code}: ${a0?.status?.message ?? ""}`);
  return { records: a0?.data?.records ?? [], gesamt: a0?.data?.meta?.cntabsolute ?? null };
}

const zahl = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
};
const ganz = (v: unknown) => { const n = zahl(v); return n === null ? null : Math.round(n); };
const jaNein = (v: unknown) => v === true || v === "1" || v === 1 || String(v).toLowerCase() === "true";

function abbilden(rec: any) {
  const e = rec.elements || {};
  const va = String(e.vermarktungsart || "").toLowerCase();
  return {
    onoffice_id: String(rec.id ?? e.Id),
    objektnr_extern: e.objektnr_extern ?? null,
    titel: e.objekttitel ?? null,
    objektart: e.objektart ?? null,
    vermarktungsart: (va.includes("miet") || va.includes("pacht")) ? "miete" : (va ? "kauf" : null),
    strasse: e.strasse ?? null,
    hausnummer: e.hausnummer ?? null,
    plz: e.plz ?? null,
    ort: e.ort ?? null,
    kaufpreis: zahl(e.kaufpreis),
    kaltmiete: zahl(e.kaltmiete),
    wohnflaeche: zahl(e.wohnflaeche),
    grundstueck: zahl(e.grundstuecksflaeche),
    zimmer: zahl(e.anzahl_zimmer),
    baujahr: ganz(e.baujahr),
    status_code: String(e.status ?? "") || null,
    veroeffentlicht: jaNein(e.veroeffentlichen),
    roh: e,
    aktiv: true,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

  let logId: string | null = null;
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let nutzer: string | null = null;
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) throw new Error("Keine Berechtigung.");
        nutzer = u.user.id;
      }
    }

    const token = Deno.env.get("ONOFFICE_TOKEN");
    const secret = Deno.env.get("ONOFFICE_SECRET");
    if (!token || !secret) throw new Error("ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.");

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const modus = String(body.modus || "sync");

    // ---------- Feldnamen EINZELN gegen die API testen ----------
    if (modus === "felder-pruefen") {
      const gueltig: string[] = [];
      const ungueltig: string[] = [];
      for (const feld of KANDIDATEN) {
        try { await lesen(token, secret, ["Id", feld], 0, 1); gueltig.push(feld); }
        catch (_e) { ungueltig.push(feld); }
      }
      const reihen = [
        ...gueltig.map((f) => ({ feld: f, gueltig: true, geprueft_at: new Date().toISOString() })),
        ...ungueltig.map((f) => ({ feld: f, gueltig: false, geprueft_at: new Date().toISOString() })),
      ];
      await db.from("onoffice_felder").upsert(reihen, { onConflict: "feld" });
      return antwort({ ok: true, modus, anzahl_gueltig: gueltig.length, gueltig, ungueltig });
    }

    // ---------- Vollsync mit BASIS + geprueften Feldern ----------
    const { data: felderRows } = await db.from("onoffice_felder").select("feld").eq("gueltig", true);
    const felder = Array.from(new Set([...BASIS, ...(felderRows || []).map((r: any) => r.feld)]));

    const { data: logRow } = await db.from("onoffice_sync_log").insert({ ausgeloest_von: nutzer }).select("id").single();
    logId = logRow?.id ?? null;

    const gesehen = new Set<string>();
    let offset = 0, gelesen = 0, neu = 0, aktualisiert = 0, gesamt: number | null = null;

    while (true) {
      const { records, gesamt: g } = await lesen(token, secret, felder, offset, SEITE);
      if (gesamt === null) gesamt = g;
      if (!records.length) break;

      const reihen = records.map(abbilden);
      for (const r of reihen) gesehen.add(r.onoffice_id);

      const ids = reihen.map((r: any) => r.onoffice_id);
      const { data: da } = await db.from("onoffice_objekte").select("onoffice_id").in("onoffice_id", ids);
      const bekannt = new Set((da || []).map((v: any) => v.onoffice_id));
      neu += reihen.filter((r: any) => !bekannt.has(r.onoffice_id)).length;
      aktualisiert += reihen.filter((r: any) => bekannt.has(r.onoffice_id)).length;

      const { error } = await db.from("onoffice_objekte").upsert(reihen, { onConflict: "onoffice_id" });
      if (error) throw new Error("Upsert: " + error.message);

      gelesen += records.length;
      offset += SEITE;
      if (gesamt !== null && offset >= gesamt) break;
      if (records.length < SEITE) break;
      if (offset > 5000) break;
    }

    let deaktiviert = 0;
    const { data: aktive } = await db.from("onoffice_objekte").select("onoffice_id").eq("aktiv", true);
    const weg = (aktive || []).map((r: any) => r.onoffice_id).filter((id: string) => !gesehen.has(id));
    if (weg.length) {
      await db.from("onoffice_objekte").update({ aktiv: false, updated_at: new Date().toISOString() }).in("onoffice_id", weg);
      deaktiviert = weg.length;
    }

    if (logId) await db.from("onoffice_sync_log").update({ beendet_am: new Date().toISOString(), gelesen, neu, aktualisiert, deaktiviert }).eq("id", logId);
    return antwort({ ok: true, felder: felder.length, gelesen, neu, aktualisiert, deaktiviert, gesamt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (logId) await db.from("onoffice_sync_log").update({ beendet_am: new Date().toISOString(), fehler: msg.slice(0, 500) }).eq("id", logId);
    return antwort({ ok: false, fehler: msg });
  }
});
