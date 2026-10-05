// ============================================================================
// Umbruch, Blocksatz, Verdichtung
// ----------------------------------------------------------------------------
// Die drei Prototypen haben drei Textmaschinen, die sich in genau drei
// Punkten unterscheiden: dem Absatzabstand (0,55 / 0,6 / 0,5 der
// Zeilenhoehe), dem Einzug der ersten Zeilen (nur Signature) und der
// Vorgabe fuer den Blocksatz. Alles andere ist Zeichen fuer Zeichen
// dasselbe. Darum eine Maschine mit drei Stellschrauben, nicht drei
// Maschinen — sonst laufen sie auseinander, sobald eine davon gepflegt
// wird.
//
// Der Umbruch ist bewusst gierig und kennt keine Trennung: so machen es
// die Prototypen, und ein Umbruchalgorithmus mit Trennstellen wuerde die
// verbindliche Vorlage an jedem laengeren Absatz verlassen.
// ============================================================================

import type { Metrik } from "./schrift";
import { breite } from "./schrift";

export type SatzRegeln = {
  /** Blocksatz: alle Zeilen ausser der letzten eines Absatzes dehnen. */
  blocksatz: boolean;
  /** Zusaetzlicher Abstand zwischen Absaetzen, als Faktor der Zeilenhoehe. */
  absatzFaktor: number;
  /** Einzug der ersten Zeilen des ersten Absatzes, in Punkt. */
  einzug: number;
  /** Fuer wie viele Zeilen der Einzug gilt. */
  einzugZeilen: number;
};

export const SATZ_RASTER: SatzRegeln =
  { blocksatz: true, absatzFaktor: 0.55, einzug: 0, einzugZeilen: 0 };
export const SATZ_SIGNATURE: SatzRegeln =
  { blocksatz: true, absatzFaktor: 0.6, einzug: 0, einzugZeilen: 0 };
export const SATZ_STUDIO: SatzRegeln =
  { blocksatz: false, absatzFaktor: 0.5, einzug: 0, einzugZeilen: 0 };

export type Zeile = {
  /** Die Woerter der Zeile — getrennt, weil der Blocksatz sie einzeln setzt. */
  woerter: string[];
  /** Letzte Zeile ihres Absatzes: kein Blocksatz. */
  letzte: boolean;
  /** Einzug dieser Zeile in Punkt. */
  einzug: number;
  /** Nummer des Absatzes, bei 0 beginnend. */
  absatz: number;
};

/**
 * Bricht einen Text in Zeilen. `\n` trennt Absaetze.
 *
 * Die Schleife ist die der Prototypen: ein Wort probehalber anhaengen,
 * passt es nicht, die Zeile abschliessen und mit dem Wort neu beginnen.
 * Ein einzelnes Wort, das breiter ist als die Spalte, erzeugt dadurch
 * eine leere Zeile und steht danach allein — genau wie dort. Das ist
 * kein Versehen, sondern das Verhalten, gegen das die Referenz-PDFs
 * gesetzt sind.
 */
export function umbrechen(
  m: Metrik,
  s: string,
  groesse: number,
  maxBreite: number,
  regeln: SatzRegeln = SATZ_RASTER,
): Zeile[] {
  const raus: Zeile[] = [];
  const absaetze = s.split("\n");
  for (let ai = 0; ai < absaetze.length; ai++) {
    let zeile: string[] = [];
    const zeilenDesAbsatzes: Zeile[] = [];
    for (const wort of absaetze[ai].split(" ")) {
      const einzug = (ai === 0 && zeilenDesAbsatzes.length < regeln.einzugZeilen)
        ? regeln.einzug : 0;
      const probe = zeile.concat([wort]).join(" ");
      if (breite(m, probe, groesse) <= maxBreite - einzug) {
        zeile.push(wort);
      } else {
        zeilenDesAbsatzes.push({ woerter: zeile, letzte: false, einzug, absatz: ai });
        zeile = [wort];
      }
    }
    const einzug = (ai === 0 && zeilenDesAbsatzes.length < regeln.einzugZeilen)
      ? regeln.einzug : 0;
    zeilenDesAbsatzes.push({ woerter: zeile, letzte: true, einzug, absatz: ai });
    raus.push(...zeilenDesAbsatzes);
  }
  return raus;
}

