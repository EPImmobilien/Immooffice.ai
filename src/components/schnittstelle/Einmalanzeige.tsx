"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Hinweis } from "@/components/ui/Status";

/**
 * Zeigt einen Schluessel oder ein Geheimnis genau einmal an — mit Kopieren.
 * Nach dem Neuladen ist der Wert weg; die Datenbank kennt nur Hash oder
 * verschluesselten Wert.
 */
export function Einmalanzeige({ wert, bezeichnung }: { wert: string; bezeichnung: string }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <Hinweis ton="warnung" titel={`${bezeichnung} — jetzt sichern`}>
      <p className="mb-2">Dieser Wert erscheint nur dieses eine Mal. Bitte sofort im Zielsystem hinterlegen.</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-[var(--radius-klein)] bg-flaeche px-2 py-1 font-mono text-[12px] break-all select-all">{wert}</code>
        <Button
          type="button"
          variante="sekundaer"
          groesse="klein"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(wert);
              setKopiert(true);
            } catch {
              setKopiert(false);
            }
          }}
        >
          {kopiert ? "Kopiert" : "Kopieren"}
        </Button>
      </div>
    </Hinweis>
  );
}
