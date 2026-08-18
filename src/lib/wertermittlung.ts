/**
 * Wertermittlung nach den drei Verfahren der ImmoWertV.
 *
 * Der Master-Prompt ist hier ausdruecklich: keine Blackbox, keine automatisch
 * „ermittelten" Werte. Diese Datei rechnet deshalb nur — sie beschafft keine
 * Marktdaten, sie schaetzt nichts, und sie fuellt keine Annahme selbst aus.
 * Jeder Ansatz kommt vom Nutzer und wird von ihm verantwortet.
 *
 * Alle drei Verfahren liefern ihre Zwischenschritte mit zurueck. Das ist der
 * Unterschied zwischen einem Rechenblatt und einem Orakel: Wer das Ergebnis
 * nicht nachvollziehen kann, kann es auch nicht vertreten — und vertreten muss
 * es der Makler, nicht die Software.
 *
 * WICHTIG zur Einordnung: Das Ergebnis ist eine Marktpreiseinschaetzung. Es ist
 * keine gutachterliche Aussage und ersetzt kein Verkehrswertgutachten nach
 * § 194 BauGB. Dieser Hinweis gehoert an jede Ausgabe; `PFLICHTHINWEIS` haelt
 * ihn an einer Stelle fest.
 */

export const PFLICHTHINWEIS =
  "Diese Berechnung ist eine Marktpreiseinschätzung auf Grundlage der von Ihnen " +
  "gewählten Ansätze. Sie ist keine gutachterliche Aussage und ersetzt kein " +
  "Verkehrswertgutachten nach § 194 BauGB.";

export const VERFAHREN = {
  vergleichswert: "Vergleichswertverfahren",
  ertragswert: "Ertragswertverfahren",
  sachwert: "Sachwertverfahren",
} as const;

export type Verfahren = keyof typeof VERFAHREN;

/** Ein nachvollziehbarer Rechenschritt. */
export interface Schritt {
  bezeichnung: string;
  wert: number;
  /** Einheit fuer die Anzeige; ohne Angabe Euro. */
  einheit?: "eur" | "prozent" | "faktor" | "jahre" | "eur_qm";
  /** Kurze Begruendung, warum dieser Schritt so gerechnet wird. */
  erlaeuterung?: string;
}

export interface Ergebnis {
  wert: number | null;
  schritte: Schritt[];
  /** Was fehlt, damit gerechnet werden kann. */
  fehlend: string[];
}

/** Auf volle Euro. Zwischenschritte bleiben ungerundet. */
function euroRunden(wert: number): number {
  return Math.round(wert);
}

// --- Vergleichswertverfahren -----------------------------------------------

export interface Vergleichsobjekt {
  bezeichnung: string;
  kaufpreis: number | null;
  wohnflaeche: number | null;
  /** Zu- oder Abschlag in Prozent, etwa fuer Zustand oder Lage. */
  anpassung: number | null;
}

export interface VergleichsEingabe {
  wohnflaeche: number | null;
  objekte: readonly Vergleichsobjekt[];
}

/**
 * Vergleichswert aus Quadratmeterpreisen vergleichbarer Verkaeufe.
 *
 * Gerechnet wird der MEDIAN der angepassten Quadratmeterpreise, nicht das
 * arithmetische Mittel: Bei drei bis fuenf Vergleichsobjekten zieht ein
 * einzelner Ausreisser den Mittelwert so weit, dass das Ergebnis unbrauchbar
 * wird. Derselbe Grund wie bei der Vermarktungsdauer.
 *
 * Die Anpassung ist bewusst ein einziger Prozentwert je Objekt und keine
 * Merkmalstabelle. Eine Anwendung, die Zu- und Abschlaege fuer Lage, Zustand
 * und Ausstattung selbst vergibt, trifft genau die Entscheidungen, die der
 * Nutzer verantworten soll.
 */
