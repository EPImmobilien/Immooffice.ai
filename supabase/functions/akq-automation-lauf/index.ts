// ============================================================================
// akq-automation-lauf v2 — Akquise-Automationen planen und ausfuehren
// ----------------------------------------------------------------------------
// Zwei Aufgaben in einer Funktion:
//   aktion "planen"     -> fuer EINEN Lead die Automationen seiner aktuellen
//                          Stufe als akq_automation_lauf-Zeilen einplanen
//                          (wird vom Portal nach jedem Stufenwechsel gerufen)
//   aktion "ausfuehren" -> alle faelligen Laeufe abarbeiten (Cron alle 10 Min)
//   aktion "beides"     -> erst planen, dann ausfuehren
//
// Schutzregeln (bewusst konservativ):
//   * nie mehr als EINE Automations-Mail pro Lead und Tag
//   * Stopp, sobald der Eigentuemer geantwortet hat (Abgleich mail_eingang)
//   * Opt-out am Kontakt (kontakte.werbung_opt_out) wird respektiert
//   * Stufenwechsel oder abgeschlossener Lead bricht offene Laeufe ab
//   * WhatsApp ist vorbereitet, aber noch nicht freigeschaltet
//   * Kanal "vorschlag": verschickt nichts, sondern legt die vorformulierte
//     Mail als Aufgabe ins Dashboard des Zustaendigen (anrufen oder senden)
//
// Body: { aktion?, lead_id?, trocken?, limit? }
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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const eur = (n: unknown) =>
  n === null || n === undefined || n === "" || isNaN(Number(n))
    ? "—"
    : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));

function anredeZeile(k: any): string {
  const name = [k?.titel, k?.nachname].filter(Boolean).join(" ");
  const a = String(k?.anrede || "").toLowerCase();
  if (!k?.nachname) return "Guten Tag,";
  if (a.startsWith("herr")) return `Sehr geehrter Herr ${name},`;
  if (a.startsWith("frau")) return `Sehr geehrte Frau ${name},`;
  return `Guten Tag ${[k.vorname, name].filter(Boolean).join(" ")},`;
}

const kontaktName = (k: any) =>
  [k?.vorname, k?.nachname].filter(Boolean).join(" ") || k?.firma || k?.email || "";

function objektAdresse(lead: any, immo: any): string {
  if (immo) {
    return [
      [immo.strasse, immo.hausnummer].filter(Boolean).join(" "),
      [immo.plz, immo.ort].filter(Boolean).join(" "),
    ].filter(Boolean).join(", ");
  }
  return [
    [lead.strasse, lead.hausnummer].filter(Boolean).join(" "),
    [lead.plz, lead.ort].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
}

function objektKurz(lead: any, immo: any): string {
  if (immo) return immo.bezeichnung || immo.objekttitel || [immo.strasse, immo.hausnummer].filter(Boolean).join(" ") || "Ihre Immobilie";
  return lead.titel || [lead.strasse, lead.hausnummer].filter(Boolean).join(" ") || (lead.ort ? `Ihre Immobilie in ${lead.ort}` : "Ihre Immobilie");
}

// ---- Platzhalter ----------------------------------------------------------
// Portal-Syntax {{name}} und onpreo-Syntax {{var:guestName:""}} (Import-Kompatibilitaet)
const ONPREO_MAP: Record<string, string> = {
  guestname: "eigentuemer_name",
  guestmail: "eigentuemer_mail",
  guestphone: "eigentuemer_telefon",
  realestateshort: "objekt_kurz",
  realestateaddress: "objekt_adresse",
  agentname: "makler_name",
  agentmail: "makler_mail",
  agentphone: "makler_telefon",
  price: "wert",
};

function platzhalterFuellen(text: string, werte: Record<string, string>): string {
  if (!text) return "";
  // onpreo: {{var:name:"fallback"}}
  let out = text.replace(/\{\{\s*var\s*:\s*([A-Za-z0-9_]+)\s*:\s*"([^"]*)"\s*\}\}/g, (_m, name, fallback) => {
    const key = ONPREO_MAP[String(name).toLowerCase()] || String(name).toLowerCase();
    const v = werte[key];
    return v !== undefined && v !== "" ? v : fallback;
  });
  // Portal: {{name}}
  out = out.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, name) => {
    const key = String(name).toLowerCase();
    const v = werte[ONPREO_MAP[key] || key];
    return v !== undefined ? v : "";
  });
  return out;
}

