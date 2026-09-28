// ============================================================================
// projekt-daten (v11)
//   Oeffentliche Daten-API fuer Projekt-Homepages + Kundenbereich.
//   v6: Ordner, v7: Zahlungsplan/Maengel raus, v8: ansprechpartner + kontakte,
//   v9: persoenliche Dateien (zugang_id), v10: nachrichten (Chat).
//   NEU v11: Dateien nur noch mit freigegeben = true (explizite Freigabe im
//   E&P-World-Portal); Rolle 'zurueckgetreten' sieht nur Interessenten-Stufe.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SICHTBAR_FUER: Record<string, string[]> = {
  oeffentlich: ["oeffentlich"],
  interessent: ["oeffentlich", "interessent"],
  reserviert: ["oeffentlich", "interessent"],
  kaeufer: ["oeffentlich", "interessent", "kaeufer"],
  zurueckgetreten: ["oeffentlich", "interessent"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    let slug = "", token = "", session = "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      slug = (body.slug || "").toString().trim();
      token = (body.token || "").toString().trim();
      session = (body.session || "").toString().trim();
    } else {
      const u = new URL(req.url);
      slug = (u.searchParams.get("slug") || "").trim();
      token = (u.searchParams.get("token") || "").trim();
      session = (u.searchParams.get("session") || "").trim();
    }
    if (!slug) throw new Error("slug ist Pflicht.");

    const { data: projekt } = await admin.from("projekte")
      .select("id, slug, name, untertitel, ort, strasse, plz, vermarktungsart, beschreibung, status")
      .eq("slug", slug).eq("status", "aktiv").maybeSingle();
    if (!projekt) throw new Error("Projekt nicht gefunden.");

    const { data: einheiten } = await admin.from("projekt_einheiten")
      .select("id, we_nr, zimmer, geschoss, geschoss_index, wohnflaeche, kaufpreis, miete, ausrichtung, status, sortierung")
      .eq("projekt_id", projekt.id)
      .order("sortierung", { ascending: true });

    let rolle = "oeffentlich";
    let zugang: any = null;
    let zugangId: string | null = null;
    let ansprechpartnerId: string | null = null;
    let eingeloggt = false;

    if (session) {
      const { data: z } = await admin.from("projekt_zugaenge")
        .select("id, rolle, anzeigename, email, einheit_id, aktiv, session_gueltig_bis, fortschritt_stufe, fortschritt_notiz, ansprechpartner_id")
        .eq("projekt_id", projekt.id).eq("session_token", session).maybeSingle();
      if (z && z.aktiv && z.session_gueltig_bis && new Date(z.session_gueltig_bis).getTime() > Date.now()) {
        rolle = z.rolle;
        eingeloggt = true;
        zugangId = z.id;
        ansprechpartnerId = z.ansprechpartner_id || null;
        zugang = { anzeigename: z.anzeigename, rolle: z.rolle, einheit_id: z.einheit_id, passwort_gesetzt: true, fortschritt_stufe: z.fortschritt_stufe || 1, fortschritt_notiz: z.fortschritt_notiz || null };
        await admin.from("projekt_zugaenge").update({ letzter_login_am: new Date().toISOString() }).eq("id", z.id);
        try {
          const { data: letzte } = await admin.from("projekt_aktivitaeten")
            .select("created_at").eq("zugang_id", z.id).eq("typ", "kundenbereich_geoeffnet")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (!letzte || (Date.now() - new Date(letzte.created_at).getTime()) > 60 * 60 * 1000) {
            await admin.from("projekt_aktivitaeten").insert({ projekt_id: projekt.id, zugang_id: z.id, typ: "kundenbereich_geoeffnet" });
          }
        } catch (_e) { /* Log darf nie blockieren */ }
      }
    } else if (token) {
      const { data: z } = await admin.from("projekt_zugaenge")
        .select("id, rolle, anzeigename, email, einheit_id, aktiv, passwort_gesetzt_am")
        .eq("projekt_id", projekt.id).eq("token", token).maybeSingle();
      if (z && z.aktiv) {
        zugang = { anzeigename: z.anzeigename, rolle: z.rolle, einheit_id: z.einheit_id, passwort_gesetzt: !!z.passwort_gesetzt_am };
      }
    }
    const erlaubt = SICHTBAR_FUER[rolle] || SICHTBAR_FUER.oeffentlich;

    // Ordnernamen fuer die Gruppierung im Kundenbereich
    const { data: ordnerRoh } = await admin.from("projekt_ordner")
      .select("id, name").eq("projekt_id", projekt.id);
    const ordnerMap = new Map((ordnerRoh || []).map((o: any) => [o.id, o.name]));

    const signiere = async (pfad: string) => {
      try {
        const { data: signed } = await admin.storage.from("projekt-dateien").createSignedUrl(pfad, 3600);
        return signed?.signedUrl || null;
      } catch (_e) { return null; }
    };

    // Allgemeine Dateien (ohne persoenliche) — nur freigegebene
    const { data: dateienRoh } = await admin.from("projekt_dateien")
      .select("id, name, pfad, content_type, groesse, kategorie, sichtbarkeit, einheit_id, ordner_id, created_at")
      .eq("projekt_id", projekt.id)
      .is("zugang_id", null)
      .eq("freigegeben", true)
      .in("sichtbarkeit", erlaubt)
      .order("created_at", { ascending: false });
    const dateienGefiltert = (dateienRoh || []).filter((d: any) =>
      !d.einheit_id || (eingeloggt && zugang && zugang.einheit_id && d.einheit_id === zugang.einheit_id));

    const dateien: any[] = [];

    // Persoenliche Dateien des eingeloggten Kunden — immer zuoberst, nur freigegebene
    if (eingeloggt && zugangId) {
      const { data: persoenlichRoh } = await admin.from("projekt_dateien")
        .select("id, name, pfad, content_type, groesse, kategorie, created_at")
        .eq("projekt_id", projekt.id).eq("zugang_id", zugangId).eq("freigegeben", true)
        .order("created_at", { ascending: false });
      for (const d of (persoenlichRoh || [])) {
        dateien.push({
          id: d.id, name: d.name, kategorie: d.kategorie, sichtbarkeit: "persoenlich",
          groesse: d.groesse, content_type: d.content_type, created_at: d.created_at,
          url: await signiere(d.pfad), ordner: null, persoenlich: true,
        });
      }
    }

    for (const d of dateienGefiltert) {
      dateien.push({
        id: d.id, name: d.name, kategorie: d.kategorie, sichtbarkeit: d.sichtbarkeit,
        groesse: d.groesse, content_type: d.content_type, created_at: d.created_at,
        url: await signiere(d.pfad),
        ordner: d.ordner_id ? (ordnerMap.get(d.ordner_id) || null) : null,
      });
    }

    const { data: updatesRoh } = await admin.from("projekt_updates")
      .select("id, titel, text, bilder, sichtbarkeit, created_at")
      .eq("projekt_id", projekt.id)
      .in("sichtbarkeit", erlaubt)
      .order("created_at", { ascending: false })
      .limit(20);

    const updates = [];
    for (const u of (updatesRoh || [])) {
      const bilderUrls: string[] = [];
      for (const pfad of (Array.isArray(u.bilder) ? u.bilder : [])) {
        const su = await signiere(pfad);
        if (su) bilderUrls.push(su);
      }
      updates.push({ id: u.id, titel: u.titel, text: u.text, sichtbarkeit: u.sichtbarkeit, created_at: u.created_at, bilder_urls: bilderUrls });
    }

    let kundenDateien: any[] = [];
    let merkliste: string[] = [];
    let anfragen: any[] = [];
    let ansprechpartner: any = null;
    let kontakte: any[] = [];
    let nachrichten: any[] = [];
    if (eingeloggt && zugangId) {
      const einheitName = new Map((einheiten || []).map((e: any) => [e.id, e.we_nr]));
      const [{ data: kd }, { data: ml }, { data: an }, { data: ko }, { data: nx }] = await Promise.all([
        admin.from("projekt_kunden_dateien").select("id, name, groesse, created_at")
          .eq("zugang_id", zugangId).order("created_at", { ascending: false }),
        admin.from("projekt_merkliste").select("einheit_id").eq("zugang_id", zugangId),
        admin.from("projekt_anfragen").select("einheit_id, status, created_at")
          .eq("zugang_id", zugangId).order("created_at", { ascending: false }),
        admin.from("projekt_kontakte").select("gewerk, firma, name, telefon, email, info")
          .eq("projekt_id", projekt.id).eq("fuer_kunden", true)
          .order("sortierung", { ascending: true }).order("gewerk", { ascending: true }),
        admin.from("projekt_nachrichten").select("id, richtung, text, absender_name, created_at")
          .eq("zugang_id", zugangId).order("created_at", { ascending: true }).limit(100),
      ]);
      kundenDateien = kd || [];
      merkliste = (ml || []).map((m: any) => einheitName.get(m.einheit_id)).filter(Boolean);
      anfragen = (an || []).map((a: any) => ({ we_nr: einheitName.get(a.einheit_id), status: a.status, created_at: a.created_at })).filter((a: any) => a.we_nr);
      kontakte = ko || [];
      nachrichten = nx || [];
      // Makler-Nachrichten gelten mit dem Abruf als vom Kunden gelesen
      try {
        await admin.from("projekt_nachrichten").update({ gelesen: true })
          .eq("zugang_id", zugangId).eq("richtung", "makler").eq("gelesen", false);
      } catch (_e) { /* nie blockieren */ }
      if (ansprechpartnerId) {
        const { data: ap } = await admin.from("profiles")
          .select("name, funktion, telefon, email, foto_url").eq("id", ansprechpartnerId).maybeSingle();
        if (ap) ansprechpartner = ap;
      }
    }

    return jsonResponse({
      ok: true,
      projekt: { slug: projekt.slug, name: projekt.name, untertitel: projekt.untertitel, ort: projekt.ort, vermarktungsart: projekt.vermarktungsart, beschreibung: projekt.beschreibung },
      einheiten: einheiten || [],
      rolle,
      eingeloggt,
      zugang,
      dateien,
      updates,
      kunden_dateien: kundenDateien,
      merkliste,
      anfragen,
      ansprechpartner,
      kontakte,
      nachrichten,
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
