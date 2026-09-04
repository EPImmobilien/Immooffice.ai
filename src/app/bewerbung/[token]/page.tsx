import type { Metadata } from "next";

import { BewerbungTest } from "@/components/verwaltung/BewerbungTest";
import { istToken } from "@/lib/portal/token";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Einstellungstest", robots: { index: false, follow: false } };

/** Oeffentlicher Einstellungstest (Token-Link aus der Bewerber-Einladung). */
export default async function BewerbungSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await serverClient();
  const { data } = istToken(token) ? await supabase.rpc("bewerbung_oeffnen", { p_token: token }) : { data: null };
  const d = data as { zustand?: string; vorname?: string; nachname?: string; position?: string | null; unternehmen?: string } | null;
  if (!d || d.zustand === "unbekannt") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16 text-center">
        <h1 className="text-lg font-semibold text-text">Dieser Testlink ist nicht (mehr) gültig</h1>
        <p className="mt-2 text-[13px] text-gedaempft">Der Link ist unbekannt oder abgelaufen. Bitte wenden Sie sich an Ihren Ansprechpartner im Unternehmen.</p>
      </main>
    );
  }
  if (d.zustand === "fertig") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16 text-center">
        <h1 className="text-lg font-semibold text-text">Vielen Dank</h1>
        <p className="mt-2 text-[13px] text-gedaempft">Ihr Test ist bereits eingegangen. {d.unternehmen} meldet sich bei Ihnen.</p>
      </main>
    );
  }
  return <BewerbungTest token={token} vorname={d.vorname ?? ""} nachname={d.nachname ?? ""} position={d.position ?? null} unternehmen={d.unternehmen ?? "Unternehmen"} />;
}
