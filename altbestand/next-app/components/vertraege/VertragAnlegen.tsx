"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Auswahl, Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { VERTRAGSARTEN } from "@/lib/vertraege";
import { vertragAnlegen } from "@/server/vertrag-aktionen";

export function VertragAnlegen({
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
      const e = await vertragAnlegen(daten);
      if (e?.fehler) setFehler(e.fehler);
    });
  }

  if (!offen) {
    return (
      <Button type="button" onClick={() => setOffen(true)}>
        Neuer Vertrag
      </Button>
    );
  }

  return (
    <form
      action={absenden}
      className="space-y-4 rounded-[var(--radius-gross)] border border-linie bg-flaeche p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Titel" id="v-titel">
          <Eingabe
            name="titel"
            required
            maxLength={200}
            placeholder="Maklervertrag Rosenweg 12"
          />
        </Feld>
        <Feld beschriftung="Art" id="v-art">
          <Auswahl name="art" defaultValue="maklervertrag">
            {Object.entries(VERTRAGSARTEN).map(([wert, name]) => (
              <option key={wert} value={wert}>
                {name}
              </option>
            ))}
          </Auswahl>
        </Feld>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld beschriftung="Objekt" id="v-objekt" hinweis="Optional">
          <Auswahl name="objekt_id" defaultValue="">
            <option value="">Kein Bezug</option>
            {objekte.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Auswahl>
        </Feld>
        <Feld beschriftung="Vertragspartner" id="v-kontakt" hinweis="Optional">
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
        <Button type="button" variante="leise" onClick={() => setOffen(false)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
