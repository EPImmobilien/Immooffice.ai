// ============================================================================
// termin-erinnerung v5 — Erinnerungs-Mail ca. 6 h vor dem Termin an den Kontakt
// ----------------------------------------------------------------------------
// Läuft stündlich (Cron). Nimmt Termine mit Adressbuch-Kontakt, erinnerung=true,
// noch ohne erinnerung_status. Fällig ist die Erinnerung 6 h vor Beginn; fiele
// dieser Zeitpunkt in die Nacht (vor 7 Uhr), wird am Vorabend um 18 Uhr erinnert.
//   - Wurde der Termin erst innerhalb der letzten 6 h vor Beginn angelegt
//     ("man trifft sich eh gleich"), wird NICHT erinnert (Status uebersprungen).
//   - Absender: Postfach des Termin-Erstellers (Fallback: Teilnehmer-Name, dann Chef).
//   - Versand per Resend direkt (Cron hat keinen Nutzer-Token für mail-senden),
//     Eintrag in mail_versendet (erscheint in Gesendet und im E-Mail-Verlauf des Kontakts).
// v5 (26.09.2026): Interne/private Termine (Akquise, Urlaub, Teammeeting ...) werden uebersprungen (Stufe 96).
// v4 (26.09.2026): Chef-Rueckfall fuer das Absender-Postfach repariert (Einbettung profiles!inner lief ins Leere).
// v3 (26.09.2026): Signatur genau einmal — die Grußformel des Textes wird durch die
//     Postfach-Signatur ersetzt (mail-signatur.ts); ohne Signatur bleibt die Grußformel.
// Body (optional): { termin_id: "…" (nur diesen, ohne Zeitfenster), trocken: true }
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
import { mitSignatur } from "./mail-signatur.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const VORLAUF_STUNDEN = 6;
// Terminarten ohne Kundenkontakt (gleiche Regel wie kalArtIntern im Portal, Stufe 96)
const INTERN_ART = /^\s*(akquise|urlaub|teammeeting|intern|privat|krank|fortbildung|schulung|b(ü|ue)ro)/i;
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

