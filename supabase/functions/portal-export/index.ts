// ============================================================================
// Edge Function: portal-export (v5)
//   v5 (20.09.26): Energieausweis ohne Pflicht (GEG, Stufe 56): steht in
//       energieausweis_typ "Nicht erforderlich (...)" / "keine Pflicht" / "ohne
//       Energieausweis", wird KEIN <energiepass>-Block ausgegeben (vorher ein
//       leeres <epart/>). Sonst unveraendert zu v4.
//   v4 (16.09.26): Freitexte ohne Textauszeichnung. ImmoOffice erlaubt in
//       Objektbeschreibung, Lage, Ausstattung und Sonstiges die Zeichen **fett**,
//       *kursiv*, "## Zwischenueberschrift" und "- Aufzaehlung", die nur das
//       Expose-PDF (expose-pdf-erzeugen v49) umsetzt. Die Portale bekommen den
//       reinen Text (ohneAuszeichnung). Sonst unveraendert zu v3.
//   v3: 360-Grad-Rundgang als <anhang gruppe="LINKS"> mitgegeben, sofern
//       immobilien.rundgang_url gesetzt ist (Immowelt/OpenImmo: virtueller
//       Rundgang). Sonst unveraendert zu v2.
//   v2: <land iso_land="DEU"/> in <geo> — Immowelt weist Objekte ohne Land ab
//   Ein Objekt per OpenImmo 1.2.7 (ZIP + FTP) an ein beliebiges Portal aus
//   portal_zugaenge uebertragen: homepage | immowelt | kleinanzeigen | ...
//   Body: { immobilie_id, portal, aktion: "uebertragen" | "loeschen" }
//   Basis: portal-export-homepage v4 (gleiches XML, gleiche Bildlogik).
//   Dubletten-Schutz: openimmo_obid = onOffice-ID, wenn das Objekt aus onOffice
//   stammt (onOffice exportiert mit dieser OBID) — sonst "ep-<uuid>".
//   Status landet in immobilie_portal_status (status "uebertragen"/"geloescht",
//   quelle "world"); der Importbericht des Portals setzt danach "inseriert".
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
import JSZip from "npm:jszip@3.10.1";
import { Client as FtpClient } from "npm:basic-ftp@5.0.5";
import { Readable } from "node:stream";
import { Buffer } from "node:buffer";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tag = (name: string, val: unknown) => (val === null || val === undefined || val === "") ? "" : `<${name}>${esc(val)}</${name}>`;

// v4: Textauszeichnung aus ImmoOffice entfernen (gleiche Regeln wie expose-pdf-erzeugen v49):
// **fett**, *kursiv*, _kursiv_, ***fett kursiv*** sowie "## Ueberschrift" und "- Punkt" am Zeilenanfang.
// Unterstrich-Marker gelten nur an Wortgrenzen (E-Mail-Adressen, flur_stueck bleiben unangetastet).
const AUSZ_RE = /(\*\*\*|\*\*|\*)(?=\S)([\s\S]*?\S)\1|(?<![\p{L}\p{N}])(___|__|_)(?=\S)([\s\S]*?\S)\3(?![\p{L}\p{N}])/gu;
function ohneAuszeichnung(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const eine = (s: string): string => s.replace(AUSZ_RE, (_m: string, m1: string, m2: string, _m3: string, m4: string) => eine(m1 ? m2 : m4));
  return String(v).split(/\r?\n/).map((z) => {
    const t = z.trim();
    const h = /^#{1,3}\s+(.*)$/.exec(t); if (h) return eine(h[1].trim());
    const p = /^[-–•*]\s+(.*)$/.exec(t); if (p) return "- " + eine(p[1].trim());
    return eine(z);
  }).join("\n");
}

