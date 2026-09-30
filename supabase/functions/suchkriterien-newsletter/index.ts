// ============================================================================
// suchkriterien-newsletter — „Neue Objekte passend zu Ihrer Suche“ (woechentlich, v3)
// ----------------------------------------------------------------------------
// Cron montags 06:30 UTC (Header x-diagnose-secret aus dem Vault) oder Chef per JWT.
// Empfaenger: aktive Kontakte mit E-Mail, newsletter_opt_in = true, werbung_opt_out
// = false, Suchkriterium aktiv. Inhalt: bis zu 6 Treffer aus suchkriterien_treffer,
// die noch nicht per Newsletter oder Exposé-Link gemeldet wurden, nur Objekte im
// Status Vermarktung/Reserviert. Je Objekt ein persoenlicher Exposé-Link, wenn ein
// Exposé-PDF am Objekt liegt (wie expose-freigabe-erstellen), sonst Hinweis.
// Absender: Postfach des Zustaendigen des Kontakts, sonst des Chefs. Versand Resend.
// Protokoll: mail_versendet, vermerke (typ objektvorschlag), treffer.newsletter_am.
// v2 (18.09.2026): Abmelde-Link je Empfaenger (newsletter_anmeldungen.abmelde_token -> newsletter-abmelden).
// Body { trocken: true } zeigt nur, was gesendet wuerde; { kontakt_id } nur dieser.
// v3 (23.09.2026): KEIN AUTOMATISCHER VERSAND OHNE AUSDRUECKLICHEN SCHALTER.
//   Der Cron-Weg (x-diagnose-secret) sendet nur, wenn portal_einstellungen.newsletter_automatisch
//   auf "ja" steht (Einstellungen -> Vorgaben). Steht er auf "nein" oder fehlt, bricht der Lauf
//   VOR jeder Empfaengerabfrage ab und meldet das. Ein Trockenlauf ({ trocken: true }) geht immer.
//   Der Chef-Weg (JWT) bleibt - das ist ein bewusster Klick, kein Automatismus.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const ABMELDE_BASIS = `${Deno.env.get("SUPABASE_URL")}/functions/v1/newsletter-abmelden`;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diagnose-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const LINK_BASIS = Deno.env.get("EXPOSE_FREIGABE_BASIS") || "https://immooffice.example/?expose=";
const MAX_JE_KONTAKT = 6;

