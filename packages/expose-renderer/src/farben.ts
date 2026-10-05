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

/** Studio: Signalfarbe und Dunkelton. Aus immoOffice_studio_generator.py. */
export function themaStudio(signal: string, dunkel: string) {
  const s = hx(signal), d = hx(dunkel);
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
  };
}

/** Die Vorgabefarben der Prototypen, als Rueckfall und fuer die Pruefung. */
export const VORGABE = {
  raster: { f1: "#0F4C5C", f2: "#E8915A" },
  signature: { f1: "#2B221D", f2: "#B08A5E" },
  studio: { f1: "#2F4BFF", f2: "#111318" },
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
  return { art: "studio" as const, ...themaStudio(f1, f2) };
}
