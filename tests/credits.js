// Werden Credits wirklich verbraucht — und bei einem Fehler zurückgegeben?
//
// Die Abrechnung aus fork_47 war bis fork_49 Zierde: Töpfe, Ledger und
// Preise gab es, aber nichts verbrauchte je etwas. Seither hängt sie an den
// KI-Aufrufen und — seit fork_59 — am Signaturvorgang, als Beilage
// `credits.ts` im Ordner der jeweiligen Funktion. Das ist die Stelle, an der zweierlei leise kaputtgehen kann:
//
//   1. Eine Kopie der Beilage läuft auseinander. Sie entsteht beim Erzeugen
//      neu — wer die Kopie statt der Quelle ändert, verliert die Änderung
//      beim nächsten Lauf und merkt es nicht.
//   2. Eine Funktion reserviert, und ein Rückweg vergisst die Freigabe.
//      Dann zahlt der Kunde für einen Fehler des Anbieters. CLAUDE.md:
//      „Fehlgeschlagene KI-Aufträge geben reservierte Credits automatisch
//      frei."
//
// Dazu kommt die dritte, langweiligste Fehlerquelle: ein Aktionsschlüssel,
// den es im Katalog nicht gibt. `credits_kosten` gibt dann 0 zurück, und
// die teuerste Aktion des Hauses wäre stillschweigend umsonst.
//
// Geprüft wird am Quelltext, nicht zur Laufzeit: eine Edge Function lässt
// sich ohne Deno und ohne Supabase nicht ausführen, und was hier zählt, ist
// ohnehin eine Frage der Struktur. Das Verhalten der Datenbankseite steht
// in tests/abrechnung.sql.
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'supabase', 'eigene-beilagen', '_credits', 'credits.ts');
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
  console.log('  supabase/eigene-beilagen/_credits/credits.ts fehlt — uebersprungen.');
  process.exit(0);
}

// --- Wer die Beilage bekommen soll, steht im Erzeuger ---------------------
const erzeuger = fs.readFileSync(ERZEUGER, 'utf8');
const block = erzeuger.match(/GEMEINSAME_BEILAGEN = \{([\s\S]*?)\n\}/);
melde('GEMEINSAME_BEILAGEN steht im Erzeuger', !!block);
const empfaenger = block
  ? Array.from(block[1].matchAll(/'([a-z0-9-]+)',/g)).map((m) => m[1])
  : [];
melde('und nennt mindestens eine Funktion', empfaenger.length > 0,
      String(empfaenger.length));

// --- 1. Jede Kopie ist byte-gleich ---------------------------------------
const quelle = fs.readFileSync(QUELLE);
for (const name of empfaenger) {
  const kopie = path.join(FUNKTIONEN, name, 'credits.ts');
  const da = fs.existsSync(kopie);
  melde(`${name}: die Beilage liegt im Ordner`, da);
  if (!da) continue;
  melde(`${name}: die Beilage ist byte-gleich mit der Quelle`,
        fs.readFileSync(kopie).equals(quelle),
        'supabase/eigene-beilagen/_credits/credits.ts ist die Quelle');
}

// --- 2. Die Aktionsschluessel muss es im Katalog geben --------------------
// Gelesen wird aus der Migration, die den Katalog saet — nicht aus einer
// zweiten Liste hier. Eine Liste, die man doppelt pflegt, prueft nichts.
const katalogDatei = path.join(WURZEL, 'supabase', 'migrations',
  '20261006210000_fork_47_abrechnung.sql');
