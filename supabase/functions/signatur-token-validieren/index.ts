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

// --- Firmenname des Mandanten (Phase 2.4) ---------------------------------
// Die Neutralisierung hat den Namen der Referenz ueberall durch den des
// Demo-Mandanten ersetzt. Fuer das Neutralitaets-Gate war das richtig; fuer
// ein mandantenfaehiges Produkt ist ein verdrahteter Firmenname bei jedem
// Mandanten ausser einem falsch — und er stand in Grussformeln, Briefkoepfen
// und im OpenImmo-Feld <firma>, das jedes Portal anzeigt.
//
// Ohne Eintrag liefert diese Funktion einen LEEREN Text, keinen Beispielnamen.
// Die aufrufende Stelle laesst die Zeile dann weg. Eine fehlende Grussformel
// faellt auf; eine falsche nicht.
async function immoFirmenName(db: any, mandant: unknown): Promise<string> {
  if (typeof mandant !== "string" || !mandant) return "";
  const { data } = await db.from("firma_stammdaten")
    .select("firma_name, marken_name")
    .eq("mandant_id", mandant).eq("aktiv", true)
    .order("sortierung", { ascending: true }).limit(1).maybeSingle();
  return String(data?.marken_name || data?.firma_name || "").trim();
}

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
    // --- Storage: Pfade tragen den Mandanten als erstes Segment -----------
    // Gleiche Bauart wie die Huelle der Oberflaeche. Sie steht IM Handler und
    // nicht auf Modulebene: eine Mandantenvariable auf Modulebene ueberlebt in
    // Deno die Anfrage und traegt den Mandanten des einen Aufrufers in den
    // naechsten. Genau das waere ein Leck statt einer Trennung.
    // Solange immoMandant null ist, bleibt jeder Pfad unveraendert — die
    // Funktion verhaelt sich dann wie bisher.
    let immoMandant: string | null = null;
    const immoSetzeMandant = (m: unknown) => { immoMandant = (typeof m === "string" && m) ? m : null; };
    // Schriften sind Plattform-Gut, kein Mandanten-Branding. Sie liegen im
    // Wurzelverzeichnis des Eimers unter fonts/. Fehlt eine, wird sie beim
    // ersten Bedarf von ihrer Quelle geholt und dort abgelegt — danach nie
    // wieder. Ein Mandant, der eine eigene Hausschrift hochlaedt, legt sie
    // unter {mandant}/fonts/… und uebersteuert damit die der Plattform.
    const IMMO_SCHRIFTEN: Record<string, string> = {
      "fonts/Montserrat-Regular.ttf":        "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Regular.ttf",
      "fonts/Montserrat-Bold.ttf":           "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Bold.ttf",
      "fonts/Montserrat-Light.ttf":          "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Light.ttf",
      "fonts/Montserrat-Medium.ttf":         "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Medium.ttf",
      "fonts/Montserrat-SemiBold.ttf":       "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBold.ttf",
      "fonts/Montserrat-Italic.ttf":         "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Italic.ttf",
      "fonts/Montserrat-SemiBoldItalic.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBoldItalic.ttf",
      "fonts/Marcellus-Regular.ttf":         "https://raw.githubusercontent.com/google/fonts/main/ofl/marcellus/Marcellus-Regular.ttf",
      "fonts/GreatVibes-Regular.ttf":        "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf",
    };
    {
      const immoEcht = admin.storage.from.bind(admin.storage);
      const immoVorne = (pf: unknown): unknown =>
        (typeof pf !== "string" || !pf || !immoMandant) ? pf
          : (pf === immoMandant || pf.startsWith(immoMandant + "/") ? pf : immoMandant + "/" + pf);
      const immoViele = (pf: unknown): unknown => Array.isArray(pf) ? pf.map(immoVorne) : immoVorne(pf);
      (admin.storage as any).from = (eimer: string) => {
        const api: any = immoEcht(eimer);
        const h: any = Object.create(api);
        for (const n of ["upload", "remove", "createSignedUrl",
                         "createSignedUrls", "getPublicUrl", "info", "exists"]) {
          if (typeof api[n] === "function") h[n] = (pf: unknown, ...r: unknown[]) => api[n](immoViele(pf), ...r);
        }
        // Lesen in drei Stufen: die Datei des Mandanten, sonst die der
        // Plattform, sonst — bei einer Schrift — einmal von der Quelle.
        // Geschrieben wird dabei nur ins Wurzelverzeichnis und nur eine
        // Schrift; Mandantendateien kann diese Stufe nicht anfassen.
        if (typeof api.download === "function") h.download = async (pf: unknown, ...r: unknown[]) => {
          const hole = async (p: unknown) => {
            try { return await api.download(p, ...r); } catch (e) { return { data: null, error: e }; }
          };
          const erst = await hole(immoViele(pf));
          if (erst?.data) return erst;
          if (typeof pf === "string" && immoMandant) {
            const zweit = await hole(pf);
            if (zweit?.data) return zweit;
          }
          if (eimer === "branding-assets" && typeof pf === "string" && IMMO_SCHRIFTEN[pf]) {
            try {
              const a = await fetch(IMMO_SCHRIFTEN[pf]);
              if (a.ok) {
                const roh = new Uint8Array(await a.arrayBuffer());
                try { await api.upload(pf, roh, { contentType: "font/ttf", upsert: true }); }
                catch (_e) { /* beim naechsten Mal wieder */ }
                console.log("Schrift nachgeladen:", pf, roh.byteLength);
                return { data: new Blob([roh]), error: null };
              }
            } catch (e) { console.warn("Schrift nicht erreichbar:", pf, String(e)); }
          }
          return erst;
        };
        if (typeof api.list === "function") {
          h.list = (pf?: string, ...r: unknown[]) => api.list(pf ? (immoVorne(pf) as string) : (immoMandant ?? pf), ...r);
        }
        for (const n of ["move", "copy"]) {
          if (typeof api[n] === "function") h[n] = (a: unknown, b: unknown, ...r: unknown[]) => api[n](immoVorne(a), immoVorne(b), ...r);
        }
        return h;
      };
    }

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
    immoSetzeMandant(vorgang.mandant_id);

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
      const { data } = await admin.from(quelltabelle).select("*").eq("id", vorgang.vertrag_id).eq("mandant_id", vorgang.mandant_id).maybeSingle();
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
      firma: { name: await immoFirmenName(admin, vorgang.mandant_id) },
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
