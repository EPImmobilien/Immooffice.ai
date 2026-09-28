"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe } from "@/components/ui/Feld";
import type { Vergleichsobjekt } from "@/lib/wertermittlung";

/**
 * Zeilen fuer Vergleichsobjekte.
 *
 * Immer eine leere Zeile mehr als gefuellt: Wer ein weiteres Objekt eintragen
 * will, soll nicht erst eine Schaltflaeche suchen. Vollstaendig leere Zeilen
 * verwirft die Server-Aktion.
 *
 * Die Anpassung ist ein einziger Prozentwert je Objekt und keine
 * Merkmalstabelle. Eine Anwendung, die Zu- und Abschlaege fuer Lage, Zustand
 * und Ausstattung selbst vergibt, trifft genau die Entscheidungen, die der
 * Nutzer verantworten soll.
 */
export function Vergleichsobjekte({
  objekte,
}: {
  objekte: readonly Vergleichsobjekt[];
}) {
  const [zusatz, setZusatz] = useState(1);
  const zeilen = [
    ...objekte,
    ...Array.from({ length: zusatz }, () => ({
      bezeichnung: "",
      kaufpreis: null,
      wohnflaeche: null,
      anpassung: null,
    })),
  ];

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-text">Vergleichsobjekte</p>
      <p className="text-[12px] text-gedaempft">
        Tatsächliche Verkäufe aus der Kaufpreissammlung oder eigene Abschlüsse.
        Der Zu- oder Abschlag gleicht Unterschiede in Lage, Zustand und
        Ausstattung aus — er ist Ihre Einschätzung.
      </p>

      <div className="space-y-2">
        {zeilen.map((objekt, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <div className="col-span-5">
              <Eingabe
                name="v_bezeichnung"
                defaultValue={objekt.bezeichnung}
                placeholder="Vergleich, Straße oder Kennung"
                aria-label={`Vergleichsobjekt ${i + 1}, Bezeichnung`}
                className="text-[13px]"
              />
            </div>
            <div className="col-span-3">
              <Eingabe
                type="number"
                step="0.01"
                name="v_kaufpreis"
                defaultValue={objekt.kaufpreis ?? ""}
                placeholder="Preis €"
                aria-label={`Vergleichsobjekt ${i + 1}, Kaufpreis`}
                className="text-[13px]"
              />
            </div>
            <div className="col-span-2">
              <Eingabe
                type="number"
                step="0.01"
                name="v_wohnflaeche"
                defaultValue={objekt.wohnflaeche ?? ""}
                placeholder="m²"
                aria-label={`Vergleichsobjekt ${i + 1}, Wohnfläche`}
                className="text-[13px]"
              />
            </div>
            <div className="col-span-2">
              <Eingabe
                type="number"
                step="0.1"
                name="v_anpassung"
                defaultValue={objekt.anpassung ?? ""}
                placeholder="± %"
                aria-label={`Vergleichsobjekt ${i + 1}, Anpassung in Prozent`}
                className="text-[13px]"
              />
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variante="leise"
        groesse="klein"
        onClick={() => setZusatz((n) => n + 1)}
      >
        Weitere Zeile
      </Button>
    </div>
  );
}
