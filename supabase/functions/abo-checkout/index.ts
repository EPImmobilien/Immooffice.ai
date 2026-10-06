// ============================================================================
// abo-checkout — der Weg zur Kasse
// ============================================================================
// Eigene Funktion des Forks (fork_47). Legt eine Stripe-Checkout-Sitzung an:
// für ein Abo (Tarif + Zusatznutzer) oder für ein Credit-Paket
// (Einmalzahlung).
//
// Was diese Funktion NICHT tut: den Abo-Stand ändern. Sie schickt den Kunden
// zu Stripe und merkt sich nichts. Was gilt, entscheidet der Webhook —
// CLAUDE.md: „Abo-Status niemals allein dem Frontend glauben." Käme der
// Status von hier, stünde er schon dann in der Datenbank, wenn jemand nur
// die Kasse geöffnet und dann abgebrochen hat.
//
// AUSSCHLIESSLICH TESTMODUS: der Schlüssel muss mit `sk_test_` beginnen.
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
  throw new Error(was + " fehlt (siehe docs/SECRETS.md). Ohne diese Angabe " +
    "ginge der Kunde zu einer Kasse, die nirgendwohin führt.");
}

/** Stripe über das Formular-API — kein SDK, dieselbe Begründung wie im Webhook. */
async function stripe(pfad: string, felder: Record<string, string>, methode = "POST") {
  const schluessel = Deno.env.get("STRIPE_SECRET_KEY") || immoFehlt("STRIPE_SECRET_KEY");
  if (!schluessel.startsWith("sk_test_")) {
    throw new Error("Nur Stripe-Testmodus (sk_test_). Der Live-Gang ist "
      + "Sache des Betreibers — siehe docs/BILLING.md.");
  }
  const koerper = new URLSearchParams(felder).toString();
  const r = await fetch("https://api.stripe.com/v1/" + pfad, {
    method: methode,
    headers: {
      Authorization: "Bearer " + schluessel,
      "Content-Type": "application/x-www-form-urlencoded",
      // Dieselbe Anfrage zweimal legt bei Stripe nur einmal etwas an.
      ...(felder.__idem ? { "Idempotency-Key": felder.__idem } : {}),
    },
    body: koerper.replace(/&?__idem=[^&]*/, ""),
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
      .select("role, mandant_id, email, name").eq("id", u.user.id).maybeSingle();
    // Abrechnung ist Chefsache. Ein Mitarbeiter soll nicht versehentlich
    // einen Vertrag für das Haus abschliessen.
    if (!profil || profil.role !== "chef") {
      return antwort({ ok: false, fehler: "Nur die Chef-Rolle kann ein Abo abschliessen." }, 403);
    }
    const mandant = profil.mandant_id;
    if (!mandant) return antwort({ ok: false, fehler: "Kein Mandant." }, 400);

    const body = await req.json().catch(() => ({}));
    const zurueck = (Deno.env.get("PORTAL_URL") || immoFehlt("PORTAL_URL")).replace(/\/$/, "");

    // --- Der Stripe-Kunde ------------------------------------------------
    // Einer je Mandant, und er trägt die Firmendaten: Stripe stellt die
    // Rechnung damit aus (Name, Anschrift, USt-IdNr.).
    const { data: abo } = await db.from("mandant_abo").select("*").eq("mandant_id", mandant).maybeSingle();
    const { data: firma } = await db.from("firma_stammdaten")
      .select("firma_name, strasse, plz, ort, land, email, ust_id")
      .eq("mandant_id", mandant).eq("aktiv", true).order("sortierung").limit(1).maybeSingle();

    let kunde = abo?.stripe_customer_id || null;
    if (!kunde) {
      const neu = await stripe("customers", {
        name: String(firma?.firma_name || "").slice(0, 200) || "Mandant",
        email: String(firma?.email || profil.email || ""),
        "address[line1]": String(firma?.strasse || ""),
        "address[postal_code]": String(firma?.plz || ""),
        "address[city]": String(firma?.ort || ""),
        "address[country]": String(firma?.land || "DE").slice(0, 2).toUpperCase(),
        "metadata[mandant_id]": mandant,
        ...(firma?.ust_id ? { "tax_id_data[0][type]": "eu_vat", "tax_id_data[0][value]": String(firma.ust_id) } : {}),
        __idem: "kunde:" + mandant,
      });
      kunde = neu.id;
      await db.from("mandant_abo").upsert(
        { mandant_id: mandant, stripe_customer_id: kunde, geaendert_am: new Date().toISOString() },
        { onConflict: "mandant_id" });
    }

    // --- Credit-Paket: Einmalzahlung --------------------------------------
    if (body.paket) {
      const { data: paket } = await db.from("plattform_credit_pakete")
        .select("*").eq("schluessel", String(body.paket)).eq("aktiv", true).maybeSingle();
      if (!paket) return antwort({ ok: false, fehler: "Unbekanntes Paket." }, 400);
      if (!paket.stripe_price_id) {
        return antwort({ ok: false, fehler:
          "Das Paket ist bei Stripe noch nicht angelegt. "
          + "scripts/stripe-einrichten.mjs ausfuehren." }, 409);
      }
      const sitzung = await stripe("checkout/sessions", {
        mode: "payment",
        customer: kunde!,
        "line_items[0][price]": paket.stripe_price_id,
        "line_items[0][quantity]": "1",
        success_url: zurueck + "/?abo=ok",
        cancel_url: zurueck + "/?abo=abbruch",
        "metadata[mandant_id]": mandant,
        "payment_intent_data[metadata][mandant_id]": mandant,
        invoice_creation: "true",
      });
      return antwort({ ok: true, url: sitzung.url });
    }

    // --- Abo ---------------------------------------------------------------
    const tarifSchluessel = String(body.tarif || "starter");
    const intervall = body.intervall === "jahr" ? "jahr" : "monat";
    const zusatz = Math.max(0, Math.min(500, Number(body.zusatznutzer ?? 0)));

    const { data: tarif } = await db.from("plattform_tarife")
      .select("*").eq("schluessel", tarifSchluessel).eq("aktiv", true).maybeSingle();
    if (!tarif || tarif.ist_zusatznutzer) {
      return antwort({ ok: false, fehler: "Unbekannter Tarif." }, 400);
    }
    const preisId = intervall === "jahr" ? tarif.stripe_price_jahr_id : tarif.stripe_price_monat_id;
    if (!preisId) {
      return antwort({ ok: false, fehler:
        "Der Tarif ist bei Stripe noch nicht angelegt. "
        + "scripts/stripe-einrichten.mjs ausfuehren." }, 409);
    }

    const felder: Record<string, string> = {
      mode: "subscription",
      customer: kunde!,
      "line_items[0][price]": preisId,
      "line_items[0][quantity]": "1",
      success_url: zurueck + "/?abo=ok",
      cancel_url: zurueck + "/?abo=abbruch",
      "metadata[mandant_id]": mandant,
      // Die Kennung MUSS am Abo hängen, nicht nur an der Sitzung: der
      // Webhook bekommt später `customer.subscription.updated` ohne jeden
      // Bezug zur Kasse.
      "subscription_data[metadata][mandant_id]": mandant,
      // Stripe Tax ist vorbereitet, aber aus (Auftrag). Die Preise sind
      // netto; `tax_behavior: exclusive` steht am Preis.
      "automatic_tax[enabled]": "false",
      billing_address_collection: "required",
      __idem: "abo:" + mandant + ":" + tarifSchluessel + ":" + intervall + ":" + zusatz,
    };

    if (zusatz > 0) {
      const { data: addon } = await db.from("plattform_tarife")
        .select("*").eq("ist_zusatznutzer", true).eq("aktiv", true).maybeSingle();
      const addonPreis = intervall === "jahr" ? addon?.stripe_price_jahr_id : addon?.stripe_price_monat_id;
      if (!addonPreis) {
        return antwort({ ok: false, fehler:
          "Zusatznutzer sind bei Stripe noch nicht angelegt." }, 409);
      }
      felder["line_items[1][price]"] = addonPreis;
      felder["line_items[1][quantity]"] = String(zusatz);
    }

    // --- Gründerpreis ------------------------------------------------------
    // Nur auf den dafür bestimmten Tarif, nur solange Plätze frei sind, und
    // nur, wenn dieser Mandant nicht schon einen hat. Die Begrenzung auf 50
    // liegt zusätzlich am Coupon selbst (`max_redemptions`) — zwei Sperren,
    // weil ein Zähler zwischen Prüfung und Abschluss weiterlaufen kann.
    const { data: werte } = await db.from("plattform_werte").select("schluessel, wert");
    const w: Record<string, unknown> = {};
    for (const z of werte || []) w[z.schluessel] = z.wert;
    const gruenderTarif = String(w.gruender_tarif ?? "starter").replace(/"/g, "");
    const coupon = Deno.env.get("STRIPE_COUPON_GRUENDER") || "";
    if (coupon && tarifSchluessel === gruenderTarif && !abo?.gruenderpreis) {
      const { data: frei } = await db.rpc("gruender_plaetze_frei");
      if (Number(frei ?? 0) > 0) felder["discounts[0][coupon]"] = coupon;
    }

    const sitzung = await stripe("checkout/sessions", felder);
    return antwort({ ok: true, url: sitzung.url, tarif: tarifSchluessel, intervall, zusatznutzer: zusatz });
  } catch (e) {
    const grund = e instanceof Error ? e.message : String(e);
    console.error("abo-checkout:", grund);
    return antwort({ ok: false, fehler: grund }, 500);
  }
});