/** Wie hoch ein Text wird, ohne ihn zu setzen. */
export function hoehe(zeilen: Zeile[], zeilenhoehe: number, regeln: SatzRegeln): number {
  if (zeilen.length === 0) return 0;
  const absaetze = zeilen[zeilen.length - 1].absatz + 1;
  return zeilen.length * zeilenhoehe
    + (absaetze - 1) * zeilenhoehe * regeln.absatzFaktor;
}

export type WortSatz = { x: number; y: number; text: string };

/**
 * Rechnet aus, wo jedes Wort steht. Zeichnen tut das der Aufrufer — so
 * kann derselbe Satz einmal gemessen und einmal gezeichnet werden, ohne
 * dass die Rechnung zweimal im Code steht.
 *
 * Gibt zusaetzlich die Grundlinie zurueck, auf der es weitergeht. Die
 * Prototypen ziehen nach dem letzten Absatz den Absatzabstand wieder ab;
 * das tut diese Funktion auch, damit das folgende Element dort anschliesst,
 * wo es in der Referenz anschliesst.
 */
export function setzen(
  m: Metrik,
  zeilen: Zeile[],
  x: number,
  y: number,
  maxBreite: number,
  groesse: number,
  zeilenhoehe: number,
  regeln: SatzRegeln,
): { woerter: WortSatz[]; unten: number } {
  const raus: WortSatz[] = [];
  let aktuell = y;
  let letzterAbsatz = zeilen.length ? zeilen[0].absatz : 0;
  for (const zeile of zeilen) {
    if (zeile.absatz !== letzterAbsatz) {
      aktuell -= zeilenhoehe * regeln.absatzFaktor;
      letzterAbsatz = zeile.absatz;
    }
    const spalte = maxBreite - zeile.einzug;
    const dehnen = regeln.blocksatz && !zeile.letzte && zeile.woerter.length > 1;
    if (dehnen) {
      const summe = zeile.woerter.reduce((a, w) => a + breite(m, w, groesse), 0);
      const lueck = (spalte - summe) / (zeile.woerter.length - 1);
      let xx = x + zeile.einzug;
      for (const wort of zeile.woerter) {
        raus.push({ x: xx, y: aktuell, text: wort });
        xx += breite(m, wort, groesse) + lueck;
      }
    } else {
      raus.push({ x: x + zeile.einzug, y: aktuell, text: zeile.woerter.join(" ") });
    }
    aktuell -= zeilenhoehe;
  }
  return { woerter: raus, unten: aktuell };
}

/**
 * Verdichten: die groesste Schriftgroesse, mit der der Text noch in die
 * Hoehe passt, in Schritten von 0,1 Punkt nach unten.
 *
 * Der Auftrag verlangt das, weil Objektdaten nicht die Laenge der
 * Demodaten haben. Die Untergrenze ist Teil des Textstils; darunter wird
 * nicht verdichtet, sondern abgeschnitten — eine 5-Punkt-Zeile ist
 * niemandem geholfen. Dass abgeschnitten wurde, meldet der Renderer.
 */
export function verdichten(
  m: Metrik,
  s: string,
  maxBreite: number,
  maxHoehe: number,
  groesse: number,
  minGroesse: number,
  zeilenFaktor: number,
  regeln: SatzRegeln,
): { groesse: number; zeilenhoehe: number; zeilen: Zeile[]; passt: boolean } {
  let g = groesse;
  const schritt = 0.1;
  for (;;) {
    const zh = g * zeilenFaktor;
    const zeilen = umbrechen(m, s, g, maxBreite, regeln);
    if (hoehe(zeilen, zh, regeln) <= maxHoehe) {
      return { groesse: g, zeilenhoehe: zh, zeilen, passt: true };
    }
    if (g - schritt < minGroesse - 1e-9) {
      const zeilenMin = umbrechen(m, s, minGroesse, maxBreite, regeln);
      return {
        groesse: minGroesse,
        zeilenhoehe: minGroesse * zeilenFaktor,
        zeilen: zeilenMin,
        passt: false,
      };
    }
    g = Math.round((g - schritt) * 10) / 10;
  }
}
