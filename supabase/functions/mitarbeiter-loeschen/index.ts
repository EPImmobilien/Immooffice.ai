// ============================================================================
// mitarbeiter-loeschen
// ============================================================================
// Loescht einen Mitarbeiter (profiles + auth.users), nachdem alle seine
// Daten auf einen anderen User (typischerweise den Chef) uebertragen wurden.
//
// Input: { mitarbeiter_id, neuer_verantwortlicher_id }
// Output: { ok, uebertragen: {...counts...} }
//
// Authorization: Nur Chef darf aufrufen.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ---- Auth ----
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
      throw new Error("Nur der Chef darf Mitarbeiter loeschen.");
    }

    // ---- Body ----
    const body = await req.json();
    const mitarbeiterId          = (body.mitarbeiter_id || "").toString().trim();
    const neuerVerantwortlicherId = (body.neuer_verantwortlicher_id || userData.user.id).toString().trim();

    if (!mitarbeiterId) throw new Error("mitarbeiter_id ist Pflicht.");
    if (mitarbeiterId === neuerVerantwortlicherId) {
      throw new Error("Mitarbeiter kann nicht auf sich selbst uebertragen werden.");
    }
    if (mitarbeiterId === userData.user.id) {
      throw new Error("Du kannst dich nicht selbst loeschen.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Pruefen ob beide Profile existieren
    const { data: zuLoeschendes } = await admin
      .from("profiles").select("id, name, role").eq("id", mitarbeiterId).maybeSingle();
    if (!zuLoeschendes) throw new Error("Mitarbeiter-Profile existiert nicht.");

    const { data: zielProfil } = await admin
      .from("profiles").select("id").eq("id", neuerVerantwortlicherId).maybeSingle();
    if (!zielProfil) throw new Error("Ziel-User existiert nicht.");

    // ---- Daten umhaengen ----
    // Diese Liste muss konsistent sein mit den Foreign-Key-Referenzen auf profiles.id
    // (siehe information_schema-Query). Alle Tabellen mit "NO ACTION" muessen hier rein.
    const updates = [
      { table: "bewertungen",     column: "ersteller_id" },
      { table: "dokumente",       column: "uploader_id"  },
      { table: "liquid_imports",  column: "user_id"      },
      { table: "marketing",       column: "uploader_id"  },
      { table: "objektnachweise", column: "ersteller_id" },
      { table: "termine",         column: "ersteller_id" },
      { table: "vertraege",       column: "ersteller_id" },
    ];

    const counts: Record<string, number> = {};
    for (const u of updates) {
      const { error, count } = await admin
        .from(u.table)
        .update({ [u.column]: neuerVerantwortlicherId }, { count: "exact" })
        .eq(u.column, mitarbeiterId);
      if (error) {
        // Wenn Tabelle nicht existiert oder Spalte unbekannt: weiter (nicht fatal)
        console.warn(`Update ${u.table}.${u.column} fehlgeschlagen: ${error.message}`);
        counts[u.table] = -1;
      } else {
        counts[u.table] = count || 0;
      }
    }

    // ---- Mitarbeiter loeschen ----
    // Profile zuerst, dann Auth-User
    const { error: profileDelErr } = await admin
      .from("profiles").delete().eq("id", mitarbeiterId);
    if (profileDelErr) {
      throw new Error(`Profile-Loeschung fehlgeschlagen: ${profileDelErr.message}`);
    }

    // Auth-User loeschen (Admin-API)
    const { error: authDelErr } = await admin.auth.admin.deleteUser(mitarbeiterId);
    if (authDelErr) {
      // Profile ist schon weg - nur warnen, nicht failen
      console.warn(`Auth-User-Loeschung fehlgeschlagen: ${authDelErr.message}`);
    }

    return jsonResponse({
      ok: true,
      mitarbeiter: zuLoeschendes.name,
      uebertragen: counts,
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("mitarbeiter-loeschen:", meldung);
    return jsonResponse({ ok: false, error: meldung }, 400);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}