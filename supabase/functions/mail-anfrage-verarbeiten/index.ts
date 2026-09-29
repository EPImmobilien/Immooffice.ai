// ============================================================================
// mail-anfrage-verarbeiten v3
//   Portal- und Website-Anfragen auswerten: KI liest Objekt-Nr./Titel + Interessentendaten,
//   ordnet das Objekt zu, findet den Kontakt (E-Mail, sonst Name) oder legt ihn an,
//   verknuepft Kontakt<->Objekt, merkt sich die echte Antwortadresse (kontakt_email).
//   v3: auch INTERNE WEITERLEITUNGEN (WG:/Fwd: von Kollegen wie jg@, ag@, info@ .com) und
//       Website-Formulare ("Ref.-Nr. 321: Frau X wuenscht Kontakt") werden verarbeitet;
//       Kontakt ist dann IMMER der urspruengliche Anfragesteller, nie der weiterleitende Kollege.
//   Body: { mail_eingang_id, erzwingen?: bool } | { modus: "batch", limit?: n }
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

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const PORTAL_RE = /immobilienscout24|immoscout|immowelt|immonet|kleinanzeigen|ohne-makler|immobilie1|wohnungsboerse|nachrichten\.immobilienscout24|immomio|neubaukompass|newhome/i;
const EIGENE_RE = /@immooffice.example\.(de|com)$/i;
const WG_RE = /^\s*(wg|fwd?|weiterleitung|tr)\s*:/i;
const ANFRAGE_RE = /anfrage|interess|besichtig|exposé|expose|wünscht kontakt|ref\.-nr|objektnr|objekt-nr|scout-id|mietanfrage|kaufanfrage|kontaktanfrage/i;
const NICHT_ANFRAGE_RE = /importbericht|import zu kleinanzeigen|rechnung|invoice|objektstatistik|newsletter|passwort|kontoauszug|widerrufsbelehrung des:der anbieter|sie haben kontakt mit dem anbieter|exposé-beauftragung|vermarktungsbericht/i;

function htmlZuText(html: string) {
  return String(html || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
const norm = (s: unknown) => String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

async function kiExtrahieren(text: string, betreff: string, absender: string, weitergeleitet: boolean) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY fehlt");
  const prompt = `Du bekommst eine E-Mail an einen Immobilienmakler (Musterhaus Immobilien GmbH). Extrahiere die Daten als JSON. Antworte NUR mit dem JSON-Objekt, ohne Erklärung, ohne Markdown.
${weitergeleitet ? "\nWICHTIG: Diese Mail wurde von einem KOLLEGEN intern weitergeleitet (Absender @immooffice.example). Der Kollege ist NIEMALS der Kontakt. Der Kontakt ist der ursprüngliche Anfragesteller – er steht im weitergeleiteten Teil (z. B. hinter \"Von:\" / \"From:\", in einem Portal-Block \"Interessent\" oder im Formulartext \"Frau/Herr X wünscht Kontakt\" mit E-Mail und Telefon).\n" : ""}
Schema:
{
  "ist_anfrage": true|false,            // true, wenn eine Person Kontakt aufnimmt (Interessent zu Objekt/Projekt ODER Eigentümer, der Bewertung/Verkauf wünscht); false bei Importberichten, Rechnungen, Statistiken, Kopien an den Interessenten, interner Kommunikation ohne Kunden
  "art": "interessent"|"eigentuemer",
  "portal": "immoscout24"|"immowelt"|"immonet"|"kleinanzeigen"|"neubaukompass"|"website"|"sonstiges",
  "objekt_nr": string|null,             // Objekt-/Referenznummer des MAKLERS (z. B. "354", "356_5", "Ref.-Nr. 321" -> "321"), NICHT die Scout-ID
  "scout_id": string|null,
  "objekt_titel": string|null,
  "objekt_plz": string|null, "objekt_ort": string|null,
  "projekt": string|null,
  "kontakt": { "anrede": "Herr"|"Frau"|null, "vorname": string|null, "nachname": string|null, "email": string|null, "telefon": string|null, "strasse": string|null, "plz": string|null, "ort": string|null },
  "nachricht": string|null,
  "wuensche": string[]                  // z. B. ["Besichtigung", "Exposé", "Rückruf", "Finanzierung", "Objektbewertung", "Miete"]
}
Regeln: Kontaktdaten des Maklerteams (@immooffice.example) niemals als Kontakt ausgeben. Portal-Adressen (noreply, nachrichten.immobilienscout24 ...) sind keine Kontakt-E-Mail. Unbekanntes = null.

Absender: ${absender}
Betreff: ${betreff}

Mail:
${text.slice(0, 12000)}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }) });
  if (!r.ok) throw new Error(`KI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const roh = (j.content || []).map((c: any) => c.text || "").join("").replace(/```json|```/g, "").trim();
  const m = roh.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : roh);
}

