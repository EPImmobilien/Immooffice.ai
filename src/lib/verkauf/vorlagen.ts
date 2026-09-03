import { z } from "zod";

import { euro } from "@/lib/format";
import { MUSTER_HINWEIS } from "@/lib/vertraege";

/**
 * Strukturierte Vertragsvorlagen des Verkaufs (docs/FUNKTIONSABGLEICH.md V1):
 * Maklervertrag mit Verkaeufertypen und Provisionsmodellen, Vollmacht,
 * Objektnachweis. Aus den Formulardaten entsteht der Vertragstext, der wie
 * bisher unterzeichnet wird (`vertraege.inhalt`); die Daten selbst bleiben in
 * `vertraege.daten` fuer Folgedokumente (Laufzettel, Uebergabe, Rechnung).
 *
 * Alle Texte sind eigene Muster ohne Rechtsberatung — MUSTER_HINWEIS steht in
 * jedem Dokument an erster Stelle.
 */

export const VERKAEUFERTYPEN = {
  einzelperson: "Einzelperson",
  eheleute: "Eheleute",
  mehrere: "Mehrere Eigentümer",
  erbengemeinschaft: "Erbengemeinschaft",
  firma: "Firma / Gesellschaft",
} as const;
export type VerkaeuferTyp = keyof typeof VERKAEUFERTYPEN;

export const PROVISIONSMODELLE = {
  teilung: "Teilung — Käufer und Verkäufer je zur Hälfte (§ 656c BGB)",
  verkaeufer: "Nur Verkäufer (Innenprovision)",
  kaeufer: "Nur Käufer (Außenprovision)",
} as const;
export type Provisionsmodell = keyof typeof PROVISIONSMODELLE;

export const personSchema = z.object({
  anrede: z.string().trim().max(20).default(""),
  name: z.string().trim().min(1, "Name fehlt").max(200),
  strasse: z.string().trim().max(200).default(""),
  plz: z.string().trim().max(10).default(""),
  ort: z.string().trim().max(120).default(""),
  email: z.string().trim().max(200).default(""),
});
export type Person = z.infer<typeof personSchema>;

export const objektAngabenSchema = z.object({
  bezeichnung: z.string().trim().max(200).default(""),
  strasse: z.string().trim().max(200).default(""),
  plz: z.string().trim().max(10).default(""),
  ort: z.string().trim().max(120).default(""),
  grundbuch: z.string().trim().max(200).default(""),
  wohnung_oder_efh: z.boolean().default(true),
});
export type ObjektAngaben = z.infer<typeof objektAngabenSchema>;

export const maklervertragSchema = z.object({
  vertragsart: z.enum(["verkauf", "vermietung"]).default("verkauf"),
  verkaeufer_typ: z.enum(["einzelperson", "eheleute", "mehrere", "erbengemeinschaft", "firma"]).default("einzelperson"),
  personen: z.array(personSchema).min(1, "Mindestens eine Person"),
  firma: z.object({
    name: z.string().trim().max(200).default(""),
    register: z.string().trim().max(120).default(""),
    vertreter: z.string().trim().max(200).default(""),
  }).default({ name: "", register: "", vertreter: "" }),
  objekt: objektAngabenSchema,
  angebotspreis: z.number().nonnegative().nullable().default(null),
  laufzeit_monate: z.number().int().min(1).max(36).default(6),
  provision_prozent: z.number().min(0).max(20).default(3.57),
  provisionsmodell: z.enum(["teilung", "verkaeufer", "kaeufer"]).default("teilung"),
  alleineigentum: z.boolean().default(true),
  verbraucher: z.boolean().default(true),
  vollmacht_mitgenerieren: z.boolean().default(false),
  untervollmacht: z.boolean().default(false),
});
export type MaklervertragDaten = z.infer<typeof maklervertragSchema>;