// ---- Mailversand (Resend zuerst, All-Inkl-SMTP als Rueckfallebene) ---------
async function entschluessele(verschluesselt: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = verschluesselt.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungueltiges Passwort-Format");
  const iv = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
}

async function postfachFuer(db: any, userId: string | null) {
  if (userId) {
    const { data } = await db.from("mail_postfaecher").select("*").eq("benutzer_id", userId).eq("aktiv", true)
      .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);
    if (data && data.length) return data[0];
  }
  const { data } = await db.from("mail_postfaecher").select("*").eq("aktiv", true)
    .order("ist_standard", { ascending: false }).limit(1);
  return (data && data[0]) || null;
}

async function mailSenden(db: any, p: {
  postfach: any; an: string; anName?: string; betreff: string; text: string; userId?: string | null;
}): Promise<{ ok: boolean; id?: string; messageId?: string | null; weg?: string; fehler?: string }> {
  const pf = p.postfach;
  if (!pf) return { ok: false, fehler: "Kein aktives Postfach hinterlegt." };

  const sig = (pf.signatur || "").trim();
  const hatSig = sig && (p.text.includes(sig.slice(0, 40).trim()) || p.text.includes("Musterhaus Immobilien GmbH"));
  const voll = !sig || hatSig ? p.text : `${p.text}\n\n--\n${sig}`;
  const clean = voll.split("\n").map((z: string) => z.replace(/[ \t]+$/, "")).join("\n");

  let weg = "", messageId: string | null = null, letzterFehler = "";
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${pf.absender_name} <${pf.email_adresse}>`,
          to: [p.anName ? `${p.anName} <${p.an}>` : p.an],
          reply_to: pf.email_adresse,
          subject: p.betreff,
          text: clean,
        }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
      const rj = await r.json().catch(() => ({}));
      messageId = rj?.id ? `resend:${rj.id}` : "resend";
      weg = "resend";
    } catch (e) {
      letzterFehler = e instanceof Error ? e.message : String(e);
    }
  }
  if (!weg) {
    if (!pf.smtp_passwort_verschluesselt) {
      return { ok: false, fehler: letzterFehler ? `Resend: ${letzterFehler}; kein SMTP-Passwort hinterlegt` : "Postfach ohne Passwort" };
    }
    try {
      const passwort = await entschluessele(pf.smtp_passwort_verschluesselt);
      const transporter = nodemailer.createTransport({
        host: pf.smtp_server, port: Number(pf.smtp_port),
        secure: Number(pf.smtp_port) === 465 || pf.smtp_security === "ssl",
        auth: { user: pf.smtp_user, pass: passwort },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
      });
      const res = await transporter.sendMail({
        from: `"${pf.absender_name}" <${pf.email_adresse}>`,
        to: p.anName ? `"${p.anName}" <${p.an}>` : p.an,
        subject: p.betreff, text: clean,
      });
      messageId = res?.messageId || null;
      weg = "smtp";
    } catch (e) {
      const smtpFehler = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      const fehler = letzterFehler ? `Resend: ${letzterFehler} | SMTP: ${smtpFehler}` : smtpFehler;
      await db.from("mail_versendet").insert({
        postfach_id: pf.id, versendet_von_user_id: p.userId || null,
        absender_email: pf.email_adresse, absender_name: pf.absender_name,
        empfaenger_email: p.an, empfaenger_name: p.anName || null,
        betreff: p.betreff, body_text: clean, status: "fehler", fehler_text: fehler,
      });
      return { ok: false, fehler };
    }
  }
  const { data: log } = await db.from("mail_versendet").insert({
    postfach_id: pf.id, versendet_von_user_id: p.userId || null,
    absender_email: pf.email_adresse, absender_name: pf.absender_name,
    empfaenger_email: p.an, empfaenger_name: p.anName || null,
    betreff: p.betreff, body_text: clean, status: "gesendet", smtp_message_id: messageId,
  }).select().single();
  return { ok: true, id: log?.id, messageId, weg };
}

// ---- Planen ---------------------------------------------------------------
async function planen(db: any, leadId: string, trocken: boolean) {
  const { data: lead } = await db.from("akq_leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) throw new Error("Lead nicht gefunden.");
  if (lead.status !== "offen") return { geplant: 0, grund: "lead_abgeschlossen" };
  if (!lead.stufe_id) return { geplant: 0, grund: "keine_stufe" };

  // Offene Laeufe der alten Stufe abbrechen — der Lead ist weitergezogen.
  if (!trocken) {
    await db.from("akq_automation_lauf").update({ status: "abgebrochen", fehler: "Stufe gewechselt" })
      .eq("lead_id", leadId).eq("status", "geplant");
  }

  const { data: autos } = await db.from("akq_automationen").select("*").eq("aktiv", true).eq("stufe_id", lead.stufe_id);
  const passend = (autos || []).filter((a: any) => !a.quelle_id || a.quelle_id === lead.quelle_id);

  const { data: schon } = await db.from("akq_automation_lauf").select("automation_id, status").eq("lead_id", leadId);
  const erledigt = new Set((schon || []).filter((r: any) => r.status === "erledigt").map((r: any) => r.automation_id));

  let geplant = 0;
  for (const a of passend) {
    if (erledigt.has(a.id)) continue;          // pro Lead einmal, auch bei erneutem Zug in dieselbe Stufe
    const wann = new Date(Date.now() + Number(a.verzoegerung_stunden || 0) * 3600000).toISOString();
    if (!trocken) {
      const { error } = await db.from("akq_automation_lauf").insert({
        lead_id: leadId, automation_id: a.id, kanal: a.kanal, geplant_fuer: wann, status: "geplant",
      });
      if (error) throw error;
    }
    geplant++;
  }
  return { geplant, gepruefte_automationen: passend.length };
}

// ---- Ausfuehren -----------------------------------------------------------
async function ausfuehren(db: any, grenze: number, trocken: boolean) {
  const { data: laeufe } = await db.from("akq_automation_lauf")
    .select("*").eq("status", "geplant").lte("geplant_fuer", new Date().toISOString())
    .order("geplant_fuer").limit(grenze);

  const log: any[] = [];
  let gesendet = 0, aufgaben = 0, abgebrochen = 0, verschoben = 0, vorschlaege = 0;

  for (const lauf of laeufe || []) {
    const e: any = { lauf_id: lauf.id, lead_id: lauf.lead_id };
    const abbrechen = async (grund: string) => {
      e.ergebnis = "abgebrochen"; e.grund = grund; abgebrochen++;
      if (!trocken) await db.from("akq_automation_lauf").update({ status: "abgebrochen", fehler: grund, ausgefuehrt_am: new Date().toISOString() }).eq("id", lauf.id);
    };
    try {
      const { data: lead } = await db.from("akq_leads").select("*").eq("id", lauf.lead_id).maybeSingle();
      if (!lead) { await abbrechen("Lead gelöscht"); log.push(e); continue; }
      if (lead.status !== "offen") { await abbrechen("Lead abgeschlossen"); log.push(e); continue; }

      const { data: auto } = await db.from("akq_automationen").select("*").eq("id", lauf.automation_id).maybeSingle();
      if (!auto || !auto.aktiv) { await abbrechen("Automation deaktiviert"); log.push(e); continue; }
      if (auto.stufe_id !== lead.stufe_id) { await abbrechen("Stufe gewechselt"); log.push(e); continue; }

      const kontakt = lead.kontakt_id
        ? (await db.from("kontakte").select("*").eq("id", lead.kontakt_id).maybeSingle()).data
        : null;
      if (kontakt?.werbung_opt_out) { await abbrechen("Kontakt hat Werbung abbestellt"); log.push(e); continue; }

      const immo = lead.immobilie_id
        ? (await db.from("immobilien").select("*").eq("id", lead.immobilie_id).maybeSingle()).data
        : null;
      const makler = lead.zustaendig_id
        ? (await db.from("profiles").select("id, name, email, telefon, funktion").eq("id", lead.zustaendig_id).maybeSingle()).data
        : null;
      const vorlage = auto.vorlage_id
        ? (await db.from("akq_vorlagen").select("*").eq("id", auto.vorlage_id).maybeSingle()).data
        : null;

      const werte: Record<string, string> = {
        anrede: anredeZeile(kontakt || {}),
        eigentuemer_name: kontaktName(kontakt || {}),
        eigentuemer_mail: kontakt?.email || "",
        eigentuemer_telefon: kontakt?.telefon || kontakt?.mobil || "",
        objekt_kurz: objektKurz(lead, immo),
        objekt_adresse: objektAdresse(lead, immo),
        wert: eur(lead.wert_schaetzung),
        spanne: lead.wert_min && lead.wert_max ? `${eur(lead.wert_min)} – ${eur(lead.wert_max)}` : "—",
        startpreis: eur(lead.startpreis),
        provision: eur(lead.provision_erwartet),
        makler_name: makler?.name || "Ihr Musterhaus Immobilien Team",
        makler_telefon: makler?.telefon || "",
        makler_mail: makler?.email || "",
      };

      // ---- Aufgabe --------------------------------------------------------
      if (auto.kanal === "aufgabe") {
        if (!trocken) {
          await db.from("akq_aktivitaeten").insert({
            lead_id: lead.id, typ: "aufgabe",
            betreff: platzhalterFuellen(vorlage?.name || auto.name || "Automatische Aufgabe", werte),
            notiz: platzhalterFuellen(vorlage?.inhalt || "", werte),
            faellig_am: new Date().toISOString(), prioritaet: "normal",
            zustaendig_id: lead.zustaendig_id, automation_id: auto.id,
          });
          await db.from("akq_automation_lauf").update({
            status: "erledigt", ausgefuehrt_am: new Date().toISOString(),
            betreff: vorlage?.name || auto.name || null, inhalt: platzhalterFuellen(vorlage?.inhalt || "", werte),
          }).eq("id", lauf.id);
        }
        e.ergebnis = "aufgabe"; aufgaben++; log.push(e); continue;
      }

      // ---- WhatsApp (vorbereitet, noch nicht freigeschaltet) ---------------
      if (auto.kanal === "whatsapp") { await abbrechen("WhatsApp-Versand noch nicht freigeschaltet"); log.push(e); continue; }

      // ---- Vorschlag: nichts wird verschickt -------------------------------
      // Der Lead landet als Aufgabe im Dashboard des Zustaendigen. Der
      // entscheidet dann: anrufen oder die vorformulierte Mail aus dem eigenen
      // Postfach senden. So bekommt niemand ungefragt Post, der zunaechst nur
      // eine Bewertung wollte.
      if (auto.kanal === "vorschlag") {
        const mail = String(kontakt?.email || "").trim();
        if (mail) {
          const { data: antwortV } = await db.from("mail_eingang").select("id")
            .ilike("absender_email", mail).neq("ordner", "gesendet")
            .gt("gesendet_am", lead.created_at).limit(1);
          if (antwortV && antwortV.length) {
            if (!trocken) {
              await db.from("akq_automation_lauf").update({ status: "abgebrochen", fehler: "Eigentümer hat geantwortet", ausgefuehrt_am: new Date().toISOString() })
                .eq("lead_id", lead.id).eq("status", "geplant");
            }
            e.ergebnis = "abgebrochen"; e.grund = "Eigentümer hat geantwortet"; abgebrochen++; log.push(e); continue;
          }
        }
        const { data: offenSchon } = await db.from("aufgaben").select("id")
          .eq("lead_id", lead.id).eq("typ", "akq_nachfassen").eq("status", "offen").limit(1);
        if (offenSchon && offenSchon.length) { await abbrechen("Es liegt schon ein Nachfass-Vorschlag offen"); log.push(e); continue; }

        const vBetreff = platzhalterFuellen(vorlage?.betreff || auto.name || "Nachfassen", werte);
        const vText = platzhalterFuellen(vorlage?.inhalt || "", werte);
        const telefon = String(kontakt?.telefon || kontakt?.mobil || "").trim();
        if (!trocken) {
          await db.from("aufgaben").insert({
            typ: "akq_nachfassen", status: "offen",
            titel: `Nachfassen: ${objektKurz(lead, immo)}`,
            beschreibung: [vorlage?.name || auto.name, telefon ? `Tel. ${telefon}` : null, mail ? null : "keine E-Mail-Adresse hinterlegt"].filter(Boolean).join(" · "),
            lead_id: lead.id,
            kontakt_id: lead.kontakt_id || null,
            immobilie_id: lead.immobilie_id || null,
            zustaendig_id: lead.zustaendig_id || null,
            faellig_am: new Date().toISOString().slice(0, 10),
            entwurf_betreff: vBetreff,
            entwurf_text: vText,
            empfaenger_email: mail || null,
            empfaenger_name: werte.eigentuemer_name || null,
            daten: { automation_id: auto.id, telefon: telefon || null, quelle: "akq_automation" },
          });
          await db.from("akq_automation_lauf").update({
            status: "erledigt", ausgefuehrt_am: new Date().toISOString(),
            betreff: vBetreff, inhalt: vText, fehler: "als Vorschlag ins Dashboard gelegt",
          }).eq("id", lauf.id);
        }
        e.ergebnis = "vorschlag"; vorschlaege++; log.push(e); continue;
      }

      // ---- Mail -----------------------------------------------------------
      const an = String(kontakt?.email || "").trim();
      if (!an) { await abbrechen("Kontakt ohne E-Mail-Adresse"); log.push(e); continue; }

      // Eigentuemer hat geantwortet? -> alle offenen Laeufe dieses Leads stoppen
      const { data: antwort } = await db.from("mail_eingang").select("id, betreff, gesendet_am")
        .ilike("absender_email", an).neq("ordner", "gesendet")
        .gt("gesendet_am", lead.created_at).limit(1);
      if (antwort && antwort.length) {
        if (!trocken) {
          await db.from("akq_automation_lauf").update({ status: "abgebrochen", fehler: "Eigentümer hat geantwortet", ausgefuehrt_am: new Date().toISOString() })
            .eq("lead_id", lead.id).eq("status", "geplant");
        }
        e.ergebnis = "abgebrochen"; e.grund = "Eigentümer hat geantwortet"; abgebrochen++; log.push(e); continue;
      }

      // Max. eine Automations-Mail pro Lead und Tag
      const tagesBeginn = new Date(); tagesBeginn.setHours(0, 0, 0, 0);
      const { data: heuteSchon } = await db.from("akq_automation_lauf").select("id")
        .eq("lead_id", lead.id).eq("kanal", "mail").eq("status", "erledigt")
        .gte("ausgefuehrt_am", tagesBeginn.toISOString()).limit(1);
      if (heuteSchon && heuteSchon.length) {
        const morgen = new Date(); morgen.setDate(morgen.getDate() + 1); morgen.setHours(9, 0, 0, 0);
        if (!trocken) await db.from("akq_automation_lauf").update({ geplant_fuer: morgen.toISOString() }).eq("id", lauf.id);
        e.ergebnis = "verschoben"; e.grund = "Tageslimit erreicht"; verschoben++; log.push(e); continue;
      }

      const betreff = platzhalterFuellen(vorlage?.betreff || auto.name || "Ihre Immobilie", werte);
      const text = platzhalterFuellen(vorlage?.inhalt || "", werte);
      if (!text.trim()) { await abbrechen("Vorlage ohne Inhalt"); log.push(e); continue; }

      e.betreff = betreff; e.an = an;
      if (trocken) { e.ergebnis = "trocken"; log.push(e); continue; }

      const pf = await postfachFuer(db, lead.zustaendig_id);
      const res = await mailSenden(db, { postfach: pf, an, anName: kontaktName(kontakt), betreff, text, userId: lead.zustaendig_id });
      if (!res.ok) {
        e.ergebnis = "fehler"; e.grund = res.fehler;
        await db.from("akq_automation_lauf").update({ status: "fehler", fehler: res.fehler, ausgefuehrt_am: new Date().toISOString() }).eq("id", lauf.id);
        log.push(e); continue;
      }
      await db.from("akq_automation_lauf").update({
        status: "erledigt", ausgefuehrt_am: new Date().toISOString(),
        betreff, inhalt: text, mail_versendet_id: res.id || null,
      }).eq("id", lauf.id);
      await db.from("akq_aktivitaeten").insert({
        lead_id: lead.id, typ: "mail", betreff, notiz: text,
        erledigt_am: new Date().toISOString(), faellig_am: new Date().toISOString(),
        zustaendig_id: lead.zustaendig_id, automation_id: auto.id,
      });
      e.ergebnis = "gesendet"; gesendet++;
      log.push(e);
    } catch (err) {
      e.ergebnis = "fehler"; e.grund = err instanceof Error ? err.message : String(err);
      if (!trocken) await db.from("akq_automation_lauf").update({ status: "fehler", fehler: e.grund, ausgefuehrt_am: new Date().toISOString() }).eq("id", lauf.id);
      log.push(e);
    }
  }
  return { geprueft: (laeufe || []).length, gesendet, aufgaben, vorschlaege, abgebrochen, verschoben, log };
}

// ---- Einstieg -------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    // Nutzeraufrufe pruefen; der Cron kommt mit Anon-Key ohne User und darf durch.
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
      }
    }
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const aktion = String(body.aktion || (body.lead_id ? "planen" : "ausfuehren"));
    const trocken = body.trocken === true;
    const grenze = Math.min(Math.max(Number(body.limit) || 50, 1), 200);

    const out: any = { ok: true, aktion, trocken };
    if (aktion === "planen" || aktion === "beides") {
      if (!body.lead_id) throw new Error("lead_id fehlt.");
      await immoMandantSichern(req, [["akq_leads", String(body.lead_id)]]);
      out.planung = await planen(db, String(body.lead_id), trocken);
    }
    if (aktion === "ausfuehren" || aktion === "beides") {
      out.lauf = await ausfuehren(db, grenze, trocken);
    }
    return antwort(out);
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