function token(): string { const b = new Uint8Array(24); crypto.getRandomValues(b); return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join(""); }
function provisionNorm(p: unknown): string {
  let s = String(p ?? "").trim(); if (!s) return "";
  s = s.replace(/\s*%\s*$/, "").replace(/\s+/g, " ");
  if (/^\d+([.,]\d+)?$/.test(s)) s = s.replace(".", ",") + " %"; else if (!/%/.test(s)) s = s + " %";
  return s;
}
const euro = (n: unknown) => n ? Number(n).toLocaleString("de-DE") + " €" : "";
function anrede(k: any): string {
  const nn = String(k.nachname || "").trim();
  if (k.anrede === "Herr" && nn) return `Sehr geehrter Herr ${[k.titel, nn].filter(Boolean).join(" ")}`;
  if (k.anrede === "Frau" && nn) return `Sehr geehrte Frau ${[k.titel, nn].filter(Boolean).join(" ")}`;
  const name = [k.vorname, nn].filter(Boolean).join(" ") || k.firma;
  return name ? `Guten Tag ${name}` : "Guten Tag";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const geheim = req.headers.get("x-diagnose-secret") || "";
    let ok = false, nutzerId: string | null = null;
    if (geheim) { const { data } = await db.rpc("diagnose_secret_pruefen", { p: geheim }); ok = data === true; }
    if (!ok) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null as any };
      if (u?.user) { const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle(); ok = !!p && p.role === "chef"; nutzerId = u.user.id; }
    }
    if (!ok) return antwort({ ok: false, fehler: "Keine Berechtigung." });
    const body = await req.json().catch(() => ({}));
    const trocken = body.trocken === true;
    const vomCron = !nutzerId; // per Geheimnis, nicht per Chef-JWT
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey && !trocken) throw new Error("RESEND_API_KEY nicht gesetzt");

    // Ein Lauf gehoert einem Mandanten. Der Chef-Weg: seinem eigenen. Der
    // Cron-Weg: allen, aber jedem fuer sich — Schalter, Empfaenger,
    // Postfaecher und Protokoll bleiben getrennt.
    //
    // Vorher lief beides ueber ALLE Kontakte ALLER Mandanten. Ein Chef, der
    // auf "Objektvorschlaege senden" klickt, haette damit die Newsletter der
    // anderen Makler verschickt — mit deren Objekten, ueber deren
    // Postfaecher — und die Antwort haette ihm deren Empfaengerlisten mit
    // Namen und E-Mail-Adressen zurueckgegeben.
    let mandanten: string[] = [];
    if (nutzerId) {
      const { data: mp } = await db.from("profiles").select("mandant_id").eq("id", nutzerId).maybeSingle();
      if (!mp?.mandant_id) return antwort({ ok: false, fehler: "Konto ohne Mandanten." });
      mandanten = [String(mp.mandant_id)];
    } else {
      const { data: alle } = await db.from("mandanten").select("id").order("erstellt_am");
      mandanten = (alle || []).map((m: any) => String(m.id));
    }

    const log: any[] = []; let gesendet = 0, ohneTreffer = 0, empfaengerGesamt = 0, ohneSchalter = 0;
    // Die Schleife laesst die Einrueckung darunter, wie sie war — so bleibt
    // der Unterschied zur Vorlage lesbar und beschraenkt sich auf das, was
    // sich wirklich aendert.
    for (const mandant of mandanten) {
    if (vomCron && !trocken) {
      const { data: e } = await db.from("portal_einstellungen").select("wert").eq("mandant_id", mandant).eq("schluessel", "newsletter_automatisch").maybeSingle();
      const schalter = e?.wert === true || String(e?.wert ?? "").toLowerCase() === "ja";
      if (!schalter) { ohneSchalter++; continue; }
    }

    // Empfaenger
    let q = db.from("kontakte").select("id, anrede, titel, vorname, nachname, firma, email, zustaendig_id, ersteller_id, such_profil")
      .eq("mandant_id", mandant)
      .eq("aktiv", true).eq("newsletter_opt_in", true).eq("werbung_opt_out", false).not("email", "is", null).not("such_profil", "is", null);
    if (body.kontakt_id) q = q.eq("id", body.kontakt_id);
    const { data: kontakte, error: kErr } = await q.limit(500);
    if (kErr) throw kErr;
    const empfaenger = (kontakte || []).filter((k: any) => !k.such_profil?.status || k.such_profil.status === "aktiv");
    empfaengerGesamt += empfaenger.length;

    // Chef-Postfach als Rueckfall
    const { data: chefPf } = await db.from("mail_postfaecher").select("*, profiles!inner(role)").eq("mandant_id", mandant).eq("aktiv", true).eq("profiles.role", "chef").order("standard_zum_senden", { ascending: false }).limit(1);
    const rueckfall = chefPf && chefPf[0] || null;
    const pfCache = new Map<string, any>();
    const postfachFuer = async (profilId: string | null) => {
      if (!profilId) return rueckfall;
      if (pfCache.has(profilId)) return pfCache.get(profilId);
      const { data } = await db.from("mail_postfaecher").select("*").eq("mandant_id", mandant).eq("benutzer_id", profilId).eq("aktiv", true).order("standard_zum_senden", { ascending: false }).order("ist_standard", { ascending: false }).limit(1);
      const pf = data && data[0] || rueckfall; pfCache.set(profilId, pf); return pf;
    };

    for (const k of empfaenger) {
      const eintrag: any = { kontakt: [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma, email: k.email };
      try {
        const { data: treffer } = await db.from("suchkriterien_treffer")
          .select("immobilie_id, punkte, gruende, immobilien(id, immo_nr, objekttitel, bezeichnung, objektart, vertragsart, plz, ort, angebotspreis, kaltmiete, zimmer, wohnflaeche, status, versteckt, provision_aussen, provisionsfrei, zustaendig_id)")
          .eq("kontakt_id", k.id).eq("ausgeblendet", false).is("newsletter_am", null).is("expose_gesendet_am", null).order("punkte", { ascending: false }).limit(30);
        const objekte = (treffer || []).filter((t: any) => t.immobilien && !t.immobilien.versteckt && ["vermarktung", "reserviert"].includes(String(t.immobilien.status || ""))).slice(0, MAX_JE_KONTAKT);
        if (!objekte.length) { ohneTreffer++; eintrag.ergebnis = "keine neuen Treffer"; log.push(eintrag); continue; }

        const pf = await postfachFuer(k.zustaendig_id || k.ersteller_id);
        if (!pf) throw new Error("Kein Postfach fuer den Versand");
        const { data: makler } = await db.from("profiles").select("name").eq("id", pf.benutzer_id).maybeSingle();

        const zeilen: string[] = [];
        for (const t of objekte) {
          const o = t.immobilien;
          const miete = /^verm/i.test(o.vertragsart || "");
          const kopf = [o.objekttitel || o.bezeichnung || ("Objekt " + (o.immo_nr || "")), [o.plz, o.ort].filter(Boolean).join(" "), o.objektart, miete ? euro(o.kaltmiete) + " Kaltmiete" : euro(o.angebotspreis), o.zimmer ? o.zimmer + " Zimmer" : "", o.wohnflaeche ? Math.round(o.wohnflaeche) + " m²" : ""].filter(Boolean).join(" · ");
          let link = "";
          if (!trocken) {
            // Exposé-Link wie in expose-freigabe-erstellen, nur wenn ein Exposé-PDF am Objekt liegt
            const { data: dateien } = await db.from("immobilie_datei").select("id, name, storage_path, expose_final, interessenten_freigabe").eq("immobilie_id", o.id).order("created_at", { ascending: false }).limit(200);
            const exposes = (dateien || []).filter((d: any) => /\.pdf$/i.test(d.name || "") && (/\/expose\//i.test(d.storage_path || "") || /expos/i.test(d.name || "")));
            const expose = exposes.find((d: any) => d.expose_final) || exposes[0];
            if (expose) {
              const provision = provisionNorm(o.provision_aussen);
              const modell = miete ? "miete" : (o.provisionsfrei || !provision || /^0([.,]0+)? %$/.test(provision)) ? "provisionsfrei" : "kaeufer";
              const provisionText = modell === "miete" ? "Für Sie als Mieter fallen keine Maklerkosten an (Bestellerprinzip, § 2 WoVermRG)."
                : modell === "provisionsfrei" ? "Der Erwerb dieser Immobilie ist für Sie als Käufer provisionsfrei."
                : `Im Falle des Erwerbs der Immobilie zahlen Sie als Käufer eine Maklerprovision in Höhe von ${provision} inkl. der gesetzlichen Mehrwertsteuer, berechnet auf den beurkundeten Kaufpreis. Die Provision ist ausschließlich dann verdient und fällig, wenn ein notarieller Kaufvertrag über diese Immobilie mit Ihnen zustande kommt. Das Anfordern des Exposés, Besichtigungen und unsere Beratung sind für Sie kostenfrei – entscheiden Sie sich gegen den Kauf, entstehen Ihnen keinerlei Kosten.`;
              let firmaSlug = "standard";
              const { data: zp } = await db.from("profiles").select("firma_id").eq("id", o.zustaendig_id || pf.benutzer_id).maybeSingle();
              if (zp?.firma_id) { const { data: f } = await db.from("firma_stammdaten").select("slug").eq("mandant_id", mandant).eq("id", zp.firma_id).maybeSingle(); if (f?.slug) firmaSlug = f.slug; }
              const tok = token();
              const { error: fe } = await db.from("expose_freigaben").insert({
                token: tok, immobilie_id: o.id, kontakt_id: k.id, email: String(k.email).toLowerCase(), name: eintrag.kontakt || null,
                provisionsmodell: modell, provision_text: provisionText, firma_slug: firmaSlug, erstellt_von: pf.benutzer_id, expose_datei_id: expose.id,
                dokument_ids: (dateien || []).filter((d: any) => d.interessenten_freigabe && d.storage_path && d.id !== expose.id).map((d: any) => d.id), newsletter: true,
              });
              if (!fe) link = `${LINK_BASIS}${tok}`;
            }
          }
          zeilen.push(`• ${kopf}\n  ${link ? "Ihr persönlicher Exposé-Link: " + link : "Exposé auf Anfrage — antworten Sie einfach auf diese Mail."}`);
        }
        let abmeldeLink = `${ABMELDE_BASIS}`;
        try {
          const { data: an } = await db.from("newsletter_anmeldungen").select("abmelde_token").eq("mandant_id", mandant).ilike("email", String(k.email).trim()).is("widerrufen_am", null).order("angemeldet_am", { ascending: false }).limit(1);
          let tokenAb = an && an[0] ? an[0].abmelde_token : null;
          if (!tokenAb) { const { data: neu } = await db.from("newsletter_anmeldungen").insert({ kontakt_id: k.id, email: String(k.email).trim().toLowerCase(), name: eintrag.kontakt || null, quelle: "kontakt" }).select("abmelde_token").single(); tokenAb = neu?.abmelde_token || null; }
          if (tokenAb) abmeldeLink = `${ABMELDE_BASIS}?t=${tokenAb}`;
        } catch (e) { console.error("Abmelde-Link:", e); }
        const text = `${anrede(k)},\n\nwir haben ${objekte.length === 1 ? "ein neues Objekt" : objekte.length + " neue Objekte"}, ${objekte.length === 1 ? "das" : "die"} zu Ihren Suchkriterien ${objekte.length === 1 ? "passt" : "passen"}:\n\n${zeilen.join("\n\n")}\n\nSie möchten eines der Objekte besichtigen oder Ihre Suchkriterien anpassen? Antworten Sie einfach auf diese Mail oder rufen Sie mich an.\n\nWenn Sie keine Objektvorschläge mehr wünschen, klicken Sie hier: ${abmeldeLink}\n(oder antworten Sie kurz mit „keine Vorschläge“)\n\nMit freundlichen Grüßen\n${makler?.name || pf.absender_name || "Ihr Maklerteam"}`;
        const sig = String(pf.signatur || "").trim();
        const finalText = sig ? `${text}\n\n--\n${sig}` : text;
        const betreff = objekte.length === 1 ? `Neues Objekt passend zu Ihrer Suche: ${objekte[0].immobilien.objekttitel || objekte[0].immobilien.bezeichnung || objekte[0].immobilien.ort}` : `${objekte.length} neue Objekte passend zu Ihrer Suche`;
        eintrag.objekte = objekte.map((t: any) => t.immobilien.immo_nr); eintrag.von = pf.email_adresse; eintrag.betreff = betreff;
        if (trocken) { eintrag.ergebnis = "wuerde senden"; eintrag.text = text; log.push(eintrag); continue; }

        const r = await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `${pf.absender_name} <${pf.email_adresse}>`, to: [eintrag.kontakt ? `${eintrag.kontakt} <${k.email}>` : k.email], reply_to: pf.email_adresse, subject: betreff, text: finalText }),
        });
        if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const rj = await r.json().catch(() => ({}));
        await db.from("mail_versendet").insert({ postfach_id: pf.id, versendet_von_user_id: pf.benutzer_id, absender_email: pf.email_adresse, absender_name: pf.absender_name, empfaenger_email: k.email, empfaenger_name: eintrag.kontakt || null, betreff, body_text: finalText, status: "gesendet", smtp_message_id: rj?.id ? `resend:${rj.id}` : "resend" });
        await db.from("vermerke").insert({ kontakt_id: k.id, typ: "objektvorschlag", titel: `Objektvorschläge per Mail (${objekte.length})`, text: objekte.map((t: any) => t.immobilien.immo_nr).filter(Boolean).join(", "), benutzer_id: pf.benutzer_id, quelle: null });
        const jetzt = new Date().toISOString();
        for (const t of objekte) await db.from("suchkriterien_treffer").update({ newsletter_am: jetzt }).eq("kontakt_id", k.id).eq("immobilie_id", t.immobilie_id);
        eintrag.ergebnis = "gesendet"; gesendet++;
      } catch (e) { eintrag.fehler = e instanceof Error ? e.message : String(e); }
      log.push(eintrag);
    }
    }
    return antwort({ ok: true, mandanten: mandanten.length, empfaenger: empfaengerGesamt, gesendet, ohne_treffer: ohneTreffer, ohne_schalter: ohneSchalter, trocken, log: log.slice(0, 200) });
  } catch (e) { return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }); }
});
