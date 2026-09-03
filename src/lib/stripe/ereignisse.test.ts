import { describe, expect, it } from "vitest";

import { ereignisVerarbeiten, type AboSpeicher, type AboZustand, type StripeEreignis } from "./ereignisse";

/** Speicher im Arbeitsspeicher, der alles mitschreibt. */
function speicher() {
  const s = {
    kunden: new Map<string, string>([["cus_bekannt", "m-1"]]),
    abos: [] as AboZustand[],
    perioden: new Map<string, number>(),
    pakete: new Map<string, number>(),
    fehlgeschlagen: [] as string[],
    async mandantFuerKunde(k: string) {
      return s.kunden.get(k) ?? null;
    },
    async kundeSetzen(m: string, k: string) {
      s.kunden.set(k, m);
    },
    async tarifFuerPreis(p: string) {
      return p === "price_pro_monat" ? { schluessel: "professional", intervall: "monat" as const } : null;
    },
    async preisFuerStripePreis(p: string) {
      if (p === "price_zusatz") return { schluessel: "zusatznutzer_monat", art: "zusatznutzer" as const };
      if (p === "price_paket") return { schluessel: "credits_klein", art: "credit_paket" as const };
      return null;
    },
    async aboUebernehmen(z: AboZustand) {
      s.abos.push(z);
    },
    async periodeGutschreiben(_m: string, r: string) {
      if (s.perioden.has(r)) return 0;
      s.perioden.set(r, 1500);
      return 1500;
    },
    async paketGutschreiben(_m: string, _p: string, z: string) {
      if (s.pakete.has(z)) return 0;
      s.pakete.set(z, 250);
      return 250;
    },
    async zahlungFehlgeschlagen(m: string) {
      s.fehlgeschlagen.push(m);
    },
  };
  return s satisfies AboSpeicher;
}

function ereignis(type: string, object: Record<string, unknown>, id = "evt_1"): StripeEreignis {
  return { id, type, data: { object } };
}

describe("Stripe-Ereignisse", () => {
  it("Checkout eines Abos verknuepft den Kunden mit dem Mandanten", async () => {
    const s = speicher();
    const e = await ereignisVerarbeiten(
      ereignis("checkout.session.completed", { mode: "subscription", customer: "cus_neu", metadata: { mandant_id: "11111111-1111-1111-1111-111111111111", art: "abo" } }),
      s,
    );
    expect(e.relevant).toBe(true);
    expect(s.kunden.get("cus_neu")).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("Checkout eines Pakets schreibt Credits gut — nur einmal je Zahlung", async () => {
    const s = speicher();
    const roh = { mode: "payment", customer: "cus_bekannt", payment_intent: "pi_1", metadata: { art: "paket", paket: "credits_klein" } };
    const erste = await ereignisVerarbeiten(ereignis("checkout.session.completed", roh), s);
    const zweite = await ereignisVerarbeiten(ereignis("checkout.session.completed", roh, "evt_2"), s);
    expect(erste.meldung).toContain("250");
    expect(zweite.meldung).toContain("bereits");
    expect(s.pakete.size).toBe(1);
  });

  it("liest Tarif, Intervall und Zusatzbenutzer aus den Abo-Positionen", async () => {
    const s = speicher();
    await ereignisVerarbeiten(
      ereignis("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_bekannt",
        status: "active",
        current_period_end: 1_790_000_000,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_pro_monat" }, quantity: 1 }, { price: { id: "price_zusatz" }, quantity: 2 }] },
      }),
      s,
    );
    expect(s.abos).toHaveLength(1);
    expect(s.abos[0]).toMatchObject({
      mandant_id: "m-1",
      stripe_abo: "sub_1",
      stripe_status: "active",
      tarif_schluessel: "professional",
      intervall: "monat",
      zusatznutzer: 2,
      gekuendigt_zum: null,
    });
    expect(s.abos[0]!.laufend_bis).toBe(new Date(1_790_000_000 * 1000).toISOString());
  });

  it("Kuendigung zum Periodenende wird als gekuendigt_zum uebernommen", async () => {
    const s = speicher();
    await ereignisVerarbeiten(
      ereignis("customer.subscription.updated", {
        id: "sub_1", customer: "cus_bekannt", status: "active", current_period_end: 1_790_000_000, cancel_at_period_end: true,
        items: { data: [{ price: { id: "price_pro_monat" }, quantity: 1 }] },
      }),
      s,
    );
    expect(s.abos[0]!.gekuendigt_zum).toBe(new Date(1_790_000_000 * 1000).toISOString());
  });

  it("geloeschtes Abo gilt als canceled, auch wenn Stripe einen anderen Status mitschickt", async () => {
    const s = speicher();
    await ereignisVerarbeiten(ereignis("customer.subscription.deleted", { id: "sub_1", customer: "cus_bekannt", status: "active", items: { data: [] } }), s);
    expect(s.abos[0]!.stripe_status).toBe("canceled");
    expect(s.abos[0]!.gekuendigt_zum).not.toBeNull();
  });

  it("bezahlte Abo-Rechnung teilt das Kontingent zu — je Rechnung genau einmal", async () => {
    const s = speicher();
    const roh = { id: "in_1", customer: "cus_bekannt", subscription: "sub_1", billing_reason: "subscription_cycle" };
    const a = await ereignisVerarbeiten(ereignis("invoice.paid", roh), s);
    const b = await ereignisVerarbeiten(ereignis("invoice.paid", roh, "evt_2"), s);
    expect(a.meldung).toContain("1500");
    expect(b.meldung).toContain("bereits");
  });

  it("Rechnungen ohne Abo-Bezug sind nicht relevant", async () => {
    const s = speicher();
    const e = await ereignisVerarbeiten(ereignis("invoice.paid", { id: "in_x", customer: "cus_bekannt", billing_reason: "manual" }), s);
    expect(e.relevant).toBe(false);
    expect(s.perioden.size).toBe(0);
  });

  it("fehlgeschlagene Zahlung markiert den Mandanten", async () => {
    const s = speicher();
    await ereignisVerarbeiten(ereignis("invoice.payment_failed", { customer: "cus_bekannt" }), s);
    expect(s.fehlgeschlagen).toEqual(["m-1"]);
  });

  it("unbekannter Kunde wird ignoriert, nicht verwechselt", async () => {
    const s = speicher();
    const e = await ereignisVerarbeiten(ereignis("customer.subscription.created", { id: "sub_9", customer: "cus_fremd", status: "active", items: { data: [] } }), s);
    expect(e.meldung).toContain("ignoriert");
    expect(s.abos).toHaveLength(0);
  });

  it("unbekannte Ereignisse sind nicht relevant", async () => {
    const e = await ereignisVerarbeiten(ereignis("charge.refunded", {}), speicher());
    expect(e.relevant).toBe(false);
  });
});
