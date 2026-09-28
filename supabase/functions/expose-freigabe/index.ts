// ============================================================================
// expose-freigabe v16 (Deploy-Version 24; öffentlich, ohne JWT — Zugriff nur per Token aus dem Link)
//   v16 (20.09.): Kunden sehen die BÜRONUMMER der Gesellschaft (firma_stammdaten.telefon, Rueckfall leer) statt der
//        Mobilnummer des Maklers – auf der Seite (laden) und in der Bestätigungsmail.
//   v15 (20.09.): Nach Widerruf (expose_freigaben.widerrufen_am, über die Objektseite) ist der Token ungültig – laden/download/bestaetigen 404.
//   v14 (Stufe 53, Objekt-Landingpage): Freigaben mit landing=true führen auf objekt.html?t= (Redirect, Bestätigungsmail);
//        "laden" liefert landing/abgesagt/widerrufen; Antwort von "bestaetigen" enthält objektseite (Link zur Objektseite),
//        wenn die Freigabe landing=true hat oder portal_einstellungen.landing_standard gesetzt ist.
//   GET  ?t=TOKEN                       -> 302 auf die Seite bei Netlify (freigabe.html?expose=TOKEN)
//   POST { token, aktion: "laden" }      -> Daten für die Seite (JSON), setzt geoeffnet_am
//   POST { token, aktion: "bestaetigen", haken, newsletter? } -> Protokoll + Mails + Download-Liste
//   POST { token, aktion: "download" }   -> Download-Liste (nur nach Bestätigung)
//   Download-Liste = finales Exposé + alle Unterlagen mit interessenten_freigabe; Signed-URLs 7 Tage.
//   Info-Mail an den Makler, Vermerke/Glocke per DB-Trigger.
//   v11: Links (Redirect, Bestätigungsmail) zeigen direkt auf freigabe.html?expose= statt /?expose=.
//   v12: Newsletter-Haken landet am Kontakt (newsletter_opt_in) und in newsletter_anmeldungen (mit Objektart).
//   v13: Anforderung direkt aus dem Newsletter, ohne vorab angelegte Freigabe:
//        POST { aktion: "objekt_laden", immobilie_id, nl?, kampagne? }
//             -> Objekt, Provisionsmodell/-text (wie expose-freigabe-erstellen, aber nur bei eindeutiger Angabe:
//                Miete, provisionsfrei oder Außenprovision > 0), Vorbelegung Name/E-Mail aus der Newsletter-Anmeldung (nl = abmelde_token)
//        POST { aktion: "objekt_bestaetigen", immobilie_id, nl?, kampagne?, name, email, haken, newsletter? }
//             -> Kontakt suchen/anlegen, Freigabe anlegen (Exposé final bzw. neuestes, Unterlagen mit interessenten_freigabe),
//                dann derselbe Ablauf wie "bestaetigen" (Protokoll, Mails, Download-Liste); Herkunft in bestaetigungen.herkunft.
//        Newsletter-Zustimmung aus dem Download gilt als bestätigt (bestaetigt_am); keine zweite Anmeldung je Adresse.
//   Quelle im Repo: portal/expose-freigabe/expose-freigabe.ts (Seite: freigabe.html)
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const AGB_URL = "https://immooffice.example/agb";
const DATENSCHUTZ_URL = "https://immooffice.example/datenschutz";
const LINK_BASIS = (Deno.env.get("EXPOSE_FREIGABE_BASIS") || "https://immooffice.example/?expose=").replace(/\/\?expose=$/, "/freigabe.html?expose=");
const OBJEKT_BASIS = LINK_BASIS.replace(/freigabe\.html\?expose=$/, "objekt.html?t=");
async function landingStandard(db: any): Promise<boolean> {
  try { const { data } = await db.from("portal_einstellungen").select("wert").eq("schluessel", "landing_standard").maybeSingle(); return data ? data.wert === true : true; } catch (_e) { return true; }
}

