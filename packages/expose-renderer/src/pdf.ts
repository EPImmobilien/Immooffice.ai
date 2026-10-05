// ============================================================================
// Aus Zeichenschritten wird ein PDF
// ----------------------------------------------------------------------------
// pdf-lib schreibt das Dokument, fontkit bettet die Schriften ein. Gezeichnet
// wird NICHT mit page.drawText und Verwandten, sondern mit den
// Inhaltsstrom-Operatoren direkt. Zwei Gruende:
//
//   Sperrung. Die Vorlagen sperren Versalien (Tc im PDF). pdf-lib bietet das
//   in drawText nicht an, und ohne Sperrung steht jede gesperrte Zeile
//   anders als in der verbindlichen Vorlage.
//
//   Reihenfolge und Maske. Eine Gruppe mit Maske ist q / W n / … / Q. Das
//   laesst sich nur mit Operatoren sauber klammern.
//
// Die Breiten rechnet schrift.ts, nicht fontkit: fontkit wuerde beim Setzen
// unterschneiden und Ligaturen bilden. Die gelieferten Schnitte haben darum
// kein GSUB und kein GPOS (siehe scripts/expose-schriften.py) — damit hat
// fontkit nichts anzuwenden und beide Seiten rechnen dasselbe.
// ============================================================================

import type { PDFDocument, PDFFont, PDFPage, PDFRef } from "pdf-lib";
import type { Metrik } from "./schrift";
import type { PfadSchritt, RGBA, Schritt, Seitenbild } from "./schritte";

export type PdfWerkzeug = {
  /** pdf-lib, hereingegeben statt importiert — siehe Hinweis unten. */
  PDFLib: typeof import("pdf-lib");
  fontkit: unknown;
};

export type PdfAuftrag = {
  seiten: Seitenbild[];
  schriften: Map<string, Metrik>;
  /** Bilder, die Schritte benennen: Pfad -> Bytes. */
  bilder?: Map<string, Uint8Array>;
  titel?: string;
  verfasser?: string;
  /** QR-Erzeuger. Herausgehalten, damit das Paket ohne ihn uebersetzt. */
  qr?: (inhalt: string) => boolean[][];
};

// Wie weit ein Kreis durch vier Bezierboegen angenaehert wird.
const KAPPA = 0.5522847498307933;

export async function zuPdf(a: PdfAuftrag, w: PdfWerkzeug): Promise<Uint8Array> {
  const { PDFLib } = w;
  const doc = await PDFLib.PDFDocument.create();
  doc.registerFontkit(w.fontkit as never);
  if (a.titel) doc.setTitle(a.titel);
  if (a.verfasser) doc.setAuthor(a.verfasser);
  doc.setProducer("immoOffice.ai");
  doc.setCreator("immoOffice.ai");

  // Nur die Schnitte einbetten, die wirklich vorkommen. Ein Expose mit drei
  // Schnitten soll nicht zwanzig mitschleppen.
  const gebraucht = new Set<string>();
  for (const seite of a.seiten) sammleSchnitte(seite.schritte, gebraucht);
  const schriften = new Map<string, PDFFont>();
  for (const name of gebraucht) {
    const m = a.schriften.get(name);
    if (!m) throw new Error(`Die Schrift "${name}" ist nicht geladen.`);
    schriften.set(name, await doc.embedFont(m.daten, { subset: false }));
  }

  const bilder = new Map<string, { ref: PDFRef; b: number; h: number }>();
  for (const [pfad, bytes] of a.bilder ?? []) {
    const bild = istPng(bytes) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    bilder.set(pfad, { ref: bild.ref, b: bild.width, h: bild.height });
  }

  for (const seite of a.seiten) {
    const blatt = doc.addPage([seite.breite, seite.hoehe]);
    const zustand: Zustand = { doc, blatt, PDFLib, schriften, bilder, qr: a.qr };
    zeichne(seite.schritte, zustand);
  }
  return doc.save();
}

type Zustand = {
  doc: PDFDocument;
  blatt: PDFPage;
  PDFLib: typeof import("pdf-lib");
  schriften: Map<string, PDFFont>;
  bilder: Map<string, { ref: PDFRef; b: number; h: number }>;
  qr?: (inhalt: string) => boolean[][];
};

function sammleSchnitte(schritte: Schritt[], raus: Set<string>): void {
  for (const s of schritte) {
    if (s.art === "text") raus.add(s.schnitt);
    else if (s.art === "gruppe") sammleSchnitte(s.schritte, raus);
  }
}

function istPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function zeichne(schritte: Schritt[], z: Zustand): void {
  const P = z.PDFLib;
  for (const s of schritte) {
    if (s.art === "gruppe") {
      z.blatt.pushOperators(P.pushGraphicsState());
      if (s.matrix[0] !== 1 || s.matrix[1] !== 0 || s.matrix[2] !== 0 ||
          s.matrix[3] !== 1 || s.matrix[4] !== 0 || s.matrix[5] !== 0) {
        z.blatt.pushOperators(P.concatTransformationMatrix(...s.matrix));
      }
      if (s.maske) {
        pfadOperatoren(s.maske, z);
        z.blatt.pushOperators(P.clip(), P.endPath());
      }
      zeichne(s.schritte, z);
      z.blatt.pushOperators(P.popGraphicsState());
      continue;
    }
    z.blatt.pushOperators(P.pushGraphicsState());
    const m = s.matrix;
    if (m[0] !== 1 || m[1] !== 0 || m[2] !== 0 || m[3] !== 1 || m[4] !== 0 || m[5] !== 0) {
      z.blatt.pushOperators(P.concatTransformationMatrix(...m));
    }
    einzeln(s, z);
    z.blatt.pushOperators(P.popGraphicsState());
  }
}

function farbOps(z: Zustand, fuell: RGBA | null, strich: RGBA | null,
                 linienbreite: number | null): void {
  const P = z.PDFLib;
  if (fuell) {
    z.blatt.pushOperators(P.setFillingRgbColor(fuell[0], fuell[1], fuell[2]));
    if (fuell[3] < 1) deckkraft(z, fuell[3], "fuell");
  }
  if (strich) {
    z.blatt.pushOperators(P.setStrokingRgbColor(strich[0], strich[1], strich[2]));
    if (strich[3] < 1) deckkraft(z, strich[3], "strich");
  }
  if (linienbreite != null) z.blatt.pushOperators(P.setLineWidth(linienbreite));
}

/**
 * Teildurchsichtigkeit. Im PDF geht das nur ueber einen
 * Grafikzustand (ExtGState) in den Betriebsmitteln der Seite — es gibt
 * keinen Operator dafuer. Die Vorlagen brauchen es: das Etikett auf einem
 * Bild liegt auf 82 % weiss.
 */
function deckkraft(z: Zustand, wert: number, art: "fuell" | "strich"): void {
  const P = z.PDFLib;
  const dict = z.doc.context.obj(
    art === "fuell" ? { Type: "ExtGState", ca: wert } : { Type: "ExtGState", CA: wert },
  );
  const ref = z.doc.context.register(dict);
  const name = z.blatt.node.newExtGState("GS", ref);
  z.blatt.pushOperators(P.PDFOperator.of("gs" as never, [name]));
}

