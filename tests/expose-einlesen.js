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

// --- Das zweite Pruef-PDF: fuer Stufe 2 ------------------------------------
// Es enthaelt genau die Werte eines bekannten Objekts, ein Logo im dunklen
// Kopfband, eine Grundrissseite und eine Kontaktseite. Damit ist pruefbar,
// was Stufe 2 leisten soll: Platzhalter, Bildfelder, Marke.
const OBJEKT = {
  id: 'o-probe', objekttitel: 'Stadtvilla am Hafen', objektart: 'Haus',
  vertragsart: 'verkauf', ort: 'Wismar', plz: '23966', strasse: 'Hafenweg',
  hausnummer: '3', adresse_freigeben: true, immo_nr: 'HWI-2026-007',
  wohnflaeche: 113, zimmer: 5, baujahr: 1998, angebotspreis: 489000,
  beschreibung_objekt: 'Das Haus liegt in zweiter Reihe hinter dem alten '
    + 'Hafenbecken und wurde zuletzt im Jahr 2019 umfassend instand gesetzt, '
    + 'vom Dach bis zur Heizung.',
};
const FIRMA2 = {
  firma_name: 'Nordwind Immobilien GmbH', marken_name: 'Nordwind',
  ort: 'Wismar', ci_primaer: '#1B2A47', ci_akzent: '#B5934F',
};
const SOLL2 = {
  breite: 595.28, hoehe: 841.89,
  band: { x: 0, y: 741.89, b: 595.28, h: 100, farbe: '#1b2a47' },
  logo: { x: 40, y: 780, b: 96, h: 24 },
  titel: { text: OBJEKT.objekttitel, x: 40, y: 640, groesse: 24 },
  flaeche: { text: 'Wohnfläche 113 m²', x: 40, y: 600, groesse: 11 },
  // Die Beschreibung, wie ein Setzer sie bricht: drei Zeilen, gleicher
  // Stil, gleicher linker Rand. Zusammen sind sie der Feldwert.
  absatz: [
    'Das Haus liegt in zweiter Reihe hinter dem alten Hafenbecken und',
    'wurde zuletzt im Jahr 2019 umfassend instand gesetzt, vom Dach',
    'bis zur Heizung.',
  ],
  absatzX: 40, absatzY: 540, absatzGroesse: 10, absatzSchritt: 14,
};

