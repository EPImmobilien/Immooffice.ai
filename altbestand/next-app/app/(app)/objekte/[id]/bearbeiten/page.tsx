import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

import { ObjektFormular } from "../../ObjektFormular";

export const metadata: Metadata = { title: "Objekt bearbeiten" };

export default async function ObjektBearbeitenSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();

  if (!hatRecht(sitzung.rolle, "objekte", "aendern", sitzung.uebersteuerung)) redirect(`/objekte/${id}`);

  const supabase = await serverClient();
  const { data: objekt } = await supabase
    .from("objekte")
    .select("*")
    .eq("id", id)
    .is("geloescht_am", null)
    .maybeSingle();

  if (!objekt) notFound();

  return (
    <>
      <Seitenkopf
        titel="Objekt bearbeiten"
        beschreibung={`${objekt.objektnummer} · ${objekt.bezeichnung}`}
      />
      <ObjektFormular objekt={objekt} />
    </>
  );
}
