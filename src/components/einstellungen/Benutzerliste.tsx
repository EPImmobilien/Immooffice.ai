"use client";

import { useState, useTransition } from "react";

import { Rechtematrix } from "@/components/einstellungen/Rechtematrix";
import { Button } from "@/components/ui/Button";
import { Auswahl } from "@/components/ui/Feld";
import { Hinweis, Marke } from "@/components/ui/Status";
import {
  ROLLEN,
  ROLLEN_BEZEICHNUNG,
  type Rolle,
  type Uebersteuerung,
} from "@/lib/auth/rechte";
import { datum } from "@/lib/format";
import { rolleSetzen, zugangUmschalten } from "@/server/einstellungen-aktionen";

export interface BenutzerZeile {
  id: string;
  name: string;
  email: string;
  rolle: Rolle;
  rechte_uebersteuerung: Uebersteuerung;
  aktiv: boolean;
  letzter_login_am: string | null;
}

/**
 * Benutzer des Unternehmens.
 *
 * Was hier fehlt und bewusst fehlt: das Einladen weiterer Personen. Dafuer
 * braucht es einen eigenen Mailversand — der eingebaute Versand von Supabase
 * ist mengenbegrenzt und fuer Einladungen an Kunden nicht geeignet. Solange das
 * nicht steht, waere eine Einladungsschaltflaeche ein Versprechen, das die
 * Anwendung nicht haelt. Neue Zugaenge entstehen deshalb bis dahin ueber die
 * Registrierung.
 */
export function Benutzerliste({
  benutzer,
  eigeneId,
}: {
  benutzer: BenutzerZeile[];
  eigeneId: string;
}) {
  const [meldung, setMeldung] = useState<{
    ton: "erfolg" | "fehler";
    text: string;
  } | null>(null);
  const [laeuft, starten] = useTransition();

  function ausfuehren(
    aktion: (daten: FormData) => Promise<{ fehler?: string; hinweis?: string }>,
    daten: FormData,
  ) {
    setMeldung(null);
    starten(async () => {
      const ergebnis = await aktion(daten);
      if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
      else if (ergebnis.hinweis)
        setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
    });
  }

  return (
    <div className="space-y-4">
      {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

      <ul className="divide-y divide-linie">
        {benutzer.map((person) => {
          const selbst = person.id === eigeneId;

          return (
            <li key={person.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] text-text">
                      {person.name}
                    </p>
                    {selbst && <Marke>Sie</Marke>}
                    {!person.aktiv && <Marke ton="fehler">Abgeschaltet</Marke>}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-gedaempft">
                    {person.email}
                    {person.letzter_login_am
                      ? ` · zuletzt angemeldet ${datum(person.letzter_login_am)}`
                      : " · noch nie angemeldet"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {selbst ? (
                    // Die eigene Rolle nicht aenderbar: Wer sich selbst
                    // versehentlich auf Nur-Lese setzt, kann sich nicht
                    // zurueckholen — als einziger Verwalter waere das Unternehmen
                    // ausgesperrt.
                    <span className="text-[13px] text-gedaempft">
                      {ROLLEN_BEZEICHNUNG[person.rolle]}
                    </span>
                  ) : (
                    <form
                      action={(daten) => ausfuehren(rolleSetzen, daten)}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="hidden"
                        name="benutzer_id"
                        value={person.id}
                      />
                      <Auswahl
                        name="rolle"
                        defaultValue={person.rolle}
                        className="h-8 py-0 text-[13px]"
                        disabled={laeuft}
                      >
                        {ROLLEN.map((rolle) => (
                          <option key={rolle} value={rolle}>
                            {ROLLEN_BEZEICHNUNG[rolle]}
                          </option>
                        ))}
                      </Auswahl>
                      <Button
                        type="submit"
                        variante="sekundaer"
                        groesse="klein"
                        disabled={laeuft}
                      >
                        Übernehmen
                      </Button>
                    </form>
                  )}

                  {!selbst && (
                    <form
                      action={(daten) => ausfuehren(zugangUmschalten, daten)}
                    >
                      <input
                        type="hidden"
                        name="benutzer_id"
                        value={person.id}
                      />
                      <Button
                        type="submit"
                        variante="leise"
                        groesse="klein"
                        disabled={laeuft}
                      >
                        {person.aktiv ? "Abschalten" : "Freigeben"}
                      </Button>
                    </form>
                  )}
                </div>
              </div>

              {/* Einzelhaekchen ueber der Rollenvorlage. Fuer den eigenen Zugang
                  nicht angeboten: Die Datenbank weist eine Aenderung an den
                  eigenen Rechten ohnehin ab. */}
              {!selbst && (
                <div className="mt-2">
                  <Rechtematrix
                    benutzerId={person.id}
                    name={person.name}
                    rolle={person.rolle}
                    uebersteuerung={person.rechte_uebersteuerung ?? {}}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[12px] text-gedaempft">
        Zugänge werden abgeschaltet, nicht gelöscht: Ein Benutzer hängt an
        Objekten, Aufgaben und Verlaufseinträgen. Ihn zu entfernen würde diese
        Spuren anonymisieren und den Verlauf entwerten.
      </p>
    </div>
  );
}
