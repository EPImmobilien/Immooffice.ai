// Tut der Exposé-Editor, was er soll — ohne Browser?
//
// src/eigene/expose-vorlagen.js ist die erste eigene Ansicht des Forks. Sie
// hängt an vier Dingen, die alle fehlschlagen können, ohne dass es auffällt:
// am Renderer-Bündel, an pdf-lib samt fontkit, an den ausgelieferten
// Schriften und an der Datenbank. Ein Tippfehler darin zeigt sich erst im
// Browser eines Maklers.
//
// Also wird die Ansicht hier ausgeführt. Nicht in einem Browser — dafür
// bräuchte es React als UMD aus dem Netz —, sondern gegen ein winziges
// React: createElement baut einen Baum aus einfachen Objekten, useState
// und useEffect verhalten sich wie das Original, so weit der Test sie
// braucht. Alles übrige ist echt: das Bündel, pdf-lib, fontkit, die
// Schriften aus assets/fonts/expose/ und ein nachgebautes Supabase.

const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const EDITOR = path.join(WURZEL, 'src', 'eigene', 'expose-vorlagen.js');
const BUENDEL = path.join(WURZEL, 'packages', 'expose-renderer', 'buendel', 'immo-expose.js');
const SCHRIFTEN = path.join(WURZEL, 'assets', 'fonts', 'expose');
const VORLAGEN = path.join(WURZEL, 'packages', 'expose-renderer', 'vorlagen');

let fehler = 0;
const melde = (t, ok, zusatz) => {
  if (ok) return;
  fehler++;
  console.log(`  [FEHLER] ${t}${zusatz ? ' — ' + zusatz : ''}`);
};

// --- Ein winziges React ----------------------------------------------------
// Es kennt genau die drei Haken, die die Ansicht benutzt. Zustandswechsel
// lösen einen neuen Durchgang aus; nach jedem Durchgang laufen die
// Effekte, deren Abhängigkeiten sich geändert haben — wie im Original.
function kleinesReact() {
  let haken = [];
  let zeiger = 0;
  let effekte = [];
  let neuZeichnen = null;
  let geplant = false;

  const React = {
    createElement(typ, props, ...kinder) {
      return { typ, props: props || {}, kinder: kinder.flat(Infinity).filter((k) => k != null && k !== false) };
    },
    useState(anfang) {
      const i = zeiger++;
      if (haken.length <= i) haken.push({ wert: typeof anfang === 'function' ? anfang() : anfang });
      const h = haken[i];
      const setzen = (neu) => {
        const wert = typeof neu === 'function' ? neu(h.wert) : neu;
        if (wert === h.wert) return;
        h.wert = wert;
        if (!geplant) { geplant = true; Promise.resolve().then(() => { geplant = false; neuZeichnen && neuZeichnen(); }); }
      };
      return [h.wert, setzen];
    },
    useCallback(fn, deps) {
      const i = zeiger++;
      if (haken.length <= i) haken.push({ fn, deps });
      const h = haken[i];
      if (!gleich(h.deps, deps)) { h.fn = fn; h.deps = deps; }
      return h.fn;
    },
    useEffect(fn, deps) {
      const i = zeiger++;
      if (haken.length <= i) haken.push({ deps: null, erst: true });
      const h = haken[i];
      if (h.erst || !gleich(h.deps, deps)) {
        h.erst = false;
        h.deps = deps;
        effekte.push(fn);
      }
    },
    Fragment: 'fragment',
  };

  function gleich(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((x, i) => x === b[i]);
  }

  return {
    React,
    zeichne(komponente, props) {
      let baum = null;
      neuZeichnen = () => {
        zeiger = 0;
        baum = komponente(props);
        const laufende = effekte;
        effekte = [];
        laufende.forEach((fn) => fn());
      };
      neuZeichnen();
      return () => baum;
    },
  };
}

/** Alle Texte eines Baums, flach. */
function texte(knoten, raus = []) {
  if (knoten == null || knoten === false) return raus;
  if (typeof knoten === 'string' || typeof knoten === 'number') { raus.push(String(knoten)); return raus; }
  if (Array.isArray(knoten)) { knoten.forEach((k) => texte(k, raus)); return raus; }
  if (knoten.kinder) knoten.kinder.forEach((k) => texte(k, raus));
  return raus;
}

