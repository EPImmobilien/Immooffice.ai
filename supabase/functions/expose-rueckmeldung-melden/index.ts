// ============================================================================
// expose-rueckmeldung-melden
// ============================================================================
// Benachrichtigt das Maklerbuero per E-Mail, wenn ein Eigentuemer ein zur
// Freigabe vorgelegtes Dokument (i. d. R. das Expose) FREIGIBT oder mit
// ANMERKUNGEN beantwortet (optional inkl. hochgeladener Antwort-PDF).
//
// Input:  { dokument_id: uuid, art: "freigegeben"|"anmerkungen",
//           anmerkungen?: string, anhang_name?: string }
// Output: { ok: true, empfaenger_anzahl } | { ok: false, error }
//
// Sicherheit: verify_jwt=true; der Aufrufer muss der Eigentuemer des
// Dokuments sein (Mehrpersonen-Modell + Legacy-Fallback).
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const portalUrl = Deno.env.get("PORTAL_URL") || immoFehlt("PORTAL_URL");

    // ---- Aufrufer verifizieren ----
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) throw new Error("Nicht angemeldet.");
    const userId = userData.user.id;

    let eigentuemerId: string | null = null;
    const { data: person } = await supabase
      .from("eigentuemer_personen")
      .select("eigentuemer_id")
      .eq("user_id", userId).eq("aktiv", true).limit(1).maybeSingle();
    if (person) eigentuemerId = person.eigentuemer_id;
    if (!eigentuemerId) {
      const { data: eig } = await supabase
        .from("eigentuemer").select("id").eq("user_id", userId).limit(1).maybeSingle();
      if (eig) eigentuemerId = eig.id;
    }
    if (!eigentuemerId) throw new Error("Kein verknüpfter Eigentümer-Zugang gefunden.");

    // ---- Input ----
    const { dokument_id, art, anmerkungen, anhang_name } = await req.json();
    if (!dokument_id) throw new Error("dokument_id fehlt.");
    if (!["freigegeben", "anmerkungen"].includes(art)) throw new Error("Ungültige Art.");

    // ---- Dokument laden + Eigentuemerschaft pruefen ----
    const { data: dok } = await supabase
      .from("eigentuemer_dokumente")
      .select("id, name, kategorie, eigentuemer_id")
      .eq("id", dokument_id).maybeSingle();
    if (!dok) throw new Error("Dokument nicht gefunden.");
    if (dok.eigentuemer_id !== eigentuemerId) throw new Error("Keine Berechtigung für dieses Dokument.");

    const { data: eigDaten } = await supabase
      .from("eigentuemer").select("vorname, nachname, firma, mandant_id").eq("id", eigentuemerId).maybeSingle();
    const eigName = eigDaten
      ? (eigDaten.firma || [eigDaten.vorname, eigDaten.nachname].filter(Boolean).join(" ") || "Eigentümer")
      : "Eigentümer";

    // ---- Empfaenger: Ansprechpartner + Chefs ----
    const empfaengerMap = new Map<string, string>();
    const { data: objekte } = await supabase
      .from("eigentuemer_objekte").select("ansprechpartner_id").eq("eigentuemer_id", eigentuemerId);
    const apIds = [...new Set((objekte || []).map(o => o.ansprechpartner_id).filter(Boolean))];
    if (apIds.length > 0) {
      const { data: aps } = await supabase.from("profiles").select("name, email").in("id", apIds);
      for (const p of aps || []) if (p.email) empfaengerMap.set(p.email.toLowerCase(), p.name || "");
    }
    const { data: chefs } = await supabase.from("profiles").select("name, email").eq("mandant_id", eigDaten?.mandant_id ?? "00000000-0000-0000-0000-000000000000").eq("role", "chef");
    for (const c of chefs || []) if (c.email) empfaengerMap.set(c.email.toLowerCase(), c.name || "");
    if (empfaengerMap.size === 0) throw new Error("Keine internen Empfaenger gefunden.");

    // ---- SMTP ----
    const host = Deno.env.get("SMTP_HOST");
    const port = parseInt(Deno.env.get("SMTP_PORT") || "0", 10);
    const username = Deno.env.get("SMTP_USERNAME");
    const password = Deno.env.get("SMTP_PASSWORD");
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL");
    if (!host || !port || !username || !password || !fromEmail) throw new Error("SMTP nicht konfiguriert.");
    const smtp = new SMTPClient({
      connection: { hostname: host, port, tls: port === 465, auth: { username, password } },
    });

    const istFreigabe = art === "freigegeben";
    const betreff = istFreigabe
      ? `\u2713 Freigabe erteilt: ${dok.name} (${eigName})`
      : `Anmerkungen erhalten: ${dok.name} (${eigName})`;

    const anmerkText = (anmerkungen || "").trim();
    const { htmlBody, textBody } = buildMail({
      eigName, dokName: dok.name, istFreigabe, anmerkText,
      anhangName: (anhang_name || "").trim(), portalUrl,
    });

    for (const [email] of empfaengerMap) {
      await smtp.send({
        from: `${Deno.env.get("SMTP_FROM_NAME") || "Eigent\u00fcmer-Portal"} <${fromEmail}>`,
        to: email,
        subject: betreff,
        content: textBody,
        html: htmlBody,
      });
      console.log(`Rückmeldungs-Mail (${art}) an ${email} — ${dok.name} / ${eigName}.`);
    }
    try { await smtp.close(); } catch (_) { /* egal */ }

    return new Response(JSON.stringify({ ok: true, empfaenger_anzahl: empfaengerMap.size }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("Fehler:", meldung);
    return new Response(JSON.stringify({ ok: false, error: meldung }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildMail(opts: {
  eigName: string; dokName: string; istFreigabe: boolean;
  anmerkText: string; anhangName: string; portalUrl: string;
}) {
  const statusZeile = opts.istFreigabe
    ? `${opts.eigName} hat das Dokument verbindlich freigegeben.`
    : `${opts.eigName} hat Anmerkungen zum Dokument hinterlassen.`;

  const anmerkHtml = opts.anmerkText
    ? `<div style="margin:14px 0;padding:14px 18px;background:#f3edde;border-left:3px solid #c7a455;font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(opts.anmerkText)}</div>`
    : "";
  const anhangHtml = opts.anhangName
    ? `<p style="margin:10px 0 0;font-size:13px;line-height:1.6;">\ud83d\udcce Antwort-PDF hochgeladen: <strong>${escapeHtml(opts.anhangName)}</strong> (im Portal unter den Eigent\u00fcmer-Dokumenten)</p>`
    : "";

  const htmlBody = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1B2A47;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ee;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e0d6;">
        <tr><td style="background:#1B2A47;padding:28px 36px;border-bottom:3px solid ${opts.istFreigabe ? "#2da14b" : "#c7a455"};">
          <div style="font-size:22px;font-weight:300;letter-spacing:0.25em;color:#ffffff;">MUSTERHAUS</div>
          <div style="font-size:10px;color:#c7a455;letter-spacing:0.2em;margin-top:4px;font-weight:600;">INTERN \u2013 ${opts.istFreigabe ? "FREIGABE ERTEILT" : "ANMERKUNGEN VOM EIGENT\u00dcMER"}</div>
        </td></tr>
        <tr><td style="padding:36px 36px 28px;">
          <h1 style="margin:0 0 10px;font-size:20px;font-weight:300;color:#1B2A47;line-height:1.3;">
            ${opts.istFreigabe ? "\u2713 " : ""}${escapeHtml(opts.dokName)}
          </h1>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.7;">${escapeHtml(statusZeile)}</p>
          ${anmerkHtml}
          ${anhangHtml}
          <p style="margin:26px 0 0;text-align:center;">
            <a href="${opts.portalUrl}" style="display:inline-block;background:#1B2A47;color:#ffffff;text-decoration:none;padding:13px 30px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">
              Im Portal \u00f6ffnen
            </a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 36px 26px;border-top:1px solid #e5e0d6;background:#faf8f3;">
          <p style="margin:0;font-size:11px;line-height:1.6;color:#8a8470;">
            Automatische interne Benachrichtigung aus dem Eigent\u00fcmer-Portal.
            ${opts.istFreigabe ? "Die Freigabe ist mit Zeitstempel und Nutzerkennung dokumentiert." : ""}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textBody = `${statusZeile}\n\nDokument: ${opts.dokName}` +
    (opts.anmerkText ? `\n\nAnmerkungen:\n${opts.anmerkText}` : "") +
    (opts.anhangName ? `\n\nAntwort-PDF: ${opts.anhangName}` : "") +
    `\n\nIm Portal \u00f6ffnen: ${opts.portalUrl}\n`;

  return { htmlBody, textBody };
}

function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}