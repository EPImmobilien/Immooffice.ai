// Erfährt ein Haus rechtzeitig, dass seine Testphase endet — und nur einmal?
//
// Drei Dinge gehen hier leise schief, und jedes kostet einen Kunden:
//
//   1. Die Meldung kommt zweimal. Zwei gleichzeitige Läufe sehen sich nicht,
//      wenn die Sperre eine Abfrage ist statt ein Schlüssel.
//   2. Die Meldung kommt gar nicht, weil der Versand scheiterte, die Sperre
//      aber schon stand.
//   3. Die Meldung behauptet etwas, das nicht stimmt — eine automatische
//      Verlängerung etwa, die es nicht gibt.
//
// Geprüft wird am Quelltext und, für das Band in der Oberfläche, an einem
// nachgebauten React. Der Versand selbst hängt an Resend; ihn hier zu
// prüfen hiesse, Resend nachzubauen, und das prüfte dann Resend.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..');
const FUNKTION = path.join(WURZEL, 'supabase', 'eigene', 'testphase-erinnerung', 'index.ts');
const BAND = path.join(WURZEL, 'src', 'eigene', 'abo-banner.js');
const MIGRATION = path.join(WURZEL, 'supabase', 'migrations',
  '20261006240100_fork_53_testphase_erinnerung.sql');

