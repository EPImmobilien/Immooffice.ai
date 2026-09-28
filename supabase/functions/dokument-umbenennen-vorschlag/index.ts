// ============================================================
// dokument-umbenennen-vorschlag
//
// Schaut sich ein Dokument an (PDF oder Bild) und schlaegt einen
// sauberen, aussagekraeftigen Dateinamen vor.
//
// Beispiele:
//   "IMG_2391.jpg"                  -> "Grundbuch_Mustermann_2024-12-15.pdf"
//   "scan001.pdf"                   -> "Energieausweis_2025.pdf"
//   "Dokument-vom-Notariat-X9.pdf"  -> "Teilungserklaerung_2018.pdf"
//
// Input:
//   {
//     images_base64: string[]   (max 5 Bilder = max 5 PDF-Seiten)
//     mime_type: string         (z.B. "image/jpeg")
//     kategorie?: string        (Hinweis welche Kategorie der Makler ausgewaehlt hat)
//     original_dateiname?: string
//     dateiendung?: string      (z.B. "pdf", "jpg")
//   }
//
// Output:
//   { ok: true, data: {
//       vorschlag: string,    (sauberer Dateiname inkl. Endung)
//       erkannte_kategorie: string,
//       erkannter_inhalt: string,  (kurze Beschreibung was die KI sieht)
//       datum_im_dokument?: string,
//       personen?: string[]
//   }}
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok200(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

const KATEGORIE_HINWEISE: Record<string, string> = {
  grundbuch:          "Grundbuchauszug",
  baulasten:          "Baulastenverzeichnis-Auszug",
  altlasten:          "Altlasten-Auskunft",
  energieausweis:     "Energieausweis (Verbrauchs- oder Bedarfsausweis)",
  teilungserklaerung: "Teilungserklaerung nach WEG",
  mieterliste:        "Mieterliste / Mietaufstellung",
  vollmacht:          "Vollmacht",
  lageplan:           "Lageplan / Flurkarte / Liegenschaftskarte",
  grundriss:          "Grundriss",
  expose:             "Expose",
  einwertung:         "Markteinwertung / Marktpreiseinschaetzung",
  sonstiges:          "Sonstiges Immobilien-Dokument",
};

function buildPrompt(kategorie: string, originalName: string, dateiendung: string): string {
  const hint = kategorie && KATEGORIE_HINWEISE[kategorie]
    ? `Der Makler hat dieses Dokument als "${KATEGORIE_HINWEISE[kategorie]}" eingeordnet — wenn du es bestaetigen kannst, nutze diese Kategorie.`
    : "Der Makler hat keine Kategorie angegeben — du musst sie selbst erkennen.";

  return `Du erhaeltst eine Immobilien-Unterlage (Foto oder PDF-Seiten) und schlaegst einen kurzen, sauberen, aussagekraeftigen Dateinamen vor.

${hint}

Original-Dateiname war: "${originalName || "unbekannt"}"
Original-Dateiendung: ${dateiendung || "unbekannt"}

Antworte AUSSCHLIESSLICH mit gueltigem JSON, keine Markdown-Codeblocks, kein Begleittext.

Struktur:
{
  "vorschlag": string,
  "erkannte_kategorie": string,
  "erkannter_inhalt": string,
  "datum_im_dokument": string | null,
  "personen": string[]
}

Regeln fuer "vorschlag":
- Format: <Kategorie>_<Hauptmerkmal>_<Datum>.<endung>
- Kategorie auf Deutsch, OHNE Umlaute/Sonderzeichen (Grundbuch, Energieausweis, Teilungserklaerung, Baulasten, Altlasten, Mieterliste, Vollmacht, Lageplan, Grundriss, Expose, Markteinwertung, Mietvertrag, Kaufvertrag, Rechnung, Sonstiges)
- Hauptmerkmal: das wichtigste erkennbare Merkmal — meist ein Nachname (z.B. "Mueller"), eine Adresse-Komponente (z.B. "AmStadtpark26") oder Grundbuchblatt-Nummer. Wenn unklar: weglassen.
- Datum: bevorzugt Format YYYY-MM-DD. Wenn nur Jahr erkennbar: YYYY. Wenn gar kein Datum: weglassen.
- Endung: gleiche wie Original (klein), meist "pdf" oder "jpg"
- NUR ASCII-Zeichen, Buchstaben/Zahlen/Unterstriche/Bindestriche/Punkt erlaubt
- Umlaute -> ae/oe/ue/ss
- Leerzeichen -> KEINE (durch nichts ersetzen oder durch Bindestrich innerhalb eines Merkmals)
- KEINE Sonderzeichen wie / \\ : * ? " < > | ' "
- Maximal 80 Zeichen

Beispiele guter Vorschlaege:
- "Grundbuch_Mueller_2024-12-15.pdf"
- "Energieausweis_2025.pdf"
- "Teilungserklaerung_AmStadtpark26.pdf"
- "Mieterliste_Q3-2025.pdf"
- "Lageplan_Flurstueck1234.pdf"
- "Vollmacht_Mueller_2024.pdf"

Bei "erkannter_inhalt": Kurze Beschreibung was du siehst (max 200 Zeichen, deutsch).
Bei "personen": Personen-Namen die im Dokument erkennbar sind (Eigentuemer, Mieter, Notar etc. — max 5).
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) return ok200({ ok: false, error: "ANTHROPIC_API_KEY fehlt." });

    const body = await req.json();
    const images: string[] = Array.isArray(body.images_base64)
      ? body.images_base64
      : (body.image_base64 ? [body.image_base64] : []);
    const mimeType = body.mime_type || "image/jpeg";
    const kategorie = body.kategorie || "";
    const original = body.original_dateiname || "";
    const endung = body.dateiendung || "";

    if (images.length === 0) return ok200({ ok: false, error: "Keine Bilder gegeben." });

    const prompt = buildPrompt(kategorie, original, endung);
    const content: any[] = [];
    images.slice(0, 5).forEach(b64 => {
      content.push({
        type: "image",
        source: { type: "base64", media_type: mimeType, data: b64 },
      });
    });
    content.push({ type: "text", text: prompt });

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 800,
        messages: [{ role: "user", content }],
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      return ok200({
        ok: false,
        error: `Claude-API Fehler (${claudeResp.status})`,
        details: errText.slice(0, 400),
      });
    }

    const claudeJson = await claudeResp.json();
    const text = claudeJson.content?.[0]?.text || "";
    let parsed;
    try {
      // robust gegen Markdown-Codeblocks
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (_e) {
      return ok200({
        ok: false,
        error: "Claude-Antwort konnte nicht als JSON geparsed werden.",
        details: text.slice(0, 400),
      });
    }

    // Vorschlag noch sauber machen (Sicherheits-Schicht)
    let vorschlag = (parsed.vorschlag || "").toString();
    vorschlag = vorschlag.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_");
    // Doppelte Unterstriche zu einem
    vorschlag = vorschlag.replace(/_+/g, "_");
    // Maximal 80 Zeichen vor Endung
    if (vorschlag.length > 80) {
      const dotIdx = vorschlag.lastIndexOf(".");
      if (dotIdx > 0) {
        const ext = vorschlag.slice(dotIdx);
        const base = vorschlag.slice(0, dotIdx).slice(0, 80 - ext.length);
        vorschlag = base + ext;
      } else {
        vorschlag = vorschlag.slice(0, 80);
      }
    }

    return ok200({
      ok: true,
      data: {
        vorschlag,
        erkannte_kategorie: parsed.erkannte_kategorie || "",
        erkannter_inhalt:   parsed.erkannter_inhalt   || "",
        datum_im_dokument:  parsed.datum_im_dokument  || null,
        personen:           Array.isArray(parsed.personen) ? parsed.personen : [],
      },
    });
  } catch (e) {
    return ok200({ ok: false, error: "Unerwarteter Fehler: " + String((e as Error)?.message || e) });
  }
});