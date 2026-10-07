// ============================================================================
// Farben und Farbableitung der drei Exposé-Vorlagen
// ----------------------------------------------------------------------------
// 1:1 aus den ReportLab-Prototypen in reference/expose-vorlagen/ uebernommen.
// Der Auftrag nennt die Ableitung ausdruecklich verbindlich: sie entscheidet,
// wie aus zwei gewaehlten Farben die ganze Palette einer Vorlage entsteht.
// Wer hier eine Zahl aendert, aendert das Aussehen jedes Exposés.
//
// tests/expose-farben.js prueft jede abgeleitete Farbe gegen die Werte, die
// die Prototypen rechnen — nicht gegen abgeschriebene Zahlen.
// ============================================================================

/** Eine Farbe in den Anteilen 0..1, wie ReportLab und pdf-lib sie fuehren. */
export type Farbe = { r: number; g: number; b: number };

/** "#RRGGBB" -> Farbe. Kurzform (#RGB) wird mitgenommen. */
export function hx(h: string): Farbe {
  let s = String(h).trim().replace(/^#/, "");
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (!/^[0-9a-fA-F]{6}$/.test(s)) throw new Error(`Keine Farbe: ${h}`);
  return {
    r: parseInt(s.slice(0, 2), 16) / 255,
    g: parseInt(s.slice(2, 4), 16) / 255,
    b: parseInt(s.slice(4, 6), 16) / 255,
  };
}

/** Farbe -> "#RRGGBB". Nur fuer Protokoll und Pruefung. */
export function hex(c: Farbe): string {
  const z = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, "0");
  return "#" + z(c.r) + z(c.g) + z(c.b);
}

/**
 * Linear zwischen zwei Farben mischen, t = 0 ist a, t = 1 ist b.
 * Wortgleich mit mix() in allen drei Prototypen.
 */
