/**
 * Farbableitung und Kontrastpruefung fuer das Erscheinungsbild eines Mandanten.
 *
 * docs/AUTONOMIE.md B1: Der Mandant waehlt Primaer- und Akzentfarbe;
 * Hintergrund, Text, Raender und Hover-Stufen werden abgeleitet. Kontrast
 * nach WCAG 2.1 AA, mit Warnung und Korrekturvorschlag.
 *
 * Gerechnet wird in OKLCH (E-2026-09-03-08): Dort sind Helligkeitsschritte
 * wahrnehmungsgleichmaessig — eine um 0,1 aufgehellte Marineblaustufe wirkt
 * so aufgehellt wie eine um 0,1 aufgehellte Goldstufe. Ausgegeben wird Hex,
 * weil PDF-Erzeugung und Mailprogramme nichts anderes verstehen.
 *
 * Keine Abhaengigkeiten: Die Umrechnungen sind kurz, und eine Farbbibliothek
 * fuer drei Formeln waere mehr Paket als Nutzen.
 */

export interface Oklch {
  /** Helligkeit 0–1 */
  l: number;
  /** Chroma, 0 = grau; Alltagsfarben liegen unter 0,37 */
  c: number;
  /** Farbwinkel in Grad, 0–360 */
  h: number;
}

const HEX = /^#?([0-9a-f]{6})$/i;

/** Wahr fuer sechsstellige Hexfarben, mit oder ohne `#`. */
export function istHexfarbe(wert: string): boolean {
  return HEX.test(wert.trim());
}

/** Normalisiert auf `#RRGGBB` in Grossbuchstaben. Wirft bei ungueltiger Eingabe. */
export function hexNormalisieren(wert: string): string {
  const treffer = HEX.exec(wert.trim());
  if (!treffer) throw new Error(`Keine gueltige Hexfarbe: ${wert}`);
  return `#${treffer[1]!.toUpperCase()}`;
}

// --- sRGB <-> linear ---------------------------------------------------------

