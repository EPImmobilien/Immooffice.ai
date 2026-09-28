// supabase/functions/parse-expose/index.ts
// ---------------------------------------------------------------------------
// Liest ein hochgeladenes Exposé-PDF mit Claude (Anthropic) aus und liefert
// strukturierte Daten zurueck. Claude liest das PDF NATIV (als document-Block),
// daher kommen Umlaute korrekt an (kein Encoding-Problem wie bei reiner
// Text-Extraktion) und der Energieausweis wird mit ausgelesen.
//
// WICHTIG (Fix gegen Status 546 / Memory-Limit):
//   Bevorzugt wird jetzt eine URL uebergeben (pdf_url). Anthropic laedt das
//   PDF dann selbst per URL – die Edge Function haelt die Datei NICHT mehr im
//   Speicher. base64 (pdf_base64) bleibt als Fallback erhalten.
//
// Antwort-Schema (genau so erwartet der Frontend-Code in index.html):
// {
//   ok: true,
//   daten: {
//     objektTitel, beschreibung,
//     headline: { zeile1, zeile2, subline },
//     eckdaten: { objektart, wohnflaeche, grundstueck, nutzflaeche, zimmer,
//                 kaufpreis, stellplaetze, baujahr, ausstattung, erschlossen,
//                 bauklasse, strasse, plz, ort },
//     energie:  { ausweisArt, endenergie, energietraeger, energieklasse,
//                 keinAusweis, befreiungsgrund }
//   }
// }
//
// Deploy:  supabase functions deploy parse-expose
// Env:     ANTHROPIC_API_KEY muss gesetzt sein (wie bei den anderen Functions).
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELL = "claude-sonnet-4-6"; // Hinweis: claude-sonnet-4-20250514 ist retired (404)

