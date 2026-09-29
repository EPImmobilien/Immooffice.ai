// ============================================================================
// credentials-speichern
// ============================================================================
// Setzt oder aktualisiert Login-Credentials zu einem externen Dienst.
// Nur Chef darf aufrufen. Passwort wird XOR-obfuscated gespeichert.
//
// Input: {
//   service: string,       // z.B. "bewertungsdienst"
//   label: string,
//   url: string,
//   username: string,
//   password: string,
//   hinweis?: string,
// }
// Output: { ok: true, id }
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

// XOR-Obfuscation mit Server-Secret + Base64
function obfuscate(plaintext: string, secret: string): string {
  if (!plaintext) return "";
  const text = new TextEncoder().encode(plaintext);
  const key = new TextEncoder().encode(secret);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text[i] ^ key[i % key.length];
  }
  return btoa(String.fromCharCode(...out));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const obfSecret  = Deno.env.get("CREDENTIALS_OBF_SECRET");
    if (!obfSecret) throw new Error("CREDENTIALS_OBF_SECRET fehlt in Edge Function Secrets.");

    // Auth-Check
    const authHeader = req.headers.get("Authorization") || "";
    const userJwt = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser(userJwt);
    if (uErr || !userData?.user) throw new Error("Nicht authentifiziert.");

    const { data: profil } = await userClient
      .from("profiles").select("role, name, mandant_id").eq("id", userData.user.id).maybeSingle();
    if (!profil || profil.role !== "chef") throw new Error("Nur der Chef darf Credentials setzen.");

    // Body
    const body = await req.json();
    const service  = (body.service  || "").toString().trim().toLowerCase();
    const label    = (body.label    || "").toString().trim();
    const url      = (body.url      || "").toString().trim();
    const username = (body.username || "").toString().trim();
    const password = (body.password || "").toString();
    const hinweis  = (body.hinweis  || "").toString().trim() || null;

    if (!service || !label || !url || !username || !password) {
      throw new Error("Service, label, url, username und password sind Pflicht.");
    }

    const password_obfuscated = obfuscate(password, obfSecret);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Upsert auf service (unique)
    // Seit fork_17 ist der Dienstname nur noch JE MANDANT eindeutig. Ohne
    // Grenze traf maybeSingle() ab dem zweiten Mandanten mehrere Zeilen —
    // und davor die falsche: der eine Makler haette die Zugangsdaten des
    // anderen ueberschrieben.
    const { data: existing } = await admin
      .from("external_credentials").select("id").eq("mandant_id", profil.mandant_id).eq("service", service).maybeSingle();

    let row;
    let aktion: "create" | "update" = "create";

    if (existing?.id) {
      aktion = "update";
      const { data, error } = await admin
        .from("external_credentials")
        .update({
          label, url, username, password_obfuscated, hinweis,
          updated_by: userData.user.id,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      row = data;
    } else {
      const { data, error } = await admin
        .from("external_credentials")
        .insert({
          service, label, url, username, password_obfuscated, hinweis,
          updated_by: userData.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      row = data;
    }

    // Audit-Log
    await admin.from("external_credentials_audit").insert({
      credential_id: row.id,
      user_id: userData.user.id,
      user_name: profil.name || null,
      aktion,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    return jsonResponse({ ok: true, id: row.id, aktion });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("credentials-speichern:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 400);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}