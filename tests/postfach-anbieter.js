// Lässt sich ein Postfach bei Microsoft oder Google wirklich verbinden?
//
// Die beiden Funktionen postfach-anbieter-start und -rueckruf kann niemand
// im Betrieb halb ausprobieren: am Ende der Kette stehen Microsoft und
// Google, und was dazwischen schiefgeht, sieht der Makler als
// "Verbindung fehlgeschlagen". Also laufen sie hier wirklich — gegen ein
// nachgebautes Supabase und einen nachgebauten Anbieter.
//
// Geprüft wird, was wehtut:
//   * Die Zustimmungs-Adresse enthält die richtigen Bereiche, die
//     Rückleitung und einen Zustand, der nicht erraten werden kann.
//   * Der Zustand gilt EINMAL. Ein zweiter Rückruf mit demselben Zustand
//     legt kein zweites Postfach an.
//   * Mandant und Nutzer kommen aus dem Vorgang, nicht aus dem Aufruf —
//     der Rückruf ist öffentlich.
//   * Die Tokens liegen verschlüsselt in der Zeile, nicht im Klartext.
//   * Ein fremdes Postfach lässt sich nicht "neu verbinden".
//   * XOAUTH2 ist byte-genau das Verfahren der Anbieter.
//   * Die Erneuerung behält das Erneuerungs-Token von Google (das keines
//     mitschickt) und übernimmt das neue von Microsoft (das rotiert).
//
// Ohne Deno läuft keine Edge Function; deshalb wird der Quelltext hier zu
// gewöhnlichem JavaScript gemacht (die Typen fallen weg) und mit einem
// nachgebauten Deno, fetch und crypto ausgeführt — derselbe Weg wie in
// tests/expose-funktion.js.
const fs = require('fs');
const os = require('os');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const FUNKTIONEN = path.join(WURZEL, 'supabase', 'functions');
const BEILAGEN = path.join(WURZEL, 'supabase', 'eigene-beilagen');
const EIGENE = path.join(WURZEL, 'supabase', 'eigene');

