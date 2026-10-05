// Macht der Aufbereiter aus Datenbankzeilen die Werte, die die Vorlagen
// erwarten?
//
// Zwei Fragen, die im Betrieb nicht auffallen wuerden:
//
//   1. Kommt jeder Platzhalter des Katalogs an, wenn die Zeilen
//      vollstaendig sind? Ein Platzhalter, den niemand fuellt, steht im
//      Editor zur Auswahl und bleibt im PDF leer.
//   2. Bleibt ein fehlender Wert WEG? CLAUDE.md verlangt "keine erfundenen
//      Objektdaten" — eine 0, ein "-" oder ein leeres "m²" waere genau das.
//      Und nur ein fehlender Schluessel laesst Zeile, Element oder Seite
//      entfallen.
//
// Die Zeilen sind hier aufgebaut, nicht aus der Datenbank gelesen: der Test
// soll ohne Netz und ohne Instanz laufen. Dass die Spaltennamen stimmen,
// prueft tests/expose-felder.js gegen das echte Schema.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const PAKET = path.join(WURZEL, 'packages', 'expose-renderer', 'src');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-aufbereiten-'));
execFileSync('tsc', [path.join(PAKET, 'index.ts'), '--outDir', tmp,
                     '--module', 'commonjs', '--target', 'es2020',
                     '--skipLibCheck', '--esModuleInterop'],
             { stdio: 'pipe', cwd: os.tmpdir() });
const R = require(path.join(tmp, 'index.js'));

let fehler = 0;
const melde = (t, ok, zusatz) => {
  if (!ok) { fehler++; console.log(`  [FEHLER] ${t}${zusatz ? ' — ' + zusatz : ''}`); }
};

// --- 1. Vollstaendige Zeilen ------------------------------------------------
// Je Spalte des Katalogs ein Wert. Er wird aus dem Typ erzeugt, damit der
// Test nicht bei jeder neuen Spalte von Hand nachgezogen werden muss.
const PROBE = {
  text: 'Probe', mehrzeilig: 'Erster Absatz.\n\nZweiter Absatz.',
  zahl: 7, flaeche: 112.5, euro: 589000, prozent: 3.57, jahr: 2021,
  datum: '2035-04-30', ja_nein: true, liste: [{ name: 'Eintrag', betrag: 12 }],
  aufzaehlung: 'Punkt eins\nPunkt zwei', bild: 'pfad/zum/bild.jpg',
};
const zeilen = { immobilien: {}, profiles: {}, firma_stammdaten: {} };
for (const f of R.KATALOG) {
  if (!f.quelle.tabelle) continue;
  zeilen[f.quelle.tabelle][f.quelle.spalte] = PROBE[f.typ];
}
// Zwei Werte, die zum Rechnen passen muessen.
zeilen.immobilien.vertragsart = 'kauf';
zeilen.immobilien.plz = '20095';
zeilen.immobilien.provision_aussen = '3,57 %';
zeilen.immobilien.provisionsfrei = false;
zeilen.immobilien.expose_preis_auf_anfrage = false;
zeilen.immobilien.expose_titel_zeilen = ['Erste Zeile', 'Zweite Zeile'];
zeilen.immobilien.laufende_kosten = [{ name: 'Grundsteuer', betrag: 38 },
                                     { name: 'Versicherung', betrag: 54 }];
// Die Listenspalten tragen die Namen, die die Oberflaeche vor dem Baukasten
// gewaehlt hat. Genau diese Schreibweisen muss der Aufbereiter uebersetzen.
zeilen.immobilien.expose_highlights = [{ icon: 'haus', zeile1: 'Dachterrasse', zeile2: '32 m² nach Süden' }];
zeilen.immobilien.lage_distanzen = [{ label: 'Bushaltestelle', wert: '0,3 km' },
                                    { label: 'Zentrum', wert: '850 m' }];
