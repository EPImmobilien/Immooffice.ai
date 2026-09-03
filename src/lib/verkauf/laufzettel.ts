import type { Dokument } from "@/lib/dokument/struktur";

/**
 * Notar-Laufzettel (Kaufabwicklung, docs/FUNKTIONSABGLEICH.md V2): acht
 * Schritte, die alles sammeln, was das Notariat fuer den Kaufvertragsentwurf
 * braucht — Immobilie, Verkaeufer, Kaeufer, Kaufpreis und Bank, Sonstiges,
 * Anhaenge mit KI-Auswertung, Beauftragung, Abschluss.
 */

export const SCHRITTE = [
  { nr: 1, titel: "Immobilie" },
  { nr: 2, titel: "Verkäufer" },
  { nr: 3, titel: "Käufer" },
  { nr: 4, titel: "Kaufpreis & Bank" },
  { nr: 5, titel: "Sonstiges" },
  { nr: 6, titel: "Anhänge" },
  { nr: 7, titel: "Beauftragung" },
  { nr: 8, titel: "Abschluss" },
] as const;

export const STATUS = { entwurf: "Entwurf", bereit: "Bereit für Notar", versendet: "An Notar versendet", abgeschlossen: "Abgeschlossen" } as const;
export type LaufzettelStatus = keyof typeof STATUS;

export const ANHANG_KATEGORIEN: Record<string, string> = {
  grundbuchauszug: "Grundbuchauszug",
  flurkarte: "Flurkarte / Liegenschaftskarte",
  teilungserklaerung: "Teilungserklärung",
  energieausweis: "Energieausweis",
  baulasten: "Baulastenverzeichnis",
  altlasten: "Altlastenauskunft",
  ausweis: "Ausweiskopie",
  vollmacht: "Vollmacht",
  erbschein: "Erbschein",
  mietvertrag: "Mietvertrag",
  sonstiges: "Sonstiges",
};

export interface Partei {
  art: "privat" | "gesellschaft";
  anrede: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  geburtsname: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  steuer_id: string;
  familienstand: string;
  ehepartner_beteiligt: boolean;
  ehevertrag: boolean;
  ehe_auslandsbezug: boolean;
  gesellschaft_name: string;
  gesellschaft_rechtsform: string;
  gesellschaft_register: string;
  gesellschaft_sitz: string;
  vertreter: string;
  koerperlich_eingeschraenkt: string;
  dolmetscher_sprache: string;
  politisch_exponiert: boolean;
  handelt_fremde_rechnung: boolean;
  handelt_als_unternehmer: boolean;
  bemerkung: string;
}

export interface Immobilie {
  anschrift: string;
  plz: string;
  ort: string;
  grundbuch_amt: string;
  grundbuch_blatt: string;
  gemarkung: string;
  flur: string;
  flurstueck: string;
  groesse_qm: string;
  bebaut: "bebaut" | "unbebaut";
  wohnungseigentum: boolean;
  sondereigentum_nr: string;
  miteigentumsanteil: string;
  sondernutzungsrechte: string;
  verwalter_name: string;
  verwalter_anschrift: string;
  vermietet: boolean;
  mieter_name: string;
  mieter_vorkaufsrecht: boolean;
  denkmalschutz: boolean;
  bodendenkmal: boolean;
  fertiggestellt_5_jahre: boolean;
  energieausweis_liegt_vor: boolean;
  bauliche_veraenderungen: string;
  letzte_besichtigung: string;
}

export interface Kaufpreis {
  gesamt: string;
  davon_bewegliche: string;
  bewegliche_art: string;
  aufteilung_grund: string;
  aufteilung_gebaeude: string;
  erwerb_quoten: string;
  zahlungszeitpunkt: string;
  bereits_geleistet: string;
  finanzierung: "eigenmittel" | "bank" | "gemischt";
  bank_name: string;
  bank_anschrift: string;
  grundschuld_regelung: string;
  lasten_belassen: "loeschen" | "belassen" | "nicht_sicher";
  raeumung: "schnellstmoeglich" | "datum" | "vermietet";
  raeumung_bis: string;
  vermessungskosten_traeger: "kaeufer" | "verkaeufer" | "je_haelfte";
}

export interface Sonstiges {
  notar_name: string;
  notar_kanzlei: string;
  notar_anschrift: string;
  notar_email: string;
  makler_provision_kaeufer: string;
  makler_provision_verkaeufer: string;
  kaeufer_verkaeufer_verwandt: boolean;
  verwandtschaft: string;
  reparaturen_durch_verkaeufer: string;
  besonderheiten: string;
}

