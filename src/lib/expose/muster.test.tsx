import { renderToBuffer } from "@react-pdf/renderer";
import { writeFileSync, mkdirSync } from "node:fs";
import { it } from "vitest";
import type { ExposeBild, ExposeBranding, ExposeObjekt } from "./typen";
import { VORLAGEN } from "./vorlagen";
const branding: ExposeBranding = {
  firmenname: "Nordlicht Immobilien", farbePrimaer: "#1B2A47", farbeAkzent: "#B5934F",
  strasse: "Hafenstraße 4", plz: "24103", ort: "Kiel",
  telefon: "0431 1234567", email: "info@nordlicht.example",
  web: "www.nordlicht.example", impressum: null,
};
const objekt: ExposeObjekt = {
  objektnummer: "0001", bezeichnung: "ETW Rosenweg 12",
  titel: "Helle 3-Zimmer-Wohnung mit Südbalkon",
  objektkategorie: "wohnung", objektart: "Etagenwohnung", vermarktungsart: "kauf",
  strasse: "Rosenweg", hausnummer: "12", plz: "24103", ort: "Kiel",
  adresse_veroeffentlichen: true,
  wohnflaeche: 78.5, nutzflaeche: null, grundstuecksflaeche: null,
  zimmer: 3, baujahr: 1998, kaufpreis: 349000, kaltmiete: null,
  nebenkosten: 210, hausgeld: 285, provision_kaeufer: "3,57 % inkl. MwSt.",
  energieausweis_typ: "verbrauch", energie_kennwert: 94.5, energie_klasse: "C",
  beschreibung_objekt: "Die Wohnung liegt im dritten Obergeschoss eines gepflegten Mehrfamilienhauses aus dem Jahr 1998. Der Grundriss ist klar geschnitten: Der Wohnbereich öffnet sich nach Süden auf den Balkon, die beiden weiteren Zimmer liegen zur ruhigen Gartenseite. Das Treppenhaus wurde 2019 modernisiert, der Aufzug erschließt alle Etagen.",
  beschreibung_ausstattung: "Südbalkon mit Blick ins Grüne, Einbauküche aus dem Jahr 2021, Kellerabteil, Stellplatz vor dem Haus, Fußbodenheizung im Bad, bodentiefe Dusche und Wanne.",
  beschreibung_lage: "Ruhige Wohnlage in Düsternbrook, fußläufig zur Kiellinie. Bäcker, Supermarkt und Apotheke liegen in wenigen Gehminuten, die Buslinie 41 hält vor der Tür.",
  texte_ki_erzeugt: true,
};
const PNGS = [
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAIAAADbtmxLAAAAMUlEQVR42u3OQQ0AAAgEoEtiEhOb0hbOBxsBSPW8EiEhISEhISEhISEhISEhISGhSwuGdxhbW+RwjQAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAIAAADbtmxLAAAAMElEQVR42u3OMQ0AAAgDsAmbRETjgnA0qYCmnVciJCQkJCQkJCQkJCQkJCQkJHRpAe6GGFt/53WLAAAAAElFTkSuQmCC",
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAIAAADbtmxLAAAAMklEQVR42u3OMQ0AAAgDsAlDCSLwf+KCcDSpgKZrXomQkJCQkJCQkJCQkJCQkJCQ0KUFVqQYWz2Pgi8AAAAASUVORK5CYII=",
].map((b) => Buffer.from(b, "base64"));
const bilder: ExposeBild[] = Array.from({ length: 7 }, (_, i) => ({
  daten: PNGS[i % 3]!, format: "png" as const,
  titel: `Ansicht ${i + 1}`, art: "foto", kiBearbeitet: i === 1,
}));
/**
 * Erzeugt Muster-PDFs zum Ansehen.
 *
 * Laeuft nur mit gesetztem MUSTER_ZIEL und ist deshalb im normalen Testlauf
 * still. Der Zweck ist nicht die Pruefung, sondern das Hinsehen: Die
 * Vorlagen waren einmal fehlerfrei nach Testlage und trotzdem unbrauchbar —
 * eine Titelseite ohne Titel, Helvetica statt Hausschrift, keine Hierarchie.
 * Das faellt nur auf, wenn man die Seiten betrachtet.
 *
 *   MUSTER_ZIEL=/tmp/muster npx vitest run src/lib/expose/muster.test.tsx
 *   pdftoppm -png -r 72 /tmp/muster/klassisch.pdf /tmp/muster/klassisch
 */
it.skipIf(!process.env["MUSTER_ZIEL"])("schreibt Muster-PDFs", async () => {
  const ziel = process.env["MUSTER_ZIEL"]!;
  mkdirSync(ziel, { recursive: true });
  for (const v of VORLAGEN) {
    const puffer = await renderToBuffer(v.bauen({ objekt, branding, bilder: bilder.slice(0, v.bilder) }));
    writeFileSync(`${ziel}/${v.schluessel}.pdf`, puffer);
  }
}, 120_000);