export const objektnachweisSchema = z.object({
  kaeufer: z.array(personSchema).min(1, "Mindestens ein Interessent"),
  objekt: objektAngabenSchema,
  angebotspreis: z.number().nonnegative().nullable().default(null),
  provision_prozent: z.number().min(0).max(20).default(3.57),
  besichtigt_am: z.string().trim().max(10).default(""),
  ausweis_geprueft: z.boolean().default(false),
  verbraucher: z.boolean().default(true),
});
export type ObjektnachweisDaten = z.infer<typeof objektnachweisSchema>;

export interface Auftraggeberfirma {
  firmenname: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  vertreter: string;
}

export const LEERE_PERSON: Person = { anrede: "", name: "", strasse: "", plz: "", ort: "", email: "" };

export function leeresObjekt(): ObjektAngaben {
  return { bezeichnung: "", strasse: "", plz: "", ort: "", grundbuch: "", wohnung_oder_efh: true };
}

/** Leeres Formular — bewusst ohne Schema-Pruefung, die verlangt einen Namen. */
export function leererMaklervertrag(): MaklervertragDaten {
  return {
    vertragsart: "verkauf", verkaeufer_typ: "einzelperson", personen: [{ ...LEERE_PERSON }],
    firma: { name: "", register: "", vertreter: "" }, objekt: leeresObjekt(),
    angebotspreis: null, laufzeit_monate: 6, provision_prozent: 3.57, provisionsmodell: "teilung",
    alleineigentum: true, verbraucher: true, vollmacht_mitgenerieren: false, untervollmacht: false,
  };
}

export function leererObjektnachweis(): ObjektnachweisDaten {
  return { kaeufer: [{ ...LEERE_PERSON }], objekt: leeresObjekt(), angebotspreis: null, provision_prozent: 3.57, besichtigt_am: "", ausweis_geprueft: false, verbraucher: true };
}

