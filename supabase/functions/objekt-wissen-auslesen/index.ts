// ============================================================================
// objekt-wissen-auslesen v3 — Unterlagen zu einem Objekt in Objektwissen verwandeln
// ----------------------------------------------------------------------------
// Body: { immobilie_id, quelle_typ: "datei"|"onedrive"|"manuell", quelle_name, quelle_ref?,
//         datei_base64?, content_type?, text? }
// Claude liest das Dokument (PDF/Bild direkt, Text als Text) und liefert
// { dokument_typ, zusammenfassung, fakten: [{thema, aussage, fundstelle}], warnungen: [] }.
// Ergebnis wird in public.immobilie_wissen abgelegt (Upsert über immobilie_id + quelle_ref)
// und dient mail-ki-vorschlag als Faktenbasis für Antworten auf Kundenfragen.
// v3: Ausgabelimit 16k Tokens; abgeschnittene JSON-Antworten (sehr lange Beschlusssammlungen)
//     werden bis zum letzten vollständigen Fakt repariert statt zu scheitern.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

// --- Mandantengrenze fuer Kennungen aus dem Anfragekoerper -----------------
// Diese Funktion prueft das JWT, arbeitet danach aber mit dem service_role —
// und fuer den gilt RLS nicht. Eine Kennung, die der Aufrufer mitschickt, ist
// damit ungeprueft: sie kann auf einen Satz eines anderen Mandanten zeigen.
//
// public.mandant_sichern() aus fork_14 zieht genau diese Grenze. Sie muss
// aber MIT DEM TOKEN DES AUFRUFERS gerufen werden — unter dem service_role
// laesst sie jeden durch (mandant_grenze_gilt() ist dort false, mit Absicht:
// Cron und Wartung haben keinen Mandanten). Deshalb ein zweiter Client, der
// nur den mitgebrachten Kopf weiterreicht.
//
// Ohne Anmeldekopf oder mit dem Dienstschluessel passiert nichts — das sind
// die internen Wege, und die sind nicht die Grenze, die hier gezogen wird.
async function immoMandantSichern(req: Request, paare: Array<[string, unknown]>): Promise<void> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return;
  const zuPruefen = paare.filter(([, id]) =>
    typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if (!zuPruefen.length) return;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  for (const [tabelle, id] of zuPruefen) {
    const { error } = await nutzer.rpc("mandant_sichern", { p_tabelle: tabelle, p_id: id });
    if (error) throw new Error("Kein Zugriff auf Daten eines anderen Mandanten.");
  }
}

