// ============================================================================
// signatur-unterschreiben (v12)
//   NEU v12: Makler-Kopie geht an das Postfach des OBJEKTZUSTAENDIGEN Maklers
//     (immobilien.zustaendig_id), nicht mehr an den Ersteller. Objektbezug:
//     maklervertrag/vollmacht -> vertraege.immobilie_id; objektnachweis ->
//     objektnachweise.maklervertrag_id -> vertraege.immobilie_id; reservierung
//     hat keinen Objektbezug. Ist der Betreuer nicht ermittelbar (fehlende
//     Verknuepfung, kein Postfach), Fallback auf das Ersteller-Postfach.
//     Ausgelassen, wenn die Adresse ohnehin schon Empfaenger war (Dublette).
//   (v11: Makler-Kopie erstmals, ans Ersteller-Postfach)
//   (v10: Zeitstempel lesbar unter der Namenszeile; v9: reservierung in
//    QUELLTABELLE, Folgestatus nach Rolle; v7: Unterschriften in Inline-Felder)
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PORTAL_URL = Deno.env.get("PORTAL_URL") || "https://immooffice.example";

const QUELLTABELLE: Record<string, string> = {
  maklervertrag: "vertraege",
  vollmacht: "vertraege",
  objektnachweis: "objektnachweise",
  reservierung: "reservierungen_neubau",
};

function titelFuer(dokumentTyp: string, inklVollmacht: boolean): string {
  if (dokumentTyp === "maklervertrag") return inklVollmacht ? "Maklervertrag & Vollmacht" : "Maklervertrag";
  if (dokumentTyp === "objektnachweis") return "Objektnachweis";
  if (dokumentTyp === "reservierung") return "Reservierungsvereinbarung";
  return "Vollmacht";
}

function rollenLabel(dokumentTyp: string, rolle: string): string {
  if (rolle === "makler") return "Makler";
  if (rolle === "kaeufer") return "K\u00e4ufer";
  if (dokumentTyp === "objektnachweis") return "Verk\u00e4ufer";
  return "Auftraggeber";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Postfach des betreuenden Maklers (immobilien.zustaendig_id) ermitteln.
// Objektbezug je Dokumenttyp:
//   maklervertrag/vollmacht -> vertraege.immobilie_id
//   objektnachweis          -> objektnachweise.maklervertrag_id -> vertraege.immobilie_id
//   reservierung            -> kein Objektbezug -> kein Betreuer
// Gibt { postfachId, benutzerId } des Betreuer-Postfachs zurueck oder null,
// wenn kein Betreuer/kein aktives Postfach ermittelbar ist. Der Aufrufer
// faellt dann auf das Ersteller-Postfach zurueck.
async function betreuerPostfach(admin: any, vorgang: any): Promise<{ postfachId: string; benutzerId: string } | null> {
  try {
    let immobilieId: string | null = null;

    if (vorgang.dokument_typ === "maklervertrag" || vorgang.dokument_typ === "vollmacht") {
      if (!vorgang.vertrag_id) return null;
      const { data: v } = await admin.from("vertraege").select("immobilie_id").eq("id", vorgang.vertrag_id).maybeSingle();
      immobilieId = v?.immobilie_id || null;
    } else if (vorgang.dokument_typ === "objektnachweis") {
      if (!vorgang.vertrag_id) return null;
      const { data: on } = await admin.from("objektnachweise").select("maklervertrag_id").eq("id", vorgang.vertrag_id).maybeSingle();
      if (!on?.maklervertrag_id) return null;
      const { data: v } = await admin.from("vertraege").select("immobilie_id").eq("id", on.maklervertrag_id).maybeSingle();
      immobilieId = v?.immobilie_id || null;
    } else {
      return null; // reservierung: kein Objektbezug
    }

    if (!immobilieId) return null;
    const { data: immo } = await admin.from("immobilien").select("zustaendig_id").eq("id", immobilieId).maybeSingle();
    const betreuerId = immo?.zustaendig_id || null;
    if (!betreuerId) return null;

    const { data: pf } = await admin
      .from("mail_postfaecher").select("id").eq("benutzer_id", betreuerId).eq("aktiv", true)
      .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false })
      .limit(1).maybeSingle();
    if (!pf) return null;
    return { postfachId: pf.id, benutzerId: betreuerId };
  } catch (_e) {
    return null;
  }
}

