// ============================================================================
// upload-benachrichtigung-versenden (v9)
// ============================================================================
// Benachrichtigt das MAKLERBUERO, wenn ein EIGENTUEMER Dokumente hochlaedt
// (Queue upload_benachrichtigungen, Cron alle 5 Minuten, gebuendelt).
// NEU v9: Versand ueber Resend (HTTP-API), wenn RESEND_API_KEY gesetzt ist
// — kein SMTP-Login bei All-Inkl mehr. Ohne Key: Fallback SMTP (denomailer).
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_VERSUCHE = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const portalUrl = Deno.env.get("PORTAL_URL") || "https://immooffice.example";

    const { data: queue, error: queueErr } = await supabase
      .from("upload_benachrichtigungen")
      .select("*")
      .is("versendet_am", null)
      .lte("bereit_ab", new Date().toISOString())
      .lt("versuche", MAX_VERSUCHE)
      .order("created_at", { ascending: true })
      .limit(50);

    if (queueErr) {
      console.error("Queue-Lesen fehlgeschlagen:", queueErr);
      return jsonResponse({ ok: false, error: queueErr.message }, 500);
    }
    if (!queue || queue.length === 0) {
      return jsonResponse({ ok: true, verarbeitet: 0, info: "Queue leer oder noch nichts faellig." });
    }

    console.log(`Verarbeite ${queue.length} Upload-Benachrichtigungen.`);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    let smtp: SMTPClient | null = null;
    if (!resendKey) {
      smtp = await buildSmtpClient();
      if (!smtp) {
        const meldung = "Kein Versandweg: weder RESEND_API_KEY noch SMTP-Secrets konfiguriert.";
        console.error(meldung);
        for (const e of queue) {
          await supabase.from("upload_benachrichtigungen")
            .update({ versuche: (e.versuche || 0) + 1, fehler: meldung })
            .eq("id", e.id);
        }
        return jsonResponse({ ok: false, error: meldung }, 500);
      }
    }

    const fromName = Deno.env.get("SMTP_FROM_NAME") || "Eigent\u00fcmer-Portal";
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || "info@immooffice.example";

    const sende = async (to: string, subject: string, textBody: string, htmlBody: string) => {
      if (resendKey) {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: [to],
            reply_to: fromEmail,
            subject,
            text: textBody,
            html: htmlBody,
          }),
        });
        if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
        return;
      }
      await smtp!.send({
        from: `${fromName} <${fromEmail}>`,
        to,
        subject,
        content: textBody,
        html: htmlBody,
      });
    };

    const { data: chefs } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("role", "chef");

    let verschickt = 0, fehlgeschlagen = 0;

    for (const eintrag of queue) {
      try {
        const { data: eig } = await supabase
          .from("eigentuemer")
          .select("anrede, vorname, nachname, firma")
          .eq("id", eintrag.eigentuemer_id)
          .maybeSingle();
        const eigName = eig
          ? (eig.firma || [eig.vorname, eig.nachname].filter(Boolean).join(" ") || "Unbekannter Eigent\u00fcmer")
          : "Unbekannter Eigent\u00fcmer";

        const empfaengerMap = new Map<string, string>();
        if (eintrag.ansprechpartner_id) {
          const { data: ap } = await supabase
            .from("profiles")
            .select("name, email")
            .eq("id", eintrag.ansprechpartner_id)
            .maybeSingle();
          if (ap?.email) empfaengerMap.set(ap.email.toLowerCase(), ap.name || "");
        }
        for (const c of chefs || []) {
          if (c.email) empfaengerMap.set(c.email.toLowerCase(), c.name || "");
        }
        if (empfaengerMap.size === 0) throw new Error("Keine Empfaenger gefunden (kein Ansprechpartner, kein Chef-Profil).");

        const { data: dokumente } = await supabase
          .from("eigentuemer_dokumente")
          .select("name, kategorie, created_at")
          .eq("eigentuemer_id", eintrag.eigentuemer_id)
          .eq("hochgeladen_von_typ", "eigentuemer")
          .gte("created_at", eintrag.created_at)
          .order("created_at", { ascending: false })
          .limit(30);

        const anzahl = dokumente?.length || eintrag.upload_anzahl || 1;
        const { betreff, htmlBody, textBody } = buildMail({ eigName, anzahl, dokumente: dokumente || [], portalUrl });

        for (const [email] of empfaengerMap) {
          await sende(email, betreff, textBody, htmlBody);
          console.log(`Upload-Benachrichtigung an ${email} (${eigName}, ${anzahl} Dok., ${resendKey ? "resend" : "smtp"}).`);
        }

        await supabase.from("upload_benachrichtigungen")
          .update({ versendet_am: new Date().toISOString(), fehler: null })
          .eq("id", eintrag.id);
        verschickt++;
      } catch (e) {
        const meldung = e instanceof Error ? e.message : String(e);
        console.error(`Eintrag ${eintrag.id} fehlgeschlagen:`, meldung);
        await supabase.from("upload_benachrichtigungen")
          .update({ versuche: (eintrag.versuche || 0) + 1, fehler: meldung.substring(0, 500) })
          .eq("id", eintrag.id);
        fehlgeschlagen++;
      }
    }

    if (smtp) { try { await smtp.close(); } catch (_) { /* egal */ } }
    return jsonResponse({ ok: true, verarbeitet: queue.length, verschickt, fehlgeschlagen, versandweg: resendKey ? "resend" : "smtp" });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("Top-level error:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 500);
  }
});