export function mix(a: Farbe, b: Farbe, t: number): Farbe {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export const WEISS: Farbe = { r: 1, g: 1, b: 1 };
export const SCHWARZ: Farbe = { r: 0, g: 0, b: 0 };

/**
 * Wahrgenommene Helligkeit nach der Gewichtung, die der Studio-Prototyp
 * benutzt (0,299 / 0,587 / 0,114). Bewusst NICHT die WCAG-Formel: der
 * Prototyp entscheidet damit, ob Text auf der Signalflaeche weiss oder
 * dunkel steht, und diese Entscheidung soll gleich ausfallen.
 */
export function helligkeit(c: Farbe): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

// ----------------------------------------------------------------- Vorlagen

/** Raster: Primaerfarbe und Akzent. Aus immoOffice_expose_generator.py. */
export function themaRaster(primaer: string, akzent: string) {
  const p = hx(primaer), a = hx(akzent);
  // Der Prototyp mischt hier zweimal hintereinander — erst in Richtung
  // Schwarz, dann in Richtung eines sehr dunklen Grau. Beides beibehalten,
  // auch wenn es sich zusammenfassen liesse: das Ergebnis waere ein anderes.
  const ink0 = mix(p, SCHWARZ, 0.55);
  return {
    p, a,
    ink: mix(ink0, hx("#1A1A1A"), 0.6),
    text: hx("#3A3F44"),
    muted: hx("#8A9097"),
    line: mix(p, WEISS, 0.82),
    surf: mix(p, WEISS, 0.93),
    surf2: mix(p, WEISS, 0.86),
    pdark: mix(p, SCHWARZ, 0.25),
    asoft: mix(a, WEISS, 0.8),
  };
}

/** Signature: Dunkelton und Metallakzent. Aus immoOffice_luxus_generator.py. */
export function themaSignature(dunkel: string, metall: string) {
  const d = hx(dunkel), a = hx(metall);
  // Der Papierton entsteht in zwei Schritten: erst ein Hauch Metall ins
  // Weiss, dann ein Hauch Dunkelton. Das ergibt den warmen, nicht ganz
  // weissen Grund, von dem die Vorlage lebt.
  const paper = mix(mix(WEISS, a, 0.07), d, 0.015);
  return {
    d, a, paper,
    paper2: mix(paper, d, 0.05),
    ink: mix(d, SCHWARZ, 0.2),
    text: mix(d, paper, 0.18),
    muted: mix(d, paper, 0.52),
    hair: mix(d, paper, 0.8),
    onD: mix(paper, d, 0.08),
    onDm: mix(paper, d, 0.45),
    dline: mix(d, paper, 0.18),
  };
}

/**
 * Haelt eine Schriftfarbe von ihrem Grund fern. Gegeben ist die gewuenschte
 * Farbe und die Flaeche, auf der sie steht; zurueck kommt dieselbe Farbe,
 * nur so weit aufgehellt (auf hellem Grund: abgedunkelt), dass man sie
 * lesen kann.
 *
 * Gebraucht wird das, weil die Vorlagen an einigen Stellen die Signalfarbe
 * des Mandanten auf den Dunkelton setzen. Im Prototyp ist die Signalfarbe
 * ein helles Blau und der Dunkelton fast schwarz — das traegt. Waehlt ein
 * Mandant ein dunkles Bordeaux, steht die Beschriftung dunkelrot auf
 * dunkelgrau und ist weg. Die Schwelle ist bewusst so gesetzt, dass die
 * Prototypfarben unveraendert durchgehen: hier wird nichts umgestaltet,
 * hier wird nur ein unlesbarer Fall gerettet.
 */
export function abstandHalten(vorn: Farbe, hinten: Farbe, mindest = 0.25): Farbe {
  const ziel = helligkeit(hinten) > 0.5 ? SCHWARZ : WEISS;
  if (Math.abs(helligkeit(vorn) - helligkeit(hinten)) >= mindest) return vorn;
  for (let t = 0.05; t <= 0.9; t += 0.05) {
    const c = mix(vorn, ziel, t);
    if (Math.abs(helligkeit(c) - helligkeit(hinten)) >= mindest) return c;
  }
  return ziel;
}

/** Studio: Signalfarbe und Dunkelton. Aus immoOffice_studio_generator.py. */
export function themaStudio(signal: string, dunkel: string) {
  const s = hx(signal);
  const gewaehlt = hx(dunkel);
  // Studio braucht an dieser Stelle einen DUNKLEN Ton: aus ihm werden die
  // Markenflaeche, die Linien, der Fliesstext und der gedaempfte Text. Der
  // Mandant waehlt dafuer seine Akzentfarbe, und die ist nicht zwingend
  // dunkel. Am 06.10.2026 stand im eigenen Projekt ein helles Grau
  // (#C2C2BD) — die Markenflaeche wurde hellgrau, die Schrift darauf ist
  // weiss, und der Firmenname war auf dem Papier praktisch unsichtbar.
  //
  // Also abdunkeln statt uebernehmen, und zwar nur dann: ein dunkler Akzent
  // bleibt unveraendert, die Prototypfarbe (#111318) auch. Dieselbe Art von
  // Automatik, die der Auftrag fuer on_s ausdruecklich vorsieht.
  const d = helligkeit(gewaehlt) > 0.5 ? mix(gewaehlt, SCHWARZ, 0.8) : gewaehlt;
  return {
    s, d,
    // Die eine Automatik, die der Auftrag ausdruecklich nennt: Text auf der
    // Signalflaeche wird dunkel, sobald die Flaeche hell ist. Die Schwelle
    // 0,62 steht so im Prototyp.
    on_s: helligkeit(s) > 0.62 ? d : WEISS,
    paper: hx("#FFFFFF"),
    tint: mix(s, WEISS, 0.88),
    tint2: mix(s, WEISS, 0.74),
    text: mix(d, WEISS, 0.12),
    muted: mix(d, WEISS, 0.48),
    rule: d,
    hair: mix(d, WEISS, 0.84),
    // Die Signalfarbe, lesbar auf dem Dunkelton. Die Kontaktseite setzt
    // ihre Beschriftungen darauf. Mit der Prototypfarbe ist das dieselbe
    // Farbe wie s; bei einer dunklen Mandantenfarbe eine aufgehellte.
    s_auf_d: abstandHalten(s, d),
  };
}

/**
 * Luminanz nach sRGB (WCAG), wie lum() im Buehne-Prototyp. Buehne
 * entscheidet damit, ob der Akzent hell ist — dann steht Text darauf
 * dunkel und der Akzent selbst wird fuer Text abgedunkelt.
 */
function luminanz(c: Farbe): number {
  const f = (v: number) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** Buehne: Primaer (dunkel) und Akzent. Aus immoOffice_buehne_generator.py. */
export function themaBuehne(primaer: string, akzent: string) {
  const d = hx(primaer), a = hx(akzent);
  const hell = luminanz(a) > 0.45;
  const paper = mix(mix(WEISS, a, 0.07), d, 0.01);
  return {
    d, a, paper,
    card: WEISS,
    ink: mix(d, SCHWARZ, 0.2),
    text: mix(d, paper, 0.14),
    muted: mix(d, paper, 0.48),
    line: mix(d, paper, 0.86),
    soft: mix(paper, a, 0.20),
    softD: mix(paper, d, 0.07),
    ph: mix(mix(paper, d, 0.14), a, 0.10),
    onD: mix(WEISS, d, 0.05),
    onDm: mix(WEISS, d, 0.40),
    dline: mix(d, WEISS, 0.20),
    dsoft: mix(d, WEISS, 0.08),
    dsoft2: mix(d, WEISS, 0.10),
    onA: hell ? mix(d, SCHWARZ, 0.3) : WEISS,
    aT: hell ? mix(a, d, 0.4) : a,
    // Der grosse Betrag auf dem Dunkelton: Akzent, wenn er dort lesbar ist.
    aAufD: luminanz(a) > 0.08 ? a : mix(WEISS, d, 0.05),
    aSoft: mix(a, paper, 0.5),
    dSoft: mix(d, paper, 0.55),
  };
}

/** Die Vorgabefarben der Prototypen, als Rueckfall und fuer die Pruefung. */
export const VORGABE = {
  raster: { f1: "#0F4C5C", f2: "#E8915A" },
  signature: { f1: "#2B221D", f2: "#B08A5E" },
  studio: { f1: "#2F4BFF", f2: "#111318" },
  buehne: { f1: "#2D2A4A", f2: "#F08A5D" },
} as const;

export type Ableitung = keyof typeof VORGABE;

/**
 * Palette einer Vorlage. f1 und f2 sind die beiden Farben, die der Mandant
 * waehlt; was daraus wird, entscheidet die Ableitung.
 *
 * ACHTUNG Studio: dort ist f1 die SIGNALFARBE und f2 der Dunkelton. Beim
 * Raster und bei Signature ist f1 die ruhige und f2 die akzentuierende
 * Farbe. Der Auftrag dreht die Zuordnung fuer Studio ausdruecklich, damit
 * der Akzent des Mandanten die Signalflaeche traegt.
 */
export function palette(ableitung: Ableitung, f1: string, f2: string) {
  if (ableitung === "raster") return { art: "raster" as const, ...themaRaster(f1, f2) };
  if (ableitung === "signature") return { art: "signature" as const, ...themaSignature(f1, f2) };
  if (ableitung === "buehne") return { art: "buehne" as const, ...themaBuehne(f1, f2) };
  return { art: "studio" as const, ...themaStudio(f1, f2) };
}