function objektartXml(i: Record<string, unknown>): string {
  const t = String(i.objekttyp || "").toLowerCase();
  switch (i.objektart) {
    case "Wohnung": { const map: Record<string, string> = { etagenwohnung: "ETAGE", erdgeschosswohnung: "ERDGESCHOSS", dachgeschosswohnung: "DACHGESCHOSS", maisonette: "MAISONETTE", penthouse: "PENTHOUSE", souterrainwohnung: "SOUTERRAIN", loft: "LOFT-STUDIO-ATELIER", apartment: "APARTMENT" }; return `<wohnung wohnungtyp="${map[t] || "KEINE_ANGABE"}"/>`; }
    case "Haus": { const map: Record<string, string> = { einfamilienhaus: "EINFAMILIENHAUS", "doppelhaushälfte": "DOPPELHAUSHAELFTE", reihenhaus: "REIHENHAUS", reihenendhaus: "REIHENEND", mehrfamilienhaus: "MEHRFAMILIENHAUS", villa: "VILLA", bungalow: "BUNGALOW", bauernhaus: "BAUERNHAUS", stadthaus: "STADTHAUS", "wohn- & geschäftshaus": "MEHRFAMILIENHAUS" }; return `<haus haustyp="${map[t] || "KEINE_ANGABE"}"/>`; }
    case "Grundstück": { const gt = t.includes("gewerbe") ? "GEWERBE" : (t.includes("land") || t.includes("forst")) ? "LAND_FORSTWIRSCHAFT" : "WOHNEN"; return `<grundstueck grundst_typ="${gt}"/>`; }
    case "Gewerbe": {
      if (t.includes("büro")) return `<buero_praxen buero_typ="BUEROFLAECHE"/>`;
      if (t.includes("praxis")) return `<buero_praxen buero_typ="PRAXISFLAECHE"/>`;
      if (t.includes("laden")) return `<einzelhandel handel_typ="LADENLOKAL"/>`;
      if (t.includes("halle")) return `<hallen_lager_prod hallen_typ="HALLE"/>`;
      if (t.includes("lager")) return `<hallen_lager_prod hallen_typ="LAGERFLAECHEN"/>`;
      if (t.includes("produktion")) return `<hallen_lager_prod hallen_typ="PRODUKTION"/>`;
      if (t.includes("gastro")) return `<gastgewerbe gastgew_typ="GASTRONOMIE"/>`;
      if (t.includes("hotel") || t.includes("pension")) return `<gastgewerbe gastgew_typ="HOTELS"/>`;
      return `<sonstige sonstige_typ="SONSTIGE"/>`;
    }
    default: return `<sonstige sonstige_typ="SONSTIGE"/>`;
  }
}

