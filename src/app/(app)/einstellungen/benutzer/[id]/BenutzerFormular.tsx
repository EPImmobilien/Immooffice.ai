"use client";

import { useActionState } from "react";

import { RechteGitter } from "@/components/RechteGitter";
import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import type { Rolle, Uebersteuerung } from "@/lib/auth/rechte";
import {
  benutzerEntfernen,
  benutzerSpeichern,
  type EinstellungenErgebnis,
} from "@/server/einstellungen-aktionen";

export interface BenutzerDaten {
  id: string;
  name: string;
  email: string;
  rolle: Rolle;
  telefon: string | null;
  funktion: string | null;
  aktiv: boolean;
  uebersteuerung: Uebersteuerung;
}

export function BenutzerFormular({
  benutzer,
  istManSelbst,
  darfInhaberRolle,
  darfEntfernen,
  schreibbar,
}: {
  benutzer: BenutzerDaten;
  istManSelbst: boolean;
  darfInhaberRolle: boolean;
  darfEntfernen: boolean;
  schreibbar: boolean;
}) {
  const [zustand, aktion, laeuft] = useActionState<EinstellungenErgebnis, FormData>(
    benutzerSpeichern,
    {},
  );

  // Die Inhaberrolle bleibt in der Liste, wenn der Benutzer sie bereits hat —
  // sonst stuende dort eine andere Rolle, und ein Speichern wuerde sie
  // versehentlich entziehen.
  const rollenSperre: Rolle[] =
    darfInhaberRolle || benutzer.rolle === "inhaber" ? [] : ["inhaber"];

  return (
    <>
      <form action={aktion} className="space-y-5">
        <input type="hidden" name="benutzer_id" value={benutzer.id} />

        {zustand.fehler && (
          <Hinweis ton="fehler" titel="Speichern nicht möglich">{zustand.fehler}</Hinweis>
        )}
        {zustand.hinweis && <Hinweis ton="erfolg">{zustand.hinweis}</Hinweis>}

        <Karte>
          <KarteKopf>
            <KarteTitel>{benutzer.name}</KarteTitel>
            <KarteBeschreibung>{benutzer.email}</KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt className="grid gap-5 sm:grid-cols-2">
            <Feld id="telefon" beschriftung="Telefon">
              <Eingabe
                name="telefon"
                type="tel"
                defaultValue={benutzer.telefon ?? ""}
                disabled={!schreibbar}
              />
            </Feld>
            <Feld
              id="funktion"
              beschriftung="Funktion"
              hinweis="Erscheint auf Exposés, etwa „Immobilienberaterin“."
            >
              <Eingabe
                name="funktion"
                defaultValue={benutzer.funktion ?? ""}
                disabled={!schreibbar}
              />
            </Feld>

            <div className="sm:col-span-2">
              <label className="flex items-start gap-2.5 text-[13px] text-text">
                <input
                  type="checkbox"
                  name="aktiv"
                  value="an"
                  defaultChecked={benutzer.aktiv}
                  disabled={!schreibbar || istManSelbst}
                  className="mt-0.5 size-4 accent-akzent"
                />
                <span>
                  Zugang aktiv
                  <span className="block text-xs text-gedaempft">
                    {istManSelbst
                      ? "Der eigene Zugang kann nicht abgeschaltet werden."
                      : "Ein abgeschalteter Zugang kann sich nicht anmelden. Die Daten bleiben erhalten."}
                  </span>
                </span>
              </label>
              {istManSelbst && (
                // Ohne dieses Feld käme das Häkchen bei einem gesperrten
                // Kästchen gar nicht mit — der eigene Zugang würde beim
                // Speichern abgeschaltet.
                <input type="hidden" name="aktiv" value="an" />
              )}
            </div>
          </KarteInhalt>
        </Karte>

        <Karte>
          <KarteKopf>
            <KarteTitel>Rolle und Rechte</KarteTitel>
            <KarteBeschreibung>
              Die Rolle liefert die Vorbelegung, die Häkchen die Feinjustierung.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            {schreibbar ? (
              <RechteGitter
                rolle={benutzer.rolle}
                uebersteuerung={benutzer.uebersteuerung}
                rollenSperre={rollenSperre}
                hinweisRolle={
                  istManSelbst
                    ? "Vorsicht: Eine niedrigere Rolle nimmt Ihnen selbst den Zugang zu diesem Bereich."
                    : undefined
                }
              />
            ) : (
              <p className="text-[13px] text-gedaempft">
                Zum Ändern von Rollen und Rechten fehlt Ihnen die Berechtigung.
              </p>
            )}
          </KarteInhalt>
        </Karte>

        {schreibbar && (
          <div className="flex justify-end">
            <Button type="submit" laedt={laeuft}>
              Speichern
            </Button>
          </div>
        )}
      </form>

      {darfEntfernen && (
        <Karte className="border-fehler/30">
          <KarteKopf className="border-fehler/20">
            <KarteTitel>Benutzer entfernen</KarteTitel>
            <KarteBeschreibung>
              Entfernt den Zugang dauerhaft. Objekte, Kontakte und Dokumente
              bleiben beim Unternehmen. Wer nur vorübergehend nicht arbeiten
              soll, wird besser abgeschaltet.
            </KarteBeschreibung>
          </KarteKopf>
          <KarteInhalt>
            <form action={benutzerEntfernen}>
              <input type="hidden" name="benutzer_id" value={benutzer.id} />
              <Button type="submit" variante="gefahr" groesse="klein">
                {benutzer.name} entfernen
              </Button>
            </form>
          </KarteInhalt>
        </Karte>
      )}
    </>
  );
}
