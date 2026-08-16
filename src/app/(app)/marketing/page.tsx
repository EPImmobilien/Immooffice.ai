import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { FORMATE } from "@/lib/marketing/vorlagen";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Marketing" };

export default async function MarketingSeite({
  searchParams,
}: {
  searchParams: Promise<{ objekt?: string }>;
}) {
  await sitzungErzwingen();
  const { objekt: gewaehlt } = await searchParams;
  const supabase = await serverClient();

  const { data: objekte } = await supabase
    .from("objekte")
    .select("id, objektnummer, bezeichnung, titel")
    .is("geloescht_am", null)
    .order("geaendert_am", { ascending: false });

  const liste = objekte ?? [];
  const aktiv = gewaehlt ?? liste[0]?.id;

  return (
    <>
      <Seitenkopf
        titel="Marketing"
        beschreibung="Motive entstehen aus den Objektdaten und Ihrem Branding — ohne Gestaltungsaufwand."
      />

      {liste.length === 0 ? (
        <Karte>
          <KarteInhalt className="py-14 text-center">
            <p className="text-sm font-medium text-text">Noch keine Objekte</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-gedaempft">
              Marketingmaterial entsteht aus einem Objekt. Legen Sie zuerst eines an.
            </p>
            <Link href="/objekte/neu" className={buttonKlassen({ className: "mt-5" })}>
              Objekt anlegen
            </Link>
          </KarteInhalt>
        </Karte>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {liste.slice(0, 8).map((o) => (
              <Link
                key={o.id}
                href={`/marketing?objekt=${o.id}`}
                className={buttonKlassen({
                  variante: o.id === aktiv ? "primaer" : "sekundaer",
                  groesse: "klein",
                })}
              >
                {o.objektnummer} · {(o.titel || o.bezeichnung).slice(0, 34)}
              </Link>
            ))}
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FORMATE.map((format) => (
              <Karte key={format.schluessel}>
                <div className="flex items-center justify-center border-b border-linie bg-flaeche-gedaempft p-5">
                  {/* Das Motiv wird serverseitig erzeugt und hier eingebettet. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/marketing/${aktiv}/${format.schluessel}`}
                    alt={`Vorschau ${format.name}`}
                    className="max-h-56 w-auto rounded-[var(--radius-klein)] shadow-[var(--schatten)]"
                    style={{
                      aspectRatio: `${format.breite} / ${format.hoehe}`,
                    }}
                  />
                </div>
                <KarteInhalt>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-titel text-[15px] font-semibold">
                        {format.name}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-gedaempft">
                        {format.hinweis}
                      </p>
                    </div>
                    <span className="zahl shrink-0 text-[11px] text-gedaempft">
                      {format.verhaeltnis}
                    </span>
                  </div>
                  <a
                    href={`/api/marketing/${aktiv}/${format.schluessel}`}
                    download={`${format.schluessel}.svg`}
                    className={buttonKlassen({
                      variante: "sekundaer",
                      groesse: "klein",
                      className: "mt-4 w-full",
                    })}
                  >
                    Herunterladen
                  </a>
                </KarteInhalt>
              </Karte>
            ))}
          </div>

          <Hinweis ton="info" className="mt-6">
            Die Motive entstehen nach festen Regeln aus Objektdaten und Branding —
            deshalb sitzen Preis und Eckdaten immer richtig. Das kostet keine
            Credits. Ein Bildmodell erzeugt später die Bildinhalte, nicht das
            Layout: Abschnitt 12 schließt die Erzeugung kompletter Designs mit
            eingebettetem Text bewusst aus.
          </Hinweis>
        </>
      )}
    </>
  );
}
