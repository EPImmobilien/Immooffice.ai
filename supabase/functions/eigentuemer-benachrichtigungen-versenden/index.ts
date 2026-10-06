// ============================================================================
// eigentuemer-benachrichtigungen-versenden (v17)
// ============================================================================
// Cron alle 5 Minuten: verarbeitet eigentuemer_benachrichtigung_queue und
// schickt Sammel-Mails an Eigentuemer (Debounce 2 Min, max. 3 Versuche).
// NEU v17: Versand ueber Resend (HTTP-API), wenn RESEND_API_KEY gesetzt ist
// — kein SMTP-Login bei All-Inkl mehr (IP-Sperren). Ohne Key: Fallback auf
// den bisherigen SMTP-Weg (SMTP_HOST/PORT/USERNAME/PASSWORD, denomailer).
// Absender bleibt SMTP_FROM_NAME <SMTP_FROM_EMAIL>.
// ============================================================================

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

const DEBOUNCE_MINUTEN = 2;
const MAX_VERSUCHE = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const portalUrl = Deno.env.get("PORTAL_URL") || immoFehlt("PORTAL_URL");
    const debounceGrenze = new Date(Date.now() - DEBOUNCE_MINUTEN * 60 * 1000).toISOString();

    const { data: queue, error: queueErr } = await supabase
      .from("eigentuemer_benachrichtigung_queue")
      .select("*")
      .is("versendet_am", null)
      .lte("letztes_ereignis_am", debounceGrenze)
      .lt("versuche", MAX_VERSUCHE)
      .order("erstes_ereignis_am", { ascending: true })
      .limit(50);

    if (queueErr) {
      console.error("Queue-Lesen fehlgeschlagen:", queueErr);
      return jsonResponse({ ok: false, error: queueErr.message }, 500);
    }

    if (!queue || queue.length === 0) {
      return jsonResponse({ ok: true, verarbeitet: 0, info: "Queue leer oder noch nichts faellig." });
    }

    console.log(`Verarbeite ${queue.length} Queue-Eintraege.`);

    // Versandweg vorbereiten: Resend bevorzugt, sonst SMTP (denomailer)
    const resendKey = Deno.env.get("RESEND_API_KEY");
    let smtp: SMTPClient | null = null;
    if (!resendKey) {
      smtp = await buildSmtpClient();
      if (!smtp) {
        const meldung = "Kein Versandweg: weder RESEND_API_KEY noch SMTP-Secrets konfiguriert.";
        console.error(meldung);
        for (const e of queue) {
          await supabase
            .from("eigentuemer_benachrichtigung_queue")
            .update({ versuche: e.versuche + 1, fehler: meldung })
            .eq("id", e.id);
        }
        return jsonResponse({ ok: false, error: meldung }, 500);
      }
    }

    const fromName = Deno.env.get("SMTP_FROM_NAME") || "Eigent\u00fcmer-Portal";
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || immoFehlt("SMTP_FROM_EMAIL");

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

    let verschickt = 0;
    let fehlgeschlagen = 0;

    for (const eintrag of queue) {
      try {
        const { data: personen, error: pErr } = await supabase
          .from("eigentuemer_personen")
          .select("id, vorname, nachname, anrede, email, erhaelt_emails, aktiv")
          .eq("eigentuemer_id", eintrag.eigentuemer_id)
          .eq("erhaelt_emails", true)
          .eq("aktiv", true);

        let empfaenger: Array<{ email: string; anrede: string; vorname: string; nachname: string }> = [];
        if (!pErr && personen && personen.length > 0) {
          empfaenger = personen
            .filter(p => p.email && p.email.includes("@"))
            .map(p => ({
              email: p.email,
              anrede: p.anrede || "",
              vorname: p.vorname || "",
              nachname: p.nachname || "",
            }));
        }

        if (empfaenger.length === 0) {
          const { data: eig } = await supabase
            .from("eigentuemer")
            .select("email, anrede, vorname, nachname")
            .eq("id", eintrag.eigentuemer_id)
            .maybeSingle();
          if (eig?.email && eig.email.includes("@")) {
            empfaenger = [{
              email: eig.email,
              anrede: eig.anrede || "",
              vorname: eig.vorname || "",
              nachname: eig.nachname || "",
            }];
          }
        }

        if (empfaenger.length === 0) {
          throw new Error("Keine Empfaenger mit erhaelt_emails=true gefunden.");
        }

        const { data: dokumente } = await supabase
          .from("eigentuemer_dokumente")
          .select("id, name, kategorie, nachricht, created_at")
          .eq("eigentuemer_id", eintrag.eigentuemer_id)
          .eq("hochgeladen_von_typ", "makler")
          .gte("created_at", eintrag.erstes_ereignis_am)
          .order("created_at", { ascending: false })
          .limit(20);

        // Die Warteschlange traegt keinen Mandanten; er haengt am
        // Eigentuemer, fuer den die Sammelmail entsteht.
        const mandantDesEintrags = (await supabase.from("eigentuemer")
          .select("mandant_id").eq("id", eintrag.eigentuemer_id).maybeSingle()).data?.mandant_id ?? null;
        const anzahl = dokumente?.length ?? eintrag.anzahl_dokumente;

        for (const e of empfaenger) {
          const { betreff, htmlBody, textBody } = buildMail({
            anrede: e.anrede,
            vorname: e.vorname,
            nachname: e.nachname,
            anzahl,
            dokumente: dokumente || [],
            portalUrl,
            firmaName: await immoFirmenName(supabase, mandantDesEintrags),
          });
          await sende(e.email, betreff, textBody, htmlBody);
          console.log(`Mail an ${e.email} verschickt (${anzahl} Dokument${anzahl === 1 ? "" : "e"}, ${resendKey ? "resend" : "smtp"}).`);
        }

        await supabase
          .from("eigentuemer_benachrichtigung_queue")
          .update({ versendet_am: new Date().toISOString(), fehler: null })
          .eq("id", eintrag.id);

        verschickt++;
      } catch (e) {
        const meldung = e instanceof Error ? e.message : String(e);
        console.error(`Eintrag ${eintrag.id} fehlgeschlagen:`, meldung);
        await supabase
          .from("eigentuemer_benachrichtigung_queue")
          .update({ versuche: eintrag.versuche + 1, fehler: meldung.substring(0, 500) })
          .eq("id", eintrag.id);
        fehlgeschlagen++;
      }
    }

    if (smtp) { try { await smtp.close(); } catch (_) { /* egal */ } }

    return jsonResponse({
      ok: true,
      verarbeitet: queue.length,
      verschickt,
      fehlgeschlagen,
      versandweg: resendKey ? "resend" : "smtp",
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("Top-level error:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 500);
  }
});

