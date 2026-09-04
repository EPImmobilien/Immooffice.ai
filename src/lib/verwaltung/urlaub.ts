import { arbeitstage, type Bundesland } from "./feiertage";

/**
 * Urlaubsbilanz (Referenz: Admin → Urlaub): Jahresanspruch mit Staffel je Jahr,
 * anteiliger Anspruch im Eintrittsjahr, Übertrag aus dem Vorjahr (manuell plus
 * automatisch aus dem Rest), Verfall des Übertrags nach dem 31. März.
 */

export interface UrlaubProfil {
  id: string;
  name: string;
  eintritt: string | null;
  urlaubstage_jahr: number;
  urlaub_uebertrag: number;
  urlaub_staffel: Record<string, number> | null;
}

export interface UrlaubAntrag {
  id: string;
  benutzer_id: string;
  von: string;
  bis: string;
  arbeitstage: number;
  status: "beantragt" | "genehmigt" | "abgelehnt" | "storniert";
  bemerkung?: string | null;
}

export interface Anspruch { anspruch: number; anteilig: boolean; monate: number; voll: number }

/** Jahresanspruch: Staffelwert des Jahres, sonst Standard; im Eintrittsjahr anteilig nach vollen Monaten (kaufmännisch gerundet). */
export function anspruchJahr(p: UrlaubProfil, jahr: number): Anspruch {
  const staffel = p.urlaub_staffel ?? {};
  const s = staffel[String(jahr)];
  const voll = typeof s === "number" && Number.isFinite(s) ? s : Number(p.urlaubstage_jahr) || 0;
  const eintritt = p.eintritt ? p.eintritt.slice(0, 10) : null;
  if (!eintritt || Number(eintritt.slice(0, 4)) !== jahr) return { anspruch: voll, anteilig: false, monate: 12, voll };
  const monat = Number(eintritt.slice(5, 7));
  const tag = Number(eintritt.slice(8, 10));
  const volleMonate = Math.max(0, 12 - monat + (tag === 1 ? 1 : 0));
  const roh = (voll * volleMonate) / 12;
  return { anspruch: Math.floor(roh) + (roh - Math.floor(roh) >= 0.5 ? 1 : 0), anteilig: true, monate: volleMonate, voll };
}

export interface Bilanz {
  jahr: number;
  jahresanspruch: number;
  anteilig: boolean;
  monate: number;
  uebertrag: number;
  uebertragManuell: number;
  uebertragAuto: number;
  uebertragGenutzt: number;
  uebertragVerfallen: number;
  uebertragFrist: string;
  nachFrist: boolean;
  anspruch: number;
  genehmigt: number;
  beantragt: number;
  rest: number;
  restNachBeantragt: number;
  eintraege: UrlaubAntrag[];
}

const eigene = (p: UrlaubProfil, antraege: UrlaubAntrag[], jahr: number) =>
  antraege.filter((a) => a.benutzer_id === p.id && a.status !== "storniert" && a.von.startsWith(String(jahr)));
const summe = (liste: UrlaubAntrag[], status: UrlaubAntrag["status"]) => liste.filter((a) => a.status === status).reduce((s, a) => s + a.arbeitstage, 0);

/** Bilanz eines Mitarbeiters fuer ein Jahr. `heute` als ISO-Datum fuer die Verfallsfrist. */
export function bilanz(p: UrlaubProfil, antraege: UrlaubAntrag[], jahr: number, heute: string): Bilanz {
  const teil = anspruchJahr(p, jahr);
  const liste = eigene(p, antraege, jahr);
  const genehmigt = summe(liste, "genehmigt");
  const beantragt = summe(liste, "beantragt");
  const eintrittJahr = p.eintritt ? Number(p.eintritt.slice(0, 4)) : null;
  const vorjahr = eigene(p, antraege, jahr - 1);
  const vorjahrErfasst = (eintrittJahr === null || eintrittJahr < jahr) && vorjahr.length > 0;
  const uebertragAuto = vorjahrErfasst ? Math.max(0, anspruchJahr(p, jahr - 1).anspruch - summe(vorjahr, "genehmigt")) : 0;
  const uebertragManuell = Number(p.urlaub_uebertrag) || 0;
  const uebertrag = uebertragManuell + uebertragAuto;
  const frist = `${jahr}-03-31`;
  const genommenBisFrist = liste.filter((a) => a.status === "genehmigt" && a.von <= frist).reduce((s, a) => s + a.arbeitstage, 0);
  const uebertragGenutzt = Math.min(uebertrag, genommenBisFrist);
  const nachFrist = heute > frist;
  const uebertragVerfallen = nachFrist ? uebertrag - uebertragGenutzt : 0;
  const anspruch = teil.anspruch + (nachFrist ? uebertragGenutzt : uebertrag);
  return {
    jahr, jahresanspruch: teil.anspruch, anteilig: teil.anteilig, monate: teil.monate,
    uebertrag, uebertragManuell, uebertragAuto, uebertragGenutzt, uebertragVerfallen, uebertragFrist: frist, nachFrist,
    anspruch, genehmigt, beantragt, rest: anspruch - genehmigt, restNachBeantragt: anspruch - genehmigt - beantragt,
    eintraege: liste.sort((a, b) => a.von.localeCompare(b.von)),
  };
}

/** Arbeitstage eines Antrags (Mo–Fr ohne Feiertage des Landes). */
export function antragArbeitstage(von: string, bis: string, land?: Bundesland | null): number {
  return arbeitstage(von, bis, land).length;
}

/** Ueberschneidung mit anderen genehmigten oder beantragten Abwesenheiten im Team. */
export function ueberschneidungen(antrag: { von: string; bis: string; benutzer_id: string }, andere: UrlaubAntrag[]): UrlaubAntrag[] {
  return andere.filter((a) => a.benutzer_id !== antrag.benutzer_id && a.status !== "abgelehnt" && a.status !== "storniert" && a.von <= antrag.bis && a.bis >= antrag.von);
}

export const URLAUB_STATUS = { beantragt: "Beantragt", genehmigt: "Genehmigt", abgelehnt: "Abgelehnt", storniert: "Storniert" } as const;
