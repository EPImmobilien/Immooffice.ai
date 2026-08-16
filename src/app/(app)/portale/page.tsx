import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { exportMoeglich, exportPruefen } from "@/lib/openimmo/pruefung";
import type { OpenImmoObjekt } from "@/lib/openimmo/typen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Portalexport" };

export default async function PortaleSeite() {
  await sitzungErzwingen();
  const supabase = await serverClient();

  const { data: objekte } = await supabase
    .from("objekte")
    .select("*")
    .is("geloescht_am", null)
    .order("geaendert_am", { ascending: false });

  const liste = (objekte ?? []).map((o) => {
    const befunde = exportPruefen(o as OpenImmoObjekt);
    return {
      objekt: o,
      befunde,
      bereit: exportMoeglich(befunde),
      fehler: befunde.filter((b) => b.schwere === "fehler").length,
    };
  });

  const bereit = liste.filter((e) => e.bereit).length;

  return (
    <>
      <Seitenkopf
        titel="Portalexport"
        beschreibung={`${bereit} von ${liste.length} Objekten übertragungsbereit`}
      />

      <Hinweis ton="info" className="mb-6">
        Der Export erzeugt OpenImmo 1.2.7 für ImmoScout24, Immowelt und
        Kleinanzeigen. Die Prüfung läuft vor der Erzeugung — fehlende
        Pflichtangaben führen so zu einem Hinweis hier statt zu einer Ablehnung
        durch das Portal. Der produktive Übertragungsweg folgt in Phase 2.
      </Hinweis>

      {liste.length === 0 ? (
        <Karte>
          <KarteInhalt className="py-14 text-center">
            <p className="text-sm font-medium text-text">Noch keine Objekte</p>
            <Link href="/objekte/neu" className={buttonKlassen({ className: "mt-5" })}>
              Objekt anlegen
            </Link>
          </KarteInhalt>
        </Karte>
      ) : (
        <div className="space-y-2">
          {liste.map(({ objekt, bereit: ok, fehler }) => (
            <div
              key={objekt.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/objekte/${objekt.id}`}
                  className="truncate text-sm font-medium text-text hover:text-akzent"
                >
                  {objekt.titel || objekt.bezeichnung}
                </Link>
                <p className="zahl mt-0.5 text-[12px] text-gedaempft">
                  {objekt.objektnummer}
                  {objekt.ort ? ` · ${objekt.ort}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {ok ? (
                  <Marke ton="erfolg">Bereit</Marke>
                ) : (
                  <Marke ton="warnung">
                    {fehler} {fehler === 1 ? "Angabe fehlt" : "Angaben fehlen"}
                  </Marke>
                )}
                <a
                  href={`/api/openimmo/${objekt.id}`}
                  download
                  className={buttonKlassen({
                    variante: ok ? "primaer" : "sekundaer",
                    groesse: "klein",
                  })}
                >
                  XML
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
