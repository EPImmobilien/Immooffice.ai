// ============================================================================
// onoffice-termin-schreiben v7
//   v5: Ende wird immer nach den Beginn geschoben (onOffice-Fehler 93).
//   v6: Fahrzeit in die onOffice-eigenen Wegzeit-Felder (allowTransitTime /
//       transitTimePre / transitTimePost) — onOffice zeigt sie damit selbst am
//       Termin an und beruecksichtigt sie bei Ueberschneidungen.
//   v7: aktion "wegzeit" schreibt NUR die Wegzeit-Felder. Damit laesst sich die
//       Fahrzeit an einem aus onOffice stammenden Termin nachtragen, ohne
//       Titel, Zeiten, Notiz oder Teilnehmer anzufassen.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const URL_OO = "https://api.onoffice.de/api/stable/api.php";
const TAG_MIN = 24 * 60;

const zeitMin = (z: unknown): number | null => {
  if (!z) return null;
  const p = String(z).split(":");
  const h = parseInt(p[0], 10), m = parseInt(p[1] || "0", 10);
  return isFinite(h) ? h * 60 + (isFinite(m) ? m : 0) : null;
};
const minZeit = (m: number) => {
  const x = Math.max(0, Math.min(TAG_MIN - 1, Math.round(m)));
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}:00`;
};
// Wegzeit ist eine Dauer, keine Uhrzeit
const dauerZeit = (min: number) => {
  const x = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}:00`;
};
const tagPlus = (datum: string, n: number) =>
  new Date(new Date(`${datum}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

function zeitraum(t: any): { start: string; endDatum: string; ende: string } {
  if (t.ganztags) return { start: "00:00:00", endDatum: t.datum_ende || t.datum, ende: "23:59:59" };
  const start = zeitMin(t.uhrzeit) ?? 9 * 60;
  let endDatum = t.datum_ende && t.datum_ende > t.datum ? t.datum_ende : t.datum;
  let ende = zeitMin(t.ende);
  if (endDatum > t.datum) {
    if (ende == null) ende = start;
  } else if (ende == null || ende <= start) {
    ende = start + 30;
    if (ende > TAG_MIN - 1) { endDatum = tagPlus(t.datum, 1); ende -= TAG_MIN; }
  }
  return { start: minZeit(start), endDatum, ende: minZeit(ende) };
}

function wegzeitDaten(t: any) {
  const hin = Math.max(0, Number(t.fahrzeit_hin_min) || 0);
  const rueck = Math.max(0, Number(t.fahrzeit_rueck_min) || 0);
  const an = !t.ganztags && (hin > 0 || rueck > 0);
  return {
    an, hin, rueck,
    felder: an ?
      { allowTransitTime: true, transitTimePre: dauerZeit(hin), transitTimePost: dauerZeit(rueck) } :
      { allowTransitTime: false },
  };
}

async function sig(msg: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(s)));
}

async function ooAktion(token: string, secret: string, aktion: string, resourcetype: string, resourceid: string, parameters: any) {
  const actionid = `urn:onoffice-de-ns:smart:2.5:smartml:action:${aktion}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = await sig(timestamp + token + resourcetype + actionid, secret);
  const body = { token, request: { actions: [{ actionid, resourceid, resourcetype, identifier: "", timestamp, hmac, hmac_version: "2", parameters }] } };
  const resp = await fetch(URL_OO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await resp.json();
  const a0 = json?.response?.results?.[0];
  const code = a0?.status?.errorcode ?? json?.status?.code;
  if (code && code !== 0 && code !== 200) {
    throw new Error(`onOffice ${code}: ${a0?.status?.message ?? json?.status?.message ?? ""}`);
  }
  return { a0, json };
}

async function benutzerMap(token: string, secret: string) {
  const map = new Map<string, { id: number; userName: string }>();
  try {
    const { a0 } = await ooAktion(token, secret, "get", "users", "", {});
    for (const rec of a0?.data?.records ?? []) {
      const e = rec.elements || {};
      const name = `${e.Vorname || e.firstname || ""} ${e.Nachname || e.lastname || ""}`.trim();
      const userName = e.Benutzername || e.username || e.userName || "";
      if (name) map.set(name, { id: Number(rec.id), userName });
    }
  } catch (_e) { /* Fallback unten */ }
  if (map.size > 0) return map;
  const heute = new Date();
  const d = (t: number) => {const x = new Date(heute.getTime() + t * 86400000);return x.toISOString().slice(0, 10);};
  const { a0 } = await ooAktion(token, secret, "get", "appointmentList", "", {
    data: ["id", "users"], filter: { startDate: d(-30), endDate: d(30), isCancelled: false },
  });
  for (const rec of a0?.data?.records ?? []) {
    for (const u of rec.elements?.users ?? []) {
      const name = `${u.firstName || ""} ${u.lastName || ""}`.trim();
      if (name && !map.has(name)) map.set(name, { id: Number(u.id), userName: u.userName || "" });
    }
  }
  return map;
}

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

    if (body.modus === "users-diagnose") {
      const { a0 } = await ooAktion(token, secret, "get", "users", "", {});
      const records = a0?.data?.records ?? [];
      await db.from("onoffice_diagnose").insert({ test: "users-liste", errorcode: "0", meldung: "ok", treffer: records.length, beispiel: { records: records.slice(0, 12) } });
      return antwort({ ok: true, treffer: records.length });
    }

    // Kontrollblick: was steht in onOffice wirklich am Termin (inkl. Wegzeit)?
    if (body.modus === "termin-lesen") {
      const { a0 } = await ooAktion(token, secret, "get", "appointmentList", "", {
        data: ["id", "subject", "date", "travelTime", "status", "users"],
        filter: { startDate: String(body.von || ""), endDate: String(body.bis || body.von || "") },
      });
      const records = (a0?.data?.records ?? []).map((r: any) => ({
        id: r.id, subject: r.elements?.subject, date: r.elements?.date,
        travelTime: r.elements?.travelTime ?? null, status: r.elements?.status?.value ?? null,
      }));
      const nur = body.onoffice_id ? records.filter((r: any) => String(r.id) === String(body.onoffice_id)) : records;
      return antwort({ ok: true, treffer: nur.length, records: nur.slice(0, 30) });
    }

    const terminId = String(body.termin_id || "").trim();
    if (!terminId) throw new Error("termin_id ist Pflicht.");
    const { data: t, error: tErr } = await db.from("termine").select("*").eq("id", terminId).maybeSingle();
    if (tErr) throw tErr;
    if (!t) throw new Error("Termin nicht gefunden.");

    const istOnoffice = t.quelle === "onoffice";
    const istSerie = String(t.onoffice_id || "").includes("@");
    if (istOnoffice && !t.onoffice_id) throw new Error("onOffice-Termin ohne ID.");
    if (istSerie) throw new Error("Serientermine aus onOffice können nur direkt in onOffice bearbeitet werden.");

    const aktion = String(body.aktion || "schreiben");

    if (aktion === "absagen") {
      if (!t.onoffice_id) return antwort({ ok: true, hinweis: "Kein onOffice-Eintrag vorhanden." });
      await ooAktion(token, secret, "modify", "calendar", String(t.onoffice_id), { data: { status: "canceled" } });
      return antwort({ ok: true, abgesagt: t.onoffice_id });
    }

    const wz = wegzeitDaten(t);

    // Nur die Wegzeit nachtragen — ruehrt sonst nichts am onOffice-Termin an.
    if (aktion === "wegzeit") {
      if (!t.onoffice_id) return antwort({ ok: true, hinweis: "Noch kein onOffice-Eintrag — die Wegzeit geht beim nächsten Speichern mit." });
      await ooAktion(token, secret, "modify", "calendar", String(t.onoffice_id), { data: wz.felder });
      return antwort({ ok: true, onoffice_id: t.onoffice_id, wegzeit: wz.an ? { hin: wz.hin, rueck: wz.rueck } : null });
    }

    if (istOnoffice && t.privat) throw new Error("Private onOffice-Termine können nur in onOffice bearbeitet werden.");

    const zr = zeitraum(t);

    const map = await benutzerMap(token, secret);
    const userIds: number[] = [];
    for (const name of t.teilnehmer || []) {
      const m = map.get(String(name).trim());
      if (m && !userIds.includes(m.id)) userIds.push(m.id);
    }
    const ersteller = map.get(String(t.ersteller_name || "").trim());

    let estateId: number | null = null;
    if (t.immobilie_id) {
      const { data: im } = await db.from("immobilien").select("onoffice_id").eq("id", t.immobilie_id).maybeSingle();
      if (im?.onoffice_id && /^\d+$/.test(String(im.onoffice_id))) estateId = Number(im.onoffice_id);
    }

    const ortZeile = !istOnoffice && t.ort ? `Ort: ${t.ort}` : null;
    const notizBasis = String(t.notiz || "").split("\n").filter((z) => !ortZeile || z.trim() !== ortZeile).join("\n").trim();
    const noteTeile: string[] = [];
    if (notizBasis) noteTeile.push(notizBasis);
    if (ortZeile) noteTeile.push(ortZeile);

    const datenVoll: any = {
      description: t.titel || "Termin",
      start_dt: `${t.datum} ${zr.start}`,
      end_dt: `${zr.endDatum} ${zr.ende}`,
      ganztags: !!t.ganztags,
      private: !!t.privat,
    };
    if (noteTeile.length || istOnoffice) datenVoll.note = noteTeile.join("\n");
    if (t.art) datenVoll.art = t.art;
    if (!istOnoffice && ersteller?.userName) datenVoll.von = ersteller.userName;
    Object.assign(datenVoll, wz.felder);

    const parameter = (daten: any) => {
      const p: any = { data: daten };
      if (userIds.length) p.subscribers = { users: userIds };
      if (estateId) {p.relatedEstateId = estateId;p.location = { estate: estateId };}
      return p;
    };

    const ausfuehren = async (daten: any) => {
      if (t.onoffice_id) {
        await ooAktion(token, secret, "modify", "calendar", String(t.onoffice_id), parameter(daten));
        return String(t.onoffice_id);
      }
      const { a0 } = await ooAktion(token, secret, "create", "calendar", "", parameter(daten));
      const neuId = a0?.data?.records?.[0]?.id;
      if (!neuId) throw new Error("onOffice hat keine Termin-ID zurückgegeben.");
      return String(neuId);
    };

    // Stufenweise abspecken, falls onOffice etwas nicht annimmt
    const { art: _a, ...ohneArt } = datenVoll;
    const { allowTransitTime: _b, transitTimePre: _c, transitTimePost: _d, ...ohneWegzeit } = ohneArt;
    const stufen = [
      { daten: datenVoll, hinweis: null },
      { daten: ohneArt, hinweis: "Die Terminart ist in onOffice nicht angelegt und wurde weggelassen." },
      { daten: ohneWegzeit, hinweis: "Terminart und Wegzeit konnten nicht übertragen werden." },
    ];

    let ooId: string | null = null;
    let hinweis: string | null = null;
    let letzterFehler: unknown = null;
    for (const stufe of stufen) {
      try {
        ooId = await ausfuehren(stufe.daten);
        hinweis = stufe.hinweis;
        break;
      } catch (e1) {
        letzterFehler = e1;
        if (String(e1 instanceof Error ? e1.message : e1).includes("onOffice 156")) throw e1;
      }
    }
    if (!ooId) throw letzterFehler instanceof Error ? letzterFehler : new Error(String(letzterFehler));

    await db.from("termine").update({ onoffice_id: ooId, onoffice_modified: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", t.id);

    return antwort({ ok: true, onoffice_id: ooId, teilnehmer_uebertragen: userIds.length, wegzeit: wz.an ? { hin: wz.hin, rueck: wz.rueck } : null, hinweis });
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("onOffice 156")) {
      msg = "onOffice verweigert den Zugriff (Fehler 156): Dem API-Benutzer fehlt das Recht, Termine anderer Benutzer zu bearbeiten. Bitte in onOffice unter Extras > Einstellungen > Benutzer beim API-Benutzer die Termin-/Kalenderrechte auf alle Benutzer erweitern – danach funktioniert die Bearbeitung aus dem Portal.";
    }
    console.error("onoffice-termin-schreiben:", msg);
    return antwort({ ok: false, fehler: msg });
  }
});
