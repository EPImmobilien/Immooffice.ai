import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Marke } from "@/components/ui/Status";
import { AnfrageDetail } from "@/components/vermietung/AnfrageDetail";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { ANFRAGE_STATUS, anfrageName, STANDARD_VORLAGEN, type AnfrageZeile, type Antwortvorlage } from "@/lib/vermietung/anfragen";

export const metadata: Metadata = { title: "Mietanfrage" };

export default async function AnfrageSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kontakte", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const { data } = await supabase.from("mietanfragen").select("*, objekt_ref:objekte(id, objektnummer, bezeichnung, titel, kaltmiete)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const [{ data: objekte }, { data: vorlagen }, { data: postfaecher }] = await Promise.all([
    supabase.from("objekte").select("id, objektnummer, bezeichnung, kaltmiete").is("geloescht_am", null).eq("vermarktungsart", "miete").order("objektnummer").limit(300),
    supabase.from("antwortvorlagen").select("schluessel, bezeichnung, betreff, text, mit_termin"),
    supabase.from("postfaecher").select("id, adresse, anzeigename").eq("status", "aktiv").order("erstellt_am"),
  ]);
  const a = data as unknown as AnfrageZeile & { objekt_ref: { id: string; objektnummer: string; bezeichnung: string; titel: string | null; kaltmiete: number | null } | null };

  return (
    <>
      <Seitenkopf titel={anfrageName(a) || a.email || "Mietanfrage"} beschreibung={a.objekt_ref ? `${a.objekt_ref.objektnummer} ${a.objekt_ref.titel ?? a.objekt_ref.bezeichnung}` : "Ohne Objektbezug"}>
        <div className="flex items-center gap-2">
          <Marke ton="info">{ANFRAGE_STATUS[a.status]}</Marke>
          <Link href="/vermietung/anfragen" className="text-[13px] text-akzent hover:underline">Zur Übersicht</Link>
        </div>
      </Seitenkopf>
      <AnfrageDetail
        anfrage={a}
        objekte={(objekte ?? []) as { id: string; objektnummer: string; bezeichnung: string; kaltmiete: number | null }[]}
        vorlagen={STANDARD_VORLAGEN.map((v) => ((vorlagen ?? []) as Antwortvorlage[]).find((e) => e.schluessel === v.schluessel) ?? v)}
        postfaecher={(postfaecher ?? []) as { id: string; adresse: string; anzeigename: string | null }[]}
        darfAendern={hatRecht(sitzung.rolle, "kontakte", "aendern", sitzung.uebersteuerung)}
        darfVertrag={hatRecht(sitzung.rolle, "vertraege", "anlegen", sitzung.uebersteuerung)}
        darfSenden={hatRecht(sitzung.rolle, "postfach", "anlegen", sitzung.uebersteuerung)}
      />
    </>
  );
}
