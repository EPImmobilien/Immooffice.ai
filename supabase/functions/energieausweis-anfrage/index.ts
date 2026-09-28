// ============================================================================
// energieausweis-anfrage v3 — oeffentlicher Fragebogen Verbrauchsausweis
// ----------------------------------------------------------------------------
// v3: HTML-Mails im E&P-Design (Navy/Gold, Logo), Text-Fassung als Fallback,
//     Anhaenge (Fotos, Rechnungen, Unterschrift) an beide Mails.
// verify_jwt: FALSE. Schutz: Honeypot + Rate-Limit (5/h je IP).
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BERATUNG = "energie@immooffice.example";
const KOPIE = "info@immooffice.example";
const ABSENDER = "info@immooffice.example";
const ABSENDER_NAME = "Musterhaus Immobilien GmbH";
const LOGO = "https://usguiggfciavwzkdfjgt.supabase.co/storage/v1/object/public/web-assets/logo-weiss.png";
const MAX_ANHANG_GESAMT = 14 * 1024 * 1024;

const NAVY = "#263159";
const GOLD = "#d4a567";

const txt = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const leer = (v: unknown) => v === null || v === undefined || String(v).trim() === "" || String(v).trim() === ",";
const dat = (v: unknown) => (v ? String(v).split("-").reverse().join(".") : "");

async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(bytes: Uint8Array): string {
  let s = "";
  const teil = 0x8000;
  for (let i = 0; i < bytes.length; i += teil) s += String.fromCharCode(...bytes.subarray(i, i + teil));
  return btoa(s);
}

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

type Anhang = { filename: string; bytes: Uint8Array; typ?: string };
type Zeile = [string, unknown];

// ---------------------------------------------------------------- Mailversand
async function postfach(db: any) {
  const { data: genau } = await db.from("mail_postfaecher").select("*").eq("email_adresse", ABSENDER).limit(1);
  if (genau && genau[0]) return genau[0];
  const { data: rest } = await db.from("mail_postfaecher").select("*").eq("aktiv", true)
    .order("ist_standard", { ascending: false }).limit(1);
  return rest && rest[0];
}

async function sendeMail(db: any, opt: { an: string; kopie?: string; antwortAn?: string; betreff: string; text: string; html: string; anhaenge?: Anhang[] }) {
  const pf = await postfach(db);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const protokoll: Record<string, unknown> = { anhaenge: (opt.anhaenge || []).map((a) => a.filename) };

  if (resendKey) {
    try {
      const body: Record<string, unknown> = {
        from: `${ABSENDER_NAME} <${ABSENDER}>`,
        to: [opt.an],
        subject: opt.betreff,
        text: opt.text,
        html: opt.html,
      };
      if (opt.kopie && opt.kopie !== opt.an) body.cc = [opt.kopie];
      if (opt.antwortAn) body.reply_to = [opt.antwortAn];
      if (opt.anhaenge?.length) {
        body.attachments = opt.anhaenge.map((a) => ({
          filename: a.filename,
          content: b64(a.bytes),
          content_type: a.typ || "application/octet-stream",
        }));
      }
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const antwort = await r.text().catch(() => "");
      protokoll.resend_status = r.status;
      protokoll.resend_antwort = antwort.slice(0, 200);
      if (r.ok) return { ok: true, weg: "resend", ...protokoll };
    } catch (e) {
      protokoll.resend_fehler = e instanceof Error ? e.message : String(e);
    }
  }

  try {
    if (!pf?.smtp_passwort_verschluesselt) return { ok: false, fehler: "kein SMTP-Passwort", ...protokoll };
    const pass = await entschluessele(pf.smtp_passwort_verschluesselt);
    const tr = nodemailer.createTransport({
      host: pf.smtp_server, port: Number(pf.smtp_port),
      secure: Number(pf.smtp_port) === 465 || pf.smtp_security === "ssl",
      auth: { user: pf.smtp_user, pass }, tls: { rejectUnauthorized: false },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 45000,
    });
    await tr.sendMail({
      from: `"${ABSENDER_NAME}" <${pf.email_adresse}>`,
      to: opt.an, cc: opt.kopie && opt.kopie !== opt.an ? opt.kopie : undefined, replyTo: opt.antwortAn,
      subject: opt.betreff, text: opt.text, html: opt.html,
      attachments: (opt.anhaenge || []).map((a) => ({ filename: a.filename, content: a.bytes, contentType: a.typ })),
    });
    return { ok: true, weg: "smtp", ...protokoll };
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : String(e), ...protokoll };
  }
}

