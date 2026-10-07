// ============================================================================
// auth-mail — die Anmelde-Mails von Supabase, deutsch und im Namen der Firma
// ============================================================================
// Eigene Function des Forks (fork_88). Auftrag vom 07.10.2026: „Supabase
// verschickt Login- und Einladungs-Mails auf Englisch. Das muss an die
// jeweilige Firma angepasst werden, inklusive Logo."
//
// Supabase Auth kann den Versand an einen „Send Email Hook" abgeben: statt
// seiner eigenen (englischen, projektweiten) Vorlage ruft es diese Function
// mit Nutzer und Token. Wir bauen die Mail selbst — deutsch, mit Name, Logo
// und Farbe des Mandanten, abgeschickt ueber dessen Postfach (Resend) —
// und bestaetigen mit 200. Ohne Mandanten (Registrierung einer neuen Firma)
// geht die Mail neutral im Namen von immoOffice.
//
// Der Hook ist signiert (Standard Webhooks: webhook-id, webhook-timestamp,
// webhook-signature; Geheimnis AUTH_HOOK_SECRET aus den Function-Secrets).
// Ohne gueltige Signatur passiert nichts. Das IST die Absicherung dieser
// oeffentlichen Function: der Aufrufer ist Supabase Auth, niemand sonst.
//
// Einrichten: docs/AUTH_MAILS.md (Dashboard → Authentication → Hooks →
// Send Email → diese Function, Geheimnis kopieren → AUTH_HOOK_SECRET).
// Solange der Hook nicht aktiv ist, verschickt Supabase weiter seine
// Vorlage; die deutschen Rueckfall-Vorlagen fuer das Dashboard stehen
// ebenfalls in docs/AUTH_MAILS.md.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { dienst, mailen, absender, appAdresse, sicher } from "./bautraeger.ts";
(globalThis as any).__immoFunktion = "auth-mail";

const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const TOLERANZ_S = 5 * 60;