function openImmoXml(i: Record<string, unknown>, anbieterNr: string, aktion: "ADD" | "CHANGE" | "DELETE", anhaenge: { dateiname: string; titel: string; gruppe: string; format: string }[], kontakt: { name: string; email: string; telefon: string | null; firma: string }): string {
  const istMiete = i.vertragsart === "vermietung";
  const istKauf = i.vertragsart !== "vermietung";
  const nutz = String(i.nutzungsart || "Wohnen");
  const obid = i.onoffice_id ? String(i.onoffice_id) : "obj-" + i.id;
  const objektnr = String(i.immo_nr || "").trim() || ("OBJ-" + String(i.id).slice(0, 8));
  const epartMap: Record<string, string> = { Bedarfsausweis: "BEDARF", Verbrauchsausweis: "VERBRAUCH" };
  const epart = epartMap[String(i.energieausweis_typ)] || "";
  const keinePflicht = /^nicht erforderlich|keine pflicht|^ohne energieausweis/i.test(String(i.energieausweis_typ || "").trim());
  const energiepass = !keinePflicht && (i.energieausweis_typ || i.energie_kennwert) ? "<energiepass>" + tag("epart", epart) + (epart === "VERBRAUCH" ? tag("energieverbrauchkennwert", i.energie_kennwert) : "") + (i.energie_warmwasser != null ? tag("mitwarmwasser", i.energie_warmwasser ? "true" : "false") : "") + (epart !== "VERBRAUCH" ? tag("endenergiebedarf", i.energie_kennwert) : "") + tag("primaerenergietraeger", i.energie_traeger) + tag("wertklasse", i.energie_klasse) + tag("baujahr", i.energie_baujahr_anlage) + "</energiepass>" : "";
  const anhangXml = anhaenge.map(a => `<anhang location="EXTERN" gruppe="${a.gruppe}">` + tag("anhangtitel", a.titel) + tag("format", a.format) + `<daten><pfad>${esc(a.dateiname)}</pfad></daten></anhang>`).join("");
  let provision = "";
  if (i.provisionsfrei) provision = "<provisionspflichtig>false</provisionspflichtig>";
  else if (i.provision_aussen) provision = `<provisionspflichtig>true</provisionspflichtig><aussen_courtage mit_mwst="1">${esc(i.provision_aussen)}</aussen_courtage>`;
  const kontaktXml = "<kontaktperson>" + tag("email_zentrale", kontakt.email) + tag("tel_zentrale", kontakt.telefon) + tag("name", kontakt.name) + "</kontaktperson>";
  return `<?xml version="1.0" encoding="UTF-8"?>
<openimmo>
  <uebertragung art="ONLINE" umfang="TEIL" modus="NEW" version="1.2.7" sendersoftware="ImmoOffice" senderversion="1.0"/>
  <anbieter>
    <anbieternr>${esc(anbieterNr)}</anbieternr>
    <firma>${esc(kontakt.firma)}</firma>
    <openimmo_anid>${esc(anbieterNr)}</openimmo_anid>
    <immobilie>
      <objektkategorie>
        <nutzungsart WOHNEN="${nutz.includes("Wohnen") ? 1 : 0}" GEWERBE="${nutz.includes("Gewerbe") ? 1 : 0}"/>
        <vermarktungsart KAUF="${istKauf ? 1 : 0}" MIETE_PACHT="${istMiete || i.vertragsart === "beides" ? 1 : 0}"/>
        <objektart>${objektartXml(i)}</objektart>
      </objektkategorie>
      <geo>
        ${tag("plz", i.plz)}
        ${tag("ort", i.ort)}
        ${i.adresse_freigeben ? tag("strasse", i.strasse) : ""}
        ${i.adresse_freigeben ? tag("hausnummer", i.hausnummer) : ""}
        <land iso_land="DEU"/>
        ${tag("etage", i.etage)}
        ${tag("anzahl_etagen", i.etagen_gesamt)}
        ${i.adresse_freigeben ? tag("wohnungsnr", i.wohnungsnr) : ""}
      </geo>
      ${kontaktXml}
      <preise>
        ${istKauf ? tag("kaufpreis", i.angebotspreis) : ""}
        ${tag("kaltmiete", i.kaltmiete)}
        ${tag("nebenkosten", i.nebenkosten)}
        ${tag("heizkosten", i.heizkosten)}
        ${provision}
        ${tag("kaution_text", i.kaution)}
      </preise>
      <flaechen>
        ${tag("wohnflaeche", i.wohnflaeche)}
        ${tag("nutzflaeche", i.nutzflaeche)}
        ${tag("grundstuecksflaeche", i.grundstueck)}
        ${tag("anzahl_zimmer", i.zimmer)}
        ${tag("anzahl_schlafzimmer", i.schlafzimmer)}
        ${tag("anzahl_badezimmer", i.badezimmer)}
        ${tag("anzahl_balkone", i.anzahl_balkone)}
        ${tag("anzahl_terrassen", i.anzahl_terrassen)}
      </flaechen>
      <zustand_angaben>
        ${tag("baujahr", i.baujahr)}
        ${energiepass}
      </zustand_angaben>
      <freitexte>
        ${tag("objekttitel", i.objekttitel || i.bezeichnung)}
        ${tag("lage", ohneAuszeichnung(i.beschreibung_lage))}
        ${tag("ausstatt_beschr", ohneAuszeichnung(i.beschreibung_ausstattung))}
        ${tag("objektbeschreibung", ohneAuszeichnung(i.beschreibung_objekt))}
        ${tag("sonstige_angaben", ohneAuszeichnung(i.beschreibung_sonstiges))}
      </freitexte>
      ${anhaenge.length ? `<anhaenge>${anhangXml}</anhaenge>` : ""}
      <verwaltung_objekt>
        ${tag("objektadresse_freigeben", i.adresse_freigeben ? "true" : "false")}
        ${tag("verfuegbar_ab", i.verfuegbar_ab)}
      </verwaltung_objekt>
      <verwaltung_techn>
        ${tag("objektnr_intern", objektnr)}
        ${tag("objektnr_extern", objektnr)}
        <aktion aktionart="${aktion}"/>
        ${tag("openimmo_obid", obid)}
        ${tag("stand_vom", new Date().toISOString().slice(0, 10))}
      </verwaltung_techn>
    </immobilie>
  </anbieter>
</openimmo>`;
}

