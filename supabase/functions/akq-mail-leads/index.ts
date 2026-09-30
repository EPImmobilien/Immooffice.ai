// ============================================================================
// akq-mail-leads v2 — Verkaeufer-Leads aus dem Posteingang auslesen
// ----------------------------------------------------------------------------
// Durchsucht mail_eingang nach Mails, die auf einen Eigentuemer-Lead hindeuten
// (Regeln aus akq_mail_regeln), bereitet HTML sauber zu Text auf und laesst
// Claude die Felder strukturiert herausziehen. Das Ergebnis landet als
// VORSCHLAG in akq_mail_leads — nie als fertiger Lead. Die Uebernahme macht
// ein Mensch im Portal, weil sie Automationen und damit echte Mails ausloest.
//
// v2: Reparaturlauf, wenn die Antwort kein gueltiges JSON ist.
//
// Body: { tage?: 30, limit?: 25, mail_id?: "…", neu_bewerten?: false }
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

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-4-6";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Absender, die nie ein Verkaeufer-Lead sind — spart KI-Aufrufe.
const SPERRLISTE = [
  "qonto.com", "paypal.de", "paypal.com", "onoffice.de", "indeed.com",
  "indeedemail.com", "github.com", "supabase.com", "google.com", "accounts.google.com",
  "wetransfer.com", "onpreo.de", "neubaukompass.de", "interhyp.de", "info.interhyp.de",
  "baufi24.de", "alleaktien.com", "kleinanzeigen.de", "immowelt.de.pro",
  "pro.immowelt.de", "wohnrechner.online", "immooffice.example", "immooffice.example",
];

function textAusMail(text: string | null, html: string | null): string {
  const roh = (text || "").trim();
  // Manche Portale liefern im Text-Teil nur das CSS des HTML-Mailings —
  // dann lieber das HTML selbst aufbereiten.
  const textTaugt = roh.length > 80 && !/\{[^}]*(font-size|margin|padding|border-collapse)/i.test(roh.slice(0, 400));
  const quelle = textTaugt ? roh : html || roh;
  if (!quelle) return "";

  let s = quelle;
  if (!textTaugt) {
    s = s.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ");
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n");
    s = s.replace(/<\/td>/gi, "  ");
    s = s.replace(/<[^>]+>/g, " ");
  }
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
       .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'")
       .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));
  s = s.split("\n").map((z) => z.replace(/[ \t]{2,}/g, " ").trim()).filter((z, i, a) => z || a[i - 1]).join("\n");
  return s.replace(/\n{3,}/g, "\n\n").trim().slice(0, 12000);
}

const SYSTEM = `Du liest E-Mails eines Immobilienmaklerbüros
und entscheidest, ob darin ein VERKÄUFER-LEAD steckt: eine Person, die ihre eigene Immobilie
bewerten lassen oder verkaufen möchte, oder ein Portal, das genau so einen Kontakt weiterleitet.

KEIN Verkäufer-Lead sind: Kaufinteressenten und Besichtigungsanfragen zu unseren Objekten,
Mietanfragen, Rechnungen, Newsletter, Werbung von Portalen, Systemmeldungen, Importberichte,
Bewerbungen, Nachrichten von Notaren, Handwerkern oder Kollegen.
Ausnahme: Fragt jemand zu einem unserer Objekte an und die Mail weist ihn ausdrücklich als
Eigentümer:in aus (z. B. "Die Person ist Eigentümer:in"), dann IST das ein Verkäufer-Lead.

Ziehe nur heraus, was wirklich dasteht. Erfinde nichts, rate nicht. Fehlende Felder bleiben null.
Telefonnummern unverändert übernehmen. Flächen und Baujahr als Zahl ohne Einheit.

Antworte AUSSCHLIESSLICH als JSON:
{"ist_lead": true|false,
 "konfidenz": 0-100,
 "begruendung": "ein knapper Satz",
 "anrede": null|"Herr"|"Frau"|"Familie",
 "vorname": null|"…", "nachname": null|"…", "firma": null|"…",
 "email": null|"…", "telefon": null|"…",
 "strasse": null|"…", "hausnummer": null|"…", "plz": null|"…", "ort": null|"…",
 "objektart": null|"…", "wohnflaeche": null|Zahl, "grundstueck": null|Zahl,
 "zimmer": null|Zahl, "baujahr": null|Zahl, "zustand": null|"…",
 "verkaufszeitraum": null|"…", "wert_hinweis": null|"…",
 "nachricht": null|"Originalnachricht der Person, gekürzt auf max. 600 Zeichen"}`;

