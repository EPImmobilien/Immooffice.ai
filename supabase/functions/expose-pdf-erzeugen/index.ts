import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
PDFDocument, rgb,
pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath,
} from "npm:pdf-lib@1.17.1";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
let fontkit: any = null;
try { const m = await import("npm:@pdf-lib/fontkit@1.1.1"); fontkit = m.default || m; } catch (_e) {}
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
let QRCode: any = null;
try { const m = await import("npm:qrcode@1.5.3"); QRCode = m.default || m; } catch (_e) {}
const corsHeaders = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Methods": "POST, OPTIONS",
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonOk = (obj: any) => new Response(JSON.stringify({ ok: true, ...obj }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
const jsonErr = (status: number, msg: string) => new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const NAVY = rgb(0.153, 0.188, 0.357);
const GOLD = rgb(0.780, 0.604, 0.333);
const GOLD2 = rgb(0.690, 0.522, 0.290);
const GOLDHELL = rgb(0.851, 0.694, 0.435);
const INK = rgb(0.169, 0.184, 0.239);
const GRAU = rgb(0.514, 0.529, 0.561);
const WEISS = rgb(1, 1, 1);
const HAIR = rgb(0.910, 0.902, 0.882);
const CARDLINE = rgb(0.890, 0.878, 0.851);
const SANFT = rgb(0.972, 0.965, 0.949);
const W = 841.89, H = 595.28;
const fmtEur = (v: any) => v == null ? "" : Number(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtZahl = (v: any) => v == null ? "" : Number(v).toLocaleString("de-DE", { maximumFractionDigits: 1 });
const fmtKm = (m: number) => (Math.max(0.1, Math.round(m / 100) / 10)).toLocaleString("de-DE") + " km";
const fmtProz = (v: any) => v == null ? "" : Number(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
const datumDe = (d: any) => { if (!d) return ""; try { const p = String(d).split("T")[0].split("-"); return p[2] + "." + p[1] + "." + p[0]; } catch { return String(d); } };
function haversine(a: any, b: any) {
const R = 6371000, rad = Math.PI / 180;
const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
return 2 * R * Math.asin(Math.sqrt(s));
}
const UA = { "User-Agent": "ImmoOffice-Expose/1.0 (info@immooffice.example)" };
function ortVarianten(ort: string): string[] {
const o = (ort || "").trim();
if (!o) return [];
const out = [o];
const m = o.match(/^(.+?)\s+(?:OT|Ortsteil)\s+(.+)$/i);
if (m) { out.push(m[2].trim()); out.push(m[1].trim()); }
if (o.includes("/")) for (const t of o.split("/")) if (t.trim()) out.push(t.trim());
return [...new Set(out)];
}
async function nominatim(q: string, timeoutMs = 15000): Promise<any> {
const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=" + encodeURIComponent(q);
try {
const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
if (!r.ok) return null;
const j = await r.json();
if (!j || !j.length) return null;
return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
} catch (_e) { return null; }
}
async function geocode(immo: any): Promise<any> {
if (immo.lage_koordinaten && immo.lage_koordinaten.lat && immo.lage_koordinaten.lon) {
return { pos: immo.lage_koordinaten, stufe: "gespeichert" };
}
const strasse = [immo.strasse, immo.hausnummer].filter(Boolean).join(" ").trim();
const plz = (immo.plz || "").trim();
const orte = ortVarianten(immo.ort || "");
const kandidaten: Array<[string, string]> = [];
for (const ort of orte) {
if (strasse && plz) kandidaten.push([strasse + ", " + plz + " " + ort, "Strasse + PLZ + Ort"]);
if (strasse) kandidaten.push([strasse + ", " + ort, "Strasse + Ort"]);
}
for (const ort of orte) {
if (plz) kandidaten.push([plz + " " + ort, "PLZ + Ort"]);
kandidaten.push([ort + ", Deutschland", "nur Ort"]);
}
if (plz) kandidaten.push([plz + ", Deutschland", "nur PLZ"]);
for (const kv of kandidaten) {
const pos = await nominatim(kv[0]);
if (pos) return { pos, stufe: kv[1] };
await new Promise((r) => setTimeout(r, 1100));
}
return null;
}
async function distanzenErmitteln(pos: any, ort: string, timeoutJeMs = 20000) {
const q = "[out:json][timeout:25];("
+ "node(around:2500," + pos.lat + "," + pos.lon + ")[\"highway\"=\"bus_stop\"];"
+ "nwr(around:3000," + pos.lat + "," + pos.lon + ")[\"amenity\"=\"kindergarten\"];"
+ "nwr(around:5000," + pos.lat + "," + pos.lon + ")[\"amenity\"=\"school\"];"
+ "nwr(around:3000," + pos.lat + "," + pos.lon + ")[\"shop\"~\"^(supermarket|convenience)$\"];"
+ "node(around:9000," + pos.lat + "," + pos.lon + ")[\"highway\"=\"motorway_junction\"];"
+ ");out center 400;";
const OVERPASS = [
"https://overpass-api.de/api/interpreter",
"https://overpass.kumi.systems/api/interpreter",
"https://overpass.private.coffee/api/interpreter",
"https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
let j: any = null;
let letzterFehler = "";
for (const opUrl of OVERPASS) {
try {
const r = await fetch(opUrl, {
method: "POST",
headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
body: "data=" + encodeURIComponent(q),
signal: AbortSignal.timeout(timeoutJeMs),
});
if (!r.ok) { letzterFehler = "HTTP " + r.status + " (" + new URL(opUrl).hostname + ")"; continue; }
j = await r.json();
break;
} catch (e) {
letzterFehler = ((e as Error).message || String(e)) + " (" + new URL(opUrl).hostname + ")";
}
}
if (!j) throw new Error("Overpass nicht erreichbar - alle Server ausgelastet. Bitte in ein paar Minuten erneut versuchen. Letzter Fehler: " + letzterFehler);
const kat: Record<string, number> = {};
const merke = (k: string, d: number) => { if (kat[k] == null || d < kat[k]) kat[k] = d; };
for (const el of j.elements || []) {
const p = el.type === "node" ? { lat: el.lat, lon: el.lon } : (el.center ? { lat: el.center.lat, lon: el.center.lon } : null);
if (!p) continue;
const d = haversine(pos, p);
const t = el.tags || {};
if (t.highway === "bus_stop") merke("bus", d);
else if (t.amenity === "kindergarten") merke("kita", d);
else if (t.amenity === "school") {
const name = (t.name || "").toLowerCase();
if (name.includes("grundschule")) merke("grundschule", d);
else if (/gymnasium|gesamtschule|oberschule|realschule|regionale/.test(name)) merke("weiterfuehrend", d);
else { merke("grundschule_fallback", d); merke("weiterfuehrend_fallback", d); }
}
else if (t.shop) merke("einkaufen", d);
else if (t.highway === "motorway_junction") merke("autobahn", d);
}
let zentrum: number | null = null;
try {
for (const o of ortVarianten(ort)) {
const p = await nominatim(o + ", Deutschland", Math.min(timeoutJeMs, 15000));
if (p) { zentrum = haversine(pos, p); break; }
}
} catch (_e) {}
const grundschule = kat.grundschule != null ? kat.grundschule : kat.grundschule_fallback;
const weiterf = kat.weiterfuehrend != null ? kat.weiterfuehrend : kat.weiterfuehrend_fallback;
const out: any[] = [];
if (kat.bus != null) out.push({ label: "Bushaltestelle", wert: fmtKm(kat.bus) });
if (kat.kita != null) out.push({ label: "Kindergarten", wert: fmtKm(kat.kita) });
if (grundschule != null) out.push({ label: "Grundschule", wert: fmtKm(grundschule) });
if (weiterf != null) out.push({ label: "Weiterf. Schule", wert: fmtKm(weiterf) });
if (kat.einkaufen != null) out.push({ label: "Einkaufen", wert: fmtKm(kat.einkaufen) });
if (zentrum != null) out.push({ label: "Zentrum", wert: fmtKm(zentrum) });
if (kat.autobahn != null) out.push({ label: "Autobahn", wert: fmtKm(kat.autobahn) });
return out;
}
const CARTO_KEY = "cb1_2bcg_1_392d13ac34b041e5dfb26ea2";
function lonZuPx(lon: number, zf: number) { return (lon + 180) / 360 * (2 ** zf) * 512; }
function latZuPx(lat: number, zf: number) { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (2 ** zf) * 512; }
async function karteErzeugen(markerPos: any, zoom = 14, centerPos: any = null, wCss = 512): Promise<Uint8Array> {
const OUTW = 1024, OUTH = 1536, T = 512;
const z = Math.max(11, Math.min(17, Math.round(zoom || 14)));
const c = (centerPos && isFinite(Number(centerPos.lat)) && isFinite(Number(centerPos.lon)))
? { lat: Number(centerPos.lat), lon: Number(centerPos.lon) } : markerPos;
const wC = Math.max(200, Math.min(1024, Math.round(wCss || 512)));
const hC = Math.round(wC * 1.5);
let zf = z;
while (wC * 2 * 2 ** (zf - z) < OUTW && zf < 18) zf++;
const skala = 2 ** (zf - z) * 2;
const spanW = Math.round(wC * skala), spanH = Math.round(hC * skala);
const cx = lonZuPx(c.lon, zf), cy = latZuPx(c.lat, zf);
const left = cx - spanW / 2, top = cy - spanH / 2;
const tx0 = Math.floor(left / T), ty0 = Math.floor(top / T);
const tx1 = Math.floor((left + spanW - 1) / T), ty1 = Math.floor((top + spanH - 1) / T);
const voll = new Image((tx1 - tx0 + 1) * T, (ty1 - ty0 + 1) * T);
const subs = ["a", "b", "c", "d"];
const maxTile = (2 ** zf) - 1;
let ti = 0;
for (let tx = tx0; tx <= tx1; tx++) {
for (let ty = ty0; ty <= ty1; ty++) {
if (ty < 0 || ty > maxTile) continue;
const txn = ((tx % (maxTile + 1)) + (maxTile + 1)) % (maxTile + 1);
const url = "https://" + subs[(ti++) % 4] + ".basemaps.cartocdn.com/rastertiles/voyager/" + zf + "/" + txn + "/" + ty + "@2x.png?key=" + CARTO_KEY;
const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
if (!r.ok) throw new Error("Karten-Kachel fehlgeschlagen (" + r.status + ")");
const tile = await Image.decode(new Uint8Array(await r.arrayBuffer()));
voll.composite(tile, (tx - tx0) * T, (ty - ty0) * T);
}
}
let canvas = voll.crop(Math.round(left - tx0 * T), Math.round(top - ty0 * T), spanW, spanH);
if (canvas.width !== OUTW || canvas.height !== OUTH) canvas = canvas.resize(OUTW, OUTH);
const s = OUTW / spanW;
const mx = Math.round((lonZuPx(markerPos.lon, zf) - left) * s);
const my = Math.round((latZuPx(markerPos.lat, zf) - top) * s);
const NAVY_C = Image.rgbaToColor(39, 48, 91, 255);
const GOLD_C = Image.rgbaToColor(199, 154, 85, 255);
const WHITE_C = Image.rgbaToColor(255, 255, 255, 255);
const R = 26;
for (let px = -R - 4; px <= R + 4; px++) for (let py = -R - 4; py <= R + 4; py++) {
const d = Math.sqrt(px * px + py * py);
const X = mx + px, Y = my + py;
if (X < 0 || Y < 0 || X >= canvas.width - 1 || Y >= canvas.height - 1) continue;
if (d <= R + 3 && d > R) canvas.setPixelAt(X + 1, Y + 1, WHITE_C);
if (d <= R && d > R - 5) canvas.setPixelAt(X + 1, Y + 1, NAVY_C);
else if (d <= R - 5) canvas.setPixelAt(X + 1, Y + 1, GOLD_C);
if (d <= 5) canvas.setPixelAt(X + 1, Y + 1, WHITE_C);
}
return await canvas.encodeJPEG(82);
}
type Lauf = { t: string; fett: boolean; kursiv: boolean };
const AUSZ_RE = /(\*\*\*|\*\*|\*)(?=\S)([\s\S]*?)\1|(?<![\p{L}\p{N}])(___|__|_)(?=\S)([\s\S]*?)\3(?![\p{L}\p{N}])/gu;
function auszeichnung(s: string, fett = false, kursiv = false): Lauf[] {
const out: Lauf[] = [];
let i = 0;
for (const m of (s || "").matchAll(AUSZ_RE)) {
const idx = m.index as number;
if (idx > i) out.push({ t: s.slice(i, idx), fett, kursiv });
const marke = m[1] || m[3], inhalt = m[1] ? m[2] : m[4];
const rand = /^(\s*)([\s\S]*?)(\s*)$/.exec(inhalt) as RegExpExecArray;
if (rand[1]) out.push({ t: rand[1], fett, kursiv });
out.push(...auszeichnung(rand[2], fett || marke.length >= 2, kursiv || marke.length !== 2));
if (rand[3]) out.push({ t: rand[3], fett, kursiv });
i = idx + m[0].length;
}
if (i < (s || "").length) out.push({ t: s.slice(i), fett, kursiv });
return out;
}
function zeilenArt(absatz: string): { art: "text" | "ueberschrift" | "punkt"; rest: string } {
const h = /^#{1,3}\s+(.*)$/.exec(absatz);
if (h) return { art: "ueberschrift", rest: h[1].trim() };
const p = /^[-–•*]\s+(.*)$/.exec(absatz);
if (p) return { art: "punkt", rest: p[1].trim() };
return { art: "text", rest: absatz };
}
function ohneAuszeichnung(s: any): string {
return String(s == null ? "" : s).split(/\r?\n/).map((z) => {
const { art, rest } = zeilenArt(z.trim());
const t = auszeichnung(rest).map((l) => l.t).join("");
return art === "punkt" ? "- " + t : t;
}).join("\n");
}
const ICON_SET = ["sonne", "blatt", "blitz", "wifi", "haus", "baum", "bad", "bett", "kamin", "garage", "schirm", "tuer"];
async function highlightsVorschlagen(immo: any): Promise<any[]> {
const key = Deno.env.get("ANTHROPIC_API_KEY");
if (!key) throw new Error("ANTHROPIC_API_KEY nicht gesetzt");
const kontext = [
immo.objekttitel, ohneAuszeichnung(immo.beschreibung_objekt), ohneAuszeichnung(immo.beschreibung_ausstattung_expose || immo.beschreibung_ausstattung),
immo.energie_klasse ? "Energieklasse " + immo.energie_klasse : "",
immo.baujahr ? "Baujahr " + immo.baujahr : "",
].filter(Boolean).join("\n\n").slice(0, 4000);
const prompt = "Du bist Immobilien-Marketing-Texter. Aus dem folgenden Objekttext sollen genau 4 kurze Verkaufs-Highlights fuer ein Expose entstehen.\n\nAntworte AUSSCHLIESSLICH mit einem JSON-Array, ohne Markdown:\n[{\"icon\":\"...\",\"zeile1\":\"...\",\"zeile2\":\"...\"}, ...] (genau 4 Eintraege)\n\nRegeln:\n- icon aus dieser Liste: " + ICON_SET.join(", ") + "\n- zeile1: max. 22 Zeichen\n- zeile2: max. 24 Zeichen\n- Nur Fakten aus dem Text. Deutsch.\n\nObjekttext:\n" + kontext;
const r = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
});
if (!r.ok) throw new Error("KI-Anfrage fehlgeschlagen (" + r.status + ")");
const j = await r.json();
const text = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
const arr = JSON.parse(text.replace(/```json|```/g, "").trim());
return (Array.isArray(arr) ? arr : []).slice(0, 4).map((h: any) => ({
icon: ICON_SET.includes(h.icon) ? h.icon : "haus",
zeile1: String(h.zeile1 || "").slice(0, 30),
zeile2: String(h.zeile2 || "").slice(0, 32),
}));
}
async function sloganVorschlagen(immo: any): Promise<string> {
const key = Deno.env.get("ANTHROPIC_API_KEY");
if (!key) throw new Error("ANTHROPIC_API_KEY nicht gesetzt");
const kontext = [
immo.objekttitel, ohneAuszeichnung(immo.beschreibung_objekt),
ohneAuszeichnung(immo.beschreibung_ausstattung_expose || immo.beschreibung_ausstattung),
ohneAuszeichnung(immo.beschreibung_lage),
].filter(Boolean).join("\n\n").slice(0, 3000);
const prompt = "Du bist Immobilien-Marketing-Texter. Formuliere genau EINEN kurzen, eleganten Slogan fuer die Titelseite eines Immobilien-Exposes.\n\nRegeln:\n- Maximal 60 Zeichen\n- Deutsch, ohne Anfuehrungszeichen, ohne Emojis\n- Bezug auf konkrete Staerken aus dem Objekttext, keine leeren Superlative\n- Antworte AUSSCHLIESSLICH mit dem Slogan, ohne Erklaerung\n\nObjekttext:\n" + kontext;
const r = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 100, messages: [{ role: "user", content: prompt }] }),
});
if (!r.ok) throw new Error("KI-Anfrage fehlgeschlagen (" + r.status + ")");
const j = await r.json();
const text = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ");
return text.replace(/["„“”'`]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}
const FONT_QUELLEN: Record<string, string> = {
"fonts/Montserrat-Light.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Light.ttf",
"fonts/Montserrat-Medium.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Medium.ttf",
"fonts/Montserrat-SemiBold.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBold.ttf",
"fonts/GreatVibes-Regular.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf",
"fonts/Montserrat-Italic.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Italic.ttf",
"fonts/Montserrat-SemiBoldItalic.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBoldItalic.ttf",
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
const LOGO_CACHE = "expose/logo-weiss-v2.png";
async function logoWeissLaden(admin: any): Promise<Uint8Array | null> {
try {
const { data: cached } = await admin.storage.from("branding-assets").download(LOGO_CACHE);
if (cached) return new Uint8Array(await cached.arrayBuffer());
} catch (_e) {}
try {
const { data } = await admin.storage.from("branding-assets").download("logo.png");
if (!data) return null;
const img = await Image.decode(new Uint8Array(await data.arrayBuffer()));
for (let x = 1; x <= img.width; x++) for (let y = 1; y <= img.height; y++) {
const px = img.getPixelAt(x, y);
const a = px & 0xff;
if (a === 0) continue;
const r = (px >>> 24) & 0xff, g = (px >>> 16) & 0xff, b = (px >>> 8) & 0xff;
const max = Math.max(r, g, b), min = Math.min(r, g, b);
const lum = 0.299 * r + 0.587 * g + 0.114 * b;
const saettigung = max - min;
const istGold = r > 110 && r >= g && g > b && (r - b) > 30;
if (istGold) continue;
if (lum > 200 && saettigung < 40) img.setPixelAt(x, y, Image.rgbaToColor(0, 0, 0, 0));
else img.setPixelAt(x, y, Image.rgbaToColor(255, 255, 255, a));
}
const png = await img.encode();
try { await admin.storage.from("branding-assets").upload(LOGO_CACHE, png, { contentType: "image/png", upsert: true }); } catch (_e2) {}
return png;
} catch (_e) { return null; }
}
async function verlaufPng(hoehe: number, vonAlpha: number, bisAlpha: number): Promise<Uint8Array> {
const w = 8, h = Math.max(2, Math.round(hoehe));
const img = new Image(w, h);
for (let y = 1; y <= h; y++) {
const t = (y - 1) / (h - 1);
const a = Math.round(255 * (vonAlpha + (bisAlpha - vonAlpha) * t));
const c = Image.rgbaToColor(18, 23, 48, Math.max(0, Math.min(255, a)));
for (let x = 1; x <= w; x++) img.setPixelAt(x, y, c);
}
return await img.encode();
}
async function apFotoLaden(admin: any, fotoUrl: string | null): Promise<any> {
const v = (fotoUrl || "").trim();
if (!v) return null;
const istPng = v.toLowerCase().endsWith(".png");
if (/^https?:\/\//i.test(v)) {
try {
const r = await fetch(v);
if (!r.ok) return null;
return { buf: await r.arrayBuffer(), istPng };
} catch (_e) { return null; }
}
const webPfad = v.replace(/\.[^/.]+$/, "") + "_web.jpg";
try {
const { data, error } = await admin.storage.from("profile-fotos").download(webPfad);
if (!error && data) return { buf: await data.arrayBuffer(), istPng, web: true };
} catch (_e) {}
try {
const { data } = await admin.storage.from("profile-fotos").download(v, {
transform: { width: 800, height: 1200, resize: "contain", quality: 80, format: "origin" },
});
if (data) {
const b = await data.arrayBuffer();
try { await admin.storage.from("profile-fotos").upload(webPfad, new Uint8Array(b), { contentType: istPng ? "image/png" : "image/jpeg", upsert: true }); } catch (_e2) {}
return { buf: b, istPng };
}
} catch (_e) {}
try {
const { data } = await admin.storage.from("profile-fotos").download(v);
if (!data) return null;
return { buf: await data.arrayBuffer(), istPng };
} catch (_e) {}
}
Deno.serve(async (req) => {
if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
const laufId = crypto.randomUUID();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const t0 = Date.now();
const schritt = async (name: string, detail?: string) => {
let mem = "";
try {
const m: any = (Deno as any).memoryUsage ? (Deno as any).memoryUsage() : null;
if (m) mem = " | rss=" + Math.round(m.rss / 1048576) + "MB heap=" + Math.round(m.heapUsed / 1048576) + "MB";
} catch (_e) {}
try {
await admin.from("expose_debug").insert({
lauf_id: laufId, schritt: name,
detail: (detail == null ? "" : String(detail)).slice(0, 400) + " | +" + (Date.now() - t0) + "ms" + mem,
});
} catch (_e) {}
};
try {
const body = await req.json();
const immobilie_id = body.immobilie_id;
const modus = body.modus || "pdf";
if (!immobilie_id) return jsonErr(400, "immobilie_id fehlt");
const authHeader = req.headers.get("authorization");
const diagnoseSecret = req.headers.get("x-diagnose-secret");
let userData: any = null;
if (diagnoseSecret) {
const { data: okSecret } = await admin.rpc("diagnose_secret_pruefen", { p: diagnoseSecret });
if (!okSecret) return jsonErr(401, "Nicht erlaubt.");
const { data: immoZ } = await admin.from("immobilien").select("zustaendig_id").eq("id", immobilie_id).maybeSingle();
let pid: string | null = immoZ?.zustaendig_id || null;
if (!pid) { const { data: chef } = await admin.from("profiles").select("id").eq("role", "chef").limit(1).maybeSingle(); pid = chef?.id || null; }
if (!pid) return jsonErr(403, "Kein Ansprechpartner ableitbar");
userData = { user: { id: pid } };
} else {
if (!authHeader) return jsonErr(401, "Kein Auth-Token");
const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
const { data: ud, error: userErr } = await userClient.auth.getUser();
if (userErr || !ud || !ud.user) return jsonErr(401, "Nicht authentifiziert");
userData = ud;
}
const { data: profil } = await admin.from("profiles").select("id,name,titel,firma_id,funktion,telefon,email,foto_url").eq("id", userData.user.id).maybeSingle();
if (!profil) return jsonErr(403, "Kein Teamzugang");
const { data: immo, error: iErr } = await admin.from("immobilien").select("*").eq("id", immobilie_id).maybeSingle();
if (iErr) throw iErr;
if (!immo) return jsonErr(404, "Objekt nicht gefunden");
const { data: gsRow } = await admin.from("immobilie_grundstueck").select("*").eq("immobilie_id", immobilie_id).maybeSingle();
const gs: any = gsRow || {};
const GS_FALLBACK: Record<string, Record<string, string>> = {
erschliessung: { erschlossen: "Erschlossen", teilerschlossen: "Teilerschlossen", unerschlossen: "Unerschlossen" },
bebaubar_nach: { b_plan: "B-Plan", bebauungsplan: "Bebauungsplan (§30 BauGB)", nachbarbebauung: "Nachbarbebauung (§34 BauGB)",
aussengebiet: "Außengebiet (§35 BauGB)", bauland_ohne_b_plan: "Bauland ohne B-Plan", bauerwartungsland: "Bauerwartungsland",
kein_bauland: "kein Bauland", laenderspezifisch: "länderspezifisch" },
bebaubar_mit: { einfamilienhaus: "Einfamilienhaus", doppelhaus: "Doppelhaus", reihenhaus: "Reihenhaus", mehrfamilienhaus: "Mehrfamilienhaus",
villa: "Villa", gewerbe: "Gewerbe", kleingewerbe: "Kleingewerbe", buero: "Büro", hotel: "Hotel", gastronomie: "Gastronomie",
lager: "Lager", produktion: "Produktion", industrie: "Industrie", garagen: "Garagen", stellplaetze: "Stellplätze", parkhaus: "Parkhaus",
einzelhandelgross: "Einzelhandel (groß)", einzelhandelklein: "Einzelhandel (klein)", garten: "Garten", wald: "Wald", ackerland: "Ackerland",
obstpflanzung: "Obstpflanzung", camping: "Camping", bootsstaende: "Bootsstände", bauerwartungsland: "Bauerwartungsland", keinebebauung: "keine Bebauung" },
};
const gsWerte: Record<string, Record<string, string>> = {};
try {
const { data: fw } = await admin.from("onoffice_feld_werte").select("feld, oo_key, label").in("feld", ["erschliessung", "bebaubar_nach", "bebaubar_mit"]);
for (const r of (fw || [])) { (gsWerte[r.feld] = gsWerte[r.feld] || {})[String(r.oo_key)] = String(r.label || "").replace(/_/g, " "); }
} catch (_e) {}
const gsText = (feld: string, key: any): string => {
const k = String(key == null ? "" : key).trim();
if (!k) return "";
return (GS_FALLBACK[feld] && GS_FALLBACK[feld][k]) || (gsWerte[feld] && gsWerte[feld][k]) || k;
};
const gsListe = (arr: any): string => Array.isArray(arr) ? arr.map((k) => gsText("bebaubar_mit", k)).filter(Boolean).join(", ") : gsText("bebaubar_mit", arr);
const gsZahl = (v: any): string => v == null || v === "" ? "" : String(v).replace(".", ",");
const istGrundstueck = /grundst/i.test(String(immo.objektart || "")) || Object.keys(gs).some((k) => !["immobilie_id", "quelle", "updated_at"].includes(k) && gs[k] != null && gs[k] !== "");
for (const k of ["hausgeld", "hausgeld_nicht_umlagefaehig", "energie_kennwert", "baujahr", "energie_baujahr_anlage",
"wohnflaeche", "nutzflaeche", "zimmer", "schlafzimmer", "badezimmer", "anzahl_balkone", "anzahl_terrassen"]) {
if (immo[k] != null && !(Number(String(immo[k]).replace(",", ".")) > 0)) immo[k] = null;
}
if (istGrundstueck) {
for (const k of ["baujahr", "hausgeld", "hausgeld_nicht_umlagefaehig", "energie_kennwert", "energie_klasse", "energieausweis_typ",
"energie_traeger", "energie_baujahr_anlage", "energie_gueltig_bis", "heizungsart", "fenster", "fenster_verglasung"]) immo[k] = null;
}
await schritt("start", "modus=" + modus + " " + immo.bezeichnung + (istGrundstueck ? " (Grundstueck)" : ""));
const warnungen: string[] = [];
if (modus === "distanzen") {
const geo = await geocode(immo);
if (!geo) return jsonErr(422, "Adresse konnte nicht geocodiert werden.");
const distanzen = await distanzenErmitteln(geo.pos, immo.ort || "");
await admin.from("immobilien").update({ lage_distanzen: distanzen, lage_koordinaten: geo.pos }).eq("id", immobilie_id);
return jsonOk({ lage_distanzen: distanzen, lage_koordinaten: geo.pos, geocoding_stufe: geo.stufe });
}
if (modus === "highlights") {
const highlights = await highlightsVorschlagen(immo);
if (highlights.length < 4) return jsonErr(422, "KI konnte keine 4 Highlights ableiten.");
await admin.from("immobilien").update({ expose_highlights: highlights }).eq("id", immobilie_id);
return jsonOk({ expose_highlights: highlights });
}
if (modus === "slogan") {
if (!((immo.beschreibung_objekt || "").trim()) && !((immo.objekttitel || "").trim())) return jsonErr(422, "Keine Objektbeschreibung vorhanden – bitte zuerst Text pflegen.");
const slogan = await sloganVorschlagen(immo);
if (!slogan) return jsonErr(422, "KI konnte keinen Slogan ableiten.");
await admin.from("immobilien").update({ expose_slogan: slogan }).eq("id", immobilie_id);
return jsonOk({ expose_slogan: slogan });
}
if (modus === "karte") {
const center = (body.center && isFinite(Number(body.center.lat)) && isFinite(Number(body.center.lon)))
? { lat: Number(body.center.lat), lon: Number(body.center.lon) } : null;
let geo = await geocode(immo);
if (!geo && center) geo = { pos: center, stufe: "ausschnitt" };
if (!geo) return jsonErr(422, "Adresse konnte nicht geocodiert werden.");
const zoomWunsch = Number(body.zoom) || 14;
const wCss = Number(body.w_css) || 512;
const jpg = await karteErzeugen(geo.pos, zoomWunsch, center, wCss);
const pfad = "immobilien/" + immobilie_id + "/" + Date.now() + "_lageplan_auto.jpg";
const { error: upErr } = await admin.storage.from("immobilie-dateien").upload(pfad, jpg, { contentType: "image/jpeg", upsert: false });
if (upErr) throw new Error("Karten-Upload: " + upErr.message);
const { error: dErr } = await admin.from("immobilie_datei").insert({
immobilie_id, name: "Lageplan_automatisch.jpg", mime_type: "image/jpeg", size_bytes: jpg.length,
speicher_typ: "supabase", storage_path: pfad, quelle: "expose_karte_generator",
ersteller_id: userData.user.id, doktyp: "Lageplan", kategorie: "lageplan", oeffentlich: true,
titel: "Lageplan (" + (center ? "eigener Ausschnitt" : "automatisch") + ", OpenStreetMap, Zoom " + Math.max(11, Math.min(17, Math.round(zoomWunsch))) + ")", sortierung: 0,
});
if (dErr) throw dErr;
if (geo.stufe !== "ausschnitt") await admin.from("immobilien").update({ lage_koordinaten: geo.pos }).eq("id", immobilie_id);
return jsonOk({ storage_path: pfad, geocoding_stufe: geo.stufe });
}
const { data: dateien } = await admin.from("immobilie_datei").select("*").eq("immobilie_id", immobilie_id).order("sortierung", { ascending: true });
const alleDateien = dateien || [];
const fotos = alleDateien.filter((d: any) => d.kategorie === "foto" && d.oeffentlich && d.doktyp !== "Energieskala" && d.speicher_typ === "supabase" && d.expose_ausschliessen !== true);
const grundrisse = alleDateien.filter((d: any) => d.kategorie === "grundriss" && d.oeffentlich && d.speicher_typ === "supabase" && d.expose_ausschliessen !== true);
let lageplaene = alleDateien.filter((d: any) => d.kategorie === "lageplan" && d.oeffentlich && d.speicher_typ === "supabase" && d.expose_ausschliessen !== true);
if (!fotos.length) return jsonErr(422, "Keine externen Fotos am Objekt.");
let distanzen: any[] = Array.isArray(immo.lage_distanzen) ? immo.lage_distanzen : [];
let highlights: any[] = Array.isArray(immo.expose_highlights) ? immo.expose_highlights : [];
let pos: any = (immo.lage_koordinaten && immo.lage_koordinaten.lat) ? immo.lage_koordinaten : null;
if (!pos) {
const geo = await geocode(immo);
if (geo) {
pos = geo.pos;
await admin.from("immobilien").update({ lage_koordinaten: pos }).eq("id", immobilie_id);
if (geo.stufe !== "Strasse + PLZ + Ort" && geo.stufe !== "gespeichert") warnungen.push("Adresse nur grob geocodiert (" + geo.stufe + ").");
} else warnungen.push("Adresse konnte nicht geocodiert werden.");
}
const autoJobs: Promise<void>[] = [];
if (!distanzen.length && pos) autoJobs.push((async () => {
try { distanzen = await distanzenErmitteln(pos, immo.ort || "", 6000); await admin.from("immobilien").update({ lage_distanzen: distanzen }).eq("id", immobilie_id); }
catch (e) { warnungen.push("Distanzen: " + (e as Error).message + " – Tipp: im Exposé-Reiter \"Distanzen ermitteln\" klicken und das PDF danach neu erzeugen."); }
})());
if (!highlights.length) autoJobs.push((async () => {
try { highlights = await highlightsVorschlagen(immo); await admin.from("immobilien").update({ expose_highlights: highlights }).eq("id", immobilie_id); }
catch (e) { warnungen.push("Highlights: " + (e as Error).message); }
})());
if (!lageplaene.length && pos) autoJobs.push((async () => {
try {
const jpg = await karteErzeugen(pos);
const pfadK = "immobilien/" + immobilie_id + "/" + Date.now() + "_lageplan_auto.jpg";
await admin.storage.from("immobilie-dateien").upload(pfadK, jpg, { contentType: "image/jpeg" });
const { data: neu } = await admin.from("immobilie_datei").insert({
immobilie_id, name: "Lageplan_automatisch.jpg", mime_type: "image/jpeg", size_bytes: jpg.length,
speicher_typ: "supabase", storage_path: pfadK, quelle: "expose_karte_generator",
ersteller_id: userData.user.id, doktyp: "Lageplan", kategorie: "lageplan", oeffentlich: true,
titel: "Lageplan (automatisch, OpenStreetMap)", sortierung: 0,
}).select().single();
if (neu) lageplaene = [neu];
} catch (e) { warnungen.push("Lageplan: " + (e as Error).message); }
})());
if (autoJobs.length) { await Promise.all(autoJobs); await schritt("auto-befuellung-ok", "jobs=" + autoJobs.length); }
await schritt("vorbereitung-ok", "fotos=" + fotos.length + " grundrisse=" + grundrisse.length + " lageplan=" + lageplaene.length);
let standorte: any[] = [];
{ const { data } = await admin.from("firma_stammdaten").select("firma_name,strasse,plz,ort,sortierung").eq("aktiv", true).order("sortierung"); standorte = data || []; }
let finAnn: any = null;
{ const { data } = await admin.from("finanzierungs_annahmen").select("*").eq("aktiv", true).limit(1).maybeSingle(); finAnn = data; }
let ap: any = profil;
if (immo.zustaendig_id && immo.zustaendig_id !== profil.id) {
const { data } = await admin.from("profiles").select("id,name,titel,firma_id,funktion,telefon,email,foto_url").eq("id", immo.zustaendig_id).maybeSingle();
if (data) ap = data;
}
const apName = [ap.titel, ap.name].map((x: any) => (x || "").trim()).filter(Boolean).join(" ");
let firma: any = null;
if (ap.firma_id) { const { data } = await admin.from("firma_stammdaten").select("*").eq("id", ap.firma_id).maybeSingle(); if (data && data.aktiv !== false) firma = data; }
if (!firma) { const { data } = await admin.from("firma_stammdaten").select("*").eq("slug", "standard").maybeSingle(); firma = data; }
if (!firma) { const { data } = await admin.from("firma_stammdaten").select("*").eq("aktiv", true).order("sortierung").limit(1).maybeSingle(); firma = data; }
if (!firma) return jsonErr(500, "Firma-Stammdaten fehlen");
const pdf = await PDFDocument.create();
if (fontkit) { try { pdf.registerFontkit(fontkit); } catch (_e) {} }
pdf.setTitle("Expose " + (immo.bezeichnung || ""));
const lade = (p: string) => fontLaden(admin, p);
const fb = await Promise.all([
lade("fonts/Montserrat-Regular.ttf"), lade("fonts/Montserrat-Bold.ttf"), lade("fonts/Marcellus-Regular.ttf"),
lade("fonts/Montserrat-Light.ttf"), lade("fonts/Montserrat-Medium.ttf"), lade("fonts/Montserrat-SemiBold.ttf"),
lade("fonts/GreatVibes-Regular.ttf"),
lade("fonts/Montserrat-Italic.ttf"), lade("fonts/Montserrat-SemiBoldItalic.ttf"),
]);
const bR = fb[0], bB = fb[1], bMarc = fb[2], bM = fb[4], bSB = fb[5], bScript = fb[6], bI = fb[7], bSBI = fb[8];
if (!bR || !bMarc) return jsonErr(500, "Basis-Fonts fehlen in branding-assets");
const emb = async (b: ArrayBuffer) => schnellSchrift(await pdf.embedFont(b, { subset: false }));
const fR = await emb(bR);
const fB = bB ? await emb(bB) : fR;
const fMarc = await emb(bMarc);
const fM = bM ? await emb(bM) : fR;
const fSB = bSB ? await emb(bSB) : fB;
const fScript = bScript ? await emb(bScript) : fMarc;
const fI = bI ? await emb(bI) : fR;
const fSBI = bSBI ? await emb(bSBI) : fSB;
if (!bI) warnungen.push("Kursive Schrift (Montserrat-Italic) nicht geladen – Kursivtext erscheint aufrecht.");
let logoWeiss: any = null, logoNavy: any = null;
try { const b = await logoWeissLaden(admin); if (b) logoWeiss = await pdf.embedPng(b); } catch (_e) {}
try { const { data } = await admin.storage.from("branding-assets").download("logo.png"); if (data) logoNavy = await pdf.embedPng(await data.arrayBuffer()); } catch (_e) {}
const vlUnten = await pdf.embedPng(await verlaufPng(340, 0, 0.92));
const vlOben = await pdf.embedPng(await verlaufPng(180, 0.55, 0));
await schritt("assets-ok");
const MAX_KANTE = 1600;
let bildNr = 0;
const bildCache = new Map<string, any>();
async function bild(d: any) {
if (!d) return null;
if (bildCache.has(d.id)) return bildCache.get(d.id);
const n = ++bildNr;
try {
const istPng = (d.mime_type || "").includes("png") || d.storage_path.toLowerCase().endsWith(".png");
const webPfad = d.storage_path.replace(/\.[^/.]+$/, "") + "_web.jpg";
let buf: ArrayBuffer | null = null;
let quelle = "web";
try {
const { data, error } = await admin.storage.from("immobilie-dateien").download(webPfad);
if (!error && data) {
const b = await data.arrayBuffer();
const u = new Uint8Array(b);
if (u.length > 3 && u[0] === 0xFF && u[1] === 0xD8) buf = b;
}
} catch (_e) {}
if (!buf) {
try {
await admin.functions.invoke("bild-web-variante", { body: { datei_id: d.id, neu: true } });
const { data, error } = await admin.storage.from("immobilie-dateien").download(webPfad);
if (!error && data) { buf = await data.arrayBuffer(); quelle = "web-neu"; }
} catch (_e) {}
}
if (!buf) {
quelle = "transform";
try {
const { data, error } = await admin.storage.from("immobilie-dateien").download(d.storage_path, {
transform: { width: MAX_KANTE, height: MAX_KANTE, resize: "contain", quality: 75, format: "origin" },
});
if (!error && data) {
buf = await data.arrayBuffer();
const uT = new Uint8Array(buf);
if (uT.length > 3 && uT[0] === 0xFF && uT[1] === 0xD8) {
try { await admin.storage.from("immobilie-dateien").upload(webPfad, uT, { contentType: "image/jpeg", upsert: true }); } catch (_e2) {}
}
}
} catch (_e) {}
}
if (!buf) {
quelle = "original";
const { data } = await admin.storage.from("immobilie-dateien").download(d.storage_path);
if (!data) return null;
buf = await data.arrayBuffer();
}
let img;
if (quelle === "web" || quelle === "web-neu") { try { img = await pdf.embedJpg(buf); } catch (_ej) { img = await pdf.embedPng(buf); } }
else if (istPng) {
const px = buf.byteLength > 24 ? new DataView(buf).getUint32(16) * new DataView(buf).getUint32(20) : 0;
if (px > 1500000) {
warnungen.push("Bild ohne Web-Fassung uebersprungen, PNG zu gross (" + (px / 1e6).toFixed(1) + " MP): " + (d.name || ""));
bildCache.set(d.id, null);
await schritt("bild-UEBERSPRUNGEN", n + " " + (d.name || ""));
return null;
}
img = await pdf.embedPng(buf);
}
else img = await pdf.embedJpg(buf);
bildCache.set(d.id, img);
await schritt("bild", n + " " + quelle + " " + Math.round(buf.byteLength / 1024) + "kB");
return img;
} catch (e) {
warnungen.push("Bild nicht ladbar: " + (d.name || "") + " (" + (e as Error).message + ")");
await schritt("bild-FEHLER", n + " " + (d.name || "") + " " + (e as Error).message);
return null;
}
}
let coverDatei = fotos[0];
if (immo.expose_titelbild_id) {
const hit = fotos.find((f: any) => f.id === immo.expose_titelbild_id);
if (hit) coverDatei = hit;
}
const restFotos = fotos.filter((f: any) => f.id !== coverDatei.id);
const beschreibungsFoto = restFotos[0] || coverDatei;
const istPlanBild = (d: any) => /liegenschaft|lageplan|flurkarte|karte|\bplan\b|grundriss|ansicht|visualisier|berechnung|skizze|zeichnung|schnitt/i
.test(((d && d.titel) || "") + " " + ((d && d.name) || ""));
const echteFotos = restFotos.filter((f: any) => !istPlanBild(f));
const lageFoto = echteFotos.length > 1 ? echteFotos[echteFotos.length - 1] : (restFotos.length > 1 ? restFotos[restFotos.length - 1] : coverDatei);
const kontaktFoto = coverDatei;
const galerieRoh = restFotos.filter((f: any) => f.id !== beschreibungsFoto.id && f.id !== lageFoto.id);
const galerieEcht = galerieRoh.filter((f: any) => !istPlanBild(f));
const galeriePlan = galerieRoh.filter((f: any) => istPlanBild(f));
const galerieFotos = [...galerieEcht, ...galeriePlan];
const planArtVon = (d: any): string => {
const t = (((d && d.titel) || "") + " " + ((d && d.name) || "")).toLowerCase();
if (/grundriss/.test(t)) return "Grundriss";
if (/ansicht/.test(t)) return "Ansicht";
if (/lageplan|liegenschaft|flurkarte/.test(t)) return "Lageplan";
if (/fl(ä|ae)chenberechn|berechnung|din ?277/.test(t)) return "Flächenberechnung";
return "Plan";
};
const planKopf: Record<string, string> = { Grundriss: "Grundrisse", Ansicht: "Ansichten", Lageplan: "Lageplan", "Flächenberechnung": "Flächenberechnung", Plan: "Planunterlagen" };
const nurGrundrisse = grundrisse.every((g: any) => planArtVon(g) === "Grundriss");
const fotoPaare: any[][] = [];
if (galerieFotos.length === 0 && restFotos.length) fotoPaare.push([restFotos[0]]);
for (let i = 0; i < galerieEcht.length; i += 2) fotoPaare.push(galerieEcht.slice(i, i + 2));
for (let i = 0; i < galeriePlan.length; i += 2) fotoPaare.push(galeriePlan.slice(i, i + 2));
let page: any = null;
const wCache = new Map<any, Map<string, number>>();
function charW(f: any, ch: string) {
let m = wCache.get(f);
if (!m) { m = new Map(); wCache.set(f, m); }
let w = m.get(ch);
if (w == null) { w = f.widthOfTextAtSize(ch, 1000); m.set(ch, w); }
return w;
}
const breite = (s: string, f: any, size: number, cs = 0) => { let t = 0; for (const ch of (s || "")) t += charW(f, ch); return t * size / 1000 + cs * Math.max(0, (s || "").length - 1); };
function text(s: string, x: number, y: number, f: any, size: number, farbe: any, cs = 0, align = "l") {
s = s || "";
const tw = breite(s, f, size, cs);
let cx = align === "c" ? x - tw / 2 : align === "r" ? x - tw : x;
if (cs > 0.01) { for (const ch of s) { page.drawText(ch, { x: cx, y, size, font: f, color: farbe }); cx += charW(f, ch) * size / 1000 + cs; } }
else page.drawText(s, { x: cx, y, size, font: f, color: farbe });
return tw;
}
function wrapT(s: string, f: any, size: number, maxw: number): string[] {
const out: string[] = [];
const spaceW = charW(f, " ") * size / 1000;
for (const absatz of (s || "").split(/\r?\n/)) {
if (!absatz.trim()) { out.push(""); continue; }
let zeile = "";
let zeileW = 0;
for (const w2 of absatz.split(/\s+/).filter(Boolean)) {
const wW = breite(w2, f, size);
const neuW = zeile ? zeileW + spaceW + wW : wW;
if (neuW > maxw && zeile) { out.push(zeile); zeile = w2; zeileW = wW; } else { zeile = zeile ? zeile + " " + w2 : w2; zeileW = neuW; }
}
if (zeile) out.push(zeile);
}
return out;
}
function wrapAbs(s: string, f: any, size: number, maxw: number): Array<{ t: string; letzte: boolean }> {
const out: Array<{ t: string; letzte: boolean }> = [];
const spaceW = charW(f, " ") * size / 1000;
for (const absatz of (s || "").split(/\r?\n/)) {
if (!absatz.trim()) { out.push({ t: "", letzte: true }); continue; }
const zeilen: string[] = [];
let zeile = "";
let zeileW = 0;
for (const w2 of absatz.split(/\s+/).filter(Boolean)) {
const wW = breite(w2, f, size);
const neuW = zeile ? zeileW + spaceW + wW : wW;
if (neuW > maxw && zeile) { zeilen.push(zeile); zeile = w2; zeileW = wW; } else { zeile = zeile ? zeile + " " + w2 : w2; zeileW = neuW; }
}
if (zeile) zeilen.push(zeile);
zeilen.forEach((z, i) => out.push({ t: z, letzte: i === zeilen.length - 1 }));
}
return out;
}
function textJust(z: string, x: number, y: number, f: any, size: number, maxw: number, farbe: any) {
const worte = (z || "").split(" ").filter(Boolean);
if (worte.length < 2) { text(z, x, y, f, size, farbe); return; }
const normal = charW(f, " ") * size / 1000;
let summe = 0;
for (const w2 of worte) summe += breite(w2, f, size);
const luecke = (maxw - summe) / (worte.length - 1);
if (luecke > normal * 3.4 || luecke < normal * 0.55) { text(z, x, y, f, size, farbe); return; }
let cx = x;
for (const w2 of worte) {
page.drawText(w2, { x: cx, y, size, font: f, color: farbe });
cx += breite(w2, f, size) + luecke;
}
}
type Stueck = { t: string; f: any };
type Wort = { teile: Stueck[]; w: number };
type FZeile = { worte: Wort[]; letzte: boolean; erste: boolean; art: "text" | "ueberschrift" | "punkt" };
const EINZUG = 14;
const schriftFuer = (l: Lauf) => l.fett && l.kursiv ? fSBI : l.fett ? fSB : l.kursiv ? fI : fR;
function worteAus(absatz: string, size: number, fettAlles = false): Wort[] {
const worte: Wort[] = [];
let akt: Wort | null = null;
for (const l of auszeichnung(absatz, fettAlles, false)) {
const f = schriftFuer(l);
l.t.split(/\s+/).forEach((st, i) => {
if (i > 0 && akt && akt.teile.length) { worte.push(akt); akt = null; }
if (!st) return;
if (!akt) akt = { teile: [], w: 0 };
akt.teile.push({ t: st, f }); akt.w += breite(st, f, size);
});
}
if (akt && (akt as Wort).teile.length) worte.push(akt);
return worte;
}
function wrapF(s: string, size: number, maxw: number): FZeile[] {
const out: FZeile[] = [];
const spaceW = charW(fR, " ") * size / 1000;
for (const roh of (s || "").split(/\r?\n/)) {
const absatz = roh.trim();
if (!absatz) { out.push({ worte: [], letzte: true, erste: true, art: "text" }); continue; }
const { art, rest } = zeilenArt(absatz);
const bw = art === "punkt" ? maxw - EINZUG : maxw;
const zeilen: Wort[][] = [];
let zeile: Wort[] = [], zw = 0;
for (const w of worteAus(rest, size, art === "ueberschrift")) {
const neuW = zeile.length ? zw + spaceW + w.w : w.w;
if (neuW > bw && zeile.length) { zeilen.push(zeile); zeile = [w]; zw = w.w; } else { zeile.push(w); zw = neuW; }
}
if (zeile.length) zeilen.push(zeile);
zeilen.forEach((z, i) => out.push({ worte: z, letzte: i === zeilen.length - 1, erste: i === 0, art }));
}
return out;
}
function zeileZeichnen(z: FZeile, x: number, y: number, size: number, maxw: number, farbe: any, blocksatz: boolean) {
let x0 = x, bw = maxw;
if (z.art === "punkt") {
if (z.erste) page.drawSvgPath("M 3 0 L 6 3 L 3 6 L 0 3 Z", { x: x + 1, y: y + 6.4, color: GOLD, scale: 0.62 });
x0 = x + EINZUG; bw = maxw - EINZUG;
}
const farbeZ = z.art === "ueberschrift" ? NAVY : farbe;
const spaceW = charW(fR, " ") * size / 1000;
let luecke = spaceW;
if (blocksatz && z.art === "text" && !z.letzte && z.worte.length > 1) {
let summe = 0; for (const w of z.worte) summe += w.w;
const l2 = (bw - summe) / (z.worte.length - 1);
if (l2 <= spaceW * 3.4 && l2 >= spaceW * 0.55) luecke = l2;
}
let cx = x0;
for (const w of z.worte) {
for (const st of w.teile) { page.drawText(st.t, { x: cx, y, size, font: st.f, color: farbeZ }); cx += breite(st.t, st.f, size); }
cx += luecke;
}
}
const luftVor = (z: FZeile, lh: number) => z.art === "ueberschrift" && z.erste ? lh * 0.45 : 0;
function fliesstextFit(s: string, maxw: number, oy: number, unten: number) {
const stufen = [14.2, 13.6, 13.0, 12.6, 12.2];
const zeilen = wrapF(s, 9, maxw);
const hoehe = (lh: number) => zeilen.reduce((h, z, i) => h + (i ? lh + luftVor(z, lh) : 0), 0);
let lh = stufen[0];
for (const st of stufen) { lh = st; if (hoehe(st) <= oy - unten) break; }
let kap = 0, h = 0;
for (const z of zeilen) { const dz = kap ? lh + luftVor(z, lh) : 0; if (h + dz > oy - unten) break; h += dz; kap++; }
kap = Math.max(6, kap);
return { zeilen, lh, kap, passt: zeilen.length <= kap };
}
function fliesstextZeichnen(fit: { zeilen: FZeile[]; lh: number; kap: number }, x: number, y: number, maxw: number) {
fit.zeilen.slice(0, fit.kap).forEach((z, i) => {
if (i) y -= luftVor(z, fit.lh);
if (z.worte.length) zeileZeichnen(z, x, y, 9, maxw, INK, true);
y -= fit.lh;
});
return y;
}
function para(s: string, x: number, y: number, maxw: number, f = fR, size = 8.8, lh = 14.5, farbe = INK) {
for (const z of wrapT(s, f, size, maxw)) { if (z) text(z, x, y, f, size, farbe); y -= lh; }
return y;
}
const hline = (x0: number, y: number, x1: number, farbe = HAIR, dicke = 0.7) => page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: dicke, color: farbe });
const vlineZ = (x: number, y0: number, y1: number, farbe = HAIR, dicke = 0.7) => page.drawLine({ start: { x, y: y0 }, end: { x, y: y1 }, thickness: dicke, color: farbe });
function eyebrow(s: string, x: number, y: number, farbe = GOLD2) {
text((s || "").toUpperCase(), x, y, fSB, 8, farbe, 2.6);
page.drawRectangle({ x, y: y - 12, width: 24, height: 1.6, color: GOLD });
}
function bildCover(img: any, x: number, y: number, w2: number, h2: number, fx = 0.5, fy = 0.5) {
if (!img) { page.drawRectangle({ x, y, width: w2, height: h2, color: rgb(0.93, 0.93, 0.92) }); return; }
const s = Math.max(w2 / img.width, h2 / img.height);
const dw = img.width * s, dh = img.height * s;
const dx = x - (dw - w2) * fx, dy = y - (dh - h2) * (1 - fy);
page.pushOperators(pushGraphicsState(), moveTo(x, y), lineTo(x + w2, y), lineTo(x + w2, y + h2), lineTo(x, y + h2), closePath(), clip(), endPath());
page.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
page.pushOperators(popGraphicsState());
}
function kiBadge(d: any, x: number, y: number) {
if (!d || !d.ki_bearbeitet) return;
const s = "MIT KI BEARBEITET";
const tw = breite(s, fSB, 5.5, 1.4);
page.drawRectangle({ x, y, width: tw + 14, height: 13, color: NAVY, opacity: 0.82 });
text(s, x + 7, y + 4, fSB, 5.5, WEISS, 1.4);
}
function karte(x: number, y: number, w2: number, h2: number) {
page.drawRectangle({ x, y, width: w2, height: h2, color: WEISS, borderColor: CARDLINE, borderWidth: 0.9 });
}
function pen(farbe: any) { return { borderColor: farbe, borderWidth: 1.15, color: undefined as any }; }
function icon(name: string, x: number, y: number, s: number, farbe = NAVY) {
const L = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({ start: { x: x + x1 * s, y: y + y1 * s }, end: { x: x + x2 * s, y: y + y2 * s }, thickness: 1.15, color: farbe, lineCap: 1 });
const C = (cx: number, cy: number, r: number) => page.drawEllipse({ x: x + cx * s, y: y + cy * s, xScale: r * s, yScale: r * s, ...pen(farbe) });
const svg = (p: string) => page.drawSvgPath(p, { x, y: y + s, scale: s / 24, borderColor: farbe, borderWidth: 1.15 });
switch (name) {
case "haus": L(0, .5, .5, .95); L(.5, .95, 1, .5); L(.12, .52, .12, 0); L(.12, 0, .88, 0); L(.88, 0, .88, .52); L(.42, 0, .42, .3); L(.58, 0, .58, .3); L(.42, .3, .58, .3); break;
case "baum": L(.5, .95, .2, .55); L(.2, .55, .38, .55); L(.38, .55, .12, .22); L(.12, .22, .88, .22); L(.88, .22, .62, .55); L(.62, .55, .8, .55); L(.8, .55, .5, .95); L(.5, .22, .5, 0); break;
case "tuer": L(.2, 0, .2, .92); L(.2, .92, .7, .92); L(.7, .92, .7, 0); L(.2, 0, .7, 0); C(.6, .45, .035); break;
case "bett": L(0, 0, 0, .55); L(0, .18, 1, .18); L(1, .18, 1, 0); L(.06, .06, .06, .18); L(.94, .06, .94, .18); L(.1, .3, .38, .3); L(.1, .42, .38, .42); L(.1, .3, .1, .42); L(.38, .3, .38, .42); break;
case "bad": L(0, .3, 1, .3); L(0, .3, .04, .48); L(1, .3, .96, .48); L(.04, .48, .96, .48); L(.18, .3, .12, .05); L(.82, .3, .88, .05); L(.15, .48, .15, .85); C(.28, .85, .13); break;
case "blatt": svg("M 4 20 C 3 8 14 1 21 3 C 22 13 13 21 4 20 Z"); L(.17, .17, .72, .68); break;
case "schirm": svg("M 2 11 C 3 4 21 4 22 11 Z"); L(.5, .54, .5, .06); svg("M 12 22 C 12 24 17 24 17 22"); break;
case "garage": L(0, 0, 0, .6); L(0, .6, .5, .95); L(.5, .95, 1, .6); L(1, .6, 1, 0); L(.2, .12, .8, .12); L(.2, .27, .8, .27); L(.2, .42, .8, .42); break;
case "kamin": svg("M 12 1 C 4 9 7 14 8 21 C 13 19 12 15 15 13 C 19 16 17 19 16 21 C 22 15 19 7 12 1 Z"); break;
case "kalender": L(0, 0, 0, .8); L(0, .8, 1, .8); L(1, .8, 1, 0); L(0, 0, 1, 0); L(0, .58, 1, .58); L(.25, .8, .25, .95); L(.75, .8, .75, .95); C(.3, .3, .045); C(.55, .3, .045); break;
case "sonne": C(.5, .5, .24); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; L(.5 + Math.cos(a) * .34, .5 + Math.sin(a) * .34, .5 + Math.cos(a) * .48, .5 + Math.sin(a) * .48); } break;
case "wifi": C(.5, .14, .045); svg("M 6 14 C 9 10 15 10 18 14"); svg("M 3 10 C 8 4 16 4 21 10"); break;
case "blitz": L(.55, .95, .22, .45); L(.22, .45, .45, .45); L(.45, .45, .4, .05); L(.4, .05, .78, .55); L(.78, .55, .52, .55); L(.52, .55, .55, .95); break;
case "telefon": page.drawRectangle({ x: x + .3 * s, y, width: .4 * s, height: .95 * s, ...pen(farbe) }); L(.42, .1, .58, .1); break;
case "mail": page.drawRectangle({ x, y: y + .12 * s, width: s, height: .7 * s, ...pen(farbe) }); L(0, .82, .5, .42); L(.5, .42, 1, .82); break;
case "globus": C(.5, .47, .47); L(.03, .47, .97, .47); page.drawEllipse({ x: x + .5 * s, y: y + .47 * s, xScale: .2 * s, yScale: .47 * s, ...pen(farbe) }); break;
default: C(.5, .5, .35);
}
}
const istKauf = immo.vertragsart !== "vermietung";
const preis = istKauf ? (immo.angebotspreis != null ? immo.angebotspreis : immo.verkaufspreis) : immo.kaltmiete;
const preisLabel = istKauf ? "Kaufpreis" : "Kaltmiete";
const nZahl = (v: any) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return isNaN(n) ? null : n; };
const kaltZahl = istKauf ? null : nZahl(immo.kaltmiete);
const nkZahl = nZahl(immo.nebenkosten);
const hkZahl = nZahl(immo.heizkosten);
const warmmiete = kaltZahl != null && (nkZahl != null || hkZahl != null) ? kaltZahl + (nkZahl || 0) + (hkZahl || 0) : null;
const ortZeile = [immo.plz, immo.ort].filter(Boolean).join(" ");
const strasseZeile = [immo.strasse, immo.hausnummer].filter(Boolean).join(" ");
const adresseVoll = [strasseZeile, ortZeile].filter(Boolean).join(", ");
const objektzeileFuss = ((immo.objektart || "Immobilie") + " · " + (immo.ort || "")).toUpperCase();
const kiHinweis = fotos.concat(grundrisse, lageplaene).some((d: any) => d.ki_bearbeitet);
const firmaWeb = ((firma.web || "www.immooffice.example") + "").replace(/^https?:\/\//, "");
const firmaZeile = firma.firma_name + " · " + firma.strasse + " · " + firma.plz + " " + firma.ort;
function courtageSatzAus(v: any): string {
const s = (v == null ? "" : String(v)).trim();
if (!s) return "3,57 %";
const nurZahl = /^[\d.,\s%]+$/.test(s);
const m = s.replace(",", ".").match(/\d+(\.\d+)?/);
if (m && (s.includes("%") || nurZahl)) {
const num = parseFloat(m[0]);
if (isFinite(num) && num > 0) return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
}
return s;
}
const courtageSatz = courtageSatzAus(immo.provision_aussen);
function grestSatz(plz: string): number {
const p = parseInt(String(plz || "").slice(0, 2), 10);
if (!isFinite(p)) return 6.0;
if ([17, 18, 19].includes(p)) return 6.0;
if ([20, 21, 22].includes(p)) return 5.5;
if ([23, 24, 25].includes(p)) return 6.5;
if ([26, 27, 29, 30, 31, 37, 38, 49].includes(p)) return 5.0;
if ([28].includes(p)) return 5.0;
if ([10, 12, 13].includes(p)) return 6.0;
if ([3, 14, 15, 16].includes(p)) return 6.5;
if ([6, 39].includes(p)) return 5.0;
if ([1, 2, 4, 8, 9].includes(p)) return 5.5;
if ([7, 98, 99].includes(p)) return 6.5;
if (p >= 32 && p <= 59) return 6.5;
if (p >= 60 && p <= 65) return 6.0;
if (p >= 66 && p <= 67) return 6.5;
if (p >= 68 && p <= 79) return 5.0;
if (p >= 80 && p <= 97) return 3.5;
return 6.0;
}
const grest = immo.grunderwerbsteuer_satz != null ? Number(immo.grunderwerbsteuer_satz) : grestSatz(immo.plz);
const notarProz = (finAnn && finAnn.notar_prozent != null) ? Number(finAnn.notar_prozent) : 2.0;
const zinsProz = (finAnn && finAnn.zinssatz != null) ? Number(finAnn.zinssatz) : 3.9;
const tilgProz = (finAnn && finAnn.tilgung != null) ? Number(finAnn.tilgung) : 2.0;
const ekProz = (finAnn && finAnn.eigenkapital_prozent != null) ? Number(finAnn.eigenkapital_prozent) : 20;
const finHinweis = (finAnn && finAnn.hinweis) || "Unverbindliche Beispielrechnung, keine Finanzierungsberatung. Konditionen abhängig von Bonität und Anbieter.";
const courtProz = (() => {
if (!istKauf || immo.provisionsfrei) return 0;
const s = (immo.provision_aussen == null ? "" : String(immo.provision_aussen)).trim();
if (!s) return 3.57;
const nurZahl = /^[\d.,\s%]+$/.test(s);
const m = s.replace(",", ".").match(/\d+(\.\d+)?/);
if (m && (s.includes("%") || nurZahl)) return parseFloat(m[0]) || 0;
return 0;
})();
const kaufpreisZahl = (istKauf && preis != null) ? Number(preis) : null;
const nkGrest = kaufpreisZahl != null ? kaufpreisZahl * grest / 100 : null;
const nkNotar = kaufpreisZahl != null ? kaufpreisZahl * notarProz / 100 : null;
const nkCourt = kaufpreisZahl != null ? kaufpreisZahl * courtProz / 100 : 0;
const gesamtAufwand = kaufpreisZahl != null ? kaufpreisZahl + (nkGrest || 0) + (nkNotar || 0) + (nkCourt || 0) : null;
const eigenkapital = gesamtAufwand != null ? gesamtAufwand * ekProz / 100 : null;
const darlehen = gesamtAufwand != null ? gesamtAufwand - (eigenkapital || 0) : null;
const monatsrate = darlehen != null ? darlehen * (zinsProz + tilgProz) / 100 / 12 : null;
const zeigeNK = istKauf && kaufpreisZahl != null && immo.expose_nebenkosten !== false;
const mieteIst = immo.miete_ist != null ? Number(immo.miete_ist) : (immo.kaltmiete != null ? Number(immo.kaltmiete) : null);
const mieteSoll = immo.miete_soll != null ? Number(immo.miete_soll) : null;
const mieteBasis = mieteIst != null ? mieteIst : mieteSoll;
const hausgeld = immo.hausgeld != null ? Number(immo.hausgeld) : null;
const hausgeldNU = immo.hausgeld_nicht_umlagefaehig != null ? Number(immo.hausgeld_nicht_umlagefaehig) : null;
const jahresRoh = mieteBasis != null ? mieteBasis * 12 : null;
const jahresNetto = jahresRoh != null ? jahresRoh - ((hausgeldNU || 0) * 12) : null;
const bruttoRendite = (jahresRoh != null && kaufpreisZahl) ? jahresRoh / kaufpreisZahl * 100 : null;
const nettoRendite = (jahresNetto != null && gesamtAufwand) ? jahresNetto / gesamtAufwand * 100 : null;
const kpFaktor = (jahresRoh && kaufpreisZahl) ? kaufpreisZahl / jahresRoh : null;
const zeigeRendite = !!immo.expose_rendite && istKauf && kaufpreisZahl != null && mieteBasis != null;
let courtage = "";
if (!istKauf) {
courtage = "Für den Mieter provisionsfrei. Die Vergütung des Maklers erfolgt ausschließlich durch den Vermieter (Bestellerprinzip, § 2 Abs. 1a WoVermRG).";
} else if (immo.provisionsfrei) {
courtage = "Für den Käufer provisionsfrei. Der Makler wird ausschließlich für den Verkäufer entgeltlich tätig; dem Käufer entsteht keine Courtage.";
} else {
courtage = "Die Käufercourtage beträgt " + courtageSatz + " des notariell beurkundeten Kaufpreises, inklusive der gesetzlichen Mehrwertsteuer. Sie ist verdient und fällig mit Abschluss des notariellen Kaufvertrages.";
const artTyp = String(immo.objektart || "") + " " + String(immo.objekttyp || "");
const gilt656c = !istGrundstueck && (/wohnung/i.test(artTyp) || (/haus/i.test(artTyp) && !/mehrfamilien|mehrgenerationen|wohn-? ?und ?gesch|gewerbe|zinshaus|rendite|anlage/i.test(artTyp)));
const innenM = String(immo.provision_innen == null ? "" : immo.provision_innen).replace(",", ".").match(/\d+(\.\d+)?/);
const innenProz = innenM ? parseFloat(innenM[0]) : null;
if (innenProz != null && innenProz <= 0) {
courtage += " Der Makler ist ausschließlich für den Käufer entgeltlich tätig; mit dem Verkäufer ist keine Provision vereinbart.";
} else if (gilt656c) {
courtage += (innenProz == null || Math.abs(innenProz - courtProz) < 0.005)
? " Der Makler ist auch für den Verkäufer provisionspflichtig tätig; die Innenprovision ist in gleicher Höhe vereinbart (§ 656c BGB)."
: " Der Makler ist auch für den Verkäufer provisionspflichtig tätig (§ 656c BGB).";
} else if (innenProz != null) {
courtage += " Der Makler ist auch für den Verkäufer entgeltlich tätig.";
}
}
const hinweise = "Sämtliche Angaben beruhen auf Informationen des Eigentümers bzw. Dritter und wurden von uns nicht auf ihre Richtigkeit überprüft. Eine Haftung für Vollständigkeit und Richtigkeit wird nicht übernommen. Alle Flächen- und Maßangaben sind ca.-Werte und nicht zur Berechnung von Ansprüchen geeignet. Zwischenverkauf, Zwischenvermietung und Irrtum bleiben vorbehalten. Dieses Exposé ist urheberrechtlich geschützt und ausschließlich für den Empfänger bestimmt; eine Weitergabe an Dritte ist ohne unsere Zustimmung nicht gestattet."
+ (kiHinweis ? " Einzelne Abbildungen wurden mit künstlicher Intelligenz bearbeitet bzw. virtuell möbliert; die dargestellte Einrichtung ist nicht Vertragsbestandteil." : "");
const ausstattungText = ((immo.beschreibung_ausstattung_expose || immo.beschreibung_ausstattung) || "").trim();
const planListe: string[] = ["cover", "inhalt", "objekt"];
if (ausstattungText) planListe.push("ausstattung");
planListe.push("eckdaten", "detail");
const hatEnergie = !!(immo.energie_kennwert || immo.energie_klasse);
if (hatEnergie) planListe.push("energie");
grundrisse.forEach((_g: any, i: number) => planListe.push("grundriss" + i));
fotoPaare.forEach((_p: any, i: number) => planListe.push("fotos" + i));
planListe.push("lage");
if (lageplaene.length) planListe.push("makro");
if (zeigeRendite) planListe.push("rendite");
if (zeigeNK) planListe.push("nebenkosten");
planListe.push("kontakt", "agb", "widerruf", "formular", "schluss");
const seiteNr = (key: string) => planListe.indexOf(key) + 1;
function footer(nr: number) {
hline(52, 38, W - 52, GOLD, 0.8);
text("MUSTERHAUS IMMOBILIEN", 52, 26, fSB, 6.3, NAVY, 1.8);
text(objektzeileFuss, W / 2, 26, fM, 6.3, GRAU, 1.8, "c");
text(String(nr).padStart(2, "0"), W - 52, 26, fSB, 7, GOLD2, 1, "r");
}
function neueSeite(weissGrund = true) {
page = pdf.addPage([W, H]);
if (weissGrund) page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: WEISS });
}
function logoOben() {
if (!logoNavy) return;
const r = logoNavy.height / logoNavy.width;
let lw = 84, lh = lw * r;
if (lh > 34) { lh = 34; lw = lh / r; }
page.drawImage(logoNavy, { x: W - 52 - lw, y: H - 30 - lh, width: lw, height: lh });
}
neueSeite(false);
bildCover(await bild(coverDatei), 0, 0, W, H, 0.5, 0.45);
page.drawImage(vlUnten, { x: 0, y: 0, width: W, height: 340 });
page.drawImage(vlOben, { x: 0, y: H - 180, width: W, height: 180 });
const logoImg = logoWeiss || logoNavy;
if (logoImg) {
const lw = 120, lh = lw * (logoImg.height / logoImg.width);
page.drawImage(logoImg, { x: W - 52 - lw, y: 40, width: lw, height: lh });
}
const badgeText = immo.provisionsfrei ? "PROVISIONSFREI" : (istKauf ? "KAUF" : "MIETE");
const bw = breite(badgeText, fSB, 7, 2.2);
page.drawRectangle({ x: 52, y: 214, width: bw + 24, height: 17, color: GOLD });
text(badgeText, 64, 219, fSB, 7, NAVY, 2.2);
const titelText = immo.objekttitel || immo.bezeichnung || "Expose";
let tGr = 31;
let titelZeilen = wrapT(titelText, fMarc, tGr, W - 120);
while (titelZeilen.length > 2 && tGr > 21) { tGr -= 1; titelZeilen = wrapT(titelText, fMarc, tGr, W - 120); }
titelZeilen = titelZeilen.slice(0, 2);
const tLh = tGr + 5;
let ty = titelZeilen.length > 1 ? 172 : 154;
titelZeilen.forEach((z, zi) => { text(z, 52, ty, fMarc, tGr, (titelZeilen.length > 1 && zi === 0) ? WEISS : GOLDHELL, 0.4); ty -= tLh; });
if (adresseVoll) text(adresseVoll, 52, 108, fM, 11, WEISS, 0.5);
if (immo.expose_slogan) text(immo.expose_slogan, 52, 80, fR, 9.5, rgb(0.92, 0.92, 0.94), 0.8);
kiBadge(coverDatei, 52, H - 48);
neueSeite();
if (logoNavy) page.drawImage(logoNavy, { x: W - 320, y: H - 470, width: 280, height: 280 * (logoNavy.height / logoNavy.width), opacity: 0.06 });
eyebrow("Inhalt", 64, H - 78);
logoOben();
const toc: Array<[string, string]> = [];
toc.push([String(seiteNr("objekt")).padStart(2, "0"), "Objektbeschreibung"]);
if (ausstattungText) toc.push([String(seiteNr("ausstattung")).padStart(2, "0"), "Ausstattung"]);
toc.push([String(seiteNr("eckdaten")).padStart(2, "0"), "Eckdaten auf einen Blick"]);
toc.push([String(seiteNr("detail")).padStart(2, "0"), "Weitere Angaben & Konditionen"]);
if (hatEnergie) toc.push([String(seiteNr("energie")).padStart(2, "0"), "Energieausweis"]);
if (grundrisse.length) toc.push([String(seiteNr("grundriss0")).padStart(2, "0"), nurGrundrisse ? "Grundrisse" : "Pläne & Grundrisse"]);
if (fotoPaare.length) toc.push([String(seiteNr("fotos0")).padStart(2, "0"), "Impressionen"]);
toc.push([String(seiteNr("lage")).padStart(2, "0"), "Lage & Umgebung"]);
if (lageplaene.length) toc.push([String(seiteNr("makro")).padStart(2, "0"), "Makrolage"]);
if (zeigeRendite) toc.push([String(seiteNr("rendite")).padStart(2, "0"), "Rendite auf einen Blick"]);
if (zeigeNK) toc.push([String(seiteNr("nebenkosten")).padStart(2, "0"), "Transparenz & Finanzierung"]);
toc.push([String(seiteNr("kontakt")).padStart(2, "0"), "Ihr Kontakt"]);
toc.push([String(seiteNr("agb")).padStart(2, "0"), "AGB"]);
toc.push([String(seiteNr("widerruf")).padStart(2, "0"), "Widerrufsbelehrung"]);
let tocY = H - 124;
for (const te of toc) {
text(te[0], 64, tocY, fSB, 9.5, GOLD2, 1);
text(te[1], 100, tocY, fM, 9.8, INK, 0.3);
tocY -= 22;
}
vlineZ(446, 208, H - 118);
const sxS = 486;
text("UNSERE STANDORTE", sxS, H - 124, fSB, 7, GOLD2, 2.2);
let sy = H - 150;
for (const so of standorte.slice(0, 4)) {
text(((so.ort || "") + (so.sortierung === 1 ? "  ·  HAUPTSITZ" : "")).toUpperCase(), sxS, sy, fSB, 9, NAVY, 1);
text((so.strasse || "") + " · " + (so.plz || "") + " " + (so.ort || ""), sxS, sy - 14, fR, 8, GRAU, 0.2);
sy -= 40;
}
sy -= 8;
text("ZERTIFIZIERTE SACHVERSTÄNDIGE & ENERGIEBERATER", sxS, sy, fSB, 7, GOLD2, 2.2);
para("Als zertifizierte Sachverständige für Immobilienbewertung und Energieberater begleiten wir Sie von der fundierten Werteinschätzung über alle Fragen rund um Energieausweis und energetische Sanierung bis zum notariellen Abschluss – persönlich, diskret und mit regionaler Marktkenntnis.", sxS, sy - 18, W - 64 - sxS, fR, 8, 12.5, INK);
const bh = 170;
page.drawRectangle({ x: 0, y: 0, width: W, height: bh, color: NAVY });
let apBild: any = null;
const apFoto = await apFotoLaden(admin, ap.foto_url);
if (apFoto) {
try {
if (apFoto.web) { try { apBild = await pdf.embedJpg(apFoto.buf); } catch (_ej) { apBild = await pdf.embedPng(apFoto.buf); } }
else apBild = apFoto.istPng ? await pdf.embedPng(apFoto.buf) : await pdf.embedJpg(apFoto.buf);
}
catch (_e) { warnungen.push("AP-Foto konnte nicht eingebettet werden."); }
} else warnungen.push("Kein Profilfoto beim Ansprechpartner hinterlegt.");
if (apBild) bildCover(apBild, 0, 0, 190, bh, 0.5, 0.75);
const apX = apBild ? 226 : 64;
text("IHR ANSPRECHPARTNER", apX, bh - 46, fSB, 8, GOLD, 2.6);
text(apName || "", apX, bh - 74, fMarc, 17, WEISS, 0.4);
text(ap.funktion || "", apX, bh - 90, fR, 8.5, rgb(0.85, 0.86, 0.9), 0.5);
const kontaktzeilen: Array<[string, string]> = [["telefon", ap.telefon || firma.telefon || ""], ["mail", ap.email || firma.email || ""], ["globus", firmaWeb]];
let ky = bh - 46;
for (const kz of kontaktzeilen) {
if (kz[1]) { icon(kz[0], 510, ky - 8, 10, GOLD); text(kz[1], 530, ky - 6, fM, 9, WEISS, 0.3); }
ky -= 30;
}
text(firmaZeile, 510, 26, fM, 6.2, rgb(0.72, 0.74, 0.82), 0.5);
await schritt("seite-inhalt-ok");
neueSeite();
bildCover(await bild(beschreibungsFoto), W - 330, 0, 330, H, 0.45, 0.5);
kiBadge(beschreibungsFoto, W - 330 + 14, 26);
eyebrow("Objektbeschreibung", 64, H - 72);
const obUebT = immo.ueberschrift_objektbeschreibung || "Einziehen und wohlfühlen.";
let obGr = 23, obUeb = wrapT(obUebT, fMarc, obGr, 400);
while (obUeb.length > 2 && obGr > 17) { obGr -= 1; obUeb = wrapT(obUebT, fMarc, obGr, 400); }
obUeb = obUeb.slice(0, 2);
let uy = H - 112;
for (const z of obUeb) { text(z, 64, uy, fMarc, obGr, NAVY, 0.3); uy -= obGr + 4; }
let oy = uy - 6;
const TXTB = 415;
const obFit = fliesstextFit((immo.beschreibung_objekt || "").trim(), TXTB, oy, 46);
oy = fliesstextZeichnen(obFit, 64, oy, TXTB);
if (!obFit.passt) warnungen.push("Objektbeschreibung gekürzt (" + (obFit.zeilen.length - obFit.kap) + " Zeilen passen trotz verdichtetem Zeilenabstand nicht auf die Seite).");
page.drawRectangle({ x: 0, y: 0, width: W - 330, height: 14, color: GOLD });
text("MUSTERHAUS IMMOBILIEN", 64, 26, fSB, 6.3, NAVY, 1.8);
text(String(seiteNr("objekt")).padStart(2, "0"), W - 350, 26, fSB, 7, GOLD2, 1, "r");
if (ausstattungText) {
neueSeite();
const ausstattungsFoto = restFotos[1] || beschreibungsFoto;
bildCover(await bild(ausstattungsFoto), W - 330, 0, 330, H, 0.5, 0.5);
kiBadge(ausstattungsFoto, W - 330 + 14, 26);
eyebrow("Ausstattung", 64, H - 72);
text("Ausstattung im Detail.", 64, H - 118, fMarc, 23, NAVY, 0.3);
let ayy = H - 150;
const items = ausstattungText.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
if (items.length >= 3) {
let gekuerzt = 0;
for (const it of items) {
const art0 = zeilenArt(it);
const zeilen = wrapF(art0.art === "ueberschrift" ? it : art0.rest, 9, 399);
if (ayy - (zeilen.length - 1) * 13.6 < 66) { gekuerzt++; continue; }
if (art0.art === "ueberschrift") { ayy -= 3; for (const z of zeilen) { zeileZeichnen(z, 64, ayy, 9, 415, INK, false); ayy -= 13.6; } }
else {
page.drawSvgPath("M 3 0 L 6 3 L 3 6 L 0 3 Z", { x: 64, y: ayy + 6.4, color: GOLD, scale: 0.62 });
for (const z of zeilen) { zeileZeichnen(z, 80, ayy, 9, 399, INK, false); ayy -= 13.6; }
}
ayy -= 4.5;
}
if (gekuerzt) warnungen.push("Ausstattung gekürzt (" + gekuerzt + " Punkte passen nicht auf die Seite).");
} else {
const aFit = fliesstextFit(ausstattungText, TXTB, ayy, 46);
ayy = fliesstextZeichnen(aFit, 64, ayy, TXTB);
if (!aFit.passt) warnungen.push("Ausstattung gekürzt (" + (aFit.zeilen.length - aFit.kap) + " Zeilen passen nicht auf die Seite).");
}
page.drawRectangle({ x: 0, y: 0, width: W - 330, height: 14, color: GOLD });
text("MUSTERHAUS IMMOBILIEN", 64, 26, fSB, 6.3, NAVY, 1.8);
text(String(seiteNr("ausstattung")).padStart(2, "0"), W - 350, 26, fSB, 7, GOLD2, 1, "r");
}
neueSeite();
eyebrow("Eckdaten auf einen Blick", 64, H - 72);
logoOben();
const gx = 64, gyE = 290, gw = W - 128, gh = H - 290 - 100;
karte(gx, gyE, gw, gh);
const zellen: Array<[string, string, string]> = [];
if (immo.wohnflaeche) zellen.push(["haus", "Wohnfläche", "ca. " + fmtZahl(immo.wohnflaeche) + " m²"]);
if (immo.grundstueck) zellen.push(["baum", "Grundstück", "ca. " + fmtZahl(immo.grundstueck) + " m²"]);
else if (immo.etage) zellen.push(["haus", "Etage", String(immo.etage)]);
if (immo.zimmer) zellen.push(["tuer", "Zimmer", fmtZahl(immo.zimmer)]);
if (immo.badezimmer) zellen.push(["bad", "Badezimmer", fmtZahl(immo.badezimmer)]);
if (immo.baujahr) zellen.push(["kalender", "Baujahr", String(immo.baujahr)]);
if (immo.energie_klasse) zellen.push(["blatt", "Energieklasse", String(immo.energie_klasse)]);
else if (immo.stellplatz_art) zellen.push(["garage", "Stellplatz", String(immo.stellplatz_art)]);
if (istGrundstueck) {
if (gs.erschliessung) zellen.push(["blitz", "Erschließung", gsText("erschliessung", gs.erschliessung)]);
if (gs.bebaubar_nach) zellen.push(["haus", "Bebaubar nach", gsText("bebaubar_nach", gs.bebaubar_nach)]);
if (gs.grz || gs.gfz) zellen.push(["blatt", "GRZ / GFZ", [gs.grz ? "GRZ " + gsZahl(gs.grz) : "", gs.gfz ? "GFZ " + gsZahl(gs.gfz) : ""].filter(Boolean).join(" · ")]);
if (gs.bebaubar_mit && gsListe(gs.bebaubar_mit)) zellen.push(["tuer", "Bebaubar mit", gsListe(gs.bebaubar_mit)]);
if (gs.teilbar_ab) zellen.push(["baum", "Teilbar ab", "ca. " + fmtZahl(gs.teilbar_ab) + " m²"]);
}
const grid = zellen.slice(0, 6);
const cwZ = gw / 3, chZ = gh / 2;
grid.forEach((zl, i) => {
const col = i % 3, row = Math.floor(i / 3);
const cx = gx + col * cwZ, cy = gyE + gh - (row + 1) * chZ;
icon(zl[0], cx + cwZ / 2 - 14, cy + chZ - 48, 28);
text(zl[1], cx + cwZ / 2, cy + 30, fR, 8, GRAU, 0.4, "c");
text(zl[2], cx + cwZ / 2, cy + 14, fSB, 10, NAVY, 0.2, "c");
});
for (const i of [1, 2]) vlineZ(gx + i * cwZ, gyE + 14, gyE + gh - 14);
hline(gx + 24, gyE + chZ, gx + gw - 24);
const chips = highlights.slice(0, 4);
if (chips.length) {
const cwC = 168, chhC = 66, gap = 12;
chips.forEach((c: any, i: number) => {
const x = 64 + i * (cwC + gap), yy = 186;
page.drawRectangle({ x, y: yy, width: cwC, height: chhC, color: SANFT });
icon(c.icon || "haus", x + 16, yy + 22, 22);
const maxCW = cwC - 62;
const z1 = String(c.zeile1 || ""), z2 = String(c.zeile2 || "");
const w1c = breite(z1, fM, 8.4, 0.2), w2c = breite(z2, fR, 7.8, 0.2);
const s1 = w1c > maxCW ? Math.max(6.4, 8.4 * maxCW / w1c) : 8.4;
const s2 = w2c > maxCW ? Math.max(6.2, 7.8 * maxCW / w2c) : 7.8;
text(z1, x + 50, yy + 38, fM, s1, INK, 0.2);
text(z2, x + 50, yy + 24, fR, s2, GRAU, 0.2);
});
}
hline(64, 150, W - 64, HAIR, 0.9);
eyebrow(preisLabel, 64, 118);
text(preis != null ? fmtEur(preis) : "Auf Anfrage", 64, 66, fMarc, 24, NAVY, 0.3);
if (istKauf) text(immo.provisionsfrei ? "provisionsfrei für Käufer" : "zzgl. " + courtageSatz + " Käufercourtage inkl. MwSt.", 280, 70, fM, 8.5, GRAU, 0.3);
else if (warmmiete != null) text("Warmmiete " + fmtEur(warmmiete), 280, 70, fM, 8.5, GRAU, 0.3);
else if (immo.nebenkosten) text("zzgl. " + fmtEur(immo.nebenkosten) + " Nebenkosten", 280, 70, fM, 8.5, GRAU, 0.3);
vlineZ(520, 58, 108, HAIR, 0.9);
text("VERFÜGBAR AB", 548, 96, fSB, 7, GOLD2, 2.2);
text(immo.verfuegbar_ab || "Nach Absprache", 548, 74, fSB, 11, INK, 0.3);
if (immo.immo_nr) {
vlineZ(700, 58, 108, HAIR, 0.9);
text("OBJEKT-NR.", 724, 96, fSB, 7, GOLD2, 2.2);
text(String(immo.immo_nr), 724, 74, fSB, 11, INK, 0.3);
}
text(String(seiteNr("eckdaten")).padStart(2, "0"), W - 64, 26, fSB, 7, GOLD2, 1, "r");
neueSeite();
eyebrow("Weitere Angaben & Konditionen", 64, H - 72);
logoOben();
const dRows: Array<[string, string]> = [];
const add = (l: string, v: any) => { if (v != null && String(v).trim() !== "") dRows.push([l, String(v)]); };
add("Objektart", immo.objektart);
add("Objekttyp", immo.objekttyp);
add("Nutzungsart", immo.nutzungsart);
add("Objekt-Nr.", immo.immo_nr);
add("Baujahr", immo.baujahr);
add("Wohnfläche", immo.wohnflaeche ? "ca. " + fmtZahl(immo.wohnflaeche) + " m²" : null);
add("Nutzfläche", immo.nutzflaeche ? "ca. " + fmtZahl(immo.nutzflaeche) + " m²" : null);
add("Grundstücksfläche", immo.grundstueck ? "ca. " + fmtZahl(immo.grundstueck) + " m²" : null);
add("GRZ", gs.grz ? gsZahl(gs.grz) : null);
add("GFZ", gs.gfz ? gsZahl(gs.gfz) : null);
add("Erschließung", gs.erschliessung ? gsText("erschliessung", gs.erschliessung) : null);
add("Erschließungskosten", gs.erschliessungskosten ? fmtEur(gs.erschliessungskosten) : null);
add("Bebaubar nach", gs.bebaubar_nach ? gsText("bebaubar_nach", gs.bebaubar_nach) : null);
add("Bebaubar mit", gs.bebaubar_mit ? gsListe(gs.bebaubar_mit) || null : null);
add("Teilbar ab", gs.teilbar_ab ? "ca. " + fmtZahl(gs.teilbar_ab) + " m²" : null);
add("Zimmer", immo.zimmer ? fmtZahl(immo.zimmer) : null);
add("Schlafzimmer", immo.schlafzimmer ? fmtZahl(immo.schlafzimmer) : null);
add("Badezimmer", immo.badezimmer ? fmtZahl(immo.badezimmer) : null);
add("Etage", immo.etage != null ? String(immo.etage) + (immo.etagen_gesamt ? " von " + immo.etagen_gesamt : "") : null);
add("Balkone", immo.anzahl_balkone ? fmtZahl(immo.anzahl_balkone) : null);
add("Terrassen", immo.anzahl_terrassen ? fmtZahl(immo.anzahl_terrassen) : null);
add("Heizungsart", immo.heizungsart);
add("Fenster", [immo.fenster, immo.fenster_verglasung].filter(Boolean).join(", ") || null);
add("Bezugsfrei ab", immo.verfuegbar_ab);
if (istKauf && immo.hausgeld != null) add("Hausgeld", fmtEur(immo.hausgeld) + " / Monat");
const uebersichtMap: Record<string, string> = {
"Wohnfläche": "Wohnfläche",
"Grundstück": "Grundstücksfläche",
"Etage": "Etage",
"Baujahr": "Baujahr",
"Erschließung": "Erschließung",
"Bebaubar nach": "Bebaubar nach",
"Bebaubar mit": "Bebaubar mit",
"Teilbar ab": "Teilbar ab",
};
const schonGezeigt = new Set<string>();
for (const zl of grid) { const m = uebersichtMap[zl[1]]; if (m) schonGezeigt.add(m); }
if (immo.immo_nr) schonGezeigt.add("Objekt-Nr.");
if (immo.verfuegbar_ab) schonGezeigt.add("Bezugsfrei ab");
let dRowsRest = dRows.filter((r) => !schonGezeigt.has(r[0]));
if (dRowsRest.length < 4) dRowsRest = dRows;
const dRowsPreis: Array<[string, string]> = [];
const addP = (l: string, v: any) => { if (v != null && String(v).trim() !== "") dRowsPreis.push([l, String(v)]); };
addP(preisLabel, preis != null ? fmtEur(preis) : "Auf Anfrage");
addP("Stellplatz", immo.stellplatz_art ? immo.stellplatz_art + (nZahl(immo.stellplatz_anzahl) != null && nZahl(immo.stellplatz_anzahl)! > 1 ? " (" + fmtZahl(immo.stellplatz_anzahl) + ")" : "") : (nZahl(immo.stellplatz_anzahl) != null && nZahl(immo.stellplatz_anzahl)! > 0 ? fmtZahl(immo.stellplatz_anzahl) : null));
if (!istKauf) {
addP("Nebenkosten", immo.nebenkosten != null ? fmtEur(immo.nebenkosten) : null);
addP("Heizkosten", immo.heizkosten != null ? fmtEur(immo.heizkosten) : null);
addP("Warmmiete", warmmiete != null ? fmtEur(warmmiete) : null);
addP("Stellplatzmiete", immo.stellplatzmiete != null && String(immo.stellplatzmiete).trim() !== ""
? fmtEur(immo.stellplatzmiete) + (nZahl(immo.stellplatz_anzahl) != null && nZahl(immo.stellplatz_anzahl)! > 1 ? " je Stellplatz" : "")
: null);
addP("Warmwasser in Heizkosten", immo.warmwasser_in_heizkosten === true ? "Ja" : immo.warmwasser_in_heizkosten === false ? "Nein" : null);
const kautionEigen = immo.kaution != null && String(immo.kaution).trim() !== "" ? String(immo.kaution).trim() : null;
const kautionMon = nZahl(immo.kaution_monate);
const kautionText = kautionEigen
? (/^[0-9]+([.,][0-9]+)?$/.test(kautionEigen) ? fmtEur(kautionEigen) : kautionEigen)
: (kautionMon != null && kautionMon > 0
? (kaltZahl != null && kaltZahl > 0
? fmtEur(kautionMon * kaltZahl) + " (" + fmtZahl(kautionMon) + " Kaltmieten)"
: fmtZahl(kautionMon) + " Kaltmieten")
: null);
addP("Kaution", kautionText);
}
addP("Käufercourtage", istKauf ? (immo.provisionsfrei ? "provisionsfrei" : courtageSatz + " inkl. MwSt.") : "provisionsfrei");
addP("Energieausweis", immo.energieausweis_typ);
addP("Endenergiekennwert", immo.energie_kennwert != null ? fmtZahl(immo.energie_kennwert) + " kWh/(m²a)" : null);
addP("Energieeffizienzklasse", immo.energie_klasse);
addP("Wesentl. Energieträger", immo.energie_traeger);
addP("Baujahr Anlagentechnik", immo.energie_baujahr_anlage);
addP("Ausweis gültig bis", immo.energie_gueltig_bis ? datumDe(immo.energie_gueltig_bis) : null);
function detailSpalte(rows: Array<[string, string]>, titel: string, x: number, yStart: number, spaltenBreite: number) {
text(titel.toUpperCase(), x, yStart, fSB, 7, GOLD2, 2.2);
let y = yStart - 20;
for (const r of rows) {
text(r[0], x, y, fR, 8.4, GRAU, 0.1);
text(r[1], x + spaltenBreite, y, fSB, 8.8, NAVY, 0.1, "r");
hline(x, y - 6, x + spaltenBreite, rgb(0.94, 0.93, 0.92), 0.6);
y -= 17.5;
}
return y;
}
const spB = 330;
detailSpalte(dRowsRest, "Objekt & Ausstattung", 64, H - 110, spB);
const yPreisEnde = detailSpalte(dRowsPreis, istKauf ? "Preis & Energie" : "Miete & Energie", 448, H - 110, spB);
const sonstiges = String(immo.beschreibung_sonstiges || "").trim();
let sonstigesZeilen = 0;
if (sonstiges) {
let ys = yPreisEnde - 2;
text("SONSTIGE ANGABEN", 448, ys, fSB, 7, GOLD2, 2.2);
ys -= 14;
const zlS = wrapF(sonstiges, 7.8, spB);
const kapS = Math.max(0, Math.floor((ys - 230) / 10.6) + 1);
for (const z of zlS.slice(0, kapS)) { if (z.worte.length) zeileZeichnen(z, 448, ys, 7.8, spB, INK, false); ys -= 10.6; sonstigesZeilen++; }
if (zlS.length > kapS) warnungen.push("Sonstige Angaben gekürzt (" + (zlS.length - kapS) + " Zeilen passen nicht unter Preis & Energie).");
}
const hy = 168;
page.drawRectangle({ x: 64, y: hy - 12, width: W - 128, height: 58, color: SANFT });
text("COURTAGE", 78, hy + 30, fSB, 7, GOLD2, 2.2);
para(courtage, 78, hy + 16, W - 156, fR, 7.4, 10, INK);
text("HINWEISE", 64, 96, fSB, 7, GOLD2, 2.2);
para(hinweise, 64, 82, W - 128, fR, 6.6, 9, GRAU);
text(String(seiteNr("detail")).padStart(2, "0"), W - 64, 26, fSB, 7, GOLD2, 1, "r");
await schritt("seite-detail-ok");
if (hatEnergie) {
neueSeite();
eyebrow("Energieausweis", 64, H - 72);
logoOben();
const guteKlasse = ["A+", "A", "B"].includes(String(immo.energie_klasse || "").toUpperCase().trim());
text(guteKlasse ? "Effizient und transparent." : "Die Energiedaten im Überblick.", 64, H - 114, fMarc, 23, NAVY, 0.3);
const edata: Array<[string, string]> = [];
if (immo.energieausweis_typ) edata.push(["Art des Ausweises", String(immo.energieausweis_typ)]);
if (immo.energie_kennwert) edata.push(["Endenergie-Kennwert", fmtZahl(immo.energie_kennwert) + " kWh/(m²a)"]);
if (immo.energie_klasse) edata.push(["Energieeffizienzklasse", String(immo.energie_klasse)]);
if (immo.energie_traeger) edata.push(["Wesentlicher Energieträger", String(immo.energie_traeger)]);
if (immo.energie_baujahr_anlage) edata.push(["Baujahr Anlagentechnik", String(immo.energie_baujahr_anlage)]);
if (immo.energie_gueltig_bis) edata.push(["Ausweis gültig bis", datumDe(immo.energie_gueltig_bis)]);
let ey = H - 160;
for (const ed of edata.slice(0, 7)) {
text(ed[0].toUpperCase(), 64, ey, fSB, 6.8, GOLD2, 1.6);
text(ed[1], 64, ey - 15, fM, 10.5, INK, 0.2);
hline(64, ey - 26, 360);
ey -= 44;
}
const sx = 420, sw = W - 420 - 64;
karte(sx, 150, sw, H - 150 - 84);
text("ENERGIEEFFIZIENZ-SKALA", sx + 26, H - 130, fSB, 7, GOLD2, 2.2);
const klassen: Array<[string, number, number, number[]]> = [
["A+", 0, 30, [0, 166, 82]], ["A", 30, 50, [76, 184, 71]], ["B", 50, 75, [168, 206, 56]],
["C", 75, 100, [245, 235, 12]], ["D", 100, 130, [253, 201, 0]], ["E", 130, 160, [247, 166, 0]],
["F", 160, 200, [239, 125, 0]], ["G", 200, 250, [230, 51, 35]], ["H", 250, 300, [200, 22, 24]],
];
const barX = sx + 26, barW = sw - 52, barY = H - 235, barH = 22, total = 300;
for (const kl of klassen) {
const x0 = barX + barW * kl[1] / total, x1 = barX + barW * kl[2] / total;
page.drawRectangle({ x: x0, y: barY, width: x1 - x0, height: barH, color: rgb(kl[3][0] / 255, kl[3][1] / 255, kl[3][2] / 255) });
text(kl[0], (x0 + x1) / 2, barY + 7, fSB, 7, (kl[0] === "C" || kl[0] === "D") ? INK : WEISS, 0.3, "c");
}
for (const v of [0, 50, 100, 150, 200, 250]) text(String(v), barX + barW * v / total, barY - 13, fR, 6, GRAU, 0.2, "c");
const kw = Math.min(Number(immo.energie_kennwert) || 0, 295);
if (kw > 0) {
const mx = barX + barW * kw / total;
page.drawRectangle({ x: mx - 1, y: barY - 4, width: 2, height: barH + 10, color: NAVY });
const bx = Math.min(Math.max(mx, barX + 34), barX + barW - 34);
page.drawRectangle({ x: bx - 34, y: barY + barH + 8, width: 68, height: 20, color: NAVY });
text(fmtZahl(immo.energie_kennwert), bx, barY + barH + 14, fSB, 9, WEISS, 0.4, "c");
text("DIESES OBJEKT", bx, barY + barH + 34, fSB, 6, GOLD2, 1.6, "c");
}
para("Angaben gemäß Energieausweis nach GEG.", sx + 26, barY - 46, sw - 52, fR, 8, 13, GRAU);
footer(seiteNr("energie"));
}
for (let gi = 0; gi < grundrisse.length; gi++) {
const g = grundrisse[gi];
neueSeite();
const planArt = planArtVon(g);
eyebrow(planKopf[planArt] || "Planunterlagen", 64, H - 72);
logoOben();
text(g.titel || (planArt + " " + (gi + 1)), 64, H - 114, fMarc, 23, NAVY, 0.3);
const img = await bild(g);
const kx = 64, kyG = 90, kw2 = W - 128, kh = H - 114 - 90 - 6;
karte(kx, kyG, kw2, kh);
if (img) {
const s = Math.min((kw2 - 40) / img.width, (kh - 40) / img.height);
page.drawImage(img, { x: kx + (kw2 - img.width * s) / 2, y: kyG + (kh - img.height * s) / 2, width: img.width * s, height: img.height * s });
}
kiBadge(g, kx + 14, kyG + 12);
footer(seiteNr("grundriss" + gi));
}
for (let pi = 0; pi < fotoPaare.length; pi++) {
const paar = fotoPaare[pi];
const fotoTitel = paar.some((d: any) => istPlanBild(d)) ? "Weitere Details" : "Impressionen";
neueSeite();
eyebrow(fotoTitel, 64, H - 72);
logoOben();
text(fotoTitel, 64, H - 114, fMarc, 23, NAVY, 0.3);
const gy0 = 92, gh2 = H - 140 - gy0;
const capT = (d: any, x: number) => {
const t = ((d && d.titel) || "").trim();
if (t) text(t.toUpperCase(), x, gy0 - 16, fSB, 6.5, GOLD2, 1.8);
};
if (paar.length === 2) {
const w1 = (W - 128 - 16) / 2;
bildCover(await bild(paar[0]), 64, gy0, w1, gh2);
kiBadge(paar[0], 64 + 14, gy0 + 12);
capT(paar[0], 64);
bildCover(await bild(paar[1]), 64 + w1 + 16, gy0, w1, gh2);
kiBadge(paar[1], 64 + w1 + 16 + 14, gy0 + 12);
capT(paar[1], 64 + w1 + 16);
} else {
bildCover(await bild(paar[0]), 64, gy0, W - 128, gh2);
kiBadge(paar[0], 64 + 14, gy0 + 12);
capT(paar[0], 64);
}
footer(seiteNr("fotos" + pi));
}
await schritt("fotoseiten-ok", String(fotoPaare.length));
neueSeite();
bildCover(await bild(lageFoto), W - 330, 0, 330, H);
kiBadge(lageFoto, W - 330 + 14, 50);
eyebrow("Lage", 64, H - 72);
const lgUebT = immo.ueberschrift_lage || "Die Lage.";
let lgGr = 23, lgUeb = wrapT(lgUebT, fMarc, lgGr, 400);
while (lgUeb.length > 2 && lgGr > 17) { lgGr -= 1; lgUeb = wrapT(lgUebT, fMarc, lgGr, 400); }
lgUeb = lgUeb.slice(0, 2);
let ly = H - 112;
for (const z of lgUeb) { text(z, 64, ly, fMarc, lgGr, NAVY, 0.3); ly -= lgGr + 4; }
let ly2 = ly - 6;
const zeigeDistGrid = distanzen.length > 0 && !lageplaene.length;
const lgFit = fliesstextFit((immo.beschreibung_lage || "").trim(), TXTB, ly2, zeigeDistGrid ? 190 : 52);
ly2 = fliesstextZeichnen(lgFit, 64, ly2, TXTB);
if (!lgFit.passt) warnungen.push("Lagebeschreibung gekürzt (" + (lgFit.zeilen.length - lgFit.kap) + " Zeilen passen trotz verdichtetem Zeilenabstand nicht auf die Seite).");
if (zeigeDistGrid) {
const gyd = 140;
distanzen.slice(0, 6).forEach((d: any, i: number) => {
const x = 64 + (i % 3) * 140, yy = gyd - Math.floor(i / 3) * 62;
text(String(d.wert || ""), x, yy, fMarc, 18, NAVY, 0.3);
text(String(d.label || "").toUpperCase(), x, yy - 15, fM, 6.3, GOLD2, 1.7);
});
}
footer(seiteNr("lage"));
if (lageplaene.length) {
neueSeite();
bildCover(await bild(lageplaene[0]), 340, 0, W - 340, H);
eyebrow("Makrolage", 64, H - 72);
text("Alles in", 64, H - 118, fMarc, 23, NAVY, 0.3);
text("der Nähe.", 64, H - 146, fMarc, 23, NAVY, 0.3);
let my = H - 186;
for (const d of distanzen.slice(0, 9)) {
text(String(d.label || ""), 64, my, fR, 9, INK, 0.2);
text(String(d.wert || ""), 300, my, fSB, 9.5, NAVY, 0.2, "r");
hline(64, my - 9, 300);
my -= 31;
}
text("Kartendaten: OpenStreetMap", 64, Math.min(my - 4, 56), fR, 6.8, GRAU, 0.3);
text(String(seiteNr("makro")).padStart(2, "0"), 64, 26, fSB, 7, GOLD2, 1);
}
await schritt("seite-makro-ok");
if (zeigeRendite) {
neueSeite();
eyebrow("Kapitalanlage", 64, H - 72);
logoOben();
text("Rendite auf einen Blick.", 64, H - 114, fMarc, 23, NAVY, 0.3);
const kacheln: Array<[string, string, boolean]> = [];
if (bruttoRendite != null) kacheln.push(["Bruttorendite", fmtZahl(bruttoRendite) + " %", true]);
if (nettoRendite != null) kacheln.push(["Nettorendite", fmtZahl(nettoRendite) + " %", false]);
if (kpFaktor != null) kacheln.push(["Kaufpreisfaktor", fmtZahl(kpFaktor) + "-fach", false]);
const kwR = (W - 128 - (kacheln.length - 1) * 16) / Math.max(kacheln.length, 1);
kacheln.forEach((k, i) => {
const x = 64 + i * (kwR + 16);
if (k[2]) page.drawRectangle({ x, y: H - 300, width: kwR, height: 120, color: NAVY });
else karte(x, H - 300, kwR, 120);
text(k[0].toUpperCase(), x + kwR / 2, H - 210, fSB, 7, k[2] ? GOLDHELL : GOLD2, 2.2, "c");
text(k[1], x + kwR / 2, H - 255, fMarc, 26, k[2] ? WEISS : NAVY, 0.2, "c");
});
const rRows: Array<[string, string]> = [];
if (mieteIst != null) rRows.push(["Ist-Kaltmiete (monatlich)", fmtEur(mieteIst)]);
if (mieteSoll != null) rRows.push(["Soll-/Marktmiete (monatlich)", fmtEur(mieteSoll)]);
if (jahresRoh != null) rRows.push(["Jahresrohertrag", fmtEur(jahresRoh)]);
if (hausgeld != null) rRows.push(["Hausgeld (monatlich)", fmtEur(hausgeld)]);
if (hausgeldNU != null) rRows.push(["davon nicht umlagefähig", fmtEur(hausgeldNU)]);
if (jahresNetto != null) rRows.push(["Jahresnettoertrag", fmtEur(jahresNetto)]);
if (kaufpreisZahl != null) rRows.push(["Kaufpreis", fmtEur(kaufpreisZahl)]);
if (gesamtAufwand != null) rRows.push(["Gesamtinvestition inkl. Nebenkosten", fmtEur(gesamtAufwand)]);
const ryStart = H - 340, spB2 = 330;
rRows.forEach((r, i) => {
const x = i < 4 ? 64 : 448;
const y = i < 4 ? ryStart - i * 26 : ryStart - (i - 4) * 26;
text(r[0], x, y, fR, 8.6, GRAU, 0.1);
text(r[1], x + spB2, y, fSB, 9, NAVY, 0.1, "r");
hline(x, y - 8, x + spB2, rgb(0.94, 0.93, 0.92), 0.6);
});
para("Die Bruttorendite bezieht sich auf den Kaufpreis, die Nettorendite auf die Gesamtinvestition abzüglich des nicht umlagefähigen Hausgelds. Unverbindliche Beispielrechnung ohne Instandhaltungsrücklage, Mietausfallwagnis und Steuern – keine Anlageberatung.", 64, 96, W - 128, fR, 6.8, 9.4, GRAU);
footer(seiteNr("rendite"));
}
if (zeigeNK) {
neueSeite();
eyebrow("Transparenz", 64, H - 72);
logoOben();
text("Was der Erwerb tatsächlich kostet.", 64, H - 114, fMarc, 23, NAVY, 0.3);
para("Damit Sie von Anfang an sicher kalkulieren können – hier alle Erwerbsnebenkosten offen dargestellt.", 64, H - 140, W - 128, fR, 9, 13, GRAU);
const linkeB = 400, nkx = 64;
let ny = H - 180;
const nkRows: Array<[string, string]> = [];
nkRows.push([preisLabel, fmtEur(kaufpreisZahl)]);
nkRows.push(["Grunderwerbsteuer (" + fmtZahl(grest) + " %)", fmtEur(nkGrest)]);
nkRows.push(["Notar und Grundbuch (" + fmtZahl(notarProz) + " %)", fmtEur(nkNotar)]);
if (courtProz > 0) nkRows.push(["Käufercourtage (" + courtageSatz + " inkl. MwSt.)", fmtEur(nkCourt)]);
for (const r of nkRows) {
text(r[0], nkx, ny, fR, 9.4, INK, 0.1);
text(r[1], nkx + linkeB, ny, fM, 9.8, NAVY, 0.1, "r");
hline(nkx, ny - 9, nkx + linkeB, HAIR, 0.6);
ny -= 30;
}
page.drawRectangle({ x: nkx, y: ny - 30, width: linkeB, height: 52, color: NAVY });
text("GESAMTAUFWAND", nkx + 18, ny - 4, fSB, 7, GOLDHELL, 2.2);
text(fmtEur(gesamtAufwand), nkx + linkeB - 18, ny - 18, fMarc, 20, WEISS, 0.2, "r");
const fx = 512, fw = W - 64 - fx;
karte(fx, 150, fw, H - 150 - 150);
text("FINANZIERUNGSBEISPIEL", fx + 22, H - 200, fSB, 7, GOLD2, 2.2);
hline(fx + 22, H - 210, fx + 48, GOLD, 1);
const fRows: Array<[string, string]> = [
["Eigenkapital (" + fmtZahl(ekProz) + " %)", fmtEur(eigenkapital)],
["Benötigtes Darlehen", fmtEur(darlehen)],
["Sollzins p. a.", fmtZahl(zinsProz) + " %"],
["Anfängliche Tilgung", fmtZahl(tilgProz) + " %"],
];
let fy2 = H - 236;
for (const r of fRows) {
text(r[0], fx + 22, fy2, fR, 8.4, GRAU, 0.1);
text(r[1], fx + fw - 22, fy2, fSB, 8.8, NAVY, 0.1, "r");
hline(fx + 22, fy2 - 8, fx + fw - 22, rgb(0.94, 0.93, 0.92), 0.6);
fy2 -= 24;
}
page.drawRectangle({ x: fx, y: 150, width: fw, height: 66, color: GOLD });
text("MONATLICHE RATE", fx + 22, 196, fSB, 7, NAVY, 2.2);
text(fmtEur(monatsrate), fx + 22, 166, fMarc, 22, NAVY, 0.2);
para(finHinweis, 64, 108, W - 128, fR, 6.8, 9.4, GRAU);
footer(seiteNr("nebenkosten"));
}
neueSeite(false);
bildCover(await bild(kontaktFoto), W - 350, 0, 350, H, 0.55, 0.5);
kiBadge(kontaktFoto, W - 350 + 14, 26);
page.drawRectangle({ x: 0, y: 0, width: W - 350, height: H, color: NAVY });
const LX2 = 64;
text("PERSÖNLICH FÜR SIE DA", LX2, H - 76, fSB, 8, GOLD, 2.6);
page.drawRectangle({ x: LX2, y: H - 88, width: 24, height: 1.6, color: GOLD });
text("Lassen Sie uns über", LX2, H - 128, fMarc, 24, WEISS, 0.4);
text("Ihre Wünsche sprechen.", LX2, H - 156, fMarc, 24, WEISS, 0.4);
para("Ich freue mich darauf, Ihnen dieses Zuhause persönlich zeigen zu dürfen – diskret, unverbindlich und mit fundierter Marktkenntnis.", LX2, H - 188, 330, fR, 8.8, 14.5, rgb(0.87, 0.88, 0.92));
text(ap.name || "", LX2, H - 288, fScript, 30, GOLD);
text(apName || "", LX2, H - 318, fSB, 10.5, WEISS, 0.3);
text(ap.funktion || "", LX2, H - 333, fR, 8.5, rgb(0.78, 0.8, 0.86), 0.4);
let ry3 = H - 370;
for (const kz of kontaktzeilen) {
if (kz[1]) { icon(kz[0], LX2, ry3 - 3, 10, GOLD); text(kz[1], LX2 + 22, ry3, fM, 9, WEISS, 0.3); }
ry3 -= 26;
}
text(firma.firma_name, LX2, H - 450, fSB, 8.5, WEISS, 0.3);
text(firma.strasse + " · " + firma.plz + " " + firma.ort, LX2, H - 464, fR, 8, rgb(0.78, 0.8, 0.86), 0.3);
const qrZiel = immo.expose_qr_url || (firma.web ? (String(firma.web).startsWith("http") ? firma.web : "https://" + firma.web) : "https://immooffice.example");
if (QRCode) {
try {
const qr = QRCode.create(qrZiel, { errorCorrectionLevel: "M" });
const size = qr.modules.size, data = qr.modules.data;
const box = 74, pad = 7, cell = (box - 2 * pad) / size;
page.drawRectangle({ x: LX2, y: 44, width: box, height: box, color: WEISS });
for (let r4 = 0; r4 < size; r4++) for (let c4 = 0; c4 < size; c4++) {
if (data[r4 * size + c4]) page.drawRectangle({ x: LX2 + pad + c4 * cell, y: 44 + box - pad - (r4 + 1) * cell, width: cell + 0.15, height: cell + 0.15, color: NAVY });
}
text("Hier scannen für", LX2 + 90, 94, fM, 8.5, WEISS, 0.3);
text("weitere Informationen", LX2 + 90, 80, fM, 8.5, WEISS, 0.3);
} catch (_e) {}
}
await schritt("seite-kontakt-ok");
const AGB: Array<[string, string]> = [
["1. Zustimmung zu den Bedingungen", "Mit Nutzung eines Angebotes von " + firma.firma_name + " erklärt sich der Empfänger mit den nachfolgenden Bedingungen einverstanden. Unsere Angebote sind freibleibend."],
["2. Informationen und Angebote", "Die Bereitstellung eines Exposés dient lediglich zur Information und stellt keine vertragliche Verpflichtung dar. Die Angaben beruhen auf Informationen des Verkäufers. Eine Gewähr für Richtigkeit und Vollständigkeit wird nicht übernommen. Änderungen, Irrtümer und Zwischenverkäufe bleiben vorbehalten."],
["3. Kommunikationswege", "Der Empfänger stimmt zu, dass wir ihn telefonisch, per SMS und E-Mail kontaktieren dürfen. Die Zustimmung kann jederzeit widerrufen werden."],
["4. Haftung und Bonität", "Eine Haftung für die Bonität der vermittelten Vertragspartei wird ausgeschlossen."],
["5. Provisionsangaben", "Die Käufercourtage beträgt " + courtageSatz + " des notariell beurkundeten Kaufpreises inkl. gesetzlicher MwSt., sofern im Exposé nichts anderes angegeben ist. Der Makler kann für beide Seiten provisionspflichtig tätig sein."],
["6. Zusätzliche Provisionspflicht", "Kommt zwischen dem Empfänger und dem Eigentümer ein anderes oder zusätzliches Geschäft zustande, oder erwirbt der Empfänger das Objekt durch Zwangsversteigerung, sind die genannten Provisionen ebenfalls zu entrichten."],
["7. Meldung bekannter Objekte", "Ist dem Empfänger das Objekt bereits bekannt, hat er uns dies unverzüglich, spätestens innerhalb von fünf Tagen nach Erhalt des Objektnachweises, mitzuteilen."],
["8. Weitergabe von Informationen", "Übergebene Unterlagen sind ausschließlich für den persönlichen Gebrauch bestimmt. Bei unberechtigter Weitergabe an Dritte haftet der Empfänger für die Käufer- und die Verkäuferprovision."],
["9. Datenschutz", "Die Verarbeitung personenbezogener Daten erfolgt gemäß unseren Datenschutzhinweisen: www.immooffice.example/unternehmen/datenschutz/"],
["10. Haftungsbeschränkung", "Unsere Haftung ist auf grob fahrlässiges oder vorsätzliches Verhalten beschränkt, soweit nicht Leben, Körper oder Gesundheit betroffen sind."],
["11. Verjährung", "Schadensersatzansprüche verjähren innerhalb von 3 Jahren ab Kenntnis der Umstände. Kürzere gesetzliche Fristen gelten vorrangig."],
["12. Gerichtsstand", "Als Gerichtsstand gilt der Firmensitz von " + firma.firma_name + ". Es gilt deutsches Recht."],
["13. Salvatorische Klausel", "Sollten einzelne Bestimmungen unwirksam sein, berührt dies nicht die Gültigkeit der übrigen Bestimmungen."],
];
neueSeite();
eyebrow("Rechtliches", 64, H - 58);
logoOben();
text("Allgemeine Geschäftsbedingungen", 64, H - 94, fMarc, 19, NAVY, 0.3);
const colW = (W - 128 - 28) / 2, colX = [64, 64 + colW + 28];
let ci = 0, ay = H - 124;
for (const ab of AGB) {
const zeilen = wrapT(ab[1], fR, 6.4, colW);
const bedarf = 13 + zeilen.length * 8.6 + 8;
if (ay - bedarf < 58 && ci === 0) { ci = 1; ay = H - 124; }
text(ab[0], colX[ci], ay, fSB, 7.2, NAVY, 0.2);
ay -= 11;
for (const z of zeilen) { text(z, colX[ci], ay, fR, 6.4, INK); ay -= 8.6; }
ay -= 8;
}
text(String(seiteNr("agb")).padStart(2, "0"), W - 64, 40, fSB, 7, GOLD2, 1, "r");
await schritt("seite-agb-ok");
neueSeite();
eyebrow("Rechtliches", 64, H - 58);
logoOben();
text("Widerrufsbelehrung", 64, H - 94, fMarc, 19, NAVY, 0.3);
const LX = 64, RX = 64 + colW + 28;
let wy = H - 126;
text("Widerrufsrecht", LX, wy, fSB, 7.5, NAVY, 0.2); wy -= 12;
wy = para("Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses. Um Ihr Widerrufsrecht auszuüben, müssen Sie uns", LX, wy, colW, fR, 6.8, 9.4);
wy -= 4;
for (const z of [firma.firma_name, firma.strasse, firma.plz + " " + firma.ort, firma.telefon ? "Tel: " + firma.telefon : "", firma.email || ""].filter(Boolean)) { text(String(z), LX, wy, fM, 6.8, INK, 0.1); wy -= 9.4; }
wy -= 4;
wy = para("mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.", LX, wy, colW, fR, 6.8, 9.4);
wy -= 4;
para("Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.", LX, wy, colW, fR, 6.8, 9.4);
let wy2 = H - 126;
text("Folgen des Widerrufs", RX, wy2, fSB, 7.5, NAVY, 0.2); wy2 -= 12;
wy2 = para("Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.", RX, wy2, colW, fR, 6.8, 9.4);
wy2 -= 6;
para("Haben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bereits erbrachten Dienstleistungen entspricht.", RX, wy2, colW, fR, 6.8, 9.4);
text(String(seiteNr("widerruf")).padStart(2, "0"), W - 64, 40, fSB, 7, GOLD2, 1, "r");
await schritt("seite-widerruf-ok");
neueSeite();
eyebrow("Rechtliches", 64, H - 58);
logoOben();
text("Muster-Widerrufsformular", 64, H - 94, fMarc, 19, NAVY, 0.3);
let fy = H - 128;
fy = para("(Wenn Sie den Vertrag widerrufen wollen, füllen Sie bitte dieses Formular aus und senden es an uns zurück.)", 64, fy, 470, fR, 7.5, 11);
fy -= 8;
for (const z of [firma.firma_name, firma.strasse, firma.plz + " " + firma.ort, firma.email || ""].filter(Boolean)) { text(String(z), 64, fy, fM, 8, INK, 0.1); fy -= 12.5; }
fy -= 14;
fy = para("Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über die Erbringung der Maklerleistung.", 64, fy, 470, fR, 8, 12);
fy -= 18;
for (const lab of ["Bestellt / erhalten am", "Name", "Anschrift", "Datum, Unterschrift"]) {
text(lab.toUpperCase(), 64, fy, fSB, 6.5, GOLD2, 1.6);
page.drawLine({ start: { x: 64, y: fy - 18 }, end: { x: 420, y: fy - 18 }, thickness: 0.8, color: rgb(0.79, 0.77, 0.74) });
fy -= 48;
}
text(String(seiteNr("formular")).padStart(2, "0"), W - 64, 40, fSB, 7, GOLD2, 1, "r");
neueSeite(false);
page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NAVY });
const schlussLogo = logoWeiss || logoNavy;
if (schlussLogo) {
const rS = schlussLogo.height / schlussLogo.width;
let lwS = 330, lhS = lwS * rS;
if (lhS > 230) { lhS = 230; lwS = lhS / rS; }
page.drawImage(schlussLogo, { x: (W - lwS) / 2, y: (H - lhS) / 2 + 26, width: lwS, height: lhS });
}
page.drawRectangle({ x: W / 2 - 16, y: H / 2 - 92, width: 32, height: 1.6, color: GOLD });
text(standorte.map((s: any) => (s.ort || "").toUpperCase()).filter(Boolean).join("  ·  ") || "", W / 2, H / 2 - 122, fSB, 8, GOLD, 2.6, "c");
text(firmaWeb, W / 2, H / 2 - 146, fM, 9, rgb(0.85, 0.86, 0.9), 1, "c");
await schritt("seiten-fertig", String(planListe.length));
const pdfBytes = await pdf.save({ useObjectStreams: false });
await schritt("pdf-fertig", "bytes=" + pdfBytes.length + " seiten=" + planListe.length + " fotos=" + fotos.length);
if (body.nur_pruefen) return jsonOk({ nur_pruefen: true, seiten: planListe.length, bytes: pdfBytes.length, auszeichnung_probe: auszeichnung(String(immo.beschreibung_objekt || "").split(/\r?\n/)[0] || "").filter((l) => l.fett || l.kursiv).slice(0, 6), grundstueck: istGrundstueck, courtage, energie_seite: hatEnergie, eckdaten: grid.map((z) => [z[1], z[2]]), angaben: dRows, angaben_gedruckt: dRowsRest, konditionen: dRowsPreis, sonstiges_zeilen: sonstigesZeilen,
foto_seiten: fotoPaare.map((p: any[]) => ({ titel: p.some((d: any) => istPlanBild(d)) ? "Weitere Details" : "Impressionen", bilder: p.map((d: any) => d.titel || d.name) })),
lage_foto: lageFoto.titel || lageFoto.name,
plan_seiten: grundrisse.map((g: any) => ({ kopf: planKopf[planArtVon(g)] || "Planunterlagen", titel: g.titel || (planArtVon(g) + " ?") })), warnungen });
const slug = String(immo.bezeichnung || immo.immo_nr || "Objekt").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
const dateiname = "Expose_" + slug + "_" + new Date().toISOString().slice(0, 10) + ".pdf";
const pfad = "immobilien/" + immobilie_id + "/expose/" + Date.now() + "_" + dateiname;
const { error: upErr } = await admin.storage.from("immobilie-dateien").upload(pfad, pdfBytes, { contentType: "application/pdf", upsert: true });
if (upErr) throw new Error("PDF-Upload: " + upErr.message);
const { error: insErr } = await admin.from("immobilie_datei").insert({
immobilie_id, name: dateiname, mime_type: "application/pdf", size_bytes: pdfBytes.length,
speicher_typ: "supabase", storage_path: pfad, quelle: "expose_generator",
ersteller_id: userData.user.id, doktyp: "Exposé", kategorie: "dokument", oeffentlich: false, titel: "Exposé",
});
if (insErr) throw new Error("DB-Insert: " + insErr.message);
const { data: signed, error: sErr } = await admin.storage.from("immobilie-dateien").createSignedUrl(pfad, 3600);
if (sErr) throw new Error("Signed URL: " + sErr.message);
await schritt("fertig");
return jsonOk({ signed_url: signed ? signed.signedUrl : null, dateiname, pfad, seiten: planListe.length, warnungen });
} catch (e) {
const msg = e instanceof Error ? (e.message + " || " + (e.stack || "").slice(0, 300)) : String(e);
console.error("expose-pdf-erzeugen:", msg);
try { await schritt("EXCEPTION", msg); } catch (_e2) {}
return jsonErr(500, msg);
}
});
