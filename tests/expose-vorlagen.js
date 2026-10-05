// Zeichnet der Renderer die drei Vorlagen so wie die Prototypen?
//
// Der Auftrag nennt Masse, Abstaende, Schriftgroessen, Farbableitung und
// Seitenaufbau der Prototypen verbindlich und erlaubt bei Position und
// Groesse hoechstens 2 Punkt Abweichung. Abnehmen sollte man das durch
// Hinsehen — PNG gegen PDF. Hinsehen findet aber keine Abweichung von zwei
// Punkt, und es findet sie nicht wieder, wenn ein halbes Jahr spaeter
// jemand eine Vorlage pflegt.
//
// Darum vergleicht dieser Test Zeichenschritt gegen Zeichenschritt:
// tests/expose-aufzeichnung.py laesst die Prototypen gegen eine Leinwand
// laufen, die mitschreibt, der Renderer liefert seine eigene Schrittliste,
// und beide werden gegeneinander gestellt.
//
// Was NICHT verglichen wird, und warum:
//
//   Platzhaltergrafik in Bildrahmen. Der Auftrag
//   (docs/PROMPT_immoOffice_Expose_Vorlagen.md) sagt ausdruecklich: "Die
//   Bildplatzhalter (gezeichnete Haeuser/Villa/Fassaden), die stilisierten
//   Karten und Grundrisse in den Prototypen sind NUR Platzhalter. Im
//   Produkt kommen dort echte Objektfotos … hin." Schritte, die vollstaendig
//   in einem Bild- oder Kartenrahmen liegen, zaehlt der Test deshalb
//   gesondert statt sie zu fordern.
//
//   Die Reichweite einer Maske. ReportLab beendet sie mit restoreState,
//   und das sieht die Aufzeichnung nicht. Verglichen wird ihre Geometrie.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const REF = path.join(WURZEL, 'reference', 'expose-vorlagen');
const SCHRIFTEN = path.join(WURZEL, 'assets', 'fonts', 'expose');
const QUELLEN = path.join(WURZEL, 'packages', 'expose-renderer', 'src');
const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');

const TOLERANZ = 2;   // Punkt, aus dem Auftrag

// Die Prototypen registrieren ihre Schriften unter Kurznamen ("J-Medium",
// "S-Light", "A-CondXB"). assets/fonts/expose/ fuehrt sie unter den Namen,
// die auch in den Referenz-PDFs eingebettet sind. Dieselbe Datei, zwei
// Namen — hier der Uebersetzer.
const SCHNITT = { 'J-': 'Jak-', 'S-': 'Corm-', 'A-': 'Arch-' };
const schnittName = (n) => {
  for (const [kurz, lang] of Object.entries(SCHNITT)) {
    if (n && n.startsWith(kurz)) return lang + n.slice(kurz.length);
  }
  return n;
};

// Texte, die sich zwangslaeufig unterscheiden, mit Grund. Jeder Eintrag
// ist eine Entscheidung, nicht eine Ausnahme: die Prototypen fuehren
// manche Beispieldaten fertig formatiert oder in Feldern, die das Schema
// des Forks nicht hat.
const ABWEICHENDE_TEXTE = [];

if (!fs.existsSync(REF)) {
  console.log('  reference/expose-vorlagen fehlt — uebersprungen. Die Prototypen');
  console.log('  sind nicht versioniert; ohne sie gibt es nichts zu vergleichen.');
  process.exit(0);
}

// --- Renderer uebersetzen -------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-vorlagen-'));
execFileSync('tsc', [
  path.join(QUELLEN, 'rendern.ts'),
  '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020',
  '--skipLibCheck', '--esModuleInterop',
], { stdio: 'pipe', cwd: os.tmpdir() });
const { rendern } = require(path.join(tmp, 'rendern.js'));
const { metrikLesen } = require(path.join(tmp, 'schrift.js'));
const { flach } = require(path.join(tmp, 'schritte.js'));
const { hex } = require(path.join(tmp, 'farben.js'));

const schriften = new Map();
for (const datei of fs.readdirSync(SCHRIFTEN).filter((f) => f.endsWith('.ttf'))) {
  const name = datei.replace(/\.ttf$/, '');
  schriften.set(name, metrikLesen(new Uint8Array(fs.readFileSync(path.join(SCHRIFTEN, datei))), name));
}

