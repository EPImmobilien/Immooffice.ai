/**
 * Vertrag des KI-Provider-Layers (Master-Prompt Abschnitte 4, 8 und 10).
 *
 * Aufrufer kennen keinen Anbieter. Ein Wechsel zu einem EU-gehosteten Dienst
 * ist damit eine Konfigurations-, keine Architekturaenderung.
 */

export const TEXTSTILE = {
  sachlich: "Sachlich",
  emotional: "Emotional",
  hochwertig: "Hochwertig",
  familienorientiert: "Familienorientiert",
  kapitalanlage: "Kapitalanlage",
  luxus: "Luxusimmobilie",
} as const;

export type Textstil = keyof typeof TEXTSTILE;

export const TEXTARTEN = {
  titel: "Titelvorschläge",
  kurzbeschreibung: "Kurzbeschreibung",
  objektbeschreibung: "Objektbeschreibung",
  ausstattung: "Ausstattungsbeschreibung",
  lage: "Lagebeschreibung",
  zielgruppe: "Zielgruppenansprache",
} as const;

export type Textart = keyof typeof TEXTARTEN;

/** Objektdaten, die an die Texterzeugung uebergeben werden. */
export interface ObjektKontext {
  objektkategorie: string;
  objektart: string | null;
  vermarktungsart: string;
  nutzungsart: string;
  ort: string | null;
  ortsteil: string | null;
  wohnflaeche: number | null;
  nutzflaeche: number | null;
  grundstuecksflaeche: number | null;
  zimmer: number | null;
  baujahr: number | null;
  kaufpreis: number | null;
  kaltmiete: number | null;
  energie_klasse: string | null;
  energie_kennwert: number | null;
  stichpunkte: string | null;
}

/**
 * Eine Angabe, die fuer den gewuenschten Text fehlt.
 *
 * Abschnitt 8 verbietet ausdruecklich, fehlende Objektdaten zu erfinden.
 * Statt eine Luecke zu fuellen, meldet der Layer sie zurueck; die Oberflaeche
 * macht sie sichtbar und laesst sie bestaetigen.
 */
export interface Luecke {
  feld: string;
  bezeichnung: string;
  hinweis: string;
}

export interface TextErgebnis {
  texte: Partial<Record<Textart, string>>;
  /** Nicht belegte Angaben — vor Veroeffentlichung zu pruefen. */
  luecken: Luecke[];
  /** Wurde tatsaechlich ein KI-Modell verwendet? Steuert die Kennzeichnung. */
  kiVerwendet: boolean;
  /** Bezeichnung der Quelle fuer die Anzeige. */
  quelle: string;
  /** Verbrauchte Credits — 0, wenn keine KI beteiligt war. */
  credits: number;
  /** Kosten in Cent fuer die Deckungsbeitragsrechnung (Abschnitt 15). */
  kostenCent: number;
}

export interface TextAuftrag {
  objekt: ObjektKontext;
  stil: Textstil;
  arten: Textart[];
}

export interface TextAnbieter {
  readonly name: string;
  readonly istKi: boolean;
  texteErzeugen(auftrag: TextAuftrag): Promise<TextErgebnis>;
}
