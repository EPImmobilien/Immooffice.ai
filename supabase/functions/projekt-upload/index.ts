// ============================================================================
// projekt-upload (v2)
//   Rueckkanal des Projekt-Kundenbereichs (Session-basiert). Aktionen:
//   - upload_url:   { session, dateiname, content_type, groesse }
//   - registrieren: { session, pfad, dateiname, content_type, groesse }
//   - ereignis:     { session, typ, details }
//   v2: Team-Mail geht an den zugeordneten Ansprechpartner des Kunden
//   (projekt_zugaenge.ansprechpartner_id -> profiles.email), sonst an das
//   allgemeine info@-Postfach; Absender ebenfalls info@ (Spaltenfix
//   email_adresse statt email).
//   Deploy mit verify_jwt=false — Auth laeuft ueber den Session-Token.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const MAX_GROESSE = 25 * 1024 * 1024; // 25 MB
const STANDARD_MAIL = "info@immooffice.example";
const ERLAUBTE_EREIGNISSE = ["datei_geoeffnet", "update_gelesen"];

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

async function sendeTeamMail(admin: ReturnType<typeof createClient>, an: string, betreff: string, text: string) {
  try {
    let { data: postfach } = await admin.from("mail_postfaecher")
      .select("*").eq("email_adresse", STANDARD_MAIL).eq("aktiv", true).limit(1).maybeSingle();
    if (!postfach) {
      const { data: alle } = await admin.from("mail_postfaecher")
        .select("*").eq("aktiv", true)
        .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);
      postfach = (alle || [])[0] || null;
    }
    if (!postfach) { console.warn("Team-Mail: kein Postfach gefunden"); return; }
    const passwort = await entschluessele(postfach.smtp_passwort_verschluesselt);
    const transporter = nodemailer.createTransport({
      host: postfach.smtp_server, port: Number(postfach.smtp_port),
      secure: Number(postfach.smtp_port) === 465 || postfach.smtp_security === "ssl",
      auth: { user: postfach.smtp_user, pass: passwort },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    });
    await transporter.sendMail({
      from: `"${postfach.absender_name}" <${postfach.email_adresse}>`,
      to: an, subject: betreff, text,
    });
  } catch (e) {
    console.error("Team-Mail fehlgeschlagen:", e);
  }
}

async function teamEmpfaenger(admin: ReturnType<typeof createClient>, ansprechpartnerId: string | null): Promise<string> {
  if (ansprechpartnerId) {
    const { data: p } = await admin.from("profiles").select("email").eq("id", ansprechpartnerId).maybeSingle();
    if (p?.email) return p.email;
  }
  return STANDARD_MAIL;
}

function bereinigeDateiname(name: string): string {
  return (name || "datei").replace(/[^A-Za-z0-9\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df._-]+/g, "_").slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").toString();
    const session = (body.session || "").toString().trim();
    if (!session) throw new Error("Nicht angemeldet.");

    const { data: z } = await admin.from("projekt_zugaenge")
      .select("id, projekt_id, anzeigename, email, aktiv, session_gueltig_bis, ansprechpartner_id")
      .eq("session_token", session).maybeSingle();
    if (!z || !z.aktiv || !z.session_gueltig_bis || new Date(z.session_gueltig_bis).getTime() <= Date.now()) {
      return jsonResponse({ ok: false, error: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an." });
    }

    if (action === "upload_url") {
      const dateiname = bereinigeDateiname((body.dateiname || "").toString());
      const groesse = Number(body.groesse || 0);
      if (!dateiname) throw new Error("Dateiname fehlt.");
      if (groesse > MAX_GROESSE) throw new Error("Die Datei ist zu gro\u00df (max. 25 MB).");
      const pfad = `kunden/${z.projekt_id}/${z.id}/${Date.now()}_${dateiname}`;
      const { data: signed, error } = await admin.storage.from("projekt-dateien").createSignedUploadUrl(pfad);
      if (error || !signed?.signedUrl) throw new Error("Upload-URL konnte nicht erstellt werden: " + (error?.message || "leer"));
      return jsonResponse({ ok: true, pfad, upload_url: signed.signedUrl });
    }

    if (action === "registrieren") {
      const pfad = (body.pfad || "").toString();
      const dateiname = (body.dateiname || "").toString().slice(0, 200) || "Unterlage";
      if (!pfad.startsWith(`kunden/${z.projekt_id}/${z.id}/`)) throw new Error("Ung\u00fcltiger Pfad.");
      const { data: eintrag, error } = await admin.from("projekt_kunden_dateien").insert({
        projekt_id: z.projekt_id, zugang_id: z.id, name: dateiname, pfad,
        content_type: (body.content_type || null), groesse: Number(body.groesse || 0) || null,
      }).select().single();
      if (error) throw new Error(error.message);

      await admin.from("projekt_aktivitaeten").insert({
        projekt_id: z.projekt_id, zugang_id: z.id, typ: "kunden_upload", details: { name: dateiname },
      });

      const { data: projekt } = await admin.from("projekte").select("name").eq("id", z.projekt_id).maybeSingle();
      const an = await teamEmpfaenger(admin, z.ansprechpartner_id || null);
      await sendeTeamMail(admin, an,
        `Kunden-Upload \u2013 ${projekt?.name || "Projekt"}`,
        `${z.anzeigename || z.email} hat eine Unterlage eingereicht:\n\n`
        + `  \u2022  ${dateiname}\n\n`
        + `Projekt: ${projekt?.name || ""}\n`
        + `Zu finden im ImmoOffice Portal unter Immobilien \u2192 Neubauprojekte \u2192 Dateien.`);

      return jsonResponse({ ok: true, datei: { id: eintrag.id, name: eintrag.name, created_at: eintrag.created_at } });
    }

    if (action === "ereignis") {
      const typ = (body.typ || "").toString();
      if (!ERLAUBTE_EREIGNISSE.includes(typ)) return jsonResponse({ ok: true });
      let details = null;
      if (body.details && typeof body.details === "object") {
        details = { name: (body.details.name || "").toString().slice(0, 200) };
      }
      await admin.from("projekt_aktivitaeten").insert({ projekt_id: z.projekt_id, zugang_id: z.id, typ, details });
      return jsonResponse({ ok: true });
    }

    throw new Error("Unbekannte Aktion.");
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