const { daten: datenFuer } = require('./expose-vorlagen-daten.js');

// --- Prototypen aufzeichnen ----------------------------------------------
const WELCHE = fs.readdirSync(VORLAGEN).filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));
if (!WELCHE.length) {
  console.log('  Noch keine Vorlage in packages/expose-renderer/vorlagen/.');
  process.exit(0);
}

const aufzeichnung = JSON.parse(execFileSync(
  'python3', [path.join(__dirname, 'expose-aufzeichnung.py'), 'alle'],
  { encoding: 'utf-8', maxBuffer: 256 << 20 }));
if (aufzeichnung.uebersprungen) {
  console.log(`  ${aufzeichnung.uebersprungen} — uebersprungen.`);
  process.exit(0);
}

// --- Vergleichen ----------------------------------------------------------
const rund = (v) => Math.round(v * 100) / 100;
const farbSchluessel = (c) => (c ? `${hex({ r: c[0], g: c[1], b: c[2] })}/${rund(c[3])}` : '-');

/** Wonach ein Schritt vergleichbar ist — ohne seinen Ort. */
function schluessel(s) {
  switch (s.art) {
    case 'text':
      return `text|${s.text}|${schnittName(s.schnitt)}|${s.groesse}|${rund(s.sperrung)}|${farbSchluessel(s.farbe)}`;
    case 'rechteck':
    case 'rundrechteck':
      return `${s.art}|${rund(s.b)}|${rund(s.h)}|${rund(s.r || 0)}|` +
             `${farbSchluessel(s.fuell)}|${farbSchluessel(s.strich)}`;
    case 'linie':
      return `linie|${rund(s.x2 - s.x1)}|${rund(s.y2 - s.y1)}|${farbSchluessel(s.strich)}`;
    case 'kreis':
      return `kreis|${rund(s.r)}|${farbSchluessel(s.fuell)}|${farbSchluessel(s.strich)}`;
    case 'ellipse':
      return `ellipse|${rund(s.x2 - s.x1)}|${rund(s.y2 - s.y1)}|${farbSchluessel(s.fuell)}`;
    case 'maske':
      return `maske|${s.schritte.length}`;
    case 'pfad':
      return `pfad|${s.schritte.length}|${farbSchluessel(s.fuell)}|${farbSchluessel(s.strich)}`;
    case 'verlauf':
      return `verlauf|${s.farben.map(farbSchluessel).join(',')}`;
    case 'qr':
      return `qr|${rund(s.b)}|${rund(s.h)}`;
    case 'bild':
      return `bild|${rund(s.b)}|${rund(s.h)}`;
    default:
      return s.art;
  }
}

/** Der Ort eines Schritts, in Seitenkoordinaten (Matrix angewandt). */
function ort(s) {
  const m = s.matrix || [1, 0, 0, 1, 0, 0];
  const p = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  switch (s.art) {
    case 'text': return p(s.x, s.y);
    case 'rechteck': case 'rundrechteck': case 'bild': case 'qr': return p(s.x, s.y);
    case 'linie': return p(s.x1, s.y1);
    case 'kreis': return p(s.x, s.y);
    case 'ellipse': return p(s.x1, s.y1);
    case 'verlauf': return p(s.x0, s.y0);
    case 'maske': case 'pfad': {
      const erste = s.schritte[0] || [];
      const x = typeof erste[1] === 'number' ? erste[1] : 0;
      const y = typeof erste[2] === 'number' ? erste[2] : 0;
      return p(x, y);
    }
    default: return p(0, 0);
  }
}

/** Rahmen, in denen Platzhaltergrafik der Prototypen stehen darf. */
function rahmenAus(schritte) {
  const raus = [];
  for (const s of schritte) {
    if (s.art === 'bild' || s.art === 'maske') {
      const e = s.schritte ? s.schritte[0] : null;
      if (s.art === 'bild') raus.push([s.x, s.y, s.x + s.b, s.y + s.h]);
      else if (e && (e[0] === 'rect' || e[0] === 'roundRect')) {
        raus.push([e[1], e[2], e[1] + e[3], e[2] + e[4]]);
      }
    }
  }
  return raus;
}

