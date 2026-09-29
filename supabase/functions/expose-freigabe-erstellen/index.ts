// ============================================================================
// expose-freigabe-erstellen v10 (Deploy-Version 18)
//   v8: nimmt das FINAL markierte Exposé (immobilie_datei.expose_final), sonst das neueste;
//       merkt sich zusätzlich alle Unterlagen mit interessenten_freigabe = true (dokument_ids),
//       die nach der Bestätigung mit freigeschaltet werden.
//   v9: Der Link zeigt direkt auf die kleine Bestätigungsseite (freigabe.html?expose=TOKEN) statt auf
//       /?expose= – unabhängig von der Netlify-Umschreibung und der Ersatzseite in der großen index.html.
//   v10 (Stufe 53, Objekt-Landingpage): body.landing (true/false) oder – wenn nicht angegeben –
//       portal_einstellungen.landing_standard entscheidet, ob der Link auf die Objektseite
//       (objekt.html?t=TOKEN) oder auf die reine Download-Seite zeigt. Freigabe bekommt landing=true/false;
//       Antwort enthält url (gewählt), url_expose (Download-Seite), url_objekt (Objektseite), landing.
//   Quelle im Repo: portal/objekt-landingpage/expose-freigabe-erstellen-v10.ts
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
const LINK_BASIS = (Deno.env.get("EXPOSE_FREIGABE_BASIS") || "https://immooffice.example/?expose=").replace(/\/\?expose=$/, "/freigabe.html?expose=");
const OBJEKT_BASIS = LINK_BASIS.replace(/freigabe\.html\?expose=$/, "objekt.html?t=");

function token(): string { const b = new Uint8Array(24); crypto.getRandomValues(b); return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join(""); }
function provisionNorm(p: unknown): string {
  let s = String(p ?? "").trim(); if (!s) return "";
  s = s.replace(/\s*%\s*$/, "").replace(/\s+/g, " ");
  if (/^\d+([.,]\d+)?$/.test(s)) s = s.replace(".", ",") + " %"; else if (!/%/.test(s)) s = s + " %";
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
    const { data: p } = await db.from("profiles").select("role, firma_id").eq("id", u.user.id).maybeSingle();
    if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
    const body = await req.json().catch(() => ({}));
    const immobilieId = String(body.immobilie_id || "").trim();
    await immoMandantSichern(req, [["immobilien", immobilieId],
                                   ["kontakte", String(body.kontakt_id || "")]]);
    const email = String(body.email || "").replace(/^.*<([^>]+)>.*$/, "$1").trim().toLowerCase();
    if (!immobilieId) throw new Error("immobilie_id fehlt.");
    if (!email || !email.includes("@")) throw new Error("Gültige E-Mail-Adresse des Interessenten fehlt.");
    const { data: im, error: imErr } = await db.from("immobilien").select("id, immo_nr, objekttitel, bezeichnung, strasse, hausnummer, plz, ort, vertragsart, provision_aussen, provisionsfrei, zustaendig_id").eq("id", immobilieId).maybeSingle();
    if (imErr) throw imErr; if (!im) throw new Error("Objekt nicht gefunden.");

    const { data: dateien } = await db.from("immobilie_datei").select("id, name, storage_path, created_at, expose_final, interessenten_freigabe").eq("immobilie_id", immobilieId).order("created_at", { ascending: false }).limit(200);
    const exposes = (dateien || []).filter((d: any) => /\.pdf$/i.test(d.name || "") && (/\/expose\//i.test(d.storage_path || "") || /expos/i.test(d.name || "")));
    const expose = exposes.find((d: any) => d.expose_final) || exposes[0];
    if (!expose) throw new Error("Am Objekt liegt noch kein Exposé-PDF. Bitte zuerst das Exposé erzeugen und als final markieren.");
    const dokumente = (dateien || []).filter((d: any) => d.interessenten_freigabe && d.storage_path && d.id !== expose.id).map((d: any) => d.id);

    const istMiete = /miet/i.test(String(im.vertragsart || ""));
    let modell = String(body.provisionsmodell || "").trim();
    let provision = body.provision !== undefined ? provisionNorm(body.provision) : provisionNorm(im.provision_aussen);
    if (!modell) { if (istMiete) modell = "miete"; else if (im.provisionsfrei || !provision || /^0([.,]0+)? %$/.test(provision)) modell = "provisionsfrei"; else modell = "kaeufer"; }
    if (modell === "kaeufer" && !provision) throw new Error("Am Objekt ist keine Käuferprovision hinterlegt. Bitte Provision angeben oder als provisionsfrei kennzeichnen.");
    const provisionText = modell === "miete" ? "Für Sie als Mieter fallen keine Maklerkosten an (Bestellerprinzip, § 2 WoVermRG)."
      : modell === "provisionsfrei" ? "Der Erwerb dieser Immobilie ist für Sie als Käufer provisionsfrei."
      : `Im Falle des Erwerbs der Immobilie zahlen Sie als Käufer eine Maklerprovision in Höhe von ${provision} inkl. der gesetzlichen Mehrwertsteuer, berechnet auf den beurkundeten Kaufpreis. Die Provision ist ausschließlich dann verdient und fällig, wenn ein notarieller Kaufvertrag über diese Immobilie mit Ihnen zustande kommt. Das Anfordern des Exposés, Besichtigungen und unsere Beratung sind für Sie kostenfrei – entscheiden Sie sich gegen den Kauf, entstehen Ihnen keinerlei Kosten.`;

    let firmaSlug: string | null = null;
    const zust = im.zustaendig_id || u.user.id;
    const { data: zp } = await db.from("profiles").select("firma_id").eq("id", zust).maybeSingle();
    const firmaId = zp?.firma_id || p.firma_id;
    if (firmaId) { const { data: f } = await db.from("firma_stammdaten").select("slug").eq("id", firmaId).maybeSingle(); firmaSlug = f?.slug || null; }

    // v10: Objektseite oder Download-Seite
    let landing: boolean;
    if (typeof body.landing === "boolean") landing = body.landing;
    else { const { data: e } = await db.from("portal_einstellungen").select("wert").eq("schluessel", "landing_standard").maybeSingle(); landing = e ? e.wert === true : true; }

    const t = token();
    const { data: row, error } = await db.from("expose_freigaben").insert({
      token: t, immobilie_id: immobilieId, kontakt_id: body.kontakt_id || null, email, name: body.name || null,
      provisionsmodell: modell, provision_text: provisionText, firma_slug: firmaSlug || "standard",
      erstellt_von: u.user.id, expose_datei_id: expose.id, dokument_ids: dokumente, landing,
    }).select("id").single();
    if (error) throw error;
    return antwort({ ok: true, url: landing ? `${OBJEKT_BASIS}${t}` : `${LINK_BASIS}${t}`, url_expose: `${LINK_BASIS}${t}`, url_objekt: `${OBJEKT_BASIS}${t}`, landing, url_direkt: `${Deno.env.get("SUPABASE_URL")}/functions/v1/expose-freigabe?t=${t}`, freigabe_id: row.id, provisionsmodell: modell, provision_text: provisionText, expose_datei: expose.name, expose_final: !!expose.expose_final, dokumente: dokumente.length });
  } catch (e) { return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }); }
});