function personZeile(p: Person): string {
  const anschrift = [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return `${[p.anrede, p.name].filter(Boolean).join(" ")}${anschrift ? `, ${anschrift}` : ""}`;
}

function firmaZeile(f: Auftraggeberfirma): string {
  const anschrift = [[f.strasse, f.hausnummer].filter(Boolean).join(" "), [f.plz, f.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return `${f.firmenname}${anschrift ? `, ${anschrift}` : ""}${f.vertreter ? `, vertreten durch ${f.vertreter}` : ""}`;
}

function objektZeile(o: ObjektAngaben): string {
  const adresse = [o.strasse, [o.plz, o.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [o.bezeichnung, adresse, o.grundbuch ? `Grundbuch: ${o.grundbuch}` : ""].filter(Boolean).join(" — ");
}

/** Bezeichnung der Auftraggeberseite je Verkaeufertyp. */
export function auftraggeberBezeichnung(d: MaklervertragDaten): string {
  if (d.verkaeufer_typ === "firma") return d.firma.name || "die Auftraggeberin";
  if (d.verkaeufer_typ === "eheleute") return `die Eheleute ${d.personen.map((p) => p.name).join(" und ")}`;
  if (d.verkaeufer_typ === "erbengemeinschaft") return `die Erbengemeinschaft, bestehend aus ${d.personen.map((p) => p.name).join(", ")}`;
  if (d.verkaeufer_typ === "mehrere") return d.personen.map((p) => p.name).join(", ");
  return d.personen[0]?.name ?? "der Auftraggeber";
}

/**
 * § 656d BGB: Wird die Provision fuer eine Wohnung oder ein Einfamilienhaus
 * mit einem Verbraucher als Kaeufer vereinbart, darf der Kaeufer hoechstens so
 * viel zahlen wie der Verkaeufer. Ein Modell „nur Kaeufer" ist dann unwirksam.
 */
export function provisionsWarnung(d: MaklervertragDaten): string | null {
  if (d.vertragsart !== "verkauf") return null;
  if (!d.objekt.wohnung_oder_efh) return null;
  if (d.provisionsmodell === "kaeufer") {
    return "Bei Wohnungen und Einfamilienhäusern darf der Käufer nach § 656d BGB nicht mehr Provision zahlen als der Verkäufer. Ein Modell „nur Käufer“ ist dort unwirksam — bitte Teilung oder Innenprovision wählen.";
  }
  return null;
}

export function maklervertragText(d: MaklervertragDaten, firma: Auftraggeberfirma): string {
  const auftraggeber = d.verkaeufer_typ === "firma"
    ? `${d.firma.name}${d.firma.register ? ` (${d.firma.register})` : ""}${d.firma.vertreter ? `, vertreten durch ${d.firma.vertreter}` : ""}`
    : d.personen.map(personZeile).join("\n");
  const verkauf = d.vertragsart === "verkauf";
  const preis = d.angebotspreis !== null ? euro(d.angebotspreis) : "nach Absprache";
  const provision = `${d.provision_prozent.toLocaleString("de-DE", { minimumFractionDigits: 2 })} % ${verkauf ? "des beurkundeten Kaufpreises" : "der Jahresnettokaltmiete"} einschließlich der gesetzlichen Umsatzsteuer`;
  const modell = d.provisionsmodell === "teilung"
    ? `Die Provision wird zwischen ${verkauf ? "Verkäufer und Käufer" : "Vermieter und Mieter"} je zur Hälfte geteilt (§ 656c BGB). Der Auftraggeber schuldet ${provision}, geteilt durch zwei.`
    : d.provisionsmodell === "verkaeufer"
      ? `Die Provision trägt allein der Auftraggeber: ${provision}. Für die Gegenseite ist der Erwerb provisionsfrei.`
      : `Die Provision trägt die Gegenseite: ${provision}. Der Auftraggeber schuldet keine Provision.`;
  const eigentum = d.alleineigentum
    ? "Der Auftraggeber versichert, alleiniger Eigentümer des Objekts und zur Vermarktung berechtigt zu sein."
    : "Der Auftraggeber versichert, gemeinsam mit den weiteren genannten Personen Eigentümer des Objekts und zur Vermarktung berechtigt zu sein.";
  const erben = d.verkaeufer_typ === "erbengemeinschaft"
    ? "\nDie Mitglieder der Erbengemeinschaft handeln gemeinschaftlich; der Erbschein oder eine gleichwertige Legitimation wird dem Makler in Kopie überlassen."
    : "";
  const widerruf = d.verbraucher
    ? `§ 8 Widerrufsrecht\nDer Auftraggeber handelt als Verbraucher. Wird dieser Vertrag außerhalb von Geschäftsräumen oder im Fernabsatz geschlossen, steht ihm ein Widerrufsrecht von vierzehn Tagen zu (§§ 355, 312g BGB). Die Widerrufsbelehrung ist Bestandteil dieses Vertrags. Der Auftraggeber verlangt ausdrücklich, dass der Makler bereits vor Ablauf der Widerrufsfrist mit der Leistung beginnt; er weiß, dass er bei Widerruf für bis dahin erbrachte Leistungen Wertersatz schuldet.`
    : `§ 8 Kein Widerrufsrecht\nDer Auftraggeber handelt in Ausübung seiner gewerblichen oder selbständigen beruflichen Tätigkeit. Ein Widerrufsrecht nach §§ 355, 312g BGB besteht nicht.`;

  return [
    `Hinweis: ${MUSTER_HINWEIS}`,
    "",
    `MAKLERVERTRAG (${verkauf ? "Verkauf" : "Vermietung"})`,
    "",
    "zwischen",
    auftraggeber,
    "— nachfolgend „Auftraggeber“ —",
    "",
    "und",
    firmaZeile(firma),
    "— nachfolgend „Makler“ —",
    "",
    "§ 1 Gegenstand",
    `Der Auftraggeber beauftragt den Makler mit dem Nachweis der Gelegenheit zum Abschluss eines ${verkauf ? "Kaufvertrags" : "Mietvertrags"} und mit der Vermittlung eines solchen Vertrags über das Objekt:`,
    objektZeile(d.objekt),
    `Angebotspreis: ${preis}.`,
    eigentum + erben,
    "",
    "§ 2 Laufzeit",
    `Der Vertrag beginnt mit Unterzeichnung und läuft ${d.laufzeit_monate} Monate. Er verlängert sich jeweils um drei Monate, wenn er nicht mit einer Frist von vier Wochen zum Ende der Laufzeit in Textform gekündigt wird.`,
    "",
    "§ 3 Provision",
    modell,
    "Die Provision ist verdient und fällig mit Abschluss des Hauptvertrags, der durch den Nachweis oder die Vermittlung des Maklers zustande gekommen ist. Das gilt auch, wenn der Hauptvertrag zu abweichenden Bedingungen oder mit einem Rechtsnachfolger des nachgewiesenen Interessenten geschlossen wird.",
    ...(d.vertragsart === "verkauf" ? ["Nach § 656c BGB kann sich der Makler von beiden Parteien nur eine Provision in gleicher Höhe versprechen lassen, wenn er für beide tätig wird."] : []),
    "",
    "§ 4 Pflichten des Auftraggebers",
    "Der Auftraggeber stellt dem Makler alle für die Vermarktung erforderlichen Unterlagen und Auskünfte zur Verfügung, insbesondere Grundbuchauszug, Flurkarte, Baubeschreibung, Grundrisse und den Energieausweis. Er unterrichtet den Makler unverzüglich über Anfragen Dritter und über einen Vertragsschluss.",
    "",
    "§ 5 Pflichten des Maklers",
    "Der Makler erstellt ein Exposé, bewirbt das Objekt in Abstimmung mit dem Auftraggeber, führt Besichtigungen durch, prüft Interessenten und berichtet über den Stand der Vermarktung. Er ist berechtigt, mit der Gegenseite ebenfalls einen Maklervertrag zu schließen.",
    "",
    "§ 6 Energieausweis",
    "Der Auftraggeber stellt sicher, dass ein gültiger Energieausweis vorliegt, bevor das Objekt beworben wird; die Pflichtangaben werden in Anzeigen genannt (§§ 80, 87 GEG).",
    "",
    "§ 7 Datenschutz",
    "Der Makler verarbeitet personenbezogene Daten des Auftraggebers zur Durchführung dieses Vertrags. Weitere Hinweise enthält die Datenschutzerklärung des Maklers.",
    "",
    widerruf,
    "",
    "§ 9 Schlussbestimmungen",
    "Änderungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.",
    ...(d.vollmacht_mitgenerieren ? ["", "Anlage: Vollmacht zur Einholung von Unterlagen."] : []),
  ].join("\n");
}

export function vollmachtText(d: MaklervertragDaten, firma: Auftraggeberfirma): string {
  const vollmachtgeber = d.verkaeufer_typ === "firma"
    ? `${d.firma.name}${d.firma.vertreter ? `, vertreten durch ${d.firma.vertreter}` : ""}`
    : d.personen.map(personZeile).join("\n");
  return [
    `Hinweis: ${MUSTER_HINWEIS}`,
    "",
    "VOLLMACHT",
    "",
    vollmachtgeber,
    "— Vollmachtgeber —",
    "",
    "bevollmächtigt",
    firmaZeile(firma),
    "— Bevollmächtigter —",
    "",
    `zur Einholung aller Unterlagen und Auskünfte, die für die Vermarktung des Objekts ${objektZeile(d.objekt)} erforderlich sind. Die Vollmacht umfasst insbesondere:`,
    "- Einsicht in das Grundbuch und Anforderung von Grundbuchauszügen,",
    "- Anforderung von Auszügen aus dem Liegenschaftskataster (Flurkarte, Liegenschaftsbuch),",
    "- Einsicht in Bauakten und Anforderung von Bauunterlagen bei der Bauaufsicht,",
    "- Auskünfte aus dem Baulastenverzeichnis und dem Altlastenkataster,",
    "- Anforderung der Teilungserklärung, Wirtschaftspläne und Protokolle beim Verwalter,",
    "- Anforderung des Energieausweises und der Verbrauchsdaten beim Versorger.",
    "Die Vollmacht gilt für das Maklerbüro einschließlich seiner Mitarbeitenden.",
    d.untervollmacht
      ? "Der Bevollmächtigte darf Untervollmacht an Dienstleister erteilen, soweit dies für die Beschaffung der Unterlagen erforderlich ist."
      : "Der Bevollmächtigte darf keine Untervollmacht erteilen.",
    "Die Vollmacht erlischt mit Beendigung des Maklervertrags und kann jederzeit in Textform widerrufen werden.",
  ].join("\n");
}

export function objektnachweisText(d: ObjektnachweisDaten, firma: Auftraggeberfirma): string {
  const preis = d.angebotspreis !== null ? euro(d.angebotspreis) : "auf Anfrage";
  return [
    `Hinweis: ${MUSTER_HINWEIS}`,
    "",
    "OBJEKTNACHWEIS UND PROVISIONSVEREINBARUNG",
    "",
    "zwischen",
    firmaZeile(firma),
    "— Makler —",
    "",
    "und",
    d.kaeufer.map(personZeile).join("\n"),
    "— Interessent —",
    "",
    "§ 1 Nachweis",
    `Der Makler weist dem Interessenten die Gelegenheit zum Abschluss eines Kaufvertrags über folgendes Objekt nach: ${objektZeile(d.objekt)}. Angebotspreis: ${preis}.`,
    ...(d.besichtigt_am ? [`Die Besichtigung fand am ${d.besichtigt_am} statt.`] : []),
    "Der Interessent bestätigt, dass ihm das Objekt vor diesem Nachweis nicht bekannt war. War es ihm bekannt, teilt er dies unverzüglich in Textform mit und benennt die Quelle.",
    "",
    "§ 2 Provision",
    `Kommt durch den Nachweis oder die Vermittlung des Maklers ein Kaufvertrag über das Objekt zustande, schuldet der Interessent eine Provision von ${d.provision_prozent.toLocaleString("de-DE", { minimumFractionDigits: 2 })} % des beurkundeten Kaufpreises einschließlich der gesetzlichen Umsatzsteuer. Sie ist mit Beurkundung fällig.`,
    "Der Makler versichert, dass er sich vom Verkäufer eine Provision in gleicher Höhe hat versprechen lassen (§ 656c BGB) und dass die Vereinbarung mit dem Verkäufer wirksam ist.",
    "",
    "§ 3 Vertraulichkeit",
    "Der Interessent behandelt die überlassenen Unterlagen vertraulich und gibt sie nicht an Dritte weiter. Schließt ein Dritter, an den er die Information weitergegeben hat, den Kaufvertrag, schuldet der Interessent die Provision, als hätte er selbst gekauft.",
    "",
    d.verbraucher
      ? "§ 4 Widerrufsrecht\nDer Interessent handelt als Verbraucher. Wird diese Vereinbarung außerhalb von Geschäftsräumen oder im Fernabsatz geschlossen, steht ihm ein Widerrufsrecht von vierzehn Tagen zu (§§ 355, 312g BGB). Die Widerrufsbelehrung ist Bestandteil dieser Vereinbarung."
      : "§ 4 Kein Widerrufsrecht\nDer Interessent handelt gewerblich; ein Widerrufsrecht besteht nicht.",
    "",
    ...(d.ausweis_geprueft ? ["Die Identität des Interessenten wurde anhand eines gültigen Ausweisdokuments geprüft."] : []),
    "Diese Vereinbarung bedarf der Textform (§ 656a BGB).",
  ].join("\n");
}

/** Erste Zeile fuer Listen und Titel. */
export function vertragsTitel(art: "maklervertrag" | "vollmacht" | "objektnachweis", objekt: ObjektAngaben): string {
  const kurz = [objekt.strasse, objekt.ort].filter(Boolean).join(", ") || objekt.bezeichnung || "ohne Objekt";
  return `${art === "maklervertrag" ? "Maklervertrag" : art === "vollmacht" ? "Vollmacht" : "Objektnachweis"} ${kurz}`;
}
