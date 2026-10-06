// makler-nachricht-senden (v5) — Eigentuemer -> Maklerbuero, mit Anhaengen.
// v4: nodemailer statt denomailer; Portal-Benachrichtigung mit empfaenger_user_id.
// NEU v5: Versand ueber Resend (HTTP-API), wenn RESEND_API_KEY gesetzt ist —
// kein SMTP-Login bei All-Inkl mehr. Ohne Key: Fallback SMTP (nodemailer).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

// Pflichtangabe. Fehlt sie, geht NICHTS hinaus: ein Rueckfall auf
// eine Adresse, die niemandem gehoert, sieht aus wie Betrieb, kommt
// aber nirgends an. Begruendung in docs/OFFEN.md.
function immoFehlt(was: string): never {
  throw new Error(was + " fehlt (siehe docs/SECRETS.md). Ohne diese " +
    "Angabe ginge eine Nachricht mit einer Adresse hinaus, die " +
    "niemandem gehoert \u2014 deshalb geht gar keine.");
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const portalUrl = Deno.env.get("PORTAL_URL") || immoFehlt("PORTAL_URL");

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) throw new Error("Nicht angemeldet.");
    const userId = userData.user.id;

    let eigentuemerId: string | null = null; let absenderName = "";
    const { data: person } = await supabase.from("eigentuemer_personen").select("eigentuemer_id, vorname, nachname").eq("user_id", userId).eq("aktiv", true).limit(1).maybeSingle();
    if (person) { eigentuemerId = person.eigentuemer_id; absenderName = [person.vorname, person.nachname].filter(Boolean).join(" "); }
    else {
      const { data: eig } = await supabase.from("eigentuemer").select("id, vorname, nachname, firma").eq("user_id", userId).limit(1).maybeSingle();
      if (eig) { eigentuemerId = eig.id; absenderName = eig.firma || [eig.vorname, eig.nachname].filter(Boolean).join(" "); }
    }
    if (!eigentuemerId) throw new Error("Kein verkn\u00fcpfter Eigent\u00fcmer-Zugang gefunden.");

    const { data: eigDaten } = await supabase.from("eigentuemer").select("vorname, nachname, firma, mandant_id").eq("id", eigentuemerId).maybeSingle();
    const eigName = eigDaten ? (eigDaten.firma || [eigDaten.vorname, eigDaten.nachname].filter(Boolean).join(" ") || absenderName || "Eigent\u00fcmer") : (absenderName || "Eigent\u00fcmer");

    const body = await req.json();
    const text = (body.nachricht || "").trim();
    const anhaenge = Array.isArray(body.anhaenge) ? body.anhaenge.slice(0, 50) : [];
    if (!text && anhaenge.length === 0) throw new Error("Nachricht ist leer.");
    if (text.length > 5000) throw new Error("Nachricht ist zu lang (max. 5000 Zeichen).");

    const empfaengerMap = new Map<string, string>();
    const apUserIds = new Set<string>();
    const { data: objekte } = await supabase.from("eigentuemer_objekte").select("ansprechpartner_id").eq("eigentuemer_id", eigentuemerId);
    const apIds = [...new Set((objekte || []).map(o => o.ansprechpartner_id).filter(Boolean))];
    if (apIds.length > 0) {
      const { data: aps } = await supabase.from("profiles").select("id, name, email").in("id", apIds);
      for (const p of aps || []) { if (p.email) empfaengerMap.set(p.email.toLowerCase(), p.name || ""); if (p.id) apUserIds.add(p.id); }
    }
    // Der Rundruf an "alle Chefs" traf die ganze Plattform: die Nachricht
    // eines Eigentuemers an SEINEN Makler landete in jedem Buero.
    const { data: chefs } = await supabase.from("profiles").select("id, name, email").eq("mandant_id", eigDaten?.mandant_id ?? "00000000-0000-0000-0000-000000000000").eq("role", "chef");
    for (const c of chefs || []) if (c.email) empfaengerMap.set(c.email.toLowerCase(), c.name || "");
    if (empfaengerMap.size === 0) throw new Error("Keine internen Empfaenger gefunden.");

    try {
      if (apUserIds.size > 0) {
        const rows = [...apUserIds].map(uid => ({
          zielgruppe: "makler", empfaenger_user_id: uid, eigentuemer_id: eigentuemerId,
          typ: "nachricht_vom_eigentuemer", titel: `Nachricht von ${eigName}`,
          text: (text || "(Dateianhang)").slice(0, 500),
        }));
        await supabase.from("aktivitaeten").insert(rows);
      } else {
        await supabase.from("aktivitaeten").insert({
          zielgruppe: "makler", eigentuemer_id: eigentuemerId,
          typ: "nachricht_vom_eigentuemer", titel: `Nachricht von ${eigName}`,
          text: (text || "(Dateianhang)").slice(0, 500),
        });
      }
    } catch (e) { console.warn("Aktivitaet fehlgeschlagen:", e); }

    try {
      await supabase.from("eigentuemer_nachrichten").insert({ eigentuemer_id: eigentuemerId, absender_typ: "eigentuemer", absender_user_id: userId, absender_name: absenderName || eigName, text: text || "(Dateianhang)", anhaenge });
    } catch (e) { console.warn("Chat-Eintrag fehlgeschlagen:", e); }

    // ---- Versand: Resend bevorzugt, sonst SMTP (SMTP_*-Secrets) ----
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromName = Deno.env.get("SMTP_FROM_NAME") || "Eigent\u00fcmer-Portal";
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || immoFehlt("SMTP_FROM_EMAIL");

    let transporter: any = null;
    if (!resendKey) {
      const host = Deno.env.get("SMTP_HOST"); const port = parseInt(Deno.env.get("SMTP_PORT") || "0", 10);
      const username = Deno.env.get("SMTP_USERNAME"); const password = Deno.env.get("SMTP_PASSWORD");
      if (!host || !port || !username || !password) throw new Error("Kein Versandweg: weder RESEND_API_KEY noch SMTP-Secrets konfiguriert.");
      transporter = nodemailer.createTransport({
        host, port, secure: port === 465,
        auth: { user: username, pass: password },
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

    const betreff = `Nachricht von Eigent\u00fcmer: ${eigName}`;
    const { htmlBody, textBody } = buildMail({ eigName, absenderName, text, portalUrl, anhaenge });

    let gesendet = 0;
    const fehler: string[] = [];
    for (const [email] of empfaengerMap) {
      try {
        await sende(email, betreff, textBody, htmlBody);
        gesendet++;
      } catch (e) {
        const m = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        console.error(`Versand-Fehler an ${email}:`, m);
        fehler.push(`${email}: ${m}`);
      }
    }

    if (gesendet === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Mailversand fehlgeschlagen: " + fehler.join(" | "), gespeichert: true }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, empfaenger_anzahl: gesendet, versandweg: resendKey ? "resend" : "smtp", teilfehler: fehler.length ? fehler : undefined }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function buildMail(opts: { eigName: string; absenderName: string; text: string; portalUrl: string; anhaenge: Array<{ name: string }> }) {
  const absenderZeile = opts.absenderName && opts.absenderName !== opts.eigName ? `${opts.absenderName} (${opts.eigName})` : opts.eigName;
  const textTeil = opts.text ? `<div style="margin:14px 0;padding:14px 18px;background:#f3edde;border-left:3px solid #c7a455;font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(opts.text)}</div>` : "";
  const anhHtml = opts.anhaenge.length ? `<p style="margin:14px 0 0;font-size:13px;color:#5a5440;">\ud83d\udcce ${opts.anhaenge.length} Datei(en) im Portal: ${opts.anhaenge.map(a => escapeHtml(a.name)).join(", ")}</p>` : "";
  const htmlBody = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1B2A47;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ee;"><tr><td align="center" style="padding:40px 20px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e0d6;">
      <tr><td style="background:#1B2A47;padding:28px 36px;border-bottom:3px solid #c7a455;"><div style="font-size:22px;font-weight:300;letter-spacing:0.25em;color:#ffffff;">MUSTERHAUS</div><div style="font-size:10px;color:#c7a455;letter-spacing:0.2em;margin-top:4px;font-weight:600;">INTERN \u2013 NACHRICHT VOM EIGENT\u00dcMER</div></td></tr>
      <tr><td style="padding:36px 36px 28px;"><h1 style="margin:0 0 16px;font-size:20px;font-weight:300;color:#1B2A47;line-height:1.3;">${escapeHtml(absenderZeile)} schreibt:</h1>${textTeil}${anhHtml}
        <p style="margin:26px 0 0;text-align:center;"><a href="${opts.portalUrl}" style="display:inline-block;background:#1B2A47;color:#ffffff;text-decoration:none;padding:13px 30px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Im Portal \u00f6ffnen</a></p></td></tr>
      <tr><td style="padding:20px 36px 26px;border-top:1px solid #e5e0d6;background:#faf8f3;"><p style="margin:0;font-size:11px;line-height:1.6;color:#8a8470;">Automatische interne Weiterleitung aus dem Eigent\u00fcmer-Portal.</p></td></tr>
    </table></td></tr></table></body></html>`;
  const textBody = `${absenderZeile} schreibt:\n\n${opts.text || "(Dateianhang)"}` + (opts.anhaenge.length ? `\n\n\ud83d\udcce ${opts.anhaenge.length} Datei(en): ${opts.anhaenge.map(a => a.name).join(", ")}` : "") + `\n\nIm Portal \u00f6ffnen: ${opts.portalUrl}\n`;
  return { htmlBody, textBody };
}
function escapeHtml(s: string): string { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
