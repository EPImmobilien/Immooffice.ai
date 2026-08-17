import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/Seitenkopf";
import { Button, buttonKlassen } from "@/components/ui/Button";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, KiKennzeichen, Marke } from "@/components/ui/Status";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { VORLAGEN } from "@/lib/expose/vorlagen";
import { datum } from "@/lib/format";
import { kiVerfuegbar } from "@/lib/ki";
import { serverClient } from "@/lib/supabase/server";
import { basisUrlErmitteln } from "@/lib/web-expose";
import { texteFreigeben } from "@/server/expose-aktionen";

import { TextWerkstatt } from "./TextWerkstatt";
import { WebExpose } from "./WebExpose";

export const metadata: Metadata = { title: "Exposé" };

function Textblock({
  titel,
  text,
}: {
  titel: string;
  text: string | null;
}) {
  return (
    <div>
      <h3 className="mb-1 text-[13px] font-semibold text-text">{titel}</h3>
      {text ? (
        <p className="text-[13px] leading-relaxed whitespace-pre-line text-gedaempft">
          {text}
        </p>
      ) : (
        <p className="text-[13px] text-gedaempft italic">Noch nicht erstellt.</p>
      )}
    </div>
  );
}

export default async function ExposeSeite({
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

  if (!objekt) notFound();

  const { count: bildAnzahl } = await supabase
    .from("objekt_bilder")
    .select("id", { count: "exact", head: true })
    .eq("objekt_id", objekt.id)
    .is("original_id", null);

  const basisUrl = basisUrlErmitteln(await headers());
  const darfErzeugen = hatRecht(sitzung, "exposes", "anlegen");
  const darfFreigeben = hatRecht(sitzung, "exposes", "freigeben");
  const freigegeben = Boolean(objekt.texte_freigegeben_am);
  const hatTexte = Boolean(
    objekt.beschreibung_objekt ||
      objekt.beschreibung_ausstattung ||
      objekt.beschreibung_lage,
  );

  return (
    <>
      <Seitenkopf
        titel="Exposé"
        beschreibung={`${objekt.objektnummer} · ${objekt.titel || objekt.bezeichnung}`}
      >
        <Link
          href={`/objekte/${objekt.id}`}
          className={buttonKlassen({ variante: "sekundaer" })}
        >
          Zum Objekt
        </Link>
        <a
          href={`/api/expose/${objekt.id}/pdf`}
          className={buttonKlassen()}
          download
        >
          PDF herunterladen
        </a>
      </Seitenkopf>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {objekt.texte_ki_erzeugt && <KiKennzeichen art="erzeugt" />}
        {freigegeben ? (
          <Marke ton="erfolg">
            Freigegeben am {datum(objekt.texte_freigegeben_am)}
          </Marke>
        ) : (
          <Marke ton="warnung">Nicht freigegeben</Marke>
        )}
      </div>

      {hatTexte && !freigegeben && (
        <Hinweis ton="warnung" titel="Freigabe erforderlich" className="mb-5">
          Die Texte sind noch nicht freigegeben. Vor einer Veröffentlichung sind
          sie zu prüfen und ausdrücklich freizugeben — der PDF-Export ist davon
          unabhängig möglich.
        </Hinweis>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {darfErzeugen && (
            <TextWerkstatt objektId={objekt.id} kiVerfuegbar={kiVerfuegbar()} />
          )}

          <Karte>
            <KarteKopf>
              <KarteTitel>Vorlagen</KarteTitel>
              <KarteBeschreibung>
                Alle Vorlagen übernehmen das Branding Ihres Unternehmens
                automatisch.
              </KarteBeschreibung>
            </KarteKopf>
            <KarteInhalt className="space-y-3">
              <p className="text-[13px] text-gedaempft">
                Der Export bestehender Inhalte kostet keine Credits — beliebig
                oft und in jeder Vorlage.
              </p>

              <ul className="divide-y divide-linie">
                {VORLAGEN.map((vorlage) => (
                  <li
                    key={vorlage.schluessel}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-text">
                        {vorlage.name}{" "}
                        <span className="font-normal text-gedaempft">
                          · {vorlage.format}
                        </span>
                      </p>
                      <p className="text-[12px] text-gedaempft">
                        {vorlage.hinweis}
                      </p>
                    </div>
                    <a
                      href={`/api/expose/${objekt.id}/pdf?vorlage=${vorlage.schluessel}`}
                      className={buttonKlassen({
                        variante: "sekundaer",
                        groesse: "klein",
                      })}
                      download
                    >
                      PDF
                    </a>
                  </li>
                ))}
              </ul>

              {bildAnzahl === 0 && (
                <Hinweis ton="warnung">
                  Für dieses Objekt sind noch keine Bilder hinterlegt. Die
                  bildstarken Vorlagen bleiben dadurch leer — Bilder lassen sich
                  direkt beim Objekt hochladen.
                </Hinweis>
              )}
            </KarteInhalt>
          </Karte>

          <WebExpose
            objektId={objekt.id}
            darfFreigeben={darfFreigeben}
            basisUrl={basisUrl}
          />
        </div>

        <Karte>
          <KarteKopf className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <KarteTitel>Texte</KarteTitel>
              <KarteBeschreibung>
                Vollständig bearbeitbar im Objekt.
              </KarteBeschreibung>
            </div>
            {hatTexte && !freigegeben && darfFreigeben && (
              <form action={texteFreigeben}>
                <input type="hidden" name="objektId" value={objekt.id} />
                <Button type="submit" groesse="klein">
                  Texte freigeben
                </Button>
              </form>
            )}
          </KarteKopf>
          <KarteInhalt className="space-y-5">
            <Textblock titel="Titel" text={objekt.titel} />
            <Textblock
              titel="Objektbeschreibung"
              text={objekt.beschreibung_objekt}
            />
            <Textblock
              titel="Ausstattung"
              text={objekt.beschreibung_ausstattung}
            />
            <Textblock titel="Lage" text={objekt.beschreibung_lage} />

            <Link
              href={`/objekte/${objekt.id}/bearbeiten`}
              className={buttonKlassen({
                variante: "sekundaer",
                groesse: "klein",
              })}
            >
              Texte bearbeiten
            </Link>
          </KarteInhalt>
        </Karte>
      </div>
    </>
  );
}
