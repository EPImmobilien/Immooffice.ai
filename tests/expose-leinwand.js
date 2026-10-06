// Malt die Bearbeitungsflaeche wirklich eine Seite — in einem Browser?
//
// src/eigene/expose-leinwand.js ist die einzige Stelle des Forks, die ohne
// Browser nicht laeuft: sie braucht ein Canvas, eine Schriftart als
// FontFace und einen Zeichenkontext. Alle anderen Tests kommen mit einem
// nachgebauten React aus; dieser nicht. Ohne ihn waere der Satz "die
// Flaeche zeigt dieselbe Seite wie das PDF" eine Behauptung.
//
// Also: ein winziger Dateiserver, Chromium daneben, die drei Vorlagen
// gezeichnet — und danach wird nachgesehen, ob auf dem Blatt wirklich
// Farbe liegt und ob die Schrift die eingebettete ist und nicht die
// Ersatzschrift des Systems.
//
// Ohne Chromium wird uebersprungen: npm run check muss auf einer Maschine
// ohne Browser durchlaufen.
const fs = require('fs');
const http = require('http');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');
const BUENDEL = path.join(WURZEL, 'packages', 'expose-renderer', 'buendel', 'immo-expose.js');

let fehler = 0;
const melde = (t, ok, zusatz) => {
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${t}${zusatz ? ' — ' + zusatz : ''}`);
};

let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = null; }
if (!chromium || !fs.existsSync(BUENDEL)) {
  console.log('  Playwright oder das Buendel fehlt — uebersprungen.');
  process.exit(0);
}

// Playwright sucht den Browser an einem festen Ort. Steht er woanders
// (die Arbeitsumgebung legt ihn nach /opt/pw-browsers), wird er gesucht.
function browserPfad() {
  try {
    const p = chromium.executablePath();
    if (fs.existsSync(p)) return undefined;    // Vorgabe passt
  } catch (e) { /* weiter unten */ }
  const topf = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(topf)) return null;
  for (const ordner of fs.readdirSync(topf).filter((d) => d.startsWith('chromium-'))) {
    for (const unter of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
      const p = path.join(topf, ordner, unter);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.ttf': 'font/ttf',
};

const SEITE = fs.readFileSync(path.join(__dirname, 'expose-leinwand.html'), 'utf-8');

(async () => {
  const exe = browserPfad();
  if (exe === null) {
    console.log('  Kein Chromium gefunden — uebersprungen.');
    process.exit(0);
  }

  const server = http.createServer((anfrage, antwort) => {
    const pfad = decodeURIComponent(anfrage.url.split('?')[0].split('#')[0]);
    if (pfad === '/probe.html') {
      antwort.writeHead(200, { 'Content-Type': MIME['.html'] });
      antwort.end(SEITE);
      return;
    }
    // Nur lesen, nur innerhalb des Repositorys.
    const datei = path.normalize(path.join(WURZEL, pfad));
    if (!datei.startsWith(WURZEL) || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) {
      antwort.writeHead(404); antwort.end('nein');
      return;
    }
    antwort.writeHead(200, { 'Content-Type': MIME[path.extname(datei)] || 'application/octet-stream' });
    fs.createReadStream(datei).pipe(antwort);
  });
  await new Promise((fertig) => server.listen(0, '127.0.0.1', fertig));
  const port = server.address().port;

  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const namen = fs.readdirSync(VORLAGEN)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json')
    .map((f) => f.replace(/\.json$/, ''));

  for (const name of namen) {
    const seite = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const pannen = [];
    seite.on('pageerror', (f) => pannen.push(String(f.message)));
    await seite.goto(`http://127.0.0.1:${port}/probe.html#${name}`, { waitUntil: 'load' });
    await seite.waitForFunction(() => window.__fertig === true || window.__fehler, null,
                                { timeout: 30000 }).catch(() => {});
    const befund = await seite.evaluate(() => window.__befund || null);
    const gemeldet = await seite.evaluate(() => window.__fehler || '');
    melde(`${name}: die Flaeche zeichnet ohne Fehler`, !!befund && !gemeldet,
          gemeldet || 'kein Befund');
    melde(`${name}: kein Fehler im Browser`, pannen.length === 0, pannen[0]);
    if (befund) {
      melde(`${name}: es entstehen Seiten`, befund.seiten > 0, String(befund.seiten));
      melde(`${name}: auf dem Blatt liegt Farbe`, befund.bunt > 2000,
            `${befund.bunt} farbige Bildpunkte`);
      // Die eingebettete Schrift misst anders als die Ersatzschrift des
      // Systems. Stimmen beide Breiten ueberein, wurde sie nicht benutzt.
      melde(`${name}: die eingebettete Schrift wird benutzt`, befund.schriftOk,
            `${befund.breiteEigen} gegen ${befund.breiteErsatz}`);
    }
    await seite.close();
  }

  await browser.close();
  server.close();

  if (fehler) {
    console.log(`\n  ${fehler} Pruefung(en) gescheitert.`);
    process.exit(1);
  }
  console.log('  [ok] Die Bearbeitungsflaeche malt alle drei Vorlagen im Browser:');
  console.log('       Farbe auf dem Blatt, eingebettete Schriften, keine Fehler.');
})();
