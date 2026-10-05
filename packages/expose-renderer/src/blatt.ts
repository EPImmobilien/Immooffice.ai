// ============================================================================
// Das Blatt — die Zeichenhelfer der Prototypen
// ----------------------------------------------------------------------------
// Jeder Prototyp hat denselben kleinen Satz Helfer: T() setzt eine Zeile
// mit Ausrichtung, sw() misst sie, rect() zeichnet ein Rechteck mit
// Fuellung und/oder Strich, hline() eine Linie. Hier stehen sie einmal,
// und zwar so, wie die Prototypen sie rechnen — einschliesslich der
// Reihenfolge, in der sie Schritte erzeugen. Der Vergleich gegen die
// Aufzeichnung prueft auch die Reihenfolge; ein Rechteck, das vor statt
// nach seinem Text kommt, verdeckt ihn.
//
// Was hier NICHT passiert: rechnen, was in die Vorlage gehoert. Diese
// Klasse kennt keine Seitenraender, keine Schriftgroessen und keine
// Farbnamen. Sie zeichnet, was ihr gesagt wird.
// ============================================================================

import type { Metrik } from "./schrift";
import { breite as textBreite, fehlendeZeichen } from "./schrift";
import type { Matrix, PfadSchritt, RGBA, Schritt } from "./schritte";
import { EINHEIT } from "./schritte";
import type { Farbe } from "./farben";
import type { SatzRegeln, Zeile } from "./text";
import { setzen, umbrechen } from "./text";

export type Ausrichtung = "l" | "c" | "r";

export function rgba(c: Farbe, a = 1): RGBA {
  return [c.r, c.g, c.b, a];
}

export class Blatt {
  readonly schritte: Schritt[] = [];
  /** Zeichen, die keine der benutzten Schriften hat. */
  readonly fehlend = new Map<string, Set<string>>();
  private matrix: Matrix = EINHEIT;

  constructor(
    readonly breite: number,
    readonly hoehe: number,
    /** Schnittname -> Metrik. Die Namen sind die der Vorlage. */
    private readonly schriften: Map<string, Metrik>,
  ) {}

  private metrik(schnitt: string): Metrik {
    const m = this.schriften.get(schnitt);
    if (!m) {
      throw new Error(
        `Der Schnitt "${schnitt}" ist nicht geladen. Die Vorlage benutzt ihn, ` +
        `aber er steht nicht in ihrer Schriftliste.`);
    }
    return m;
  }

  /** Breite einer Zeile in Punkt — sw() der Prototypen. */
  sw(s: string, schnitt: string, groesse: number, sperrung = 0): number {
    return textBreite(this.metrik(schnitt), s, groesse, sperrung);
  }

  /**
   * Eine Zeile setzen — T() der Prototypen, mit derselben Ausrichtung
   * ueber die gemessene Breite. Gibt die Breite zurueck, weil die
   * Prototypen damit weiterrechnen.
   */
  T(x: number, y: number, s: string, schnitt: string, groesse: number,
    farbe: RGBA | null, sperrung = 0, aus: Ausrichtung = "l"): number {
    const b = this.sw(s, schnitt, groesse, sperrung);
    let xx = x;
    if (aus === "r") xx -= b;
    else if (aus === "c") xx -= b / 2;
    const fehlt = fehlendeZeichen(this.metrik(schnitt), s);
    if (fehlt.length) {
      const bisher = this.fehlend.get(schnitt) ?? new Set<string>();
      for (const z of fehlt) bisher.add(z);
      this.fehlend.set(schnitt, bisher);
    }
    this.schritte.push({
      art: "text", x: xx, y, text: s, schnitt, groesse, sperrung,
      farbe, matrix: this.matrix,
    });
    return b;
  }

  /** Versalien mit Sperrung — caps() bei Signature und Studio. */
  caps(x: number, y: number, s: string, schnitt: string, groesse: number,
       farbe: RGBA | null, sperrung: number, aus: Ausrichtung = "l"): number {
    return this.T(x, y, s.toLocaleUpperCase("de-DE"), schnitt, groesse, farbe,
                  sperrung, aus);
  }

