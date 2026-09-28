// ============================================================================
// onoffice-termine-sync v3
//   Liest Termine aus onOffice (resourcetype appointmentList) und spiegelt sie
//   in public.termine (quelle='onoffice', Upsert über onoffice_id).
//   - Zeitfenster: heute-30 bis heute+180 Tage (per body.von/bis übersteuerbar)
//   - Serientermine werden anhand recurrence in Einzeltermine expandiert
//     (onoffice_id = "<id>@<datum>")
//   - Private Termine: Titel "Privat / Vertraulich", ohne Notiz/Ort
//   - Modus "diagnose": Rohantwort einer Woche nach public.onoffice_diagnose
//   - In onOffice gelöschte/stornierte Termine verschwinden aus dem Fenster
//     (nur quelle='onoffice'; Portal-Termine werden NIE angefasst)
//   - v2: Portal-Termine, die nach onOffice übertragen wurden (quelle=
//     'portal' MIT onoffice_id), bleiben portal-führend und werden beim
//     Upsert übersprungen — sonst würde der Rücklauf sie überschreiben.
//   - v3: immobilie_id wird nur gesetzt, wenn onOffice ein Objekt (estate)
//     liefert — ein im Portal manuell zugeordnetes Objekt bleibt sonst erhalten.
//     Portal-eigene Spalten (kontakt_id, nachfassen, nachfass_status) werden
//     vom Upsert nie berührt.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const URL_OO = "https://api.onoffice.de/api/stable/api.php";

async function sig(msg: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(s)));
}

