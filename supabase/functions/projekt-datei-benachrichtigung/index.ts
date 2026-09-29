// ============================================================================
// projekt-datei-benachrichtigung (v7)
//   Cron (alle 5 Minuten): neue Projekt-Dateien UND Baufortschritts-Updates
//   -> EINE Sammel-Mail pro Empfaenger mit Login-Link.
//   v4: Persoenliche Dateien (zugang_id) benachrichtigen nur den Kunden.
//   v5: Versand ueber Resend (HTTP-API), wenn RESEND_API_KEY gesetzt ist.
//   v6: Nur FREIGEGEBENE Dateien (projekt_dateien.freigegeben = true) —
//   Uploads im Entwurf loesen keine Mail aus, erst die Freigabe im Portal.
//   Zurueckgetretene Kunden (rolle 'zurueckgetreten') erhalten keine
//   allgemeinen Benachrichtigungen mehr.
//   v7 (26.09.2026): Signatur genau einmal — die Grußformel des Textes wird durch die
//   Postfach-Signatur ersetzt (mail-signatur.ts); ohne Signatur bleibt die Grußformel.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
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

const KATEGORIE_LABEL: Record<string, string> = {
  expose: "Exposé", grundriss: "Grundriss", baubeschreibung: "Baubeschreibung",
  energieausweis: "Energieausweis", vertrag: "Vertragsunterlagen",
  baufortschritt: "Baufortschritt", sonstiges: "Unterlagen",
};
const ROLLEN_SICHT: Record<string, string[]> = {
  interessent: ["oeffentlich", "interessent"],
  reserviert: ["oeffentlich", "interessent"],
  kaeufer: ["oeffentlich", "interessent", "kaeufer"],
  zurueckgetreten: [],
};

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
  const absName = postfach?.absender_name || "Musterhaus Immobilien GmbH";
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
    const sammelGrenze = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    // Nur freigegebene Dateien; die 2-Minuten-Sammelgrenze bezieht sich auf den Freigabezeitpunkt
    const { data: neueDateien } = await admin.from("projekt_dateien")
      .select("id, projekt_id, einheit_id, zugang_id, name, kategorie, sichtbarkeit, hochgeladen_von, created_at, freigegeben_am")
      .eq("benachrichtigt", false)
      .eq("freigegeben", true)
      .lt("created_at", sammelGrenze)
      .limit(100);

    const reif = (neueDateien || []).filter((d: any) => !d.freigegeben_am || d.freigegeben_am < sammelGrenze);
    const dateien = reif.filter((d: any) => d.zugang_id || d.sichtbarkeit !== "oeffentlich");
    const stilleOeffentliche = reif.filter((d: any) => !d.zugang_id && d.sichtbarkeit === "oeffentlich");
    if (stilleOeffentliche.length > 0) {
      await admin.from("projekt_dateien").update({ benachrichtigt: true }).in("id", stilleOeffentliche.map((d: any) => d.id));
    }

    const { data: neueUpdates } = await admin.from("projekt_updates")
      .select("id, projekt_id, titel, sichtbarkeit, erstellt_von, created_at")
      .eq("benachrichtigt", false)
      .lt("created_at", sammelGrenze)
      .limit(100);

    const updates = neueUpdates || [];
    if (dateien.length === 0 && updates.length === 0) return jsonResponse({ ok: true, versendet: 0 });

    const projektIds = [...new Set([...dateien.map((d: any) => d.projekt_id), ...updates.map((u: any) => u.projekt_id)])];
    const { data: projekte } = await admin.from("projekte").select("id, name, oeffentliche_url, mandant_id").in("id", projektIds);
    const projektMap = new Map((projekte || []).map((p: any) => [p.id, p]));

    const { data: zugaenge } = await admin.from("projekt_zugaenge")
      .select("id, projekt_id, einheit_id, email, anzeigename, rolle, passwort_gesetzt_am, aktiv, ansprechpartner_id")
      .in("projekt_id", projektIds).eq("aktiv", true);

    const { data: postfaecher } = await admin.from("mail_postfaecher")
      .select("*").eq("aktiv", true)
      .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false });

    // Die Rueckfallkette endete mit "irgendein Postfach". Ueber mehrere
    // Mandanten hinweg heisst das: die Meldung des einen Bautraegers geht
    // ueber den SMTP-Zugang des anderen hinaus. Gewaehlt wird deshalb nur
    // aus den Postfaechern des Mandanten, dem das Projekt gehoert — und
    // ohne Mandanten gar keines.
    const postfachFuerEmpfaenger = (ansprechpartnerId: string | null, uploaderId: string | null, mandant: string | null) => {
      if (!mandant) return null;
      const eigene = (postfaecher || []).filter((p: any) => p.mandant_id === mandant);
      return eigene.find((p: any) => ansprechpartnerId && p.benutzer_id === ansprechpartnerId && p.standard_zum_senden)
        || eigene.find((p: any) => ansprechpartnerId && p.benutzer_id === ansprechpartnerId)
        || eigene.find((p: any) => (p.email_adresse || "").toLowerCase() === STANDARD_MAIL)
        || eigene.find((p: any) => uploaderId && p.benutzer_id === uploaderId && p.standard_zum_senden)
        || eigene.find((p: any) => uploaderId && p.benutzer_id === uploaderId)
        || eigene[0] || null;
    };

    const proEmpfaenger = new Map<string, { zugang: any; projekt: any; dateien: any[]; updates: any[]; uploader: string | null }>();
    const hole = (z: any, projekt: any, uploader: string | null) => {
      const e = proEmpfaenger.get(z.id) || { zugang: z, projekt, dateien: [], updates: [], uploader };
      if (!e.uploader && uploader) e.uploader = uploader;
      proEmpfaenger.set(z.id, e);
      return e;
    };

    for (const d of dateien) {
      const projekt = projektMap.get(d.projekt_id);
      if (!projekt) continue;
      for (const z of (zugaenge || [])) {
        if (z.projekt_id !== d.projekt_id) continue;
        if (!z.passwort_gesetzt_am) continue;
        if (d.zugang_id) {
          if (d.zugang_id !== z.id) continue;
        } else {
          const sicht = ROLLEN_SICHT[z.rolle] || [];
          if (!sicht.includes(d.sichtbarkeit)) continue;
          if (d.einheit_id && d.einheit_id !== z.einheit_id) continue;
        }
        hole(z, projekt, d.hochgeladen_von).dateien.push(d);
      }
    }
    for (const u of updates) {
      const projekt = projektMap.get(u.projekt_id);
      if (!projekt) continue;
      for (const z of (zugaenge || [])) {
        if (z.projekt_id !== u.projekt_id) continue;
        if (!z.passwort_gesetzt_am) continue;
        if (z.rolle === "zurueckgetreten") continue;
        const sicht = ["oeffentlich", ...(ROLLEN_SICHT[z.rolle] || [])];
        if (!sicht.includes(u.sichtbarkeit)) continue;
        hole(z, projekt, u.erstellt_von).updates.push(u);
      }
    }

    let versendet = 0;
    for (const { zugang, projekt, dateien: dz, updates: uz, uploader } of proEmpfaenger.values()) {
      const postfach = postfachFuerEmpfaenger(zugang.ansprechpartner_id || null, uploader, projekt?.mandant_id ?? null);
      const loginUrl = (projekt.oeffentliche_url || "").replace(/\/+$/, "");

      const persoenliche = dz.filter((d: any) => d.zugang_id);
      const allgemeine = dz.filter((d: any) => !d.zugang_id);
      const teile: string[] = [];
      if (persoenliche.length > 0) {
        const liste = persoenliche.map((d: any) => `- ${d.name}`).join("\n");
        teile.push(`${persoenliche.length === 1 ? "Ein persönliches Dokument steht" : "Persönliche Dokumente stehen"} für Sie bereit:\n\n${liste}`);
      }
      if (allgemeine.length > 0) {
        const liste = allgemeine.map((d: any) => `- ${d.name} (${KATEGORIE_LABEL[d.kategorie] || d.kategorie})`).join("\n");
        teile.push(`${allgemeine.length === 1 ? "Ein neues Dokument steht" : "Neue Dokumente stehen"} für Sie bereit:\n\n${liste}`);
      }
      if (uz.length > 0) {
        const liste = uz.map((u: any) => `- ${u.titel}`).join("\n");
        teile.push(`${uz.length === 1 ? "Es gibt eine neue Meldung" : "Es gibt neue Meldungen"} zum Projekt:\n\n${liste}`);
      }

      const text = `Guten Tag ${zugang.anzeigename || ""},\n\n`
        + `in Ihrem Kundenbereich zum Projekt „${projekt.name}“ gibt es Neuigkeiten.\n\n`
        + teile.join("\n\n") + "\n\n"
        + (loginUrl ? `Melden Sie sich einfach mit Ihrer E-Mail-Adresse und Ihrem Passwort an:\n${loginUrl}\n\n` : "")
        + `Für Rückfragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\nMusterhaus Immobilien GmbH`;
      try {
        await sendeMail(postfach, zugang.email, zugang.anzeigename || "",
          `Neuigkeiten in Ihrem Kundenbereich – ${projekt.name}`, text);
        versendet++;
      } catch (mailErr) {
        console.error(`Benachrichtigung an ${zugang.email} fehlgeschlagen:`, mailErr);
      }
    }

    if (dateien.length > 0) {
      await admin.from("projekt_dateien").update({ benachrichtigt: true }).in("id", dateien.map((d: any) => d.id));
    }
    if (updates.length > 0) {
      await admin.from("projekt_updates").update({ benachrichtigt: true }).in("id", updates.map((u: any) => u.id));
    }

    return jsonResponse({ ok: true, versendet });
  } catch (e) {
    console.error("projekt-datei-benachrichtigung:", e);
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
