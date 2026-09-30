// eigentuemer-nachricht-senden (v5) — Makler -> Eigentuemer, mit Anhaengen.
// v4: nodemailer; Absender = persoenliches Postfach des Maklers.
// NEU v5: Versand ueber Resend (HTTP-API), wenn RESEND_API_KEY gesetzt ist —
// kein SMTP-Login bei All-Inkl mehr. Die Absender-IDENTITAET (Name + Adresse)
// kommt weiterhin aus dem persoenlichen Postfach des schreibenden Maklers
// (Fallback SMTP_FROM_*). Ohne Key: bisheriger SMTP-Weg unveraendert.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Firmenname des Mandanten (Phase 2.4) ---------------------------------
// Die Neutralisierung hat den Namen der Referenz ueberall durch den des
// Demo-Mandanten ersetzt. Fuer das Neutralitaets-Gate war das richtig; fuer
// ein mandantenfaehiges Produkt ist ein verdrahteter Firmenname bei jedem
// Mandanten ausser einem falsch — und er stand in Grussformeln, Briefkoepfen
// und im OpenImmo-Feld <firma>, das jedes Portal anzeigt.
//
// Ohne Eintrag liefert diese Funktion einen LEEREN Text, keinen Beispielnamen.
// Die aufrufende Stelle laesst die Zeile dann weg. Eine fehlende Grussformel
// faellt auf; eine falsche nicht.
async function immoFirmenName(db: any, mandant: unknown): Promise<string> {
  if (typeof mandant !== "string" || !mandant) return "";
  const { data } = await db.from("firma_stammdaten")
    .select("firma_name, marken_name")
    .eq("mandant_id", mandant).eq("aktiv", true)
    .order("sortierung", { ascending: true }).limit(1).maybeSingle();
  return String(data?.marken_name || data?.firma_name || "").trim();
}

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function entschluessele(verschluesseltesBase64: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = verschluesseltesBase64.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungueltiges Passwort-Format");
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const portalUrl = Deno.env.get("PORTAL_URL") || "https://immooffice.example";

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) throw new Error("Nicht angemeldet.");
    const { data: profil } = await supabase.from("profiles").select("role, name, mandant_id").eq("id", userData.user.id).maybeSingle();
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) throw new Error("Keine Berechtigung.");

    const body = await req.json();
    const eigentuemer_id = body.eigentuemer_id;
    await immoMandantSichern(req, [["eigentuemer", eigentuemer_id]]);
    const text = (body.nachricht || "").trim();
    const anhaenge = Array.isArray(body.anhaenge) ? body.anhaenge.slice(0, 50) : [];
    if (!eigentuemer_id) throw new Error("eigentuemer_id fehlt.");
    if (!text && anhaenge.length === 0) throw new Error("Nachricht ist leer.");
    if (text.length > 5000) throw new Error("Nachricht ist zu lang (max. 5000 Zeichen).");

    const { data: personen } = await supabase.from("eigentuemer_personen")
      .select("vorname, nachname, anrede, email").eq("eigentuemer_id", eigentuemer_id).eq("erhaelt_emails", true).eq("aktiv", true);
    let empfaenger = (personen || []).filter(p => p.email && p.email.includes("@"))
      .map(p => ({ email: p.email, anrede: p.anrede || "", vorname: p.vorname || "", nachname: p.nachname || "" }));
    if (empfaenger.length === 0) {
      const { data: eig } = await supabase.from("eigentuemer").select("email, anrede, vorname, nachname").eq("id", eigentuemer_id).maybeSingle();
      if (eig?.email && eig.email.includes("@")) empfaenger = [{ email: eig.email, anrede: eig.anrede || "", vorname: eig.vorname || "", nachname: eig.nachname || "" }];
    }
    if (empfaenger.length === 0) throw new Error("Kein Empfaenger mit E-Mail-Adresse gefunden.");

    const firmaName = await immoFirmenName(supabase, profil.mandant_id);
    const absender = profil.name || firmaName;

    // ---- Absender-Identitaet: persoenliches Postfach des Maklers bevorzugt ----
    const { data: postfaecher } = await supabase.from("mail_postfaecher")
      .select("*").eq("benutzer_id", userData.user.id).eq("aktiv", true)
      .order("reihenfolge", { ascending: true });
    const kandidaten = (postfaecher || []).filter(p => p.email_adresse);
    const gewaehlt = kandidaten.find(p => p.standard_zum_senden)
      || kandidaten.find(p => p.ist_standard)
      || kandidaten[0]
      || null;

    const fromEmail = gewaehlt?.email_adresse || Deno.env.get("SMTP_FROM_EMAIL") || "info@immooffice.example";
    const fromName = gewaehlt?.absender_name || absender || firmaName || Deno.env.get("SMTP_FROM_NAME") || "";

    // ---- Versandweg: Resend bevorzugt, sonst SMTP wie bisher ----
    const resendKey = Deno.env.get("RESEND_API_KEY");
    let transporter: any = null;
    if (!resendKey) {
      let smtpConf: { host: string; port: number; user: string; pass: string } | null = null;
      if (gewaehlt && gewaehlt.smtp_passwort_verschluesselt && gewaehlt.smtp_server && gewaehlt.smtp_port && gewaehlt.smtp_user) {
        try {
          const pass = await entschluessele(gewaehlt.smtp_passwort_verschluesselt);
          smtpConf = { host: gewaehlt.smtp_server, port: Number(gewaehlt.smtp_port), user: gewaehlt.smtp_user, pass };
        } catch (e) {
          console.warn("Postfach-Passwort konnte nicht entschluesselt werden, nutze zentrale Konfiguration:", e instanceof Error ? e.message : String(e));
        }
      }
      if (!smtpConf) {
        const host = Deno.env.get("SMTP_HOST"); const port = parseInt(Deno.env.get("SMTP_PORT") || "0", 10);
        const username = Deno.env.get("SMTP_USERNAME"); const password = Deno.env.get("SMTP_PASSWORD");
        if (!host || !port || !username || !password) throw new Error("Kein Versandweg: weder RESEND_API_KEY noch SMTP konfiguriert.");
        smtpConf = { host, port, user: username, pass: password };
      }
      transporter = nodemailer.createTransport({
        host: smtpConf.host, port: smtpConf.port, secure: smtpConf.port === 465,
        auth: { user: smtpConf.user, pass: smtpConf.pass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
      });
    }

    const sende = async (to: string, subject: string, textBody: string, htmlBody: string) => {
      if (resendKey) {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], reply_to: fromEmail, subject, text: textBody, html: htmlBody }),
        });
        if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
        return;
      }
      await transporter.sendMail({ from: `"${fromName}" <${fromEmail}>`, to, subject, text: textBody, html: htmlBody });
    };

    let gesendet = 0;
    const fehler: string[] = [];
    for (const e of empfaenger) {
      const name = [e.vorname, e.nachname].filter(Boolean).join(" ");
      const begruessung = e.anrede ? `${e.anrede} ${e.nachname || name}` : (name || "Sehr geehrte Damen und Herren");
      const { htmlBody, textBody } = buildMail({ begruessung, text, absender, firmaName, portalUrl, anhaenge });
      try {
        await sende(e.email, firmaName ? `Eine Nachricht von ${firmaName}` : "Eine Nachricht von Ihrem Makler", textBody, htmlBody);
        gesendet++;
      } catch (err) {
        const m = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error(`Versand-Fehler an ${e.email}:`, m);
        fehler.push(`${e.email}: ${m}`);
      }
    }

    try {
      await supabase.from("eigentuemer_nachrichten").insert({
        eigentuemer_id, absender_typ: "makler", absender_user_id: userData.user.id,
        absender_name: absender, text: text || "(Dateianhang)", anhaenge,
      });
    } catch (e) { console.warn("Chat-Eintrag fehlgeschlagen:", e); }

    if (gesendet === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Mailversand fehlgeschlagen: " + fehler.join(" | "), gespeichert: true }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, empfaenger_anzahl: gesendet, absender_postfach: fromEmail, versandweg: resendKey ? "resend" : "smtp", teilfehler: fehler.length ? fehler : undefined }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function buildMail(opts: { begruessung: string; text: string; absender: string; firmaName: string; portalUrl: string; anhaenge: Array<{ name: string }> }) {
  const anhHtml = opts.anhaenge.length
    ? `<p style="margin:14px 0 0;font-size:13px;color:#5a5440;">\ud83d\udcce ${opts.anhaenge.length} Datei(en) im Portal: ${opts.anhaenge.map(a => escapeHtml(a.name)).join(", ")}</p>` : "";
  const textTeil = opts.text ? `<div style="margin:18px 0;padding:14px 18px;background:#f3edde;border-left:3px solid #c7a455;font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(opts.text)}</div>` : "";
  const htmlBody = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#263159;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ee;"><tr><td align="center" style="padding:40px 20px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e0d6;">
      <tr><td style="background:#263159;padding:32px 36px;border-bottom:3px solid #c7a455;"><div style="font-size:22px;font-weight:300;letter-spacing:0.25em;color:#ffffff;">MUSTERHAUS</div><div style="font-size:10px;color:#c7a455;letter-spacing:0.2em;margin-top:4px;font-weight:600;">EIGENT\u00dcMER-PORTAL</div></td></tr>
      <tr><td style="padding:40px 36px 30px;"><p style="margin:0 0 14px;font-size:14px;line-height:1.7;">Guten Tag ${escapeHtml(opts.begruessung)},</p>${textTeil}${anhHtml}
        <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#5a5440;">\u2014 ${escapeHtml(opts.absender)}${opts.firmaName ? ", " + escapeHtml(opts.firmaName) : ""}</p>
        <p style="margin:28px 0 0;text-align:center;"><a href="${opts.portalUrl}" style="display:inline-block;background:#263159;color:#ffffff;text-decoration:none;padding:13px 30px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Zum Eigent\u00fcmer-Portal</a></p></td></tr>
      <tr><td style="padding:24px 36px 30px;border-top:1px solid #e5e0d6;background:#faf8f3;"><p style="margin:0;font-size:11px;line-height:1.6;color:#8a8470;">Antworten Sie einfach auf diese E-Mail oder nutzen Sie die Nachrichten-Funktion in Ihrem Portal.</p></td></tr>
    </table></td></tr></table></body></html>`;
  const textBody = `Guten Tag ${opts.begruessung},\n\n${opts.text || "(Dateianhang)"}` + (opts.anhaenge.length ? `\n\n\ud83d\udcce ${opts.anhaenge.length} Datei(en): ${opts.anhaenge.map(a => a.name).join(", ")}` : "") + `\n\n\u2014 ${opts.absender}${opts.firmaName ? ", " + opts.firmaName : ""}\n\nIhr Portal: ${opts.portalUrl}\n`;
  return { htmlBody, textBody };
}
function escapeHtml(s: string): string { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
