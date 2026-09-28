// ============================================================================
// termin-serie v1 — wiederkehrende Termine
// ----------------------------------------------------------------------------
// Eine Serie wird ausgeschrieben: jeder Termin ist eine eigene Zeile in
// `termine`, zusammengehalten durch serie_id. Das ist Absicht — Fahrzeit,
// onOffice-Uebertragung, Erinnerung und Nachfassen haengen alle an einer
// konkreten Zeile, eine virtuelle Serie haette all das umbauen muessen.
// Ausserdem kennt die onOffice-API keine Serien: dort muss ohnehin jeder
// Termin einzeln entstehen.
//
// Body:
//   { aktion: "anlegen", vorlage: {...}, regel: {...} }
//        -> legt die Zeilen an (ohne onOffice) und liefert serie_id + Anzahl
//   { aktion: "uebertragen", serie_id, limit?, modus?: "offen"|"alle", ab_datum? }
//        -> schiebt haeppchenweise nach onOffice, rechnet nahe Fahrzeiten
//   { aktion: "aktualisieren", serie_id, ab_datum, aenderungen: {...} }
//        -> aendert alle Termine der Serie ab diesem Datum
//   { aktion: "loeschen", serie_id, ab_datum? }
//        -> sagt in onOffice ab (samt Fahrten) und entfernt die Zeilen
//
// Regel: { takt: "tag"|"woche"|"monat"|"jahr", intervall: 1..52,
//          wochentage?: [1..7],            // nur bei takt "woche", 1 = Montag
//          ende_art: "anzahl"|"datum", anzahl?: n, bis?: "YYYY-MM-DD" }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TERMINE = 200;
const MAX_TAGE = 1095;            // drei Jahre nach vorn, mehr ist keine Planung mehr
const FAHRZEIT_HORIZONT = 21;     // weiter entfernte Termine holt der Nachtlauf

const tagD = (s: string) => new Date(`${s}T12:00:00Z`);   // 12 Uhr: keine Zeitzonen-Kippel
const iso = (d: Date) => d.toISOString().slice(0, 10);
const tagPlus = (s: string, n: number) => iso(new Date(tagD(s).getTime() + n * 86400000));

function monatPlus(start: string, n: number): string {
  const [y, m, d] = start.split("-").map(Number);
  const ziel = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0, 12)).getUTCDate();
  ziel.setUTCDate(Math.min(d, letzter));   // 31. im Februar wird der 28./29.
  return iso(ziel);
}

function serienDaten(start: string, regel: any): string[] {
  const takt = String(regel?.takt || "woche");
  const intervall = Math.min(Math.max(Number(regel?.intervall) || 1, 1), 52);
  const grenze = tagPlus(start, MAX_TAGE);
  const bis = regel?.ende_art === "datum" && regel?.bis
    ? (regel.bis < grenze ? String(regel.bis) : grenze)
    : grenze;
  const anzahl = regel?.ende_art === "anzahl"
    ? Math.min(Math.max(Number(regel?.anzahl) || 1, 1), MAX_TERMINE)
    : MAX_TERMINE;

  const out: string[] = [];
  const wochentage = Array.isArray(regel?.wochentage)
    ? regel.wochentage.map(Number).filter((n: number) => n >= 1 && n <= 7).sort((a: number, b: number) => a - b)
    : [];

  if (takt === "woche" && wochentage.length) {
    const startD = tagD(start);
    const montag = new Date(startD.getTime() - ((startD.getUTCDay() + 6) % 7) * 86400000);
    for (let w = 0; w < 300 && out.length < anzahl; w += intervall) {
      let ende = false;
      for (const wt of wochentage) {
        const d = iso(new Date(montag.getTime() + (w * 7 + (wt - 1)) * 86400000));
        if (d < start) continue;
        if (d > bis) { ende = true; break; }
        out.push(d);
        if (out.length >= anzahl) break;
      }
      if (ende) break;
    }
    return out;
  }

  for (let i = 0; i < 2000 && out.length < anzahl; i++) {
    const d = takt === "tag" ? tagPlus(start, i * intervall)
      : takt === "woche" ? tagPlus(start, i * intervall * 7)
      : takt === "monat" ? monatPlus(start, i * intervall)
      : monatPlus(start, i * intervall * 12);
    if (d > bis) break;
    out.push(d);
  }
  return out;
}

