"use client";

import { useState, useTransition } from "react";

import type { Branding } from "@/components/einstellungen/Stammdaten";
import { Button } from "@/components/ui/Button";
import { Feld, Textfeld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { rechtstexteSpeichern } from "@/server/einstellungen-aktionen";

/**
 * Impressum, Datenschutzerklaerung, Widerrufsbelehrung.
 *
 * Bewusst leere Felder ohne Vorlage. Eine mitgelieferte „Muster-
 * Datenschutzerklaerung" waere Rechtsberatung, die ImmoOffice.ai nicht leisten
 * darf und nicht leisten kann — und ein ungeprueft uebernommener Mustertext ist
 * fuer den Nutzer gefaehrlicher als ein leeres Feld, weil er sich in Sicherheit
 * wiegt.
 */
export function Rechtstexte({ branding }: { branding: Branding | null }) {
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler"; text: string } | null>(
    null,
  );
  const [laeuft, starten] = useTransition();

  function absenden(daten: FormData) {
    setMeldung(null);
    starten(async () => {
      const ergebnis = await rechtstexteSpeichern(daten);
      if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
      else if (ergebnis.hinweis) setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
    });
  }

  return (
    <form action={absenden} className="space-y-4">
      <Hinweis ton="warnung">
        Diese Texte sind Ihre eigenen Angaben. ImmoOffice.ai prüft sie nicht und
        kann nicht beurteilen, ob sie vollständig oder rechtlich zutreffend sind.
        Für Impressum und Datenschutzerklärung ist anwaltliche oder fachkundige
        Prüfung angeraten.
      </Hinweis>

      <Feld
        beschriftung="Impressum"
        id="e-impressum"
        hinweis="Erscheint im Fußbereich veröffentlichter Web-Exposés"
      >
        <Textfeld name="impressum" rows={6} defaultValue={branding?.impressum ?? ""} />
      </Feld>

      <Feld
        beschriftung="Datenschutzerklärung"
        id="e-datenschutz"
        hinweis="Gilt für die Angaben, die Interessenten über das Kontaktformular übermitteln"
      >
        <Textfeld
          name="datenschutztext"
          rows={6}
          defaultValue={branding?.datenschutztext ?? ""}
        />
      </Feld>

      <Feld
        beschriftung="Widerrufsbelehrung"
        id="e-widerruf"
        hinweis="Für Maklerverträge mit Verbrauchern"
      >
        <Textfeld
          name="widerrufsbelehrung"
          rows={6}
          defaultValue={branding?.widerrufsbelehrung ?? ""}
        />
      </Feld>

      {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

      <Button type="submit" disabled={laeuft}>
        {laeuft ? "Speichert …" : "Texte speichern"}
      </Button>
    </form>
  );
}