export interface Beauftragung {
  art: "entwurf" | "vorabinfo";
  besprechungstermin_gewuenscht: boolean;
  besprechungstermin: string;
  ausfueller_name: string;
  ausfueller_email: string;
  ausfueller_telefon: string;
  entwurf_an: { verkaeufer: boolean; kaeufer: boolean; makler: boolean };
  versandweg: "email" | "post";
}

export interface Anhang {
  id: string;
  name: string;
  pfad: string;
  mime: string;
  bytes: number;
  kategorie: string;
  ki_auswertung: string | null;
  hochgeladen_am: string;
}

export interface Laufzettel {
  immobilie: Immobilie;
  verkaeufer: Partei[];
  kaeufer: Partei[];
  kaufpreis: Kaufpreis;
  sonstiges: Sonstiges;
  beauftragung: Beauftragung;
}

export function leerePartei(): Partei {
  return {
    art: "privat", anrede: "", vorname: "", nachname: "", geburtsdatum: "", geburtsname: "", strasse: "", plz: "", ort: "", telefon: "", email: "", steuer_id: "",
    familienstand: "", ehepartner_beteiligt: false, ehevertrag: false, ehe_auslandsbezug: false,
    gesellschaft_name: "", gesellschaft_rechtsform: "", gesellschaft_register: "", gesellschaft_sitz: "", vertreter: "",
    koerperlich_eingeschraenkt: "", dolmetscher_sprache: "", politisch_exponiert: false, handelt_fremde_rechnung: false, handelt_als_unternehmer: false, bemerkung: "",
  };
}

export function leererLaufzettel(): Laufzettel {
  return {
    immobilie: {
      anschrift: "", plz: "", ort: "", grundbuch_amt: "", grundbuch_blatt: "", gemarkung: "", flur: "", flurstueck: "", groesse_qm: "", bebaut: "bebaut",
      wohnungseigentum: false, sondereigentum_nr: "", miteigentumsanteil: "", sondernutzungsrechte: "", verwalter_name: "", verwalter_anschrift: "",
      vermietet: false, mieter_name: "", mieter_vorkaufsrecht: false, denkmalschutz: false, bodendenkmal: false, fertiggestellt_5_jahre: false,
      energieausweis_liegt_vor: false, bauliche_veraenderungen: "", letzte_besichtigung: "",
    },
    verkaeufer: [leerePartei()],
    kaeufer: [leerePartei()],
    kaufpreis: {
      gesamt: "", davon_bewegliche: "", bewegliche_art: "", aufteilung_grund: "", aufteilung_gebaeude: "", erwerb_quoten: "", zahlungszeitpunkt: "", bereits_geleistet: "",
      finanzierung: "bank", bank_name: "", bank_anschrift: "", grundschuld_regelung: "", lasten_belassen: "loeschen", raeumung: "schnellstmoeglich", raeumung_bis: "", vermessungskosten_traeger: "kaeufer",
    },
    sonstiges: { notar_name: "", notar_kanzlei: "", notar_anschrift: "", notar_email: "", makler_provision_kaeufer: "", makler_provision_verkaeufer: "", kaeufer_verkaeufer_verwandt: false, verwandtschaft: "", reparaturen_durch_verkaeufer: "", besonderheiten: "" },
    beauftragung: { art: "entwurf", besprechungstermin_gewuenscht: false, besprechungstermin: "", ausfueller_name: "", ausfueller_email: "", ausfueller_telefon: "", entwurf_an: { verkaeufer: true, kaeufer: true, makler: true }, versandweg: "email" },
  };
}

function tief<T extends object>(vorgabe: T, wert: unknown): T {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) return vorgabe;
  const aus = wert as Record<string, unknown>;
  const erg: Record<string, unknown> = { ...(vorgabe as Record<string, unknown>) };
  for (const k of Object.keys(vorgabe)) {
    const v = aus[k];
    const vg = (vorgabe as Record<string, unknown>)[k];
    if (v === undefined) continue;
    erg[k] = vg && typeof vg === "object" && !Array.isArray(vg) ? tief(vg as object, v) : v;
  }
  return erg as T;
}

export function laufzettelAusDaten(daten: unknown): Laufzettel {
  const leer = leererLaufzettel();
  const d = (daten && typeof daten === "object" ? daten : {}) as Record<string, unknown>;
  const parteien = (w: unknown): Partei[] => (Array.isArray(w) && w.length > 0 ? w.map((p) => tief(leerePartei(), p)) : [leerePartei()]);
  return {
    immobilie: tief(leer.immobilie, d["immobilie"]),
    verkaeufer: parteien(d["verkaeufer"]),
    kaeufer: parteien(d["kaeufer"]),
    kaufpreis: tief(leer.kaufpreis, d["kaufpreis"]),
    sonstiges: tief(leer.sonstiges, d["sonstiges"]),
    beauftragung: tief(leer.beauftragung, d["beauftragung"]),
  };
}

