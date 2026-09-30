// ============================================================================
// akq-wertindikation-pdf v1 — Wertindikation eines Akquise-Leads als PDF
// ----------------------------------------------------------------------------
// pdf-lib + Montserrat + Logo aus dem Bucket branding-assets, Layout im Stil
// der neuen MPE. Body: { lead_id }  ->  { ok, pdf_base64, dateiname }
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
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BLAU = rgb(38 / 255, 49 / 255, 89 / 255);
const GOLD = rgb(212 / 255, 165 / 255, 103 / 255);
const GRAU = rgb(139 / 255, 131 / 255, 119 / 255);
const LINIE = rgb(232 / 255, 228 / 255, 218 / 255);

const eur = (n: unknown) =>
  n === null || n === undefined || n === "" || isNaN(Number(n))
    ? "—"
    : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));
const num = (n: unknown, einheit = "") =>
  n === null || n === undefined || n === "" || isNaN(Number(n))
    ? "—"
    : new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(Number(n)) + einheit;

// pdf-lib bricht bei Steuerzeichen — defensiv saeubern (Umlaute bleiben).
const sauber = (s: unknown) =>
  Array.from(String(s ?? ""))
    .map((c) => { const n = c.codePointAt(0) || 0; return n < 32 || n === 127 ? " " : c; })
    .join("").replace(/ {2,}/g, " ").trim();