/** Alle Knoten eines Typs. */
function knotenMit(knoten, typ, raus = []) {
  if (!knoten || typeof knoten !== 'object') return raus;
  if (Array.isArray(knoten)) { knoten.forEach((k) => knotenMit(k, typ, raus)); return raus; }
  if (knoten.typ === typ) raus.push(knoten);
  if (knoten.kinder) knoten.kinder.forEach((k) => knotenMit(k, typ, raus));
  return raus;
}

/** Den Knopf mit diesem Text finden und drücken. */
function druecke(baum, text) {
  const treffer = knotenMit(baum, 'button')
    .filter((k) => texte(k).join(' ').includes(text));
  if (!treffer.length) return false;
  treffer[0].props.onClick({ stopPropagation() {} });
  return true;
}

// --- Das nachgebaute Supabase ---------------------------------------------
function nachbau(reihen) {
  const protokoll = [];
  const bauer = (tabelle) => {
    let treffer = (reihen[tabelle] || []).slice();
    const api = {
      select: () => api,
      order: () => api,
      limit: (n) => { treffer = treffer.slice(0, n); return api; },
      eq: (f, v) => { treffer = treffer.filter((r) => r[f] === v); api._eq = [f, v]; return api; },
      maybeSingle: () => Promise.resolve({ data: treffer[0] || null, error: null }),
      single: () => Promise.resolve({ data: treffer[0] || null, error: null }),
      insert: (r) => {
        protokoll.push(['insert', tabelle, r]);
        const neu = Object.assign({ id: 'neu-' + protokoll.length, mandant_id: 'm1' }, r);
        (reihen[tabelle] = reihen[tabelle] || []).push(neu);
        // supabase-js gibt hier ein Objekt zurueck, das BEIDES kann:
        // .select().single() fuer die eingefuegte Zeile und .then() fuer
        // "einfach einfuegen". Der Nachbau muss das auch koennen, sonst
        // prueft der Test einen Weg, den es so nicht gibt.
        const nach = {
          select: () => nach,
          single: () => Promise.resolve({ data: neu, error: null }),
          then: (f, g) => Promise.resolve({ data: neu, error: null }).then(f, g),
        };
        return nach;
      },
      update: (r) => {
        const fertig = {
          eq: (f, v) => {
            protokoll.push(['update', tabelle, r, f, v]);
            (reihen[tabelle] || []).forEach((z) => { if (z[f] === v) Object.assign(z, r); });
            return Promise.resolve({ data: null, error: null });
          },
        };
        return fertig;
      },
      then: (f) => Promise.resolve({ data: treffer, error: null }).then(f),
    };
    return api;
  };
  return { from: bauer, protokoll };
}

// --- Die Umgebung ----------------------------------------------------------
const vorlagen = ['raster', 'signature', 'studio'].map((b) => ({
  id: 'v-' + b, mandant_id: null, name: b[0].toUpperCase() + b.slice(1),
  beschreibung: 'Systemvorlage ' + b, basis: b, version: 1,
  ist_standard: false, archiviert: false,
  dokument: JSON.parse(fs.readFileSync(path.join(VORLAGEN, b + '.json'), 'utf-8')),
}));
const reihen = {
  expose_vorlagen: vorlagen.concat([{
    id: 'v-eigen', mandant_id: 'm1', name: 'Hausvorlage', beschreibung: 'Kopie von Raster',
    basis: 'raster', version: 3, ist_standard: true, archiviert: false,
    dokument: vorlagen[0].dokument,
  }]),
  firma_stammdaten: [{ firma_name: 'Beispiel GmbH', marken_name: 'Beispiel',
    ort: 'Musterstadt', ci_primaer: '#0F4C5C', ci_akzent: '#E8915A' }],
};

const db = nachbau(reihen);
const { React, zeichne } = kleinesReact();
const gefragt = [];
const blobs = [];

