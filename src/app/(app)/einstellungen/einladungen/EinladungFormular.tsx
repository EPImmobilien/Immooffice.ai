"use client";

import { useActionState } from "react";

import { RechteGitter } from "@/components/RechteGitter";
import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import type { Rolle } from "@/lib/auth/rechte";
import {
  einladungErstellen,
  type EinstellungenErgebnis,
} from "@/server/einstellungen-aktionen";

import { Einladungslink } from "./Einladungslink";

export function EinladungFormular({ darfInhaberRolle }: { darfInhaberRolle: boolean }) {
  const [zustand, aktion, laeuft] = useActionState<EinstellungenErgebnis, FormData>(
    einladungErstellen,
    {},
  );

  const rollenSperre: Rolle[] = darfInhaberRolle ? [] : ["inhaber"];

  return (
    <form action={aktion} className="space-y-5">
      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Einladung nicht möglich">{zustand.fehler}</Hinweis>
      )}
      {zustand.hinweis && !zustand.einladungslink && (
        <Hinweis ton="erfolg">{zustand.hinweis}</Hinweis>
      )}
      {zustand.einladungslink && <Einladungslink adresse={zustand.einladungslink} />}

      <Karte>
        <KarteKopf>
          <KarteTitel>Benutzer einladen</KarteTitel>
          <KarteBeschreibung>
            Der Zugang entsteht erst, wenn die eingeladene Person den Link
            annimmt. Bis dahin lässt sich die Einladung widerrufen.
          </KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt className="space-y-5">
          <Feld
            id="email"
            beschriftung="E-Mail-Adresse"
            pflicht
            hinweis="Nur diese Adresse kann die Einladung annehmen."
          >
            <Eingabe name="email" type="email" autoComplete="off" />
          </Feld>

          <RechteGitter rolle="makler" rollenSperre={rollenSperre} />
        </KarteInhalt>
      </Karte>

      <div className="flex justify-end">
        <Button type="submit" laedt={laeuft}>
          Einladung anlegen
        </Button>
      </div>
    </form>
  );
}
