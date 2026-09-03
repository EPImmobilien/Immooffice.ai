#!/usr/bin/env node
/**
 * Legt Produkte und Preise bei Stripe an — aus den Werten der Datenbank —
 * und traegt die Preis-IDs zurueck (docs/AUTONOMIE.md 1.2, S1, S4).
 *
 * Idempotent: Ein Produkt wird an seinem Metadatum `immooffice_schluessel`
 * wiedererkannt; ein Preis wird nur angelegt, wenn Betrag oder Intervall
 * abweichen. Preise sind Daten (tarife, preise) — dieses Skript ist nur der
 * Bote zu Stripe.
 *
 * Braucht in der Umgebung: STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY. Live nur mit --live und STRIPE_LIVE_BESTAETIGT="ja".
 *
 * Aufruf:  node --env-file=.env.local scripts/stripe-einrichten.mjs
 *          node --env-file=.env.local scripts/stripe-einrichten.mjs --live
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dienst = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeKey || !url || !dienst) {
  console.error("STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden gebraucht.");
  process.exit(2);
}
// Livebetrieb nur ausdruecklich: Schalter --live UND STRIPE_LIVE_BESTAETIGT="ja"
// — nach Gate B und mit anwaltlich gepruefeten Rechtstexten (ANLEITUNG 8).
const live = process.argv.includes("--live");
if (stripeKey.startsWith("sk_live_")) {
  if (!live || process.env.STRIPE_LIVE_BESTAETIGT !== "ja") {
    console.error('Live-Schluessel erkannt. Livebetrieb nur mit --live UND STRIPE_LIVE_BESTAETIGT="ja" (docs/ANLEITUNG.md, Abschnitt 8).');
    process.exit(2);
  }
  console.warn("ACHTUNG: LIVEMODUS — Produkte, Preise und Portal entstehen im echten Stripe-Konto.");
} else if (!stripeKey.startsWith("sk_test_")) {
  console.error("Unbekannter Schluessel: erwartet sk_test_… (Testmodus) oder sk_live_… mit --live.");
  process.exit(2);
} else if (live) {
  console.error("--live verlangt einen Live-Schluessel (sk_live_…).");
  process.exit(2);
}

const stripe = new Stripe(stripeKey);
const supabase = createClient(url, dienst, { auth: { persistSession: false } });

const cent = (netto) => Math.round(Number(netto) * 100);

async function produkt(schluessel, name, beschreibung) {
  const vorhanden = await stripe.products.search({ query: `metadata['immooffice_schluessel']:'${schluessel}'` });
  if (vorhanden.data[0]) return vorhanden.data[0];
  return stripe.products.create({ name, description: beschreibung, metadata: { immooffice_schluessel: schluessel }, tax_code: "txcd_10103001" });
}

async function preis(produktId, betragCent, intervall, schluessel) {
  const liste = await stripe.prices.list({ product: produktId, active: true, limit: 100 });
  const passend = liste.data.find(
    (p) => p.unit_amount === betragCent && p.currency === "eur" && (intervall ? p.recurring?.interval === intervall : !p.recurring),
  );
  if (passend) return passend;
  return stripe.prices.create({
    product: produktId,
    currency: "eur",
    unit_amount: betragCent,
    tax_behavior: "exclusive",
    ...(intervall ? { recurring: { interval: intervall } } : {}),
    metadata: { immooffice_schluessel: schluessel },
  });
}

const { data: tarife, error: tarifFehler } = await supabase.from("tarife").select("*").eq("aktiv", true).order("reihenfolge");
if (tarifFehler) throw new Error(tarifFehler.message);

for (const t of tarife) {
  const p = await produkt(`tarif_${t.schluessel}`, `ImmoOffice.ai ${t.name}`, `${t.enthaltene_benutzer} Benutzer, ${t.credits_monat} Credits monatlich`);
  const monat = await preis(p.id, cent(t.preis_monat_netto), "month", `${t.schluessel}_monat`);
  const jahr = await preis(p.id, cent(t.preis_jahr_netto), "year", `${t.schluessel}_jahr`);
  const { error } = await supabase
    .from("tarife")
    .update({ stripe_produkt_id: p.id, stripe_preis_monat: monat.id, stripe_preis_jahr: jahr.id })
    .eq("id", t.id);
  if (error) throw new Error(error.message);
  console.log(`Tarif ${t.name}: ${monat.id} (Monat), ${jahr.id} (Jahr)`);
}

const { data: preise, error: preisFehler } = await supabase.from("preise").select("*").eq("aktiv", true).order("reihenfolge");
if (preisFehler) throw new Error(preisFehler.message);

for (const pr of preise) {
  const p = await produkt(
    pr.art === "zusatznutzer" ? "zusatznutzer" : `paket_${pr.schluessel}`,
    pr.art === "zusatznutzer" ? "ImmoOffice.ai Zusätzlicher Benutzer" : `ImmoOffice.ai ${pr.bezeichnung}`,
    pr.art === "zusatznutzer" ? "Ein weiterer Zugang" : `${pr.credits} Credits, 12 Monate gültig`,
  );
  const st = await preis(p.id, cent(pr.netto), pr.intervall === "jahr" ? "year" : pr.intervall === "monat" ? "month" : null, pr.schluessel);
  const { error } = await supabase.from("preise").update({ stripe_preis_id: st.id }).eq("schluessel", pr.schluessel);
  if (error) throw new Error(error.message);
  console.log(`${pr.bezeichnung}: ${st.id}`);
}

// Abrechnungsportal: Tarifwechsel zwischen den Tarifen erlauben, Kuendigung zum Periodenende.
const tarifProdukte = await Promise.all(
  (await supabase.from("tarife").select("stripe_produkt_id, stripe_preis_monat, stripe_preis_jahr").eq("aktiv", true)).data.map(async (t) => ({
    product: t.stripe_produkt_id,
    prices: [t.stripe_preis_monat, t.stripe_preis_jahr],
  })),
);
const konfigurationen = await stripe.billingPortal.configurations.list({ limit: 1, active: true });
const einstellungen = {
  business_profile: { headline: "ImmoOffice.ai — Abo und Rechnungen" },
  features: {
    customer_update: { enabled: true, allowed_updates: ["address", "name", "email", "tax_id"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
    subscription_update: { enabled: true, default_allowed_updates: ["price", "quantity"], proration_behavior: "create_prorations", products: tarifProdukte },
  },
};
if (konfigurationen.data[0]) {
  await stripe.billingPortal.configurations.update(konfigurationen.data[0].id, einstellungen);
  console.log("Abrechnungsportal aktualisiert.");
} else {
  await stripe.billingPortal.configurations.create(einstellungen);
  console.log("Abrechnungsportal angelegt.");
}

console.log("\nFertig. Als Naechstes den Webhook anlegen (docs/ANLEITUNG.md, Abschnitt 8).");
