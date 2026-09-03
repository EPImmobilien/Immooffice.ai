import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Marke } from "@/components/ui/Status";
import { UebergabeAssistent } from "@/components/verkauf/UebergabeAssistent";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { kiVerfuegbar } from "@/lib/ki";
import { serverClient } from "@/lib/supabase/server";
import { protokollAusZeile, protokollTitel, TYPEN } from "@/lib/verkauf/uebergabe";

export const metadata: Metadata = { title: "Übergabeprotokoll" };

export default async function UebergabeSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const { data } = await supabase.from("uebergabeprotokolle").select("*, objekt_ref:objekte(objektnummer, bezeichnung)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = protokollAusZeile(data as Record<string, unknown>);
  const status = data.status as "entwurf" | "abgeschlossen";

  return (
    <>
      <Seitenkopf titel={protokollTitel(p)} beschreibung={`${TYPEN[p.typ]}${data.objekt_ref ? ` · ${(data.objekt_ref as { objektnummer: string; bezeichnung: string }).objektnummer} ${(data.objekt_ref as { bezeichnung: string }).bezeichnung}` : ""}`}>
        <div className="flex items-center gap-2">
          <Marke ton={status === "abgeschlossen" ? "erfolg" : "neutral"}>{status === "abgeschlossen" ? "Abgeschlossen" : "Entwurf"}</Marke>
          <Link href="/uebergaben" className="text-[13px] text-akzent hover:underline">Zur Übersicht</Link>
        </div>
      </Seitenkopf>
      <Karte>
        <KarteInhalt>
          <UebergabeAssistent
            id={id}
            start={p}
            status={status}
            darfAendern={hatRecht(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung)}
            darfFreigeben={hatRecht(sitzung.rolle, "vertraege", "freigeben", sitzung.uebersteuerung)}
            kiVerfuegbar={kiVerfuegbar()}
          />
        </KarteInhalt>
      </Karte>
    </>
  );
}
