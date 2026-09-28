// ============================================================================
// onoffice-objekt-anlegen v8 (tabellengetrieben)
//   - v8 (Energieausweis ohne Pflicht, 20.09.): Steht im Portal energieausweis_typ
//     "Nicht erforderlich (...)" (GEG-Ausnahme, Stufe 56), geht der onOffice-
//     Auswahlwert "es besteht keine Pflicht!" nach onOffice.
//   - v7 (Preis auf Anfrage, 19.09.): Steht das Objekt in onOffice auf "Kaufpreis auf
//     Anfrage" (Spiegel onoffice_objekte.kaufpreis 0), schreibt Modus "aktualisieren"
//     den internen Angebotspreis NICHT nach onOffice. Der Portalpreis ist nur fuer das
//     Expose gedacht (Stufe 52); die Portale bleiben "auf Anfrage". Antwort: preis_auf_anfrage.
//   - v6: NEU: befeuerung, unterkellert, zustand (über resolve) und
//     wintergarten (b01) — sobald in der Objektmaske gepflegt.
//   - v5: autoExpose="1"; v4: land="DEU", terrasse aus anzahl_terrassen,
//     sonstige_angaben + Courtagepassus.
//   - v3: interner Schlüssel (body.intern_key) für serverseitige Aufrufe.
//   - Auswahl-Felder → onOffice-Schlüssel (onoffice_feld_werte).
//   - Modus "aktualisieren": schreibt an ein BEREITS verknüpftes Objekt.
//   - Fehler-141-Schutz: Kern-Create + isolierte Anreicherung + Lernspeicher.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const URL_OO = "https://api.onoffice.de/api/stable/api.php";
const RT = "estate";
const A_CREATE = "urn:onoffice-de-ns:smart:2.5:smartml:action:create";
const A_MODIFY = "urn:onoffice-de-ns:smart:2.5:smartml:action:modify";
const BLOCK = 15;
const CORE_KEYS = ["objektart", "vermarktungsart", "objekttitel", "kaufpreis", "kaltmiete"];
const INTERN_KEY = "rL0UuzuxgMmxCEgDJWYur6kz";

// Courtagepassus / Exposé-Hinweise für die Sonstigen Angaben
const PASSUS_PROVISION_KAUF = "Die Käufer-Provision beträgt 3,57% vom Kaufpreis inkl. MwSt. Die Käufer-Provision ist verdient und fällig mit notarieller Beurkundung. Der Immobilienmakler hat einen provisionspflichtigen Maklervertrag in gleicher Höhe mit dem Verkäufer abgeschlossen.";
const PASSUS_ALLGEMEIN = "Eingezeichnete Linien auf im Exposé vorhandenen Luftbilder stellen keine verbindlichen Grundstücksgrenzen dar. Alle im Exposé gemachten Angaben beruhen auf Aussagen der Verkäufer. Bilder tlw. mit KI bearbeitet.";

const OBJEKTART_OO: Record<string, string> = { "wohnung": "wohnung", "haus": "haus", "grundstück": "grundstueck", "grundstueck": "grundstueck", "gewerbe": "buero_praxen", "sonstige": "sonstige" };
const objektartOO = (v: unknown) => OBJEKTART_OO[String(v || "").toLowerCase()] || "sonstige";
function vermarktungOO(immo: any): "kauf" | "miete" {
  const va = String(immo.vertragsart || "").toLowerCase();
  if (va.includes("miet") || va.includes("pacht")) return "miete";
  if (va.includes("verkauf") || va.includes("kauf")) return "kauf";
  if (immo.kaltmiete && !immo.angebotspreis) return "miete";
  return "kauf";
}

const norm = (v: unknown) => String(v || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/&/g, " und ").replace(/[^a-z0-9]/g, "");

