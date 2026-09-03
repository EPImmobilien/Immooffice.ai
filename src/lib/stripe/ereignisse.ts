/**
 * Verarbeitung von Stripe-Ereignissen — rein, ohne Datenbank und ohne SDK.
 *
 * Der Webhook (route.ts) prueft die Signatur, sichert die Idempotenz und
 * ruft `ereignisVerarbeiten` mit einem Speicher. Diese Datei kennt nur die
 * Felder, die sie braucht (`StripeEreignis`), damit sie mit einfachen
 * Objekten testbar bleibt.
 *
 * Verarbeitete Ereignisse (S9): checkout.session.completed,
 * customer.subscription.created/updated/deleted, invoice.paid,
 * invoice.payment_failed.
 */

export interface StripeEreignis {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface AboZustand {
  mandant_id: string;
  stripe_kunde: string | null;
  stripe_abo: string;
  stripe_status: string;
  tarif_schluessel: string | null;
  intervall: "monat" | "jahr" | null;
  zusatznutzer: number;
  laufend_bis: string | null;
  gekuendigt_zum: string | null;
}

/** Was der Webhook an der Datenbank braucht. */
export interface AboSpeicher {
  mandantFuerKunde(kundeId: string): Promise<string | null>;
  kundeSetzen(mandantId: string, kundeId: string): Promise<void>;
  /** Tarifschluessel und Intervall zu einer Stripe-Preis-ID, sonst null. */
  tarifFuerPreis(preisId: string): Promise<{ schluessel: string; intervall: "monat" | "jahr" } | null>;
  /** Schluessel aus `preise` (Zusatzbenutzer, Pakete) zu einer Stripe-Preis-ID, sonst null. */
  preisFuerStripePreis(preisId: string): Promise<{ schluessel: string; art: "zusatznutzer" | "credit_paket" } | null>;
  aboUebernehmen(zustand: AboZustand): Promise<void>;
  periodeGutschreiben(mandantId: string, rechnungId: string): Promise<number>;
  paketGutschreiben(mandantId: string, paket: string, zahlungId: string): Promise<number>;
  zahlungFehlgeschlagen(mandantId: string): Promise<void>;
}

export interface Verarbeitung {
  /** Was passiert ist, in Nutzersprache — fuer das Protokoll */
  meldung: string;
  /** false, wenn das Ereignis bekannt, aber fuer uns ohne Bedeutung ist */
  relevant: boolean;
}

function text(o: Record<string, unknown>, feld: string): string | null {
  const w = o[feld];
  if (typeof w === "string") return w;
  // Expandierte Objekte (customer, subscription) tragen ihre ID unter `id`.
  if (w && typeof w === "object" && typeof (w as Record<string, unknown>)["id"] === "string") {
    return (w as Record<string, unknown>)["id"] as string;
  }
  return null;
}

function zahl(o: Record<string, unknown>, feld: string): number | null {
  const w = o[feld];
  return typeof w === "number" && Number.isFinite(w) ? w : null;
}

function zeitpunkt(sekunden: number | null): string | null {
  return sekunden === null ? null : new Date(sekunden * 1000).toISOString();
}

function metadaten(o: Record<string, unknown>): Record<string, string> {
  const m = o["metadata"];
  if (!m || typeof m !== "object") return {};
  const aus: Record<string, string> = {};
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) if (typeof v === "string") aus[k] = v;
  return aus;
}

async function mandantErmitteln(o: Record<string, unknown>, speicher: AboSpeicher): Promise<string | null> {
  const meta = metadaten(o);
  if (meta["mandant_id"] && /^[0-9a-f-]{36}$/.test(meta["mandant_id"])) return meta["mandant_id"];
  const kunde = text(o, "customer");
  return kunde ? speicher.mandantFuerKunde(kunde) : null;
}

/** Liest Tarif, Intervall und Zusatzbenutzer aus den Positionen eines Abos. */
async function positionenLesen(
  abo: Record<string, unknown>,
  speicher: AboSpeicher,
): Promise<{ tarif: string | null; intervall: "monat" | "jahr" | null; zusatznutzer: number }> {
  const items = abo["items"] as { data?: unknown[] } | undefined;
  let tarif: string | null = null;
  let intervall: "monat" | "jahr" | null = null;
  let zusatznutzer = 0;

  for (const roh of items?.data ?? []) {
    const item = roh as Record<string, unknown>;
    const preis = item["price"] as Record<string, unknown> | undefined;
    const preisId = preis ? text(preis, "id") : null;
    if (!preisId) continue;
    const menge = zahl(item, "quantity") ?? 1;

    const t = await speicher.tarifFuerPreis(preisId);
    if (t) {
      tarif = t.schluessel;
      intervall = t.intervall;
      continue;
    }
    const p = await speicher.preisFuerStripePreis(preisId);
    if (p?.art === "zusatznutzer") zusatznutzer += menge;
  }
  return { tarif, intervall, zusatznutzer };
}

