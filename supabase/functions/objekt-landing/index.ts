// ============================================================================
// objekt-landing v12 (öffentlich, ohne JWT – Zugriff nur per Token aus dem Exposé-Link)
//   v12 (24.09.): Mitarbeiter-Vorschau der Objektseite. POST { aktion: "laden", vorschau_immobilie_id } mit
//       Authorization (Team-JWT, Rolle chef/mitarbeiter) liefert dieselbe Antwort wie für einen bestätigten
//       Kunden – ohne Freigabe-Datensatz, ohne Schreibzugriffe (kein geoeffnet_am, keine Wünsche/Fragen, keine
//       KI-FAQ-Erzeugung), Antwortfeld vorschau: true. Aufruf aus dem Portal: objekt.html?vorschau=<Objekt-ID>.
//   v10 (21.09.): Standard-FAQ passen zur Gebäudeart. Jede Katalogfrage trägt optional "objektarten"
//       (Wohnung, Haus, Mehrfamilienhaus, Grundstück, Gewerbe, Sonstige) und "vermarktung" (kauf|miete).
//       Beispiele: Instandhaltungsrücklage, Sonderumlage und Teilungserklärung nur bei Wohnungen (bei Haus,
//       Mehrfamilienhaus und Grundstück gibt es keine Eigentümergemeinschaft); Bebaubarkeit und Erschließung
//       nicht bei Wohnungen; Kaufnebenkosten, Grundbuch, Baulasten, Altlasten und Kaufablauf nur bei Kauf
//       (bei Miete stattdessen "ablauf_miete"); Heizung, Energieausweis, Zustand und Internet nicht beim
//       Grundstück. Nicht passende Fragen werden nicht gestellt; vorhandene, ungeprüfte KI-Antworten dazu
//       werden entfernt (geprüfte Zeilen des Teams bleiben). Objektart aus immobilien.objektart, ergänzt um
//       objekttyp "Mehrfamilienhaus".
//   v9 (20.09.): Standard-FAQ je Objekt, von der KI aus Eckdaten, Exposé-Texten, Team-FAQ und freigegebenen Unterlagen
//       beantwortet. Katalog: portal_einstellungen.landing_faq_katalog (30 Fragen: Kosten, Rechtliches – Baulasten,
//       Altlasten, Grundbuch –, Zustand & Technik, Nutzung, Lage, Ablauf). Ergebnis in landing_faq (quelle 'ki',
//       katalog_schluessel, kategorie, sicher, quellen). Sichere Antworten sind sofort aktiv, unsichere bleiben inaktiv
//       und erscheinen dem Makler als „offen“ zum Nachtragen. Vom Makler geprüfte Zeilen (geprueft_am) werden nicht
//       überschrieben. Auslöser: POST { aktion: "faq_erzeugen", immobilie_id } mit Authorization (Team-JWT, Rolle
//       chef/mitarbeiter) oder x-diagnose-secret; außerdem automatisch im Hintergrund beim ersten "laden" eines
//       bestätigten Zugangs, wenn für das Objekt noch keine KI-FAQ vorliegt.
//   v8 (20.09.): „Adresse freigeben“ am Objekt gilt nur VOR der Bestätigung. Nach dem bestätigten Maklervertrag
//       liefert "laden" Straße/Hausnummer und die exakte Lage (Sonnenverlauf, Karte) – vorher weiterhin gerundet/ohne Straße.
//   v7 (20.09.): Ansprechpartner zeigt die BÜRONUMMER (firma_stammdaten.telefon der Gesellschaft, Rueckfall leer),
//       nie die Mobilnummer aus dem Profil.
//   v6 (20.09.): Suchkriterien exakt wie der Adressbuch-Dialog (kontakte.such_profil): vermarktungsart [] (kauf/miete),
//       objektarten [] (Wohnung, Haus, Mehrfamilienhaus, Grundstück, Gewerbe, Sonstiges), status, orte, plz,
//       umkreis {label, lat, lon, km} (Nominatim wie im Portal), preis_von, preis_bis, zimmer_von, flaeche_von, notiz.
//   v5 (20.09.): Downloads liefern url (Inline-Ansicht im Betrachter) und url_download (Content-Disposition attachment) –
//       PDFs werden erst angesehen, Download über die Kopfleiste des Betrachters (wie im Neubauportal).
//   v4 (20.09.): Nach Widerruf ist der Link ungültig – "laden" antwortet 410 art "widerrufen", alle Aktionen gesperrt.
//   v3 (20.09.): Absage mit Freitext (Begründung oder eigenes Angebot, z. B. Kaufpreisvorstellung) – body.text,
//       expose_freigaben.absage_text; Glocke/Mail tragen den Text mit; Absage-Grund "Angebot" wird als 💶 gemeldet.
//   v2 (20.09.): Weitergeleitete Fragen werden GEBÜNDELT gemeldet – alle 5 Minuten (Cron landing-fragen-5min) ruft
//       POST { aktion: "fragen_buendeln" } mit Header x-diagnose-secret; je Interessent und Objekt EINE Glocke und EINE Mail
//       mit allen neuen Fragen (landing_fragen.makler_info_am). Die Einzelmeldung je Frage entfällt.
//   Objekt-Landingpage für Interessenten (Stufe 53). Seite: objekt.html?t=TOKEN
//   POST { token, aktion: "laden" }        -> Objekt, Fotos, Texte, Makler, Firma, Freigabe-Stand, Downloads,
//                                             FAQ, Wunschtermine, Fragen, Suchkriterium (nur nach Bestätigung mehr als Grunddaten)
//   Bestätigen läuft über expose-freigabe (aktion "bestaetigen", gleiche Haken/Protokoll/Mails).
//   POST { token, aktion: "wunschtermine", termine:[{datum, zeitfenster}], telefon?, anmerkung? }
//   POST { token, aktion: "absage", grund }
//   POST { token, aktion: "suchkriterien", profil }   -> kontakte.such_profil + suchkriterien_abgleich
//   POST { token, aktion: "frage", frage }            -> KI antwortet nur aus freigegebenen Quellen, sonst Weiterleitung
//   POST { token, aktion: "rueckruf", telefon? }
//   POST { token, aktion: "widerruf" }
//   Glocke: aktivitaeten (zielgruppe makler) an den Zuständigen; Info-Mails per Resend.
//   Quelle im Repo: portal/objekt-landingpage/objekt-landing.ts
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Firmenname des Mandanten (Phase 2.4) ---------------------------------
// Die Neutralisierung hat den Namen der Referenz ueberall durch den des
// Demo-Mandanten ersetzt. Fuer das Neutralitaets-Gate war das richtig; fuer
// ein mandantenfaehiges Produkt ist ein verdrahteter Firmenname bei jedem
// Mandanten ausser einem falsch — und er stand in Grussformeln, Briefkoepfen
// und im OpenImmo-Feld <firma>, das jedes Portal anzeigt.
//
// Ohne Eintrag liefert diese Funktion einen LEEREN Text, keinen Beispielnamen.
// Die aufrufende Stelle laesst die Zeile dann weg. Eine fehlende Grussformel
// faellt auf; eine falsche nicht.
async function immoFirmenName(db: any, mandant: unknown): Promise<string> {
  if (typeof mandant !== "string" || !mandant) return "";
  const { data } = await db.from("firma_stammdaten")
    .select("firma_name, marken_name")
    .eq("mandant_id", mandant).eq("aktiv", true)
    .order("sortierung", { ascending: true }).limit(1).maybeSingle();
  return String(data?.marken_name || data?.firma_name || "").trim();
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diagnose-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const AGB_URL = "https://immooffice.example/agb";
const DATENSCHUTZ_URL = "https://immooffice.example/datenschutz";
const OBJEKT_BASIS = (Deno.env.get("PORTAL_URL") || "https://immooffice.example").replace(/\/?$/, "") + "/objekt.html?t=";
const BUCKET = "immobilie-dateien";
const OEFFENTLICH = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/`;
const FRAGEN_TAG = 20;
const BUERO_TELEFON = "";   // Rueckfall, wenn die Gesellschaft keine Bueronummer hinterlegt hat
const BEGINN_TEXT = "Ich verlange ausdrücklich, dass Sie mit der Erbringung Ihrer Maklerleistung (Zugang zur Objektseite, Zusendung des Exposés und weiterer Objektinformationen) bereits vor Ablauf der Widerrufsfrist beginnen. Mir ist bekannt, dass ich bei vollständiger Vertragserfüllung durch Sie mein Widerrufsrecht verliere und bei einem Widerruf während der Frist Wertersatz für die bis dahin erbrachte Leistung schulde.";

function widerrufsbelehrung(firma: any) {
  const adr = `${firma.firma_name}, ${firma.strasse}, ${firma.plz} ${firma.ort}, E-Mail: ${firma.email}`;
  return `Widerrufsrecht\nSie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.\nUm Ihr Widerrufsrecht auszuüben, müssen Sie uns (${adr}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.\nZur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.\n\nFolgen des Widerrufs\nWenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.\nHaben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.\n\nMuster-Widerrufsformular\n(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)\nAn ${adr}\nHiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: Maklervertrag / Nachweis- und Vermittlungstätigkeit\nBestellt am (*)/erhalten am (*): ______\nName des/der Verbraucher(s): ______\nAnschrift des/der Verbraucher(s): ______\nUnterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier), Datum\n(*) Unzutreffendes streichen.`;
}

const IM_FELDER = "id, mandant_id, immo_nr, objekttitel, bezeichnung, strasse, hausnummer, plz, ort, objektart, objekttyp, vertragsart, status, angebotspreis, kaltmiete, nebenkosten, heizkosten, hausgeld, kaution, kaution_monate, wohnflaeche, nutzflaeche, grundstueck, zimmer, schlafzimmer, badezimmer, etage, etagen_gesamt, baujahr, verfuegbar_ab, vermietet, energieausweis_typ, energie_kennwert, energie_klasse, energie_traeger, energie_gueltig_bis, heizungsart, stellplatz_art, stellplatz_anzahl, beschreibung_objekt, beschreibung_lage, beschreibung_ausstattung, beschreibung_sonstiges, hauptbild_url, adresse_freigeben, lage_koordinaten, lage_distanzen, zustaendig_id, provision_aussen, provisionsfrei";

async function resend(key: string, payload: any) {
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) console.error("Resend:", r.status, await r.text());
  return r.ok;
}
async function glocke(db: any, empfaenger: string | null, typ: string, titel: string, text: string, refTabelle: string, refId: string | null) {
  try { await db.from("aktivitaeten").insert({ zielgruppe: "makler", empfaenger_user_id: empfaenger, typ, titel, text: text.slice(0, 600), ref_tabelle: refTabelle, ref_id: refId }); }
  catch (e) { console.error("Glocke:", e); }
}
const txt = (v: unknown) => { const s = v == null ? "" : String(v).trim(); return s || null; };
const eur = (n: unknown) => n == null || n === "" ? "" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));

// Der Standort, dessen Angaben ins Impressum gehoeren: der des Objekts.
// Erst der mit passendem Slug, sonst der erste nach Sortierung.
async function immoStandortDesObjekts(db: any, mandant: string | null, slug: string | null) {
  const felder = "firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon";
  if (!mandant) return null;
  if (slug) {
    const { data } = await db.from("firma_stammdaten").select(felder)
      .eq("mandant_id", mandant).eq("slug", slug).maybeSingle();
    if (data) return data;
  }
  const { data } = await db.from("firma_stammdaten").select(felder)
    .eq("mandant_id", mandant).order("sortierung").limit(1).maybeSingle();
  return data;
}

async function kontext(db: any, t: string) {
  const { data: f } = await db.from("expose_freigaben").select("*").eq("token", t).maybeSingle();
  if (!f) return null;
  const { data: im } = await db.from("immobilien").select(IM_FELDER).eq("id", f.immobilie_id).maybeSingle();
  if (!im) return null;
  const firmaRow = await immoStandortDesObjekts(db, im.mandant_id, f.firma_slug || null);
  // Ohne Stammdaten bleiben die Felder leer. Der Rueckfall trug bisher den
  // Namen und die Platzhalteradresse des Demo-Mandanten — auf der
  // oeffentlichen Objektseite eines fremden Maklers.
  const firma = firmaRow || { firma_name: "", strasse: "", plz: "", ort: "", email: "" };
  const { data: makler } = im.zustaendig_id ? await db.from("profiles").select("id, name, email, telefon, funktion, foto_url").eq("id", im.zustaendig_id).maybeSingle() : { data: null as any };
  return { f, im, firma, makler };
}
async function maklerFoto(db: any, fotoUrl: string | null) {
  if (!fotoUrl) return null;
  const web = fotoUrl.replace(/\.[a-z0-9]+$/i, "") + "_web.jpg";
  for (const p of [web, fotoUrl]) {
    const { data } = await db.storage.from("profile-fotos").createSignedUrl(p, 60 * 60 * 24 * 7);
    if (data?.signedUrl) return data.signedUrl;
  }
  return null;
}
async function downloadListe(db: any, f: any) {
  const out: { name: string; url: string; url_download: string; typ: string }[] = [];
  const sign = async (d: any, typ: string) => {
    if (!d?.storage_path) return;
    const { data: s } = await db.storage.from(BUCKET).createSignedUrl(d.storage_path, 60 * 60 * 24 * 7);
    const { data: sd } = await db.storage.from(BUCKET).createSignedUrl(d.storage_path, 60 * 60 * 24 * 7, { download: d.name });
    if (s?.signedUrl) out.push({ name: d.name, url: s.signedUrl, url_download: sd?.signedUrl || s.signedUrl, typ });
  };
  const { data: exp } = await db.from("immobilie_datei").select("id, name, storage_path, expose_final, created_at").eq("immobilie_id", f.immobilie_id).eq("expose_final", true).order("created_at", { ascending: false }).limit(1);
  let expose = exp && exp[0];
  if (!expose && f.expose_datei_id) { const { data: d } = await db.from("immobilie_datei").select("id, name, storage_path").eq("id", f.expose_datei_id).maybeSingle(); expose = d; }
  if (expose) await sign(expose, "Exposé");
  const { data: doks } = await db.from("immobilie_datei").select("id, name, storage_path, doktyp, kategorie").eq("immobilie_id", f.immobilie_id).eq("interessenten_freigabe", true).order("created_at", { ascending: true }).limit(20);
  for (const d of doks || []) { if (expose && d.id === expose.id) continue; await sign(d, d.doktyp || (d.kategorie === "grundriss" ? "Grundriss" : d.kategorie === "lageplan" ? "Lageplan" : "Unterlage")); }
  return out;
}
async function kontaktSichern(db: any, f: any, im: any): Promise<string | null> {
  if (f.kontakt_id) return f.kontakt_id;
  const mail = String(f.email || "").trim().toLowerCase();
  if (!mail) return null;
  const { data: kk } = await db.from("kontakte").select("id").eq("mandant_id", im.mandant_id).ilike("email", mail).eq("aktiv", true).limit(1);
  let id = kk && kk[0] ? kk[0].id : null;
  if (!id) {
    const teile = String(f.name || "").split(/\s+/).filter(Boolean); const nachname = teile.length ? teile.pop() : null; const vorname = teile.join(" ") || null;
    const { data: kn } = await db.from("kontakte").insert({ vorname, nachname, email: mail, rollen: ["interessent"], quelle: "landingpage", aktiv: true, mandant_id: im.mandant_id, zustaendig_id: im.zustaendig_id || null }).select("id").single();
    id = kn?.id || null;
  }
  if (id) await db.from("expose_freigaben").update({ kontakt_id: id }).eq("id", f.id);
  return id;
}

// ---- Quellenpaket für die KI (Eckdaten, Texte, Team-FAQ, freigegebene Unterlagen) ----
async function quellenPaket(db: any, im: any, faq: any[]) {
  const { data: wissen } = await db.from("immobilie_wissen").select("dokument_typ, quelle_name, zusammenfassung, fakten").eq("immobilie_id", im.id).eq("interessenten_freigabe", true).limit(40);
  const istMiete = /miet/i.test(String(im.vertragsart || ""));
  const eck = [
    ["Objektart", [im.objektart, im.objekttyp].filter(Boolean).join(" / ")], ["Vermarktung", istMiete ? "Miete" : "Kauf"],
    [istMiete ? "Kaltmiete" : "Kaufpreis", istMiete ? eur(im.kaltmiete) : (im.angebotspreis ? eur(im.angebotspreis) : "auf Anfrage")],
    ["Nebenkosten", im.nebenkosten ? eur(im.nebenkosten) + " mtl." : ""], ["Hausgeld", im.hausgeld ? eur(im.hausgeld) + " mtl." : ""],
    ["Wohnfläche", im.wohnflaeche ? `ca. ${im.wohnflaeche} m²` : ""], ["Nutzfläche", im.nutzflaeche ? `ca. ${im.nutzflaeche} m²` : ""], ["Grundstück", im.grundstueck ? `ca. ${im.grundstueck} m²` : ""],
    ["Zimmer", im.zimmer], ["Schlafzimmer", im.schlafzimmer], ["Badezimmer", im.badezimmer], ["Etage", im.etage], ["Baujahr", im.baujahr], ["Verfügbar ab", im.verfuegbar_ab], ["Vermietet", im.vermietet ? "ja" : ""],
    ["Heizungsart", im.heizungsart], ["Energieausweis", [im.energieausweis_typ, im.energie_kennwert ? im.energie_kennwert + " kWh/(m²·a)" : "", im.energie_klasse ? "Klasse " + im.energie_klasse : "", im.energie_traeger].filter(Boolean).join(", ")],
    ["Stellplatz", [im.stellplatz_anzahl, im.stellplatz_art].filter(Boolean).join(" × ")], ["Ort", [im.plz, im.ort].filter(Boolean).join(" ")], ["Adresse", im.adresse_freigeben === false ? "(wird erst bei Besichtigung genannt)" : [im.strasse, im.hausnummer].filter(Boolean).join(" ")],
    ["Käuferprovision", istMiete ? "keine (Bestellerprinzip)" : im.provisionsfrei ? "provisionsfrei" : (im.provision_aussen || "")],
  ].filter(([, v]) => v != null && String(v).trim() !== "").map(([k, v]) => `- ${k}: ${v}`).join("\n");
  const dist = Array.isArray(im.lage_distanzen) ? im.lage_distanzen.map((d: any) => `- ${d.label}: ${d.wert}`).join("\n") : "";
  const wissenText = (wissen || []).map((w: any) => `### ${w.dokument_typ || "Dokument"}${w.quelle_name ? " (" + w.quelle_name + ")" : ""}\n${w.zusammenfassung || ""}\n${(w.fakten || []).map((x: any) => `- ${x.thema}: ${x.aussage}`).join("\n")}`).join("\n\n");
  const faqText = (faq || []).map((q: any) => `F: ${q.frage}\nA: ${q.antwort}`).join("\n\n");
  return `ECKDATEN\n${eck}\n\nOBJEKTBESCHREIBUNG\n${im.beschreibung_objekt || "-"}\n\nLAGE\n${im.beschreibung_lage || "-"}\n${dist ? "Entfernungen:\n" + dist : ""}\n\nAUSSTATTUNG\n${im.beschreibung_ausstattung || "-"}\n\nSONSTIGES\n${im.beschreibung_sonstiges || "-"}\n\nFAQ\n${faqText || "-"}\n\nFREIGEGEBENE UNTERLAGEN\n${wissenText || "-"}`;
}
async function kiRohtext(apiKey: string, system: string, user: string, maxTokens: number) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }) });
  if (!r.ok) { console.error("Anthropic:", r.status, await r.text()); return ""; }
  const j = await r.json(); return String(j?.content?.[0]?.text || "").trim();
}