// -------------------------------------------------------------- Inhalt bauen
function bloecke(d: any): { titel: string; zeilen: Zeile[] }[] {
  const verbrauch: Zeile[] = (d.verbrauch || []).map((v: any, i: number) => {
    if (!v.von && !v.menge) return null;
    let s = `${v.menge} ${v.einheit || ""}`;
    if (v.menge2) s += ` + ${v.menge2} ${v.einheit2 || ""}`;
    if (v.leerstand) s += ` \u00b7 Leerstand ${v.leerstand} %`;
    return [`${dat(v.von)} \u2013 ${dat(v.bis)}`, s] as Zeile;
  }).filter(Boolean);

  return [
    { titel: "Geb\u00e4ude", zeilen: [
      ["Anschrift", d.objekt?.anschrift],
      ["Bundesland", d.objekt?.bundesland],
      ["Geb\u00e4udetyp", d.objekt?.gebaeudetyp],
      ["Baujahr", d.objekt?.baujahr],
      ["Beheizte Wohnfl\u00e4che", d.objekt?.wohnflaeche ? `${d.objekt.wohnflaeche} m\u00b2` : ""],
      ["Wohneinheiten", d.objekt?.wohneinheiten],
      ["Gewerbefl\u00e4che", d.objekt?.gewerbe === "ja" ? `${d.objekt?.gewerbeflaeche || ""} m\u00b2` : ""],
      ["Modernisierung", d.objekt?.modernisiert],
    ] },
    { titel: "Heizung und Warmwasser", zeilen: [
      ["Energietr\u00e4ger", d.anlage?.energietraeger],
      ["Zweiter Energietr\u00e4ger", d.anlage?.energietraeger2],
      ["Baujahr W\u00e4rmeerzeuger", d.anlage?.heizungBaujahr],
      ["Warmwasser", d.anlage?.warmwasser],
      ["Warmwasser in Abrechnung", d.anlage?.wwEnthalten],
      ["L\u00fcftung", d.anlage?.lueftung],
      ["K\u00fchlung", d.anlage?.kuehlung],
      ["Erneuerbare Energien", d.anlage?.erneuerbar],
    ] },
    { titel: "Verbrauch", zeilen: verbrauch.concat(d.hinweis ? [["Erg\u00e4nzungen", d.hinweis] as Zeile] : []) },
    { titel: "Auftrag", zeilen: [
      ["Anlass", d.auftrag?.anlass],
      ["Ben\u00f6tigt bis", dat(d.auftrag?.frist)],
      ["Alter Ausweis vorhanden", d.auftrag?.altAusweis],
      ["Preis", d.kosten?.preis],
      ["Kostenbest\u00e4tigung", d.kosten?.unterschrieben ? `unterschrieben von ${d.kosten?.unterzeichner || ""} am ${d.kosten?.datum || ""}` : "nicht unterschrieben"],
    ] },
    { titel: "Kontakt", zeilen: [
      ["Name", d.kontakt?.name],
      ["Funktion", d.kontakt?.rolle],
      ["E-Mail", d.kontakt?.email],
      ["Telefon", d.kontakt?.telefon],
      ["Rechnungsanschrift", d.kontakt?.rechnungAdresse],
    ] },
    { titel: "Einwilligungen", zeilen: [
      ["Widerrufsbelehrung", d.einwilligungen?.widerrufsbelehrung],
      ["Vorzeitiger Beginn", d.einwilligungen?.sofortigerBeginn],
      ["Angaben richtig", d.einwilligungen?.angabenRichtig],
      ["Datenschutz", d.einwilligungen?.datenschutz],
    ] },
  ];
}

