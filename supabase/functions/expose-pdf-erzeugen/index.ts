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
// --- Werkzeug ---------------------------------------------------------------
// pdf-lib und fontkit werden dem Renderer HEREINGEGEBEN, nicht von ihm
// importiert: dasselbe Buendel laeuft im Browser, und dort kommen sie aus
// einem <script>. Ein Import im Buendel haette eine der beiden Seiten
// ausgeschlossen.
import * as PDFLib from "npm:pdf-lib@1.17.1";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
// Das Buendel des Renderers, erzeugt von packages/expose-renderer/bauen.mjs.
// Es liegt in diesem Ordner, weil `supabase functions deploy` den Ordner
// ausrollt; npm run check vergleicht es mit der Quelle.
import * as Expose from "./immo-expose.mjs";
// Die zwanzig Schnitte, gepackt und base64-kodiert. Erzeugt von
// scripts/expose-schriften-einbetten.py aus assets/fonts/expose/.
import { SCHRIFTEN as SCHRIFTEN_EINGEBAUT } from "./schriften.mjs";
let fontkit: any = null;
try { const m = await import("npm:@pdf-lib/fontkit@1.1.1"); fontkit = m.default || m; } catch (_e) {}
let QRCode: any = null;
try { const m = await import("npm:qrcode@1.5.3"); QRCode = m.default || m; } catch (_e) {}
// Entpackt einen Schnitt und behaelt ihn. Modulebene ist hier richtig und
// anderswo in dieser Datei ausdruecklich falsch: eine Schrift gehoert der
// Plattform, nicht einem Mandanten. Zwischen zwei Anfragen kann daraus
// nichts durchsickern, was nicht ohnehin jedem gehoert — und das Entpacken
// von 40 KB je Schnitt soll nicht bei jedem Expose neu passieren.
const immoSchriftCache = new Map<string, Uint8Array>();
async function immoSchrift(name: string): Promise<Uint8Array | null> {
const schon = immoSchriftCache.get(name);
if (schon) return schon;
const kodiert = (SCHRIFTEN_EINGEBAUT as Record<string, string>)[name];
if (!kodiert) return null;
const gepackt = Uint8Array.from(atob(kodiert), (c) => c.charCodeAt(0));
const strom = new Blob([gepackt]).stream().pipeThrough(new DecompressionStream("gzip"));
const roh = new Uint8Array(await new Response(strom).arrayBuffer());
immoSchriftCache.set(name, roh);
return roh;
}
const corsHeaders = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Methods": "POST, OPTIONS",
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonOk = (obj: any) => new Response(JSON.stringify({ ok: true, ...obj }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
const jsonErr = (status: number, msg: string) => new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
// Entfernungen kommen in Metern aus Overpass und stehen als Kilometer im
// Exposé. Gerundet wird auf hundert Meter: genauer ist eine Luftlinie nicht.
const fmtKm = (m: number) => (Math.max(0.1, Math.round(m / 100) / 10)).toLocaleString("de-DE") + " km";
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
// Der Zwischenspeicher haengt am Pfad des Logos: wer ein neues hochlaedt,
// bekommt einen neuen Dateinamen (logos/<id>-<zeit>.png) und damit eine
// neue weisse Fassung. Ein fester Name wuerde das alte Logo weiterreichen.
// Die Speicher-Huelle stellt ausserdem die Mandantenkennung voran — zwei
// Mandanten teilen sich diese Datei also nicht.
function logoCacheName(pfad: string): string {
const sauber = pfad.replace(/[^A-Za-z0-9._-]/g, "-");
return "expose/logo-weiss-v3-" + sauber + ".png";
}
async function logoWeissLaden(admin: any, pfad: string): Promise<Uint8Array | null> {
const cacheName = logoCacheName(pfad);
try {
const { data: cached } = await admin.storage.from("branding-assets").download(cacheName);
if (cached) return new Uint8Array(await cached.arrayBuffer());
} catch (_e) {}
try {
const { data } = await admin.storage.from("branding-assets").download(pfad);
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
try { await admin.storage.from("branding-assets").upload(cacheName, png, { contentType: "image/png", upsert: true }); } catch (_e2) {}
return png;
} catch (_e) { return null; }
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
// --- Storage: Pfade tragen den Mandanten als erstes Segment -----------
// Gleiche Bauart wie die Huelle der Oberflaeche. Sie steht IM Handler und
// nicht auf Modulebene: eine Mandantenvariable auf Modulebene ueberlebt in
// Deno die Anfrage und traegt den Mandanten des einen Aufrufers in den
// naechsten. Genau das waere ein Leck statt einer Trennung.
// Solange immoMandant null ist, bleibt jeder Pfad unveraendert — die
// Funktion verhaelt sich dann wie bisher.
let immoMandant: string | null = null;
const immoSetzeMandant = (m: unknown) => { immoMandant = (typeof m === "string" && m) ? m : null; };
// Die Schriften des Exposé-Baukastens liegen NICHT im Eimer und nicht auf
// der Oberflaeche, sondern in schriften.mjs neben dieser Datei. Warum, steht
// dort; kurz: ein Expose hing sonst an einer Umgebungsvariablen, einer
// Auslieferung und einem Eimerinhalt, die alle drei zusammenpassen mussten.
// Am 05.10.2026 hat die Kette gerissen, und zwar bei allen zwanzig Schnitten
// gleichzeitig.
//
// Die Liste bleibt leer: die Huelle unten holt eine fehlende Datei nur dann
// von einer Quelle, wenn sie hier eine findet. Fuer die Schriften der
// Vorlage (Montserrat und Verwandte) tun das die anderen Funktionen
// weiterhin; diese braucht sie nicht mehr.
const IMMO_SCHRIFTEN: Record<string, string> = {};
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
    await immoMandantSichern(req, [["immobilien", immobilie_id]]);
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
if (!pid) { const { data: chef } = await admin.from("profiles").select("id").eq("mandant_id", immoMandant).eq("role", "chef").limit(1).maybeSingle(); pid = chef?.id || null; }
if (!pid) return jsonErr(403, "Kein Ansprechpartner ableitbar");
userData = { user: { id: pid } };
} else {
if (!authHeader) return jsonErr(401, "Kein Auth-Token");
const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
const { data: ud, error: userErr } = await userClient.auth.getUser();
if (userErr || !ud || !ud.user) return jsonErr(401, "Nicht authentifiziert");
userData = ud;
}
const { data: profil } = await admin.from("profiles").select("id,name,titel,firma_id,funktion,telefon,email,foto_url,mandant_id").eq("id", userData.user.id).maybeSingle(); immoSetzeMandant(profil?.mandant_id);
if (!profil) return jsonErr(403, "Kein Teamzugang");
const { data: immo, error: iErr } = await admin.from("immobilien").select("*").eq("id", immobilie_id).maybeSingle();
if (iErr) throw iErr;
if (!immo) return jsonErr(404, "Objekt nicht gefunden");
const { data: gsRow } = await admin.from("immobilie_grundstueck").select("*").eq("immobilie_id", immobilie_id).maybeSingle();
const gs: any = gsRow || {};
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
// Die Standortliste im Fuss ist mit dem Querformat entfallen: der
// Seitenfuss steht jetzt in der Vorlage, und was dort steht, entscheidet
// der Makler im Editor. Die Abfrage ist damit weg — sie war ein Zugriff
// je Expose fuer eine Zeile, die niemand mehr setzt.
let finAnn: any = null;
// Zins und Tilgung fuer die Finanzierungsrechnung im Expose. Die Annahmen
// eines fremden Maklers sind hier keine Annaeherung, sondern eine falsche
// Zahl in einem Dokument, das ein Kaufinteressent bekommt.
{ const { data } = await admin.from("finanzierungs_annahmen").select("*").eq("mandant_id", immoMandant).eq("aktiv", true).limit(1).maybeSingle(); finAnn = data; }
let ap: any = profil;
if (immo.zustaendig_id && immo.zustaendig_id !== profil.id) {
const { data } = await admin.from("profiles").select("id,name,titel,firma_id,funktion,telefon,email,foto_url").eq("id", immo.zustaendig_id).maybeSingle();
if (data) ap = data;
}
const apName = [ap.titel, ap.name].map((x: any) => (x || "").trim()).filter(Boolean).join(" ");
let firma: any = null;
// Briefkopf: erst der Standort des Ansprechpartners, dann ein Standort des
// Mandanten. Der dritte Griff war "der erste aktive Standort ueberhaupt" —
// ein Rueckfall ueber die Mandantengrenze, und zwar ausgerechnet dann,
// wenn der eigene Mandant keine Stammdaten hat. Er ist gestrichen; auch
// der erste Griff bleibt jetzt im Mandanten, damit eine geerbte oder
// falsch gesetzte firma_id keinen fremden Briefkopf holt.
if (ap.firma_id) { const { data } = await admin.from("firma_stammdaten").select("*").eq("id", ap.firma_id).eq("mandant_id", immoMandant).maybeSingle(); if (data && data.aktiv !== false) firma = data; }
if (!firma) { const { data } = await admin.from("firma_stammdaten").select("*").eq("mandant_id", immoMandant).order("sortierung").limit(1).maybeSingle(); firma = data; }
if (!firma) return jsonErr(500, "Firma-Stammdaten fehlen");

// ===========================================================================
// Ab hier zeichnet der Renderer
// ---------------------------------------------------------------------------
// Bis zum 05.10.2026 stand an dieser Stelle das Expose selbst: rund
// siebenhundert Zeilen page.drawText und page.drawRectangle, ein Querformat
// mit festen Seiten. Der Auftrag "Exposé-Baukasten" ersetzt das durch ein
// Vorlagendokument: diese Funktion LAEDT die Vorlage, sammelt Daten, Bilder
// und Schriften und uebergibt sie an packages/expose-renderer — dasselbe
// Paket, mit dem der Editor die Vorschau zeichnet.
//
// Was bleibt: Geocoding, Entfernungen, Lageplan, Highlights und Slogan. Das
// sind Datenbeschaffer und haben mit dem Zeichnen nichts zu tun.
// ===========================================================================

// --- Welche Vorlage? ------------------------------------------------------
// Vier Stufen, von eng nach weit: die Vorlage, die der Aufruf nennt, dann
// die Vorlage DIESES Objekts, dann die Standardvorlage des Mandanten, dann
// die Systemvorlage, die der Standort in firma_stammdaten.expose_vorlage
// nennt.
//
// Die erste Stufe ist neu (fork_43): die Oberflaeche laesst die Vorlage vor
// dem Erzeugen auswaehlen. Die drei dahinter bleiben, weil nicht jeder
// Aufruf aus der Oberflaeche kommt — Portalexport, Newsletter und die
// Nachbestellung eines Exposes nennen keine Vorlage und muessen trotzdem
// eine bekommen.
const BASEN = ["raster", "signature", "studio"];
const basisName = BASEN.includes(String(firma.expose_vorlage || ""))
  ? String(firma.expose_vorlage) : "raster";
let vz: any = null;
// Die Mandantengrenze gilt fuer beide Wege: der Dienstschluessel sieht jede
// Vorlage, und eine Kennung aus dem Anfragekoerper oder aus einer Zeile
// kann falsch gesetzt sein. Systemvorlagen (mandant_id null) sind fuer alle.
const vorlageHolen = async (kennung: string) => {
const { data } = await admin.from("expose_vorlagen")
.select("id,name,mandant_id,dokument").eq("id", kennung).maybeSingle();
if (data && (data.mandant_id === null || data.mandant_id === immoMandant)) return data;
if (data) warnungen.push("Die gewaehlte Vorlage gehoert einem anderen Mandanten — sie wurde nicht benutzt.");
return null;
};
const gewaehlteVorlage = typeof body.vorlage_id === "string" && body.vorlage_id
  ? body.vorlage_id : null;
if (gewaehlteVorlage) {
vz = await vorlageHolen(gewaehlteVorlage);
// Die Wahl bleibt am Objekt stehen: beim naechsten Erzeugen — und beim
// Portalexport, der keine nennt — gilt dieselbe Vorlage.
if (vz && immo.expose_vorlage_id !== vz.id) {
await admin.from("immobilien").update({ expose_vorlage_id: vz.id }).eq("id", immobilie_id);
}
}
if (!vz && immo.expose_vorlage_id) {
vz = await vorlageHolen(immo.expose_vorlage_id);
}
if (!vz) {
const { data } = await admin.from("expose_vorlagen").select("id,name,dokument")
.eq("mandant_id", immoMandant).eq("ist_standard", true).eq("archiviert", false).maybeSingle();
if (data) vz = data;
}
if (!vz) {
const { data } = await admin.from("expose_vorlagen").select("id,name,dokument")
.is("mandant_id", null).eq("basis", basisName).limit(1).maybeSingle();
if (data) vz = data;
}
const vorlage = vz && vz.dokument;
if (!vorlage || !Array.isArray(vorlage.seiten) || !vorlage.seiten.length) {
return jsonErr(500, "Keine Exposé-Vorlage gefunden. Die Systemvorlagen kommen "
+ "mit der Migration fork_38 in die Datenbank; ist sie eingespielt?");
}
const overrides = (immo.expose_overrides && typeof immo.expose_overrides === "object"
&& !Array.isArray(immo.expose_overrides)) ? immo.expose_overrides : {};
await schritt("vorlage-ok", vz.name + " " + vorlage.seiten.length + " Seiten");

// --- Die Schriften --------------------------------------------------------
// Nur die Schnitte, die die Vorlage nennt. Zwanzig zu laden, wo sechs
// gebraucht werden, kostet bei jedem Expose eine Sekunde.
//
// Sie liegen im Eimer unter fonts/expose/. Fehlt eine, holt die Huelle sie
// einmal von der ausgelieferten Oberflaeche (dist/schriften/expose/, von
// scripts/bauen.py dorthin gelegt) und legt sie im Eimer ab. Von der
// Google-Quelle kann sie NICHT kommen: die gelieferten Schnitte sind
// Instanzen einer variablen Schrift, auf den Zeichensatz der Vorlagen
// verkleinert und ohne GSUB/GPOS — es gibt sie nur hier.
const gebrauchteSchnitte = new Set<string>();
{
const sammle = (x: any): void => {
if (Array.isArray(x)) { for (const e of x) sammle(e); return; }
if (!x || typeof x !== "object") return;
if (typeof x.familie === "string" && typeof x.schnitt === "string") {
try { gebrauchteSchnitte.add(Expose.schnittName(x)); } catch (_e) { /* unbekannte Familie meldet der Renderer */ }
}
for (const v of Object.values(x)) sammle(v);
};
sammle(vorlage);
}
if (!gebrauchteSchnitte.size) return jsonErr(500, "Die Vorlage nennt keine Schrift.");
const schriften = new Map<string, any>();
for (const name of gebrauchteSchnitte) {
const roh = await immoSchrift(name);
if (!roh) {
// Das ist kein Betriebsfehler mehr, sondern ein Fehler in der Vorlage:
// sie nennt einen Schnitt, den es nicht gibt. Die zwanzig, die es gibt,
// stehen in packages/expose-renderer (SCHNITTE).
return jsonErr(500, "Die Vorlage " + vz.name + " nennt den Schriftschnitt \""
+ name + "\", und den gibt es nicht. Erlaubt sind: "
+ Expose.SCHNITTE.join(", ") + ".");
}
schriften.set(name, Expose.metrikLesen(roh, name));
}
await schritt("schriften-ok", Array.from(gebrauchteSchnitte).join(" "));

// --- Die Bilder -----------------------------------------------------------
// Der Schluessel eines Bildes ist sein Speicherpfad. Damit kann dasselbe
// Foto in mehreren Slots stehen und wird trotzdem nur einmal geladen und
// nur einmal in das PDF eingebettet.
const MAX_KANTE = 1600;
const bilder = new Map<string, Uint8Array>();
const bildWerte: Record<string, string> = {};
const bildTitel: Record<string, string> = {};
const kiBilder: string[] = [];
async function bytesVon(d: any): Promise<Uint8Array | null> {
const webPfad = d.storage_path.replace(/\.[^/.]+$/, "") + "_web.jpg";
const istJpg = (u: Uint8Array) => u.length > 3 && u[0] === 0xFF && u[1] === 0xD8;
// Erst die Web-Fassung: sie ist fuer genau diesen Zweck da und schon
// klein. Dann die Werkstatt bitten, eine zu bauen. Dann der Umbau beim
// Herunterladen. Zuletzt das Original.
try {
const { data, error } = await admin.storage.from("immobilie-dateien").download(webPfad);
if (!error && data) {
const u = new Uint8Array(await data.arrayBuffer());
if (istJpg(u)) return u;
}
} catch (_e) {}
try {
await admin.functions.invoke("bild-web-variante", { body: { datei_id: d.id, neu: true } });
const { data, error } = await admin.storage.from("immobilie-dateien").download(webPfad);
if (!error && data) return new Uint8Array(await data.arrayBuffer());
} catch (_e) {}
try {
const { data, error } = await admin.storage.from("immobilie-dateien").download(d.storage_path, {
transform: { width: MAX_KANTE, height: MAX_KANTE, resize: "contain", quality: 75, format: "origin" },
});
if (!error && data) {
const u = new Uint8Array(await data.arrayBuffer());
if (istJpg(u)) {
try { await admin.storage.from("immobilie-dateien").upload(webPfad, u, { contentType: "image/jpeg", upsert: true }); } catch (_e2) {}
return u;
}
}
} catch (_e) {}
const { data } = await admin.storage.from("immobilie-dateien").download(d.storage_path);
if (!data) return null;
const u = new Uint8Array(await data.arrayBuffer());
// Ein grosses PNG ohne Web-Fassung sprengt den Speicher der Funktion.
// Lieber ein Platzhalter mit Warnung als ein Abbruch ohne Expose.
const istPng = u.length > 24 && u[0] === 0x89 && u[1] === 0x50;
if (istPng) {
const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
if (dv.getUint32(16) * dv.getUint32(20) > 1500000) {
warnungen.push("Bild ohne Web-Fassung uebersprungen, PNG zu gross: " + (d.name || ""));
return null;
}
}
return u;
}
async function nimmBild(schluessel: string, d: any): Promise<void> {
if (!d || !d.storage_path) return;
// Die Bildunterschrift steht am BILD, nicht in der Vorlage. Eine Vorlage,
// die "Wohnbereich" unter ein Foto schreibt, behauptet etwas ueber ein
// Bild, das sie nie gesehen hat — am 06.10.2026 stand so "Seeterrasse"
// unter einem Schlafzimmer.
if (typeof d.titel === "string" && d.titel.trim()) bildTitel[schluessel] = d.titel.trim();
if (!bilder.has(d.storage_path)) {
let bytes: Uint8Array | null = null;
try { bytes = await bytesVon(d); }
catch (e) { warnungen.push("Bild nicht ladbar: " + (d.name || "") + " (" + (e as Error).message + ")"); }
if (!bytes) return;
bilder.set(d.storage_path, bytes);
if (d.ki_bearbeitet) kiBilder.push(d.storage_path);
}
bildWerte[schluessel] = d.storage_path;
}
// Das Titelbild steht nicht in der Fotoliste: sonst stuende dasselbe Bild
// auf der Titelseite und als erstes Foto darin.
const titelDatei = (immo.expose_titelbild_id
&& alleDateien.find((d: any) => d.id === immo.expose_titelbild_id)) || fotos[0] || null;
const weitereFotos = fotos.filter((d: any) => !titelDatei || d.id !== titelDatei.id);
await nimmBild("objekt.hauptbild_url", titelDatei);
for (let i = 0; i < Math.min(weitereFotos.length, 10); i++) {
await nimmBild("bild.foto." + (i + 1), weitereFotos[i]);
// Fotos tragen im Expose die Bildunterschrift, die am Objekt gepflegt
// ist. Sie gehoert zum Bild, nicht zur Vorlage — darum als Abweichung
// am Bildslot und nicht als Text in der Vorlage.
}
for (let i = 0; i < Math.min(grundrisse.length, 6); i++) {
await nimmBild("bild.grundriss." + (i + 1), grundrisse[i]);
}
await nimmBild("bild.lageplan", lageplaene[0]);
// Nach Kategorie: eine Vorlage kann "das erste Badfoto" anfordern.
{
const nachKategorie: Record<string, any[]> = {};
for (const d of weitereFotos) {
const k = String(d.doktyp || d.kategorie || "").toLowerCase().trim();
if (!k) continue;
(nachKategorie[k] = nachKategorie[k] || []).push(d);
}
for (const [k, liste] of Object.entries(nachKategorie)) {
for (let i = 0; i < Math.min(liste.length, 4); i++) {
// Nur auf Bilder zeigen, die auch geladen sind: ein Pfad ohne Bytes
// waere ein Loch im PDF, nicht einmal ein Platzhalter.
if (!bilder.has(liste[i].storage_path)) continue;
const kschluessel = "bild.kategorie." + k + "." + (i + 1);
bildWerte[kschluessel] = liste[i].storage_path;
if (typeof liste[i].titel === "string" && liste[i].titel.trim()) {
bildTitel[kschluessel] = liste[i].titel.trim();
}
}
}
}
// Das Portraet des Ansprechpartners liegt in einem anderen Eimer und
// braucht darum seinen eigenen Weg.
try {
const foto = await apFotoLaden(admin, ap.foto_url || null);
if (foto && foto.buf) {
const pfad = "ansprechpartner:" + ap.id;
bilder.set(pfad, new Uint8Array(foto.buf));
bildWerte["ansprechpartner.foto"] = pfad;
}
} catch (_e) { warnungen.push("Portraetfoto nicht ladbar."); }
// Zwei Logos, nicht eines: auf dunklem Grund braucht es die helle Fassung.
// Die rechnet logoWeissLaden einmal aus und legt sie im Eimer ab.
const logoPfad = String(firma.logo_pfad || "logo.png");
let logoForm: "breit" | "quadratisch" | undefined;
try {
const { data } = await admin.storage.from("branding-assets").download(logoPfad);
if (data) {
const pfad = "logo:hell";
const bytes = new Uint8Array(await data.arrayBuffer());
bilder.set(pfad, bytes);
bildWerte["firma.logo.hell"] = pfad;
// Wortzeichen oder Bildzeichen? Danach richtet sich, wie viel Platz die
// Vorlage dem Logo gibt. Ein breites Wortzeichen in einem quadratischen
// Rahmen wird winzig — das war am 06.10.2026 der Befund an zwei echten
// Exposés. Die Schwelle 2,2 trennt ein Quadrat oder leichtes Rechteck
// (Bildzeichen) von einem Schriftzug.
try {
const img = await Image.decode(bytes);
if (img.width && img.height) {
logoForm = img.width / img.height >= 2.2 ? "breit" : "quadratisch";
}
} catch (_e3) { /* Form unbekannt: die Vorlage bleibt bei ihrem Vorgabefall */ }
} else {
warnungen.push("Kein Logo im Eimer branding-assets unter " + logoPfad
+ " — die Vorlagen setzen stattdessen den Markennamen.");
}
} catch (_e) {}
try {
// Dieselbe Datei, nicht "logo.png": die weisse Fassung entsteht aus dem
// Logo DIESES Mandanten. Vorher stand hier ein fester Name, den es im
// eigenen Projekt nicht gibt — die dunklen Seiten blieben ohne Logo.
const weiss = await logoWeissLaden(admin, logoPfad);
if (weiss) { bilder.set("logo:dunkel", weiss); bildWerte["firma.logo.dunkel"] = "logo:dunkel"; }
} catch (_e) {}
await schritt("bilder-ok", bilder.size + " Bilder, " + kiBilder.length + " mit KI");

// --- Die Daten ------------------------------------------------------------
const daten = Expose.aufbereiten({
immobilie: immo,
firma,
ansprechpartner: ap,
annahmen: finAnn,
bilder: bildWerte,
bildtitel: bildTitel,
logo_form: logoForm,
ki_bilder: kiBilder,
});

// --- Zeichnen -------------------------------------------------------------
const ergebnis = Expose.rendern({
vorlage, daten, schriften, overrides,
marke: { primaer: firma.ci_primaer || undefined, akzent: firma.ci_akzent || undefined },
});
for (const w of ergebnis.warnungen) {
// Fehlende Bilder und fehlende Werte sind der Normalfall eines
// unvollstaendig gepflegten Objekts und stehen im Protokoll. In die
// Antwort gehoeren sie nur, wenn der Makler etwas tun kann.
if (w.art === "unbekannt" || w.art === "fehlendes_zeichen" || w.art === "gekuerzt") {
warnungen.push((w.seite ? w.seite + ": " : "") + w.text);
}
}
await schritt("gezeichnet", ergebnis.seiten.length + " Seiten, "
+ ergebnis.warnungen.length + " Warnungen");

const pdfBytes = await Expose.zuPdf({
seiten: ergebnis.seiten,
schriften,
bilder,
titel: "Exposé " + (immo.objekttitel || immo.bezeichnung || ""),
verfasser: String(firma.firma_name || ""),
qr: QRCode ? (inhalt: string) => {
const q = QRCode.create(inhalt, { errorCorrectionLevel: "M" });
const n = q.modules.size, roh = q.modules.data;
const aus: boolean[][] = [];
for (let r = 0; r < n; r++) {
const zeile: boolean[] = [];
for (let c = 0; c < n; c++) zeile.push(!!roh[r * n + c]);
aus.push(zeile);
}
return aus;
} : undefined,
}, { PDFLib, fontkit });
await schritt("pdf-fertig", "bytes=" + pdfBytes.length + " seiten=" + ergebnis.seiten.length);

if (body.nur_pruefen) {
return jsonOk({
nur_pruefen: true, vorlage: vz.name, seiten: ergebnis.seiten.length,
bytes: pdfBytes.length, bilder: bilder.size, ki_bilder: kiBilder.length,
schnitte: Array.from(gebrauchteSchnitte),
seitennamen: ergebnis.seiten.map((s: any) => s.name),
befunde: ergebnis.warnungen.map((w: any) => ({ art: w.art, seite: w.seite, element: w.element, text: w.text })),
warnungen,
});
}

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
return jsonOk({ signed_url: signed ? signed.signedUrl : null, dateiname, pfad,
vorlage: vz.name, seiten: ergebnis.seiten.length, warnungen });
} catch (e) {
const msg = e instanceof Error ? (e.message + " || " + (e.stack || "").slice(0, 300)) : String(e);
console.error("expose-pdf-erzeugen:", msg);
try { await schritt("EXCEPTION", msg); } catch (_e2) {}
return jsonErr(500, msg);
}
});
