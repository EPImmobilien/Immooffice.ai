/**
 * Schritte des Onboarding-Assistenten (docs/AUTONOMIE.md O1).
 *
 * Eigene Datei, weil Server-Aktionen („use server") nur asynchrone Funktionen
 * exportieren duerfen und die Schrittliste sowohl der Server als auch die
 * Oberflaeche braucht.
 */

export const SCHRITTE = [
  { nr: 1, titel: "Firmierung", pflicht: true, kurz: "Name und Rechtsform Ihres Unternehmens." },
  { nr: 2, titel: "Anschrift", pflicht: true, kurz: "Sitz, Telefon und E-Mail — stehen auf jedem Dokument." },
  { nr: 3, titel: "Impressum", pflicht: true, kurz: "Handelsregister, USt-IdNr., Aufsichtsbehörde nach § 34c GewO." },
  { nr: 4, titel: "Logo", pflicht: false, kurz: "Helle Fassung; eine dunkle ist optional." },
  { nr: 5, titel: "Farben", pflicht: false, kurz: "Haupt- und Akzentfarbe, alles Weitere wird abgeleitet." },
  { nr: 6, titel: "Schrift", pflicht: false, kurz: "Je eine serifenlose und eine Serifenschrift." },
  { nr: 7, titel: "Signatur", pflicht: false, kurz: "Für E-Mails aus der Anwendung." },
  { nr: 8, titel: "Einladungen", pflicht: false, kurz: "Kolleginnen und Kollegen hereinholen." },
] as const;

export type SchrittNr = (typeof SCHRITTE)[number]["nr"];

export function istSchrittNr(wert: unknown): wert is SchrittNr {
  const n = Number(wert);
  return Number.isInteger(n) && n >= 1 && n <= 8;
}

export const LETZTER_SCHRITT: SchrittNr = 8;
