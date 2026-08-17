/**
 * Zeilenumbruch mit geschaetzter Zeichenbreite.
 *
 * Gebraucht ueberall dort, wo die Hoehe eines Textblocks VOR dem Setzen
 * bekannt sein muss: in den SVG-Marketingmotiven, weil SVG nicht umbricht,
 * und in den PDF-Vorlagen an den Stellen, an denen die Layout-Engine die
 * Hoehe eines umbrechenden Titels falsch misst und der folgende Block ihn
 * dann ueberlagert.
 *
 * Frueher lag das nur im Marketingmodul. Die PDF-Vorlagen haetten sonst
 * quer darauf zugreifen muessen — oder, wahrscheinlicher, eine zweite
 * Fassung bekommen, die sich langsam anders verhaelt.
 */

/**
 * Mittlere Zeichenbreite im Verhaeltnis zur Schriftgroesse.
 *
 * Naeherungswerte fuer Poppins und Inter in halbfetter Auszeichnung. Eine
 * echte Messung braeuchte die Schriftmetrik; fuer den Umbruch genuegt die
 * Naeherung, solange sie eher zu breit schaetzt als zu schmal — dann bricht
 * lieber eine Zeile zu frueh um, als dass Text ueber den Rand laeuft.
 */
export const ZEICHENBREITE = 0.56;

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
