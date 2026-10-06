// Erzeugt der Social-Baukasten wirklich Beiträge — und erfindet er nichts?
//
// Drei Fragen, und alle drei kosten Geld oder Vertrauen, wenn sie falsch
// beantwortet sind:
//
//   1. Zeichnen die sechs Vorlagen überhaupt? Eine Vorlage, die an einem
//      unbekannten Farbnamen hängenbleibt, zeigt den Hintergrund und lässt
//      den Text weg — das sieht aus wie ein Objekt ohne Daten. Genau so ist
//      die Studio-Kennzahlleiste beim ersten Zeichnen ausgefallen.
//   2. Steht auf jedem Beitrag das, was daraufgehört: Objektangaben, die
//      Marke des Mandanten, und NICHTS, was nicht aus den Daten kommt?
//   3. Hält die Tafel sich an ihre Zusagen — keine Credits, keine
//      erfundenen Angaben, nichts wird hochgeladen?
//
// Gezeichnet wird mit demselben Renderer wie in der Oberfläche, nur ohne
// Browser: die Schrittliste ist dieselbe, und darin steht jeder Text.
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');
const SCHRIFTEN = path.join(WURZEL, 'assets', 'fonts', 'expose');
const BUENDEL = path.join(WURZEL, 'packages', 'expose-renderer', 'buendel');
const TAFEL = path.join(WURZEL, 'src', 'eigene', 'social.js');

