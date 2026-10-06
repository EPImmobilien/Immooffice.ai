// ============================================================================
// tarife-oeffentlich — der Preisbereich der Landingpage holt sich die Preise
// ============================================================================
// Eigene Funktion des Forks (fork_47). Auftrag vom 06.10.2026: „Preise nicht
// hart im HTML: beim Laden aus plattform_tarife über einen öffentlichen, nur
// lesenden Endpunkt holen."
//
// ÖFFENTLICH, und zwar wirklich: kein Anmeldekopf, kein Mandant, kein Konto.
// Deshalb gilt hier eine Regel ohne Ausnahme — **es wird nur aus dem Katalog
// gelesen.** Keine Mandantentabelle, kein `mandanten`, kein `profiles`. Die
// einzige Zahl, die nicht aus dem Katalog kommt, ist der Zähler der freien
// Gründerplätze, und der ist eine Anzahl ohne jeden Bezug: er sagt „noch 37
// frei" und nicht, wer die anderen dreizehn sind.
//
// Was NICHT hinausgeht, obwohl es danebensteht: Stripe-Kennungen. Sie sind
// kein Geheimnis im engen Sinn, aber sie gehören nicht auf eine Werbeseite —
// wer sie hat, kann damit Zahlungsvorgänge anlegen, und die Seite braucht
// sie nicht.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Die Preisseite ändert sich selten. Eine Minute Zwischenspeicher nimmt der
// Datenbank die Last einer Werbeseite ab und ist kurz genug, dass eine
// Preisänderung im Plattform-Admin sofort wirkt.
const KOPF = {
  ...cors,
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=60, s-maxage=60",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const [tarife, pakete, preise, werte, frei] = await Promise.all([
      db.from("plattform_tarife")
        .select("schluessel, name, sortierung, ist_zusatznutzer, empfohlen, " +
                "preis_monat_cent, preis_jahr_cent, inkl_nutzer, credits_monat, " +
                "merkmale, hinweis")
        .eq("aktiv", true).order("sortierung"),
      db.from("plattform_credit_pakete")
        .select("schluessel, name, credits, preis_cent, gueltig_monate")
        .eq("aktiv", true).order("sortierung"),
      db.from("plattform_credit_preise")
        .select("aktion, name, credits, beschreibung")
        .eq("aktiv", true).order("sortierung"),
      db.from("plattform_werte").select("schluessel, wert"),
      db.rpc("gruender_plaetze_frei"),
    ]);

    const w: Record<string, unknown> = {};
    for (const z of werte.data || []) w[z.schluessel] = z.wert;

    return new Response(JSON.stringify({
      ok: true,
      stand: new Date().toISOString(),
      // Netto, in Cent. Die Seite rechnet selbst nichts um; sie zeigt, was
      // hier steht, und schreibt „zzgl. USt." daneben.
      waehrung: "EUR",
      ust_prozent: Number(w.ust_satz ?? 19),
      tarife: (tarife.data || []).filter((t: any) => !t.ist_zusatznutzer),
      zusatznutzer: (tarife.data || []).find((t: any) => t.ist_zusatznutzer) || null,
      credit_pakete: pakete.data || [],
      credit_preise: preise.data || [],
      testphase_tage: Number(w.testphase_tage ?? 28),
      testphase_credits: Number(w.testphase_credits ?? 300),
      mindestlaufzeit_monate: Number(w.mindestlaufzeit_monate ?? 6),
      gruender: {
        plaetze: Number(w.gruender_plaetze ?? 50),
        frei: Number(frei.data ?? 0),
        rabatt_cent: Number(w.gruender_rabatt_cent ?? 1000),
        tarif: String(w.gruender_tarif ?? "starter").replace(/"/g, ""),
      },
    }), { headers: KOPF });
  } catch (e) {
    console.error("tarife-oeffentlich:", e);
    // Die Seite hat eigene Rückfallwerte. Ein Fehler hier darf sie nicht
    // leer lassen — er darf nur dafür sorgen, dass sie die eigenen nimmt.
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: KOPF });
  }
});
