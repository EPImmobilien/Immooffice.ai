// ============================================================
// Edge Function: entfernungen-berechnen
//
// Berechnet Luftlinien-Distanzen von einer Objekt-Adresse zu den
// nächsten Punkten verschiedener POI-Kategorien.
//
// Workflow:
//   1. Adresse → Koordinaten (Nominatim Geocoding)
//   2. Für jede Kategorie: nächsten POI im Umkreis suchen (Overpass)
//   3. Haversine-Distanz berechnen
//
// Quelle: OpenStreetMap (kostenlos, keine API-Keys)
// User-Agent: Pflicht laut OSM-Nutzungsbedingungen
//
// Deployment:
//   1. Datei nach supabase/functions/entfernungen-berechnen/index.ts
//   2. supabase functions deploy entfernungen-berechnen --no-verify-jwt
//
// Input:  { adresse: "Straße 12, 18055 Rostock" }
// Output: { ok: true, koordinaten: { lat, lon }, distanzen: { kindergarten, grundschule, ... }, hinweise: [...] }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const USER_AGENT = "ImmoOffice/1.0 ([email protected])";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// POI-Definitionen
// Pro Kategorie: Overpass-Query (OSM-Tags) + Suchradius in Metern
const POI_KATEGORIEN: Record<string, { query: (lat: number, lon: number, radius: number) => string; radius: number }> = {
  kindergarten: {
    radius: 5000,
    query: (lat, lon, r) => `[out:json][timeout:25];
(
  node["amenity"="kindergarten"](around:${r},${lat},${lon});
  way["amenity"="kindergarten"](around:${r},${lat},${lon});
);
out center 50;`,
  },
  grundschule: {
    radius: 5000,
    query: (lat, lon, r) => `[out:json][timeout:25];
(
  node["amenity"="school"]["isced:level"~"^1"](around:${r},${lat},${lon});
  way["amenity"="school"]["isced:level"~"^1"](around:${r},${lat},${lon});
  node["amenity"="school"]["school:type"~"primary|grund"](around:${r},${lat},${lon});
  way["amenity"="school"]["school:type"~"primary|grund"](around:${r},${lat},${lon});
  node["amenity"="school"][name~"[Gg]rundschule"](around:${r},${lat},${lon});
  way["amenity"="school"][name~"[Gg]rundschule"](around:${r},${lat},${lon});
);
out center 50;`,
  },
  realschule: {
    radius: 10000,
    query: (lat, lon, r) => `[out:json][timeout:25];
(
  node["amenity"="school"][name~"[Rr]ealschule|[Rr]egional|[Gg]esamtschule"](around:${r},${lat},${lon});
  way["amenity"="school"][name~"[Rr]ealschule|[Rr]egional|[Gg]esamtschule"](around:${r},${lat},${lon});
);
out center 50;`,
  },
  gymnasium: {
    radius: 15000,
    query: (lat, lon, r) => `[out:json][timeout:25];
(
  node["amenity"="school"][name~"[Gg]ymnasium"](around:${r},${lat},${lon});
  way["amenity"="school"][name~"[Gg]ymnasium"](around:${r},${lat},${lon});
);
out center 50;`,
  },
  autobahn: {
    radius: 30000,
    query: (lat, lon, r) => `[out:json][timeout:25];
(
  node["highway"="motorway_junction"](around:${r},${lat},${lon});
);
out 50;`,
  },
  zentrum: {
    radius: 30000,
    query: (lat, lon, r) => `[out:json][timeout:25];
(
  node["place"~"^(city|town)$"](around:${r},${lat},${lon});
);
out 30;`,
  },
  einkaufen: {
    radius: 5000,
    query: (lat, lon, r) => `[out:json][timeout:25];
(
  node["shop"~"^(supermarket|convenience|bakery)$"](around:${r},${lat},${lon});
  way["shop"~"^(supermarket|convenience|bakery)$"](around:${r},${lat},${lon});
);
out center 100;`,
  },
  flughafen: {
    radius: 200000,
    query: (lat, lon, r) => `[out:json][timeout:25];
(
  node["aeroway"="aerodrome"]["aerodrome:type"!~"private|military"](around:${r},${lat},${lon});
  way["aeroway"="aerodrome"]["aerodrome:type"!~"private|military"](around:${r},${lat},${lon});
);
out center 30;`,
  },
  bus: {
    radius: 3000,
    query: (lat, lon, r) => `[out:json][timeout:25];
(
  node["highway"="bus_stop"](around:${r},${lat},${lon});
  node["public_transport"="platform"]["bus"="yes"](around:${r},${lat},${lon});
);
out 100;`,
  },
};