/** Ist dieser Maskenschritt genau die Maske eines Bildrahmens? */
function istRahmenMaske(s, rahmen) {
  const e = s.schritte && s.schritte[0];
  if (!e || (e[0] !== 'rect' && e[0] !== 'roundRect')) return false;
  return rahmen.some(([x1, y1, x2, y2]) =>
    Math.abs(e[1] - x1) < 0.5 && Math.abs(e[2] - y1) < 0.5 &&
    Math.abs(e[1] + e[3] - x2) < 0.5 && Math.abs(e[2] + e[4] - y2) < 0.5);
}

function imRahmen(s, rahmen) {
  const [x, y] = ort(s);
  return rahmen.some(([x1, y1, x2, y2]) =>
    x >= x1 - 0.5 && x <= x2 + 0.5 && y >= y1 - 0.5 && y <= y2 + 0.5);
}

let fehler = 0;
let geprueft = 0;
let platzhalter = 0;
let groessteAbweichung = 0;
const platzhalterArten = new Map();
const meldungen = [];

for (const name of WELCHE) {
  const soll = aufzeichnung[name];
  if (!soll) { console.log(`  [FEHLER] Keine Aufzeichnung fuer "${name}".`); fehler++; continue; }

  const vorlage = JSON.parse(fs.readFileSync(path.join(VORLAGEN, `${name}.json`), 'utf-8'));
  const ergebnis = rendern({
    vorlage,
    daten: datenFuer(name, soll.daten),
    schriften,
    marke: {
      primaer: soll.farben.p ? hex({ r: soll.farben.p[0], g: soll.farben.p[1], b: soll.farben.p[2] }) : undefined,
      akzent: soll.farben.a ? hex({ r: soll.farben.a[0], g: soll.farben.a[1], b: soll.farben.a[2] }) : undefined,
    },
  });

  const schlimm = ergebnis.warnungen.filter((w) => w.art === 'unbekannt');
  for (const w of schlimm) {
    fehler++;
    meldungen.push(`${name}: ${w.element || w.seite}: ${w.text}`);
  }

  // Nur so viele Seiten vergleichen, wie die Vorlage schon hat.
  const seiten = Math.min(ergebnis.seiten.length, soll.seiten.length);
  for (let i = 0; i < seiten; i++) {
    const sollSchritte = soll.seiten[i];
    const istSchritte = flach(ergebnis.seiten[i].schritte);
    const rahmen = rahmenAus(istSchritte);

    // Erst zuordnen, dann die Reste einstufen. Umgekehrt waere der Test
    // blind: der Bildrahmen des Covers bedeckt sechzig Prozent der Seite,
    // und darin stehen das weisse Markenfeld, das Logo, der Markenname und
    // das gedrehte Seitenband — alles tragende Gestaltung. Wuerde schon
    // vor dem Zuordnen alles im Rahmen uebersprungen, waeren fuenfzehn
    // Schritte der Titelseite ungeprueft, und der Test waere gruen, ohne
    // etwas zu wissen.
    const offen = new Map();
    for (const s of sollSchritte) {
      const k = schluessel(s);
      if (!offen.has(k)) offen.set(k, []);
      offen.get(k).push(s);
    }

    // Dieselbe Nachsicht fuer die eigene Seite: der Renderer setzt in einen
    // leeren Bildrahmen eine ruhige Flaeche und maskiert ihn. Beides ist
    // Platzhalter und steht in keinem Prototyp. Text ist auch hier nie
    // entschuldigt.
    const eigenerPlatzhalter = (s) =>
      s.art !== 'text' && (s.art === 'maske' ? istRahmenMaske(s, rahmen) : imRahmen(s, rahmen));

    for (const s of istSchritte) {
      if (s.art === 'gruppe') continue;
      if (s.art === 'bild') continue;   // im Prototyp ein Platzhalter
      geprueft++;
      const k = schluessel(s);
      const kandidaten = offen.get(k) || [];
      const [x, y] = ort(s);
      let treffer = -1;
      let beste = Infinity;
      kandidaten.forEach((c, j) => {
        const [cx, cy] = ort(c);
        const d = Math.max(Math.abs(cx - x), Math.abs(cy - y));
        if (d < beste) { beste = d; treffer = j; }
      });
      if (treffer < 0) {
        if (eigenerPlatzhalter(s)) {
          geprueft--;
          platzhalter++;
          platzhalterArten.set('eigener ' + s.art,
            (platzhalterArten.get('eigener ' + s.art) || 0) + 1);
          continue;
        }
        fehler++;
        if (meldungen.length < 30) {
          meldungen.push(`${name} S.${i + 1}: der Renderer zeichnet ` +
            `${beschreibe(s)} — in der Vorlage steht dort nichts Vergleichbares.`);
        }
        continue;
      }
      if (beste > groessteAbweichung) groessteAbweichung = beste;
      if (beste > TOLERANZ) {
        fehler++;
        const c = kandidaten[treffer];
        const [cx, cy] = ort(c);
        if (meldungen.length < 30) {
          meldungen.push(`${name} S.${i + 1}: ${beschreibe(s)} steht bei ` +
            `(${rund(x)}, ${rund(y)}), die Vorlage setzt es bei ` +
            `(${rund(cx)}, ${rund(cy)}) — ${rund(beste)} pt daneben.`);
        }
      }
      kandidaten.splice(treffer, 1);
      if (!kandidaten.length) offen.delete(k);
    }

    // Was uebrig ist: Platzhaltergrafik oder eine Luecke.
    //
    // Entschuldigt wird nur, was KEIN Text ist und vollstaendig in einem
    // Bild- oder Kartenrahmen liegt. Text niemals: die
    // Platzhaltergrafik der Prototypen enthaelt keinen Text ausser der
    // Beschriftung des Bildrahmens, und die zeichnet der Renderer selbst.
    // Fehlt eine Zeile, soll das auffallen, auch wenn sie ueber einem Foto
    // steht.
    for (const [, liste] of offen) {
      for (const s of liste) {
        if (s.art !== 'text' && imRahmen(s, rahmen)) {
          platzhalter++;
          platzhalterArten.set(s.art, (platzhalterArten.get(s.art) || 0) + 1);
          continue;
        }
        fehler++;
        if (meldungen.length < 30) {
          const [x, y] = ort(s);
          meldungen.push(`${name} S.${i + 1}: die Vorlage zeichnet ${beschreibe(s)} ` +
            `bei (${rund(x)}, ${rund(y)}) — der Renderer nicht.`);
        }
      }
    }
  }

  if (ergebnis.seiten.length < soll.seiten.length) {
    meldungen.push(`${name}: die Vorlage hat ${ergebnis.seiten.length} von ` +
      `${soll.seiten.length} Seiten — die uebrigen sind noch nicht gebaut.`);
  }
}

