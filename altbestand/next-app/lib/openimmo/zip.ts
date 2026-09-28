import { crc32 } from "node:zlib";

/**
 * Minimaler ZIP-Schreiber fuer das OpenImmo-Uebertragungspaket.
 *
 * Bewusst ohne Bibliothek und bewusst ohne Kompression: Das Paket enthaelt
 * praktisch nur JPEG- und PNG-Dateien, die bereits komprimiert sind — ein
 * zweiter Durchgang bringt nichts und kostet Rechenzeit. Fuer das XML fiele
 * der Gewinn gegen die zusaetzliche Abhaengigkeit nicht ins Gewicht.
 *
 * Erzeugt wird das klassische Format ohne ZIP64. Das genuegt: Ein
 * Uebertragungspaket mit einem Objekt bleibt weit unter vier Gigabyte und
 * unter 65.535 Dateien. Groessere Pakete wuerde diese Funktion still falsch
 * schreiben, deshalb weist sie sie ab.
 */

export interface ZipDatei {
  name: string;
  daten: Buffer;
}

/** MS-DOS-Zeitstempel. Die Aufloesung betraegt zwei Sekunden. */
function dosZeit(zeitpunkt: Date): { zeit: number; datum: number } {
  const jahr = Math.max(1980, zeitpunkt.getUTCFullYear());
  return {
    zeit:
      (zeitpunkt.getUTCHours() << 11) |
      (zeitpunkt.getUTCMinutes() << 5) |
      (zeitpunkt.getUTCSeconds() >> 1),
    datum:
      ((jahr - 1980) << 9) |
      ((zeitpunkt.getUTCMonth() + 1) << 5) |
      zeitpunkt.getUTCDate(),
  };
}

const MAX_DATEIEN = 65_535;
const MAX_BYTES = 0xffff_ffff;

/**
 * Packt die Dateien in ein ZIP-Archiv.
 *
 * `zeitpunkt` wird uebergeben statt hier gebildet, damit dasselbe Paket
 * zweimal dieselben Bytes ergibt und sich pruefen laesst.
 */
export function zipPacken(dateien: ZipDatei[], zeitpunkt: Date): Buffer {
  if (dateien.length > MAX_DATEIEN) {
    throw new Error("Das Übertragungspaket enthält zu viele Dateien.");
  }

  const { zeit, datum } = dosZeit(zeitpunkt);
  const eintraege: Buffer[] = [];
  const verzeichnis: Buffer[] = [];
  let versatz = 0;

  for (const datei of dateien) {
    const name = Buffer.from(datei.name, "utf8");
    const pruefsumme = crc32(datei.daten) >>> 0;
    const groesse = datei.daten.length;

    if (versatz > MAX_BYTES || groesse > MAX_BYTES) {
      throw new Error("Das Übertragungspaket ist zu groß.");
    }

    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0); // Signatur
    kopf.writeUInt16LE(20, 4); // benoetigte Version 2.0
    // Bit 11 setzt die Namenskodierung auf UTF-8. Ohne dieses Bit deuten
    // Entpacker Umlaute im Dateinamen als CP437.
    kopf.writeUInt16LE(0x0800, 6);
    kopf.writeUInt16LE(0, 8); // Verfahren 0 = gespeichert
    kopf.writeUInt16LE(zeit, 10);
    kopf.writeUInt16LE(datum, 12);
    kopf.writeUInt32LE(pruefsumme, 14);
    kopf.writeUInt32LE(groesse, 18);
    kopf.writeUInt32LE(groesse, 22);
    kopf.writeUInt16LE(name.length, 26);
    kopf.writeUInt16LE(0, 28); // kein Zusatzfeld

    eintraege.push(kopf, name, datei.daten);

    const eintrag = Buffer.alloc(46);
    eintrag.writeUInt32LE(0x02014b50, 0);
    eintrag.writeUInt16LE(20, 4); // erzeugende Version
    eintrag.writeUInt16LE(20, 6);
    eintrag.writeUInt16LE(0x0800, 8);
    eintrag.writeUInt16LE(0, 10);
    eintrag.writeUInt16LE(zeit, 12);
    eintrag.writeUInt16LE(datum, 14);
    eintrag.writeUInt32LE(pruefsumme, 16);
    eintrag.writeUInt32LE(groesse, 20);
    eintrag.writeUInt32LE(groesse, 24);
    eintrag.writeUInt16LE(name.length, 28);
    eintrag.writeUInt16LE(0, 30); // Zusatzfeld
    eintrag.writeUInt16LE(0, 32); // Kommentar
    eintrag.writeUInt16LE(0, 34); // Datentraeger
    eintrag.writeUInt16LE(0, 36); // interne Attribute
    eintrag.writeUInt32LE(0, 38); // externe Attribute
    eintrag.writeUInt32LE(versatz, 42);

    verzeichnis.push(eintrag, name);
    versatz += kopf.length + name.length + groesse;
  }

  const verzeichnisTeil = Buffer.concat(verzeichnis);
  const abschluss = Buffer.alloc(22);
  abschluss.writeUInt32LE(0x06054b50, 0);
  abschluss.writeUInt16LE(0, 4); // Datentraeger
  abschluss.writeUInt16LE(0, 6);
  abschluss.writeUInt16LE(dateien.length, 8);
  abschluss.writeUInt16LE(dateien.length, 10);
  abschluss.writeUInt32LE(verzeichnisTeil.length, 12);
  abschluss.writeUInt32LE(versatz, 16);
  abschluss.writeUInt16LE(0, 20); // kein Kommentar

  return Buffer.concat([...eintraege, verzeichnisTeil, abschluss]);
}
