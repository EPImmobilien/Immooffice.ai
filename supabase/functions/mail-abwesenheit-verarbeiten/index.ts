// ============================================================================
// Edge Function: mail-abwesenheit-verarbeiten (v3)
// ============================================================================
// Verschickt Abwesenheitsnotizen für Postfächer mit aktiver Abwesenheit.
// v2: antwortet NUR echten Menschen — keine Portale (ImmoScout, Immowelt, Kleinanzeigen,
//     onpreo ...), keine Automaten (noreply, notification, alerts, Rechnungs-/Support-Systeme,
//     Google/Apple/Qonto-Benachrichtigungen), keine eigenen Adressen. Als Mensch gilt, wer im
//     Adressbuch steht, wem wir schon einmal geschrieben haben, wer von einem privaten
//     Mailanbieter schreibt oder dessen Mail eine persönliche Anrede/Signatur trägt.
// v3 (26.09.2026): Signatur genau einmal — die Grußformel des Abwesenheitstextes wird durch die
//     Postfach-Signatur ersetzt (mail-signatur.ts); ohne Signatur bleibt die Grußformel.
// Regeln wie v1: nur letzte 24 h, Ordner posteingang, 1 Antwort je Absender+Postfach je 7 Tage,
// keine Antworten auf andere automatische Antworten. Versand über Resend, Log in mail_versendet.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { mitSignatur } from "./mail-signatur.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const SKIP_ABSENDER = /(no-?reply|noreply|donotreply|do-?not-?reply|mailer-daemon|postmaster|bounce|newsletter|notification|notify|alert|system|automat|invoic|billing|rechnung|payment|service@|support@|kundenservice|hello@|team@|news@|marketing|digest|update@|updates@|feedback@|security|accounts\.google|apple\.com|qonto|resend|netlify|supabase|github|microsoft|office365|onpreo|immobilienscout|immoscout|immowelt|immonet|kleinanzeigen|ohne-makler|immomio|neubaukompass|canva|dropbox|linkedin|facebook|instagram|meta\.com|xing|amazon|paypal|stripe|dhl|hermes|ups\.com|telekom|vodafone|1und1|ionos|strato|hetzner|mailchimp|hubspot|salesforce|calendly|zoom|teams|webex)/i;
const SKIP_BETREFF = /^\s*(automatische antwort|automatic reply|auto-?reply|autoreply|out of office|abwesenheit|wg: ref\.-nr|anfrage zu ihrem objekt|infoanfrage|kontaktanfrage|eigentümer-kontakt|importbericht|rechnung|invoice|zahlungserinnerung|ihre bestellung|your order|password|passwort|sicherheitswarnung|verify|bestätigen sie)/i;
const EIGENE = /@immooffice.example\.(de|com)$/i;
const PRIVAT = /@(gmail\.com|googlemail\.com|web\.de|gmx\.(de|net|at|ch)|t-online\.de|yahoo\.(de|com)|icloud\.com|me\.com|outlook\.(de|com)|hotmail\.(de|com)|live\.(de|com)|freenet\.de|posteo\.de|mail\.de|aol\.(de|com)|arcor\.de|online\.de|magenta\.de|protonmail\.com|proton\.me|mailbox\.org)$/i;
const ANREDE = /(hallo|guten tag|guten morgen|sehr geehrte|liebe[rs]? |moin|hi |hey )/i;
const GRUSS = /(mit freundlichen grüßen|viele grüße|beste grüße|liebe grüße|herzliche grüße|freundliche grüße|schöne grüße|mfg|lg\b|vg\b|kind regards|best regards)/i;

