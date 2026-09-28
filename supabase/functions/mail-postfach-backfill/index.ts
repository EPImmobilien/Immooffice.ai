// ============================================================================
// mail-postfach-backfill v5 (Deploy-Version 13)
//   Holt fuer EIN Postfach nachtraeglich Mails aus dem INBOX, die im Portal fehlen.
//   v2: grosse Mails (> 600 KB) "leicht" (Kopf + erster MIME-Teil).
//   v3: Keine Mail geht mehr stumm verloren:
//       - Body: { postfach_id, tage?: 7, limit?: 6, uids?: number[] } – uids gezielt nachholen.
//       - Kette: voll (kleine Mails) bzw. Teil-Abruf (Kopf + erste 400 KB des Rumpfs, bei Mails > 600 KB,
//         begrenzte CPU/Zeit) -> Kopf -> Platzhalter-Eintrag mit Betreff/Absender aus dem Kopf.
//   v5: FETCH-Antwort ohne Daten (UID existiert nicht mehr) wird erkannt statt Timeout.
//   v4: Nach einem Timeout ist die IMAP-Verbindung unbrauchbar -> vor jeder weiteren Stufe neu verbinden.
//       Grosse Mails nie mehr "leicht" (BODY[1] kann der grosse Teil sein -> CPU Time exceeded).
//       - Text-/HTML-Grenzen wie im Pull (150.000 / 600.000 Zeichen, Leerraum eingedampft).
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { simpleParser } from "npm:mailparser@3.6.6";
import { Buffer } from "node:buffer";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const LEICHT_AB = 600_000;
const TEIL_BYTES = 400_000;
const MAX_TEXT_ZEICHEN = 150_000;
const MAX_HTML_ZEICHEN = 600_000;
function bytesZuLatin1(u8: Uint8Array): string { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 8192)) as any); return s; }
function latin1ZuBytes(s: string): Uint8Array { const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255; return out; }
function htmlKompakt(html: string): string {
  if (!html) return html;
  if (/<(pre|textarea)[\s>]/i.test(html)) return html.length > MAX_HTML_ZEICHEN ? html.substring(0, MAX_HTML_ZEICHEN) : html;
  const k = html.replace(/[ \t]*\r?\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/>\n</g, "><");
  return k.length > MAX_HTML_ZEICHEN ? k.substring(0, MAX_HTML_ZEICHEN) : k;
}
async function entschluessele(v: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY"); if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = v.split("."); if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungueltiges Format");
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0)); const ct = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const km = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const k = await crypto.subtle.importKey("raw", km, { name: "AES-GCM" }, false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, ct));
}
// Literale aus einer FETCH-Antwort: BODY[HEADER] {n}, BODY[1] {n}, BODY[TEXT]<0> {n}
function literale(b: string): Record<string, string> {
  const teile: Record<string, string> = {}; const re = /BODY\[([^\]]*)\](?:<\d+>)? \{(\d+)\}\r?\n/g; let m: RegExpExecArray | null;
  while ((m = re.exec(b)) !== null) { const s0 = m.index + m[0].length, n = parseInt(m[2], 10); teile[m[1].toUpperCase()] = b.substring(s0, s0 + n); re.lastIndex = s0 + n; }
  return teile;
}
class SimpleImap {
  private conn: Deno.TlsConn | null = null; private enc = new TextEncoder(); private buffer = ""; private n = 0;
  constructor(private host: string, private port: number, private user: string, private pass: string) {}
  private tag() { this.n++; return `A${String(this.n).padStart(4, "0")}`; }
  async connect() { this.conn = await Deno.connectTls({ hostname: this.host, port: this.port }); await this.readUntil(/^\* OK/m, 10000); }
  private async lese(buf: Uint8Array, ms: number) { return await Promise.race([this.conn!.read(buf), new Promise<null>((r) => setTimeout(() => r(null), Math.max(1, ms)))]); }
  private async readUntil(re: RegExp, ms: number): Promise<string> {
    const start = Date.now(); const buf = new Uint8Array(65536);
    while (Date.now() - start < ms) {
      const m = this.buffer.match(re);
      if (m) { const idx = (m as any).index + m[0].length; const eol = this.buffer.indexOf("\n", idx); const cut = eol >= 0 ? eol + 1 : this.buffer.length; const r = this.buffer.substring(0, cut); this.buffer = this.buffer.substring(cut); return r; }
      const n = await this.lese(buf, ms - (Date.now() - start)); if (n === null) throw new Error("IMAP timeout"); if (n === 0) throw new Error("Verbindung geschlossen");
      this.buffer += bytesZuLatin1(buf.subarray(0, n));
    }
    throw new Error("IMAP timeout");
  }
  private async send(l: string) { await this.conn!.write(this.enc.encode(l + "\r\n")); }
  private async cmd(c: string, ms = 20000) { const t = this.tag(); await this.send(`${t} ${c}`); const r = await this.readUntil(new RegExp(`^${t} (OK|NO|BAD)`, "m"), ms); if (/^[A-Z]\d{4} (NO|BAD)/m.test(r)) throw new Error(`IMAP: ${r.substring(0, 200)}`); return r; }
  async login() { await this.cmd(`LOGIN "${this.user.replace(/"/g, '\\"')}" "${this.pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`); }
  async select(f: string) { await this.cmd(`SELECT "${f.replace(/"/g, '\\"')}"`); }
  async searchSince(d: Date): Promise<number[]> {
    const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
    const r = await this.cmd(`UID SEARCH SINCE ${String(d.getUTCDate()).padStart(2, "0")}-${mon}-${d.getUTCFullYear()}`, 30000);
    const line = r.split("\n").find((l) => l.startsWith("* SEARCH")); if (!line) return [];
    return line.replace("* SEARCH", "").trim().split(/\s+/).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  }
  async sizes(uids: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>(); if (!uids.length) return map;
    const r = await this.cmd(`UID FETCH ${uids.join(",")} (RFC822.SIZE)`, 20000); const re = /\* \d+ FETCH \(([^)]*)\)/g; let m;
    while ((m = re.exec(r)) !== null) { const u = parseInt(m[1].match(/UID (\d+)/)?.[1] || "", 10); const s = parseInt(m[1].match(/RFC822\.SIZE (\d+)/)?.[1] || "", 10); if (!isNaN(u) && !isNaN(s)) map.set(u, s); }
    return map;
  }
  private async block(tag: string, ms: number): Promise<string | null> {
    const endRe = new RegExp(`(^|\\r?\\n)${tag} (OK|NO|BAD)[^\\r\\n]*`, "m"); const start = Date.now();
    while (Date.now() - start < ms) {
      const em = this.buffer.match(endRe);
      if (em) { const eIdx = (em as any).index; const b = this.buffer.substring(0, eIdx); const after = eIdx + em[0].length; const eol = this.buffer.indexOf("\n", after); this.buffer = this.buffer.substring(eol >= 0 ? eol + 1 : after); return em[2] === "OK" ? b : null; }
      const buf = new Uint8Array(65536); const n = await this.lese(buf, ms - (Date.now() - start)); if (n === null) throw new Error("FETCH timeout"); if (n === 0) throw new Error("Verbindung geschlossen"); this.buffer += bytesZuLatin1(buf.subarray(0, n));
    }
    throw new Error("FETCH timeout");
  }
  async fetchSource(uid: number, ms = 20000): Promise<string | null> {
    const t = this.tag(); await this.send(`${t} UID FETCH ${uid} (BODY.PEEK[])`); const b = await this.block(t, ms); if (!b) return null;
    const lm = b.match(/\{(\d+)\}\r?\n/); if (!lm) return null; const s0 = (lm as any).index + lm[0].length; return b.substring(s0, s0 + parseInt(lm[1], 10));
  }
  // v3: Kopf + erste TEIL_BYTES des Rumpfs – klappt bei jeder Struktur; abgeschnittene Teile ignoriert der Parser.
  async fetchTeil(uid: number, ms = 15000): Promise<{ source: string | null; kopf: string | null }> {
    const t = this.tag(); await this.send(`${t} UID FETCH ${uid} (BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.${TEIL_BYTES}>)`); const b = await this.block(t, ms); if (!b) return { source: null, kopf: null };
    const teile = literale(b); const kopf = teile["HEADER"] || null; if (!kopf) return { source: null, kopf: null };
    return { source: kopf.replace(/(\r?\n)+$/, "") + "\r\n\r\n" + (teile["TEXT"] || ""), kopf };
  }
  async fetchKopf(uid: number, ms = 10000): Promise<string | null> {
    const t = this.tag(); await this.send(`${t} UID FETCH ${uid} (BODY.PEEK[HEADER])`); const b = await this.block(t, ms); if (!b) return null;
    return literale(b)["HEADER"] || null;
  }
  async logout() { try { await this.cmd("LOGOUT", 5000); } catch { /* egal */ } try { this.conn?.close(); } catch { /* egal */ } }
}
function adressen(obj: any) { const w = (obj?.value || []) as Array<{ address?: string; name?: string }>; return { liste: w.map((x) => (x.name ? `${x.name} <${x.address || ""}>` : (x.address || ""))).filter(Boolean).join(", "), erster: w[0]?.address || "", ersterName: w[0]?.name || "" }; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  let imap: SimpleImap | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const tage = Number(body.tage) || 7, limit = Number(body.limit) || 6;
    const gezielt: number[] = Array.isArray(body.uids) ? body.uids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0) : [];
    const { data: pf } = await admin.from("mail_postfaecher").select("*").eq("id", body.postfach_id).maybeSingle();
    if (!pf) throw new Error("Postfach nicht gefunden");
    const { data: ordner } = await admin.from("mail_ordner").select("id, name").eq("postfach_id", pf.id).eq("typ", "inbox").limit(1).maybeSingle();
    const folder = ordner?.name || "INBOX";
    const passwort = await entschluessele(pf.imap_passwort_verschluesselt);
    const verbinden = async () => { imap = new SimpleImap(pf.imap_server, Number(pf.imap_port || 993), pf.imap_user || pf.email_adresse, passwort); await imap.connect(); await imap.login(); await imap.select(folder); };
    await verbinden();
    const uids = gezielt.length ? gezielt : await imap!.searchSince(new Date(Date.now() - tage * 86400000));
    const { data: vorhanden } = await admin.from("mail_eingang").select("imap_uid").eq("postfach_id", pf.id).eq("imap_folder", folder).in("imap_uid", uids.length ? uids : [-1]);
    const da = new Set((vorhanden || []).map((x: any) => Number(x.imap_uid)));
    const fehlend = uids.filter((u) => !da.has(u)).sort((a, b) => b - a);
    const jetzt = fehlend.slice(0, limit);
    let groessen = new Map<number, number>(); try { groessen = await imap!.sizes(jetzt); } catch (e) { console.warn("sizes", e); }
    let geholt = 0, fehler = 0, teilAnz = 0, platzhalter = 0; const details: any[] = [];
    for (const uid of jetzt) {
      try {
        const gr = groessen.get(uid) || 0;
        let art = gr > LEICHT_AB ? "teil" : "voll";
        let src: string | null = null, kopfRoh: string | null = null;
        // Jede Stufe darf scheitern; danach ist die Verbindung ggf. unbrauchbar -> neu verbinden.
        const stufe = async <T,>(fn: () => Promise<T>): Promise<T | null> => { try { return await fn(); } catch (e) { console.warn(`UID ${uid} ${art}:`, e instanceof Error ? e.message : String(e)); try { await imap!.logout(); } catch { /* egal */ } await verbinden(); return null; } };
        if (art === "voll") { src = await stufe(() => imap!.fetchSource(uid, 20000)); if (!src) art = "teil"; }
        if (!src) { const t = await stufe(() => imap!.fetchTeil(uid, 15000)); if (t) { src = t.source; kopfRoh = t.kopf; } }
        if (!src && !kopfRoh) { kopfRoh = await stufe(() => imap!.fetchKopf(uid, 10000)); art = "platzhalter"; }
        if (!src && !kopfRoh) { fehler++; details.push({ uid, status: "fehler", grund: "Server lieferte weder Rumpf noch Kopf" }); continue; }
        const parsed: any = await simpleParser(Buffer.from(latin1ZuBytes(src || (kopfRoh! + "\r\n\r\n"))));
        const messageId = parsed.messageId || `imap-${pf.email_adresse}-${folder}-${uid}`;
        const { data: dup } = await admin.from("mail_eingang").select("id").eq("postfach_id", pf.id).eq("message_id", messageId).maybeSingle();
        if (dup) { await admin.from("mail_eingang").update({ imap_uid: uid, imap_folder: folder }).eq("id", dup.id); details.push({ uid, status: "schon da" }); continue; }
        const von = adressen(parsed.from); const text = parsed.text || ""; const html = parsed.html || "";
        const datum = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();
        const hinweisText = art === "platzhalter" ? "Der Inhalt dieser Mail konnte nicht vom Mailserver geladen werden. Bitte in Outlook/Webmail öffnen. Betreff und Absender stammen aus dem Kopf der Mail." : "";
        const anh = art === "teil"
          ? [{ filename: "Anhänge auf dem Server (Mail " + (gr / 1024 / 1024).toFixed(1) + " MB), über Anhänge laden holen", contentType: "application/octet-stream", size: gr, nicht_geladen: true }]
          : (parsed.attachments || []).map((a: any) => ({ filename: a.filename || "Datei", contentType: a.contentType, size: a.size }));
        const { error } = await admin.from("mail_eingang").insert({
          postfach_id: pf.id, ordner_id: ordner?.id || null, ordner: "posteingang", message_id: messageId, imap_uid: uid, imap_folder: folder,
          absender_email: von.erster || "", absender_name: von.ersterName, empfaenger_email: pf.email_adresse,
          betreff: parsed.subject || "(ohne Betreff)", text: (text || hinweisText).substring(0, MAX_TEXT_ZEICHEN), html: html ? htmlKompakt(html) : null,
          cc: (parsed.cc?.value || []).map((c: any) => c.address).filter(Boolean).join(", ") || null,
          anhaenge: anh, gesendet_am: datum, quelle: "mail", gelesen: false, archiviert: false,
        });
        if (error) { console.error(error); fehler++; details.push({ uid, status: "fehler", grund: error.message }); }
        else { geholt++; if (art === "teil") teilAnz++; if (art === "platzhalter") platzhalter++; details.push({ uid, status: art, von: von.erster, betreff: parsed.subject || "", datum }); }
      } catch (e) { console.error("UID", uid, e); fehler++; details.push({ uid, status: "fehler", grund: e instanceof Error ? e.message : String(e) }); }
    }
    await imap?.logout(); imap = null;
    return antwort({ ok: true, postfach: pf.email_adresse, ordner: folder, gefunden: uids.length, fehlend: fehlend.length, geholt, teil: teilAnz, platzhalter, fehler, rest: Math.max(0, fehlend.length - jetzt.length), details });
  } catch (e) {
    try { await imap?.logout(); } catch { /* egal */ }
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
