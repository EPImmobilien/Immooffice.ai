import { createRequire } from "node:module";

import { Font } from "@react-pdf/renderer";

/**
 * Hausschriften fuer alle PDF-Dokumente.
 *
 * Ohne diese Registrierung faellt die PDF-Erzeugung auf Helvetica zurueck.
 * Das ist kein Schoenheitsfehler: Die Anwendung tritt in Poppins und Inter
 * auf, das Exposé sah dadurch aus wie ein Ausdruck aus einem anderen
 * Programm. Die Wortmarke steht in Poppins — ein Dokument in Helvetica
 * daneben wirkt wie von einem fremden Absender.
 *
 * Die Dateien liegen in @fontsource und werden ueber `require.resolve`
 * aufgeloest, nicht ueber einen Pfad relativ zum Arbeitsverzeichnis. Auf
 * Netlify laeuft die Funktion in einem anderen Verzeichnis als lokal; ein
 * relativer Pfad haette dort ins Leere gezeigt.
 *
 * Bewusst OHNE `server-only`: Die Datei wird von den Vorlagen eingebunden,
 * und die laufen auch im Test. Die Vorlagen selbst werden ausschliesslich
 * serverseitig gerendert.
 */

const aufloesen = createRequire(import.meta.url);

function datei(paket: string): string {
  return aufloesen.resolve(paket);
}

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
      { src: datei("@fontsource/poppins/files/poppins-latin-500-normal.woff"), fontWeight: 500 },
      { src: datei("@fontsource/poppins/files/poppins-latin-600-normal.woff"), fontWeight: 600 },
      { src: datei("@fontsource/poppins/files/poppins-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });

  Font.register({
    family: "Inter",
    fonts: [
      { src: datei("@fontsource/inter/files/inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: datei("@fontsource/inter/files/inter-latin-500-normal.woff"), fontWeight: 500 },
      { src: datei("@fontsource/inter/files/inter-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });

  // Ohne diesen Eingriff trennt die PDF-Erzeugung Woerter an vermeintlichen
  // Silbengrenzen. Fuer deutsche Zusammensetzungen wie "Mehrfamilienhaus"
  // faellt das Ergebnis regelmaessig falsch aus. Lieber ein etwas
  // unruhigerer Flattersatz als "Mehrfamilie-nhaus" im Kundendokument.
  Font.registerHyphenationCallback((wort) => [wort]);

  registriert = true;
}
