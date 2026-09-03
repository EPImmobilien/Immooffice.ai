/**
 * Feldabbildung onOffice <-> kanonisches Modell.
 *
 * Die Feldnamen sind die der oeffentlichen onOffice-Dokumentation. Welche
 * davon in einem konkreten Konto existieren, entscheidet das Konto — deshalb
 * gibt es Pflichtfelder (immer da) und Kandidaten (werden vor dem ersten
 * Lauf einzeln geprueft, connector.ts).
 */

import {
  ganzzahlOderNull,
  leererKontakt,
  leeresObjekt,
  textOderNull,
  wahrheitOderNull,
  zahlOderNull,
  type Energieausweistyp,
  type KanonischerKontakt,
  type KanonischesObjekt,
  type Objektkategorie,
  type Vermarktungsart,
} from "../kern/modell";

/** Felder, die jedes onOffice-Konto kennt. */
export const OBJEKT_PFLICHTFELDER = [
  "objektnr_extern",
  "objekttitel",
  "objektart",
  "objekttyp",
  "vermarktungsart",
  "nutzungsart",
  "strasse",
  "hausnummer",
  "plz",
  "ort",
  "land",
  "kaufpreis",
  "kaltmiete",
  "wohnflaeche",
  "anzahl_zimmer",
  "status",
  "Aenderung",
] as const;

/** Felder, die je Konto vorhanden sein koennen — einzeln zu pruefen. */
export const OBJEKT_KANDIDATENFELDER = [
  "objektbeschreibung",
  "ausstatt_beschr",
  "lage",
  "sonstige_angaben",
  "warmmiete",
  "nebenkosten",
  "heizkosten",
  "kaution",
  "hausgeld",
  "aussen_courtage",
  "courtage_hinweis",
  "nutzflaeche",
  "gesamtflaeche",
  "grundstuecksflaeche",
  "anzahl_schlafzimmer",
  "anzahl_badezimmer",
  "anzahl_balkone",
  "anzahl_terrassen",
  "anzahl_stellplaetze",
  "baujahr",
  "zustand",
  "verfuegbar_ab",
  "etage",
  "anzahl_etagen",
  "breitengrad",
  "laengengrad",
  "energieausweistyp",
  "energieverbrauchskennwert",
  "endenergiebedarf",
  "energietraeger",
  "energyClass",
  "gueltig_bis",
  "kaufpreis_auf_anfrage",
  "veroeffentlichen",
] as const;

export const ADRESS_FELDER = [
  "Anrede",
  "Titel",
  "Vorname",
  "Name",
  "Firma",
  "Email",
  "Telefon1",
  "Mobil",
  "Strasse",
  "Plz",
  "Ort",
  "Land",
  "Aenderung",
] as const;

function vermarktungsart(wert: unknown): Vermarktungsart {
  const t = (textOderNull(wert) ?? "").toLowerCase();
  if (t.includes("kauf") && t.includes("miete")) return "kauf_miete";
  if (t.includes("miete") || t.includes("pacht")) return "miete";
  return "kauf";
}

function objektkategorie(objektart: unknown): Objektkategorie {
  const t = (textOderNull(objektart) ?? "").toLowerCase();
  if (t.includes("wohnung")) return "wohnung";
  if (t.includes("haus")) return "haus";
  if (t.includes("grundst")) return "grundstueck";
  if (t.includes("zins") || t.includes("rendite") || t.includes("anlage")) return "anlage";
  if (t.includes("buero") || t.includes("büro") || t.includes("praxis") || t.includes("halle") || t.includes("laden") || t.includes("gewerbe") || t.includes("gastro")) return "gewerbe";
  return "sonstige";
}

function energieausweistyp(wert: unknown): Energieausweistyp | null {
  const t = (textOderNull(wert) ?? "").toLowerCase();
  if (t.startsWith("bedarf")) return "bedarf";
  if (t.startsWith("verbrauch")) return "verbrauch";
  if (t.includes("nicht") && t.includes("erforder")) return "nicht_erforderlich";
  if (t.includes("liegt")) return "liegt_nicht_vor";
  return null;
}

