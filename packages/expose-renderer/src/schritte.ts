// ============================================================================
// Zeichenschritte
// ----------------------------------------------------------------------------
// Der Renderer zeichnet nicht direkt in ein PDF, sondern baut erst eine
// Liste von Schritten. Drei Gruende:
//
//  1. tests/expose-aufzeichnung.py zeichnet die Prototypen in genau dieser
//     Form auf. Der Vergleich ist dann ein Vergleich von Listen und nicht
//     das Auseinandernehmen von zwei PDF-Dateien.
//  2. Dieselbe Liste kann die Vorschau im Browser auf ein Canvas malen,
//     ohne ein PDF zu bauen.
//  3. Der Umbau einer Seite (fliessende Folgeseiten, Verdichtung) arbeitet
//     auf Schritten, nicht auf PDF-Operatoren.
//
// Masse in Punkt, Ursprung unten links, Farben als [r,g,b,a] in 0..1 —
// dieselbe Form, die die Aufzeichnung aus ReportLab liest.
// ============================================================================

export type RGBA = [number, number, number, number];

export type Matrix = [number, number, number, number, number, number];
export const EINHEIT: Matrix = [1, 0, 0, 1, 0, 0];

export type PfadSchritt =
  | ["moveTo", number, number]
  | ["lineTo", number, number]
  | ["curveTo", number, number, number, number, number, number]
  | ["close"]
  | ["rect", number, number, number, number]
  | ["roundRect", number, number, number, number, number]
  | ["circle", number, number, number]
  | ["ellipse", number, number, number, number];

export type Schritt =
  | { art: "text"; x: number; y: number; text: string; schnitt: string;
      groesse: number; sperrung: number; farbe: RGBA | null; matrix: Matrix }
  | { art: "rechteck"; x: number; y: number; b: number; h: number;
      fuell: RGBA | null; strich: RGBA | null; linienbreite: number | null;
      matrix: Matrix }
  | { art: "rundrechteck"; x: number; y: number; b: number; h: number; r: number;
      fuell: RGBA | null; strich: RGBA | null; linienbreite: number | null;
      matrix: Matrix }
  | { art: "linie"; x1: number; y1: number; x2: number; y2: number;
      strich: RGBA | null; linienbreite: number | null;
      strichmuster: number[] | null; matrix: Matrix }
  | { art: "kreis"; x: number; y: number; r: number; fuell: RGBA | null;
      strich: RGBA | null; linienbreite: number | null; matrix: Matrix }
  | { art: "ellipse"; x1: number; y1: number; x2: number; y2: number;
      fuell: RGBA | null; strich: RGBA | null; matrix: Matrix }
  | { art: "pfad"; schritte: PfadSchritt[]; fuell: RGBA | null;
      strich: RGBA | null; linienbreite: number | null; matrix: Matrix }
  | { art: "maske"; schritte: PfadSchritt[]; matrix: Matrix; zweck?: string }
  | { art: "verlauf"; x0: number; y0: number; x1: number; y1: number;
      farben: RGBA[]; stellen: number[] | null; matrix: Matrix }
  | { art: "radialverlauf"; x: number; y: number; r: number; farben: RGBA[];
      stellen: number[] | null; matrix: Matrix }
  | { art: "bild"; x: number; y: number; b: number; h: number;
      quelle: string; fuellmodus: "cover" | "contain"; matrix: Matrix }
  | { art: "qr"; x: number; y: number; b: number; h: number; inhalt: string;
      farbe: RGBA | null; matrix: Matrix }
  | { art: "gruppe"; maske: PfadSchritt[] | null; matrix: Matrix;
      /**
       * Wozu die Gruppe da ist, z. B. "bild:grundriss". Der Renderer
       * braucht es nicht; der Vergleich mit den Prototypen schon. Ein
       * gezeichneter Grundriss-Platzhalter traegt dort Raumnamen, ein
       * hochgeladener Grundriss bringt seine eigenen mit — der Vergleich
       * muss wissen, dass dieser Rahmen eine Zeichnung ersetzt und nicht
       * nur ein Foto.
       */
      zweck?: string;
      schritte: Schritt[] };

export type Seitenbild = {
  breite: number;
  hoehe: number;
  schritte: Schritt[];
};

/**
 * Loest Gruppen auf, so dass die Liste dieselbe Reihenfolge und Form hat
 * wie die Aufzeichnung der Prototypen: eine Maske erscheint dort als
 * eigener Schritt, und was danach gezeichnet wird, folgt ihr.
 *
 * ReportLab beendet eine Maske mit restoreState; die Aufzeichnung sieht
 * das nicht. Der Vergleich kann deshalb die Reichweite einer Maske nicht
 * pruefen — nur ihre Geometrie. Das steht so auch im Vergleichstest.
 */
export function flach(schritte: Schritt[], eltern: Matrix = EINHEIT): Schritt[] {
  const raus: Schritt[] = [];
  for (const s of schritte) {
    const m = malMatrix(s.matrix, eltern);
    if (s.art === "gruppe") {
      if (s.maske) {
        raus.push({ art: "maske", schritte: s.maske, matrix: m, zweck: s.zweck });
      }
      raus.push(...flach(s.schritte, m));
    } else {
      raus.push({ ...s, matrix: m } as Schritt);
    }
  }
  return raus;
}

/** `innen` zuerst, dann `aussen` — wie bei ReportLab translate/rotate. */
export function malMatrix(innen: Matrix, aussen: Matrix): Matrix {
  const [a, b, c, d, e, f] = aussen;
  const [a2, b2, c2, d2, e2, f2] = innen;
  return [
    a2 * a + b2 * c,
    a2 * b + b2 * d,
    c2 * a + d2 * c,
    c2 * b + d2 * d,
    e2 * a + f2 * c + e,
    e2 * b + f2 * d + f,
  ];
}

export function drehung(grad: number): Matrix {
  const r = (grad * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
}

export function verschiebung(dx: number, dy: number): Matrix {
  return [1, 0, 0, 1, dx, dy];
}

export function streckung(sx: number, sy: number): Matrix {
  return [sx, 0, 0, sy, 0, 0];
}
