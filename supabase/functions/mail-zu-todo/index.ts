// ============================================================================
// mail-zu-todo v3 — aus einer E-Mail ein ToDo machen
// ----------------------------------------------------------------------------
// v3 (31.08.2026): URSACHE DES 500ers GEFUNDEN — gesendete Mails tragen im
//   Portal die ID "versendet:<uuid>" (Praefix gegen ID-Kollisionen in der
//   Liste). Die Funktion suchte damit in mail_eingang, Postgres warf einen
//   Typfehler (ungueltige UUID) und die Antwort war ein nackter 500er.
//   Jetzt: Praefix wird erkannt und in mail_versendet gelesen (Spalte
//   body_text, nicht text), jede Nicht-2xx-Antwort wird zusaetzlich geloggt.
// v2: Umgebungspruefung im try, Beiwerk kann das ToDo nicht mehr kippen.
//
// Body: { mail_id, zustaendig_id? }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELL = "claude-sonnet-4-6";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonAusText(t: string): Record<string, unknown> | null {
  if (!t) return null;
  const roh = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(roh); } catch (_) { /* weiter unten */ }
  const a = roh.indexOf("{"), b = roh.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(roh.slice(a, b + 1)); } catch (_) { /* aufgeben */ } }
  return null;
}

async function kiVorschlag(betreff: string, text: string, gegenueber: string, ausgehend: boolean) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  const prompt = [
    "Du hilfst einem Immobilienmakler, aus einer E-Mail eine Aufgabe zu machen.",
    ausgehend
      ? "Die Mail hat der Makler SELBST geschrieben \u2014 die Aufgabe ist das, was er darin zugesagt hat."
      : "Die Mail hat der Makler EMPFANGEN \u2014 die Aufgabe ist das, was er daraufhin tun muss.",
    "Antworte ausschliesslich mit JSON, ohne Rahmen:",
    '{"titel":"kurz, max 80 Zeichen, beginnt mit einem Verb",',
    ' "beschreibung":"1-3 Saetze, was konkret zu tun ist",',
    ' "prioritaet":"normal|wichtig|dringend",',
    ' "faellig_in_tagen":0}',
    "faellig_in_tagen: 0 wenn keine Frist erkennbar, sonst 1-14.",
    "",
    `${ausgehend ? "Empfaenger" : "Absender"}: ${gegenueber}`,
    `Betreff: ${betreff}`,
    "",
    (text || "").slice(0, 6000),
  ].join("\n");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELL, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) { console.error("Anthropic:", r.status, (await r.text()).slice(0, 300)); return null; }
    const j = await r.json();
    return jsonAusText(j?.content?.[0]?.text || "");
  } catch (e) {
    console.error("KI-Aufruf:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis
  // im Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne
  // gueltiges Abo kommt trotzdem nicht daran. Die Schranke liegt in
  // der Beilage abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, cors);
  if (immoAboSperre) return immoAboSperre;

  let schritt = "Start";
  const antwort = (o: Record<string, unknown>, status = 200) => {
    if (status >= 300) console.error(`ABBRUCH ${status} bei \"${schritt}\":`, o.error);
    return new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  };

  try {
    schritt = "Umgebung";
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return antwort({ ok: false, schritt, error: "Serverkonfiguration unvollstaendig." }, 500);
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    schritt = "Anmeldung";
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let nutzerId: string | null = null;
    let nutzerName = "";
    if (jwt && jwt !== serviceKey) {
      const { data: u } = await db.auth.getUser(jwt);
      if (!u?.user) return antwort({ ok: false, schritt, error: "Nicht angemeldet." }, 401);
      nutzerId = u.user.id;
      const { data: p } = await db.from("profiles").select("name, role").eq("id", nutzerId).maybeSingle();
      if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, schritt, error: "Keine Berechtigung." }, 403);
      nutzerName = p.name || "";
    }

    schritt = "Mail lesen";
    const body = await req.json().catch(() => ({}));
    const roheId = String(body.mail_id || "").trim();
    await immoMandantSichern(req, [["mail_eingang", roheId],
                                   ["profiles", String(body.zustaendig_id || "")]]);
    if (!roheId) return antwort({ ok: false, schritt, error: "mail_id fehlt." }, 400);

    // Das Portal praefixt gesendete Mails mit "versendet:" \u2014 das ist kein Fehler, sondern die Quelle
    const ausVersendet = /^versendet:/i.test(roheId);
    const mailId = roheId.replace(/^versendet:/i, "").trim();
    if (!UUID.test(mailId)) {
      return antwort({ ok: false, schritt, error: `Unbrauchbare mail_id: \"${roheId}\"` }, 400);
    }

    let mail: Record<string, string | null> | null = null;
    let ausgehend = ausVersendet;
    let quelleTabelle = ausVersendet ? "mail_versendet" : "mail_eingang";

    if (!ausVersendet) {
      const { data, error } = await db.from("mail_eingang")
        .select("id, betreff, text, absender_email, absender_name, empfaenger_email, ordner, gesendet_am, immobilie_id")
        .eq("id", mailId).maybeSingle();
      if (error) return antwort({ ok: false, schritt, error: "Die Mail konnte nicht gelesen werden: " + error.message }, 500);
      if (data) {
        ausgehend = data.ordner === "gesendet";
        mail = {
          id: data.id, betreff: data.betreff, text: data.text,
          gegenueber_email: ausgehend ? data.empfaenger_email : data.absender_email,
          gegenueber_name: ausgehend ? null : data.absender_name,
          immobilie_id: data.immobilie_id,
        };
      }
    }
    if (!mail) {
      const { data, error } = await db.from("mail_versendet")
        .select("id, betreff, body_text, empfaenger_email, empfaenger_name, gesendet_am")
        .eq("id", mailId).maybeSingle();
      if (error) return antwort({ ok: false, schritt, error: "Die gesendete Mail konnte nicht gelesen werden: " + error.message }, 500);
      if (data) {
        quelleTabelle = "mail_versendet";
        ausgehend = true;
        mail = {
          id: data.id, betreff: data.betreff, text: data.body_text,
          gegenueber_email: data.empfaenger_email, gegenueber_name: data.empfaenger_name,
          immobilie_id: null,
        };
      }
    }
    if (!mail) return antwort({ ok: false, schritt, error: "E-Mail nicht gefunden." }, 404);

    schritt = "Kontakt suchen";
    let kontakt: Record<string, string> | null = null;
    const gegenueber = String(mail.gegenueber_email || "").split(/[;,]/)[0].replace(/^.*<([^>]+)>.*$/, "$1").trim();
    if (gegenueber && gegenueber.includes("@")) {
      const { data: k } = await db.from("kontakte")
        .select("id, vorname, nachname, firma, email")
        .eq("mandant_id", mail.mandant_id).ilike("email", gegenueber).limit(1);
      kontakt = k && k[0] ? k[0] : null;
    }

    schritt = "KI";
    const ki = await kiVorschlag(String(mail.betreff || ""), String(mail.text || ""), gegenueber, ausgehend);

    schritt = "ToDo anlegen";
    const titel = String(ki?.titel || "").trim().slice(0, 120) ||
      (String(mail.betreff || "").trim() || "E-Mail nachfassen").slice(0, 120);
    const prioritaet = ["normal", "wichtig", "dringend"].includes(String(ki?.prioritaet)) ? String(ki?.prioritaet) : "normal";
    const tage = Number(ki?.faellig_in_tagen);
    const faellig = isFinite(tage) && tage > 0 && tage <= 14
      ? new Date(Date.now() + tage * 86400000).toISOString().slice(0, 10) : null;
    const zeile = [mail.gegenueber_name, gegenueber].filter(Boolean).join(" ");
    const beschreibung = String(ki?.beschreibung || "").trim() ||
      `Aus der E-Mail ${ausgehend ? "an" : "von"} ${zeile || "unbekannt"}${mail.betreff ? `: \u201e${mail.betreff}\u201c` : ""}.`;
    const zustaendig = String(body.zustaendig_id || "").trim() || nutzerId;

    const { data: todo, error: tErr } = await db.from("todos").insert({
      titel, beschreibung, typ: "aufgabe", status: "offen", prioritaet,
      faellig_am: faellig, quelle: "mail",
      ersteller_id: nutzerId, zustaendig_id: zustaendig, team_sichtbar: false,
      ki_zusammenfassung: ki?.beschreibung || null,
    }).select().single();
    if (tErr) return antwort({ ok: false, schritt, error: "Das ToDo konnte nicht gespeichert werden: " + tErr.message }, 500);

    // Ab hier steht das ToDo \u2014 Beiwerk darf es nicht mehr kippen
    try {
      const links: Record<string, string | null>[] = [];
      if (quelleTabelle === "mail_eingang") {
        links.push({ todo_id: todo.id, objekt_typ: "mail_eingang", objekt_id: String(mail.id),
          label: String(mail.betreff || "E-Mail").slice(0, 120) });
      }
      if (kontakt) {
        links.push({ todo_id: todo.id, objekt_typ: "kontakt", objekt_id: kontakt.id,
          label: [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ") || kontakt.firma || gegenueber });
      }
      if (mail.immobilie_id) {
        const { data: im } = await db.from("immobilien")
          .select("immo_nr, bezeichnung, objekttitel, strasse, hausnummer").eq("id", mail.immobilie_id).maybeSingle();
        links.push({ todo_id: todo.id, objekt_typ: "immobilie", objekt_id: String(mail.immobilie_id),
          label: im ? [im.immo_nr, im.bezeichnung || im.objekttitel ||
            [im.strasse, im.hausnummer].filter(Boolean).join(" ")].filter(Boolean).join(" \u00b7 ") : null });
      }
      if (links.length) {
        const { error: vErr } = await db.from("todo_verknuepfung").upsert(links, { onConflict: "todo_id,objekt_typ,objekt_id" });
        if (vErr) console.error("Verknuepfung:", vErr.message);
      }
    } catch (e) { console.error("Verknuepfungen:", e instanceof Error ? e.message : String(e)); }

    try {
      await db.from("todo_kommentar").insert({
        todo_id: todo.id, system: true, user_id: nutzerId, user_name: nutzerName || null,
        text: `Aus dem Posteingang \u00fcbernommen (${ausgehend ? "gesendete" : "empfangene"} Mail)${kontakt ? " \u00b7 Kontakt automatisch zugeordnet" : ""}${ki ? " \u00b7 Titel und Frist von der KI vorgeschlagen" : ""}`,
      });
    } catch (e) { console.error("Kommentar:", e instanceof Error ? e.message : String(e)); }

    return antwort({
      ok: true, todo_id: todo.id, titel, zusammenfassung: beschreibung,
      kontakt: kontakt ? ([kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ") || kontakt.firma) : null,
      faellig_am: faellig, ki: !!ki, quelle: quelleTabelle,
    });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    console.error("Fehler bei Schritt", schritt, text);
    return new Response(JSON.stringify({ ok: false, schritt, error: `${schritt}: ${text}` }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
