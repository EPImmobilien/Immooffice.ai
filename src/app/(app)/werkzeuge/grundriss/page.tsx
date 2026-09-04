import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { GrundrissEditor } from "@/components/werkzeuge/GrundrissEditor";
import { Karte, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Marke } from "@/components/ui/Status";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { leererGrundriss } from "@/lib/werkzeuge/grundriss";

export const metadata: Metadata = { title: "Grundriss-Editor" };

const QUELLE = { editor: "gezeichnet", scan: "Raumscan", aufbereitet: "aufbereitet" } as const;

export default async function GrundrissSeite({ searchParams }: { searchParams: Promise<{ objekt?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "objekte", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: liste }, { data: objekte }] = await Promise.all([
    supabase.from("grundrisse").select("id, bezeichnung, quelle, erstellt_am, bild_id, objekt:objekte(objektnummer, bezeichnung)").order("erstellt_am", { ascending: false }).limit(100),
    supabase.from("objekte").select("id, objektnummer, bezeichnung").is("geloescht_am", null).order("objektnummer").limit(500),
  ]);
  const objektId = p.objekt && /^[0-9a-f-]{36}$/.test(p.objekt) ? p.objekt : null;
  return (
    <>
      <Seitenkopf titel="Grundriss-Editor & Aufbereiter" beschreibung="Wände, Türen, Fenster, Räume mit Fläche, Möbel und Maße — neu zeichnen, einen Plan nachzeichnen oder einen Raumscan importieren.">
        <Link href="/werkzeuge" className="text-[13px] text-akzent hover:underline">Alle Werkzeuge</Link>
      </Seitenkopf>
      {(liste ?? []).length > 0 && (
        <Karte className="mb-5">
          <KarteKopf><KarteTitel>Gespeicherte Grundrisse</KarteTitel></KarteKopf>
          <KarteInhalt className="space-y-2">
            {(liste ?? []).map((g) => {
              const ob = g.objekt as unknown as { objektnummer: string; bezeichnung: string } | null;
              return (
                <Link key={g.id as string} href={`/werkzeuge/grundriss/${g.id as string}`} className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-linie bg-hintergrund px-4 py-2 text-[13px] hover:border-akzent/50">
                  <span className="font-medium text-text">{g.bezeichnung as string}</span>
                  <Marke>{QUELLE[g.quelle as keyof typeof QUELLE]}</Marke>
                  {ob && <span className="text-gedaempft">{ob.objektnummer} {ob.bezeichnung}</span>}
                  {g.bild_id && <Marke ton="erfolg">als Objektbild abgelegt</Marke>}
                  <span className="ml-auto text-gedaempft">{datum(g.erstellt_am as string)}</span>
                </Link>
              );
            })}
          </KarteInhalt>
        </Karte>
      )}
      <GrundrissEditor id={null} start={leererGrundriss("Grundriss")} objekte={(objekte ?? []).map((x) => ({ id: x.id as string, bezeichnung: `${x.objektnummer as string} · ${x.bezeichnung as string}` }))} objektId={objektId} vorlageUrl={null} quelle="editor" />
    </>
  );
}
