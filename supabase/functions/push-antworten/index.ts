// ============================================================================
// push-antworten — Antwort auf eine Mail direkt aus der iOS-Mitteilung
// ----------------------------------------------------------------------------
// Die App ruft diese Function auf, wenn der Nutzer in der Mitteilung „Antworten“
// waehlt und einen Text eingibt. Sie hat dabei keine Portal-Sitzung; als Ausweis
// dient der APNs-Geraete-Token, den nur dieses Geraet und push_geraete kennen.
//
// Body { geraet_token, mail_id, text }
//   1) Geraet muss in push_geraete aktiv sein → Profil.
//   2) Die Mail muss in einem Postfach dieses Profils liegen (Chef: jedes Postfach).
//   3) Antwort geht an den Absender der Mail: Betreff „AW: …“, Text + Signatur
//      des Postfachs + zitierte Ursprungsmail; In-Reply-To/References gesetzt.
//   4) Versand wie mail-senden: Resend, sonst SMTP des Postfachs. Eintrag in
//      mail_versendet (Gesendet-Ordner), Mail wird als gelesen markiert.
// Secrets: RESEND_API_KEY, MAIL_SECRET_KEY (SMTP-Passwort entschluesseln).
// Quelle im Repo: portal/push/push-antworten.ts
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function entschluessele(verschluesseltesBase64: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = verschluesseltesBase64.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungueltiges verschluesseltes Passwort-Format");
  const iv = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext));
}

