// ============================================================================
// onoffice-vorlagen-import v3
//   Liest die E-Mail-Vorlagen aus onOffice (resourcetype "templates", type mail)
//   und legt sie in mail_vorlagen an (Team-Vorlagen, Kategorie "onOffice: <Ordner>").
//   Modi: { modus: "ordner" }                -> Ordner mit Anzahl + Titeln (nichts schreiben)
//         { modus: "liste", ordner?: [..] }   -> Vorschau (Text gekuerzt)
//         { modus: "import", ordner?: [..], benutzer_id?: uuid } -> NUR NEUE anlegen
//   v3: bereits importierte Vorlagen (onoffice_id) werden NICHT mehr ueberschrieben
//       (im Portal nachbearbeitete Texte bleiben erhalten); Nachbereinigung der
//       onOffice-Eigenheiten (Briefkopf, _objektnr_extern, agreementLink, Signaturblock).
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import he from "npm:he@1.2.0";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const URL_OO = "https://api.onoffice.de/api/stable/api.php";

async function sig(msg: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(s)));
}
async function ooAktion(token: string, secret: string, aktion: string, resourcetype: string, resourceid: string, parameters: any) {
  const actionid = `urn:onoffice-de-ns:smart:2.5:smartml:action:${aktion}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = await sig(timestamp + token + resourcetype + actionid, secret);
  const body = { token, request: { actions: [{ actionid, resourceid, resourcetype, identifier: "", timestamp, hmac, hmac_version: "2", parameters }] } };
  const resp = await fetch(URL_OO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await resp.json();
  const a0 = json?.response?.results?.[0];
  const code = a0?.status?.errorcode ?? json?.status?.code;
  if (code && code !== 0 && code !== 200) throw new Error(`onOffice ${code}: ${a0?.status?.message ?? json?.status?.message ?? ""}`);
  return a0;
}

function htmlZuText(html: string) {
  let s = String(html || "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<head[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr|blockquote|table)>/gi, "\n").replace(/<li[^>]*>/gi, "- ");
  s = s.replace(/<[^>]+>/g, "");
  return he.decode(s);
}
// onOffice-Makros -> Portal-Platzhalter (Reihenfolge wichtig: laengere/spezifischere zuerst)
const MAKROS: Array<[RegExp, string]> = [
  [/_objektnr_extern/gi, "{objekt}"],
  [/_objekttitel(\([^)]*\))?,? in _plz _ort/gi, "{objekt}"],
  [/_Objstrasse _Objhausnummer, _plz _ort/gi, "{objekt}"],
  [/_objekttitel(\([^)]*\))?/gi, "{objekt}"],
  [/_Objektadresse(\([^)]*\))?/g, "{objekt}"],
  [/_Immobilie(\([^)]*\))?/g, "{objekt}"],
  [/_anzahl_zimmer/gi, "[ZU PRÜFEN: Zimmeranzahl]"],
  [/_flaeche/gi, "[ZU PRÜFEN: Wohnfläche]"],
  [/_aussen_courtage/gi, "[ZU PRÜFEN: Käuferprovision]"],
  [/_preis\b/gi, "[ZU PRÜFEN: Kaufpreis]"],
  [/_agreementLink\([^)]*\)/g, "[ZU PRÜFEN: Exposé als Anhang beifügen oder Link einsetzen]"],
  [/_Usertelefon/g, "{mein_telefon}"],
  [/_Useremail/g, "{mein_email}"],
  [/_Briefanrede(\([^)]*\))?/g, "{anrede}"],
  [/_Anrede(\([^)]*\))?/g, "{anrede}"],
  [/_Vorname(\([^)]*\))?/g, "{vorname}"],
  [/_Nachname(\([^)]*\))?/g, "{nachname}"],
  [/_Name(\([^)]*\))?/g, "{nachname}"],
  [/_Datum(\([^)]*\))?/g, "{datum}"],
  [/_EmailBetreff(\([^)]*\))?/g, "{betreff}"],
];
function makros(text: string) {
  let s = text;
  s = s.replace(/_(OSG|BILDER|Bilder|Logo|Signatur|Unterschrift|Firmenlogo)[A-Za-z0-9]*(\([^)]*\))?#?/g, "");
  for (const [re, ers] of MAKROS) s = s.replace(re, ers);
  s = s.replace(/(^|[\s>\]])(_[A-Za-z][A-Za-z0-9]*(\([^)]*\))?)#?/g, (_m, vor, mak) => `${vor}[ZU PRÜFEN: ${mak}]`);
  return s;
}
function saeubern(text: string) {
  let s = String(text || "").replace(/\r/g, "").replace(/\u00a0/g, " ")
    .split("\n").map((z) => z.replace(/^[ \t]+|[ \t]+$/g, "").replace(/  +/g, " ")).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  // Briefkopf (Titelzeile + Datum) bis zur Anrede weg
  s = s.replace(/^[\s\S]*?\{anrede\}/, "{anrede}");
  // onOffice-Signaturblock am Ende weg (Portal haengt eigene Signatur an)
  s = s.replace(/\n\s*(Mit freundlichen Grüßen|Freundliche Grüße|Viele Grüße)[^\n]*\n[\s\S]*$/, "");
  s = s.replace(/\n\s*(Freundliche Grüße|Mit freundlichen Grüßen)\s*$/, "");
  s = s.replace(/\n\nBitte klicken Sie hier zum Ausfüllen des zugehörigen Formulars\./g, "");
  s = s.replace(/^\{anrede\}\n\n/, "{anrede},\n\n").replace(/^\{anrede\}\n(?!\n)/, "{anrede},\n\n");
  s = s.replace(/(\{objekt\}\.)\n\n\{objekt\}\n/, "$1\n");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    let userId: string | null = null;
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        userId = u.user.id;
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) throw new Error("Keine Berechtigung.");
      }
    }
    if (body.benutzer_id) userId = String(body.benutzer_id);
    const token = Deno.env.get("ONOFFICE_TOKEN"), secret = Deno.env.get("ONOFFICE_SECRET");
    if (!token || !secret) throw new Error("ONOFFICE_TOKEN / ONOFFICE_SECRET nicht gesetzt.");

    const a0 = await ooAktion(token, secret, "get", "templates", "", { type: "mail" });
    const records = a0?.data?.records ?? [];
    let liste = records.map((r: any) => {
      const e = r.elements || {};
      const roh = String(e.body || "");
      const text = saeubern(makros(e.ishtml || /<[a-z][\s\S]*>/i.test(roh) ? htmlZuText(roh) : roh));
      const ordner = String(e.folder || "onOffice").trim() || "onOffice";
      return { onoffice_id: String(r.id ?? e.id ?? ""), titel: String(e.title || "").trim(), betreff: e.subject ? makros(he.decode(String(e.subject))).replace(/\s+/g, " ").trim() : null, ordner, kategorie: "onOffice: " + ordner.replace(/^\d+\s*\|\s*/, ""), text, ishtml: !!e.ishtml };
    }).filter((v: any) => v.onoffice_id && v.titel);

    if (body.modus === "ordner") {
      const map = new Map<string, { anzahl: number; titel: string[] }>();
      for (const v of liste) { const o = map.get(v.ordner) || { anzahl: 0, titel: [] }; o.anzahl++; if (o.titel.length < 60 && !o.titel.includes(v.titel)) o.titel.push(v.titel); map.set(v.ordner, o); }
      return antwort({ ok: true, gesamt: liste.length, ordner: [...map.entries()].map(([name, o]) => ({ name, ...o })).sort((a, b) => b.anzahl - a.anzahl) });
    }

    const ordnerFilter: string[] = Array.isArray(body.ordner) ? body.ordner.map(String) : [];
    if (ordnerFilter.length) liste = liste.filter((v: any) => ordnerFilter.includes(v.ordner));
    const gesehen = new Set<string>();
    liste = liste.filter((v: any) => { const k = v.ordner + "|" + v.titel.toLowerCase(); if (gesehen.has(k)) return false; gesehen.add(k); return true; });

    if (body.modus !== "import") {
      return antwort({ ok: true, anzahl: liste.length, vorlagen: liste.map((v: any) => ({ ...v, text: v.text.slice(0, Number(body.textlaenge) || 400) })) });
    }
    if (!userId) throw new Error("benutzer_id fehlt.");
    let neu = 0, vorhanden = 0, leer = 0;
    for (const v of liste) {
      if (!v.text.trim()) { leer++; continue; }
      const { data: alt } = await db.from("mail_vorlagen").select("id").eq("onoffice_id", v.onoffice_id).maybeSingle();
      if (alt) { vorhanden++; continue; }
      const { error } = await db.from("mail_vorlagen").insert({ titel: v.titel, kategorie: v.kategorie, betreff: v.betreff, text: v.text, html: null, geteilt: true, benutzer_id: userId, onoffice_id: v.onoffice_id, sortierung: 100 });
      if (error) throw error;
      neu++;
    }
    return antwort({ ok: true, gefunden: liste.length, neu, bereits_vorhanden: vorhanden, uebersprungen_leer: leer });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("onoffice-vorlagen-import:", msg);
    return antwort({ ok: false, fehler: msg });
  }
});
