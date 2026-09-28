// ============================================================================
// mietvertrag-pdf (v1)
//   Erzeugt den Wohnraummietvertrag als PDF im Layout der Word-Vorlage
//   (gleiches Muster wie vertrag-pdf beim Maklervertrag).
//   Renderer-Kern liegt in ./kern.js — inkl. optionaler Neubau-Klausel
//   (Vorbehalt Mietbeginn) vor § 1 und angepasstem § 2.1.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, rgb, PageSizes, StandardFonts } from "npm:pdf-lib@1.17.1";
import { renderMietvertragPdf } from "./kern.js";

let fontkitPromise: Promise<any> | null = null;
function ladeFontkit(): Promise<any> {
  if (!fontkitPromise) {
    fontkitPromise = import("npm:@pdf-lib/fontkit@1.1.1")
      .then((mod) => mod.default || mod)
      .catch(() => null);
  }
  return fontkitPromise;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FONT_MONTSERRAT_REGULAR = "fonts/Montserrat-Regular.ttf";
const FONT_MONTSERRAT_BOLD    = "fonts/Montserrat-Bold.ttf";
const LOGO_PFAD               = "logo.png";

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
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData?.user) throw new Error("Nicht authentifiziert.");

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
    const { data: profil } = await admin.from("profiles").select("*").eq("id", userData.user.id).maybeSingle(); immoSetzeMandant(profil?.mandant_id);
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) {
      throw new Error("Keine Berechtigung.");
    }

    const body = await req.json();
    const mietvertragId = (body.mietvertrag_id || "").toString().trim();
    if (!mietvertragId) throw new Error("mietvertrag_id ist Pflicht.");

    const { data: vertrag, error: vErr } = await admin.from("mietvertraege").select("*").eq("id", mietvertragId).maybeSingle();
    if (vErr) throw vErr;
    if (!vertrag) throw new Error("Mietvertrag nicht gefunden.");

    // ---- Fonts + Logo aus branding-assets (Fallback: Helvetica / ohne Logo) ----
    const assets: { fontRegular?: Uint8Array; fontBold?: Uint8Array; logo?: Uint8Array; fontkit?: any } = {};
    try {
      const [rRes, bRes] = await Promise.allSettled([
        admin.storage.from("branding-assets").download(FONT_MONTSERRAT_REGULAR),
        admin.storage.from("branding-assets").download(FONT_MONTSERRAT_BOLD),
      ]);
      if (rRes.status === "fulfilled" && rRes.value.data && bRes.status === "fulfilled" && bRes.value.data) {
        const fontkit = await ladeFontkit();
        if (fontkit) {
          assets.fontkit = fontkit;
          assets.fontRegular = new Uint8Array(await rRes.value.data.arrayBuffer());
          assets.fontBold = new Uint8Array(await bRes.value.data.arrayBuffer());
        }
      }
    } catch (_e) { /* Fallback im Kern */ }
    try {
      const { data: logoBlob } = await admin.storage.from("branding-assets").download(LOGO_PFAD);
      if (logoBlob) assets.logo = new Uint8Array(await logoBlob.arrayBuffer());
    } catch (_e) { /* Logo optional */ }

    const { pdfBytes, dateiname } = await renderMietvertragPdf(
      { PDFDocument, rgb, PageSizes, StandardFonts },
      vertrag,
      assets,
    );

    let bin = "";
    const chunk = 8192;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      bin += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
    }
    const pdfBase64 = btoa(bin);

    return jsonResponse({ ok: true, pdf_base64: pdfBase64, dateiname });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("mietvertrag-pdf:", meldung);
    return jsonResponse({ ok: false, error: meldung });
  }
});
