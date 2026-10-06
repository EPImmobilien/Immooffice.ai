// ============================================================================
// Edge Function: mail-ki-vorschlag (v16 — Interessent statt Weiterleiter)
// ============================================================================
// Nimmt eine eingegangene Mail (aus mail_eingang) und generiert eine
// Antwort-Skizze im Schreibstil des angemeldeten Users.
// v11: Objektkontext (Stammdaten + immobilie_wissen). v12: Unterlagen-Empfehlung [[ANHAENGE: ...]].
// v15: Mailinhalt auch aus dem HTML-Teil.
// v16: Ist die Mail eine verarbeitete Anfrage (mail.kontakt_name/kontakt_email, z. B. Portal- oder
//      Website-Anfrage, intern von einem Kollegen weitergeleitet), richtet sich der Entwurf an den
//      INTERESSENTEN — nicht an das Portal und nicht an den weiterleitenden Kollegen. Bei
//      Mietobjekten (provisionsfrei) wird das Exposé als Anhang angekündigt, kein Freigabelink.
// Berechtigung: Chef und Mitarbeiter (fork_46).
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

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

import { ABSICHTEN, absichtBlock, stilProfil } from "./stil.ts";
// --- Abo-Schranke (fork_61) ----------------------------------------
// Quelle: supabase/eigene-beilagen/_abo/abo.ts. Sie rechnet nichts ab;
// sie weist nur ab, wessen Abo abgelaufen oder gesperrt ist.
import { aboSchranke } from "./abo.ts";

