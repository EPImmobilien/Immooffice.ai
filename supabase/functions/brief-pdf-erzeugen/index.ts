// ============================================================================
// brief-pdf-erzeugen (v2)
// ============================================================================
// Erzeugt einen Geschäftsbrief im "Kanzlei"-Briefpapier-Design (zentrierter
// Logo-Kopf, feine Gold-Doppellinie, zentrierter Fuß mit Goldraute).
// Firmen-/Register-/Bankdaten kommen live aus firma_stammdaten, das Logo aus
// dem Storage (firma.logo_pfad, Fallback logo.png).
// v2: Goldraute exakt zentriert (pdf-lib rotiert um die Ecke, nicht ums Zentrum).
// Input:  { brief_id: uuid }
// Output: { ok: true, pfad, signed_url, dateiname }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Mandantengrenze fuer Kennungen aus dem Anfragekoerper -----------------
// Diese Funktion prueft das JWT, arbeitet danach aber mit dem service_role —
// und fuer den gilt RLS nicht. Eine Kennung, die der Aufrufer mitschickt, ist
// damit ungeprueft: sie kann auf einen Satz eines anderen Mandanten zeigen.
//
// public.mandant_sichern() aus fork_14 zieht genau diese Grenze. Sie muss
// aber MIT DEM TOKEN DES AUFRUFERS gerufen werden — unter dem service_role
// laesst sie jeden durch (mandant_grenze_gilt() ist dort false, mit Absicht:
// Cron und Wartung haben keinen Mandanten). Deshalb ein zweiter Client, der
// nur den mitgebrachten Kopf weiterreicht.
//
// Ohne Anmeldekopf oder mit dem Dienstschluessel passiert nichts — das sind
// die internen Wege, und die sind nicht die Grenze, die hier gezogen wird.
async function immoMandantSichern(req: Request, paare: Array<[string, unknown]>): Promise<void> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return;
  const zuPruefen = paare.filter(([, id]) =>
    typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if (!zuPruefen.length) return;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  for (const [tabelle, id] of zuPruefen) {
    const { error } = await nutzer.rpc("mandant_sichern", { p_tabelle: tabelle, p_id: id });
    if (error) throw new Error("Kein Zugriff auf Daten eines anderen Mandanten.");
  }
}

// Wessen Mandant ist der Aufrufer? Fuer die Faelle, in denen nicht eine
// Kennung, sondern ein PFAD aus dem Anfragekoerper kommt — das erste
// Pfadsegment im Dateispeicher ist seit fork_09 die Mandantenkennung.
async function immoMandantDesAufrufers(req: Request): Promise<string | null> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return null;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  const { data: u } = await nutzer.auth.getUser(kopf.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return null;
  const { data: prof } = await nutzer.from("profiles").select("mandant_id").eq("id", u.user.id).maybeSingle();
  return prof?.mandant_id ? String(prof.mandant_id) : null;
}
import { PDFDocument, rgb, degrees, PageSizes, StandardFonts } from "npm:pdf-lib@1.17.1";

let fontkit: any = null;
try {
  const mod = await import("npm:@pdf-lib/fontkit@1.1.1");
  fontkit = mod.default || mod;
} catch (e) { console.warn("fontkit nicht ladbar:", e); }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NAVY = rgb(0.149, 0.192, 0.349);
const GOLD = rgb(0.690, 0.553, 0.243);   // #B08D3E — gedecktes Gold
const GRAU = rgb(0.431, 0.416, 0.369);   // #6E6A5E
const TEXT = rgb(0.149, 0.149, 0.165);
const LINIE_HELL = rgb(0.847, 0.824, 0.769);

