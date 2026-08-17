import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { buttonKlassen } from "@/components/ui/Button";
import { Karte, KarteInhalt } from "@/components/ui/Karte";
import { Marke } from "@/components/ui/Status";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { adresse, euro, flaeche, zahl } from "@/lib/format";
import {
  OBJEKTKATEGORIEN,
  OBJEKTSTATUS,
  istMiete,
  statusTon,
} from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Objekte" };

export default async function ObjekteSeite() {
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  // Kein Filter auf mandant_id noetig — die RLS-Policy beschraenkt bereits auf
  // den eigenen Mandanten. Der Filter auf geloescht_am bleibt fachlich.
  const { data: objekte } = await supabase
    .from("objekte")
    // Muss EIN Zeichenkettenliteral bleiben: supabase-js wertet die Spaltenliste
    // auf Typebene aus. Eine zusammengesetzte Zeichenkette kann es nicht lesen
    // und liefert dann einen Fehlertyp statt der Zeilenform.
    .select(
      "id, objektnummer, bezeichnung, titel, objektkategorie, vermarktungsart, status, strasse, hausnummer, plz, ort, wohnflaeche, zimmer, kaufpreis, kaltmiete",
    )
    .is("geloescht_am", null)
    .order("erstellt_am", { ascending: false });

  const darfAnlegen = hatRecht(sitzung.rolle, "objekte", "anlegen", sitzung.uebersteuerung);
  const liste = objekte ?? [];

  return (
    <>
      <Seitenkopf
        titel="Objekte"
        beschreibung={
          liste.length === 1 ? "1 Objekt" : `${liste.length} Objekte`
        }
      >
        {darfAnlegen && (
          <Link href="/objekte/neu" className={buttonKlassen()}>
            Objekt anlegen
          </Link>
        )}
      </Seitenkopf>

      {liste.length === 0 ? (
        <Karte>
          <KarteInhalt className="py-14 text-center">
            <p className="text-sm font-medium text-text">
              Noch keine Objekte angelegt
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-gedaempft">
              Legen Sie Ihr erstes Objekt an. Anschließend können Sie daraus ein
              Exposé mit KI-Texten erzeugen.
            </p>
            {darfAnlegen && (
              <Link
                href="/objekte/neu"
                className={buttonKlassen({ className: "mt-5" })}
              >
                Erstes Objekt anlegen
              </Link>
            )}
          </KarteInhalt>
        </Karte>
      ) : (
        <div className="space-y-2">
          {liste.map((objekt) => (
            <Link
              key={objekt.id}
              href={`/objekte/${objekt.id}`}
              className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4 transition-colors hover:border-akzent/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="zahl text-[11px] text-gedaempft">
                      {objekt.objektnummer}
                    </span>
                    <Marke
                      ton={statusTon(
                        objekt.status as keyof typeof OBJEKTSTATUS,
                      )}
                    >
                      {OBJEKTSTATUS[objekt.status as keyof typeof OBJEKTSTATUS]}
                    </Marke>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-text">
                    {objekt.titel || objekt.bezeichnung}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-gedaempft">
                    {
                      OBJEKTKATEGORIEN[
                        objekt.objektkategorie as keyof typeof OBJEKTKATEGORIEN
                      ]
                    }{" "}
                    · {adresse(objekt)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="zahl text-sm font-semibold text-text">
                    {istMiete(objekt.vermarktungsart)
                      ? `${euro(objekt.kaltmiete)} / Monat`
                      : euro(objekt.kaufpreis)}
                  </p>
                  <p className="zahl mt-0.5 text-[13px] text-gedaempft">
                    {flaeche(objekt.wohnflaeche)}
                    {objekt.zimmer ? ` · ${zahl(objekt.zimmer)} Zi.` : ""}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
