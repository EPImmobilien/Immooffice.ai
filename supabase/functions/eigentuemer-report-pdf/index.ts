// ============================================================================
// eigentuemer-report-pdf v10 (25.09.2026, Stufe 92 / Auftrag 14, Klärung 8)
//   Vermarktungsbericht für Eigentümer – reduziert auf Wunsch des Nutzers:
//   verschickte Exposés, geplante Besichtigungen, Absagen mit Gründen.
//   Body: { immobilie_id, von?: ISO, bis?: ISO, kommentar?: string, senden?: bool, empfaenger?: string[], namen?: "voll"|"kurz" }
//   Antwort: { ok, storage_path, url (Signed 7 Tage), kennzahlen, gesendet_an }
//   Speichert das PDF als immobilie_datei (kategorie 'bericht'), Vermerk + Eigentümer-Portal-Meldung.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Pflichtangabe. Fehlt sie, geht NICHTS hinaus: ein Rueckfall auf
// eine Adresse, die niemandem gehoert, sieht aus wie Betrieb, kommt
// aber nirgends an. Begruendung in docs/OFFEN.md.
function immoFehlt(was: string): never {
  throw new Error(was + " fehlt (siehe docs/SECRETS.md). Ohne diese " +
    "Angabe ginge eine Nachricht mit einer Adresse hinaus, die " +
    "niemandem gehoert \u2014 deshalb geht gar keine.");
}


