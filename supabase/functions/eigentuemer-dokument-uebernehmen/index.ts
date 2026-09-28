// eigentuemer-dokument-uebernehmen v1 (25.09.2026, Stufe 88 / Auftrag 10.3)
// Kopiert einen Upload aus dem Kundenportal (eigentuemer_dokumente, Bucket eigentuemer-dokumente) in die
// Objektablage (immobilie_datei, Bucket immobilie-dateien), sofern der Maklervertrag mit einem Objekt verknuepft ist.
// Aufruf: { dokument_id } (ein Dokument) oder { eigentuemer_id, alle: true } (alle noch nicht uebernommenen).
// Erlaubt fuer Team (chef/mitarbeiter) und fuer den Eigentuemer selbst (eigentuemer.user_id / eigentuemer_personen.user_id).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

const DOKTYP: Record<string, string> = {
  grundbuch: "Grundbuchauszug", energieausweis: "Energieausweis", verbrauchsausweis: "Energieausweis", grundrisse: "Grundriss",
  flurkarte: "Flurkarte", lageplan: "Lageplan", teilungserklaerung: "Teilungserklärung", wohnflaechenberechnung: "Wohnflächenberechnung",
  expose: "Exposé", gutachten: "Gutachten", mietvertrag: "Mietvertrag", versicherung: "Versicherung", grundsteuer: "Grundsteuerbescheid",
  nebenkostenabrechnung: "Nebenkostenabrechnung", baubeschreibung: "Baubeschreibung", bauantrag: "Baugenehmigung", baulasten: "Baulastenverzeichnis",
  altlasten: "Altlasten-Auskunft", uebergabeprotokoll: "Übergabeprotokoll", vollmacht: "Vollmacht", maklervertrag_kopie: "Maklervertrag",
};
const safeName = (n: string) => String(n || "datei").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-90);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
    const auth = req.headers.get("Authorization") || "";
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data: u, error: ue } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (ue || !u?.user) return antwort({ ok: false, error: "Nicht authentifiziert." }, 401);
    const uid = u.user.id;
    const { data: profil } = await admin.from("profiles").select("role").eq("id", uid).maybeSingle();
    const istTeam = ["chef", "mitarbeiter"].includes(profil?.role || "");

    const body = await req.json().catch(() => ({}));
    let docs: any[] = [];
    if (body.dokument_id) {
      const { data, error } = await admin.from("eigentuemer_dokumente").select("*").eq("id", body.dokument_id).maybeSingle();
      if (error) throw error;
      if (data) docs = [data];
    } else if (body.eigentuemer_id && body.alle) {
      const { data, error } = await admin.from("eigentuemer_dokumente").select("*").eq("eigentuemer_id", body.eigentuemer_id)
        .is("immobilie_datei_id", null).not("maklervertrag_id", "is", null).order("created_at", { ascending: true }).limit(200);
      if (error) throw error;
      docs = data || [];
    } else return antwort({ ok: false, error: "dokument_id oder eigentuemer_id+alle angeben." }, 400);
    if (!docs.length) return antwort({ ok: true, uebernommen: 0, uebersprungen: 0, hinweise: ["nichts zu übernehmen"] });

    // Berechtigung: Team oder der betroffene Eigentuemer (Hauptkonto oder berechtigte Person)
    if (!istTeam) {
      const eigIds = [...new Set(docs.map((d) => d.eigentuemer_id).filter(Boolean))];
      const { data: eig } = await admin.from("eigentuemer").select("id").in("id", eigIds).eq("user_id", uid);
      const { data: pers } = await admin.from("eigentuemer_personen").select("eigentuemer_id").in("eigentuemer_id", eigIds).eq("user_id", uid);
      const erlaubt = new Set([...(eig || []).map((e) => e.id), ...(pers || []).map((p) => p.eigentuemer_id)]);
      if (!eigIds.every((id) => erlaubt.has(id))) return antwort({ ok: false, error: "Keine Berechtigung." }, 403);
    }

    let uebernommen = 0, uebersprungen = 0; const hinweise: string[] = []; const dateien: any[] = [];
    for (const d of docs) {
      try {
        if (d.immobilie_datei_id) { uebersprungen++; continue; }
        if (!d.maklervertrag_id) { uebersprungen++; hinweise.push(`${d.name}: kein Maklervertrag`); continue; }
        const { data: v } = await admin.from("vertraege").select("id, immobilie_id").eq("id", d.maklervertrag_id).maybeSingle();
        if (!v?.immobilie_id) { uebersprungen++; hinweise.push(`${d.name}: Maklervertrag ohne Objekt`); continue; }
        if (!d.pfad) { uebersprungen++; hinweise.push(`${d.name}: kein Speicherpfad`); continue; }
        const { data: blob, error: dlErr } = await admin.storage.from("eigentuemer-dokumente").download(d.pfad);
        if (dlErr || !blob) throw new Error("Download fehlgeschlagen: " + (dlErr?.message || "leer"));
        const zielPfad = `immobilien/${v.immobilie_id}/dokumente/${Date.now()}_${safeName(d.name)}`;
        const { error: upErr } = await admin.storage.from("immobilie-dateien").upload(zielPfad, blob, { contentType: d.content_type || "application/octet-stream", upsert: false });
        if (upErr) throw new Error("Upload fehlgeschlagen: " + upErr.message);
        const doktyp = DOKTYP[String(d.kategorie || "").toLowerCase()] || null;
        const satz: Record<string, unknown> = {
          immobilie_id: v.immobilie_id, name: d.name, titel: doktyp ? `${doktyp} (Eigentümer)` : null, doktyp, mime_type: d.content_type || null,
          size_bytes: d.groesse || null, speicher_typ: "supabase", storage_path: zielPfad, quelle: "eigentuemer_portal", kategorie: "dokument",
          oeffentlich: false, expose_ausschliessen: true, interessenten_freigabe: false, ersteller_id: null,
          notizen: `Aus dem Kundenportal übernommen (Upload vom ${new Date(d.created_at).toLocaleDateString("de-DE")}${d.hochgeladen_von_typ === "eigentuemer" ? " durch den Eigentümer" : ""}; Portal-Dokument ${d.id}).`,
        };
        const { data: neu, error: insErr } = await admin.from("immobilie_datei").insert(satz).select("id").single();
        if (insErr) { await admin.storage.from("immobilie-dateien").remove([zielPfad]).catch(() => {}); throw insErr; }
        await admin.from("eigentuemer_dokumente").update({ immobilie_datei_id: neu.id }).eq("id", d.id);
        uebernommen++; dateien.push({ dokument_id: d.id, immobilie_datei_id: neu.id, immobilie_id: v.immobilie_id });
      } catch (e) { uebersprungen++; hinweise.push(`${d.name}: ${String((e as Error)?.message || e)}`); }
    }
    return antwort({ ok: true, uebernommen, uebersprungen, hinweise, dateien });
  } catch (e) {
    return antwort({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