function alsText(d: any, extra: string): string {
  const teile = bloecke(d).map((b) => {
    const zeilen = b.zeilen.filter((z) => !leer(z[1])).map((z) => `  ${z[0]}: ${z[1]}`);
    return zeilen.length ? `${b.titel.toUpperCase()}\n${zeilen.join("\n")}` : "";
  }).filter(Boolean);
  return teile.join("\n\n") + (extra ? `\n\n${extra}` : "");
}

function tabelle(d: any): string {
  return bloecke(d).map((b) => {
    const zeilen = b.zeilen.filter((z) => !leer(z[1]));
    if (!zeilen.length) return "";
    const tr = zeilen.map((z, i) => `
      <tr>
        <td style="padding:9px 16px;font:400 13px/1.5 Arial,Helvetica,sans-serif;color:#6b7080;width:38%;${i ? "border-top:1px solid #ececE6;" : ""}">${esc(z[0])}</td>
        <td style="padding:9px 16px;font:400 14px/1.5 Arial,Helvetica,sans-serif;color:#22252e;${i ? "border-top:1px solid #ecece6;" : ""}">${esc(z[1])}</td>
      </tr>`).join("");
    return `
    <tr><td style="padding:26px 24px 8px 24px">
      <div style="font:400 17px/1.3 Georgia,'Times New Roman',serif;color:${NAVY}">${esc(b.titel)}</div>
      <div style="width:34px;height:2px;background:${GOLD};margin-top:8px"></div>
    </td></tr>
    <tr><td style="padding:0 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ecece6;border-radius:2px;border-collapse:separate">${tr}</table>
    </td></tr>`;
  }).join("");
}

