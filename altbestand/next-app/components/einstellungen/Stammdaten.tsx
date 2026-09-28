"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { stammdatenSpeichern } from "@/server/einstellungen-aktionen";

export interface Branding {
  firmenname: string | null;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  web: string | null;
  farbe_primaer: string | null;
  farbe_akzent: string | null;
  logo_pfad: string | null;
  impressum: string | null;
  datenschutztext: string | null;
  widerrufsbelehrung: string | null;
}

/**
 * Unternehmensangaben.
 *
 * Diese Felder stehen in jedem Exposé, jedem PDF, jedem Marketingmotiv und im
 * Fussbereich jedes Web-Exposés. Solange sie leer sind, behilft sich die
 * Anwendung mit dem bei der Registrierung angegebenen Namen — was funktioniert,
 * aber nach nichts aussieht.
 */
export function Stammdaten({ branding }: { branding: Branding | null }) {
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler"; text: string } | null>(
    null,
  );
  const [laeuft, starten] = useTransition();

  function absenden(daten: FormData) {
    setMeldung(null);
    starten(async () => {
      const ergebnis = await stammdatenSpeichern(daten);
      if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
      else if (ergebnis.hinweis) setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
    });
  }

  return (
    <form action={absenden} className="space-y-4">
      <Feld beschriftung="Firmenname" id="e-firmenname">
        <Eingabe
          name="firmenname"
          required
          maxLength={200}
          defaultValue={branding?.firmenname ?? ""}
          placeholder="Musterstadt Immobilien GmbH"
        />
      </Feld>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-3">
          <Feld beschriftung="Straße" id="e-strasse">
            <Eingabe name="strasse" defaultValue={branding?.strasse ?? ""} />
          </Feld>
        </div>
        <Feld beschriftung="Nummer" id="e-hausnummer">
          <Eingabe name="hausnummer" defaultValue={branding?.hausnummer ?? ""} />
        </Feld>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Feld beschriftung="PLZ" id="e-plz">
          <Eingabe name="plz" defaultValue={branding?.plz ?? ""} />
        </Feld>
        <div className="sm:col-span-3">
          <Feld beschriftung="Ort" id="e-ort">
            <Eingabe name="ort" defaultValue={branding?.ort ?? ""} />
          </Feld>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Feld beschriftung="Telefon" id="e-telefon">
          <Eingabe name="telefon" defaultValue={branding?.telefon ?? ""} />
        </Feld>
        <Feld beschriftung="E-Mail" id="e-email">
          <Eingabe type="email" name="email" defaultValue={branding?.email ?? ""} />
        </Feld>
        <Feld beschriftung="Web" id="e-web">
          <Eingabe
            name="web"
            defaultValue={branding?.web ?? ""}
            placeholder="www.beispiel.de"
          />
        </Feld>
      </div>

      {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

      <Button type="submit" disabled={laeuft}>
        {laeuft ? "Speichert …" : "Angaben speichern"}
      </Button>
    </form>
  );
}
