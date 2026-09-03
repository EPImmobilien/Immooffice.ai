import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { MaklervertragFormular } from "@/components/verkauf/MaklervertragFormular";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { kiVerfuegbar } from "@/lib/ki";
import { auswahlLaden } from "@/lib/verkauf/auswahl";
import { MUSTER_HINWEIS } from "@/lib/vertraege";

export const metadata: Metadata = { title: "Maklervertrag" };

export default async function MaklervertragSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);
  const { objekte, kontakte } = await auswahlLaden();

  return (
    <>
      <Seitenkopf titel="Maklervertrag aus Vorlage" beschreibung="Verkäufertyp, Provisionsmodell und Laufzeit wählen — der Vertragstext entsteht daraus und bleibt bis zur ersten Unterschrift bearbeitbar.">
        <Link href="/vertraege" className="text-[13px] text-akzent hover:underline">Zurück zu den Verträgen</Link>
      </Seitenkopf>
      <Hinweis ton="warnung" className="mb-5">{MUSTER_HINWEIS}</Hinweis>
      <Karte>
        <KarteInhalt>
          <MaklervertragFormular objekte={objekte} kontakte={kontakte} kiVerfuegbar={kiVerfuegbar()} />
        </KarteInhalt>
      </Karte>
    </>
  );
}
