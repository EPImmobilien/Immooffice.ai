import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";

import { ObjektFormular } from "../ObjektFormular";

export const metadata: Metadata = { title: "Neues Objekt" };

export default async function NeuesObjektSeite() {
  const sitzung = await sitzungErzwingen();

  // Auch die Seite selbst prueft — nicht nur die Server Action.
  if (!hatRecht(sitzung.rolle, "objekte", "anlegen")) redirect("/objekte");

  return (
    <>
      <Seitenkopf
        titel="Neues Objekt"
        beschreibung="Die Felder richten sich nach Objektkategorie und Vermarktungsart."
      />
      <ObjektFormular />
    </>
  );
}
