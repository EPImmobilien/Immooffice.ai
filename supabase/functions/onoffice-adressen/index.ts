// ============================================================================
// onoffice-adressen v4 — Adressen aus onOffice ins Adressbuch
// ----------------------------------------------------------------------------
// Modus "sync":     address -> onoffice_adressen (Roh-Spiegel, seitenweise 100)
//                   NEU v4: body.letzte = N liest nur die N NEUESTEN Adressen
//                   (Offset = Gesamtzahl - N). Vorher deckten die Nachtjobs nur
//                   Offset 0..3999 ab — onOffice hat inzwischen >4000 Adressen,
//                   neue Interessenten (ab 06.09.2026) kamen nicht mehr an.
// Modus "arten":    liefert die vorkommenden ArtDaten-Werte
// Modus "kontakte": Spiegel -> kontakte, idempotent ueber onoffice_id
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const URL_OO = "https://api.onoffice.de/api/stable/api.php";
const READ = "urn:onoffice-de-ns:smart:2.5:smartml:action:read";
const SEITE = 100;
const BLOCK = 100;
const DB_SEITE = 1000;

const FELDER = [
  "Anrede", "Titel", "Vorname", "Name", "Zusatz1", "Briefanrede",
  "Email", "Telefon1", "Telefon2", "Strasse", "Plz", "Ort", "Land",
  "ArtDaten", "Status", "Geburtsdatum", "Bemerkung", "HerkunftKontakt",
  "KdNr", "Benutzer", "modified", "DSGVOStatus",
];

const ABBILDUNG: Record<string, string> = {
  "Interessent Kauf": "interessent",
  "Interessent Miete": "interessent",
  "Investor": "interessent",
  "Exposé-Sammler": "interessent",
  "Eigentümer": "eigentuemer",
  "Makler": "dienstleister",
  "Kooperationspartner": "dienstleister",
  "Kunde": "sonstiges",
  "Premiumkunde": "sonstiges",
};
const AUSSCHLUSS = ["Systembenutzer"];
const STANDARD_ROLLE = "sonstiges";

async function sig(msg: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(s)));
}

async function lesen(token: string, secret: string, offset: number, limit: number) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = await sig(timestamp + token + "address" + READ, secret);
  const body = {
    token,
    request: { actions: [{ actionid: READ, resourceid: "", resourcetype: "address", identifier: "", timestamp, hmac, hmac_version: "2",
      parameters: { data: FELDER, listlimit: limit, listoffset: offset } }] },
  };
  const resp = await fetch(URL_OO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await resp.json();
  const a0 = json?.response?.results?.[0];
  const code = a0?.status?.errorcode ?? json?.status?.code;
  if (code && String(code) !== "0") throw new Error(`onOffice ${code}: ${a0?.status?.message ?? ""}`);
  return { records: a0?.data?.records ?? [], gesamt: a0?.data?.meta?.cntabsolute ?? null };
}

const txt = (v: unknown) => { const s = (v === null || v === undefined) ? "" : String(v).trim(); return s || null; };
const arten = (v: unknown) => String(v || "").split("|").map(t => t.trim()).filter(Boolean);