let fehler = 0;
let geprueft = 0;
const melde = (t, ok, zusatz) => {
  geprueft++;
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${t}${zusatz ? ' — ' + zusatz : ''}`);
};

// --- 1. Alle Kopien der Anbieter-Schicht sind gleich -----------------------
// Sie liegt in vier Ordnern (zwei eigene Funktionen, zwei Beilagen). Vier
// Fassungen derselben Verschluesselung waeren vier Fassungen, von denen eine
// irgendwann anders verschluesselt als die andere entschluesselt.
{
  const orte = [
    path.join(EIGENE, 'postfach-anbieter-start', 'anbieter.ts'),
    path.join(EIGENE, 'postfach-anbieter-rueckruf', 'anbieter.ts'),
    path.join(BEILAGEN, 'mail-postfach-pull', 'anbieter.ts'),
    path.join(BEILAGEN, 'mail-senden', 'anbieter.ts'),
    path.join(FUNKTIONEN, 'mail-postfach-pull', 'anbieter.ts'),
    path.join(FUNKTIONEN, 'mail-senden', 'anbieter.ts'),
  ];
  const da = orte.filter((o) => fs.existsSync(o));
  melde('Die Anbieter-Schicht liegt in allen sechs Ordnern', da.length === orte.length,
        orte.filter((o) => !fs.existsSync(o)).join(', '));
  const summen = new Set(da.map((o) => fs.readFileSync(o, 'utf-8')));
  melde('Alle Kopien der Anbieter-Schicht sind byte-gleich', summen.size <= 1,
        `${summen.size} verschiedene Fassungen`);
}

// --- Das Modul laden -------------------------------------------------------
// Mit tsc, nicht mit der Hand: ein Schnitt durch die Typen mit regulaeren
// Ausdruecken ist genau so lange richtig, bis jemand ein Fragezeichen in
// eine Signatur schreibt. Uebersetzt wird in einen Temporaerordner; die
// Deno-Besonderheiten (jsr:-Importe, Deno.serve) werden vorher auf
// gewoehnliche globale Namen gebogen, die der Test selbst stellt.
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-postfach-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

function uebersetzen(ordner, dateien) {
  const quelle = path.join(tmp, 'q-' + path.basename(ordner));
  fs.mkdirSync(quelle, { recursive: true });
  for (const datei of dateien) {
    let text = fs.readFileSync(path.join(ordner, datei), 'utf-8');
    // jsr:-Importe gibt es in Node nicht. Was sie bringen, stellt der Test
    // als globalen Namen bereit.
    text = text.replace(/^import\s+"jsr:[^"]*";\s*$/gm, '')
      .replace(/^import\s*\{([^}]*)\}\s*from\s*"jsr:[^"]*";\s*$/gm,
               (_m, namen) => `declare const ${namen.trim()}: any;`)
      .replace(/from "\.\/anbieter\.ts"/g, 'from "./anbieter"');
    if (!/declare const Deno/.test(text)) text = 'declare const Deno: any;\n' + text;
    fs.writeFileSync(path.join(quelle, datei), text, 'utf-8');
  }
  const ziel = path.join(tmp, 'js-' + path.basename(ordner));
  try {
    execFileSync('tsc', dateien.map((d) => path.join(quelle, d)).concat([
      '--outDir', ziel, '--module', 'commonjs', '--target', 'es2022',
      '--skipLibCheck', '--esModuleInterop', '--lib', 'es2022,dom',
    ]), { stdio: 'pipe', cwd: os.tmpdir() });
  } catch (f) {
    // tsc beendet sich bei Typfehlern mit 2, schreibt aber trotzdem. Nur
    // wenn nichts herauskommt, ist es ein echter Fehler.
    const fehlt = dateien.filter((d) =>
      !fs.existsSync(path.join(ziel, d.replace(/\.ts$/, '.js'))));
    if (fehlt.length) {
      console.log('  [FEHLER] tsc hat nichts geschrieben: ' + fehlt.join(', '));
      console.log(String((f.stdout || '') + (f.stderr || '')).slice(0, 1200));
      process.exit(1);
    }
  }
  return ziel;
}

// --- Die Umgebung einer Edge Function --------------------------------------
// Deno, fetch und createClient sind globale Namen. Sie werden EINMAL gesetzt
// und lesen aus AKTUELL — nicht pro Aufruf gesetzt und danach
// zurueckgenommen: die Funktionen arbeiten asynchron weiter, und ein
// zurueckgenommenes Deno trifft sie mitten im Lauf.
const AKTUELL = { umgebung: {}, fetchStub: null, db: null, handler: null };
globalThis.Deno = {
  env: { get: (n) => AKTUELL.umgebung[n] || '' },
  serve: (h) => { AKTUELL.handler = h; },
};
globalThis.fetch = (...a) => {
  if (!AKTUELL.fetchStub) throw new Error('Kein Netz im Test — fetch nicht gestellt.');
  return AKTUELL.fetchStub(...a);
};
globalThis.createClient = () => AKTUELL.db;

function mitUmgebung(umgebung, fetchStub, db, fn) {
  AKTUELL.umgebung = umgebung || {};
  AKTUELL.fetchStub = fetchStub;
  AKTUELL.db = db;
  AKTUELL.handler = null;
  return { raus: fn(), handler: () => AKTUELL.handler };
}

const JS_START = uebersetzen(path.join(EIGENE, 'postfach-anbieter-start'),
                             ['anbieter.ts', 'index.ts']);
const JS_RUECKRUF = uebersetzen(path.join(EIGENE, 'postfach-anbieter-rueckruf'),
                                ['anbieter.ts', 'index.ts']);

/**
 * Die Anbieter-Schicht, frisch geladen.
 *
 * Frisch, weil der Test einen Lauf ohne GOOGLE_CLIENT_ID braucht — und
 * weil jede Pruefung ihren eigenen fetch-Nachbau mitbringt.
 */
function ladeAnbieter(umgebung, fetchStub) {
  const pfad = path.join(JS_START, 'anbieter.js');
  delete require.cache[require.resolve(pfad)];
  return mitUmgebung(umgebung, fetchStub, null, () => require(pfad)).raus;
}

const UMGEBUNG = {
  SUPABASE_URL: 'https://projekt.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'dienst',
  MAIL_SECRET_KEY: 'geheim-fuer-den-test',
  MICROSOFT_CLIENT_ID: 'ms-id',
  MICROSOFT_CLIENT_SECRET: 'ms-geheim',
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-geheim',
  PORTAL_URL: 'https://portal.beispiel.test',
};

/** Ein id_token, wie es der Anbieter schickt: drei Teile, Mitte base64url. */
function idToken(adresse) {
  const teil = Buffer.from(JSON.stringify({ email: adresse })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `kopf.${teil}.signatur`;
}

(async () => {
  // --- 2. Die Anbieter-Schicht selbst ------------------------------------
  {
    const A = ladeAnbieter(UMGEBUNG, async () => { throw new Error('kein Netz im Test'); });

    melde('Microsoft und Google sind die bekannten Anbieter',
          Object.keys(A.ANBIETER).sort().join(',') === 'google,microsoft',
          Object.keys(A.ANBIETER).join(','));

    const ms = A.ANBIETER.microsoft;
    melde('Microsoft fragt IMAP und SMTP ab, dazu ein Erneuerungs-Token',
          ms.bereiche.includes('IMAP.AccessAsUser.All')
          && ms.bereiche.includes('SMTP.Send')
          && ms.bereiche.includes('offline_access'), ms.bereiche);
    melde('Microsoft nimmt die Outlook-Server',
          ms.imap.server === 'outlook.office365.com' && ms.smtp.server === 'smtp.office365.com');
    const g = A.ANBIETER.google;
    melde('Google fragt den Postfach-Bereich ab',
          g.bereiche.includes('https://mail.google.com/'), g.bereiche);
    melde('Google bittet um dauerhaften Zugriff',
          g.extra.access_type === 'offline', JSON.stringify(g.extra));
    melde('Google nimmt die Gmail-Server',
          g.imap.server === 'imap.gmail.com' && g.smtp.server === 'smtp.gmail.com');

    melde('Die Rueckleitung zeigt auf die Rueckruf-Funktion',
          A.rueckrufAdresse()
          === 'https://projekt.supabase.co/functions/v1/postfach-anbieter-rueckruf',
          A.rueckrufAdresse());

    // XOAUTH2: base64("user=…\x01auth=Bearer …\x01\x01"). Ein Zeichen zu
    // viel und der Server antwortet mit einem leeren Fehler.
    const xo = A.xoauth2('max@beispiel.test', 'TOKEN123');
    melde('XOAUTH2 ist byte-genau das Verfahren der Anbieter',
          Buffer.from(xo, 'base64').toString('binary')
          === 'user=max@beispiel.test\x01auth=Bearer TOKEN123\x01\x01',
          JSON.stringify(Buffer.from(xo, 'base64').toString('binary')));

    // Verschluesselung: dasselbe Format wie das Postfach-Passwort.
    const ver = await A.verschluessele('sehr-geheim');
    melde('Verschluesselt wird im Format v1.<iv>.<ct>', /^v1\.[^.]+\.[^.]+$/.test(ver), ver);
    melde('Im verschluesselten Text steht der Klartext nicht',
          !ver.includes('sehr-geheim'));
    melde('Entschluesseln ergibt den Klartext',
          (await A.entschluessele(ver)) === 'sehr-geheim');

    melde('Die Adresse kommt aus dem id_token',
          A.adresseAusIdToken(idToken('frau.makler@beispiel.test'))
          === 'frau.makler@beispiel.test');
    melde('Ein id_token ohne Adresse ergibt keine erfundene',
          A.adresseAusIdToken('kaputt') === '');

    // Ein nicht eingerichteter Anbieter sagt es, statt den Nutzer zum
    // Anbieter zu schicken, wo eine unverstaendliche Seite steht.
    const ohne = ladeAnbieter({ ...UMGEBUNG, GOOGLE_CLIENT_ID: '' },
                              async () => { throw new Error('kein Netz'); });
    let gemeldet = '';
    try { ohne.zugang(ohne.ANBIETER.google); } catch (f) { gemeldet = f.message; }
    melde('Ein nicht eingerichteter Anbieter wird frueh gemeldet',
          /GOOGLE_CLIENT_ID/.test(gemeldet), gemeldet);
  }

  // --- 3. Die Erneuerung des Tokens --------------------------------------
  {
    const gerufen = [];
    const A = ladeAnbieter(UMGEBUNG, async (url, o) => {
      gerufen.push([String(url), new URLSearchParams(o.body)]);
      const felder = new URLSearchParams(o.body);
      // Microsoft dreht das Erneuerungs-Token mit, Google nicht.
      const istMs = String(url).includes('microsoftonline');
      return {
        ok: true,
        json: async () => ({
          access_token: 'NEU-' + (istMs ? 'MS' : 'G'),
          expires_in: 3600,
          ...(istMs ? { refresh_token: 'REFRESH-NEU' } : {}),
        }),
      };
    });

    const alt = await A.verschluessele('REFRESH-ALT');
    const msNeu = await A.zugriffstoken({
      anbieter: 'microsoft', email_adresse: 'max@beispiel.test',
      oauth_refresh_verschluesselt: alt, oauth_gueltig_bis: null,
    });
    melde('Ein abgelaufenes Token wird erneuert', msNeu.token === 'NEU-MS', msNeu.token);
    melde('Microsofts neues Erneuerungs-Token wird uebernommen',
          !!msNeu.neu.oauth_refresh_verschluesselt
          && (await A.entschluessele(msNeu.neu.oauth_refresh_verschluesselt)) === 'REFRESH-NEU');
    melde('Die neue Gueltigkeit steht in der Zukunft',
          new Date(msNeu.neu.oauth_gueltig_bis).getTime() > Date.now() + 3_000_000,
          String(msNeu.neu.oauth_gueltig_bis));

    const gNeu = await A.zugriffstoken({
      anbieter: 'google', email_adresse: 'max@gmail.test',
      oauth_refresh_verschluesselt: alt, oauth_gueltig_bis: null,
    });
    melde('Googles Erneuerungs-Token bleibt stehen, wenn keines mitkommt',
          gNeu.neu.oauth_refresh_verschluesselt === undefined,
          JSON.stringify(Object.keys(gNeu.neu)));

    // Ein gueltiges Token wird NICHT erneuert — sonst holt jeder Abruf ein
    // neues, und der Anbieter begrenzt das.
    const vorher = gerufen.length;
    const gueltig = await A.zugriffstoken({
      anbieter: 'microsoft', email_adresse: 'max@beispiel.test',
      oauth_zugriff_verschluesselt: await A.verschluessele('NOCH-GUELTIG'),
      oauth_gueltig_bis: new Date(Date.now() + 3600_000).toISOString(),
      oauth_refresh_verschluesselt: alt,
    });
    melde('Ein gueltiges Token wird weiterbenutzt',
          gueltig.token === 'NOCH-GUELTIG' && gerufen.length === vorher,
          `${gueltig.token}, ${gerufen.length - vorher} Anfragen`);

    // Ohne Erneuerungs-Token gibt es keine stille Weiterfahrt.
    let sagte = '';
    try {
      await A.zugriffstoken({ anbieter: 'google', email_adresse: 'x@y.z' });
    } catch (f) { sagte = f.message; }
    melde('Ohne Erneuerungs-Token wird zum Neuverbinden aufgefordert',
          /neu verbinden/i.test(sagte), sagte);
  }

  // --- 4. Die beiden Funktionen -----------------------------------------
  const { nachbau } = ladeNachbau();
  const start = await ladeFunktion('postfach-anbieter-start');
  const rueckruf = await ladeFunktion('postfach-anbieter-rueckruf');

  // 4a. Die Zustimmungs-Adresse
  const db1 = nachbau();
  const a1 = await start.ruf(db1, {
    kopf: { authorization: 'Bearer nutzer-1' },
    koerper: { anbieter: 'microsoft' },
  });
  melde('Start antwortet mit ok', a1.stand === 200 && a1.inhalt.ok === true,
        JSON.stringify(a1.inhalt).slice(0, 200));
  let zustand = '';
  if (a1.inhalt.url) {
    const u = new URL(a1.inhalt.url);
    zustand = u.searchParams.get('state') || '';
    melde('Die Adresse zeigt zu Microsoft',
          u.host === 'login.microsoftonline.com', u.host);
    melde('Die Anwendungs-ID der Plattform geht mit',
          u.searchParams.get('client_id') === 'ms-id');
    melde('Die Rueckleitung zeigt auf die Rueckruf-Funktion',
          String(u.searchParams.get('redirect_uri')).endsWith('/postfach-anbieter-rueckruf'));
    melde('Der Zustand ist lang genug, um nicht geraten zu werden',
          zustand.length >= 40, `${zustand.length} Zeichen`);
    melde('Der Vorgang steht in der Datenbank, mit Nutzer und Mandant',
          db1.zeilen.mail_oauth_vorgaenge.length === 1
          && db1.zeilen.mail_oauth_vorgaenge[0].benutzer_id === 'nutzer-1'
          && db1.zeilen.mail_oauth_vorgaenge[0].mandant_id === 'mandant-1',
          JSON.stringify(db1.zeilen.mail_oauth_vorgaenge[0]));
  }

  // 4b. Ohne Anmeldung geht nichts
  const a2 = await start.ruf(nachbau(), { kopf: {}, koerper: { anbieter: 'google' } });
  melde('Ohne Anmeldung lehnt Start ab', a2.stand === 401, String(a2.stand));

  // 4c. Ein fremdes Postfach laesst sich nicht neu verbinden
  const db3 = nachbau();
  db3.zeilen.mail_postfaecher.push({
    id: 'pf-fremd', benutzer_id: 'nutzer-2', email_adresse: 'fremd@beispiel.test',
  });
  const a3 = await start.ruf(db3, {
    kopf: { authorization: 'Bearer nutzer-1' },
    koerper: { anbieter: 'microsoft', postfach_id: 'pf-fremd' },
  });
  melde('Ein fremdes Postfach laesst sich nicht neu verbinden',
        a3.stand === 403, `${a3.stand} ${JSON.stringify(a3.inhalt)}`);

  // 4d. Der Rueckruf legt das Postfach an
  const db4 = nachbau();
  db4.zeilen.mail_oauth_vorgaenge.push({
    id: 'v-1', mandant_id: 'mandant-1', benutzer_id: 'nutzer-1',
    anbieter: 'google', zustand: 'ZUSTAND-1', postfach_id: null,
    weiter_zu: 'https://portal.beispiel.test/einstellungen',
    erstellt_am: new Date().toISOString(), verbraucht_am: null,
  });
  const r1 = await rueckruf.ruf(db4, { suche: { code: 'CODE-1', state: 'ZUSTAND-1' } });
  melde('Der Rueckruf antwortet mit einer Seite',
        r1.stand === 200 && /verbunden/i.test(r1.text), `${r1.stand} ${r1.text.slice(0, 160)}`);
  const pf = db4.zeilen.mail_postfaecher[0];
  melde('Das Postfach ist angelegt', !!pf, JSON.stringify(db4.zeilen.mail_postfaecher));
  if (pf) {
    melde('Mandant und Nutzer kommen aus dem Vorgang',
          pf.mandant_id === 'mandant-1' && pf.benutzer_id === 'nutzer-1',
          JSON.stringify([pf.mandant_id, pf.benutzer_id]));
    melde('Die Adresse kommt vom Anbieter, nicht aus dem Aufruf',
          pf.email_adresse === 'konto@gmail.test', String(pf.email_adresse));
    melde('Der Anbieter steht am Postfach', pf.anbieter === "google", String(pf.anbieter));
    melde('Die Gmail-Server stehen am Postfach',
          pf.imap_server === 'imap.gmail.com' && pf.smtp_server === 'smtp.gmail.com'
          && pf.imap_aktiv === true,
          JSON.stringify([pf.imap_server, pf.smtp_server, pf.imap_aktiv]));
    melde('Die Tokens liegen verschluesselt in der Zeile',
          /^v1\./.test(String(pf.oauth_refresh_verschluesselt))
          && !JSON.stringify(pf).includes('REFRESH-GEHEIM'),
          String(pf.oauth_refresh_verschluesselt).slice(0, 12));
    melde('Ein Passwort steht nicht mehr daran',
          pf.smtp_passwort_verschluesselt === null
          && pf.imap_passwort_verschluesselt === null);
    melde('Der Absendername kommt aus dem Profil',
          pf.absender_name === 'Maria Muster', String(pf.absender_name));
  }
  melde('Der Vorgang ist verbraucht',
        !!db4.zeilen.mail_oauth_vorgaenge[0].verbraucht_am);

  // 4e. Derselbe Zustand ein zweites Mal
  const r2 = await rueckruf.ruf(db4, { suche: { code: 'CODE-1', state: 'ZUSTAND-1' } });
  melde('Ein zweiter Rueckruf mit demselben Zustand wird abgelehnt',
        r2.stand === 400 && /abgelaufen|benutzt/i.test(r2.text), r2.text.slice(0, 160));
  melde('Und er legt kein zweites Postfach an',
        db4.zeilen.mail_postfaecher.length === 1,
        String(db4.zeilen.mail_postfaecher.length));

  // 4f. Ein abgelaufener Vorgang
  const db5 = nachbau();
  db5.zeilen.mail_oauth_vorgaenge.push({
    id: 'v-alt', mandant_id: 'mandant-1', benutzer_id: 'nutzer-1',
    anbieter: 'microsoft', zustand: 'ZUSTAND-ALT', postfach_id: null,
    erstellt_am: new Date(Date.now() - 3600_000).toISOString(), verbraucht_am: null,
  });
  const r3 = await rueckruf.ruf(db5, { suche: { code: 'C', state: 'ZUSTAND-ALT' } });
  melde('Ein abgelaufener Vorgang wird abgelehnt',
        r3.stand === 400 && db5.zeilen.mail_postfaecher.length === 0,
        `${r3.stand}, ${db5.zeilen.mail_postfaecher.length} Postfaecher`);

  // 4g. Ein unbekannter Zustand
  const db6 = nachbau();
  const r4 = await rueckruf.ruf(db6, { suche: { code: 'C', state: 'ERFUNDEN' } });
  melde('Ein unbekannter Zustand legt nichts an',
        r4.stand === 400 && db6.zeilen.mail_postfaecher.length === 0, String(r4.stand));

  // 4h. Der Anbieter meldet einen Fehler statt eines Codes
  const db7 = nachbau();
  db7.zeilen.mail_oauth_vorgaenge.push({
    id: 'v-2', mandant_id: 'mandant-1', benutzer_id: 'nutzer-1',
    anbieter: 'microsoft', zustand: 'ZUSTAND-2', postfach_id: null,
    erstellt_am: new Date().toISOString(), verbraucht_am: null,
  });
  const r5 = await rueckruf.ruf(db7, {
    suche: { state: 'ZUSTAND-2', error: 'access_denied',
             error_description: 'Der Nutzer hat abgebrochen' },
  });
  melde('Ein Abbruch beim Anbieter wird erklaert',
        r5.stand === 400 && /abgebrochen/i.test(r5.text), r5.text.slice(0, 200));
  melde('Und es entsteht kein Postfach', db7.zeilen.mail_postfaecher.length === 0);

  if (fehler) {
    console.log(`\n  ${fehler} Pruefung(en) gescheitert.`);
    process.exit(1);
  }
  console.log(`  [ok] ${geprueft} Pruefungen zu Postfaechern je Anbieter:`);
  console.log('       die Zustimmungs-Adresse stimmt, der Zustand gilt einmal,');
  console.log('       Mandant und Nutzer kommen aus dem Vorgang, die Tokens liegen');
  console.log('       verschluesselt, XOAUTH2 ist byte-genau — und die Erneuerung');
  console.log('       behaelt Googles Erneuerungs-Token.');
})();

// --- Nachbau von Supabase und der Deno-Laufzeit -----------------------------
function ladeNachbau() {
  function nachbau() {
    const zeilen = {
      profiles: [
        { id: 'nutzer-1', name: 'Maria Muster', mandant_id: 'mandant-1' },
        { id: 'nutzer-2', name: 'Fremder', mandant_id: 'mandant-2' },
      ],
      mail_postfaecher: [],
      mail_oauth_vorgaenge: [],
    };
    const bauer = (tabelle) => {
      let treffer = () => (zeilen[tabelle] || []).slice();
      const filter = [];
      const api = {
        select: () => api,
        eq: (f, v) => { filter.push((z) => String(z[f]) === String(v)); return api; },
        is: (f, v) => { filter.push((z) => (z[f] ?? null) === v); return api; },
        gte: (f, v) => { filter.push((z) => String(z[f] || '') >= String(v)); return api; },
        limit: () => api,
        order: () => api,
        passend: () => treffer().filter((z) => filter.every((f) => f(z))),
        maybeSingle: async () => ({ data: api.passend()[0] || null, error: null }),
        single: async () => ({ data: api.passend()[0] || null, error: null }),
        insert: async (r) => {
          const neu = Array.isArray(r) ? r : [r];
          for (const z of neu) {
            (zeilen[tabelle] = zeilen[tabelle] || [])
              .push({ id: 'neu-' + (zeilen[tabelle].length + 1), ...z });
          }
          return { data: null, error: null };
        },
        update: (r) => {
          const nach = {
            eq: (f, v) => { filter.push((z) => String(z[f]) === String(v)); return nach; },
            is: (f, v) => { filter.push((z) => (z[f] ?? null) === v); return nach; },
            gte: (f, v) => { filter.push((z) => String(z[f] || '') >= String(v)); return nach; },
            select: () => Promise.resolve({ data: nach._wirken(), error: null }),
            _wirken: () => {
              const getroffen = api.passend();
              getroffen.forEach((z) => Object.assign(z, r));
              return getroffen;
            },
            then: (f, g) => Promise.resolve({ data: nach._wirken(), error: null }).then(f, g),
          };
          return nach;
        },
        then: (f) => Promise.resolve({ data: api.passend(), error: null }).then(f),
      };
      return api;
    };
    return {
      zeilen,
      from: bauer,
      rpc: async () => ({ data: null, error: null }),
      auth: {
        // Das Token IST hier die Nutzerkennung — der Test braucht keine
        // Signatur, nur die Unterscheidung zweier Nutzer.
        getUser: async () => ({ data: { user: { id: 'nutzer-1' } }, error: null }),
      },
    };
  }
  return { nachbau };
}

async function ladeFunktion(name) {
  const ziel = name === 'postfach-anbieter-start' ? JS_START : JS_RUECKRUF;
  const pfad = path.join(ziel, 'index.js');
  return {
    async ruf(db, { kopf = {}, koerper = null, suche = null }) {
      const fetchStub = async (url, o) => {
        const felder = new URLSearchParams(o.body);
        if (!String(url).includes('token')) throw new Error('unerwartete Adresse ' + url);
        if (felder.get('grant_type') !== 'authorization_code') {
          throw new Error('unerwarteter grant_type ' + felder.get('grant_type'));
        }
        const istG = String(url).includes('googleapis');
        return {
          ok: true,
          json: async () => ({
            access_token: 'ZUGRIFF-GEHEIM',
            refresh_token: 'REFRESH-GEHEIM',
            expires_in: 3600,
            scope: 'alles',
            id_token: idToken(istG ? 'konto@gmail.test' : 'konto@beispiel.test'),
          }),
        };
      };
      // Jedes Mal neu laden: der Handler wird beim Laden angemeldet, und
      // jeder Lauf braucht seine eigene Datenbank.
      delete require.cache[require.resolve(pfad)];
      delete require.cache[require.resolve(path.join(ziel, 'anbieter.js'))];
      const { handler } = mitUmgebung(UMGEBUNG, fetchStub, db, () => require(pfad));
      const h = handler();
      if (typeof h !== 'function') {
        melde(`${name}: Deno.serve() hat einen Handler bekommen`, false);
        return { stand: 0, inhalt: {}, text: '' };
      }
      const adresse = new URL('https://x.supabase.co/functions/v1/' + name);
      for (const [k, v] of Object.entries(suche || {})) adresse.searchParams.set(k, v);
      const anfrage = new Request(adresse.toString(), koerper
        ? { method: 'POST', headers: { 'content-type': 'application/json', ...kopf },
            body: JSON.stringify(koerper) }
        : { method: 'GET', headers: { ...kopf } });
      const antwort = await mitUmgebung(UMGEBUNG, fetchStub, db,
                                        () => h(anfrage)).raus;
      const text = await antwort.text();
      let inhalt = {};
      try { inhalt = JSON.parse(text); } catch (_e) { /* HTML-Seite */ }
      return { stand: antwort.status, inhalt, text };
    },
  };
}
