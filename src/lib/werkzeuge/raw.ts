/**
 * RAW-Vorschau ohne Decoder: Kameras betten in ARW/CR2/NEF/DNG/RAF/RW2/ORF
 * eine JPEG-Vorschau ein (bei den meisten Modellen in voller Groesse). Sie
 * wird hier byteweise gesucht und als Bild an den Editor gegeben. Die volle
 * Entwicklung aus den Rohdaten laeuft im Browser ueber LibRaw (WASM), sofern
 * das Modul geladen werden kann — sonst bleibt diese Vorschau.
 */

export const RAW_ENDUNGEN = ["arw", "cr2", "cr3", "nef", "dng", "raf", "rw2", "orf", "srw", "pef", "raw"];

export function istRawDatei(name: string): boolean {
  const n = name.toLowerCase();
  return RAW_ENDUNGEN.some((e) => n.endsWith(`.${e}`));
}

/** Alle eingebetteten JPEGs (SOI … EOI) finden; das groesste ist die beste Vorschau. */
export function eingebetteteJpegs(daten: Uint8Array, maxAnzahl = 8): Array<{ start: number; ende: number }> {
  const aus: Array<{ start: number; ende: number }> = [];
  let i = 0;
  while (i < daten.length - 3 && aus.length < maxAnzahl) {
    // SOI FF D8 FF
    if (daten[i] === 0xff && daten[i + 1] === 0xd8 && daten[i + 2] === 0xff) {
      const start = i;
      let j = i + 2;
      let ende = -1;
      // Segmente ueberspringen bis zum Start des Scans (FF DA), dann nach EOI (FF D9) suchen
      while (j < daten.length - 3) {
        if (daten[j] !== 0xff) { j++; continue; }
        const marker = daten[j + 1] ?? 0;
        if (marker === 0xd8) break; // verschachteltes SOI — ungueltig
        if (marker === 0xd9) { ende = j + 2; break; }
        if (marker === 0xda) {
          // Scan: bis zum naechsten EOI lesen
          let k = j + 2;
          while (k < daten.length - 1) {
            if (daten[k] === 0xff && daten[k + 1] === 0xd9) { ende = k + 2; break; }
            k++;
          }
          break;
        }
        if (marker >= 0xd0 && marker <= 0xd7) { j += 2; continue; } // RSTn ohne Laenge
        const laenge = ((daten[j + 2] ?? 0) << 8) | (daten[j + 3] ?? 0);
        if (laenge < 2) break;
        j += 2 + laenge;
      }
      if (ende > start + 2000) {
        aus.push({ start, ende });
        i = ende;
        continue;
      }
    }
    i++;
  }
  return aus;
}

/** Groesste eingebettete JPEG-Vorschau als Bytes, oder null. */
export function rawVorschau(daten: Uint8Array): Uint8Array | null {
  const kandidaten = eingebetteteJpegs(daten);
  if (kandidaten.length === 0) return null;
  const groesste = kandidaten.reduce((a, b) => (b.ende - b.start > a.ende - a.start ? b : a));
  return daten.subarray(groesste.start, groesste.ende);
}
