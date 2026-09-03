/**
 * Kanonisches Modell des Connector-Rahmens (docs/AUTONOMIE.md 5.1).
 *
 * Jeder Connector uebersetzt sein Fremdformat GENAU EINMAL in diese Formen —
 * und zurueck. Die Anwendung selbst kennt kein Fremdformat.
 *
 * Die Feldnamen sind die Spaltennamen der Tabellen `objekte` und `kontakte`
 * (DATA_MODEL.md), damit ein geholter Datensatz ohne zweite Uebersetzung
 * gespeichert werden kann. Alles, was ein Fremdsystem nicht liefert, ist
 * `null` — nie geraten, nie mit Vorgaben gefuellt (KI-Regel „keine erfundenen
 * Objektdaten" gilt auch fuer Importe).
 */

export type Vermarktungsart = "kauf" | "miete" | "kauf_miete";
export type Objektkategorie = "wohnung" | "haus" | "grundstueck" | "gewerbe" | "anlage" | "sonstige";
export type Nutzungsart = "wohnen" | "gewerbe" | "anlage" | "gemischt";
export type Energieausweistyp = "bedarf" | "verbrauch" | "nicht_erforderlich" | "liegt_nicht_vor";

export interface KanonischesBild {
  fremd_id: string | null;
  /** Herunterladbare Adresse ODER eingebettete Daten — eines von beiden */
  url: string | null;
  daten: Uint8Array | null;
  dateiname: string | null;
  mime: string | null;
  titel: string | null;
  /** Titelbild, Grundriss, Aussenansicht … in der Sprache des Fremdsystems */
  gruppe: string | null;
  reihenfolge: number;
}

export interface KanonischesObjekt {
  fremd_id: string;
  /** Zeitpunkt der letzten Aenderung im Fremdsystem; Grundlage fuer „letzte Aenderung gewinnt" */
  geaendert_am_fremd: string | null;

  objektnummer: string | null;
  bezeichnung: string;
  titel: string | null;

  vermarktungsart: Vermarktungsart;
  objektkategorie: Objektkategorie;
  objektart: string | null;
  nutzungsart: Nutzungsart;

  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  ortsteil: string | null;
  land: string;
  etage: string | null;
  etagen_gesamt: number | null;
  lat: number | null;
  lon: number | null;
  adresse_veroeffentlichen: boolean;

  wohnflaeche: number | null;
  nutzflaeche: number | null;
  gesamtflaeche: number | null;
  grundstuecksflaeche: number | null;
  zimmer: number | null;
  schlafzimmer: number | null;
  badezimmer: number | null;
  anzahl_balkone: number | null;
  anzahl_terrassen: number | null;
  stellplatz_anzahl: number | null;

  baujahr: number | null;
  letzte_modernisierung: number | null;
  zustand: string | null;
  verfuegbar_ab: string | null;

  kaufpreis: number | null;
  kaufpreis_auf_anfrage: boolean;
  kaltmiete: number | null;
  warmmiete: number | null;
  nebenkosten: number | null;
  heizkosten: number | null;
  kaution: number | null;
  hausgeld: number | null;
  provision_kaeufer: string | null;
  provision_hinweis: string | null;
  courtage_frei: boolean;

  energieausweis_typ: Energieausweistyp | null;
  energie_kennwert: number | null;
  energie_klasse: string | null;
  energie_traeger: string | null;
  energie_baujahr_anlage: number | null;
  energie_warmwasser_enthalten: boolean | null;
  energie_gueltig_bis: string | null;

  beschreibung_objekt: string | null;
  beschreibung_ausstattung: string | null;
  beschreibung_lage: string | null;
  beschreibung_sonstiges: string | null;

  bilder: KanonischesBild[];
}

export interface KanonischerKontakt {
  fremd_id: string;
  geaendert_am_fremd: string | null;

  anrede: string | null;
  titel: string | null;
  vorname: string | null;
  nachname: string | null;
  firma: string | null;
  email: string | null;
  telefon: string | null;
  mobil: string | null;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
  notizen: string | null;
}

