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
  'plattform_notizen', 'plattform_kennzahlen_tag', 'plattform_mandanten_tag',
  'plattform_fixkosten', 'gutscheine', 'gutschein_einloesungen',
  'plattform_features', 'tarif_features', 'mandant_features',
  // Abbild der Stripe-Rechnungen (Kopfdaten) und der Abgleich: Vertragsdaten.
  'stripe_rechnungen', 'stripe_abgleich', 'system_fehler', 'dienst_aufrufe', 'stripe_ereignisse',
  // fork_77: Support-Anfragen sind an den Betreiber gerichtet — er liest und beantwortet sie.
  'support_anfragen', 'support_antworten',
  // fork_78: Steuerung — Plattformtabellen; die vier Vorlagentabellen NUR fuer
  // Zeilen ohne Mandant (globale Vorlagen), siehe VORLAGEN in der Funktion.
  'plattform_ki_einstellungen', 'mandant_ki_limits', 'system_mail_vorlagen', 'rechtstexte',
  'rechtstext_zustimmungen', 'ankuendigungen', 'expose_vorlagen', 'vertragsvorlagen', 'mpe_bausteine', 'marketing_print_vorlagen',
  // fork_79: Warnregeln und ausgeloeste Warnungen des Betreibers.
  'plattform_warnregeln', 'plattform_warnungen',
  // Nur GEZAEHLT (head: true) fuer "Technikfehler 24 h"; keine Meldung geht hinaus.
  'fehler_protokoll',
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
  ['ein Passwort zuruecksetzen', /aktion === "passwort_zuruecksetzen"/],
  ['Supportzugriff beginnen', /aktion === "support_start"/],
  ['und beenden', /aktion === "support_ende"/],
]) {
  melde(name, muster.test(q));
}
// Hooks nach einem fruehen `return` — React-Fehler #310 ("Rendered more
// hooks than during the previous render"), sobald die Daten nachkommen und
// der Zweig hinter dem return erstmals laeuft. Am 07.10.2026 live in
// MandantTafel und Katalog passiert; der Tafeltest sah es nicht, weil sein
// useState-Ersatz die Reihenfolge nicht prueft. Deshalb statisch.
{
  const zeilen = fs.readFileSync(TAFEL, 'utf8').split('\n');
  const befunde = [];
  let fn = null, erstesReturn = null;
  zeilen.forEach((z, idx) => {
    const m = z.match(/^  function ([A-Z]\w*)\(/);
    if (m) { fn = m[1]; erstesReturn = null; return; }
    if (!fn) return;
    if (erstesReturn === null && /^    (if \(.*\) )?return /.test(z)) erstesReturn = idx + 1;
    if (erstesReturn && /^    .*React\.use(State|Effect|Callback|Memo|Ref)\(/.test(z)) befunde.push(`${fn}:${idx + 1}`);
  });
  melde('kein Hook steht hinter einem fruehen return (React #310)', befunde.length === 0, befunde.join(', '));
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
// fork_77: 24 Stunden, weil der Chef sie gewaehrt — nicht mehr der Admin sich selbst.
melde('die Dauer ist nach oben begrenzt', /Math\.min\(1440/.test(q));
melde('ein Supportzugriff verlangt einen Grund, den der Mandant lesen kann',
      /der Mandant kann ihn nachlesen/.test(q));
// Die Zurueckseten-Mail geht an die HINTERLEGTE Adresse. Eine Adresse aus
// dem Aufruf waere ein Weg, jedes Konto zu uebernehmen.
melde('die Zuruecksetzen-Mail geht an die hinterlegte Adresse',
      /from\("profiles"\)[\s\S]{0,200}?select\("email, name"\)[\s\S]{0,400}?resetPasswordForEmail\(String\(profil\.email\)/.test(q),
      'eine Adresse aus dem Aufruf waere ein Weg, ein Konto zu uebernehmen');
melde('und sie wird protokolliert',
      /protokoll\("passwort_zuruecksetzen"/.test(q));

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
    konten: [{ id: 'u1', name: 'Chefin', email: 'chefin@pruef.example',
      role: 'chef', haus: 'Alpha GmbH', plattform_admin: true },
      { id: 'u2', name: 'Mitarbeiter', email: 'mit@pruef.example',
        role: 'mitarbeiter', haus: 'Alpha GmbH', plattform_admin: false }],
    system: {
      tage: 7,
      cron: [{ jobname: 'mail-postfach-pull-5min', zeitplan: '*/5 * * * *',
        aktiv: true, letzter_lauf: '2026-10-06T11:55:00Z', letzter_stand: 'succeeded',
        laeufe_24h: 288, fehler_24h: 0 },
        { jobname: 'akq-mail-leads-20min', zeitplan: '8,28,48 * * * *', aktiv: true,
          letzter_lauf: '2026-10-06T11:48:00Z', letzter_stand: 'failed',
          laeufe_24h: 72, fehler_24h: 9 }],
      oberflaeche: [{ mandant_id: 'a', mandant_name: 'Alpha GmbH', schluessel: 'PGRST116',
        quelle: 'kalender', anzahl: 47, offen: 47, zuletzt: '2026-10-06T10:00:00Z' }],
      status: [{ dienst: 'Zeitplan (pg_cron)', stand: 'rot', text: '1 Job(s) mit Fehlern, 0 still' },
        { dienst: 'E-Mail-Zustellung', stand: 'grau', text: 'kein Zustellprotokoll' }],
      laeufe: [{ jobname: 'akq-mail-leads-20min', start: '2026-10-06T11:48:00Z', ende: '2026-10-06T11:48:02Z',
        status: 'failed', meldung: 'ERROR: connection refused' }],
      webhooks: [{ id: 'evt_pruef1', typ: 'invoice.paid', empfangen_am: '2026-10-06T09:00:00Z',
        verarbeitet_am: '2026-10-06T09:00:01Z', fehler: null }],
      fehler: [{ id: 'f1', zeit: '2026-10-06T08:00:00Z', funktion: 'plattform-stripe-abgleich',
        meldung: 'Stripe 429', betrifft_mandant_id: null, erledigt_am: null, name: null }],
      haengend: [{ vorgang_id: 'c0ffee00-0000-0000-0000-000000000001', mandant_id: 'a', name: 'Alpha GmbH',
        aktion: 'ki_text', credits: 3, zeitpunkt: '2026-10-05T08:00:00Z' }],
      dienste: [], stunden: 24, stripe_modus: 'test',
    },
    support: {
      kennzahlen: { offen: 2, offen_aelter_24h: 1, hoch_offen: 1, erste_antwort_median_h: 3.5, loesung_median_h: 20,
        je_kategorie: { fehler: 2 }, uebernahmen: {}, zugriffe_offen: 1, zugriffe_laufend: 0 },
      anfragen: [{ id: 'anf1', mandant_id: 'a', mandant_name: 'Alpha GmbH', betreff: 'Bilder fehlen im Expose', kategorie: 'fehler',
        prioritaet: 'hoch', status: 'offen', zustaendig_name: null, erstellt_am: '2026-10-06T08:00:00Z', aktualisiert_am: '2026-10-06T08:00:00Z' }],
      zugriffe: [{ id: 'z1', mandant_id: 'a', mandant_name: 'Alpha GmbH', admin_name: 'Owner', schreiben: false, dauer_minuten: 60,
        begonnen_am: '2026-10-06T09:00:00Z', freigegeben_am: null, abgelehnt_am: null, gueltig_bis: '2026-10-06T10:00:00Z', beendet_am: null, grund: 'Ticket anf1' }],
      admins: [{ id: 'o', name: 'Owner' }], stripe_modus: 'test',
    },
    ki: {
      ki: [{ funktion: 'ki_text', name: 'Texte', anbieter: 'anthropic', modell: 'claude-sonnet-4-6', temperatur: null, max_tokens: null, aktiv: true, hinweis: null },
        { funktion: 'bild_homestaging', name: 'Bild-KI: Homestaging', anbieter: 'replicate', modell: 'siehe Funktion', temperatur: null, max_tokens: null, aktiv: false, hinweis: 'Bild-KI heute gestoert' }],
      werte: { ki_tageslimit_credits: 0, ki_tageslimit_eur: 0, alarm_kosten_tag_eur: 50 },
      limits: [{ mandant_id: 'a', name: 'Alpha GmbH', credits_tag: 40, eur_tag: null, notiz: 'Probe' }],
      heute: [{ mandant_id: 'a', name: 'Alpha GmbH', credits: 12, eur: 0.4 }], mandanten: [{ id: 'a', name: 'Alpha GmbH' }],
    },
    vorlagen: {
      gruppen: { expose: { name: 'Expose-Systemvorlagen', aktivSpalte: 'archiviert', aktivWert: false } },
      vorlagen: { expose: [{ id: 'v1', name: 'Raster Klassik', basis: 'raster', version: 2, ist_standard: true, archiviert: false }] },
    },
    recht: {
      texte: [{ id: 'r1', art: 'agb', version: '2.0', titel: 'AGB 2.0', gueltig_ab: '2026-11-01', zustimmung_noetig: true, veroeffentlicht_am: '2026-10-06T10:00:00Z' }],
      stand: [{ rechtstext_id: 'r1', art: 'agb', version: '2.0', zugestimmt: 3, mandanten: 7 }],
    },
    hinweise: {
      liste: [{ id: 'k1', typ: 'wartung', titel: 'Wartung Samstag', text: 'Ab 22 Uhr', von: '2026-10-11T20:00:00Z', bis: '2026-10-11T23:00:00Z', schliessbar: false, ziel_tarife: null, ziel_status: null, ziel_mandanten: null, mail_an_chefs: true, mail_gesendet_am: null }],
      mandanten: [{ id: 'a', name: 'Alpha GmbH' }], tarife: [{ schluessel: 'starter', name: 'Starter' }],
    },
    warnungen: {
      regeln: [{ schluessel: 'zahlung_fehlgeschlagen', name: 'Zahlung fehlgeschlagen', aktiv: true, kanal: ['email'], schwelle: null },
        { schluessel: 'job_webhook_fehler', name: 'Job-/Webhook-Fehler > N in 1 h', aktiv: true, kanal: ['email'], schwelle: 3 }],
      liste: [{ id: 'w1', regel: 'zahlung_fehlgeschlagen', zeit: '2026-10-06T09:00:00Z', text: 'Alpha GmbH: Zahlung fehlgeschlagen seit 01.10.2026', gesendet_am: null, gelesen_am: null, mandant_id: 'a' }],
      werte: { betreiber_email: '', zusammenfassung_aktiv: true }, demo: 0,
    },
    mandant: {
      mandant: { id: 'a', name: 'Alpha GmbH', slug: 'alpha', erstellt_am: '2026-01-02',
        testphase_bis: null, gesperrt_am: null },
      abo: { tarif: 'starter', status: 'aktiv', intervall: 'monat', zusatznutzer: 1,
        mindestlaufzeit_bis: '2027-03-01' },
      nutzer: [{ id: 'u1', name: 'Chefin', email: 'chefin@pruef.example',
        role: 'chef', funktion: 'Inhaberin' }],
      konten: [{ quelle: 'tarif', credits: 500, verbraucht: 80,
        gueltig_bis: '2026-11-01', referenz: 'tarif:2026-10' }],
      buchungen: [], erinnerungen: [],
      sitzungen: [{ id: 's1', begonnen_am: '2026-10-05T09:00:00Z', schreiben: false,
        grund: 'Kunde meldet fehlende Bilder' }],
      saldo: 420, zugriff: 'voll', nutzer_limit: 2,
    },
  };

  for (const reiter of ['zahlen', 'mandanten', 'konten', 'katalog', 'system', 'support',
                        'ki', 'vorlagen', 'recht', 'hinweise', 'warnungen', 'protokoll', 'DETAIL']) {
    let i = 0;
    const detail = reiter === 'DETAIL';
    // Reihenfolge der useState-Aufrufe: reiter, daten, fehler, meldung,
    // offen, support — und seit fork_68: wer (Rolle, zweiter Faktor
    // bestanden) und gesperrt (Sitzungssperre).
    const zustaende = [detail ? 'mandanten' : reiter, DATEN, '', null,
                       detail ? 'a' : null,
                       detail ? { mandant_name: 'Alpha GmbH', schreiben: false,
                                  gueltig_bis: '2026-10-06T12:00:00Z' } : null,
                       { lade: false, rolle: 'owner', mfa_pflicht: true }, false];
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
      if (k.props && typeof k.props.href === 'string') text += k.props.href + ' ';
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
    if (reiter === 'konten') {
      melde('Konten: beide Zeilen stehen da',
            /Chefin/.test(text) && /Mitarbeiter/.test(text));
      melde('Konten: der Plattform-Administrator ist erkennbar',
            /Administrator/.test(text));
      melde('Konten: und der Hinweis, was das Recht NICHT oeffnet',
            /Supportzugriff/.test(text), text.slice(-220));
    }
    if (reiter === 'system') {
      melde('System: der gescheiterte Job faellt auf',
            /akq-mail-leads-20min/.test(text) && /failed/.test(text));
      melde('System: die Fehler eines Hauses stehen da',
            /PGRST116/.test(text) && /47/.test(text));
      melde('Technik: die Ampel steht da', /Zeitplan \(pg_cron\)/.test(text) && /1 Job\(s\) mit Fehlern/.test(text));
      melde('Technik: der Webhook verweist in den Stripe-Testmodus',
            /dashboard\.stripe\.com\/test\/events\/evt_pruef1/.test(text));
      melde('Technik: kein „Erneut verarbeiten" fuer Webhooks, Stripe sendet selbst',
            /gibt es hier nicht: Stripe selbst/.test(text));
      melde('Technik: der Funktionsfehler steht da', /plattform-stripe-abgleich/.test(text) && /Stripe 429/.test(text));
      melde('Technik: die haengende Reservierung ist freigebbar', /c0ffee00/.test(text) && /Freigeben/.test(text));
      melde('System: und es wird gesagt, warum der Wortlaut fehlt',
            /Supportzugriff/.test(text), text.slice(-200));
    }
    if (reiter === 'support') {
      melde('Support: die Anfrage steht da', /Bilder fehlen im Expose/.test(text) && /Alpha GmbH/.test(text));
      melde('Support: die Zugriffsanfrage wartet auf den Chef', /wartet/.test(text) && /Ticket anf1/.test(text));
      melde('Support: die Tafel sagt, dass nur der Chef freigibt',
            /Freigeben kann nur der Chef des Hauses/.test(text));
    }
    if (reiter === 'ki') {
      melde('KI: der Notschalter faellt auf', /AUS/.test(text) && /Einschalten/.test(text));
      melde('KI: Ausnahme je Mandant steht da', /Alpha GmbH/.test(text) && /Credits: 40/.test(text));
    }
    if (reiter === 'vorlagen') {
      melde('Vorlagen: die Systemvorlage steht da', /Raster Klassik/.test(text) && /Standard/.test(text));
    }
    if (reiter === 'recht') {
      melde('Recht: X von Y Zustimmungen', /3 von 7/.test(text));
      melde('Recht: Hinweis auf anwaltliche Pruefung', /anwaltliche Prüfung/.test(text));
    }
    if (reiter === 'hinweise') {
      melde('Ankuendigungen: die Wartung steht da, nicht schliessbar', /Wartung Samstag/.test(text) && /nicht schließbar/.test(text));
    }
    if (reiter === 'warnungen') {
      melde('Warnungen: die Regel steht da', /Zahlung fehlgeschlagen/.test(text));
      melde('Warnungen: ohne Betreiber-Adresse wird gewarnt', /keine Adresse|Adresse fehlt|Betreiber-Adresse/.test(text));
      melde('Warnungen: die Demo-Daten lassen sich anlegen', /Demo-Mandanten anlegen/.test(text));
    }
    if (detail) {
      melde('Detail: das Haus steht da', /Alpha GmbH/.test(text));
      melde('Detail: der Saldo auch', /420/.test(text));
      melde('Detail: die Konten des Hauses auch', /Inhaberin/.test(text));
      melde('Detail: bisherige Supportzugriffe stehen da',
            /Kunde meldet fehlende Bilder/.test(text));
      melde('Detail: ein laufender Zugriff wird oben angezeigt',
            /Supportzugriff läuft/.test(text), text.slice(0, 200));
      melde('Detail: das Loeschen verlangt den Namen',
            /Namen des Hauses eintragen/.test(text));
      melde('Detail: und sagt, was mitgeht',
            /Objekte, Kontakte, Mails, Dateien/.test(text));
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