const ANWEISUNG = `Du extrahierst aus dem beigefuegten Immobilien-Expose (PDF) strukturierte Daten fuer eine Social-Media-Kachel.

Gib AUSSCHLIESSLICH gueltiges JSON zurueck – keinen Flesstext, keine Markdown-Codeblöcke, keine Erklaerung. Das JSON hat exakt diese Struktur (alle Werte als Strings, deutsche Umlaute korrekt als ä/ö/ü/ß, leerer String wenn unbekannt):

{
  "objektTitel": "kurzer Titel des Objekts",
  "beschreibung": "1-2 praegnante Saetze zur Lage/Besonderheit (fuer Coming-Soon)",
  "headline": {
    "zeile1": "EIN kurzes Schlagwort GROSSGESCHRIEBEN (z. B. EINFAMILIENHAUS)",
    "zeile2": "ZWEITES kurzes Schlagwort GROSSGESCHRIEBEN (z. B. AM SEE)",
    "subline": "PLZ ORT in Grossbuchstaben (z. B. 18055 ROSTOCK)"
  },
  "eckdaten": {
    "objektart": "z. B. Einfamilienhaus / Eigentumswohnung / Grundstueck",
    "wohnflaeche": "Format: ca. 000 m² (leer wenn keine)",
    "grundstueck": "Format: ca. 000 m² (leer wenn keine)",
    "nutzflaeche": "Format: ca. 000 m² (leer wenn keine)",
    "zimmer": "Anzahl als Zahl-String, z. B. 4",
    "kaufpreis": "Format: 000.000 € (deutsche Tausenderpunkte)",
    "stellplaetze": "Anzahl oder Beschreibung",
    "baujahr": "Jahr, z. B. 1995",
    "ausstattung": "kurz, z. B. gehoben / saniert",
    "erschlossen": "ja / nein / teilweise (nur bei Grundstuecken, sonst leer)",
    "bauklasse": "falls vorhanden, sonst leer",
    "strasse": "Strasse und Hausnummer",
    "plz": "Postleitzahl",
    "ort": "Ort"
  },
  "energie": {
    "ausweisArt": "Bedarf oder Verbrauch (Bedarfs-/Verbrauchsausweis)",
    "endenergie": "Endenergiebedarf bzw. -verbrauch als Zahl-String, z. B. 120 (Einheit weglassen)",
    "energietraeger": "z. B. Erdgas / Fernwaerme / Strom / Oel",
    "energieklasse": "Effizienzklasse A+ bis H, falls angegeben, sonst leer",
    "keinAusweis": "true NUR wenn ausdruecklich kein Energieausweis noetig (Denkmal/Befreiung), sonst false",
    "befreiungsgrund": "Grund der Befreiung, falls keinAusweis true, sonst leer"
  }
}

Wichtig:
- Erfinde nichts. Was nicht im Expose steht, bleibt leerer String.
- "keinAusweis" ist ein Boolean (true/false), kein String.
- Zahlen ohne Einheiten ausser wo oben ein Format vorgegeben ist.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ ok: false, error: "ANTHROPIC_API_KEY ist nicht gesetzt." }, 500);
    }

    const { pdf_base64, pdf_url, filename } = await req.json().catch(() => ({}));
    if (!pdf_url && !pdf_base64) {
      return json(
        { ok: false, error: "Kein PDF uebergeben (pdf_url oder pdf_base64 fehlt)." },
        400,
      );
    }

    // PDF-Quelle: bevorzugt URL (Anthropic laedt selbst -> kein Speicher in der
    // Edge Function), sonst base64 als Fallback.
    const quelle = pdf_url
      ? { type: "url", url: String(pdf_url) }
      : { type: "base64", media_type: "application/pdf", data: pdf_base64 };

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELL,
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: quelle },
              { type: "text", text: ANWEISUNG },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json(
        { ok: false, error: `Anthropic-Fehler (${resp.status}): ${errText.slice(0, 500)}` },
        502,
      );
    }

    const data = await resp.json();
    // Text aus den content-Bloecken zusammensetzen
    const text = Array.isArray(data?.content)
      ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n").trim()
      : "";

    if (!text) {
      return json({ ok: false, error: "Claude hat keinen Text zurueckgegeben." }, 502);
    }

    // JSON robust extrahieren (evtl. doch Codeblock-Zaeune entfernen)
    let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (_e) {
      return json(
        { ok: false, error: "Antwort konnte nicht als JSON gelesen werden.", roh: text.slice(0, 800) },
        502,
      );
    }

    // Auf das erwartete Schema normalisieren (fehlende Felder mit "" auffuellen)
    const s = (v: unknown) => (v == null ? "" : String(v));
    const e = parsed.eckdaten || {};
    const h = parsed.headline || {};
    const en = parsed.energie || {};

    const daten = {
      objektTitel: s(parsed.objektTitel),
      beschreibung: s(parsed.beschreibung),
      headline: {
        zeile1: s(h.zeile1),
        zeile2: s(h.zeile2),
        subline: s(h.subline),
      },
      eckdaten: {
        objektart: s(e.objektart),
        wohnflaeche: s(e.wohnflaeche),
        grundstueck: s(e.grundstueck),
        nutzflaeche: s(e.nutzflaeche),
        zimmer: s(e.zimmer),
        kaufpreis: s(e.kaufpreis),
        stellplaetze: s(e.stellplaetze),
        baujahr: s(e.baujahr),
        ausstattung: s(e.ausstattung),
        erschlossen: s(e.erschlossen),
        bauklasse: s(e.bauklasse),
        strasse: s(e.strasse),
        plz: s(e.plz),
        ort: s(e.ort),
      },
      energie: {
        ausweisArt: s(en.ausweisArt) || "Bedarf",
        endenergie: s(en.endenergie),
        energietraeger: s(en.energietraeger),
        energieklasse: s(en.energieklasse),
        keinAusweis: en.keinAusweis === true || en.keinAusweis === "true",
        befreiungsgrund: s(en.befreiungsgrund),
      },
      _quelle: s(filename),
    };

    return json({ ok: true, daten });
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
