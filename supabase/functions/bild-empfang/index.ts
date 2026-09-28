// bild-empfang v1 (16.09.26): nimmt eine Bilddatei (multipart: meta = JSON, datei = Bild) entgegen,
// legt sie im Bucket immobilie-dateien ab und traegt sie in immobilie_datei ein. Zugriff nur mit
// Einmal-Token in der Kopfzeile x-transfer-token, dessen SHA-256 in bild_transfer_token steht und
// noch gueltig ist. Anlass: Wiederherstellung von Objektfotos aus einem PDF ueber GitHub Actions.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
  try {
    const token = req.headers.get("x-transfer-token") || "";
    if (!token) return antwort({ ok: false, error: "Kein Token." }, 401);
    const hash = await sha256Hex(token);
    const { data: t } = await admin.from("bild_transfer_token").select("hash, gueltig_bis").eq("hash", hash).maybeSingle();
    if (!t || new Date(t.gueltig_bis).getTime() < Date.now()) return antwort({ ok: false, error: "Token ungueltig oder abgelaufen." }, 401);
    const form = await req.formData();
    const meta = JSON.parse(String(form.get("meta") || "{}"));
    const datei = form.get("datei");
    if (!(datei instanceof File)) return antwort({ ok: false, error: "Keine Datei." }, 400);
    if (!meta.immobilie_id) return antwort({ ok: false, error: "immobilie_id fehlt." }, 400);
    const bytes = new Uint8Array(await datei.arrayBuffer());
    const mime = datei.type || "image/jpeg";
    const name = String(meta.name || datei.name || "bild.jpg");
    immoSetzeMandant((await admin.from("immobilien").select("mandant_id").eq("id", meta.immobilie_id).maybeSingle()).data?.mandant_id);
    const pfad = "immobilien/" + meta.immobilie_id + "/" + Date.now() + "_" + name.replace(/[^A-Za-z0-9._-]+/g, "_");
    const { error: upErr } = await admin.storage.from("immobilie-dateien").upload(pfad, bytes, { contentType: mime, upsert: false });
    if (upErr) throw new Error("Upload: " + upErr.message);
    const { data: neu, error: insErr } = await admin.from("immobilie_datei").insert({
      mandant_id: immoMandant,
      immobilie_id: meta.immobilie_id, name, titel: meta.titel ?? null, doktyp: meta.doktyp || "Bild", kategorie: meta.kategorie || "foto",
      mime_type: mime, size_bytes: bytes.length, speicher_typ: "supabase", storage_path: pfad, quelle: meta.quelle || "wiederhergestellt",
      oeffentlich: meta.oeffentlich !== false, sortierung: Number(meta.sortierung) || 0, ersteller_id: meta.ersteller_id ?? null,
    }).select("id").single();
    if (insErr) throw new Error("Insert: " + insErr.message);
    return antwort({ ok: true, id: neu?.id, pfad, bytes: bytes.length });
  } catch (e) {
    return antwort({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
