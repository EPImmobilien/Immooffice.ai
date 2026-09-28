import type { Metadata } from "next";
import Link from "next/link";

import { Seitenkopf } from "@/components/Seitenkopf";
import { WertermittlungAnlegen } from "@/components/wertermittlung/WertermittlungAnlegen";
import {
  Karte,
  KarteBeschreibung,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { datum } from "@/lib/format";
import { serverClient } from "@/lib/supabase/server";
import { PFLICHTHINWEIS, VERFAHREN, type Verfahren } from "@/lib/wertermittlung";

export const metadata: Metadata = { title: "Wertermittlung" };

const AUSWAHL =
  "id, bezeichnung, stichtag, fuehrendes_verfahren, objekt_id, " +
  "objekt:objekte(objektnummer, bezeichnung), kontakt:kontakte(vorname, nachname, firma)";

interface Zeile {
  id: string;
  bezeichnung: string;
  stichtag: string;
  fuehrendes_verfahren: Verfahren | null;
  objekt_id: string | null;
  objekt: { objektnummer: string; bezeichnung: string } | null;
  kontakt: { vorname: string | null; nachname: string | null; firma: string | null } | null;
}

export default async function WertermittlungSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "wertermittlung", "lesen", sitzung.uebersteuerung);

  const supabase = await serverClient();
  const [liste, objekte, kontakte] = await Promise.all([
    supabase
      .from("wertermittlungen")
      .select(AUSWAHL)
      .order("stichtag", { ascending: false }),
    supabase
      .from("objekte")
      .select("id, objektnummer, bezeichnung")
      .is("geloescht_am", null)
      .order("objektnummer", { ascending: false })
      .limit(300),
    supabase
      .from("kontakte")
      .select("id, vorname, nachname, firma")
      .is("geloescht_am", null)
      .order("nachname", { ascending: true })
      .limit(300),
  ]);

  const zeilen = (liste.data ?? []) as unknown as Zeile[];
  const darfAnlegen = hatRecht(
    sitzung.rolle,
    "wertermittlung",
    "anlegen",
    sitzung.uebersteuerung,
  );

  return (
    <>
      <Seitenkopf
        titel="Wertermittlung"
        beschreibung="Offene Rechenblätter nach den drei Verfahren der ImmoWertV — als Akquiseinstrument beim Eigentümer."
      />

      <Hinweis ton="warnung" className="mb-5" titel="Was diese Rechnung ist">
        {PFLICHTHINWEIS} Alle Ansätze wählen Sie selbst und verantworten Sie
        selbst; ImmoOffice.ai schätzt nichts und beschafft keine Marktdaten.
      </Hinweis>

      {darfAnlegen && (
        <div className="mb-5">
          <WertermittlungAnlegen
            objekte={(objekte.data ?? []).map((o) => ({
              id: o.id,
              name: `${o.objektnummer} ${o.bezeichnung}`,
            }))}
            kontakte={(kontakte.data ?? []).map((k) => ({
              id: k.id,
              name:
                [k.vorname, k.nachname].filter(Boolean).join(" ") ||
                k.firma ||
                "Ohne Namen",
            }))}
          />
        </div>
      )}

      {zeilen.length === 0 ? (
        <Karte>
          <KarteKopf>
            <KarteTitel>Noch keine Wertermittlung</KarteTitel>
            <KarteBeschreibung>
              Ein Rechenblatt lässt sich zu einem Objekt anlegen — oder ohne
              Objekt, wenn es noch keinen Auftrag gibt. Genau dann wird es als
              Akquiseinstrument gebraucht.
            </KarteBeschreibung>
          </KarteKopf>
        </Karte>
      ) : (
        <div className="space-y-2">
          {zeilen.map((zeile) => {
            const name = zeile.kontakt
              ? [zeile.kontakt.vorname, zeile.kontakt.nachname]
                  .filter(Boolean)
                  .join(" ") || zeile.kontakt.firma
              : null;

            return (
              <Link
                key={zeile.id}
                href={`/wertermittlung/${zeile.id}`}
                className="block rounded-[var(--radius-gross)] border border-linie bg-flaeche px-5 py-4 transition-colors hover:border-akzent/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-text">
                        {zeile.bezeichnung}
                      </p>
                      {zeile.fuehrendes_verfahren ? (
                        <Marke ton="akzent">
                          {VERFAHREN[zeile.fuehrendes_verfahren]}
                        </Marke>
                      ) : (
                        <Marke>Verfahren noch offen</Marke>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-gedaempft">
                      {[
                        `Stichtag ${datum(zeile.stichtag)}`,
                        zeile.objekt
                          ? `${zeile.objekt.objektnummer} ${zeile.objekt.bezeichnung}`
                          : null,
                        name,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