async function ftpUpload(zugang: Record<string, string>, dateiname: string, bytes: Uint8Array): Promise<string> {
  let letzterFehler: unknown = null;
  for (const secure of [false, true]) {   // die Portale (Immowelt, Kleinanzeigen) sprechen nur Klartext-FTP; FTPS als Reserve
    const client = new FtpClient(60000);
    try {
      await client.access({ host: zugang.ftp_host, user: zugang.ftp_user, password: zugang.ftp_passwort, secure, secureOptions: { rejectUnauthorized: false } });
      const ordner = (zugang.ftp_ordner || ".").trim();
      if (ordner && ordner !== ".") await client.ensureDir(ordner);
      await client.uploadFrom(Readable.from(Buffer.from(bytes)), dateiname);
      client.close();
      return secure ? "FTPS" : "FTP";
    } catch (e) { letzterFehler = e; try { client.close(); } catch (_e) { /* egal */ } }
  }
  throw new Error("FTP-Upload fehlgeschlagen: " + (letzterFehler instanceof Error ? letzterFehler.message : String(letzterFehler)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let immobilieId: string | null = null; let portal = "";
  try {
    const body = await req.json();
    immobilieId = body?.immobilie_id || null;
    portal = String(body?.portal || "").trim().toLowerCase();
    await immoMandantSichern(req, [["immobilien", immobilieId]]);
    const aktion: string = body?.aktion === "loeschen" ? "loeschen" : "uebertragen";
    if (!immobilieId || !portal) return jsonErr(400, "Fehlende Parameter: immobilie_id, portal");

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonErr(401, "Kein Auth-Token");
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonErr(401, "Nicht authentifiziert");
    const { data: profile } = await admin.from("profiles").select("id, role, mandant_id").eq("id", userData.user.id).maybeSingle();
    if (!profile || !["chef", "mitarbeiter"].includes(profile.role)) return jsonErr(403, "Kein Teamzugang");
    if (!profile.mandant_id) return jsonErr(403, "Kein Mandant am Profil — ohne den keine Portaluebertragung.");

    // Der Zugang traegt FTP-Server, Benutzer und Passwort des Maklers. Ohne
    // Mandantenfilter liefert .maybeSingle() den erstbesten aktiven Zugang
    // fuer dieses Portal — unter mehreren Mandanten also die Zugangsdaten
    // eines fremden Maklers, und das Objekt landete in dessen Portalkonto.
    const { data: zugang } = await admin.from("portal_zugaenge").select("*")
      .eq("mandant_id", profile.mandant_id).eq("portal", portal).eq("aktiv", true).maybeSingle();
    if (!zugang) return jsonErr(500, `Kein aktiver Zugang für Portal „${portal}" in portal_zugaenge hinterlegt`);
    const { data: immo, error: immoErr } = await admin.from("immobilien").select("*").eq("id", immobilieId).maybeSingle();
    if (immoErr || !immo) return jsonErr(404, "Objekt nicht gefunden");
    if (aktion === "uebertragen" && !(immo.objekttitel || immo.bezeichnung)) return jsonErr(400, "Objekttitel fehlt — Portale verlangen einen Titel.");

    let kontaktName = ""; let kontaktEmail: string | null = null; let kontaktTelefon: string | null = null;
    const apId = immo.zustaendig_id || immo.ersteller_id || null;
    if (apId) { const { data: p } = await admin.from("profiles").select("name, email, telefon").eq("id", apId).maybeSingle(); if (p) { if (p.name) kontaktName = p.name; if (p.email) kontaktEmail = p.email; if (p.telefon && String(p.telefon).trim()) kontaktTelefon = String(p.telefon).trim(); } }
    // Diese Adresse und Rufnummer gehen als Kontakt in das OpenImmo-ZIP und
    // damit in das Portal-Inserat. Ohne Mandantenfilter war es die des
    // erstbesten Maklers mit einer Adresse — im Inserat eines anderen.
    const { data: firma } = await admin.from("firma_stammdaten").select("firma_name, email, telefon")
      .eq("mandant_id", profile.mandant_id).not("email", "is", null).limit(1).maybeSingle();
    const firmaName = String(firma?.firma_name || "").trim();
    if (!firmaName) return jsonErr(500, "Fuer diesen Mandanten ist kein Firmenname hinterlegt — OpenImmo verlangt einen Anbieter.");
    if (!kontaktName) kontaktName = firmaName;
    if (!kontaktEmail && firma?.email) kontaktEmail = firma.email;
    if (!kontaktTelefon && firma?.telefon) kontaktTelefon = firma.telefon;
    if (!kontaktEmail) return jsonErr(500, "Keine Kontakt-E-Mail gefunden — OpenImmo verlangt eine.");

    const objektnr = String(immo.immo_nr || "").trim() || ("OBJ-" + String(immo.id).slice(0, 8));
    const zipName = `ep_${portal}_${objektnr.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}.zip`;
    const zip = new JSZip();
    const anhaenge: { dateiname: string; titel: string; gruppe: string; format: string }[] = [];
    let bilderInfo = "";
    if (aktion === "uebertragen") {
      const { data: dateien } = await admin.from("immobilie_datei").select("*").eq("immobilie_id", immo.id).eq("oeffentlich", true).in("kategorie", ["foto", "grundriss", "lageplan"]).eq("speicher_typ", "supabase").order("sortierung", { ascending: true }).order("created_at", { ascending: true }).limit(40);
      const bilder = (dateien || []).slice(0, 20);
      let uebersprungen = (dateien || []).length - bilder.length; let lfd = 0; let titelbildGesetzt = false;
      for (const d of bilder) {
        if (!d.storage_path) continue;
        // schlanke Web-Fassung bevorzugen (Portale begrenzen die Dateigröße)
        const webPfad = d.storage_path.replace(/\.[^./]+$/, "") + "_web.jpg";
        let dl = await admin.storage.from("immobilie-dateien").download(webPfad);
        let pfad = webPfad;
        if (dl.error || !dl.data) { dl = await admin.storage.from("immobilie-dateien").download(d.storage_path); pfad = d.storage_path; }
        if (dl.error || !dl.data) { uebersprungen++; continue; }
        const bytes = new Uint8Array(await dl.data.arrayBuffer());
        if (bytes.length > 10 * 1024 * 1024) { uebersprungen++; continue; }
        lfd++;
        const endung = (pfad.split(".").pop() || "jpg").toLowerCase();
        const format = endung === "png" ? "PNG" : endung === "webp" ? "WEBP" : "JPG";
        const dateiname = `bild_${String(lfd).padStart(2, "0")}.${endung}`;
        zip.file(dateiname, bytes);
        let gruppe = "BILD";
        if (d.kategorie === "grundriss") gruppe = "GRUNDRISS";
        else if (d.kategorie === "lageplan") gruppe = "KARTEN_LAGEPLAN";
        else if (d.doktyp === "Energieskala" || (d.titel || "").toLowerCase() === "energieskala") gruppe = "EPASS-SKALA";
        else if (!titelbildGesetzt) { gruppe = "TITELBILD"; titelbildGesetzt = true; }
        anhaenge.push({ dateiname, titel: d.titel || d.name || `Bild ${lfd}`, gruppe, format });
      }
      bilderInfo = `${anhaenge.length} Bild(er)` + (uebersprungen > 0 ? `, ${uebersprungen} übersprungen` : "");
      // 360-Grad-Rundgang als Link mitgeben. OpenImmo sieht dafuer gruppe="LINKS"
      // vor; der Pfad ist hier die oeffentliche URL, keine Datei im ZIP.
      // Steht nur drin, solange der Rundgang veroeffentlicht ist (beim
      // Zurueckziehen wird immobilien.rundgang_url geleert).
      if (immo.rundgang_url) {
        anhaenge.push({ dateiname: String(immo.rundgang_url), titel: "360°-Rundgang", gruppe: "LINKS", format: "" });
        bilderInfo += ", 360°-Rundgang verlinkt";
      }
    }
    const xml = openImmoXml(immo, zugang.anbieter_nr || "1001", aktion === "loeschen" ? "DELETE" : "CHANGE", anhaenge, { name: kontaktName, email: kontaktEmail, telefon: kontaktTelefon, firma: firmaName });
    zip.file("openimmo.xml", xml);
    const zipBytes: Uint8Array = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const protokoll = await ftpUpload(zugang as Record<string, string>, zipName, zipBytes);

    const status = aktion === "loeschen" ? "geloescht" : "uebertragen";
    const meldung = aktion === "loeschen" ? `Lösch-Auftrag per ${protokoll} übertragen (${zipName})` : `Per ${protokoll} übertragen (${zipName}, ${Math.round(zipBytes.length / 1024)} KB, ${bilderInfo}, Kontakt: ${kontaktName}) — Bestätigung folgt per Importbericht`;
    await admin.from("immobilie_portal_status").upsert({ immobilie_id: immo.id, portal, status, meldung, uebertragen_am: new Date().toISOString(), quelle: "world", manuell: false }, { onConflict: "immobilie_id,portal" });
    return new Response(JSON.stringify({ ok: true, meldung, kontakt: kontaktName, obid: immo.onoffice_id ? String(immo.onoffice_id) : "obj-" + immo.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const fehlerText = e instanceof Error ? e.message : String(e);
    console.error("portal-export Fehler:", fehlerText);
    if (immobilieId && portal) { try { await admin.from("immobilie_portal_status").upsert({ immobilie_id: immobilieId, portal, status: "fehler", meldung: fehlerText, quelle: "world" }, { onConflict: "immobilie_id,portal" }); } catch (_e) { /* egal */ } }
    return jsonErr(500, fehlerText);
  }
});
function jsonErr(status: number, msg: string) { return new Response(JSON.stringify({ ok: false, fehler: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
