import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { KiKennzeichen, Marke } from "@/components/ui/Status";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Exposés" };

export default async function ExposesSeite() {
  await sitzungErzwingen();
  const supabase = await serverClient();

  const { data: objekte } = await supabase
    .from("objekte")
    .select(
      "id, objektnummer, bezeichnung, titel, beschreibung_objekt, texte_ki_erzeugt, texte_freigegeben_am",
    )
    .is("geloescht_am", null)
    .order("geaendert_am", { ascending: false });

  const liste = objekte ?? [];

  return (
    <>
      <Seitenkopf
        titel="Exposés"
        beschreibung="Je Objekt ein Exposé mit Texten und PDF-Export."
      />

      {liste.length === 0 ? (
        <Karte>
          <KarteInhalt className="py-14 text-center">
            <p className="text-sm font-medium text-text">Noch keine Objekte</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-gedaempft">
              Exposés entstehen aus Objekten. Legen Sie zuerst ein Objekt an.
            </p>
            <Link href="/objekte/neu" className={buttonKlassen({ className: "mt-5" })}>
              Objekt anlegen
            </Link>
          </KarteInhalt>
        </Karte>
      ) : (
        <div className="space-y-2">
          {liste.map((objekt) => (
            <Link
              key={objekt.id}
              href={`/exposes/${objekt.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4 transition-colors hover:border-akzent/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">
                  {objekt.titel || objekt.bezeichnung}
                </p>
                <p className="zahl mt-0.5 text-[12px] text-gedaempft">
                  {objekt.objektnummer}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {objekt.texte_ki_erzeugt && <KiKennzeichen art="erzeugt" />}
                {objekt.texte_freigegeben_am ? (
                  <Marke ton="erfolg">Freigegeben</Marke>
                ) : objekt.beschreibung_objekt ? (
                  <Marke ton="warnung">Nicht freigegeben</Marke>
                ) : (
                  <Marke>Ohne Texte</Marke>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
