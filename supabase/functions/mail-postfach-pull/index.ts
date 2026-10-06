// ============================================================================
// mail-postfach-pull (v29 — Gelesen-Abgleich mit Outlook)
// ============================================================================
// imapflow funktioniert nicht stabil in Deno Edge Functions.
// Diese Version spricht IMAP direkt via Deno.connectTls() — wenig Magic.
//
// v4:  Vor dem Body-Download wird per RFC822.SIZE die Groesse je UID abgefragt.
// v22: Gesendet-Ordner des Servers werden mitgezogen (Outlook / onOffice senden
//      ueber dasselbe Postfach) → landen in mail_eingang mit ordner='gesendet'.
// v23: Grosse Mails (Exposé-Anhaenge!) werden "leicht" geholt: Kopf + erster MIME-Teil.
// v24: Umlaut-Fix: byte-treue Pufferung (Latin-1-Sicht), Parser bekommt ROHE Bytes.
// v25: Objektzuordnung beim Import (Objekt-Nr. / Adresse im Text).
// v26: HTML-Leerraum eindampfen (htmlKompakt), Grenzen 600.000 HTML / 150.000 Text.
// v27 (16.09.2026): KEINE MAIL GEHT MEHR STUMM VERLOREN.
//      Befund: UID 34322 (info@, 4,3 MB, Fotos) wurde "leicht" geholt, der Server lieferte fuer
//      BODY[1] nichts Verwertbares -> source=null -> UID einfach weitergezaehlt, Mail im Portal weg.
//      Ausserdem nahm der Pull je Lauf nur die 5 NEUESTEN UIDs und sprang ueber aeltere hinweg
//      (bei mehr als 5 neuen Mails in 5 Minuten fehlten die aelteren fuer immer).
//      - Aelteste zuerst, bis zu LIMIT_INBOX je Lauf; Rueckstand wird ueber mehrere Laeufe abgebaut.
//      - Abrufkette: voll (kleine Mails) bzw. Teil (Kopf + erste 400 KB des Rumpfs; bei grossen Mails
//        direkt, begrenzte CPU/Zeit) -> Kopf -> Platzhalter-Eintrag. Nach einem Timeout wird die IMAP-
//        Verbindung neu aufgebaut. Erst wenn die Mail in mail_eingang steht, rueckt letzte_uid weiter.
//      - "leicht" (BODY[1]) abgeschafft: Teil 1 kann der grosse Teil sein -> CPU Time exceeded.
//      - Parser-/Insert-Fehler erzeugen einen Platzhalter mit Betreff/Absender aus dem Kopf.
// v28 (17.09.2026): EIGENE ORDNER AUS OUTLOOK KOMMEN INS PORTAL.
//      - Ordner vom Typ custom/archive werden abgerufen (pull_aktiv), rotierend ORDNER_JE_LAUF je Lauf und Postfach
//        (aelteste Pruefung zuerst, mail_ordner.geprueft_am). Ohne neue UIDs kein UID SEARCH (UIDNEXT genuegt),
//        ausser es sind noch aeltere Mails nachzuladen.
//      - Erstlauf je Ordner: die 6 neuesten; danach neue Mails aelteste zuerst (bis 4), und wenn nichts Neues
//        da ist, bis zu 2 aeltere je Lauf (mail_ordner.rueckstand_uid), bis der Ordner vollstaendig ist.
//        Je Lauf und Postfach 2 eigene Ordner (Rotation); grosse Mails (> 400 KB) aus eigenen Ordnern nur als Teil.
//      - Mails aus eigenen Ordnern landen mit ordner = "imap:<ordner_id>" (Archiv: "archiv"); der Posteingang
//        zeigt die Ordner unter dem Postfach (Stufe 41). Gelesen-Status aus dem IMAP-Flag \Seen.
//      - Verschobene Mails folgen: steht die Message-ID schon in mail_eingang, aber in einem anderen
//        IMAP-Ordner, wird der Eintrag umgehaengt (statt uebersprungen). Gesendete bleiben unangetastet.
//      - Ordnernamen (IMAP-UTF-7, z. B. "Expos&AOk-s") werden fuer anzeige_name dekodiert.
// v29 (25.09.2026): GELESEN-ABGLEICH SERVER -> PORTAL (Stufe 80, Auftrag 2).
//      - Befund: Mails, die in Outlook gelesen wurden, blieben im Portal "ungelesen" (INBOX: 2.378 ungelesen
//        bei 570 gelesen). Das \Seen-Flag wurde nur beim Erst-Import eigener Ordner ausgewertet.
//      - Je Posteingang/eigenem Ordner werden bei jedem Lauf die Flags der letzten ABGLEICH_UIDS UIDs geholt
//        (UID FETCH <von>:* (FLAGS), nur Flags, keine Rumpfe) und mail_eingang.gelesen = true gesetzt, wo der
//        Server \Seen meldet. Richtung "ungelesen" wird bewusst nicht uebernommen (Regel-Trigger aktion_gelesen,
//        Portal -> Server laeuft ueber mail-gelesen-setzen).
//      - Auch der Posteingang uebernimmt \Seen beim Import (bisher nur eigene Ordner).
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// Die Anbieter-Schicht der Postfaecher (Microsoft, Google, IMAP). Sie
// liegt als Beilage im Ordner dieser Funktion; die Quelle steht in
// supabase/eigene-beilagen/mail-postfach-pull/anbieter.ts.
import { xoauth2, zugriffstoken } from "./anbieter.ts";

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
import { simpleParser } from "npm:mailparser@3.6.6";
import { Buffer } from "node:buffer";

function bytesZuLatin1(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 8192)) as any);
  return s;
}
function latin1ZuBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const MAX_MAIL_BYTES = 2_500_000;
const LEICHT_AB_SENT = 400_000;
const TEIL_BYTES = 400_000;
const MAX_TEXT_ZEICHEN = 150_000;
const MAX_HTML_ZEICHEN = 600_000;

