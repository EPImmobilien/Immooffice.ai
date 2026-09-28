/**
 * Begriffe rund um die Objektaufnahme — den Vor-Ort-Termin beim Eigentuemer.
 *
 * Die Aufnahme ist bewusst ein eigener Datensatz und kein halbfertiges Objekt.
 * Ein Objekt im Bestand, das eigentlich nur ein Besichtigungstermin war,
 * verfaelscht jede Auswertung und taucht in Listen auf, in die es nicht
 * gehoert. Erst wenn der Auftrag zustande kommt, wird die Aufnahme uebernommen.
 */

export const ZUSTANDSNOTEN = {
  gut: "Gut",
  mittel: "Mittel",
  schlecht: "Schlecht",
  unbekannt: "Unbekannt",
} as const;

export type Zustandsnote = keyof typeof ZUSTANDSNOTEN;

export const AUFNAHMESTATUS = {
  offen: "Offen",
  uebernommen: "Übernommen",
  verworfen: "Verworfen",
} as const;

export type Aufnahmestatus = keyof typeof AUFNAHMESTATUS;

/**
 * Die Bauteile, deren Zustand vor Ort beurteilt wird.
 *
 * Genau diese sechs, weil sie ohne Gutachter beurteilbar sind und weil sie die
 * Fragen sind, die ein Kaeufer stellt. Die Reihenfolge folgt dem Weg durch das
 * Haus: von aussen nach innen.
 */
export const ZUSTANDSFELDER = [
  { feld: "zustand_dach", bezeichnung: "Dach" },
  { feld: "zustand_fassade", bezeichnung: "Fassade" },
  { feld: "zustand_fenster", bezeichnung: "Fenster" },
  { feld: "zustand_heizung", bezeichnung: "Heizung" },
  { feld: "zustand_baeder", bezeichnung: "Bäder" },
  { feld: "zustand_elektrik", bezeichnung: "Elektrik" },
] as const;

export type Zustandsfeld = (typeof ZUSTANDSFELDER)[number]["feld"];

export interface Objektaufnahme {
  id: string;
  aufgenommen_am: string;
  kontakt_id: string | null;
  bezeichnung: string;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  objektkategorie: string | null;
  vermarktungsart: string | null;
  wohnflaeche: number | null;
  grundstuecksflaeche: number | null;
  zimmer: number | null;
  baujahr: number | null;
  etage: number | null;
  zustand_dach: Zustandsnote;
  zustand_fassade: Zustandsnote;
  zustand_fenster: Zustandsnote;
  zustand_heizung: Zustandsnote;
  zustand_baeder: Zustandsnote;
  zustand_elektrik: Zustandsnote;
  heizungsart: string | null;
  heizung_baujahr: number | null;
  preisvorstellung: number | null;
  unterlagen_offen: string[];
  notizen: string | null;
  status: Aufnahmestatus;
  objekt_id: string | null;
}

/**
 * Farbton einer Zustandsnote.
 *
 * „Unbekannt" bleibt neutral und wird nicht als Warnung dargestellt: Nicht
 * beurteilt zu haben ist kein Mangel, sondern eine offene Frage.
 */
export function notenTon(
  note: Zustandsnote,
): "erfolg" | "warnung" | "fehler" | "neutral" {
  switch (note) {
    case "gut":
      return "erfolg";
    case "mittel":
      return "warnung";
    case "schlecht":
      return "fehler";
    default:
      return "neutral";
  }
}

/**
 * Wie vollstaendig ist die Aufnahme?
 *
 * Nur als Anhaltspunkt gedacht, nicht als Pflichtpruefung: Eine Aufnahme darf
 * unvollstaendig bleiben. Auf einem Grundstueck gibt es keine Baeder, und beim
 * ersten Termin ist manches noch nicht bekannt.
 */
export function vollstaendigkeit(aufnahme: {
  wohnflaeche: number | null;
  zimmer: number | null;
  baujahr: number | null;
  objektkategorie: string | null;
  kontakt_id: string | null;
}): number {
  const felder = [
    aufnahme.wohnflaeche,
    aufnahme.zimmer,
    aufnahme.baujahr,
    aufnahme.objektkategorie,
    aufnahme.kontakt_id,
  ];
  const gefuellt = felder.filter(
    (w) => w !== null && w !== undefined && w !== "",
  ).length;
  return Math.round((gefuellt / felder.length) * 100);
}
