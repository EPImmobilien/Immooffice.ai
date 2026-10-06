// ============================================================
// Edge Function: energieausweis-schaetzen
//
// Berechnet eine VORLÄUFIGE Schätzung des Endenergiekennwerts und
// der Energieklasse aus den Eingaben des Eigentümers/Maklers,
// und gibt Plausibilitätshinweise zurück.
//
// WICHTIG: Das ist KEIN offizieller Energieausweis-Wert. Es ist eine
// Live-Vorabschätzung damit der Eigentümer ein Gefühl bekommt was
// rauskommt. Der echte Wert wird vom Energieberater berechnet.
//
// Vorgehen:
//   1. Heizungsverbrauch der 3 Jahre auf kWh normieren (Einheits-
//      Umrechnung Liter/m³/kg → kWh über Heizwert)
//   2. Mittelwert bilden, leerstands-korrigieren
//   3. Auf m² Gebäudenutzfläche normieren (oder Wohnfläche × 1,2)
//   4. Klimafaktor anwenden (Norddeutschland: ca. 1,0-1,05)
//   5. Endenergiekennwert berechnen → Energieklasse zuordnen
//   6. KI fragen: Plausibilität gegeben? Hinweise?
//
// Deployment:
//   1. Datei nach supabase/functions/energieausweis-schaetzen/index.ts
//   2. ANTHROPIC_API_KEY in Supabase Edge Function Secrets
//   3. supabase functions deploy energieausweis-schaetzen --no-verify-jwt
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

// Heizwerte zur Umrechnung in kWh
const HEIZWERTE: Record<string, number> = {
  // Energieträger : kWh pro Einheit
  "Heizoel_Liter": 10.0,       // 10 kWh pro Liter Heizöl
  "Erdgas_m3": 10.0,            // 10 kWh pro m³ Erdgas (H-Gas)
  "Holzpellets_kg": 4.8,        // 4,8 kWh pro kg Holzpellets
  "Stueckholz_kg": 4.0,         // ca. 4 kWh pro kg Stückholz (lufttrocken)
};

// Energieklassen nach GEG (Anlage 10 GEG, kWh/m²a)
function energieklasseZuordnen(kennwert: number): string {
  if (kennwert <= 30)  return "A+";
  if (kennwert <= 50)  return "A";
  if (kennwert <= 75)  return "B";
  if (kennwert <= 100) return "C";
  if (kennwert <= 130) return "D";
  if (kennwert <= 160) return "E";
  if (kennwert <= 200) return "F";
  if (kennwert <= 250) return "G";
  return "H";
}

// Umrechnen eines Verbrauchswerts in kWh (basierend auf Einheit + Energieträger)
function inKWh(menge: number, einheit: string, energietraeger: string): number {
  if (einheit === "kWh") return menge;
  if (einheit === "Liter" && energietraeger === "Heizoel") return menge * HEIZWERTE.Heizoel_Liter;
  if (einheit === "m3" && energietraeger === "Erdgas")     return menge * HEIZWERTE.Erdgas_m3;
  if (einheit === "kg" && energietraeger === "Holzpellets") return menge * HEIZWERTE.Holzpellets_kg;
  if (einheit === "kg" && energietraeger === "Stueckholz")  return menge * HEIZWERTE.Stueckholz_kg;
  // Fallback: behandle wie kWh
  return menge;
}

interface Eingabe {
  // Gebaeudedaten
  baujahr_gebaeude?: number | null;
  baujahr_heizung?: number | null;
  wohnflaeche?: number | null;
  gebaeudenutzflaeche?: number | null;
  gebaeudetyp?: string | null;
  // Heizung
  heizung_energietraeger?: string | null;
  // Sanierungen (boolean fuer Plausi-Check)
  sanierung_fassade?: boolean | null;
  sanierung_dach?: boolean | null;
  sanierung_fenster?: boolean | null;
  // Verbrauchsdaten 3 Jahre
  verbrauch_jahr_1_heizung_kwh?: number | null;
  verbrauch_jahr_1_heizung_einheit?: string | null;
  verbrauch_jahr_1_warmwasser_kwh?: number | null;
  verbrauch_jahr_1_leerstand_monate?: number | null;
  verbrauch_jahr_2_heizung_kwh?: number | null;
  verbrauch_jahr_2_heizung_einheit?: string | null;
  verbrauch_jahr_2_warmwasser_kwh?: number | null;
  verbrauch_jahr_2_leerstand_monate?: number | null;
  verbrauch_jahr_3_heizung_kwh?: number | null;
  verbrauch_jahr_3_heizung_einheit?: string | null;
  verbrauch_jahr_3_warmwasser_kwh?: number | null;
  verbrauch_jahr_3_leerstand_monate?: number | null;
}

