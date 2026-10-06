// Geht das Exposé wirklich raus — und vor allem: wann geht es NICHT raus?
//
// Der Sofortversand ist der erste Automatismus, der ohne Zuschauer Post an
// Fremde schickt. Was dabei schiefgeht, merkt nicht der Makler, sondern der
// Interessent: zwei gleiche Mails hintereinander, eine Mail ohne Exposé,
// oder — der teure Fall — eine Mail über das Postfach eines anderen
// Mandanten. Keiner dieser Fälle lässt sich im Betrieb halb ausprobieren.
//
// Also läuft die Funktion hier wirklich: gegen ein nachgebautes Supabase,
// mit einem nachgebauten Deno. Derselbe Weg wie in tests/postfach-anbieter.js
// und tests/expose-funktion.js.
//
// Geprüft wird, was wehtut:
//   * Ausgeschaltet heißt ausgeschaltet — und es steht im Protokoll, warum.
//   * Ohne hinterlegtes Postfach geht nichts hinaus. Das ist die Bedingung
//     des Betreibers, hier ist sie Code.
//   * Ohne Exposé am Objekt geht nichts hinaus.
//   * Dieselbe Adresse bekommt zum selben Objekt nicht zweimal dieselbe Mail.
//   * Das Tageslimit hält.
//   * Die Mail geht über das Postfach DES MANDANTEN und im Namen seines
//     Besitzers — nicht über eine Adresse aus einer Umgebungsvariablen.
//   * Ein angemeldeter Makler kommt nicht an das Objekt eines fremden
//     Mandanten.
//   * Bei Provision geht der LINK hinaus, nie das PDF — die Bestätigung am
//     Link trägt den Provisionshinweis.
//   * Der Probelauf sendet nicht und schreibt nichts.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const EIGENE = path.join(WURZEL, 'supabase', 'eigene');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-sofort-'));

