/**
 * Minimaler ZIP-Schreiber (nur „Store", ohne Kompression) — fuer „jede
 * Seite einzeln" in den PDF-Werkzeugen. Laeuft im Browser und in Node.
 */

const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(daten: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < daten.length; i++) c = (CRC_TABELLE[(c ^ (daten[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosZeit(d: Date): { zeit: number; datum: number } {
  return { zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), datum: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

export function zipErzeugen(dateien: Array<{ name: string; daten: Uint8Array }>, jetzt: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { zeit, datum } = dosZeit(jetzt);
  const lokal: Uint8Array[] = [];
  const zentral: Uint8Array[] = [];
  let versatz = 0;
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  for (const f of dateien) {
    const name = enc.encode(f.name);
    const crc = crc32(f.daten);
    const kopf = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(zeit), ...u16(datum), ...u32(crc), ...u32(f.daten.length), ...u32(f.daten.length), ...u16(name.length), ...u16(0), ...name]);
    lokal.push(kopf, f.daten);
    zentral.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(zeit), ...u16(datum), ...u32(crc), ...u32(f.daten.length), ...u32(f.daten.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(versatz), ...name]));
    versatz += kopf.length + f.daten.length;
  }
  const zentralLaenge = zentral.reduce((s, z) => s + z.length, 0);
  const ende = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(dateien.length), ...u16(dateien.length), ...u32(zentralLaenge), ...u32(versatz), ...u16(0)]);
  const gesamt = new Uint8Array(versatz + zentralLaenge + ende.length);
  let p = 0;
  for (const t of [...lokal, ...zentral, ende]) { gesamt.set(t, p); p += t.length; }
  return gesamt;
}
