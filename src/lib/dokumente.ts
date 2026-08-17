/**
 * Begriffe und Hilfen rund um Objektunterlagen.
 *
 * Unterlagen sind heikler als Bilder. Ein Grundbuchauszug, eine Vollmacht oder
 * ein Maklervertrag enthaelt personenbezogene und wirtschaftliche Angaben, die
 * niemand ausserhalb des Unternehmens sehen darf. Deshalb gibt es hier zwei
 * Begriffe, die es bei Bildern nicht gibt: eine Sichtbarkeit je Unterlage und
 * eine Liste von Arten, die grundsaetzlich nicht herausgegeben werden.
 */

export const DOKUMENTARTEN = {
  grundriss: "Grundriss",
  energieausweis: "Energieausweis",
  grundbuchauszug: "Grundbuchauszug",
  flurkarte: "Flurkarte",
  teilungserklaerung: "Teilungserklärung",
  wohnflaechenberechnung: "Wohnflächenberechnung",
  baubeschreibung: "Baubeschreibung",
  protokoll: "Protokoll",
  nebenkostenabrechnung: "Nebenkostenabrechnung",
  mietvertrag: "Mietvertrag",
  kaufvertrag: "Kaufvertrag",
  maklervertrag: "Maklervertrag",
  reservierungsvereinbarung: "Reservierungsvereinbarung",
  vollmacht: "Vollmacht",
  expose: "Exposé",
  sonstiges: "Sonstiges",
} as const;

export type Dokumentart = keyof typeof DOKUMENTARTEN;

export const SICHTBARKEITEN = {
  intern: "Nur intern",
  kunde: "Darf an Interessenten",
} as const;

export type Dokumentsichtbarkeit = keyof typeof SICHTBARKEITEN;

/**
 * Arten, die eine Freigabe an Interessenten NIE erhalten duerfen.
 *
 * Das ist keine Vorsichtsmassnahme fuer den Regelfall, sondern eine Sperre
 * gegen den einen falschen Klick: Ein Grundbuchauszug im oeffentlichen
 * Web-Exposé ist ein Datenschutzvorfall, der sich nicht zurueckholen laesst,
 * weil die Datei in dem Moment heruntergeladen sein kann.
 *
 * Dieselbe Liste steht als Check-Constraint in der Datenbank. Die Regel gilt
 * damit auch fuer Wege, die diese Datei nie sehen.
 */
export const NUR_INTERN: readonly Dokumentart[] = [
  "grundbuchauszug",
  "vollmacht",
  "maklervertrag",
  "kaufvertrag",
  "mietvertrag",
  "reservierungsvereinbarung",
  "nebenkostenabrechnung",
];

export function darfAnKunden(art: Dokumentart): boolean {
  return !NUR_INTERN.includes(art);
}

export const DOKUMENT_BUCKET = "objektdokumente";

/** Zulaessige Dateitypen. Deckungsgleich mit den Vorgaben des Buckets. */
export const DOKUMENT_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/** 50 MB — dieselbe Grenze wie im Bucket, damit der Fehler frueh sichtbar wird. */
export const DOKUMENT_MAX_BYTES = 50 * 1024 * 1024;

export interface ObjektDokument {
  id: string;
  pfad: string;
  dateiname: string;
  art: Dokumentart;
  titel: string | null;
  notiz: string | null;
  sichtbarkeit: Dokumentsichtbarkeit;
  bytes: number | null;
  mime: string | null;
  gueltig_bis: string | null;
  erstellt_am: string;
}

/**
 * Baut den Speicherpfad.
 *
 * Das erste Segment ist immer die Mandanten-ID — darauf stuetzen sich die
 * Storage-Policies. Der Pfad wird serverseitig gebildet und nie aus einer
 * Formulareingabe uebernommen.
 */
export function dokumentPfad(
  mandantId: string,
  objektId: string,
  dateiname: string,
): string {
  const endung = dateiname.split(".").pop()?.toLowerCase() ?? "pdf";
  const sicher = /^[a-z0-9]{1,5}$/.test(endung) ? endung : "pdf";
  return `${mandantId}/${objektId}/${crypto.randomUUID()}.${sicher}`;
}

/**
 * Unterlagen, die ein vollstaendiges Angebot ueblicherweise braucht.
 *
 * Bewusst „empfohlen" und nicht „Pflicht": Was wirklich vorliegen muss, haengt
 * am Einzelfall — bei einer Eigentumswohnung die Teilungserklaerung, beim
 * Grundstueck nicht. Eine Anwendung, die hier „Pflicht" behauptet, macht eine
 * rechtliche Aussage, die sie nicht treffen kann.
 */
export const EMPFOHLEN: readonly Dokumentart[] = [
  "grundriss",
  "energieausweis",
  "flurkarte",
  "wohnflaechenberechnung",
];

export function fehlendeUnterlagen(
  vorhanden: readonly { art: Dokumentart }[],
): Dokumentart[] {
  const arten = new Set(vorhanden.map((d) => d.art));
  return EMPFOHLEN.filter((art) => !arten.has(art));
}

/** Lesbare Groesse. `null` wird zu einem Gedankenstrich, nicht zu „0 B". */
export function dateigroesse(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Ist die Unterlage abgelaufen?
 *
 * Vor allem fuer den Energieausweis: Er ist zehn Jahre gueltig, und ein
 * abgelaufener im Exposé ist ein Ordnungswidrigkeitsrisiko nach dem
 * Gebaeudeenergiegesetz.
 */
export function abgelaufen(gueltigBis: string | null, heute: Date): boolean {
  if (!gueltigBis) return false;
  return new Date(gueltigBis) < heute;
}