function einzeln(s: Schritt, z: Zustand): void {
  const P = z.PDFLib;
  switch (s.art) {
    case "text": {
      const schrift = z.schriften.get(s.schnitt);
      if (!schrift) throw new Error(`Schrift "${s.schnitt}" nicht eingebettet.`);
      const name = z.blatt.node.newFontDictionary(schrift.name, schrift.ref);
      const farbe = s.farbe ?? [0, 0, 0, 1];
      if (farbe[3] < 1) deckkraft(z, farbe[3], "fuell");
      z.blatt.pushOperators(
        P.beginText(),
        P.setFontAndSize(name, s.groesse),
        P.setCharacterSpacing(s.sperrung),
        P.setFillingRgbColor(farbe[0], farbe[1], farbe[2]),
        P.moveText(s.x, s.y),
        P.showText(schrift.encodeText(s.text)),
        P.endText(),
      );
      return;
    }
    case "rechteck":
      farbOps(z, s.fuell, s.strich, s.linienbreite);
      z.blatt.pushOperators(P.rectangle(s.x, s.y, s.b, s.h));
      malen(z, s.fuell, s.strich);
      return;
    case "rundrechteck":
      farbOps(z, s.fuell, s.strich, s.linienbreite);
      rundRechteck(z, s.x, s.y, s.b, s.h, s.r);
      malen(z, s.fuell, s.strich);
      return;
    case "linie":
      farbOps(z, null, s.strich, s.linienbreite);
      if (s.strichmuster) {
        z.blatt.pushOperators(P.setDashPattern(s.strichmuster, 0));
      }
      z.blatt.pushOperators(P.moveTo(s.x1, s.y1), P.lineTo(s.x2, s.y2), P.stroke());
      return;
    case "kreis":
      farbOps(z, s.fuell, s.strich, s.linienbreite);
      kreisbogen(z, s.x, s.y, s.r, s.r);
      malen(z, s.fuell, s.strich);
      return;
    case "ellipse": {
      farbOps(z, s.fuell, s.strich, null);
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      kreisbogen(z, mx, my, Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2);
      malen(z, s.fuell, s.strich);
      return;
    }
    case "pfad":
      farbOps(z, s.fuell, s.strich, s.linienbreite);
      pfadOperatoren(s.schritte, z);
      malen(z, s.fuell, s.strich);
      return;
    case "maske":
      // Eine Maske ohne Gruppe hat keine Reichweite — sie kommt aus der
      // flachen Fassung, die nur fuer den Vergleich gedacht ist.
      return;
    case "verlauf":
      verlauf(s, z);
      return;
    case "radialverlauf":
      return;
    case "bild": {
      const bild = z.bilder.get(s.quelle);
      if (!bild) return;
      const name = z.blatt.node.newXObject("Bild", bild.ref);
      // "cover": das Bild deckt den Rahmen und wird beschnitten; die
      // Gruppe darum maskiert ihn. "contain": es passt vollstaendig hinein.
      const skalaX = s.b / bild.b;
      const skalaY = s.h / bild.h;
      const f = s.fuellmodus === "contain"
        ? Math.min(skalaX, skalaY) : Math.max(skalaX, skalaY);
      const bb = bild.b * f;
      const hh = bild.h * f;
      z.blatt.pushOperators(
        P.concatTransformationMatrix(bb, 0, 0, hh,
          s.x + (s.b - bb) / 2, s.y + (s.h - hh) / 2),
        P.drawObject(name),
      );
      return;
    }
    case "qr": {
      if (!z.qr) return;
      const felder = z.qr(s.inhalt);
      const n = felder.length;
      if (!n) return;
      const farbe = s.farbe ?? [0, 0, 0, 1];
      z.blatt.pushOperators(P.setFillingRgbColor(farbe[0], farbe[1], farbe[2]));
      const bx = s.b / n;
      const by = s.h / n;
      for (let zeile = 0; zeile < n; zeile++) {
        for (let spalte = 0; spalte < n; spalte++) {
          if (!felder[zeile][spalte]) continue;
          // Die Felder kommen von oben nach unten, das PDF zaehlt von unten.
          z.blatt.pushOperators(P.rectangle(
            s.x + spalte * bx, s.y + s.h - (zeile + 1) * by, bx, by));
        }
      }
      z.blatt.pushOperators(P.fill());
      return;
    }
    case "gruppe":
      return;
  }
}

function malen(z: Zustand, fuell: RGBA | null, strich: RGBA | null): void {
  const P = z.PDFLib;
  if (fuell && strich) z.blatt.pushOperators(P.fillAndStroke());
  else if (fuell) z.blatt.pushOperators(P.fill());
  else if (strich) z.blatt.pushOperators(P.stroke());
  else z.blatt.pushOperators(P.endPath());
}

function rundRechteck(z: Zustand, x: number, y: number, b: number, h: number,
                      r: number): void {
  const P = z.PDFLib;
  const rr = Math.min(r, Math.abs(b) / 2, Math.abs(h) / 2);
  const k = rr * KAPPA;
  z.blatt.pushOperators(
    P.moveTo(x + rr, y),
    P.lineTo(x + b - rr, y),
    P.appendBezierCurve(x + b - rr + k, y, x + b, y + rr - k, x + b, y + rr),
    P.lineTo(x + b, y + h - rr),
    P.appendBezierCurve(x + b, y + h - rr + k, x + b - rr + k, y + h, x + b - rr, y + h),
    P.lineTo(x + rr, y + h),
    P.appendBezierCurve(x + rr - k, y + h, x, y + h - rr + k, x, y + h - rr),
    P.lineTo(x, y + rr),
    P.appendBezierCurve(x, y + rr - k, x + rr - k, y, x + rr, y),
    P.closePath(),
  );
}

function kreisbogen(z: Zustand, cx: number, cy: number, rx: number, ry: number): void {
  const P = z.PDFLib;
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  z.blatt.pushOperators(
    P.moveTo(cx + rx, cy),
    P.appendBezierCurve(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry),
    P.appendBezierCurve(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy),
    P.appendBezierCurve(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry),
    P.appendBezierCurve(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy),
    P.closePath(),
  );
}