export function parteiName(p: Partei): string {
  if (p.art === "gesellschaft") return [p.gesellschaft_name, p.gesellschaft_rechtsform].filter(Boolean).join(" ") || "Gesellschaft";
  return [p.anrede, p.vorname, p.nachname].filter(Boolean).join(" ").trim();
}

export function fehlendeAngaben(l: Laufzettel): string[] {
  const f: string[] = [];
  if (!l.immobilie.anschrift.trim()) f.push("Anschrift der Immobilie");
  if (!l.immobilie.grundbuch_blatt.trim() && !l.immobilie.gemarkung.trim()) f.push("Grundbuch oder Gemarkung");
  if (l.verkaeufer.every((p) => !parteiName(p).trim())) f.push("Mindestens ein Verkäufer");
  if (l.kaeufer.every((p) => !parteiName(p).trim())) f.push("Mindestens ein Käufer");
  if (!l.kaufpreis.gesamt.trim()) f.push("Kaufpreis");
  if (l.kaufpreis.finanzierung !== "eigenmittel" && !l.kaufpreis.bank_name.trim()) f.push("Finanzierende Bank");
  if (!l.sonstiges.notar_kanzlei.trim() && !l.sonstiges.notar_name.trim()) f.push("Notariat");
  if (!l.beauftragung.ausfueller_name.trim()) f.push("Ansprechpartner für Rückfragen");
  return f;
}

