import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AufgabeAnlegen } from "@/components/AufgabeAnlegen";
import { Aufgabenliste } from "@/components/Aufgabenliste";
import {
  Beteiligte,
  type Beteiligung,
  type KontaktWahl,
} from "@/components/Beteiligte";
import { Bildergalerie } from "@/components/Bildergalerie";
import { Dokumentenliste } from "@/components/Dokumentenliste";
import { DokumentUpload } from "@/components/DokumentUpload";
import { PortalBereitschaft } from "@/components/PortalBereitschaft";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Terminliste } from "@/components/Terminliste";
import { Verlauf } from "@/components/Verlauf";
import { Button, buttonKlassen } from "@/components/ui/Button";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, KiKennzeichen, Marke } from "@/components/ui/Status";
import type { Aufgabe, Termin } from "@/lib/arbeitsmittel";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import {
  DOKUMENTARTEN,
  fehlendeUnterlagen,
  type ObjektDokument,
} from "@/lib/dokumente";
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
import { exportPruefen } from "@/lib/openimmo/pruefung";
import type { OpenImmoObjekt } from "@/lib/openimmo/typen";
import { serverClient } from "@/lib/supabase/server";
import type { Verlaufseintrag } from "@/lib/verlauf";
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

  // Alles, was am Objekt haengt, in einem Zug: Unterlagen, Verlauf, Aufgaben,
  // Termine. Vier Abfragen nebeneinander statt hintereinander — sie haengen
  // nicht voneinander ab, und in Reihe waere die Seite viermal so langsam.
  const [
    dokumente,
    verlauf,
    aufgaben,
    termine,
    beteiligungen,
    kontaktwahl,
  ] = await Promise.all([
    supabase
      .from("objekt_dokumente")
      .select(
        "id, pfad, dateiname, art, titel, notiz, sichtbarkeit, bytes, mime, gueltig_bis, erstellt_am",
      )
      .eq("objekt_id", id)
      .order("erstellt_am", { ascending: false }),
    supabase
      .from("aktivitaeten")
      .select("id, typ, beschreibung, metadaten, erstellt_am, benutzer:benutzer(name)")
      .eq("objekt_id", id)
      .order("erstellt_am", { ascending: false })
      .limit(50),
    supabase
      .from("aufgaben")
      .select(
        "id, titel, beschreibung, prioritaet, faellig_am, erledigt_am, objekt_id, kontakt_id, " +
          "zustaendig:benutzer!aufgaben_zustaendig_id_fkey(name)",
      )
      .eq("objekt_id", id)
      .is("erledigt_am", null)
      .order("faellig_am", { ascending: true, nullsFirst: false }),
    supabase
      .from("termine")
      .select(
        "id, titel, art, notiz, beginnt_am, endet_am, ort, abgesagt_am, objekt_id, kontakt_id, " +
          "zustaendig:benutzer!termine_zustaendig_id_fkey(name)",
      )
      .eq("objekt_id", id)
      .order("beginnt_am", { ascending: true }),
    supabase
      .from("kontakt_objekt")
      .select(
        "id, rolle, anteil, kontakt:kontakte(id, vorname, nachname, firma, email, telefon)",
      )
      .eq("objekt_id", id),
    // Auswahlliste zum Verknuepfen. Nur Name und ID — mehr braucht die Auswahl
      // nicht, und die uebrigen Felder waeren unnoetig im Seitenquelltext.
    supabase
      .from("kontakte")
      .select("id, vorname, nachname, firma")
      .is("geloescht_am", null)
      .order("nachname", { ascending: true })
      .limit(500),
  ]);

  const unterlagen = (dokumente.data ?? []) as unknown as ObjektDokument[];
  const fehlend = fehlendeUnterlagen(unterlagen);
  const heute = new Date().toISOString();

  const kontakte: KontaktWahl[] = (kontaktwahl.data ?? []).map((k) => ({
    id: k.id,
    name:
      [k.vorname, k.nachname].filter(Boolean).join(" ") ||
      k.firma ||
      "Ohne Namen",
  }));

  const befunde = exportPruefen(objekt as OpenImmoObjekt);
  const darfAendern = hatRecht(sitzung.rolle, "objekte", "aendern");
  const darfLoeschen = hatRecht(sitzung.rolle, "objekte", "loeschen");
  const darfTermine = hatRecht(sitzung.rolle, "kalender", "anlegen");
  const darfTermineAendern = hatRecht(sitzung.rolle, "kalender", "aendern");

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

          <Bildergalerie
            objektId={objekt.id}
            mandantId={sitzung.mandantId}
            darfAendern={darfAendern}
          />

          <Karte>
            <KarteKopf>
              <KarteTitel>Beteiligte</KarteTitel>
              <KarteBeschreibung>
                Eigentümer, Interessenten, Notar. Von hier aus führt der Weg zum
                Kontakt und zurück.
              </KarteBeschreibung>
            </KarteKopf>
            <KarteInhalt>
              <Beteiligte
                objektId={objekt.id}
                beteiligungen={
                  (beteiligungen.data ?? []) as unknown as Beteiligung[]
                }
                kontakte={kontakte}
                darfAendern={darfAendern}
              />
            </KarteInhalt>
          </Karte>

          <Karte>
            <KarteKopf>
              <KarteTitel>Unterlagen</KarteTitel>
              <KarteBeschreibung>
                Grundriss, Energieausweis, Grundbuch und alles Weitere. Neue
                Unterlagen sind zunächst nur intern. Freigegebene erscheinen im
                veröffentlichten Web-Exposé zum Download — vertrauliche Arten
                lassen sich nicht freigeben.
              </KarteBeschreibung>
            </KarteKopf>
            <KarteInhalt className="space-y-4">
              {fehlend.length > 0 && (
                <Hinweis ton="info" className="text-[13px]">
                  Häufig erwartet und noch nicht hinterlegt:{" "}
                  {fehlend.map((art) => DOKUMENTARTEN[art]).join(", ")}. Was
                  wirklich vorliegen muss, hängt vom Einzelfall ab.
                </Hinweis>
              )}

              <Dokumentenliste
                dokumente={unterlagen}
                objektId={objekt.id}
                heute={heute}
                darfAendern={darfAendern}
              />

              {darfAendern && (
                <div className="border-t border-linie pt-4">
                  <DokumentUpload
                    objektId={objekt.id}
                    mandantId={sitzung.mandantId}
                  />
                </div>
              )}
            </KarteInhalt>
          </Karte>

          <PortalBereitschaft objektId={objekt.id} befunde={befunde} />

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

          <Karte>
            <KarteKopf>
              <KarteTitel>Verlauf</KarteTitel>
              <KarteBeschreibung>
                Wer wann was gemacht hat. Einträge entstehen zum Teil von selbst
                und lassen sich nicht nachträglich ändern.
              </KarteBeschreibung>
            </KarteKopf>
            <KarteInhalt>
              <Verlauf
                eintraege={(verlauf.data ?? []) as unknown as Verlaufseintrag[]}
                objektId={objekt.id}
                darfSchreiben={darfAendern}
              />
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
              <KarteTitel>Aufgaben</KarteTitel>
            </KarteKopf>
            <KarteInhalt className="space-y-3">
              <Aufgabenliste
                aufgaben={(aufgaben.data ?? []) as unknown as Aufgabe[]}
                heute={heute}
                darfAendern={darfTermineAendern}
                darfLoeschen={hatRecht(sitzung.rolle, "kalender", "loeschen")}
                mitBezug={false}
              />
              {darfTermine && <AufgabeAnlegen objektId={objekt.id} />}
            </KarteInhalt>
          </Karte>

          <Karte>
            <KarteKopf>
              <KarteTitel>Termine</KarteTitel>
            </KarteKopf>
            <KarteInhalt className="space-y-3">
              <Terminliste
                termine={(termine.data ?? []) as unknown as Termin[]}
                darfAendern={darfTermineAendern}
                mitBezug={false}
              />
              {darfTermine && <AufgabeAnlegen objektId={objekt.id} art="termin" />}
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
