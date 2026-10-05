// Bedingungen, Wiederholungen, fehlende Werte — die Seitenlogik.
//
// Der Vergleich mit den Prototypen prueft, dass die drei Vorlagen mit
// VOLLSTAENDIGEN Demodaten richtig aussehen. Er sagt nichts darueber, was
// bei einem Objekt ohne Energieausweis, ohne Grundrisse oder ohne
// Highlights passiert — und genau das ist der Normalfall. Dieser Test
// baut dafuer kleine Vorlagen und sieht nach, was herauskommt.
//
// Der Auftrag verlangt: "Seiten ohne Pflichtdaten entfallen automatisch,
// Seitenzahlen und Inhaltsverzeichnis passen sich an." Das steht hier.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const SCHRIFTEN = path.join(WURZEL, 'assets', 'fonts', 'expose');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-logik-'));
execFileSync('tsc', [path.join(WURZEL, 'packages', 'expose-renderer', 'src', 'rendern.ts'),
                     '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020',
                     '--skipLibCheck', '--esModuleInterop'],
             { stdio: 'pipe', cwd: os.tmpdir() });
const { rendern } = require(path.join(tmp, 'rendern.js'));
const { metrikLesen } = require(path.join(tmp, 'schrift.js'));
fs.rmSync(tmp, { recursive: true, force: true });

const schriften = new Map();
for (const datei of fs.readdirSync(SCHRIFTEN).filter((f) => f.endsWith('.ttf'))) {
  const name = datei.replace(/\.ttf$/, '');
  schriften.set(name,
    metrikLesen(new Uint8Array(fs.readFileSync(path.join(SCHRIFTEN, datei))), name));
}

const STIL = {
  farben: { f1: '#0F4C5C', f2: '#E8915A', ableitung: 'raster' },
  schriften: {
    headline: { familie: 'jakarta', schnitt: 'Bold' },
    text: { familie: 'jakarta', schnitt: 'Regular' },
    label: { familie: 'jakarta', schnitt: 'SemiBold' },
  },
  textstile: {
    normal: { schrift: { familie: 'jakarta', schnitt: 'Regular' }, groesse: 10, farbe: 'ink' },
  },
};

function seite(id, name, extra = {}, elemente = []) {
  return { id, typ: 'leer', name, elemente, ...extra };
}
function textEl(id, inhalt, extra = {}) {
  return { id, typ: 'text', x: 40, y: 700, b: 400, h: 12, stil: 'normal',
           inhalt, einzeilig: true, ...extra };
}

function baue(seiten) {
  return { schema: 1, format: { breite: 595.28, hoehe: 841.89, ausrichtung: 'hoch' },
           stil: STIL, seiten };
}

let fehler = 0;
const pruefe = (bedingung, was) => {
  if (bedingung) return;
  fehler++;
  console.log(`  [FEHLER] ${was}`);
};

// --- 1. Eine Seite ohne Pflichtdaten entfaellt --------------------------
{
  const v = baue([
    seite('immer', 'Immer da', {}, [textEl('t1', 'Seite {{seite.nummer}} von {{seite.gesamt}}')]),
    seite('energie', 'Energie', { sichtbar_wenn: { vorhanden: 'objekt.energie_kennwert' } }),
    seite('schluss', 'Schluss', {}, [textEl('t2', 'Seite {{seite.nummer}} von {{seite.gesamt}}')]),
  ]);
  const ohne = rendern({ vorlage: v, daten: {}, schriften });
  pruefe(ohne.seiten.length === 2,
         `Ohne Energiekennwert sollten 2 Seiten bleiben, es sind ${ohne.seiten.length}.`);
  const texte = ohne.seiten.flatMap((s) => s.schritte.filter((x) => x.art === 'text')
    .map((x) => x.text));
  pruefe(texte.includes('Seite 1 von 2') && texte.includes('Seite 2 von 2'),
         `Die Seitenzahlen muessen die entfallene Seite kennen, gefunden: ${JSON.stringify(texte)}.`);

  const mit = rendern({ vorlage: v, daten: { 'objekt.energie_kennwert': 62.4 }, schriften });
  pruefe(mit.seiten.length === 3,
         `Mit Energiekennwert sollten 3 Seiten erscheinen, es sind ${mit.seiten.length}.`);
}

// --- 2. Eine Seite wiederholt sich je Eintrag ---------------------------
{
  const v = baue([
    seite('plan', 'Grundriss', { wiederholen: { feld: 'objekt.grundrisse' } },
          [textEl('t', 'Grundriss {{lauf.nummer}} von {{lauf.gesamt}}')]),
  ]);
  const drei = rendern({
    vorlage: v, schriften,
    daten: { 'objekt.grundrisse': ['a', 'b', 'c'] },
  });
  pruefe(drei.seiten.length === 3,
         `Drei Grundrisse, drei Seiten — es sind ${drei.seiten.length}.`);
  const texte = drei.seiten.map((s) => s.schritte.find((x) => x.art === 'text').text);
  pruefe(texte.join('|') === 'Grundriss 1 von 3|Grundriss 2 von 3|Grundriss 3 von 3',
         `Der Lauf muss mitzaehlen, gefunden: ${texte.join('|')}.`);

  const keine = rendern({ vorlage: v, daten: { 'objekt.grundrisse': [] }, schriften });
  pruefe(keine.seiten.length === 0, 'Ohne Grundrisse darf keine Seite stehen.');
  pruefe(keine.warnungen.some((w) => w.art === 'fehlender_wert'),
         'Dass die Seite entfaellt, muss in den Warnungen stehen.');
}

