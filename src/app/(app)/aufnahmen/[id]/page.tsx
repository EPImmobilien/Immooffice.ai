import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AufnahmeFormular } from "@/components/AufnahmeFormular";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Button, buttonKlassen } from "@/components/ui/Button";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { Hinweis, Marke } from "@/components/ui/Status";
import {
  AUFNAHMESTATUS,
  ZUSTANDSFELDER,
  ZUSTANDSNOTEN,
  notenTon,
  type Aufnahmestatus,
  type Objektaufnahme,
} from "@/lib/aufnahme";
import { hatRecht } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { DOKUMENTARTEN, type Dokumentart } from "@/lib/dokumente";
import { serverClient } from "@/lib/supabase/server";
import {
  aufnahmeUebernehmen,
  aufnahmeVerwerfen,
} from "@/server/aufnahme-aktionen";

export const metadata: Metadata = { title: "Objektaufnahme" };

export default async function AufnahmeSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sitzung = await sitzungErzwingen();
  const supabase = await serverClient();

  const { data: aufnahme } = await supabase
    .from("objektaufnahmen")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Eine fremde Aufnahme liefert die Policy gar nicht erst aus.
  if (!aufnahme) notFound();

  const { data: kontakte } = await supabase
    .from("kontakte")
    .select("id, vorname, nachname, firma")
    .is("geloescht_am", null)
    .order("nachname", { ascending: true })
    .limit(500);

  const daten = aufnahme as unknown as Objektaufnahme;
  const status = daten.status;
  const offen = status === "offen";
  const darfAendern = hatRecht(sitzung.rolle, "objekte", "aendern");
  const darfAnlegen = hatRecht(sitzung.rolle, "objekte", "anlegen");
  const fehlend = (daten.unterlagen_offen ?? []) as Dokumentart[];

  return (
    <>
      <Seitenkopf
        titel={daten.bezeichnung}
        beschreibung={
          [daten.strasse, daten.hausnummer].filter(Boolean).join(" ") ||
          "Objektaufnahme"
        }
      >
        <Link href="/aufnahmen" className={buttonKlassen({ variante: "sekundaer" })}>
          Zur Übersicht
        </Link>
      </Seitenkopf>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Marke
          ton={
            status === "offen"
              ? "warnung"
              : status === "uebernommen"
                ? "erfolg"
                : "neutral"
          }
        >
          {AUFNAHMESTATUS[status as Aufnahmestatus]}
        </Marke>
        {ZUSTANDSFELDER.map(({ feld, bezeichnung }) => (
          <Marke key={feld} ton={notenTon(daten[feld])}>
            {bezeichnung}: {ZUSTANDSNOTEN[daten[feld]]}
          </Marke>
        ))}
      </div>

      {status === "uebernommen" && daten.objekt_id && (
        <Hinweis ton="erfolg" className="mb-5">
          Diese Aufnahme wurde in ein Objekt übernommen. Sie bleibt als Beleg für
          den Zustand beim Termin unverändert erhalten.{" "}
          <Link
            href={`/objekte/${daten.objekt_id}`}
            className="font-medium underline underline-offset-2"
          >
            Zum Objekt
          </Link>
        </Hinweis>
      )}

      {status === "verworfen" && (
        <Hinweis ton="info" className="mb-5">
          Diese Aufnahme ist verworfen. Sie bleibt erhalten — ein nicht zustande
          gekommener Auftrag ist eine Information, etwa wenn derselbe Eigentümer
          später wieder anfragt.
        </Hinweis>
      )}

      {offen && darfAnlegen && (
        <Karte className="mb-5">
          <KarteKopf>
            <KarteTitel>In den Bestand übernehmen</KarteTitel>
            <KarteBeschreibung>
              Erzeugt ein Objekt im Status „Akquise“, verknüpft den Eigentümer und
              legt für jede der {fehlend.length}{" "}
              {fehlend.length === 1 ? "offenen Unterlage" : "offenen Unterlagen"}{" "}
              eine Aufgabe an. Die Preisvorstellung wird nicht als Kaufpreis
              übernommen — sie ist eine Aussage des Eigentümers, kein
              Angebotspreis.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt className="flex flex-wrap gap-2">
            <form action={aufnahmeUebernehmen}>
              <input type="hidden" name="aufnahme_id" value={daten.id} />
              <Button type="submit">Objekt daraus anlegen</Button>
            </form>
            <form action={aufnahmeVerwerfen}>
              <input type="hidden" name="aufnahme_id" value={daten.id} />
              <Button type="submit" variante="sekundaer">
                Verwerfen
              </Button>
            </form>
          </KarteInhalt>
        </Karte>
      )}

      {!offen && darfAendern && status === "verworfen" && (
        <form action={aufnahmeVerwerfen} className="mb-5">
          <input type="hidden" name="aufnahme_id" value={daten.id} />
          <Button type="submit" variante="sekundaer" groesse="klein">
            Wieder öffnen
          </Button>
        </form>
      )}

      {offen && darfAendern ? (
        <AufnahmeFormular
          aufnahme={daten}
          kontakte={(kontakte ?? []).map((k) => ({
            id: k.id,
            name:
              [k.vorname, k.nachname].filter(Boolean).join(" ") ||
              k.firma ||
              "Ohne Namen",
          }))}
        />
      ) : (
        <Karte>
          <KarteKopf>
            <KarteTitel>Aufgenommene Angaben</KarteTitel>
            <KarteBeschreibung>
              {offen
                ? "Zum Bearbeiten fehlt die Berechtigung."
                : "Abgeschlossene Aufnahmen sind nicht mehr änderbar — sie sind der Beleg für den Zustand beim Termin."}
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt className="space-y-3">
            {fehlend.length > 0 && (
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-gedaempft">
                  Fehlende Unterlagen
                </p>
                <p className="mt-1 text-[13px] text-text">
                  {fehlend.map((art) => DOKUMENTARTEN[art]).join(", ")}
                </p>
              </div>
            )}
            {daten.notizen && (
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-gedaempft">
                  Notizen
                </p>
                <p className="mt-1 whitespace-pre-line text-[13px] text-text">
                  {daten.notizen}
                </p>
              </div>
            )}
          </KarteInhalt>
        </Karte>
      )}
    </>
  );
}
