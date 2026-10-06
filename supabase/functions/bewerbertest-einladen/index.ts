// ============================================================================
// Edge Function: bewerbertest-einladen  (v2)
// Legt eine Test-Einladung fuer einen Makler-Bewerber an und liefert den Link.
// v2: Der Test laeuft jetzt IM Portal (index.html) unter ?bewerbertest=TOKEN
//     (gleiches Muster wie die Signatur-Seite) statt auf bewerbertest.html.
// Berechtigung: nur Chef-Rolle. Versand des Links erfolgt manuell (Kopieren).
// ============================================================================

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonErr(status: number, msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function tokenErzeugen(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const vorname = (body.vorname || "").trim();
    const nachname = (body.nachname || "").trim();
    const email = (body.email || "").trim() || null;
    const quereinsteiger = !!body.quereinsteiger;
    const notiz = (body.notiz || "").trim() || null;

    if (!vorname || !nachname) return jsonErr(400, "vorname und nachname sind Pflicht");

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonErr(401, "Kein Auth-Token");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonErr(401, "Nicht authentifiziert");

    const { data: profile } = await admin
      .from("profiles").select("role, mandant_id").eq("id", userData.user.id).maybeSingle();
    if (profile?.role !== "chef") return jsonErr(403, "Bewerber-Tests sind nur fuer die Chef-Rolle verfuegbar");

    const token = tokenErzeugen();
    const { data: einladung, error: insErr } = await admin
      .from("bewerber_einladungen")
      .insert({
        mandant_id: profile.mandant_id,
        erstellt_von: userData.user.id,
        vorname, nachname, email, quereinsteiger, notiz, token,
      })
      .select()
      .single();
    if (insErr) return jsonErr(500, "Einladung konnte nicht angelegt werden: " + insErr.message);

    const base = (body.base_url || immoFehlt("PORTAL_URL")).replace(/[?#].*$/, "");
    const link = `${base}?bewerbertest=${token}`;

    return new Response(JSON.stringify({ ok: true, einladung, link }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("bewerbertest-einladen Fehler:", e);
    return jsonErr(500, e instanceof Error ? e.message : String(e));
  }
});
