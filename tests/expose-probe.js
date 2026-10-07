// Sieht ein Exposé fertig aus — oder nur abgeschickt?
//
// `scripts/expose-probe.mjs` zeichnet jede Vorlage mit nachgebauten
// Objektdaten und MELDET, was dabei nicht gepasst hat: ein Text, der
// gekürzt werden musste, eine Zeile, die verkleinert wurde, ein Rahmen, der
// über die Seite ragt. Das Werkzeug gab es seit dem 06.10.2026 — und
// niemand hat seine Meldungen gelesen.
//
// Am 07.10.2026 nachgesehen, was darin stand:
//
//   * Der Zierrahmen der Handschrift Signature war im Quadratformat
//     639 pt hoch auf einer 540 pt hohen Seite. Er lief unten heraus, auf
//     jedem Quadrat-Beitrag, seit es das Format gibt.
//   * Der Wortmarken-Rückfall der Handschrift Studio wird von 15 auf
//     6,8 Punkt verkleinert, weil ein normaler Firmenname nicht in seinen
//     90 pt breiten Rahmen passt. Nachgemessen: dort passen bei 15 pt elf
//     Zeichen. Das ist KEIN Fehler des Renderers und auch keiner der
//     Vorlage, sondern eine Grenze des Prototyps — siehe
//     BEKANNTE_GRENZEN unten. Sie steht hier benannt, damit sie nicht
//     unter einem Schwellwert verschwindet.
//
// Der Rahmen hat der Renderer von Anfang an gemeldet. Der Fehler war nicht
// im Renderer, sondern darin, dass keine Prüfung seine Meldungen las. Das
// ist der Zweck dieser Datei.
//
// Geprüft wird gegen zwei Datenlagen, weil sie verschiedene Fehler zeigen:
// ein dünn gepflegtes Objekt (fehlende Felder, Platzhalter) und ein voll
// gepflegtes (lange Texte, viele Bilder).
//
// Was ein Befund ist:
//   gekuerzt    — Text wurde abgeschnitten. Der Leser sieht „…" statt des
//                 Inhalts; das sieht kaputt aus.
//   verdichtet  — nur unterhalb von LESBAR Punkt. Verkleinern ist der
//                 gewollte Rückfall; 6,8 Punkt auf einer Titelseite ist es
//                 nicht.
//   Rahmen über der Seite — immer.
//
// Was KEIN Befund ist: ein Element, das wegen eines fehlenden Feldes
// entfällt. Das ist die Regel aus CLAUDE.md — keine erfundenen Objektdaten.
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const LESBAR = 9;          // Punkt. Darunter gilt eine Zeile als unlesbar.

// Bekannte Meldungen, die stehen dürfen — mit Grund, nicht als Freibrief.
// Die Probe setzt Kennwert 46 mit Klasse C, und das passt absichtlich nicht
// zusammen: 46 kWh/(m2*a) ist Klasse A. Der Renderer soll den Widerspruch
// melden, statt stillschweigend einen der beiden Werte zu zeichnen.
const ERLAUBT = [
  /liegt in Klasse .*, am Objekt steht aber Klasse/,
];

// Grenzen, die im Prototyp stecken und nicht im Code. Jede einzeln
// benannt, mit Grund und Ausweg — ein Schwellwert hätte sie bloß
// unsichtbar gemacht.
//
// Studio zeichnet die Wortmarke in ein dunkles Feld, das der Prototyp bei
// 126 pt Breite festlegt (`rect(c, 0, H-M-54, M+90, 54)`); für den Text
// bleiben 90 pt. Der Prototyp selbst setzt dort „musterhaus." — eine kurze
// Wortmarke, und genau dafür ist das Feld gemacht. `marken_name` ist nicht
// der Firmenname, sondern die Wortmarke; der Firmenname steht in
// `firma_name`. Wer dort „MUSTERHAUS PROJEKTE" einträgt, bekommt 6,8 Punkt.
//
// Die Ausweichwege, die es schon gibt: eine kurze Wortmarke, oder ein
// breites Logo — dann entfällt der Text ganz (`sichtbar_wenn`).
//
// Breiter machen heißt, das Feld des Prototyps zu verändern. Das ist eine
// Gestaltungsentscheidung des Auftraggebers, keine des Codes:
// tests/expose-vorlagen.js hält die Vorlage auf 2 Punkt am Prototyp, und
// diese Grenze kommt aus dem Auftrag.
const BEKANNTE_GRENZEN = [
  { vorlage: 'studio', seite: 'cover',   element: 'cover-marke' },
  { vorlage: 'studio', seite: 'kontakt', element: 'kontakt-marke' },
];
const bekannt = (v, w) => BEKANNTE_GRENZEN.some(
  (g) => g.vorlage === v.name && g.seite === w.seite && g.element === w.element);

