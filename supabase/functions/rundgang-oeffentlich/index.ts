// ============================================================================
// rundgang-oeffentlich — OEFFENTLICHE Daten eines 360-Grad-Rundgangs (v1)
// ============================================================================
// Aufruf:  GET /rundgang-oeffentlich?t=<share_token>
// Liefert nur bei status='oeffentlich'. Kein Login (verify_jwt=false), reines
// Lesen; die Token-Pruefung macht diese Function selbst.
//
// Bewusst NICHT im Ergebnis: immobilie_id, Eigentuemerdaten, Hausnummer,
// interne Pfade ausser den Bilddateien des Rundgangs. Der Bucket
// immobilie-dateien ist oeffentlich lesbar, daher direkte public-URLs wie in
// der Foto-Galerie des Portals — keine signierten URLs noetig.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const BUCKET = "immobilie-dateien";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const antwort = (koerper: unknown, cache: string) =>
    new Response(JSON.stringify(koerper), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": cache },
    });

  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get("t") || "").trim();

    // Token-Form pruefen, bevor die Datenbank angefasst wird
    if (!/^[a-zA-Z0-9]{16,64}$/.test(token)) {
      return antwort({ ok: false, fehler: "Dieser Rundgang-Link ist nicht gültig." }, "no-store");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const oeffentlicheUrl = (pfad: string | null) =>
      pfad ? `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/${pfad.split("/").map(encodeURIComponent).join("/")}` : null;

    // ---- Rundgang ueber Token, nur wenn veroeffentlicht ----
    const { data: rundgang, error: fehlerRundgang } = await supabase
      .from("rundgaenge")
      .select("id, immobilie_id, titel, status, start_szene_id, autorotate, logo_anzeigen, grundriss_pfad")
      .eq("share_token", token)
      .maybeSingle();
    if (fehlerRundgang) throw fehlerRundgang;

    if (!rundgang || rundgang.status !== "oeffentlich") {
      // Bewusst dieselbe Meldung wie bei falschem Token — kein Hinweis darauf,
      // ob es den Rundgang gibt und er nur zurueckgezogen wurde.
      return antwort({ ok: false, fehler: "Dieser Rundgang-Link ist nicht (mehr) gültig." }, "no-store");
    }

    // ---- Szenen ----
    const { data: szenenRoh, error: fehlerSzenen } = await supabase
      .from("rundgang_szenen")
      .select("id, name, sortierung, pfad_web, pfad_original, pfad_thumb, breite, hoehe, start_yaw, start_pitch, start_hfov, nord_offset, grundriss_x, grundriss_y, etage")
      .eq("rundgang_id", rundgang.id)
      .order("sortierung", { ascending: true });
    if (fehlerSzenen) throw fehlerSzenen;

    const szenen = (szenenRoh || []).filter((s) => s.pfad_web || s.pfad_original);
    if (!szenen.length) {
      return antwort({ ok: false, fehler: "Dieser Rundgang enthält noch keine Panoramen." }, "no-store");
    }

    // ---- Hotspots aller Szenen ----
    const szenenIds = szenen.map((s) => s.id);
    const { data: hotspotsRoh, error: fehlerHotspots } = await supabase
      .from("rundgang_hotspots")
      .select("id, szene_id, typ, ziel_szene_id, yaw, pitch, text, ziel_yaw")
      .in("szene_id", szenenIds);
    if (fehlerHotspots) throw fehlerHotspots;

    // Hotspots, die auf eine geloeschte oder leere Szene zeigen, fliegen raus
    const bekannt = new Set(szenenIds);
    const hotspots = (hotspotsRoh || []).filter(
      (h) => h.typ === "info" || (h.ziel_szene_id && bekannt.has(h.ziel_szene_id)),
    );

    // ---- Objekt-Basisdaten: nur was auf der Seite steht ----
    const { data: immobilie } = await supabase
      .from("immobilien")
      .select("objekttitel, bezeichnung, objektart, objekttyp, strasse, plz, ort, adresse_freigeben, hauptbild_url")
      .eq("id", rundgang.immobilie_id)
      .maybeSingle();

    const objekt = immobilie
      ? {
          titel:
            immobilie.objekttitel ||
            immobilie.bezeichnung ||
            [immobilie.objekttyp || immobilie.objektart, immobilie.ort].filter(Boolean).join(" in "),
          // Strasse nur bei Freigabe und stets OHNE Hausnummer
          strasse: immobilie.adresse_freigeben ? immobilie.strasse : null,
          ort: [immobilie.plz, immobilie.ort].filter(Boolean).join(" "),
          hauptbild_url: immobilie.hauptbild_url || null,
        }
      : null;

    const startSzene =
      rundgang.start_szene_id && bekannt.has(rundgang.start_szene_id)
        ? rundgang.start_szene_id
        : szenen[0].id;

    return antwort(
      {
        ok: true,
        rundgang: {
          titel: rundgang.titel,
          autorotate: !!rundgang.autorotate,
          logo_anzeigen: !!rundgang.logo_anzeigen,
          start_szene_id: startSzene,
          grundriss_url: oeffentlicheUrl(rundgang.grundriss_pfad),
        },
        objekt,
        szenen: szenen.map((s) => ({
          id: s.id,
          name: s.name,
          sortierung: s.sortierung,
          bild_url: oeffentlicheUrl(s.pfad_web || s.pfad_original),
          thumb_url: oeffentlicheUrl(s.pfad_thumb || s.pfad_web || s.pfad_original),
          breite: s.breite,
          hoehe: s.hoehe,
          start_yaw: s.start_yaw,
          start_pitch: s.start_pitch,
          start_hfov: s.start_hfov,
          nord_offset: s.nord_offset,
          grundriss_x: s.grundriss_x,
          grundriss_y: s.grundriss_y,
          etage: s.etage,
        })),
        hotspots: hotspots.map((h) => ({
          id: h.id,
          szene_id: h.szene_id,
          typ: h.typ,
          ziel_szene_id: h.ziel_szene_id,
          yaw: h.yaw,
          pitch: h.pitch,
          text: h.text,
          ziel_yaw: h.ziel_yaw,
        })),
      },
      "public, max-age=300",
    );
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, "no-store");
  }
});
