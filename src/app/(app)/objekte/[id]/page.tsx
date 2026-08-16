import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Button, buttonKlassen } from "@/components/ui/Button";
import {
  Karte,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, KiKennzeichen, Marke } from "@/components/ui/Status";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { adresse, datum, euro, flaeche, zahl } from "@/lib/format";
import {
  ENERGIEAUSWEISTYPEN,
  NUTZUNGSARTEN,
  OBJEKTKATEGORIEN,
  OBJEKTSTATUS,
  VERMARKTUNGSARTEN,
  istKauf,
  istMiete,
  statusTon,
} from "@/lib/objekt-begriffe";
import { serverClient } from "@/lib/supabase/server";
import { objektLoeschen } from "@/server/objekt-aktionen";

export const metadata: Metadata = { title: "Objekt" };

function Zeile({ bezeichnung, wert }: { bezeichnung: string; wert: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-linie py-2 last:border-0">
      <dt className="text-[13px] text-gedaempft">{bezeichnung}</dt>
      <dd className="zahl text-[13px] font-medium text-text">{wert}</dd>
    </div>
  );
}

export default async function ObjektSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  const { data: objekt } = await supabase
    .from("objekte")
    .select("*")
    .eq("id", id)
    .is("geloescht_am", null)
    .maybeSingle();

  // Ein fremdes Objekt liefert die RLS-Policy gar nicht erst aus — das Ergebnis
  // ist dann leer und fuehrt hier zur 404-Seite, nicht zu einer Fehlermeldung,
  // die die Existenz verraten wuerde.
  if (!objekt) notFound();

  const darfAendern = hatRecht(sitzung.rolle, "objekte", "aendern");
  const darfLoeschen = hatRecht(sitzung.rolle, "objekte", "loeschen");
  const energieFehlt =
    !objekt.energieausweis_typ || objekt.energie_kennwert === null;

  return (
    <>
      <Seitenkopf
        titel={objekt.titel || objekt.bezeichnung}
        beschreibung={`${objekt.objektnummer} · ${adresse(objekt)}`}
      >
        <Link href="/objekte" className={buttonKlassen({ variante: "sekundaer" })}>
          Zur Übersicht
        </Link>
        {darfAendern && (
          <Link href={`/objekte/${objekt.id}/bearbeiten`} className={buttonKlassen()}>
            Bearbeiten
          </Link>
        )}
      </Seitenkopf>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Marke ton={statusTon(objekt.status as keyof typeof OBJEKTSTATUS)}>
          {OBJEKTSTATUS[objekt.status as keyof typeof OBJEKTSTATUS]}
        </Marke>
        <Marke>
          {
            VERMARKTUNGSARTEN[
              objekt.vermarktungsart as keyof typeof VERMARKTUNGSARTEN
            ]
          }
        </Marke>
        <Marke>
          {
            OBJEKTKATEGORIEN[
              objekt.objektkategorie as keyof typeof OBJEKTKATEGORIEN
            ]
          }
        </Marke>
        {objekt.texte_ki_erzeugt && <KiKennzeichen art="erzeugt" />}
      </div>

      {energieFehlt && (
        <Hinweis ton="warnung" titel="Angaben unvollständig" className="mb-5">
          Für die Veröffentlichung fehlen Angaben zum Energieausweis. Ohne sie
          ist kein Portalexport möglich.
        </Hinweis>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Karte>
            <KarteKopf>
              <KarteTitel>Beschreibung</KarteTitel>
            </KarteKopf>
            <KarteInhalt className="space-y-5">
              {objekt.beschreibung_objekt ||
              objekt.beschreibung_ausstattung ||
              objekt.beschreibung_lage ? (
                <>
                  {objekt.beschreibung_objekt && (
                    <div>
                      <h3 className="mb-1 text-[13px] font-semibold text-text">
                        Objekt
                      </h3>
                      <p className="text-[13px] leading-relaxed whitespace-pre-line text-gedaempft">
                        {objekt.beschreibung_objekt}
                      </p>
                    </div>
                  )}
                  {objekt.beschreibung_ausstattung && (
                    <div>
                      <h3 className="mb-1 text-[13px] font-semibold text-text">
                        Ausstattung
                      </h3>
                      <p className="text-[13px] leading-relaxed whitespace-pre-line text-gedaempft">
                        {objekt.beschreibung_ausstattung}
                      </p>
                    </div>
                  )}
                  {objekt.beschreibung_lage && (
                    <div>
                      <h3 className="mb-1 text-[13px] font-semibold text-text">
                        Lage
                      </h3>
                      <p className="text-[13px] leading-relaxed whitespace-pre-line text-gedaempft">
                        {objekt.beschreibung_lage}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="py-2 text-[13px] text-gedaempft">
                  Noch keine Beschreibungen hinterlegt. Sie können sie im Exposé
                  per KI erzeugen lassen.
                </p>
              )}
            </KarteInhalt>
          </Karte>

          <Karte>
            <KarteKopf>
              <KarteTitel>Exposé</KarteTitel>
            </KarteKopf>
            <KarteInhalt className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-md text-[13px] text-gedaempft">
                Exposé mit KI-Texten erzeugen und als PDF ausgeben. Der Export
                bestehender Inhalte kostet keine Credits.
              </p>
              <Link href={`/exposes/${objekt.id}`} className={buttonKlassen()}>
                Exposé öffnen
              </Link>
            </KarteInhalt>
          </Karte>
        </div>

        <div className="space-y-5">
          <Karte>
            <KarteKopf>
              <KarteTitel>Eckdaten</KarteTitel>
            </KarteKopf>
            <KarteInhalt>
              <dl>
                {istKauf(objekt.vermarktungsart) && (
                  <Zeile bezeichnung="Kaufpreis" wert={euro(objekt.kaufpreis)} />
                )}
                {istMiete(objekt.vermarktungsart) && (
                  <Zeile
                    bezeichnung="Kaltmiete"
                    wert={
                      objekt.kaltmiete !== null
                        ? `${euro(objekt.kaltmiete)} / Monat`
                        : "–"
                    }
                  />
                )}
                {objekt.nebenkosten !== null && (
                  <Zeile
                    bezeichnung="Nebenkosten"
                    wert={euro(objekt.nebenkosten)}
                  />
                )}
                {objekt.hausgeld !== null && (
                  <Zeile bezeichnung="Hausgeld" wert={euro(objekt.hausgeld)} />
                )}
                {objekt.wohnflaeche !== null && (
                  <Zeile
                    bezeichnung="Wohnfläche"
                    wert={flaeche(objekt.wohnflaeche)}
                  />
                )}
                {objekt.nutzflaeche !== null && (
                  <Zeile
                    bezeichnung="Nutzfläche"
                    wert={flaeche(objekt.nutzflaeche)}
                  />
                )}
                {objekt.grundstuecksflaeche !== null && (
                  <Zeile
                    bezeichnung="Grundstück"
                    wert={flaeche(objekt.grundstuecksflaeche)}
                  />
                )}
                {objekt.zimmer !== null && (
                  <Zeile bezeichnung="Zimmer" wert={zahl(objekt.zimmer)} />
                )}
                {objekt.baujahr !== null && (
                  <Zeile bezeichnung="Baujahr" wert={String(objekt.baujahr)} />
                )}
                <Zeile
                  bezeichnung="Nutzungsart"
                  wert={
                    NUTZUNGSARTEN[
                      objekt.nutzungsart as keyof typeof NUTZUNGSARTEN
                    ]
                  }
                />
              </dl>
            </KarteInhalt>
          </Karte>

          <Karte>
            <KarteKopf>
              <KarteTitel>Energieausweis</KarteTitel>
            </KarteKopf>
            <KarteInhalt>
              <dl>
                <Zeile
                  bezeichnung="Art"
                  wert={
                    objekt.energieausweis_typ
                      ? ENERGIEAUSWEISTYPEN[
                          objekt.energieausweis_typ as keyof typeof ENERGIEAUSWEISTYPEN
                        ]
                      : "–"
                  }
                />
                <Zeile
                  bezeichnung="Kennwert"
                  wert={
                    objekt.energie_kennwert !== null
                      ? `${zahl(objekt.energie_kennwert)} kWh/(m²·a)`
                      : "–"
                  }
                />
                <Zeile
                  bezeichnung="Klasse"
                  wert={objekt.energie_klasse ?? "–"}
                />
                <Zeile
                  bezeichnung="Gültig bis"
                  wert={datum(objekt.energie_gueltig_bis)}
                />
              </dl>
            </KarteInhalt>
          </Karte>

          {darfLoeschen && (
            <form action={objektLoeschen}>
              <input type="hidden" name="id" value={objekt.id} />
              <Button type="submit" variante="gefahr" groesse="klein">
                Objekt löschen
              </Button>
              <p className="mt-2 text-[11px] text-gedaempft">
                Das Objekt wird als gelöscht markiert und bleibt für
                Aufbewahrungsfristen erhalten.
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
