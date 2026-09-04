/**
 * Bewerber-Einstellungstest (Referenz: Chef-Bereich → Bewerber). Laut Masterprompt
 * entfaellt das Modul ersatzlos; auf Weisung des Auftraggebers (1:1) als
 * letzter Baustein nachgebaut und im Status gekennzeichnet. Fragen sind eigene
 * Formulierungen — keine Uebernahme aus der Referenz.
 */

export interface Frage {
  id: string;
  kategorie: "rechnen" | "fachwissen" | "kunde" | "text";
  frage: string;
  antworten: readonly string[];
  richtig: number;
  punkte: number;
}

export const KATEGORIEN = { rechnen: "Rechnen", fachwissen: "Immobilienwissen", kunde: "Kundenkontakt", text: "Textverständnis" } as const;

export const FRAGEN: readonly Frage[] = [
  { id: "r1", kategorie: "rechnen", frage: "Eine Wohnung kostet 420.000 €. Die Käuferprovision beträgt 3,57 % inkl. USt. Wie hoch ist die Provision?", antworten: ["12.600 €", "14.994 €", "15.000 €", "16.800 €"], richtig: 1, punkte: 2 },
  { id: "r2", kategorie: "rechnen", frage: "Eine Wohnung hat 85 m² und wird für 1.190 € kalt vermietet. Wie hoch ist die Miete je m²?", antworten: ["12,00 €", "13,00 €", "14,00 €", "15,00 €"], richtig: 2, punkte: 2 },
  { id: "r3", kategorie: "rechnen", frage: "Ein Haus wurde für 500.000 € angeboten und für 470.000 € verkauft. Wie groß ist der Abschlag in Prozent?", antworten: ["5 %", "6 %", "7 %", "8 %"], richtig: 1, punkte: 2 },
  { id: "r4", kategorie: "rechnen", frage: "Bei einer Bruttomietrendite von 4 % und 12.000 € Jahreskaltmiete: Welcher Kaufpreis ergibt sich?", antworten: ["240.000 €", "300.000 €", "360.000 €", "480.000 €"], richtig: 1, punkte: 2 },
  { id: "f1", kategorie: "fachwissen", frage: "Welche Aussage zum Energieausweis ist richtig?", antworten: ["Er ist nur bei Neubauten nötig.", "Bei Verkauf und Vermietung muss er spätestens bei der Besichtigung vorgelegt werden.", "Er wird vom Makler ausgestellt.", "Er gilt unbegrenzt."], richtig: 1, punkte: 2 },
  { id: "f2", kategorie: "fachwissen", frage: "Was regelt § 656a BGB seit 2020 für Maklerverträge über Wohnungen und Einfamilienhäuser?", antworten: ["Die Provisionshöhe", "Die Textform des Maklervertrags", "Die Pflicht zur Besichtigung", "Die Dauer der Bindung"], richtig: 1, punkte: 2 },
  { id: "f3", kategorie: "fachwissen", frage: "Was ist ein Alleinauftrag?", antworten: ["Der Eigentümer beauftragt nur einen Makler.", "Der Makler darf nur ein Objekt vermarkten.", "Der Käufer darf nur ein Objekt besichtigen.", "Ein Vertrag ohne Provision."], richtig: 0, punkte: 1 },
  { id: "f4", kategorie: "fachwissen", frage: "Welche Unterlage weist die Eigentumsverhältnisse eines Grundstücks nach?", antworten: ["Baulastenverzeichnis", "Grundbuchauszug", "Flächennutzungsplan", "Teilungserklärung"], richtig: 1, punkte: 1 },
  { id: "f5", kategorie: "fachwissen", frage: "Was steht in einer Teilungserklärung?", antworten: ["Die Aufteilung eines Gebäudes in Sonder- und Gemeinschaftseigentum", "Die Aufteilung des Kaufpreises", "Die Aufteilung der Provision", "Der Bebauungsplan"], richtig: 0, punkte: 1 },
  { id: "k1", kategorie: "kunde", frage: "Ein Interessent sagt bei der Besichtigung: „Das ist mir zu teuer.“ Was ist die beste Reaktion?", antworten: ["Sofort einen Nachlass anbieten", "Nachfragen, womit er vergleicht, und den Wert sachlich einordnen", "Die Besichtigung beenden", "Auf andere Interessenten verweisen, die mehr zahlen würden"], richtig: 1, punkte: 2 },
  { id: "k2", kategorie: "kunde", frage: "Ein Eigentümer möchte einen Angebotspreis deutlich über dem Marktwert. Wie gehen Sie vor?", antworten: ["Den Preis übernehmen, um den Auftrag zu bekommen", "Mit Vergleichsdaten beraten und die Folgen eines zu hohen Preises erklären", "Den Auftrag ablehnen", "Ohne Rücksprache einen niedrigeren Preis inserieren"], richtig: 1, punkte: 2 },
  { id: "k3", kategorie: "kunde", frage: "Eine Anfrage kommt am Freitagabend per Mail. Was ist angemessen?", antworten: ["Am Montag antworten reicht immer", "Kurz bestätigen und einen konkreten Termin für die Antwort nennen", "Ignorieren, wenn keine Telefonnummer dabei ist", "Sofort das komplette Exposé mit allen Unterlagen schicken"], richtig: 1, punkte: 1 },
  { id: "t1", kategorie: "text", frage: "„Der Käufer trägt die Grunderwerbsteuer, Notar- und Grundbuchkosten.“ Wer zahlt die Grundbuchkosten?", antworten: ["Der Verkäufer", "Der Makler", "Der Käufer", "Beide je zur Hälfte"], richtig: 2, punkte: 1 },
  { id: "t2", kategorie: "text", frage: "„Die Provision wird mit Abschluss des notariellen Kaufvertrags fällig.“ Wann ist die Provision zu zahlen?", antworten: ["Bei Reservierung", "Bei Beurkundung", "Bei Übergabe", "Bei Eintragung im Grundbuch"], richtig: 1, punkte: 1 },
];