export function euroText(w: string): string {
  const n = Number(String(w).replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : w || "—";
}

/** Begleitschreiben an das Notariat — Text fuer E-Mail oder Brief. */
export function notarAnschreiben(l: Laufzettel, absender: { name: string; firma: string; telefon: string; email: string }): { betreff: string; text: string } {
  const objekt = [l.immobilie.anschrift, [l.immobilie.plz, l.immobilie.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const anrede = l.sonstiges.notar_kanzlei || l.sonstiges.notar_name
    ? `Sehr geehrte Damen und Herren${l.sonstiges.notar_kanzlei ? ` der Kanzlei ${l.sonstiges.notar_kanzlei}` : ""},`
    : "Sehr geehrte Damen und Herren,";
  const zeilen = [
    anrede,
    "",
    `anbei erhalten Sie die Begleitinformationen zum geplanten Kaufvertrag über das Objekt ${objekt || "(Anschrift folgt)"}.`,
    "",
    `Verkäufer: ${l.verkaeufer.map(parteiName).filter(Boolean).join("; ") || "—"}`,
    `Käufer: ${l.kaeufer.map(parteiName).filter(Boolean).join("; ") || "—"}`,
    `Kaufpreis: ${euroText(l.kaufpreis.gesamt)}${l.kaufpreis.davon_bewegliche ? ` (davon bewegliche Sachen ${euroText(l.kaufpreis.davon_bewegliche)})` : ""}`,
    `Finanzierung: ${l.kaufpreis.finanzierung === "eigenmittel" ? "Eigenmittel" : l.kaufpreis.bank_name ? `über ${l.kaufpreis.bank_name}` : "über eine Bank (Angaben folgen)"}`,
    "",
    l.beauftragung.art === "entwurf"
      ? "Wir bitten Sie, einen Kaufvertragsentwurf vorzubereiten und den Beteiligten zuzuleiten."
      : "Diese Nachricht dient zunächst nur der Vorabinformation; ein Vertragsentwurf ist noch nicht beauftragt.",
    l.beauftragung.besprechungstermin_gewuenscht
      ? `Ein Besprechungstermin wird gewünscht${l.beauftragung.besprechungstermin ? ` (Vorschlag: ${l.beauftragung.besprechungstermin})` : ""}.`
      : "",
    "",
    "Alle weiteren Angaben zu Grundbuch, Zahlungsmodalitäten, Belastungen und Räumung entnehmen Sie bitte dem beigefügten Laufzettel.",
    "",
    "Mit freundlichen Grüßen",
    absender.name,
    absender.firma,
    [absender.telefon, absender.email].filter(Boolean).join(" · "),
  ].filter((z, i, a) => !(z === "" && a[i - 1] === ""));
  return { betreff: `Kaufvertrag – Begleitinformationen${objekt ? ` – ${objekt}` : ""}`, text: zeilen.join("\n") };
}

function jaNein(b: boolean): string { return b ? "ja" : "nein"; }

function parteiZeilen(p: Partei): string[][] {
  if (p.art === "gesellschaft") {
    return [
      ["Gesellschaft", parteiName(p)],
      ["Register / Sitz", [p.gesellschaft_register, p.gesellschaft_sitz].filter(Boolean).join(", ") || "—"],
      ["Vertreten durch", p.vertreter || "—"],
      ["Anschrift", [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"],
      ["Kontakt", [p.telefon, p.email].filter(Boolean).join(" · ") || "—"],
    ];
  }
  return [
    ["Name", parteiName(p) || "—"],
    ["Geburtsdatum / Geburtsname", [p.geburtsdatum, p.geburtsname].filter(Boolean).join(" / ") || "—"],
    ["Anschrift", [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"],
    ["Kontakt", [p.telefon, p.email].filter(Boolean).join(" · ") || "—"],
    ["Steuer-ID", p.steuer_id || "—"],
    ["Familienstand", [p.familienstand, p.ehepartner_beteiligt ? "Ehepartner beteiligt" : "", p.ehevertrag ? "Ehevertrag" : "", p.ehe_auslandsbezug ? "Ehe mit Auslandsbezug" : ""].filter(Boolean).join(", ") || "—"],
    ["Besonderheiten", [p.koerperlich_eingeschraenkt ? `körperlich eingeschränkt: ${p.koerperlich_eingeschraenkt}` : "", p.dolmetscher_sprache ? `Dolmetscher: ${p.dolmetscher_sprache}` : "", p.politisch_exponiert ? "politisch exponiert" : "", p.handelt_fremde_rechnung ? "handelt für fremde Rechnung" : "", p.handelt_als_unternehmer ? "handelt als Unternehmer" : "", p.bemerkung].filter(Boolean).join("; ") || "—"],
  ];
}

export function laufzettelAlsDokument(l: Laufzettel, anhaenge: Anhang[]): Dokument {
  const i = l.immobilie; const k = l.kaufpreis; const s = l.sonstiges; const b = l.beauftragung;
  return {
    titel: "Notar-Laufzettel",
    untertitel: [i.anschrift, [i.plz, i.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    abschnitte: [
      { ueberschrift: "I. Immobilie", tabelle: { spalten: ["Angabe", "Wert"], zeilen: [
        ["Anschrift", [i.anschrift, [i.plz, i.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"],
        ["Grundbuch", [i.grundbuch_amt, i.grundbuch_blatt ? `Blatt ${i.grundbuch_blatt}` : ""].filter(Boolean).join(", ") || "—"],
        ["Gemarkung / Flur / Flurstück", [i.gemarkung, i.flur, i.flurstueck].filter(Boolean).join(" / ") || "—"],
        ["Größe", i.groesse_qm ? `${i.groesse_qm} m²` : "—"],
        ["Art", `${i.bebaut === "bebaut" ? "bebaut" : "unbebaut"}${i.wohnungseigentum ? `, Wohnungseigentum Nr. ${i.sondereigentum_nr || "—"}, Miteigentumsanteil ${i.miteigentumsanteil || "—"}` : ""}`],
        ["Sondernutzungsrechte", i.sondernutzungsrechte || "—"],
        ["Verwalter", [i.verwalter_name, i.verwalter_anschrift].filter(Boolean).join(", ") || "—"],
        ["Vermietet", i.vermietet ? `ja — ${i.mieter_name || "Mieter unbekannt"}${i.mieter_vorkaufsrecht ? ", Vorkaufsrecht des Mieters" : ""}` : "nein"],
        ["Denkmalschutz / Bodendenkmal", `${jaNein(i.denkmalschutz)} / ${jaNein(i.bodendenkmal)}`],
        ["Fertigstellung/Sanierung < 5 Jahre", jaNein(i.fertiggestellt_5_jahre)],
        ["Energieausweis liegt vor", jaNein(i.energieausweis_liegt_vor)],
        ["Bauliche Veränderungen", i.bauliche_veraenderungen || "—"],
        ["Letzte Besichtigung", i.letzte_besichtigung || "—"],
      ] } },
      ...l.verkaeufer.map((p, n) => ({ ueberschrift: `II. Verkäufer ${l.verkaeufer.length > 1 ? n + 1 : ""}`.trim(), tabelle: { spalten: ["Angabe", "Wert"], zeilen: parteiZeilen(p) } })),
      ...l.kaeufer.map((p, n) => ({ ueberschrift: `III. Käufer ${l.kaeufer.length > 1 ? n + 1 : ""}`.trim(), tabelle: { spalten: ["Angabe", "Wert"], zeilen: parteiZeilen(p) } })),
      { ueberschrift: "IV. Kaufpreis und Finanzierung", tabelle: { spalten: ["Angabe", "Wert"], zeilen: [
        ["Gesamtkaufpreis", euroText(k.gesamt)],
        ["Davon bewegliche Sachen", k.davon_bewegliche ? `${euroText(k.davon_bewegliche)}${k.bewegliche_art ? ` (${k.bewegliche_art})` : ""}` : "—"],
        ["Aufteilung Grund / Gebäude", [k.aufteilung_grund, k.aufteilung_gebaeude].filter(Boolean).join(" / ") || "—"],
        ["Erwerbsquoten", k.erwerb_quoten || "—"],
        ["Zahlungszeitpunkt", k.zahlungszeitpunkt || "—"],
        ["Bereits geleistete Zahlungen", k.bereits_geleistet ? euroText(k.bereits_geleistet) : "keine"],
        ["Finanzierung", k.finanzierung === "eigenmittel" ? "Eigenmittel" : `${k.finanzierung === "bank" ? "Bank" : "gemischt"}: ${[k.bank_name, k.bank_anschrift].filter(Boolean).join(", ") || "—"}`],
        ["Grundschuldregelung", k.grundschuld_regelung || "—"],
        ["Eingetragene Lasten", k.lasten_belassen === "loeschen" ? "löschen" : k.lasten_belassen === "belassen" ? "belassen" : "noch nicht sicher"],
        ["Räumung / Übergabe", k.raeumung === "schnellstmoeglich" ? "schnellstmöglich nach Kaufpreiszahlung" : k.raeumung === "datum" ? `nach dem ${k.raeumung_bis || "—"}` : "vermietet, Übergang des Mietverhältnisses"],
        ["Vermessungskosten", k.vermessungskosten_traeger === "kaeufer" ? "Käufer" : k.vermessungskosten_traeger === "verkaeufer" ? "Verkäufer" : "je zur Hälfte"],
      ] } },
      { ueberschrift: "V. Sonstiges", tabelle: { spalten: ["Angabe", "Wert"], zeilen: [
        ["Notariat", [s.notar_kanzlei, s.notar_name, s.notar_anschrift, s.notar_email].filter(Boolean).join(", ") || "—"],
        ["Maklerprovision Käufer / Verkäufer", [s.makler_provision_kaeufer || "—", s.makler_provision_verkaeufer || "—"].join(" / ")],
        ["Käufer und Verkäufer verwandt", s.kaeufer_verkaeufer_verwandt ? `ja — ${s.verwandtschaft || "—"}` : "nein"],
        ["Reparaturen durch Verkäufer", s.reparaturen_durch_verkaeufer || "—"],
        ["Besonderheiten", s.besonderheiten || "—"],
      ] } },
      { ueberschrift: "VI. Anhänge", tabelle: { spalten: ["Kategorie", "Datei", "Auswertung"], zeilen: anhaenge.map((a) => [ANHANG_KATEGORIEN[a.kategorie] ?? a.kategorie, a.name, a.ki_auswertung ? a.ki_auswertung.slice(0, 200) : "—"]) }, absaetze: anhaenge.length === 0 ? ["Keine Anhänge."] : [] },
      { ueberschrift: "VII. Beauftragung", absaetze: [
        b.art === "entwurf" ? "Das Notariat wird gebeten, einen Kaufvertragsentwurf vorzubereiten (kostenpflichtig)." : "Nur Vorabinformation — ein Entwurf ist noch nicht beauftragt.",
        `Entwurf an: ${[b.entwurf_an.verkaeufer ? "Verkäufer" : "", b.entwurf_an.kaeufer ? "Käufer" : "", b.entwurf_an.makler ? "Makler" : ""].filter(Boolean).join(", ") || "—"} (${b.versandweg === "email" ? "per E-Mail" : "per Post"}).`,
        b.besprechungstermin_gewuenscht ? `Besprechungstermin gewünscht${b.besprechungstermin ? `: ${b.besprechungstermin}` : ""}.` : "Kein Besprechungstermin gewünscht.",
        `Rückfragen an: ${[b.ausfueller_name, b.ausfueller_telefon, b.ausfueller_email].filter(Boolean).join(" · ") || "—"}`,
      ] },
    ],
    fussnote: "Zusammenstellung durch den Makler auf Grundlage der Angaben der Beteiligten — ohne Gewähr; maßgeblich ist der notarielle Kaufvertrag.",
  };
}