export async function ereignisVerarbeiten(ereignis: StripeEreignis, speicher: AboSpeicher): Promise<Verarbeitung> {
  const o = ereignis.data.object;

  switch (ereignis.type) {
    case "checkout.session.completed": {
      const meta = metadaten(o);
      const mandant = await mandantErmitteln(o, speicher);
      if (!mandant) return { relevant: true, meldung: "Checkout ohne zuordenbaren Mandanten — ignoriert." };
      const kunde = text(o, "customer");
      if (kunde) await speicher.kundeSetzen(mandant, kunde);

      if (o["mode"] === "payment" && meta["art"] === "paket" && meta["paket"]) {
        const zahlung = text(o, "payment_intent") ?? ereignis.id;
        const credits = await speicher.paketGutschreiben(mandant, meta["paket"], zahlung);
        return { relevant: true, meldung: credits > 0 ? `Paket ${meta["paket"]}: ${credits} Credits gutgeschrieben.` : "Paket bereits gutgeschrieben." };
      }
      return { relevant: true, meldung: "Checkout abgeschlossen; Abo folgt per Subscription-Ereignis." };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const mandant = await mandantErmitteln(o, speicher);
      if (!mandant) return { relevant: true, meldung: "Abo ohne zuordenbaren Mandanten — ignoriert." };
      const aboId = text(o, "id");
      const status = text(o, "status");
      if (!aboId || !status) return { relevant: true, meldung: "Abo-Ereignis ohne ID oder Status — ignoriert." };

      const { tarif, intervall, zusatznutzer } = await positionenLesen(o, speicher);
      const gekuendigtZum = zeitpunkt(zahl(o, "cancel_at")) ?? (o["cancel_at_period_end"] === true ? zeitpunkt(zahl(o, "current_period_end")) : null);

      await speicher.aboUebernehmen({
        mandant_id: mandant,
        stripe_kunde: text(o, "customer"),
        stripe_abo: aboId,
        stripe_status: ereignis.type === "customer.subscription.deleted" ? "canceled" : status,
        tarif_schluessel: tarif,
        intervall,
        zusatznutzer,
        laufend_bis: zeitpunkt(zahl(o, "current_period_end")),
        gekuendigt_zum: ereignis.type === "customer.subscription.deleted" ? zeitpunkt(zahl(o, "canceled_at")) ?? new Date().toISOString() : gekuendigtZum,
      });
      return { relevant: true, meldung: `Abo ${aboId}: ${status}${tarif ? `, Tarif ${tarif}` : ""}, ${zusatznutzer} Zusatzbenutzer.` };
    }

    case "invoice.paid": {
      const grund = text(o, "billing_reason");
      const abo = text(o, "subscription") ?? text((o["parent"] as Record<string, unknown> | undefined)?.["subscription_details"] as Record<string, unknown> ?? {}, "subscription");
      if (!abo || !grund || !["subscription_create", "subscription_cycle", "subscription_update"].includes(grund)) {
        return { relevant: false, meldung: "Rechnung ohne Abo-Bezug — nichts zu tun." };
      }
      const mandant = await mandantErmitteln(o, speicher);
      if (!mandant) return { relevant: true, meldung: "Bezahlte Rechnung ohne zuordenbaren Mandanten — ignoriert." };
      const rechnung = text(o, "id") ?? ereignis.id;
      const credits = await speicher.periodeGutschreiben(mandant, rechnung);
      return { relevant: true, meldung: credits > 0 ? `Periode ${rechnung}: ${credits} Credits zugeteilt.` : `Periode ${rechnung} war bereits zugeteilt.` };
    }

    case "invoice.payment_failed": {
      const mandant = await mandantErmitteln(o, speicher);
      if (!mandant) return { relevant: true, meldung: "Fehlgeschlagene Zahlung ohne zuordenbaren Mandanten — ignoriert." };
      await speicher.zahlungFehlgeschlagen(mandant);
      return { relevant: true, meldung: "Zahlung fehlgeschlagen: Abo auf „Zahlung offen“ gesetzt." };
    }

    default:
      return { relevant: false, meldung: `Ereignis ${ereignis.type} wird nicht verarbeitet.` };
  }
}
