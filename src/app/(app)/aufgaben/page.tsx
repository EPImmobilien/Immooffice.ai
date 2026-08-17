import type { Metadata } from "next";

import { AufgabeAnlegen } from "@/components/AufgabeAnlegen";
import { Aufgabenliste } from "@/components/Aufgabenliste";
import { Seitenkopf } from "@/components/Seitenkopf";
import {
  Karte,
  KarteBeschreibung,
  KarteInhalt,
  KarteKopf,
  KarteTitel,
} from "@/components/ui/Karte";
import { fristlage, type Aufgabe } from "@/lib/arbeitsmittel";
import { hatRecht, rechtErzwingen } from "@/lib/auth/rechte";
import { sitzungErzwingen } from "@/lib/auth/sitzung";
import { serverClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Aufgaben" };

const AUSWAHL =
  "id, titel, beschreibung, prioritaet, faellig_am, erledigt_am, objekt_id, kontakt_id, " +
  "objekt:objekte(objektnummer, bezeichnung), kontakt:kontakte(vorname, nachname), " +
  "zustaendig:benutzer!aufgaben_zustaendig_id_fkey(name)";

export default async function AufgabenSeite() {
  const sitzung = await sitzungErzwingen();
  rechtErzwingen(sitzung.rolle, "kalender", "lesen", sitzung.uebersteuerung);

  const supabase = await serverClient();

  const { data: offen } = await supabase
    .from("aufgaben")
    .select(AUSWAHL)
    .is("erledigt_am", null)
    .order("faellig_am", { ascending: true, nullsFirst: false });

  // Erledigte nur die letzten dreissig: Die vollstaendige Liste waechst
  // unbegrenzt und beantwortet keine Frage, die jemand stellt.
  const { data: erledigt } = await supabase
    .from("aufgaben")
    .select(AUSWAHL)
    .not("erledigt_am", "is", null)
    .order("erledigt_am", { ascending: false })
    .limit(30);

  const heute = new Date().toISOString();
  const stichtag = new Date(heute);

  const offeneListe = (offen ?? []) as unknown as Aufgabe[];
  const dringend = offeneListe.filter((a) =>
    ["ueberfaellig", "heute"].includes(fristlage(a.faellig_am, stichtag)),
  );

  const darfAendern = hatRecht(sitzung.rolle, "kalender", "aendern", sitzung.uebersteuerung);
  const darfLoeschen = hatRecht(sitzung.rolle, "kalender", "loeschen", sitzung.uebersteuerung);
  const darfAnlegen = hatRecht(sitzung.rolle, "kalender", "anlegen", sitzung.uebersteuerung);

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel="Aufgaben"
        beschreibung={
          dringend.length > 0
            ? `${dringend.length} ${dringend.length === 1 ? "Aufgabe ist" : "Aufgaben sind"} heute oder früher fällig.`
            : "Alles im Zeitplan."
        }
      />

      {darfAnlegen && <AufgabeAnlegen />}

      <Karte>
        <KarteKopf>
          <KarteTitel>Offen</KarteTitel>
          <KarteBeschreibung>
            {offeneListe.length === 0
              ? "Keine offenen Aufgaben."
              : `${offeneListe.length} offen — überfällige zuerst, Aufgaben ohne Frist am Ende.`}
          </KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt>
          <Aufgabenliste
            aufgaben={offeneListe}
            heute={heute}
            darfAendern={darfAendern}
            darfLoeschen={darfLoeschen}
          />
        </KarteInhalt>
      </Karte>

      {(erledigt ?? []).length > 0 && (
        <Karte>
          <KarteKopf>
            <KarteTitel>Zuletzt erledigt</KarteTitel>
            <KarteBeschreibung>Die letzten dreißig Einträge.</KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <Aufgabenliste
              aufgaben={(erledigt ?? []) as unknown as Aufgabe[]}
              heute={heute}
              darfAendern={darfAendern}
              darfLoeschen={darfLoeschen}
            />
          </KarteInhalt>
        </Karte>
      )}
    </div>
  );
}
