import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Kundenbereich, type PortalDaten } from "@/components/portal/Kundenbereich";
import { istToken } from "@/lib/portal/token";
import { serverClient } from "@/lib/supabase/server";
import { kundeCookieName } from "@/server/kunde-aktionen";

import { PasswortTor } from "./PasswortTor";

export const metadata: Metadata = {
  title: "Kundenbereich",
  robots: { index: false, follow: false },
};

/**
 * Kundenbereich ohne Konto: Der Link traegt den Zugang. Bei jedem Aufruf
 * prueft die Datenbank Token (und Passwort) neu; das Passwort merkt sich ein
 * pfadgebundenes Cookie fuer acht Stunden — wie beim Web-Exposé.
 */
export default async function KundeSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!istToken(token)) return <Unbekannt />;
  const kekse = await cookies();
  const passwort = kekse.get(await kundeCookieName(token))?.value ?? null;
  const supabase = await serverClient();
  const { data: geoeffnet } = await supabase.rpc("portal_oeffnen", { p_token: token, p_passwort: passwort });
  const g = geoeffnet as { zustand?: string; anzeigename?: string } | null;
  if (g?.zustand === "passwort") return <PasswortTor token={token} anzeigename={g.anzeigename ?? ""} unternehmen="Kundenbereich" />;
  if (g?.zustand !== "ok") return <Unbekannt />;
  const { data } = await supabase.rpc("portal_daten", { p_token: token, p_passwort: passwort });
  const d = data as (PortalDaten & { zustand?: string }) | null;
  if (!d || d.zustand !== "ok") return <Unbekannt />;
  // Nachrichten des Maklers gelten als gelesen, sobald der Kunde die Seite sieht
  await supabase.rpc("portal_gelesen", { p_token: token, p_passwort: passwort });
  return <Kundenbereich token={token} daten={d} />;
}

function Unbekannt() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16 text-center">
      <h1 className="text-lg font-semibold text-text">Dieser Zugang ist nicht (mehr) gültig</h1>
      <p className="mt-2 text-[13px] text-gedaempft">Der Link ist unbekannt, abgelaufen oder wurde erneuert. Bitte wenden Sie sich an Ihren Ansprechpartner — er kann Ihnen einen neuen Zugangslink schicken.</p>
    </main>
  );
}
