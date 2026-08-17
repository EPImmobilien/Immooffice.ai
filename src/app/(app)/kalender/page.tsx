import type { Metadata } from "next";

import { AufgabeAnlegen } from "@/components/AufgabeAnlegen";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Terminliste } from "@/components/Terminliste";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import type { Termin } from "@/lib/arbeitsmittel";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kalender" };

const AUSWAHL =
  "id, titel, art, notiz, beginnt_am, endet_am, ort, abgesagt_am, objekt_id, kontakt_id, " +
  "objekt:objekte(objektnummer, bezeichnung), kontakt:kontakte(vorname, nachname), " +
  "zustaendig:benutzer!termine_zustaendig_id_fkey(name)";

/**
 * Terminuebersicht.
 *
 * Bewusst eine Liste und kein Monatsraster: Ein Raster sieht nach Kalender aus,
 * zeigt aber bei drei Terminen im Monat vor allem leere Kaesten. Was im Alltag
 * gebraucht wird, ist „was steht als naechstes an" — und das ist eine Liste.
 * Ein Raster kann folgen, wenn genug Termine da sind, um es zu fuellen.
 */
export default async function KalenderSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "lesen");

  const supabase = await serverClient();

  // Ab heute 0 Uhr: Ein Termin, der heute um 9 Uhr war, gehoert um 11 Uhr noch
  // in die Uebersicht des Tages und nicht in die Vergangenheit.
  const jetzt = new Date();
  const tagesbeginn = new Date(
    Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()),
  ).toISOString();

  const { data: kommend } = await supabase
    .from("termine")
    .select(AUSWAHL)
    .gte("beginnt_am", tagesbeginn)
    .order("beginnt_am", { ascending: true });

  const { data: vergangen } = await supabase
    .from("termine")
    .select(AUSWAHL)
    .lt("beginnt_am", tagesbeginn)
    .order("beginnt_am", { ascending: false })
    .limit(20);

  const darfAendern = hatRecht(sitzung.rolle, "kalender", "aendern");
  const darfAnlegen = hatRecht(sitzung.rolle, "kalender", "anlegen");

  const kommendeListe = (kommend ?? []) as unknown as Termin[];

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel="Kalender"
        beschreibung={
          kommendeListe.length === 0
            ? "Keine anstehenden Termine."
            : `${kommendeListe.length} ${kommendeListe.length === 1 ? "Termin steht" : "Termine stehen"} an.`
        }
      />

      {darfAnlegen && <AufgabeAnlegen art="termin" />}

      <Karte>
        <KarteKopf>
          <KarteTitel>Anstehend</KarteTitel>
          <KarteBeschreibung>Ab heute, nach Tagen geordnet.</KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt>
          <Terminliste termine={kommendeListe} darfAendern={darfAendern} />
        </KarteInhalt>
      </Karte>

      {(vergangen ?? []).length > 0 && (
        <Karte>
          <KarteKopf>
            <KarteTitel>Vergangen</KarteTitel>
            <KarteBeschreibung>Die letzten zwanzig Termine.</KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <Terminliste
              termine={(vergangen ?? []) as unknown as Termin[]}
              darfAendern={darfAendern}
            />
          </KarteInhalt>
        </Karte>
      )}
    </div>
  );
}
