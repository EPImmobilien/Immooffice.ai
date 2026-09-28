/**
 * Bezeichnungen und Auswahllisten rund um Objekte.
 *
 * EINE Taxonomie fuer die gesamte Anwendung. Die Referenz fuehrte drei
 * widersprüchliche Listen nebeneinander — genau das soll hier nicht entstehen.
 * Die Werte entsprechen der Abbildung in OPENIMMO_MAPPING.md.
 */

export const VERMARKTUNGSARTEN = {
  kauf: "Kauf",
  miete: "Miete",
  kauf_miete: "Kauf oder Miete",
} as const;

export const OBJEKTKATEGORIEN = {
  wohnung: "Wohnung",
  haus: "Haus",
  grundstueck: "Grundstück",
  gewerbe: "Gewerbe",
  anlage: "Anlageimmobilie",
  sonstige: "Sonstige",
} as const;

export const NUTZUNGSARTEN = {
  wohnen: "Wohnen",
  gewerbe: "Gewerbe",
  anlage: "Anlage / Investment",
  gemischt: "Wohnen und Gewerbe",
} as const;

export const OBJEKTSTATUS = {
  akquise: "Akquise",
  vorbereitung: "In Vorbereitung",
  aktiv: "In Vermarktung",
  reserviert: "Reserviert",
  verkauft: "Verkauft",
  vermietet: "Vermietet",
  zurueckgezogen: "Zurückgezogen",
  archiviert: "Archiviert",
} as const;

/**
 * Statuswerte als Typ.
 *
 * Bis hierher stand `keyof typeof OBJEKTSTATUS` an mehreren Stellen wortwoertlich
 * im Code. Ein Name dafuer macht die Absicht sichtbar und erspart die
 * Wiederholung.
 */
export type Objektstatus = keyof typeof OBJEKTSTATUS;

export const ENERGIEAUSWEISTYPEN = {
  bedarf: "Bedarfsausweis",
  verbrauch: "Verbrauchsausweis",
  nicht_erforderlich: "Nicht erforderlich (Denkmal)",
  liegt_nicht_vor: "Liegt noch nicht vor",
} as const;

export const ENERGIEKLASSEN = [
  "A+", "A", "B", "C", "D", "E", "F", "G", "H",
] as const;

/** Objektarten je Kategorie — Feinklassifikation fuer den Portalexport. */
export const OBJEKTARTEN: Record<keyof typeof OBJEKTKATEGORIEN, string[]> = {
  wohnung: [
    "Etagenwohnung",
    "Erdgeschosswohnung",
    "Dachgeschosswohnung",
    "Maisonette",
    "Penthouse",
    "Souterrainwohnung",
    "Loft",
    "Apartment",
  ],
  haus: [
    "Einfamilienhaus",
    "Doppelhaushälfte",
    "Reihenhaus",
    "Reihenendhaus",
    "Mehrfamilienhaus",
    "Villa",
    "Bungalow",
    "Bauernhaus",
  ],
  grundstueck: ["Wohnbaugrundstück", "Gewerbegrundstück", "Land- und Forstwirtschaft"],
  gewerbe: [
    "Bürofläche",
    "Praxisfläche",
    "Ladenlokal",
    "Halle / Lager",
    "Produktionsfläche",
    "Gastronomie",
    "Hotel / Pension",
  ],
  anlage: ["Zinshaus", "Renditeobjekt", "Wohn- und Geschäftshaus"],
  sonstige: ["Ferienimmobilie", "Garage / Stellplatz", "Sonstiges"],
};

/** Farbton der Statusmarkierung. */
export function statusTon(
  status: Objektstatus,
): "neutral" | "info" | "warnung" | "erfolg" | "fehler" {
  switch (status) {
    case "aktiv":
      return "info";
    case "reserviert":
      return "warnung";
    case "verkauft":
    case "vermietet":
      return "erfolg";
    case "zurueckgezogen":
      return "fehler";
    default:
      return "neutral";
  }
}

/**
 * Ist die Vermarktungsart eine Mietvariante?
 * Steuert, welche Preisfelder angezeigt werden (Abschnitt 7: dynamische Felder).
 */
export function istMiete(vermarktungsart: string): boolean {
  return vermarktungsart === "miete" || vermarktungsart === "kauf_miete";
}

export function istKauf(vermarktungsart: string): boolean {
  return vermarktungsart === "kauf" || vermarktungsart === "kauf_miete";
}
