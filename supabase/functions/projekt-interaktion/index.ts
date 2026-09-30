// ============================================================================
// projekt-interaktion (v5)
//   Rueckkanal des Projekt-Kundenbereichs. Aktionen: registrieren, merken,
//   entmerken, reservierung, mangel_melden, nachricht_senden (v4).
//   NEU v5: Versand ueber Resend (HTTP-API), wenn RESEND_API_KEY gesetzt ist
//   — kein SMTP-Login bei All-Inkl mehr. Ohne Key: Fallback All-Inkl-SMTP.
//   Deploy mit verify_jwt=false — Auth via Session-Token bzw. oeffentlich.
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
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const STANDARD_MAIL = "info@immooffice.example";
const MAX_REG_PRO_STUNDE = 20;

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

async function holePostfach(admin: ReturnType<typeof createClient>, mandant: string | null) {
  // Das Postfach muss dem Mandanten des Projekts gehoeren.
  if (!mandant) { console.warn("Postfach: kein Mandant angegeben, kein Versand."); return null; }
  const { data: pf } = await admin.from("mail_postfaecher")
    .select("*").eq("mandant_id", mandant).eq("email_adresse", STANDARD_MAIL).eq("aktiv", true).limit(1).maybeSingle();
  if (pf) return { ...pf, firma_name: await immoFirmenName(admin, mandant) };
  const { data: alle } = await admin.from("mail_postfaecher")
    .select("*").eq("mandant_id", mandant).eq("aktiv", true)
    .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);
  const gewaehlt = (alle || [])[0] || null;
  return gewaehlt ? { ...gewaehlt, firma_name: await immoFirmenName(admin, mandant) } : null;
}

