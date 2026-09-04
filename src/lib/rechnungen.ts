import type { Dokument } from "@/lib/dokument/struktur";
import { datum, euro } from "@/lib/format";

/**
 * Rechnungen und Geschaeftsbriefe (docs/FUNKTIONSABGLEICH.md R1): Begriffe,
 * Summen, Nummernvorschau, Netto/Brutto-Umrechnung, Mail- und Briefvorlagen
 * und die Dokumentstruktur fuer PDF und Word. Die verbindlichen Regeln
 * (Nummernkreis, Unveraenderlichkeit, Storno) liegen in der Datenbank.
 */

export const RECHNUNG_STATUS = { entwurf: "Entwurf", gestellt: "Gestellt", bezahlt: "Bezahlt", storniert: "Storniert" } as const;
export type RechnungStatus = keyof typeof RECHNUNG_STATUS;

export const MWST_SAETZE = [19, 7, 0] as const;

export const ABSENDER_TYPEN = { firma: "Unternehmen", persoenlich: "Persönlich" } as const;

export interface Absender {
  id: string;
  typ: keyof typeof ABSENDER_TYPEN;
  benutzer_id: string | null;
  name: string;
  zusatz: string | null;
  strasse: string;
  hausnummer: string | null;
  plz: string;
  ort: string;
  land: string;
  email: string | null;
  telefon: string | null;
  web: string | null;
  steuernummer: string | null;
  ust_id: string | null;
  kleinunternehmer: boolean;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
  praefix: string;
  mit_jahr: boolean;
  naechste_nummer: number;
  zahlungsziel_tage: number;
  standard_mwst: number;
  einleitung: string;
  schluss: string | null;
  aktiv: boolean;
}

export interface Kunde { id: string; kontakt_id: string | null; anrede: string | null; name: string; zusatz: string | null; strasse: string | null; plz: string | null; ort: string | null; land: string; email: string | null; ust_id: string | null }

export interface Position { id: string; position: number; beschreibung: string; menge: number; einheit: string | null; einzelpreis_netto: number; mwst_satz: number; netto: number }

export interface Rechnung {
  id: string;
  absender_id: string | null;
  kunde_id: string | null;
  kontakt_id: string | null;
  objekt_id: string | null;
  vertrag_id: string | null;
  typ: "rechnung" | "storno";
  storno_von_id: string | null;
  storniert_durch_id: string | null;
  rechnungsnummer: string | null;
  status: RechnungStatus;
  ist_test: boolean;
  empfaenger_anrede: string | null;
  empfaenger_name: string;
  empfaenger_zusatz: string | null;
  empfaenger_strasse: string | null;
  empfaenger_plz: string | null;
  empfaenger_ort: string | null;
  empfaenger_land: string;
  empfaenger_email: string | null;
  empfaenger_ust_id: string | null;
  ausstellungsdatum: string;
  leistung_von: string | null;
  leistung_bis: string | null;
  zahlungsziel_tage: number;
  faellig_am: string | null;
  einleitung: string | null;
  schluss: string | null;
  netto: number;
  mwst: number;
  brutto: number;
  bezahlt_am: string | null;
  bezahlt_betrag: number | null;
  gestellt_am: string | null;
  storno_grund: string | null;
  absender_snapshot: Partial<Absender> | null;
  pdf_pfad: string | null;
  notiz: string | null;
  erstellt_am: string;
}

/** Summen wie der Datenbank-Trigger: je Position gerundet, Steuer je Satz. */
export function summen(positionen: Pick<Position, "menge" | "einzelpreis_netto" | "mwst_satz">[]): { netto: number; mwst: number; brutto: number; jeSatz: Array<{ satz: number; netto: number; mwst: number }> } {
  const runde = (n: number) => Math.round(n * 100) / 100;
  const jeSatz = new Map<number, { netto: number; mwst: number }>();
  let netto = 0;
  let mwst = 0;
  for (const p of positionen) {
    const n = runde(p.menge * p.einzelpreis_netto);
    const m = runde((n * p.mwst_satz) / 100);
    netto = runde(netto + n);
    mwst = runde(mwst + m);
    const e = jeSatz.get(p.mwst_satz) ?? { netto: 0, mwst: 0 };
    e.netto = runde(e.netto + n);
    e.mwst = runde(e.mwst + m);
    jeSatz.set(p.mwst_satz, e);
  }
  return { netto, mwst, brutto: runde(netto + mwst), jeSatz: [...jeSatz.entries()].map(([satz, e]) => ({ satz, ...e })).sort((a, b) => b.satz - a.satz) };
}

