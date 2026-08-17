"use client";

import { useState } from "react";

import { Auswahl, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import {
  AKTIONEN,
  MODULE,
  ROLLEN,
  ROLLEN_BEZEICHNUNG,
  hatRecht,
  rechtSchluessel,
  rollenVorgabe,
  type Aktion,
  type Modul,
  type Rolle,
  type Uebersteuerung,
} from "@/lib/auth/rechte";

const MODUL_BEZEICHNUNG: Record<Modul, string> = {
  objekte: "Objekte",
  kontakte: "Kontakte und Suchprofile",
  exposes: "Exposés",
  wertermittlung: "Wertermittlung",
  vertraege: "Verträge",
  marketing: "Marketing",
  kalender: "Kalender und Aufgaben",
  auswertungen: "Auswertungen",
  einstellungen: "Einstellungen",
  abrechnung: "Abo und Credits",
};

const AKTION_BEZEICHNUNG: Record<Aktion, string> = {
  lesen: "Sehen",
  anlegen: "Anlegen",
  aendern: "Ändern",
  loeschen: "Löschen",
  freigeben: "Freigeben",
};

/**
 * Rollenauswahl und Einzelhäkchen — die Vorlage plus Feinjustierung aus
 * Abschnitt 5.
 *
 * Rolle und Häkchen stehen bewusst in einem Bauteil: Beim Wechsel der Rolle
 * müssen die Häkchen auf deren Vorbelegung zurückspringen. Getrennt bliebe
 * sonst die Feinjustierung der alten Rolle stehen, und der Benutzer bekäme
 * Rechte, die niemand bewusst vergeben hat.
 *
 * Gesendet werden nur die gesetzten Häkchen (`recht`). Die Serveraktion
 * bildet daraus die Abweichung zur Rolle — die volle Matrix wandert nicht in
 * die Datenbank.
 */
export function RechteGitter({
  rolle: anfangsRolle,
  uebersteuerung,
  rollenSperre,
  hinweisRolle,
}: {
  rolle: Rolle;
  uebersteuerung?: Uebersteuerung | undefined;
  /** Rollen, die der Bearbeitende nicht vergeben darf — etwa "inhaber". */
  rollenSperre?: Rolle[] | undefined;
  hinweisRolle?: string | undefined;
}) {
  const [rolle, setRolle] = useState<Rolle>(anfangsRolle);

  // Beim ersten Aufbau gelten die gespeicherten Abweichungen; nach einem
  // Rollenwechsel nur noch die Vorbelegung der neuen Rolle.
  const [gesetzt, setGesetzt] = useState<Set<string>>(() => {
    const anfang = new Set<string>();
    for (const modul of MODULE) {
      for (const aktion of AKTIONEN) {
        if (hatRecht({ rolle: anfangsRolle, uebersteuerung }, modul, aktion)) {
          anfang.add(rechtSchluessel(modul, aktion));
        }
      }
    }
    return anfang;
  });

  function rolleWechseln(neu: Rolle) {
    setRolle(neu);
    const vorgabe = new Set<string>();
    for (const modul of MODULE) {
      for (const aktion of AKTIONEN) {
        if (rollenVorgabe(neu, modul, aktion)) {
          vorgabe.add(rechtSchluessel(modul, aktion));
        }
      }
    }
    setGesetzt(vorgabe);
  }

  function umschalten(schluessel: string) {
    setGesetzt((vorher) => {
      const neu = new Set(vorher);
      if (neu.has(schluessel)) neu.delete(schluessel);
      else neu.add(schluessel);
      return neu;
    });
  }

  const gesperrt = new Set(rollenSperre ?? []);
  const abweichungen = [...MODULE].reduce((summe, modul) => {
    return (
      summe +
      AKTIONEN.filter(
        (aktion) =>
          gesetzt.has(rechtSchluessel(modul, aktion)) !==
          rollenVorgabe(rolle, modul, aktion),
      ).length
    );
  }, 0);

  return (
    <div className="space-y-5">
      <Feld id="rolle" beschriftung="Rolle" pflicht {...(hinweisRolle ? { hinweis: hinweisRolle } : {})}>
        <Auswahl
          name="rolle"
          value={rolle}
          onChange={(e) => rolleWechseln(e.target.value as Rolle)}
        >
          {ROLLEN.filter((r) => !gesperrt.has(r)).map((r) => (
            <option key={r} value={r}>
              {ROLLEN_BEZEICHNUNG[r]}
            </option>
          ))}
        </Auswahl>
      </Feld>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] font-medium text-text">Rechte im Einzelnen</p>
          <p className="text-xs text-gedaempft">
            {abweichungen === 0
              ? "unverändert gegenüber der Rolle"
              : abweichungen === 1
                ? "1 Abweichung von der Rolle"
                : `${abweichungen} Abweichungen von der Rolle`}
          </p>
        </div>

        <div className="overflow-x-auto rounded-[var(--radius)] border border-linie">
          <table className="w-full min-w-[34rem] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-linie bg-flaeche-gedaempft">
                <th scope="col" className="px-3 py-2 text-left font-medium text-gedaempft">
                  Modul
                </th>
                {AKTIONEN.map((aktion) => (
                  <th
                    key={aktion}
                    scope="col"
                    className="px-3 py-2 text-center font-medium text-gedaempft"
                  >
                    {AKTION_BEZEICHNUNG[aktion]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULE.map((modul) => (
                <tr key={modul} className="border-b border-linie last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-text">
                    {MODUL_BEZEICHNUNG[modul]}
                  </th>
                  {AKTIONEN.map((aktion) => {
                    const schluessel = rechtSchluessel(modul, aktion);
                    const an = gesetzt.has(schluessel);
                    const abweichend = an !== rollenVorgabe(rolle, modul, aktion);

                    return (
                      <td key={aktion} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          name="recht"
                          value={schluessel}
                          checked={an}
                          onChange={() => umschalten(schluessel)}
                          aria-label={`${AKTION_BEZEICHNUNG[aktion]} in ${MODUL_BEZEICHNUNG[modul]}`}
                          className={
                            abweichend
                              ? "size-4 accent-akzent ring-2 ring-akzent ring-offset-2 ring-offset-[var(--f-flaeche)]"
                              : "size-4 accent-akzent"
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Hinweis ton="info">
        Häkchen, die von der Rolle abweichen, sind hervorgehoben. Die Rechte
        gelten serverseitig und in der Datenbank — ein entferntes Häkchen
        blendet nicht nur eine Schaltfläche aus.
      </Hinweis>
    </div>
  );
}
