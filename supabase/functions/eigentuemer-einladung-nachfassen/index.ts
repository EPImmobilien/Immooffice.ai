// eigentuemer-einladung-nachfassen v2 (26.09.2026)
// v2: Mailtext aus einladung-mail.ts (Gueltigkeit 24 Stunden, Selbsthilfe <Portal>#zugang statt eigener Bausteine).
// Cron (taeglich) oder gezielt per Body { eigentuemer_id, erzwingen? }: Offene Einladungen ins Kundenportal, deren
// Konto noch nie bestaetigt/angemeldet wurde, bekommen einen frischen Anmeldelink per E-Mail ueber Resend mit
// unserem Absender (statt der Supabase-Standardmail). Versand wird in mail_versendet und aktivitaeten protokolliert,
// eigentuemer_einladungen bekommt erinnert_am/erinnerungen/versandweg. Bereits bestaetigte Konten werden auf
// status angenommen gesetzt. Ohne RESEND_API_KEY: Rueckfall auf die Supabase-Auth-Mail (inviteUserByEmail / OTP).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Pflichtangabe. Fehlt sie, geht NICHTS hinaus: ein Rueckfall auf
// eine Adresse, die niemandem gehoert, sieht aus wie Betrieb, kommt
// aber nirgends an. Begruendung in docs/OFFEN.md.
function immoFehlt(was: string): never {
  throw new Error(was + " fehlt (siehe docs/SECRETS.md). Ohne diese " +
    "Angabe ginge eine Nachricht mit einer Adresse hinaus, die " +
    "niemandem gehoert \u2014 deshalb geht gar keine.");
}


