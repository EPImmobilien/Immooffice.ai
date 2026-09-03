/**
 * OpenImmo-XML lesen und ins kanonische Modell uebersetzen.
 *
 * Gegenstueck zu `src/lib/openimmo/xml.ts` (Export). Die Feldabbildung folgt
 * OPENIMMO_MAPPING.md in umgekehrter Richtung. Alles, was das XML nicht
 * enthaelt, bleibt null; nichts wird geraten.
 *
 * Der Leser ist bewusst nachsichtig: OpenImmo-Dateien aus der Praxis
 * weichen in Kleinigkeiten voneinander ab (Gross-/Kleinschreibung von
 * Attributwerten, fehlende Namensraeume, Zahlen mit Komma). Ein strenger
 * Leser wuerde brauchbare Daten wegwerfen.
 */

import { XMLParser } from "fast-xml-parser";

import {
  ganzzahlOderNull,
  leeresObjekt,
  textOderNull,
  wahrheitOderNull,
  zahlOderNull,
  type Energieausweistyp,
  type KanonischesBild,
  type KanonischesObjekt,
  type Nutzungsart,
  type Objektkategorie,
  type Vermarktungsart,
} from "../kern/modell";

/** Rohform eines Knotens nach dem Parser: Attribute unter `@_`, Text unter `#text`. */
type Knoten = Record<string, unknown>;

export interface OpenImmoLeseErgebnis {
  anbieter: { firmenname: string | null; anid: string | null };
  uebertragung: { art: string | null; modus: string | null; version: string | null };
  objekte: Array<KanonischesObjekt & { aktion: "NEU" | "CHANGE" | "DELETE" | null }>;
  fehler: Array<{ fremd_id: string | null; meldung: string }>;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Namensraum-Praefixe (etwa `oi:`) entfernen: Der Inhalt zaehlt, nicht die Deklaration.
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Diese Elemente kommen mehrfach vor und muessen immer Listen sein.
  isArray: (name) => ["immobilie", "anhang", "user_defined_simplefield", "user_defined_anyfield"].includes(name),
});

function knoten(wert: unknown): Knoten | null {
  return wert && typeof wert === "object" && !Array.isArray(wert) ? (wert as Knoten) : null;
}

/** Textinhalt eines Elements — auch, wenn es Attribute traegt. */
function text(wert: unknown): string | null {
  if (wert === null || wert === undefined) return null;
  if (typeof wert === "string" || typeof wert === "number") return textOderNull(wert);
  const k = knoten(wert);
  return k ? textOderNull(k["#text"]) : null;
}

function attribut(wert: unknown, name: string): string | null {
  const k = knoten(wert);
  return k ? textOderNull(k[`@_${name}`]) : null;
}

/** Zahl aus einem Element, egal ob als Text oder mit Attributen. */
function zahl(wert: unknown): number | null {
  return zahlOderNull(text(wert));
}

// --- Aufzaehlungen abbilden -------------------------------------------------

function vermarktungsart(k: Knoten | null): Vermarktungsart {
  const kauf = wahrheitOderNull(attribut(k, "KAUF")) === true;
  const miete = wahrheitOderNull(attribut(k, "MIETE_PACHT")) === true;
  if (kauf && miete) return "kauf_miete";
  if (miete) return "miete";
  return "kauf";
}

function nutzungsart(k: Knoten | null): Nutzungsart {
  const wohnen = wahrheitOderNull(attribut(k, "WOHNEN")) === true;
  const gewerbe = wahrheitOderNull(attribut(k, "GEWERBE")) === true;
  const anlage = wahrheitOderNull(attribut(k, "ANLAGE")) === true;
  if (wohnen && gewerbe) return "gemischt";
  if (gewerbe) return "gewerbe";
  if (anlage) return "anlage";
  return "wohnen";
}

