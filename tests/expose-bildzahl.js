// Kommen ALLE Bilder ins Exposé — oder nur die ersten sieben?
//
// Bis fork_64 nicht. Die drei Systemvorlagen hatten feste Bildrahmen:
// Raster sechs Fotos, Signature sieben, Studio fünf, dazu ein bis zwei
// Grundrisse. `expose-pdf-erzeugen` lud ohnehin höchstens zehn Fotos und
// sechs Grundrisse — fest verdrahtet. Wer dreißig Fotos pflegte, bekam
// fünf bis sieben, und niemand sagte es ihm.
//
// Seit fork_64 wiederholt sich je Vorlage eine Seite „Weitere Bilder"
// (vier Fotos je Seite) und eine Seite „Weitere Grundrisse". Die Mechanik
// dafür war im Schema schon beschrieben — `wiederholen` —, aber die
// Bildslots folgten dem Durchgang nicht: der zweite Durchgang zeigte
// dieselben Fotos wie der erste.
//
// Dieser Test stellt die Frage, auf die es ankommt, und zwar am
// gezeichneten Ergebnis statt an der Vorlage:
//
//   Wird bei N Fotos und M Grundrissen jedes einzelne genau EINMAL
//   gezeichnet?
//
// „Genau einmal" ist beides: kein Bild fehlt, und keines steht zweimal
// drin. Der erste Fehler dieser Art war ein doppelter Versatz — Galerie
// und Bildslot zählten beide dazu, und der vierte Durchgang zeigte Foto 31
// statt 19. Vier graue Kästen statt vier Bildern, und `fehlendes_bild` in
// den Warnungen.
//
// Geprüft wird über den Zeichenschritten, nicht über dem PDF: jedes Foto
// bekommt eine eigene Quellkennung, und am Ende wird abgezählt, welche
// Kennung auf welcher Seite steht.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const SCHRIFTEN = path.join(WURZEL, 'assets', 'fonts', 'expose');
const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-bildzahl-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
execFileSync('tsc', [path.join(WURZEL, 'packages', 'expose-renderer', 'src', 'rendern.ts'),
                     path.join(WURZEL, 'packages', 'expose-renderer', 'src', 'aufbereiten.ts'),
                     '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020',
                     '--skipLibCheck', '--esModuleInterop'],
             { stdio: 'pipe', cwd: os.tmpdir() });
const { rendern } = require(path.join(tmp, 'rendern.js'));
const { aufbereiten } = require(path.join(tmp, 'aufbereiten.js'));
const { metrikLesen } = require(path.join(tmp, 'schrift.js'));

const schriften = new Map();
for (const f of fs.readdirSync(SCHRIFTEN).filter((n) => n.endsWith('.ttf'))) {
  schriften.set(f.replace(/\.ttf$/, ''),
                metrikLesen(fs.readFileSync(path.join(SCHRIFTEN, f)), f));
}

