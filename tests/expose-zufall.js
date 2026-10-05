// Liefert der nachgebaute Mersenne-Twister dieselbe Folge wie Python?
//
// Zwei Prototypen streuen Platzhaltergrafik mit random.Random(saat). Die
// Saat ist eine Zahl, die Folge also Teil der verbindlichen Vorlage.
// Weicht sie ab, steht jeder Baum und jedes Haeuserblock-Rechteck an einer
// anderen Stelle — und der Vergleich gegen die Prototypen muesste fuer ein
// Drittel aller Zeichenschritte aussetzen.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'packages', 'expose-renderer', 'src', 'zufall.ts');

// Die Saaten der Prototypen: Studio nimmt 3 und seine Skyline-Saat,
// Signature int(w + h) des Bildrahmens. Dazu Randfaelle.
const SAATEN = [0, 1, 2, 3, 7, 42, 123, 624, 625, 1000, 1234567, 0x7fffffff,
                520, 595, 841, 1437, 2147483648, 4294967296, 4294967297];
const ANZAHL = 40;

const soll = JSON.parse(execFileSync('python3', ['-c', `
import json, random
saaten = ${JSON.stringify(SAATEN)}
raus = {}
for s in saaten:
    r = random.Random(s)
    raus[str(s)] = {
        "zahl": [r.random() for _ in range(${ANZAHL})],
    }
    r2 = random.Random(s)
    raus[str(s)]["wort"] = [r2.getrandbits(32) for _ in range(${ANZAHL})]
print(json.dumps(raus))
`], { encoding: 'utf-8', maxBuffer: 16 << 20 }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-zufall-'));
execFileSync('tsc', [QUELLE, '--outDir', tmp, '--module', 'commonjs',
                     '--target', 'es2020', '--skipLibCheck'],
             { stdio: 'pipe', cwd: os.tmpdir() });
const { Zufall } = require(path.join(tmp, 'zufall.js'));

let fehler = 0, geprueft = 0;
for (const [saat, erwartet] of Object.entries(soll)) {
  const z = new Zufall(Number(saat));
  for (let i = 0; i < ANZAHL; i++) {
    geprueft++;
    const ist = z.zahl();
    if (ist !== erwartet.zahl[i]) {
      fehler++;
      if (fehler <= 5) {
        console.log(`  [FEHLER] Saat ${saat}, random() Nr. ${i}: ` +
                    `soll ${erwartet.zahl[i]}, ist ${ist}`);
      }
    }
  }
  const z2 = new Zufall(Number(saat));
  for (let i = 0; i < ANZAHL; i++) {
    geprueft++;
    const ist = z2.wort();
    if (ist !== erwartet.wort[i]) {
      fehler++;
      if (fehler <= 5) {
        console.log(`  [FEHLER] Saat ${saat}, getrandbits(32) Nr. ${i}: ` +
                    `soll ${erwartet.wort[i]}, ist ${ist}`);
      }
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
if (fehler) {
  console.log(`\n  ${fehler} von ${geprueft} Werten weichen von Python ab.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Zufallswerte stimmen mit Pythons random.Random ueberein`);
console.log(`       (${SAATEN.length} Saaten, random() und getrandbits(32)).`);