const fenster = {
  IMMO_CI: undefined,     // absichtlich: die Ansicht muss ohne auskommen
  PDFLib: require('pdf-lib'),
  fontkit: require('@pdf-lib/fontkit'),
  qrcode: require('qrcode-generator'),
  _sb: db,
  prompt: (frage, vorgabe) => { gefragt.push(frage); return vorgabe + ' X'; },
  confirm: () => true,
  alert: (t) => { gefragt.push('ALERT: ' + t); },
  URL: { createObjectURL: (b) => { blobs.push(b); return 'blob:vorschau-' + blobs.length; },
         revokeObjectURL: () => {} },
};
// Schriften kommen im Browser per fetch von der eigenen Auslieferung. Hier
// liest derselbe Weg aus assets/fonts/expose/ — denn genau das liegt dort.
const geholt = [];
const fetchStub = async (pfad) => {
  geholt.push(pfad);
  const name = String(pfad).split('/').pop();
  const datei = path.join(SCHRIFTEN, name);
  if (!fs.existsSync(datei)) return { ok: false, status: 404 };
  const roh = fs.readFileSync(datei);
  return { ok: true, arrayBuffer: async () => roh.buffer.slice(roh.byteOffset, roh.byteOffset + roh.byteLength) };
};

// Geladen wird in DIESER Laufzeit, nicht in einem eigenen vm-Kontext.
// Grund: pdf-lib prueft `value instanceof Array`, und ein Array aus einem
// zweiten Kontext ist ein anderes Array — die Pruefung schlaegt fehl, obwohl
// der Code stimmt. Im Browser gibt es nur eine Laufzeit; der Test soll
// dieselbe Lage herstellen und nicht eine eigene.
//
// Das Buendel ist ein IIFE mit `var ImmoExpose = …`. In einem klassischen
// Skript wird daraus window.ImmoExpose; in einer Funktion ist es eine
// lokale Bindung, die hier zurueckgegeben und selbst angehaengt wird.
function ladeSkript(datei, rueckgabe) {
  const quelle = fs.readFileSync(datei, 'utf-8');
  // URL wird hereingegeben, damit der Test die erzeugten Blobs mitbekommt:
  // Node hat ein echtes URL.createObjectURL, und das wuerde den Nachbau
  // umgehen.
  const fn = new Function('window', 'React', 'fetch', 'URL',
    quelle + '\n;return ' + (rueckgabe || 'undefined') + ';');
  return fn(fenster, React, fetchStub, fenster.URL);
}
fenster.ImmoExpose = ladeSkript(BUENDEL, 'typeof ImmoExpose !== "undefined" ? ImmoExpose : undefined');
melde('Das Buendel gibt ImmoExpose heraus', !!fenster.ImmoExpose);
melde('Das Buendel gibt rendern, zuPdf, aufbereiten und schnittName heraus',
      !!(fenster.ImmoExpose && fenster.ImmoExpose.rendern && fenster.ImmoExpose.zuPdf
         && fenster.ImmoExpose.aufbereiten && fenster.ImmoExpose.schnittName));
ladeSkript(EDITOR);
melde('Die Ansicht meldet sich als window.ImmoExposeVorlagen',
      typeof fenster.ImmoExposeVorlagen === 'function');

if (fehler) { console.log(`\n  ${fehler} Pruefung(en) gescheitert.`); process.exit(1); }

