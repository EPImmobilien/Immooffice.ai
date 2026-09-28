// ============================================================================
// akq-lead-eingang v1 — oeffentliches Bewertungsformular -> Akquise-Lead
// ----------------------------------------------------------------------------
// verify_jwt: FALSE (oeffentlich erreichbar). Schutz:
//   * Honeypot-Feld "webseite" muss leer sein
//   * Rate-Limit ueber akq_eingang_log (IP-Hash / E-Mail)
//   * DSGVO-Haekchen ist Pflicht
//
// Ablauf: Kontakt finden oder anlegen -> Wertindikation aus eigenen Objektdaten
// -> Lead in Stufe "Neuer Lead" der Setting-Pipeline -> Automationen einplanen
// -> Zustaendigen per Mail informieren.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const eur = (n: unknown) =>
  n === null || n === undefined || isNaN(Number(n))
    ? "—"
    : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));

const txt = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const zahl = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", ".").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
};

async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ZUSTAND_FAKTOR: Record<string, number> = {
  neuwertig: 1.12, saniert: 1.08, gepflegt: 1.0,
  renovierungsbeduerftig: 0.85, sanierungsbeduerftig: 0.72, abrissobjekt: 0.5,
};

function median(werte: number[]): number | null {
  const s = werte.filter((n) => isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Wertindikation aus dem, was das Portal selbst hat: erzielte bzw. angebotene
// Quadratmeterpreise vergleichbarer eigener Objekte. Kein Fremddatenanbieter.
async function schaetzeWert(db: any, p: { plz: string; ort: string; wohnflaeche: number | null; grundstueck: number | null; baujahr: number | null; zustand: string; objektart: string }) {
  if (!p.wohnflaeche) return { wert: null as number | null, qm: null as number | null, basis: "keine_flaeche", anzahl: 0 };

  const spalten = "wohnflaeche, angebotspreis, verkaufspreis, marktwert, plz, ort, objektart";
  const auswerten = (zeilen: any[]) =>
    (zeilen || [])
      .map((r) => {
        const preis = Number(r.verkaufspreis || r.angebotspreis || r.marktwert || 0);
        const fl = Number(r.wohnflaeche || 0);
        return preis > 10000 && fl > 15 ? preis / fl : NaN;
      })
      .filter((n) => isFinite(n) && n > 300 && n < 20000);

  let basis = "plz", zeilen: any[] = [];
  if (p.plz) {
    const { data } = await db.from("immobilien").select(spalten).eq("plz", p.plz).gt("wohnflaeche", 15).limit(400);
    zeilen = data || [];
  }
  let qm = median(auswerten(zeilen));
  if (!qm || auswerten(zeilen).length < 4) {
    if (p.ort) {
      const { data } = await db.from("immobilien").select(spalten).ilike("ort", p.ort).gt("wohnflaeche", 15).limit(600);
      const q2 = median(auswerten(data || []));
      if (q2) { qm = q2; basis = "ort"; }
    }
  }
  if (!qm) {
    const { data } = await db.from("immobilien").select(spalten).gt("wohnflaeche", 15).limit(1000);
    qm = median(auswerten(data || []));
    basis = "gesamtbestand";
  }
  if (!qm) return { wert: null, qm: null, basis: "keine_vergleichsdaten", anzahl: 0 };

  let wert = qm * p.wohnflaeche;
  wert *= ZUSTAND_FAKTOR[String(p.zustand || "").toLowerCase()] ?? 1;
  if (p.baujahr && p.baujahr < 1960) wert *= 0.92;
  if (p.baujahr && p.baujahr >= 2015) wert *= 1.06;
  if (/haus|villa|doppelhaus|reihenhaus/i.test(p.objektart) && p.grundstueck) wert += Math.min(p.grundstueck, 1500) * 60;

  return { wert: Math.round(wert / 1000) * 1000, qm: Math.round(qm), basis, anzahl: auswerten(zeilen).length };
}

// ---- Mailversand an den zustaendigen Makler -------------------------------
async function entschluessele(v: string): Promise<string> {
  const secret = Deno.env.get("MAIL_SECRET_KEY");
  if (!secret) throw new Error("MAIL_SECRET_KEY nicht gesetzt");
  const parts = v.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Ungueltiges Passwort-Format");
  const iv = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const km = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", km, { name: "AES-GCM" }, false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
}

// Welcher Mandant ist gemeint? Ausdrueckliche Angabe, sonst der einzige,
// sonst gar nichts. Dieselbe Reihenfolge wie in oeffentliche-objekte.
async function immoMandantAusAnfrage(req: Request, db: any, koerper: any): Promise<string | null> {
  let wunsch = "";
  try { wunsch = (new URL(req.url).searchParams.get("mandant") || "").trim(); } catch (_) { /* egal */ }
  if (!wunsch) wunsch = String(koerper?.mandant ?? "").trim();
  if (!wunsch) wunsch = (req.headers.get("x-immo-mandant") || "").trim();
  if (wunsch) {
    const spalte = /^[0-9a-f-]{36}$/i.test(wunsch) ? "id" : "slug";
    const { data } = await db.from("mandanten").select("id").eq(spalte, wunsch).maybeSingle();
    return data?.id ?? null;
  }
  const { data: alle } = await db.from("mandanten").select("id").limit(2);
  return (alle || []).length === 1 ? alle[0].id : null;
}

async function benachrichtige(db: any, mandant: string, an: string, betreff: string, text: string) {
  // Das Postfach des Mandanten, nicht das erste ueberhaupt.
  const { data: pfs } = await db.from("mail_postfaecher").select("*")
    .eq("mandant_id", mandant).eq("aktiv", true)
    .order("ist_standard", { ascending: false }).limit(1);
  const pf = pfs && pfs[0];
  if (!pf) return { ok: false, fehler: "kein Postfach" };
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${pf.absender_name} <${pf.email_adresse}>`, to: [an], subject: betreff, text }),
      });
      if (r.ok) return { ok: true, weg: "resend" };
    } catch (_) { /* SMTP versuchen */ }
  }
  try {
    if (!pf.smtp_passwort_verschluesselt) return { ok: false, fehler: "kein SMTP-Passwort" };
    const pass = await entschluessele(pf.smtp_passwort_verschluesselt);
    const tr = nodemailer.createTransport({
      host: pf.smtp_server, port: Number(pf.smtp_port),
      secure: Number(pf.smtp_port) === 465 || pf.smtp_security === "ssl",
      auth: { user: pf.smtp_user, pass }, tls: { rejectUnauthorized: false },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    });
    await tr.sendMail({ from: `"${pf.absender_name}" <${pf.email_adresse}>`, to: an, subject: betreff, text });
    return { ok: true, weg: "smtp" };
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  let ipHash = "";
  let email = "";
  const merke = async (ergebnis: string) => {
    try { await db.from("akq_eingang_log").insert({ ip_hash: ipHash, email, ergebnis }); } catch (_) { /* egal */ }
  };

  try {
    if (req.method !== "POST") return antwort({ ok: false, fehler: "Nur POST." }, 405);
    const body = await req.json().catch(() => ({}));

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unbekannt";
    ipHash = await hash(ip + "|akq");
    email = txt(body.email, 120).toLowerCase();

    // --- Honeypot ---
    if (txt(body.webseite)) { await merke("honeypot"); return antwort({ ok: true, hinweis: "Danke!" }); }

    // --- Pflichtfelder ---
    if (body.dsgvo !== true) return antwort({ ok: false, fehler: "Bitte stimmen Sie der Datenschutzerklärung zu." }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return antwort({ ok: false, fehler: "Bitte geben Sie eine gültige E-Mail-Adresse an." }, 400);
    if (!txt(body.nachname) && !txt(body.vorname)) return antwort({ ok: false, fehler: "Bitte geben Sie Ihren Namen an." }, 400);
    if (!txt(body.ort) && !txt(body.plz)) return antwort({ ok: false, fehler: "Bitte geben Sie mindestens PLZ oder Ort an." }, 400);

    // --- Rate-Limit ---
    const vorEinerStunde = new Date(Date.now() - 3600000).toISOString();
    const vorEinemTag = new Date(Date.now() - 86400000).toISOString();
    const [{ count: proIp }, { count: proMail }] = await Promise.all([
      db.from("akq_eingang_log").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", vorEinerStunde),
      db.from("akq_eingang_log").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", vorEinemTag),
    ]);
    if ((proIp || 0) >= 5 || (proMail || 0) >= 3) {
      await merke("rate_limit");
      return antwort({ ok: false, fehler: "Zu viele Anfragen. Bitte melden Sie sich direkt telefonisch bei uns." }, 429);
    }

    // --- Mandant ---
    const mandant = await immoMandantAusAnfrage(req, db, body);
    if (!mandant) {
      await merke("kein_mandant");
      return antwort({ ok: false, fehler: "Das Formular ist keinem Anbieter zugeordnet. Bitte wenden Sie sich direkt an Ihren Ansprechpartner." }, 400);
    }

    // --- Quelle ---
    const quelleSlug = txt(body.quelle, 40).toLowerCase() || "website";
    const { data: quelle } = await db.from("akq_quellen").select("id, name").eq("mandant_id", mandant).eq("slug", quelleSlug).maybeSingle();
    const { data: quelleFallback } = quelle ? { data: null } : await db.from("akq_quellen").select("id, name").eq("mandant_id", mandant).eq("slug", "website").maybeSingle();
    const quelleId = (quelle || quelleFallback)?.id || null;

    // --- Kontakt finden oder anlegen ---
    const { data: vorhanden } = await db.from("kontakte").select("*").eq("mandant_id", mandant).ilike("email", email).limit(1);
    let kontakt = vorhanden && vorhanden[0];
    const kontaktFelder = {
      anrede: txt(body.anrede, 20) || null,
      vorname: txt(body.vorname, 80) || null,
      nachname: txt(body.nachname, 80) || null,
      email,
      telefon: txt(body.telefon, 40) || null,
      strasse: [txt(body.strasse, 120), txt(body.hausnummer, 20)].filter(Boolean).join(" ") || null,
      plz: txt(body.plz, 10) || null,
      ort: txt(body.ort, 80) || null,
      quelle: "Akquise-Formular",
    };
    if (kontakt) {
      const rollen = Array.from(new Set([...(kontakt.rollen || []), "eigentuemer"]));
      await db.from("kontakte").update({ rollen, telefon: kontakt.telefon || kontaktFelder.telefon }).eq("id", kontakt.id);
    } else {
      const { data: neu, error } = await db.from("kontakte")
        .insert({ ...kontaktFelder, rollen: ["eigentuemer"], aktiv: true }).select().single();
      if (error) throw error;
      kontakt = neu;
    }

    // --- Pipeline/Stufe ---
    const { data: pipeline } = await db.from("akq_pipelines").select("id").eq("mandant_id", mandant).eq("art", "setting").eq("aktiv", true)
      .order("sortierung").limit(1).maybeSingle();
    const { data: stufe } = pipeline
      ? await db.from("akq_stufen").select("id").eq("pipeline_id", pipeline.id).order("sortierung").limit(1).maybeSingle()
      : { data: null };

    // --- Zustaendigkeit: wer hat gerade die wenigsten offenen Leads? ---
    const { data: makler } = await db.from("profiles").select("id, name, email")
      .eq("mandant_id", mandant)
      .in("role", ["chef", "mitarbeiter"]).eq("rechte->>akquise", "true");
    let zustaendig = (makler || [])[0] || null;
    if (makler && makler.length > 1) {
      const zaehler = await Promise.all(makler.map(async (m: any) => {
        const { count } = await db.from("akq_leads").select("id", { count: "exact", head: true })
          .eq("zustaendig_id", m.id).eq("status", "offen");
        return { m, count: count || 0 };
      }));
      zaehler.sort((a, b) => a.count - b.count);
      zustaendig = zaehler[0].m;
    }

    // --- Wertindikation + Provision ---
    const wohnflaeche = zahl(body.wohnflaeche);
    const grundstueck = zahl(body.grundstueck);
    const baujahr = zahl(body.baujahr);
    const schaetzung = await schaetzeWert(db, {
      plz: txt(body.plz, 10), ort: txt(body.ort, 80), wohnflaeche, grundstueck,
      baujahr: baujahr ? Math.round(baujahr) : null,
      zustand: txt(body.zustand, 40), objektart: txt(body.objektart, 60),
    });
    const { data: einst } = await db.from("akq_einstellungen").select("*").eq("id", true).maybeSingle();
    const spanne = Number(einst?.spanne_prozent ?? 10) / 100;
    const faktor = Number(einst?.startpreis_faktor ?? 0.85);
    const satz = Number(einst?.provision_satz ?? 3.57);
    const wert = schaetzung.wert;

    const { data: lead, error: leadErr } = await db.from("akq_leads").insert({
      mandant_id: mandant,
      kontakt_id: kontakt.id,
      pipeline_id: pipeline?.id || null,
      stufe_id: stufe?.id || null,
      quelle_id: quelleId,
      zustaendig_id: zustaendig?.id || null,
      titel: [txt(body.objektart, 60), txt(body.ort, 80)].filter(Boolean).join(" · ") || null,
      strasse: txt(body.strasse, 120) || null,
      hausnummer: txt(body.hausnummer, 20) || null,
      plz: txt(body.plz, 10) || null,
      ort: txt(body.ort, 80) || null,
      objektart: txt(body.objektart, 60) || null,
      wohnflaeche, grundstueck,
      zimmer: zahl(body.zimmer),
      baujahr: baujahr ? Math.round(baujahr) : null,
      zustand: txt(body.zustand, 40) || null,
      verkaufszeitraum: txt(body.verkaufszeitraum, 60) || null,
      notiz: txt(body.notiz, 2000) || null,
      dsgvo_ok: true,
      wert_schaetzung: wert,
      wert_min: wert ? Math.round((wert * (1 - spanne)) / 1000) * 1000 : null,
      wert_max: wert ? Math.round((wert * (1 + spanne)) / 1000) * 1000 : null,
      startpreis: wert ? Math.round((wert * faktor) / 1000) * 1000 : null,
      provision_satz: satz,
      provision_erwartet: wert ? Math.round((wert * satz) / 100) : null,
    }).select().single();
    if (leadErr) throw leadErr;

    await db.from("akq_lead_historie").insert({
      mandant_id: mandant,
      lead_id: lead.id, feld: "angelegt", alt: null,
      neu: `Über das Bewertungsformular (${(quelle || quelleFallback)?.name || quelleSlug})`,
      user_name: "Bewertungsformular",
    });

    // --- Automationen der Stufe einplanen ---
    let automation: any = { geplant: 0 };
    try {
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/akq-automation-lauf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ aktion: "planen", lead_id: lead.id }),
      });
      automation = await r.json().catch(() => ({}));
    } catch (e) {
      console.warn("Automationen konnten nicht geplant werden:", e instanceof Error ? e.message : String(e));
    }

    // --- Zustaendigen informieren ---
    if (zustaendig?.email) {
      const adresse = [[txt(body.strasse, 120), txt(body.hausnummer, 20)].filter(Boolean).join(" "), [txt(body.plz, 10), txt(body.ort, 80)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      await benachrichtige(db, mandant, zustaendig.email,
        `Neuer Akquise-Lead: ${[kontaktFelder.vorname, kontaktFelder.nachname].filter(Boolean).join(" ")}`,
        [
          `Über das Bewertungsformular ist ein neuer Eigentümer-Lead eingegangen.`,
          ``,
          `Name:      ${[kontaktFelder.anrede, kontaktFelder.vorname, kontaktFelder.nachname].filter(Boolean).join(" ")}`,
          `E-Mail:    ${email}`,
          `Telefon:   ${kontaktFelder.telefon || "—"}`,
          `Objekt:    ${txt(body.objektart, 60) || "—"}${adresse ? `, ${adresse}` : ""}`,
          `Fläche:    ${wohnflaeche ? wohnflaeche + " m²" : "—"}   Baujahr: ${baujahr || "—"}   Zustand: ${txt(body.zustand, 40) || "—"}`,
          `Zeitraum:  ${txt(body.verkaufszeitraum, 60) || "—"}`,
          `Quelle:    ${(quelle || quelleFallback)?.name || quelleSlug}`,
          ``,
          `Erste Wertindikation: ${eur(wert)}${wert ? ` (Spanne ${eur(wert * (1 - spanne))} – ${eur(wert * (1 + spanne))})` : ""}`,
          `Erwartete Provision:  ${wert ? eur((wert * satz) / 100) : "—"} bei ${satz} %`,
          ``,
          body.notiz ? `Nachricht des Eigentümers:\n${txt(body.notiz, 2000)}\n` : ``,
          `Der Lead liegt in der Akquise-Kachel in der Stufe „Neuer Lead“.`,
        ].join("\n"));
    }

    await merke("lead");
    return antwort({
      ok: true,
      lead_id: lead.id,
      wert, wert_min: lead.wert_min, wert_max: lead.wert_max,
      basis: schaetzung.basis,
      automationen_geplant: automation?.planung?.geplant ?? 0,
    });
  } catch (e) {
    await merke("fehler");
    console.error("akq-lead-eingang:", e);
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
