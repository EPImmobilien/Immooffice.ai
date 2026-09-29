// ============================================================================
// push-senden — Push-Mitteilung „Absender – Betreff“ bei neuer Mail (APNs)
// ----------------------------------------------------------------------------
// Aufrufer:
//   1) DB-Trigger trg_mail_eingang_push (pg_net) mit Header x-push-secret und
//      Body { mail_id }  → Mitteilung „Absender / Betreff / Textanfang“,
//      Kategorie MAIL (iOS-Aktionen „Antworten“ und „Oeffnen“).
//   2) Cron-Funktion push_termin_erinnerungen_senden (pg_net, x-push-secret) mit
//      Body { termin_id, profile_id } → Erinnerung 60 Minuten vor dem Termin,
//      Kategorie TERMIN.
//   3) Das Portal (Admin, „Test-Push an mich“) mit Nutzer-JWT und Body { test: true }.
//   4) Datenbankfunktionen (x-push-secret) mit Body { hinweis: { profile_id, titel,
//      untertitel?, text, url?, collapse?, ref_id? } } → freier Hinweis, z. B. neue
//      Interessenten-Treffer zu einem Objekt (Nutzerschalter profiles.push_treffer).
//
// Secrets: PUSH_HOOK_SECRET, APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (.p8 als
// Text), APNS_BUNDLE_ID (Standard de.immooffice.app),
// APNS_UMGEBUNG ("production" | "sandbox", Standard production — TestFlight ist Production;
// bei BadEnvironmentKeyInToken wird automatisch die andere Umgebung versucht).
// Quelle im Repo: portal/push/push-senden.ts
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") || "de.immooffice.app";
type Umgebung = "production" | "sandbox";
const APNS_HOSTS: Record<Umgebung, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};
const UMGEBUNG_START: Umgebung = (Deno.env.get("APNS_UMGEBUNG") || "production") === "sandbox" ? "sandbox" : "production";
let umgebungAktiv: Umgebung = UMGEBUNG_START;
const andereUmgebung = (u: Umgebung): Umgebung => (u === "production" ? "sandbox" : "production");

let jwtCache: { token: string; erzeugt: number } | null = null;