zeilen.immobilien.expose_wege = [{ ziel: 'Bahnhof', fuss: 12, rad: 5, auto: 3 }];
zeilen.immobilien.raumaufteilung = [{ raum: 'Wohnen', groesse: 38.5, geschoss: 'eg' },
                                    { name: 'Bad', flaeche: 9 },
                                    { name: 'Flur ohne Mass' }];
zeilen.immobilien.expose_ausstattung_gruppen = [{ titel: 'Küche', punkte: ['Insel', 'Naturstein'] }];

const voll = R.aufbereiten({
  immobilie: zeilen.immobilien,
  ansprechpartner: zeilen.profiles,
  firma: zeilen.firma_stammdaten,
  annahmen: { notar_prozent: 2.0, zinssatz: 3.9, tilgung: 2.0, eigenkapital_prozent: 20 },
  bilder: { 'bild.foto.1': 'f1.jpg', 'bild.grundriss.1': 'g1.jpg', 'bild.lageplan': 'l.jpg' },
  heute: new Date(2026, 9, 5),
});

// Die seite.*- und lauf.*-Werte setzt der Renderer je Seite, nicht der
// Aufbereiter — sie koennen hier nicht da sein.
const DURCH_RENDERER = new Set(['dokument.seiten', 'seite.nummer', 'seite.gesamt',
  'seite.nummer_zweistellig', 'seite.gesamt_zweistellig', 'seite.name',
  'lauf.nummer', 'lauf.gesamt']);
// Die Warmmiete gibt es nur bei einer Vermietung. Die Probezeilen sind ein
// Kauf; geprueft wird sie im Mietfall weiter unten.
const NUR_MIETE = new Set(['objekt.warmmiete']);
// Werte, die aus KEINER Spalte und aus keiner Rechnung kommen koennen.
const OHNE_QUELLE = {
  'objekt.seeufer_meter':
    'Besonderheit eines einzelnen Objekts am Wasser. Es gibt keine Spalte '
    + 'dafuer, und eine zu erfinden hiesse, sie fuer jedes andere Objekt '
    + 'leer mitzuschleppen. Die Kennzahl entfaellt, bis der Editor eigene '
    + 'Kennzahlen am Objekt erlaubt (Etappe 5).',
};
const fehlend = [];
for (const f of R.KATALOG) {
  if (DURCH_RENDERER.has(f.schluessel)) continue;
  if (OHNE_QUELLE[f.schluessel]) continue;
  if (NUR_MIETE.has(f.schluessel)) continue;
  if (voll[f.schluessel] === undefined) fehlend.push(f.schluessel);
}
melde(`${R.KATALOG.length} Platzhalter aus vollstaendigen Zeilen`,
      fehlend.length === 0, fehlend.join(', '));

// Die zusammengesetzten Felder im Einzelnen.
melde('objekt.adresse ist Strasse und Hausnummer',
      voll['objekt.adresse'] === 'Probe Probe', String(voll['objekt.adresse']));
melde('objekt.plz_ort ist PLZ und Ort',
      voll['objekt.plz_ort'] === '20095 Probe', String(voll['objekt.plz_ort']));
melde('objekt.expose_titel_text nimmt die gepflegten Zeilen',
      voll['objekt.expose_titel_text'] === 'Erste Zeile\nZweite Zeile');
melde('objekt.expose_prolog ist der erste Absatz der Beschreibung',
      voll['objekt.expose_prolog'] === 'Erster Absatz.',
      String(voll['objekt.expose_prolog']));
melde('objekt.expose_prolog_initiale ist ein Buchstabe',
      voll['objekt.expose_prolog_initiale'] === 'E');
melde('objekt.energie_gueltig_kurz ist MM/JJJJ',
      voll['objekt.energie_gueltig_kurz'] === '04/2035',
      String(voll['objekt.energie_gueltig_kurz']));
melde('objekt.preis ist der Angebotspreis mit Einheit',
      voll['objekt.preis'] === '589.000 €', String(voll['objekt.preis']));
melde('objekt.eckdaten tragen Label, Wert und Einheit',
      Array.isArray(voll['objekt.eckdaten']) && voll['objekt.eckdaten'].length === 6
      && voll['objekt.eckdaten'][0].einheit === 'm²');
