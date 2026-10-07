// ============================================================================
// mangel-text — aus dem Diktat ein Mangeltext, dazu ein Gewerk-Vorschlag
// ============================================================================
// Eigene Function des Forks (fork_85). Auftrag „Bautraeger v2": „claude-
// sonnet-4-6 nur fuer Diktat->Mangeltext und Gewerk-Vorschlag". Das Diktat
// selbst transkribiert die vorhandene Function notiz-transkribieren
// (Whisper); hier wird aus dem Transkript ein kurzer Titel, eine sachliche
// Beschreibung und — aus der Gewerkliste des PROJEKTS — ein Vorschlag.
//
// Regeln: nichts erfinden (kein Mass, keine Ursache, die nicht im Text
// steht); das Gewerk nur aus der mitgegebenen Liste oder null; Antwort als
// Vorschlag ins Formular, der Nutzer entscheidet (CLAUDE.md: KI-Auslese
// immer ueber ein editierbares Formular). Abrechnung ueber die Beilage
// _credits (Aktion mangel_text), damit Notschalter, Tageslimit und
// Modellwahl des Betreibers greifen.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { kiAbrechnen, abgelehnt } from "./credits.ts";
import type { Abrechnung } from "./credits.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MODELL = "claude-sonnet-4-6";
const SYSTEM = `Du formulierst aus dem Diktat eines Bauleiters bei einer Wohnungsabnahme einen Mangel fuer das Abnahmeprotokoll.
Regeln, ohne Ausnahme:
- Nur, was im Diktat steht. Keine Masse, Ursachen, Bewertungen oder Fristen dazuerfinden. Umgangssprache in sachliches Deutsch bringen.
- "titel": hoechstens 80 Zeichen, Substantivstil (z. B. "Kratzer im Parkett vor der Balkontuer").
- "beschreibung": 1–3 Saetze, was wo festgestellt wurde. Leer lassen, wenn der Titel alles sagt.
- "gewerk": GENAU einer der mitgegebenen Werte oder null, wenn keiner passt. Nichts anderes.
- "kategorie": "optisch" | "funktion" | "sicherheit" | "unvollstaendig" oder null.
Antworte NUR mit JSON: {"titel": "...", "beschreibung": "...", "gewerk": "..."|null, "kategorie": "..."|null}`;

function jsonAusText(t: string): Record<string, unknown> {
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("Das Modell hat kein JSON geliefert.");
  return JSON.parse(t.slice(s, e + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let credits: Abrechnung | null = null;
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const text = String(body.text || "").trim().slice(0, 4000);
    if (text.length < 3) return antwort({ ok: false, fehler: "Kein Diktat." }, 400);
    const gewerke = (Array.isArray(body.gewerke) ? body.gewerke : []).map((g) => String(g).trim()).filter(Boolean).slice(0, 40);
    const raum = String(body.raum || "").trim().slice(0, 80);
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return antwort({ ok: false, fehler: "ANTHROPIC_API_KEY fehlt." }, 500);

    const abr = await kiAbrechnen(req, "mangel_text", raum || null);
    if (!abr.ok) return abgelehnt(abr, cors);
    credits = abr;

    const nutzer = `GEWERKE (nur diese): ${gewerke.join(" | ") || "(keine Liste)"}\nRAUM: ${raum || "-"}\n\nDIKTAT:\n${text}`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: abr.modell(MODELL), max_tokens: abr.maxTokens(400), temperature: abr.temperatur(0), system: SYSTEM, messages: [{ role: "user", content: nutzer }] }),
    });
    if (!r.ok) {
      await abr.freigeben("anthropic " + r.status);
      return antwort({ ok: false, fehler: `KI-Dienst antwortete ${r.status}.` }, 502);
    }
    const d = await r.json();
    const roh = jsonAusText(String(d?.content?.[0]?.text || ""));
    const gewerk = roh.gewerk && gewerke.includes(String(roh.gewerk)) ? String(roh.gewerk) : null;   // nur aus der Liste
    const usage = d?.usage || {};
    const kosten = (Number(usage.input_tokens || 0) * 3 + Number(usage.output_tokens || 0) * 15) / 1e6 * 0.92;
    await abr.buchen(kosten, "mangel-text", "anthropic", abr.modell(MODELL));
    return antwort({ ok: true, titel: String(roh.titel || "").slice(0, 120), beschreibung: String(roh.beschreibung || "").slice(0, 1500), gewerk,
      kategorie: ["optisch", "funktion", "sicherheit", "unvollstaendig"].includes(String(roh.kategorie)) ? String(roh.kategorie) : null });
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    if (credits) await credits.freigeben("Abbruch: " + grund);
    console.error("mangel-text:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