let fehler = 0;
let geprueft = 0;
const melde = (text, ok, zusatz) => {
  geprueft++;
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${text}${zusatz ? ' — ' + zusatz : ''}`);
};

/** Ruft die Probe und zerlegt ihre Ausgabe in Vorlagen und Warnungen. */
function probe(argumente) {
  let ausgabe;
  try {
    ausgabe = execFileSync('node', [path.join(WURZEL, 'scripts', 'expose-probe.mjs'),
                                    ...argumente],
                           { encoding: 'utf-8', maxBuffer: 64 << 20,
                             cwd: WURZEL, timeout: 600000 });
  } catch (e) {
    console.log(`  [FEHLER] die Probe (${argumente.join(' ') || 'alle'}) brach ab: `
                + String(e.stderr || e.message).split('\n').slice(0, 4).join(' | '));
    fehler++;
    return [];
  }
  const vorlagen = [];
  let aktuell = null;
  for (const zeile of ausgabe.split('\n')) {
    const kopf = zeile.match(/^===== ([a-z0-9-]+): (\d+) Seiten/);
    if (kopf) {
      aktuell = { name: kopf[1], seiten: Number(kopf[2]), warnungen: [] };
      vorlagen.push(aktuell);
      continue;
    }
    // "   gekuerzt           cover         cover-marke     Text …"
    const w = zeile.match(/^ {3}(\w+) {2,}(\S+) +(\S+) +(.*)$/);
    if (w && aktuell) {
      aktuell.warnungen.push({ art: w[1], seite: w[2], element: w[3], text: w[4].trim() });
    }
  }
  return vorlagen;
}

for (const [etikett, argumente] of [['dünn', []], ['voll', ['--voll']]]) {
  const vorlagen = probe(argumente);
  melde(`${etikett}: die Probe zeichnet alle Vorlagen`, vorlagen.length >= 12,
        `${vorlagen.length} Vorlagen`);

  for (const v of vorlagen) {
    melde(`${etikett}/${v.name}: hat Seiten`, v.seiten > 0, `${v.seiten}`);

    const offen = v.warnungen.filter(
      (w) => !ERLAUBT.some((r) => r.test(w.text)) && !bekannt(v, w));

    // 1. Nichts ragt über die Seite.
    const ueber = offen.filter((w) => /reicht ueber die Seite hinaus/.test(w.text));
    melde(`${etikett}/${v.name}: kein Element ragt ueber die Seite`, ueber.length === 0,
          ueber.map((w) => `${w.seite}/${w.element}`).join(', '));

    // 2. Kein Text wurde abgeschnitten.
    const ab = offen.filter((w) => w.art === 'gekuerzt');
    melde(`${etikett}/${v.name}: kein Text wurde abgeschnitten`, ab.length === 0,
          ab.map((w) => `${w.seite}/${w.element}: ${w.text.slice(0, 70)}`).join(' | '));

    // 3. Keine Zeile unter der Lesbarkeitsgrenze.
    const klein = offen
      .filter((w) => w.art === 'verdichtet')
      .map((w) => ({ w, pt: Number((w.text.match(/auf ([\d.]+) Punkt/) || [])[1]) }))
      .filter((x) => Number.isFinite(x.pt) && x.pt < LESBAR);
    melde(`${etikett}/${v.name}: keine Zeile unter ${LESBAR} Punkt`, klein.length === 0,
          klein.map((x) => `${x.w.seite}/${x.w.element}: ${x.pt} pt`).join(', '));
  }
}

// Und die Gegenrichtung: der Widerspruch im Energieausweis MUSS gemeldet
// werden. Ohne diese Prüfung könnte die Querprobe aus dem Renderer
// verschwinden, und die Liste oben würde es nicht merken — sie lässt die
// Meldung ja nur durch.
const dünn = probe([]);
const energie = dünn.flatMap((v) => v.warnungen)
  .filter((w) => /liegt in Klasse .*, am Objekt steht aber Klasse/.test(w.text));
melde('der Widerspruch im Energieausweis wird gemeldet', energie.length >= 2,
      `${energie.length} Meldung(en) — die Probe setzt Kennwert 46 mit Klasse C`);

// Und auch hier die Gegenrichtung: eine benannte Grenze, die nicht mehr
// auftritt, ist ein veralteter Eintrag. Er gehört heraus, sonst deckt er
// irgendwann etwas Neues.
{
  const alleWarnungen = probe([]).flatMap(
    (v) => v.warnungen.map((w) => ({ ...w, vorlage: v.name })));
  for (const g of BEKANNTE_GRENZEN) {
    const da = alleWarnungen.some(
      (w) => w.vorlage === g.vorlage && w.seite === g.seite && w.element === g.element);
    melde(`die benannte Grenze ${g.vorlage}/${g.element} tritt noch auf`, da,
          'sie tritt nicht mehr auf — der Eintrag in BEKANNTE_GRENZEN gehoert '
          + 'heraus, sonst deckt er spaeter etwas anderes');
  }
}

if (fehler) {
  console.log(`\n  ${fehler} von ${geprueft} Pruefungen gescheitert.`);
  console.log('  scripts/expose-probe.mjs zeigt die Stelle; die PDFs liegen in');
  console.log('  /tmp/expose-probe/.');
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Pruefungen an den gezeichneten Exposés:`);
console.log('       jede Vorlage, zweimal gezeichnet (duenn und voll gepflegt).');
console.log(`       Nichts ragt ueber die Seite, nichts ist abgeschnitten, keine`);
console.log(`       Zeile steht unter ${LESBAR} Punkt — und der Widerspruch im`);
console.log('       Energieausweis wird gemeldet.');
console.log(`       ${BEKANNTE_GRENZEN.length} benannte Grenze(n) des Prototyps `
            + 'sind ausgenommen und treten noch auf.');
