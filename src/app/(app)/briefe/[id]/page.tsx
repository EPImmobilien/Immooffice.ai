import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BriefFormular } from "@/components/briefe/BriefFormular";
import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import type { Brief } from "@/lib/rechnungen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Brief" };

export default async function BriefSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "rechnungen", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: b }, { data: absender }, { data: objekte }, { data: kontakte }] = await Promise.all([
    supabase.from("briefe").select("*").eq("id", id).maybeSingle(),
    supabase.from("rechnungs_absender").select("id, name").eq("aktiv", true).order("typ").order("sortierung"),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
    supabase.from("kontakte").select("id, vorname, nachname, firma").is("geloescht_am", null).order("nachname").limit(500),
  ]);
  if (!b) notFound();
  const brief = b as unknown as Brief;
  return (
    <>
      <Seitenkopf titel={brief.betreff} beschreibung={`An ${brief.empfaenger_name}`}>
        <Link href="/briefe" className="text-[13px] text-akzent hover:underline">Zur Übersicht</Link>
      </Seitenkopf>
      <BriefFormular
        key={id}
        brief={brief}
        absender={(absender ?? []).map((a) => ({ id: a.id as string, name: a.name as string }))}
        objekte={(objekte ?? []).map((o) => ({ id: o.id as string, bezeichnung: `${o.objektnummer as string} · ${o.bezeichnung as string}` }))}
        kontakte={(kontakte ?? []).map((k) => ({ id: k.id as string, bezeichnung: [k.vorname, k.nachname].filter(Boolean).join(" ") + (k.firma ? ` (${k.firma as string})` : "") }))}
        darfAendern={hatRecht(sitzung.rolle, "rechnungen", "aendern", sitzung.uebersteuerung)}
        darfLoeschen={hatRecht(sitzung.rolle, "rechnungen", "loeschen", sitzung.uebersteuerung)}
      />
    </>
  );
}
