// Sieht ein Plattform-Administrator nur, was ihn angeht?
//
// CLAUDE.md zieht hier eine Linie, die sich nicht von selbst hält:
// „Plattform-Administratoren erhalten keinen automatischen Zugriff auf
// Mandantendaten; Supportzugriff nur protokolliert und nach dem Prinzip der
// geringsten Rechte."
//
// Die Linie verläuft nicht bei „Daten über einen Mandanten" — Tarif, Status
// und Verbrauch braucht jeder, der Rechnungen schreibt —, sondern bei „Daten
// AUS einem Mandanten". Eine Immobilie, ein Kontakt, eine Mail, eine Datei:
// nichts davon darf durch diese Funktion gehen, auch nicht versehentlich,
// auch nicht später.
//
// Deshalb prüft dieser Test den Quelltext gegen eine Liste erlaubter
// Tabellen — und nicht das Gegenteil (eine Liste verbotener). Eine
// Verbotsliste ist am Tag ihrer Entstehung vollständig und danach nie wieder.
//
// Dazu: die Tafel wird mit einem nachgebauten React gezeichnet, in allen vier
// Reitern.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..');
const FUNKTION = path.join(WURZEL, 'supabase', 'eigene', 'plattform-admin', 'index.ts');
const TAFEL = path.join(WURZEL, 'src', 'eigene', 'plattform.js');

