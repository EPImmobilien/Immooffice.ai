import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { ExposeDaten } from "./typen";
import { ExposeAushang } from "./vorlage-aushang";
import { ExposeFactsheet } from "./vorlage-factsheet";
import { ExposeKlassisch } from "./vorlage-klassisch";
import { ExposeModern } from "./vorlage-modern";
import { ExposePremium } from "./vorlage-premium";

/**
 * Verzeichnis der fuenf Exposé-Vorlagen (Abschnitt 8).
 *
 * Eine Stelle, an der alle Vorlagen stehen: Oberflaeche, PDF-Route und Tests
 * lesen dieselbe Liste. Damit kann keine Vorlage in der Auswahl fehlen oder in
 * den Tests uebersehen werden.
 *
 * Die vier Exposé-Vorlagen sind quer. Der Schaufensteraushang bleibt hoch:
 * Er haengt im Fenster oder am Bauzaun, und dort ist das Hochformat das
 * uebliche — quer wuerde er auf halber Hoehe abschliessen und wirkte
 * verloren. Er ist auch kein Exposé, sondern ein Plakat.
 */

export type VorlagenSchluessel =
  | "klassisch"
  | "modern"
  | "premium"
  | "factsheet"
  | "aushang_a4"
  | "aushang_a3";

export interface Vorlage {
  schluessel: VorlagenSchluessel;
  name: string;
  hinweis: string;
  /** Wie viele Bilder die Vorlage sinnvoll verwenden kann. */
  bilder: number;
  /** Seitenformat fuer die Anzeige in der Auswahl. */
  format: string;
  bauen: (daten: ExposeDaten) => ReactElement<DocumentProps>;
}

export const VORLAGEN: Vorlage[] = [
  {
    schluessel: "klassisch",
    name: "Klassisch, ausführlich",
    hinweis: "Alle Angaben und Texte, mehrseitig. Die Vorlage für den Regelfall.",
    bilder: 7,
    format: "A4 quer",
    bauen: (d) => <ExposeKlassisch {...d} />,
  },
  {
    schluessel: "modern",
    name: "Modern, minimalistisch",
    hinweis: "Breite Bildbahn, ruhige Typografie, wenige Kennzahlen.",
    bilder: 4,
    format: "A4 quer",
    bauen: (d) => <ExposeModern {...d} />,
  },
  {
    schluessel: "premium",
    name: "Bildstark, Premium",
    hinweis: "Randlose Titelseite im Kinoformat, große Bildtafeln, dreiseitig.",
    bilder: 6,
    format: "A4 quer",
    bauen: (d) => <ExposePremium {...d} />,
  },
  {
    schluessel: "factsheet",
    name: "Kurzexposé",
    hinweis: "Genau eine Seite. Für Erstkontakt und Besichtigung.",
    bilder: 1,
    format: "A4 quer",
    bauen: (d) => <ExposeFactsheet {...d} />,
  },
  {
    schluessel: "aushang_a4",
    name: "Schaufensteraushang A4",
    hinweis: "Große Schrift, wenige Angaben — aus einem Meter Entfernung lesbar. Hochformat.",
    bilder: 1,
    format: "A4 hoch",
    bauen: (d) => <ExposeAushang {...d} format="a4" />,
  },
  {
    schluessel: "aushang_a3",
    name: "Schaufensteraushang A3",
    hinweis: "Dasselbe im doppelten Format, für Fenster und Bauzaun.",
    bilder: 1,
    format: "A3 hoch",
    bauen: (d) => <ExposeAushang {...d} format="a3" />,
  },
];

export function vorlageFinden(schluessel: string): Vorlage | undefined {
  return VORLAGEN.find((v) => v.schluessel === schluessel);
}

export const STANDARDVORLAGE: VorlagenSchluessel = "klassisch";