  rect(x: number, y: number, b: number, h: number,
       fuell: RGBA | null = null, strich: RGBA | null = null,
       r = 0, linienbreite = 0.6): void {
    if (r) {
      this.schritte.push({
        art: "rundrechteck", x, y, b, h, r, fuell, strich,
        linienbreite: strich ? linienbreite : null, matrix: this.matrix,
      });
    } else {
      this.schritte.push({
        art: "rechteck", x, y, b, h, fuell, strich,
        linienbreite: strich ? linienbreite : null, matrix: this.matrix,
      });
    }
  }

  linie(x1: number, y1: number, x2: number, y2: number, strich: RGBA,
        linienbreite = 0.6, strichmuster: number[] | null = null): void {
    this.schritte.push({
      art: "linie", x1, y1, x2, y2, strich, linienbreite, strichmuster,
      matrix: this.matrix,
    });
  }

  kreis(x: number, y: number, r: number, fuell: RGBA | null = null,
        strich: RGBA | null = null, linienbreite = 0.6): void {
    this.schritte.push({
      art: "kreis", x, y, r, fuell, strich,
      linienbreite: strich ? linienbreite : null, matrix: this.matrix,
    });
  }

  ellipse(x1: number, y1: number, x2: number, y2: number,
          fuell: RGBA | null = null, strich: RGBA | null = null): void {
    this.schritte.push({
      art: "ellipse", x1, y1, x2, y2, fuell, strich, matrix: this.matrix,
    });
  }

  pfad(schritte: PfadSchritt[], fuell: RGBA | null = null,
       strich: RGBA | null = null, linienbreite = 0.6): void {
    this.schritte.push({
      art: "pfad", schritte, fuell, strich,
      linienbreite: strich ? linienbreite : null, matrix: this.matrix,
    });
  }

  verlauf(x0: number, y0: number, x1: number, y1: number, farben: RGBA[],
          stellen: number[] | null = null): void {
    this.schritte.push({
      art: "verlauf", x0, y0, x1, y1, farben, stellen, matrix: this.matrix,
    });
  }

  bild(x: number, y: number, b: number, h: number, quelle: string,
       fuellmodus: "cover" | "contain" = "cover"): void {
    this.schritte.push({
      art: "bild", x, y, b, h, quelle, fuellmodus, matrix: this.matrix,
    });
  }

  qr(x: number, y: number, b: number, h: number, inhalt: string,
     farbe: RGBA | null): void {
    this.schritte.push({ art: "qr", x, y, b, h, inhalt, farbe, matrix: this.matrix });
  }

  /**
   * Eine Gruppe mit eigener Maske und/oder eigener Matrix. Entspricht
   * saveState / clipPath / … / restoreState bei ReportLab, aber mit
   * sichtbarer Reichweite: das war der Teil, den die Aufzeichnung nicht
   * sehen kann, und darum wird er hier ausdruecklich geklammert.
   */
  gruppe(maske: PfadSchritt[] | null, matrix: Matrix,
         inhalt: (b: Blatt) => void, zweck?: string): void {
    const innen = new Blatt(this.breite, this.hoehe, this.schriften);
    inhalt(innen);
    for (const [schnitt, zeichen] of innen.fehlend) {
      const bisher = this.fehlend.get(schnitt) ?? new Set<string>();
      for (const z of zeichen) bisher.add(z);
      this.fehlend.set(schnitt, bisher);
    }
    this.schritte.push({
      art: "gruppe", maske, matrix, zweck, schritte: innen.schritte,
    });
  }

  // ---------------------------------------------------------------- Absatz
  umbrechen(s: string, schnitt: string, groesse: number, maxBreite: number,
            regeln: SatzRegeln): Zeile[] {
    return umbrechen(this.metrik(schnitt), s, groesse, maxBreite, regeln);
  }

  /**
   * Einen Absatz setzen — para() der Prototypen. Gibt die Grundlinie
   * zurueck, auf der es weitergeht.
   */
  absatz(x: number, y: number, s: string, maxBreite: number, schnitt: string,
         groesse: number, zeilenhoehe: number, farbe: RGBA | null,
         regeln: SatzRegeln): number {
    const m = this.metrik(schnitt);
    const zeilen = umbrechen(m, s, groesse, maxBreite, regeln);
    const { woerter, unten } = setzen(m, zeilen, x, y, maxBreite, groesse,
                                      zeilenhoehe, regeln);
    for (const w of woerter) {
      if (w.text === "") continue;
      this.T(w.x, w.y, w.text, schnitt, groesse, farbe);
    }
    return unten;
  }
}
