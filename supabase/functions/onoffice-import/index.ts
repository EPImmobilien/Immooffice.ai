// ============================================================================
// onoffice-import v13
// ----------------------------------------------------------------------------
// v13 (25.09.26, Stufe 83 / Auftrag 6): TITELBILD AUS ONOFFICE KOMMT ALS EXPOSÉ-TITEL AN.
//   - Das onOffice-Titelbild (Bildtyp "Titelbild") setzt immobilien.expose_titelbild_id, wenn dort noch nichts
//     steht und keine Handwahl hinterlegt ist (immobilie_titelbild_wahl.quelle = 'manuell'). Werbebilder
//     (gleiche Regel wie trg_immobilie_datei_werbebild) und ausgeschlossene Bilder werden nie Exposé-Titel.
//   - Titelbild-Wechsel auf ein schon importiertes Bild wird nachgezogen: Sortierung 0 (erstes Bild der
//     Galerie), Portal-Hauptbild folgt nur, wenn hauptbild_url leer ist oder selbst aus onOffice stammt
//     (gebrandete Portal-Titelbilder bleiben unangetastet).
//   - Dritte Warteschlange "Titelbild-Abgleich": je Lauf 1 Objekt in Vermarktung/reserviert, aeltester Stand,
//     nur Metadaten (kein Bild-Download, KEIN Loeschabgleich).
// v12 (Portal-Objekte bleiben Bild-Herr, 24.09.): Der Bilder-Modus bearbeitet nur noch Objekte mit
//   quelle "onoffice"; fuer Portal-Objekte ist das Portal die Bildquelle (Vorfall 393 Langendamm).
// v11 (Preis auf Anfrage, 19.09.): kaufpreis 0 gilt als KEIN Preis; Portal-Angebotspreis bleibt erhalten.
// v10 (Loesch-Gedaechtnis, 16.09.): im Portal geloeschte onOffice-Bilder kommen nicht zurueck
//   (immobilie_datei_geloescht, Zaehler gemerkt_geloescht).
// v9 (Grundstuecksdaten): grz, gfz, erschliessung, ... in immobilie_grundstueck (keine neuen Spalten in immobilien).
// v8 (Bilder-Vollabgleich): neue Bilder laden, Beschriftungen abgleichen, in onOffice geloeschte Bilder
//   entfernen (nur wenn onOffice Bilder liefert); Portal-eigene Uploads (onoffice_datei_id NULL) nie betroffen.
// v7 (Bilder-Nachkontrolle): junge Objekte (< 14 Tage) alle 2 Std. nachkontrollieren.
// v6 (Portal-Schutz): im Portal juengere Aenderungen werden im Modus "objekte" nicht ueberschrieben.
// v5 (Datums-Fix): "0000-00-00" -> null.  v4: Upsert in Bloecken.  v3: categories PFLICHT, elements ist ARRAY,
//   Bild-ID auf record.id.  HINWEIS: ON CONFLICT (onoffice_id) braucht einen VOLLEN Unique-Index.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const URL_OO = "https://api.onoffice.de/api/stable/api.php";
const BUCKET = "immobilie-dateien";
const BLOCK = 100;
const PORTAL_TOLERANZ_MS = 2 * 60 * 1000;
const NACHKONTROLLE_TAGE = 14;            // junge Objekte: so lange nach Anlage neu pruefen
const NACHKONTROLLE_ABSTAND_MS = 2 * 60 * 60 * 1000;   // fruehestens alle 2 Std. je Objekt

const BILD_KATEGORIEN = ["Titelbild", "Foto", "Grundriss", "Lageplan", "Epass_Skala"];
const ABGLEICH_ABSTAND_MS = 24 * 60 * 60 * 1000;   // v13: Titelbild-Abgleich je Objekt hoechstens taeglich
const ABGLEICH_JE_LAUF = 1;
const WERBEBILD_RE = /(sofort[-_ ]?download|kontaktbild|portal hauptbild|portal_hauptbild|infobild|vertriebsgebiet|portal_[0-9]_|immobilien-portal miete)/i;
const istWerbebild = (name: unknown, titel: unknown) => WERBEBILD_RE.test(String(name || "") + " " + String(titel || ""));