/** Erster Kindknoten von <objektart> bestimmt die Kategorie, sein Attribut die Art. */
function objektkategorie(k: Knoten | null): { kategorie: Objektkategorie; art: string | null } {
  if (!k) return { kategorie: "sonstige", art: null };
  const zuordnung: Array<[string, Objektkategorie, string]> = [
    ["wohnung", "wohnung", "wohnungtyp"],
    ["haus", "haus", "haustyp"],
    ["grundstueck", "grundstueck", "grundst_typ"],
    ["buero_praxen", "gewerbe", "buero_typ"],
    ["einzelhandel", "gewerbe", "handel_typ"],
    ["gastgewerbe", "gewerbe", "gastgew_typ"],
    ["hallen_lager_prod", "gewerbe", "hallen_typ"],
    ["land_und_forstwirtschaft", "gewerbe", "land_typ"],
    ["parken", "sonstige", "parken_typ"],
    ["sonstige", "sonstige", "sonstige_typ"],
    ["freizeitimmobilie_gewerblich", "gewerbe", "freizeit_typ"],
    ["zinshaus_renditeobjekt", "anlage", "zins_typ"],
  ];
  for (const [element, kategorie, attr] of zuordnung) {
    if (element in k) {
      const art = attribut(k[element], attr);
      return { kategorie, art: art ? art.toLowerCase() : null };
    }
  }
  return { kategorie: "sonstige", art: null };
}

function energieausweistyp(epart: string | null): Energieausweistyp | null {
  switch ((epart ?? "").toUpperCase()) {
    case "BEDARF":
      return "bedarf";
    case "VERBRAUCH":
      return "verbrauch";
    case "NICHT_ERFORDERLICH":
    case "NICHT_NOETIG":
      return "nicht_erforderlich";
    case "LIEGT_NICHT_VOR":
      return "liegt_nicht_vor";
    default:
      return null;
  }
}

// --- Anhaenge ----------------------------------------------------------------

function bilder(anhaenge: unknown, dateien: Map<string, Uint8Array>): KanonischesBild[] {
  const liste = Array.isArray(anhaenge) ? anhaenge : anhaenge ? [anhaenge] : [];
  const ergebnis: KanonischesBild[] = [];

  liste.forEach((a, i) => {
    const k = knoten(a);
    if (!k) return;
    const gruppe = attribut(k, "gruppe");
    // Dokumente (PDF, Exposés) sind keine Bilder.
    if (gruppe && ["DOKUMENTE", "LINKS", "FILM", "FILMLINK"].includes(gruppe.toUpperCase())) return;

    const daten = knoten(k["daten"]);
    const pfad = text(daten?.["pfad"]);
    const anhanginhalt = text(daten?.["anhanginhalt"]);
    const location = (attribut(k, "location") ?? "").toUpperCase();

    let inhalt: Uint8Array | null = null;
    let url: string | null = null;
    if (anhanginhalt) {
      // Eingebettete Base64-Daten (selten, aber zulaessig).
      inhalt = Buffer.from(anhanginhalt.replace(/\s/g, ""), "base64");
    } else if (pfad && location === "REMOTE" && /^https?:\/\//i.test(pfad)) {
      url = pfad;
    } else if (pfad) {
      // EXTERN: Datei liegt im ZIP neben dem XML. Nur der Dateiname zaehlt,
      // Pfadangaben aus dem XML werden nicht aufgeloest — sie sind ungeprueft.
      const name = pfad.split(/[\\/]/).pop() ?? pfad;
      inhalt = dateien.get(name) ?? null;
      if (!inhalt) url = null;
    }

    if (!inhalt && !url) return;

    ergebnis.push({
      fremd_id: pfad,
      url,
      daten: inhalt,
      dateiname: pfad ? (pfad.split(/[\\/]/).pop() ?? null) : null,
      mime: text(k["format"]) ? mimeAusFormat(text(k["format"])!) : null,
      titel: text(k["anhangtitel"]),
      gruppe,
      reihenfolge: i,
    });
  });

  return ergebnis;
}

