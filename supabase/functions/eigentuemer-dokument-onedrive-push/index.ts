// ============================================================
// eigentuemer-dokument-onedrive-push (v3)
//
// v3-Aenderungen:
//   - Detaillierte Fehler-Logs (Status, Body, URL) im Antwort-JSON
//   - Bei Drive-ID-Konflikt: zweiter Versuch mit /me/drive/items/{itemId}
//   - HTTP 200 + ok:false fuer logische Fehler, damit Frontend Meldung sieht
//
// v2-Funktionalitaet bleibt:
// A) Per Ziel-Ordner-ID (bevorzugt — fuer geteilte Drives):
//      body: { dokument_id, ms_access_token, ziel_drive_id, ziel_item_id }
// B) Per Pfad (Fallback, nur fuer eigene OneDrive):
//      body: { dokument_id, ms_access_token, ziel_ordner }
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

function ok200(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl     = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return ok200({ ok: false, error: "Supabase-Secrets fehlen." });

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, "")
    );
    if (userErr || !userData?.user) return ok200({ ok: false, error: "Nicht authentifiziert." });

    const { data: profil } = await userClient
      .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (!profil || !["chef", "mitarbeiter"].includes(profil.role)) {
      return ok200({ ok: false, error: "Nur Makler oder Chef duerfen Dokumente nach OneDrive schieben." });
    }

    const body = await req.json();
    const dokumentId  = body.dokument_id;
    await immoMandantSichern(req, [["eigentuemer_dokumente", String(dokumentId || "")]]);
    const msToken     = body.ms_access_token;
    if (!dokumentId || !msToken) {
      return ok200({ ok: false, error: "dokument_id und ms_access_token sind erforderlich." });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Dokument-Datensatz holen
    const { data: dok, error: dokErr } = await adminClient
      .from("eigentuemer_dokumente").select("*").eq("id", dokumentId).single();
    if (dokErr || !dok) return ok200({ ok: false, error: "Dokument nicht gefunden." });

    // Datei aus Storage downloaden
    const { data: blob, error: dlErr } = await adminClient.storage
      .from("eigentuemer-dokumente").download(dok.pfad);
    if (dlErr || !blob) {
      return ok200({ ok: false, error: "Storage-Download fehlgeschlagen: " + (dlErr?.message || "leer"), pfad_versucht: dok.pfad });
    }

    const buffer = await blob.arrayBuffer();
    const sicherName = (body.dateiname || dok.name || "datei").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_");

    let uploadUrl: string;
    let onedriveDescriptor: string;
    let modus: string;

    if (body.ziel_drive_id && body.ziel_item_id) {
      modus = "drive_item_id";
      uploadUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(body.ziel_drive_id)}/items/${encodeURIComponent(body.ziel_item_id)}:/${encodeURIComponent(sicherName)}:/content`;
      onedriveDescriptor = `drive:${body.ziel_drive_id}/item:${body.ziel_item_id}/${sicherName}`;
    } else if (body.ziel_ordner) {
      modus = "ordner_pfad";
      const zielPfad = `${body.ziel_ordner.replace(/^\/+|\/+$/g, "")}/${sicherName}`;
      uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURI(zielPfad)}:/content`;
      onedriveDescriptor = zielPfad;
    } else {
      return ok200({ ok: false, error: "Es muss entweder (ziel_drive_id + ziel_item_id) ODER ziel_ordner angegeben werden." });
    }

    let uploadResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${msToken}`,
        "Content-Type": dok.content_type || "application/octet-stream",
      },
      body: buffer,
    });

    // Fallback: Wenn der Drive-ID/Item-ID Aufruf scheitert, versuchen wir's
    // ueber /me/drive/items/{itemId} — funktioniert fuer Items in eigenen OneDrives
    // und einigen Shared-Konfigurationen.
    let fallbackVersucht = false;
    if (!uploadResp.ok && modus === "drive_item_id") {
      fallbackVersucht = true;
      const fallbackUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(body.ziel_item_id)}:/${encodeURIComponent(sicherName)}:/content`;
      uploadResp = await fetch(fallbackUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${msToken}`,
          "Content-Type": dok.content_type || "application/octet-stream",
        },
        body: buffer,
      });
      uploadUrl = fallbackUrl; // fuer Logging
    }

    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      return ok200({
        ok: false,
        error: `Graph-API: HTTP ${uploadResp.status}`,
        details: {
          modus,
          fallbackVersucht,
          status: uploadResp.status,
          url: uploadUrl,
          ziel_drive_id: body.ziel_drive_id,
          ziel_item_id: body.ziel_item_id,
          graph_antwort: errText.slice(0, 800),
        },
      });
    }
    const fileMeta = await uploadResp.json();

    await adminClient.from("eigentuemer_dokumente").update({
      onedrive_pfad: onedriveDescriptor,
      onedrive_uebertragen_am: new Date().toISOString(),
    }).eq("id", dokumentId);

    await adminClient.from("aktivitaeten").insert({
      zielgruppe: "makler",
      eigentuemer_id: dok.eigentuemer_id,
      maklervertrag_id: dok.maklervertrag_id,
      typ: "onedrive_uebertragen",
      titel: `Auf OneDrive verschoben: ${dok.name}`,
      ref_tabelle: "eigentuemer_dokumente",
      ref_id: dokumentId,
    });

    return ok200({
      ok: true,
      onedrive_pfad: onedriveDescriptor,
      web_url: fileMeta.webUrl || null,
      item_id: fileMeta.id || null,
      modus,
      fallbackVersucht,
    });
  } catch (e) {
    return ok200({ ok: false, error: "Unerwarteter Fehler: " + String((e as Error)?.message || e) });
  }
});