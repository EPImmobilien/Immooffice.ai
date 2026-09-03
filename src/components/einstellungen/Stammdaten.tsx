"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { stammdatenSpeichern } from "@/server/einstellungen-aktionen";

export interface Branding {
  firmenname: string | null;
  rechtsform: string | null;
  geschaeftsfuehrer: string | null;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  web: string | null;
  handelsregister: string | null;
  ust_id: string | null;
  aufsichtsbehoerde: string | null;
  farbe_primaer: string | null;
  farbe_akzent: string | null;
  schrift_serifenlos: string | null;
  schrift_serifen: string | null;
  logo_pfad: string | null;
  logo_invers_pfad: string | null;
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
 *
 * Die Impressumsangaben (Handelsregister, USt-IdNr., Erlaubnisbehoerde) sind
 * dieselben wie im Onboarding, Schritt 3 — hier zum Nachpflegen.
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
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Feld beschriftung="Firmenname" id="e-firmenname" pflicht>
            <Eingabe
              name="firmenname"
              maxLength={200}
              defaultValue={branding?.firmenname ?? ""}
              placeholder="Musterstadt Immobilien GmbH"
            />
          </Feld>
        </div>
        <Feld beschriftung="Rechtsform" id="e-rechtsform">
          <Eingabe name="rechtsform" maxLength={60} defaultValue={branding?.rechtsform ?? ""} placeholder="GmbH" />
        </Feld>
      </div>

      <Feld beschriftung="Vertretungsberechtigte Person" id="e-gf" hinweis="Für das Impressum">
        <Eingabe name="geschaeftsfuehrer" maxLength={200} defaultValue={branding?.geschaeftsfuehrer ?? ""} />
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
        <Feld beschriftung="PLZ" id="e-plz" hinweis="Fünf Ziffern">
          <Eingabe name="plz" defaultValue={branding?.plz ?? ""} inputMode="numeric" maxLength={5} className="zahl" />
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

      <div className="grid gap-4 border-t border-linie pt-4 sm:grid-cols-3">
        <Feld beschriftung="Handelsregister" id="e-hr" hinweis="Gericht und Nummer">
          <Eingabe name="handelsregister" maxLength={120} defaultValue={branding?.handelsregister ?? ""} placeholder="Amtsgericht Kiel, HRB 12345" />
        </Feld>
        <Feld beschriftung="USt-IdNr." id="e-ust" hinweis="Nur Format wird geprüft">
          <Eingabe name="ust_id" maxLength={14} defaultValue={branding?.ust_id ?? ""} className="zahl" placeholder="DE123456789" />
        </Feld>
        <Feld beschriftung="Erlaubnisbehörde (§ 34c GewO)" id="e-behoerde">
          <Eingabe name="aufsichtsbehoerde" maxLength={200} defaultValue={branding?.aufsichtsbehoerde ?? ""} />
        </Feld>
      </div>

      {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

      <Button type="submit" disabled={laeuft}>
        {laeuft ? "Speichert …" : "Angaben speichern"}
      </Button>
    </form>
  );
}
