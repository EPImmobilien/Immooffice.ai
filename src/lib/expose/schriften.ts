import { Font } from "@react-pdf/renderer";

import {
  INTER_400,
  INTER_500,
  INTER_600,
  POPPINS_500,
  POPPINS_600,
  POPPINS_700,
} from "./schriften-daten";

/**
 * Hausschriften fuer alle PDF-Dokumente.
 *
 * Ohne diese Registrierung faellt die PDF-Erzeugung auf Helvetica zurueck.
 * Das ist kein Schoenheitsfehler: Die Anwendung tritt in Poppins und Inter
 * auf, das Exposé sah dadurch aus wie ein Ausdruck aus einem anderen
 * Programm. Die Wortmarke steht in Poppins — ein Dokument in Helvetica
 * daneben wirkt wie von einem fremden Absender.
 *
 * Die Schriften stehen als Daten-URL in `schriften-daten.ts` und werden zur
 * Laufzeit weder gesucht noch gelesen. Das ist kein Selbstzweck: Zuvor loeste
 * diese Datei die .woff-Dateien ueber `require.resolve` in `node_modules`
 * auf. Lokal ging das immer gut, im Auslieferungspaket der Serverfunktion
 * fehlten die Dateien jedoch — die Abhaengigkeitsanalyse kann einen Aufruf
 * nicht verfolgen, nur einen `import`. Auf Netlify warf der Aufruf, mit ihm
 * die ganze Route, und der Browser legte das Ergebnis als `pdf.txt` ab.
 * Details und die geprueften Alternativen im Kopf von
 * `scripts/schriften-einbetten.mjs`.
 *
 * Bewusst OHNE `server-only`: Die Datei wird von den Vorlagen eingebunden,
 * und die laufen auch im Test. Die Vorlagen selbst werden ausschliesslich
 * serverseitig gerendert.
 */

let registriert = false;

/**
 * Registriert die Schriften genau einmal.
 *
 * `Font.register` ist global. Ein zweiter Aufruf mit derselben Familie
 * ueberschreibt die Angaben und kostet bei jedem PDF unnoetig Zeit.
 */
export function schriftenBereitstellen(): void {
  if (registriert) return;

  Font.register({
    family: "Poppins",
    fonts: [
      { src: POPPINS_500, fontWeight: 500 },
      { src: POPPINS_600, fontWeight: 600 },
      { src: POPPINS_700, fontWeight: 700 },
    ],
  });

  Font.register({
    family: "Inter",
    fonts: [
      { src: INTER_400, fontWeight: 400 },
      { src: INTER_500, fontWeight: 500 },
      { src: INTER_600, fontWeight: 600 },
    ],
  });

  // Ohne diesen Eingriff trennt die PDF-Erzeugung Woerter an vermeintlichen
  // Silbengrenzen. Fuer deutsche Zusammensetzungen wie "Mehrfamilienhaus"
  // faellt das Ergebnis regelmaessig falsch aus. Lieber ein etwas
  // unruhigerer Flattersatz als "Mehrfamilie-nhaus" im Kundendokument.
  Font.registerHyphenationCallback((wort) => [wort]);

  registriert = true;
}
