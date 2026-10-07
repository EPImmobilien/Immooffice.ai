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
function logoKandidaten(html: string, basis: URL): string[] {
  const aus: string[] = [];
  const add = (s: string | undefined) => { if (!s) return; try { const u = new URL(s, basis); if (/^https?:$/.test(u.protocol)) aus.push(u.toString()); } catch { /* egal */ } };
  for (const m of html.matchAll(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<img\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi)) { if (/logo/i.test(m[0])) add(m[1]); }
  return Array.from(new Set(aus)).slice(0, 5);
}
function hinweiseAusHtml(html: string) {
  const mails = Array.from(new Set(Array.from(html.matchAll(/mailto:([^"'?\s>]+)/gi)).map((m) => entity(m[1]).toLowerCase()))).slice(0, 5);
  const tels = Array.from(new Set(Array.from(html.matchAll(/tel:([+\d][^"'\s>]*)/gi)).map((m) => m[1]))).slice(0, 5);
  const titel = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const site = html.match(/<meta\b[^>]*property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']+)["']/i)?.[1] || "";
  return { mails, tels, titel: entity(titel).slice(0, 120), site: entity(site).slice(0, 120) };
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
    const logos = logoKandidaten(start.html, basis);

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
    return antwort({ ok: true, felder, logos, quellen, impressum_gefunden: !!impressumText, gefunden,
      hinweise: Array.isArray(roh.hinweise) ? (roh.hinweise as unknown[]).map(String).slice(0, 5) : [] });
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    if (credits) await credits.freigeben("Abbruch: " + grund);
    console.error("firma-ermitteln:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
