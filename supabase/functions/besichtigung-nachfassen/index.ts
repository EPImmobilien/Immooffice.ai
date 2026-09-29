// ============================================================================
// besichtigung-nachfassen v2 — Nachfass-Vorschläge nach Besichtigungen
// ----------------------------------------------------------------------------
// Läuft täglich (Cron) oder per Knopf. Für jede Besichtigung, die vor N Tagen
// (Standard 3) stattfand und einen Adressbuch-Kontakt hat, wird geprüft:
//   A) hat der Kunde sich seit dem Termin gemeldet (Mail von seiner Adresse)?
//   B) hat jemand von uns ihm seit dem Termin geschrieben?
//   C) ist er beim Objekt schon Käufer/Mieter, oder ist das Objekt verkauft/vermietet?
// Trifft nichts zu, formuliert Claude eine persönliche Nachfrage im Namen des
// Maklers, der den Termin hatte. Sie wird NICHT gesendet, sondern als Aufgabe
// (public.aufgaben, typ besichtigung_nachfass) zur Freigabe ins Dashboard gelegt.
//
// Body (optional): { tage: 3, termin_id: "…" (nur diesen), trocken: true (nur prüfen) }
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-4-6";

const fmtDatum = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
function datumPlus(datum: string, tage: number): string {
  const d = new Date(datum + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
const deDatum = (iso: string) => { const [j, m, t] = iso.split("-"); return `${t}.${m}.${j}`; };
const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function anredeZeile(k: any): string {
  const name = [k.titel, k.nachname].filter(Boolean).join(" ");
  const a = String(k.anrede || "").toLowerCase();
  if (!k.nachname) return "Guten Tag,";
  if (a.startsWith("herr")) return `Sehr geehrter Herr ${name},`;
  if (a.startsWith("frau")) return `Sehr geehrte Frau ${name},`;
  return `Guten Tag ${[k.vorname, name].filter(Boolean).join(" ")},`;
}

async function entwurfSchreiben(p: { anrede: string; kunde: string; objekt: string; adresse: string; vermarktung: string; besichtigung: string; makler: string }): Promise<{ betreff: string; text: string }> {
  const fallbackText = `${p.anrede}

vielen Dank noch einmal für Ihren Besuch am ${p.besichtigung} in ${p.objekt}${p.adresse ? ` (${p.adresse})` : ""}.

Ich würde mich freuen zu hören, welchen Eindruck Sie mitgenommen haben und ob das Objekt für Sie weiterhin in Frage kommt. Falls noch Fragen offen sind oder Sie sich einen zweiten Termin wünschen, melden Sie sich gern – ich kümmere mich zeitnah darum.

Mit freundlichen Grüßen
${p.makler}`;
  const fallback = { betreff: `Ihre Besichtigung ${p.objekt} – noch Interesse?`, text: fallbackText };
  if (!ANTHROPIC_API_KEY) return fallback;
  const system = `Du schreibst für ${p.makler} von Musterhaus Immobilien GmbH  eine kurze persönliche Nachfass-E-Mail an einen Interessenten, der vor drei Tagen ein Objekt besichtigt hat und sich seitdem nicht gemeldet hat.
Regeln:
- Deutsch, Sie-Form, warm und unaufdringlich, 70–120 Wörter im Fließtext; sachlich-freundlich wie ein guter Makler, keine Wortspiele, keine gewollt originellen Formulierungen.
- Beginne exakt mit dieser Anrede: "${p.anrede}" — danach ein kurzer Dank für den Besichtigungstermin.
- Bezug auf die Besichtigung (Datum) und das Objekt beim Namen; frage, ob weiterhin Interesse besteht; biete an, offene Fragen zu klären oder einen zweiten Termin zu machen.
- KEINE erfundenen Fakten (keine Preise, Zahlen, Fristen, andere Interessenten, keine Druckmittel).
- Ende mit "Mit freundlichen Grüßen" und in der nächsten Zeile "${p.makler}". Keine Signatur/Kontaktdaten darunter, die wird automatisch angehängt.
- Antworte AUSSCHLIESSLICH als JSON: {"betreff": "...", "text": "..."} — Betreff kurz, mit Objektbezug, ohne "Re:".`;
  const user = `Kunde: ${p.kunde}
Objekt: ${p.objekt}${p.adresse ? `\nAdresse: ${p.adresse}` : ""}${p.vermarktung ? `\nVermarktung: ${p.vermarktung}` : ""}
Besichtigung: ${p.besichtigung}
Makler: ${p.makler}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, temperature: 0.35, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}`);
    const d = await r.json();
    let t = d?.content?.[0]?.text || "";
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) t = m[1].trim();
    const j = JSON.parse(t);
    if (!j.betreff || !j.text) throw new Error("JSON unvollständig");
    return { betreff: String(j.betreff).trim(), text: String(j.text).trim() };
  } catch (e) {
    console.warn("Entwurf per KI fehlgeschlagen, nehme Vorlage:", e instanceof Error ? e.message : String(e));
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const antwort = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (jwt && jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: u } = await db.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        if (!p || !["chef", "mitarbeiter"].includes(p.role)) throw new Error("Keine Berechtigung.");
      }
    }
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const tage = Math.min(Math.max(Number(body.tage) || 3, 1), 30);
    const trocken = body.trocken === true;
    const heute = fmtDatum.format(new Date());
    const ziel = datumPlus(heute, -tage);          // Besichtigung vor N Tagen
    const fensterVon = datumPlus(ziel, -4);         // Nachholfenster, falls ein Lauf ausfiel

    await immoMandantSichern(req, [["termine", String(body.termin_id || "")]]);
    let q = db.from("termine")
      .select("id, titel, art, datum, uhrzeit, ende, ersteller_id, ersteller_name, teilnehmer, kontakt_id, immobilie_id, status, nachfassen, nachfass_status, quelle, mandant_id")
      .ilike("art", "%besichtigung%").eq("nachfassen", true).is("nachfass_status", null).not("kontakt_id", "is", null)
      .neq("status", "storniert");
    if (body.termin_id) q = q.eq("id", body.termin_id); else q = q.gte("datum", fensterVon).lte("datum", ziel);
    const { data: termine, error } = await q;
    if (error) throw error;

    const log: any[] = [];
    let vorschlaege = 0, uebersprungen = 0;

    for (const t of termine || []) {
      const eintrag: any = { termin_id: t.id, datum: t.datum, titel: t.titel };
      const markiere = async (status: string, grund: string) => {
        eintrag.ergebnis = status; eintrag.grund = grund;
        if (!trocken) await db.from("termine").update({ nachfass_status: status, nachfass_am: new Date().toISOString() }).eq("id", t.id);
      };
      try {
        const { data: k } = await db.from("kontakte").select("id, anrede, titel, vorname, nachname, firma, email").eq("id", t.kontakt_id).maybeSingle();
        if (!k) { await markiere("uebersprungen", "kontakt_fehlt"); uebersprungen++; log.push(eintrag); continue; }
        const mail = String(k.email || "").trim().toLowerCase();
        if (!mail) { await markiere("uebersprungen", "keine_email"); uebersprungen++; log.push(eintrag); continue; }

        const zeit = (t.ende || t.uhrzeit || "18:00").slice(0, 5);
        const besichtigungIso = new Date(`${t.datum}T${zeit}:00+02:00`).toISOString();   // Ende der Besichtigung (Sommerzeit-Näherung reicht)

        // A) Kunde hat sich gemeldet
        // Gesucht wird ueber die E-Mail-Adresse — die gibt es bei mehreren
        // Maklern. Ohne Mandanten haette der Posteingang des einen
        // entschieden, ob der andere nachfasst, und der Betreff der fremden
        // Mail stuende im Protokoll der Antwort.
        const { data: vonKunde } = await db.from("mail_eingang").select("id, betreff, gesendet_am").eq("mandant_id", t.mandant_id).ilike("absender_email", mail).neq("ordner", "gesendet").gt("gesendet_am", besichtigungIso).order("gesendet_am", { ascending: false }).limit(1);
        if (vonKunde && vonKunde.length) { eintrag.mail = vonKunde[0]; await markiere("uebersprungen", "kunde_hat_sich_gemeldet"); uebersprungen++; log.push(eintrag); continue; }
        // B) wir haben ihm geschrieben (Portal-Versand oder Gesendet-Ordner aus Outlook/onOffice)
        const [{ data: vonUnsPortal }, { data: vonUnsServer }] = await Promise.all([
          db.from("mail_versendet").select("id, betreff, gesendet_am").eq("mandant_id", t.mandant_id).eq("status", "gesendet").ilike("empfaenger_email", `%${mail}%`).gt("gesendet_am", besichtigungIso).limit(1),
          db.from("mail_eingang").select("id, betreff, gesendet_am").eq("mandant_id", t.mandant_id).eq("ordner", "gesendet").ilike("empfaenger_email", `%${mail}%`).gt("gesendet_am", besichtigungIso).limit(1)]);
        const vonUns = (vonUnsPortal && vonUnsPortal[0]) || (vonUnsServer && vonUnsServer[0]);
        if (vonUns) { eintrag.mail = vonUns; await markiere("uebersprungen", "bereits_angeschrieben"); uebersprungen++; log.push(eintrag); continue; }

        // Objekt + Rolle
        let immo: any = null;
        if (t.immobilie_id) {
          const { data } = await db.from("immobilien").select("id, immo_nr, bezeichnung, objekttitel, strasse, hausnummer, plz, ort, vertragsart, objektart, status").eq("id", t.immobilie_id).maybeSingle();
          immo = data || null;
          if (immo && ["verkauft", "vermietet"].includes(String(immo.status || ""))) { await markiere("uebersprungen", "objekt_" + immo.status); uebersprungen++; log.push(eintrag); continue; }
          const { data: rolle } = await db.from("kontakt_objekt").select("rolle").eq("kontakt_id", k.id).eq("immobilie_id", t.immobilie_id).in("rolle", ["kaeufer", "mieter"]).limit(1);
          if (rolle && rolle.length) { await markiere("uebersprungen", "bereits_" + rolle[0].rolle); uebersprungen++; log.push(eintrag); continue; }
        }
        // schon eine Aufgabe?
        const { data: vorhanden } = await db.from("aufgaben").select("id").eq("termin_id", t.id).eq("typ", "besichtigung_nachfass").limit(1);
        if (vorhanden && vorhanden.length) { await markiere("vorschlag", "aufgabe_vorhanden"); log.push(eintrag); continue; }

        // Zuständiger Makler: Ersteller (Portal) oder erster Teilnehmer / Ersteller-Name (onOffice)
        let makler: any = null;
        if (t.ersteller_id) { const { data } = await db.from("profiles").select("id, name").eq("id", t.ersteller_id).maybeSingle(); makler = data || null; }
        if (!makler) {
          const namen = [...(Array.isArray(t.teilnehmer) ? t.teilnehmer : []), t.ersteller_name].filter(Boolean);
          for (const n of namen) {
            const { data } = await db.from("profiles").select("id, name").in("role", ["chef", "mitarbeiter"]).ilike("name", String(n).trim()).limit(1);
            if (data && data.length) { makler = data[0]; break; }
          }
        }
        if (!makler) { const { data } = await db.from("profiles").select("id, name").eq("role", "chef").limit(1); makler = (data && data[0]) || { id: null, name: "Ihr Musterhaus Immobilien Team" }; }

        const objektName = immo ? (immo.bezeichnung || immo.objekttitel || [immo.strasse, immo.hausnummer].filter(Boolean).join(" ") || "unserem Objekt") : (t.titel || "unserem Objekt");
        const adresse = immo ? [[immo.strasse, immo.hausnummer].filter(Boolean).join(" "), [immo.plz, immo.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
        const wt = WOCHENTAGE[new Date(t.datum + "T12:00:00Z").getUTCDay()];
        const kundenName = [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || mail;
        const entwurf = await entwurfSchreiben({
          anrede: anredeZeile(k), kunde: kundenName, objekt: objektName, adresse,
          vermarktung: immo ? (immo.vertragsart === "miete" ? "Vermietung" : immo.vertragsart === "kauf" ? "Verkauf" : "") : "",
          besichtigung: `${wt}, ${deDatum(t.datum)}${t.uhrzeit ? ` um ${String(t.uhrzeit).slice(0, 5)} Uhr` : ""}`, makler: makler.name || "Ihr Musterhaus Immobilien Team",
        });
        eintrag.entwurf = entwurf; eintrag.makler = makler.name; eintrag.ergebnis = "vorschlag";
        vorschlaege++;
        if (!trocken) {
          const { error: aErr } = await db.from("aufgaben").insert({
            typ: "besichtigung_nachfass", status: "offen",
            titel: `Nachfassen: ${kundenName} · ${objektName}`,
            beschreibung: `Besichtigung am ${deDatum(t.datum)} — seitdem keine Nachricht vom Kunden und keine von uns. Freigeben sendet die Mail aus deinem Postfach.`,
            kontakt_id: k.id, immobilie_id: immo ? immo.id : null, termin_id: t.id, zustaendig_id: makler.id, faellig_am: heute,
            entwurf_betreff: entwurf.betreff, entwurf_text: entwurf.text, empfaenger_email: k.email, empfaenger_name: kundenName,
            daten: { geprueft_am: new Date().toISOString(), besichtigung: t.datum, kunde_gemeldet: false, von_uns_angeschrieben: false, makler: makler.name, quelle_termin: t.quelle },
          });
          if (aErr) throw aErr;
          await db.from("termine").update({ nachfass_status: "vorschlag", nachfass_am: new Date().toISOString() }).eq("id", t.id);
        }
        log.push(eintrag);
      } catch (e) {
        eintrag.fehler = e instanceof Error ? e.message : String(e);
        log.push(eintrag);
      }
    }
    return antwort({ ok: true, heute, ziel, fenster_von: fensterVon, geprueft: (termine || []).length, vorschlaege, uebersprungen, trocken, log });
  } catch (e) {
    return antwort({ ok: false, fehler: e instanceof Error ? e.message : String(e) });
  }
});
