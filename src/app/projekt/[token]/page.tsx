import type { Metadata } from "next";

import { Projektseite, type OeffentlichesProjekt } from "@/components/portal/Projektseite";
import { istToken } from "@/lib/portal/token";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Neubauprojekt" };

/** Oeffentliche Projektseite: Einheiten, oeffentliche Unterlagen, Baufortschritt, Anfrage. */
export default async function ProjektOeffentlichSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await serverClient();
  const { data } = istToken(token) ? await supabase.rpc("projekt_oeffentlich", { p_token: token }) : { data: null };
  const d = data as (OeffentlichesProjekt & { zustand?: string }) | null;
  if (!d || d.zustand !== "ok") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16 text-center">
        <h1 className="text-lg font-semibold text-text">Diese Projektseite ist nicht erreichbar</h1>
        <p className="mt-2 text-[13px] text-gedaempft">Der Link ist unbekannt oder das Projekt ist derzeit nicht veröffentlicht.</p>
      </main>
    );
  }
  return <Projektseite token={token} daten={d} />;
}