function widerrufsbelehrung(firma: any) {
  const adr = `${firma.firma_name}, ${firma.strasse}, ${firma.plz} ${firma.ort}, E-Mail: ${firma.email}`;
  return `Widerrufsrecht\nSie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.\nUm Ihr Widerrufsrecht auszuüben, müssen Sie uns (${adr}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.\nZur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.\n\nFolgen des Widerrufs\nWenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.\nHaben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.\n\nMuster-Widerrufsformular\n(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)\nAn ${adr}\nHiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: Maklervertrag / Nachweis- und Vermittlungstätigkeit\nBestellt am (*)/erhalten am (*): ______\nName des/der Verbraucher(s): ______\nAnschrift des/der Verbraucher(s): ______\nUnterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier), Datum\n(*) Unzutreffendes streichen.`;
}
const BEGINN_TEXT = "Ich verlange ausdrücklich, dass Sie mit der Erbringung Ihrer Maklerleistung (Zusendung des Exposés und weiterer Objektinformationen) bereits vor Ablauf der Widerrufsfrist beginnen. Mir ist bekannt, dass ich bei vollständiger Vertragserfüllung durch Sie mein Widerrufsrecht verliere und bei einem Widerruf während der Frist Wertersatz für die bis dahin erbrachte Leistung schulde.";

async function lade(db: any, t: string) {
  const { data: f } = await db.from("expose_freigaben").select("*").eq("token", t).maybeSingle();
  if (!f) return null;
  const { data: im } = await db.from("immobilien").select("id, immo_nr, objekttitel, bezeichnung, strasse, hausnummer, plz, ort, vertragsart, angebotspreis, kaltmiete, wohnflaeche, zimmer, hauptbild_url, adresse_freigeben, zustaendig_id").eq("id", f.immobilie_id).maybeSingle();
  const { data: firma } = await db.from("firma_stammdaten").select("firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon").eq("slug", f.firma_slug || "standard").maybeSingle();
  const { data: maklerRoh } = im?.zustaendig_id ? await db.from("profiles").select("id, name, email, telefon, titel").eq("id", im.zustaendig_id).maybeSingle() : { data: null };
  const firmaFertig = firma || { firma_name: "Musterhaus Immobilien GmbH", strasse: "", plz: "", ort: "", email: "info@immooffice.example", telefon: null };
  // v16: Kunden bekommen die Büronummer, nie die Mobilnummer des Maklers
  const bueroTel = firmaFertig.telefon || "";
  const makler = maklerRoh ? { ...maklerRoh, telefon: bueroTel } : null;
  return { f, im, firma: { ...firmaFertig, telefon: bueroTel }, makler };
}

// Download-Paket: finales Exposé + freigegebene Unterlagen (Signed-URLs 7 Tage)
async function downloadListe(db: any, f: any): Promise<{ name: string; url: string; typ: string }[]> {
  const out: { name: string; url: string; typ: string }[] = [];
  const sign = async (d: any, typ: string) => { if (!d?.storage_path) return; const { data: s } = await db.storage.from("immobilie-dateien").createSignedUrl(d.storage_path, 60 * 60 * 24 * 7, { download: d.name }); if (s?.signedUrl) out.push({ name: d.name, url: s.signedUrl, typ }); };
  const { data: exp } = await db.from("immobilie_datei").select("id, name, storage_path, expose_final, created_at").eq("immobilie_id", f.immobilie_id).eq("expose_final", true).order("created_at", { ascending: false }).limit(1);
  let expose = exp && exp[0];
  if (!expose) { const { data: d } = await db.from("immobilie_datei").select("id, name, storage_path").eq("id", f.expose_datei_id).maybeSingle(); expose = d; }
  if (expose) await sign(expose, "Exposé");
  const { data: doks } = await db.from("immobilie_datei").select("id, name, storage_path, doktyp, kategorie").eq("immobilie_id", f.immobilie_id).eq("interessenten_freigabe", true).order("created_at", { ascending: true }).limit(20);
  for (const d of doks || []) { if (expose && d.id === expose.id) continue; await sign(d, d.doktyp || (d.kategorie === "grundriss" ? "Grundriss" : d.kategorie === "lageplan" ? "Lageplan" : "Unterlage")); }
  return out;
}

