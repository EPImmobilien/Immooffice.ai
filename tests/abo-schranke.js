// Hält die Abo-Schranke vor den KI-Aufrufen, die (noch) nichts kosten?
//
// Dreißig Funktionen rufen ein Sprachmodell, ohne Credits zu verbrauchen.
// Dass sie nichts abrechnen, ist eine offene Preisfrage und steht in
// `docs/BILLING.md`. Dass ein Mandant ohne gültiges Abo sie trotzdem
// benutzen darf, war keine Entscheidung, sondern ein Loch: jeder Aufruf
// kostet den Betreiber Geld beim Anbieter, und `CLAUDE.md` verlangt, dass
// Rechte serverseitig durchgesetzt werden.
//
// fork_61 legt deshalb `abo.ts` als Beilage in jeden dieser Ordner und
// hängt `aboSchranke` an den Anfang des Handlers. Hier wird geprüft, dass
// das überall und an der richtigen Stelle passiert ist:
//
//   1. Die Liste im Erzeuger und die Ordner stimmen überein.
//   2. Jede Kopie der Beilage ist byte-gleich mit der Quelle.
//   3. Jede Funktion bindet sie ein und ruft sie genau einmal.
//   4. Der Aufruf steht NACH dem OPTIONS-Zweig — davor wäre er ein Fehler:
//      ein CORS-Vorabflug trägt keinen Anmeldekopf.
//   5. Und VOR dem Anbieter — sonst ist das Geld schon ausgegeben.
//   6. Keine Funktion hat Schranke UND Abrechnung: credits.ts prüft
//      dasselbe, zweimal prüfen heißt zweimal rundreisen.
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'supabase', 'eigene-beilagen', '_abo', 'abo.ts');
const ERZEUGER = path.join(WURZEL, 'scripts', 'neutralisieren-funktionen.py');
const FUNKTIONEN = path.join(WURZEL, 'supabase', 'functions');