const OBJEKTTYPEN: Record<string, string[]> = {
  "Wohnung": ["Etagenwohnung", "Erdgeschosswohnung", "Dachgeschosswohnung", "Maisonette", "Penthouse", "Souterrainwohnung", "Loft", "Apartment"],
  "Haus": ["Einfamilienhaus", "Doppelhaushälfte", "Reihenhaus", "Reihenendhaus", "Mehrfamilienhaus", "Wohn- & Geschäftshaus", "Villa", "Stadthaus", "Bungalow", "Bauernhaus"],
  "Grundstück": [],
  "Gewerbe": [],
  "Sonstige": [],
};
const OBJEKTART: Record<string, string> = {
  haus: "Haus",
  wohnung: "Wohnung",
  grundstueck: "Grundstück",
  buero_praxen: "Gewerbe",
  einzelhandel: "Gewerbe",
  hallen_lager_prod: "Gewerbe",
  gastgewerbe: "Gewerbe",
  land_und_forstwirtschaft: "Grundstück",
  zinshaus_renditeobjekt: "Haus",
  sonstige: "Sonstige",
};

const ohneUmlaut = (s: string) => s.toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z]/g, "");

function typFinden(objektart: string, roh: unknown): string | null {
  const kandidat = String(roh || "").trim();
  if (!kandidat) return null;
  const liste = OBJEKTTYPEN[objektart] || [];
  const norm = ohneUmlaut(kandidat);
  return liste.find((t) => ohneUmlaut(t) === norm) ?? null;
}

async function sig(msg: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(s)));
}

async function bilderVonOnOffice(token: string, secret: string, estateIds: number[]) {
  const actionid = "urn:onoffice-de-ns:smart:2.5:smartml:action:get";
  const resourcetype = "estatepictures";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = await sig(timestamp + token + resourcetype + actionid, secret);
  const body = {
    token,
    request: {
      actions: [{
        actionid, resourceid: "", resourcetype, identifier: "", timestamp, hmac, hmac_version: "2",
        parameters: {
          estateids: estateIds,
          categories: BILD_KATEGORIEN,   // PFLICHT — ohne das: Fehler 139
          size: "2048x1536",
          language: "DEU",
        },
      }],
    },
  };
  const resp = await fetch(URL_OO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await resp.json();
  const a0 = json?.response?.results?.[0];
  const code = a0?.status?.errorcode ?? json?.status?.code;
  if (code && String(code) !== "0" && String(code) !== "200") {
    throw new Error(`onOffice ${code}: ${a0?.status?.message ?? ""}`);
  }
  return a0?.data?.records ?? [];
}

const zahl = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.,\-]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};
const ganz = (v: unknown) => { const n = zahl(v); return n === null ? null : Math.round(n); };
const jaNein = (v: unknown) => v === true || v === "1" || v === 1 || String(v).toLowerCase() === "true";
const txt = (v: unknown) => { const s = (v === null || v === undefined) ? "" : String(v).trim(); return s || null; };

// onOffice schickt leere Daten als "0000-00-00" (MySQL). Postgres kippt daran.
// Nur echte, plausible Daten durchlassen — alles andere wird null.
const datum = (v: unknown): string | null => {
  const s = txt(v);
  if (!s) return null;
  if (/^0{4}-0{2}-0{2}/.test(s)) return null;   // 0000-00-00
  if (/^0+$/.test(s.replace(/[-:. ]/g, ""))) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, j, mo, t] = m;
  if (Number(j) < 1900 || Number(mo) < 1 || Number(mo) > 12 || Number(t) < 1 || Number(t) > 31) return null;
  return `${j}-${mo}-${t}`;
};

