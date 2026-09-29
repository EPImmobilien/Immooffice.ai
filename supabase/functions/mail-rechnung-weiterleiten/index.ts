// ============================================================================
// mail-rechnung-weiterleiten v3 (Deploy-Version 11)
//   Erkennt Rechnungen im Posteingang (Vorfilter + KI) und leitet sie mit allen
//   Anhängen (per IMAP aus dem Original gezogen) an die Buchhaltung weiter.
//   Body: { modus: "batch", limit? }   -> Cron: offene Mails (rechnung_status NULL, letzte 3 Tage)
//         { mail_eingang_id, erzwingen? } -> Einzelmail (Nutzer chef/mitarbeiter)
//   v2: interne Weiterleitungen von Kollegen (ag@, le@ ...) werden geprüft; ausgeschlossen sind nur
//       Mails von/an die Buchhaltung selbst und unsere eigenen Automatik-Weiterleitungen.
//   v3: Zieladresse je Absender aus der Tabelle mail_rechnung_ziele (z. B. Olaf Kraus →
//       berlin.buchhaltung@); ohne Treffer weiterhin die zentrale Buchhaltung. Mehrere Ziele
//       durch Komma getrennt möglich. rechnung_info.an/regel halten fest, wohin und warum.
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

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const ZIEL_STANDARD = Deno.env.get("BUCHHALTUNG_EMAIL") || "buchhaltung@immooffice.example";
const VORFILTER = /rechnung|invoice|receipt|beleg|gutschrift|zahlungserinnerung|mahnung|quittung|abrechnung|kassenbeleg|honorarnote|payment confirmation|your order|ihre bestellung|zahlungsbestätigung|bill\b|billing|gebührenbescheid|kostenbescheid|gebühren/i;
const AUSSCHLUSS = /newsletter|kontoauszug|objektstatistik|wg: ref\.-nr|infoanfrage|portalanfrage|anfrage zu ihrem objekt|exposé-beauftragung/i;
const MARKER = "Automatisch weitergeleitete Rechnung (ImmoOffice)";

