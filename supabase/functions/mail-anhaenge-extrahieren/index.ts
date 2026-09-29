// ============================================================================
// mail-anhaenge-extrahieren (v10 — Kalenderteile ohne Dateinamen werden mitgenommen)
// ============================================================================
// Neu gegenueber v9 (Deploy 26, 18.09.2026):
// - Termineinladungen (Outlook, Google, Apple) liegen als MIME-Teil text/calendar
//   ohne Content-Disposition und ohne Dateinamen in der Mail. findeAnhaenge
//   uebersprang solche Teile, deshalb konnte das Portal die Einladung nicht lesen.
//   Jetzt: text/calendar wird immer als Anhang uebernommen, Name einladung.ics.
//   Quelle im Repo: portal/mail-postfach/mail-anhaenge-extrahieren-v10.ts
// v9:
// - Supabase Storage nimmt nur ASCII-Objektnamen an ("Invalid key" bei ä/ö/ü).
//   Bisher wurde ein Anhang mit Umlaut im Namen still verworfen (nur console.error).
//   Jetzt: Speichername wird transliteriert (Jörn -> Joern), der Originalname bleibt
//   in original_name erhalten. Schlaegt ein Upload trotzdem fehl, folgt ein zweiter
//   Versuch unter anhang_<n>.<ext>; bleibt auch der erfolglos, steht es in
//   anhaenge_fehler statt einfach zu fehlen.
// - Gleiche Speichernamen innerhalb einer Mail werden vor dem Upload durchnummeriert
//   (vorher ueberschrieb upsert die erste Datei).
// - KI-Ergebnisse werden ueber den Quellindex zugeordnet, nicht ueber die Position in
//   der gefilterten Liste (vorher rutschte das Etikett auf den falschen Anhang).
// - Interner Aufruf mit Kopfzeile x-diagnose-secret (Vault: diagnose_secret) fuer
//   Reparaturen ohne Nutzer-Token; Speicherpfad dann unter dem Postfach-Inhaber.
// v8: Die KI benennt nur um, wenn sie das Objekt sicher erkennt (Konfidenz >= 75).
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diagnose-secret",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const KI_MAX_INHALT = 1_500_000;
const MAX_ANHAENGE = 15;
const MAX_KI_AUFRUFE = 10;
const KI_GLEICHZEITIG = 4;
const KI_MIN_KONFIDENZ = 75;

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

function bytesZuText(bytes: Uint8Array): string {
  let out = "";
  const schritt = 32768;
  for (let i = 0; i < bytes.length; i += schritt) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + schritt, bytes.length))) as any);
  }
  return out;
}

/** Anzeigename: wie bisher (Sonderzeichen und Leerzeichen zu "_"), Umlaute bleiben */
function safeFilename(name: string): string {
  return (name || "anhang").normalize("NFC").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 150);
}

/** Speichername fuer Storage: nur ASCII. Umlaute werden umschrieben, Rest wird "_". */
function speicherName(name: string): string {
  let n = safeFilename(name)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._()&+,;=@-]/g, "_")
    .replace(/_{2,}/g, "_");
  if (!n.replace(/[._-]/g, "")) n = "anhang";
  return n.slice(0, 150);
}

function istPdf(mime: string): boolean { return (mime || "").toLowerCase() === "application/pdf"; }
function istBild(mime: string): boolean {
  const m = (mime || "").toLowerCase();
  return m === "image/jpeg" || m === "image/jpg" || m === "image/png" || m === "image/webp" || m === "image/gif";
}
function dateiExtension(filename: string, mime: string): string {
  const fn = (filename || "").toLowerCase();
  const m = fn.match(/\.([a-z0-9]{1,5})$/);
  if (m) return m[1];
  const mt = (mime || "").toLowerCase();
  if (mt === "application/pdf") return "pdf";
  if (mt === "image/jpeg" || mt === "image/jpg") return "jpg";
  if (mt === "image/png") return "png";
  if (mt.includes("wordprocessingml")) return "docx";
  if (mt === "application/msword") return "doc";
  if (mt.includes("spreadsheetml")) return "xlsx";
  if (mt === "application/vnd.ms-excel") return "xls";
  if (mt === "text/calendar") return "ics";
  return "bin";
}