/** onOffice-Datensatz (elements) → kanonisches Objekt. */
export function objektAusOnOffice(id: string | number, e: Record<string, unknown>): KanonischesObjekt {
  const o = leeresObjekt(String(id));

  o.objektnummer = textOderNull(e["objektnr_extern"]);
  o.titel = textOderNull(e["objekttitel"]);
  o.bezeichnung =
    o.titel ??
    ([textOderNull(e["strasse"]), textOderNull(e["hausnummer"])].filter(Boolean).join(" ") || o.objektnummer || String(id));
  o.vermarktungsart = vermarktungsart(e["vermarktungsart"]);
  o.objektkategorie = objektkategorie(e["objektart"]);
  o.objektart = textOderNull(e["objekttyp"])?.toLowerCase() ?? null;
  const nutzung = (textOderNull(e["nutzungsart"]) ?? "").toLowerCase();
  o.nutzungsart = nutzung.includes("gewerbe") && nutzung.includes("wohnen") ? "gemischt"
    : nutzung.includes("gewerbe") ? "gewerbe"
    : nutzung.includes("anlage") ? "anlage"
    : "wohnen";

  o.strasse = textOderNull(e["strasse"]);
  o.hausnummer = textOderNull(e["hausnummer"]);
  o.plz = textOderNull(e["plz"]);
  o.ort = textOderNull(e["ort"]);
  const land = textOderNull(e["land"]);
  if (land && /^[A-Za-z]{2,3}$/.test(land)) o.land = land.slice(0, 2).toUpperCase();
  o.etage = textOderNull(e["etage"]);
  o.etagen_gesamt = ganzzahlOderNull(e["anzahl_etagen"]);
  o.lat = zahlOderNull(e["breitengrad"]);
  o.lon = zahlOderNull(e["laengengrad"]);
  o.adresse_veroeffentlichen = wahrheitOderNull(e["veroeffentlichen"]) === true;

  o.wohnflaeche = zahlOderNull(e["wohnflaeche"]);
  o.nutzflaeche = zahlOderNull(e["nutzflaeche"]);
  o.gesamtflaeche = zahlOderNull(e["gesamtflaeche"]);
  o.grundstuecksflaeche = zahlOderNull(e["grundstuecksflaeche"]);
  o.zimmer = zahlOderNull(e["anzahl_zimmer"]);
  o.schlafzimmer = ganzzahlOderNull(e["anzahl_schlafzimmer"]);
  o.badezimmer = ganzzahlOderNull(e["anzahl_badezimmer"]);
  o.anzahl_balkone = ganzzahlOderNull(e["anzahl_balkone"]);
  o.anzahl_terrassen = ganzzahlOderNull(e["anzahl_terrassen"]);
  o.stellplatz_anzahl = ganzzahlOderNull(e["anzahl_stellplaetze"]);

  o.baujahr = ganzzahlOderNull(e["baujahr"]);
  o.zustand = textOderNull(e["zustand"])?.toLowerCase() ?? null;
  o.verfuegbar_ab = textOderNull(e["verfuegbar_ab"]);

  o.kaufpreis = zahlOderNull(e["kaufpreis"]);
  o.kaufpreis_auf_anfrage = wahrheitOderNull(e["kaufpreis_auf_anfrage"]) === true;
  o.kaltmiete = zahlOderNull(e["kaltmiete"]);
  o.warmmiete = zahlOderNull(e["warmmiete"]);
  o.nebenkosten = zahlOderNull(e["nebenkosten"]);
  o.heizkosten = zahlOderNull(e["heizkosten"]);
  o.kaution = zahlOderNull(e["kaution"]);
  o.hausgeld = zahlOderNull(e["hausgeld"]);
  o.provision_kaeufer = textOderNull(e["aussen_courtage"]);
  o.provision_hinweis = textOderNull(e["courtage_hinweis"]);

  o.energieausweis_typ = energieausweistyp(e["energieausweistyp"]);
  o.energie_kennwert = zahlOderNull(e["endenergiebedarf"]) ?? zahlOderNull(e["energieverbrauchskennwert"]);
  o.energie_klasse = textOderNull(e["energyClass"])?.toUpperCase() ?? null;
  o.energie_traeger = textOderNull(e["energietraeger"]);
  o.energie_gueltig_bis = textOderNull(e["gueltig_bis"]);

  o.beschreibung_objekt = textOderNull(e["objektbeschreibung"]);
  o.beschreibung_ausstattung = textOderNull(e["ausstatt_beschr"]);
  o.beschreibung_lage = textOderNull(e["lage"]);
  o.beschreibung_sonstiges = textOderNull(e["sonstige_angaben"]);

  o.geaendert_am_fremd = zeitpunkt(e["Aenderung"]);
  return o;
}

