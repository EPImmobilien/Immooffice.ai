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

// Der Preisbereich holt seinen Stand aus `tarife-oeffentlich`. Hier wird die
// Anfrage abgefangen und mit ABSICHTLICH anderen Zahlen beantwortet als im
// HTML stehen: nur so zeigt sich, ob die Seite wirklich den Katalog nimmt
// und nicht die Rueckfallwerte. Ausserdem geht so keine Anfrage aus dem Test
// ins Netz — der Proxy dieser Maschine laesst Supabase ohnehin nicht durch.
const PREIS_STAND = {
  ok: true, stand: '2026-10-06T12:00:00.000Z', waehrung: 'EUR', ust_prozent: 19,
  tarife: [
    { schluessel: 'starter', name: 'Starter', hinweis: 'Pruefhinweis A',
      preis_monat_cent: 4444, preis_jahr_cent: 44444, inkl_nutzer: 1,
      credits_monat: 555, merkmale: ['Pruefmerkmal eins', 'Pruefmerkmal zwei'] },
    { schluessel: 'professional', name: 'Professional', hinweis: 'Pruefhinweis B',
      preis_monat_cent: 11111, preis_jahr_cent: 111111, inkl_nutzer: 3,
      credits_monat: 1555, merkmale: ['Pruefmerkmal drei'] },
    { schluessel: 'business', name: 'Business', hinweis: 'Pruefhinweis C',
      preis_monat_cent: 22222, preis_jahr_cent: 222222, inkl_nutzer: 8,
      credits_monat: 3555, merkmale: ['Pruefmerkmal vier'] },
  ],
  zusatznutzer: { schluessel: 'zusatznutzer', name: 'Zusatznutzer',
    preis_monat_cent: 1111, preis_jahr_cent: 11111 },
  credit_pakete: [{ schluessel: 'pruef_250', name: '250 Credits', credits: 250,
    preis_cent: 777, gueltig_monate: 12 }],
  credit_preise: [{ aktion: 'pruef_aktion', name: 'Pruefaktion', credits: 7,
    beschreibung: 'nur fuer den Test' }],
  testphase_tage: 28, testphase_credits: 300, mindestlaufzeit_monate: 6,
  gruender: { plaetze: 50, frei: 37, rabatt_cent: 1000, tarif: 'starter' },
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
    let standGefragt = 0;
    await seite.route('**/tarife-oeffentlich*', (weg) => {
      standGefragt++;
      weg.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify(PREIS_STAND) });
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

    // --- Der Preisbereich -------------------------------------------------
    // Zwei Dinge sind hier entscheidend, und beide sind schon einmal an
    // anderen Stellen schiefgegangen: dass die Seite den KATALOG zeigt und
    // nicht die Zahlen aus dem HTML, und dass der Umschalter rechnet statt
    // Text zu tauschen.
    melde(`${name}: der Preisstand wurde geholt`, standGefragt === 1,
          `${standGefragt} Anfragen`);
    const preise = await seite.evaluate(() => {
      const w = document.querySelector('[data-preise]');
      const karte = w.querySelector('[data-tarif="starter"]');
      return {
        betrag: karte.querySelector('[data-betrag]').textContent.trim(),
        takt: karte.querySelector('[data-taktwort]').textContent.trim(),
        zweit: karte.querySelector('[data-zweitpreis]').textContent.trim(),
        credits: karte.querySelector('[data-credits]').textContent.trim(),
        hinweis: karte.querySelector('[data-hinweis]').textContent.trim(),
        merkmale: Array.from(karte.querySelectorAll('[data-merkmale] li')).map((l) => l.textContent.trim()),
        zusatz: w.querySelector('[data-zusatznutzer] [data-betrag]').textContent.trim(),
        paket: w.querySelector('.paketliste li').textContent.trim(),
        tabelle: w.querySelector('[data-credittabelle] tbody').textContent.trim(),
        gruenderOffen: !w.querySelector('[data-gruender]').hidden,
        gruenderFrei: w.querySelector('[data-gruender-frei]').textContent.trim(),
        fuss: w.querySelector('[data-preisfuss]').textContent.replace(/\s+/g, ' ').trim(),
        cta: karte.querySelector('[data-cta]').getAttribute('href'),
      };
    });
    melde(`${name}: der Betrag kommt aus dem Katalog`, preise.betrag === '44,44',
          preise.betrag);
    melde(`${name}: und auch Nutzerzahl, Credits und Merkmale`,
          preise.credits === '555' && preise.hinweis === 'Pruefhinweis A'
          && preise.merkmale.join('|') === 'Pruefmerkmal eins|Pruefmerkmal zwei',
          JSON.stringify([preise.credits, preise.hinweis, preise.merkmale]));
    melde(`${name}: der Zusatznutzer auch`, preise.zusatz === '11,11', preise.zusatz);
    melde(`${name}: die Credit-Pakete auch`, /250 Credits/.test(preise.paket)
          && /7,77/.test(preise.paket), preise.paket);
    melde(`${name}: die Credit-Tabelle auch`, /Pruefaktion/.test(preise.tabelle),
          preise.tabelle.slice(0, 60));
    melde(`${name}: die Fristen stehen in der Fusszeile`,
          /19 % USt/.test(preise.fuss) && /6 Monate/.test(preise.fuss)
          && /28 Tage/.test(preise.fuss) && /300/.test(preise.fuss), preise.fuss);
    melde(`${name}: der Gruenderzaehler zeigt die freien Plaetze`,
          preise.gruenderOffen && preise.gruenderFrei === '37',
          `${preise.gruenderOffen} / ${preise.gruenderFrei}`);
    melde(`${name}: der Knopf nimmt Tarif und Takt mit`,
          /tarif=starter/.test(preise.cta) && /intervall=monat/.test(preise.cta),
          preise.cta);
    // 44444 statt 12 x 4444 = 53328 — das sind 16 %, abgerundet.
    melde(`${name}: der Jahresvorteil ist gerechnet, nicht behauptet`,
          /spart 16 %/.test(preise.zweit), preise.zweit);

    await seite.click('[data-takt="jahr"]');
    await seite.waitForTimeout(150);
    const jahr = await seite.evaluate(() => {
      const karte = document.querySelector('[data-tarif="starter"]');
      return {
        betrag: karte.querySelector('[data-betrag]').textContent.trim(),
        takt: karte.querySelector('[data-taktwort]').textContent.trim(),
        zweit: karte.querySelector('[data-zweitpreis]').textContent.trim(),
        cta: karte.querySelector('[data-cta]').getAttribute('href'),
      };
    });
    melde(`${name}: der Umschalter zeigt den Jahrespreis`,
          jahr.betrag === '444,44' && /Jahr/.test(jahr.takt),
          `${jahr.betrag} ${jahr.takt}`);
    melde(`${name}: und rechnet den Monatswert dazu`,
          /entspricht 37,04/.test(jahr.zweit), jahr.zweit);
    melde(`${name}: der Knopf merkt sich den Takt`, /intervall=jahr/.test(jahr.cta),
          jahr.cta);
    await seite.click('[data-takt="monat"]');
    await seite.waitForTimeout(120);

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

  // Das engste Telefon, das noch zaehlt: 375 px (iPhone SE, iPhone 13 mini).
  // Dort bricht ein Preisgitter zuerst — drei Karten nebeneinander haetten
  // je 110 px. Geprueft wird deshalb genau das: untereinander, die
  // empfohlene oben, der Umschalter in EINER Zeile, nichts ueber dem Rand.
  {
    const seite = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await seite.route('**/tarife-oeffentlich*', (weg) => weg.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(PREIS_STAND) }));
    const pannen = [];
    seite.on('pageerror', (f) => pannen.push(String(f.message)));
    await seite.goto(`http://127.0.0.1:${port}/#preise`, { waitUntil: 'load' });
    await seite.waitForTimeout(700);
    melde('375 px: kein Fehler im Browser', pannen.length === 0, pannen[0]);
    const eng = await seite.evaluate(() => {
      const w = document.querySelector('[data-preise]');
      const karten = Array.from(w.querySelectorAll('[data-tarif]'));
      const kaesten = karten.map((k) => k.getBoundingClientRect());
      return {
        ueber: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // Nach Lage sortiert, nicht nach Reihenfolge im HTML: die
        // empfohlene Karte wird per CSS nach oben gezogen.
        untereinander: kaesten.slice().sort((a, b) => a.top - b.top)
          .every((k, i, f) => i === 0 || k.top >= f[i - 1].bottom - 1),
        empfohlenOben: karten.length > 1
          && karten.find((k) => k.classList.contains('empfohlen')).getBoundingClientRect().top
             === Math.min(...kaesten.map((k) => k.top)),
        taktHoehe: Math.round(w.querySelector('.takt').getBoundingClientRect().height),
        breiteste: Math.max(...kaesten.map((k) => Math.round(k.width))),
        tabelleUeber: (() => {
          const t = w.querySelector('.credittabelle');
          return t ? Math.round(t.scrollWidth - t.clientWidth) : 0;
        })(),
      };
    });
    melde('375 px: nichts haengt ueber den rechten Rand', eng.ueber <= 2, `${eng.ueber} px`);
    melde('375 px: die Tarife stehen untereinander', eng.untereinander);
    melde('375 px: die empfohlene Karte steht oben', eng.empfohlenOben);
    melde('375 px: der Umschalter bleibt zweizeilig oder knapper',
          eng.taktHoehe < 110, `${eng.taktHoehe} px`);
    melde('375 px: die Karten passen in die Bahn', eng.breiteste <= 375 - 40,
          `${eng.breiteste} px`);
    // Die Credit-Tabelle ist das einzige breite Element im Abschnitt. Haengt
    // sie ueber, scrollt die ganze Seite waagerecht — und das faellt oben
    // schon auf; hier steht, WORAN es lag.
    melde('375 px: die Credit-Tabelle passt', eng.tabelleUeber <= 2,
          `${eng.tabelleUeber} px zu breit`);
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
