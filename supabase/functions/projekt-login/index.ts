// ============================================================================
// projekt-login (v5)
//   Passwort-Login fuer den Kundenbereich der Projekt-Homepages.
//   Aktionen: setup, login, logout, reset_anfordern, reset_setzen.
//   v4: Reset-Mails ueber Resend (HTTP-API), sonst Fallback All-Inkl-SMTP.
//
// v5 (23.09.2026, Sicherheitsdurchgang) - ZWEI AENDERUNGEN:
//
//   1. KONTOUEBERNAHME UEBER DEN ALTEN EINLADUNGSLINK GESCHLOSSEN.
//      "setup" nahm einen Einladungs-Token und setzte damit ein Passwort, OHNE zu pruefen,
//      ob schon eines gesetzt war - und ohne den Token zu verbrauchen. Im Bestand trugen alle
//      sieben Zugaenge mit Passwort ihren Einladungs-Token weiterhin. Wer je einen solchen Link
//      in Haenden hatte (weitergeleitete Mail, Browserverlauf, altes Postfach), konnte damit
//      jederzeit das Passwort ueberschreiben und in den Kundenbereich - der Kunde haette es erst
//      daran gemerkt, dass er selbst nicht mehr hineinkommt.
//      Jetzt: Ist bereits ein Passwort gesetzt, verweigert "setup" und verweist auf
//      "Passwort vergessen". Dieser Weg schickt eine Mail an die hinterlegte Adresse, setzt also
//      den Besitz des Postfachs voraus - genau die Pruefung, die hier gefehlt hat.
//      Der Token bleibt bestehen, damit die Einladung fuer noch nicht eingerichtete Zugaenge
//      erneut versendet werden kann.
//
//   2. Passwortvergleich in konstanter Zeit (vorher ein gewoehnlicher Zeichenkettenvergleich,
//      der beim ersten Unterschied abbricht). Der Unterschied ist neben 100.000 PBKDF2-Runden
//      kaum messbar, kostet aber nichts.
//
//   NICHT enthalten und weiterhin offen: eine Bremse gegen Durchprobieren beim Login.
//   Es gibt keinen Fehlversuchszaehler und keine Sperre; nur die Rechenzeit von PBKDF2 bremst.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const STANDARD_MAIL = "info@immooffice.example";
const ITER = 100000;
function b64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function b64dec(s: string): Uint8Array { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

// Vergleich ohne fruehen Abbruch: Laufzeit haengt nicht davon ab, WO der erste Unterschied liegt.
function gleichKonstanteZeit(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hashPasswort(passwort: string, salt?: Uint8Array, iter = ITER): Promise<string> {
  const s = salt || crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passwort), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: s, iterations: iter }, key, 256);
  return `pbkdf2$${iter}$${b64(s)}$${b64(new Uint8Array(bits))}`;
}
async function pruefePasswort(passwort: string, gespeichert: string): Promise<boolean> {
  try {
    const [schema, iterS, saltB64, hashB64] = gespeichert.split("$");
    if (schema !== "pbkdf2") return false;
    const neu = await hashPasswort(passwort, b64dec(saltB64), parseInt(iterS, 10));
    return gleichKonstanteZeit(neu.split("$")[3], hashB64);
  } catch (_e) { return false; }
}
function neueSession(): { token: string; bis: string } {
  return {
    token: b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, ""),
    bis: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
function neuerResetToken(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "");
}

async function entschluessele(verschluesseltesBase64: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = verschluesseltesBase64.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungueltiges Passwort-Format");
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

async function holePostfach(admin: ReturnType<typeof createClient>, mandant: string | null) {
  // Das Postfach muss dem Mandanten des Projekts gehoeren.
  if (!mandant) { console.warn("Postfach: kein Mandant angegeben, kein Versand."); return null; }
  const { data: pf } = await admin.from("mail_postfaecher")
    .select("*").eq("mandant_id", mandant).eq("email_adresse", STANDARD_MAIL).eq("aktiv", true).limit(1).maybeSingle();
  if (pf) return pf;
  const { data: alle } = await admin.from("mail_postfaecher")
    .select("*").eq("mandant_id", mandant).eq("aktiv", true)
    .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);
  return (alle || [])[0] || null;
}