// ---- KI-Antwort nur aus freigegebenen Quellen ----
async function kiAntwort(db: any, im: any, faq: any[], frage: string, maklerName: string) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { antwort: "", sicher: false, quellen: [] as string[] };
  const quellen = await quellenPaket(db, im, faq);
  const firmaName = await immoFirmenName(db, im.mandant_id);
  const system = `Du bist der Objekt-Assistent von ${firmaName || "einem Immobilienmakler"} auf der persönlichen Objektseite eines Interessenten. Du antwortest auf Deutsch, freundlich, sachlich, in 1–4 Sätzen, Sie-Anrede.
STRIKTE REGELN:
- Antworte AUSSCHLIESSLICH aus den unten stehenden Quellen (Eckdaten, Exposé-Texte, FAQ, freigegebene Unterlagen). Erfinde nichts, schätze nichts, rechne keine Werte hoch.
- Keine Aussagen zu Preisverhandlung, Zusagen, Reservierung, Rechts- oder Steuerfragen, Finanzierung – das übernimmt ${maklerName}. Dann "sicher": false.
- Steht die Antwort nicht in den Quellen, sag das kurz und setze "sicher": false.
- Nenne in "quellen" die verwendeten Quellen (z. B. "Exposé", "Ausstattung", "FAQ", Dokumentname).
Antworte NUR mit JSON: {"antwort": "...", "sicher": true|false, "quellen": ["..."]}`;
  const user = `${quellen}\n\nFRAGE DES INTERESSENTEN:\n${frage}`;
  try {
    const roh = await kiRohtext(apiKey, system, user, 600);
    const m = roh.match(/\{[\s\S]*\}/);
    const p = m ? JSON.parse(m[0]) : null;
    if (!p || typeof p.antwort !== "string") return { antwort: "", sicher: false, quellen: [] };
    return { antwort: p.antwort.trim(), sicher: p.sicher === true, quellen: Array.isArray(p.quellen) ? p.quellen.map(String).slice(0, 6) : [] };
  } catch (e) { console.error("KI:", e); return { antwort: "", sicher: false, quellen: [] }; }
}

