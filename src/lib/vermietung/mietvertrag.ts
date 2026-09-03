import { euro } from "@/lib/format";
import { MUSTER_HINWEIS } from "@/lib/vertraege";

/**
 * Mietvertrag Wohnraum (docs/FUNKTIONSABGLEICH.md M1): Formulardaten,
 * Vollstaendigkeit, Kautionsvorschlag und der erzeugte Vertragstext (eigenes
 * Muster ohne Rechtsberatung). Der Text wird als Vertrag der Art
 * `mietvertrag` unterzeichnet.
 */

export const PARTEITYPEN = { einzelperson: "Einzelperson", eheleute: "Eheleute", mehrere: "Mehrere Personen", erbengemeinschaft: "Erbengemeinschaft", firma: "Firma / Gesellschaft" } as const;
export type Parteityp = keyof typeof PARTEITYPEN;

export interface MietPerson { anrede: string; name: string; strasse: string; plz: string; ort: string; email: string; geburtsdatum: string }
export interface Partei { typ: Parteityp; personen: MietPerson[]; firma: string; vertreter: string }
export interface Mietobjekt { strasse: string; plz: string; ort: string; lage: string; raeume: string; wohnflaeche: string; zustand: string; ausstattung: string; nebenraeume: string }
export interface Bank { kontoinhaber: string; iban: string; bic: string; institut: string }

export interface MietvertragDaten {
  bezeichnung: string;
  ordner: string;
  vermieter: Partei;
  mieter: Partei;
  objekt: Mietobjekt;
  mietbeginn: string;
  befristet_bis: string;
  grundmiete: number;
  bk_kalt: number;
  bk_warm: number;
  stellplatz: number;
  kaution: number;
  kuendigungsausschluss_monate: number;
  neubau_klausel: boolean;
  bank: Bank;
  besondere_vereinbarungen: string;
}

export const STATUS = { entwurf: "Entwurf", zur_unterschrift: "Zur Unterschrift", unterzeichnet: "Unterzeichnet", beendet: "Beendet" } as const;
export type MietvertragStatus = keyof typeof STATUS;

export function leerePerson(): MietPerson {
  return { anrede: "", name: "", strasse: "", plz: "", ort: "", email: "", geburtsdatum: "" };
}
export function leerePartei(): Partei {
  return { typ: "einzelperson", personen: [leerePerson()], firma: "", vertreter: "" };
}
export function leererMietvertrag(): MietvertragDaten {
  return {
    bezeichnung: "", ordner: "", vermieter: leerePartei(), mieter: leerePartei(),
    objekt: { strasse: "", plz: "", ort: "", lage: "", raeume: "", wohnflaeche: "", zustand: "", ausstattung: "", nebenraeume: "" },
    mietbeginn: "", befristet_bis: "", grundmiete: 0, bk_kalt: 0, bk_warm: 0, stellplatz: 0, kaution: 0,
    kuendigungsausschluss_monate: 0, neubau_klausel: false,
    bank: { kontoinhaber: "", iban: "", bic: "", institut: "" }, besondere_vereinbarungen: "",
  };
}

