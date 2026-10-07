// ============================================================================
// einheit-qr — was ein QR-Code an der Wohnungstuer ohne Anmeldung preisgibt
// ============================================================================
// Eigene Function des Forks (fork_86). Auftrag „Bautraeger v2", Abschnitt E:
// „nicht eingeloggt -> nur Projekt/Einheit + Login, keine personenbezogenen
// Daten". Genau das: Projektname, Ort, Einheitennummer, Geschoss — und seit
// fork_87 die Unterlagen und Hinweise, die der Bautraeger fuer die Gewerke
// freigibt (qr_sichtbar). Kein Kaeufer, kein Preis, kein Status, keine Maengel. Angemeldet laedt die
// Oberflaeche die Wohnungsakte selbst — unter RLS.
//
// Der qr_token benennt genau eine Einheit; aus ihr kommt der Mandant, aus
// dem Mandanten nichts weiter als der Name des Bautraegers.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    let token = "";
    if (req.method === "GET") token = String(new URL(req.url).searchParams.get("token") || "").trim();
    else { const b = await req.json().catch(() => ({})); token = String(b?.token || "").trim(); }
    if (!/^[0-9a-f]{16,64}$/i.test(token)) return antwort({ ok: false, fehler: "Kein gültiger Code." }, 400);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: e } = await db.from("projekt_einheiten").select("id, we_nr, geschoss, projekt_id, mandant_id, qr_hinweis").eq("qr_token", token).maybeSingle();
    if (!e) return antwort({ ok: false, fehler: "Dieser Code ist nicht (mehr) gültig." }, 404);
    const { data: p } = await db.from("projekte").select("name, ort, mandant_id, qr_hinweis").eq("id", e.projekt_id).eq("mandant_id", e.mandant_id).maybeSingle();
    const { data: f } = await db.from("firma_stammdaten").select("firma_name, marken_name, telefon, email").eq("mandant_id", e.mandant_id).eq("aktiv", true).order("sortierung", { ascending: true }).limit(1).maybeSingle();
    // fork_87: Unterlagen und Hinweise fuer die Gewerke — nur, was der Bautraeger
    // ausdruecklich fuer den QR-Code freigegeben hat (qr_sichtbar), nie eine
    // persoenliche Kaeuferdatei (zugang_id ist null, per CHECK erzwungen).
    const { data: dateien } = await db.from("projekt_dateien").select("id, name, pfad, kategorie, created_at, einheit_id")
      .eq("projekt_id", e.projekt_id).eq("mandant_id", e.mandant_id).eq("qr_sichtbar", true).is("zugang_id", null)
      .or(`einheit_id.is.null,einheit_id.eq.${e.id}`).order("created_at", { ascending: false }).limit(40);
    const unterlagen: { name: string; url: string; kategorie: string | null; einheit: boolean; datum: string }[] = [];
    for (const d of dateien || []) {
      const { data: s } = await db.storage.from("projekt-dateien").createSignedUrl(d.pfad, 3600);
      if (s?.signedUrl) unterlagen.push({ name: d.name, url: s.signedUrl, kategorie: d.kategorie, einheit: !!d.einheit_id, datum: d.created_at });
    }
    const hinweise = [p?.qr_hinweis, e.qr_hinweis].filter((h) => h && String(h).trim()).map(String);
    return antwort({ ok: true, einheit_id: e.id, we_nr: e.we_nr, geschoss: e.geschoss, projekt: p ? { name: p.name, ort: p.ort } : null,
      bautraeger: f ? { name: f.marken_name || f.firma_name, telefon: f.telefon, email: f.email } : null, unterlagen, hinweise });
  } catch (err) {
    return antwort({ ok: false, fehler: err instanceof Error ? err.message : String(err) }, 500);
  }
});
