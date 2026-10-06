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
const { flach: flachLegen } = require(path.join(tmp, 'schritte.js'));
const { breite: breiteVon } = require(path.join(tmp, 'schrift.js'));
// Der Ordner bleibt bis zum Ende: Abschnitt 8 laedt daraus noch bildKasten.
const tmpSchritte = tmp;
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

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
//
// Das Fragezeichen heisst seit dem 06.10.2026: DIESER Platzhalter darf
// fehlen, ohne den ganzen Text mitzunehmen — solange im Text noch ein
// anderer Wert steht. Eine Beschriftung allein ("Etage:") ist kein Text,
// sondern ein Zeiger ins Leere und entfaellt weiterhin. Und das
// Trennzeichen vor einem fehlenden Wert geht mit ihm: sonst stand auf neun
// Seiten der Luxusvorlage ein Mittelpunkt ohne Wort dahinter.
{
  const v = baue([seite('eins', 'Eins', {}, [
    textEl('pflicht', 'Wohnfläche: {{objekt.wohnflaeche}}'),
    textEl('allein', 'Etage: {{objekt.etage?}}', { id: 'allein', y: 650 }),
    textEl('zusammen', '{{objekt.ort}}  ·  Etage {{objekt.etage?}}',
           { id: 'zusammen', y: 600 }),
  ])]);
  const raus = rendern({ vorlage: v, daten: { 'objekt.ort': 'Musterstadt' }, schriften });
  const texte = raus.seiten[0].schritte.filter((x) => x.art === 'text').map((x) => x.text);
  pruefe(!texte.some((t) => t.includes('Wohnfläche')),
         `Ohne Wohnflaeche darf die Zeile nicht stehen, gefunden: ${JSON.stringify(texte)}.`);
  pruefe(!texte.some((t) => t.includes('Etage:')),
         `Eine Beschriftung ohne Wert ist kein Text, gefunden: ${JSON.stringify(texte)}.`);
  pruefe(texte.includes('Musterstadt'),
         `Der vorhandene Wert muss bleiben, ohne Trenner und ohne "Etage", `
         + `gefunden: ${JSON.stringify(texte)}.`);
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

// --- 8. Das Logo: ein Wortzeichen muss lesbar gross werden -------------
// Am 06.10.2026 kam der Befund von zwei echten Exposés: "das mit den Logos
// passt nicht". Der Grund: die Vorlagen hatten dem Logo einen
// quadratischen Rahmen von 20 bis 30 Punkt gegeben — im Prototyp sitzt
// dort ein Signet. Ein Schriftzug von 6:1 wurde darin auf wenige Punkte
// Hoehe gequetscht.
//
// Geprueft wird darum an den ECHTEN Vorlagen, nicht an einer gebauten:
// ein breites Logo muss breit gezeichnet werden, ein quadratisches darf
// sich dadurch nicht verschieben, und neben einem Wortzeichen darf der
// Markenname nicht ein zweites Mal stehen.
{
  const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');
  const basis = {
    'firma.marken_name': 'Musterimmobilien',
    'firma.name': 'Musterimmobilien Nord GmbH',
    'firma.logo.hell': 'logo', 'firma.logo.dunkel': 'logo',
  };
  // Welche Kaesten das Logo belegt, sagt bildKasten — dieselbe Funktion,
  // die auch das PDF und die Bearbeitungsflaeche benutzen.
  const { bildKasten } = require(path.join(tmpSchritte, 'schritte.js'));
  const logoKaesten = (vorlage, daten, bb, hh) => {
    const raus = [];
    for (const seite of rendern({ vorlage, daten, schriften }).seiten) {
      for (const schritt of flachLegen(seite.schritte)) {
        if (schritt.art === 'bild' && schritt.quelle === 'logo') {
          raus.push(bildKasten(schritt, bb, hh));
        }
      }
    }
    return raus;
  };
  const markennameSteht = (vorlage, daten) => {
    for (const seite of rendern({ vorlage, daten, schriften }).seiten) {
      for (const schritt of flachLegen(seite.schritte)) {
        if (schritt.art === 'text'
            && String(schritt.text).toUpperCase().includes('MUSTERIMMOBILIEN')) {
          return true;
        }
      }
    }
    return false;
  };
  // Ueberschneidet das Logo einen Text? Die Breite einer Zeile rechnet
  // dieselbe Funktion wie der Renderer; der Schritt traegt schon den
  // aufgeloesten linken Rand.
  const ueberschneidungen = (vorlage, daten, bb, hh) => {
    const raus = [];
    for (const seite of rendern({ vorlage, daten, schriften }).seiten) {
      const schritte = flachLegen(seite.schritte);
      const logos = schritte
        .filter((s) => s.art === 'bild' && s.quelle === 'logo')
        .map((s) => bildKasten(s, bb, hh));
      if (!logos.length) continue;
      for (const t of schritte.filter((s) => s.art === 'text' && String(s.text).trim())) {
        const tb = breiteVon(schriften.get(t.schnitt), t.text, t.groesse)
          + (t.sperrung || 0) * Math.max(0, t.text.length - 1);
        for (const k of logos) {
          // Die Grundlinie liegt bei t.y. Nach oben reicht die Zeile bis
          // zur Versalhoehe (0,72 der Groesse bei diesen drei Familien),
          // nach unten bis zur Unterlaenge von Komma und "g".
          const oben = t.y + t.groesse * 0.72, unten = t.y - t.groesse * 0.15;
          if (k.x < t.x + tb && t.x < k.x + k.b && k.y < oben && unten < k.y + k.h) {
            raus.push(`"${t.text}" bei (${t.x.toFixed(0)}, ${t.y.toFixed(0)})`);
          }
        }
      }
    }
    return raus;
  };

  for (const datei of fs.readdirSync(VORLAGEN)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json')) {
    const name = datei.replace(/\.json$/, '');
    const vorlage = JSON.parse(fs.readFileSync(path.join(VORLAGEN, datei), 'utf-8'));

    const breit = logoKaesten(vorlage, { ...basis, 'firma.logo.form': 'breit' }, 360, 60);
    pruefe(breit.length > 0, `${name}: ein hinterlegtes Logo muss gezeichnet werden.`);
    for (const k of breit) {
      pruefe(k.b >= 60,
             `${name}: ein Wortzeichen von 6:1 wird nur ${k.b.toFixed(1)} pt breit `
             + `gezeichnet — unter 60 pt ist es nicht lesbar.`);
    }

    // Ein Signet darf durch den breiteren Rahmen nicht wandern: es bleibt
    // so gross und steht da, wo es vorher stand (der Vergleich mit den
    // Prototypen prueft genau diesen Ort).
    const eckig = logoKaesten(vorlage, { ...basis, 'firma.logo.form': 'quadratisch' }, 64, 64);
    for (const k of eckig) {
      pruefe(Math.abs(k.b - k.h) < 0.01,
             `${name}: ein quadratisches Logo muss quadratisch bleiben.`);
    }

    // Steht der Markenname neben dem Logo, darf er neben einem Schriftzug
    // nicht noch einmal auftauchen. Wo er UNTER dem Logo steht und Platz
    // hat, bleibt er — darum nur die Vorlagen pruefen, die ihn ausblenden.
    const nameBeiBreit = markennameSteht(vorlage, { ...basis, 'firma.logo.form': 'breit' });
    const nameOhneLogo = markennameSteht(vorlage, {
      'firma.marken_name': basis['firma.marken_name'], 'firma.name': basis['firma.name'],
    });
    pruefe(nameOhneLogo,
           `${name}: ohne Logo muss der Markenname stehen — sonst ist die Seite anonym.`);
    pruefe(nameBeiBreit || name !== 'signature',
           `${name}: auch neben einem Wortzeichen bleibt der Markenname dort, `
           + `wo er Platz hat.`);

    // Der Kern des Befunds: nichts darf sich mit dem Logo ueberschneiden.
    for (const kennung of ['breit', 'quadratisch']) {
      const masse = kennung === 'breit' ? [360, 60] : [64, 64];
      const treffer = ueberschneidungen(
        vorlage, { ...basis, 'firma.logo.form': kennung }, masse[0], masse[1]);
      pruefe(treffer.length === 0,
             `${name}: das Logo (${kennung}) ueberschneidet ${treffer.length} Text(e): `
             + `${treffer.slice(0, 3).join(', ')}.`);
    }
  }
}

if (fehler) {
  console.log(`\n  ${fehler} Pruefungen fehlgeschlagen.`);
  process.exit(1);
}
console.log('  [ok] Seitenlogik: Bedingungen, Wiederholungen, Abweichungen,');
console.log('       fehlende Werte, Verdichtung, unbekannte Platzhalter und die');
console.log('       Kennzeichnung KI-bearbeiteter Bilder — und dass ein Logo als');
console.log('       Wortzeichen lesbar gross wird, ohne den Markennamen zu doppeln.');
