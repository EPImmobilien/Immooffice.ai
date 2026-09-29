// ============================================================================
// mitarbeiter-anlegen (v1, 22.09.2026)
// ============================================================================
// Vorfall: Katja von Wedel konnte sich nicht anmelden - "Anmeldedaten falsch".
// Befund: Das Portal legte Mitarbeiter per auth.signUp() an. Damit bleibt das
// Konto unbestaetigt (email_confirmed_at = null), bis die Person den Link aus
// der Bestaetigungsmail klickt. Kommt die Mail nicht an (Spamfilter, Limit des
// Mailversands), ist die Person ausgesperrt - und die Fehlermeldung nennt nur
// falsche Anmeldedaten. Zusaetzlich ersetzt signUp() im Browser die Sitzung des
// Chefs durch die des neuen Kontos.
//
// Diese Funktion legt das Konto ueber die Admin-API an: sofort bestaetigt, ohne
// Mailversand, ohne die Sitzung des Chefs anzufassen. Das Profil entsteht wie
// bisher ueber den Trigger handle_new_user; Titel, Firma, Stufe und Rechte
// werden danach nachgetragen.
//
// Input:  { email, passwort, name, titel?, firma_id?, stufe?, rechte? }
// Output: { ok, user_id, name }
// Nur der Chef darf aufrufen.
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ---- Auth: nur Chef ----
    const authHeader = req.headers.get("Authorization") || "";
    const userJwt = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(userJwt);
    if (userErr || !userData?.user) throw new Error("Nicht authentifiziert.");

    const { data: profil } = await userClient
      .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (!profil || profil.role !== "chef") {
      throw new Error("Nur der Chef darf Mitarbeiter anlegen.");
    }

    // ---- Eingaben ----
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const passwort = String(body.passwort || body.password || "");
    const name = String(body.name || "").trim();
    const titel = String(body.titel || "").trim();
    const firmaId = body.firma_id || null;
    await immoMandantSichern(req, [["firma_stammdaten", String(firmaId || "")]]);
    const stufe = body.stufe || null;
    const rechte = body.rechte || null;

    if (!email || !email.includes("@")) throw new Error("Bitte eine gueltige E-Mail-Adresse angeben.");
    if (passwort.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen haben.");
    if (!name) throw new Error("Bitte einen Namen angeben.");

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // ---- Konto anlegen: sofort bestaetigt ----
    const { data: neu, error: anlegeFehler } = await admin.auth.admin.createUser({
      email,
      password: passwort,
      email_confirm: true,
      user_metadata: { name, role: "mitarbeiter", must_change_password: true },
    });
    if (anlegeFehler) {
      const text = String(anlegeFehler.message || "");
      if (/already|registered|exists/i.test(text)) {
        throw new Error("Diese E-Mail-Adresse hat bereits ein Konto.");
      }
      throw anlegeFehler;
    }
    const userId = neu?.user?.id;
    if (!userId) throw new Error("Konto konnte nicht angelegt werden.");

    // ---- Zusatzfelder am Profil (der Trigger hat es bereits erzeugt) ----
    const patch: Record<string, unknown> = {};
    if (titel) patch.titel = titel;
    if (firmaId) patch.firma_id = firmaId;
    if (stufe) patch.stufe = stufe;
    if (rechte) patch.rechte = rechte;
    if (Object.keys(patch).length) {
      const { error: patchFehler } = await admin.from("profiles").update(patch).eq("id", userId);
      if (patchFehler) console.warn("Profil-Zusatzfelder:", patchFehler.message);
    }

    return jsonResponse({ ok: true, user_id: userId, name });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("mitarbeiter-anlegen:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 400);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
