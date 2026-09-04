import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { GrundrissEditor } from "@/components/werkzeuge/GrundrissEditor";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { DOKUMENT_BUCKET } from "@/lib/dokumente";
import { serverClient } from "@/lib/supabase/server";
import { grundrissLesen } from "@/lib/werkzeuge/grundriss";

export const metadata: Metadata = { title: "Grundriss" };

export default async function GrundrissDetailSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "objekte", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: g }, { data: objekte }] = await Promise.all([
    supabase.from("grundrisse").select("id, objekt_id, bezeichnung, quelle, daten, vorlage_pfad").eq("id", id).maybeSingle(),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
  ]);
  if (!g) notFound();
  let vorlageUrl: string | null = null;
  if (g.vorlage_pfad) {
    const { data } = await supabase.storage.from(DOKUMENT_BUCKET).createSignedUrl(g.vorlage_pfad as string, 3600).catch(() => ({ data: null }));
    vorlageUrl = data?.signedUrl ?? null;
  }
  const start = grundrissLesen(g.daten);
  start.titel = g.bezeichnung as string;
  return (
    <>
      <Seitenkopf titel={g.bezeichnung as string} beschreibung="Grundriss bearbeiten">
        <Link href="/werkzeuge/grundriss" className="text-[13px] text-akzent hover:underline">Alle Grundrisse</Link>
      </Seitenkopf>
      <GrundrissEditor key={id} id={id} start={start} objekte={(objekte ?? []).map((x) => ({ id: x.id as string, bezeichnung: `${x.objektnummer as string} · ${x.bezeichnung as string}` }))} objektId={(g.objekt_id as string | null) ?? null} vorlageUrl={vorlageUrl} vorlagePfad={(g.vorlage_pfad as string | null) ?? null} quelle={g.quelle as "editor" | "scan" | "aufbereitet"} />
    </>
  );
}
