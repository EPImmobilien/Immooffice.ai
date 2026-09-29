// ============================================================================
// Edge Function: mail-senden (v20 — Signatur genau einmal)
// ============================================================================
// Versendet E-Mails aus dem Portal (Mail-Modul, Einladungen, Vorgänge).
// v14: Resend-first mit All-Inkl-SMTP-Fallback.
// v15: Signatur-Handling fuer sichtbare Signatur (signatur_auto === false).
// v16: body.kalender = { ics, methode }  -> echte Termineinladung wie bei Outlook.
// v17: `an`, `cc`, `bcc` duerfen mehrere Adressen enthalten (Komma/Semikolon getrennt oder Array);
//      an_name wird nur noch bei genau EINEM Empfaenger angewendet.
// v18 (17.09.2026): Was ImmoOffice sendet, steht auch in Outlook.
//   - Jede Mail bekommt eine eigene Message-ID (<uuid@domain>), auf beiden Wegen (Resend: Header,
//     SMTP: messageId). mail_versendet.smtp_message_id traegt genau diese ID.
//   - Nach dem Versand wird die fertige Mail (gleicher Text/HTML/Anhaenge/ICS) per IMAP APPEND in den
//     „Gesendet“-Ordner des Postfachs gelegt (Flag \Seen). Outlook zeigt sie damit unter Gesendet;
//     der Pull importiert sie spaeter mit derselben Message-ID -> der Posteingang zeigt sie nur einmal.
//     Klappt die Kopie nicht (IMAP nicht erreichbar), ist die Mail trotzdem gesendet; Antwort: gesendet_kopie.
//   - Testmodus (Header x-diagnose-secret, body.test_append = true): legt eine Testnachricht in
//     „Gesendet“ ab und entfernt sie sofort wieder (STORE \Deleted + EXPUNGE) — prueft nur den Weg.
// v19 (24.09.2026): Versand darf nicht auf All-Inkl warten.
//   - Die Antwort ans Portal kommt direkt nach Versand + Log-Eintrag + ToDo-Erkennung.
//   - Die Kopie in „Gesendet“ laeuft danach im Hintergrund (EdgeRuntime.waitUntil). Klappt sie nicht,
//     steht der Grund in mail_versendet.fehler_text (status bleibt „gesendet“) und im Funktionslog.
//   - IMAP-Verbindungsaufbau hat ein hartes Limit von 8 s (vorher: Betriebssystem-Timeout, ~2 min).
//   - ToDo-Erkennung fragt nur die Kontakte mit den Empfaengeradressen ab.
// NEU v20 (26.09.2026): Signatur genau einmal.
//   Befund: Automatische Texte (Termine, Besichtigungen, Exposé-Links, Urlaub, Landingpage, Vorgänge)
//   enden mit "Mit freundlichen Grüßen" + Name; die Postfach-Signatur kam trotzdem noch einmal
//   darunter, weil nur die ersten 40 Zeichen der Signatur gesucht wurden. Texte mit "Musterhaus Immobilien
//   Immobilien" bekamen dagegen gar keine Signatur. Jetzt gilt eine Regel (mail-signatur.ts):
//   Grußformel am Textende abschneiden und die Postfach-Signatur genau einmal anhängen; steckt die
//   Signatur schon im Text (sichtbare Signatur, signatur_auto === false), bleibt alles; ohne
//   Postfach-Signatur bleibt die Grußformel des Textes. Kein "--"-Trenner mehr.
// ============================================================================
declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

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
import nodemailer from "npm:nodemailer@6.9.16";
import MailComposer from "npm:nodemailer@6.9.16/lib/mail-composer/index.js";
import { mitSignatur } from "./mail-signatur.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diagnose-secret",
};
const antwort = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function entschluessele(verschluesseltesBase64: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = verschluesseltesBase64.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Ungueltiges verschluesseltes Passwort-Format");
  }
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
  return btoa(bin);
}
function bytesZuLatin1(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 8192)) as any);
  return s;
}

