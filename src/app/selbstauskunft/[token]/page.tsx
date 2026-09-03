import type { Metadata } from "next";

import { SelbstauskunftFormular } from "@/components/vermietung/SelbstauskunftFormular";
import { Hinweis } from "@/components/ui/Status";
import { euro, flaeche, zahl } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mieterselbstauskunft", robots: { index: false, follow: false } };

/** Oeffentliche Seite fuer Interessenten — ohne Anmeldung, nur ueber den Link. */
export default async function SelbstauskunftSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await serverClient();
  const { data } = await supabase.rpc("selbstauskunft_oeffnen", { p_token: token });
  const antwort = (data ?? { zustand: "unbekannt" }) as { zustand: string; firma?: string; datenschutz?: string | null; objekt?: { bezeichnung: string; ort: string | null; plz: string | null; kaltmiete: number | null; wohnflaeche: number | null; zimmer: number | null } | null };

  return (
    <div className="min-h-screen bg-grund">
      <header className="border-b border-linie bg-flaeche">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <p className="text-[15px] font-semibold text-text">{antwort.firma ?? "Mieterselbstauskunft"}</p>
          <p className="text-[12px] text-gedaempft">Mieterselbstauskunft</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        {antwort.zustand !== "ok" ? (
          <Hinweis ton="warnung">Dieses Formular ist nicht mehr gültig. Bitte wenden Sie sich an den Makler.</Hinweis>
        ) : (
          <div className="space-y-6">
            {antwort.objekt && (
              <div className="rounded-[var(--radius)] border border-linie bg-flaeche p-4">
                <p className="text-[14px] font-medium text-text">{antwort.objekt.bezeichnung}</p>
                <p className="text-[13px] text-gedaempft">
                  {[[antwort.objekt.plz, antwort.objekt.ort].filter(Boolean).join(" "), antwort.objekt.zimmer ? `${zahl(antwort.objekt.zimmer)} Zimmer` : null, antwort.objekt.wohnflaeche ? flaeche(antwort.objekt.wohnflaeche) : null, antwort.objekt.kaltmiete ? `${euro(antwort.objekt.kaltmiete)} Kaltmiete` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
            )}
            <div className="rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5">
              <SelbstauskunftFormular token={token} />
            </div>
            {antwort.datenschutz && (
              <details className="text-[12px] text-gedaempft"><summary className="cursor-pointer">Datenschutzhinweise des Maklers</summary><p className="mt-2 whitespace-pre-wrap">{antwort.datenschutz}</p></details>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