export const MAX_PUNKTE = FRAGEN.reduce((s, f) => s + f.punkte, 0);

export type Empfehlung = "sehr_gut" | "gespraech" | "kein_match";
export const EMPFEHLUNG = { sehr_gut: "Sehr gut — einladen", gespraech: "Solide — Gespräch führen", kein_match: "Eher kein Match" } as const;

export interface Auswertung {
  punkte: number;
  max: number;
  prozent: number;
  empfehlung: Empfehlung;
  jeKategorie: Record<Frage["kategorie"], { punkte: number; max: number }>;
  details: Record<string, { gewaehlt: number | null; richtig: number; punkte: number }>;
}

/** Antworten (Frage-ID → gewaehlter Index) auswerten. */
export function auswerten(antworten: Record<string, number | null | undefined>): Auswertung {
  const jeKategorie = { rechnen: { punkte: 0, max: 0 }, fachwissen: { punkte: 0, max: 0 }, kunde: { punkte: 0, max: 0 }, text: { punkte: 0, max: 0 } };
  const details: Auswertung["details"] = {};
  let punkte = 0;
  for (const f of FRAGEN) {
    const g = antworten[f.id];
    const gewaehlt = typeof g === "number" && Number.isInteger(g) && g >= 0 && g < f.antworten.length ? g : null;
    const p = gewaehlt === f.richtig ? f.punkte : 0;
    punkte += p;
    jeKategorie[f.kategorie].punkte += p;
    jeKategorie[f.kategorie].max += f.punkte;
    details[f.id] = { gewaehlt, richtig: f.richtig, punkte: p };
  }
  const prozent = Math.round((punkte / MAX_PUNKTE) * 100);
  const empfehlung: Empfehlung = prozent >= 80 ? "sehr_gut" : prozent >= 55 ? "gespraech" : "kein_match";
  return { punkte, max: MAX_PUNKTE, prozent, empfehlung, jeKategorie, details };
}

/** Antworten aus einem Formular (Felder f_<id>) lesen. */
export function antwortenAusFormular(werte: Record<string, string | undefined>): Record<string, number | null> {
  const aus: Record<string, number | null> = {};
  for (const f of FRAGEN) {
    const w = werte[`f_${f.id}`];
    const n = w == null || w === "" ? null : Number(w);
    aus[f.id] = n != null && Number.isInteger(n) ? n : null;
  }
  return aus;
}

export const BEWERBER_STATUS = { offen: "Offen", gestartet: "Gestartet", abgeschlossen: "Abgeschlossen" } as const;
