import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { LaufzettelAssistent } from "@/components/verkauf/LaufzettelAssistent";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { kiVerfuegbar } from "@/lib/ki";
import { serverClient } from "@/lib/supabase/server";
import { laufzettelAusDaten, STATUS, type Anhang, type LaufzettelStatus } from "@/lib/verkauf/laufzettel";

export const metadata: Metadata = { title: "Notar-Laufzettel" };

export default async function LaufzettelSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const { data } = await supabase.from("notar_laufzettel").select("*, objekt:objekte(objektnummer, bezeichnung)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const status = data.status as LaufzettelStatus;
  const objekt = data.objekt as { objektnummer: string; bezeichnung: string } | null;

  return (
    <>
      <Seitenkopf titel={data.bezeichnung as string} beschreibung={objekt ? `${objekt.objektnummer} ${objekt.bezeichnung}` : "Kaufabwicklung"}>
        <div className="flex items-center gap-2">
          <Marke ton={status === "abgeschlossen" ? "erfolg" : status === "versendet" ? "warnung" : status === "bereit" ? "info" : "neutral"}>{STATUS[status]}</Marke>
          <Link href="/notar" className="text-[13px] text-akzent hover:underline">Zur Übersicht</Link>
        </div>
      </Seitenkopf>
      <Hinweis ton="info" className="mb-5">Der Laufzettel ist eine Zusammenstellung für das Notariat und ersetzt weder die notarielle Belehrung noch den Kaufvertrag. Personenbezogene Daten der Beteiligten gehören nur hierher, wenn sie für den Vertrag nötig sind.</Hinweis>
      <Karte>
        <KarteInhalt>
          <LaufzettelAssistent
            id={id}
            bezeichnung={data.bezeichnung as string}
            start={laufzettelAusDaten(data.daten)}
            anhaenge={(Array.isArray(data.anhaenge) ? data.anhaenge : []) as Anhang[]}
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
