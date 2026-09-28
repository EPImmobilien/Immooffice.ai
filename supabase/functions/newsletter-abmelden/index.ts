// ============================================================================
// newsletter-abmelden v1 (öffentlich, ohne JWT – Zugriff nur per Token aus dem Abmelde-Link)
//   GET ?t=<abmelde_token>  -> setzt newsletter_anmeldungen.widerrufen_am und kontakte.newsletter_opt_in = false
//                              (Funktion newsletter_abmelden), zeigt eine kurze Bestätigungsseite.
//   Quelle im Repo: portal/suchkriterien/newsletter-abmelden.ts
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function seite(titel: string, text: string) {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titel}</title>
<style>body{font-family:Montserrat,Arial,sans-serif;background:#f6f6f9;color:#263159;margin:0;padding:40px 16px}main{max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #D4A567;padding:28px 26px;box-shadow:0 2px 12px rgba(38,49,89,.08)}h1{font-size:20px;font-weight:600;margin:0 0 12px}p{font-size:14px;line-height:1.6;margin:0 0 10px}small{color:#7a7f95}</style></head>
<body><main><div style="font-size:10px;letter-spacing:.2em;color:#D4A567;font-weight:700;margin-bottom:10px">MUSTERHAUS IMMOBILIEN</div><h1>${titel}</h1><p>${text}</p><p><small>Sie können sich jederzeit wieder anmelden, indem Sie bei einer Exposé-Anfrage den Newsletter ankreuzen oder uns kurz schreiben.</small></p></main></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  const u = new URL(req.url);
  const t = (u.searchParams.get("t") || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) return seite("Link ungültig", "Dieser Abmelde-Link ist unvollständig. Bitte antworten Sie einfach auf unsere E-Mail mit „keine Vorschläge“, dann nehmen wir Sie von Hand aus dem Verteiler.");
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data, error } = await db.rpc("newsletter_abmelden", { p_token: t, p_quelle: "link" });
    if (error) throw error;
    if (!data || !data.length) return seite("Link nicht gefunden", "Zu diesem Link ist keine Newsletter-Anmeldung hinterlegt – vielleicht wurde sie bereits entfernt. Es wird nichts weiter gesendet.");
    return seite("Abgemeldet", `Die Adresse <strong>${String(data[0].email).replace(/[<>&]/g, "")}</strong> erhält von uns keine Objektvorschläge per E-Mail mehr. Vielen Dank für Ihr Vertrauen.`);
  } catch (e) {
    console.error("newsletter-abmelden:", e);
    return seite("Das hat nicht geklappt", "Die Abmeldung konnte gerade nicht gespeichert werden. Bitte antworten Sie kurz auf unsere E-Mail, wir kümmern uns darum.");
  }
});
