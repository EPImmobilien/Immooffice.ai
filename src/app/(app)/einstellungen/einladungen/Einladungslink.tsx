"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Hinweis } from "@/components/ui/Status";

/**
 * Zeigt den frisch erzeugten Einladungslink.
 *
 * Bewusst auffällig und mit dem Hinweis, dass er nur einmal erscheint: In der
 * Datenbank liegt nur seine Prüfsumme. Wer die Seite verlässt, ohne den Link
 * mitzunehmen, muss einen neuen erzeugen.
 */
export function Einladungslink({ adresse }: { adresse: string }) {
  const [kopiert, setKopiert] = useState(false);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(adresse);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 4000);
    } catch {
      // Ohne Zugriff auf die Zwischenablage bleibt der Text zum Markieren
      // stehen — deshalb hier bewusst keine Fehlermeldung.
    }
  }

  return (
    <Hinweis ton="akzent" titel="Dieser Link erscheint nur jetzt">
      <p className="mb-2">
        Geben Sie ihn der eingeladenen Person weiter. Annehmen kann ihn nur, wer
        sich mit genau der eingeladenen E-Mail-Adresse anmeldet.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-[var(--radius-klein)] border border-akzent/30 bg-flaeche px-2.5 py-1.5 font-mono text-[12px] break-all text-text">
          {adresse}
        </code>
        <Button type="button" variante="sekundaer" groesse="klein" onClick={kopieren}>
          {kopiert ? "Kopiert" : "Kopieren"}
        </Button>
      </div>
    </Hinweis>
  );
}
