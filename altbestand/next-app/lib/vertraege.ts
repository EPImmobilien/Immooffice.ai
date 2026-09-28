/**
 * Vertraege und die eigene einfache Signatur.
 *
 * Drei Vorgaben aus dem Master-Prompt bestimmen diese Datei, und alle drei sind
 * rechtlicher Natur:
 *
 *   1. Ein Vertragsmuster wird NIE als rechtssicher bezeichnet. Der Hinweis auf
 *      notwendige anwaltliche Pruefung ist Pflicht, und eine rechtliche
 *      Freigabe wird nicht erfunden.
 *
 *   2. Die eigene Signatur ist eine EINFACHE elektronische Signatur nach
 *      Artikel 3 Nummer 10 eIDAS. Sie wird nirgends als fortgeschrittene oder
 *      qualifizierte Signatur dargestellt. Der Unterschied ist keine
 *      Wortklauberei: Nur die qualifizierte Signatur ersetzt die eigenhaendige
 *      Unterschrift, wo das Gesetz Schriftform verlangt.
 *
 *   3. § 656a BGB verlangt fuer Maklervertraege ueber Wohnungen und
 *      Einfamilienhaeuser mit Verbrauchern die TEXTFORM. Textform ist
 *      elektronisch erfuellbar — dafuer genuegt die einfache Signatur. Genau
 *      deshalb ist sie hier brauchbar, und genau deshalb darf sie trotzdem
 *      nicht mehr versprechen, als sie ist.
 */

export const VERTRAGSARTEN = {
  maklervertrag: "Maklervertrag",
  reservierungsvereinbarung: "Reservierungsvereinbarung",
  besichtigungsprotokoll: "Besichtigungsprotokoll",
  uebergabeprotokoll: "Übergabeprotokoll",
  widerrufsbelehrung: "Widerrufsbelehrung",
  sonstiges: "Sonstiges",
} as const;

export type Vertragsart = keyof typeof VERTRAGSARTEN;

export const VERTRAGSSTATUS = {
  entwurf: "Entwurf",
  versendet: "Zur Unterschrift versendet",
  unterzeichnet: "Unterzeichnet",
  widerrufen: "Widerrufen",
  abgelehnt: "Abgelehnt",
} as const;

export type Vertragsstatus = keyof typeof VERTRAGSSTATUS;

/**
 * Was diese Signatur ist — und was sie nicht ist.
 *
 * Steht an einer einzigen Stelle, damit die Aussage nirgends abweicht. Ein
 * Text, der an drei Stellen unterschiedlich formuliert ist, wird an einer davon
 * irgendwann zu grosszuegig.
 */
export const SIGNATUR_EINORDNUNG =
  "Einfache elektronische Signatur im Sinne von Artikel 3 Nummer 10 eIDAS. " +
  "Sie ist keine fortgeschrittene und keine qualifizierte elektronische " +
  "Signatur und ersetzt die eigenhändige Unterschrift dort nicht, wo das " +
  "Gesetz Schriftform verlangt.";

export const MUSTER_HINWEIS =
  "Dieser Text ist ein Muster und keine Rechtsberatung. Ob er für Ihren Fall " +
  "vollständig und wirksam ist, kann ImmoOffice.ai nicht beurteilen — bitte " +
  "lassen Sie ihn anwaltlich prüfen, bevor Sie ihn verwenden.";

/**
 * Genuegt die Textform fuer diese Vertragsart?
 *
 * Textform (§ 126b BGB) ist elektronisch erfuellbar; Schriftform (§ 126 BGB)
 * verlangt eigenhaendige Unterschrift oder qualifizierte Signatur. Nur bei
 * Textform ist die einfache Signatur dieser Anwendung ausreichend.
 *
 * Der Maklervertrag ueber eine Wohnung oder ein Einfamilienhaus mit einem
 * Verbraucher bedarf nach § 656a BGB der Textform — ausdruecklich NICHT der
 * Schriftform. Das ist der Grund, warum eine einfache Signatur hier traegt.
 */
/**
 * Arten, fuer die das Gesetz SCHRIFTFORM verlangt.
 *
 * Derzeit leer, und das ist keine Nachlaessigkeit: Alle hier gefuehrten Arten
 * sind textformtauglich. Die Liste steht trotzdem da, weil sie der Ort ist, an
 * dem eine kuenftige Art eingetragen wird — eine Buergschaftserklaerung etwa
 * (§ 766 BGB) oder eine Kuendigung von Wohnraum (§ 568 BGB). Ohne diesen Ort
 * wuerde die Anwendung dort stillschweigend eine unwirksame Unterschrift
 * einsammeln.
 */