/** Bruttobetrag in Netto umrechnen (centgenau) — fuer die Brutto-Eingabe. */
export function nettoAusBrutto(brutto: number, mwstSatz: number): number {
  return Math.round((brutto / (1 + mwstSatz / 100)) * 100) / 100;
}

/** Vorschau der naechsten Nummer wie in der Datenbankfunktion. */
export function nummerVorschau(a: Pick<Absender, "praefix" | "mit_jahr" | "naechste_nummer">, jahr = new Date().getFullYear()): string {
  return `${a.praefix}-${a.mit_jahr ? `${jahr}-` : ""}${String(Math.max(1, a.naechste_nummer)).padStart(3, "0")}`;
}

export function anredeZeile(anrede: string | null, name: string): string {
  const a = (anrede ?? "").toLowerCase();
  const nachname = name.trim().split(" ").at(-1) ?? name;
  if (a.startsWith("herr")) return `Sehr geehrter Herr ${nachname},`;
  if (a.startsWith("frau")) return `Sehr geehrte Frau ${nachname},`;
  if (a.startsWith("ehe")) return `Sehr geehrte Eheleute ${nachname},`;
  return "Sehr geehrte Damen und Herren,";
}

// --- Mail-Vorlagen zur Rechnung (Referenz MAIL_VORLAGEN) ----------------------------

export const RECHNUNG_MAIL_VORLAGEN = {
  standard: { bezeichnung: "Standard", betreff: (nr: string) => `Ihre Rechnung ${nr}`.trim(), text: (nr: string) => `anbei erhalten Sie die Rechnung ${nr} als PDF.\n\nBei Fragen stehe ich Ihnen gerne zur Verfügung.` },
  zusammenarbeit: { bezeichnung: "Gute Zusammenarbeit", betreff: (nr: string) => `Ihre Rechnung ${nr} – vielen Dank`.trim(), text: (nr: string) => `vielen Dank für die angenehme und vertrauensvolle Zusammenarbeit. Es hat uns gefreut, Sie begleiten zu dürfen.\n\nAnbei erhalten Sie die Rechnung ${nr} als PDF.\n\nWir würden uns freuen, Sie auch in Zukunft wieder unterstützen zu dürfen, und stehen Ihnen bei Fragen jederzeit gerne zur Verfügung.` },
  verkauf: { bezeichnung: "Nach erfolgreichem Verkauf", betreff: (nr: string) => `Ihre Rechnung ${nr} zum erfolgreichen Verkauf`.trim(), text: (nr: string) => `herzlichen Glückwunsch zum erfolgreichen Verkauf Ihrer Immobilie! Wir haben die Vermittlung sehr gerne für Sie übernommen.\n\nAnbei erhalten Sie unsere Rechnung ${nr} über die vereinbarte Provision als PDF.\n\nVielen Dank für Ihr Vertrauen – wir wünschen Ihnen für die Zukunft alles Gute und empfehlen uns gerne weiter.` },
  erinnerung: { bezeichnung: "Freundliche Erinnerung", betreff: (nr: string) => `Erinnerung: Rechnung ${nr}`.trim(), text: (nr: string) => `sicher ist es Ihrer Aufmerksamkeit nur entgangen – unsere Rechnung ${nr} ist noch offen. Wir möchten Sie freundlich daran erinnern.\n\nDie Rechnung finden Sie noch einmal im Anhang. Sollte sich Ihre Zahlung mit dieser Nachricht überschnitten haben, betrachten Sie diese E-Mail bitte als gegenstandslos.` },
} as const;
export type RechnungMailVorlage = keyof typeof RECHNUNG_MAIL_VORLAGEN;

export function rechnungMail(vorlage: RechnungMailVorlage, r: Pick<Rechnung, "rechnungsnummer" | "empfaenger_anrede" | "empfaenger_name">, absender: string, firma: string): { betreff: string; text: string } {
  const v = RECHNUNG_MAIL_VORLAGEN[vorlage];
  const nr = r.rechnungsnummer ?? "";
  return { betreff: v.betreff(nr), text: `${anredeZeile(r.empfaenger_anrede, r.empfaenger_name)}\n\n${v.text(nr)}\n\nMit freundlichen Grüßen\n${absender}\n${firma}` };
}

