// Laeuft die Edge Function expose-pdf-erzeugen wirklich durch?
//
// Die Syntaxpruefung sagt nur, dass die Datei lesbar ist. Sie sagt nicht,
// ob ein Name ins Leere zeigt, ob der Renderer die Schriften bekommt, die
// er verlangt, und ob am Ende ein PDF herauskommt. Genau das steht hier —
// ohne Deno, ohne Netz und ohne Supabase:
//
//   * Die Datei wird gelesen, von ihren Deno-Importen befreit und mit
//     esbuild nach JavaScript uebersetzt. Deno.serve() uebergibt dabei
//     seinen Handler an den Test statt an einen Server.
//   * createClient() liefert einen nachgebauten Client: ein paar Tabellen
//     im Speicher, ein Eimer mit den echten Schriften und einem winzigen
//     JPEG.
//   * Aufgerufen wird mit einem Objekt, das vollstaendig genug ist, um ein
//     Expose zu ergeben — und danach mit einem, dem fast alles fehlt. Auch
//     das darf kein Abbruch sein, sondern ein kuerzeres Expose.
//
// Was der Test NICHT prueft: Geocoding, Entfernungen, Lageplan, KI. Das
// sind Netzwege; das Objekt bringt diese Daten darum schon mit.

const fs = require('fs');
const os = require('os');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const FUNKTION = path.join(WURZEL, 'supabase', 'functions', 'expose-pdf-erzeugen');
const SCHRIFTEN = path.join(WURZEL, 'assets', 'fonts', 'expose');
const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');