// v27: je Lauf bis zu 12 Mails im Posteingang (aelteste zuerst), Gesendet 8 (Erstlauf 15 neueste)
const LIMIT_INBOX = 12;
const LIMIT_SENT_ERSTLAUF = 15;
const LIMIT_SENT = 8;
// v28: eigene Ordner – bewusst klein je Lauf: der Cron-Lauf bearbeitet alle Postfaecher in EINER Ausfuehrung,
// 6 Ordner x 10 Mails je Postfach liefen in WORKER_RESOURCE_LIMIT (17.09.). Der Rueckstand wird ueber viele
// 5-Minuten-Laeufe abgebaut.
const ORDNER_JE_LAUF = 2;
const LIMIT_CUSTOM_ERSTLAUF = 6;
const LIMIT_CUSTOM = 4;
const LIMIT_CUSTOM_RUECK = 2;
// v29: Gelesen-Abgleich – Flags der letzten N UIDs je Ordner und Lauf
const ABGLEICH_UIDS = 200;

// IMAP-Modified-UTF-7 (RFC 3501) -> lesbarer Text: "Expos&AOk-s" -> "Exposés", "&-" -> "&"
function imapUtf7Decode(name: string): string {
  return String(name || "").replace(/&([^-]*)-/g, (_m, b64: string) => {
    if (b64 === "") return "&";
    try {
      const std = b64.replace(/,/g, "/") + "===".slice((b64.length + 3) % 4);
      const bin = atob(std);
      let out = "";
      for (let i = 0; i + 1 < bin.length; i += 2) out += String.fromCharCode((bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1));
      return out;
    } catch { return "&" + b64 + "-"; }
  });
}

function htmlKompakt(html: string): string {
  if (!html) return html;
  if (/<(pre|textarea)[\s>]/i.test(html)) return html.length > MAX_HTML_ZEICHEN ? html.substring(0, MAX_HTML_ZEICHEN) : html;
  const k = html
    .replace(/[ \t]*\r?\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/>\n</g, "><");
  return k.length > MAX_HTML_ZEICHEN ? k.substring(0, MAX_HTML_ZEICHEN) : k;
}

