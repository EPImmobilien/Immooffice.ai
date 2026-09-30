// einladung-mail.ts v2 – gemeinsamer Baustein fuer eigentuemer-einladen (v25), eigentuemer-link-erneut-senden (v26),
// eigentuemer-einladung-nachfassen (v2) und eigentuemer-zugang-anfordern (v1).
// v2: Die Mail nennt die Gueltigkeit (24 Stunden, Email OTP Expiration 86400 seit 26.09.2026) und den Selbsthilfe-Weg <Portal>#zugang fuer einen neuen Link.
// Erzeugt den Anmeldelink selbst (auth.admin.generateLink) und verschickt ihn ueber Resend mit unserem Absender.
// Jeder Versand bekommt einen Beleg in mail_versendet (status gesendet/fehler). Ohne RESEND_API_KEY: Rueckfall auf
// die Supabase-Auth-Mail (inviteUserByEmail bzw. signInWithOtp), versandweg "supabase-auth".
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function anredeZeile(anrede: string, titel: string, vorname: string, nachname: string) {
  const name = [titel, nachname].filter(Boolean).join(" ") || [vorname, nachname].filter(Boolean).join(" ");
  if (anrede === "Herr") return `Sehr geehrter Herr ${name}`;
  if (anrede === "Frau") return `Sehr geehrte Frau ${name}`;
  return name ? `Guten Tag ${[vorname, nachname].filter(Boolean).join(" ")}` : "Sehr geehrte Damen und Herren";
}