// ============================================================================
// MIME-Zerlegung
// ============================================================================

interface MimeAnhang { filename: string; contentType: string; content: Uint8Array; size: number }

function kopfWert(kopf: string, name: string): string {
  const flach = kopf.replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp("(?:^|\\n)" + name + ":[ \\t]*([^\\r\\n]*)", "i");
  const m = flach.match(re);
  return m ? m[1].trim() : "";
}

function parameter(wert: string, name: string): string {
  const m = wert.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', "i")) || wert.match(new RegExp(name + "\\s*=\\s*([^;\\s]+)", "i"));
  return m ? m[1] : "";
}

function dekodiereDateiname(roh: string): string {
  if (!roh) return "";
  // Mehrere kodierte Woerter hintereinander gehoeren zusammen (RFC 2047: Leerraum dazwischen faellt weg)
  let n = roh.replace(/\?=\s+=\?/g, "?==?");
  n = n.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs: string, art: string, daten: string) => {
    try {
      if (art.toUpperCase() === "B") {
        return new TextDecoder(cs.toLowerCase()).decode(Uint8Array.from(atob(daten), c => c.charCodeAt(0)));
      }
      const bytes: number[] = [];
      daten.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})|([\s\S])/g, (_t, hex: string, ch: string) => {
        bytes.push(hex ? parseInt(hex, 16) : ch.charCodeAt(0));
        return "";
      });
      return new TextDecoder(cs.toLowerCase()).decode(new Uint8Array(bytes));
    } catch { return daten; }
  });
  if (/^[^']*''/.test(n)) { try { n = decodeURIComponent(n.replace(/^[^']*''/, "")); } catch { /* Rohname */ } }
  return n.trim().normalize("NFC");
}

function base64ZuBytes(text: string): Uint8Array {
  const sauber = text.replace(/[^A-Za-z0-9+/=]/g, "");
  const bin = atob(sauber);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function quotedPrintableZuBytes(text: string): Uint8Array {
  const bytes: number[] = [];
  const t = text.replace(/=\r?\n/g, "");
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(t.substr(i + 1, 2))) { bytes.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; }
    else bytes.push(t.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(bytes);
}

function grenzmarken(quelle: string): string[] {
  const out = new Set<string>();
  const re = /boundary\s*=\s*(?:"([^"]+)"|([^";\r\n]+))/gi;
  let m;
  while ((m = re.exec(quelle)) !== null) {
    const b = (m[1] || m[2] || "").trim();
    if (b) out.add(b);
  }
  return [...out];
}

function abschnitte(quelle: string): string[] {
  const marken = grenzmarken(quelle);
  const trenner: { start: number; ende: number }[] = [];
  for (const b of marken) {
    const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("(^|\\r?\\n)--" + esc + "(--)?[ \\t]*(?=\\r?\\n|$)", "g");
    let m;
    while ((m = re.exec(quelle)) !== null) {
      trenner.push({ start: m.index + m[1].length, ende: m.index + m[0].length });
    }
  }
  trenner.sort((a, b) => a.start - b.start);
  if (!trenner.length) return [quelle];
  const out: string[] = [];
  for (let i = 0; i < trenner.length; i++) {
    const von = trenner[i].ende;
    const bis = i + 1 < trenner.length ? trenner[i + 1].start : quelle.length;
    if (bis > von) out.push(quelle.substring(von, bis));
  }
  return out;
}

