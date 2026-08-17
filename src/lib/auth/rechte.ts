/**
 * Berechtigungsmatrix (Master-Prompt Abschnitt 5, DATA_MODEL.md Abschnitt 2).
 *
 * Diese Datei ist die einzige Quelle der Rechtevergabe in der Anwendung. Sie
 * ergaenzt die Row-Level-Security in der Datenbank, ersetzt sie aber NICHT:
 * Die Datenbank bleibt die letzte Instanz. Ein Recht hier zu vergeben, das die
 * Policy nicht kennt, fuehrt zu einem Fehler — und nicht zu einem Datenleck.
 *
 * Ausgeblendete Schaltflaechen sind ausdruecklich KEIN Schutz (Abschnitt 5).
 */

export const ROLLEN = [
  "inhaber",
  "administrator",
  "makler",
  "assistenz",
  "marketing",
  "nur_lesen",
] as const;

export type Rolle = (typeof ROLLEN)[number];

export const ROLLEN_BEZEICHNUNG: Record<Rolle, string> = {
  inhaber: "Unternehmensinhaber",
  administrator: "Administrator",
  makler: "Makler",
  assistenz: "Assistenz",
  marketing: "Marketing",
  nur_lesen: "Nur-Lese-Zugriff",
};

export const MODULE = [
  "objekte",
  "kontakte",
  "exposes",
  "wertermittlung",
  "vertraege",
  "marketing",
  "kalender",
  "auswertungen",
  "einstellungen",
  "abrechnung",
] as const;

export type Modul = (typeof MODULE)[number];

export const AKTIONEN = [
  "lesen",
  "anlegen",
  "aendern",
  "loeschen",
  "freigeben",
] as const;

export type Aktion = (typeof AKTIONEN)[number];

type Rechte = Partial<Record<Modul, readonly Aktion[]>>;

const ALLE: readonly Aktion[] = AKTIONEN;
const LESEN: readonly Aktion[] = ["lesen"];
const BEARBEITEN: readonly Aktion[] = ["lesen", "anlegen", "aendern"];

/**
 * Vorbelegung je Rolle. Feinjustierung je Benutzer erfolgt ueber
 * `benutzer.rechte_uebersteuerung` — das gute Bedienkonzept der Referenz,
 * hier aber serverseitig durchgesetzt.
 */
const MATRIX: Record<Rolle, Rechte> = {
  inhaber: {
    objekte: ALLE,
    kontakte: ALLE,
    exposes: ALLE,
    wertermittlung: ALLE,
    vertraege: ALLE,
    marketing: ALLE,
    kalender: ALLE,
    auswertungen: ALLE,
    einstellungen: ALLE,
    abrechnung: ALLE,
  },
  administrator: {
    objekte: ALLE,
    kontakte: ALLE,
    exposes: ALLE,
    wertermittlung: ALLE,
    vertraege: ALLE,
    marketing: ALLE,
    kalender: ALLE,
    auswertungen: ALLE,
    einstellungen: ALLE,
    abrechnung: LESEN,
  },
  makler: {
    objekte: BEARBEITEN,
    kontakte: BEARBEITEN,
    exposes: ALLE,
    wertermittlung: ALLE,
    vertraege: ["lesen", "anlegen", "aendern", "freigeben"],
    marketing: BEARBEITEN,
    kalender: ALLE,
    auswertungen: LESEN,
  },
  assistenz: {
    objekte: BEARBEITEN,
    kontakte: BEARBEITEN,
    exposes: BEARBEITEN,
    wertermittlung: LESEN,
    vertraege: LESEN,
    marketing: BEARBEITEN,
    kalender: ALLE,
  },
  marketing: {
    objekte: LESEN,
    kontakte: LESEN,
    exposes: BEARBEITEN,
    marketing: ALLE,
    kalender: BEARBEITEN,
  },
  nur_lesen: {
    objekte: LESEN,
    kontakte: LESEN,
    exposes: LESEN,
    wertermittlung: LESEN,
    vertraege: LESEN,
    marketing: LESEN,
    kalender: LESEN,
    auswertungen: LESEN,
  },
};

export type Uebersteuerung = Partial<
  Record<Modul, Partial<Record<Aktion, boolean>>>
>;

/** Vorbelegung der Rolle, ohne Beruecksichtigung einer Uebersteuerung. */
export function rollenVorgabe(rolle: Rolle, modul: Modul, aktion: Aktion): boolean {
  return MATRIX[rolle][modul]?.includes(aktion) ?? false;
}