let fehler = 0;
const melde = (t, ok, zusatz) => {
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${t}${zusatz ? ' — ' + zusatz : ''}`);
};

// --- Ein winziges, gueltiges JPEG (8x8, hellgrau) -------------------------
// Erzeugt (Pillow, Qualitaet 70), nicht abgeschrieben: ein echtes Objektfoto
// im Repository waere Referenzmaterial, und ein ungueltiges Bild wuerde
// pdf-lib zu Recht ablehnen — dann prueft der Test die Bildwege nicht.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIf'
  + 'IiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7'
  + 'Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAIAAgDASIA'
  + 'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA'
  + 'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3'
  + 'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm'
  + 'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA'
  + 'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx'
  + 'BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK'
  + 'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3'
  + 'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1aiii'
  + 'gD//2Q==', 'base64');

// --- Die Funktion uebersetzen ----------------------------------------------
const esbuild = require('esbuild');
const quelle = fs.readFileSync(path.join(FUNKTION, 'index.ts'), 'utf-8');
// Die Importe fliegen heraus und kommen als Werte wieder herein. Sie
// stehen alle am Zeilenanfang und enden auf einer eigenen Zeile mit ";
const ohneImporte = quelle
  .replace(/^import [\s\S]*?;$/gm, '')
  .replace(/^(let fontkit|let QRCode)[^\n]*\n[^\n]*await import[^\n]*\n/gm, '');
melde('Alle Deno-Importe entfernt', !/^import /m.test(ohneImporte)
  && !/await import\(/.test(ohneImporte));

const js = esbuild.transformSync(ohneImporte,
  { loader: 'ts', format: 'esm', target: 'es2022' }).code;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'immo-fn-'));
// Das Buendel des Renderers liegt im Ordner der Funktion; der Test laedt
// genau dieses, nicht die Quelle. Damit prueft er auch, dass das Buendel
// die Namen nach aussen gibt, die die Funktion benutzt.
fs.writeFileSync(path.join(tmp, 'huelle.mjs'),
  'export async function laden(G) {\n'
  + '  const { PDFLib, Image, Expose, fontkit, QRCode, createClient, Deno } = G;\n'
  + '  let handler = null;\n'
  + '  const DenoStub = { ...Deno, serve: (h) => { handler = h; } };\n'
  + js.replace(/\bDeno\./g, 'DenoStub.')
  + '\n  return handler;\n}\n');

// --- Der nachgebaute Client ------------------------------------------------
const MANDANT = '11111111-2222-3333-4444-555555555555';
const OBJEKT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NUTZER = '99999999-8888-7777-6666-555555555555';

function tabellen(immo) {
  return {
    profiles: [{ id: NUTZER, name: 'Anna Beispiel', titel: '', funktion: 'Maklerin',
                 telefon: '040 123456', mobil: '0170 1234567', email: 'anna@beispiel.test',
                 foto_url: '', firma_id: 'f1', mandant_id: MANDANT, role: 'chef' }],
    immobilien: [immo],
    immobilie_grundstueck: [],
    immobilie_datei: [
      { id: 'd1', immobilie_id: OBJEKT, kategorie: 'foto', oeffentlich: true,
        speicher_typ: 'supabase', storage_path: 'immobilien/o/1.jpg', name: '1.jpg',
        mime_type: 'image/jpeg', doktyp: 'Wohnen', sortierung: 1, ki_bearbeitet: false },
      { id: 'd2', immobilie_id: OBJEKT, kategorie: 'foto', oeffentlich: true,
        speicher_typ: 'supabase', storage_path: 'immobilien/o/2.jpg', name: '2.jpg',
        mime_type: 'image/jpeg', doktyp: 'Küche', sortierung: 2, ki_bearbeitet: true },
      { id: 'd3', immobilie_id: OBJEKT, kategorie: 'grundriss', oeffentlich: true,
        speicher_typ: 'supabase', storage_path: 'immobilien/o/eg.jpg', name: 'eg.jpg',
        mime_type: 'image/jpeg', doktyp: 'Grundriss', sortierung: 3, ki_bearbeitet: false },
      { id: 'd4', immobilie_id: OBJEKT, kategorie: 'lageplan', oeffentlich: true,
        speicher_typ: 'supabase', storage_path: 'immobilien/o/lage.jpg', name: 'lage.jpg',
        mime_type: 'image/jpeg', doktyp: 'Lageplan', sortierung: 4, ki_bearbeitet: false },
    ],
    firma_stammdaten: [{ id: 'f1', mandant_id: MANDANT, aktiv: true, sortierung: 1,
      firma_name: 'Beispiel Immobilien GmbH', marken_name: 'Beispiel',
      marken_linie: 'Wohnen am Wasser', strasse: 'Musterweg 1', plz: '20095',
      ort: 'Hamburg', telefon: '040 123456', email: 'info@beispiel.test',
      web: 'beispiel.test', registergericht: 'AG Hamburg', hrb: 'HRB 12345',
      ust_id: 'DE123456789', geschaeftsfuehrer: 'Anna Beispiel',
      expose_vorlage: 'raster', ci_primaer: '#0F4C5C', ci_akzent: '#E8915A',
      logo_pfad: 'logo.png' }],
    finanzierungs_annahmen: [{ mandant_id: MANDANT, aktiv: true, notar_prozent: 2.0,
      zinssatz: 3.9, tilgung: 2.0, eigenkapital_prozent: 20 }],
    // Alle drei Systemvorlagen, wie fork_38 sie einspielt. Welche genommen
    // wird, entscheidet firma_stammdaten.expose_vorlage.
    expose_vorlagen: ['raster', 'signature', 'studio'].map((b) => ({
      id: 'v-' + b, mandant_id: null, name: b[0].toUpperCase() + b.slice(1), basis: b,
      archiviert: false, ist_standard: false,
      dokument: JSON.parse(fs.readFileSync(path.join(VORLAGEN, b + '.json'), 'utf-8')),
    })),
    expose_debug: [],
  };
}

function nachbau(daten) {
  const protokoll = { eingefuegt: [], hochgeladen: [], aufrufe: [] };
  const bauer = (name) => {
    const zeilen = daten[name] || [];
    let treffer = zeilen.slice();
    const api = {
      select: () => api,
      eq: (f, v) => { treffer = treffer.filter((r) => String(r[f]) === String(v)); return api; },
      is: (f, v) => { treffer = treffer.filter((r) => r[f] === v); return api; },
      in: (f, v) => { treffer = treffer.filter((r) => v.includes(r[f])); return api; },
      order: () => api,
      limit: (n) => { treffer = treffer.slice(0, n); return api; },
      maybeSingle: async () => ({ data: treffer[0] || null, error: null }),
      single: async () => ({ data: treffer[0] || null, error: treffer[0] ? null : { message: 'leer' } }),
      insert: (r) => {
        protokoll.eingefuegt.push([name, r]);
        (daten[name] = daten[name] || []).push(r);
        const nach = { select: () => nach, single: async () => ({ data: r, error: null }) };
        return Object.assign(Promise.resolve({ data: r, error: null }), nach);
      },
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
      then: (f) => Promise.resolve({ data: treffer, error: null }).then(f),
    };
    return api;
  };
  const schriften = new Map();
  for (const d of fs.readdirSync(SCHRIFTEN).filter((f) => f.endsWith('.ttf'))) {
    schriften.set('fonts/expose/' + d, fs.readFileSync(path.join(SCHRIFTEN, d)));
  }
  const eimer = (name) => ({
    download: async (pfad) => {
      const roh = schriften.get(pfad);
      if (roh) return { data: blob(roh), error: null };
      if (name === 'branding-assets' && pfad.endsWith('logo.png')) return { data: null, error: { message: 'kein Logo' } };
      if (/\.(jpg|jpeg|png)$/i.test(String(pfad))) return { data: blob(JPEG), error: null };
      return { data: null, error: { message: 'nicht da: ' + pfad } };
    },
    upload: async (pfad, bytes) => { protokoll.hochgeladen.push([name, pfad, bytes.length]); return { error: null }; },
    createSignedUrl: async (pfad) => ({ data: { signedUrl: 'https://beispiel.test/' + pfad }, error: null }),
    remove: async () => ({ error: null }),
    list: async () => ({ data: [], error: null }),
  });
  return {
    protokoll,
    from: bauer,
    storage: { from: eimer },
    rpc: async () => ({ data: true, error: null }),
    functions: { invoke: async (n, o) => { protokoll.aufrufe.push([n, o]); return { data: null, error: null }; } },
    auth: { getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }) },
  };
}

function blob(b) {
  const roh = Uint8Array.from(b);
  return { arrayBuffer: async () => roh.buffer.slice(roh.byteOffset, roh.byteOffset + roh.byteLength) };
}

// --- Aufrufen ---------------------------------------------------------------
async function lauf(immo, koerper, basis) {
  const daten = tabellen(immo);
  if (basis) daten.firma_stammdaten[0].expose_vorlage = basis;
  const db = nachbau(daten);
  const { laden } = await import('file://' + path.join(tmp, 'huelle.mjs'));
  const handler = await laden({
    PDFLib: require('pdf-lib'),
    Image: class { static rgbaToColor() { return 0; } },
    Expose: await import('file://' + path.join(FUNKTION, 'immo-expose.mjs')),
    fontkit: require('@pdf-lib/fontkit'),
    QRCode: {
      create: () => ({ modules: { size: 21, data: new Uint8Array(21 * 21).fill(1) } }),
    },
    createClient: () => db,
    Deno: { env: { get: (n) => ({ SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k', SUPABASE_ANON_KEY: 'a',
      PORTAL_URL: 'https://beispiel.test' })[n] || '' } },
  });
  melde('Deno.serve() hat einen Handler uebergeben', typeof handler === 'function');
  if (typeof handler !== 'function') return null;
  const antwort = await handler(new Request('https://x/expose', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({ immobilie_id: OBJEKT, ...koerper }),
  }));
  return { antwort, ergebnis: await antwort.json(), db };
}

const VOLL = {
  id: OBJEKT, mandant_id: MANDANT, zustaendig_id: NUTZER, bezeichnung: 'Objekt 1',
  immo_nr: 'HH-2026-001', objekttitel: 'Lichtdurchflutete Stadtwohnung – mit Dachterrasse',
  // "verkauf" ist der Wert, den die Oberflaeche schreibt — nicht "kauf".
  // Genau daran ist die Kostenseite bis zum 05.10.2026 stillschweigend
  // entfallen; die Pruefung unten besteht darauf, dass sie da ist.
  objektart: 'Wohnung', vertragsart: 'verkauf', strasse: 'Musterweg', hausnummer: '7',
  plz: '20095', ort: 'Hamburg', ortsteil: 'Hafenviertel', adresse_freigeben: true,
  wohnflaeche: 112.5, nutzflaeche: 14, grundstueck: 0, zimmer: 3, schlafzimmer: 2,
  badezimmer: 2, etagen_gesamt: 5, etage: '4. OG', baujahr: 2021,
  modernisierung_jahr: 2021, zustand: 'neuwertig', unterkellert: true,
  heizungsart: 'Fernwärme', energie_traeger: 'Fernwärme', energieausweis_typ: 'Bedarfsausweis',
  energie_kennwert: 38.5, energie_klasse: 'A+', energie_gueltig_bis: '2035-04-30',
  angebotspreis: 589000, hausgeld: 285, hausgeld_nicht_umlagefaehig: 95,
  provision_aussen: '3,57 %', provisionsfrei: false, miete_ist: 1450,
  verfuegbar_ab: 'sofort', stellplatz_art: 'Tiefgarage', stellplatz_anzahl: 1,
  expose_slogan: 'Wohnen mit Weitblick',
  expose_zitat: 'Hier beginnt der Tag am Wasser.',
  beschreibung_objekt: 'Erster Absatz zur Wohnung.\n\nZweiter Absatz mit weiteren Angaben '
    + 'zur Ausstattung und zum Schnitt der Raeume.',
  beschreibung_lage: 'Die Lage am Hafen ist ruhig und zugleich zentral.',
  beschreibung_ausstattung_expose: 'Fussbodenheizung\nEinbaukueche\nDachterrasse',
  expose_highlights: [{ icon: 'sonne', zeile1: 'Dachterrasse', zeile2: '32 m² nach Süden' },
                      { icon: 'blitz', zeile1: 'Photovoltaik', zeile2: 'mit Speicher' }],
  lage_distanzen: [{ label: 'Bushaltestelle', wert: '0,3 km' },
                   { label: 'Zentrum', wert: '1,8 km' }],
  expose_wege: [{ ziel: 'Bahnhof', fuss: 12, rad: 5, auto: 3 }],
  raumaufteilung: [{ name: 'Wohnen', flaeche: 38.5, ebene: 'eg' },
                   { name: 'Bad', flaeche: 9, ebene: 'eg' },
                   { name: 'Schlafen', flaeche: 16, ebene: 'og' }],
  laufende_kosten: [{ name: 'Grundsteuer', betrag: 38 }, { name: 'Versicherung', betrag: 54 }],
  expose_ausstattung_gruppen: [{ titel: 'Küche', punkte: ['Insel', 'Naturstein'] }],
  lage_koordinaten: { lat: 53.55, lon: 9.99 },
  expose_titelbild_id: 'd1', expose_rendite: true, expose_nebenkosten: true,
  expose_qr_url: 'https://beispiel.test/expose/HH-2026-001',
  expose_overrides: {},
};

(async () => {
  // --- 1. Ein vollstaendiges Objekt ----------------------------------------
  const a = await lauf(VOLL, { nur_pruefen: true });
  if (a) {
    melde('Antwort ist ok', a.ergebnis.ok === true, JSON.stringify(a.ergebnis).slice(0, 300));
    melde('Die Systemvorlage wurde genommen', a.ergebnis.vorlage === 'Raster');
    melde('Es entstehen Seiten', a.ergebnis.seiten > 5, String(a.ergebnis.seiten));
    melde('Es entstehen Bytes', a.ergebnis.bytes > 20000, String(a.ergebnis.bytes));
    melde('Die Schnitte der Vorlage wurden geladen',
          Array.isArray(a.ergebnis.schnitte) && a.ergebnis.schnitte.length >= 4,
          JSON.stringify(a.ergebnis.schnitte));
    melde('Bilder sind geladen', a.ergebnis.bilder >= 4, String(a.ergebnis.bilder));
    melde('Das KI-Bild ist als solches erkannt', a.ergebnis.ki_bilder === 1,
          String(a.ergebnis.ki_bilder));
    const befunde = a.ergebnis.befunde || [];
    const schlimm = befunde.filter((b) => b.art === 'unbekannt');
    melde('Kein unbekannter Platzhalter und kein ungezeichnetes Element',
          schlimm.length === 0, JSON.stringify(schlimm.slice(0, 4)));
    // Ein Rahmen, der ueber die Seite hinausragt, ist ein Hinweis auf
    // einen Fehler in der Vorlage. Die drei Systemvorlagen duerfen keinen
    // haben — auch nicht bei den gedrehten Seitenbaendern.
    melde('Kein Rahmen ragt ueber die Seite',
          !befunde.some((b) => String(b.text || '').includes('ueber die Seite')),
          JSON.stringify(befunde.filter((b) => String(b.text || '').includes('ueber die Seite'))));
    const namen = a.ergebnis.seitennamen || [];
    melde('Das Inhaltsverzeichnis nennt die Seiten', namen.includes('Titelseite'),
          JSON.stringify(namen));
    melde('Die Kostenseite erscheint bei vertragsart "verkauf"',
          namen.includes('Kosten & Finanzierung'), JSON.stringify(namen));
  }

  // --- 2. Dasselbe Objekt, aber als PDF in den Speicher --------------------
  const b = await lauf(VOLL, {});
  if (b) {
    melde('Das PDF wird abgelegt', b.ergebnis.ok === true && !!b.ergebnis.pfad,
          JSON.stringify(b.ergebnis).slice(0, 200));
    const hoch = b.db.protokoll.hochgeladen.filter((h) => h[1].includes('/expose/'));
    melde('Es wurde genau ein PDF hochgeladen', hoch.length === 1 && hoch[0][2] > 20000,
          JSON.stringify(hoch));
    melde('Die Datei ist am Objekt verzeichnet',
          b.db.protokoll.eingefuegt.some(([t, r]) => t === 'immobilie_datei'
            && r.mime_type === 'application/pdf'));
    melde('Eine signierte Verbindung kommt zurueck',
          String(b.ergebnis.signed_url || '').startsWith('https://'));
  }

  // --- 3. Ein Objekt, dem fast alles fehlt --------------------------------
  // Der haeufigste Fall im Alltag: angelegt, zwei Fotos, sonst nichts. Das
  // muss ein kuerzeres Expose ergeben, keinen Fehler.
  const mager = {
    id: OBJEKT, mandant_id: MANDANT, zustaendig_id: NUTZER, bezeichnung: 'Rohling',
    immo_nr: 'HH-2026-002', objektart: 'Wohnung', vertragsart: 'kauf',
    ort: 'Hamburg', plz: '20095', lage_koordinaten: { lat: 53.55, lon: 9.99 },
    lage_distanzen: [{ label: 'Bus', wert: '0,2 km' }],
    expose_highlights: [{ zeile1: 'Nah am Wasser' }],
    beschreibung_objekt: 'Kurze Beschreibung.',
  };
  const c = await lauf(mager, { nur_pruefen: true });
  if (c) {
    melde('Auch ein mageres Objekt ergibt ein Expose', c.ergebnis.ok === true,
          JSON.stringify(c.ergebnis).slice(0, 300));
    melde('Es hat weniger Seiten als das vollstaendige',
          a && c.ergebnis.seiten < a.ergebnis.seiten,
          `mager ${c.ergebnis.seiten}, voll ${a && a.ergebnis.seiten}`);
    melde('Fehlende Werte stehen als Befund im Protokoll',
          (c.ergebnis.befunde || []).some((x) => x.art === 'fehlender_wert'));
  }

  // --- 3b. Alle drei Systemvorlagen ---------------------------------------
  // Der Vergleich mit den Prototypen prueft die Vorlagen mit Demodaten.
  // Hier laufen sie durch den ganzen Weg: aus der Datenbank geladen, mit
  // echten Objektdaten gefuellt, als PDF geschrieben.
  for (const [basis, name, seiten] of [['signature', 'Signature', 12], ['studio', 'Studio', 9]]) {
    const e = await lauf(VOLL, { nur_pruefen: true }, basis);
    if (!e) continue;
    melde(`Vorlage ${name} laeuft durch`, e.ergebnis.ok === true,
          JSON.stringify(e.ergebnis).slice(0, 300));
    melde(`Vorlage ${name} nimmt ihre eigene Fassung`, e.ergebnis.vorlage === name);
    melde(`Vorlage ${name} hat ${seiten} Seiten`, e.ergebnis.seiten === seiten,
          String(e.ergebnis.seiten));
    const schlimm = (e.ergebnis.befunde || []).filter((b) => b.art === 'unbekannt');
    melde(`Vorlage ${name} ohne unbekannte Platzhalter oder Elemente`,
          schlimm.length === 0, JSON.stringify(schlimm.slice(0, 4)));
  }

  // --- 3c. Eine Vermietung: dieselbe Vorlage, ohne Kostenseite ------------
  {
    const v = await lauf({ ...VOLL, vertragsart: 'vermietung', kaltmiete: 1450,
                           angebotspreis: null }, { nur_pruefen: true });
    if (v) {
      const namen = v.ergebnis.seitennamen || [];
      melde('Bei einer Vermietung entfaellt die Kostenseite',
            v.ergebnis.ok === true && !namen.includes('Kosten & Finanzierung'),
            JSON.stringify(namen));
      melde('Die Vermietung hat darum weniger Seiten',
            a && v.ergebnis.seiten === a.ergebnis.seiten - 1,
            `miete ${v.ergebnis.seiten}, kauf ${a && a.ergebnis.seiten}`);
    }
  }

  // --- 4. Ohne Fotos: eine klare Ansage, kein Abbruch ---------------------
  const d = await lauf({ ...VOLL, expose_titelbild_id: null }, { nur_pruefen: true });
  if (d) melde('Mit Titelbild-Verweis ins Leere laeuft es trotzdem',
               d.ergebnis.ok === true, JSON.stringify(d.ergebnis).slice(0, 200));

  fs.rmSync(tmp, { recursive: true, force: true });
  if (fehler) {
    console.log(`\n  ${fehler} Pruefung(en) gescheitert.`);
    process.exit(1);
  }
  console.log('  [ok] expose-pdf-erzeugen laeuft durch: Vorlage geladen, Schriften,');
  console.log('       Bilder, KI-Kennzeichnung, PDF abgelegt, signierte Verbindung.');
  console.log('       Geprueft mit einem vollstaendigen und einem mageren Objekt,');
  console.log('       mit allen drei Systemvorlagen.');
})();
