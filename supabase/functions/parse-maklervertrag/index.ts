// ============================================================
// Edge Function: parse-maklervertrag
//
// Nimmt einen Maklervertrag als PDF entgegen und extrahiert die
// relevanten Daten fuer die vertraege-Tabelle. Erkennt zusaetzlich
// die Eigentuemer-Stammdaten, damit diese parallel angelegt werden
// koennen.
//
// Input:  { pdf_base64: "...", filename: "..." }
// Output: { ok: true, daten: { vertrag: {...}, eigentuemer: {...} } }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist Spezialist im Extrahieren von Daten aus deutschen
MAKLERVERTRAEGEN (auch "Alleinauftrag", "Vermittlungsvertrag", "Vertrieb-
Auftrag" genannt) - zwischen einem Immobilienmakler und einem oder mehreren
Eigentuemern eines Verkaufs- oder Vermietungsobjekts.

Deine Aufgabe: Aus der vorgelegten PDF die folgenden Felder extrahieren. Nur
Felder setzen die du im Dokument klar erkennen kannst, alle anderen weglassen
oder auf null setzen. Bei Unsicherheit: lieber null als geraten.

Antworte AUSSCHLIESSLICH mit gueltigem JSON in genau dieser Struktur:

{
  "vertrag": {
    "standort": "standard" | "zweigstelle" | null,
    "vertragsart": "verkauf" | "vermietung" | null,
    "verkaeufer_typ": "allein" | "eheleute" | "erben" | "gbr" | null,
    "verkaeufer_name": "string - Voll: 'Max Mustermann' oder 'Max und Maria Mustermann'" | null,
    "verkaeufer_strasse": "string" | null,
    "verkaeufer_plz": "string" | null,
    "verkaeufer_ort": "string" | null,
    "objekt_bezeichnung": "string - z.B. 'Einfamilienhaus', 'Eigentumswohnung'" | null,
    "objekt_strasse": "string" | null,
    "objekt_plz": "string" | null,
    "objekt_ort": "string" | null,
    "objekt_adresse": "string - Komplette Adresszeile" | null,
    "angebotspreis": "string - Zahl als String, z.B. '450000'" | null,
    "laufzeit_monate": "string - z.B. '6'" | null,
    "provision": "string - Zahl mit Komma, z.B. '3,57'" | null,
    "eigentum": "allein" | "miteigentum" | null,
    "verbraucher": "ja" | "nein" | null,
    "baujahr": "string 4-stellig" | null,
    "wohnflaeche": <Zahl in m²> | null,
    "grundstuecksflaeche": <Zahl in m²> | null,
    "zimmer": <Zahl> | null,
    "kaufpreis": <Zahl in Euro> | null,
    "kaltmiete": <Zahl in Euro> | null,
    "courtage": "string mit Erlaeuterung der Provision" | null
  },
  "personen": [
    {
      "anrede": "Herr" | "Frau" | "Eheleute" | null,
      "vorname": "string" | null,
      "nachname": "string" | null,
      "email": "string" | null,
      "telefon": "string" | null,
      "strasse": "string" | null,
      "plz": "string" | null,
      "ort": "string" | null,
      "ist_hauptperson": true | false
    }
  ],
  "hinweis": "string mit Auffaelligkeiten oder Unsicherheiten oder leer"
}

Wichtige Hinweise:
- VERTRAGSART erkennst du am Inhalt: geht es um Verkauf einer Immobilie -> "verkauf",
  geht es um Vermietung -> "vermietung". Im Zweifel "verkauf".
- STANDORT erkennst du am Briefkopf des Vertrags: nennt er den Hauptsitz -> standard, eine Zweigstelle -> zweigstelle. Wenn nicht eindeutig -> null.
- VERKAEUFER_TYP:
  * Eine Person allein -> "allein"
  * Ein Ehepaar (Mann + Frau) -> "eheleute"
  * Erbengemeinschaft (mehrere Erben) -> "erben"
  * GbR/Personengesellschaft -> "gbr"
- PROVISION: erkenne ob die Provision in Prozent ist (z.B. "3,57%"). Setze dann
  als Zahl mit Komma: "3,57". Erwaehnt der Vertrag etwas wie "inkl. MwSt." oder
  "zzgl. MwSt." -> diese Info in "courtage" als Volltext einfuegen.
- PERSONEN: jede natuerliche Person, die als Verkaeufer/Vermieter eingetragen ist,
  einzeln auflisten. Die ERSTE Person wird zur Hauptperson markiert (ist_hauptperson: true).
  Bei Ehepaaren: beide einzeln auffuehren, der zuerst Genannte ist Hauptperson.
- E-MAIL und TELEFON: nur wenn explizit im Vertrag genannt. Sonst null.
- ANGEBOTSPREIS bei Verkauf, KALTMIETE bei Vermietung.
- Bei Zahlen ohne Einheit setzen (kein "Euro", "m²", "%").
- Wenn der Vertrag keine Personen-Adressen einzeln ausweist (sondern nur eine
  gemeinsame Adresse): trotzdem allen Personen dieselbe Adresse zuweisen.
- "hinweis": alles was beim Anlegen geprueft werden sollte (z.B. "Provision nicht
  klar lesbar", "Datum unleserlich").

Keine Anfuehrungszeichen ausserhalb des JSON. Keine Markdown-Codeblocks.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis
  // im Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne
  // gueltiges Abo kommt trotzdem nicht daran. Die Schranke liegt in
  // der Beilage abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, corsHeaders);
  if (immoAboSperre) return immoAboSperre;
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Nur POST" }, 405);
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");
    }

    const body = await req.json();
    const pdfBase64 = body.pdf_base64;
    const filename = body.filename || "maklervertrag.pdf";
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      throw new Error("pdf_base64 fehlt im Body.");
    }

    // ---- Anthropic API aufrufen ----
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: `Bitte den Maklervertrag aus "${filename}" extrahieren. Antworte AUSSCHLIESSLICH mit dem JSON-Objekt - kein Vorspann, kein Markdown.`,
            },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Claude API ${resp.status}: ${errText.substring(0, 500)}`);
    }

    const data = await resp.json();
    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    if (!textBlock) {
      throw new Error("Keine Text-Antwort von Claude erhalten.");
    }

    // JSON aus der Antwort parsen
    let raw = textBlock.text.trim();
    // Manchmal verpackt Claude doch in ```json blocks - aufraeumen
    raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

    let parsed: { vertrag?: Record<string, unknown>; personen?: unknown[]; hinweis?: string };
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`JSON-Parse-Fehler. Claude-Antwort: ${raw.substring(0, 500)}`);
    }

    return jsonResponse({
      ok: true,
      daten: parsed,
      modell: MODEL,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }, 400);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}