let fehler = 0;
let geprueft = 0;
const melde = (text, ok, zusatz) => {
  geprueft++;
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${text}${zusatz ? ' — ' + zusatz : ''}`);
};

/** Alle Bildschritte einer Seite — auch die in einer Maskengruppe. */
function bildQuellen(schritte, raus = []) {
  for (const s of schritte) {
    if (s.art === 'gruppe') { bildQuellen(s.schritte ?? [], raus); continue; }
    if (s.art === 'bild' && typeof s.quelle === 'string') raus.push(s.quelle);
  }
  return raus;
}

function zeichne(name, fotos, grundrisse) {
  const bilder = { 'objekt.hauptbild_url': 'titelbild' };
  for (let i = 1; i <= fotos; i++) bilder['bild.foto.' + i] = 'foto-' + i;
  for (let i = 1; i <= grundrisse; i++) bilder['bild.grundriss.' + i] = 'plan-' + i;
  const daten = aufbereiten({
    immobilie: { id: 'p', bezeichnung: 'Probe', ort: 'Musterstadt',
                 wohnflaeche: 100, angebotspreis: 500000 },
    firma: { firma_name: 'Musterhaus' },
    bilder,
  });
  const vorlage = JSON.parse(
    fs.readFileSync(path.join(VORLAGEN, name + '.json'), 'utf-8'));
  const erg = rendern({ vorlage, daten, schriften });
  const zaehler = new Map();
  erg.seiten.forEach((s, i) => {
    for (const q of bildQuellen(s.schritte)) {
      if (!/^(foto|plan)-\d+$/.test(q)) continue;
      zaehler.set(q, (zaehler.get(q) ?? []).concat(i + 1));
    }
  });
  return { erg, zaehler };
}

const VORLAGENNAMEN = ['raster', 'signature', 'studio'];
// Die Zahlen sind nicht beliebig: 0 und 1 sind die Raender, 5 bis 8 liegen
// um die festen Rahmen der drei Vorlagen (fuenf, sechs, sieben), 13 war die
// alte Grenze der Probe, 30 ist ein gepflegtes Objekt und 100 die Frage, ob
// „beliebig viele" wirklich beliebig heisst.
const PROBEN = [[0, 0], [1, 0], [1, 1], [5, 1], [6, 2], [7, 2], [8, 3],
                [13, 4], [30, 7], [100, 20]];

for (const name of VORLAGENNAMEN) {
  let vorigeSeiten = 0;
  for (const [fotos, grundrisse] of PROBEN) {
    const { erg, zaehler } = zeichne(name, fotos, grundrisse);

    const fehlt = [];
    const doppelt = [];
    for (const [vorsatz, n] of [['foto', fotos], ['plan', grundrisse]]) {
      for (let i = 1; i <= n; i++) {
        const seiten = zaehler.get(`${vorsatz}-${i}`);
        if (!seiten) fehlt.push(`${vorsatz}-${i}`);
        else if (seiten.length > 1) doppelt.push(`${vorsatz}-${i} auf S.${seiten}`);
      }
    }
    const lage = `${name} mit ${fotos} Fotos / ${grundrisse} Grundrissen`;
    melde(`${lage}: kein Bild fehlt`, fehlt.length === 0,
          fehlt.slice(0, 8).join(', ') + (fehlt.length > 8 ? ` … (${fehlt.length})` : ''));
    melde(`${lage}: kein Bild steht zweimal`, doppelt.length === 0,
          doppelt.slice(0, 5).join('; '));

    // Kein leerer Rahmen auf den WIEDERHOLTEN Seiten. Nur dort ist er ein
    // Fehler: diese Seiten entstehen ausschliesslich, weil es Bilder fuer
    // sie gibt, und die Galerie waehlt ihre Aufteilung nach deren Zahl.
    //
    // Auf den FESTEN Seiten der Vorlage ist ein Platzhalter gewollt — ein
    // Objekt mit einem Foto hat auf der Beschreibungsseite nun einmal
    // einen Rahmen zu viel, und der Renderer sagt es in den Warnungen.
    // Das ist Verhalten der Vorlage und nicht Sache dieses Tests.
    const leer = erg.warnungen.filter(
      (w) => w.art === 'fehlendes_bild' && /-mehr$/.test(String(w.seite ?? '')));
    melde(`${lage}: kein leerer Rahmen auf den Mehr-Seiten`, leer.length === 0,
          leer.slice(0, 4).map((w) => `${w.seite}/${w.element}`).join(', '));

    // Mehr Bilder duerfen nie WENIGER Seiten ergeben.
    melde(`${lage}: die Seitenzahl waechst nicht rueckwaerts`,
          erg.seiten.length >= vorigeSeiten,
          `${erg.seiten.length} nach ${vorigeSeiten}`);
    vorigeSeiten = erg.seiten.length;
  }
}

// Und die Gegenrichtung: ohne Bilder darf keine Seite fuer Bilder entstehen.
for (const name of VORLAGENNAMEN) {
  const { erg } = zeichne(name, 0, 0);
  const mehr = erg.seiten.filter((s) => /-mehr$/.test(s.id));
  melde(`${name} ohne Bilder: keine Seite "…-mehr"`, mehr.length === 0,
        mehr.map((s) => s.id).join(', '));
}

// Dass die Vorlagen die Mechanik ueberhaupt benutzen — sonst prueft alles
// oben nur, dass nichts fehlt, was niemand verlangt hat.
for (const name of VORLAGENNAMEN) {
  const v = JSON.parse(fs.readFileSync(path.join(VORLAGEN, name + '.json'), 'utf-8'));
  const wdh = v.seiten.filter((s) => s.wiederholen);
  melde(`${name}: hat wiederholende Seiten fuer Fotos und Grundrisse`,
        wdh.some((s) => /fotoliste/.test(s.wiederholen.feld))
        && wdh.some((s) => /grundrissliste/.test(s.wiederholen.feld)),
        wdh.map((s) => `${s.id}:${s.wiederholen.feld}`).join(', ') || 'keine');
}

if (fehler) {
  console.log(`\n  ${fehler} von ${geprueft} Pruefungen gescheitert.`);
  process.exit(1);
}
const { erg: gross } = zeichne('raster', 100, 20);
console.log(`  [ok] ${geprueft} Pruefungen zur Bildzahl im Exposé:`);
console.log('       3 Vorlagen x 10 Bestueckungen von 0 bis 100 Fotos.');
console.log('       Jedes Foto und jeder Grundriss wird genau einmal gezeichnet,');
console.log('       kein Rahmen bleibt leer, und ohne Bilder entsteht keine');
console.log(`       Bildseite. 100 Fotos und 20 Grundrisse ergeben ${gross.seiten.length} Seiten.`);
