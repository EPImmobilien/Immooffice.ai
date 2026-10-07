// ============================================================================
// kaufvertrag-lesen — Kaufpreis, Raten, Uebergabe, Sonderleistungen aus dem
//                     Kaufvertrag (PDF) als Vorschlag fuer die Wohnungsakte
// ============================================================================
// Eigene Function des Forks (fork_87). Nachtrag des Auftraggebers: „den
// Kaufvertrag hinterlegen, dass dieser ausgelesen wird — Kaufpreis etc., ob
// Sonderleistungen vereinbart worden sind, die dann nicht untergehen."
//
// Die Oberflaeche hat das PDF in den Bucket projekt-dateien gelegt
// (kaufvertraege/<projekt>/<einheit>/…). Hier wird es gelesen und einem
// Sprachmodell als Dokument gegeben; zurueck kommt JSON mit Belegstellen.
// Nichts wird geschrieben: der Vorschlag geht ins Formular, der Nutzer
// bestaetigt (CLAUDE.md: KI-Auslese immer ueber ein editierbares Formular;
// keine erfundenen Daten — was nicht im Vertrag steht, ist null).
//
// Sicherheit: Abrechnung ueber die Beilage (JWT, Mandant), dann wird die
// Einheit geladen und ihr Mandant gegen den des Aufrufers geprueft
// (immoMandantSichern); der Pfad muss zu Projekt und Einheit gehoeren.
// Personenbezug minimal: dem Modell geht der Vertrag, zurueck kommen Zahlen,
// Daten, Raten und Sonderleistungen — keine Anschriften, keine Geburtsdaten.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { kiAbrechnen, abgelehnt } from "./credits.ts";
import type { Abrechnung } from "./credits.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MODELL = "claude-sonnet-4-6";
const MAX_BYTES = 20 * 1024 * 1024;
const SYSTEM = `Du liest einen notariellen Bauträger-Kaufvertrag (deutsch) und ziehst die Angaben fuer die Wohnungsakte heraus.
Regeln, ohne Ausnahme:
- Nur, was im Vertrag steht. Nichts ergaenzen, nichts schaetzen. Fehlt eine Angabe, ist sie null bzw. die Liste leer.
- Zu jeder Zahl und jedem Datum einen kurzen "beleg" (max. 120 Zeichen, woertlich aus dem Vertrag, mit § oder Abschnitt, wenn erkennbar).
- Betraege als Zahl in Euro ohne Tausenderpunkte (z. B. 349000.00). Daten als YYYY-MM-DD.
- "raten": der vereinbarte Zahlungsplan (MaBV), je Rate nr, bezeichnung, prozent, betrag, und "abschnitte": die Nummern der Bauabschnitte nach § 3 Abs. 2 MaBV, die diese Rate buendelt (1 Erdarbeiten, 2 Rohbau, 3 Dach, 4 Heizung roh, 5 Sanitaer roh, 6 Elektro roh, 7 Fenster, 8 Innenputz, 9 Estrich, 10 Fliesen, 11 Bezugsfertigkeit, 12 Fassade, 13 Fertigstellung) — nur wenn der Vertrag die Abschnitte nennt, sonst [].
- "sonderleistungen": jede vereinbarte Sonderleistung, Sonderwunsch, Aenderung der Baubeschreibung, Mehr-/Minderleistung oder Nebenabrede als eigener Eintrag {text, betrag|null, beleg}. Vollstaendig — genau das darf nicht untergehen.
- Keine Anschriften, keine Geburtsdaten, keine Kontonummern.
Antworte NUR mit JSON dieser Form:
{"kaufpreis": {"wert": 0, "beleg": ""}, "kaufgegenstand": {"wert": "", "beleg": ""}, "uebergabe_bis": {"wert": "YYYY-MM-DD"|null, "beleg": ""}, "fertigstellung_bis": {"wert": null, "beleg": ""},
 "notar": {"wert": "", "beleg": ""}, "urkunde": {"wert": "", "beleg": ""}, "vertragsdatum": {"wert": null, "beleg": ""},
 "raten": [{"nr": 1, "bezeichnung": "", "prozent": 0, "betrag": 0, "abschnitte": [], "beleg": ""}],
 "sonderleistungen": [{"text": "", "betrag": null, "beleg": ""}],
 "hinweise": ["…"]}`;

