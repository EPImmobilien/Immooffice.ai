// ============================================================================
// plattform-warnungen — Warnregeln pruefen, Tageszusammenfassung senden (fork_79)
// ============================================================================
// Eigene Funktion des Forks, vom Zeitplan gerufen: stuendlich (modus
// "pruefen") und zweimal am Morgen (modus "zusammenfassung", 05:30 und
// 06:30 UTC — die Funktion sendet nur, wenn es in Berlin 7 Uhr ist, und nur
// einmal am Tag). Der Betreiberbereich ruft sie fuer "Jetzt pruefen" und
// "Zusammenfassung jetzt senden" (mit erzwingen = true).
//
// Was sie nimmt: `modus` und `erzwingen`. Sonst nichts — kein Empfaenger
// aus dem Koerper. Die Adresse steht in plattform_werte.betreiber_email.
// Die Regeln wertet die Datenbank aus (plattform_warnungen_pruefen); hier
// wird nur verschickt und abgehakt (gesendet_am). Eine Warnung, die nicht
// hinausging, bleibt ohne gesendet_am stehen und kommt beim naechsten Lauf
// mit.
//
// Was herausgeht: ok/Fehler und Zahlen. Keine Kundendaten in der Antwort.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

function dienst() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
function sicher(t: string) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function eur(cent: number) { return (Number(cent || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" }); }

/** Mail an den Betreiber — und die Latenz des Versanddienstes ins Technik-Protokoll. */
async function mailen(db: ReturnType<typeof dienst>, an: string, betreff: string, zeilen: string[]): Promise<boolean> {
  const schluessel = Deno.env.get("RESEND_API_KEY") || "";
  const absender = Deno.env.get("SMTP_FROM_EMAIL") || "";
  if (!schluessel || !absender || !/@/.test(an)) return false;
  const html = "<div style=\"font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.65;color:#1B2A47\">"
    + zeilen.map((z) => z ? `<p style="margin:0 0 10px">${sicher(z)}</p>` : "").join("") + "</div>";
  const start = Date.now();
  let ok = false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + schluessel, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `immoOffice.ai <${absender}>`, to: [an], subject: betreff, text: zeilen.join("\n"), html }),
    });
    ok = r.ok;
  } catch { ok = false; }
  await db.from("dienst_aufrufe").insert({ dienst: "resend", dauer_ms: Date.now() - start, ok }).then(() => {}, () => {});
  return ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = dienst();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const modus = String(body.modus || "pruefen");
  const erzwingen = body.erzwingen === true;
  try {
    const { data: werte } = await db.from("plattform_werte").select("schluessel, wert")
      .in("schluessel", ["betreiber_email", "zusammenfassung_aktiv"]);
    const w: Record<string, unknown> = {};
    for (const z of werte || []) w[String(z.schluessel)] = z.wert;
    const adresse = String(w.betreiber_email ?? "").replace(/"/g, "").trim();

    if (modus === "pruefen") {
      const { data: neu, error } = await db.rpc("plattform_warnungen_pruefen");
      if (error) throw new Error("plattform_warnungen_pruefen: " + error.message);
      // Alles, was noch nicht hinausging — auch Reste frueherer Laeufe.
      const { data: offen } = await db.from("plattform_warnungen").select("id, regel, zeit, text")
        .is("gesendet_am", null).order("zeit").limit(100);
      let gesendet = 0;
      if (adresse && (offen || []).length) {
        const zeilen = ["Guten Tag,", "", `${offen!.length} neue Warnung(en) der Plattform:`, ""]
          .concat(offen!.map((x) => `• [${x.regel}] ${x.text} (${new Date(String(x.zeit)).toLocaleString("de-DE")})`))
          .concat(["", "Einzelheiten im Betreiberbereich unter „Warnungen“.", "", "immoOffice.ai"]);
        if (await mailen(db, adresse, `[immoOffice.ai] ${offen!.length} Warnung(en)`, zeilen)) {
          await db.from("plattform_warnungen").update({ gesendet_am: new Date().toISOString() }).in("id", offen!.map((x) => x.id));
          gesendet = offen!.length;
        }
      }
      return antwort({ ok: true, neu: (neu || []).length, offen: (offen || []).length, gesendet, adresse: !!adresse });
    }

    if (modus === "zusammenfassung") {
      // Nur um 7 Uhr Berliner Zeit — und nur einmal am Tag; „erzwingen“ ist der Knopf im Betreiberbereich.
      const berlin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
      const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
      if (!erzwingen) {
        if (String(w.zusammenfassung_aktiv) === "false") return antwort({ ok: true, uebersprungen: "abgeschaltet" });
        if (berlin.getHours() !== 7) return antwort({ ok: true, uebersprungen: "nicht 7 Uhr in Berlin" });
        const { data: schon } = await db.from("plattform_warnungen").select("id").eq("eindeutig", "zusammenfassung:" + heute).maybeSingle();
        if (schon) return antwort({ ok: true, uebersprungen: "heute schon gesendet" });
      }
      const { data: z, error } = await db.rpc("plattform_tageszusammenfassung");
      if (error) throw new Error("plattform_tageszusammenfassung: " + error.message);
      const p = (z?.probleme || {}) as Record<string, number>;
      const zeilen = [
        `Tageszusammenfassung immoOffice.ai — ${z.datum}`, "",
        `MRR: ${eur(z.mrr_cent)} netto · zahlende Mandanten: ${z.zahlende}`,
        `Gestern: ${z.neu_gestern} neue Abos, ${z.kuendigungen_gestern} Kündigungen, ${z.neue_tests_gestern} neue Testkonten`,
        `Tests, die in 3 Tagen enden: ${z.tests_endend_3t}`,
        `KI-Kosten gestern: ${Number(z.ki_kosten_gestern_eur).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} · Credits gestern: ${z.credits_gestern}`,
        "", "Offene Probleme:",
        `• Zahlungen offen: ${p.zahlung_offen} · Job-Fehler 24 h: ${p.cron_fehler_24h} · Webhook-Fehler 24 h: ${p.webhook_fehler_24h}`,
        `• Support offen: ${p.support_offen} (davon > 24 h ohne Antwort: ${p.support_ohne_antwort_24h}) · Zugriffsanfragen offen: ${p.zugriffe_offen}`,
        `• Hängende Reservierungen: ${p.reservierungen_haengend} · Funktionsfehler 24 h: ${p.funktionsfehler_24h} · Warnungen 24 h: ${p.warnungen_24h}`,
        "", "Betreiberbereich: Übersicht → „Heute zu tun“.", "", "immoOffice.ai",
      ];
      let gesendet = false;
      if (adresse) gesendet = await mailen(db, adresse, `[immoOffice.ai] Tageszusammenfassung ${z.datum}`, zeilen);
      // Der Tagesschluessel haelt den Doppelversand ab — auch wenn beide Jobs (Sommer/Winter) laufen.
      if (!erzwingen) {
        await db.from("plattform_warnungen").insert({ regel: "tageszusammenfassung", text: "Tageszusammenfassung " + z.datum + (gesendet ? " gesendet" : " nicht gesendet (keine Adresse/Dienst)"),
          eindeutig: "zusammenfassung:" + heute, gesendet_am: gesendet ? new Date().toISOString() : null }).then(() => {}, () => {});
      }
      return antwort({ ok: true, gesendet, adresse: !!adresse, zusammenfassung: z });
    }
    return antwort({ ok: false, fehler: "Unbekannter Modus." }, 400);
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("plattform-warnungen:", grund);
    await db.from("system_fehler").insert({ funktion: "plattform-warnungen", meldung: grund.slice(0, 500) }).then(() => {}, () => {});
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