// dicts: feld -> { oo_key: label } (aus onoffice_feld_werte geladen)
function macheResolver(dicts: Record<string, Record<string, string>>) {
  const idxCache: Record<string, Record<string, string>> = {};
  const baueIndex = (feld: string) => {
    if (idxCache[feld]) return idxCache[feld];
    const idx: Record<string, string> = {};
    const setze = (nk: string, key: string) => { if (nk && (!(nk in idx) || key.length < idx[nk].length)) idx[nk] = key; };
    for (const [key, label] of Object.entries(dicts[feld] || {})) { setze(norm(key), key); setze(norm(label), key); }
    return (idxCache[feld] = idx);
  };
  return (feld: string, value: unknown, fallback?: (nv: string) => string | null): string | null => {
    const nv = norm(value);
    if (!nv || !dicts[feld]) return null;
    const idx = baueIndex(feld);
    if (idx[nv]) return idx[nv];
    if (fallback) { const f = fallback(nv); if (f) return f; }
    let best: string | null = null, bestLen = 0;
    for (const [key, label] of Object.entries(dicts[feld])) {
      const nl = norm(label);
      if (nl.length >= 5 && (nv.includes(nl) || nl.includes(nv)) && nl.length > bestLen) { best = key; bestLen = nl.length; }
    }
    return best;
  };
}
const fbEnergietraeger = (nv: string) => { if (/fluessig/.test(nv)) return "fluessiggas"; if (/erdgas|gas/.test(nv)) return "gas"; if (/oel/.test(nv)) return "oel"; if (/fernwaerme|fern/.test(nv)) return "fernwaerme"; if (/nahwaerme|nahw/.test(nv)) return "localHeating"; if (/pellet/.test(nv)) return "pellet"; if (/holz/.test(nv)) return "holz"; if (/kohle/.test(nv)) return "kohle"; if (/solar/.test(nv)) return "solar"; if (/erdwaerme|geotherm/.test(nv)) return "erdwaerme"; if (/waermepumpe|luftw/.test(nv)) return "luftwp"; if (/elektro|strom/.test(nv)) return "elektro"; return null; };
// v8: "Nicht erforderlich (...)" / "keine Pflicht" -> onOffice-Auswahlwert "es besteht keine Pflicht!"; "ohne" bleibt "ohne Energieausweis"
const fbEnergieausweistyp = (nv: string) => { if (/nichterforderlich|keinepflicht/.test(nv)) return "es besteht keine Pflicht!"; if (/bedarf/.test(nv)) return "Endenergiebedarf"; if (/verbrauch/.test(nv)) return "Energieverbrauchskennwert"; if (/ohne/.test(nv)) return "ohne Energieausweis"; return null; };
const fbNutzungsart = (nv: string) => { if (/wohn/.test(nv)) return "wohnen"; if (/gewerb/.test(nv)) return "gewerbe"; if (/anlage/.test(nv)) return "anlage"; if (/zeit|waz/.test(nv)) return "waz"; return null; };

