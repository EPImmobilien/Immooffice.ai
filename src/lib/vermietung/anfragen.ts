/**
 * Mietanfragen (docs/FUNKTIONSABGLEICH.md M1): Status, Quellen, Bewertung
 * und Antwortvorlagen mit Platzhaltern.
 */

export const ANFRAGE_STATUS = {
  neu: "Neu",
  in_pruefung: "In Prüfung",
  besichtigung_geplant: "Besichtigung geplant",
  besichtigung_erfolgt: "Besichtigung erfolgt",
  unterlagen_angefordert: "Unterlagen angefordert",
  zusage: "Zusage",
  absage: "Absage",
  vertrag: "Mietvertrag",
} as const;
export type AnfrageStatus = keyof typeof ANFRAGE_STATUS;

export const ANFRAGE_QUELLEN = { manuell: "Manuell erfasst", email: "E-Mail / Portal", web: "Web-Exposé", selbstauskunft: "Selbstauskunft-Formular" } as const;
export type AnfrageQuelle = keyof typeof ANFRAGE_QUELLEN;

export interface AnfrageZeile {
  id: string;
  objekt_id: string | null;
  kontakt_id: string | null;
  quelle: AnfrageQuelle;
  status: AnfrageStatus;
  anrede: string | null;
  vorname: string | null;
  nachname: string;
  email: string | null;
  telefon: string | null;
  personen_anzahl: number | null;
  einzug_ab: string | null;
  beruf: string | null;
  arbeitgeber: string | null;
  einkommen_netto: number | null;
  schufa_vorhanden: boolean | null;
  kann_kaution_leisten: boolean | null;
  haustiere: string | null;
  raucher: boolean | null;
  derzeitiger_vermieter: string | null;
  mietverhaeltnis_seit: string | null;
  mitteilung: string | null;
  bewertung: number | null;
  notizen: string | null;
  datenschutz_einwilligung: boolean;
  angaben_bestaetigt: boolean;
  besichtigung_am: string | null;
  antwort_verlauf: Array<{ zeitpunkt: string; vorlage: string; betreff: string; weg: string }>;
  email_eingang: { absender?: string; betreff?: string; datum?: string; nachricht_id?: string } | null;
  eingegangen_am: string;
}

export function anfrageName(a: Pick<AnfrageZeile, "anrede" | "vorname" | "nachname">): string {
  return [a.vorname, a.nachname].filter(Boolean).join(" ");
}

/**
 * Bewertungsvorschlag 1–5 aus den Angaben — nur ein Vorschlag, den der Makler
 * ueberschreibt. Regeln sind sichtbar und einfach: Einkommen zu Miete,
 * Bonitaetsauskunft, Kaution, Vollstaendigkeit.
 */
export function bewertungVorschlag(a: Pick<AnfrageZeile, "einkommen_netto" | "schufa_vorhanden" | "kann_kaution_leisten" | "angaben_bestaetigt" | "einzug_ab">, kaltmiete: number | null): { punkte: number; gruende: string[] } {
  let punkte = 3;
  const gruende: string[] = [];
  if (a.einkommen_netto !== null && kaltmiete && kaltmiete > 0) {
    const faktor = a.einkommen_netto / kaltmiete;
    if (faktor >= 3) { punkte += 1; gruende.push(`Einkommen ≥ 3 × Kaltmiete (${faktor.toFixed(1)} ×)`); }
    else if (faktor < 2) { punkte -= 1; gruende.push(`Einkommen unter 2 × Kaltmiete (${faktor.toFixed(1)} ×)`); }
    else gruende.push(`Einkommen ${faktor.toFixed(1)} × Kaltmiete`);
  } else gruende.push("Kein Einkommen angegeben");
  if (a.schufa_vorhanden === true) { punkte += 1; gruende.push("Bonitätsauskunft liegt vor"); }
  else if (a.schufa_vorhanden === false) { punkte -= 1; gruende.push("Keine Bonitätsauskunft"); }
  if (a.kann_kaution_leisten === false) { punkte -= 1; gruende.push("Kaution nicht gesichert"); }
  if (!a.angaben_bestaetigt) gruende.push("Angaben nicht bestätigt");
  return { punkte: Math.max(1, Math.min(5, punkte)), gruende };
}

export interface Antwortvorlage {
  schluessel: string;
  bezeichnung: string;
  betreff: string;
  text: string;
  mit_termin: boolean;
}

