import type { Metadata } from "next";
import Link from "next/link";

import { RadarWerkzeuge } from "@/components/akquise/RadarWerkzeuge";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Hinweis } from "@/components/ui/Status";
import { RADAR_STATUS, type RadarStatus, type RadarZeile } from "@/lib/akquise/stammdaten";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Akquise-Radar" };

export default async function RadarSeite({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "akquise", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  let abfrage = supabase.from("akquise_radar").select("*").order("erstellt_am", { ascending: false }).limit(300);
  if (p.status && p.status in RADAR_STATUS) abfrage = abfrage.eq("status", p.status);
  const { data } = await abfrage;
  return (
    <>
      <Seitenkopf titel="Akquise-Radar" beschreibung="Privatinserate im Blick behalten und als Lead übernehmen. Erfassung von Hand oder über die Schnittstelle — kein automatisches Auslesen fremder Portale.">
        <Link href="/akquise" className="text-[13px] text-akzent hover:underline">Zur Akquise</Link>
      </Seitenkopf>
      <Hinweis ton="warnung" className="mb-4">Rechtlicher Hinweis: Das automatisierte Auslesen von Immobilienportalen verstößt in der Regel gegen deren Nutzungsbedingungen und ist urheber- und wettbewerbsrechtlich nicht geklärt; die Ansprache von Privatanbietern unterliegt § 7 UWG. Deshalb bleibt das Radar eine manuelle Sammlung (siehe docs/BLOCKER.md).</Hinweis>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/akquise/radar" className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${!p.status ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>Alle</Link>
        {(Object.keys(RADAR_STATUS) as RadarStatus[]).map((s) => <Link key={s} href={`/akquise/radar?status=${s}`} className={`rounded-[var(--radius)] border px-3 py-1 text-[12px] ${p.status === s ? "border-akzent bg-akzent-schwach text-akzent" : "border-linie bg-flaeche text-gedaempft"}`}>{RADAR_STATUS[s]}</Link>)}
      </div>
      <RadarWerkzeuge
        zeilen={((data ?? []) as RadarZeile[]).map((r) => ({ ...r, wohnflaeche: r.wohnflaeche === null ? null : Number(r.wohnflaeche), preis: r.preis === null ? null : Number(r.preis) }))}
        darfAnlegen={hatRecht(sitzung.rolle, "akquise", "anlegen", sitzung.uebersteuerung)}
        darfAendern={hatRecht(sitzung.rolle, "akquise", "aendern", sitzung.uebersteuerung)}
      />
    </>
  );
}
