// Zeigt die Tafel „Abo & Abrechnung" das Richtige — und bietet sie nichts an,
// was sie nicht anbieten darf?
//
// Zwei Fragen, und beide sind keine Gestaltungsfrage:
//
//   1. Steht vor einer Kündigung das DATUM, auf das sie fällt? Wer sechs
//      Monate Mindestlaufzeit hat, soll das sehen, bevor er klickt.
//   2. Gibt es irgendeinen Weg, von hier aus Tarif, Saldo oder Laufzeit zu
//      ändern? Den darf es nicht geben — das schreibt ausschliesslich der
//      Webhook. CLAUDE.md: „Abo-Status niemals allein dem Frontend glauben."
//
// Gerendert wird mit einem NACHGEBAUTEN React: die Tafel benutzt nur
// useState, useEffect und useCallback, und mit festen Zustandswerten lässt
// sich jeder Fall einzeln ansehen — Testphase, laufendes Abo, Kündigung,
// gesperrt. Ein echtes React bräuchte ein DOM und eine Supabase-Verbindung;
// beides gibt es hier nicht, und für diese Fragen braucht es beides nicht.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATEI = path.join(__dirname, '..', 'src', 'eigene', 'abrechnung.js');

let fehler = 0;
let geprueft = 0;
const melde = (text, ok, zusatz) => {
  geprueft++;
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${text}${zusatz ? ' — ' + zusatz : ''}`);
};

if (!fs.existsSync(DATEI)) {
  console.log('  src/eigene/abrechnung.js fehlt — uebersprungen.');
  process.exit(0);
}
const quelle = fs.readFileSync(DATEI, 'utf8');

// --- Ein React, das nur das kann, was die Tafel benutzt -------------------
function machReact(zustaende) {
  let i = 0;
  return {
    createElement: (typ, eigenschaften, ...kinder) => ({
      typ, props: Object.assign({}, eigenschaften || {},
        kinder.length ? { children: kinder.length === 1 ? kinder[0] : kinder } : {}),
    }),
    useState: () => {
      const wert = zustaende[i++];
      return [wert, () => {}];
    },
    useEffect: () => {},
    useCallback: (f) => f,
  };
}

/** Den Baum zu Text machen. Funktionen als Typ werden aufgerufen — nur so
 *  kommt man an das, was Vertrag(), Tarifwahl() und Zusatznutzer() zeigen. */
function text(knoten, tiefe) {
  tiefe = tiefe || 0;
  if (tiefe > 60 || knoten === null || knoten === undefined || knoten === false) return '';
  if (typeof knoten === 'string' || typeof knoten === 'number') return String(knoten) + ' ';
  if (Array.isArray(knoten)) return knoten.map((k) => text(k, tiefe + 1)).join('');
  if (!knoten.typ) return '';
  if (typeof knoten.typ === 'function') {
    let ergebnis;
    try { ergebnis = knoten.typ(knoten.props || {}); }
    catch (e) { return `[[FEHLER beim Zeichnen: ${e.message}]] `; }
    return text(ergebnis, tiefe + 1);
  }
  return text(knoten.props && knoten.props.children, tiefe + 1);
}

/** Alle Knoepfe des Baums mit ihrer Beschriftung einsammeln. */
function knoepfe(knoten, sammlung, tiefe) {
  sammlung = sammlung || [];
  tiefe = tiefe || 0;
  if (tiefe > 60 || !knoten || typeof knoten !== 'object') return sammlung;
  if (Array.isArray(knoten)) { knoten.forEach((k) => knoepfe(k, sammlung, tiefe + 1)); return sammlung; }
  if (typeof knoten.typ === 'function') {
    try { knoepfe(knoten.typ(knoten.props || {}), sammlung, tiefe + 1); } catch (e) { /* oben gemeldet */ }
    return sammlung;
  }
  if (knoten.typ === 'button') sammlung.push(text(knoten.props && knoten.props.children).trim());
  knoepfe(knoten.props && knoten.props.children, sammlung, tiefe + 1);
  return sammlung;
}

const KATALOG = {
  ok: true, ust_prozent: 19, mindestlaufzeit_monate: 6,
  tarife: [
    { schluessel: 'starter', name: 'Starter', hinweis: 'Fuer Einzelmakler',
      preis_monat_cent: 4999, preis_jahr_cent: 54989, inkl_nutzer: 1, credits_monat: 500 },
    { schluessel: 'professional', name: 'Professional', empfohlen: true,
      preis_monat_cent: 12999, preis_jahr_cent: 142989, inkl_nutzer: 3, credits_monat: 1500 },
  ],
  zusatznutzer: { preis_monat_cent: 2999, preis_jahr_cent: 32989 },
  credit_pakete: [{ schluessel: 'paket_250', credits: 250, preis_cent: 999 }],
};

function tafel(stand, katalog) {
  // Reihenfolge der useState-Aufrufe in der Tafel: stand, katalog, laedt,
  // fehler, meldung, arbeit, takt.
  const React = machReact([stand, katalog || null, false, '', '', '', 'monat']);
  const fenster = {
    IMMO_CI: null,
    _sb: { functions: { invoke: () => Promise.resolve({ data: null }) } },
    location: { search: '' },
    confirm: () => true,
    setTimeout: () => 0, clearTimeout: () => {},
  };
  const umgebung = { React, window: fenster, URLSearchParams, console,
                     setTimeout: () => 0, clearTimeout: () => {} };
  vm.createContext(umgebung);
  vm.runInContext(quelle, umgebung, { filename: 'abrechnung.js' });
  melde('die Tafel meldet sich an', typeof fenster.ImmoAbrechnung === 'function');
  if (typeof fenster.ImmoAbrechnung !== 'function') return { t: '', k: [] };
  let baum;
  try { baum = fenster.ImmoAbrechnung(); }
  catch (e) { melde('die Tafel laesst sich zeichnen', false, e.message); return { t: '', k: [] }; }
  return { t: text(baum), k: knoepfe(baum) };
}

// --- 1. Testphase ---------------------------------------------------------
const inVierzehn = new Date(Date.now() + 14 * 86400000).toISOString();
let r = tafel({
  ok: true, zugriff: 'voll', saldo: 300,
  nutzer: { ist: 1, limit: 1 },
  testphase_bis: inVierzehn,
  konten: [{ quelle: 'test', rest: 300, gueltig_bis: inVierzehn }],
  abo: { tarif: 'starter', status: 'test', intervall: 'monat', zusatznutzer: 0 },
}, KATALOG);
melde('Testphase: die Tafel zeichnet', !/FEHLER beim Zeichnen/.test(r.t), r.t.slice(0, 160));
melde('Testphase: die verbleibenden Tage stehen da', /noch 14 Tage/.test(r.t), r.t.slice(0, 120));
melde('Testphase: der Saldo steht da', /300/.test(r.t));
melde('Testphase: die Tarife stehen zur Wahl',
      /Starter/.test(r.t) && /Professional/.test(r.t) && /49,99/.test(r.t));
melde('Testphase: die Mindestlaufzeit steht dabei', /Mindestlaufzeit 6 Monate/.test(r.t));
melde('Testphase: Nettopreise sind als solche benannt', /Nettopreise zzgl\. 19 % USt/.test(r.t));
melde('Testphase: KEIN Kuendigungsknopf', !r.k.some((b) => /kündigen/i.test(b)),
      r.k.join(' | '));
melde('Testphase: Credits lassen sich kaufen', r.k.some((b) => /250 Credits/.test(b)));

// --- 2. Laufendes Abo -----------------------------------------------------
const inSechzig = new Date(Date.now() + 60 * 86400000).toISOString();
r = tafel({
  ok: true, zugriff: 'voll', saldo: 1480,
  nutzer: { ist: 3, limit: 4 },
  konten: [{ quelle: 'tarif', rest: 1230, gueltig_bis: inSechzig },
           { quelle: 'paket', rest: 250, gueltig_bis: null }],
  abo: { tarif: 'professional', tarif_name: 'Professional', status: 'aktiv',
         intervall: 'monat', zusatznutzer: 1, periode_bis: inSechzig,
         mindestlaufzeit_bis: inSechzig, hat_zahlungsmittel: true },
}, KATALOG);
melde('Abo: die Tafel zeichnet', !/FEHLER beim Zeichnen/.test(r.t), r.t.slice(0, 160));
melde('Abo: der Tarif steht da', /Professional/.test(r.t));
melde('Abo: Nutzer und Limit stehen da', /3 von 4/.test(r.t), r.t.slice(0, 200));
melde('Abo: die Toepfe sind getrennt ausgewiesen',
      /aus dem Tarif/.test(r.t) && /gekauft/.test(r.t));
melde('Abo: die Mindestlaufzeit steht da', /Mindestlaufzeit bis/.test(r.t));
melde('Abo: kuendigen ist moeglich', r.k.some((b) => /Abo kündigen/.test(b)), r.k.join(' | '));
melde('Abo: Rechnungen sind erreichbar',
      r.k.some((b) => /Zahlungsmittel|Rechnungen/.test(b)));
melde('Abo: Plaetze lassen sich dazubuchen',
      r.k.some((b) => /Platz dazubuchen/.test(b)));
melde('Abo: und wieder abgeben', r.k.some((b) => /Platz abgeben/.test(b)));

// --- 3. Gekuendigt --------------------------------------------------------
r = tafel({
  ok: true, zugriff: 'voll', saldo: 10, nutzer: { ist: 1, limit: 1 }, konten: [],
  abo: { tarif: 'starter', tarif_name: 'Starter', status: 'gekuendigt',
         intervall: 'monat', cancel_at: inSechzig, periode_bis: inSechzig,
         hat_zahlungsmittel: true },
}, KATALOG);
melde('Gekuendigt: das Enddatum steht im Band', /Gekündigt zum/.test(r.t), r.t.slice(0, 140));
melde('Gekuendigt: die Kuendigung laesst sich zuruecknehmen',
      r.k.some((b) => /zurücknehmen/.test(b)), r.k.join(' | '));
melde('Gekuendigt: kein zweiter Kuendigungsknopf',
      !r.k.some((b) => /^Abo kündigen/.test(b)));

// --- 4. Gesperrt ----------------------------------------------------------
r = tafel({
  ok: true, zugriff: 'gesperrt', saldo: 0, nutzer: { ist: 2, limit: 1 },
  konten: [], abo: null,
}, KATALOG);
melde('Gesperrt: die Tafel sagt es deutlich', /gesperrt/i.test(r.t), r.t.slice(0, 140));
melde('Gesperrt: ein Tarif laesst sich trotzdem waehlen',
      r.k.some((b) => /Wählen/.test(b)), r.k.join(' | '));

// --- 5. Ohne Katalog ------------------------------------------------------
r = tafel({
  ok: true, zugriff: 'voll', saldo: 5, nutzer: { ist: 1, limit: 1 },
  konten: [], testphase_bis: inVierzehn,
  abo: { tarif: 'starter', status: 'test', intervall: 'monat' },
}, null);
melde('Ohne Katalog: die Tafel bleibt lesbar',
      !/FEHLER beim Zeichnen/.test(r.t) && /Credits/.test(r.t), r.t.slice(0, 140));
melde('Ohne Katalog: kein erfundener Preis', !/€/.test(r.t), r.t.slice(0, 200));

// --- 6. Was die Tafel NICHT tun darf --------------------------------------
// Geprueft am Quelltext: eine Schreiboperation auf die Abrechnungstabellen
// waere genau die Luecke, die der ganze Aufbau vermeidet.
for (const [muster, was] of [
  [/from\(\s*["']mandant_abo["']/, 'mandant_abo'],
  [/from\(\s*["']credit_konten["']/, 'credit_konten'],
  [/from\(\s*["']credit_buchungen["']/, 'credit_buchungen'],
  [/from\(\s*["']plattform_tarife["']/, 'plattform_tarife'],
  [/rpc\(\s*["']credits_/, 'eine Credit-Funktion'],
]) {
  melde(`die Tafel fasst ${was} nicht selbst an`, !muster.test(quelle),
        'der Stand kommt aus abo-verwalten, geschrieben wird nur vom Webhook');
}
melde('vor dem Kuendigen wird gefragt', /confirm\([\s\S]{0,200}kündigen/i.test(quelle));
melde('vor dem Zuruecknehmen auch', /confirm\([\s\S]{0,200}zurücknehmen/i.test(quelle));
melde('kein Preis steht in dieser Datei',
      !/\b\d{2,},\d\d\s*€/.test(quelle) && !/preis_monat_cent\s*[:=]\s*\d/.test(quelle),
      'Preise kommen aus dem Katalog');
melde('die Tafel sagt, woher der Stand kommt',
      /nicht aus dieser Ansicht/.test(quelle));

if (fehler) {
  console.log(`\n  ${fehler} von ${geprueft} Pruefungen gescheitert.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Pruefungen zur Tafel „Abo & Abrechnung":`);
console.log('       Testphase, laufendes Abo, Kündigung, Sperre und der Fall');
console.log('       ohne Katalog zeichnen sich — und die Tafel schreibt an');
console.log('       keine Abrechnungstabelle selbst.');
