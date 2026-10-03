// ============================================================================
// unterlagen-link — Download-Links auf Objektunterlagen (Stufe 114 und 117)
// ============================================================================
// Eigene Funktion des Forks. Die Oberflaeche der Vorlage ruft sie, der
// Netlify-Export enthaelt sie aber nicht (er liefert nur die Oberflaeche).
// Verhalten und Datenfluss sind aus dem Vertrag der Oberflaeche abgeleitet:
// aus dem, was sie sendet, und aus dem, was die oeffentliche Seite
// unterlagen.html aus der Antwort liest. Siehe supabase/eigene/README.md.
//
// ZWEI WEGE, EINE FUNKTION:
//
//   OEFFENTLICH (unterlagen.html, nur mit Token, ohne Konto)
//     {token, aktion:"info",  passwort}            -> Kopfdaten + Dateiliste
//     {token, aktion:"datei", passwort, datei_id}  -> kurzlebige signierte URL
//
//   ANGEMELDET (die Anwendung, mit Bearer-Token)
//     {aktion:"anlegen",  …}  -> Link erstellen (Objekt ODER Transfer)
//     {aktion:"loeschen", id} -> Dateien endgueltig loeschen, Link sperren
//     {aktion:"melden"}       -> Cron: Meldemail nach Downloads
//
// Deshalb steht verify_jwt auf false: der oeffentliche Weg hat kein Konto.
// Die Grenze zieht nicht das JWT, sondern das Token — und fuer die
// angemeldeten Aktionen prueft die Funktion den Anmeldekopf selbst.
//
// WAS DAS TOKEN LEISTEN MUSS: es ist der einzige Schluessel zu fremden
// Unterlagen. 32 Byte aus crypto.getRandomValues, base64url — nicht zu
// erraten und nicht aus der Objektkennung herzuleiten.
//
// WAS DAS PASSWORT LEISTEN MUSS: es liegt als PBKDF2-Hash mit Salz, nie im
// Klartext. Die Oberflaeche liest nur hat_passwort. Nach zehn falschen
// Versuchen in einer Viertelstunde ist der Link gesperrt — ohne das waere das
// Passwort in Minuten durchprobiert.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const antwort = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Wie lange eine signierte Adresse gilt. Kurz, weil sie im Browser des
// Empfaengers landet und von dort weitergegeben werden koennte.
const URL_SEKUNDEN = 300;
// Sperre nach falschen Passwoertern.
const FEHLVERSUCHE_MAX = 10;
const FEHLVERSUCHE_FENSTER_MIN = 15;
// Der Eimer, in den die Oberflaeche die Dateien eines Transfers laedt
// (Stufe 117). Der Name steht in ihrem XHR-Upload fest.
const EIMER_TRANSFER = "transfer-dateien";

// ---------------------------------------------------------------- Werkzeuge

function tokenNeu(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function passwortHash(klar: string, salzVorgabe?: string): Promise<string> {
  const salz = salzVorgabe || (() => {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return btoa(String.fromCharCode(...b)).replace(/=+$/, "");
  })();
  const roh = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(klar), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salz), iterations: 120000, hash: "SHA-256" },
    roh, 256);
  const hex = Array.from(new Uint8Array(bits)).map((x) => x.toString(16).padStart(2, "0")).join("");
  return `v1.${salz}.${hex}`;
}

async function passwortStimmt(klar: string, hash: string): Promise<boolean> {
  const teile = String(hash || "").split(".");
  if (teile.length !== 3 || teile[0] !== "v1") return false;
  const neu = await passwortHash(klar, teile[1]);
  // Zeitgleicher Vergleich: ein frueher Abbruch verraet, wie viele Zeichen
  // schon stimmen.
  const a = new TextEncoder().encode(neu), b = new TextEncoder().encode(hash);
  if (a.length !== b.length) return false;
  let gleich = 0;
  for (let i = 0; i < a.length; i++) gleich |= a[i] ^ b[i];
  return gleich === 0;
}

function adresseVon(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("cf-connecting-ip") || "";
}

