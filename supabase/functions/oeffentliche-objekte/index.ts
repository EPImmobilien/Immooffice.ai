// ============================================================================
// oeffentliche-objekte — OEFFENTLICHE Objektliste fuer die Webseite (v6)
// ============================================================================
// Liefert zwei Quellen zusammen:
//   1. onOffice-Spiegel: aktiv=true UND auf_webseite=true (wie bisher)
//   2. Eigenes CRM (immobilien): website_veroeffentlichen=true UND
//      Status in (vermarktung, reserviert)
// Nur oeffentlich unbedenkliche Felder. Adresse (Strasse/Hausnr.) nur bei
// adresse_freigeben=true. Kein Login noetig (verify_jwt=false), reines Lesen.
//
// v6: rundgang_url mitgeliefert, damit immobilien.html einen Knopf
//     "360°-Rundgang" zeigen kann, wenn ein Rundgang veroeffentlicht ist.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    // optionaler Filter via Query (?vermarktung=kauf|miete, ?id=<onoffice_id oder ep_<uuid>>)
    const url = new URL(req.url);
    const vermarktung = url.searchParams.get("vermarktung");
    const einzelId = url.searchParams.get("id");
    const nurEigene = einzelId?.startsWith("ep_");

    // ---- Quelle 1: onOffice-Spiegel ----
    let onoffice: Record<string, unknown>[] = [];
    if (!nurEigene) {
      let q = supabase.from("onoffice_objekte")
        .select("onoffice_id, objektnr_extern, titel, objektart, vermarktungsart, plz, ort, kaufpreis, kaltmiete, wohnflaeche, grundstueck, zimmer, baujahr, hauptbild_url, updated_at")
        .eq("aktiv", true).eq("auf_webseite", true);
      if (vermarktung === "kauf" || vermarktung === "miete") q = q.eq("vermarktungsart", vermarktung);
      if (einzelId) q = q.eq("onoffice_id", einzelId);
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(1000);
      if (error) throw error;
      onoffice = (data || []).map((o) => ({ ...o, quelle: "onoffice", top_angebot: false, referenz: false, strasse: null, hausnummer: null, status: null, rundgang_url: null }));
    }

    // ---- Quelle 2: eigenes CRM ----
    let eigene: Record<string, unknown>[] = [];
    {
      let q = supabase.from("immobilien")
        .select("id, immo_nr, bezeichnung, objekttitel, objektart, objekttyp, vertragsart, strasse, hausnummer, plz, ort, angebotspreis, kaltmiete, nebenkosten, wohnflaeche, nutzflaeche, grundstueck, zimmer, baujahr, hauptbild_url, status, website_top_angebot, referenz, adresse_freigeben, provisionsfrei, provision_aussen, verfuegbar_ab, beschreibung_objekt, energie_klasse, energie_kennwert, energieausweis_typ, rundgang_url, updated_at")
        .eq("website_veroeffentlichen", true)
        .in("status", ["vermarktung", "reserviert"]);
      if (einzelId && nurEigene) q = q.eq("id", einzelId.slice(3));
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(1000);
      if (error) throw error;

      eigene = (data || [])
        .map((i) => {
          const va = i.vertragsart === "vermietung" ? "miete" : "kauf";
          return {
            onoffice_id: "ep_" + i.id,
            objektnr_extern: i.immo_nr,
            titel: i.objekttitel || i.bezeichnung || [i.objekttyp || i.objektart, i.ort].filter(Boolean).join(" in "),
            objektart: i.objekttyp || i.objektart,
            vermarktungsart: va,
            strasse: i.adresse_freigeben ? i.strasse : null,
            hausnummer: i.adresse_freigeben ? i.hausnummer : null,
            plz: i.plz,
            ort: i.ort,
            kaufpreis: va === "kauf" ? i.angebotspreis : null,
            kaltmiete: i.kaltmiete,
            nebenkosten: i.nebenkosten,
            wohnflaeche: i.wohnflaeche,
            nutzflaeche: i.nutzflaeche,
            grundstueck: i.grundstueck,
            zimmer: i.zimmer,
            baujahr: i.baujahr,
            hauptbild_url: i.hauptbild_url,
            status: i.status,
            top_angebot: !!i.website_top_angebot,
            referenz: !!i.referenz,
            provisionsfrei: !!i.provisionsfrei,
            provision_aussen: i.provisionsfrei ? null : i.provision_aussen,
            verfuegbar_ab: i.verfuegbar_ab,
            beschreibung: i.beschreibung_objekt,
            energie_klasse: i.energie_klasse,
            energie_kennwert: i.energie_kennwert,
            energieausweis_typ: i.energieausweis_typ,
            // 360-Grad-Rundgang: nur gesetzt, solange der Rundgang veroeffentlicht ist
            rundgang_url: i.rundgang_url || null,
            updated_at: i.updated_at,
            quelle: "eigen",
          };
        })
        .filter((o) => !vermarktung || o.vermarktungsart === vermarktung);
    }

    const alle = [...eigene, ...onoffice].sort((a, b) =>
      new Date(String(b.updated_at || 0)).getTime() - new Date(String(a.updated_at || 0)).getTime()
    );

    return new Response(JSON.stringify({ ok: true, anzahl: alle.length, objekte: alle }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, fehler: e instanceof Error ? e.message : String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