export function vergleichswert(eingabe: VergleichsEingabe): Ergebnis {
  const fehlend: string[] = [];
  if (!eingabe.wohnflaeche || eingabe.wohnflaeche <= 0) {
    fehlend.push("Wohnfläche des zu bewertenden Objekts");
  }

  const preise: number[] = [];
  for (const objekt of eingabe.objekte) {
    if (!objekt.kaufpreis || !objekt.wohnflaeche || objekt.wohnflaeche <= 0) {
      continue;
    }
    const proQm = objekt.kaufpreis / objekt.wohnflaeche;
    preise.push(proQm * (1 + (objekt.anpassung ?? 0) / 100));
  }

  if (preise.length === 0) {
    fehlend.push("mindestens ein Vergleichsobjekt mit Preis und Fläche");
  }

  if (fehlend.length > 0) return { wert: null, schritte: [], fehlend };

  preise.sort((a, b) => a - b);
  const mitte = Math.floor(preise.length / 2);
  const median =
    preise.length % 2 === 0
      ? ((preise[mitte - 1] ?? 0) + (preise[mitte] ?? 0)) / 2
      : (preise[mitte] ?? 0);

  const wert = median * (eingabe.wohnflaeche ?? 0);

  return {
    wert: euroRunden(wert),
    fehlend: [],
    schritte: [
      {
        bezeichnung: "Verwertbare Vergleichsobjekte",
        wert: preise.length,
        einheit: "faktor",
        erlaeuterung:
          "Objekte ohne Preis oder ohne Fläche bleiben unberücksichtigt.",
      },
      {
        bezeichnung: "Angepasster Quadratmeterpreis (Median)",
        wert: Math.round(median),
        einheit: "eur_qm",
        erlaeuterung:
          "Median statt Mittelwert: Ein einzelner Ausreißer würde den Mittelwert bei wenigen Vergleichen unbrauchbar verziehen.",
      },
      {
        bezeichnung: "Wohnfläche",
        wert: eingabe.wohnflaeche ?? 0,
        einheit: "faktor",
      },
      { bezeichnung: "Vergleichswert", wert: euroRunden(wert) },
    ],
  };
}

// --- Ertragswertverfahren --------------------------------------------------

export interface ErtragsEingabe {
  /** Jaehrlicher Rohertrag: die nachhaltig erzielbare Nettokaltmiete. */
  jahresrohertrag: number | null;
  /** Bewirtschaftungskosten in Prozent des Rohertrags. */
  bewirtschaftungsquote: number | null;
  bodenwert: number | null;
  /** Liegenschaftszinssatz in Prozent, aus der Sammlung des Gutachterausschusses. */
  liegenschaftszins: number | null;
  /** Restnutzungsdauer des Gebäudes in Jahren. */
  restnutzungsdauer: number | null;
}

/**
 * Vervielfaeltiger nach § 20 ImmoWertV.
 *
 *   V = ((1 + p)^n − 1) / ((1 + p)^n × p)
 *
 * mit p als Liegenschaftszinssatz und n als Restnutzungsdauer. Bei p = 0 ist
 * die Formel nicht definiert (Division durch null); dann entspricht der
 * Vervielfaeltiger der Restnutzungsdauer, weil ohne Verzinsung schlicht n
 * Jahresertraege summiert werden.
 */
export function vervielfaeltiger(
  liegenschaftszinsProzent: number,
  restnutzungsdauer: number,
): number {
  const p = liegenschaftszinsProzent / 100;
  if (p <= 0) return restnutzungsdauer;
  const q = Math.pow(1 + p, restnutzungsdauer);
  return (q - 1) / (q * p);
}