// ----------------------------------------------------------------------------
async function buildSmtpClient(): Promise<SMTPClient | null> {
  const host = Deno.env.get("SMTP_HOST");
  const port = parseInt(Deno.env.get("SMTP_PORT") || "0", 10);
  const username = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");
  const fromEmail = Deno.env.get("SMTP_FROM_EMAIL");
  if (!host || !port || !username || !password || !fromEmail) return null;

  const tls = port === 465;
  return new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls,
      auth: { username, password },
    },
  });
}

// ----------------------------------------------------------------------------
function buildMail(opts: {
  anrede: string;
  vorname: string;
  nachname: string;
  anzahl: number;
  dokumente: Array<{ name: string; kategorie: string; nachricht?: string | null }>;
  portalUrl: string;
  firmaName: string;
}): { betreff: string; htmlBody: string; textBody: string } {
  const name = [opts.vorname, opts.nachname].filter(Boolean).join(" ");
  const begruessung = opts.anrede
    ? `${opts.anrede} ${opts.nachname || name}`
    : (name ? `${name}` : "Sehr geehrte Damen und Herren");

  const istEines = opts.anzahl === 1;
  const betreff = istEines
    ? "Neues Dokument in Ihrem Eigent\u00fcmer-Portal"
    : `${opts.anzahl} neue Dokumente in Ihrem Eigent\u00fcmer-Portal`;

  const kategorieLabels: Record<string, string> = {
    grundbuch: "Grundbuch",
    energieausweis: "Energieausweis",
    teilungserklaerung: "Teilungserkl\u00e4rung",
    baulasten: "Baulasten",
    altlasten: "Altlasten",
    versicherung: "Versicherung",
    mieterliste: "Mieterliste",
    lageplan: "Lageplan",
    wartung: "Wartung",
    sonstiges: "Sonstiges",
  };

  const docsHtml = opts.dokumente.length === 0 ? "" : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;background:#faf8f3;border:1px solid #e5e0d6;">
      ${opts.dokumente.map(d => `
        <tr><td style="padding:10px 14px;border-bottom:1px solid #efeae0;">
          <div style="font-size:13px;color:#263159;font-weight:600;">${escapeHtml(d.name)}</div>
          <div style="font-size:11px;color:#8a8470;letter-spacing:0.05em;margin-top:2px;">${escapeHtml(kategorieLabels[d.kategorie] || d.kategorie)}</div>
          ${d.nachricht ? `<div style="font-size:13px;color:#4a4434;font-style:italic;margin-top:8px;padding:8px 12px;background:#f3edde;border-left:3px solid #c7a455;line-height:1.6;white-space:pre-wrap;">${escapeHtml(d.nachricht)}</div>` : ""}
        </td></tr>
      `).join("")}
    </table>
  `;

  const docsText = opts.dokumente.length === 0 ? "" :
    "\n\nNeue Dokumente:\n" +
    opts.dokumente.map(d =>
      `  - ${d.name} (${kategorieLabels[d.kategorie] || d.kategorie})` +
      (d.nachricht ? `\n    Nachricht: ${d.nachricht}` : "")
    ).join("\n") +
    "\n";

  const htmlBody = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#263159;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ee;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e0d6;">
        <tr><td style="background:#263159;padding:32px 36px;border-bottom:3px solid #c7a455;">
          <div style="font-size:22px;font-weight:300;letter-spacing:0.25em;color:#ffffff;">MUSTERHAUS</div>
          <div style="font-size:10px;color:#c7a455;letter-spacing:0.2em;margin-top:4px;font-weight:600;">EIGENT\u00dcMER-PORTAL</div>
        </td></tr>
        <tr><td style="padding:40px 36px 30px;">
          <h1 style="margin:0 0 18px;font-size:22px;font-weight:300;color:#263159;line-height:1.3;">
            ${istEines ? "Ein neues Dokument f\u00fcr Sie" : `${opts.anzahl} neue Dokumente f\u00fcr Sie`}
          </h1>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.7;">
            Guten Tag ${escapeHtml(begruessung)},
          </p>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.7;">
            wir haben ${istEines ? "ein neues Dokument" : `${opts.anzahl} neue Dokumente`} in Ihrem
            pers\u00f6nlichen Eigent\u00fcmer-Portal hinterlegt. Bitte sehen Sie sich
            ${istEines ? "das Dokument" : "die Unterlagen"} bei Gelegenheit an.
          </p>
          ${docsHtml}
          <p style="margin:24px 0 14px;font-size:14px;line-height:1.7;">
            \u00dcber den folgenden Link gelangen Sie direkt zu Ihrem Portal:
          </p>
          <p style="margin:24px 0;text-align:center;">
            <a href="${opts.portalUrl}" style="display:inline-block;background:#263159;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;border-radius:0;">
              Zum Eigent\u00fcmer-Portal
            </a>
          </p>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8a8470;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
            <span style="word-break:break-all;">${opts.portalUrl}</span>
          </p>
        </td></tr>
        <tr><td style="padding:24px 36px 30px;border-top:1px solid #e5e0d6;background:#faf8f3;">
          <p style="margin:0;font-size:11px;line-height:1.6;color:#8a8470;">
            Diese Nachricht wurde automatisch erstellt. Sie erhalten sie, weil wir
            Unterlagen in Ihrem Eigent\u00fcmer-Portal hinterlegt haben.
            Wenn Sie Fragen haben, antworten Sie einfach auf diese E-Mail.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textBody = `Guten Tag ${begruessung},

wir haben ${istEines ? "ein neues Dokument" : `${opts.anzahl} neue Dokumente`} in Ihrem pers\u00f6nlichen Eigent\u00fcmer-Portal hinterlegt.${docsText}

Sie erreichen Ihr Portal hier:
${opts.portalUrl}

Mit freundlichen Gr\u00fc\u00dfen\n${opts.firmaName || ""}
`;

  return { betreff, htmlBody, textBody };
}

// ----------------------------------------------------------------------------
function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