// Beginn des Termins als echter Zeitpunkt (Europa/Berlin, Sommer-/Winterzeit korrekt)
function terminBeginn(datum: string, uhrzeit: string | null): Date {
  const [j, m, t] = datum.split("-").map((x) => parseInt(x, 10));
  const [hh, mi] = String(uhrzeit || "09:00").slice(0, 5).split(":").map((x) => parseInt(x, 10));
  const utcGuess = Date.UTC(j, m - 1, t, hh, mi);
  const fmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" });
  const lokalStunde = parseInt(fmt.format(new Date(utcGuess)), 10);
  const offset = (lokalStunde - hh + 24) % 24;          // 1 im Winter, 2 im Sommer
  return new Date(utcGuess - offset * 3600 * 1000);
}
// Fälligkeit: 6 h vor Beginn; liegt das vor 7 Uhr (Berlin), stattdessen Vorabend 18 Uhr
function faelligAb(beginn: Date): Date {
  const roh = new Date(beginn.getTime() - VORLAUF_STUNDEN * 3600 * 1000);
  const teile = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(roh);
  const get = (t: string) => teile.find((p) => p.type === t)?.value || "00";
  const stunde = parseInt(get("hour"), 10);
  if (stunde >= 7) return roh;
  const tagDavor = new Date(Date.UTC(parseInt(get("year"), 10), parseInt(get("month"), 10) - 1, parseInt(get("day"), 10) - 1, 12));
  return terminBeginn(tagDavor.toISOString().slice(0, 10), "18:00");
}
function datumLang(datum: string): string {
  const [j, m, t] = datum.split("-").map((x) => parseInt(x, 10));
  const d = new Date(Date.UTC(j, m - 1, t, 12));
  return `${WOCHENTAGE[d.getUTCDay()]}, ${t}. ${MONATE[m - 1]} ${j}`;
}
function anrede(k: any): string {
  const name = [k.titel, k.nachname].filter(Boolean).join(" ");
  const a = String(k.anrede || "").toLowerCase();
  if (!k.nachname) return "Guten Tag,";
  if (a.startsWith("herr")) return `Sehr geehrter Herr ${name},`;
  if (a.startsWith("frau")) return `Sehr geehrte Frau ${name},`;
  return `Guten Tag ${[k.vorname, name].filter(Boolean).join(" ")},`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) throw new Error("Keine Berechtigung.");
      }
    }
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY nicht gesetzt");
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const trocken = body.trocken === true;
    const jetzt = new Date();
    const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt);
    const morgen = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(jetzt.getTime() + 36 * 3600 * 1000));

    await immoMandantSichern(req, [["termine", String(body.termin_id || "")]]);
    let q = db.from("termine").select("id, titel, art, datum, uhrzeit, ende, ganztags, ort, privat, ersteller_id, ersteller_name, teilnehmer, kontakt_id, immobilie_id, status, created_at, erinnerung, erinnerung_status, mandant_id")
      .not("kontakt_id", "is", null).eq("erinnerung", true).is("erinnerung_status", null).neq("status", "storniert");
    if (body.termin_id) q = q.eq("id", body.termin_id); else q = q.gte("datum", heute).lte("datum", morgen);
    const { data: termine, error } = await q;
    if (error) throw error;

    const log: any[] = [];
    let gesendet = 0, uebersprungen = 0;
    for (const t of termine || []) {
      const eintrag: any = { termin_id: t.id, titel: t.titel, datum: t.datum, uhrzeit: t.uhrzeit };
      const setze = async (status: string, extra: any = {}) => { eintrag.ergebnis = status; if (!trocken) await db.from("termine").update({ erinnerung_status: status, erinnerung_am: new Date().toISOString(), ...extra }).eq("id", t.id); };
      try {
        const beginn = terminBeginn(t.datum, t.ganztags ? "09:00" : t.uhrzeit);
        const faellig = faelligAb(beginn);
        eintrag.beginn = beginn.toISOString(); eintrag.faellig_ab = faellig.toISOString();
        if (!body.termin_id) {
          if (beginn <= jetzt) { await setze("uebersprungen", { erinnerung_fehler: "Termin bereits begonnen" }); uebersprungen++; log.push(eintrag); continue; }
          if (faellig > jetzt) { eintrag.ergebnis = "noch nicht faellig"; log.push(eintrag); continue; }
        }
        // v5: Interne oder private Termine (Akquise-Anruf beim Eigentuemer, Urlaub, Teammeeting ...) bekommen nie
        //     eine Erinnerungs-Mail an den verknuepften Kontakt.
        if (t.privat === true || INTERN_ART.test(String(t.art || ""))) { await setze("uebersprungen", { erinnerung_fehler: `interner Termin (${t.privat ? "privat" : t.art})` }); uebersprungen++; log.push(eintrag); continue; }
        // Kurzfristig vereinbart (Anlage weniger als 6 h vor Beginn) → keine Erinnerung
        if (t.created_at && new Date(t.created_at).getTime() > beginn.getTime() - VORLAUF_STUNDEN * 3600 * 1000) { await setze("uebersprungen", { erinnerung_fehler: "kurzfristig vereinbart" }); uebersprungen++; log.push(eintrag); continue; }

        const { data: k } = await db.from("kontakte").select("id, anrede, titel, vorname, nachname, firma, email").eq("id", t.kontakt_id).maybeSingle();
        if (!k || !k.email) { await setze("uebersprungen", { erinnerung_fehler: "Kontakt ohne E-Mail" }); uebersprungen++; log.push(eintrag); continue; }

        // Absender: Postfach des Erstellers → Teilnehmer → Chef
        let benutzerId: string | null = t.ersteller_id || null;
        if (!benutzerId) {
          for (const n of [...(Array.isArray(t.teilnehmer) ? t.teilnehmer : []), t.ersteller_name].filter(Boolean)) {
            // Der Teilnehmer wird ueber seinen NAMEN gesucht. Zwei Makler
            // koennen einen Mitarbeiter gleichen Namens haben — ohne
            // Mandanten ginge die Erinnerung ueber ein fremdes Postfach.
            const { data } = await db.from("profiles").select("id").eq("mandant_id", t.mandant_id).in("role", ["chef", "mitarbeiter"]).ilike("name", String(n).trim()).limit(1);
            if (data && data.length) { benutzerId = data[0].id; break; }
          }
        }
        let postfach: any = null;
        if (benutzerId) { const { data } = await db.from("mail_postfaecher").select("*").eq("mandant_id", t.mandant_id).eq("benutzer_id", benutzerId).eq("aktiv", true).order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1); postfach = data && data[0] || null; }
        if (!postfach) {
          // v4: Rueckfall auf das Postfach eines Chefs ohne Einbettung (mail_postfaecher hat keinen FK auf profiles,
          // die fruehere Einbettung "profiles!inner(role)" lieferte deshalb nie ein Ergebnis).
          const { data: chefs } = await db.from("profiles").select("id").eq("mandant_id", t.mandant_id).eq("role", "chef").limit(5);
          const chefIds = (chefs || []).map((c: any) => c.id);
          if (chefIds.length) { const { data } = await db.from("mail_postfaecher").select("*").eq("mandant_id", t.mandant_id).in("benutzer_id", chefIds).eq("aktiv", true).order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1); postfach = data && data[0] || null; }
        }
        if (!postfach) throw new Error("Kein aktives Postfach für den Versand gefunden");
        const { data: makler } = await db.from("profiles").select("name").eq("id", postfach.benutzer_id).maybeSingle();

        let objekt: any = null;
        if (t.immobilie_id) { const { data } = await db.from("immobilien").select("immo_nr, bezeichnung, objekttitel, strasse, hausnummer, plz, ort").eq("id", t.immobilie_id).maybeSingle(); objekt = data || null; }
        const art = (t.art && t.art !== "Sonstiges") ? t.art : "Termin";
        const ort = t.ort || (objekt ? [[objekt.strasse, objekt.hausnummer].filter(Boolean).join(" "), [objekt.plz, objekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "");
        const objektZeile = objekt ? ` (${[objekt.immo_nr, objekt.bezeichnung || objekt.objekttitel].filter(Boolean).join(" · ")})` : "";
        const wann = t.ganztags ? `am ${datumLang(t.datum)}` : `am ${datumLang(t.datum)} um ${String(t.uhrzeit).slice(0, 5)} Uhr`;
        const heuteOderMorgen = t.datum === heute ? "heute" : "morgen";
        const text = `${anrede(k)}\n\nich möchte Sie freundlich an unseren Termin ${heuteOderMorgen} erinnern:\n\n${art}${objektZeile}\n${wann}${ort ? `\nOrt: ${ort}` : ""}\n\nSollte Ihnen etwas dazwischengekommen sein, geben Sie mir bitte kurz Bescheid. Ansonsten freue ich mich auf Sie!\n\nMit freundlichen Grüßen\n${(makler && makler.name) || postfach.absender_name || "Ihr Musterhaus Immobilien Team"}`;
        // v3: Grußformel des Textes durch die Postfach-Signatur ersetzen (genau einmal)
        const finalText = mitSignatur(text, postfach.signatur);
        const betreff = `Erinnerung: ${art} ${heuteOderMorgen}${t.ganztags ? "" : ` um ${String(t.uhrzeit).slice(0, 5)} Uhr`}`;
        const anName = [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "";
        eintrag.an = k.email; eintrag.von = postfach.email_adresse; eintrag.betreff = betreff;
        if (trocken) { eintrag.ergebnis = "wuerde senden"; eintrag.text = finalText; log.push(eintrag); continue; }

        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `${postfach.absender_name} <${postfach.email_adresse}>`, to: [anName ? `${anName} <${k.email}>` : k.email], reply_to: postfach.email_adresse, subject: betreff, text: finalText }),
        });
        if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const rj = await r.json().catch(() => ({}));
        const { data: logRow } = await db.from("mail_versendet").insert({
          postfach_id: postfach.id, versendet_von_user_id: postfach.benutzer_id, absender_email: postfach.email_adresse, absender_name: postfach.absender_name,
          empfaenger_email: k.email, empfaenger_name: anName || null, betreff, body_text: finalText, status: "gesendet", smtp_message_id: rj?.id ? `resend:${rj.id}` : "resend",
        }).select("id").single();
        await setze("gesendet", { erinnerung_mail_id: logRow?.id || null, erinnerung_fehler: null });
        gesendet++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        eintrag.fehler = msg;
        if (!trocken) await db.from("termine").update({ erinnerung_status: "fehler", erinnerung_am: new Date().toISOString(), erinnerung_fehler: msg.slice(0, 300) }).eq("id", t.id);
      }
      log.push(eintrag);
    }
    return antwort({ ok: true, geprueft: (termine || []).length, gesendet, uebersprungen, trocken, log });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
