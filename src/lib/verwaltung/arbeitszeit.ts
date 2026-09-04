import { feiertage, istWochenende, tagPlus, type Bundesland } from "./feiertage";

/**
 * Arbeitszeit (Referenz: Stempeluhr, Wochenmodell, Nachtragen): Soll aus dem
 * Wochenmodell, Ist aus Stempelpaaren (kommen → gehen), Luecken sind Pause.
 * Ein Tag ohne Feierabend-Stempel zaehlt nicht mit und wird als „offen“ gefuehrt.
 */

export interface Wochenmodell {
  id: string;
  benutzer_id: string;
  gueltig_ab: string;
  stunden_mo: number; stunden_di: number; stunden_mi: number; stunden_do: number; stunden_fr: number; stunden_sa: number; stunden_so: number;
}
export interface Stempel { id: string; benutzer_id: string; datum: string; richtung: "kommen" | "gehen"; zeitpunkt: string; quelle: string }
export interface Tag { id: string; benutzer_id: string; datum: string; art: "arbeit" | "urlaub" | "krank" | "feiertag" | "frei" | "fortbildung"; stunden: number | null; von: string | null; bis: string | null; bemerkung: string | null }

const FELD = ["stunden_so", "stunden_mo", "stunden_di", "stunden_mi", "stunden_do", "stunden_fr", "stunden_sa"] as const;

export function wochentag(datum: string): number {
  return new Date(`${datum}T12:00:00Z`).getUTCDay();
}

/** Modell, das an einem Tag gilt: das juengste mit gueltig_ab <= Tag. */
export function modellAm(modelle: Wochenmodell[], datum: string): Wochenmodell | null {
  return modelle.filter((m) => m.gueltig_ab <= datum).sort((a, b) => b.gueltig_ab.localeCompare(a.gueltig_ab))[0] ?? null;
}

/** Sollstunden eines Tages laut Modell (0 ohne Modell). */
export function soll(modelle: Wochenmodell[], datum: string): number {
  const m = modellAm(modelle, datum);
  return m ? Number(m[FELD[wochentag(datum)]!]) || 0 : 0;
}

export function monatstage(jahr: number, monat: number): string[] {
  const aus: string[] = [];
  let d = `${jahr}-${String(monat).padStart(2, "0")}-01`;
  while (d.slice(0, 7) === `${jahr}-${String(monat).padStart(2, "0")}`) { aus.push(d); d = tagPlus(d, 1); }
  return aus;
}

/** Gestempelte Stunden eines Tages aus Paaren; `offen` wenn ein Kommen ohne Gehen bleibt. */
export function stundenAusStempeln(stempel: Stempel[]): { stunden: number; offen: string | null; paare: Array<{ von: string; bis: string }> } {
  const liste = [...stempel].sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt));
  let start: string | null = null;
  let summe = 0;
  const paare: Array<{ von: string; bis: string }> = [];
  for (const s of liste) {
    if (s.richtung === "kommen") { start = start ?? s.zeitpunkt; continue; }
    if (start) {
      summe += (new Date(s.zeitpunkt).getTime() - new Date(start).getTime()) / 3600000;
      paare.push({ von: start, bis: s.zeitpunkt });
      start = null;
    }
  }
  return { stunden: Math.round(summe * 100) / 100, offen: start, paare };
}

export interface TagZeile {
  datum: string;
  wochenende: boolean;
  feiertag: string | null;
  soll: number;
  ist: number;
  art: Tag["art"] | null;
  offen: string | null;
  bemerkung: string | null;
  paare: Array<{ von: string; bis: string }>;
}

export interface Monatsbilanz { zeilen: TagZeile[]; soll: number; ist: number; saldo: number; offene: number; urlaubstage: number; kranktage: number }

/** Monat eines Mitarbeiters: je Tag Soll, Ist, Art. Urlaub/Krank/Feiertag zaehlen als Soll erfuellt. */
export function monatsbilanz(jahr: number, monat: number, modelle: Wochenmodell[], stempel: Stempel[], tage: Tag[], land?: Bundesland | null, heute?: string): Monatsbilanz {
  const ft = feiertage(jahr, land);
  const zeilen: TagZeile[] = [];
  let sollSumme = 0, istSumme = 0, offene = 0, urlaubstage = 0, kranktage = 0;
  const grenze = heute ?? new Date().toISOString().slice(0, 10);
  for (const d of monatstage(jahr, monat)) {
    const s = soll(modelle, d);
    const t = tage.find((x) => x.datum === d) ?? null;
    const st = stundenAusStempeln(stempel.filter((x) => x.datum === d));
    const feiertag = ft.get(d) ?? null;
    let ist = st.stunden;
    let art: Tag["art"] | null = t?.art ?? null;
    if (feiertag && s > 0) { art = art ?? "feiertag"; }
    if (t?.art === "arbeit" && t.stunden != null) ist = Math.max(ist, Number(t.stunden));
    if (art === "urlaub" || art === "krank" || art === "feiertag" || art === "fortbildung") { ist = s; }
    if (art === "urlaub") urlaubstage++;
    if (art === "krank") kranktage++;
    if (d <= grenze) { sollSumme += s; istSumme += ist; }
    if (st.offen && d < grenze) offene++;
    zeilen.push({ datum: d, wochenende: istWochenende(d), feiertag, soll: s, ist: Math.round(ist * 100) / 100, art, offen: st.offen, bemerkung: t?.bemerkung ?? null, paare: st.paare });
  }
  return { zeilen, soll: Math.round(sollSumme * 100) / 100, ist: Math.round(istSumme * 100) / 100, saldo: Math.round((istSumme - sollSumme) * 100) / 100, offene, urlaubstage, kranktage };
}

export function stundenText(h: number): string {
  const v = Math.abs(h);
  const st = Math.floor(v);
  const min = Math.round((v - st) * 60);
  return `${h < 0 ? "−" : ""}${st}:${String(min).padStart(2, "0")} h`;
}

export const TAG_ARTEN = { arbeit: "Arbeit", urlaub: "Urlaub", krank: "Krank", feiertag: "Feiertag", frei: "Frei / Ausgleich", fortbildung: "Fortbildung" } as const;
