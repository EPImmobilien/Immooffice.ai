import type { CSSProperties } from "react";

import { istHexfarbe, paletteAbleiten } from "./farben";

/**
 * Uebersetzt die Mandantenfarben in die semantischen Tokens der Anwendung
 * (globals.css: --f-primaer, --f-akzent …).
 *
 * Gesetzt werden nur die Tokens, die docs/AUTONOMIE.md B4 nennt: Kopfzeile,
 * Hauptschaltflaechen, Akzente. Hintergrund, Text und Statusfarben bleiben
 * Plattformdesign — sonst muesste jeder Mandant auch den Dunkelmodus pflegen.
 *
 * Ohne oder mit ungueltigen Farben kommt ein leeres Objekt zurueck: Dann gilt
 * unveraendert die Plattformmarke.
 */
export function mandantenStil(primaer: string | null, akzent: string | null): CSSProperties {
  if (!primaer || !akzent || !istHexfarbe(primaer) || !istHexfarbe(akzent)) return {};
  const p = paletteAbleiten(primaer, akzent);
  return {
    "--f-primaer": p.primaer,
    "--f-primaer-hover": p.primaerHover,
    "--f-primaer-text": p.textAufPrimaer,
    "--f-akzent": p.akzent,
    "--f-akzent-hover": p.akzentHover,
    "--f-akzent-text": p.textAufAkzent,
    "--f-akzent-schwach": p.akzentHell,
    "--f-fokus": p.akzent,
  } as CSSProperties;
}