export interface KanonischerTermin {
  fremd_id: string;
  geaendert_am_fremd: string | null;
  titel: string;
  beginn: string;
  ende: string | null;
  ort: string | null;
  notiz: string | null;
  /** Fremd-IDs, damit die Zuordnung ueber integration_mappings laeuft */
  objekt_fremd_id: string | null;
  kontakt_fremd_ids: string[];
}

/** Ein Objekt mit allen Feldern auf null — Ausgangspunkt jedes Mappings. */
export function leeresObjekt(fremdId: string): KanonischesObjekt {
  return {
    fremd_id: fremdId,
    geaendert_am_fremd: null,
    objektnummer: null,
    bezeichnung: "",
    titel: null,
    vermarktungsart: "kauf",
    objektkategorie: "sonstige",
    objektart: null,
    nutzungsart: "wohnen",
    strasse: null,
    hausnummer: null,
    plz: null,
    ort: null,
    ortsteil: null,
    land: "DE",
    etage: null,
    etagen_gesamt: null,
    lat: null,
    lon: null,
    adresse_veroeffentlichen: false,
    wohnflaeche: null,
    nutzflaeche: null,
    gesamtflaeche: null,
    grundstuecksflaeche: null,
    zimmer: null,
    schlafzimmer: null,
    badezimmer: null,
    anzahl_balkone: null,
    anzahl_terrassen: null,
    stellplatz_anzahl: null,
    baujahr: null,
    letzte_modernisierung: null,
    zustand: null,
    verfuegbar_ab: null,
    kaufpreis: null,
    kaufpreis_auf_anfrage: false,
    kaltmiete: null,
    warmmiete: null,
    nebenkosten: null,
    heizkosten: null,
    kaution: null,
    hausgeld: null,
    provision_kaeufer: null,
    provision_hinweis: null,
    courtage_frei: false,
    energieausweis_typ: null,
    energie_kennwert: null,
    energie_klasse: null,
    energie_traeger: null,
    energie_baujahr_anlage: null,
    energie_warmwasser_enthalten: null,
    energie_gueltig_bis: null,
    beschreibung_objekt: null,
    beschreibung_ausstattung: null,
    beschreibung_lage: null,
    beschreibung_sonstiges: null,
    bilder: [],
  };
}

export function leererKontakt(fremdId: string): KanonischerKontakt {
  return {
    fremd_id: fremdId,
    geaendert_am_fremd: null,
    anrede: null,
    titel: null,
    vorname: null,
    nachname: null,
    firma: null,
    email: null,
    telefon: null,
    mobil: null,
    strasse: null,
    hausnummer: null,
    plz: null,
    ort: null,
    land: "DE",
    notizen: null,
  };
}

// --- Kleine Helfer fuer Mappings -------------------------------------------
// Fremdsysteme liefern Zahlen als Text mit Komma, leere Strings statt null und
// Wahrheitswerte als "1"/"0". Diese Helfer normalisieren das an einer Stelle.

/** Leerer oder nur aus Leerraum bestehender Text wird null. */
export function textOderNull(wert: unknown): string | null {
  if (wert === null || wert === undefined) return null;
  const t = String(wert).trim();
  return t === "" ? null : t;
}

/** Zahl aus "1.234,56", "1234.56", 1234 — sonst null. */
export function zahlOderNull(wert: unknown): number | null {
  if (wert === null || wert === undefined || wert === "") return null;
  if (typeof wert === "number") return Number.isFinite(wert) ? wert : null;
  let t = String(wert).trim().replace(/\s/g, "");
  if (t === "") return null;
  // Deutsches Format: Punkt als Tausender, Komma als Dezimaltrenner.
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Ganze Zahl oder null. */
export function ganzzahlOderNull(wert: unknown): number | null {
  const n = zahlOderNull(wert);
  return n === null ? null : Math.trunc(n);
}

/** "1", "true", "ja", "yes" → true; "0", "false", "nein", "" → false; sonst null. */
export function wahrheitOderNull(wert: unknown): boolean | null {
  if (typeof wert === "boolean") return wert;
  if (wert === null || wert === undefined) return null;
  const t = String(wert).trim().toLowerCase();
  if (["1", "true", "ja", "yes", "j", "y"].includes(t)) return true;
  if (["0", "false", "nein", "no", "n", ""].includes(t)) return false;
  return null;
}
