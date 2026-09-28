/**
 * Auswertungen über den eigenen Bestand.
 *
 * Reine Rechenfunktionen, absichtlich ohne Datenbankzugriff: Die Zahlen sind
 * das, wonach jemand seine Arbeit ausrichtet, und eine Rechnung, die nur im
 * Zusammenspiel mit einer Abfrage prüfbar wäre, wird nie geprüft.
 *
 * Zwei Grundsätze, die sich durch alle Funktionen ziehen:
 *
 *   Kein Ergebnis aus zu wenig Grundlage. Eine „durchschnittliche
 *   Vermarktungsdauer" aus einem einzigen Verkauf ist keine Kennzahl, sondern
 *   ein Einzelfall mit Nachkommastelle. Solche Werte liefern `null` — und die
 *   Oberfläche sagt dann, dass die Grundlage fehlt, statt eine Zahl zu zeigen.
 *
 *   Der Bezugstag kommt von aussen. Eine Funktion, die selbst `new Date()`
 *   aufruft, lässt sich nicht prüfen.
 */

import type { Objektstatus } from "./objekt-begriffe";

/** Ab wie vielen Fällen eine Durchschnittsangabe überhaupt etwas aussagt. */
export const MINDESTZAHL = 3;

export interface BestandZeile {
  status: Objektstatus;
  kaufpreis: number | null;
  kaltmiete: number | null;
  erstellt_am: string;
}

export interface Bestandsuebersicht {
  jeStatus: { status: Objektstatus; anzahl: number }[];
  gesamt: number;
  /** Summe der Kaufpreise aller aktiv vermarkteten Objekte. */
  volumenAktiv: number;
}

/**
 * Bestand nach Status.
 *
 * Das Volumen zählt bewusst nur `aktiv` und `reserviert`: Was noch in der
 * Akquise steckt, ist kein Bestand, und was verkauft ist, ist keiner mehr.
 * Eine Gesamtsumme über alle Status wäre eine Zahl, die niemand verwenden kann.
 */
