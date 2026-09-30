// ============================================================================
// reservierung-word-erzeugen
// ============================================================================
// Erzeugt die Reservierungsvereinbarung (Neubau) als bearbeitbares .docx,
// speichert es im Bucket reservierungen-pdf und gibt eine signed URL zurueck.
// Inhaltlich identisch zur PDF-Variante.
//
// Input:  { reservierung_id: uuid }
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
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun,
  BorderStyle, Tab, TabStopType, TabStopPosition,
} from "npm:docx@8.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NAVY = "0A2A4D";
const GOLD = "C7A354";
const SCHWARZ = "0D0D0D";
const GRAU = "999999";
const FONT = "Montserrat";
const FONT_TITEL = "Cormorant Garamond";

function eurOhneSym(n: number): string {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " \u20ac";
}
function datumDe(d: string | null | undefined): string {
  if (!d) return "";
  try { const [y, m, day] = d.split("T")[0].split("-"); return `${day}.${m}.${y}`; } catch { return d as string; }
}

// kurze Helfer fuer Absaetze
function body(text: string, opts: { bold?: boolean; spaceAfter?: number } = {}) {
  return new Paragraph({
    spacing: { after: opts.spaceAfter ?? 120, line: 276 },
    children: [new TextRun({ text, font: FONT, size: 22, bold: !!opts.bold, color: SCHWARZ })],
  });
}
function heading(text: string) {
  return new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: NAVY })],
  });
}
function bullet(text: string) {
  return new Paragraph({
    spacing: { after: 80, line: 276 },
    bullet: { level: 0 },
    children: [new TextRun({ text, font: FONT, size: 22, color: SCHWARZ })],
  });
}
function leer(h = 120) {
  return new Paragraph({ spacing: { after: h }, children: [new TextRun({ text: "", font: FONT, size: 22 })] });
}
function sigLine(name: string) {
  return [
    new Paragraph({
      spacing: { before: 360, after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GRAU, space: 1 } },
      children: [new TextRun({ text: "", font: FONT, size: 22 })],
    }),
    new Paragraph({
      spacing: { before: 40, after: 0 },
      children: [new TextRun({ text: name, font: FONT, size: 20, color: SCHWARZ })],
    }),
  ];
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
    const { reservierung_id } = await req.json();
    await immoMandantSichern(req, [["reservierungen_neubau", String(reservierung_id || "")]]);
    if (!reservierung_id) {
      return new Response(JSON.stringify({ ok: false, error: "reservierung_id fehlt." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: res, error: resErr } = await admin.from("reservierungen_neubau").select("*").eq("id", reservierung_id).maybeSingle();
    if (resErr) throw new Error(`DB-Fehler: ${resErr.message}`);
    if (!res) throw new Error("Reservierung nicht gefunden.");
    immoSetzeMandant(res.mandant_id);

    let firma: any = null;
    if (res.absender_firma_id) {
      const { data } = await admin.from("firma_stammdaten").select("*").eq("id", res.absender_firma_id).maybeSingle();
      firma = data;
    }
    if (!firma) {
      const { data } = await admin.from("firma_stammdaten").select("*")
        .eq("mandant_id", res.mandant_id).order("sortierung").limit(1).maybeSingle();
      firma = data;
    }
    if (!firma) throw new Error("Firma-Stammdaten fehlen.");

    // Logo laden (optional)
    let logoChild: any = null;
    if (firma.logo_pfad) {
      try {
        const { data: logoBlob } = await admin.storage.from("branding-assets").download(firma.logo_pfad);
        if (logoBlob) {
          const bytes = new Uint8Array(await logoBlob.arrayBuffer());
          const pfadLower = firma.logo_pfad.toLowerCase();
          const typ = (pfadLower.endsWith(".jpg") || pfadLower.endsWith(".jpeg")) ? "jpg" : "png";
          logoChild = new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 80 },
            children: [new ImageRun({ data: bytes, transformation: { width: 150, height: 75 }, type: typ })],
          });
        }
      } catch (e) { console.warn("Logo nicht ladbar:", e); }
    }

    // Objekt-Texte
    const objektart = res.objektart === "haus" ? "Haus" :
                      res.objektart === "reihenhaus" ? "Reihenhaus" :
                      res.objektart === "gewerbe" ? "Gewerbeeinheit" : "Eigentumswohnung";
    const projektTeil = res.projektname ? ` des Projektes \u201e${res.projektname}\u201c` : "";
    const wfTxt = res.wohnflaeche_m2 ? ` mit ca. ${Number(res.wohnflaeche_m2).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m\u00b2 Wohnfl\u00e4che` : "";
    const objektZeile1 = `${objektart} ${res.wohneinheit_nr || ""}${res.etage ? ` im ${res.etage}` : ""}${wfTxt}${projektTeil},`;
    const objektZeile2 = `gelegen in ${res.objekt_strasse}, ${res.objekt_plz} ${res.objekt_ort},`;
    const objektZeile3 = `Kaufpreis: ${eurOhneSym(Number(res.kaufpreis))}`;

    const kaeuferLabel = res.kaeufer_typ === "eheleute" ? "Eheleute" : res.kaeufer_typ === "gbr" ? "GbR" : "";
    const zfrist = res.zahlungsfrist_werktage || 5;

    const children: any[] = [];
    if (logoChild) children.push(logoChild);

    // Titel
    children.push(new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: "Reservierungsvereinbarung", font: FONT_TITEL, size: 56, bold: true, color: NAVY })],
    }));

    // Parteien
    children.push(body("zwischen"));
    children.push(body("Makler:", { spaceAfter: 40 }));
    for (const z of [firma.firma_name, firma.strasse, `${firma.plz} ${firma.ort}`,
        firma.geschaeftsfuehrer ? `vertreten durch Gesch\u00e4ftsf\u00fchrer ${firma.geschaeftsfuehrer}` : null,
        "(im Folgenden \u201eMakler\u201c genannt)"].filter(Boolean)) {
      children.push(body(z as string, { spaceAfter: 20 }));
    }
    children.push(leer(60));
    children.push(body("und"));
    children.push(body("K\u00e4ufer:", { spaceAfter: 40 }));
    for (const z of [kaeuferLabel || null, res.kaeufer_name, res.kaeufer_strasse,
        `${res.kaeufer_plz || ""} ${res.kaeufer_ort || ""}`.trim()].filter(Boolean)) {
      children.push(body(z as string, { spaceAfter: 20 }));
    }
    children.push(body("(im Folgenden \u201eK\u00e4ufer\u201c genannt)", { spaceAfter: 200 }));

    // §1
    children.push(heading("1. Gegenstand der Reservierung"));
    children.push(body("Der K\u00e4ufer reserviert verbindlich folgende Immobilie:", { spaceAfter: 40 }));
    children.push(body(objektZeile1, { spaceAfter: 20 }));
    children.push(body(objektZeile2, { spaceAfter: 20 }));
    children.push(body(objektZeile3, { bold: true }));

    // §2
    children.push(heading("2. Rechtscharakter"));
    children.push(body("Diese Vereinbarung ist kein Kaufvertrag im Sinne von \u00a7 311b BGB. Sie begr\u00fcndet keinen Rechtsanspruch auf Abschluss eines Kaufvertrages."));

    // §3
    children.push(heading("3. Reservierungsdauer"));
    children.push(body(`Die Reservierung gilt bis zum ${datumDe(res.reservierungsdauer_bis)}. Legt der K\u00e4ufer vor Ablauf dieser Frist einen schriftlichen Finanzierungsnachweis vor, verl\u00e4ngert sich die Reservierungsdauer automatisch bis zum Tag des notariellen Kaufvertragsabschlusses, l\u00e4ngstens jedoch bis zu 8 Wochen nach Vorlage des Finanzierungsnachweises, sofern nicht schriftlich eine andere Frist vereinbart wird.`));

    // §4
    children.push(heading("4. Pflichten des K\u00e4ufers"));
    children.push(body("Der K\u00e4ufer verpflichtet sich, bis zum Ende des Reservierungszeitraumes einen schriftlichen Finanzierungsnachweis (z. B. Finanzierungsbest\u00e4tigung einer Bank) vorzulegen. Der K\u00e4ufer verpflichtet sich zudem, den Makler unverz\u00fcglich schriftlich zu informieren, sobald feststeht, dass er die Immobilie nicht erwerben wird \u2013 auch vor Ablauf der Frist. In diesem Fall endet die Reservierung vorzeitig."));

    // §5
    children.push(heading("5. Pflichten des Maklers und Verk\u00e4ufers"));
    children.push(body("Der Makler und der Eigent\u00fcmer verpflichten sich, w\u00e4hrend der Reservierungsdauer mit keinem anderen Interessenten \u00fcber die genannte Immobilie zu verhandeln oder diese anzubieten."));

    // §6
    children.push(heading("6. Reservierungsgeb\u00fchr"));
    children.push(body(`Zur Best\u00e4tigung des Kaufinteresses zahlt der K\u00e4ufer an den Makler eine Reservierungsgeb\u00fchr in H\u00f6he von ${eurOhneSym(Number(res.reservierungsgebuehr_brutto))} inkl. MwSt.`, { spaceAfter: 40 }));
    children.push(body(`\u2013 Zahlung f\u00e4llig innerhalb von ${zfrist} Werktagen nach Unterzeichnung dieser Vereinbarung`, { spaceAfter: 40 }));
    children.push(body("Der Makler stellt hier\u00fcber eine ordnungsgem\u00e4\u00dfe Rechnung aus."));

    // §7
    children.push(heading("7. R\u00fcckzahlung der Reservierungsgeb\u00fchr"));
    children.push(body(`Sollte der Kaufvertrag nicht zustande kommen, wird die Reservierungsgeb\u00fchr innerhalb von ${zfrist} Werktagen nach schriftlicher Mitteilung des K\u00e4ufers in voller H\u00f6he auf ein vom K\u00e4ufer benanntes Konto zur\u00fcckerstattet. Dies gilt auch, wenn der Kauf aus Gr\u00fcnden des Verk\u00e4ufers oder Maklers nicht zustande kommt.`));

    // §8
    children.push(heading("8. Schlussbestimmungen"));
    children.push(body("\u00c4nderungen und Erg\u00e4nzungen dieser Vereinbarung bed\u00fcrfen der Schriftform. Sollte eine Bestimmung dieser Vereinbarung ganz oder teilweise unwirksam sein oder werden, bleibt die Wirksamkeit der \u00fcbrigen Bestimmungen unber\u00fchrt."));

    // §9
    children.push(heading("9. R\u00fccktrittsrecht des Verk\u00e4ufers/Maklers"));
    children.push(body("Der Verk\u00e4ufer bzw. Makler ist berechtigt, von dieser Reservierungsvereinbarung zur\u00fcckzutreten, wenn", { spaceAfter: 60 }));
    children.push(bullet("der K\u00e4ufer innerhalb der Frist keinen ausreichenden Finanzierungsnachweis erbringt,"));
    children.push(bullet("der K\u00e4ufer seinen vertraglichen Pflichten aus dieser Vereinbarung nicht nachkommt, oder"));
    children.push(bullet("unvorhersehbare Umst\u00e4nde eintreten, die den Verkauf der Immobilie unm\u00f6glich machen (z. B. h\u00f6here Gewalt, beh\u00f6rdliche Untersagung, Rechtsstreitigkeiten bez\u00fcglich der Immobilie)."));
    children.push(body("Im Falle eines R\u00fccktritts durch den Verk\u00e4ufer/Makler wird die geleistete Reservierungsgeb\u00fchr vollst\u00e4ndig zur\u00fcckerstattet. Weitere Anspr\u00fcche des K\u00e4ufers bestehen nicht.", { spaceAfter: 240 }));

    // Ort/Datum + Unterschriften
    children.push(body(`${res.ort_unterzeichnung || ""}, ${datumDe(res.datum_unterzeichnung)}`, { spaceAfter: 200 }));
    children.push(body("Unterschriften:", { bold: true, spaceAfter: 80 }));
    for (const p of sigLine(res.kaeufer_name)) children.push(p);
    children.push(leer(160));
    for (const p of sigLine(`${firma.geschaeftsfuehrer || ""}, ${firma.firma_name}`)) children.push(p);

    const doc = new Document({
      creator: firma.firma_name || "",
      title: "Reservierungsvereinbarung",
      sections: [{
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const dateiName = `Reservierung_${String(res.kaeufer_name).replace(/[^a-zA-Z0-9]/g, "_")}_${res.wohneinheit_nr || "WE"}.docx`;
    const pfad = `${reservierung_id}/${dateiName}`;

    const { error: upErr } = await admin.storage.from("reservierungen-pdf")
      .upload(pfad, buffer, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: true });
    if (upErr) throw new Error(`Word-Upload fehlgeschlagen: ${upErr.message}`);

    const { data: signed, error: signedErr } = await admin.storage.from("reservierungen-pdf").createSignedUrl(pfad, 3600);
    if (signedErr) throw new Error(`Signed URL fehlgeschlagen: ${signedErr.message}`);

    return new Response(JSON.stringify({ ok: true, pfad, signed_url: signed?.signedUrl, dateiname: dateiName }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Fehler:", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});