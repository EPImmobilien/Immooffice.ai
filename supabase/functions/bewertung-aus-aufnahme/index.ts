// ============================================================
// Edge Function: bewertung-aus-aufnahme  (reparierte Version)
//
// Nimmt die Daten einer Objektaufnahme entgegen und gibt
// (a) gemappte Stammdaten fuer die Bewertung
// (b) KI-Vorschlaege fuer Vorteile/Nachteile/Zielgruppen zurueck.
//
// Input:  { aufnahme: { ... } }
// Output (Erfolg):  { ok: true, mapping: {...}, vorschlaege: { vorteile, nachteile, zielgruppen } }
// Output (Fehler):  { ok: false, error: "...", details?: ..., mapping?: {...} }
//
// AENDERUNGEN ggue. der alten Version:
//  1. Modell auf "claude-sonnet-4-6" gehoben (verifiziert aktueller, kanonischer String).
//  2. Fehler werden NICHT mehr verschluckt: Anthropic-Fehler und JSON-Parse-Fehler
//     liefern jetzt einen echten Fehler-Status zurueck statt still ok:true + leere Listen.
//  3. Die "Text zu kurz"-Bedingung gibt jetzt einen klaren 422 mit DIAGNOSE zurueck
//     (extrahierte Zeichen + tatsaechlich vorhandene aufnahme-Keys). Damit sieht man
//     bei einem Feldnamen-Mismatch sofort, welche Felder ankommen vs. welche der
//     Code erwartet.
//  4. Robusteres JSON-Parsing (Code-Block ODER erstes {...}-Objekt).
//  5. Das Mapping wird auch im Fehlerfall mitgeliefert (kostet nichts, hilft dem Frontend).
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// Mindestlaenge des extrahierten Aufnahme-Textes, ab der ein KI-Call sinnvoll ist.
const MIN_AUFNAHME_LEN = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const SYSTEM_PROMPT = `Du bist Spezialist fuer Immobilien-Bewertungen.
Aus einer Objektaufnahme (Daten vom Vor-Ort-Termin) sollst du Vorschlaege
generieren fuer die spaetere Bewertungs-Praesentation an den Eigentuemer.

Antworte AUSSCHLIESSLICH mit gueltigem JSON in genau dieser Struktur:

{
  "vorteile": ["string", "string", ...],
  "nachteile": ["string", "string", ...],
  "zielgruppen": ["string", "string", ...]
}

Regeln:
- 2-5 Eintraege pro Kategorie
- Jeder Eintrag knapp (max 5-7 Woerter) und konkret
- Vorteile: was macht das Objekt attraktiv? (z.B. "Vollkeller", "Suedgarten 350 qm", "Top-Lage Bahnhofsnaehe")
- Nachteile: was schmaelert den Wert? Ehrlich und konstruktiv. (z.B. "Heizung 1985, Modernisierungsbedarf", "Stark befahrene Strasse")
- Zielgruppen: wer koennte hier kaufen? (z.B. "Familien mit Kindern", "Kapitalanleger", "Senioren mit Pflegebedarf")
- KEINE Floskeln wie "schoenes Haus" — immer konkret was im Objekt
- Wenn Informationen unklar sind: weniger Eintraege, lieber qualitativ
- Sprich kein Wort drumherum, nur das JSON.`;

// ------------------------------------------------------------
// Mapping-Helper: aufnahme -> bewertung-stammdaten
// ------------------------------------------------------------
function adresseSplit(adresse: string): { strasse: string; plz: string; ort: string } {
  if (!adresse) return { strasse: "", plz: "", ort: "" };
  const teile = adresse.split(",").map((s) => s.trim());
  if (teile.length >= 2) {
    const strasse = teile[0];
    const plzOrtMatch = teile[1].match(/^(\d{5})\s+(.+)$/);
    if (plzOrtMatch) {
      return { strasse, plz: plzOrtMatch[1], ort: plzOrtMatch[2] };
    }
    return { strasse, plz: "", ort: teile[1] };
  }
  const m = adresse.match(/^(.+?)\s+(\d{5})\s+(.+)$/);
  if (m) return { strasse: m[1], plz: m[2], ort: m[3] };
  return { strasse: adresse, plz: "", ort: "" };
}

function objektartMap(a: string | null | undefined): string {
  if (!a) return "";
  const map: Record<string, string> = {
    haus: "Einfamilienhaus",
    wohnung: "Eigentumswohnung",
    grundstueck: "Grundstueck",
    gewerbe: "Gewerbe",
    reihenhaus: "Reihenhaus",
    doppelhaushaelfte: "Doppelhaushaelfte",
    einfamilienhaus: "Einfamilienhaus",
    eigentumswohnung: "Eigentumswohnung",
  };
  return map[String(a).toLowerCase()] || a;
}

