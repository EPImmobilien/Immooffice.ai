// ============================================================
// Edge Function: eigentuemer-loeschen (v2)
//
// Löscht einen Eigentümer komplett und unwiderruflich.
//
// WICHTIG (v2-Änderung):
//   Logische Fehler (falsches Passwort, falsche E-Mail-Bestätigung,
//   keine Berechtigung) geben jetzt HTTP 200 mit ok:false zurück,
//   damit das Frontend die Fehlermeldung lesen kann. Nur echte
//   Server-Fehler werfen 500.
//
// Sicherheit:
//  - Aufrufer muss ein Chef sein
//  - Chef muss sein Passwort zur Bestätigung mitschicken
//  - Die zu löschende E-Mail muss als "confirm_email" mitgeschickt werden
// ============================================================

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

// Hilfsfunktion: ok:false-Response mit 200 (damit Frontend die Meldung lesen kann)
function fehler200(msg: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: msg }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return fehler200("Nur POST");
  }

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey        = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Supabase-Secrets fehlen.");
    }

    // === 1. Aufrufer pruefen: muss Chef sein ===
    const authHeader = req.headers.get("Authorization") || "";
    const userJwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!userJwt) return fehler200("Nicht authentifiziert.");

    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(userJwt);
    if (userErr || !userData?.user) return fehler200("Nicht authentifiziert.");
    const aktuellerUserId = userData.user.id;
    const aktuellerUserEmail = userData.user.email;

    const { data: profil } = await userClient
      .from("profiles").select("role, name").eq("id", aktuellerUserId).maybeSingle();
    if (!profil || profil.role !== "chef") {
      return fehler200("Nur Chefs duerfen Eigentuemer loeschen.");
    }

    // === 2. Body ===
    const { eigentuemer_id, chef_passwort, confirm_email } = await req.json();
    // Loeschen mit dem service_role: ohne diese Zeile haette ein Chef den
    // Eigentuemer eines fremden Maklers entfernen koennen, samt Konto und
    // Dateien.
    await immoMandantSichern(req, [["eigentuemer", String(eigentuemer_id || "")]]);
    if (!eigentuemer_id) return fehler200("eigentuemer_id fehlt.");
    if (!chef_passwort) return fehler200("Chef-Passwort fehlt.");
    if (!confirm_email) return fehler200("E-Mail-Bestaetigung fehlt.");

    // === 3. Chef-Passwort verifizieren ===
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });
    const { error: pwErr } = await anonClient.auth.signInWithPassword({
      email: aktuellerUserEmail!,
      password: chef_passwort,
    });
    if (pwErr) {
      return fehler200("Chef-Passwort ist nicht korrekt.");
    }

    // === 4. Eigentuemer holen ===
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: eig, error: eigErr } = await adminClient
      .from("eigentuemer")
      .select("id, email, vorname, nachname, user_id")
      .eq("id", eigentuemer_id)
      .maybeSingle();
    if (eigErr) throw eigErr;
    if (!eig) return fehler200("Eigentuemer nicht gefunden.");

    // E-Mail-Bestaetigung pruefen
    const eigEmail = (eig.email || "").toLowerCase().trim();
    const confirmEmailNorm = String(confirm_email).toLowerCase().trim();
    if (eigEmail !== confirmEmailNorm) {
      return fehler200(`E-Mail-Bestaetigung stimmt nicht.\nEingegeben: "${confirmEmailNorm}"\nHinterlegt:  "${eigEmail}"`);
    }

    const status = {
      storage_dateien_geloescht: 0,
      storage_fehler: [] as string[],
      datenbank_eigentuemer_geloescht: false,
      auth_user_geloescht: false,
    };

    // === 5. Storage-Dateien loeschen ===
    try {
      const alleDateien = await sammleAlleDateien(adminClient, "eigentuemer-dokumente", eigentuemer_id);
      if (alleDateien.length > 0) {
        const { error: rmErr } = await adminClient.storage
          .from("eigentuemer-dokumente")
          .remove(alleDateien);
        if (rmErr) {
          status.storage_fehler.push("Bulk-Remove: " + rmErr.message);
        } else {
          status.storage_dateien_geloescht = alleDateien.length;
        }
      }
    } catch (e) {
      status.storage_fehler.push(String((e as Error).message || e));
    }

    // === 6. Eigentuemer-DB-Datensatz loeschen (cascadiert) ===
    const { error: delErr } = await adminClient
      .from("eigentuemer").delete().eq("id", eigentuemer_id);
    if (delErr) {
      return fehler200("Datenbank-Loeschung fehlgeschlagen: " + delErr.message);
    }
    status.datenbank_eigentuemer_geloescht = true;

    // === 7. Auth-User loeschen ===
    if (eig.user_id) {
      const { error: authDelErr } = await adminClient.auth.admin.deleteUser(eig.user_id);
      if (authDelErr) {
        console.warn("Auth-User-Loeschung fehlgeschlagen:", authDelErr.message);
      } else {
        status.auth_user_geloescht = true;
      }
    }

    // === 8. Audit-Log ===
    try {
      await adminClient.from("aktivitaeten").insert({
        typ: "eigentuemer_geloescht",
        zielgruppe: "makler",
        titel: "Eigentuemer geloescht",
        beschreibung: `Eigentuemer "${[eig.vorname, eig.nachname].filter(Boolean).join(" ") || eig.email}" wurde von ${profil.name || aktuellerUserEmail} unwiderruflich geloescht.`,
        gelesen_von: [aktuellerUserId],
      });
    } catch (_e) { /* nicht kritisch */ }

    return new Response(
      JSON.stringify({ ok: true, geloescht: status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: "Unerwarteter Server-Fehler: " + String((e as Error)?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sammleAlleDateien(client: any, bucket: string, praefix: string): Promise<string[]> {
  const dateien: string[] = [];
  async function walk(pfad: string) {
    const { data, error } = await client.storage.from(bucket).list(pfad, { limit: 1000 });
    if (error || !data) return;
    for (const item of data) {
      if (!item.name) continue;
      const vollPfad = pfad ? `${pfad}/${item.name}` : item.name;
      if (item.id === null || item.id === undefined) {
        await walk(vollPfad);
      } else {
        dateien.push(vollPfad);
      }
    }
  }
  await walk(praefix);
  return dateien;
}