const HTML_ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", euro: "€", hellip: "…", ndash: "–", mdash: "—", minus: "−", deg: "°", laquo: "«", raquo: "»", bdquo: "„", ldquo: "“", rdquo: "”", sbquo: "‚", lsquo: "‘", rsquo: "’", middot: "·", bull: "•", copy: "©", reg: "®", trade: "™", eacute: "é", egrave: "è", agrave: "à", uacute: "ú" };
function htmlZuText(html: string): string {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|head|title|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n"); s = s.replace(/<\/(td|th)>/gi, "\t"); s = s.replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)>/gi, "\n"); s = s.replace(/<[^>]*>/g, "");
  const zeichen = (nr: number, treffer: string) => (nr > 0 && nr <= 0x10ffff) ? String.fromCodePoint(nr) : treffer;
  s = s.replace(/&#x([0-9a-f]+);/gi, (m, h) => zeichen(parseInt(h, 16), m)); s = s.replace(/&#(\d+);/g, (m, d) => zeichen(parseInt(d, 10), m)); s = s.replace(/&([a-zA-Z]+);/g, (m, n) => HTML_ENTITIES[n] ?? m);
  return s.replace(/ /g, " ").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const euro = (v: unknown) => (v === null || v === undefined || v === "") ? null : `${Number(v).toLocaleString("de-DE", { maximumFractionDigits: 0 })}€`;
const qm = (v: unknown) => (v === null || v === undefined || v === "") ? null : `${Number(v).toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²`;
const txt = (v: unknown) => (v === null || v === undefined || String(v).trim() === "") ? null : String(v).trim();

function wissenNachRelevanz(wissen: any[], mailText: string): any[] {
  const woerter = Array.from(new Set(String(mailText || "").toLowerCase().replace(/[^a-zäöüß0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 5)));
  const bewertet = wissen.map((w, idx) => { const text = ((w.dokument_typ || "") + " " + (w.quelle_name || "") + " " + (Array.isArray(w.fakten) ? w.fakten.map((f: any) => `${f.thema || ""} ${f.aussage || ""}`).join(" ") : "")).toLowerCase(); let treffer = 0; for (const wort of woerter) if (text.includes(wort)) treffer++; return { w, treffer, idx }; });
  bewertet.sort((a, b) => b.treffer - a.treffer || a.idx - b.idx);
  return bewertet.map((b) => b.w);
}

function objektBlock(i: any, wissen: any[]): string {
  const z: string[] = [];
  const add = (label: string, wert: string | null) => { if (wert) z.push(`${label}: ${wert}`); };
  add("Objekt", [i.immo_nr, i.bezeichnung || i.objekttitel].filter(Boolean).join(" · "));
  add("Adresse", [[i.strasse, i.hausnummer].filter(Boolean).join(" "), [i.plz, i.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "));
  add("Art", [i.objektart, i.objekttyp, i.nutzungsart].filter(Boolean).join(" / "));
  add("Vermarktung", i.vertragsart === "kauf" ? "Verkauf" : i.vertragsart === "miete" ? "Vermietung (für den Mieter provisionsfrei)" : i.vertragsart === "beides" ? "Verkauf oder Vermietung" : txt(i.vertragsart));
  add("Status", txt(i.status));
  add("Angebotspreis", euro(i.angebotspreis));
  add("Kaltmiete", euro(i.kaltmiete)); add("Nebenkosten", euro(i.nebenkosten)); add("Heizkosten", euro(i.heizkosten)); add("Kaution", txt(i.kaution));
  add("Hausgeld", euro(i.hausgeld)); add("davon nicht umlagefähig", euro(i.hausgeld_nicht_umlagefaehig));
  add("Miete Ist / Soll", [euro(i.miete_ist), euro(i.miete_soll)].filter(Boolean).join(" / ") || null);
  add("Vermietet", i.vermietet === true ? "ja" : i.vermietet === false ? "nein" : null);
  add("Provision außen / innen", [txt(i.provision_aussen), txt(i.provision_innen)].filter(Boolean).join(" / ") || null);
  add("Provisionsfrei", i.provisionsfrei ? "ja" : null);
  add("Wohnfläche", qm(i.wohnflaeche)); add("Nutzfläche", qm(i.nutzflaeche)); add("Grundstück", qm(i.grundstueck));
  add("Zimmer", txt(i.zimmer)); add("Schlafzimmer", txt(i.schlafzimmer)); add("Badezimmer", txt(i.badezimmer));
  add("Etage", [i.etage, i.etagen_gesamt ? `von ${i.etagen_gesamt}` : null].filter(Boolean).join(" ") || null);
  add("Baujahr", txt(i.baujahr)); add("Zustand", txt(i.zustand)); add("Unterkellert", txt(i.unterkellert));
  add("Heizung", [i.heizungsart, i.befeuerung].filter(Boolean).join(" / ") || null);
  add("Energieausweis", [i.energieausweis_typ, i.energie_kennwert ? `${i.energie_kennwert} kWh/(m²a)` : null, i.energie_klasse ? `Klasse ${i.energie_klasse}` : null, i.energie_traeger, i.energie_baujahr_anlage ? `Anlage Bj. ${i.energie_baujahr_anlage}` : null, i.energie_gueltig_bis ? `gültig bis ${i.energie_gueltig_bis}` : null].filter(Boolean).join(", ") || null);
  add("Fenster", [i.fenster, i.fenster_verglasung, i.fenster_baujahr || i.fensterbaujahr ? `Bj. ${i.fenster_baujahr || i.fensterbaujahr}` : null].filter(Boolean).join(", ") || null);
  add("Stellplätze", [i.stellplatz_anzahl, i.stellplatz_art].filter(Boolean).join(" × ") || null);
  add("Balkone / Terrassen", [i.anzahl_balkone ? `${i.anzahl_balkone} Balkon(e)` : null, i.anzahl_terrassen ? `${i.anzahl_terrassen} Terrasse(n)` : null, i.wintergarten ? "Wintergarten" : null].filter(Boolean).join(", ") || null);
  add("Verfügbar ab", txt(i.verfuegbar_ab));
  for (const [label, feld] of [["Objektbeschreibung", "beschreibung_objekt"], ["Lage", "beschreibung_lage"], ["Ausstattung", "beschreibung_ausstattung"], ["Sonstiges", "beschreibung_sonstiges"]]) { const v = txt(i[feld]); if (v) z.push(`${label}: ${v.slice(0, 1500)}`); }
  let block = "STAMMDATEN\n" + z.join("\n");
  if (wissen && wissen.length) {
    block += "\n\nFAKTEN AUS DEN UNTERLAGEN"; let budget = 60000;
    for (const w of wissen) {
      const kopf = `\n[${w.dokument_typ || "Dokument"}${w.quelle_name ? ` — ${w.quelle_name}` : ""}]`;
      const zeilen = (Array.isArray(w.fakten) ? w.fakten : []).map((f: any) => `- ${f.thema ? f.thema + ": " : ""}${f.aussage}${f.fundstelle ? ` (${f.fundstelle})` : ""}`);
      const warn = (Array.isArray(w.warnungen) ? w.warnungen : []).map((x: any) => `- Hinweis: ${x}`);
      const teil = [kopf, ...zeilen, ...warn].join("\n");
      if (teil.length > budget) { block += teil.slice(0, budget) + "\n…(gekürzt)"; break; }
      block += teil; budget -= teil.length;
    }
  }
  return block;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // --- Abo-Schranke (fork_61) ---------------------------------------
  // Diese Funktion ruft ein Sprachmodell, hat aber noch keinen Preis
  // im Katalog. Abgerechnet wird deshalb nichts — ein Mandant ohne
  // gueltiges Abo kommt trotzdem nicht daran. Die Schranke liegt in
  // der Beilage abo.ts und faellt im Zweifel offen aus.
  const immoAboSperre = await aboSchranke(req, corsHeaders);
  if (immoAboSperre) return immoAboSperre;
  try {
    const body = await req.json();
    const { mail_eingang_id } = body;
    await immoMandantSichern(req, [["mail_eingang", String(mail_eingang_id || "")],
                                   ["immobilien", String(body.immobilie_id || "")]]);
    if (!mail_eingang_id && body.aktion !== "absichten") return jsonErr(400, "Fehlende Parameter: mail_eingang_id");
    const authHeader = req.headers.get("authorization"); if (!authHeader) return jsonErr(401, "Kein Auth-Token");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!; const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return jsonErr(500, "ANTHROPIC_API_KEY nicht gesetzt");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonErr(401, "Nicht authentifiziert");
    const userId = userData.user.id;
    const { data: profile } = await admin.from("profiles").select("role, email, name, mandant_id").eq("id", userId).maybeSingle();
    if (!profile || !["chef", "mitarbeiter"].includes(profile.role)) return jsonErr(403, "Keine Berechtigung.");
    // FORK fork_46: die Liste der Antwort-Absichten kommt aus derselben
    // Datei wie ihre Wirkung (stil.ts). Fuehrte die Oberflaeche eine
    // eigene Liste, liefe sie irgendwann auseinander.
    if (body.aktion === "absichten") {
      const liste = Object.entries(ABSICHTEN).map(([schluessel, a]) => ({ schluessel, name: a.name, hinweis: a.hinweis }));
      return new Response(JSON.stringify({ ok: true, absichten: liste }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // FORK fork_46: der gelernte Schreibstil — aber nur, wenn der Nutzer
    // eingewilligt hat und nicht widerrufen. Sonst bleibt er leer, und
    // stil.ts nimmt den neutralen Stil, der niemandem gehoert.
    const { data: stilZeile } = await admin.from("mail_stilprofil").select("profil_text, widerrufen_am").eq("benutzer_id", userId).maybeSingle();
    const gelernterStil = (stilZeile && !stilZeile.widerrufen_am && stilZeile.profil_text) ? String(stilZeile.profil_text) : "";
    const { data: mail, error: mailErr } = await admin.from("mail_eingang").select("*").eq("id", mail_eingang_id).maybeSingle();
    if (mailErr || !mail) return jsonErr(404, "Mail nicht gefunden");
    const mailText = (mail.text && String(mail.text).trim()) ? String(mail.text) : htmlZuText(mail.html || "");

    let objekt: any = null; let wissen: any[] = []; let objektHerkunft = ""; const unterlagen: any[] = [];
    const immoId = body.immobilie_id || mail.immobilie_id || ((mail.immobilie_id_ki_konfidenz || 0) >= 60 ? mail.immobilie_id_ki_vorschlag : null);
    if (immoId) {
      const { data: immo } = await admin.from("immobilien").select("*").eq("id", immoId).maybeSingle();
      if (immo) {
        objekt = immo; objektHerkunft = body.immobilie_id ? "gewählt" : mail.immobilie_id ? "zugeordnet" : "KI-Vorschlag";
        const { data: w } = await admin.from("immobilie_wissen").select("dokument_typ, quelle_name, quelle_typ, quelle_ref, fakten, warnungen, ausgewertet_am").eq("immobilie_id", immoId).order("ausgewertet_am", { ascending: false }).limit(40);
        wissen = w || [];
        const { data: dateien } = await admin.from("immobilie_datei").select("id, name, kategorie, oeffentlich, mime_type").eq("immobilie_id", immoId).in("kategorie", ["dokument", "grundriss", "lageplan"]).order("created_at", { ascending: false }).limit(60);
        for (const d of dateien || []) { if (!/\.(pdf|png|jpe?g|webp)$/i.test(d.name || "")) continue; const wz = wissen.find((x) => x.quelle_ref === d.id); unterlagen.push({ id: d.id, name: d.name, quelle: "portal", freigegeben: !!d.oeffentlich, typ: (wz && wz.dokument_typ) || (d.kategorie === "grundriss" ? "Grundriss" : d.kategorie === "lageplan" ? "Lageplan" : "Dokument") }); }
        for (const wz of wissen) if (wz.quelle_typ === "onedrive" && wz.quelle_ref && !unterlagen.some((u) => u.id === wz.quelle_ref)) unterlagen.push({ id: wz.quelle_ref, name: wz.quelle_name, quelle: "onedrive", freigegeben: false, typ: wz.dokument_typ || "Dokument" });
      }
    }

    // v16: Interessent aus der Anfrage-Verarbeitung
    const ad = mail.anfrage_daten && typeof mail.anfrage_daten === "object" ? mail.anfrage_daten : null;
    const kont = ad && ad.kontakt ? ad.kontakt : null;
    const interessentName = mail.kontakt_name || (kont ? [kont.anrede, kont.vorname, kont.nachname].filter(Boolean).join(" ") : "");
    const interessentMail = mail.kontakt_email || (kont && kont.email) || "";
    const istAnfrage = !!(interessentName || interessentMail);
    const wer = String(profile?.name || "").trim() || "der Makler";
    const firmaDesNutzers = await immoFirmenName(admin, profile?.mandant_id);
    const absender = mail.absender_name ? `${mail.absender_name} <${mail.absender_email}>` : (mail.absender_email || "unbekannt");
    const interessentTeil = istAnfrage ? `\n\nINTERESSENT (Empfänger deiner Antwort)\nName: ${interessentName || "unbekannt"}\nE-Mail: ${interessentMail || "unbekannt"}${kont && kont.telefon ? `\nTelefon: ${kont.telefon}` : ""}${ad && ad.portal ? `\nQuelle: ${ad.portal}` : ""}${ad && Array.isArray(ad.wuensche) && ad.wuensche.length ? `\nWünsche: ${ad.wuensche.join(", ")}` : ""}${ad && ad.nachricht ? `\nNachricht des Interessenten: ${String(ad.nachricht).slice(0, 1500)}` : ""}\nHinweis: Die Mail wurde von ${absender} übermittelt (Portal bzw. Kollege) — antworte dem Interessenten, nicht dem Übermittler.${objekt && /miet/i.test(String(objekt.vertragsart || "")) ? "\nDas Objekt ist ein MIETOBJEKT: provisionsfrei, Exposé als Anhang, kein Freigabelink." : objekt ? "\nDas Objekt ist ein KAUFOBJEKT: Exposé über den persönlichen Link {expose_link}." : ""}` : "";
    const unterlagenTeil = unterlagen.length ? `\n\nVERFÜGBARE UNTERLAGEN ZUM OBJEKT (id · Name · Typ · Freigabe)\n${unterlagen.map((u) => `- ${u.id} · ${u.name} · ${u.typ} · ${u.freigegeben ? "für Kunden freigegeben" : "intern (nur nach Rücksprache)"}`).join("\n")}\nBeantworte zuerst alle Fragen vollständig im Text aus dem Objektwissen. Unterlagen, die dazu passen (Exposé, Grundriss, Energieausweis, Wirtschaftsplan, Teilungserklärung, Protokolle), kannst du ZUSÄTZLICH mitschicken: dann ein kurzer Satz am Ende ("Die Unterlagen dazu füge ich Ihnen bei.") und als ALLERLETZTE Zeile: [[ANHAENGE: id, id]] — nur ids aus dieser Liste, bevorzugt freigegebene; interne nur, wenn sie eine konkrete Frage betreffen. Der Anhang ersetzt NIE die Antwort im Text. Passt nichts: keine Marker-Zeile.` : "";
    const objektTeil = objekt ? `\n\nOBJEKT (${objektHerkunft}; Fakten aus ${wissen.length} ausgewerteten Unterlagen)\n---\n${objektBlock(objekt, wissenNachRelevanz(wissen, `${mail.betreff || ""} ${mailText}`))}\n---${unterlagenTeil}\n` : "";

    const userPrompt = `
Eine E-Mail ist eingegangen. Formuliere bitte einen Antwort-Entwurf in meinem Schreibstil.

ABSENDER: ${absender}
BETREFF: ${mail.betreff || "(kein Betreff)"}
DATUM: ${mail.gesendet_am ? new Date(mail.gesendet_am).toLocaleString("de-DE") : "?"}${interessentTeil}

NACHRICHT:
---
${mailText || "(Kein Text-Inhalt)"}
---${objektTeil}

${absichtBlock(body.absicht)}

Antworte nur mit dem reinen Mail-Text (kein "Hier ist ihr Entwurf:", keine Erklärungen).
Wenn dir Informationen fehlen, nutze Platzhalter wie [ZU PRÜFEN: ...].
`.trim();

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 6000, system: stilProfil(wer, firmaDesNutzers, gelernterStil), messages: [{ role: "user", content: userPrompt }] }) });
    if (!anthropicResponse.ok) { const errText = await anthropicResponse.text(); console.error("Anthropic API Fehler:", anthropicResponse.status, errText); return jsonErr(500, `KI-Anfrage fehlgeschlagen (${anthropicResponse.status}): ${errText.slice(0, 300)}`); }
    const anthropicData = await anthropicResponse.json();
    let antwortText = anthropicData?.content?.[0]?.text || "";
    if (!antwortText) return jsonErr(500, "KI hat leere Antwort geliefert");
    if (anthropicData?.stop_reason === "max_tokens") {
      try {
        const r2 = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4000, system: stilProfil(wer, firmaDesNutzers, gelernterStil), messages: [{ role: "user", content: userPrompt }, { role: "assistant", content: antwortText }, { role: "user", content: "Deine Antwort wurde am Ausgabelimit abgeschnitten. Setze exakt an der Abbruchstelle fort — ohne Wiederholung, ohne Anrede, ohne Einleitung — bis alle Fragen beantwortet sind und die Mail regulär mit \"Mit freundlichen Grüßen\" und dem Namen des Absenders endet." }] }) });
        if (r2.ok) { const d2 = await r2.json(); const t2 = d2?.content?.[0]?.text || ""; if (t2) antwortText = antwortText.replace(/\s+$/, "") + (antwortText.endsWith("\n") || /^\s/.test(t2) ? "" : " ") + t2.replace(/^\s+/, ""); }
      } catch (e) { console.warn("Fortsetzung:", e); }
    }
    let anhaengeEmpfehlung: any[] = [];
    const am = antwortText.match(/\[\[ANHAENGE:\s*([^\]]*)\]\]/i);
    if (am) { const ids = am[1].split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean); anhaengeEmpfehlung = unterlagen.filter((u) => ids.includes(u.id)); antwortText = antwortText.replace(am[0], "").replace(/\n{3,}$/, "\n").trim(); }
    try { await admin.from("mail_ki_log").insert({ benutzer_id: userId, mail_eingang_id, eingabe_zeichen: userPrompt.length, ausgabe_zeichen: antwortText.length, model: "claude-sonnet-4-6", input_tokens: anthropicData?.usage?.input_tokens || null, output_tokens: anthropicData?.usage?.output_tokens || null }); } catch (e) { console.warn("mail_ki_log:", e); }
    return new Response(JSON.stringify({ ok: true, entwurf: antwortText, usage: anthropicData?.usage || null, interessent: istAnfrage ? { name: interessentName, email: interessentMail } : null, objekt: objekt ? { id: objekt.id, immo_nr: objekt.immo_nr, bezeichnung: objekt.bezeichnung || objekt.objekttitel, herkunft: objektHerkunft, vertragsart: objekt.vertragsart, wissen_anzahl: wissen.length, fakten_anzahl: wissen.reduce((s, w) => s + (Array.isArray(w.fakten) ? w.fakten.length : 0), 0) } : null, unterlagen, anhaenge_empfehlung: anhaengeEmpfehlung }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) { console.error("Unerwarteter Fehler:", e); return jsonErr(500, e instanceof Error ? e.message : String(e)); }
});
function jsonErr(status: number, msg: string) { return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