function zahl(w: unknown): number {
  const n = typeof w === "number" ? w : Number(String(w ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function partei(w: unknown): Partei {
  const leer = leerePartei();
  if (!w || typeof w !== "object") return leer;
  const p = w as Partial<Partei>;
  const personen = Array.isArray(p.personen) && p.personen.length > 0 ? p.personen.map((x) => ({ ...leerePerson(), ...(x as Partial<MietPerson>) })) : leer.personen;
  return { typ: p.typ && p.typ in PARTEITYPEN ? p.typ : "einzelperson", personen, firma: p.firma ?? "", vertreter: p.vertreter ?? "" };
}

/** Datenbankzeile → Formulardaten. */
export function mietvertragAusZeile(z: Record<string, unknown>): MietvertragDaten {
  const leer = leererMietvertrag();
  const obj = (k: string) => (z[k] && typeof z[k] === "object" ? (z[k] as Record<string, unknown>) : {});
  return {
    bezeichnung: String(z["bezeichnung"] ?? ""),
    ordner: String(z["ordner"] ?? ""),
    vermieter: partei(z["vermieter"]),
    mieter: partei(z["mieter"]),
    objekt: { ...leer.objekt, ...(obj("objekt") as Partial<Mietobjekt>) },
    mietbeginn: String(z["mietbeginn"] ?? ""),
    befristet_bis: String(z["befristet_bis"] ?? ""),
    grundmiete: zahl(z["grundmiete"]), bk_kalt: zahl(z["bk_kalt"]), bk_warm: zahl(z["bk_warm"]), stellplatz: zahl(z["stellplatz"]), kaution: zahl(z["kaution"]),
    kuendigungsausschluss_monate: Math.min(48, Math.max(0, Math.round(zahl(z["kuendigungsausschluss_monate"])))),
    neubau_klausel: Boolean(z["neubau_klausel"]),
    bank: { ...leer.bank, ...(obj("bank") as Partial<Bank>) },
    besondere_vereinbarungen: String(z["besondere_vereinbarungen"] ?? ""),
  };
}

export function gesamtmiete(d: Pick<MietvertragDaten, "grundmiete" | "bk_kalt" | "bk_warm" | "stellplatz">): number {
  return Math.round((d.grundmiete + d.bk_kalt + d.bk_warm + d.stellplatz) * 100) / 100;
}

/** § 551 BGB: hoechstens drei Grundmieten. */
export function kautionVorschlag(grundmiete: number): number {
  return Math.round(grundmiete * 3 * 100) / 100;
}

export function parteiName(p: Partei): string {
  if (p.typ === "firma") return p.firma || "—";
  const namen = p.personen.map((x) => x.name.trim()).filter(Boolean);
  if (p.typ === "eheleute" && namen.length > 0) return `Eheleute ${namen.join(" und ")}`;
  return namen.join(", ") || "—";
}

export function fehlendeAngaben(d: MietvertragDaten): string[] {
  const f: string[] = [];
  if (parteiName(d.vermieter) === "—") f.push("Vermieter");
  if (parteiName(d.mieter) === "—") f.push("Mieter");
  if (!d.objekt.strasse.trim()) f.push("Straße des Mietobjekts");
  if (!d.objekt.plz.trim() || !d.objekt.ort.trim()) f.push("PLZ und Ort des Mietobjekts");
  if (!d.objekt.lage.trim()) f.push("Lage im Haus");
  if (!d.objekt.raeume.trim()) f.push("Räume");
  if (!d.objekt.wohnflaeche.trim()) f.push("Wohnfläche");
  if (!d.mietbeginn) f.push("Mietbeginn");
  if (d.grundmiete <= 0) f.push("Grundmiete");
  if (d.kaution > kautionVorschlag(d.grundmiete) + 0.01) f.push("Kaution über drei Grundmieten (§ 551 BGB)");
  return f;
}

function parteiBlock(p: Partei): string {
  if (p.typ === "firma") return `${p.firma}${p.vertreter ? `, vertreten durch ${p.vertreter}` : ""}`;
  return p.personen
    .filter((x) => x.name.trim())
    .map((x) => {
      const anschrift = [x.strasse, [x.plz, x.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return `${[x.anrede, x.name].filter(Boolean).join(" ")}${x.geburtsdatum ? `, geb. ${x.geburtsdatum}` : ""}${anschrift ? `, ${anschrift}` : ""}`;
    })
    .join("\n");
}

function datumText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("de-DE");
}

export function mietvertragText(d: MietvertragDaten): string {
  const o = d.objekt;
  const gesamt = gesamtmiete(d);
  const adresse = [o.strasse, [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const bank = d.bank.iban ? `Zahlung auf das Konto ${d.bank.kontoinhaber || "des Vermieters"}, IBAN ${d.bank.iban}${d.bank.bic ? `, BIC ${d.bank.bic}` : ""}${d.bank.institut ? ` (${d.bank.institut})` : ""}.` : "Die Bankverbindung teilt der Vermieter dem Mieter in Textform mit.";
  return [
    `Hinweis: ${MUSTER_HINWEIS}`,
    "",
    "MIETVERTRAG FÜR WOHNRAUM",
    "",
    "zwischen",
    parteiBlock(d.vermieter),
    "— nachfolgend „Vermieter“ —",
    "",
    "und",
    parteiBlock(d.mieter),
    "— nachfolgend „Mieter“ —",
    "",
    "§ 1 Mietsache",
    `Vermietet wird die Wohnung ${adresse}${o.lage ? `, ${o.lage}` : ""}, bestehend aus ${o.raeume || "—"}, Wohnfläche ca. ${o.wohnflaeche || "—"} m².${o.nebenraeume ? ` Mitvermietet: ${o.nebenraeume}.` : ""}${o.ausstattung ? ` Ausstattung: ${o.ausstattung}.` : ""}`,
    o.zustand ? `Zustand bei Übergabe: ${o.zustand}. Einzelheiten hält das Übergabeprotokoll fest.` : "Den Zustand bei Übergabe hält das Übergabeprotokoll fest.",
    "Die Wohnung wird ausschließlich zu Wohnzwecken vermietet.",
    "",
    "§ 2 Mietzeit",
    d.befristet_bis
      ? `Das Mietverhältnis beginnt am ${datumText(d.mietbeginn)} und endet am ${datumText(d.befristet_bis)}. Der Befristungsgrund nach § 575 BGB wird dem Mieter bei Vertragsschluss schriftlich mitgeteilt.`
      : `Das Mietverhältnis beginnt am ${datumText(d.mietbeginn)} und läuft auf unbestimmte Zeit. Es gelten die gesetzlichen Kündigungsfristen (§ 573c BGB).`,
    ...(d.kuendigungsausschluss_monate > 0 ? [`Beide Parteien verzichten für ${d.kuendigungsausschluss_monate} Monate ab Mietbeginn auf die ordentliche Kündigung; das Recht zur außerordentlichen Kündigung bleibt unberührt.`] : []),
    "",
    "§ 3 Miete und Betriebskosten",
    `Die monatliche Grundmiete beträgt ${euro(d.grundmiete)}.`,
    `Hinzu kommen Vorauszahlungen auf die kalten Betriebskosten von ${euro(d.bk_kalt)} und auf Heizung und Warmwasser von ${euro(d.bk_warm)}${d.stellplatz > 0 ? ` sowie ${euro(d.stellplatz)} für den Stellplatz` : ""}.`,
    `Gesamtmiete monatlich: ${euro(gesamt)}, fällig im Voraus bis zum dritten Werktag eines Monats. ${bank}`,
    "Über die Betriebskosten wird jährlich abgerechnet (§ 556 BGB). Umlagefähig sind die Kosten nach § 2 Betriebskostenverordnung.",
    "",
    "§ 4 Kaution",
    d.kaution > 0
      ? `Der Mieter leistet eine Kaution von ${euro(d.kaution)} (höchstens drei Grundmieten, § 551 BGB). Sie kann in drei gleichen monatlichen Raten gezahlt werden; die erste Rate ist zu Beginn des Mietverhältnisses fällig. Der Vermieter legt die Kaution getrennt von seinem Vermögen zum üblichen Zinssatz an.`
      : "Eine Kaution wird nicht vereinbart.",
    "",
    "§ 5 Schönheitsreparaturen und Instandhaltung",
    "Der Vermieter hält die Mietsache instand. Schönheitsreparaturen während der Mietzeit trägt der Mieter nur, soweit die Wohnung renoviert übergeben wurde und der Bedarf durch seinen Gebrauch entstanden ist. Kleinreparaturen an Gegenständen, die dem häufigen Zugriff des Mieters unterliegen, trägt der Mieter bis 100 € je Einzelfall, höchstens 8 % der Jahresgrundmiete.",
    "",
    "§ 6 Nutzung, Tierhaltung, Untervermietung",
    "Bauliche Veränderungen, Tierhaltung über Kleintiere hinaus und Untervermietung bedürfen der Zustimmung des Vermieters in Textform; die Zustimmung darf nur aus sachlichem Grund verweigert werden.",
    "",
    ...(d.neubau_klausel ? [
      "§ 7 Neubau",
      "Die Mietsache ist ein Neubau. Restarbeiten am Gebäude und an den Außenanlagen können nach Mietbeginn ausgeführt werden; der Mieter duldet sie. Setzrisse, die in den ersten Jahren nach Fertigstellung entstehen, sind bautypisch und begründen keine Minderung, soweit sie die Gebrauchstauglichkeit nicht beeinträchtigen. Der Vermieter beseitigt sie im Rahmen der Gewährleistung.",
      "",
    ] : []),
    `§ ${d.neubau_klausel ? 8 : 7} Übergabe und Rückgabe`,
    "Über Übergabe und Rückgabe wird ein Protokoll mit Zählerständen und Schlüsseln erstellt. Der Mieter gibt die Wohnung besenrein und mit allen Schlüsseln zurück.",
    "",
    `§ ${d.neubau_klausel ? 9 : 8} Sonstiges`,
    d.besondere_vereinbarungen.trim() || "Keine besonderen Vereinbarungen.",
    "Änderungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Der Vermieter verarbeitet personenbezogene Daten des Mieters zur Durchführung des Mietverhältnisses.",
  ].join("\n");
}

export function mietvertragTitel(d: MietvertragDaten): string {
  return d.bezeichnung.trim() || `Mietvertrag ${[d.objekt.strasse, d.objekt.ort].filter(Boolean).join(", ") || "ohne Adresse"}`;
}
