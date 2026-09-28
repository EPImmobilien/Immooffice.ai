// mpe-pdf-erzeugen v32 (26.09.26): Schnellpfad fuer Schriften (schnellSchrift) gegen "CPU Time exceeded" - siehe Kommentar an der Funktion.
// mpe-pdf-erzeugen v31 (25.09.26, Stufe 85 / Auftrag 8.4): Die Seite "So verteidigen wir Ihren Preis" (Einwaende & unsere
// Antworten) entfaellt im Bericht; einwandAntwort ist immer leer, Inhaltsverzeichnis und Seitenplan folgen automatisch.
// Gespeicherte daten.einwand_antwort bleiben unberuehrt. Sonst unveraendert gegenueber v30.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
PDFDocument, rgb,
pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath,
} from "npm:pdf-lib@1.17.1";
let fontkit: any = null;
try { const m = await import("npm:@pdf-lib/fontkit@1.1.1"); fontkit = m.default || m; } catch (_e) {}
// v32 (26.09.26): CPU-Schnellpfad fuer eingebettete Schriften. pdf-lib ruft fuer jedes drawText und jede
// Breitenmessung fontkit.layout() auf (volles OpenType-Shaping mit GSUB/GPOS) und nutzt davon nur glyph.id und
// glyph.advanceWidth. Bei 30 Seiten kostete das ueber 2 s reine Rechenzeit - genau das Supabase-Limit (546
// WORKER_RESOURCE_LIMIT / "CPU Time exceeded"; im Expose-Generator am 26.09. aufgetreten, hier vorbeugend). glyphsForString liefert
// dieselben Glyphen und Vorschubbreiten ohne Shaping; gemessen: Text zeichnen 2,4 s -> 0,1 s, Ausgabe identisch.
function schnellSchrift(f: any) {
  try {
    const fk = f?.embedder?.font;
    if (!fk || typeof fk.glyphsForString !== "function") return f;
    const cache = new Map<string, any>();
    fk.layout = (text: string) => {
      let r = cache.get(text);
      if (r) return r;
      const glyphs = fk.glyphsForString(text);
      r = { glyphs, positions: glyphs.map((g: any) => ({ xAdvance: g.advanceWidth, yAdvance: 0, xOffset: 0, yOffset: 0 })), script: "latn", language: null, direction: "ltr", features: {} };
      if (cache.size < 5000) cache.set(text, r);
      return r;
    };
  } catch (_e) { /* Rueckfall: normales Layout */ }
  return f;
}
const corsHeaders = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Methods": "POST, OPTIONS",
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonOk = (obj: any) => new Response(JSON.stringify({ ok: true, ...obj }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
const jsonErr = (status: number, msg: string) => new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const NAVY = rgb(0.149, 0.192, 0.349);
const NAVYD = rgb(0.102, 0.137, 0.259);
const GOLD = rgb(0.831, 0.647, 0.404);
const GOLD2 = rgb(0.690, 0.537, 0.335);
const GOLDHELL = rgb(0.831, 0.647, 0.404);
const GOLD_GEIST = rgb(0.878, 0.741, 0.502);
const INK = rgb(0.169, 0.184, 0.239);
const GRAU = rgb(0.271, 0.286, 0.333);
const GRAUH = rgb(0.420, 0.439, 0.502);
const WEISS = rgb(1, 1, 1);
const HAIR = rgb(0.847, 0.855, 0.886);
const SANFT = rgb(0.980, 0.980, 0.969);
const ROT = rgb(0.706, 0.380, 0.310);
const SILBER = rgb(0.788, 0.804, 0.855);
const W = 841.89, H = 595.28;
const num = (v: any): number | null => {
if (v == null || v === "") return null;
if (typeof v === "number") return isFinite(v) ? v : null;
let t = String(v).trim();
if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "");
t = t.replace(",", ".").replace(/[^0-9.\-]/g, "");
const n = Number(t);
return isFinite(n) ? n : null;
};
const fmtEur0 = (v: any) => { const n = num(v); return n == null ? "" : n.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €"; };
const fmtZahl = (v: any) => { const n = num(v); return n == null ? "" : n.toLocaleString("de-DE", { maximumFractionDigits: 1 }); };
const fmtQm = (v: any) => { const n = num(v); return n == null ? "" : "ca. " + n.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " m²"; };
const fmtProz = (v: any) => { const n = num(v); return n == null ? "" : n.toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " %"; };
const FONT_QUELLEN: Record<string, string> = {
"fonts/Montserrat-Light.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Light.ttf",
"fonts/Montserrat-Medium.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Medium.ttf",
"fonts/Montserrat-SemiBold.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBold.ttf",
"fonts/Montserrat-Regular.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Regular.ttf",
"fonts/Marcellus-Regular.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/marcellus/Marcellus-Regular.ttf",
"fonts/GreatVibes-Regular.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf",
};
async function fontLaden(admin: any, pfad: string): Promise<ArrayBuffer | null> {
try {
const { data } = await admin.storage.from("branding-assets").download(pfad);
if (data) return await data.arrayBuffer();
} catch (_e) {}
const quelle = FONT_QUELLEN[pfad];
if (!quelle) return null;
try {
const r = await fetch(quelle);
if (!r.ok) return null;
const buf = await r.arrayBuffer();
try { await admin.storage.from("branding-assets").upload(pfad, new Uint8Array(buf), { contentType: "font/ttf", upsert: true }); } catch (_e2) {}
return buf;
} catch (_e) { return null; }
}
const GEO_CACHE = "mpe/bundeslaender.json";
const GEO_QUELLE = "https://raw.githubusercontent.com/isellsoap/deutschlandGeoJSON/main/2_bundeslaender/3_mittel.geo.json";
async function geoLaden(admin: any): Promise<any> {
try {
const { data } = await admin.storage.from("branding-assets").download(GEO_CACHE);
if (data) return JSON.parse(await data.text());
} catch (_e) {}
try {
const r = await fetch(GEO_QUELLE, { signal: AbortSignal.timeout(20000) });
if (!r.ok) return null;
const txt = await r.text();
try { await admin.storage.from("branding-assets").upload(GEO_CACHE, new TextEncoder().encode(txt), { contentType: "application/json", upsert: true }); } catch (_e2) {}
return JSON.parse(txt);
} catch (_e) { return null; }
}
Deno.serve(async (req) => {
if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
try {
const body = await req.json();
const bewertung_id = body.bewertung_id;
if (!bewertung_id) return jsonErr(400, "bewertung_id fehlt");
const authHeader = req.headers.get("authorization");
if (!authHeader) return jsonErr(401, "Kein Auth-Token");
const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
const { data: userData, error: userErr } = await userClient.auth.getUser();
if (userErr || !userData || !userData.user) return jsonErr(401, "Nicht authentifiziert");
const { data: profil } = await admin.from("profiles").select("id,name,funktion,telefon,email,foto_url,role,firma_id,mandant_id").eq("id", userData.user.id).maybeSingle(); immoSetzeMandant(profil?.mandant_id);
if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) return jsonErr(403, "Kein Teamzugang");
const { data: bew, error: bErr } = await admin.from("bewertungen").select("*").eq("id", bewertung_id).maybeSingle();
if (bErr) throw bErr;
if (!bew) return jsonErr(404, "Bewertung nicht gefunden");
const d = bew.daten || {};
const warnungen: string[] = [];
if ((body.modus || "") === "gutachten-lesen") {
const key = Deno.env.get("ANTHROPIC_API_KEY");
if (!key) return jsonErr(500, "ANTHROPIC_API_KEY nicht gesetzt");
const pfad = String(body.pfad || "").trim();
if (!pfad) return jsonErr(422, "Kein Gutachten angegeben.");
const { data: datei } = await admin.storage.from("bewertungen").download(pfad);
if (!datei) return jsonErr(422, "Gutachten nicht ladbar.");
const roh = new Uint8Array(await datei.arrayBuffer());
if (roh.length > 24 * 1024 * 1024) return jsonErr(413, "Gutachten zu groß (max. 24 MB).");
let b64 = "";
for (let i = 0; i < roh.length; i += 8192) b64 += String.fromCharCode(...roh.subarray(i, i + 8192));
b64 = btoa(b64);
const prompt = "Das PDF ist ein Immobilien-Wertermittlungsgutachten (z. B. von einem Bewertungsdienst). "
+ "Extrahiere die Wertermittlung, also den Rechenweg, der zum Ergebnis führt.\n\n"
+ "Antworte AUSSCHLIESSLICH mit JSON, ohne Markdown:\n"
+ '{"verfahren":"Sachwertverfahren|Ertragswertverfahren|Vergleichswertverfahren","ergebnis":397000,'
+ '"posten":[{"titel":"Bodenwert","detail":"582 m2 x 300 EUR/m2","betrag":174600,"negativ":false}],'
+ '"argumente":["..."],"stichtag":"01.01.2026"}\n\n'
+ "Regeln:\n"
+ "- posten = die Zwischenschritte der Rechnung in der Reihenfolge des Gutachtens (Bodenwert, Gebäudesachwert, "
+ "Alterswertminderung, bauliche Außenanlagen, Marktanpassung/Sachwertfaktor; beim Ertragswert: Rohertrag, "
+ "Bewirtschaftungskosten, Reinertrag, Bodenwertverzinsung, Gebäudeertragswert). Maximal 6 Posten.\n"
+ "- betrag = Zahl in Euro ohne Trennzeichen. negativ=true bei Abzügen (z. B. Alterswertminderung).\n"
+ "- detail = die Rechengrundlage aus dem Gutachten in wenigen Worten.\n"
+ "- ergebnis = der ermittelte Verkehrs-/Marktwert.\n"
+ "- argumente = bis zu 4 kurze Sätze aus dem Gutachten, die den Wert begründen (Lage, Zustand, Ausstattung).\n"
+ "- Erfinde nichts. Was nicht im Gutachten steht, lässt du weg.";
const r = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
body: JSON.stringify({
model: "claude-sonnet-4-6", max_tokens: 3000,
messages: [{ role: "user", content: [
{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
{ type: "text", text: prompt },
] }],
}),
});
if (!r.ok) return jsonErr(502, "KI-Anfrage fehlgeschlagen (" + r.status + ")");
const j = await r.json();
const txt = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
let erg: any = null;
try { erg = JSON.parse(txt.replace(/```json|```/g, "").trim()); } catch (_e) { return jsonErr(422, "KI-Antwort nicht lesbar."); }
const posten = (Array.isArray(erg && erg.posten) ? erg.posten : []).slice(0, 6)
.map((p: any) => ({
titel: String(p.titel || "").slice(0, 60),
detail: String(p.detail || "").slice(0, 90),
betrag: Number(p.betrag),
negativ: !!p.negativ,
}))
.filter((p: any) => p.titel && isFinite(p.betrag));
if (!posten.length) return jsonErr(422, "Im Gutachten war keine Wertermittlung erkennbar.");
const argumente = (Array.isArray(erg.argumente) ? erg.argumente : []).slice(0, 4).map((a: any) => String(a).slice(0, 180));
const neueDaten: any = { ...d, herleitung: posten, herleitung_quelle: String(body.titel || "Wertermittlungsgutachten").slice(0, 80) };
if (erg.verfahren) neueDaten.verfahren = String(erg.verfahren).slice(0, 40);
// realistisches_volumen wird bewusst NICHT aus dem Gutachten gezogen: das Gutachten ist nur die Angebots-/Vergleichspreis-Grundlage; der realistisch erzielbare Wert bleibt eine eigene, manuell gesetzte Einschaetzung
if (argumente.length && !(Array.isArray(d.preis_argumente) && d.preis_argumente.length)) neueDaten.preis_argumente = argumente;
const { error: uErr } = await admin.from("bewertungen").update({ daten: neueDaten }).eq("id", bewertung_id);
if (uErr) throw uErr;
return jsonOk({ posten, verfahren: neueDaten.verfahren || "", ergebnis: erg.ergebnis || null, argumente });
}
if ((body.modus || "") === "preistrend-lesen") {
const key = Deno.env.get("ANTHROPIC_API_KEY");
if (!key) return jsonErr(500, "ANTHROPIC_API_KEY nicht gesetzt");
const pfad = String(body.bild_pfad || d.preisentwicklung_bild_data || "").trim();
if (!pfad) return jsonErr(422, "Kein Diagramm-Screenshot hinterlegt.");
const { data: datei } = await admin.storage.from("bewertungen").download(pfad);
if (!datei) return jsonErr(422, "Screenshot nicht ladbar.");
const roh = new Uint8Array(await datei.arrayBuffer());
let b64 = "";
for (let i = 0; i < roh.length; i += 8192) b64 += String.fromCharCode(...roh.subarray(i, i + 8192));
b64 = btoa(b64);
const mt = pfad.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const prompt = "Das Bild zeigt ein Diagramm zur Immobilien-Preisentwicklung (z. B. von ImmoScout24). "
+ "Lies die Datenpunkte der Kurve(n) so genau wie moeglich ab.\n\n"
+ "Antworte AUSSCHLIESSLICH mit JSON, ohne Markdown:\n"
+ '[{"titel":"...","quelle":"...","einheit":"EUR/m2","punkte":[{"x":"Q1\'24","y":2592}]}]\n\n'
+ "Regeln:\n- Maximal 2 Serien. Jede Serie mit allen erkennbaren Punkten in zeitlicher Reihenfolge.\n"
+ "- x = kurzes Label der Zeitachse, y = Zahl ohne Tausenderpunkt.\n"
+ "- titel = die Bezeichnung der Kurve aus der Legende.\n"
+ "- quelle = Quelle/Stand, falls im Bild erkennbar, sonst leer.\n"
+ "- Erfinde nichts. Wenn kein Diagramm erkennbar ist, antworte mit [].";
const r = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
body: JSON.stringify({
model: "claude-sonnet-4-6", max_tokens: 2000,
messages: [{ role: "user", content: [
{ type: "image", source: { type: "base64", media_type: mt, data: b64 } },
{ type: "text", text: prompt },
] }],
}),
});
if (!r.ok) return jsonErr(502, "KI-Anfrage fehlgeschlagen (" + r.status + ")");
const j = await r.json();
const txt = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
let serien: any[] = [];
try { serien = JSON.parse(txt.replace(/```json|```/g, "").trim()); } catch (_e) { return jsonErr(422, "KI-Antwort nicht lesbar."); }
serien = (Array.isArray(serien) ? serien : []).slice(0, 2)
.map((se: any) => ({
titel: String(se.titel || "Preistrend").slice(0, 60),
quelle: String(se.quelle || "").slice(0, 90),
einheit: String(se.einheit || "€/m²").replace("EUR/m2", "€/m²").slice(0, 12),
punkte: (Array.isArray(se.punkte) ? se.punkte : [])
.map((p: any) => ({ x: String(p.x || "").slice(0, 10), y: Number(p.y) }))
.filter((p: any) => p.x && isFinite(p.y)),
}))
.filter((se: any) => se.punkte.length > 1);
if (!serien.length) return jsonErr(422, "Im Screenshot war kein auswertbares Diagramm erkennbar.");
const neu = { ...d, preistrend: serien };
await admin.from("bewertungen").update({ daten: neu }).eq("id", bewertung_id);
return jsonOk({ preistrend: serien });
}
let ap: any = profil;
if (d.ansprechpartner_id && d.ansprechpartner_id !== profil.id) {
const { data } = await admin.from("profiles").select("id,name,funktion,telefon,email,foto_url,firma_id").eq("id", d.ansprechpartner_id).maybeSingle();
if (data) ap = data;
}
let firma: any = null;
if (ap.firma_id) { const { data } = await admin.from("firma_stammdaten").select("*").eq("id", ap.firma_id).eq("aktiv", true).maybeSingle(); firma = data; }
if (!firma) { const { data } = await admin.from("firma_stammdaten").select("*").eq("aktiv", true).order("sortierung").limit(1).maybeSingle(); firma = data; }
if (!firma) return jsonErr(500, "Firma-Stammdaten fehlen");
let standorte: any[] = [];
{ const { data } = await admin.from("firma_stammdaten").select("firma_name,strasse,plz,ort,sortierung").eq("aktiv", true).order("sortierung"); standorte = data || []; }
let kz: any = null;
{ const { data } = await admin.from("firma_kennzahlen").select("*").eq("aktiv", true).order("jahr", { ascending: false }).limit(1).maybeSingle(); kz = data; }
const pdf = await PDFDocument.create();
if (fontkit) { try { pdf.registerFontkit(fontkit); } catch (_e) {} }
pdf.setTitle("Marktpreiseinschaetzung " + (bew.titel || ""));
const lade = (p: string) => fontLaden(admin, p);
const fb = await Promise.all([
lade("fonts/Montserrat-Regular.ttf"), lade("fonts/Montserrat-Light.ttf"), lade("fonts/Montserrat-Medium.ttf"),
lade("fonts/Montserrat-SemiBold.ttf"), lade("fonts/Marcellus-Regular.ttf"), lade("fonts/GreatVibes-Regular.ttf"),
]);
if (!fb[0] || !fb[4]) return jsonErr(500, "Basis-Fonts fehlen in branding-assets");
const emb = async (b: ArrayBuffer) => schnellSchrift(await pdf.embedFont(b, { subset: false }));
const fR = await emb(fb[0]);
const fL = fR;
const fM = fb[2] ? await emb(fb[2]) : fR;
const fSB = fb[3] ? await emb(fb[3]) : fR;
const fMarc = await emb(fb[4]);
const fScript = fb[5] ? await emb(fb[5]) : fMarc;
let logoNavy: any = null, logoWeiss: any = null;
try { const { data } = await admin.storage.from("branding-assets").download("logo.png"); if (data) logoNavy = await pdf.embedPng(await data.arrayBuffer()); } catch (_e) {}
try { const { data } = await admin.storage.from("branding-assets").download("expose/logo-weiss-v2.png"); if (data) logoWeiss = await pdf.embedPng(await data.arrayBuffer()); } catch (_e) {}
if (!logoWeiss) logoWeiss = logoNavy;
let page: any = null;
const SZ = (n: number) => (n >= 5 && n <= 10.5) ? Math.round(n * 1.12 * 100) / 100 : n;
const wCache = new Map<any, Map<string, number>>();
function charW(f: any, ch: string) {
let m = wCache.get(f);
if (!m) { m = new Map(); wCache.set(f, m); }
let w = m.get(ch);
if (w == null) { w = f.widthOfTextAtSize(ch, 1000); m.set(ch, w); }
return w;
}
const breite = (s: string, f: any, size: number, cs = 0) => { let t = 0; for (const ch of (s || "")) t += charW(f, ch); return t * SZ(size) / 1000 + cs * Math.max(0, (s || "").length - 1); };
function text(s: string, x: number, y: number, f: any, size: number, farbe: any, cs = 0, align = "l") {
s = s == null ? "" : String(s);
if (!s) return 0;
const S = SZ(size);
const tw = breite(s, f, size, cs);
let cx = align === "c" ? x - tw / 2 : align === "r" ? x - tw : x;
if (cs > 0.01) { for (const ch of s) { page.drawText(ch, { x: cx, y, size: S, font: f, color: farbe }); cx += charW(f, ch) * S / 1000 + cs; } }
else page.drawText(s, { x: cx, y, size: S, font: f, color: farbe });
return tw;
}
function wrapT(s: string, f: any, size: number, maxw: number): string[] {
const out: string[] = [];
const spaceW = charW(f, " ") * SZ(size) / 1000;
for (const absatz of (s || "").split(/\r?\n/)) {
if (!absatz.trim()) { out.push(""); continue; }
let zeile = "", zeileW = 0;
for (const w2 of absatz.split(/\s+/).filter(Boolean)) {
const wW = breite(w2, f, size);
const neuW = zeile ? zeileW + spaceW + wW : wW;
if (neuW > maxw && zeile) { out.push(zeile); zeile = w2; zeileW = wW; } else { zeile = zeile ? zeile + " " + w2 : w2; zeileW = neuW; }
}
if (zeile) out.push(zeile);
}
return out;
}
function para(s: string, x: number, y: number, maxw: number, f = fL, size = 8.8, lh = 12.5, farbe = GRAU) {
for (const z of wrapT(s, f, size, maxw)) { if (z) text(z, x, y, f, size, farbe); y -= lh; }
return y;
}
const hline = (x0: number, y: number, x1: number, farbe = HAIR, dicke = 0.7) => page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: dicke, color: farbe });
const vline = (x: number, y0: number, y1: number, farbe = HAIR, dicke = 0.7) => page.drawLine({ start: { x, y: y0 }, end: { x, y: y1 }, thickness: dicke, color: farbe });
const raute = (x: number, y: number, s = 2.4, farbe = GOLD) => page.drawSvgPath("M 3 0 L 6 3 L 3 6 L 0 3 Z", { x: x - s, y: y + s, color: farbe, scale: s / 3 });
function bildCover(img: any, x: number, y: number, w2: number, h2: number, fx = 0.5, fy = 0.5) {
if (!img) { page.drawRectangle({ x, y, width: w2, height: h2, color: rgb(0.93, 0.93, 0.92) }); return; }
const s = Math.max(w2 / img.width, h2 / img.height);
const dw = img.width * s, dh = img.height * s;
page.pushOperators(pushGraphicsState(), moveTo(x, y), lineTo(x + w2, y), lineTo(x + w2, y + h2), lineTo(x, y + h2), closePath(), clip(), endPath());
page.drawImage(img, { x: x - (dw - w2) * fx, y: y - (dh - h2) * (1 - fy), width: dw, height: dh });
page.pushOperators(popGraphicsState());
}
const CRCT: number[] = [];
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRCT[n] = c >>> 0; }
const crc32 = (b: Uint8Array) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(typ: string, daten: Uint8Array) {
const out = new Uint8Array(12 + daten.length);
const dv = new DataView(out.buffer);
dv.setUint32(0, daten.length);
for (let i = 0; i < 4; i++) out[4 + i] = typ.charCodeAt(i);
out.set(daten, 8);
dv.setUint32(8 + daten.length, crc32(out.subarray(4, 8 + daten.length)));
return out;
}
async function rampPng(n: number, r0: number, g0: number, b0: number, a0: number, a1: number) {
const roh = new Uint8Array(n * 5);
for (let r = 0; r < n; r++) {
const o = r * 5;
roh[o] = 0; roh[o + 1] = r0; roh[o + 2] = g0; roh[o + 3] = b0;
roh[o + 4] = Math.round(255 * (a0 + (a1 - a0) * (r / (n - 1))));
}
const cs = new CompressionStream("deflate");
const wr = cs.writable.getWriter();
wr.write(roh); wr.close();
const komp = new Uint8Array(await new Response(cs.readable).arrayBuffer());
const ihdr = new Uint8Array(13);
const dv = new DataView(ihdr.buffer);
dv.setUint32(0, 1); dv.setUint32(4, n);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const c1 = chunk("IHDR", ihdr), c2 = chunk("IDAT", komp), c3 = chunk("IEND", new Uint8Array(0));
const png = new Uint8Array(sig.length + c1.length + c2.length + c3.length);
let p = 0;
for (const t of [sig, c1, c2, c3]) { png.set(t, p); p += t.length; }
return png;
}
let rampImg: any = null;
try { rampImg = await pdf.embedPng(await rampPng(256, 26, 35, 66, 0, 0.95)); } catch (_e) {}
function verlauf(x: number, y: number, w2: number, h2: number, a0: number, a1: number, stufen = 120) {
if (rampImg) { page.drawImage(rampImg, { x, y, width: w2, height: h2 }); return; }
for (let i = 0; i < stufen; i++) {
const t = i / (stufen - 1);
page.drawRectangle({ x, y: y + h2 - (i + 1) * h2 / stufen, width: w2, height: h2 / stufen + 0.35, color: NAVYD, opacity: a0 + (a1 - a0) * t });
}
}
let seiteNr = 0;
function neueSeite(navy = false) {
page = pdf.addPage([W, H]);
page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: navy ? NAVY : WEISS });
seiteNr++;
}
function logoOben(dark = false) {
const l = dark ? logoWeiss : logoNavy;
if (!l) return;
const r = l.height / l.width;
let lw = 118, lh = lw * r;
if (lh > 48) { lh = 48; lw = lh / r; }
page.drawImage(l, { x: W - 70 - lw, y: H - 86 - lh * 0.25, width: lw, height: lh });
}
function kopf(tag: string, headline: string, dark = false) {
text((tag || "").toUpperCase(), 70, H - 78, fSB, 9, dark ? GOLDHELL : GOLD, 2.2);
page.drawRectangle({ x: 70, y: H - 88, width: 38, height: 1.4, color: GOLD });
let gr = 26;
let zeilen = wrapT(headline, fMarc, gr, W - 210);
while (zeilen.length > 1 && gr > 18) { gr -= 1; zeilen = wrapT(headline, fMarc, gr, W - 210); }
text(zeilen[0] || "", 70, H - 121, fMarc, gr, dark ? WEISS : NAVY, 0.3);
logoOben(dark);
}
function footer(dark = false) {
hline(60, 42, W - 60, GOLD, 0.7);
text("MUSTERHAUS IMMOBILIEN", 60, 30, fL, 7.5, dark ? rgb(0.776, 0.796, 0.863) : GRAU, 0.4);
text("MARKTORIENTIERTE PREISEINSCHÄTZUNG   ·   " + String(seiteNr).padStart(2, "0"), W - 60, 30, fL, 7.5, dark ? rgb(0.776, 0.796, 0.863) : GRAU, 0.4, "r");
}
const brandCache = new Map<string, any>();
async function brandBild(pfad: string) {
if (brandCache.has(pfad)) return brandCache.get(pfad);
try {
const { data } = await admin.storage.from("branding-assets").download(pfad);
if (!data) return null;
const buf = await data.arrayBuffer();
const img = pfad.toLowerCase().endsWith(".png") ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
brandCache.set(pfad, img);
return img;
} catch (_e) { brandCache.set(pfad, null); return null; }
}
const bildCache = new Map<string, any>();
async function bild(pfad: any) {
const p = String(pfad || "").trim();
if (!p) return null;
if (bildCache.has(p)) return bildCache.get(p);
try {
let buf: ArrayBuffer | null = null;
// JPEG reicht pdf-lib unveraendert durch; ein PNG muss es komplett entpacken
// und neu packen. Das kostet CPU im Verhaeltnis zur Pixelzahl und hat die
// Funktion am 02.09.2026 an einem 2,3-MB-PNG abgeschossen (CPU Time
// exceeded). Fuer PNG deshalb deutlich kleiner anfordern.
const istPngPfad = p.toLowerCase().endsWith(".png");
const kante = istPngPfad ? 1100 : 1600;
try {
const { data, error } = await admin.storage.from("bewertungen").download(p, {
transform: { width: kante, height: kante, resize: "contain", quality: 75, format: "origin" },
});
if (!error && data) buf = await data.arrayBuffer();
} catch (_e) {}
if (!buf) {
const { data } = await admin.storage.from("bewertungen").download(p);
if (!data) return null;
buf = await data.arrayBuffer();
}
const istPng = p.toLowerCase().endsWith(".png");
// Sicherheitsnetz: greift der Transform nicht (Fallback auf das Original),
// koennte ein riesiges PNG die Funktion wieder killen. Breite und Hoehe
// stehen im IHDR ab Byte 16 — lieber ein Bild weniger als gar kein PDF.
if (istPng && buf.byteLength > 24) {
const v = new DataView(buf);
const px = v.getUint32(16) * v.getUint32(20);
if (px > 2000000) {
warnungen.push("Bild uebersprungen, PNG zu gross (" + (px / 1e6).toFixed(1) + " Megapixel): " + p);
bildCache.set(p, null);
return null;
}
}
const img = istPng ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
bildCache.set(p, img);
return img;
} catch (_e) {
warnungen.push("Bild nicht ladbar: " + p);
return null;
}
}
async function apFoto() {
const v = String(ap.foto_url || "").trim();
if (!v) return null;
try {
if (/^https?:\/\//i.test(v)) {
const r = await fetch(v);
if (!r.ok) return null;
const buf = await r.arrayBuffer();
return v.toLowerCase().includes(".png") ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
}
const { data } = await admin.storage.from("profile-fotos").download(v, { transform: { width: 800, height: 1200, resize: "contain", quality: 80, format: "origin" } });
if (!data) return null;
const buf = await data.arrayBuffer();
return v.toLowerCase().endsWith(".png") ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
} catch (_e) { return null; }
}
const adresse = String(d.adresse || bew.titel || "").trim();
const ortZeile = [d.plz, d.ort].filter(Boolean).join(" ").trim();
const marktwert = num(d.realistisches_volumen);
const angebot = num(d.angebotspreis);
const wohnflaeche = num(d.wohnflaeche);
const aufschlag = (marktwert && angebot) ? (angebot / marktwert - 1) * 100 : null;
const vos: any[] = Array.isArray(d.vergleichsobjekte) ? d.vergleichsobjekte.filter((v: any) => v && (v.preis || v.wohnflaeche)) : [];
for (const v of vos) {
const p = num(v.preis), wf = num(v.wohnflaeche);
v._qm = num(v.preis_qm_manuell) ?? (p && wf ? p / wf : null);
}
const qmWerte = vos.map((v: any) => v._qm).filter((x: any) => x != null) as number[];
const qmSchnitt = qmWerte.length ? qmWerte.reduce((a, b) => a + b, 0) / qmWerte.length : null;
const eigenQm = (angebot && wohnflaeche) ? angebot / wohnflaeche : null;
const alsListe = (v: any, frei: any) => {
const arr = Array.isArray(v) ? v.map((x: any) => String(x).trim()).filter(Boolean) : [];
const f = String(frei || "").trim();
if (f) for (const z of f.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean)) arr.push(z);
return arr;
};
const vorteile = alsListe(d.vorteile, d.vorteile_freitext);
const nachteile = alsListe(d.nachteile, d.nachteile_freitext);
const zielgruppen = alsListe(d.zielgruppen, d.zielgruppen_freitext);
const preisArgumente: string[] = Array.isArray(d.preis_argumente) ? d.preis_argumente.map((s: any) => String(s).trim()).filter(Boolean) : [];
const einwandAntwort: any[] = [];   // v31 (Auftrag 8.4): "Einwaende & unsere Antworten" nicht mehr im Bericht; d.einwand_antwort bleibt gespeichert
const preistrend: any[] = Array.isArray(d.preistrend) ? d.preistrend.filter((s: any) => s && Array.isArray(s.punkte) && s.punkte.length > 1) : [];
const naechsteSchritte: any[] = Array.isArray(d.naechste_schritte) && d.naechste_schritte.length ? d.naechste_schritte : [
{ titel: "Klärung offener Fragen", text: "Wir besprechen Ihre Rückfragen zu Preis, Strategie und Ablauf." },
{ titel: "Vermarktungsauftrag", text: "Sie erteilen den Alleinauftrag – wir bereiten Ihre Immobilie optimal auf." },
{ titel: "Start der Vermarktung", text: "Ansprache vorgemerkter Käufer und Veröffentlichung auf allen Kanälen." },
];
const unterlagen: any[] = Array.isArray(d.unterlagen) && d.unterlagen.length ? d.unterlagen : [
{ gruppe: "Objekt & Eigentum", titel: "Grundbuchauszug (aktuell)", ep: true },
{ gruppe: "Objekt & Eigentum", titel: "Flurkarte / Lageplan", ep: true },
{ gruppe: "Objekt & Eigentum", titel: "Grundrisse aller Geschosse", ep: false },
{ gruppe: "Objekt & Eigentum", titel: "Wohn- und Nutzflächenberechnung", ep: false },
{ gruppe: "Objekt & Eigentum", titel: "Baugenehmigung / Bauakte", ep: true },
{ gruppe: "Technik & Energie", titel: "Energieausweis", ep: true },
{ gruppe: "Technik & Energie", titel: "Nachweise der Modernisierungen", ep: false },
{ gruppe: "Technik & Energie", titel: "Wartungsnachweise Heizung", ep: false },
{ gruppe: "Technik & Energie", titel: "Verbrauchsabrechnungen (3 Jahre)", ep: false },
{ gruppe: "Kosten & Nutzung", titel: "Grundsteuerbescheid", ep: false },
{ gruppe: "Kosten & Nutzung", titel: "Versicherungsnachweis Gebäude", ep: false },
{ gruppe: "Kosten & Nutzung", titel: "Erschließungs- und Anliegerkosten", ep: true },
];
const studieJahr = String(d.studie_jahr || "2023").trim();
const swBrw = num(d.sw_bodenrichtwert), swBgf = num(d.sw_bgf);
const grundstueck = num(d.grundstuecksflaeche);
const bodenwert = (swBrw && grundstueck) ? swBrw * grundstueck : null;
const hatSachwert = !!(bodenwert && swBgf);
const ewMonatsmiete = num(d.ew_monatsmiete);
const hatErtragswert = !!(ewMonatsmiete && ewMonatsmiete > 0);
const verfahren = String(d.verfahren || "").trim();
const gelesen: any[] = Array.isArray(d.herleitung) ? d.herleitung.filter((p: any) => p && p.titel && isFinite(Number(p.betrag))) : [];
const hatHerleitung = gelesen.length > 0 || hatSachwert || (qmSchnitt != null && marktwert != null);
// ---- Freie Seiten (Baukasten): aus daten.seiten[] + Standard-Bausteinen ----
let bausteine: any[] = [];
{ const { data } = await admin.from("mpe_bausteine").select("*").eq("aktiv", true).order("sortierung"); bausteine = data || []; }
const bausteineAus: string[] = Array.isArray(d.bausteine_aus) ? d.bausteine_aus.map(String) : [];
const eigene: any[] = Array.isArray(d.seiten) ? d.seiten.filter((p: any) => p && (p.titel || p.bild_data || p.inhalt)) : [];
const gewaehlt: string[] = Array.isArray(d.bausteine) ? d.bausteine.map(String) : [];
const ausBaustein = bausteine
.filter((b: any) => (b.standard || gewaehlt.includes(String(b.id))) && !bausteineAus.includes(String(b.id)))
.map((b: any) => ({ layout: b.layout, tag: b.tag, titel: b.titel, inhalt: b.inhalt, bild_pfad: b.bild_pfad, quelle: b.quelle, nach: b.nach }));
const freie: any[] = [...ausBaustein, ...eigene];
async function freieSeiten(ankerKey: string) {
for (const p of freie.filter((x: any) => String(x.nach || "vergleich") === ankerKey)) {
const img = p.bild_pfad ? await brandBild(String(p.bild_pfad)) : (p.bild_data ? await bild(p.bild_data) : null);
if ((p.layout === "bild" || p.layout === "bild-text") && !img) {
warnungen.push("Seite \"" + (p.titel || "") + "\" übersprungen – Bild fehlt.");
continue;
}
neueSeite();
kopf(String(p.tag || "Objektanalyse"), String(p.titel || ""));
const zeilen = String(p.inhalt || "").split(/\r?\n/).map((z: string) => z.trim()).filter(Boolean);
const oben = H - 158, unten = p.quelle ? 78 : 62;
if (p.layout === "bild") {
const bw4 = W - 140, bh4 = oben - unten;
const sk = Math.min(bw4 / img.width, bh4 / img.height);
const iw = img.width * sk, ih = img.height * sk;
page.drawImage(img, { x: 70 + (bw4 - iw) / 2, y: unten + (bh4 - ih) / 2, width: iw, height: ih });
} else if (p.layout === "bild-text") {
const bw4 = (W - 140 - 34) * 0.5, bh4 = oben - 84;
bildCover(img, 70, 84, bw4, bh4);
const tx = 70 + bw4 + 34, tw = W - 70 - tx;
let ty2 = oben - 12;
for (const z of zeilen) {
if (z.startsWith("-")) {
const t2 = z.replace(/^-\s*/, "");
raute(tx + 5, ty2 + 3, 2.2);
for (const zz of wrapT(t2, fL, 9.4, tw - 18)) { text(zz, tx + 16, ty2, fL, 9.4, NAVY, 0.15); ty2 -= 13; }
ty2 -= 8;
} else ty2 = para(z, tx, ty2, tw, fL, 9.4, 13.5, GRAU) - 8;
if (ty2 < 90) break;
}
} else {
const spW = (W - 140 - 44) / 2;
const hoch = (z: string) => z.startsWith("-") ? wrapT(z.replace(/^-\s*/, ""), fL, 9.6, spW - 18).length * 13.5 + 8 : wrapT(z, fL, 9.6, spW).length * 13.8 + 8;
const gesamt = zeilen.reduce((a: number, z: string) => a + hoch(z), 0);
let grenze = gesamt / 2, lauf = 0, teil = zeilen.length;
for (let i = 0; i < zeilen.length; i++) { lauf += hoch(zeilen[i]); if (lauf >= grenze) { teil = i + 1; break; } }
const spalten = gesamt > (oben - 90) ? [zeilen.slice(0, teil), zeilen.slice(teil)] : [zeilen, []];
spalten.forEach((sp: string[], si: number) => {
const tx = 70 + si * (spW + 44);
let ty2 = oben - 12;
for (const z of sp) {
if (z.startsWith("-")) {
const t2 = z.replace(/^-\s*/, "");
raute(tx + 5, ty2 + 3, 2.2);
for (const zz of wrapT(t2, fL, 9.6, spW - 18)) { text(zz, tx + 16, ty2, fL, 9.6, NAVY, 0.15); ty2 -= 13.5; }
ty2 -= 8;
} else ty2 = para(z, tx, ty2, spW, fL, 9.6, 13.8, GRAU) - 8;
if (ty2 < 80) break;
}
});
}
if (p.quelle) text("Quelle: " + String(p.quelle), 70, 58, fL, 6.8, GRAUH, 0.2);
footer();
}
}
const plan: string[] = ["cover", "inhalt", "div1", "buero", "gebiet"];
const hatKZ = !!(kz && (kz.erzielungsquote || kz.google_anzahl || d.vorgemerkte_interessenten));
if (hatKZ) plan.push("beweise");
plan.push("div2", "rahmen");
if (vorteile.length || nachteile.length || zielgruppen.length) plan.push("merkmale");
if (vos.length) plan.push("vergleich");
if (preistrend.length || d.preisentwicklung_bild_data) plan.push("trend");
if (hatHerleitung) plan.push("herleitung");
plan.push("empfehlung");
if (marktwert) plan.push("startpreis");
if (einwandAntwort.length) plan.push("einwaende");
const finKp = num(d.fin_kaufpreis) || angebot || marktwert;
const pz = (v: any, std: number) => { const n = num(v); return n == null ? std : n; };
const finGrunderwerbP = pz(d.fin_grunderwerb, 6.5), finNotarP = pz(d.fin_notar, 2.0), finProvP = pz(d.fin_provision, 3.57);
const finSonst = num(d.fin_sonstiges) || 0;
const finGrunderwerbB = num(d.fin_grunderwerb_betrag) || (finKp ? finKp * finGrunderwerbP / 100 : 0);
const finNotarB = num(d.fin_notar_betrag) || (finKp ? finKp * finNotarP / 100 : 0);
const finProvB = num(d.fin_provision_betrag) || (finKp ? finKp * finProvP / 100 : 0);
const finGesamt = num(d.fin_gesamtaufwand) || (finKp ? finKp + finGrunderwerbB + finNotarB + finProvB + finSonst : 0);
const finEk = num(d.fin_eigenkapital) || 0;
const finDarlehen = num(d.fin_darlehen) || Math.max(finGesamt - finEk, 0);
const finZins = pz(d.fin_zinssatz, 3.5), finTilg = pz(d.fin_tilgung, 2.0);
const finRate = num(d.fin_monatsrate) || (finDarlehen * (finZins + finTilg) / 100 / 12);
let finJahre = num(d.fin_laufzeit_jahre);
if (!finJahre && finDarlehen > 0 && finTilg > 0) {
const q = 1 + finZins / 100, r = (finZins + finTilg) / 100;
finJahre = Math.log(r / (r - finZins / 100)) / Math.log(q);
}
if (finKp) plan.push("finanzierung");
plan.push("div3", "aufbereitung", "massnahmen", "fahrplan");
if (num(d.courtage_verkaeufer) || num(d.courtage_kaeufer)) plan.push("courtage");
plan.push("leistung", "unterlagen", "schritte", "schluss");
const sn = (k: string) => String(plan.indexOf(k) + 1).padStart(2, "0");
neueSeite();
const hb = await bild(d.hauptbild_data);
bildCover(hb, 0, 0, W, H, 0.5, 0.45);
verlauf(0, 0, W, H * 0.66, 0, 0.95);
if (logoWeiss) {
const r = logoWeiss.height / logoWeiss.width;
const lw = 120;
page.drawImage(logoWeiss, { x: W - 60 - lw, y: 40, width: lw, height: lw * r });
}
text("MARKTORIENTIERTE PREISEINSCHÄTZUNG IHRER IMMOBILIE", 70, 190, fSB, 9.5, GOLDHELL, 2.4);
{
const t1 = adresse + (ortZeile ? ", " : "");
const t2 = ortZeile + ".";
let gr = 40;
while (breite(t1, fMarc, gr, 0.4) + breite(t2, fMarc, gr, 0.4) > W - 220 && gr > 20) gr -= 1;
const w1 = text(t1, 70, 134, fMarc, gr, WEISS, 0.4);
text(t2, 70 + w1 + 4, 134, fMarc, gr, GOLDHELL, 0.4);
}
page.drawRectangle({ x: 70, y: 110, width: 120, height: 1.4, color: GOLD });
const metaTeile = [d.objektart, wohnflaeche ? fmtQm(wohnflaeche) + " Wohnfläche" : "", grundstueck ? fmtQm(grundstueck) + " Grundstück" : ""].filter(Boolean);
text(metaTeile.join("   ·   "), 70, 84, fL, 10, rgb(0.910, 0.918, 0.949), 0.3);
neueSeite();
kopf("Ihre Unterlage im Überblick", "Inhalt.");
const toc: Array<[string, string, string]> = [];
toc.push(["01", "Musterhaus Immobilien GmbH", "Daten & Fakten  ·  Vertriebsgebiet" + (hatKZ ? "  ·  Warum mit uns" : "")]);
toc.push(["02", "Fundierte Preisermittlung", ["Eckdaten", vos.length ? "Vergleichsobjekte" : "", hatHerleitung ? "Preisherleitung" : "", "Kaufpreisempfehlung"].filter(Boolean).join("  ·  ")]);
if (marktwert || einwandAntwort.length) toc.push(["03", "Preisstrategie", ["Warum der Startpreis entscheidet", einwandAntwort.length ? "Verteidigung Ihres Preises" : "", num(d.fin_kaufpreis) ? "Finanzierung" : ""].filter(Boolean).join("  ·  ")]);
toc.push(["04", "Professionelle Vermarktung", "Objektaufbereitung  ·  Exklusivmandat  ·  Vermarktungsfahrplan"]);
toc.push(["05", "Service & nächste Schritte", "Courtage  ·  Unterlagen  ·  Weiteres Vorgehen"]);
let ty = H - 175;
for (const t of toc) {
text(t[0], 70, ty, fMarc, 17, GOLD);
text(t[1], 112, ty, fMarc, 15, NAVY, 0.2);
text(t[2], 112, ty - 15, fL, 8.5, GRAU, 0.2);
ty -= 34;
hline(112, ty + 10, 470);
ty -= 26;
}
const cw = 268, chh = 380, cx = W - 70 - cw, cy = 70;
page.drawRectangle({ x: cx, y: cy, width: cw, height: chh, color: NAVY });
const apImg = await apFoto();
const fotoH = 140;
if (apImg) bildCover(apImg, cx, cy + chh - fotoH, cw, fotoH, 0.5, 0.12);
else warnungen.push("Kein Profilfoto beim Ansprechpartner hinterlegt.");
const kontakt: Array<[string, string]> = [
["TELEFON", ap.telefon || firma.telefon || ""],
["E-MAIL", ap.email || firma.email || ""],
["WEB", String(firma.web || "www.immooffice.example").replace(/^https?:\/\//, "")],
["ADRESSE", [firma.firma_name, firma.strasse, (firma.plz || "") + " " + (firma.ort || "")].filter(Boolean).join(" · ")],
].filter((k) => k[1]) as Array<[string, string]>;
{
const kx = cx + 24, kw = cw - 48;
let ky = cy + chh - fotoH - 24;
text("IHR ANSPRECHPARTNER", kx, ky, fSB, 7.5, GOLDHELL, 1.6);
ky -= 22;
text(ap.name || "", kx, ky, fMarc, 15, WEISS, 0.3);
ky -= 14;
for (const z of wrapT(String(ap.funktion || ""), fL, 8.2, kw)) { text(z, kx, ky, fL, 8.2, rgb(0.788, 0.808, 0.867), 0.2); ky -= 11; }
ky -= 6;
page.drawRectangle({ x: kx, y: ky, width: 28, height: 1.2, color: GOLD });
ky -= 22;
const zeilenJe = kontakt.map((k) => wrapT(k[1], fL, 8.4, kw));
const noetig = zeilenJe.reduce((a, z) => a + 13 + (z.length - 1) * 11, 0);
const platz = ky - (cy + 20);
const luft = Math.min(Math.max((platz - noetig) / Math.max(kontakt.length, 1), 6), 22);
kontakt.forEach((k, i) => {
text(k[0], kx, ky, fSB, 6.2, GOLDHELL, 1.2);
ky -= 13;
for (const z of zeilenJe[i]) { text(z, kx, ky, fL, 8.4, WEISS, 0.2); ky -= 11; }
ky += 11;
ky -= luft;
});
}
footer();
const dividerFoto = String(d.divider_stil || "navy") === "foto";
async function divider(nr: string, z1: string, z2: string, items: string[]) {
neueSeite(true);
let dimg: any = null;
if (dividerFoto) {
dimg = await brandBild("mpe/divider-" + nr + ".jpg");
if (!dimg) warnungen.push("Trennerfoto fehlt: branding-assets/mpe/divider-" + nr + ".jpg – Navy-Variante genutzt.");
}
if (dimg) {
bildCover(dimg, 300, 0, W - 300, H, 0.5, 0.5);
page.drawRectangle({ x: 0, y: 0, width: 300, height: H, color: NAVY });
page.drawRectangle({ x: 0, y: 0, width: 26, height: H, color: GOLD });
} else {
text(nr, W - 50, 110, fMarc, 300, GOLD_GEIST, 0, "r");
page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NAVY, opacity: 0.9 });
}
if (!dimg) logoOben(true);
const dx = dimg ? 56 : 70, dmax = dimg ? 216 : W - 300;
text("TEIL " + nr, dx, H - 200, fSB, 9.5, GOLDHELL, 2.6);
let dgr = 44;
while (dgr > 22 && (breite(z1, fMarc, dgr, 0.4) > dmax || breite(z2, fMarc, dgr, 0.4) > dmax)) dgr -= 1;
text(z1, dx, H - 252, fMarc, dgr, WEISS, 0.4);
text(z2, dx, H - 252 - dgr * 1.05, fMarc, dgr, GOLDHELL, 0.4);
page.drawRectangle({ x: dx, y: H - 288 - dgr * 1.05, width: 120, height: 1.4, color: GOLD });
if (dimg) {
let iy = H - 320 - dgr * 1.05;
for (const it of items) { for (const z of wrapT(it, fL, 10, dmax)) { text(z, dx, iy, fL, 10, rgb(0.867, 0.882, 0.925), 0.2); iy -= 15; } iy -= 4; }
} else {
let x = 70;
items.forEach((it, i) => {
if (i) { raute(x + 6, H - 356, 2.2); x += 20; }
text(it, x, H - 360, fL, 10, rgb(0.867, 0.882, 0.925), 0.2);
x += breite(it, fL, 10, 0.2) + 8;
});
}
footer(true);
}
await divider("01", "Musterhaus Immobilien", "Immobilien.", ["Daten & Fakten", "Vertriebsgebiet"]);
neueSeite();
kopf("Musterhaus Immobilien GmbH", "Unser Immobilienbüro.");
const fakten: string[] = (kz && Array.isArray(kz.fakten) && kz.fakten.length) ? kz.fakten.map((f: any) => String(f)) : [
"Inhabergäführtes Familienunternehmen".replace("gäf", "gef"),
"Spezialisten für außergewöhnliche Immobilien & Neubauprojekte",
"Umfangreiche Käuferkundenkartei",
"Breites Netzwerk in Mecklenburg-Vorpommern, Hamburg und der Heide-Region",
"Vermarktung über modernste Technik & Social Media",
];
if (kz && kz.objekte_vermittelt) fakten.unshift(kz.objekte_vermittelt + " vermittelte Immobilien im Jahr " + kz.jahr);
text("DATEN & FAKTEN", 70, H - 168, fSB, 8, GOLD, 1.6);
const textB = 430;
let fy = H - 198;
for (const f of fakten.slice(0, 9)) {
raute(76, fy + 3.5, 2.4);
for (const z of wrapT(f, fL, 10.8, textB)) { text(z, 94, fy, fL, 10.8, NAVY, 0.2); fy -= 15; }
fy -= 11;
}
{
const bx = 560, bw3 = W - 70 - bx, oben = H - 168, unten = 76, gap3 = 12;
const bh3 = (oben - unten - 2 * gap3) / 3;
const dateien = ["mpe/buero-1.jpg", "mpe/buero-2.jpg", "mpe/buero-3.jpg"];
const namen = ["", "", ""];
let by3 = oben - bh3;
for (let i = 0; i < 3; i++) {
const img = await brandBild(dateien[i]);
if (!img) { warnungen.push("Bürofoto fehlt: branding-assets/" + dateien[i]); }
bildCover(img, bx, by3, bw3, bh3);
page.drawRectangle({ x: bx, y: by3, width: bw3, height: 18, color: NAVY, opacity: 0.82 });
text(namen[i].toUpperCase(), bx + 10, by3 + 6, fSB, 6.6, GOLDHELL, 1.4);
by3 -= bh3 + gap3;
}
}
{
const so3 = standorte.slice(0, 3);
const schritt = Math.min(160, 410 / Math.max(so3.length, 1));
so3.forEach((so: any, i: number) => {
const sxx = 70 + i * schritt;
text((so.ort || "").toUpperCase() + (so.sortierung === 1 ? "  ·  HAUPTSITZ" : ""), sxx, 96, fSB, 6.6, GOLD, 1.4);
let sy = 80;
for (const z of wrapT([so.strasse, (so.plz || "") + " " + (so.ort || "")].filter(Boolean).join(" · "), fL, 7.6, schritt - 14)) { text(z, sxx, sy, fL, 7.6, GRAU, 0.2); sy -= 10.5; }
});
}
hline(70, 118, 510);
footer();
neueSeite(true);
kopf("Musterhaus Immobilien GmbH", "Unser Vertriebsgebiet.", true);
const geo = await geoLaden(admin);
if (geo && geo.features) {
const lat0 = 47.20, lat1 = 55.15, lonMid = 10.45;
const coslat = Math.cos(51.2 * Math.PI / 180);
const by0 = 70, by1 = H - 152;
const k = (by1 - by0) / (lat1 - lat0);
const mcx = W - 70 - 150;
const P = (lon: number, lat: number) => [mcx + (lon - lonMid) * coslat * k, by0 + (lat - lat0) * k];
const AKTIV = new Set(["DE-MV", "DE-HH", "DE-NI", "DE-BE", "DE-BB", "DE-SH"]);
const svgVon = (f: any) => {
const g = f.geometry;
const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
let p = "";
for (const poly of polys) {
for (const ring of poly) {
ring.forEach((c: number[], i: number) => {
const pt = P(c[0], c[1]);
p += (i ? " L " : " M ") + pt[0].toFixed(1) + " " + (H - pt[1]).toFixed(1);
});
p += " Z";
}
}
return p;
};
for (const f of geo.features) {
const aktiv = AKTIV.has(f.properties.id);
page.drawSvgPath(svgVon(f), { x: 0, y: H, color: aktiv ? rgb(0.231, 0.282, 0.475) : rgb(0.173, 0.208, 0.392), borderColor: rgb(0.129, 0.157, 0.267), borderWidth: 0.7 });
}
for (const f of geo.features) {
if (!AKTIV.has(f.properties.id)) continue;
page.drawSvgPath(svgVon(f), { x: 0, y: H, borderColor: GOLD, borderWidth: 0.9, opacity: 0 });
}
const pins: Array<[number, number, string, string, string]> = [];
// Die vier Kartenpunkte der Vorlage sind entfallen: sie markieren die
// Bueros des Referenzunternehmens und seinen Vertriebspartner.
// Ab Phase 2.4 kommen sie aus firma_standorte des Mandanten; bis dahin
// zeichnet die Karte keine Punkte (docs/OFFEN.md).
//
for (const p of pins) {
const pt = P(p[0], p[1]);
page.drawEllipse({ x: pt[0], y: pt[1], xScale: 7.5, yScale: 7.5, borderColor: GOLD, borderWidth: 0.9, opacity: 0 });
page.drawEllipse({ x: pt[0], y: pt[1], xScale: 3.2, yScale: 3.2, color: GOLD, borderColor: WEISS, borderWidth: 0.9 });
if (p[3] === "u") {
text(p[2].toUpperCase(), pt[0], pt[1] - 16, fSB, 7.6, WEISS, 0.6, "c");
if (p[4]) text(p[4].toUpperCase(), pt[0], pt[1] - 26, fSB, 5.8, GOLDHELL, 0.8, "c");
} else {
const rechts = p[3] === "r";
page.drawLine({ start: { x: pt[0] + (rechts ? 8 : -8), y: pt[1] }, end: { x: pt[0] + (rechts ? 12 : -12), y: pt[1] }, thickness: 0.7, color: GOLD });
text(p[2].toUpperCase(), pt[0] + (rechts ? 16 : -16), pt[1] - 2.6, fSB, 7.6, WEISS, 0.6, rechts ? "l" : "r");
if (p[4]) text(p[4].toUpperCase(), pt[0] + (rechts ? 16 : -16), pt[1] - 12.5, fSB, 5.8, GOLDHELL, 0.8, rechts ? "l" : "r");
}
}
} else warnungen.push("Kartendaten konnten nicht geladen werden.");
text("UNSERE STANDORTE", 70, H - 172, fSB, 7.8, GOLDHELL, 1.8);
page.drawRectangle({ x: 70, y: H - 182, width: 26, height: 1.2, color: GOLD });
let sy2 = H - 210;
const legende: Array<[string, string, string]> = standorte.slice(0, 4).map((so: any) => [
so.ort || "", so.sortierung === 1 ? "HAUPTSITZ" : "BÜRO",
[so.strasse, (so.plz || "") + " " + (so.ort || "")].filter(Boolean).join(" · "),
]);
legende.push(["Hamburg", "VERTRIEBSPARTNER", ""]);
for (const so of legende) {
page.drawEllipse({ x: 74, y: sy2 + 4, xScale: 3.2, yScale: 3.2, color: GOLD, borderColor: WEISS, borderWidth: 0.9 });
text(so[0], 88, sy2, fMarc, 15, WEISS, 0.2);
text(so[1], 88 + breite(so[0], fMarc, 15, 0.2) + 8, sy2 + 1, fSB, 6.6, GOLDHELL, 1);
if (so[2]) { text(so[2], 88, sy2 - 13, fL, 8, rgb(0.788, 0.808, 0.867), 0.2); sy2 -= 13; }
sy2 -= 32;
}
text("KERNMARKT", 70, sy2 - 6, fSB, 7.8, GOLDHELL, 1.8);
page.drawRectangle({ x: 70, y: sy2 - 16, width: 26, height: 1.2, color: GOLD });
para("Mecklenburg-Vorpommern · Schleswig-Holstein · Hamburg · Niedersachsen und Lüneburger Heide · Berlin & Brandenburg", 70, sy2 - 38, 300, fL, 8.6, 12, rgb(0.867, 0.882, 0.925));
footer(true);
if (hatKZ) {
neueSeite(true);
kopf("Musterhaus Immobilien GmbH", "Warum der Verkauf mit uns den Unterschied macht.", true);
const kpis: Array<[string, string]> = [];
if (kz.objekte_vermittelt) kpis.push([String(kz.objekte_vermittelt), "vermittelte Immobilien " + kz.jahr]);
if (kz.erzielungsquote) kpis.push([fmtProz(kz.erzielungsquote), "des Angebotspreises im Schnitt erzielt"]);
if (d.vorgemerkte_interessenten) kpis.push([String(d.vorgemerkte_interessenten), "vorgemerkte Interessenten für Ihr Objektprofil"]);
if (kz.google_anzahl) kpis.push([String(kz.google_anzahl), "Google-Bewertungen" + (kz.google_schnitt ? ", Ø " + fmtZahl(kz.google_schnitt) + " Sterne" : "")]);
const kw = (W - 140 - (kpis.length - 1) * 20) / Math.max(kpis.length, 1);
kpis.forEach((kp, i) => {
const x = 70 + i * (kw + 20);
page.drawRectangle({ x, y: 250, width: kw, height: 130, borderColor: GOLD, borderWidth: 0.8, opacity: 0 });
text(kp[0], x + kw / 2, 322, fMarc, 34, GOLDHELL, 0, "c");
let yy = 296;
for (const z of wrapT(kp[1], fL, 8.4, kw - 28)) { text(z, x + kw / 2, yy, fL, 8.4, WEISS, 0.2, "c"); yy -= 11.5; }
});
const args: Array<[string, string]> = [
["Käuferkartei statt Zufall", "Wir sprechen vorgemerkte Käufer an, bevor Ihr Objekt öffentlich wird."],
["Sachverständigen-Bewertung", "Der Preis ist hergeleitet – und in der Verhandlung belastbar."],
["Zeit und Sicherheit", "Bonitätsprüfung, Behördengänge, Notartermin und Übergabe aus einer Hand."],
];
const aw = (W - 140 - 48) / 3;
args.forEach((a, i) => {
const x = 70 + i * (aw + 24);
text(a[0].toUpperCase(), x, 190, fSB, 7.4, GOLDHELL, 1.4);
page.drawRectangle({ x, y: 180, width: 26, height: 1.2, color: GOLD });
para(a[1], x, 164, aw - 10, fL, 8.8, 12, rgb(0.788, 0.808, 0.867));
});
footer(true);
}
await freieSeiten("gebiet");
await divider("02", "Objektanalyse", "Ihrer Immobilie.", ["Eckdaten", "Merkmale", vos.length ? "Vergleichsobjekte" : "", "Kaufpreisempfehlung"].filter(Boolean));
neueSeite();
kopf("Objektanalyse", "Rahmendaten Ihrer Immobilie.");
text([adresse, ortZeile].filter(Boolean).join("  ·  ").toUpperCase(), 70, H - 158, fSB, 8.5, GOLD, 1.8);
const rows: Array<[string, string]> = [];
const addR = (l: string, v: any) => { const s = String(v == null ? "" : v).trim(); if (s) rows.push([l, s]); };
addR("OBJEKTART", d.objektart);
addR("WOHNFLÄCHE", wohnflaeche ? fmtQm(wohnflaeche) : "");
addR("NUTZFLÄCHE", num(d.nutzflaeche) ? fmtQm(d.nutzflaeche) : "");
addR("GRUNDSTÜCKSFLÄCHE", grundstueck ? fmtQm(grundstueck) : "");
addR("BODENRICHTWERT", num(d.bodenrichtwert) ? fmtEur0(d.bodenrichtwert) + " / m²" : "");
addR("BAUJAHR", d.baujahr);
addR("RENOVIERUNG / MODERNISIERUNG", d.renovierung);
addR("BESONDERHEITEN", d.besonderheiten);
let ry = H - 190;
const platz = ry - 96;
const zeilenGesamt = rows.reduce((a, r) => a + Math.min(wrapT(r[1], fL, 10.5, 420).length, 3), 0);
const schritt2 = Math.min(34, Math.max(22, (platz - zeilenGesamt * 13) / Math.max(rows.length, 1)));
for (const r of rows.slice(0, 8)) {
text(r[0], 70, ry, fSB, 6.8, GRAUH, 1.2);
const zl = wrapT(r[1], fL, 10.5, 420);
let yy = ry - 15;
for (const z of zl.slice(0, 3)) { text(z, 70, yy, fL, 10.5, NAVY, 0.2); yy -= 13; }
hline(70, yy + 3, 490);
ry = yy - schritt2 + 12;
}
const hausbild = await bild(d.hausbild_data || d.hauptbild_data);
bildCover(hausbild, W - 70 - 268, H - 168 - 320, 268, 320);
page.drawRectangle({ x: W - 70 - 268, y: H - 168 - 320, width: 268, height: 320, borderColor: HAIR, borderWidth: 0.8, opacity: 0 });
footer();
await freieSeiten("rahmen");
if (plan.includes("merkmale")) {
neueSeite();
kopf("Objektanalyse", "Merkmale, Potenzial und Zielgruppen.");
function liste(x: number, y: number, titel: string, items: string[], bw: number) {
if (titel) {
text(titel.toUpperCase(), x, y, fSB, 8.4, GOLD, 1.4);
page.drawRectangle({ x, y: y - 9, width: 26, height: 1.2, color: GOLD });
}
let yy = y - 30;
for (const it of items) {
raute(x + 5, yy + 3.5, 2.4);
for (const z of wrapT(it, fL, 10.6, bw - 18)) { text(z, x + 18, yy, fL, 10.6, NAVY, 0.2); yy -= 15; }
yy -= 10;
}
return yy;
}
const y0 = H - 165;
const halb = Math.ceil(vorteile.length / 2);
liste(70, y0, "Vorteile Ihrer Immobilie", vorteile.slice(0, halb), 215);
if (vorteile.length > halb) liste(300, y0, "", vorteile.slice(halb), 195);
vline(522, 110, H - 165);
let yr = y0;
if (nachteile.length) yr = liste(545, y0, "Mögliche Einwände unserer Kunden", nachteile, 230);
if (zielgruppen.length) liste(545, yr - 24, "Zielgruppen für Ihre Immobilie", zielgruppen, 230);
footer();
}
await freieSeiten("merkmale");
if (vos.length) {
neueSeite();
kopf("Objektanalyse", "Vergleichsobjekte in der Umgebung.");
if (vos.length <= 6) {
const proReihe = vos.length <= 3 ? vos.length : 3;
const reihen = Math.ceil(vos.length / proReihe);
const cwV = (W - 140 - (proReihe - 1) * 22) / proReihe;
const chV = reihen === 1 ? 358 : 172;
const fotoH = reihen === 1 ? 128 : 0;
for (let i = 0; i < vos.length; i++) {
const v = vos[i];
const col = i % proReihe, row = Math.floor(i / proReihe);
const x = 70 + col * (cwV + 22);
const yv = (reihen === 1 ? 76 : (H - 175 - 30 - (row + 1) * (chV + 18) + 18));
page.drawRectangle({ x, y: yv, width: cwV, height: chV, borderColor: HAIR, borderWidth: 0.9, opacity: 0 });
if (fotoH) bildCover(await bild(v.bild_data), x, yv + chV - fotoH, cwV, fotoH);
text(([v.objektart, [v.plz, v.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · ")).toUpperCase(), x + 14, yv + chV - fotoH - 20, fSB, 6.4, GOLD, 1);
const zeilen: Array<[string, string]> = [
["WOHNFLÄCHE", v.wohnflaeche ? fmtQm(v.wohnflaeche) : "–"],
["GRUNDSTÜCK", v.grundstuecksflaeche ? fmtQm(v.grundstuecksflaeche) : "–"],
["PREIS / M²", v._qm != null ? fmtEur0(Math.round(v._qm)) : "–"],
];
let yy = yv + chV - fotoH - 42;
for (const z of zeilen) {
text(z[0], x + 14, yy, fSB, 6.2, GRAUH, 1);
text(z[1], x + cwV - 14, yy, fL, 9, NAVY, 0.1, "r");
hline(x + 14, yy - 7, x + cwV - 14, rgb(0.925, 0.929, 0.949), 0.5);
yy -= 22;
}
if (v.anmerkung) {
let ay2 = yy - 2;
for (const z of wrapT(String(v.anmerkung), fL, 7.6, cwV - 28).slice(0, reihen === 1 ? 3 : 1)) { text(z, x + 14, ay2, fL, 7.6, GRAU, 0.1); ay2 -= 10.5; }
}
page.drawRectangle({ x, y: yv, width: cwV, height: 44, color: NAVY });
text("KAUFPREIS", x + cwV / 2, yv + 28, fSB, 6, GOLDHELL, 1.4, "c");
text(fmtEur0(v.preis), x + cwV / 2, yv + 10, fMarc, 16, WEISS, 0, "c");
}
} else {
const spalten: Array<[string, number]> = [["OBJEKTART", 70], ["ORT", 250], ["WOHNFL.", 400], ["GRUNDST.", 480], ["KAUFPREIS", 610], ["PREIS/M²", 720]];
for (const s of spalten) text(s[0], s[1], H - 175, fSB, 6.6, GOLD, 1.2);
hline(70, H - 184, W - 70, GOLD, 0.8);
let yt = H - 202;
for (const v of vos.slice(0, 12)) {
text(String(v.objektart || "–"), 70, yt, fL, 8.6, NAVY, 0.1);
text([v.plz, v.ort].filter(Boolean).join(" "), 250, yt, fL, 8.6, NAVY, 0.1);
text(v.wohnflaeche ? fmtZahl(v.wohnflaeche) + " m²" : "–", 400, yt, fL, 8.6, NAVY, 0.1);
text(v.grundstuecksflaeche ? fmtZahl(v.grundstuecksflaeche) + " m²" : "–", 480, yt, fL, 8.6, NAVY, 0.1);
text(fmtEur0(v.preis), 610, yt, fL, 8.6, NAVY, 0.1);
text(v._qm != null ? fmtEur0(Math.round(v._qm)) : "–", 720, yt, fSB, 8.6, NAVY, 0.1);
hline(70, yt - 8, W - 70, rgb(0.925, 0.929, 0.949), 0.5);
yt -= 24;
}
if (qmSchnitt != null) {
page.drawRectangle({ x: 70, y: yt - 24, width: W - 140, height: 30, color: NAVY });
text("DURCHSCHNITT DER VERGLEICHSOBJEKTE", 84, yt - 14, fSB, 7, GOLDHELL, 1.4);
text(fmtEur0(Math.round(qmSchnitt)) + " / m²", W - 84, yt - 15, fSB, 10, WEISS, 0.2, "r");
}
}
if (qmSchnitt != null && vos.length <= 6) {
text("Ø VERGLEICH: " + fmtEur0(Math.round(qmSchnitt)) + " / m²", 70, 56, fSB, 8.4, GOLD, 1.2);
}
footer();
}
await freieSeiten("vergleich");
if (plan.includes("trend")) {
neueSeite();
kopf("Objektanalyse", "Preisentwicklung im Umfeld.");
if (preistrend.length) {
const anzahl = Math.min(preistrend.length, 2);
const cwT = (W - 140 - (anzahl - 1) * 40) / anzahl;
for (let si = 0; si < anzahl; si++) {
const serie = preistrend[si];
const px0 = 70 + si * (cwT + 40) + 44;
const px1 = 70 + si * (cwT + 40) + cwT;
const py0 = 150, py1 = 330;
const werte = serie.punkte.map((p: any) => Number(p.y)).filter((n: number) => isFinite(n));
const vmin = Math.min(...werte), vmax = Math.max(...werte);
const spanne = Math.max(vmax - vmin, 1);
const lo = vmin - spanne * 0.25, hi = vmax + spanne * 0.25;
const X = (i: number) => px0 + i * (px1 - px0) / Math.max(serie.punkte.length - 1, 1);
const Y = (v: number) => py0 + (v - lo) * (py1 - py0) / (hi - lo);
text(String(serie.titel || "Preistrend").toUpperCase(), 70 + si * (cwT + 40), 360, fSB, 7.4, GOLD, 1.4);
for (let g = 0; g <= 4; g++) {
const v = lo + (hi - lo) * g / 4;
hline(px0, Y(v), px1, rgb(0.925, 0.929, 0.949), 0.6);
text(Math.round(v).toLocaleString("de-DE"), px0 - 8, Y(v) - 2, fL, 6.8, GRAUH, 0, "r");
}
for (let i = 0; i < serie.punkte.length - 1; i++) {
page.drawLine({ start: { x: X(i), y: Y(Number(serie.punkte[i].y)) }, end: { x: X(i + 1), y: Y(Number(serie.punkte[i + 1].y)) }, thickness: 1.6, color: NAVY });
}
serie.punkte.forEach((p: any, i: number) => {
page.drawEllipse({ x: X(i), y: Y(Number(p.y)), xScale: 2.4, yScale: 2.4, color: GOLD, borderColor: WEISS, borderWidth: 0.7 });
if (serie.punkte.length <= 14 || i % 2 === 0) text(String(p.x || ""), X(i), py0 - 14, fL, 6.4, GRAUH, 0, "c");
});
const ersteY = Number(serie.punkte[0].y), letzteY = Number(serie.punkte[serie.punkte.length - 1].y);
const trend = ((letzteY / ersteY - 1) * 100);
text(fmtZahl(ersteY) + " " + (serie.einheit || ""), px0, py1 + 16, fSB, 7.5, NAVY, 0.2);
text((trend >= 0 ? "+" : "−") + fmtZahl(Math.abs(trend)) + " %", (px0 + px1) / 2, py1 + 16, fSB, 7.5, trend >= 0 ? GOLD2 : ROT, 0.2, "c");
text(fmtZahl(letzteY) + " " + (serie.einheit || ""), px1, py1 + 16, fSB, 7.5, NAVY, 0.2, "r");
if (serie.quelle) text("Quelle: " + serie.quelle, 70 + si * (cwT + 40), 100, fL, 6.8, GRAUH, 0.2);
}
} else {
const img = await bild(d.preisentwicklung_bild_data);
if (img) {
const bx = 70, byy = 90, bw2 = W - 140, bh2 = H - 175 - 90;
const s = Math.min(bw2 / img.width, bh2 / img.height);
page.drawImage(img, { x: bx + (bw2 - img.width * s) / 2, y: byy + (bh2 - img.height * s) / 2, width: img.width * s, height: img.height * s });
}
}
footer();
}
await freieSeiten("trend");
if (hatHerleitung) {
neueSeite();
kopf("Objektanalyse", "So kommen wir auf Ihren Preis.");
const posten: Array<[string, string, number, boolean]> = [];
if (gelesen.length) {
for (const p of gelesen) posten.push([String(p.titel), String(p.detail || ""), Math.abs(Number(p.betrag)), !!p.negativ]);
} else if (hatSachwert) {
posten.push(["Bodenwert", fmtZahl(grundstueck) + " m² × " + fmtEur0(swBrw) + "/m²", bodenwert!, false]);
const nhk = num(d.sw_standardstufe) ? 0 : 0;
const gebaeude = num(d.sw_gebaeudewert) ?? null;
if (gebaeude) posten.push(["Gebäudesachwert", "BGF " + fmtZahl(swBgf) + " m²", gebaeude, false]);
const awm = num(d.sw_alterswertminderung);
if (awm) posten.push(["Alterswertminderung", "Baujahr " + (d.sw_baujahr || d.baujahr || ""), -Math.abs(awm), true]);
const besa = num(d.sw_besondereAnlagen);
if (besa) posten.push(["Bauliche Anlagen", "Garage, Außenanlagen", besa, false]);
} else if (qmSchnitt != null && wohnflaeche) {
posten.push(["Vergleichswert-Basis", fmtEur0(Math.round(qmSchnitt)) + "/m² × " + fmtZahl(wohnflaeche) + " m²", qmSchnitt * wohnflaeche, false]);
const diff = marktwert! - qmSchnitt * wohnflaeche;
posten.push([diff >= 0 ? "Zuschlag Objektmerkmale" : "Abschlag Objektmerkmale", "Ausstattung, Lage, Zustand", diff, diff < 0]);
}
let hy = H - 190;
const schrittH = Math.min(46, (H - 190 - 150) / Math.max(posten.length, 1));
for (const p of posten) {
text(p[0], 70, hy, fSB, 9.6, NAVY, 0.1);
text(p[1], 70, hy - 12, fL, 8, GRAUH, 0.1);
text((p[3] ? "− " : "+ ") + fmtEur0(Math.abs(p[2])), 520, hy - 3, fL, 11, p[3] ? ROT : NAVY, 0.1, "r");
hline(70, hy - 22, 520);
hy -= schrittH;
}
page.drawRectangle({ x: 70, y: hy - 22, width: 450, height: 48, color: NAVY });
if (angebot && marktwert) {
text("REALISTISCH ERZIELBAR", 90, hy + 11, fSB, 6.6, GOLDHELL, 1.3);
text(fmtEur0(marktwert), 90, hy - 10, fMarc, 18, WEISS, 0.2);
vline(298, hy - 18, hy + 22, rgb(0.4,0.44,0.58), 0.8);
text("EMPFOHLENER ANGEBOTSPREIS", 314, hy + 11, fSB, 6.6, GOLDHELL, 1.3);
text(fmtEur0(angebot), 500, hy - 10, fMarc, 18, GOLDHELL, 0.2, "r");
} else {
text("REALISTISCH ERZIELBARER WERT", 90, hy + 10, fSB, 7, GOLDHELL, 1.4);
text(fmtEur0(marktwert) || "–", 500, hy - 8, fMarc, 20, WEISS, 0.2, "r");
}
text("VERFAHREN: " + (verfahren || "Vergleichswertverfahren").toUpperCase() + (gelesen.length && d.herleitung_quelle ? "     GRUNDLAGE: " + String(d.herleitung_quelle).toUpperCase() : ""), 70, hy - 44, fSB, 6.6, GOLD, 1.1);
vline(540, 100, H - 165);
text("WARUM DIESER WERT?", 560, H - 172, fSB, 7.5, GOLD, 1.4);
page.drawRectangle({ x: 560, y: H - 182, width: 26, height: 1.2, color: GOLD });
let ay3 = H - 200;
if (gelesen.length) {
ay3 = para("Die hergeleiteten Werte sind online sichtbare Angebots-/Vergleichspreise – nicht die real erzielten. Der realistisch erzielbare Wert liegt daher bewusst darunter, der Angebotspreis gibt Verhandlungsspielraum.", 560, ay3, 210, fL, 8.4, 11.5, GRAU) - 10;
}
if (qmSchnitt != null) {
ay3 = para("Die Vergleichsobjekte liegen bei durchschnittlich " + fmtEur0(Math.round(qmSchnitt)) + " pro m² Wohnfläche.", 560, ay3, 210, fL, 9.2, 13, GRAU) - 10;
}
for (const a of preisArgumente.slice(0, 6)) {
raute(565, ay3 + 3, 2.2);
for (const z of wrapT(a, fL, 8.6, 196)) { text(z, 576, ay3, fL, 8.6, NAVY, 0.1); ay3 -= 12; }
ay3 -= 8;
}
if (!preisArgumente.length) warnungen.push("Keine Preis-Argumente gepflegt – die Begründung der Preisableitung fehlt.");
footer();
}
await freieSeiten("herleitung");
neueSeite(true);
kopf("Objektanalyse", "Unsere Kaufpreisempfehlung" + (String(d.kp_praemisse || "").trim() ? " *" : "") + ".", true);
const spalten3: Array<[string, string, string, boolean]> = [
["REALISTISCHES KAUFPREISVOLUMEN", fmtEur0(marktwert) || "–", (verfahren || "Sachwertverfahren") + ", aktuelle Marktsituation", false],
["EMPFOHLENER ANGEBOTSPREIS", fmtEur0(angebot) || "–", "Marktspitze ausloten, Verhandlungsspielraum", true],
["VERMARKTUNGSDAUER", (d.vermarktungsdauer_von && d.vermarktungsdauer_bis) ? d.vermarktungsdauer_von + " – " + d.vermarktungsdauer_bis + " Monate" : "–", "Erfahrungswert aus erfolgten Verkäufen", false],
];
const qmVolumen = (marktwert && wohnflaeche) ? Math.round(marktwert / wohnflaeche) : null;
const qmAngebot = (angebot && wohnflaeche) ? Math.round(angebot / wohnflaeche) : null;
const zusatz3: Array<string> = [String(d.kp_zusatz_volumen || "").trim(), String(d.kp_zusatz_angebot || "").trim(), ""];
const qm3: Array<string> = [qmVolumen ? fmtEur0(qmVolumen) + " / m² Wfl." : "", qmAngebot ? fmtEur0(qmAngebot) + " / m² Wfl." : "", ""];
const cw3 = (W - 140) / 3, cy3 = H / 2 - 24;
spalten3.forEach((s, i) => {
const x = 70 + i * cw3, mid = x + cw3 / 2;
if (i) vline(x, cy3 - 92, cy3 + 100, GOLD, 0.8);
text(s[0], mid, cy3 + 74, fSB, 7.2, GOLDHELL, 1.2, "c");
let gr = i === 1 ? 28 : 24;
while (breite(s[1], fMarc, gr) > cw3 - 30 && gr > 14) gr -= 1;
text(s[1], mid, cy3, fMarc, gr, i === 1 ? GOLDHELL : WEISS, 0, "c");
let yy3 = cy3 - 26;
if (qm3[i]) { text(qm3[i], mid, yy3, fSB, 12, i === 1 ? GOLDHELL : WEISS, 0.2, "c"); yy3 -= 18; }
if (zusatz3[i]) { for (const z of wrapT(zusatz3[i], fSB, 8.4, cw3 - 40)) { text(z, mid, yy3, fSB, 8.4, GOLDHELL, 0.2, "c"); yy3 -= 11; } yy3 -= 4; }
for (const z of wrapT(s[2], fL, 8.6, cw3 - 30)) { text(z, mid, yy3, fL, 8.6, rgb(0.725, 0.753, 0.839), 0.2, "c"); yy3 -= 11.5; }
});
const praemisse = String(d.kp_praemisse || "").trim();
hline(70, 110, W - 70, GOLD, 0.7);
text("Preisermittlung nach " + (verfahren || "Sachwertverfahren") + "  ·  Vergleichsobjekte im Umkreis  ·  Marktanalyse", W / 2, 90, fL, 9.5, rgb(0.843, 0.859, 0.910), 0.2, "c");
if (praemisse) para("* " + praemisse, 70, 74, W - 140, fM, 9.2, 12, GOLDHELL);
footer(true);
await freieSeiten("empfehlung");
if (marktwert) {
neueSeite();
kopf("Preisstrategie", "Warum der richtige Startpreis entscheidet.");
para("Ein hoher Startpreis kostet am Ende Geld – und Zeit. Die Kreissparkasse Köln hat dazu 1.000 Immobilienverkäufe ausgewertet.", 70, H - 148, W - 140, fL, 9.5, 12, GRAU);
const gx0 = 185, gx1 = 470, gy0 = 150, gy1 = 330, vmaxS = 125;
const Ys = (v: number) => gy0 + v / vmaxS * (gy1 - gy0);
for (const g of [0, 25, 50, 75, 100, 125]) {
hline(gx0, Ys(g), gx1, rgb(0.925, 0.929, 0.949), 0.6);
if (g === 100) continue;
text(g + " %", gx0 - 8, Ys(g) - 2, fL, 6.6, GRAUH, 0, "r");
}
{
const lbl = "100 % = MARKTWERT";
let gr2 = 6.6, cs2 = 0.8;
while (breite(lbl, fSB, gr2, cs2) > gx0 - 78 && gr2 > 4.8) { gr2 -= 0.2; cs2 = 0.5; }
text(lbl, gx0 - 8, Ys(100) - 2, fSB, gr2, GOLD, cs2, "r");
}
hline(gx0, Ys(100), gx1, GOLD, 1.2);
const studie: Array<[string, number, number, number]> = [["+ 5 %", 105, 99, 63], ["+ 10 %", 110, 97, 281], ["+ 20 %", 120, 85, 379]];
const gwS = (gx1 - gx0) / studie.length;
studie.forEach((s, i) => {
const gxm = gx0 + i * gwS + gwS / 2;
page.drawRectangle({ x: gxm - 40, y: gy0, width: 34, height: Ys(s[1]) - gy0, color: SILBER });
text(s[1] + " %", gxm - 23, Ys(s[1]) + 5, fL, 6.6, GRAU, 0, "c");
page.drawRectangle({ x: gxm + 6, y: gy0, width: 34, height: Ys(s[2]) - gy0, color: s[2] >= 97 ? GOLD : ROT });
text(s[2] + " %", gxm + 23, Ys(s[2]) + 5, fSB, 6.8, NAVY, 0, "c");
text("STARTPREIS " + s[0], gxm, gy0 - 16, fSB, 6.8, NAVY, 1.2, "c");
text(s[3] + " Tage bis zum Verkauf", gxm, gy0 - 30, fL, 7, GRAUH, 0, "c");
});
page.drawRectangle({ x: gx0, y: 108, width: 9, height: 9, color: SILBER });
text("Angebotspreis", gx0 + 14, 110, fL, 7.4, GRAU, 0.1);
page.drawRectangle({ x: gx0 + 96, y: 108, width: 9, height: 9, color: GOLD });
text("tatsächlich erzielter Erlös (in % des Marktwerts)", gx0 + 110, 110, fL, 7.4, GRAU, 0.1);
text("Quelle: Empirische Studie der Kreissparkasse Köln (" + studieJahr + ") auf Grundlage von 1.000 Immobilienverkäufen.", gx0, 90, fL, 6.6, GRAUH, 0.1);
vline(492, 90, H - 165);
text("ÜBERTRAGEN AUF IHRE IMMOBILIE", 512, H - 172, fSB, 7.5, GOLD, 1.4);
page.drawRectangle({ x: 512, y: H - 182, width: 26, height: 1.2, color: GOLD });
let sy3 = para("Marktwert Ihrer Immobilie: " + fmtEur0(marktwert) + ". Je nach Startpreis ergäbe sich:", 512, H - 200, W - 70 - 512, fL, 8.4, 12, GRAU) - 14;
const bwR = W - 70 - 512;
const faelle: Array<[string, number, number, string]> = [["+ 5 %", 1.05, 0.99, "≈ 2 Monate"], ["+ 10 %", 1.10, 0.97, "≈ 9 Monate"], ["+ 20 %", 1.20, 0.85, "über 1 Jahr"]];
faelle.forEach((f, i) => {
const gut = i === 0;
const hgt = 66;
if (gut) {
page.drawRectangle({ x: 512, y: sy3 - hgt + 12, width: bwR, height: hgt, color: SANFT });
page.drawRectangle({ x: 512, y: sy3 - hgt + 12, width: 3.5, height: hgt, color: GOLD });
} else hline(512, sy3 - hgt + 12, 512 + bwR, HAIR, 0.6);
text("Startpreis " + f[0] + "  ·  " + fmtEur0(Math.round(marktwert * f[1])), 524, sy3 - 2, fSB, 9.4, NAVY, 0.1);
text("Erlös " + fmtEur0(Math.round(marktwert * f[2])) + "  ·  " + f[3], 524, sy3 - 17, fL, 8.2, GRAU, 0.1);
const diff = marktwert * f[2] - marktwert;
text("Ergebnis gegenüber Marktwert: −" + fmtEur0(Math.abs(Math.round(diff))), 524, sy3 - 33, fSB, 8.6, gut ? GOLD2 : ROT, 0.1);
sy3 -= hgt + 4;
});
if (aufschlag != null) {
const fazit = "Unser Angebotspreis von " + fmtEur0(angebot) + " liegt rund " + fmtZahl(aufschlag)
+ " % über dem Marktwert – " + (aufschlag <= 8
? "genau im Bereich, in dem der volle Erlös erzielt und die Vermarktungsdauer kurz gehalten wird."
: "oberhalb des Bereichs, den die Studie als optimal ausweist.");
const fz = wrapT(fazit, fL, 8.2, bwR - 28);
const hgt = 26 + fz.length * 10.5 + 10;
const by = Math.max(76, 96);
page.drawRectangle({ x: 512, y: by, width: bwR, height: hgt, color: NAVY });
text("UNSERE EMPFEHLUNG", 526, by + hgt - 16, fSB, 6.6, GOLDHELL, 1.4);
let fy4 = by + hgt - 32;
for (const z of fz) { text(z, 526, fy4, fL, 8.2, WEISS, 0.1); fy4 -= 10.5; }
}
footer();
}
await freieSeiten("startpreis");
if (einwandAntwort.length) {
neueSeite();
kopf("Preisstrategie", "So verteidigen wir Ihren Preis.");
para("Jeder Kaufinteressent sucht Argumente für einen Abschlag. Auf diese Einwände sind wir vorbereitet.", 70, H - 148, W - 140, fL, 9.5, 12, GRAU);
let ey = H - 180;
for (const p of einwandAntwort.slice(0, 5)) {
const eZ = wrapT(String(p.einwand), fL, 9, 268);
const aZ = wrapT(String(p.antwort || ""), fL, 8.8, W - 70 - 404);
const hgt = Math.max(42, eZ.length * 12 + 20, aZ.length * 12 + 8);
page.drawRectangle({ x: 70, y: ey - hgt + 12, width: 300, height: hgt, color: SANFT });
page.drawRectangle({ x: 70, y: ey - hgt + 12, width: 3.5, height: hgt, color: ROT });
let yy = ey - 2;
for (const z of eZ) { text(z, 84, yy, fL, 9, NAVY, 0.1); yy -= 12; }
raute(386, ey - 9, 2.8);
let yy2 = ey - 2;
for (const z of aZ) { text(z, 404, yy2, fL, 8.8, GRAU, 0.1); yy2 -= 12; }
ey -= hgt + 14;
if (ey < 80) break;
}
footer();
}
await freieSeiten("einwaende");
if (plan.includes("finanzierung")) {
neueSeite();
kopf("Preisstrategie", "Finanzierungsbeispiel für Erwerber.");
para("Auf Basis des empfohlenen Angebotspreises und des eingesetzten Eigenkapitals – als Orientierung für Kaufinteressenten.", 70, H - 148, W - 140, fL, 9.5, 12, GRAU);
const cwF = (W - 140 - 28) / 2, chF = 296, cyF = 84;
function karteF(x: number, titel: string, zeilen: Array<[string, string]>, endK: string, endV: string) {
page.drawRectangle({ x, y: cyF, width: cwF, height: chF, borderColor: HAIR, borderWidth: 0.9, opacity: 0 });
text(titel.toUpperCase(), x + 22, cyF + chF - 32, fSB, 7.5, GOLD, 1.6);
page.drawRectangle({ x: x + 22, y: cyF + chF - 43, width: 26, height: 1.2, color: GOLD });
let y = cyF + chF - 68;
for (const z of zeilen) {
if (!z[1]) continue;
text(z[0], x + 22, y, fL, 9.2, NAVY, 0.1);
text(z[1], x + cwF - 22, y, fL, 9.2, NAVY, 0.1, "r");
hline(x + 22, y - 8, x + cwF - 22, rgb(0.925, 0.929, 0.949), 0.5);
y -= 27;
}
page.drawRectangle({ x, y: cyF, width: cwF, height: 56, color: NAVY });
text(endK.toUpperCase(), x + 22, cyF + 34, fSB, 6.4, GOLDHELL, 1.2);
text(endV, x + 22, cyF + 12, fMarc, 19, WEISS, 0.2);
}
karteF(70, "Anschaffungskosten", [
["Kaufpreis der Immobilie", fmtEur0(finKp)],
["+ Grunderwerbsteuer (" + fmtProz(finGrunderwerbP) + ")", fmtEur0(Math.round(finGrunderwerbB))],
["+ Notar- und Grundbuchkosten (" + fmtProz(finNotarP) + ")", fmtEur0(Math.round(finNotarB))],
["+ Maklerprovision (" + fmtProz(finProvP) + ")", fmtEur0(Math.round(finProvB))],
["+ Sonstiges", finSonst ? fmtEur0(finSonst) : ""],
], "Gesamtaufwand der Investition", fmtEur0(Math.round(finGesamt)));
karteF(70 + cwF + 28, "Finanzierung", [
["Eigenkapital", fmtEur0(finEk)],
["Benötigtes Darlehen", fmtEur0(Math.round(finDarlehen))],
["Zinssatz", fmtProz(finZins)],
["Tilgungssatz", fmtProz(finTilg)],
["Laufzeit", finJahre ? "ca. " + fmtZahl(Math.round(finJahre)) + " Jahre" : ""],
], "Monatliche Rate", fmtEur0(Math.round(finRate)));
footer();
}
await freieSeiten("finanzierung");
await divider("03", "Vermarktung", "& Service.", ["Objektaufbereitung", "Fahrplan", "Courtage", "Nächste Schritte"]);
neueSeite();
kopf("Professionelle Vermarktung", "Wir bereiten Ihre Immobilie optimal auf.");
const bloecke: Array<[string, string]> = [
["Exposé", "Erstellung eines aussagekräftigen, detailreichen und maßgeschneiderten Exposés Ihrer Immobilie."],
["Fotografien", "Professionelle & hochwertige Fotografien nach Musterhaus Immobilien Richtlinien."],
["Grundrisse", "Professionelle Grundrissbearbeitung und -gestaltung für einen klaren ersten Eindruck."],
["Objektbeschreibung", "Detaillierte Beschreibung samt Ausstattung, Besonderheiten und Lage – bezogen auf die Zielgruppen."],
];
const cwB = (W - 140 - 72) / 4;
bloecke.forEach((b, i) => {
const x = 70 + i * (cwB + 24);
text("0" + (i + 1), x, H - 176, fMarc, 30, GOLD);
text(b[0], x, H - 210, fMarc, 15.5, NAVY, 0.2);
page.drawRectangle({ x, y: H - 220, width: 26, height: 1.2, color: GOLD });
para(b[1], x, H - 240, cwB, fL, 8.6, 12.5, GRAU);
});
{
const stock = await brandBild("mpe/stock-aufbereitung.jpg");
const bx = 70, by = 78, bw = W - 140, bh = 130;
if (stock) bildCover(stock, bx, by, bw, bh, 0.5, 0.5);
else {
// CI-Grafik statt Stockfoto: Navy-Band mit goldener Blaupausen-Zeichnung
page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: NAVY });
for (let gx = bx + 26; gx < bx + bw; gx += 26) page.drawLine({ start: { x: gx, y: by }, end: { x: gx, y: by + bh }, thickness: 0.4, color: GOLD, opacity: 0.07 });
for (let gy = by + 26; gy < by + bh; gy += 26) page.drawLine({ start: { x: bx, y: gy }, end: { x: bx + bw, y: gy }, thickness: 0.4, color: GOLD, opacity: 0.07 });
page.drawRectangle({ x: bx + 10, y: by + 10, width: bw - 20, height: bh - 20, borderColor: GOLD, borderWidth: 0.6, opacity: 0, borderOpacity: 0.35 });
const mid = by + bh / 2;
const linie = (x0: number, y0: number, x1: number, y1: number, dick = 1.1, op = 0.9) => page.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: dick, color: GOLD, opacity: op });
// links: Kamera (Fotografien)
const kx = bx + bw * 0.2;
page.drawRectangle({ x: kx - 34, y: mid - 24, width: 68, height: 48, borderColor: GOLD, borderWidth: 1.1, opacity: 0, borderOpacity: 0.9 });
page.drawRectangle({ x: kx - 12, y: mid + 24, width: 24, height: 7, borderColor: GOLD, borderWidth: 1.1, opacity: 0, borderOpacity: 0.9 });
page.drawEllipse({ x: kx, y: mid, xScale: 15, yScale: 15, borderColor: GOLD, borderWidth: 1.1, opacity: 0, borderOpacity: 0.9 });
page.drawEllipse({ x: kx, y: mid, xScale: 7, yScale: 7, borderColor: GOLD, borderWidth: 0.8, opacity: 0, borderOpacity: 0.6 });
// Mitte: Grundriss (Grundrisse)
const gxm = bx + bw * 0.5, gw = 200, gh = 76;
page.drawRectangle({ x: gxm - gw / 2, y: mid - gh / 2, width: gw, height: gh, borderColor: GOLD, borderWidth: 1.4, opacity: 0, borderOpacity: 0.95 });
linie(gxm - gw / 2 + 78, mid - gh / 2, gxm - gw / 2 + 78, mid + gh / 2, 1.1);
linie(gxm - gw / 2 + 78, mid + 6, gxm + gw / 2, mid + 6, 1.1);
linie(gxm + gw / 2 - 52, mid + 6, gxm + gw / 2 - 52, mid + gh / 2, 1.1);
page.drawRectangle({ x: gxm - gw / 2 + 22, y: mid - gh / 2 - 1.4, width: 26, height: 2.8, color: NAVY });
page.drawRectangle({ x: gxm - gw / 2 - 1.4, y: mid - 6, width: 2.8, height: 26, color: NAVY });
// Bemassungslinien unter dem Grundriss
const bmy = mid - gh / 2 - 12;
linie(gxm - gw / 2, bmy, gxm + gw / 2, bmy, 0.6, 0.5);
linie(gxm - gw / 2, bmy - 3, gxm - gw / 2, bmy + 3, 0.6, 0.5);
linie(gxm + gw / 2, bmy - 3, gxm + gw / 2, bmy + 3, 0.6, 0.5);
// rechts: Exposé-Seite (Exposé & Objektbeschreibung)
const ex = bx + bw * 0.8;
page.drawRectangle({ x: ex - 26, y: mid - 34, width: 52, height: 68, borderColor: GOLD, borderWidth: 1.1, opacity: 0, borderOpacity: 0.9 });
page.drawRectangle({ x: ex - 18, y: mid + 6, width: 36, height: 18, borderColor: GOLD, borderWidth: 0.7, opacity: 0, borderOpacity: 0.55 });
for (let i = 0; i < 4; i++) linie(ex - 18, mid - 4 - i * 8, ex + (i === 3 ? 4 : 18), mid - 4 - i * 8, 0.7, 0.55);
}
}
footer();
await freieSeiten("aufbereitung");
neueSeite();
kopf("Professionelle Vermarktung", "Unsere Aktivitäten im Exklusivmandat.");
const spaltenM: Array<[string, string[], boolean]> = [
["Service", ["Erstellung der Verkaufsunterlagen", "Behördengänge", "Organisation der Besichtigungen", "Bonitätsprüfung der Interessenten", "Regelmäßiger Report zum Verkaufsprozess", "Führung der Verkaufsverhandlungen"], false],
["Vermarktung", ["Ansprache vorgemerkter Käuferkunden", "Schaufensterauslage", "Online-Vermarktung", "Verkaufsschild", "Hochwertige Fotos", "Luftbilder", "Video-Präsentation"], true],
["Vertrag", ["Vorbereitung des Notartermins", "Prüfung vertraglicher Details", "Übergabe und After-Sales-Service"], false],
];
const cwM = (W - 140 - 48) / 3, chM = 330, cyM = 76;
spaltenM.forEach((s, i) => {
const x = 70 + i * (cwM + 24);
if (s[2]) {
page.drawRectangle({ x, y: cyM, width: cwM, height: chM, color: NAVY });
page.drawRectangle({ x, y: cyM, width: cwM, height: chM, borderColor: GOLD, borderWidth: 1, opacity: 0 });
} else page.drawRectangle({ x, y: cyM, width: cwM, height: chM, borderColor: HAIR, borderWidth: 0.9, opacity: 0 });
text(s[0].toUpperCase(), x + cwM / 2, cyM + chM - 36, fSB, 8, s[2] ? GOLDHELL : GOLD, 1.8, "c");
page.drawRectangle({ x: x + cwM / 2 - 14, y: cyM + chM - 48, width: 28, height: 1.2, color: GOLD });
const hoehen = s[1].map((it) => wrapT(it, fL, 8.8, cwM - 60).length * 12.5);
const frei = (chM - 76 - 26) - hoehen.reduce((a, b) => a + b, 0);
const gap = Math.min(Math.max(frei / Math.max(s[1].length - 1, 1), 6.5), 30);
let y = cyM + chM - 76;
s[1].forEach((it) => {
raute(x + 24, y + 3, 2.2);
for (const z of wrapT(it, fL, 8.8, cwM - 60)) { text(z, x + 36, y, fL, 8.8, s[2] ? WEISS : NAVY, 0.1); y -= 12.5; }
y -= gap;
});
});
footer();
await freieSeiten("massnahmen");
neueSeite();
kopf("Professionelle Vermarktung", "Ihr Vermarktungsfahrplan.");
para("Zielgruppe, Kanal und Zeitpunkt greifen ineinander – statt alles gleichzeitig zu veröffentlichen.", 70, H - 148, W - 140, fL, 9.5, 12, GRAU);
const phasen: Array<[string, string, string[]]> = [
["Schritt 01", "Aufbereitung", ["Professionelle Fotos & Luftbilder", "Grundrissgestaltung", "Exposé & Objektbeschreibung", "Unterlagen vollständig zusammenstellen"]],
["Schritt 02", "Stille Vermarktung", ["Ansprache vorgemerkter Käuferkunden", "Erste Besichtigungen ohne Portal-Auftritt", "Ziel: Verkauf vor Veröffentlichung"]],
["Schritt 03", "Aktive Vermarktung", ["Launch auf allen Portalen", "Video-Präsentation", "Social Media, Schaufenster, Verkaufsschild", zielgruppen.length ? "Zielgruppen: " + zielgruppen.slice(0, 2).join(", ") : "Gezielte Zielgruppenansprache"]],
["Laufend", "Steuerung", ["Regelmäßiger Report an Sie", "Bonitätsprüfung der Interessenten", "Verhandlungsführung", "Notartermin & Übergabe"]],
];
const cwP = (W - 140 - 60) / 4, lyP = H - 220;
hline(70, lyP, W - 70, HAIR, 0.9);
phasen.forEach((p, i) => {
const x = 70 + i * (cwP + 20), mid = x + cwP / 2;
const aktiv = i === 1 || i === 2;
page.drawEllipse({ x: mid, y: lyP, xScale: aktiv ? 5 : 4, yScale: aktiv ? 5 : 4, color: aktiv ? GOLD : WEISS, borderColor: GOLD, borderWidth: 1.2 });
text(p[0].toUpperCase(), mid, lyP + 18, fSB, 7, GOLD, 1.4, "c");
text(p[1], mid, lyP - 32, fMarc, 15, NAVY, 0.2, "c");
let yy = lyP - 56;
for (const it of p[2]) {
raute(x + 5, yy + 3, 2);
for (const z of wrapT(it, fL, 8.4, cwP - 18)) { text(z, x + 16, yy, fL, 8.4, GRAU, 0.1); yy -= 11.5; }
yy -= 7;
}
});
footer();
await freieSeiten("fahrplan");
if (plan.includes("courtage")) {
neueSeite();
kopf("Maßgeschneiderter Service", "Courtage-Regelung für Ihren Alleinauftrag.");
const midy = H - 235;
const seiten: Array<[string, any]> = [["Verkäufer", d.courtage_verkaeufer], ["", null], ["Käufer", d.courtage_kaeufer]];
seiten.forEach((s, i) => {
const mid = 70 + i * (W - 140) / 3 + (W - 140) / 6;
if (i === 1) {
raute(mid, midy + 8, 3.4);
text("COURTAGE-AUFTEILUNG", mid, midy - 12, fSB, 7.5, GOLD, 1.8, "c");
return;
}
text(s[0].toUpperCase(), mid, midy + 40, fSB, 8.5, GRAUH, 2.2, "c");
text(fmtProz(s[1]) || "–", mid, midy - 8, fMarc, 40, NAVY, 0, "c");
text("inkl. gesetzl. MwSt.", mid, midy - 30, fL, 8.5, GRAU, 0.2, "c");
});
page.drawRectangle({ x: 70, y: 84, width: W - 140, height: 118, borderColor: HAIR, borderWidth: 0.9, opacity: 0 });
page.drawRectangle({ x: 70, y: 84, width: 6, height: 118, color: NAVY });
text("COURTAGE-ANSPRUCH NUR BEI ERFOLG", 100, 170, fSB, 7.8, GOLD, 1.6);
para("Eigentümern entstehen während der gesamten Vermarktung durch Musterhaus Immobilien keinerlei Kosten – außer bei gesondert beauftragten Marketingmaßnahmen.", 100, 148, W - 200, fL, 9.5, 14, NAVY);
text(String(d.courtage_hinweis || "Maklervertrag mit einer Laufzeit von 6 Monaten, danach monatlich kündbar."), 100, 106, fSB, 9.5, NAVY, 0.1);
footer();
}
await freieSeiten("courtage");
neueSeite();
kopf("Maßgeschneiderter Service", "Was Sie für die Courtage bekommen.");
para("Die Courtage wird nur im Erfolgsfall fällig – hier steht, wofür.", 70, H - 148, W - 140, fL, 9.5, 12, GRAU);
const xa = 250, xb = 530;
text("PRIVATVERKAUF", xa, H - 178, fSB, 7.5, GRAUH, 1.6);
text("MIT MUSTERHAUS & PARTNER", xb, H - 178, fSB, 7.5, GOLD, 1.6);
page.drawRectangle({ x: xb, y: H - 188, width: 26, height: 1.2, color: GOLD });
const zeilenL: Array<[string, string, string]> = [
["Wertermittlung", "Eigene Einschätzung, oft aus dem Bauchgefühl", "Sachwertverfahren durch zertifizierte Sachverständige"],
["Reichweite", "Ein Portal, begrenzte Sichtbarkeit", "Käuferkartei, alle Portale, Social Media, Schaufenster, Netzwerk"],
["Aufbereitung", "Handyfotos, Grundriss aus dem Bauantrag", "Profifotos, Luftbilder, gestaltete Grundrisse"],
["Interessenten", "Jeder darf kommen – auch Besichtigungstouristen", "Vorqualifizierung und Bonitätsprüfung vor der Besichtigung"],
["Verhandlung", "Emotional, allein, ohne Vergleichsdaten", "Verhandlungsführung mit Marktdaten im Rücken"],
["Abwicklung", "Behördengänge und Notartermin selbst organisieren", "Unterlagen, Notartermin, Übergabe und After-Sales aus einer Hand"],
];
let yl = H - 208;
for (const z of zeilenL) {
text(z[0], 70, yl, fSB, 10.2, NAVY, 0.1);
const l1 = wrapT(z[1], fL, 9.8, xb - 30 - xa);
const l2 = wrapT(z[2], fL, 9.8, W - 70 - xb);
let y1 = yl; for (const s of l1) { text(s, xa, y1, fL, 9.8, GRAUH, 0.1); y1 -= 13; }
let y2 = yl; for (const s of l2) { text(s, xb, y2, fL, 9.8, NAVY, 0.1); y2 -= 13; }
const yn = Math.min(y1, y2) - 8;
hline(70, yn + 4, W - 70, rgb(0.925, 0.929, 0.949), 0.5);
yl = yn - 10;
}
footer();
await freieSeiten("leistung");
neueSeite();
kopf("Die nächsten Schritte", "Diese Unterlagen benötigen wir von Ihnen.");
para("Vieles davon beschaffen wir für Sie – angekreuzt ist, was wir übernehmen können.", 70, H - 148, W - 140, fL, 9.5, 12, GRAU);
const gruppen: string[] = [...new Set(unterlagen.map((u: any) => String(u.gruppe || "Unterlagen")))].slice(0, 3);
const cwU = (W - 140 - 48) / 3;
gruppen.forEach((g, i) => {
const x = 70 + i * (cwU + 24);
text(g.toUpperCase(), x, H - 190, fSB, 7.5, GOLD, 1.4);
page.drawRectangle({ x, y: H - 200, width: 26, height: 1.2, color: GOLD });
let y = H - 224;
for (const u of unterlagen.filter((u: any) => String(u.gruppe || "Unterlagen") === g)) {
page.drawRectangle({ x, y: y - 2, width: 9, height: 9, borderColor: rgb(0.725, 0.741, 0.788), borderWidth: 0.8, opacity: 0 });
if (u.ep) {
page.drawLine({ start: { x: x + 1.8, y: y + 2.4 }, end: { x: x + 3.8, y: y + 0.2 }, thickness: 1.3, color: GOLD });
page.drawLine({ start: { x: x + 3.8, y: y + 0.2 }, end: { x: x + 7.4, y: y + 5.6 }, thickness: 1.3, color: GOLD });
}
let yy = y;
for (const z of wrapT(String(u.titel || ""), fL, 8.8, cwU - 22)) { text(z, x + 18, yy, fL, 8.8, NAVY, 0.1); yy -= 12; }
y = yy - 10;
}
});
page.drawRectangle({ x: 70, y: 96, width: W - 140, height: 46, borderColor: HAIR, borderWidth: 0.8, opacity: 0 });
page.drawRectangle({ x: 70, y: 96, width: 4, height: 46, color: GOLD });
page.drawLine({ start: { x: 92, y: 121 }, end: { x: 95, y: 117.5 }, thickness: 1.3, color: GOLD });
page.drawLine({ start: { x: 95, y: 117.5 }, end: { x: 101, y: 126 }, thickness: 1.3, color: GOLD });
text("Diese Unterlagen beschaffen wir im Rahmen unserer Behördengänge für Sie – Sie müssen sich darum nicht kümmern.", 110, 118, fL, 8.8, NAVY, 0.1);
footer();
await freieSeiten("unterlagen");
neueSeite();
kopf("Die nächsten Schritte", "Haben Sie noch Rückfragen oder Wünsche?");
if (apImg) bildCover(apImg, 70, H - 168 - 124, 190, 124, 0.5, 0.12);
let ny = H - 168 - 124 - 26;
text(ap.name || "", 70, ny, fMarc, 15, NAVY, 0.2);
text(ap.funktion || "", 70, ny - 14, fL, 8.4, GRAU, 0.2);
let nyy = ny - 40;
for (const kzl of kontakt) {
if (!kzl[1]) continue;
text(kzl[0], 70, nyy, fSB, 6.2, GOLD, 1.2);
for (const z of wrapT(kzl[1], fL, 8.6, 300)) { text(z, 70, nyy - 13, fL, 8.6, NAVY, 0.1); nyy -= 11; }
nyy -= 22;
}
vline(522, 190, H - 165);
let ns = H - 175;
naechsteSchritte.slice(0, 3).forEach((s: any, i: number) => {
text("0" + (i + 1), 545, ns, fMarc, 17, GOLD);
text(String(s.titel || ""), 577, ns, fMarc, 13, NAVY, 0.2);
let zz = ns - 15;
for (const z of wrapT(String(s.text || ""), fL, 8.2, 220)) { text(z, 577, zz, fL, 8.2, GRAU, 0.1); zz -= 11.5; }
ns = zz - 22;
});
para("Bitte beachten Sie, dass die vorliegende Auswertung unserer Einschätzung der aktuellen Marktsituation entspricht und keine offizielle Bewertung darstellt. Die Unterlage wurde von Musterhaus Immobilien GmbH sorgfältig erstellt und dient ausschließlich Informationszwecken. Die Angaben gelten zum Zeitpunkt der Erstellung und können sich je nach Marktentwicklung ändern. Für Daten aus Drittanbieterquellen übernimmt Musterhaus Immobilien GmbH keine Haftung. Diese Unterlage begründet weder gegenseitige Rechte und Pflichten noch bildet sie eine Grundlage für etwaige Geschäftsbeziehungen.", 70, 96, W - 140, fL, 6.4, 9, GRAUH);
footer();
neueSeite(true);
if (logoWeiss) {
const r = logoWeiss.height / logoWeiss.width;
let lw = 330, lh = lw * r;
if (lh > 230) { lh = 230; lw = lh / r; }
page.drawImage(logoWeiss, { x: (W - lw) / 2, y: (H - lh) / 2 + 26, width: lw, height: lh });
}
page.drawRectangle({ x: W / 2 - 30, y: H / 2 - 92, width: 60, height: 1.4, color: GOLD });
text(standorte.map((s: any) => (s.ort || "").toUpperCase()).filter(Boolean).join("  ·  ") || "", W / 2, H / 2 - 122, fSB, 8.5, GOLDHELL, 2.2, "c");
text(String(firma.web || "www.immooffice.example").replace(/^https?:\/\//, ""), W / 2, H / 2 - 146, fL, 9, rgb(0.843, 0.859, 0.910), 0.2, "c");
const pdfBytes = await pdf.save({ useObjectStreams: false });
const slug = String(bew.titel || adresse || "Objekt").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
const dateiname = "Marktpreiseinschaetzung_" + slug + "_" + new Date().toISOString().slice(0, 10) + ".pdf";
const pfad = "pdf/" + bewertung_id + "/" + Date.now() + "_" + dateiname;
const { error: upErr } = await admin.storage.from("bewertungen").upload(pfad, pdfBytes, { contentType: "application/pdf", upsert: true });
if (upErr) throw new Error("PDF-Upload: " + upErr.message);
const { data: signed, error: sErr } = await admin.storage.from("bewertungen").createSignedUrl(pfad, 3600);
if (sErr) throw new Error("Signed URL: " + sErr.message);
return jsonOk({ signed_url: signed ? signed.signedUrl : null, dateiname, pfad, seiten: seiteNr, warnungen });
} catch (e) {
const msg = e instanceof Error ? (e.message + " || " + (e.stack || "").slice(0, 300)) : String(e);
console.error("mpe-pdf-erzeugen:", msg);
return jsonErr(500, msg);
}
});
