// ============================================================================
// signatur-token-validieren (v3 — unterstuetzt jetzt auch dokument_typ
// 'objektnachweis', dessen Datensatz aus der objektnachweise-Tabelle statt
// aus vertraege stammt)
// ============================================================================
// Oeffentlich aufrufbar (kein Login), wird von der /?signatur=TOKEN Seite
// beim Laden aufgerufen. Prueft den Token, liefert Vorgang/Vertrag/PDF-Link
// und ob der Empfaenger gerade an der Reihe ist ("kann_unterschreiben").
//
// Input:  { token: string }
// Output: { ok:true, empfaenger, vorgang, vertrag, pdf_signed_url, kann_unterschreiben, warte_hinweis }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const QUELLTABELLE: Record<string, string> = {
  maklervertrag: "vertraege",
  vollmacht: "vertraege",
  objektnachweis: "objektnachweise",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json();
    const token = (body.token || "").toString().trim();
    if (!token) throw new Error("token ist Pflicht.");

    const { data: empfaenger, error: eErr } = await admin
      .from("signatur_empfaenger").select("*").eq("token", token).maybeSingle();
    if (eErr) throw eErr;
    if (!empfaenger) throw new Error("Dieser Link ist ungültig.");

    const { data: vorgang, error: vgErr } = await admin
      .from("signatur_vorgaenge").select("*").eq("id", empfaenger.vorgang_id).maybeSingle();
    if (vgErr) throw vgErr;
    if (!vorgang) throw new Error("Signatur-Vorgang nicht gefunden.");

    // Ablauf pruefen (nur relevant solange noch nicht unterschrieben/abgeschlossen)
    const abgelaufen = vorgang.ablauf_am && new Date(vorgang.ablauf_am).getTime() < Date.now();
    if (abgelaufen && vorgang.status !== "abgeschlossen" && empfaenger.status !== "unterschrieben") {
      if (vorgang.status !== "abgelaufen") {
        await admin.from("signatur_vorgaenge").update({ status: "abgelaufen" }).eq("id", vorgang.id);
        await admin.from("signatur_events").insert({ mandant_id: vorgang.mandant_id, vorgang_id: vorgang.id, event_typ: "abgelaufen", details: {} });
      }
      throw new Error("Dieser Link ist leider abgelaufen. Bitte wenden Sie sich an Ihren Makler für einen neuen Link.");
    }

    let vertrag: any = null;
    if (vorgang.vertrag_id) {
      const quelltabelle = QUELLTABELLE[vorgang.dokument_typ] || "vertraege";
      const { data } = await admin.from(quelltabelle).select("*").eq("id", vorgang.vertrag_id).maybeSingle();
      vertrag = data;
    }

    // Reihenfolge-Logik: ist dieser Empfaenger dran?
    const { data: alleEmpfaenger } = await admin
      .from("signatur_empfaenger").select("*").eq("vorgang_id", vorgang.id).order("reihenfolge", { ascending: true });
    const vorherige = (alleEmpfaenger || []).filter((e: any) => e.reihenfolge < empfaenger.reihenfolge);
    const vorherigeOffen = vorherige.filter((e: any) => e.status !== "unterschrieben");

    let kannUnterschreiben = empfaenger.status !== "unterschrieben" && vorherigeOffen.length === 0;
    let warteHinweis: string | null = null;
    if (empfaenger.status === "unterschrieben") {
      kannUnterschreiben = false;
    } else if (vorherigeOffen.length > 0) {
      kannUnterschreiben = false;
      warteHinweis = empfaenger.rolle === "makler"
        ? "Der/die Auftraggeber müssen zuerst unterschreiben, bevor Sie als Makler gegenzeichnen können. Sie werden per Mail benachrichtigt, sobald Sie an der Reihe sind."
        : "Eine andere Person muss vor Ihnen unterschreiben. Sie werden per Mail benachrichtigt, sobald Sie an der Reihe sind.";
    }

    // "Link geoeffnet"-Event nur beim ersten Mal protokollieren
    if (!empfaenger.geoeffnet_am) {
      await admin.from("signatur_empfaenger").update({
        geoeffnet_am: new Date().toISOString(),
        status: empfaenger.status === "wartend" || empfaenger.status === "eingeladen" ? "geoeffnet" : empfaenger.status,
      }).eq("id", empfaenger.id);
      await admin.from("signatur_events").insert({
        mandant_id: vorgang.mandant_id, vorgang_id: vorgang.id, empfaenger_id: empfaenger.id, event_typ: "link_geoeffnet", details: {},
      });
    }

    // PDF: signiertes PDF falls vorhanden, sonst das unsignierte Original
    const pdfPfad = vorgang.signed_pdf_pfad || vorgang.unsigned_pdf_pfad;
    let pdfSignedUrl: string | null = null;
    if (pdfPfad) {
      const { data: signed } = await admin.storage.from("maklervertraege-pdf").createSignedUrl(pdfPfad, 3600);
      pdfSignedUrl = signed?.signedUrl || null;
    }

    return jsonResponse({
      ok: true,
      empfaenger: {
        id: empfaenger.id, anzeigename: empfaenger.anzeigename, rolle: empfaenger.rolle,
        reihenfolge: empfaenger.reihenfolge, status: empfaenger.status,
      },
      vorgang: {
        id: vorgang.id, dokument_typ: vorgang.dokument_typ, status: vorgang.status,
        begleittext: vorgang.begleittext, ablauf_am: vorgang.ablauf_am,
        inkl_vollmacht: !!vorgang.inkl_vollmacht,
      },
      vertrag: vertrag ? {
        objekt_adresse: vertrag.objekt_adresse, objekt_bezeichnung: vertrag.objekt_bezeichnung,
      } : null,
      pdf_signed_url: pdfSignedUrl,
      kann_unterschreiben: kannUnterschreiben,
      warte_hinweis: warteHinweis,
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("signatur-token-validieren:", meldung);
    return jsonResponse({ ok: false, error: meldung });
  }
});
