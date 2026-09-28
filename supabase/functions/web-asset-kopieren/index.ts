// web-asset-kopieren v1 — kopiert eine Datei aus einem privaten Bucket in den
// oeffentlichen Bucket web-assets (fuer Logo/Fotos auf der Homepage).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
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
