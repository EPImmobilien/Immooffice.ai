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

// Welche zwei Farben ein Prototyp als "die beiden der Vorlage" fuehrt,
// heisst bei jedem anders.
const MARKENFARBEN = { raster: ['p', 'a'], signature: ['d', 'a'], studio: ['s', 'd'] };

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
// ist eine Entscheidung, nicht eine Ausnahme: der Prototyp schreibt an
// dieser Stelle etwas, das der Fork bewusst anders schreibt. Der Eintrag
// ersetzt den Text des Prototyps vor dem Vergleich — Ort, Schnitt,
// Groesse und Farbe werden weiter voll geprueft.
const ABWEICHENDE_TEXTE = [
  {
    vorlage: 'raster',
    soll: 'Notar & Grundbuch (ca, 2,0 %)',
    ist: 'Notar & Grundbuch (ca. 2,0 %)',
    grund: 'Der Prototyp baut die Zeile mit '
         + '`f"… (ca. {notar:.1f} %)".replace(".", ",")` und trifft damit auch '
         + 'den Punkt in "ca." — das ist ein Tippfehler im Prototyp, nicht '
         + 'eine Schreibweise. Der Fork setzt "ca." mit Punkt.',
  },
  {
    vorlage: 'signature',
    soll: 'Notar & Grundbuch (ca, 1,5 %)',
    ist: 'Notar & Grundbuch (ca. 1,5 %)',
    grund: 'Derselbe Tippfehler wie bei Raster: `.replace(".", ",")` trifft '
         + 'auch den Punkt in "ca.".',
  },
  {
    vorlage: 'signature',
    soll: 'Käuferprovision (3,57 % inkl, MwSt,)',
    ist: 'Käuferprovision (3,57 % inkl. MwSt.)',
    grund: 'Derselbe Tippfehler, hier gleich zweimal: aus "inkl. MwSt." wird '
         + '"inkl, MwSt,".',
  },
  {
    vorlage: 'studio',
    soll: 'Neubaustandard 2021 – durchdacht und sofort bezugsfertig.',
    ist: 'Durchdacht und sofort bezugsfertig.',
    grund: 'Die Unterzeile einer Seite steht in der Vorlage und gilt damit '
         + 'fuer jedes Objekt, das sie benutzt. "Neubaustandard 2021" ist eine '
         + 'Aussage ueber EIN Objekt; als Vorgabe waere sie fuer jedes andere '
         + 'eine erfundene Angabe (CLAUDE.md: keine erfundenen Objektdaten). '
         + 'Der Makler kann sie im Editor jederzeit so schreiben.',
  },
];

const textErsatz = new Map();
for (const e of ABWEICHENDE_TEXTE) textErsatz.set(`${e.vorlage}|${e.soll}`, e.ist);

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

const { daten: datenFuer, uebernahmen } = require('./expose-vorlagen-daten.js');

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
// Farben werden auf vier Stellen gerundet verglichen, nicht ueber ihren
// Hexwert. Die Aufzeichnung rundet auf sechs Stellen, und genau an einer
// halben Stufe kippt das: mix(p, weiss, 0.5) ergibt im Gruenkanal
// 0,6490196…, gerundet 0,64902 — mal 255 sind das 165,4999… gegen
// 165,5001, also #a5 gegen #a6. Dieselbe Farbe, zwei Hexwerte. Vier
// Stellen sind feiner als 8 Bit und liegen von dieser Kante weg.
const kanal = (v) => Math.round(v * 10000) / 10000;
const farbSchluessel = (c) =>
  (c ? `${kanal(c[0])},${kanal(c[1])},${kanal(c[2])}/${rund(c[3])}` : '-');

