// Kommt wirklich nichts Personenbezogenes beim KI-Anbieter an?
//
// mail-stil-lernen liest die zuletzt versendeten Mails eines Nutzers und
// leitet daraus seinen Schreibstil ab. Diese Mails stecken voller Daten
// Dritter: Namen, Anschriften, Telefonnummern, Kaufpreise. Für einen
// SCHREIBSTIL braucht man nichts davon — und deshalb geht nichts davon
// hinaus.
//
// Die Schwärzung ist die eine Stelle, an der das entschieden wird. Wenn
// hier eine Nummer durchrutscht, geht sie an einen Anbieter, und zwar
// unbemerkt: man sieht einem Stilprofil nicht an, woraus es entstanden ist.
// Also wird sie Zeile für Zeile geprüft.
//
// Dazu die Absichten aus stil.ts: dass es sie gibt, dass jede eine
// Anweisung trägt, und dass die beiden Absagen keinen Grund nennen lassen —
// eine begründete Absage kann ein Indiz nach dem Allgemeinen
// Gleichbehandlungsgesetz sein.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-stil-'));

let fehler = 0;
let geprueft = 0;
const melde = (t, ok, zusatz) => {
  geprueft++;
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${t}${zusatz ? ' — ' + zusatz : ''}`);
};

function uebersetzen(quelldatei, name) {
  const quelle = path.join(tmp, name + '.ts');
  let text = fs.readFileSync(quelldatei, 'utf-8');
  text = text.replace(/^import\s+"jsr:[^"]*";\s*$/gm, '')
    .replace(/^import\s*\{([^}]*)\}\s*from\s*"jsr:[^"]*";\s*$/gm,
             (_m, namen) => `declare const ${namen.trim()}: any;`);
  if (!/declare const Deno/.test(text)) text = 'declare const Deno: any;\n' + text;
  fs.writeFileSync(quelle, text, 'utf-8');
  const ziel = path.join(tmp, 'js');
  try {
    execFileSync('tsc', [quelle, '--outDir', ziel, '--module', 'commonjs',
                         '--target', 'es2022', '--skipLibCheck', '--esModuleInterop',
                         '--lib', 'es2022,dom'], { stdio: 'pipe', cwd: os.tmpdir() });
  } catch (f) {
    if (!fs.existsSync(path.join(ziel, name + '.js'))) {
      console.log('  [FEHLER] tsc hat nichts geschrieben.');
      console.log(String((f.stdout || '') + (f.stderr || '')).slice(0, 1200));
      process.exit(1);
    }
  }
  return path.join(ziel, name + '.js');
}

globalThis.Deno = { env: { get: () => '' }, serve: () => {} };
globalThis.createClient = () => ({});

const lernen = require(uebersetzen(
  path.join(WURZEL, 'supabase', 'eigene', 'mail-stil-lernen', 'index.ts'), 'lernen'));
const stil = require(uebersetzen(
  path.join(WURZEL, 'supabase', 'eigene-beilagen', 'mail-ki-vorschlag', 'stil.ts'), 'stil'));

const { schwaerzen, EINWILLIGUNG_TEXT } = lernen;
const { ABSICHTEN, absichtBlock, NEUTRALER_STIL, stilProfil } = stil;

// --- 1. Was weg muss, ist weg ---------------------------------------------
// Links das, was in einer echten Maklermail steht, rechts das, was danach
// nicht mehr dastehen darf.
const WEG = [
  ['E-Mail', 'Melden Sie sich bei maria.schulz@beispiel-makler.de.', 'maria.schulz@beispiel-makler.de'],
  ['Link', 'Hier entlang: https://portal.example/objekt/4711?t=abc', 'portal.example'],
  ['Mobilnummer', 'Erreichbar unter 0171/9876543 jederzeit.', '9876543'],
  ['Festnetz mit Vorwahl', 'Rufen Sie 0421 55 44 33 22 an.', '55 44 33'],
  ['Nummer international', 'Oder +49 421 5544332 versuchen.', '5544332'],
  ['Kaufpreis', 'Der Kaufpreis liegt bei 349.000,00 €.', '349.000'],
  ['Betrag klein', 'Das Hausgeld beträgt 285 EUR monatlich.', '285 EUR'],
  ['PLZ und Ort', 'Das Objekt liegt in 28195 Bremen zentral.', '28195'],
  ['Anschrift', 'Die Adresse lautet Lindenallee 14a im Hinterhof.', 'Lindenallee'],
  ['Datum', 'Wir sehen uns am 24.04.2026 wie besprochen.', '24.04.2026'],
  ['Uhrzeit', 'Der Termin ist um 9:30 Uhr angesetzt.', '9:30'],
  ['IBAN', 'Bitte auf DE02 1203 0000 0000 2020 51 überweisen.', 'DE02'],
  ['Nachname nach Anrede', 'Sehr geehrter Herr Brinkmann, vielen Dank.', 'Brinkmann'],
  ['Objektnummer', 'Es geht um Objekt-Nr. 4711/2026 aus dem Bestand.', '4711'],
  ['lange Ziffernfolge', 'Die Flurstücknummer lautet 123456 im Plan.', '123456'],
];
for (const [was, satz, darfNichtMehr] of WEG) {
  const roh = schwaerzen(satz);
  melde(`Geschwärzt: ${was}`, !roh.includes(darfNichtMehr),
        `"${darfNichtMehr}" steht noch in "${roh}"`);
}

// --- 2. Was bleiben MUSS ---------------------------------------------------
// Die Schwärzung darf nicht den Stil mitnehmen. Genau dafür ist sie da.
const BLEIBT = [
  ['Anredeform', 'Sehr geehrter Herr Brinkmann, vielen Dank für Ihre Anfrage!', 'Sehr geehrter Herr'],
  ['Grußformel', 'Mit freundlichen Grüßen aus dem Büro', 'Mit freundlichen Grüßen'],
  ['Wendung', 'Gerne können wir das telefonisch klären.', 'Gerne können wir'],
  ['Ausrufezeichen', 'Vielen Dank für Ihre Rückmeldung!', '!'],
  ['Duzen', 'Moin, passt das bei dir?', 'Moin'],
];
for (const [was, satz, mussBleiben] of BLEIBT) {
  melde(`Bleibt erhalten: ${was}`, schwaerzen(satz).includes(mussBleiben),
        `"${mussBleiben}" fehlt in "${schwaerzen(satz)}"`);
}

// --- 3. Zitat und Signatur fallen weg --------------------------------------
{
  const mail = [
    'Hallo Frau Meier,',
    '',
    'das passt so. Gerne bis Freitag!',
    '',
    'Mit freundlichen Grüßen',
    '',
    '--',
    'Maria Schulz, Musterhaus Immobilien, Tel. 0421 123456',
    '',
    'Von: interessent@beispiel.test',
    'Ich hätte da noch eine Frage zum Hausgeld von 285 EUR.',
  ].join('\n');
  const roh = schwaerzen(mail);
  melde('Der Signaturblock fällt weg', !/Musterhaus Immobilien/.test(roh), roh);
  melde('Die zitierte Vorgängermail fällt weg', !/noch eine Frage/.test(roh), roh);
  melde('Der eigene Text bleibt', /Gerne bis Freitag/.test(roh), roh);
}

{
  const mail = ['Kurz bestätigt, danke!', '', 'Am 03.10.2026 schrieb Herr Meier:',
                '> Passt der Termin am 05.10. um 14:00?'].join('\n');
  const roh = schwaerzen(mail);
  melde('Auch "Am … schrieb" trennt ab', !/Passt der Termin/.test(roh), roh);
}

// --- 4. Eine ganze Mail: nichts Personenbezogenes mehr drin ----------------
{
  const mail = [
    'Sehr geehrte Frau Dr. Schulz,',
    '',
    'vielen Dank für Ihre Anfrage zu Objekt-Nr. 4711 in der Lindenallee 14a,',
    '28195 Bremen. Der Kaufpreis beträgt 349.000,00 €, das Hausgeld 285 EUR.',
    '',
    'Gerne zeige ich Ihnen die Wohnung am 24.04.2026 um 9:30 Uhr. Melden Sie',
    'sich unter 0171/9876543 oder maria.schulz@beispiel-makler.de.',
    '',
    'Mit freundlichen Grüßen',
  ].join('\n');
  const roh = schwaerzen(mail);
  const verboten = ['Schulz', '4711', 'Lindenallee', '28195', 'Bremen', '349.000',
                    '285 EUR', '24.04.2026', '9:30', '9876543', 'beispiel-makler.de'];
  const durch = verboten.filter((v) => roh.includes(v));
  melde('Eine vollständige Mail enthält danach nichts Personenbezogenes mehr',
        durch.length === 0, durch.join(', ') + ' in: ' + roh);
  melde('Und der Stil ist trotzdem noch erkennbar',
        /Sehr geehrte Frau/.test(roh) && /Gerne zeige ich/.test(roh)
          && /Mit freundlichen Grüßen/.test(roh), roh);
}

// --- 5. Die Einwilligung ---------------------------------------------------
{
  melde('Der Einwilligungstext sagt, was ausgewertet wird',
        /versendete[n]? E-Mails/i.test(EINWILLIGUNG_TEXT));
  melde('Er sagt, dass geschwärzt wird',
        /unkenntlich gemacht/i.test(EINWILLIGUNG_TEXT));
  melde('Er sagt, dass nur das Profil gespeichert wird',
        /nur das abgeleitete Stilprofil/i.test(EINWILLIGUNG_TEXT));
  melde('Er nennt den Widerruf (Art. 7 Abs. 3 DSGVO)',
        /jederzeit[\s\S]{0,60}widerrufen/i.test(EINWILLIGUNG_TEXT));
  melde('Und dass der Widerruf löscht',
        /Widerruf löscht das Profil/i.test(EINWILLIGUNG_TEXT));
}

// --- 6. Die Antwort-Absichten ----------------------------------------------
{
  const schluessel = Object.keys(ABSICHTEN);
  melde('Es gibt eine Auswahl von Absichten', schluessel.length >= 10,
        String(schluessel.length));
  melde('Darunter eine Zusage', schluessel.includes('zusage'));
  melde('Und zwei Absagen (vergeben / Entscheidung)',
        schluessel.includes('absage_vergeben') && schluessel.includes('absage_allgemein'));

  for (const [k, a] of Object.entries(ABSICHTEN)) {
    melde(`Absicht "${k}" hat Namen, Hinweis und Anweisung`,
          !!(a.name && a.hinweis && a.anweisung && a.anweisung.length > 40), k);
  }

  // Die Absage darf keinen Grund nennen lassen. Das ist nicht Höflichkeit:
  // eine begründete Absage kann ein Indiz nach dem AGG sein.
  melde('Die allgemeine Absage verbietet ausdrücklich eine Begründung',
        /NENNE KEINEN GRUND/.test(ABSICHTEN.absage_allgemein.anweisung));
  melde('Und nennt das Allgemeine Gleichbehandlungsgesetz als Grund dafür',
        /Gleichbehandlungsgesetz/.test(ABSICHTEN.absage_allgemein.anweisung));

  // Eine Zusage darf nichts zusichern, was nicht dasteht.
  melde('Die Zusage sichert nichts zu, was nicht im Kontext steht',
        /KEINE Zusicherung/.test(ABSICHTEN.zusage.anweisung));

  melde('Ein unbekannter Schlüssel fällt auf "frei" zurück',
        absichtBlock('gibtesnicht').includes(ABSICHTEN.frei.name));
  melde('Der Block nennt die gewählte Absicht',
        absichtBlock('absage_vergeben').includes(ABSICHTEN.absage_vergeben.name));
}

// --- 7. Der Stil gehört niemandem ------------------------------------------
{
  const ohne = stilProfil('Maria Muster', 'Musterhaus Immobilien', '');
  melde('Ohne gelerntes Profil gilt der neutrale Stil',
        ohne.includes(NEUTRALER_STIL.split('\n')[0]) || ohne.includes('Mit freundlichen Gruessen'),
        ohne.slice(0, 120));
  melde('Der Name des Nutzers steht drin', ohne.includes('Maria Muster'));

  const mit = stilProfil('Maria Muster', 'Musterhaus Immobilien', '## Anrede\nImmer "Moin".');
  melde('Mit gelerntem Profil gilt dieses', mit.includes('Immer "Moin"'));
  melde('Und der neutrale Stil steht dann NICHT zusätzlich drin',
        !mit.includes('Keine KI-Floskeln'), 'beide Stile im selben Auftrag');

  // Der Grund, aus dem es diese Funktion gibt.
  const alles = NEUTRALER_STIL + JSON.stringify(ABSICHTEN) + ohne;
  // Die gesuchten Kennzeichen stehen KODIERT da und nicht im Klartext:
  // eine Datei, die ein Kennzeichen sucht, darf es nicht selbst lesbar
  // enthalten (CLAUDE.md, Abschnitt Abgrenzung). Derselbe Weg wie in
  // scripts/neutral.sh — das Gate hat diesen Test sonst zu Recht rot
  // gefaerbt.
  const gesucht = Buffer.from('XGJMYXNzZVxifEFLQU5UfDIxODgxMjV8RW5nZmVy', 'base64').toString('utf-8');
  for (const teil of gesucht.split('|')) {
    const kennzeichen = new RegExp(teil, 'i');
    melde(`Kein Kennzeichen der Referenz im Stil (${teil})`,
          !kennzeichen.test(alles));
  }
}

if (fehler) {
  console.log(`\n  ${fehler} Pruefung(en) gescheitert.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Pruefungen zu Schreibstil und Antwort-Absichten:`);
console.log('       Namen, Anschriften, Nummern, Beträge, Daten und Zitate werden');
console.log('       geschwärzt, bevor etwas das Haus verlässt — der Stil bleibt');
console.log('       erkennbar. Die Einwilligung sagt, was geschieht und wie man');
console.log('       widerruft. Die Absage lässt keinen Grund nennen (AGG), die');
console.log('       Zusage sichert nichts zu, was nicht dasteht.');
