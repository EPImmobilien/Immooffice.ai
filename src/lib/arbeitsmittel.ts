/**
 * Begriffe rund um Aufgaben und Termine.
 *
 * Beide haengen wahlweise an einem Objekt und an einem Kontakt. „Wahlweise",
 * weil nicht jede Aufgabe einen Bezug hat — ein Rueckruf braucht kein Objekt —,
 * aber jede, die einen hat, dort auch auftauchen soll. Genau das unterscheidet
 * eine verkettete Anwendung von einer Sammlung von Listen.
 */

export const PRIORITAETEN = {
  hoch: "Hoch",
  mittel: "Mittel",
  niedrig: "Niedrig",
} as const;

export type Prioritaet = keyof typeof PRIORITAETEN;

export const TERMINARTEN = {
  besichtigung: "Besichtigung",
  beratung: "Beratung",
  objektaufnahme: "Objektaufnahme",
  notartermin: "Notartermin",
  uebergabe: "Übergabe",
  telefonat: "Telefonat",
  sonstiges: "Sonstiges",
} as const;

export type Terminart = keyof typeof TERMINARTEN;

export interface Aufgabe {
  id: string;
  titel: string;
  beschreibung: string | null;
  prioritaet: Prioritaet;
  faellig_am: string | null;
  erledigt_am: string | null;
  objekt_id: string | null;
  kontakt_id: string | null;
  objekt?: { objektnummer: string; bezeichnung: string } | null;
  kontakt?: { vorname: string | null; nachname: string } | null;
  zustaendig?: { name: string } | null;
}

export interface Termin {
  id: string;
  titel: string;
  art: Terminart;
  notiz: string | null;
  beginnt_am: string;
  endet_am: string;
  ort: string | null;
  abgesagt_am: string | null;
  objekt_id: string | null;
  kontakt_id: string | null;
  objekt?: { objektnummer: string; bezeichnung: string } | null;
  kontakt?: { vorname: string | null; nachname: string } | null;
  zustaendig?: { name: string } | null;
}

/**
 * Einordnung einer Frist gegenueber einem Bezugstag.
 *
 * Der Bezugstag wird uebergeben und nicht hier ermittelt: Eine Funktion, die
 * `new Date()` selbst aufruft, laesst sich nicht pruefen, und in einer
 * React-Darstellung waere sie zudem nicht deterministisch.
 */
export type Fristlage = "ueberfaellig" | "heute" | "diese_woche" | "spaeter" | "ohne";

export function fristlage(faelligAm: string | null, heute: Date): Fristlage {
  if (!faelligAm) return "ohne";

  // Auf Tagesgrenzen rechnen. Mit Uhrzeiten waere eine Aufgabe, die heute um
  // 8 Uhr faellig war, um 9 Uhr bereits „ueberfaellig" — fuer eine Frist auf
  // Tagesbasis ist das falsch.
  const tag = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const frist = new Date(`${faelligAm}T00:00:00Z`);
  const fristTag = Date.UTC(
    frist.getUTCFullYear(),
    frist.getUTCMonth(),
    frist.getUTCDate(),
  );
  const heuteTag = tag(heute);
  const tage = Math.round((fristTag - heuteTag) / 86_400_000);

  if (tage < 0) return "ueberfaellig";
  if (tage === 0) return "heute";
  if (tage <= 7) return "diese_woche";
  return "spaeter";
}

export const FRISTLAGE_BEZEICHNUNG: Record<Fristlage, string> = {
  ueberfaellig: "Überfällig",
  heute: "Heute",
  diese_woche: "Diese Woche",
  spaeter: "Später",
  ohne: "Ohne Frist",
};

/**
 * Sortierung offener Aufgaben: dringend zuerst.
 *
 * Aufgaben ohne Frist landen am Ende. Sie nach vorn zu nehmen, waere die
 * bequemere Sortierung — und wuerde genau das verdecken, was heute ansteht.
 */
