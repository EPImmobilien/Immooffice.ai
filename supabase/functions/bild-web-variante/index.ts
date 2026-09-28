// ============================================================================
// bild-web-variante v2 — schlanke Web-Fassung zu Objektbildern
// ============================================================================
// Warum: expose-pdf-erzeugen skalierte jedes Bild ueber den Supabase-
// Transform-Endpunkt (100 Origin-Bilder/Monat frei, danach 5 $ je 1.000).
// Hier wird stattdessen lokal mit imagescript skaliert — null Transformationen.
//
// Ablage:  <storage_path ohne Endung>_web.jpg   (max. 1600 px lange Kante)
//
// WICHTIG — gezielt, nicht pauschal:
// Es liegen ~5.700 Bilder an 376 Objekten, aber nur eine Handvoll Objekte
// bekommt je ein Expose (Rest = onOffice-Archiv). Ein Rundumschlag waere
// verschwendete Rechenzeit und verschwendeter Speicher. Deshalb ist der
// Standard "nur relevante Objekte".
//
// Modi:
//   { datei_id: "<uuid>" }         -> eine Datei (Portal ruft das nach Upload)
//   { immobilie_id: "<uuid>" }     -> alle Bilder eines Objekts
//   { batch: true }                -> relevante Objekte: Status vermarktung/
//                                     reserviert ODER schon mal Expose erzeugt
//   { batch: true, alle: true }    -> wirklich alles (bewusst zu setzen)
//   ... jeweils optional: limit (1-25, Standard 10), neu: true (ueberschreiben)
// Antwort: rest > 0 -> erneut aufrufen.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BUCKET = "immobilie-dateien";
const MAX_KANTE = 1600;
const QUALITAET = 78;
const KATEGORIEN = ["foto", "grundriss", "lageplan"];

const ok = (o: any) => new Response(JSON.stringify({ ok: true, ...o }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
const err = (s: number, m: string) => new Response(JSON.stringify({ ok: false, fehler: m }), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function webPfad(storagePath: string): string {
  return String(storagePath).replace(/\.[^./]+$/, "") + "_web.jpg";
}

async function existiert(admin: any, pfad: string): Promise<boolean> {
  const i = pfad.lastIndexOf("/");
  const ordner = i > 0 ? pfad.slice(0, i) : "";
  const name = i > 0 ? pfad.slice(i + 1) : pfad;
  const { data } = await admin.storage.from(BUCKET).list(ordner, { limit: 100, search: name });
  return !!(data || []).some((f: any) => f.name === name);
}

// Original laden, lokal skalieren, als JPEG zurueckgeben. Kein Transform-Endpunkt.
async function webFassungBauen(admin: any, storagePath: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error("Original nicht ladbar: " + (error?.message || storagePath));
  const roh = new Uint8Array(await data.arrayBuffer());

  let bild = await Image.decode(roh);
  if (Math.max(bild.width, bild.height) > MAX_KANTE) {
    if (bild.width >= bild.height) bild = bild.resize(MAX_KANTE, Image.RESIZE_AUTO);
    else bild = bild.resize(Image.RESIZE_AUTO, MAX_KANTE);
  }

  // JPEG kennt keine Transparenz — transparente Flaechen (typisch bei
  // Grundriss-PNGs) wuerden sonst schwarz. Deshalb auf Weiss legen.
  const grund = new Image(bild.width, bild.height);
  grund.fill(Image.rgbaToColor(255, 255, 255, 255));
  grund.composite(bild, 0, 0);

  return await grund.encodeJPEG(QUALITAET);
}

async function eineDatei(admin: any, d: any, neu: boolean) {
  const ziel = webPfad(d.storage_path);
  if (!neu && await existiert(admin, ziel)) return { status: "vorhanden", pfad: ziel };
  const jpg = await webFassungBauen(admin, d.storage_path);
  const { error } = await admin.storage.from(BUCKET).upload(ziel, jpg, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error("Upload: " + error.message);
  return { status: "erzeugt", pfad: ziel, kb: Math.round(jpg.length / 1024) };
}

// Objekte, fuer die eine Web-Fassung sich lohnt.
async function relevanteObjekte(admin: any): Promise<string[]> {
  const ids = new Set<string>();
  const { data: aktiv } = await admin.from("immobilien").select("id")
    .in("status", ["vermarktung", "reserviert"]);
  for (const o of aktiv || []) ids.add(o.id);
  const { data: mitExpose } = await admin.from("immobilie_datei").select("immobilie_id")
    .eq("quelle", "expose_generator").limit(2000);
  for (const d of mitExpose || []) if (d.immobilie_id) ids.add(d.immobilie_id);
  return [...ids];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await admin.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) return err(403, "Keine Berechtigung.");
      }
    }

    const body = await req.json().catch(() => ({}));
    const neu = !!body.neu;
    const limit = Math.max(1, Math.min(25, Number(body.limit) || 10));

    // ---- Einzelne Datei (Portal, direkt nach dem Upload) ----
    if (body.datei_id) {
      const { data: d, error } = await admin.from("immobilie_datei")
        .select("id, storage_path, speicher_typ, mime_type")
        .eq("id", body.datei_id).maybeSingle();
      if (error) throw error;
      if (!d) return err(404, "Datei nicht gefunden.");
      if (d.speicher_typ !== "supabase" || !String(d.mime_type || "").startsWith("image/")) {
        return ok({ status: "uebersprungen", grund: "kein Supabase-Bild" });
      }
      return ok(await eineDatei(admin, d, neu));
    }

    // ---- Auswahl bestimmen ----
    let q = admin.from("immobilie_datei")
      .select("id, storage_path, name, immobilie_id")
      .in("kategorie", KATEGORIEN)
      .eq("speicher_typ", "supabase")
      .like("mime_type", "image/%")
      .not("storage_path", "is", null);

    let umfang = "alle";
    if (body.immobilie_id) {
      q = q.eq("immobilie_id", body.immobilie_id);
      umfang = "objekt";
    } else if (!body.alle) {
      const ids = await relevanteObjekte(admin);
      if (!ids.length) return ok({ gesamt: 0, erzeugt: 0, vorhanden: 0, rest: 0, hinweis: "Keine relevanten Objekte." });
      q = q.in("immobilie_id", ids);
      umfang = "relevant (" + ids.length + " Objekte)";
    }

    const { data: alle, error: qErr } = await q.order("created_at", { ascending: true }).limit(3000);
    if (qErr) throw qErr;

    const kandidaten = (alle || []).filter((d: any) => !/_web\.jpg$/i.test(d.storage_path || ""));

    let erzeugt = 0, vorhanden = 0, offen = 0;
    const fehler: string[] = [];
    for (const d of kandidaten) {
      if (erzeugt >= limit) { offen++; continue; }
      try {
        const r = await eineDatei(admin, d, neu);
        if (r.status === "erzeugt") erzeugt++; else vorhanden++;
      } catch (e) {
        fehler.push((d.name || d.id) + ": " + (e instanceof Error ? e.message : String(e)));
      }
    }

    return ok({
      umfang, gesamt: kandidaten.length,
      erzeugt, vorhanden, rest: offen,
      fehler: fehler.slice(0, 10),
      hinweis: offen > 0 ? "Noch " + offen + " offen — erneut aufrufen." : "Fertig, alle Web-Fassungen vorhanden.",
    });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
});