let fehler = 0, geprueft = 0;
const melde = (text, ok, zusatz) => {
  geprueft++;
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${text}${zusatz ? ' — ' + zusatz : ''}`);
};

if (!fs.existsSync(FUNKTION)) {
  console.log('  supabase/eigene/testphase-erinnerung fehlt — uebersprungen.');
  process.exit(0);
}
const q = fs.readFileSync(FUNKTION, 'utf8');

// --- 1. Drei Stufen, in verbleibenden Tagen -------------------------------
const stufen = Array.from(q.matchAll(/\{\s*tage:\s*(\d+),\s*art:\s*"([a-z_0-9]+)"/g))
  .map((m) => ({ tage: Number(m[1]), art: m[2] }));
melde('es gibt drei Stufen', stufen.length === 3, JSON.stringify(stufen));
melde('sie rechnen in VERBLEIBENDEN Tagen: 7, 2, 0',
      stufen.map((s) => s.tage).join(',') === '7,2,0',
      'eine feste "Tag 21" waere bei einer kuerzeren Testphase die Mail nach dem Ende');
melde('jede Stufe hat eine eigene Kennung',
      new Set(stufen.map((s) => s.art)).size === 3);
melde('der Rest wird aus testphase_bis gerechnet',
      /Math\.ceil\(\(new Date\(m\.testphase_bis\)/.test(q));

// --- 2. Die Sperre gegen Doppelversand ------------------------------------
melde('die Sperre ist ein Einfuegen, keine Abfrage',
      /\.from\("abo_erinnerungen"\)\s*\n?\s*\.insert\(/.test(q),
      'zwei gleichzeitige Laeufe saehen eine Abfrage nicht');
melde('der doppelte Schluessel wird erkannt und uebersprungen',
      /code === "23505"/.test(q) && /continue/.test(q));
const beiSperre = q.indexOf('.insert({ mandant_id: m.id, art: stufe.art })');
const beiVersand = q.indexOf('api.resend.com');
melde('erst die Sperre, dann der Versand',
      beiSperre > 0 && beiVersand > beiSperre,
      `Sperre bei ${beiSperre}, Versand bei ${beiVersand}`);
melde('ein gescheiterter Versand loest die Sperre wieder',
      /catch[\s\S]{0,400}?from\("abo_erinnerungen"\)\s*\n?\s*\.delete\(\)/.test(q),
      'sonst gilt eine Meldung als erledigt, die nie ankam');
melde('der Probelauf verschickt nichts und sperrt nichts',
      /probelauf[\s\S]{0,600}?\.delete\(\)/.test(q));

// --- 3. Wer sie bekommt ---------------------------------------------------
melde('nur Chef-Konten DESSELBEN Mandanten',
      /\.eq\("mandant_id", m\.id\)\.eq\("role", "chef"\)/.test(q),
      'ein Mitarbeiter kann mit der Nachricht nichts anfangen');
melde('wer schon einen Tarif hat, bekommt nichts mehr',
      /abo\.status !== "test"/.test(q));
melde('ohne Chef-Adresse wird das vermerkt statt verschwiegen',
      /kein Chef mit Adresse/.test(q));

// --- 4. Was in der Mail steht ---------------------------------------------
melde('die Mail sagt, dass NICHTS abgebucht wird',
      /nichts automatisch abgebucht/.test(q),
      'eine stillschweigende Verlaengerung waere eine Abofalle — und es gibt keine');
melde('sie nennt die Frist fuer den Lesezugriff',
      /\$\{lesetage\}/.test(q) && /lesezugriff_tage/.test(q));
melde('die Frist kommt aus dem Katalog, nicht aus dem Code',
      /plattform_werte/.test(q));
melde('sie nennt das Datum ausgeschrieben',
      /toLocaleDateString\("de-DE"/.test(q));
melde('eingesetzte Werte werden fuer HTML entschaerft',
      /function htmlSicher/.test(q) && /replace\(\/&\/g, "&amp;"\)/.test(q));

// --- 5. Die Migration ------------------------------------------------------
if (fs.existsSync(MIGRATION)) {
  const m = fs.readFileSync(MIGRATION, 'utf8');
  melde('der Primaerschluessel ist die Sperre',
        /primary key \(mandant_id, art\)/.test(m));
  melde('die Tabelle traegt die Mandantentrennung',
        /as restrictive for all to authenticated/.test(m));
  melde('es gibt einen Zeitplan', /cron\.schedule\(\s*\n?\s*'testphase-erinnerung-taeglich'/.test(m));
  melde('er laeuft EINMAL am Tag',
        /'testphase-erinnerung-taeglich',\s*'\d+ \d+ \* \* \*'/.test(m),
        'stuendlich waere die Rechnung "verbleibende Tage" nicht mehr eindeutig');
}

// --- 6. Das Band in der Oberflaeche ---------------------------------------
if (fs.existsSync(BAND)) {
  const quelle = fs.readFileSync(BAND, 'utf8');

  function band(stand) {
    let i = 0;
    const zustaende = [stand, ''];
    const React = {
      createElement: (typ, props, ...kinder) => ({ typ,
        props: Object.assign({}, props || {},
          kinder.length ? { children: kinder.length === 1 ? kinder[0] : kinder } : {}) }),
      useState: (anfang) => { const w = i < zustaende.length ? zustaende[i] : anfang; i++; return [w, () => {}]; },
      useEffect: () => {}, useCallback: (f) => f,
    };
    const fenster = { IMMO_CI: null, IMMO_MANDANT_ID: "m",
      _sb: { functions: { invoke: () => Promise.resolve({ data: null }) } },
      localStorage: { getItem: () => "", setItem: () => {} },
      addEventListener: () => {}, removeEventListener: () => {} };
    const umgebung = { React, window: fenster, console, Number, Date, isFinite, String };
    vm.createContext(umgebung);
    vm.runInContext(quelle, umgebung, { filename: 'abo-banner.js' });
    if (typeof fenster.ImmoAboBanner !== 'function') return null;
    let baum;
    try { baum = fenster.ImmoAboBanner({ onNavigate: () => {} }); }
    catch (e) { return { fehler: e.message }; }
    if (!baum) return null;
    let text = '';
    const sammeln = (k, t) => {
      t = t || 0;
      if (t > 40 || k === null || k === undefined || k === false) return;
      if (typeof k === 'string' || typeof k === 'number') { text += k + ' '; return; }
      if (Array.isArray(k)) { k.forEach((x) => sammeln(x, t + 1)); return; }
      if (!k.typ) return;
      sammeln(k.props && k.props.children, t + 1);
    };
    sammeln(baum);
    return { art: baum.props["data-abo-band"], text: text,
             schliessbar: /×/.test(text) || text.indexOf("×") >= 0 };
  }

  const inTagen = (n) => new Date(Date.now() + n * 86400000).toISOString();

  melde('ohne Grund kein Band',
        band({ zugriff: 'voll', saldo: 900, abo: { status: 'aktiv' } }) === null);
  melde('eine lange Testphase zeigt noch nichts',
        band({ zugriff: 'voll', saldo: 300, testphase_bis: inTagen(20),
               abo: { status: 'test' } }) === null);

  let b = band({ zugriff: 'voll', saldo: 300, testphase_bis: inTagen(5),
                 abo: { status: 'test' } });
  melde('fuenf Tage vorher steht es da', !!b && /endet in 5 Tagen/.test(b.text),
        b && b.text);
  melde('und es sagt, dass nichts abgebucht wird',
        !!b && /nichts automatisch abgebucht/.test(b.text));
  melde('fuenf Tage vorher laesst es sich wegklicken', !!b && b.schliessbar);

  b = band({ zugriff: 'voll', saldo: 300, testphase_bis: inTagen(1),
             abo: { status: 'test' } });
  melde('am vorletzten Tag nicht mehr', !!b && !b.schliessbar, b && b.text);

  b = band({ zugriff: 'nur_lesen', saldo: 0, abo: { status: 'abgelaufen' } });
  melde('Lesezugriff wird deutlich gesagt', !!b && /Lesezugriff/.test(b.text));
  melde('und laesst sich nicht wegklicken', !!b && !b.schliessbar);

  b = band({ zugriff: 'gesperrt', saldo: 0, abo: null });
  melde('eine Sperre auch', !!b && /gesperrt/.test(b.text) && !b.schliessbar);

  b = band({ zugriff: 'voll', saldo: 40, credits_knapp: true, abo: { status: 'aktiv' } });
  melde('knappe Credits werden gemeldet', !!b && /40/.test(b.text), b && b.text);

  // Die dringendste Lage gewinnt: wer gesperrt ist, soll nicht lesen, dass
  // seine Credits knapp werden.
  b = band({ zugriff: 'gesperrt', saldo: 5, credits_knapp: true,
             testphase_bis: inTagen(1), abo: { status: 'test' } });
  melde('die dringendste Lage gewinnt', !!b && b.art === 'sperre', b && b.art);

  // Kommentare duerfen den Anteil nennen — er gehoert ja erklaert. Gerechnet
  // werden darf er hier nicht: dann braeuchte diese Datei den Tarif, und den
  // bekommt ein Mitarbeiter mit Absicht nicht zu sehen.
  const ohneKommentare = quelle.replace(/\/\/[^\n]*/g, '');
  melde('das Band rechnet "knapp" nicht selbst',
        !/warnung_rest_prozent|credits_monat/.test(ohneKommentare),
        'der Anteil steht im Katalog und wird in abo-verwalten gerechnet');
}

if (fehler) {
  console.log(`\n  ${fehler} von ${geprueft} Pruefungen gescheitert.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Pruefungen zur Testphase:`);
console.log('       drei Meldungen in verbleibenden Tagen, je einmal, nur an');
console.log('       die Chefs desselben Hauses — und ein Band, das nur dann');
console.log('       erscheint, wenn es etwas zu sagen gibt.');