function istKandidat(mail: any, text: string) {
  const absender = String(mail.absender_email || "");
  if (PORTAL_RE.test(absender)) return true;
  if (EIGENE_RE.test(absender) && WG_RE.test(mail.betreff || "") && (PORTAL_RE.test(text) || ANFRAGE_RE.test((mail.betreff || "") + " " + text.slice(0, 4000)))) return true;
  return PORTAL_RE.test(text.slice(0, 3000));
}

async function verarbeiten(db: any, mail: any, userId: string | null, erzwingen: boolean) {
  const text = (mail.text && mail.text.trim()) ? mail.text : htmlZuText(mail.html || "");
  const absender = String(mail.absender_email || "");
  const weitergeleitet = EIGENE_RE.test(absender);
  const jetzt = new Date().toISOString();
  if (!erzwingen && (!istKandidat(mail, text) || NICHT_ANFRAGE_RE.test((mail.betreff || "") + " " + text.slice(0, 600)))) {
    await db.from("mail_eingang").update({ anfrage_status: "keine_anfrage", anfrage_verarbeitet_am: jetzt }).eq("id", mail.id);
    return { ok: true, status: "keine_anfrage" };
  }
  const d = await kiExtrahieren(text, mail.betreff || "", absender, weitergeleitet);
  const k = d?.kontakt || {};
  if (k.email && EIGENE_RE.test(String(k.email))) { k.email = null; }
  if (!d || d.ist_anfrage === false || (!k.email && !k.nachname)) {
    await db.from("mail_eingang").update({ anfrage_status: "keine_anfrage", anfrage_daten: d || null, anfrage_verarbeitet_am: jetzt }).eq("id", mail.id);
    return { ok: true, status: "keine_anfrage" };
  }
  const istEigentuemer = d.art === "eigentuemer" || /eigent(ü|ue)mer-kontakt|objektbewertung|immobilienbewertung|wertermittlung/i.test((mail.betreff || "") + " " + (d.wuensche || []).join(" "));
  const rolle = istEigentuemer ? "eigentuemer" : "interessent";
  const ergebnis: any = { ok: true, status: "verarbeitet", art: rolle, objekt: null, kontakt: null };

  // ---- Objekt zuordnen ----
  let immobilieId: string | null = mail.immobilie_id || null;
  let objektGrund = mail.immobilie_id ? "bereits zugeordnet" : "";
  if (!immobilieId && !istEigentuemer) {
    const { data: objekte } = await db.from("immobilien").select("id, immo_nr, objekttitel, bezeichnung, plz, ort, status, stammobjekt_id").neq("versteckt", true).limit(2000);
    const liste = objekte || [];
    const aktiv = (o: any) => o.status === "vermarktung" || o.status === "reserviert" ? 2 : o.status === "verkauft" || o.status === "vermietet" || o.status === "archiv" ? -5 : 0;
    const nrRoh = d.objekt_nr ? String(d.objekt_nr).replace(/^\s*(ref\.?-?\s*nr\.?|objekt-?nr\.?)\s*:?\s*/i, "").trim().toLowerCase() : "";
    if (nrRoh) {
      const treffer = liste.filter((o: any) => String(o.immo_nr || "").toLowerCase() === nrRoh).sort((a: any, b: any) => aktiv(b) - aktiv(a));
      if (treffer[0]) { immobilieId = treffer[0].id; objektGrund = "Objekt-Nr. " + treffer[0].immo_nr; }
    }
    if (!immobilieId && (d.objekt_titel || d.projekt)) {
      const such = norm(d.objekt_titel || d.projekt);
      let best: any = null, bestScore = 0;
      for (const o of liste) {
        const t = norm(o.objekttitel || ""), b = norm(o.bezeichnung || "");
        let score = 0;
        if (t && (t === such || t.startsWith(such.slice(0, 40)) || such.startsWith(t.slice(0, 40)))) score = 90;
        else if (b && such.includes(b) && b.length > 6) score = 80;
        else if (t && such.length > 20 && t.includes(such.slice(0, 25))) score = 70;
        if (score && d.objekt_plz && o.plz && String(o.plz) !== String(d.objekt_plz)) score -= 30;
        score += aktiv(o);
        if (score > bestScore) { bestScore = score; best = o; }
      }
      if (best && bestScore >= 70) { immobilieId = best.id; objektGrund = "Titel: " + (best.objekttitel || best.bezeichnung); }
    }
  }
  if (immobilieId) { const { data: o } = await db.from("immobilien").select("id, immo_nr, objekttitel, bezeichnung").eq("id", immobilieId).maybeSingle(); ergebnis.objekt = o ? { ...o, grund: objektGrund } : null; }

  // ---- Kontakt finden / anlegen ----
  const email = String(k.email || "").trim().toLowerCase();
  const vor = String(k.vorname || "").trim(), nach = String(k.nachname || "").trim();
  let kontakt: any = null, kontaktGrund = "";
  if (email && !PORTAL_RE.test(email)) {
    const { data } = await db.from("kontakte").select("id, anrede, vorname, nachname, email, telefon, plz, rollen, notiz, aktiv").ilike("email", email).order("aktiv", { ascending: false }).limit(1).maybeSingle();
    if (data) { kontakt = data; kontaktGrund = "E-Mail"; }
  }
  if (!kontakt && nach) {
    let q = db.from("kontakte").select("id, anrede, vorname, nachname, email, telefon, plz, rollen, notiz, aktiv").ilike("nachname", nach).eq("aktiv", true).limit(20);
    if (vor) q = q.ilike("vorname", vor);
    const { data } = await q;
    const kand = (data || []).filter((x: any) => (!vor || norm(x.vorname) === norm(vor)) && !EIGENE_RE.test(String(x.email || "")));
    if (kand.length === 1) { kontakt = kand[0]; kontaktGrund = "Name"; }
    else if (kand.length > 1) { const mitPlz = kand.filter((x: any) => k.plz && String(x.plz) === String(k.plz)); if (mitPlz.length === 1) { kontakt = mitPlz[0]; kontaktGrund = "Name + PLZ"; } else { kontakt = kand[0]; kontaktGrund = "Name (mehrdeutig, erster Treffer)"; } }
  }
  const datumKurz = new Date(mail.gesendet_am || jetzt).toLocaleDateString("de-DE");
  const objektText = istEigentuemer ? [d.objekt_titel, [d.objekt_plz, d.objekt_ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : (ergebnis.objekt ? (ergebnis.objekt.immo_nr ? "Nr. " + ergebnis.objekt.immo_nr + " " : "") + (ergebnis.objekt.objekttitel || ergebnis.objekt.bezeichnung || "") : "");
  const quelle = d.portal === "website" ? "Website" : d.portal ? d.portal : "";
  const notizZeile = `${datumKurz} ${istEigentuemer ? "Bewertungs-/Verkaufsanfrage" : "Anfrage"}${quelle ? " (" + quelle + ")" : ""}${weitergeleitet ? ", weitergeleitet von " + absender.split("@")[0] : ""}${objektText ? " zu " + objektText : ""}${d.nachricht ? ": „" + String(d.nachricht).slice(0, 300) + "“" : ""}`;
  if (kontakt) {
    const patch: any = { updated_at: jetzt };
    if (!kontakt.email && email && !PORTAL_RE.test(email)) patch.email = email;
    if (!kontakt.telefon && k.telefon) patch.telefon = String(k.telefon).trim();
    if (!kontakt.anrede && k.anrede) patch.anrede = k.anrede;
    if (!(kontakt.rollen || []).includes(rolle)) patch.rollen = [...(kontakt.rollen || []), rolle];
    if (!kontakt.aktiv) patch.aktiv = true;
    patch.notiz = ((kontakt.notiz || "").trim() + "\n" + notizZeile).trim().slice(-4000);
    await db.from("kontakte").update(patch).eq("id", kontakt.id);
    ergebnis.kontakt = { id: kontakt.id, name: [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" "), email: kontakt.email || email || null, neu: false, grund: kontaktGrund };
  } else {
    const { data: neu, error } = await db.from("kontakte").insert({
      anrede: k.anrede || null, vorname: vor || null, nachname: nach || (email ? email.split("@")[0] : "Unbekannt"),
      email: email && !PORTAL_RE.test(email) ? email : null, telefon: k.telefon ? String(k.telefon).trim() : null,
      strasse: k.strasse || null, plz: k.plz || null, ort: k.ort || null, rollen: [rolle], quelle: d.portal === "website" ? "website" : "portal", aktiv: true,
      notiz: notizZeile, ersteller_id: userId, zustaendig_id: userId,
    }).select("id, vorname, nachname, email").single();
    if (error) throw error;
    kontakt = neu;
    ergebnis.kontakt = { id: neu.id, name: [neu.vorname, neu.nachname].filter(Boolean).join(" "), email: neu.email, neu: true, grund: "neu angelegt" };
  }
  if (kontakt && immobilieId && !istEigentuemer) {
    const { data: vorh } = await db.from("kontakt_objekt").select("id").eq("kontakt_id", kontakt.id).eq("immobilie_id", immobilieId).limit(1).maybeSingle();
    if (!vorh) await db.from("kontakt_objekt").insert({ kontakt_id: kontakt.id, immobilie_id: immobilieId, rolle: "interessent", notiz: notizZeile.slice(0, 500), ersteller_id: userId });
  }
  const patchMail: any = {
    anfrage_status: "verarbeitet", anfrage_verarbeitet_am: jetzt, anfrage_daten: { ...d, art: rolle, weitergeleitet_von: weitergeleitet ? absender : null },
    kontakt_id: kontakt ? kontakt.id : null,
    kontakt_email: email && !PORTAL_RE.test(email) ? email : (kontakt && kontakt.email) || null,
    kontakt_name: [k.anrede, vor, nach].filter(Boolean).join(" ") || null,
  };
  if (immobilieId && !mail.immobilie_id) { patchMail.immobilie_id = immobilieId; patchMail.immobilie_id_ki_konfidenz = 95; }
  await db.from("mail_eingang").update(patchMail).eq("id", mail.id);
  return ergebnis;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    let userId: string | null = null;
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
        userId = u.user.id;
      }
    }
    const felder = "id, absender_email, absender_name, betreff, text, html, gesendet_am, immobilie_id, postfach_id";
    if (body.modus === "batch") {
      const seit = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: mails } = await db.from("mail_eingang").select(felder).is("anfrage_status", null).eq("ordner", "posteingang").gte("gesendet_am", seit).order("gesendet_am", { ascending: false }).limit(Number(body.limit) || 8);
      const erg: any[] = [];
      for (const m of mails || []) {
        try {
          const { data: pf } = await db.from("mail_postfaecher").select("benutzer_id").eq("id", m.postfach_id).maybeSingle();
          erg.push({ id: m.id, betreff: m.betreff, ...(await verarbeiten(db, m, pf?.benutzer_id || null, false)) });
        } catch (e) {
          await db.from("mail_eingang").update({ anfrage_status: "fehler", anfrage_verarbeitet_am: new Date().toISOString(), anfrage_daten: { fehler: e instanceof Error ? e.message : String(e) } }).eq("id", m.id);
          erg.push({ id: m.id, ok: false, fehler: e instanceof Error ? e.message : String(e) });
        }
      }
      return antwort({ ok: true, geprueft: (mails || []).length, verarbeitet: erg.filter((x) => x.status === "verarbeitet").length, ergebnisse: erg });
    }
    if (!userId) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
    const id = String(body.mail_eingang_id || "").replace(/^versendet:/, "");
    await immoMandantSichern(req, [["mail_eingang", id]]);
    if (!id) throw new Error("mail_eingang_id fehlt.");
    const { data: mail, error } = await db.from("mail_eingang").select(felder).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!mail) throw new Error("Mail nicht gefunden.");
    return antwort(await verarbeiten(db, mail, userId, !!body.erzwingen));
  } catch (e) {
    console.error("mail-anfrage-verarbeiten:", e);
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