function rahmen(opt: { kopfzeile: string; anrede: string; einleitung: string; d: any; fuss: string; hinweisKasten?: string }): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opt.kopfzeile)}</title></head>
<body style="margin:0;padding:0;background:#f6f6f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f3;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e6e6e0;border-radius:3px">

    <tr><td style="background:${NAVY};padding:24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle"><img src="${LOGO}" alt="Musterhaus Immobilien GmbH" width="150" style="display:block;width:150px;height:auto;border:0"></td>
        <td align="right" style="vertical-align:middle;font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#c9cde0">${esc(opt.kopfzeile)}</td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:30px 24px 0 24px">
      <div style="font:400 24px/1.25 Georgia,'Times New Roman',serif;color:${NAVY}">${esc(opt.anrede)}</div>
      <p style="margin:12px 0 0;font:400 14px/1.65 Arial,Helvetica,sans-serif;color:#4a4e5c">${opt.einleitung}</p>
    </td></tr>

    ${opt.hinweisKasten ? `<tr><td style="padding:18px 24px 0 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="background:#fdf8f1;border-left:3px solid ${GOLD};padding:14px 16px;font:400 13.5px/1.6 Arial,Helvetica,sans-serif;color:#4a4e5c">${opt.hinweisKasten}</td>
      </tr></table>
    </td></tr>` : ""}

    ${tabelle(opt.d)}

    <tr><td style="padding:26px 24px 30px 24px">
      <div style="font:400 12.5px/1.7 Arial,Helvetica,sans-serif;color:#6b7080">${opt.fuss}</div>
    </td></tr>

    <tr><td style="background:${NAVY};padding:18px 24px;font:400 12px/1.7 Arial,Helvetica,sans-serif;color:#c9cde0">
      Musterhaus Immobilien GmbH <br>
      <a href="mailto:info@immooffice.example" style="color:${GOLD};text-decoration:none">info@immooffice.example</a> &nbsp;\u00b7&nbsp; <a href="https://immooffice.example" style="color:${GOLD};text-decoration:none">immooffice.example</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const WIDERRUF_TEXT = [
  "WIDERRUFSBELEHRUNG",
  "",
  "Widerrufsrecht",
  "Sie haben das Recht, binnen 14 Tagen ohne Angabe von Gr\u00fcnden diesen Vertrag zu widerrufen. Die Widerrufsfrist betr\u00e4gt 14 Tage ab dem Tag des Vertragsabschlusses. Um Ihr Widerrufsrecht auszu\u00fcben, m\u00fcssen Sie uns (Musterhaus Immobilien GmbH, E-Mail: info@immooffice.example) mittels einer eindeutigen Erkl\u00e4rung (z. B. ein mit der Post versandter Brief oder eine E-Mail) \u00fcber Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie k\u00f6nnen das Muster-Widerrufsformular oder eine andere eindeutige Erkl\u00e4rung auch auf unserer Webseite www.immooffice.example elektronisch ausf\u00fcllen und \u00fcbermitteln. Machen Sie von dieser M\u00f6glichkeit Gebrauch, so werden wir Ihnen unverz\u00fcglich (z. B. per E-Mail) eine Best\u00e4tigung \u00fcber den Eingang eines solchen Widerrufs \u00fcbermitteln. Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung \u00fcber die Aus\u00fcbung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.",
  "",
  "Folgen des Widerrufs",
  "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverz\u00fcglich und sp\u00e4testens binnen vierzehn Tagen ab dem Tag zur\u00fcckzuzahlen, an dem die Mitteilung \u00fcber Ihren Widerruf dieses Vertrags bei uns eingegangen ist. F\u00fcr diese R\u00fcckzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der urspr\u00fcnglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdr\u00fccklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser R\u00fcckzahlung Entgelte berechnet. Haben Sie verlangt, dass die Dienstleistungen w\u00e4hrend der Widerrufsfrist beginnen sollen, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Aus\u00fcbung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.",
  "",
  "Muster-Widerrufsformular",
  "An Musterhaus Immobilien GmbH, E-Mail: info@immooffice.example:",
  "Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag \u00fcber die Erbringung der folgenden Dienstleistung: Erstellung eines Energieausweises auf Verbrauchsbasis.",
  "Bestellt am (*) / erhalten am (*): __________",
  "Name des/der Verbraucher(s): __________",
  "Anschrift des/der Verbraucher(s): __________",
  "Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier): __________",
  "Datum: __________",
  "(*) Unzutreffendes streichen.",
].join("\n");