/** Wonach ein Schritt vergleichbar ist — ohne seinen Ort. */
function schluessel(s) {
  switch (s.art) {
    case 'text':
      return `text|${seitenzahl(s.text)}|${schnittName(s.schnitt)}|${s.groesse}|${rund(s.sperrung)}|${farbSchluessel(s.farbe)}`;
    case 'rechteck':
    case 'rundrechteck':
      return `${s.art}|${rund(s.b)}|${rund(s.h)}|${rund(s.r || 0)}|` +
             `${farbSchluessel(s.fuell)}|${farbSchluessel(s.strich)}`;
    case 'linie':
      // Die Laenge gehoert NICHT in den Schluessel. Eine
      // Fuehrungspunktreihe endet dort, wo der gemessene Text aufhoert —
      // ihre Laenge ist also abgeleitet und nicht gesetzt. Verglichen
      // werden statt dessen beide Endpunkte, jeder mit derselben
      // Toleranz wie jeder andere Ort. Das ist strenger als eine
      // gerundete Laenge und sagt mehr: eine Linie, die 2 pt zu kurz
      // ist, faellt auf, eine, die um ein Hundertstel abweicht, nicht.
      return `linie|${s.y1 === s.y2 ? 'waagerecht' : s.x1 === s.x2 ? 'senkrecht' : 'schraeg'}` +
             `|${farbSchluessel(s.strich)}`;
    case 'kreis':
      return `kreis|${rund(s.r)}|${farbSchluessel(s.fuell)}|${farbSchluessel(s.strich)}`;
    case 'ellipse':
      return `ellipse|${rund(s.x2 - s.x1)}|${rund(s.y2 - s.y1)}|${farbSchluessel(s.fuell)}`;
    case 'maske': {
      // Die Form gehoert in den Schluessel. Sonst konkurrieren der
      // rechteckige Bildrahmen und das runde Portraitfenster um dieselbe
      // Zuordnung, und der Vergleich meldet beide als falsch platziert.
      const e = s.schritte[0] || [];
      const masse = e.slice(3).map((v) => (typeof v === 'number' ? rund(v) : v));
      return `maske|${s.schritte.length}|${e[0]}|${masse.join(',')}`;
    }
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

/**
 * Die kennzeichnenden Punkte eines Schritts. Bei einer Linie sind es
 * beide Enden, sonst der Ansatzpunkt.
 */
function punkte(s) {
  const m = s.matrix || [1, 0, 0, 1, 0, 0];
  const p = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  if (s.art === 'linie') return [p(s.x1, s.y1), p(s.x2, s.y2)];
  return [ort(s)];
}

/** Groesster Abstand zwischen zwei Schritten, ueber ihre Punkte. */
function abstand(a, b) {
  const pa = punkte(a);
  const pb = punkte(b);
  if (pa.length !== pb.length) return Infinity;
  let groesste = 0;
  for (let i = 0; i < pa.length; i++) {
    groesste = Math.max(groesste, Math.abs(pa[i][0] - pb[i][0]),
                        Math.abs(pa[i][1] - pb[i][1]));
  }
  return groesste;
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

// Rahmen, die im Prototyp eine ZEICHNUNG ersetzen und nicht ein Foto.
// Dort darf auch Text entschuldigt werden: der gezeichnete Grundriss
// tragt Raumnamen, der gezeichnete Lageplan eine Strassenbeschriftung.
// Ein hochgeladener Grundriss bringt seine eigenen mit. Ueberall sonst
// bleibt Text unentschuldbar.
const ZEICHNUNG = new Set(['bild:grundriss', 'bild:lageplan']);

/** Rahmen, in denen Platzhaltergrafik der Prototypen stehen darf. */
function rahmenAus(schritte) {
  const raus = [];
  for (const s of schritte) {
    if (s.art === 'bild' || s.art === 'maske') {
      const e = s.schritte ? s.schritte[0] : null;
      if (s.art === 'bild') raus.push([s.x, s.y, s.x + s.b, s.y + s.h, false]);
      else if (e && (e[0] === 'rect' || e[0] === 'roundRect')) {
        raus.push([e[1], e[2], e[1] + e[3], e[2] + e[4],
                   ZEICHNUNG.has(s.zweck)]);
      } else if (e && e[0] === 'circle') {
        // Das runde Portraitfenster der Kontaktkarte. Der Prototyp malt
        // darin eine Silhouette; im Produkt steht dort das Foto des
        // Ansprechpartners.
        raus.push([e[1] - e[3], e[2] - e[3], e[1] + e[3], e[2] + e[3],
                   ZEICHNUNG.has(s.zweck)]);
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

/** Der umschliessende Kasten eines Schritts, in Seitenkoordinaten. */
function kasten(s) {
  const m = s.matrix || [1, 0, 0, 1, 0, 0];
  const p = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const punkte = [];
  const dazu = (x, y) => punkte.push(p(x, y));
  switch (s.art) {
    case 'text': dazu(s.x, s.y); break;
    case 'rechteck': case 'rundrechteck': case 'bild': case 'qr':
      dazu(s.x, s.y); dazu(s.x + s.b, s.y + s.h); break;
    case 'linie': dazu(s.x1, s.y1); dazu(s.x2, s.y2); break;
    case 'kreis': dazu(s.x - s.r, s.y - s.r); dazu(s.x + s.r, s.y + s.r); break;
    case 'ellipse': dazu(s.x1, s.y1); dazu(s.x2, s.y2); break;
    case 'verlauf': dazu(s.x0, s.y0); dazu(s.x1, s.y1); break;
    case 'maske': case 'pfad':
      for (const t of s.schritte) {
        if (t[0] === 'rect' || t[0] === 'roundRect') {
          dazu(t[1], t[2]); dazu(t[1] + t[3], t[2] + t[4]);
        } else if (t[0] === 'circle') {
          dazu(t[1] - t[3], t[2] - t[3]); dazu(t[1] + t[3], t[2] + t[3]);
        } else if (t[0] === 'ellipse') {
          dazu(t[1], t[2]); dazu(t[3], t[4]);
        } else {
          for (let i = 1; i + 1 < t.length; i += 2) dazu(t[i], t[i + 1]);
        }
      }
      break;
    default: dazu(0, 0);
  }
  if (!punkte.length) return [0, 0, 0, 0];
  const xs = punkte.map((q) => q[0]);
  const ys = punkte.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Liegt der Schritt in einem Bildrahmen?
 *
 * Geprueft wird die UEBERSCHNEIDUNG der Kaesten, nicht nur der Ansatzpunkt.
 * Die Prototypen zeichnen ihre Platzhalterkarte bewusst ueber die Kante
 * hinaus und lassen die Maske schneiden — eine Strasse beginnt bei x = 32,
 * der Rahmen erst bei x = 42. Nach dem Ansatzpunkt allein waere sie
 * draussen, und der Test wuerde fuenf Strassen als fehlend melden.
 *
 * Das ist unbedenklich, weil erst zugeordnet und dann eingestuft wird:
 * ein tragendes Element, das ein Foto ueberlappt, ist zu diesem Zeitpunkt
 * schon zugeordnet.
 */
function imRahmen(s, rahmen, nurZeichnung = false) {
  const [ax1, ay1, ax2, ay2] = kasten(s);
  return rahmen.some(([x1, y1, x2, y2, zeichnung]) =>
    (!nurZeichnung || zeichnung) &&
    ax1 <= x2 + 0.5 && ax2 >= x1 - 0.5 && ay1 <= y2 + 0.5 && ay2 >= y1 - 0.5);
}

let fehler = 0;
let geprueft = 0;
let platzhalter = 0;
let groessteAbweichung = 0;
let doppelt = 0;
// Werden je Vorlage gesetzt; schluessel() liest sie.
let unvollstaendig = false;
let vorlageName = '';
const seitenzahl = (t) => {
  const ersatz = textErsatz.get(`${vorlageName}|${t}`);
  if (ersatz !== undefined) return ersatz;
  return (unvollstaendig && /^\d+ \/ \d+$/.test(t)) ? t.replace(/\/ \d+$/, '/ n') : t;
};
const platzhalterArten = new Map();
const meldungen = [];

for (const name of WELCHE) {
  const soll = aufzeichnung[name];
  if (!soll) { console.log(`  [FEHLER] Keine Aufzeichnung fuer "${name}".`); fehler++; continue; }

  vorlageName = name;
  const vorlage = JSON.parse(fs.readFileSync(path.join(VORLAGEN, `${name}.json`), 'utf-8'));
  const ergebnis = rendern({
    vorlage,
    daten: datenFuer(name, soll.daten),
    schriften,
    // Welche zwei Farben der Prototyp als "die beiden der Vorlage" fuehrt,
    // heisst bei jedem anders: Raster p/a, Signature d/a, Studio s/d.
    // Genau diese zwei gibt der Test als Branding des Mandanten herein.
    marke: marke(name, soll.farben),
    // Texte, die je Objekt geschrieben werden, kommen ueber die
    // Abweichungen — genau den Weg, den der Editor im Objektmodus
    // benutzt. In der Vorlage steht dafuer ein neutraler Vorschlag: eine
    // Systemvorlage darf nicht behaupten, jedes Objekt habe sechs Meter
    // Raumhoehe.
    overrides: uebernahmen(name),
  });

  const schlimm = ergebnis.warnungen.filter((w) => w.art === 'unbekannt');
  for (const w of schlimm) {
    fehler++;
    meldungen.push(`${name}: ${w.element || w.seite}: ${w.text}`);
  }

  // Nur so viele Seiten vergleichen, wie die Vorlage schon hat.
  const seiten = Math.min(ergebnis.seiten.length, soll.seiten.length);
  // Solange die Vorlage weniger Seiten hat als der Prototyp, steht im Fuss
  // zwangslaeufig eine andere Gesamtzahl ("02 / 02" statt "02 / 10"). Die
  // Nachsicht gilt nur fuer genau diese Form und verschwindet von selbst,
  // sobald alle Seiten gebaut sind.
  unvollstaendig = ergebnis.seiten.length < soll.seiten.length;
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
    const gesehen = new Set();
    for (const s of sollSchritte) {
      const k = schluessel(s);
      // Zeichnet der Prototyp zweimal genau dasselbe an genau dieselbe
      // Stelle, ist der zweite Strich unsichtbar. Das kommt vor (die
      // Trennlinie unter der Kennzahlentafel von Signature steht in der
      // Schleife UND dahinter), und eine Vorlage, die ein Element doppelt
      // fuehrt, damit ein Test gruen wird, waere schlechter als der Test.
      const [ox, oy] = ort(s);
      const marke = `${k}@${rund(ox)},${rund(oy)}`;
      if (gesehen.has(marke)) { doppelt++; continue; }
      gesehen.add(marke);
      if (!offen.has(k)) offen.set(k, []);
      offen.get(k).push(s);
    }

    // Dieselbe Nachsicht fuer die eigene Seite: der Renderer setzt in einen
    // leeren Bildrahmen eine ruhige Flaeche und maskiert ihn. Beides ist
    // Platzhalter und steht in keinem Prototyp. Text ist auch hier nie
    // entschuldigt.
    const eigenerPlatzhalter = (s) =>
      s.art === 'maske' ? istRahmenMaske(s, rahmen)
      : s.art === 'text' ? imRahmen(s, rahmen, true)
      : imRahmen(s, rahmen);

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
        const d = abstand(s, c);
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
        if (s.art === 'text' && imRahmen(s, rahmen, true)) {
          platzhalter++;
          platzhalterArten.set('Beschriftung einer Zeichnung',
            (platzhalterArten.get('Beschriftung einer Zeichnung') || 0) + 1);
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

function marke(name, farben) {
  const [a, b] = MARKENFARBEN[name] || ['p', 'a'];
  const h = (c) => (c ? hex({ r: c[0], g: c[1], b: c[2] }) : undefined);
  return { primaer: h(farben[a]), akzent: h(farben[b]) };
}

function beschreibe(s) {
  if (s.art === 'text') return `"${s.text}" (${schnittName(s.schnitt)} ${s.groesse})`;
  if (s.art === 'rechteck' || s.art === 'rundrechteck') {
    const c = s.fuell || s.strich;
    return `${s.art} ${rund(s.b)}x${rund(s.h)}` +
      (c ? ` in ${hex({ r: c[0], g: c[1], b: c[2] })}` : '');
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
if (doppelt) {
  console.log(`       ${doppelt} Schritte zeichnen die Prototypen doppelt an dieselbe`);
  console.log(`       Stelle — unsichtbar, und darum nicht gefordert.`);
}
console.log(`       ${platzhalter} Schritte sind Platzhaltergrafik in Bildrahmen —`);
console.log(`       laut Auftrag nur Platzhalter, im Produkt stehen dort Fotos:`);
console.log(`       ${[...platzhalterArten].map(([a, n]) => `${n}x ${a}`).join(', ')}.`);
for (const e of ABWEICHENDE_TEXTE) {
  console.log(`       Mit Grund abweichend: ${e.vorlage} — "${e.soll}"`);
  console.log(`         statt dessen "${e.ist}". ${e.grund}`);
}
