import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = `{
  "objektart": "EFH | DHH | RH | ETW | MFH | WGH | Grundstueck | Gewerbe | Sonstiges",
  "vermarktungsart": "kauf | miete",
  "strasse": "Strasse und Hausnummer, falls genannt, sonst null",
  "plz": "5-stellig oder null",
  "ort": "Ort",
  "ortsteil": "Stadtteil/Ortsteil oder null",
  "wohnflaeche": "Zahl in qm oder null",
  "grundstueck": "Zahl in qm oder null",
  "zimmer": "Zahl oder null",
  "baujahr": "Zahl oder null",
  "preis": "Zahl in EUR ohne Punkte, bei Miete die Kaltmiete, sonst null",
  "anbieter_typ": "privat | makler | unbekannt",
  "anbieter_name": "Name oder Firma oder null",
  "telefon": "Telefonnummer oder null",
  "email": "E-Mail oder null",
  "titel": "kurze Ueberschrift, max. 80 Zeichen",
  "beschreibung": "2-3 Saetze Zusammenfassung des Objekts",
  "merkmale": { "balkon": true, "garage": true, "energieausweis": "Wert oder null" }
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis
  // im Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne
  // gueltiges Abo kommt trotzdem nicht daran. Die Schranke liegt in
  // der Beilage abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, cors);
  if (immoAboSperre) return immoAboSperre;

  try {
    const { rohtext, quelle, quelle_url } = await req.json();
    if (!rohtext || String(rohtext).trim().length < 20) {
      return new Response(JSON.stringify({ error: "Kein oder zu kurzer Anzeigentext." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY fehlt");

    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system:
          "Du extrahierst aus deutschen Immobilien-Anzeigentexten strukturierte Daten. " +
          "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt nach diesem Schema, ohne Vorrede, ohne Markdown-Backticks:\n" +
          SCHEMA +
          "\nRegeln: Nichts erfinden. Unbekanntes auf null setzen. " +
          "anbieter_typ nur dann 'makler', wenn ein Maklerbuero, eine Provision/Courtage oder eine gewerbliche Firma erkennbar ist; " +
          "bei klaren Hinweisen wie 'von privat', 'provisionsfrei', 'Privatverkauf' auf 'privat'. " +
          "Preise als reine Zahl ohne Tausenderpunkte und ohne Waehrung.",
        messages: [{ role: "user", content: String(rohtext).slice(0, 20000) }],
      }),
    });

    if (!ai.ok) throw new Error("Anthropic-Fehler: " + (await ai.text()).slice(0, 300));
    const aiData = await ai.json();
    const text = (aiData.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .replace(/```json|```/g, "")
      .trim();

    let daten: Record<string, unknown>;
    try {
      daten = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Antwort war kein JSON: " + text.slice(0, 200));
      daten = JSON.parse(m[0]);
    }

    daten.quelle = quelle ?? "manuell";
    daten.quelle_url = quelle_url ?? null;
    daten.rohtext = String(rohtext).slice(0, 20000);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const { data, error } = await supabase.rpc("radar_upsert", { daten });
    if (error) throw new Error("DB: " + error.message);

    return new Response(JSON.stringify({ ok: true, objekt: data, extrahiert: daten }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
