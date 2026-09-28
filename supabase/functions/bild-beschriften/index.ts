// ============================================================================
// bild-beschriften v2 (20.09.2026) – Bildunterschriften und Sortierung per KI für Objektfotos (Stufe 55)
//   POST { immobilie_id, datei_ids?: uuid[], nur_ohne_titel?: true, sortieren?: false, probe?: false }
//   Authorization: Team-JWT (Rolle chef/mitarbeiter)
//   v2: Jedes Bild bekommt zusätzlich eine Gruppe (immobilie_datei.bild_gruppe): aussen_haus, eingang, wohnen, kueche,
//       bad, schlafen, weitere, aussen_garten, luftbild. Mit sortieren=true werden die Fotos (kategorie foto) neu
//       nummeriert (sortierung 0..n): bis zu 3 Hausansichten → Eingang → Wohnen → Küche → Bad → Schlafen → Weitere →
//       restliche Hausansichten, Garten/Terrasse/Carport, Luftbild/Umgebung. Bilder mit Titel werden zuerst über
//       Schlüsselwörter im Titel gruppiert, nur unklare per Vision. probe=true liefert die geplante Reihenfolge ohne
//       zu schreiben. Grundrisse und Lagepläne werden nicht umsortiert.
//   Lädt die Bilder (bevorzugt die Web-Fassung *_web.jpg, sonst das Original, max. 4,5 MB) aus dem Bucket
//   immobilie-dateien, schickt bis zu 8 Bilder je Anfrage an Claude (Vision) und schreibt je Bild eine kurze
//   deutsche Bildunterschrift nach immobilie_datei.titel mit titel_quelle 'ki'. Das Team kontrolliert im
//   Bilder-Tab (Badge „KI-Vorschlag“, „✓ übernehmen“ setzt titel_quelle 'team'; jede Handeingabe ebenso).
//   Mit nur_ohne_titel (Standard) werden nur Bilder ohne Titel beschriftet – vorhandene Titel bleiben unberührt.
//   Bilddateien selbst werden nie verändert oder gelöscht.
//   Quelle im Repo: portal/bild-untertitel-ki/bild-beschriften.ts
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diagnose-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const BUCKET = "immobilie-dateien";
const MAX_BYTES = 4.5 * 1024 * 1024;
const JE_ANFRAGE = 8;
const webPfad = (p: string) => p.replace(/\.[^./]+$/, "") + "_web.jpg";
const GRUPPEN = ["aussen_haus", "eingang", "wohnen", "kueche", "bad", "schlafen", "weitere", "aussen_garten", "luftbild"];
const AUSSEN_VORN_MAX = 3;
// Gruppe aus dem Titel (deutsch, häufige Exposé-Begriffe); null = unklar → Vision
function gruppeAusTitel(titel: string | null, kategorie?: string): string | null {
  const t = String(titel || "").toLowerCase();
  if (!t.trim()) return null;
  if (/luftbild|drohne|vogelperspektive|lageplan|umgebung|ortsansicht|blick auf|\bsee\b|strand|badestelle|ostsee|panorama/.test(t)) return "luftbild";
  if (/eingang|diele|windfang|entree|flur eg|flur im erdgeschoss/.test(t)) return "eingang";
  if (/wohnzimmer|wohnbereich|wohn-|wohn\/|esszimmer|essbereich|kamin|wintergarten|wohnküche|wohnkueche|salon/.test(t)) return "wohnen";
  if (/küche|kueche|kochbereich|einbauk/.test(t)) return "kueche";
  if (/\bbad\b|badezimmer|duschbad|dusche|wannenbad|\bwc\b|toilette|sanitär|sanitaer/.test(t)) return "bad";
  if (/schlafzimmer|schlafen|\bsz\b|kinderzimmer|gästezimmer|gaestezimmer|ankleide/.test(t)) return "schlafen";
  if (/außenansicht|aussenansicht|vorderansicht|rückansicht|rueckansicht|seitenansicht|fassade|straßenseite|strassenseite|gartenseite|hausansicht|frontansicht|\bansicht\b|giebel|\bhaus\b|villa|bungalow|doppelhaus|reihenhaus|wohnhaus|\bobjekt\b|gebäude|gebaeude/.test(t)) return "aussen_haus";
  if (/garten|terrasse|balkon|carport|garage|nebengebäude|nebengebaeude|nebengelass|schuppen|pool|sitzbereich|wiese|baumbestand|\bhof\b|einfahrt|stellplatz|außenanlage|aussenanlage|grundstück|grundstueck|teich|zufahrt/.test(t)) return "aussen_garten";
  if (/flur|treppe|keller|dachboden|spitzboden|hauswirtschaft|\bhwr\b|abstell|technik|heizung|therme|arbeitszimmer|büro|buero|zimmer|raum|galerie|kammer|waschküche|waschkueche|sauna|fitness|hobby|gäste|gaeste/.test(t)) return "weitere";
  if (kategorie === "grundriss" || kategorie === "lageplan") return "weitere";
  return null;
}
// Sortierschlüssel je Gruppe; Hausansichten: die ersten AUSSEN_VORN_MAX nach vorn, Rest ans Ende vor Garten und Luftbild
function sortiereFotos(fotos: any[]): any[] {
  const rang: Record<string, number> = { aussen_haus_vorn: 0, eingang: 1, wohnen: 2, kueche: 3, bad: 4, schlafen: 5, weitere: 6, aussen_haus_rest: 7, aussen_garten: 8, luftbild: 9 };
  let haus = 0;
  const mitRang = fotos.map((f, i) => {
    let g = f.bild_gruppe || "weitere";
    if (g === "aussen_haus") { haus++; g = haus <= AUSSEN_VORN_MAX ? "aussen_haus_vorn" : "aussen_haus_rest"; }
    return { f, r: rang[g] ?? 6, i };
  });
  mitRang.sort((a, b) => a.r - b.r || a.i - b.i);
  return mitRang.map((x) => x.f);
}