export const SCHRIFTFORM_ERFORDERLICH: readonly Vertragsart[] = [];

export function textformGenuegt(art: Vertragsart): boolean {
  return !SCHRIFTFORM_ERFORDERLICH.includes(art);
}

export interface Unterzeichnung {
  name: string;
  email: string;
  unterzeichnet_am: string;
  /** Fingerabdruck des Dokuments zum Zeitpunkt der Unterschrift. */
  dokument_hash: string;
}

/**
 * Widerrufsfrist nach §§ 355, 356 BGB.
 *
 * Bei einem Maklervertrag mit einem Verbraucher, der ausserhalb von
 * Geschaeftsraeumen oder im Fernabsatz geschlossen wurde, betraegt die Frist
 * vierzehn Tage. Sie beginnt aber erst mit ordnungsgemaesser Belehrung.
 *
 * Fehlt die Belehrung, erlischt das Widerrufsrecht nach § 356 Absatz 3 Satz 2
 * BGB erst zwoelf Monate und vierzehn Tage nach Vertragsschluss. Diese
 * Unterscheidung ist der eigentliche Zweck der Funktion: Eine Anwendung, die
 * pauschal vierzehn Tage anzeigt, wuerde einen Makler in Sicherheit wiegen, der
 * seine Provision noch ein Jahr lang verlieren kann.
 *
 * `null` heisst: kein Widerrufsrecht — etwa gegenueber einem Unternehmer.
 */
export function widerrufsfrist(
  geschlossenAm: string,
  verbraucher: boolean,
  belehrtAm: string | null,
): { endet: Date; regulaer: boolean } | null {
  if (!verbraucher) return null;

  const schluss = new Date(geschlossenAm);
  if (Number.isNaN(schluss.getTime())) return null;

  if (belehrtAm) {
    const belehrung = new Date(belehrtAm);
    if (!Number.isNaN(belehrung.getTime())) {
      // Die Frist laeuft ab Belehrung, fruehestens ab Vertragsschluss.
      const start = belehrung > schluss ? belehrung : schluss;
      return {
        endet: new Date(start.getTime() + 14 * 86_400_000),
        regulaer: true,
      };
    }
  }

  // Ohne Belehrung: zwoelf Monate plus vierzehn Tage ab Vertragsschluss.
  const erloschen = new Date(schluss);
  erloschen.setFullYear(erloschen.getFullYear() + 1);
  return {
    endet: new Date(erloschen.getTime() + 14 * 86_400_000),
    regulaer: false,
  };
}

/** Laeuft die Widerrufsfrist am Stichtag noch? */
export function widerrufMoeglich(
  frist: { endet: Date } | null,
  stichtag: Date,
): boolean {
  if (!frist) return false;
  return stichtag <= frist.endet;
}

/**
 * Fingerabdruck des Vertragstextes.
 *
 * Wird bei der Unterschrift festgehalten. Aendert sich der Text danach, passt
 * der Fingerabdruck nicht mehr — und die Anwendung kann das anzeigen, statt
 * eine Unterschrift unter einen anderen Text zu stellen, als der Unterzeichner
 * gesehen hat.
 *
 * Das ist kein Manipulationsschutz im kryptografischen Sinn: Wer die Datenbank
 * beherrscht, kann Text und Fingerabdruck gemeinsam austauschen. Es ist ein
 * Nachweis gegen VERSEHENTLICHE Aenderung, und als solcher wird er auch
 * bezeichnet.
 */
export async function dokumentHash(text: string): Promise<string> {
  const daten = new TextEncoder().encode(text.trim());
  const puffer = await crypto.subtle.digest("SHA-256", daten);
  return Array.from(new Uint8Array(puffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stimmt der Text noch mit dem ueberein, was unterzeichnet wurde?
 *
 * Ohne Unterzeichnung gibt es nichts zu vergleichen; dann ist die Frage nicht
 * „unveraendert", sondern „noch nicht unterschrieben".
 */
export async function textUnveraendert(
  text: string,
  unterzeichnungen: readonly Unterzeichnung[],
): Promise<boolean | null> {
  const erste = unterzeichnungen[0];
  if (!erste) return null;
  return (await dokumentHash(text)) === erste.dokument_hash;
}
