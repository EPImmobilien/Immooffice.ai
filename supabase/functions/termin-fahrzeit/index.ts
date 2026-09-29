// ============================================================================
// termin-fahrzeit v5 — Fahrzeit vor und nach einem Termin
// ----------------------------------------------------------------------------
// Startpunkt ist der vorherige Termin des Tages, sofern er eine Adresse hat —
// sonst die Startadresse des Nutzers (profiles.start_adresse), sonst der aktive
// Hauptstandort aus firma_stammdaten. Ziel nach dem Termin ist der naechste
// Termin des Tages, sonst zurueck zum Startpunkt.
//
// v2: Geocoding mit Rueckfallvarianten (Ortsteile, Hausnummernzusaetze, PLZ+Ort)
// v3: Sammellauf { nachtragen: true } fuer den taeglichen Cron
// v4: Fahrzeit als eigener Termin nach onOffice (überholt)
// v5: onOffice kann Wegzeit selbst — die Minuten gehen jetzt in die Felder
//     allowTransitTime / transitTimePre / transitTimePost am Termin. Die
//     frueheren eigenen "Fahrzeit"-Termine werden dabei aufgeraeumt.
//
// Body:
//   { termin_id }                                -> rechnen, speichern, Wegzeit setzen
//   { datum, uhrzeit, ende, immobilie_id|ziel_adresse, user_id }  -> Vorschau
//   { nachtragen: true, tage?: 28, limit?: 15 }  -> fehlende nachtragen (Cron)
//   { termin_id, onoffice: false }               -> ohne onOffice-Uebertragung
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Mandantengrenze fuer Kennungen aus dem Anfragekoerper -----------------
// Diese Funktion prueft das JWT, arbeitet danach aber mit dem service_role —
// und fuer den gilt RLS nicht. Eine Kennung, die der Aufrufer mitschickt, ist
// damit ungeprueft: sie kann auf einen Satz eines anderen Mandanten zeigen.
//
// public.mandant_sichern() aus fork_14 zieht genau diese Grenze. Sie muss
// aber MIT DEM TOKEN DES AUFRUFERS gerufen werden — unter dem service_role
// laesst sie jeden durch (mandant_grenze_gilt() ist dort false, mit Absicht:
// Cron und Wartung haben keinen Mandanten). Deshalb ein zweiter Client, der
// nur den mitgebrachten Kopf weiterreicht.
//
// Ohne Anmeldekopf oder mit dem Dienstschluessel passiert nichts — das sind
// die internen Wege, und die sind nicht die Grenze, die hier gezogen wird.
async function immoMandantSichern(req: Request, paare: Array<[string, unknown]>): Promise<void> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return;
  const zuPruefen = paare.filter(([, id]) =>
    typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if (!zuPruefen.length) return;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  for (const [tabelle, id] of zuPruefen) {
    const { error } = await nutzer.rpc("mandant_sichern", { p_tabelle: tabelle, p_id: id });
    if (error) throw new Error("Kein Zugriff auf Daten eines anderen Mandanten.");
  }
}

// Wessen Mandant ist der Aufrufer? Fuer die Faelle, in denen nicht eine
// Kennung, sondern ein PFAD aus dem Anfragekoerper kommt — das erste
// Pfadsegment im Dateispeicher ist seit fork_09 die Mandantenkennung.
async function immoMandantDesAufrufers(req: Request): Promise<string | null> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return null;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  const { data: u } = await nutzer.auth.getUser(kopf.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return null;
  const { data: prof } = await nutzer.from("profiles").select("mandant_id").eq("id", u.user.id).maybeSingle();
  return prof?.mandant_id ? String(prof.mandant_id) : null;
}

const USER_AGENT = "ImmoOffice/1.0 (info@immooffice.example)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org/route/v1/driving";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const norm = (s: string) => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "").trim();

type Punkt = { lat: number; lon: number };

function haversine(a: Punkt, b: Punkt): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
}

