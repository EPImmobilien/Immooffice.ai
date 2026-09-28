// ============================================================================
// datei-namen-ki (v1)
//   Wandelt technische Dateinamen in freundliche Anzeigenamen um (Claude).
//   POST { namen: string[], kontext?: { projekt?, ordner?, kategorie? } }
//   -> { ok: true, namen: string[] }  (gleiche Laenge/Reihenfolge)
//   Wird beim Datei-Upload im Projekte-Bereich des Portals aufgerufen;
//   bei jedem Fehler behaelt das Frontend die Original-Namen.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");

    const body = await req.json().catch(() => ({}));
    const namen: string[] = Array.isArray(body.namen) ? body.namen.map((n: unknown) => String(n)).slice(0, 60) : [];
    if (!namen.length) throw new Error("namen ist Pflicht.");
    const k = body.kontext || {};

    const system = `Du benennst Dateien fuer das Kundenportal eines Immobilien-Bautraegerprojekts um.\n\nZIEL: Aus technischen Dateinamen werden freundliche, fuer Wohnungskaeufer verstaendliche Anzeigenamen.\n\nREGELN:\n- Deutsch, aussagekraeftig, max. ca. 60 Zeichen vor der Endung.\n- Die Datei-Endung (.pdf, .jpg, ...) IMMER unveraendert beibehalten.\n- Technische Prefixe, IDs, Hashes, Unterstriche und doppelte Infos entfernen.\n- Fachlich relevante Angaben BEHALTEN: Plan-Art (Ansicht/Grundriss/Schnitt), Himmelsrichtungen, Varianten-Nr., WE-Nummern, Geschoss, Datum nur wenn es eine Versionsangabe ist (dann als TT.MM.JJJJ).\n- Firmennamen von Planern/Architekten weglassen, ausser sie sind der einzige Inhalt.\n- Namen von Privatpersonen (z. B. Kaeufer/Planer) weglassen.\n- Leerzeichen und Umlaute sind erlaubt (es ist nur ein Anzeigename).\n- Keine zwei identischen Namen im Ergebnis - notfalls durchnummerieren.\n- Wenn ein Name schon gut lesbar ist, nur behutsam glaetten.\n\nANTWORT: AUSSCHLIESSLICH ein JSON-Array aus Strings, gleiche Anzahl und Reihenfolge wie die Eingabe. Kein Markdown, kein Vorwort.`;

    const user = `Projekt: ${k.projekt || "(unbekannt)"}\nZiel-Ordner: ${k.ordner || "(keiner)"}\nKategorie: ${k.kategorie || "(keine)"}\n\nDateinamen:\n${namen.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\nGib das JSON-Array mit ${namen.length} umbenannten Dateinamen zurueck.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1500, system, messages: [{ role: "user", content: user }] }),
    });
    if (!resp.ok) throw new Error(`Anthropic-API: ${resp.status}`);
    const result = await resp.json();
    const text = (result?.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length !== namen.length) throw new Error("Unerwartetes KI-Format.");

    // Sicherheitsnetz: Endung muss der Original-Endung entsprechen
    const endung = (n: string) => { const m = n.match(/\.[A-Za-z0-9]{1,6}$/); return m ? m[0].toLowerCase() : ""; };
    const fertig = parsed.map((n: unknown, i: number) => {
      let s = String(n).trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 90);
      const eOrig = endung(namen[i]); const eNeu = endung(s);
      if (eOrig && eNeu !== eOrig) s = s.replace(/\.[A-Za-z0-9]{1,6}$/, "") + eOrig;
      return s || namen[i];
    });

    return jsonResponse({ ok: true, namen: fertig });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
