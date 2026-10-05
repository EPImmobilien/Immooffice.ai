// ============================================================================
// Umgebung eines Elements
// ----------------------------------------------------------------------------
// Was ein Element beim Zeichnen zur Hand hat: das Blatt, die Daten, die
// Palette, die Textstile der Vorlage, die Seitenzahlen — und einen Ort fuer
// Warnungen.
//
// Warnungen sind kein Nebenschauplatz. Der Auftrag verlangt, dass Text, der
// nicht passt, verdichtet und sonst "gekuerzt mit Warnung im Editor" wird.
// Ein Renderer, der stillschweigend abschneidet, erzeugt Exposés, in denen
// ein halber Satz fehlt und niemand weiss es.
// ============================================================================

import type { Blatt } from "./blatt";
import type { Daten } from "./werte";
import type { FesterStil, Palette } from "./stil";
import type { Element, Vorlage } from "./schema";

export type WarnungArt =
  | "gekuerzt"        // Text passte auch verdichtet nicht
  | "verdichtet"      // Text wurde kleiner gesetzt als der Stil sagt
  | "fehlender_wert"  // Pflichtwert fehlt, Element oder Zeile entfaellt
  | "fehlendes_bild"  // Bildslot leer
  | "fehlendes_zeichen" // Zeichen nicht im Zeichensatz der Schrift
  | "kontrast"        // Text auf Flaeche unter dem WCAG-Verhaeltnis
  | "unbekannt";      // alles, was die Vorlage falsch sagt

export type Warnung = {
  art: WarnungArt;
  /** Seiten-Kennung aus der Vorlage, nicht die laufende Nummer. */
  seite?: string;
  element?: string;
  text: string;
};

export type Seitenlage = {
  /** Laufende Nummer im fertigen Dokument, bei 1 beginnend. */
  nummer: number;
  gesamt: number;
  name: string;
  id: string;
};

export type Umgebung = {
  blatt: Blatt;
  daten: Daten;
  palette: Palette;
  vorlage: Vorlage;
  seite: Seitenlage;
  warnungen: Warnung[];
  /** Benannten Textstil der Vorlage holen. */
  stil: (name: string) => FesterStil;
};

export function warne(u: Umgebung, art: WarnungArt, element: Element | undefined,
                      text: string): void {
  u.warnungen.push({ art, seite: u.seite.id, element: element?.id, text });
}

/** Linker Rand eines Elements, je Ausrichtung. */
export function ankerX(el: Element, ausrichtung: string): number {
  if (ausrichtung === "rechts") return el.x + el.b;
  if (ausrichtung === "mitte") return el.x + el.b / 2;
  return el.x;
}

/** Der Buchstabe, den Blatt.T fuer eine Ausrichtung erwartet. */
export function ankerArt(ausrichtung: string): "l" | "c" | "r" {
  return ausrichtung === "rechts" ? "r" : ausrichtung === "mitte" ? "c" : "l";
}
