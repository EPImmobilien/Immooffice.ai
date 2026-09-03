import type { Metadata } from "next";
import Link from "next/link";

import { AkquiseEinstellungen } from "@/components/akquise/AkquiseEinstellungen";
import { Seitenkopf } from "@/components/Seitenkopf";
import type { Pipeline, Stufe } from "@/lib/akquise/stammdaten";
import { akquiseEinstellungenLaden } from "@/lib/akquise/vergleichswerte";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { akquiseVorbereiten } from "@/server/akquise-aktionen";

export const metadata: Metadata = { title: "Akquise-Einstellungen" };

export default async function AkquiseEinstellungenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "lesen", sitzung.uebersteuerung);
  await akquiseVorbereiten();
  const supabase = await serverClient();
  const [{ data: pipelines }, { data: stufen }, { data: leads }, einst] = await Promise.all([
    supabase.from("akquise_pipelines").select("id, name, beschreibung, ist_standard, sortierung").order("sortierung"),
    supabase.from("akquise_stufen").select("id, pipeline_id, name, zusatz, sortierung, wahrscheinlichkeit, ist_gewonnen, ist_verloren").order("sortierung"),
    supabase.from("akquise_leads").select("stufe_id").limit(5000),
    akquiseEinstellungenLaden(supabase),
  ]);
  const jeStufe: Record<string, number> = {};
  for (const l of (leads ?? []) as Array<{ stufe_id: string }>) jeStufe[l.stufe_id] = (jeStufe[l.stufe_id] ?? 0) + 1;
  return (
    <>
      <Seitenkopf titel="Akquise-Einstellungen" beschreibung="Pipelines und Stufen mit Wahrscheinlichkeiten, Verlustgründe, Preis-Finder-Vorgaben und Nachfassfrist.">
        <Link href="/akquise" className="text-[13px] text-akzent hover:underline">Zur Akquise</Link>
      </Seitenkopf>
      <AkquiseEinstellungen pipelines={(pipelines ?? []) as Pipeline[]} stufen={(stufen ?? []) as Stufe[]} einstellungen={einst} leadsJeStufe={jeStufe} darfVerwalten={hatRecht(sitzung.rolle, "akquise", "freigeben", sitzung.uebersteuerung)} />
    </>
  );
}
