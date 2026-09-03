/**
 * Minimaler ZIP-Leser fuer OpenImmo-Pakete (XML plus Bilder).
 *
 * Gegenstueck zu `src/lib/openimmo/zip.ts`, das nur packt. Unterstuetzt die
 * beiden Methoden, die in der Praxis vorkommen: „stored" (0) und „deflate"
 * (8). Verschluesselte, gesplittete oder ZIP64-Archive werden abgewiesen —
 * ein Portal- oder CRM-Export erzeugt sie nicht, und ein vollstaendiger
 * ZIP-Stack waere fuer diesen Zweck unverhaeltnismaessig.
 *
 * Gelesen wird ueber das zentrale Verzeichnis am Dateiende, nicht ueber die
 * lokalen Kopfzeilen: Nur dort stehen bei per Stream erzeugten Archiven
 * verlaesslich Groesse und Pruefsumme.
 */

import { inflateRawSync } from "node:zlib";

export interface ZipEintrag {
  name: string;
  inhalt: Uint8Array;
}

const SIGNATUR_EOCD = 0x06054b50;
const SIGNATUR_ZENTRAL = 0x02014b50;
const SIGNATUR_LOKAL = 0x04034b50;

/** Groesste akzeptierte Entpackgroesse je Datei — Schutz vor ZIP-Bomben. */
export const MAX_ENTPACKT_BYTES = 50 * 1024 * 1024;

export function zipEntpacken(daten: Uint8Array): ZipEintrag[] {
  const b = Buffer.from(daten.buffer, daten.byteOffset, daten.byteLength);

  // End of central directory: mindestens 22 Byte, davor bis zu 64 KiB Kommentar.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (b.readUInt32LE(i) === SIGNATUR_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Die Datei ist kein ZIP-Archiv.");

  const anzahl = b.readUInt16LE(eocd + 10);
  const verzeichnisStart = b.readUInt32LE(eocd + 16);
  if (anzahl === 0xffff || verzeichnisStart === 0xffffffff) {
    throw new Error("ZIP64-Archive werden nicht unterstuetzt.");
  }

  const eintraege: ZipEintrag[] = [];
  let pos = verzeichnisStart;

  for (let i = 0; i < anzahl; i++) {
    if (b.readUInt32LE(pos) !== SIGNATUR_ZENTRAL) {
      throw new Error("Das ZIP-Archiv ist beschaedigt (zentrales Verzeichnis).");
    }
    const flags = b.readUInt16LE(pos + 8);
    const methode = b.readUInt16LE(pos + 10);
    const groessePackt = b.readUInt32LE(pos + 20);
    const groesseEntpackt = b.readUInt32LE(pos + 24);
    const nameLaenge = b.readUInt16LE(pos + 28);
    const extraLaenge = b.readUInt16LE(pos + 30);
    const kommentarLaenge = b.readUInt16LE(pos + 32);
    const lokalOffset = b.readUInt32LE(pos + 42);
    const name = b.subarray(pos + 46, pos + 46 + nameLaenge).toString("utf8");
    pos += 46 + nameLaenge + extraLaenge + kommentarLaenge;

    if (flags & 0x0001) throw new Error("Verschluesselte ZIP-Archive werden nicht unterstuetzt.");
    if (name.endsWith("/")) continue; // Verzeichnis
    if (groesseEntpackt > MAX_ENTPACKT_BYTES) {
      throw new Error(`Die Datei ${name} im Archiv ist zu gross.`);
    }

    // Lokaler Kopf: Name- und Extra-Laengen koennen hier abweichen.
    if (b.readUInt32LE(lokalOffset) !== SIGNATUR_LOKAL) {
      throw new Error("Das ZIP-Archiv ist beschaedigt (lokaler Kopf).");
    }
    const lokalName = b.readUInt16LE(lokalOffset + 26);
    const lokalExtra = b.readUInt16LE(lokalOffset + 28);
    const datenStart = lokalOffset + 30 + lokalName + lokalExtra;
    const gepackt = b.subarray(datenStart, datenStart + groessePackt);

    let inhalt: Buffer;
    if (methode === 0) inhalt = Buffer.from(gepackt);
    else if (methode === 8) inhalt = inflateRawSync(gepackt, { maxOutputLength: MAX_ENTPACKT_BYTES });
    else throw new Error(`Die Datei ${name} verwendet eine nicht unterstuetzte Packmethode.`);

    eintraege.push({ name, inhalt });
  }

  return eintraege;
}
