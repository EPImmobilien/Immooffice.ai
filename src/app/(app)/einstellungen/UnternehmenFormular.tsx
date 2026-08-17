"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import {
  unternehmenSpeichern,
  type EinstellungenErgebnis,
} from "@/server/einstellungen-aktionen";

import type { BrandingDaten } from "./page";

export function UnternehmenFormular({
  name,
  branding,
  schreibbar,
}: {
  name: string;
  branding: BrandingDaten;
  schreibbar: boolean;
}) {
  const [zustand, aktion, laeuft] = useActionState<EinstellungenErgebnis, FormData>(
    unternehmenSpeichern,
    {},
  );

  return (
    <form action={aktion} className="space-y-5">
      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Speichern nicht möglich">{zustand.fehler}</Hinweis>
      )}
      {zustand.hinweis && <Hinweis ton="erfolg">{zustand.hinweis}</Hinweis>}

      <Karte>
        <KarteKopf>
          <KarteTitel>Stammdaten</KarteTitel>
          <KarteBeschreibung>
            Diese Angaben erscheinen auf Exposés, Web-Exposés und
            Marketingmotiven.
          </KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt className="grid gap-5 sm:grid-cols-2">
          <Feld
            id="name"
            beschriftung="Name des Unternehmens"
            pflicht
            hinweis="Wird in der Anwendung angezeigt."
          >
            <Eingabe name="name" defaultValue={name} disabled={!schreibbar} />
          </Feld>
          <Feld
            id="firmenname"
            beschriftung="Firmierung für Dokumente"
            hinweis="Vollständige Firmierung, etwa mit Rechtsform."
          >
            <Eingabe
              name="firmenname"
              defaultValue={branding.firmenname ?? ""}
              disabled={!schreibbar}
            />
          </Feld>

          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Feld id="strasse" beschriftung="Straße">
              <Eingabe name="strasse" defaultValue={branding.strasse ?? ""} disabled={!schreibbar} />
            </Feld>
            <Feld id="hausnummer" beschriftung="Nr.">
              <Eingabe
                name="hausnummer"
                defaultValue={branding.hausnummer ?? ""}
                disabled={!schreibbar}
              />
            </Feld>
          </div>

          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <Feld id="plz" beschriftung="PLZ">
              <Eingabe name="plz" defaultValue={branding.plz ?? ""} disabled={!schreibbar} />
            </Feld>
            <Feld id="ort" beschriftung="Ort">
              <Eingabe name="ort" defaultValue={branding.ort ?? ""} disabled={!schreibbar} />
            </Feld>
          </div>

          <Feld id="telefon" beschriftung="Telefon">
            <Eingabe
              name="telefon"
              type="tel"
              defaultValue={branding.telefon ?? ""}
              disabled={!schreibbar}
            />
          </Feld>
          <Feld id="email" beschriftung="E-Mail">
            <Eingabe
              name="email"
              type="email"
              defaultValue={branding.email ?? ""}
              disabled={!schreibbar}
            />
          </Feld>
          <Feld id="web" beschriftung="Webseite">
            <Eingabe
              name="web"
              defaultValue={branding.web ?? ""}
              placeholder="https://"
              disabled={!schreibbar}
            />
          </Feld>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Erscheinungsbild</KarteTitel>
          <KarteBeschreibung>
            Ohne eigene Farben gelten die Farben der Anwendung.
          </KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt className="grid gap-5 sm:grid-cols-2">
          <Feld
            id="farbe_primaer"
            beschriftung="Grundfarbe"
            hinweis="Hexwert, etwa #1B2A47."
          >
            <Eingabe
              name="farbe_primaer"
              defaultValue={branding.farbe_primaer ?? ""}
              placeholder="#1B2A47"
              disabled={!schreibbar}
            />
          </Feld>
          <Feld id="farbe_akzent" beschriftung="Akzentfarbe" hinweis="Hexwert, etwa #B5934F.">
            <Eingabe
              name="farbe_akzent"
              defaultValue={branding.farbe_akzent ?? ""}
              placeholder="#B5934F"
              disabled={!schreibbar}
            />
          </Feld>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>E-Mail-Absender</KarteTitel>
          <KarteBeschreibung>
            Wird für Nachrichten aus der Anwendung verwendet, sobald der
            E-Mail-Versand eingerichtet ist.
          </KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt className="grid gap-5 sm:grid-cols-2">
          <Feld id="mail_absender_name" beschriftung="Absendername">
            <Eingabe
              name="mail_absender_name"
              defaultValue={branding.mail_absender_name ?? ""}
              disabled={!schreibbar}
            />
          </Feld>
          <Feld id="mail_absender_adresse" beschriftung="Absenderadresse">
            <Eingabe
              name="mail_absender_adresse"
              type="email"
              defaultValue={branding.mail_absender_adresse ?? ""}
              disabled={!schreibbar}
            />
          </Feld>
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
  );
}
