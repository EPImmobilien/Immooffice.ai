/**
 * Layout-Hilfen fuer die Marketingmotive.
 *
 * Getrennt von der Vorlage, weil hier die einzige wirklich fehleranfaellige
 * Stelle liegt: Text hat eine Ausdehnung, die im SVG niemand misst. Wer
 * Positionen als feste Bruchteile der Flaeche setzt, bekommt bei langen Titeln
 * ueberlaufende Zeilen und uebereinanderliegende Bloecke.
 */

/**
 * Mittlere Zeichenbreite im Verhaeltnis zur Schriftgroesse.
 *
 * Naeherungswerte fuer Poppins und Inter in halbfetter Auszeichnung. Eine
 * echte Messung braeuchte die Schriftmetrik; fuer den Umbruch genuegt die
 * Naeherung, solange sie eher zu breit schaetzt als zu schmal — dann bricht
 * lieber eine Zeile zu frueh um, als dass Text ueber den Rand laeuft.
 */
const ZEICHENBREITE = 0.56;

/** Wie viele Zeichen passen bei dieser Schriftgroesse in die Breite? */
export function zeichenProZeile(breite: number, schriftgroesse: number): number {
  return Math.max(8, Math.floor(breite / (schriftgroesse * ZEICHENBREITE)));
}

/**
 * Bricht Text auf hoechstens `maxZeilen` um und kuerzt bei Bedarf mit Auslassung.
 *
 * Woerter werden nie zerrissen. Passt das letzte Wort nicht mehr, endet die
 * Zeile mit einem Auslassungszeichen — ein abgeschnittener Titel ohne Hinweis
 * wirkt wie ein Fehler.
 */
export function umbrechen(
  text: string,
  breite: number,
  schriftgroesse: number,
  maxZeilen: number,
): string[] {
  const grenze = zeichenProZeile(breite, schriftgroesse);
  const worte = text.trim().split(/\s+/);
  const zeilen: string[] = [];
  let aktuell = "";

  for (const wort of worte) {
    const versuch = aktuell ? `${aktuell} ${wort}` : wort;

    if (versuch.length <= grenze) {
      aktuell = versuch;
      continue;
    }

    if (aktuell) zeilen.push(aktuell);

    if (zeilen.length === maxZeilen) {
      // Kein Platz mehr: letzte Zeile kuerzen und kennzeichnen.
      const letzte = zeilen[maxZeilen - 1]!;
      zeilen[maxZeilen - 1] =
        letzte.length > grenze - 1 ? `${letzte.slice(0, grenze - 1).trimEnd()}…` : `${letzte}…`;
      return zeilen;
    }

    // Einzelnes Wort laenger als eine Zeile: hart kuerzen.
    aktuell = wort.length > grenze ? `${wort.slice(0, grenze - 1)}…` : wort;
  }

  if (aktuell && zeilen.length < maxZeilen) zeilen.push(aktuell);
  return zeilen.length > 0 ? zeilen : [""];
}

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
