// ============================================================================
// abo-verwalten — Stand, Zahlungsmittel, Kündigung, Zusatznutzer
// ============================================================================
// Eigene Funktion des Forks (fork_47).
//
// Die Kündigung läuft BEWUSST nicht über das Stripe-Kundenportal, sondern
// hier. Grund: die Mindestlaufzeit. Stripe kennt sie nicht; es würde zum
// Periodenende kündigen, auch wenn noch vier Monate offen sind. Das Portal
// bleibt für Zahlungsmittel und Rechnungen zuständig — dort richtet es
// keinen Schaden an.
//
// Aktionen:
//   stand        — was gilt gerade (Tarif, Nutzer, Credits, Fristen)
//   portal       — Stripe-Kundenportal öffnen (Zahlungsmittel, Rechnungen)
//   kuendigen    — zum spätestmöglichen der beiden Termine
//   widerrufen   — eine Kündigung zurücknehmen, solange sie nicht wirkt
//   zusatznutzer — Anzahl im laufenden Abo ändern
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

function immoFehlt(was: string): never {
  throw new Error(was + " fehlt (siehe docs/SECRETS.md).");
}

async function stripe(pfad: string, felder?: Record<string, string>, methode = "POST") {
  const schluessel = Deno.env.get("STRIPE_SECRET_KEY") || immoFehlt("STRIPE_SECRET_KEY");
  if (!schluessel.startsWith("sk_test_")) {
    throw new Error("Nur Stripe-Testmodus (sk_test_).");
  }
  const r = await fetch("https://api.stripe.com/v1/" + pfad, {
    method: methode,
    headers: {
      Authorization: "Bearer " + schluessel,
      ...(felder ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: felder ? new URLSearchParams(felder).toString() : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || ("Stripe: " + r.status));
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const kopf = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(kopf);
    if (!u?.user) return antwort({ ok: false, fehler: "Nicht angemeldet." }, 401);
    const { data: profil } = await db.from("profiles")
      .select("role, mandant_id").eq("id", u.user.id).maybeSingle();
    if (!profil?.mandant_id) return antwort({ ok: false, fehler: "Kein Mandant." }, 403);
    const mandant = profil.mandant_id;
    const istChef = profil.role === "chef";

    const body = await req.json().catch(() => ({}));
    const aktion = String(body.aktion || "stand");

    const { data: abo } = await db.from("mandant_abo").select("*").eq("mandant_id", mandant).maybeSingle();

    // --- Stand -------------------------------------------------------------
    // Den darf auch ein Mitarbeiter sehen: der Credit-Saldo steht in der
    // Kopfzeile, und wer KI benutzt, muss wissen, woran er ist. Die
    // Vertragsdaten bleiben dem Chef vorbehalten.
    if (aktion === "stand") {
      const [{ data: saldo }, { data: zugriff }, { data: limit }, konten, tarif] = await Promise.all([
        db.rpc("credits_saldo", { p_mandant: mandant }),
        db.rpc("abo_zugriff", { p_mandant: mandant }),
        db.rpc("nutzer_limit", { p_mandant: mandant }),
        db.from("credit_konten")
          .select("quelle, credits, verbraucht, gueltig_bis")
          .eq("mandant_id", mandant).order("gueltig_bis", { nullsFirst: false }),
        abo?.tarif
          ? db.from("plattform_tarife").select("*").eq("schluessel", abo.tarif).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const { count: nutzer } = await db.from("profiles")
        .select("id", { count: "exact", head: true }).eq("mandant_id", mandant);
      const { data: m } = await db.from("mandanten")
        .select("testphase_bis, abo_status, gesperrt_am").eq("id", mandant).maybeSingle();

      // Sind die Credits knapp? „Knapp" ist kein Gefühl: der Anteil steht im
      // Katalog (warnung_rest_prozent) und wird gegen das Monatskontingent
      // des Tarifs gerechnet. Gerechnet wird HIER und nicht in der
      // Oberfläche — sonst bräuchte jede Ansicht den Tarif, und ein
      // Mitarbeiter bekommt ihn mit Absicht nicht zu sehen.
      const { data: w } = await db.from("plattform_werte")
        .select("wert").eq("schluessel", "warnung_rest_prozent").maybeSingle();
      const anteil = Number(String(w?.wert ?? "10").replace(/"/g, "")) || 10;
      const monatskontingent = Number((tarif as { data?: { credits_monat?: number } })?.data?.credits_monat ?? 0);
      const knapp = monatskontingent > 0
        && Number(saldo ?? 0) < Math.ceil(monatskontingent * anteil / 100);

      return antwort({
        ok: true,
        zugriff, saldo, credits_knapp: knapp,
        nutzer: { ist: nutzer || 0, limit },
        testphase_bis: m?.testphase_bis || null,
        konten: (konten.data || []).map((k: any) => ({
          quelle: k.quelle, rest: k.credits - k.verbraucht, gueltig_bis: k.gueltig_bis,
        })),
        abo: istChef && abo ? {
          tarif: abo.tarif, tarif_name: (tarif as any)?.data?.name || null,
          intervall: abo.intervall, status: abo.status,
          zusatznutzer: abo.zusatznutzer, gruenderpreis: abo.gruenderpreis,
          periode_bis: abo.periode_bis,
          mindestlaufzeit_bis: abo.mindestlaufzeit_bis,
          cancel_at: abo.cancel_at, gekuendigt_am: abo.gekuendigt_am,
          zahlung_fehler_seit: abo.zahlung_fehler_seit,
          hat_zahlungsmittel: !!abo.stripe_customer_id,
        } : null,
      });
    }

    if (!istChef) return antwort({ ok: false, fehler: "Nur die Chef-Rolle." }, 403);
    if (!abo) return antwort({ ok: false, fehler: "Kein Abo." }, 404);

    const zurueck = (Deno.env.get("PORTAL_URL") || immoFehlt("PORTAL_URL")).replace(/\/$/, "");

    // --- Kundenportal ------------------------------------------------------
    if (aktion === "portal") {
      if (!abo.stripe_customer_id) return antwort({ ok: false, fehler: "Noch kein Zahlungsmittel." }, 400);
      const s = await stripe("billing_portal/sessions", {
        customer: abo.stripe_customer_id,
        return_url: zurueck + "/?abo=zurueck",
      });
      return antwort({ ok: true, url: s.url });
    }

    // --- Kündigung ---------------------------------------------------------
    if (aktion === "kuendigen") {
      if (!abo.stripe_subscription_id) return antwort({ ok: false, fehler: "Kein laufendes Abo." }, 400);
      // Der spätere der beiden Termine. Das ist die ganze Regel:
      // Mindestlaufzeit, wenn sie noch läuft — sonst das Periodenende.
      const periode = abo.periode_bis ? new Date(abo.periode_bis).getTime() : Date.now();
      const mindest = abo.mindestlaufzeit_bis ? new Date(abo.mindestlaufzeit_bis).getTime() : 0;
      const ende = new Date(Math.max(periode, mindest));

      await stripe("subscriptions/" + abo.stripe_subscription_id, {
        cancel_at: String(Math.floor(ende.getTime() / 1000)),
      });
      // Der Webhook schreibt den Stand gleich noch einmal; hier wird er nur
      // vorweggenommen, damit die Oberfläche das Datum sofort zeigen kann.
      await db.from("mandant_abo").update({
        status: "gekuendigt", gekuendigt_am: new Date().toISOString(),
        cancel_at: ende.toISOString(), geaendert_am: new Date().toISOString(),
      }).eq("mandant_id", mandant);

      return antwort({
        ok: true, endet_am: ende.toISOString(),
        grund: mindest > periode
          ? "Ende der Mindestlaufzeit" : "Ende der laufenden Abrechnungsperiode",
      });
    }

    // --- Kündigung zurücknehmen -------------------------------------------
    if (aktion === "widerrufen") {
      if (!abo.stripe_subscription_id) return antwort({ ok: false, fehler: "Kein laufendes Abo." }, 400);
      await stripe("subscriptions/" + abo.stripe_subscription_id, {
        cancel_at: "", cancel_at_period_end: "false",
      });
      await db.from("mandant_abo").update({
        status: "aktiv", gekuendigt_am: null, cancel_at: null,
        geaendert_am: new Date().toISOString(),
      }).eq("mandant_id", mandant);
      return antwort({ ok: true });
    }

    // --- Zusatznutzer -------------------------------------------------------
    if (aktion === "zusatznutzer") {
      if (!abo.stripe_subscription_id) return antwort({ ok: false, fehler: "Kein laufendes Abo." }, 400);
      const anzahl = Math.max(0, Math.min(500, Number(body.anzahl ?? 0)));

      const { data: addon } = await db.from("plattform_tarife")
        .select("*").eq("ist_zusatznutzer", true).eq("aktiv", true).maybeSingle();
      const preisId = abo.intervall === "jahr" ? addon?.stripe_price_jahr_id : addon?.stripe_price_monat_id;
      if (!preisId) return antwort({ ok: false, fehler: "Zusatznutzer bei Stripe nicht angelegt." }, 409);

      // Weniger Zusatznutzer, als Menschen im Haus sind, geht nicht — sonst
      // stünde jemand morgen vor einer Anwendung, die ihn nicht mehr kennt.
      const { count: ist } = await db.from("profiles")
        .select("id", { count: "exact", head: true }).eq("mandant_id", mandant);
      const { data: tarif } = await db.from("plattform_tarife")
        .select("inkl_nutzer").eq("schluessel", abo.tarif).maybeSingle();
      const neuesLimit = Number(tarif?.inkl_nutzer ?? 0) + anzahl;
      if (neuesLimit < (ist || 0)) {
        return antwort({ ok: false, fehler:
          `Im Haus arbeiten ${ist} Personen; ${neuesLimit} Plätze wären zu wenig. `
          + `Bitte zuerst Zugänge entfernen.` }, 409);
      }

      const vorhanden = await stripe("subscriptions/" + abo.stripe_subscription_id, undefined, "GET");
      const position = (vorhanden.items?.data || []).find((p: any) => p?.price?.id === preisId);

      if (position && anzahl === 0) {
        await stripe("subscription_items/" + position.id, { proration_behavior: "create_prorations" }, "DELETE");
      } else if (position) {
        await stripe("subscription_items/" + position.id, {
          quantity: String(anzahl), proration_behavior: "create_prorations",
        });
      } else if (anzahl > 0) {
        await stripe("subscription_items", {
          subscription: abo.stripe_subscription_id, price: preisId,
          quantity: String(anzahl), proration_behavior: "create_prorations",
        });
      }
      // Den Stand schreibt der Webhook; hier nur die Antwort.
      return antwort({ ok: true, zusatznutzer: anzahl, nutzer_limit: neuesLimit });
    }

    return antwort({ ok: false, fehler: "Unbekannte Aktion." }, 400);
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("abo-verwalten:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