export function aufgabenSortieren<
  T extends { faellig_am: string | null; prioritaet: Prioritaet },
>(aufgaben: readonly T[]): T[] {
  const rang: Record<Prioritaet, number> = { hoch: 0, mittel: 1, niedrig: 2 };
  return [...aufgaben].sort((a, b) => {
    if (a.faellig_am !== b.faellig_am) {
      if (!a.faellig_am) return 1;
      if (!b.faellig_am) return -1;
      return a.faellig_am < b.faellig_am ? -1 : 1;
    }
    return rang[a.prioritaet] - rang[b.prioritaet];
  });
}

/** Name eines Kontakts fuer die Anzeige in Listen. */
export function kontaktname(
  kontakt: { vorname: string | null; nachname: string } | null | undefined,
): string | null {
  if (!kontakt) return null;
  return [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// ToDos-Ausbau (docs/FUNKTIONSABGLEICH.md N1): Status, Typ, Tags, Wiederholung,
// Schnelleingabe
// ---------------------------------------------------------------------------

export const AUFGABEN_STATUS = { offen: "Offen", laeuft: "Läuft", wartet: "Wartet", erledigt: "Erledigt", verworfen: "Verworfen" } as const;
export type AufgabenStatus = keyof typeof AUFGABEN_STATUS;

export const AUFGABEN_TYPEN = { aufgabe: "Aufgabe", notiz: "Notiz" } as const;
export type AufgabenTyp = keyof typeof AUFGABEN_TYPEN;

export const WIEDERHOLUNGEN = { taeglich: "täglich", woechentlich: "wöchentlich", monatlich: "monatlich", jaehrlich: "jährlich" } as const;
export type Wiederholung = keyof typeof WIEDERHOLUNGEN;

export interface AufgabeErweitert extends Aufgabe {
  status: AufgabenStatus;
  typ: AufgabenTyp;
  tags: string[];
  wiederholung: Wiederholung | null;
  erinnerung_am: string | null;
  quelle: string | null;
  team_sichtbar: boolean;
  lead_id: string | null;
  termin_id: string | null;
  nachricht_id: string | null;
  vertrag_id: string | null;
  zustaendig_id: string | null;
  erstellt_von: string | null;
  erstellt_am: string;
}

export interface Schritt { id: string; titel: string; sortierung: number; erledigt_am: string | null }
export interface Kommentar { id: string; text: string; system: boolean; benutzer_name: string | null; erstellt_am: string }
export interface Tag { id: string; name: string; farbe: string }

export interface Schnelleingabe {
  titel: string;
  faellig_am: string | null;
  prioritaet: Prioritaet;
  tags: string[];
  wiederholung: Wiederholung | null;
  typ: AufgabenTyp;
}

const WOCHENTAGE = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];

function isoTag(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Schnelleingabe (Referenz „Per Spracheingabe … entstehen ToDos in Sekunden"):
 * „Energieausweis anfordern morgen !! #unterlagen wöchentlich" → Titel, Frist,
 * Prioritaet, Tags, Wiederholung. Erkannt werden heute/morgen/übermorgen,
 * Wochentage, „in 3 Tagen/Wochen", Daten wie 12.10. oder 12.10.2026, „!"/„!!",
 * „#tag" und Wiederholungswoerter. Alles bleibt danach editierbar.
 */
export function schnelleingabeParsen(eingabe: string, heute: Date): Schnelleingabe {
  let text = ` ${eingabe.replace(/\s+/g, " ").trim()} `;
  const basis = new Date(Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate()));
  let faellig: string | null = null;
  const setzeTage = (n: number) => { const d = new Date(basis); d.setUTCDate(d.getUTCDate() + n); faellig = isoTag(d); };

  const tags: string[] = [];
  text = text.replace(/\s#([\wäöüß-]{1,40})/gi, (_, t: string) => { tags.push(t.toLowerCase()); return " "; });

  let prioritaet: Prioritaet = "mittel";
  if (/\s!!+\s|\s!!+$/.test(text) || /\bdringend\b/i.test(text)) prioritaet = "hoch";
  else if (/\s!\s|\s!$/.test(text)) prioritaet = "mittel";
  if (/\bunwichtig\b|\birgendwann\b/i.test(text)) prioritaet = "niedrig";
  text = text.replace(/\s!+(?=\s|$)/g, " ").replace(/\b(dringend|unwichtig|irgendwann)\b/gi, " ");

  let wiederholung: Wiederholung | null = null;
  const wdh: Array<[RegExp, Wiederholung]> = [[/\b(täglich|taeglich|jeden tag)\b/i, "taeglich"], [/\b(wöchentlich|woechentlich|jede woche)\b/i, "woechentlich"], [/\b(monatlich|jeden monat)\b/i, "monatlich"], [/\b(jährlich|jaehrlich|jedes jahr)\b/i, "jaehrlich"]];
  for (const [re, w] of wdh) if (re.test(text)) { wiederholung = w; text = text.replace(re, " "); break; }

  const relativ = /\bin (\d{1,2}) (tag|tagen|woche|wochen|monat|monaten)\b/i.exec(text);
  if (relativ?.[1] && relativ[2]) {
    const n = Number(relativ[1]);
    const einheit = relativ[2].toLowerCase();
    if (einheit.startsWith("tag")) setzeTage(n);
    else if (einheit.startsWith("woche")) setzeTage(n * 7);
    else { const d = new Date(basis); d.setUTCMonth(d.getUTCMonth() + n); faellig = isoTag(d); }
    text = text.replace(relativ[0], " ");
  } else if (/\bübermorgen\b|\buebermorgen\b/i.test(text)) { setzeTage(2); text = text.replace(/\b(übermorgen|uebermorgen)\b/i, " "); }
  else if (/\bmorgen\b/i.test(text)) { setzeTage(1); text = text.replace(/\bmorgen\b/i, " "); }
  else if (/\bheute\b/i.test(text)) { setzeTage(0); text = text.replace(/\bheute\b/i, " "); }
  else {
    const datum = /\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?(?=\s|$)/.exec(text);
    if (datum?.[1] && datum[2]) {
      const jahr = datum[3] ? (datum[3].length === 2 ? 2000 + Number(datum[3]) : Number(datum[3])) : basis.getUTCFullYear();
      const d = new Date(Date.UTC(jahr, Number(datum[2]) - 1, Number(datum[1])));
      if (!Number.isNaN(d.getTime())) { if (!datum[3] && d < basis) d.setUTCFullYear(jahr + 1); faellig = isoTag(d); text = text.replace(datum[0], " "); }
    } else {
      const wt = new RegExp(`\\b(am )?(${WOCHENTAGE.join("|")})\\b`, "i").exec(text);
      if (wt?.[2]) {
        const ziel = WOCHENTAGE.indexOf(wt[2].toLowerCase());
        const diff = (ziel - basis.getUTCDay() + 7) % 7 || 7;
        setzeTage(diff);
        text = text.replace(wt[0], " ");
      }
    }
  }

  let typ: AufgabenTyp = "aufgabe";
  if (/^\s*notiz[:\s]/i.test(text)) { typ = "notiz"; text = text.replace(/^\s*notiz[:\s]/i, " "); }

  return { titel: text.replace(/\s+/g, " ").trim(), faellig_am: faellig, prioritaet, tags: [...new Set(tags)], wiederholung, typ };
}

/** Naechste Faelligkeit einer Wiederholung (gleiche Regel wie in der Datenbank). */
export function naechsteFaelligkeit(faelligAm: string, wiederholung: Wiederholung): string {
  const d = new Date(`${faelligAm}T00:00:00Z`);
  if (wiederholung === "taeglich") d.setUTCDate(d.getUTCDate() + 1);
  else if (wiederholung === "woechentlich") d.setUTCDate(d.getUTCDate() + 7);
  else if (wiederholung === "monatlich") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return isoTag(d);
}
