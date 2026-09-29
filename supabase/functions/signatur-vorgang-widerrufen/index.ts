// ============================================================================
// signatur-vorgang-widerrufen — Kern des "Abbrechen & mit Korrektur neu starten"
// ============================================================================
// Kapselt die drei Handgriffe, die bisher von Hand gemacht wurden, wenn in
// einem LAUFENDEN Signaturvorgang ein Empfängername falsch war (Tippfehler):
//   1) Vorgang auf status='widerrufen' setzen (das alte, falsche PDF ist raus)
//   2) Magic-Links aller noch nicht Unterschriebenen totlegen (Token entwerten),
//      damit niemand mehr das falsche Dokument unterzeichnet
//   3) optional die Eigentümer-Stammdaten korrigieren, damit der Fehler sich
//      beim nächsten Vorgang nicht wiederholt
//
// Diese Function startet BEWUSST NICHTS neu. Der Neustart erfolgt danach über
// den bestehenden, getesteten Weg signatur-vorgang-starten mit den korrigierten
// Empfängerdaten — so bleibt die grosse Function unangetastet.
//
// Rückgabe liefert alles, was die Portal-Oberfläche für den Neustart-Dialog
// braucht: Quelle (dokument_typ + quell_id) und die bisherigen Empfänger
// inkl. "hat schon unterschrieben?" (fuer die Warnung, wer erneut ran muss).
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
const ok = (o: any) => new Response(JSON.stringify({ ok: true, ...o }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
const err = (s: number, m: string) => new Response(JSON.stringify({ ok: false, fehler: m }), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  try {
    // ---- Nur Team (chef/mitarbeiter) darf widerrufen ----
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt || jwt === Deno.env.get("SUPABASE_ANON_KEY")) return err(401, "Anmeldung erforderlich.");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return err(401, "Ungültige Sitzung.");
    const { data: p } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (!p || !["chef", "mitarbeiter"].includes(p.role)) return err(403, "Keine Berechtigung.");

    const body = await req.json().catch(() => ({}));
    const vorgangId = body.vorgang_id;
    await immoMandantSichern(req, [["signatur_vorgaenge", vorgangId]]);
    if (!vorgangId) return err(400, "vorgang_id fehlt.");
    const korrekturen = Array.isArray(body.stammdaten_korrekturen) ? body.stammdaten_korrekturen : [];

    // ---- Vorgang + Empfänger laden ----
    const { data: vorgang, error: vErr } = await admin.from("signatur_vorgaenge")
      .select("id, dokument_typ, vertrag_id, status").eq("id", vorgangId).maybeSingle();
    if (vErr) throw vErr;
    if (!vorgang) return err(404, "Vorgang nicht gefunden.");
    if (vorgang.status === "abgeschlossen") return err(409, "Vorgang ist bereits abgeschlossen — kein Widerruf möglich.");

    const { data: empf, error: eErr } = await admin.from("signatur_empfaenger")
      .select("id, rolle, reihenfolge, anzeigename, klarname, email, status, unterschrieben_am, eigentuemer_person_id")
      .eq("vorgang_id", vorgangId).order("reihenfolge");
    if (eErr) throw eErr;

    // ---- 1) Vorgang widerrufen ----
    const { error: wErr } = await admin.from("signatur_vorgaenge")
      .update({ status: "widerrufen" }).eq("id", vorgangId);
    if (wErr) throw wErr;

    // ---- 2) Offene Magic-Links totlegen (nur nicht-unterschriebene) ----
    let tokenGetoetet = 0;
    for (const e of empf || []) {
      if (e.status === "unterschrieben") continue;
      const { error } = await admin.from("signatur_empfaenger")
        .update({ token: "widerrufen:" + vorgangId.slice(0, 8) + ":" + e.id })
        .eq("id", e.id);
      if (!error) tokenGetoetet++;
    }

    // ---- 3) Optional Stammdaten korrigieren ----
    const korrigiert: string[] = [];
    for (const k of korrekturen) {
      if (!k || !k.person_id) continue;
      const felder: Record<string, any> = {};
      for (const f of ["anrede", "vorname", "nachname", "email"]) {
        if (typeof k[f] === "string" && k[f].trim()) felder[f] = k[f].trim();
      }
      if (!Object.keys(felder).length) continue;
      felder.updated_at = new Date().toISOString();
      const { error } = await admin.from("eigentuemer_personen").update(felder).eq("id", k.person_id);
      if (!error) korrigiert.push(k.person_id);
    }

    return ok({
      widerrufen: true,
      token_getoetet: tokenGetoetet,
      stammdaten_korrigiert: korrigiert,
      // Alles für den Neustart-Dialog:
      quelle: { dokument_typ: vorgang.dokument_typ, quell_id: vorgang.vertrag_id },
      empfaenger: (empf || []).map((e) => ({
        rolle: e.rolle, reihenfolge: e.reihenfolge,
        anzeigename: e.anzeigename, klarname: e.klarname, email: e.email,
        eigentuemer_person_id: e.eigentuemer_person_id,
        hatte_unterschrieben: e.status === "unterschrieben",
        unterschrieben_am: e.unterschrieben_am,
      })),
    });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
});