function b64url(daten: Uint8Array | string): string {
  const bytes = typeof daten === "string" ? new TextEncoder().encode(daten) : daten;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemZuPkcs8(pem: string): Uint8Array {
  const roh = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(roh);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function apnsJwt(): Promise<string> {
  if (jwtCache && Date.now() - jwtCache.erzeugt < 50 * 60 * 1000) return jwtCache.token;
  const keyId = Deno.env.get("APNS_KEY_ID"), teamId = Deno.env.get("APNS_TEAM_ID"), pem = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !teamId || !pem) throw new Error("APNS_KEY_ID, APNS_TEAM_ID oder APNS_PRIVATE_KEY fehlt.");
  const key = await crypto.subtle.importKey("pkcs8", pemZuPkcs8(pem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const kopf = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const inhalt = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${kopf}.${inhalt}`));
  const token = `${kopf}.${inhalt}.${b64url(new Uint8Array(sig))}`;
  jwtCache = { token, erzeugt: Date.now() };
  return token;
}

type Ergebnis = { ok: boolean; status: number; grund?: string; deaktivieren?: boolean; umgebung?: Umgebung };

async function anApns(token: string, collapseId: string, payload: unknown): Promise<Ergebnis> {
  const erste = umgebungAktiv;
  const e = await anApnsUmgebung(erste, token, collapseId, payload);
  if (e.ok || e.grund !== "BadEnvironmentKeyInToken") return e;
  const zweite = andereUmgebung(erste);
  const e2 = await anApnsUmgebung(zweite, token, collapseId, payload);
  if (e2.ok) { umgebungAktiv = zweite; return e2; }
  return { ok: false, status: e.status, umgebung: erste, deaktivieren: false,
    grund: `${erste}: ${e.grund} / ${zweite}: ${e2.grund}` };
}

async function anApnsUmgebung(umgebung: Umgebung, token: string, collapseId: string, payload: unknown): Promise<Ergebnis> {
  const jwt = await apnsJwt();
  const r = await fetch(`${APNS_HOSTS[umgebung]}/3/device/${token}`, {
    method: "POST",
    headers: {
      "authorization": `bearer ${jwt}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": collapseId,
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (r.status === 200) return { ok: true, status: 200, umgebung };
  let grund = "";
  try { grund = (await r.json())?.reason || ""; } catch { /* ohne Folgen */ }
  const tot = r.status === 410 || ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(grund);
  return { ok: false, status: r.status, grund: grund || `HTTP ${r.status}`, deaktivieren: tot, umgebung };
}

function vorschau(text: string | null, html: string | null): string {
  let s = String(text || "").trim();
  if (!s && html) {
    s = String(html)
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
  }
  const zeilen = s.replace(/\r/g, "").split("\n")
    .map((z) => z.replace(/[ \t]+/g, " ").trim())
    .filter((z) => z && !z.startsWith(">"));
  s = zeilen.join("\n").replace(/\n{2,}/g, "\n").trim();
  return s.length > 300 ? s.slice(0, 297).trimEnd() + "…" : s;
}

function terminBeginn(datum: string, uhrzeit: string | null): Date {
  const [j, m, t] = datum.split("-").map((x) => parseInt(x, 10));
  const [hh, mi] = String(uhrzeit || "09:00").slice(0, 5).split(":").map((x) => parseInt(x, 10));
  const utcGuess = Date.UTC(j, m - 1, t, hh, mi);
  const lokalStunde = parseInt(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date(utcGuess)), 10);
  const offset = (lokalStunde - hh + 24) % 24;
  return new Date(utcGuess - offset * 3600 * 1000);
}
const heuteBerlin = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function datumKurz(datum: string): string {
  const [j, m, t] = datum.split("-").map((x) => parseInt(x, 10));
  return `${WOCHENTAGE[new Date(Date.UTC(j, m - 1, t, 12)).getUTCDay()]} ${String(t).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
}

function inRuhezeit(von: string | null, bis: string | null): boolean {
  if (!von || !bis) return false;
  const jetzt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const min = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
  const j = min(jetzt), v = min(von), b = min(bis);
  return v <= b ? (j >= v && j < b) : (j >= v || j < b);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));

    const secret = req.headers.get("x-push-secret") || "";
    const erwartet = Deno.env.get("PUSH_HOOK_SECRET") || "";
    const vomTrigger = !!secret && !!erwartet && secret === erwartet;
    let nutzerId: string | null = null;
    if (!vomTrigger) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!jwt) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
      const { data: u } = await db.auth.getUser(jwt);
      if (!u?.user) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
      const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
      if (!p || !["chef", "mitarbeiter"].includes(p.role)) return antwort({ ok: false, fehler: "Keine Berechtigung." }, 403);
      nutzerId = u.user.id;
      if (body.test !== true) return antwort({ ok: false, fehler: "Ohne Trigger-Geheimnis ist nur { test: true } erlaubt." }, 403);
    }

    // Der Push-Schalter gehoert seit fork_28 dem Mandanten, nicht der
    // Plattform. Er wird deshalb weiter unten gelesen — vorher steht der
    // Empfaenger und damit sein Mandant nicht fest.

    // ---- Empfaenger und Inhalt bestimmen
    type Typ = "test" | "mail" | "termin" | "hinweis";
    let typ: Typ, profilId: string, titel: string, text: string, untertitel: string | null = null;
    let refId: string | null = null, url: string | null = null, collapse: string, kategorie: string, thread: string;
    // Woher der Anlass kommt. Empfaenger und Anlass muessen demselben
    // Mandanten gehoeren; bei test und hinweis gibt es keinen Quellsatz.
    let quellMandant: string | null = null;
    let extra: Record<string, unknown> = {};
    if (body.test === true) {
      typ = "test"; profilId = nutzerId!;
      titel = "ImmoOffice"; text = "Test-Push — die Verbindung steht."; collapse = "test"; kategorie = "ALLGEMEIN"; thread = "test";
    } else if (body.hinweis && typeof body.hinweis === "object") {
      typ = "hinweis";
      const h = body.hinweis;
      profilId = String(h.profile_id || "");
      if (!profilId) return antwort({ ok: false, fehler: "Feld „hinweis.profile_id“ fehlt." }, 400);
      titel = String(h.titel || "ImmoOffice").slice(0, 90);
      untertitel = h.untertitel ? String(h.untertitel).slice(0, 80) : null;
      text = String(h.text || "").slice(0, 300) || " ";
      refId = h.ref_id ? String(h.ref_id) : null; url = h.url ? String(h.url) : null;
      collapse = String(h.collapse || "hinweis-" + Date.now()); kategorie = "ALLGEMEIN"; thread = String(h.thread || "hinweis");
    } else if (body.termin_id) {
      typ = "termin";
      const zielProfil = String(body.profile_id || "");
      if (!zielProfil) return antwort({ ok: false, fehler: "Feld „profile_id“ fehlt." }, 400);
      const { data: t } = await db.from("termine")
        .select("id, titel, art, datum, uhrzeit, ende, ort, immobilie_id, status, ganztags, mandant_id")
        .eq("id", String(body.termin_id)).maybeSingle();
      if (!t) return antwort({ ok: false, fehler: "Termin nicht gefunden." }, 404);
      quellMandant = t.mandant_id || null;
      if (t.status === "storniert") return antwort({ ok: true, uebersprungen: "Termin storniert" });
      profilId = zielProfil;
      const zeit = t.uhrzeit ? String(t.uhrzeit).slice(0, 5) : "";
      const minuten = t.ganztags || !t.uhrzeit ? 999 : Math.round((terminBeginn(t.datum, t.uhrzeit).getTime() - Date.now()) / 60000);
      const wann = minuten <= 1 ? "Jetzt" : minuten <= 90 ? `In ${minuten} Min` : t.datum === heuteBerlin() ? `Heute ${zeit} Uhr` : `${datumKurz(t.datum)} ${zeit} Uhr`.trim();
      titel = `${wann}: ${t.titel || t.art || "Termin"}`.slice(0, 90);
      untertitel = t.art && t.art !== "Sonstiges" ? String(t.art).slice(0, 60) : null;
      let ort = String(t.ort || "").trim();
      if (!ort && t.immobilie_id) {
        const { data: o } = await db.from("immobilien").select("strasse, hausnummer, plz, ort").eq("mandant_id", t.mandant_id).eq("id", t.immobilie_id).maybeSingle();
        if (o) ort = [[o.strasse, o.hausnummer].filter(Boolean).join(" "), [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      }
      const spanne = zeit ? zeit + (t.ende ? "–" + String(t.ende).slice(0, 5) : "") + " Uhr" : "ganztags";
      text = [spanne, ort].filter(Boolean).join(" · ").slice(0, 200);
      refId = t.id; url = "#kalender"; collapse = `termin-${t.id}`; kategorie = "TERMIN"; thread = "termin";
      extra = { termin_id: t.id };
    } else {
      typ = "mail";
      const mailId = String(body.mail_id || "");
      if (!mailId) return antwort({ ok: false, fehler: "Feld „mail_id“ fehlt." }, 400);
      const { data: mail } = await db.from("mail_eingang")
        .select("id, postfach_id, absender_name, absender_email, betreff, ordner, gelesen, archiviert, text, html")
        .eq("id", mailId).maybeSingle();
      if (!mail) return antwort({ ok: false, fehler: "Mail nicht gefunden." }, 404);
      if (mail.ordner !== "posteingang" || mail.gelesen || mail.archiviert) return antwort({ ok: true, uebersprungen: "nicht im Posteingang oder schon gelesen" });
      const { data: pf } = await db.from("mail_postfaecher").select("benutzer_id, email_adresse, mandant_id").eq("id", mail.postfach_id).maybeSingle();
      if (!pf?.benutzer_id) return antwort({ ok: true, uebersprungen: "Postfach ohne Benutzer" });
      quellMandant = pf.mandant_id || null;
      profilId = pf.benutzer_id;
      const name = String(mail.absender_name || "").trim();
      titel = (name || mail.absender_email || "Neue E-Mail").slice(0, 60);
      untertitel = (mail.betreff || "(ohne Betreff)").slice(0, 120);
      text = vorschau(mail.text, mail.html) || "(kein Textinhalt)";
      refId = mail.id; url = `#posteingang/${mail.id}`; collapse = `mail-${mail.id}`; kategorie = "MAIL"; thread = "mail";
      extra = { absender_email: mail.absender_email || null, absender_name: name || null, betreff: mail.betreff || null, postfach: pf.email_adresse || null };
    }

    // ---- Nutzerschalter und Ruhezeit
    const { data: profil } = await db.from("profiles").select("push_mails, push_termine, push_treffer, push_stumm_von, push_stumm_bis, mandant_id").eq("id", profilId).maybeSingle();
    if (!profil?.mandant_id) return antwort({ ok: true, uebersprungen: "Profil ohne Mandanten" });
    // Eine Mail des einen Maklers darf nicht auf dem Telefon des anderen
    // aufleuchten — mit Absender, Betreff und Textanfang im Sperrbildschirm.
    if (quellMandant && quellMandant !== profil.mandant_id) {
      return antwort({ ok: true, uebersprungen: "Anlass und Empfaenger sind verschiedene Mandanten" });
    }
    const { data: schalter } = await db.from("push_einstellungen").select("aktiv")
      .eq("mandant_id", profil.mandant_id).eq("id", 1).maybeSingle();
    if (schalter && schalter.aktiv === false && !body.test) {
      return antwort({ ok: true, uebersprungen: "fuer diesen Mandanten aus" });
    }
    if (typ !== "test") {
      if (typ === "mail" && profil && profil.push_mails === false) return antwort({ ok: true, uebersprungen: "Nutzer hat Mail-Push aus" });
      if (typ === "termin" && profil && profil.push_termine === false) return antwort({ ok: true, uebersprungen: "Nutzer hat Termin-Erinnerung aus" });
      if (typ === "hinweis" && profil && profil.push_treffer === false) return antwort({ ok: true, uebersprungen: "Nutzer hat Hinweise aus" });
      if (profil && inRuhezeit(profil.push_stumm_von, profil.push_stumm_bis)) return antwort({ ok: true, uebersprungen: "Ruhezeit" });
    }

    const { data: geraete } = await db.from("push_geraete").select("id, token").eq("profile_id", profilId).eq("aktiv", true);
    if (!geraete?.length) return antwort({ ok: true, uebersprungen: "keine aktiven Geräte", profile_id: profilId });

    const { data: pfs } = await db.from("mail_postfaecher").select("id").eq("benutzer_id", profilId);
    let badge = 0;
    if (pfs?.length) {
      const { count } = await db.from("mail_eingang").select("id", { count: "exact", head: true })
        .in("postfach_id", pfs.map((x: any) => x.id)).eq("ordner", "posteingang").eq("gelesen", false).eq("archiviert", false);
      badge = count || 0;
    }

    const alert: Record<string, string> = { title: titel, body: text };
    if (untertitel) alert.subtitle = untertitel;
    const payload = {
      aps: { alert, badge, sound: "default", "thread-id": thread, category: kategorie },
      typ, mail_id: typ === "mail" ? refId : null, url, ...extra,
    };

    const ergebnisse: any[] = [];
    for (const g of geraete) {
      let e: Ergebnis;
      try { e = await anApns(g.token, collapse, payload); }
      catch (err) { e = { ok: false, status: 0, grund: err instanceof Error ? err.message : String(err) }; }
      ergebnisse.push({ geraet: g.id, ...e });
      await db.from("push_log").insert({
        profile_id: profilId, token: g.token, typ, ref_id: refId,
        status: e.ok ? "gesendet" : (e.deaktivieren ? "geraet_deaktiviert" : "fehler"),
        fehler: e.ok ? null : e.grund,
      });
      if (e.deaktivieren) await db.from("push_geraete").update({ aktiv: false }).eq("id", g.id);
      else if (e.ok) await db.from("push_geraete").update({ zuletzt_gesehen: new Date().toISOString() }).eq("id", g.id);
    }
    return antwort({ ok: true, gesendet: ergebnisse.filter((x) => x.ok).length, geraete: ergebnisse.length, umgebung: umgebungAktiv, ergebnisse });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) }, 500);
  }
});
