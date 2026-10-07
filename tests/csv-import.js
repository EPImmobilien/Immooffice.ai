// CSV-Import (fork_81): liest der Leser, was deutsche Programme schreiben,
// und wird aus einer Zeile der richtige Datensatz?
const api = require('../src/eigene/csv-import.js');
let fehler = 0, n = 0;
function melde(name, ok, bem) { n++; if (!ok) { fehler++; console.log('  [FEHLER] ' + name + (bem ? ' — ' + bem : '')); } }

// Lesen: Semikolon, BOM, Anfuehrungszeichen mit Trenner und Zeilenumbruch, CRLF
const g = api.csvLesen('﻿Vorname;Nachname;E-Mail;Notiz\r\nAnna;Muster;anna@beispiel.example;"Ruf; bitte\nmorgen"\r\n;;;\r\nBernd;"Meier ""Senior""";;\r\n');
melde('Kopf gelesen', g.kopf.join('|') === 'Vorname|Nachname|E-Mail|Notiz', g.kopf.join('|'));
melde('Trenner ; erkannt', g.trenner === ';', g.trenner);
melde('Leerzeile uebersprungen, zwei Datenzeilen', g.zeilen.length === 2, String(g.zeilen.length));
melde('Anfuehrungszeichen mit Trenner und Umbruch', g.zeilen[0][3] === 'Ruf; bitte\nmorgen', JSON.stringify(g.zeilen[0][3]));
melde('Doppelte Anfuehrungszeichen', g.zeilen[1][1] === 'Meier "Senior"', g.zeilen[1][1]);
const k = api.csvLesen('a,b\n1,2\n');
melde('Komma erkannt', k.trenner === ',' && k.zeilen[0][1] === '2');
const tab = api.csvLesen('a\tb\n1\t2\n');
melde('Tab erkannt', tab.trenner === '\t' && tab.zeilen[0][1] === '2');

// Zahlen
melde('1.234,56 -> 1234.56', api.zahl('1.234,56') === 1234.56);
melde('1,234.56 -> 1234.56', api.zahl('1,234.56') === 1234.56);
melde('85,5 m² -> 85.5', api.zahl('85,5 m²') === 85.5);
melde('249.000 € -> 249000', api.zahl('249.000 €') === 249000);
melde('Unlesbares wird NaN, nicht 0', Number.isNaN(api.zahl('k.A.')));
melde('Leer bleibt null', api.zahl('') === null);
melde('Vertragsart Kauf', api.vertragsart('Kauf') === 'verkauf');
melde('Vertragsart Miete', api.vertragsart('zur Miete') === 'vermietung');
melde('Vertragsart unbekannt -> NaN', Number.isNaN(api.vertragsart('Erbpacht')));

// Zuordnung
const zk = api.zuordnen('kontakte', ['Anrede', 'Name', 'Vorname', 'Mail', 'Telefon (privat)', 'Straße', 'PLZ', 'Ort', 'Kategorie']);
melde('Name -> nachname', zk.nachname === 1, JSON.stringify(zk));
melde('Mail -> email', zk.email === 3);
melde('Telefon (privat) -> telefon (Teiltreffer)', zk.telefon === 4);
melde('Kategorie -> rollen', zk.rollen === 8);
const zo = api.zuordnen('immobilien', ['Objektnummer', 'Objekttitel', 'Vermarktungsart', 'Strasse', 'Hausnr.', 'PLZ', 'Ort', 'Wohnfläche', 'Kaufpreis', 'Zimmer', 'Baujahr']);
melde('Objektnummer -> immo_nr', zo.immo_nr === 0, JSON.stringify(zo));
melde('Vermarktungsart -> vertragsart', zo.vertragsart === 2);
melde('Hausnr. -> hausnummer', zo.hausnummer === 4);
melde('Kaufpreis -> angebotspreis', zo.angebotspreis === 8);
melde('Objekttitel -> objekttitel, nicht bezeichnung', zo.objekttitel === 1 && zo.bezeichnung === undefined);

// Zeile -> Datensatz
const fk = api.FELDER.kontakte;
let r = api.zeileLesen('kontakte', fk, zk, ['Herr', 'Muster', 'Max', 'max@beispiel.example', '0170 0000000', 'Weg 1', '12345', 'Ort', 'Eigentümer'], {});
melde('Kontakt gelesen', r.fehler.length === 0 && r.satz.nachname === 'Muster' && r.satz.email === 'max@beispiel.example', JSON.stringify(r));
melde('Rolle unbekannt im Test -> sonstiges', Array.isArray(r.satz.rollen) && r.satz.rollen[0] === 'sonstiges');
melde('Quelle csv-import', r.satz.quelle === 'csv-import');
r = api.zeileLesen('kontakte', fk, zk, ['', '', 'Max', 'x@y.example', '', '', '', '', ''], {});
melde('Ohne Nachname und Firma: Fehler', r.fehler.length === 1 && /Nachname/.test(r.fehler[0]));
const fo = api.FELDER.immobilien;
r = api.zeileLesen('immobilien', fo, zo, ['A-17', 'Helle 3-Zimmer-Wohnung', 'Kauf', 'Lindenweg', '4', '12345', 'Beispielstadt', '85,5', '249.000', '3', '1998'], { status: 'vorbereitung' });
melde('Objekt gelesen', r.fehler.length === 0 && r.satz.vertragsart === 'verkauf' && r.satz.wohnflaeche === 85.5 && r.satz.angebotspreis === 249000 && r.satz.baujahr === 1998, JSON.stringify(r));
melde('Bezeichnung aus Anschrift', r.satz.bezeichnung === 'Lindenweg 4, Beispielstadt', r.satz.bezeichnung);
melde('Status aus Vorgabe', r.satz.status === 'vorbereitung');
r = api.zeileLesen('immobilien', fo, zo, ['A-18', '', '', 'Lindenweg', '5', '12345', 'Beispielstadt', 'k.A.', '', '', ''], {});
melde('Ohne Vertragsart und mit unlesbarer Zahl: zwei Fehler', r.fehler.length === 2, JSON.stringify(r.fehler));
r = api.zeileLesen('immobilien', fo, zo, ['A-18', '', '', 'Lindenweg', '5', '12345', 'Beispielstadt', '', '', '', ''], { vertragsart: 'vermietung' });
melde('Vorgabe Vertragsart greift', r.fehler.length === 0 && r.satz.vertragsart === 'vermietung');

// Dubletten
melde('Kontakt-Schluessel E-Mail, klein', api.schluessel('kontakte', { email: 'Max@Beispiel.example' }) === 'mail:max@beispiel.example');
melde('Objekt-Schluessel Nr. vor Anschrift', api.schluessel('immobilien', { immo_nr: 'A-1', strasse: 'x' }) === 'nr:a-1');
melde('Objekt-Schluessel Anschrift', api.schluessel('immobilien', { strasse: 'Lindenweg', hausnummer: '4', plz: '12345' }) === 'adr:lindenweg|4|12345');
melde('Ohne Merkmal kein Schluessel', api.schluessel('immobilien', { ort: 'x' }) === null);

if (fehler) { console.log(`  ${fehler} von ${n} Pruefungen gescheitert.`); process.exit(1); }
console.log(`  [ok] ${n} Pruefungen zum CSV-Import: Lesen (BOM, ; , Tab, Anfuehrungszeichen), deutsche Zahlen,\n       Spaltenzuordnung, Pflichtfelder, Vorgaben, Dubletten-Schluessel.`);
