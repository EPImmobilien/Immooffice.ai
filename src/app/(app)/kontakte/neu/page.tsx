import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";

import { KontaktFormular } from "../KontaktFormular";

export const metadata: Metadata = { title: "Neuer Kontakt" };

export default async function NeuerKontaktSeite() {
  const sitzung = await sitzungErzwingen();
  if (!hatRecht(sitzung.rolle, "kontakte", "anlegen", sitzung.uebersteuerung)) redirect("/kontakte");

  return (
    <>
      <Seitenkopf
        titel="Neuer Kontakt"
        beschreibung="Eine Person kann mehrere Rollen gleichzeitig haben."
      />
      <KontaktFormular />
    </>
  );
}
