// Edge Function: mail-aufgaben-erkennen  v1
// Liest aus einer selbst geschriebenen E-Mail (oder einer markierten Textpassage)
// heraus, was der Absender sich selbst zugesagt hat -> ToDo- bzw. Termin-Vorschlaege.
// Legt NICHTS an: das Portal zeigt die Vorschlaege, der Nutzer bestaetigt.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

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
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, error: "ANTHROPIC_API_KEY nicht gesetzt" }, 500);

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").trim();
    const betreff = String(body?.betreff || "").trim();
    const empfaenger = String(body?.empfaenger || "").trim();
    const modus = body?.modus === "passage" ? "passage" : "mail";
    const absender = String(body?.absender_name || "").trim();

    if (!text) return json({ ok: false, error: "text fehlt" }, 400);

    // Heutiges Datum in Europe/Berlin
    const jetzt = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    const iso = (d: Date) =>
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const heute = iso(jetzt);
    const heuteTag = WOCHENTAGE[jetzt.getDay()];

    const system = `Du bist der Assistent eines Immobilienmaklers und liest E-Mails, die der Makler SELBST geschrieben hat.
Deine einzige Aufgabe: herausfinden, was sich der Makler darin selbst vorgenommen oder dem Empfaenger zugesagt hat.

Heute ist ${heuteTag}, der ${heute} (Zeitzone Europe/Berlin).

ERKENNE nur Selbstverpflichtungen des Schreibers ("ich", "wir"):
- "Ich sende Ihnen die Unterlagen, sobald sie vorliegen"
- "Ich melde mich Anfang naechster Woche"
- "Wir klaeren das mit der Hausverwaltung und geben Bescheid"
- "Ich pruefe den Energieausweis und komme darauf zurueck"

IGNORIERE:
- alles, was der EMPFAENGER tun soll ("Bitte senden Sie mir ...")
- reine Hoeflichkeitsfloskeln ("Bei Fragen stehe ich zur Verfuegung", "Ich freue mich auf Ihre Rueckmeldung")
- Dinge, die in der Mail bereits erledigt sind ("anbei finden Sie ...", "im Anhang")
- Signatur, Zitat der Vormail, Rechtshinweise

art:
- "termin" nur bei einem konkret verabredeten Treffen/Ortstermin mit Datum (Besichtigung, Notartermin, Uebergabe, Objektaufnahme, Telefonat zu fester Uhrzeit)
- sonst immer "todo"

faellig_am / datum:
- rechne relative Angaben in ein Datum um ("morgen", "Anfang naechster Woche" = Montag der Folgewoche, "Ende der Woche" = Freitag dieser Woche, "in zwei Wochen", Wochentagsnennungen = naechstes Vorkommen)
- "sobald es vorliegt" / "zeitnah" / kein Datum: faellig_am = null (bei art "todo" erlaubt)
- art "termin" OHNE erkennbares Datum wird zu art "todo"
- niemals ein Datum in der Vergangenheit

titel: kurze Handlungsanweisung in der Ich-Form-freien Befehlsform, max. 80 Zeichen, mit Bezug (Name/Objekt), z. B. "Unterlagen an Fam. Mueller senden" oder "Bei Herrn Krause zum Kaufpreis zurueckmelden".
zitat: die woertliche Textstelle aus der Mail (max. 160 Zeichen), auf die sich der Eintrag stuetzt.

Maximal 4 Eintraege, keine Dubletten. Findest du nichts, gib eine leere Liste zurueck - das ist ein voellig normales Ergebnis.

Antworte AUSSCHLIESSLICH als JSON, ohne Markdown-Codeblock, im Format:
{"aufgaben":[{"art":"todo","titel":"...","beschreibung":"","faellig_am":"YYYY-MM-DD","uhrzeit":null,"dauer_min":null,"zitat":"..."}]}`;

    const systemPassage = `Du bist der Assistent eines Immobilienmaklers. Der Makler hat in seiner E-Mail eine Textstelle markiert und will daraus eine Aufgabe oder einen Termin machen.

Heute ist ${heuteTag}, der ${heute} (Zeitzone Europe/Berlin).

Gib GENAU EINEN Eintrag zurueck, auch wenn die Passage vage ist.
- art "termin" nur bei einem konkreten Treffen/Ortstermin mit Datum, sonst "todo"
- rechne relative Datumsangaben in ein echtes Datum um ("morgen", "Anfang naechster Woche" = Montag der Folgewoche, "Ende der Woche" = Freitag dieser Woche, Wochentagsnennung = naechstes Vorkommen); ohne Datum: null
- niemals ein Datum in der Vergangenheit
- titel: kurze Handlungsanweisung, max. 80 Zeichen, mit Bezug (Name/Objekt)
- uhrzeit nur bei art "termin" und nur wenn genannt (Format HH:MM)
- zitat: die markierte Passage, gekuerzt auf max. 160 Zeichen

Antworte AUSSCHLIESSLICH als JSON, ohne Markdown-Codeblock, im Format:
{"aufgaben":[{"art":"todo","titel":"...","beschreibung":"","faellig_am":"YYYY-MM-DD","uhrzeit":null,"dauer_min":null,"zitat":"..."}]}`;

    const kopf = [
      absender ? `Absender (der Makler): ${absender}` : "",
      empfaenger ? `Empfaenger: ${empfaenger}` : "",
      betreff ? `Betreff: ${betreff}` : "",
    ].filter(Boolean).join("\n");

    const userPrompt = modus === "passage"
      ? `${kopf}\n\nMarkierte Textstelle:\n"""\n${text.slice(0, 4000)}\n"""\n\nGib das JSON zurueck.`
      : `${kopf}\n\nMailtext des Maklers:\n"""\n${text.slice(0, 12000)}\n"""\n\nGib das JSON zurueck.`;

    const antwort = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: modus === "passage" ? systemPassage : system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!antwort.ok) {
      const err = await antwort.text();
      console.error("Anthropic-Fehler:", antwort.status, err);
      return json({ ok: false, error: `Anthropic ${antwort.status}`, detail: err.slice(0, 500) }, 500);
    }

    const result = await antwort.json();
    const roh = (result?.content || []).map((c: { text?: string }) => c?.text || "").join("").trim();

    let geparst: { aufgaben?: unknown[] };
    try {
      const sauber = roh.replace(/```json|```/g, "").trim();
      const start = sauber.indexOf("{");
      const ende = sauber.lastIndexOf("}");
      geparst = JSON.parse(start >= 0 && ende > start ? sauber.slice(start, ende + 1) : sauber);
    } catch (_e) {
      console.error("JSON nicht parsbar:", roh.slice(0, 500));
      return json({ ok: false, error: "Antwort der KI war nicht lesbar" }, 500);
    }

    const istDatum = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const istZeit = (s: unknown) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);

    const roheListe = Array.isArray(geparst?.aufgaben) ? geparst.aufgaben : [];
    const aufgaben = roheListe.slice(0, 4).map((a) => {
      const e = (a || {}) as Record<string, unknown>;
      let art = e.art === "termin" ? "termin" : "todo";
      let datum = istDatum(e.faellig_am) ? String(e.faellig_am) : null;
      if (datum && datum < heute) datum = heute;               // nie in der Vergangenheit
      if (art === "termin" && !datum) art = "todo";            // Termin ohne Datum ist ein ToDo
      const uhrzeit = art === "termin" && istZeit(e.uhrzeit) ? String(e.uhrzeit) : null;
      const dauer = typeof e.dauer_min === "number" && e.dauer_min > 0 ? Math.min(480, Math.round(e.dauer_min)) : null;
      return {
        art,
        titel: String(e.titel || "").slice(0, 120).trim(),
        beschreibung: String(e.beschreibung || "").slice(0, 400).trim(),
        faellig_am: datum,
        uhrzeit,
        dauer_min: dauer,
        zitat: String(e.zitat || "").slice(0, 200).trim(),
      };
    }).filter((a) => a.titel);

    return json({ ok: true, heute, aufgaben });
  } catch (e) {
    console.error("Fehler:", e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
