/**
 * Fahrzeiten zwischen Terminen (Referenz: „Kalender & Fahrzeiten"): Anfahrt
 * vom vorherigen Termin oder von der Startadresse, Rueckfahrt zum naechsten
 * Termin oder zur Startadresse. Geokodierung ueber Nominatim (OpenStreetMap),
 * Route ueber OpenRouteService, wenn ein Schluessel gesetzt ist — sonst eine
 * gekennzeichnete Schaetzung aus der Luftlinie.
 */

export interface Koordinate { lat: number; lon: number }

export interface Fahrt {
  min: number;
  km: number | null;
  von: string;
  nach: string;
  aus_termin?: string | null;
  zu_termin?: string | null;
  quelle: "route" | "schaetzung";
}

export interface Fahrzeiten {
  hin: Fahrt | null;
  rueck: Fahrt | null;
  basis: string;
  puffer_min: number;
  berechnet_am: string;
}

export function fahrzeitText(min: number | null | undefined): string {
  const n = Math.round(Number(min) || 0);
  if (!n) return "keine Fahrt";
  if (n < 60) return `${n} Min`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? `${h} Std ${r} Min` : `${h} Std`;
}

/** Luftlinie in Kilometern (Haversine). */
export function luftlinieKm(a: Koordinate, b: Koordinate): number {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Schaetzung ohne Routendienst: Umwegfaktor 1,35; in der Stadt langsamer als ueber Land. */
export function fahrtSchaetzen(a: Koordinate, b: Koordinate): { min: number; km: number } {
  const km = Math.round(luftlinieKm(a, b) * 1.35 * 10) / 10;
  const kmh = km < 5 ? 25 : km < 30 ? 40 : km < 100 ? 65 : 85;
  const min = km === 0 ? 0 : Math.max(3, Math.round((km / kmh) * 60));
  return { min, km };
}

export function adresseNormalisieren(adresse: string): string {
  return adresse.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Geokodierung ueber Nominatim — sparsam (Cache in der Datenbank) und mit Kennung. */
export async function geokodieren(adresse: string, fetchFn: typeof globalThis.fetch = globalThis.fetch): Promise<Koordinate | null> {
  const q = adresse.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "json", limit: "1", countrycodes: "de,at,ch" }).toString()}`;
  try {
    const antwort = await fetchFn(url, { headers: { "User-Agent": "ImmoOffice.ai Kalender/1.0", "Accept-Language": "de" } });
    if (!antwort.ok) return null;
    const daten = (await antwort.json()) as Array<{ lat: string; lon: string }>;
    const erster = daten[0];
    if (!erster) return null;
    const lat = Number(erster.lat);
    const lon = Number(erster.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    // Geokodierung nicht erreichbar (Netz, Proxy) — der Aufrufer meldet „Adresse nicht gefunden"
    return null;
  }
}

/** Route mit dem Auto: OpenRouteService, wenn ROUTING_API_KEY gesetzt ist; sonst Schaetzung. */
export async function route(von: Koordinate, nach: Koordinate, fetchFn: typeof globalThis.fetch = globalThis.fetch, schluessel: string | undefined = process.env["ROUTING_API_KEY"]): Promise<{ min: number; km: number; quelle: "route" | "schaetzung" }> {
  if (schluessel) {
    try {
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?${new URLSearchParams({ api_key: schluessel, start: `${von.lon},${von.lat}`, end: `${nach.lon},${nach.lat}` }).toString()}`;
      const antwort = await fetchFn(url, { headers: { Accept: "application/json" } });
      if (antwort.ok) {
        const daten = (await antwort.json()) as { features?: Array<{ properties?: { summary?: { distance?: number; duration?: number } } }> };
        const s = daten.features?.[0]?.properties?.summary;
        if (s && typeof s.duration === "number" && typeof s.distance === "number") {
          return { min: Math.round(s.duration / 60), km: Math.round(s.distance / 100) / 10, quelle: "route" };
        }
      }
    } catch {
      // Routendienst nicht erreichbar → Schaetzung
    }
  }
  return { ...fahrtSchaetzen(von, nach), quelle: "schaetzung" };
}

export interface Nachbar { titel: string; adresse: string; beginnt_am: string; endet_am: string }

/**
 * Woher kommt man, wohin faehrt man: der Termin davor am selben Tag, wenn er
 * hoechstens vier Stunden vorher endet, sonst die Startadresse — und
 * umgekehrt fuer die Rueckfahrt.
 */
export function fahrtenPlanen(termin: { beginnt_am: string; endet_am: string; adresse: string }, vorher: Nachbar | null, nachher: Nachbar | null, basis: string): { hin: { von: string; aus_termin: string | null } | null; rueck: { nach: string; zu_termin: string | null } | null } {
  if (!termin.adresse.trim()) return { hin: null, rueck: null };
  const vierStunden = 4 * 60 * 60_000;
  const hinVon = vorher && vorher.adresse.trim() && new Date(termin.beginnt_am).getTime() - new Date(vorher.endet_am).getTime() <= vierStunden
    ? { von: vorher.adresse, aus_termin: vorher.titel }
    : basis.trim() ? { von: basis, aus_termin: null } : null;
  const rueckNach = nachher && nachher.adresse.trim() && new Date(nachher.beginnt_am).getTime() - new Date(termin.endet_am).getTime() <= vierStunden
    ? { nach: nachher.adresse, zu_termin: nachher.titel }
    : basis.trim() ? { nach: basis, zu_termin: null } : null;
  return { hin: hinVon, rueck: rueckNach };
}
