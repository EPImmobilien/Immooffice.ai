import type { Metadata } from "next";
import Link from "next/link";

import { KampagnenVerwaltung } from "@/components/akquise/KampagnenVerwaltung";
import { Seitenkopf } from "@/components/Seitenkopf";
import type { Kampagne, Pipeline, Quelle } from "@/lib/akquise/stammdaten";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { akquiseVorbereiten } from "@/server/akquise-aktionen";

export const metadata: Metadata = { title: "Kampagnen und Quellen" };

export default async function KampagnenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "lesen", sitzung.uebersteuerung);
  await akquiseVorbereiten();
  const supabase = await serverClient();
  const [{ data: kampagnen }, { data: quellen }, { data: pipelines }, { data: leads }] = await Promise.all([
    supabase.from("akquise_kampagnen").select("id, name, art, kanal, budget, ausgaben, beginn, ende, notiz, aktiv").order("aktiv", { ascending: false }).order("name"),
    supabase.from("akquise_quellen").select("id, name, art, kampagne_id, pipeline_id, sortierung, aktiv").order("sortierung"),
    supabase.from("akquise_pipelines").select("id, name, beschreibung, ist_standard, sortierung").order("sortierung"),
    supabase.from("akquise_leads").select("quelle_id, kampagne_id").limit(5000),
  ]);
  const jeQuelle: Record<string, number> = {};
  const jeKampagne: Record<string, number> = {};
  for (const l of (leads ?? []) as Array<{ quelle_id: string | null; kampagne_id: string | null }>) {
    if (l.quelle_id) jeQuelle[l.quelle_id] = (jeQuelle[l.quelle_id] ?? 0) + 1;
    if (l.kampagne_id) jeKampagne[l.kampagne_id] = (jeKampagne[l.kampagne_id] ?? 0) + 1;
  }
  return (
    <>
      <Seitenkopf titel="Kampagnen und Quellen" beschreibung="Woher Leads kommen und was sie kosten — Grundlage für Kosten je Lead, Kosten je Abschluss und ROAS.">
        <Link href="/akquise" className="text-[13px] text-akzent hover:underline">Zur Akquise</Link>
      </Seitenkopf>
      <KampagnenVerwaltung
        kampagnen={((kampagnen ?? []) as Kampagne[]).map((k) => ({ ...k, budget: k.budget === null ? null : Number(k.budget), ausgaben: Number(k.ausgaben) }))}
        quellen={(quellen ?? []) as Quelle[]}
        pipelines={(pipelines ?? []) as Pipeline[]}
        leadsJeQuelle={jeQuelle}
        leadsJeKampagne={jeKampagne}
        darfAendern={hatRecht(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung)}
        darfLoeschen={hatRecht(sitzung.rolle, "akquise", "loeschen", sitzung.uebersteuerung)}
      />
    </>
  );
}
