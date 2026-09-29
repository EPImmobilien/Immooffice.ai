// ============================================================================
// fahrt-ermitteln — Strecke Firma <-> Objekt, einfache Fahrt
// ----------------------------------------------------------------------------
// Der Kostenrechner braucht eine Strecke je Objekt, unabhaengig von einem
// einzelnen Termin. termin-fahrzeit kann das nicht: es verlangt Datum und
// Uhrzeit und haengt die Strecke an den vorherigen bzw. naechsten Termin des
// Tages. Deshalb diese eigene Funktion — Geocoding, Cache und Routing arbeiten
// aber genauso wie dort, damit beide dieselben Zahlen liefern.
//
// Body: { immobilie_id, neu_ermitteln?: boolean }
// Antwort: { ok, km_einfach, minuten_einfach, koordinaten, quelle, aus_cache }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const USER_AGENT = "ImmoOffice/1.0 (info@immooffice.example)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org/route/v1/driving";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Punkt = { lat: number; lon: number };

const norm = (s: string) => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "").trim();

function haversine(a: Punkt, b: Punkt): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
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

// Gleicher Cache wie termin-fahrzeit, damit Nominatim nicht doppelt belastet wird.
async function geocode(db: any, adresse: string): Promise<Punkt | null> {
  const key = norm(adresse);
  if (!key) return null;
  const { data: cache } = await db.from("geo_cache").select("lat, lon, gefunden").eq("adresse_norm", key).maybeSingle();
  if (cache) return cache.gefunden && cache.lat != null ? { lat: cache.lat, lon: cache.lon } : null;
  let treffer: Punkt | null = null;
  try {
    treffer = await nominatim(adresse);
  } catch (e) {
    console.warn("Geocoding:", e instanceof Error ? e.message : String(e));
    return null;
  }
  await db.from("geo_cache").upsert({
    adresse_norm: key, adresse, lat: treffer?.lat ?? null, lon: treffer?.lon ?? null, gefunden: !!treffer,
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
  // Rueckfall: Luftlinie mit Umwegfaktor, 50 km/h
  const km = Math.round(haversine(a, b) * 1.35 * 10) / 10;
  return { min: Math.max(1, Math.ceil(km / 50 * 60)), km, quelle: "schaetzung" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    // Wer fragt. Beim Aufruf mit dem Dienstschluessel (Cron) bleibt es leer;
    // dann entscheidet allein der Mandant des Objekts.
    let aufruferMandant: string | null = null;
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (!u?.user) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
      const { data: p } = await db.from("profiles").select("role, mandant_id").eq("id", u.user.id).maybeSingle();
      if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
      aufruferMandant = p.mandant_id || null;
    }

    const body = await req.json().catch(() => ({}));
    const immobilieId = String(body.immobilie_id || "").trim();
    if (!immobilieId) return antwort({ ok: false, fehler: "Feld „immobilie_id“ fehlt." }, 400);

    // Erst das Objekt, dann alles Weitere. Ohne es steht der Mandant nicht
    // fest — und ohne den waere schon der Blick in den Zwischenspeicher eine
    // Auskunft ueber ein fremdes Objekt: Entfernung, Fahrzeit, Koordinaten.
    const { data: immo } = await db.from("immobilien")
      .select("id, strasse, hausnummer, plz, ort, lage_koordinaten, mandant_id").eq("id", immobilieId).maybeSingle();
    if (!immo) return antwort({ ok: false, fehler: "Objekt nicht gefunden." }, 404);
    if (aufruferMandant && immo.mandant_id !== aufruferMandant) {
      return antwort({ ok: false, fehler: "Objekt nicht gefunden." }, 404);
    }

    // Ein manuell gesetzter Wert wird nie ueberschrieben.
    const { data: vorhanden } = await db.from("immobilie_fahrt_cache").select("*").eq("mandant_id", immo.mandant_id).eq("immobilie_id", immobilieId).maybeSingle();
    if (vorhanden?.manuell) {
      return antwort({ ok: true, aus_cache: true, manuell: true, km_einfach: vorhanden.km_einfach,
                       minuten_einfach: vorhanden.minuten_einfach, koordinaten: vorhanden.koordinaten, quelle: vorhanden.quelle });
    }
    if (vorhanden && body.neu_ermitteln !== true) {
      return antwort({ ok: true, aus_cache: true, manuell: false, km_einfach: vorhanden.km_einfach,
                       minuten_einfach: vorhanden.minuten_einfach, koordinaten: vorhanden.koordinaten, quelle: vorhanden.quelle });
    }

    // Der Firmensitz, von dem aus gerechnet wird, gehoert dem Mandanten des
    // Objekts. Bis fork_28 gab es ihn einmal fuer die ganze Plattform.
    const { data: saetze } = await db.from("kosten_saetze").select("firmen_adresse, firmen_koordinaten").eq("mandant_id", immo.mandant_id).eq("id", 1).maybeSingle();
    const firmenAdresse = String(saetze?.firmen_adresse || "");

    // Firmensitz: erst die hinterlegten Koordinaten, sonst geocodieren
    let pFirma: Punkt | null = null;
    const fk = saetze?.firmen_koordinaten;
    if (fk && fk.lat != null && fk.lon != null) pFirma = { lat: Number(fk.lat), lon: Number(fk.lon) };
    if (!pFirma) pFirma = await geocode(db, firmenAdresse);
    if (!pFirma) return antwort({ ok: false, fehler: `Der Firmensitz „${firmenAdresse}“ konnte nicht verortet werden.` }, 200);

    // Objekt: erst die am Objekt hinterlegten Koordinaten, sonst die Adresse
    let pZiel: Punkt | null = null;
    const lk = immo.lage_koordinaten;
    if (lk && lk.lat != null && (lk.lon != null || lk.lng != null)) {
      pZiel = { lat: Number(lk.lat), lon: Number(lk.lon != null ? lk.lon : lk.lng) };
    }
    const zielAdresse = [[immo.strasse, immo.hausnummer].filter(Boolean).join(" "),
                         [immo.plz, immo.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (!pZiel) {
      if (!zielAdresse.replace(/[\s,]/g, "")) {
        return antwort({ ok: false, fehler: "Das Objekt hat weder Koordinaten noch eine Adresse — ohne die geht keine Strecke." }, 200);
      }
      pZiel = await geocode(db, zielAdresse);
    }
    if (!pZiel) return antwort({ ok: false, fehler: `Die Adresse „${zielAdresse}“ konnte nicht gefunden werden.` }, 200);

    const r = await route(pFirma, pZiel);

    const satz = {
      immobilie_id: immobilieId,
      mandant_id: immo.mandant_id,
      km_einfach: r.km,
      minuten_einfach: r.min,
      koordinaten: { lat: pZiel.lat, lon: pZiel.lon },
      quelle: r.quelle,
      manuell: false,
      ermittelt_am: new Date().toISOString(),
    };
    const { error } = await db.from("immobilie_fahrt_cache").upsert(satz, { onConflict: "immobilie_id" });
    if (error) throw error;

    return antwort({ ok: true, aus_cache: false, manuell: false, von: firmenAdresse, nach: zielAdresse, ...satz });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
