import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AboSpeicher, AboZustand } from "./ereignisse";

/**
 * Datenbankseite des Webhooks — mit der Dienstrolle (dienst.ts:
 * „Stripe-Webhooks"). Alle Zustandsaenderungen laufen ueber die
 * security-definer-Funktionen der Migration 20260903150000; hier wird nur
 * aufgerufen, nicht gerechnet.
 */
export class AboSpeicherSupabase implements AboSpeicher {
  constructor(private readonly supabase: SupabaseClient) {}

  async mandantFuerKunde(kundeId: string): Promise<string | null> {
    const { data } = await this.supabase.rpc("mandant_fuer_stripe_kunde", { p_kunde: kundeId });
    return typeof data === "string" ? data : null;
  }

  async kundeSetzen(mandantId: string, kundeId: string): Promise<void> {
    const { error } = await this.supabase.rpc("stripe_kunde_setzen", { p_mandant: mandantId, p_kunde: kundeId });
    if (error) throw new Error(error.message);
  }

  async tarifFuerPreis(preisId: string) {
    const { data } = await this.supabase
      .from("tarife")
      .select("schluessel, stripe_preis_monat, stripe_preis_jahr")
      .or(`stripe_preis_monat.eq.${preisId},stripe_preis_jahr.eq.${preisId}`)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return { schluessel: data.schluessel as string, intervall: data.stripe_preis_jahr === preisId ? ("jahr" as const) : ("monat" as const) };
  }

  async preisFuerStripePreis(preisId: string) {
    const { data } = await this.supabase.from("preise").select("schluessel, art").eq("stripe_preis_id", preisId).limit(1).maybeSingle();
    if (!data) return null;
    return { schluessel: data.schluessel as string, art: data.art as "zusatznutzer" | "credit_paket" };
  }

  async aboUebernehmen(z: AboZustand): Promise<void> {
    const { error } = await this.supabase.rpc("abo_uebernehmen", {
      p_mandant: z.mandant_id,
      p_stripe_kunde: z.stripe_kunde,
      p_stripe_abo: z.stripe_abo,
      p_stripe_status: z.stripe_status,
      p_tarif_schluessel: z.tarif_schluessel,
      p_intervall: z.intervall,
      p_zusatznutzer: z.zusatznutzer,
      p_laufend_bis: z.laufend_bis,
      p_gekuendigt_zum: z.gekuendigt_zum,
    });
    if (error) throw new Error(error.message);
  }

  async periodeGutschreiben(mandantId: string, rechnungId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc("abo_periode_gutschreiben", { p_mandant: mandantId, p_rechnung: rechnungId });
    if (error) throw new Error(error.message);
    return typeof data === "number" ? data : 0;
  }

  async paketGutschreiben(mandantId: string, paket: string, zahlungId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc("credit_paket_gutschreiben", { p_mandant: mandantId, p_paket: paket, p_zahlung: zahlungId });
    if (error) throw new Error(error.message);
    return typeof data === "number" ? data : 0;
  }

  async zahlungFehlgeschlagen(mandantId: string): Promise<void> {
    const { error } = await this.supabase.rpc("zahlung_fehlgeschlagen", { p_mandant: mandantId });
    if (error) throw new Error(error.message);
  }
}