// Versand: Resend (HTTPS, feste Infrastruktur) bevorzugt, sonst All-Inkl-SMTP
async function sendeMail(postfach: any, an: string, anName: string, betreff: string, text: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  // Der Anzeigename im Absender: erst der des Postfachs, dann der
  // Firmenname des Mandanten. Ein verdrahteter Name waere bei jedem
  // Mandanten ausser einem falsch.
  const absName = postfach?.absender_name || postfach?.firma_name || "";
  const absMail = postfach?.email_adresse || STANDARD_MAIL;
  const finalText = postfach?.signatur ? `${text}\n\n--\n${postfach.signatur}` : text;
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

function einladungsText(name: string, projektName: string, link: string): string {
  return `Guten Tag ${name},\n\n`
    + `vielen Dank f\u00fcr Ihr Interesse am Projekt \u201e${projektName}\u201c. Wir haben einen pers\u00f6nlichen Kundenbereich f\u00fcr Sie eingerichtet.\n\n`
    + `\u00dcber folgenden Link legen Sie einmalig Ihr pers\u00f6nliches Passwort fest:\n\n${link}\n\n`
    + `Danach melden Sie sich jederzeit mit Ihrer E-Mail-Adresse und Ihrem Passwort auf der Projektseite an (\u201eKunden-Login\u201c) und finden dort Ihre Unterlagen sowie aktuelle Informationen zum Projekt. Sobald wir neue Unterlagen f\u00fcr Sie bereitstellen, erhalten Sie automatisch eine E-Mail.\n\n`
    + `Der Link ist pers\u00f6nlich f\u00fcr Sie bestimmt \u2013 bitte geben Sie ihn nicht weiter.\n\n`
    + `F\u00fcr R\u00fcckfragen stehen wir Ihnen gerne zur Verf\u00fcgung!\n\nMit freundlichen Gr\u00fc\u00dfen\n${postfach?.firma_name || ""}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").toString();

    if (action === "registrieren") {
      if ((body.hp || "").toString().trim() !== "") return jsonResponse({ ok: true });

      const slug = (body.slug || "").toString().trim();
      const name = (body.name || "").toString().trim().slice(0, 120);
      const email = (body.email || "").toString().trim().toLowerCase().slice(0, 200);
      const telefon = (body.telefon || "").toString().trim().slice(0, 60) || null;
      if (!slug || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Bitte Name und eine g\u00fcltige E-Mail-Adresse angeben.");
      }
      const { data: projekt } = await admin.from("projekte")
        .select("id, name, oeffentliche_url, mandant_id").eq("slug", slug).eq("status", "aktiv").maybeSingle();
      if (!projekt) throw new Error("Projekt nicht gefunden.");

      const { count } = await admin.from("projekt_zugaenge")
        .select("id", { count: "exact", head: true })
        .eq("projekt_id", projekt.id).eq("quelle", "selbstregistrierung")
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
      if ((count || 0) >= MAX_REG_PRO_STUNDE) {
        throw new Error("Zurzeit sind sehr viele Anfragen eingegangen. Bitte versuchen Sie es sp\u00e4ter erneut oder kontaktieren Sie uns direkt.");
      }

      const basis = (projekt.oeffentliche_url || "").replace(/\/+$/, "");
      const postfach = await holePostfach(admin, projekt.mandant_id);

      const { data: vorhanden } = await admin.from("projekt_zugaenge")
        .select("id, token, anzeigename, aktiv, passwort_gesetzt_am")
        .eq("projekt_id", projekt.id).eq("email", email).maybeSingle();

      if (vorhanden) {
        if (vorhanden.aktiv) {
          if (vorhanden.passwort_gesetzt_am) {
            await sendeMail(postfach, email, vorhanden.anzeigename || name,
              `Ihr Kundenbereich \u2013 ${projekt.name}`,
              `Guten Tag ${vorhanden.anzeigename || name},\n\nf\u00fcr diese E-Mail-Adresse besteht bereits ein Zugang zum Kundenbereich des Projekts \u201e${projekt.name}\u201c.\n\nMelden Sie sich einfach mit Ihrer E-Mail-Adresse und Ihrem Passwort an:\n${basis}\n\nFalls Sie Ihr Passwort vergessen haben, nutzen Sie einfach \u201ePasswort vergessen\u201c im Login-Fenster.\n\nMit freundlichen Gr\u00fc\u00dfen\n${postfach?.firma_name || ""}`);
          } else {
            const link = basis ? `${basis}/?einladung=${vorhanden.token}` : `?einladung=${vorhanden.token}`;
            await sendeMail(postfach, email, vorhanden.anzeigename || name,
              `Ihr Kundenbereich \u2013 ${projekt.name}`, einladungsText(vorhanden.anzeigename || name, projekt.name, link));
          }
        }
        return jsonResponse({ ok: true });
      }

      const { data: neu, error: insErr } = await admin.from("projekt_zugaenge").insert({
        projekt_id: projekt.id, anzeigename: name, email, telefon,
        rolle: "interessent", eingeladen_am: new Date().toISOString(), quelle: "selbstregistrierung",
      }).select("id, token").single();
      if (insErr) throw new Error(insErr.message);

      await admin.from("projekt_aktivitaeten").insert({
        projekt_id: projekt.id, zugang_id: neu.id, typ: "selbstregistrierung", details: { name },
      });

      const link = basis ? `${basis}/?einladung=${neu.token}` : `?einladung=${neu.token}`;
      await sendeMail(postfach, email, name, `Ihr Kundenbereich \u2013 ${projekt.name}`, einladungsText(name, projekt.name, link));
      await sendeMail(postfach, STANDARD_MAIL, "",
        `Neuer Interessent \u2013 ${projekt.name}`,
        `Neue Selbstregistrierung auf der Projektseite:\n\nName: ${name}\nE-Mail: ${email}${telefon ? `\nTelefon: ${telefon}` : ""}\nProjekt: ${projekt.name}\n\nDer Interessent hat seine Einladungsmail mit Passwort-Link automatisch erhalten.\nZu finden im ImmoOffice Portal unter Immobilien \u2192 Neubauprojekte \u2192 Kunden-Zug\u00e4nge \u2014 dort bitte Ansprechpartner zuordnen.`);

      return jsonResponse({ ok: true });
    }

    const session = (body.session || "").toString().trim();
    if (!session) throw new Error("Nicht angemeldet.");
    const { data: z } = await admin.from("projekt_zugaenge")
      .select("id, projekt_id, anzeigename, email, rolle, einheit_id, aktiv, session_gueltig_bis, ansprechpartner_id, mandant_id")
      .eq("session_token", session).maybeSingle();
    if (!z || !z.aktiv || !z.session_gueltig_bis || new Date(z.session_gueltig_bis).getTime() <= Date.now()) {
      return jsonResponse({ ok: false, error: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an." });
    }

    const weNr = (body.we_nr || "").toString().trim();
    const holeEinheit = async () => {
      if (!weNr) throw new Error("Wohnung fehlt.");
      const { data: e } = await admin.from("projekt_einheiten")
        .select("id, we_nr, status").eq("projekt_id", z.projekt_id).eq("we_nr", weNr).maybeSingle();
      if (!e) throw new Error("Wohnung nicht gefunden.");
      return e;
    };

    if (action === "merken") {
      const e = await holeEinheit();
      await admin.from("projekt_merkliste").upsert(
        { projekt_id: z.projekt_id, zugang_id: z.id, einheit_id: e.id },
        { onConflict: "zugang_id,einheit_id", ignoreDuplicates: true });
      await admin.from("projekt_aktivitaeten").insert({
        projekt_id: z.projekt_id, zugang_id: z.id, typ: "gemerkt", details: { name: e.we_nr },
      });
      return jsonResponse({ ok: true });
    }

    if (action === "entmerken") {
      const e = await holeEinheit();
      await admin.from("projekt_merkliste").delete().eq("zugang_id", z.id).eq("einheit_id", e.id);
      return jsonResponse({ ok: true });
    }

    if (action === "reservierung") {
      const e = await holeEinheit();
      if (e.status !== "verfuegbar") {
        return jsonResponse({ ok: false, error: "Diese Wohnung ist leider nicht mehr verf\u00fcgbar. Gerne beraten wir Sie zu Alternativen." });
      }
      const { data: offen } = await admin.from("projekt_anfragen")
        .select("id").eq("zugang_id", z.id).eq("einheit_id", e.id).eq("status", "offen").maybeSingle();
      if (offen) {
        return jsonResponse({ ok: false, error: "Ihre Reservierungsanfrage f\u00fcr diese Wohnung liegt uns bereits vor \u2013 wir melden uns schnellstm\u00f6glich bei Ihnen." });
      }
      const nachricht = (body.nachricht || "").toString().trim().slice(0, 1000) || null;
      await admin.from("projekt_anfragen").insert({
        projekt_id: z.projekt_id, zugang_id: z.id, einheit_id: e.id, typ: "reservierung", nachricht,
      });
      await admin.from("projekt_aktivitaeten").insert({
        projekt_id: z.projekt_id, zugang_id: z.id, typ: "reservierungsanfrage", details: { name: e.we_nr },
      });
      const { data: projekt } = await admin.from("projekte").select("name, mandant_id").eq("id", z.projekt_id).maybeSingle();
      const postfach = await holePostfach(admin, z.mandant_id);
      try {
        await sendeMail(postfach, STANDARD_MAIL, "",
          `Reservierungsanfrage ${e.we_nr} \u2013 ${projekt?.name || "Projekt"}`,
          `${z.anzeigename || z.email} m\u00f6chte reservieren:\n\nWohnung: ${e.we_nr}\nProjekt: ${projekt?.name || ""}${nachricht ? `\n\nNachricht:\n${nachricht}` : ""}\n\nBest\u00e4tigen oder ablehnen im ImmoOffice Portal unter Immobilien \u2192 Neubauprojekte \u2192 Anfragen.`);
      } catch (_mailErr) { /* Anfrage ist gespeichert, Mail-Hinweis darf nicht blockieren */ }
      return jsonResponse({ ok: true });
    }

    if (action === "mangel_melden") {
      if (z.rolle !== "kaeufer") {
        return jsonResponse({ ok: false, error: "M\u00e4ngelmeldungen sind K\u00e4ufern vorbehalten. Bei Fragen kontaktieren Sie uns gerne direkt." });
      }
      const titel = (body.titel || "").toString().trim().slice(0, 200);
      const beschreibung = (body.beschreibung || "").toString().trim().slice(0, 3000) || null;
      if (!titel) throw new Error("Bitte geben Sie einen kurzen Titel f\u00fcr den Mangel an.");
      const prefix = `kunden/${z.projekt_id}/${z.id}/`;
      const fotoPfade = (Array.isArray(body.foto_pfade) ? body.foto_pfade : [])
        .map((p: unknown) => (p || "").toString())
        .filter((p: string) => p.startsWith(prefix))
        .slice(0, 5);
      const { data: mangel, error: insErr } = await admin.from("projekt_maengel").insert({
        projekt_id: z.projekt_id, zugang_id: z.id, einheit_id: z.einheit_id || null,
        titel, beschreibung, foto_pfade: fotoPfade,
      }).select("id, titel, created_at, status").single();
      if (insErr) throw new Error(insErr.message);

      await admin.from("projekt_aktivitaeten").insert({
        projekt_id: z.projekt_id, zugang_id: z.id, typ: "mangel_gemeldet", details: { name: titel },
      });
      const { data: projekt } = await admin.from("projekte").select("name, mandant_id").eq("id", z.projekt_id).maybeSingle();
      const postfach = await holePostfach(admin, z.mandant_id);
      try {
        await sendeMail(postfach, STANDARD_MAIL, "",
          `M\u00e4ngelmeldung \u2013 ${projekt?.name || "Projekt"}`,
          `${z.anzeigename || z.email} hat einen Mangel gemeldet:\n\nTitel: ${titel}${beschreibung ? `\n\nBeschreibung:\n${beschreibung}` : ""}${fotoPfade.length ? `\n\nFotos: ${fotoPfade.length} angeh\u00e4ngt` : ""}`);
      } catch (_mailErr) { /* Meldung ist gespeichert */ }
      return jsonResponse({ ok: true, mangel });
    }

    if (action === "nachricht_senden") {
      const text = (body.text || "").toString().trim().slice(0, 3000);
      if (!text) throw new Error("Bitte geben Sie eine Nachricht ein.");

      const { count } = await admin.from("projekt_nachrichten")
        .select("id", { count: "exact", head: true })
        .eq("zugang_id", z.id).eq("richtung", "kunde")
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
      if ((count || 0) >= 30) {
        return jsonResponse({ ok: false, error: "Sie haben sehr viele Nachrichten gesendet. Bitte versuchen Sie es sp\u00e4ter erneut oder rufen Sie uns an." });
      }

      const { data: n, error: insErr } = await admin.from("projekt_nachrichten").insert({
        projekt_id: z.projekt_id, zugang_id: z.id, richtung: "kunde", text,
        absender_name: z.anzeigename || z.email,
      }).select("id, richtung, text, absender_name, created_at").single();
      if (insErr) throw new Error(insErr.message);

      await admin.from("projekt_aktivitaeten").insert({
        projekt_id: z.projekt_id, zugang_id: z.id, typ: "nachricht_gesendet", details: { name: text.slice(0, 80) },
      });

      try {
        const { data: projekt } = await admin.from("projekte").select("name").eq("id", z.projekt_id).maybeSingle();
        let empfaenger = STANDARD_MAIL;
        if (z.ansprechpartner_id) {
          const { data: ap } = await admin.from("profiles").select("email").eq("id", z.ansprechpartner_id).maybeSingle();
          if (ap?.email) empfaenger = ap.email;
        }
        const postfach = await holePostfach(admin, z.mandant_id);
        await sendeMail(postfach, empfaenger, "",
          `Neue Kundennachricht \u2013 ${projekt?.name || "Projekt"}`,
          `${z.anzeigename || z.email} schreibt im Kundenportal:\n\n\u201e${text}\u201c\n\nAntworten im ImmoOffice Portal unter Immobilien \u2192 Neubauprojekte \u2192 Kunden-Zug\u00e4nge \u2192 \u{1F4AC} Nachrichten beim Kunden.`);
      } catch (_mailErr) { /* Mail-Hinweis darf das Senden nicht blockieren */ }

      return jsonResponse({ ok: true, nachricht: n });
    }

    throw new Error("Unbekannte Aktion.");
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