function findeAnhaenge(quelle: string): MimeAnhang[] {
  const out: MimeAnhang[] = [];
  const teile = abschnitte(quelle);
  console.log(`  MIME: ${grenzmarken(quelle).length} Grenzmarken, ${teile.length} Abschnitte`);
  for (const roh of teile) {
    if (out.length >= MAX_ANHAENGE) break;
    const abschnitt = roh.replace(/^\r?\n/, "");
    const trenn = abschnitt.search(/\r?\n\r?\n/);
    if (trenn < 0 || trenn > 8000) continue;
    const kopf = abschnitt.substring(0, trenn);
    if (!/content-/i.test(kopf)) continue;
    const ct = kopfWert(kopf, "Content-Type") || "";
    if (/^multipart\//i.test(ct)) continue;
    const cd = kopfWert(kopf, "Content-Disposition");
    const name = dekodiereDateiname(parameter(cd, "filename") || parameter(ct, "name"));
    // v10: Kalenderteile (Termineinladungen) haben meist weder Disposition noch Dateinamen — trotzdem mitnehmen
    const istKalender = /^text\/calendar/i.test(ct);
    if (!/attachment/i.test(cd) && !name && !istKalender) continue;
    const koerper = abschnitt.substring(trenn).replace(/^\r?\n\r?\n/, "");
    const kodierung = (kopfWert(kopf, "Content-Transfer-Encoding") || "7bit").toLowerCase();
    let bytes: Uint8Array;
    if (kodierung.includes("base64")) bytes = base64ZuBytes(koerper);
    else if (kodierung.includes("quoted")) bytes = quotedPrintableZuBytes(koerper);
    else {
      const b = new Uint8Array(koerper.length);
      for (let i = 0; i < koerper.length; i++) b[i] = koerper.charCodeAt(i) & 0xff;
      bytes = b;
    }
    if (!bytes.length) continue;
    out.push({
      filename: name || (istKalender ? "einladung.ics" : "anhang"),
      contentType: (ct.split(";")[0] || "application/octet-stream").trim().toLowerCase(),
      content: bytes,
      size: bytes.length,
    });
  }
  return out;
}

function findeText(quelle: string): string {
  for (const roh of abschnitte(quelle)) {
    const a = roh.replace(/^\r?\n/, "");
    const trenn = a.search(/\r?\n\r?\n/);
    if (trenn < 0 || trenn > 4000) continue;
    const kopf = a.substring(0, trenn);
    const ct = kopfWert(kopf, "Content-Type") || "";
    if (!/^text\/plain/i.test(ct)) continue;
    if (/attachment/i.test(kopfWert(kopf, "Content-Disposition"))) continue;
    const koerper = a.substring(trenn).replace(/^\r?\n\r?\n/, "").substring(0, 12000);
    const kod = (kopfWert(kopf, "Content-Transfer-Encoding") || "7bit").toLowerCase();
    try {
      if (kod.includes("base64")) return new TextDecoder().decode(base64ZuBytes(koerper)).substring(0, 3000);
      if (kod.includes("quoted")) return new TextDecoder().decode(quotedPrintableZuBytes(koerper)).substring(0, 3000);
    } catch { /* Rohtext */ }
    return koerper.substring(0, 3000);
  }
  return "";
}

// ============================================================================
// KI-Benennung
// ============================================================================
async function ki_naming(opts: {
  filename: string; mime: string; content?: Uint8Array;
  mail_betreff: string; mail_absender_email: string; mail_absender_name: string;
  mail_body_anfang: string; mail_datum: string; onedrive_ordner_pfad?: string;
}): Promise<{ neuer_name: string; doktyp: string; objekt: string; datum: string; konfidenz: number } | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const ext = dateiExtension(opts.filename, opts.mime);

  const systemPrompt = `Du bist ein Assistent fuer einen Immobilienmakler und benennst Mail-Anhaenge um.

Schema: YYYY-MM-DD_Objektadresse_Doktyp.${ext}
Beispiel: 2026-05-26_Doberaner-Str-16_Energieausweis.pdf

WICHTIGE REGELN:
- Das Datum ist IMMER das Datum der Mail (steht im Kontext), niemals das heutige.
- Die Objektadresse muss aus Mail, Anhang oder Ordnerpfad klar hervorgehen.
  Wenn du sie nicht sicher erkennst: objekt = "Unbekannt" und konfidenz unter 70.
  Rate NICHT. Ein Originalname ist besser als ein falscher neuer Name.
- Wenn mehrere Anhaenge derselben Art vorliegen (mehrere Grundrisse, Ansichten,
  Lageplaene), gehoert die Unterscheidung in den Doktyp, z. B.
  "Grundriss-Erdgeschoss", "Grundriss-Obergeschoss", "Ansicht-Nord-Ost",
  "Lageplan-Haus-2A". Nie zwei Anhaenge gleich benennen.
- Steht im Original schon eine sinnvolle Bezeichnung, uebernimm sie in den Doktyp.

Doktypen (Beispiele, erweiterbar):
Grundbuchauszug, Energieausweis, Liegenschaftskarte, Maklervollmacht,
Baulastenverzeichnis, Baugenehmigung, Bauakte, Teilungserklaerung,
Wohngeldabrechnung, Nebenkostenabrechnung, Verkehrswertgutachten, Mietvertrag,
Maklervertrag, Expose, Grundriss, Ansicht, Schnitt, Lageplan, Foto, Sonstiges

Antworte AUSSCHLIESSLICH als JSON:
{"neuer_name":"...","doktyp":"...","objekt":"Strassenname-Hausnr oder Unbekannt","datum":"YYYY-MM-DD","konfidenz":0-100}`;

  let userText = `Mail-Kontext:\n- Absender: ${opts.mail_absender_name} <${opts.mail_absender_email}>\n- Betreff: ${opts.mail_betreff}\n- Datum der Mail: ${opts.mail_datum.slice(0, 10)}\n- Original-Anhang-Name: ${opts.filename}\n- Mime-Type: ${opts.mime}`;
  if (opts.onedrive_ordner_pfad) {
    userText += `\n- Verknuepfter OneDrive-Ordner: ${opts.onedrive_ordner_pfad}\n  Aus dem Ordner-Pfad laesst sich oft die Objektadresse ableiten.`;
  }
  userText += `\n\nMail-Body (Anfang):\n${opts.mail_body_anfang.substring(0, 2000)}`;

  const content: any[] = [{ type: "text", text: userText }];

  if (opts.content && opts.content.length > 0 && opts.content.length < KI_MAX_INHALT) {
    let binary = "";
    const bytes = opts.content;
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, bytes.length))) as any);
    }
    const b64 = btoa(binary);
    if (istPdf(opts.mime)) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
    else if (istBild(opts.mime)) content.push({ type: "image", source: { type: "base64", media_type: opts.mime, data: b64 } });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 400, system: systemPrompt, messages: [{ role: "user", content }] }),
    });
    if (!r.ok) { console.error("KI-Naming Fehler:", r.status, (await r.text()).substring(0, 200)); return null; }
    const data = await r.json();
    let t = data?.content?.[0]?.text || "";
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) t = m[1].trim();
    const parsed = JSON.parse(t);
    if (!parsed.neuer_name || typeof parsed.neuer_name !== "string") return null;
    return {
      neuer_name: speicherName(parsed.neuer_name),
      doktyp: parsed.doktyp || "Sonstiges",
      objekt: parsed.objekt || "Unbekannt",
      datum: parsed.datum || opts.mail_datum.slice(0, 10),
      konfidenz: Number(parsed.konfidenz) || 50,
    };
  } catch (e) {
    console.error("KI-Naming Exception:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Entscheidet, ob der KI-Name den Originalnamen ersetzen darf */
function nameUebernehmen(original: string, r: { neuer_name: string; objekt: string; konfidenz: number } | null): boolean {
  if (!r) return false;
  const objekt = (r.objekt || "").trim().toLowerCase();
  if (!objekt || objekt === "unbekannt") return false;          // ohne Objekt kein Mehrwert
  if ((r.konfidenz || 0) < KI_MIN_KONFIDENZ) return false;      // Rateergebnis verwerfen
  if (/unbekannt/i.test(r.neuer_name)) return false;
  if (speicherName(original).toLowerCase() === r.neuer_name.toLowerCase()) return false;
  return true;
}

// ============================================================================
// SimpleImap
// ============================================================================

class SimpleImap {
  private conn: Deno.TlsConn | null = null;
  private encoder = new TextEncoder();
  private buffer = "";
  private tagCounter = 0;

  constructor(private host: string, private port: number, private user: string, private pass: string) {}

  private nextTag(): string { this.tagCounter++; return `A${String(this.tagCounter).padStart(4, "0")}`; }

  async connect(): Promise<void> {
    this.conn = await Deno.connectTls({ hostname: this.host, port: this.port });
    await this.readUntil(/^\* OK/m, 10000);
  }

  private async lese(buf: Uint8Array, timeoutMs: number): Promise<number | null> {
    const readPromise = this.conn!.read(buf);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(1, timeoutMs)));
    return await Promise.race([readPromise, timeoutPromise]);
  }

  private async readUntil(endRegex: RegExp, timeoutMs: number): Promise<string> {
    const start = Date.now();
    const buf = new Uint8Array(16 * 1024);
    while (Date.now() - start < timeoutMs) {
      const m = this.buffer.match(endRegex);
      if (m) {
        const idx = (m as any).index + m[0].length;
        const eolIdx = this.buffer.indexOf("\n", idx);
        const cut = eolIdx >= 0 ? eolIdx + 1 : this.buffer.length;
        const result = this.buffer.substring(0, cut);
        this.buffer = this.buffer.substring(cut);
        return result;
      }
      const n = await this.lese(buf, timeoutMs - (Date.now() - start));
      if (n === null) throw new Error(`IMAP read timeout (${timeoutMs}ms)`);
      if (n === 0) throw new Error("Connection closed");
      this.buffer += bytesZuText(buf.subarray(0, n));
    }
    throw new Error(`IMAP read timeout`);
  }

  private async send(line: string): Promise<void> { await this.conn!.write(this.encoder.encode(line + "\r\n")); }

  private async cmd(command: string, timeoutMs = 15000): Promise<string> {
    const tag = this.nextTag();
    await this.send(`${tag} ${command}`);
    const endRe = new RegExp(`^${tag} (OK|NO|BAD)`, "m");
    const resp = await this.readUntil(endRe, timeoutMs);
    if (/^[A-Z]\d{4} (NO|BAD)/m.test(resp)) throw new Error(`IMAP-Fehler bei "${command}": ${resp.substring(0, 300)}`);
    return resp;
  }

  async login(): Promise<void> {
    const escUser = this.user.replace(/"/g, '\\"');
    const escPass = this.pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await this.cmd(`LOGIN "${escUser}" "${escPass}"`);
  }

  async selectFolder(folderName: string): Promise<void> {
    const esc = folderName.replace(/"/g, '\\"');
    await this.cmd(`SELECT "${esc}"`);
  }

  async fetchMailSource(uid: number, timeoutMs = 25000): Promise<string | null> {
    const tag = this.nextTag();
    await this.send(`${tag} UID FETCH ${uid} (BODY.PEEK[])`);
    const start = Date.now();

    let kopf = this.buffer;
    this.buffer = "";
    let groesse = 0;
    let rest = "";
    const kleiner = new Uint8Array(8 * 1024);
    while (Date.now() - start < timeoutMs) {
      const m = kopf.match(/\{(\d+)\}\r?\n/);
      if (m) {
        groesse = parseInt(m[1], 10);
        rest = kopf.substring((m as any).index + m[0].length);
        break;
      }
      if (new RegExp(`${tag} (NO|BAD)`).test(kopf)) return null;
      if (kopf.length > 300_000) break;
      const n = await this.lese(kleiner, timeoutMs - (Date.now() - start));
      if (n === null) throw new Error(`UID FETCH ${uid} timeout (Kopf)`);
      if (n === 0) throw new Error(`Connection closed (Kopf) UID ${uid}`);
      kopf += bytesZuText(kleiner.subarray(0, n));
    }
    if (!groesse) { console.warn("Keine Laengenangabe in der FETCH-Antwort"); return null; }

    const teile: string[] = [];
    let haben = 0;
    if (rest) { teile.push(rest); haben += rest.length; }
    const gross = new Uint8Array(64 * 1024);
    while (haben < groesse && Date.now() - start < timeoutMs) {
      const n = await this.lese(gross, timeoutMs - (Date.now() - start));
      if (n === null) throw new Error(`UID FETCH ${uid} timeout (Inhalt: ${haben}/${groesse})`);
      if (n === 0) break;
      const text = bytesZuText(gross.subarray(0, n));
      teile.push(text);
      haben += text.length;
    }
    if (haben < groesse) throw new Error(`Mail unvollstaendig gelesen (${haben} von ${groesse} Bytes) — bitte erneut versuchen`);
    const quelle = teile.join("").substring(0, groesse);
    this.buffer = "";
    console.log(`  gelesen: ${quelle.length} von ${groesse} Bytes in ${Date.now() - start} ms`);
    return quelle;
  }

  async logout(): Promise<void> {
    try { this.conn?.close(); } catch { /* egal */ }
    this.conn = null;
  }
}

// ============================================================================
// Entry
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let imap: SimpleImap | null = null;
  let mailIdFuerFehler: string | null = null;

  try {
    const body = await req.json();
    const mail_id = body?.mail_id;
    await immoMandantSichern(req, [["mail_eingang", mail_id]]);
    const kiGewuenscht = body?.ki !== false;
    mailIdFuerFehler = mail_id;

    if (!mail_id) {
      return new Response(JSON.stringify({ ok: false, error: "Fehlender Parameter: mail_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Interner Aufruf (Reparatur) ueber das Diagnose-Geheimnis aus dem Vault — sonst Nutzer-Token
    let userId: string | null = null;
    let intern = false;
    const diagnoseSecret = req.headers.get("x-diagnose-secret");
    if (diagnoseSecret) {
      const { data: ok } = await admin.rpc("diagnose_secret_pruefen", { p: diagnoseSecret });
      if (!ok) {
        return new Response(JSON.stringify({ ok: false, error: "Nicht erlaubt." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      intern = true;
    } else {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ ok: false, error: "Kein Auth-Token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ ok: false, error: "Nicht authentifiziert" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
    }

    const { data: mail, error: mailErr } = await admin.from("mail_eingang").select("*").eq("id", mail_id).maybeSingle();
    if (mailErr || !mail) {
      return new Response(JSON.stringify({ ok: false, error: "Mail nicht gefunden" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mail.anhaenge_status === "extrahiert" && Array.isArray(mail.anhaenge) && mail.anhaenge.length > 0 && body?.neu !== true) {
      return new Response(JSON.stringify({ ok: true, anhaenge: mail.anhaenge, anzahl: mail.anhaenge.length, aus_cache: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!mail.imap_uid || !mail.imap_folder) {
      return new Response(JSON.stringify({
        ok: false, error: "Mail hat keine imap_uid/imap_folder. Vermutlich ein Entwurf oder gesendete Mail.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: postfach } = await admin.from("mail_postfaecher").select("*").eq("id", mail.postfach_id).maybeSingle();
    if (!postfach) {
      return new Response(JSON.stringify({ ok: false, error: "Postfach zur Mail nicht gefunden" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (intern) {
      // Speicherpfad: vorhandenes Praefix der Mail weiterverwenden, sonst Postfach-Inhaber
      const vorhanden = (Array.isArray(mail.anhaenge) ? mail.anhaenge : []).map((a: any) => String(a?.storage_path || "")).find((p: string) => p.includes("/"));
      userId = vorhanden ? vorhanden.split("/")[0] : (postfach.benutzer_id || null);
      if (!userId) throw new Error("Interner Aufruf: kein Speicherpfad ableitbar (Postfach ohne Inhaber)");
    } else {
      const { data: profile } = await admin.from("profiles").select("role").eq("id", userId!).maybeSingle();
      const istChef = profile?.role === "chef";
      if (postfach.benutzer_id !== userId && !istChef) {
        return new Response(JSON.stringify({ ok: false, error: "Keine Berechtigung fuer dieses Postfach" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!postfach.imap_server || !postfach.imap_passwort_verschluesselt) {
      return new Response(JSON.stringify({ ok: false, error: "Postfach hat keine IMAP-Konfiguration" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let onedriveOrdnerPfad: string | undefined;
    try {
      const absEmail = (mail.absender_email || "").trim().toLowerCase();
      if (absEmail) {
        const { data: mapping } = await admin
          .from("mail_absender_onedrive").select("onedrive_pfad")
          .eq("user_id", userId).eq("absender_email", absEmail).maybeSingle();
        if (mapping?.onedrive_pfad) onedriveOrdnerPfad = mapping.onedrive_pfad;
      }
    } catch { /* egal */ }

    const passwort = await entschluessele(postfach.imap_passwort_verschluesselt);

    imap = new SimpleImap(
      postfach.imap_server, Number(postfach.imap_port || 993),
      postfach.imap_user || postfach.email_adresse, passwort,
    );
    await imap.connect();
    await imap.login();
    await imap.selectFolder(mail.imap_folder);
    console.log(`FETCH UID=${mail.imap_uid}`);
    const source = await imap.fetchMailSource(mail.imap_uid, 25000);
    try { await imap.logout(); } catch { /* egal */ }
    imap = null;

    if (!source) {
      await admin.from("mail_eingang").update({
        anhaenge_status: "fehler",
        anhaenge_fehler: "Mail-Source konnte nicht geladen werden",
        anhaenge_extrahiert_am: new Date().toISOString(),
      }).eq("id", mail_id);
      return new Response(JSON.stringify({ ok: false, error: "Mail-Source konnte nicht geladen werden" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const t0 = Date.now();
    const attachments = findeAnhaenge(source).slice(0, MAX_ANHAENGE);
    const mailBody = findeText(source);
    console.log(`${attachments.length} Anhaenge in ${Date.now() - t0} ms`);

    if (attachments.length === 0) {
      await admin.from("mail_eingang").update({
        anhaenge: [], anhaenge_status: "keine_anhaenge",
        anhaenge_extrahiert_am: new Date().toISOString(), anhaenge_fehler: null,
      }).eq("id", mail_id);
      return new Response(JSON.stringify({ ok: true, anhaenge: [], anzahl: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Schritt 1: Speichernamen festlegen (ASCII, innerhalb der Mail eindeutig) ----
    const vergeben = new Map<string, number>();
    const speicherNamen = attachments.map((att, i) => {
      let n = speicherName(att.filename || `anhang_${i + 1}`);
      const schluessel = n.toLowerCase();
      const zaehler = (vergeben.get(schluessel) || 0) + 1;
      vergeben.set(schluessel, zaehler);
      if (zaehler > 1) {
        const punkt = n.lastIndexOf(".");
        n = punkt > 0 ? `${n.substring(0, punkt)}-${zaehler}${n.substring(punkt)}` : `${n}-${zaehler}`;
      }
      return n;
    });

    // ---- Schritt 2: alle Anhaenge parallel hochladen; Fehlschlag wird gemeldet, nicht verschluckt ----
    const tUp = Date.now();
    const uploadFehler: string[] = [];
    const ergebnisse = await Promise.all(attachments.map(async (att, i) => {
      const origName = att.filename || `anhang_${i + 1}`;
      const mime = att.contentType || "application/octet-stream";
      const kandidaten = [speicherNamen[i], `anhang_${i + 1}.${dateiExtension(origName, mime)}`];
      let letzterFehler = "";
      for (const name of kandidaten) {
        const storagePath = `${userId}/${mail_id}/${name}`;
        try {
          const { error: upErr } = await admin.storage.from("mail-anhaenge")
            .upload(storagePath, att.content, { contentType: mime, upsert: true });
          if (upErr) { letzterFehler = upErr.message; console.error(`Upload-Fehler ${name}:`, upErr.message); continue; }
        } catch (e) {
          letzterFehler = e instanceof Error ? e.message : String(e);
          console.error(`Upload-Exception ${name}:`, letzterFehler);
          continue;
        }
        return {
          name, original_name: origName, safe_name: name,
          size: att.size, mime_type: mime, storage_path: storagePath,
          extracted_at: new Date().toISOString(),
        } as any;
      }
      uploadFehler.push(`${origName} (${letzterFehler || "unbekannt"})`);
      return null;
    }));
    const anhaengeMeta = ergebnisse.filter(Boolean);
    console.log(`  ${anhaengeMeta.length} von ${attachments.length} hochgeladen in ${Date.now() - tUp} ms`);

    const fehlerText = uploadFehler.length
      ? `${uploadFehler.length} von ${attachments.length} Anhaengen konnte nicht gespeichert werden: ${uploadFehler.join("; ")}`.substring(0, 500)
      : null;

    await admin.from("mail_eingang").update({
      anhaenge: anhaengeMeta,
      anhaenge_status: anhaengeMeta.length > 0 ? "extrahiert" : "fehler",
      anhaenge_extrahiert_am: new Date().toISOString(),
      anhaenge_fehler: fehlerText,
    }).eq("id", mail_id);

    // ---- Schritt 3: KI-Namen im Hintergrund, zugeordnet ueber den Quellindex ----
    if (kiGewuenscht && ANTHROPIC_API_KEY && anhaengeMeta.length > 0) {
      const nachtraeglich = (async () => {
        const kopien: any[] = ergebnisse.map(e => e ? { ...e } : null);   // gleiche Indizes wie attachments
        const mailDatum = mail.gesendet_am || new Date().toISOString();
        const aufgaben = attachments.slice(0, MAX_KI_AUFRUFE).map((att, i) => async () => {
          if (!kopien[i]) return;                                          // nicht gespeichert -> nichts zu benennen
          const mime = att.contentType || "application/octet-stream";
          if (mime === "text/calendar") return;                            // Kalenderteile behalten ihren Namen
          const inhalt = (istPdf(mime) || istBild(mime)) && att.content.length < KI_MAX_INHALT ? att.content : undefined;
          const r = await ki_naming({
            filename: att.filename, mime, content: inhalt,
            mail_betreff: mail.betreff || "", mail_absender_email: mail.absender_email || "",
            mail_absender_name: mail.absender_name || "", mail_body_anfang: mailBody,
            mail_datum: mailDatum, onedrive_ordner_pfad: onedriveOrdnerPfad,
          });
          if (!r || !kopien[i]) return;
          // Doktyp merken wir uns immer (fuer Ablage und Suche), den Namen nur bei sicherem Treffer
          const zusatz: any = { ki_doktyp: r.doktyp, ki_objekt: r.objekt, ki_datum: r.datum, ki_konfidenz: r.konfidenz };
          if (nameUebernehmen(att.filename, r)) {
            zusatz.name = r.neuer_name;
            zusatz.ki_umbenannt = true;
          } else {
            console.log(`  Originalname behalten: ${att.filename} (Objekt ${r.objekt}, Konfidenz ${r.konfidenz})`);
          }
          kopien[i] = { ...kopien[i], ...zusatz };
        });
        for (let i = 0; i < aufgaben.length; i += KI_GLEICHZEITIG) {
          await Promise.all(aufgaben.slice(i, i + KI_GLEICHZEITIG).map(f => f()));
        }
        const fertig = kopien.filter(Boolean);
        // Doppelte Anzeigenamen durchnummerieren
        const gesehen = new Map<string, number>();
        for (let i = 0; i < fertig.length; i++) {
          const n = fertig[i].name || "anhang";
          const schluessel = n.toLowerCase();
          const zaehler = (gesehen.get(schluessel) || 0) + 1;
          gesehen.set(schluessel, zaehler);
          if (zaehler > 1) {
            const punkt = n.lastIndexOf(".");
            fertig[i] = { ...fertig[i], name: punkt > 0 ? `${n.substring(0, punkt)}-${zaehler}${n.substring(punkt)}` : `${n}-${zaehler}` };
          }
        }
        await admin.from("mail_eingang").update({ anhaenge: fertig }).eq("id", mail_id);
        console.log("  KI-Namen nachgetragen");
      })();
      try { (globalThis as any).EdgeRuntime?.waitUntil?.(nachtraeglich); } catch { /* laeuft sonst mit */ }
    }

    return new Response(JSON.stringify({
      ok: true, anhaenge: anhaengeMeta, anzahl: anhaengeMeta.length, fehler: fehlerText,
      ki_laeuft: kiGewuenscht && !!ANTHROPIC_API_KEY,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Allgemeiner Fehler:", e);
    try { await imap?.logout(); } catch { /* egal */ }
    try {
      if (mailIdFuerFehler) {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        await admin.from("mail_eingang").update({
          anhaenge_status: "fehler",
          anhaenge_fehler: (e instanceof Error ? e.message : String(e)).substring(0, 500),
          anhaenge_extrahiert_am: new Date().toISOString(),
        }).eq("id", mailIdFuerFehler);
      }
    } catch { /* egal */ }

    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
