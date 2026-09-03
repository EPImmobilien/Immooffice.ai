"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { stripeClient } from "@/lib/stripe/client";
import { serverClient } from "@/lib/supabase/server";
import { basisUrlErmitteln } from "@/lib/web-expose";

/**
 * Abo und Credits ueber Stripe (docs/AUTONOMIE.md Abschnitt 4).
 *
 * Alles laeuft ueber Stripe Checkout und das Abrechnungsportal: Zahlungsmittel,
 * Rechnungen, Tarifwechsel, Kuendigung. Die Anwendung erfaehrt Aenderungen
 * ausschliesslich ueber den Webhook — nie aus dieser Datei heraus.
 */

export interface AboErgebnis {
  fehler?: string;
}

function text(formular: FormData, feld: string): string {
  return String(formular.get(feld) ?? "").trim();
}

async function kundeErmitteln(mandantId: string): Promise<string | null> {
  const supabase = await serverClient();
  const { data } = await supabase.from("abonnements").select("stripe_kunde_id").eq("mandant_id", mandantId).maybeSingle();
  return (data?.stripe_kunde_id as string | null) ?? null;
}

/** Tarif buchen: Checkout im Abo-Modus, mit Zusatzbenutzern als zweiter Position. */
export async function tarifBuchen(_vorher: AboErgebnis, formular: FormData): Promise<AboErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "abrechnung", "aendern", sitzung.uebersteuerung);

  const stripe = stripeClient();
  if (!stripe) return { fehler: "Die Abrechnung ist noch nicht eingerichtet (Stripe-Schlüssel fehlt)." };

  const schluessel = text(formular, "tarif");
  const intervall = text(formular, "intervall") === "jahr" ? "jahr" : "monat";
  const zusatz = Math.max(0, Math.min(50, Number.parseInt(text(formular, "zusatznutzer") || "0", 10) || 0));

  const supabase = await serverClient();
  const [{ data: tarif }, { data: zusatzPreis }] = await Promise.all([
    supabase.from("tarife").select("schluessel, name, stripe_preis_monat, stripe_preis_jahr").eq("schluessel", schluessel).eq("aktiv", true).maybeSingle(),
    supabase.from("preise").select("stripe_preis_id").eq("schluessel", intervall === "jahr" ? "zusatznutzer_jahr" : "zusatznutzer_monat").maybeSingle(),
  ]);
  if (!tarif) return { fehler: "Unbekannter Tarif." };

  const preisId = (intervall === "jahr" ? tarif.stripe_preis_jahr : tarif.stripe_preis_monat) as string | null;
  if (!preisId) return { fehler: "Für diesen Tarif ist bei Stripe noch kein Preis hinterlegt (scripts/stripe-einrichten.mjs)." };
  if (zusatz > 0 && !zusatzPreis?.stripe_preis_id) {
    return { fehler: "Für Zusatzbenutzer ist bei Stripe noch kein Preis hinterlegt." };
  }

  const basis = basisUrlErmitteln(await headers());
  const kunde = await kundeErmitteln(sitzung.mandantId);

  const sitzungStripe = await stripe.checkout.sessions.create({
    mode: "subscription",
    locale: "de",
    ...(kunde ? { customer: kunde, customer_update: { address: "auto", name: "auto" } } : { customer_email: sitzung.email }),
    line_items: [
      { price: preisId, quantity: 1 },
      ...(zusatz > 0 ? [{ price: zusatzPreis!.stripe_preis_id as string, quantity: zusatz }] : []),
    ],
    // S6/S7: Stripe Tax mit USt-IdNr., SEPA und Karte, Rechnung ueber Stripe.
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    payment_method_types: ["card", "sepa_debit"],
    billing_address_collection: "required",
    allow_promotion_codes: true,
    subscription_data: { metadata: { mandant_id: sitzung.mandantId, tarif: tarif.schluessel as string } },
    metadata: { mandant_id: sitzung.mandantId, art: "abo" },
    success_url: `${basis}/credits?buchung=erfolg`,
    cancel_url: `${basis}/credits?buchung=abgebrochen`,
  });

  if (!sitzungStripe.url) return { fehler: "Stripe hat keine Checkout-Adresse geliefert." };
  redirect(sitzungStripe.url);
}

/** Credit-Paket kaufen: Checkout im Einmalzahlungs-Modus. */
export async function paketKaufen(_vorher: AboErgebnis, formular: FormData): Promise<AboErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "abrechnung", "aendern", sitzung.uebersteuerung);

  const stripe = stripeClient();
  if (!stripe) return { fehler: "Die Abrechnung ist noch nicht eingerichtet (Stripe-Schlüssel fehlt)." };

  const paket = text(formular, "paket");
  const supabase = await serverClient();
  const { data: preis } = await supabase.from("preise").select("schluessel, stripe_preis_id").eq("schluessel", paket).eq("art", "credit_paket").maybeSingle();
  if (!preis) return { fehler: "Unbekanntes Paket." };
  if (!preis.stripe_preis_id) return { fehler: "Für dieses Paket ist bei Stripe noch kein Preis hinterlegt." };

  const basis = basisUrlErmitteln(await headers());
  const kunde = await kundeErmitteln(sitzung.mandantId);

  const sitzungStripe = await stripe.checkout.sessions.create({
    mode: "payment",
    locale: "de",
    ...(kunde ? { customer: kunde, customer_update: { address: "auto", name: "auto" } } : { customer_email: sitzung.email, customer_creation: "always" }),
    line_items: [{ price: preis.stripe_preis_id as string, quantity: 1 }],
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    payment_method_types: ["card", "sepa_debit"],
    billing_address_collection: "required",
    invoice_creation: { enabled: true },
    metadata: { mandant_id: sitzung.mandantId, art: "paket", paket: preis.schluessel as string },
    success_url: `${basis}/credits?buchung=erfolg`,
    cancel_url: `${basis}/credits?buchung=abgebrochen`,
  });

  if (!sitzungStripe.url) return { fehler: "Stripe hat keine Checkout-Adresse geliefert." };
  redirect(sitzungStripe.url);
}

/** Abrechnungsportal (S9): Zahlungsmittel, Rechnungen, Tarifwechsel, Kuendigung. */
export async function abrechnungsportalOeffnen(_vorher: AboErgebnis): Promise<AboErgebnis> {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "abrechnung", "lesen", sitzung.uebersteuerung);

  const stripe = stripeClient();
  if (!stripe) return { fehler: "Die Abrechnung ist noch nicht eingerichtet (Stripe-Schlüssel fehlt)." };

  const kunde = await kundeErmitteln(sitzung.mandantId);
  if (!kunde) return { fehler: "Es besteht noch keine Buchung. Wählen Sie zuerst einen Tarif." };

  const basis = basisUrlErmitteln(await headers());
  const portal = await stripe.billingPortal.sessions.create({ customer: kunde, return_url: `${basis}/credits`, locale: "de" });
  redirect(portal.url);
}