function objektAbbilden(o: any, jetzt: string) {
  const e = o.roh || {};
  const miete = o.vermarktungsart === "miete";
  const archiviert = String(o.status_code) === "2" || o.aktiv === false;
  const art = OBJEKTART[String(o.objektart || "").toLowerCase()] || "Sonstige";

  let status: string;
  if (archiviert) status = "archiviert";
  else if (o.veroeffentlicht) status = "vermarktung";
  else status = "akquise";

  return {
    onoffice_id: o.onoffice_id,
    quelle: "onoffice",
    onoffice_synced_at: jetzt,
    bezeichnung: txt(o.titel) || [txt(o.strasse), txt(o.ort)].filter(Boolean).join(", ") || ("onOffice " + o.onoffice_id),
    immo_nr: txt(o.objektnr_extern) || txt(e.objektnr_intern),
    objekttitel: txt(o.titel),
    strasse: txt(o.strasse),
    hausnummer: txt(o.hausnummer),
    plz: txt(o.plz),
    ort: txt(o.ort),
    vertragsart: miete ? "vermietung" : "verkauf",
    objektart: art,
    objekttyp: typFinden(art, e.objekttyp),
    status,
    wohnflaeche: o.wohnflaeche,
    nutzflaeche: zahl(e.nutzflaeche),
    grundstueck: o.grundstueck,
    zimmer: o.zimmer,
    schlafzimmer: ganz(e.anzahl_schlafzimmer),
    badezimmer: ganz(e.anzahl_badezimmer),
    etage: txt(e.etage),
    etagen_gesamt: ganz(e.etagen_zahl) ?? ganz(e.anzahl_etagen),
    baujahr: o.baujahr,
    angebotspreis: miete ? null : (Number(o.kaufpreis) > 0 ? o.kaufpreis : null),
    kaltmiete: miete ? o.kaltmiete : null,
    nebenkosten: zahl(e.nebenkosten),
    heizkosten: zahl(e.heizkosten),
    // onOffice fuehrt in "kaution" mal die Anzahl Monatsmieten, mal einen
    // Betrag. Kleine Zahlen sind Monate und gehoeren nach kaution_monate,
    // damit das Portal den Betrag selbst rechnet (sonst stand im Expose
    // "Kaution: 3 EUR").
    kaution: (() => { const n = zahl(e.kaution); return n != null && n > 12 ? String(n) : null; })(),
    kaution_monate: (() => { const n = zahl(e.kaution); return n != null && n > 0 && n <= 12 ? n : null; })(),
    hausgeld: zahl(e.hausgeld),
    provision_aussen: txt(e.provision) || txt(e.aussen_courtage),
    provision_innen: txt(e.innencourtage) || txt(e.innen_courtage),
    verfuegbar_ab: datum(e.verfuegbar_ab) ?? datum(e.abdatum),
    vermietet: jaNein(e.vermietet),
    miete_ist: zahl(e.mieteinnahmen_ist),
    miete_soll: zahl(e.mieteinnahmen_soll),
    beschreibung_objekt: txt(e.objektbeschreibung),
    beschreibung_lage: txt(e.lage),
    beschreibung_ausstattung: txt(e.ausstatt_beschr),
    beschreibung_sonstiges: txt(e.sonstige_angaben),
    energieausweis_typ: txt(e.energieausweistyp),
    energie_kennwert: zahl(e.endenergiebedarf) ?? zahl(e.energieverbrauchskennwert),
    energie_klasse: txt(e.energieklasse) ?? txt(e.energyClass),
    energie_traeger: txt(e.befeuerung) ?? txt(e.energietraeger),
    energie_gueltig_bis: datum(e.energieausweis_gueltig_bis),
    heizungsart: txt(e.heizungsart),
    stellplatz_art: txt(e.stellplatzart),
    stellplatz_anzahl: ganz(e.anzahl_stellplaetze),
    updated_at: jetzt,
  };
}

// Grundstuecksdaten aus den onOffice-Rohfeldern: nur gefuellte Werte, damit
// Portal-Eintraege stehen bleiben, solange onOffice das Feld leer laesst.
function grundstueckAbbilden(o: any, jetzt: string): Record<string, unknown> | null {
  const e = o.roh || {};
  const w: Record<string, unknown> = {};
  const grz = txt(e.grz); if (grz && zahl(grz) !== 0) w.grz = grz;
  const gfz = txt(e.gfz); if (gfz && zahl(gfz) !== 0) w.gfz = gfz;
  const er = txt(e.erschliessung); if (er) w.erschliessung = er;
  const ek = zahl(e.erschliessungskosten); if (ek) w.erschliessungskosten = ek;
  const bn = txt(e.bebaubar_nach); if (bn) w.bebaubar_nach = bn;
  if (Array.isArray(e.bebaubar_mit) && e.bebaubar_mit.length) w.bebaubar_mit = e.bebaubar_mit.map((x: unknown) => String(x));
  else if (txt(e.bebaubar_mit)) w.bebaubar_mit = String(e.bebaubar_mit).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  const ta = zahl(e.teilbar_ab); if (ta) w.teilbar_ab = ta;
  if (!Object.keys(w).length) return null;
  w.quelle = "onoffice";
  w.updated_at = jetzt;
  return w;
}

