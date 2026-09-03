import { NextResponse } from "next/server";

import { stripeClient } from "@/lib/stripe/client";
import { ereignisVerarbeiten, type StripeEreignis } from "@/lib/stripe/ereignisse";
import { AboSpeicherSupabase } from "@/lib/stripe/speicher-supabase";
import { dienstClient } from "@/lib/supabase/dienst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe-Webhook (S9): Signatur pruefen, Idempotenz sichern, verarbeiten.
 *
 * Reihenfolge ist Absicht:
 *   1. Signatur — ohne gueltige Signatur wird nichts angefasst.
 *   2. `stripe_ereignis_beginnen` — ein bereits verarbeitetes Ereignis wird
 *      mit 200 quittiert und sonst ignoriert (Stripe schickt Ereignisse
 *      mehrfach).
 *   3. Verarbeitung; ein Fehler wird am Ereignis vermerkt und mit 500
 *      beantwortet, damit Stripe es erneut zustellt.
 */
export async function POST(anfrage: Request) {
  const stripe = stripeClient();
  const geheimnis = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!stripe || !geheimnis) {
    return NextResponse.json({ fehler: "Stripe ist nicht eingerichtet." }, { status: 503 });
  }

  const signatur = anfrage.headers.get("stripe-signature");
  if (!signatur) return NextResponse.json({ fehler: "Signatur fehlt." }, { status: 400 });

  const roh = await anfrage.text();
  let ereignis: StripeEreignis;
  try {
    const geprueft = stripe.webhooks.constructEvent(roh, signatur, geheimnis);
    ereignis = { id: geprueft.id, type: geprueft.type, data: { object: geprueft.data.object as unknown as Record<string, unknown> } };
  } catch {
    return NextResponse.json({ fehler: "Signatur ungültig." }, { status: 400 });
  }

  const supabase = dienstClient();
  const { data: neu, error } = await supabase.rpc("stripe_ereignis_beginnen", {
    p_id: ereignis.id,
    p_typ: ereignis.type,
    p_nutzlast: { object_id: (ereignis.data.object["id"] as string | undefined) ?? null },
  });
  if (error) return NextResponse.json({ fehler: "Ereignis konnte nicht vermerkt werden." }, { status: 500 });
  if (neu === false) return NextResponse.json({ ok: true, hinweis: "bereits verarbeitet" });

  try {
    const ergebnis = await ereignisVerarbeiten(ereignis, new AboSpeicherSupabase(supabase));
    await supabase.rpc("stripe_ereignis_abschliessen", { p_id: ereignis.id, p_fehler: null });
    return NextResponse.json({ ok: true, relevant: ergebnis.relevant, meldung: ergebnis.meldung });
  } catch (e) {
    const text = e instanceof Error ? e.message : "unbekannter Fehler";
    await supabase.rpc("stripe_ereignis_abschliessen", { p_id: ereignis.id, p_fehler: text.slice(0, 500) });
    return NextResponse.json({ fehler: text }, { status: 500 });
  }
}
