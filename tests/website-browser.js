// Läuft die Website wirklich — in einem Browser?
//
// tests/website.py liest die Dateien. Das sagt nichts darüber, ob die
// Slideshow blättert, ob etwas über den rechten Rand hängt oder ob beim
// Laden ein Fehler in der Konsole steht. Also: ein winziger Dateiserver,
// Chromium daneben, die Seite in zwei Größen — und dann nachgesehen.
//
// Ohne Chromium wird übersprungen: npm run check muss auf einer Maschine
// ohne Browser durchlaufen.
const fs = require('fs');
const http = require('http');
const path = require('path');

const WURZEL = path.join(__dirname, '..', 'website');

let fehler = 0;
const melde = (t, ok, zusatz) => {
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${t}${zusatz ? ' — ' + zusatz : ''}`);
};

let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = null; }
if (!chromium || !fs.existsSync(WURZEL)) {
  console.log('  Playwright oder website/ fehlt — uebersprungen.');
  process.exit(0);
}

function browserPfad() {
  try {
    const p = chromium.executablePath();
    if (fs.existsSync(p)) return undefined;
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
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

(async () => {
  const exe = browserPfad();
  if (exe === null) {
    console.log('  Kein Chromium gefunden — uebersprungen.');
    process.exit(0);
  }

  const server = http.createServer((anfrage, antwort) => {
    let pfad = decodeURIComponent(anfrage.url.split('?')[0].split('#')[0]);
    if (pfad === '/') pfad = '/index.html';
    const datei = path.normalize(path.join(WURZEL, pfad));
    if (!datei.startsWith(WURZEL) || !fs.existsSync(datei)) {
      antwort.writeHead(404); antwort.end('nein'); return;
    }
    antwort.writeHead(200, { 'Content-Type': MIME[path.extname(datei)] || 'text/plain' });
    fs.createReadStream(datei).pipe(antwort);
  });
  await new Promise((f) => server.listen(0, '127.0.0.1', f));
  const port = server.address().port;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});

  for (const [name, breite, hoehe] of [['Rechner', 1440, 960], ['Telefon', 390, 844]]) {
    const seite = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    const pannen = [];
    seite.on('pageerror', (f) => pannen.push(String(f.message)));
    // Eine Datei, die es nicht gibt, wirft keinen Fehler — der Browser
    // laesst das Bild einfach weg. Genau so hat die Huelle jahrelang sechs
    // Icon-Dateien angefordert, die nie existiert haben, und auf dem
    // Startbildschirm eines iPhones stand ein leeres Kaestchen. Darum wird
    // hier jede Antwort ab 400 gemeldet.
    const fehlend = [];
    seite.on('response', (r) => {
      if (r.status() >= 400) fehlend.push(`${r.status()} ${r.url()}`);
    });
    await seite.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await seite.waitForTimeout(700);

    melde(`${name}: kein Fehler im Browser`, pannen.length === 0, pannen[0]);
    melde(`${name}: jede angeforderte Datei ist da`, fehlend.length === 0,
          fehlend.join(', '));

    // Waagerechtes Scrollen ist auf einer Seite immer ein Fehler — und auf
    // dem Telefon der haeufigste.
    const ueber = await seite.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    melde(`${name}: nichts haengt ueber den rechten Rand`, ueber <= 2, `${ueber} px`);

    // Die Slideshow muss blaettern.
    const vorher = await seite.evaluate(() => getComputedStyle(document.querySelector('.band')).transform);
    await seite.click('[data-vor]');
    await seite.waitForTimeout(900);
    const nachher = await seite.evaluate(() => getComputedStyle(document.querySelector('.band')).transform);
    melde(`${name}: die Slideshow blaettert`, vorher !== nachher, `${vorher} -> ${nachher}`);
    const zaehler = await seite.textContent('.schau .zaehler');
    melde(`${name}: der Zaehler zaehlt mit`, /02\s*\/\s*04/.test(zaehler || ''), zaehler);

    // Die Abschnitte muessen erscheinen, nicht unsichtbar bleiben.
    await seite.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await seite.waitForTimeout(900);
    const unsichtbar = await seite.evaluate(() =>
      Array.from(document.querySelectorAll('.auf')).filter((e) => !e.classList.contains('da')).length);
    melde(`${name}: alle Abschnitte erscheinen`, unsichtbar === 0, `${unsichtbar} blieben aus`);

    // Und der Weg in die Anwendung muss stimmen.
    const ziele = await seite.evaluate(() =>
      ['anmelden-oben', 'anmelden-buehne', 'anmelden-unten', 'anmelden-fuss']
        .map((id) => (document.getElementById(id) || {}).href || ''));
    const soll = await seite.evaluate(() => (window.IMMO_WEB || {}).anwendung);
    // Der Browser loest href auf und haengt dabei einen Schraegstrich an —
    // deshalb ohne vergleichen.
    const ohneStrich = (u) => String(u).replace(/\/+$/, "");
    melde(`${name}: alle vier Anmelde-Knoepfe fuehren zur Anwendung`,
          ziele.length === 4 && ziele.every((z) => ohneStrich(z) === ohneStrich(soll)),
          JSON.stringify(ziele));

    await seite.close();
  }

  // Die beiden Rechtsseiten muessen auch laden.
  for (const datei of ['impressum.html', 'datenschutz.html']) {
    const seite = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const pannen = [];
    seite.on('pageerror', (f) => pannen.push(String(f.message)));
    const antwort = await seite.goto(`http://127.0.0.1:${port}/${datei}`, { waitUntil: 'load' });
    melde(`${datei} wird ausgeliefert`, antwort && antwort.status() === 200);
    melde(`${datei}: kein Fehler im Browser`, pannen.length === 0, pannen[0]);
    // Solange nichts hinterlegt ist, MUSS der Hinweis stehen — eine Seite,
    // die ein leeres Impressum stillschweigend zeigt, waere schlimmer.
    const text = await seite.textContent('body');
    const offen = await seite.evaluate(() => {
      const k = window.IMMO_WEB || {};
      return ['firma', 'strasse', 'plz_ort', 'vertreten_durch', 'email', 'telefon']
        .filter((f) => !k[f]).length;
    });
    if (offen && datei === 'impressum.html') {
      melde('impressum.html sagt, dass Angaben fehlen',
            /nicht vollständig|noch nicht hinterlegt/.test(text || ''));
    }
    await seite.close();
  }

  await browser.close();
  server.close();

  if (fehler) {
    console.log(`\n  ${fehler} Pruefung(en) gescheitert.`);
    process.exit(1);
  }
  console.log('  [ok] Die Website laeuft im Browser: kein Fehler, kein Ueberlauf,');
  console.log('       die Slideshow blaettert, die Abschnitte erscheinen, und alle');
  console.log('       vier Anmelde-Knoepfe fuehren zur Anwendung.');
})();
