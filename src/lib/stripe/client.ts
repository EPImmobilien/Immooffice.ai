import "server-only";

import Stripe from "stripe";

/**
 * Stripe-Client — nur serverseitig, nur mit gesetztem Schluessel.
 *
 * Ohne STRIPE_SECRET_KEY gibt es keinen Client (null). Die Oberflaeche zeigt
 * dann Tarife an, aber keine Buchungsschaltflaechen; der Webhook antwortet mit
 * 503. Test- und Live-Schluessel unterscheiden sich fuer die Anwendung nicht;
 * die Liveschaltung entscheidet das Einrichtungsskript mit --live (E-33).
 */
export function stripeClient(): Stripe | null {
  const schluessel = process.env["STRIPE_SECRET_KEY"];
  if (!schluessel || schluessel.trim() === "") return null;
  return new Stripe(schluessel, { appInfo: { name: "ImmoOffice.ai" } });
}

/** Wahr, wenn der Schluessel ein Testschluessel ist — Livebetrieb nur nach Gate B mit Bestaetigung (E-33). */
export function stripeIstTestmodus(): boolean {
  return (process.env["STRIPE_SECRET_KEY"] ?? "").startsWith("sk_test_");
}
