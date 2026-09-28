// web-asset-kopieren v1 — kopiert eine Datei aus einem privaten Bucket in den
// oeffentlichen Bucket web-assets (fuer Logo/Fotos auf der Homepage).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // --- Storage: Pfade tragen den Mandanten als erstes Segment -----------
  // Gleiche Bauart wie die Huelle der Oberflaeche. Sie steht IM Handler und
  // nicht auf Modulebene: eine Mandantenvariable auf Modulebene ueberlebt in
  // Deno die Anfrage und traegt den Mandanten des einen Aufrufers in den
  // naechsten. Genau das waere ein Leck statt einer Trennung.
  // Solange immoMandant null ist, bleibt jeder Pfad unveraendert — die
  // Funktion verhaelt sich dann wie bisher.
  let immoMandant: string | null = null;
  const immoSetzeMandant = (m: unknown) => { immoMandant = (typeof m === "string" && m) ? m : null; };
  {
    const immoEcht = db.storage.from.bind(db.storage);
    const immoVorne = (pf: unknown): unknown =>
      (typeof pf !== "string" || !pf || !immoMandant) ? pf
        : (pf === immoMandant || pf.startsWith(immoMandant + "/") ? pf : immoMandant + "/" + pf);
    const immoViele = (pf: unknown): unknown => Array.isArray(pf) ? pf.map(immoVorne) : immoVorne(pf);
    (db.storage as any).from = (eimer: string) => {
      const api: any = immoEcht(eimer);
      const h: any = Object.create(api);
      for (const n of ["upload", "download", "remove", "createSignedUrl",
                       "createSignedUrls", "getPublicUrl", "info", "exists"]) {
        if (typeof api[n] === "function") h[n] = (pf: unknown, ...r: unknown[]) => api[n](immoViele(pf), ...r);
      }
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
    const { data: u } = await db.auth.getUser(
      (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
    if (!u?.user) return new Response(JSON.stringify({ ok: false, fehler: "Nicht angemeldet" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
    immoSetzeMandant((await db.from("profiles").select("mandant_id")
      .eq("id", u.user.id).maybeSingle()).data?.mandant_id);
    const b = await req.json().catch(() => ({}));
    const quelleBucket = String(b.quelle_bucket || "");
    const quellePfad = String(b.quelle_pfad || "");
    const zielPfad = String(b.ziel_pfad || "");
    if (!quelleBucket || !quellePfad || !zielPfad) {
      return new Response(JSON.stringify({ ok: false, fehler: "quelle_bucket, quelle_pfad und ziel_pfad noetig" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const dl = await db.storage.from(quelleBucket).download(quellePfad);
    if (dl.error) throw dl.error;
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const typ = zielPfad.endsWith(".png") ? "image/png" : zielPfad.endsWith(".jpg") || zielPfad.endsWith(".jpeg") ? "image/jpeg" : "application/octet-stream";
    const up = await db.storage.from("web-assets").upload(zielPfad, bytes, { contentType: typ, upsert: true });
    if (up.error) throw up.error;
    return new Response(JSON.stringify({ ok: true, bytes: bytes.length, ziel: zielPfad }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, fehler: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
