import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChecklisteDetail, type Bezugslink } from "@/components/checklisten/ChecklisteDetail";
import { Seitenkopf } from "@/components/Seitenkopf";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { BEREICHE, type Checkliste, type Punkt } from "@/lib/checklisten";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Checkliste" };

export default async function ChecklisteSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const { data } = await supabase.from("checklisten").select("*, objekt:objekte(id, objektnummer, bezeichnung), kontakt:kontakte(id, vorname, nachname), lead:akquise_leads(id, titel), vertrag:vertraege(id, titel)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as unknown as Checkliste & { objekt: { id: string; objektnummer: string; bezeichnung: string } | null; kontakt: { id: string; vorname: string | null; nachname: string | null } | null; lead: { id: string; titel: string } | null; vertrag: { id: string; titel: string } | null };
  const { data: punkte } = await supabase.from("checklisten_punkte").select("*").eq("checkliste_id", id).order("sortierung");
  const bezuege: Bezugslink[] = [];
  if (c.objekt) bezuege.push({ art: "Objekt", bezeichnung: `${c.objekt.objektnummer} · ${c.objekt.bezeichnung}`, pfad: `/objekte/${c.objekt.id}` });
  if (c.kontakt) bezuege.push({ art: "Kontakt", bezeichnung: [c.kontakt.vorname, c.kontakt.nachname].filter(Boolean).join(" "), pfad: `/kontakte/${c.kontakt.id}` });
  if (c.lead) bezuege.push({ art: "Lead", bezeichnung: c.lead.titel, pfad: `/akquise/leads/${c.lead.id}` });
  if (c.vertrag) bezuege.push({ art: "Vertrag", bezeichnung: c.vertrag.titel, pfad: `/vertraege/${c.vertrag.id}` });
  return (
    <>
      <Seitenkopf titel={c.name} beschreibung={BEREICHE[c.bereich]}>
        <Link href="/checklisten" className="text-[13px] text-akzent hover:underline">Zu den Checklisten</Link>
      </Seitenkopf>
      <ChecklisteDetail checkliste={c} punkte={(punkte ?? []) as Punkt[]} bezuege={bezuege} heute={new Date().toISOString().slice(0, 10)} darfAendern={hatRecht(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung)} darfLoeschen={hatRecht(sitzung.rolle, "kalender", "loeschen", sitzung.uebersteuerung)} />
    </>
  );
}