function adressVarianten(adresse: string): string[] {
  const a = String(adresse || "").trim();
  const v: string[] = [];
  const dazu = (x: string) => { const t = x.replace(/\s{2,}/g, " ").replace(/\s*,\s*,/g, ",").trim(); if (t && !v.includes(t)) v.push(t); };
  dazu(a);
  const strasse = a.split(",")[0].trim();
  const plz = (a.match(/\b(\d{5})\b/) || [])[1] || "";
  const ot = a.match(/\bOT\s+([^,]+)\s*$/i);
  if (ot) {
    dazu([strasse, [plz, ot[1].trim()].filter(Boolean).join(" ")].filter(Boolean).join(", "));
    dazu(a.replace(/\s*\bOT\s+[^,]+\s*$/i, ""));
  }
  const schraeg = a.match(/^(.*?)\s*\/\s*([^,\/]+)\s*$/);
  if (schraeg) {
    dazu(schraeg[1]);
    dazu([strasse, [plz, schraeg[2].trim()].filter(Boolean).join(" ")].filter(Boolean).join(", "));
  }
  if (/\d+\s+[a-z]\b/i.test(a)) dazu(a.replace(/(\d+)\s+([a-z])\b/i, "$1"));
  if (/\d+[a-z]\b/i.test(a)) dazu(a.replace(/(\d+)[a-z]\b/i, "$1"));
  const ort = a.match(/\b\d{5}\s+([^,\/]+)/);
  if (ort) {
    const reinerOrt = ort[1].replace(/\s*\bOT\s+.*$/i, "").trim();
    dazu(`${plz} ${reinerOrt}`);
    if (ot) dazu(`${plz} ${ot[1].trim()}`);
  }
  return v;
}

