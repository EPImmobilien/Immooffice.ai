// ============================================================
// Edge Function: text-korrigieren (v14)
//
// Generische Text-Korrektur via Anthropic Claude.
// Nimmt einen Text (typisch diktiert oder schnell getippt) entgegen
// und gibt eine korrigierte Version zurueck:
//  - Rechtschreibung, Zeichensetzung, Grammatik
//  - "Komma" / "Punkt" Worte werden in Satzzeichen umgewandelt (nicht im Modus mail)
//  - Aufzaehlungen sauber formatiert
//  - Sinn und Aussage bleiben unveraendert
//
// v14: Modus "mail" fuer den Posteingang (reine Rechtschreib-/Grammatikpruefung,
//      keine Diktat-Umwandlung, Formulierungen und Zeilenumbrueche bleiben),
//      Modell claude-sonnet-4-6.
//
// Input:  { text: "...", modus?: "anmerkungen" | "expose" | "mail" | "frei" }
// Output: { ok: true, korrigiert: "..." } oder { ok: false, error: "..." }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// --- Credits (fork_49) ---------------------------------------------------
// Die Abrechnung liegt als Beilage im Ordner dieser Funktion; die Quelle
// steht in supabase/eigene-beilagen/_credits/credits.ts. Sie reserviert
// VOR dem Aufruf und gibt bei einem Fehler von selbst zurueck.
import { kiAbrechnen, abgelehnt } from "./credits.ts";
import type { Abrechnung } from "./credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT_BASIS = `Du bist ein deutscher Korrektor. Deine Aufgabe: einen vom Nutzer gesprochenen oder schnell getippten Text in eine sauber formulierte Version umwandeln.

WICHTIG:
- Aussage und Sinn bleiben UNVERAENDERT. Du erfindest nichts hinzu und laesst nichts weg.
- Korrigiere: Rechtschreibung, Zeichensetzung, Grammatik, Satzbau.
- Wenn im Text Worte wie "Komma", "Punkt", "Doppelpunkt", "Ausrufezeichen", "Fragezeichen", "Absatz", "neue Zeile" vorkommen und sie als Diktat-Anweisung gemeint sind, wandle sie in das entsprechende Zeichen um.
- Aufzaehlungen, die im gesprochenen Text als "erstens", "zweitens", "Punkt 1", "Punkt 2" formuliert sind, formatiere als Liste mit Bindestrichen oder Zahlen.
- Fuelle nichts auf. Wenn der Text kurz ist, bleibt er kurz.
- KEINE Anrede, KEINE Gruessformel hinzufuegen, KEINE Erklaerungen.
- Behalte den TON des Nutzers bei (locker bleibt locker, formell bleibt formell).

Antworte AUSSCHLIESSLICH mit dem korrigierten Text. KEIN Markdown, KEINE Anfuehrungszeichen drumherum, KEIN "Hier ist der korrigierte Text:" o.ae.`;

// Mail-Modus: reine Korrektur, nichts umformulieren, Struktur erhalten
const SYSTEM_PROMPT_MAIL = `Du bist ein deutscher Korrektor fuer geschaeftliche E-Mails eines Immobilienmaklers.

Aufgabe: Korrigiere AUSSCHLIESSLICH Rechtschreibung, Grammatik, Zeichensetzung und Gross-/Kleinschreibung (z. B. die Hoeflichkeitsform "Sie", "Ihnen", "Ihre").

Regeln:
- Formulierungen, Wortwahl, Satzbau, Tonfall, Anrede und Grussformel bleiben unveraendert. Nichts umschreiben, nichts kuerzen, nichts ergaenzen.
- Zeilenumbrueche, Absaetze, Leerzeilen, Aufzaehlungen und Einrueckungen exakt beibehalten.
- Namen, Adressen, Zahlen, Preise, Daten, Objektnummern, Links und E-Mail-Adressen unveraendert lassen.
- Woerter wie "Punkt", "Komma" oder "Absatz" sind normale Woerter — KEINE Diktat-Umwandlung.
- Zeilen, die mit ">" beginnen, und alles nach einer Zeile aus Bindestrichen unveraendert uebernehmen.
- Wenn nichts zu korrigieren ist, gib den Text unveraendert zurueck.

Antworte AUSSCHLIESSLICH mit dem korrigierten Text. KEIN Markdown, KEINE Anfuehrungszeichen drumherum, KEINE Erklaerungen, KEINE Liste der Aenderungen.`;

const HINWEISE_MODUS: Record<string, string> = {
  anmerkungen: `\n\nKontext: Der Text sind Anmerkungen eines Immobilien-Eigentuemers zu einem Expose. Typische Inhalte: "Bitte Foto austauschen", "Beschreibung ist falsch", "fehlt noch der Hinweis auf X". Bleib bei der Form: kurze, sachliche Anweisungen.`,
  expose: `\n\nKontext: Der Text ist Teil eines Immobilien-Exposes. Verwende sachlich-werblichen Stil. Keine Superlative ohne Bezug.`,
  frei: ``,
};

Deno.serve(async (req) => {
  // Die Reservierung muss auch im Fehlerfall erreichbar sein — in dieser
  // Funktion fuehrt JEDER Fehler ueber einen throw in denselben catch.
  let credits: Abrechnung | null = null;
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Nur POST" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY nicht gesetzt");
    }

    const { text, modus } = await req.json();
    if (!text || typeof text !== "string") {
      throw new Error("Feld 'text' fehlt oder ist kein String");
    }
    if (text.length > 20000) {
      throw new Error("Text ist zu lang (max. 20000 Zeichen)");
    }

    // --- Credits reservieren, bevor etwas erzeugt wird ----------------
    const abr = await kiAbrechnen(req, "ki_text", modus ? String(modus) : null);
    if (!abr.ok) return abgelehnt(abr, corsHeaders);
    credits = abr;

    const systemPrompt = modus === "mail" ? SYSTEM_PROMPT_MAIL : SYSTEM_PROMPT_BASIS + (HINWEISE_MODUS[modus] || "");

    const apiResp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: abr.modell(MODEL),
        max_tokens: abr.maxTokens(6000),
        temperature: abr.temperatur(0),
        system: systemPrompt,
        messages: [
          { role: "user", content: text },
        ],
      }),
    });

    if (!apiResp.ok) {
      const fehler = await apiResp.text();
      throw new Error(`Anthropic API Fehler ${apiResp.status}: ${fehler.slice(0, 300)}`);
    }

    const result = await apiResp.json();
    const korrigiert = result.content?.[0]?.text || "";
    if (!korrigiert.trim()) {
      throw new Error("Leere Antwort von der KI");
    }

    await abr.buchen(null, modus ? String(modus) : null);

    return new Response(
      JSON.stringify({ ok: true, credits: abr.credits, korrigiert: modus === "mail" ? korrigiert.replace(/^\n+|\n+$/g, "") : korrigiert.trim() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // Was reserviert war, geht zurueck — auch bei einem Fehler, der
    // schon vor dem Anbieter auftrat.
    if (credits) await credits.freigeben("Abbruch: " + String(e?.message || e));
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
