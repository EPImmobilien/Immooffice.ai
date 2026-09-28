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
    const { data: profil } = await admin.from("profiles").select("*").eq("id", userData.user.id).maybeSingle();
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