melde('objekt.fakten tragen fertige Werte',
      Array.isArray(voll['objekt.fakten'])
      && voll['objekt.fakten'].some((f) => f.wert === '112,5 m²'));
melde('firma.impressum_zeile fuehrt Register und USt-IdNr.',
      String(voll['firma.impressum_zeile']).includes('USt-IdNr.'));
melde('datum kommt aus der hereingegebenen Uhr',
      voll['datum'] === '05.10.2026', String(voll['datum']));
// Die Uebersetzung der Listen.
melde('Highlights: zeile1/zeile2 werden Titel und Text',
      voll['objekt.expose_highlights'][0].titel === 'Dachterrasse'
      && voll['objekt.expose_highlights'][0].text === '32 m² nach Süden');
melde('Entfernungen: label wird ziel, km wird eine Zahl',
      voll['objekt.lage_distanzen'][0].ziel === 'Bushaltestelle'
      && voll['objekt.lage_distanzen'][0].km === 0.3,
      JSON.stringify(voll['objekt.lage_distanzen'][0]));
melde('Entfernungen: "850 m" sind 0,85 km',
      voll['objekt.lage_distanzen'][1].km === 0.85,
      JSON.stringify(voll['objekt.lage_distanzen'][1]));
melde('Raeume: raum/groesse/geschoss werden name/flaeche/ebene',
      voll['objekt.raumaufteilung'][0].name === 'Wohnen'
      && voll['objekt.raumaufteilung'][0].flaeche === 38.5
      && voll['objekt.raumaufteilung'][0].ebene === 'eg');
melde('Raum ohne Flaeche faellt heraus statt leer zu bleiben',
      voll['objekt.raumaufteilung'].length === 2
      && !voll['objekt.raumaufteilung'].some((r) => r.name === 'Flur ohne Mass'),
      JSON.stringify(voll['objekt.raumaufteilung']));
melde('Ausstattungsgruppen behalten Titel und Punkte',
      voll['objekt.expose_ausstattung_gruppen'][0].punkte.length === 2);

melde('Bilder stehen unter ihren Slot-Schluesseln',
      voll['bild.foto.1'] === 'f1.jpg' && voll['bild.lageplan'] === 'l.jpg');

// --- 2. Die Rechnung --------------------------------------------------------
const kp = 589000;
const soll = {
  'rechnung.kaufpreis': kp,
  // Das Objekt nennt einen eigenen Satz (3,57 % aus den Probewerten); er
  // schlaegt die Tabelle nach Postleitzahl. Genau so soll es sein.
  'rechnung.grunderwerbsteuer': kp * 3.57 / 100,
  'rechnung.notar': kp * 2.0 / 100,
  'rechnung.courtage': kp * 3.57 / 100,
};
soll['rechnung.gesamtaufwand'] = kp + soll['rechnung.grunderwerbsteuer']
  + soll['rechnung.notar'] + soll['rechnung.courtage'];
soll['rechnung.eigenkapital'] = soll['rechnung.gesamtaufwand'] * 0.2;
soll['rechnung.darlehen'] = soll['rechnung.gesamtaufwand'] - soll['rechnung.eigenkapital'];
soll['rechnung.monatsrate'] = soll['rechnung.darlehen'] * 5.9 / 100 / 12;
for (const [k, v] of Object.entries(soll)) {
  melde(`${k} gerechnet`, Math.abs(Number(voll[k]) - v) < 1e-6,
        `ist ${voll[k]}, soll ${v}`);
}
melde('rechnung.courtage_satz steht als Text im Satz',
      voll['rechnung.courtage_satz'] === '3,57 %', String(voll['rechnung.courtage_satz']));
melde('rechnung.laufende_summe summiert die Posten',
      voll['rechnung.laufende_summe'] === 92, String(voll['rechnung.laufende_summe']));
