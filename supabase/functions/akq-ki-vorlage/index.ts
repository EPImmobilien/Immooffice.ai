// ============================================================================
// akq-ki-vorlage v1 — KI-Textvorschlag fuer Akquise-Vorlagen
// ----------------------------------------------------------------------------
// Body: { kanal: "mail"|"aufgabe"|"whatsapp", stufe?, quelle?, anlass?,
//         auftrag?: Freitext-Wunsch, bestehend?: bisheriger Text }
// Antwort: { ok, betreff, text }
// Der Text nutzt die Portal-Platzhalter, damit er direkt als Vorlage taugt.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-4-6";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATZHALTER = [
  "{{anrede}} — komplette Anredezeile inkl. Komma, immer als erste Zeile",
  "{{eigentuemer_name}}", "{{objekt_kurz}}", "{{objekt_adresse}}",
  "{{wert}}", "{{spanne}}", "{{startpreis}}", "{{provision}}",
  "{{makler_name}}", "{{makler_telefon}}", "{{makler_mail}}",
].join("\n- ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (!ANTHROPIC_API_KEY) return antwort({ ok: false, fehler: "ANTHROPIC_API_KEY fehlt." }, 500);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
      }
    }

    const body = await req.json().catch(() => ({}));
    const kanal = String(body.kanal || "mail");

    const system = `Du schreibst Vorlagen fuer die Verkaeufer-Akquise von Musterhaus Immobilien GmbH .
Stil wie in der Exposé-Schmiede des Hauses: deutsch, Sie-Form, sachlich-freundlich, kurze Saetze, keine Superlative,
keine Wortspiele, keine erfundenen Fakten (keine Preise, Fristen, Mitbewerber, kein Druck).

Kanal: ${kanal === "aufgabe" ? "interne Aufgabe fuer den Makler (kein Kundentext)" : kanal === "whatsapp" ? "WhatsApp-Nachricht an den Eigentuemer (max. 60 Woerter)" : "E-Mail an den Eigentuemer (80–150 Woerter)"}.

Verfuegbare Platzhalter — nutze sie, statt Namen zu erfinden:
- ${PLATZHALTER}

${kanal === "mail" ? 'Die Mail beginnt mit "{{anrede}}", danach eine Leerzeile. Sie endet mit "Mit freundlichen Gruessen" und in der naechsten Zeile "{{makler_name}}". Keine Signatur darunter — die haengt der Server an.' : ""}

Antworte AUSSCHLIESSLICH als JSON: {"betreff": "...", "text": "..."}.
${kanal === "aufgabe" ? 'Bei Aufgaben ist "betreff" der kurze Aufgabentitel und "text" die Handlungsanweisung in 1–2 Saetzen.' : "Der Betreff ist kurz, konkret und ohne Re:."}`;

    const nutzer = [
      body.stufe ? `Pipeline-Stufe: ${String(body.stufe).slice(0, 120)}` : "",
      body.quelle ? `Lead-Quelle: ${String(body.quelle).slice(0, 120)}` : "",
      body.anlass ? `Anlass: ${String(body.anlass).slice(0, 120)}` : "",
      body.auftrag ? `Wunsch des Maklers: ${String(body.auftrag).slice(0, 1500)}` : "",
      body.bestehend ? `Bisheriger Text (verbessern, Kernaussage behalten):\n${String(body.bestehend).slice(0, 3000)}` : "",
    ].filter(Boolean).join("\n") || "Schreibe eine passende Standardvorlage fuer diesen Schritt.";

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, temperature: 0.4, system, messages: [{ role: "user", content: nutzer }] }),
    });
    if (!r.ok) return antwort({ ok: false, fehler: `Anthropic ${r.status}: ${(await r.text()).slice(0, 400)}` }, 500);

    const d = await r.json();
    let t = d?.content?.[0]?.text || "";
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    let j: any;
    try { j = JSON.parse(t); } catch (_) { j = { betreff: "", text: t }; }

    return antwort({ ok: true, betreff: String(j.betreff || "").trim(), text: String(j.text || "").trim() });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
