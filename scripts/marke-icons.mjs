// Rastert die Bildmarke zu den PNG-Icons, die src/huelle/ anfordert.
//
// Aufgerufen von scripts/marke-aufbereiten.py --icons, Auftrag als JSON auf
// der Standardeingabe. Einmalig: das Ergebnis liegt als Datei im Repository,
// kein Bauschritt und kein Gate braucht Chromium.
//
// Warum ueberhaupt: die Huelle verweist seit jeher auf /icons/favicon-32.png
// und fuenf apple-touch-icon-Dateien. Keine davon hat je existiert — jeder
// Aufruf lief ins Leere, und auf dem Startbildschirm eines iPhones stand ein
// leeres Kaestchen. Mit der gelieferten Marke gibt es endlich etwas zu zeigen.
import fs from 'node:fs';
import path from 'node:path';

function chromiumSuchen(chromium) {
  try { if (fs.existsSync(chromium.executablePath())) return undefined; } catch { /* weiter */ }
  const topf = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(topf)) return null;
  for (const o of fs.readdirSync(topf).filter((d) => d.startsWith('chromium-'))) {
    for (const u of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
      const p = path.join(topf, o, u);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const auftrag = JSON.parse(fs.readFileSync(0, 'utf8'));
const { chromium } = await import('playwright-core');
const exe = chromiumSuchen(chromium);
if (exe === null) {
  console.log('  Kein Chromium — Icons bleiben, wie sie sind.');
  process.exit(0);
}

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
for (const [name, groesse, svg] of auftrag.icons) {
  const seite = await browser.newPage({
    viewport: { width: groesse, height: groesse },
    deviceScaleFactor: 1,
  });
  // Volle Flaeche, keine abgerundeten Ecken: iOS und Android runden selbst,
  // und ein zweites Mal gerundet sieht aus wie ein Fehler. Die Marke sitzt
  // auf 72 % der Kante, damit sie beim Beschnitt der Systeme ganz bleibt.
  await seite.setContent(`<html><body style="margin:0;width:${groesse}px;
    height:${groesse}px;background:${auftrag.grund};display:flex;
    align-items:center;justify-content:center">
    <div style="width:72%">${svg
      .replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, '')}</div>
    </body></html>`);
  await seite.screenshot({ path: path.join(auftrag.ziel, name), omitBackground: false });
  await seite.close();
  console.log(`  ${name.padEnd(30)} ${groesse}x${groesse}`);
}
await browser.close();