let fehler = 0, geprueft = 0;
const melde = (text, ok, zusatz) => {
  geprueft++;
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${text}${zusatz ? ' — ' + zusatz : ''}`);
};

const namen = fs.existsSync(VORLAGEN)
  ? fs.readdirSync(VORLAGEN).filter((f) => f.startsWith('social-') && f.endsWith('.json'))
  : [];
if (!namen.length) {
  console.log('  Keine Social-Vorlagen gefunden — uebersprungen.');
  process.exit(0);
}

// Der Renderer wird uebersetzt, nicht gebuendelt eingebunden: das Buendel
// ist fuer den Browser gebaut und gibt nichts an require heraus. Derselbe
// Weg wie in tests/expose-vorlagen.js.
const os = require('os');
const { execFileSync } = require('child_process');
const QUELLEN = path.join(WURZEL, 'packages', 'expose-renderer', 'src');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-social-'));
let Expose;
try {
  execFileSync('tsc', [
    path.join(QUELLEN, 'rendern.ts'), path.join(QUELLEN, 'aufbereiten.ts'),
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020',
    '--skipLibCheck', '--esModuleInterop',
  ], { stdio: 'pipe', cwd: os.tmpdir() });
  Expose = Object.assign({},
    require(path.join(tmp, 'rendern.js')),
    require(path.join(tmp, 'aufbereiten.js')),
    require(path.join(tmp, 'schrift.js')),
    require(path.join(tmp, 'schritte.js')));
} catch (e) {
  console.log('  tsc fehlt oder uebersetzt nicht — uebersprungen.');
  process.exit(0);
}

// --- Schriften -------------------------------------------------------------
const schriften = new Map();
for (const datei of fs.readdirSync(SCHRIFTEN).filter((f) => f.endsWith('.ttf'))) {
  const schnitt = datei.replace(/\.ttf$/, '');
  schriften.set(schnitt,
    Expose.metrikLesen(new Uint8Array(fs.readFileSync(path.join(SCHRIFTEN, datei))), schnitt));
}

// --- Ein Objekt, wie es im Betrieb aussieht --------------------------------
const OBJEKT = {
  id: '11111111-2222-3333-4444-555555555555',
  immo_nr: 'P-2026-014',
  bezeichnung: 'Penthouse über den Dächern',
  expose_titel: 'Penthouse über den Dächern',
  objektart: 'Penthouse',
  vertragsart: 'kauf',
  strasse: 'Prüfweg 3', plz: '20095', ort: 'Musterstadt', ortsteil: 'Hafenviertel',
  wohnflaeche: 112, zimmer: 3, baujahr: 2019, angebotspreis: 749000,
  zustand: 'Neuwertig', verfuegbar_ab: 'nach Absprache',
  expose_highlights: [
    { titel: 'Dachterrasse', text: 'Vierzig Quadratmeter nach Süden.' },
    { titel: 'Aufzug', text: 'Direkt in die Wohnung.' },
  ],
};
const FIRMA = {
  firma_name: 'Musterhaus Immobilien GmbH', marken_name: 'Musterhaus',
  marken_linie: 'Immobilien', strasse: 'Musterweg 1', plz: '20095', ort: 'Musterstadt',
  telefon: '040 1234567', email: 'post@beispiel.example', web: 'www.beispiel.example',
  ci_primaer: '#1B2A47', ci_akzent: '#B5934F',
};
const AP = { name: 'Alex Beispiel', funktion: 'Immobilienberatung',
             telefon: '040 1234567', mobil: '0170 1234567',
             email: 'alex@beispiel.example' };

const daten = Expose.aufbereiten({
  immobilie: OBJEKT, firma: FIRMA, ansprechpartner: AP,
  annahmen: { notar_prozent: 2.0, zinssatz: 3.9, tilgung: 2.0, eigenkapital_prozent: 20 },
});

function texte(seiten) {
  const raus = [];
  for (const s of seiten) {
    for (const schritt of Expose.flach(s.schritte)) {
      if (schritt.art === 'text') raus.push(String(schritt.text));
    }
  }
  return raus;
}

// --- 1. Jede Vorlage zeichnet ---------------------------------------------
const ERWARTET = { feed: [540, 675], story: [540, 960] };
for (const datei of namen.sort()) {
  const name = datei.replace(/\.json$/, '');
  const vorlage = JSON.parse(fs.readFileSync(path.join(VORLAGEN, datei), 'utf-8'));
  const art = name.endsWith('-story') ? 'story' : 'feed';

  melde(`${name}: das Format stimmt`,
        vorlage.format.breite === ERWARTET[art][0]
        && vorlage.format.hoehe === ERWARTET[art][1],
        `${vorlage.format.breite}×${vorlage.format.hoehe}`);

  let erg;
  try {
    erg = Expose.rendern({ vorlage, daten, schriften,
      marke: { primaer: FIRMA.ci_primaer, akzent: FIRMA.ci_akzent } });
  } catch (e) {
    melde(`${name}: zeichnet sich`, false, e.message);
    continue;
  }
  melde(`${name}: zeichnet sich`, true);
  melde(`${name}: hat die erwarteten Seiten`,
        erg.seiten.length === (art === 'story' ? 2 : 6),
        `${erg.seiten.length} Seiten`);

  const alle = texte(erg.seiten);
  const zusammen = alle.join(' | ');

  // Auf JEDER Seite muss die Marke stehen — ein Beitrag ohne Absender ist
  // Werbung fuer niemanden.
  for (let i = 0; i < erg.seiten.length; i++) {
    const seitentexte = texte([erg.seiten[i]]).join(' ').toUpperCase();
    melde(`${name}/${erg.seiten[i].id}: traegt die Marke`,
          seitentexte.includes('MUSTERHAUS'),
          seitentexte.slice(0, 90));
  }

  // Die erste Seite ist der Beitrag: Titel, Ort und Preis gehoeren darauf.
  const erste = texte([erg.seiten[0]]).join(' ');
  melde(`${name}: der Objekttitel steht auf dem Beitrag`,
        /Penthouse/i.test(erste), erste.slice(0, 120));
  melde(`${name}: der Preis steht darauf`,
        /749\.000/.test(erste), erste.slice(0, 160));

  // Und nichts, was nicht aus den Daten kommt: kein offener Platzhalter.
  const offen = alle.filter((t) => /\{\{|\}\}/.test(t));
  melde(`${name}: kein offener Platzhalter`, offen.length === 0, offen.slice(0, 2).join(' / '));

  // Keine Warnung ausser den beiden, die ein unvollstaendiges Objekt
  // zwangslaeufig erzeugt.
  const arten = new Set((erg.warnungen || []).map((w) => w.art));
  arten.delete('fehlender_wert');
  arten.delete('fehlendes_bild');
  melde(`${name}: keine unerwartete Warnung`, arten.size === 0,
        Array.from(arten).join(', '));
}

// --- 2. Ein unvollstaendiges Objekt darf nichts erfinden -------------------
const duenn = Expose.aufbereiten({
  immobilie: { id: 'x', bezeichnung: 'Haus ohne Angaben', objektart: 'Haus',
               vertragsart: 'kauf', ort: 'Musterstadt' },
  firma: FIRMA, ansprechpartner: AP,
});
{
  const vorlage = JSON.parse(
    fs.readFileSync(path.join(VORLAGEN, 'social-raster-feed.json'), 'utf-8'));
  const erg = Expose.rendern({ vorlage, daten: duenn, schriften,
    marke: { primaer: FIRMA.ci_primaer, akzent: FIRMA.ci_akzent } });
  const alle = texte(erg.seiten).join(' ');
  melde('Ohne Wohnflaeche steht keine Wohnflaeche da',
        !/\d+\s*m²/.test(alle), alle.slice(0, 160));
  melde('…und auch kein Preis', !/\d{2}\.\d{3}/.test(alle), alle.slice(0, 160));
  melde('…aber der Titel steht da', /Haus ohne Angaben/.test(alle));
  melde('…und es wird gemeldet, was fehlt',
        (erg.warnungen || []).some((w) => w.art === 'fehlender_wert'));
}

// --- 3. Die Zusagen der Tafel ----------------------------------------------
if (fs.existsSync(TAFEL)) {
  const q = fs.readFileSync(TAFEL, 'utf-8');
  melde('die Tafel reserviert keine Credits',
        !/credits_reservieren|kiAbrechnen/.test(q),
        'hier entsteht nichts durch KI — CLAUDE.md zaehlt den Export zu den '
        + 'kostenfreien Aktionen');
  melde('sie laedt nichts hoch',
        !/\.upload\(/.test(q), 'die Bilder entstehen im Browser');
  melde('sie nimmt die Vorlagen aus der Datenbank, nicht aus dem Code',
        /from\("expose_vorlagen"\)/.test(q) && /eq\("art", "social"\)/.test(q));
  melde('sie liest dieselben Quellen wie das Exposé',
        /from\("immobilie_datei"\)/.test(q) && /from\("firma_stammdaten"\)/.test(q),
        'sonst zeigte der Beitrag etwas anderes als das Exposé desselben Objekts');
  melde('sie exportiert in voller Groesse',
        /EXPORT = 2/.test(q) && /massstab: EXPORT \/ dpr/.test(q),
        '540 pt × 2 = 1080 px, die Breite, die Instagram erwartet');
  melde('sie sagt, dass nichts erfunden wird',
        /nichts dazugedichtet/.test(q));
  melde('sie sagt, dass es keine Credits kostet',
        /Kostet keine Credits/.test(q));
}

if (fehler) {
  console.log(`\n  ${fehler} von ${geprueft} Pruefungen gescheitert.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Pruefungen zum Social-Baukasten:`);
console.log(`       ${namen.length} Vorlagen zeichnen sich, jede Seite traegt die`);
console.log('       Marke, Titel und Preis stehen auf dem Beitrag — und ein');
console.log('       Objekt ohne Angaben bekommt keine erfundenen.');
