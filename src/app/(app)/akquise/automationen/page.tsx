import type { Metadata } from "next";
import Link from "next/link";

import { AutomationenVerwaltung, type LaufZeile } from "@/components/akquise/AutomationenVerwaltung";
import { Seitenkopf } from "@/components/Seitenkopf";
import type { Automation, Pipeline, Quelle, Stufe, Vorlage } from "@/lib/akquise/stammdaten";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";
import { akquiseVorbereiten } from "@/server/akquise-aktionen";

export const metadata: Metadata = { title: "Automationen" };

export default async function AutomationenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "akquise", "lesen", sitzung.uebersteuerung);
  await akquiseVorbereiten();
  const supabase = await serverClient();
  const [{ data: pipelines }, { data: stufen }, { data: quellen }, { data: vorlagen }, { data: automationen }, { data: laeufe }] = await Promise.all([
    supabase.from("akquise_pipelines").select("id, name, beschreibung, ist_standard, sortierung").order("sortierung"),
    supabase.from("akquise_stufen").select("id, pipeline_id, name, zusatz, sortierung, wahrscheinlichkeit, ist_gewonnen, ist_verloren").order("sortierung"),
    supabase.from("akquise_quellen").select("id, name, art, kampagne_id, pipeline_id, sortierung, aktiv").order("sortierung"),
    supabase.from("akquise_vorlagen").select("id, name, kanal, betreff, text, aktiv").order("name"),
    supabase.from("akquise_automationen").select("id, name, pipeline_id, stufe_id, quelle_id, kanal, vorlage_id, verzoegerung_stunden, aktiv").order("erstellt_am"),
    supabase.from("akquise_laeufe").select("id, geplant_am, status, fehler, ausgefuehrt_am, automation:akquise_automationen(name, kanal), lead:akquise_leads(id, titel)").order("geplant_am", { ascending: false }).limit(300),
  ]);
  return (
    <>
      <Seitenkopf titel="Automationen" beschreibung="Matrix aus Pipeline, Stufe und Quelle: Beim Eintritt in eine Stufe entsteht nach Verzögerung eine Aufgabe oder ein Mail-Entwurf aus der Vorlage.">
        <Link href="/akquise" className="text-[13px] text-akzent hover:underline">Zur Akquise</Link>
      </Seitenkopf>
      <AutomationenVerwaltung
        pipelines={(pipelines ?? []) as Pipeline[]}
        stufen={(stufen ?? []) as Stufe[]}
        quellen={(quellen ?? []) as Quelle[]}
        vorlagen={(vorlagen ?? []) as Vorlage[]}
        automationen={(automationen ?? []) as Automation[]}
        laeufe={(laeufe ?? []) as unknown as LaufZeile[]}
        darfVerwalten={hatRecht(sitzung.rolle, "akquise", "freigeben", sitzung.uebersteuerung)}
        darfAendern={hatRecht(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung)}
      />
    </>
  );
}