// --- Brief-Vorlagen (Referenz „Geschaeftsbriefe", Behoerdenanfragen) --------------------

export interface BriefVorlage { bezeichnung: string; gruppe: "behoerde" | "eigentuemer" | "allgemein"; betreff: string; text: string; empfaenger?: string }

/** Platzhalter: {objekt} {adresse} {flurstueck} {gemarkung} {eigentuemer} {firma} {absender} {datum} */
export const BRIEF_VORLAGEN: Record<string, BriefVorlage> = {
  flurkarte: { bezeichnung: "Behörde: Flurkarte / Liegenschaftskarte", gruppe: "behoerde", empfaenger: "Katasteramt / Amt für Bodenmanagement", betreff: "Antrag auf Auszug aus der Liegenschaftskarte — {adresse}", text: "im Auftrag der Eigentümer ({eigentuemer}) bitten wir um einen aktuellen Auszug aus der Liegenschaftskarte (Flurkarte) für das Grundstück {adresse}, Gemarkung {gemarkung}, Flurstück {flurstueck}.\n\nEine Vollmacht der Eigentümer fügen wir bei. Bitte senden Sie den Auszug an die oben genannte Anschrift oder per E-Mail; die Gebühren übernehmen wir.\n\nVielen Dank für Ihre Mühe." },
  grundbuch: { bezeichnung: "Behörde: Grundbuchauszug", gruppe: "behoerde", empfaenger: "Amtsgericht — Grundbuchamt", betreff: "Antrag auf unbeglaubigten Grundbuchauszug — {adresse}", text: "im Auftrag der Eigentümer ({eigentuemer}) beantragen wir einen aktuellen unbeglaubigten Grundbuchauszug für das Grundstück {adresse}, Gemarkung {gemarkung}, Flurstück {flurstueck}.\n\nDas berechtigte Interesse ergibt sich aus dem beigefügten Maklervertrag mit Vollmacht. Die Gebühren übernehmen wir.\n\nVielen Dank." },
  altlasten: { bezeichnung: "Behörde: Altlastenauskunft", gruppe: "behoerde", empfaenger: "Untere Bodenschutzbehörde", betreff: "Auskunft aus dem Altlastenkataster — {adresse}", text: "im Auftrag der Eigentümer ({eigentuemer}) bitten wir um Auskunft, ob für das Grundstück {adresse}, Gemarkung {gemarkung}, Flurstück {flurstueck}, Eintragungen im Altlastenkataster (Altlasten oder altlastverdächtige Flächen) vorliegen.\n\nEine Vollmacht fügen wir bei. Die Gebühren übernehmen wir.\n\nVielen Dank." },
  baulasten: { bezeichnung: "Behörde: Baulastenverzeichnis", gruppe: "behoerde", empfaenger: "Bauaufsichtsbehörde", betreff: "Auskunft aus dem Baulastenverzeichnis — {adresse}", text: "im Auftrag der Eigentümer ({eigentuemer}) bitten wir um Auskunft aus dem Baulastenverzeichnis für das Grundstück {adresse}, Gemarkung {gemarkung}, Flurstück {flurstueck}, sowie um eine Kopie etwaiger Eintragungen.\n\nEine Vollmacht fügen wir bei. Die Gebühren übernehmen wir.\n\nVielen Dank." },
  eigentuemer_unterlagen: { bezeichnung: "Eigentümer: Unterlagen anfordern", gruppe: "eigentuemer", betreff: "Unterlagen für die Vermarktung — {objekt}", text: "vielen Dank für Ihr Vertrauen. Für die Vermarktung von {objekt} benötigen wir noch folgende Unterlagen:\n\n– Grundbuchauszug (nicht älter als drei Monate)\n– Energieausweis\n– Grundrisse und Wohnflächenberechnung\n– Flurkarte\n– bei Wohnungseigentum: Teilungserklärung, Protokolle der letzten drei Eigentümerversammlungen, Wirtschaftsplan\n\nGern beschaffen wir fehlende Unterlagen mit Ihrer Vollmacht bei den Behörden. Melden Sie sich einfach kurz." },
  eigentuemer_bericht: { bezeichnung: "Eigentümer: Vermarktungsbericht", gruppe: "eigentuemer", betreff: "Stand der Vermarktung — {objekt}", text: "gern informieren wir Sie über den aktuellen Stand der Vermarktung von {objekt}:\n\n– Anfragen und Besichtigungen: …\n– Rückmeldungen der Interessenten: …\n– Nächste Schritte: …\n\nBei Fragen erreichen Sie uns jederzeit." },
  dank: { bezeichnung: "Dankschreiben nach Abschluss", gruppe: "allgemein", betreff: "Vielen Dank — {objekt}", text: "herzlichen Glückwunsch und vielen Dank für Ihr Vertrauen. Es hat uns gefreut, Sie bei {objekt} begleiten zu dürfen.\n\nWenn Sie mit unserer Arbeit zufrieden waren, freuen wir uns über eine Empfehlung. Für alle Fragen rund um Ihre Immobilie bleiben wir gern Ihr Ansprechpartner." },
  frei: { bezeichnung: "Freier Brief", gruppe: "allgemein", betreff: "", text: "" },
};