// --- 3. Abweichungen je Objekt ------------------------------------------
{
  const v = baue([
    seite('eins', 'Eins', {}, [textEl('t', 'Vorgabe')]),
    seite('zwei', 'Zwei', {}, [textEl('t2', 'Bleibt')]),
  ]);
  const raus = rendern({
    vorlage: v, daten: {}, schriften,
    overrides: { seiten_aus: ['zwei'], texte: { t: 'Vom Nutzer gesetzt' } },
  });
  pruefe(raus.seiten.length === 1, 'Eine ausgeblendete Seite darf nicht erscheinen.');
  pruefe(raus.seiten[0].schritte.find((x) => x.art === 'text').text === 'Vom Nutzer gesetzt',
         'Ein ueberschriebener Text muss den der Vorlage ersetzen.');
}

// --- 4. Fehlender Wert laesst den Text entfallen, mit Warnung -----------
{
  const v = baue([seite('eins', 'Eins', {}, [
    textEl('pflicht', 'Wohnfläche: {{objekt.wohnflaeche}}'),
    textEl('freiwillig', 'Etage: {{objekt.etage?}}', { id: 'freiwillig', y: 650 }),
  ])]);
  const raus = rendern({ vorlage: v, daten: {}, schriften });
  const texte = raus.seiten[0].schritte.filter((x) => x.art === 'text').map((x) => x.text);
  pruefe(!texte.some((t) => t.includes('Wohnfläche')),
         `Ohne Wohnflaeche darf die Zeile nicht stehen, gefunden: ${JSON.stringify(texte)}.`);
  pruefe(texte.some((t) => t.startsWith('Etage:')),
         `Ein mit ? gekennzeichneter Platzhalter darf fehlen, gefunden: ${JSON.stringify(texte)}.`);
  pruefe(raus.warnungen.some((w) => w.art === 'fehlender_wert' && w.element === 'pflicht'),
         'Der entfallene Text muss als Warnung erscheinen.');
}

// --- 5. Text, der nicht passt, wird verdichtet und sonst gemeldet -------
{
  const lang = 'Sehr langer Text. '.repeat(40);
  const v = baue([seite('eins', 'Eins', {}, [
    { id: 'eng', typ: 'text', x: 40, y: 700, b: 200, h: 24, stil: 'normal',
      inhalt: lang, verdichten: true },
  ])]);
  const raus = rendern({ vorlage: v, daten: {}, schriften });
  pruefe(raus.warnungen.some((w) => w.art === 'verdichtet'),
         'Ein zu langer Text muss verdichtet werden.');
  pruefe(raus.warnungen.some((w) => w.art === 'gekuerzt'),
         'Passt er auch verdichtet nicht, muss das gemeldet werden.');
}

// --- 6. Ein unbekannter Platzhalter faellt auf --------------------------
{
  const v = baue([seite('eins', 'Eins', {}, [textEl('t', '{{objekt.gibtsnicht}}')])]);
  const raus = rendern({ vorlage: v, daten: {}, schriften });
  pruefe(raus.warnungen.some((w) => w.art === 'unbekannt' && w.text.includes('gibtsnicht')),
         'Ein Platzhalter, den der Katalog nicht kennt, muss gemeldet werden.');
}

// --- 7. Ein mit KI bearbeitetes Bild wird gekennzeichnet ---------------
// CLAUDE.md: sichtbare Kennzeichnung, auch in Exporten. Die Kennzeichnung
// haengt an den Daten, nicht an der Vorlage — eine Vorlage soll sie nicht
// abschalten koennen. Darum wird hier beides geprueft: mit und ohne.
{
  const bildEl = { id: 'b', typ: 'bild', x: 40, y: 400, b: 300, h: 200,
                   slot: { art: 'foto', nr: 1 } };
  const v = baue([seite('eins', 'Eins', {}, [bildEl])]);
  const schild = (daten) => rendern({ vorlage: v, daten, schriften })
    .seiten[0].schritte.some((s) => s.art === 'text' && s.text === 'MIT KI BEARBEITET');

  pruefe(schild({ 'bild.foto.1': 'f1.jpg', 'objekt.ki_bilder': ['f1.jpg'] }),
         'Ein mit KI bearbeitetes Bild muss das Schild tragen.');
  pruefe(!schild({ 'bild.foto.1': 'f1.jpg' }),
         'Ein unbearbeitetes Bild darf kein Schild tragen.');
  pruefe(!schild({ 'bild.foto.1': 'f1.jpg', 'objekt.ki_bilder': ['anderes.jpg'] }),
         'Das Schild gehoert nur an das genannte Bild.');
  pruefe(!schild({ 'objekt.ki_bilder': ['f1.jpg'] }),
         'Ohne Bild kein Schild — ein Platzhalter ist kein KI-Bild.');
}

if (fehler) {
  console.log(`\n  ${fehler} Pruefungen fehlgeschlagen.`);
  process.exit(1);
}
console.log('  [ok] Seitenlogik: Bedingungen, Wiederholungen, Abweichungen,');
console.log('       fehlende Werte, Verdichtung, unbekannte Platzhalter und die');
console.log('       Kennzeichnung KI-bearbeiteter Bilder.');
