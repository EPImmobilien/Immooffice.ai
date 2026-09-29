// ============================================================================
// urlaub-hinweise v1 — Resturlaub-Hinweise als Aufgabe für den Chef (Mitwirkungspflicht)
// ----------------------------------------------------------------------------
// Cron: 1. November (Modus jahresende: Resturlaub bis 31.12.) und 1. März (Modus uebertrag:
// übertragener Urlaub bis 31.03.). Rechnet je Mitarbeiter die Bilanz (gleiche Logik wie im
// Portal) und legt EINE Aufgabe typ urlaub_hinweis für den Chef an, mit Liste der Betroffenen.
// Der Versand der individuellen Hinweisschreiben passiert im Dashboard per Klick (aus dem
// Postfach des Chefs) und wird in urlaub_hinweise dokumentiert.
// Body (optional): { modus: "jahresende" | "uebertrag", jahr: 2026 }
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

// ===== Urlaub: Feiertage Mecklenburg-Vorpommern, Arbeitstage, Anspruch, Übertrag, Bilanz =====
function osterSonntag(jahr: number): Date {   // Gauß/Meeus
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(jahr, monat - 1, tag));
}
function feiertage(jahr: number, land?: string | null): Set<string> {
  // Gesetzliche Feiertage eines Bundeslandes. Gleiche Rechnung wie in der
  // Oberflaeche (src/app/anwendung.js) — laufen die beiden auseinander,
  // widerspricht die Erinnerung des Chefs dem, was der Mitarbeiter sieht.
  //
  // Ohne Land bleiben die neun bundesweiten Feiertage stehen: lieber zu
  // wenige als falsche. Das Land kommt aus firma_stammdaten.bundesland des
  // Standorts.
  //
  // Nicht enthalten, weil nicht landesweit gesetzlich: Fronleichnam in
  // Sachsen und Thueringen, Mariae Himmelfahrt in Bayern (je nur in
  // bestimmten Gemeinden) und das Augsburger Friedensfest.
  const code = String(land || "").toUpperCase();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (d: Date, n: number) => { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; };
  const o = osterSonntag(jahr);
  const tage = [`${jahr}-01-01`, `${jahr}-05-01`, `${jahr}-10-03`, `${jahr}-12-25`, `${jahr}-12-26`,
                iso(plus(o, -2)), iso(plus(o, 1)), iso(plus(o, 39)), iso(plus(o, 50))];
  const wenn = (laender: string[], wert: string) => { if (laender.indexOf(code) >= 0) tage.push(wert); };
  wenn(["BW", "BY", "ST"], `${jahr}-01-06`);
  wenn(["BE", "MV"], `${jahr}-03-08`);
  wenn(["BB"], iso(o));
  wenn(["BB"], iso(plus(o, 49)));
  wenn(["BW", "BY", "HE", "NW", "RP", "SL"], iso(plus(o, 60)));
  wenn(["SL"], `${jahr}-08-15`);
  wenn(["TH"], `${jahr}-09-20`);
  wenn(["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH"], `${jahr}-10-31`);
  wenn(["BW", "BY", "NW", "RP", "SL"], `${jahr}-11-01`);
  if (code === "SN") {
    for (let tag = 16; tag <= 22; tag++) {
      const d = new Date(Date.UTC(jahr, 10, tag));
      if (d.getUTCDay() === 3) { tage.push(d.toISOString().slice(0, 10)); break; }
    }
  }
  return new Set(tage);
}
function feiertageMV(jahr: number): Set<string> {
  // Alter Name, damit die Aufrufstellen unveraendert bleiben. Das Land setzt
  // urlaubBundesland, einmal je Lauf aus firma_stammdaten gelesen.
  return feiertage(jahr, urlaubBundesland);
}
let urlaubBundesland: string | null = null;
// Arbeitstage Mo–Fr ohne Feiertage (MV) zwischen zwei ISO-Daten (inklusive)
function urlaubArbeitstage(von: string, bis?: string | null): number {
  if (!von) return 0;
  const start = new Date(von + "T12:00:00Z"), ende = new Date((bis || von) + "T12:00:00Z");
  if (ende < start) return 0;
  let n = 0; const cache: Record<number, Set<string>> = {};
  for (let d = new Date(start.getTime()); d <= ende; d.setUTCDate(d.getUTCDate() + 1)) {
    const wt = d.getUTCDay(); if (wt === 0 || wt === 6) continue;
    const j = d.getUTCFullYear(); if (!cache[j]) cache[j] = feiertageMV(j);
    if (cache[j].has(d.toISOString().slice(0, 10))) continue;
    n++;
  }
  return n;
}
// Jahresanspruch: Staffel je Jahr, sonst Standard; im Eintrittsjahr anteilig (§ 5 BUrlG: 1/12 je vollem Monat, ab halbem Tag aufrunden)
function urlaubAnspruchJahr(profil: any, jahr: number): { anspruch: number; anteilig: boolean; monate: number; voll: number } {
  const staffel = profil && profil.urlaub_staffel && typeof profil.urlaub_staffel === "object" ? profil.urlaub_staffel : {};
  const s = staffel[String(jahr)];
  const voll = (s !== undefined && s !== null && s !== "") ? Number(s) || 0 : (Number(profil && profil.urlaubstage_jahr) || 0);
  const eintritt = profil && profil.eintritt ? String(profil.eintritt).slice(0, 10) : null;
  if (!eintritt || parseInt(eintritt.slice(0, 4), 10) !== Number(jahr)) return { anspruch: voll, anteilig: false, monate: 12, voll };
  const monat = parseInt(eintritt.slice(5, 7), 10), tag = parseInt(eintritt.slice(8, 10), 10);
  const volleMonate = Math.max(0, 12 - monat + (tag === 1 ? 1 : 0));   // Eintritt am 1. zählt den Monat mit
  const roh = voll * volleMonate / 12;
  return { anspruch: Math.floor(roh) + (roh - Math.floor(roh) >= 0.5 ? 1 : 0), anteilig: true, monate: volleMonate, voll };
}
function urlaubEigene(profil: any, termine: any[], jahr: number): any[] {
  return (termine || []).filter((t: any) => /urlaub/i.test(t.art || "") && t.status !== "storniert" && String(t.datum || "").startsWith(String(jahr)) &&
    (t.ersteller_id === profil.id || (Array.isArray(t.teilnehmer) && t.teilnehmer.includes(profil.name)) || (!t.ersteller_id && t.ersteller_name && profil.name && t.ersteller_name.split(" ")[0] === profil.name.split(" ")[0])));
}
const urlaubTage = (t: any): number => Number(t.urlaub_arbeitstage) || urlaubArbeitstage(t.datum, t.datum_ende);
const urlaubIstGenehmigt = (t: any): boolean => t.urlaub_status === "genehmigt" || (!t.urlaub_status && t.quelle === "onoffice");
// Bilanz eines Mitarbeiters für ein Jahr. termine sollte Vorjahr + Jahr enthalten (für den automatischen Übertrag).
// Übertrag = manueller Übertrag (Profil) + nicht genommener Rest des Vorjahres, sofern das Vorjahr im Portal erfasst ist.
// Übertrag ist bis 31.03. nutzbar (§ 7 Abs. 3 BUrlG); ab 01.04. gilt der nicht genutzte Teil als verfallen.
function urlaubBilanz(profil: any, termine: any[], jahr: number, heuteIso?: string): any {
  const heute = heuteIso || new Date().toISOString().slice(0, 10);
  const teil = urlaubAnspruchJahr(profil, jahr);
  const eigene = urlaubEigene(profil, termine, jahr);
  const genehmigt = eigene.filter(urlaubIstGenehmigt).reduce((s: number, t: any) => s + urlaubTage(t), 0);
  const beantragt = eigene.filter((t: any) => t.urlaub_status === "beantragt").reduce((s: number, t: any) => s + urlaubTage(t), 0);
  // Vorjahr: nur, wenn der Mitarbeiter im Vorjahr schon da war (Eintritt vor dem Jahr) und Vorjahrsdaten vorliegen
  const eintrittJahr = profil && profil.eintritt ? parseInt(String(profil.eintritt).slice(0, 4), 10) : null;
  const vorjahrEigene = urlaubEigene(profil, termine, jahr - 1);
  const vorjahrErfasst = (eintrittJahr === null || eintrittJahr < jahr) && vorjahrEigene.length > 0;
  const uebertragAuto = vorjahrErfasst ? Math.max(0, urlaubAnspruchJahr(profil, jahr - 1).anspruch - vorjahrEigene.filter(urlaubIstGenehmigt).reduce((s: number, t: any) => s + urlaubTage(t), 0)) : 0;
  const uebertragManuell = Number(profil && profil.urlaub_uebertrag) || 0;
  const uebertrag = uebertragManuell + uebertragAuto;
  const frist = `${jahr}-03-31`;
  const genommenBisFrist = eigene.filter((t: any) => urlaubIstGenehmigt(t) && t.datum <= frist).reduce((s: number, t: any) => s + urlaubTage(t), 0);
  const uebertragGenutzt = Math.min(uebertrag, genommenBisFrist);
  const nachFrist = heute > frist;
  const uebertragVerfallen = nachFrist ? uebertrag - uebertragGenutzt : 0;
  const anspruch = teil.anspruch + (nachFrist ? uebertragGenutzt : uebertrag);
  return { jahresanspruch: teil.anspruch, anspruch, genehmigt, beantragt, rest: anspruch - genehmigt, restNachBeantragt: anspruch - genehmigt - beantragt,
    uebertrag, uebertragManuell, uebertragAuto, uebertragGenutzt, uebertragVerfallen, uebertragFrist: frist, nachFrist,
    eintraege: eigene, anteilig: teil.anteilig, monate: teil.monate, voll: teil.voll, staffel: (profil && profil.urlaub_staffel) || {} };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    let aufruferMandant: string | null = null;
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) { const { data: p } = await db.from("profiles").select("role, mandant_id").eq("id", u.user.id).maybeSingle(); if (!p || !["chef", "mitarbeiter"].includes(p.role)) throw new Error("Keine Berechtigung."); aufruferMandant = p.mandant_id || null; if (!aufruferMandant) throw new Error("Konto ohne Mandanten."); }
    }
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
    const monat = parseInt(heute.slice(5, 7), 10);
    const modus = body.modus || (monat >= 9 ? "jahresende" : "uebertrag");
    const jahr = Number(body.jahr) || parseInt(heute.slice(0, 4), 10);
    const frist = modus === "jahresende" ? `${jahr}-12-31` : `${jahr}-03-31`;

    // Ein Lauf je Mandant. Vorher lief die Auswertung ueber ALLE Profile und
    // ALLE Urlaubstermine der Plattform: die Aufgabe nannte die Mitarbeiter
    // fremder Buerros mit Namen und Resttagen, und die Antwort gab dem
    // Aufrufer dieselbe Liste samt E-Mail-Adressen zurueck.
    let mandanten: string[] = [];
    if (aufruferMandant) {
      mandanten = [aufruferMandant];
    } else {
      const { data: alle } = await db.from("mandanten").select("id").order("erstellt_am");
      mandanten = (alle || []).map((m: any) => String(m.id));
    }
    const ergebnisse: any[] = [];
    for (const mandant of mandanten) {
    urlaubBundesland = (await db.from("firma_stammdaten").select("bundesland").eq("mandant_id", mandant).not("bundesland", "is", null).order("sortierung").limit(1).maybeSingle()).data?.bundesland ?? null;

    const { data: profile } = await db.from("profiles").select("id, name, email, role, urlaubstage_jahr, urlaub_uebertrag, eintritt, urlaub_staffel").eq("mandant_id", mandant).in("role", ["chef", "mitarbeiter"]);
    const { data: termine } = await db.from("termine").select("id, art, datum, datum_ende, status, quelle, ersteller_id, ersteller_name, teilnehmer, urlaub_status, urlaub_arbeitstage").eq("mandant_id", mandant).ilike("art", "%urlaub%").gte("datum", `${jahr - 1}-01-01`).lte("datum", `${jahr}-12-31`);
    const chef = (profile || []).find((p: any) => p.role === "chef");
    const liste: any[] = [];
    for (const p of profile || []) {
      if (p.role === "chef") continue;
      const b = urlaubBilanz(p, termine || [], jahr, heute);
      const offen = modus === "jahresende" ? b.rest : Math.max(0, b.uebertrag - b.uebertragGenutzt);
      if (offen > 0) liste.push({ profil_id: p.id, name: p.name, email: p.email, resttage: offen, anspruch: b.anspruch, genehmigt: b.genehmigt, beantragt: b.beantragt, uebertrag: b.uebertrag });
    }
    const titel = modus === "jahresende" ? `Resturlaub-Hinweise ${jahr}: ${liste.length} Mitarbeiter mit offenen Tagen` : `Übertragener Urlaub ${jahr}: ${liste.length} Mitarbeiter müssen bis 31.03. nehmen`;
    const beschreibung = liste.length ? `${liste.map((x) => `${x.name} ${x.resttage} Tag${x.resttage === 1 ? "" : "e"}`).join(" · ")}. Ohne schriftlichen, individuellen Hinweis auf Resttage und Frist verfällt Urlaub nicht (BAG 9 AZR 541/15).` : "Niemand hat offene Tage — nichts zu tun.";
    let aufgabeId: string | null = null;
    if (liste.length) {
      const { data: vorhanden } = await db.from("aufgaben").select("id").eq("mandant_id", mandant).eq("typ", "urlaub_hinweis").eq("status", "offen").contains("daten", { modus, jahr }).limit(1);
      if (vorhanden && vorhanden.length) {
        aufgabeId = vorhanden[0].id;
        await db.from("aufgaben").update({ titel, beschreibung, daten: { modus, jahr, frist, liste } }).eq("id", aufgabeId);
      } else {
        const { data: neu, error } = await db.from("aufgaben").insert({ mandant_id: mandant, typ: "urlaub_hinweis", status: "offen", titel, beschreibung, zustaendig_id: chef ? chef.id : null, faellig_am: heute, daten: { modus, jahr, frist, liste } }).select("id").single();
        if (error) throw error; aufgabeId = neu?.id || null;
      }
    }
    ergebnisse.push({ mandant, betroffene: liste.length, aufgabe_id: aufgabeId, liste });
    }
    const eigenes = ergebnisse[0] || { betroffene: 0, aufgabe_id: null, liste: [] };
    return antwort({ ok: true, modus, jahr, frist, mandanten: ergebnisse.length,
                     betroffene: eigenes.betroffene, aufgabe_id: eigenes.aufgabe_id,
                     liste: aufruferMandant ? eigenes.liste : [] });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
