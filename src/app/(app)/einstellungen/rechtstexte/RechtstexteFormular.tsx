"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Feld, Textfeld } from "@/components/ui/Feld";
import { Karte, KarteBeschreibung, KarteInhalt, KarteKopf, KarteTitel } from "@/components/ui/Karte";
import { Hinweis } from "@/components/ui/Status";
import {
  rechtstexteSpeichern,
  type EinstellungenErgebnis,
} from "@/server/einstellungen-aktionen";

import type { RechtstexteDaten } from "./page";

export function RechtstexteFormular({
  texte,
  schreibbar,
}: {
  texte: RechtstexteDaten;
  schreibbar: boolean;
}) {
  const [zustand, aktion, laeuft] = useActionState<EinstellungenErgebnis, FormData>(
    rechtstexteSpeichern,
    {},
  );

  return (
    <form action={aktion} className="space-y-5">
      {zustand.fehler && (
        <Hinweis ton="fehler" titel="Speichern nicht möglich">{zustand.fehler}</Hinweis>
      )}
      {zustand.hinweis && <Hinweis ton="erfolg">{zustand.hinweis}</Hinweis>}

      <Hinweis ton="warnung" titel="Keine Rechtsberatung">
        Diese Texte werden unverändert in Web-Exposés und Dokumente übernommen.
        ImmoOffice.ai prüft sie nicht und kann nicht beurteilen, ob sie
        vollständig oder für Ihr Unternehmen zutreffend sind. Lassen Sie
        Impressum, Datenschutzerklärung und Widerrufsbelehrung anwaltlich
        prüfen, bevor Sie etwas veröffentlichen.
      </Hinweis>

      <Karte>
        <KarteKopf>
          <KarteTitel>Pflichtangaben</KarteTitel>
          <KarteBeschreibung>
            Erscheinen im öffentlichen Web-Exposé.
          </KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt className="space-y-5">
          <Feld id="impressum" beschriftung="Impressum">
            <Textfeld
              name="impressum"
              rows={8}
              defaultValue={texte.impressum ?? ""}
              disabled={!schreibbar}
            />
          </Feld>
          <Feld id="datenschutztext" beschriftung="Datenschutzerklärung">
            <Textfeld
              name="datenschutztext"
              rows={12}
              defaultValue={texte.datenschutztext ?? ""}
              disabled={!schreibbar}
            />
          </Feld>
        </KarteInhalt>
      </Karte>

      <Karte>
        <KarteKopf>
          <KarteTitel>Weitere Texte</KarteTitel>
          <KarteBeschreibung>
            Für Verbraucherverträge ist die Widerrufsbelehrung Pflicht.
          </KarteBeschreibung>
        </KarteKopf>
        <KarteInhalt className="space-y-5">
          <Feld id="widerrufsbelehrung" beschriftung="Widerrufsbelehrung">
            <Textfeld
              name="widerrufsbelehrung"
              rows={10}
              defaultValue={texte.widerrufsbelehrung ?? ""}
              disabled={!schreibbar}
            />
          </Feld>
          <Feld
            id="rechtstexte_sonstige"
            beschriftung="Sonstige Hinweise"
            hinweis="Etwa Angaben zur Berufshaftpflicht oder zur Aufsichtsbehörde."
          >
            <Textfeld
              name="rechtstexte_sonstige"
              rows={6}
              defaultValue={texte.rechtstexte_sonstige ?? ""}
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