export function ertragswert(eingabe: ErtragsEingabe): Ergebnis {
  const fehlend: string[] = [];
  if (!eingabe.jahresrohertrag || eingabe.jahresrohertrag <= 0) {
    fehlend.push("Jahresrohertrag");
  }
  if (eingabe.bewirtschaftungsquote === null) {
    fehlend.push("Bewirtschaftungskosten");
  }
  if (eingabe.bodenwert === null) fehlend.push("Bodenwert");
  if (!eingabe.liegenschaftszins) fehlend.push("Liegenschaftszinssatz");
  if (!eingabe.restnutzungsdauer || eingabe.restnutzungsdauer <= 0) {
    fehlend.push("Restnutzungsdauer");
  }

  if (fehlend.length > 0) return { wert: null, schritte: [], fehlend };

  const rohertrag = eingabe.jahresrohertrag ?? 0;
  const quote = eingabe.bewirtschaftungsquote ?? 0;
  const bodenwert = eingabe.bodenwert ?? 0;
  const zins = eingabe.liegenschaftszins ?? 0;
  const rnd = eingabe.restnutzungsdauer ?? 0;

  const bewirtschaftung = rohertrag * (quote / 100);
  const reinertrag = rohertrag - bewirtschaftung;
  const bodenverzinsung = bodenwert * (zins / 100);
  const gebaeudereinertrag = reinertrag - bodenverzinsung;
  const v = vervielfaeltiger(zins, rnd);
  const gebaeudeertragswert = gebaeudereinertrag * v;
  const wert = gebaeudeertragswert + bodenwert;

  return {
    wert: euroRunden(wert),
    fehlend: [],
    schritte: [
      { bezeichnung: "Jahresrohertrag", wert: euroRunden(rohertrag) },
      {
        bezeichnung: `Bewirtschaftungskosten (${quote} %)`,
        wert: -euroRunden(bewirtschaftung),
      },
      { bezeichnung: "Reinertrag", wert: euroRunden(reinertrag) },
      {
        bezeichnung: `Bodenwertverzinsung (${zins} % von ${euroRunden(bodenwert)} €)`,
        wert: -euroRunden(bodenverzinsung),
        erlaeuterung:
          "Der Boden verzinst sich unabhängig vom Gebäude; nur der Rest entfällt auf das Gebäude.",
      },
      {
        bezeichnung: "Gebäudereinertrag",
        wert: euroRunden(gebaeudereinertrag),
        // Nur setzen, wenn es etwas zu erklaeren gibt: Bei
        // `exactOptionalPropertyTypes` ist ein ausdrueckliches `undefined`
        // nicht dasselbe wie ein fehlendes Feld.
        ...(gebaeudereinertrag < 0
          ? {
              erlaeuterung:
                "Negativ: Der Ertrag deckt die Bodenwertverzinsung nicht. Das Gebäude trägt dann rechnerisch nichts bei.",
            }
          : {}),
      },
      {
        bezeichnung: `Vervielfältiger (${zins} %, ${rnd} Jahre)`,
        wert: Math.round(v * 100) / 100,
        einheit: "faktor",
        erlaeuterung: "Nach § 20 ImmoWertV aus Zinssatz und Restnutzungsdauer.",
      },
      {
        bezeichnung: "Gebäudeertragswert",
        wert: euroRunden(gebaeudeertragswert),
      },
      { bezeichnung: "Bodenwert", wert: euroRunden(bodenwert) },
      { bezeichnung: "Ertragswert", wert: euroRunden(wert) },
    ],
  };
}

// --- Sachwertverfahren -----------------------------------------------------

export interface SachwertEingabe {
  /** Bruttogrundfläche in Quadratmetern. */
  bruttogrundflaeche: number | null;
  /** Normalherstellungskosten je Quadratmeter BGF. */
  herstellungskostenProQm: number | null;
  /** Gesamtnutzungsdauer in Jahren, üblicherweise 70 bis 80 bei Wohngebäuden. */
  gesamtnutzungsdauer: number | null;
  alter: number | null;
  bodenwert: number | null;
  /** Außenanlagen und besondere Bauteile, pauschal. */
  aussenanlagen: number | null;
  /** Marktanpassung des Gutachterausschusses. */
  sachwertfaktor: number | null;
}