(async () => {
  const hol = zeichne(fenster.ImmoExposeVorlagen, { user: { id: 'u1', role: 'chef' } });
  const warte = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 25)); };
  await warte();

  // --- 1. Die Liste ------------------------------------------------------
  let baum = hol();
  let alles = texte(baum).join(' | ');
  melde('Die Systemvorlagen stehen in der Liste',
        alles.includes('Raster') && alles.includes('Signature') && alles.includes('Studio'),
        alles.slice(0, 200));
  melde('Systemvorlagen sind als solche gekennzeichnet', alles.includes('SYSTEMVORLAGE'));
  melde('Die eigene Vorlage steht da und ist Standard',
        alles.includes('Hausvorlage') && alles.includes('STANDARD'));
  melde('Beispieldaten sind als Beispiel benannt', alles.includes('Beispieldaten'));
  melde('Ohne Auswahl keine Vorschau', alles.includes('Eine Vorlage wählen'));

  // --- 2. Eine Vorlage wählen: es entsteht ein PDF -----------------------
  const karten = knotenMit(baum, 'div').filter((k) => k.props && k.props.onClick
    && texte(k).join(' ').includes('Hausvorlage'));
  melde('Die Karte der Vorlage ist anklickbar', karten.length > 0);
  if (karten.length) karten[0].props.onClick();
  await warte(40);
  baum = hol();
  alles = texte(baum).join(' | ');
  const rahmen = knotenMit(baum, 'iframe');
  melde('Die Vorschau steht im Rahmen', rahmen.length === 1
        && String(rahmen[0].props.src).startsWith('blob:'), JSON.stringify(alles.slice(0, 300)));
  melde('Es wurde ein PDF erzeugt', blobs.length === 1);
  melde('Die Seitenzahl steht darunter', /10 Seiten/.test(alles), alles.slice(-200));
  melde('Schriften wurden von der Auslieferung geholt',
        geholt.length >= 4 && geholt.every((p) => p.startsWith('schriften/expose/')),
        JSON.stringify(geholt.slice(0, 3)));
  melde('Kein unbekannter Platzhalter in der Systemvorlage',
        !alles.includes('ist dem Feldkatalog nicht'), alles.slice(-300));

  // Das PDF ist wirklich eines, und es hat die Seiten der Vorlage.
  if (blobs.length) {
    const bytes = new Uint8Array(await blobs[0].arrayBuffer());
    const kopf = Buffer.from(bytes.slice(0, 5)).toString('latin1');
    melde('Die Ausgabe beginnt mit %PDF-', kopf === '%PDF-', kopf);
    melde('Die Ausgabe ist nicht winzig', bytes.length > 20000, String(bytes.length));
    const doc = await require('pdf-lib').PDFDocument.load(bytes, { updateMetadata: false });
    melde('Das PDF hat zehn Seiten', doc.getPageCount() === 10, String(doc.getPageCount()));
  }

  // --- 3. Kopie einer Systemvorlage --------------------------------------
  druecke(baum, 'Kopie anlegen');
  await warte();
  const eingefuegt = db.protokoll.filter((p) => p[0] === 'insert');
  melde('Die Kopie wird eingefügt', eingefuegt.length === 1, JSON.stringify(db.protokoll));
  if (eingefuegt.length) {
    const r = eingefuegt[0][2];
    melde('Die Kopie trägt den erfragten Namen', String(r.name).endsWith(' X'), String(r.name));
    melde('Die Kopie bekommt das Dokument der Vorlage',
          r.dokument && Array.isArray(r.dokument.seiten) && r.dokument.seiten.length > 0);
    melde('Die Kopie setzt keinen Mandanten selbst — das tut die Datenbank',
          !('mandant_id' in r), JSON.stringify(Object.keys(r)));
    melde('Die Kopie ist keine Systemvorlage und kein Standard',
          r.ist_standard !== true);
  }

  // --- 4. Umbenennen und Standard setzen ---------------------------------
  baum = hol();
  druecke(baum, 'Umbenennen');
  await warte();
  const umbenannt = db.protokoll.filter((p) => p[0] === 'update' && 'name' in p[2]);
  melde('Umbenennen schreibt den neuen Namen', umbenannt.length === 1,
        JSON.stringify(umbenannt));

  baum = hol();
  const vorher = db.protokoll.length;
  if (druecke(baum, 'Als Standard')) {
    await warte();
    const neu = db.protokoll.slice(vorher).filter((p) => p[0] === 'update');
    melde('Standard setzen räumt zuerst den alten ab',
          neu.length === 2 && neu[0][2].ist_standard === false && neu[1][2].ist_standard === true,
          JSON.stringify(neu));
  } else {
    melde('Es gibt eine Vorlage, die noch nicht Standard ist', false);
  }

  // --- 5. Die Texte der Vorlage bearbeiten -------------------------------
  // Das war die Beschwerde vom 06.10.2026: "Man kann manche Überschriften
  // nicht bearbeiten." Sie standen fest im Dokument, und das Dokument war
  // nur lesbar. Jetzt listet die Ansicht jeden festen Text der Vorlage,
  // schreibt die Aenderung in die Vorschau und beim Speichern in die
  // Datenbank — mit der vorigen Fassung in der Historie.
  //
  // Wieder die EIGENE Vorlage waehlen: Schritt 3 und 4 haben die Auswahl
  // auf die eben angelegte Kopie gezogen.
  baum = hol();
  const eigene = knotenMit(baum, 'div').filter((k) => k.props && k.props.onClick
    && texte(k).join(' ').includes('Hausvorlage'));
  if (eigene.length) eigene[0].props.onClick();
  await warte(40);
  baum = hol();
  melde('Eine eigene Vorlage bietet "Texte bearbeiten"',
        druecke(baum, 'Texte bearbeiten'), texte(baum).join(' | ').slice(-200));
  await warte();
  baum = hol();
  const felder = knotenMit(baum, 'textarea');
  melde('Jeder feste Text der Vorlage hat ein Feld', felder.length > 40,
        String(felder.length));
  const ueberschrift = felder.filter((f) => f.props.value === 'Die wichtigsten Fakten.');
  melde('Die Ueberschrift der Seite steht darunter', ueberschrift.length === 1,
        JSON.stringify(felder.slice(0, 8).map((f) => f.props.value)));

  if (ueberschrift.length) {
    const blobsVorher = blobs.length;
    ueberschrift[0].props.onChange({ target: { value: 'Alles auf einen Blick.' } });
    await warte(60);
    baum = hol();
    const alles5 = texte(baum).join(' | ');
    melde('Die Aenderung ist als offen gekennzeichnet',
          alles5.includes('nicht gespeichert'), alles5.slice(-200));
    melde('Die Vorschau wird mit der Aenderung neu gezeichnet',
          blobs.length === blobsVorher + 1, `${blobsVorher} -> ${blobs.length}`);
    if (blobs.length > blobsVorher) {
      const bytes = new Uint8Array(await blobs[blobs.length - 1].arrayBuffer());
      const doc = await require('pdf-lib').PDFDocument.load(bytes, { updateMetadata: false });
      melde('Das neue PDF hat weiterhin zehn Seiten', doc.getPageCount() === 10,
            String(doc.getPageCount()));
    }

    const vorher5 = db.protokoll.length;
    druecke(baum, 'Speichern');
    await warte(20);
    const neu5 = db.protokoll.slice(vorher5);
    const fassung = neu5.filter((p) => p[0] === 'insert' && p[1] === 'expose_vorlagen_versionen');
    const geschrieben = neu5.filter((p) => p[0] === 'update' && 'dokument' in p[2]);
    melde('Die bisherige Fassung geht in die Historie', fassung.length === 1,
          JSON.stringify(neu5.map((p) => [p[0], p[1]])));
    melde('Die Historie traegt die alte Versionsnummer',
          fassung.length === 1 && fassung[0][2].version === 3,
          fassung.length ? String(fassung[0][2].version) : '-');
    melde('Die neue Fassung wird gespeichert und zaehlt hoch',
          geschrieben.length === 1 && geschrieben[0][2].version === 4,
          JSON.stringify(geschrieben.map((p) => p[2].version)));
    if (geschrieben.length) {
      const dok = geschrieben[0][2].dokument;
      const drin = JSON.stringify(dok).includes('Alles auf einen Blick.');
      const alt = JSON.stringify(dok).includes('Die wichtigsten Fakten.');
      melde('Der neue Text steht im Dokument', drin && !alt,
            JSON.stringify([drin, alt]));
      melde('Das Dokument bleibt vollstaendig',
            Array.isArray(dok.seiten) && dok.seiten.length === 10,
            String(dok.seiten && dok.seiten.length));
    }
    // Die Historie bekommt das Dokument VOR der Aenderung.
    if (fassung.length) {
      melde('Die Historie traegt die Fassung vor der Aenderung',
            JSON.stringify(fassung[0][2].dokument).includes('Die wichtigsten Fakten.'));
    }
  }

  // Eine Systemvorlage bleibt unberuehrbar.
  baum = hol();
  const systemkarte = knotenMit(baum, 'div').filter((k) => k.props && k.props.onClick
    && texte(k).join(' ').includes('SYSTEMVORLAGE'));
  if (systemkarte.length) systemkarte[0].props.onClick();
  await warte(30);
  baum = hol();
  const allesSys = texte(baum).join(' | ');
  melde('Eine Systemvorlage laesst sich nicht bearbeiten',
        allesSys.includes('lassen sich nicht ändern')
        && !knotenMit(baum, 'textarea').length, allesSys.slice(-200));

  if (fehler) {
    console.log(`\n  ${fehler} Pruefung(en) gescheitert.`);
    process.exit(1);
  }
  console.log('  [ok] Der Exposé-Editor laeuft: Liste, Auswahl, Vorschau als echtes');
  console.log('       PDF (10 Seiten) mit den ausgelieferten Schriften, Kopie,');
  console.log('       Umbenennen, Standard setzen — und die Texte der Vorlage');
  console.log('       aendern, in der Vorschau sehen und mit Historie speichern.');
})();
