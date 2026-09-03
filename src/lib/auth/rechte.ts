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
  "postfach",
  "akquise",
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
    akquise: ALLE,
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
    postfach: ALLE,
  },
  administrator: {
    akquise: ALLE,
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
    postfach: ALLE,
  },
  makler: {
    akquise: ["lesen", "anlegen", "aendern", "loeschen"],
    objekte: BEARBEITEN,
    kontakte: BEARBEITEN,
    exposes: ALLE,
    wertermittlung: ALLE,
    vertraege: ["lesen", "anlegen", "aendern", "freigeben"],
    marketing: BEARBEITEN,
    kalender: ALLE,
    auswertungen: LESEN,
    postfach: BEARBEITEN,
  },
  assistenz: {
    akquise: BEARBEITEN,
    objekte: BEARBEITEN,
    kontakte: BEARBEITEN,
    exposes: BEARBEITEN,
    wertermittlung: LESEN,
    vertraege: LESEN,
    marketing: BEARBEITEN,
    kalender: ALLE,
    postfach: BEARBEITEN,
  },
  marketing: {
    akquise: BEARBEITEN,
    objekte: LESEN,
    kontakte: LESEN,
    exposes: BEARBEITEN,
    marketing: ALLE,
    kalender: BEARBEITEN,
  },
  nur_lesen: {
    akquise: LESEN,
    objekte: LESEN,
    kontakte: LESEN,
    exposes: LESEN,
    wertermittlung: LESEN,
    vertraege: LESEN,
    marketing: LESEN,
    kalender: LESEN,
    auswertungen: LESEN,
    postfach: LESEN,
  },
};

export type Uebersteuerung = Partial<
  Record<Modul, Partial<Record<Aktion, boolean>>>
>;

/**
 * Darf diese Rolle die Aktion im Modul ausfuehren?
 *
 * `uebersteuerung` enthaelt nur Abweichungen von der Rollenvorbelegung.
 */
export function hatRecht(
  rolle: Rolle,
  modul: Modul,
  aktion: Aktion,
  uebersteuerung?: Uebersteuerung,
): boolean {
  const abweichung = uebersteuerung?.[modul]?.[aktion];
  if (typeof abweichung === "boolean") return abweichung;

  return MATRIX[rolle][modul]?.includes(aktion) ?? false;
}

/** Sichtbare Module fuer die Navigation. */
export function sichtbareModule(
  rolle: Rolle,
  uebersteuerung?: Uebersteuerung,
): Modul[] {
  return MODULE.filter((modul) => hatRecht(rolle, modul, "lesen", uebersteuerung));
}

/**
 * Wirft, wenn das Recht fehlt. Fuer den Einsatz in Server Actions.
 *
 * Bewusst eine Ausnahme statt eines Rueckgabewerts: Ein vergessenes `if` waere
 * sonst eine stille Rechteausweitung.
 */
export function rechtErzwingen(
  rolle: Rolle,
  modul: Modul,
  aktion: Aktion,
  uebersteuerung?: Uebersteuerung,
): void {
  if (!hatRecht(rolle, modul, aktion, uebersteuerung)) {
    throw new Error(
      `Fehlende Berechtigung: ${aktion} in ${modul} ist der Rolle ${rolle} nicht erlaubt.`,
    );
  }
}