/** Der Aufrufer und sein Mandant kommen aus der Abrechnung (JWT); die Einheit muss ihm gehoeren. */
async function immoMandantSichern(db: any, einheitId: string, mandant: string) {
  const { data: e } = await db.from("projekt_einheiten").select("id, projekt_id, mandant_id, we_nr, kaufpreis, kaufvertrag_datei").eq("id", einheitId).maybeSingle();
  if (!e || e.mandant_id !== mandant) return null;
  return e;
}
function jsonAusText(t: string): Record<string, any> {
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("Das Modell hat kein JSON geliefert.");
  return JSON.parse(t.slice(s, e + 1));
}
const zahl = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const datum = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const feld = (x: any, art: "zahl" | "datum" | "text") => {
  const wert = x && x.wert !== undefined && x.wert !== null ? (art === "zahl" ? zahl(x.wert) : art === "datum" ? datum(x.wert) : String(x.wert).trim().slice(0, 300) || null) : null;
  const beleg = x && x.beleg ? String(x.beleg).trim().slice(0, 160) : null;
  return { wert: wert !== null && beleg ? wert : null, beleg: wert !== null && beleg ? beleg : null };   // ohne Beleg kein Wert
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let credits: Abrechnung | null = null;
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const einheitId = String(body.einheit_id || "");
    const pfad = String(body.pfad || "");
    if (!einheitId || !pfad) return antwort({ ok: false, fehler: "einheit_id und pfad fehlen." }, 400);
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return antwort({ ok: false, fehler: "ANTHROPIC_API_KEY fehlt." }, 500);

    const abr = await kiAbrechnen(req, "kaufvertrag_lesen", einheitId);
    if (!abr.ok) return abgelehnt(abr, cors);
    credits = abr;

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const e = await immoMandantSichern(db, einheitId, abr.mandant);
    if (!e) { await abr.freigeben("einheit fremd oder fehlt"); return antwort({ ok: false, fehler: "Einheit nicht gefunden." }, 404); }
    if (!pfad.startsWith(`kaufvertraege/${e.projekt_id}/${e.id}/`)) { await abr.freigeben("pfad passt nicht"); return antwort({ ok: false, fehler: "Die Datei gehört nicht zu dieser Einheit." }, 400); }
    const { data: datei, error: dlErr } = await db.storage.from("projekt-dateien").download(pfad);
    if (dlErr || !datei) { await abr.freigeben("download"); return antwort({ ok: false, fehler: "Der Kaufvertrag ließ sich nicht laden." }, 404); }
    const bytes = new Uint8Array(await datei.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) { await abr.freigeben("groesse"); return antwort({ ok: false, fehler: "Die Datei ist leer oder größer als 20 MB." }, 400); }
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) { await abr.freigeben("kein pdf"); return antwort({ ok: false, fehler: "Bitte den Kaufvertrag als PDF hochladen." }, 400); }
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const b64 = btoa(bin);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: abr.modell(MODELL), max_tokens: abr.maxTokens(3000), temperature: abr.temperatur(0), system: SYSTEM,
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: `Einheit laut Akte: WE ${e.we_nr}${e.kaufpreis ? `, Kaufpreis laut Akte ${e.kaufpreis} €` : ""}. Lies den Vertrag und antworte als JSON.` },
        ] }],
      }),
    });
    if (!r.ok) { await abr.freigeben("anthropic " + r.status); return antwort({ ok: false, fehler: `KI-Dienst antwortete ${r.status}.` }, 502); }
    const d = await r.json();
    const roh = jsonAusText(String((d?.content || []).map((c: any) => c.text || "").join("")));
    const raten = (Array.isArray(roh.raten) ? roh.raten : []).slice(0, 7).map((x: any, i: number) => ({
      nr: Number(x.nr) || i + 1, bezeichnung: String(x.bezeichnung || "").slice(0, 160), prozent: zahl(x.prozent), betrag: zahl(x.betrag),
      abschnitte: (Array.isArray(x.abschnitte) ? x.abschnitte : []).map(Number).filter((n: number) => n >= 1 && n <= 13), beleg: String(x.beleg || "").slice(0, 160),
    }));
    const sonderleistungen = (Array.isArray(roh.sonderleistungen) ? roh.sonderleistungen : []).slice(0, 40).map((x: any) => ({
      text: String(x.text || "").trim().slice(0, 400), betrag: zahl(x.betrag), beleg: String(x.beleg || "").slice(0, 160), erledigt: false, quelle: "kaufvertrag",
    })).filter((x: any) => x.text);
    const usage = d?.usage || {};
    const kosten = (Number(usage.input_tokens || 0) * 3 + Number(usage.output_tokens || 0) * 15) / 1e6 * 0.92;
    await abr.buchen(kosten, "kaufvertrag-lesen WE " + e.we_nr, "anthropic", abr.modell(MODELL));
    return antwort({ ok: true, einheit_id: e.id,
      kaufpreis: feld(roh.kaufpreis, "zahl"), kaufgegenstand: feld(roh.kaufgegenstand, "text"), uebergabe_bis: feld(roh.uebergabe_bis, "datum"),
      fertigstellung_bis: feld(roh.fertigstellung_bis, "datum"), notar: feld(roh.notar, "text"), urkunde: feld(roh.urkunde, "text"), vertragsdatum: feld(roh.vertragsdatum, "datum"),
      raten, sonderleistungen, hinweise: (Array.isArray(roh.hinweise) ? roh.hinweise : []).map(String).slice(0, 8), seiten_hinweis: bytes.length > 8 * 1024 * 1024 ? "Große Datei — die Prüfung der Belegstellen lohnt sich doppelt." : null });
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    if (credits) await credits.freigeben("Abbruch: " + grund);
    console.error("kaufvertrag-lesen:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