function htmlZuText(html: string) {
  return String(html || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

// ---------- Zieladresse je Absender ----------
interface Ziel { an: string[]; regel: string | null }
async function zielFuer(db: any, absender: string, absenderName: string): Promise<Ziel> {
  try {
    const { data } = await db.from("mail_rechnung_ziele").select("absender_muster, name_muster, ziel_email, bezeichnung").eq("aktiv", true).order("reihenfolge").order("created_at");
    const name = String(absenderName || "").toLowerCase();
    for (const z of data || []) {
      const am = String(z.absender_muster || "").trim().toLowerCase();
      const nm = String(z.name_muster || "").trim().toLowerCase();
      const passt = (am && absender.includes(am)) || (nm && name.includes(nm));
      if (!passt) continue;
      const an = String(z.ziel_email || "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
      if (an.length) return { an, regel: z.bezeichnung || am || nm };
    }
  } catch (e) { console.warn("mail_rechnung_ziele:", e instanceof Error ? e.message : String(e)); }
  return { an: [ZIEL_STANDARD], regel: null };
}

// ---------- IMAP + MIME ----------
async function entschluessele(v: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY"); if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = v.split("."); if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungültiges Format");
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0)); const ct = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const km = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const k = await crypto.subtle.importKey("raw", km, { name: "AES-GCM" }, false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, ct));
}
function bytesZuText(bytes: Uint8Array): string { let out = ""; for (let i = 0; i < bytes.length; i += 32768) out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + 32768, bytes.length))) as any); return out; }
function kopfWert(kopf: string, name: string): string { const flach = kopf.replace(/\r?\n[ \t]+/g, " "); const m = flach.match(new RegExp("(?:^|\\n)" + name + ":[ \\t]*([^\\r\\n]*)", "i")); return m ? m[1].trim() : ""; }
function parameter(wert: string, name: string): string { const m = wert.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', "i")) || wert.match(new RegExp(name + "\\s*=\\s*([^;\\s]+)", "i")); return m ? m[1] : ""; }
function dekodiereDateiname(roh: string): string {
  if (!roh) return "";
  let n = roh.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs: string, art: string, daten: string) => {
    try { if (art.toUpperCase() === "B") return new TextDecoder(cs.toLowerCase()).decode(Uint8Array.from(atob(daten), c => c.charCodeAt(0)));
      const bytes: number[] = []; daten.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})|([\s\S])/g, (_t, hex: string, ch: string) => { bytes.push(hex ? parseInt(hex, 16) : ch.charCodeAt(0)); return ""; });
      return new TextDecoder(cs.toLowerCase()).decode(new Uint8Array(bytes)); } catch { return daten; } });
  if (/^[^']*''/.test(n)) { try { n = decodeURIComponent(n.replace(/^[^']*''/, "")); } catch { /* egal */ } }
  return n.trim();
}
function base64ZuBytes(text: string): Uint8Array { const bin = atob(text.replace(/[^A-Za-z0-9+/=]/g, "")); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function quotedPrintableZuBytes(text: string): Uint8Array { const bytes: number[] = []; const t = text.replace(/=\r?\n/g, ""); for (let i = 0; i < t.length; i++) { if (t[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(t.substr(i + 1, 2))) { bytes.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; } else bytes.push(t.charCodeAt(i) & 0xff); } return new Uint8Array(bytes); }
function grenzmarken(q: string): string[] { const out = new Set<string>(); const re = /boundary\s*=\s*(?:"([^"]+)"|([^";\r\n]+))/gi; let m; while ((m = re.exec(q)) !== null) { const b = (m[1] || m[2] || "").trim(); if (b) out.add(b); } return [...out]; }
function abschnitte(q: string): string[] {
  const trenner: { start: number; ende: number }[] = [];
  for (const b of grenzmarken(q)) { const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const re = new RegExp("(^|\\r?\\n)--" + esc + "(--)?[ \\t]*(?=\\r?\\n|$)", "g"); let m; while ((m = re.exec(q)) !== null) trenner.push({ start: m.index + m[1].length, ende: m.index + m[0].length }); }
  trenner.sort((a, b) => a.start - b.start); if (!trenner.length) return [q];
  const out: string[] = []; for (let i = 0; i < trenner.length; i++) { const von = trenner[i].ende, bis = i + 1 < trenner.length ? trenner[i + 1].start : q.length; if (bis > von) out.push(q.substring(von, bis)); }
  return out;
}
interface Anhang { filename: string; contentType: string; content: Uint8Array }
function findeAnhaenge(q: string): Anhang[] {
  const out: Anhang[] = [];
  for (const roh of abschnitte(q)) {
    if (out.length >= 15) break;
    const a = roh.replace(/^\r?\n/, ""); const trenn = a.search(/\r?\n\r?\n/); if (trenn < 0 || trenn > 8000) continue;
    const kopf = a.substring(0, trenn); if (!/content-/i.test(kopf)) continue;
    const ct = kopfWert(kopf, "Content-Type") || ""; if (/^multipart\//i.test(ct)) continue;
    const cd = kopfWert(kopf, "Content-Disposition"); const name = dekodiereDateiname(parameter(cd, "filename") || parameter(ct, "name"));
    if (!/attachment/i.test(cd) && !name) continue;
    const koerper = a.substring(trenn).replace(/^\r?\n\r?\n/, ""); const kod = (kopfWert(kopf, "Content-Transfer-Encoding") || "7bit").toLowerCase();
    let bytes: Uint8Array;
    if (kod.includes("base64")) bytes = base64ZuBytes(koerper); else if (kod.includes("quoted")) bytes = quotedPrintableZuBytes(koerper); else { bytes = new Uint8Array(koerper.length); for (let i = 0; i < koerper.length; i++) bytes[i] = koerper.charCodeAt(i) & 0xff; }
    if (bytes.length) out.push({ filename: name || "anhang", contentType: (ct.split(";")[0] || "application/octet-stream").trim().toLowerCase(), content: bytes });
  }
  return out;
}
class SimpleImap {
  private conn: Deno.TlsConn | null = null; private enc = new TextEncoder(); private buffer = ""; private n = 0;
  constructor(private host: string, private port: number, private user: string, private pass: string) {}
  private tag() { this.n++; return `A${String(this.n).padStart(4, "0")}`; }
  async connect() { this.conn = await Deno.connectTls({ hostname: this.host, port: this.port }); await this.readUntil(/^\* OK/m, 10000); }
  private async lese(buf: Uint8Array, ms: number) { return await Promise.race([this.conn!.read(buf), new Promise<null>((r) => setTimeout(() => r(null), Math.max(1, ms)))]); }
  private async readUntil(re: RegExp, ms: number): Promise<string> {
    const start = Date.now(); const buf = new Uint8Array(16384);
    while (Date.now() - start < ms) {
      const m = this.buffer.match(re);
      if (m) { const idx = (m as any).index + m[0].length; const eol = this.buffer.indexOf("\n", idx); const cut = eol >= 0 ? eol + 1 : this.buffer.length; const r = this.buffer.substring(0, cut); this.buffer = this.buffer.substring(cut); return r; }
      const n = await this.lese(buf, ms - (Date.now() - start)); if (n === null) throw new Error("IMAP timeout"); if (n === 0) throw new Error("Verbindung geschlossen");
      this.buffer += bytesZuText(buf.subarray(0, n));
    }
    throw new Error("IMAP timeout");
  }
  private async send(l: string) { await this.conn!.write(this.enc.encode(l + "\r\n")); }
  private async cmd(c: string, ms = 15000) { const t = this.tag(); await this.send(`${t} ${c}`); const r = await this.readUntil(new RegExp(`^${t} (OK|NO|BAD)`, "m"), ms); if (/^[A-Z]\d{4} (NO|BAD)/m.test(r)) throw new Error(`IMAP: ${r.substring(0, 200)}`); return r; }
  async login() { await this.cmd(`LOGIN "${this.user.replace(/"/g, '\\"')}" "${this.pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`); }
  async selectFolder(f: string) { await this.cmd(`SELECT "${f.replace(/"/g, '\\"')}"`); }
  async fetchMailSource(uid: number, ms = 25000): Promise<string | null> {
    const t = this.tag(); await this.send(`${t} UID FETCH ${uid} (BODY.PEEK[])`); const start = Date.now();
    let kopf = this.buffer; this.buffer = ""; let groesse = 0, rest = ""; const klein = new Uint8Array(8192);
    while (Date.now() - start < ms) { const m = kopf.match(/\{(\d+)\}\r?\n/); if (m) { groesse = parseInt(m[1], 10); rest = kopf.substring((m as any).index + m[0].length); break; } if (new RegExp(`${t} (NO|BAD)`).test(kopf)) return null; if (kopf.length > 300000) break; const n = await this.lese(klein, ms - (Date.now() - start)); if (n === null) throw new Error("FETCH timeout"); if (n === 0) throw new Error("Verbindung geschlossen"); kopf += bytesZuText(klein.subarray(0, n)); }
    if (!groesse) return null;
    const teile: string[] = []; let haben = 0; if (rest) { teile.push(rest); haben += rest.length; } const gross = new Uint8Array(65536);
    while (haben < groesse && Date.now() - start < ms) { const n = await this.lese(gross, ms - (Date.now() - start)); if (n === null) throw new Error("FETCH timeout (Inhalt)"); if (n === 0) break; const tx = bytesZuText(gross.subarray(0, n)); teile.push(tx); haben += tx.length; }
    this.buffer = ""; return teile.join("").substring(0, groesse);
  }
  async logout() { try { this.conn?.close(); } catch { /* egal */ } this.conn = null; }
}
function bytesZuBase64(b: Uint8Array) { let s = ""; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, Math.min(i + 32768, b.length))) as any); return btoa(s); }