function buildMapping(a: any) {
  const adr = adresseSplit(a.objektadresse);
  const besonderheiten = [
    a.besonderheiten,
    a.besonderheiten_hinweise,
    a.vermarktungshinweise,
  ].filter(Boolean).join("\n\n");

  return {
    objekt: objektartMap(a.objektart) + (a.objektadresse ? ` ${adr.strasse}` : ""),
    adresse: adr.strasse,
    plz: adr.plz,
    ort: adr.ort,
    objektart: objektartMap(a.objektart),
    wohnflaeche: a.wohnflaeche_m2 ? String(a.wohnflaeche_m2) : "",
    grundstuecksflaeche: a.grundstuecksgroesse_m2 ? String(a.grundstuecksgroesse_m2) : "",
    baujahr: a.baujahr ? String(a.baujahr) : "",
    besonderheiten,
  };
}

function buildAufnahmeText(a: any): string {
  const teile: string[] = [];
  if (a.objektart) teile.push(`Objektart: ${a.objektart}`);
  if (a.objektadresse) teile.push(`Adresse: ${a.objektadresse}`);
  if (a.ortsteil_wohnlage) teile.push(`Lage: ${a.ortsteil_wohnlage}`);
  if (a.infrastruktur) teile.push(`Infrastruktur: ${a.infrastruktur}`);
  if (a.einkauf_schulen_oepnv) teile.push(`Einkauf/Schulen/OePNV: ${a.einkauf_schulen_oepnv}`);
  if (a.besondere_lagevorteile) teile.push(`Lagevorteile: ${a.besondere_lagevorteile}`);
  if (a.grundstuecksgroesse_m2) teile.push(`Grundstuecksgroesse: ${a.grundstuecksgroesse_m2} qm`);
  if (a.erschliessung) teile.push(`Erschliessung: ${a.erschliessung}`);
  if (a.zufahrt) teile.push(`Zufahrt: ${a.zufahrt}`);
  if (a.baujahr) teile.push(`Baujahr: ${a.baujahr}`);
  if (a.bauweise) teile.push(`Bauweise: ${a.bauweise}`);
  if (a.modernisierungen_sanierungen) teile.push(`Sanierungen: ${a.modernisierungen_sanierungen}`);
  if (a.dach) teile.push(`Dach: ${a.dach}`);
  if (a.keller) teile.push(`Keller: ${a.keller}`);
  if (a.geschosse) teile.push(`Geschosse: ${a.geschosse}`);
  if (a.fenster) teile.push(`Fenster: ${a.fenster}`);
  if (a.wohnflaeche_m2) teile.push(`Wohnflaeche: ${a.wohnflaeche_m2} qm`);
  if (a.nutzflaeche_m2) teile.push(`Nutzflaeche: ${a.nutzflaeche_m2} qm`);
  if (a.anzahl_zimmer) teile.push(`Zimmer: ${a.anzahl_zimmer}`);
  if (a.anzahl_schlafzimmer) teile.push(`Schlafzimmer: ${a.anzahl_schlafzimmer}`);
  if (a.anzahl_badezimmer) teile.push(`Badezimmer: ${a.anzahl_badezimmer}`);
  if (a.gaeste_wc) teile.push(`Gaeste-WC: ja`);
  if (a.balkon_terrasse) teile.push(`Balkon/Terrasse: ja`);
  if (a.garage_stellplatz_carport) teile.push(`Garage/Stellplatz: ${a.garage_stellplatz_carport}`);
  if (a.bodenbelaege) teile.push(`Bodenbelaege: ${a.bodenbelaege}`);
  if (a.heizung_energietraeger) teile.push(`Heizung: ${a.heizung_energietraeger}`);
  if (a.heizungsbaujahr) teile.push(`Heizung Baujahr: ${a.heizungsbaujahr}`);
  if (a.energieausweis_vorhanden !== null && a.energieausweis_vorhanden !== undefined) teile.push(`Energieausweis vorhanden: ${a.energieausweis_vorhanden ? "ja" : "nein"}`);
  if (a.energiekennwert_kwh_m2_a) teile.push(`Energiekennwert: ${a.energiekennwert_kwh_m2_a} kWh/(qm a)`);
  if (a.besonderheiten) teile.push(`Besonderheiten Ausstattung: ${a.besonderheiten}`);
  if (a.einbauten_massmoebel) teile.push(`Einbauten/Massmoebel: ${a.einbauten_massmoebel}`);
  if (a.allgemeiner_zustand) teile.push(`Allgemeiner Zustand: ${a.allgemeiner_zustand}`);
  if (a.bekannte_maengel) teile.push(`Bekannte Maengel: ${a.bekannte_maengel}`);
  if (a.letzte_renovierung) teile.push(`Letzte Renovierung: ${a.letzte_renovierung}`);
  if (a.nutzungssituation) teile.push(`Nutzungssituation: ${a.nutzungssituation}`);
  if (a.besonderheiten_hinweise) teile.push(`Sonstige Hinweise: ${a.besonderheiten_hinweise}`);
  if (a.vermarktungshinweise) teile.push(`Vermarktungshinweise: ${a.vermarktungshinweise}`);
  if (a.empfohlene_massnahmen) teile.push(`Empfohlene Massnahmen: ${a.empfohlene_massnahmen}`);
  if (a.einschaetzung_marktwert_eur) teile.push(`Markwert-Einschaetzung: ${a.einschaetzung_marktwert_eur} EUR`);
  return teile.join("\n");
}