// --- Gehoert diese Adresse zum Mandanten selbst? (Phase 2.4) ------------
// Hier stand die Mail-Domain der Referenz im Quelltext. Die
// Neutralisierung hat daraus eine Domain gemacht, die es nicht gibt
// (die Platzhalter-Domain mit angehaengtem ".de") - die Pruefung konnte
// seither NIE zutreffen, und jede dieser Funktionen hat immer als Firma
// gesendet statt als zustaendiger Makler. Ein stiller Verhaltenswechsel,
// den kein Gate sieht: die Zeile ist syntaktisch in Ordnung, sie ist nur
// immer falsch.
//
// Verglichen wird jetzt die Domain, nicht die Zeichenkette. Welche die
// eigene ist, sagt der Mandant selbst - ueber die Absenderadresse oder
// die Mailadresse seiner Stammdaten. Ohne eine von beiden ist die
// Antwort false, und es wird wie bisher als Firma gesendet.
function immoEigeneAdresse(adresse: unknown, eigene: unknown): boolean {
  const domain = (x: unknown) =>
    String(x || "").trim().toLowerCase().split("@")[1] || "";
  const a = domain(adresse), e = domain(eigene);
  return !!a && !!e && a === e;
}

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

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const NAVY = rgb(0.149, 0.192, 0.349), GOLD = rgb(0.831, 0.647, 0.404), GRAU = rgb(0.42, 0.45, 0.5), HELL = rgb(0.953, 0.957, 0.973), SCHWARZ = rgb(0.1, 0.1, 0.1), WEISS = rgb(1, 1, 1);
const A4 = { w: 595.28, h: 841.89 }, RAND = 50;
const dDE = (s: string | Date) => new Date(s).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
const dtDE = (s: string | Date) => new Date(s).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function kurzName(name: string | null | undefined, modus: string) {
  const n = String(name || "").trim(); if (!n) return "Interessent";
  if (modus === "voll") return n;
  const t = n.split(/\s+/); return t.length > 1 ? `${t[0]} ${t[t.length - 1][0]}.` : n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
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
      const immoEcht = db.storage.from.bind(db.storage);
      const immoVorne = (pf: unknown): unknown =>
        (typeof pf !== "string" || !pf || !immoMandant) ? pf
          : (pf === immoMandant || pf.startsWith(immoMandant + "/") ? pf : immoMandant + "/" + pf);
      const immoViele = (pf: unknown): unknown => Array.isArray(pf) ? pf.map(immoVorne) : immoVorne(pf);
      (db.storage as any).from = (eimer: string) => {
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
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
    const { data: prof } = await db.from("profiles").select("role, name, email, telefon, titel, firma_id, mandant_id").eq("id", u.user.id).maybeSingle(); immoSetzeMandant(prof?.mandant_id);
    if (!prof || !["chef", "mitarbeiter"].includes(prof.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
    const body = await req.json().catch(() => ({}));
    const immobilieId = String(body.immobilie_id || ""); if (!immobilieId) throw new Error("immobilie_id fehlt.");
    await immoMandantSichern(req, [["immobilien", immobilieId]]);
    const bis = body.bis ? new Date(body.bis) : new Date();
    const von = body.von ? new Date(body.von) : new Date(bis.getTime() - 30 * 86400000);
    const namen = body.namen === "voll" ? "voll" : "kurz";

    const { data: im } = await db.from("immobilien").select("id, immo_nr, objekttitel, bezeichnung, strasse, hausnummer, plz, ort, vertragsart, angebotspreis, kaltmiete, status, zustaendig_id, created_at").eq("id", immobilieId).maybeSingle();
    if (!im) throw new Error("Objekt nicht gefunden.");
    const maklerId = im.zustaendig_id || u.user.id;
    const { data: makler } = await db.from("profiles").select("name, email, telefon, titel, firma_id").eq("id", maklerId).maybeSingle();
    const { data: firma } = await db.from("firma_stammdaten").select("firma_name, strasse, plz, ort, email, web").eq("id", makler?.firma_id || prof.firma_id || "").maybeSingle();
    const { data: eigLinks } = await db.from("immobilie_eigentuemer").select("eigentuemer_id, eigentuemer(id, anrede, vorname, nachname, email)").eq("immobilie_id", immobilieId);
    const eigentuemer = (eigLinks || []).map((l: any) => l.eigentuemer).filter(Boolean);

    // ---- Daten sammeln: Exposés (Portal-Freigaben + onOffice-Versand), geplante Besichtigungen, Absagen ----
    const vIso = von.toISOString(), bIso = bis.toISOString(), heute = new Date().toISOString().slice(0, 10);
    const [freigaben, onoffice, termine, absagenFreigaben] = await Promise.all([
      db.from("expose_freigaben").select("created_at, name, email, bestaetigt_am, downloads").eq("immobilie_id", immobilieId).gte("created_at", vIso).lte("created_at", bIso),
      db.from("onoffice_expose_versand").select("gesendet_am, name, email").eq("immobilie_id", immobilieId).gte("gesendet_am", vIso).lte("gesendet_am", bIso).eq("ignoriert", false),
      db.from("termine").select("datum, uhrzeit, titel, art, status, kontakte(vorname, nachname)").eq("immobilie_id", immobilieId).gte("datum", heute).order("datum", { ascending: true }).order("uhrzeit", { ascending: true }),
      db.from("expose_freigaben").select("abgesagt_am, absage_grund, absage_text, name, email").eq("immobilie_id", immobilieId).not("abgesagt_am", "is", null).gte("abgesagt_am", vIso).lte("abgesagt_am", bIso).order("abgesagt_am", { ascending: true }),
    ]);
    const F = freigaben.data || [], O = onoffice.data || [], T = termine.data || [], AB = absagenFreigaben.data || [];
    const fMails = new Set(F.map((f: any) => String(f.email || "").toLowerCase()).filter(Boolean));
    const onoNeu = O.filter((o: any) => !fMails.has(String(o.email || "").toLowerCase()));
    const geplant = T.filter((t: any) => (/besicht/i.test(t.art || "") || /besicht/i.test(t.titel || "")) && !/abgesagt|storn/i.test(t.status || ""));
    const kennzahlen = {
      expose_versendet: F.length + onoNeu.length, expose_portal: F.length, expose_onoffice: onoNeu.length, expose_abgerufen: F.filter((f: any) => f.bestaetigt_am).length,
      besichtigungen_geplant: geplant.length, absagen: AB.length,
      absage_gruende: AB.map((a: any) => ({ am: a.abgesagt_am, grund: a.absage_grund || "ohne Angabe", text: a.absage_text || "", wer: kurzName(a.name, namen) })),
      // Kompatibilität zu älteren Dialog-Fassungen
      expose_links: F.length + onoNeu.length, beauftragungen: F.filter((f: any) => f.bestaetigt_am).length, besichtigungen: geplant.length,
    };

    // ---- PDF ----
    const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
    let fR: any, fB: any;
    try {
      const r = await db.storage.from("branding-assets").download("fonts/Montserrat-Regular.ttf"); const b = await db.storage.from("branding-assets").download("fonts/Montserrat-SemiBold.ttf");
      fR = await pdf.embedFont(new Uint8Array(await r.data!.arrayBuffer())); fB = await pdf.embedFont(new Uint8Array(await b.data!.arrayBuffer()));
    } catch { fR = await pdf.embedFont(StandardFonts.Helvetica); fB = await pdf.embedFont(StandardFonts.HelveticaBold); }
    let logo: any = null; try { const l = await db.storage.from("branding-assets").download("logo.png"); logo = await pdf.embedPng(new Uint8Array(await l.data!.arrayBuffer())); } catch { /* ohne Logo */ }

    const seiten: any[] = []; let page = pdf.addPage([A4.w, A4.h]); seiten.push(page); let y = A4.h - RAND;
    const neueSeite = () => { page = pdf.addPage([A4.w, A4.h]); seiten.push(page); y = A4.h - RAND; };
    const txt = (s: string, x: number, yy: number, size: number, font = fR, color = SCHWARZ) => page.drawText(s, { x, y: yy, size, font, color });
    const wrap = (s: string, font: any, size: number, maxW: number) => { const out: string[] = []; for (const abs of String(s || "").split(/\n/)) { let z = ""; for (const w of abs.split(/\s+/)) { const t = z ? z + " " + w : w; if (font.widthOfTextAtSize(t, size) > maxW && z) { out.push(z); z = w; } else z = t; } out.push(z); } return out; };
    const absatz = (s: string, size = 10, font = fR, color = SCHWARZ, lh = 14, x = RAND, maxW = A4.w - 2 * RAND) => { for (const l of wrap(s, font, size, maxW)) { if (y < RAND + 40) neueSeite(); txt(l, x, y, size, font, color); y -= lh; } };

    // Kopf
    if (logo) { const s = 110 / logo.width; page.drawImage(logo, { x: A4.w - RAND - 110, y: y - logo.height * s + 8, width: 110, height: logo.height * s }); }
    txt("VERMARKTUNGSBERICHT", RAND, y - 6, 9, fB, GOLD); y -= 26;
    txt(im.objekttitel || im.bezeichnung || "Immobilie", RAND, y, 17, fB, NAVY); y -= 20;
    const adr = [im.strasse && `${im.strasse} ${im.hausnummer || ""}`.trim(), [im.plz, im.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    txt(`${adr}${im.immo_nr ? "  ·  Objekt-Nr. " + im.immo_nr : ""}`, RAND, y, 10, fR, GRAU); y -= 16;
    txt(`Berichtszeitraum ${dDE(von)} bis ${dDE(bis)}  ·  erstellt am ${dDE(new Date())}`, RAND, y, 10, fR, GRAU); y -= 12;
    page.drawLine({ start: { x: RAND, y }, end: { x: A4.w - RAND, y }, thickness: 1.5, color: GOLD }); y -= 26;

    // Anrede
    const eigNamen = eigentuemer.map((e: any) => `${e.anrede === "Herr" ? "Sehr geehrter Herr" : e.anrede === "Frau" ? "Sehr geehrte Frau" : "Guten Tag"} ${[e.vorname && !e.anrede ? e.vorname : "", e.nachname].filter(Boolean).join(" ")}`);
    absatz((eigNamen.length ? eigNamen.join(", ") : "Sehr geehrte Eigentümer") + ",", 10.5); y -= 4;
    absatz(`gern gebe ich Ihnen einen kurzen Überblick über den Stand der Vermarktung Ihrer Immobilie. Alle Zahlen stammen direkt aus unserem Vermarktungssystem.`, 10.5); y -= 10;

    // Drei Kennzahlen
    const kpis: [string, number][] = [["Exposés versendet", kennzahlen.expose_versendet], ["Besichtigungen geplant", kennzahlen.besichtigungen_geplant], ["Absagen im Zeitraum", kennzahlen.absagen]];
    const kw = (A4.w - 2 * RAND - 2 * 8) / 3, kh = 58;
    kpis.forEach(([label, wert], i) => { const cx = RAND + i * (kw + 8), cy = y - kh; page.drawRectangle({ x: cx, y: cy, width: kw, height: kh, color: i === 1 ? NAVY : HELL }); txt(String(wert), cx + 14, cy + 24, 22, fB, i === 1 ? GOLD : NAVY); txt(label, cx + 14, cy + 10, 8.5, fR, i === 1 ? WEISS : GRAU); });
    y -= kh + 24;
    if (kennzahlen.expose_versendet) { absatz(`Davon ${kennzahlen.expose_portal} über unsere Exposé-Freigabe (${kennzahlen.expose_abgerufen} bestätigt/abgerufen)${kennzahlen.expose_onoffice ? ` und ${kennzahlen.expose_onoffice} direkt per E-Mail` : ""}.`, 9.5, fR, GRAU, 13); y -= 8; }

    // Geplante Besichtigungen
    txt("GEPLANTE BESICHTIGUNGEN", RAND, y, 9, fB, GOLD); y -= 18;
    if (!geplant.length) { absatz("Derzeit sind keine Besichtigungen geplant.", 10, fR, GRAU); y -= 6; }
    for (const t of geplant.slice(0, 25)) {
      const k: any = t.kontakte; const wer = k ? kurzName(`${k.vorname || ""} ${k.nachname || ""}`, namen) : "";
      if (y < RAND + 40) neueSeite();
      txt(`${dDE(t.datum)}${t.uhrzeit ? " · " + String(t.uhrzeit).slice(0, 5) + " Uhr" : ""}`, RAND, y, 9.5, fR, GRAU); txt(String(t.titel || "Besichtigung"), RAND + 120, y, 9.5); if (wer) txt(wer, A4.w - RAND - 130, y, 9, fR, NAVY);
      y -= 14;
    }
    y -= 12;

    // Absagegründe
    txt("ABSAGEN UND GRÜNDE", RAND, y, 9, fB, GOLD); y -= 18;
    if (!AB.length) { absatz("Im Berichtszeitraum gab es keine Absagen von Interessenten.", 10, fR, GRAU); y -= 6; }
    for (const a of kennzahlen.absage_gruende) {
      const zeile = `${a.grund}${a.text ? " – " + a.text : ""}`;
      const ws = wrap(zeile, fR, 9.5, A4.w - 2 * RAND - 120 - 130);
      if (y - ws.length * 12 < RAND + 40) neueSeite();
      txt(dDE(a.am), RAND, y, 9, fR, GRAU); ws.forEach((l, i) => txt(l, RAND + 92, y - i * 12, 9.5)); txt(a.wer, A4.w - RAND - 130, y, 9, fR, NAVY);
      y -= ws.length * 12 + 6;
    }
    y -= 12;

    // Einschätzung
    txt("EINSCHÄTZUNG & NÄCHSTE SCHRITTE", RAND, y, 9, fB, GOLD); y -= 18;
    absatz(body.kommentar && String(body.kommentar).trim() ? String(body.kommentar).trim() : "Wir setzen die Vermarktung mit unveränderter Intensität fort und melden uns umgehend, sobald es konkrete Entwicklungen gibt. Bei Fragen erreichen Sie mich jederzeit.", 10.5); y -= 12;
    absatz("Mit freundlichen Grüßen", 10.5); y -= 6;
    absatz(`${makler?.titel ? makler.titel + " " : ""}${makler?.name || prof.name || ""}`, 10.5, fB, NAVY);
    absatz([firma?.firma_name, makler?.telefon ? "Telefon " + makler.telefon : "", makler?.email || ""].filter(Boolean).join("  ·  "), 9, fR, GRAU);

    // Fußzeilen
    seiten.forEach((p, i) => { p.drawLine({ start: { x: RAND, y: 38 }, end: { x: A4.w - RAND, y: 38 }, thickness: 0.6, color: GOLD }); p.drawText(`${firma?.firma_name || "Ihr Makler"}${firma ? ` · ${firma.strasse}, ${firma.plz} ${firma.ort}` : ""}${firma?.web ? " · " + firma.web : ""}`, { x: RAND, y: 26, size: 7.5, font: fR, color: GRAU }); p.drawText(`Seite ${i + 1} von ${seiten.length}`, { x: A4.w - RAND - 60, y: 26, size: 7.5, font: fR, color: GRAU }); });
    const bytes = await pdf.save();

    // Ablage
    const dateiName = `${new Date().toISOString().slice(0, 10)}_Vermarktungsbericht_${dDE(von).replace(/\./g, "-")}_bis_${dDE(bis).replace(/\./g, "-")}.pdf`;
    const pfad = `immobilien/${immobilieId}/berichte/${Date.now()}_${dateiName}`;
    const { error: upErr } = await db.storage.from("immobilie-dateien").upload(pfad, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;
    await db.from("immobilie_datei").insert({ immobilie_id: immobilieId, name: dateiName, titel: `Vermarktungsbericht ${dDE(von)} – ${dDE(bis)}`, doktyp: "Vermarktungsbericht", kategorie: "bericht", mime_type: "application/pdf", size_bytes: bytes.length, speicher_typ: "storage", storage_path: pfad, quelle: "eigentuemer-report", oeffentlich: false, expose_ausschliessen: true, ersteller_id: u.user.id });
    const { data: s } = await db.storage.from("immobilie-dateien").createSignedUrl(pfad, 7 * 86400, { download: dateiName });

    // Versand
    const kurz = `${kennzahlen.expose_versendet} Exposé(s) versendet, ${kennzahlen.besichtigungen_geplant} Besichtigung(en) geplant, ${kennzahlen.absagen} Absage(n)`;
    let gesendetAn: string[] = [];
    const empfaenger: string[] = Array.isArray(body.empfaenger) && body.empfaenger.length ? body.empfaenger : eigentuemer.map((e: any) => e.email).filter(Boolean);
    if (body.senden && empfaenger.length) {
      const key = Deno.env.get("RESEND_API_KEY"); if (!key) throw new Error("RESEND_API_KEY fehlt");
      const absender = makler?.email && immoEigeneAdresse(makler.email, firma?.email) ? `${makler.name} <${makler.email}>` : `${firma?.firma_name || "Ihr Makler"} <${firma?.email || immoFehlt("eine Absenderadresse (Postfach, Firmenstammdaten oder SMTP_FROM_EMAIL)")}>`;
      const text = `${eigNamen.length ? eigNamen.join(", ") : "Sehr geehrte Eigentümer"},\n\nanbei erhalten Sie den Vermarktungsbericht für Ihre Immobilie „${im.objekttitel || im.bezeichnung || adr}“ für den Zeitraum ${dDE(von)} bis ${dDE(bis)}.\n\nKurz zusammengefasst: ${kurz}.\n\n${body.kommentar ? String(body.kommentar).trim() + "\n\n" : ""}Bei Fragen erreichen Sie mich jederzeit.\n\nMit freundlichen Grüßen\n${makler?.name || prof.name || ""}\n${firma?.firma_name || ""}${makler?.telefon ? "\nTelefon " + makler.telefon : ""}`;
      let b64 = ""; for (let i = 0; i < bytes.length; i += 32768) b64 += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + 32768, bytes.length))) as any); b64 = btoa(b64);
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: absender, to: empfaenger, reply_to: makler?.email || firma?.email, subject: `Vermarktungsbericht ${dDE(von)} – ${dDE(bis)}: ${im.objekttitel || im.bezeichnung || adr}`, text, attachments: [{ filename: dateiName, content: b64, content_type: "application/pdf" }] }) });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
      gesendetAn = empfaenger;
      for (const e of eigentuemer) if (empfaenger.includes(e.email)) await db.from("aktivitaeten").insert({ zielgruppe: "eigentuemer", eigentuemer_id: e.id, typ: "bericht", titel: `Vermarktungsbericht ${dDE(von)} – ${dDE(bis)}`, text: `Ihr Makler hat Ihnen einen neuen Vermarktungsbericht gesendet: ${kurz}.`, ref_tabelle: "immobilie_datei", ref_id: null });
    }
    await db.from("vermerke").insert({ immobilie_id: immobilieId, typ: "bericht", titel: gesendetAn.length ? "Vermarktungsbericht an Eigentümer gesendet" : "Vermarktungsbericht erstellt", text: `Zeitraum ${dDE(von)} – ${dDE(bis)}: ${kurz}${gesendetAn.length ? " – gesendet an " + gesendetAn.join(", ") : ""}.`, benutzer_id: u.user.id });
    return antwort({ ok: true, storage_path: pfad, datei: dateiName, url: s?.signedUrl || null, kennzahlen, geplante_besichtigungen: geplant.length, gesendet_an: gesendetAn, eigentuemer: eigentuemer.map((e: any) => ({ name: [e.vorname, e.nachname].filter(Boolean).join(" "), email: e.email })) });
  } catch (e) {
    console.error("eigentuemer-report-pdf:", e);
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
