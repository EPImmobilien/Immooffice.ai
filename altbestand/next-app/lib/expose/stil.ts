/**
 * Gemeinsame Gestaltungsgroessen aller Exposé-Vorlagen.
 *
 * Eine Stelle statt fuenf: Vorher hatte jede Vorlage ihre eigenen
 * Schriftgroessen und Abstaende, mit dem Ergebnis, dass sie zwar
 * unterschiedlich aussahen — aber nicht wie fuenf Fassungen desselben
 * Hauses, sondern wie fuenf verschiedene Programme.
 *
 * Die Groessen folgen einer Skala mit festem Verhaeltnis. Das ist der
 * Unterschied zwischen "hat verschiedene Groessen" und "hat eine Hierarchie":
 * Ein Dokument, in dem alles zwischen 9 und 11 Punkt liegt, wirkt wie ein
 * Formular, egal wie sauber es gesetzt ist.
 */

export const SCHRIFT = {
  titel: "Poppins",
  text: "Inter",
} as const;

/** Punktgroessen fuer A4. Andere Formate skalieren mit einem Faktor. */
export const GROESSE = {
  riesig: 30,
  gross: 22,
  mittel: 15,
  klein: 10.5,
  text: 9.5,
  fein: 8,
  winzig: 6.8,
} as const;

export const ABSTAND = {
  seite: 46,
  block: 22,
  absatz: 10,
  zeile: 5,
} as const;

/**
 * Farben, die NICHT vom Mandanten kommen.
 *
 * Primaer- und Akzentfarbe stammen aus dem Branding und werden uebergeben.
 * Grautoene und Linien sind Teil der Vorlage — sie mandantenspezifisch zu
 * machen, brachte nichts ausser der Moeglichkeit, sie falsch einzustellen.
 */
export const FARBE = {
  gedaempft: "#7A828C",
  linie: "#E6E8EB",
  linieZart: "#F0F2F4",
  flaeche: "#FAFAFA",
  weiss: "#FFFFFF",
} as const;

/**
 * Sperrung fuer Kleinbuchstaben in Versalien.
 *
 * Versalien ohne Sperrung wirken gedraengt. Der Wert ist bewusst an die
 * Schriftgroesse gekoppelt und keine feste Punktzahl.
 */
export function gesperrt(groesse: number): number {
  return groesse * 0.12;
}
