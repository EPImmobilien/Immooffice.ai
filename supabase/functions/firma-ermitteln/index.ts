// ============================================================================
// firma-ermitteln — Firmendaten von der eigenen Website holen (fork_82)
// ============================================================================
// Eigene Funktion des Forks. Ein neuer Kunde nennt seine Website; die
// Funktion liest Startseite und Impressum, laesst ein Sprachmodell die
// Pflichtangaben herausziehen und gibt sie als VORSCHLAG zurueck — je Feld
// mit dem Satz, aus dem es stammt. Was nicht auf der Seite steht, bleibt
// leer. Geschrieben wird hier nichts: die Oberflaeche zeigt den Vorschlag
// in dem Formular, in dem die Daten ohnehin gepflegt werden, und der Kunde
// uebernimmt, was stimmt (CLAUDE.md: KI-Auslese immer ueber ein
// editierbares Formular; keine erfundenen Daten).
//
// Abrechnung ueber die Beilage _credits mit der Aktion `firma_ermitteln`
// (0 Credits — Einrichtung ist kostenlos, steht aber im Ledger), damit
// Notschalter, Tageslimit und Modellwahl des Betreibers greifen.
//
// Was NICHT geht: eine Firma ohne Website im Netz suchen. Es gibt keine
// Suchmaschine hinter dieser Funktion, und ein geratener Treffer waere
// genau die erfundene Angabe, die CLAUDE.md verbietet.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { kiAbrechnen, abgelehnt } from "./credits.ts";
import type { Abrechnung } from "./credits.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MODELL = "claude-sonnet-4-6";
const FELDER = ["firma_name", "rechtsform", "strasse", "plz", "ort", "land", "telefon", "fax", "email", "web",
  "registergericht", "hrb", "ust_id", "geschaeftsfuehrer", "aufsichtsbehoerde", "kammer", "steuernummer"] as const;

const SYSTEM = `Du liest den Text einer Firmenwebsite (Startseite und Impressum) eines deutschen Immobilienunternehmens und ziehst die Angaben zur Firma heraus.
Regeln, ohne Ausnahme:
- Nur, was WOERTLICH im Text steht. Nichts ergaenzen, nichts raten, nichts aus dem Firmennamen ableiten. Fehlt eine Angabe, ist sie null.
- Zu jedem gefundenen Wert den kurzen Textausschnitt (max. 120 Zeichen), in dem er steht, als "beleg".
- "strasse" enthaelt Strasse UND Hausnummer. "plz" nur die fuenf Ziffern. "ort" ohne PLZ.
- "firma_name" ist der volle Firmenname mit Rechtsform, wie er im Impressum steht; "rechtsform" nur die Rechtsform (GmbH, GmbH & Co. KG, e.K., AG, UG, Einzelunternehmen ...).
- "geschaeftsfuehrer": Namen der vertretungsberechtigten Personen, mit Komma getrennt.
- "registergericht" z. B. "Amtsgericht Musterstadt"; "hrb" die Registernummer wie angegeben (z. B. "HRB 12345").
- "ust_id" beginnt mit DE; "steuernummer" nur, wenn ausdruecklich als Steuernummer bezeichnet.
- "aufsichtsbehoerde" ist die Erlaubnisbehoerde nach § 34c GewO, "kammer" die IHK, falls genannt.
- "email" die allgemeine Kontaktadresse, "telefon" die Zentrale.
Antworte NUR mit JSON dieser Form:
{"felder": {"firma_name": {"wert": "...", "beleg": "..."}, ...}, "hinweise": ["..."]}
Jedes der Felder ${FELDER.join(", ")} kommt vor, mit {"wert": null, "beleg": null}, wenn es fehlt. "hinweise" nennt Auffaelligkeiten (mehrere Firmen im Impressum, widerspruechliche Angaben), sonst [].`;