async function terminAbruf(token: string, secret: string, von: string, bis: string) {
  const actionid = "urn:onoffice-de-ns:smart:2.5:smartml:action:get";
  const resourcetype = "appointmentList";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = await sig(timestamp + token + resourcetype + actionid, secret);
  const body = {
    token,
    request: { actions: [{ actionid, resourceid: "", resourcetype, identifier: "", timestamp, hmac, hmac_version: "2",
      parameters: {
        data: ["id", "createdBy", "modified", "subject", "notes", "type", "status", "private", "date", "location", "recurrence", "users", "estate"],
        filter: { startDate: von, endDate: bis, isCancelled: false },
      } }] },
  };
  const resp = await fetch(URL_OO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await resp.json();
  const a0 = json?.response?.results?.[0];
  const code = a0?.status?.errorcode ?? json?.status?.code;
  if (code && code !== 0 && code !== 200) throw new Error(`onOffice ${code}: ${a0?.status?.message ?? json?.status?.message ?? ""}`);
  return { records: a0?.data?.records ?? [], roh: json };
}

// ---- Zeit-Helfer: ISO-UTC -> Datum/Zeit in Europa/Berlin ----
const fmtDatum = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
const fmtZeit = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function berlin(iso: string) {
  const d = new Date(iso);
  return { datum: fmtDatum.format(d), zeit: fmtZeit.format(d) };
}
function datumPlus(datum: string, tage: number): string {
  const d = new Date(datum + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
function tageDiff(a: string, b: string): number {
  return Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000);
}

// ---- Serie expandieren: Vorkommnis-Daten im Fenster ----
function serienDaten(rec: any, startDatum: string, vonD: string, bisD: string): string[] {
  const r = rec.elements?.recurrence;
  if (!r) return [];
  const typRoh = String(r.type || "").toLowerCase();
  const typ = typRoh.startsWith("t") || typRoh.startsWith("d") ? "t" :
  typRoh.startsWith("w") ? "w" :
  typRoh.startsWith("m") ? "m" :
  typRoh.startsWith("j") || typRoh.startsWith("y") ? "j" : null;
  if (!typ) return [startDatum];
  const intervall = Math.max(1, parseInt(String(r.interval || "1"), 10) || 1);
  const serieStart = (r.start || startDatum).slice(0, 10);
  const serieEnde = r.end ? String(r.end).slice(0, 10) : bisD;
  const ausnahmen = new Set((Array.isArray(r.exceptions) ? r.exceptions : []).map((x: any) => String(x).replace(/^#/, "").slice(0, 10)));
  const bis = serieEnde < bisD ? serieEnde : bisD;
  const daten: string[] = [];
  if (typ === "t" || typ === "w") {
    const schritt = intervall * (typ === "w" ? 7 : 1);
    let d = serieStart;
    if (d < vonD) {
      const diff = tageDiff(d, vonD);
      d = datumPlus(d, Math.ceil(diff / schritt) * schritt);
    }
    let z = 0;
    while (d <= bis && z < 400) {
      if (!ausnahmen.has(d)) daten.push(d);
      d = datumPlus(d, schritt);
      z++;
    }
  } else {
    const [j0, m0, t0] = serieStart.split("-").map((x) => parseInt(x, 10));
    for (let k = 0; k < 400; k++) {
      let jahr = j0, monat = m0;
      if (typ === "m") { const gesamt = m0 - 1 + k * intervall; jahr = j0 + Math.floor(gesamt / 12); monat = gesamt % 12 + 1; }
      else { jahr = j0 + k * intervall; }
      const d = `${jahr}-${String(monat).padStart(2, "0")}-${String(t0).padStart(2, "0")}`;
      if (d > bis) break;
      if (d >= vonD && !ausnahmen.has(d)) daten.push(d);
    }
  }
  return daten;
}

const statusMap: Record<string, string> = { active: "aktiv", completed: "erledigt", canceled: "storniert", participantsAvailable: "aktiv" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) throw new Error("Keine Berechtigung.");
      }
    }

    const token = Deno.env.get("ONOFFICE_TOKEN");
    const secret = Deno.env.get("ONOFFICE_SECRET");
    if (!token || !secret) throw new Error("ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.");

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const modus = String(body.modus || "sync");
    const heute = fmtDatum.format(new Date());
    const vonD = String(body.von || datumPlus(heute, -30));
    const bisD = String(body.bis || datumPlus(heute, 180));

    if (modus === "diagnose") {
      const dVon = String(body.von || heute);
      const dBis = String(body.bis || datumPlus(heute, 7));
      const { records, roh } = await terminAbruf(token, secret, dVon, dBis);
      await db.from("onoffice_diagnose").insert({
        test: `termine-liste ${dVon}..${dBis}`,
        errorcode: "0",
        meldung: "ok",
        treffer: records.length,
        beispiel: { meta: roh?.response?.results?.[0]?.data?.meta ?? null, records: records.slice(0, 6) },
      });
      return antwort({ ok: true, modus, von: dVon, bis: dBis, gelesen: records.length });
    }

    // ---------- Sync: Fenster monatsweise abrufen (500er-Limit) ----------
    const proAbruf = 30;
    const alleRecords = new Map<string, any>();
    let cursor = vonD;
    while (cursor <= bisD) {
      const ende = datumPlus(cursor, proAbruf - 1) < bisD ? datumPlus(cursor, proAbruf - 1) : bisD;
      const { records } = await terminAbruf(token, secret, cursor, ende);
      for (const rec of records) alleRecords.set(String(rec.id), rec);
      cursor = datumPlus(ende, 1);
    }

    // ---------- Immobilien-Zuordnung (estate.id -> immobilien.id) ----------
    const estateIds = Array.from(new Set(Array.from(alleRecords.values())
      .map((r: any) => r.elements?.estate?.id).filter(Boolean).map((x: any) => String(x))));
    const immoMap = new Map<string, string>();
    for (let i = 0; i < estateIds.length; i += 100) {
      const { data } = await db.from("immobilien").select("id, onoffice_id").in("onoffice_id", estateIds.slice(i, i + 100));
      for (const z of data || []) immoMap.set(String(z.onoffice_id), z.id);
    }

    // ---------- Abbilden ----------
    const jetzt = new Date().toISOString();
    const reihen: any[] = [];
    for (const rec of alleRecords.values()) {
      const e = rec.elements || {};
      if (String(e?.status?.value || "") === "canceled") continue;
      const priv = e.private === true;
      const startIso = e?.date?.start;
      const endIso = e?.date?.end || startIso;
      if (!startIso) continue;
      const ganztags = e?.date?.allDay === true;
      const s = berlin(startIso);
      const en = berlin(ganztags ? new Date(new Date(endIso).getTime() - 60000).toISOString() : endIso);
      const dauerTage = Math.max(0, tageDiff(s.datum, en.datum));
      const teilnehmer = (Array.isArray(e.users) ? e.users : [])
        .map((u: any) => (`${u.firstName || ""} ${u.lastName || ""}`.trim()) || u.userName || "").filter(Boolean);
      const basis: any = {
        titel: priv ? "Privat / Vertraulich" : (String(e.subject || "").trim() || e?.type?.label || "Termin"),
        art: e?.type?.label || e?.type?.value || null,
        uhrzeit: ganztags ? null : s.zeit,
        ende: ganztags ? null : en.zeit,
        ganztags,
        ort: priv ? null : (e?.location?.value || null),
        notiz: priv ? null : (String(e.notes || "").trim() || null),
        privat: priv,
        status: statusMap[String(e?.status?.value || "active")] || "aktiv",
        teilnehmer,
        ersteller_name: e.createdBy || null,
        quelle: "onoffice",
        onoffice_modified: e.modified || null,
        updated_at: jetzt,
      };
      // v3: Objekt nur setzen, wenn onOffice eines liefert — sonst bleibt eine Portal-Zuordnung stehen
      if (e?.estate?.id) basis.immobilie_id = immoMap.get(String(e.estate.id)) || null;
      if (e.recurrence) {
        for (const d of serienDaten(rec, s.datum, vonD, bisD)) {
          reihen.push({ ...basis, onoffice_id: `${rec.id}@${d}`, datum: d, datum_ende: dauerTage > 0 ? datumPlus(d, dauerTage) : null });
        }
      } else {
        reihen.push({ ...basis, onoffice_id: String(rec.id), datum: s.datum, datum_ende: dauerTage > 0 ? en.datum : null });
      }
    }

    // ---------- v2: Portal-führende Termine schützen ----------
    const { data: portalRows } = await db.from("termine").select("onoffice_id").eq("quelle", "portal").not("onoffice_id", "is", null).range(0, 9999);
    const portalIds = new Set((portalRows || []).map((z: any) => String(z.onoffice_id)));
    const reihenFinal = reihen.filter((r) => !portalIds.has(String(r.onoffice_id)));

    // ---------- Upsert (Zeilen mit und ohne immobilie_id getrennt, damit PostgREST keine Spaltenlücken auffüllt) ----------
    const gesehen = new Set(reihen.map((r) => r.onoffice_id));
    const mitObjekt = reihenFinal.filter((r) => "immobilie_id" in r);
    const ohneObjekt = reihenFinal.filter((r) => !("immobilie_id" in r));
    for (const gruppe of [mitObjekt, ohneObjekt]) {
      for (let i = 0; i < gruppe.length; i += 200) {
        const { error } = await db.from("termine").upsert(gruppe.slice(i, i + 200), { onConflict: "onoffice_id" });
        if (error) throw new Error("Upsert: " + error.message);
      }
    }

    // ---------- Verschwundene onOffice-Termine im Fenster löschen ----------
    let geloescht = 0;
    const { data: bestand } = await db.from("termine")
      .select("id, onoffice_id").eq("quelle", "onoffice").gte("datum", vonD).lte("datum", bisD).not("onoffice_id", "is", null).range(0, 9999);
    const weg = (bestand || []).filter((z: any) => !gesehen.has(z.onoffice_id)).map((z: any) => z.id);
    for (let i = 0; i < weg.length; i += 200) {
      await db.from("termine").delete().in("id", weg.slice(i, i + 200));
    }
    geloescht = weg.length;

    return antwort({ ok: true, modus: "termine", von: vonD, bis: bisD, serien_und_einzel: alleRecords.size, geschrieben: reihenFinal.length, portal_gefuehrt: reihen.length - reihenFinal.length, geloescht });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("onoffice-termine-sync:", msg);
    return antwort({ ok: false, fehler: msg });
  }
});