/** Vorgaben je Mandant — werden in den Einstellungen ueberschrieben (Tabelle antwortvorlagen). */
export const STANDARD_VORLAGEN: Antwortvorlage[] = [
  {
    schluessel: "eingang",
    bezeichnung: "Eingangsbestätigung",
    betreff: "Ihre Anfrage zu {objekt}",
    text: "{anrede}\n\nvielen Dank für Ihr Interesse an {objekt}. Wir haben Ihre Anfrage erhalten und melden uns in Kürze mit weiteren Informationen.\n\nMit freundlichen Grüßen\n{absender}\n{firma}",
    mit_termin: false,
  },
  {
    schluessel: "besichtigung",
    bezeichnung: "Einladung zur Besichtigung",
    betreff: "Besichtigungstermin: {objekt}",
    text: "{anrede}\n\ngern laden wir Sie zur Besichtigung von {objekt} ein.\n\n{termin}\n\nBitte bestätigen Sie den Termin kurz per Antwort. Sollte er Ihnen nicht passen, nennen Sie uns gern zwei Alternativen.\n\nMit freundlichen Grüßen\n{absender}\n{firma}",
    mit_termin: true,
  },
  {
    schluessel: "selbstauskunft",
    bezeichnung: "Selbstauskunft anfordern",
    betreff: "Selbstauskunft für {objekt}",
    text: "{anrede}\n\nfür die weitere Prüfung bitten wir Sie um eine Mieterselbstauskunft. Sie können sie bequem online ausfüllen:\n\n{link}\n\nIhre Angaben werden vertraulich behandelt und nur für die Vermietung dieser Wohnung verwendet.\n\nMit freundlichen Grüßen\n{absender}\n{firma}",
    mit_termin: false,
  },
  {
    schluessel: "unterlagen",
    bezeichnung: "Unterlagen anfordern",
    betreff: "Unterlagen für {objekt}",
    text: "{anrede}\n\nvielen Dank für die Besichtigung. Für die Entscheidung benötigen wir noch folgende Unterlagen:\n\n- Bonitätsauskunft (nicht älter als drei Monate)\n- Einkommensnachweise der letzten drei Monate\n- Mietschuldenfreiheitsbescheinigung des bisherigen Vermieters\n- Kopie des Personalausweises\n\nBitte senden Sie die Unterlagen als Antwort auf diese E-Mail.\n\nMit freundlichen Grüßen\n{absender}\n{firma}",
    mit_termin: false,
  },
  {
    schluessel: "zusage",
    bezeichnung: "Zusage",
    betreff: "Zusage für {objekt}",
    text: "{anrede}\n\nwir freuen uns, Ihnen die Wohnung {objekt} anbieten zu können. Den Mietvertragsentwurf erhalten Sie in den nächsten Tagen zur Durchsicht; den Termin zur Unterzeichnung stimmen wir gemeinsam ab.\n\nMit freundlichen Grüßen\n{absender}\n{firma}",
    mit_termin: false,
  },
  {
    schluessel: "absage",
    bezeichnung: "Absage",
    betreff: "Ihre Anfrage zu {objekt}",
    text: "{anrede}\n\nvielen Dank für Ihr Interesse an {objekt}. Wir haben uns für einen anderen Bewerber entschieden und bitten um Verständnis. Ihre Angaben löschen wir nach Abschluss der Vermietung.\n\nGern informieren wir Sie über passende Angebote — antworten Sie dazu einfach kurz auf diese Nachricht.\n\nMit freundlichen Grüßen\n{absender}\n{firma}",
    mit_termin: false,
  },
];

export function anredeText(anrede: string | null | undefined, nachname: string): string {
  const a = (anrede ?? "").toLowerCase();
  if (a.startsWith("herr")) return `Sehr geehrter Herr ${nachname},`;
  if (a.startsWith("frau")) return `Sehr geehrte Frau ${nachname},`;
  if (a.startsWith("familie")) return `Sehr geehrte Familie ${nachname},`;
  if (a.startsWith("ehe")) return `Sehr geehrte Eheleute ${nachname},`;
  return "Sehr geehrte Damen und Herren,";
}

export function terminText(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Termin: ${d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

export interface Platzhalter { anrede: string; name: string; objekt: string; termin: string; absender: string; firma: string; link: string }

export function vorlageAusfuellen(v: Pick<Antwortvorlage, "betreff" | "text">, p: Platzhalter): { betreff: string; text: string } {
  const ersetzen = (s: string) => s.replace(/\{(anrede|name|objekt|termin|absender|firma|link)\}/g, (_, k: keyof Platzhalter) => p[k] ?? "");
  return { betreff: ersetzen(v.betreff).replace(/\s+/g, " ").trim(), text: ersetzen(v.text).replace(/\n{3,}/g, "\n\n").trim() };
}
