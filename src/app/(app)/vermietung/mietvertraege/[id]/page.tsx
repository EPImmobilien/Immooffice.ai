import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { MietvertragFormular } from "@/components/vermietung/MietvertragFormular";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { mietvertragAusZeile, type MietvertragStatus } from "@/lib/vermietung/mietvertrag";

export const metadata: Metadata = { title: "Mietvertrag" };

export default async function MietvertragSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "vertraege", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const { data } = await supabase.from("mietvertraege").select("*, objekt_ref:objekte(objektnummer, bezeichnung), anfrage:mietanfragen(id, vorname, nachname)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const m = data as Record<string, unknown> & { status: MietvertragStatus; vertrag_id: string | null; objekt_ref: { objektnummer: string; bezeichnung: string } | null; anfrage: { id: string; vorname: string | null; nachname: string } | null };
  const start = mietvertragAusZeile(m);

  return (
    <>
      <Seitenkopf titel={start.bezeichnung || "Mietvertrag"} beschreibung={[m.objekt_ref ? `${m.objekt_ref.objektnummer} ${m.objekt_ref.bezeichnung}` : "Ohne Objektbezug", m.anfrage ? `aus Anfrage ${[m.anfrage.vorname, m.anfrage.nachname].filter(Boolean).join(" ")}` : null].filter(Boolean).join(" · ")}>
        <div className="flex items-center gap-3 text-[13px]">
          {m.anfrage && <Link href={`/vermietung/anfragen/${m.anfrage.id}`} className="text-akzent hover:underline">Zur Anfrage</Link>}
          <Link href="/vermietung/mietvertraege" className="text-akzent hover:underline">Zur Übersicht</Link>
        </div>
      </Seitenkopf>
      <MietvertragFormular
        key={`${id}-${m.status}`}
        id={id}
        start={start}
        status={m.status}
        vertragId={m.vertrag_id}
        darfAendern={hatRecht(sitzung.rolle, "vertraege", "aendern", sitzung.uebersteuerung)}
        darfFreigeben={hatRecht(sitzung.rolle, "vertraege", "freigeben", sitzung.uebersteuerung)}
        darfLoeschen={hatRecht(sitzung.rolle, "vertraege", "loeschen", sitzung.uebersteuerung)}
      />
    </>
  );
}
