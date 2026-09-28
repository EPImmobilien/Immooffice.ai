import { BildUpload } from "@/components/BildUpload";
import { Button } from "@/components/ui/Button";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { KiKennzeichen, Marke } from "@/components/ui/Status";
import { BILDARTEN, BILD_BUCKET, type ObjektBild } from "@/lib/bilder";
import { serverClient } from "@/lib/supabase/server";
import {
  bildLoeschen,
  bildVerschieben,
  titelbildSetzen,
} from "@/server/bild-aktionen";

/**
 * Bilder eines Objekts.
 *
 * Die Vorschau laeuft ueber kurzlebige signierte Verweise. Der Bucket ist
 * bewusst nicht oeffentlich: Ein oeffentlicher Bucket wuerde jedes Bild jedes
 * Mandanten fuer jeden erratbaren Pfad zugaenglich machen.
 */
export async function Bildergalerie({
  objektId,
  mandantId,
  darfAendern,
}: {
  objektId: string;
  mandantId: string;
  darfAendern: boolean;
}) {
  const supabase = await serverClient();

  const { data } = await supabase
    .from("objekt_bilder")
    .select(
      "id, pfad, art, titel, reihenfolge, ist_titelbild, original_id, bearbeitung, ki_bearbeitet, mime",
    )
    .eq("objekt_id", objektId)
    .order("ist_titelbild", { ascending: false })
    .order("reihenfolge", { ascending: true });

  const bilder = (data ?? []) as ObjektBild[];

  const verweise = new Map<string, string>();
  if (bilder.length > 0) {
    const { data: signiert } = await supabase.storage
      .from(BILD_BUCKET)
      .createSignedUrls(
        bilder.map((b) => b.pfad),
        60 * 30,
      );
    for (const eintrag of signiert ?? []) {
      if (eintrag.signedUrl && eintrag.path) {
        verweise.set(eintrag.path, eintrag.signedUrl);
      }
    }
  }

  // Bearbeitungen stehen bei ihrem Original, nicht als eigene Kachel.
  const originale = bilder.filter((b) => b.original_id === null);
  const versionen = new Map<string, ObjektBild[]>();
  for (const bild of bilder) {
    if (!bild.original_id) continue;
    versionen.set(bild.original_id, [
      ...(versionen.get(bild.original_id) ?? []),
      bild,
    ]);
  }

  return (
    <Karte>
      <KarteKopf>
        <KarteTitel>Bilder</KarteTitel>
        <KarteBeschreibung>
          {originale.length === 0
            ? "Noch keine Bilder hinterlegt"
            : `${originale.length} ${originale.length === 1 ? "Bild" : "Bilder"} · das Titelbild führt Exposé und Portalexport an`}
        </KarteBeschreibung>
      </KarteKopf>

      <KarteInhalt className="space-y-5">
        {darfAendern && (
          <BildUpload objektId={objektId} mandantId={mandantId} />
        )}

        {originale.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {originale.map((bild, i) => {
              const bearbeitet = versionen.get(bild.id) ?? [];
              const anzeige = bearbeitet.at(-1) ?? bild;
              const verweis = verweise.get(anzeige.pfad);

              return (
                <li
                  key={bild.id}
                  className="overflow-hidden rounded-[var(--radius)] border border-linie bg-flaeche"
                >
                  <div className="relative aspect-[4/3] bg-flaeche-gedaempft">
                    {verweis && anzeige.mime !== "application/pdf" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signierte, kurzlebige Verweise lassen sich vom Bildoptimierer nicht sinnvoll zwischenspeichern
                      <img
                        src={verweis}
                        alt={bild.titel ?? BILDARTEN[bild.art]}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-[12px] text-gedaempft">
                        {anzeige.mime === "application/pdf"
                          ? "PDF-Dokument"
                          : "Vorschau nicht verfügbar"}
                      </div>
                    )}

                    <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                      {bild.ist_titelbild && <Marke ton="akzent">Titelbild</Marke>}
                      {anzeige.ki_bearbeitet && <KiKennzeichen art="bearbeitet" />}
                    </div>
                  </div>

                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-text">
                        {bild.titel ?? BILDARTEN[bild.art]}
                      </span>
                      <span className="text-[12px] text-gedaempft">
                        {i + 1}
                      </span>
                    </div>

                    {bearbeitet.length > 0 && (
                      <p className="text-[12px] text-gedaempft">
                        {bearbeitet.length}{" "}
                        {bearbeitet.length === 1 ? "Bearbeitung" : "Bearbeitungen"} ·
                        Original bleibt erhalten
                      </p>
                    )}

                    {darfAendern && (
                      <div className="flex flex-wrap gap-1.5">
                        {!bild.ist_titelbild && (
                          <form action={titelbildSetzen}>
                            <input type="hidden" name="bild_id" value={bild.id} />
                            <input type="hidden" name="objekt_id" value={objektId} />
                            <Button type="submit" variante="leise" groesse="klein">
                              Als Titelbild
                            </Button>
                          </form>
                        )}
                        {i > 0 && (
                          <form action={bildVerschieben}>
                            <input type="hidden" name="bild_id" value={bild.id} />
                            <input type="hidden" name="objekt_id" value={objektId} />
                            <input type="hidden" name="richtung" value="vor" />
                            <Button
                              type="submit"
                              variante="leise"
                              groesse="klein"
                              aria-label="Nach vorn verschieben"
                            >
                              ↑
                            </Button>
                          </form>
                        )}
                        {i < originale.length - 1 && (
                          <form action={bildVerschieben}>
                            <input type="hidden" name="bild_id" value={bild.id} />
                            <input type="hidden" name="objekt_id" value={objektId} />
                            <input type="hidden" name="richtung" value="zurueck" />
                            <Button
                              type="submit"
                              variante="leise"
                              groesse="klein"
                              aria-label="Nach hinten verschieben"
                            >
                              ↓
                            </Button>
                          </form>
                        )}
                        <form action={bildLoeschen}>
                          <input type="hidden" name="bild_id" value={bild.id} />
                          <input type="hidden" name="objekt_id" value={objektId} />
                          <Button type="submit" variante="gefahr" groesse="klein">
                            Löschen
                          </Button>
                        </form>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </KarteInhalt>
    </Karte>
  );
}