// ------------------------------------------------------------
// Robustes JSON-Extrahieren aus der Claude-Antwort:
// 1. ```json ... ``` Codeblock, sonst
// 2. erstes {...}-Objekt im Text, sonst
// 3. der getrimmte Rohtext.
// ------------------------------------------------------------
function extractJson(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) return obj[0].trim();
  return text.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY fehlt in den Secrets.");
      return jsonResponse({ ok: false, error: "ANTHROPIC_API_KEY fehlt (Secret nicht gesetzt)." }, 500);
    }

    const body = await req.json().catch(() => null);
    const aufnahme = body?.aufnahme;
    if (!aufnahme || typeof aufnahme !== "object") {
      return jsonResponse({ ok: false, error: "aufnahme fehlt oder ist kein Objekt." }, 400);
    }

    // 1. Mapping (kein KI noetig) — wird immer mitgeliefert, auch im Fehlerfall.
    const mapping = buildMapping(aufnahme);

    // 2. Aufnahme-Text fuer Claude bauen
    const aufnahmeText = buildAufnahmeText(aufnahme);

    // 2a. Text zu kurz -> KLARER Fehler mit Diagnose statt stiller leerer Liste.
    //     Die vorhandenen Keys zeigen sofort, ob ein Feldnamen-Mismatch vorliegt
    //     (z.B. Frontend schickt "wohnflaeche", Code erwartet "wohnflaeche_m2").
    if (aufnahmeText.trim().length < MIN_AUFNAHME_LEN) {
      const vorhandeneKeys = Object.keys(aufnahme).filter(
        (k) => aufnahme[k] !== null && aufnahme[k] !== undefined && aufnahme[k] !== "",
      );
      console.error(
        "Aufnahme-Text zu kurz fuer KI-Vorschlaege.",
        "Extrahierte Zeichen:", aufnahmeText.trim().length,
        "Vorhandene Keys:", vorhandeneKeys.join(", "),
      );
      return jsonResponse({
        ok: false,
        error: "Aufnahme enthaelt zu wenig verwertbare Daten fuer KI-Vorschlaege.",
        details: {
          grund: "extrahierter_text_zu_kurz",
          extrahierte_zeichen: aufnahmeText.trim().length,
          mindestlaenge: MIN_AUFNAHME_LEN,
          // Diagnose-Hilfe: welche Felder sind tatsaechlich angekommen?
          vorhandene_keys: vorhandeneKeys,
          hinweis:
            "Wenn hier Keys stehen, die NICHT von buildAufnahmeText gelesen werden, " +
            "liegt ein Feldnamen-Mismatch zwischen Frontend/DB und Edge Function vor.",
        },
        mapping,
      }, 422);
    }

    // 3. KI-Call
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Hier sind die Daten aus der Objektaufnahme:\n\n${aufnahmeText}\n\nGenerier mir die Vorschlaege als JSON.`,
        }],
      }),
    });

    // 3a. API-Fehler -> echter Fehler-Return (nicht mehr verschlucken).
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic-Fehler:", resp.status, errText);
      return jsonResponse({
        ok: false,
        error: `Anthropic-API-Fehler: ${resp.status}`,
        details: errText.substring(0, 500),
        mapping,
      }, 502);
    }

    const data = await resp.json();
    const rohtext = data?.content?.[0]?.text || "";
    const jsonText = extractJson(rohtext);

    // 3b. Parse-Fehler -> echter Fehler-Return (nicht mehr verschlucken).
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("JSON-Parse-Fehler:", e, "Rohtext:", rohtext.substring(0, 500));
      return jsonResponse({
        ok: false,
        error: "Antwort der KI konnte nicht als JSON geparst werden.",
        details: rohtext.substring(0, 500),
        mapping,
      }, 502);
    }

    const vorschlaege = {
      vorteile: Array.isArray(parsed.vorteile) ? parsed.vorteile : [],
      nachteile: Array.isArray(parsed.nachteile) ? parsed.nachteile : [],
      zielgruppen: Array.isArray(parsed.zielgruppen) ? parsed.zielgruppen : [],
    };

    // 3c. KI hat geantwortet, aber alle Kategorien sind leer -> als Fehler behandeln,
    //     damit das nicht wieder still "keine Einwaende" produziert.
    const gesamt = vorschlaege.vorteile.length + vorschlaege.nachteile.length + vorschlaege.zielgruppen.length;
    if (gesamt === 0) {
      console.error("KI lieferte gueltiges JSON, aber alle Kategorien leer. Rohtext:", rohtext.substring(0, 500));
      return jsonResponse({
        ok: false,
        error: "KI lieferte keine Vorschlaege (alle Kategorien leer).",
        details: rohtext.substring(0, 500),
        mapping,
      }, 502);
    }

    // Erfolg
    return jsonResponse({ ok: true, mapping, vorschlaege }, 200);

  } catch (e) {
    console.error("Unerwarteter Fehler:", e);
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});