const s = (v: unknown) => { const t = (v === null || v === undefined) ? "" : String(v).trim(); return t || null; };
const n = (v: unknown) => { if (v === null || v === undefined || v === "") return null; const x = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(x) ? null : x; };
const b01 = (v: unknown) => (v === null || v === undefined || v === "") ? null : ((v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true") ? "1" : "0");
const dt = (v: unknown) => { const t = s(v); if (!t) return null; const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

async function sig(msg: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sg = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sg)));
}
async function buildAction(actionid: string, resourceid: string, data: Record<string, unknown>, token: string, secret: string, ts: string) {
  const hmac = await sig(ts + token + RT + actionid, secret);
  return { actionid, resourceid: resourceid || "", resourcetype: RT, identifier: "", timestamp: ts, hmac, hmac_version: "2", parameters: { data } };
}
// Einheit an ihr Stammobjekt haengen. onOffice fuehrt das als eigene Relation
// mit eigenem resourcetype, nicht als Feld am Objekt — deshalb ein eigener
// Baustein statt buildAction (das haengt alles unter "data" und benutzt fest
// den resourcetype "estate").
const REL_EINHEIT = "urn:onoffice-de-ns:smart:2.5:relationTypes:estate:estateUnit";
async function buildRelation(parentId: string, childId: string, token: string, secret: string, ts: string) {
  const rt = "relation";
  const hmac = await sig(ts + token + rt + A_CREATE, secret);
  return {
    actionid: A_CREATE, resourceid: "", resourcetype: rt, identifier: "",
    timestamp: ts, hmac, hmac_version: "2",
    parameters: { relationtype: REL_EINHEIT, parentid: [Number(parentId)], childid: [Number(childId)] },
  };
}
async function callOO(actions: unknown[], token: string) {
  const resp = await fetch(URL_OO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, request: { actions } }) });
  const json = await resp.json();
  return json?.response?.results ?? [];
}
const codeOf = (r: any) => r?.status?.errorcode ?? r?.status?.code ?? null;
const okResult = (r: any) => { const c = String(codeOf(r)); return c === "0" || c === "200"; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const internOk = body.intern_key === INTERN_KEY;
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let nutzer: string | null = null;
    if (!internOk && jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (!u?.user) throw new Error("Nicht angemeldet.");
      const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
      if (!p || !["chef", "mitarbeiter"].includes(p.role)) throw new Error("Keine Berechtigung.");
      nutzer = u.user.id;
    }
    const token = Deno.env.get("ONOFFICE_TOKEN");
    const secret = Deno.env.get("ONOFFICE_SECRET");
    if (!token || !secret) throw new Error("ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.");

    const immobilie_id = body.immobilie_id;
    const modus = String(body.modus || "anlegen");
    if (!immobilie_id) throw new Error("immobilie_id fehlt.");

    const { data: immo, error: ladeErr } = await db.from("immobilien").select("*").eq("id", immobilie_id).maybeSingle();
    if (ladeErr) throw ladeErr;
    if (!immo) throw new Error("Objekt nicht gefunden.");
    if (modus === "anlegen" && immo.onoffice_id) return antwort({ ok: false, schon_vorhanden: true, onoffice_id: immo.onoffice_id, fehler: "Bereits mit onOffice verknüpft. Zum Nachtragen modus=\"aktualisieren\"." });
    if (modus === "aktualisieren" && !immo.onoffice_id) throw new Error("Objekt ist noch nicht in onOffice — erst anlegen.");

    // Auswahlwert-Katalog laden
    const { data: kat } = await db.from("onoffice_feld_werte").select("feld, oo_key, label");
    const dicts: Record<string, Record<string, string>> = {};
    for (const r of (kat || [])) { (dicts[r.feld] ||= {})[r.oo_key] = r.label ?? r.oo_key; }
    const resolve = macheResolver(dicts);

    // Vollständige Feldabbildung
    const alle: Record<string, unknown> = {};
    const put = (f: string, w: unknown) => { if (w !== null && w !== undefined && w !== "") alle[f] = w; };
    const vmarkt = vermarktungOO(immo);
    put("objektart", objektartOO(immo.objektart));
    put("vermarktungsart", vmarkt);
    put("objekttitel", s(immo.objekttitel) || s(immo.bezeichnung));
    // v7: Kaufpreis auf Anfrage in onOffice (Spiegel kaufpreis 0) -> interner Angebotspreis
    // bleibt im Portal (nur fuers Expose) und wird NICHT nach onOffice geschrieben.
    let preisAufAnfrage = false;
    if (modus === "aktualisieren" && vmarkt === "kauf" && immo.onoffice_id) {
      const { data: sp } = await db.from("onoffice_objekte").select("kaufpreis, vermarktungsart").eq("onoffice_id", String(immo.onoffice_id)).maybeSingle();
      if (sp && sp.vermarktungsart !== "miete" && !(Number(sp.kaufpreis) > 0)) preisAufAnfrage = true;
    }
    if (vmarkt === "miete") put("kaltmiete", n(immo.kaltmiete)); else if (!preisAufAnfrage) put("kaufpreis", n(immo.angebotspreis));
    put("strasse", s(immo.strasse));
    put("hausnummer", s(immo.hausnummer));
    put("plz", s(immo.plz));
    put("ort", s(immo.ort));
    put("land", "DEU"); // E&P-Objekte liegen in Deutschland
    put("autoExpose", "1"); // Autom. Exposéversand aktiv
    put("wohnflaeche", n(immo.wohnflaeche));
    put("grundstuecksflaeche", n(immo.grundstueck));
    put("nutzflaeche", n(immo.nutzflaeche));
    put("anzahl_zimmer", n(immo.zimmer));
    put("anzahl_schlafzimmer", n(immo.schlafzimmer));
    put("anzahl_badezimmer", n(immo.badezimmer));
    put("anzahl_balkone", n(immo.anzahl_balkone));
    put("anzahl_terrassen", n(immo.anzahl_terrassen));
    if ((n(immo.anzahl_terrassen) || 0) > 0) put("terrasse", "1"); // Ja/Nein aus Anzahl abgeleitet
    put("etagen_zahl", n(immo.etagen_gesamt));
    put("etage", s(immo.etage));
    put("wohnungsnr", s(immo.wohnungsnr));
    put("anzahl_stellplaetze", n(immo.stellplatz_anzahl));
    put("stellplatzart", s(immo.stellplatz_art));
    put("baujahr", n(immo.baujahr));
    put("objektnr_extern", s(immo.immo_nr));
    put("objekttyp", resolve("objekttyp", immo.objekttyp));
    put("nutzungsart", resolve("nutzungsart", immo.nutzungsart, fbNutzungsart));
    put("heizungsart", resolve("heizungsart", immo.heizungsart));
    put("befeuerung", resolve("befeuerung", immo.befeuerung));
    put("unterkellert", resolve("unterkellert", immo.unterkellert));
    put("zustand", resolve("zustand", immo.zustand));
    put("wintergarten", b01(immo.wintergarten));
    put("objektbeschreibung", s(immo.beschreibung_objekt));
    put("lage", s(immo.beschreibung_lage));
    put("ausstatt_beschr", s(immo.beschreibung_ausstattung));
    // Sonstige Angaben: Freitext + Courtagepassus (Kauf) + allgemeine Hinweise
    {
      const teile: string[] = [];
      const frei = s(immo.beschreibung_sonstiges);
      if (frei) teile.push(frei);
      if (vmarkt === "kauf") teile.push(PASSUS_PROVISION_KAUF);
      teile.push(PASSUS_ALLGEMEIN);
      put("sonstige_angaben", teile.join("\n\n"));
    }
    put("nebenkosten", n(immo.nebenkosten));
    put("heizkosten", n(immo.heizkosten));
    put("kaution", s(immo.kaution));
    put("hausgeld", n(immo.hausgeld));
    put("aussen_courtage", s(immo.provision_aussen));
    put("innen_courtage", s(immo.provision_innen));
    put("provisionsfrei", b01(immo.provisionsfrei));
    put("mieteinnahmen_ist", n(immo.miete_ist));
    put("mieteinnahmen_soll", n(immo.miete_soll));
    put("vermietet", b01(immo.vermietet));
    put("verfuegbar_ab", s(immo.verfuegbar_ab));
    put("energieausweis_gueltig_bis", dt(immo.energie_gueltig_bis));
    put("energieausweistyp", resolve("energieausweistyp", immo.energieausweis_typ, fbEnergieausweistyp));
    put("energietraeger", resolve("energietraeger", immo.energie_traeger, fbEnergietraeger));
    put("energyClass", s(immo.energie_klasse));
    put("energieausweisBaujahr", n(immo.energie_baujahr_anlage));
    put("warmwasserEnthalten", b01(immo.energie_warmwasser));
    const kennwert = n(immo.energie_kennwert);
    if (kennwert != null) put(/verbrauch/i.test(String(immo.energieausweis_typ || "")) ? "energieverbrauchskennwert" : "endenergiebedarf", kennwert);

    let estateId: string;
    if (modus === "anlegen") {
      const core: Record<string, unknown> = {};
      for (const k of CORE_KEYS) if (k in alle) core[k] = alle[k];
      const tsC = String(Math.floor(Date.now() / 1000));
      const cres = await callOO([await buildAction(A_CREATE, "", core, token, secret, tsC)], token);
      const c0 = cres[0];
      if (!c0 || !okResult(c0)) {
        const msg = `Create abgelehnt (onOffice ${codeOf(c0)}): ${c0?.status?.message ?? "keine Antwort"}`;
        await db.from("onoffice_export_log").insert({ immobilie_id, aktion: "create", erfolg: false, kern_ok: false, meldung: msg, ausgeloest_von: nutzer });
        throw new Error(msg);
      }
      const rec0 = c0?.data?.records?.[0];
      estateId = String(rec0?.id ?? rec0?.elements?.Id ?? rec0?.elements?.id ?? "");
      if (!estateId) throw new Error("Create war ok, aber onOffice lieferte keine estate-Id zurück.");
      const jetzt = new Date().toISOString();
      await db.from("immobilien").update({ onoffice_id: estateId, onoffice_gesperrt: true, onoffice_synced_at: jetzt, onoffice_bilder_am: jetzt, updated_at: jetzt }).eq("id", immobilie_id);
    } else {
      estateId = String(immo.onoffice_id);
    }

    const enr: Record<string, unknown> = { ...alle };
    if (modus === "anlegen") for (const k of CORE_KEYS) delete enr[k];
    const { data: bad } = await db.from("onoffice_schreib_felder").select("feld").eq("schreibbar", false);
    const badSet = new Set((bad || []).map((r: any) => r.feld));
    for (const k of Object.keys(enr)) if (badSet.has(k)) delete enr[k];

    const felderOk: string[] = [];
    const felderFehler: string[] = [];
    const enrFelder = Object.keys(enr);
    if (enrFelder.length) {
      const ts1 = String(Math.floor(Date.now() / 1000));
      const res1 = await callOO([await buildAction(A_MODIFY, estateId, enr, token, secret, ts1)], token);
      if (res1[0] && okResult(res1[0])) {
        felderOk.push(...enrFelder);
      } else {
        for (let i = 0; i < enrFelder.length; i += BLOCK) {
          const teil = enrFelder.slice(i, i + BLOCK);
          const ts2 = String(Math.floor(Date.now() / 1000));
          const actions = [];
          for (const f of teil) actions.push(await buildAction(A_MODIFY, estateId, { [f]: enr[f] }, token, secret, ts2));
          const results = await callOO(actions, token);
          for (let j = 0; j < teil.length; j++) { if (results[j] && okResult(results[j])) felderOk.push(teil[j]); else felderFehler.push(teil[j]); }
        }
      }
      const now = new Date().toISOString();
      const rows = [
        ...felderOk.map((f) => ({ feld: f, schreibbar: true, letzte_meldung: null, geprueft_at: now })),
        ...felderFehler.map((f) => ({ feld: f, schreibbar: false, letzte_meldung: "modify abgelehnt", geprueft_at: now })),
      ];
      if (rows.length) await db.from("onoffice_schreib_felder").upsert(rows, { onConflict: "feld" });
    }

    // ---- Einheit unter ihr Stammobjekt haengen ----
    // Ohne diesen Aufruf steht die Wohnung in onOffice als Einzelobjekt neben
    // dem Haus statt darunter.
    let einheit: string | null = null;
    if (immo.stammobjekt_id) {
      try {
        const { data: stamm } = await db.from("immobilien").select("onoffice_id, immo_nr").eq("id", immo.stammobjekt_id).maybeSingle();
        if (!stamm?.onoffice_id) {
          einheit = "Stammobjekt ist selbst noch nicht in onOffice — bitte zuerst uebertragen.";
        } else {
          const tsR = String(Math.floor(Date.now() / 1000));
          const rres = await callOO([await buildRelation(String(stamm.onoffice_id), estateId, token, secret, tsR)], token);
          einheit = rres[0] && okResult(rres[0])
            ? "unter Stammobjekt " + (stamm.immo_nr || stamm.onoffice_id) + " eingehaengt"
            : "Zuordnung abgelehnt (onOffice " + codeOf(rres[0]) + "): " + (rres[0]?.status?.message ?? "");
        }
      } catch (e) {
        einheit = "Zuordnung fehlgeschlagen: " + (e instanceof Error ? e.message : String(e));
      }
    }

    if (modus === "aktualisieren") await db.from("immobilien").update({ onoffice_synced_at: new Date().toISOString() }).eq("id", immobilie_id);

    await db.from("onoffice_export_log").insert({ immobilie_id, onoffice_id: estateId, aktion: modus, erfolg: true, kern_ok: true, felder_ok: felderOk, felder_fehler: felderFehler, meldung: [felderFehler.length ? `${felderFehler.length} Feld(er) von onOffice abgelehnt` : null, preisAufAnfrage ? "Kaufpreis nicht uebertragen (onOffice: auf Anfrage)" : null, einheit].filter(Boolean).join(" · ") || null, ausgeloest_von: nutzer });

    return antwort({ ok: true, modus, onoffice_id: estateId, einheit, preis_auf_anfrage: preisAufAnfrage, felder_uebertragen: felderOk.length, felder_ok: felderOk, felder_fehler: felderFehler, hinweis: "Bilder wurden NICHT übertragen — Portal-Bilder bleiben im Portal." });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