export function sachwert(eingabe: SachwertEingabe): Ergebnis {
  const fehlend: string[] = [];
  if (!eingabe.bruttogrundflaeche || eingabe.bruttogrundflaeche <= 0) {
    fehlend.push("Bruttogrundfläche");
  }
  if (!eingabe.herstellungskostenProQm) fehlend.push("Herstellungskosten je m²");
  if (!eingabe.gesamtnutzungsdauer || eingabe.gesamtnutzungsdauer <= 0) {
    fehlend.push("Gesamtnutzungsdauer");
  }
  if (eingabe.alter === null) fehlend.push("Alter des Gebäudes");
  if (eingabe.bodenwert === null) fehlend.push("Bodenwert");

  if (fehlend.length > 0) return { wert: null, schritte: [], fehlend };

  const bgf = eingabe.bruttogrundflaeche ?? 0;
  const nhk = eingabe.herstellungskostenProQm ?? 0;
  const gnd = eingabe.gesamtnutzungsdauer ?? 0;
  const alter = eingabe.alter ?? 0;
  const bodenwert = eingabe.bodenwert ?? 0;
  const aussen = eingabe.aussenanlagen ?? 0;
  const faktor = eingabe.sachwertfaktor ?? 1;

  const herstellungskosten = bgf * nhk;

  // Lineare Alterswertminderung. Bei einem Alter oberhalb der
  // Gesamtnutzungsdauer wird auf 100 Prozent begrenzt: Ein Gebaeude kann
  // hoechstens seinen ganzen Wert verlieren, nicht mehr. Ohne diese Grenze
  // entstuende bei einem 120 Jahre alten Haus mit 80 Jahren
  // Gesamtnutzungsdauer ein NEGATIVER Gebaeudewert.
  const minderungsanteil = Math.min(alter / gnd, 1);
  const alterswertminderung = herstellungskosten * minderungsanteil;
  const gebaeudesachwert = herstellungskosten - alterswertminderung;

  const vorlaeufig = gebaeudesachwert + aussen + bodenwert;
  const wert = vorlaeufig * faktor;

  return {
    wert: euroRunden(wert),
    fehlend: [],
    schritte: [
      {
        bezeichnung: `Herstellungskosten (${bgf} m² × ${nhk} €)`,
        wert: euroRunden(herstellungskosten),
      },
      {
        bezeichnung: `Alterswertminderung (${Math.round(minderungsanteil * 100)} %)`,
        wert: -euroRunden(alterswertminderung),
        erlaeuterung:
          alter > gnd
            ? "Auf 100 % begrenzt: Ein Gebäude kann höchstens seinen ganzen Wert verlieren. Bei erneuerten Bauteilen ist stattdessen die Restnutzungsdauer anzupassen."
            : "Linear über die Gesamtnutzungsdauer.",
      },
      { bezeichnung: "Gebäudesachwert", wert: euroRunden(gebaeudesachwert) },
      { bezeichnung: "Außenanlagen", wert: euroRunden(aussen) },
      { bezeichnung: "Bodenwert", wert: euroRunden(bodenwert) },
      { bezeichnung: "Vorläufiger Sachwert", wert: euroRunden(vorlaeufig) },
      {
        bezeichnung: `Sachwertfaktor ${faktor}`,
        wert: faktor,
        einheit: "faktor",
        erlaeuterung:
          "Marktanpassung. Ohne Faktor des Gutachterausschusses bleibt der Wert unangepasst (1,0).",
      },
      { bezeichnung: "Sachwert", wert: euroRunden(wert) },
    ],
  };
}

// --- Bodenwert -------------------------------------------------------------

/** Bodenwert aus Bodenrichtwert und Grundstücksfläche. */
export function bodenwert(
  richtwertProQm: number | null,
  flaeche: number | null,
): number | null {
  if (!richtwertProQm || !flaeche || flaeche <= 0) return null;
  return euroRunden(richtwertProQm * flaeche);
}

/**
 * Spanne aus mehreren Verfahren.
 *
 * Bewusst KEIN gewichteter Mittelwert ueber die Verfahren. Welches Verfahren
 * bei einem Objekt fuehrt, ist eine fachliche Entscheidung — bei einer
 * selbstgenutzten Wohnung der Vergleichswert, bei einem Zinshaus der
 * Ertragswert. Eine Software, die daraus stillschweigend einen Durchschnitt
 * bildet, trifft diese Entscheidung anstelle des Nutzers und verdeckt sie.
 */
export function spanne(
  werte: readonly (number | null)[],
): { von: number; bis: number } | null {
  const vorhanden = werte.filter((w): w is number => w !== null && w > 0);
  if (vorhanden.length === 0) return null;
  return {
    von: Math.min(...vorhanden),
    bis: Math.max(...vorhanden),
  };
}