let fehler = 0;
let geprueft = 0;
const melde = (t, ok, zusatz) => {
  geprueft++;
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${t}${zusatz ? ' — ' + zusatz : ''}`);
};

// --- TypeScript zu JavaScript ---------------------------------------------
function uebersetzen(ordner, dateien) {
  const quelle = path.join(tmp, 'q');
  fs.mkdirSync(quelle, { recursive: true });
  for (const datei of dateien) {
    let text = fs.readFileSync(path.join(ordner, datei), 'utf-8');
    text = text.replace(/^import\s+"jsr:[^"]*";\s*$/gm, '')
      .replace(/^import\s*\{([^}]*)\}\s*from\s*"jsr:[^"]*";\s*$/gm,
               (_m, namen) => `declare const ${namen.trim()}: any;`);
    if (!/declare const Deno/.test(text)) text = 'declare const Deno: any;\n' + text;
    fs.writeFileSync(path.join(quelle, datei), text, 'utf-8');
  }
  const ziel = path.join(tmp, 'js');
  try {
    execFileSync('tsc', dateien.map((d) => path.join(quelle, d)).concat([
      '--outDir', ziel, '--module', 'commonjs', '--target', 'es2022',
      '--skipLibCheck', '--esModuleInterop', '--lib', 'es2022,dom',
    ]), { stdio: 'pipe', cwd: os.tmpdir() });
  } catch (f) {
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

// --- Die Umgebung einer Edge Function -------------------------------------
const AKTUELL = { umgebung: {}, db: null, handler: null };
globalThis.Deno = {
  env: { get: (n) => AKTUELL.umgebung[n] || '' },
  serve: (h) => { AKTUELL.handler = h; },
};
globalThis.createClient = () => AKTUELL.db;

const UMGEBUNG = {
  SUPABASE_URL: 'https://projekt.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'dienst',
  EXPOSE_FREIGABE_BASIS: 'https://kunde.example/?expose=',
};

// --- Nachbau von Supabase --------------------------------------------------
function nachbau(abweichung = {}) {
  const zeilen = {
    profiles: [
      { id: 'makler-1', role: 'mitarbeiter', mandant_id: 'mandant-1', firma_id: 'firma-1' },
      { id: 'makler-2', role: 'mitarbeiter', mandant_id: 'mandant-2', firma_id: 'firma-2' },
    ],
    immobilien: [{
      id: 'obj-1', immo_nr: '321', objekttitel: 'Stadtvilla am Hafen',
      bezeichnung: null, strasse: 'Hafenweg', hausnummer: '3', plz: '20457', ort: 'Hamburg',
      vertragsart: 'kauf', provision_aussen: '3,57', provisionsfrei: false,
      zustaendig_id: 'makler-1', mandant_id: 'mandant-1',
    }, {
      id: 'obj-fremd', immo_nr: '999', objekttitel: 'Fremdes Haus',
      vertragsart: 'kauf', provision_aussen: '3,57', provisionsfrei: false,
      zustaendig_id: 'makler-2', mandant_id: 'mandant-2',
    }],
    immobilie_datei: [{
      id: 'datei-1', immobilie_id: 'obj-1', name: 'Expose-321.pdf',
      storage_path: 'mandant-1/immobilien/obj-1/expose/Expose-321.pdf',
      created_at: '2026-10-01T10:00:00Z', expose_final: true, interessenten_freigabe: false,
    }, {
      id: 'datei-2', immobilie_id: 'obj-1', name: 'Grundriss.pdf',
      storage_path: 'mandant-1/immobilien/obj-1/Grundriss.pdf',
      created_at: '2026-10-01T10:00:00Z', expose_final: false, interessenten_freigabe: true,
    }],
    mail_postfaecher: [{
      id: 'pf-1', mandant_id: 'mandant-1', benutzer_id: 'makler-1', aktiv: true,
      email_adresse: 'buero@makler.test', absender_name: 'Musterhaus Immobilien',
      standard_zum_senden: true, ist_standard: true, reihenfolge: 1,
    }],
    firma_stammdaten: [{ id: 'firma-1', mandant_id: 'mandant-1', slug: 'musterhaus' }],
    portal_einstellungen: [{
      mandant_id: 'mandant-1', schluessel: 'expose_sofortversand',
      wert: { aktiv: true, sperrfrist_stunden: 24, max_pro_tag: 3 },
    }],
    expose_freigaben: [],
    expose_sofortversand: [],
    kontakte: [{ id: 'kontakt-1', mandant_id: 'mandant-1', email: 'interessent@beispiel.test' }],
  };
  for (const [t, v] of Object.entries(abweichung)) zeilen[t] = v;

  const gesendet = [];
  const bauer = (tabelle) => {
    const filter = [];
    let zaehlen = false;
    const passend = () => (zeilen[tabelle] || []).filter((z) => filter.every((f) => f(z)));
    const api = {
      select: (_cols, opt) => { if (opt && opt.count) zaehlen = true; return api; },
      eq: (f, v) => { filter.push((z) => String(z[f] ?? '') === String(v)); return api; },
      is: (f, v) => { filter.push((z) => (z[f] ?? null) === v); return api; },
      gte: (f, v) => { filter.push((z) => String(z[f] || '') >= String(v)); return api; },
      order: () => api,
      limit: () => (zaehlen ? api : Promise.resolve({ data: passend(), error: null, count: passend().length })),
      maybeSingle: async () => ({ data: passend()[0] || null, error: null }),
      single: async () => ({ data: passend()[0] || null, error: null }),
      then: (aufl) => aufl({ data: passend(), error: null, count: passend().length }),
      insert: (r) => {
        const neu = { id: `${tabelle}-${(zeilen[tabelle] || []).length + 1}`, created_at: new Date().toISOString(), ...r };
        (zeilen[tabelle] = zeilen[tabelle] || []).push(neu);
        const nach = {
          select: () => nach,
          single: async () => ({ data: neu, error: null }),
          then: (aufl) => aufl({ data: [neu], error: null }),
        };
        return nach;
      },
    };
    return api;
  };

  return {
    zeilen, gesendet,
    from: bauer,
    auth: { getUser: async (jwt) => ({ data: { user: jwt && jwt.startsWith('makler') ? { id: jwt } : null } }) },
    rpc: async () => ({ data: null, error: null }),
    functions: {
      invoke: async (name, { body }) => {
        gesendet.push({ name, body });
        return { data: { ok: true }, error: null };
      },
    },
  };
}

const JS = uebersetzen(path.join(EIGENE, 'expose-sofortversand'), ['index.ts']);

async function ruf(db, koerper, kopf) {
  AKTUELL.umgebung = UMGEBUNG;
  AKTUELL.db = db;
  AKTUELL.handler = null;
  const pfad = path.join(JS, 'index.js');
  delete require.cache[require.resolve(pfad)];
  require(pfad);
  const h = AKTUELL.handler;
  if (typeof h !== 'function') {
    melde('Deno.serve() hat einen Handler bekommen', false);
    return { stand: 0, inhalt: {} };
  }
  const anfrage = new Request('https://x.supabase.co/functions/v1/expose-sofortversand', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${kopf || 'dienst'}` },
    body: JSON.stringify(koerper),
  });
  const antwort = await h(anfrage);
  const text = await antwort.text();
  let inhalt = {};
  try { inhalt = JSON.parse(text); } catch (_e) { /* egal */ }
  return { stand: antwort.status, inhalt, text };
}