// Haversine: Luftlinie in km zwischen zwei Punkten
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Adresse → Koordinaten via Nominatim
async function geocode(adresse: string): Promise<{ lat: number; lon: number; display_name?: string } | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", adresse);
  url.searchParams.set("format", "json");
  url.searchParams.set("countrycodes", "de");
  url.searchParams.set("limit", "1");

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!resp.ok) return null;
  const arr = await resp.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return {
    lat: parseFloat(arr[0].lat),
    lon: parseFloat(arr[0].lon),
    display_name: arr[0].display_name,
  };
}

// Overpass-Query ausführen, alle POIs zurückgeben
async function overpassAbfrage(query: string): Promise<Array<{ lat: number; lon: number; name?: string }>> {
  const resp = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!resp.ok) return [];
  const json = await resp.json();
  const elemente = json.elements || [];
  const punkte: Array<{ lat: number; lon: number; name?: string }> = [];
  for (const el of elemente) {
    let lat: number | undefined, lon: number | undefined;
    if (el.lat !== undefined && el.lon !== undefined) {
      lat = el.lat; lon = el.lon;
    } else if (el.center) {
      lat = el.center.lat; lon = el.center.lon;
    }
    if (lat !== undefined && lon !== undefined) {
      punkte.push({ lat, lon, name: el.tags?.name });
    }
  }
  return punkte;
}

// Für eine Kategorie: nächsten POI finden und Distanz berechnen
async function naechsteDistanz(
  baseLat: number, baseLon: number, kategorie: string,
): Promise<{ distanz_km: number; name?: string } | null> {
  const def = POI_KATEGORIEN[kategorie];
  if (!def) return null;
  try {
    const punkte = await overpassAbfrage(def.query(baseLat, baseLon, def.radius));
    if (punkte.length === 0) return null;
    let min = Infinity;
    let minName: string | undefined;
    for (const p of punkte) {
      // Bei "zentrum": nur Punkte mit Mindestabstand zählen (sonst ist das Dorf in dem das Objekt liegt selbst der Treffer)
      const d = haversine(baseLat, baseLon, p.lat, p.lon);
      if (kategorie === "zentrum" && d < 0.3) continue;
      if (d < min) { min = d; minName = p.name; }
    }
    if (min === Infinity) return null;
    return { distanz_km: Math.round(min * 10) / 10, name: minName };
  } catch (e) {
    console.warn(`Kategorie ${kategorie} fehlgeschlagen:`, e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Nur POST" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { adresse } = await req.json();
    if (!adresse || typeof adresse !== "string") {
      throw new Error("Feld 'adresse' fehlt");
    }

    // 1. Geocoding
    const koord = await geocode(adresse);
    if (!koord) {
      return new Response(
        JSON.stringify({ ok: false, error: `Adresse "${adresse}" nicht gefunden` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Distanzen parallel berechnen
    const kategorien = Object.keys(POI_KATEGORIEN);
    const ergebnisse = await Promise.all(
      kategorien.map(k => naechsteDistanz(koord.lat, koord.lon, k)),
    );

    const distanzen: Record<string, { km: number; name?: string } | null> = {};
    const hinweise: string[] = [];
    kategorien.forEach((k, i) => {
      const r = ergebnisse[i];
      if (r === null) {
        distanzen[k] = null;
        hinweise.push(`Kategorie "${k}": kein Treffer im Suchradius — bitte manuell prüfen`);
      } else {
        distanzen[k] = { km: r.distanz_km, name: r.name };
      }
    });

    return new Response(
      JSON.stringify({
        ok: true,
        koordinaten: { lat: koord.lat, lon: koord.lon },
        gefundene_adresse: koord.display_name,
        distanzen,
        hinweise,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});