async function bildLaden(db: any, zeile: any): Promise<{ data: string; media_type: string } | null> {
  const kandidaten: { pfad: string; typ: string }[] = [{ pfad: webPfad(zeile.storage_path), typ: "image/jpeg" }];
  const mt = String(zeile.mime_type || "").toLowerCase();
  if (/^image\/(jpeg|png|webp|gif)$/.test(mt)) kandidaten.push({ pfad: zeile.storage_path, typ: mt });
  else if (/\.(jpe?g)$/i.test(zeile.storage_path)) kandidaten.push({ pfad: zeile.storage_path, typ: "image/jpeg" });
  else if (/\.png$/i.test(zeile.storage_path)) kandidaten.push({ pfad: zeile.storage_path, typ: "image/png" });
  else if (/\.webp$/i.test(zeile.storage_path)) kandidaten.push({ pfad: zeile.storage_path, typ: "image/webp" });
  for (const k of kandidaten) {
    try {
      const { data, error } = await db.storage.from(BUCKET).download(k.pfad);
      if (error || !data) continue;
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_BYTES) continue;
      return { data: encodeBase64(bytes), media_type: k.typ };
    } catch (_e) { /* nächster Kandidat */ }
  }
  return null;
}

function jsonListe(roh: string): any[] {
  const t = roh.replace(/```(?:json)?/gi, "").trim();
  for (const v of [t, (t.match(/\[[\s\S]*\]/) || [""])[0]]) { try { const j = JSON.parse(v); if (Array.isArray(j)) return j; } catch (_e) { /* weiter */ } }
  const einzeln: any[] = [];
  for (const o of t.match(/\{[^{}]*\}/g) || []) { try { einzeln.push(JSON.parse(o)); } catch (_e) { /* überspringen */ } }
  return einzeln;
}

// Fotos (kategorie foto) nach Gruppen neu nummerieren; fehlende Gruppen im Datensatz mitschreiben. probe: nur planen.
async function fotosSortieren(db: any, alle: any[], gruppeJe: Map<string, string>, probe: boolean) {
  const fotos = alle.filter((z: any) => z.kategorie === "foto").map((z: any) => ({ ...z, bild_gruppe: gruppeJe.get(z.id) || z.bild_gruppe || "weitere" }));
  const neu = sortiereFotos(fotos);
  const reihenfolge = neu.map((f: any, i: number) => ({ nr: i + 1, id: f.id, titel: f.titel || f.name, gruppe: f.bild_gruppe, vorher: f.sortierung }));
  if (probe) return { sortiert: 0, reihenfolge };
  let n = 0;
  for (let i = 0; i < neu.length; i++) {
    const f = neu[i];
    const upd: any = {}; if (f.sortierung !== i) upd.sortierung = i;
    const orig = alle.find((z: any) => z.id === f.id); const g = gruppeJe.get(f.id); if (g && orig && orig.bild_gruppe !== g) upd.bild_gruppe = g;
    if (!Object.keys(upd).length) continue;
    const { error } = await db.from("immobilie_datei").update(upd).eq("id", f.id);
    if (error) console.error("Sortierung:", error); else n++;
  }
  return { sortiert: n, reihenfolge };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const geheim = req.headers.get("x-diagnose-secret") || "";
    let erlaubt = false;
    if (geheim) { const { data: okS } = await db.rpc("diagnose_secret_pruefen", { p: geheim }); erlaubt = okS === true; }
    if (!erlaubt) {
      const auth = req.headers.get("authorization") || "";
      const nutzerDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: u } = await nutzerDb.auth.getUser();
      if (!u?.user) return json({ ok: false, fehler: "Nicht angemeldet." }, 401);
      const { data: rolle } = await nutzerDb.rpc("aktuelle_rolle");
      if (rolle !== "chef" && rolle !== "mitarbeiter") return json({ ok: false, fehler: "Keine Berechtigung." }, 403);
    }
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, fehler: "Kein KI-Schlüssel hinterlegt." }, 500);

    const body = await req.json().catch(() => ({}));
    const immobilieId = String(body.immobilie_id || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(immobilieId)) return json({ ok: false, fehler: "immobilie_id fehlt." }, 400);
    const nurOhneTitel = body.nur_ohne_titel !== false;
    const sortieren = body.sortieren === true;
    const probe = body.probe === true;
    const ids: string[] = Array.isArray(body.datei_ids) ? body.datei_ids.map(String).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 60) : [];

    let q = db.from("immobilie_datei").select("id, name, storage_path, mime_type, titel, titel_quelle, bild_gruppe, kategorie, doktyp, quelle, sortierung")
      .eq("immobilie_id", immobilieId).in("kategorie", ["foto", "grundriss", "lageplan"]).not("storage_path", "is", null).order("sortierung", { ascending: true }).limit(120);
    if (ids.length) q = q.in("id", ids);
    const { data: zeilen, error } = await q;
    if (error) throw error;
    const alle = (zeilen || []).filter((z: any) => z.doktyp !== "Energieskala");
    // Gruppe aus dem Titel ableiten (kostenlos) – wo sie fehlt
    const gruppeJe = new Map<string, string>();
    for (const z of alle) { const g = z.bild_gruppe || gruppeAusTitel(z.titel, z.kategorie); if (g) gruppeJe.set(z.id, g); }
    let auswahl = alle;
    if (nurOhneTitel) auswahl = auswahl.filter((z: any) => !String(z.titel || "").trim() || (sortieren && !gruppeJe.has(z.id)));
    else auswahl = auswahl.filter((z: any) => z.titel_quelle !== "team" || ids.includes(z.id) || (sortieren && !gruppeJe.has(z.id)));
    auswahl = auswahl.slice(0, 40);
    const antwortOhneKi = async () => {
      let sortiert = 0; let reihenfolge: any[] = [];
      if (sortieren) { const r = await fotosSortieren(db, alle, gruppeJe, probe); sortiert = r.sortiert; reihenfolge = r.reihenfolge; }
      return json({ ok: true, vorgeschlagen: 0, uebersprungen: 0, titel: [], sortiert, reihenfolge });
    };
    if (!auswahl.length || probe) return await antwortOhneKi();

    const system = `Du beschriftest Fotos und Grundrisse für ein Immobilien-Exposé von Musterhaus Immobilien GmbH. Je Bild EINE Bildunterschrift auf Deutsch: 2–6 Wörter, sachlich, ohne Bewertung, ohne Satzzeichen am Ende.
Benenne, was zu sehen ist: Raum oder Ansicht, gern mit prägnantem Merkmal – z. B. „Wohnzimmer mit Kamin“, „Außenansicht Straßenseite“, „Küche mit Einbauküche“, „Badezimmer mit Dusche“, „Garten mit Terrasse“, „Grundriss Erdgeschoss“, „Luftbild mit Grundstück“, „Blick auf den See“, „Carport und Nebengebäude“.
Stockwerk oder Himmelsrichtung nur nennen, wenn es eindeutig erkennbar ist (z. B. Beschriftung im Grundriss). Keine Vermutungen, keine Personen beschreiben, keine Marken.
Ordne jedes Bild außerdem einer Gruppe zu: aussen_haus (Hausansicht von außen, Fassade, Straßen-/Gartenseite), eingang (Hauseingang, Diele, Windfang, Flur im Erdgeschoss), wohnen (Wohn-/Esszimmer, Kamin, Wintergarten), kueche, bad (Bad, Duschbad, WC), schlafen (Schlaf-, Kinder-, Gästezimmer), weitere (Flur OG, Treppe, Keller, Dachboden, Technik, Arbeitszimmer, sonstige Innenräume, Grundrisse), aussen_garten (Garten, Terrasse, Balkon, Carport, Garage, Nebengebäude, Einfahrt), luftbild (Luftbild, Umgebung, See, Ortsansicht).
Antworte NUR mit einem JSON-Array in der Reihenfolge der Bilder: [{"nr": 1, "titel": "...", "gruppe": "..."}, ...]`;

    const ergebnis: { id: string; titel: string }[] = [];
    let uebersprungen = 0;
    for (let i = 0; i < auswahl.length; i += JE_ANFRAGE) {
      const block = auswahl.slice(i, i + JE_ANFRAGE);
      const content: any[] = [];
      const geladen: any[] = [];
      for (const z of block) {
        const bild = await bildLaden(db, z);
        if (!bild) { uebersprungen++; continue; }
        geladen.push(z);
        content.push({ type: "text", text: `Bild ${geladen.length}${z.kategorie === "grundriss" ? " (Grundriss)" : z.kategorie === "lageplan" ? " (Lageplan)" : ""} – Dateiname: ${z.name || "-"}` });
        content.push({ type: "image", source: { type: "base64", media_type: bild.media_type, data: bild.data } });
      }
      if (!geladen.length) continue;
      content.push({ type: "text", text: `Bitte für die ${geladen.length} Bilder oben je eine Bildunterschrift als JSON-Array.` });
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, system, messages: [{ role: "user", content }] }) });
      if (!r.ok) { console.error("Anthropic:", r.status, await r.text()); return json({ ok: false, fehler: "KI-Dienst antwortet nicht (" + r.status + ")." }, 502); }
      const j = await r.json();
      const roh = String(j?.content?.[0]?.text || "").trim();
      const liste = jsonListe(roh);
      const jeNr = new Map<number, { titel: string; gruppe: string | null }>();
      for (const a of liste) { const nr = Number(a?.nr); const t = String(a?.titel || "").trim().replace(/[.!]+$/, "").slice(0, 80); const g = GRUPPEN.includes(String(a?.gruppe)) ? String(a.gruppe) : null; if (nr >= 1 && (t || g)) jeNr.set(nr, { titel: t, gruppe: g }); }
      for (let k = 0; k < geladen.length; k++) {
        const z = geladen[k]; const a = jeNr.get(k + 1); if (!a) { uebersprungen++; continue; }
        const gruppe = a.gruppe || gruppeAusTitel(a.titel || z.titel, z.kategorie) || gruppeJe.get(z.id) || null;
        if (gruppe) gruppeJe.set(z.id, gruppe);
        const hatTitel = !!String(z.titel || "").trim();
        if (hatTitel && (nurOhneTitel || z.titel_quelle === "team")) {
          // nur die Gruppe nachtragen, Titel bleibt
          if (gruppe) await db.from("immobilie_datei").update({ bild_gruppe: gruppe }).eq("id", z.id);
          continue;
        }
        if (!a.titel) { uebersprungen++; continue; }
        let upd = db.from("immobilie_datei").update({ titel: a.titel, titel_quelle: "ki", ...(gruppe ? { bild_gruppe: gruppe } : {}) }).eq("id", z.id);
        if (nurOhneTitel) upd = upd.or("titel.is.null,titel.eq.");
        const { error: e2 } = await upd;
        if (e2) { console.error("Titel:", e2); uebersprungen++; continue; }
        ergebnis.push({ id: z.id, titel: a.titel, gruppe });
      }
    }
    let sortiert = 0; let reihenfolge: any[] = [];
    if (sortieren) { const r = await fotosSortieren(db, alle, gruppeJe, probe); sortiert = r.sortiert; reihenfolge = r.reihenfolge; }
    return json({ ok: true, vorgeschlagen: ergebnis.length, uebersprungen, titel: ergebnis, sortiert, reihenfolge });
  } catch (e) {
    console.error("bild-beschriften:", e);
    return json({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