/**
 * Legt einen Eintrag in einer Betriebsmittel-Untertafel der Seite an und
 * gibt seinen Namen zurueck.
 *
 * pdf-lib hat dafuer newFontDictionary, newXObject und newExtGState —
 * aber nichts fuer Shading. Darum hier von Hand, in derselben Form: die
 * Untertafel anlegen, wenn sie fehlt, und einen Namen durchzaehlen, bis
 * er frei ist.
 */
function neuesBetriebsmittel(z: Zustand, tafel: string, praefix: string,
                             ref: PDFRef): import("pdf-lib").PDFName {
  const P = z.PDFLib;
  const betriebsmittel = z.blatt.node.Resources();
  if (!betriebsmittel) {
    throw new Error("Die Seite hat keine Betriebsmittel — das kann nicht sein.");
  }
  const schluessel = P.PDFName.of(tafel);
  let unter = betriebsmittel.lookup(schluessel, P.PDFDict);
  if (!unter) {
    unter = P.PDFDict.withContext(z.doc.context);
    betriebsmittel.set(schluessel, unter);
  }
  let i = 0;
  let name = P.PDFName.of(`${praefix}${i}`);
  while (unter.has(name)) {
    i += 1;
    name = P.PDFName.of(`${praefix}${i}`);
  }
  unter.set(name, ref);
  return name;
}

function pfadOperatoren(schritte: PfadSchritt[], z: Zustand): void {
  const P = z.PDFLib;
  for (const t of schritte) {
    switch (t[0]) {
      case "moveTo": z.blatt.pushOperators(P.moveTo(t[1], t[2])); break;
      case "lineTo": z.blatt.pushOperators(P.lineTo(t[1], t[2])); break;
      case "curveTo":
        z.blatt.pushOperators(P.appendBezierCurve(t[1], t[2], t[3], t[4], t[5], t[6]));
        break;
      case "close": z.blatt.pushOperators(P.closePath()); break;
      case "rect": z.blatt.pushOperators(P.rectangle(t[1], t[2], t[3], t[4])); break;
      case "roundRect": rundRechteck(z, t[1], t[2], t[3], t[4], t[5]); break;
      case "circle": kreisbogen(z, t[1], t[2], t[3], t[3]); break;
      case "ellipse":
        kreisbogen(z, (t[1] + t[3]) / 2, (t[2] + t[4]) / 2,
                   Math.abs(t[3] - t[1]) / 2, Math.abs(t[4] - t[2]) / 2);
        break;
    }
  }
}

/**
 * Ein linearer Verlauf als axiale Schattierung (ShadingType 2).
 *
 * Es gibt dafuer keinen Operator in pdf-lib, nur den rohen `sh`. Die
 * Schattierung selbst wird als Betriebsmittel der Seite angelegt. Ohne das
 * muesste der Verlauf in Streifen gemalt werden, und Streifen sieht man.
 */
function verlauf(s: Extract<Schritt, { art: "verlauf" }>, z: Zustand): void {
  const P = z.PDFLib;
  const farben = s.farben;
  if (farben.length < 2) return;
  const funktion = farben.length === 2
    ? z.doc.context.obj({
        FunctionType: 2, Domain: [0, 1], N: 1,
        C0: [farben[0][0], farben[0][1], farben[0][2]],
        C1: [farben[1][0], farben[1][1], farben[1][2]],
      })
    : z.doc.context.obj({
        FunctionType: 3, Domain: [0, 1],
        Functions: farben.slice(0, -1).map((c, i) => z.doc.context.obj({
          FunctionType: 2, Domain: [0, 1], N: 1,
          C0: [c[0], c[1], c[2]],
          C1: [farben[i + 1][0], farben[i + 1][1], farben[i + 1][2]],
        })),
        Bounds: s.stellen ?? farben.slice(1, -1).map((_, i) => (i + 1) / (farben.length - 1)),
        Encode: farben.slice(0, -1).flatMap(() => [0, 1]),
      });
  const schattierung = z.doc.context.obj({
    ShadingType: 2,
    ColorSpace: "DeviceRGB",
    Coords: [s.x0, s.y0, s.x1, s.y1],
    Function: z.doc.context.register(funktion),
    Extend: [true, true],
  });
  const ref = z.doc.context.register(schattierung);
  const name = neuesBetriebsmittel(z, "Shading", "Verlauf", ref);
  z.blatt.pushOperators(P.PDFOperator.of("sh" as never, [name]));
}
