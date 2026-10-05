// ============================================================================
// Pythons random.Random, nachgebaut
// ----------------------------------------------------------------------------
// Zwei der drei Prototypen streuen Platzhaltergrafik mit
// `random.Random(saat)`: die Baumkulisse im Bildplatzhalter von Signature
// und die Skyline sowie die Haeuserblocks der Karte bei Studio. Die Saat
// ist jeweils eine Zahl, die Folge also fest — und damit Teil der
// verbindlichen Vorlage.
//
// Mit Math.random() waere sie nicht nachzubilden. Ohne sie waere jede
// Platzhaltergrafik "ungefaehr so wie die Referenz", und der Vergleich
// gegen die Prototypen muesste fuer ein Drittel der Zeichenschritte
// aussetzen. Darum hier der Mersenne-Twister MT19937 samt der Saatfunktion
// und der 53-Bit-Zufallszahl, die CPython benutzt.
//
// Nachgeprueft wird das in tests/expose-zufall.js, Folge fuer Folge gegen
// Python selbst.
// ============================================================================

const N = 624;
const M = 397;
const MATRIX = 0x9908b0df;
const OBEN = 0x80000000;
const UNTEN = 0x7fffffff;

export class Zufall {
  private zustand: Uint32Array = new Uint32Array(N);
  private stelle = N + 1;

  /** `random.Random(saat)` mit einer nicht negativen ganzen Zahl. */
  constructor(saat: number) {
    this.ausFeld(Zufall.woerter(saat));
  }

  /**
   * CPython streut einen ganzzahligen Startwert nicht direkt ein, sondern
   * zerlegt ihn in 32-Bit-Woerter und ruft init_by_array. Bei den Saaten
   * der Prototypen (kleine positive Zahlen) ist das genau ein Wort — aber
   * ein Wort, nicht die Zahl selbst, und init_by_array ist nicht
   * init_genrand.
   */
  private static woerter(saat: number): Uint32Array {
    let n = Math.abs(Math.trunc(saat));
    if (n === 0) return Uint32Array.from([0]);
    const raus: number[] = [];
    while (n > 0) {
      raus.push(n % 0x100000000);
      n = Math.floor(n / 0x100000000);
    }
    return Uint32Array.from(raus);
  }

  private initGenrand(s: number): void {
    const z = this.zustand;
    z[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      // 1812433253 * (z[i-1] ^ (z[i-1] >>> 30)) + i, in 32 Bit.
      const v = z[i - 1] ^ (z[i - 1] >>> 30);
      z[i] = (Zufall.mal(1812433253, v) + i) >>> 0;
    }
    this.stelle = N;
  }

  /** 32-Bit-Multiplikation ohne Genauigkeitsverlust. */
  private static mal(a: number, b: number): number {
    const hoch = ((a >>> 16) * (b & 0xffff)) << 16;
    const tief = (a & 0xffff) * b;
    return (hoch + tief) >>> 0;
  }

  private ausFeld(feld: Uint32Array): void {
    this.initGenrand(19650218);
    const z = this.zustand;
    let i = 1;
    let j = 0;
    let k = Math.max(N, feld.length);
    for (; k > 0; k--) {
      const v = z[i - 1] ^ (z[i - 1] >>> 30);
      z[i] = ((z[i] ^ Zufall.mal(1664525, v)) + feld[j] + j) >>> 0;
      i++; j++;
      if (i >= N) { z[0] = z[N - 1]; i = 1; }
      if (j >= feld.length) j = 0;
    }
    for (k = N - 1; k > 0; k--) {
      const v = z[i - 1] ^ (z[i - 1] >>> 30);
      z[i] = ((z[i] ^ Zufall.mal(1566083941, v)) - i) >>> 0;
      i++;
      if (i >= N) { z[0] = z[N - 1]; i = 1; }
    }
    z[0] = 0x80000000;
    this.stelle = N;
  }

  /** Eine 32-Bit-Zufallszahl, genrand_uint32. */
  wort(): number {
    const z = this.zustand;
    if (this.stelle >= N) {
      for (let i = 0; i < N; i++) {
        const y = ((z[i] & OBEN) | (z[(i + 1) % N] & UNTEN)) >>> 0;
        z[i] = (z[(i + M) % N] ^ (y >>> 1) ^ (y & 1 ? MATRIX : 0)) >>> 0;
      }
      this.stelle = 0;
    }
    let y = z[this.stelle++];
    y = (y ^ (y >>> 11)) >>> 0;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y = (y ^ (y >>> 18)) >>> 0;
    return y;
  }

  /** `random.random()` — genrand_res53, 53 Bit aus zwei Woertern. */
  zahl(): number {
    const a = this.wort() >>> 5;
    const b = this.wort() >>> 6;
    return (a * 67108864 + b) * (1.0 / 9007199254740992.0);
  }
}