async function alleZeilen(db: any, tabelle: string, spalten: string, filter?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let von = 0; ; von += DB_SEITE) {
    let q = db.from(tabelle).select(spalten).range(von, von + DB_SEITE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(tabelle + ": " + error.message);
    out.push(...(data || []));
    if (!data || data.length < DB_SEITE) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let nutzer: string | null = null;
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) throw new Error("Keine Berechtigung.");
        nutzer = u.user.id;
      }
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const modus = String(body.modus || "sync");

    if (modus === "sync") {
      const token = Deno.env.get("ONOFFICE_TOKEN")!;
      const secret = Deno.env.get("ONOFFICE_SECRET")!;
      let offset = Number(body.offset) || 0;
      let maxSeiten = Math.min(Math.max(Number(body.seiten) || 10, 1), 20);
      // v4: nur die neuesten N Adressen (Offset am Ende der Liste)
      const letzte = Number(body.letzte) || 0;
      if (letzte > 0) {
        const { gesamt: g } = await lesen(token, secret, 0, 1);
        const total = Number(g) || 0;
        offset = Math.max(0, total - letzte);
        maxSeiten = Math.ceil(letzte / SEITE) + 1;
      }

      let gelesen = 0, gesamt: number | null = null, seiten = 0;
      const jetzt = new Date().toISOString();

      while (seiten < maxSeiten) {
        const { records, gesamt: g } = await lesen(token, secret, offset, SEITE);
        if (gesamt === null) gesamt = g;
        if (!records.length) break;

        const reihen = records.map((r: any) => {
          const e = r.elements || {};
          return {
            onoffice_id: String(r.id ?? e.id),
            kdnr: txt(e.KdNr), anrede: txt(e.Anrede), titel: txt(e.Titel),
            vorname: txt(e.Vorname), nachname: txt(e.Name), zusatz1: txt(e.Zusatz1),
            email: txt(e.Email), telefon1: txt(e.Telefon1), telefon2: txt(e.Telefon2),
            strasse: txt(e.Strasse), plz: txt(e.Plz), ort: txt(e.Ort), land: txt(e.Land),
            art_daten: txt(e.ArtDaten), status: txt(e.Status),
            bemerkung: txt(e.Bemerkung), herkunft: txt(e.HerkunftKontakt), dsgvo: txt(e.DSGVOStatus),
            roh: e, synced_at: jetzt, updated_at: jetzt,
          };
        });

        for (let i = 0; i < reihen.length; i += BLOCK) {
          const { error } = await db.from("onoffice_adressen")
            .upsert(reihen.slice(i, i + BLOCK), { onConflict: "onoffice_id" });
          if (error) throw new Error("Upsert: " + error.message);
        }

        gelesen += records.length;
        offset += SEITE;
        seiten++;
        if (records.length < SEITE) break;
        if (gesamt !== null && offset >= gesamt) break;
      }

      const { count: imSpiegel } = await db.from("onoffice_adressen").select("onoffice_id", { count: "exact", head: true });
      return antwort({ ok: true, modus, gelesen, offset, gesamt, letzte: letzte || undefined, im_spiegel: imSpiegel ?? 0,
                       fertig: gesamt !== null && offset >= gesamt });
    }

    if (modus === "arten") {
      const data = await alleZeilen(db, "onoffice_adressen", "art_daten");
      const zaehler: Record<string, number> = {};
      for (const r of data) {
        const teile = arten((r as any).art_daten);
        if (!teile.length) { zaehler["(ohne Art)"] = (zaehler["(ohne Art)"] || 0) + 1; continue; }
        for (const t of teile) zaehler[t] = (zaehler[t] || 0) + 1;
      }
      return antwort({ ok: true, modus, arten: Object.entries(zaehler).sort((a, b) => b[1] - a[1]) });
    }

    if (modus === "kontakte") {
      const adressen = await alleZeilen(db, "onoffice_adressen", "*");
      const vorhanden = await alleZeilen(db, "kontakte", "onoffice_id", (q: any) => q.not("onoffice_id", "is", null));
      const bekannt = new Set(vorhanden.map((k: any) => String(k.onoffice_id)));

      const reihen: any[] = [];
      let ausgeschlossen = 0, ohneNamen = 0;

      for (const a of adressen) {
        const art = arten((a as any).art_daten);
        if (art.some(t => AUSSCHLUSS.includes(t))) { ausgeschlossen++; continue; }

        const nachname = txt((a as any).nachname);
        const firma = txt((a as any).zusatz1);
        if (!nachname && !firma) { ohneNamen++; continue; }

        const rollen = Array.from(new Set(art.map(t => ABBILDUNG[t]).filter(Boolean)));
        if (!rollen.length) rollen.push(STANDARD_ROLLE);

        const vermarktung: string[] = [];
        if (art.includes("Interessent Kauf")) vermarktung.push("kauf");
        if (art.includes("Interessent Miete")) vermarktung.push("miete");
        const suchProfil = vermarktung.length
          ? { vermarktungsart: vermarktung, herkunft: txt((a as any).herkunft) }
          : null;

        reihen.push({
          onoffice_id: (a as any).onoffice_id,
          anrede: txt((a as any).anrede),
          vorname: txt((a as any).vorname),
          nachname, firma, rollen,
          email: txt((a as any).email),
          telefon: txt((a as any).telefon1),
          mobil: txt((a as any).telefon2),
          strasse: txt((a as any).strasse),
          plz: txt((a as any).plz),
          ort: txt((a as any).ort),
          land: txt((a as any).land) || "Deutschland",
          notiz: txt((a as any).bemerkung),
          such_profil: suchProfil,
          quelle: "onoffice",
          aktiv: true,
          ersteller_id: nutzer,
        });
      }

      let neu = 0, aktualisiert = 0;
      const fehler: string[] = [];
      for (let i = 0; i < reihen.length; i += BLOCK) {
        const teil = reihen.slice(i, i + BLOCK);
        const { error } = await db.from("kontakte").upsert(teil, { onConflict: "onoffice_id" });
        if (error) {
          for (const r of teil) {
            const { error: e2 } = await db.from("kontakte").upsert(r, { onConflict: "onoffice_id" });
            if (e2) fehler.push(`${r.onoffice_id}: ${e2.message}`);
            else bekannt.has(String(r.onoffice_id)) ? aktualisiert++ : neu++;
          }
          continue;
        }
        for (const r of teil) bekannt.has(String(r.onoffice_id)) ? aktualisiert++ : neu++;
      }

      const { count: gesamt } = await db.from("kontakte").select("id", { count: "exact", head: true });
      return antwort({ ok: fehler.length === 0, modus, spiegel: adressen.length, neu, aktualisiert,
                       ausgeschlossen, ohne_namen: ohneNamen,
                       kontakte_gesamt: gesamt ?? 0,
                       fehler_anzahl: fehler.length, fehler: fehler.slice(0, 5) });
    }

    throw new Error("Unbekannter Modus: " + modus);
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