/** Schluessel eines Haekchens in der Rechteoberflaeche. */
export function rechtSchluessel(modul: Modul, aktion: Aktion): string {
  return `${modul}:${aktion}`;
}

/**
 * Leitet aus den angehakten Rechten die Abweichungen von der Rolle ab.
 *
 * Gespeichert wird bewusst nur die DIFFERENZ, nicht die volle Matrix: Wird die
 * Rollenvorbelegung spaeter geaendert, sollen die Benutzer davon profitieren,
 * bei denen niemand von Hand eingegriffen hat. Eine ausgeschriebene Kopie
 * wuerde jede Rolle nach dem ersten Speichern einfrieren.
 */
export function uebersteuerungAusAuswahl(
  rolle: Rolle,
  gewaehlt: Iterable<string>,
): Uebersteuerung {
  const gesetzt = new Set(gewaehlt);
  const ergebnis: Uebersteuerung = {};

  for (const modul of MODULE) {
    for (const aktion of AKTIONEN) {
      const soll = gesetzt.has(rechtSchluessel(modul, aktion));
      if (soll === rollenVorgabe(rolle, modul, aktion)) continue;

      (ergebnis[modul] ??= {})[aktion] = soll;
    }
  }

  return ergebnis;
}

/**
 * Liest eine Uebersteuerung aus der Datenbank und verwirft alles Unbekannte.
 *
 * Die Spalte ist ein `jsonb` — sie kann Module oder Aktionen enthalten, die es
 * inzwischen nicht mehr gibt, etwa nach einer Umbenennung. Ein unbekannter
 * Schluessel darf hier nicht durchrutschen: `hatRecht` wuerde ihn ignorieren,
 * die Oberflaeche zeigte aber ein Haekchen an, das nichts bewirkt.
 */
export function uebersteuerungLesen(wert: unknown): Uebersteuerung {
  if (typeof wert !== "object" || wert === null || Array.isArray(wert)) return {};

  const ergebnis: Uebersteuerung = {};

  for (const [modulName, aktionen] of Object.entries(wert)) {
    const modul = MODULE.find((m) => m === modulName);
    if (!modul) continue;
    if (typeof aktionen !== "object" || aktionen === null) continue;

    for (const [aktionName, erlaubt] of Object.entries(aktionen)) {
      const aktion = AKTIONEN.find((a) => a === aktionName);
      if (!aktion || typeof erlaubt !== "boolean") continue;

      (ergebnis[modul] ??= {})[aktion] = erlaubt;
    }
  }

  return ergebnis;
}

/**
 * Wer geprueft wird: Rolle plus die Abweichungen dieses einen Benutzers.
 *
 * Absichtlich ein Objekt und nicht die Rolle allein. Die Uebersteuerung als
 * optionalen vierten Parameter zu fuehren hat sich als Fehlkonstruktion
 * erwiesen: Sie wurde an keiner einzigen Aufrufstelle uebergeben, und das fiel
 * nicht auf, weil ohne sie einfach die Rollenvorbelegung galt. Ein vergessenes
 * Argument darf hier nicht zu stillschweigend anderen Rechten fuehren — jetzt
 * meldet es der Compiler.
 */
export interface RechteTraeger {
  rolle: Rolle;
  uebersteuerung?: Uebersteuerung | undefined;
}

/** Darf dieser Benutzer die Aktion im Modul ausfuehren? */
export function hatRecht(
  wer: RechteTraeger,
  modul: Modul,
  aktion: Aktion,
): boolean {
  const abweichung = wer.uebersteuerung?.[modul]?.[aktion];
  if (typeof abweichung === "boolean") return abweichung;

  return rollenVorgabe(wer.rolle, modul, aktion);
}

/** Sichtbare Module fuer die Navigation. */
export function sichtbareModule(wer: RechteTraeger): Modul[] {
  return MODULE.filter((modul) => hatRecht(wer, modul, "lesen"));
}

/**
 * Wirft, wenn das Recht fehlt. Fuer den Einsatz in Server Actions.
 *
 * Bewusst eine Ausnahme statt eines Rueckgabewerts: Ein vergessenes `if` waere
 * sonst eine stille Rechteausweitung.
 */
export function rechtErzwingen(
  wer: RechteTraeger,
  modul: Modul,
  aktion: Aktion,
): void {
  if (!hatRecht(wer, modul, aktion)) {
    throw new Error(
      `Fehlende Berechtigung: ${aktion} in ${modul} ist der Rolle ${wer.rolle} nicht erlaubt.`,
    );
  }
}
