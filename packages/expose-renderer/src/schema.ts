// ============================================================================
// Das Vorlagen-Schema des Exposé-Baukastens
// ----------------------------------------------------------------------------
// Eine Vorlage ist ein JSON-Dokument, kein Code. Dieses Modul beschreibt, was
// darin stehen darf — als TypeScript-Typen fuer die Entwicklung und, daneben
// in schema.json, als JSON-Schema fuer die Pruefung beim Laden.
//
// Alle Masse sind PUNKT, wie im PDF. A4 hoch ist 595,28 x 841,89. Keine
// Millimeter im Dokument: der Editor rechnet fuer die Anzeige um, gespeichert
// wird, womit gezeichnet wird.
//
// Der Ursprung liegt UNTEN LINKS, wie bei pdf-lib und ReportLab. y waechst
// nach oben. Der Editor rechnet fuer seine Rahmen um; wer hier y nach unten
// annimmt, baut Seiten, die auf dem Kopf stehen.
// ============================================================================

export type Ausrichtung = "hoch" | "quer";

/** Eine Farbe im Dokument: Hex oder ein Verweis in die Palette. */
export type FarbRef =
  | string // "#RRGGBB"
  | "f1" | "f2"            // die beiden Farben der Vorlage
  | "ci.primaer" | "ci.akzent"  // aus dem Branding des Mandanten
  | "weiss" | "schwarz"
  // Abstufungen, die die Ableitung rechnet. Welche es gibt, haengt an der
  // Ableitung — raster kennt surf/surf2/line, signature paper/hair, studio
  // tint/tint2. Der Editor bietet nur an, was die Vorlage hat.
  | { palette: string }
  // Gemischt, wie die Prototypen es im Satz tun: mix(p, weiss, 0.6).
  | { mix: [FarbRef, FarbRef, number] };

/** Eine Schrift: eine der mitgelieferten oder die des Mandanten. */
export type SchriftRef =
  | { familie: "jakarta" | "cormorant" | "archivo"; schnitt: string }
  | "ci.font";

export type TextStil = {
  schrift: SchriftRef;
  groesse: number;
  /** Zeilenabstand in Punkt. Fehlt er, nimmt der Renderer groesse * 1,45. */
  zeilen?: number;
  farbe: FarbRef;
  /** Sperrung in Punkt je Zeichen, wie cs in den Prototypen. */
  sperrung?: number;
  grossbuchstaben?: boolean;
  ausrichtung?: "links" | "mitte" | "rechts" | "block";
  /** Untergrenze beim Verdichten. Ohne Angabe 0,82 der Groesse. */
  min_groesse?: number;
};

// ------------------------------------------------------------- Bedingungen
// Bewusst Daten, kein Code: ein Ausdruck ist ein kleines Objekt. Damit kann
// eine Vorlage aus fremder Hand nichts ausfuehren.
export type Bedingung =
  | { feld: string; gleich: string | number | boolean }
  | { feld: string; ungleich: string | number | boolean }
  | { feld: string; groesser: number }
  | { vorhanden: string }
  | { und: Bedingung[] }
  | { oder: Bedingung[] }
  | { nicht: Bedingung };

// --------------------------------------------------------------- Fuellungen
export type Fuellung =
  | { art: "farbe"; farbe: FarbRef }
  | { art: "bild"; slot: BildSlot; fuellmodus?: "cover" | "contain" }
  | { art: "asset"; pfad: string }
  | { art: "verlauf"; von: FarbRef; nach: FarbRef; richtung: "oben" | "unten" };

/** Woher ein Bild kommt. Kein Dateipfad im Dokument — das waere objektfest. */
export type BildSlot =
  | { art: "titelbild" }
  | { art: "foto"; nr: number }
  | { art: "foto_kategorie"; kategorie: string; nr?: number }
  | { art: "grundriss"; nr: number }
  | { art: "lageplan" }
  | { art: "ansprechpartner" }
  | { art: "logo"; ton: "hell" | "dunkel" }
  | { art: "asset"; pfad: string };

// ----------------------------------------------------------------- Elemente
export type ElementTyp =
  | "text" | "datenfeld" | "kennzahl" | "faktentabelle" | "bild" | "galerie"
  | "form" | "highlights" | "ausstattung" | "distanzen" | "energieskala"
  | "kostenrechnung" | "rendite" | "raumliste" | "karte" | "qr"
  | "kontaktkarte" | "inhaltsverzeichnis" | "rechtstext";

export type ElementBasis = {
  id: string;
  typ: ElementTyp;
  /** Rahmen in Punkt, Ursprung unten links. */
  x: number; y: number; b: number; h: number;
  drehung?: 0 | 90 | 270;
  /** Vom Vorlagenautor gesperrt: nicht verschiebbar, nicht loeschbar. */
  gesperrt?: boolean;
  sichtbar_wenn?: Bedingung;
  deckkraft?: number;
};

export type Element = ElementBasis & Record<string, unknown>;

/** Eine Gruppe von Elementen, etwa der Seitenfuss. */
export type ElementGruppe = { elemente: Element[] };

// -------------------------------------------------------------------- Seiten
export type SeitenTyp =
  | "cover" | "inhalt" | "auf_einen_blick" | "beschreibung" | "ausstattung"
  | "bildseite" | "grundriss" | "lage" | "energie" | "kosten" | "kapitalanlage"
  | "kontakt" | "rechtliches" | "leer";

export type Seite = {
  id: string;
  typ: SeitenTyp;
  name: string;
  hintergrund?: Fuellung;
  ohne_fuss?: boolean;
  sichtbar_wenn?: Bedingung;
  /** Darf Folgeseiten erzeugen. Nur fuer Text-, Tabellen- und Galerieseiten. */
  fliessend?: boolean;
  elemente: Element[];
};

// ------------------------------------------------------------------ Vorlage
export type Vorlage = {
  schema: 1;
  format: { breite: number; hoehe: number; ausrichtung: Ausrichtung };
  stil: {
    farben: { f1: FarbRef; f2: FarbRef; ableitung: "raster" | "signature" | "studio" };
    schriften: { headline: SchriftRef; text: SchriftRef; label: SchriftRef };
    textstile: Record<string, TextStil>;
    raster: { spalten: number; rand: number; abstand: number };
    seitenfuss?: ElementGruppe;
  };
  seiten: Seite[];
};

/** A4 hoch, in Punkt. Steht hier einmal und wird nicht gerechnet. */
export const A4 = { breite: 595.28, hoehe: 841.89 } as const;

/**
 * Abweichungen je Objekt. Sie liegen in immobilien.expose_overrides und
 * lassen die Vorlage unberuehrt — damit eine geaenderte Vorlage nicht die
 * Arbeit an einzelnen Objekten wegwirft.
 *
 * Verwaiste Eintraege (Seite oder Element gibt es nicht mehr) bleiben
 * stehen und werden im Editor angezeigt; sie zu loeschen ist eine
 * Entscheidung des Nutzers, nicht des Renderers.
 */
export type Overrides = {
  seiten_aus?: string[];
  bilder?: Record<string, BildSlot>;
  texte?: Record<string, string>;
};