export function briefAusfuellen(v: BriefVorlage, p: Partial<Record<"objekt" | "adresse" | "flurstueck" | "gemarkung" | "eigentuemer" | "firma" | "absender" | "datum", string>>): { betreff: string; text: string } {
  const ersetzen = (s: string) => s.replace(/\{(objekt|adresse|flurstueck|gemarkung|eigentuemer|firma|absender|datum)\}/g, (_, k: keyof typeof p) => p[k] ?? "…");
  return { betreff: ersetzen(v.betreff), text: ersetzen(v.text) };
}

// --- Dokumente ----------------------------------------------------------------------

function absenderZeilen(a: Partial<Absender> | null): string[] {
  if (!a) return [];
  return [[a.name, a.zusatz].filter(Boolean).join(" · "), [a.strasse, a.hausnummer].filter(Boolean).join(" "), [a.plz, a.ort].filter(Boolean).join(" ")].filter(Boolean) as string[];
}

/** Rechnung als Dokument (PDF/Word): Anschrift, Kopfdaten, Positionen, Summen, Steuerhinweis, Zahlungsangaben. */
export function rechnungAlsDokument(r: Rechnung, positionen: Position[], absender: Partial<Absender> | null): Dokument {
  const a = r.absender_snapshot ?? absender;
  const s = summen(positionen);
  const titel = r.typ === "storno" ? "Storno-Rechnung" : r.ist_test ? "Rechnung (TEST)" : "Rechnung";
  const nummer = r.rechnungsnummer ?? "Entwurf — noch ohne Nummer";
  const anschrift = [[r.empfaenger_anrede, r.empfaenger_name].filter(Boolean).join(" "), r.empfaenger_zusatz, r.empfaenger_strasse, [r.empfaenger_plz, r.empfaenger_ort].filter(Boolean).join(" "), r.empfaenger_land !== "Deutschland" ? r.empfaenger_land : null].filter(Boolean) as string[];
  const kopf: string[][] = [
    ["Rechnungsnummer", nummer],
    ["Rechnungsdatum", datum(r.ausstellungsdatum)],
    ...(r.leistung_von ? [["Leistungszeitraum", r.leistung_bis && r.leistung_bis !== r.leistung_von ? `${datum(r.leistung_von)} – ${datum(r.leistung_bis)}` : datum(r.leistung_von)]] : []),
    ...(r.empfaenger_ust_id ? [["USt-IdNr. des Empfängers", r.empfaenger_ust_id]] : []),
    ...(a?.steuernummer ? [["Steuernummer", a.steuernummer]] : []),
    ...(a?.ust_id ? [["USt-IdNr.", a.ust_id]] : []),
    ...(r.storno_von_id ? [["Storno zu", r.einleitung?.replace(/^Storno zur Rechnung /, "").split(":")[0] ?? ""]] : []),
  ];
  const zeilen = positionen.map((p) => [String(p.position), p.beschreibung, `${p.menge.toLocaleString("de-DE")}${p.einheit ? ` ${p.einheit}` : ""}`, euro(p.einzelpreis_netto, true), `${p.mwst_satz} %`, euro(p.netto, true)]);
  const summenZeilen: string[][] = [["Netto", euro(s.netto, true)], ...s.jeSatz.filter((z) => z.satz > 0).map((z) => [`USt ${z.satz} %`, euro(z.mwst, true)]), ["Brutto", euro(s.brutto, true)]];
  const steuerhinweis = a?.kleinunternehmer ? "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet." : s.mwst === 0 && s.netto !== 0 ? "Kein Ausweis von Umsatzsteuer (Steuersatz 0 %)." : null;
  const zahlung = r.typ === "storno"
    ? "Der Betrag wird nicht fällig; bereits gezahlte Beträge werden erstattet."
    : `Bitte überweisen Sie den Betrag von ${euro(s.brutto, true)} ${r.zahlungsziel_tage === 0 ? "sofort" : `bis zum ${datum(r.faellig_am ?? r.ausstellungsdatum)}`} unter Angabe der Rechnungsnummer${a?.iban ? ` auf das Konto ${a.bank_name ?? ""} IBAN ${a.iban}${a.bic ? ` BIC ${a.bic}` : ""}` : ""}.`;
  return {
    titel,
    untertitel: nummer,
    abschnitte: [
      { absaetze: [...absenderZeilen(a).slice(0, 1), "", ...anschrift] },
      { tabelle: { spalten: ["Angabe", "Wert"], zeilen: kopf } },
      { absaetze: [r.einleitung ?? "Sehr geehrte Damen und Herren,\n\nhiermit stellen wir Ihnen folgende Leistungen in Rechnung:"] },
      { tabelle: { spalten: ["Pos.", "Beschreibung", "Menge", "Einzelpreis (netto)", "USt", "Betrag (netto)"], zeilen } },
      { tabelle: { spalten: ["", ""], zeilen: summenZeilen } },
      { absaetze: [steuerhinweis, zahlung, r.schluss, r.status === "bezahlt" && r.bezahlt_am ? `Bezahlt am ${datum(r.bezahlt_am)}.` : null].filter((t): t is string => Boolean(t)) },
    ],
    fussnote: [absenderZeilen(a).join(" · "), [a?.telefon, a?.email, a?.web].filter(Boolean).join(" · "), [a?.steuernummer ? `St.-Nr. ${a.steuernummer}` : null, a?.ust_id ? `USt-IdNr. ${a.ust_id}` : null, a?.iban ? `IBAN ${a.iban}` : null].filter(Boolean).join(" · "), r.ist_test ? "TEST-RECHNUNG — keine Buchung, keine Nummer aus dem Nummernkreis." : null].filter(Boolean).join("\n"),
  };
}

