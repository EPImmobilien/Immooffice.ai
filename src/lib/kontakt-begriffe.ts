/**
 * Bezeichnungen rund um Kontakte.
 *
 * Bewusst getrennt von den Server Actions: Eine Datei mit "use server" darf
 * ausschliesslich asynchrone Funktionen exportieren — ein Konstantenexport
 * dort laesst den Build fehlschlagen.
 */
export const KONTAKTROLLEN = {
  eigentuemer: "Eigentümer",
  interessent: "Interessent",
  kaeufer: "Käufer",
  mieter: "Mieter",
  dienstleister: "Dienstleister",
  notar: "Notar",
  sonstige: "Sonstige",
} as const;

export type Kontaktrolle = keyof typeof KONTAKTROLLEN;
