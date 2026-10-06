// ============================================================
// Edge Function: parse-energieabrechnung
//
// Nimmt eine Heizkosten- oder Energieabrechnung entgegen (PDF oder
// Fotos der Unterlagen) und extrahiert die wichtigsten Daten:
//  - Abrechnungszeitraum (von / bis)
//  - Gesamtverbrauch in der Einheit der Abrechnung (kWh / Liter / m³ / kg)
//  - Energieträger (Erdgas / Heizöl / Pellets / etc.)
//  - Warmwasser-Verbrauch falls separat ausgewiesen
//  - Leerstand falls erwähnt
//
// Input (neu):    { dateien: [{ data: <base64>, media_type: "application/pdf"|"image/jpeg"|"image/png"|"image/webp"|"image/gif" }], filename?: "..." }
// Input (legacy): { pdf_base64: "...", filename: "..." }   <- bleibt unterstützt
// Output: { ok: true, daten: { von, bis, heizung_menge, heizung_einheit, warmwasser_kwh, leerstand_monate, energietraeger, hinweis } }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const MAX_DATEIEN = 8;
const ERLAUBTE_BILDER = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist Spezialist im Extrahieren von Daten aus deutschen Heizkosten- und Energieabrechnungen.

Deine Aufgabe: Aus dem vorgelegten Dokument (PDF oder Fotos der Abrechnung) die folgenden Daten extrahieren:
- Abrechnungszeitraum (von / bis)
- Gesamtverbrauch der Heizung (mit Einheit: kWh, Liter, m³, oder kg)
- Energieträger (Erdgas, Heizöl, Holzpellets, Stückholz, Fernwärme, Strom)
- Warmwasser-Verbrauch in kWh (falls separat ausgewiesen)
- Leerstand in Monaten (nur falls explizit erwähnt)

Hinweis: Mehrere Bilder gehören zur selben Abrechnung (z. B. fotografierte Einzelseiten). Werte über alle Seiten hinweg zusammenführen.

WICHTIG:
- Antworte AUSSCHLIESSLICH mit gültigem JSON in genau diesem Format:
{
  "von": "YYYY-MM-DD" oder null,
  "bis": "YYYY-MM-DD" oder null,
  "heizung_menge": <Zahl> oder null,
  "heizung_einheit": "kWh"|"Liter"|"m3"|"kg" oder null,
  "energietraeger": "Erdgas"|"Heizoel"|"Holzpellets"|"Stueckholz"|"Fernwaerme"|"Strom" oder null,
  "warmwasser_kwh": <Zahl> oder null,
  "leerstand_monate": <Zahl> oder null,
  "hinweis": <String mit Hinweis falls etwas unsicher ist, oder null>
}
- Keine Anführungszeichen außerhalb des JSON.
- Wenn du dir bei einem Wert unsicher bist, setze ihn auf null und beschreibe den Grund im "hinweis"-Feld.
- Wenn ein Foto unleserlich/unscharf ist, beschreibe das im "hinweis"-Feld.
- Wenn das Dokument keine Energieabrechnung ist, setze alle Felder auf null und schreibe das in "hinweis".`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis
  // im Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne
  // gueltiges Abo kommt trotzdem nicht daran. Die Schranke liegt in
  // der Beilage abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, corsHeaders);
  if (immoAboSperre) return immoAboSperre;
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Nur POST" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY nicht gesetzt");

    const body = await req.json();
    const { pdf_base64, filename } = body;

    // Eingaben normalisieren: neues "dateien"-Format ODER legacy pdf_base64
    let dateien: Array<{ data: string; media_type: string }> = [];
    if (Array.isArray(body.dateien) && body.dateien.length > 0) {
      dateien = body.dateien;
    } else if (pdf_base64 && typeof pdf_base64 === "string") {
      dateien = [{ data: pdf_base64, media_type: "application/pdf" }];
    } else {
      throw new Error("Feld 'dateien' (oder legacy 'pdf_base64') fehlt");
    }

    if (dateien.length > MAX_DATEIEN) {
      throw new Error(`Maximal ${MAX_DATEIEN} Dateien pro Anfrage`);
    }

    // Content-Blöcke für Claude bauen
    const contentBloecke: unknown[] = [];
    for (const d of dateien) {
      if (!d?.data || typeof d.data !== "string") {
        throw new Error("Datei ohne 'data'-Feld");
      }
      if (d.media_type === "application/pdf") {
        contentBloecke.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: d.data },
        });
      } else if (ERLAUBTE_BILDER.includes(d.media_type)) {
        contentBloecke.push({
          type: "image",
          source: { type: "base64", media_type: d.media_type, data: d.data },
        });
      } else {
        throw new Error(`Nicht unterstützter Dateityp: ${d.media_type}`);
      }
    }
    contentBloecke.push({
      type: "text",
      text: `Bitte extrahiere aus ${dateien.length > 1 ? "diesen Unterlagen" : (filename ? "dieser Datei '" + filename + "'" : "dieser Abrechnung")} die Verbrauchsdaten im vorgegebenen JSON-Format.`,
    });

    const apiResp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: contentBloecke }],
      }),
    });

    if (!apiResp.ok) {
      const fehler = await apiResp.text();
      throw new Error(`Anthropic API Fehler ${apiResp.status}: ${fehler.slice(0, 500)}`);
    }

    const result = await apiResp.json();
    const rawText = result.content?.[0]?.text || "";
    if (!rawText.trim()) throw new Error("Leere KI-Antwort");

    // JSON aus der Antwort extrahieren (KI kann es theoretisch in Code-Blocks wrappen)
    let jsonText = rawText.trim();
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) jsonText = codeBlockMatch[1];

    let daten;
    try {
      daten = JSON.parse(jsonText);
    } catch (_e) {
      throw new Error("KI-Antwort ist kein gültiges JSON: " + jsonText.slice(0, 200));
    }

    return new Response(
      JSON.stringify({ ok: true, daten }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});