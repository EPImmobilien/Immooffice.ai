"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Hinweis, Marke } from "@/components/ui/Status";
import {
  AKTIONEN,
  MODULE,
  ROLLEN_BEZEICHNUNG,
  hatRecht,
  type Aktion,
  type Modul,
  type Rolle,
  type Uebersteuerung,
} from "@/lib/auth/rechte";
import { cn } from "@/lib/cn";
import { rechteSetzen } from "@/server/einstellungen-aktionen";

/**
 * Rechte je Benutzer: Rollenvorlage plus Einzelhäkchen.
 *
 * Die Rolle bleibt die Grundlage. Was hier abweicht, wird als Abweichung
 * gespeichert — nicht als vollständige Rechteliste. Dadurch wirkt eine spätere
 * Änderung der Rollenvorlage weiterhin, ausser bei den Punkten, die hier
 * ausdrücklich anders stehen.
 *
 * Deshalb zeigt die Tabelle auch an, welches Häkchen von der Rolle abweicht:
 * Ohne diese Kennzeichnung wäre nach einem Rollenwechsel nicht mehr zu erkennen,
 * was absichtlich anders ist und was aus der Rolle folgt.
 */

const MODUL_BEZEICHNUNG: Record<Modul, string> = {
  objekte: "Objekte",
  kontakte: "Kontakte",
  exposes: "Exposés",
  wertermittlung: "Wertermittlung",
  vertraege: "Verträge",
  marketing: "Marketing",
  kalender: "Kalender und Aufgaben",
  auswertungen: "Auswertungen",
  einstellungen: "Einstellungen",
  abrechnung: "Abo und Credits",
  postfach: "Postfach",
};

const AKTION_BEZEICHNUNG: Record<Aktion, string> = {
  lesen: "Lesen",
  anlegen: "Anlegen",
  aendern: "Ändern",
  loeschen: "Löschen",
  freigeben: "Freigeben",
};

export function Rechtematrix({
  benutzerId,
  name,
  rolle,
  uebersteuerung,
}: {
  benutzerId: string;
  name: string;
  rolle: Rolle;
  uebersteuerung: Uebersteuerung;
}) {
  const [offen, setOffen] = useState(false);
  const [meldung, setMeldung] = useState<{ ton: "erfolg" | "fehler"; text: string } | null>(
    null,
  );
  const [laeuft, starten] = useTransition();

  function absenden(daten: FormData) {
    setMeldung(null);
    starten(async () => {
      const ergebnis = await rechteSetzen(daten);
      if (ergebnis.fehler) setMeldung({ ton: "fehler", text: ergebnis.fehler });
      else if (ergebnis.hinweis) {
        setMeldung({ ton: "erfolg", text: ergebnis.hinweis });
      }
    });
  }

  const anzahlAbweichungen = Object.values(uebersteuerung).reduce(
    (summe, aktionen) => summe + Object.keys(aktionen ?? {}).length,
    0,
  );

  if (!offen) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variante="leise"
          groesse="klein"
          onClick={() => setOffen(true)}
        >
          Rechte anpassen
        </Button>
        {anzahlAbweichungen > 0 && (
          <Marke ton="akzent">
            {anzahlAbweichungen}{" "}
            {anzahlAbweichungen === 1 ? "Abweichung" : "Abweichungen"}
          </Marke>
        )}
      </div>
    );
  }

  return (
    <form
      action={absenden}
      className="mt-2 space-y-4 rounded-[var(--radius)] border border-linie bg-flaeche p-4"
    >
      <input type="hidden" name="benutzer_id" value={benutzerId} />

      <div>
        <p className="text-[13px] font-medium text-text">
          Rechte von {name}
        </p>
        <p className="mt-0.5 text-[12px] text-gedaempft">
          Grundlage ist die Rolle „{ROLLEN_BEZEICHNUNG[rolle]}“. Gespeichert wird
          nur, was davon abweicht — eine spätere Änderung der Rolle wirkt
          dadurch weiterhin.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-linie">
              <th className="py-2 pr-3 text-left font-medium text-gedaempft">
                Modul
              </th>
              {AKTIONEN.map((aktion) => (
                <th
                  key={aktion}
                  className="px-2 py-2 text-center font-medium text-gedaempft"
                >
                  {AKTION_BEZEICHNUNG[aktion]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULE.map((modul) => (
              <tr key={modul} className="border-b border-linie last:border-0">
                <td className="py-2 pr-3 text-text">{MODUL_BEZEICHNUNG[modul]}</td>
                {AKTIONEN.map((aktion) => {
                  const ausRolle = hatRecht(rolle, modul, aktion);
                  const gesetzt = hatRecht(rolle, modul, aktion, uebersteuerung);
                  const weichtAb = gesetzt !== ausRolle;

                  return (
                    <td key={aktion} className="px-2 py-2 text-center">
                      <label className="inline-flex cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          name="recht"
                          value={`${modul}:${aktion}`}
                          defaultChecked={gesetzt}
                          className={cn(
                            "size-4 rounded border-linie-stark accent-akzent",
                            // Abweichungen sind hervorgehoben, damit nach einem
                            // Rollenwechsel erkennbar bleibt, was absichtlich
                            // anders ist.
                            weichtAb && "ring-2 ring-akzent ring-offset-1",
                          )}
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-gedaempft">
        Umrandete Häkchen weichen von der Rolle ab. Rechte werden serverseitig
        und in der Datenbank erzwungen — ein hier gesetztes Häkchen öffnet nichts,
        was die Datenbank nicht zulässt.
      </p>

      {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}

      <div className="flex gap-2">
        <Button type="submit" groesse="klein" disabled={laeuft}>
          {laeuft ? "Speichert …" : "Rechte speichern"}
        </Button>
        <Button
          type="button"
          variante="leise"
          groesse="klein"
          onClick={() => setOffen(false)}
        >
          Schließen
        </Button>
      </div>
    </form>
  );
}