/** Adresse der Selbsthilfe „Neuen Anmeldelink anfordern“ (Anmeldeseite des Portals mit #zugang). */
export function zugangUrlAus(redirectTo: string) {
  return String(redirectTo || "https://immooffice.example/").replace(/[#?].*$/, "").replace(/\/?$/, "/") + "#zugang";
}

export function baueEinladungsMail(o: { anrede: string; link: string; makler: string; telefon: string; firma: string; web: string; erneut: boolean; zugangUrl?: string }) {
  const zugangUrl = o.zugangUrl || "https://immooffice.example/#zugang";
  const betreff = o.erneut ? "Ihr Zugang zum Eigentümer-Portal – neuer Anmeldelink" : "Ihr persönlicher Zugang zum Eigentümer-Portal";
  const einleitung = o.erneut
    ? "Sie haben einen persönlichen Zugang zum Eigentümer-Portal – hier ist Ihr neuer Anmeldelink."
    : "wir haben für Sie einen persönlichen Zugang zum Eigentümer-Portal eingerichtet.";
  const text = `${o.anrede},\n\n${einleitung}\n\nIm Portal sehen Sie den Stand der Vermarktung Ihrer Immobilie, Unterlagen und Nachrichten von uns – und können uns dort direkt schreiben oder Dokumente hochladen.\n\nZugang einrichten:\n${o.link}\n\nDer Link ist aus Sicherheitsgründen 24 Stunden gültig. Ist er abgelaufen, fordern Sie hier mit einem Klick einen neuen an:\n${zugangUrl}\nOder antworten Sie einfach auf diese E-Mail – wir schicken Ihnen einen neuen.\n\nMit freundlichen Grüßen\n${o.makler}\n${o.firma}${o.telefon ? "\nTelefon " + o.telefon : ""}${o.web ? "\n" + o.web : ""}`;
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#263159;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ee;"><tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e0d6;">
<tr><td style="background:#263159;padding:32px 36px;border-bottom:3px solid #c7a455;"><div style="font-size:22px;font-weight:300;letter-spacing:0.25em;color:#ffffff;">MUSTERHAUS</div><div style="font-size:10px;color:#c7a455;letter-spacing:0.2em;margin-top:4px;font-weight:600;">EIGENTÜMER-PORTAL</div></td></tr>
<tr><td style="padding:40px 36px 30px;">
<p style="margin:0 0 14px;font-size:14px;line-height:1.7;">${esc(o.anrede)},</p>
<p style="margin:0 0 14px;font-size:14px;line-height:1.7;">${esc(einleitung)}</p>
<p style="margin:0 0 14px;font-size:14px;line-height:1.7;">Im Portal sehen Sie den Stand der Vermarktung Ihrer Immobilie, Unterlagen und Nachrichten von uns – und können uns dort direkt schreiben oder Dokumente hochladen.</p>
<p style="margin:28px 0;text-align:center;"><a href="${esc(o.link)}" style="display:inline-block;background:#263159;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Zugang einrichten</a></p>
<p style="margin:0 0 14px;font-size:12px;line-height:1.6;color:#8a8470;">Falls der Knopf nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br><span style="word-break:break-all;">${esc(o.link)}</span></p>
<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#8a8470;">Der Link ist aus Sicherheitsgründen <strong>24 Stunden</strong> gültig. Ist er abgelaufen, fordern Sie <a href="${esc(zugangUrl)}" style="color:#263159;">hier mit einem Klick einen neuen an</a> – oder antworten Sie einfach auf diese E-Mail.</p>
<p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#5a5440;">Mit freundlichen Grüßen<br><strong>${esc(o.makler)}</strong><br>${esc(o.firma)}${o.telefon ? "<br>Telefon " + esc(o.telefon) : ""}${o.web ? "<br>" + esc(o.web) : ""}</p>
</td></tr>
<tr><td style="padding:24px 36px 30px;border-top:1px solid #e5e0d6;background:#faf8f3;"><p style="margin:0;font-size:11px;line-height:1.6;color:#8a8470;">Sie erhalten diese E-Mail, weil wir Sie als Eigentümer in unser Kundenportal eingeladen haben. Bei Fragen antworten Sie einfach auf diese Nachricht.</p></td></tr>
</table></td></tr></table></body></html>`;
  return { betreff, text, html };
}

export type VersandErgebnis = { versandweg: "resend" | "supabase-auth"; userId: string | null; resendId: string | null; methode: "invite" | "magiclink" | "otp" };

/** Schickt eine Einladungs- bzw. Anmeldelink-Mail. Wirft bei Fehlern (Beleg mit status fehler wird vorher geschrieben). */
export async function einladungVersenden(admin: SupabaseClient, mandant: string, o: {
  email: string; userId: string | null; vorname: string; nachname: string; anrede: string; titel: string;
  redirectTo: string; makler: { id?: string | null; name?: string | null; email?: string | null; telefon?: string | null } | null;
  erneut: boolean;
}): Promise<VersandErgebnis> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const resendKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  // Diese Zeile bestimmt, welcher Firmenname unter der Einladung steht und
  // an wen der Eigentuemer antwortet. Ohne Mandantenfilter war es der
  // erstbeste aktive Standort der ganzen Plattform — die Einladung des
  // einen Maklers trug Namen, Adresse und Netzauftritt des anderen.
  //
  // Die Pruefung hat diese vier Kopien lange nicht gesehen: sie nennen
  // SERVICE_ROLE nirgends, sondern bekommen den fertigen Client als
  // Parameter. Seit dem 30.09.2026 sucht sie auch danach.
  const { data: firmaRow } = await admin.from("firma_stammdaten").select("firma_name, email, web")
    .eq("mandant_id", mandant).eq("aktiv", true).order("sortierung").limit(1).maybeSingle();
  const firma = firmaRow?.firma_name || (Deno.env.get("SMTP_FROM_NAME") || "ImmoOffice");
  const fromEmail = (Deno.env.get("SMTP_FROM_EMAIL") || "").trim();
  const email = o.email.trim().toLowerCase();
  const maklerName = o.makler?.name || firma;
  const empfaengerName = [o.vorname, o.nachname].filter(Boolean).join(" ");
  const meta = { role_hint: "eigentuemer", vorname: o.vorname, nachname: o.nachname, invited_by: maklerName };
  let userId = o.userId;

  if (!resendKey) {
    // Rueckfall: Supabase-Auth-Mail (wie bisher)
    if (!userId) {
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: o.redirectTo, data: meta });
      if (invErr) throw new Error("Einladung verschicken fehlgeschlagen: " + invErr.message);
      return { versandweg: "supabase-auth", userId: inv?.user?.id || null, resendId: null, methode: "invite" };
    }
    if (!anonKey) throw new Error("SUPABASE_ANON_KEY fehlt für den OTP-Versand.");
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: otpErr } = await anon.auth.signInWithOtp({ email, options: { emailRedirectTo: o.redirectTo, shouldCreateUser: false } });
    if (otpErr) throw new Error("Magic-Link verschicken fehlgeschlagen: " + otpErr.message);
    return { versandweg: "supabase-auth", userId, resendId: null, methode: "otp" };
  }

  const anrede = anredeZeile(o.anrede, o.titel, o.vorname, o.nachname);
  const mail = { betreff: "", text: "", html: "" };
  try {
    let link = ""; let methode: "invite" | "magiclink" = "magiclink";
    if (!userId) {
      const { data: gl, error: glErr } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: o.redirectTo, data: meta } });
      if (glErr) throw new Error("Anmeldelink (Einladung) konnte nicht erzeugt werden: " + glErr.message);
      link = gl?.properties?.action_link || ""; userId = gl?.user?.id || null; methode = "invite";
    } else {
      const { data: gl, error: glErr } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: o.redirectTo } });
      if (glErr) throw new Error("Anmeldelink konnte nicht erzeugt werden: " + glErr.message);
      link = gl?.properties?.action_link || "";
    }
    if (!link) throw new Error("Kein Anmeldelink erzeugt.");
    Object.assign(mail, baueEinladungsMail({ anrede, link, makler: maklerName, telefon: o.makler?.telefon || "", firma, web: firmaRow?.web || "", erneut: o.erneut, zugangUrl: zugangUrlAus(o.redirectTo) }));
    // Die Absenderadresse bleibt die der Plattform: ein Mailanbieter
    // verschickt nur von einer Domain, die ihm nachgewiesen ist (SPF/DKIM).
    // Die ANTWORT soll aber beim Makler landen, nicht bei der Plattform.
    // Die alte Bedingung prüfte auf die Platzhalterdomain und traf deshalb
    // nie zu — jede Antwort ging ins Leere. Jetzt: der Makler, sonst die
    // Adresse seines Hauses, sonst die Plattform.
    const replyTo = (o.makler?.email || firmaRow?.email || fromEmail || "").trim();
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${firma} <${fromEmail}>`, to: [email], reply_to: replyTo, subject: mail.betreff, text: mail.text, html: mail.html }) });
    const rTxt = await r.text();
    if (!r.ok) throw new Error(`Mail-Versand (Resend ${r.status}): ${rTxt.slice(0, 300)}`);
    let resendId = ""; try { resendId = JSON.parse(rTxt).id || ""; } catch (_) { /* egal */ }
    await admin.from("mail_versendet").insert({ absender_email: fromEmail, absender_name: firma, empfaenger_email: email, empfaenger_name: empfaengerName, betreff: mail.betreff, body_text: mail.text, body_html: mail.html, status: "gesendet", gesendet_am: new Date().toISOString(), automatisch: false, versendet_von_user_id: o.makler?.id || null, smtp_message_id: resendId || null });
    return { versandweg: "resend", userId, resendId: resendId || null, methode };
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await admin.from("mail_versendet").insert({ absender_email: fromEmail, absender_name: firma, empfaenger_email: email, empfaenger_name: empfaengerName, betreff: mail.betreff || (o.erneut ? "Ihr Zugang zum Eigentümer-Portal – neuer Anmeldelink" : "Ihr persönlicher Zugang zum Eigentümer-Portal"), status: "fehler", fehler_text: msg.slice(0, 500), gesendet_am: new Date().toISOString(), automatisch: false, versendet_von_user_id: o.makler?.id || null }).then(() => {}, () => {});
    throw e;
  }
}