// --- Netz ------------------------------------------------------------------------
function erlaubteAdresse(roh: string): URL | null {
  let s = String(roh || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  if (!URL.canParse(s)) return null;
  const u = new URL(s);
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase();
  // Keine internen Ziele: localhost, IP-Adressen, .local — das waere ein Weg in die eigene Infrastruktur.
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
  if (!h.includes(".")) return null;
  u.hash = "";
  return u;
}

async function laden(u: URL): Promise<{ html: string; url: string } | null> {
  // Ohne try/finally in dieser Hilfe: die Reservierung (unten) haelt das
  // einzige try des Handlers, und tests/credits.js besteht darauf.
  const steuer = new AbortController();
  const uhr = setTimeout(() => steuer.abort(), 12000);
  const r = await fetch(u.toString(), { signal: steuer.signal, redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; immoOffice-Einrichtung/1.0)", "Accept": "text/html,*/*;q=0.5", "Accept-Language": "de-DE,de;q=0.9" } })
    .catch(() => null);
  if (!r || !r.ok || !erlaubteAdresse(r.url) || !/html|text/i.test(r.headers.get("content-type") || "")) { clearTimeout(uhr); return null; }
  const leser = r.body?.getReader();
  if (!leser) { clearTimeout(uhr); return null; }
  const ergebnis = await (async () => {
    const teile: Uint8Array[] = []; let groesse = 0;
    while (groesse < 600000) {
      const { done, value } = await leser.read();
      if (done) break;
      if (value) { teile.push(value); groesse += value.length; }
    }
    await leser.cancel().catch(() => {});
    const alle = new Uint8Array(groesse); let o = 0;
    for (const t of teile) { alle.set(t.subarray(0, Math.min(t.length, groesse - o)), o); o += t.length; if (o >= groesse) break; }
    return { html: new TextDecoder("utf-8", { fatal: false }).decode(alle), url: r.url };
  })().catch(() => null);
  clearTimeout(uhr);
  return ergebnis;
}

function entity(s: string) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&uuml;/g, "ü").replace(/&ouml;/g, "ö").replace(/&auml;/g, "ä").replace(/&Uuml;/g, "Ü")
    .replace(/&Ouml;/g, "Ö").replace(/&Auml;/g, "Ä").replace(/&szlig;/g, "ß").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function text(html: string, maxZeichen: number) {
  const ohne = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d|section|article|address|dt|dd)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return entity(ohne).replace(/[ \t\r\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxZeichen);
}
function impressumLink(html: string, basis: URL): URL | null {
  const treffer = Array.from(html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const kandidaten = treffer.filter((m) => /impressum|imprint|anbieterkennzeichnung/i.test(m[1] + " " + m[2]))
    .concat(treffer.filter((m) => /kontakt|contact/i.test(m[1] + " " + m[2])));
  for (const m of kandidaten) {
    try { const u = new URL(m[1], basis); if (erlaubteAdresse(u.toString()) && u.hostname === basis.hostname) return u; } catch { /* naechster */ }
  }
  return null;
}
function hinweiseAusHtml(html: string) {
  const mails = Array.from(new Set(Array.from(html.matchAll(/mailto:([^"'?\s>]+)/gi)).map((m) => entity(m[1]).toLowerCase()))).slice(0, 5);
  const tels = Array.from(new Set(Array.from(html.matchAll(/tel:([+\d][^"'\s>]*)/gi)).map((m) => m[1]))).slice(0, 5);
  const titel = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const site = html.match(/<meta\b[^>]*property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']+)["']/i)?.[1] || "";
  return { mails, tels, titel: entity(titel).slice(0, 120), site: entity(site).slice(0, 120) };
}

// --- Marke: Farben, Schriften, Logos — ohne KI, aus HTML und CSS ---------------------
// Eine Farbe ist ein Messwert, kein Urteil: gezaehlt wird, wie oft sie im
// Stylesheet steht, gewichtet mit Saettigung und mit der Naehe zu Woertern
// wie primary/brand/accent/button. Weiss, Schwarz und Grau sind Papier und
// Tinte, keine Marke, und fallen heraus. Vorgeschlagen wird — entschieden
// wird im Formular.
function hexNorm(s: string): string | null {
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return ("#" + m[1].split("").map((c) => c + c).join("")).toUpperCase();
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return ("#" + m[1]).toUpperCase();
  m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) { const [r, g, b] = [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, Number(x)))); return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase(); }
  return null;
}
function hsl(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const d = max - min; const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  return { h, s: sat, l };
}
async function stylesheets(html: string, basis: URL): Promise<{ css: string; googleFonts: string[] }> {
  const teile: string[] = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) teile.push(m[1]);
  for (const m of html.matchAll(/\bstyle\s*=\s*["']([^"']{0,400})["']/gi)) teile.push(m[1] + ";");
  const googleFonts: string[] = [];
  const links = Array.from(html.matchAll(/<link\b[^>]*rel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/gi))
    .concat(Array.from(html.matchAll(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*stylesheet[^"']*["']/gi)));
  let geladen = 0;
  for (const m of links) {
    let u: URL;
    if (!URL.canParse(m[1], basis)) continue;
    u = new URL(m[1], basis);
    if (/fonts\.googleapis\.com/i.test(u.hostname)) {
      for (const f of (u.searchParams.getAll("family"))) googleFonts.push(decodeURIComponent(f.split(":")[0]).replace(/\+/g, " "));
      continue;
    }
    if (geladen >= 4 || u.hostname !== basis.hostname || !erlaubteAdresse(u.toString())) continue;
    const steuer = new AbortController(); const uhr = setTimeout(() => steuer.abort(), 8000);
    const r = await fetch(u.toString(), { signal: steuer.signal, headers: { "Accept": "text/css,*/*;q=0.5" } }).catch(() => null);
    clearTimeout(uhr);
    if (!r || !r.ok) continue;
    const t = await r.text().catch(() => "");
    teile.push(t.slice(0, 300000)); geladen++;
  }
  return { css: teile.join("\n"), googleFonts: Array.from(new Set(googleFonts)) };
}
function farben(css: string, html: string) {
  const punkte = new Map<string, number>();
  const bonus = (hex: string, p: number) => punkte.set(hex, (punkte.get(hex) || 0) + p);
  for (const m of css.matchAll(/(#[0-9a-f]{3,6}\b|rgba?\([^)]*\))/gi)) { const h = hexNorm(m[0]); if (h) bonus(h, 1); }
  // Markenwoerter in der Naehe: Variablen und Klassen
  for (const m of css.matchAll(/(--[\w-]*(?:primary|primär|primaer|brand|marke|accent|akzent|main|haupt|cta)[\w-]*\s*:\s*)(#[0-9a-f]{3,6}\b|rgba?\([^)]*\))/gi)) { const h = hexNorm(m[2]); if (h) bonus(h, 40); }
  for (const m of css.matchAll(/(?:\.btn|\.button|\.primary|\.cta|\.accent|\.brand|header|nav|a\s*\{)[^}]{0,300}?(?:background(?:-color)?|color|border-color)\s*:\s*(#[0-9a-f]{3,6}\b|rgba?\([^)]*\))/gi)) { const h = hexNorm(m[1]); if (h) bonus(h, 8); }
  const theme = html.match(/<meta\b[^>]*name\s*=\s*["']theme-color["'][^>]*content\s*=\s*["']([^"']+)["']/i)?.[1];
  if (theme) { const h = hexNorm(theme.trim()); if (h) bonus(h, 60); }
  const liste = Array.from(punkte.entries()).map(([hex, n]) => {
    const { s, l } = hsl(hex);
    // Papier und Tinte raus: fast weiss, fast schwarz, grau.
    const marke = s >= 0.12 && l > 0.08 && l < 0.92;
    return { hex, n, s, l, wert: marke ? n * (0.5 + s) * (l < 0.6 ? 1.2 : 1) : 0 };
  }).filter((x) => x.wert > 0).sort((a, b) => b.wert - a.wert);
  const primaer = liste[0] || null;
  let akzent: typeof primaer = null;
  if (primaer) {
    const hp = hsl(primaer.hex).h;
    akzent = liste.slice(1).find((x) => { const d = Math.abs(hsl(x.hex).h - hp); return Math.min(d, 360 - d) > 30; }) || liste[1] || null;
  }
  return { liste: liste.slice(0, 8).map((x) => ({ hex: x.hex, treffer: x.n })), primaer: primaer?.hex || null, akzent: akzent?.hex || null };
}
const SYSTEM_SCHRIFTEN = new Set(["inherit", "initial", "unset", "sans-serif", "serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif", "cursive", "fantasy",
  "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica neue", "helvetica", "arial", "noto sans", "liberation sans", "apple color emoji", "segoe ui emoji", "segoe ui symbol", "font awesome 5 free", "font awesome 6 free", "fontawesome", "icomoon", "material icons", "dashicons", "eicons", "elementor-icons", "genericons", "swiper-icons", "woocommerce", "star"]);
function schriften(css: string, googleFonts: string[]) {
  const z = new Map<string, number>();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}!]+)/gi)) {
    const erste = m[1].split(",")[0].replace(/["']/g, "").trim();
    if (!erste || erste.startsWith("var(") || SYSTEM_SCHRIFTEN.has(erste.toLowerCase()) || /icon|awesome|glyph|symbol/i.test(erste)) continue;
    z.set(erste, (z.get(erste) || 0) + 1);
  }
  for (const g of googleFonts) z.set(g, (z.get(g) || 0) + 25);
  for (const m of css.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*["']?([^;"'}]+)/gi)) { const f = m[1].trim(); if (f && !/icon|awesome/i.test(f)) z.set(f, (z.get(f) || 0) + 10); }
  const liste = Array.from(z.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, treffer]) => ({ name, treffer }));
  return { liste, vorschlag: liste[0]?.name || null, google: googleFonts };
}
function logoKandidatenMehr(html: string, basis: URL): { url: string; grund: string }[] {
  const aus: { url: string; grund: string }[] = [];
  const add = (s: string | undefined, grund: string) => { if (!s || !URL.canParse(s, basis)) return; const u = new URL(s, basis); if (/^https?:$/.test(u.protocol) && !aus.some((x) => x.url === u.toString())) aus.push({ url: u.toString(), grund }); };
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/logo|marke|brand/i.test(tag)) continue;
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1];
    add(src, "Bild mit „logo“ in Name/Klasse/Alt");
  }
  const kopf = html.match(/<header\b[\s\S]{0,6000}?<\/header>/i)?.[0] || "";
  for (const m of kopf.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1], "erstes Bild im Seitenkopf");
  for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["']apple-touch-icon[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/gi)) add(m[1], "Apple-Touch-Icon");
  for (const m of html.matchAll(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/gi)) add(m[1], "og:image (oft ein Teaserbild, kein Logo)");
  for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["'][^"']*\bicon\b[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/gi)) add(m[1], "Favicon (klein)");
  return aus.slice(0, 8);
}
// Ein Bild der Website holen und als Base64 zurueckgeben — die Oberflaeche
// kann fremde Bilder nicht selbst laden (CORS). Nur Bilder, hoechstens 3 MB.
async function bildHolen(roh: string): Promise<{ mime: string; base64: string; bytes: number } | null> {
  const u = erlaubteAdresse(roh);
  if (!u) return null;
  const steuer = new AbortController(); const uhr = setTimeout(() => steuer.abort(), 12000);
  const r = await fetch(u.toString(), { signal: steuer.signal, redirect: "follow", headers: { "Accept": "image/*" } }).catch(() => null);
  clearTimeout(uhr);
  if (!r || !r.ok) return null;
  const mime = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(png|jpeg|jpg|svg\+xml|webp|gif|x-icon|vnd\.microsoft\.icon)$/.test(mime)) return null;
  const puffer = new Uint8Array(await r.arrayBuffer());
  if (puffer.length > 3 * 1024 * 1024 || puffer.length === 0) return null;
  let bin = ""; for (let i = 0; i < puffer.length; i += 0x8000) bin += String.fromCharCode(...puffer.subarray(i, i + 0x8000));
  return { mime, base64: btoa(bin), bytes: puffer.length };
}

// --- KI ----------------------------------------------------------------------------
function jsonAusText(t: string): Record<string, unknown> {
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("Das Modell hat kein JSON geliefert.");
  return JSON.parse(t.slice(s, e + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Die Reservierung lebt ausserhalb des try: der catch-Zweig gibt sie zurueck.
  let credits: Abrechnung | null = null;
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    // Modus "logo": ein gewaehltes Bild der Website holen (fuer den Upload
    // ins Haus). Keine KI, keine Reservierung — nur das Bild.
    if (String(body.modus || "") === "logo") {
      const bild = await bildHolen(String(body.url || ""));
      if (!bild) return antwort({ ok: false, fehler: "Das Bild liess sich nicht laden (kein Bild, zu gross oder gesperrt)." }, 400);
      return antwort({ ok: true, ...bild });
    }
    const ziel = erlaubteAdresse(String(body.website || ""));
    if (!ziel) return antwort({ ok: false, fehler: "Bitte die Adresse der Website angeben (z. B. www.ihre-firma.de)." }, 400);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return antwort({ ok: false, fehler: "ANTHROPIC_API_KEY fehlt." }, 500);

    // Abrechnung (0 Credits, aber Ledger, Notschalter, Tageslimit, Modellwahl)
    const abr = await kiAbrechnen(req, "firma_ermitteln", ziel.hostname);
    if (!abr.ok) return abgelehnt(abr, cors);
    credits = abr;

    const start = await laden(ziel);
    if (!start) {
      await abr.freigeben("website nicht erreichbar");
      return antwort({ ok: false, fehler: `Die Website ${ziel.hostname} liess sich nicht laden (keine Antwort, kein HTML oder gesperrt).` }, 400);
    }
    const basis = new URL(start.url);
    const quellen = [start.url];
    let impressumText = "";
    const link = impressumLink(start.html, basis);
    if (link && link.toString() !== basis.toString()) {
      const imp = await laden(link);
      if (imp) { impressumText = text(imp.html, 20000); quellen.push(imp.url); }
    }
    if (!impressumText) {
      // Ohne Link: die ueblichen Pfade probieren
      for (const pfad of ["/impressum", "/impressum/", "/impressum.html", "/imprint", "/kontakt"]) {
        const imp = await laden(new URL(pfad, basis));
        if (imp && /impressum|angaben gem|§ ?5|registergericht|umsatzsteuer/i.test(imp.html)) { impressumText = text(imp.html, 20000); quellen.push(imp.url); break; }
      }
    }
    const startText = text(start.html, 8000);
    const html = hinweiseAusHtml(start.html);
    const logos = logoKandidatenMehr(start.html, basis);
    const styles = await stylesheets(start.html, basis);
    const marke = { farben: farben(styles.css, start.html), schriften: schriften(styles.css, styles.googleFonts), logos };

    const nutzer = `WEBSITE: ${basis.hostname}\nTITEL: ${html.titel}\nSITE-NAME: ${html.site}\nMAILTO-LINKS: ${html.mails.join(", ") || "-"}\nTEL-LINKS: ${html.tels.join(", ") || "-"}\n\n=== IMPRESSUM ===\n${impressumText || "(kein Impressum gefunden)"}\n\n=== STARTSEITE ===\n${startText}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: abr.modell(MODELL), max_tokens: abr.maxTokens(1800), temperature: abr.temperatur(0),
        system: SYSTEM, messages: [{ role: "user", content: nutzer }] }),
    });
    if (!r.ok) {
      await abr.freigeben("anthropic " + r.status);
      return antwort({ ok: false, fehler: `KI-Dienst antwortete ${r.status}.` }, 502);
    }
    const d = await r.json();
    const roh = jsonAusText(String(d?.content?.[0]?.text || ""));
    const felder: Record<string, { wert: string | null; beleg: string | null }> = {};
    const geliefert = (roh.felder || {}) as Record<string, { wert?: unknown; beleg?: unknown }>;
    for (const f of FELDER) {
      const x = geliefert[f] || {};
      const wert = x.wert === null || x.wert === undefined ? null : String(x.wert).trim() || null;
      const beleg = x.beleg === null || x.beleg === undefined ? null : String(x.beleg).trim().slice(0, 160) || null;
      // Ohne Beleg kein Wert: was das Modell nicht zeigen kann, hat es nicht gelesen.
      felder[f] = { wert: wert && beleg ? wert : null, beleg: wert && beleg ? beleg : null };
    }
    if (!felder.web.wert) felder.web = { wert: basis.origin, beleg: "Adresse der aufgerufenen Website" };
    if (!felder.email.wert && html.mails.length === 1) felder.email = { wert: html.mails[0], beleg: "mailto-Link der Startseite" };

    const usage = d?.usage || {};
    const kosten = (Number(usage.input_tokens || 0) * 3 + Number(usage.output_tokens || 0) * 15) / 1e6 * 0.92;
    await abr.buchen(kosten, "firma-ermitteln " + basis.hostname, "anthropic", abr.modell(MODELL));

    const gefunden = FELDER.filter((f) => felder[f].wert).length;
    return antwort({ ok: true, felder, logos: logos.map((l) => l.url), marke, quellen, impressum_gefunden: !!impressumText, gefunden,
      hinweise: Array.isArray(roh.hinweise) ? (roh.hinweise as unknown[]).map(String).slice(0, 5) : [] });
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    if (credits) await credits.freigeben("Abbruch: " + grund);
    console.error("firma-ermitteln:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
