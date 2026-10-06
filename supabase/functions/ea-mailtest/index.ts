// ea-mailtest v1 — prueft den Mailweg (Resend, sonst SMTP) fuer den
// Energieausweis-Fragebogen. Schickt eine Testmail inkl. Anhang.
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

// Pflichtangabe. Fehlt sie, geht NICHTS hinaus: ein Rueckfall auf
// eine Adresse, die niemandem gehoert, sieht aus wie Betrieb, kommt
// aber nirgends an. Begruendung in docs/OFFEN.md.
function immoFehlt(was: string): never {
  throw new Error(was + " fehlt (siehe docs/SECRETS.md). Ohne diese " +
    "Angabe ginge eine Nachricht mit einer Adresse hinaus, die " +
    "niemandem gehoert \u2014 deshalb geht gar keine.");
}


async function entschluessele(v: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = v.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungueltiges Passwort-Format");
  const iv = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const km = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", km, { name: "AES-GCM" }, false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const log: Record<string, unknown> = {};
  try {
    const b = await req.json().catch(() => ({}));
    const an = String(b.an || immoFehlt("eine Absenderadresse (Postfach, Firmenstammdaten oder SMTP_FROM_EMAIL)"));

    // Nahm das erste aktive Postfach der ganzen Plattform und verschickte
    // damit an eine Adresse aus dem Anfragekoerper — ein Versandweg ueber
    // das Postfach eines fremden Maklers, mit dessen Absenderadresse.
    const eigenerMandant = await immoMandantDesAufrufers(req);
    if (!eigenerMandant) {
      return new Response(JSON.stringify({ ok: false, fehler: "Nicht angemeldet." }),
        { status: 401, headers: { "Content-Type": "application/json" } });
    }
    const { data: pfs } = await db.from("mail_postfaecher").select("*").eq("mandant_id", eigenerMandant).eq("aktiv", true)
      .order("ist_standard", { ascending: false }).limit(1);
    const pf = pfs && pfs[0];
    log.postfach = pf ? pf.email_adresse : null;
    if (!pf) return new Response(JSON.stringify({ ok: false, fehler: "kein aktives Postfach", log }), { headers: { "Content-Type": "application/json" } });

    const anhangBytes = new TextEncoder().encode("Testanhang Energieausweis-Fragebogen\n");
    const anhangB64 = btoa(String.fromCharCode(...anhangBytes));
    const betreff = "Testlauf Fragebogen Energieausweis";
    const text = "Dies ist ein Funktionstest des neuen Fragebogens auf der Homepage.\nWenn diese Mail ankommt, funktioniert der Versand inklusive Anhang.";

    const resendKey = Deno.env.get("RESEND_API_KEY");
    log.resend_key_vorhanden = !!resendKey;
    if (resendKey) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${pf.absender_name} <${pf.email_adresse}>`,
          to: [an], subject: betreff, text,
          attachments: [{ filename: "test.txt", content: anhangB64 }],
        }),
      });
      log.resend_status = r.status;
      log.resend_antwort = (await r.text().catch(() => "")).slice(0, 300);
      if (r.ok) return new Response(JSON.stringify({ ok: true, weg: "resend", log }), { headers: { "Content-Type": "application/json" } });
    }

    if (!pf.smtp_passwort_verschluesselt) return new Response(JSON.stringify({ ok: false, fehler: "kein SMTP-Passwort", log }), { headers: { "Content-Type": "application/json" } });
    const pass = await entschluessele(pf.smtp_passwort_verschluesselt);
    const tr = nodemailer.createTransport({
      host: pf.smtp_server, port: Number(pf.smtp_port),
      secure: Number(pf.smtp_port) === 465 || pf.smtp_security === "ssl",
      auth: { user: pf.smtp_user, pass }, tls: { rejectUnauthorized: false },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 45000,
    });
    await tr.sendMail({ from: `"${pf.absender_name}" <${pf.email_adresse}>`, to: an, subject: betreff, text,
      attachments: [{ filename: "test.txt", content: anhangBytes }] });
    return new Response(JSON.stringify({ ok: true, weg: "smtp", log }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, fehler: e instanceof Error ? e.message : String(e), log }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