function zitat(mail: any): string {
  const wann = mail.gesendet_am
    ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(mail.gesendet_am))
    : "";
  const wer = [mail.absender_name, mail.absender_email ? `<${mail.absender_email}>` : ""].filter(Boolean).join(" ");
  let text = String(mail.text || "").trim();
  if (!text && mail.html) {
    text = String(mail.html).replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  }
  const zeilen = text.replace(/\r/g, "").split("\n").map((z) => z.replace(/[ \t]+$/, ""));
  const gekuerzt = zeilen.slice(0, 80).join("\n").slice(0, 4000);
  return `Am ${wann}${wann ? " " : ""}schrieb ${wer || "der Absender"}:\n` + gekuerzt.split("\n").map((z) => "> " + z).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.geraet_token || "").trim().toLowerCase();
    const mailId = String(body.mail_id || "").trim();
    const eingabe = String(body.text || "").replace(/\r/g, "").trim();
    if (!/^[0-9a-f]{64}$/.test(token)) return antwort({ ok: false, fehler: "Gerät nicht erkannt." }, 401);
    if (!/^[0-9a-f-]{36}$/i.test(mailId)) return antwort({ ok: false, fehler: "Mail-Kennung fehlt." }, 400);
    if (!eingabe) return antwort({ ok: false, fehler: "Die Antwort ist leer." }, 400);
    if (eingabe.length > 4000) return antwort({ ok: false, fehler: "Die Antwort ist zu lang (max. 4000 Zeichen)." }, 400);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const { data: geraet } = await db.from("push_geraete").select("id, profile_id, aktiv").eq("token", token).maybeSingle();
    if (!geraet || !geraet.aktiv) return antwort({ ok: false, fehler: "Gerät nicht registriert — bitte in der App antworten." }, 401);
    const { data: profil } = await db.from("profiles").select("id, name, role, mandant_id").eq("id", geraet.profile_id).maybeSingle();
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
    if (!profil.mandant_id) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);

    // Die Mail muss dem Mandanten des Geraets gehoeren. Ohne diese Zeile
    // reichte die Rolle "chef", um jede Mail jedes Maklers zu beantworten —
    // ueber dessen Postfach, mit dessen Absenderadresse, und der zitierte
    // Ursprungstext ging dabei gleich mit hinaus.
    const { data: mail } = await db.from("mail_eingang")
      .select("id, postfach_id, absender_email, absender_name, betreff, message_id, text, html, gesendet_am")
      .eq("mandant_id", profil.mandant_id).eq("id", mailId).maybeSingle();
    if (!mail) return antwort({ ok: false, fehler: "Mail nicht gefunden." }, 404);
    if (!mail.absender_email) return antwort({ ok: false, fehler: "Die Mail hat keine Absenderadresse." }, 400);

    const { data: pf } = await db.from("mail_postfaecher").select("*").eq("mandant_id", profil.mandant_id).eq("id", mail.postfach_id).maybeSingle();
    if (!pf) return antwort({ ok: false, fehler: "Postfach nicht gefunden." }, 404);
    if (pf.benutzer_id !== profil.id && profil.role !== "chef") return antwort({ ok: false, fehler: "Keine Berechtigung für dieses Postfach." }, 403);
    if (!pf.aktiv) return antwort({ ok: false, fehler: "Postfach ist deaktiviert." }, 400);

    const betreffAlt = String(mail.betreff || "").trim();
    const betreff = /^(re|aw|wg|fwd?)\s*:/i.test(betreffAlt) ? betreffAlt : `AW: ${betreffAlt || "(ohne Betreff)"}`;
    const sig = String(pf.signatur || "").trim();
    const text = [eingabe, sig ? `--\n${sig}` : "", zitat(mail)].filter(Boolean).join("\n\n");
    const an = String(mail.absender_email).trim();
    const anName = String(mail.absender_name || "").trim() || null;
    const inReplyTo = mail.message_id ? (String(mail.message_id).startsWith("<") ? String(mail.message_id) : `<${mail.message_id}>`) : null;

    let versandWeg = "", messageId: string | null = null, letzterFehler = "";
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${pf.absender_name} <${pf.email_adresse}>`,
            to: [anName ? `${anName} <${an}>` : an],
            reply_to: pf.email_adresse,
            subject: betreff, text,
            headers: inReplyTo ? { "In-Reply-To": inReplyTo, "References": inReplyTo } : undefined,
          }),
        });
        if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const rj = await r.json().catch(() => ({}));
        messageId = rj?.id ? `resend:${rj.id}` : "resend"; versandWeg = "resend";
      } catch (e) { letzterFehler = e instanceof Error ? e.message : String(e); }
    }
    if (!versandWeg) {
      if (!pf.smtp_passwort_verschluesselt) throw new Error(letzterFehler ? `Versand fehlgeschlagen (${letzterFehler}) und kein SMTP-Passwort hinterlegt` : "Postfach hat kein Passwort hinterlegt");
      const passwort = await entschluessele(pf.smtp_passwort_verschluesselt);
      const transporter = nodemailer.createTransport({
        host: pf.smtp_server, port: Number(pf.smtp_port),
        secure: Number(pf.smtp_port) === 465 || pf.smtp_security === "ssl",
        auth: { user: pf.smtp_user, pass: passwort }, tls: { rejectUnauthorized: false },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
      });
      const r = await transporter.sendMail({
        from: `"${pf.absender_name}" <${pf.email_adresse}>`, to: anName ? `"${anName}" <${an}>` : an,
        subject: betreff, text, inReplyTo: inReplyTo || undefined, references: inReplyTo || undefined,
      });
      messageId = r?.messageId || null; versandWeg = "smtp";
    }

    const { data: log } = await db.from("mail_versendet").insert({
      mandant_id: profil.mandant_id, postfach_id: pf.id, versendet_von_user_id: profil.id, absender_email: pf.email_adresse, absender_name: pf.absender_name,
      empfaenger_email: an, empfaenger_name: anName, betreff, body_text: text, status: "gesendet", smtp_message_id: messageId,
    }).select("id").single();
    await db.from("mail_eingang").update({ gelesen: true }).eq("mandant_id", profil.mandant_id).eq("id", mail.id);

    return antwort({ ok: true, an, an_name: anName, betreff, versandweg: versandWeg, id: log?.id || null });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