let fehler = 0;
let geprueft = 0;
const melde = (text, ok, zusatz) => {
  geprueft++;
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${text}${zusatz ? ' — ' + zusatz : ''}`);
};

if (!fs.existsSync(QUELLE)) {
  console.log('  supabase/eigene-beilagen/_abo/abo.ts fehlt — uebersprungen.');
  process.exit(0);
}

// --- 1. Die Liste steht im Erzeuger, nicht hier --------------------------
// Eine zweite Liste waere eine Liste, die man doppelt pflegt.
const erzeuger = fs.readFileSync(ERZEUGER, 'utf8');
const block = erzeuger.match(/ABO_SCHRANKE = \{([\s\S]*?)\n\}/);
melde('ABO_SCHRANKE steht im Erzeuger', !!block);
const namen = block
  ? Array.from(block[1].matchAll(/'([a-z0-9-]+)'/g)).map((m) => m[1])
  : [];
melde('und nennt mindestens zwanzig Funktionen', namen.length >= 20,
      String(namen.length));

const quelle = fs.readFileSync(QUELLE);

// Wer schon abrechnet, braucht die Schranke nicht: credits.ts prueft das Abo.
const abrechnend = fs.readdirSync(FUNKTIONEN).filter((n) => {
  const d = path.join(FUNKTIONEN, n, 'index.ts');
  return fs.existsSync(d) && fs.readFileSync(d, 'utf8').includes('kiAbrechnen(');
});

// Dass ueberhaupt ein Anbieter im Spiel ist. Gesucht wird am Merkmal des
// Aufrufs, nicht an der Adresse: einige Funktionen setzen nur die
// Kopfzeilen (`x-api-key`, `anthropic-version`) und bauen die Adresse aus
// einer Konstanten.
const ANBIETER = /anthropic-version|x-api-key|api\.anthropic\.com|api\.openai\.com|replicate/i;

for (const name of namen) {
  const ordner = path.join(FUNKTIONEN, name);
  const datei = path.join(ordner, 'index.ts');
  if (!fs.existsSync(datei)) { melde(`${name}: index.ts fehlt`, false); continue; }
  const q = fs.readFileSync(datei, 'utf8');

  // --- 2. Die Beilage liegt da und ist byte-gleich ----------------------
  const kopie = path.join(ordner, 'abo.ts');
  const da = fs.existsSync(kopie);
  melde(`${name}: die Beilage liegt im Ordner`, da);
  if (da) {
    melde(`${name}: die Beilage ist byte-gleich mit der Quelle`,
          fs.readFileSync(kopie).equals(quelle),
          'supabase/eigene-beilagen/_abo/abo.ts ist die Quelle');
  }

  // --- 3. Eingebunden und genau einmal gerufen --------------------------
  melde(`${name}: bindet die Schranke ein`,
        /import \{\s*aboSchranke\s*\} from "\.\/abo\.ts";/.test(q));
  const rufe = (q.match(/await aboSchranke\(/g) || []).length;
  melde(`${name}: ruft die Schranke genau einmal`, rufe === 1, `${rufe} Aufrufe`);
  const beiSchranke = q.indexOf('await aboSchranke(');
  if (beiSchranke < 0) continue;

  // --- 4. Unmittelbar nach dem OPTIONS-Zweig ---------------------------
  // Gleich zwei Fragen auf einmal, und deshalb so streng:
  //
  // VOR dem OPTIONS-Zweig waere die Schranke ein Fehler — ein CORS-
  // Vorabflug traegt keinen Anmeldekopf, und eine 403 ohne CORS-Kopf
  // sieht im Browser aus wie ein Netzfehler.
  //
  // IRGENDWO spaeter waere sie unpruefbar. Die naheliegende Pruefung
  // „steht vor dem Anbieter" misst Textstellen, und in der Haelfte dieser
  // Funktionen steht der Anbieteraufruf in einem Helfer OBERHALB des
  // Handlers — textlich davor, ausgefuehrt danach. Gemessen wird deshalb
  // nicht der Abstand zum Anbieter, sondern dass zwischen OPTIONS-Zweig
  // und Schranke nichts steht ausser Leerraum und Kommentar. Dann laeuft
  // sie vor allem, was die Funktion sonst tut — Helfer eingeschlossen.
  const optionsZweig = q.match(
    /if \(_?req\.method ===? "OPTIONS"\)\s*(?:\{\n[^\n]*\n\s*\}|[^\n]*)\n/);
  melde(`${name}: hat einen OPTIONS-Zweig`, !!optionsZweig);
  if (optionsZweig) {
    const dazwischen = q.slice(optionsZweig.index + optionsZweig[0].length,
                               beiSchranke);
    const nurBeiwerk = dazwischen
      .split('\n')
      .every((z) => z.trim() === '' || z.trim().startsWith('//')
             || z.trim().startsWith('const immoAboSperre'));
    melde(`${name}: die Schranke ist das Erste nach dem OPTIONS-Zweig`,
          beiSchranke > optionsZweig.index && nurBeiwerk,
          `dazwischen steht: ${JSON.stringify(dazwischen.trim().slice(0, 90))}`);
  }

  // --- 5. Ein Anbieter ist ueberhaupt im Spiel --------------------------
  melde(`${name}: ruft ueberhaupt ein Sprachmodell`, ANBIETER.test(q),
        'sonst gehoert die Funktion nicht in ABO_SCHRANKE');

  // --- 6. Nicht zusaetzlich zur Abrechnung ------------------------------
  melde(`${name}: rechnet nicht zusaetzlich ab`, !abrechnend.includes(name),
        'credits.ts prueft das Abo bereits — zweimal pruefen ist zweimal '
        + 'rundreisen');
}

// --- Und keine der abrechnenden Funktionen traegt die Schranke ----------
for (const name of abrechnend) {
  melde(`${name}: rechnet ab und braucht die Schranke nicht`,
        !namen.includes(name));
}

if (fehler) {
  console.log(`\n  ${fehler} von ${geprueft} Pruefungen gescheitert.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Pruefungen zur Abo-Schranke:`);
console.log(`       ${namen.length} Funktionen rufen ein Sprachmodell ohne Preis im`);
console.log('       Katalog. Keine davon tut es fuer einen Mandanten, dessen Abo');
console.log('       abgelaufen oder gesperrt ist: die Schranke ist in jeder das');
console.log('       Erste nach dem OPTIONS-Zweig.');
