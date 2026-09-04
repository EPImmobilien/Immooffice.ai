import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { WohnflaechenRechner } from "@/components/werkzeuge/WohnflaechenRechner";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { leeresBlatt, m2 } from "@/lib/werkzeuge/wohnflaeche";

export const metadata: Metadata = { title: "Wohnflächenrechner" };

export default async function WohnflaecheSeite({ searchParams }: { searchParams: Promise<{ objekt?: string }> }) {
  const [p, sitzung] = await Promise.all([searchParams, sitzungErzwingen()]);
  rechtErzwingen(sitzung.rolle, "objekte", "lesen", sitzung.uebersteuerung);
  const supabase = await serverClient();
  const [{ data: liste }, { data: objekte }] = await Promise.all([
    supabase.from("wohnflaechen_berechnungen").select("id, bezeichnung, wohnflaeche, grundflaeche, uebernommen_am, erstellt_am, objekt:objekte(objektnummer, bezeichnung)").order("erstellt_am", { ascending: false }).limit(100),
    supabase.from("objekte").select("id, objektnummer, bezeichnung, strasse, hausnummer, plz, ort").is("geloescht_am", null).order("objektnummer").limit(500),
  ]);
  const objektId = p.objekt && /^[0-9a-f-]{36}$/.test(p.objekt) ? p.objekt : null;
  const vorgabe = leeresBlatt();
  const o = (objekte ?? []).find((x) => x.id === objektId);
  if (o) { vorgabe.bezeichnung = `${o.objektnummer as string} ${o.bezeichnung as string}`; vorgabe.adresse = [[o.strasse, o.hausnummer].filter(Boolean).join(" "), [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "); }
  return (
    <>
      <Seitenkopf titel="Wohnflächenrechner" beschreibung="Wohnfläche nach Wohnflächenverordnung (WoFlV) mit PDF-Nachweis und Übernahme ins Objekt.">
        <Link href="/werkzeuge" className="text-[13px] text-akzent hover:underline">Alle Werkzeuge</Link>
      </Seitenkopf>
      {(liste ?? []).length > 0 && (
        <Karte className="mb-5">
          <KarteKopf><KarteTitel>Gespeicherte Berechnungen</KarteTitel></KarteKopf>
          <KarteInhalt className="space-y-2">
            {(liste ?? []).map((b) => {
              const ob = b.objekt as unknown as { objektnummer: string; bezeichnung: string } | null;
              return (
                <Link key={b.id as string} href={`/werkzeuge/wohnflaeche/${b.id as string}`} className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-linie bg-hintergrund px-4 py-2 text-[13px] hover:border-akzent/50">
                  <span className="font-medium text-text">{b.bezeichnung as string}</span>
                  {ob && <span className="text-gedaempft">{ob.objektnummer} {ob.bezeichnung}</span>}
                  {b.uebernommen_am && <Marke ton="erfolg">übernommen</Marke>}
                  <span className="ml-auto tabular-nums">{m2(Number(b.wohnflaeche))}</span>
                  <span className="text-gedaempft">{datum(b.erstellt_am as string)}</span>
                </Link>
              );
            })}
          </KarteInhalt>
        </Karte>
      )}
      <Karte className="mb-5">
        <KarteKopf><KarteTitel>Neue Berechnung</KarteTitel><KarteBeschreibung>Räume mit Länge × Breite oder direkter Fläche erfassen; Dachschrägen als eigene Teilflächen. Speichern legt die Berechnung an.</KarteBeschreibung></KarteKopf>
        <KarteInhalt>
          {(objekte ?? []).length === 0 && <Hinweis>Ohne Objekt lässt sich rechnen, aber nicht übernehmen.</Hinweis>}
          <WohnflaechenRechner id={null} start={vorgabe} objekte={(objekte ?? []).map((x) => ({ id: x.id as string, bezeichnung: `${x.objektnummer as string} · ${x.bezeichnung as string}` }))} objektId={objektId} uebernommenAm={null} />
        </KarteInhalt>
      </Karte>
    </>
  );
}