function beschreibe(s) {
  if (s.art === 'text') return `"${s.text}" (${schnittName(s.schnitt)} ${s.groesse})`;
  if (s.art === 'rechteck' || s.art === 'rundrechteck') {
    return `${s.art} ${rund(s.b)}x${rund(s.h)}`;
  }
  if (s.art === 'linie') return `linie ${rund(s.x2 - s.x1)}x${rund(s.y2 - s.y1)}`;
  return s.art;
}

fs.rmSync(tmp, { recursive: true, force: true });

for (const m of meldungen) console.log('  ' + (m.includes('noch nicht gebaut') ? '' : '[FEHLER] ') + m);
if (fehler) {
  console.log(`\n  ${fehler} Abweichungen bei ${geprueft} verglichenen Schritten.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Zeichenschritte stimmen mit den Prototypen ueberein`);
console.log(`       (Schnitt, Groesse, Sperrung, Farbe; groesste Abweichung beim Ort:`);
console.log(`       ${groessteAbweichung.toFixed(3)} pt, erlaubt sind ${TOLERANZ}).`);
console.log(`       ${platzhalter} Schritte sind Platzhaltergrafik in Bildrahmen —`);
console.log(`       laut Auftrag nur Platzhalter, im Produkt stehen dort Fotos:`);
console.log(`       ${[...platzhalterArten].map(([a, n]) => `${n}x ${a}`).join(', ')}.`);
if (ABWEICHENDE_TEXTE.length) {
  console.log(`       ${ABWEICHENDE_TEXTE.length} Texte weichen mit Grund ab.`);
}