// Versand: Resend (HTTPS, feste Infrastruktur) bevorzugt, sonst All-Inkl-SMTP
async function sendeMail(postfach: any, an: string, anName: string, betreff: string, text: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const absName = postfach?.absender_name || "Musterhaus Immobilien GmbH";
  const absMail = postfach?.email_adresse || STANDARD_MAIL;
  const finalText = postfach?.signatur ? `${text}\n\n--\n${postfach.signatur}` : text;
  if (resendKey) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${absName} <${absMail}>`,
        to: [anName ? `${anName} <${an}>` : an],
        reply_to: absMail,
        subject: betreff,
        text: finalText,
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return;
  }
  if (!postfach?.smtp_server) throw new Error("Kein Versandweg konfiguriert.");
  const passwort = await entschluessele(postfach.smtp_passwort_verschluesselt);
  const transporter = nodemailer.createTransport({
    host: postfach.smtp_server, port: Number(postfach.smtp_port),
    secure: Number(postfach.smtp_port) === 465 || postfach.smtp_security === "ssl",
    auth: { user: postfach.smtp_user, pass: passwort },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  await transporter.sendMail({
    from: `"${absName}" <${absMail}>`,
    to: anName ? `"${anName}" <${an}>` : an,
    subject: betreff,
    text: finalText,
  });
}

async function logAktivitaet(admin: ReturnType<typeof createClient>, projektId: string, zugangId: string, typ: string) {
  try {
    await admin.from("projekt_aktivitaeten").insert({ projekt_id: projektId, zugang_id: zugangId, typ });
  } catch (_e) { /* Log darf nie blockieren */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").toString();

    if (action === "setup") {
      const token = (body.token || "").toString().trim();
      const passwort = (body.passwort || "").toString();
      if (!token) throw new Error("Ungültiger Link.");
      if (passwort.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen lang sein.");
      const { data: z } = await admin.from("projekt_zugaenge")
        .select("id, projekt_id, aktiv, anzeigename, passwort_hash").eq("token", token).maybeSingle();
      if (!z || !z.aktiv) throw new Error("Dieser Einladungs-Link ist ungültig oder gesperrt.");
      // v5: Einladungslinks richten EINEN Zugang ein. Steht schon ein Passwort, fuehrt der Weg
      // ueber "Passwort vergessen" - der setzt den Besitz des hinterlegten Postfachs voraus.
      if (z.passwort_hash) {
        await logAktivitaet(admin, z.projekt_id, z.id, "setup_abgelehnt_passwort_vorhanden");
        throw new Error("Für diesen Zugang ist bereits ein Passwort gesetzt. Bitte melden Sie sich an – oder fordern Sie über „Passwort vergessen“ ein neues an.");
      }
      const s = neueSession();
      await admin.from("projekt_zugaenge").update({
        passwort_hash: await hashPasswort(passwort),
        passwort_gesetzt_am: new Date().toISOString(),
        session_token: s.token,
        session_gueltig_bis: s.bis,
        letzter_login_am: new Date().toISOString(),
      }).eq("id", z.id);
      await logAktivitaet(admin, z.projekt_id, z.id, "passwort_gesetzt");
      return jsonResponse({ ok: true, session: s.token, anzeigename: z.anzeigename });
    }

    if (action === "login") {
      const slug = (body.slug || "").toString().trim();
      const email = (body.email || "").toString().trim().toLowerCase();
      const passwort = (body.passwort || "").toString();
      if (!slug || !email || !passwort) throw new Error("Bitte E-Mail und Passwort angeben.");
      const { data: projekt } = await admin.from("projekte").select("id").eq("slug", slug).maybeSingle();
      if (!projekt) throw new Error("Projekt nicht gefunden.");
      const { data: z } = await admin.from("projekt_zugaenge")
        .select("id, aktiv, anzeigename, passwort_hash")
        .eq("projekt_id", projekt.id).eq("email", email).maybeSingle();
      if (!z || !z.aktiv || !z.passwort_hash || !(await pruefePasswort(passwort, z.passwort_hash))) {
        throw new Error("E-Mail oder Passwort ist nicht korrekt.");
      }
      const s = neueSession();
      await admin.from("projekt_zugaenge").update({
        session_token: s.token, session_gueltig_bis: s.bis, letzter_login_am: new Date().toISOString(),
      }).eq("id", z.id);
      await logAktivitaet(admin, projekt.id, z.id, "login");
      return jsonResponse({ ok: true, session: s.token, anzeigename: z.anzeigename });
    }

    if (action === "logout") {
      const session = (body.session || "").toString().trim();
      if (session) {
        await admin.from("projekt_zugaenge").update({ session_token: null, session_gueltig_bis: null }).eq("session_token", session);
      }
      return jsonResponse({ ok: true });
    }

    if (action === "reset_anfordern") {
      const slug = (body.slug || "").toString().trim();
      const email = (body.email || "").toString().trim().toLowerCase();
      if (!slug || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Bitte geben Sie Ihre E-Mail-Adresse an.");
      const { data: projekt } = await admin.from("projekte")
        .select("id, name, oeffentliche_url, mandant_id").eq("slug", slug).maybeSingle();
      if (!projekt) return jsonResponse({ ok: true });

      const { data: z } = await admin.from("projekt_zugaenge")
        .select("id, anzeigename, aktiv, reset_gueltig_bis, mandant_id")
        .eq("projekt_id", projekt.id).eq("email", email).maybeSingle();
      if (!z || !z.aktiv) return jsonResponse({ ok: true });

      if (z.reset_gueltig_bis && new Date(z.reset_gueltig_bis).getTime() - Date.now() > (48 * 60 - 15) * 60 * 1000) {
        return jsonResponse({ ok: true });
      }

      const resetToken = neuerResetToken();
      await admin.from("projekt_zugaenge").update({
        reset_token: resetToken,
        reset_gueltig_bis: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      }).eq("id", z.id);
      await logAktivitaet(admin, projekt.id, z.id, "passwort_reset_angefordert");

      try {
        const postfach = await holePostfach(admin, projekt.mandant_id);
        const basis = (projekt.oeffentliche_url || "").replace(/\/+$/, "");
        const link = basis ? `${basis}/?reset=${resetToken}` : `?reset=${resetToken}`;
        await sendeMail(postfach, email, z.anzeigename || "",
          `Passwort zurücksetzen – ${projekt.name}`,
          `Guten Tag ${z.anzeigename || ""},\n\n`
          + `Sie haben ein neues Passwort für Ihren Kundenbereich zum Projekt „${projekt.name}“ angefordert.\n\n`
          + `Über folgenden Link legen Sie Ihr neues Passwort fest (48 Stunden gültig):\n\n${link}\n\n`
          + `Falls Sie das nicht waren, können Sie diese E-Mail einfach ignorieren – Ihr bisheriges Passwort bleibt gültig.\n\n`
          + `Für Rückfragen stehen wir Ihnen gerne zur Verfügung!\n\nMit freundlichen Grüßen\nMusterhaus Immobilien GmbH`);
      } catch (_mailErr) { /* generische Antwort bleibt */ }

      return jsonResponse({ ok: true });
    }

    if (action === "reset_setzen") {
      const resetToken = (body.reset_token || "").toString().trim();
      const passwort = (body.passwort || "").toString();
      if (!resetToken) throw new Error("Ungültiger Link.");
      if (passwort.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen lang sein.");
      const { data: z } = await admin.from("projekt_zugaenge")
        .select("id, projekt_id, aktiv, anzeigename, reset_gueltig_bis")
        .eq("reset_token", resetToken).maybeSingle();
      if (!z || !z.aktiv || !z.reset_gueltig_bis || new Date(z.reset_gueltig_bis).getTime() <= Date.now()) {
        throw new Error("Dieser Link ist abgelaufen oder ungültig. Bitte fordern Sie über „Passwort vergessen“ einen neuen an.");
      }
      const s = neueSession();
      await admin.from("projekt_zugaenge").update({
        passwort_hash: await hashPasswort(passwort),
        passwort_gesetzt_am: new Date().toISOString(),
        reset_token: null,
        reset_gueltig_bis: null,
        session_token: s.token,
        session_gueltig_bis: s.bis,
        letzter_login_am: new Date().toISOString(),
      }).eq("id", z.id);
      await logAktivitaet(admin, z.projekt_id, z.id, "passwort_zurueckgesetzt");
      return jsonResponse({ ok: true, session: s.token, anzeigename: z.anzeigename });
    }

    throw new Error("Unbekannte Aktion.");
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