async function nominatim(q: string): Promise<Punkt | null> {
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("countrycodes", "de");
  url.searchParams.set("limit", "1");
  const r = await fetch(url.toString(), { headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) return null;
  const arr = await r.json();
  if (!Array.isArray(arr) || !arr[0]) return null;
  return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
}

async function geocode(db: any, adresse: string): Promise<Punkt | null> {
  const key = norm(adresse);
  if (!key) return null;
  const { data: cache } = await db.from("geo_cache").select("lat, lon, gefunden").eq("adresse_norm", key).maybeSingle();
  if (cache) return cache.gefunden && cache.lat != null ? { lat: cache.lat, lon: cache.lon } : null;
  let treffer: Punkt | null = null;
  let variante = "";
  try {
    for (const q of adressVarianten(adresse)) {
      treffer = await nominatim(q);
      if (treffer) { variante = q; break; }
      await new Promise((r) => setTimeout(r, 1100));
    }
  } catch (e) {
    console.warn("Geocoding:", e instanceof Error ? e.message : String(e));
    return null;
  }
  await db.from("geo_cache").upsert({
    adresse_norm: key, adresse: variante || adresse,
    lat: treffer?.lat ?? null, lon: treffer?.lon ?? null, gefunden: !!treffer,
  }, { onConflict: "adresse_norm" });
  return treffer;
}

async function route(a: Punkt, b: Punkt): Promise<{ min: number; km: number; quelle: string }> {
  try {
    const u = `${OSRM}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false&alternatives=false`;
    const r = await fetch(u, { headers: { "User-Agent": USER_AGENT } });
    if (r.ok) {
      const j = await r.json();
      const rt = j?.routes?.[0];
      if (rt && typeof rt.duration === "number") {
        return { min: Math.ceil(rt.duration / 60), km: Math.round(rt.distance / 100) / 10, quelle: "osrm" };
      }
    }
  } catch (e) {
    console.warn("OSRM:", e instanceof Error ? e.message : String(e));
  }
  const luft = haversine(a, b);
  const km = Math.round(luft * 1.35 * 10) / 10;
  return { min: Math.max(1, Math.ceil(km / 50 * 60)), km, quelle: "schaetzung" };
}

const zeitMin = (z: string | null) => {
  if (!z) return null;
  const p = String(z).split(":");
  const h = parseInt(p[0], 10), m = parseInt(p[1] || "0", 10);
  return isFinite(h) ? h * 60 + (isFinite(m) ? m : 0) : null;
};

function adresseVonTermin(t: any, immo: any | null): string {
  if (immo) {
    const a = [[immo.strasse, immo.hausnummer].filter(Boolean).join(" "), [immo.plz, immo.ort].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ");
    if (a.replace(/[\s,]/g, "")) return a;
  }
  return String(t?.ort || "").trim();
}

async function nachOnoffice(terminId: string, aktion: string) {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/onoffice-termin-schreiben`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ termin_id: terminId, aktion }),
    });
    const j = await r.json().catch(() => ({}));
    return j && j.ok ? { ok: true, id: j.onoffice_id } : { ok: false, fehler: j && j.fehler };
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : String(e) };
  }
}

// Altlast aus v4: eigene "Fahrzeit"-Termine werden nicht mehr gebraucht,
// weil onOffice die Wegzeit selbst am Termin anzeigt.
async function fahrtenAufraeumen(db: any, elternId: string) {
  const { data: fahrten } = await db.from("termine").select("id, onoffice_id").eq("fahrt_zu_termin_id", elternId);
  let weg = 0;
  for (const f of fahrten || []) {
    if (f.onoffice_id) await nachOnoffice(f.id, "absagen");
    await db.from("termine").delete().eq("id", f.id);
    weg++;
  }
  return weg;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let nutzerId: string | null = null;
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        nutzerId = u.user.id;
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
      }
    }

    const body = await req.json().catch(() => ({}));
    await immoMandantSichern(req, [["termine", String(body.termin_id || "")],
                                   ["immobilien", String(body.immobilie_id || "")]]);
    const speichern = body.speichern !== false && !!body.termin_id;
    const nachOo = body.onoffice !== false;

    // --- Sammellauf fuer den Cron ---
    if (body.nachtragen === true) {
      const tage = Math.min(Math.max(Number(body.tage) || 28, 1), 120);
      const heute = new Date().toISOString().slice(0, 10);
      const bis = new Date(Date.now() + tage * 86400000).toISOString().slice(0, 10);
      const { data: offene } = await db.from("termine")
        .select("id, immobilie_id, ort")
        .gte("datum", heute).lte("datum", bis)
        .eq("ganztags", false).neq("status", "storniert")
        .is("fahrzeit_berechnet_am", null).is("fahrt_zu_termin_id", null)
        .not("uhrzeit", "is", null).order("datum").limit(80);

      const alle = offene || [];
      const ohneAdresse = alle.filter((t: any) => !t.immobilie_id && !String(t.ort || "").trim());
      const kandidaten = alle.filter((t: any) => t.immobilie_id || String(t.ort || "").trim())
        .slice(0, Math.min(Number(body.limit) || 15, 40));

      for (const t of ohneAdresse) {
        await db.from("termine").update({
          fahrzeit_berechnet_am: new Date().toISOString(), fahrzeit_quelle: "ohne_adresse",
        }).eq("id", t.id);
      }

      let fertig = 0, fehler = 0;
      for (const t of kandidaten) {
        try {
          const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/termin-fahrzeit`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
            body: JSON.stringify({ termin_id: t.id, speichern: true }),
          });
          const j = await r.json().catch(() => ({}));
          if (j && j.ok) { fertig++; } else {
            fehler++;
            await db.from("termine").update({
              fahrzeit_berechnet_am: new Date().toISOString(), fahrzeit_quelle: "adresse_unbekannt",
            }).eq("id", t.id);
          }
        } catch (_) { fehler++; }
      }
      return antwort({ ok: true, geprueft: alle.length, nachgetragen: fertig, ohne_adresse: ohneAdresse.length, fehlgeschlagen: fehler });
    }

    let termin: any = null;
    if (body.termin_id) {
      const { data } = await db.from("termine").select("*").eq("id", body.termin_id).maybeSingle();
      termin = data;
    }
    // Alte Fahrt-Termine bekommen selbst keine Fahrzeit
    if (termin?.fahrt_zu_termin_id) return antwort({ ok: true, hinweis: "Das ist selbst ein Fahrt-Termin.", hin: null, rueck: null });

    const datum = body.datum || termin?.datum;
    const uhrzeit = body.uhrzeit ?? termin?.uhrzeit ?? null;
    const ende = body.ende ?? termin?.ende ?? null;
    const immobilieId = body.immobilie_id ?? termin?.immobilie_id ?? null;
    const userId = body.user_id || nutzerId || termin?.ersteller_id || null;
    if (!datum || !uhrzeit) return antwort({ ok: false, fehler: "Datum und Uhrzeit werden gebraucht." }, 400);

    let immo: any = null;
    if (immobilieId) {
      const { data } = await db.from("immobilien").select("id, strasse, hausnummer, plz, ort").eq("id", immobilieId).maybeSingle();
      immo = data;
    }
    const zielAdresse = String(body.ziel_adresse || "").trim() || adresseVonTermin(termin || { ort: body.ort }, immo);
    if (!zielAdresse) return antwort({ ok: false, fehler: "Der Termin hat weder ein Objekt noch einen Ort — ohne Adresse keine Fahrzeit." }, 200);

    let profil: any = null;
    if (userId) {
      const { data } = await db.from("profiles").select("id, name, start_adresse, fahrzeit_aktiv, fahrzeit_puffer_min").eq("id", userId).maybeSingle();
      profil = data;
    }
    let basisAdresse = String(profil?.start_adresse || "").trim();
    if (!basisAdresse) {
      const { data: firmen } = await db.from("firma_stammdaten").select("strasse, plz, ort")
        .eq("typ", "standort").eq("aktiv", true).order("sortierung").limit(1);
      const f = firmen && firmen[0];
      basisAdresse = f ? [f.strasse, [f.plz, f.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
    }

    const minVon = zeitMin(uhrzeit)!;
    const minBis = zeitMin(ende) ?? minVon + 60;
    const { data: tagesTermine } = await db.from("termine")
      .select("id, titel, datum, uhrzeit, ende, ort, ganztags, status, immobilie_id, ersteller_id, teilnehmer, fahrt_zu_termin_id")
      .eq("datum", datum).neq("status", "storniert").eq("ganztags", false).is("fahrt_zu_termin_id", null);

    const name = profil?.name || "";
    const meine = (tagesTermine || []).filter((t: any) => {
      if (body.termin_id && t.id === body.termin_id) return false;
      if (userId && t.ersteller_id === userId) return true;
      return name && Array.isArray(t.teilnehmer) && t.teilnehmer.some((n: any) => String(n).trim() === name);
    });

    const mitAdresse = await Promise.all(meine.map(async (t: any) => {
      let io: any = null;
      if (t.immobilie_id) {
        const { data } = await db.from("immobilien").select("strasse, hausnummer, plz, ort").eq("id", t.immobilie_id).maybeSingle();
        io = data;
      }
      return { ...t, _adresse: adresseVonTermin(t, io), _von: zeitMin(t.uhrzeit), _bis: zeitMin(t.ende) ?? (zeitMin(t.uhrzeit) ?? 0) + 60 };
    }));

    const davor = mitAdresse.filter((t: any) => t._adresse && t._bis != null && t._bis <= minVon).sort((a: any, b: any) => b._bis - a._bis)[0] || null;
    const danach = mitAdresse.filter((t: any) => t._adresse && t._von != null && t._von >= minBis).sort((a: any, b: any) => a._von - b._von)[0] || null;

    const vonAdresse = davor ? davor._adresse : basisAdresse;
    const nachAdresse = danach ? danach._adresse : basisAdresse;

    const pZiel = await geocode(db, zielAdresse);
    if (!pZiel) return antwort({ ok: false, fehler: `Die Adresse „${zielAdresse}“ konnte nicht gefunden werden.` }, 200);
    const pVon = await geocode(db, vonAdresse);
    const pNach = norm(nachAdresse) === norm(vonAdresse) ? pVon : await geocode(db, nachAdresse);

    const puffer = Math.max(0, Number(profil?.fahrzeit_puffer_min ?? 5));
    let hin: any = null, rueck: any = null, quelle = "osrm";

    if (pVon) {
      const r = await route(pVon, pZiel);
      if (r.quelle === "schaetzung") quelle = "schaetzung";
      hin = { min: r.min + puffer, km: r.km, von: vonAdresse, aus_termin: davor ? davor.titel : null };
    }
    if (pNach) {
      const r = await route(pZiel, pNach);
      if (r.quelle === "schaetzung") quelle = "schaetzung";
      rueck = { min: r.min + puffer, km: r.km, nach: nachAdresse, zu_termin: danach ? danach.titel : null };
    }

    if (hin && norm(vonAdresse) === norm(zielAdresse)) hin = { min: 0, km: 0, von: vonAdresse, aus_termin: davor ? davor.titel : null };
    if (rueck && norm(nachAdresse) === norm(zielAdresse)) rueck = { min: 0, km: 0, nach: nachAdresse, zu_termin: danach ? danach.titel : null };

    const ergebnis: any = {
      ok: true, ziel: zielAdresse, hin, rueck, quelle, puffer_min: puffer,
      basis: davor ? "vorheriger Termin" : profil?.start_adresse ? "Startadresse aus dem Profil" : "Hauptstandort",
      gespeichert: false, wegzeit: null, aufgeraeumt: 0,
    };

    if (speichern) {
      const { error } = await db.from("termine").update({
        fahrzeit_hin_min: hin ? hin.min : null,
        fahrzeit_rueck_min: rueck ? rueck.min : null,
        fahrt_von: hin ? hin.von : null,
        fahrt_nach: rueck ? rueck.nach : null,
        fahrt_hin_km: hin ? hin.km : null,
        fahrt_rueck_km: rueck ? rueck.km : null,
        fahrzeit_berechnet_am: new Date().toISOString(),
        fahrzeit_quelle: quelle,
      }).eq("id", body.termin_id);
      if (error) throw error;
      ergebnis.gespeichert = true;

      // Altlasten aus v4 entfernen, dann die Wegzeit an den Termin selbst schreiben
      if (termin) {
        try { ergebnis.aufgeraeumt = await fahrtenAufraeumen(db, termin.id); }
        catch (e) { ergebnis.aufraeumen_fehler = e instanceof Error ? e.message : String(e); }
      }
      if (nachOo && termin?.onoffice_id && !String(termin.onoffice_id).includes("@")) {
        const oo = await nachOnoffice(termin.id, "wegzeit");
        ergebnis.wegzeit = oo.ok ? "gesetzt" : `nicht gesetzt: ${oo.fehler || "unbekannt"}`;
      }
    }

    return antwort(ergebnis);
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
