// ============================================================================
// abnahme-abschliessen — ein Neubau-Protokoll abschliessen (fork_85)
// ============================================================================
// Eigene Function des Forks. Auftrag „Bautraeger v2", Abschnitte C und D:
// Das Uebergabeprotokoll im Neubau-Modus (Vorabnahme, Abnahme, Nachabnahme)
// wird hier zum Vorgang. Die Oberflaeche hat das Protokoll gespeichert und
// das PDF erzeugt (clientseitig, wie bei jedem Protokoll); diese Function
// tut, was danach IM HAUS passieren muss — in einem Zug, damit nichts
// halb geschieht:
//
//   1. PDF in den Bucket projekt-dateien, als projekt_datei am Kaeufer
//      (zugang_id) — NICHT freigegeben. Der Kaeufer bekommt es erst, wenn
//      die Verwaltung „An Kaeufer senden" klickt (Auftrag D: Mails an Kaeufer
//      nie automatisch).
//   2. Maengel aus den Raeumen des Protokolls werden zu projekt_maengel
//      (quelle abnahme), mit Raum, Gewerk, Handwerker, Frist, Fotos im
//      Storage. Jeder bekommt seinen Handwerker-Token. Was schon angelegt
//      ist (db_id im Protokoll), wird nicht noch einmal angelegt — die
//      Function ist wiederholbar.
//   3. Je Mangel mit Frist ein To-do der Verwaltung aus der Vorlage
//      „Maengelbeseitigung", verknuepft mit Mangel und Protokoll; dazu ein
//      todo_vorgang je Protokoll.
//   4. Verwaltung: Glocke, Push, interne Mail. Handwerker: EINE Sammelmail
//      je Handwerker mit seinen Maengeln und dem Token-Link (automatisch,
//      Auftrag D). Kaeufer: nichts — siehe 1.
//   5. Zeitleisten: vermerke am Objekt und an den Kontakten,
//      projekt_aktivitaeten, Verlauf je Mangel.
//
// Sicherheit: der Aufrufer ist angemeldet (verify_jwt) und aus dem Team;
// das Protokoll muss zu SEINEM Mandanten gehoeren (immoMandantSichern).
// Der Dienstschluessel wird erst danach benutzt.
//
// Zwei Zusatz-Aktionen fuer EINZELNE Maengel, weil sie dieselbe Mail und
// denselben Token brauchen (Auftrag D: Kundenmeldungen laufen in denselben
// Workflow — die Verwaltung ordnet Gewerk/Handwerker zu, ab dann identisch):
//   {aktion: "mangel_beauftragen", mangel_id, projekt_kontakt_id, frist?}
//   {aktion: "mangel_zurueck",     mangel_id, text}   (Erledigung nicht anerkannt)
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { antwort, cors, dienst, appAdresse, tokenNeu, datumDe, heute, tageDazu, mailen, push, glocke, vermerk, aktivitaet, verlauf, verwaltung, bytesAus, endung, firmenName } from "./bautraeger.ts";

const TYP_NAME: Record<string, string> = { neubau_vorabnahme: "Vorabnahme", neubau_abnahme: "Abnahme", neubau_nachabnahme: "Nachabnahme" };

/** Der Aufrufer und sein Mandant — aus dem JWT, nie aus dem Koerper. */
async function immoMandantSichern(db: any, req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return null;
  const { data: p } = await db.from("profiles").select("id, name, email, role, mandant_id").eq("id", u.user.id).maybeSingle();
  if (!p?.mandant_id || !["chef", "mitarbeiter"].includes(String(p.role))) return null;
  return { id: String(p.id), name: String(p.name || p.email || ""), email: p.email as string | null, mandant: String(p.mandant_id) };
}