// Der Mandant des Aufrufers — fuer die angemeldeten Aktionen. Gleiche Bauart
// wie in den uebrigen Funktionen des Forks: ein zweiter Client, der nur den
// mitgebrachten Anmeldekopf weiterreicht.
async function mandantDesAufrufers(req: Request): Promise<{ mandant: string; nutzer: string } | null> {
  const kopf = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(kopf)) return null;
  const nutzerClient = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: kopf } }, auth: { persistSession: false } });
  const { data: u } = await nutzerClient.auth.getUser();
  if (!u?.user) return null;
  const { data: p } = await nutzerClient
    .from("profiles").select("mandant_id, role").eq("id", u.user.id).maybeSingle();
  if (!p?.mandant_id || !["chef", "mitarbeiter"].includes(String(p.role))) return null;
  return { mandant: String(p.mandant_id), nutzer: u.user.id };
}

async function firmenName(db: any, mandant: unknown): Promise<string> {
  if (typeof mandant !== "string" || !mandant) return "";
  const { data } = await db.from("firma_stammdaten")
    .select("firma_name, marken_name").eq("mandant_id", mandant).eq("aktiv", true)
    .order("sortierung", { ascending: true }).limit(1).maybeSingle();
  return String(data?.marken_name || data?.firma_name || "").trim();
}

// ------------------------------------------------------------------ Protokoll

async function merken(db: any, link: any, art: string, dateiName?: string, req?: Request) {
  try {
    await db.from("unterlagen_link_abrufe").insert({
      mandant_id: link.mandant_id,
      link_id: link.id,
      art,
      datei_name: dateiName || null,
      ip: req ? adresseVon(req) : null,
      user_agent: req ? (req.headers.get("user-agent") || "").slice(0, 200) : null,
    });
  } catch (e) {
    // Ein Protokolleintrag darf den Download nicht verhindern.
    console.warn("Abruf nicht protokolliert:", e instanceof Error ? e.message : String(e));
  }
}

// ------------------------------------------------- Link aus dem Token holen
//
// Liefert entweder den Link oder einen Grund, warum nicht. Der Grund ist
// bewusst grob: "ungueltig" sagt nicht, ob es das Token nie gab oder ob es
// geloescht wurde. Wer rateт, soll daraus nichts lernen.
type Befund =
  | { ok: true; link: any }
  | { ok: false; grund: "ungueltig" | "abgelaufen" | "gesperrt"; fehler?: string };

async function linkHolen(db: any, token: unknown): Promise<Befund> {
  if (typeof token !== "string" || token.length < 20) {
    return { ok: false, grund: "ungueltig" };
  }
  const { data: link } = await db.from("unterlagen_links").select("*").eq("token", token).maybeSingle();
  if (!link) return { ok: false, grund: "ungueltig" };
  if (link.widerrufen_am) {
    return { ok: false, grund: "gesperrt", fehler: "Dieser Link wurde zurueckgezogen." };
  }
  if (new Date(link.gueltig_bis).getTime() < Date.now()) {
    return { ok: false, grund: "abgelaufen" };
  }
  return { ok: true, link };
}

async function gesperrtWegenFehlversuchen(db: any, link: any): Promise<boolean> {
  const seit = new Date(Date.now() - FEHLVERSUCHE_FENSTER_MIN * 60000).toISOString();
  const { count } = await db.from("unterlagen_link_abrufe")
    .select("id", { count: "exact", head: true })
    .eq("link_id", link.id).eq("art", "passwort_falsch").gte("created_at", seit);
  return (count || 0) >= FEHLVERSUCHE_MAX;
}

