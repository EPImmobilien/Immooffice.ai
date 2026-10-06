// ============================================================
// Edge Function: sprachmemo-auswerten
//
// Workflow:
// 1. Audio per Base64 entgegennehmen
// 2. Per Replicate Whisper transkribieren -> Text
// 3. Text an Claude geben -> JSON mit Objektaufnahme-Feldern
// 4. Antwort: { ok: true, transkript: "...", felder: { ... } }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
const ANTHROPIC_API_KEY   = Deno.env.get("ANTHROPIC_API_KEY");

// vaibhavs10/incredibly-fast-whisper - sehr stabil, deutsch wird gut erkannt
const WHISPER_VERSION = "3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c";

const ANTHROPIC_MODEL = "claude-sonnet-4-5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FELD_EXTRACTION_PROMPT = `Du bist Spezialist im Extrahieren von Objektaufnahme-Daten aus einem
gesprochenen Memo eines Immobilienmaklers. Der Makler nimmt vor Ort ein
Sprachmemo zu einem Objekt auf — er erzaehlt was er sieht und vom Eigentuemer
erfaehrt: Adresse, Baujahr, Raeume, Heizung, Zustand, Besonderheiten etc.

Deine Aufgabe: Aus dem Transkript die relevanten Felder extrahieren und als
JSON zurueckgeben. Nur Felder setzen die im Transkript klar erwaehnt sind,
alle anderen auf null. Bei Unsicherheit: lieber null als geraten.

Antworte AUSSCHLIESSLICH mit gueltigem JSON in genau dieser Struktur (alle Felder optional, weglassen wenn nicht erwaehnt):

{
  "objektart": "haus" | "wohnung" | "grundstueck" | "gewerbe" | "reihenhaus" | "doppelhaushaelfte" | null,
  "objektadresse": "string - komplette Adresse falls im Memo" | null,
  "ansprechpartner_eigentuemer": "string - Name des Eigentuemers wenn genannt" | null,
  "telefon_email": "string - Kontaktinfo wenn genannt" | null,
  "eigentuemer_seit_jahr": <Zahl 4-stellig> | null,
  "verkauf_zeitrahmen": "sofort" | "in_verhandlung" | null,
  "ortsteil_wohnlage": "string - Beschreibung der Lage" | null,
  "infrastruktur": "string - Beschreibung Infrastruktur" | null,
  "einkauf_schulen_oepnv": "string" | null,
  "besondere_lagevorteile": "string" | null,
  "grundstuecksgroesse_m2": <Zahl> | null,
  "erschliessung": "string - z.B. 'voll erschlossen'" | null,
  "zufahrt": "string" | null,
  "baujahr": <Zahl 4-stellig> | null,
  "bauweise": "string - z.B. 'Massivbau', 'Holzstaender'" | null,
  "modernisierungen_sanierungen": "string - was wann saniert wurde" | null,
  "dach": "string - z.B. 'Satteldach mit Ziegeln'" | null,
  "keller": "string - z.B. 'Vollunterkellert'" | null,
  "geschosse": "string z.B. 'EG, OG, DG'" | null,
  "fenster": "string z.B. 'Kunststoff doppelverglast'" | null,
  "wohnflaeche_m2": <Zahl> | null,
  "nutzflaeche_m2": <Zahl> | null,
  "anzahl_zimmer": <Zahl> | null,
  "anzahl_schlafzimmer": <Zahl> | null,
  "anzahl_badezimmer": <Zahl> | null,
  "gaeste_wc": <bool> | null,
  "balkon_terrasse": <bool> | null,
  "garage_stellplatz_carport": "string - z.B. '2 Stellplaetze'" | null,
  "bodenbelaege": "string - z.B. 'Parkett im Wohnzimmer, Fliesen im Bad'" | null,
  "heizung_energietraeger": "string - z.B. 'Gas-Brennwert', 'Oel', 'Waermepumpe', 'Fernwaerme'" | null,
  "heizungsbaujahr": <Zahl 4-stellig> | null,
  "energieausweis_vorhanden": <bool> | null,
  "energiekennwert_kwh_m2_a": <Zahl> | null,
  "besonderheiten": "string - was ist besonders an der Ausstattung" | null,
  "einbauten_massmoebel": "string" | null,
  "allgemeiner_zustand": "string - z.B. 'gepflegt', 'sanierungsbeduerftig'" | null,
  "bekannte_maengel": "string" | null,
  "letzte_renovierung": "string - was wann renoviert" | null,
  "nutzungssituation": "string - z.B. 'selbst bewohnt', 'vermietet'" | null,
  "besonderheiten_hinweise": "string - sonstige Sonderpunkte" | null,
  "einschaetzung_marktwert_eur": <Zahl> | null,
  "vermarktungshinweise": "string - was beim Vermarkten beachten" | null,
  "empfohlene_massnahmen": "string - was empfehle ich vor dem Verkauf" | null,
  "ansprechpartner_besichtigungen": "string - wer macht Besichtigungen" | null
}

