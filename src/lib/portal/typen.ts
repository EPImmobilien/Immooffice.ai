/**
 * Neubau-Projekte und Kundenbereich (docs/FUNKTIONSABGLEICH.md P1/P2).
 *
 * Feste Listen und Typen fuer Makler- und Kundenseite. Der Kundenbereich ist
 * laut Masterprompt ausgeschlossen und auf Weisung des Auftraggebers
 * (E-2026-09-03-36) als letztes Paket nachgebaut — er haengt an keiner
 * anderen Funktion und laesst sich als Ganzes streichen.
 */

export const PROJEKT_STATUS = {
  vorbereitung: "In Vorbereitung",
  aktiv: "Im Vertrieb",
  abgeschlossen: "Abgeschlossen",
  archiviert: "Archiviert",
} as const;
export type ProjektStatus = keyof typeof PROJEKT_STATUS;

export const EINHEIT_STATUS = {
  verfuegbar: "Verfügbar",
  reserviert: "Reserviert",
  verkauft: "Verkauft",
  vermietet: "Vermietet",
} as const;
export type EinheitStatus = keyof typeof EINHEIT_STATUS;

/** Statusfolge je Vermarktungsart — ein Klick schaltet weiter. */
export function naechsterEinheitStatus(status: EinheitStatus, vermarktungsart: "kauf" | "miete"): EinheitStatus {
  const zyklus: EinheitStatus[] = vermarktungsart === "miete" ? ["verfuegbar", "reserviert", "vermietet"] : ["verfuegbar", "reserviert", "verkauft"];
  const i = zyklus.indexOf(status);
  return zyklus[(i + 1) % zyklus.length] ?? "verfuegbar";
}

export const DATEI_KATEGORIEN = {
  expose: "Exposé",
  grundriss: "Grundriss",
  baubeschreibung: "Baubeschreibung",
  energieausweis: "Energieausweis",
  vertrag: "Vertragsunterlagen",
  baufortschritt: "Baufortschritt",
  sonstiges: "Sonstiges",
} as const;
export type DateiKategorie = keyof typeof DATEI_KATEGORIEN;

export const SICHTBARKEIT = {
  intern: "Nur intern",
  interessent: "Alle Kunden des Projekts",
  kaeufer: "Nur Käufer",
  oeffentlich: "Öffentliche Projektseite",
} as const;
export type Sichtbarkeit = keyof typeof SICHTBARKEIT;

export const KUNDEN_ART = {
  eigentuemer: "Eigentümer",
  kaeufer: "Käufer",
  interessent: "Interessent",
} as const;
export type KundenArt = keyof typeof KUNDEN_ART;

/** Sieben Stufen der Kaufabwicklung — der Kunde sieht Stufe und naechsten Schritt. */
export const FORTSCHRITT = [
  "Interessent",
  "Reserviert",
  "Finanzierung bestätigt",
  "Notartermin",
  "Beurkundet",
  "Im Bau",
  "Übergabe",
] as const;

export const ANFRAGE_ART = {
  reservierung: "Reservierung",
  information: "Informationen",
  besichtigung: "Besichtigung",
} as const;
export type AnfrageArt = keyof typeof ANFRAGE_ART;

export const ANFRAGE_STATUS = { offen: "Offen", bestaetigt: "Bestätigt", abgelehnt: "Abgelehnt" } as const;

export const AKTIVITAET_ART = {
  einladung: "Einladung",
  login: "Anmeldung",
  datei: "Datei angesehen",
  upload: "Unterlage hochgeladen",
  nachricht: "Nachricht",
  merkliste: "Merkliste",
  anfrage: "Anfrage",
  antrag: "Antrag",
  passwort: "Passwort",
} as const;

export const ANTRAG_STATUS = { in_arbeit: "In Arbeit", eingereicht: "Eingereicht", erledigt: "Erledigt" } as const;

/** Sichtbarkeitsstufen, die ein Kunde einer Art sehen darf (Spiegel von intern.portal_sichtbar). */
export function sichtbarFuer(art: KundenArt): Sichtbarkeit[] {
  return art === "kaeufer" ? ["oeffentlich", "interessent", "kaeufer"] : ["oeffentlich", "interessent"];
}

/** Slug aus dem Projektnamen: klein, Umlaute aufgeloest, Bindestriche. */
export function slugAus(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s.length >= 2 ? s : `projekt-${s}`.slice(0, 80);
}

/** Preis- oder Mietangabe einer Einheit als Text. */
export function einheitPreis(e: { kaufpreis?: number | null; miete?: number | null }, vermarktungsart: "kauf" | "miete", euro: (n: number) => string): string {
  if (vermarktungsart === "miete") return e.miete != null ? `${euro(e.miete)} / Monat` : "auf Anfrage";
  return e.kaufpreis != null ? euro(e.kaufpreis) : "auf Anfrage";
}

export interface PortalKunde {
  id: string;
  art: KundenArt;
  anzeigename: string;
  email: string;
  telefon: string | null;
  kontakt_id: string | null;
  aktiv: boolean;
  eingeladen_am: string;
  einladung_gueltig_bis: string;
  angenommen_am: string | null;
  letzter_login_am: string | null;
  ansprechpartner_id: string | null;
  projekt_id: string | null;
  einheit_id: string | null;
  fortschritt_stufe: number;
  fortschritt_notiz: string | null;
  quelle: string;
  passwort_hash: string | null;
}

export interface Einheit {
  id: string;
  we_nr: string;
  geschoss: string | null;
  geschoss_index: number;
  zimmer: number | null;
  wohnflaeche: number | null;
  ausrichtung: string | null;
  kaufpreis: number | null;
  miete: number | null;
  hausgeld: number | null;
  status: EinheitStatus;
  objekt_id: string | null;
  notiz: string | null;
  sortierung: number;
}

/** Zugangslink des Kunden — die Basis ist die eigene App-Adresse. */
export function kundenLink(basis: string, token: string): string {
  return `${basis.replace(/\/+$/, "")}/kunde/${token}`;
}
export function projektLink(basis: string, token: string): string {
  return `${basis.replace(/\/+$/, "")}/projekt/${token}`;
}