// ------------------------------------------------------- Dateien eines Links
//
// Zwei Quellen, je nachdem wie der Link entstanden ist: Dateien AM OBJEKT
// (datei_ids -> immobilie_datei) oder ein TRANSFER ohne Objekt
// (transfer_dateien). Die Oberflaeche unterscheidet sie nicht; die
// oeffentliche Seite sieht in beiden Faellen {id, name, groesse}.
async function dateienVon(db: any, link: any) {
  if (Array.isArray(link.datei_ids) && link.datei_ids.length) {
    const { data } = await db.from("immobilie_datei")
      .select("id, name, size_bytes, storage_path, mime_type")
      .eq("mandant_id", link.mandant_id).in("id", link.datei_ids);
    return (data || []).map((d: any) => ({
      id: d.id, name: d.name, groesse: Number(d.size_bytes) || 0,
      eimer: "immobilie-dateien", pfad: d.storage_path, mime: d.mime_type,
    }));
  }
  const { data } = await db.from("transfer_dateien")
    .select("id, name, groesse, pfad, mime_type, geloescht_am")
    .eq("mandant_id", link.mandant_id).eq("link_id", link.id).is("geloescht_am", null)
    .order("created_at");
  return (data || []).map((d: any) => ({
    id: d.id, name: d.name, groesse: Number(d.groesse) || 0,
    eimer: EIMER_TRANSFER, pfad: d.pfad, mime: d.mime_type,
  }));
}