melde('rechnung.posten fuehrt vier Zeilen',
      Array.isArray(voll['rechnung.posten']) && voll['rechnung.posten'].length === 4);

// Grunderwerbsteuer aus der PLZ, wenn das Objekt keinen Satz nennt.
melde('Grunderwerbsteuer Bayern 3,5 %', R.grunderwerbsteuerSatz('80331') === 3.5);
melde('Grunderwerbsteuer Hamburg 5,5 %', R.grunderwerbsteuerSatz('20095') === 5.5);
melde('Grunderwerbsteuer ohne PLZ 6,0 %', R.grunderwerbsteuerSatz(null) === 6.0);
melde('Courtagesatz aus "3,57 %"', R.courtageSatz('3,57 %') === 3.57);
melde('Courtagesatz aus Freitext bleibt leer',
      R.courtageSatz('nach Vereinbarung') === undefined);

// --- 3. Leere Zeilen: nichts wird erfunden ---------------------------------
const leer = R.aufbereiten({ immobilie: { id: 'x' }, heute: new Date(2026, 0, 1) });
const verboten = ['objekt.wohnflaeche', 'objekt.preis', 'objekt.adresse',
                  'objekt.eckdaten', 'objekt.fakten', 'objekt.energie_angaben',
                  'rechnung.kaufpreis', 'rechnung.gesamtaufwand',
                  'rechnung.courtage', 'firma.adresse', 'objekt.untertitel'];
const erfunden = verboten.filter((k) => leer[k] !== undefined);
melde('Ohne Daten entsteht kein Wert', erfunden.length === 0,
      erfunden.map((k) => `${k}=${JSON.stringify(leer[k])}`).join(', '));
// Die Annahmen sind keine Objektdaten: Zins und Tilgung gelten auch fuer ein
// Objekt ohne Preis — nur gerechnet wird damit dann nichts.
melde('Ohne Preis keine Rechnung, aber die Annahmen stehen',
      leer['rechnung.zinssatz'] === 3.9 && leer['rechnung.kaufpreis'] === undefined);

// --- 4. Adresse nicht freigegeben ------------------------------------------
const gesperrt = R.aufbereiten({
  immobilie: { strasse: 'Musterweg', hausnummer: '7', plz: '20095', ort: 'Hamburg',
               adresse_freigeben: false },
});
melde('Gesperrte Adresse erscheint nirgends',
      gesperrt['objekt.adresse'] === undefined
      && gesperrt['objekt.strasse'] === undefined
      && gesperrt['objekt.hausnummer'] === undefined,
      JSON.stringify([gesperrt['objekt.adresse'], gesperrt['objekt.strasse']]));
melde('PLZ und Ort bleiben auch ohne Freigabe',
      gesperrt['objekt.plz_ort'] === '20095 Hamburg');

// --- 5. Miete statt Kauf ---------------------------------------------------
const miete = R.aufbereiten({
  immobilie: { vertragsart: 'miete', kaltmiete: 1200, nebenkosten: 180,
               heizkosten: 90, angebotspreis: 589000, plz: '20095' },
});
melde('Bei Miete steht die Kaltmiete im Preis',
      miete['objekt.preis'] === '1.200 €', String(miete['objekt.preis']));
melde('Warmmiete ist die Summe', miete['objekt.warmmiete'] === 1470);
melde('Bei Miete keine Grunderwerbsteuer',
      miete['rechnung.grunderwerbsteuer'] === undefined);

fs.rmSync(tmp, { recursive: true, force: true });
if (fehler) {
  console.log(`\n  ${fehler} Pruefung(en) gescheitert.`);
  process.exit(1);
}
console.log(`  [ok] ${R.KATALOG.length} Platzhalter: aus vollstaendigen Zeilen kommt jeder an,`);
console.log('       aus leeren keiner. Rechnung, Adressfreigabe und Miete geprueft.');
for (const [k, grund] of Object.entries(OHNE_QUELLE)) {
  console.log(`       Ohne Quelle, mit Grund: ${k} — ${grund.split('.')[0]}.`);
}
