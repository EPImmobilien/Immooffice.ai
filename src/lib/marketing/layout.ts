/**
 * Layout-Hilfen fuer die Marketingmotive.
 *
 * Getrennt von der Vorlage, weil hier die einzige wirklich fehleranfaellige
 * Stelle liegt: Text hat eine Ausdehnung, die im SVG niemand misst. Wer
 * Positionen als feste Bruchteile der Flaeche setzt, bekommt bei langen Titeln
 * ueberlaufende Zeilen und uebereinanderliegende Bloecke.
 */

// Der Zeilenumbruch liegt jetzt zentral in src/lib/textumbruch.ts, weil die
// PDF-Vorlagen ihn ebenfalls brauchen. Der Re-Export haelt die bisherigen
// Aufrufe im Marketingmodul unveraendert.
export { ZEICHENBREITE, umbrechen, zeichenProZeile } from "@/lib/textumbruch";

/** Maskiert die fuer XML kritischen Zeichen. */
export function xmlText(wert: string): string {
  return wert
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Senkrechter Fluss.
 *
 * Statt jede Position einzeln auszurechnen, wandert ein Zeiger nach unten und
 * gibt die naechste Grundlinie zurueck. Dadurch koennen sich Bloecke nicht
 * mehr ueberlagern, auch wenn ein Titel zwei statt einer Zeile braucht.
 */
export class Fluss {
  private y: number;

  constructor(start: number) {
    this.y = start;
  }

  /** Reserviert `hoehe` und liefert die Grundlinie des Blocks. */
  naechste(hoehe: number, abstandDavor = 0): number {
    this.y += abstandDavor + hoehe;
    return this.y;
  }

  /** Aktuelle Position, ohne etwas zu reservieren. */
  get stand(): number {
    return this.y;
  }

  /** Springt auf eine feste Position, etwa fuer am Fuss verankerte Bloecke. */
  setze(y: number): void {
    this.y = y;
  }
}
