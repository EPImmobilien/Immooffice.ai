import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { PdfWerkzeuge } from "@/components/werkzeuge/PdfWerkzeuge";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";

export const metadata: Metadata = { title: "PDF-Werkzeuge" };

export default async function PdfSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "lesen", sitzung.uebersteuerung);
  return (
    <>
      <Seitenkopf titel="PDF-Werkzeuge" beschreibung="Zusammenfügen, teilen, Seiten bearbeiten, komprimieren, schwärzen — vollständig im Browser.">
        <Link href="/werkzeuge" className="text-[13px] text-akzent hover:underline">Alle Werkzeuge</Link>
      </Seitenkopf>
      <PdfWerkzeuge />
    </>
  );
}
