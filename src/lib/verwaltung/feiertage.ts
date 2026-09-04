/**
 * Gesetzliche Feiertage in Deutschland (bundesweit plus Auswahl je Land).
 * Reine Rechnung ohne Netz — fuer Urlaubs- und Arbeitszeitbilanz.
 */

export const BUNDESLAENDER = {
  BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg", HB: "Bremen", HH: "Hamburg", HE: "Hessen",
  MV: "Mecklenburg-Vorpommern", NI: "Niedersachsen", NW: "Nordrhein-Westfalen", RP: "Rheinland-Pfalz", SL: "Saarland",
  SN: "Sachsen", ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen",
} as const;
export type Bundesland = keyof typeof BUNDESLAENDER;

/** Ostersonntag nach Gauß (gregorianisch). */
export function ostersonntag(jahr: number): string {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(jahr, monat, tag);
}

function iso(j: number, m: number, t: number): string {
  return `${j}-${String(m).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
}
export function tagPlus(datum: string, n: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Feiertage eines Jahres als Datum → Bezeichnung. */
export function feiertage(jahr: number, land?: Bundesland | null): Map<string, string> {
  const o = ostersonntag(jahr);
  const f = new Map<string, string>([
    [iso(jahr, 1, 1), "Neujahr"],
    [tagPlus(o, -2), "Karfreitag"],
    [tagPlus(o, 1), "Ostermontag"],
    [iso(jahr, 5, 1), "Tag der Arbeit"],
    [tagPlus(o, 39), "Christi Himmelfahrt"],
    [tagPlus(o, 50), "Pfingstmontag"],
    [iso(jahr, 10, 3), "Tag der Deutschen Einheit"],
    [iso(jahr, 12, 25), "1. Weihnachtstag"],
    [iso(jahr, 12, 26), "2. Weihnachtstag"],
  ]);
  if (!land) return f;
  const setze = (d: string, n: string) => f.set(d, n);
  if (["BW", "BY", "ST"].includes(land)) setze(iso(jahr, 1, 6), "Heilige Drei Könige");
  if (["BE", "MV"].includes(land)) setze(iso(jahr, 3, 8), "Internationaler Frauentag");
  if (["BW", "BY", "HE", "NW", "RP", "SL"].includes(land)) setze(tagPlus(o, 60), "Fronleichnam");
  if (["SL", "BY"].includes(land)) setze(iso(jahr, 8, 15), "Mariä Himmelfahrt");
  if (land === "TH") setze(iso(jahr, 9, 20), "Weltkindertag");
  if (["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"].includes(land)) setze(iso(jahr, 10, 31), "Reformationstag");
  if (["BW", "BY", "NW", "RP", "SL"].includes(land)) setze(iso(jahr, 11, 1), "Allerheiligen");
  if (land === "SN") {
    // Buß- und Bettag: Mittwoch vor dem 23. November
    const d = new Date(`${jahr}-11-22T12:00:00Z`);
    while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() - 1);
    setze(d.toISOString().slice(0, 10), "Buß- und Bettag");
  }
  return f;
}

export function istWochenende(datum: string): boolean {
  const t = new Date(`${datum}T12:00:00Z`).getUTCDay();
  return t === 0 || t === 6;
}

/** Arbeitstage (Mo–Fr ohne Feiertage) in einem Zeitraum, beide Grenzen einschliesslich. */
export function arbeitstage(von: string, bis: string, land?: Bundesland | null): string[] {
  if (!von || !bis || bis < von) return [];
  const aus: string[] = [];
  const jahre = new Map<number, Map<string, string>>();
  for (let d = von; d <= bis; d = tagPlus(d, 1)) {
    const j = Number(d.slice(0, 4));
    if (!jahre.has(j)) jahre.set(j, feiertage(j, land));
    if (istWochenende(d) || jahre.get(j)!.has(d)) continue;
    aus.push(d);
    if (aus.length > 400) break;
  }
  return aus;
}