function hexZuRgb(hex: string): [number, number, number] {
  const h = hexNormalisieren(hex).slice(1);
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function rgbZuHex([r, g, b]: [number, number, number]): string {
  const k = (x: number) =>
    Math.round(Math.min(1, Math.max(0, x)) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${k(r)}${k(g)}${k(b)}`;
}

function linearisieren(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function delinearisieren(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

// --- linear sRGB <-> OKLab <-> OKLCH -----------------------------------------
// Matrizen nach Bjoern Ottosson (oklab, 2020), Standardimplementierung.

function linearZuOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabZuLinear([L, a, b]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Hex nach OKLCH. */
export function hexZuOklch(hex: string): Oklch {
  const [r, g, b] = hexZuRgb(hex).map(linearisieren) as [number, number, number];
  const [L, a, bb] = linearZuOklab([r, g, b]);
  const c = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c: c < 1e-6 ? 0 : c, h: c < 1e-6 ? 0 : h };
}

/**
 * OKLCH nach Hex. Liegt die Farbe ausserhalb des sRGB-Raums, wird das Chroma
 * schrittweise verringert, bis sie hineinpasst — der Farbton bleibt.
 */
export function oklchZuHex({ l, c, h }: Oklch): string {
  const L = Math.min(1, Math.max(0, l));
  let chroma = Math.max(0, c);
  for (let i = 0; i < 24; i++) {
    const rad = (h * Math.PI) / 180;
    const lin = oklabZuLinear([L, chroma * Math.cos(rad), chroma * Math.sin(rad)]);
    const imRaum = lin.every((x) => x >= -0.0005 && x <= 1.0005);
    if (imRaum || chroma < 1e-4) {
      return rgbZuHex(lin.map(delinearisieren) as [number, number, number]);
    }
    chroma *= 0.85;
  }
  return rgbZuHex(oklabZuLinear([L, 0, 0]).map(delinearisieren) as [number, number, number]);
}

// --- Kontrast nach WCAG 2.1 --------------------------------------------------

function relativeLuminanz(hex: string): number {
  const [r, g, b] = hexZuRgb(hex).map(linearisieren) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastverhaeltnis 1–21 nach WCAG 2.1. Reihenfolge der Farben ist egal. */
export function kontrast(a: string, b: string): number {
  const la = relativeLuminanz(a);
  const lb = relativeLuminanz(b);
  const [hell, dunkel] = la >= lb ? [la, lb] : [lb, la];
  return (hell + 0.05) / (dunkel + 0.05);
}

/** WCAG AA: 4,5 fuer Fliesstext, 3 fuer grosse Schrift und Bedienelemente. */
export const AA_TEXT = 4.5;
export const AA_GROSS = 3;

/** Weiss oder fast Schwarz — je nachdem, was auf der Flaeche besser lesbar ist. */
export function textfarbeAuf(flaeche: string): string {
  return kontrast(flaeche, "#FFFFFF") >= kontrast(flaeche, "#111111") ? "#FFFFFF" : "#111111";
}

// --- Ableitung ---------------------------------------------------------------

export interface Palette {
  primaer: string;
  primaerDunkel: string;
  primaerHell: string;
  primaerHover: string;
  akzent: string;
  akzentHell: string;
  akzentHover: string;
  /** Sehr helle Primaertoenung fuer Seitenhintergruende */
  grund: string;
  /** Kartenflaeche */
  flaeche: string;
  /** Linien und Raender, leicht getoent */
  linie: string;
  /** Gedaempfter Text */
  gedaempft: string;
  textAufPrimaer: string;
  textAufAkzent: string;
}

function mitHelligkeit(hex: string, l: number, chromaFaktor = 1): string {
  const farbe = hexZuOklch(hex);
  return oklchZuHex({ l, c: farbe.c * chromaFaktor, h: farbe.h });
}

function verschieben(hex: string, dl: number): string {
  const farbe = hexZuOklch(hex);
  return oklchZuHex({ ...farbe, l: Math.min(1, Math.max(0, farbe.l + dl)) });
}

/**
 * Leitet aus zwei Farben die gesamte Palette ab.
 *
 * Hover ist bei dunklen Farben eine Aufhellung, bei hellen eine Abdunklung —
 * sonst verschwindet eine ohnehin dunkle Hauptfarbe beim Zeigen in Schwarz.
 */
export function paletteAbleiten(primaerEingabe: string, akzentEingabe: string): Palette {
  const primaer = hexNormalisieren(primaerEingabe);
  const akzent = hexNormalisieren(akzentEingabe);
  const pl = hexZuOklch(primaer).l;
  const al = hexZuOklch(akzent).l;

  return {
    primaer,
    primaerDunkel: verschieben(primaer, -0.08),
    primaerHell: mitHelligkeit(primaer, 0.9, 0.5),
    primaerHover: verschieben(primaer, pl < 0.5 ? 0.07 : -0.07),
    akzent,
    akzentHell: mitHelligkeit(akzent, 0.92, 0.5),
    akzentHover: verschieben(akzent, al < 0.5 ? 0.07 : -0.07),
    grund: mitHelligkeit(primaer, 0.985, 0.15),
    flaeche: "#FFFFFF",
    linie: mitHelligkeit(primaer, 0.92, 0.2),
    gedaempft: mitHelligkeit(primaer, 0.58, 0.25),
    textAufPrimaer: textfarbeAuf(primaer),
    textAufAkzent: textfarbeAuf(akzent),
  };
}

/** CSS-Variablen fuer die Anwendung (B6): werden beim Login gesetzt. */
export function cssVariablen(p: Palette): Record<string, string> {
  return {
    "--marke-primaer": p.primaer,
    "--marke-primaer-dunkel": p.primaerDunkel,
    "--marke-primaer-hell": p.primaerHell,
    "--marke-primaer-hover": p.primaerHover,
    "--marke-akzent": p.akzent,
    "--marke-akzent-hell": p.akzentHell,
    "--marke-akzent-hover": p.akzentHover,
    "--marke-grund": p.grund,
    "--marke-flaeche": p.flaeche,
    "--marke-linie": p.linie,
    "--marke-gedaempft": p.gedaempft,
    "--marke-text-auf-primaer": p.textAufPrimaer,
    "--marke-text-auf-akzent": p.textAufAkzent,
  };
}

// --- Pruefung mit Korrekturvorschlag ----------------------------------------

export interface Kontrastbefund {
  /** Welche Kombination betroffen ist, in Nutzersprache */
  stelle: string;
  verhaeltnis: number;
  mindestens: number;
  /** Vorschlag, der die Mindestanforderung erfuellt — oder null, wenn keiner noetig */
  vorschlag: string | null;
  /** Welche der beiden Farben der Vorschlag ersetzt */
  ersetzt: "primaer" | "akzent" | null;
}

/**
 * Hellt oder dunkelt eine Farbe in OKLCH so lange, bis der Kontrast zur
 * Referenz erreicht ist. Bewegt sich von der Referenzhelligkeit weg; der
 * Farbton bleibt erhalten. Null, wenn selbst Weiss/Schwarz nicht reicht.
 */
export function kontrastKorrigieren(
  farbe: string,
  referenz: string,
  mindestens: number,
): string | null {
  const start = hexZuOklch(farbe);
  const referenzL = hexZuOklch(referenz).l;
  const richtung = start.l >= referenzL ? 1 : -1;

  for (let schritt = 0; schritt <= 40; schritt++) {
    const l = Math.min(1, Math.max(0, start.l + richtung * schritt * 0.02));
    const kandidat = oklchZuHex({ ...start, l });
    if (kontrast(kandidat, referenz) >= mindestens) return kandidat;
    if (l === 0 || l === 1) break;
  }
  return null;
}

/**
 * Prueft die drei Kombinationen, die in Dokumenten und Oberflaeche wirklich
 * vorkommen: Text auf Primaerflaeche, Akzentbeschriftung auf Primaerflaeche,
 * Akzent als Text auf Weiss.
 *
 * Gibt nur Befunde zurueck, die UNTER der Anforderung liegen. Eine leere Liste
 * heisst: alles in Ordnung.
 */
export function kontrastPruefen(primaerEingabe: string, akzentEingabe: string): Kontrastbefund[] {
  const primaer = hexNormalisieren(primaerEingabe);
  const akzent = hexNormalisieren(akzentEingabe);
  const befunde: Kontrastbefund[] = [];

  const textAufPrimaer = kontrast(primaer, textfarbeAuf(primaer));
  if (textAufPrimaer < AA_TEXT) {
    befunde.push({
      stelle: "Schrift auf der Hauptfarbe (Titel, Preisband)",
      verhaeltnis: textAufPrimaer,
      mindestens: AA_TEXT,
      vorschlag: kontrastKorrigieren(primaer, textfarbeAuf(primaer), AA_TEXT),
      ersetzt: "primaer",
    });
  }

  const akzentAufPrimaer = kontrast(primaer, akzent);
  if (akzentAufPrimaer < AA_GROSS) {
    befunde.push({
      stelle: "Akzentfarbe auf der Hauptfarbe (Beschriftungen, Linien)",
      verhaeltnis: akzentAufPrimaer,
      mindestens: AA_GROSS,
      vorschlag: kontrastKorrigieren(akzent, primaer, AA_GROSS),
      ersetzt: "akzent",
    });
  }

  const akzentAufWeiss = kontrast(akzent, "#FFFFFF");
  if (akzentAufWeiss < AA_GROSS) {
    befunde.push({
      stelle: "Akzentfarbe als Schrift auf Weiss (Verweise, Preise)",
      verhaeltnis: akzentAufWeiss,
      mindestens: AA_GROSS,
      vorschlag: kontrastKorrigieren(akzent, "#FFFFFF", AA_GROSS),
      ersetzt: "akzent",
    });
  }

  return befunde;
}
