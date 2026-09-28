// ============================================================================
// upload-benachrichtigung-versenden
// ============================================================================
// Wird per pg_cron alle 2 Min aufgerufen.
// Schaut nach offenen Benachrichtigungen (bereit_ab <= jetzt, versendet_am NULL)
// und schickt pro Eintrag eine E-Mail an den zustaendigen Ansprechpartner.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SMTP-Passwort entschluesseln (gleiche Logik wie mail-senden)
async function entschluessele(verschluesseltesBase64: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = verschluesseltesBase64.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungueltiges Passwort-Format");
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Offene Benachrichtigungen holen (bereit_ab in Vergangenheit, noch nicht versendet)
    const { data: offene, error: lErr } = await admin
      .from("upload_benachrichtigungen")
      .select("*")
      .is("versendet_am", null)
      .lte("bereit_ab", new Date().toISOString())
      .limit(50);

    if (lErr) throw lErr;
    if (!offene || offene.length === 0) {
      return jsonResponse({ ok: true, verarbeitet: 0 });
    }

    let erfolgreich = 0;
    let fehler = 0;

    for (const ben of offene) {
      try {
        // Eigentuemer-Daten
        const { data: eigentuemer } = await admin
          .from("eigentuemer")
          .select("id, vorname, nachname, firma, email")
          .eq("id", ben.eigentuemer_id)
          .maybeSingle();
        if (!eigentuemer) throw new Error("Eigentuemer nicht gefunden");

        // Ansprechpartner-Daten + dessen Standard-Postfach
        let ansprechpartnerEmail: string | null = null;
        let ansprechpartnerName: string | null = null;
        let postfach: any = null;

        if (ben.ansprechpartner_id) {
          const { data: profil } = await admin
            .from("profiles")
            .select("id, name, email")
            .eq("id", ben.ansprechpartner_id)
            .maybeSingle();
          if (profil?.email) {
            ansprechpartnerEmail = profil.email;
            ansprechpartnerName = profil.name;
          }
          // Standard-Postfach des Ansprechpartners
          const { data: pf } = await admin
            .from("mail_postfaecher")
            .select("*")
            .eq("benutzer_id", ben.ansprechpartner_id)
            .eq("ist_standard", true)
            .eq("aktiv", true)
            .maybeSingle();
          postfach = pf;
        }

        // Fallback: erstes aktives Standard-Postfach irgendeines Maklers
        if (!postfach) {
          const { data: pf } = await admin
            .from("mail_postfaecher")
            .select("*")
            .eq("ist_standard", true)
            .eq("aktiv", true)
            .limit(1)
            .maybeSingle();
          postfach = pf;
          if (!ansprechpartnerEmail && pf) ansprechpartnerEmail = pf.email_adresse;
        }

        if (!postfach) throw new Error("Kein versendendes Postfach gefunden");
        if (!ansprechpartnerEmail) throw new Error("Keine Empfaenger-E-Mail gefunden");

        // Mail bauen
        const eigentuemerName = eigentuemer.firma
          || [eigentuemer.vorname, eigentuemer.nachname].filter(Boolean).join(" ")
          || "Eigentuemer";
        const anzahl = ben.upload_anzahl || 1;
        const dateienText = anzahl === 1 ? "eine Datei" : `${anzahl} Dateien`;
        const anredeName = ansprechpartnerName ? `Hallo ${ansprechpartnerName.split(" ")[0]},` : "Hallo,";

        const betreff = `Neue Unterlagen von ${eigentuemerName}`;
        const text = `${anredeName}

${eigentuemerName} hat ${dateienText} ins Eigentuemerportal hochgeladen.

Bitte im Tool unter "Eigentuemer" anschauen.

Viele Gruesse
Musterhaus Immobilien Tool`;

        // SMTP-Versand (gleich wie mail-senden)
        const passwort = await entschluessele(postfach.smtp_passwort_verschluesselt);
        const transporter = nodemailer.createTransport({
          host: postfach.smtp_host,
          port: postfach.smtp_port,
          secure: postfach.smtp_port === 465,
          auth: { user: postfach.smtp_benutzer, pass: passwort },
        });
        await transporter.sendMail({
          from: `"${postfach.absender_name}" <${postfach.email_adresse}>`,
          to: ansprechpartnerEmail,
          subject: betreff,
          text,
        });

        // Als versendet markieren
        await admin.from("upload_benachrichtigungen")
          .update({ versendet_am: new Date().toISOString(), fehler: null })
          .eq("id", ben.id);

        erfolgreich++;
      } catch (e) {
        const meldung = e instanceof Error ? e.message : String(e);
        console.error("Benachrichtigung", ben.id, "fehlgeschlagen:", meldung);
        await admin.from("upload_benachrichtigungen")
          .update({ fehler: meldung })
          .eq("id", ben.id);
        fehler++;
      }
    }

    return jsonResponse({ ok: true, verarbeitet: offene.length, erfolgreich, fehler });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("upload-benachrichtigung-versenden:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}