// --- Gehoert diese Adresse zum Mandanten selbst? (Phase 2.4) ------------
// Hier stand die Mail-Domain der Referenz im Quelltext. Die
// Neutralisierung hat daraus eine Domain gemacht, die es nicht gibt
// (die Platzhalter-Domain mit angehaengtem ".de") - die Pruefung konnte
// seither NIE zutreffen, und jede dieser Funktionen hat immer als Firma
// gesendet statt als zustaendiger Makler. Ein stiller Verhaltenswechsel,
// den kein Gate sieht: die Zeile ist syntaktisch in Ordnung, sie ist nur
// immer falsch.
//
// Verglichen wird jetzt die Domain, nicht die Zeichenkette. Welche die
// eigene ist, sagt der Mandant selbst - ueber die Absenderadresse oder
// die Mailadresse seiner Stammdaten. Ohne eine von beiden ist die
// Antwort false, und es wird wie bisher als Firma gesendet.
function immoEigeneAdresse(adresse: unknown, eigene: unknown): boolean {
  const domain = (x: unknown) =>
    String(x || "").trim().toLowerCase().split("@")[1] || "";
  const a = domain(adresse), e = domain(eigene);
  return !!a && !!e && a === e;
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
import { anredeZeile, baueEinladungsMail, zugangUrlAus } from "./einladung-mail.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const antwort = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });
const MIN_ALTER_STUNDEN = 20, MIN_ABSTAND_TAGE = 3, MAX_ERINNERUNGEN = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return antwort({ ok: false, error: "Nur POST" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const portalUrl = (Deno.env.get("PORTAL_URL") || immoFehlt("PORTAL_URL")).replace(/\/?$/, "/");
    const resendKey = Deno.env.get("RESEND_API_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const body = await req.json().catch(() => ({}));
    const gezielt: string | null = body.eigentuemer_id || null;
    await immoMandantSichern(req, [["eigentuemer", String(gezielt || "")]]);
    const erzwingen = !!body.erzwingen || !!gezielt;
    const jetzt = new Date();

    let q = admin.from("eigentuemer_einladungen").select("*").eq("status", "offen").not("eigentuemer_id", "is", null).gt("abgelaufen_am", jetzt.toISOString()).order("created_at", { ascending: false }).limit(100);
    if (gezielt) q = q.eq("eigentuemer_id", gezielt);
    const { data: einladungen, error: eErr } = await q;
    if (eErr) throw eErr;
    // je Eigentuemer nur die neueste Einladung
    const jeEig = new Map<string, any>();
    for (const e of einladungen || []) if (!jeEig.has(e.eigentuemer_id)) jeEig.set(e.eigentuemer_id, e);

    // Der Briefkopf gehoert dem Mandanten der Einladung, nicht der ersten
    // Firma in der Tabelle. Er wird deshalb je Mandant geholt und gemerkt.
    const firmenCache = new Map<string, any>();
    const firmaFuer = async (mandant: string | null) => {
      if (!mandant) return null;
      if (!firmenCache.has(mandant)) {
        const { data } = await admin.from("firma_stammdaten").select("firma_name, email, web")
          .eq("mandant_id", mandant).eq("aktiv", true).order("sortierung").limit(1).maybeSingle();
        firmenCache.set(mandant, data || null);
      }
      return firmenCache.get(mandant) || null;
    };

    const details: any[] = []; let gesendet = 0, uebersprungen = 0, angenommen = 0;
    for (const einl of jeEig.values()) {
      const info: any = { eigentuemer_id: einl.eigentuemer_id, email: einl.email };
      const firmaRow = await firmaFuer(einl.mandant_id || null);
      const firma = firmaRow?.firma_name || "";
      const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || firmaRow?.email || immoFehlt("eine Absenderadresse (Postfach, Firmenstammdaten oder SMTP_FROM_EMAIL)");
      try {
        const { data: eig } = await admin.from("eigentuemer").select("id, anrede, titel, vorname, nachname, email, user_id, aktiv").eq("id", einl.eigentuemer_id).maybeSingle();
        if (!eig || eig.aktiv === false || !eig.email) { uebersprungen++; info.grund = "Eigentümer inaktiv oder ohne E-Mail"; details.push(info); continue; }
        const email = String(eig.email).trim().toLowerCase();
        // Konto schon bestaetigt / angemeldet? -> Einladung schliessen
        let userId: string | null = eig.user_id || null;
        if (userId) {
          const { data: u } = await admin.auth.admin.getUserById(userId);
          const usr: any = u?.user;
          if (usr && (usr.email_confirmed_at || usr.confirmed_at || usr.last_sign_in_at)) {
            await admin.from("eigentuemer_einladungen").update({ status: "angenommen", angenommen_am: usr.last_sign_in_at || usr.email_confirmed_at || usr.confirmed_at }).eq("id", einl.id);
            angenommen++; info.grund = "Konto bereits bestätigt – Einladung geschlossen"; details.push(info); continue;
          }
        }
        if (!erzwingen) {
          const alterStd = (jetzt.getTime() - new Date(einl.created_at).getTime()) / 36e5;
          if (alterStd < MIN_ALTER_STUNDEN) { uebersprungen++; info.grund = "Einladung jünger als 20 Stunden"; details.push(info); continue; }
          if ((einl.erinnerungen || 0) >= MAX_ERINNERUNGEN) { uebersprungen++; info.grund = "Höchstzahl an Erinnerungen erreicht"; details.push(info); continue; }
          if (einl.erinnert_am && (jetzt.getTime() - new Date(einl.erinnert_am).getTime()) / 864e5 < MIN_ABSTAND_TAGE) { uebersprungen++; info.grund = "zuletzt vor weniger als 3 Tagen erinnert"; details.push(info); continue; }
        }
        // Ansprechpartner
        const { data: eo } = await admin.from("eigentuemer_objekte").select("ansprechpartner_id").eq("mandant_id", einl.mandant_id).eq("eigentuemer_id", eig.id).not("ansprechpartner_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const { data: makler } = eo?.ansprechpartner_id ? await admin.from("profiles").select("id, name, email, telefon, titel").eq("id", eo.ansprechpartner_id).maybeSingle() : { data: null as any };
        const maklerName = makler?.name || firma;
        const anrede = anredeZeile(eig.anrede || "", eig.titel || "", eig.vorname || "", eig.nachname || "");
        let versandweg = "resend";
        if (resendKey) {
          // Link erzeugen (invite legt das Konto an, magiclink fuer bestehende Konten)
          let link = "";
          if (!userId) {
            const { data: gl, error: glErr } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: portalUrl, data: { role_hint: "eigentuemer", vorname: eig.vorname, nachname: eig.nachname, invited_by: maklerName } } });
            if (glErr) throw new Error("Link (invite): " + glErr.message);
            link = gl?.properties?.action_link || ""; userId = gl?.user?.id || null;
            if (userId) {
              await admin.from("eigentuemer").update({ user_id: userId }).eq("id", eig.id);
              const { data: prof } = await admin.from("profiles").select("id, role").eq("id", userId).maybeSingle();
              const fullName = [eig.vorname, eig.nachname].filter(Boolean).join(" ") || email;
              if (!prof) await admin.from("profiles").insert({ id: userId, role: "eigentuemer", name: fullName, email });
              else if (prof.role !== "chef") await admin.from("profiles").update({ role: "eigentuemer", name: fullName, email }).eq("id", userId);
            }
          } else {
            const { data: gl, error: glErr } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: portalUrl } });
            if (glErr) throw new Error("Link (magiclink): " + glErr.message);
            link = gl?.properties?.action_link || "";
          }
          if (!link) throw new Error("Kein Anmeldelink erzeugt.");
          const m = baueEinladungsMail({ anrede, link, makler: maklerName, telefon: makler?.telefon || "", firma, web: firmaRow?.web || "", erneut: true, zugangUrl: zugangUrlAus(portalUrl) });
          const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: `${firma} <${fromEmail}>`, to: [email], reply_to: makler?.email && immoEigeneAdresse(makler.email, fromEmail) ? makler.email : fromEmail, subject: m.betreff, text: m.text, html: m.html }) });
          const rTxt = await r.text();
          if (!r.ok) throw new Error(`Resend ${r.status}: ${rTxt.slice(0, 300)}`);
          let resendId = ""; try { resendId = JSON.parse(rTxt).id || ""; } catch (_) { /* egal */ }
          await admin.from("mail_versendet").insert({ absender_email: fromEmail, absender_name: firma, empfaenger_email: email, empfaenger_name: [eig.vorname, eig.nachname].filter(Boolean).join(" "), betreff: m.betreff, body_text: m.text, body_html: m.html, status: "gesendet", gesendet_am: new Date().toISOString(), automatisch: true, versendet_von_user_id: makler?.id || null, smtp_message_id: resendId || null });
        } else {
          versandweg = "supabase-auth";
          if (!userId) {
            const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: portalUrl, data: { role_hint: "eigentuemer", vorname: eig.vorname, nachname: eig.nachname } });
            if (invErr) throw new Error("Einladung: " + invErr.message);
            if (inv?.user?.id) await admin.from("eigentuemer").update({ user_id: inv.user.id }).eq("id", eig.id);
          } else {
            if (!anonKey) throw new Error("SUPABASE_ANON_KEY fehlt für den OTP-Versand.");
            const anon = createClient(url, anonKey, { auth: { persistSession: false } });
            const { error: otpErr } = await anon.auth.signInWithOtp({ email, options: { emailRedirectTo: portalUrl, shouldCreateUser: false } });
            if (otpErr) throw new Error("OTP: " + otpErr.message);
          }
        }
        await admin.from("eigentuemer_einladungen").update({ erinnert_am: new Date().toISOString(), erinnerungen: (einl.erinnerungen || 0) + 1, versandweg, letzter_fehler: null }).eq("id", einl.id);
        await admin.from("aktivitaeten").insert({ zielgruppe: "makler", eigentuemer_id: eig.id, typ: "einladung_nachgefasst", titel: `Anmeldelink erneut gesendet an ${email}`, text: `Versandweg ${versandweg}, ${(einl.erinnerungen || 0) + 1}. Erinnerung. Konto bislang nicht bestätigt.`, ref_tabelle: "eigentuemer_einladungen", ref_id: einl.id });
        gesendet++; info.gesendet = true; info.versandweg = versandweg; details.push(info);
      } catch (e) {
        const msg = String((e as Error)?.message || e);
        info.fehler = msg; details.push(info);
        await admin.from("eigentuemer_einladungen").update({ letzter_fehler: msg.slice(0, 500) }).eq("id", einl.id);
        await admin.from("mail_versendet").insert({ absender_email: fromEmail, absender_name: firma, empfaenger_email: einl.email, betreff: "Ihr Zugang zum Eigentümer-Portal – neuer Anmeldelink", status: "fehler", fehler_text: msg.slice(0, 500), gesendet_am: new Date().toISOString(), automatisch: true }).then(() => {}, () => {});
      }
    }
    return antwort({ ok: true, geprueft: jeEig.size, gesendet, angenommen, uebersprungen, versandweg: resendKey ? "resend" : "supabase-auth", details });
  } catch (e) {
    return antwort({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
