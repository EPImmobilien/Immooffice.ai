import type { Luecke, ObjektKontext, Textart } from "./typen";

/**
 * Ermittelt, welche Angaben fuer die gewuenschten Texte fehlen.
 *
 * Abschnitt 8: „Die KI darf keine fehlenden Objektdaten erfinden. Unsichere
 * oder fehlende Angaben sind sichtbar zu kennzeichnen und vor Veroeffentlichung
 * vom Nutzer zu bestaetigen.“
 *
 * Diese Pruefung laeuft VOR dem Modellaufruf. Damit steht die Luecke fest,
 * bevor ein Modell ueberhaupt in Versuchung kommt, sie zu fuellen — und sie
 * gilt unabhaengig davon, welcher Anbieter eingesetzt wird.
 */

interface Regel {
  feld: keyof ObjektKontext;
  bezeichnung: string;
  hinweis: string;
  /** Fuer welche Textarten die Angabe gebraucht wird. */
  arten: Textart[];
  /** Nur pruefen, wenn diese Bedingung zutrifft. */
  wenn?: (o: ObjektKontext) => boolean;
}

const REGELN: Regel[] = [
  {
    feld: "wohnflaeche",
    bezeichnung: "Wohnfläche",
    hinweis: "Ohne Wohnfläche bleibt die Objektbeschreibung unbestimmt.",
    arten: ["objektbeschreibung", "kurzbeschreibung", "titel"],
    wenn: (o) => o.objektkategorie !== "grundstueck",
  },
  {
    feld: "zimmer",
    bezeichnung: "Zimmeranzahl",
    hinweis: "Die Zimmerzahl ist für Titel und Kurzbeschreibung zentral.",
    arten: ["objektbeschreibung", "kurzbeschreibung", "titel"],
    wenn: (o) => o.objektkategorie !== "grundstueck",
  },
  {
    feld: "baujahr",
    bezeichnung: "Baujahr",
    hinweis: "Ohne Baujahr sind Aussagen zum Zustand nicht belegbar.",
    arten: ["objektbeschreibung"],
    wenn: (o) => o.objektkategorie !== "grundstueck",
  },
  {
    feld: "ort",
    bezeichnung: "Ort",
    hinweis: "Ohne Ort ist keine belegbare Lagebeschreibung möglich.",
    arten: ["lage", "titel"],
  },
  {
    feld: "grundstuecksflaeche",
    bezeichnung: "Grundstücksfläche",
    hinweis: "Bei Grundstücken und Häusern die wichtigste Kenngröße.",
    arten: ["objektbeschreibung", "kurzbeschreibung"],
    wenn: (o) =>
      o.objektkategorie === "grundstueck" || o.objektkategorie === "haus",
  },
  {
    feld: "stichpunkte",
    bezeichnung: "Ausstattungsmerkmale",
    hinweis:
      "Ohne Angaben zur Ausstattung entstünde reine Vermutung. Bitte Stichpunkte ergänzen.",
    arten: ["ausstattung"],
  },
  {
    feld: "energie_klasse",
    bezeichnung: "Energieeffizienzklasse",
    hinweis: "Für Anzeigen nach GEG erforderlich.",
    arten: ["objektbeschreibung"],
    wenn: (o) => o.objektkategorie !== "grundstueck",
  },
];

export function lueckenErmitteln(
  objekt: ObjektKontext,
  arten: Textart[],
): Luecke[] {
  const gefragt = new Set(arten);

  return REGELN.filter((regel) => {
    if (!regel.arten.some((a) => gefragt.has(a))) return false;
    if (regel.wenn && !regel.wenn(objekt)) return false;

    const wert = objekt[regel.feld];
    return wert === null || wert === undefined || wert === "";
  }).map(({ feld, bezeichnung, hinweis }) => ({
    feld: String(feld),
    bezeichnung,
    hinweis,
  }));
}