async function entschluessele(verschluesseltesBase64: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = verschluesseltesBase64.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungueltiges verschluesseltes Passwort-Format");
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

async function sendeMailUeberPostfach(admin: any, postfachId: string, an: string, anName: string, betreff: string, text: string, anhaenge?: Array<{ filename: string; content: Uint8Array; contentType: string }>) {
  const { data: postfach } = await admin.from("mail_postfaecher").select("*").eq("id", postfachId).maybeSingle();
  if (!postfach || !postfach.smtp_passwort_verschluesselt) throw new Error("Postfach fuer Mailversand nicht verfuegbar.");
  const passwort = await entschluessele(postfach.smtp_passwort_verschluesselt);
  const istSslDirekt = Number(postfach.smtp_port) === 465 || postfach.smtp_security === "ssl";
  const transporter = nodemailer.createTransport({
    host: postfach.smtp_server, port: Number(postfach.smtp_port), secure: istSslDirekt,
    auth: { user: postfach.smtp_user, pass: passwort },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  const finalText = postfach.signatur ? `${text}\n\n--\n${postfach.signatur}` : text;
  await transporter.sendMail({
    from: `"${postfach.absender_name}" <${postfach.email_adresse}>`,
    to: anName ? `"${anName}" <${an}>` : an,
    subject: betreff,
    text: finalText,
    attachments: anhaenge?.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    // --- Storage: Pfade tragen den Mandanten als erstes Segment -----------
    // Gleiche Bauart wie die Huelle der Oberflaeche. Sie steht IM Handler und
    // nicht auf Modulebene: eine Mandantenvariable auf Modulebene ueberlebt in
    // Deno die Anfrage und traegt den Mandanten des einen Aufrufers in den
    // naechsten. Genau das waere ein Leck statt einer Trennung.
    // Solange immoMandant null ist, bleibt jeder Pfad unveraendert — die
    // Funktion verhaelt sich dann wie bisher.
    let immoMandant: string | null = null;
    const immoSetzeMandant = (m: unknown) => { immoMandant = (typeof m === "string" && m) ? m : null; };
    {
      const immoEcht = admin.storage.from.bind(admin.storage);
      const immoVorne = (pf: unknown): unknown =>
        (typeof pf !== "string" || !pf || !immoMandant) ? pf
          : (pf === immoMandant || pf.startsWith(immoMandant + "/") ? pf : immoMandant + "/" + pf);
      const immoViele = (pf: unknown): unknown => Array.isArray(pf) ? pf.map(immoVorne) : immoVorne(pf);
      (admin.storage as any).from = (eimer: string) => {
        const api: any = immoEcht(eimer);
        const h: any = Object.create(api);
        for (const n of ["upload", "download", "remove", "createSignedUrl",
                         "createSignedUrls", "getPublicUrl", "info", "exists"]) {
          if (typeof api[n] === "function") h[n] = (pf: unknown, ...r: unknown[]) => api[n](immoViele(pf), ...r);
        }
        if (typeof api.list === "function") {
          h.list = (pf?: string, ...r: unknown[]) => api.list(pf ? (immoVorne(pf) as string) : (immoMandant ?? pf), ...r);
        }
        for (const n of ["move", "copy"]) {
          if (typeof api[n] === "function") h[n] = (a: unknown, b: unknown, ...r: unknown[]) => api[n](immoVorne(a), immoVorne(b), ...r);
        }
        return h;
      };
    }

    const body = await req.json();
    const token = (body.token || "").toString().trim();
    const signaturData = (body.signatur_data || "").toString();
    const bestaetigungInhalt = !!body.bestaetigung_inhalt;
    const bestaetigungWiderruf = !!body.bestaetigung_widerruf;
    const klarname = (body.klarname || "").toString().trim();
    const bestaetigungen = (body.bestaetigungen && typeof body.bestaetigungen === "object") ? body.bestaetigungen : null;
    const clientMeta = (body.client_meta && typeof body.client_meta === "object") ? body.client_meta : null;
    const ipAdresse = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    if (!token) throw new Error("token ist Pflicht.");
    if (!signaturData.startsWith("data:image/png;base64,")) throw new Error("signatur_data muss ein PNG-Data-URL sein.");
    if (!bestaetigungInhalt) throw new Error("Bitte best\u00e4tigen Sie zuerst, dass Sie das Dokument gelesen haben.");

    const { data: empfaenger, error: eErr } = await admin.from("signatur_empfaenger").select("*").eq("token", token).maybeSingle();
    if (eErr) throw eErr;
    if (!empfaenger) throw new Error("Dieser Link ist ung\u00fcltig.");
    if (empfaenger.status === "unterschrieben") throw new Error("Sie haben bereits unterschrieben.");

    const { data: vorgang, error: vgErr } = await admin.from("signatur_vorgaenge").select("*").eq("id", empfaenger.vorgang_id).maybeSingle();
    if (vgErr) throw vgErr;
    if (!vorgang) throw new Error("Signatur-Vorgang nicht gefunden.");
    if (vorgang.ablauf_am && new Date(vorgang.ablauf_am).getTime() < Date.now()) throw new Error("Dieser Link ist abgelaufen.");

    if (vorgang.dokument_typ === "maklervertrag" && empfaenger.rolle !== "makler" && !bestaetigungWiderruf) {
      throw new Error("Bitte best\u00e4tigen Sie zus\u00e4tzlich die Widerrufsbelehrung, bevor Sie unterschreiben.");
    }

    const { data: alleEmpfaenger } = await admin
      .from("signatur_empfaenger").select("*").eq("vorgang_id", vorgang.id).order("reihenfolge", { ascending: true });
    const vorherigeOffen = (alleEmpfaenger || []).filter((e: any) => e.reihenfolge < empfaenger.reihenfolge && e.status !== "unterschrieben");
    if (vorherigeOffen.length > 0) throw new Error("Sie sind noch nicht an der Reihe. Bitte warten Sie auf die Benachrichtigung per Mail.");

    const jetzt = new Date().toISOString();

    await admin.from("signatur_empfaenger").update({
      status: "unterschrieben", unterschrieben_am: jetzt, unterschrift_bild: signaturData,
      klarname: klarname || null,
      bestaetigungen: bestaetigungen,
      client_meta: clientMeta ? { ...clientMeta, ip: ipAdresse } : (ipAdresse ? { ip: ipAdresse } : null),
    }).eq("id", empfaenger.id);
    await admin.from("signatur_events").insert({
      vorgang_id: vorgang.id, empfaenger_id: empfaenger.id, event_typ: "unterschrieben",
      details: {
        bestaetigung_inhalt: bestaetigungInhalt,
        bestaetigung_widerruf: bestaetigungWiderruf,
        klarname: klarname || null,
        bestaetigungen: bestaetigungen,
        client_meta: clientMeta,
        ip: ipAdresse,
        rolle: empfaenger.rolle,
      },
    });

    const { data: empfaengerAktuell } = await admin
      .from("signatur_empfaenger").select("*").eq("vorgang_id", vorgang.id).order("reihenfolge", { ascending: true });
    const alleFertig = (empfaengerAktuell || []).every((e: any) => e.status === "unterschrieben");
    const restReihenfolge1Offen = (empfaengerAktuell || []).some((e: any) => e.reihenfolge === 1 && e.status !== "unterschrieben");

    let vertrag: any = null;
    if (vorgang.vertrag_id) {
      const quelltabelle = QUELLTABELLE[vorgang.dokument_typ] || "vertraege";
      const { data } = await admin.from(quelltabelle).select("*").eq("id", vorgang.vertrag_id).maybeSingle();
      vertrag = data;
    }

    const titel = titelFuer(vorgang.dokument_typ, !!vorgang.inkl_vollmacht);
    const objektText = vertrag?.objekt_adresse || vertrag?.objekt_bezeichnung || "das Objekt";
    const objektBetreff = vertrag?.objekt_bezeichnung || vertrag?.objekt_adresse || "";

    if (!alleFertig) {
      if (!restReihenfolge1Offen) {
        const naechste = (empfaengerAktuell || []).filter((e: any) => e.status !== "unterschrieben");

        const naechsteRollen = new Set(naechste.map((e: any) => e.rolle));
        const neuerStatus = naechsteRollen.has("eigentuemer") ? "wartet_eigentuemer" : "wartet_makler";
        await admin.from("signatur_vorgaenge").update({ status: neuerStatus }).eq("id", vorgang.id);

        const { data: erstellerPostfach } = await admin
          .from("mail_postfaecher").select("id").eq("benutzer_id", vorgang.created_by).eq("aktiv", true)
          .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false })
          .limit(1).maybeSingle();

        for (const e of naechste) {
          await admin.from("signatur_empfaenger").update({ eingeladen_am: jetzt }).eq("id", e.id);
          if (!erstellerPostfach) continue;

          const link = `${PORTAL_URL}/?signatur=${e.token}`;
          const istVerkaeuferRunde = e.rolle === "eigentuemer" && vorgang.dokument_typ === "objektnachweis";

          const betreff = istVerkaeuferRunde
            ? `${titel} zur Gegenzeichnung durch die Verk\u00e4uferseite \u2013 ${objektBetreff}`
            : `${titel} bereit zur Gegenzeichnung \u2013 ${objektBetreff}`;

          const text = istVerkaeuferRunde
            ? `Guten Tag ${e.anzeigename},\n\n`
              + `die Kaufinteressenten haben den ${titel} f\u00fcr ${objektText} elektronisch unterschrieben.\n\n`
              + `Als Verk\u00e4uferseite bitten wir Sie nun um Ihre Gegenzeichnung. Damit best\u00e4tigen Sie, dass Ihnen die im Dokument genannten Kaufinteressenten durch uns nachgewiesen wurden.\n\n`
              + `Bitte lesen Sie das Dokument vollst\u00e4ndig und unterschreiben Sie \u00fcber folgenden Link:\n\n${link}\n\n`
              + `Sobald alle Beteiligten unterschrieben haben, erhalten Sie das fertige Dokument automatisch als PDF per E-Mail.\n\n`
              + `Mit freundlichen Gr\u00fc\u00dfen\nMusterhaus Immobilien GmbH`
            : `Guten Tag ${e.anzeigename},\n\n`
              + `alle Auftraggeber haben den ${titel} f\u00fcr ${objektText} elektronisch unterschrieben.\n\n`
              + `Bitte zeichnen Sie das Dokument nun \u00fcber folgenden Link gegen:\n\n${link}\n\n`
              + `Nach Ihrer Gegenzeichnung wird das fertige Dokument automatisch an alle Beteiligten versendet.\n\n`
              + `Mit freundlichen Gr\u00fc\u00dfen\nIhr ImmoOffice Portal`;

          try {
            await sendeMailUeberPostfach(admin, erstellerPostfach.id, e.email, e.anzeigename, betreff, text);
            await admin.from("signatur_events").insert({
              vorgang_id: vorgang.id, empfaenger_id: e.id, event_typ: "mail_gesendet",
              details: { email: e.email, anlass: istVerkaeuferRunde ? "gegenzeichnung_verkaeufer" : "gegenzeichnung" },
            });
          } catch (mailErr) {
            await admin.from("signatur_events").insert({
              vorgang_id: vorgang.id, empfaenger_id: e.id, event_typ: "mail_fehlgeschlagen",
              details: { email: e.email, error: String(mailErr instanceof Error ? mailErr.message : mailErr) },
            });
          }
        }
      }
      return jsonResponse({ ok: true, status: "teilweise_unterschrieben" });
    }

    // ---- Alle fertig: finales PDF zusammenbauen ----
    const unsignedPfad = vorgang.unsigned_pdf_pfad;
    if (!unsignedPfad) throw new Error("Unsigniertes PDF nicht gefunden, kann Vorgang nicht abschliessen.");
    const { data: pdfBlob, error: pdfDlErr } = await admin.storage.from("maklervertraege-pdf").download(unsignedPfad);
    if (pdfDlErr || !pdfBlob) throw new Error("Unsigniertes PDF konnte nicht geladen werden.");

    const pdf = await PDFDocument.load(await pdfBlob.arrayBuffer());
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const margin = 50;
    const STEMPEL_GROESSE = 9.5;
    const STEMPEL_FARBE = rgb(0.32, 0.32, 0.32);

    const eingebetteteBilder = new Map<string, any>();
    for (const e of (empfaengerAktuell || [])) {
      if (!e.unterschrift_bild) continue;
      try {
        const base64 = e.unterschrift_bild.split(",")[1];
        const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        eingebetteteBilder.set(e.id, await pdf.embedPng(pngBytes));
      } catch (imgErr) {
        console.warn("Signatur-Bild konnte nicht eingebettet werden:", imgErr);
      }
    }

    const positionen: any[] = Array.isArray(vorgang.unterschrift_positionen) ? vorgang.unterschrift_positionen : [];
    const pages = pdf.getPages();
    let inFelderGestempelt = 0;

    if (positionen.length > 0) {
      for (const e of (empfaengerAktuell || [])) {
        const img = eingebetteteBilder.get(e.id);
        if (!img) continue;
        const eigenePositionen = positionen.filter((p: any) =>
          (p.email || "").toLowerCase() === (e.email || "").toLowerCase() && p.rolle === e.rolle);
        for (const pos of eigenePositionen) {
          const zielSeite = pages[pos.seite];
          if (!zielSeite) continue;
          const pad = 4;
          const maxW = (pos.breite || 220) - 2 * pad;
          const maxH = (pos.hoehe || 55) - 2 * pad;
          const scale = Math.min(maxW / img.width, maxH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          zielSeite.drawImage(img, { x: pos.x + pad, y: pos.y + pad, width: w, height: h });
          try {
            const stempel = `Elektronisch unterschrieben am ${new Date(e.unterschrieben_am).toLocaleString("de-DE")}`;
            zielSeite.drawText(stempel, {
              x: pos.x, y: pos.y - 27, size: STEMPEL_GROESSE, font, color: STEMPEL_FARBE,
            });
          } catch (_e) { /* Zeitstempel optional */ }
          inFelderGestempelt++;
        }
      }
    }

    if (positionen.length === 0 || inFelderGestempelt === 0) {
      const sigPage = pdf.addPage([595.28, 841.89]);
      let sy = 780;
      sigPage.drawText("Unterschriften", { x: margin, y: sy, size: 18, font, color: rgb(0.149, 0.192, 0.349) });
      sy -= 40;
      for (const e of (empfaengerAktuell || [])) {
        sigPage.drawText(`${e.anzeigename} (${rollenLabel(vorgang.dokument_typ, e.rolle)})`, { x: margin, y: sy, size: 11, font, color: rgb(0.05, 0.05, 0.05) });
        sy -= 16;
        const img = eingebetteteBilder.get(e.id);
        if (img) {
          const imgH = 60;
          const imgW = imgH * (img.width / img.height);
          sigPage.drawImage(img, { x: margin, y: sy - imgH, width: Math.min(imgW, 220), height: imgH });
          sy -= imgH + 6;
        }
        sigPage.drawText(`Elektronisch unterschrieben am ${new Date(e.unterschrieben_am).toLocaleString("de-DE")}`, { x: margin, y: sy, size: STEMPEL_GROESSE, font, color: STEMPEL_FARBE });
        sy -= 30;
      }
    }

    const finalBytes = await pdf.save();
    const signedPfad = `${vorgang.vertrag_id}/signatur-${vorgang.id}-signed.pdf`;
    const { error: uploadErr } = await admin.storage.from("maklervertraege-pdf").upload(signedPfad, finalBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) throw new Error(`Signiertes PDF konnte nicht gespeichert werden: ${uploadErr.message}`);

    const abgeschlossenAm = new Date().toISOString();
    await admin.from("signatur_vorgaenge").update({
      status: "abgeschlossen", signed_pdf_pfad: signedPfad, abgeschlossen_am: abgeschlossenAm,
    }).eq("id", vorgang.id);
    await admin.from("signatur_events").insert({ vorgang_id: vorgang.id, event_typ: "abgeschlossen", details: { in_felder_gestempelt: inFelderGestempelt } });

    if (vorgang.dokument_typ === "maklervertrag" && vorgang.vertrag_id) {
      await admin.from("vertraege").update({ original_pdf_pfad: signedPfad }).eq("id", vorgang.vertrag_id);
    }

    // ---- Direkt in der Dokumenten-Ablage hinterlegen (eigentuemer_dokumente) ----
    if (vorgang.dokument_typ === "maklervertrag") {
      try {
        if (vorgang.vertrag_id) {
          const { data: verknuepfungen } = await admin
            .from("eigentuemer_objekte").select("eigentuemer_id").eq("maklervertrag_id", vorgang.vertrag_id);
          const eigentuemerIds: string[] = [...new Set((verknuepfungen || []).map((v: any) => v.eigentuemer_id))];
          const dateiname = `${titel.replace(/\s+/g, "_")}_unterschrieben_${abgeschlossenAm.slice(0, 10)}.pdf`;
          for (const eigentuemerId of eigentuemerIds) {
            const ablagePfad = `${eigentuemerId}/maklervertrag_kopie_${Date.now()}_${dateiname}`;
            const { error: ablageUploadErr } = await admin.storage
              .from("eigentuemer-dokumente").upload(ablagePfad, finalBytes, { contentType: "application/pdf", upsert: true });
            if (ablageUploadErr) {
              console.warn("Ablage-Upload fehlgeschlagen fuer Eigentuemer", eigentuemerId, ablageUploadErr.message);
              continue;
            }
            await admin.from("eigentuemer_dokumente").insert({
              eigentuemer_id: eigentuemerId,
              maklervertrag_id: vorgang.vertrag_id,
              name: dateiname,
              pfad: ablagePfad,
              groesse: finalBytes.byteLength,
              content_type: "application/pdf",
              kategorie: "maklervertrag_kopie",
              hochgeladen_von_typ: "makler",
              freigabe_status: "freigegeben",
              notiz: "Automatisch abgelegt nach elektronischer Unterschrift.",
            });
          }
        }
      } catch (ablageErr) {
        console.warn("Automatische Ablage in eigentuemer_dokumente fehlgeschlagen:", ablageErr);
      }
    }

    // ---- Bestaetigungsmail mit Anhang an ALLE Beteiligten ----
    const { data: erstellerPostfach } = await admin
      .from("mail_postfaecher").select("id").eq("benutzer_id", vorgang.created_by).eq("aktiv", true)
      .order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false })
      .limit(1).maybeSingle();
    if (erstellerPostfach) {
      const istON = vorgang.dokument_typ === "objektnachweis";
      for (const e of (empfaengerAktuell || [])) {
        const einleitung = istON
          ? `K\u00e4ufer- und Verk\u00e4uferseite haben den ${titel} f\u00fcr ${objektText} elektronisch unterschrieben \u2013 der Objektnachweis ist damit dokumentiert.`
          : `alle Beteiligten haben den ${titel} f\u00fcr ${objektText} elektronisch unterschrieben \u2013 der Vertragsschluss ist damit dokumentiert.`;
        const anhangSatz = (vorgang.dokument_typ === "vollmacht" || vorgang.dokument_typ === "reservierung")
          ? `Im Anhang erhalten Sie das vollst\u00e4ndig unterzeichnete Dokument als PDF zur dauerhaften Aufbewahrung.`
          : `Im Anhang erhalten Sie das vollst\u00e4ndig unterzeichnete Dokument einschlie\u00dflich Widerrufsbelehrung und Muster-Widerrufsformular als PDF zur dauerhaften Aufbewahrung.`;
        try {
          await sendeMailUeberPostfach(
            admin, erstellerPostfach.id, e.email, e.anzeigename,
            `${titel} vollst\u00e4ndig unterschrieben \u2013 ${objektBetreff}`,
            `Guten Tag ${e.anzeigename},\n\n`
            + `${einleitung}\n\n`
            + `${anhangSatz}\n\n`
            + `Bitte bewahren Sie diese E-Mail und den Anhang gut auf.\n\n`
            + `F\u00fcr R\u00fcckfragen stehen wir Ihnen selbstverst\u00e4ndlich gerne zur Verf\u00fcgung.\n\n`
            + `Mit freundlichen Gr\u00fc\u00dfen\nMusterhaus Immobilien GmbH`,
            [{ filename: `${titel.replace(/\s+/g, "_")}_unterschrieben.pdf`, content: finalBytes, contentType: "application/pdf" }]
          );
          await admin.from("signatur_events").insert({ vorgang_id: vorgang.id, empfaenger_id: e.id, event_typ: "mail_gesendet", details: { email: e.email, anlass: "abschluss", rolle: e.rolle } });
        } catch (mailErr) {
          await admin.from("signatur_events").insert({ vorgang_id: vorgang.id, empfaenger_id: e.id, event_typ: "mail_fehlgeschlagen", details: { email: e.email, error: String(mailErr instanceof Error ? mailErr.message : mailErr) } });
        }
      }

      // ---- Makler-Kopie ans Postfach des betreuenden Maklers ----
      // Der Makler steht beim Objektnachweis meist NICHT in der Empfaengerliste
      // (dort Kaeufer + Verkaeufer) und bekam deshalb bisher keine Kopie. Hier
      // geht eine eigene Kopie an das Postfach des OBJEKTZUSTAENDIGEN Maklers
      // (immobilien.zustaendig_id). Ist der nicht ermittelbar (Reservierung,
      // fehlende Objekt-/Maklervertrags-Verknuepfung, kein aktives Postfach),
      // faellt es auf das Ersteller-Postfach zurueck. Ausgelassen, wenn diese
      // Adresse ohnehin schon Empfaenger war (keine Dublette).
      try {
        const bp = await betreuerPostfach(admin, vorgang);
        const kopiePostfachId = bp?.postfachId || erstellerPostfach.id;
        const anBetreuer = !!bp;

        const { data: kopiePostfach } = await admin
          .from("mail_postfaecher").select("id, email_adresse, absender_name").eq("id", kopiePostfachId).maybeSingle();
        const kopieAdresse = (kopiePostfach?.email_adresse || "").toLowerCase();
        const warSchonEmpfaenger = (empfaengerAktuell || [])
          .some((e: any) => (e.email || "").toLowerCase() === kopieAdresse);

        if (kopiePostfach && kopieAdresse && !warSchonEmpfaenger) {
          const beteiligte = (empfaengerAktuell || [])
            .map((e: any) => `- ${e.anzeigename} (${rollenLabel(vorgang.dokument_typ, e.rolle)})`).join("\n");
          const rolleHinweis = anBetreuer
            ? `Diese Kopie geht an Sie als betreuenden Makler dieses Objekts zur Ablage.`
            : `Diese Kopie geht an das ausstellende Postfach zur Ablage.`;
          await sendeMailUeberPostfach(
            admin, kopiePostfachId, kopiePostfach.email_adresse, kopiePostfach.absender_name || "",
            `[Kopie Makler] ${titel} vollst\u00e4ndig unterschrieben \u2013 ${objektBetreff}`,
            `Der ${titel} f\u00fcr ${objektText} wurde von allen Beteiligten elektronisch unterschrieben.\n\n`
            + `Beteiligte:\n${beteiligte}\n\n`
            + `Das vollst\u00e4ndig unterzeichnete Dokument liegt im Anhang. ${rolleHinweis}\n`,
            [{ filename: `${titel.replace(/\s+/g, "_")}_unterschrieben.pdf`, content: finalBytes, contentType: "application/pdf" }]
          );
          await admin.from("signatur_events").insert({ vorgang_id: vorgang.id, event_typ: "mail_gesendet", details: { email: kopiePostfach.email_adresse, anlass: "makler_kopie", an_betreuer: anBetreuer } });
        }
      } catch (maklerMailErr) {
        await admin.from("signatur_events").insert({ vorgang_id: vorgang.id, event_typ: "mail_fehlgeschlagen", details: { anlass: "makler_kopie", error: String(maklerMailErr instanceof Error ? maklerMailErr.message : maklerMailErr) } });
      }
    }

    return jsonResponse({ ok: true, status: "abgeschlossen" });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("signatur-unterschreiben:", meldung);
    return jsonResponse({ ok: false, error: meldung });
  }
});
