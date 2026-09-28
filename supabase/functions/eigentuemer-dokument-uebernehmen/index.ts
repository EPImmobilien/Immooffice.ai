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
    // --- Storage: Pfade tragen den Mandanten als erstes Segment -----------
    // Gleiche Bauart wie die Huelle der Oberflaeche. Sie steht IM Handler und
    // nicht auf Modulebene: eine Mandantenvariable auf Modulebene ueberlebt in
    // Deno die Anfrage und traegt den Mandanten des einen Aufrufers in den
    // naechsten. Genau das waere ein Leck statt einer Trennung.
    // Solange immoMandant null ist, bleibt jeder Pfad unveraendert — die
    // Funktion verhaelt sich dann wie bisher.
    let immoMandant: string | null = null;
    const immoSetzeMandant = (m: unknown) => { immoMandant = (typeof m === "string" && m) ? m : null; };
    // Schriften sind Plattform-Gut, kein Mandanten-Branding. Sie liegen im
    // Wurzelverzeichnis des Eimers unter fonts/. Fehlt eine, wird sie beim
    // ersten Bedarf von ihrer Quelle geholt und dort abgelegt — danach nie
    // wieder. Ein Mandant, der eine eigene Hausschrift hochlaedt, legt sie
    // unter {mandant}/fonts/… und uebersteuert damit die der Plattform.
    const IMMO_SCHRIFTEN: Record<string, string> = {
      "fonts/Montserrat-Regular.ttf":        "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Regular.ttf",
      "fonts/Montserrat-Bold.ttf":           "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Bold.ttf",
      "fonts/Montserrat-Light.ttf":          "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Light.ttf",
      "fonts/Montserrat-Medium.ttf":         "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Medium.ttf",
      "fonts/Montserrat-SemiBold.ttf":       "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBold.ttf",
      "fonts/Montserrat-Italic.ttf":         "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Italic.ttf",
      "fonts/Montserrat-SemiBoldItalic.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-SemiBoldItalic.ttf",
      "fonts/Marcellus-Regular.ttf":         "https://raw.githubusercontent.com/google/fonts/main/ofl/marcellus/Marcellus-Regular.ttf",
      "fonts/GreatVibes-Regular.ttf":        "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf",
    };
    {
      const immoEcht = admin.storage.from.bind(admin.storage);
      const immoVorne = (pf: unknown): unknown =>
        (typeof pf !== "string" || !pf || !immoMandant) ? pf
          : (pf === immoMandant || pf.startsWith(immoMandant + "/") ? pf : immoMandant + "/" + pf);
      const immoViele = (pf: unknown): unknown => Array.isArray(pf) ? pf.map(immoVorne) : immoVorne(pf);
      (admin.storage as any).from = (eimer: string) => {
        const api: any = immoEcht(eimer);
        const h: any = Object.create(api);
        for (const n of ["upload", "remove", "createSignedUrl",
                         "createSignedUrls", "getPublicUrl", "info", "exists"]) {
          if (typeof api[n] === "function") h[n] = (pf: unknown, ...r: unknown[]) => api[n](immoViele(pf), ...r);
        }
        // Lesen in drei Stufen: die Datei des Mandanten, sonst die der
        // Plattform, sonst — bei einer Schrift — einmal von der Quelle.
        // Geschrieben wird dabei nur ins Wurzelverzeichnis und nur eine
        // Schrift; Mandantendateien kann diese Stufe nicht anfassen.
        if (typeof api.download === "function") h.download = async (pf: unknown, ...r: unknown[]) => {
          const hole = async (p: unknown) => {
            try { return await api.download(p, ...r); } catch (e) { return { data: null, error: e }; }
          };
          const erst = await hole(immoViele(pf));
          if (erst?.data) return erst;
          if (typeof pf === "string" && immoMandant) {
            const zweit = await hole(pf);
            if (zweit?.data) return zweit;
          }
          if (eimer === "branding-assets" && typeof pf === "string" && IMMO_SCHRIFTEN[pf]) {
            try {
              const a = await fetch(IMMO_SCHRIFTEN[pf]);
              if (a.ok) {
                const roh = new Uint8Array(await a.arrayBuffer());
                try { await api.upload(pf, roh, { contentType: "font/ttf", upsert: true }); }
                catch (_e) { /* beim naechsten Mal wieder */ }
                console.log("Schrift nachgeladen:", pf, roh.byteLength);
                return { data: new Blob([roh]), error: null };
              }
            } catch (e) { console.warn("Schrift nicht erreichbar:", pf, String(e)); }
          }
          return erst;
        };
        if (typeof api.list === "function") {
          h.list = (pf?: string, ...r: unknown[]) => api.list(pf ? (immoVorne(pf) as string) : (immoMandant ?? pf), ...r);
        }
        for (const n of ["move", "copy"]) {
          if (typeof api[n] === "function") h[n] = (a: unknown, b: unknown, ...r: unknown[]) => api[n](immoVorne(a), immoVorne(b), ...r);
        }
        return h;
      };
    }
    const { data: u, error: ue } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (ue || !u?.user) return antwort({ ok: false, error: "Nicht authentifiziert." }, 401);
    const uid = u.user.id;
    const { data: profil } = await admin.from("profiles").select("role, mandant_id").eq("id", uid).maybeSingle(); immoSetzeMandant(profil?.mandant_id);
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
