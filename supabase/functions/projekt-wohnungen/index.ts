// ============================================================================
// Edge Function: projekt-wohnungen (v2)
// ============================================================================
// OEFFENTLICHE Wohnungsliste eines Bauvorhabens fuer dessen eigene Landingpage
// (z.B. mietwohnungen-teterow.de). Kein Login (verify_jwt=false), reines Lesen,
// nur unbedenkliche Felder — keine Adresse, keine Eigentuemer, keine Notizen.
//
// Liefert die Einheiten nach Haus gruppiert, in genau der Form, die die
// Landingpage bisher fest im Quelltext stehen hatte:
//   { "6_8": { name, wfl: [ {id, zi, ge, fi, wfl, kalt, bk, warm, stpl, st} ] } }
// Damit ist der Umbau der Seite ein Austausch der Konstanten gegen einen Abruf.
//
// Ein Projekt wird hier bewusst als Konstante definiert und nicht ueber einen
// Query-Parameter frei gefiltert: sonst koennte jeder beliebige Objektmengen
// aus dem Bestand oeffentlich abfragen.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Bekannte Projekte. Schluessel = ?projekt=<slug>
// ---------------------------------------------------------------------------
type Projekt = {
  name: string;
  strasse: string;
  ort: string;
  // Reihenfolge der Haeuser auf der Seite. Haeuser ausserhalb dieser Liste
  // werden hinten angehaengt, damit ein neues Haus nicht unsichtbar bleibt.
  haeuser: string[];
};

const PROJEKTE: Record<string, Projekt> = {
  "muehlenblick-teterow": {
    name: "Wohnquartier Mühlenblick",
    strasse: "Mühlenblick",
    ort: "Teterow",
    haeuser: ["6-8", "10-12", "14-16"],
  },
};

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
const zahl = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

// "6-8" -> "6_8"; der Schluessel muss zu dem passen, was die Seite erwartet.
const hausSchluessel = (h: string) => String(h || "").trim().replace(/\s+/g, "").replace(/[-\/]/g, "_");
const hausName = (projekt: Projekt, h: string) => projekt.name.replace(/^Wohnquartier\s+/, "") + " " + String(h || "").replace("-", "/");

// Etagen-Index fuer das Gebaeudemodell der Seite: EG = 0, 1. OG = 1, ...
function etagenIndex(etage: string | null): number {
  const e = String(etage || "").toLowerCase().trim();
  if (!e) return 0;
  if (e.startsWith("eg") || e.includes("erdgesch")) return 0;
  if (e.includes("ug") || e.includes("souterrain") || e.includes("keller")) return -1;
  if (e.includes("dg") || e.includes("dachgesch")) return 99;
  const m = e.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

// Status der World -> Beschriftung auf der Seite.
function statusLabel(status: string | null, vermietetFlag: boolean | null): string {
  switch (String(status || "")) {
    case "reserviert": return "Reserviert";
    case "archiviert": return "Vermietet";
    case "vermarktung": return vermietetFlag === true ? "Vermietet" : "Verfügbar";
    default: return "Verfügbar";
  }
}

// Wohnungsnummern natuerlich sortieren: "WG 2" vor "WG 10".
function nrWert(s: string | null): number {
  const m = String(s || "").match(/(\d+)/);
  return m ? Number(m[1]) : 9999;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("projekt") || "";
    const projekt = PROJEKTE[slug];
    if (!projekt) {
      return json({ ok: false, error: "Unbekanntes Projekt", bekannt: Object.keys(PROJEKTE) }, 404);
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await db.from("immobilien")
      .select("id, immo_nr, wohnungsnr, etage, zimmer, wohnflaeche, kaltmiete, nebenkosten, heizkosten, stellplatzmiete, stellplatz_anzahl, status, vermietet, hausnummer, verfuegbar_ab")
      // Tor fuer die Microsite ist der Vermarktungsstand, NICHT die Spalte
      // website_veroeffentlichen — die steuert die Hauptseite immooffice.example.
      // Sonst haette ein Projekt-Auftritt ungewollt die Hauptwebsite mitbefuellt.
      .in("status", ["vermarktung", "reserviert", "archiviert"])
      .ilike("strasse", projekt.strasse)
      .ilike("ort", projekt.ort)
      .limit(500);
    if (error) throw error;

    const haeuser: Record<string, { name: string; wfl: unknown[] }> = {};
    let gesamt = 0, verfuegbar = 0, reserviert = 0, vermietet = 0;

    // Reihenfolge festlegen, damit die Seite die Haeuser stabil anzeigt.
    const reihenfolge = [...projekt.haeuser];
    for (const i of data || []) {
      const h = String(i.hausnummer || "").trim();
      if (h && !reihenfolge.includes(h)) reihenfolge.push(h);
    }

    for (const h of reihenfolge) {
      const drin = (data || []).filter((i) => String(i.hausnummer || "").trim() === h);
      if (!drin.length) continue;
      drin.sort((a, b) => nrWert(a.wohnungsnr) - nrWert(b.wohnungsnr));

      haeuser[hausSchluessel(h)] = {
        name: hausName(projekt, h),
        wfl: drin.map((i) => {
          const kalt = zahl(i.kaltmiete);
          const bk = zahl(i.nebenkosten);
          const hk = zahl(i.heizkosten);
          // Warmmiete wird gerechnet, nie gespeichert — sonst steht sie
          // irgendwann im Widerspruch zu den Einzelbetraegen.
          const warm = kalt === null ? null : kalt + (bk || 0) + (hk || 0);
          const st = statusLabel(i.status, i.vermietet);
          gesamt++;
          if (st === "Reserviert") reserviert++; else if (st === "Vermietet") vermietet++; else verfuegbar++;
          return {
            id: i.wohnungsnr || i.immo_nr,
            zi: zahl(i.zimmer),
            ge: i.etage || "",
            fi: etagenIndex(i.etage),
            wfl: zahl(i.wohnflaeche),
            kalt,
            bk,
            warm,
            stpl: zahl(i.stellplatzmiete),
            st,
            frei_ab: i.verfuegbar_ab || null,
          };
        }),
      };
    }

    return json({
      ok: true,
      projekt: projekt.name,
      stand: new Date().toISOString(),
      zaehler: { gesamt, verfuegbar, reserviert, vermietet },
      GB: haeuser,
    }, 200, { "Cache-Control": "public, max-age=60" });

  } catch (e) {
    console.error("projekt-wohnungen:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}