async function buildSmtpClient(): Promise<SMTPClient | null> {
  const host = Deno.env.get("SMTP_HOST");
  const port = parseInt(Deno.env.get("SMTP_PORT") || "0", 10);
  const username = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  const fromEmail = Deno.env.get("SMTP_FROM_EMAIL");
  if (!host || !port || !username || !password || !fromEmail) return null;
  return new SMTPClient({
    connection: { hostname: host, port, tls: port === 465, auth: { username, password } },
  });
}

function buildMail(opts: {
  eigName: string;
  anzahl: number;
  dokumente: Array<{ name: string; kategorie: string }>;
  portalUrl: string;
}): { betreff: string; htmlBody: string; textBody: string } {
  const kategorieLabels: Record<string, string> = {
    grundbuch: "Grundbuch", energieausweis: "Energieausweis",
    teilungserklaerung: "Teilungserkl\u00e4rung", baulasten: "Baulasten",
    altlasten: "Altlasten", versicherung: "Versicherung",
    mieterliste: "Mieterliste", lageplan: "Lageplan",
    wartung: "Wartung", sonstiges: "Sonstiges",
  };
  const istEines = opts.anzahl === 1;
  const betreff = istEines
    ? `Eigent\u00fcmer-Upload: ${opts.eigName} hat ein Dokument hochgeladen`
    : `Eigent\u00fcmer-Upload: ${opts.eigName} hat ${opts.anzahl} Dokumente hochgeladen`;

  const docsHtml = opts.dokumente.length === 0 ? "" : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;background:#faf8f3;border:1px solid #e5e0d6;">
      ${opts.dokumente.map(d => `
        <tr><td style="padding:10px 14px;border-bottom:1px solid #efeae0;">
          <div style="font-size:13px;color:#263159;font-weight:600;">${escapeHtml(d.name)}</div>
          <div style="font-size:11px;color:#8a8470;letter-spacing:0.05em;margin-top:2px;">${escapeHtml(kategorieLabels[d.kategorie] || d.kategorie || "")}</div>
        </td></tr>`).join("")}
    </table>`;

  const docsText = opts.dokumente.length === 0 ? "" :
    "\n\nDokumente:\n" + opts.dokumente.map(d => `  - ${d.name} (${kategorieLabels[d.kategorie] || d.kategorie || ""})`).join("\n") + "\n";

  const htmlBody = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#263159;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ee;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e0d6;">
        <tr><td style="background:#263159;padding:28px 36px;border-bottom:3px solid #c7a455;">
          <div style="font-size:22px;font-weight:300;letter-spacing:0.25em;color:#ffffff;">MUSTERHAUS</div>
          <div style="font-size:10px;color:#c7a455;letter-spacing:0.2em;margin-top:4px;font-weight:600;">INTERN \u2013 EIGENT\u00dcMER-UPLOAD</div>
        </td></tr>
        <tr><td style="padding:36px 36px 28px;">
          <h1 style="margin:0 0 18px;font-size:20px;font-weight:300;color:#263159;line-height:1.3;">
            ${escapeHtml(opts.eigName)} hat ${istEines ? "ein neues Dokument" : `${opts.anzahl} neue Dokumente`} hochgeladen
          </h1>
          ${docsHtml}
          <p style="margin:24px 0;text-align:center;">
            <a href="${opts.portalUrl}" style="display:inline-block;background:#263159;color:#ffffff;text-decoration:none;padding:13px 30px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">
              Im Portal ansehen
            </a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 36px 26px;border-top:1px solid #e5e0d6;background:#faf8f3;">
          <p style="margin:0;font-size:11px;line-height:1.6;color:#8a8470;">
            Automatische interne Benachrichtigung aus dem Eigent\u00fcmer-Portal.
            Mehrere Uploads innerhalb weniger Minuten werden zu einer Mail geb\u00fcndelt.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textBody = `${opts.eigName} hat ${istEines ? "ein neues Dokument" : `${opts.anzahl} neue Dokumente`} im Eigent\u00fcmer-Portal hochgeladen.${docsText}\nIm Portal ansehen: ${opts.portalUrl}\n`;

  return { betreff, htmlBody, textBody };
}

function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