// ---- v9: Standard-FAQ je Objekt per KI ----
type Katalogfrage = { schluessel: string; kategorie: string; frage: string; objektarten: string[] | null; vermarktung: string | null };
async function faqKatalog(db: any, mandant: string | null): Promise<Katalogfrage[]> {
  const { data } = await db.from("portal_einstellungen").select("wert").eq("mandant_id", mandant).eq("schluessel", "landing_faq_katalog").maybeSingle();
  const k = Array.isArray(data?.wert) ? data.wert : [];
  return k.filter((x: any) => x && x.schluessel && x.frage).map((x: any) => ({
    schluessel: String(x.schluessel).slice(0, 40), kategorie: String(x.kategorie || "Allgemein").slice(0, 60), frage: String(x.frage).slice(0, 300),
    objektarten: Array.isArray(x.objektarten) && x.objektarten.length ? x.objektarten.map((a: unknown) => artSchluessel(a)) : null,
    vermarktung: x.vermarktung === "kauf" || x.vermarktung === "miete" ? String(x.vermarktung) : null,
  })).slice(0, 60);
}
// v10: Objektart auf einen Schlüssel bringen – "Sonstige"/"Sonstiges" und "Grundstück"/"Grundstueck" sind dasselbe
function artSchluessel(v: unknown): string {
  const t = String(v || "").toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss").replace(/[^a-z]/g, "");
  if (t.startsWith("mehrfamilien")) return "mehrfamilienhaus";
  if (t.startsWith("wohnung")) return "wohnung";
  if (t.startsWith("haus")) return "haus";
  if (t.startsWith("grundstuck") || t.startsWith("grundstuck")) return "grundstueck";
  if (t.startsWith("grundstueck")) return "grundstueck";
  if (t.startsWith("gewerbe") || t.startsWith("buro") || t.startsWith("laden") || t.startsWith("halle")) return "gewerbe";
  if (t.startsWith("sonstig")) return "sonstige";
  return t || "sonstige";
}
// Objektart des Objekts: objektart, ergänzt um den Typ "Mehrfamilienhaus" (steht in objekttyp, nicht in objektart)
function objektArt(im: any): string {
  const typ = artSchluessel(im.objekttyp);
  if (typ === "mehrfamilienhaus") return "mehrfamilienhaus";
  return artSchluessel(im.objektart);
}
function fragePasst(k: Katalogfrage, art: string, istMiete: boolean): boolean {
  if (k.vermarktung && k.vermarktung !== (istMiete ? "miete" : "kauf")) return false;
  if (k.objektarten && art && !k.objektarten.includes(art)) return false;
  return true;
}
async function faqErzeugen(db: any, immobilieId: string, nutzerId: string | null) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, fehler: "Kein KI-Schlüssel hinterlegt." };
  const { data: im } = await db.from("immobilien").select(IM_FELDER).eq("id", immobilieId).maybeSingle();
  if (!im) return { ok: false, fehler: "Objekt nicht gefunden." };
  const katalogAlle = await faqKatalog(db, im.mandant_id);
  if (!katalogAlle.length) return { ok: false, fehler: "Kein Fragenkatalog hinterlegt (portal_einstellungen.landing_faq_katalog)." };
  const istMiete = /miet/i.test(String(im.vertragsart || ""));
  // v10: nur Fragen, die zur Gebäudeart und zur Vermarktung passen
  const art = objektArt(im);
  const katalog = katalogAlle.filter((k) => fragePasst(k, art, istMiete));
  const passendeSchluessel = katalog.map((k) => k.schluessel);
  const [{ data: teamFaq }, { data: vorhanden }] = await Promise.all([
    db.from("landing_faq").select("frage, antwort").eq("aktiv", true).eq("quelle", "team").or(`immobilie_id.eq.${im.id},immobilie_id.is.null`).limit(30),
    db.from("landing_faq").select("id, katalog_schluessel, geprueft_am").eq("immobilie_id", im.id).not("katalog_schluessel", "is", null),
  ]);
  // Fragen, die nicht (mehr) zur Gebäudeart passen: ungeprüfte KI-Antworten entfernen, geprüfte des Teams bleiben
  const weg = (vorhanden || []).filter((v: any) => !v.geprueft_am && !passendeSchluessel.includes(v.katalog_schluessel)).map((v: any) => v.id);
  let entfernt = 0;
  if (weg.length) { const { error: eDel } = await db.from("landing_faq").delete().in("id", weg); if (eDel) console.error("FAQ entfernen:", eDel); else entfernt = weg.length; }
  const geprueft = new Set((vorhanden || []).filter((v: any) => v.geprueft_am).map((v: any) => v.katalog_schluessel));
  const offen = katalog.filter((k) => !geprueft.has(k.schluessel));
  if (!offen.length) return { ok: true, beantwortet: 0, offen: 0, uebersprungen: geprueft.size, entfernt, objektart: art };
  const quellen = await quellenPaket(db, im, teamFaq || []);
  const firmaName = await immoFirmenName(db, im.mandant_id);
  const artText = [im.objektart, im.objekttyp].filter(Boolean).join(" / ") || "Immobilie";
  const system = `Du beantwortest für die persönliche Objektseite eines Interessenten Standardfragen zu einer Immobilie von ${firmaName || "einem Immobilienmakler"} (${artText}, ${istMiete ? "Vermietung" : "Verkauf"}). Deutsch, sachlich, freundlich, Sie-Anrede, je Antwort 1–3 Sätze.
STRIKTE REGELN:
- Antworte AUSSCHLIESSLICH aus den Quellen (Eckdaten, Texte, FAQ, freigegebene Unterlagen). Erfinde nichts, schätze nichts, rechne nichts hoch, kein Allgemeinwissen zu Steuersätzen, Gebühren oder Rechtslage.
- Steht die Antwort ganz oder teilweise nicht in den Quellen: "sicher": false und als Antwort kurz „Dazu liegen in den Unterlagen keine Angaben vor.“ (ggf. mit dem Teil, der belegt ist).
- Die Fragen passen bereits zur Objektart; erkläre nicht, warum etwas nicht zutrifft. Steht die Antwort nicht in den Quellen: "sicher": false.
- Für „Wie kann ich besichtigen?“ gilt als Quelle: Auf der Objektseite können unter „Besichtigung anfragen“ bis zu drei Wunschtermine vorgeschlagen werden; der Ansprechpartner bestätigt per E-Mail.
- Nenne in "quellen" die verwendeten Quellen (z. B. "Eckdaten", "Exposé", "Ausstattung", "FAQ", Dokumentname).
Antworte NUR mit einem JSON-Array, ein Objekt je Frage, in der Reihenfolge der Fragen:
[{"schluessel": "...", "antwort": "...", "sicher": true|false, "quellen": ["..."]}]`;
  const user = `${quellen}\n\nFRAGEN (schluessel: Frage)\n${offen.map((k) => `${k.schluessel}: ${k.frage}`).join("\n")}`;
  const roh = await kiRohtext(apiKey, system, user, 8000);
  const liste = jsonListe(roh);
  if (!liste.length) { console.error("KI-FAQ nicht lesbar, Anfang:", roh.slice(0, 400)); return { ok: false, fehler: "KI-Antwort nicht lesbar." }; }
  const jetzt = new Date().toISOString();
  const je = new Map<string, any>(); for (const a of liste) if (a && a.schluessel) je.set(String(a.schluessel), a);
  const zeilen = offen.map((k, i) => {
    const a = je.get(k.schluessel) || {};
    const antwort = typeof a.antwort === "string" && a.antwort.trim() ? a.antwort.trim().slice(0, 1200) : "Dazu liegen in den Unterlagen keine Angaben vor.";
    const sicher = a.sicher === true && typeof a.antwort === "string" && !!a.antwort.trim();
    return { immobilie_id: im.id, katalog_schluessel: k.schluessel, kategorie: k.kategorie, frage: k.frage, antwort, sicher, quellen: Array.isArray(a.quellen) ? a.quellen.map(String).slice(0, 6) : [],
      quelle: "ki", aktiv: sicher, sortierung: 100 + i, erzeugt_am: jetzt, updated_at: jetzt, erstellt_von: nutzerId, geprueft_von: null, geprueft_am: null };
  });
  const { error } = await db.from("landing_faq").upsert(zeilen, { onConflict: "immobilie_id,katalog_schluessel" });
  if (error) { console.error("FAQ upsert:", error); return { ok: false, fehler: error.message }; }
  return { ok: true, beantwortet: zeilen.filter((z) => z.sicher).length, offen: zeilen.filter((z) => !z.sicher).length, uebersprungen: geprueft.size, entfernt, objektart: art };
}
// JSON-Array aus dem Modelltext holen – tolerant gegen Codezäune, Text davor/danach, rohe Zeilenumbrüche in
// Strings und ein einzelnes kaputtes Objekt (dann werden die übrigen Objekte einzeln gelesen).
function jsonListe(roh: string): any[] {
  const t = roh.replace(/```(?:json)?/gi, "").trim();
  const saeubern = (x: string) => x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/"((?:[^"\\]|\\.)*)"/gs, (m0) => m0.replace(/\r?\n/g, " "));
  const versuche = [t, saeubern(t)];
  const m = t.match(/\[[\s\S]*\]/); if (m) versuche.push(m[0], saeubern(m[0]));
  for (const v of versuche) { try { const j = JSON.parse(v); if (Array.isArray(j)) return j; if (j && Array.isArray(j.antworten)) return j.antworten; } catch (_e) { /* nächster Versuch */ } }
  const einzeln: any[] = [];
  for (const o of saeubern(t).match(/\{[^{}]*\}/g) || []) { try { const j = JSON.parse(o); if (j && j.schluessel) einzeln.push(j); } catch (_e) { /* überspringen */ } }
  return einzeln;
}
function imHintergrund(p: Promise<unknown>) {
  const er = (globalThis as any).EdgeRuntime;
  if (er && typeof er.waitUntil === "function") er.waitUntil(p.catch((e: unknown) => console.error("Hintergrund:", e)));
  else p.catch((e: unknown) => console.error("Hintergrund:", e));
}

// v12: Antwort für „laden“ – für den Kunden (per Token) und für die Mitarbeiter-Vorschau (vorschau = true:
// kein Freigabe-Datensatz, keine Schreibzugriffe, keine Wünsche/Fragen, keine KI-FAQ-Erzeugung).
async function ladeAntwort(db: any, ctx: any, vorschau: boolean): Promise<{ status: number; body: any }> {
  const { f, im, firma, makler } = ctx;
  const jetzt = new Date().toISOString();
  const bestaetigt = !!f.bestaetigt_am;
  if (im.status === "archiviert" && !vorschau) return { status: 410, body: { ok: false, fehler: "Dieses Objekt ist nicht mehr verfügbar.", art: "weg", firma } };
  if (!vorschau) {
    const updates: any = {}; if (!f.geoeffnet_am) updates.geoeffnet_am = jetzt; if (!f.landing) updates.landing = true;
    if (Object.keys(updates).length) await db.from("expose_freigaben").update(updates).eq("id", f.id);
  }
  const { data: dateien } = await db.from("immobilie_datei").select("id, storage_path, titel, name, kategorie, doktyp, sortierung, expose_ausschliessen").eq("immobilie_id", im.id).in("kategorie", ["foto", "grundriss"]).not("storage_path", "is", null).order("sortierung", { ascending: true }).limit(80);
  const fotos = (dateien || []).filter((d: any) => !d.expose_ausschliessen && d.doktyp !== "Energieskala" && !/bildeditor/i.test(d.storage_path || "")).map((d: any) => ({ url: OEFFENTLICH + d.storage_path, titel: d.titel || null, art: d.kategorie }));
  const { provision_aussen: _pa, provisionsfrei: _pf, zustaendig_id: _z, lage_koordinaten: koord, ...imPub } = im;
  // v8: Adresse/Lage nur vor der Bestätigung verbergen – nach dem Maklervertrag bekommt der Kunde die genaue Lage
  const verbergen = im.adresse_freigeben === false && !bestaetigt;
  const lage = koord && typeof koord === "object" && koord.lat ? (verbergen ? { lat: Math.round(koord.lat * 100) / 100, lon: Math.round(koord.lon * 100) / 100, ungefaehr: true } : { lat: koord.lat, lon: koord.lon, ungefaehr: false }) : null;
  if (verbergen) { imPub.strasse = null; imPub.hausnummer = null; }
  const { ip: _ip, user_agent: _ua, bestaetigungen: _b, token: _t, ...fPub } = f;
  const bueroTel = firma.telefon || BUERO_TELEFON;
  const basis: any = { ok: true, vorschau, f: fPub, im: imPub, fotos, lage, firma: { ...firma, telefon: bueroTel }, makler: makler ? { name: makler.name, email: makler.email, telefon: bueroTel, funktion: makler.funktion, foto: await maklerFoto(db, makler.foto_url) } : null,
    texte: { widerrufsbelehrung: widerrufsbelehrung(firma), beginn_text: BEGINN_TEXT, agb_url: AGB_URL, datenschutz_url: DATENSCHUTZ_URL } };
  if (!bestaetigt) return { status: 200, body: basis };
  // Der Zweig immobilie_id.is.null holt die allgemeinen Fragen. Ohne
  // Mandantenfilter waren das die allgemeinen Fragen ALLER Makler — auf der
  // oeffentlichen Objektseite eines einzelnen.
  const { data: faq } = await db.from("landing_faq").select("id, frage, antwort, sortierung, kategorie, quelle, quellen, geprueft_am").eq("mandant_id", im.mandant_id).eq("aktiv", true).or(`immobilie_id.eq.${im.id},immobilie_id.is.null`).order("sortierung", { ascending: true }).limit(60);
  let wuensche: any[] = [], fragen: any[] = [];
  if (!vorschau) {
    const [{ data: w }, { data: q }] = await Promise.all([
      db.from("landing_besichtigungswuensche").select("id, termine, telefon, anmerkung, status, created_at").eq("freigabe_id", f.id).order("created_at", { ascending: false }).limit(5),
      db.from("landing_fragen").select("id, frage, antwort, antwort_quelle, quellen, weitergeleitet, created_at, beantwortet_am").eq("freigabe_id", f.id).order("created_at", { ascending: true }).limit(30),
    ]);
    wuensche = w || []; fragen = q || [];
  }
  let suchprofil: any = null;
  if (f.kontakt_id) { const { data: k } = await db.from("kontakte").select("such_profil").eq("id", f.kontakt_id).maybeSingle(); const sp = k?.such_profil || null; if (sp) suchprofil = { vermarktungsart: sp.vermarktungsart, objektarten: sp.objektarten, orte: sp.orte, plz: sp.plz, umkreis: sp.umkreis && sp.umkreis.label ? { label: sp.umkreis.label, km: sp.umkreis.km || 20 } : null, preis_von: sp.preis_von, preis_bis: sp.preis_bis, zimmer_von: sp.zimmer_von, flaeche_von: sp.flaeche_von, notiz: sp.notiz, status: sp.status }; }
  // v9: noch keine KI-FAQ für dieses Objekt → im Hintergrund erzeugen (beim nächsten Laden sichtbar) – nicht in der Vorschau
  if (!vorschau && im.status !== "archiviert") {
    const { count: kiZahl } = await db.from("landing_faq").select("id", { count: "exact", head: true }).eq("immobilie_id", im.id).eq("quelle", "ki");
    if (!kiZahl) imHintergrund(faqErzeugen(db, im.id, null));
  }
  return { status: 200, body: { ...basis, downloads: await downloadListe(db, f), faq: (faq || []).map((q: any) => ({ id: q.id, frage: q.frage, antwort: q.antwort, kategorie: q.kategorie, quelle: q.quelle, quellen: q.quellen || [], geprueft: !!q.geprueft_am })), wuensche, fragen, suchprofil } };
}

// v12: Zusammenhang für die Mitarbeiter-Vorschau – Objekt echt, Freigabe nur im Speicher (als bestätigt)
async function kontextVorschau(db: any, immobilieId: string, nutzer: { id: string; name: string | null; email: string | null }) {
  const { data: im } = await db.from("immobilien").select(IM_FELDER).eq("id", immobilieId).maybeSingle();
  if (!im) return null;
  const firmaRow = await immoStandortDesObjekts(db, im.mandant_id, null);
  // Ohne Stammdaten bleiben die Felder leer. Der Rueckfall trug bisher den
  // Namen und die Platzhalteradresse des Demo-Mandanten — auf der
  // oeffentlichen Objektseite eines fremden Maklers.
  const firma = firmaRow || { firma_name: "", strasse: "", plz: "", ort: "", email: "" };
  const { data: makler } = im.zustaendig_id ? await db.from("profiles").select("id, name, email, telefon, funktion, foto_url").eq("id", im.zustaendig_id).maybeSingle() : { data: null as any };
  const jetzt = new Date().toISOString();
  const f = { id: null, token: null, immobilie_id: im.id, email: nutzer.email || "", name: "Vorschau", kontakt_id: null, created_at: jetzt, geoeffnet_am: jetzt, bestaetigt_am: jetzt,
    landing: true, gueltig_bis: null, provisionsmodell: im.provisionsfrei ? "provisionsfrei" : "kaeufer",
    provision_text: im.provisionsfrei ? "Für Sie als Käufer fällt keine Provision an." : `Käuferprovision: ${im.provision_aussen || "gemäß Exposé"}`,
    newsletter: false, downloads: 0, expose_datei_id: null, firma_slug: "standard", abgesagt_am: null, absage_grund: null, absage_text: null, widerrufen_am: null, erinnerung_am: null, vorschau: true };
  return { f, im, firma, makler };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    const t = String(body.token || "").trim();
    const aktion = String(body.aktion || "laden");

    // v2: gebündelte Meldung weitergeleiteter Fragen (Cron alle 5 Minuten, Header x-diagnose-secret)
    if (aktion === "fragen_buendeln") {
      const geheim = req.headers.get("x-diagnose-secret") || "";
      const { data: okS } = geheim ? await db.rpc("diagnose_secret_pruefen", { p: geheim }) : { data: false as any };
      if (okS !== true) return json({ ok: false, fehler: "Nicht erlaubt." }, 403);
      const { data: offen } = await db.from("landing_fragen").select("id, freigabe_id, immobilie_id, frage, antwort, created_at").eq("weitergeleitet", true).is("makler_info_am", null).order("created_at", { ascending: true }).limit(200);
      const gruppen = new Map<string, any[]>();
      for (const q of offen || []) { if (!gruppen.has(q.freigabe_id)) gruppen.set(q.freigabe_id, []); gruppen.get(q.freigabe_id)!.push(q); }
      const resendKey2 = Deno.env.get("RESEND_API_KEY") || "";
      let buendel = 0, gemeldet = 0;
      for (const [freigabeId, fragen] of gruppen) {
        const { data: fr } = await db.from("expose_freigaben").select("id, name, email, erstellt_von, immobilie_id, firma_slug").eq("id", freigabeId).maybeSingle();
        const { data: imr } = fr ? await db.from("immobilien").select("id, mandant_id, immo_nr, objekttitel, bezeichnung, zustaendig_id").eq("id", fr.immobilie_id).maybeSingle() : { data: null as any };
        if (!fr || !imr) { await db.from("landing_fragen").update({ makler_info_am: new Date().toISOString() }).in("id", fragen.map((q: any) => q.id)); continue; }
        const { data: mk } = imr.zustaendig_id ? await db.from("profiles").select("name, email").eq("id", imr.zustaendig_id).maybeSingle() : { data: null as any };
        const fi = await immoStandortDesObjekts(db, imr.mandant_id, fr.firma_slug || null);
        const firmaMail = fi?.email || "info@immooffice.example";
        const titel2 = imr.objekttitel || imr.bezeichnung || "Immobilie"; const nr2 = imr.immo_nr ? ` (Nr. ${imr.immo_nr})` : ""; const wer2 = fr.name || fr.email;
        const n = fragen.length;
        const liste = fragen.map((q: any) => `• ${new Date(q.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr: „${q.frage}“${q.antwort && !/weitergeleitet/.test(q.antwort) ? "\n   (Assistent vorläufig: " + q.antwort.replace(/\s*Ich habe Ihre Frage an .*$/, "") + ")" : ""}`).join("\n");
        await glocke(db, imr.zustaendig_id || fr.erstellt_von || null, "landing_frage", `❓ ${n} Frage${n === 1 ? "" : "n"} von ${wer2}`, `${titel2}${nr2}\n${liste}\n→ Objekt → Vermarktung → Objektseiten-Zugänge → Fragen beantworten`, "landing_fragen", fragen[0].id);
        if (resendKey2) {
          let an = mk?.email || null;
          if (!an && fr.erstellt_von) { const { data: e } = await db.from("profiles").select("email").eq("id", fr.erstellt_von).maybeSingle(); an = e?.email || null; }
          await resend(resendKey2, { from: `ImmoOffice <${firmaMail}>`, to: [an || firmaMail], subject: `❓ ${n} Frage${n === 1 ? "" : "n"} von ${wer2} – ${titel2}`, text: `${wer2} <${fr.email}> hat auf der Objektseite zu „${titel2}“${nr2} gefragt:\n\n${liste}\n\nBitte in ImmoOffice antworten (Objekt → Vermarktung → Objektseiten-Zugänge → Fragen beantworten) – die Antwort geht per Mail an den Interessenten.` });
        }
        await db.from("landing_fragen").update({ makler_info_am: new Date().toISOString() }).in("id", fragen.map((q: any) => q.id));
        buendel++; gemeldet += n;
      }
      return json({ ok: true, buendel, fragen: gemeldet });
    }

    // v9: Standard-FAQ per KI erzeugen – Team (JWT, Rolle chef/mitarbeiter) oder Cron/SQL (x-diagnose-secret)
    if (aktion === "faq_erzeugen") {
      const immobilieId = String(body.immobilie_id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(immobilieId)) return json({ ok: false, fehler: "immobilie_id fehlt." }, 400);
      let erlaubt = false; let nutzerId: string | null = null;
      const geheim = req.headers.get("x-diagnose-secret") || "";
      if (geheim) { const { data: okS } = await db.rpc("diagnose_secret_pruefen", { p: geheim }); erlaubt = okS === true; }
      const auth = req.headers.get("authorization") || "";
      if (!erlaubt && /^Bearer\s+\S+/i.test(auth)) {
        const nutzerDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
        const { data: u } = await nutzerDb.auth.getUser();
        if (u?.user) { const { data: rolle } = await nutzerDb.rpc("aktuelle_rolle"); erlaubt = rolle === "chef" || rolle === "mitarbeiter"; nutzerId = u.user.id; }
      }
      if (!erlaubt) return json({ ok: false, fehler: "Nicht erlaubt." }, 403);
      const erg = await faqErzeugen(db, immobilieId, nutzerId);
      return json(erg, erg.ok ? 200 : 400);
    }

    // v12: Mitarbeiter-Vorschau der Objektseite (Portal: Objekt → Vermarktung → „Vorschau der Objektseite“)
    const vorschauId = String(body.vorschau_immobilie_id || "").trim();
    if (aktion === "laden" && vorschauId) {
      if (!/^[0-9a-f-]{36}$/i.test(vorschauId)) return json({ ok: false, fehler: "Objekt-ID ungültig.", art: "vorschau" }, 400);
      const auth = req.headers.get("authorization") || "";
      let nutzer: { id: string; name: string | null; email: string | null } | null = null;
      if (/^Bearer\s+\S+/i.test(auth)) {
        const nutzerDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
        const { data: u } = await nutzerDb.auth.getUser();
        if (u?.user) {
          const { data: rolle } = await nutzerDb.rpc("aktuelle_rolle");
          if (rolle === "chef" || rolle === "mitarbeiter") { const { data: p } = await db.from("profiles").select("name, email").eq("id", u.user.id).maybeSingle(); nutzer = { id: u.user.id, name: p?.name || null, email: p?.email || u.user.email || null }; }
        }
      }
      if (!nutzer) return json({ ok: false, fehler: "Bitte zuerst im Portal anmelden – die Vorschau nutzt Ihre Anmeldung.", art: "vorschau" }, 403);
      const ctxV = await kontextVorschau(db, vorschauId, nutzer);
      if (!ctxV) return json({ ok: false, fehler: "Objekt nicht gefunden.", art: "vorschau" }, 404);
      const a = await ladeAntwort(db, ctxV, true);
      return json(a.body, a.status);
    }

    if (!/^[0-9a-f]{20,64}$/i.test(t)) return json({ ok: false, fehler: "Dieser Link ist nicht (mehr) gültig.", art: "ungueltig" }, 404);
    const ctx = await kontext(db, t);
    if (!ctx) return json({ ok: false, fehler: "Dieser Link ist nicht (mehr) gültig.", art: "ungueltig" }, 404);
    const { f, im, firma, makler } = ctx;
    const jetzt = new Date().toISOString();
    const resendKey = Deno.env.get("RESEND_API_KEY") || "";
    const empfaenger = im.zustaendig_id || f.erstellt_von || null;
    const titel = im.objekttitel || im.bezeichnung || "Immobilie";
    const nr = im.immo_nr ? ` (Nr. ${im.immo_nr})` : "";
    const wer = f.name || f.email;
    const bestaetigt = !!f.bestaetigt_am;
    const infoAnMakler = async (betreff: string, text: string) => {
      if (!resendKey) return;
      let an = makler?.email || null;
      if (!an && f.erstellt_von) { const { data: e } = await db.from("profiles").select("email").eq("id", f.erstellt_von).maybeSingle(); an = e?.email || null; }
      if (!an) an = firma.email;
      await resend(resendKey, { from: `ImmoOffice <${firma.email}>`, to: [an], subject: betreff, text });
    };

    if (f.widerrufen_am) return json({ ok: false, fehler: "Sie haben den Maklervertrag widerrufen – dieser Zugang ist nicht mehr gültig.", art: "widerrufen", firma }, 410);
    if (aktion === "laden") { const a = await ladeAntwort(db, ctx, false); return json(a.body, a.status); }

    if (!bestaetigt) return json({ ok: false, fehler: "Bitte zuerst bestätigen." }, 403);

    if (aktion === "wunschtermine") {
      const roh = Array.isArray(body.termine) ? body.termine : [];
      const heute = new Date(); heute.setHours(0, 0, 0, 0);
      const termine = roh.map((x: any) => ({ datum: String(x?.datum || "").slice(0, 10), zeitfenster: String(x?.zeitfenster || "egal").slice(0, 40) }))
        .filter((x: any) => /^\d{4}-\d{2}-\d{2}$/.test(x.datum) && new Date(x.datum + "T12:00:00") >= heute).slice(0, 3);
      if (!termine.length) return json({ ok: false, fehler: "Bitte mindestens einen Wunschtermin in der Zukunft angeben." }, 400);
      const kontaktId = await kontaktSichern(db, f, im);
      const { data: w, error } = await db.from("landing_besichtigungswuensche").insert({ freigabe_id: f.id, immobilie_id: im.id, kontakt_id: kontaktId, termine, telefon: txt(body.telefon)?.slice(0, 60) || null, anmerkung: txt(body.anmerkung)?.slice(0, 1000) || null }).select("id, created_at, termine, telefon, anmerkung, status").single();
      if (error) throw error;
      const liste = termine.map((x: any) => `${new Date(x.datum + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })} · ${x.zeitfenster}`).join("\n");
      await glocke(db, empfaenger, "landing_wunschtermin", `📅 Besichtigungswunsch von ${wer}`, `${titel}${nr}\n${liste}${body.telefon ? "\nTel. " + body.telefon : ""}${body.anmerkung ? "\n" + String(body.anmerkung).slice(0, 200) : ""}\n→ Objekt → Vermarktung → Objektseiten-Zugänge`, "landing_besichtigungswuensche", w.id);
      await infoAnMakler(`📅 Besichtigungswunsch: ${wer} – ${titel}`, `${wer} <${f.email}> wünscht eine Besichtigung.\n\nObjekt: ${titel}${nr}\n\nWunschtermine:\n${liste}\n\nTelefon: ${body.telefon || "–"}\nAnmerkung: ${body.anmerkung || "–"}\n\nBestätigen oder Alternative vorschlagen: ImmoOffice → Objekt → Vermarktung → Objektseiten-Zugänge.`);
      return json({ ok: true, wunsch: w });
    }

    if (aktion === "absage") {
      const grund = txt(body.grund)?.slice(0, 200) || "ohne Angabe";
      const text = txt(body.text)?.slice(0, 2000) || null;
      const angebot = /angebot/i.test(grund);
      if (angebot && !text) return json({ ok: false, fehler: "Bitte tragen Sie Ihr Angebot in das Textfeld ein." }, 400);
      await db.from("expose_freigaben").update({ abgesagt_am: jetzt, absage_grund: grund, absage_text: text }).eq("id", f.id);
      await db.from("landing_besichtigungswuensche").update({ status: "zurueckgezogen", bearbeitet_am: jetzt }).eq("freigabe_id", f.id).eq("status", "offen");
      await glocke(db, empfaenger, "landing_absage", angebot ? `💶 Angebot von ${wer}` : `✗ Absage von ${wer}`, `${titel}${nr} – ${grund}${text ? "\n„" + text.slice(0, 400) + "“" : ""}${angebot ? "\n→ Objekt → Vermarktung → Objektseiten-Zugänge" : ""}`, "expose_freigaben", f.id);
      await infoAnMakler(angebot ? `💶 Angebot von ${wer} – ${titel}` : `✗ Absage: ${wer} – ${titel}`, `${wer} <${f.email}> hat für „${titel}“${nr} ${angebot ? "ein Angebot abgegeben" : "abgesagt"}.\nGrund: ${grund}${text ? "\n\nNachricht des Interessenten:\n" + text : ""}\n\nOffene Wunschtermine wurden zurückgezogen.${angebot ? " Bitte melden Sie sich beim Interessenten (Telefon/E-Mail siehe Kontakt)." : ""}`);
      return json({ ok: true, abgesagt_am: jetzt, angebot });
    }

    if (aktion === "suchkriterien") {
      const p = body.profil || {};
      const kontaktId = await kontaktSichern(db, f, im);
      if (!kontaktId) return json({ ok: false, fehler: "Kontakt konnte nicht zugeordnet werden." }, 500);
      const { data: k } = await db.from("kontakte").select("such_profil").eq("id", kontaktId).maybeSingle();
      const alt = (k?.such_profil && typeof k.such_profil === "object") ? k.such_profil : {};
      // Datenform wie KwSuchkriterium im Adressbuch (zahl: Punkte raus, Komma -> Punkt)
      const zahl = (v: unknown) => { const t = String(v ?? "").trim(); if (!t) return null; const n = Number(t.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".")); return isFinite(n) && n > 0 ? n : null; };
      const ARTEN = ["Wohnung", "Haus", "Mehrfamilienhaus", "Grundstück", "Gewerbe", "Sonstiges"];
      const vermarktungsart = (Array.isArray(p.vermarktungsart) ? p.vermarktungsart : [p.vermarktungsart]).map((x: unknown) => String(x || "").toLowerCase()).filter((x: string) => x === "kauf" || x === "miete");
      const objektarten = (Array.isArray(p.objektarten) ? p.objektarten.map(String) : []).filter((x: string) => ARTEN.includes(x));
      const status = ["aktiv", "pausiert", "erfuellt"].includes(String(p.status)) ? String(p.status) : "aktiv";
      // Umkreis: Ort geocodieren wie kwGeocode im Portal (Nominatim, nur Deutschland); unveraenderter Ort behaelt seinen Mittelpunkt
      let umkreis: any = null;
      const label = txt(p.umkreis_label)?.slice(0, 120) || null;
      const km = Math.min(Math.max(Number(p.umkreis_km) || 20, 1), 200);
      if (label) {
        if (alt.umkreis && alt.umkreis.label === label && alt.umkreis.lat) umkreis = { ...alt.umkreis, km };
        else {
          try {
            const r = await fetch("https://nominatim.openstreetmap.org/search?" + new URLSearchParams({ format: "json", limit: "1", countrycodes: "de", q: label }).toString(), { headers: { "Accept-Language": "de", "User-Agent": "ImmoOffice Objektseite (info@immooffice.example)" } });
            const liste = r.ok ? await r.json() : [];
            if (Array.isArray(liste) && liste.length) umkreis = { label, lat: Number(liste[0].lat), lon: Number(liste[0].lon), km };
            else return json({ ok: false, fehler: `Ort „${label}“ für den Umkreis nicht gefunden – bitte anders schreiben oder leer lassen.` }, 400);
          } catch (_e) { return json({ ok: false, fehler: "Die Ortssuche für den Umkreis antwortet gerade nicht – bitte später erneut versuchen oder das Feld leer lassen." }, 502); }
        }
      }
      const neu = { ...alt, vermarktungsart, objektarten, orte: txt(p.orte)?.slice(0, 300) || null, plz: txt(p.plz)?.slice(0, 120) || null, umkreis, preis_von: zahl(p.preis_von), preis_bis: zahl(p.preis_bis), zimmer_von: zahl(p.zimmer_von), flaeche_von: zahl(p.flaeche_von), notiz: txt(p.notiz)?.slice(0, 600) || null, status, quelle_sk: "landingpage", geaendert_am: jetzt, geprueft_am: jetzt };
      delete (neu as any).grundstueck_von;
      const { error } = await db.from("kontakte").update({ such_profil: neu, updated_at: jetzt }).eq("id", kontaktId);
      if (error) throw error;
      let treffer: any = null;
      try { const { data } = await db.rpc("suchkriterien_abgleich", { p_immobilie: null, p_kontakt: kontaktId }); treffer = data; } catch (e) { console.error("Abgleich:", e); }
      await glocke(db, empfaenger, "landing_suchkriterium", `🔍 Suchkriterium von ${wer}`, `${vermarktungsart.map((v: string) => v === "kauf" ? "Kauf" : "Miete").join("/") || "Kauf/Miete"} · ${objektarten.join(", ") || "alle Objektarten"} · ${[neu.orte, neu.plz ? "PLZ " + neu.plz : "", umkreis ? `${umkreis.km} km um ${umkreis.label}` : ""].filter(Boolean).join(", ") || "ohne Ortsangabe"} · ${neu.preis_von || neu.preis_bis ? (neu.preis_von ? eur(neu.preis_von) : "…") + " – " + (neu.preis_bis ? eur(neu.preis_bis) : "…") : "Budget offen"}${status !== "aktiv" ? " · " + status : ""}\n→ Kontakt → Suchkriterium`, "kontakte", kontaktId);
      return json({ ok: true, suchprofil: neu, treffer });
    }

    if (aktion === "frage") {
      const frage = txt(body.frage)?.slice(0, 600);
      if (!frage) return json({ ok: false, fehler: "Bitte eine Frage eingeben." }, 400);
      const seit = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await db.from("landing_fragen").select("id", { count: "exact", head: true }).eq("freigabe_id", f.id).gte("created_at", seit);
      if ((count || 0) >= FRAGEN_TAG) return json({ ok: false, fehler: "Sie haben heute schon viele Fragen gestellt – bitte rufen Sie uns an oder schreiben Sie eine E-Mail." }, 429);
      const { data: faq } = await db.from("landing_faq").select("frage, antwort").eq("mandant_id", im.mandant_id).eq("aktiv", true).or(`immobilie_id.eq.${im.id},immobilie_id.is.null`).limit(30);
      const ki = await kiAntwort(db, im, faq || [], frage, makler?.name || "Ihr Ansprechpartner");
      const kontaktId = await kontaktSichern(db, f, im);
      const weiter = !ki.sicher || !ki.antwort;
      const antwort = weiter ? (ki.antwort ? ki.antwort + " " : "") + `Ich habe Ihre Frage an ${makler?.name || "Ihren Ansprechpartner"} weitergeleitet – Sie erhalten die Antwort per E-Mail, in der Regel innerhalb eines Werktags.` : ki.antwort;
      const { data: row, error } = await db.from("landing_fragen").insert({ freigabe_id: f.id, immobilie_id: im.id, kontakt_id: kontaktId, frage, antwort, antwort_quelle: weiter ? "weitergeleitet" : "ki", quellen: ki.quellen, weitergeleitet: weiter }).select("id, frage, antwort, antwort_quelle, quellen, weitergeleitet, created_at").single();
      if (error) throw error;
      // v2: keine Einzelmeldung – Glocke und Mail kommen gebündelt alle 5 Minuten (aktion fragen_buendeln)
      return json({ ok: true, frage: row });
    }

    if (aktion === "rueckruf") {
      const tel = txt(body.telefon)?.slice(0, 60) || null;
      await glocke(db, empfaenger, "landing_rueckruf", `📞 Rückruf gewünscht: ${wer}`, `${titel}${nr}${tel ? "\nTel. " + tel : ""}\nE-Mail: ${f.email}`, "expose_freigaben", f.id);
      await infoAnMakler(`📞 Rückruf gewünscht: ${wer} – ${titel}`, `${wer} <${f.email}> bittet um Rückruf zu „${titel}“${nr}.\nTelefon: ${tel || "nicht angegeben"}`);
      return json({ ok: true });
    }

    if (aktion === "widerruf") {
      if (!f.widerrufen_am) await db.from("expose_freigaben").update({ widerrufen_am: jetzt }).eq("id", f.id);
      await db.from("landing_besichtigungswuensche").update({ status: "zurueckgezogen", bearbeitet_am: jetzt }).eq("freigabe_id", f.id).eq("status", "offen");
      await glocke(db, empfaenger, "landing_widerruf", `⚠ Widerruf von ${wer}`, `${titel}${nr} – Widerruf des Maklervertrags über die Objektseite am ${new Date(jetzt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} Uhr.`, "expose_freigaben", f.id);
      if (resendKey) {
        const text = `${wer} <${f.email}> hat am ${new Date(jetzt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} Uhr über die Objektseite den Widerruf des Maklervertrags zu „${titel}“${nr} erklärt.\nBeauftragung vom: ${f.bestaetigt_am ? new Date(f.bestaetigt_am).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "–"} Uhr\nFreigabe-ID: ${f.id}`;
        await resend(resendKey, { from: `ImmoOffice <${firma.email}>`, to: [firma.email, ...(makler?.email ? [makler.email] : [])], subject: `⚠ Widerruf: ${wer} – ${titel}`, text });
        await resend(resendKey, { from: `${firma.firma_name} <${firma.email}>`, to: [f.email], reply_to: makler?.email || firma.email, subject: `Eingang Ihres Widerrufs – ${titel}`, text: `Guten Tag${f.name ? " " + f.name : ""},\n\nwir bestätigen den Eingang Ihres Widerrufs vom ${new Date(jetzt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} Uhr zum Maklervertrag über die Immobilie „${titel}“${nr}.\n\nMit freundlichen Grüßen\n${firma.firma_name}\n${firma.strasse}, ${firma.plz} ${firma.ort}` });
      }
      return json({ ok: true, widerrufen_am: jetzt });
    }

    return json({ ok: false, fehler: "Unbekannte Aktion." }, 400);
  } catch (e) {
    console.error("objekt-landing:", e);
    return json({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