function mimeAusFormat(format: string): string | null {
  const f = format.toLowerCase().replace(/^image\//, "");
  if (f === "jpg" || f === "jpeg") return "image/jpeg";
  if (f === "png") return "image/png";
  if (f === "gif") return "image/gif";
  if (f === "webp") return "image/webp";
  if (f === "pdf") return "application/pdf";
  return null;
}

// --- Immobilie ---------------------------------------------------------------

function immobilieLesen(
  im: Knoten,
  index: number,
  dateien: Map<string, Uint8Array>,
): KanonischesObjekt & { aktion: "NEU" | "CHANGE" | "DELETE" | null } {
  const verwaltung = knoten(im["verwaltung_techn"]);
  const kategorie = knoten(im["objektkategorie"]);
  const geo = knoten(im["geo"]);
  const koord = knoten(geo?.["geokoordinaten"]);
  const preise = knoten(im["preise"]);
  const flaechen = knoten(im["flaechen"]);
  const zustand = knoten(im["zustand_angaben"]);
  const energie = knoten(zustand?.["energiepass"]);
  const texte = knoten(im["freitexte"]);
  const anhaenge = knoten(im["anhaenge"]);

  // Fremd-ID: die interne Objektnummer des Senders; ersatzweise die externe;
  // ganz ohne Nummer die Position in der Datei (dann ist kein Wiedererkennen
  // beim naechsten Import moeglich — das meldet der Rahmen als Hinweis).
  const nummerIntern = text(verwaltung?.["objektnr_intern"]);
  const nummerExtern = text(verwaltung?.["objektnr_extern"]);
  const fremdId = nummerIntern ?? nummerExtern ?? `position-${index + 1}`;

  const o = leeresObjekt(fremdId);
  const { kategorie: objKategorie, art } = objektkategorie(knoten(kategorie?.["objektart"]));

  o.objektnummer = nummerExtern ?? nummerIntern;
  o.titel = text(texte?.["objekttitel"]);
  o.bezeichnung =
    o.titel ?? ([text(geo?.["strasse"]), text(geo?.["hausnummer"])].filter(Boolean).join(" ") || fremdId);
  o.vermarktungsart = vermarktungsart(knoten(kategorie?.["vermarktungsart"]));
  o.nutzungsart = nutzungsart(knoten(kategorie?.["nutzungsart"]));
  o.objektkategorie = objKategorie;
  o.objektart = art;

  o.strasse = text(geo?.["strasse"]);
  o.hausnummer = text(geo?.["hausnummer"]);
  o.plz = text(geo?.["plz"]);
  o.ort = text(geo?.["ort"]);
  o.ortsteil = text(geo?.["regionaler_zusatz"]);
  const land = attribut(geo?.["land"], "iso_land");
  if (land) o.land = land.length === 3 ? land.slice(0, 2).toUpperCase() : land.toUpperCase();
  o.etage = text(geo?.["etage"]);
  o.etagen_gesamt = ganzzahlOderNull(text(geo?.["anzahl_etagen"]));
  o.lat = zahl(koord ? koord["@_breitengrad"] : null);
  o.lon = zahl(koord ? koord["@_laengengrad"] : null);

  o.wohnflaeche = zahl(flaechen?.["wohnflaeche"]);
  o.nutzflaeche = zahl(flaechen?.["nutzflaeche"]);
  o.gesamtflaeche = zahl(flaechen?.["gesamtflaeche"]);
  o.grundstuecksflaeche = zahl(flaechen?.["grundstuecksflaeche"]);
  o.zimmer = zahl(flaechen?.["anzahl_zimmer"]);
  o.schlafzimmer = ganzzahlOderNull(text(flaechen?.["anzahl_schlafzimmer"]));
  o.badezimmer = ganzzahlOderNull(text(flaechen?.["anzahl_badezimmer"]));
  o.anzahl_balkone = ganzzahlOderNull(text(flaechen?.["anzahl_balkone"]));
  o.anzahl_terrassen = ganzzahlOderNull(text(flaechen?.["anzahl_terrassen"]));
  o.stellplatz_anzahl = ganzzahlOderNull(text(flaechen?.["anzahl_stellplaetze"]));

  o.baujahr = ganzzahlOderNull(text(zustand?.["baujahr"]));
  o.letzte_modernisierung = ganzzahlOderNull(text(zustand?.["letztemodernisierung"]));
  o.zustand = attribut(zustand?.["zustand"], "zustand_art")?.toLowerCase() ?? null;
  o.verfuegbar_ab = text(zustand?.["verfuegbar_ab"]);

  o.kaufpreis = zahl(preise?.["kaufpreis"]);
  o.kaufpreis_auf_anfrage = wahrheitOderNull(attribut(preise?.["kaufpreis"], "auf_anfrage")) === true;
  o.kaltmiete = zahl(preise?.["kaltmiete"]);
  o.warmmiete = zahl(preise?.["warmmiete"]);
  o.nebenkosten = zahl(preise?.["nebenkosten"]);
  o.heizkosten = zahl(preise?.["heizkosten"]);
  o.kaution = zahl(preise?.["kaution"]) ?? zahlOderNull(text(preise?.["kaution_text"]));
  o.hausgeld = zahl(preise?.["hausgeld"]);
  o.provision_kaeufer = text(preise?.["aussen_courtage"]);
  o.provision_hinweis = text(preise?.["courtage_hinweis"]);
  o.courtage_frei = wahrheitOderNull(attribut(preise?.["provisionspflichtig"], "provisionspflichtig") ?? text(preise?.["provisionspflichtig"])) === false;

  o.energieausweis_typ = energieausweistyp(text(energie?.["epart"]));
  o.energie_kennwert = zahl(energie?.["endenergiebedarf"]) ?? zahl(energie?.["energieverbrauchkennwert"]);
  o.energie_klasse = text(energie?.["wertklasse"]);
  o.energie_traeger = text(energie?.["primaerenergietraeger"]);
  o.energie_baujahr_anlage = ganzzahlOderNull(text(energie?.["baujahr"]));
  o.energie_warmwasser_enthalten = wahrheitOderNull(text(energie?.["mitwarmwasser"]));
  o.energie_gueltig_bis = text(energie?.["gueltig_bis"]);

  o.beschreibung_objekt = text(texte?.["objektbeschreibung"]);
  o.beschreibung_ausstattung = text(texte?.["ausstatt_beschr"]);
  o.beschreibung_lage = text(texte?.["lage"]);
  o.beschreibung_sonstiges = text(texte?.["sonstige_angaben"]);

  o.geaendert_am_fremd = text(verwaltung?.["stand_vom"]);
  o.bilder = bilder(anhaenge?.["anhang"], dateien);

  const aktion = (attribut(verwaltung?.["aktion"], "aktionart") ?? "").toUpperCase();
  return {
    ...o,
    aktion: aktion === "NEU" || aktion === "CHANGE" || aktion === "DELETE" ? aktion : null,
  };
}

/**
 * Liest eine OpenImmo-Datei.
 *
 * `dateien` sind die Bilder aus dem ZIP, nach Dateiname. Ohne ZIP bleibt die
 * Zuordnung leer; Anhaenge mit Adresse werden trotzdem uebernommen.
 */
export function openImmoLesen(xml: string, dateien: Map<string, Uint8Array> = new Map()): OpenImmoLeseErgebnis {
  let wurzel: Knoten;
  try {
    wurzel = parser.parse(xml) as Knoten;
  } catch {
    throw new Error("Die Datei ist kein lesbares XML.");
  }

  const openimmo = knoten(wurzel["openimmo"]);
  if (!openimmo) throw new Error("Die Datei enthaelt kein <openimmo>-Element.");

  const uebertragung = knoten(openimmo["uebertragung"]);
  const anbieter = knoten(openimmo["anbieter"]);
  const immobilien = Array.isArray(anbieter?.["immobilie"]) ? (anbieter!["immobilie"] as unknown[]) : [];

  const ergebnis: OpenImmoLeseErgebnis = {
    anbieter: {
      firmenname: text(anbieter?.["firma"]),
      anid: text(anbieter?.["openimmo_anid"]),
    },
    uebertragung: {
      art: attribut(uebertragung, "art"),
      modus: attribut(uebertragung, "umfang"),
      version: attribut(uebertragung, "version"),
    },
    objekte: [],
    fehler: [],
  };

  immobilien.forEach((roh, i) => {
    const k = knoten(roh);
    if (!k) {
      ergebnis.fehler.push({ fremd_id: null, meldung: `Immobilie ${i + 1} ist leer.` });
      return;
    }
    try {
      ergebnis.objekte.push(immobilieLesen(k, i, dateien));
    } catch (e) {
      ergebnis.fehler.push({
        fremd_id: null,
        meldung: `Immobilie ${i + 1} konnte nicht gelesen werden: ${e instanceof Error ? e.message : "unbekannter Fehler"}`,
      });
    }
  });

  return ergebnis;
}
