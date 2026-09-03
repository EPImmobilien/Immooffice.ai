import { createHash } from "node:crypto";

/**
 * Waechter (Funktionsprompt, Grundprinzip 4): bewertet den Befund der
 * Hintergrundketten und entscheidet, ob eine Mail faellig ist —
 * gleiche Befundlage hoechstens einmal je 24 Stunden (Hash), neue Lage sofort,
 * Entwarnung bei Gruen. Reine Logik ohne Datenbank, deshalb pruefbar.
 */

export type Befund = Record<string, number>;

export const BEFUND_BEZEICHNUNG: Record<string, string> = {
  auftraege_fehler_24h: "Gescheiterte Aufträge (24 h)",
  auftraege_haengend: "Hängende Aufträge (Sperre abgelaufen)",
  auftraege_offen_alt: "Offene Aufträge älter als 15 Minuten",
  integrationen_fehler: "Integrationen im Fehlerzustand",
  postfaecher_fehler: "Postfächer im Fehlerzustand",
  stripe_ereignisse_fehler: "Stripe-Ereignisse mit Fehler",
  mandanten_lesemodus: "Mandanten im Lesemodus (Hinweis)",
  abos_zahlung_offen: "Abos mit offener Zahlung (Hinweis)",
};

/** Kennzahlen, die den Befund rot machen — Hinweise (Lesemodus, Zahlung offen) nicht. */
const ROT = ["auftraege_fehler_24h", "auftraege_haengend", "auftraege_offen_alt", "integrationen_fehler", "postfaecher_fehler", "stripe_ereignisse_fehler"];

export interface Bewertung {
  rot: boolean;
  probleme: Array<{ schluessel: string; anzahl: number }>;
  hinweise: Array<{ schluessel: string; anzahl: number }>;
}

export function befundBewerten(befund: Befund): Bewertung {
  const probleme: Bewertung["probleme"] = [];
  const hinweise: Bewertung["hinweise"] = [];
  for (const [schluessel, anzahl] of Object.entries(befund)) {
    if (typeof anzahl !== "number" || anzahl <= 0) continue;
    (ROT.includes(schluessel) ? probleme : hinweise).push({ schluessel, anzahl });
  }
  probleme.sort((a, b) => a.schluessel.localeCompare(b.schluessel));
  hinweise.sort((a, b) => a.schluessel.localeCompare(b.schluessel));
  return { rot: probleme.length > 0, probleme, hinweise };
}

/** Hash der Befundlage — nur die roten Kennzahlen zaehlen, damit Hinweise keine Mailflut ausloesen. */
export function befundHash(bewertung: Bewertung): string {
  const kern = bewertung.probleme.map((p) => `${p.schluessel}=${p.anzahl}`).join(";");
  return createHash("sha256").update(kern).digest("hex").slice(0, 16);
}

export interface WaechterZustand {
  hash?: string | undefined;
  rot?: boolean | undefined;
  /** ISO-Zeitpunkt der letzten Mail */
  mail_am?: string | undefined;
  /** ISO-Zeitpunkt der letzten Pruefung */
  geprueft_am?: string | undefined;
}

export const WAECHTER_TAKT_MS = 60 * 60 * 1000;
export const WAECHTER_WIEDERHOLUNG_MS = 24 * 60 * 60 * 1000;

/** Ist die stuendliche Pruefung faellig? */
export function pruefungFaellig(zustand: WaechterZustand, jetzt: Date): boolean {
  if (!zustand.geprueft_am) return true;
  const letzte = new Date(zustand.geprueft_am).getTime();
  return Number.isNaN(letzte) || jetzt.getTime() - letzte >= WAECHTER_TAKT_MS;
}

export type Mailart = "befund" | "entwarnung" | null;

export function mailEntscheiden(zustand: WaechterZustand, bewertung: Bewertung, hash: string, jetzt: Date): Mailart {
  if (bewertung.rot) {
    if (hash !== zustand.hash) return "befund";
    const letzte = zustand.mail_am ? new Date(zustand.mail_am).getTime() : Number.NaN;
    if (Number.isNaN(letzte) || jetzt.getTime() - letzte >= WAECHTER_WIEDERHOLUNG_MS) return "befund";
    return null;
  }
  return zustand.rot ? "entwarnung" : null;
}

export function befundText(bewertung: Bewertung, art: Exclude<Mailart, null>, jetzt: Date): { betreff: string; text: string } {
  const zeit = jetzt.toISOString().replace("T", " ").slice(0, 16);
  if (art === "entwarnung") {
    return {
      betreff: "ImmoOffice.ai Wächter: Entwarnung — alle Ketten grün",
      text: `Stand ${zeit} UTC: Keine gescheiterten oder hängenden Aufträge, keine gestörten Integrationen oder Postfächer, keine Stripe-Fehler.\n\nDiese Mail kommt automatisch vom Wächter der Hintergrundketten.`,
    };
  }
  const zeilen = bewertung.probleme.map((p) => `- ${BEFUND_BEZEICHNUNG[p.schluessel] ?? p.schluessel}: ${p.anzahl}`);
  const hinweise = bewertung.hinweise.map((h) => `- ${BEFUND_BEZEICHNUNG[h.schluessel] ?? h.schluessel}: ${h.anzahl}`);
  return {
    betreff: `ImmoOffice.ai Wächter: ${bewertung.probleme.length} Befund${bewertung.probleme.length === 1 ? "" : "e"} in den Hintergrundketten`,
    text: [
      `Stand ${zeit} UTC — Befunde:`,
      ...zeilen,
      ...(hinweise.length > 0 ? ["", "Hinweise (keine Störung):", ...hinweise] : []),
      "",
      "Gleiche Befundlage wird höchstens einmal je 24 Stunden gemeldet; eine neue Lage sofort, Entwarnung bei Grün.",
      "Diese Mail kommt automatisch vom Wächter der Hintergrundketten.",
    ].join("\n"),
  };
}
