// ============================================================================
// rechnung-pdf-erzeugen (v28, 26.09.2026)
// ============================================================================
// Erzeugt das PDF fuer eine Rechnung (Entwurf oder gestellt), speichert es
// im Storage-Bucket rechnungen-pdf und gibt eine signed URL zurueck.
//
// Input: { rechnung_id: uuid }
// Output: { ok: true, pfad, signed_url }
//
// v28: Interner Aufruf kann mit { rueckgabe: "base64" } das PDF direkt als Base64 zurueckgeben.
// v27: - Interner Aufruf ohne Nutzer-Anmeldung ueber die Kopfzeile x-intern-secret
//        (Wert nur im Vault, Pruefung per RPC intern_secret_pruefen). Damit kann
//        ein PDF per SQL/Cron neu aufgebaut werden, z. B. nach geaenderten
//        Firmenstammdaten (Bankverbindung).
//      - pdf_pfad/pdf_erzeugt_am werden jetzt fuer jeden Status gespeichert
//        (bisher nur fuer Entwuerfe; die angekuendigte RPC gab es nie).
// v26: Footer besser lesbar (groessere Schrift, dunklere Farbe, Firmenname in Markenblau).
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, rgb, PageSizes, degrees, StandardFonts } from "npm:pdf-lib@1.17.1";