// ---------- KI-Prüfung ----------
async function istRechnungKI(betreff: string, absender: string, text: string, anhaenge: string[]): Promise<{ rechnung: boolean; grund: string; lieferant?: string; betrag?: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) return { rechnung: false, grund: "kein KI-Key" };
  const prompt = `Prüfe, ob diese E-Mail an einen Immobilienmakler eine RECHNUNG, GUTSCHRIFT, ZAHLUNGSERINNERUNG/MAHNUNG, ein GEBÜHREN-/KOSTENBESCHEID einer Behörde oder ein sonstiger BUCHUNGSBELEG für die Buchhaltung ist (z. B. Rechnung eines Lieferanten/Portals/Software-Anbieters, Beleg einer Bestellung, Abrechnung; auch wenn ein Kollege sie intern weitergeleitet hat). KEINE Rechnung sind: Werbung, Newsletter, Portal-Anfragen, Kontoauszüge/Banking-Info, reine Lastschrift-/Zahlungseingangs-Benachrichtigungen ohne Beleg, Angebote, Verträge, eigene Rechnungen des Maklers an Kunden.\nAntworte NUR als JSON: {"rechnung": true|false, "grund": "kurz", "lieferant": string|null, "betrag": string|null}\n\nAbsender: ${absender}\nBetreff: ${betreff}\nAnhänge: ${anhaenge.join(", ") || "keine"}\n\nText:\n${text.slice(0, 5000)}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 300, messages: [{ role: "user", content: prompt }] }) });
  if (!r.ok) throw new Error(`KI ${r.status}`);
  const j = await r.json(); const roh = (j.content || []).map((c: any) => c.text || "").join("").replace(/```json|```/g, ""); const m = roh.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : roh);
}

async function verarbeiten(db: any, mail: any, erzwingen: boolean) {
  const jetzt = new Date().toISOString();
  const text = (mail.text && mail.text.trim()) ? mail.text : htmlZuText(mail.html || "");
  const absender = String(mail.absender_email || "").toLowerCase();
  const empf = String(mail.empfaenger_email || "").toLowerCase();
  const anhangNamen = Array.isArray(mail.anhaenge) ? mail.anhaenge.map((a: any) => a.name || a.filename || "").filter(Boolean) : [];
  const ziel = await zielFuer(db, absender, mail.absender_name || "");
  // Schleifenschutz: Mails von oder an eine Buchhaltungsadresse und unsere eigenen Automatik-Weiterleitungen nie erneut weiterleiten.
  const buchhaltung = /(^|\.)buchhaltung@/.test(absender) || ziel.an.includes(absender);
  const anBuchhaltung = /buchhaltung@immooffice.example\.de/.test(empf) || empf.includes(ZIEL_STANDARD) || ziel.an.some((z) => empf.includes(z));
  const schleife = buchhaltung || anBuchhaltung || text.includes(MARKER);
  if (!erzwingen && (schleife || AUSSCHLUSS.test(mail.betreff || ""))) {
    await db.from("mail_eingang").update({ rechnung_status: "keine" }).eq("id", mail.id); return { status: "keine", grund: "ausgeschlossen" };
  }
  const verdacht = erzwingen || VORFILTER.test((mail.betreff || "") + " " + anhangNamen.join(" ") + " " + text.slice(0, 4000));
  if (!verdacht) { await db.from("mail_eingang").update({ rechnung_status: "keine" }).eq("id", mail.id); return { status: "keine", grund: "kein Hinweis" }; }
  const ki = erzwingen ? { rechnung: true, grund: "manuell" } : await istRechnungKI(mail.betreff || "", `${mail.absender_name || ""} <${absender}>`, text, anhangNamen);
  if (!ki.rechnung) { await db.from("mail_eingang").update({ rechnung_status: "keine", rechnung_info: ki }).eq("id", mail.id); return { status: "keine", grund: ki.grund }; }

  let anhaenge: Anhang[] = [];
  const { data: pf } = await db.from("mail_postfaecher").select("*").eq("id", mail.postfach_id).maybeSingle();
  if (pf?.imap_server && pf.imap_passwort_verschluesselt && mail.imap_uid && mail.imap_folder) {
    const imap = new SimpleImap(pf.imap_server, Number(pf.imap_port || 993), pf.imap_user || pf.email_adresse, await entschluessele(pf.imap_passwort_verschluesselt));
    try { await imap.connect(); await imap.login(); await imap.selectFolder(mail.imap_folder); const src = await imap.fetchMailSource(mail.imap_uid); if (src) anhaenge = findeAnhaenge(src); } finally { await imap.logout(); }
  }
  const resendKey = Deno.env.get("RESEND_API_KEY"); if (!resendKey) throw new Error("RESEND_API_KEY fehlt");
  const datum = new Date(mail.gesendet_am || jetzt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  const kopf = `--- ${MARKER} ---\nVon: ${mail.absender_name || ""} <${absender}>\nAn: ${mail.empfaenger_email || ""}\nDatum: ${datum}\nBetreff: ${mail.betreff || ""}${ki.lieferant ? `\nLieferant: ${ki.lieferant}` : ""}${ki.betrag ? `\nBetrag: ${ki.betrag}` : ""}${ziel.regel ? `\nWeiterleitung an: ${ziel.an.join(", ")} (Regel: ${ziel.regel})` : ""}\nAnhänge: ${anhaenge.length ? anhaenge.map((a) => a.filename).join(", ") : "keine (ggf. Link in der Mail)"}\n---\n\n`;
  const gesamt = anhaenge.reduce((s, a) => s + a.content.length, 0);
  const mitAnhang = gesamt <= 35 * 1024 * 1024;
  const body: any = {
    from: `${pf?.absender_name || "ImmoOffice"} <${pf?.email_adresse || "info@immooffice.example"}>`, to: ziel.an, reply_to: absender || undefined,
    subject: `WG: ${mail.betreff || "(ohne Betreff)"}`,
    text: kopf + text,
    html: mail.html ? `<pre style="font-family:Arial,sans-serif;font-size:13px;white-space:pre-wrap;background:#f3f4f8;padding:10px;border-left:3px solid #D4A567">${kopf.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>` + mail.html : undefined,
    attachments: mitAnhang ? anhaenge.map((a) => ({ filename: a.filename, content: bytesZuBase64(a.content), content_type: a.contentType })) : [],
  };
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
  await db.from("mail_eingang").update({ rechnung_status: "weitergeleitet", rechnung_weitergeleitet_am: jetzt, rechnung_info: { ...ki, anhaenge: anhaenge.map((a) => a.filename), an: ziel.an.join(", "), regel: ziel.regel, zu_gross: !mitAnhang } }).eq("id", mail.id);
  return { status: "weitergeleitet", an: ziel.an, regel: ziel.regel, anhaenge: anhaenge.length, lieferant: ki.lieferant, betrag: ki.betrag };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    let userId: string | null = null;
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) { const { data: u } = await db.auth.getUser(jwt); if (u?.user) { const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle(); if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }); userId = u.user.id; } }
    const felder = "id, postfach_id, absender_email, absender_name, empfaenger_email, betreff, text, html, anhaenge, gesendet_am, imap_uid, imap_folder";
    if (body.modus === "batch") {
      const seit = new Date(Date.now() - 3 * 86400000).toISOString();
      const { data: mails } = await db.from("mail_eingang").select(felder).is("rechnung_status", null).eq("ordner", "posteingang").gte("gesendet_am", seit).order("gesendet_am", { ascending: false }).limit(Number(body.limit) || 15);
      const erg: any[] = [];
      for (const m of mails || []) { try { erg.push({ id: m.id, betreff: m.betreff, ...(await verarbeiten(db, m, false)) }); } catch (e) { const msg = e instanceof Error ? e.message : String(e); await db.from("mail_eingang").update({ rechnung_status: "fehler", rechnung_info: { fehler: msg } }).eq("id", m.id); erg.push({ id: m.id, betreff: m.betreff, status: "fehler", fehler: msg }); } }
      return antwort({ ok: true, geprueft: (mails || []).length, weitergeleitet: erg.filter((x) => x.status === "weitergeleitet").length, ergebnisse: erg });
    }
    if (!userId) return antwort({ ok: false, fehler: "Nicht angemeldet." });
    const id = String(body.mail_eingang_id || ""); if (!id) throw new Error("mail_eingang_id fehlt.");
    await immoMandantSichern(req, [["mail_eingang", id]]);
    const { data: mail } = await db.from("mail_eingang").select(felder).eq("id", id).maybeSingle();
    if (!mail) throw new Error("Mail nicht gefunden.");
    return antwort({ ok: true, ...(await verarbeiten(db, mail, !!body.erzwingen)) });
  } catch (e) { return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }); }
});
