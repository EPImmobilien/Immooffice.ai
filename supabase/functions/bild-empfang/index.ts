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
    const pfad = "immobilien/" + meta.immobilie_id + "/" + Date.now() + "_" + name.replace(/[^A-Za-z0-9._-]+/g, "_");
    const { error: upErr } = await admin.storage.from("immobilie-dateien").upload(pfad, bytes, { contentType: mime, upsert: false });
    if (upErr) throw new Error("Upload: " + upErr.message);
    const { data: neu, error: insErr } = await admin.from("immobilie_datei").insert({
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