/** Kanonisches Objekt → onOffice-Datensatz fuers Anlegen oder Aendern. */
export function objektNachOnOffice(o: KanonischesObjekt): Record<string, unknown> {
  const d: Record<string, unknown> = {
    objektnr_extern: o.objektnummer ?? undefined,
    objekttitel: o.titel ?? o.bezeichnung,
    vermarktungsart: o.vermarktungsart === "miete" ? "miete" : "kauf",
    nutzungsart: o.nutzungsart,
    objektart: o.objektkategorie,
    objekttyp: o.objektart ?? undefined,
    strasse: o.strasse ?? undefined,
    hausnummer: o.hausnummer ?? undefined,
    plz: o.plz ?? undefined,
    ort: o.ort ?? undefined,
    land: o.land,
    kaufpreis: o.kaufpreis ?? undefined,
    kaltmiete: o.kaltmiete ?? undefined,
    warmmiete: o.warmmiete ?? undefined,
    nebenkosten: o.nebenkosten ?? undefined,
    wohnflaeche: o.wohnflaeche ?? undefined,
    grundstuecksflaeche: o.grundstuecksflaeche ?? undefined,
    anzahl_zimmer: o.zimmer ?? undefined,
    baujahr: o.baujahr ?? undefined,
    objektbeschreibung: o.beschreibung_objekt ?? undefined,
    ausstatt_beschr: o.beschreibung_ausstattung ?? undefined,
    lage: o.beschreibung_lage ?? undefined,
    sonstige_angaben: o.beschreibung_sonstiges ?? undefined,
  };
  // Nichts Leeres senden — onOffice wuerde sonst vorhandene Werte loeschen.
  for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
  return d;
}

export function kontaktAusOnOffice(id: string | number, e: Record<string, unknown>): KanonischerKontakt {
  const k = leererKontakt(String(id));
  k.anrede = textOderNull(e["Anrede"]);
  k.titel = textOderNull(e["Titel"]);
  k.vorname = textOderNull(e["Vorname"]);
  k.nachname = textOderNull(e["Name"]);
  k.firma = textOderNull(e["Firma"]);
  k.email = textOderNull(e["Email"])?.toLowerCase() ?? null;
  k.telefon = textOderNull(e["Telefon1"]);
  k.mobil = textOderNull(e["Mobil"]);
  // onOffice fuehrt Strasse und Hausnummer in EINEM Feld.
  const strasse = textOderNull(e["Strasse"]);
  if (strasse) {
    const m = /^(.*?)\s+(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)$/.exec(strasse);
    k.strasse = m ? m[1]! : strasse;
    k.hausnummer = m ? m[2]! : null;
  }
  k.plz = textOderNull(e["Plz"]);
  k.ort = textOderNull(e["Ort"]);
  const land = textOderNull(e["Land"]);
  if (land && /^[A-Za-z]{2,3}$/.test(land)) k.land = land.slice(0, 2).toUpperCase();
  k.geaendert_am_fremd = zeitpunkt(e["Aenderung"]);
  return k;
}

export function kontaktNachOnOffice(k: KanonischerKontakt): Record<string, unknown> {
  const d: Record<string, unknown> = {
    Anrede: k.anrede ?? undefined,
    Titel: k.titel ?? undefined,
    Vorname: k.vorname ?? undefined,
    Name: k.nachname ?? undefined,
    Firma: k.firma ?? undefined,
    Email: k.email ?? undefined,
    Telefon1: k.telefon ?? undefined,
    Mobil: k.mobil ?? undefined,
    Strasse: [k.strasse, k.hausnummer].filter(Boolean).join(" ") || undefined,
    Plz: k.plz ?? undefined,
    Ort: k.ort ?? undefined,
    Land: k.land,
  };
  for (const key of Object.keys(d)) if (d[key] === undefined) delete d[key];
  return d;
}

/** onOffice liefert "2026-09-03 14:22:10" — nach ISO, ohne Zeitzone zu erfinden. */
function zeitpunkt(wert: unknown): string | null {
  const t = textOderNull(wert);
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (!m) return null;
  // onOffice-Server stehen in Deutschland; die Zeit gilt als Europe/Berlin.
  // Fuer „letzte Aenderung gewinnt" reicht die Reihenfolge — beide Seiten
  // werden mit derselben Annahme verglichen.
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}`;
}
