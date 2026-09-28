// ============================================================================
// mail-gelesen-setzen (v1, 25.09.2026 – Stufe 80, Auftrag 2.3)
// ============================================================================
// Gelesen-Status Portal -> Server: Wird eine Mail im Portal geoeffnet oder als gelesen/ungelesen
// markiert, setzt diese Function das IMAP-Flag \Seen auf dem Mailserver (UID STORE +FLAGS/-FLAGS),
// damit Outlook denselben Stand zeigt.
//
// Aufruf (verify_jwt: true, Nutzer-Token):  POST { mail_id: uuid, gelesen: boolean }
// Rechte: Die Mail wird mit dem Token des Nutzers gelesen (RLS mail_eingang_lesen: eigenes Postfach
// oder Chef). Nur wenn der Nutzer die Mail sehen darf, wird das Postfach-Passwort (Service-Rolle,
// MAIL_SECRET_KEY) entschluesselt und der IMAP-Server angesprochen.
// Fehler werden geloggt und als { ok:false } gemeldet – das Portal blockiert die Oberflaeche nicht.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const antwort = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function bytesZuLatin1(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 8192)) as any);
  return s;
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

// Minimaler IMAP-Dialog (wie mail-postfach-pull): CONNECT, LOGIN, SELECT, UID STORE, LOGOUT
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
  private async readUntil(endRegex: RegExp, timeoutMs: number): Promise<string> {
    const start = Date.now();
    const buf = new Uint8Array(64 * 1024);
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
      const remaining = timeoutMs - (Date.now() - start);
      const n = await Promise.race([this.conn!.read(buf), new Promise<null>((r) => setTimeout(() => r(null), remaining))]);
      if (n === null) throw new Error(`IMAP read timeout (${timeoutMs}ms)`);
      if (n === 0) throw new Error("Connection closed");
      this.buffer += bytesZuLatin1(buf.subarray(0, n));
    }
    throw new Error("IMAP read timeout");
  }
  private async send(line: string): Promise<void> { await this.conn!.write(this.encoder.encode(line + "\r\n")); }
  private async cmd(command: string, timeoutMs = 15000): Promise<string> {
    const tag = this.nextTag();
    await this.send(`${tag} ${command}`);
    const resp = await this.readUntil(new RegExp(`^${tag} (OK|NO|BAD)`, "m"), timeoutMs);
    if (/^[A-Z]\d{4} (NO|BAD)/m.test(resp)) throw new Error(`IMAP-Fehler bei "${command.split(" ").slice(0, 2).join(" ")}": ${resp.substring(0, 200)}`);
    return resp;
  }
  async login(): Promise<void> {
    const escUser = this.user.replace(/"/g, '\\"');
    const escPass = this.pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await this.cmd(`LOGIN "${escUser}" "${escPass}"`);
  }
  async selectFolder(folderName: string): Promise<void> { await this.cmd(`SELECT "${folderName.replace(/"/g, '\\"')}"`); }
  async setzeSeen(uid: number, gelesen: boolean): Promise<void> {
    await this.cmd(`UID STORE ${uid} ${gelesen ? "+" : "-"}FLAGS.SILENT (\\Seen)`, 15000);
  }
  async logout(): Promise<void> {
    try { await this.cmd("LOGOUT", 5000); } catch { /* egal */ }
    try { this.conn?.close(); } catch { /* egal */ }
    this.conn = null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return antwort({ ok: false, error: "Nur POST" }, 405);

  let imap: SimpleImap | null = null;
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return antwort({ ok: false, error: "Nicht angemeldet" }, 401);

    let body: any = {};
    try { body = await req.json(); } catch { /* leer */ }
    const mailId = String(body?.mail_id || "").trim();
    const gelesen = body?.gelesen !== false;
    if (!/^[0-9a-f-]{36}$/i.test(mailId)) return antwort({ ok: false, error: "mail_id fehlt" }, 400);

    // 1) Mail mit den Rechten des Nutzers lesen (RLS entscheidet)
    const nutzerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await nutzerClient.auth.getUser();
    if (userErr || !userData?.user) return antwort({ ok: false, error: "Nicht angemeldet" }, 401);
    const { data: mail, error: mailErr } = await nutzerClient.from("mail_eingang")
      .select("id, postfach_id, imap_uid, imap_folder, ordner, gelesen").eq("id", mailId).maybeSingle();
    if (mailErr) throw mailErr;
    if (!mail) return antwort({ ok: false, error: "Mail nicht gefunden oder keine Berechtigung" }, 404);
    if (!mail.imap_uid || !mail.imap_folder || mail.ordner === "gesendet" || mail.ordner === "entwuerfe") {
      return antwort({ ok: true, uebersprungen: "keine IMAP-Zuordnung" });
    }

    // 2) Postfach-Zugang mit der Service-Rolle (Passwort bleibt serverseitig)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: pf, error: pfErr } = await admin.from("mail_postfaecher")
      .select("id, email_adresse, imap_server, imap_port, imap_user, imap_passwort_verschluesselt, imap_aktiv")
      .eq("id", mail.postfach_id).maybeSingle();
    if (pfErr) throw pfErr;
    if (!pf || !pf.imap_aktiv || !pf.imap_server || !pf.imap_passwort_verschluesselt) {
      return antwort({ ok: true, uebersprungen: "IMAP nicht aktiv" });
    }

    const passwort = await entschluessele(pf.imap_passwort_verschluesselt);
    imap = new SimpleImap(pf.imap_server, Number(pf.imap_port || 993), pf.imap_user || pf.email_adresse, passwort);
    await imap.connect();
    await imap.login();
    await imap.selectFolder(mail.imap_folder);
    await imap.setzeSeen(Number(mail.imap_uid), gelesen);
    await imap.logout();
    imap = null;

    // 3) Portal-Stand sicher angleichen (idempotent; das Portal hat meist schon geschrieben)
    if (mail.gelesen !== gelesen) await admin.from("mail_eingang").update({ gelesen }).eq("id", mail.id);

    console.log(`Gelesen-Flag ${gelesen ? "gesetzt" : "entfernt"}: ${pf.email_adresse} ${mail.imap_folder} UID ${mail.imap_uid} (${userData.user.email})`);
    return antwort({ ok: true, gelesen, uid: mail.imap_uid, ordner: mail.imap_folder });
  } catch (e) {
    console.error("mail-gelesen-setzen:", e instanceof Error ? e.message : String(e));
    try { await imap?.logout(); } catch { /* egal */ }
    return antwort({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
