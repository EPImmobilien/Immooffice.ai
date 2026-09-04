import { luftlinieKm, type Koordinate } from "@/lib/kalender/fahrzeit";

/**
 * Infrastruktur rund um ein Objekt (Referenz: „Entfernungen zu Schulen,
 * Einkauf, Verkehr"): naechste Einrichtung je Kategorie aus OpenStreetMap
 * ueber die Overpass-Schnittstelle. Ergebnis wird am Objekt gespeichert und
 * in Objektakte, Web-Expose und Lagetext verwendet.
 */

export const KATEGORIEN = {
  kita: { bezeichnung: "Kita / Kindergarten", radius: 2000, abfrage: 'node["amenity"="kindergarten"]' },
  grundschule: { bezeichnung: "Grundschule / Schule", radius: 3000, abfrage: 'nwr["amenity"="school"]' },
  supermarkt: { bezeichnung: "Supermarkt", radius: 3000, abfrage: 'nwr["shop"="supermarket"]' },
  baecker: { bezeichnung: "Bäckerei", radius: 2000, abfrage: 'nwr["shop"="bakery"]' },
  apotheke: { bezeichnung: "Apotheke", radius: 3000, abfrage: 'nwr["amenity"="pharmacy"]' },
  arzt: { bezeichnung: "Arzt", radius: 3000, abfrage: 'nwr["amenity"="doctors"]' },
  krankenhaus: { bezeichnung: "Krankenhaus", radius: 10000, abfrage: 'nwr["amenity"="hospital"]' },
  haltestelle: { bezeichnung: "Bus / Bahn (Haltestelle)", radius: 2000, abfrage: 'node["public_transport"="stop_position"]["bus"="yes"];node["highway"="bus_stop"];node["railway"="tram_stop"]' },
  bahnhof: { bezeichnung: "Bahnhof", radius: 15000, abfrage: 'nwr["railway"="station"]' },
  autobahn: { bezeichnung: "Autobahnanschluss", radius: 20000, abfrage: 'node["highway"="motorway_junction"]' },
  park: { bezeichnung: "Park / Grünfläche", radius: 3000, abfrage: 'nwr["leisure"="park"]' },
  spielplatz: { bezeichnung: "Spielplatz", radius: 2000, abfrage: 'nwr["leisure"="playground"]' },
} as const;
export type Kategorie = keyof typeof KATEGORIEN;

export interface Einrichtung {
  kategorie: Kategorie;
  name: string | null;
  entfernung_m: number;
  gehminuten: number;
  lat: number;
  lon: number;
}

export interface Infrastruktur {
  standort: Koordinate;
  adresse: string;
  ermittelt_am: string;
  einrichtungen: Einrichtung[];
}

interface OverpassElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

/** Overpass-QL: je Kategorie ein Block mit eigenem Radius, benannt ueber `._` → Antwort nach Kategorie sortiert per Tag-Filter. */
export function overpassAbfrage(k: Koordinate, kategorien: Kategorie[] = Object.keys(KATEGORIEN) as Kategorie[]): string {
  const bloecke = kategorien.map((key) => {
    const kat = KATEGORIEN[key];
    return kat.abfrage.split(";").filter(Boolean).map((a) => `${a}(around:${kat.radius},${k.lat},${k.lon});`).join("");
  });
  return `[out:json][timeout:25];(${bloecke.join("")});out center tags 400;`;
}

/** Zu welcher Kategorie gehoert ein Element (erste passende). */
export function kategorieVon(tags: Record<string, string>): Kategorie | null {
  if (tags["amenity"] === "kindergarten") return "kita";
  if (tags["amenity"] === "school") return "grundschule";
  if (tags["shop"] === "supermarket") return "supermarkt";
  if (tags["shop"] === "bakery") return "baecker";
  if (tags["amenity"] === "pharmacy") return "apotheke";
  if (tags["amenity"] === "doctors") return "arzt";
  if (tags["amenity"] === "hospital") return "krankenhaus";
  if (tags["railway"] === "station") return "bahnhof";
  if (tags["highway"] === "motorway_junction") return "autobahn";
  if (tags["highway"] === "bus_stop" || tags["railway"] === "tram_stop" || tags["public_transport"] === "stop_position") return "haltestelle";
  if (tags["leisure"] === "park") return "park";
  if (tags["leisure"] === "playground") return "spielplatz";
  return null;
}

/** Naechste Einrichtung je Kategorie aus der Overpass-Antwort. */
export function naechsteJeKategorie(standort: Koordinate, elemente: OverpassElement[]): Einrichtung[] {
  const beste = new Map<Kategorie, Einrichtung>();
  for (const e of elemente) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const tags = e.tags ?? {};
    if (lat === undefined || lon === undefined) continue;
    const kat = kategorieVon(tags);
    if (!kat) continue;
    const m = Math.round(luftlinieKm(standort, { lat, lon }) * 1000);
    const bisher = beste.get(kat);
    if (!bisher || m < bisher.entfernung_m) {
      beste.set(kat, { kategorie: kat, name: tags["name"] ?? tags["ref"] ?? null, entfernung_m: m, gehminuten: Math.max(1, Math.round((m * 1.25) / 80)), lat, lon });
    }
  }
  const reihenfolge = Object.keys(KATEGORIEN) as Kategorie[];
  return [...beste.values()].sort((a, b) => reihenfolge.indexOf(a.kategorie) - reihenfolge.indexOf(b.kategorie));
}

export function entfernungText(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`;
}

/** Abfrage bei Overpass; bei Stoerung null (der Aufrufer meldet es). */
export async function infrastrukturErmitteln(standort: Koordinate, adresse: string, fetchFn: typeof globalThis.fetch = globalThis.fetch, jetzt: Date = new Date()): Promise<Infrastruktur | null> {
  try {
    const antwort = await fetchFn("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ImmoOffice.ai Infrastruktur/1.0" }, body: `data=${encodeURIComponent(overpassAbfrage(standort))}` });
    if (!antwort.ok) return null;
    const daten = (await antwort.json()) as { elements?: OverpassElement[] };
    return { standort, adresse, ermittelt_am: jetzt.toISOString(), einrichtungen: naechsteJeKategorie(standort, daten.elements ?? []) };
  } catch {
    return null;
  }
}

/** Ein Satz fuer den Lagetext, z. B. „Supermarkt 350 m, Grundschule 1,2 km, Bahnhof 2,4 km". */
export function infrastrukturSatz(i: Infrastruktur | null | undefined, max = 6): string {
  if (!i || i.einrichtungen.length === 0) return "";
  return i.einrichtungen.slice(0, max).map((e) => `${KATEGORIEN[e.kategorie].bezeichnung.split(" / ")[0]} ${entfernungText(e.entfernung_m)}`).join(", ");
}
