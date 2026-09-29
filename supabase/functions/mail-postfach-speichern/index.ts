// ============================================================================
// Edge Function: mail-postfach-speichern
// ============================================================================
// Speichert ein Mail-Postfach mit verschluesseltem SMTP-Passwort.
// Optional: testet die SMTP-Verbindung sofort.
//
// Aufruf vom Frontend:
//   supabase.functions.invoke("mail-postfach-speichern", { body: {
//     id?, absender_name, email_adresse, smtp_server, smtp_port,
//     smtp_security, smtp_user, smtp_passwort?, signatur?,
//     test_verbindung?: bool
//   } })
//
// Wenn smtp_passwort weggelassen ist (bei Update): Passwort bleibt unveraendert.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AES-GCM-Verschluesselung mit MAIL_SECRET_KEY
async function verschluessele(klartext: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  const key = await crypto.subtle.importKey(
    "raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, enc.encode(klartext)
  );

  // Format: "v1.<iv-base64>.<ciphertext-base64>"
  const toBase64 = (arr: Uint8Array) => btoa(String.fromCharCode(...arr));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      id, absender_name, email_adresse, smtp_server, smtp_port,
      smtp_security, smtp_user, smtp_passwort, signatur, test_verbindung,
      // IMAP
      imap_server, imap_port, imap_security, imap_user, imap_passwort, imap_aktiv,
    } = body;

    if (!absender_name || !email_adresse || !smtp_server || !smtp_port || !smtp_user) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Pflichtfelder fehlen: absender_name, email_adresse, smtp_server, smtp_port, smtp_user"
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "Kein Auth-Token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: "Nicht authentifiziert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // SMTP-Test wenn gewuenscht — mit nodemailer verify()
    let testResult: any = null;
    if (test_verbindung && smtp_passwort) {
      try {
        const istSslDirekt = Number(smtp_port) === 465 || smtp_security === "ssl";
        const transporter = nodemailer.createTransport({
          host: smtp_server,
          port: Number(smtp_port),
          secure: istSslDirekt,
          auth: { user: smtp_user, pass: smtp_passwort },
          tls: { rejectUnauthorized: false },
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 30000,
        });
        await transporter.verify();
        testResult = { ok: true };
      } catch (e) {
        console.error("SMTP-Test fehlgeschlagen:", e);
        testResult = { ok: false, fehler: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
      }
    }

    // Verschluesseln und speichern
    let smtp_passwort_verschluesselt = null;
    if (smtp_passwort) {
      smtp_passwort_verschluesselt = await verschluessele(smtp_passwort);
    }

    // IMAP-Passwort verschluesseln falls neu
    let imap_passwort_verschluesselt = null;
    if (imap_passwort) {
      imap_passwort_verschluesselt = await verschluessele(imap_passwort);
    }

    const payload: Record<string, any> = {
      absender_name,
      email_adresse,
      smtp_server,
      smtp_port: Number(smtp_port),
      smtp_security: smtp_security || "starttls",
      smtp_user,
      signatur: signatur || null,
    };
    if (smtp_passwort_verschluesselt) {
      payload.smtp_passwort_verschluesselt = smtp_passwort_verschluesselt;
    }

    // IMAP-Felder optional
    if (imap_server !== undefined) payload.imap_server = imap_server || null;
    if (imap_port !== undefined) payload.imap_port = imap_port ? Number(imap_port) : 993;
    if (imap_security !== undefined) payload.imap_security = imap_security || "ssl";
    if (imap_user !== undefined) payload.imap_user = imap_user || null;
    if (imap_passwort_verschluesselt) payload.imap_passwort_verschluesselt = imap_passwort_verschluesselt;
    if (imap_aktiv !== undefined) payload.imap_aktiv = !!imap_aktiv;

    if (testResult) {
      payload.letzter_test_ok = testResult.ok;
      payload.letzter_test_am = new Date().toISOString();
      payload.letzter_test_fehler = testResult.ok ? null : testResult.fehler;
    }

    let postfachId = id;
    if (id) {
      // Update — Berechtigung pruefen
      // Die Rolle "chef" hebt gleich darunter die Eigentuemerpruefung auf.
      // Ohne Mandantengrenze davor haette ein Chef die Postfaecher fremder
      // Haeuser aendern koennen — samt SMTP-Server, Benutzer und Passwort.
      await immoMandantSichern(req, [["mail_postfaecher", String(id || "")]]);
      const { data: vorhanden } = await admin.from("mail_postfaecher").select("benutzer_id").eq("id", id).maybeSingle();
      if (!vorhanden) {
        return new Response(JSON.stringify({ ok: false, error: "Postfach nicht gefunden" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      const istChef = profile?.role === "chef";
      if (vorhanden.benutzer_id !== userId && !istChef) {
        return new Response(JSON.stringify({ ok: false, error: "Keine Berechtigung" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await admin.from("mail_postfaecher").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      // Insert
      payload.benutzer_id = userId;
      const { data, error } = await admin.from("mail_postfaecher").insert(payload).select().single();
      if (error) throw error;
      postfachId = data.id;
    }

    return new Response(JSON.stringify({
      ok: true,
      id: postfachId,
      test: testResult,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Unerwarteter Fehler:", e);
    return new Response(JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});