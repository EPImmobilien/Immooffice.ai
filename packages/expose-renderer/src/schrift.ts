// ============================================================================
// Schriftmetrik
// ----------------------------------------------------------------------------
// Eigener Leser fuer cmap, hmtx und head statt fontkit. Grund: die Breite
// einer Zeile entscheidet ueber den Umbruch, und der Umbruch entscheidet
// darueber, ob ein Expose so aussieht wie die verbindliche Vorlage. Die
// Prototypen rechnen mit pdfmetrics.stringWidth — Vorschubbreiten addiert,
// ohne Unterschneidung, ohne Ligaturen. Das sind dreissig Zeilen Code; eine
// Bibliothek dazwischen waere eine Bibliothek, deren Satzmerkmale man
// abschalten muesste, ohne es nachpruefen zu koennen.
//
// Fehlt ein Zeichen in der Schrift, nimmt ReportLab Glyph 0. Hier auch —
// aber es wird gemeldet (siehe fehlendeZeichen).
// ============================================================================

export type Metrik = {
  /** Vorschubbreiten je Zeichencode, in Einheiten der Schrift. */
  breiten: Map<number, number>;
  /** Vorschubbreite von Glyph 0, fuer Zeichen, die die Schrift nicht hat. */
  ersatz: number;
  einheiten: number;
  /** Oberlaenge und Unterlaenge aus hhea, in Einheiten der Schrift. */
  oben: number;
  unten: number;
  /** Rohdaten, damit pdf-lib dieselbe Datei einbetten kann. */
  daten: Uint8Array;
  name: string;
};

function lesePruefer(daten: Uint8Array) {
  const d = new DataView(daten.buffer, daten.byteOffset, daten.byteLength);
  return {
    u8: (p: number) => d.getUint8(p),
    u16: (p: number) => d.getUint16(p),
    i16: (p: number) => d.getInt16(p),
    u32: (p: number) => d.getUint32(p),
  };
}

/** Tabellenverzeichnis einer TrueType-Datei. */
function tabellen(daten: Uint8Array): Map<string, number> {
  const r = lesePruefer(daten);
  const anzahl = r.u16(4);
  const verzeichnis = new Map<string, number>();
  for (let i = 0; i < anzahl; i++) {
    const p = 12 + i * 16;
    let kennung = "";
    for (let j = 0; j < 4; j++) kennung += String.fromCharCode(r.u8(p + j));
    verzeichnis.set(kennung, r.u32(p + 8));
  }
  return verzeichnis;
}

/** cmap: Zeichencode -> Glyphnummer. Format 4 und 12, mehr braucht es nicht. */
function leseCmap(daten: Uint8Array, anfang: number): Map<number, number> {
  const r = lesePruefer(daten);
  const unterTabellen = r.u16(anfang + 2);
  let besser = -1;
  let bestePunkte = -1;
  for (let i = 0; i < unterTabellen; i++) {
    const p = anfang + 4 + i * 8;
    const plattform = r.u16(p);
    const kodierung = r.u16(p + 2);
    const versatz = r.u32(p + 4);
    // Windows/Unicode voran, dann Unicode, dann der Rest.
    const punkte =
      plattform === 3 && kodierung === 10 ? 5 :
      plattform === 3 && kodierung === 1 ? 4 :
      plattform === 0 ? 3 : 1;
    if (punkte > bestePunkte) { bestePunkte = punkte; besser = anfang + versatz; }
  }
  const zuordnung = new Map<number, number>();
  if (besser < 0) return zuordnung;

  const format = r.u16(besser);
  if (format === 4) {
    const segmente = r.u16(besser + 6) / 2;
    const ende = besser + 14;
    const start = ende + segmente * 2 + 2;
    const delta = start + segmente * 2;
    const bereich = delta + segmente * 2;
    for (let s = 0; s < segmente; s++) {
      const e = r.u16(ende + s * 2);
      const a = r.u16(start + s * 2);
      const dl = r.i16(delta + s * 2);
      const rv = r.u16(bereich + s * 2);
      if (a > e) continue;
      for (let c = a; c <= e && c !== 0x10000; c++) {
        let g: number;
        if (rv === 0) {
          g = (c + dl) & 0xffff;
        } else {
          const p = bereich + s * 2 + rv + (c - a) * 2;
          if (p + 1 >= daten.byteLength) continue;
          g = r.u16(p);
          if (g !== 0) g = (g + dl) & 0xffff;
        }
        if (g !== 0) zuordnung.set(c, g);
      }
    }
  } else if (format === 12) {
    const gruppen = r.u32(besser + 12);
    for (let i = 0; i < gruppen; i++) {
      const p = besser + 16 + i * 12;
      const a = r.u32(p), e = r.u32(p + 4), g = r.u32(p + 8);
      for (let c = a; c <= e; c++) zuordnung.set(c, g + (c - a));
    }
  }
  return zuordnung;
}

/** Vorschubbreiten aus hmtx, aufgeloest ueber die cmap. */
export function metrikLesen(daten: Uint8Array, name: string): Metrik {
  const r = lesePruefer(daten);
  const t = tabellen(daten);
  const head = t.get("head");
  const hhea = t.get("hhea");
  const hmtx = t.get("hmtx");
  const cmap = t.get("cmap");
  if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined) {
    throw new Error(`Schrift ${name}: head, hhea, hmtx oder cmap fehlt.`);
  }
  const einheiten = r.u16(head + 18);
  const oben = r.i16(hhea + 4);
  const unten = r.i16(hhea + 6);
  const anzahlBreiten = r.u16(hhea + 34);

  const vorschub = (glyph: number) => {
    const i = Math.min(glyph, anzahlBreiten - 1);
    return r.u16(hmtx + i * 4);
  };

  const zuordnung = leseCmap(daten, cmap);
  const breiten = new Map<number, number>();
  for (const [code, glyph] of zuordnung) breiten.set(code, vorschub(glyph));

  return { breiten, ersatz: vorschub(0), einheiten, oben, unten, daten, name };
}

/**
 * Breite einer Zeichenkette in Punkt — die Rechnung von
 * pdfmetrics.stringWidth, plus die Sperrung der Prototypen:
 * `cs * max(len(s) - 1, 0)`.
 */
export function breite(m: Metrik, s: string, groesse: number, sperrung = 0): number {
  let summe = 0;
  for (const zeichen of s) {
    const code = zeichen.codePointAt(0)!;
    summe += m.breiten.get(code) ?? m.ersatz;
  }
  // Die Sperrung zaehlt Zeichen, nicht Codepunkte — so wie len(s) in Python
  // auf einer Zeichenkette aus Codepunkten zaehlt.
  const anzahl = Array.from(s).length;
  return (summe * groesse) / m.einheiten + sperrung * Math.max(anzahl - 1, 0);
}

/** Welche Zeichen die Schrift nicht hat. Fuer die Warnung, nicht fuer den Satz. */
export function fehlendeZeichen(m: Metrik, s: string): string[] {
  const fehlt = new Set<string>();
  for (const zeichen of s) {
    const code = zeichen.codePointAt(0)!;
    if (code === 0x0a || code === 0x0d) continue;
    if (!m.breiten.has(code)) fehlt.add(zeichen);
  }
  return Array.from(fehlt);
}
