/**
 * Datentypen des OpenImmo-Exports (Master-Prompt Abschnitt 7).
 * Feldabbildung: OPENIMMO_MAPPING.md
 */

export interface OpenImmoObjekt {
  id: string;
  objektnummer: string;
  bezeichnung: string;
  titel: string | null;

  vermarktungsart: string;
  objektkategorie: string;
  objektart: string | null;
  nutzungsart: string;

  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  ortsteil: string | null;
  land: string;
  etage: string | null;
  etagen_gesamt: number | null;
  wohnungsnummer: string | null;
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
  miete_ist: number | null;
  provision_kaeufer: string | null;
  provision_hinweis: string | null;
  courtage_frei: boolean;

  energieausweis_typ: string | null;
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

  texte_freigegeben_am: string | null;
  geaendert_am: string;
}

export interface OpenImmoAnbieter {
  firmenname: string;
  anbieternummer: string | null;
  openimmoAnid: string | null;
  email: string | null;
  telefon: string | null;
  ansprechpartner: string | null;
}

export interface Ausstattungsmerkmal {
  merkmal: string;
  wert: string | null;
}

/**
 * Ein Anhang im Übertragungspaket (OPENIMMO_MAPPING.md, Abschnitt 10).
 *
 * `dateiname` ist der Name **im Paket**, nicht der Speicherpfad. Portale lesen
 * die Datei relativ zum XML; ein Storage-Pfad wäre dort wertlos und würde
 * zudem die Mandanten-ID nach außen tragen.
 */
export interface OpenImmoAnhang {
  dateiname: string;
  gruppe: "TITELBILD" | "BILD" | "GRUNDRISS" | "KARTEN_LAGEPLAN" | "DOKUMENTE";
  titel: string | null;
  /** Kürzel wie `JPG` oder `PNG`, aus dem MIME-Typ abgeleitet. */
  format: string;
  /** Abschnitt 10 und 11: Der Vermerk wandert in den Anhangtitel. */
  kiBearbeitet: boolean;
}

/** Wie ein Objekt beim Portal ankommt: neu, geändert oder zurückgezogen. */
export type Uebertragungsmodus = "NEU" | "CHANGE" | "DELETE";

export interface Befund {
  feld: string;
  bezeichnung: string;
  hinweis: string;
  /** `fehler` blockiert den Export, `warnung` nicht. */
  schwere: "fehler" | "warnung";
}
