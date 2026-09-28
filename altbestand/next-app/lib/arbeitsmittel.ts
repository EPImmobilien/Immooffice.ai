/**
 * Begriffe rund um Aufgaben und Termine.
 *
 * Beide haengen wahlweise an einem Objekt und an einem Kontakt. „Wahlweise",
 * weil nicht jede Aufgabe einen Bezug hat — ein Rueckruf braucht kein Objekt —,
 * aber jede, die einen hat, dort auch auftauchen soll. Genau das unterscheidet
 * eine verkettete Anwendung von einer Sammlung von Listen.
 */

export const PRIORITAETEN = {
  hoch: "Hoch",
  mittel: "Mittel",
  niedrig: "Niedrig",
} as const;

export type Prioritaet = keyof typeof PRIORITAETEN;

export const TERMINARTEN = {
  besichtigung: "Besichtigung",
  beratung: "Beratung",
  objektaufnahme: "Objektaufnahme",
  notartermin: "Notartermin",
  uebergabe: "Übergabe",
  telefonat: "Telefonat",
  sonstiges: "Sonstiges",
} as const;

export type Terminart = keyof typeof TERMINARTEN;

export interface Aufgabe {
  id: string;
  titel: string;
  beschreibung: string | null;
  prioritaet: Prioritaet;
  faellig_am: string | null;
  erledigt_am: string | null;
  objekt_id: string | null;
  kontakt_id: string | null;
  objekt?: { objektnummer: string; bezeichnung: string } | null;
  kontakt?: { vorname: string | null; nachname: string } | null;
  zustaendig?: { name: string } | null;
}

export interface Termin {
  id: string;
  titel: string;
  art: Terminart;
  notiz: string | null;
  beginnt_am: string;
  endet_am: string;
  ort: string | null;
  abgesagt_am: string | null;
  objekt_id: string | null;
  kontakt_id: string | null;
  objekt?: { objektnummer: string; bezeichnung: string } | null;
  kontakt?: { vorname: string | null; nachname: string } | null;
  zustaendig?: { name: string } | null;
}

/**
 * Einordnung einer Frist gegenueber einem Bezugstag.
 *
 * Der Bezugstag wird uebergeben und nicht hier ermittelt: Eine Funktion, die
 * `new Date()` selbst aufruft, laesst sich nicht pruefen, und in einer
 * React-Darstellung waere sie zudem nicht deterministisch.
 */
export type Fristlage = "ueberfaellig" | "heute" | "diese_woche" | "spaeter" | "ohne";

export function fristlage(faelligAm: string | null, heute: Date): Fristlage {
  if (!faelligAm) return "ohne";

  // Auf Tagesgrenzen rechnen. Mit Uhrzeiten waere eine Aufgabe, die heute um
  // 8 Uhr faellig war, um 9 Uhr bereits „ueberfaellig" — fuer eine Frist auf
  // Tagesbasis ist das falsch.
  const tag = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const frist = new Date(`${faelligAm}T00:00:00Z`);
  const fristTag = Date.UTC(
    frist.getUTCFullYear(),
    frist.getUTCMonth(),
    frist.getUTCDate(),
  );
  const heuteTag = tag(heute);
  const tage = Math.round((fristTag - heuteTag) / 86_400_000);

  if (tage < 0) return "ueberfaellig";
  if (tage === 0) return "heute";
  if (tage <= 7) return "diese_woche";
  return "spaeter";
}

export const FRISTLAGE_BEZEICHNUNG: Record<Fristlage, string> = {
  ueberfaellig: "Überfällig",
  heute: "Heute",
  diese_woche: "Diese Woche",
  spaeter: "Später",
  ohne: "Ohne Frist",
};

/**
 * Sortierung offener Aufgaben: dringend zuerst.
 *
 * Aufgaben ohne Frist landen am Ende. Sie nach vorn zu nehmen, waere die
 * bequemere Sortierung — und wuerde genau das verdecken, was heute ansteht.
 */
export function aufgabenSortieren<
  T extends { faellig_am: string | null; prioritaet: Prioritaet },
>(aufgaben: readonly T[]): T[] {
  const rang: Record<Prioritaet, number> = { hoch: 0, mittel: 1, niedrig: 2 };
  return [...aufgaben].sort((a, b) => {
    if (a.faellig_am !== b.faellig_am) {
      if (!a.faellig_am) return 1;
      if (!b.faellig_am) return -1;
      return a.faellig_am < b.faellig_am ? -1 : 1;
    }
    return rang[a.prioritaet] - rang[b.prioritaet];
  });
}

/** Name eines Kontakts fuer die Anzeige in Listen. */
export function kontaktname(
  kontakt: { vorname: string | null; nachname: string } | null | undefined,
): string | null {
  if (!kontakt) return null;
  return [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ");
}