function berechneKennwert(e: Eingabe): { ok: boolean; kennwert?: number; klasse?: string; details?: string; warnung?: string } {
  // 1. Pruefen ob genug Daten da sind
  if (!e.wohnflaeche || e.wohnflaeche <= 0) {
    return { ok: false, warnung: "Wohnfläche fehlt — bitte angeben für eine Schätzung." };
  }
  const energietraeger = e.heizung_energietraeger || "Erdgas";

  // 2. Jahresverbraeuche normieren auf kWh
  const jahresverbraeuche: number[] = [];
  for (const jahr of [1, 2, 3]) {
    const menge   = (e as any)[`verbrauch_jahr_${jahr}_heizung_kwh`];
    const einheit = (e as any)[`verbrauch_jahr_${jahr}_heizung_einheit`] || "kWh";
    const warmw   = (e as any)[`verbrauch_jahr_${jahr}_warmwasser_kwh`] || 0;
    const leerst  = (e as any)[`verbrauch_jahr_${jahr}_leerstand_monate`] || 0;
    if (!menge || menge <= 0) continue;
    let kwh = inKWh(Number(menge), einheit, energietraeger) + Number(warmw);
    // Leerstandskorrektur: extrapolieren als waere Vollnutzung
    if (leerst > 0 && leerst < 12) {
      kwh = kwh * (12 / (12 - Number(leerst)));
    }
    jahresverbraeuche.push(kwh);
  }
  if (jahresverbraeuche.length === 0) {
    return { ok: false, warnung: "Bitte mindestens einen Jahresverbrauch eintragen." };
  }

  // 3. Mittelwert
  const mittelKwh = jahresverbraeuche.reduce((a, b) => a + b, 0) / jahresverbraeuche.length;

  // 4. Bezugsflaeche (AN oder geschaetzt aus Wohnflaeche)
  const an = e.gebaeudenutzflaeche && e.gebaeudenutzflaeche > 0
    ? Number(e.gebaeudenutzflaeche)
    : Number(e.wohnflaeche) * 1.2;

  // 5. Klimafaktor (vereinfacht: Norddeutschland 1.0)
  const klimafaktor = 1.0;
  const kennwert = (mittelKwh / an) * klimafaktor;

  // 6. Klasse zuordnen
  const klasse = energieklasseZuordnen(kennwert);

  return {
    ok: true,
    kennwert: Math.round(kennwert),
    klasse,
    details: `Mittelwert: ${Math.round(mittelKwh).toLocaleString("de-DE")} kWh/a · Bezugsfläche: ${Math.round(an)} m² · Anzahl Jahre: ${jahresverbraeuche.length}`,
  };
}

async function kiPlausibilitaet(e: Eingabe, ergebnis: { kennwert: number; klasse: string; details: string }): Promise<string> {
  if (!ANTHROPIC_API_KEY) return "";

  const prompt = `Du bist erfahrener Energieberater. Prüfe die folgende vorläufige Berechnung eines Energieausweises auf Plausibilität.

Gebäude:
- Baujahr Gebäude: ${e.baujahr_gebaeude || "?"}
- Baujahr Heizung: ${e.baujahr_heizung || "?"}
- Wohnfläche: ${e.wohnflaeche || "?"} m²
- Gebäudetyp: ${e.gebaeudetyp || "?"}
- Heizung: ${e.heizung_energietraeger || "?"}
- Sanierungen: ${[
  e.sanierung_fassade && "Fassade",
  e.sanierung_dach && "Dach",
  e.sanierung_fenster && "Fenster",
].filter(Boolean).join(", ") || "keine"}

Berechnung:
- Endenergie-Kennwert: ${ergebnis.kennwert} kWh/(m²·a)
- Energieklasse: ${ergebnis.klasse}
- ${ergebnis.details}

Aufgabe: Gib in maximal 2 kurzen Sätzen (zusammen max. 180 Zeichen) zurück ob die Werte plausibel sind. Erwähne konkret was auffällt — z.B. "Der Verbrauch erscheint sehr niedrig für ein Haus von 1970 ohne Dämmung — bitte prüfen ob alle Verbrauchsdaten erfasst sind" oder "Plausibel: Der Wert passt zu einem teilsanierten Bestandsgebäude mit Erdgasheizung".

Antworte nur mit dem Plausibilitäts-Hinweis. Keine Anführungszeichen, keine Aufzählungen, keine Meta-Kommentare.`;

  try {
    const apiResp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!apiResp.ok) return "";
    const result = await apiResp.json();
    return result.content?.[0]?.text?.trim() || "";
  } catch (_e) {
    return "";
  }
}

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
    const eingabe: Eingabe = await req.json();

    // Reine Berechnung
    const berechnung = berechneKennwert(eingabe);
    if (!berechnung.ok) {
      return new Response(
        JSON.stringify({ ok: false, warnung: berechnung.warnung }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // KI-Plausibilitaet
    const plausibilitaet = await kiPlausibilitaet(eingabe, {
      kennwert: berechnung.kennwert!,
      klasse: berechnung.klasse!,
      details: berechnung.details!,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        kennwert: berechnung.kennwert,
        klasse: berechnung.klasse,
        details: berechnung.details,
        plausibilitaet,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});