let fehler = 0;
let geprueft = 0;
const melde = (text, ok, zusatz) => {
  geprueft++;
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${text}${zusatz ? ' — ' + zusatz : ''}`);
};

if (!fs.existsSync(FUNKTION)) {
  console.log('  supabase/eigene/plattform-admin fehlt — uebersprungen.');
  process.exit(0);
}
const q = fs.readFileSync(FUNKTION, 'utf8');

// --- 1. Nur diese Tabellen, keine andere ---------------------------------
const ERLAUBT = new Set([
  // Der Katalog der Plattform — ihr eigenes Regal.
  'plattform_admins', 'plattform_tarife', 'plattform_credit_preise',
  'plattform_credit_pakete', 'plattform_werte', 'plattform_protokoll',
  // Die Vertragsbeziehung. `credit_konten` und `credit_buchungen` sind das
  // Guthaben und seine Bewegungen — sie gehoeren zur Abrechnung, nicht zur
  // Arbeit des Hauses. `abo_erinnerungen` haelt fest, welche Fristmeldung
  // schon hinausging; `support_sitzungen` ist der Zugriff selbst.
  'mandanten', 'mandant_abo', 'credit_buchungen', 'credit_konten',
  'abo_erinnerungen', 'support_sitzungen',
  // Nur, um Nutzer zu ZAEHLEN. Die Abfrage holt ausschliesslich mandant_id.
  'profiles',
]);
const beruehrt = new Set(
  Array.from(q.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]/g)).map((m) => m[1]));
// Auch die Tabelle aus der Variablen `tabelle` zaehlt — sie wird gegen
// AENDERBAR geprueft, und das ist genau die Stelle, an der man es uebersehen
// koennte.
for (const t of beruehrt) {
  melde(`die Funktion fasst "${t}" an — und darf das`, ERLAUBT.has(t),
        'nur Plattform- und Vertragstabellen, nie fachliche Daten eines Mandanten');
}
melde('sie fasst ueberhaupt etwas an', beruehrt.size >= 5, `${beruehrt.size} Tabellen`);

// `.from(tabelle)` mit einer Variablen ist der eine Weg an der Liste vorbei.
// Erlaubt ist er nur, weil `AENDERBAR` die moeglichen Werte aufzaehlt.
const ausVariable = /\.from\(\s*tabelle\s*\)/.test(q);
if (ausVariable) {
  const aenderbar = q.match(/const AENDERBAR[\s\S]*?\n\};/);
  melde('die Tabelle aus der Variablen kommt aus einer festen Liste', !!aenderbar);
  const namen = aenderbar
    ? Array.from(aenderbar[0].matchAll(/^\s{2}([a-z_]+):/gm)).map((m) => m[1]) : [];
  melde('und diese Liste nennt nur Katalogtabellen',
        namen.length > 0 && namen.every((n) => n.startsWith('plattform_')),
        namen.join(', '));
  for (const n of namen) {
    melde(`"${n}" ist eine erlaubte Tabelle`, ERLAUBT.has(n));
  }
}

// --- 2. Keine Spalte, die nach Stripe zeigt -------------------------------
// Ohne diese Grenze liesse sich ueber dieselbe Aktion `stripe_price_id`
// setzen — und ein Tarif zeigte auf ein fremdes Produkt.
const aenderbar = q.match(/const AENDERBAR[\s\S]*?\n\};/);
melde('es gibt eine Liste aenderbarer Spalten', !!aenderbar);
if (aenderbar) {
  melde('keine Stripe-Kennung laesst sich von Hand setzen',
        !/stripe_/.test(aenderbar[0]), aenderbar[0].slice(0, 120));
  melde('und auch keine Mandantenzuordnung',
        !/mandant_id/.test(aenderbar[0]));
}
melde('die Werte werden EINZELN uebernommen, nicht durchgereicht',
      /for \(const s of spalten\)/.test(q),
      'ein Object.assign auf body.werte waere die Luecke');

// --- 2b. Jede Spalte, die geschrieben wird, gibt es auch --------------------
// Eine Spalte, die der Code setzt und das Schema nicht kennt, sieht beim
// Lesen richtig aus und bricht beim ersten Klick. Genau so stand hier einmal
// `geaendert_von` fuer alle vier Katalogtabellen — drei von ihnen fuehren
// die Spalte nicht.
const SCHEMA = path.join(WURZEL, 'supabase', 'migrations',
  '20261006210000_fork_47_abrechnung.sql');
if (aenderbar && fs.existsSync(SCHEMA)) {
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const spaltenVon = (tabelle) => {
    const m = schema.match(new RegExp(
      `create table if not exists public\\.${tabelle} \\(([\\s\\S]*?)\\n\\);`));
    if (!m) return null;
    return new Set(Array.from(m[1].matchAll(/^\s{2}([a-z_]+)\s+[a-z]/gm)).map((x) => x[1]));
  };
  const bloecke = aenderbar[0].split(/\n  (?=[a-z_]+:)/).slice(1);
  for (const b of bloecke) {
    const tabelle = b.match(/^([a-z_]+):/)[1];
    const spalten = spaltenVon(tabelle);
    melde(`das Schema kennt ${tabelle}`, !!spalten);
    if (!spalten) continue;
    for (const sp of b.matchAll(/"([a-z_]+)"/g)) {
      melde(`${tabelle}.${sp[1]} gibt es wirklich`, spalten.has(sp[1]),
            'sonst bricht das Speichern beim ersten Klick');
    }
    // Und die beiden, die der Code von sich aus setzt.
    melde(`${tabelle} fuehrt geaendert_am`, spalten.has('geaendert_am'));
  }
  const vonTabellen = Array.from(q.matchAll(
    /tabelle === "([a-z_]+)"\) neu\.geaendert_von/g)).map((m) => m[1]);
  for (const t of vonTabellen) {
    const spalten = spaltenVon(t);
    melde(`${t} fuehrt geaendert_von`, !!spalten && spalten.has('geaendert_von'));
  }
  melde('geaendert_von wird nur dort gesetzt, wo es die Spalte gibt',
        vonTabellen.length > 0, 'sonst wird sie fuer alle gesetzt');
}

// --- 3. Jede Aenderung steht im Protokoll ---------------------------------
melde('es gibt ein Protokoll', /plattform_protokoll/.test(q));
for (const [muster, was] of [
  [/aktion === "katalog_speichern"[\s\S]*?protokoll\("katalog_geaendert"/, 'eine Preisaenderung'],
  [/aktion === "credits_schenken"[\s\S]*?protokoll\("credits_geschenkt"/, 'eine Gutschrift'],
]) {
  melde(`${was} wird protokolliert`, muster.test(q));
}
melde('eine Gutschrift ohne Grund wird abgewiesen',
      /grund\.length < 5/.test(q) && /Bitte einen Grund angeben/.test(q));
melde('eine Gutschrift ist gegen den doppelten Klick gesichert',
      /referenz/.test(q) && /credits_gutschreiben/.test(q),
      'credits_gutschreiben ist ueber die Referenz idempotent');
melde('die Gutschrift hat eine Obergrenze', /100000/.test(q));

// --- 3b. Die Verwaltungsaktionen -------------------------------------------
for (const [name, muster] of [
  ['ein Mandant laesst sich oeffnen', /aktion === "mandant"/],
  ['und aendern', /aktion === "mandant_speichern"/],
  ['und loeschen', /aktion === "mandant_loeschen"/],
  ['Konten ueber alle Haeuser', /aktion === "nutzer"/],
  ['Plattform-Recht vergeben', /aktion === "admin_setzen"/],
  ['Supportzugriff beginnen', /aktion === "support_start"/],
  ['und beenden', /aktion === "support_ende"/],
]) {
  melde(name, muster.test(q));
}
melde('das Loeschen verlangt den ausgeschriebenen Namen',
      /bestaetigung !== m\.name/.test(q),
      'ein Knopf allein ist keine Sperre fuer etwas Unwiderrufliches');
melde('vor dem Loeschen steht der Protokolleintrag',
      q.indexOf('protokoll("mandant_geloescht"') < q.indexOf('.delete().eq("id", id)'),
      'nachher ist die Kennung weg');
melde('der letzte Plattform-Administrator kann sich nicht selbst entfernen',
      /letzte Plattform-Administrator/.test(q),
      'sonst kaeme niemand mehr in diesen Bereich');
melde('ein entzogenes Recht beendet laufende Sitzungen',
      /admin_setzen[\s\S]*?from\("support_sitzungen"\)\s*\n?\s*\.update\(\{ beendet_am/.test(q));
melde('eine neue Sitzung beendet die vorherige',
      /aktion === "support_start"[\s\S]{0,1600}?is\("beendet_am", null\)[\s\S]{0,400}?\.insert\(\{/.test(q),
      'zwei gleichzeitige Sitzungen waeren eine Regel, die niemand sieht');
melde('die Dauer ist nach oben begrenzt', /Math\.min\(240/.test(q));
melde('ein Supportzugriff verlangt einen Grund, den der Mandant lesen kann',
      /der Mandant kann ihn nachlesen/.test(q));

// --- 4. Die Schranke steht vor jeder Aktion -------------------------------
const beiPruefung = q.indexOf('plattform_admins');
const beiAktion = q.indexOf('const aktion =');
melde('erst die Mitgliedschaft pruefen, dann die Aktion lesen',
      beiPruefung > 0 && beiAktion > beiPruefung,
      `Pruefung bei ${beiPruefung}, Aktion bei ${beiAktion}`);
melde('ohne Mitgliedschaft ist Schluss',
      /Kein Plattform-Administrator\.?"\s*\}, 403\)/.test(q));

// --- 5. Das Protokoll laesst sich nicht bereinigen ------------------------
const migration = path.join(WURZEL, 'supabase', 'migrations',
  '20261006240000_fork_52_plattform_protokoll.sql');
if (fs.existsSync(migration)) {
  const m = fs.readFileSync(migration, 'utf8');
  melde('das Protokoll ist durch einen Trigger geschuetzt',
        /before update or delete on public\.plattform_protokoll/.test(m),
        'eine Richtlinie allein reicht nicht: der Dienstschluessel umgeht sie');
  melde('es gibt keine Schreibrichtlinie fuer irgendeine Rolle',
        !/create policy[^;]*plattform_protokoll[^;]*for (insert|update|delete)/i.test(m));
  melde('lesen darf nur ein Plattform-Administrator',
        /for select to authenticated using \(public\.ist_plattform_admin\(\)\)/.test(m));
}

// --- 6. Die Tafel zeichnet ------------------------------------------------
if (fs.existsSync(TAFEL)) {
  const quelle = fs.readFileSync(TAFEL, 'utf8');
  const DATEN = {
    zahlen: { mrr_cent: 25998, abos_nach_status: { aktiv: 2, test: 1 },
      gruender_frei: 48, zeitraum_tage: 30, credits_verbraucht: 740,
      ki_kosten_eur: 1.2345, buchungen_ohne_kosten: 12,
      je_aktion: [{ aktion: 'ki_text', credits: 500, kosten: 0, mit: 0, ohne: 10 },
                  { aktion: 'bild_homestaging', credits: 240, kosten: 1.2345, mit: 8, ohne: 0 }] },
    mandanten: [{ id: 'a', name: 'Alpha GmbH', erstellt_am: '2026-01-02',
      tarif: 'starter', tarif_name: 'Starter', intervall: 'monat', status: 'aktiv',
      zugriff: 'voll', nutzer: 2, zusatznutzer: 1, saldo: 420, mrr_cent: 7998,
      periode_bis: '2026-12-01', mindestlaufzeit_bis: '2027-03-01' }],
    katalog: {
      tarife: [{ schluessel: 'starter', name: 'Starter', preis_monat_cent: 4999,
        preis_jahr_cent: 54989, inkl_nutzer: 1, credits_monat: 500,
        hinweis: 'Fuer Einzelmakler', empfohlen: false, aktiv: true }],
      credit_preise: [{ aktion: 'ki_text', name: 'KI-Text', credits: 2,
        beschreibung: 'Ein Absatz', aktiv: true }],
      credit_pakete: [{ schluessel: 'p250', name: '250 Credits', credits: 250,
        preis_cent: 999, gueltig_monate: 12, aktiv: true }],
      werte: [{ schluessel: 'testphase_tage', wert: 28, beschreibung: 'Tage' }],
    },
    protokoll: [{ id: '1', erstellt_am: '2026-10-06T10:00:00Z',
      aktion: 'credits_geschenkt', gegenstand: 'a',
      einzelheiten: { credits: 100, grund: 'Ausgleich fuer die Stoerung' } }],
  };

  for (const reiter of ['zahlen', 'mandanten', 'katalog', 'protokoll']) {
    let i = 0;
    const zustaende = [reiter, DATEN, '', null];
    const React = {
      createElement: (typ, props, ...kinder) => ({ typ,
        props: Object.assign({}, props || {},
          kinder.length ? { children: kinder.length === 1 ? kinder[0] : kinder } : {}) }),
      // Die ersten Aufrufe bekommen den vorgegebenen Zustand, alle
      // weiteren — die der inneren Reiter — ihren eigenen Anfangswert.
      // Ohne das bekaeme eine innere Tafel `undefined` statt ihres
      // Entwurfs und scheiterte an einer Stelle, die es in Wirklichkeit
      // nicht gibt.
      useState: (anfang) => {
        const w = i < zustaende.length ? zustaende[i] : anfang;
        i++;
        return [w, () => {}];
      },
      useEffect: () => {}, useCallback: (f) => f,
    };
    const fenster = { IMMO_CI: null,
      _sb: { functions: { invoke: () => Promise.resolve({ data: null }) } } };
    const umgebung = { React, window: fenster, console, JSON, Object, Number, String,
                       Array, Math, Date, isFinite, crypto: { randomUUID: () => 'x' } };
    vm.createContext(umgebung);
    vm.runInContext(quelle, umgebung, { filename: 'plattform.js' });
    if (typeof fenster.ImmoPlattform !== 'function') {
      melde('die Tafel meldet sich an', false);
      break;
    }
    // Die inneren Reiter benutzen eigene useState-Aufrufe; dafuer wird der
    // Zaehler fuer den jeweiligen Reiter weitergefuehrt.
    let text = '';
    const sammeln = (k, tiefe) => {
      tiefe = tiefe || 0;
      if (tiefe > 60 || k === null || k === undefined || k === false) return;
      if (typeof k === 'string' || typeof k === 'number') { text += k + ' '; return; }
      if (Array.isArray(k)) { k.forEach((x) => sammeln(x, tiefe + 1)); return; }
      if (!k.typ) return;
      if (typeof k.typ === 'function') {
        try { sammeln(k.typ(k.props || {}), tiefe + 1); }
        catch (e) { text += `[[FEHLER: ${e.message}]] `; }
        return;
      }
      sammeln(k.props && k.props.children, tiefe + 1);
    };
    try { sammeln(fenster.ImmoPlattform()); }
    catch (e) { text = `[[FEHLER: ${e.message}]]`; }
    melde(`Reiter "${reiter}" zeichnet sich`, !/\[\[FEHLER/.test(text), text.slice(0, 160));
    if (reiter === 'zahlen') {
      melde('Zahlen: der Monatserloes steht da', /259,98/.test(text), text.slice(0, 200));
      melde('Zahlen: fehlende Kostenangaben werden benannt',
            /ohne Kostenangabe/.test(text));
    }
    if (reiter === 'mandanten') {
      melde('Mandanten: das Haus steht da', /Alpha GmbH/.test(text));
      melde('Mandanten: und der Hinweis auf die Grenze',
            /nicht erreichbar/.test(text), text.slice(-200));
    }
    if (reiter === 'katalog') {
      melde('Katalog: die Tarife stehen da', /Tarife/.test(text));
      melde('Katalog: der Hinweis auf Stripe steht dabei',
            /stripe-einrichten\.mjs/.test(text));
    }
    if (reiter === 'protokoll') {
      melde('Protokoll: der Grund steht da', /Ausgleich/.test(text));
    }
  }

  melde('die Tafel fasst keine Tabelle selbst an',
        !/_sb\.from\(/.test(quelle),
        'alles geht ueber die Funktion, die die Mitgliedschaft prueft');
}

if (fehler) {
  console.log(`\n  ${fehler} von ${geprueft} Pruefungen gescheitert.`);
  process.exit(1);
}
console.log(`  [ok] ${geprueft} Pruefungen zum Plattform-Bereich:`);
console.log('       die Funktion fasst nur Plattform- und Vertragstabellen an,');
console.log('       keine Stripe-Kennung laesst sich von Hand setzen, jede');
console.log('       Aenderung steht in einem Protokoll, das niemand bereinigt.');