function htmlZuText(html: string) { return String(html || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY nicht gesetzt" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const trocken = !!body.trocken;
    const jetzt = new Date();

    const { data: postfaecher, error: pfErr } = await admin.from("mail_postfaecher").select("id, benutzer_id, absender_name, email_adresse, signatur, abwesend_aktiv, abwesend_von, abwesend_bis, abwesend_betreff, abwesend_text, mandant_id").eq("aktiv", true).eq("abwesend_aktiv", true);
    if (pfErr) throw pfErr;
    const aktive = (postfaecher || []).filter((pf) => pf.abwesend_text && pf.abwesend_text.trim() && !(pf.abwesend_von && new Date(pf.abwesend_von) > jetzt) && !(pf.abwesend_bis && new Date(pf.abwesend_bis) < jetzt));

    const ergebnisse: any[] = [];
    for (const pf of aktive) {
      const { data: mails } = await admin.from("mail_eingang").select("id, absender_email, absender_name, betreff, text, html, created_at, anfrage_status, rechnung_status").eq("postfach_id", pf.id).eq("ordner", "posteingang").gte("created_at", new Date(jetzt.getTime() - 24 * 3600 * 1000).toISOString()).order("created_at", { ascending: false }).limit(100);
      let gesendet = 0, fehler = 0; const uebersprungen: string[] = []; const proLauf = new Set<string>();
      for (const m of mails || []) {
        const abs = (m.absender_email || "").trim().toLowerCase();
        if (!abs || !abs.includes("@") || abs === (pf.email_adresse || "").toLowerCase()) continue;
        if (proLauf.has(abs)) continue; proLauf.add(abs);
        let grund = "";
        if (EIGENE.test(abs)) grund = "eigene Adresse";
        else if (SKIP_ABSENDER.test(abs)) grund = "Automat/Portal";
        else if (SKIP_BETREFF.test(m.betreff || "")) grund = "Betreff";
        else if (m.anfrage_status === "verarbeitet" || m.rechnung_status === "weitergeleitet") grund = "Portalanfrage/Rechnung";
        if (!grund) {
          // Ist das ein Mensch?
          const { data: k } = await admin.from("kontakte").select("id").eq("mandant_id", pf.mandant_id).ilike("email", abs).limit(1);
          let mensch = !!(k && k.length);
          if (!mensch) { const { data: v } = await admin.from("mail_versendet").select("id").eq("mandant_id", pf.mandant_id).ilike("empfaenger_email", `%${abs}%`).eq("status", "gesendet").limit(1); mensch = !!(v && v.length); }
          if (!mensch && PRIVAT.test(abs)) mensch = true;
          if (!mensch) { const t = (m.text && m.text.trim()) ? m.text : htmlZuText(m.html || ""); const kopf = t.slice(0, 400); mensch = ANREDE.test(kopf) && GRUSS.test(t) && t.length < 6000; }
          if (!mensch) grund = "kein persönlicher Absender";
        }
        if (grund) { uebersprungen.push(`${abs} (${grund})`); continue; }
        const { data: log } = await admin.from("mail_abwesenheit_log").select("id").eq("postfach_id", pf.id).eq("absender_email", abs).gte("gesendet_am", new Date(jetzt.getTime() - 7 * 24 * 3600 * 1000).toISOString()).limit(1);
        if (log && log.length > 0) continue;
        const betreff = pf.abwesend_betreff && pf.abwesend_betreff.trim() ? pf.abwesend_betreff.trim() : `Automatische Antwort: ${m.betreff || "Ihre Nachricht"}`;
        // v3: Grußformel des Abwesenheitstextes durch die Postfach-Signatur ersetzen (genau einmal)
        const text = mitSignatur(pf.abwesend_text.trim(), pf.signatur);
        if (trocken) { gesendet++; uebersprungen.push(`WÜRDE SENDEN an ${abs}`); continue; }
        try {
          const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: `${pf.absender_name} <${pf.email_adresse}>`, to: [m.absender_name ? `${m.absender_name} <${abs}>` : abs], reply_to: pf.email_adresse, subject: betreff, text, headers: { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" } }) });
          if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
          await admin.from("mail_abwesenheit_log").insert({ postfach_id: pf.id, absender_email: abs });
          await admin.from("mail_versendet").insert({ postfach_id: pf.id, versendet_von_user_id: pf.benutzer_id, absender_email: pf.email_adresse, absender_name: pf.absender_name, empfaenger_email: abs, empfaenger_name: m.absender_name || null, betreff, body_text: text, status: "gesendet", smtp_message_id: "abwesenheitsnotiz" });
          gesendet++;
        } catch (e) { console.error("Abwesenheits-Versand fehlgeschlagen:", pf.email_adresse, "->", abs, e instanceof Error ? e.message : String(e)); fehler++; }
        if (gesendet >= 20) break;
      }
      ergebnisse.push({ postfach: pf.email_adresse, gesendet, fehler, uebersprungen: uebersprungen.slice(0, 40) });
    }
    return new Response(JSON.stringify({ ok: true, aktive_postfaecher: aktive.length, ergebnisse }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Unerwarteter Fehler:", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