/** Standard-Webhooks-Signatur pruefen. Geheimnis: "v1,whsec_<base64>" oder nur der Base64-Teil. */
async function signaturGueltig(req: Request, body: string): Promise<boolean> {
  const geheim = (Deno.env.get("AUTH_HOOK_SECRET") || "").trim();
  if (!geheim) return false;
  const id = req.headers.get("webhook-id") || "", ts = req.headers.get("webhook-timestamp") || "", sig = req.headers.get("webhook-signature") || "";
  if (!id || !ts || !sig) return false;
  const alter = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(alter) || alter > TOLERANZ_S) return false;
  const roh = geheim.split(",").pop()!.replace(/^whsec_/, "");
  const schluessel = Uint8Array.from(atob(roh), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", schluessel, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const erwartet = btoa(String.fromCharCode(...mac));
  return sig.split(" ").some((teil) => { const [v, s] = teil.split(","); return v === "v1" && s && zeitkonstantGleich(s, erwartet); });
}
function zeitkonstantGleich(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

type Marke = { name: string; logo: string | null; farbe: string; mandant: string | null; abs: { name: string; mail: string; antwort_an: string } | null };

/** Firma des Nutzers: ueber profiles → firma_stammdaten. Neue Firma (Registrierung): aus den Metadaten, neutral. */
async function marke(db: any, user: any): Promise<Marke> {
  let mandant: string | null = user?.app_metadata?.mandant_id || user?.user_metadata?.mandant_id || null;
  if (!mandant && user?.id) { const { data: p } = await db.from("profiles").select("mandant_id").eq("id", user.id).maybeSingle(); mandant = p?.mandant_id || null; }
  if (!mandant && user?.id) { const { data: e } = await db.from("eigentuemer").select("mandant_id").eq("auth_user_id", user.id).maybeSingle().then((r: any) => r, () => ({ data: null })); mandant = e?.mandant_id || null; }
  if (mandant) {
    const { data: f } = await db.from("firma_stammdaten").select("firma_name, marken_name, logo_pfad, ci_primaer").eq("mandant_id", mandant).eq("aktiv", true).order("sortierung", { ascending: true }).limit(1).maybeSingle();
    let logo: string | null = null;
    if (f?.logo_pfad) { const { data: s } = await db.storage.from("branding-assets").createSignedUrl(f.logo_pfad, 60 * 60 * 24 * 30); logo = s?.signedUrl || null; }
    const farbe = /^#[0-9a-f]{6}$/i.test(String(f?.ci_primaer || "")) ? String(f.ci_primaer) : "#1B2A47";
    return { name: String(f?.marken_name || f?.firma_name || "").trim() || "Ihr Immobilienbüro", logo, farbe, mandant, abs: await absender(db, mandant) };
  }
  const firma = String(user?.user_metadata?.firma || "").trim();
  const from = String(Deno.env.get("SMTP_FROM_EMAIL") || "").trim();
  return { name: firma ? `immoOffice für ${firma}` : "immoOffice", logo: null, farbe: "#1B2A47", mandant: null,
    abs: /@/.test(from) && !/example$/i.test(from.split("@")[1] || "") ? { name: "immoOffice", mail: from, antwort_an: from } : null };
}

const TEXTE: Record<string, { betreff: string; titel: string; text: string; knopf: string }> = {
  signup: { betreff: "Bitte bestätigen Sie Ihre E-Mail-Adresse", titel: "Willkommen!", text: "Schön, dass Sie dabei sind. Bitte bestätigen Sie Ihre E-Mail-Adresse, damit wir Ihren Zugang freischalten können.", knopf: "E-Mail-Adresse bestätigen" },
  invite: { betreff: "Sie wurden eingeladen", titel: "Ihre Einladung", text: "Sie wurden eingeladen, den Kundenbereich zu nutzen. Über den Knopf legen Sie Ihr Passwort fest und melden sich an.", knopf: "Einladung annehmen" },
  magiclink: { betreff: "Ihr Anmeldelink", titel: "Anmelden ohne Passwort", text: "Mit diesem Link melden Sie sich einmalig an. Er ist nur kurze Zeit gültig und nur für Sie bestimmt.", knopf: "Jetzt anmelden" },
  recovery: { betreff: "Passwort zurücksetzen", titel: "Neues Passwort", text: "Sie haben ein neues Passwort angefordert. Über den Knopf legen Sie es fest. Wenn Sie das nicht waren, können Sie diese Mail ignorieren — Ihr Zugang bleibt unverändert.", knopf: "Passwort festlegen" },
  email_change: { betreff: "Bitte bestätigen Sie Ihre neue E-Mail-Adresse", titel: "E-Mail-Adresse ändern", text: "Bitte bestätigen Sie, dass diese Adresse künftig zu Ihrem Zugang gehört.", knopf: "Neue Adresse bestätigen" },
  reauthentication: { betreff: "Ihr Bestätigungscode", titel: "Bestätigung", text: "Zur Bestätigung geben Sie bitte den folgenden Code ein.", knopf: "" },
};

function html(m: Marke, t: { titel: string; text: string; knopf: string }, link: string | null, code: string | null, hinweis: string) {
  const kopf = m.logo ? `<img src="${m.logo}" alt="${sicher(m.name)}" style="max-height:48px;max-width:220px;display:block">` : `<div style="font-size:18px;font-weight:700;color:#fff">${sicher(m.name)}</div>`;
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f4f5f7;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1B2A47">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E6E8EB">
<tr><td style="background:${m.farbe};padding:18px 24px">${kopf}</td></tr>
<tr><td style="padding:26px 24px 8px"><div style="font-size:20px;font-weight:700;margin-bottom:10px">${sicher(t.titel)}</div><div style="font-size:15px;line-height:1.6">${sicher(t.text)}</div></td></tr>
${link ? `<tr><td style="padding:14px 24px"><a href="${link}" style="display:inline-block;background:${m.farbe};color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;font-size:15px">${sicher(t.knopf)}</a></td></tr>` : ""}
${code ? `<tr><td style="padding:8px 24px"><div style="font-size:13px;color:#7A828C">Ihr Code (falls der Knopf nicht funktioniert):</div><div style="font-size:26px;letter-spacing:6px;font-weight:700;margin-top:4px">${sicher(code)}</div></td></tr>` : ""}
${link ? `<tr><td style="padding:4px 24px 16px;font-size:12px;color:#7A828C;word-break:break-all">Falls der Knopf nicht funktioniert, kopieren Sie diesen Link in die Adresszeile Ihres Browsers:<br>${link}</td></tr>` : ""}
<tr><td style="padding:14px 24px 22px;border-top:1px solid #E6E8EB;font-size:12px;color:#7A828C;line-height:1.5">${sicher(hinweis)}<br>Diese Nachricht wurde automatisch von ${sicher(m.name)} versendet.</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return antwort({ error: { http_code: 405, message: "Nur POST." } }, 405);
  const body = await req.text();
  if (!(await signaturGueltig(req, body))) return antwort({ error: { http_code: 401, message: "Ungültige Signatur." } }, 401);
  const db = dienst();
  try {
    const daten = JSON.parse(body);
    const user = daten.user || {}, ed = daten.email_data || {};
    const an = String(user.email || "");
    if (!/@/.test(an)) return antwort({ error: { http_code: 400, message: "Keine Empfängeradresse." } }, 400);
    const art = String(ed.email_action_type || "magiclink");
    const t = TEXTE[art] || TEXTE.magiclink;
    const m = await marke(db, user);
    const basis = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const ziel = String(ed.redirect_to || appAdresse() || ed.site_url || "");
    const tokenHash = art === "email_change" && ed.token_hash_new ? String(ed.token_hash_new) : String(ed.token_hash || "");
    const link = art === "reauthentication" || !tokenHash ? null : `${basis}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(art)}&redirect_to=${encodeURIComponent(ziel)}`;
    const code = ed.token ? String(ed.token) : null;
    const hinweis = art === "signup" ? "Sie erhalten diese Mail, weil mit Ihrer Adresse ein Zugang angelegt wurde. War das nicht Sie, ignorieren Sie die Nachricht." :
      art === "invite" ? `Eingeladen von ${sicher(m.name)}${user?.user_metadata?.invited_by ? " (" + sicher(user.user_metadata.invited_by) + ")" : ""}.` :
      "Der Link ist nur kurze Zeit gültig und kann nur einmal benutzt werden.";
    const anrede = [user?.user_metadata?.vorname, user?.user_metadata?.nachname].filter(Boolean).join(" ") || String(user?.user_metadata?.name || "").trim();
    const text = [`Guten Tag${anrede ? " " + anrede : ""},`, "", t.text, "", link ? `${t.knopf}: ${link}` : "", code ? `Code: ${code}` : "", "", hinweis, "", m.name].filter((z) => z !== null).join("\n");
    const betreff = `${t.betreff} — ${m.name}`;
    const r = await mailen(db, m.mandant || "", an, anrede || null, betreff, text, { html: html(m, Object.assign({}, t, { text: `Guten Tag${anrede ? " " + sicher(anrede) : ""}, ${t.text}` }), link, code, hinweis), absender: m.abs });
    if (!r.ok) {
      console.error("auth-mail:", r.grund);
      return antwort({ error: { http_code: 500, message: `Mail nicht gesendet: ${r.grund}` } }, 500);
    }
    return antwort({});
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("auth-mail:", grund);
    return antwort({ error: { http_code: 500, message: grund } }, 500);
  }
});