Wichtige Regeln:
- Sprich kein Wort am Anfang oder Ende, nur das JSON.
- Bei Bool-Feldern: nur true setzen wenn explizit erwaehnt. Bei "nicht erwaehnt" -> null, nicht false.
- Bei "objektadresse": komplette Adresse wie genannt (Strasse Nr, PLZ Ort).
- Zahlen ohne Tausender-Trenner und ohne Einheit.
- Wenn der Makler etwas vage erwaehnt ("ca.", "ungefaehr"), trotzdem den Wert extrahieren.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis
  // im Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne
  // gueltiges Abo kommt trotzdem nicht daran. Die Schranke liegt in
  // der Beilage abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, corsHeaders);
  if (immoAboSperre) return immoAboSperre;

  try {
    if (!REPLICATE_API_TOKEN) {
      return new Response(JSON.stringify({ ok: false, error: "REPLICATE_API_TOKEN nicht gesetzt." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY nicht gesetzt." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { audio_base64, filename, content_type } = body;
    if (!audio_base64) {
      return new Response(JSON.stringify({ ok: false, error: "audio_base64 fehlt." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------
    // Schritt 1: Whisper-Transkription via Replicate (incredibly-fast-whisper)
    // -------------------------------------------------------------------
    const dataUrl = `data:${content_type || "audio/webm"};base64,${audio_base64}`;

    console.log("Starte Whisper-Transkription. Audio-Groesse:", audio_base64.length, "Base64-Chars. Content-Type:", content_type);

    // Replicate-Prediction starten
    const predResp = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: WHISPER_VERSION,
        input: {
          audio: dataUrl,
          task: "transcribe",
          language: "german",
          batch_size: 24,
          timestamp: "chunk",
        },
      }),
    });

    if (!predResp.ok) {
      const errText = await predResp.text();
      console.error("Replicate-Predict-Fehler:", predResp.status, errText);
      throw new Error(`Replicate-API-Fehler ${predResp.status}: ${errText}`);
    }
    let pred = await predResp.json();
    console.log("Replicate Prediction-ID:", pred.id);

    // Polling bis fertig
    const startZeit = Date.now();
    const maxWartezeit = 180_000; // 3 Minuten
    while (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
      if (Date.now() - startZeit > maxWartezeit) {
        throw new Error("Whisper-Transkription hat Timeout ueberschritten (3 Min).");
      }
      await new Promise(r => setTimeout(r, 1500));
      const pollResp = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
        headers: { "Authorization": `Token ${REPLICATE_API_TOKEN}` },
      });
      pred = await pollResp.json();
    }

    if (pred.status !== "succeeded") {
      throw new Error(`Whisper-Transkription fehlgeschlagen: ${pred.status}. Error: ${JSON.stringify(pred.error)}`);
    }

    // incredibly-fast-whisper gibt { text: "...", chunks: [...] } zurueck
    let transkript = "";
    if (typeof pred.output === "string") {
      transkript = pred.output;
    } else if (pred.output?.text) {
      transkript = pred.output.text;
    } else if (pred.output?.transcription) {
      transkript = pred.output.transcription;
    } else if (Array.isArray(pred.output)) {
      transkript = pred.output.join(" ");
    } else {
      transkript = JSON.stringify(pred.output);
    }
    transkript = String(transkript).trim();

    console.log("Transkript:", transkript.substring(0, 300));

    if (!transkript || transkript.trim().length < 10) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Transkript zu kurz oder leer. Hat das Mikrofon Ton aufgenommen?",
        transkript,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------
    // Schritt 2: Felder per Claude extrahieren
    // -------------------------------------------------------------------
    const anthResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        system: FELD_EXTRACTION_PROMPT,
        messages: [{
          role: "user",
          content: `Hier ist das Transkript einer Sprachmemo zu einem Immobilienobjekt:\n\n${transkript}\n\nBitte extrahiere alle erkennbaren Felder und gib mir das JSON.`,
        }],
      }),
    });

    if (!anthResp.ok) {
      const errText = await anthResp.text();
      console.error("Anthropic-Fehler:", anthResp.status, errText);
      throw new Error(`Anthropic-API-Fehler ${anthResp.status}: ${errText}`);
    }

    const anthData = await anthResp.json();
    const text = anthData?.content?.[0]?.text || "";

    // JSON extrahieren
    let jsonStr = text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    let felder;
    try {
      felder = JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON-Parse-Fehler:", e, "Text:", jsonStr.substring(0, 500));
      return new Response(JSON.stringify({
        ok: false,
        error: "Konnte JSON-Antwort der Feld-Extraktion nicht parsen.",
        transkript,
        raw_claude: text.substring(0, 500),
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      transkript,
      felder,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Unerwarteter Fehler:", e);
    return new Response(JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});