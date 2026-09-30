// ============================================================================
// projekt-nachricht-antwort (v3)
//   Makler-Antwort im Kunden-Chat (ImmoOffice Portal, verify_jwt=true).
//   POST { zugang_id, text, absender_name? }
//   v2: Versand ueber Resend (HTTP-API), wenn RESEND_API_KEY gesetzt ist
//   — kein SMTP-Login bei All-Inkl mehr. Ohne Key: Fallback All-Inkl-SMTP.
//   v3 (26.09.2026): Signatur genau einmal — die Grußformel des Textes wird durch die
//   Postfach-Signatur ersetzt (mail-signatur.ts); ohne Signatur bleibt die Grußformel.
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
import { mitSignatur } from "./mail-signatur.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const STANDARD_MAIL = "info@immooffice.example";

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

// Versand: Resend (HTTPS, feste Infrastruktur) bevorzugt, sonst All-Inkl-SMTP
async function sendeMail(postfach: any, an: string, anName: string, betreff: string, text: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  // Der Anzeigename im Absender: erst der des Postfachs, dann der
  // Firmenname des Mandanten. Ein verdrahteter Name waere bei jedem
  // Mandanten ausser einem falsch.
  const absName = postfach?.absender_name || postfach?.firma_name || "";
  const absMail = postfach?.email_adresse || STANDARD_MAIL;
  const finalText = mitSignatur(text, postfach?.signatur);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Nicht angemeldet.");

    const body = await req.json().catch(() => ({}));
    const zugangId = (body.zugang_id || "").toString().trim();
    await immoMandantSichern(req, [["projekt_zugaenge", zugangId]]);
    const text = (body.text || "").toString().trim().slice(0, 3000);
    if (!zugangId || !text) throw new Error("zugang_id und text sind Pflicht.");

    const { data: z } = await admin.from("projekt_zugaenge")
      .select("id, projekt_id, anzeigename, email, aktiv, ansprechpartner_id, mandant_id")
      .eq("id", zugangId).maybeSingle();
    if (!z) throw new Error("Kunden-Zugang nicht gefunden.");

    const { data: profil } = await admin.from("profiles").select("name").eq("id", user.id).maybeSingle();
    const firmaName = await immoFirmenName(admin, z.mandant_id);
    const absenderName = (body.absender_name || "").toString().trim().slice(0, 120) || profil?.name || firmaName;

    const { data: n, error: insErr } = await admin.from("projekt_nachrichten").insert({
      projekt_id: z.projekt_id, zugang_id: z.id, richtung: "makler", text,
      absender_user_id: user.id, absender_name: absenderName,
    }).select("id, richtung, text, absender_name, created_at").single();
    if (insErr) throw new Error(insErr.message);

    await admin.from("projekt_nachrichten").update({ gelesen: true })
      .eq("zugang_id", z.id).eq("richtung", "kunde").eq("gelesen", false);

    try {
      const { data: projekt } = await admin.from("projekte").select("name, oeffentliche_url").eq("id", z.projekt_id).maybeSingle();
      const { data: postfaecher } = await admin.from("mail_postfaecher")
        .select("*").eq("mandant_id", z.mandant_id).eq("aktiv", true)
        .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false });
      // Die Kette endete auf (postfaecher || [])[0] — "irgendeines". Mit der
      // Einschraenkung oben ist "irgendeines" jetzt wenigstens eines des
      // eigenen Mandanten. Der Griff nach STANDARD_MAIL entfaellt: das war
      // die feste Adresse des einen Hauses und gehoert keinem Mandanten.
      const postfachRoh = (postfaecher || []).find((p: any) => p.benutzer_id === user.id && p.standard_zum_senden)
        || (postfaecher || []).find((p: any) => p.benutzer_id === user.id)
        || (postfaecher || []).find((p: any) => z.ansprechpartner_id && p.benutzer_id === z.ansprechpartner_id)
        || (postfaecher || []).find((p: any) => p.standard_zum_senden)
        || (postfaecher || [])[0] || null;
      const postfach = postfachRoh ? { ...postfachRoh, firma_name: firmaName } : null;
      if (z.aktiv && z.email) {
        const loginUrl = (projekt?.oeffentliche_url || "").replace(/\/+$/, "");
        await sendeMail(postfach, z.email, z.anzeigename || "",
          `Neue Nachricht in Ihrem Kundenbereich – ${projekt?.name || "Ihr Projekt"}`,
          `Guten Tag ${z.anzeigename || ""},\n\n${absenderName} hat Ihnen in Ihrem Kundenbereich geantwortet:\n\n„${text}“\n\n`
          + (loginUrl ? `Zum Antworten melden Sie sich einfach an:\n${loginUrl}\n\n` : "")
          + `Für Rückfragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\n${absenderName}${firmaName ? "\n" + firmaName : ""}`);
      }
    } catch (_mailErr) { /* Mail darf die Antwort nicht blockieren */ }

    return jsonResponse({ ok: true, nachricht: n });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
