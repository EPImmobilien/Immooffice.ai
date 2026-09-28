/**
 * Gemeinsame Typen aller Exposé-Vorlagen (Abschnitt 8).
 *
 * Bewusst eigenstaendig und nicht aus der Datenbank abgeleitet: Eine Vorlage
 * soll nur das kennen, was sie druckt. Dadurch laesst sie sich ohne Datenbank
 * testen, und ein neues Datenbankfeld zieht nicht automatisch eine Aenderung
 * an fuenf Vorlagen nach sich.
 */

export interface ExposeBranding {
  firmenname: string;
  /**
   * Logo als Rohdaten, nicht als Adresse.
   *
   * Die PDF-Erzeugung laedt keine Verweise nach; sie braucht die Bytes. Fehlt
   * das Logo, tritt die Wortmarke aus dem Firmennamen an seine Stelle — ein
   * Exposé ohne Kopf waere schlechter als eines mit gesetztem Namen.
   */
  logo: { daten: Buffer; format: "png" | "jpg" } | null;
  farbePrimaer: string;
  farbeAkzent: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  web: string | null;
  impressum: string | null;
}

export interface ExposeObjekt {
  objektnummer: string;
  bezeichnung: string;
  titel: string | null;
  objektkategorie: string;
  objektart: string | null;
  vermarktungsart: string;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  adresse_veroeffentlichen: boolean;
  wohnflaeche: number | null;
  nutzflaeche: number | null;
  grundstuecksflaeche: number | null;
  zimmer: number | null;
  baujahr: number | null;
  kaufpreis: number | null;
  kaltmiete: number | null;
  nebenkosten: number | null;
  hausgeld: number | null;
  provision_kaeufer: string | null;
  energieausweis_typ: string | null;
  energie_kennwert: number | null;
  energie_klasse: string | null;
  beschreibung_objekt: string | null;
  beschreibung_ausstattung: string | null;
  beschreibung_lage: string | null;
  texte_ki_erzeugt: boolean;
}

/**
 * Ein Bild, bereits geladen.
 *
 * Die Vorlage bekommt Bytes, keine Adresse: Ein Verweis auf den Storage waere
 * zum Zeitpunkt des Druckens womoeglich abgelaufen, und die Vorlage muesste
 * Netzwerkfehler behandeln. `format` ist auf die von der PDF-Erzeugung
 * unterstuetzten Formate beschraenkt.
 */
export interface ExposeBild {
  daten: Buffer;
  format: "jpg" | "png";
  titel: string | null;
  art: string;
  /** Kennzeichnung nach Abschnitt 11 — bleibt im Export erhalten. */
  kiBearbeitet: boolean;
}

export interface ExposeDaten {
  objekt: ExposeObjekt;
  branding: ExposeBranding;
  /** Erstes Element ist das Titelbild. Kann leer sein. */
  bilder: ExposeBild[];
}