async function bucketDatei(db: any, bucket: string, pfad: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await db.storage.from(bucket).download(pfad);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch (_) { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
      }
    }

    const body = await req.json().catch(() => ({}));
    if (!body.lead_id) return antwort({ ok: false, fehler: "lead_id fehlt." }, 400);
    await immoMandantSichern(req, [["akq_leads", String(body.lead_id)]]);

    const { data: lead } = await db.from("akq_leads").select("*").eq("id", body.lead_id).maybeSingle();
    if (!lead) return antwort({ ok: false, fehler: "Lead nicht gefunden." }, 404);

    const kontakt = lead.kontakt_id ? (await db.from("kontakte").select("*").eq("id", lead.kontakt_id).maybeSingle()).data : null;
    const immo = lead.immobilie_id ? (await db.from("immobilien").select("*").eq("id", lead.immobilie_id).maybeSingle()).data : null;
    const makler = lead.zustaendig_id ? (await db.from("profiles").select("name, email, telefon, funktion").eq("id", lead.zustaendig_id).maybeSingle()).data : null;
    // Briefkopf der Wertindikation. Der zweite Griff war ein Rueckfall ohne
    // jede Bedingung — der erste Satz der ganzen Tabelle, also unter mehreren
    // Mandanten der Briefkopf eines fremden Maklers auf dem eigenen
    // Dokument. Er entfaellt: ohne Stammdaten kein Dokument.
    const { data: firmen } = await db.from("firma_stammdaten").select("*")
      .eq("mandant_id", lead.mandant_id).eq("typ", "standort").eq("aktiv", true)
      .order("sortierung").limit(1);
    const stamm = (firmen && firmen[0]) || null;
    if (!stamm) return antwort({ ok: false, fehler: "Fuer diesen Mandanten sind keine Firmenstammdaten hinterlegt — ohne Briefkopf wird kein Dokument erzeugt." }, 400);

    // ---- Dokument ----
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const [regBytes, boldBytes] = await Promise.all([
      bucketDatei(db, "branding-assets", "fonts/Montserrat-Regular.ttf"),
      bucketDatei(db, "branding-assets", "fonts/Montserrat-SemiBold.ttf"),
    ]);
    const reg = regBytes ? await pdf.embedFont(regBytes, { subset: true }) : await pdf.embedFont(StandardFonts.Helvetica);
    const bold = boldBytes ? await pdf.embedFont(boldBytes, { subset: true }) : await pdf.embedFont(StandardFonts.HelveticaBold);

    const seite = pdf.addPage([595.28, 841.89]); // A4
    const B = 595.28, H = 841.89, M = 56;
    let y = H - M;

    const schreib = (t: string, x: number, yy: number, size = 10, font = reg, farbe = BLAU) =>
      seite.drawText(sauber(t) || "—", { x, y: yy, size, font, color: farbe });

    // Kopf: Logo + Goldlinie
    const logo = await bucketDatei(db, "branding-assets", "logo.png");
    if (logo) {
      try {
        const bild = await pdf.embedPng(logo);
        const h = 34, w = (bild.width / bild.height) * h;
        seite.drawImage(bild, { x: M, y: y - h + 8, width: w, height: h });
      } catch (_) { schreib("MUSTERHAUS & PARTNER", M, y - 12, 14, bold); }
    } else {
      schreib("MUSTERHAUS IMMOBILIEN", M, y - 12, 13, bold);
    }
    schreib(new Date().toLocaleDateString("de-DE"), B - M - 60, y - 8, 9, reg, GRAU);
    y -= 52;
    seite.drawRectangle({ x: M, y, width: B - 2 * M, height: 2, color: GOLD });
    y -= 46;

    // Titel
    schreib("WERTINDIKATION", M, y, 9, bold, GOLD);
    y -= 26;
    const adresse = immo
      ? [[immo.strasse, immo.hausnummer].filter(Boolean).join(" "), [immo.plz, immo.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")
      : [[lead.strasse, lead.hausnummer].filter(Boolean).join(" "), [lead.plz, lead.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    schreib(adresse || lead.titel || "Ihre Immobilie", M, y, 19, bold);
    y -= 18;
    const objektart = immo?.objektart || lead.objektart || "";
    schreib([objektart, kontakt ? `Eigentümer: ${[kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ") || kontakt.firma || ""}` : ""].filter(Boolean).join("   ·   "), M, y, 9.5, reg, GRAU);
    y -= 40;

    // Wertkasten
    const kastenH = 128;
    seite.drawRectangle({ x: M, y: y - kastenH, width: B - 2 * M, height: kastenH, color: rgb(0.976, 0.976, 0.969) });
    seite.drawRectangle({ x: M, y: y - kastenH, width: 3, height: kastenH, color: GOLD });
    schreib("GESCHÄTZTER MARKTWERT", M + 22, y - 26, 8, bold, GRAU);
    schreib(eur(lead.wert_schaetzung), M + 22, y - 58, 27, bold);
    schreib(`Spanne  ${eur(lead.wert_min)}  –  ${eur(lead.wert_max)}`, M + 22, y - 80, 10, reg, GRAU);

    schreib("EMPFOHLENER STARTPREIS", M + 300, y - 26, 8, bold, GRAU);
    schreib(eur(lead.startpreis), M + 300, y - 50, 16, bold);
    schreib("ERWARTETE PROVISION", M + 300, y - 76, 8, bold, GRAU);
    const provNetto = lead.provision_erwartet ? Number(lead.provision_erwartet) / 1.19 : null;
    schreib(`${eur(lead.provision_erwartet)}  (${num(lead.provision_satz, " %")} inkl. USt.)`, M + 300, y - 94, 10, reg);
    schreib(`netto ${eur(provNetto)}`, M + 300, y - 110, 9, reg, GRAU);
    y -= kastenH + 40;

    // Objektdaten
    schreib("OBJEKTDATEN", M, y, 8.5, bold, GOLD);
    y -= 8;
    seite.drawRectangle({ x: M, y: y - 4, width: B - 2 * M, height: 1, color: LINIE });
    y -= 26;

    const zeilen: [string, string][] = [
      ["Objektart", objektart || "—"],
      ["Wohnfläche", num(immo?.wohnflaeche ?? lead.wohnflaeche, " m²")],
      ["Grundstück", num(immo?.grundstueck ?? lead.grundstueck, " m²")],
      ["Zimmer", num(immo?.zimmer ?? lead.zimmer)],
      ["Baujahr", String(immo?.baujahr || lead.baujahr || "—")],
      ["Zustand", immo?.zustand || lead.zustand || "—"],
      ["Verkaufszeitraum", lead.verkaufszeitraum || "—"],
    ];
    const flaeche = Number(immo?.wohnflaeche ?? lead.wohnflaeche ?? 0);
    if (flaeche > 0 && lead.wert_schaetzung) {
      zeilen.push(["Preis je m²", eur(Number(lead.wert_schaetzung) / flaeche)]);
    }
    for (const [k, v] of zeilen) {
      schreib(k, M, y, 9.5, reg, GRAU);
      schreib(String(v), M + 190, y, 9.5, bold);
      y -= 19;
    }
    y -= 22;

    // Hinweis
    schreib("SO KOMMT DIESER WERT ZUSTANDE", M, y, 8.5, bold, GOLD);
    y -= 8;
    seite.drawRectangle({ x: M, y: y - 4, width: B - 2 * M, height: 1, color: LINIE });
    y -= 24;
    const hinweis = [
      "Grundlage dieser Indikation sind Vergleichswerte aus dem eigenen Objektbestand von Musterhaus &",
      "Partner in vergleichbarer Lage sowie die von Ihnen gemachten Angaben zu Fläche, Baujahr und",
      "Zustand. Es handelt sich um eine erste Einschätzung, nicht um ein Wertgutachten nach ImmoWertV.",
      "Eine belastbare Marktpreiseinschätzung erstellen wir nach einem Vor-Ort-Termin — kostenfrei und",
      "unverbindlich.",
    ];
    for (const z of hinweis) { schreib(z, M, y, 9, reg, GRAU); y -= 14; }
    y -= 24;

    // Ansprechpartner
    if (makler) {
      schreib("IHR ANSPRECHPARTNER", M, y, 8.5, bold, GOLD);
      y -= 22;
      schreib(makler.name || "", M, y, 11, bold); y -= 15;
      if (makler.funktion) { schreib(makler.funktion, M, y, 9, reg, GRAU); y -= 14; }
      const kontaktZeile = [makler.telefon, makler.email].filter(Boolean).join("   ·   ");
      if (kontaktZeile) { schreib(kontaktZeile, M, y, 9, reg, GRAU); y -= 14; }
    }

    // Fuss
    const fussY = 52;
    seite.drawRectangle({ x: M, y: fussY + 22, width: B - 2 * M, height: 1, color: LINIE });
    const fuss = [
      stamm?.firma_name || "Musterhaus Immobilien GmbH",
      [stamm?.strasse, [stamm?.plz, stamm?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      [stamm?.telefon, stamm?.email].filter(Boolean).join(" · "),
    ].filter(Boolean).join("  |  ");
    schreib(fuss, M, fussY + 8, 7.5, reg, GRAU);

    const bytes = await pdf.save();
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const b64 = btoa(bin);

    const dateiname = `Wertindikation_${sauber(adresse || lead.ort || "Objekt").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60)}.pdf`;
    return antwort({ ok: true, pdf_base64: b64, dateiname });
  } catch (e) {
    console.error("akq-wertindikation-pdf:", e);
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
