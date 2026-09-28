"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { wertermittlungAnlegen } from "@/server/wertermittlung-aktionen";

/**
 * Neue Wertermittlung.
 *
 * Objekt und Kontakt sind beide freiwillig: Eine Wertermittlung entsteht oft
 * VOR dem Objekt — als das, was man beim Eigentuemer auf den Tisch legt, um den
 * Auftrag zu bekommen.
 */
export function WertermittlungAnlegen({
  objekte,
  kontakte,
}: {
  objekte: { id: string; name: string }[];
  kontakte: { id: string; name: string }[];
}) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  function absenden(daten: FormData) {
    setFehler(null);
    starten(async () => {
      const ergebnis = await wertermittlungAnlegen(daten);
      if (ergebnis?.fehler) setFehler(ergebnis.fehler);
    });
  }

  if (!offen) {
    return (
      <Button type="button" onClick={() => setOffen(true)}>
        Neue Wertermittlung
      </Button>
    );
  }

  return (
    <form
      action={absenden}
      className="space-y-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Bezeichnung" id="w-bezeichnung">
          <Eingabe
            name="bezeichnung"
            required
            maxLength={200}
            placeholder="ETW Rosenweg 12 — Einschätzung"
          />
        </Feld>
        <Feld beschriftung="Stichtag" id="w-stichtag">
          <Eingabe
            type="date"
            name="stichtag"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Feld>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Objekt" id="w-objekt" hinweis="Optional">
          <Auswahl name="objekt_id" defaultValue="">
            <option value="">Kein Objekt im Bestand</option>
            {objekte.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Auswahl>
        </Feld>
        <Feld beschriftung="Eigentümer" id="w-kontakt" hinweis="Optional">
          <Auswahl name="kontakt_id" defaultValue="">
            <option value="">Nicht zugeordnet</option>
            {kontakte.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Auswahl>
        </Feld>
      </div>

      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}

      <div className="flex gap-2">
        <Button type="submit" disabled={laeuft}>
          {laeuft ? "Legt an …" : "Anlegen"}
        </Button>
        <Button
          type="button"
          variante="leise"
          onClick={() => setOffen(false)}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