function umlautFix(s: string): string {
  return (s || "")
    .replace(/ä/g, "ae").replace(/Ä/g, "Ae").replace(/ö/g, "oe").replace(/Ö/g, "Oe")
    .replace(/ü/g, "ue").replace(/Ü/g, "Ue").replace(/ß/g, "ss").replace(/€/g, "EUR")
    .replace(/[\u201E\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-").replace(/·/g, "-");
}

function datumDe(d: string | null | undefined): string {
  if (!d) return "";
  try { const [y, m, day] = d.split("T")[0].split("-"); return `${day}.${m}.${y}`; } catch { return d; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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

    const { brief_id } = await req.json();
    await immoMandantSichern(req, [["briefe", String(brief_id || "")]]);
    if (!brief_id) throw new Error("brief_id fehlt.");

    const { data: brief, error: bErr } = await admin.from("briefe").select("*").eq("id", brief_id).maybeSingle(); immoSetzeMandant(brief?.mandant_id);
    if (bErr) throw bErr;
    if (!brief) throw new Error("Brief nicht gefunden.");

    let firma: any = null;
    if (brief.absender_firma_id) {
      const { data } = await admin.from("firma_stammdaten").select("*").eq("id", brief.absender_firma_id).maybeSingle();
      firma = data;
    }
    if (!firma) {
      const { data } = await admin.from("firma_stammdaten").select("*")
        .eq("mandant_id", immoMandant).order("sortierung").limit(1).maybeSingle();
      firma = data;
    }
    if (!firma) throw new Error("Firma-Stammdaten fehlen.");

    // ---- Fonts ----
    const pdf = await PDFDocument.create();
    if (fontkit) { try { pdf.registerFontkit(fontkit); } catch {} }
    let fR: any, fB: any, fH: any, custom = false;
    if (fontkit) {
      try {
        const [r, b, m] = await Promise.allSettled([
          admin.storage.from("branding-assets").download("fonts/Montserrat-Regular.ttf"),
          admin.storage.from("branding-assets").download("fonts/Montserrat-Bold.ttf"),
          admin.storage.from("branding-assets").download("fonts/Marcellus-Regular.ttf"),
        ]);
        if (r.status === "fulfilled" && r.value.data && b.status === "fulfilled" && b.value.data) {
          fR = await pdf.embedFont(await r.value.data.arrayBuffer(), { subset: true });
          fB = await pdf.embedFont(await b.value.data.arrayBuffer(), { subset: true });
          fH = (m.status === "fulfilled" && m.value.data) ? await pdf.embedFont(await m.value.data.arrayBuffer(), { subset: true }) : fB;
          custom = true;
        }
      } catch (e) { console.warn("Custom-Fonts fehlgeschlagen:", e); }
    }
    if (!fR) {
      fR = await pdf.embedFont(StandardFonts.Helvetica);
      fB = await pdf.embedFont(StandardFonts.HelveticaBold);
      fH = await pdf.embedFont(StandardFonts.TimesRoman);
    }
    const fix = custom ? (s: string) => (s || "") : umlautFix;

    // ---- Logo ----
    let logo: any = null;
    for (const pfad of ["briefpapier-logo.png", firma.logo_pfad, "logo.png"].filter(Boolean)) {
      try {
        const { data } = await admin.storage.from("branding-assets").download(pfad);
        if (data) {
          const bytes = await data.arrayBuffer();
          logo = pfad.toLowerCase().endsWith(".jpg") || pfad.toLowerCase().endsWith(".jpeg")
            ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
          break;
        }
      } catch (_e) { /* nächsten Pfad versuchen */ }
    }

    // ---- Layout-Konstanten ----
    const [W, H] = PageSizes.A4;
    const ML = 70, MR = 70;
    const MITTE = W / 2;
    const NUTZ = W - ML - MR;

    let page = pdf.addPage(PageSizes.A4);
    let y = 0;

    const breite = (s: string, font: any, size: number, cs = 0) =>
      font.widthOfTextAtSize(s, size) + cs * Math.max(0, s.length - 1);

    // Sperrsatz: Zeichen für Zeichen mit Tracking
    const gesperrt = (s: string, x: number, yy: number, font: any, size: number, farbe: any, cs: number, zentriert = false) => {
      const text = fix(s);
      const gesamt = breite(text, font, size, cs);
      let cx = zentriert ? x - gesamt / 2 : x;
      for (const ch of text) {
        page.drawText(ch, { x: cx, y: yy, size, font, color: farbe });
        cx += font.widthOfTextAtSize(ch, size) + cs;
      }
      return gesamt;
    };

    const doppelLinie = (yy: number) => {
      page.drawLine({ start: { x: ML, y: yy }, end: { x: W - MR, y: yy }, thickness: 0.8, color: GOLD });
      page.drawLine({ start: { x: ML, y: yy - 2.4 }, end: { x: W - MR, y: yy - 2.4 }, thickness: 0.3, color: GOLD });
    };

    const fuss = () => {
      const fy = 100;
      page.drawLine({ start: { x: ML, y: fy }, end: { x: MITTE - 12, y: fy }, thickness: 0.6, color: GOLD });
      page.drawLine({ start: { x: MITTE + 12, y: fy }, end: { x: W - MR, y: fy }, thickness: 0.6, color: GOLD });
      // Goldraute — pdf-lib rotiert um die linke untere Ecke: Ecke so setzen,
      // dass das Zentrum der gedrehten Fläche exakt auf (MITTE, fy) liegt.
      const s = 6.2;
      page.drawRectangle({ x: MITTE, y: fy - s * 0.7071, width: s, height: s, color: GOLD, rotate: degrees(45) });
      const kontakt = [firma.telefon ? `Telefon ${firma.telefon}` : "", firma.email || "", (firma.web || "").replace(/^https?:\/\//, "")].filter(Boolean).join("  -  ");
      const register = [firma.registergericht && firma.hrb ? `${firma.registergericht} - ${firma.hrb}` : (firma.hrb || ""), firma.ust_id ? `USt-IdNr. ${firma.ust_id}` : ""].filter(Boolean).join("  -  ");
      const bank = [firma.bank_iban ? `IBAN ${firma.bank_iban}` : "", firma.bank_bic ? `BIC ${firma.bank_bic}` : "", firma.bank_name || ""].filter(Boolean).join("  -  ");
      const zeilen: Array<[any, number, any, number, string]> = [
        [fB, 6.8, NAVY, 0.9, `${firma.firma_name}  -  ${firma.strasse}  -  ${firma.plz} ${firma.ort}`.toUpperCase()],
        [fR, 6.6, GRAU, 0.5, [firma.geschaeftsfuehrer ? `Geschaeftsfuehrer ${firma.geschaeftsfuehrer}` : "", kontakt].filter(Boolean).join("  -  ")],
      ];
      if (register) zeilen.push([fR, 6.6, GRAU, 0.5, register]);
      if (bank) zeilen.push([fR, 6.6, GRAU, 0.5, bank]);
      let yy = fy - 16;
      for (const [font, size, farbe, cs, s2] of zeilen) {
        let csFit = cs;
        while (csFit > 0 && breite(fix(s2), font, size, csFit) > NUTZ) csFit -= 0.1;
        gesperrt(s2, MITTE, yy, font, size, farbe, Math.max(0, csFit), true);
        yy -= 11.5;
      }
    };

    const neueSeite = () => {
      fuss();
      page = pdf.addPage(PageSizes.A4);
      doppelLinie(H - 52);
      y = H - 92;
    };

    // ---- Seite 1: Kopf ----
    let kopfEnde = H - 60;
    if (logo) {
      const lw = 150;
      const lh = lw * (logo.height / logo.width);
      page.drawImage(logo, { x: MITTE - lw / 2, y: H - 46 - lh, width: lw, height: lh });
      kopfEnde = H - 46 - lh;
    } else {
      gesperrt("MUSTERHAUS & PARTNER", MITTE, H - 90, fH, 27, NAVY, 3.2, true);
      gesperrt("I M M O B I L I E N", MITTE, H - 110, fB, 8, GOLD, 3.4, true);
      kopfEnde = H - 118;
    }
    gesperrt("", MITTE, kopfEnde - 16, fR, 6.5, GRAU, 1.6, true);
    doppelLinie(kopfEnde - 32);

    // ---- Absenderzeile + Anschrift ----
    const ay = Math.min(kopfEnde - 74, H - 200);
    page.drawText(fix(`${firma.firma_name} - ${firma.strasse} - ${firma.plz} ${firma.ort}`), { x: ML, y: ay, size: 6.3, font: fR, color: GRAU });
    page.drawLine({ start: { x: ML, y: ay - 3.5 }, end: { x: ML + 218, y: ay - 3.5 }, thickness: 0.4, color: LINIE_HELL });

    const anschrift = [brief.empfaenger_name, brief.empfaenger_zusatz, brief.empfaenger_strasse, brief.empfaenger_plz_ort].filter((z: string) => z && z.trim());
    anschrift.forEach((z: string, i: number) => {
      page.drawText(fix(z), { x: ML, y: ay - 22 - i * 15, size: 10, font: fR, color: TEXT });
    });

    const datumZeile = `${firma.ort}, den ${datumDe(brief.datum)}`;
    page.drawText(fix(datumZeile), { x: W - MR - breite(fix(datumZeile), fR, 8.5), y: ay - 22, size: 8.5, font: fR, color: GRAU });
    if (brief.ansprechpartner) {
      const az = `Ihr Ansprechpartner: ${brief.ansprechpartner}`;
      page.drawText(fix(az), { x: W - MR - breite(fix(az), fR, 8.5), y: ay - 36, size: 8.5, font: fR, color: GRAU });
    }

    // ---- Betreff ----
    const by = ay - 120;
    let betreffCs = 1.8;
    const betreffGross = (brief.betreff || "").toUpperCase();
    while (betreffCs > 0 && breite(fix(betreffGross), fH, 12.5, betreffCs) > NUTZ) betreffCs -= 0.1;
    gesperrt(betreffGross, ML, by, fH, 12.5, NAVY, Math.max(0, betreffCs));
    page.drawLine({ start: { x: ML, y: by - 7 }, end: { x: ML + 46, y: by - 7 }, thickness: 0.7, color: GOLD });

    // ---- Fließtext mit Umbruch + Seitenumbruch ----
    y = by - 34;
    const size = 9.3, lh = 15.5;
    const wrap = (text: string): string[] => {
      const out: string[] = [];
      for (const absatz of (text || "").split(/\r?\n/)) {
        if (!absatz.trim()) { out.push(""); continue; }
        const woerter = absatz.split(/\s+/).filter(Boolean);
        let zeile = "";
        for (const w of woerter) {
          const versuch = zeile ? zeile + " " + w : w;
          if (breite(fix(versuch), fR, size) > NUTZ && zeile) { out.push(zeile); zeile = w; }
          else zeile = versuch;
        }
        if (zeile) out.push(zeile);
      }
      return out;
    };

    for (const zeile of wrap(brief.brieftext)) {
      if (y < 150) neueSeite();
      if (zeile) page.drawText(fix(zeile), { x: ML, y, size, font: fR, color: TEXT });
      y -= lh;
    }

    // ---- Gruß + Unterzeichner ----
    if (y < 220) neueSeite();
    y -= 8;
    page.drawText(fix(brief.grussformel || "Mit freundlichen Gruessen"), { x: ML, y, size, font: fR, color: TEXT });
    y -= 62;
    page.drawText(fix(brief.unterzeichner || brief.created_by_name || ""), { x: ML, y, size: 9.5, font: fB, color: NAVY });
    if (brief.unterzeichner_funktion) {
      y -= 13;
      page.drawText(fix(brief.unterzeichner_funktion), { x: ML, y, size: 7.5, font: fR, color: GRAU });
    }

    fuss();

    // ---- Speichern + Signed URL ----
    const pdfBytes = await pdf.save();
    const empfSlug = (brief.empfaenger_name || "Brief").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
    const dateiname = `Brief_${empfSlug}_${(brief.datum || "").toString().slice(0, 10)}.pdf`;
    const pfad = `${brief_id}/${dateiname}`;
    const { error: upErr } = await admin.storage.from("briefe-pdf").upload(pfad, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(`PDF-Upload fehlgeschlagen: ${upErr.message}`);
    const { data: signed, error: sErr } = await admin.storage.from("briefe-pdf").createSignedUrl(pfad, 3600);
    if (sErr) throw new Error(`Signed URL fehlgeschlagen: ${sErr.message}`);

    return new Response(JSON.stringify({ ok: true, pfad, signed_url: signed?.signedUrl, dateiname }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brief-pdf-erzeugen:", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