// Wessen Mandant ist der Aufrufer? Fuer die Faelle, in denen nicht eine
// Kennung, sondern ein PFAD aus dem Anfragekoerper kommt — das erste
// Pfadsegment im Dateispeicher ist seit fork_09 die Mandantenkennung.
async function immoMandantDesAufrufers(req: Request): Promise<string | null> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return null;
  const nutzer = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  const { data: u } = await nutzer.auth.getUser(kopf.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return null;
  const { data: prof } = await nutzer.from("profiles").select("mandant_id").eq("id", u.user.id).maybeSingle();
  return prof?.mandant_id ? String(prof.mandant_id) : null;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = "claude-sonnet-4-6";
const MAX_BYTES = 24 * 1024 * 1024;

// Abgeschnittene JSON-Antwort (Ausgabelimit erreicht) reparieren: bis zum letzten vollständigen Fakt kürzen und schließen
function jsonReparieren(t: string): any | null {
  const s0 = t.indexOf("{"); if (s0 < 0) return null;
  let text = t.slice(s0);
  try { return JSON.parse(text.slice(0, text.lastIndexOf("}") + 1)); } catch { /* weiter */ }
  const schluesse = ["]}", "\"]}", "}]}", "\"}]}", "\"]}]}", "]}]}", "\"}]}]}"];
  for (let versuch = 0; versuch < 120; versuch++) {
    const schnitt = Math.max(text.lastIndexOf("},"), text.lastIndexOf("}"), text.lastIndexOf("\","));
    if (schnitt <= 0) break;
    const basis = text.slice(0, schnitt + 1).replace(/,\s*$/, "");
    for (const ende of schluesse) {
      try { const j = JSON.parse(basis + ende); if (j && typeof j === "object") return j; } catch { /* nächster */ }
    }
    text = text.slice(0, schnitt);
  }
  return null;
}

const SYSTEM = `Du liest Unterlagen zu einer Immobilie für ein Maklerbüro aus.
Ziel: eine Faktenbasis, mit der später Kundenfragen per E-Mail korrekt beantwortet werden können.

Regeln:
- Extrahiere nur, was im Dokument WIRKLICH steht. Nichts ergänzen, nichts schätzen, keine Bewertungen.
- Jede Tatsache als eigener Eintrag: konkrete Zahlen, Daten, Fristen, Beträge, Flächen, Baujahre, Beschlüsse, Rechte, Lasten, Ausstattungen, Zustände, Kündigungsfristen, Mieten, Rücklagen, Hausgeld, Instandhaltungen, Energiekennwerte.
- "fundstelle": Seite, Abschnitt, Paragraph oder Zeile, so genau wie möglich (z. B. "S. 3, §4 Abs. 2", "Abt. II lfd. Nr. 1", "Tabelle Wirtschaftsplan Pos. 7").
- Namen privater Personen (Eigentümer, Mieter, Verwalter-Mitarbeiter) NICHT wiedergeben, nur Rollen ("der Eigentümer", "der Mieter"). Firmen- und Behördennamen sind in Ordnung.
- "warnungen": Dinge, die ein Käufer/Mieter wissen sollte oder die der Makler prüfen muss (Lasten, Sonderumlagen, Rückstände, Sanierungsbeschlüsse, Baumängel, Befristungen, fehlende Seiten, unleserliche Stellen).
- Höchstens 60 Fakten; lieber die wichtigen vollständig als alles halb. Bei langen Beschlusssammlungen: die jüngsten und finanziell relevanten Beschlüsse zuerst, jede Aussage knapp (max. 2 Sätze).
- dokument_typ frei benennen, z. B. Grundbuchauszug, Teilungserklärung, Wirtschaftsplan, Hausgeldabrechnung, Protokoll Eigentümerversammlung, Energieausweis, Mietvertrag, Baubeschreibung, Grundriss, Exposé, Flurkarte, Sonstiges.

Antworte AUSSCHLIESSLICH mit JSON dieser Form (kein Markdown):
{"dokument_typ":"…","zusammenfassung":"3–6 Sätze","fakten":[{"thema":"…","aussage":"…","fundstelle":"…"}],"warnungen":["…"]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis
  // im Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne
  // gueltiges Abo kommt trotzdem nicht daran. Die Schranke liegt in
  // der Beilage abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, cors);
  if (immoAboSperre) return immoAboSperre;
  const antwort = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY nicht gesetzt");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const authHeader = req.headers.get("authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return antwort({ ok: false, error: "Nicht authentifiziert" }, 401);
    const { data: p } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, error: "Keine Berechtigung" }, 403);

    const body = await req.json();
    const { immobilie_id, quelle_typ, quelle_name, quelle_ref, datei_base64, content_type, text } = body || {};
    await immoMandantSichern(req, [["immobilien", String(immobilie_id || "")]]);
    if (!immobilie_id) throw new Error("immobilie_id fehlt");
    if (!datei_base64 && !text) throw new Error("Weder Datei noch Text übergeben");

    const { data: immo } = await admin.from("immobilien").select("id, immo_nr, bezeichnung, strasse, hausnummer, plz, ort, objektart, vertragsart").eq("id", immobilie_id).maybeSingle();
    if (!immo) throw new Error("Objekt nicht gefunden");
    const objektZeile = `Objekt ${immo.immo_nr || ""} · ${immo.bezeichnung || ""} · ${[immo.strasse, immo.hausnummer].filter(Boolean).join(" ")}, ${[immo.plz, immo.ort].filter(Boolean).join(" ")} · ${immo.objektart || ""} · ${immo.vertragsart || ""}`;

    // Manuelle Notiz: kein KI-Lauf, direkt als Fakt ablegen
    if (quelle_typ === "manuell" && !datei_base64) {
      const zeilen = String(text || "").split(/\n+/).map((z) => z.trim()).filter(Boolean);
      const fakten = zeilen.map((z) => ({ thema: "Hinweis des Teams", aussage: z, fundstelle: quelle_name || "manuelle Notiz" }));
      const { data: row, error } = await admin.from("immobilie_wissen").insert({ immobilie_id, quelle_typ: "manuell", quelle_name: quelle_name || "Notiz", quelle_ref: null, dokument_typ: "Notiz", zusammenfassung: zeilen.join(" "), fakten, warnungen: [], erstellt_von: u.user.id }).select().single();
      if (error) throw error;
      return antwort({ ok: true, wissen: row });
    }

    // Dokument an Claude
    const content: any[] = [];
    if (datei_base64) {
      const groesse = Math.floor(datei_base64.length * 0.75);
      if (groesse > MAX_BYTES) throw new Error(`Datei zu groß (${(groesse / 1024 / 1024).toFixed(1)} MB, max. 24 MB)`);
      const ct = String(content_type || "application/pdf").toLowerCase();
      if (ct === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: datei_base64 } });
      else if (/^image\/(jpeg|png|gif|webp)$/.test(ct)) content.push({ type: "image", source: { type: "base64", media_type: ct, data: datei_base64 } });
      else if (ct.startsWith("text/")) content.push({ type: "text", text: new TextDecoder().decode(Uint8Array.from(atob(datei_base64), (c) => c.charCodeAt(0))).slice(0, 150000) });
      else throw new Error(`Dateityp ${ct} kann nicht ausgelesen werden (PDF, Bild oder Text)`);
    } else {
      content.push({ type: "text", text: String(text).slice(0, 150000) });
    }
    content.push({ type: "text", text: `Zugehöriges Objekt: ${objektZeile}\nDokumentname: ${quelle_name || "unbekannt"}\n\nLies das Dokument aus und antworte nur mit dem JSON.` });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 16000, temperature: 0, system: SYSTEM, messages: [{ role: "user", content }] }),
    });
    if (!r.ok) throw new Error(`KI-Anfrage fehlgeschlagen (${r.status}): ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    let t = d?.content?.[0]?.text || "";
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) t = m[1].trim();
    const s0 = t.indexOf("{");
    if (s0 < 0) throw new Error("KI-Antwort enthält kein JSON");
    let j: any = null;
    try { j = JSON.parse(t.slice(s0, t.lastIndexOf("}") + 1)); }
    catch { j = jsonReparieren(t); if (j) console.warn("KI-JSON war abgeschnitten (stop_reason " + (d?.stop_reason || "?") + ") — bis zum letzten vollständigen Fakt übernommen"); }
    if (!j) throw new Error("KI-Antwort war unvollständig und ließ sich nicht reparieren (stop_reason " + (d?.stop_reason || "?") + ")");
    if (d?.stop_reason === "max_tokens") j.warnungen = [...(Array.isArray(j.warnungen) ? j.warnungen : []), "Dokument sehr umfangreich — Faktenliste wurde am Ausgabelimit abgeschnitten, ggf. in Teilen auswerten"];
    const fakten = Array.isArray(j.fakten) ? j.fakten.filter((f: any) => f && f.aussage).slice(0, 80).map((f: any) => ({ thema: String(f.thema || "").slice(0, 120), aussage: String(f.aussage).slice(0, 600), fundstelle: String(f.fundstelle || "").slice(0, 120) })) : [];
    const warnungen = Array.isArray(j.warnungen) ? j.warnungen.map((w: any) => String(w).slice(0, 400)).slice(0, 30) : [];

    const zeile = { immobilie_id, quelle_typ: quelle_typ || "datei", quelle_name: quelle_name || null, quelle_ref: quelle_ref || null, dokument_typ: String(j.dokument_typ || "Dokument").slice(0, 80), zusammenfassung: String(j.zusammenfassung || "").slice(0, 3000), fakten, warnungen, ausgewertet_am: new Date().toISOString(), erstellt_von: u.user.id };
    let row: any = null;
    if (quelle_ref) {
      const { data, error } = await admin.from("immobilie_wissen").upsert(zeile, { onConflict: "immobilie_id,quelle_ref" }).select().single();
      if (error) throw error; row = data;
    } else {
      const { data, error } = await admin.from("immobilie_wissen").insert(zeile).select().single();
      if (error) throw error; row = data;
    }
    return antwort({ ok: true, wissen: row, usage: d?.usage || null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e && typeof e === "object" ? (e.message || e.details || e.hint || JSON.stringify(e)) : String(e));
    console.error("objekt-wissen-auslesen:", msg);
    return antwort({ ok: false, error: msg }, 200);
  }
});
