import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { ObjektnachweisFormular } from "@/components/verkauf/ObjektnachweisFormular";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { auswahlLaden } from "@/lib/verkauf/auswahl";
import { MUSTER_HINWEIS } from "@/lib/vertraege";

export const metadata: Metadata = { title: "Objektnachweis" };

export default async function ObjektnachweisSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung);
  const { objekte, kontakte } = await auswahlLaden();

  return (
    <>
      <Seitenkopf titel="Objektnachweis mit Provisionsvereinbarung" beschreibung="Für Interessenten: Nachweis des Objekts, Provision in gleicher Höhe wie beim Verkäufer (§ 656c BGB), beidseitige Unterschrift über den Signaturlink.">
        <Link href="/vertraege" className="text-[13px] text-akzent hover:underline">Zurück zu den Verträgen</Link>
      </Seitenkopf>
      <Hinweis ton="warnung" className="mb-5">{MUSTER_HINWEIS}</Hinweis>
      <Karte>
        <KarteInhalt>
          <ObjektnachweisFormular objekte={objekte} kontakte={kontakte} />
        </KarteInhalt>
      </Karte>
    </>
  );
}