export interface Brief {
  id: string;
  absender_id: string | null;
  kontakt_id: string | null;
  objekt_id: string | null;
  vorlage: string | null;
  empfaenger_name: string;
  empfaenger_zusatz: string | null;
  empfaenger_strasse: string | null;
  empfaenger_plz: string | null;
  empfaenger_ort: string | null;
  empfaenger_email: string | null;
  datum: string;
  betreff: string;
  anrede: string;
  text: string;
  grussformel: string;
  unterzeichner: string | null;
  unterzeichner_funktion: string | null;
  status: "entwurf" | "erstellt" | "versendet";
  versendet_am: string | null;
  pdf_pfad: string | null;
  erstellt_am: string;
}

/** Brief als Dokument im Briefpapier (Kopf und Fuss kommen vom Briefkopf des Mandanten). */
export function briefAlsDokument(b: Brief, absender: Partial<Absender> | null): Dokument {
  const anschrift = [b.empfaenger_name, b.empfaenger_zusatz, b.empfaenger_strasse, [b.empfaenger_plz, b.empfaenger_ort].filter(Boolean).join(" ")].filter(Boolean) as string[];
  return {
    titel: b.betreff,
    abschnitte: [
      { absaetze: [...absenderZeilen(absender).slice(0, 1), "", ...anschrift, "", `${absender?.ort ?? ""}${absender?.ort ? ", " : ""}${datum(b.datum)}`] },
      { absaetze: [b.anrede, ...b.text.replace(/\r/g, "").split(/\n{2,}/)] },
      { absaetze: [b.grussformel, "", [b.unterzeichner, b.unterzeichner_funktion].filter(Boolean).join("\n")].filter((t) => t !== undefined) },
    ],
    fussnote: [absenderZeilen(absender).join(" · "), [absender?.telefon, absender?.email, absender?.web].filter(Boolean).join(" · ")].filter(Boolean).join("\n"),
  };
}
