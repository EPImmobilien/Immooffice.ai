// Prueft die Storage-Huelle aus src/app/anwendung.js.
//
// Sie stellt jedem Storage-Pfad den Mandanten voran und ist damit die Stelle,
// an der die Mandantentrennung im Dateispeicher haengt. Ein Fehler darin
// faellt im Betrieb nicht auf: die Anwendung laedt weiter Dateien hoch, nur
// eben an der falschen Stelle — oder liest die eines fremden Mandanten.
//
// Geprueft wird gegen einen nachgebauten Client, ohne Netz und ohne Supabase.

const fs = require('fs');
const pfad = require('path');

const quelle = fs.readFileSync(
  pfad.join(__dirname, '..', 'src', 'app', 'anwendung.js'), 'utf8');
const a = quelle.indexOf('// --- Storage: jeder Pfad traegt den Mandanten');
if (a < 0) {
  console.error('[FEHLER] Die Storage-Huelle steht nicht in src/app/anwendung.js. '
    + 'Entweder hat scripts/oberflaeche-zerlegen.py sie nicht eingesetzt, '
    + 'oder die Vorlage hat sich geaendert.');
  process.exit(1);
}
const huelle = quelle.slice(a, quelle.indexOf('})();', a) + 5);

const gerufen = [];
const api = {};
for (const name of ['upload', 'download', 'remove', 'list', 'move', 'copy',
                    'createSignedUrl', 'createSignedUrls', 'getPublicUrl']) {
  api[name] = (...x) => { gerufen.push([name, ...x]); };
}
global.window = { _sb: { storage: { from: () => api } }, IMMO_MANDANT_ID: null };
eval(huelle);

const M = '11111111-2222-3333-4444-555555555555';
const s = () => window._sb.storage.from('x');
let fehler = 0;
const pruefe = (titel, ist, soll) => {
  const gleich = JSON.stringify(ist) === JSON.stringify(soll);
  if (!gleich) fehler++;
  console.log(`  ${gleich ? '[ok]    ' : '[FEHLER]'} ${titel}`);
  if (!gleich) console.log(`           erwartet ${JSON.stringify(soll)}, war ${JSON.stringify(ist)}`);
};

// Ohne Anmeldung bleibt der Pfad unberuehrt: solche Aufrufe scheitern ohnehin
// an der Richtlinie, und ein erfundenes Praefix machte daraus nur einen
// schwerer zu lesenden Fehler.
s().upload('objekt/1/bild.jpg', {});
pruefe('ohne Mandant unveraendert', gerufen.pop()[1], 'objekt/1/bild.jpg');

window.IMMO_MANDANT_ID = M;
s().upload('objekt/1/bild.jpg', {});
pruefe('upload bekommt den Mandanten', gerufen.pop()[1], M + '/objekt/1/bild.jpg');
s().download('a.pdf');
pruefe('download bekommt den Mandanten', gerufen.pop()[1], M + '/a.pdf');
s().remove(['a.jpg', 'b.jpg']);
pruefe('remove auch als Liste', gerufen.pop()[1], [M + '/a.jpg', M + '/b.jpg']);
s().move('alt.jpg', 'neu.jpg');
const mv = gerufen.pop();
pruefe('move beide Pfade', [mv[1], mv[2]], [M + '/alt.jpg', M + '/neu.jpg']);
s().list();
pruefe('list ohne Angabe nimmt den eigenen Ordner', gerufen.pop()[1], M);
s().list('objekt/1');
pruefe('list mit Angabe', gerufen.pop()[1], M + '/objekt/1');
s().getPublicUrl(M + '/schon/da.jpg');
pruefe('schon praefixiert bleibt unveraendert', gerufen.pop()[1], M + '/schon/da.jpg');
s().createSignedUrls(['x.pdf'], 60);
pruefe('createSignedUrls als Liste', gerufen.pop()[1], [M + '/x.pdf']);

if (fehler) {
  console.error(`\n[FEHLER] ${fehler} Pruefung(en) der Storage-Huelle gescheitert.`);
  process.exit(1);
}
console.log(`\n[ok] Die Storage-Huelle stellt jedem Pfad den Mandanten voran.`);
