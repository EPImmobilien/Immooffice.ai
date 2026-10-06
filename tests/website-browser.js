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

    // Der Modul-Katalog. 27 Bereiche sind das Alleinstellungsmerkmal — wenn
    // der Filter sie versteckt und nicht wiederbringt, ist das Gegenteil
    // erreicht. Geprueft wird deshalb beides: dass er filtert UND dass
    // "Alle Bereiche" alles zurueckholt.
    const katalog = await seite.evaluate(() => ({
      module: document.querySelectorAll('.modul[data-gruppe]').length,
      chips: document.querySelectorAll('.chip[data-filter]').length,
      punkte: Array.from(document.querySelectorAll('.modul li')).length,
      ohneListe: Array.from(document.querySelectorAll('.modul'))
        .filter((m) => m.querySelectorAll('li').length === 0).length,
    }));
    melde(`${name}: der Modul-Katalog ist vollstaendig`, katalog.module >= 20,
          `${katalog.module} Bereiche`);
    melde(`${name}: jeder Bereich nennt konkrete Funktionen`, katalog.ohneListe === 0,
          `${katalog.ohneListe} ohne Liste`);
    melde(`${name}: es gibt Filterknoepfe`, katalog.chips >= 5, String(katalog.chips));

    if (katalog.chips) {
      await seite.click('.chip[data-filter="vermarktung"]');
      await seite.waitForTimeout(150);
      const gefiltert = await seite.evaluate(() => ({
        sichtbar: Array.from(document.querySelectorAll('.modul')).filter((m) => !m.hasAttribute('hidden')).length,
        alleGleich: Array.from(document.querySelectorAll('.modul:not([hidden])'))
          .every((m) => m.dataset.gruppe === 'vermarktung'),
      }));
      melde(`${name}: der Filter blendet aus`,
            gefiltert.sichtbar > 0 && gefiltert.sichtbar < katalog.module,
            `${gefiltert.sichtbar} von ${katalog.module}`);
      melde(`${name}: und zeigt nur die gewaehlte Gruppe`, gefiltert.alleGleich);

      await seite.click('.chip[data-filter="alle"]');
      await seite.waitForTimeout(150);
      const zurueck = await seite.evaluate(() =>
        Array.from(document.querySelectorAll('.modul')).filter((m) => !m.hasAttribute('hidden')).length);
      melde(`${name}: "Alle Bereiche" holt alles zurueck`, zurueck === katalog.module,
            `${zurueck} von ${katalog.module}`);
    }

    // Der Katalog auf dem Telefon. Am 06.10.2026 war er dort 9946 px hoch —
    // knapp zwoelf Bildschirmhoehen, mehr als die halbe Seite — und die
    // Filterleiste brach in vier Zeilen um. Rueckmeldung des Betreibers:
    // „auf der Mobilversion ist das jetzt aber sehr unübersichtlich".
    // Deshalb stehen die Zahlen hier: sie sind die Beschwerde in Zahlen.
    if (breite < 720) {
      const schmal = await seite.evaluate(() => ({
        hoehe: Math.round(document.querySelector('#module-katalog').getBoundingClientRect().height),
        chipsHoehe: Math.round(document.querySelector('.chips').getBoundingClientRect().height),
        offen: document.querySelectorAll('.modul[open]').length,
        zahlen: document.querySelectorAll('.modul .anzahl').length,
      }));
      melde(`${name}: der Katalog passt in wenige Bildschirme`,
            schmal.hoehe < hoehe * 4, `${schmal.hoehe} px bei ${hoehe} px Fenster`);
      melde(`${name}: die Filterleiste ist EINE Zeile`, schmal.chipsHoehe < 70,
            `${schmal.chipsHoehe} px`);
      melde(`${name}: die Bereiche starten zugeklappt`, schmal.offen === 0,
            `${schmal.offen} offen`);
      melde(`${name}: jede Zeile sagt, wie viel dahintersteckt`,
            schmal.zahlen === katalog.module, `${schmal.zahlen} Zahlen`);

      // Und sie muessen sich auch oeffnen lassen — eine Liste, die nur
      // zuklappt, waere schlimmer als gar keine.
      await seite.click('.modul:nth-of-type(2) > summary');
      await seite.waitForTimeout(250);
      const geoeffnet = await seite.evaluate(() => {
        const m = document.querySelectorAll('.modul')[1];
        const li = m.querySelector('li');
        return {
          offen: m.hasAttribute('open'),
          punktSichtbar: !!(li && li.getBoundingClientRect().height > 0),
        };
      });
      melde(`${name}: ein Tipp klappt den Bereich auf`, geoeffnet.offen);
      melde(`${name}: und die Funktionen werden sichtbar`, geoeffnet.punktSichtbar);
    } else {
      // Breit soll NICHTS zugeklappt sein: dort ist Platz, und ein Klick,
      // der nichts bringt, ist ein Klick zu viel.
      const zu = await seite.evaluate(() =>
        document.querySelectorAll('.modul:not([open])').length);
      melde(`${name}: breit steht alles offen`, zu === 0, `${zu} zugeklappt`);
    }

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