const WIDERRUF_HTML = WIDERRUF_TEXT.split("\n").map((z) => {
  if (!z.trim()) return "";
  if (/^(WIDERRUFSBELEHRUNG|Widerrufsrecht|Folgen des Widerrufs|Muster-Widerrufsformular)$/.test(z)) {
    return `<div style="font:400 14px/1.4 Georgia,'Times New Roman',serif;color:${NAVY};margin:14px 0 6px">${esc(z === "WIDERRUFSBELEHRUNG" ? "Widerrufsbelehrung" : z)}</div>`;
  }
  return `<p style="margin:0 0 8px;font:400 12px/1.65 Arial,Helvetica,sans-serif;color:#6b7080">${esc(z)}</p>`;
}).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (req.method !== "POST") return antwort({ ok: false, fehler: "Nur POST." }, 405);

    const ct = req.headers.get("content-type") || "";
    let form: FormData | null = null;
    let d: any = {};
    let honig = "";
    let sigUrl = "";
    let jsonDateien: any[] = [];

    if (ct.includes("multipart/form-data")) {
      form = await req.formData();
      honig = txt(form.get("webseite"));
      try { d = JSON.parse(String(form.get("daten") || "{}")); } catch { d = {}; }
      sigUrl = txt(form.get("unterschrift"), 4000000);
    } else {
      const j: any = await req.json().catch(() => ({}));
      honig = txt(j?.webseite);
      d = j?.daten || j || {};
      sigUrl = txt(j?.unterschrift, 4000000);
      jsonDateien = Array.isArray(j?.dateien_base64) ? j.dateien_base64 : [];
    }

    if (honig) return antwort({ ok: true, hinweis: "Danke!" });

    const email = txt(d?.kontakt?.email, 120).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return antwort({ ok: false, fehler: "Bitte eine g\u00fcltige E-Mail-Adresse angeben." }, 400);
    if (d?.einwilligungen?.datenschutz !== "eingewilligt") return antwort({ ok: false, fehler: "Bitte der Datenschutzerkl\u00e4rung zustimmen." }, 400);

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unbekannt";
    const ipHash = await hash(ip + "|ea");
    const vorEinerStunde = new Date(Date.now() - 3600000).toISOString();
    const { count } = await db.from("energieausweis_anfragen").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).gte("created_at", vorEinerStunde);
    if ((count || 0) >= 5) return antwort({ ok: false, fehler: "Zu viele Anfragen. Bitte melden Sie sich telefonisch bei uns." }, 429);

    const vorgang = crypto.randomUUID();
    const ordner = `anfragen/${vorgang}`;
    const anhaenge: Anhang[] = [];
    const dateiInfos: any[] = [];
    let gesamt = 0;

    async function ablegen(name: string, bytes: Uint8Array, typ: string) {
      const sauber = (name.replace(/[^\w.\- ]+/g, "_").slice(-80)) || "datei";
      const pfad = `${ordner}/${sauber}`;
      const up = await db.storage.from("energieausweis").upload(pfad, bytes, { contentType: typ, upsert: true });
      let link: string | null = null;
      if (!up.error) {
        const s = await db.storage.from("energieausweis").createSignedUrl(pfad, 60 * 60 * 24 * 60);
        link = s.data?.signedUrl || null;
      }
      dateiInfos.push({ name: sauber, pfad, bytes: bytes.length, link, fehler: up.error?.message || null });
      if (gesamt + bytes.length <= MAX_ANHANG_GESAMT) { anhaenge.push({ filename: sauber, bytes, typ }); gesamt += bytes.length; }
    }

    if (form) {
      for (const [key, wert] of form.entries()) {
        if (!key.startsWith("datei") || !(wert instanceof File)) continue;
        const f = wert as File;
        if (f.size > 9 * 1024 * 1024) continue;
        await ablegen(f.name, new Uint8Array(await f.arrayBuffer()), f.type || "application/octet-stream");
      }
    }
    for (const x of jsonDateien) {
      try { await ablegen(String(x.name || "datei"), Uint8Array.from(atob(String(x.inhalt || "")), (c) => c.charCodeAt(0)), String(x.typ || "application/octet-stream")); } catch { /* ignorieren */ }
    }

    let unterschriftPfad: string | null = null;
    if (sigUrl.startsWith("data:image/png;base64,")) {
      const roh = Uint8Array.from(atob(sigUrl.split(",")[1]), (c) => c.charCodeAt(0));
      unterschriftPfad = `${ordner}/unterschrift.png`;
      const up = await db.storage.from("energieausweis").upload(unterschriftPfad, roh, { contentType: "image/png", upsert: true });
      if (!up.error) anhaenge.push({ filename: "Kostenbestaetigung-Unterschrift.png", bytes: roh, typ: "image/png" });
    }

    await db.from("energieausweis_anfragen").insert({
      id: vorgang,
      name: txt(d?.kontakt?.name, 120),
      email,
      telefon: txt(d?.kontakt?.telefon, 60),
      anschrift: txt(d?.objekt?.anschrift, 200),
      anlass: txt(d?.auftrag?.anlass, 60),
      daten: d,
      dateien: dateiInfos,
      unterschrift_pfad: unterschriftPfad,
      preis: txt(d?.kosten?.preis, 60),
      sofortiger_beginn: /verlangt/.test(String(d?.einwilligungen?.sofortigerBeginn || "")) && !/nicht verlangt/.test(String(d?.einwilligungen?.sofortigerBeginn || "")),
      ip_hash: ipHash,
    });

    const dateiListeHtml = dateiInfos.length
      ? `<b style="color:${NAVY}">Dateien (60 Tage abrufbar):</b><br>` + dateiInfos.map((x) =>
          x.link ? `<a href="${esc(x.link)}" style="color:${NAVY}">${esc(x.name)}</a>` : esc(x.name)).join("<br>")
      : "Es wurden keine Dateien hochgeladen.";
    const dateiListeText = dateiInfos.length
      ? "DATEIEN (60 Tage abrufbar)\n" + dateiInfos.map((x) => `  ${x.name}: ${x.link || "\u2014"}`).join("\n")
      : "Keine Dateien hochgeladen.";

    const anBeratung = await sendeMail(db, {
      an: BERATUNG,
      kopie: KOPIE,
      antwortAn: email,
      betreff: `Verbrauchsausweis \u2013 ${txt(d?.objekt?.anschrift, 120) || "neue Anfrage"}`,
      html: rahmen({
        kopfzeile: "Neue Anfrage \u00b7 Energieausweis",
        anrede: "Neue Anfrage \u00fcber den Fragebogen",
        einleitung: `${esc(txt(d?.kontakt?.name, 120))} m\u00f6chte einen Energieausweis auf Verbrauchsbasis f\u00fcr <b>${esc(txt(d?.objekt?.anschrift, 120))}</b>. Antworten geht direkt an den Absender.`,
        d,
        hinweisKasten: dateiListeHtml,
        fuss: `Vorgang ${esc(vorgang)} \u00b7 eingegangen am ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`,
      }),
      text: [
        "\u00dcber den Fragebogen auf der Homepage ist eine neue Anfrage eingegangen.", "",
        alsText(d, dateiListeText), "", `Vorgang: ${vorgang}`,
      ].join("\n"),
      anhaenge,
    });

    const kunde = await sendeMail(db, {
      an: email,
      antwortAn: BERATUNG,
      betreff: "Ihre Anfrage zum Energieausweis \u2013 Eingangsbest\u00e4tigung",
      html: rahmen({
        kopfzeile: "Eingangsbest\u00e4tigung",
        anrede: `Guten Tag ${esc(txt(d?.kontakt?.name, 120))},`,
        einleitung: "vielen Dank f\u00fcr Ihre Anfrage. Wir haben Ihre Angaben erhalten und pr\u00fcfen sie. Bei R\u00fcckfragen melden wir uns telefonisch, in der Regel innerhalb von zwei Werktagen.",
        d,
        hinweisKasten: `Ihr Ansprechpartner: <b style="color:${NAVY}">J\u00f6rn Musterhaus</b>, Energieberatung \u00b7 <a href="tel:01639774328" style="color:${NAVY}">0163 9774328</a>`,
        fuss: WIDERRUF_HTML,
      }),
      text: [
        `Guten Tag ${txt(d?.kontakt?.name, 120)},`, "",
        "vielen Dank f\u00fcr Ihre Anfrage. Wir haben Ihre Angaben erhalten und pr\u00fcfen sie. Bei R\u00fcckfragen melden wir uns telefonisch, in der Regel innerhalb von zwei Werktagen.", "",
        alsText(d, ""), "", WIDERRUF_TEXT, "",
        "Mit freundlichen Gr\u00fc\u00dfen", "Musterhaus Immobilien GmbH",
      ].join("\n"),
      anhaenge,
    });

    await db.from("energieausweis_anfragen").update({ mail_ergebnis: { beratung: anBeratung, kunde } }).eq("id", vorgang);

    if (!anBeratung.ok) return antwort({ ok: false, fehler: "Ihre Angaben wurden gespeichert, die Benachrichtigung schlug aber fehl. Bitte rufen Sie uns an.", vorgang, detail: anBeratung }, 502);
    return antwort({ ok: true, vorgang, dateien: dateiInfos.length, weg: anBeratung.weg, kunde_ok: kunde.ok });
  } catch (e) {
    console.error("energieausweis-anfrage:", e);
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
