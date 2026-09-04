import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { WohnflaechenRechner } from "@/components/werkzeuge/WohnflaechenRechner";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { blattLesen } from "@/lib/werkzeuge/wohnflaeche";

export const metadata: Metadata = { title: "Wohnflächenberechnung" };

export default async function WohnflaecheDetailSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: b }, { data: objekte }] = await Promise.all([
    supabase.from("wohnflaechen_berechnungen").select("id, objekt_id, bezeichnung, blatt, uebernommen_am").eq("id", id).maybeSingle(),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
  ]);
  if (!b) notFound();
  return (
    <>
      <Seitenkopf titel={b.bezeichnung as string} beschreibung="Wohnflächenberechnung nach WoFlV">
        <Link href="/werkzeuge/wohnflaeche" className="text-[13px] text-akzent hover:underline">Alle Berechnungen</Link>
      </Seitenkopf>
      <WohnflaechenRechner key={id} id={id} start={blattLesen(b.blatt)} objekte={(objekte ?? []).map((x) => ({ id: x.id as string, bezeichnung: `${x.objektnummer as string} · ${x.bezeichnung as string}` }))} objektId={(b.objekt_id as string | null) ?? null} uebernommenAm={(b.uebernommen_am as string | null) ?? null} />
    </>
  );
}
