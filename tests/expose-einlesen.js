// Baut src/eigene/expose-einlesen.js eine Vorlage aus einem fremden PDF?
//
// Die Frage ist nicht "laeuft es durch", sondern "steht nachher dasselbe an
// derselben Stelle". Darum wird hier ein PDF mit BEKANNTER Geometrie gebaut
// — eine farbige Flaeche an einem bestimmten Punkt, eine Linie, zwei
// Textzeilen in zwei Groessen, ein Bild — und danach geprueft, ob die
// eingelesene Vorlage genau das wieder hergibt.
//
// Gelesen wird mit demselben pdf.js, das die Anwendung im Browser laedt
// (3.11.174, in src/start/02-nach-bibliotheken.js festgelegt). Die Datei
// expose-einlesen.js ist ein klassisches Skript und bekommt hier ein
// nachgebautes window — derselbe Weg wie in tests/expose-editor.js.
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const EINLESEN = path.join(WURZEL, 'src', 'eigene', 'expose-einlesen.js');

let fehler = 0;
const melde = (t, ok, zusatz) => {
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${t}${zusatz ? ' — ' + zusatz : ''}`);
};

// Ein winziges, gueltiges JPEG (8x8, hellgrau) — dasselbe wie in den
// anderen Tests. Ein echtes Objektfoto im Repository waere
// Referenzmaterial.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIf'
  + 'IiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7'
  + 'Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAIAAgDASIA'
  + 'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA'
  + 'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3'
  + 'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm'
  + 'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA'
  + 'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx'
  + 'BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK'
  + 'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3'
  + 'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1aiii'
  + 'gD//2Q==', 'base64');

// --- Das Pruef-PDF ---------------------------------------------------------
// A4 hoch. Was darin steht, steht hier auch — die Erwartungen weiter unten
// rechnen mit genau diesen Zahlen.
const SOLL = {
  breite: 595.28, hoehe: 841.89,
  band: { x: 0, y: 741.89, b: 595.28, h: 100, farbe: '#98 01 01'.replace(/ /g, '') },
  titel: { text: 'Musterhaus am Park', x: 40, y: 600, groesse: 28 },
  zeile: { text: 'Wohnflaeche 123 m2', x: 40, y: 560, groesse: 11 },
  linie: { x1: 40, y1: 540, x2: 400, y2: 540 },
  bild: { x: 40, y: 200, b: 300, h: 220 },
};

async function pdfBauen() {
  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const seite = doc.addPage([SOLL.breite, SOLL.hoehe]);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  seite.drawRectangle({
    x: SOLL.band.x, y: SOLL.band.y, width: SOLL.band.b, height: SOLL.band.h,
    color: rgb(0x98 / 255, 0x01 / 255, 0x01 / 255),
  });
  seite.drawText(SOLL.titel.text, {
    x: SOLL.titel.x, y: SOLL.titel.y, size: SOLL.titel.groesse, font: fett,
    color: rgb(0.1, 0.1, 0.1),
  });
  seite.drawText(SOLL.zeile.text, {
    x: SOLL.zeile.x, y: SOLL.zeile.y, size: SOLL.zeile.groesse, font: normal,
    color: rgb(0.4, 0.4, 0.4),
  });
  seite.drawLine({
    start: { x: SOLL.linie.x1, y: SOLL.linie.y1 },
    end: { x: SOLL.linie.x2, y: SOLL.linie.y2 },
    thickness: 1.5, color: rgb(0.8, 0.8, 0.8),
  });
  // new Uint8Array(...) und nicht der Buffer selbst: ein kleiner Node-Buffer
  // liegt in einem gemeinsamen Speicherblock mit Versatz, und pdf-lib liest
  // ihn ab dessen Anfang — dann findet es die Kennung des JPEG nicht.
  const bild = await doc.embedJpg(new Uint8Array(JPEG));
  seite.drawImage(bild, { x: SOLL.bild.x, y: SOLL.bild.y, width: SOLL.bild.b, height: SOLL.bild.h });

  // Eine zweite Seite, damit auch die Seitenzaehlung geprueft ist.
  const zwei = doc.addPage([SOLL.breite, SOLL.hoehe]);
  zwei.drawText('Seite zwei', { x: 40, y: 700, size: 14, font: normal, color: rgb(0, 0, 0) });

  return await doc.save();
}

(async () => {
  let pdfjsLib;
  let schriftquelle;
  try {
    // Die Node-Fassung genau der Fassung, die der Browser laedt (3.11.174,
    // festgelegt in src/start/02-nach-bibliotheken.js). Beim Laden sucht
    // sie das Paket "canvas" und warnt, wenn es fehlt — hier wird nichts
    // gezeichnet, also ist die Warnung nur Laerm im Pruefbericht.
    // pdf.js meldet ueber console.log, nicht ueber console.warn — beide also.
    const durchlassen = (echt) => (...a) => {
      const s = a.join(' ');
      if (/Cannot polyfill|Cannot find module 'canvas'/.test(s)) return;
      echt(...a);
    };
    console.warn = durchlassen(console.warn);
    console.log = durchlassen(console.log);
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
    // Die vierzehn Standardschriften liegen im Paket. Ohne diesen Pfad
    // versucht pdf.js, sie aus dem Netz zu holen — im Pruefstand gibt es
    // keines.
    schriftquelle = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')),
                              'standard_fonts') + path.sep;
  } catch (e) {
    console.log('  pdfjs-dist fehlt — uebersprungen. (npm install)');
    process.exit(0);
  }

  const bytes = await pdfBauen();

  // Das klassische Skript laden, mit nachgebautem window.
  const fenster = { pdfjsLib };
  const quelle = fs.readFileSync(EINLESEN, 'utf-8');
  new Function('window', quelle)(fenster);
  melde('Das Skript meldet sich als window.ImmoExposeEinlesen',
        !!(fenster.ImmoExposeEinlesen && fenster.ImmoExposeEinlesen.ausPdf));
  if (!fenster.ImmoExposeEinlesen) { process.exit(1); }

  const { dokument, befund } = await fenster.ImmoExposeEinlesen.ausPdf(
    new Uint8Array(bytes), { name: 'Probe', standardFontDataUrl: schriftquelle });

  // --- Form der Vorlage ---------------------------------------------------
  melde('Die Vorlage nennt das Schema', dokument.schema === 1, String(dokument.schema));
  melde('Das Format kommt aus dem PDF',
        Math.abs(dokument.format.breite - SOLL.breite) < 0.5
        && Math.abs(dokument.format.hoehe - SOLL.hoehe) < 0.5,
        JSON.stringify(dokument.format));
  melde('Beide Seiten sind da', dokument.seiten.length === 2, String(dokument.seiten.length));
  melde('Die Basis ist "leer" — die Datenbank kennt keine andere',
        dokument.basis === 'leer', String(dokument.basis));
  melde('Die Herkunft steht in der Vorlage',
        !!(dokument.herkunft && dokument.herkunft.art === 'pdf'),
        JSON.stringify(dokument.herkunft && dokument.herkunft.art));

  const eins = dokument.seiten[0].elemente;
  const vonTyp = (typ) => eins.filter((el) => el.typ === typ);
  const nah = (a, b, d) => Math.abs(a - b) <= (d === undefined ? 1.5 : d);

  // --- Die Flaeche --------------------------------------------------------
  const flaechen = vonTyp('form').filter((el) => el.form === 'rechteck');
  const band = flaechen.filter((el) => nah(el.b, SOLL.band.b, 2) && nah(el.h, SOLL.band.h, 2))[0];
  melde('Das Farbband ist da', !!band,
        JSON.stringify(flaechen.map((f) => [f.x, f.y, f.b, f.h])));
  if (band) {
    melde('Das Farbband liegt richtig', nah(band.x, SOLL.band.x) && nah(band.y, SOLL.band.y),
          JSON.stringify([band.x, band.y]));
    melde('Das Farbband hat die Farbe aus dem PDF', band.fuell === '#980101', String(band.fuell));
  }

  // --- Die Linie ----------------------------------------------------------
  const linien = vonTyp('form').filter((el) => el.form === 'linie');
  melde('Die Linie ist da', linien.length >= 1, String(linien.length));
  if (linien.length) {
    const li = linien[0];
    melde('Die Linie liegt richtig und ist waagerecht',
          nah(li.x, SOLL.linie.x1) && nah(li.y, SOLL.linie.y1)
          && nah(li.b, SOLL.linie.x2 - SOLL.linie.x1, 2) && li.h === 0,
          JSON.stringify([li.x, li.y, li.b, li.h]));
  }

  // --- Das Bild -----------------------------------------------------------
  const bilder = vonTyp('bild');
  melde('Das Bild wird ein Bildfeld', bilder.length === 1, String(bilder.length));
  if (bilder.length) {
    const bi = bilder[0];
    melde('Das Bildfeld liegt richtig',
          nah(bi.x, SOLL.bild.x) && nah(bi.y, SOLL.bild.y)
          && nah(bi.b, SOLL.bild.b, 2) && nah(bi.h, SOLL.bild.h, 2),
          JSON.stringify([bi.x, bi.y, bi.b, bi.h]));
    melde('Das groesste Bild der ersten Seite wird das Titelbild',
          bi.slot && bi.slot.art === 'titelbild', JSON.stringify(bi.slot));
    melde('Das Bildfeld fuellt seinen Rahmen', bi.fuellmodus === 'cover');
  }

  // --- Der Text -----------------------------------------------------------
  const texte = vonTyp('text');
  const titel = texte.filter((el) => el.inhalt === SOLL.titel.text)[0];
  const zeile = texte.filter((el) => el.inhalt === SOLL.zeile.text)[0];
  melde('Die Ueberschrift kommt als eine Zeile an', !!titel,
        JSON.stringify(texte.map((t) => t.inhalt)));
  melde('Die zweite Zeile kommt als eine Zeile an', !!zeile);
  if (titel) {
    // Die Grundlinie liegt im Renderer bei y + h.
    melde('Die Ueberschrift steht an ihrer Stelle',
          nah(titel.x, SOLL.titel.x) && nah(titel.y + titel.h, SOLL.titel.y),
          JSON.stringify([titel.x, titel.y, titel.h]));
    const stil = dokument.stil.textstile[titel.stil];
    melde('Die Ueberschrift hat ihre Groesse',
          stil && nah(stil.groesse, SOLL.titel.groesse, 0.6),
          JSON.stringify(stil));
    melde('Die Ueberschrift hat einen eigenen Stil mit eigener Farbe',
          !!stil && typeof stil.farbe === 'string' && stil.farbe.startsWith('#'),
          JSON.stringify(stil && stil.farbe));
  }
  if (titel && zeile) {
    melde('Zwei verschiedene Groessen werden zwei Stile',
          titel.stil !== zeile.stil, titel.stil + ' / ' + zeile.stil);
  }

  // --- Der Befund ---------------------------------------------------------
  melde('Der Befund zaehlt die Seiten', befund.seiten === 2, String(befund.seiten));
  melde('Der Befund zaehlt die Textzeilen', befund.texte === 3, String(befund.texte));
  melde('Der Befund nennt die Schriften im PDF',
        Object.keys(befund.schriften).length >= 1,
        JSON.stringify(Object.keys(befund.schriften)));

  // --- Schriftzuordnung ---------------------------------------------------
  const zu = fenster.ImmoExposeEinlesen.schriftZuordnen;
  melde('Eine Serifenschrift wird Cormorant',
        zu('EAAAAA+Garamond-Regular').familie === 'cormorant',
        JSON.stringify(zu('EAAAAA+Garamond-Regular')));
  melde('Montserrat-SemiBold wird ein halbfetter Grotesk',
        zu('ABCDEF+Montserrat-SemiBold').schnitt === 'SemiBold',
        JSON.stringify(zu('ABCDEF+Montserrat-SemiBold')));
  melde('Eine schmale Schrift wird Archivo Condensed',
        zu('Oswald-Bold').familie === 'archivo'
        && /Cond/.test(zu('Oswald-Bold').schnitt),
        JSON.stringify(zu('Oswald-Bold')));
  melde('Kursiv bleibt kursiv, wo es die Schnitte hergeben',
        /Italic/.test(zu('Cormorant-LightItalic').schnitt),
        JSON.stringify(zu('Cormorant-LightItalic')));

  // --- Und laeuft die Vorlage durch den Renderer? -------------------------
  // Das ist die eigentliche Probe: eine eingelesene Vorlage muss der
  // Renderer zeichnen koennen, sonst ist sie ein Datensatz ohne Wert.
  const os = require('os');
  const { execFileSync } = require('child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-einlesen-'));
  execFileSync('tsc', [path.join(WURZEL, 'packages', 'expose-renderer', 'src', 'rendern.ts'),
                       '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020',
                       '--skipLibCheck', '--esModuleInterop'],
               { stdio: 'pipe', cwd: os.tmpdir() });
  const { rendern } = require(path.join(tmp, 'rendern.js'));
  const { vorlagePruefen } = require(path.join(tmp, 'pruefen.js'));
  const { metrikLesen } = require(path.join(tmp, 'schrift.js'));
  const SCHRIFTEN = path.join(WURZEL, 'assets', 'fonts', 'expose');
  const schriften = new Map();
  for (const datei of fs.readdirSync(SCHRIFTEN).filter((f) => f.endsWith('.ttf'))) {
    const name = datei.replace(/\.ttf$/, '');
    schriften.set(name, metrikLesen(new Uint8Array(fs.readFileSync(path.join(SCHRIFTEN, datei))), name));
  }
  const befunde = vorlagePruefen(dokument);
  const schlimm = befunde.filter((b) => b.schwere === 'fehler');
  melde('Die eingelesene Vorlage besteht die Pruefung', schlimm.length === 0,
        JSON.stringify(schlimm.slice(0, 3)));
  const erg = rendern({ vorlage: dokument, daten: {}, schriften });
  melde('Der Renderer zeichnet sie', erg.seiten.length === 2, String(erg.seiten.length));
  const unbekannt = erg.warnungen.filter((w) => w.art === 'unbekannt');
  melde('Ohne unbekannte Verweise', unbekannt.length === 0,
        JSON.stringify(unbekannt.slice(0, 2)));
  const schritte = erg.seiten[0].schritte.length;
  melde('Auf der ersten Seite entstehen Zeichenschritte', schritte >= 5, String(schritte));
  fs.rmSync(tmp, { recursive: true, force: true });

  if (fehler) {
    console.log(`\n  ${fehler} Pruefung(en) gescheitert.`);
    process.exit(1);
  }
  console.log('  [ok] Aus einem PDF wird eine Vorlage: Format, Flaechen, Linien,');
  console.log('       Bildfelder und Textzeilen stehen an ihrer Stelle, Schriften');
  console.log('       sind zugeordnet — und der Renderer zeichnet das Ergebnis.');
})();