function bildKategorie(typ: string): { kategorie: string; doktyp: string } {
  const t = (typ || "").toLowerCase();
  if (t.includes("grundriss")) return { kategorie: "grundriss", doktyp: "Grundriss" };
  if (t.includes("lageplan") || t.includes("karte")) return { kategorie: "lageplan", doktyp: "Lageplan" };
  if (t.includes("epass")) return { kategorie: "foto", doktyp: "Energieskala" };
  return { kategorie: "foto", doktyp: "Foto" };
}

// _web.jpg-Variante zu einem Storage-Pfad (Konvention aus bild-web-variante)
const webPfad = (p: string) => p.replace(/\.[a-z0-9]+$/i, "") + "_web.jpg";

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
    const modus = String(body.modus || "objekte");
    const jetzt = new Date().toISOString();

    // ---------------- Objekte: Spiegel -> CRM, in Bloecken ----------------
    if (modus === "objekte") {
      const { data: spiegel, error: sErr } = await db.from("onoffice_objekte").select("*");
      if (sErr) throw sErr;

      const { data: vorhanden } = await db.from("immobilien")
        .select("id, onoffice_id, onoffice_gesperrt, updated_at, onoffice_synced_at, angebotspreis").not("onoffice_id", "is", null);
      const bekannt = new Map((vorhanden || []).map((r: any) => [r.onoffice_id, r]));

      let gesperrt = 0, neu = 0, aktualisiert = 0, portalNeuer = 0;
      const portalNeuerNrn: string[] = [];
      const reihen: any[] = [];

      for (const o of (spiegel || [])) {
        const treffer: any = bekannt.get(o.onoffice_id);
        if (treffer?.onoffice_gesperrt) { gesperrt++; continue; }
        // Portal-Schutz: Objekt wurde im Portal NACH dem letzten onOffice-Abgleich
        // geaendert -> nicht ueberschreiben, bis die Aenderung nach onOffice
        // uebertragen wurde (modus=aktualisieren setzt onoffice_synced_at neu).
        if (treffer?.updated_at && treffer?.onoffice_synced_at) {
          const delta = new Date(treffer.updated_at).getTime() - new Date(treffer.onoffice_synced_at).getTime();
          if (delta > PORTAL_TOLERANZ_MS) { portalNeuer++; portalNeuerNrn.push(String(o.objektnr_extern || o.onoffice_id)); continue; }
        }
        const reihe: any = objektAbbilden(o, jetzt);
        // v11: onOffice "Kaufpreis auf Anfrage" (kaufpreis 0) -> internen Portalpreis behalten
        if (o.vermarktungsart !== "miete" && !(Number(o.kaufpreis) > 0) && treffer && Number(treffer.angebotspreis) > 0) {
          reihe.angebotspreis = treffer.angebotspreis;
        }
        if (!treffer) { reihe.ersteller_id = nutzer; neu++; } else { aktualisiert++; }
        reihen.push(reihe);
      }

      const fehler: string[] = [];
      let geschrieben = 0;
      for (let i = 0; i < reihen.length; i += BLOCK) {
        const teil = reihen.slice(i, i + BLOCK);
        const { error } = await db.from("immobilien").upsert(teil, { onConflict: "onoffice_id" });
        if (!error) { geschrieben += teil.length; continue; }
        // Block gescheitert -> Zeile fuer Zeile, damit ein einzelner Ausreisser
        // nicht 100 gute Objekte mitreisst, und wir sehen WELCHES Objekt klemmt.
        for (const reihe of teil) {
          const { error: e2 } = await db.from("immobilien").upsert(reihe, { onConflict: "onoffice_id" });
          if (e2) fehler.push(`${reihe.onoffice_id}: ${e2.message}`);
          else geschrieben++;
        }
      }

      // ---- Grundstuecksdaten in die eigene Tabelle (nur gefuellte onOffice-Werte) ----
      let grundstuecke = 0;
      const gsKandidaten: Array<{ onoffice_id: string; werte: Record<string, unknown> }> = [];
      for (const o of (spiegel || [])) {
        const treffer: any = bekannt.get(o.onoffice_id);
        if (treffer?.onoffice_gesperrt) continue;
        const w = grundstueckAbbilden(o, jetzt);
        if (w) gsKandidaten.push({ onoffice_id: o.onoffice_id, werte: w });
      }
      if (gsKandidaten.length) {
        const { data: ids } = await db.from("immobilien").select("id, onoffice_id")
          .in("onoffice_id", gsKandidaten.map((k) => k.onoffice_id));
        const idVon = new Map((ids || []).map((r: any) => [String(r.onoffice_id), r.id]));
        for (const k of gsKandidaten) {
          const immobilieId = idVon.get(String(k.onoffice_id));
          if (!immobilieId) continue;
          const { error: gErr } = await db.from("immobilie_grundstueck")
            .upsert({ immobilie_id: immobilieId, ...k.werte }, { onConflict: "immobilie_id" });
          if (gErr) fehler.push(`${k.onoffice_id} Grundstueck: ${gErr.message}`);
          else grundstuecke++;
        }
      }

      const { count: offen } = await db.from("immobilien")
        .select("id", { count: "exact", head: true })
        .not("onoffice_id", "is", null).eq("quelle", "onoffice").is("onoffice_bilder_am", null);

      return antwort({
        ok: fehler.length === 0, modus,
        neu, aktualisiert, gesperrt, portal_neuer: portalNeuer, portal_neuer_nrn: portalNeuerNrn.slice(0, 20), geschrieben,
        grundstuecke,
        fehler_anzahl: fehler.length, fehler: fehler.slice(0, 10), bilder_offen: offen ?? 0,
      });
    }

    // ---------------- Bilder ----------------
    if (modus === "bilder") {
      const token = Deno.env.get("ONOFFICE_TOKEN");
      const secret = Deno.env.get("ONOFFICE_SECRET");
      if (!token || !secret) throw new Error("ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.");

      const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 10);

      // 1) Warteschlange: Objekte, die noch NIE einen Bilder-Lauf hatten
      // v12: nur onOffice-stammende Objekte - Portal-Objekte sind selbst Bild-Herr
      const { data: nieGeladen } = await db.from("immobilien")
        .select("id, onoffice_id, hauptbild_url, expose_titelbild_id")
        .not("onoffice_id", "is", null)
        .eq("quelle", "onoffice")
        .is("onoffice_bilder_am", null)
        .limit(limit);

      // 2) Nachkontrolle: junge Objekte (Fotos kommen in onOffice oft erst
      //    Tage nach der Anlage) — fruehestens alle 2 Std. je Objekt.
      let nachkontrolle: any[] = [];
      const platz = limit - (nieGeladen?.length ?? 0);
      if (platz > 0) {
        const jungAb = new Date(Date.now() - NACHKONTROLLE_TAGE * 24 * 60 * 60 * 1000).toISOString();
        const letzterLaufVor = new Date(Date.now() - NACHKONTROLLE_ABSTAND_MS).toISOString();
        const { data: nk } = await db.from("immobilien")
          .select("id, onoffice_id, hauptbild_url, expose_titelbild_id")
          .not("onoffice_id", "is", null)
          .eq("quelle", "onoffice")
          .gte("created_at", jungAb)
          .lt("onoffice_bilder_am", letzterLaufVor)
          .order("onoffice_bilder_am", { ascending: true })
          .limit(platz);
        nachkontrolle = nk || [];
      }

      const offen: any[] = [...(nieGeladen || []), ...nachkontrolle];
      // v13: Titelbild-Abgleich fuer aeltere Objekte in Vermarktung/reserviert - nur Metadaten (kein Laden, kein Loeschen)
      const nurAbgleichIds = new Set<string>();
      if (offen.length < limit) {
        const abgleichVor = new Date(Date.now() - ABGLEICH_ABSTAND_MS).toISOString();
        const { data: ab } = await db.from("immobilien")
          .select("id, onoffice_id, hauptbild_url, expose_titelbild_id")
          .not("onoffice_id", "is", null).eq("quelle", "onoffice")
          .in("status", ["vermarktung", "reserviert"])
          .lt("onoffice_bilder_am", abgleichVor)
          .order("onoffice_bilder_am", { ascending: true })
          .limit(Math.min(ABGLEICH_JE_LAUF, limit - offen.length));
        for (const o of (ab || [])) { if (!offen.some((x: any) => x.id === o.id)) { offen.push(o); nurAbgleichIds.add(o.id); } }
      }
      if (!offen.length) return antwort({ ok: true, modus, verarbeitet: 0, bilder_geladen: 0, nachkontrolliert: 0, geloescht: 0, titel_aktualisiert: 0, gemerkt_geloescht: 0, rest: 0, fertig: true });

      const ids = offen.map((r: any) => Number(r.onoffice_id)).filter((n) => !isNaN(n));
      const records = await bilderVonOnOffice(token, secret, ids);

      // v10: Loesch-Gedaechtnis — im Portal geloeschte onOffice-Bilder nicht erneut anlegen
      const { data: gemerkt } = await db.from("immobilie_datei_geloescht")
        .select("immobilie_id, onoffice_datei_id")
        .in("immobilie_id", offen.map((r: any) => r.id));
      const geloeschtJe = new Map<string, Set<string>>();
      for (const g of (gemerkt || [])) {
        if (!geloeschtJe.has(g.immobilie_id)) geloeschtJe.set(g.immobilie_id, new Set());
        geloeschtJe.get(g.immobilie_id)!.add(String(g.onoffice_datei_id));
      }

      const proObjekt = new Map<string, any[]>();
      for (const r of records) {
        const el = Array.isArray(r.elements) ? r.elements[0] : r.elements;
        if (!el) continue;
        const eid = String(el.estateid ?? el.estateMainId ?? "");
        if (!eid) continue;
        if (!proObjekt.has(eid)) proObjekt.set(eid, []);
        proObjekt.get(eid)!.push({ id: String(r.id ?? ""), el });
      }

      let geladen = 0, uebersprungen = 0, ohneBilder = 0, geloescht = 0, titelAktualisiert = 0, gemerktGeloescht = 0;
      let titelSync = 0, exposeTitelGesetzt = 0;   // v13
      const fehler: string[] = [];

      for (const objekt of offen) {
        const bilder = proObjekt.get(String(objekt.onoffice_id)) || [];
        if (!bilder.length) ohneBilder++;
        const imPortalGeloescht = geloeschtJe.get(objekt.id) || new Set<string>();
        // v13: Titelbild-Merker (Handwahl gewinnt immer) und Sammelstellen fuer den Lauf
        const nurAbgleich = nurAbgleichIds.has(objekt.id);
        const { data: wahl } = await db.from("immobilie_titelbild_wahl").select("quelle").eq("immobilie_id", objekt.id).maybeSingle();
        const titelManuell = wahl?.quelle === "manuell";
        let exposeTitelId: string | null = null;
        let titelBildOeffUrl: string | null = null;
        let neuesTitelBildId: string | null = null;

        // Alle onOffice-stammenden Portal-Dateien dieses Objekts (Portal-eigene
        // Uploads mit onoffice_datei_id NULL bleiben grundsaetzlich unberuehrt).
        const { data: da } = await db.from("immobilie_datei")
          .select("id, onoffice_datei_id, titel, storage_path, name, kategorie, sortierung, expose_ausschliessen")
          .eq("immobilie_id", objekt.id).not("onoffice_datei_id", "is", null);
        const vorhandene = new Map((da || []).map((d: any) => [String(d.onoffice_datei_id), d]));
        const schonDa = new Set(vorhandene.keys());

        bilder.sort((a, b) => {
          const at = /titel/i.test(String(a.el.type || "")) ? 0 : 1;
          const bt = /titel/i.test(String(b.el.type || "")) ? 0 : 1;
          return at - bt;
        });

        let hauptbild: string | null = null;
        let sortierung = schonDa.size;   // neue Bilder hinter die vorhandenen
        const neueDateien: any[] = [];
        const inOnOffice = new Set<string>();

        for (const b of bilder) {
          const el = b.el;
          const url = el.url ?? "";
          const bildId = b.id || String(url).split("/").pop() || "";
          if (!url || !bildId) { uebersprungen++; continue; }
          inOnOffice.add(bildId);

          if (schonDa.has(bildId)) {
            // Beschriftungs-Abgleich: onOffice fuehrt die Bildunterschrift
            // (auch Loeschung der Beschriftung wird nachgezogen).
            const alt: any = vorhandene.get(bildId);
            const neuerTitel = txt(el.title) || txt(el.text);
            if ((neuerTitel ?? null) !== (alt?.titel ?? null)) {
              const { error: tErr } = await db.from("immobilie_datei").update({ titel: neuerTitel }).eq("id", alt.id);
              if (tErr) fehler.push(objekt.onoffice_id + ": Titel " + tErr.message);
              else titelAktualisiert++;
            }
            // v13: Titelbild-Flag aus onOffice nachziehen (Sortierung 0, Portal-Hauptbild, Exposé-Titel)
            if (/titel/i.test(String(el.type || "")) && alt && alt.kategorie === "foto") {
              if (Number(alt.sortierung) !== 0) {
                const { error: sErr } = await db.from("immobilie_datei").update({ sortierung: 0 }).eq("id", alt.id);
                if (sErr) fehler.push(objekt.onoffice_id + ": Sortierung " + sErr.message); else titelSync++;
              }
              if (alt.storage_path) titelBildOeffUrl = db.storage.from(BUCKET).getPublicUrl(alt.storage_path).data?.publicUrl ?? null;
              if (!istWerbebild(alt.name, alt.titel) && alt.expose_ausschliessen !== true) exposeTitelId = alt.id;
            }
            uebersprungen++;
            continue;
          }

          // v13: reiner Abgleich -> keine neuen Bilder laden
          if (nurAbgleich) { uebersprungen++; continue; }

          // v10: im Portal bewusst geloescht -> nicht wieder anlegen
          if (imPortalGeloescht.has(bildId)) { gemerktGeloescht++; continue; }

          const typ = String(el.type ?? "");
          const { kategorie, doktyp } = bildKategorie(typ);
          const istTitel = /titel/i.test(typ);
          if (istTitel) neuesTitelBildId = bildId;   // v13

          try {
            const resp = await fetch(url);
            if (!resp.ok) { fehler.push(objekt.onoffice_id + ": HTTP " + resp.status); continue; }
            const bytes = new Uint8Array(await resp.arrayBuffer());
            const mime = resp.headers.get("content-type") || "image/jpeg";
            const endung = mime.includes("png") ? "png" : "jpg";
            const pfad = `immobilien/${objekt.id}/onoffice/${bildId}.${endung}`;

            const { error: upErr } = await db.storage.from(BUCKET).upload(pfad, bytes, { contentType: mime, upsert: true });
            if (upErr) { fehler.push(objekt.onoffice_id + ": " + upErr.message); continue; }

            const { data: oeff } = db.storage.from(BUCKET).getPublicUrl(pfad);

            neueDateien.push({
              immobilie_id: objekt.id,
              name: (txt(el.originalname) || txt(el.title) || bildId + "." + endung),
              titel: txt(el.title) || txt(el.text),
              doktyp,
              kategorie,
              mime_type: mime,
              size_bytes: bytes.length,
              speicher_typ: "supabase",
              storage_path: pfad,
              external_url: url,
              quelle: "onoffice",
              onoffice_datei_id: bildId,
              sortierung: istTitel ? 0 : ++sortierung,
              oeffentlich: true,
              ersteller_id: nutzer,
            });

            // hauptbild_url nur setzen, wenn ein echtes Titelbild kommt ODER
            // das Objekt noch gar kein Hauptbild hat.
            // v13: ein gebrandetes Portal-Hauptbild (kein onOffice-Pfad) bleibt stehen
            const hauptbildFrei = !objekt.hauptbild_url || String(objekt.hauptbild_url).includes("/onoffice/");
            if ((istTitel && hauptbildFrei) || (!objekt.hauptbild_url && !hauptbild && kategorie === "foto")) hauptbild = oeff?.publicUrl ?? null;
            geladen++;
          } catch (e) {
            fehler.push(objekt.onoffice_id + ": " + (e instanceof Error ? e.message : String(e)));
          }
        }

        // Loeschungs-Abgleich: onOffice-Bilder, die dort nicht mehr existieren,
        // fliegen auch aus dem Portal (Zeile + Storage + _web-Variante).
        // SICHERUNG: nur wenn onOffice ueberhaupt Bilder geliefert hat — eine
        // leere Antwort raeumt nicht das ganze Objekt leer.
        let hauptbildKaputt = false;
        if (bilder.length && !nurAbgleich) {   // v13: reiner Abgleich loescht nie
          const weg = [...vorhandene.values()].filter((d: any) => !inOnOffice.has(String(d.onoffice_datei_id)));
          if (weg.length) {
            const pfade = weg.flatMap((d: any) => d.storage_path ? [d.storage_path, webPfad(d.storage_path)] : []);
            if (pfade.length) {
              const { error: rmErr } = await db.storage.from(BUCKET).remove(pfade);
              if (rmErr) fehler.push(objekt.onoffice_id + ": Storage " + rmErr.message);
            }
            const { error: delErr } = await db.from("immobilie_datei").delete().in("id", weg.map((d: any) => d.id));
            if (delErr) fehler.push(objekt.onoffice_id + ": Loeschen " + delErr.message);
            else geloescht += weg.length;
            if (objekt.hauptbild_url && weg.some((d: any) => d.storage_path && String(objekt.hauptbild_url).includes(d.storage_path))) {
              hauptbildKaputt = true;
            }
          }
        }

        if (neueDateien.length) {
          const { data: eingefuegt, error: insErr } = await db.from("immobilie_datei").insert(neueDateien).select("id, onoffice_datei_id, name, titel, expose_ausschliessen");
          if (insErr) fehler.push(objekt.onoffice_id + ": " + insErr.message);
          // v13: neues onOffice-Titelbild -> Exposé-Titel (nie Werbebilder, nie ausgeschlossene Bilder)
          const neuTitel = neuesTitelBildId ? (eingefuegt || []).find((d: any) => String(d.onoffice_datei_id) === neuesTitelBildId) : null;
          if (neuTitel && !istWerbebild(neuTitel.name, neuTitel.titel) && neuTitel.expose_ausschliessen !== true) exposeTitelId = neuTitel.id;
        }
        // v13: Titelbild-Wechsel auf ein vorhandenes Bild -> Portal-Hauptbild folgt (nur leer oder selbst aus onOffice)
        if (!hauptbild && titelBildOeffUrl && objekt.hauptbild_url !== titelBildOeffUrl && (!objekt.hauptbild_url || String(objekt.hauptbild_url).includes("/onoffice/"))) { hauptbild = titelBildOeffUrl; titelSync++; }
        // v13: Exposé-Titel nur fuellen, wenn leer und keine Handwahl
        const exposeTitelSetzen = !!exposeTitelId && !titelManuell && !objekt.expose_titelbild_id;
        if (exposeTitelSetzen) {
          exposeTitelGesetzt++;
          await db.from("immobilie_titelbild_wahl").upsert({ immobilie_id: objekt.id, datei_id: exposeTitelId, quelle: "onoffice", gesetzt_am: jetzt }, { onConflict: "immobilie_id" });
        }

        // Hauptbild reparieren, wenn es auf ein geloeschtes Bild zeigte und kein
        // neues Titelbild gekommen ist: erstes verbliebenes Foto nach Sortierung.
        let hauptbildNullen = false;
        if (hauptbildKaputt && !hauptbild) {
          const { data: ersatz } = await db.from("immobilie_datei")
            .select("storage_path").eq("immobilie_id", objekt.id).eq("kategorie", "foto")
            .not("storage_path", "is", null)
            .order("sortierung", { ascending: true }).limit(1).maybeSingle();
          if (ersatz?.storage_path) {
            hauptbild = db.storage.from(BUCKET).getPublicUrl(ersatz.storage_path).data?.publicUrl ?? null;
          } else {
            hauptbildNullen = true;
          }
        }

        await db.from("immobilien").update({
          onoffice_bilder_am: jetzt,
          ...(hauptbild ? { hauptbild_url: hauptbild } : {}),
          ...(hauptbildNullen ? { hauptbild_url: null } : {}),
          ...(exposeTitelSetzen ? { expose_titelbild_id: exposeTitelId } : {}),
        }).eq("id", objekt.id);
      }

      const { count: rest } = await db.from("immobilien")
        .select("id", { count: "exact", head: true })
        .not("onoffice_id", "is", null).eq("quelle", "onoffice").is("onoffice_bilder_am", null);

      return antwort({
        ok: true, modus, verarbeitet: offen.length, bilder_geladen: geladen,
        nachkontrolliert: nachkontrolle.length,
        geloescht, titel_aktualisiert: titelAktualisiert, gemerkt_geloescht: gemerktGeloescht,
        titel_sync: titelSync, expose_titel_gesetzt: exposeTitelGesetzt, abgleich: nurAbgleichIds.size,
        uebersprungen, ohne_bilder: ohneBilder, rest: rest ?? 0, fertig: (rest ?? 0) === 0,
        fehler: fehler.slice(0, 10),
      });
    }

    throw new Error("Unbekannter Modus: " + modus);
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
