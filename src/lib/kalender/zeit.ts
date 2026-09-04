/**
 * Zeitrechnung fuer den Kalender — alles in der Zeitzone Europe/Berlin,
 * gespeichert wird UTC. Die Funktionen sind bewusst ohne Bibliothek gebaut
 * und durch Unit-Tests abgesichert (Sommer-/Winterzeit).
 */

export const ZEITZONE = "Europe/Berlin";

const TEILE = new Intl.DateTimeFormat("de-DE", { timeZone: ZEITZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });

export interface Zeitteile {
  /** JJJJ-MM-TT in Berlin */
  datum: string;
  /** HH:MM in Berlin */
  zeit: string;
  /** Minuten seit Mitternacht (Berlin) */
  minuten: number;
  /** 1 = Montag … 7 = Sonntag */
  wochentag: number;
}

const WOCHENTAGE: Record<string, number> = { Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, So: 7 };

/** Datum und Uhrzeit eines Zeitpunkts in Berlin. */
export function berlin(wert: string | Date): Zeitteile {
  const d = typeof wert === "string" ? new Date(wert) : wert;
  const t: Record<string, string> = {};
  for (const p of TEILE.formatToParts(d)) t[p.type] = p.value;
  const stunde = Number(t["hour"] ?? 0);
  const minute = Number(t["minute"] ?? 0);
  return {
    datum: `${t["year"]}-${t["month"]}-${t["day"]}`,
    zeit: `${String(stunde).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    minuten: stunde * 60 + minute,
    wochentag: WOCHENTAGE[(t["weekday"] ?? "Mo").replace(".", "")] ?? 1,
  };
}

/** Versatz der Berliner Zeit gegenueber UTC zu einem Zeitpunkt, in Minuten. */
function versatz(d: Date): number {
  const b = berlin(d);
  const alsUtc = Date.UTC(Number(b.datum.slice(0, 4)), Number(b.datum.slice(5, 7)) - 1, Number(b.datum.slice(8, 10)), Math.floor(b.minuten / 60), b.minuten % 60);
  return Math.round((alsUtc - d.getTime()) / 60_000);
}

/** Berliner Datum und Uhrzeit → Zeitpunkt (UTC). */
export function ausBerlin(datum: string, zeit = "00:00"): Date {
  const [j, m, t] = datum.split("-").map(Number);
  const [h, min] = zeit.split(":").map(Number);
  const roh = Date.UTC(j ?? 1970, (m ?? 1) - 1, t ?? 1, h ?? 0, min ?? 0);
  // Zwei Durchgaenge: der Versatz haengt vom Zeitpunkt selbst ab (Umstellungstage).
  const erster = new Date(roh - versatz(new Date(roh)) * 60_000);
  return new Date(roh - versatz(erster) * 60_000);
}

/** Kalendertag plus n Tage (Datumsarithmetik ohne Zeitzone). */
export function tagPlus(datum: string, n: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1, (t ?? 1) + n, 12)).toISOString().slice(0, 10);
}

/** Monat plus n; der 31. wird im kuerzeren Monat der letzte Tag. */
export function monatPlus(datum: string, n: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  const ziel = new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1 + n, 1, 12));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0, 12)).getUTCDate();
  ziel.setUTCDate(Math.min(t ?? 1, letzter));
  return ziel.toISOString().slice(0, 10);
}

/** Montag der Woche, in der das Datum liegt. */
export function wochenstart(datum: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1, t ?? 1, 12));
  const wt = (d.getUTCDay() + 6) % 7; // 0 = Montag
  return tagPlus(datum, -wt);
}

/** Heutiges Datum in Berlin. */
export function heuteBerlin(jetzt: Date = new Date()): string {
  return berlin(jetzt).datum;
}

export function datumLang(datum: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1, t ?? 1, 12)));
}

export function datumKurz(datum: string): string {
  const [j, m, t] = datum.split("-");
  return `${t}.${m}.${j}`;
}
