// ============================================================================
// plattform-stripe-abgleich — vergleicht Stripe mit dem Abbild (fork_74)
// ============================================================================
// Eigene Funktion des Forks, vom Zeitplan gerufen (03:10 Uhr) und vom
// Betreiberbereich ("Jetzt abgleichen"). Oeffentlich wie alle Cron-Ziele,
// und wie die nimmt sie NICHTS aus dem Koerper: sie liest Stripe und das
// Abbild, schreibt stripe_abgleich und traegt an gespiegelten Rechnungen
// nach, was der Webhook nicht kennt — Gebuehr, Versuche, naechster Versuch.
//
// WARUM NICHT IM WEBHOOK: der gehoert der Stripe-Integration (andere
// Sitzung), und ein Webhook, der je Ereignis zwei weitere Stripe-Abfragen
// nachschiebt, wird langsam und bricht bei einer davon ab. Hier laeuft es
// einmal am Tag, begrenzt auf die letzten zwei Monate, je Rechnung einmal.
//
// Was herausgeht: nur ok/Fehler und Zahlen. Keine Kundendaten.
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

const STRIPE_VERSION = "2026-08-26.dahlia";
async function stripe(pfad: string, params: Record<string, string> = {}) {
  const schluessel = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!schluessel.startsWith("sk_test_") && !schluessel.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY fehlt oder ist kein sk_test_/sk_live_-Schluessel.");
  }
  const q = new URLSearchParams(params).toString();
  const r = await fetch("https://api.stripe.com/v1/" + pfad + (q ? "?" + q : ""), {
    headers: { Authorization: "Bearer " + schluessel, "Stripe-Version": STRIPE_VERSION },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || ("Stripe: " + r.status));
  return d;
}
async function alle(pfad: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let after = "";
  for (let i = 0; i < 20; i++) {
    const d = await stripe(pfad, { ...params, limit: "100", ...(after ? { starting_after: after } : {}) });
    out.push(...(d.data || []));
    if (!d.has_more || !d.data?.length) break;
    after = String(d.data[d.data.length - 1].id);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
                          { auth: { persistSession: false } });
  const heute = new Date().toISOString().slice(0, 10);
  const ergebnis: Record<string, unknown> = { ok: true, datum: heute, bereiche: [] as unknown[], nachgetragen: 0 };
  try {
    const jetzt = new Date();
    const monatAnfang = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), 1));
    const vormonatAnfang = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth() - 1, 1));
    const sek = (d: Date) => String(Math.floor(d.getTime() / 1000));

    // --- 1. Rechnungen: Stripe gegen Abbild, laufender und Vormonat ----------
    const stripeRechnungen = await alle("invoices", { "created[gte]": sek(vormonatAnfang) });
    const { data: spiegel } = await db.from("stripe_rechnungen")
      .select("id, status, brutto_cent, bezahlt_cent, offen_cent, erstellt_am, gebuehr_cent, bezahlt_am")
      .gte("erstellt_am", vormonatAnfang.toISOString());
    const spiegelNach = new Map((spiegel || []).map((r) => [String(r.id), r]));
    const zeitraeume: [string, Date, Date][] = [["laufend", monatAnfang, new Date(jetzt.getTime() + 86400000)], ["vormonat", vormonatAnfang, monatAnfang]];
    for (const [name, von, bis] of zeitraeume) {
      for (const [bereich, filter] of [["rechnungen_bezahlt", "paid"], ["rechnungen_offen", "open"]] as [string, string][]) {
        const s = stripeRechnungen.filter((i) => i.status === filter && Number(i.created) * 1000 >= von.getTime() && Number(i.created) * 1000 < bis.getTime());
        const m = (spiegel || []).filter((r) => r.status === filter && new Date(String(r.erstellt_am)) >= von && new Date(String(r.erstellt_am)) < bis);
        const sIds = new Set(s.map((i) => String(i.id))), mIds = new Set(m.map((r) => String(r.id)));
        const nurStripe = [...sIds].filter((x) => !mIds.has(x)), nurSpiegel = [...mIds].filter((x) => !sIds.has(x));
        const sCent = s.reduce((a, i) => a + Number(filter === "paid" ? i.amount_paid : i.amount_due), 0);
        const mCent = m.reduce((a, r) => a + Number(filter === "paid" ? r.bezahlt_cent : r.offen_cent), 0);
        const zeile = { datum: heute, bereich, zeitraum: name, stripe_anzahl: s.length, stripe_cent: sCent,
          spiegel_anzahl: m.length, spiegel_cent: mCent, abweichung: nurStripe.length > 0 || nurSpiegel.length > 0 || sCent !== mCent,
          kennungen: { nur_stripe: nurStripe.slice(0, 50), nur_spiegel: nurSpiegel.slice(0, 50) }, fehler: null };
        await db.from("stripe_abgleich").upsert(zeile, { onConflict: "datum,bereich,zeitraum" });
        (ergebnis.bereiche as unknown[]).push({ bereich, zeitraum: name, abweichung: zeile.abweichung });
      }
    }
    // --- 2. Aktive Abos ---------------------------------------------------------
    const aktive = await alle("subscriptions", { status: "active" });
    const { count: spiegelAktiv } = await db.from("mandant_abo").select("mandant_id", { count: "exact", head: true })
      .in("status", ["aktiv", "gekuendigt"]).not("stripe_subscription_id", "is", null);
    const sIds = aktive.map((a) => String(a.id));
    const { data: spiegelAbos } = await db.from("mandant_abo").select("stripe_subscription_id").not("stripe_subscription_id", "is", null);
    const mIds = (spiegelAbos || []).map((a) => String(a.stripe_subscription_id));
    const zeileAbo = { datum: heute, bereich: "abos_aktiv", zeitraum: "laufend", stripe_anzahl: aktive.length, stripe_cent: 0,
      spiegel_anzahl: Number(spiegelAktiv || 0), spiegel_cent: 0, abweichung: aktive.length !== Number(spiegelAktiv || 0),
      kennungen: { nur_stripe: sIds.filter((x) => !mIds.includes(x)).slice(0, 50), nur_spiegel: mIds.filter((x) => !sIds.includes(x)).slice(0, 50) }, fehler: null };
    await db.from("stripe_abgleich").upsert(zeileAbo, { onConflict: "datum,bereich,zeitraum" });
    (ergebnis.bereiche as unknown[]).push({ bereich: "abos_aktiv", abweichung: zeileAbo.abweichung });

    // --- 3. Nachtragen: Gebuehr, Versuche, naechster Versuch --------------------
    // Je Rechnung hoechstens einmal (gebuehr_cent gesetzt oder abgeglichen_am
    // juenger als 1 Tag). Gebuehr nur bei bezahlten.
    let n = 0;
    for (const i of stripeRechnungen) {
      const r = spiegelNach.get(String(i.id));
      if (!r) continue;
      const felder: Record<string, unknown> = { versuche: Number(i.attempt_count ?? 0),
        naechster_versuch: i.next_payment_attempt ? new Date(Number(i.next_payment_attempt) * 1000).toISOString() : null,
        abgeglichen_am: new Date().toISOString() };
      if (i.status === "paid" && r.gebuehr_cent === null) {
        try {
          // Neue API: die Zahlung haengt an der Rechnung; die Gebuehr an der
          // Balance Transaction der Charge.
          const zahlungen = await stripe(`invoices/${i.id}/payments`, { limit: "1" });
          const pi = zahlungen?.data?.[0]?.payment?.payment_intent;
          if (pi) {
            const intent = await stripe(`payment_intents/${pi}`, { "expand[]": "latest_charge.balance_transaction" });
            const bt = intent?.latest_charge?.balance_transaction;
            if (bt && typeof bt === "object") { felder.gebuehr_cent = Number(bt.fee ?? 0); felder.zahlung_id = String(intent.latest_charge.id || pi); }
            else felder.zahlung_id = String(pi);
          }
        } catch (e) { felder.abgleich_fehler = e instanceof Error ? e.message : String(e); }
      }
      delete felder.abgleich_fehler;
      await db.from("stripe_rechnungen").update(felder).eq("id", String(i.id));
      n++;
    }
    ergebnis.nachgetragen = n;
    return antwort(ergebnis);
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    await db.from("stripe_abgleich").upsert({ datum: heute, bereich: "lauf", zeitraum: "laufend", abweichung: true, fehler: grund.slice(0, 500) },
      { onConflict: "datum,bereich,zeitraum" });
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