const katalog = fs.existsSync(katalogDatei) ? fs.readFileSync(katalogDatei, 'utf8') : '';
const bekannt = new Set(
  Array.from(katalog.matchAll(/\('([a-z_]+)',\s*'[^']*',\s*\d+,/g)).map((m) => m[1]));
melde('der Katalog nennt Aktionen', bekannt.size >= 5, `${bekannt.size} Aktionen`);

// --- 3. Jede Funktion haengt richtig an ----------------------------------
for (const name of empfaenger) {
  const datei = path.join(FUNKTIONEN, name, 'index.ts');
  if (!fs.existsSync(datei)) { melde(`${name}: index.ts fehlt`, false); continue; }
  const q = fs.readFileSync(datei, 'utf8');

  melde(`${name}: bindet die Abrechnung ein`,
        /import \{[^}]*kiAbrechnen[^}]*\} from "\.\/credits\.ts";/.test(q));

  const aufrufe = Array.from(q.matchAll(/kiAbrechnen\(\s*req\s*,\s*([^,)]+)/g))
    .map((m) => m[1].trim());
  melde(`${name}: reserviert genau einmal`, aufrufe.length === 1,
        `${aufrufe.length} Aufrufe`);

  // Der Schluessel steht entweder woertlich da oder in einer Variablen, die
  // kurz davor gesetzt wird. Beides wird aufgeloest — sonst koennte man die
  // Pruefung mit einer Variablen umgehen.
  let schluessel = [];
  for (const a of aufrufe) {
    if (/^["']/.test(a)) { schluessel.push(a.slice(1, -1)); continue; }
    const zuweisung = q.match(new RegExp(`const ${a}\\s*=([^;]+);`));
    if (!zuweisung) { melde(`${name}: der Aktionsschluessel ist auffindbar`, false, a); continue; }
    // Was VERGLICHEN wird, ist kein Schluessel: in
    // `body.funktion === "staging" ? "bild_homestaging" : "bild_optimieren"`
    // steht links die Bedingung und rechts die Aktion.
    const rechts = zuweisung[1].replace(/[=!]==?\s*["'][^"']*["']/g, '');
    for (const t of rechts.matchAll(/["']([a-z_]+)["']/g)) schluessel.push(t[1]);
  }
  melde(`${name}: nennt mindestens einen Aktionsschluessel`, schluessel.length > 0);
  for (const s of schluessel) {
    melde(`${name}: "${s}" steht im Katalog`, bekannt.has(s),
          'sonst kostet die Aktion stillschweigend nichts');
  }

  // Reserviert wird VOR der Leistung. Sonst hat der Kunde bekommen, wofuer
  // er zahlen sollte, bevor jemand nachgesehen hat, ob er darf.
  //
  // Was "die Leistung" ist, haengt an der Funktion. Bei den KI-Aufrufen ist
  // es der Anbieter. Bei signatur-vorgang-starten gibt es keinen Anbieter —
  // die Signatur ist eigene Leistung; der Punkt ohne Wiederkehr ist die
  // Zeile in signatur_vorgaenge, denn ab da existiert der Vorgang, das PDF
  // liegt im Speicher und die Links sind unterwegs. Deshalb eine Tabelle
  // statt einer festen Liste von Anbietern: eine Funktion ohne Anbieter
  // waere sonst unpruefbar, und "unpruefbar" hiesse hier "ungeprueft".
  const LEISTUNG = {
    'signatur-vorgang-starten': [/\.from\("signatur_vorgaenge"\)\.insert\(/],
  };
  const ANBIETER = [
    /fetch\("https:\/\/api\.anthropic\.com/,
    /fetch\(ANTHROPIC_API_URL/,
    /await replicateRun\(/,
  ];
  const beiReservierung = q.indexOf('kiAbrechnen(');
  // Gesucht wird erst ab Deno.serve: davor steht hoechstens die DEFINITION
  // des Aufrufs, und die sagt nichts ueber die Reihenfolge.
  const abHandler = q.indexOf('Deno.serve(');
  const marken = LEISTUNG[name] || ANBIETER;
  const wort = LEISTUNG[name] ? 'die Leistung' : 'der Anbieter';
  const anbieter = marken.map((r) => {
    const i = q.slice(abHandler).search(r);
    return i < 0 ? -1 : i + abHandler;
  }).filter((i) => i >= 0);
  melde(`${name}: ${wort} kommt erst nach der Reservierung`,
        anbieter.length > 0 && anbieter.every((i) => i > beiReservierung),
        `Reservierung bei ${beiReservierung}, Leistung bei ${anbieter.join(', ')}`);

  // Gebucht wird genau einmal, und erst nach der Leistung.
  const beiBuchung = q.indexOf('.buchen(');
  melde(`${name}: bucht genau einmal`,
        (q.match(/\.buchen\(/g) || []).length === 1, String(beiBuchung));
  melde(`${name}: und erst nach ${wort}`,
        anbieter.length > 0 && beiBuchung > Math.min(...anbieter));

  // Und jeder Rueckweg nach der Reservierung gibt frei — mindestens der
  // Abbruch im catch, der alles auffaengt, was kein eigenes return hat.
  melde(`${name}: gibt bei Abbruch frei`,
        /catch[\s\S]{0,400}?credits\) await credits\.freigeben\(/.test(q),
        'der catch-Zweig muss die Reservierung zurueckgeben');
  const beiHalter = q.indexOf('let credits: Abrechnung | null = null;');
  melde(`${name}: haelt die Reservierung ausserhalb des try`,
        beiHalter > 0 && beiHalter < q.indexOf('\n  try {'),
        'sonst ist sie im catch nicht erreichbar');

  // Jeder Rueckweg zwischen Reservierung und Buchung muss freigeben.
  //
  // Geprueft wird ueber die ANZAHL, nicht ueber den Text davor: ein Blick
  // zurueck in den Quelltext findet auch die Freigabe eines ANDEREN Zweiges
  // und haelt den eigenen fuer erledigt. Genau so war diese Pruefung zuerst
  // geschrieben, und sie hat eine geloeschte Freigabe nicht bemerkt.
  //
  // Nicht mitgezaehlt wird die Ablehnung der Abrechnung selbst: dort ist
  // noch nichts reserviert.
  const mitte = q.slice(beiReservierung, beiBuchung);
  const rueckwege = Array.from(mitte.matchAll(/\n\s*return new Response\(/g));
  let offen = [];
  let seit = 0;
  for (const r of rueckwege) {
    // Jede Freigabe deckt hoechstens EINEN Rueckweg: zwischen zwei
    // Rueckwegen muss eine stehen, sonst laeuft der zweite ohne.
    if (!/\.freigeben\(/.test(mitte.slice(seit, r.index))) {
      offen.push(mitte.slice(r.index, r.index + 90).replace(/\s+/g, ' ').trim());
    }
    seit = r.index;
  }
  melde(`${name}: jeder Rueckweg vor der Buchung gibt frei`, offen.length === 0,
        offen.join(' / '));

  melde(`${name}: lehnt sichtbar ab, wenn es nicht reicht`,
        /return abgelehnt\(abr, /.test(q));
}

// --- 4. Die Beilage selbst ------------------------------------------------
const b = fs.readFileSync(QUELLE, 'utf8');
melde('die Beilage prueft das Abo, nicht nur die Credits',
      /abo_zugriff/.test(b) && /!== "voll"/.test(b),
      'ein gesperrter Mandant darf keine KI starten');
melde('sie reserviert ueber die Datenbankfunktion',
      /credits_reservieren/.test(b));
melde('sie erkennt "nicht genug" am Fehlercode, nicht am Text allein',
      /53400/.test(b));
melde('sie nennt den Saldo, wenn es nicht reicht',
      /credits_saldo/.test(b) && /credits_benoetigt/.test(b),
      'sonst weiss der Nutzer nicht, wie viel fehlt');
melde('ein Fehler beim Buchen wirft das Ergebnis nicht weg',
      /console\.error\("credits_buchen:"/.test(b),
      'der Nutzer hat seinen Text — er darf ihn nicht verlieren');
melde('der Dollarkurs steht im Plattform-Admin, nicht im Code',
      /usd_eur_kurs/.test(b) && !/\*\s*0\.9\d/.test(b));

if (fehler) {
  console.log(`\n  ${fehler} von ${geprueft} Pruefungen gescheitert.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Pruefungen zu den Credits an den kostenpflichtigen Aufrufen:`);
console.log(`       ${empfaenger.length} Funktionen reservieren vor der Leistung,`);
console.log('       buchen erst danach, geben bei jedem Abbruch zurueck — und');
console.log('       jede Kopie der Beilage ist byte-gleich mit ihrer Quelle.');
