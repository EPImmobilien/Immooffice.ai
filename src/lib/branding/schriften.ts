/**
 * Kuratierte Schriftenliste fuer das Erscheinungsbild (docs/AUTONOMIE.md B2).
 *
 * Je Mandant eine serifenlose und eine Serifenschrift. Alle unter der SIL Open
 * Font License, alle als npm-Paket mitgeliefert und von der eigenen Domain
 * ausgeliefert — kein Aufruf fremder Schriftdienste (E-2026-09-03-09).
 *
 * Die Schluessel sind in der Datenbank per Check-Constraint festgeschrieben
 * (`mandant_branding.schrift_serifenlos`, `schrift_serifen`). Wer hier eine
 * Schrift ergaenzt, ergaenzt sie auch dort und im Paket `package.json`.
 */

export type Schriftkategorie = "serifenlos" | "serifen";

export interface Schrift {
  /** Schluessel wie in der Datenbank */
  schluessel: string;
  name: string;
  kategorie: Schriftkategorie;
  /** CSS-Familienname samt Rueckfallkette */
  familie: string;
  /** npm-Paket, dessen Stylesheet die @font-face-Regeln liefert */
  paket: string;
  /** Kurze Einordnung fuer die Auswahl */
  charakter: string;
}

export const SCHRIFTEN: readonly Schrift[] = [
  {
    schluessel: "inter",
    name: "Inter",
    kategorie: "serifenlos",
    familie: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    paket: "@fontsource/inter",
    charakter: "Neutral und sehr gut lesbar — die Voreinstellung.",
  },
  {
    schluessel: "montserrat",
    name: "Montserrat",
    kategorie: "serifenlos",
    familie: '"Montserrat", system-ui, sans-serif',
    paket: "@fontsource/montserrat",
    charakter: "Geometrisch, praesent, gut fuer grosse Titel.",
  },
  {
    schluessel: "poppins",
    name: "Poppins",
    kategorie: "serifenlos",
    familie: '"Poppins", system-ui, sans-serif',
    paket: "@fontsource/poppins",
    charakter: "Rund und freundlich, wirkt modern.",
  },
  {
    schluessel: "work-sans",
    name: "Work Sans",
    kategorie: "serifenlos",
    familie: '"Work Sans", system-ui, sans-serif',
    paket: "@fontsource/work-sans",
    charakter: "Schlicht, etwas breiter laufend, ruhig im Fliesstext.",
  },
  {
    schluessel: "source-sans-3",
    name: "Source Sans 3",
    kategorie: "serifenlos",
    familie: '"Source Sans 3", system-ui, sans-serif',
    paket: "@fontsource/source-sans-3",
    charakter: "Klassisch-humanistisch, sehr platzsparend.",
  },
  {
    schluessel: "nunito-sans",
    name: "Nunito Sans",
    kategorie: "serifenlos",
    familie: '"Nunito Sans", system-ui, sans-serif',
    paket: "@fontsource/nunito-sans",
    charakter: "Weich und zugaenglich.",
  },
  {
    schluessel: "marcellus",
    name: "Marcellus",
    kategorie: "serifen",
    familie: '"Marcellus", Georgia, serif',
    paket: "@fontsource/marcellus",
    charakter: "Kapitalen-Charakter, edel in Titeln; nur ein Schnitt.",
  },
  {
    schluessel: "cormorant-garamond",
    name: "Cormorant Garamond",
    kategorie: "serifen",
    familie: '"Cormorant Garamond", Georgia, serif',
    paket: "@fontsource/cormorant-garamond",
    charakter: "Fein und elegant, braucht grosse Groessen.",
  },
  {
    schluessel: "playfair-display",
    name: "Playfair Display",
    kategorie: "serifen",
    familie: '"Playfair Display", Georgia, serif',
    paket: "@fontsource/playfair-display",
    charakter: "Kontrastreich, wirkt hochwertig in Ueberschriften.",
  },
  {
    schluessel: "lora",
    name: "Lora",
    kategorie: "serifen",
    familie: '"Lora", Georgia, serif',
    paket: "@fontsource/lora",
    charakter: "Ausgewogen, auch im Fliesstext angenehm — die Voreinstellung.",
  },
  {
    schluessel: "eb-garamond",
    name: "EB Garamond",
    kategorie: "serifen",
    familie: '"EB Garamond", Georgia, serif',
    paket: "@fontsource/eb-garamond",
    charakter: "Klassische Buchschrift.",
  },
  {
    schluessel: "libre-baskerville",
    name: "Libre Baskerville",
    kategorie: "serifen",
    familie: '"Libre Baskerville", Georgia, serif',
    paket: "@fontsource/libre-baskerville",
    charakter: "Kraeftig und seriös, gut am Bildschirm.",
  },
] as const;

export const SCHRIFT_VORGABE_SERIFENLOS = "inter";
export const SCHRIFT_VORGABE_SERIFEN = "lora";

export function schriftenNachKategorie(kategorie: Schriftkategorie): Schrift[] {
  return SCHRIFTEN.filter((s) => s.kategorie === kategorie);
}

/**
 * Findet eine Schrift zum Schluessel. Unbekannte Schluessel fallen auf die
 * Voreinstellung der jeweiligen Kategorie zurueck — eine Datenbankzeile mit
 * altem Wert darf die Darstellung nicht sprengen.
 */
export function schrift(schluessel: string | null | undefined, kategorie: Schriftkategorie): Schrift {
  const treffer = SCHRIFTEN.find((s) => s.schluessel === schluessel && s.kategorie === kategorie);
  if (treffer) return treffer;
  const vorgabe = kategorie === "serifenlos" ? SCHRIFT_VORGABE_SERIFENLOS : SCHRIFT_VORGABE_SERIFEN;
  return SCHRIFTEN.find((s) => s.schluessel === vorgabe)!;
}

/** Wahr, wenn der Schluessel in der Kategorie erlaubt ist. */
export function istSchrift(schluessel: string, kategorie: Schriftkategorie): boolean {
  return SCHRIFTEN.some((s) => s.schluessel === schluessel && s.kategorie === kategorie);
}