/** Einen Mangel beauftragen oder an den Handwerker zurueckgeben. Mandant: der des Aufrufers, geprueft am Mangel. */
async function mangelAktion(db: any, wer: { id: string; name: string; email: string | null; mandant: string }, aktion: string, body: Record<string, any>) {
  const mangelId = String(body.mangel_id || "");
  if (!mangelId) return antwort({ ok: false, fehler: "mangel_id fehlt." }, 400);
  const { data: m } = await db.from("projekt_maengel").select("*").eq("id", mangelId).maybeSingle();
  if (!m || m.mandant_id !== wer.mandant) return antwort({ ok: false, fehler: "Mangel nicht gefunden." }, 404);
  const { data: projekt } = await db.from("projekte").select("id, name, ort, frist_standard_tage, mandant_id").eq("id", m.projekt_id).maybeSingle();
  if (!projekt || projekt.mandant_id !== wer.mandant) return antwort({ ok: false, fehler: "Projekt nicht gefunden." }, 404);
  const app = appAdresse(); const firma = await firmenName(db, wer.mandant);
  let einheitText = "";
  if (m.einheit_id) { const { data: e } = await db.from("projekt_einheiten").select("we_nr").eq("id", m.einheit_id).maybeSingle(); if (e) einheitText = `WE ${e.we_nr}`; }
  const wo = `${projekt.name}${einheitText ? " · " + einheitText : ""}${m.raum ? " · " + m.raum : ""}`;
  const text = String(body.text || "").trim().slice(0, 2000);
  const kontaktId = String(body.projekt_kontakt_id || m.projekt_kontakt_id || "");
  if (!kontaktId) return antwort({ ok: false, fehler: "Bitte einen Handwerker zuordnen." }, 400);
  const { data: hk } = await db.from("projekt_kontakte").select("id, gewerk, firma, name, email, portal_token, kontakt_id").eq("id", kontaktId).eq("mandant_id", wer.mandant).eq("projekt_id", projekt.id).maybeSingle();
  if (!hk) return antwort({ ok: false, fehler: "Handwerker nicht in diesem Projekt." }, 404);
  let portalToken = hk.portal_token;
  if (!portalToken) { portalToken = tokenNeu(); await db.from("projekt_kontakte").update({ portal_token: portalToken }).eq("id", hk.id); }
  let mail = hk.email;
  if (!mail && hk.kontakt_id) { const { data: k } = await db.from("kontakte").select("email").eq("id", hk.kontakt_id).maybeSingle(); mail = k?.email || null; }
  const link = app ? `${app}/?handwerker=${portalToken}` : null;
  const anrede = `Guten Tag${hk.name ? " " + hk.name : ""},`;
  const gruss = firma ? `Mit freundlichen Grüßen\n${firma}` : "Mit freundlichen Grüßen";

  if (aktion === "mangel_beauftragen") {
    const frist = body.frist && /^\d{4}-\d{2}-\d{2}$/.test(String(body.frist)) ? String(body.frist) : (m.frist || tageDazu(heute(), Number(projekt.frist_standard_tage || 14)));
    const patch: Record<string, unknown> = { projekt_kontakt_id: hk.id, gewerk: m.gewerk || hk.gewerk || null, frist, status: "beauftragt", erinnert_am: null, mahnung_am: null };
    if (!m.handwerker_token) patch.handwerker_token = tokenNeu();
    if (!m.erstellt_von) patch.erstellt_von = wer.id;
    await db.from("projekt_maengel").update(patch).eq("id", m.id);
    let gesendet = false, grund = "";
    if (mail) {
      const r = await mailen(db, wer.mandant, mail, hk.firma || hk.name || null, `Auftrag: Mangelbeseitigung — ${m.titel}`,
        [anrede, "", `bitte beseitigen Sie folgenden Mangel im Projekt „${projekt.name}"${einheitText ? " (" + einheitText + ")" : ""}:`, "",
         `${m.titel}${m.raum ? ` — Raum: ${m.raum}` : ""} — Frist: ${datumDe(frist)}`, m.beschreibung ? `${m.beschreibung}` : "", text ? `\nHinweis: ${text}` : "",
         link ? `\nTermin, Erledigung (mit Foto) oder Rückfragen über Ihren Link — ohne Anmeldung:\n${link}` : "", "", gruss].join("\n"));
      gesendet = r.ok; grund = r.grund || "";
    } else grund = "keine E-Mail-Adresse";
    await verlauf(db, m.id, wer.name, gesendet ? "beauftragt" : "beauftragt_ohne_mail", gesendet ? `Auftrag an ${mail}, Frist ${datumDe(frist)}` : `Kein Versand: ${grund}`);
    // To-do der Verwaltung, falls noch keines haengt.
    if (!m.todo_id) {
      const { data: vorlageId } = await db.rpc("maengel_vorlage_sicherstellen", { p_mandant: wer.mandant });
      const { data: schritte } = await db.from("todo_vorlage_schritt").select("id, nr").eq("vorlage_id", vorlageId).eq("mandant_id", wer.mandant);
      const { data: t } = await db.from("todos").insert({ mandant_id: wer.mandant, titel: `Mangel: ${m.titel}${einheitText ? " (" + einheitText + ")" : ""}`,
        beschreibung: [m.raum ? `Raum: ${m.raum}` : "", `Gewerk: ${m.gewerk || hk.gewerk || "–"}`, m.beschreibung || ""].filter(Boolean).join("\n"),
        typ: "aufgabe", status: "laeuft", prioritaet: "normal", faellig_am: frist, ersteller_id: wer.id, zustaendig_id: m.erstellt_von || wer.id, team_sichtbar: true,
        tags: ["mangel", "neubau"], quelle: "system", vorlage_schritt_id: (schritte || []).find((s: any) => s.nr === 1)?.id || null,
        daten: { mangel_id: m.id, projekt_id: projekt.id, einheit_id: m.einheit_id || null } }).select("id").single();
      if (t) {
        await db.from("todo_verknuepfung").insert([{ mandant_id: wer.mandant, todo_id: t.id, objekt_typ: "mangel", objekt_id: m.id, label: m.titel.slice(0, 120) },
          ...(m.einheit_id ? [{ mandant_id: wer.mandant, todo_id: t.id, objekt_typ: "einheit", objekt_id: m.einheit_id, label: einheitText }] : [])]);
        await db.from("projekt_maengel").update({ todo_id: t.id }).eq("id", m.id);
      }
    }
    await aktivitaet(db, wer.mandant, projekt.id, m.zugang_id || null, "mangel_beauftragt", { mangel_id: m.id, titel: m.titel, handwerker: hk.firma || hk.name, frist, mail: gesendet });
    return antwort({ ok: true, status: "beauftragt", mail: gesendet, hinweis: gesendet ? null : grund, frist });
  }
  // mangel_zurueck: Erledigung nicht anerkannt — zurueck an den Handwerker, neue Frist.
  const frist = body.frist && /^\d{4}-\d{2}-\d{2}$/.test(String(body.frist)) ? String(body.frist) : tageDazu(heute(), 7);
  await db.from("projekt_maengel").update({ status: "beauftragt", frist, erinnert_am: null, mahnung_am: null, nachfrist: null }).eq("id", m.id);
  let gesendet = false, grund = "";
  if (mail) {
    const r = await mailen(db, wer.mandant, mail, hk.firma || hk.name || null, `Nachbesserung erforderlich — ${m.titel}`,
      [anrede, "", `die gemeldete Erledigung des Mangels „${m.titel}" (${wo}) konnten wir nicht anerkennen.`, text ? `\nBegründung: ${text}` : "", `\nBitte bessern Sie bis zum ${datumDe(frist)} nach.`,
       link ? `\nIhr Link:\n${link}` : "", "", gruss].join("\n"));
    gesendet = r.ok; grund = r.grund || "";
  } else grund = "keine E-Mail-Adresse";
  await verlauf(db, m.id, wer.name, "zurueck", `${text || "Erledigung nicht anerkannt"} — neue Frist ${datumDe(frist)}${gesendet ? "" : " (keine Mail: " + grund + ")"}`);
  if (m.todo_id) await db.from("todos").update({ status: "laeuft", faellig_am: frist, erledigt_am: null }).eq("id", m.todo_id);
  await aktivitaet(db, wer.mandant, projekt.id, m.zugang_id || null, "mangel_zurueck", { mangel_id: m.id, titel: m.titel, frist, mail: gesendet });
  return antwort({ ok: true, status: "beauftragt", mail: gesendet, hinweis: gesendet ? null : grund, frist });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = dienst();
  try {
    const wer = await immoMandantSichern(db, req);
    if (!wer) return antwort({ ok: false, fehler: "Nicht angemeldet oder nicht im Team." }, 401);
    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const aktion = String(body.aktion || "");
    if (aktion === "mangel_beauftragen" || aktion === "mangel_zurueck") return await mangelAktion(db, wer, aktion, body);
    const protokollId = String(body.protokoll_id || "");
    if (!protokollId) return antwort({ ok: false, fehler: "protokoll_id fehlt." }, 400);

    const { data: pr } = await db.from("uebergabeprotokoll").select("*").eq("id", protokollId).maybeSingle();
    if (!pr || pr.mandant_id !== wer.mandant) return antwort({ ok: false, fehler: "Protokoll nicht gefunden." }, 404);
    if (!pr.projekt_id || !String(pr.protokoll_typ).startsWith("neubau_")) {
      return antwort({ ok: false, fehler: "Nur ein Neubau-Protokoll (Vorabnahme, Abnahme, Nachabnahme) wird hier abgeschlossen." }, 400);
    }
    const mandant = wer.mandant;
    const { data: projekt } = await db.from("projekte").select("id, name, ort, frist_standard_tage, mandant_id").eq("id", pr.projekt_id).maybeSingle();
    if (!projekt || projekt.mandant_id !== mandant) return antwort({ ok: false, fehler: "Projekt nicht gefunden." }, 404);
    const { data: einheit } = pr.einheit_id
      ? await db.from("projekt_einheiten").select("id, we_nr, immobilie_id").eq("id", pr.einheit_id).maybeSingle()
      : { data: null };
    const { data: zugang } = pr.zugang_id
      ? await db.from("projekt_zugaenge").select("id, anzeigename, email, kontakt_id").eq("id", pr.zugang_id).maybeSingle()
      : { data: null };
    const typName = TYP_NAME[String(pr.protokoll_typ)] || "Abnahme";
    const einheitText = einheit?.we_nr ? `WE ${einheit.we_nr}` : "";
    const erstmals = !pr.abgeschlossen_am;
    const app = appAdresse();
    const firma = await firmenName(db, mandant);

    // --- 1. PDF ---------------------------------------------------------------------
    let pdfDateiId: string | null = pr.pdf_datei_id || null;
    let pdfPfad: string | null = pr.pdf_pfad || null;
    if (body.pdf_base64) {
      const pdf = bytesAus(String(body.pdf_base64), "application/pdf");
      if (pdf && pdf.bytes.length > 0 && pdf.bytes.length <= 25 * 1024 * 1024) {
        const name = String(body.pdf_name || `${typName}_${einheit?.we_nr || "Protokoll"}_${pr.uebergabe_datum || heute()}.pdf`).replace(/[^\w.\-äöüÄÖÜß ]+/g, "_");
        const pfad = `protokolle/${projekt.id}/${protokollId}.pdf`;
        const { error: upErr } = await db.storage.from("projekt-dateien").upload(pfad, pdf.bytes, { contentType: "application/pdf", upsert: true });
        if (upErr) throw new Error("PDF konnte nicht abgelegt werden: " + upErr.message);
        pdfPfad = pfad;
        if (pdfDateiId) {
          await db.from("projekt_dateien").update({ name, groesse: pdf.bytes.length }).eq("id", pdfDateiId).eq("mandant_id", mandant);
        } else {
          const { data: d, error: dErr } = await db.from("projekt_dateien").insert({
            mandant_id: mandant, projekt_id: projekt.id, einheit_id: pr.einheit_id || null, zugang_id: pr.zugang_id || null,
            name, pfad, content_type: "application/pdf", groesse: pdf.bytes.length, kategorie: "vertrag",
            sichtbarkeit: "kaeufer", hochgeladen_von: wer.id, freigegeben: false, benachrichtigt: true,
          }).select("id").single();
          if (dErr) throw new Error("projekt_dateien: " + dErr.message);
          pdfDateiId = d.id;
        }
      }
    }

    // --- 2. Maengel aus den Raeumen -------------------------------------------------------
    const raeume: any[] = Array.isArray(pr.raeume) ? pr.raeume : [];
    const fristStandard = Number(pr.frist_standard_tage || projekt.frist_standard_tage || 14);
    const neueMaengel: any[] = [];
    let geaendert = false;
    for (const raum of raeume) {
      const liste: any[] = Array.isArray(raum.maengel) ? raum.maengel : [];
      for (const m of liste) {
        if (m.db_id) continue;
        if (!String(m.titel || "").trim()) continue;
        const fotoPfade: string[] = [];
        const fotos: string[] = Array.isArray(m.foto_data_urls) ? m.foto_data_urls : [];
        const vorId = crypto.randomUUID();
        for (let i = 0; i < Math.min(fotos.length, 8); i++) {
          const f = bytesAus(fotos[i]); if (!f) continue;
          const pfad = `maengel/${projekt.id}/${vorId}/${i + 1}.${endung(f.mime)}`;
          const { error } = await db.storage.from("projekt-dateien").upload(pfad, f.bytes, { contentType: f.mime, upsert: true });
          if (!error) fotoPfade.push(pfad);
        }
        const frist = m.frist && /^\d{4}-\d{2}-\d{2}$/.test(m.frist) ? m.frist : tageDazu(heute(), fristStandard);
        const { data: neu, error } = await db.from("projekt_maengel").insert({
          id: vorId, mandant_id: mandant, projekt_id: projekt.id, einheit_id: pr.einheit_id || null, zugang_id: pr.zugang_id || null,
          quelle: "abnahme", protokoll_id: protokollId, raum: String(raum.name || "").slice(0, 120) || null,
          gewerk: m.gewerk ? String(m.gewerk).slice(0, 120) : null, projekt_kontakt_id: m.projekt_kontakt_id || null,
          frist, kategorie: m.kategorie ? String(m.kategorie).slice(0, 60) : null,
          titel: String(m.titel).trim().slice(0, 200), beschreibung: m.beschreibung ? String(m.beschreibung).slice(0, 4000) : null,
          foto_pfade: fotoPfade, status: m.projekt_kontakt_id ? "beauftragt" : "offen",
          handwerker_token: tokenNeu(), erstellt_von: wer.id,
          verlauf: [{ am: new Date().toISOString(), wer: wer.name, was: "angelegt", text: `${typName}${einheitText ? " " + einheitText : ""}, Raum ${raum.name || "–"}` }],
        }).select("*").single();
        if (error) throw new Error("projekt_maengel: " + error.message);
        m.db_id = neu.id; m.foto_pfade = fotoPfade; delete m.foto_data_urls;   // Fotos liegen jetzt im Storage, nicht mehr im Protokoll
        neueMaengel.push(neu); geaendert = true;
      }
    }

    // --- 3. To-dos aus der Vorlage „Maengelbeseitigung" -----------------------------------------
    let vorgangId: string | null = null;
    if (neueMaengel.some((m) => m.frist)) {
      const { data: vorlageId } = await db.rpc("maengel_vorlage_sicherstellen", { p_mandant: mandant });
      const { data: schritte } = await db.from("todo_vorlage_schritt").select("id, nr").eq("vorlage_id", vorlageId).eq("mandant_id", mandant);
      const schritt1 = (schritte || []).find((s: any) => s.nr === 1)?.id || null;
      const { data: vg } = await db.from("todo_vorgang").insert({
        mandant_id: mandant, vorlage_id: vorlageId, name: `${typName} ${einheitText || projekt.name} — Mängel`,
        bezug_typ: "protokoll", bezug_id: protokollId, bezug_label: `${projekt.name}${einheitText ? " · " + einheitText : ""}`,
        start_am: heute(), status: "laeuft", gestartet_von: wer.id,
      }).select("id").single();
      vorgangId = vg?.id || null;
      for (const m of neueMaengel) {
        if (!m.frist) continue;
        const { data: t, error } = await db.from("todos").insert({
          mandant_id: mandant, titel: `Mangel: ${m.titel}${einheitText ? " (" + einheitText + ")" : ""}`,
          beschreibung: [m.raum ? `Raum: ${m.raum}` : "", m.gewerk ? `Gewerk: ${m.gewerk}` : "", m.beschreibung || ""].filter(Boolean).join("\n"),
          typ: "aufgabe", status: m.status === "beauftragt" ? "laeuft" : "offen", prioritaet: "normal", faellig_am: m.frist,
          ersteller_id: wer.id, zustaendig_id: pr.ersteller_id || wer.id, team_sichtbar: true, tags: ["mangel", "neubau"], quelle: "system",
          vorgang_id: vorgangId, vorlage_schritt_id: schritt1, daten: { mangel_id: m.id, projekt_id: projekt.id, einheit_id: pr.einheit_id || null, protokoll_id: protokollId },
        }).select("id").single();
        if (error || !t) { console.error("todos:", error?.message); continue; }
        await db.from("todo_verknuepfung").insert([
          { mandant_id: mandant, todo_id: t.id, objekt_typ: "mangel", objekt_id: m.id, label: m.titel.slice(0, 120) },
          { mandant_id: mandant, todo_id: t.id, objekt_typ: "protokoll", objekt_id: protokollId, label: `${typName} ${einheitText}`.trim() },
          ...(pr.einheit_id ? [{ mandant_id: mandant, todo_id: t.id, objekt_typ: "einheit", objekt_id: pr.einheit_id, label: einheitText }] : []),
          ...(einheit?.immobilie_id ? [{ mandant_id: mandant, todo_id: t.id, objekt_typ: "immobilie", objekt_id: einheit.immobilie_id, label: pr.objekt_adresse || "" }] : []),
        ]);
        await db.from("projekt_maengel").update({ todo_id: t.id }).eq("id", m.id);
        m.todo_id = t.id;
      }
    }

    // --- Protokoll fortschreiben -----------------------------------------------------------------
    const patch: Record<string, unknown> = { status: "abgeschlossen", pdf_datei_id: pdfDateiId, pdf_pfad: pdfPfad };
    if (geaendert) patch.raeume = raeume;
    if (erstmals) patch.abgeschlossen_am = new Date().toISOString();
    const { error: prErr } = await db.from("uebergabeprotokoll").update(patch).eq("id", protokollId).eq("mandant_id", mandant);
    if (prErr) throw new Error("uebergabeprotokoll: " + prErr.message);

    // --- 4. Handwerker: eine Sammelmail je Handwerker -------------------------------------------------
    const jeHandwerker = new Map<string, any[]>();
    for (const m of neueMaengel) if (m.projekt_kontakt_id) jeHandwerker.set(m.projekt_kontakt_id, [...(jeHandwerker.get(m.projekt_kontakt_id) || []), m]);
    let handwerkerMails = 0; const mailFehler: string[] = [];
    for (const [kontaktId, liste] of jeHandwerker) {
      const { data: hk } = await db.from("projekt_kontakte").select("id, gewerk, firma, name, email, portal_token, kontakt_id").eq("id", kontaktId).eq("mandant_id", mandant).maybeSingle();
      if (!hk) continue;
      let portalToken = hk.portal_token;
      if (!portalToken) { portalToken = tokenNeu(); await db.from("projekt_kontakte").update({ portal_token: portalToken }).eq("id", hk.id); }
      let mail = hk.email;
      if (!mail && hk.kontakt_id) { const { data: k } = await db.from("kontakte").select("email").eq("id", hk.kontakt_id).maybeSingle(); mail = k?.email || null; }
      const link = app ? `${app}/?handwerker=${portalToken}` : null;
      const zeilen = liste.map((m, i) => `${i + 1}. ${m.titel}${m.raum ? ` — Raum: ${m.raum}` : ""}${m.frist ? ` — Frist: ${datumDe(m.frist)}` : ""}${m.beschreibung ? `\n   ${m.beschreibung}` : ""}`);
      const text = [
        `Guten Tag${hk.name ? " " + hk.name : ""},`, "",
        `aus der ${typName} ${einheitText ? einheitText + " " : ""}im Projekt „${projekt.name}"${projekt.ort ? " (" + projekt.ort + ")" : ""} ergeben sich ${liste.length === 1 ? "ein Mangel" : liste.length + " Mängel"} für Ihr Gewerk${hk.gewerk ? " " + hk.gewerk : ""}:`, "",
        ...zeilen, "",
        link ? `Bitte melden Sie Termin, Erledigung (mit Foto) oder Rückfragen über Ihren Link — ohne Anmeldung:\n${link}` : "Bitte melden Sie Termin und Erledigung an die Bauleitung.",
        "", firma ? `Mit freundlichen Grüßen\n${firma}` : "Mit freundlichen Grüßen",
      ].join("\n");
      let gesendet = false;
      if (mail) {
        const r = await mailen(db, mandant, mail, hk.firma || hk.name || null, `Mängel aus der ${typName} ${einheitText} — ${projekt.name}`.replace(/\s+/g, " "), text);
        gesendet = r.ok; if (!r.ok) mailFehler.push(`${hk.firma || hk.name || hk.gewerk}: ${r.grund}`);
      } else mailFehler.push(`${hk.firma || hk.name || hk.gewerk}: keine E-Mail-Adresse`);
      if (gesendet) handwerkerMails++;
      for (const m of liste) await verlauf(db, m.id, wer.name, gesendet ? "beauftragt" : "beauftragt_ohne_mail", gesendet ? `Sammelmail an ${mail}` : `Kein Versand: ${mailFehler[mailFehler.length - 1] || "keine Adresse"}`);
    }

    // --- 5. Verwaltung, Zeitleisten ---------------------------------------------------------------------
    if (erstmals) {
      const titel = `${typName} abgeschlossen: ${einheitText || projekt.name}`;
      const text = `${projekt.name}${einheitText ? " · " + einheitText : ""}${zugang ? " · " + (zugang.anzeigename || zugang.email) : ""} — ${neueMaengel.length} ${neueMaengel.length === 1 ? "Mangel" : "Mängel"}, ${handwerkerMails} Handwerker-Mail(s). Protokoll von ${wer.name}.`;
      await glocke(db, mandant, "abnahme_abgeschlossen", titel, text, "uebergabeprotokoll", protokollId, null);
      const leute = await verwaltung(db, mandant, [pr.ersteller_id]);
      for (const p of leute) await push(p.id, titel, text, app ? `${app}/?akte=${pr.einheit_id || ""}` : null, protokollId);
      const abs = leute.map((p) => p.email).filter((e): e is string => !!e && /@/.test(e));
      for (const an of abs.slice(0, 5)) await mailen(db, mandant, an, null, titel, text + (app ? `\n\nWohnungsakte: ${app}/?akte=${pr.einheit_id || ""}` : ""));
      await aktivitaet(db, mandant, projekt.id, pr.zugang_id || null, "abnahme_abgeschlossen", { typ: pr.protokoll_typ, einheit: einheit?.we_nr || null, maengel: neueMaengel.length, protokoll_id: protokollId });
      const kontakte: string[] = [...(Array.isArray(pr.kontakt_ids) ? pr.kontakt_ids : []), zugang?.kontakt_id].filter(Boolean);
      const vText = `${projekt.name}${einheitText ? " · " + einheitText : ""}: ${neueMaengel.length} ${neueMaengel.length === 1 ? "Mangel" : "Mängel"} festgehalten.`;
      if (einheit?.immobilie_id || pr.immobilie_id) await vermerk(db, mandant, { immobilie_id: pr.immobilie_id || einheit?.immobilie_id, kontakt_id: kontakte[0] || null, typ: "abnahme", titel: `${typName} abgeschlossen`, text: vText, ref_tabelle: "uebergabeprotokoll", ref_id: protokollId, benutzer_id: wer.id });
      for (const k of kontakte) await vermerk(db, mandant, { kontakt_id: k, immobilie_id: null, typ: "abnahme", titel: `${typName} abgeschlossen`, text: vText, ref_tabelle: "uebergabeprotokoll", ref_id: protokollId, benutzer_id: wer.id });
    } else if (neueMaengel.length) {
      await aktivitaet(db, mandant, projekt.id, pr.zugang_id || null, "maengel_nachgetragen", { einheit: einheit?.we_nr || null, maengel: neueMaengel.length, protokoll_id: protokollId });
    }

    return antwort({ ok: true, protokoll_id: protokollId, maengel: neueMaengel.length, handwerker_mails: handwerkerMails, mail_hinweise: mailFehler,
      pdf_datei_id: pdfDateiId, pdf_pfad: pdfPfad, erstmals, vorgang_id: vorgangId });
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("abnahme-abschliessen:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