// "a@x.de, Name <b@y.de>; c@z.de" | ["a@x.de", ...] -> ["a@x.de", "Name <b@y.de>", "c@z.de"]
function adressListe(wert: unknown): string[] {
  const roh: string[] = Array.isArray(wert) ? wert.map(String) : (typeof wert === "string" ? [wert] : []);
  const aus: string[] = [];
  for (const r of roh) {
    for (const teil of r.split(/[,;\n]+/)) {
      const t = teil.trim().replace(/^"+|"+$/g, "").trim();
      if (t && /@/.test(t) && !aus.includes(t)) aus.push(t);
    }
  }
  return aus;
}
const reineAdresse = (s: string) => { const m = /<([^>]+)>/.exec(s); return (m ? m[1] : s).trim().toLowerCase(); };

// ---------------------------------------------------------------------------
// v18: kleiner IMAP-Client nur fuer APPEND (und den Testmodus)
// ---------------------------------------------------------------------------
class ImapKurz {
  private conn: Deno.TlsConn | null = null;
  private buffer = "";
  private zaehler = 0;
  private enc = new TextEncoder();
  constructor(private host: string, private port: number, private user: string, private pass: string) {}

  async connect(): Promise<void> {
    // v19: hartes Limit fuer den Verbindungsaufbau; ein spaeter doch noch zustande kommender Socket wird geschlossen
    const verbinden = Deno.connectTls({ hostname: this.host, port: this.port });
    let wecker: number | undefined;
    const limit = new Promise<never>((_, ablehnen) => { wecker = setTimeout(() => ablehnen(new Error("IMAP Verbindungsaufbau Timeout (8 s)")), 8000); });
    try { this.conn = await Promise.race([verbinden, limit]); }
    catch (e) { verbinden.then((c) => { try { c.close(); } catch { /* egal */ } }).catch(() => { /* egal */ }); throw e; }
    finally { if (wecker !== undefined) clearTimeout(wecker); }
    await this.readUntil(/^\* OK/m, 10000);
  }
  private async lesen(timeoutMs: number): Promise<void> {
    const buf = new Uint8Array(64 * 1024);
    const n = await Promise.race([this.conn!.read(buf), new Promise<null>((r) => setTimeout(() => r(null), Math.max(1, timeoutMs)))]);
    if (n === null) throw new Error("IMAP Timeout");
    if (n === 0) throw new Error("IMAP Verbindung geschlossen");
    this.buffer += bytesZuLatin1(buf.subarray(0, n));
  }
  private async readUntil(re: RegExp, timeoutMs: number): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const m = this.buffer.match(re);
      if (m) {
        const idx = (m as any).index + m[0].length;
        const eol = this.buffer.indexOf("\n", idx);
        const cut = eol >= 0 ? eol + 1 : this.buffer.length;
        const r = this.buffer.substring(0, cut);
        this.buffer = this.buffer.substring(cut);
        return r;
      }
      await this.lesen(timeoutMs - (Date.now() - start));
    }
    throw new Error("IMAP Timeout");
  }
  private async send(line: string): Promise<void> { await this.conn!.write(this.enc.encode(line + "\r\n")); }
  private tag(): string { return `K${String(++this.zaehler).padStart(4, "0")}`; }
  async cmd(command: string, timeoutMs = 15000): Promise<string> {
    const tag = this.tag();
    await this.send(`${tag} ${command}`);
    const resp = await this.readUntil(new RegExp(`^${tag} (OK|NO|BAD)`, "m"), timeoutMs);
    if (new RegExp(`^${tag} (NO|BAD)`, "m").test(resp)) throw new Error(`IMAP ${command.split(" ")[0]}: ${resp.slice(0, 200)}`);
    return resp;
  }
  async login(): Promise<void> {
    const u = this.user.replace(/"/g, '\\"'), p = this.pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await this.cmd(`LOGIN "${u}" "${p}"`);
  }
  async append(folder: string, bytes: Uint8Array, flags = "\\Seen"): Promise<void> {
    const tag = this.tag();
    const esc = folder.replace(/"/g, '\\"');
    await this.send(`${tag} APPEND "${esc}" (${flags}) {${bytes.length}}`);
    const weiter = await this.readUntil(new RegExp(`^(\\+|${tag} (NO|BAD))`, "m"), 15000);
    if (!/^\+/m.test(weiter)) throw new Error("APPEND abgelehnt: " + weiter.slice(0, 200));
    await this.conn!.write(bytes);
    await this.send("");
    const resp = await this.readUntil(new RegExp(`^${tag} (OK|NO|BAD)`, "m"), 30000);
    if (new RegExp(`^${tag} (NO|BAD)`, "m").test(resp)) throw new Error("APPEND: " + resp.slice(0, 200));
  }
  // Testmodus: die eben abgelegte Nachricht anhand der Message-ID wieder entfernen
  async loeschenNachMessageId(folder: string, messageId: string): Promise<number> {
    const esc = folder.replace(/"/g, '\\"');
    await this.cmd(`SELECT "${esc}"`);
    const resp = await this.cmd(`UID SEARCH HEADER Message-ID "${messageId.replace(/"/g, "")}"`, 20000);
    const zeile = resp.split("\n").find((l) => l.startsWith("* SEARCH"));
    const uids = (zeile || "").replace("* SEARCH", "").trim().split(/\s+/).map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
    if (!uids.length) return 0;
    await this.cmd(`UID STORE ${uids.join(",")} +FLAGS.SILENT (\\Deleted)`);
    await this.cmd("EXPUNGE", 20000);
    return uids.length;
  }
  async logout(): Promise<void> {
    try { await this.cmd("LOGOUT", 5000); } catch { /* egal */ }
    try { this.conn?.close(); } catch { /* egal */ }
    this.conn = null;
  }
}

async function gesendetOrdnerName(admin: any, postfachId: string): Promise<string> {
  try {
    const { data } = await admin.from("mail_ordner").select("name").eq("postfach_id", postfachId).eq("typ", "sent").limit(1).maybeSingle();
    if (data?.name) return data.name;
  } catch { /* Rueckfall */ }
  return "Gesendet";
}

// Kopie der fertigen Mail ins „Gesendet“ des Postfachs legen. Fehler werden gemeldet, nicht geworfen.
async function kopieInGesendet(admin: any, postfach: any, nachricht: any): Promise<{ ok: boolean; ordner: string; fehler?: string; bytes?: number }> {
  const ordner = await gesendetOrdnerName(admin, postfach.id);
  if (!postfach.imap_server || !postfach.imap_passwort_verschluesselt) return { ok: false, ordner, fehler: "Postfach ohne IMAP-Zugang" };
  let imap: ImapKurz | null = null;
  try {
    const passwort = await entschluessele(postfach.imap_passwort_verschluesselt);
    const roh: Uint8Array = new Uint8Array(await new (MailComposer as any)(nachricht).compile().build());
    imap = new ImapKurz(postfach.imap_server, Number(postfach.imap_port || 993), postfach.imap_user || postfach.email_adresse, passwort);
    await imap.connect();
    await imap.login();
    await imap.append(ordner, roh);
    await imap.logout();
    return { ok: true, ordner, bytes: roh.length };
  } catch (e) {
    try { await imap?.logout(); } catch { /* egal */ }
    return { ok: false, ordner, fehler: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { postfach_id, an, an_name, cc, bcc, betreff, text, html, mietanfrage_id, anhaenge, signatur_auto, kalender } = body;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ---- v18 Testmodus: nur den Weg in „Gesendet“ pruefen (Diagnose-Geheimnis statt Nutzer-Token) ----
    if (body.test_append === true) {
      const geheim = req.headers.get("x-diagnose-secret");
      if (!geheim) return antwort({ ok: false, error: "Nicht erlaubt." }, 401);
      const { data: okSecret } = await admin.rpc("diagnose_secret_pruefen", { p: geheim });
      if (!okSecret) return antwort({ ok: false, error: "Nicht erlaubt." }, 401);
      const { data: pf } = await admin.from("mail_postfaecher").select("*").eq("id", postfach_id).maybeSingle();
      if (!pf) return antwort({ ok: false, error: "Postfach nicht gefunden" }, 404);
      const domain = String(pf.email_adresse || "").split("@")[1] || "immooffice.example";
      const testId = `<test-${crypto.randomUUID()}@${domain}>`;
      const nachricht = { from: `"${pf.absender_name}" <${pf.email_adresse}>`, to: pf.email_adresse, subject: "ImmoOffice Test (wird sofort entfernt)", text: "Testnachricht fuer die Gesendet-Kopie. Diese Nachricht wird automatisch wieder geloescht.", messageId: testId };
      const kopie = await kopieInGesendet(admin, pf, nachricht);
      let entfernt = 0, entfernenFehler: string | null = null;
      if (kopie.ok) {
        let imap: ImapKurz | null = null;
        try {
          imap = new ImapKurz(pf.imap_server, Number(pf.imap_port || 993), pf.imap_user || pf.email_adresse, await entschluessele(pf.imap_passwort_verschluesselt));
          await imap.connect(); await imap.login();
          entfernt = await imap.loeschenNachMessageId(kopie.ordner, testId);
          await imap.logout();
        } catch (e) { entfernenFehler = e instanceof Error ? e.message : String(e); try { await imap?.logout(); } catch { /* egal */ } }
      }
      return antwort({ ok: kopie.ok, test: true, postfach: pf.email_adresse, ...kopie, entfernt, entfernen_fehler: entfernenFehler, message_id: testId });
    }

    const anListe = adressListe(an);
    const ccListe = adressListe(cc);
    const bccListe = adressListe(bcc);

    if (!postfach_id || !anListe.length || !betreff || !text) {
      return antwort({ ok: false, error: "Fehlende Parameter: postfach_id, an, betreff, text sind Pflicht." }, 400);
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return antwort({ ok: false, error: "Kein Auth-Token" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return antwort({ ok: false, error: "Nicht authentifiziert" }, 401);
    const userId = userData.user.id;

    // Gleich darunter hebt die Rolle "chef" die Eigentuemerpruefung auf.
    // Ohne Mandantengrenze davor haette ein Chef Post ueber das Postfach
    // eines fremden Maklers verschickt — mit dessen Absenderadresse.
    await immoMandantSichern(req, [["mail_postfaecher", String(postfach_id || "")]]);
    const { data: postfach, error: pfErr } = await admin
      .from("mail_postfaecher").select("*").eq("id", postfach_id).maybeSingle();
    if (pfErr || !postfach) return antwort({ ok: false, error: "Postfach nicht gefunden" }, 404);

    const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    const istChef = profile?.role === "chef";
    if (postfach.benutzer_id !== userId && !istChef) return antwort({ ok: false, error: "Keine Berechtigung fuer dieses Postfach" }, 403);
    if (!postfach.aktiv) return antwort({ ok: false, error: "Postfach ist deaktiviert" }, 400);

    // ---- Signatur (v20): genau einmal ----
    // signatur_auto === false: das Verfassen-Fenster hat die Signatur schon sichtbar eingesetzt (oder
    // bewusst weggelassen, z. B. Kalender-Antworten) -> Text bleibt unveraendert.
    // Sonst: Grussformel am Textende abschneiden, Postfach-Signatur anhaengen (mail-signatur.ts).
    const finalText = signatur_auto === false ? String(text) : mitSignatur(String(text), postfach.signatur);

    // Trailing whitespace pro Zeile entfernen (verhindert =20 in Quoted-Printable)
    const cleanText = finalText.split("\n").map((z: string) => z.replace(/[ \t]+$/, "")).join("\n");

    // ---- Empfaenger (v17) ----
    const anNameSauber = typeof an_name === "string" ? an_name.replace(/["<>\r\n]/g, "").trim() : "";
    const anResend = anListe.length === 1 && anNameSauber && !/</.test(anListe[0])
      ? [`${anNameSauber} <${anListe[0]}>`] : anListe;
    const anSmtp = anListe.length === 1 && anNameSauber && !/</.test(anListe[0])
      ? `"${anNameSauber}" <${anListe[0]}>` : anListe;
    const anLog = anListe.map(reineAdresse).join(", ");

    // ---- Kalendereinladung (v16) ----
    const ics: string | null = kalender && typeof kalender.ics === "string" && kalender.ics.includes("BEGIN:VCALENDAR") ? kalender.ics : null;
    const methode: string = ics ? String(kalender.methode || "REQUEST").toUpperCase() : "";
    const icsDateiname = methode === "CANCEL" ? "absage.ics" : "einladung.ics";

    const attachmentsSmtp = Array.isArray(anhaenge) && anhaenge.length > 0
      ? anhaenge.map((a: any) => ({
          filename: a.filename || "anhang",
          content: a.content,
          encoding: "base64",
          contentType: a.contentType || "application/octet-stream",
        }))
      : undefined;

    // ---- v18: eigene Message-ID fuer beide Wege ----
    const domain = String(postfach.email_adresse || "").split("@")[1] || "immooffice.example";
    const eigeneMessageId = `<${crypto.randomUUID()}@${domain}>`;

    // Die Nachricht, wie sie auch als Kopie in „Gesendet“ landet
    const nachricht: any = {
      from: `"${postfach.absender_name}" <${postfach.email_adresse}>`,
      to: anSmtp,
      cc: ccListe.length ? ccListe : undefined,
      bcc: bccListe.length ? bccListe : undefined,
      subject: betreff,
      text: cleanText,
      html: html || undefined,
      attachments: attachmentsSmtp,
      messageId: eigeneMessageId,
    };
    // Einladung als text/calendar-Alternative (so erkennen Outlook & Co. die Mail als Termin)
    if (ics) nachricht.icalEvent = { method: methode, filename: icsDateiname, content: ics };

    let versandWeg = "";
    let messageId: string | null = null;
    let resendId: string | null = null;
    const fehler: string[] = [];

    // ---- Weg A: Resend (HTTP-API) ----
    const perResend = async () => {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) throw new Error("Resend nicht eingerichtet");
      const attachmentsResend: any[] = Array.isArray(anhaenge) ? anhaenge.map((a: any) => ({
        filename: a.filename || "anhang", content: a.content, content_type: a.contentType || undefined,
      })) : [];
      if (ics) attachmentsResend.push({ filename: icsDateiname, content: base64Utf8(ics), content_type: `text/calendar; method=${methode}; charset=UTF-8` });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${postfach.absender_name} <${postfach.email_adresse}>`,
          to: anResend,
          cc: ccListe.length ? ccListe : undefined,
          bcc: bccListe.length ? bccListe : undefined,
          reply_to: postfach.email_adresse,
          subject: betreff,
          text: cleanText,
          html: html || undefined,
          headers: { "Message-ID": eigeneMessageId },
          attachments: attachmentsResend.length ? attachmentsResend : undefined,
        }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
      const rj = await r.json().catch(() => ({}));
      resendId = rj?.id || null;
      messageId = eigeneMessageId;
      versandWeg = "resend";
    };

    // ---- Weg B: SMTP des Postfachs (All-Inkl) ----
    const perSmtp = async () => {
      if (!postfach.smtp_passwort_verschluesselt) throw new Error("Postfach hat kein SMTP-Passwort hinterlegt");
      let passwort: string;
      try { passwort = await entschluessele(postfach.smtp_passwort_verschluesselt); }
      catch (e) { throw new Error("Passwort konnte nicht entschluesselt werden"); }
      const istSslDirekt = Number(postfach.smtp_port) === 465 || postfach.smtp_security === "ssl";
      const transporter = nodemailer.createTransport({
        host: postfach.smtp_server,
        port: Number(postfach.smtp_port),
        secure: istSslDirekt,
        auth: { user: postfach.smtp_user, pass: passwort },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
      });
      const smtpResult = await transporter.sendMail(nachricht);
      messageId = smtpResult?.messageId || eigeneMessageId;
      versandWeg = "smtp";
    };

    // Reihenfolge: Einladungen bevorzugt per SMTP (echte Kalenderteile), sonst Resend zuerst.
    const reihenfolge = ics && postfach.smtp_passwort_verschluesselt ? [perSmtp, perResend] : [perResend, perSmtp];
    for (const weg of reihenfolge) {
      try { await weg(); break; }
      catch (e) { const m = e instanceof Error ? e.message : String(e); fehler.push(m); console.error("Versandweg fehlgeschlagen:", m); }
    }

    if (!versandWeg) {
      const fehlerText = fehler.join(" | ");
      await admin.from("mail_versendet").insert({
        postfach_id,
        versendet_von_user_id: userId,
        absender_email: postfach.email_adresse,
        absender_name: postfach.absender_name,
        empfaenger_email: anLog,
        empfaenger_name: anListe.length === 1 ? (anNameSauber || null) : null,
        cc: ccListe.length ? ccListe.join(", ") : null,
        bcc: bccListe.length ? bccListe.join(", ") : null,
        betreff,
        body_text: finalText,
        body_html: html || null,
        mietanfrage_id: mietanfrage_id || null,
        status: "fehler",
        fehler_text: fehlerText,
      });
      return antwort({ ok: false, error: "Versand fehlgeschlagen: " + fehlerText }, 500);
    }
    console.log(`Versand erfolgreich (${versandWeg}):`, messageId, resendId ? `resend:${resendId}` : "");

    const { data: log } = await admin.from("mail_versendet").insert({
      postfach_id,
      versendet_von_user_id: userId,
      absender_email: postfach.email_adresse,
      absender_name: postfach.absender_name,
      empfaenger_email: anLog,
      empfaenger_name: anListe.length === 1 ? (anNameSauber || null) : null,
      cc: ccListe.length ? ccListe.join(", ") : null,
      bcc: bccListe.length ? bccListe.join(", ") : null,
      betreff,
      body_text: finalText,
      body_html: html || null,
      mietanfrage_id: mietanfrage_id || null,
      status: "gesendet",
      smtp_message_id: messageId,
    }).select().single();

    // ---- v19: Kopie in „Gesendet“ des Postfachs (Outlook) — im Hintergrund, die Antwort wartet nicht darauf ----
    const kopieImHintergrund = async () => {
      const start = Date.now();
      try {
        const kopie = await kopieInGesendet(admin, postfach, nachricht);
        if (kopie.ok) { console.log(`Gesendet-Kopie abgelegt in „${kopie.ordner}“ (${kopie.bytes} Bytes, ${Date.now() - start} ms)`); return; }
        console.warn("Gesendet-Kopie nicht abgelegt:", kopie.fehler, `(${Date.now() - start} ms)`);
        if (log?.id) await admin.from("mail_versendet").update({ fehler_text: "Gesendet-Kopie nicht abgelegt (Mail ist gesendet): " + (kopie.fehler || "?") }).eq("id", log.id);
      } catch (e) { console.warn("Gesendet-Kopie (Hintergrund):", e instanceof Error ? e.message : String(e)); }
    };
    const hintergrund = (p: Promise<unknown>) => {
      try { if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) { EdgeRuntime.waitUntil(p); return; } } catch { /* Rueckfall */ }
      p.catch(() => { /* schon geloggt */ });
    };

    // ------------------------------------------------------------------
    // ToDos, die mit dieser Mail erledigt sind (unveraendert aus v17)
    // ------------------------------------------------------------------
    const todosErledigt: Array<{ id: string; titel: string }> = [];
    const todosVorschlag: Array<{ id: string; titel: string }> = [];
    try {
      const ziele = anListe.map(reineAdresse).filter(Boolean);
      if (ziele.length) {
        const { data: mitEmpf } = await admin.from("todos")
          .select("id, titel, empfaenger_email")
          .eq("status", "offen").not("empfaenger_email", "is", null);
        const direkt = (mitEmpf || []).filter((t: any) =>
          ziele.includes(String(t.empfaenger_email || "").trim().toLowerCase()));
        for (const t of direkt) {
          const { error: uErr } = await admin.from("todos").update({
            status: "erledigt",
            erledigt_am: new Date().toISOString(),
            ergebnis: "Automatisch erledigt: Mail an " + String(t.empfaenger_email).trim().toLowerCase() + " gesendet",
            mail_versendet_id: log?.id || null,
          }).eq("id", t.id);
          if (!uErr) todosErledigt.push({ id: t.id, titel: t.titel });
        }
        const schon = new Set(todosErledigt.map((t) => t.id));

        // v19: nur Kontakte mit genau diesen Adressen (Gross-/Kleinschreibung egal) statt der ganzen Tabelle
        const sicher = ziele.filter((z) => /^[a-z0-9._%+@-]+$/i.test(z));
        const { data: kontakte } = sicher.length
          ? await admin.from("kontakte").select("id, email").or(sicher.map((z) => `email.ilike.${z}`).join(",")).limit(200)
          : { data: [] as any[] };
        const kIds = (kontakte || []).filter((k: any) => ziele.includes(String(k.email || "").trim().toLowerCase())).map((k: any) => k.id);
        if (kIds.length) {
          const { data: verk } = await admin.from("todo_verknuepfung")
            .select("todo_id").eq("objekt_typ", "kontakt").in("objekt_id", kIds);
          const tIds = [...new Set((verk || []).map((v: any) => v.todo_id))].filter((id: any) => !schon.has(id));
          if (tIds.length) {
            const { data: offene } = await admin.from("todos")
              .select("id, titel, daten").eq("status", "offen").in("id", tIds);
            for (const t of offene || []) {
              const bisher = (t.daten && typeof t.daten === "object" && !Array.isArray(t.daten)) ? t.daten : {};
              await admin.from("todos").update({
                daten: { ...bisher, mail_hinweis: {
                  mail_id: log?.id || null,
                  betreff: String(betreff || "").slice(0, 120),
                  an: ziele[0],
                  am: new Date().toISOString(),
                } },
              }).eq("id", t.id);
              todosVorschlag.push({ id: t.id, titel: t.titel });
            }
          }
        }
      }
    } catch (e) {
      console.warn("ToDo-Erkennung:", e instanceof Error ? e.message : String(e));
    }

    hintergrund(kopieImHintergrund());

    return antwort({
      ok: true,
      id: log?.id,
      todos_erledigt: todosErledigt,
      todos_vorschlag: todosVorschlag,
      messageId,
      resend_id: resendId,
      versandweg: versandWeg,
      gesendet_kopie: "im Hintergrund",
      kalender: ics ? methode : null,
      anhaenge_anzahl: Array.isArray(anhaenge) ? anhaenge.length : 0,
      empfaenger: anListe.length,
    });

  } catch (e) {
    console.error("Unerwarteter Fehler:", e);
    return antwort({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