function tokenNeu(): string { const b = new Uint8Array(24); crypto.getRandomValues(b); return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join(""); }
function provisionNorm(p: unknown): string {
  let s = String(p ?? "").trim(); if (!s) return "";
  s = s.replace(/\s*%\s*$/, "").replace(/\s+/g, " ");
  if (/^\d+([.,]\d+)?$/.test(s)) s = s.replace(".", ",") + " %"; else if (!/%/.test(s)) s = s + " %";
  return s;
}
// v13: Provision für den Direktweg – nur bei eindeutiger Angabe am Objekt (sonst null -> kein Direktdownload).
function provisionErmitteln(im: any): { modell: string; text: string } | null {
  const istMiete = /miet/i.test(String(im?.vertragsart || ""));
  const provision = provisionNorm(im?.provision_aussen);
  const null_ = /^0([.,]0+)? %$/.test(provision);
  let modell: string;
  if (istMiete) modell = "miete"; else if (im?.provisionsfrei || null_) modell = "provisionsfrei"; else if (provision) modell = "kaeufer"; else return null;
  const text = modell === "miete" ? "Für Sie als Mieter fallen keine Maklerkosten an (Bestellerprinzip, § 2 WoVermRG)."
    : modell === "provisionsfrei" ? "Der Erwerb dieser Immobilie ist für Sie als Käufer provisionsfrei."
    : `Im Falle des Erwerbs der Immobilie zahlen Sie als Käufer eine Maklerprovision in Höhe von ${provision} inkl. der gesetzlichen Mehrwertsteuer, berechnet auf den beurkundeten Kaufpreis. Die Provision ist ausschließlich dann verdient und fällig, wenn ein notarieller Kaufvertrag über diese Immobilie mit Ihnen zustande kommt. Das Anfordern des Exposés, Besichtigungen und unsere Beratung sind für Sie kostenfrei – entscheiden Sie sich gegen den Kauf, entstehen Ihnen keinerlei Kosten.`;
  return { modell, text };
}
async function exposeSuchen(db: any, immobilieId: string) {
  const { data: dateien } = await db.from("immobilie_datei").select("id, name, storage_path, created_at, expose_final, interessenten_freigabe").eq("immobilie_id", immobilieId).order("created_at", { ascending: false }).limit(200);
  const exposes = (dateien || []).filter((d: any) => /\.pdf$/i.test(d.name || "") && (/\/expose\//i.test(d.storage_path || "") || /expos/i.test(d.name || "")));
  const expose = exposes.find((d: any) => d.expose_final) || exposes[0] || null;
  const dokumente = expose ? (dateien || []).filter((d: any) => d.interessenten_freigabe && d.storage_path && d.id !== expose.id).map((d: any) => d.id) : [];
  return { expose, dokumente };
}
async function nlVorbelegung(db: any, nl: unknown) {
  const t = String(nl || "").trim();
  if (!t || t === "beispiel" || !/^[0-9a-f-]{36}$/i.test(t)) return null;
  try { const { data } = await db.from("newsletter_anmeldungen").select("id, email, name, kontakt_id").eq("abmelde_token", t).maybeSingle(); return data || null; } catch (_e) { return null; }
}

async function resend(key: string, payload: any) {
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) console.error("Resend:", r.status, await r.text());
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    if (req.method === "GET") {
      const u = new URL(req.url); const t = u.searchParams.get("t") || u.searchParams.get("expose") || "";
      if (t) { const { data: fl } = await db.from("expose_freigaben").select("landing").eq("token", t).maybeSingle(); if (fl?.landing) return new Response(null, { status: 302, headers: { ...cors, Location: `${OBJEKT_BASIS}${encodeURIComponent(t)}` } }); }
      // Weiter zur kleinen Bestätigungsseite bei Netlify (freigabe.html liest ?expose= selbst aus).
      // Direkt aus der Function lässt sich die Seite nicht ausliefern: Supabase setzt für
      // Function-Antworten text/plain und eine CSP-Sandbox.
      return new Response(null, { status: 302, headers: { ...cors, Location: `${LINK_BASIS}${encodeURIComponent(t)}` } });
    }
    const body = await req.json().catch(() => ({}));
    let herkunft: any = null;

    // v13: Direktweg aus dem Newsletter – Objekt statt Token
    if (body.aktion === "objekt_laden" || body.aktion === "objekt_bestaetigen") {
      const immobilieId = String(body.immobilie_id || "").trim();
      const { data: im } = immobilieId ? await db.from("immobilien").select("id, immo_nr, objekttitel, bezeichnung, strasse, hausnummer, plz, ort, vertragsart, angebotspreis, kaltmiete, wohnflaeche, zimmer, hauptbild_url, adresse_freigeben, provision_aussen, provisionsfrei, zustaendig_id, status").eq("id", immobilieId).maybeSingle() : { data: null as any };
      if (!im) return json({ ok: false, fehler: "Dieses Objekt ist nicht (mehr) verfügbar." }, 404);
      const prov = provisionErmitteln(im);
      const { expose, dokumente } = await exposeSuchen(db, im.id);
      const anm = await nlVorbelegung(db, body.nl);
      const { data: makler } = im.zustaendig_id ? await db.from("profiles").select("id, name, email, telefon, firma_id").eq("id", im.zustaendig_id).maybeSingle() : { data: null as any };
      let firmaSlug = "standard";
      if (makler?.firma_id) { const { data: fs } = await db.from("firma_stammdaten").select("slug").eq("id", makler.firma_id).maybeSingle(); if (fs?.slug) firmaSlug = fs.slug; }
      const { data: firmaRow } = await db.from("firma_stammdaten").select("firma_name, strasse, plz, ort, email, web, hrb, registergericht, geschaeftsfuehrer, ust_id, telefon").eq("slug", firmaSlug).maybeSingle();
      const firma = firmaRow || { firma_name: "Musterhaus Immobilien GmbH", strasse: "", plz: "", ort: "", email: "info@immooffice.example", telefon: null };
      if (!prov || !expose) return json({ ok: false, fehler: `Für dieses Objekt ist der sofortige Exposé-Download derzeit nicht möglich. Bitte fordern Sie das Exposé per E-Mail an: ${makler?.email || firma.email}` }, 409);

      if (body.aktion === "objekt_laden") {
        const { provision_aussen: _pa, provisionsfrei: _pf, zustaendig_id: _z, status: _st, ...imPub } = im;
        return json({ ok: true, objekt: true, im: imPub, firma, makler: makler ? { name: makler.name, email: makler.email, telefon: firma.telefon || "" } : null,
          provisionsmodell: prov.modell, provision_text: prov.text, vorbelegt: anm ? { name: anm.name || "", email: anm.email || "" } : null, unterlagen_anzahl: dokumente.length,
          texte: { widerrufsbelehrung: widerrufsbelehrung(firma), beginn_text: BEGINN_TEXT, agb_url: AGB_URL, datenschutz_url: DATENSCHUTZ_URL } });
      }

      const email = String(body.email || "").replace(/^.*<([^>]+)>.*$/, "$1").trim().toLowerCase();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, fehler: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
      const name = String(body.name || "").trim().slice(0, 120) || anm?.name || null;
      let kontaktId: string | null = null;
      const { data: kk } = await db.from("kontakte").select("id").ilike("email", email).eq("aktiv", true).limit(1);
      kontaktId = kk && kk[0] ? kk[0].id : null;
      if (!kontaktId && anm?.kontakt_id && anm.email && anm.email.toLowerCase() === email) kontaktId = anm.kontakt_id;
      if (!kontaktId) {
        const teile = String(name || "").split(/\s+/).filter(Boolean); const nachname = teile.length ? teile.pop() : null; const vorname = teile.join(" ") || null;
        const { data: kn, error: kErr } = await db.from("kontakte").insert({ vorname, nachname, email, rollen: ["interessent"], quelle: "newsletter", aktiv: true, zustaendig_id: im.zustaendig_id || null }).select("id").single();
        if (kErr) console.error("Kontakt anlegen:", kErr); kontaktId = kn?.id || null;
      }
      const tNeu = tokenNeu();
      const { error: insErr } = await db.from("expose_freigaben").insert({ token: tNeu, immobilie_id: im.id, kontakt_id: kontaktId, email, name, provisionsmodell: prov.modell, provision_text: prov.text, firma_slug: firmaSlug, erstellt_von: null, expose_datei_id: expose.id, dokument_ids: dokumente });
      if (insErr) { console.error("objekt_bestaetigen insert:", insErr); return json({ ok: false, fehler: "Die Anforderung konnte nicht gespeichert werden (" + insErr.message + "). Bitte versuchen Sie es erneut." }, 500); }
      herkunft = { quelle: "newsletter", kampagne_id: String(body.kampagne || "").trim() || null, newsletter_anmeldung_id: anm?.id || null };
      body.token = tNeu; body.aktion = "bestaetigen";
    }

    const t = String(body.token || "");
    const ctx = t ? await lade(db, t) : null;
    if (!ctx) return json({ ok: false, fehler: "Dieser Exposé-Link ist nicht (mehr) gültig." }, 404);
    const { f, im, firma, makler } = ctx;
    if (f.widerrufen_am) return json({ ok: false, fehler: "Dieser Link wurde nach Ihrem Widerruf deaktiviert." }, 404);

    if (body.aktion === "laden") {
      if (!f.geoeffnet_am) await db.from("expose_freigaben").update({ geoeffnet_am: new Date().toISOString() }).eq("id", f.id);
      const { ip: _ip, user_agent: _ua, bestaetigungen: _b, token: _t, ...fPub } = f;
      const { count } = await db.from("immobilie_datei").select("id", { count: "exact", head: true }).eq("immobilie_id", f.immobilie_id).eq("interessenten_freigabe", true);
      return json({ ok: true, f: fPub, im, firma, makler: makler ? { name: makler.name, email: makler.email, telefon: makler.telefon } : null, unterlagen_anzahl: count || 0,
        texte: { widerrufsbelehrung: widerrufsbelehrung(firma), beginn_text: BEGINN_TEXT, agb_url: AGB_URL, datenschutz_url: DATENSCHUTZ_URL } });
    }

    if (body.aktion === "download") {
      if (!f.bestaetigt_am) return json({ ok: false, fehler: "Bitte zuerst bestätigen." }, 403);
      const liste = await downloadListe(db, f);
      if (!liste.length) return json({ ok: false, fehler: "Exposé-Datei nicht gefunden." }, 404);
      await db.from("expose_freigaben").update({ downloads: (f.downloads || 0) + 1, letzter_download_am: new Date().toISOString() }).eq("id", f.id);
      return json({ ok: true, download_url: liste[0].url, downloads: liste });
    }

    if (body.aktion === "bestaetigen") {
      if (new Date(f.gueltig_bis) < new Date() && !f.bestaetigt_am) return json({ ok: false, fehler: "Der Link ist abgelaufen." }, 410);
      // v14: Objektseite als Standard (portal_einstellungen.landing_standard) – vor der Bestätigungsmail festlegen
      if (!f.landing && await landingStandard(db)) { f.landing = true; await db.from("expose_freigaben").update({ landing: true }).eq("id", f.id); }
      const h = body.haken || {};
      for (const k of ["agb", "datenschutz", "widerruf", "beginn", "provision"]) if (!h[k]) return json({ ok: false, fehler: "Bitte alle Pflichtfelder bestätigen." }, 400);
      const jetzt = new Date().toISOString();
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || null;
      const wb = widerrufsbelehrung(firma);
      const titel = im?.objekttitel || im?.bezeichnung || "Immobilie";
      const zeit = new Date(jetzt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
      if (!f.bestaetigt_am) {
        // v10: Fehler beim Protokollieren nicht mehr verschlucken — ohne Protokoll kein Download.
        const { error: upErr } = await db.from("expose_freigaben").update({
          bestaetigt_am: jetzt, ip, user_agent: req.headers.get("user-agent") || null, newsletter: !!body.newsletter,
          bestaetigungen: { haken: h, provision_text: f.provision_text, provisionsmodell: f.provisionsmodell, widerrufsbelehrung: wb, beginn_text: BEGINN_TEXT, agb_url: AGB_URL, datenschutz_url: DATENSCHUTZ_URL, zeitpunkt: jetzt, ...(herkunft ? { herkunft } : {}) },
          downloads: (f.downloads || 0) + 1, letzter_download_am: jetzt,
        }).eq("id", f.id);
        if (upErr) { console.error("expose-freigabe bestaetigen:", upErr); return json({ ok: false, fehler: "Die Bestätigung konnte nicht gespeichert werden (" + upErr.message + "). Bitte versuchen Sie es erneut oder melden Sie sich bei uns." }, 500); }
        if (body.newsletter) {
          // v12: Zustimmung am Kontakt und als eigener Datensatz (Herkunft: Objekt, Objektart) – Fehler hier blockieren den Download nicht.
          try {
            const mail = String(f.email || "").trim().toLowerCase();
            const { data: imArt } = await db.from("immobilien").select("objektart, vertragsart").eq("id", f.immobilie_id).maybeSingle();
            let kontaktId = f.kontakt_id || null;
            if (!kontaktId && mail) { const { data: k } = await db.from("kontakte").select("id").ilike("email", mail).eq("aktiv", true).limit(1); kontaktId = k && k[0] ? k[0].id : null; }
            // v13: keine zweite aktive Anmeldung je Adresse; Zustimmung aus dem Download gilt als bestätigt (bestaetigt_am)
            const { data: vorhanden } = await db.from("newsletter_anmeldungen").select("id").or(`freigabe_id.eq.${f.id},and(email.ilike.${mail},widerrufen_am.is.null)`).limit(1);
            if (!vorhanden || !vorhanden.length) await db.from("newsletter_anmeldungen").insert({ kontakt_id: kontaktId, email: mail, name: f.name || null, quelle: "expose_download", immobilie_id: f.immobilie_id, immo_nr: im?.immo_nr ? String(im.immo_nr) : null, objektart: imArt?.objektart || null, vertragsart: imArt?.vertragsart || im?.vertragsart || null, freigabe_id: f.id, angemeldet_am: jetzt, bestaetigt_am: jetzt, ip });
            const quelle = "Exposé-Download" + (im?.immo_nr ? " Objekt " + im.immo_nr : "");
            if (kontaktId) await db.from("kontakte").update({ newsletter_opt_in: true, newsletter_opt_in_am: jetzt, newsletter_quelle: quelle }).eq("id", kontaktId);
            else if (mail) await db.from("kontakte").update({ newsletter_opt_in: true, newsletter_opt_in_am: jetzt, newsletter_quelle: quelle }).ilike("email", mail);
          } catch (e) { console.error("Newsletter-Zustimmung:", e); }
        }
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (resendKey) {
          const absender = makler?.email && /@immooffice.example\.de$/i.test(makler.email) ? `${makler.name} <${makler.email}>` : `${firma.firma_name} <${firma.email}>`;
          const text = `Guten Tag${f.name ? " " + f.name : ""},\n\nvielen Dank für Ihre Beauftragung vom ${zeit} Uhr zur Immobilie „${titel}“${im?.immo_nr ? ` (Objekt-Nr. ${im.immo_nr})` : ""}.\n\nSie können das Exposé und die freigegebenen Unterlagen jederzeit über Ihren persönlichen Link erneut herunterladen:\n${f.landing ? OBJEKT_BASIS : LINK_BASIS}${t}\n${f.landing ? "Dort finden Sie außerdem alle Bilder, Eckdaten und Unterlagen zum Objekt, können Besichtigungstermine vorschlagen und Fragen stellen.\n" : ""}\nWie gesetzlich vorgesehen erhalten Sie hiermit die von Ihnen bestätigten Texte in Textform:\n\nPROVISION\n${f.provision_text}\n\nVORZEITIGER BEGINN\n${BEGINN_TEXT}\n\nWIDERRUFSBELEHRUNG\n${wb}\n\nAGB: ${AGB_URL}\nDatenschutz: ${DATENSCHUTZ_URL}\n\nBei Fragen erreichen Sie uns jederzeit${makler?.telefon ? " unter " + makler.telefon : ""}.\n\nMit freundlichen Grüßen\n${makler?.name || firma.firma_name}\n${firma.firma_name}\n${firma.strasse}, ${firma.plz} ${firma.ort}`;
          const ok1 = await resend(resendKey, { from: absender, to: [f.email], reply_to: makler?.email || firma.email, subject: `Ihre Beauftragung und das Exposé „${titel}“`, text });
          if (ok1) await db.from("expose_freigaben").update({ bestaetigungsmail_am: jetzt }).eq("id", f.id);
          try {
            let empf = makler?.email || null;
            if (!empf && f.erstellt_von) { const { data: e } = await db.from("profiles").select("email").eq("id", f.erstellt_von).maybeSingle(); empf = e?.email || null; }
            if (!empf && herkunft) empf = firma.email; // v13: Newsletter-Anforderung ohne zuständigen Makler -> Firmenpostfach
            if (empf) {
              const info = `${f.name || f.email} hat soeben (${zeit} Uhr) den Makler ${f.provisionsmodell === "kaeufer" ? "PROVISIONSPFLICHTIG " : ""}beauftragt und das Exposé heruntergeladen.${herkunft ? "\n\nHerkunft: Newsletter (Anforderung direkt aus der Mail)" : ""}\n\nObjekt: ${titel}${im?.immo_nr ? ` (Nr. ${im.immo_nr})` : ""}\nInteressent: ${f.name || "–"} <${f.email}>\nProvision: ${f.provisionsmodell === "kaeufer" ? "Provisionsvereinbarung akzeptiert" : f.provisionsmodell}\nNewsletter: ${body.newsletter ? "ja" : "nein"}\nIP: ${ip || "–"}\n\nDer Vorgang ist als Vermerk am Objekt und am Kontakt hinterlegt (ImmoOffice → Objekt → Aktivitäten).`;
              await resend(resendKey, { from: `ImmoOffice <${firma.email}>`, to: [empf], subject: `✓ Exposé-Beauftragung: ${f.name || f.email} – ${titel}`, text: info });
            }
          } catch (e) { console.error("Makler-Info:", e); }
        }
      } else {
        await db.from("expose_freigaben").update({ downloads: (f.downloads || 0) + 1, letzter_download_am: jetzt }).eq("id", f.id);
      }
      const liste = await downloadListe(db, f);
      if (!liste.length) return json({ ok: false, fehler: "Beauftragung gespeichert, aber die Exposé-Datei wurde nicht gefunden. Wir melden uns bei Ihnen." }, 500);
      return json({ ok: true, download_url: liste[0].url, downloads: liste, ...(f.landing ? { objektseite: `${OBJEKT_BASIS}${t}` } : {}), ...(herkunft ? { link: f.landing ? `${OBJEKT_BASIS}${t}` : `${LINK_BASIS}${t}` } : {}) });
    }
    return json({ ok: false, fehler: "Unbekannte Aktion." }, 400);
  } catch (e) {
    console.error("expose-freigabe:", e);
    return json({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
