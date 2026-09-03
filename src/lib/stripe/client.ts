import "server-only";

import Stripe from "stripe";

/**
 * Stripe-Client — nur serverseitig, nur mit gesetztem Schluessel.
 *
 * Ohne STRIPE_SECRET_KEY gibt es keinen Client (null). Die Oberflaeche zeigt
 * dann Tarife an, aber keine Buchungsschaltflaechen; der Webhook antwortet mit
 * 503. Livebetrieb erst nach Gate B (docs/AUTONOMIE.md 1.2).
 */
export function stripeClient(): Stripe | null {
  const schluessel = process.env["STRIPE_SECRET_KEY"];
  if (!schluessel || schluessel.trim() === "") return null;
  return new Stripe(schluessel, { appInfo: { name: "ImmoOffice.ai" } });
}

/** Wahr, wenn der Schluessel ein Testschluessel ist — Livebetrieb braucht Gate B. */
export function stripeIstTestmodus(): boolean {
  return (process.env["STRIPE_SECRET_KEY"] ?? "").startsWith("sk_test_");
}