const ANFRAGE = {
  immobilie_id: 'obj-1', kontakt_id: 'kontakt-1',
  email: 'Interessent@Beispiel.test', name: 'Frau Meier',
  ausgeloest_von: 'anfrage',
};

(async () => {
  // --- 1. Der Glücksfall ---------------------------------------------------
  {
    const db = nachbau();
    const r = await ruf(db, ANFRAGE);
    melde('Sofortversand: die Mail geht raus', r.inhalt.gesendet === true, r.text.slice(0, 200));

    const freigabe = db.zeilen.expose_freigaben[0];
    melde('Eine Freigabe wird angelegt', !!freigabe);
    melde('Die Adresse steht klein geschrieben in der Freigabe',
          freigabe && freigabe.email === 'interessent@beispiel.test', freigabe && freigabe.email);
    melde('Das als final markierte Exposé wird genommen',
          freigabe && freigabe.expose_datei_id === 'datei-1', freigabe && freigabe.expose_datei_id);
    melde('Die freigegebene Zusatzunterlage geht mit',
          freigabe && Array.isArray(freigabe.dokument_ids)
            && freigabe.dokument_ids.includes('datei-2'),
          freigabe && JSON.stringify(freigabe.dokument_ids));
    melde('Die Freigabe trägt den Mandanten des Objekts',
          freigabe && freigabe.mandant_id === 'mandant-1', freigabe && freigabe.mandant_id);

    const mail = db.gesendet.find((g) => g.name === 'mail-senden');
    melde('Es wird über mail-senden versendet', !!mail);
    melde('Und zwar über das Postfach des Mandanten',
          mail && mail.body.postfach_id === 'pf-1', mail && mail.body.postfach_id);
    melde('Im Namen dessen, dem das Postfach gehört',
          mail && mail.body.als_benutzer_id === 'makler-1', mail && mail.body.als_benutzer_id);
    melde('Die Mail ist als automatisch gekennzeichnet',
          mail && mail.body.automatisch === true);
    melde('Der Link steht im Text, nicht das PDF im Anhang',
          mail && /https:\/\/kunde\.example\//.test(mail.body.text) && !mail.body.anhaenge,
          mail && mail.body.text.slice(0, 80));
    melde('Objektname und Anrede sind eingesetzt',
          mail && mail.body.betreff.includes('Stadtvilla am Hafen')
            && mail.body.text.includes('Frau Meier'),
          mail && mail.body.betreff);

    const prot = db.zeilen.expose_sofortversand[0];
    melde('Das Protokoll sagt: gesendet', prot && prot.status === 'gesendet', prot && prot.status);
    melde('Das Protokoll hält den Weg fest', prot && prot.weg === 'link', prot && prot.weg);
    melde('Das Protokoll nennt den Auslöser', prot && prot.ausgeloest_von === 'anfrage');
  }

  // --- 2. Bei Provision trägt die Freigabe den Hinweis ---------------------
  {
    const db = nachbau();
    await ruf(db, ANFRAGE);
    const f = db.zeilen.expose_freigaben[0];
    melde('Kauf mit Provision: Modell "kaeufer"', f && f.provisionsmodell === 'kaeufer',
          f && f.provisionsmodell);
    melde('Der Provisionssatz steht im Hinweistext',
          f && /3,57 %/.test(f.provision_text || ''), (f && f.provision_text || '').slice(0, 80));
  }

  // --- 3. Miete: Bestellerprinzip statt Provision --------------------------
  {
    const db = nachbau();
    db.zeilen.immobilien[0].vertragsart = 'miete';
    await ruf(db, ANFRAGE);
    const f = db.zeilen.expose_freigaben[0];
    melde('Miete: Modell "miete"', f && f.provisionsmodell === 'miete', f && f.provisionsmodell);
    melde('Und der Hinweis nennt das Bestellerprinzip',
          f && /Bestellerprinzip/.test(f.provision_text || ''));
    const prot = db.zeilen.expose_sofortversand[0];
    melde('Auch ohne Provision geht der Link, nicht der Anhang',
          prot && prot.weg === 'link', prot && prot.weg);
  }

  // --- 4. Ausgeschaltet ----------------------------------------------------
  {
    const db = nachbau();
    db.zeilen.portal_einstellungen[0].wert = { aktiv: false };
    const r = await ruf(db, ANFRAGE);
    melde('Ausgeschaltet: nichts geht raus', r.inhalt.gesendet === false, r.text.slice(0, 120));
    melde('Keine Mail', db.gesendet.length === 0);
    melde('Keine Freigabe', db.zeilen.expose_freigaben.length === 0);
    const prot = db.zeilen.expose_sofortversand[0];
    melde('Aber das Protokoll sagt, warum',
          prot && prot.status === 'uebersprungen' && /eingeschaltet/i.test(prot.grund || ''),
          prot && prot.grund);
  }

  // --- 5. Ohne Einstellung ist nichts eingeschaltet ------------------------
  {
    const db = nachbau({ portal_einstellungen: [] });
    const r = await ruf(db, ANFRAGE);
    melde('Ohne Einstellung bleibt der Sofortversand aus', r.inhalt.gesendet === false,
          r.text.slice(0, 120));
  }

  // --- 6. Kein Postfach: die Bedingung des Betreibers ----------------------
  {
    const db = nachbau({ mail_postfaecher: [] });
    const r = await ruf(db, ANFRAGE);
    melde('Ohne Postfach geht nichts raus', r.inhalt.gesendet === false);
    melde('Und der Grund nennt die Absenderadresse',
          /Absender-Postfach/i.test(r.inhalt.grund || ''), r.inhalt.grund);
    melde('Keine Freigabe auf Vorrat', db.zeilen.expose_freigaben.length === 0);
  }

  // --- 7. Abgeschaltetes Postfach -----------------------------------------
  {
    const db = nachbau();
    db.zeilen.mail_postfaecher[0].aktiv = false;
    const r = await ruf(db, ANFRAGE);
    melde('Ein abgeschaltetes Postfach sendet nicht', r.inhalt.gesendet === false, r.inhalt.grund);
  }

  // --- 8. Kein Exposé am Objekt -------------------------------------------
  {
    const db = nachbau({ immobilie_datei: [] });
    const r = await ruf(db, ANFRAGE);
    melde('Ohne Exposé-PDF geht nichts raus', r.inhalt.gesendet === false);
    melde('Und der Grund sagt es', /kein Exposé/i.test(r.inhalt.grund || ''), r.inhalt.grund);
  }

  // --- 9. Keine Adresse ----------------------------------------------------
  {
    const db = nachbau();
    const r = await ruf(db, { ...ANFRAGE, email: '' });
    melde('Ohne Mailadresse geht nichts raus', r.inhalt.gesendet === false, r.inhalt.grund);
  }

  // --- 10. Doppelversand ---------------------------------------------------
  {
    const db = nachbau();
    const a = await ruf(db, ANFRAGE);
    const b = await ruf(db, ANFRAGE);
    melde('Der erste Versand geht raus', a.inhalt.gesendet === true);
    melde('Der zweite nicht', b.inhalt.gesendet === false, b.text.slice(0, 160));
    melde('Es bleibt bei einer Mail',
          db.gesendet.filter((g) => g.name === 'mail-senden').length === 1,
          String(db.gesendet.length));
    melde('Und bei einer Freigabe', db.zeilen.expose_freigaben.length === 1);
  }

  // --- 11. Eine andere Adresse ist kein Doppelversand ----------------------
  {
    const db = nachbau();
    await ruf(db, ANFRAGE);
    const b = await ruf(db, { ...ANFRAGE, email: 'zweiter@beispiel.test' });
    melde('Eine andere Adresse bekommt ihre eigene Mail', b.inhalt.gesendet === true,
          b.text.slice(0, 160));
  }

  // --- 12. Tageslimit ------------------------------------------------------
  {
    const db = nachbau();
    for (let i = 0; i < 3; i++) {
      db.zeilen.expose_sofortversand.push({
        id: 'alt-' + i, mandant_id: 'mandant-1', immobilie_id: 'obj-1',
        email: 'wer-' + i + '@beispiel.test', status: 'gesendet',
        created_at: new Date().toISOString(),
      });
    }
    const r = await ruf(db, ANFRAGE);
    melde('Das Tageslimit hält', r.inhalt.gesendet === false);
    melde('Und sagt sich als solches an', /Tageslimit/i.test(r.inhalt.grund || ''), r.inhalt.grund);
  }

  // --- 13. Fremder Mandant -------------------------------------------------
  {
    const db = nachbau();
    db.rpc = async () => ({ data: null, error: { message: 'kein Zugriff' } });
    const r = await ruf(db, { ...ANFRAGE, immobilie_id: 'obj-fremd' }, 'makler-1');
    melde('Ein angemeldeter Makler kommt nicht an ein fremdes Objekt', r.stand === 403,
          String(r.stand));
    melde('Und es geht keine Mail hinaus', db.gesendet.length === 0);
  }

  // --- 14. Der Probelauf ---------------------------------------------------
  {
    const db = nachbau();
    const r = await ruf(db, { ...ANFRAGE, probe: true });
    melde('Der Probelauf sagt, was passieren würde', r.inhalt.wuerde_senden === true,
          r.text.slice(0, 160));
    melde('Er sendet aber nicht', db.gesendet.length === 0);
    melde('Und schreibt weder Freigabe noch Protokoll',
          db.zeilen.expose_freigaben.length === 0 && db.zeilen.expose_sofortversand.length === 0);
    melde('Er nennt die Absenderadresse', r.inhalt.absender === 'buero@makler.test',
          r.inhalt.absender);
  }

  // --- 15. Scheitert der Versand, steht das im Protokoll -------------------
  {
    const db = nachbau();
    db.functions.invoke = async () => ({ data: { ok: false, fehler: 'SMTP abgelehnt' }, error: null });
    const r = await ruf(db, ANFRAGE);
    melde('Ein gescheiterter Versand wird gemeldet', r.stand === 502, String(r.stand));
    const prot = db.zeilen.expose_sofortversand[0];
    melde('Und steht als Fehler im Protokoll, mit Grund',
          prot && prot.status === 'fehler' && /SMTP/.test(prot.grund || ''),
          prot && `${prot.status}: ${prot.grund}`);
    melde('Ein Fehlversuch sperrt den nächsten nicht',
          db.zeilen.expose_sofortversand.filter((p) => p.status === 'gesendet').length === 0);
  }

  if (fehler) {
    console.log(`\n  ${fehler} Pruefung(en) gescheitert.`);
    process.exit(1);
  }
  console.log(`  [ok] ${geprueft} Pruefungen zum Exposé-Sofortversand:`);
  console.log('       die Mail geht über das Postfach des Mandanten und im Namen');
  console.log('       seines Besitzers, bei Provision immer als Link mit');
  console.log('       Bestätigung, nie zweimal an dieselbe Adresse, nie über das');
  console.log('       Tageslimit, nie an ein fremdes Objekt — und jeder Fall, in');
  console.log('       dem nichts hinausging, steht mit Grund im Protokoll.');
})();