async function entschluessele(verschluesseltesBase64: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = verschluesseltesBase64.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungueltiges Format");
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const enc = new TextEncoder();
  const km = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  const k = await crypto.subtle.importKey("raw", km, { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, ct);
  return new TextDecoder().decode(pt);
}

function erkenneQuelle(absender: string, betreff: string): string {
  const a = (absender || "").toLowerCase();
  const b = (betreff || "").toLowerCase();
  if (a.includes("immobilienscout24") || a.includes("immoscout24") || b.includes("immoscout")) return "immoscout";
  if (a.includes("immowelt")) return "immowelt";
  if (a.includes("kleinanzeigen") || a.includes("ebay-kleinanzeigen")) return "kleinanzeigen";
  return "mail";
}

const SYSTEM_PROMPT = `Du extrahierst aus einer E-Mail strukturierte Daten fuer eine Mietanfrage.
Antworte AUSSCHLIESSLICH mit JSON dieser Struktur (keine Erklaerung):
{"vorname":null,"nachname":null,"anrede":null,"email":null,"telefon":null,"objekt_strasse":null,"objekt_plz":null,"objekt_ort":null,"objekt_kaltmiete":null,"einzug_ab":null,"haushaltsgroesse":null,"haustier":null,"beruf":null,"einkommen_netto":null,"nachricht":null}`;

async function parseWithClaude(absender: string, betreff: string, body: string): Promise<Record<string, any>> {
  if (!ANTHROPIC_API_KEY) return {};
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Absender: ${absender}\nBetreff: ${betreff}\n\n${body.substring(0, 6000)}` }],
      }),
    });
    if (!r.ok) return {};
    const d = await r.json();
    let t = d?.content?.[0]?.text || "";
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) t = m[1].trim();
    return JSON.parse(t);
  } catch { return {}; }
}

// Literale aus einer FETCH-Antwort: BODY[HEADER] {n}, BODY[1] {n}, BODY[TEXT]<0> {n}
function literale(b: string): Record<string, string> {
  const teile: Record<string, string> = {};
  const re = /BODY\[([^\]]*)\](?:<\d+>)? \{(\d+)\}\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(b)) !== null) {
    const s0 = m.index + m[0].length, n = parseInt(m[2], 10);
    teile[m[1].toUpperCase()] = b.substring(s0, s0 + n);
    re.lastIndex = s0 + n;
  }
  return teile;
}

// ============================================================================
// IMAP-Client minimal (direkter TCP-Dialog)
// ============================================================================

class SimpleImap {
  private conn: Deno.TlsConn | null = null;
  private encoder = new TextEncoder();
  private buffer = "";
  private tagCounter = 0;

  // Bei einem OAuth2-Postfach steht hier die fertige XOAUTH2-Zeichenkette
  // statt eines Passworts. Microsoft nimmt LOGIN nicht mehr an, Google
  // nur noch mit App-Passwort — der Abruf selbst bleibt derselbe.
  constructor(private host: string, private port: number, private user: string,
              private pass: string, private xoauth: string | null = null) {}

  private nextTag(): string {
    this.tagCounter++;
    return `A${String(this.tagCounter).padStart(4, "0")}`;
  }

  async connect(): Promise<void> {
    this.conn = await Deno.connectTls({ hostname: this.host, port: this.port });
    await this.readUntil(/^\* OK/m, 10000);
  }

  private async readUntil(endRegex: RegExp, timeoutMs: number): Promise<string> {
    const start = Date.now();
    const buf = new Uint8Array(64 * 1024);
    while (Date.now() - start < timeoutMs) {
      if (endRegex.test(this.buffer)) {
        const m = this.buffer.match(endRegex);
        if (m) {
          const idx = (m as any).index + m[0].length;
          const eolIdx = this.buffer.indexOf("\n", idx);
          const cut = eolIdx >= 0 ? eolIdx + 1 : this.buffer.length;
          const result = this.buffer.substring(0, cut);
          this.buffer = this.buffer.substring(cut);
          return result;
        }
      }
      const remaining = timeoutMs - (Date.now() - start);
      const readPromise = this.conn!.read(buf);
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining));
      const n = await Promise.race([readPromise, timeoutPromise]);
      if (n === null) throw new Error(`IMAP read timeout (${timeoutMs}ms), buffer: ${this.buffer.substring(0, 200)}`);
      if (n === 0) throw new Error("Connection closed");
      this.buffer += bytesZuLatin1(buf.subarray(0, n));
    }
    throw new Error(`IMAP read timeout, buffer: ${this.buffer.substring(0, 200)}`);
  }

  private async send(line: string): Promise<void> {
    await this.conn!.write(this.encoder.encode(line + "\r\n"));
  }

  private async cmd(command: string, timeoutMs = 15000): Promise<string> {
    const tag = this.nextTag();
    await this.send(`${tag} ${command}`);
    const endRe = new RegExp(`^${tag} (OK|NO|BAD)`, "m");
    const resp = await this.readUntil(endRe, timeoutMs);
    if (/^[A-Z]\d{4} (NO|BAD)/m.test(resp)) throw new Error(`IMAP-Fehler bei "${command}": ${resp.substring(0, 300)}`);
    return resp;
  }

  async login(): Promise<void> {
    if (this.xoauth) {
      // AUTHENTICATE XOAUTH2 laeuft anders als LOGIN: lehnt der Server ab,
      // schickt er "+" und eine base64-kodierte Begruendung und wartet
      // dann auf eine LEERE Zeile. Ohne sie bleibt die Verbindung haengen,
      // bis der Zeitgeber zuschlaegt — und die Begruendung waere verloren.
      const tag = this.nextTag();
      await this.send(`${tag} AUTHENTICATE XOAUTH2 ${this.xoauth}`);
      const fertig = new RegExp(`^${tag} (OK|NO|BAD)`, "m");
      let antwort = await this.readUntil(new RegExp(`(^${tag} (OK|NO|BAD))|(^\\+)`, "m"), 20000);
      if (!fertig.test(antwort)) {
        await this.send("");
        antwort += await this.readUntil(fertig, 20000);
      }
      if (new RegExp(`^${tag} (NO|BAD)`, "m").test(antwort)) {
        throw new Error(`XOAUTH2 abgelehnt: ${antwort.substring(0, 300)}`);
      }
      return;
    }
    const escUser = this.user.replace(/"/g, '\\"');
    const escPass = this.pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await this.cmd(`LOGIN "${escUser}" "${escPass}"`);
  }

  async selectFolder(folderName: string): Promise<{ exists: number; uidNext: number }> {
    const esc = folderName.replace(/"/g, '\\"');
    const resp = await this.cmd(`SELECT "${esc}"`);
    const exists = parseInt(resp.match(/\* (\d+) EXISTS/)?.[1] || "0", 10);
    const uidNext = parseInt(resp.match(/UIDNEXT (\d+)/)?.[1] || "0", 10);
    return { exists, uidNext };
  }

  async listFolders(): Promise<Array<{ name: string; flags: string[]; delimiter: string }>> {
    const resp = await this.cmd(`LIST "" "*"`, 15000);
    const result: Array<{ name: string; flags: string[]; delimiter: string }> = [];
    for (const line of resp.split("\n")) {
      const m = line.match(/^\* LIST \(([^)]*)\) "?([^"]*)"? "?([^"]*)"?$/i);
      if (!m) continue;
      const flags = (m[1] || "").split(/\s+/).filter(Boolean);
      const delimiter = m[2] || "/";
      const name = (m[3] || "").trim().replace(/^"|"$/g, "");
      if (!name) continue;
      result.push({ name, flags, delimiter });
    }
    return result;
  }

  async fetchAllUids(): Promise<number[]> {
    const resp = await this.cmd("UID SEARCH ALL", 30000);
    const line = resp.split("\n").find(l => l.startsWith("* SEARCH"));
    if (!line) return [];
    const parts = line.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean);
    return parts.map(s => parseInt(s, 10)).filter(n => !isNaN(n));
  }

  // v28: Groesse UND Flags (\Seen) je UID in einem Zug
  async fetchSizes(uids: number[], timeoutMs = 20000): Promise<Map<number, number>> {
    return (await this.fetchSizesFlags(uids, timeoutMs)).sizes;
  }
  async fetchSizesFlags(uids: number[], timeoutMs = 20000): Promise<{ sizes: Map<number, number>; seen: Set<number> }> {
    const sizes = new Map<number, number>(); const seen = new Set<number>();
    if (uids.length === 0) return { sizes, seen };
    const resp = await this.cmd(`UID FETCH ${uids.join(",")} (RFC822.SIZE FLAGS)`, timeoutMs);
    for (const line of resp.split(/\r?\n/)) {
      if (!/^\* \d+ FETCH \(/.test(line)) continue;
      const u = parseInt(line.match(/UID (\d+)/)?.[1] || "", 10);
      const s = parseInt(line.match(/RFC822\.SIZE (\d+)/)?.[1] || "", 10);
      if (isNaN(u)) continue;
      if (!isNaN(s)) sizes.set(u, s);
      if (/FLAGS \([^)]*\\Seen/i.test(line)) seen.add(u);
    }
    return { sizes, seen };
  }

  // v29: nur die Flags eines UID-Bereichs (von:*) – fuer den Gelesen-Abgleich, keine Rumpfe
  async fetchFlagsBereich(vonUid: number, timeoutMs = 20000): Promise<{ alle: Set<number>; seen: Set<number> }> {
    const alle = new Set<number>(); const seen = new Set<number>();
    const resp = await this.cmd(`UID FETCH ${Math.max(1, vonUid)}:* (FLAGS)`, timeoutMs);
    for (const line of resp.split(/\r?\n/)) {
      if (!/^\* \d+ FETCH \(/.test(line)) continue;
      const u = parseInt(line.match(/UID (\d+)/)?.[1] || "", 10);
      if (isNaN(u)) continue;
      alle.add(u);
      if (/FLAGS \([^)]*\\Seen/i.test(line)) seen.add(u);
    }
    return { alle, seen };
  }

  // Liest bis zur Tag-Antwort; liefert den Block davor oder null bei NO/BAD.
  private async block(tag: string, timeoutMs: number): Promise<string | null> {
    // v27: auch eine Antwort ohne Daten davor (z. B. UID existiert nicht mehr) wird erkannt statt in den Timeout zu laufen
    const endRe = new RegExp(`(^|\\r?\\n)${tag} (OK|NO|BAD)[^\\r\\n]*`, "m");
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const em = this.buffer.match(endRe);
      if (em) {
        const eIdx = (em as any).index;
        const b = this.buffer.substring(0, eIdx);
        const after = eIdx + em[0].length;
        const eol = this.buffer.indexOf("\n", after);
        this.buffer = this.buffer.substring(eol >= 0 ? eol + 1 : after);
        return em[2] === "OK" ? b : null;
      }
      const buf = new Uint8Array(64 * 1024);
      const remaining = timeoutMs - (Date.now() - start);
      const readPromise = this.conn!.read(buf);
      const tp = new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining));
      const n = await Promise.race([readPromise, tp]);
      if (n === null) throw new Error(`FETCH timeout (${timeoutMs}ms)`);
      if (n === 0) throw new Error("Connection closed mid-fetch");
      this.buffer += bytesZuLatin1(buf.subarray(0, n));
    }
    throw new Error("FETCH loop timeout");
  }

  async fetchMailSource(uid: number, timeoutMs = 25000): Promise<string | null> {
    const tag = this.nextTag();
    await this.send(`${tag} UID FETCH ${uid} (BODY.PEEK[])`);
    const b = await this.block(tag, timeoutMs);
    if (!b) return null;
    const lm = b.match(/\{(\d+)\}\r?\n/);
    if (lm) {
      const bodyStart = (lm as any).index + lm[0].length;
      return b.substring(bodyStart, bodyStart + parseInt(lm[1], 10));
    }
    const bodyMarker = b.indexOf("BODY[] ");
    if (bodyMarker < 0) return null;
    let bodyContent = b.substring(bodyMarker + 7).replace(/^\s+/, "");
    if (bodyContent.startsWith("NIL")) return null;
    if (bodyContent.startsWith('"')) {
      let end = 1;
      while (end < bodyContent.length) {
        if (bodyContent[end] === '\\') { end += 2; continue; }
        if (bodyContent[end] === '"') break;
        end++;
      }
      return bodyContent.substring(1, end).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    const lastParen = bodyContent.lastIndexOf(")");
    return lastParen > 0 ? bodyContent.substring(0, lastParen).trim() : bodyContent.trim();
  }

  // v27: Kopf + erste TEIL_BYTES des Rumpfs – funktioniert bei jeder Struktur (auch nicht-multipart).
  async fetchMailTeil(uid: number, timeoutMs = 25000): Promise<{ source: string | null; kopf: string | null }> {
    const tag = this.nextTag();
    await this.send(`${tag} UID FETCH ${uid} (BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.${TEIL_BYTES}>)`);
    const b = await this.block(tag, timeoutMs);
    if (!b) return { source: null, kopf: null };
    const teile = literale(b);
    const kopf = teile["HEADER"] || null;
    if (!kopf) return { source: null, kopf: null };
    return { source: kopf.replace(/(\r?\n)+$/, "") + "\r\n\r\n" + (teile["TEXT"] || ""), kopf };
  }

  async fetchKopf(uid: number, timeoutMs = 15000): Promise<string | null> {
    const tag = this.nextTag();
    await this.send(`${tag} UID FETCH ${uid} (BODY.PEEK[HEADER])`);
    const b = await this.block(tag, timeoutMs);
    if (!b) return null;
    return literale(b)["HEADER"] || null;
  }

  async logout(): Promise<void> {
    try { await this.cmd("LOGOUT", 5000); } catch {}
    try { this.conn?.close(); } catch {}
    this.conn = null;
  }
}

function erkenneOrdnerTyp(name: string, flags: string[]): { typ: string; anzeige: string } {
  const lname = name.toLowerCase();
  const flagsLower = flags.map(f => f.toLowerCase()).join(" ");
  const teile = name.split(/[/.]/);
  const letzter = (teile[teile.length - 1] || "").toLowerCase().trim();
  if (lname === "inbox" || flagsLower.includes("\\inbox")) return { typ: "inbox", anzeige: "Posteingang" };
  if (flagsLower.includes("\\sent") || /^(sent|sent items|sent messages|gesendet|gesendete elemente|gesendete objekte)$/.test(letzter)) return { typ: "sent", anzeige: "Gesendet" };
  if (flagsLower.includes("\\drafts") || /^(drafts?|entw[ue]rfe)$/.test(letzter)) return { typ: "drafts", anzeige: "Entwürfe" };
  if (flagsLower.includes("\\trash") || /^(trash|papierkorb|deleted items|gel[oö]schte elemente)$/.test(letzter)) return { typ: "trash", anzeige: "Papierkorb" };
  if (flagsLower.includes("\\junk") || /^(junk|junk e-mail|junk-e-mail|spam)$/.test(letzter)) return { typ: "junk", anzeige: "Spam" };
  if (flagsLower.includes("\\archive") || /^(archive|archiv)$/.test(letzter)) return { typ: "archive", anzeige: "Archiv" };
  return { typ: "custom", anzeige: teile[teile.length - 1] };
}

// ===== Objektzuordnung eingehender Mails (unveraendert aus v25) =====
function mailObjektNorm(s: unknown): string {
  return String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/str\.(?=\s|$)/g, "strasse").replace(/strasse\b/g, "strasse").replace(/\bstr\b/g, "strasse")
    .replace(/[-–—/]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function mailObjektErkennen(text: unknown, objekte: any[]): { id: string; immo_nr: string; konfidenz: number; grund: string } | null {
  const roh = String(text || "");
  if (!roh.trim() || !objekte || !objekte.length) return null;
  const nachNr = new Map<string, any>(); for (const o of objekte) if (o.immo_nr) nachNr.set(String(o.immo_nr).toLowerCase(), o);
  const aktivBonus = (o: any) => (o.status === "vermarktung" || o.status === "reserviert" ? 2 : o.status === "archiv" || o.status === "verkauft" || o.status === "vermietet" ? -10 : 0);
  const nummern: string[] = [];
  const re1 = /(?:immobilie|immobilien|objekt|obj\.?|immo|immonr|immo-nr|objektnummer)\W{0,4}(?:nummer|nr\.?|no\.?|id)?\W{0,3}#?(\d{2,5}(?:_\d{1,2})?)/gi;
  const re2 = /(?:^|[\s(,;])(?:nr\.?|nummer|#)\W{0,2}(\d{2,5}(?:_\d{1,2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(roh)) !== null) nummern.push(m[1]);
  while ((m = re2.exec(roh)) !== null) nummern.push(m[1]);
  for (const n of nummern) {
    const o = nachNr.get(String(n).toLowerCase());
    if (o) return { id: o.id, immo_nr: o.immo_nr, konfidenz: Math.min(99, 95 + aktivBonus(o)), grund: "Objekt-Nr. " + o.immo_nr + " im Text" };
  }
  const t = " " + mailObjektNorm(roh) + " ";
  const kandidaten: any[] = [];
  for (const o of objekte) {
    const str = mailObjektNorm(o.strasse);
    if (!str || str.length < 4 || /^(strasse|weg|platz|ring|allee)$/.test(str)) continue;
    const pos = t.indexOf(" " + str + " ");
    if (pos < 0) continue;
    let k = 60, grund = o.strasse;
    const hnr = String(o.hausnummer || "").toLowerCase().replace(/\s+/g, "");
    if (hnr) {
      const nach = t.slice(pos + str.length + 1, pos + str.length + 24);
      const hm = nach.match(/^\s*(\d+\s?[a-z]?)\b/);
      if (hm && hm[1].replace(/\s+/g, "") === hnr) { k = 88; grund += " " + o.hausnummer; }
      else if (hm && hm[1].replace(/\s+/g, "") !== hnr) { k = 25; }
    }
    const ort = mailObjektNorm(o.ort);
    if (ort && t.includes(" " + ort + " ")) { k += 4; grund += ", " + o.ort; }
    const plz = String(o.plz || "").trim();
    if (plz && roh.includes(plz)) { k += 4; }
    kandidaten.push({ o, k: k + aktivBonus(o), grund });
  }
  if (!kandidaten.length) return null;
  kandidaten.sort((a: any, b: any) => b.k - a.k);
  const best = kandidaten[0];
  if (best.k < 50) return null;
  const gleichwertig = kandidaten.filter((c: any) => c.k >= best.k - 3);
  if (gleichwertig.length > 1 && best.k < 85) return { id: best.o.id, immo_nr: best.o.immo_nr, konfidenz: Math.min(best.k, 50), grund: best.grund + " (mehrere Objekte in dieser Straße)" };
  return { id: best.o.id, immo_nr: best.o.immo_nr, konfidenz: Math.min(93, best.k), grund: best.grund };
}

function adressen(obj: any): { liste: string; erster: string; ersterName: string } {
  const werte = (obj?.value || []) as Array<{ address?: string; name?: string }>;
  const liste = werte.map(w => (w.name ? `${w.name} <${w.address || ""}>` : (w.address || ""))).filter(Boolean).join(", ");
  return { liste, erster: werte[0]?.address || "", ersterName: werte[0]?.name || "" };
}

// ============================================================================
// Edge-Function-Entry
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let postfachId: string | null = null;
    try { postfachId = (await req.json())?.postfach_id || null; } catch {}

    // Ohne postfach_id ist das der Cron ueber alle Postfaecher — der darf
    // das. MIT einer Kennung aus dem Anfragekoerper ist es ein Abruf, und
    // der gehoert nur dem eigenen Mandanten.
    await immoMandantSichern(req, [["mail_postfaecher", String(postfachId || "")]]);
    let query = admin.from("mail_postfaecher").select("*").eq("imap_aktiv", true).eq("aktiv", true);
    if (postfachId) query = query.eq("id", postfachId);
    const { data: postfaecher, error: pfErr } = await query;
    if (pfErr) throw pfErr;
    if (!postfaecher || postfaecher.length === 0) {
      return new Response(JSON.stringify({ ok: true, info: "Keine aktiven IMAP-Postfaecher" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ergebnisse: any[] = [];

    let objektIndex: any[] = [];
    try {
      // Der Index, gegen den eingehende Mails einem Objekt zugeordnet werden.
      // Ohne Mandantenfilter standen darin die Objekte aller Makler; die
      // Zuordnung unten prueft ihn deshalb zusaetzlich je Postfach.
      const mandantenDerPostfaecher = [...new Set((postfaecher || [])
        .map((p: any) => p.mandant_id).filter(Boolean))];
      const { data: oi } = mandantenDerPostfaecher.length
        ? await admin.from("immobilien").select("id, mandant_id, immo_nr, strasse, hausnummer, plz, ort, status")
            .in("mandant_id", mandantenDerPostfaecher).range(0, 1999)
        : { data: [] as any[] };
      objektIndex = oi || [];
    } catch (e) { console.warn("Objektindex:", e); }

    for (const pf of postfaecher) {
      const log: any = { postfach: pf.email_adresse, geprueft: 0, neu: 0, neu_gesendet: 0, fehler: 0, platzhalter: 0, teil: 0, ordner_synct: 0 };
      let imap: SimpleImap | null = null;

      try {
        // Drei Anbieter, ein Abruf. "imap" meldet sich mit Passwort an,
        // "microsoft" und "google" mit einem Token, das hier bei Bedarf
        // erneuert wird. Scheitert das, bleibt der Grund am Postfach
        // stehen (oauth_fehler) — die Oberflaeche bietet dann "Verbindung
        // erneuern" an, statt den Nutzer raten zu lassen.
        const perOauth = pf.anbieter && pf.anbieter !== "imap";
        if (!pf.imap_server || (!perOauth && !pf.imap_passwort_verschluesselt)) {
          log.fehler_text = "imap_server oder Passwort fehlt";
          ergebnisse.push(log);
          continue;
        }

        let passwort = "";
        let xoauthZeile: string | null = null;
        if (perOauth) {
          try {
            const t = await zugriffstoken(pf);
            if (t.neu) await admin.from("mail_postfaecher").update(t.neu).eq("id", pf.id);
            xoauthZeile = xoauth2(t.adresse, t.token);
          } catch (e) {
            const grund = e instanceof Error ? e.message : String(e);
            await admin.from("mail_postfaecher")
              .update({ oauth_fehler: grund.slice(0, 500) }).eq("id", pf.id);
            log.fehler_text = grund;
            ergebnisse.push(log);
            continue;
          }
        } else {
          passwort = await entschluessele(pf.imap_passwort_verschluesselt);
        }
        console.log(`Verbinde zu ${pf.imap_server}:${pf.imap_port}...`);
        let aktuellerOrdner: string | null = null;
        const verbinden = async () => {
          imap = new SimpleImap(pf.imap_server, Number(pf.imap_port || 993),
                                pf.imap_user || pf.email_adresse, passwort, xoauthZeile);
          await imap.connect();
          await imap.login();
          if (aktuellerOrdner) await imap.selectFolder(aktuellerOrdner);
        };
        await verbinden();

        // ---- Ordner-Sync ----
        const imapFolders = await imap!.listFolders();
        console.log(`${imapFolders.length} Ordner vom Server`);

        const { data: dbFolders } = await admin.from("mail_ordner").select("*").eq("postfach_id", pf.id);
        const dbFoldersByName = new Map<string, any>();
        (dbFolders || []).forEach((f: any) => dbFoldersByName.set(f.name, f));

        for (const imapF of imapFolders) {
          if (imapF.flags.some(f => f.toLowerCase().includes("\\noselect"))) continue;
          const { typ, anzeige } = erkenneOrdnerTyp(imapF.name, imapF.flags);
          const existing = dbFoldersByName.get(imapF.name);
          if (!existing) {
            const { data: neuerOrdner } = await admin.from("mail_ordner").insert({
              postfach_id: pf.id, name: imapF.name, anzeige_name: imapUtf7Decode(anzeige), typ,
              pull_aktiv: typ === "inbox" || typ === "sent" || typ === "custom" || typ === "archive",
            }).select().single();
            if (neuerOrdner) dbFoldersByName.set(imapF.name, neuerOrdner);
            log.ordner_synct++;
          }
        }

        const rang = (o: any) => (o.typ === "inbox" ? 0 : o.typ === "sent" ? 1 : 2);
        const aktive = Array.from(dbFoldersByName.values()).filter((o: any) => o.pull_aktiv === true);
        // v28: Posteingang und Gesendet immer; eigene Ordner rotierend (aelteste Pruefung zuerst)
        const basisOrdner = aktive.filter((o: any) => o.typ === "inbox" || o.typ === "sent").sort((a: any, b: any) => rang(a) - rang(b));
        const eigeneOrdner = aktive.filter((o: any) => o.typ !== "inbox" && o.typ !== "sent")
          .sort((a: any, b: any) => String(a.geprueft_am || "").localeCompare(String(b.geprueft_am || "")))
          .slice(0, ORDNER_JE_LAUF);
        const ordnerZumPullen = [...basisOrdner, ...eigeneOrdner];
        log.eigene_ordner_geprueft = eigeneOrdner.length;

        if (ordnerZumPullen.length === 0) {
          await admin.from("mail_postfaecher").update({ imap_letzter_pull: new Date().toISOString() }).eq("id", pf.id);
          await imap?.logout();
          imap = null;
          ergebnisse.push(log);
          continue;
        }

        for (const ordner of ordnerZumPullen) {
          const istSent = ordner.typ === "sent";
          const istEigen = ordner.typ !== "inbox" && ordner.typ !== "sent";
          console.log(`> Ordner: ${ordner.name} (${ordner.anzeige_name})`);
          let box;
          try {
            box = await imap!.selectFolder(ordner.name);
            aktuellerOrdner = ordner.name;
          } catch (e) {
            console.error(`  SELECT-Fehler: ${e instanceof Error ? e.message : String(e)}`);
            if (istEigen) await admin.from("mail_ordner").update({ geprueft_am: new Date().toISOString() }).eq("id", ordner.id);
            continue;
          }
          if (istEigen) await admin.from("mail_ordner").update({ geprueft_am: new Date().toISOString() }).eq("id", ordner.id);

          // v29: Gelesen-Abgleich Server -> Portal (nur Flags der letzten ABGLEICH_UIDS UIDs, nur Richtung "gelesen")
          if (!istSent && box.uidNext > 1) {
            try {
              const fl = await imap!.fetchFlagsBereich(box.uidNext - ABGLEICH_UIDS);
              if (fl.seen.size) {
                const { data: angeglichen, error: agErr } = await admin.from("mail_eingang").update({ gelesen: true })
                  .eq("postfach_id", pf.id).eq("imap_folder", ordner.name).eq("gelesen", false)
                  .in("imap_uid", Array.from(fl.seen)).select("id");
                if (agErr) console.warn(`  Gelesen-Abgleich DB:`, agErr.message);
                else if (angeglichen && angeglichen.length) { log.gelesen_abgleich = (log.gelesen_abgleich || 0) + angeglichen.length; console.log(`  Gelesen-Abgleich: ${angeglichen.length} Mail(s) jetzt gelesen`); }
              }
            } catch (e) { console.warn(`  Gelesen-Abgleich:`, e instanceof Error ? e.message : String(e)); }
          }

          const letzteUidOrdner = Number(ordner.letzte_uid || 0);
          const letzteUidFallback = ordner.typ === "inbox" ? Number(pf.imap_letzte_uid || 0) : 0;
          const letzteUid = letzteUidOrdner > 0 ? letzteUidOrdner : letzteUidFallback;
          const rueckstandUid = Number(ordner.rueckstand_uid || 0);
          // v28: eigener Ordner ohne neue UIDs und ohne offenen Rueckstand -> kein UID SEARCH noetig
          if (istEigen && letzteUid > 0 && box.uidNext > 0 && box.uidNext - 1 <= letzteUid && (rueckstandUid <= 1)) {
            await admin.from("mail_ordner").update({ gesamt_anzahl: box.exists }).eq("id", ordner.id);
            continue;
          }
          const alleUids = await imap!.fetchAllUids();
          const neueUids = alleUids.filter(u => u > letzteUid);
          // v27: Posteingang und laufender Gesendet-Abruf AELTESTE zuerst (Rueckstand wird abgebaut,
          // nichts wird uebersprungen); nur der Erstlauf des Gesendet-Ordners nimmt die 15 neuesten.
          // v28: eigene Ordner: Erstlauf die 10 neuesten, dann neue aelteste zuerst, sonst aeltere nachladen.
          let zuHolendeUids: number[];
          let rueckModus = false;
          if (istSent && letzteUid === 0) zuHolendeUids = neueUids.sort((a, b) => b - a).slice(0, LIMIT_SENT_ERSTLAUF).sort((a, b) => a - b);
          else if (istEigen && letzteUid === 0) zuHolendeUids = neueUids.sort((a, b) => b - a).slice(0, LIMIT_CUSTOM_ERSTLAUF).sort((a, b) => a - b);
          else if (istEigen) {
            zuHolendeUids = neueUids.sort((a, b) => a - b).slice(0, LIMIT_CUSTOM);
            if (zuHolendeUids.length === 0 && rueckstandUid > 1) {
              const aeltere = alleUids.filter(u => u < rueckstandUid).sort((a, b) => b - a).slice(0, LIMIT_CUSTOM_RUECK).sort((a, b) => a - b);
              if (aeltere.length) { zuHolendeUids = aeltere; rueckModus = true; }
              else await admin.from("mail_ordner").update({ rueckstand_uid: 1 }).eq("id", ordner.id);
            }
          }
          else zuHolendeUids = neueUids.sort((a, b) => a - b).slice(0, istSent ? LIMIT_SENT : LIMIT_INBOX);
          if (neueUids.length > zuHolendeUids.length && !rueckModus) console.log(`  Rueckstand: ${neueUids.length - zuHolendeUids.length} weitere Mails im naechsten Lauf`);

          if (zuHolendeUids.length === 0) {
            await admin.from("mail_ordner").update({ gesamt_anzahl: box.exists }).eq("id", ordner.id);
            continue;
          }

          console.log(`  Verarbeite ${zuHolendeUids.length} Mails${rueckModus ? " (aeltere nachladen)" : ""}`);

          let groessen = new Map<number, number>();
          let gelesenAufServer = new Set<number>();
          try {
            const sf = await imap!.fetchSizesFlags(zuHolendeUids);
            groessen = sf.sizes; gelesenAufServer = sf.seen;
          } catch (e) {
            console.error(`  SIZE-Fehler (lade trotzdem):`, e instanceof Error ? e.message : String(e));
          }

          let maxUid = letzteUid;
          let minUid = rueckstandUid > 0 ? rueckstandUid : Number.MAX_SAFE_INTEGER;
          const ordnerId = ordner.id;
          const folderName = ordner.name;

          for (let i = 0; i < zuHolendeUids.length; i++) {
            const uid = zuHolendeUids[i];
            log.geprueft++;

            const groesse = groessen.get(uid) || 0;
            const gross = groesse > (istSent || istEigen ? LEICHT_AB_SENT : MAX_MAIL_BYTES);
            if (gross) console.log(`    UID ${uid} gross (${(groesse / 1024).toFixed(0)} KB) — Kopf + erste ${TEIL_BYTES / 1000} KB`);

            // ---- v27: Abrufkette, bis etwas Verwertbares da ist; nach Fehlern neu verbinden ----
            let source: string | null = null;
            let kopfRoh: string | null = null;
            let art = gross ? "teil" : "voll";
            const stufe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
              try { return await fn(); }
              catch (e) { console.error(`    ${art}-Fehler UID ${uid}:`, e instanceof Error ? e.message : String(e)); try { await imap!.logout(); } catch { /* egal */ } await verbinden(); return null; }
            };
            if (art === "voll") {
              source = await stufe(() => imap!.fetchMailSource(uid, 20000));
              if (source && source.length > MAX_MAIL_BYTES) source = null;
              if (!source) art = "teil";
            }
            if (!source) { const t = await stufe(() => imap!.fetchMailTeil(uid, 15000)); if (t) { source = t.source; kopfRoh = t.kopf; } }
            if (!source && !kopfRoh) { kopfRoh = await stufe(() => imap!.fetchKopf(uid, 10000)); art = "platzhalter"; }

            let parsed: any = null;
            if (source || kopfRoh) {
              try { parsed = await simpleParser(Buffer.from(latin1ZuBytes(source || (kopfRoh! + "\r\n\r\n")))); }
              catch (e) { console.error(`    parser-fehler UID ${uid}:`, e); parsed = null; }
            }
            if (!parsed && kopfRoh) {
              try { parsed = await simpleParser(Buffer.from(latin1ZuBytes(kopfRoh + "\r\n\r\n"))); art = "platzhalter"; } catch { parsed = null; }
            }
            if (!parsed) {
              // Letzte Stufe: Platzhalter ohne Kopf – die Mail bleibt sichtbar und kann in Outlook gesucht werden.
              art = "platzhalter";
              parsed = { messageId: null, from: null, to: null, subject: `(Mail konnte nicht geladen werden – Nr. ${uid})`, text: "", html: "", date: null, cc: null, bcc: null, attachments: [] };
              console.error(`    UID ${uid}: weder Rumpf noch Kopf ladbar – Platzhalter`);
            }

            const messageId = parsed.messageId || `imap-${pf.email_adresse}-${folderName}-${uid}`;
            const zielOrdner = istSent ? "gesendet" : ordner.typ === "archive" ? "archiv" : istEigen ? "imap:" + ordnerId : "posteingang";
            const { data: vorhanden } = await admin
              .from("mail_eingang").select("id, imap_folder, ordner")
              .eq("postfach_id", pf.id).eq("message_id", messageId)
              .maybeSingle();
            if (vorhanden) {
              // v28: gleiche Mail, anderer Server-Ordner -> in Outlook verschoben: Eintrag umhaengen
              if (!istSent && vorhanden.imap_folder !== folderName && vorhanden.ordner !== "gesendet") {
                await admin.from("mail_eingang").update({ ordner: zielOrdner, ordner_id: ordnerId, imap_folder: folderName, imap_uid: uid }).eq("id", vorhanden.id);
                log.verschoben = (log.verschoben || 0) + 1;
              }
              if (uid > maxUid) maxUid = uid;
              if (uid < minUid) minUid = uid;
              await admin.from("mail_ordner").update({ letzte_uid: maxUid }).eq("id", ordnerId);
              continue;
            }

            const von = adressen(parsed.from);
            const an = adressen(parsed.to);
            const betreff = parsed.subject || "(ohne Betreff)";
            const text = parsed.text || "";
            const html = parsed.html || "";
            const hinweisText = art === "platzhalter"
              ? "Der Inhalt dieser Mail konnte nicht vom Mailserver geladen werden. Bitte in Outlook/Webmail öffnen. Betreff und Absender stammen aus dem Kopf der Mail."
              : "";
            const textSpeicher = (text || hinweisText).substring(0, MAX_TEXT_ZEICHEN);
            const htmlSpeicher = html ? htmlKompakt(html) : null;
            const datum = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();
            const cc = (parsed.cc?.value || []).map((c: any) => c.address).filter(Boolean).join(", ");
            const bcc = (parsed.bcc?.value || []).map((c: any) => c.address).filter(Boolean).join(", ");
            const quelle = istSent ? "mail" : erkenneQuelle(von.erster, betreff);
            const istPortal = ordner.typ === "inbox" && (quelle === "immoscout" || quelle === "immowelt" || quelle === "kleinanzeigen");
            const anhaengeListe = art === "teil"
              ? [{ filename: "Anhänge auf dem Server (Mail " + (groesse / 1024 / 1024).toFixed(1) + " MB), über Anhänge laden holen", contentType: "application/octet-stream", size: groesse, nicht_geladen: true }]
              : art === "platzhalter"
                ? [{ filename: "Inhalt nicht geladen – bitte in Outlook prüfen", contentType: "application/octet-stream", size: groesse, nicht_geladen: true }]
                : (parsed.attachments || []).map((a: any) => ({ filename: a.filename || "Datei", contentType: a.contentType, size: a.size }));

            const { data: eingangNeu, error: eingangErr } = await admin.from("mail_eingang").insert({
              postfach_id: pf.id, ordner_id: ordnerId, ordner: zielOrdner,
              message_id: messageId, imap_uid: uid, imap_folder: folderName,
              absender_email: von.erster || (istSent ? pf.email_adresse : ""), absender_name: von.ersterName,
              empfaenger_email: istSent ? (an.liste || an.erster || "") : pf.email_adresse,
              betreff, text: textSpeicher, html: htmlSpeicher,
              cc: cc || null, bcc: bcc || null, anhaenge: anhaengeListe, gesendet_am: datum,
              quelle, gelesen: istSent || gelesenAufServer.has(uid), archiviert: false,
            }).select().single();

            if (eingangErr) {
              console.error(`    insert-fehler UID ${uid}:`, eingangErr);
              log.fehler++;
              // letzte_uid NICHT weiterruecken – naechster Lauf versucht es erneut
              continue;
            }

            if (uid > maxUid) maxUid = uid;
            if (uid < minUid) minUid = uid;
            if (art === "platzhalter") log.platzhalter++;
            if (art === "teil") log.teil++;

            if (!istSent && objektIndex.length) {
              try {
                const erkannt = mailObjektErkennen(`${betreff}\n${text.slice(0, 4000)}`, objektIndex);
                if (erkannt) {
                  const patch: any = { immobilie_id_ki_vorschlag: erkannt.id, immobilie_id_ki_konfidenz: erkannt.konfidenz };
                  if (erkannt.konfidenz >= 90) patch.immobilie_id = erkannt.id;
                  await admin.from("mail_eingang").update(patch).eq("id", eingangNeu.id);
                  log.objekt_erkannt = (log.objekt_erkannt || 0) + 1;
                }
              } catch (e) { console.warn("Objektzuordnung:", e instanceof Error ? e.message : String(e)); }
            }

            if (istPortal) {
              let extrahiert: Record<string, any> = {};
              try { extrahiert = await parseWithClaude(von.erster, betreff, text); }
              catch (e) { console.error(`    Claude-Fehler:`, e); }
              const { data: anfrageNeu } = await admin.from("mietanfragen").insert({
                quelle, status: "neu", eingegangen_am: datum,
                email_message_id: messageId, email_eingang_postfach: pf.email_adresse,
                email_eingang_absender: von.erster, email_eingang_betreff: betreff,
                email_eingang_text: textSpeicher, email_eingang_html: htmlSpeicher,
                email_eingang_datum: datum, email_imap_uid: uid,
                anrede: extrahiert.anrede || null,
                vorname: extrahiert.vorname || null,
                nachname: extrahiert.nachname || (von.ersterName && !extrahiert.vorname ? von.ersterName : null),
                email: extrahiert.email || von.erster || null,
                telefon: extrahiert.telefon || null,
                beruf: extrahiert.beruf || null,
                einkommen_netto: extrahiert.einkommen_netto || null,
                haushaltsgroesse: extrahiert.haushaltsgroesse || null,
                haustier: extrahiert.haustier || null,
                einzug_ab: extrahiert.einzug_ab || null,
                objekt_strasse: extrahiert.objekt_strasse || null,
                objekt_plz: extrahiert.objekt_plz || null,
                objekt_ort: extrahiert.objekt_ort || null,
                objekt_kaltmiete: extrahiert.objekt_kaltmiete || null,
                mitteilung_text: extrahiert.nachricht || null,
              }).select().single();
              if (anfrageNeu) {
                await admin.from("mail_eingang").update({ mietanfrage_id: anfrageNeu.id }).eq("id", eingangNeu.id);
              }
            }

            if (istSent) log.neu_gesendet++; else if (istEigen) log.neu_eigene = (log.neu_eigene || 0) + 1; else log.neu++;
            await admin.from("mail_ordner").update({ letzte_uid: maxUid }).eq("id", ordnerId);
          }

          const ordnerPatch: any = { letzte_uid: maxUid, gesamt_anzahl: box.exists };
          if (istEigen && minUid !== Number.MAX_SAFE_INTEGER) ordnerPatch.rueckstand_uid = minUid;
          await admin.from("mail_ordner").update(ordnerPatch).eq("id", ordnerId);

          if (ordner.typ === "inbox" && maxUid > 0) {
            await admin.from("mail_postfaecher").update({ imap_letzte_uid: maxUid }).eq("id", pf.id);
          }
        }

        await imap?.logout();
        imap = null;

        await admin.from("mail_postfaecher").update({ imap_letzter_pull: new Date().toISOString() }).eq("id", pf.id);
        ergebnisse.push(log);

      } catch (e) {
        console.error(`Postfach-Fehler:`, e);
        log.fehler++;
        log.fehler_text = e instanceof Error ? e.message : String(e);
        ergebnisse.push(log);
        try { await imap?.logout(); } catch {}
      }
    }

    return new Response(JSON.stringify({ ok: true, ergebnisse }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unerwartet:", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