function jsonAusText(t: string): any | null {
  let s = t || "";
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1];
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (_) { return null; }
}

async function anthropic(system: string, nutzer: string, maxTokens = 1200): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY fehlt.");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: "user", content: nutzer }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return d?.content?.[0]?.text || "";
}

async function auswerten(betreff: string, absender: string, inhalt: string) {
  const roh = await anthropic(SYSTEM, `Absender: ${absender}\nBetreff: ${betreff}\n\n---\n${inhalt}`);
  let j = jsonAusText(roh);
  if (!j) {
    // Haeufigster Fehler sind unescapte Anfuehrungszeichen im zitierten Fliesstext.
    const rep = await anthropic(
      "Du bekommst fehlerhaftes JSON. Gib exakt dieselben Daten als VALIDES JSON zurueck. Anfuehrungszeichen innerhalb von Textwerten escapen. Antworte nur mit JSON, ohne Kommentar.",
      roh, 1400);
    j = jsonAusText(rep);
  }
  if (!j) throw new Error("Antwort war kein gueltiges JSON.");
  return j;
}

const zahl = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
};
const txt = (v: unknown, max = 200) => {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "null" ? s.slice(0, max) : null;
};

function passt(muster: string | null, wert: string): boolean {
  if (!muster) return true;
  // ILIKE-Semantik: % = beliebig, _ = ein Zeichen
  const re = new RegExp("^" + muster.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");
  return re.test(wert || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
      }
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const tage = Math.min(Math.max(Number(body.tage) || 30, 1), 365);
    const grenze = Math.min(Math.max(Number(body.limit) || 25, 1), 60);
    const neuBewerten = body.neu_bewerten === true;

    // Die Regeln gehoeren je einem Mandanten. Ohne mandant_id im Ergebnis
    // wurden die Erkennungsregeln JEDES Hauses auf JEDE Mail angewandt —
    // der Lead des einen entstand nach der Regel des anderen. Gelesen
    // werden sie weiter in einem Zug (ein Cron hat keinen Mandanten),
    // zugeordnet wird unten je Mail.
    const { data: regeln } = await db.from("akq_mail_regeln").select("*").eq("aktiv", true).order("sortierung");
    if (!regeln || !regeln.length) return antwort({ ok: true, hinweis: "Keine aktiven Erkennungsregeln.", geprueft: 0, vorschlaege: 0 });

    // --- Kandidaten einsammeln ---
    let kandidaten: any[] = [];
    if (body.mail_id) {
      await immoMandantSichern(req, [["mail_eingang", String(body.mail_id)]]);
      const { data } = await db.from("mail_eingang").select("id, absender_email, absender_name, betreff, gesendet_am").eq("id", body.mail_id);
      kandidaten = data || [];
    } else {
      const ab = new Date(Date.now() - tage * 86400000).toISOString();
      const { data } = await db.from("mail_eingang")
        .select("id, absender_email, absender_name, betreff, gesendet_am, mandant_id")
        .neq("ordner", "gesendet").gte("gesendet_am", ab)
        .order("gesendet_am", { ascending: false }).limit(1500);
      kandidaten = data || [];
    }

    const { data: schon } = await db.from("akq_mail_leads").select("mail_eingang_id");
    const bekannt = new Set((schon || []).map((r: any) => r.mail_eingang_id));

    const treffer: any[] = [];
    for (const m of kandidaten) {
      if (!neuBewerten && bekannt.has(m.id)) continue;
      const absender = String(m.absender_email || "").toLowerCase();
      const domain = absender.split("@")[1] || "";
      const regel = regeln.find((r: any) =>
        r.mandant_id === m.mandant_id &&
        (r.absender_muster || r.betreff_muster) &&
        passt(r.absender_muster, absender) && passt(r.betreff_muster, String(m.betreff || "")));
      if (!regel) continue;
      // Sperrliste gilt nur fuer die unspezifischen Freitext-Regeln
      if (!regel.absender_muster && SPERRLISTE.some((d) => domain === d || domain.endsWith("." + d))) continue;
      treffer.push({ mail: m, regel });
      if (treffer.length >= grenze) break;
    }

    const log: any[] = [];
    let vorschlaege = 0, keinLead = 0, fehler = 0;

    for (const t of treffer) {
      const e: any = { mail_id: t.mail.id, betreff: t.mail.betreff, regel: t.regel.name };
      try {
        const { data: voll } = await db.from("mail_eingang").select("text, html").eq("id", t.mail.id).maybeSingle();
        const inhalt = textAusMail(voll?.text || null, voll?.html || null);
        if (!inhalt || inhalt.length < 30) {
          e.ergebnis = "leer";
          log.push(e);
          continue;
        }
        const j = await auswerten(String(t.mail.betreff || ""), String(t.mail.absender_email || ""), inhalt);
        const istLead = j.ist_lead === true && Number(j.konfidenz || 0) >= 40;

        const daten = {
          anrede: txt(j.anrede, 20), vorname: txt(j.vorname, 80), nachname: txt(j.nachname, 80),
          firma: txt(j.firma, 120),
          email: txt(j.email, 120), telefon: txt(j.telefon, 40),
          strasse: txt(j.strasse, 120), hausnummer: txt(j.hausnummer, 20),
          plz: txt(j.plz, 10), ort: txt(j.ort, 80),
          objektart: txt(j.objektart, 60), wohnflaeche: zahl(j.wohnflaeche), grundstueck: zahl(j.grundstueck),
          zimmer: zahl(j.zimmer), baujahr: zahl(j.baujahr) ? Math.round(zahl(j.baujahr)!) : null,
          zustand: txt(j.zustand, 40), verkaufszeitraum: txt(j.verkaufszeitraum, 60),
          wert_hinweis: txt(j.wert_hinweis, 120), nachricht: txt(j.nachricht, 700),
          begruendung: txt(j.begruendung, 300),
        };

        // Dublettenpruefung ueber die Mailadresse
        let dubletteKontakt: string | null = null, dubletteLead: string | null = null;
        if (daten.email) {
          // Die Dublettenpruefung ueber die Adresse fand auch den Kontakt eines
          // fremden Maklers — und haengte den neuen Lead an dessen Datensatz.
          const { data: k } = await db.from("kontakte").select("id").eq("mandant_id", t.mail.mandant_id).ilike("email", daten.email).limit(1);
          if (k && k.length) {
            dubletteKontakt = k[0].id;
            const { data: l } = await db.from("akq_leads").select("id").eq("kontakt_id", k[0].id).eq("status", "offen").limit(1);
            if (l && l.length) dubletteLead = l[0].id;
          }
        }

        const zeile = {
          mail_eingang_id: t.mail.id, regel_id: t.regel.id, quelle_id: t.regel.quelle_id,
          absender_email: t.mail.absender_email, betreff: t.mail.betreff, gesendet_am: t.mail.gesendet_am,
          status: istLead ? "offen" : "kein_lead",
          konfidenz: Math.round(Number(j.konfidenz || 0)),
          daten, hinweis: daten.begruendung,
          dublette_kontakt_id: dubletteKontakt, dublette_lead_id: dubletteLead,
        };
        const { error } = await db.from("akq_mail_leads").upsert(zeile, { onConflict: "mail_eingang_id" });
        if (error) throw error;

        e.ergebnis = istLead ? "vorschlag" : "kein_lead";
        e.konfidenz = zeile.konfidenz;
        if (istLead) vorschlaege++; else keinLead++;
        if (dubletteLead) e.dublette = true;
      } catch (err) {
        e.ergebnis = "fehler";
        e.fehler = err instanceof Error ? err.message : String(err);
        fehler++;
      }
      log.push(e);
    }

    return antwort({ ok: true, kandidaten: kandidaten.length, geprueft: treffer.length, vorschlaege, kein_lead: keinLead, fehler, log });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
