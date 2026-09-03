import Link from "next/link";

import { cn } from "@/lib/cn";
import { SCHRITTE } from "@/lib/onboarding";

/**
 * Fortschritt ueber die acht Schritte. Erreichte Schritte sind Links —
 * zurueckspringen ist erlaubt, vorspringen nicht (die Pflichtschritte sollen
 * in Reihenfolge entstehen).
 */
export function Schrittleiste({ aktuell, erreicht }: { aktuell: number; erreicht: number }) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Schritte der Einrichtung">
      {SCHRITTE.map((s) => {
        const istAktuell = s.nr === aktuell;
        const istErreichbar = s.nr <= Math.max(erreicht, aktuell);
        const klassen = cn(
          "flex h-8 items-center gap-1.5 rounded-[var(--radius)] border px-2.5 text-[12px] font-medium",
          istAktuell
            ? "border-primaer bg-primaer text-primaer-text"
            : istErreichbar
              ? "border-linie bg-flaeche text-text hover:border-akzent/50"
              : "border-linie bg-flaeche-gedaempft text-gedaempft",
        );
        const inhalt = (
          <>
            <span className="tabular-nums">{s.nr}</span>
            <span className="hidden sm:inline">{s.titel}</span>
          </>
        );
        return (
          <li key={s.nr} aria-current={istAktuell ? "step" : undefined}>
            {istErreichbar && !istAktuell ? (
              <Link href={`/onboarding/${s.nr}`} className={klassen}>
                {inhalt}
              </Link>
            ) : (
              <span className={klassen}>{inhalt}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
