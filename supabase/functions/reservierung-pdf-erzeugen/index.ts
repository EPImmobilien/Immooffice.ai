// ============================================================================
// reservierung-pdf-erzeugen
// ============================================================================
// Erzeugt das PDF fuer eine Reservierungsvereinbarung (Neubau), speichert es
// im Storage-Bucket reservierungen-pdf und gibt eine signed URL zurueck.
//
// Input: { reservierung_id: uuid }
// Output: { ok: true, pfad, signed_url }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, rgb, PageSizes, StandardFonts } from "npm:pdf-lib@1.17.1";

// fontkit defensiv importieren
let fontkit: any = null;
try {
  const mod = await import("npm:@pdf-lib/fontkit@1.1.1");
  fontkit = mod.default || mod;
} catch (e) {
  console.warn("fontkit nicht ladbar:", e);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Font-Pfade im Storage-Bucket branding-assets
const FONT_MONTSERRAT_REGULAR = "fonts/Montserrat-Regular.ttf";
const FONT_MONTSERRAT_BOLD    = "fonts/Montserrat-Bold.ttf";
const FONT_MARCELLUS          = "fonts/Marcellus-Regular.ttf";

// In-Memory-Cache
let cachedFonts: {
  montserratRegular?: ArrayBuffer;
  montserratBold?: ArrayBuffer;
  marcellus?: ArrayBuffer;
} = {};

const CI = {
  blau: rgb(0.039, 0.165, 0.30),
  gold: rgb(0.78, 0.64, 0.33),
  text: rgb(0.05, 0.05, 0.05),
  hellGrau: rgb(0.95, 0.95, 0.95),
  mittelGrau: rgb(0.6, 0.6, 0.6),
};

function eur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function eurOhneSym(n: number): string {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " €";
}

function datumDe(d: string | null | undefined): string {
  if (!d) return "";
  try {
    const [y, m, day] = d.split("T")[0].split("-");
    return `${day}.${m}.${y}`;
  } catch {
    return d;
  }
}

function umlautFix(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/ä/g, "ae").replace(/Ä/g, "Ae")
    .replace(/ö/g, "oe").replace(/Ö/g, "Oe")
    .replace(/ü/g, "ue").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/€/g, "EUR")
    .replace(/„/g, '"').replace(/"/g, '"')
    .replace(/·/g, "-");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json();
    const { reservierung_id } = body;
    if (!reservierung_id) {
      return new Response(JSON.stringify({ ok: false, error: "reservierung_id fehlt." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reservierung + Firma laden
    const { data: res, error: resErr } = await admin
      .from("reservierungen_neubau").select("*").eq("id", reservierung_id).maybeSingle();
    if (resErr) throw new Error(`DB-Fehler: ${resErr.message}`);
    if (!res) throw new Error("Reservierung nicht gefunden.");

    // Firma laden (entweder per id oder Default = ep-immobilien)
    let firma: any = null;
    if (res.absender_firma_id) {
      const { data } = await admin.from("firma_stammdaten").select("*").eq("id", res.absender_firma_id).maybeSingle();
      firma = data;
    }
    if (!firma) {
      const { data } = await admin.from("firma_stammdaten").select("*").eq("slug", "standard").maybeSingle();
      firma = data;
    }
    if (!firma) throw new Error("Firma-Stammdaten fehlen.");

    // Fonts aus Storage laden
    if (fontkit && !cachedFonts.montserratRegular) {
      try {
        const results = await Promise.allSettled([
          admin.storage.from("branding-assets").download(FONT_MONTSERRAT_REGULAR),
          admin.storage.from("branding-assets").download(FONT_MONTSERRAT_BOLD),
          admin.storage.from("branding-assets").download(FONT_MARCELLUS),
        ]);
        if (results[0].status === "fulfilled" && results[0].value.data) {
          cachedFonts.montserratRegular = await results[0].value.data.arrayBuffer();
        }
        if (results[1].status === "fulfilled" && results[1].value.data) {
          cachedFonts.montserratBold = await results[1].value.data.arrayBuffer();
        }
        if (results[2].status === "fulfilled" && results[2].value.data) {
          cachedFonts.marcellus = await results[2].value.data.arrayBuffer();
        }
        console.log("Fonts geladen.");
      } catch (e) {
        console.warn("Font-Download fehlgeschlagen:", e);
      }
    }

    const pdf = await PDFDocument.create();
    if (fontkit) {
      try { pdf.registerFontkit(fontkit); } catch {}
    }

    let fontRegular: any, fontBold: any, fontHeadline: any;
    let customFonts = false;
    if (fontkit && cachedFonts.montserratRegular && cachedFonts.montserratBold) {
      try {
        fontRegular = await pdf.embedFont(cachedFonts.montserratRegular, { subset: true });
        fontBold = await pdf.embedFont(cachedFonts.montserratBold, { subset: true });
        fontHeadline = cachedFonts.marcellus
          ? await pdf.embedFont(cachedFonts.marcellus, { subset: true })
          : fontBold;
        customFonts = true;
      } catch (e) {
        console.warn("Custom-Fonts fehlgeschlagen:", e);
      }
    }
    if (!fontRegular) {
      fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
      fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      fontHeadline = fontBold;
    }
    const fix = customFonts ? (s: string) => s : umlautFix;

    // Logo
    let embeddedLogo: any = null;
    if (firma.logo_pfad) {
      try {
        const { data: logoBlob } = await admin.storage
          .from("branding-assets").download(firma.logo_pfad);
        if (logoBlob) {
          const logoBytes = await logoBlob.arrayBuffer();
          const pfadLower = firma.logo_pfad.toLowerCase();
          if (pfadLower.endsWith(".jpg") || pfadLower.endsWith(".jpeg")) {
            embeddedLogo = await pdf.embedJpg(logoBytes);
          } else {
            embeddedLogo = await pdf.embedPng(logoBytes);
          }
        }
      } catch (e) {
        console.warn("Logo-Einbettung fehlgeschlagen:", e);
      }
    }

    // ----------------------------------------------------------------------
    // Helper: zeichnet Text mit automatischem Wortumbruch in maxWidth
    // Gibt die Anzahl der gezeichneten Zeilen zurueck.
    // ----------------------------------------------------------------------
    function drawWrappedText(page: any, text: string, x: number, y: number, maxWidth: number, opts: any) {
      const { size, font, color, lineHeight } = opts;
      const fixedText = fix(text || "");
      const woerter = fixedText.split(/\s+/).filter(Boolean);
      const zeilen: string[] = [];
      let aktuelle = "";
      for (const wort of woerter) {
        const versuch = aktuelle ? aktuelle + " " + wort : wort;
        if (font.widthOfTextAtSize(versuch, size) > maxWidth && aktuelle) {
          zeilen.push(aktuelle);
          aktuelle = wort;
        } else {
          aktuelle = versuch;
        }
      }
      if (aktuelle) zeilen.push(aktuelle);
      const lh = lineHeight || size + 4;
      let yPos = y;
      for (const z of zeilen) {
        page.drawText(z, { x, y: yPos, size, font, color });
        yPos -= lh;
      }
      return zeilen.length;
    }

    // ----------------------------------------------------------------------
    // Seite 1
    // ----------------------------------------------------------------------
    let page = pdf.addPage(PageSizes.A4);
    const { width, height } = page.getSize();
    const margin = 50;
    const contentBreite = width - 2 * margin;
    let y = height - margin;

    // Logo rechts oben
    if (embeddedLogo) {
      const logoMaxHeight = 70;
      const ratio = embeddedLogo.width / embeddedLogo.height;
      const logoH = logoMaxHeight;
      const logoW = logoH * ratio;
      page.drawImage(embeddedLogo, {
        x: width - margin - logoW,
        y: y - logoH + 5,
        width: logoW,
        height: logoH,
      });
    }

    // Titel
    page.drawText(fix("Reservierungsvereinbarung"), {
      x: margin, y: y - 30, size: 28, font: fontHeadline, color: CI.blau,
    });
    y -= 70;

    // "zwischen"
    page.drawText(fix("zwischen"), {
      x: margin, y, size: 11, font: fontRegular, color: CI.text,
    });
    y -= 22;

    // Makler-Block
    page.drawText(fix("Makler:"), {
      x: margin, y, size: 11, font: fontRegular, color: CI.text,
    });
    y -= 18;
    const maklerZeilen = [
      firma.firma_name,
      firma.strasse,
      `${firma.plz} ${firma.ort}`,
      firma.geschaeftsfuehrer ? `vertreten durch Geschäftsführer ${firma.geschaeftsfuehrer}` : null,
      `(im Folgenden „Makler" genannt)`,
    ].filter(Boolean);
    for (const z of maklerZeilen) {
      page.drawText(fix(z), { x: margin, y, size: 11, font: fontRegular, color: CI.text });
      y -= 15;
    }
    y -= 12;

    page.drawText(fix("und"), {
      x: margin, y, size: 11, font: fontRegular, color: CI.text,
    });
    y -= 22;

    // Kaeufer-Block
    page.drawText(fix("Käufer:"), {
      x: margin, y, size: 11, font: fontRegular, color: CI.text,
    });
    y -= 18;
    const kaeuferLabel = res.kaeufer_typ === "eheleute" ? "Eheleute" :
                        res.kaeufer_typ === "gbr" ? "GbR" :
                        res.kaeufer_typ === "sonstige" ? "" : "";
    const kaeuferZeilen = [
      kaeuferLabel || null,
      res.kaeufer_name,
      res.kaeufer_strasse,
      `${res.kaeufer_plz || ""} ${res.kaeufer_ort || ""}`.trim(),
    ].filter(Boolean);
    for (const z of kaeuferZeilen) {
      page.drawText(fix(z), { x: margin, y, size: 11, font: fontRegular, color: CI.text });
      y -= 15;
    }
    y -= 10;
    page.drawText(fix(`(im Folgenden „Käufer" genannt)`), {
      x: margin, y, size: 11, font: fontRegular, color: CI.text,
    });
    y -= 30;

    // ----------------------------------------------------------------------
    // §1 Gegenstand der Reservierung
    // ----------------------------------------------------------------------
    function paragraph(titel: string, text: string, startY: number): number {
      let yp = startY;
      page.drawText(fix(titel), { x: margin, y: yp, size: 13, font: fontBold, color: CI.blau });
      yp -= 18;
      const lines = drawWrappedText(page, text, margin, yp, contentBreite, {
        size: 11, font: fontRegular, color: CI.text, lineHeight: 15,
      });
      return yp - lines * 15 - 14;
    }

    // §1 — speziell aufgebaut
    page.drawText(fix("1. Gegenstand der Reservierung"), {
      x: margin, y, size: 13, font: fontBold, color: CI.blau,
    });
    y -= 18;
    page.drawText(fix("Der Käufer reserviert verbindlich folgende Immobilie:"), {
      x: margin, y, size: 11, font: fontRegular, color: CI.text,
    });
    y -= 18;
    // Objekt-Beschreibung
    const objektart = res.objektart === "haus" ? "Haus" :
                      res.objektart === "reihenhaus" ? "Reihenhaus" :
                      res.objektart === "gewerbe" ? "Gewerbeeinheit" :
                      "Eigentumswohnung";
    const projektTeil = res.projektname ? ` des Projektes „${res.projektname}"` : "";
    const objektZeile1 = `${objektart} ${res.wohneinheit_nr || ""}${res.etage ? ` im ${res.etage}` : ""}${res.wohnflaeche_m2 ? ` mit ca. ${Number(res.wohnflaeche_m2).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m² Wohnfläche` : ""}${projektTeil},`;
    const objektZeile2 = `gelegen in ${res.objekt_strasse}, ${res.objekt_plz} ${res.objekt_ort},`;
    const objektZeile3 = `Kaufpreis: ${eurOhneSym(Number(res.kaufpreis))}`;

    const linesO1 = drawWrappedText(page, objektZeile1, margin, y, contentBreite, {
      size: 11, font: fontRegular, color: CI.text, lineHeight: 15,
    });
    y -= linesO1 * 15;
    page.drawText(fix(objektZeile2), { x: margin, y, size: 11, font: fontRegular, color: CI.text });
    y -= 15;
    page.drawText(fix(objektZeile3), { x: margin, y, size: 11, font: fontBold, color: CI.text });
    y -= 26;

    // §2 Rechtscharakter
    y = paragraph("2. Rechtscharakter",
      "Diese Vereinbarung ist kein Kaufvertrag im Sinne von § 311b BGB. " +
      "Sie begründet keinen Rechtsanspruch auf Abschluss eines Kaufvertrages.",
      y);

    // §3 Reservierungsdauer
    const resDauerText =
      `Die Reservierung gilt bis zum ${datumDe(res.reservierungsdauer_bis)}. ` +
      "Legt der Käufer vor Ablauf dieser Frist einen schriftlichen Finanzierungsnachweis vor, " +
      "verlängert sich die Reservierungsdauer automatisch bis zum Tag des notariellen " +
      "Kaufvertragsabschlusses, längstens jedoch bis zu 8 Wochen nach Vorlage des " +
      "Finanzierungsnachweises, sofern nicht schriftlich eine andere Frist vereinbart wird.";
    y = paragraph("3. Reservierungsdauer", resDauerText, y);

    // Seitenumbruch wenn unten zu wenig Platz
    if (y < 200) {
      page = pdf.addPage(PageSizes.A4);
      y = height - margin;
    }

    // §4 Pflichten des Kaeufers
    y = paragraph("4. Pflichten des Käufers",
      "Der Käufer verpflichtet sich, bis zum Ende des Reservierungszeitraumes einen " +
      "schriftlichen Finanzierungsnachweis (z. B. Finanzierungsbestätigung einer Bank) " +
      "vorzulegen. Der Käufer verpflichtet sich zudem, den Makler unverzüglich " +
      "schriftlich zu informieren, sobald feststeht, dass er die Immobilie nicht erwerben " +
      "wird – auch vor Ablauf der Frist. In diesem Fall endet die Reservierung vorzeitig.",
      y);

    // §5 Pflichten des Maklers und Verkaeufers
    y = paragraph("5. Pflichten des Maklers und Verkäufers",
      "Der Makler und der Eigentümer verpflichten sich, während der Reservierungsdauer " +
      "mit keinem anderen Interessenten über die genannte Immobilie zu verhandeln oder " +
      "diese anzubieten.",
      y);

    // Seitenumbruch wenn nötig
    if (y < 200) {
      page = pdf.addPage(PageSizes.A4);
      y = height - margin;
    }

    // §6 Reservierungsgebuehr
    page.drawText(fix("6. Reservierungsgebühr"), {
      x: margin, y, size: 13, font: fontBold, color: CI.blau,
    });
    y -= 18;
    const gebuehrText1 =
      `Zur Bestätigung des Kaufinteresses zahlt der Käufer an den Makler eine ` +
      `Reservierungsgebühr in Höhe von ${eurOhneSym(Number(res.reservierungsgebuehr_brutto))} inkl. MwSt.`;
    let linesG = drawWrappedText(page, gebuehrText1, margin, y, contentBreite, {
      size: 11, font: fontRegular, color: CI.text, lineHeight: 15,
    });
    y -= linesG * 15 + 4;

    page.drawText(fix(`- Zahlung fällig innerhalb von ${res.zahlungsfrist_werktage || 5} Werktagen nach Unterzeichnung dieser Vereinbarung`), {
      x: margin, y, size: 11, font: fontRegular, color: CI.text,
    });
    y -= 22;
    page.drawText(fix("Der Makler stellt hierüber eine ordnungsgemäße Rechnung aus."), {
      x: margin, y, size: 11, font: fontRegular, color: CI.text,
    });
    y -= 24;

    // §7 Rueckzahlung
    y = paragraph("7. Rückzahlung der Reservierungsgebühr",
      `Sollte der Kaufvertrag nicht zustande kommen, wird die Reservierungsgebühr ` +
      `innerhalb von ${res.zahlungsfrist_werktage || 5} Werktagen nach schriftlicher Mitteilung des Käufers in voller ` +
      "Höhe auf ein vom Käufer benanntes Konto zurückerstattet. Dies gilt auch, wenn der " +
      "Kauf aus Gründen des Verkäufers oder Maklers nicht zustande kommt.",
      y);

    // §8 Schlussbestimmungen
    y = paragraph("8. Schlussbestimmungen",
      "Änderungen und Ergänzungen dieser Vereinbarung bedürfen der Schriftform. " +
      "Sollte eine Bestimmung dieser Vereinbarung ganz oder teilweise unwirksam sein " +
      "oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.",
      y);

    // Seitenumbruch wenn nötig
    if (y < 250) {
      page = pdf.addPage(PageSizes.A4);
      y = height - margin;
    }

    // §9 Ruecktrittsrecht
    page.drawText(fix("9. Rücktrittsrecht des Verkäufers/Maklers"), {
      x: margin, y, size: 13, font: fontBold, color: CI.blau,
    });
    y -= 18;
    const ruecktritt1 = "Der Verkäufer bzw. Makler ist berechtigt, von dieser Reservierungsvereinbarung zurückzutreten, wenn";
    const l = drawWrappedText(page, ruecktritt1, margin, y, contentBreite, {
      size: 11, font: fontRegular, color: CI.text, lineHeight: 15,
    });
    y -= l * 15 + 6;

    const bullets = [
      "der Käufer innerhalb der Frist keinen ausreichenden Finanzierungsnachweis erbringt,",
      "der Käufer seinen vertraglichen Pflichten aus dieser Vereinbarung nicht nachkommt, oder",
      "unvorhersehbare Umstände eintreten, die den Verkauf der Immobilie unmöglich machen (z. B. höhere Gewalt, behördliche Untersagung, Rechtsstreitigkeiten bezüglich der Immobilie).",
    ];
    for (const b of bullets) {
      page.drawText("-", { x: margin, y, size: 11, font: fontRegular, color: CI.text });
      const lb = drawWrappedText(page, b, margin + 12, y, contentBreite - 12, {
        size: 11, font: fontRegular, color: CI.text, lineHeight: 15,
      });
      y -= lb * 15 + 3;
    }
    y -= 8;
    y = paragraph("",
      "Im Falle eines Rücktritts durch den Verkäufer/Makler wird die geleistete " +
      "Reservierungsgebühr vollständig zurückerstattet. Weitere Ansprüche des Käufers " +
      "bestehen nicht.",
      y);

    // Ort + Datum
    if (y < 140) {
      page = pdf.addPage(PageSizes.A4);
      y = height - margin;
    }
    y -= 10;
    page.drawText(fix(`${res.ort_unterzeichnung || ""}, ${datumDe(res.datum_unterzeichnung)}`), {
      x: margin, y, size: 11, font: fontRegular, color: CI.text,
    });
    y -= 35;

    // Unterschriftslinien
    page.drawText(fix("Unterschriften:"), {
      x: margin, y, size: 11, font: fontBold, color: CI.text,
    });
    y -= 35;

    // Kaeufer-Unterschrift
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + 300, y },
      thickness: 0.8,
      color: CI.mittelGrau,
    });
    y -= 14;
    page.drawText(fix(res.kaeufer_name), {
      x: margin, y, size: 10, font: fontRegular, color: CI.text,
    });
    y -= 40;

    // Makler-Unterschrift
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + 300, y },
      thickness: 0.8,
      color: CI.mittelGrau,
    });
    y -= 14;
    page.drawText(fix(`${firma.geschaeftsfuehrer || ""}, ${firma.firma_name}`), {
      x: margin, y, size: 10, font: fontRegular, color: CI.text,
    });

    // PDF speichern
    const pdfBytes = await pdf.save();
    const dateiName = `Reservierung_${res.kaeufer_name.replace(/[^a-zA-Z0-9]/g, "_")}_${res.wohneinheit_nr || "WE"}.pdf`;
    const pfad = `${reservierung_id}/${dateiName}`;

    const { error: upErr } = await admin.storage
      .from("reservierungen-pdf")
      .upload(pfad, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(`PDF-Upload fehlgeschlagen: ${upErr.message}`);

    const { data: signed, error: signedErr } = await admin.storage
      .from("reservierungen-pdf")
      .createSignedUrl(pfad, 3600);
    if (signedErr) throw new Error(`Signed URL fehlgeschlagen: ${signedErr.message}`);

    return new Response(JSON.stringify({
      ok: true,
      pfad,
      signed_url: signed?.signedUrl,
      dateiname: dateiName,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Fehler:", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});