// ============================================================ Deno.serve
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });

  let koerper: any = {};
  try { koerper = await req.json(); } catch (_e) { /* leerer Koerper ist ein Fehler weiter unten */ }
  const aktion = String(koerper?.aktion || "").trim();

  try {
    // ---------------------------------------------------------- OEFFENTLICH
    if (aktion === "info" || aktion === "datei") {
      const befund = await linkHolen(db, koerper.token);
      if (!befund.ok) {
        return antwort({ ok: false, grund: befund.grund, fehler: befund.fehler || null });
      }
      const link = befund.link;

      if (link.hat_passwort) {
        const klar = String(koerper.passwort || "");
        if (!klar) {
          return antwort({ ok: false, passwort_noetig: true, titel: link.titel || null });
        }
        if (await gesperrtWegenFehlversuchen(db, link)) {
          return antwort({
            ok: false, grund: "gesperrt",
            fehler: "Zu viele Fehlversuche. Bitte wenden Sie sich an Ihren Ansprechpartner.",
          });
        }
        if (!await passwortStimmt(klar, link.passwort_hash)) {
          await merken(db, link, "passwort_falsch", undefined, req);
          return antwort({
            ok: false, passwort_noetig: true, falsch: true,
            fehler: "Das Passwort ist nicht richtig.",
          });
        }
      }

      const dateien = await dateienVon(db, link);

      // --- Eine Datei herausgeben -------------------------------------
      if (aktion === "datei") {
        const gewaehlt = dateien.find((d: any) => d.id === String(koerper.datei_id || ""));
        if (!gewaehlt || !gewaehlt.pfad) {
          return antwort({ ok: false, fehler: "Diese Datei gehoert nicht zu dem Link." }, 404);
        }
        const { data: sig, error } = await db.storage.from(gewaehlt.eimer)
          .createSignedUrl(gewaehlt.pfad, URL_SEKUNDEN, { download: gewaehlt.name });
        if (error || !sig?.signedUrl) {
          return antwort({ ok: false, fehler: "Die Datei ist nicht abrufbar." }, 500);
        }
        await merken(db, link, "download", gewaehlt.name, req);
        await db.from("unterlagen_links").update({
          downloads: (Number(link.downloads) || 0) + 1,
          zuletzt_download_am: new Date().toISOString(),
        }).eq("id", link.id);
        return antwort({ ok: true, url: sig.signedUrl, name: gewaehlt.name });
      }

      // --- Kopfdaten und Liste ----------------------------------------
      await merken(db, link, "geoeffnet", undefined, req);
      await db.from("unterlagen_links").update({
        aufrufe: (Number(link.aufrufe) || 0) + 1,
        zuletzt_geoeffnet_am: new Date().toISOString(),
      }).eq("id", link.id);

      // Absender und Briefkopf kommen aus dem Mandanten des Links, nicht aus
      // einer Umgebungsvariablen — sonst stuende bei jedem Makler derselbe
      // Name (Phase 2.4).
      const { data: firma } = await db.from("firma_stammdaten")
        .select("firma_name, marken_name, strasse, plz, ort, telefon, email")
        .eq("mandant_id", link.mandant_id).eq("aktiv", true)
        .order("sortierung", { ascending: true }).limit(1).maybeSingle();

      let absender: any = null;
      if (link.erstellt_von) {
        const { data: p } = await db.from("profiles")
          .select("name, telefon, email").eq("id", link.erstellt_von)
          .eq("mandant_id", link.mandant_id).maybeSingle();
        if (p) absender = { name: p.name || "", telefon: p.telefon || "", email: p.email || "" };
      }

      let objekt: any = null;
      if (link.immobilie_id) {
        const { data: im } = await db.from("immobilien")
          .select("immo_nr, objekttitel, bezeichnung, ort")
          .eq("id", link.immobilie_id).eq("mandant_id", link.mandant_id).maybeSingle();
        if (im) {
          objekt = {
            titel: im.objekttitel || im.bezeichnung || "",
            nr: im.immo_nr || "",
            ort: im.ort || "",
          };
        }
      }

      return antwort({
        ok: true,
        id: link.id,
        titel: link.titel || "Unterlagen",
        nachricht: link.nachricht || "",
        gueltig_bis: link.gueltig_bis,
        typ: link.immobilie_id ? "objekt" : "transfer",
        kategorie: link.immobilie_id ? "unterlagen" : "transfer",
        objekt,
        absender,
        firma: firma
          ? {
              firma_name: firma.marken_name || firma.firma_name || "",
              strasse: firma.strasse || "", plz: firma.plz || "", ort: firma.ort || "",
              telefon: firma.telefon || "", email: firma.email || "",
            }
          : null,
        dateien: dateien.map((d: any) => ({ id: d.id, name: d.name, groesse: d.groesse })),
      });
    }

    // ----------------------------------------------------------- ANGEMELDET
    if (aktion === "anlegen") {
      const wer = await mandantDesAufrufers(req);
      if (!wer) return antwort({ ok: false, fehler: "Kein Teamzugang." }, 403);

      const bis = new Date(String(koerper.gueltig_bis || ""));
      if (!isFinite(bis.getTime()) || bis.getTime() < Date.now() + 3600000) {
        return antwort({ ok: false, fehler: "Das Ablaufdatum muss in der Zukunft liegen." }, 400);
      }
      const klar = String(koerper.passwort || "").trim();
      if (klar && klar.length < 6) {
        return antwort({ ok: false, fehler: "Das Passwort braucht mindestens 6 Zeichen." }, 400);
      }

      const transfer = koerper.transfer && typeof koerper.transfer === "object"
        ? koerper.transfer : null;
      const immobilieId = String(koerper.immobilie_id || "").trim() || null;
      if (!transfer && !immobilieId) {
        return antwort({ ok: false, fehler: "Weder Objekt noch Transfer angegeben." }, 400);
      }

      // Die Kennungen kommen aus dem Anfragekoerper. Unter dem
      // Dienstschluessel gilt RLS nicht — also hier pruefen, ob sie dem
      // Mandanten des Aufrufers gehoeren.
      let dateiIds: string[] = [];
      if (immobilieId) {
        const { data: im } = await db.from("immobilien")
          .select("id").eq("id", immobilieId).eq("mandant_id", wer.mandant).maybeSingle();
        if (!im) return antwort({ ok: false, fehler: "Objekt nicht gefunden." }, 404);
        const gewuenscht = Array.isArray(koerper.datei_ids) ? koerper.datei_ids.map(String) : [];
        if (!gewuenscht.length) {
          return antwort({ ok: false, fehler: "Bitte mindestens eine Datei auswaehlen." }, 400);
        }
        const { data: eigene } = await db.from("immobilie_datei")
          .select("id").eq("mandant_id", wer.mandant).eq("immobilie_id", immobilieId)
          .in("id", gewuenscht);
        dateiIds = (eigene || []).map((d: any) => d.id);
        if (dateiIds.length !== gewuenscht.length) {
          return antwort({
            ok: false,
            fehler: "Mindestens eine Datei gehoert nicht zu diesem Objekt.",
          }, 403);
        }
      }
      const kontaktId = String(koerper.kontakt_id || "").trim() || null;
      if (kontaktId) {
        const { data: k } = await db.from("kontakte")
          .select("id").eq("id", kontaktId).eq("mandant_id", wer.mandant).maybeSingle();
        if (!k) return antwort({ ok: false, fehler: "Kontakt nicht gefunden." }, 404);
      }

      const token = tokenNeu();
      const { data: neu, error } = await db.from("unterlagen_links").insert({
        mandant_id: wer.mandant,
        immobilie_id: immobilieId,
        erstellt_von: wer.nutzer,
        token,
        titel: String(koerper.titel || "").trim() || null,
        nachricht: String(koerper.nachricht || "").trim() || null,
        datei_ids: dateiIds,
        ordner: transfer ? String(transfer.ordner || "").trim() || null : null,
        gueltig_bis: bis.toISOString(),
        passwort_hash: klar ? await passwortHash(klar) : null,
        hat_passwort: !!klar,
        empfaenger_name: String(koerper.empfaenger_name || "").trim() || null,
        empfaenger_email: String(koerper.empfaenger_email || "").trim() || null,
        kontakt_id: kontaktId,
        benachrichtigen: koerper.benachrichtigen !== false,
      }).select("id, token").single();
      if (error) throw new Error(error.message);

      // Transfer: die hochgeladenen Dateien an den Link haengen. Die Pfade
      // hat die Oberflaeche selbst geschrieben; geprueft wird, dass sie im
      // Mandantenpfad liegen — sonst zeigte ein Transfer auf fremde Dateien.
      if (transfer && Array.isArray(transfer.dateien)) {
        const zeilen = [];
        for (const d of transfer.dateien) {
          const pfad = String(d?.pfad || "").trim();
          if (!pfad) continue;
          if (!pfad.startsWith(wer.mandant + "/")) {
            return antwort({
              ok: false,
              fehler: "Ein Dateipfad liegt ausserhalb des eigenen Mandanten.",
            }, 403);
          }
          zeilen.push({ link_id: neu.id, name: String(d?.name || "Datei"), pfad });
        }
        if (zeilen.length) {
          // Der Mandant steht AM insert, nicht nur in den Zeilen darueber.
          // Nicht aus Vorsicht, sondern damit es zu lesen ist: eine Zeile
          // ohne mandant_id ist fuer jeden unsichtbar, weil die restriktive
          // Richtlinie vergleicht und NULL mit nichts gleich ist.
          // tests/oeffentlich-insert-mandant.py sieht nur, was beim insert
          // steht — und wer den Quelltext liest, auch.
          const { error: tErr } = await db.from("transfer_dateien")
            .insert(zeilen.map((z) => ({ mandant_id: wer.mandant, ...z })));
          if (tErr) throw new Error(tErr.message);
        }
      }

      return antwort({ ok: true, id: neu.id, token: neu.token });
    }

    if (aktion === "loeschen") {
      const wer = await mandantDesAufrufers(req);
      if (!wer) return antwort({ ok: false, fehler: "Kein Teamzugang." }, 403);
      const id = String(koerper.id || "").trim();
      const { data: link } = await db.from("unterlagen_links")
        .select("*").eq("id", id).eq("mandant_id", wer.mandant).maybeSingle();
      if (!link) return antwort({ ok: false, fehler: "Link nicht gefunden." }, 404);

      // Nur die Dateien eines TRANSFERS werden geloescht. Dateien am Objekt
      // gehoeren dem Objekt, nicht dem Link — sie zu loeschen, weil ein Link
      // endet, waere ein Datenverlust, den niemand bestellt hat.
      let weg = 0;
      if (!link.immobilie_id) {
        const { data: dateien } = await db.from("transfer_dateien")
          .select("id, pfad").eq("link_id", link.id).eq("mandant_id", wer.mandant)
          .is("geloescht_am", null);
        const pfade = (dateien || []).map((d: any) => d.pfad).filter(Boolean);
        if (pfade.length) {
          try { await db.storage.from(EIMER_TRANSFER).remove(pfade); }
          catch (e) { console.warn("Storage:", e instanceof Error ? e.message : String(e)); }
        }
        // Die ZEILEN bleiben, mit Zeitstempel: das Protokoll soll "nicht mehr
        // da" zeigen koennen und nicht "gab es nie".
        await db.from("transfer_dateien")
          .update({ geloescht_am: new Date().toISOString() })
          .eq("link_id", link.id).is("geloescht_am", null);
        weg = pfade.length;
      }
      await db.from("unterlagen_links")
        .update({ widerrufen_am: new Date().toISOString() }).eq("id", link.id);
      return antwort({ ok: true, geloescht: weg });
    }

    // Cron alle fuenf Minuten: eine Meldung an den Ersteller, wenn seit der
    // letzten Meldung geladen wurde. Gesammelt, nicht je Datei — sonst
    // bekommt er bei zwanzig Dateien zwanzig Mails.
    if (aktion === "melden") {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const absenderAdresse = (Deno.env.get("SMTP_FROM_EMAIL") || "").trim();
      if (!resendKey || !absenderAdresse) {
        return antwort({ ok: true, gemeldet: 0, hinweis: "Kein Versandweg konfiguriert." });
      }
      const { data: offene } = await db.from("unterlagen_links")
        .select("*").eq("benachrichtigen", true)
        .not("zuletzt_download_am", "is", null)
        .limit(50);
      let gemeldet = 0;
      for (const link of offene || []) {
        try {
          // Schon gemeldet? Der letzte Download muss nach der letzten
          // Meldung liegen. Die Meldung selbst steht im Protokoll.
          const { data: letzte } = await db.from("unterlagen_link_abrufe")
            .select("created_at").eq("link_id", link.id).eq("art", "download")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (!letzte) continue;
          const { data: schon } = await db.from("unterlagen_link_abrufe")
            .select("created_at").eq("link_id", link.id).eq("art", "gemeldet")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (schon && new Date(schon.created_at) >= new Date(letzte.created_at)) continue;

          const { data: wer } = await db.from("profiles")
            .select("email, name").eq("id", link.erstellt_von)
            .eq("mandant_id", link.mandant_id).maybeSingle();
          if (!wer?.email) continue;

          const seit = schon ? schon.created_at : link.created_at;
          const { data: neueDownloads } = await db.from("unterlagen_link_abrufe")
            .select("datei_name, created_at").eq("link_id", link.id).eq("art", "download")
            .gte("created_at", seit).order("created_at");
          if (!neueDownloads || !neueDownloads.length) continue;

          const firma = await firmenName(db, link.mandant_id);
          const empf = link.empfaenger_name || link.empfaenger_email || "Der Empfaenger";
          const liste = neueDownloads
            .map((d: any) => `  • ${d.datei_name || "Datei"} (${new Date(d.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })})`)
            .join("\n");
          const text = `Hallo ${wer.name || ""},\n\n${empf} hat Unterlagen aus „${link.titel || "Ihrem Link"}“ geladen:\n\n${liste}\n\nMit freundlichen Grüßen\n${firma}`;

          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: `${firma || Deno.env.get("SMTP_FROM_NAME") || "ImmoOffice"} <${absenderAdresse}>`,
              to: [wer.email],
              subject: `Unterlagen geladen: ${link.titel || "Download-Link"}`,
              text,
            }),
          });
          if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
          await merken(db, link, "gemeldet");
          gemeldet++;
        } catch (e) {
          console.warn("Meldung fuer Link", link.id, e instanceof Error ? e.message : String(e));
        }
      }
      return antwort({ ok: true, gemeldet });
    }

    return antwort({ ok: false, fehler: `Unbekannte Aktion: ${aktion || "(keine)"}` }, 400);
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("unterlagen-link:", meldung);
    return antwort({ ok: false, fehler: meldung }, 500);
  }
});