async function ruf(pfad: string, koerper: unknown) {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${pfad}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify(koerper),
    });
    return await r.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let nutzerId: string | null = null;
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (!u?.user) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
      nutzerId = u.user.id;
      const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
      if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const aktion = String(body.aktion || "anlegen");

    // ------------------------------------------------------------------ Vorschau
    if (aktion === "vorschau") {
      const daten = serienDaten(String(body.datum || ""), body.regel || {});
      return antwort({ ok: true, anzahl: daten.length, daten: daten.slice(0, 12), letzter: daten[daten.length - 1] || null });
    }

    // ------------------------------------------------------------------ Anlegen
    if (aktion === "anlegen") {
      const v = body.vorlage || {};
      if (!v.titel || !v.datum) return antwort({ ok: false, fehler: "Titel und Datum werden gebraucht." }, 400);
      const daten = serienDaten(String(v.datum), body.regel || {});
      if (!daten.length) return antwort({ ok: false, fehler: "Die Wiederholung ergibt keinen einzigen Termin." }, 400);

      // Mehrtaegige Termine behalten ihre Laenge
      const spanne = v.datum_ende && v.datum_ende > v.datum
        ? Math.round((tagD(v.datum_ende).getTime() - tagD(v.datum).getTime()) / 86400000) : 0;

      const serieId = crypto.randomUUID();
      const regel = {
        takt: String(body.regel?.takt || "woche"),
        intervall: Math.min(Math.max(Number(body.regel?.intervall) || 1, 1), 52),
        wochentage: Array.isArray(body.regel?.wochentage) ? body.regel.wochentage : null,
        ende_art: body.regel?.ende_art === "datum" ? "datum" : "anzahl",
        anzahl: daten.length,
        bis: daten[daten.length - 1],
      };

      const zeilen = daten.map((d, i) => ({
        titel: v.titel,
        art: v.art || null,
        datum: d,
        datum_ende: spanne ? tagPlus(d, spanne) : null,
        uhrzeit: v.ganztags ? null : v.uhrzeit || null,
        ende: v.ganztags ? null : v.ende || null,
        ganztags: !!v.ganztags,
        ort: v.ort || null,
        notiz: v.notiz || null,
        privat: !!v.privat,
        teilnehmer: v.teilnehmer || [],
        immobilie_id: v.immobilie_id || null,
        kontakt_id: v.kontakt_id || null,
        nachfassen: v.nachfassen !== false,
        erinnerung: v.erinnerung !== false,
        ersteller_id: v.ersteller_id || nutzerId,
        ersteller_name: v.ersteller_name || null,
        status: "aktiv",
        quelle: "portal",
        serie_id: serieId,
        serie_regel: regel,
        serie_index: i + 1,
      }));

      const { data: neu, error } = await db.from("termine").insert(zeilen).select("id, datum");
      if (error) throw error;
      return antwort({ ok: true, serie_id: serieId, anzahl: neu?.length || 0, erster: daten[0], letzter: daten[daten.length - 1] });
    }

    const serieId = String(body.serie_id || "").trim();
    if (!serieId) return antwort({ ok: false, fehler: "serie_id ist Pflicht." }, 400);

    // ------------------------------------------------------------- Uebertragen
    if (aktion === "uebertragen") {
      const limit = Math.min(Math.max(Number(body.limit) || 6, 1), 20);
      const heute = new Date().toISOString().slice(0, 10);
      let q = db.from("termine").select("id, datum, onoffice_id, immobilie_id, ort, ganztags, uhrzeit")
        .eq("serie_id", serieId).neq("status", "storniert").order("datum");
      if (body.ab_datum) q = q.gte("datum", String(body.ab_datum));
      if (body.modus !== "alle") q = q.is("onoffice_id", null);
      const { data: offen, error } = await q;
      if (error) throw error;

      const liste = (offen || []).slice(0, limit);
      let fertig = 0; const fehler: string[] = [];
      for (const t of liste) {
        const r = await ruf("onoffice-termin-schreiben", { termin_id: t.id });
        if (r?.ok) fertig++; else fehler.push(String(r?.fehler || "unbekannt"));
        // Fahrzeit nur fuer die naechsten Wochen — den Rest holt der Nachtlauf
        if (!t.ganztags && t.uhrzeit && (t.immobilie_id || String(t.ort || "").trim()) && t.datum <= tagPlus(heute, FAHRZEIT_HORIZONT)) {
          await ruf("termin-fahrzeit", { termin_id: t.id, speichern: true });
        }
      }
      return antwort({ ok: true, uebertragen: fertig, offen: Math.max(0, (offen || []).length - liste.length), fehler: fehler.slice(0, 3) });
    }

    // ----------------------------------------------------------- Aktualisieren
    if (aktion === "aktualisieren") {
      const ab = String(body.ab_datum || new Date().toISOString().slice(0, 10));
      const a = body.aenderungen || {};
      const erlaubt = ["titel", "art", "uhrzeit", "ende", "ganztags", "ort", "notiz", "privat", "teilnehmer", "immobilie_id", "kontakt_id", "nachfassen", "erinnerung"];
      const patch: any = {};
      for (const k of erlaubt) if (k in a) patch[k] = a[k];
      if (!Object.keys(patch).length) return antwort({ ok: false, fehler: "Nichts zu ändern." }, 400);
      patch.updated_at = new Date().toISOString();
      const { data: betroffen, error } = await db.from("termine").update(patch)
        .eq("serie_id", serieId).gte("datum", ab).neq("status", "storniert").is("fahrt_zu_termin_id", null)
        .select("id");
      if (error) throw error;
      return antwort({ ok: true, geaendert: betroffen?.length || 0 });
    }

    // ---------------------------------------------------------------- Loeschen
    if (aktion === "loeschen") {
      const ab = body.ab_datum ? String(body.ab_datum) : null;
      let q = db.from("termine").select("id, onoffice_id, datum").eq("serie_id", serieId).order("datum");
      if (ab) q = q.gte("datum", ab);
      const { data: zeilen, error } = await q;
      if (error) throw error;

      const limit = Math.min(Math.max(Number(body.limit) || 15, 1), 40);
      const liste = (zeilen || []).slice(0, limit);
      let weg = 0;
      for (const t of liste) {
        const { data: fahrten } = await db.from("termine").select("id, onoffice_id").eq("fahrt_zu_termin_id", t.id);
        for (const f of fahrten || []) {
          if (f.onoffice_id) await ruf("onoffice-termin-schreiben", { termin_id: f.id, aktion: "absagen" });
          await db.from("termine").delete().eq("id", f.id);
        }
        if (t.onoffice_id) await ruf("onoffice-termin-schreiben", { termin_id: t.id, aktion: "absagen" });
        await db.from("termine").delete().eq("id", t.id);
        weg++;
      }
      return antwort({ ok: true, geloescht: weg, offen: Math.max(0, (zeilen || []).length - liste.length) });
    }

    return antwort({ ok: false, fehler: `Unbekannte Aktion „${aktion}“.` }, 400);
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