// fontkit defensiv importieren - kann in Deno gelegentlich fehlschlagen
let fontkit: any = null;
try {
  const mod = await import("npm:@pdf-lib/fontkit@1.1.1");
  fontkit = mod.default || mod;
} catch (e) {
  console.warn("fontkit konnte nicht geladen werden, falle auf StandardFonts zurueck:", e);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-intern-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Font-Pfade im Storage-Bucket branding-assets
const FONT_MONTSERRAT_REGULAR = "fonts/Montserrat-Regular.ttf";
const FONT_MONTSERRAT_BOLD    = "fonts/Montserrat-Bold.ttf";
const FONT_MARCELLUS          = "fonts/Marcellus-Regular.ttf";

// In-Memory-Cache fuer Fonts und Logo (ueberlebt mehrere Aufrufe in der Edge Function Instance)
let cachedFonts: {
  montserratRegular?: ArrayBuffer;
  montserratBold?: ArrayBuffer;
  marcellus?: ArrayBuffer;
} = {};

const CI = {
  blau: rgb(0.039, 0.165, 0.30),  // ca. #0A2A4D
  gold: rgb(0.78, 0.64, 0.33),    // ca. #C7A455
  text: rgb(0.05, 0.05, 0.05),
  hellGrau: rgb(0.95, 0.95, 0.95),
  mittelGrau: rgb(0.6, 0.6, 0.6),
  footerGrau: rgb(0.30, 0.30, 0.30),  // dunkler -> gut lesbarer Footer
};

function eur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
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

// Wandelt Umlaute in ASCII um (fuer Helvetica-Fallback ohne Unicode-Support)
function umlautFix(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/ä/g, "ae").replace(/Ä/g, "Ae")
    .replace(/ö/g, "oe").replace(/Ö/g, "Oe")
    .replace(/ü/g, "ue").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/€/g, "EUR")
    .replace(/·/g, "-");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // v27: Interner Aufruf (SQL/Cron) ueber x-intern-secret, Wert liegt nur im Vault.
    let internAufruf = false;
    const internSecret = req.headers.get("x-intern-secret") || "";
    if (internSecret) {
      const { data: ok, error: sErr } = await admin.rpc("intern_secret_pruefen", { p_name: "rechnung_pdf_intern", p_wert: internSecret });
      if (sErr || ok !== true) throw new Error("Interner Schlüssel ungültig.");
      internAufruf = true;
    }

    if (!internAufruf) {
      const authHeader = req.headers.get("Authorization") || "";
      const userJwt = authHeader.replace(/^Bearer\s+/i, "");
      const userClient = createClient(supabaseUrl, serviceKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData, error: uErr } = await userClient.auth.getUser(userJwt);
      if (uErr || !userData?.user) throw new Error("Nicht authentifiziert.");

      const { data: profil } = await userClient
        .from("profiles").select("role, name").eq("id", userData.user.id).maybeSingle();
      if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) {
        throw new Error("Nur Makler duerfen PDFs erzeugen.");
      }
    }

    const body = await req.json();
    const rechnungId = (body.rechnung_id || "").toString().trim();
    if (!rechnungId) throw new Error("rechnung_id ist Pflicht.");

    // Rechnung + Positionen + Firma laden
    const { data: rechnung, error: rErr } = await admin
      .from("rechnungen").select("*").eq("id", rechnungId).maybeSingle();
    if (rErr) throw rErr;
    if (!rechnung) throw new Error("Rechnung nicht gefunden.");

    const { data: positionen } = await admin
      .from("rechnung_positionen").select("*")
      .eq("rechnung_id", rechnungId)
      .order("reihenfolge", { ascending: true });

    // Firma: erst aus rechnung.absender_firma_id, sonst Default
    let firma: any = null;
    if (rechnung.absender_firma_id) {
      const { data } = await admin.from("firma_stammdaten").select("*").eq("id", rechnung.absender_firma_id).maybeSingle();
      firma = data;
    }
    if (!firma) {
      // Fallback: Musterhaus Immobilien GmbH oder erste aktive Firma
      const { data } = await admin.from("firma_stammdaten").select("*")
        .eq("aktiv", true).order("sortierung", { ascending: true }).limit(1).maybeSingle();
      firma = data;
    }
    if (!firma) throw new Error("Firmen-Stammdaten nicht gefunden.");

    const istTest = rechnung.ist_test === true;

    // ---- Fonts aus Storage laden (Cache pro Instance) ----
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
        console.log("Fonts geladen:",
          "Montserrat-Regular:", cachedFonts.montserratRegular?.byteLength || "FEHLT",
          "Montserrat-Bold:", cachedFonts.montserratBold?.byteLength || "FEHLT",
          "Marcellus:", cachedFonts.marcellus?.byteLength || "FEHLT");
      } catch (e) {
        console.warn("Font-Download fehlgeschlagen:", e instanceof Error ? e.message : String(e));
      }
    }

    // ---- PDF aufbauen ----
    const pdf = await PDFDocument.create();
    if (fontkit) {
      try { pdf.registerFontkit(fontkit); } catch (e) {
        console.warn("registerFontkit fehlgeschlagen:", e);
      }
    }
    const page = pdf.addPage(PageSizes.A4);
    const { width, height } = page.getSize();

    // Fonts einbetten: Custom Fonts wenn verfuegbar, sonst Helvetica
    let fontRegular: any = null;
    let fontBold: any = null;
    let fontHeadline: any = null;  // Marcellus oder Fallback auf Bold
    let nutztCustomFonts = false;
    if (fontkit && cachedFonts.montserratRegular && cachedFonts.montserratBold) {
      try {
        fontRegular = await pdf.embedFont(cachedFonts.montserratRegular, { subset: true });
        fontBold = await pdf.embedFont(cachedFonts.montserratBold, { subset: true });
        if (cachedFonts.marcellus) {
          fontHeadline = await pdf.embedFont(cachedFonts.marcellus, { subset: true });
        } else {
          fontHeadline = fontBold;  // Fallback wenn Marcellus fehlt
        }
        nutztCustomFonts = true;
      } catch (e) {
        console.warn("Font-Einbettung fehlgeschlagen, falle auf Helvetica zurueck:", e instanceof Error ? e.message : String(e));
        fontRegular = null;
        fontBold = null;
        fontHeadline = null;
      }
    }
    if (!fontRegular) {
      fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
      fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      fontHeadline = fontBold;
    }
    console.log("Font-Modus:", nutztCustomFonts ? "Montserrat + Marcellus" : "Helvetica");

    // Wenn Helvetica genutzt wird, muessen Umlaute zu ASCII konvertiert werden
    const fix = nutztCustomFonts ? (s: string) => s : umlautFix;
    const drawText = (text: string, opts: any) => {
      page.drawText(fix(text || ""), opts);
    };

    // ---- Logo aus Storage laden + einbetten falls vorhanden ----
    let embeddedLogo: any = null;
    if (firma.logo_pfad) {
      try {
        const { data: logoBlob, error: logoErr } = await admin.storage
          .from("branding-assets")
          .download(firma.logo_pfad);
        if (logoErr) {
          console.warn("Logo-Download Fehler:", logoErr.message);
        } else if (logoBlob) {
          const logoBytes = await logoBlob.arrayBuffer();
          const pfadLower = firma.logo_pfad.toLowerCase();
          if (pfadLower.endsWith(".jpg") || pfadLower.endsWith(".jpeg")) {
            embeddedLogo = await pdf.embedJpg(logoBytes);
          } else {
            embeddedLogo = await pdf.embedPng(logoBytes);
          }
          console.log("Logo eingebettet:", logoBytes.byteLength, "Bytes");
        }
      } catch (e) {
        console.warn("Logo-Einbettung fehlgeschlagen:", e instanceof Error ? e.message : String(e));
      }
    }

    const margin = 50;
    let y = height - margin;

    // ---- Titel + Logo ----
    drawText("Rechnung", {
      x: margin, y: y - 35, size: 32, font: fontHeadline, color: CI.blau,
    });
    // Logo rechts oben, ueber dem Empfaenger-Block
    if (embeddedLogo) {
      const logoMaxHeight = 60;
      const ratio = embeddedLogo.width / embeddedLogo.height;
      const logoH = logoMaxHeight;
      const logoW = logoH * ratio;
      page.drawImage(embeddedLogo, {
        x: width - margin - logoW,
        y: y - logoH - 5,
        width: logoW,
        height: logoH,
      });
    }
    y -= 80;

    // ---- Strasse defensiv fixen (falls DB noch ASCII hat) ----
    const strasseTxt = (firma.strasse || "");

    // ---- Absender-Zeile (klein, ueber Empfaenger) ----
    const absenderZeile = `${firma.firma_name} · ${strasseTxt} ${firma.plz} ${firma.ort}, ${firma.land || "DE"}`;
    drawText(absenderZeile, {
      x: margin, y, size: 7, font: fontRegular, color: CI.mittelGrau,
    });
    y -= 15;

    // ---- Empfaenger + Metadaten in zwei Spalten ----
    const empfaengerStartY = y;
    const empfaengerName = [rechnung.empfaenger_anrede, rechnung.empfaenger_name].filter(Boolean).join(" ");
    drawText(empfaengerName || "", {
      x: margin, y: empfaengerStartY, size: 11, font: fontBold, color: CI.text,
    });

    let leftY = empfaengerStartY - 18;
    if (rechnung.empfaenger_zusatz) {
      drawText(rechnung.empfaenger_zusatz, {
        x: margin, y: leftY, size: 10, font: fontRegular, color: CI.text,
      });
      leftY -= 13;
    }
    if (rechnung.empfaenger_strasse) {
      drawText(rechnung.empfaenger_strasse, {
        x: margin, y: leftY, size: 10, font: fontRegular, color: CI.text,
      });
      leftY -= 13;
    }
    const plzOrt = [rechnung.empfaenger_plz, rechnung.empfaenger_ort].filter(Boolean).join(" ");
    if (plzOrt) {
      drawText(plzOrt, {
        x: margin, y: leftY, size: 10, font: fontRegular, color: CI.text,
      });
      leftY -= 13;
    }
    if (rechnung.empfaenger_land && rechnung.empfaenger_land !== "DE") {
      drawText(rechnung.empfaenger_land, {
        x: margin, y: leftY, size: 10, font: fontRegular, color: CI.text,
      });
      leftY -= 13;
    }

    // Rechts: Meta-Daten
    const rightX = 350;
    let rightY = empfaengerStartY;

    const metaZeilen: Array<[string, string]> = [
      ["Rechnungsnummer", rechnung.rechnungsnummer || "ENTWURF"],
      ["Ausstellungsdatum", datumDe(rechnung.ausstellungsdatum)],
    ];
    if (rechnung.leistungszeitraum_von) {
      const lz = rechnung.leistungszeitraum_bis && rechnung.leistungszeitraum_bis !== rechnung.leistungszeitraum_von
        ? `${datumDe(rechnung.leistungszeitraum_von)} - ${datumDe(rechnung.leistungszeitraum_bis)}`
        : datumDe(rechnung.leistungszeitraum_von);
      metaZeilen.push(["Leistungszeitraum", lz]);
    }

    for (const [label, val] of metaZeilen) {
      drawText(label, {
        x: rightX, y: rightY, size: 10, font: fontBold, color: CI.text,
      });
      drawText(val, {
        x: rightX + 130, y: rightY, size: 10, font: fontRegular, color: CI.text,
      });
      rightY -= 15;
    }

    y = Math.min(leftY, rightY) - 30;

    // ---- Einleitungstext ----
    // Default-Texte mit Umlauten (falls DB-Texte noch alte ASCII-Variante haben)
    let einleitung = rechnung.einleitungstext || firma.rechnung_einleitung || "";
    let schluss = rechnung.schlusstext || firma.rechnung_schluss || "";

    // Falls Einleitung/Schluss noch ASCII-Variante: ueberschreiben
    if (einleitung.includes("fuer") || einleitung.includes("Gruessen") || !einleitung) {
      einleitung = "Sehr geehrte Damen und Herren,\n\nhiermit stellen wir Ihnen folgende Leistungen in Rechnung:";
    }
    if (schluss.includes("fuer") || schluss.includes("Gruessen") || !schluss) {
      const firmenZeile = firma.firma_name === "Musterhaus Immobilien GmbH Berlin GmbH"
        ? "Musterhaus Immobilien GmbH Berlin GmbH"
        : "Musterhaus Immobilien GmbH";
      schluss = `Vielen Dank für Ihr Vertrauen!\n\nMit freundlichen Grüßen\n${firmenZeile}`;
    }

    if (einleitung) {
      const zeilen = einleitung.split("\n");
      for (const zeile of zeilen) {
        drawText(zeile, { x: margin, y, size: 10, font: fontRegular, color: CI.text });
        y -= 13;
      }
    }
    y -= 20;

    // ---- Positionstabelle ----
    const tabStartY = y;

    // Header-Hintergrund
    page.drawRectangle({
      x: margin, y: y - 18, width: width - 2 * margin, height: 22,
      color: CI.blau,
    });

    drawText("Beschreibung", {
      x: margin + 8, y: y - 12, size: 9, font: fontBold, color: rgb(1, 1, 1),
    });
    drawText("Menge", {
      x: margin + 280, y: y - 12, size: 9, font: fontBold, color: rgb(1, 1, 1),
    });
    drawText("Einzelpreis", {
      x: margin + 340, y: y - 12, size: 9, font: fontBold, color: rgb(1, 1, 1),
    });
    drawText("MwSt", {
      x: margin + 410, y: y - 12, size: 9, font: fontBold, color: rgb(1, 1, 1),
    });
    drawText("Netto", {
      x: margin + 455, y: y - 12, size: 9, font: fontBold, color: rgb(1, 1, 1),
    });

    y -= 30;

    // Positionen
    // Hilfsfunktion: Text in Zeilen umbrechen die in maxWidth passen
    const wrapText = (text: string, font: any, fontSize: number, maxWidth: number): string[] => {
      const woerter = (text || "").split(/\s+/);
      const zeilen: string[] = [];
      let aktuelle = "";
      for (const wort of woerter) {
        if (!wort) continue;
        const versuch = aktuelle ? aktuelle + " " + wort : wort;
        const breite = font.widthOfTextAtSize(fix(versuch), fontSize);
        if (breite > maxWidth && aktuelle) {
          zeilen.push(aktuelle);
          aktuelle = wort;
        } else {
          aktuelle = versuch;
        }
      }
      if (aktuelle) zeilen.push(aktuelle);
      return zeilen;
    };

    const beschreibungMaxBreite = 260;  // ca. von margin+8 bis margin+275

    for (const pos of (positionen || [])) {
      // Beschreibung: erst nach \n splitten, dann jede Zeile umbrechen
      const rohZeilen = (pos.beschreibung || "").split("\n");
      const beschreibungZeilen: string[] = [];
      // Erste rohe Zeile: in Bold-Font umbrechen (Header)
      if (rohZeilen[0]) {
        const erstZeileWrapped = wrapText(rohZeilen[0], fontBold, 10, beschreibungMaxBreite);
        beschreibungZeilen.push(...erstZeileWrapped);
      } else {
        beschreibungZeilen.push("");
      }
      // Weitere Zeilen: Regular-Font, kleiner
      for (let i = 1; i < rohZeilen.length; i++) {
        const wrapped = wrapText(rohZeilen[i], fontRegular, 9, beschreibungMaxBreite);
        beschreibungZeilen.push(...wrapped.map(z => "__SUB__" + z));
      }

      // Header-Zeile: erste Beschreibungs-Zeile + Zahlen
      drawText(beschreibungZeilen[0] || "", {
        x: margin + 8, y, size: 10, font: fontBold, color: CI.text,
      });
      drawText(String(pos.menge), {
        x: margin + 280, y, size: 10, font: fontRegular, color: CI.text,
      });
      drawText(eur(Number(pos.einzelpreis_netto)), {
        x: margin + 340, y, size: 10, font: fontRegular, color: CI.text,
      });
      drawText(`${Number(pos.mwst_satz)} %`, {
        x: margin + 410, y, size: 10, font: fontRegular, color: CI.text,
      });
      drawText(eur(Number(pos.position_netto)), {
        x: margin + 455, y, size: 10, font: fontRegular, color: CI.text,
      });
      y -= 14;

      // Weitere Beschreibungs-Zeilen
      for (let i = 1; i < beschreibungZeilen.length; i++) {
        const istSubZeile = beschreibungZeilen[i].startsWith("__SUB__");
        const text = istSubZeile ? beschreibungZeilen[i].slice(7) : beschreibungZeilen[i];
        const groesse = istSubZeile ? 9 : 10;
        const farbe = istSubZeile ? CI.mittelGrau : CI.text;
        const schrift = istSubZeile ? fontRegular : fontBold;
        drawText(text, {
          x: margin + 8, y, size: groesse, font: schrift, color: farbe,
        });
        y -= groesse + 3;
      }
      y -= 8;
    }

    // Trennlinie
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5, color: CI.mittelGrau,
    });
    y -= 25;

    // ---- Summen ----
    const sumLabelX = margin + 280;
    const sumValueX = margin + 455;

    drawText("Nettobetrag", { x: sumLabelX, y, size: 10, font: fontBold, color: CI.text });
    drawText(eur(Number(rechnung.nettobetrag)), { x: sumValueX, y, size: 10, font: fontRegular, color: CI.text });
    y -= 16;

    drawText("MwSt.-Betrag", { x: sumLabelX, y, size: 10, font: fontBold, color: CI.text });
    drawText(eur(Number(rechnung.mwst_betrag)), { x: sumValueX, y, size: 10, font: fontRegular, color: CI.text });
    y -= 16;

    drawText("Gesamt (inkl. MwSt.)", { x: sumLabelX, y, size: 11, font: fontBold, color: CI.text });
    drawText(eur(Number(rechnung.bruttobetrag)), { x: sumValueX, y, size: 11, font: fontBold, color: CI.blau });
    y -= 35;

    // ---- Faelligkeit ----
    if (rechnung.faelligkeitsdatum || rechnung.zahlungsziel_tage) {
      const faelligText = rechnung.faelligkeitsdatum
        ? `Der Rechnungsbetrag ist fällig am ${datumDe(rechnung.faelligkeitsdatum)}.`
        : `Der Rechnungsbetrag ist fällig in ${rechnung.zahlungsziel_tage || 30} Tagen.`;
      drawText(faelligText, { x: margin, y, size: 10, font: fontRegular, color: CI.text });
      y -= 25;
    }

    // ---- Schlusstext (verwendet die schon oben fixierten Texte) ----
    if (schluss) {
      const zeilen = schluss.split("\n");
      for (const zeile of zeilen) {
        drawText(zeile, { x: margin, y, size: 10, font: fontRegular, color: CI.text });
        y -= 13;
      }
    }

    // ---- Footer mit Firmen-Stammdaten ----
    const footerY = 80;
    page.drawLine({
      start: { x: margin, y: footerY + 60 },
      end: { x: width - margin, y: footerY + 60 },
      thickness: 0.5, color: CI.mittelGrau,
    });

    const colWidth = (width - 2 * margin) / 3;
    const footerSize = 8.5;
    const footerZeile = 12;

    // Spalte 1: Firma
    let fy = footerY + 50;
    drawText(firma.firma_name, { x: margin, y: fy, size: footerSize, font: fontBold, color: CI.blau });
    fy -= footerZeile;
    drawText(strasseTxt, { x: margin, y: fy, size: footerSize, font: fontRegular, color: CI.footerGrau });
    fy -= footerZeile;
    drawText(`${firma.plz} ${firma.ort}, ${firma.land || "DE"}`, { x: margin, y: fy, size: footerSize, font: fontRegular, color: CI.footerGrau });
    fy -= footerZeile;
    drawText(firma.email, { x: margin, y: fy, size: footerSize, font: fontRegular, color: CI.footerGrau });
    fy -= footerZeile;
    if (firma.registergericht && firma.hrb) {
      drawText(`Registergericht: ${firma.registergericht} · ${firma.hrb}`, { x: margin, y: fy, size: footerSize, font: fontRegular, color: CI.footerGrau });
    }

    // Spalte 2: Geschaeftsfuehrung + Steuer
    fy = footerY + 50;
    if (firma.geschaeftsfuehrer) {
      drawText(`Geschäftsführung: ${firma.geschaeftsfuehrer}`, { x: margin + colWidth, y: fy, size: footerSize, font: fontRegular, color: CI.footerGrau });
      fy -= footerZeile;
    }
    if (firma.steuernummer) {
      drawText(`Steuernummer: ${firma.steuernummer}`, { x: margin + colWidth, y: fy, size: footerSize, font: fontRegular, color: CI.footerGrau });
      fy -= footerZeile;
    }
    if (firma.ust_id) {
      drawText(`USt-IDNr. ${firma.ust_id}`, { x: margin + colWidth, y: fy, size: footerSize, font: fontRegular, color: CI.footerGrau });
    }

    // Spalte 3: Bank
    fy = footerY + 50;
    if (firma.bank_name) {
      drawText(firma.bank_name, { x: margin + 2 * colWidth, y: fy, size: footerSize, font: fontRegular, color: CI.footerGrau });
      fy -= footerZeile;
    }
    if (firma.bank_iban) {
      drawText(`IBAN ${firma.bank_iban}`, { x: margin + 2 * colWidth, y: fy, size: footerSize, font: fontRegular, color: CI.footerGrau });
      fy -= footerZeile;
    }
    if (firma.bank_bic) {
      drawText(`BIC ${firma.bank_bic}`, { x: margin + 2 * colWidth, y: fy, size: footerSize, font: fontRegular, color: CI.footerGrau });
    }

    // ---- Test-Watermark (wenn ist_test=true) ----
    if (istTest) {
      // Diagonales TEST quer ueber die Seite
      drawText("TEST", {
        x: width / 2 - 200,
        y: height / 2 - 60,
        size: 180,
        font: fontBold,
        color: rgb(0.85, 0.20, 0.20),
        opacity: 0.20,
        rotate: degrees(30),
      });
      // Banner oben
      page.drawRectangle({
        x: 0, y: height - 25, width: width, height: 25,
        color: rgb(0.85, 0.20, 0.20),
      });
      drawText("TEST-RECHNUNG - NICHT FÜR STEUERLICHE ZWECKE", {
        x: width / 2 - 150, y: height - 18,
        size: 11, font: fontBold, color: rgb(1, 1, 1),
      });
    }

    // ---- Seitenzahl ----
    drawText("Seite 1/1", {
      x: width - margin - 30, y: footerY + 75, size: 8, font: fontRegular, color: CI.mittelGrau,
    });

    // ---- Speichern ----
    const pdfBytes = await pdf.save();
    const dateiname = (rechnung.rechnungsnummer || `Entwurf-${rechnung.id.slice(0, 8)}`).replace(/[^a-zA-Z0-9-_]/g, "-") + (istTest ? "-TEST" : "") + ".pdf";
    const pfad = `${rechnung.id}/${dateiname}`;

    const { error: uploadErr } = await admin.storage
      .from("rechnungen-pdf")
      .upload(pfad, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadErr) throw new Error(`Storage-Upload fehlgeschlagen: ${uploadErr.message}`);

    // v27: Pfad und Zeitpunkt fuer jeden Status speichern (der Unveraenderlichkeits-Trigger
    // laesst pdf_pfad/pdf_erzeugt_am auch bei gestellten Rechnungen zu).
    const { error: pfadErr } = await admin.from("rechnungen")
      .update({ pdf_pfad: pfad, pdf_erzeugt_am: new Date().toISOString() })
      .eq("id", rechnungId);
    if (pfadErr) console.warn("pdf_pfad konnte nicht gespeichert werden:", pfadErr.message);

    // Signed URL
    const { data: signed } = await admin.storage
      .from("rechnungen-pdf")
      .createSignedUrl(pfad, 300);  // 5 min

    // Interner Aufruf mit { rueckgabe: "base64" }: PDF direkt mitliefern (z. B. Abholung per SQL,
    // wenn der Storage-Link von aussen nicht erreichbar ist).
    let pdfBase64: string | undefined;
    if (internAufruf && body.rueckgabe === "base64") {
      let bin = "";
      for (let i = 0; i < pdfBytes.length; i += 32768) bin += String.fromCharCode.apply(null, Array.from(pdfBytes.subarray(i, Math.min(i + 32768, pdfBytes.length))) as any);
      pdfBase64 = btoa(bin);
    }

    return jsonResponse({
      ok: true,
      pfad,
      signed_url: signed?.signedUrl || null,
      dateiname,
      intern: internAufruf || undefined,
      pdf_base64: pdfBase64,
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("rechnung-pdf-erzeugen:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 400);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
