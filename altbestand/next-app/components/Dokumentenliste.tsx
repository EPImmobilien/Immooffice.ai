"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Hinweis, Marke } from "@/components/ui/Status";
import { datum } from "@/lib/format";
import {
  DOKUMENTARTEN,
  abgelaufen,
  darfAnKunden,
  dateigroesse,
  type ObjektDokument,
} from "@/lib/dokumente";
import {
  dokumentLoeschen,
  dokumentVerweis,
  sichtbarkeitUmschalten,
} from "@/server/dokument-aktionen";

/**
 * Unterlagen eines Objekts.
 *
 * Zum Herunterladen wird beim Klick ein kurz gueltiger, signierter Verweis
 * geholt. Ihn schon beim Aufbau der Seite zu erzeugen waere einfacher — dann
 * stuenden aber fuer jede Unterlage gueltige Verweise in der Seite, auch fuer
 * die, die niemand oeffnet. Ein weitergegebener Seitenquelltext waere damit ein
 * Stapel funktionierender Downloads.
 *
 * `heute` kommt von aussen und wird nicht hier ermittelt: Ein `new Date()` im
 * Aufbau einer Komponente ist nicht deterministisch und weicht zwischen Server
 * und Browser ab.
 */
export function Dokumentenliste({
  dokumente,
  objektId,
  heute,
  darfAendern,
}: {
  dokumente: ObjektDokument[];
  objektId: string;
  heute: string;
  darfAendern: boolean;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();
  const stichtag = new Date(heute);

  if (dokumente.length === 0) {
    return (
      <p className="text-[13px] text-gedaempft">
        Noch keine Unterlagen hinterlegt.
      </p>
    );
  }

  function oeffnen(id: string) {
    setFehler(null);
    starten(async () => {
      const ergebnis = await dokumentVerweis(id);
      if (ergebnis.fehler || !ergebnis.url) {
        setFehler(ergebnis.fehler ?? "Der Download konnte nicht erzeugt werden.");
        return;
      }
      window.open(ergebnis.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="space-y-2">
      {fehler && (
        <Hinweis ton="fehler" className="text-[13px]">
          {fehler}
        </Hinweis>
      )}

      <ul className="divide-y divide-linie">
        {dokumente.map((dokument) => {
          const ablauf = abgelaufen(dokument.gueltig_bis, stichtag);
          const freigebbar = darfAnKunden(dokument.art);

          return (
            <li
              key={dokument.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => oeffnen(dokument.id)}
                    disabled={laeuft}
                    className="truncate text-left text-[14px] font-medium text-text underline decoration-linie-stark underline-offset-2 hover:decoration-akzent"
                  >
                    {dokument.titel || dokument.dateiname}
                  </button>

                  {dokument.sichtbarkeit === "kunde" ? (
                    <Marke ton="akzent">Für Interessenten</Marke>
                  ) : (
                    <Marke>Nur intern</Marke>
                  )}

                  {ablauf && <Marke ton="fehler">Abgelaufen</Marke>}
                </div>

                <p className="mt-0.5 text-[12px] text-gedaempft">
                  {DOKUMENTARTEN[dokument.art]} · {dateigroesse(dokument.bytes)} ·
                  hinzugefügt {datum(dokument.erstellt_am)}
                  {dokument.gueltig_bis && ` · gültig bis ${datum(dokument.gueltig_bis)}`}
                </p>
              </div>

              {darfAendern && (
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Vertrauliche Arten haben diese Schaltflaeche gar nicht.
                      Der Schutz haengt aber nicht daran: Die Server-Aktion und
                      eine Bedingung in der Datenbank weisen die Freigabe
                      ebenfalls ab. */}
                  {freigebbar && (
                    <form action={sichtbarkeitUmschalten}>
                      <input type="hidden" name="dokument_id" value={dokument.id} />
                      <input type="hidden" name="objekt_id" value={objektId} />
                      <Button type="submit" variante="leise" groesse="klein">
                        {dokument.sichtbarkeit === "intern"
                          ? "Freigeben"
                          : "Zurückziehen"}
                      </Button>
                    </form>
                  )}

                  <form action={dokumentLoeschen}>
                    <input type="hidden" name="dokument_id" value={dokument.id} />
                    <input type="hidden" name="objekt_id" value={objektId} />
                    <Button type="submit" variante="leise" groesse="klein">
                      Löschen
                    </Button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