async function pdf2Bauen() {
  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const bild = await doc.embedJpg(new Uint8Array(JPEG));

  const eins = doc.addPage([SOLL2.breite, SOLL2.hoehe]);
  eins.drawRectangle({ x: SOLL2.band.x, y: SOLL2.band.y, width: SOLL2.band.b,
    height: SOLL2.band.h, color: rgb(0x1b / 255, 0x2a / 255, 0x47 / 255) });
  eins.drawImage(bild, { x: SOLL2.logo.x, y: SOLL2.logo.y,
    width: SOLL2.logo.b, height: SOLL2.logo.h });
  eins.drawText(SOLL2.titel.text, { x: SOLL2.titel.x, y: SOLL2.titel.y,
    size: SOLL2.titel.groesse, font: fett, color: rgb(0x1b / 255, 0x2a / 255, 0x47 / 255) });
  eins.drawText(SOLL2.flaeche.text, { x: SOLL2.flaeche.x, y: SOLL2.flaeche.y,
    size: SOLL2.flaeche.groesse, font: normal, color: rgb(0.2, 0.2, 0.2) });
  SOLL2.absatz.forEach((zeile, i) => {
    eins.drawText(zeile, { x: SOLL2.absatzX, y: SOLL2.absatzY - i * SOLL2.absatzSchritt,
      size: SOLL2.absatzGroesse, font: normal, color: rgb(0.2, 0.2, 0.2) });
  });
  // Ein grosses Foto, damit das Titelbild erkannt wird.
  eins.drawImage(bild, { x: 40, y: 200, width: 515, height: 300 });

  const zwei = doc.addPage([SOLL2.breite, SOLL2.hoehe]);
  zwei.drawText('Grundriss Erdgeschoss', { x: 40, y: 790, size: 16, font: fett,
    color: rgb(0.1, 0.1, 0.1) });
  zwei.drawImage(bild, { x: 40, y: 400, width: 400, height: 300 });

  const drei = doc.addPage([SOLL2.breite, SOLL2.hoehe]);
  drei.drawText('Ihr Ansprechpartner', { x: 40, y: 700, size: 16, font: fett,
    color: rgb(0xb5 / 255, 0x93 / 255, 0x4f / 255) });
  drei.drawImage(bild, { x: 40, y: 500, width: 110, height: 150 });

  return await doc.save();
}

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
    // Die Farbe kommt an — ab Stufe 2 als Verweis auf die Palette, damit
    // sie dem CI folgen kann. f1 der Vorlage ist der Wert aus dem PDF.
    melde('Das Farbband hat die Farbe aus dem PDF',
          band.fuell === 'p' && dokument.stil.farben.f1 === '#980101',
          String(band.fuell) + ' / ' + String(dokument.stil.farben.f1));
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
                       path.join(WURZEL, 'packages', 'expose-renderer', 'src', 'aufbereiten.ts'),
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
  // === STUFE 2 ===========================================================
  // Aus dem Nachbau wird eine Vorlage: Platzhalter aus den Werten eines
  // bekannten Objekts, Bildfelder nach ihrer Seite, Marke an das CI.
  const { aufbereiten } = require(path.join(tmp, 'aufbereiten.js'));
  const { wert } = require(path.join(tmp, 'werte.js'));
  fenster.ImmoExpose = { wert, aufbereiten };

  const bytes2 = await pdf2Bauen();
  const zwei = await fenster.ImmoExposeEinlesen.ausPdf(new Uint8Array(bytes2), {
    name: 'Nordwind', standardFontDataUrl: schriftquelle,
    marke: { primaer: FIRMA2.ci_primaer, akzent: FIRMA2.ci_akzent },
  });
  const d2 = zwei.dokument, b2 = zwei.befund;

  // --- Bildfelder ---------------------------------------------------------
  const alleBilder = [];
  d2.seiten.forEach((se, i) => se.elemente.forEach((el) => {
    if (el.typ === 'bild') alleBilder.push({ seite: i + 1, el });
  }));
  const mitSlot = (art) => alleBilder.filter((x) => x.el.slot && x.el.slot.art === art);
  melde('Das kleine Bild im Kopfband wird das Logo', mitSlot('logo').length === 1,
        JSON.stringify(alleBilder.map((x) => [x.seite, x.el.b, x.el.h, x.el.slot])));
  if (mitSlot('logo').length) {
    const lg = mitSlot('logo')[0].el;
    melde('Das Logo steht auf dunklem Grund und bekommt die helle Fassung',
          lg.slot.ton === 'dunkel', String(lg.slot.ton));
    melde('Das Logo wird vollstaendig eingepasst und links verankert',
          lg.fuellmodus === 'contain' && lg.ausrichtung === 'links',
          JSON.stringify([lg.fuellmodus, lg.ausrichtung]));
  }
  melde('Das Bild auf der Grundrissseite wird ein Grundriss',
        mitSlot('grundriss').length === 1, String(mitSlot('grundriss').length));
  melde('Das hochkante Bild auf der Kontaktseite wird das Portraet',
        mitSlot('ansprechpartner').length === 1, String(mitSlot('ansprechpartner').length));
  melde('Das grosse Bild der ersten Seite bleibt das Titelbild',
        mitSlot('titelbild').length === 1, String(mitSlot('titelbild').length));
  melde('Der Befund zaehlt die erkannten Bildfelder',
        b2.slots && b2.slots.logo === 1 && b2.slots.grundriss === 1 && b2.slots.portraet === 1,
        JSON.stringify(b2.slots));

  // --- Marke --------------------------------------------------------------
  melde('Die Hausfarbe des PDF wird an das CI gebunden',
        d2.stil.farben.f1 === 'ci.primaer' || d2.stil.farben.f2 === 'ci.primaer',
        JSON.stringify(d2.stil.farben));
  melde('Der Befund sagt, dass die Marke gebunden wurde',
        !!(b2.marke && b2.marke.an_ci), JSON.stringify(b2.marke));
  const bandZwei = d2.seiten[0].elemente
    .filter((el) => el.typ === 'form' && Math.abs(el.h - SOLL2.band.h) < 2)[0];
  melde('Das Kopfband verweist auf die Palette statt auf einen Hexwert',
        bandZwei && (bandZwei.fuell === 'p' || bandZwei.fuell === 'a'),
        JSON.stringify(bandZwei && bandZwei.fuell));
  melde('Die Herkunft haelt die Farben des PDF fest',
        Array.isArray(d2.herkunft.farben_im_pdf) && d2.herkunft.farben_im_pdf.length === 2,
        JSON.stringify(d2.herkunft.farben_im_pdf));
  melde('Die Schriftrollen kommen aus dem Dokument',
        !!(b2.schriftrollen && b2.schriftrollen.headline && b2.schriftrollen.text),
        JSON.stringify(b2.schriftrollen));

  // --- Platzhalter --------------------------------------------------------
  const daten2 = aufbereiten({ immobilie: OBJEKT, firma: FIRMA2, ansprechpartner: null });
  const vorPlatzhalter = d2.seiten[0].elemente.filter((el) => el.typ === 'text').length;
  const p2 = fenster.ImmoExposeEinlesen.platzhalterSetzen(d2, daten2);
  const texteZwei = d2.seiten[0].elemente.filter((el) => el.typ === 'text');
  const inhalte = texteZwei.map((el) => el.inhalt);
  melde('Der Objekttitel wird ein Platzhalter',
        inhalte.indexOf('{{objekt.objekttitel}}') >= 0, JSON.stringify(inhalte));
  melde('Die Wohnflaeche wird in der Zeile ersetzt, das Wort davor bleibt',
        inhalte.indexOf('Wohnfläche {{objekt.wohnflaeche}}') >= 0, JSON.stringify(inhalte));
  const absatzEl = texteZwei.filter((el) => el.inhalt === '{{objekt.beschreibung_objekt}}')[0];
  melde('Die drei Zeilen der Beschreibung werden EIN Feld', !!absatzEl,
        JSON.stringify(inhalte));
  if (absatzEl) {
    melde('Das Beschreibungsfeld umfasst die Hoehe aller drei Zeilen',
          absatzEl.h > SOLL2.absatzSchritt * 2, String(absatzEl.h));
    melde('Das Beschreibungsfeld bricht um und verdichtet',
          absatzEl.einzeilig === false && absatzEl.verdichten === true,
          JSON.stringify([absatzEl.einzeilig, absatzEl.verdichten]));
    melde('Die beiden Folgezeilen sind weg',
          texteZwei.length === vorPlatzhalter - 2,
          `vorher ${vorPlatzhalter}, jetzt ${texteZwei.length}`);
  }
  melde('Der Befund nennt die gefundenen Felder',
        p2.felder.indexOf('objekt.objekttitel') >= 0
        && p2.felder.indexOf('objekt.wohnflaeche') >= 0
        && p2.felder.indexOf('objekt.beschreibung_objekt') >= 0,
        JSON.stringify(p2.felder));
  melde('Der Befund zaehlt die Platzhalter', p2.platzhalter >= 3, String(p2.platzhalter));

  // Und das Ergebnis muss weiterhin eine gueltige Vorlage sein.
  const befunde2 = vorlagePruefen(d2);
  const schlimm2 = befunde2.filter((b) => b.schwere === 'fehler');
  melde('Die Vorlage mit Platzhaltern besteht die Pruefung', schlimm2.length === 0,
        JSON.stringify(schlimm2.slice(0, 3)));
  const erg2 = rendern({ vorlage: d2, daten: daten2, schriften,
                         marke: { primaer: FIRMA2.ci_primaer, akzent: FIRMA2.ci_akzent } });
  melde('Der Renderer zeichnet sie mit den Daten des Objekts',
        erg2.seiten.length === 3, String(erg2.seiten.length));
  const gezeichnet = erg2.seiten[0].schritte
    .filter((sc) => sc.art === 'text').map((sc) => sc.text).join(' | ');
  melde('Im Ergebnis steht der Wert des Objekts, nicht der Platzhalter',
        gezeichnet.indexOf(OBJEKT.objekttitel) >= 0 && gezeichnet.indexOf('{{') < 0,
        gezeichnet.slice(0, 200));
  const unbekannt2 = erg2.warnungen.filter((w) => w.art === 'unbekannt');
  melde('Ohne unbekannte Verweise', unbekannt2.length === 0,
        JSON.stringify(unbekannt2.slice(0, 2)));

  fs.rmSync(tmp, { recursive: true, force: true });

  if (fehler) {
    console.log(`\n  ${fehler} Pruefung(en) gescheitert.`);
    process.exit(1);
  }
  console.log('  [ok] Aus einem PDF wird eine Vorlage: Format, Flaechen, Linien,');
  console.log('       Bildfelder und Textzeilen stehen an ihrer Stelle, Schriften');
  console.log('       sind zugeordnet — und der Renderer zeichnet das Ergebnis.');
  console.log('       Stufe 2: Logo, Grundriss und Portraet werden erkannt, die');
  console.log('       Hausfarben an das CI gebunden, und aus den Werten eines');
  console.log('       Objekts werden Platzhalter — auch ueber drei Zeilen hinweg.');
})();