export function bestandsuebersicht(
  objekte: readonly BestandZeile[],
): Bestandsuebersicht {
  const zaehler = new Map<Objektstatus, number>();
  let volumen = 0;

  for (const objekt of objekte) {
    zaehler.set(objekt.status, (zaehler.get(objekt.status) ?? 0) + 1);
    if (objekt.status === "aktiv" || objekt.status === "reserviert") {
      volumen += objekt.kaufpreis ?? 0;
    }
  }

  return {
    jeStatus: [...zaehler.entries()]
      .map(([status, anzahl]) => ({ status, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl),
    gesamt: objekte.length,
    volumenAktiv: volumen,
  };
}

export interface Statuswechsel {
  objekt_id: string;
  nachher: string;
  erstellt_am: string;
}

/**
 * Mittlere Vermarktungsdauer in Tagen, von „aktiv" bis „verkauft"/„vermietet".
 *
 * Grundlage ist der Verlauf, nicht ein Feld am Objekt: Ein Feld würde beim
 * zweiten Statuswechsel überschrieben, der Verlauf hält jeden Schritt fest.
 *
 * Gerechnet wird der Median, nicht das arithmetische Mittel. Ein einzelnes
 * Objekt, das zwei Jahre lag, verschiebt einen Mittelwert so stark, dass er
 * über den Normalfall nichts mehr aussagt — genau das, wofür die Zahl gedacht
 * ist.
 */
export function vermarktungsdauer(
  wechsel: readonly Statuswechsel[],
): { medianTage: number; faelle: number } | null {
  // Je Objekt der ERSTE Wechsel auf aktiv und der LETZTE auf verkauft: Ein
  // Objekt kann zurückgezogen und erneut angeboten worden sein.
  const start = new Map<string, number>();
  const ende = new Map<string, number>();

  for (const w of wechsel) {
    const zeit = new Date(w.erstellt_am).getTime();
    if (Number.isNaN(zeit)) continue;

    if (w.nachher === "aktiv") {
      const bisher = start.get(w.objekt_id);
      if (bisher === undefined || zeit < bisher) start.set(w.objekt_id, zeit);
    } else if (w.nachher === "verkauft" || w.nachher === "vermietet") {
      const bisher = ende.get(w.objekt_id);
      if (bisher === undefined || zeit > bisher) ende.set(w.objekt_id, zeit);
    }
  }

  const tage: number[] = [];
  for (const [objektId, beginn] of start) {
    const abschluss = ende.get(objektId);
    if (abschluss === undefined || abschluss <= beginn) continue;
    tage.push(Math.round((abschluss - beginn) / 86_400_000));
  }

  if (tage.length < MINDESTZAHL) return null;

  tage.sort((a, b) => a - b);
  const mitte = Math.floor(tage.length / 2);
  const median =
    tage.length % 2 === 0
      ? Math.round(((tage[mitte - 1] ?? 0) + (tage[mitte] ?? 0)) / 2)
      : (tage[mitte] ?? 0);

  return { medianTage: median, faelle: tage.length };
}

export interface Trichterstufe {
  bezeichnung: string;
  anzahl: number;
  /** Anteil an der vorherigen Stufe, `null` bei der ersten. */
  anteil: number | null;
}

/**
 * Akquisetrichter: von der Objektaufnahme bis zum Abschluss.
 *
 * Der Anteil bezieht sich auf die VORHERIGE Stufe, nicht auf die erste. „Von
 * den übernommenen Aufnahmen wurden 40 Prozent aktiv" ist die Frage, die man
 * stellt; „40 Prozent aller jemals aufgenommenen" beantwortet sie nicht.
 */
export function trichter(
  stufen: readonly { bezeichnung: string; anzahl: number }[],
): Trichterstufe[] {
  return stufen.map((stufe, i) => {
    const vorher = i === 0 ? null : stufen[i - 1]?.anzahl ?? 0;
    return {
      bezeichnung: stufe.bezeichnung,
      anzahl: stufe.anzahl,
      // Ohne Vorgänger und bei leerem Vorgänger gibt es keinen Anteil. Eine
      // Division durch null als „0 %" auszugeben wäre eine erfundene Aussage.
      anteil:
        vorher === null || vorher === 0
          ? null
          : Math.round((stufe.anzahl / vorher) * 100),
    };
  });
}

export interface Aufgabenlage {
  ueberfaellig: number;
  heute: number;
  dieseWoche: number;
  spaeter: number;
  ohneFrist: number;
}

/** Verteilt offene Aufgaben auf Fristlagen. */
export function aufgabenlage(
  aufgaben: readonly { faellig_am: string | null }[],
  heute: Date,
  einordnen: (frist: string | null, tag: Date) => string,
): Aufgabenlage {
  const lage: Aufgabenlage = {
    ueberfaellig: 0,
    heute: 0,
    dieseWoche: 0,
    spaeter: 0,
    ohneFrist: 0,
  };

  for (const aufgabe of aufgaben) {
    switch (einordnen(aufgabe.faellig_am, heute)) {
      case "ueberfaellig":
        lage.ueberfaellig += 1;
        break;
      case "heute":
        lage.heute += 1;
        break;
      case "diese_woche":
        lage.dieseWoche += 1;
        break;
      case "spaeter":
        lage.spaeter += 1;
        break;
      default:
        lage.ohneFrist += 1;
    }
  }

  return lage;
}

/**
 * Anteil in Prozent, ohne Division durch null.
 *
 * Liefert `null` statt 0, wenn es keine Grundgesamtheit gibt. „0 %" und „keine
 * Grundlage" sind verschiedene Aussagen, und nur eine davon ist hier wahr.
 */
export function anteil(teil: number, ganzes: number): number | null {
  if (ganzes <= 0) return null;
  return Math.round((teil / ganzes) * 100);
}
